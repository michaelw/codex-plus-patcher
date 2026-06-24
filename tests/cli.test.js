const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  createApplyProgress,
  expandPath,
  formatAsarCatResult,
  formatAsarListResult,
  formatError,
  formatMenuDiagnosticsResult,
  formatResult,
  helpText,
  listAsarFiles,
  menuDiagnostics,
  parseArgs,
  readAsarFile,
  shouldShowApplyProgress,
} = require("../src/cli");

test("empty invocation shows help", () => {
  assert.equal(parseArgs([]).command, "help");
});

test("help documents codex-plus-patcher as the only command", () => {
  const output = helpText();

  assert.match(output, /codex-plus-patcher apply/);
  assert.match(output, /codex-plus-patcher menu-diagnostics/);
  assert.match(output, /codex-plus-patcher asar-list/);
  assert.match(output, /codex-plus-patcher asar-cat/);
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

test("asar commands parse readback flags", () => {
  const listArgs = parseArgs(["asar-list", "--asar", "~/tmp/app.asar", "--contains", "codex-plus", "--json"]);
  assert.equal(listArgs.command, "asar-list");
  assert.equal(listArgs.asar, path.join(os.homedir(), "tmp", "app.asar"));
  assert.equal(listArgs.contains, "codex-plus");
  assert.equal(listArgs.json, true);

  const catArgs = parseArgs(["asar-cat", "--asar", "~/tmp/app.asar", "--file", "webview/assets/codex-plus/runtime.js"]);
  assert.equal(catArgs.command, "asar-cat");
  assert.equal(catArgs.asar, path.join(os.homedir(), "tmp", "app.asar"));
  assert.equal(catArgs.file, "webview/assets/codex-plus/runtime.js");

  const diagnosticsArgs = parseArgs(["menu-diagnostics", "--asar", "~/tmp/app.asar", "--json"]);
  assert.equal(diagnosticsArgs.command, "menu-diagnostics");
  assert.equal(diagnosticsArgs.asar, path.join(os.homedir(), "tmp", "app.asar"));
  assert.equal(diagnosticsArgs.json, true);
});

test("formatResult prints a concise open command for created apps", () => {
  const output = formatResult({
    sourceApp: "/Applications/Codex.app",
    targetApp: "/Users/example/Applications/Codex Plus.app",
    patchSet: "codex-example",
    patches: ["bundle-identity"],
    addedFiles: ["webview/assets/codex-plus/runtime.js"],
    patchedAsarSha: "abc123",
    dryRun: false,
  });

  assert.match(output, /Codex Plus app created\./);
  assert.match(output, /Open: open "\/Users\/example\/Applications\/Codex Plus\.app"/);
  assert.doesNotMatch(output, /Added files:/);
});

function makeAsar(fileMap) {
  const header = { files: {} };
  let offset = 0;
  const buffers = [];
  for (const [filePath, text] of Object.entries(fileMap)) {
    const parts = filePath.split("/");
    let node = header;
    for (const part of parts.slice(0, -1)) {
      node.files[part] ||= { files: {} };
      node = node.files[part];
    }
    const buffer = Buffer.from(text, "utf8");
    node.files[parts.at(-1)] = { size: buffer.length, offset: String(offset) };
    buffers.push(buffer);
    offset += buffer.length;
  }
  const json = Buffer.from(JSON.stringify(header), "utf8");
  const prefix = Buffer.alloc(16);
  prefix.writeUInt32LE(4, 0);
  prefix.writeUInt32LE(json.length + 8, 4);
  prefix.writeUInt32LE(json.length + 4, 8);
  prefix.writeUInt32LE(json.length, 12);
  return Buffer.concat([prefix, json, ...buffers]);
}

function writeFixtureAsar() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-plus-cli-asar-"));
  const asarPath = path.join(tmpDir, "app.asar");
  fs.writeFileSync(
    asarPath,
    makeAsar({
      "webview/assets/codex-plus/runtime.js": "window.CodexPlus={};",
      "webview/assets/codex-plus/plugins/devTools.js": 'id: "devTools"; codexPlusOpenDevTools; devtools/open;',
      "webview/assets/codex-plus/plugins/nestedRepositories.js": "function ReviewMux(){}",
      ".vite/build/thread-side-panel-tabs.js": "CPXReviewMux",
      ".vite/build/src-menu.js": "{id:`codexPlusOpenDevTools`,title:`Open Developer Tools`,commandMenuGroupKey:`panels`},{id:`toggleBottomPanel`,electron:{menuTitle:`Toggle Bottom Panel`}}",
      ".vite/build/main.js": "CPXOpenDevTools; devtools/open; openDevTools; Menu.setApplicationMenu; refreshApplicationMenu; CPXLogMenuDiagnostics;",
    }),
  );
  return asarPath;
}

function writeUnpackedFixtureAsar() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-plus-cli-asar-"));
  const asarPath = path.join(tmpDir, "app.asar");
  const header = { files: { "unpacked.js": { size: 0, unpacked: true } } };
  const json = Buffer.from(JSON.stringify(header), "utf8");
  const prefix = Buffer.alloc(16);
  prefix.writeUInt32LE(4, 0);
  prefix.writeUInt32LE(json.length + 8, 4);
  prefix.writeUInt32LE(json.length + 4, 8);
  prefix.writeUInt32LE(json.length, 12);
  fs.writeFileSync(asarPath, Buffer.concat([prefix, json]));
  return asarPath;
}

test("asar-list lists files and filters by substring", () => {
  const asar = writeFixtureAsar();

  assert.deepEqual(listAsarFiles({ asar }).files, [
    "webview/assets/codex-plus/runtime.js",
    "webview/assets/codex-plus/plugins/devTools.js",
    "webview/assets/codex-plus/plugins/nestedRepositories.js",
    ".vite/build/thread-side-panel-tabs.js",
    ".vite/build/src-menu.js",
    ".vite/build/main.js",
  ]);
  assert.deepEqual(listAsarFiles({ asar, contains: "codex-plus/plugins" }), {
    asar,
    files: [
      "webview/assets/codex-plus/plugins/devTools.js",
      "webview/assets/codex-plus/plugins/nestedRepositories.js",
    ],
  });
  assert.equal(formatAsarListResult({ files: ["a", "b"] }), "a\nb\n");
  assert.equal(formatAsarListResult({ files: [] }), "");
});

test("menu-diagnostics reports command metadata, native bridge, runtime plugin, and menu hooks", () => {
  const asar = writeFixtureAsar();
  const result = menuDiagnostics({ asar });

  assert.deepEqual(result.summary.commandMetadataFilesWithCommand, [
    "webview/assets/codex-plus/plugins/devTools.js",
    ".vite/build/src-menu.js",
  ]);
  assert.deepEqual(result.summary.nativeBridgeFilesWithRequest, [
    "webview/assets/codex-plus/plugins/devTools.js",
    ".vite/build/main.js",
  ]);
  assert.deepEqual(result.summary.runtimePluginFilesWithCommand, ["webview/assets/codex-plus/plugins/devTools.js"]);
  assert.deepEqual(result.summary.applicationMenuFilesWithDiagnostics, [".vite/build/main.js"]);

  const output = formatMenuDiagnosticsResult(result);
  assert.match(output, /Command metadata bundles:/);
  assert.match(output, /\.vite\/build\/src-menu\.js: command=yes/);
  assert.match(output, /Native bridge bundles:/);
  assert.match(output, /\.vite\/build\/main\.js: request=yes, openDevTools=yes/);
  assert.throws(() => menuDiagnostics({}), /--asar is required/);
});

test("asar-cat extracts packed file content", () => {
  const asar = writeFixtureAsar();
  const result = readAsarFile({ asar, file: "webview/assets/codex-plus/plugins/nestedRepositories.js" });

  assert.deepEqual(result, {
    asar,
    file: "webview/assets/codex-plus/plugins/nestedRepositories.js",
    size: "function ReviewMux(){}".length,
    content: "function ReviewMux(){}",
  });
  assert.equal(formatAsarCatResult(result), "function ReviewMux(){}");
});

test("asar readback validates required inputs", () => {
  assert.throws(() => listAsarFiles({}), /--asar is required/);
  assert.throws(() => readAsarFile({ asar: "/tmp/app.asar" }), /--file is required/);
});

test("asar-cat fails clearly for missing files", () => {
  const asar = writeFixtureAsar();

  assert.throws(
    () => readAsarFile({ asar, file: "missing.js" }),
    new RegExp(`Could not find missing\\.js in ${asar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
  );
});

test("asar-list shows unpacked files and asar-cat rejects them", () => {
  const asar = writeUnpackedFixtureAsar();

  assert.deepEqual(listAsarFiles({ asar }), { asar, files: ["unpacked.js"] });
  assert.throws(
    () => readAsarFile({ asar, file: "unpacked.js" }),
    new RegExp(`Cannot read unpacked ASAR file unpacked\\.js from ${asar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
  );
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
