const fs = require("node:fs");
const path = require("node:path");

const runtimeRoot = __dirname;
const runtimeFiles = [
  ["webview/assets/codex-plus/runtime.js", "runtime.js"],
  ["webview/assets/codex-plus/plugins/aboutMetadata.js", "plugins/aboutMetadata.js"],
  ["webview/assets/codex-plus/plugins/nestedRepositories.js", "plugins/nestedRepositories.js"],
  ["webview/assets/codex-plus/plugins/diagnosticErrors.js", "plugins/diagnosticErrors.js"],
  ["webview/assets/codex-plus/plugins/userBubbleColors.js", "plugins/userBubbleColors.js"],
  ["webview/assets/codex-plus/plugins/projectColors.js", "plugins/projectColors.js"],
  ["webview/assets/codex-plus/plugins/sidebarNameBlur.js", "plugins/sidebarNameBlur.js"],
];

function codexPlusRuntimeAssets() {
  return runtimeFiles.map(([asarPath, localPath]) => [
    asarPath,
    fs.readFileSync(path.join(runtimeRoot, localPath), "utf8"),
  ]);
}

module.exports = {
  codexPlusRuntimeAssets,
  runtimeFiles,
};
