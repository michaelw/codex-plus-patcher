const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildMergeArgs,
  buildReadinessReport,
  formatCommand,
  hasClosingKeyword,
  inferIssueNumber,
  isForbiddenTrackedPath,
  isSemanticPullRequestTitle,
  isSemanticTitle,
  main,
  parseArgs,
} = require("../scripts/safe-automerge-pr");

function createCommandRunner(overrides = {}) {
  const outputs = {
    "git rev-parse --abbrev-ref HEAD": { ok: true, stdout: "feat-27-readiness\n" },
    "git status --porcelain": { ok: true, stdout: "" },
    "git log -1 --pretty=%s": { ok: true, stdout: "feat: add project selector shortcut\n" },
    "git ls-files -z": { ok: true, stdout: "package.json\0scripts/safe-automerge-pr.js\0" },
    "gh pr view --json title,body,headRefName,baseRefName,isDraft": {
      ok: true,
      stdout: JSON.stringify({
        title: "feat: add project selector shortcut",
        body: "Closes #27",
        headRefName: "feat-27-readiness",
        baseRefName: "main",
        isDraft: true,
      }),
    },
    ...overrides,
  };

  return (command, args) => {
    const key = [command, ...args].join(" ");
    const output = outputs[key];
    if (output) return { stderr: "", status: output.ok ? 0 : 1, ...output };
    throw new Error(`Unexpected command: ${key}`);
  };
}

function reportWith(overrides, options = {}) {
  return buildReadinessReport({ title: null, issue: null, ...options }, createCommandRunner(overrides));
}

function withMutedConsole(callback) {
  const originalLog = console.log;
  const originalError = console.error;
  console.log = () => {};
  console.error = () => {};
  try {
    return callback();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

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

test("safe automerge uses the same semantic title check for readiness", () => {
  assert.equal(isSemanticTitle("feat: add project selector shortcut"), true);
  assert.equal(isSemanticTitle("Add project selector shortcut"), false);
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
  assert.deepEqual(parseArgs(["--dry-run", "31"], {}), {
    check: false,
    dryRun: true,
    help: false,
    issue: null,
    pr: "31",
    strictWorktree: false,
    title: null,
  });
  assert.deepEqual(parseArgs(["-n", "https://github.com/michaelw/codex-plus-patcher/pull/31"]), {
    check: false,
    dryRun: true,
    help: false,
    issue: null,
    pr: "https://github.com/michaelw/codex-plus-patcher/pull/31",
    strictWorktree: false,
    title: null,
  });
});

test("safe automerge check mode rejects PR title with non-semantic prefix", () => {
  const report = reportWith({
    "gh pr view --json title,body,headRefName,baseRefName,isDraft": {
      ok: true,
      stdout: JSON.stringify({ title: "[codex] add guard", body: "Closes #27" }),
    },
  });

  assert.equal(report.failures.some((failure) => failure.title === "PR title is not semantic."), true);
});

test("safe automerge check mode rejects forbidden tracked paths", () => {
  for (const file of [
    "work/Codex Plus.app/Contents/Info.plist",
    "outputs/package.json",
    ".codex-plus-cache/app.asar",
    "npm-debug.log",
    "npm-debug.log.0",
    "codex-plus-patcher-0.6.0.tgz",
  ]) {
    assert.equal(isForbiddenTrackedPath(file), true, file);
  }

  const report = reportWith({
    "git ls-files -z": {
      ok: true,
      stdout: [
        "package.json",
        "work/Codex Plus.app/Contents/Info.plist",
        "outputs/package.json",
        ".codex-plus-cache/app.asar",
        "npm-debug.log",
        "codex-plus-patcher-0.6.0.tgz",
      ].join("\0"),
    },
  });

  assert.equal(
    report.failures.some((failure) => failure.title === "Tracked files include generated or publish-only output."),
    true,
  );
});

test("safe automerge check mode warns when inferred issue lacks a closing keyword", () => {
  const report = reportWith({
    "git rev-parse --abbrev-ref HEAD": { ok: true, stdout: "issue-27-readiness\n" },
    "gh pr view --json title,body,headRefName,baseRefName,isDraft": {
      ok: true,
      stdout: JSON.stringify({ title: "feat: add guard", body: "Adds a local guard." }),
    },
  });

  assert.equal(report.failures.length, 0);
  assert.equal(report.warnings.length, 1);
  assert.equal(report.warnings[0].title, "PR body is missing a closing keyword for #27.");
});

test("safe automerge check mode does not infer issues from version-number branch segments", () => {
  const report = reportWith({
    "git rev-parse --abbrev-ref HEAD": { ok: true, stdout: "mw/add-codex-26-623-42026\n" },
    "gh pr view --json title,body,headRefName,baseRefName,isDraft": {
      ok: true,
      stdout: JSON.stringify({ title: "fix: support Codex 26.623.42026", body: "Adds a patch set." }),
    },
  });

  assert.equal(inferIssueNumber("mw/add-codex-26-623-42026"), null);
  assert.equal(report.failures.length, 0);
  assert.equal(report.warnings.length, 0);
});

test("safe automerge check mode fails when explicit issue lacks a closing keyword", () => {
  const report = reportWith(
    {
      "gh pr view --json title,body,headRefName,baseRefName,isDraft": {
        ok: true,
        stdout: JSON.stringify({ title: "feat: add guard", body: "Adds a local guard." }),
      },
    },
    { issue: "27" },
  );

  assert.equal(report.failures.length, 1);
  assert.equal(report.failures[0].title, "PR body is missing a closing keyword for #27.");
  assert.equal(hasClosingKeyword("Fixes #27", "27"), true);
  assert.equal(hasClosingKeyword("Resolves #28", "27"), false);
});

test("safe automerge check mode handles no PR when title is provided", () => {
  const report = reportWith(
    {
      "git rev-parse --abbrev-ref HEAD": { ok: true, stdout: "feat-readiness\n" },
      "gh pr view --json title,body,headRefName,baseRefName,isDraft": {
        ok: false,
        stderr: "no pull requests found for branch",
      },
    },
    { title: "feat: add project selector shortcut" },
  );

  assert.equal(report.failures.length, 0);
  assert.equal(report.warnings.length, 0);
});

test("safe automerge check mode fails when no PR exists and title is missing", () => {
  const report = reportWith({
    "gh pr view --json title,body,headRefName,baseRefName,isDraft": {
      ok: false,
      stderr: "no pull requests found for branch",
    },
  });

  assert.equal(
    report.failures.some((failure) => failure.title === "No PR exists for this branch and no proposed title was provided."),
    true,
  );
});

test("safe automerge check mode fails on detached HEAD, main, or master", () => {
  for (const branch of ["HEAD", "main", "master"]) {
    const report = reportWith({
      "git rev-parse --abbrev-ref HEAD": { ok: true, stdout: `${branch}\n` },
    });

    assert.equal(report.failures.some((failure) => /detached|protected/.test(failure.title)), true, branch);
  }
});

test("safe automerge check mode parses arguments and infers issue numbers", () => {
  assert.deepEqual(parseArgs(["--check", "--title", "feat: x", "--issue", "27"], {}), {
    check: true,
    dryRun: false,
    help: false,
    issue: "27",
    pr: null,
    strictWorktree: false,
    title: "feat: x",
  });
  assert.equal(inferIssueNumber("issue-27-readiness"), "27");
  assert.equal(inferIssueNumber("fix-27"), "27");
  assert.equal(inferIssueNumber("gh-27-readiness"), "27");
  assert.equal(inferIssueNumber("pr-27"), "27");
  assert.equal(inferIssueNumber("27-description"), null);
  assert.equal(inferIssueNumber("feature-readiness"), null);
});

test("safe automerge check mode parses strict worktree", () => {
  assert.deepEqual(parseArgs(["--check", "--strict-worktree"], {}), {
    check: true,
    dryRun: false,
    help: false,
    issue: null,
    pr: null,
    strictWorktree: true,
    title: null,
  });
});

test("safe automerge ignores CHECK_PR_ISSUE outside check mode", () => {
  assert.equal(parseArgs(["31"], { CHECK_PR_ISSUE: "27" }).issue, null);
  assert.equal(parseArgs(["--check"], { CHECK_PR_ISSUE: "27" }).issue, "27");
});

test("safe automerge default check mode allows dirty worktree", () => {
  const report = reportWith({
    "git status --porcelain": { ok: true, stdout: " M scripts/safe-automerge-pr.js\n" },
  });

  assert.equal(report.failures.length, 0);
});

test("safe automerge strict worktree check fails on dirty worktree", () => {
  const report = reportWith(
    {
      "git status --porcelain": { ok: true, stdout: " M scripts/safe-automerge-pr.js\n" },
    },
    { strictWorktree: true },
  );

  assert.equal(report.failures.length, 1);
  assert.equal(report.failures[0].title, "Worktree is not clean.");
});

test("safe automerge check mode exits 1 on failures and 0 on warnings only", () => {
  withMutedConsole(() => {
    assert.equal(
      main(["--check", "--title", "feat: add guard"], {}, createCommandRunner({
        "git rev-parse --abbrev-ref HEAD": { ok: true, stdout: "issue-27-readiness\n" },
        "gh pr view --json title,body,headRefName,baseRefName,isDraft": {
          ok: true,
          stdout: JSON.stringify({ title: "feat: add guard", body: "" }),
        },
      })),
      0,
    );

    assert.equal(
      main(["--check", "--title", "Add guard"], {}, createCommandRunner({
        "git rev-parse --abbrev-ref HEAD": { ok: true, stdout: "feat-readiness\n" },
        "gh pr view --json title,body,headRefName,baseRefName,isDraft": {
          ok: false,
          stderr: "no pull requests found for branch",
        },
      })),
      1,
    );
  });
});
