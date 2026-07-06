const fs = require("node:fs");
const path = require("node:path");

const runtimeRoot = __dirname;
const browserRuntimeFiles = [
  "api/index.js",
  "api/diagnostics.js",
  "api/modules.js",
  "api/settings.js",
  "api/patches.js",
  "api/commands.js",
  "api/styles.js",
  "api/sidebar.js",
  "api/message.js",
  "api/routeContext.js",
  "api/composer.js",
  "api/about.js",
  "api/review.js",
  "api/native.js",
  "api/errors.js",
  "api/threadHeader.js",
  "api/mermaid.js",
  "api/virtualConversations.js",
  "api/interactions.js",
  "api/chatRows.js",
  "api/threadSidePanel.js",
  "api/sidePanel.js",
  "host/review.js",
  "host/sidebar.js",
  "host/messageComposer.js",
  "host/projectSelector.js",
  "host/threadHeader.js",
  "vendor/fzf.umd.js",
  "plugins/aboutMetadata.js",
  "plugins/nestedRepositories.js",
  "plugins/diagnosticErrors.js",
  "plugins/userBubbleColors.js",
  "plugins/projectColors.js",
  "plugins/projectPathHeader.js",
  "plugins/sidebarNameBlur.js",
  "plugins/devTools.js",
  "plugins/projectSelectorShortcut.js",
  "plugins/mermaidFullscreen.js",
];

function fzfRuntimeAssetPath() {
  return require.resolve("fzf");
}

function runtimeAssetPath(filePath) {
  return filePath.startsWith("vendor/") ? fzfRuntimeAssetPath() : path.join(runtimeRoot, filePath);
}

const nodeRuntimeFiles = [
  [".vite/build/codex-plus-aboutMetadata.js", "plugins/aboutMetadata.js"],
  [".vite/build/codex-plus-native-main.js", "host/nativeMain.js"],
  [".vite/build/codex-plus-worker.js", "host/worker.js"],
  ["webview/assets/codex-plus/runtime.js", "runtime.js"],
];

const browserRuntimeAssets = browserRuntimeFiles.map((filePath) => [
  `webview/assets/codex-plus/${filePath}`,
  filePath,
]);

const runtimeFiles = [
  ...nodeRuntimeFiles,
  ["webview/assets/codex-plus/runtime-manifest.js", null],
  ...browserRuntimeAssets,
];

function browserRuntimeManifest(config = {}) {
  return `window.__CodexPlusRuntimeConfig=${JSON.stringify(config)};window.__CodexPlusRuntimeFiles=${JSON.stringify(browserRuntimeFiles)};window.__CodexPlusLoadRuntimeFiles?.(window.__CodexPlusRuntimeFiles);\n`;
}

function codexPlusRuntimeAssets(config = {}) {
  return runtimeFiles.map(([asarPath, localPath]) => {
    const content = localPath == null ? browserRuntimeManifest(config) : fs.readFileSync(runtimeAssetPath(localPath), "utf8");
    return [asarPath, content];
  });
}

module.exports = {
  browserRuntimeFiles,
  codexPlusRuntimeAssets,
  fzfRuntimeAssetPath,
  runtimeFiles,
};
