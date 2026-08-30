const path = require("node:path");

const MANIFEST_KEYS = new Set([
  "anchors", "appDisplayName", "asarSha256", "bundleIdentifier", "bundleVersion", "codexVersion",
  "enabledPatches", "files", "id", "runtimeConfig", "sourceFamily", "unchangedTransformVariants",
]);
const FILE_KEYS = new Set([
  "appMain", "appProtocol", "appShell", "branchPickerDropdownContent", "chatGptStartupAnnouncements",
  "commandMenuRuntime", "composer", "composerPrimitive", "electronCommandSource", "electronMenuShortcuts",
  "errorBoundary", "generalSettings", "header", "homeProjectDropdown", "keyboardShortcutsSearchInput",
  "keyboardShortcutsTitleFallback", "localActiveWorkspaceRootDropdown", "localConversationPage", "localTaskRow",
  "localThreadCatalogState", "main", "mermaidDiagramShell", "reviewDiffRuntime", "reviewPanel", "runCommand",
  "runCommandExtra", "runCommandInUserMessageAttachments", "sidebarProjectHoverCardSourceRows", "sidebarThreadKeys", "sidebarThreadRowSignals", "src",
  "statsigStartup", "terminal", "threadContext", "threadHeaderActionShell", "threadPageHeader",
  "threadSidePanelCore", "threadSidePanelTabs", "threadTitle", "userMessageAttachments",
]);
const ANCHOR_KEYS = new Set([
  "composerProjectAccentCaller", "composerProjectImports", "composerProjectStyleCaller", "terminalConstruction", "title",
]);

function rejectUnknownKeys(value, allowed, label) {
  for (const key of Object.keys(value || {})) {
    if (!allowed.has(key)) throw new Error(`Unknown ${label} key ${key}`);
  }
}

function validateStringArray(value, label) {
  if (value == null) return;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry === "")) {
    throw new Error(`${label} must be an array of non-empty strings`);
  }
  if (new Set(value).size !== value.length) throw new Error(`${label} contains duplicates`);
}

function validatePatchManifestConfig(config) {
  if (config == null || typeof config !== "object" || Array.isArray(config)) throw new Error("Patch manifest config must be an object");
  rejectUnknownKeys(config, MANIFEST_KEYS, "patch manifest");
  const sourceFamily = config.sourceFamily || "codex";
  if (!new Set(["chatgpt", "codex"]).has(sourceFamily)) throw new Error(`Unsupported patch source family ${sourceFamily}`);
  if (!/^\d+\.\d+\.\d+$/.test(config.codexVersion || "")) throw new Error(`Invalid patch version ${config.codexVersion}`);
  if (!/^\d+$/.test(config.bundleVersion || "")) throw new Error(`Invalid patch bundle version ${config.bundleVersion}`);
  if (!/^[0-9a-f]{64}$/.test(config.asarSha256 || "")) throw new Error(`Invalid patch ASAR SHA-256 ${config.asarSha256}`);
  const expectedId = `${sourceFamily}-${config.codexVersion}-${config.bundleVersion}`;
  if (config.id !== expectedId) throw new Error(`Patch manifest ID ${config.id} does not match ${expectedId}`);

  rejectUnknownKeys(config.files, FILE_KEYS, "patch file mapping");
  const sourceFiles = [];
  for (const [key, value] of Object.entries(config.files || {})) {
    if (key === "runCommandInUserMessageAttachments") {
      if (typeof value !== "boolean") throw new Error(`${key} must be boolean`);
      continue;
    }
    if (value == null) continue;
    if (typeof value !== "string") throw new Error(`Patch file mapping ${key} must be a string or null`);
    const archivePath = value.startsWith(".vite/build/") || value.startsWith("webview/");
    const importedAssetName = new Set([
      "branchPickerDropdownContent", "reviewDiffRuntime", "sidebarThreadKeys", "sidebarThreadRowSignals", "src",
    ]).has(key) &&
      /^[A-Za-z0-9_.~-]+\.js$/.test(value);
    if (path.isAbsolute(value) || value.includes("\\") || value.split("/").includes("..") ||
        (!archivePath && !importedAssetName)) {
      throw new Error(`Unsafe patch file mapping ${key}: ${value}`);
    }
    if (archivePath) sourceFiles.push(value);
  }

  rejectUnknownKeys(config.anchors, ANCHOR_KEYS, "patch anchor");
  for (const [key, value] of Object.entries(config.anchors || {})) {
    if (value != null && typeof value !== "string") throw new Error(`Patch anchor ${key} must be a string or null`);
  }
  validateStringArray(config.enabledPatches, "enabledPatches");
  validateStringArray(config.unchangedTransformVariants, "unchangedTransformVariants");
  return { sourceFamily, sourceFiles: [...new Set(sourceFiles)] };
}

function validatePatchSetRegistry(patchSets) {
  const ids = new Set();
  const identities = new Set();
  for (const patchSet of patchSets) {
    if (ids.has(patchSet.id)) throw new Error(`Duplicate patch set ID ${patchSet.id}`);
    ids.add(patchSet.id);
    const identity = [patchSet.sourceFamily || "codex", patchSet.codexVersion, patchSet.bundleVersion, patchSet.asarSha256].join(":");
    if (identities.has(identity)) throw new Error(`Duplicate patch source identity ${identity}`);
    identities.add(identity);
  }
  return patchSets;
}

module.exports = {
  ANCHOR_KEYS,
  FILE_KEYS,
  MANIFEST_KEYS,
  validatePatchManifestConfig,
  validatePatchSetRegistry,
};
