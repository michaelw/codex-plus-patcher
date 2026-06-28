#!/usr/bin/env node

const childProcess = require("node:child_process");

const semanticTitlePattern =
  /^(feat|fix|chore|docs|test|ci|build|refactor|perf|style|revert)(\([^)]+\))?!?: .+/;
const closingKeywordPattern = /\b(close[sd]?|fix(e[sd])?|resolve[sd]?)\s+#(\d+)\b/i;

function parseArgs(argv, env = process.env) {
  const args = {
    check: false,
    dryRun: false,
    help: false,
    issue: null,
    pr: null,
    strictWorktree: false,
    title: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") {
      args.check = true;
    } else if (arg === "--dry-run" || arg === "-n") {
      args.dryRun = true;
    } else if (arg === "--strict-worktree") {
      args.strictWorktree = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--title") {
      index += 1;
      if (!argv[index]) throw new Error("--title requires a value.");
      args.title = argv[index];
    } else if (arg === "--issue") {
      index += 1;
      if (!argv[index]) throw new Error("--issue requires a value.");
      args.issue = argv[index];
    } else if (args.pr == null) {
      args.pr = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  if (args.check && args.issue == null) args.issue = env.CHECK_PR_ISSUE || null;

  if (args.issue != null && !/^\d+$/.test(String(args.issue))) {
    throw new Error("--issue must be a GitHub issue number.");
  }
  if (!args.check && args.title != null) {
    throw new Error("--title is only valid with --check.");
  }
  if (!args.check && args.issue != null) {
    throw new Error("--issue and CHECK_PR_ISSUE are only valid with --check.");
  }
  if (!args.check && args.strictWorktree) {
    throw new Error("--strict-worktree is only valid with --check.");
  }
  if (args.check && args.dryRun) {
    throw new Error("--dry-run is only valid for automerge.");
  }
  if (args.check && args.pr != null) {
    throw new Error("PR arguments are only valid for automerge.");
  }

  return args;
}

function isSemanticTitle(title) {
  return semanticTitlePattern.test(title);
}

function isSemanticPullRequestTitle(title) {
  return isSemanticTitle(title);
}

function isForbiddenTrackedPath(file) {
  const parts = file.split("/");
  const basename = parts.at(-1);
  return (
    file === "work" ||
    file.startsWith("work/") ||
    file === "outputs" ||
    file.startsWith("outputs/") ||
    file === ".codex-plus-cache" ||
    file.startsWith(".codex-plus-cache/") ||
    parts.some((part) => part.endsWith(".app")) ||
    basename === "npm-debug.log" ||
    (basename?.startsWith("npm-debug.log.") ?? false) ||
    file.endsWith(".tgz")
  );
}

function inferIssueNumber(branchName) {
  const match = /(?:^|[-_/])(?:issue|fix|gh|pr)[-_/](\d+)(?=$|[-_/])/.exec(branchName);
  return match ? match[1] : null;
}

function hasClosingKeyword(body, issue) {
  if (!body) return false;

  for (const match of body.matchAll(new RegExp(closingKeywordPattern, "gi"))) {
    if (!issue || match[3] === String(issue)) return true;
  }
  return false;
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function formatCommand(args) {
  return ["gh", ...args].map(shellQuote).join(" ");
}

function runCommand(command, args, options = {}) {
  const result = childProcess.spawnSync(command, args, {
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    status: result.status,
  };
}

function commandText(command, args) {
  return [command, ...args].join(" ");
}

function readCommand(commandRunner, command, args) {
  const result = commandRunner(command, args);
  if (result.ok) return result.stdout.trimEnd();

  const details = (result.stderr || result.stdout || `status ${result.status}`).trim();
  throw new Error(`${commandText(command, args)} failed: ${details}`);
}

function readPullRequestForMerge(pr, commandRunner = runCommand) {
  const args = ["pr", "view"];
  if (pr != null) args.push(pr);
  args.push("--json", "number,title,headRefOid");

  const data = JSON.parse(readCommand(commandRunner, "gh", args));
  if (!data.number || !data.title || !data.headRefOid) {
    throw new Error("Could not read pull request number, title, and headRefOid.");
  }
  return data;
}

function readPullRequestForCheck(commandRunner = runCommand) {
  const result = commandRunner("gh", [
    "pr",
    "view",
    "--json",
    "title,body,headRefName,baseRefName,isDraft",
  ]);
  if (!result.ok) return null;

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Could not parse gh pr view output: ${error.message}`);
  }
}

function buildMergeArgs(pullRequest) {
  if (!isSemanticPullRequestTitle(pullRequest.title)) {
    throw new Error(`PR title is not a Conventional Commit title: ${pullRequest.title}`);
  }
  return [
    "pr",
    "merge",
    String(pullRequest.number),
    "--auto",
    "--squash",
    "--subject",
    pullRequest.title,
    "--body",
    "",
    "--match-head-commit",
    pullRequest.headRefOid,
  ];
}

function buildReadinessReport(options, commandRunner = runCommand) {
  const failures = [];
  const warnings = [];

  const branchName = readCommand(commandRunner, "git", ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
  if (branchName === "HEAD") {
    failures.push({
      title: "Current checkout is detached, so it is not PR-ready.",
      fix: "git switch -c feat/add-pr-readiness-guard",
    });
  } else if (branchName === "main" || branchName === "master") {
    failures.push({
      title: "Current branch is protected.",
      value: branchName,
      fix: "git switch -c feat/add-pr-readiness-guard",
    });
  }

  if (options.strictWorktree) {
    const status = readCommand(commandRunner, "git", ["status", "--porcelain"]);
    if (status.trim()) {
      failures.push({
        title: "Worktree is not clean.",
        value: status,
        fix: "git status --short",
      });
    }
  }

  const commitSubject = readCommand(commandRunner, "git", ["log", "-1", "--pretty=%s"]).trim();
  if (!isSemanticTitle(commitSubject)) {
    failures.push({
      title: "HEAD commit subject is not semantic.",
      value: commitSubject,
      fix: "feat: add project selector shortcut",
    });
  }

  const trackedFiles = readCommand(commandRunner, "git", ["ls-files", "-z"])
    .split("\0")
    .filter(Boolean);
  const forbiddenFiles = trackedFiles.filter(isForbiddenTrackedPath);
  if (forbiddenFiles.length > 0) {
    failures.push({
      title: "Tracked files include generated or publish-only output.",
      value: forbiddenFiles.join("\n"),
      fix: "git rm --cached <path>",
    });
  }

  const pullRequest = readPullRequestForCheck(commandRunner);
  const title = pullRequest?.title || options.title;
  if (!pullRequest && !options.title) {
    failures.push({
      title: "No PR exists for this branch and no proposed title was provided.",
      fix: 'npm run check:pr -- --title "feat: add project selector shortcut"',
    });
  } else if (!isSemanticTitle(title)) {
    failures.push({
      title: pullRequest ? "PR title is not semantic." : "Proposed PR title is not semantic.",
      value: title,
      fix: "feat: add project selector shortcut",
    });
  }

  const explicitIssue = options.issue ? String(options.issue) : null;
  const inferredIssue = !explicitIssue && branchName !== "HEAD" ? inferIssueNumber(branchName) : null;
  const issue = explicitIssue || inferredIssue;
  if (pullRequest && issue && !hasClosingKeyword(pullRequest.body, issue)) {
    const entry = {
      title: `PR body is missing a closing keyword for #${issue}.`,
      fix: `Closes #${issue}`,
    };
    if (explicitIssue) failures.push(entry);
    else warnings.push(entry);
  }

  return { failures, warnings };
}

function formatFailuresAndWarnings(report) {
  const lines = [];
  for (const failure of report.failures) {
    lines.push(`FAIL: ${failure.title}`);
    if (failure.value) lines.push(`  ${failure.value}`);
    if (failure.fix) lines.push("", "Use:", `  ${failure.fix}`);
    lines.push("");
  }

  for (const warning of report.warnings) {
    lines.push(`WARN: ${warning.title}`);
    if (warning.value) lines.push(`  ${warning.value}`);
    if (warning.fix) lines.push("", "Use:", `  ${warning.fix}`);
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function usage() {
  return `Usage:
  npm run check:pr -- [--title <semantic-title>] [--issue <number>] [--strict-worktree]
  npm run pr:automerge -- [--dry-run] [<pr-number-or-url>]

Checks PR readiness or enables guarded squash automerge.`;
}

function main(argv = process.argv.slice(2), env = process.env, commandRunner = runCommand) {
  const args = parseArgs(argv, env);
  if (args.help) {
    console.log(usage());
    return 0;
  }

  if (args.check) {
    const report = buildReadinessReport(args, commandRunner);
    const output = formatFailuresAndWarnings(report);
    if (output) console.error(output);

    if (report.failures.length > 0) return 1;
    console.log("PR readiness checks passed.");
    return 0;
  }

  const pullRequest = readPullRequestForMerge(args.pr, commandRunner);
  const mergeArgs = buildMergeArgs(pullRequest);
  if (args.dryRun) {
    console.log(formatCommand(mergeArgs));
    return 0;
  }
  const result = commandRunner("gh", mergeArgs, { stdio: "inherit" });
  return result.ok ? 0 : 1;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`FAIL: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  buildMergeArgs,
  buildReadinessReport,
  formatCommand,
  formatFailuresAndWarnings,
  hasClosingKeyword,
  inferIssueNumber,
  isForbiddenTrackedPath,
  isSemanticPullRequestTitle,
  isSemanticTitle,
  main,
  parseArgs,
  readPullRequestForCheck,
  readPullRequestForMerge,
};
