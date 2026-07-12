#!/usr/bin/env node
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { getAppIdentity } = require("../src/core/patch-engine");
const { sourceFamilyConfig } = require("../src/core/app-identity");
const {
  createAuditProgress,
  createJsonlProgress,
  findFreePort,
  jsonlRecord,
  runAudit,
  writeJsonl,
} = require("../src/core/plugin-audit");
const { patchSets } = require("../src/patches");
const { resolveDefaultSourcesDir } = require("./release-intake");

function expandPath(input) {
  if (input === "~") return os.homedir();
  if (input.startsWith("~/")) return path.join(os.homedir(), input.slice(2));
  return input;
}

function parseArgs(argv) {
  const args = {
    autoClean: false,
    clean: false,
    filter: null,
    help: false,
    includeNativeOpenProbes: false,
    json: false,
    jsonl: false,
    keepOpen: false,
    newest: null,
    noProgress: false,
    visualContract: true,
    artifactDir: null,
    remoteDebuggingPort: 9234,
    sourcesDir: null,
    useLiveSourceHome: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`Missing value for ${arg}`);
      return argv[index];
    };

    if (arg === "--auto-clean") args.autoClean = true;
    else if (arg === "--clean") args.clean = true;
    else if (arg === "--filter") args.filter = next();
    else if (arg === "--include-native-open-probes") args.includeNativeOpenProbes = true;
    else if (arg === "--json") args.json = true;
    else if (arg === "--jsonl") args.jsonl = true;
    else if (arg === "--keep-open") args.keepOpen = true;
    else if (arg === "--newest") {
      const value = Number(next());
      if (!Number.isInteger(value) || value < 1) throw new Error("--newest must be a positive integer");
      args.newest = value;
    }
    else if (arg === "--no-progress") args.noProgress = true;
    else if (arg === "--artifact-dir") args.artifactDir = path.resolve(expandPath(next()));
    else if (arg === "--no-visual-contract") args.visualContract = false;
    else if (arg === "--remote-debugging-port" || arg === "--port") {
      const value = Number(next());
      if (!Number.isInteger(value) || value < 1) throw new Error(`${arg} must be a positive integer`);
      args.remoteDebuggingPort = value;
    }
    else if (arg === "--sources-dir") args.sourcesDir = path.resolve(expandPath(next()));
    else if (arg === "--use-live-source-home") args.useLiveSourceHome = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (args.autoClean && args.keepOpen) throw new Error("--auto-clean cannot be combined with --keep-open");
  return args;
}

function helpText() {
  return `Usage:
  npm run regression:sources -- [options]

Options:
  --sources-dir <path>         Source cache root. Default: main checkout work/sources
  --filter <text>              Case-insensitive match against version, path, or patch set id
  --newest <N>                 Limit to the newest N matching cached sources
  --auto-clean                 Remove each generated regression directory after its audit
  --clean                      Cleanup-only mode for generated regression directories
  --keep-open                  Leave audit-launched apps open
  --use-live-source-home       Use ~/.codex live state instead of generated fixture state
  --include-native-open-probes Include native window-opening audit probes
  --artifact-dir <path>        Root directory for visual contract artifacts
  --no-visual-contract         Disable default visual contract screenshots/readback
  --no-progress                Suppress audit progress output
  --remote-debugging-port <N>  Starting port for audit apps. Default: 9234
  --json                       Include the full final machine-readable result
  --jsonl                      Stream JSONL-only progress on stdout at least every two seconds
`;
}

function defaultRegressionDirForSources(_sourcesDir, { cwd = process.cwd() } = {}) {
  return path.join(cwd, "work", "regression", "sources");
}

function defaultContractRoot({ cwd = process.cwd(), now = new Date() } = {}) {
  return path.join(cwd, "work", "regression", "contracts", now.toISOString().replace(/[:.]/g, "-"));
}

function compareVersionStrings(left, right) {
  const leftParts = String(left || "").split(".").map((part) => Number(part));
  const rightParts = String(right || "").split(".").map((part) => Number(part));
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = Number.isFinite(leftParts[index]) ? leftParts[index] : 0;
    const rightPart = Number.isFinite(rightParts[index]) ? rightParts[index] : 0;
    if (leftPart !== rightPart) return leftPart - rightPart;
  }
  return String(left || "").localeCompare(String(right || ""));
}

function newestSources(sources, count) {
  return [...sources]
    .sort((left, right) => compareVersionStrings(right.version, left.version))
    .slice(0, count == null ? undefined : count);
}

function prefixProgress(progress, prefix, context = {}) {
  if (!progress) return null;
  if (typeof progress.child === "function") return progress.child(context);
  const reporter = (event = {}) => {
    const text = event.step != null ? `[${event.step}/${event.total}] ${event.label}` : event.label || event.message;
    if (event.status === "item") reporter.item(event.itemType, event.item, event);
    else if (event.status === "succeed") reporter.succeed(text, event);
    else if (event.status === "fail") reporter.fail(text, event);
    else reporter.start(text, event);
  };
  Object.assign(reporter, {
    start(text) {
      progress.start?.(`${prefix}${text}`);
    },
    succeed(text) {
      progress.succeed?.(`${prefix}${text}`);
    },
    fail(text) {
      progress.fail?.(`${prefix}${text}`);
    },
    item(itemType, item, extra) {
      progress.item?.(itemType, item, { ...context, ...extra });
    },
    event(type, payload) {
      progress.event?.(type, { ...context, ...payload });
    },
    close() {},
    suppressCommandOutput: true,
  });
  return reporter;
}

function findPatchSet(identity, patchSetList = patchSets) {
  return patchSetList.find(
    (patchSet) =>
      patchSet.codexVersion === identity.version &&
      patchSet.bundleVersion === identity.bundleVersion &&
      patchSet.asarSha256 === identity.asarSha256,
  ) || null;
}

function filterMatches(filter, values) {
  if (!filter) return true;
  const needle = filter.toLowerCase();
  return values.some((value) => String(value || "").toLowerCase().includes(needle));
}

function listSourceApps(sourcesDir, { fsImpl = fs } = {}) {
  if (!fsImpl.existsSync(sourcesDir)) return [];
  const appNames = ["ChatGPT.app", "Codex.app"];
  return fsImpl.readdirSync(sourcesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => appNames.map((appName) => path.join(sourcesDir, entry.name, appName)))
    .filter((appPath) => fsImpl.existsSync(appPath))
    .sort((left, right) => left.localeCompare(right));
}

function inspectSourceApp(sourceApp, { getAppIdentityImpl = getAppIdentity, patchSetList = patchSets } = {}) {
  const identity = getAppIdentityImpl(sourceApp);
  const patchSet = findPatchSet(identity, patchSetList);
  const version = identity.version;
  const bundleVersion = identity.bundleVersion;
  return {
    version,
    bundleVersion,
    asarSha256: identity.asarSha256,
    executable: identity.executable,
    sourceFamily: identity.sourceFamily || "codex",
    sourceApp,
    supported: Boolean(patchSet),
    patchSet: patchSet?.id || null,
    unsupportedReason: patchSet ? null : "no registered patch set matches this source identity",
  };
}

function sourceMatchesFilter(source, filter) {
  return filterMatches(filter, [
    source.version,
    source.bundleVersion,
    source.sourceFamily,
    source.sourceApp,
    source.patchSet,
  ]);
}

function discoverSources({ sourcesDir, filter = null, newest = null, operations = {} }) {
  const fsImpl = operations.fs || fs;
  const readIdentity = operations.getAppIdentity || getAppIdentity;
  const patchSetList = operations.patchSets || patchSets;
  const sources = listSourceApps(sourcesDir, { fsImpl })
    .map((sourceApp) => inspectSourceApp(sourceApp, {
      getAppIdentityImpl: readIdentity,
      patchSetList,
    }))
    .filter((source) => sourceMatchesFilter(source, filter));
  return newestSources(sources, newest);
}

function pathsForSource(regressionDir, source) {
  const sourceInfo = typeof source === "string" ? { version: source, sourceFamily: "codex" } : source;
  const version = sourceInfo.version;
  const familyConfig = sourceFamilyConfig(sourceInfo.sourceFamily || "codex");
  const root = path.join(regressionDir, version);
  return {
    root,
    targetApp: path.join(root, familyConfig.defaultTargetName),
    devHome: path.join(root, "codex-home"),
    electronUserDataPath: path.join(root, "electron-user-data"),
  };
}

function cleanRegressionDir(target, regressionDir, { fsImpl = fs } = {}) {
  const resolvedRegressionDir = path.resolve(regressionDir);
  const resolvedTarget = path.resolve(target);
  if (resolvedTarget === resolvedRegressionDir || !resolvedTarget.startsWith(`${resolvedRegressionDir}${path.sep}`)) {
    throw new Error(`Refusing to clean outside regression directory: ${target}`);
  }
  fsImpl.rmSync(resolvedTarget, { recursive: true, force: true });
  return true;
}

function listCleanTargets({ regressionDir, sources = [], filter = null, operations = {} }) {
  const fsImpl = operations.fs || fs;
  if (!fsImpl.existsSync(regressionDir)) return [];
  const sourceByVersion = new Map(sources.map((source) => [source.version, source]));
  return fsImpl.readdirSync(regressionDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const target = path.join(regressionDir, entry.name);
      const source = sourceByVersion.get(entry.name);
      return {
        version: entry.name,
        target,
        source,
      };
    })
    .filter((entry) => filterMatches(filter, [
      entry.version,
      entry.target,
      entry.source?.sourceApp,
      entry.source?.patchSet,
      entry.source?.bundleVersion,
    ]))
    .sort((left, right) => left.version.localeCompare(right.version));
}

function cleanRegressionSources({ regressionDir, sources = [], filter = null, newest = null, operations = {} }) {
  const fsImpl = operations.fs || fs;
  const targets = newestSources(listCleanTargets({ regressionDir, sources, filter, operations }), newest);
  return targets.map((entry) => {
    cleanRegressionDir(entry.target, regressionDir, { fsImpl });
    return {
      version: entry.version,
      target: entry.target,
      cleaned: true,
    };
  });
}

async function runSourceRegression(source, { args, regressionDir, operations = {}, progress = null, index = 1, total = 1 }) {
  const paths = pathsForSource(regressionDir, source);
  const artifactDir = args.visualContract === false ? null : path.join(args.contractRoot, source.version);
  const sourceContext = {
    version: source.version,
    bundleVersion: source.bundleVersion,
    patchSet: source.patchSet,
    sourceApp: source.sourceApp,
    targetApp: paths.targetApp,
  };
  const label = `[${index}/${total} ${source.version}] `;
  const sourceProgress = prefixProgress(progress, label, sourceContext);
  if (!source.supported) {
    sourceProgress?.start?.("Checking source support");
    sourceProgress?.succeed?.("Skipped unsupported source");
    return {
      ...source,
      ok: null,
      targetApp: paths.targetApp,
      cleaned: false,
      skipped: true,
      reason: source.unsupportedReason,
    };
  }

  const runAuditImpl = operations.runAudit || runAudit;
  const findFreePortImpl = operations.findFreePort || findFreePort;
  const remoteDebuggingPort = await findFreePortImpl(args.remoteDebuggingPort + index - 1);
  const auditArgs = {
    apply: true,
    devHome: paths.devHome,
    devInstanceId: `regression-${source.version.replaceAll(".", "-")}`,
    electronUserDataPath: paths.electronUserDataPath,
    includeNativeOpenProbes: args.includeNativeOpenProbes,
    json: args.json,
    jsonl: args.jsonl,
    keepOpen: args.keepOpen,
    launch: true,
    noProgress: args.noProgress,
    quiet: args.json || args.jsonl,
    remoteDebuggingPort,
    source: source.sourceApp,
    sourceHome: path.join(os.homedir(), ".codex"),
    target: paths.targetApp,
    useLiveSourceHome: Boolean(args.useLiveSourceHome),
    visualContract: args.visualContract,
    artifactDir,
  };
  sourceProgress?.start?.(`Running regression audit with ${source.patchSet}`);
  const auditResult = await runAuditImpl(auditArgs, {
    ...(operations.auditOptions || {}),
    progress: sourceProgress,
  });
  if (auditResult.visualContract) {
    sourceProgress?.event?.("visual_contract", {
      ok: auditResult.visualContract.ok,
      artifactDir: auditResult.visualContract.artifactDir,
    });
  }
  let cleaned = false;
  if (args.autoClean) {
    sourceProgress?.start?.("Removing generated regression output");
    cleanRegressionDir(paths.root, regressionDir, { fsImpl: operations.fs || fs });
    sourceProgress?.succeed?.("Removed generated regression output");
    cleaned = true;
  }
  if (auditResult.ok) sourceProgress?.succeed?.("Regression audit passed");
  else sourceProgress?.fail?.("Regression audit failed");

  return {
    ...source,
    ok: Boolean(auditResult.ok),
    targetApp: paths.targetApp,
    artifactDir,
    cleaned,
    failures: auditResult.failures || [],
    audit: {
      expectedWarnings: auditResult.expectedWarnings || [],
      pluginResults: auditResult.pluginResults || {},
    },
  };
}

async function runRegressionSources(args, operations = {}) {
  const cwd = operations.cwd || process.cwd();
  const visualContract = args.visualContract !== false;
  const sourcesDir = args.sourcesDir || resolveDefaultSourcesDir({ cwd, execFileSync: operations.execFileSync });
  const regressionDir = defaultRegressionDirForSources(sourcesDir, { cwd });
  const now = operations.now ? operations.now() : new Date();
  const contractRoot = args.artifactDir || defaultContractRoot({ cwd, now });
  const runArgs = {
    ...args,
    visualContract,
    contractRoot,
  };
  const sources = discoverSources({ sourcesDir, filter: args.filter, newest: args.newest, operations });
  const makeProgress = operations.createAuditProgress || createAuditProgress;
  const makeJsonlProgress = operations.createJsonlProgress || createJsonlProgress;
  const progress = operations.progress === undefined
    ? args.jsonl
      ? makeJsonlProgress(operations.progressOptions || {})
      : await makeProgress({
        json: args.json,
        noProgress: args.noProgress,
        quiet: false,
      }, operations.progressOptions || {})
    : operations.progress;

  if (args.clean) {
    const cleaned = cleanRegressionSources({ regressionDir, sources, filter: args.filter, newest: args.newest, operations });
    return {
      ok: true,
      cleanOnly: true,
      sourcesDir,
      regressionDir,
      filter: args.filter,
      newest: args.newest,
      autoClean: args.autoClean,
      visualContract,
      contractRoot,
      useLiveSourceHome: args.useLiveSourceHome,
      results: cleaned.map((entry) => ({
        version: entry.version,
        targetApp: entry.target,
        cleaned: entry.cleaned,
      })),
    };
  }

  const results = [];
  for (let index = 0; index < sources.length; index += 1) {
    results.push(await runSourceRegression(sources[index], {
      args: runArgs,
      regressionDir,
      operations,
      progress,
      index: index + 1,
      total: sources.length,
    }));
  }
  const runnableResults = results.filter((result) => result.supported);
  const failedResults = runnableResults.filter((result) => !result.ok);
  return {
    ok: runnableResults.length > 0 && failedResults.length === 0,
    cleanOnly: false,
    sourcesDir,
    regressionDir,
    filter: args.filter,
    newest: args.newest,
    autoClean: args.autoClean,
    visualContract,
    contractRoot,
    useLiveSourceHome: args.useLiveSourceHome,
    results,
  };
}

function formatHumanResult(result) {
  const lines = [
    result.cleanOnly ? "Regression source cleanup" : "Regression source audit",
    `Sources: ${result.sourcesDir}`,
    `Regression output: ${result.regressionDir}`,
  ];
  if (result.filter) lines.push(`Filter: ${result.filter}`);
  if (result.newest != null) lines.push(`Newest: ${result.newest}`);
  lines.push("");

  if (result.results.length === 0) {
    lines.push(result.cleanOnly ? "No generated regression directories matched." : "No cached sources matched.");
    return `${lines.join("\n")}\n`;
  }

  for (const entry of result.results) {
    if (result.cleanOnly) {
      lines.push(`Cleaned ${entry.version}: ${entry.targetApp}`);
      continue;
    }
    if (!entry.supported) {
      lines.push(`Skipped ${entry.version} (${entry.bundleVersion})`);
      lines.push(`  Source: ${entry.sourceApp}`);
      lines.push(`  app.asar: ${entry.asarSha256}`);
      lines.push(`  Reason: ${entry.reason}`);
      lines.push("");
      continue;
    }
    lines.push(`${entry.ok ? "Passed" : "Failed"} ${entry.version} (${entry.bundleVersion})`);
    lines.push(`  Source: ${entry.sourceApp}`);
    lines.push(`  Target: ${entry.targetApp}`);
    lines.push(`  Patch set: ${entry.patchSet}`);
    if (entry.artifactDir) lines.push(`  Visual contract: ${entry.artifactDir}`);
    if (entry.cleaned) lines.push("  Cleanup: removed generated regression output");
    if (!entry.ok && entry.failures?.length > 0) {
      for (const failure of entry.failures) {
        lines.push(`  Failure: ${failure.plugin || "audit"}: ${failure.message || "unknown failure"}`);
      }
    }
    lines.push("");
  }

  if (!result.cleanOnly) {
    const supported = result.results.filter((entry) => entry.supported).length;
    const passed = result.results.filter((entry) => entry.supported && entry.ok).length;
    const failed = result.results.filter((entry) => entry.supported && entry.ok === false).length;
    const skipped = result.results.filter((entry) => !entry.supported).length;
    lines.push(`Summary: ${passed}/${supported} supported passed, ${failed} failed, ${skipped} skipped.`);
  }
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(helpText());
    return;
  }
  const result = await runRegressionSources(args);
  if (args.jsonl) {
    if (args.json) {
      writeJsonl(process.stdout, jsonlRecord("result", { result }));
    } else {
      writeJsonl(process.stdout, jsonlRecord("summary", {
        ok: result.ok,
        supported: result.results.filter((entry) => entry.supported).length,
        passed: result.results.filter((entry) => entry.supported && entry.ok).length,
        failed: result.results.filter((entry) => entry.supported && entry.ok === false).length,
        skipped: result.results.filter((entry) => !entry.supported).length,
        contractRoot: result.contractRoot,
      }));
    }
  } else if (args.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else {
    process.stdout.write(formatHumanResult(result));
  }
  if (!result.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    if (process.argv.includes("--jsonl")) {
      writeJsonl(process.stdout, jsonlRecord("error", { message: error.message || String(error) }));
    } else {
      console.error(`Error: ${error.message || String(error)}`);
    }
    process.exitCode = 1;
  });
}

module.exports = {
  cleanRegressionDir,
  cleanRegressionSources,
  compareVersionStrings,
  defaultContractRoot,
  defaultRegressionDirForSources,
  discoverSources,
  filterMatches,
  findPatchSet,
  formatHumanResult,
  helpText,
  inspectSourceApp,
  listCleanTargets,
  listSourceApps,
  newestSources,
  parseArgs,
  pathsForSource,
  prefixProgress,
  runRegressionSources,
  runSourceRegression,
  sourceMatchesFilter,
};
