const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  createApplyProgress,
  expandPath,
  formatError,
  formatResult,
  helpText,
  parseArgs,
  shouldShowApplyProgress,
} = require("../src/cli");

test("empty invocation shows help", () => {
  assert.equal(parseArgs([]).command, "help");
});

test("help documents codex-plus-patcher as the only command", () => {
  const output = helpText();

  assert.match(output, /codex-plus-patcher apply/);
  assert.doesNotMatch(output, /codex-plus apply/);
});

test("apply uses simple production defaults", () => {
  const args = parseArgs(["apply"]);

  assert.equal(args.command, "apply");
  assert.equal(args.source, "/Applications/Codex.app");
  assert.equal(args.target, path.join(os.homedir(), "Applications", "Codex Plus.app"));
  assert.equal(args.mode, "builtin");
  assert.equal(args.dryRun, false);
});

test("flags imply apply and can request json output", () => {
  const args = parseArgs(["--dry-run", "--json", "--debug"]);

  assert.equal(args.command, "apply");
  assert.equal(args.dryRun, true);
  assert.equal(args.json, true);
  assert.equal(args.debug, true);
});

test("target and patch directory expand home paths", () => {
  const args = parseArgs(["apply", "--target", "~/tmp/Codex Plus.app", "--patch-dir", "~/patches"]);

  assert.equal(args.target, path.join(os.homedir(), "tmp", "Codex Plus.app"));
  assert.equal(args.patchDir, path.join(os.homedir(), "patches"));
});

test("formatResult prints a concise open command for created apps", () => {
  const output = formatResult({
    sourceApp: "/Applications/Codex.app",
    targetApp: "/Users/example/Applications/Codex Plus.app",
    patchSet: "codex-example",
    patches: ["bundle-identity"],
    patchedAsarSha: "abc123",
    dryRun: false,
  });

  assert.match(output, /Codex Plus app created\./);
  assert.match(output, /Open: open "\/Users\/example\/Applications\/Codex Plus\.app"/);
});

test("formatError hides stack traces unless debug is enabled", () => {
  const error = new Error("Unsupported Codex.app 1");

  assert.equal(formatError(error), "Error: Unsupported Codex.app 1");
  assert.match(formatError(error, { debug: true }), /Error: Unsupported Codex\.app 1\n\s+at /);
});

test("apply progress is shown only for interactive non-json apply", () => {
  assert.equal(shouldShowApplyProgress({ dryRun: false, json: false }, { isTTY: true }), true);
  assert.equal(shouldShowApplyProgress({ dryRun: true, json: false }, { isTTY: true }), false);
  assert.equal(shouldShowApplyProgress({ dryRun: false, json: true }, { isTTY: true }), false);
  assert.equal(shouldShowApplyProgress({ dryRun: false, json: false }, { isTTY: false }), false);
});

test("disabled apply progress does not import ora", async () => {
  const progress = await createApplyProgress(
    { dryRun: true, json: false },
    {
      stream: { isTTY: true },
      importOra() {
        throw new Error("ora should not be imported");
      },
    },
  );

  assert.equal(progress, null);
});

test("enabled apply progress reports and completes spinner steps", async () => {
  const calls = [];
  const spinner = {
    succeed(text) {
      calls.push(["succeed", text]);
    },
    start() {
      calls.push(["start", this.text]);
    },
    fail() {
      calls.push(["fail", this.text]);
    },
  };
  const progress = await createApplyProgress(
    { dryRun: false, json: false },
    {
      stream: { isTTY: true },
      async importOra(specifier) {
        assert.equal(specifier, "ora");
        return {
          default(options) {
            calls.push(["ora", options.stream.isTTY]);
            return spinner;
          },
        };
      },
    },
  );

  progress({ step: 1, total: 2, label: "Inspect source app" });
  progress({ status: "succeed", step: 1, total: 2, label: "Inspect source app" });
  progress({ step: 2, total: 2, label: "Finish" });
  progress({ status: "succeed", step: 2, total: 2, label: "Finish" });

  assert.deepEqual(calls, [
    ["ora", true],
    ["start", "[1/2] Inspect source app"],
    ["succeed", "[1/2] Inspect source app"],
    ["start", "[2/2] Finish"],
    ["succeed", "[2/2] Finish"],
  ]);
});
