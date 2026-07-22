#!/usr/bin/env node
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { getAppIdentity, preflightPatchSet } = require("../src/core/patch-engine");
const { sourceFamilyConfig } = require("../src/core/app-identity");
const {
  createAuditProgress,
  createJsonlProgress,
  findFreePort,
  jsonlRecord,
  listRunningAuditApps,
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
    affectedSince: null,
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
    preflightOnly: false,
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

    if (arg === "--affected-since") args.affectedSince = next();
    else if (arg === "--auto-clean") args.autoClean = true;
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
    else if (arg === "--preflight-only") args.preflightOnly = true;
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
  if (args.clean && args.preflightOnly) throw new Error("--clean cannot be combined with --preflight-only");
  if (args.affectedSince && args.preflightOnly) throw new Error("--affected-since cannot be combined with --preflight-only; preflight every cached source");
  if (args.affectedSince && args.clean) throw new Error("--affected-since cannot be combined with --clean");
  return args;
}

function helpText() {
  return `Usage:
  npm run regression:sources -- [options]

Options:
  --affected-since <commit>    Live-test only versions affected since this commit
  --sources-dir <path>         Source cache root. Default: main checkout work/sources
  --filter <text>              Case-insensitive match against version, path, or patch set id
  --newest <N>                 Limit to the newest N matching cached sources
  --preflight-only             Transform every selected source in memory; do not copy or launch apps
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

function defaultPreflightRoot({ cwd = process.cwd(), now = new Date() } = {}) {
  return path.join(cwd, "work", "regression", "preflight", now.toISOString().replace(/[:.]/g, "-"));
}

function defaultImpactRoot({ cwd = process.cwd(), now = new Date() } = {}) {
  return path.join(cwd, "work", "regression", "impact", now.toISOString().replace(/[:.]/g, "-"));
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

const ADDITIVE_METADATA_PATHS = new Set([
  "src/patches/index.js",
  "src/patches/lib/transform-ownership.js",
]);

const SHARED_TRANSFORM_PATH = "src/patches/lib/common-patches.js";

const PROOF_HARNESS_PATHS = new Set([
  "scripts/regression-sources.js",
  "src/core/audit-fixture.js",
  "src/core/plugin-audit.js",
]);

function parseNameStatus(output) {
  return String(output || "").trim().split("\n").filter(Boolean).map((line) => {
    const fields = line.split("\t");
    return { status: fields[0], path: fields.at(-1) };
  });
}

function parseNumstat(output) {
  const stats = new Map();
  for (const line of String(output || "").trim().split("\n").filter(Boolean)) {
    const [added, deleted, ...pathParts] = line.split("\t");
    const filePath = pathParts.at(-1);
    stats.set(filePath, {
      additions: added === "-" ? null : Number(added),
      deletions: deleted === "-" ? null : Number(deleted),
    });
  }
  return stats;
}

function collectGitImpact({ cwd = process.cwd(), baseRef, execFileSync = childProcess.execFileSync } = {}) {
  let baseSha;
  try {
    baseSha = String(execFileSync("git", ["rev-parse", "--verify", `${baseRef}^{commit}`], { cwd, encoding: "utf8" })).trim();
  } catch (error) {
    throw new Error(`Cannot resolve --affected-since ref ${baseRef}: ${error.message || String(error)}`);
  }
  const nameStatus = parseNameStatus(execFileSync("git", ["diff", "--name-status", "--find-renames", baseSha, "--"], { cwd, encoding: "utf8" }));
  const numstat = parseNumstat(execFileSync("git", ["diff", "--numstat", "--find-renames", baseSha, "--"], { cwd, encoding: "utf8" }));
  const untracked = String(execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd, encoding: "utf8" }))
    .trim().split("\n").filter(Boolean);
  const byPath = new Map();
  for (const change of nameStatus) {
    const stats = numstat.get(change.path) || { additions: null, deletions: null };
    byPath.set(change.path, { ...change, ...stats });
  }
  for (const filePath of untracked) {
    if (!byPath.has(filePath)) byPath.set(filePath, { status: "A", path: filePath, additions: null, deletions: 0 });
  }
  const sharedTransform = byPath.get(SHARED_TRANSFORM_PATH);
  if (sharedTransform) {
    sharedTransform.patch = String(execFileSync(
      "git",
      ["diff", "--unified=0", baseSha, "--", SHARED_TRANSFORM_PATH],
      { cwd, encoding: "utf8" },
    ));
  }
  return { baseRef, baseSha, changes: [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path)) };
}

function newPatchVersion(change) {
  if (change.status !== "A") return null;
  return /^src\/patches\/(\d+\.\d+\.\d+)-\d+\.js$/.exec(change.path)?.[1] || null;
}

function isOwnerGatedTransformAddition(change, newVersions) {
  if (change.path !== SHARED_TRANSFORM_PATH || change.status !== "M" || change.deletions !== 0 || !change.patch) return false;
  const allowedOwners = new Set([...newVersions].flatMap((version) => [`chatgpt-${version}`, `codex-${version}`]));
  const hunks = String(change.patch).split(/^@@/m).slice(1);
  if (hunks.length === 0) return false;
  return hunks.every((hunk) => {
    const added = hunk.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++"));
    const guards = added.filter((line) => /^\+  if \(patchSetOwnsTransformVariant\(context\.patchSetId, ["']([^"']+)["']\)\) \{$/.test(line));
    if (guards.length === 0) return false;
    if (guards.some((line) => !allowedOwners.has(line.match(/["']([^"']+)["']/)?.[1]))) return false;
    return added.every((line) => !/^\+  \S/.test(line) || line === "+  }" || guards.includes(line));
  });
}

function classifyImpact(changes = []) {
  const newVersions = new Set(changes.map(newPatchVersion).filter(Boolean));
  const harnessPaths = [];
  const allPaths = [];
  const ignoredPaths = [];
  const metadataPaths = [];
  const ownerGatedPaths = [];
  for (const change of changes) {
    const version = newPatchVersion(change);
    if (version) continue;
    if (ADDITIVE_METADATA_PATHS.has(change.path)) {
      if ((change.deletions ?? 1) === 0 && !String(change.status).startsWith("D")) metadataPaths.push(change.path);
      else allPaths.push(change.path);
      continue;
    }
    if (isOwnerGatedTransformAddition(change, newVersions)) {
      ownerGatedPaths.push(change.path);
      continue;
    }
    if (PROOF_HARNESS_PATHS.has(change.path)) {
      harnessPaths.push(change.path);
      continue;
    }
    if (change.path === "AGENTS.md" || change.path === "DEVELOPMENT.md" || change.path.startsWith("docs/") || change.path.startsWith("tests/")) {
      ignoredPaths.push(change.path);
      continue;
    }
    allPaths.push(change.path);
  }
  return {
    scope: allPaths.length > 0 ? "all-supported" : harnessPaths.length > 0 ? "family-representatives" : newVersions.size > 0 ? "new-patches" : "none",
    newVersions: [...newVersions].sort((left, right) => compareVersionStrings(right, left)),
    harnessPaths,
    allPaths,
    metadataPaths,
    ownerGatedPaths,
    ignoredPaths,
  };
}

function selectAffectedSources(sources, impact) {
  const supported = newestSources(sources.filter((source) => source.supported));
  const selectedVersions = new Set();
  const reasons = new Map();
  if (impact.scope === "all-supported") {
    for (const source of supported) {
      selectedVersions.add(source.version);
      reasons.set(source.version, `shared or unclassified application code changed: ${impact.allPaths.join(", ")}`);
    }
  } else {
    for (const version of impact.newVersions) {
      selectedVersions.add(version);
      reasons.set(version, `new versioned patch ${version}`);
    }
    if (impact.scope === "family-representatives") {
      const families = new Set();
      for (const source of supported) {
        if (families.has(source.sourceFamily)) continue;
        families.add(source.sourceFamily);
        selectedVersions.add(source.version);
        if (!reasons.has(source.version)) reasons.set(source.version, `proof harness changed: ${impact.harnessPaths.join(", ")}`);
      }
    }
  }
  const selected = supported.filter((source) => selectedVersions.has(source.version))
    .map((source) => ({ ...source, impactReason: reasons.get(source.version) || "affected by current diff" }));
  const skipped = supported.filter((source) => !selectedVersions.has(source.version))
    .map((source) => ({ ...source, impactReason: "no packaged code dependency or required harness representative changed" }));
  return { ...impact, selected, skipped };
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
  fsImpl.rmSync(resolvedTarget, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
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
    sourceIndex: index,
    sourceTotal: total,
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
    devInstanceId: `reg-${source.version.replaceAll(".", "")}`,
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
  else {
    const firstFailure = auditResult.failures?.[0];
    const failureDetail = firstFailure?.message
      ? `: ${firstFailure.plugin || "audit"}: ${firstFailure.message}`
      : "";
    sourceProgress?.fail?.(`Regression audit failed${failureDetail}`);
  }

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

function runSourcePreflight(source, { operations = {}, progress = null, index = 1, total = 1 }) {
  const sourceProgress = prefixProgress(progress, `[${index}/${total} ${source.version}] `, {
    version: source.version,
    bundleVersion: source.bundleVersion,
    patchSet: source.patchSet,
    sourceApp: source.sourceApp,
    sourceIndex: index,
    sourceTotal: total,
  });
  if (!source.supported) {
    sourceProgress?.succeed?.("Skipped unsupported source");
    sourceProgress?.close?.();
    return { ...source, ok: null, skipped: true, reason: source.unsupportedReason };
  }

  const selected = findPatchSet(source, operations.patchSets || patchSets);
  const runPreflight = operations.preflightPatchSet || preflightPatchSet;
  sourceProgress?.start?.(`Preflighting ${selected.id}`);
  try {
    const preflight = runPreflight({
      sourceApp: source.sourceApp,
      identity: {
        version: source.version,
        bundleVersion: source.bundleVersion,
        asarSha256: source.asarSha256,
        sourceFamily: source.sourceFamily,
      },
      patchSet: selected,
      operations: operations.preflightOperations || {},
    });
    sourceProgress?.succeed?.("Preflight passed");
    return { ...source, ok: true, preflight };
  } catch (error) {
    sourceProgress?.fail?.("Preflight failed");
    return {
      ...source,
      ok: false,
      failures: [{ plugin: "preflight", message: error.message || String(error) }],
    };
  } finally {
    sourceProgress?.close?.();
  }
}

async function runRegressionSources(args, operations = {}) {
  const cwd = operations.cwd || process.cwd();
  const visualContract = args.visualContract !== false;
  const sourcesDir = args.sourcesDir || resolveDefaultSourcesDir({ cwd, execFileSync: operations.execFileSync });
  const regressionDir = defaultRegressionDirForSources(sourcesDir, { cwd });
  const now = operations.now ? operations.now() : new Date();
  const contractRoot = args.artifactDir || defaultContractRoot({ cwd, now });
  const preflightRoot = defaultPreflightRoot({ cwd, now });
  const preflightSummary = path.join(preflightRoot, "preflight-summary.json");
  const impactRoot = defaultImpactRoot({ cwd, now });
  const impactSummary = path.join(impactRoot, "impact-summary.json");
  const runArgs = {
    ...args,
    visualContract,
    contractRoot,
  };
  let sources = discoverSources({ sourcesDir, filter: args.filter, newest: args.newest, operations });
  let impact = null;
  if (args.affectedSince) {
    const collected = (operations.collectGitImpact || collectGitImpact)({
      cwd,
      baseRef: args.affectedSince,
      execFileSync: operations.execFileSync || childProcess.execFileSync,
    });
    impact = selectAffectedSources(sources, collected.scope ? collected : { ...collected, ...classifyImpact(collected.changes) });
    sources = impact.selected;
    const fsImpl = operations.fs || fs;
    fsImpl.mkdirSync(impactRoot, { recursive: true });
    fsImpl.writeFileSync(impactSummary, `${JSON.stringify({
      affectedSince: args.affectedSince,
      baseSha: impact.baseSha,
      scope: impact.scope,
      changes: impact.changes.map(({ patch, ...change }) => change),
      classifications: {
        newVersions: impact.newVersions,
        harnessPaths: impact.harnessPaths,
        allPaths: impact.allPaths,
        metadataPaths: impact.metadataPaths,
        ownerGatedPaths: impact.ownerGatedPaths,
        ignoredPaths: impact.ignoredPaths,
      },
      selected: impact.selected.map((source) => ({ version: source.version, patchSet: source.patchSet, reason: source.impactReason })),
      skipped: impact.skipped.map((source) => ({ version: source.version, patchSet: source.patchSet, reason: source.impactReason })),
    }, null, 2)}\n`);
  }
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

  if (impact) {
    progress?.item?.("impact", `${impact.selected.length} selected, ${impact.skipped.length} skipped`, {
      phase: "impact",
      scope: impact.scope,
      impactSummary,
    });
    for (const source of impact.selected) {
      progress?.item?.("source", source.version, { phase: "impact", selected: true, reason: source.impactReason, patchSet: source.patchSet });
    }
    for (const source of impact.skipped) {
      progress?.item?.("source", source.version, { phase: "impact", selected: false, reason: source.impactReason, patchSet: source.patchSet });
    }
  }

  if (args.clean) {
    progress?.start?.("Cleaning generated regression sources", { phase: "cleanup" });
    let cleaned;
    try {
      cleaned = cleanRegressionSources({ regressionDir, sources, filter: args.filter, newest: args.newest, operations });
      const noun = cleaned.length === 1 ? "source" : "sources";
      progress?.succeed?.(`Cleaned ${cleaned.length} generated regression ${noun}`, { phase: "cleanup" });
    } catch (error) {
      progress?.fail?.("Cleaning generated regression sources", { phase: "cleanup" });
      throw error;
    } finally {
      progress?.close?.();
    }
    return {
      ok: true,
      cleanOnly: true,
      sourcesDir,
      regressionDir,
      affectedSince: args.affectedSince,
      impact: impact ? { ...impact, selected: impact.selected, skipped: impact.skipped } : null,
      impactSummary: impact ? impactSummary : null,
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


  if (args.preflightOnly) {
    const results = [];
    for (let index = 0; index < sources.length; index += 1) {
      if (operations.signal?.aborted) break;
      const result = runSourcePreflight(sources[index], {
        operations,
        progress,
        index: index + 1,
        total: sources.length,
      });
      results.push(result);
      if (result.supported && result.ok === false) break;
    }
    const runnableResults = results.filter((result) => result.supported);
    const failedResults = runnableResults.filter((result) => !result.ok);
    const summary = {
      ok: !operations.signal?.aborted && runnableResults.length > 0 && failedResults.length === 0,
      interrupted: Boolean(operations.signal?.aborted),
      preflightOnly: true,
      sourcesDir,
      results,
    };
    const fsImpl = operations.fs || fs;
    fsImpl.mkdirSync(preflightRoot, { recursive: true });
    fsImpl.writeFileSync(preflightSummary, `${JSON.stringify(summary, null, 2)}\n`);
    return { ...summary, regressionDir, preflightSummary };
  }

  const results = [];
  for (let index = 0; index < sources.length; index += 1) {
    if (operations.signal?.aborted) break;
    const activeSource = {
      source: sources[index],
      paths: pathsForSource(regressionDir, sources[index]),
      index: index + 1,
      total: sources.length,
    };
    operations.onSourceStart?.(activeSource);
    let result;
    try {
      result = await runSourceRegression(sources[index], {
        args: runArgs,
        regressionDir,
        operations,
        progress,
        index: index + 1,
        total: sources.length,
      });
    } finally {
      operations.onSourceEnd?.(activeSource);
    }
    results.push(result);
    if (operations.signal?.aborted) break;
    if (result.supported && result.ok === false) break;
  }
  const runnableResults = results.filter((result) => result.supported);
  const failedResults = runnableResults.filter((result) => !result.ok);
  return {
    ok: !operations.signal?.aborted && runnableResults.length > 0 && failedResults.length === 0,
    interrupted: Boolean(operations.signal?.aborted),
    cleanOnly: false,
    sourcesDir,
    regressionDir,
    affectedSince: args.affectedSince,
    impact: impact ? { ...impact, selected: impact.selected, skipped: impact.skipped } : null,
    impactSummary: impact ? impactSummary : null,
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
    result.cleanOnly ? "Regression source cleanup" : result.preflightOnly ? "Regression source preflight" : "Regression source audit",
    `Sources: ${result.sourcesDir}`,
    `Regression output: ${result.regressionDir}`,
  ];
  if (result.filter) lines.push(`Filter: ${result.filter}`);
  if (result.newest != null) lines.push(`Newest: ${result.newest}`);
  if (result.affectedSince) lines.push(`Affected since: ${result.affectedSince}`);
  if (result.impactSummary) lines.push(`Impact summary: ${result.impactSummary}`);
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
    if (entry.targetApp) lines.push(`  Target: ${entry.targetApp}`);
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

function terminateActiveSource(activeSource, {
  listRunningApps = listRunningAuditApps,
  kill = process.kill,
} = {}) {
  if (!activeSource?.paths) return [];
  const apps = listRunningApps({
    targetApp: activeSource.paths.targetApp,
    devHome: activeSource.paths.devHome,
    electronUserDataPath: activeSource.paths.electronUserDataPath,
  });
  for (const app of apps) {
    try {
      kill(-app.pid, "SIGTERM");
    } catch (groupError) {
      try {
        kill(app.pid, "SIGTERM");
      } catch (processError) {
        if (processError.code !== "ESRCH" && groupError.code !== "ESRCH") throw processError;
      }
    }
  }
  return apps.map((app) => app.pid);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(helpText());
    return;
  }
  const controller = new AbortController();
  let activeSource = null;
  const handleInterrupt = () => {
    if (controller.signal.aborted) return;
    controller.abort();
    const terminatedPids = terminateActiveSource(activeSource);
    const context = activeSource?.source ? {
      version: activeSource.source.version,
      bundleVersion: activeSource.source.bundleVersion,
      patchSet: activeSource.source.patchSet,
      sourceIndex: activeSource.index,
      sourceTotal: activeSource.total,
    } : {};
    if (args.jsonl) writeJsonl(process.stdout, jsonlRecord("interrupted", { ...context, terminatedPids }));
    else process.stderr.write("Regression sweep interrupted; cleaning up the active source.\n");
    process.exitCode = 130;
  };
  process.on("SIGINT", handleInterrupt);
  let result;
  try {
    result = await runRegressionSources(args, {
      signal: controller.signal,
      onSourceStart(source) {
        activeSource = source;
      },
      onSourceEnd(source) {
        if (activeSource === source) activeSource = null;
      },
    });
  } finally {
    process.off("SIGINT", handleInterrupt);
  }
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
        impactSummary: result.impactSummary,
      }));
    }
  } else if (args.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else {
    process.stdout.write(formatHumanResult(result));
  }
  if (result.interrupted) process.exitCode = 130;
  else if (!result.ok) process.exitCode = 1;
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
  classifyImpact,
  cleanRegressionDir,
  cleanRegressionSources,
  collectGitImpact,
  compareVersionStrings,
  defaultContractRoot,
  defaultImpactRoot,
  defaultPreflightRoot,
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
  runSourcePreflight,
  selectAffectedSources,
  sourceMatchesFilter,
  terminateActiveSource,
};
