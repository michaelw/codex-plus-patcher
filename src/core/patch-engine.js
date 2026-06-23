const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const { patchAsar, sha256File } = require("./asar");
const { readPlistValue, replacePlistString, setPlistBuddyValue } = require("./plist");

const ASAR_PATH_IN_BUNDLE = "Contents/Resources/app.asar";
const PATCHER_REPO_URL = "https://github.com/michaelw/codex-plus-patcher";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(command, args, { stdio: ["inherit", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      const error = new Error(`${command} failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}`);
      error.stdout = Buffer.concat(stdout);
      error.stderr = Buffer.concat(stderr);
      reject(error);
    });
  });
}

function reportProgress(progress, event) {
  if (progress) progress(event);
}

async function withProgress(progress, step, total, label, action) {
  reportProgress(progress, { status: "start", step, total, label });
  try {
    const result = await action();
    reportProgress(progress, { status: "succeed", step, total, label });
    return result;
  } catch (error) {
    reportProgress(progress, { status: "fail", step, total, label });
    if (error.stdout && error.stdout.length > 0) process.stdout.write(error.stdout);
    if (error.stderr && error.stderr.length > 0) process.stderr.write(error.stderr);
    throw error;
  }
}

function getAppIdentity(appPath) {
  const plistPath = path.join(appPath, "Contents/Info.plist");
  return {
    version: readPlistValue(plistPath, "CFBundleShortVersionString"),
    bundleVersion: readPlistValue(plistPath, "CFBundleVersion"),
    asarSha256: sha256File(path.join(appPath, ASAR_PATH_IN_BUNDLE)),
  };
}

function selectPatch(patchSets, identity) {
  const selected = patchSets.find(
    (patchSet) =>
      patchSet.codexVersion === identity.version &&
      patchSet.bundleVersion === identity.bundleVersion &&
      patchSet.asarSha256 === identity.asarSha256,
  );
  if (!selected) {
    const supported = patchSets
      .map((patchSet) => `${patchSet.codexVersion} (${patchSet.bundleVersion}) ${patchSet.asarSha256}`)
      .join("\n");
    throw new Error(
      `Unsupported Codex.app ${identity.version} (${identity.bundleVersion}) ${identity.asarSha256}\nSupported:\n${supported}`,
    );
  }
  return selected;
}

function collectPatchQueue(patchSet) {
  if (Array.isArray(patchSet.patches)) return patchSet.patches;
  return [
    {
      id: patchSet.id,
      infoPlistStrings: patchSet.infoPlistStrings || {},
      fileTransforms: patchSet.fileTransforms || [],
    },
  ];
}

function collectFileTransforms(patchSet) {
  return collectPatchQueue(patchSet).flatMap((patch) => patch.fileTransforms || []);
}

function collectAssetFiles(patchSet) {
  return [
    ...(patchSet.assetFiles || []),
    ...collectPatchQueue(patchSet).flatMap((patch) => patch.assetFiles || []),
  ];
}

function collectInfoPlistStrings(patchSet) {
  return Object.assign(
    {},
    patchSet.infoPlistStrings || {},
    ...collectPatchQueue(patchSet).map((patch) => patch.infoPlistStrings || {}),
  );
}

function getPatcherGitSha({ cwd = path.resolve(__dirname, "../.."), execFileSync = childProcess.execFileSync } = {}) {
  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || "unknown";
  } catch {
    return "unknown";
  }
}

function buildPatchContext(patchSet, patchQueue, operations = {}) {
  const readPatcherGitSha = operations.getPatcherGitSha || (() => getPatcherGitSha());
  return {
    patcherRepoUrl: PATCHER_REPO_URL,
    patcherGitSha: readPatcherGitSha(),
    patchSetId: patchSet.id,
    codexVersion: patchSet.codexVersion,
    bundleVersion: patchSet.bundleVersion,
    sourceAsarSha256: patchSet.asarSha256,
    appliedPatches: patchQueue.map((patch) => patch.id),
  };
}

async function applyPatchSet({
  sourceApp,
  targetApp,
  patchSet,
  dryRun = false,
  progress,
  progressOffset = 0,
  progressTotal = 6,
  operations = {},
}) {
  const fsImpl = operations.fs || fs;
  const runCommand = operations.run || run;
  const patchAsarFile = operations.patchAsar || patchAsar;
  const replacePlistStringValue = operations.replacePlistString || replacePlistString;
  const setPlistBuddyStringValue = operations.setPlistBuddyValue || setPlistBuddyValue;
  const patchQueue = collectPatchQueue(patchSet);
  const fileTransforms = collectFileTransforms(patchSet);
  const assetFiles = collectAssetFiles(patchSet);
  if (dryRun) {
    return {
      sourceApp,
      targetApp,
      patchSet: patchSet.id,
      patches: patchQueue.map((patch) => patch.id),
      patchedFiles: fileTransforms.map(([filePath]) => filePath),
      addedFiles: assetFiles.map(([filePath]) => filePath),
      dryRun: true,
    };
  }

  await withProgress(progress, progressOffset + 1, progressTotal, "Prepare target app", () => {
    fsImpl.rmSync(targetApp, { recursive: true, force: true });
    fsImpl.mkdirSync(path.dirname(targetApp), { recursive: true });
  });

  await withProgress(progress, progressOffset + 2, progressTotal, "Copy app bundle", () =>
    runCommand("/usr/bin/ditto", [sourceApp, targetApp]),
  );

  const targetAsar = path.join(targetApp, ASAR_PATH_IN_BUNDLE);
  const patchContext = buildPatchContext(patchSet, patchQueue, operations);
  const patchedAsarSha = await withProgress(progress, progressOffset + 3, progressTotal, "Patch app.asar", () =>
    patchAsarFile(targetAsar, fileTransforms, { ...patchContext, assetFiles }),
  );

  const plistPath = path.join(targetApp, "Contents/Info.plist");
  await withProgress(progress, progressOffset + 4, progressTotal, "Update bundle metadata", () => {
    for (const [keyPath, value] of Object.entries(collectInfoPlistStrings(patchSet))) {
      replacePlistStringValue(plistPath, keyPath, value);
    }
    setPlistBuddyStringValue(plistPath, ":ElectronAsarIntegrity:Resources/app.asar:hash", patchedAsarSha);
  });

  await withProgress(progress, progressOffset + 5, progressTotal, "Sign copied app", () =>
    runCommand("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", targetApp]),
  );

  await withProgress(progress, progressOffset + 6, progressTotal, "Finish", () => {});

  return {
    sourceApp,
    targetApp,
    patchSet: patchSet.id,
    patches: patchQueue.map((patch) => patch.id),
    patchedFiles: fileTransforms.map(([filePath]) => filePath),
    addedFiles: assetFiles.map(([filePath]) => filePath),
    patchedAsarSha,
    dryRun: false,
  };
}

async function patchCodexApp({ sourceApp, targetApp, patchSets, dryRun = false, progress, operations }) {
  const applyProgress = dryRun ? undefined : progress;
  const identity = await withProgress(applyProgress, 1, 8, "Inspect source app", () => getAppIdentity(sourceApp));
  const patchSet = await withProgress(applyProgress, 2, 8, "Select patch set", () => selectPatch(patchSets, identity));
  return applyPatchSet({
    sourceApp,
    targetApp,
    patchSet,
    dryRun,
    progress: applyProgress,
    progressOffset: 2,
    progressTotal: 8,
    operations,
  });
}

module.exports = {
  ASAR_PATH_IN_BUNDLE,
  applyPatchSet,
  collectFileTransforms,
  collectAssetFiles,
  collectInfoPlistStrings,
  collectPatchQueue,
  getPatcherGitSha,
  getAppIdentity,
  patchCodexApp,
  selectPatch,
};
