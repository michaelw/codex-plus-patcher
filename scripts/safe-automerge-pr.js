#!/usr/bin/env node

const childProcess = require("node:child_process");

const allowedTypes = new Set([
  "feat",
  "fix",
  "chore",
  "docs",
  "test",
  "ci",
  "build",
  "refactor",
  "perf",
  "style",
  "revert",
]);

function parseArgs(argv) {
  const args = { dryRun: false, pr: null };
  for (const arg of argv) {
    if (arg === "--dry-run" || arg === "-n") args.dryRun = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else if (args.pr == null) args.pr = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  return args;
}

function isSemanticPullRequestTitle(title) {
  const match = /^([a-z]+)(?:\(([a-z0-9 ._/-]+)\))?(!)?: (.+)$/.exec(title);
  return Boolean(match && allowedTypes.has(match[1]) && match[4].trim());
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function formatCommand(args) {
  return ["gh", ...args].map(shellQuote).join(" ");
}

function runGh(args, options = {}) {
  const result = childProcess.spawnSync("gh", args, {
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  });
  if (result.status === 0) return result.stdout;

  const message = result.stderr?.trim() || result.stdout?.trim() || `gh exited with status ${result.status}`;
  throw new Error(message);
}

function readPullRequest(pr) {
  const args = ["pr", "view"];
  if (pr != null) args.push(pr);
  args.push("--json", "number,title,headRefOid");
  const data = JSON.parse(runGh(args));
  if (!data.number || !data.title || !data.headRefOid) {
    throw new Error("Could not read pull request number, title, and headRefOid.");
  }
  return data;
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

function usage() {
  return `Usage: node scripts/safe-automerge-pr.js [--dry-run] [<pr-number-or-url>]

Enables squash automerge with the current PR title as the squash subject and
the current PR head SHA as a guard against stale automerge metadata.`;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage());
    return;
  }

  const pullRequest = readPullRequest(args.pr);
  const mergeArgs = buildMergeArgs(pullRequest);
  if (args.dryRun) {
    console.log(formatCommand(mergeArgs));
    return;
  }
  runGh(mergeArgs, { stdio: "inherit" });
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  buildMergeArgs,
  formatCommand,
  isSemanticPullRequestTitle,
  parseArgs,
};
