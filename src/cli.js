#!/usr/bin/env node
const os = require("node:os");
const path = require("node:path");

const {
  createAuditProgress,
  DEFAULT_PORT: DEFAULT_AUDIT_PORT,
  DEFAULT_TARGET: DEFAULT_AUDIT_TARGET,
  formatAuditJson,
  formatAuditResult,
  runAudit,
} = require("./core/plugin-audit");
const { readAsar, walkFiles } = require("./core/asar");
const {
  DEFAULT_DEV_HOME,
  DEFAULT_ELECTRON_USER_DATA,
  formatLaunchDevResult,
  formatSyncDevHomeResult,
  launchDevApp,
  syncDevHome,
} = require("./core/dev-mode");
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
    sourceHome: path.join(os.homedir(), ".codex"),
    devHome: DEFAULT_DEV_HOME,
    electronUserDataPath: DEFAULT_ELECTRON_USER_DATA,
    mode: "builtin",
    releaseAsset: "codex-plus-patches.tgz",
    releaseTag: "latest",
    dryRun: false,
    json: false,
    debug: false,
    apply: true,
    launch: true,
    keepOpen: false,
    noProgress: false,
    quiet: false,
  };
  const rest = [...argv];
  if (rest[0] && !rest[0].startsWith("--")) args.command = rest.shift();
  if (args.command === "audit-plugins") {
    args.target = DEFAULT_AUDIT_TARGET;
    args.remoteDebuggingPort = DEFAULT_AUDIT_PORT;
  }
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    const next = () => {
      index += 1;
      if (index >= rest.length) throw new Error(`Missing value for ${arg}`);
      return rest[index];
    };
    if (arg === "--source") args.source = path.resolve(expandPath(next()));
    else if (arg === "--target") args.target = path.resolve(expandPath(next()));
    else if (arg === "--source-home") args.sourceHome = path.resolve(expandPath(next()));
    else if (arg === "--dev-home") args.devHome = path.resolve(expandPath(next()));
    else if (arg === "--electron-user-data") args.electronUserDataPath = path.resolve(expandPath(next()));
    else if (arg === "--remote-debugging-port" || arg === "--port") {
      const value = next();
      args.remoteDebuggingPort = args.command === "audit-plugins" ? Number(value) : value;
    }
    else if (arg === "--asar") args.asar = path.resolve(expandPath(next()));
    else if (arg === "--file") args.file = next();
    else if (arg === "--contains") args.contains = next();
    else if (arg === "--mode") args.mode = next();
    else if (arg === "--patch-dir") args.patchDir = path.resolve(expandPath(next()));
    else if (arg === "--github-repo") args.githubRepo = next();
    else if (arg === "--release-tag") args.releaseTag = next();
    else if (arg === "--release-asset") args.releaseAsset = next();
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--no-apply") args.apply = false;
    else if (arg === "--no-launch") args.launch = false;
    else if (arg === "--keep-open") args.keepOpen = true;
    else if (arg === "--no-progress") args.noProgress = true;
    else if (arg === "--quiet") args.quiet = true;
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
  codex-plus-patcher audit-plugins [--json] [--quiet] [--no-progress] [--keep-open]
  codex-plus-patcher dev-sync [--source-home <path>] [--dev-home <path>] [--json]
  codex-plus-patcher launch-dev --target <path> [--dev-home <path>] [--electron-user-data <path>] [--remote-debugging-port <port>] [--json]
  codex-plus-patcher menu-diagnostics --asar <path> [--json]
  codex-plus-patcher asar-list --asar <path> [--contains <text>] [--json]
  codex-plus-patcher asar-cat --asar <path> --file <asar-path> [--json]

Options:
  --source <path>          Source Codex.app. Default: /Applications/Codex.app
  --target <path>          Target Codex Plus.app. Default: ~/Applications/Codex Plus.app
  --source-home <path>     Original Codex home for dev-sync. Default: ~/.codex
  --dev-home <path>        Isolated CODEX_HOME for dev mode. Default: ./work/codex-plus-dev-home
  --electron-user-data <path>
                           Isolated Electron userData for launch-dev. Default: ./work/codex-plus-electron-user-data
  --remote-debugging-port <port>
                           Remote debugging port passed to launch-dev or audit-plugins
  --asar <path>            app.asar path for ASAR readback commands
  --file <asar-path>       Packed file path for asar-cat
  --contains <text>        Filter asar-list paths by substring
  --mode <builtin|dev|release>
  --patch-dir <path>       Dev mode patch directory containing index.js
  --github-repo <owner/repo>
  --release-tag <tag>      Release mode tag. Default: latest
  --release-asset <name>   Release mode asset. Default: codex-plus-patches.tgz
  --dry-run                Select and report the patch without copying/signing
  --no-apply               Reuse an existing audit target without applying patches
  --no-launch              Attach to an existing audit app instead of launching
  --keep-open              Leave the audit-launched app open after probes finish
  --no-progress            Suppress audit progress and print only the final summary
  --quiet                  Print minimal audit output
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

function listAsarFiles({ asar, contains }) {
  if (!asar) throw new Error("--asar is required");
  const archive = readAsar(asar);
  const files = walkFiles(archive.header)
    .map(([file]) => file)
    .filter((file) => contains == null || file.includes(contains));
  return { asar, files };
}

function readAsarFile({ asar, file }) {
  if (!asar) throw new Error("--asar is required");
  if (!file) throw new Error("--file is required");
  const archive = readAsar(asar);
  const node = new Map(walkFiles(archive.header)).get(file);
  if (!node) throw new Error(`Could not find ${file} in ${asar}`);
  if (node.unpacked) throw new Error(`Cannot read unpacked ASAR file ${file} from ${asar}`);
  const size = Number(node.size || 0);
  const start = archive.dataStart + Number(node.offset || 0);
  const content = archive.buffer.subarray(start, start + size).toString("utf8");
  return { asar, file, size, content };
}

function readPackedEntry(archive, node) {
  if (node.unpacked) return null;
  const size = Number(node.size || 0);
  const start = archive.dataStart + Number(node.offset || 0);
  return archive.buffer.subarray(start, start + size).toString("utf8");
}

function menuDiagnostics({ asar }) {
  if (!asar) throw new Error("--asar is required");
  const archive = readAsar(asar);
  const files = walkFiles(archive.header);
  const commandId = "codexPlusOpenDevTools";
  const menuTitle = "Open Developer Tools";
  const commandMetadataFiles = [];
  const nativeBridgeFiles = [];
  const runtimePluginFiles = [];
  const applicationMenuFiles = [];

  for (const [file, node] of files) {
    if (!file.endsWith(".js")) continue;
    const content = readPackedEntry(archive, node);
    if (content == null) continue;
    const hasDevToolsCommand = content.includes(commandId);
    const hasMenuTitle = content.includes(menuTitle);
    const hasToggleBottomPanel = content.includes("Toggle Bottom Panel") || content.includes("toggleBottomPanel");
    const hasPanelsGroup = content.includes("commandMenuGroupKey:`panels`") || content.includes('commandMenuGroupKey:"panels"');
    const hasNativeBridge = content.includes("devtools/open") || content.includes("CPXOpenDevTools");
    const hasRuntimePlugin = file.endsWith("/devTools.js") || content.includes('id: "devTools"');
    const hasApplicationMenu = content.includes("Menu.setApplicationMenu") || content.includes("refreshApplicationMenu");

    if (hasPanelsGroup || hasDevToolsCommand || file.includes("electron-menu-shortcuts")) {
      commandMetadataFiles.push({
        file,
        hasDevToolsCommand,
        hasMenuTitle,
        hasToggleBottomPanel,
        hasPanelsGroup,
      });
    }
    if (hasNativeBridge) nativeBridgeFiles.push({ file, hasDevToolsOpenRequest: content.includes("devtools/open"), hasOpenDevToolsCall: content.includes("openDevTools") });
    if (hasRuntimePlugin) runtimePluginFiles.push({ file, hasDevToolsCommand, hasDevToolsOpenRequest: content.includes("devtools/open") });
    if (hasApplicationMenu) applicationMenuFiles.push({ file, hasDiagnosticsHook: content.includes("CPXLogMenuDiagnostics"), hasDevToolsCommand });
  }

  return {
    asar,
    commandId,
    menuTitle,
    commandMetadataFiles,
    nativeBridgeFiles,
    runtimePluginFiles,
    applicationMenuFiles,
    summary: {
      commandMetadataFilesWithCommand: commandMetadataFiles.filter((entry) => entry.hasDevToolsCommand).map((entry) => entry.file),
      nativeBridgeFilesWithRequest: nativeBridgeFiles.filter((entry) => entry.hasDevToolsOpenRequest).map((entry) => entry.file),
      runtimePluginFilesWithCommand: runtimePluginFiles.filter((entry) => entry.hasDevToolsCommand).map((entry) => entry.file),
      applicationMenuFilesWithDiagnostics: applicationMenuFiles.filter((entry) => entry.hasDiagnosticsHook).map((entry) => entry.file),
    },
  };
}

function formatAsarListResult(result) {
  return result.files.length > 0 ? `${result.files.join("\n")}\n` : "";
}

function formatAsarCatResult(result) {
  return result.content;
}

function formatMenuDiagnosticsResult(result) {
  const lines = [
    `ASAR: ${result.asar}`,
    `Command: ${result.commandId}`,
    "",
    "Command metadata bundles:",
    ...result.commandMetadataFiles.map((entry) =>
      `- ${entry.file}: command=${entry.hasDevToolsCommand ? "yes" : "no"}, title=${entry.hasMenuTitle ? "yes" : "no"}, bottomPanel=${entry.hasToggleBottomPanel ? "yes" : "no"}, panels=${entry.hasPanelsGroup ? "yes" : "no"}`,
    ),
    "",
    "Native bridge bundles:",
    ...result.nativeBridgeFiles.map((entry) =>
      `- ${entry.file}: request=${entry.hasDevToolsOpenRequest ? "yes" : "no"}, openDevTools=${entry.hasOpenDevToolsCall ? "yes" : "no"}`,
    ),
    "",
    "Runtime plugin bundles:",
    ...result.runtimePluginFiles.map((entry) =>
      `- ${entry.file}: command=${entry.hasDevToolsCommand ? "yes" : "no"}, request=${entry.hasDevToolsOpenRequest ? "yes" : "no"}`,
    ),
    "",
    "Application menu bundles:",
    ...result.applicationMenuFiles.map((entry) =>
      `- ${entry.file}: diagnosticsHook=${entry.hasDiagnosticsHook ? "yes" : "no"}, command=${entry.hasDevToolsCommand ? "yes" : "no"}`,
    ),
  ];
  return `${lines.join("\n")}\n`;
}

function formatError(error, { debug = false } = {}) {
  if (debug || process.env.CODEX_PLUS_PATCHER_DEBUG === "1") return error.stack || error.message || String(error);
  return `Error: ${error.message || String(error)}`;
}

function shouldShowApplyProgress(args, stream = process.stderr) {
  return !args.dryRun && !args.json && Boolean(stream.isTTY);
}

async function createApplyProgress(args, { stream = process.stderr, importOra = (specifier) => import(specifier) } = {}) {
  if (!shouldShowApplyProgress(args, stream)) return null;
  const { default: ora } = await importOra("ora");
  const spinner = ora({
    color: "cyan",
    spinner: "dots",
    stream,
  });
  let active = false;

  const progress = ({ status = "start", step, total, label }) => {
    const text = `[${step}/${total}] ${label}`;
    if (status === "start") {
      if (active) spinner.succeed();
      spinner.text = text;
      spinner.start();
      active = true;
      return;
    }
    if (!active) return;
    if (status === "succeed") spinner.succeed(text);
    else if (status === "fail") spinner.fail(text);
    active = false;
  };
  progress.start = (text) => {
    if (active) spinner.succeed();
    spinner.text = text;
    spinner.start();
    active = true;
  };
  progress.succeed = (text) => {
    if (!active) return;
    spinner.succeed(text);
    active = false;
  };
  progress.fail = () => {
    if (!active) return;
    spinner.fail();
    active = false;
  };
  return progress;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "help") {
    printHelp();
    return;
  }
  if (args.command === "asar-list") {
    const result = listAsarFiles(args);
    process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : formatAsarListResult(result));
    return;
  }
  if (args.command === "asar-cat") {
    const result = readAsarFile(args);
    process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : formatAsarCatResult(result));
    return;
  }
  if (args.command === "menu-diagnostics") {
    const result = menuDiagnostics(args);
    process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : formatMenuDiagnosticsResult(result));
    return;
  }
  if (args.command === "dev-sync") {
    const result = syncDevHome(args);
    process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : formatSyncDevHomeResult(result));
    return;
  }
  if (args.command === "launch-dev") {
    const result = launchDevApp({
      targetApp: args.target,
      devHome: args.devHome,
      electronUserDataPath: args.electronUserDataPath,
      remoteDebuggingPort: args.remoteDebuggingPort,
    });
    process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : formatLaunchDevResult(result));
    return;
  }
  if (args.command === "audit-plugins") {
    const progress = await createAuditProgress(args);
    const result = await runAudit(args, { progress });
    process.stdout.write(args.json ? formatAuditJson(result) : formatAuditResult(result, args));
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (args.command !== "apply") throw new Error(`Unknown command: ${args.command}`);

  const patchSets = await loadPatchSets(args);
  const progress = await createApplyProgress(args);
  let result;
  try {
    result = await patchCodexApp({
      sourceApp: args.source,
      targetApp: args.target,
      patchSets,
      dryRun: args.dryRun,
      progress,
    });
  } catch (error) {
    if (progress) progress.fail();
    throw error;
  }
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
  createApplyProgress,
  createAuditProgress,
  expandPath,
  formatAsarCatResult,
  formatAsarListResult,
  formatAuditJson,
  formatAuditResult,
  formatError,
  formatLaunchDevResult,
  formatMenuDiagnosticsResult,
  formatResult,
  formatSyncDevHomeResult,
  helpText,
  listAsarFiles,
  loadPatchSets,
  launchDevApp,
  menuDiagnostics,
  parseArgs,
  readAsarFile,
  requirePatchSetModule,
  runAudit,
  shouldShowApplyProgress,
  syncDevHome,
};
