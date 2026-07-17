const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const { patchAsar, sha256, sha256File, transformAsarBuffer } = require("./asar");
const { detectSourceFamily, readBundleExecutable, sourceFamilyConfig } = require("./app-identity");
const { readPlistValue, replacePlistString, setPlistBuddyValue } = require("./plist");
const { codexPlusRuntimeAssets } = require("../runtime/assets");

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

function reportItems(progress, itemType, items, extra = {}) {
  for (const item of items) {
    reportProgress(progress, {
      status: "item",
      phase: "apply",
      itemType,
      item,
      ...extra,
    });
  }
}

async function withProgress(progress, step, total, label, action) {
  reportProgress(progress, { status: "start", step, total, label });
  try {
    const result = await action();
    reportProgress(progress, { status: "succeed", step, total, label });
    return result;
  } catch (error) {
    reportProgress(progress, { status: "fail", step, total, label });
    if (!progress?.suppressCommandOutput) {
      if (error.stdout && error.stdout.length > 0) process.stdout.write(error.stdout);
      if (error.stderr && error.stderr.length > 0) process.stderr.write(error.stderr);
    }
    throw error;
  }
}

function getAppIdentity(appPath) {
  const plistPath = path.join(appPath, "Contents/Info.plist");
  const sourceFamily = detectSourceFamily(appPath);
  return {
    version: readPlistValue(plistPath, "CFBundleShortVersionString"),
    bundleVersion: readPlistValue(plistPath, "CFBundleVersion"),
    asarSha256: sha256File(path.join(appPath, ASAR_PATH_IN_BUNDLE)),
    executable: readBundleExecutable(appPath),
    sourceFamily,
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

function validateTransformOwnership(patchSet, fileTransforms) {
  const variantIds = new Set();
  let previousOrder = -1;
  for (const [filePath, transform] of fileTransforms) {
    if (!transform.variantId) throw new Error(`Transform ${transform.name || "anonymous"} for ${filePath} has no variant ID`);
    if (!Array.isArray(transform.owningPatchSetIds) && !transform.ownerPatchSetId) {
      throw new Error(`Transform variant ${transform.variantId} has no declared patch-set owner`);
    }
    const owners = transform.owningPatchSetIds || [transform.ownerPatchSetId];
    if (!owners.includes(patchSet.id)) {
      throw new Error(`Transform variant ${transform.variantId} belongs to ${owners.join(", ")}, not ${patchSet.id}`);
    }
    if (variantIds.has(transform.variantId)) throw new Error(`Duplicate transform variant ${transform.variantId}`);
    variantIds.add(transform.variantId);
    if (!Number.isInteger(transform.transformOrder)) {
      throw new Error(`Transform variant ${transform.variantId} has no declared transform order`);
    }
    if (transform.transformOrder <= previousOrder) {
      throw new Error(`Transform variant ${transform.variantId} is out of order after transform ${previousOrder}`);
    }
    previousOrder = transform.transformOrder;
  }
}

function collectAssetFiles(patchSet) {
  return [
    ...(patchSet.assetFiles || []),
    ...collectPatchQueue(patchSet).flatMap((patch) => patch.assetFiles || []),
  ];
}

function mergeRuntimeConfig(patchSet, runtimeConfig = {}) {
  if (Object.keys(runtimeConfig).length === 0) return patchSet;
  const mergedRuntimeConfig = {
    ...(patchSet.runtimeConfig || {}),
    ...runtimeConfig,
  };
  const codexPlusAssetPaths = new Set(codexPlusRuntimeAssets().map(([filePath]) => filePath));
  const nextAssets = codexPlusRuntimeAssets(mergedRuntimeConfig);
  const patchQueue = collectPatchQueue(patchSet).map((patch) => ({
    ...patch,
    assetFiles: (patch.assetFiles || []).filter(([filePath]) => !codexPlusAssetPaths.has(filePath)),
  }));
  return {
    ...patchSet,
    runtimeConfig: mergedRuntimeConfig,
    assetFiles: [
      ...(patchSet.assetFiles || []).filter(([filePath]) => !codexPlusAssetPaths.has(filePath)),
      ...nextAssets,
    ],
    patches: Array.isArray(patchSet.patches) ? patchQueue : undefined,
  };
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
  const sourceFamily = patchSet.sourceFamily || "codex";
  const familyConfig = sourceFamilyConfig(sourceFamily);
  return {
    patcherRepoUrl: PATCHER_REPO_URL,
    patcherGitSha: readPatcherGitSha(),
    patchSetId: patchSet.id,
    codexVersion: patchSet.codexVersion,
    bundleVersion: patchSet.bundleVersion,
    patchedAppDisplayName: familyConfig.displayName,
    patchedAppBundleIdentifier: familyConfig.bundleIdentifier,
    sourceFamily,
    sourceAsarSha256: patchSet.asarSha256,
    sourceIdentity: {
      version: patchSet.codexVersion,
      bundleVersion: patchSet.bundleVersion,
      asarSha256: patchSet.asarSha256,
      sourceFamily,
    },
    appliedPatches: patchQueue.map((patch) => patch.id),
  };
}

function checkJavaScriptSyntax(source, filePath, operations = {}) {
  const spawnSync = operations.spawnSync || childProcess.spawnSync;
  const result = spawnSync(process.execPath, ["--check", "--input-type=module"], {
    encoding: "utf8",
    input: source,
  });
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "invalid JavaScript").trim().split("\n")[0];
    throw new Error(`Preflight syntax check failed for ${filePath}: ${detail}`);
  }
}

function preflightPatchSet({ sourceApp, identity, patchSet, operations = {}, runtimeConfig = {} }) {
  const selected = selectPatch([patchSet], identity);
  const expectedFamily = selected.sourceFamily || selected.runtimeConfig?.sourceFamily || "codex";
  const actualFamily = identity.sourceFamily || "codex";
  if (actualFamily !== expectedFamily) {
    throw new Error(`Unsupported source family ${actualFamily}; patch set ${selected.id} owns ${expectedFamily}`);
  }

  const effectivePatchSet = mergeRuntimeConfig(selected, runtimeConfig);
  const patchQueue = collectPatchQueue(effectivePatchSet);
  const fileTransforms = collectFileTransforms(effectivePatchSet);
  const assetFiles = collectAssetFiles(effectivePatchSet);
  validateTransformOwnership(effectivePatchSet, fileTransforms);

  const readSourceAsar = operations.readSourceAsar || ((appPath) =>
    fs.readFileSync(path.join(appPath, ASAR_PATH_IN_BUNDLE)));
  const sourceAsar = readSourceAsar(sourceApp);
  const actualAsarSha256 = sha256(sourceAsar);
  if (actualAsarSha256 !== selected.asarSha256) {
    throw new Error(`Original app.asar SHA-256 mismatch: expected ${selected.asarSha256}, got ${actualAsarSha256}`);
  }

  const patchContext = buildPatchContext(effectivePatchSet, patchQueue, operations);
  const transformed = transformAsarBuffer(sourceAsar, fileTransforms, {
    ...patchContext,
    sourceIdentity: { ...identity, sourceFamily: actualFamily },
    assetFiles,
  });
  for (const record of transformed.transformedFiles) {
    if (record.expectedChange && !record.changed) {
      throw new Error(`Transform variant ${record.variantId} did not change ${record.filePath}`);
    }
  }

  for (const filePath of new Set(transformed.transformedFiles.map((record) => record.filePath))) {
    if (!filePath.endsWith(".js")) continue;
    checkJavaScriptSyntax(transformed.contents.get(filePath).toString("utf8"), filePath, operations);
  }

  const requiredAssets = [
    "webview/assets/codex-plus/runtime-manifest.js",
    "webview/assets/codex-plus/api/hostAdapters.js",
  ];
  for (const filePath of requiredAssets) {
    if (!transformed.contents.has(filePath)) throw new Error(`Preflight is missing required runtime asset ${filePath}`);
  }
  const hostAdapters = transformed.contents.get(requiredAssets[1]).toString("utf8");
  if (!hostAdapters.includes("requiredAdapterMethods")) {
    throw new Error("Preflight host-adapter manifest does not declare requiredAdapterMethods");
  }

  return {
    sourceApp,
    sourceIdentity: { ...identity, sourceFamily: actualFamily },
    patchSet: selected.id,
    patches: patchQueue.map((patch) => patch.id),
    transformedFiles: transformed.transformedFiles,
    assetFileCount: assetFiles.length,
    requiredAssets,
    patchedAsarSha256: transformed.sha256,
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
  runtimeConfig = {},
}) {
  const fsImpl = operations.fs || fs;
  const runCommand = operations.run || run;
  const patchAsarFile = operations.patchAsar || patchAsar;
  const replacePlistStringValue = operations.replacePlistString || replacePlistString;
  const setPlistBuddyStringValue = operations.setPlistBuddyValue || setPlistBuddyValue;
  const effectivePatchSet = mergeRuntimeConfig(patchSet, runtimeConfig);
  const patchQueue = collectPatchQueue(effectivePatchSet);
  const fileTransforms = collectFileTransforms(effectivePatchSet);
  const assetFiles = collectAssetFiles(effectivePatchSet);
  validateTransformOwnership(effectivePatchSet, fileTransforms);
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
  const patchContext = buildPatchContext(effectivePatchSet, patchQueue, operations);
  const patchedAsarSha = await withProgress(progress, progressOffset + 3, progressTotal, "Patch app.asar", () =>
    patchAsarFile(targetAsar, fileTransforms, { ...patchContext, assetFiles }),
  );

  const plistPath = path.join(targetApp, "Contents/Info.plist");
  await withProgress(progress, progressOffset + 4, progressTotal, "Update bundle metadata", () => {
    for (const [keyPath, value] of Object.entries(collectInfoPlistStrings(effectivePatchSet))) {
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
    codexVersion: patchSet.codexVersion,
    bundleVersion: patchSet.bundleVersion,
    patches: patchQueue.map((patch) => patch.id),
    patchedFiles: fileTransforms.map(([filePath]) => filePath),
    addedFiles: assetFiles.map(([filePath]) => filePath),
    patchedAsarSha,
    dryRun: false,
  };
}

async function patchCodexApp({ sourceApp, targetApp, patchSets, dryRun = false, progress, operations, runtimeConfig }) {
  const applyProgress = dryRun ? undefined : progress;
  const identity = await withProgress(applyProgress, 1, 8, "Inspect source app", () => getAppIdentity(sourceApp));
  const patchSet = await withProgress(applyProgress, 2, 8, "Select patch set", () => selectPatch(patchSets, identity));
  reportItems(applyProgress, "patch-set", [patchSet.id], {
    patchSet: patchSet.id,
    codexVersion: patchSet.codexVersion,
    bundleVersion: patchSet.bundleVersion,
  });
  reportItems(applyProgress, "patch", collectPatchQueue(patchSet).map((patch) => patch.id), {
    patchSet: patchSet.id,
  });
  return applyPatchSet({
    sourceApp,
    targetApp,
    patchSet,
    dryRun,
    progress: applyProgress,
    progressOffset: 2,
    progressTotal: 8,
    operations,
    runtimeConfig,
  });
}

module.exports = {
  ASAR_PATH_IN_BUNDLE,
  applyPatchSet,
  collectFileTransforms,
  collectAssetFiles,
  collectInfoPlistStrings,
  collectPatchQueue,
  buildPatchContext,
  getPatcherGitSha,
  getAppIdentity,
  mergeRuntimeConfig,
  patchCodexApp,
  preflightPatchSet,
  selectPatch,
};
