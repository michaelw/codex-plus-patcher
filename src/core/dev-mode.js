const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { patchAsar } = require("./asar");
const {
  appExecutablePath,
  detectSourceFamily,
  sourceFamilyConfig,
} = require("./app-identity");
const { replacePlistString, setPlistBuddyValue } = require("./plist");

const ASAR_PATH_IN_BUNDLE = "Contents/Resources/app.asar";
const RUNTIME_MANIFEST_FILE = "webview/assets/codex-plus/runtime-manifest.js";
const DEFAULT_DEV_HOME = path.resolve("work/codex-plus-dev-home");
const DEFAULT_ELECTRON_USER_DATA = path.resolve("work/codex-plus-electron-user-data");
const DEFAULT_DEV_INSTANCE_ID = "dev";
const DEV_MODE_WARNING =
  "Dev mode shares the original Codex worktrees. Use it for UI/plugin validation; do not edit the same checkout from regular Codex and Codex Plus at the same time.";

const COPY_ENTRIES = [
  "config.toml",
  "auth.json",
  ".codex-global-state.json",
  "models_cache.json",
  "version.json",
  "installation_id",
  "history.jsonl",
  "session_index.jsonl",
  "AGENTS.md",
  "rules",
  "skills",
  "plugins",
  "vendor_imports",
  "chrome-native-hosts.json",
  "chrome-native-hosts-v2.json",
  "computer-use/config.json",
];
const ROOT_SQLITE_SNAPSHOT_ENTRIES = ["state_5.sqlite"];
const SQLITE_SNAPSHOT_ENTRIES = ROOT_SQLITE_SNAPSHOT_ENTRIES;
const EXCLUDED_DEV_STATE_ENTRIES = [
  "sqlite",
  "cache",
  "log",
  "tmp",
  "process_manager",
  "generated_images",
  "attachments",
  "shell_snapshots",
];

function isSqlitePath(filePath) {
  const base = path.basename(filePath);
  return base.includes(".sqlite") || base.endsWith(".sqlite-wal") || base.endsWith(".sqlite-shm");
}

function assertSafeDevHome(devHome, sourceHome) {
  const resolvedDevHome = path.resolve(devHome);
  const resolvedSourceHome = path.resolve(sourceHome);
  if (resolvedDevHome === resolvedSourceHome) throw new Error("--dev-home must not be the same as --source-home");
  if (resolvedDevHome === os.homedir() || resolvedDevHome === path.join(os.homedir(), ".codex")) {
    throw new Error("--dev-home must not point at the user's real home or ~/.codex");
  }
}

function copyEntry({ sourceHome, devHome, relativePath, fsImpl = fs }) {
  const source = path.join(sourceHome, relativePath);
  const target = path.join(devHome, relativePath);
  if (!fsImpl.existsSync(source)) return null;
  if (isSqlitePath(source) || relativePath.split(path.sep).includes("sqlite")) return null;
  fsImpl.mkdirSync(path.dirname(target), { recursive: true });
  fsImpl.rmSync(target, { recursive: true, force: true });
  fsImpl.cpSync(source, target, { recursive: true, force: true, dereference: false });
  return relativePath;
}

function scrubDevGlobalState(devHome, fsImpl = fs) {
  const statePath = path.join(devHome, ".codex-global-state.json");
  if (!fsImpl.existsSync(statePath)) return false;
  const state = JSON.parse(fsImpl.readFileSync(statePath, "utf8"));
  const atomState = state["electron-persisted-atom-state"];
  if (atomState == null || typeof atomState !== "object") return false;
  if (!Object.prototype.hasOwnProperty.call(atomState, "composer-prompt-drafts-v1")) return false;
  delete atomState["composer-prompt-drafts-v1"];
  fsImpl.writeFileSync(statePath, `${JSON.stringify(state)}\n`);
  return true;
}

function cleanExcludedDevState(devHome, fsImpl = fs) {
  for (const relativePath of EXCLUDED_DEV_STATE_ENTRIES) {
    fsImpl.rmSync(path.join(devHome, relativePath), { recursive: true, force: true });
  }
  if (!fsImpl.existsSync(devHome)) return;
  for (const entry of fsImpl.readdirSync(devHome)) {
    if (isSqlitePath(entry) || entry.endsWith(".db")) {
      fsImpl.rmSync(path.join(devHome, entry), { recursive: true, force: true });
    }
  }
}

function sqliteLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function snapshotSqlite({ sourceHome, devHome, relativePath, sourceRelativePath = relativePath, fsImpl = fs, execFileSync = childProcess.execFileSync }) {
  const source = path.join(sourceHome, sourceRelativePath);
  const target = path.join(devHome, relativePath);
  if (!fsImpl.existsSync(source)) return null;
  fsImpl.mkdirSync(path.dirname(target), { recursive: true });
  fsImpl.rmSync(target, { force: true });
  fsImpl.rmSync(`${target}-wal`, { force: true });
  fsImpl.rmSync(`${target}-shm`, { force: true });
  execFileSync("sqlite3", [source, `VACUUM INTO ${sqliteLiteral(target)}`], { stdio: "pipe" });
  return relativePath;
}

function isSnapshotDatabaseName(name) {
  return (name.endsWith(".sqlite") || name.endsWith(".db")) &&
    !name.endsWith("-wal") &&
    !name.endsWith("-shm");
}

function canSnapshotSqlite(filePath, execFileSync = childProcess.execFileSync) {
  try {
    execFileSync("sqlite3", [filePath, "pragma schema_version;"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function discoverNestedSqliteSnapshots({ sourceHome, fsImpl = fs, execFileSync = childProcess.execFileSync }) {
  const sqliteDir = path.join(sourceHome, "sqlite");
  if (!fsImpl.existsSync(sqliteDir)) return [];
  return fsImpl.readdirSync(sqliteDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isSnapshotDatabaseName(entry.name))
    .filter((entry) => entry.name !== "codex-dev.db")
    .map((entry) => path.join("sqlite", entry.name))
    .filter((relativePath) => canSnapshotSqlite(path.join(sourceHome, relativePath), execFileSync))
    .sort();
}

function linkSharedDirectory({ sourceHome, devHome, relativePath, fsImpl = fs }) {
  const source = path.join(sourceHome, relativePath);
  const target = path.join(devHome, relativePath);
  fsImpl.rmSync(target, { recursive: true, force: true });
  if (!fsImpl.existsSync(source)) return null;
  fsImpl.symlinkSync(source, target, "dir");
  return { source, target };
}

function syncDevHome({
  sourceHome = path.join(os.homedir(), ".codex"),
  devHome = DEFAULT_DEV_HOME,
  fsImpl = fs,
  execFileSync = childProcess.execFileSync,
} = {}) {
  const resolvedSourceHome = path.resolve(sourceHome);
  const resolvedDevHome = path.resolve(devHome);
  assertSafeDevHome(resolvedDevHome, resolvedSourceHome);

  fsImpl.mkdirSync(resolvedDevHome, { recursive: true });
  cleanExcludedDevState(resolvedDevHome, fsImpl);

  const copied = [];
  for (const relativePath of COPY_ENTRIES) {
    const copiedPath = copyEntry({
      sourceHome: resolvedSourceHome,
      devHome: resolvedDevHome,
      relativePath,
      fsImpl,
    });
    if (copiedPath) copied.push(copiedPath);
  }
  const scrubbedGlobalState = scrubDevGlobalState(resolvedDevHome, fsImpl);

  const sqliteSnapshots = [];
  const sqliteSnapshotEntries = [
    ...ROOT_SQLITE_SNAPSHOT_ENTRIES,
    ...discoverNestedSqliteSnapshots({
      sourceHome: resolvedSourceHome,
      fsImpl,
      execFileSync,
    }),
  ];
  for (const entry of sqliteSnapshotEntries) {
    const relativePath = typeof entry === "string" ? entry : entry.relativePath;
    const snapshotPath = snapshotSqlite({
      sourceHome: resolvedSourceHome,
      devHome: resolvedDevHome,
      relativePath,
      sourceRelativePath: typeof entry === "string" ? relativePath : entry.sourceRelativePath,
      fsImpl,
      execFileSync,
    });
    if (snapshotPath) sqliteSnapshots.push(snapshotPath);
  }

  const worktrees = linkSharedDirectory({
    sourceHome: resolvedSourceHome,
    devHome: resolvedDevHome,
    relativePath: "worktrees",
    fsImpl,
  });
  const sessions = linkSharedDirectory({
    sourceHome: resolvedSourceHome,
    devHome: resolvedDevHome,
    relativePath: "sessions",
    fsImpl,
  });

  return {
    sourceHome: resolvedSourceHome,
    devHome: resolvedDevHome,
    copied,
    scrubbedGlobalState,
    sqliteSnapshots,
    worktrees,
    sessions,
    warning: DEV_MODE_WARNING,
  };
}

function sanitizeDevInstanceId(devInstanceId) {
  if (devInstanceId == null || devInstanceId === "") return null;
  const sanitized = String(devInstanceId)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!sanitized) throw new Error("--dev-instance-id must contain at least one letter or number");
  return sanitized;
}

function devBundleIdentity(devInstanceId, sourceFamily = "codex") {
  const sanitized = sanitizeDevInstanceId(devInstanceId);
  if (!sanitized) return null;
  const family = sourceFamilyConfig(sourceFamily);
  return {
    id: sanitized,
    bundleIdentifier: `${family.bundleIdentifier}.${sanitized}`,
    displayName: `${family.displayName} (${sanitized})`,
    name: `${family.displayName} ${sanitized}`,
  };
}

function buildLaunchDev({
  targetApp,
  devHome = DEFAULT_DEV_HOME,
  electronUserDataPath = DEFAULT_ELECTRON_USER_DATA,
  remoteDebuggingPort,
  devInstanceId = DEFAULT_DEV_INSTANCE_ID,
} = {}) {
  if (!targetApp) throw new Error("--target is required");
  const sourceFamily = detectSourceFamily(targetApp);
  let appBinary;
  try {
    appBinary = appExecutablePath(targetApp);
  } catch {
    appBinary = path.join(path.resolve(targetApp), "Contents/MacOS", sourceFamilyConfig(sourceFamily).executable);
  }
  const resolvedDevHome = path.resolve(devHome);
  const resolvedElectronUserDataPath = path.resolve(electronUserDataPath);
  const instanceIdentity = devBundleIdentity(devInstanceId, sourceFamily);
  const args = [`--user-data-dir=${resolvedElectronUserDataPath}`, "--use-mock-keychain"];
  if (remoteDebuggingPort != null) args.push(`--remote-debugging-port=${remoteDebuggingPort}`);
  return {
    command: appBinary,
    args,
    env: {
      CODEX_HOME: resolvedDevHome,
      CODEX_ELECTRON_USER_DATA_PATH: resolvedElectronUserDataPath,
    },
    instanceIdentity,
    warning: DEV_MODE_WARNING,
  };
}

function markDevRuntimeConfig(targetApp, { patchAsarImpl = patchAsar, setPlistBuddyValueImpl = setPlistBuddyValue } = {}) {
  const target = path.resolve(targetApp);
  const asarPath = path.join(target, ASAR_PATH_IN_BUNDLE);
  const patchedAsarSha = patchAsarImpl(asarPath, [
    [RUNTIME_MANIFEST_FILE, (text) => {
      const match = text.match(/^window\.__CodexPlusRuntimeConfig=({.*?});/);
      if (!match) throw new Error("Could not find Codex Plus runtime config in runtime manifest");
      const config = JSON.parse(match[1]);
      config.devModeStatsigFallback = true;
      return text.replace(match[0], `window.__CodexPlusRuntimeConfig=${JSON.stringify(config)};`);
    }],
  ]);
  setPlistBuddyValueImpl(
    path.join(target, "Contents/Info.plist"),
    ":ElectronAsarIntegrity:Resources/app.asar:hash",
    patchedAsarSha,
  );
  return { asar: asarPath, patchedAsarSha };
}

function signDevApp(targetApp, execFileSync = childProcess.execFileSync) {
  execFileSync("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", path.resolve(targetApp)], { stdio: "pipe" });
  return { signed: true };
}

function markDevBundleIdentity(
  targetApp,
  devInstanceId = DEFAULT_DEV_INSTANCE_ID,
  { replacePlistStringImpl = replacePlistString } = {},
) {
  const identity = devBundleIdentity(devInstanceId, detectSourceFamily(targetApp));
  if (!identity) return null;
  const plistPath = path.join(path.resolve(targetApp), "Contents/Info.plist");
  replacePlistStringImpl(plistPath, "CFBundleIdentifier", identity.bundleIdentifier);
  replacePlistStringImpl(plistPath, "CFBundleDisplayName", identity.displayName);
  replacePlistStringImpl(plistPath, "CFBundleName", identity.name);
  return identity;
}

function launchDevApp({
  spawn = childProcess.spawn,
  env = process.env,
  platform = process.platform,
  markDevRuntimeConfigImpl = markDevRuntimeConfig,
  markDevBundleIdentityImpl = markDevBundleIdentity,
  signDevAppImpl = signDevApp,
  ...options
} = {}) {
  const directLaunch = buildLaunchDev(options);
  const launch = directLaunch;
  fs.mkdirSync(launch.env.CODEX_HOME, { recursive: true });
  fs.mkdirSync(launch.env.CODEX_ELECTRON_USER_DATA_PATH, { recursive: true });
  const devRuntimeConfig = markDevRuntimeConfigImpl(options.targetApp);
  const devBundle = markDevBundleIdentityImpl(options.targetApp, options.devInstanceId);
  const devSignature = signDevAppImpl(options.targetApp);
  const startupLogPath = options.startupLogPath ? path.resolve(options.startupLogPath) : null;
  let startupLogFd = null;
  if (startupLogPath) {
    fs.mkdirSync(path.dirname(startupLogPath), { recursive: true });
    startupLogFd = fs.openSync(startupLogPath, "a");
  }
  let child;
  try {
    child = spawn(launch.command, launch.args, {
      // Keep the direct Electron process independent of the audit CLI. In
      // particular, --keep-open must survive after the CLI writes its result.
      detached: true,
      env: { ...env, ...launch.env },
      stdio: startupLogFd == null ? "ignore" : ["ignore", startupLogFd, startupLogFd],
    });
  } finally {
    if (startupLogFd != null) fs.closeSync(startupLogFd);
  }
  child.unref();
  return {
    ...launch,
    targetApp: path.resolve(options.targetApp),
    devHome: launch.env.CODEX_HOME,
    electronUserDataPath: launch.env.CODEX_ELECTRON_USER_DATA_PATH,
    devRuntimeConfig,
    devBundle,
    devSignature,
    startupLogPath,
    pid: child.pid,
  };
}

function formatSyncDevHomeResult(result) {
  const lines = [
    "Codex Plus dev home synced.",
    `Source home: ${result.sourceHome}`,
    `Dev home: ${result.devHome}`,
    `Copied: ${result.copied.length === 0 ? "(none)" : result.copied.join(", ")}`,
    `Scrubbed writable state: ${result.scrubbedGlobalState ? "composer prompt drafts" : "(none)"}`,
    `SQLite snapshots: ${result.sqliteSnapshots?.length ? result.sqliteSnapshots.join(", ") : "(none)"}`,
    result.worktrees ? `Worktrees: ${result.worktrees.target} -> ${result.worktrees.source}` : "Worktrees: (missing)",
    result.sessions ? `Sessions: ${result.sessions.target} -> ${result.sessions.source}` : "Sessions: (missing)",
    `Warning: ${result.warning}`,
  ];
  return `${lines.join("\n")}\n`;
}

function formatLaunchDevResult(result) {
  const lines = [
    "Codex Plus dev app launched.",
    `Command: ${result.command}`,
    `Args: ${result.args.length === 0 ? "(none)" : result.args.join(" ")}`,
    `CODEX_HOME: ${result.env.CODEX_HOME}`,
    `CODEX_ELECTRON_USER_DATA_PATH: ${result.env.CODEX_ELECTRON_USER_DATA_PATH}`,
  ];
  if (result.pid != null) lines.push(`PID: ${result.pid}`);
  if (result.instanceIdentity) lines.push(`Bundle identity: ${result.instanceIdentity.bundleIdentifier}`);
  lines.push(`Warning: ${result.warning}`);
  return `${lines.join("\n")}\n`;
}

module.exports = {
  COPY_ENTRIES,
  DEFAULT_DEV_HOME,
  DEFAULT_DEV_INSTANCE_ID,
  DEFAULT_ELECTRON_USER_DATA,
  DEV_MODE_WARNING,
  SQLITE_SNAPSHOT_ENTRIES,
  ROOT_SQLITE_SNAPSHOT_ENTRIES,
  buildLaunchDev,
  devBundleIdentity,
  formatLaunchDevResult,
  formatSyncDevHomeResult,
  launchDevApp,
  markDevBundleIdentity,
  markDevRuntimeConfig,
  sanitizeDevInstanceId,
  signDevApp,
  syncDevHome,
};
