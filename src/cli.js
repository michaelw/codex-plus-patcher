#!/usr/bin/env node
const os = require("node:os");
const path = require("node:path");

const { patchCodexApp } = require("./core/patch-engine");
const { resolveReleasePatchDirectory } = require("./core/release");
const { patchSets: builtInPatchSets } = require("./patches");

function expandPath(input) {
  if (input === "~") return os.homedir();
  if (input.startsWith("~/")) return path.join(os.homedir(), input.slice(2));
  return input;
}

function parseArgs(argv) {
  const args = {
    command: argv.length === 0 ? "help" : "apply",
    source: "/Applications/Codex.app",
    target: path.join(os.homedir(), "Applications", "Codex Plus.app"),
    mode: "builtin",
    releaseAsset: "codex-plus-patches.tgz",
    releaseTag: "latest",
    dryRun: false,
    json: false,
    debug: false,
  };
  const rest = [...argv];
  if (rest[0] && !rest[0].startsWith("--")) args.command = rest.shift();
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    const next = () => {
      index += 1;
      if (index >= rest.length) throw new Error(`Missing value for ${arg}`);
      return rest[index];
    };
    if (arg === "--source") args.source = path.resolve(expandPath(next()));
    else if (arg === "--target") args.target = path.resolve(expandPath(next()));
    else if (arg === "--mode") args.mode = next();
    else if (arg === "--patch-dir") args.patchDir = path.resolve(expandPath(next()));
    else if (arg === "--github-repo") args.githubRepo = next();
    else if (arg === "--release-tag") args.releaseTag = next();
    else if (arg === "--release-asset") args.releaseAsset = next();
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--debug") args.debug = true;
    else if (arg === "--json" || arg === "--format=json") args.json = true;
    else if (arg === "--format") {
      const format = next();
      if (format !== "json") throw new Error(`Unknown format: ${format}`);
      args.json = true;
    }
    else if (arg === "--help" || arg === "-h") args.command = "help";
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function helpText() {
  return `Usage:
  codex-plus-patcher
  codex-plus-patcher apply [options]

Options:
  --source <path>          Source Codex.app. Default: /Applications/Codex.app
  --target <path>          Target Codex Plus.app. Default: ~/Applications/Codex Plus.app
  --mode <builtin|dev|release>
  --patch-dir <path>       Dev mode patch directory containing index.js
  --github-repo <owner/repo>
  --release-tag <tag>      Release mode tag. Default: latest
  --release-asset <name>   Release mode asset. Default: codex-plus-patches.tgz
  --dry-run                Select and report the patch without copying/signing
  --debug                  Print stack traces for CLI errors
  --json                   Print the machine-readable result
`;
}

function printHelp() {
  console.log(helpText());
}

async function loadPatchSets(args) {
  if (args.mode === "builtin") return builtInPatchSets;
  if (args.mode === "dev") {
    if (!args.patchDir) throw new Error("--patch-dir is required in dev mode");
    return requirePatchSetModule(args.patchDir).patchSets;
  }
  if (args.mode === "release") {
    if (!args.githubRepo) throw new Error("--github-repo is required in release mode");
    const patchDir = await resolveReleasePatchDirectory({
      repo: args.githubRepo,
      tag: args.releaseTag,
      assetName: args.releaseAsset,
    });
    return requirePatchSetModule(patchDir).patchSets;
  }
  throw new Error(`Unknown mode: ${args.mode}`);
}

function requirePatchSetModule(patchDir) {
  const candidates = [
    path.join(patchDir, "index.js"),
    path.join(patchDir, "src", "patches", "index.js"),
    path.join(patchDir, "patches", "index.js"),
  ];
  const found = candidates.find((candidate) => {
    try {
      return require("node:fs").statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
  if (!found) throw new Error(`Could not find patch index in ${patchDir}`);
  return require(found);
}

function formatResult(result) {
  const lines = [
    result.dryRun ? "Codex Plus dry run succeeded." : "Codex Plus app created.",
    `Source: ${result.sourceApp}`,
    `Target: ${result.targetApp}`,
    `Patch set: ${result.patchSet}`,
    `Patches: ${result.patches.join(", ")}`,
  ];
  if (result.patchedAsarSha) lines.push(`Patched app.asar SHA-256: ${result.patchedAsarSha}`);
  if (!result.dryRun) lines.push(`Open: open ${JSON.stringify(result.targetApp)}`);
  return `${lines.join("\n")}\n`;
}

function formatError(error, { debug = false } = {}) {
  if (debug || process.env.CODEX_PLUS_PATCHER_DEBUG === "1") return error.stack || error.message || String(error);
  return `Error: ${error.message || String(error)}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "help") {
    printHelp();
    return;
  }
  if (args.command !== "apply") throw new Error(`Unknown command: ${args.command}`);

  const patchSets = await loadPatchSets(args);
  const result = patchCodexApp({
    sourceApp: args.source,
    targetApp: args.target,
    patchSets,
    dryRun: args.dryRun,
  });
  process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : formatResult(result));
}

if (require.main === module) {
  main().catch((error) => {
    const debug = process.argv.includes("--debug") || process.env.CODEX_PLUS_PATCHER_DEBUG === "1";
    console.error(formatError(error, { debug }));
    process.exitCode = 1;
  });
}

module.exports = {
  expandPath,
  formatError,
  formatResult,
  helpText,
  loadPatchSets,
  parseArgs,
  requirePatchSetModule,
};
