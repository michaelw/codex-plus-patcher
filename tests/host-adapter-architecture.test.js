const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { patchSets } = require("../src/patches");
const { browserRuntimeFilesForConfig, codexPlusRuntimeAssets } = require("../src/runtime/assets");

const root = path.resolve(__dirname, "..");
const required = [
  "native.request",
  "commands.dispatch",
  "commands.metadata",
  "context.active",
  "context.snapshot",
  "context.subscribe",
  "threadSidePanel.openFile",
  "threadSidePanel.mount",
  "review.renderBodyFromHost",
  "review.renderDiff",
  "review.context",
  "review.gitRequest",
  "review.pathValue",
  "projectSelector.acceptCurrent",
  "projectSelector.acceptFirst",
  "projectSelector.fuzzyFilter",
  "projectSelector.fuzzyHighlight",
  "projectSelector.setAcceptFirstHandler",
  "projectSelector.trigger",
  "sidebar.projectRowProps",
  "sidebar.projects",
  "sidebar.threadRowProps",
  "sidebar.mergeThreadRowAttributes",
  "messageComposer.userBubbleProps",
  "messageComposer.composerSurfaceProps",
  "threadHeader.accessories",
  "threadHeader.notify",
  "threadHeader.snapshot",
  "threadHeader.subscribe",
  "threadHeader.title",
  "clipboard.writeText",
  "routing.openDeepRoute",
];

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("required host adapter manifest is authoritative and loaded before consumers", () => {
  const manifest = source("src/runtime/api/hostAdapters.js");
  for (const method of required) assert.match(manifest, new RegExp(`"${method.replaceAll(".", "\\.")}"`));
  const files = browserRuntimeFilesForConfig();
  assert.ok(files.indexOf("api/hostAdapters.js") > files.indexOf("api/index.js"));
  assert.ok(files.indexOf("api/hostAdapters.js") < files.indexOf("api/native.js"));
  assert.ok(files.indexOf("api/hostAdapters.js") < files.indexOf("plugins/nestedRepositories.js"));
});

test("Aharness discovers projects through the shared sidebar interface", () => {
  const plugin = source("src/runtime/plugins/aharnessRuns.js");
  assert.match(plugin, /CodexPlus\.ui\.sidebar\.projects\(\)/);
});

test("plugins and public APIs do not access legacy native globals", () => {
  const files = [
    ...fs.readdirSync(path.join(root, "src/runtime/plugins")).map((name) => `src/runtime/plugins/${name}`),
    ...fs.readdirSync(path.join(root, "src/runtime/api")).map((name) => `src/runtime/api/${name}`),
  ];
  for (const file of files) {
    const text = source(file);
    assert.doesNotMatch(text, /CodexPlusNativeHooks|codexPlusNative|CodexPlusHost\.nativeRequest/, file);
    if (file.includes("/plugins/")) assert.doesNotMatch(text, /CodexPlus\.native|CodexPlus\.ui\.threadSidePanel/, file);
  }
});

test("required minified hooks use direct adapter calls without defaults", () => {
  for (const file of [
    "src/patches/lib/hooks/message-composer.js",
    "src/patches/lib/hooks/project-selector.js",
    "src/patches/lib/hooks/review.js",
    "src/patches/lib/hooks/sidebar.js",
    "src/patches/lib/hooks/thread-header.js",
  ]) {
    const text = source(file);
    assert.doesNotMatch(text, /CodexPlusHost\?\.|adapters\?\.|\?\.[A-Za-z]+\(|\|\|\s*\{|\|\|\s*[A-Za-z_$][\w$]*|\?\?\s*(?:null|[A-Za-z_$])/, file);
  }
});

test("runtime capability consumers do not contain rejected fallback implementations", () => {
  assert.doesNotMatch(source("src/runtime/api/threadSidePanel.js"), /document\.querySelector|data-app-shell-tabs/);
  assert.doesNotMatch(source("src/runtime/plugins/nestedRepositories.js"), /fallbackCwd|mainReviewContent/);
  assert.doesNotMatch(source("src/runtime/plugins/projectSelectorShortcut.js"), /fallbackScore|fallbackPositions/);
  assert.doesNotMatch(source("src/runtime/plugins/projectPathHeader.js"), /MutationObserver|syncFallbackHeader/);
  assert.doesNotMatch(source("src/runtime/plugins/mermaidFullscreen.js"), /navigator\.clipboard|execCommand/);
});

test("all registered patch sets package the same required manifest", () => {
  assert.ok(patchSets.length > 0);
  assert.equal(new Set(patchSets.map((patchSet) => patchSet.id)).size, patchSets.length);
  for (const patchSet of patchSets) {
    const assets = new Map(codexPlusRuntimeAssets(patchSet.runtimeConfig));
    const manifest = assets.get("webview/assets/codex-plus/api/hostAdapters.js");
    assert.equal(typeof manifest, "string", `${patchSet.id} packages host adapter manifest`);
    for (const method of required) assert.match(manifest, new RegExp(`"${method.replaceAll(".", "\\.")}"`), `${patchSet.id}: ${method}`);
  }
});
