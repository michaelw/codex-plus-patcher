const fs = require("node:fs");
const path = require("node:path");

const runtimeRoot = __dirname;
const browserRuntimeFiles = [
  "api/index.js",
  "api/hostAdapters.js",
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
  "host/threadSidePanel.js",
  "host/coreAdapters.js",
  "host/review.js",
  "host/sidebar.js",
  "host/messageComposer.js",
  "host/projectSelector.js",
  "host/threadHeader.js",
  "host/preflight.js",
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
  "plugins/aharnessRuns.js",
];

function fzfRuntimeAssetPath() {
  return require.resolve("fzf");
}

function runtimeAssetPath(filePath) {
  return filePath.startsWith("vendor/") ? fzfRuntimeAssetPath() : path.join(runtimeRoot, filePath);
}

const nodeRuntimeFiles = [
  [".vite/build/aharnessService.js", "host/aharnessService.js"],
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

function packageDirectory(nodeModulesRoot, packageName) {
  return path.join(nodeModulesRoot, ...packageName.split("/"));
}

function readPackageJson(packageDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf8"));
  } catch {
    return null;
  }
}

function aharnessRuntimePackageNames() {
  const nodeModulesRoot = path.resolve(runtimeRoot, "..", "..", "node_modules");
  const seen = new Set();
  const queue = ["@aharness/core"];
  for (let index = 0; index < queue.length; index += 1) {
    const packageName = queue[index];
    if (seen.has(packageName)) continue;
    const packageDir = packageDirectory(nodeModulesRoot, packageName);
    const packageJson = readPackageJson(packageDir);
    if (!packageJson) continue;
    seen.add(packageName);
    for (const dependencyName of Object.keys({
      ...(packageJson.dependencies || {}),
      ...(packageJson.optionalDependencies || {}),
    })) {
      if (fs.existsSync(packageDirectory(nodeModulesRoot, dependencyName))) queue.push(dependencyName);
    }
  }
  return Array.from(seen).sort();
}

function walkFiles(root, relativeDir = "") {
  const dir = path.join(root, relativeDir);
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === ".git") continue;
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(root, relativePath));
    else if (entry.isFile()) files.push(relativePath);
  }
  return files;
}

function fileIsInPackagePayload(packageJson, relativePath) {
  if (relativePath === "package.json") return true;
  if (!Array.isArray(packageJson?.files) || packageJson.files.length === 0) return true;
  const normalized = relativePath.split(path.sep).join("/");
  return packageJson.files.some((entry) => {
    const prefix = String(entry).replace(/^\.?\//, "").replace(/\/$/, "");
    if (prefix.includes("*")) {
      const pattern = new RegExp(`^${prefix.split("*").map((part) => part.replace(/[|\\{}()[\]^$+?.]/g, "\\$&")).join("[^/]*")}$`);
      return pattern.test(normalized);
    }
    return normalized === prefix || normalized.startsWith(`${prefix}/`);
  });
}

function aharnessRuntimeAssets() {
  const nodeModulesRoot = path.resolve(runtimeRoot, "..", "..", "node_modules");
  return aharnessRuntimePackageNames().flatMap((packageName) => {
    const packageDir = packageDirectory(nodeModulesRoot, packageName);
    const packageJson = readPackageJson(packageDir);
    const unpacked = packageName.startsWith("@esbuild/");
    return walkFiles(packageDir).filter((relativePath) => fileIsInPackagePayload(packageJson, relativePath)).map((relativePath) => [
      path.posix.join(".vite/build/node_modules", ...packageName.split("/"), ...relativePath.split(path.sep)),
      fs.readFileSync(path.join(packageDir, relativePath)),
      unpacked ? { unpacked: true, mode: fs.statSync(path.join(packageDir, relativePath)).mode & 0o777 } : undefined,
    ]);
  });
}

function disabledRuntimePluginPaths(config = {}) {
  return new Set((config.runtimePluginsDisabled || []).map((pluginId) => `plugins/${pluginId}.js`));
}

function browserRuntimeFilesForConfig(config = {}) {
  const disabled = disabledRuntimePluginPaths(config);
  return browserRuntimeFiles.filter((filePath) => !disabled.has(filePath));
}

function browserRuntimeManifest(config = {}) {
  return `window.__CodexPlusRuntimeConfig=${JSON.stringify(config)};window.__CodexPlusRuntimeFiles=${JSON.stringify(browserRuntimeFilesForConfig(config))};window.__CodexPlusLoadRuntimeFiles?.(window.__CodexPlusRuntimeFiles);\n`;
}

function codexPlusRuntimeAssets(config = {}) {
  const staticAssets = runtimeFiles.map(([asarPath, localPath]) => {
    const content = localPath == null ? browserRuntimeManifest(config) : fs.readFileSync(runtimeAssetPath(localPath), "utf8");
    return [asarPath, content];
  });
  return [...staticAssets, ...aharnessRuntimeAssets()];
}

module.exports = {
  aharnessRuntimeAssets,
  aharnessRuntimePackageNames,
  browserRuntimeFiles,
  browserRuntimeFilesForConfig,
  codexPlusRuntimeAssets,
  fzfRuntimeAssetPath,
  runtimeFiles,
};
