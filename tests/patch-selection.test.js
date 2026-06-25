const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { patchAsar, readAsar, walkFiles } = require("../src/core/asar");
const {
  applyPatchSet,
  collectAssetFiles,
  collectFileTransforms,
  collectInfoPlistStrings,
  selectPatch,
} = require("../src/core/patch-engine");
const { patchSets } = require("../src/patches");
const { codexPlusRuntimeAssets, runtimeFiles } = require("../src/runtime/assets");

function transformFile(patchSet, filePath, text, context) {
  return collectFileTransforms(patchSet)
    .filter(([candidate]) => candidate === filePath)
    .reduce((current, [, transform]) => transform(current, context), text);
}

function findTransformPath(patchSet, fileNamePrefix) {
  const filePath = collectFileTransforms(patchSet).find(([candidate]) => {
    const fileName = candidate.split("/").pop();
    return fileName === fileNamePrefix || fileName.startsWith(`${fileNamePrefix}-`);
  })?.[0];
  assert.ok(filePath, `${patchSet.id} has ${fileNamePrefix} transform`);
  return filePath;
}

function runRuntimeApiAndHosts(context) {
  for (const [asarPath, localPath] of runtimeFiles) {
    if (!asarPath.startsWith("webview/assets/codex-plus/api/") && !asarPath.startsWith("webview/assets/codex-plus/host/")) continue;
    vm.runInNewContext(
      fs.readFileSync(path.join(__dirname, "../src/runtime", localPath), "utf8"),
      context,
      { filename: localPath },
    );
  }
}

function compactLength(text) {
  return String(text).replace(/\s+/g, "").length;
}

function changedReplacementFragment(oldText, newText) {
  let prefixLength = 0;
  while (
    prefixLength < oldText.length &&
    prefixLength < newText.length &&
    oldText[prefixLength] === newText[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < oldText.length - prefixLength &&
    suffixLength < newText.length - prefixLength &&
    oldText[oldText.length - 1 - suffixLength] === newText[newText.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  return newText.slice(prefixLength, newText.length - suffixLength);
}

function assertReplacementFragmentsWithinBudget(replacements, compactLimit) {
  for (const { label, oldText, newText } of replacements) {
    const fragment = changedReplacementFragment(oldText, newText);
    const length = compactLength(fragment);
    assert.ok(length <= compactLimit, `${label} adds ${length} compact characters`);
  }
}

function projectSelectorShortcutReplacements() {
  const replacePath = require.resolve("../src/patches/lib/replace");
  const patchPath = require.resolve("../src/patches/lib/project-selector-shortcut-patch");
  const originalReplaceCache = require.cache[replacePath];
  const originalPatchCache = require.cache[patchPath];
  const replacements = [];

  require.cache[replacePath] = {
    ...originalReplaceCache,
    exports: {
      replaceOnce(text, oldText, newText, label) {
        replacements.push({ label, oldText, newText });
        return text;
      },
    },
  };
  delete require.cache[patchPath];

  try {
    const patch = require(patchPath);
    patch.patchLocalActiveWorkspaceRootDropdownProjectSelectorShortcut("");
    patch.patchRunCommandProjectSelectorShortcut("");
  } finally {
    if (originalReplaceCache) require.cache[replacePath] = originalReplaceCache;
    else delete require.cache[replacePath];
    if (originalPatchCache) require.cache[patchPath] = originalPatchCache;
    else delete require.cache[patchPath];
  }

  return replacements;
}

function versionedNames(patchSet) {
  if (patchSet.id === "codex-26.616.81150-4306" || patchSet.id === "codex-26.616.71553-4265") {
    return {
      electronCommandSourceFile: patchSet.id === "codex-26.616.81150-4306" ? ".vite/build/src-DBVh5FZA.js" : null,
      srcFile: "src-l0hbMZ-p.js",
      threadContextInputsFile: "thread-context-inputs-B6tQCr7t.js",
      sidebarThreadKeysFile: "sidebar-thread-keys-Ch_amVKz.js",
      sidebarThreadRowSignalsFile: "sidebar-thread-row-signals-ZqNv-_WT.js",
      branchPickerDropdownContentFile: "git-branch-picker-dropdown-content-tZj3VhUw.js",
    };
  }
  return {
    electronCommandSourceFile: null,
    srcFile: "src-C7fSIbpz.js",
    threadContextInputsFile: "thread-context-inputs-CF11za43.js",
    sidebarThreadKeysFile: "sidebar-thread-keys-xpkHnzZL.js",
    sidebarThreadRowSignalsFile: "sidebar-thread-row-signals-DVmC0DJ3.js",
    branchPickerDropdownContentFile: "git-branch-picker-dropdown-content-Ch_voM6R.js",
  };
}

test("selectPatch chooses the exact version and asar hash", () => {
  const patchSet = {
    codexVersion: "1",
    bundleVersion: "2",
    asarSha256: "abc",
  };
  assert.equal(
    selectPatch([patchSet], { version: "1", bundleVersion: "2", asarSha256: "abc" }),
    patchSet,
  );
});

test("selectPatch fails closed for unsupported Codex builds", () => {
  assert.throws(
    () => selectPatch([], { version: "1", bundleVersion: "2", asarSha256: "abc" }),
    /Unsupported Codex\.app/,
  );
});

test("collects named patch queue transforms and plist changes", () => {
  const patchSet = {
    patches: [
      {
        id: "identity",
        infoPlistStrings: { CFBundleName: "Codex Plus" },
        fileTransforms: [["webview/index.html", (text) => text]],
      },
      {
        id: "worker",
        fileTransforms: [[".vite/build/worker.js", (text) => text]],
      },
    ],
  };

  assert.deepEqual(
    collectFileTransforms(patchSet).map(([filePath]) => filePath),
    ["webview/index.html", ".vite/build/worker.js"],
  );
  assert.deepEqual(collectInfoPlistStrings(patchSet), { CFBundleName: "Codex Plus" });
});

test("current patch queues ship the Codex Plus runtime plugin assets", () => {
  for (const patchSet of patchSets) {
    const addedFiles = collectAssetFiles(patchSet).map(([filePath]) => filePath);
    assert.ok(addedFiles.includes(".vite/build/codex-plus-aboutMetadata.js"));
    assert.ok(addedFiles.includes(".vite/build/codex-plus-native-main.js"));
    assert.ok(addedFiles.includes(".vite/build/codex-plus-worker.js"));
    assert.ok(addedFiles.includes("webview/assets/codex-plus/runtime.js"));
    assert.ok(addedFiles.includes("webview/assets/codex-plus/runtime-manifest.js"));
    assert.ok(addedFiles.includes("webview/assets/codex-plus/api/index.js"));
    assert.ok(addedFiles.includes("webview/assets/codex-plus/api/about.js"));
    assert.ok(addedFiles.includes("webview/assets/codex-plus/api/review.js"));
    assert.ok(addedFiles.includes("webview/assets/codex-plus/api/native.js"));
    assert.ok(addedFiles.includes("webview/assets/codex-plus/host/review.js"));
    assert.ok(addedFiles.includes("webview/assets/codex-plus/host/projectSelector.js"));
    assert.ok(addedFiles.includes("webview/assets/codex-plus/host/threadHeader.js"));
    assert.ok(addedFiles.includes("webview/assets/codex-plus/plugins/aboutMetadata.js"));
    assert.ok(addedFiles.includes("webview/assets/codex-plus/plugins/nestedRepositories.js"));
    assert.ok(addedFiles.includes("webview/assets/codex-plus/plugins/diagnosticErrors.js"));
    assert.ok(addedFiles.includes("webview/assets/codex-plus/plugins/userBubbleColors.js"));
    assert.ok(addedFiles.includes("webview/assets/codex-plus/plugins/projectColors.js"));
    assert.ok(addedFiles.includes("webview/assets/codex-plus/plugins/projectPathHeader.js"));
    assert.ok(addedFiles.includes("webview/assets/codex-plus/plugins/sidebarNameBlur.js"));
    assert.ok(addedFiles.includes("webview/assets/codex-plus/plugins/devTools.js"));
    assert.ok(addedFiles.includes("webview/assets/codex-plus/vendor/fzf.umd.js"));
    assert.ok(addedFiles.includes("webview/assets/codex-plus/plugins/projectSelectorShortcut.js"));
    assert.ok(addedFiles.includes("webview/assets/codex-plus/plugins/mermaidFullscreen.js"));
    assert.ok(
      addedFiles.indexOf("webview/assets/codex-plus/vendor/fzf.umd.js") <
      addedFiles.indexOf("webview/assets/codex-plus/plugins/projectSelectorShortcut.js"),
    );
  }
});

test("runtime asset order keeps API, host, vendor, and plugin layers deterministic", () => {
  const asarPaths = runtimeFiles.map(([asarPath]) => asarPath);
  const indexOf = (filePath) => {
    const index = asarPaths.indexOf(filePath);
    assert.notEqual(index, -1, `${filePath} is shipped`);
    return index;
  };

  assert.ok(indexOf("webview/assets/codex-plus/runtime.js") < indexOf("webview/assets/codex-plus/runtime-manifest.js"));
  assert.ok(indexOf("webview/assets/codex-plus/runtime-manifest.js") < indexOf("webview/assets/codex-plus/api/index.js"));
  assert.ok(indexOf("webview/assets/codex-plus/api/index.js") < indexOf("webview/assets/codex-plus/api/review.js"));
  assert.ok(indexOf("webview/assets/codex-plus/api/about.js") < indexOf("webview/assets/codex-plus/plugins/aboutMetadata.js"));
  assert.ok(indexOf("webview/assets/codex-plus/api/mermaid.js") < indexOf("webview/assets/codex-plus/host/review.js"));
  assert.ok(indexOf("webview/assets/codex-plus/host/threadHeader.js") < indexOf("webview/assets/codex-plus/plugins/nestedRepositories.js"));
  assert.ok(indexOf("webview/assets/codex-plus/vendor/fzf.umd.js") < indexOf("webview/assets/codex-plus/plugins/projectSelectorShortcut.js"));
  assert.equal(asarPaths[indexOf(".vite/build/codex-plus-native-main.js")], ".vite/build/codex-plus-native-main.js");
  assert.equal(asarPaths[indexOf(".vite/build/codex-plus-worker.js")], ".vite/build/codex-plus-worker.js");
});

test("runtime plugins stay pure from host bundle details", () => {
  const pluginDir = path.join(__dirname, "../src/runtime/plugins");
  for (const fileName of fs.readdirSync(pluginDir).filter((name) => name.endsWith(".js"))) {
    const source = fs.readFileSync(path.join(pluginDir, fileName), "utf8");
    assert.doesNotMatch(source, /\.vite\/build/, `${fileName} must not know Vite bundle paths`);
    assert.doesNotMatch(source, /webview\/assets\/codex-plus/, `${fileName} must not know shipped asset paths`);
    assert.doesNotMatch(source, /\bt\[\d+\]/, `${fileName} must not know React compiler cache slots`);
    assert.doesNotMatch(source, /CodexPlusHost/, `${fileName} must not call host adapters`);
    assert.doesNotMatch(source, /CPX[A-Za-z]/, `${fileName} must not know minified hook names`);
  }
});

test("hook builders stay within the compact glue budget", () => {
  const hookDir = path.join(__dirname, "../src/patches/lib/hooks");
  const argsByExport = {
    sidebarMergeDataAttributes: ["project", "thread"],
    commandMenuItemsExpression: ["items", "jsx", "open", "formatMessage"],
  };

  for (const fileName of fs.readdirSync(hookDir).filter((name) => name.endsWith(".js"))) {
    const hooks = require(path.join(hookDir, fileName));
    for (const [name, hook] of Object.entries(hooks)) {
      const snippet = hook(...(argsByExport[name] || []));
      const length = compactLength(snippet);
      assert.ok(length <= 180, `${fileName}:${name} is ${length} compact characters`);
    }
  }
});

test("project selector shortcut replacements stay within the compact behavior budget", () => {
  assertReplacementFragmentsWithinBudget(projectSelectorShortcutReplacements(), 180);
});

test("project selector shortcut replacements do not add cache dependency checks", () => {
  for (const { label, oldText, newText } of projectSelectorShortcutReplacements()) {
    assert.doesNotMatch(
      changedReplacementFragment(oldText, newText),
      /\bt\[\d+\]!==[A-Za-z_$][\w$]*/,
      `${label} must not add React compiler cache dependencies`,
    );
  }
});

test("patch composition does not grow embedded helper bodies", () => {
  const commonPatches = fs.readFileSync(path.join(__dirname, "../src/patches/lib/common-patches.js"), "utf8");
  assert.doesNotMatch(commonPatches, /codexPlus\w+Helpers/);
  assert.doesNotMatch(commonPatches, /function CPXReviewMux/);
  assert.doesNotMatch(commonPatches, /function CPXProjectSelector/);
  assert.doesNotMatch(commonPatches, /function CPXOpenMermaidViewer/);
});

test("native bridge patch exposes the DevTools request for patch sets with a main bundle", () => {
  const fakeMain = [
    "function z1(e){return a.ipcMain.handle(Tl,async(t,n)=>{",
    "v0({buildFlavor:i,getContextForWebContents:N.getContextForWebContents,isTrustedIpcEvent:te,usesOwlAppShell:y}),a.ipcMain.on(kl,",
  ].join("");

  for (const patchSet of patchSets) {
    const transforms = collectFileTransforms(patchSet);
    const mainTransforms = transforms.filter(([filePath]) => filePath.startsWith(".vite/build/main-"));
    if (mainTransforms.length === 0) continue;

    const preloadTransform = transforms.find(([filePath]) => filePath === ".vite/build/preload.js")?.[1];
    assert.equal(typeof preloadTransform, "function", `${patchSet.id} has native preload transform`);

    const preload = preloadTransform(
      "e.contextBridge.exposeInMainWorld(`codexWindowType`,m),e.contextBridge.exposeInMainWorld(`electronBridge`,D),typeof window<`u`",
    );
    const main = mainTransforms
      .map(([, transform]) => {
        try {
          return transform(fakeMain);
        } catch {
          return fakeMain;
        }
      })
      .find((text) => text.includes("codex-plus-native-main.js"));
    assert.equal(typeof main, "string", `${patchSet.id} has native main transform`);

    assert.match(preload, /exposeInMainWorld\(`codexPlusNative`,\{request:\(t,n\)=>e\.ipcRenderer\.invoke\(`codex_plus:native-request`,\{method:t,params:n\}\)\}\)/);
    assert.match(main, /let CPXNative=require\("\.\/codex-plus-native-main\.js"\)\.create\(\{electron:a\}\);/);
    assert.match(main, /CPXNative\.registerNativeRequest\(\{isTrustedIpcEvent:te\}\)/);
    assert.doesNotMatch(main, /function CPXApplyNativeMenuItems\(\)/);
    assert.doesNotMatch(main, /setApplicationMenu\(null\)/);
    assert.doesNotMatch(main, /function CPXRegisterNativeMenuItem\(e\)/);
    assert.doesNotMatch(main, /function CPXOpenDevTools\(e\)/);
    assert.doesNotMatch(main, /function CPXOpenMermaidViewer\(e\)/);

    if (versionedNames(patchSet).electronCommandSourceFile) {
      const mainFilePath = mainTransforms[0][0];
      const fakeMenuMain = [
        "function z1(e){return a.ipcMain.handle(Tl,async(t,n)=>{",
        "v0({buildFlavor:i,getContextForWebContents:N.getContextForWebContents,isTrustedIpcEvent:te,usesOwlAppShell:y}),a.ipcMain.on(kl,",
        "He={...b(`toggleSidePanel`),click:async()=>{let e=await y();e&&_.sendMessageToWindow(e,{type:`toggle-diff-panel`})}},Ue=",
        "let mt=[He,We,{type:`separator`}];",
        "me.refreshApplicationMenu(),w(`application menu refreshed`,A),",
      ].join("");
      const menuPatch = collectFileTransforms(patchSet)
        .filter(([filePath]) => filePath === mainFilePath)
        .reduce((current, [, transform]) => {
          try {
            return transform(current);
          } catch {
            return current;
          }
        }, fakeMenuMain);
      assert.match(menuPatch, /He,We,\.\.\.CPXNative\.templateItems\(`view-menu`\),\{type:`separator`\}/);
      assert.match(menuPatch, /CPXNative\.setRefreshApplicationMenu\(\(\)=>me\.refreshApplicationMenu\(\)\),me\.refreshApplicationMenu\(\),CPXNative\.logMenuDiagnostics\(\),w\(`application menu refreshed`,A\),/);
    }
  }

  const nativeMainSource = fs.readFileSync(path.join(__dirname, "../src/runtime/host/nativeMain.js"), "utf8");
  assert.match(nativeMainSource, /function registerNativeMenuItem/);
  assert.match(nativeMainSource, /CODEX_PLUS_MENU_DIAGNOSTICS/);
  assert.match(nativeMainSource, /function openDevTools/);
  assert.match(nativeMainSource, /function openMermaidViewer/);
});

test("current patch queues expose project colors and project selector shortcut separately from bubble colors", () => {
  for (const patchSet of patchSets) {
    const patchIds = patchSet.patches.map((patch) => patch.id);
    assert.ok(patchIds.includes("user-message-bubble-colors"));
    assert.ok(patchIds.includes("project-colors"));
    assert.ok(patchIds.includes("sidebar-name-blur"));
    assert.ok(patchIds.includes("project-selector-shortcut"));
    assert.ok(patchIds.indexOf("user-message-bubble-colors") < patchIds.indexOf("project-colors"));
    assert.ok(patchIds.indexOf("project-colors") < patchIds.indexOf("sidebar-name-blur"));
    assert.ok(patchIds.indexOf("sidebar-name-blur") < patchIds.indexOf("project-selector-shortcut"));
  }
});

test("versioned patch files stay below the runtime migration line-count gate", () => {
  const patchDir = path.join(__dirname, "../src/patches");
  const totalLines = fs
    .readdirSync(patchDir)
    .filter((file) => file.endsWith(".js"))
    .map((file) => fs.readFileSync(path.join(patchDir, file), "utf8").split("\n").length - 1)
    .reduce((sum, count) => sum + count, 0);

  assert.ok(totalLines <= 1608, `src/patches/*.js line count ${totalLines} exceeds 1608`);
});

test("applyPatchSet reports non-dry-run apply steps in order", async () => {
  const progress = [];
  let transformContext;
  const operations = {
    fs: {
      rmSync() {},
      mkdirSync() {},
    },
    run() {},
    patchAsar(_asarPath, _fileTransforms, context) {
      transformContext = context;
      return "patched-sha";
    },
    getPatcherGitSha() {
      return "abc123def456";
    },
    replacePlistString() {},
    setPlistBuddyValue() {},
  };

  const patchSet = {
    id: "codex-example",
    codexVersion: "1.2.3",
    bundleVersion: "456",
    asarSha256: "source-sha",
    patches: [
      {
        id: "identity",
        infoPlistStrings: { CFBundleName: "Codex Plus" },
        fileTransforms: [["webview/index.html", (text) => text]],
      },
      {
        id: "about",
        fileTransforms: [[".vite/build/main.js", (text) => text]],
      },
    ],
  };

  const result = await applyPatchSet({
    sourceApp: "/Applications/Codex.app",
    targetApp: "/Users/example/Applications/Codex Plus.app",
    patchSet,
    progress: (event) => progress.push(event),
    progressOffset: 2,
    progressTotal: 8,
    operations,
  });

  assert.equal(result.patchedAsarSha, "patched-sha");
  assert.deepEqual(transformContext, {
    patcherRepoUrl: "https://github.com/michaelw/codex-plus-patcher",
    patcherGitSha: "abc123def456",
    patchSetId: "codex-example",
    codexVersion: "1.2.3",
    bundleVersion: "456",
    sourceAsarSha256: "source-sha",
    appliedPatches: ["identity", "about"],
    assetFiles: [],
  });
  assert.deepEqual(progress, [
    { status: "start", step: 3, total: 8, label: "Prepare target app" },
    { status: "succeed", step: 3, total: 8, label: "Prepare target app" },
    { status: "start", step: 4, total: 8, label: "Copy app bundle" },
    { status: "succeed", step: 4, total: 8, label: "Copy app bundle" },
    { status: "start", step: 5, total: 8, label: "Patch app.asar" },
    { status: "succeed", step: 5, total: 8, label: "Patch app.asar" },
    { status: "start", step: 6, total: 8, label: "Update bundle metadata" },
    { status: "succeed", step: 6, total: 8, label: "Update bundle metadata" },
    { status: "start", step: 7, total: 8, label: "Sign copied app" },
    { status: "succeed", step: 7, total: 8, label: "Sign copied app" },
    { status: "start", step: 8, total: 8, label: "Finish" },
    { status: "succeed", step: 8, total: 8, label: "Finish" },
  ]);
});

test("applyPatchSet dry-run reports runtime asset files", async () => {
  const patchSet = {
    id: "codex-example",
    codexVersion: "1.2.3",
    bundleVersion: "456",
    asarSha256: "source-sha",
    assetFiles: [["webview/assets/codex-plus/runtime.js", "runtime"]],
    patches: [
      {
        id: "identity",
        fileTransforms: [["webview/index.html", (text) => text]],
      },
    ],
  };

  const result = await applyPatchSet({
    sourceApp: "/Applications/Codex.app",
    targetApp: "/Users/example/Applications/Codex Plus.app",
    patchSet,
    dryRun: true,
  });

  assert.deepEqual(result.addedFiles, ["webview/assets/codex-plus/runtime.js"]);
});

function makeAsar(fileMap) {
  const header = { files: {} };
  let offset = 0;
  const buffers = [];
  for (const [filePath, text] of Object.entries(fileMap)) {
    const parts = filePath.split("/");
    let node = header;
    for (const part of parts.slice(0, -1)) {
      node.files[part] ||= { files: {} };
      node = node.files[part];
    }
    const buffer = Buffer.from(text, "utf8");
    node.files[parts.at(-1)] = { size: buffer.length, offset: String(offset) };
    buffers.push(buffer);
    offset += buffer.length;
  }
  const json = Buffer.from(JSON.stringify(header), "utf8");
  const prefix = Buffer.alloc(16);
  prefix.writeUInt32LE(4, 0);
  prefix.writeUInt32LE(json.length + 8, 4);
  prefix.writeUInt32LE(json.length + 4, 8);
  prefix.writeUInt32LE(json.length, 12);
  return Buffer.concat([prefix, json, ...buffers]);
}

test("patchAsar inserts new runtime files and integrity metadata", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-plus-asar-"));
  const asarPath = path.join(tmpDir, "app.asar");
  fs.writeFileSync(asarPath, makeAsar({ "webview/index.html": "<title>Codex</title>" }));

  patchAsar(
    asarPath,
    [["webview/index.html", (text) => text.replace("Codex", "Codex Plus")]],
    { assetFiles: [["webview/assets/codex-plus/runtime.js", "window.CodexPlus={}"]] },
  );

  const archive = readAsar(asarPath);
  const files = new Map(walkFiles(archive.header));
  assert.ok(files.has("webview/assets/codex-plus/runtime.js"));
  assert.equal(files.get("webview/assets/codex-plus/runtime.js").size, "window.CodexPlus={}".length);
  assert.equal(files.get("webview/assets/codex-plus/runtime.js").integrity.algorithm, "SHA256");
});

test("runtime API registers plugins, settings, commands, styles, modules, and patches", async () => {
  const styles = [];
  const storage = new Map();
  const nativeRequests = [];
  const window = {
    location: { href: "https://example.invalid/webview/assets/codex-plus/runtime.js" },
    localStorage: {
      getItem(key) {
        return storage.get(key) || null;
      },
      setItem(key, value) {
        storage.set(key, value);
      },
    },
    codexPlusNative: {
      request(method, params) {
        nativeRequests.push({ method, params });
        return Promise.resolve({ ok: true });
      },
    },
  };
  const context = {
    window,
    globalThis: window,
    URL,
    document: {
      documentElement: {
        style: {
          values: {},
          setProperty(key, value) {
            this.values[key] = value;
          },
          removeProperty(key) {
            delete this.values[key];
          },
        },
      },
      head: {
        appendChild(element) {
          styles.push(element);
        },
      },
      createElement(tag) {
        return { tag };
      },
      getElementById() {
        return null;
      },
    },
  };

  runRuntimeApiAndHosts(context);

  const api = window.CodexPlus;
  assert.equal(window.CodexPlusDiagnostics, api.diagnostics);
  const jsx = (type, props, key) => ({ type, props, key });
  const plain = (value) => JSON.parse(JSON.stringify(value));
  const registeredMenus = [];
  api.registerPlugin(
    api.definePlugin({
      id: "sample",
      name: "Sample",
      required: true,
      settings: { enabled: { type: "boolean", default: true } },
      commands: [{
        id: "sample.command",
        title: "Sample command",
        description: "Runs a sample command",
        menu: { groups: ["suggested", "panels"] },
        shortcut: { defaultKeybindings: [] },
        run: () => "ok",
      }],
      styles: ".sample{}",
      patches: [{ find: "hello", replacement: { match: "hello", replace: "hi" } }],
      start(instance) {
        instance.modules.registerHostModule("sample", { marker: true });
        instance.ui.settings.appearance.addRow({
          id: "sample-row",
          render: ({ jsx }) => jsx("row", { label: "Sample row" }, "sample-row"),
        });
        instance.ui.sidebar.decorateProjectRow(() => ({ style: { color: "red" }, "data-sample-project": "" }));
        instance.ui.sidebar.decorateProjectRow(() => ({ style: { background: "blue" }, "data-sample-project-2": "" }));
        instance.ui.sidebar.decorateThreadRow(() => ({ "data-sample-thread": "" }));
        instance.ui.message.decorateUserBubble(() => ({ "data-sample-message": "" }));
        instance.ui.composer.decorateSurface(() => ({ "data-sample-composer": "" }));
        instance.ui.review.wrapBody((props) => `wrapped:${props.mainReviewContent}`);
        instance.ui.errors.decorateBoundary(({ jsx, error }) => jsx("pre", { children: error.message }, "error"));
        instance.ui.threadHeader.addAccessory(({ context, jsx }) => jsx("span", { children: context.cwd }, "path"));
        instance.ui.mermaid.decorateDiagram(() => ({ "data-sample-mermaid": "" }));
      },
    }),
  );

  assert.equal(api.plugins.get("sample").settingsStore.get("enabled"), true);
  assert.equal(api.commands.run("sample.command"), "ok");
  assert.deepEqual(Array.from(api.commands.menuItems("suggested").map((command) => command.id)), ["sample.command"]);
  assert.deepEqual(Array.from(api.ui.commands.commandMetadata().map((command) => command.id)), ["sample.command"]);
  await api.nativeMenus.registerItem({
    id: "sample.menu",
    menuId: "view-menu",
    label: "Sample menu",
    nativeRequest: { method: "sample/run" },
  });
  assert.deepEqual(nativeRequests, [{
    method: "native-menu/register-item",
    params: {
      id: "sample.menu",
      menuId: "view-menu",
      label: "Sample menu",
      nativeRequest: { method: "sample/run" },
    },
  }]);
  const menuItems = api.ui.commands.renderMenuItems({
    group: "suggested",
    deps: {
      jsx,
      MenuItem: "menu-item",
      register(id, run, options) {
        registeredMenus.push({ id, run, options });
      },
    },
  });
  assert.equal(menuItems.length, 1);
  menuItems[0].type(menuItems[0].props);
  assert.equal(registeredMenus[0].id, "sample.command");
  assert.equal(registeredMenus[0].run(), "ok");
  assert.equal(registeredMenus[0].options.menuItem.render(() => {}).type, "menu-item");
  const rows = api.ui.settings.appearance.renderRows({ deps: { jsx }, variant: "light" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].type(rows[0].props).props.label, "Sample row");
  assert.deepEqual(plain(api.ui.sidebar.projectRowProps({ project: "x" })), {
    "data-sample-project": "",
    "data-sample-project-2": "",
    style: { color: "red", background: "blue" },
  });
  assert.deepEqual(plain(api.ui.sidebar.threadRowProps({ project: "x" })), { "data-sample-thread": "" });
  assert.deepEqual(plain(api.ui.message.userBubbleProps({ project: "x" })), { "data-sample-message": "" });
  assert.deepEqual(plain(api.ui.composer.surfaceProps({ project: "x" })), { "data-sample-composer": "" });
  assert.deepEqual(plain(api.ui.mermaid.diagramProps({ code: "graph TD;A-->B" })), { "data-sample-mermaid": "" });
  assert.equal(api.ui.review.renderBody({ defaultBody: "body", props: {}, deps: {} }), "wrapped:body");
  assert.equal(
    window.CodexPlusHost.adapters.review.renderBodyFromHost(
      { mainReviewContent: "host-body" },
      [{ jsx, jsxs: jsx, Fragment: "fragment" }, { createElement: () => null }, null, null, null, null, null, null, null, null, null, "default-review", null, null, null, null, null, null, null, null, null],
    ),
    "wrapped:host-body",
  );
  assert.equal(api.ui.errors.renderDetails({ jsx, error: new Error("boom") }).props.children, "boom");
  const headerAccessories = api.ui.threadHeader.renderAccessories({ context: { cwd: "/tmp/example" }, deps: { jsx } });
  assert.equal(headerAccessories.length, 1);
  assert.equal(headerAccessories[0].type(headerAccessories[0].props).type, "span");
  assert.equal(headerAccessories[0].type(headerAccessories[0].props).props.children, "/tmp/example");
  assert.deepEqual(api.modules.findByProps("marker"), { marker: true });
  assert.equal(api.patches.apply("hello world"), "hi world");
  assert.equal(styles.some((element) => element.id === "codex-plus-style-sample"), true);
  assert.ok(api.diagnostics.snapshot().some((entry) => entry.event === "threadHeader.addAccessory"));
  assert.ok(api.diagnostics.snapshot().some((entry) => entry.event === "threadHeader.render" && entry.details.cwd === "/tmp/example"));
});

test("runtime loads built-in plugins before the app entrypoint while parsing", () => {
  const runtime = fs.readFileSync("src/runtime/runtime.js", "utf8");
  const writes = [];
  const window = {
    location: { href: "https://example.invalid/webview/assets/codex-plus/runtime.js" },
    localStorage: {
      getItem() { return null; },
      setItem() {},
    },
  };
  const context = {
    window,
    globalThis: window,
    URL,
    document: {
      readyState: "loading",
      currentScript: { src: "https://example.invalid/webview/assets/codex-plus/runtime.js" },
      documentElement: { style: { setProperty() {}, removeProperty() {} } },
      head: { appendChild() { throw new Error("plugins should load synchronously while parsing"); } },
      createElement(tag) { return { tag }; },
      getElementById() { return null; },
      write(html) { writes.push(html); },
    },
  };

  vm.runInNewContext(runtime, context);

  assert.deepEqual(writes, [
    '<script src="https://example.invalid/webview/assets/codex-plus/runtime-manifest.js"></script>',
  ]);

  const manifest = new Map(codexPlusRuntimeAssets()).get("webview/assets/codex-plus/runtime-manifest.js");
  vm.runInNewContext(manifest, context);

  assert.ok(writes.some((html) => html.includes("plugins/projectPathHeader.js")));
  assert.ok(writes.some((html) => html.includes("vendor/fzf.umd.js")));
  assert.ok(writes.indexOf(writes.find((html) => html.includes("vendor/fzf.umd.js"))) < writes.indexOf(writes.find((html) => html.includes("plugins/projectSelectorShortcut.js"))));
  assert.ok(writes.slice(1).every((html) => /^<script src="https:\/\/example\.invalid\/webview\/assets\/codex-plus\/(?:api|host|plugins|vendor)\/.+"><\/script>$/.test(html)));
});

test("dev tools plugin registers an Open Developer Tools panels command", async () => {
  const plugin = fs.readFileSync("src/runtime/plugins/devTools.js", "utf8");
  const nativeRequests = [];
  const window = {
    location: { href: "https://example.invalid/webview/assets/codex-plus/runtime.js" },
    codexPlusNative: {
      request(method, params) {
        nativeRequests.push({ method, params });
        return Promise.resolve({ ok: true });
      },
    },
  };
  const context = { window, globalThis: window, URL };

  runRuntimeApiAndHosts(context);
  vm.runInNewContext(plugin, context);

  const api = window.CodexPlus;
  const command = api.commands.all().find((candidate) => candidate.id === "codexPlusOpenDevTools");
  assert.equal(command.title, "Open Developer Tools");
  assert.deepEqual(Array.from(command.menu.groups), ["panels"]);
  assert.deepEqual(Array.from(command.shortcut.defaultKeybindings), []);

  const metadata = api.ui.commands.commandMetadata().find((candidate) => candidate.id === "codexPlusOpenDevTools");
  assert.equal(metadata.commandMenuGroupKey, "panels");
  assert.deepEqual(Array.from(metadata.defaultKeybindings), []);

  await api.commands.run("codexPlusOpenDevTools");
  assert.deepEqual(nativeRequests.map((request) => ({
    method: request.method,
    params: request.params == null ? request.params : JSON.parse(JSON.stringify(request.params)),
  })), [
    {
      method: "native-menu/register-item",
      params: {
        id: "codexPlusOpenDevTools",
        menuId: "view-menu",
        afterLabel: "Find",
        label: "Open Developer Tools",
        nativeRequest: { method: "devtools/open" },
      },
    },
    { method: "devtools/open", params: undefined },
  ]);
});

test("project selector shortcut command focuses and opens the mounted selector trigger", () => {
  const plugin = fs.readFileSync("src/runtime/plugins/projectSelectorShortcut.js", "utf8");
  const storage = new Map();
  const focused = [];
  const dispatchedEvents = [];
  const keydownListeners = [];
  let mountedTriggers = [];
  const fzfCalls = [];
  class FakeFzf {
    constructor(items, options = {}) {
      this.items = items;
      this.options = options;
      fzfCalls.push({ items, options });
    }

    find(query) {
      return this.items.map((item) => {
        const text = this.options.selector?.(item) ?? item;
        const positions = new Set();
        let fromIndex = 0;
        for (const char of query.toLowerCase()) {
          const index = String(text).toLowerCase().indexOf(char, fromIndex);
          if (index < 0) return null;
          positions.add(index);
          fromIndex = index + 1;
        }
        return { item, positions, score: positions.size };
      }).filter(Boolean);
    }
  }
  const window = {
    location: { href: "https://example.invalid/webview/assets/codex-plus/runtime.js" },
    fzf: { Fzf: FakeFzf },
    localStorage: {
      getItem(key) {
        return storage.get(key) || null;
      },
      setItem(key, value) {
        storage.set(key, value);
      },
    },
    HTMLElement: class HTMLElement {},
    MouseEvent: class MouseEvent {
      constructor(type, options) {
        this.type = type;
        this.options = options;
      }
    },
    PointerEvent: class PointerEvent {
      constructor(type, options) {
        this.type = type;
        this.options = options;
      }
    },
  };
  class FakeElement extends window.HTMLElement {
    constructor(id = "trigger", rect = { height: 20, left: 0, top: 0, width: 80 }, variant = "default") {
      super();
      this.id = id;
      this.rect = rect;
      this.variant = variant;
    }

    matches() {
      return false;
    }

    querySelector() {
      return null;
    }

    getAttribute(name) {
      if (name === "data-codex-plus-project-selector-variant") return this.variant;
      return null;
    }

    getBoundingClientRect() {
      return this.rect;
    }

    focus() {
      focused.push(this.id);
    }

    dispatchEvent(event) {
      dispatchedEvents.push({ target: this.id, type: event.type, options: event.options });
      return true;
    }
  }
  const context = {
    window,
    globalThis: window,
    HTMLElement: window.HTMLElement,
    URL,
    document: {
      documentElement: { style: { setProperty() {}, removeProperty() {} } },
      head: { appendChild() {} },
      createElement(tag) {
        return { tag };
      },
      getElementById() {
        return null;
      },
      querySelectorAll(selector) {
        assert.equal(selector, "[data-codex-plus-project-selector-trigger]");
        return mountedTriggers;
      },
      addEventListener(type, listener, options) {
        keydownListeners.push({ type, listener, options });
      },
      removeEventListener(type, listener, options) {
        const index = keydownListeners.findIndex(
          (entry) => entry.type === type && entry.listener === listener && entry.options === options,
        );
        if (index !== -1) keydownListeners.splice(index, 1);
      },
    },
  };

  runRuntimeApiAndHosts(context);
  vm.runInNewContext(plugin, context);

  const plain = (value) => JSON.parse(JSON.stringify(value));
  const command = window.CodexPlus.commands.all().find((command) => command.id === "codexPlus.focusProjectSelector");
  assert.equal(command.title, "Focus project selector");
  assert.equal(command.description, "Focus or open the new chat project selector");
  assert.deepEqual(plain(command.menu.groups), ["suggested", "workspace"]);
  assert.deepEqual(plain(command.palette), { enabled: true, keywords: ["project", "selector", "new chat"] });
  assert.deepEqual(plain(command.shortcut.defaultKeybindings), [{ key: "CmdOrCtrl+." }]);
  const projects = [
    { projectId: "a", label: "codex-plus-patcher", path: "/tmp/codex-plus-patcher" },
    { projectId: "b", label: "hassio-dev", path: "/tmp/hassio-dev" },
    { projectId: "c", label: "homeassistant-config-aus00", path: "/tmp/homeassistant-config-aus00" },
  ];
  assert.deepEqual(
    window.CodexPlus.ui.projectSelector.fuzzyFilter(projects, "codex   plus").map((project) => project.projectId),
    ["a"],
  );
  assert.deepEqual(
    window.CodexPlus.ui.projectSelector.fuzzyFilter(projects, "hdev").map((project) => project.projectId),
    ["b"],
  );
  assert.ok(fzfCalls.length >= 2);
  delete window.fzf;
  assert.deepEqual(
    window.CodexPlus.ui.projectSelector.fuzzyFilter(projects, "codex plus").map((project) => project.projectId),
    ["a"],
  );
  window.fzf = { Fzf: FakeFzf };
  const jsx = (type, props, key) => ({ type, props, key });
  const normalize = (value) => JSON.parse(JSON.stringify(value));
  assert.deepEqual(
    normalize(window.CodexPlus.ui.projectSelector.fuzzyHighlight({ text: "codex-plus", query: "cp", jsx })),
    [
      {
        type: "strong",
        props: {
          className: "font-semibold",
          style: { color: "var(--color-token-text-link-foreground, #2563eb)" },
          children: "c",
        },
        key: 0,
      },
      "odex-",
      {
        type: "strong",
        props: {
          className: "font-semibold",
          style: { color: "var(--color-token-text-link-foreground, #2563eb)" },
          children: "p",
        },
        key: 1,
      },
      "lus",
    ],
  );
  assert.equal(keydownListeners.length, 1);
  assert.deepEqual({ type: keydownListeners[0].type, options: keydownListeners[0].options }, { type: "keydown", options: true });
  assert.equal(window.CodexPlus.commands.run("codexPlus.focusProjectSelector"), false);

  const absentKeydown = { key: ".", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  keydownListeners[0].listener(absentKeydown);
  assert.equal(absentKeydown.defaultPrevented, false);

  mountedTriggers = [
    new FakeElement("title", { height: 24, left: 575, top: 360, width: 48 }, "hero"),
    new FakeElement("composer", { height: 24, left: 125, top: 315, width: 80 }, "default"),
  ];
  assert.equal(window.CodexPlus.commands.run("codexPlus.focusProjectSelector"), true);
  const presentKeydown = { key: ".", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  keydownListeners[0].listener(presentKeydown);
  assert.equal(presentKeydown.defaultPrevented, true);
  assert.deepEqual(focused, ["composer", "composer"]);
  assert.deepEqual(dispatchedEvents.map((event) => event.type), [
    "pointerdown",
    "mousedown",
    "mouseup",
    "click",
    "pointerdown",
    "mousedown",
    "mouseup",
    "click",
  ]);
  assert.deepEqual(dispatchedEvents.map((event) => event.target), [
    "composer",
    "composer",
    "composer",
    "composer",
    "composer",
    "composer",
    "composer",
    "composer",
  ]);
  assert.equal(dispatchedEvents[0].options.bubbles, true);
  assert.equal(dispatchedEvents[0].options.cancelable, true);
  assert.equal(dispatchedEvents[0].options.button, 0);
  assert.equal(dispatchedEvents[0].options.ctrlKey, false);
});

test("local active workspace root dropdown exposes only the final selector trigger to Codex Plus", () => {
  const fakeDropdownBundle = [
    "Ne=r();function Pe(e){let t=(0,Ne.c)(42),{groups:n,selectedProjectIds:r,onSelectProjectId:i,keepOpenOnSelect:a,projectlessActionLabel:o,onSelectProjectless:s,footerItems:c,onAddLocalProject:l,onAddRemoteProject:u,emptyMessage:te}=e,ne=a===void 0?!1:a,p=ee(),m=s!=null&&o!=null,[h,re]=(0,Me.useState)(``),_,v,y,b,x,S;if(t[0]!==m||t[1]!==c||t[2]!==n||t[3]!==p||t[4]!==ne||t[5]!==l||t[6]!==u||t[7]!==i||t[8]!==h||t[9]!==r){let e=h.trim().toLowerCase();v=n.filter(t=>{if(!e)return!0;let n=t.repositoryData?.rootFolder??``;return[t.label,n,t.path??``,t.hostDisplayName??``].some(t=>t.toLowerCase().includes(e))});let a=new Map;n.forEach(e=>{if(e.path==null)return;let t=a.get(e.label);if(t==null){a.set(e.label,[e.path]);return}t.push(e.path)}),y=m||c!=null||l!=null||u!=null;let o;t[16]===Symbol.for(`react.memo_cache_sentinel`)?(o=e=>{re(e.target.value)},t[16]=o):o=t[16];let s;t[17]===p?s=t[18]:(s=p.formatMessage({id:`composer.localCwdDropdown.searchPlaceholder`,defaultMessage:`Search projects`,description:`Placeholder for searching the workspace root dropdown`}),t[17]=p,t[18]=s),t[19]!==h||t[20]!==s?(S=(0,H.jsx)(ve,{value:h,onChange:o,placeholder:s,className:`mb-1`}),t[19]=h,t[20]=s,t[21]=S):S=t[21],_=I.Section,b=`flex max-h-[calc((1lh+var(--padding-row-y)*2)*5)] flex-col overflow-y-auto text-sm [--edge-fade-distance:1.5rem]`,x=v.map(e=>{let t=e.repositoryData?.rootFolder,n=t&&t!==e.label,o=!!e.isCodexWorktree,s=a.get(e.label)??[],c=s.length>1&&e.path!=null?g(e.path,s):null;return(0,H.jsx)(`div`,{className:`flex flex-col`,children:(0,H.jsxs)(F,{RightIcon:r.includes(e.projectId)?f:void 0,tooltipText:c??void 0,tooltipAlign:`center`,onSelect:t=>{ne&&t.preventDefault(),i(e.projectId)},children:[(0,H.jsx)(I.ItemIcon,{size:`xs`,children:(0,H.jsx)(we,{className:`icon-xs`,isCodexWorktree:o,isGitRepository:e.repositoryData!=null,isRemoteProject:e.projectKind===`remote`})}),(0,H.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,H.jsx)(`span`,{className:`truncate`,children:e.label}),e.hostDisplayName==null?null:(0,H.jsx)(`span`,{className:`truncate text-sm text-token-description-foreground`,children:e.hostDisplayName}),n?(0,H.jsx)(`span`,{className:`truncate text-sm text-token-description-foreground`,children:t}):null]})]})},e.projectId)}),t[0]=m,t[1]=c,t[2]=n,t[3]=p,t[4]=ne,t[5]=l,t[6]=u,t[7]=i,t[8]=h,t[9]=r,t[10]=_,t[11]=v,t[12]=y,t[13]=b,t[14]=x,t[15]=S}else _=t[10],v=t[11],y=t[12],b=t[13],x=t[14],S=t[15];return null}",
    "function Ie(e){let t=(0,Ne.c)(81),{activeProjectIdOverride:n,allowRemoteProjects:r,disabled:i,hideLabel:a,onWorkspaceRootSelected:u,variant:ee,isOpen:f,onOpenChange:g,triggerButton:E}=e,",
    "if(Ue){let e;t[37]!==J||t[38]!==E?(e=E??J(),t[37]=J,t[38]=E,t[39]=e):e=t[39];let n;t[40]!==R||t[41]!==ze?(n=R?(0,H.jsxs)(H.Fragment,{children:[(0,H.jsx)(I.Separator,{}),(0,H.jsx)(I.Item,{LeftIcon:xe,onSelect:ze,children:(0,H.jsx)(d,{id:`sidebarElectron.addRemoteProject`,defaultMessage:`Remote project`,description:`Dropdown item for adding a remote project from the sidebar`})})]}):null,t[40]=R,t[41]=ze,t[42]=n):n=t[42];let r;return t[43]!==B||t[44]!==U||t[45]!==f||t[46]!==g||t[47]!==P||t[48]!==e||t[49]!==n?(r=(0,H.jsx)(Ee,{localProjectSourcesEnabled:P,open:f,onOpenChange:g,triggerButton:e,onStartFromScratch:U,onUseExistingFolder:B,children:n}),t[43]=B,t[44]=U,t[45]=f,t[46]=g,t[47]=P,t[48]=e,t[49]=n,t[50]=r):r=t[50],r}",
    "let X=E??(k===`hero`?et():k===`home`?J():Ze()),Z;t[59]===W?Z=t[60]:(Z=W?[W]:[],t[59]=W,t[60]=Z);let nt;t[61]===Symbol.for(`react.memo_cache_sentinel`)?(nt=(0,H.jsx)(d,{id:`composer.localCwdDropdown.clearProject`,defaultMessage:`Don't work in a project`,description:`Menu item that clears the selected project and starts projectless chats`}),t[61]=nt):nt=t[61];let rt=He?Ve:void 0,Q;t[62]!==B||t[63]!==Ye||t[64]!==P?(Q=P?(0,H.jsx)(I.Item,{LeftIcon:Te,onSelect:()=>{j.current=!0},children:(0,H.jsx)(d,{id:`projectSetup.addProjectMenu.localProject`,defaultMessage:`Local project`,description:`Menu item that opens the local project creation flow`})}):(0,H.jsxs)(I.FlyoutSubmenuItem,{LeftIcon:Te,label:Ye,children:[(0,H.jsx)(I.Item,{LeftIcon:m,onSelect:()=>{j.current=!0},children:(0,H.jsx)(d,{id:`projectSetup.addProjectMenu.startFromScratch`,defaultMessage:`Start from scratch`,description:`Menu item that creates a new local project folder`})}),(0,H.jsx)(I.Item,{LeftIcon:oe,onSelect:B,children:(0,H.jsx)(d,{id:`projectSetup.addProjectMenu.useExistingFolder`,defaultMessage:`Use an existing folder`,description:`Menu item that opens the existing folder picker`})})]}),t[62]=B,t[63]=Ye,t[64]=P,t[65]=Q):Q=t[65];let it=R?ze:void 0,$;t[66]!==M||t[67]!==je||t[68]!==Z||t[69]!==rt||t[70]!==Q||t[71]!==it?($=(0,H.jsx)(Pe,{groups:M,selectedProjectIds:Z,onSelectProjectId:je,projectlessActionLabel:nt,onSelectProjectless:rt,footerItems:Q,onAddRemoteProject:it}),t[66]=M,t[67]=je,t[68]=Z,t[69]=rt,t[70]=Q,t[71]=it,t[72]=$):$=t[72];let at;return t[73]!==O||t[74]!==f||t[75]!==g||t[76]!==Y||t[77]!==tt||t[78]!==X||t[79]!==$?(at=(0,H.jsx)(ye,{open:f,onOpenChange:g,onCloseAutoFocus:Y,align:tt,disabled:O,triggerButton:X,contentWidth:`workspace`,contentMaxHeight:`tall`,children:$}),t[73]=O,t[74]=f,t[75]=g,t[76]=Y,t[77]=tt,t[78]=X,t[79]=$,t[80]=at):at=t[80],at}",
  ].join("");

  for (const patchSet of patchSets) {
    const transform = collectFileTransforms(patchSet).find(
      ([filePath]) => filePath === findTransformPath(patchSet, "local-active-workspace-root-dropdown"),
    )?.[1];

    assert.equal(typeof transform, "function", `${patchSet.id} has local active workspace root dropdown transform`);

    const originalCacheDependencies = fakeDropdownBundle.match(/\bt\[\d+\]!==[A-Za-z_$][\w$]*/g) || [];
    const transformed = transform(fakeDropdownBundle);
    const transformedCacheDependencies = transformed.match(/\bt\[\d+\]!==[A-Za-z_$][\w$]*/g) || [];

    assert.match(transformed, /CPXP=window\.CodexPlusHost\.adapters\.projectSelector/);
    assert.doesNotMatch(transformed, /CPXF=/);
    assert.doesNotMatch(transformed, /CPXH=/);
    assert.doesNotMatch(transformed, /CPXA=/);
    assert.match(transformed, /v=CPXP\.fuzzyFilter\(n,h\)/);
    assert.doesNotMatch(transformed, /codexPlusCloseProjectSelector/);
    assert.match(transformed, /onKeyDown:e=>CPXP\.acceptFirst\(e,v,i,h\)/);
    assert.match(transformed, /children:CPXP\.fuzzyHighlight\(e\.label,h,H\.jsx\)/);
    assert.doesNotMatch(transformed, /toLowerCase\(\)\.includes\(e\)/);
    assert.doesNotMatch(transformed, /function fuzzyIndices/);
    assert.doesNotMatch(transformed, /function CPXFuzzyIndices/);
    assert.match(transformed, /function CPXPST\(e,t\)\{return CPXP\.trigger\(e,t,Me\)\}/);
    assert.match(transformed, /triggerButton:CPXPST\(X,k\)/);
    assert.doesNotMatch(transformed, /t\[72\]!==g/);
    assert.match(transformed, /triggerButton:e,onStartFromScratch:U/);
    assert.doesNotMatch(transformed, /className:`contents`/);
    assert.doesNotMatch(transformed, /codexPlusCloseProjectSelector/);
    assert.doesNotMatch(transformed, /t\[72\]!==g/);
    assert.deepEqual(transformedCacheDependencies, originalCacheDependencies);
    assert.equal(transformed.match(/CPXPST/g)?.length, 2);
  }
});

test("project selector Enter key adapter accepts only the first searched match", () => {
  const fakeDropdownBundle = [
    "Ne=r();function Pe(e){let t=(0,Ne.c)(42),{groups:n,selectedProjectIds:r,onSelectProjectId:i,keepOpenOnSelect:a,projectlessActionLabel:o,onSelectProjectless:s,footerItems:c,onAddLocalProject:l,onAddRemoteProject:u,emptyMessage:te}=e,ne=a===void 0?!1:a,p=ee(),m=s!=null&&o!=null,[h,re]=(0,Me.useState)(``),_,v,y,b,x,S;if(t[0]!==m||t[1]!==c||t[2]!==n||t[3]!==p||t[4]!==ne||t[5]!==l||t[6]!==u||t[7]!==i||t[8]!==h||t[9]!==r){let e=h.trim().toLowerCase();v=n.filter(t=>{if(!e)return!0;let n=t.repositoryData?.rootFolder??``;return[t.label,n,t.path??``,t.hostDisplayName??``].some(t=>t.toLowerCase().includes(e))});let a=new Map;n.forEach(e=>{if(e.path==null)return;let t=a.get(e.label);if(t==null){a.set(e.label,[e.path]);return}t.push(e.path)}),y=m||c!=null||l!=null||u!=null;let o;t[16]===Symbol.for(`react.memo_cache_sentinel`)?(o=e=>{re(e.target.value)},t[16]=o):o=t[16];let s;t[17]===p?s=t[18]:(s=p.formatMessage({id:`composer.localCwdDropdown.searchPlaceholder`,defaultMessage:`Search projects`,description:`Placeholder for searching the workspace root dropdown`}),t[17]=p,t[18]=s),t[19]!==h||t[20]!==s?(S=(0,H.jsx)(ve,{value:h,onChange:o,placeholder:s,className:`mb-1`}),t[19]=h,t[20]=s,t[21]=S):S=t[21],_=I.Section,b=`flex max-h-[calc((1lh+var(--padding-row-y)*2)*5)] flex-col overflow-y-auto text-sm [--edge-fade-distance:1.5rem]`,x=v.map(e=>{let t=e.repositoryData?.rootFolder,n=t&&t!==e.label,o=!!e.isCodexWorktree,s=a.get(e.label)??[],c=s.length>1&&e.path!=null?g(e.path,s):null;return(0,H.jsx)(`div`,{className:`flex flex-col`,children:(0,H.jsxs)(F,{RightIcon:r.includes(e.projectId)?f:void 0,tooltipText:c??void 0,tooltipAlign:`center`,onSelect:t=>{ne&&t.preventDefault(),i(e.projectId)},children:[(0,H.jsx)(I.ItemIcon,{size:`xs`,children:(0,H.jsx)(we,{className:`icon-xs`,isCodexWorktree:o,isGitRepository:e.repositoryData!=null,isRemoteProject:e.projectKind===`remote`})}),(0,H.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,H.jsx)(`span`,{className:`truncate`,children:e.label}),e.hostDisplayName==null?null:(0,H.jsx)(`span`,{className:`truncate text-sm text-token-description-foreground`,children:e.hostDisplayName}),n?(0,H.jsx)(`span`,{className:`truncate text-sm text-token-description-foreground`,children:t}):null]})]})},e.projectId)}),t[0]=m,t[1]=c,t[2]=n,t[3]=p,t[4]=ne,t[5]=l,t[6]=u,t[7]=i,t[8]=h,t[9]=r,t[10]=_,t[11]=v,t[12]=y,t[13]=b,t[14]=x,t[15]=S}else _=t[10],v=t[11],y=t[12],b=t[13],x=t[14],S=t[15];return null}",
    "function Ie(e){let t=(0,Ne.c)(81),",
    "t[66]!==M||t[67]!==je||t[68]!==Z||t[69]!==rt||t[70]!==Q||t[71]!==it?($=(0,H.jsx)(Pe,{groups:M,selectedProjectIds:Z,onSelectProjectId:je,projectlessActionLabel:nt,onSelectProjectless:rt,footerItems:Q,onAddRemoteProject:it}),t[66]=M,t[67]=je,t[68]=Z,t[69]=rt,t[70]=Q,t[71]=it,t[72]=$):$=t[72];let at;return t[73]!==O||t[74]!==f||t[75]!==g||t[76]!==Y||t[77]!==tt||t[78]!==X||t[79]!==$?(at=(0,H.jsx)(ye,{open:f,onOpenChange:g,onCloseAutoFocus:Y,align:tt,disabled:O,triggerButton:X,contentWidth:`workspace`,contentMaxHeight:`tall`,children:$}),t[73]=O,t[74]=f,t[75]=g,t[76]=Y,t[77]=tt,t[78]=X,t[79]=$,t[80]=at):at=t[80],at}",
  ].join("");
  const transform = collectFileTransforms(patchSets[0]).find(
    ([filePath]) => filePath === findTransformPath(patchSets[0], "local-active-workspace-root-dropdown"),
  )?.[1];

  assert.equal(typeof transform, "function");
  const transformed = transform(fakeDropdownBundle);
  assert.match(transformed, /CPXP=window\.CodexPlusHost\.adapters\.projectSelector/);
  assert.match(transformed, /onKeyDown:e=>CPXP\.acceptFirst\(e,v,i,h\)/);
  const window = {
    KeyboardEvent: class KeyboardEvent {
      constructor(type, options) {
        this.type = type;
        this.options = options;
      }
    },
    location: { href: "https://example.invalid/webview/assets/codex-plus/runtime.js" },
  };
  const context = { window, globalThis: window, URL };
  runRuntimeApiAndHosts(context);
  const adapter = window.CodexPlusHost.adapters.projectSelector;

  const selected = [];
  const events = [];
  const escapeEvents = [];
  const makeEvent = (key, target) => ({
    key,
    target,
    preventDefault() { events.push("preventDefault"); },
    stopPropagation() { events.push("stopPropagation"); },
  });

  adapter.acceptFirst(makeEvent("Enter"), [{ projectId: "first" }, { projectId: "second" }], (projectId) => selected.push(projectId), "codex");
  adapter.acceptFirst(makeEvent("Enter"), [{ projectId: "empty-query" }], (projectId) => selected.push(projectId), "   ");
  adapter.acceptFirst(makeEvent("Enter"), [], (projectId) => selected.push(projectId), "codex");
  adapter.acceptFirst(makeEvent("ArrowDown"), [{ projectId: "arrow" }], (projectId) => selected.push(projectId), "codex");

  assert.deepEqual(selected, ["first"]);
  assert.deepEqual(events, ["preventDefault", "stopPropagation"]);

  adapter.acceptFirst(
    makeEvent("Enter", { dispatchEvent(event) { escapeEvents.push(event); } }),
    [{ projectId: "fallback" }],
    (projectId) => selected.push(projectId),
    "codex",
  );

  assert.deepEqual(selected, ["first", "fallback"]);
  assert.equal(escapeEvents.length, 1);
  assert.equal(escapeEvents[0].type, "keydown");
  assert.equal(escapeEvents[0].options.key, "Escape");
  assert.equal(escapeEvents[0].options.bubbles, true);
  assert.equal(escapeEvents[0].options.cancelable, true);
});

test("run command patch bridges the native project selector shortcut to the runtime command", () => {
  const fakeRunCommandBundle = [
    "import{f as e}from\"./vscode-api-Cc4BqLmp.js\";",
    "var i=new Map([[`newThread`,()=>{}],[`openFolder`,()=>{r()}],[`toggleSidebar`,()=>{}]]),a=new Map;",
  ].join("");

  for (const patchSet of patchSets) {
    const transform = collectFileTransforms(patchSet).find(
      ([filePath]) => filePath === findTransformPath(patchSet, "run-command"),
    )?.[1];

    assert.equal(typeof transform, "function", `${patchSet.id} has run command transform`);

    const transformed = transform(fakeRunCommandBundle);

    assert.match(transformed, /\[`codexPlus\.focusProjectSelector`,\(\)=>\{window\.CodexPlus\?\.commands\?\.run\?\.\(`codexPlus\.focusProjectSelector`\)\}\]/);
    assert.match(transformed, /\[`codexPlus\.focusProjectSelector`[\s\S]*\[`openFolder`/);
    assert.equal(transformed.match(/codexPlus\.focusProjectSelector/g)?.length, 2);
  }
});

function fakeAboutDialogBundle() {
  return [
    "let i=a.app.getName(),o=a.app.getVersion(),s=B0(o),c=t.aa(e),l=c==null?o:`${o} • ${c}`,u=process.platform===`darwin`,d=r.$(),f=await G0(),p=d.formatMessage({messageId:C0,defaultMessage:w0,values:{appName:i}}),m=u?null:d.formatMessage({messageId:T0,defaultMessage:`OK`}),h=s==null?d.formatMessage({messageId:E0,defaultMessage:D0,values:{version:l}}):d.formatMessage({messageId:O0,defaultMessage:k0,values:{version:l,releaseDate:s}}),g=d.formatMessage({messageId:A0,defaultMessage:j0}),_=V0(o),v=_.length===0?h:[h,``,..._].join(`\n`),y=n!=null&&!n.isDestroyed()?n:null,b=a.nativeTheme.shouldUseDarkColors;",
    "K0({appDisplayName:i,buildInfoLabel:g,buildInfoText:v,iconDataUrl:f.htmlIconDataUrl,isDark:b,okLabel:m,title:p})",
    "function V0(e){return[]}",
    "function K0({appDisplayName:e,buildInfoLabel:t,buildInfoText:n,iconDataUrl:r,isDark:i,okLabel:a,title:o}){let s=r==null?``:`<img class=\"app-icon\" src=\"${(0,zz.default)(r)}\" alt=\"\">`,c=a==null?``:`footer`,l=a==null?``:`script`;return`",
    "    .build-info {\n      width: 100%;\n      margin: 0;\n      line-height: 1.45;\n      color: var(--muted-text);\n      white-space: pre-wrap;\n      overflow-wrap: anywhere;\n      border: 0;\n      background: transparent;\n      font: inherit;\n    }",
    "    .app-name,\n    .build-info,\n    .copyright {",
    '      <div class="app-name" id="app-name">${(0,zz.default)(e)}</div>\n      <pre class="build-info" aria-label="${(0,zz.default)(t)}">${(0,zz.default)(n)}</pre>',
  ].join("");
}

test("about dialog patch reports Codex Plus patch provenance", () => {
  const patchSet = patchSets.find((patchSet) => patchSet.id === "codex-26.616.51431-4212");
  const transform = collectFileTransforms(patchSet).find(([filePath]) => filePath === ".vite/build/main-B6erVVHq.js")?.[1];

  assert.equal(typeof transform, "function", "current patch set has about dialog transform");

  const transformed = transform(fakeAboutDialogBundle(), {
    patcherRepoUrl: "https://github.com/michaelw/codex-plus-patcher",
    patcherGitSha: "abc123def456",
    sourceAsarSha256: "source-sha",
    appliedPatches: ["bundle-identity", "about-codex-plus-metadata"],
  });

  assert.match(transformed, /require\("\.\/codex-plus-aboutMetadata\.js"\)/);
  assert.match(transformed, /require\("\.\/codex-plus-aboutMetadata\.js"\)\.aboutPayload/);
  assert.match(transformed, /i=CPXAbout\.appDisplayName,o=a\.app\.getVersion\(\)/);
  assert.match(transformed, /_=CPXAbout\.buildInfoLines,v=_\.length===0\?h:\[h,``,\.\.\._\]\.join/);
  assert.match(transformed, /function V0\(e\)\{return\[\]\}/);
  assert.doesNotMatch(transformed, /function V0\(e\)\{return CPXAbout\.buildInfoLines\}/);
  assert.match(transformed, /codexPlusDisclaimerHeading:CPXAbout\.disclaimerHeading/);
  assert.match(transformed, /codexPlusDisclaimerBody:CPXAbout\.disclaimerBody/);
  assert.match(transformed, /let CPXAboutMetadata=require\("\.\/codex-plus-aboutMetadata\.js"\),q=/);
  assert.match(transformed, /CPXAboutMetadata\.disclaimerMarkup\(\{escape:zz\.default,heading:D,body:O\}\)/);
  assert.match(transformed, /\$\{CPXAboutMetadata\.disclaimerStyles\(\)\}/);
  assert.match(transformed, /\.build-info \{\n      width: 100%;\n      margin: 0;\n      line-height: 1\.45;\n      color: var\(--muted-text\);\n      text-align: left;/);
  assert.match(transformed, /\.codex-plus-disclaimer,\n    \.build-info,/);
  assert.match(transformed, /\$\{q\}\n      <pre class="build-info"/);
  assert.doesNotMatch(transformed, /THIS SOFTWARE IS PROVIDED/);
  assert.doesNotMatch(transformed, /class="codex-plus-disclaimer"/);
  assert.doesNotMatch(transformed, /This app is Codex Plus\./);
  assert.match(transformed, /https:\/\/github\.com\/michaelw\/codex-plus-patcher/);
  assert.match(transformed, /"patcherGitSha":"abc123def456"/);
  assert.match(transformed, /"sourceAsarSha256":"source-sha"/);
  assert.match(transformed, /"appliedPatches":\["bundle-identity","about-codex-plus-metadata"\]/);

  const aboutPlugin = fs.readFileSync(path.join(__dirname, "../src/runtime/plugins/aboutMetadata.js"), "utf8");
  const commonPatches = fs.readFileSync(path.join(__dirname, "../src/patches/lib/common-patches.js"), "utf8");
  assert.match(aboutPlugin, /function aboutPayload/);
  assert.match(aboutPlugin, /function buildInfoLines/);
  assert.match(aboutPlugin, /function disclaimerMarkup/);
  assert.match(aboutPlugin, /THIS SOFTWARE IS PROVIDED/);
  assert.doesNotMatch(commonPatches, /THIS SOFTWARE IS PROVIDED/);

  const aboutMetadata = require("../src/runtime/plugins/aboutMetadata.js");
  const payload = aboutMetadata.aboutPayload({
    patcherRepoUrl: "https://github.com/michaelw/codex-plus-patcher",
    patcherGitSha: "abc123def456",
    sourceAsarSha256: "source-sha",
    appliedPatches: ["bundle-identity", "about-codex-plus-metadata"],
  });
  assert.equal(payload.appDisplayName, "Codex Plus");
  assert.ok(payload.buildInfoLines.includes("Patcher commit: abc123def456"));
  assert.ok(payload.buildInfoLines.includes("Source app.asar: source-sha"));
  assert.ok(payload.buildInfoLines.includes("- bundle-identity"));
  assert.ok(payload.buildInfoLines.includes("- about-codex-plus-metadata"));
});

test("title patch loads the Codex Plus runtime bootstrap", () => {
  for (const patchSet of patchSets) {
    const transformed = transformFile(patchSet, "webview/index.html", "<title>Codex</title>");
    assert.match(transformed, /<title>Codex Plus<\/title>/);
    assert.match(transformed, /<script src="\.\/assets\/codex-plus\/runtime\.js"><\/script>/);
  }
});

test("project path header plugin formats, hides, and copies paths", () => {
  const originalNavigator = globalThis.navigator;
  const originalCodexPlus = globalThis.CodexPlus;
  const copied = [];
  const diagnosticEvents = [];
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { clipboard: { writeText: (value) => copied.push(value) } },
  });

  try {
    const plugin = require("../src/runtime/plugins/projectPathHeader.js");
    globalThis.CodexPlus = {
      diagnostics: {
        log(event, details) {
          diagnosticEvents.push({ event, details });
        },
      },
    };
    const longPath = "/Users/example/src/similarly-named-project/worktrees/generated-thread";
    const jsx = (type, props, key) => ({ type, props, key });
    const jsxs = jsx;
    const Tooltip = function Tooltip(props) { return props.children; };

    assert.equal(plugin.pathFromContext({ cwd: "  /tmp/project  " }), "/tmp/project");
    assert.equal(plugin.pathFromContext({ cwd: "   " }), "");
    assert.equal(plugin.pathFromContext({}), "");

    const shortened = plugin.formatPathLabel(longPath, 60);
    assert.equal(shortened, "…/similarly-named-project/worktrees/generated-thread");
    assert.equal(plugin.formatPathLabel(longPath, 30), "…/worktrees/generated-thread");

    const rendered = plugin.ProjectPathAccessory({ context: { cwd: longPath }, jsx, jsxs, Tooltip });
    assert.equal(rendered.type, Tooltip);
    assert.equal(rendered.props.tooltipContent, longPath);
    const chip = rendered.props.children;
    assert.equal(chip.props.title, longPath);
    assert.equal(chip.props.style.flexShrink, 999);
    assert.equal(chip.props.style.maxWidth, "min(24rem, 28vw)");
    assert.equal(chip.props.children[0].props.children, plugin.formatPathLabel(longPath));
    assert.ok(!chip.props.children[0].props.className.includes("font-vscode-editor"));
    assert.equal(chip.props.children[1].props.children.type, "svg");
    chip.props.children[1].props.onClick({
      preventDefault() {},
      stopPropagation() {},
    });
    assert.deepEqual(copied, [longPath]);

    assert.equal(plugin.ProjectPathAccessory({ context: { cwd: "" }, jsx, jsxs, Tooltip }), null);
    assert.ok(diagnosticEvents.some((entry) => entry.event === "projectPathHeader.render.chip" && entry.details.path === longPath));
    assert.ok(diagnosticEvents.some((entry) => entry.event === "projectPathHeader.render.skip" && entry.details.reason === "missing-cwd"));
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
    globalThis.CodexPlus = originalCodexPlus;
  }
});

test("header patch renders project path accessories from thread context", () => {
  const fakeHeaderBundle = [
    'import{Z as r,a as i,s as a}from"./app-scope-CWE-zIhQ.js";',
    'import{t as ee}from"./tooltip-B-u9JAuV.js";',
    'import{t as _e}from"./dock-DAmmeMut.js";',
    "function lt(e){let t=(0,Z.c)(68),{className:n,desktopDeepLinkConversationId:r,title:i,onBack:a,trailing:o}=e,s=O(),c=a??dt,l=s.pathname===`/`,u=ut;",
    "let S;t[33]!==a||t[34]!==!1?(S=null,t[33]=a,t[34]=!1,t[35]=S):S=t[35];",
    "let C;t[36]!==c||t[37]!==g||t[38]!==i?(C=(0,Q.jsx)(`div`,{className:`mr-3 line-clamp-1 flex min-w-0 flex-1 items-center gap-1 truncate`,style:{viewTransitionName:`header-title`},children:i?(0,Q.jsxs)(`div`,{className:`flex min-w-0 flex-1 items-center gap-1`,children:[(0,Q.jsx)(mt,{onClick:c}),(0,Q.jsx)(x,{color:`ghostActive`,type:`button`,onClick:u,className:`min-w-0 flex-1 truncate !px-0 !py-0 text-left text-sm text-token-foreground hover:!bg-transparent hover:opacity-80 electron:font-medium`,children:(0,Q.jsx)(`span`,{className:`truncate`,children:i})})]}):(0,Q.jsx)(`span`,{className:`text-token-description-foreground`,children:(0,Q.jsx)(pt,{mergedTasks:g,onBack:c,showBackButton:!0})})}),t[36]=c,t[37]=g,t[38]=i,t[39]=C):C=t[39];",
    "let w;t[40]===Symbol.for(`react.memo_cache_sentinel`)?(w=(0,Q.jsx)(ot,{}),t[40]=w):w=t[40];",
    "let A;t[50]!==k||t[51]!==o?(A=(0,Q.jsxs)(`div`,{className:`flex flex-shrink-0 items-center gap-1`,children:[o,k]}),t[50]=k,t[51]=o,t[52]=A):A=t[52];",
    "let M;t[53]!==A||t[54]!==b||t[55]!==S||t[56]!==C?(M=(0,Q.jsxs)(`div`,{className:b,children:[S,C,A]}),t[53]=A,t[54]=b,t[55]=S,t[56]=C,t[57]=M):M=t[57];",
    "return M}",
  ].join("");
  const fakeThreadPageHeaderBundle = [
    'import{t as e}from"./jsx-runtime-DXKlqYIQ.js";',
    'import{Z as t}from"./app-scope-CWE-zIhQ.js";',
    'import{a as n,n as r,r as i,t as a}from"./thread-env-icon-DQJ4XJ-k.js";',
    "var o=t(),s=e();function c(e){let t=(0,o.c)(21),{start:c,startActions:l,env:u,secondary:d,trailing:f,hostConfig:p}=e,m;",
    "t[0]===Symbol.for(`react.memo_cache_sentinel`)?(m=[],t[0]=m):m=t[0];let h=m,g=h.length>0,_=f!=null&&g,v;",
    "t[1]===c?v=t[2]:(v=c?(0,s.jsx)(`div`,{className:`max-w-[320px] min-w-0 truncate`,children:c}):null,t[1]=c,t[2]=v);",
    "let y;t[3]!==u||t[4]!==p?(y=u===`remote`?p==null?null:(0,s.jsx)(i,{hostId:p.id}):u===`worktree`?(0,s.jsx)(n,{}):u===`cloud`?(0,s.jsx)(a,{}):u?(0,s.jsx)(r,{}):null,t[3]=u,t[4]=p,t[5]=y):y=t[5];",
    "let b;t[6]===d?b=t[7]:(b=d?(0,s.jsx)(`div`,{className:`flex min-w-0 truncate leading-[18px] font-normal text-token-description-foreground`,children:d}):null,t[6]=d,t[7]=b);",
    "let x;t[8]!==l||t[9]!==v||t[10]!==y||t[11]!==b?(x=(0,s.jsxs)(`div`,{className:`text-md flex min-w-0 items-center gap-2 truncate text-base electron:font-medium`,children:[v,y,b,l]}),t[8]=l,t[9]=v,t[10]=y,t[11]=b,t[12]=x):x=t[12];",
    "return x}export{c as t};",
  ].join("");
  const fakeLocalConversationPageBundle = [
    "function Tt(e){let t=(0,Y.c)(42),{conversationId:n,getConversationMarkdown:r,markdownParentConversationId:a,title:o,titleSuffix:s,cwd:c,canPin:l,hideProjectMetadata:d,hideForkActions:f}=e,p=l===void 0?!0:l,m=d===void 0?!1:d,h=A(),g;",
    "t[0]===c?g=t[1]:(g=c?N(c):null,t[0]=c,t[1]=g);let _=gt(g,u(i(O,n)).id),v;",
    "let F,I,L,R;t[37]===Symbol.for(`react.memo_cache_sentinel`)?(R=null,t[37]=R):R=t[37];let z;",
    "return t[38]!==F||t[39]!==I||t[40]!==L?(z=(0,Z.jsx)(`div`,{className:`draggable grid w-full min-w-0 grid-cols-[minmax(0,1fr)] items-center gap-x-4 electron:h-toolbar extension:py-row-y`,children:(0,Z.jsxs)(`div`,{className:`flex min-w-0 items-center gap-2 truncate text-base electron:font-medium`,children:[F,I,L,R]})}),t[38]=F,t[39]=I,t[40]=L,t[41]=z):z=t[41],z}",
  ].join("");

  for (const patchSet of patchSets.filter((patchSet) => patchSet.patches.some((patch) => patch.id === "project-path-header"))) {
    const transform = collectFileTransforms(patchSet).find(([filePath]) => filePath.includes("header-DgzE38hF"))?.[1];
    assert.equal(typeof transform, "function", `${patchSet.id} has header transform`);

    const transformed = transform(fakeHeaderBundle);
    assert.match(transformed, /from"\.\/thread-context-B0hBrRyZ\.js"/);
    assert.match(transformed, /a as CPX_readAtom/);
    assert.match(transformed, /t as CPX_Tooltip/);
    assert.match(transformed, /function CPXThreadHeaderAccessories\(e\)/);
    assert.match(transformed, /CodexPlusHost\.adapters\.threadHeader/);
    assert.match(transformed, /CPX_headerContext=\{cwd:CPX_readAtom\(CPX_headerCwd\),hostId:CPX_readAtom\(CPX_headerHostId\)\}/);
    assert.match(transformed, /deps:\{jsx:Q\.jsx,jsxs:Q\.jsxs,Tooltip:CPX_Tooltip\}/);
    assert.match(transformed, /children:\[\(0,Q\.jsx\)\(mt,\{onClick:c\}\),\(0,Q\.jsx\)\(x,\{color:`ghostActive`/);
    assert.match(transformed, /\}\),CPX_headerAccessories\]\}\):\(0,Q\.jsx\)\(`span`/);
    assert.match(transformed, /children:\[S,C,A\]/);
    assert.match(transformed, /t\[68\]!==CPX_headerAccessories/);

    const threadPageTransform = collectFileTransforms(patchSet).find(([filePath]) => filePath.includes("thread-page-header-D_hZ50OA"))?.[1];
    assert.equal(typeof threadPageTransform, "function", `${patchSet.id} has thread page header transform`);
    const transformedThreadPageHeader = threadPageTransform(fakeThreadPageHeaderBundle);
    assert.doesNotMatch(transformedThreadPageHeader, /thread-context-B0hBrRyZ/);
    assert.doesNotMatch(transformedThreadPageHeader, /CPX_readAtom/);
    assert.match(transformedThreadPageHeader, /function CPXThreadHeaderAccessories\(e\)/);
    assert.match(transformedThreadPageHeader, /cwd:CPX_headerCwd/);
    assert.match(transformedThreadPageHeader, /hostId:p\?\.id\?\?null/);
    assert.match(transformedThreadPageHeader, /header:\{env:u,hostDisplayName:p\?\.display_name\?\?null/);
    assert.match(transformedThreadPageHeader, /deps:\{jsx:s\.jsx,jsxs:s\.jsxs\}/);
    assert.match(transformedThreadPageHeader, /children:\[v,y,b,CPX_headerAccessories,l\]/);
    assert.match(transformedThreadPageHeader, /t\[21\]!==CPX_headerAccessories/);

    const localConversationTransform = collectFileTransforms(patchSet).find(([filePath]) => filePath.includes("local-conversation-page-dVDt8SxG"))?.[1];
    assert.equal(typeof localConversationTransform, "function", `${patchSet.id} has local conversation header transform`);
    const transformedLocalConversation = localConversationTransform(fakeLocalConversationPageBundle);
    assert.match(transformedLocalConversation, /function CPXThreadHeaderAccessories\(e\)/);
    assert.match(transformedLocalConversation, /CPX_headerContext=\{cwd:c,hostId:u\(i\(O,n\)\)\.id/);
    assert.match(transformedLocalConversation, /surface:`local-conversation`/);
    assert.match(transformedLocalConversation, /deps:\{jsx:Z\.jsx,jsxs:Z\.jsxs\}/);
    assert.match(transformedLocalConversation, /children:\[F,I,L,CPX_headerAccessories,R\]/);
    assert.match(transformedLocalConversation, /t\[42\]!==CPX_headerAccessories/);
  }

  for (const patchSet of patchSets.filter((patchSet) => !patchSet.patches.some((patch) => patch.id === "project-path-header"))) {
    assert.equal(
      collectFileTransforms(patchSet).some(([filePath]) => filePath.includes("header-")),
      false,
      `${patchSet.id} does not guess an unverified header chunk`,
    );
  }
});

test("documentation mentions current patches and contributor sync rule", () => {
  const readme = fs.readFileSync("README.md", "utf8");
  const development = fs.readFileSync("DEVELOPMENT.md", "utf8");
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

  assert.match(readme, /nested repositories in the Review pane/);
  assert.match(readme, /diagnostic detail/);
  assert.match(readme, /user-message bubble color controls/);
  assert.match(readme, /adaptive project colors/);
  assert.match(readme, /active project path/);
  assert.match(readme, /Toggle sidebar blur/);
  assert.match(readme, /fullscreen Mermaid diagram viewer/);
  assert.match(readme, /Runtime Plugin Support\]\(docs\/plugin-support\.md\)/);
  assert.match(readme, /Plugin Architecture\]\(docs\/plugin-architecture\.md\)/);
  assert.match(readme, /Versioned ASAR patches install the runtime,\s+built-in plugins/);
  assert.match(development, /If a patch or runtime plugin is added, removed, or renamed/);
  assert.match(development, /README patch summary/);
  assert.match(development, /About dialog still reports the applied patch IDs/);
  assert.match(development, /Prefer new user-facing additions as readable runtime plugins/);
  assert.match(development, /hook that surface\s+into Codex core with the smallest versioned patch needed/);

  const pluginSupport = fs.readFileSync("docs/plugin-support.md", "utf8");
  assert.match(pluginSupport, /window\.CodexPlus/);
  assert.match(pluginSupport, /window\.CodexPlusHost/);
  assert.match(pluginSupport, /plugin-architecture\.md/);
  assert.match(pluginSupport, /CodexPlus\.definePlugin/);
  assert.match(pluginSupport, /CodexPlus\.registerPlugin/);
  assert.match(pluginSupport, /aboutMetadata/);
  assert.match(pluginSupport, /sidebarNameBlur/);
  assert.match(pluginSupport, /threadHeader/);
  assert.match(pluginSupport, /third-party plugin marketplace/);
  const pluginArchitecture = fs.readFileSync("docs/plugin-architecture.md", "utf8");
  assert.match(pluginArchitecture, /src\/runtime\/api/);
  assert.match(pluginArchitecture, /src\/runtime\/plugins/);
  assert.match(pluginArchitecture, /src\/runtime\/host/);
  assert.match(pluginArchitecture, /src\/patches\/lib\/hooks/);
  assert.match(pluginArchitecture, /180-character/);
  assert.match(pluginArchitecture, /plugin purity/);
  assert.match(pluginArchitecture, /host adapter/);
  assert.match(pluginArchitecture, /hook builder/);
  assert.equal(packageJson.scripts.check, "node scripts/check-syntax.js");
});

test("mermaid shell patch delegates fullscreen viewer to the runtime plugin", () => {
  const fakeBundle = [
    "function d(e){let t=(0,s.c)(18),{Renderer:n,className:r,code:i,fallback:d,isCodeFenceOpen:f,wideBlockKind:p}=e,",
    "D=(0,c.jsx)(`div`,{className:a(`transition-opacity duration-[180ms] ease-[cubic-bezier(0.23,1,0.32,1)]`,S?`opacity-100 delay-300 motion-reduce:delay-0`:`pointer-events-none opacity-0 delay-0`),children:(0,c.jsx)(u.Suspense",
    "return t[13]!==T||t[14]!==E||t[15]!==D||t[16]!==p?(O=(0,c.jsx)(`div`,{className:T,\"data-wide-markdown-block\":E,\"data-wide-markdown-block-kind\":p,children:D}),t[13]=T,t[14]=E,t[15]=D,t[16]=p,t[17]=O):O=t[17],O}",
  ].join("");

  for (const patchSet of patchSets.filter((patchSet) => patchSet.id === "codex-26.616.81150-4306" || patchSet.id === "codex-26.616.71553-4265")) {
    const transform = collectFileTransforms(patchSet).find(
      ([filePath]) => filePath.includes("mermaid-diagram-shell"),
    )?.[1];
    assert.equal(typeof transform, "function", `${patchSet.id} has mermaid shell transform`);

    const transformed = transform(fakeBundle);
    assert.match(transformed, /function CPXMermaidDiagramProps\(e\)\{return window\.CodexPlus\?\.ui\?\.mermaid\?\.diagramProps\?\.\(e\)\}/);
    assert.match(transformed, /\.\.\.CPXMermaidDiagramProps\(\{code:i\}\),"data-wide-markdown-block":E/);
    assert.doesNotMatch(transformed, /"data-codex-plus-mermaid-content":""/);
    assert.doesNotMatch(transformed, /codex-plus-mermaid-modal/);

    const transforms = collectFileTransforms(patchSet);
    const preloadTransform = transforms.find(([filePath]) => filePath === ".vite/build/preload.js")?.[1];
    assert.equal(typeof preloadTransform, "function", `${patchSet.id} has preload transform`);
    const preload = preloadTransform(
      "e.contextBridge.exposeInMainWorld(`codexWindowType`,m),e.contextBridge.exposeInMainWorld(`electronBridge`,D),typeof window<`u`",
    );
    assert.match(preload, /exposeInMainWorld\(`codexPlusNative`,\{request:\(t,n\)=>e\.ipcRenderer\.invoke\(`codex_plus:native-request`,\{method:t,params:n\}\)\}\)/);

    const fakeMain = [
      "function z1(e){return a.ipcMain.handle(Tl,async(t,n)=>{",
      "v0({buildFlavor:i,getContextForWebContents:N.getContextForWebContents,isTrustedIpcEvent:te,usesOwlAppShell:y}),a.ipcMain.on(kl,",
    ].join("");
    const main = transforms
      .filter(([filePath]) => filePath.startsWith(".vite/build/main-"))
      .map(([, transform]) => {
        try {
          return transform(fakeMain);
        } catch {
          return fakeMain;
        }
      })
      .find((text) => text.includes("codex-plus-native-main.js"));
    assert.equal(typeof main, "string", `${patchSet.id} has native bridge main transform`);
    assert.match(main, /let CPXNative=require\("\.\/codex-plus-native-main\.js"\)\.create\(\{electron:a\}\);/);
    assert.match(main, /CPXNative\.registerNativeRequest\(\{isTrustedIpcEvent:te\}\)/);
  }

  for (const patchSet of patchSets.filter((patchSet) => patchSet.id === "codex-26.616.51431-4212" || patchSet.id === "codex-26.616.41845-4198")) {
    assert.equal(
      collectFileTransforms(patchSet).some(([filePath]) => filePath.includes("mermaid-diagram-shell")),
      false,
      `${patchSet.id} does not guess an unverified mermaid shell chunk`,
    );
  }

  const pluginSource = fs.readFileSync(path.join(__dirname, "../src/runtime/plugins/mermaidFullscreen.js"), "utf8");
  const nativeMainSource = fs.readFileSync(path.join(__dirname, "../src/runtime/host/nativeMain.js"), "utf8");
  const commonPatches = fs.readFileSync(path.join(__dirname, "../src/patches/lib/common-patches.js"), "utf8");
  assert.match(pluginSource, /function openViewer/);
  assert.match(pluginSource, /CodexPlus\.native\.request\("mermaid\/openViewer", \{ html \}\)/);
  assert.match(pluginSource, /window\.open\(liveUrl, "_blank", "noopener"\)/);
  assert.match(nativeMainSource, /electron\.shell\.openExternal\(event\.url\)/);
  assert.match(nativeMainSource, /url\.hostname === "mermaid\.live"/);
  assert.doesNotMatch(commonPatches, /function CPXOpenMermaidViewer/);
  assert.doesNotMatch(pluginSource, /container\.querySelector\("svg"\)/);
  assert.doesNotMatch(pluginSource, /data-codex-plus-mermaid-content/);
  assert.doesNotMatch(pluginSource, /function isMermaidSvg/);
  assert.doesNotMatch(pluginSource, /function isDiagramSvg/);
  assert.doesNotMatch(pluginSource, /function waitForRenderedNode/);
  assert.doesNotMatch(pluginSource, /function svgTelemetry/);
  assert.doesNotMatch(pluginSource, /selectedStrategy/);
  assert.doesNotMatch(pluginSource, /Mermaid viewer SVG selection/);
  assert.match(pluginSource, /function assetUrl\(assetPath\)/);
  assert.match(pluginSource, /new URL\(assetPath, new URL\("\.", appScript\.src\)\)\.href/);
  assert.match(pluginSource, /new URL\(`assets\/\$\{assetPath\}`,\s*document\.baseURI\)\.href/);
  assert.doesNotMatch(pluginSource, /assetPath\.replace/);
  assert.doesNotMatch(pluginSource, /const originalRoot = renderedDiagramRoot\(original\)/);
  assert.doesNotMatch(pluginSource, /inlineComputedStyles/);
  assert.match(pluginSource, /id="render-status"/);
  assert.match(pluginSource, /Rendered from Mermaid source/);
  assert.match(pluginSource, /localStorage\.getItem\("codexPlusMermaidDebug"\) === "1"/);
  assert.doesNotMatch(pluginSource, /Fallback: cloned Codex SVG/);
  assert.doesNotMatch(pluginSource, /sourceLength: source\.length/);
  assert.doesNotMatch(pluginSource, /themedSourcePreview/);
  assert.doesNotMatch(pluginSource, /renderDetailsBody/);
  assert.match(pluginSource, /mermaid\.initialize\(\{/);
  assert.match(pluginSource, /function sourceForTheme\(\)/);
  assert.match(pluginSource, /function themeDirective\(\)/);
  assert.match(pluginSource, /String\.fromCharCode\(10\)/);
  assert.match(pluginSource, /directive\.startsWith\("%%\{init:"\)/);
  assert.match(pluginSource, /\[9, 10, 13, 32\]\.includes\(rest\.charCodeAt\(0\)\)/);
  assert.doesNotMatch(pluginSource, /source\.replace\(\/\^\\s\*%%/);
  assert.doesNotMatch(pluginSource, /const themedSource = sourceForTheme\(\)/);
  assert.match(pluginSource, /await mermaid\.render\("codex-plus-mermaid-viewer-" \+ String\(renderCount \+= 1\), sourceForTheme\(\)\)/);
  assert.match(pluginSource, /function renderFromSource\(\)/);
  assert.match(pluginSource, /let renderInFlight = false/);
  assert.match(pluginSource, /let renderQueued = false/);
  assert.match(pluginSource, /if \(renderInFlight\) \{/);
  assert.match(pluginSource, /themeToggle\.disabled = true/);
  assert.match(pluginSource, /themeToggle\.disabled = false/);
  assert.match(pluginSource, /if \(renderQueued\) \{/);
  assert.match(pluginSource, /function applyThemeChrome\(\)/);
  assert.match(pluginSource, /document\.documentElement\.dataset\.theme = darkTheme \? "dark" : "light"/);
  assert.match(pluginSource, /theme: darkTheme \? "dark" : "default"/);
  assert.doesNotMatch(pluginSource, /themeVariables/);
  assert.doesNotMatch(pluginSource, /falling back to cloned SVG/);
  assert.match(pluginSource, /id="theme-toggle"/);
  assert.match(pluginSource, /themeToggle\.addEventListener\("click", \(\) => \{ darkTheme = !darkTheme; applyThemeChrome\(\); renderQueued = true; renderFromSource\(\); \}\)/);
  assert.match(pluginSource, /id="open-live"/);
  assert.match(pluginSource, /https:\/\/mermaid\.live\/edit#base64:/);
  assert.match(pluginSource, /assetUrl\("mermaid\.core-eIokQLcr\.js"\)/);
  assert.doesNotMatch(pluginSource, /assetUrl\("assets\/mermaid\.core-eIokQLcr\.js"\)/);
  assert.doesNotMatch(pluginSource, /property\.startsWith\("--"\)/);
  assert.doesNotMatch(pluginSource, /function collectMermaidCssRules/);
  assert.doesNotMatch(pluginSource, /<svg aria-hidden/);
  assert.doesNotMatch(pluginSource, /BUTTON_CLASS} svg/);
  assert.doesNotMatch(pluginSource, /clone\.removeAttribute\("style"\)/);
  assert.doesNotMatch(pluginSource, /bestArea/);
  assert.match(pluginSource, /id="zoom-fit"/);
  assert.match(pluginSource, /id="zoom-width"/);
  assert.match(pluginSource, /id="zoom-height"/);
  assert.match(pluginSource, /<button id="zoom-out"[\s\S]*<button id="zoom-reset"[\s\S]*<button id="zoom-in"/);
  assert.match(pluginSource, /let fitMode = "fit"/);
  assert.match(pluginSource, /applyFit\(fitMode \|\| "fit"\)/);
  assert.match(pluginSource, /function fitScale\(mode\)/);
  assert.match(pluginSource, /window\.addEventListener\("resize"/);
  assert.doesNotMatch(pluginSource, /toneMapDarkNodes/);
  assert.doesNotMatch(pluginSource, /normalizeConnectorContrast/);
  assert.doesNotMatch(pluginSource, /color-mix\(in oklab/);
  assert.match(pluginSource, /svg\.style\.width = Math\.round\(base\.width \* scale\) \+ "px"/);
  assert.doesNotMatch(pluginSource, /codex-plus-mermaid-modal/);
  assert.match(pluginSource, /Escape/);
  assert.doesNotMatch(commonPatches, /codex-plus-mermaid-modal/);
  assert.doesNotMatch(commonPatches, /window\.open/);
});

test("about dialog applied patch examples stay aligned with the active patch queue", () => {
  const patchSet = patchSets.find((patchSet) => patchSet.id === "codex-26.616.51431-4212");
  const transform = collectFileTransforms(patchSet).find(([filePath]) => filePath === ".vite/build/main-B6erVVHq.js")?.[1];
  const transformed = transform(fakeAboutDialogBundle(), {
    appliedPatches: patchSet.patches.map((patch) => patch.id),
  });

  for (const patch of patchSet.patches) {
    assert.match(transformed, new RegExp(`"${patch.id}"`));
  }
  assert.doesNotMatch(transformed, /Patch descriptions:/);

  const aboutMetadata = require("../src/runtime/plugins/aboutMetadata.js");
  const payload = aboutMetadata.aboutPayload({
    appliedPatches: patchSet.patches.map((patch) => patch.id),
  });
  for (const patch of patchSet.patches) {
    assert.ok(payload.buildInfoLines.includes(`- ${patch.id}`));
  }
});

test("about dialog patch fails closed when the build information hook changes", () => {
  const patchSet = patchSets.find((patchSet) => patchSet.id === "codex-26.616.51431-4212");
  const transform = collectFileTransforms(patchSet).find(([filePath]) => filePath === ".vite/build/main-B6erVVHq.js")?.[1];

  assert.throws(
    () => transform(fakeAboutDialogBundle().replace("g=d.formatMessage({messageId:A0,defaultMessage:j0}),_=V0(o),v=", "g=d.formatMessage({messageId:A0,defaultMessage:j0}),_=[],v=")),
    /Expected one about dialog build information anchor, found 0/,
  );
});

test("diagnostic error patches delegate detail rendering to the runtime plugin", () => {
  const fakeAppShellBundle = [
    "function En(e){return(0,Q.jsx)(wn,{onRetry:()=>{e.resetError()}})}",
    "children:[r,(0,Q.jsx)(Le,{color:`secondary`,size:`default`,onClick:n,children:i})]",
    "return t[2]===n?a=t[3]:(a=(0,Q.jsxs)(`div`,{className:`flex h-full min-h-0 flex-col items-center justify-center gap-3 p-4 text-center text-sm text-token-text-secondary`,children:",
    "}),t[2]=n,t[3]=a),a}function Tn(e){return e.composedPath().some",
  ].join("");
  const fakeErrorBoundaryBundle = [
    "function Xf(e){let t=(0,Vf.c)(9),{resetError:n}=e,r=ee(),i,a;",
    "children:[i,a,(0,$.jsxs)(`div`,{className:`flex flex-wrap items-center justify-center gap-2`,children:[o,(0,$.jsx)(m,{onClick:s,children:c})]})]",
    "r=e??(e=>(0,$.jsx)(Xf,{resetError:()=>e.resetError()}));",
  ].join("");

  for (const patchSet of patchSets) {
    const appShellFile = findTransformPath(patchSet, "app-shell");
    const errorBoundaryFile = findTransformPath(patchSet, "error-boundary");
    const appShell = transformFile(patchSet, appShellFile, fakeAppShellBundle);
    const errorBoundary = transformFile(patchSet, errorBoundaryFile, fakeErrorBoundaryBundle);

    assert.match(appShell, /function CPXDiagnosticDetails\(e\)\{return window\.CodexPlus\?\.ui\?\.errors\?\.renderDetails\?\.\(e\)\?\?null\}/);
    assert.match(appShell, /CPXDiagnosticDetails\(\{jsx:Q\.jsx,error:e\.error\}\)/);
    assert.doesNotMatch(appShell, /max-h-80 max-w-full/);
    assert.match(errorBoundary, /error:CPX_error,componentStack:CPX_componentStack/);
    assert.match(errorBoundary, /CPXDiagnosticDetails\(\{jsx:\$\.jsx,error:CPX_error,componentStack:CPX_componentStack\}\)/);
    assert.doesNotMatch(errorBoundary, /CPX_errorText/);
    assert.doesNotMatch(errorBoundary, /max-h-80 max-w-full/);
  }

  const diagnosticPlugin = fs.readFileSync(path.join(__dirname, "../src/runtime/plugins/diagnosticErrors.js"), "utf8");
  const commonPatches = fs.readFileSync(path.join(__dirname, "../src/patches/lib/common-patches.js"), "utf8");
  assert.match(diagnosticPlugin, /function diagnosticText/);
  assert.match(diagnosticPlugin, /function renderDetails/);
  assert.match(diagnosticPlugin, /max-h-80 max-w-full/);
  assert.doesNotMatch(commonPatches, /max-h-80 max-w-full/);
});

test("review patch mounts repository mux before main branch selection", () => {
  const fakeBundle = [
    'import{r as vi,t as yi}from"./dropdown-CTBRoADH.js";',
    "function uf({cwd:e,fileEntries:t,generatedPathsReady:n,hasUnhandledAttributesFiles:r,isCappedMode:i,repositorySource:a,reviewSummarySource:o}){",
    "return {children:d&&!u&&c==null?(0,$.jsx)(Oa,{}):(0,$.jsx)(of,{diffRefs:t,diffMode:e,isCappedMode:d,reviewDiffMetrics:g,showReviewGitActions:v})}",
    "}",
    "function Ap(e){let t=(0,Z.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e,a=l(Nt),o;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(o=(0,$.jsx)(`div`,{className:`min-h-0 max-w-full min-w-0`,children:(0,$.jsx)(wp,{})}),t[0]=o):o=t[0];let s;t[1]!==a||t[2]!==r||t[3]!==i?(s=(0,$.jsx)(Tf,{diffMode:a,setTabState:r,tabState:i}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];let c;return c}",
  ].join("");

  for (const patchSet of patchSets) {
    const names = versionedNames(patchSet);
    const transform = collectFileTransforms(patchSet).find(
      ([filePath]) => filePath.includes("thread-side-panel-tabs"),
    )?.[1];

    assert.equal(typeof transform, "function", `${patchSet.id} has review transform`);

    const transformed = transform(fakeBundle);

    assert.ok(
      transformed.includes(
        `import{r as vi,t as yi}from"./dropdown-CTBRoADH.js";import{t as CPXBranchPickerDropdownContent}from"./${names.branchPickerDropdownContentFile}";`,
      ),
    );
    assert.match(transformed, /children:d&&!u&&c==null\?\(0,\$\.jsx\)\(Oa,\{\}\):\(0,\$\.jsx\)\(of,/);
    assert.match(
      transformed,
      /s=\(0,\$\.jsx\)\(CPXRM,\{mainReviewContent:\(0,\$\.jsx\)\(Tf,\{diffMode:a,setTabState:r,tabState:i\}\),diffMode:a,setTabState:r,tabState:i\}\)/,
    );
    assert.match(transformed, /CodexPlusHost\.adapters\.review/);
    assert.doesNotMatch(transformed, /plugins\?\.get\(`nestedRepositories`\)\?\.exports/);
    assert.match(transformed, /CPXBranchPickerDropdownContent/);
    assert.doesNotMatch(transformed, /function CPXBranchPicker/);
    assert.doesNotMatch(transformed, /function CPXRepoPatchGroup/);
    assert.doesNotMatch(transformed, /function CPXRepoDiffBody/);
    assert.doesNotMatch(transformed, /placeholder:`base`/);
    assert.doesNotMatch(transformed, /\(0,\$\.jsx\)\(`input`,\{className:`h-7 w-28/);
  }

  const pluginSource = fs.readFileSync(path.join(__dirname, "../src/runtime/plugins/nestedRepositories.js"), "utf8");
  assert.match(pluginSource, /function ReviewMux/);
  assert.match(pluginSource, /function BranchPicker/);
  assert.match(pluginSource, /function RepoPatchGroup/);
  assert.match(pluginSource, /jsx\(BranchPicker, \{ repo, hostConfig, baseBranch, setBaseBranch, deps \}\)/);
  assert.match(pluginSource, /jsx\(\s*RepoPatchGroup,/);
  const directRepoPatchGroupCalls = pluginSource
    .split("\n")
    .filter((line) => /RepoPatchGroup\(\s*(\{|$)/.test(line) && !line.includes("function RepoPatchGroup"));
  assert.deepEqual(directRepoPatchGroupCalls, []);
  assert.match(pluginSource, /method: "recent-branches"/);
  assert.match(pluginSource, /method: "search-branches"/);
});

test("worker patch allows codex plus branch picker read-only branch requests", () => {
  const fakeWorker = [
    "function pae(e,t){return e.queryClient.fetchQuery}",
    "case`submodule-paths`:a=X({paths:await pae(this.gitManager.getWorktreeRepositoryForRoot(e.params.root,r),t.signal)});break;",
    "function u2({requestKind:e,source:t}){return l2.has(e??``)||d2(t)}",
    "case`commit-message-diff`:case`submodule-paths`:case`cat-file`:",
  ].join("");

  for (const patchSet of patchSets) {
    const transform = collectFileTransforms(patchSet).find(([filePath]) => filePath === ".vite/build/worker.js")?.[1];

    assert.equal(typeof transform, "function", `${patchSet.id} has worker transform`);

    const transformed = transform(fakeWorker);

    assert.match(transformed, /case`repository-targets`:a=X\(await CPXR/);
    assert.match(transformed, /case`commit-message-diff`:case`codex-plus-trace`:case`repository-targets`:case`submodule-paths`:case`cat-file`:/);
    assert.match(transformed, /const CPXW=require\("\.\/codex-plus-worker\.js"\)/);
    assert.match(transformed, /CPXB=\(e,t\)=>CPXW\.isReadOnlyBranchRequest\(e,t\)/);
    assert.match(
      transformed,
      /function u2\(\{requestKind:e,source:t\}\)\{return l2\.has\(e\?\?``\)\|\|d2\(t\)\|\|CPXB\(e,t\)\}/,
    );
  }

  const workerSource = fs.readFileSync(path.join(__dirname, "../src/runtime/host/worker.js"), "utf8");
  assert.match(workerSource, /function repositoryTargets/);
  assert.match(workerSource, /function repositoryTargetsFromHost/);
  assert.match(workerSource, /function isReadOnlyBranchRequest/);
  assert.match(workerSource, /recent-branches/);
  assert.match(workerSource, /search-branches/);
});

test("appearance settings patch adds user bubble colors and project colors only", () => {
  const fakeSettingsBundle = [
    "chromeThemeCodeFont:{id:`settings.general.appearance.chromeTheme.codeFontFamily.short`,defaultMessage:`Code font`,description:`Short label for the code font input`},pointerCursors:",
    "function tn({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){",
    "let r=a(s),i=N(),o=i.formatMessage(Q.chromeThemeAccent),c=i.formatMessage(Q.chromeThemeBackground),l=i.formatMessage(Q.chromeThemeForeground),u=i.formatMessage(Q.chromeThemeContrast),d=i.formatMessage(Q.chromeThemeTranslucentSidebar),",
    "children:[D.map(e=>(0,Z.jsx)(J,{control:(0,Z.jsx)(sn,{ariaLabel:e.ariaLabel,value:x[e.role],onChange:t=>{k(e.role,t)}}),label:e.label,variant:`nested`},e.role)),O.map",
  ].join("");

  for (const patchSet of patchSets) {
    const settingsFile = findTransformPath(patchSet, "general-settings");
    const transforms = collectFileTransforms(patchSet).filter(
      ([filePath]) => filePath === settingsFile,
    );

    assert.equal(transforms.length, 1, `${patchSet.id} has one generic appearance settings transform`);

    const transformed = transformFile(patchSet, settingsFile, fakeSettingsBundle);

    assert.match(transformed, /ui\?\.settings\?\.appearance\?\.renderRows/);
    assert.doesNotMatch(transformed, /CPX_USER_BUBBLE_OVERRIDE_KEY/);
    assert.doesNotMatch(transformed, /codex-plus:user-bubble-color-override/);
    assert.doesNotMatch(transformed, /CPX_PROJECT_PALETTE/);
    assert.doesNotMatch(transformed, /CPX_PROJECT_COLORS_ENABLED_KEY/);
    assert.doesNotMatch(transformed, /userBubbleOverride/);
    assert.doesNotMatch(transformed, /CPX_userBubbleTextColor/);
    assert.doesNotMatch(transformed, /CPX_userBubbleOverrideLabel/);
    assert.match(transformed, /\.\.\.CPXAppearanceRows\(n\),O\.map/);
    assert.doesNotMatch(transformed, /CPXUserBubbleColorRow/);
    assert.doesNotMatch(transformed, /CPXProjectColorToggleRow/);
    assert.doesNotMatch(transformed, /CPXUserBubbleOverrideToggleRow/);
    assert.doesNotMatch(transformed, /custom user bubble colors override project colors/);
  }

  const projectPlugin = fs.readFileSync(path.join(__dirname, "../src/runtime/plugins/projectColors.js"), "utf8");
  const bubblePlugin = fs.readFileSync(path.join(__dirname, "../src/runtime/plugins/userBubbleColors.js"), "utf8");
  assert.match(projectPlugin, /const STORAGE_KEY = "codex-plus:project-colors-enabled"/);
  assert.match(projectPlugin, /function fnv1a32\(value\)/);
  assert.match(projectPlugin, /0x811c9dc5/);
  assert.match(projectPlugin, /0x01000193/);
  assert.ok((projectPlugin.match(/#[0-9a-fA-F]{6}/g) ?? []).length >= 32);
  assert.match(projectPlugin, /render: \(deps\) => renderToggleRow/);
  assert.match(bubblePlugin, /const STORAGE_KEY = "codex-plus:user-message-bubble-colors"/);
  assert.match(bubblePlugin, /function textColor/);
  assert.match(bubblePlugin, /render: \(deps\) => renderColorRow/);
});

test("app main patch applies project colors to project headers and grouped row options", () => {
  const fakeAppMainBundle = [
    "function Pk(e){let t=(0,Q.c)(45),",
    "openFolder:$y,toggleSidebar:$i,toggleTerminal:Md,",
    "H=Ha.sidebarProjectList({projectId:i.projectId,showAll:x})",
    "t[19]!==V||t[20]!==s||t[21]!==l||t[22]!==b||t[23]!==o||t[24]!==a?",
    "q={onActivateGroup:V,onStartNewConversation:a,isGrouped:!0,hideRemoteHostEnvIcon:!0,hideTimestamp:l,locationId:b,floatStatusIconsRight:s,showPinActionOnHover:o}",
    "t[19]=V,t[20]=s,t[21]=l,t[22]=b,t[23]=o,t[24]=a,t[25]=q):q=t[25]",
    "ie=(0,Z.jsx)(`div`,{...H,children:re})",
    "O=(0,Z.jsx)(NO,{action:T,actionTooltipContent:h,actionTooltipDisabled:p,indicator:E,isMenuOpen:g,menu:D})",
    "Ke=(0,Z.jsx)(Oe,{rowAttributes:ke,className:Ae,collapsed:L,contentClassName:je,",
    "children:n.label}),t[62]=Oe,",
    "children:[l,u,(0,Z.jsx)(H_,{route:a,children:C})]",
  ].join("");

  for (const patchSet of patchSets) {
    const appMainFile = findTransformPath(patchSet, "app-main");
    const transforms = collectFileTransforms(patchSet).filter(
      ([filePath]) => filePath === appMainFile,
    );

    assert.equal(transforms.length, 2, `${patchSet.id} has split app main transforms`);

    const transformed = transformFile(patchSet, appMainFile, fakeAppMainBundle);

    assert.match(transformed, /CPXS=window\.CodexPlusHost\.adapters\.sidebar/);
    assert.match(transformed, /CPXPR=e=>CPXS\.projectRowProps\(e\)/);
    assert.match(transformed, /CPXTR=e=>CPXS\.threadRowProps\(e\)/);
    assert.match(transformed, /rowAttributes:\{\.\.\.ke,\.\.\.CPXPR\(n\)\}/);
    assert.match(transformed, /dataAttributes:CPXTR\(i\)/);
    assert.match(transformed, /"data-codex-plus-sidebar-name":``/);
    assert.doesNotMatch(transformed, /function CPXSidebarNameBlurCommand\(\)/);
    assert.match(transformed, /ui\?\.commands\?\.renderMenuItems/);
    assert.match(transformed, /MenuItem:Zy,register:Hp/);
    assert.match(transformed, /codexPlusToggleSidebarNameBlur:\$i/);
    assert.doesNotMatch(transformed, /localStorage\.(?:setItem|getItem)\(`codex-plus:sidebar/);
    assert.match(transformed, /children:\[l,u,\.\.\.\(window\.CodexPlus\?\.ui\?\.commands\?\.renderMenuItems/);
    assert.match(transformed, /function Pk\(e\)\{let t=\(0,Q\.c\)\(46\),/);
    assert.match(transformed, /t\[24\]!==a\|\|t\[45\]!==i\?/);
    assert.match(transformed, /t\[24\]=a,t\[45\]=i,t\[25\]=q\):q=t\[25\]/);
    assert.doesNotMatch(transformed, /CPX_PROJECT_PALETTE/);
    assert.doesNotMatch(transformed, /CPX_installProjectColorStyles/);
  }

  const projectPlugin = fs.readFileSync(path.join(__dirname, "../src/runtime/plugins/projectColors.js"), "utf8");
  const blurPlugin = fs.readFileSync(path.join(__dirname, "../src/runtime/plugins/sidebarNameBlur.js"), "utf8");
  assert.match(projectPlugin, /data-codex-plus-project-sidebar-color/);
  assert.match(projectPlugin, /data-app-action-sidebar-thread-active=\\"true\\"/);
  assert.match(projectPlugin, /box-shadow:inset 5px 0 0 var\(--codex-plus-project-accent\)/);
  assert.match(projectPlugin, /--codex-plus-project-separator-light/);
  assert.match(projectPlugin, /background-size:2px 100%/);
  assert.match(blurPlugin, /data-codex-plus-sidebar-names-blurred/);
});

test("local task row patch colors standalone rows from row project context", () => {
  const fakeLocalTaskRowBundle = [
    "function fn(e){let t=(0,K.c)(124),",
    "threadSummary:Ne,dataAttributes:Fe}=e,Ie=g===void 0?!1:g,",
    "t[87]!==Fe",
    "dataAttributes:Fe,archiveAriaLabel:hn",
    "t[87]=Fe",
  ].join("");

  for (const patchSet of patchSets) {
    const transform = collectFileTransforms(patchSet).find(
      ([filePath]) => filePath === findTransformPath(patchSet, "local-task-row"),
    )?.[1];

    assert.equal(typeof transform, "function", `${patchSet.id} has local task row transform`);

    const transformed = transform(fakeLocalTaskRowBundle);

    assert.doesNotMatch(transformed, /CPX_threadProjectAssignments/);
    assert.match(transformed, /CPX_rowDataAttributes=Fe\?\?CPXPR\(Oe\)/);
    assert.match(transformed, /dataAttributes:CPX_rowDataAttributes/);
    assert.match(transformed, /t\[87\]!==CPX_rowDataAttributes/);
    assert.match(transformed, /t\[87\]=CPX_rowDataAttributes/);
  }
});

test("command metadata exposes static project selector shortcut and runtime DevTools command", () => {
  const fakeElectronMenuShortcutsBundle = [
    "{id:`toggleSidebar`,titleIntlId:`codex.command.toggleSidebar`,descriptionIntlId:`codex.commandDescription.toggleSidebar`,commandMenuGroupKey:`panels`,commandMenu:!0,electron:{menuTitle:`Toggle Sidebar`,menuTitleIntlId:`codex.commandMenuTitle.toggleSidebar`,defaultKeybindings:[{key:`CmdOrCtrl+B`}]}},{id:`toggleBottomPanel`,",
  ].join("");
  const devToolsPlugin = fs.readFileSync(path.join(__dirname, "../src/runtime/plugins/devTools.js"), "utf8");

  assert.match(devToolsPlugin, /id: "codexPlusOpenDevTools"/);
  assert.match(devToolsPlugin, /title: "Open Developer Tools"/);
  assert.match(devToolsPlugin, /menu: \{ groups: \["panels"\] \}/);
  assert.match(devToolsPlugin, /shortcut: \{ defaultKeybindings: \[\] \}/);
  assert.match(devToolsPlugin, /CodexPlus\.native\.request\("devtools\/open"\)/);

  for (const patchSet of patchSets) {
    const expectedFiles = ["webview/assets/electron-menu-shortcuts-j6UKqTX5.js"];
    const transforms = collectFileTransforms(patchSet).filter(([filePath]) => expectedFiles.includes(filePath));

    assert.equal(transforms.length, expectedFiles.length, `${patchSet.id} patches known command metadata bundles`);

    for (const [filePath, transform] of transforms) {
      const transformed = transform(fakeElectronMenuShortcutsBundle);
      const commandStart = transformed.indexOf("window.CodexPlus?.ui?.commands?.commandMetadata");
      const commandEnd = transformed.indexOf("},{id:`toggleBottomPanel`");
      const commandMetadata = transformed.slice(commandStart, commandEnd);

      assert.notEqual(commandStart, -1, `${filePath} inserts runtime command metadata`);
      assert.match(transformed, /id:`codexPlus\.focusProjectSelector`/);
      assert.match(transformed, /title:`Focus project selector`/);
      assert.match(transformed, /description:`Focus or open the new chat project selector`/);
      assert.match(transformed, /commandMenuGroupKey:`workspace`/);
      assert.match(transformed, /menuTitle:`Focus project selector`/);
      assert.match(transformed, /defaultKeybindings:\[\{key:`CmdOrCtrl\+\.`\}\]/);
      assert.ok(commandMetadata.includes("window.CodexPlus?.ui?.commands?.commandMetadata?.()?.filter?."));
      assert.match(commandMetadata, /filter\?\.\(e=>e\.id!==`codexPlus\.focusProjectSelector`\)/);
      assert.doesNotMatch(commandMetadata, /id:`codexPlusOpenDevTools`/);
      assert.doesNotMatch(commandMetadata, /codexPlusToggleSidebarNameBlur/);
      assert.doesNotMatch(commandMetadata, /localStorage/);
    }
  }
});

test("keyboard shortcut search metadata falls back to command declaration titles", () => {
  const fakeKeyboardShortcutsSearchBundle = [
    "\"codex.command.toggleSidebar\":{id:`codex.command.toggleSidebar`,defaultMessage:`Toggle sidebar`,description:`Command menu item to toggle the sidebar`},\"codex.command.toggleBottomPanel\":",
    "\"codex.commandMenuTitle.toggleSidebar\":{id:`codex.commandMenuTitle.toggleSidebar`,defaultMessage:`Toggle Sidebar`,description:`Native menu item to toggle the sidebar`},\"codex.commandMenuTitle.toggleBottomPanel\":",
    "\"codex.commandDescription.toggleSidebar\":{id:`codex.commandDescription.toggleSidebar`,defaultMessage:`Show or hide the sidebar`,description:`Description for the Toggle sidebar command`},\"codex.commandDescription.toggleBottomPanel\":",
    "function d(e,t){return`titleIntlId`in e?t.formatMessage(c[e.titleIntlId]):t.formatMessage(l[e.electron.menuTitleIntlId])}",
  ].join("");

  for (const patchSet of patchSets) {
    const transform = collectFileTransforms(patchSet).find(
      ([filePath]) => filePath === findTransformPath(patchSet, "keyboard-shortcuts-search-input"),
    )?.[1];

    assert.equal(typeof transform, "function", `${patchSet.id} has keyboard shortcut search transform`);

    const transformed = transform(fakeKeyboardShortcutsSearchBundle);

    assert.doesNotMatch(transformed, /codexPlus\.command\.toggleSidebarNameBlur/);
    assert.match(transformed, /t\.formatMessage\(c\[e\.titleIntlId\]\)/);
    assert.match(transformed, /e\.title\?\?e\.electron\?\.menuTitle\?\?t\.formatMessage\(l\[e\.electron\.menuTitleIntlId\]\)/);
  }
});

test("sidebar thread list forwards project color data attributes into rows", () => {
  const fakeSidebarRowsBundle = [
    "function Ft(e,t,n){",
    "var En=(0,Vt.memo)(function(e){let t=(0,zt.c)(40),{threadKey:n,canPin:r,disableHoverCard:a,floatStatusIconsRight:o,isGrouped:s,hideRemoteHostEnvIcon:c,hideTimestamp:l,locationId:u,onActivateGroup:d,onStartNewConversation:f,showPinActionOnHover:p,variant:m,shortcutLabel:h,onArchiveStart:g,onArchiveSuccess:_,onArchiveError:v}=e,",
    "t[12]!==A||t[13]!==y||t[14]!==b||t[15]!==F||t[16]!==x||t[17]!==B||t[18]!==L||t[19]!==z||t[20]!==ee||t[21]!==te||t[22]!==j||t[23]!==M||t[24]!==N||t[25]!==P||t[26]!==k||t[27]!==S||t[28]!==C||t[29]!==d||t[30]!==f||t[31]!==h||t[32]!==w||t[33]!==V||t[34]!==T?",
    "onArchiveStart:L,onArchiveSuccess:z,onArchiveError:B}",
    "t[32]=w,t[33]=V,t[34]=T,t[35]=H):H=t[35]",
    "function On(e){let t=(0,zt.c)(121),{entry:n,isPinned:r,isAutomationRun:a,automationDisplayName:o,isActive:s,canPin:c,disableHoverCard:u,floatStatusIconsRight:f,isGrouped:p,hideRemoteHostEnvIcon:m,hideTimestamp:h,locationId:g,onActivateGroup:y,onStartNewConversation:b,showPinActionOnHover:te,variant:C,shortcutLabel:T,hoverCardHostConfig:E,hoverCardProjectId:D,hoverCardProjectLabel:A,hoverCardRepositoryLabel:j,displayCwd:M,onArchiveStart:N,onArchiveSuccess:P,onArchiveError:F}=e,",
    "dataAttributes:ae.sidebarThreadRow({active:s,hostId:t.hostId,id:n,kind:`pending-worktree`,pinned:r,title:t.label})",
    "dataAttributes:ae.sidebarThreadRow({active:s,hostId:null,id:t,kind:`remote`,pinned:r,title:e.task.title??``})",
    "dataAttributes:ae.sidebarThreadRow({active:s,hostId:f,id:i,kind:`local`,pinned:r,title:x})",
    "t[22]=c,t[23]=se,t[24]=Ne,t[25]=L,t[26]=Je,t[27]=J,t[28]=oe,t[29]=V,t[30]=G,t[31]=s,t[32]=z,t[33]=r,t[34]=g,t[35]=K,t[36]=y,t[37]=P,t[38]=le,t[39]=W,t[40]=ue,t[41]=et,t[42]=H,t[43]=U,t[44]=st):st=t[44]",
    "t[45]!==c||t[46]!==Ne||t[47]!==Fe||t[48]!==L||t[49]!==Je||t[50]!==J||t[51]!==oe||t[52]!==V||t[53]!==G||t[54]!==s||t[55]!==z||t[56]!==r||t[57]!==g||t[58]!==F||t[59]!==P||t[60]!==nt||t[61]!==Q||t[62]!==We||t[63]!==W||t[64]!==Xe||t[65]!==et||t[66]!==H||t[67]!==U?",
    "t[63]=W,t[64]=Xe,t[65]=et,t[66]=H,t[67]=U,t[68]=ht):ht=t[68]",
    "t[69]!==o||t[70]!==c||t[71]!==I||t[72]!==ot||t[73]!==M||t[74]!==Pe||t[75]!==Ne||t[76]!==Fe||t[77]!==L||t[78]!==Je||t[79]!==J||t[80]!==ne||t[81]!==oe||t[82]!==V||t[83]!==E||t[84]!==A||t[85]!==G||t[86]!==s||t[87]!==a||t[88]!==z||t[89]!==r||t[90]!==pe||t[91]!==fe||t[92]!==he||t[93]!==Be||t[94]!==De||t[95]!==null||t[96]!==_e||t[97]!==me||t[98]!==ge||t[99]!==g||t[100]!==y||t[101]!==F||t[102]!==P||t[103]!==nt||t[104]!==Q||t[105]!==W||t[106]!==Xe||t[107]!==et||t[108]!==H||t[109]!==be||t[110]!==U?",
    "t[108]=H,t[109]=be,t[110]=U,t[111]=vt):vt=t[111]",
    "t[14]!==l?.canPin||t[15]!==l?.disableHoverCard||t[16]!==l?.floatStatusIconsRight||t[17]!==l?.hideRemoteHostEnvIcon||t[18]!==l?.hideTimestamp||t[19]!==l?.isGrouped||t[20]!==l?.locationId||t[21]!==l?.onActivateGroup||t[22]!==l?.onStartNewConversation||t[23]!==l?.showPinActionOnHover||t[24]!==l?.variant||t[25]!==b?",
    "showPinActionOnHover:l?.showPinActionOnHover,variant:l?.variant,shortcutLabel:b?.get(e)}),",
    "t[24]=l?.variant,t[25]=b,t[26]=j):j=t[26]",
    "function Rn(e){let t=(0,zt.c)(43),",
  ].join("");

  for (const patchSet of patchSets) {
    const transform = collectFileTransforms(patchSet).find(
      ([filePath]) => filePath === findTransformPath(patchSet, "sidebar-project-hover-card-source-rows"),
    )?.[1];

    assert.equal(typeof transform, "function", `${patchSet.id} has sidebar row list transform`);

    const transformed = transform(fakeSidebarRowsBundle);

    assert.doesNotMatch(transformed, /function CPX_mergeDataAttributes\(e,t\)/);
    assert.match(transformed, /dataAttributes:CPX_rowDataAttributes/);
    assert.match(transformed, /dataAttributes:l\?\.dataAttributes/);
    assert.match(transformed, /CodexPlusHost\.adapters\.sidebar\.mergeThreadRowAttributes\(ae\.sidebarThreadRow\(\{active:s,hostId:f,id:i,kind:`local`,pinned:r,title:x\}\),CPX_rowDataAttributes\)/);
    assert.match(transformed, /CodexPlusHost\.adapters\.sidebar\.mergeThreadRowAttributes\(ae\.sidebarThreadRow\(\{active:s,hostId:null,id:t,kind:`remote`,pinned:r,title:e\.task\.title\?\?``\}\),CPX_rowDataAttributes\)/);
    assert.match(transformed, /CodexPlusHost\.adapters\.sidebar\.mergeThreadRowAttributes\(ae\.sidebarThreadRow\(\{active:s,hostId:t\.hostId,id:n,kind:`pending-worktree`,pinned:r,title:t\.label\}\),CPX_rowDataAttributes\)/);
    assert.match(transformed, /function Rn\(e\)\{let t=\(0,zt\.c\)\(44\),/);
    assert.match(transformed, /var En=\(0,Vt\.memo\)\(function\(e\)\{let t=\(0,zt\.c\)\(41\),/);
    assert.match(transformed, /function On\(e\)\{let t=\(0,zt\.c\)\(124\),/);
    assert.match(transformed, /t\[43\]!==l\?\.dataAttributes/);
    assert.match(transformed, /t\[123\]!==CPX_rowDataAttributes/);
  }
});

test("user message patch applies variant-specific bubble colors with default fallback", () => {
  const fakeUserMessageBundle = [
    'import{Aa as x,Ta as S}from"./__SRC_FILE__";',
    'import{t as ze}from"./use-measured-text-collapse-BhNFLYvW.js";',
    "var Z=i(),Q=e(n(),1),$=r();function Ue(e){return null}",
    "function it(){return(0,$.jsx)(`form`,{className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),v()},children:null})}",
    "function ot(e){let t=(0,Z.c)(93),{message:n,sentAtMs:r,collapsedLineCount:i,alwaysShowActions:a,compactActions:u,messageStatus:f,messageStatusIcon:p,hookStats:m,threadDetailLevel:h,referencesPriorConversation:g,reviewMode:_,pullRequestFixMode:v,autoResolveSync:y,hasExternalAttachments:b,commentCount:ee,onEditMessage:x,threadId:S,turnId:w,cwd:T,hostId:k}=e,M=a===void 0?!1:a,N=u===void 0?!1:u,P=g===void 0?!1:g,F=_===void 0?!1:_,I=v===void 0?!1:v,L=y===void 0?!1:y,te=b===void 0?!1:b,R=ee===void 0?0:ee,z=s(re),B=l(n),V=B.trim(),H=x!=null&&w!=null&&!B.startsWith(`PLEASE IMPLEMENT THIS PLAN:`),[ie,ae]=(0,Q.useState)(!1),U=o(at,w),W=H&&U!=null,G=C(),oe=c(ne),se=B.startsWith(`PLEASE IMPLEMENT THIS PLAN:`)?G.formatMessage({id:`codex.userMessage.implementPlan`,defaultMessage:`Yes, implement this plan`,description:`Display text for the synthetic implement-plan follow-up prompt`}):B,K=se.trim().length>0,ce=P||F||I||L||te||R>0,le=K||!ce,ue=ce||f!=null||!N,de;",
    "let xe=be,Y,Se;if(t[27]!==H){let e=D(`bg-token-foreground/5 max-w-[77%] min-w-0 overflow-hidden break-words rounded-2xl px-3 py-2 [&_.contain-inline-size]:[contain:initial]`,!K&&`leading-none`),n;Se=W?(0,$.jsx)(`div`,{className:`w-full p-px`,children:(0,$.jsx)(it,{cwd:T??null,hostId:k,initialMessage:U.trim(),onCancel:()=>{q(null)},onDraftChange:e=>{q(e)},onSubmit:ge})}):le?(0,$.jsx)(`div`,{\"data-user-message-bubble\":!0,role:H?`button`:void 0,tabIndex:0,className:D(e,`text-left focus-visible:ring-2 focus-visible:ring-token-focus-border focus-visible:outline-none`,H&&`cursor-interaction`),children:xe}):null}",
  ].join("");

  for (const patchSet of patchSets) {
    const names = versionedNames(patchSet);
    const userMessageAttachmentsFile = findTransformPath(patchSet, "user-message-attachments");
    const fakeBundle = fakeUserMessageBundle.replace("__SRC_FILE__", names.srcFile);
    const transforms = collectFileTransforms(patchSet).filter(
      ([filePath]) => filePath === userMessageAttachmentsFile,
    );

    assert.equal(transforms.length, 2, `${patchSet.id} has split user message transforms`);

    const transformed = transformFile(patchSet, userMessageAttachmentsFile, fakeBundle);

    assert.match(transformed, /CPXMC=window\.CodexPlusHost\.adapters\.messageComposer/);
    assert.match(transformed, /CPXBubbleProps=e=>CPXMC\.userBubbleProps\(e\)/);
    assert.doesNotMatch(transformed, /CPX_USER_BUBBLE_OVERRIDE_KEY/);
    assert.doesNotMatch(transformed, /CPX_userBubbleOverrideEnabled/);
    assert.doesNotMatch(transformed, /function CPX_projectColorStyle\(e\)/);
    assert.ok(transformed.includes(`import{t as CPX_localThreadKey}from"./${names.sidebarThreadKeysFile}";`));
    assert.ok(transformed.includes(`import{s as CPX_threadProjectId}from"./${names.sidebarThreadRowSignalsFile}";`));
    assert.doesNotMatch(transformed, /CPX_userBubbleTextColor/);
    assert.doesNotMatch(transformed, /--codex-plus-user-bubble-light-bg/);
    assert.doesNotMatch(transformed, /CPX_PROJECT_PALETTE/);
    assert.doesNotMatch(transformed, /\[data-codex-plus-user-bubble\]\[data-codex-plus-project-color\]\).*background-color:var\(--codex-plus-project/);
    assert.match(transformed, /CPX_userMessageProjectId=o\(CPX_threadProjectId,S==null\?null:CPX_localThreadKey\(S\)\)/);
    assert.doesNotMatch(transformed, /CPX_userMessageProjectStyle/);
    assert.match(transformed, /"data-user-message-bubble":!0,\.\.\.CPXBubbleProps\(\{project:CPX_userMessageProjectId\}\),role:H\?`button`:void 0/);
    assert.match(transformed, /"data-codex-plus-user-entry":!0,className:`relative flex w-full flex-col rounded-3xl bg-token-foreground\/5`/);
    assert.match(transformed, /bg-token-foreground\/5 max-w-\[77%\]/);
  }

  const bubblePlugin = fs.readFileSync(path.join(__dirname, "../src/runtime/plugins/userBubbleColors.js"), "utf8");
  assert.match(bubblePlugin, /function textColor/);
  assert.match(bubblePlugin, /--codex-plus-user-bubble-light-bg/);
});

test("composer patch applies the user entry marker and shared color variables", () => {
  const fakeComposerBundle = [
    'import{$t as q,A as oe,At as se,Ca as ce,D as J,Dt as le,Ea as ue,Fi as de,Ht as fe,Ii as pe,It as me,J as he,Jn as ge,Li as _e,Lt as ve,M as ye,Mi as be,Mt as xe,Pi as Se,Ri as Ce,Sa as we,T as Te,Vt as Ee,Yn as De,Zi as Oe,an as ke,bt as Ae,cn as je,dt as Me,en as Ne,ft as Pe,in as Fe,kt as Ie,ln as Le,m as Re,n as ze,on as Be,ot as Ve,p as He,pa as Ue,ra as We,rn as Ge,sn as Ke,st as qe,tr as Je,vt as Ye,xa as Xe,yt as Ze,z as Qe}from"./__THREAD_CONTEXT_INPUTS_FILE__";',
    "function oh(e){let t=(0,$.c)(13),{children:n,className:r,externalFooterVariant:i,inert:a,isDragActive:o,layout:s,onDragEnter:c,onDragLeave:l,onDragOver:u,onDrop:d}=e,f=i===void 0?`default`:i,p=o===void 0?!1:o,m=s===void 0?`multiline`:s,h=f===`home`&&`z-10`,g=m===`single-line`?`overflow-visible rounded-full`:rh.multilineSurface,_=p&&`bg-token-dropdown-background/50`,v;t[0]!==r||t[1]!==h||t[2]!==g||t[3]!==_?(v=qt(`relative flex flex-col border border-token-input-border bg-token-input-background/90 shadow-[0_4px_16px_0_rgba(0,0,0,0.05)] backdrop-blur-lg electron:dark:bg-token-dropdown-background`,h,g,_,r),t[0]=r,t[1]=h,t[2]=g,t[3]=_,t[4]=v):v=t[4];let y;return t[5]!==n||t[6]!==a||t[7]!==c||t[8]!==l||t[9]!==u||t[10]!==d||t[11]!==v?(y=(0,Q.jsx)(Jt.div,{inert:a,className:v,onDragEnter:c,onDragOver:u,onDragLeave:l,onDrop:d,children:n}),t[5]=n,t[6]=a,t[7]=c,t[8]=l,t[9]=u,t[10]=d,t[11]=v,t[12]=y):y=t[12],y}",
    "Il=(0,Q.jsx)(_n,{onOpen:()=>{Bc.prepare(),X.toggleContextSuggestions()}});return",
    "):(0,Q.jsxs)(ah,{className:A,externalFooterVariant:k,inert:Y,isDragActive:jo,layout:Nl,onDragEnter:kl?void 0:il,onDragOver:kl?void 0:sl,onDragLeave:kl?void 0:al,onDrop:kl?void 0:ll,children:",
  ].join("");

  for (const patchSet of patchSets) {
    const names = versionedNames(patchSet);
    const composerFile = findTransformPath(patchSet, "composer");
    let fakeBundle = fakeComposerBundle.replace("__THREAD_CONTEXT_INPUTS_FILE__", names.threadContextInputsFile);
    if (patchSet.id === "codex-26.616.81150-4306" || patchSet.id === "codex-26.616.71553-4265") {
      fakeBundle = fakeBundle
        .replace(
          "Il=(0,Q.jsx)(_n,{onOpen:()=>{Bc.prepare(),X.toggleContextSuggestions()}});return",
          "Rl=(0,Q.jsx)(_n,{onOpen:()=>{Uc.prepare(),X.toggleContextSuggestions()}});return",
        )
        .replace(
          "):(0,Q.jsxs)(ah,{className:A,externalFooterVariant:k,inert:Y,isDragActive:jo,layout:Nl,onDragEnter:kl?void 0:il,onDragOver:kl?void 0:sl,onDragLeave:kl?void 0:al,onDrop:kl?void 0:ll,children:",
          "):(0,Q.jsxs)(ah,{className:A,externalFooterVariant:k,inert:Y,isDragActive:Po,layout:Fl,onDragEnter:Ml?void 0:sl,onDragOver:Ml?void 0:dl,onDragLeave:Ml?void 0:ll,onDrop:Ml?void 0:fl,children:",
        );
    }
    const transforms = collectFileTransforms(patchSet).filter(
      ([filePath]) => filePath === composerFile,
    );

    assert.equal(transforms.length, 2, `${patchSet.id} has split composer transforms`);

    const transformed = transformFile(patchSet, composerFile, fakeBundle);

    assert.match(transformed, /CPXMC=window\.CodexPlusHost\.adapters\.messageComposer/);
    assert.match(transformed, /CPXSurfaceProps=e=>CPXMC\.composerSurfaceProps\(e\)/);
    assert.ok(transformed.includes(`import{t as CPX_localThreadKey}from"./${names.sidebarThreadKeysFile}";`));
    assert.ok(transformed.includes(`import{s as CPX_threadProjectId}from"./${names.sidebarThreadRowSignalsFile}";`));
    assert.match(transformed, /function oh\(e\)\{let t=\(0,\$\.c\)\(14\)/);
    assert.doesNotMatch(transformed, /\[data-codex-plus-user-entry\]\[data-codex-plus-project-color\].*background-color:var\(--codex-plus-project/);
    assert.doesNotMatch(transformed, /--codex-plus-user-bubble-light-bg/);
    assert.doesNotMatch(transformed, /CPX_userBubbleTextColor/);
    assert.match(transformed, /\.\.\.CPX_surfaceProps,className:v/);
    assert.doesNotMatch(transformed, /CPX_projectColorInlineStyle/);
    assert.match(transformed, /CPX_composerThreadProjectId=a\(CPX_threadProjectId,G==null\?null:CPX_localThreadKey\(G\)\)/);
    assert.match(transformed, /CPX_composerSurfaceProps=CPXSurfaceProps\(\{project:G==null\?On\?\{hostId:On\.hostId,path:On\.remotePath,projectId:kn,label:On\.label\?\?On\.name\}:x\?\?void 0:CPX_composerThreadProjectId\}\);return/);
    assert.match(transformed, /codexPlusProps:!Ge&&!Hn\?CPX_composerSurfaceProps:void 0/);
    assert.doesNotMatch(transformed, /style:!Ge&&!Hn\?CPX_projectColorStyle\(.*a\(CPX_threadProjectId/);
  }

  const bubblePlugin = fs.readFileSync(path.join(__dirname, "../src/runtime/plugins/userBubbleColors.js"), "utf8");
  const projectPlugin = fs.readFileSync(path.join(__dirname, "../src/runtime/plugins/projectColors.js"), "utf8");
  assert.match(bubblePlugin, /--codex-plus-user-bubble-dark-fg/);
  assert.match(projectPlugin, /--codex-plus-project-separator-dark/);
  assert.match(projectPlugin, /background-size:2px 100%/);
});
