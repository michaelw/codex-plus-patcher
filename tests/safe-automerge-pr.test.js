const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildMergeArgs,
  formatCommand,
  isSemanticPullRequestTitle,
  parseArgs,
} = require("../scripts/safe-automerge-pr");

test("safe automerge accepts release-please compatible PR titles", () => {
  for (const title of [
    "feat: support Codex 26.616.81150",
    "fix(ui): highlight selected project threads",
    "chore(main): release 0.4.0",
    "refactor!: remove old runtime hook",
  ]) {
    assert.equal(isSemanticPullRequestTitle(title), true, title);
  }
});

test("safe automerge rejects non-conventional PR titles", () => {
  for (const title of [
    "[codex] support Codex 26.616.81150",
    "support Codex 26.616.81150",
    "feat support Codex 26.616.81150",
    "unknown: support Codex 26.616.81150",
    "feat: ",
  ]) {
    assert.equal(isSemanticPullRequestTitle(title), false, title);
  }
});

test("safe automerge builds a squash command pinned to the inspected PR head", () => {
  const args = buildMergeArgs({
    number: 31,
    title: "test: stop pinning package version",
    headRefOid: "865b7ba50727b0ebecb3e6311bbd8acf84bc2807",
  });

  assert.deepEqual(args, [
    "pr",
    "merge",
    "31",
    "--auto",
    "--squash",
    "--subject",
    "test: stop pinning package version",
    "--body",
    "",
    "--match-head-commit",
    "865b7ba50727b0ebecb3e6311bbd8acf84bc2807",
  ]);
});

test("safe automerge dry-run command is shell-readable", () => {
  const command = formatCommand([
    "pr",
    "merge",
    "31",
    "--subject",
    "test: stop pinning package version",
    "--body",
    "",
  ]);

  assert.equal(command, "gh pr merge 31 --subject 'test: stop pinning package version' --body ''");
});

test("safe automerge parses dry-run and PR arguments", () => {
  assert.deepEqual(parseArgs(["--dry-run", "31"]), { dryRun: true, pr: "31" });
  assert.deepEqual(parseArgs(["-n", "https://github.com/michaelw/codex-plus-patcher/pull/31"]), {
    dryRun: true,
    pr: "https://github.com/michaelw/codex-plus-patcher/pull/31",
  });
});
