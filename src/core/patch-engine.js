const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const { patchAsar, sha256File } = require("./asar");
const { readPlistValue, replacePlistString, setPlistBuddyValue } = require("./plist");

const ASAR_PATH_IN_BUNDLE = "Contents/Resources/app.asar";

function run(command, args) {
  childProcess.execFileSync(command, args, { stdio: "inherit" });
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

function collectInfoPlistStrings(patchSet) {
  return Object.assign(
    {},
    patchSet.infoPlistStrings || {},
    ...collectPatchQueue(patchSet).map((patch) => patch.infoPlistStrings || {}),
  );
}

function applyPatchSet({ sourceApp, targetApp, patchSet, dryRun = false }) {
  const patchQueue = collectPatchQueue(patchSet);
  const fileTransforms = collectFileTransforms(patchSet);
  if (dryRun) {
    return {
      sourceApp,
      targetApp,
      patchSet: patchSet.id,
      patches: patchQueue.map((patch) => patch.id),
      patchedFiles: fileTransforms.map(([filePath]) => filePath),
      dryRun: true,
    };
  }

  fs.rmSync(targetApp, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(targetApp), { recursive: true });
  run("/usr/bin/ditto", [sourceApp, targetApp]);

  const targetAsar = path.join(targetApp, ASAR_PATH_IN_BUNDLE);
  const patchedAsarSha = patchAsar(targetAsar, fileTransforms);

  const plistPath = path.join(targetApp, "Contents/Info.plist");
  for (const [keyPath, value] of Object.entries(collectInfoPlistStrings(patchSet))) {
    replacePlistString(plistPath, keyPath, value);
  }
  setPlistBuddyValue(plistPath, ":ElectronAsarIntegrity:Resources/app.asar:hash", patchedAsarSha);

  run("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", targetApp]);

  return {
    sourceApp,
    targetApp,
    patchSet: patchSet.id,
    patches: patchQueue.map((patch) => patch.id),
    patchedFiles: fileTransforms.map(([filePath]) => filePath),
    patchedAsarSha,
    dryRun: false,
  };
}

function patchCodexApp({ sourceApp, targetApp, patchSets, dryRun = false }) {
  const identity = getAppIdentity(sourceApp);
  const patchSet = selectPatch(patchSets, identity);
  return applyPatchSet({ sourceApp, targetApp, patchSet, dryRun });
}

module.exports = {
  ASAR_PATH_IN_BUNDLE,
  applyPatchSet,
  collectFileTransforms,
  collectInfoPlistStrings,
  collectPatchQueue,
  getAppIdentity,
  patchCodexApp,
  selectPatch,
};
