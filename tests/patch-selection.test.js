const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { patchAsar, readAsar, sha256, transformAsarBuffer, walkFiles } = require("../src/core/asar");
const {
  applyPatchSet,
  collectAssetFiles,
  collectFileTransforms,
  collectInfoPlistStrings,
  mergeRuntimeConfig,
  preflightPatchSet,
  selectPatch,
} = require("../src/core/patch-engine");
const { patchSets } = require("../src/patches");
const { replaceOnce } = require("../src/patches/lib/replace");
const { makePatchSet } = require("../src/patches/lib/make-patch-set");
const { patchSetOwnsTransformVariant, patchSetUsesTransformVariant } = require("../src/patches/lib/transform-ownership");
const { patchHomeProjectDropdownProjectSelectorShortcut } = require("../src/patches/lib/project-selector-shortcut-patch");
const {
  browserRuntimeFilesForConfig,
  codexPlusRuntimeAssets,
  fzfRuntimeAssetPath,
  runtimeFiles,
} = require("../src/runtime/assets");

const codexPatchSets = patchSets.filter((patchSet) => patchSet.runtimeConfig?.sourceFamily !== "chatgpt");
const chatgptPatchSets = patchSets.filter((patchSet) => patchSet.runtimeConfig?.sourceFamily === "chatgpt");

function ownedTestTransform(patchSetId, variantId, transformOrder, transform = (text) => text) {
  Object.defineProperties(transform, {
    ownerPatchSetId: { value: patchSetId },
    owningPatchSetIds: { value: [patchSetId] },
    variantId: { value: variantId },
    transformOrder: { value: transformOrder },
  });
  return transform;
}

function transformFile(patchSet, filePath, text, context) {
  return collectFileTransforms(patchSet)
    .filter(([candidate]) => candidate === filePath)
    .reduce((current, [, transform]) => {
      try {
        return transform(current, context);
      } catch (error) {
        if (error?.message?.startsWith("Expected one ")) return current;
        throw error;
      }
    }, text);
}

function findTransformPath(patchSet, fileNamePrefix) {
  const transforms = collectFileTransforms(patchSet);
  const transformNames = {
    "app-main": "patchAppMainProjectColors",
    "app-protocol": "patchAppProtocolRoutes",
    "app-shell": "patchAppShell",
    composer: "patchComposerBubbleColors",
    composerPrimitive: "patchComposerPrimitiveSurface",
    "electron-menu-shortcuts": "patchElectronMenuShortcuts",
    "error-boundary": "patchErrorBoundary",
    "general-settings": "patchGeneralSettingsUserBubbleColors",
    header: "patchHeader",
    "keyboard-shortcuts-search-input": "patchKeyboardShortcutsSearchInput",
    "home-project-dropdown": "patchHomeProjectDropdownProjectSelectorShortcut",
    "local-active-workspace-root-dropdown": "patchLocalActiveWorkspaceRootDropdownProjectSelectorShortcut",
    "local-conversation-page": "patchLocalConversationPageHeader",
    "local-task-row": "patchLocalTaskRow",
    review: "patchThreadSidePanelTabs",
    "run-command": "patchRunCommandProjectSelectorShortcut",
    "statsig-startup": "patchStatsigDevFallback",
    "user-message-attachments": "patchUserMessageAttachmentsBubbleColors",
  };
  const transformName = transformNames[fileNamePrefix];
  const pathByTransformName = transforms.find(([, transform]) => transform.name === transformName)?.[0];
  if (pathByTransformName) return pathByTransformName;

  const filePath = transforms.find(([candidate]) => {
    const fileName = candidate.split("/").pop();
    return fileName === fileNamePrefix || fileName.startsWith(`${fileNamePrefix}-`);
  })?.[0];
  if (filePath) return filePath;

  assert.ok(pathByTransformName, `${patchSet.id} has ${fileNamePrefix} transform`);
  return null;
}

function logicalTransformName(fileNamePrefix) {
  return {
    "app-main": "patchAppMainProjectColors",
    "app-protocol": "patchAppProtocolRoutes",
    "app-shell": "patchAppShell",
    composer: "patchComposerBubbleColors",
    "electron-menu-shortcuts": "patchElectronMenuShortcuts",
    "error-boundary": "patchErrorBoundary",
    header: "patchHeader",
    "keyboard-shortcuts-search-input": "patchKeyboardShortcutsSearchInput",
    "home-project-dropdown": "patchHomeProjectDropdownProjectSelectorShortcut",
    "local-active-workspace-root-dropdown": "patchLocalActiveWorkspaceRootDropdownProjectSelectorShortcut",
    "local-conversation-page": "patchLocalConversationPageHeader",
    "local-task-row": "patchLocalTaskRow",
    review: "patchThreadSidePanelTabs",
    "run-command": "patchRunCommandProjectSelectorShortcut",
    "user-message-attachments": "patchUserMessageAttachmentsBubbleColors",
  }[fileNamePrefix];
}

function findTransform(patchSet, fileNamePrefix) {
  const transformName = logicalTransformName(fileNamePrefix);
  const transforms = collectFileTransforms(patchSet);
  const transform = transformName
    ? transforms.find(([, candidate]) => candidate.name === transformName)?.[1]
    : transforms.find(([filePath]) => filePath === findTransformPath(patchSet, fileNamePrefix))?.[1];
  assert.equal(typeof transform, "function", `${patchSet.id} has ${fileNamePrefix} transform`);
  return transform;
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
    patch.patchHomeProjectDropdownProjectSelectorShortcut("");
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
  if (
    patchSet.id === "codex-26.623.141536-4753" ||
    patchSet.id === "codex-26.623.101652-4674" ||
    patchSet.id === "codex-26.623.81905-4598" ||
    patchSet.id === "codex-26.623.70822-4559"
  ) {
    return {
      electronCommandSourceFile: ".vite/build/src-CoIhwwHr.js",
      srcFile: "src-BhkLFyc4.js",
      threadContextInputsFile: null,
      sidebarThreadKeysFile: null,
      sidebarThreadRowSignalsFile: null,
      branchPickerDropdownContentFile: null,
    };
  }
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

test("patch sets defer runtime asset construction until selected", () => {
  let calls = 0;
  const patchSet = makePatchSet({
    id: "test",
    codexVersion: "1",
    bundleVersion: "2",
    asarSha256: "abc",
    sourceFamily: "codex",
    assetFiles() {
      calls += 1;
      return [["asset.js", "content"]];
    },
    patches: [],
    runtimeConfig: {},
  });
  assert.equal(calls, 0);
  assert.deepEqual(patchSet.assetFiles, [["asset.js", "content"]]);
  assert.equal(patchSet.assetFiles, patchSet.assetFiles);
  assert.equal(calls, 1);
});

test("selectPatch fails closed for unsupported Codex builds", () => {
  assert.throws(
    () => selectPatch([], { version: "1", bundleVersion: "2", asarSha256: "abc" }),
    /Unsupported Codex\.app/,
  );
});

test("newest supported ChatGPT source identity is registered first while Codex remains registered", () => {
  assert.equal(patchSets[0]?.id, "chatgpt-26.715.72359-5718");
  assert.equal(chatgptPatchSets.length, 17);

  for (const identity of [
    ["26.715.72359", "5718", "6c6528eb1e8450cdc506a59586f8caffe87576e200977e2a11bdea0cecf1c718"],
    ["26.715.72028", "5706", "8271e8b537b1f3a87c8453812bac580d9eec05674f05a1faae8f76e56499ffad"],
    ["26.715.71837", "5702", "11292b6a04d8aef36c30940b94ce3a744844dc5a52797228fbebb87f8529f102"],
    ["26.715.61943", "5628", "7501dd25c22e090bb131fe3fe6423e5c3b21b7f275c7e45b86ebe00a68052c80"],
    ["26.715.52143", "5591", "4dc2ca0aac6e4f6f858c504223bcdedf0b2d768fbc948d9f449f2da656f1b98f"],
    ["26.715.31925", "5551", "0c9dd677134340cb944e7642b8bc2504c7b73c7dc334d9d756547858171eea41"],
    ["26.715.31251", "5538", "8142e0848fe49097c129a1093f80061c13de04c2893525ee7c751d26b5a7bd4f"],
    ["26.715.21425", "5488", "5db4c67090c0521fa717e83e46cb0a6175cb6c16fb89064223753bdf05cff0aa"],
    ["26.715.21316", "5484", "38e79e68f970a3a0d85bfe856911e1c5f24d8e267c4637565ca64f65da268ca1"],
    ["26.707.91948", "5440", "85b11c8d93d377f82161ba9b7b1af6f95b2a0490f01993dbc4d3a107dce77591"],
    ["26.707.72221", "5307", "b5da51e5df6e996076e4cb19045cec46dd4c08cf61c19cdbc5cb426b8413b73c"],
    ["26.707.71524", "5263", "d28f31b4bbb04c519be65c2af8277d8c5faf77b4239ee89b928f0a7423dacd84"],
    ["26.707.62119", "5211", "165db3a1d32009724fcb91427a73926fe8de2a1e24141d5f1e24951d120424f7"],
    ["26.707.61608", "5200", "7cd7f277d4d4b6221eb2121fd36d2238c28f203875c62f8abd36f3f12898cb86"],
  ]) {
    const [version, bundleVersion, asarSha256] = identity;
    assert.equal(
      selectPatch(patchSets, { version, bundleVersion, asarSha256 }).id,
      `chatgpt-${version}-${bundleVersion}`,
    );
  }

  const chatgptPatchSet = selectPatch(patchSets, {
    version: "26.707.41301",
    bundleVersion: "5103",
    asarSha256: "2869c4765e5e0c6466e40f739bd0f7fc9e6b659ac10e1e03d391ca3f5e600b56",
  });
  assert.equal(chatgptPatchSet.id, "chatgpt-26.707.41301-5103");

  const transitionChatgptPatchSet = selectPatch(patchSets, {
    version: "26.707.31428",
    bundleVersion: "5059",
    asarSha256: "cc1bebbd77b827bc9f96f89216c8e101cdfc6d8ddd886d22b7e9507167be94b8",
  });
  assert.equal(transitionChatgptPatchSet.id, "chatgpt-26.707.31428-5059");

  const identity = {
    version: "26.623.141536",
    bundleVersion: "4753",
    asarSha256: "9169abf7427f8ceb2dab527f489a76f6e419e2602faa9b3b8a1b4e2c526fc537",
  };

  const patchSet = selectPatch(patchSets, identity);
  assert.equal(patchSet, codexPatchSets[0]);
  assert.equal(patchSet.id, "codex-26.623.141536-4753");
});

test("shared ChatGPT 26.715 transform variants have explicit patch-set owners", () => {
  assert.equal(patchSetOwnsTransformVariant("chatgpt-26.715.72359-5718", "chatgpt-26.715.72359"), true);
  assert.equal(patchSetOwnsTransformVariant("chatgpt-26.715.61943-5628", "chatgpt-26.715.72359"), false);
  assert.equal(patchSetUsesTransformVariant("chatgpt-26.715.72359-5718", "chatgpt-26.715.52143"), true);
  assert.equal(patchSetOwnsTransformVariant("chatgpt-26.715.61943-5628", "chatgpt-26.715.61943"), true);
  assert.equal(patchSetOwnsTransformVariant("chatgpt-26.715.52143-5591", "chatgpt-26.715.61943"), false);
  assert.equal(patchSetUsesTransformVariant("chatgpt-26.715.61943-5628", "chatgpt-26.715.52143"), true);
  assert.equal(patchSetOwnsTransformVariant("chatgpt-26.715.52143-5591", "chatgpt-26.715.52143"), true);
  assert.equal(patchSetOwnsTransformVariant("chatgpt-26.715.31925-5551", "chatgpt-26.715.52143"), false);
  assert.equal(patchSetOwnsTransformVariant("chatgpt-26.715.31925-5551", "chatgpt-26.715.31925"), true);
  assert.equal(patchSetOwnsTransformVariant("chatgpt-26.715.31251-5538", "chatgpt-26.715.31925"), false);
  assert.equal(patchSetOwnsTransformVariant("chatgpt-26.715.31251-5538", "chatgpt-26.715.31251"), true);
  assert.equal(patchSetOwnsTransformVariant("chatgpt-26.715.21425-5488", "chatgpt-26.715.31251"), false);
  assert.equal(patchSetOwnsTransformVariant("chatgpt-26.715.31251-5538", "chatgpt-26.715"), false);
  assert.equal(patchSetUsesTransformVariant("chatgpt-26.715.31251-5538", "chatgpt-26.715.21425"), true);
  assert.equal(patchSetUsesTransformVariant("chatgpt-26.715.31251-5538", "chatgpt-26.715"), true);
  assert.equal(patchSetOwnsTransformVariant("chatgpt-26.715.21316-5484", "chatgpt-26.715"), true);
  assert.equal(patchSetOwnsTransformVariant("chatgpt-26.715.21425-5488", "chatgpt-26.715"), true);
  assert.equal(patchSetOwnsTransformVariant("chatgpt-26.715.21425-5488", "chatgpt-26.715.21425"), true);
  assert.equal(patchSetOwnsTransformVariant("chatgpt-26.715.21316-5484", "chatgpt-26.715.21425"), false);
  assert.equal(patchSetOwnsTransformVariant("chatgpt-26.707.91948-5440", "chatgpt-26.715"), false);
  assert.throws(() => patchSetOwnsTransformVariant("chatgpt-26.715.21425-5488", "unknown"), /Unknown transform variant unknown/);
});

test("72359 maps its exact assets and required runtime", () => {
  const newest = patchSets.find((candidate) => candidate.id === "chatgpt-26.715.72359-5718");
  const transformedPaths = new Set(collectFileTransforms(newest).map(([filePath]) => filePath));

  for (const filePath of [
    ".vite/build/main-2laZZXle.js",
    ".vite/build/src-DVXSULz2.js",
    "webview/assets/app-initial~app-main~appgen-settings-page~page~appgen-library-page~appgen-page~appgen-setti~ogh9jurw-C1AmS95p.js",
    "webview/assets/general-settings-CM4Mcgcy.js",
    "webview/assets/thread-app-shell-chrome-DMc8DBvS.js",
    "webview/assets/local-conversation-page-MX2XDodp.js",
    "webview/assets/mermaid-diagram-DWglEZVp.js",
  ]) assert.equal(transformedPaths.has(filePath), true, filePath);
  assert.equal(newest.runtimeConfig.mermaidCoreAsset, "mermaid.core-Q-7mP-kM.js");
  assert.ok(newest.assetFiles.some(([filePath]) => filePath === "webview/assets/codex-plus/runtime-manifest.js"));
});

test("72028 registers its exact identity and distinct transform owner", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.715.72028-5706");
  assert.ok(patchSet);
  assert.equal(patchSet.codexVersion, "26.715.72028");
  assert.equal(patchSet.bundleVersion, "5706");
  assert.equal(patchSet.asarSha256, "8271e8b537b1f3a87c8453812bac580d9eec05674f05a1faae8f76e56499ffad");
  assert.equal(patchSetOwnsTransformVariant(patchSet.id, "chatgpt-26.715.72028"), true);
  assert.equal(patchSetOwnsTransformVariant("chatgpt-26.715.72359-5718", "chatgpt-26.715.72028"), false);
  const transformedPaths = new Set(collectFileTransforms(patchSet).map(([filePath]) => filePath));
  for (const filePath of [
    ".vite/build/main-DXmUjwbb.js",
    ".vite/build/src-DVXSULz2.js",
    "webview/assets/app-initial~app-main~appgen-settings-page~page~appgen-library-page~appgen-page~appgen-setti~ogh9jurw-CXJ5tIyg.js",
    "webview/assets/general-settings-BfleeL7z.js",
    "webview/assets/thread-app-shell-chrome-C7tru4y2.js",
    "webview/assets/local-conversation-page-CwwU4NJh.js",
    "webview/assets/mermaid-diagram-C_CaUvVd.js",
  ]) assert.equal(transformedPaths.has(filePath), true, filePath);
  assert.equal(patchSet.runtimeConfig.mermaidCoreAsset, "mermaid.core-B6BLbxeh.js");
  assert.ok(patchSet.assetFiles.some(([filePath]) => filePath === "webview/assets/codex-plus/runtime-manifest.js"));
});

test("72028 owns its moved app shell, command menu, and startup anchors", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.715.72028-5706");
  const transforms = collectFileTransforms(patchSet);
  const appShell = transforms.find(([, transform]) => transform.name === "patchAppShell")[1];
  const commands = transforms.find(([, transform]) => transform.name === "patchCommandMenuRuntimeCommands")[1];
  const startup = transforms.find(([, transform]) => transform.name === "patchChatGptStartupAnnouncements")[1];
  assert.match(appShell([
    "function nP(){let e=(0,aP.c)(3),t,n;",
    "children:[t,n,(0,oP.jsx)(nr,{onClick:rP,children:(0,oP.jsx)(X,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
  ].join("")), /CPXDiagnosticDetails\(\{jsx:oP\.jsx,error:null\}\)/);
  const commandText = commands([
    "function y4({close:e,inputRef:t,rootChatSearchIntent:n,search:r,setSearch:i}){",
    "},V=[],H=N.filter",
    "function b4(e){let t=(0,R4.c)(13),",
    "c=()=>{gh(r.id,`command_menu`),r.id!==`searchChats`&&n()},t[2]=n,t[3]=r.id,t[4]=c):c=t[4];",
  ].join(""));
  assert.match(commandText, /CPXCommandPaletteItem/);
  assert.match(commandText, /metadata\(\)\.map/);
  assert.match(commandText, /bindNativeDispatch\(e=>\(gh\(e,`command_menu`\),!0\)\)/);
  assert.match(
    startup("function jR({appBrand:e,buildFlavor:t,platform:n}){return(n===`macOS`||n===`windows`)&&e===Ze.ChatGPT&&t!=null&&t!==vt.Agent&&t!==vt.Dev}"),
    /function jR\([^)]*\)\{return false\}/,
  );
});

test("71837 registers its exact identity and distinct transform owner", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.715.71837-5702");
  assert.ok(patchSet);
  assert.equal(patchSet.codexVersion, "26.715.71837");
  assert.equal(patchSet.bundleVersion, "5702");
  assert.equal(patchSet.asarSha256, "11292b6a04d8aef36c30940b94ce3a744844dc5a52797228fbebb87f8529f102");
  assert.equal(patchSetOwnsTransformVariant(patchSet.id, "chatgpt-26.715.71837"), true);
  assert.equal(patchSetOwnsTransformVariant("chatgpt-26.715.72028-5706", "chatgpt-26.715.71837"), false);
  assert.equal(patchSetUsesTransformVariant(patchSet.id, "chatgpt-26.715.72028"), true);
  const transformedPaths = new Set(collectFileTransforms(patchSet).map(([filePath]) => filePath));
  for (const filePath of [
    ".vite/build/main-DMSDCThi.js",
    ".vite/build/src-DU0S2Fqi.js",
    "webview/assets/app-initial~app-main~appgen-settings-page~page~appgen-library-page~appgen-page~appgen-setti~ogh9jurw-hQSurq1e.js",
    "webview/assets/general-settings-BOz8t03P.js",
    "webview/assets/thread-app-shell-chrome-C57XrWTY.js",
    "webview/assets/local-conversation-page-BuhSNKrc.js",
    "webview/assets/mermaid-diagram-C1oQ4rXT.js",
  ]) assert.equal(transformedPaths.has(filePath), true, filePath);
  assert.equal(patchSet.runtimeConfig.mermaidCoreAsset, "mermaid.core-B6BLbxeh.js");
  assert.ok(patchSet.assetFiles.some(([filePath]) => filePath === "webview/assets/codex-plus/runtime-manifest.js"));
});

test("72359 owns its moved app shell and composer anchors", () => {
  const newest = patchSets.find((candidate) => candidate.id === "chatgpt-26.715.72359-5718");
  const appShell = collectFileTransforms(newest).find(([, transform]) => transform.name === "patchAppShell")?.[1];
  const composerBubble = collectFileTransforms(newest).find(([, transform]) => transform.name === "patchComposerBubbleColors")?.[1];
  const composerProject = collectFileTransforms(newest).find(([, transform]) => transform.name === "patchComposerProjectColors")?.[1];
  const commands = collectFileTransforms(newest).find(([, transform]) => transform.name === "patchCommandMenuRuntimeCommands")?.[1];
  const startup = collectFileTransforms(newest).find(([, transform]) => transform.name === "patchChatGptStartupAnnouncements")?.[1];
  const transformed = appShell([
    "function rP(){let e=(0,oP.c)(3),t,n;",
    "children:[t,n,(0,sP.jsx)(nr,{onClick:iP,children:(0,sP.jsx)(X,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
  ].join(""));

  assert.match(transformed, /CPXDiagnosticDetails\(\{jsx:sP\.jsx,error:null\}\)/);
  const composer = composerBubble([
    "function qk(e){let t=(0,Jk.c)(55),",
    "p=(0,Yk.jsx)(`div`,{className:n,onDragEnter:r,",
    "y=(0,Yk.jsx)(Ag,{className:n,inert:r,",
    "A=(0,Yk.jsx)(Gy,{...p,className:C,",
  ].join(""));
  assert.equal(composer.match(/CPXSurfaceProps\(\{\}\)/g)?.length, 3);
  const composerWithProject = composerProject(`${composer}Qo=(e,t=Ir)=>{let n=e.fsPath||e.path;`);
  assert.equal(composerWithProject.match(/CPXSurfaceProps\(\{project:/g)?.length, 3);
  assert.match(composerWithProject, /CPXOpenFile=CPXSP\.bindOpenFile.*Ll\(\{scope:U/);
  const commandText = commands([
    "function b4({close:e,inputRef:t,rootChatSearchIntent:n,search:r,setSearch:i}){",
    "},V=[],H=N.filter",
    "c=()=>{hh(r.id,`command_menu`),r.id!==`searchChats`&&n()},t[2]=n,t[3]=r.id,t[4]=c):c=t[4];",
  ].join(""));
  assert.match(commandText, /CPXCommandPaletteItem/);
  assert.match(commandText, /metadata\(\)\.map/);
  assert.match(commandText, /bindNativeDispatch\(e=>\(hh\(e,`command_menu`\),!0\)\)/);
  assert.match(
    startup("function MR({appBrand:e,buildFlavor:t,platform:n}){return(n===`macOS`||n===`windows`)&&e===Ze.ChatGPT&&t!=null&&t!==vt.Agent&&t!==vt.Dev}"),
    /function MR\([^)]*\)\{return false\}/,
  );
  assert.throws(
    () => appShell("function rP(){let e=(0,oP.c)(3),t,n;", { patchSetId: "chatgpt-26.715.61943-5628" }),
    /belongs to chatgpt-26\.715\.72359-5718/,
  );
});

test("newest patch omits transforms for host seams that no longer exist", () => {
  const newest = patchSets.find((candidate) => candidate.id === "chatgpt-26.715.21425-5488");
  assert.equal(collectFileTransforms(newest).some(([filePath]) => filePath == null), false);
});

test("21425 home project selector passes the live React namespace to the trigger adapter", () => {
  const transformed = patchHomeProjectDropdownProjectSelectorShortcut([
    "function mt({activeProjectIdOverride:e,allowLocalProjects:t=!0,",
    "_=r.filter(e),t[0]=r,t[1]=h,t[2]=_",
    "t[9]===a?C=t[10]:(C=e=>{a(e.projectId)},t[9]=a,t[10]=C);let w;",
    "R=f??v,z=e=>{y(e),p?.(e)},B=",
    "(0,Z.jsx)(Ue,{open:f,onOpenChange:z,onCloseAutoFocus:M,side:`top`,triggerButton:h,contentWidth:`menu`,",
    "let Je=(0,Z.jsx)(Ue,{open:f,onOpenChange:z,onCloseAutoFocus:M,side:`top`,align:u===`hero`?`center`:`start`,disabled:s,triggerButton:h??(u===`hero`?Ke():He()),contentWidth:`workspace`,",
  ].join(""), { patchSetId: "chatgpt-26.715.21425-5488" });

  assert.match(transformed, /CPXP\.trigger\(e,t,gt\)/);
});

test("21425 binds the moved review parser and current Mermaid asset", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/patches/lib/common-patches.js"), "utf8");
  const newest = patchSets.find((candidate) => candidate.id === "chatgpt-26.715.21425-5488");

  assert.match(source, /null,hc,yd\]"\)\}function _T/);
  assert.match(source, /"oe\.push\(\.\.\.globalThis\.CodexPlusHost\.adapters\.commands\.metadata\(\)/);
  assert.match(source, /CPXCommandPaletteItem\(\{command:e,close:t\}\).*\(0,V4\.jsx\)\(aO,/);
  assert.equal(newest.runtimeConfig.mermaidCoreAsset, "mermaid.core-BfTk2v0k.js");
});

test("31251 owns and applies its moved app shell, composer, command, and startup anchors", () => {
  const newest = patchSets.find((candidate) => candidate.id === "chatgpt-26.715.31251-5538");
  const byName = (name) => collectFileTransforms(newest).find(([, transform]) => transform.name === name)?.[1];
  const appShell = byName("patchAppShell");
  const composerBubble = byName("patchComposerBubbleColors");
  const composerProject = byName("patchComposerProjectColors");
  const commands = byName("patchCommandMenuRuntimeCommands");
  const startup = byName("patchChatGptStartupAnnouncements");

  const shell = appShell([
    "function qN(){let e=(0,XN.c)(3),t,n;",
    "children:[t,n,(0,ZN.jsx)(rr,{onClick:JN,children:(0,ZN.jsx)(X,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
  ].join(""));
  assert.match(shell, /CPXDiagnosticDetails\(\{jsx:ZN\.jsx,error:null\}\)/);

  const bubble = composerBubble([
    "function qk(e){let t=(0,Jk.c)(55),",
    "p=(0,Yk.jsx)(`div`,{className:n,onDragEnter:r,",
    "y=(0,Yk.jsx)(Ag,{className:n,inert:r,",
    "A=(0,Yk.jsx)(Gy,{...p,className:C,",
  ].join(""));
  const composer = composerProject(`${bubble}Qo=(e,t=Ir)=>{let n=e.fsPath||e.path;`);
  assert.equal(composer.match(/CPXSurfaceProps\(\{project:/g)?.length, 3);
  assert.match(composer, /CPXOpenFile=CPXSP\.bindOpenFile/);

  const commandText = commands([
    "function o4(e){let t=(0,z4.c)(134),",
    "!i&&c!=null&&oe.push(c),t[30]=U,",
    "c=()=>{ph(r.id,`command_menu`),r.id!==`searchChats`&&n()},t[2]=n,t[3]=r.id,t[4]=c):c=t[4];",
  ].join(""));
  assert.match(commandText, /CPXCommandPaletteItem\(\{command:e,close:t\}\).*\(0,V4\.jsx\)\(nO,/);
  assert.match(commandText, /bindNativeDispatch\(e=>\(ph\(e,`command_menu`\),!0\)\)/);

  const startupText = startup("function SR({appBrand:e,buildFlavor:t,platform:n}){return(n===`macOS`||n===`windows`)&&e===Ze.ChatGPT&&t!=null&&t!==vt.Agent&&t!==vt.Dev}");
  assert.match(startupText, /function SR\([^)]*\)\{return false\}/);
  assert.throws(
    () => appShell("function qN(){let e=(0,XN.c)(3),t,n;", { patchSetId: "chatgpt-26.715.21425-5488" }),
    /belongs to chatgpt-26\.715\.31251-5538/,
  );
});

test("31925 owns its moved worker bridge anchors", () => {
  const newest = patchSets.find((candidate) => candidate.id === "chatgpt-26.715.31925-5551");
  const worker = collectFileTransforms(newest).find(([, transform]) => transform.name === "patchWorker")?.[1];
  const transformed = worker([
    "var L1=`/usr/bin/git`,",
    "function F1({requestKind:e,source:t}){return P1.has(e??``)||I1(t)}",
    "case`commit-message-diff`:f=Z(await n7(_se(e.params.cwd,e.params.includeUnstaged,this.gitManager,o),i.signal));break;case`submodule-paths`:f=Z({paths:await Pse(this.gitManager.getWorktreeRepositoryForRoot(e.params.root,o),i.signal)});break;",
    "case`review-patch`:case`commit-message-diff`:case`submodule-paths`:case`cat-file`:",
  ].join(""));

  assert.match(transformed, /CPXW\.isReadOnlyBranchRequest\(e,t\)/);
  assert.match(transformed, /case`repository-targets`/);
  assert.match(transformed, /case`codex-plus-current-branch`/);
});

test("31925 owns its moved composer surface anchors", () => {
  const newest = patchSets.find((candidate) => candidate.id === "chatgpt-26.715.31925-5551");
  const byName = (name) => collectFileTransforms(newest).find(([, transform]) => transform.name === name)?.[1];
  const composerBubble = byName("patchComposerBubbleColors");
  const composerProject = byName("patchComposerProjectColors");
  const transformed = composerBubble([
    "function qk(e){let t=(0,Jk.c)(55),",
    "p=(0,Yk.jsx)(`div`,{className:n,onDragEnter:r,",
    "y=(0,Yk.jsx)(Mg,{className:n,inert:r,",
    "A=(0,Yk.jsx)(Gy,{...p,className:C,",
  ].join(""));

  assert.equal(transformed.match(/CPXSurfaceProps\(\{\}\)/g)?.length, 3);
  assert.match(transformed, /CPXSurfaceProps=e=>CPXMC\.composerSurfaceProps\(e\)/);
  const project = composerProject(`${transformed}Zo=(e,t=Ir)=>{let n=e.fsPath||e.path;`);
  assert.equal(project.match(/CPXSurfaceProps\(\{project:/g)?.length, 3);
  assert.match(project, /CPXOpenFile=CPXSP\.bindOpenFile\(\(e,t=\{\}\)=>Il\(/);
  assert.throws(
    () => composerBubble("function qk(e){let t=(0,Jk.c)(55),", { patchSetId: "chatgpt-26.715.31251-5538" }),
    /belongs to chatgpt-26\.715\.31925-5551/,
  );
});

test("31925 owns its moved thread header accessory anchors", () => {
  const newest = patchSets.find((candidate) => candidate.id === "chatgpt-26.715.31925-5551");
  const header = collectFileTransforms(newest).find(([, transform]) => transform.name === "patchHeader")?.[1];
  const transformed = header([
    "function sr(e){let t=(0,cr.c)(5),{conversationId:n}=e,",
    "let l=c;if(l==null||!s||o.kind!==`git`||a.kind===`remote-control`)return null;let u;return t[2]!==l||t[3]!==a?(u=(0,lr.jsx)(W.HeaderAction,{actionId:`thread-local-project-actions`,align:`end`,order:100,children:(0,lr.jsx)(Xn,{cwd:l,hostConfig:a})}),t[2]=l,t[3]=a,t[4]=u):u=t[4],u}",
  ].join(""));

  assert.match(transformed, /CPXThreadHeaderAccessories/);
  assert.match(transformed, /cwd:o\.cwd,hostId:a\?\.id/);
  assert.match(transformed, /actionId:`codex-plus-project-path`/);
});

test("31925 owns its restructured command menu anchors", () => {
  const newest = patchSets.find((candidate) => candidate.id === "chatgpt-26.715.31925-5551");
  const commands = collectFileTransforms(newest).find(([, transform]) => transform.name === "patchCommandMenuRuntimeCommands")?.[1];
  const transformed = commands([
    "function b4({close:e,inputRef:t,rootChatSearchIntent:n,search:r,setSearch:i}){",
    "G=[];if(W&&!ie)",
    "c=()=>{mh(r.id,`command_menu`),r.id!==`searchChats`&&n()},t[2]=n,t[3]=r.id,t[4]=c):c=t[4];",
  ].join(""));

  assert.match(transformed, /function CPXCommandPaletteItem/);
  assert.match(transformed, /if\(!ie\)V\.push\(\.\.\.globalThis\.CodexPlusHost\.adapters\.commands\.metadata/);
  assert.match(transformed, /bindNativeDispatch\(e=>\(mh\(e,`command_menu`\),!0\)\)/);
});

test("31925 owns its moved native main registration anchor", () => {
  const newest = patchSets.find((candidate) => candidate.id === "chatgpt-26.715.31925-5551");
  const bridge = collectFileTransforms(newest).find(([, transform]) => transform.name === "patchMainNativeBridge")?.[1];
  const transformed = bridge([
    "async function Aae(){a.n(q9);",
    "t5({buildFlavor:o,getContextForWebContents:L.getContextForWebContents,isTrustedIpcEvent:R}),",
  ].join(""));

  assert.match(transformed, /CPXNative/);
  assert.match(transformed, /registerNativeRequest\(\{isTrustedIpcEvent:R\}\)/);
});

test("52143 owns its split-startup Electron main anchors", () => {
  const newest = patchSets.find((candidate) => candidate.id === "chatgpt-26.715.52143-5591");
  const byName = (name) => collectFileTransforms(newest).find(([, transform]) => transform.name === name)?.[1];
  const about = byName("patchAboutDialog");
  const bridge = byName("patchMainNativeBridge");
  const menu = byName("patchMainMenuDiagnostics");

  const aboutText = about([
    "let r=l.app.getName(),o=l.app.getVersion(),s=b5(o),",
    "_=f.formatMessage({messageId:u5,defaultMessage:d5}),v=x5(o),y=[...i.o()?[`Powered by Codex & OWL`]:[],g,...v].join(`\n`),",
    "E5({appDisplayName:r,buildInfoLabel:_,buildInfoText:y,iconDataUrl:p.htmlIconDataUrl,isDark:x,okLabel:h,title:m})",
    "function E5({appDisplayName:e,buildInfoLabel:t,buildInfoText:n,iconDataUrl:r,isDark:i,okLabel:a,title:o}){let s=r==null?``:",
    "    .build-info {\n      width: 100%;\n      margin: 0;\n      line-height: 1.45;",
    "      color: var(--muted-text);\n      white-space: pre-wrap;",
    "    .app-name,\n    .build-info,\n    .copyright {",
    '      <div class="app-name" id="app-name">${(0,Hz.default)(e)}</div>\n      <pre class="build-info" aria-label="${(0,Hz.default)(t)}">${(0,Hz.default)(n)}</pre>',
  ].join(""));
  assert.match(aboutText, /CPXAboutMetadata\.disclaimerMarkup/);
  assert.match(aboutText, /codex-plus-disclaimer/);

  const bridgeText = bridge([
    "async function kae(){a.n(q9);",
    "Il({chunkedMessageSender:R,isTrustedIpcEvent:B}),e5({buildFlavor:s,getContextForWebContents:z.getContextForWebContents,isTrustedIpcEvent:B}),l.ipcMain.on",
  ].join(""));
  assert.match(bridgeText, /CPXNative/);
  assert.match(bridgeText, /registerNativeRequest\(\{isTrustedIpcEvent:B\}\)/);

  const menuText = menu([
    "Ne,...c.browserPane?[Pe]:[],nt,...c.browserPane?",
    "pe=be.refreshApplicationMenu;let xe=",
  ].join(""));
  assert.match(menuText, /CPXNative\.templateItems\(`view-menu`\)/);
  assert.match(menuText, /setRefreshApplicationMenu\(\(\)=>be\.refreshApplicationMenu\(\)\)/);
  assert.throws(
    () => bridge("async function kae(){a.n(q9);", { patchSetId: "chatgpt-26.715.31925-5551" }),
    /belongs to chatgpt-26\.715\.52143-5591/,
  );
});

test("31925 owns its moved ChatGPT migration eligibility anchor", () => {
  const newest = patchSets.find((candidate) => candidate.id === "chatgpt-26.715.31925-5551");
  const startup = collectFileTransforms(newest).find(([, transform]) => transform.name === "patchChatGptStartupAnnouncements")?.[1];
  const transformed = startup("function MR({appBrand:e,buildFlavor:t,platform:n}){return(n===`macOS`||n===`windows`)&&e===Qe.ChatGPT&&t!=null&&t!==yt.Agent&&t!==yt.Dev}");

  assert.match(transformed, /function MR\([^)]*\)\{return false\}/);
});

test("31925 binds the moved Review host body to the shared adapter", () => {
  const newest = patchSets.find((candidate) => candidate.id === "chatgpt-26.715.31925-5551");
  const review = collectFileTransforms(newest).find(([, transform]) => transform.name === "patchThreadSidePanelTabs")?.[1];
  const transformed = review([
    "function KT(e){let t=(0,JT.c)(15),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e",
    "c=(0,YT.jsx)(Bu,{children:(0,YT.jsx)(DC,{diffMode:a,setTabState:r,tabState:i})}),t[1]=a,t[2]=r,t[3]=i,t[4]=c):c=t[4];",
  ].join(""));

  assert.match(transformed, /\[YT,PT,null,null,null,null,null,null,null,null,null,DC,null,null,null,null,null,null,null,Ac,Od\]/);
  assert.match(transformed, /\(0,YT\.jsx\)\(CPXRM,\{mainReviewContent:/);
});

test("31925 adds diagnostic details to the moved app-shell fallback", () => {
  const newest = patchSets.find((candidate) => candidate.id === "chatgpt-26.715.31925-5551");
  const appShell = collectFileTransforms(newest).find(([, transform]) => transform.name === "patchAppShell")?.[1];
  const transformed = appShell([
    "function rP(){let e=(0,oP.c)(3),t,n;",
    "children:[t,n,(0,sP.jsx)(ar,{onClick:iP,children:(0,sP.jsx)(Y,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
  ].join(""));

  assert.match(transformed, /CPXDiagnosticDetails\(\{jsx:sP\.jsx,error:null\}\)/);
});

test("31925 mounts shared appearance rows at the moved settings aliases", () => {
  const newest = patchSets.find((candidate) => candidate.id === "chatgpt-26.715.31925-5551");
  const settings = collectFileTransforms(newest).find(([, transform]) => transform.name === "patchGeneralSettingsUserBubbleColors")?.[1];
  const transformed = settings([
    "function Tr({showCodeFont:e,showTranslucentSidebarToggle:t,variant:r}){",
    "children:[D.map(e=>(0,J.jsx)(U,{size:`compact`,control:(0,J.jsx)(Ar,{ariaLabel:e.ariaLabel,value:x[e.role],onChange:t=>{k(e.role,t)}}),label:e.label},e.role)),O.map",
  ].join(""));

  assert.match(transformed, /React:Ur,jsx:J\.jsx,SettingRow:U,ColorInput:Ar,Switch:V/);
  assert.match(transformed, /\.\.\.CPXAppearanceRows\(r\),O\.map/);
});

test("collects named patch queue transforms and plist changes", () => {
  const patchSet = {
    patches: [
      {
        id: "identity",
        infoPlistStrings: { CFBundleName: "Codex Plus" },
        fileTransforms: [["webview/index.html", ownedTestTransform("codex-example", "codex-example/identity/title", 0)]],
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
  for (const patchSet of codexPatchSets) {
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
    assert.ok(addedFiles.includes("webview/assets/codex-plus/api/routeContext.js"));
    assert.ok(addedFiles.includes("webview/assets/codex-plus/api/chatRows.js"));
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

test("packaged aharness runtime comes from the Codex Plus aharness fork without source patching", () => {
  const assetSource = fs.readFileSync(path.join(__dirname, "../src/runtime/assets.js"), "utf8");
  assert.doesNotMatch(assetSource, /patchAharnessRuntimeAsset/);
  assert.doesNotMatch(assetSource, /Unsupported @aharness\/core/);

  const assets = new Map(codexPlusRuntimeAssets());
  const packageJson = JSON.parse(String(assets.get(".vite/build/node_modules/@aharness/core/package.json") || "{}"));
  assert.equal(packageJson.name, "@codex-plus/aharness-core");
  assert.equal(packageJson.version, "0.1.3-cpx.1");
  assert.equal(assets.has(".vite/build/node_modules/@aharness/core/src/runtime/liveRunEngine.ts"), false);
  assert.equal(assets.has(".vite/build/node_modules/@aharness/core/test/codex-plus-delta.test.mjs"), false);
  assert.equal(assets.has(".vite/build/node_modules/ws/wrapper.mjs"), true);
  assert.equal(assets.has(".vite/build/node_modules/ws/lib/stream.js"), true);

  const liveRunEngine = String(assets.get(".vite/build/node_modules/@aharness/core/dist/runtime/liveRunEngine.js") || "");

  assert.match(liveRunEngine, /const built = composeActiveStateTurnInput\(\);\s*await client\.request\(METHOD\.turnStart, \{\s*threadId,\s*input: \[\.\.\.built\.input, \{ type: 'text', text \}\],\s*\}\);\s*built\.commit\(\);/);
  assert.doesNotMatch(liveRunEngine, /input: \[\{ type: 'text', text \}\],/);
});

test("packaged aharness runtime registers path skills by catalog root", () => {
  const assets = new Map(codexPlusRuntimeAssets());
  const skillCatalog = String(assets.get(".vite/build/node_modules/@aharness/core/dist/runtime/skillCatalog.js") || "");

  assert.match(skillCatalog, /import \{ existsSync, realpathSync \} from 'node:fs';/);
  assert.match(skillCatalog, /roots\.add\(dirname\(dirname\(resolvedPath\)\)\);/);
  assert.doesNotMatch(skillCatalog, /roots\.add\(dirname\(resolvedPath\)\);/);
  assert.match(skillCatalog, /return realpathSync\(resolved\);/);
  assert.match(skillCatalog, /matches\.length === 0 && existsSync\(requiredPath\)/);
  assert.match(skillCatalog, /name: basename\(dirname\(requiredPath\)\)/);
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
  assert.ok(indexOf("webview/assets/codex-plus/api/index.js") < indexOf("webview/assets/codex-plus/api/routeContext.js"));
  assert.ok(indexOf("webview/assets/codex-plus/api/routeContext.js") < indexOf("webview/assets/codex-plus/api/composer.js"));
  assert.ok(indexOf("webview/assets/codex-plus/api/index.js") < indexOf("webview/assets/codex-plus/api/review.js"));
  assert.ok(indexOf("webview/assets/codex-plus/api/chatRows.js") < indexOf("webview/assets/codex-plus/plugins/aharnessRuns.js"));
  assert.ok(indexOf("webview/assets/codex-plus/api/about.js") < indexOf("webview/assets/codex-plus/plugins/aboutMetadata.js"));
  assert.ok(indexOf("webview/assets/codex-plus/api/mermaid.js") < indexOf("webview/assets/codex-plus/host/review.js"));
  assert.ok(indexOf("webview/assets/codex-plus/host/threadHeader.js") < indexOf("webview/assets/codex-plus/plugins/nestedRepositories.js"));
  assert.ok(indexOf("webview/assets/codex-plus/vendor/fzf.umd.js") < indexOf("webview/assets/codex-plus/plugins/projectSelectorShortcut.js"));
  assert.equal(asarPaths[indexOf(".vite/build/codex-plus-native-main.js")], ".vite/build/codex-plus-native-main.js");
  assert.equal(asarPaths[indexOf(".vite/build/codex-plus-worker.js")], ".vite/build/codex-plus-worker.js");
});

test("fzf vendor runtime asset resolves through the installed package", () => {
  assert.equal(fzfRuntimeAssetPath(), require.resolve("fzf"));
});

test("runtime manifest carries versioned runtime config", () => {
  const manifest = new Map(codexPlusRuntimeAssets({ mermaidCoreAsset: "mermaid.core-current.js" })).get(
    "webview/assets/codex-plus/runtime-manifest.js",
  );
  const window = {};
  const context = {
    window,
    globalThis: window,
  };
  vm.runInNewContext(manifest, context);

  assert.equal(JSON.stringify(window.__CodexPlusRuntimeConfig), JSON.stringify({ mermaidCoreAsset: "mermaid.core-current.js" }));
  assert.equal(JSON.stringify(window.__CodexPlusRuntimeFiles), JSON.stringify(require("../src/runtime/assets").browserRuntimeFiles));
});

test("runtime manifest can omit disabled runtime plugins", () => {
  const config = {
    patchSetId: "codex-test",
    runtimePluginsDisabled: ["aharnessRuns", "devTools"],
  };
  const manifest = new Map(codexPlusRuntimeAssets(config)).get("webview/assets/codex-plus/runtime-manifest.js");
  const window = {};
  const context = {
    window,
    globalThis: window,
  };
  vm.runInNewContext(manifest, context);

  assert.deepEqual(Array.from(window.__CodexPlusRuntimeFiles), browserRuntimeFilesForConfig(config));
  assert.equal(window.__CodexPlusRuntimeFiles.includes("plugins/aharnessRuns.js"), false);
  assert.equal(window.__CodexPlusRuntimeFiles.includes("plugins/devTools.js"), false);
  assert.equal(window.__CodexPlusRuntimeFiles.includes("plugins/projectColors.js"), true);
  assert.deepEqual(JSON.parse(JSON.stringify(window.__CodexPlusRuntimeConfig)), config);
});

test("runtime config override preserves patch metadata", () => {
  const patchSet = {
    id: "codex-test",
    codexVersion: "1.2.3",
    bundleVersion: "456",
    asarSha256: "abc",
    runtimeConfig: {
      codexVersion: "1.2.3",
      bundleVersion: "456",
      patchSetId: "codex-test",
      mermaidCoreAsset: "mermaid.core-test.js",
    },
    assetFiles: codexPlusRuntimeAssets({
      codexVersion: "1.2.3",
      bundleVersion: "456",
      patchSetId: "codex-test",
      mermaidCoreAsset: "mermaid.core-test.js",
    }),
    patches: [],
  };

  const merged = mergeRuntimeConfig(patchSet, {
    runtimePluginsDisabled: ["aharnessRuns"],
  });
  const manifest = new Map(collectAssetFiles(merged)).get("webview/assets/codex-plus/runtime-manifest.js");
  const window = {};
  vm.runInNewContext(manifest, { window, globalThis: window });

  assert.equal(window.__CodexPlusRuntimeConfig.codexVersion, "1.2.3");
  assert.equal(window.__CodexPlusRuntimeConfig.bundleVersion, "456");
  assert.equal(window.__CodexPlusRuntimeConfig.patchSetId, "codex-test");
  assert.equal(window.__CodexPlusRuntimeConfig.mermaidCoreAsset, "mermaid.core-test.js");
  assert.deepEqual(Array.from(window.__CodexPlusRuntimeConfig.runtimePluginsDisabled), ["aharnessRuns"]);
  assert.equal(window.__CodexPlusRuntimeFiles.includes("plugins/aharnessRuns.js"), false);
});

test("current patch runtime config names the current Mermaid core asset", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.42026-4514");
  const manifest = new Map(collectAssetFiles(patchSet)).get("webview/assets/codex-plus/runtime-manifest.js");

  assert.match(manifest, /mermaidCoreAsset":"mermaid\.core-C6FbNonK\.js"/);
});

test("runtime plugins stay pure from minified host bundle details", () => {
  const pluginDir = path.join(__dirname, "../src/runtime/plugins");
  for (const fileName of fs.readdirSync(pluginDir).filter((name) => name.endsWith(".js"))) {
    const source = fs.readFileSync(path.join(pluginDir, fileName), "utf8");
    assert.doesNotMatch(source, /\.vite\/build/, `${fileName} must not know Vite bundle paths`);
    assert.doesNotMatch(source, /webview\/assets\/codex-plus/, `${fileName} must not know shipped asset paths`);
    assert.doesNotMatch(source, /\bt\[\d+\]/, `${fileName} must not know React compiler cache slots`);
    assert.doesNotMatch(source, /CPX[A-Za-z]/, `${fileName} must not know minified hook names`);
  }
});

test("hook builders stay within the compact glue budget", () => {
  const hookDir = path.join(__dirname, "../src/patches/lib/hooks");
  const argsByExport = {
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

  for (const patchSet of codexPatchSets) {
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

    assert.match(preload, /exposeInMainWorld\(`codexPlusHostBridge`,\{request:\(t,n\)=>e\.ipcRenderer\.invoke\(`codex_plus:native-request`,\{method:t,params:n\}\)\}\)/);
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
  assert.doesNotMatch(nativeMainSource, /function createWorktree/);
  assert.doesNotMatch(nativeMainSource, /case "codex\/worktree\/create"/);
  assert.doesNotMatch(nativeMainSource, /native-worktree-adapter-unavailable/);
  assert.doesNotMatch(nativeMainSource, /worktree", "add"/);
  assert.doesNotMatch(nativeMainSource, /execFileSync\("git"/);
});

test("26.616.41845 installs the native bridge from its verified main bundle", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.616.41845-4198");
  const transforms = collectFileTransforms(patchSet);

  assert.ok(transforms.some(([filePath]) => filePath === ".vite/build/main-CXkxd7xB.js"));
  assert.ok(transforms.some(([filePath]) => filePath === ".vite/build/preload.js"));
});

test("current patch queues expose project colors and project selector shortcut separately from bubble colors", () => {
  for (const patchSet of codexPatchSets) {
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

  assert.ok(totalLines <= 1796, `src/patches/*.js line count ${totalLines} exceeds 1796`);
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
        fileTransforms: [["webview/index.html", ownedTestTransform("codex-example", "codex-example/identity/title", 0)]],
      },
      {
        id: "about",
        fileTransforms: [[".vite/build/main.js", ownedTestTransform("codex-example", "codex-example/about/main", 1)]],
      },
    ],
  };

  const result = await applyPatchSet({
    sourceApp: "/Applications/Codex.app",
    targetApp: "/tmp/codex-plus-audit/Applications/Codex Plus.app",
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
    patchedAppDisplayName: "Codex Plus",
    patchedAppBundleIdentifier: "com.openai.codex-plus",
    sourceFamily: "codex",
    sourceAsarSha256: "source-sha",
    sourceIdentity: {
      version: "1.2.3",
      bundleVersion: "456",
      asarSha256: "source-sha",
      sourceFamily: "codex",
    },
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
        fileTransforms: [["webview/index.html", ownedTestTransform("codex-example", "codex-example/identity/title", 0)]],
      },
    ],
  };

  const result = await applyPatchSet({
    sourceApp: "/Applications/Codex.app",
    targetApp: "/tmp/codex-plus-audit/Applications/Codex Plus.app",
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
  const padding = Buffer.alloc((4 - (json.length % 4)) % 4);
  const prefix = Buffer.alloc(16);
  prefix.writeUInt32LE(4, 0);
  prefix.writeUInt32LE(json.length + padding.length + 8, 4);
  prefix.writeUInt32LE(json.length + padding.length + 4, 8);
  prefix.writeUInt32LE(json.length, 12);
  return Buffer.concat([prefix, json, padding, ...buffers]);
}

function readAsarFileContent(archive, filePath) {
  const files = new Map(walkFiles(archive.header));
  const node = files.get(filePath);
  const offset = archive.dataStart + Number(node.offset || 0);
  return archive.buffer.subarray(offset, offset + Number(node.size || 0)).toString("utf8");
}

test("ASAR reader and writer preserve padded header data offsets", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-plus-asar-padding-"));
  const asarPath = path.join(tmpDir, "app.asar");
  let fileName = "main.js";
  let asarBuffer = makeAsar({ [fileName]: "let started = true;" });
  for (let i = 0; i < 8 && asarBuffer.readUInt32LE(4) === asarBuffer.readUInt32LE(12) + 8; i += 1) {
    fileName = `main-${i}.js`;
    asarBuffer = makeAsar({ [fileName]: "let started = true;" });
  }
  assert.notEqual(asarBuffer.readUInt32LE(4), asarBuffer.readUInt32LE(12) + 8);
  fs.writeFileSync(asarPath, asarBuffer);

  let archive = readAsar(asarPath);
  assert.equal(readAsarFileContent(archive, fileName), "let started = true;");

  patchAsar(asarPath, [[fileName, (text) => text.replace("true", "false")]]);
  archive = readAsar(asarPath);
  assert.equal(readAsarFileContent(archive, fileName), "let started = false;");
});

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

test("transformAsarBuffer applies owned transforms without writing an archive", () => {
  const source = makeAsar({ "webview/index.js": "export const started = true;" });
  const transform = (text) => text.replace("true", "false");
  Object.defineProperties(transform, {
    ownerPatchSetId: { value: "codex-test-1" },
    variantId: { value: "codex-test-1/runtime/index" },
    transformOrder: { value: 0 },
  });

  const result = transformAsarBuffer(
    source,
    [["webview/index.js", transform]],
    { patchSetId: "codex-test-1" },
  );

  assert.equal(source.includes(Buffer.from("false")), false);
  assert.equal(result.transformedFiles.length, 1);
  assert.deepEqual(result.transformedFiles[0], {
    filePath: "webview/index.js",
    transform: "transform",
    variantId: "codex-test-1/runtime/index",
    ownerPatchSetId: "codex-test-1",
    expectedChange: true,
    beforeSha256: result.transformedFiles[0].beforeSha256,
    afterSha256: result.transformedFiles[0].afterSha256,
    changed: true,
  });
  assert.notEqual(result.transformedFiles[0].beforeSha256, result.transformedFiles[0].afterSha256);
  const archive = readAsar(result.buffer);
  assert.equal(readAsarFileContent(archive, "webview/index.js"), "export const started = false;");
});

test("preflightPatchSet rejects unchanged and syntactically invalid transforms", () => {
  const source = makeAsar({ "webview/index.js": "export const started = true;" });
  const sourceSha256 = sha256(source);
  const patchSet = {
    id: "codex-test-1",
    codexVersion: "1",
    bundleVersion: "2",
    asarSha256: sourceSha256,
    sourceFamily: "codex",
    runtimeConfig: {},
    assetFiles: [
      ["webview/assets/codex-plus/runtime-manifest.js", "window.__CodexPlusRuntimeConfig={};"],
      ["webview/assets/codex-plus/api/hostAdapters.js", "globalThis.CodexPlusHost.requiredAdapterMethods=[];"],
    ],
    patches: [{
      id: "test",
      fileTransforms: [["webview/index.js", Object.assign((text) => text, {
        ownerPatchSetId: "codex-test-1",
        variantId: "codex-test-1/test/index",
        transformOrder: 0,
      })]],
    }],
  };
  const base = {
    sourceApp: "/source/Codex.app",
    identity: { version: "1", bundleVersion: "2", asarSha256: sourceSha256, sourceFamily: "codex" },
    patchSet,
    operations: { readSourceAsar: () => source, getPatcherGitSha: () => "test" },
  };

  assert.throws(() => preflightPatchSet(base), /did not change webview\/index\.js/);
  patchSet.patches[0].fileTransforms[0][1] = Object.assign(() => "export const = ;", {
    ownerPatchSetId: "codex-test-1",
    variantId: "codex-test-1/test/index",
    transformOrder: 0,
  });
  assert.throws(() => preflightPatchSet(base), /syntax check failed.*webview\/index\.js/i);
});

test("preflightPatchSet summarizes asset verification without listing every archive asset", () => {
  const source = makeAsar({ "webview/index.js": "export const started = true;" });
  const sourceSha256 = sha256(source);
  const assets = [
    ["webview/assets/codex-plus/runtime-manifest.js", "window.__CodexPlusRuntimeConfig={};"],
    ["webview/assets/codex-plus/api/hostAdapters.js", "globalThis.CodexPlusHost.requiredAdapterMethods=[];"],
  ];
  const result = preflightPatchSet({
    sourceApp: "/source/Codex.app",
    identity: { version: "1", bundleVersion: "2", asarSha256: sourceSha256, sourceFamily: "codex" },
    patchSet: {
      id: "codex-test-1",
      codexVersion: "1",
      bundleVersion: "2",
      asarSha256: sourceSha256,
      sourceFamily: "codex",
      runtimeConfig: {},
      assetFiles: assets,
      patches: [],
    },
    operations: { readSourceAsar: () => source, getPatcherGitSha: () => "test" },
  });

  assert.equal(result.assetFileCount, assets.length);
  assert.deepEqual(result.requiredAssets, assets.map(([filePath]) => filePath));
  assert.equal("assetFiles" in result, false);
});

test("preflightPatchSet rejects duplicate variants and incorrect transform order", () => {
  const source = makeAsar({ "webview/index.js": "export const started = true;" });
  const sourceSha256 = sha256(source);
  const transform = (id, order) => ownedTestTransform(
    "codex-test-1",
    id,
    order,
    (text) => text.replace("true", "false"),
  );
  const patchSet = {
    id: "codex-test-1",
    codexVersion: "1",
    bundleVersion: "2",
    asarSha256: sourceSha256,
    sourceFamily: "codex",
    patches: [{
      id: "test",
      fileTransforms: [
        ["webview/index.js", transform("codex-test-1/test/first", 1)],
        ["webview/index.js", transform("codex-test-1/test/second", 0)],
      ],
    }],
  };
  const options = {
    sourceApp: "/source/Codex.app",
    identity: { version: "1", bundleVersion: "2", asarSha256: sourceSha256, sourceFamily: "codex" },
    patchSet,
    operations: { readSourceAsar: () => source, getPatcherGitSha: () => "test" },
  };

  assert.throws(() => preflightPatchSet(options), /out of order/);
  patchSet.patches[0].fileTransforms[1][1] = transform("codex-test-1/test/first", 2);
  assert.throws(() => preflightPatchSet(options), /Duplicate transform variant codex-test-1\/test\/first/);
});

test("replaceOnce reports missing and duplicate anchors precisely", () => {
  assert.throws(() => replaceOnce("none", "anchor", "patched", "test anchor"), /Expected one test anchor, found 0/);
  assert.throws(() => replaceOnce("anchor anchor", "anchor", "patched", "test anchor"), /Expected one test anchor, found 2/);
});

test("registered transforms carry explicit patch-set ownership", () => {
  for (const patchSet of patchSets) {
    for (const [, transform] of collectFileTransforms(patchSet)) {
      assert.equal(transform.ownerPatchSetId, patchSet.id, `${patchSet.id}: ${transform.name}`);
      assert.match(transform.variantId, new RegExp(`^${patchSet.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`));
      assert.equal(Number.isInteger(transform.transformOrder), true, `${patchSet.id}: ${transform.name} order`);
      assert.throws(
        () => transform("irrelevant", { patchSetId: "another-patch-set" }),
        /belongs to .*another-patch-set/,
      );
    }
  }
});

test("26.715 moved seams bind the owned command, composer, and project selector adapters", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.715.21316-5484");
  const transforms = collectFileTransforms(patchSet);
  const byName = (name) => transforms.find(([, transform]) => transform.name === name)?.[1];

  const header = byName("patchHeader")([
    "function ar(e){let t=(0,or.c)(5),{conversationId:n}=e,",
    "let l=c;if(l==null||!s||o.kind!==`git`||a.kind===`remote-control`)return null;let u;return t[2]!==l||t[3]!==a?(u=(0,sr.jsx)(U.HeaderAction,{actionId:`thread-local-project-actions`,align:`end`,order:100,children:(0,sr.jsx)(Jn,{cwd:l,hostConfig:a})}),t[2]=l,t[3]=a,t[4]=u):u=t[4],u}",
  ].join(""));
  assert.match(header, /useSyncExternalStore:nr\.useSyncExternalStore/);

  const title = byName("patchThreadTitle")([
    "var zl,Bl,Vl=e((()=>{zl=h(),",
    "function Il(e){let t=(0,zl.c)(43),",
    "projectName:f,title:p,titleSuffix:m,cwd:h,canPin:g,hideForkActions:_}=e,v=u===void 0?!1:u,",
    "let w=C,T=r(St,i),E=bo(w,Ne(a??T).id),D;",
  ].join(""));
  assert.match(title, /var CPXReact,zl,Bl,Vl=e\(\(\(\)=>\{CPXReact=t\(c\(\),1\),zl=h\(\),/);
  assert.match(title, /CPXReact\.useSyncExternalStore\(CPXH\.threadHeader\.subscribe,CPXH\.threadHeader\.snapshot,CPXH\.threadHeader\.snapshot\)/);

  const command = byName("patchCommandMenuRuntimeCommands")([
    "function o4(e){let t=(0,z4.c)(134),",
    "!i&&c!=null&&oe.push(c),t[30]=U,",
    "c=()=>{Hs(r.id,`command_menu`),r.id!==`searchChats`&&n()},t[2]=n,t[3]=r.id,t[4]=c):c=t[4];",
  ].join(""));
  assert.match(command, /function CPXCommandPaletteItem/);
  assert.match(command, /CodexPlusHost\.adapters\.commands\.metadata/);
  assert.match(command, /bindNativeDispatch/);

  const composer = byName("patchComposerPrimitiveSurface")([
    "function C(e){let t=(0,L.c)(36),{children:r,className:i,utilityBarVariant:a,inert:o,isDragActive:s,layout:c,radiusVariant:l,surfaceOverflow:u,surfaceVariant:d,onDragEnter:f,onDragLeave:p,onDragOver:h,onDrop:g}=e,",
    "t[19]!==T||t[20]!==r||t[21]!==f||t[22]!==p||t[23]!==h||t[24]!==g||t[25]!==k||t[26]!==A?",
    "M=(0,z.jsx)(T,{inert:k,className:A,onMouseDown:I,onDragEnter:f,onDragOver:h,onDragLeave:p,onDrop:g,children:r}),t[19]=T,t[20]=r,t[21]=f,t[22]=p,t[23]=h,t[24]=g,t[25]=k,t[26]=A,t[27]=M",
  ].join(""));
  assert.match(composer, /codexPlusProps:CPX_surfaceProps/);
  assert.match(composer, /R\.useSyncExternalStore\(CPXCTX\.subscribe,CPXCTX\.snapshot,CPXCTX\.snapshot\)/);
  assert.match(composer, /project:e&&e\.project!=null\?e\.project:CPXCTX\.active\(\)/);
  assert.match(composer, /CPX_resolvedSurfaceProps=CPXSurfaceProps\(\{\}\)/);
  assert.match(composer, /\.\.\.CPX_resolvedSurfaceProps/);
  assert.match(composer, /t\[36\]=CPX_resolvedSurfaceProps/);

  const selector = byName("patchHomeProjectDropdownProjectSelectorShortcut")([
    "function ut(e){let t=(0,ft.c)(32),",
    "_=r.filter(e),t[0]=r,t[1]=h,t[2]=_",
    "t[9]===a?C=t[10]:(C=e=>{a(e.projectId)},t[9]=a,t[10]=C);let w;",
    "function ht({activeProjectIdOverride:e,allowLocalProjects:t=!0,",
    "I=f??v,L=e=>{y(e),p?.(e)},Te=",
    "(0,X.jsx)(qe,{open:f,onOpenChange:L,onCloseAutoFocus:j,side:`top`,triggerButton:h,contentWidth:`menu`,",
    "let q=(0,X.jsx)(qe,{open:f,onOpenChange:L,onCloseAutoFocus:j,side:`top`,align:u===`hero`?`center`:`start`,disabled:s,triggerButton:h??(u===`hero`?Ge():We()),contentWidth:`workspace`,",
  ].join(""));
  assert.match(selector, /CPXP\.setOpenHandler\(u/);
  assert.match(selector, /CPXP\.fuzzyFilter\(r,h\)/);
  assert.match(selector, /CPXP\.setAcceptFirstHandler/);
  assert.match(selector, /open:I/);
  assert.match(selector, /triggerButton:CPXPST/);

  const visibleTrigger = byName("patchLocalActiveWorkspaceRootDropdownProjectSelectorShortcut")(
    [
      "function M(e){let t=(0,N.c)(23),",
      "h=(0,P.jsx)(O,{value:s,onChange:p,placeholder:m,className:`mb-1`})",
      "(0,q.jsx)(`span`,{className:`truncate`,children:e.label})",
      '(0,Q.jsx)(x,{"aria-label":n,"data-composer-navigation-target":r,categoryLabel:null,collapse:`xs`,disabled:C,icon:u,indicator:`none`,value:M,valueClassName:T})',
    ].join(""),
  );
  assert.match(visibleTrigger, /onKeyDown:CPXP\.acceptCurrent/);
  assert.match(visibleTrigger, /CPXP\.fuzzyHighlight/);
  assert.match(visibleTrigger, /data-codex-plus-project-selector-trigger/);
  assert.match(visibleTrigger, /data-codex-plus-project-selector-variant":`home`/);
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
    codexPlusHostBridge: {
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
      querySelector() {
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
          id: "broken-row",
          order: -1,
          render: () => {
            throw new Error("settings row exploded");
          },
        });
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
  assert.equal(typeof api.plugins.get, "function");
  assert.deepEqual(plain(api.plugins.list().map((plugin) => plugin.id)), ["sample"]);
  assert.deepEqual(plain(window.CodexPlusHost.adapters.commands.dispatch("sample.command")), {
    handled: true,
    source: "plugin",
  });
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
  assert.deepEqual(plain(registeredMenus[0].run()), { handled: true, source: "plugin" });
  assert.equal(registeredMenus[0].options.menuItem.render(() => {}).type, "menu-item");
  const rows = api.ui.settings.appearance.renderRows({ deps: { jsx }, variant: "light" });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].type(rows[0].props), null);
  assert.equal(rows[1].type(rows[1].props).props.label, "Sample row");
  assert.deepEqual(plain(api.ui.sidebar.projectRowProps({ project: "x" })), {
    "data-sample-project": "",
    "data-sample-project-2": "",
    style: { color: "red", background: "blue" },
  });
  assert.deepEqual(plain(api.ui.sidebar.threadRowProps({ project: "x" })), { "data-sample-thread": "" });
  assert.equal(typeof api.ui.sidebar.registerSection, "function");
  assert.equal(typeof api.ui.sidebar.renderSection, "function");
  assert.equal(typeof api.ui.routeContext.set, "function");
  assert.equal(typeof api.ui.routeContext.active, "function");
  api.ui.routeContext.set({
    routeId: "virtual:sample",
    sourceProject: { id: "sample", label: "Sample", cwd: "/tmp/source" },
    cwd: "/tmp/worktree",
    activeCwd: "/tmp/worktree",
    workspaceRoot: "/tmp/worktree",
    gitRoot: "/tmp/source",
    hostId: "",
    threadId: "owner-thread",
    branchName: "branch",
    source: "sample",
    title: "Sample virtual route",
  });
  assert.deepEqual(plain(api.ui.routeContext.active()), {
    routeId: "virtual:sample",
    sourceProject: { id: "sample", label: "Sample", cwd: "/tmp/source" },
    cwd: "/tmp/worktree",
    activeCwd: "/tmp/worktree",
    workspaceRoot: "/tmp/worktree",
    gitRoot: "/tmp/source",
    hostId: "",
    threadId: "owner-thread",
    branchName: "branch",
    source: "sample",
    title: "Sample virtual route",
  });
  assert.equal(api.ui.projectContext.active().cwd, "/tmp/worktree");
  assert.equal(api.ui.projectContext.active().title, "Sample virtual route");
  assert.equal(typeof api.ui.chatRows.render, "function");
  assert.equal(typeof api.ui.chatRows.renderRow, "function");
  assert.deepEqual(plain(api.ui.message.userBubbleProps({ project: "x" })), { "data-sample-message": "" });
  assert.deepEqual(plain(api.ui.composer.surfaceProps({ project: "x" })), { "data-sample-composer": "" });
  assert.deepEqual(plain(api.ui.mermaid.diagramProps({ code: "graph TD;A-->B" })), { "data-sample-mermaid": "" });
  assert.equal(api.ui.review.renderBody({ defaultBody: "body", props: {}, deps: {} }), "wrapped:body");
  assert.equal(
    window.CodexPlusHost.adapters.review.renderBodyFromHost(
      { mainReviewContent: "host-body" },
      [{ jsx, jsxs: jsx, Fragment: "fragment" }, { createElement: () => null }, null, null, null, null, null, null, null, null, null, "default-review", null, null, null, null, null, null, null, () => [], () => null],
    ),
    "wrapped:host-body",
  );
  assert.equal(api.ui.errors.renderDetails({ jsx, error: new Error("boom") }).props.children, "boom");
  const headerAccessories = api.ui.threadHeader.renderAccessories({ context: { cwd: "/tmp/example" }, deps: { jsx } });
  const renderedHeaderAccessories = headerAccessories.type(headerAccessories.props);
  assert.equal(renderedHeaderAccessories.length, 1);
  assert.equal(renderedHeaderAccessories[0].type(renderedHeaderAccessories[0].props).type, "span");
  assert.equal(renderedHeaderAccessories[0].type(renderedHeaderAccessories[0].props).props.children, "/tmp/worktree");
  assert.deepEqual(api.modules.findByProps("marker"), { marker: true });
  assert.equal(api.patches.apply("hello world"), "hi world");
  assert.equal(styles.some((element) => element.id === "codex-plus-style-sample"), true);
  assert.ok(api.diagnostics.snapshot().some((entry) => entry.event === "threadHeader.addAccessory"));
  assert.ok(api.diagnostics.snapshot().some((entry) => entry.event === "threadHeader.render" && entry.details.cwd === "/tmp/worktree"));
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
    codexPlusHostBridge: {
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
    addEventListener() {},
    removeEventListener() {},
  };
  class FakeElement extends window.HTMLElement {
    constructor(id = "trigger", rect = { height: 20, left: 0, top: 0, width: 80 }, variant = "default", child = null) {
      super();
      this.id = id;
      this.rect = rect;
      this.variant = variant;
      this.child = child;
    }

    matches() {
      return false;
    }

    querySelector(selector) {
      assert.equal(selector, "button,[role='button'],[tabindex]");
      return this.child;
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
        if (type === "keydown") keydownListeners.push({ type, listener, options });
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

  const triggerAdapter = window.CodexPlusHost.adapters.projectSelector.trigger;
  const reactElement = { type: "button", props: { className: "project-trigger" } };
  const cloneElement = (element, props) => ({ ...element, props });

  const plain = (value) => JSON.parse(JSON.stringify(value));

  assert.deepEqual(plain(triggerAdapter(reactElement, "default", { cloneElement })), {
    type: "button",
    props: {
      className: "project-trigger",
      "data-codex-plus-project-selector-trigger": true,
      "data-codex-plus-project-selector-variant": "default",
    },
  });
  assert.deepEqual(plain(triggerAdapter(reactElement, "home", { default: { cloneElement } })), {
    type: "button",
    props: {
      className: "project-trigger",
      "data-codex-plus-project-selector-trigger": true,
      "data-codex-plus-project-selector-variant": "home",
    },
  });

  const command = window.CodexPlus.commands.all().find((command) => command.id === "codexPlus.focusProjectSelector");
  assert.equal(command.title, "Focus project selector");
  assert.equal(command.description, "Focus or open the new chat project selector");
  assert.deepEqual(plain(command.menu.groups), ["suggested", "workspace"]);
  assert.deepEqual(plain(command.palette), { enabled: true, keywords: ["project", "selector", "new chat"] });
  assert.deepEqual(plain(command.shortcut.defaultKeybindings), [{ key: "CmdOrCtrl+." }]);
  const projects = [
    { projectId: "a", label: "alpha-workspace", path: "/tmp/alpha-workspace" },
    { projectId: "b", label: "beta-service", path: "/tmp/beta-service" },
    { projectId: "c", label: "gamma-tools", path: "/tmp/gamma-tools" },
    { projectId: "d", label: "delta-service", path: "/tmp/delta-service/archive" },
  ];
  assert.deepEqual(
    window.CodexPlus.ui.projectSelector.fuzzyFilter(projects, "alpha   work").map((project) => project.projectId),
    ["a"],
  );
  assert.deepEqual(
    window.CodexPlus.ui.projectSelector.fuzzyFilter(projects, "beta service").map((project) => project.projectId),
    ["b"],
  );
  const jsx = (type, props, key) => ({ type, props, key });
  const normalize = (value) => JSON.parse(JSON.stringify(value));
  delete window.fzf;
  assert.throws(
    () => window.CodexPlus.ui.projectSelector.fuzzyFilter(projects, "alpha work"),
    /fzf asset is unavailable/,
  );
  window.fzf = { Fzf: FakeFzf };
  assert.deepEqual(
    normalize(window.CodexPlus.ui.projectSelector.fuzzyHighlight({ text: "beta-service", query: "bs", jsx })),
    [
      {
        type: "strong",
        props: {
          className: "font-semibold",
          style: { color: "var(--color-token-text-link-foreground, #2563eb)" },
          children: "b",
        },
        key: 0,
      },
      "eta-",
      {
        type: "strong",
        props: {
          className: "font-semibold",
          style: { color: "var(--color-token-text-link-foreground, #2563eb)" },
          children: "s",
        },
        key: 1,
      },
      "ervice",
    ],
  );
  assert.deepEqual(
    normalize(window.CodexPlus.ui.projectSelector.fuzzyHighlight({ text: "alpha-workspace", query: "aw", jsx })),
    [
      {
        type: "strong",
        props: {
          className: "font-semibold",
          style: { color: "var(--color-token-text-link-foreground, #2563eb)" },
          children: "a",
        },
        key: 0,
      },
      "lpha-",
      {
        type: "strong",
        props: {
          className: "font-semibold",
          style: { color: "var(--color-token-text-link-foreground, #2563eb)" },
          children: "w",
        },
        key: 1,
      },
      "orkspace",
    ],
  );
  assert.equal(keydownListeners.length, 1);
  assert.deepEqual({ type: keydownListeners[0].type, options: keydownListeners[0].options }, { type: "keydown", options: true });
  assert.throws(
    () => window.CodexPlus.commands.run("codexPlus.focusProjectSelector"),
    /did not bind the default trigger/,
  );

  let openCount = 0;
  window.CodexPlusHost.adapters.projectSelector.setOpenHandler("default", () => {
    openCount += 1;
    return true;
  });
  assert.equal(window.CodexPlus.commands.run("codexPlus.focusProjectSelector"), true);
  const presentKeydown = { key: ".", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  keydownListeners[0].listener(presentKeydown);
  assert.equal(presentKeydown.defaultPrevented, true);
  assert.equal(openCount, 2);

  let acceptedEvent = null;
  window.CodexPlusHost.adapters.projectSelector.setAcceptFirstHandler((event) => {
    acceptedEvent = event;
    return "accepted";
  });
  const enter = { key: "Enter" };
  assert.equal(window.CodexPlusHost.adapters.projectSelector.acceptCurrent(enter), "accepted");
  assert.equal(acceptedEvent, enter);
});

test("local active workspace root dropdown exposes only the final selector trigger to Codex Plus", () => {
  const fakeDropdownBundle = [
    "Ne=r();function Pe(e){let t=(0,Ne.c)(42),{groups:n,selectedProjectIds:r,onSelectProjectId:i,keepOpenOnSelect:a,projectlessActionLabel:o,onSelectProjectless:s,footerItems:c,onAddLocalProject:l,onAddRemoteProject:u,emptyMessage:te}=e,ne=a===void 0?!1:a,p=ee(),m=s!=null&&o!=null,[h,re]=(0,Me.useState)(``),_,v,y,b,x,S;if(t[0]!==m||t[1]!==c||t[2]!==n||t[3]!==p||t[4]!==ne||t[5]!==l||t[6]!==u||t[7]!==i||t[8]!==h||t[9]!==r){let e=h.trim().toLowerCase();v=n.filter(t=>{if(!e)return!0;let n=t.repositoryData?.rootFolder??``;return[t.label,n,t.path??``,t.hostDisplayName??``].some(t=>t.toLowerCase().includes(e))});let a=new Map;n.forEach(e=>{if(e.path==null)return;let t=a.get(e.label);if(t==null){a.set(e.label,[e.path]);return}t.push(e.path)}),y=m||c!=null||l!=null||u!=null;let o;t[16]===Symbol.for(`react.memo_cache_sentinel`)?(o=e=>{re(e.target.value)},t[16]=o):o=t[16];let s;t[17]===p?s=t[18]:(s=p.formatMessage({id:`composer.localCwdDropdown.searchPlaceholder`,defaultMessage:`Search projects`,description:`Placeholder for searching the workspace root dropdown`}),t[17]=p,t[18]=s),t[19]!==h||t[20]!==s?(S=(0,H.jsx)(ve,{value:h,onChange:o,placeholder:s,className:`mb-1`}),t[19]=h,t[20]=s,t[21]=S):S=t[21],_=I.Section,b=`flex max-h-[calc((1lh+var(--padding-row-y)*2)*5)] flex-col overflow-y-auto text-sm [--edge-fade-distance:1.5rem]`,x=v.map(e=>{let t=e.repositoryData?.rootFolder,n=t&&t!==e.label,o=!!e.isCodexWorktree,s=a.get(e.label)??[],c=s.length>1&&e.path!=null?g(e.path,s):null;return(0,H.jsx)(`div`,{className:`flex flex-col`,children:(0,H.jsxs)(F,{RightIcon:r.includes(e.projectId)?f:void 0,tooltipText:c??void 0,tooltipAlign:`center`,onSelect:t=>{ne&&t.preventDefault(),i(e.projectId)},children:[(0,H.jsx)(I.ItemIcon,{size:`xs`,children:(0,H.jsx)(we,{className:`icon-xs`,isCodexWorktree:o,isGitRepository:e.repositoryData!=null,isRemoteProject:e.projectKind===`remote`})}),(0,H.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,H.jsx)(`span`,{className:`truncate`,children:e.label}),e.hostDisplayName==null?null:(0,H.jsx)(`span`,{className:`truncate text-sm text-token-description-foreground`,children:e.hostDisplayName}),n?(0,H.jsx)(`span`,{className:`truncate text-sm text-token-description-foreground`,children:t}):null]})]})},e.projectId)}),t[0]=m,t[1]=c,t[2]=n,t[3]=p,t[4]=ne,t[5]=l,t[6]=u,t[7]=i,t[8]=h,t[9]=r,t[10]=_,t[11]=v,t[12]=y,t[13]=b,t[14]=x,t[15]=S}else _=t[10],v=t[11],y=t[12],b=t[13],x=t[14],S=t[15];return null}",
    "function Ie(e){let t=(0,Ne.c)(81),{activeProjectIdOverride:n,allowRemoteProjects:r,disabled:i,hideLabel:a,onWorkspaceRootSelected:u,variant:ee,isOpen:f,onOpenChange:g,triggerButton:E}=e,",
    "if(Ue){let e;t[37]!==J||t[38]!==E?(e=E??J(),t[37]=J,t[38]=E,t[39]=e):e=t[39];let n;t[40]!==R||t[41]!==ze?(n=R?(0,H.jsxs)(H.Fragment,{children:[(0,H.jsx)(I.Separator,{}),(0,H.jsx)(I.Item,{LeftIcon:xe,onSelect:ze,children:(0,H.jsx)(d,{id:`sidebarElectron.addRemoteProject`,defaultMessage:`Remote project`,description:`Dropdown item for adding a remote project from the sidebar`})})]}):null,t[40]=R,t[41]=ze,t[42]=n):n=t[42];let r;return t[43]!==B||t[44]!==U||t[45]!==f||t[46]!==g||t[47]!==P||t[48]!==e||t[49]!==n?(r=(0,H.jsx)(Ee,{localProjectSourcesEnabled:P,open:f,onOpenChange:g,triggerButton:e,onStartFromScratch:U,onUseExistingFolder:B,children:n}),t[43]=B,t[44]=U,t[45]=f,t[46]=g,t[47]=P,t[48]=e,t[49]=n,t[50]=r):r=t[50],r}",
    "let X=E??(k===`hero`?et():k===`home`?J():Ze()),Z;t[59]===W?Z=t[60]:(Z=W?[W]:[],t[59]=W,t[60]=Z);let nt;t[61]===Symbol.for(`react.memo_cache_sentinel`)?(nt=(0,H.jsx)(d,{id:`composer.localCwdDropdown.clearProject`,defaultMessage:`Don't work in a project`,description:`Menu item that clears the selected project and starts projectless chats`}),t[61]=nt):nt=t[61];let rt=He?Ve:void 0,Q;t[62]!==B||t[63]!==Ye||t[64]!==P?(Q=P?(0,H.jsx)(I.Item,{LeftIcon:Te,onSelect:()=>{j.current=!0},children:(0,H.jsx)(d,{id:`projectSetup.addProjectMenu.localProject`,defaultMessage:`Local project`,description:`Menu item that opens the local project creation flow`})}):(0,H.jsxs)(I.FlyoutSubmenuItem,{LeftIcon:Te,label:Ye,children:[(0,H.jsx)(I.Item,{LeftIcon:m,onSelect:()=>{j.current=!0},children:(0,H.jsx)(d,{id:`projectSetup.addProjectMenu.startFromScratch`,defaultMessage:`Start from scratch`,description:`Menu item that creates a new local project folder`})}),(0,H.jsx)(I.Item,{LeftIcon:oe,onSelect:B,children:(0,H.jsx)(d,{id:`projectSetup.addProjectMenu.useExistingFolder`,defaultMessage:`Use an existing folder`,description:`Menu item that opens the existing folder picker`})})]}),t[62]=B,t[63]=Ye,t[64]=P,t[65]=Q):Q=t[65];let it=R?ze:void 0,$;t[66]!==M||t[67]!==je||t[68]!==Z||t[69]!==rt||t[70]!==Q||t[71]!==it?($=(0,H.jsx)(Pe,{groups:M,selectedProjectIds:Z,onSelectProjectId:je,projectlessActionLabel:nt,onSelectProjectless:rt,footerItems:Q,onAddRemoteProject:it}),t[66]=M,t[67]=je,t[68]=Z,t[69]=rt,t[70]=Q,t[71]=it,t[72]=$):$=t[72];let at;return t[73]!==O||t[74]!==f||t[75]!==g||t[76]!==Y||t[77]!==tt||t[78]!==X||t[79]!==$?(at=(0,H.jsx)(ye,{open:f,onOpenChange:g,onCloseAutoFocus:Y,align:tt,disabled:O,triggerButton:X,contentWidth:`workspace`,contentMaxHeight:`tall`,children:$}),t[73]=O,t[74]=f,t[75]=g,t[76]=Y,t[77]=tt,t[78]=X,t[79]=$,t[80]=at):at=t[80],at}",
  ].join("");

  for (const patchSet of codexPatchSets) {
    const transform = findTransform(patchSet, "local-active-workspace-root-dropdown");

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
    assert.doesNotMatch(transformed, /\}=e,\[CPXO,CPXS\]=[^;]+,f\?\?=/);
    assert.match(transformed, /\[CPXO,CPXS\]=\(0,Me\.useState\)\(!1\);f\?\?=CPXO;let CPXN=g;g=e=>\{CPXS\(e\),CPXN\?\.\(e\)\};let CPXOH=/);
    assert.match(transformed, /CPXOH=CPXP\.setOpenHandler\(ee\?\?`default`,\(\)=>\{g\(!0\);return!0\}\)/);
    assert.match(transformed, /open:f,onOpenChange:g,triggerButton:e,onStartFromScratch:U/);
    assert.match(transformed, /triggerButton:CPXPST\(X,k\)/);
    assert.match(transformed, /open:f,onOpenChange:g,onCloseAutoFocus:Y/);
    assert.match(transformed, /t\[45\]!==f\|\|t\[46\]!==g/);
    assert.match(transformed, /t\[74\]!==f\|\|t\[75\]!==g/);
    assert.doesNotMatch(transformed, /className:`contents`/);
    assert.doesNotMatch(transformed, /codexPlusCloseProjectSelector/);
    assert.doesNotMatch(transformed, /t\[72\]!==g/);
    assert.equal(transformedCacheDependencies.length, originalCacheDependencies.length);
    assert.equal(transformed.match(/CPXPST/g)?.length, 2);
  }
});

test("42026 local remote dropdown wraps the visible selector trigger", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.42026-4514");
  const transform = findTransform(patchSet, "local-active-workspace-root-dropdown");
  const fakeDropdownBundle = [
    "function sa(e){let t=(0,ha.c)(64),",
    "let H;t[30]!==a||t[31]!==c||t[32]!==o||t[33]!==l.cwd||t[34]!==l.hostId||t[35]!==u||t[36]!==oe||t[37]!==j||t[38]!==ie||t[39]!==ee||t[40]!==te||t[41]!==x||t[42]!==b||t[43]!==T||t[44]!==r||t[45]!==n||t[46]!==y||t[47]!==k||t[48]!==M||t[49]!==P||t[50]!==I||t[51]!==f||t[52]!==ce||t[53]!==s||t[54]!==i||t[55]!==p||t[56]!==h||t[57]!==g||t[58]!==B||t[59]!==_?(H=ce?(0,Q.jsx)(Bt,{open:n,onOpenChange:r,side:i,triggerButton:_===`summary-panel`?B:(0,Q.jsx)(Oe,{tooltipContent:h,tooltipMaxWidth:g,children:B}),children:(0,Q.jsxs)(`div`,{className:ht(`flex flex-col`),children:[]})}):(0,Q.jsx)(Oe,{tooltipContent:h,tooltipMaxWidth:g,children:(0,Q.jsx)(`span`,{className:`inline-flex`,children:(0,Q.jsx)(`div`,{className:`pointer-events-none`,children:B})})}),t[30]=a,t[31]=c,t[32]=o,t[33]=l.cwd,t[34]=l.hostId,t[35]=u,t[36]=oe,t[37]=j,t[38]=ie,t[39]=ee,t[40]=te,t[41]=x,t[42]=b,t[43]=T,t[44]=r,t[45]=n,t[46]=y,t[47]=k,t[48]=M,t[49]=P,t[50]=I,t[51]=f,t[52]=ce,t[53]=s,t[54]=i,t[55]=p,t[56]=h,t[57]=g,t[58]=B,t[59]=_,t[60]=H):H=t[60];",
  ].join("");

  const transformed = transform(fakeDropdownBundle);

  assert.match(transformed, /CPXP=window\.CodexPlusHost\.adapters\.projectSelector/);
  assert.match(transformed, /function CPXPST\(e,t\)\{return CPXP\.trigger\(e,t,ga\)\}/);
  assert.match(transformed, /triggerButton:CPXPST\(_===`summary-panel`\?B:\(0,Q\.jsx\)\(Oe,\{tooltipContent:h,tooltipMaxWidth:g,children:B\}\),_\)/);
  assert.equal(transformed.match(/data-codex-plus-project-selector-trigger/g), null);
});

test("42026 home project selector binds React and its normalized controlled open state", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.42026-4514");
  const transform = findTransform(patchSet, "home-project-dropdown");
  const transformed = transform([
    "function zn(e){let t=(0,Bn.c)(44),",
    "let e=_.trim().toLowerCase();b=r.filter(t=>{if(!e)return!0;let n=t.repositoryData?.rootFolder??``;return[t.label,n,t.path??``,t.hostDisplayName??``].some(t=>t.toLowerCase().includes(e))});",
    "w=(0,Z.jsx)(_t,{value:_,onChange:s,placeholder:c,className:`mb-1`})",
    "(0,Z.jsx)(`span`,{className:`truncate`,children:e.label})",
    "function ar({activeProjectIdOverride:e,allowLocalProjects:t=!0,allowLocalProjectActions:n=t,allowRemoteProjects:r=!0,disabled:i=!1,hideLabel:o=!1,onWorkspaceRootSelected:s,variant:u=`default`,isOpen:d,onOpenChange:f,triggerButton:p}){",
    "Ee=d??_,De=e=>{e&&x(!1),v(e),f?.(e)},Oe=n&&u===`home`&&O.length===0&&!k;",
    "children:(0,$.jsxs)(me,{size:`composerSm`,color:`ghost`,className:`min-w-0`,children:",
    "children:(0,$.jsx)($n,{categoryLabel:(0,$.jsx)(R,{id:`composer.localCwdDropdown.footerCategory`",
    "ze=()=>(0,$.jsxs)(`button`,{className:V(`heading-xl text-token-text-tertiary",
    "if(Oe)return(0,$.jsxs)(it,{open:d,onOpenChange:De,onCloseAutoFocus:Se,side:`top`,triggerButton:p??G(),contentWidth:`menu`,children:[]});",
    "let Be=(0,$.jsx)(it,{open:d,onOpenChange:De,onCloseAutoFocus:Se,side:`top`,align:u===`hero`?`center`:`start`,disabled:i,triggerButton:p??(u===`hero`?ze():u===`home`?G():Ie()),contentWidth:`workspace`,contentMaxHeight:`tall`,children:null});",
  ].join(""));

  assert.match(transformed, /function CPXPST\(e,t\)\{return CPXP\.trigger\(e,t,sr\)\}/);
  assert.match(transformed, /CPXOH=CPXP\.setOpenHandler\(u,\(\)=>\{De\(!0\);return!0\}\)/);
  assert.equal(transformed.match(/it,\{open:Ee,onOpenChange:De/g)?.length, 2);
  assert.doesNotMatch(transformed, /it,\{open:d,onOpenChange:De/);
});

test("41415 home project selector exposes its normalized controlled open state", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.41415-4505");
  const transform = findTransform(patchSet, "home-project-dropdown");
  const transformed = transform([
    "function St({activeProjectIdOverride:e,allowLocalProjects:t=!0,allowLocalProjectActions:n=t,allowRemoteProjects:r=!0,disabled:a=!1,hideLabel:o=!1,onWorkspaceRootSelected:s,variant:c=`default`,isOpen:l,onOpenChange:m,triggerButton:_}){",
    "let e=_.trim().toLowerCase();b=r.filter(t=>{if(!e)return!0;let n=t.repositoryData?.rootFolder??``;return[t.label,n,t.path??``,t.hostDisplayName??``].some(t=>t.toLowerCase().includes(e))});",
    "w=(0,X.jsx)(ie,{value:_,onChange:s,placeholder:c,className:`mb-1`})",
    "(0,X.jsx)(`span`,{className:`truncate`,children:e.label})",
    "Pe=l??S,U=e=>{e&&A(!1),C(e),m?.(e)},Re=n&&c===`home`;",
    "children:(0,$.jsxs)(Ne,{size:`composerSm`,color:`ghost`,className:`min-w-0`,children:",
    "children:(0,$.jsx)(gt,{categoryLabel:(0,$.jsx)(R,{id:`composer.localCwdDropdown.footerCategory`",
    "Ze=()=>(0,$.jsxs)(`button`,{className:W(`heading-xl text-token-text-tertiary",
    "if(Re)return(0,$.jsxs)(ce,{open:l,onOpenChange:U,onCloseAutoFocus:De,side:`top`,triggerButton:_??J(),contentWidth:`menu`,children:[]});",
    "let $e=(0,$.jsx)(ce,{open:l,onOpenChange:U,onCloseAutoFocus:De,side:`top`,align:c===`hero`?`center`:`start`,disabled:a,triggerButton:_??(c===`hero`?Ze():c===`home`?J():Ke()),contentWidth:`workspace`,contentMaxHeight:`tall`,children:null});",
  ].join(""));
  assert.match(transformed, /function CPXPST\(e,t\)\{return CPXP\.trigger\(e,t,wt\)\}/);
  assert.match(transformed, /CPXOH=CPXP\.setOpenHandler\(c,\(\)=>\{U\(!0\);return!0\}\)/);
  assert.equal(transformed.match(/ce,\{open:Pe,onOpenChange:U/g)?.length, 2);
  assert.doesNotMatch(transformed, /ce,\{open:l,onOpenChange:U/);
});

test("101652 local workspace dropdown exposes the selector trigger and fuzzy search", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.101652-4674");
  const transform = findTransform(patchSet, "local-active-workspace-root-dropdown");
  const fakeDropdownBundle = [
    "function sV(e){let t=(0,cV.c)(44),{children:n,groups:r,projectAppearances:i,selectedProjectIds:a,onSelectProjectId:o,keepOpenOnSelect:s,projectlessActionLabel:c,onSelectProjectless:l,footerItems:u,onAddLocalProject:d,onAddRemoteProject:f,emptyMessage:p}=e,",
    "let e=_.trim().toLowerCase();b=r.filter(t=>{if(!e)return!0;let n=t.repositoryData?.rootFolder??``;return[t.label,n,t.path??``,t.hostDisplayName??``].some(t=>t.toLowerCase().includes(e))});",
    "w=(0,uV.jsx)(yl,{value:_,onChange:s,placeholder:c,className:`mb-1`})",
    "(0,uV.jsx)(`span`,{className:`truncate`,children:e.label})",
    "function yV({activeProjectIdOverride:e,allowLocalProjects:t=!0,allowLocalProjectActions:n=t,allowRemoteProjects:r=!0,disabled:i=!1,hideLabel:a=!1,onWorkspaceRootSelected:o,variant:s=`default`,isOpen:c,onOpenChange:l,triggerButton:u}){",
    "le=D&&oe!=null,ue=c??p,z=e=>{e&&g(!1),m(e),l?.(e)},de=n&&s===`home`&&S.length===0&&!C;",
    "if(de)return(0,SV.jsxs)(wc,{open:c,onOpenChange:z,onCloseAutoFocus:re,side:`top`,triggerButton:u??Ce(),contentWidth:`menu`,children:[L?null:null,ye]});",
    "let Te=(0,SV.jsx)(wc,{open:c,onOpenChange:z,onCloseAutoFocus:re,side:`top`,align:s===`hero`?`center`:`start`,disabled:i,triggerButton:u??(s===`hero`?we():s===`home`?Ce():be()),contentWidth:`workspace`,contentMaxHeight:`tall`,children:null});",
  ].join("");

  const transformed = transform(fakeDropdownBundle);

  assert.match(transformed, /CPXP=window\.CodexPlusHost\.adapters\.projectSelector/);
  assert.match(transformed, /b=CPXP\.fuzzyFilter\(r,_\)/);
  assert.match(transformed, /onKeyDown:e=>CPXP\.acceptFirst\(e,b,o,_\)/);
  assert.match(transformed, /children:CPXP\.fuzzyHighlight\(e\.label,_,uV\.jsx\)/);
  assert.match(transformed, /function CPXPST\(e,t\)\{return CPXP\.trigger\(e,t,xV\)\}/);
  assert.match(transformed, /CPXOH=CPXP\.setOpenHandler\(s,\(\)=>\{z\(!0\);return!0\}\)/);
  assert.equal(transformed.match(/wc,\{open:ue,onOpenChange:z/g)?.length, 2);
  assert.doesNotMatch(transformed, /wc,\{open:c,onOpenChange:z/);
  assert.match(transformed, /triggerButton:CPXPST\(u\?\?Ce\(\),s\),contentWidth:`menu`/);
  assert.match(transformed, /triggerButton:CPXPST\(u\?\?\(s===`hero`\?we\(\):s===`home`\?Ce\(\):be\(\)\),s\),contentWidth:`workspace`/);
  assert.equal(transformed.match(/data-codex-plus-project-selector-trigger/g), null);
});

test("70822 home project selector exposes its normalized controlled open state", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.70822-4559");
  const transform = findTransform(patchSet, "home-project-dropdown");
  const transformed = transform([
    "function tV(e){let t=(0,JB.c)(44),",
    "let e=_.trim().toLowerCase();b=r.filter(t=>{if(!e)return!0;let n=t.repositoryData?.rootFolder??``;return[t.label,n,t.path??``,t.hostDisplayName??``].some(t=>t.toLowerCase().includes(e))});",
    "w=(0,YB.jsx)(Ql,{value:_,onChange:s,placeholder:c,className:`mb-1`})",
    "(0,YB.jsx)(`span`,{className:`truncate`,children:e.label})",
    "function iV({activeProjectIdOverride:e,allowLocalProjects:t=!0,allowLocalProjectActions:n=t,allowRemoteProjects:r=!0,disabled:i=!1,hideLabel:a=!1,onWorkspaceRootSelected:o,variant:s=`default`,isOpen:c,onOpenChange:l,triggerButton:u}){",
    "V=c??p,ue=e=>{e&&g(!1),m(e),l?.(e)},de=n&&s===`home`&&C.length===0&&!w;",
    "children:(0,sV.jsxs)(Fc,{size:`composerSm`,color:`ghost`,className:`min-w-0`,children:",
    "children:(0,sV.jsx)(yA,{categoryLabel:(0,sV.jsx)(X,{id:`composer.localCwdDropdown.footerCategory`",
    "Ce=()=>(0,sV.jsxs)(`button`,{className:pu(`heading-xl text-token-text-tertiary",
    "if(de)return(0,sV.jsxs)(Fl,{open:c,onOpenChange:ue,onCloseAutoFocus:ie,side:`top`,triggerButton:u??Se(),contentWidth:`menu`,children:[]});",
    "let we=(0,sV.jsx)(Fl,{open:c,onOpenChange:ue,onCloseAutoFocus:ie,side:`top`,align:s===`hero`?`center`:`start`,disabled:i,triggerButton:u??(s===`hero`?Ce():s===`home`?Se():ye()),contentWidth:`workspace`,contentMaxHeight:`tall`,children:null});",
  ].join(""));

  assert.match(transformed, /function CPXPST\(e,t\)\{return CPXP\.trigger\(e,t,oV\)\}/);
  assert.match(transformed, /CPXOH=CPXP\.setOpenHandler\(s,\(\)=>\{ue\(!0\);return!0\}\)/);
  assert.equal(transformed.match(/Fl,\{open:V,onOpenChange:ue/g)?.length, 2);
  assert.doesNotMatch(transformed, /Fl,\{open:c,onOpenChange:ue/);
});

test("61825 home project selector exposes its normalized controlled open state", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.61825-4548");
  const transform = findTransform(patchSet, "home-project-dropdown");
  const transformed = transform([
    "function qH({activeProjectIdOverride:e,allowLocalProjects:t=!0,allowLocalProjectActions:n=t,allowRemoteProjects:r=!0,disabled:i=!1,hideLabel:a=!1,onWorkspaceRootSelected:o,variant:s=`default`,isOpen:c,onOpenChange:l,triggerButton:u}){",
    "let e=_.trim().toLowerCase();b=r.filter(t=>{if(!e)return!0;let n=t.repositoryData?.rootFolder??``;return[t.label,n,t.path??``,t.hostDisplayName??``].some(t=>t.toLowerCase().includes(e))});",
    "w=(0,RH.jsx)(oc,{value:_,onChange:s,placeholder:c,className:`mb-1`})",
    "(0,RH.jsx)(`span`,{className:`truncate`,children:e.label})",
    "le=c??p,ue=e=>{e&&g(!1),m(e),l?.(e)},de=n&&s===`home`;",
    "children:(0,XH.jsxs)(Ji,{size:`composerSm`,color:`ghost`,className:`min-w-0`,children:",
    "children:(0,XH.jsx)(gv,{categoryLabel:(0,XH.jsx)(Y,{id:`composer.localCwdDropdown.footerCategory`",
    "Ce=()=>(0,XH.jsxs)(`button`,{className:Qo(`heading-xl text-token-text-tertiary",
    "if(de)return(0,XH.jsxs)(_o,{open:c,onOpenChange:ue,onCloseAutoFocus:ne,side:`top`,triggerButton:u??Se(),contentWidth:`menu`,children:[]});",
    "let we=(0,XH.jsx)(_o,{open:c,onOpenChange:ue,onCloseAutoFocus:ne,side:`top`,align:s===`hero`?`center`:`start`,disabled:i,triggerButton:u??(s===`hero`?Ce():s===`home`?Se():ye()),contentWidth:`workspace`,contentMaxHeight:`tall`,children:null});",
  ].join(""));

  assert.match(transformed, /function CPXPST\(e,t\)\{return CPXP\.trigger\(e,t,YH\)\}/);
  assert.match(transformed, /CPXOH=CPXP\.setOpenHandler\(s,\(\)=>\{ue\(!0\);return!0\}\)/);
  assert.equal(transformed.match(/_o,\{open:le,onOpenChange:ue/g)?.length, 2);
  assert.doesNotMatch(transformed, /_o,\{open:c,onOpenChange:ue/);
});

test("81905 project selectors bind React and the controlled project-picker open state", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.81905-4598");
  const transform = findTransform(patchSet, "local-active-workspace-root-dropdown");
  const transformed = transform([
    "var ha,ga,Q,_a,va,$,ya=e((()=>{",
    "Q=Ye(),_a=`icon-xs shrink-0 opacity-75 group-focus:opacity-100 group-hover:opacity-100`,va=(0,ga.memo)(function(e){let t=(0,ha.c)(177),",
    "triggerButton:C===`summary-panel`?Ot:(0,Q.jsx)(U,{tooltipContent:(0,Q.jsx)(S,{...$.localRemoteWhereRun}),children:Ot}),children:",
  ].join(""));

  assert.match(transformed, /CPXPST=\(e,t\)=>CPXP\.trigger\(e,t,ga\)/);
  assert.doesNotMatch(transformed, /CPXP\.trigger\(e,t,Q\)/);

  const homeTransform = findTransform(patchSet, "home-project-dropdown");
  const home = homeTransform([
    "function Fn(e){let t=(0,In.c)(44),",
    "let e=b.trim().toLowerCase();C=r.filter(t=>{if(!e)return!0;let n=t.repositoryData?.rootFolder??``;return[t.label,n,t.path??``,t.hostDisplayName??``].some(t=>t.toLowerCase().includes(e))});",
    "O=(0,Z.jsx)(et,{value:b,onChange:s,placeholder:c,className:`mb-1`})",
    "(0,Z.jsx)(`span`,{className:`truncate`,children:e.label})",
    "function tr({activeProjectIdOverride:e,allowLocalProjects:t=!0,allowLocalProjectActions:n=t,allowRemoteProjects:i=!0,disabled:a=!1,hideLabel:o=!1,onWorkspaceRootSelected:s,variant:c=`default`,isOpen:l,onOpenChange:p,triggerButton:_}){",
    "Ne=l??x,Fe=e=>{e&&T(!1),C(e),p?.(e)},z=n&&c===`home`&&N.length===0&&!F;",
    "if(z)return(0,$.jsxs)(he,{open:l,onOpenChange:Fe,onCloseAutoFocus:I,side:`top`,triggerButton:_??Je(),contentWidth:`menu`,children:[]});",
    "let Xe=(0,$.jsx)(he,{open:l,onOpenChange:Fe,onCloseAutoFocus:I,side:`top`,align:c===`hero`?`center`:`start`,disabled:a,triggerButton:_??(c===`hero`?Ye():c===`home`?Je():We()),contentWidth:`workspace`,contentMaxHeight:`tall`,children:null});",
  ].join(""));

  assert.match(home, /function CPXPST\(e,t\)\{return CPXP\.trigger\(e,t,rr\)\}/);
  assert.match(home, /CPXOH=CPXP\.setOpenHandler\(c,\(\)=>\{Fe\(!0\);return!0\}\)/);
  assert.equal(home.match(/he,\{open:Ne,onOpenChange:Fe/g)?.length, 2);
  assert.doesNotMatch(home, /he,\{open:l,onOpenChange:Fe/);
  assert.match(home, /triggerButton:CPXPST\(_\?\?Je\(\),c\),contentWidth:`menu`/);
  assert.match(home, /triggerButton:CPXPST\(_\?\?\(c===`hero`\?Ye\(\):c===`home`\?Je\(\):We\(\)\),c\),contentWidth:`workspace`/);
});

test("41415 local remote dropdown wraps the visible selector trigger", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.41415-4505");
  const transform = findTransform(patchSet, "local-active-workspace-root-dropdown");
  const fakeDropdownBundle = [
    "function sa(e){let t=(0,ha.c)(64),",
    "let ue;t[44]!==r||t[45]!==n||t[46]!==v||t[47]!==O||t[48]!==A||t[49]!==oe||t[50]!==F||t[51]!==d||t[52]!==se||t[53]!==s||t[54]!==i||t[55]!==f||t[56]!==m||t[57]!==h||t[58]!==z||t[59]!==g?(ue=se?(0,Q.jsx)(ze,{open:n,onOpenChange:r,side:i,triggerButton:g===`summary-panel`?z:(0,Q.jsx)(it,{tooltipContent:m,tooltipMaxWidth:h,children:z}),children:(0,Q.jsxs)(`div`,{className:on(`flex flex-col`),children:[]})}):null,t[44]=r,t[45]=n,t[46]=v,t[47]=O,t[48]=A,t[49]=oe,t[50]=F,t[51]=d,t[52]=se,t[53]=s,t[54]=i,t[55]=f,t[56]=m,t[57]=h,t[58]=z,t[59]=g,t[60]=ue):ue=t[60];",
  ].join("");

  const transformed = transform(fakeDropdownBundle);

  assert.match(transformed, /CPXP=window\.CodexPlusHost\.adapters\.projectSelector/);
  assert.match(transformed, /function CPXPST\(e,t\)\{return CPXP\.trigger\(e,t,ga\)\}/);
  assert.match(transformed, /triggerButton:CPXPST\(g===`summary-panel`\?z:\(0,Q\.jsx\)\(it,\{tooltipContent:m,tooltipMaxWidth:h,children:z\}\),g\)/);
  assert.equal(transformed.match(/data-codex-plus-project-selector-trigger/g), null);
});

test("current home project dropdown marks the visible selector trigger", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.41415-4505");
  const transform = findTransform(patchSet, "home-project-dropdown");
  const fakeDropdownBundle = [
    "function St({activeProjectIdOverride:e,allowLocalProjects:t=!0,allowLocalProjectActions:n=t,allowRemoteProjects:r=!0,disabled:a=!1,hideLabel:o=!1,onWorkspaceRootSelected:s,variant:c=`default`,isOpen:l,onOpenChange:m,triggerButton:_}){",
    "let e=_.trim().toLowerCase();b=r.filter(t=>{if(!e)return!0;let n=t.repositoryData?.rootFolder??``;return[t.label,n,t.path??``,t.hostDisplayName??``].some(t=>t.toLowerCase().includes(e))});",
    "w=(0,X.jsx)(ie,{value:_,onChange:s,placeholder:c,className:`mb-1`})",
    "(0,X.jsx)(`span`,{className:`truncate`,children:e.label})",
    "children:(0,$.jsxs)(Ne,{size:`composerSm`,color:`ghost`,className:`min-w-0`,children:[KeChildren]})",
    "children:(0,$.jsx)(gt,{categoryLabel:(0,$.jsx)(R,{id:`composer.localCwdDropdown.footerCategory`,defaultMessage:`Project`}),className:W(b.homeProjectButton,`min-w-0 gap-2`)})",
    "Ze=()=>(0,$.jsxs)(`button`,{className:W(`heading-xl text-token-text-tertiary ml-2`,a?`cursor-default opacity-60`:`cursor-interaction`),type:`button`,disabled:a,children:[Ue]});",
    "Pe=l??S,U=e=>{e&&A(!1),C(e),m?.(e)},Re=n&&c===`home`",
    "if(Re)return(0,$.jsxs)(ce,{open:l,onOpenChange:U,onCloseAutoFocus:De,side:`top`,triggerButton:_??J(),contentWidth:`menu`,children:[I?null:null,Ge]});",
    "let $e=(0,$.jsx)(ce,{open:l,onOpenChange:U,onCloseAutoFocus:De,side:`top`,align:c===`hero`?`center`:`start`,disabled:a,triggerButton:_??(c===`hero`?Ze():c===`home`?J():Ke()),contentWidth:`workspace`,contentMaxHeight:`tall`,children:(0,$.jsx)(rt,{groups:M})});",
  ].join("");

  const transformed = transform(fakeDropdownBundle);

  assert.match(transformed, /CPXP=window\.CodexPlusHost\.adapters\.projectSelector/);
  assert.match(transformed, /function CPXPST\(e,t\)\{return CPXP\.trigger\(e,t,wt\)\}/);
  assert.match(transformed, /Ne,\{"data-codex-plus-project-selector-trigger":!0,"data-codex-plus-project-selector-variant":c,size:`composerSm`/);
  assert.match(transformed, /gt,\{"data-codex-plus-project-selector-trigger":!0,"data-codex-plus-project-selector-variant":c,categoryLabel:/);
  assert.match(transformed, /`button`,\{"data-codex-plus-project-selector-trigger":!0,"data-codex-plus-project-selector-variant":c,className:W\(`heading-xl/);
  assert.match(transformed, /triggerButton:CPXPST\(_\?\?J\(\),c\)/);
  assert.match(transformed, /triggerButton:CPXPST\(_\?\?\(c===`hero`\?Ze\(\):c===`home`\?J\(\):Ke\(\)\),c\)/);
});

test("41301 home project dropdown patches the live composer bundle", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.41301-5103");
  const transform = findTransform(patchSet, "home-project-dropdown");
  const selectorFiles = patchSet.patches
    .find((patch) => patch.id === "project-selector-shortcut")
    .fileTransforms
    .map(([file]) => file);
  const fakeDropdownBundle = [
    "function wVe(e){let t=(0,OZ.c)(44),",
    "let e=_.trim().toLowerCase();x=r.filter(t=>{if(!e)return!0;let n=t.repositoryData?.rootFolder??``;return[t.label,n,t.path??``,t.hostDisplayName??``].some(t=>t.toLowerCase().includes(e))});",
    "T=(0,AZ.jsx)(vie,{value:_,onChange:s,placeholder:c,className:`mb-1`})",
    "(0,AZ.jsx)(`span`,{className:`truncate`,children:e.label})",
    "function MZ({activeProjectIdOverride:e,allowLocalProjects:t=!0,allowLocalProjectActions:n=t,allowRemoteProjects:r=!0,disabled:i=!1,hideLabel:a=!1,onWorkspaceRootSelected:o,variant:s=`default`,isOpen:c,onOpenChange:l,triggerButton:u}){",
    "children:(0,PZ.jsx)(upe,{className:`min-w-0`,\"data-composer-navigation-target\":`workspace-project`,categoryLabel:null})",
    "pe=()=>(0,PZ.jsxs)(`button`,{className:wi(`heading-xl text-token-text-tertiary ml-2`),type:`button`,disabled:i,children:[]});",
    "if(s===`home`&&u==null)return(0,PZ.jsx)(Sb,{menuOpen:te,onOpenChange:ne,children:me});",
    "let he=(0,PZ.jsx)(yc,{open:c,onOpenChange:ne,onCloseAutoFocus:z,side:`top`,align:s===`hero`?`center`:`start`,disabled:i,triggerButton:u??(s===`hero`?pe():de()),contentWidth:`workspace`,contentMaxHeight:`tall`,children:me});",
  ].join("");

  const transformed = transform(fakeDropdownBundle);

  assert.deepEqual(selectorFiles.filter((file) => file.includes("page-hSvsQcNf.js")), [
    "webview/assets/app-initial~app-main~page-hSvsQcNf.js",
  ]);
  assert.equal(selectorFiles.some((file) => file.includes("quick-chat-window-page-BcSWfURC.js")), false);
  assert.match(transformed, /let CPXP=window\.CodexPlusHost\.adapters\.projectSelector/);
  assert.match(transformed, /function CPXPST\(e,t\)\{return CPXP\.trigger\(e,t,NZ\)\}/);
  assert.match(transformed, /x=CPXP\.fuzzyFilter\(r,_\)/);
  assert.match(transformed, /onKeyDown:e=>CPXP\.acceptFirst\(e,x,o,_\)/);
  assert.match(transformed, /children:CPXP\.fuzzyHighlight\(e\.label,_,AZ\.jsx\)/);
  assert.match(transformed, /CPXP\.setOpenHandler\(s,\(\)=>\{ne\(!0\);return!0\}\);if\(s===`home`&&u==null\)return/);
  assert.match(transformed, /upe,\{\"data-codex-plus-project-selector-trigger\":!0,\"data-codex-plus-project-selector-variant\":s,className:`min-w-0`/);
  assert.match(transformed, /`button`,\{\"data-codex-plus-project-selector-trigger\":!0,\"data-codex-plus-project-selector-variant\":s,className:wi/);
  assert.match(transformed, /triggerButton:CPXPST\(u\?\?\(s===`hero`\?pe\(\):de\(\)\),s\)/);
});

test("31428 project dropdown registers its native controlled open handler", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.31428-5059");
  const transform = findTransform(patchSet, "local-active-workspace-root-dropdown");
  const fakeDropdownBundle = [
    "function zr(e){let t=(0,Br.c)(44),",
    "let e=y.trim().toLowerCase();S=r.filter(t=>{if(!e)return!0;let n=t.repositoryData?.rootFolder??``;return[t.label,n,t.path??``,t.hostDisplayName??``].some(t=>t.toLowerCase().includes(e))});",
    "O=(0,Z.jsx)(je,{value:y,onChange:s,placeholder:c,className:`mb-1`})",
    "(0,Z.jsx)(`span`,{className:`truncate`,children:e.label})",
    "function si({activeProjectIdOverride:e,allowLocalProjects:t=!0,allowLocalProjectActions:n=t,allowRemoteProjects:r=!0,disabled:i=!1,hideLabel:a=!1,onWorkspaceRootSelected:o,variant:s=`default`,isOpen:c,onOpenChange:l,triggerButton:u}){",
    "L=c??g,R=e=>{b(e),l?.(e)},Ce=n&&s===`home`&&w.length===0&&!D;",
    "triggerButton:u,contentWidth:`menu`",
    "triggerButton:u??(s===`hero`?Pe():Me()),contentWidth:`workspace`",
  ].join("");

  const transformed = transform(fakeDropdownBundle);

  assert.match(transformed, /CPXP\.setOpenHandler\(s,\(\)=>\{R\(!0\);return!0\}\)/);
});

test("31428 separates the native path action slot from the virtual title subscription", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.31428-5059");
  const headerPatch = patchSet.patches.find((patch) => patch.id === "project-path-header");
  const titleTransform = headerPatch.fileTransforms.find(([, transform]) => transform.name === "patchThreadTitle")[1];

  assert.deepEqual(
    headerPatch.fileTransforms.map(([, transform]) => transform.name),
    ["patchHeader", "patchThreadTitle"],
  );
  const transformed = titleTransform([
    "function xl(e){let t=(0,wl.c)(51),{conversationId:n,hostIdOverride:r,",
    "projectName:f,title:p,titleSuffix:m,cwd:h,canPin:g,hideForkActions:_}=e,v=l===void 0?!1:l,",
  ].join(""));
  assert.match(transformed, /function CPXThreadHeaderTitle\(e\)/);
  assert.match(transformed, /t\(rt\(\),1\)\.useSyncExternalStore/);
  assert.match(transformed, /p=CPXThreadHeaderTitle\(CPX_nativeTitle\)/);
  assert.doesNotMatch(transformed, /CPXThreadHeaderAccessories/);
});

test("141536 project dropdown registers its native controlled open handler", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.141536-4753");
  const transform = findTransform(patchSet, "local-active-workspace-root-dropdown");
  const fakeDropdownBundle = [
    "function Ze(e){let t=(0,Qe.c)(44),",
    "let e=v.trim().toLowerCase();x=r.filter(t=>{if(!e)return!0;let n=t.repositoryData?.rootFolder??``;return[t.label,n,t.path??``,t.hostDisplayName??``].some(t=>t.toLowerCase().includes(e))});",
    "T=(0,X.jsx)(ne,{value:v,onChange:s,placeholder:c,className:`mb-1`})",
    "(0,X.jsx)(`span`,{className:`truncate`,children:e.label})",
    "function gt({activeProjectIdOverride:e,allowLocalProjects:t=!0,allowLocalProjectActions:n=t,allowRemoteProjects:i=!0,disabled:o=!1,hideLabel:l=!1,onWorkspaceRootSelected:u,variant:d=`default`,isOpen:h,onOpenChange:_,triggerButton:v}){",
    "Ie=h??S,Le=e=>{e&&E(!1),w(e),_?.(e)},Re=n&&d===`home`",
    "if(Re)return(0,$.jsxs)(re,{open:h,onOpenChange:Le,onCloseAutoFocus:ke,side:`top`,triggerButton:v??Qe(),contentWidth:`menu`",
    "let X=(0,$.jsx)(re,{open:h,onOpenChange:Le,onCloseAutoFocus:ke,side:`top`,align:d===`hero`?`center`:`start`,disabled:o,triggerButton:v??(d===`hero`?$e():d===`home`?Qe():J()),contentWidth:`workspace`",
  ].join("");

  const transformed = transform(fakeDropdownBundle);

  assert.match(transformed, /function CPXPST\(e,t\)\{return CPXP\.trigger\(e,t,vt\)\}/);
  assert.match(transformed, /CPXOH=CPXP\.setOpenHandler\(d,\(\)=>\{Le\(!0\);return!0\}\)/);
  assert.equal(transformed.match(/open:Ie/g)?.length, 2);
  assert.doesNotMatch(transformed, /\{open:h,onOpenChange:Le/);
});

test("141536 binds native context and title while prepending the path accessory to the end-action slot", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.141536-4753");
  const transforms = collectFileTransforms(patchSet);
  assert.equal(transforms.some(([, transform]) => transform.name === "patchHeader"), false);
  const contextTransform = transforms
    .find(([file, transform]) => file === "webview/assets/local-conversation-page-DF8JCE4B.js" &&
      transform.name === "patchLocalConversationPageHeader")?.[1];
  assert.equal(typeof contextTransform, "function");
  const contextSource = contextTransform([
    "import{n as e,s as t}from\"./rolldown-runtime.js\";import{El as r}from\"./app.js\";",
    "function pi(e){let t=(0,W.c)(32),",
    "{conversationId:n,getConversationMarkdown:r,markdownParentConversationId:a,projectIcon:o,projectHoverCardContent:s,projectName:c,title:l,titleSuffix:u,cwd:p,canPin:m,hideForkActions:h}=e,v=m===void 0?!0:m,",
  ].join(""));
  assert.match(contextSource, /CPXBindThreadHeaderContext\(\{cwd:p,hostId:_\(yt,n\),header:\{surface:`local-conversation`/);
  assert.match(contextSource, /title:CPX_nativeTitle/);
  assert.match(contextSource, /l=CPXThreadHeaderTitle\(CPX_nativeTitle\)/);
  assert.doesNotMatch(contextSource, /data-codex-plus-project-path-header|CPXThreadHeaderAccessories/);
  const actionShellTransform = transforms
    .find(([file, transform]) => file === "webview/assets/app-initial~app-main~onboarding-page-CNHnOMz8.js" &&
      transform.name === "patchThreadHeaderActionShell")?.[1];
  assert.equal(typeof actionShellTransform, "function");
  const actionShell = actionShellTransform([
    "function zyt({isHeaderEdgeScroll:e,isApplicationMenuBarEnabled:t}){",
    "h=u.filter(({align:e})=>e===`start`),g=u.filter(({align:e})=>e===`center`),_=u.filter(({align:e})=>e===`end`),v=h.length>0,",
  ].join(""));
  assert.match(actionShell, /function CPXHA\(u,e\)/);
  assert.match(actionShell, /_=\(\(e,t\)=>t==null\?e:\[\{actionId:`codex-plus-project-path`,align:`end`,node:t\},\.\.\.e\]\)\(u\.filter/);
  assert.match(actionShell, /u\(h\.subscribe,h\.snapshot,h\.snapshot\)/);
  assert.match(actionShell, /CPXHA\(aV\.useSyncExternalStore,\{jsx:oV\.jsx,jsxs:oV\.jsxs\}\)\)/);
  assert.equal(actionShell.match(/_=/g)?.length, 1);
});

test("31921 project dropdown marks the visible selector trigger", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.31921-4452");
  const transform = findTransform(patchSet, "local-active-workspace-root-dropdown");
  const fakeDropdownBundle = [
    "var et,tt,nt=e((()=>{et=L(),Je(),_e(),tt=o()}));function rt(e){let t=(0,it.c)(44),",
    "let e=_.trim().toLowerCase();b=r.filter(t=>{if(!e)return!0;let n=t.repositoryData?.rootFolder??``;return[t.label,n,t.path??``,t.hostDisplayName??``].some(t=>t.toLowerCase().includes(e))});",
    "T=(0,X.jsx)(fe,{value:_,onChange:s,placeholder:c,className:`mb-1`})",
    "(0,X.jsx)(`span`,{className:`truncate`,children:e.label})",
    "function St({activeProjectIdOverride:e,allowLocalProjects:t=!0,allowLocalProjectActions:n=t,allowRemoteProjects:r=!0,disabled:i=!1,hideLabel:o=!1,onWorkspaceRootSelected:s,variant:c=`default`,isOpen:l,onOpenChange:p,triggerButton:h}){",
    "children:(0,$.jsx)(gt,{categoryLabel:(0,$.jsx)(z,{id:`composer.localCwdDropdown.footerCategory`,defaultMessage:`Project`}),className:a(K.homeProjectButton,`min-w-0 gap-2`)})",
    "Ze=()=>(0,$.jsxs)(`button`,{className:a(`heading-xl text-token-text-tertiary ml-2`,i?`cursor-default opacity-60`:`cursor-interaction`),type:`button`,disabled:i,children:[We]});",
    "Ie=l??x,Re=e=>{e&&O(!1),T(e),p?.(e)},Be=n&&c===`home`&&P.length===0&&!F;",
    "if(Be)return(0,$.jsxs)(m,{open:l,onOpenChange:Re,onCloseAutoFocus:Ne,side:`top`,triggerButton:h??J(),contentWidth:`menu`,children:[Ce?null:null,qe]});",
    "let $e=(0,$.jsx)(m,{open:l,onOpenChange:Re,onCloseAutoFocus:Ne,side:`top`,align:c===`hero`?`center`:`start`,disabled:i,triggerButton:h??(c===`hero`?Ze():c===`home`?J():Je()),contentWidth:`workspace`,contentMaxHeight:`tall`,children:(0,$.jsx)(rt,{groups:P})});",
    "var wt,$,Tt=e((()=>{Se(),F(),r(),ge(),wt=t(b(),1),",
  ].join("");

  const transformed = transform(fakeDropdownBundle);

  assert.match(transformed, /CPXP=window\.CodexPlusHost\.adapters\.projectSelector/);
  assert.match(transformed, /function CPXPST\(e,t\)\{return CPXP\.trigger\(e,t,wt\)\}/);
  assert.match(transformed, /gt,\{"data-codex-plus-project-selector-trigger":!0,"data-codex-plus-project-selector-variant":c,categoryLabel:/);
  assert.match(transformed, /`button`,\{"data-codex-plus-project-selector-trigger":!0,"data-codex-plus-project-selector-variant":c,className:a\(`heading-xl/);
  assert.match(transformed, /CPXOH=CPXP\.setOpenHandler\(c,\(\)=>\{Re\(!0\);return!0\}\)/);
  assert.match(transformed, /if\(Be\)return\(0,\$\.jsxs\)\(m,\{open:Ie/);
  assert.match(transformed, /let \$e=\(0,\$\.jsx\)\(m,\{open:Ie/);
  assert.match(transformed, /triggerButton:CPXPST\(h\?\?J\(\),c\)/);
  assert.match(transformed, /triggerButton:CPXPST\(h\?\?\(c===`hero`\?Ze\(\):c===`home`\?J\(\):Je\(\)\),c\)/);
  assert.doesNotMatch(transformed, /t\[\d+\].*data-codex-plus-project-selector-trigger/);
});

test("current home project dropdown delegates search and highlight to Codex Plus", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.41415-4505");
  const transform = findTransform(patchSet, "home-project-dropdown");
  const fakeDropdownBundle = [
    "function St({activeProjectIdOverride:e,allowLocalProjects:t=!0,allowLocalProjectActions:n=t,allowRemoteProjects:r=!0,disabled:a=!1,hideLabel:o=!1,onWorkspaceRootSelected:s,variant:c=`default`,isOpen:l,onOpenChange:m,triggerButton:_}){",
    "let e=_.trim().toLowerCase();b=r.filter(t=>{if(!e)return!0;let n=t.repositoryData?.rootFolder??``;return[t.label,n,t.path??``,t.hostDisplayName??``].some(t=>t.toLowerCase().includes(e))});",
    "w=(0,X.jsx)(ie,{value:_,onChange:s,placeholder:c,className:`mb-1`})",
    "(0,X.jsx)(`span`,{className:`truncate`,children:e.label})",
    "children:(0,$.jsxs)(Ne,{size:`composerSm`,color:`ghost`,className:`min-w-0`,children:[KeChildren]})",
    "children:(0,$.jsx)(gt,{categoryLabel:(0,$.jsx)(R,{id:`composer.localCwdDropdown.footerCategory`,defaultMessage:`Project`}),className:W(b.homeProjectButton,`min-w-0 gap-2`)})",
    "Ze=()=>(0,$.jsxs)(`button`,{className:W(`heading-xl text-token-text-tertiary ml-2`,a?`cursor-default opacity-60`:`cursor-interaction`),type:`button`,disabled:a,children:[Ue]});",
    "Pe=l??S,U=e=>{e&&A(!1),C(e),m?.(e)},Re=n&&c===`home`",
    "if(Re)return(0,$.jsxs)(ce,{open:l,onOpenChange:U,onCloseAutoFocus:De,side:`top`,triggerButton:_??J(),contentWidth:`menu`,children:[I?null:null,Ge]});",
    "let $e=(0,$.jsx)(ce,{open:l,onOpenChange:U,onCloseAutoFocus:De,side:`top`,align:c===`hero`?`center`:`start`,disabled:a,triggerButton:_??(c===`hero`?Ze():c===`home`?J():Ke()),contentWidth:`workspace`,contentMaxHeight:`tall`,children:(0,$.jsx)(rt,{groups:M})});",
  ].join("");

  const transformed = transform(fakeDropdownBundle);

  assert.match(transformed, /let CPXP=window\.CodexPlusHost\.adapters\.projectSelector/);
  assert.match(transformed, /b=CPXP\.fuzzyFilter\(r,_\)/);
  assert.match(transformed, /onKeyDown:e=>CPXP\.acceptFirst\(e,b,o,_\)/);
  assert.match(transformed, /children:CPXP\.fuzzyHighlight\(e\.label,_,X\.jsx\)/);
  assert.doesNotMatch(transformed, /toLowerCase\(\)\.includes\(e\)/);
});

test("61825 home project dropdown delegates search and highlight to Codex Plus", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.61825-4548");
  const transform = findTransform(patchSet, "home-project-dropdown");
  const fakeDropdownBundle = [
    "function FH(e){let t=(0,IH.c)(44),{children:n,groups:r,projectAppearances:i,selectedProjectIds:a,onSelectProjectId:o,keepOpenOnSelect:s,projectlessActionLabel:c,onSelectProjectless:l,footerItems:u,onAddLocalProject:d,onAddRemoteProject:f,emptyMessage:p}=e,m=s===void 0?!1:s,h=Wh(),g=l!=null&&c!=null,[_,v]=(0,LH.useState)(``),y,b,x,S,C,w;if(t[0]!==g||t[1]!==u||t[2]!==r||t[3]!==h||t[4]!==m||t[5]!==d||t[6]!==f||t[7]!==o||t[8]!==i||t[9]!==_||t[10]!==a){let e=_.trim().toLowerCase();b=r.filter(t=>{if(!e)return!0;let n=t.repositoryData?.rootFolder??``;return[t.label,n,t.path??``,t.hostDisplayName??``].some(t=>t.toLowerCase().includes(e))});let n=new Map;r.forEach(e=>{if(e.path==null)return;let t=n.get(e.label);if(t==null){n.set(e.label,[e.path]);return}t.push(e.path)}),x=g||u!=null||d!=null||f!=null;let s;t[17]===Symbol.for(`react.memo_cache_sentinel`)?(s=e=>{v(e.target.value)},t[17]=s):s=t[17];let c;t[18]===h?c=t[19]:(c=h.formatMessage({id:`composer.localCwdDropdown.searchPlaceholder`,defaultMessage:`Search projects`,description:`Placeholder for searching the workspace root dropdown`}),t[18]=h,t[19]=c),t[20]!==_||t[21]!==c?(w=(0,RH.jsx)(oc,{value:_,onChange:s,placeholder:c,className:`mb-1`}),t[20]=_,t[21]=c,t[22]=w):w=t[22],y=pc.Section,S=`flex max-h-[calc((1lh+var(--padding-row-y)*2)*5)] flex-col overflow-y-auto text-sm [--edge-fade-distance:1.5rem]`,C=b.map(e=>{let t=i[e.projectId]??null,r=(0,RH.jsx)(jH,{className:`icon-xs`,isRemoteProject:e.projectKind===`remote`}),s=e.repositoryData?.rootFolder,c=s!=null&&s!==e.label,l=n.get(e.label)??[],u=l.length>1&&e.path!=null?ae(e.path,l):null;return(0,RH.jsx)(`div`,{className:`flex flex-col`,children:(0,RH.jsxs)(Do,{RightIcon:a.includes(e.projectId)?sc:void 0,tooltipText:u??void 0,tooltipAlign:`center`,onSelect:t=>{m&&t.preventDefault(),o(e.projectId)},children:[(0,RH.jsx)(pc.ItemIcon,{size:`xs`,children:t==null?r:(0,RH.jsx)(Ko,{appearance:t,className:`size-4`,fallbackIcon:r})}),(0,RH.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,RH.jsx)(`span`,{className:`truncate`,children:e.label}),e.hostDisplayName==null?null:(0,RH.jsx)(`span`,{className:`truncate text-sm text-token-description-foreground`,children:e.hostDisplayName}),c?(0,RH.jsx)(`span`,{className:`truncate text-sm text-token-description-foreground`,children:s}):null]})]})},e.projectId)}),t[0]=g,t[1]=u,t[2]=r,t[3]=h,t[4]=m,t[5]=d,t[6]=f,t[7]=o,t[8]=i,t[9]=_,t[10]=a,t[11]=y,t[12]=b,t[13]=x,t[14]=S,t[15]=C,t[16]=w}else y=t[11],b=t[12],x=t[13],S=t[14],C=t[15],w=t[16];return null}",
    "function qH({activeProjectIdOverride:e,allowLocalProjects:t=!0,allowLocalProjectActions:n=t,allowRemoteProjects:r=!0,disabled:i=!1,hideLabel:a=!1,onWorkspaceRootSelected:o,variant:s=`default`,isOpen:c,onOpenChange:l,triggerButton:u}){",
    "children:(0,XH.jsxs)(Ji,{size:`composerSm`,color:`ghost`,className:`min-w-0`,children:[me]})",
    "children:(0,XH.jsx)(gv,{categoryLabel:(0,XH.jsx)(Y,{id:`composer.localCwdDropdown.footerCategory`,defaultMessage:`Project`}),className:Qo(b.homeProjectButton,`min-w-0 gap-2`)})",
    "Ce=()=>(0,XH.jsxs)(`button`,{className:Qo(`heading-xl text-token-text-tertiary ml-2`,i?`cursor-default opacity-60`:`cursor-interaction`),type:`button`,disabled:i,children:[de]});",
    "le=c??p,ue=e=>{e&&g(!1),m(e),l?.(e)},de=n&&s===`home`",
    "if(de)return(0,XH.jsxs)(_o,{open:c,onOpenChange:ue,onCloseAutoFocus:ne,side:`top`,triggerButton:u??Se(),contentWidth:`menu`,children:[w?null:null,ve]});",
    "let we=(0,XH.jsx)(_o,{open:c,onOpenChange:ue,onCloseAutoFocus:ne,side:`top`,align:s===`hero`?`center`:`start`,disabled:i,triggerButton:u??(s===`hero`?Ce():s===`home`?Se():ye()),contentWidth:`workspace`,contentMaxHeight:`tall`,children:(0,XH.jsx)(FH,{groups:S})});",
  ].join("");

  const transformed = transform(fakeDropdownBundle);

  assert.match(transformed, /let CPXP=window\.CodexPlusHost\.adapters\.projectSelector/);
  assert.match(transformed, /b=CPXP\.fuzzyFilter\(r,_\)/);
  assert.match(transformed, /onKeyDown:e=>CPXP\.acceptFirst\(e,b,o,_\)/);
  assert.match(transformed, /children:CPXP\.fuzzyHighlight\(e\.label,_,RH\.jsx\)/);
  assert.doesNotMatch(transformed, /toLowerCase\(\)\.includes\(e\)/);
});

test("project selector Enter key adapter accepts only the first searched match", () => {
  const fakeDropdownBundle = [
    "Ne=r();function Pe(e){let t=(0,Ne.c)(42),{groups:n,selectedProjectIds:r,onSelectProjectId:i,keepOpenOnSelect:a,projectlessActionLabel:o,onSelectProjectless:s,footerItems:c,onAddLocalProject:l,onAddRemoteProject:u,emptyMessage:te}=e,ne=a===void 0?!1:a,p=ee(),m=s!=null&&o!=null,[h,re]=(0,Me.useState)(``),_,v,y,b,x,S;if(t[0]!==m||t[1]!==c||t[2]!==n||t[3]!==p||t[4]!==ne||t[5]!==l||t[6]!==u||t[7]!==i||t[8]!==h||t[9]!==r){let e=h.trim().toLowerCase();v=n.filter(t=>{if(!e)return!0;let n=t.repositoryData?.rootFolder??``;return[t.label,n,t.path??``,t.hostDisplayName??``].some(t=>t.toLowerCase().includes(e))});let a=new Map;n.forEach(e=>{if(e.path==null)return;let t=a.get(e.label);if(t==null){a.set(e.label,[e.path]);return}t.push(e.path)}),y=m||c!=null||l!=null||u!=null;let o;t[16]===Symbol.for(`react.memo_cache_sentinel`)?(o=e=>{re(e.target.value)},t[16]=o):o=t[16];let s;t[17]===p?s=t[18]:(s=p.formatMessage({id:`composer.localCwdDropdown.searchPlaceholder`,defaultMessage:`Search projects`,description:`Placeholder for searching the workspace root dropdown`}),t[17]=p,t[18]=s),t[19]!==h||t[20]!==s?(S=(0,H.jsx)(ve,{value:h,onChange:o,placeholder:s,className:`mb-1`}),t[19]=h,t[20]=s,t[21]=S):S=t[21],_=I.Section,b=`flex max-h-[calc((1lh+var(--padding-row-y)*2)*5)] flex-col overflow-y-auto text-sm [--edge-fade-distance:1.5rem]`,x=v.map(e=>{let t=e.repositoryData?.rootFolder,n=t&&t!==e.label,o=!!e.isCodexWorktree,s=a.get(e.label)??[],c=s.length>1&&e.path!=null?g(e.path,s):null;return(0,H.jsx)(`div`,{className:`flex flex-col`,children:(0,H.jsxs)(F,{RightIcon:r.includes(e.projectId)?f:void 0,tooltipText:c??void 0,tooltipAlign:`center`,onSelect:t=>{ne&&t.preventDefault(),i(e.projectId)},children:[(0,H.jsx)(I.ItemIcon,{size:`xs`,children:(0,H.jsx)(we,{className:`icon-xs`,isCodexWorktree:o,isGitRepository:e.repositoryData!=null,isRemoteProject:e.projectKind===`remote`})}),(0,H.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,H.jsx)(`span`,{className:`truncate`,children:e.label}),e.hostDisplayName==null?null:(0,H.jsx)(`span`,{className:`truncate text-sm text-token-description-foreground`,children:e.hostDisplayName}),n?(0,H.jsx)(`span`,{className:`truncate text-sm text-token-description-foreground`,children:t}):null]})]})},e.projectId)}),t[0]=m,t[1]=c,t[2]=n,t[3]=p,t[4]=ne,t[5]=l,t[6]=u,t[7]=i,t[8]=h,t[9]=r,t[10]=_,t[11]=v,t[12]=y,t[13]=b,t[14]=x,t[15]=S}else _=t[10],v=t[11],y=t[12],b=t[13],x=t[14],S=t[15];return null}",
    "function Ie(e){let t=(0,Ne.c)(81),{variant:ee,isOpen:f,onOpenChange:g,triggerButton:E}=e,",
    "t[66]!==M||t[67]!==je||t[68]!==Z||t[69]!==rt||t[70]!==Q||t[71]!==it?($=(0,H.jsx)(Pe,{groups:M,selectedProjectIds:Z,onSelectProjectId:je,projectlessActionLabel:nt,onSelectProjectless:rt,footerItems:Q,onAddRemoteProject:it}),t[66]=M,t[67]=je,t[68]=Z,t[69]=rt,t[70]=Q,t[71]=it,t[72]=$):$=t[72];let at;return t[73]!==O||t[74]!==f||t[75]!==g||t[76]!==Y||t[77]!==tt||t[78]!==X||t[79]!==$?(at=(0,H.jsx)(ye,{open:f,onOpenChange:g,onCloseAutoFocus:Y,align:tt,disabled:O,triggerButton:X,contentWidth:`workspace`,contentMaxHeight:`tall`,children:$}),t[73]=O,t[74]=f,t[75]=g,t[76]=Y,t[77]=tt,t[78]=X,t[79]=$,t[80]=at):at=t[80],at}",
  ].join("");
  const transform = findTransform(codexPatchSets[0], "local-active-workspace-root-dropdown");

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

  const cloned = adapter.trigger(
    { type: "button", props: { "aria-label": "Projects" } },
    "home",
    {
      cloneElement(element, props) {
        return { ...element, props };
      },
    },
  );

  assert.equal(cloned.props["aria-label"], "Projects");
  assert.equal(cloned.props["data-codex-plus-project-selector-trigger"], true);
  assert.equal(cloned.props["data-codex-plus-project-selector-variant"], "home");
});

test("current ChatGPT project selector exposes its controlled open handler", () => {
  const { patchHomeProjectDropdownProjectSelectorShortcut } = require("../src/patches/lib/project-selector-shortcut-patch");
  const source = [
    "function XY(e){let t=(0,ZY.c)(44),",
    "let e=_.trim().toLowerCase();b=r.filter(t=>{if(!e)return!0;let n=t.repositoryData?.rootFolder??``;return[t.label,n,t.path??``,t.hostDisplayName??``].some(t=>t.toLowerCase().includes(e))});",
    "w=(0,$Y.jsx)(mee,{value:_,onChange:s,placeholder:c,className:`mb-1`})",
    "(0,$Y.jsx)(`span`,{className:`truncate`,children:e.label})",
    "function rX({activeProjectIdOverride:e,",
    "W=c??p,te=e=>{m(e),l?.(e)},ne=n&&s===`home`",
    "triggerButton:u??(s===`hero`?pe():de()),contentWidth:`workspace`,contentMaxHeight:`tall`,children:me})",
  ].join("");

  const transformed = patchHomeProjectDropdownProjectSelectorShortcut(source);

  assert.match(transformed, /function CPXPST\(e,t\)\{return CPXP\.trigger\(e,t,aX\)\}/);
  assert.doesNotMatch(transformed, /CPXP\.trigger\(e,t,oX\)/);
  assert.match(transformed, /CPXP\.setOpenHandler\(s,\(\)=>\{te\(!0\);return!0\}\)/);
  assert.match(transformed, /triggerButton:CPXPST\(u\?\?\(s===`hero`\?pe\(\):de\(\)\),s\)/);
  assert.match(transformed, /CPXP\.fuzzyFilter\(r,_\)/);
});

test("91948 project selector binds its moved app-main producer", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.91948-5440");
  const transform = collectFileTransforms(patchSet)
    .find(([, candidate]) => candidate.name === "patchHomeProjectDropdownProjectSelectorShortcut")?.[1];
  assert.equal(typeof transform, "function");
  const transformed = transform([
    "function JJ(e){let t=(0,YJ.c)(44),",
    "let e=_.trim().toLowerCase();b=r.filter(t=>{if(!e)return!0;let n=t.repositoryData?.rootFolder??``;return[t.label,n,t.path??``,t.hostDisplayName??``].some(t=>t.toLowerCase().includes(e))});",
    "w=(0,ZJ.jsx)(Re,{value:_,onChange:s,placeholder:c,className:`mb-1`})",
    "(0,ZJ.jsx)(`span`,{className:`truncate`,children:e.label})",
    "function tY({activeProjectIdOverride:e,allowLocalProjects:t=!0,",
    "te=c??p,ne=e=>{m(e),l?.(e)},re=n&&s===`home`",
    "(0,iY.jsx)(_e,{open:c,onOpenChange:ne,onCloseAutoFocus:z,side:`top`,triggerButton:u,contentWidth:`menu`,",
    "let ge=(0,iY.jsx)(_e,{open:c,onOpenChange:ne,onCloseAutoFocus:z,side:`top`,align:s===`hero`?`center`:`start`,disabled:i,triggerButton:u??(s===`hero`?pe():de()),contentWidth:`workspace`,",
  ].join(""));
  assert.match(transformed, /CPXP\.setOpenHandler\(s/);
  assert.match(transformed, /CPXP\.fuzzyFilter\(r,_\)/);
  assert.match(transformed, /CPXP\.acceptFirst\(e,b,o,_\)/);
  assert.match(transformed, /CPXP\.fuzzyHighlight\(e\.label,_,ZJ\.jsx\)/);
  assert.match(transformed, /open:te/);
  assert.match(transformed, /triggerButton:CPXPST/);
});

test("run command patch bridges the native project selector shortcut to the runtime command", () => {
  const fakeMapRunCommandBundle = [
    "import{f as e}from\"./vscode-api-Cc4BqLmp.js\";",
    "var i=new Map([[`newThread`,()=>{}],[`openFolder`,()=>{r()}],[`toggleSidebar`,()=>{}]]),a=new Map;",
  ].join("");
  const fakeRegisterRunCommandBundle = [
    "function kP(){let e=(0,AP.c)(4),t=R(S),n;e[0]===t?n=e[1]:(n=()=>{ia(t,!t.get(pa))},e[0]=t,e[1]=n);let r=n;tc(`toggleSidebar`,r);let i;e[2]===t?i=e[3]:(i=[t],e[2]=t,e[3]=i),Cn(`toggle-sidebar`,r,i)}",
  ].join("");
  const fakeCurrentRegisterRunCommandBundle = [
    "function jM(){let e=(0,MM.c)(4),t=J(W),n;e[0]===t?n=e[1]:(n=()=>{Ree(t,!t.get(to))},e[0]=t,e[1]=n);let r=n;uy(`toggleSidebar`,r);let i;e[2]===t?i=e[3]:(i=[t],e[2]=t,e[3]=i),Vt(`toggle-sidebar`,r,i)}",
  ].join("");
  const fakeHotkeyRunCommandBundle = [
    "new Map([[`newThread`,J0t],[`quickChat`,Q0t],[`openSkills`,s2t],[`openFolder`,c2t],[`toggleSidebar`,l2t],[`toggleBottomPanel`,u2t]])",
  ].join("");

  for (const patchSet of codexPatchSets) {
    const transform = findTransform(patchSet, "run-command");

    assert.equal(typeof transform, "function", `${patchSet.id} has run command transform`);

    const transformed = transform(fakeMapRunCommandBundle);

    assert.match(transformed, /\[`codexPlus\.focusProjectSelector`,`codexPlusToggleSidebarNameBlur`\]\.map\(e=>\[e,\(\)=>window\.CodexPlusHost\.adapters\.commands\.dispatch\(e\)\]\)/);
    assert.match(transformed, /\.\.\.\(window\.CodexPlus\.commands\.all\(\)\)\.map\(e=>\[e\.id,\(\)=>window\.CodexPlusHost\.adapters\.commands\.dispatch\(e\.id\)\]\)/);
    assert.match(transformed, /commands\.all[\s\S]*\[`toggleSidebar`/);

    const latestTransformed = transform(fakeRegisterRunCommandBundle);
    assert.match(latestTransformed, /for\(let e of \[`codexPlus\.focusProjectSelector`,`codexPlusToggleSidebarNameBlur`\]\)tc\(e,\(\)=>window\.CodexPlusHost\.adapters\.commands\.dispatch\(e\)\)/);
    assert.match(latestTransformed, /for\(let e of window\.CodexPlus\.commands\.all\(\)\)tc\(e\.id,\(\)=>window\.CodexPlusHost\.adapters\.commands\.dispatch\(e\.id\)\)/);

    const currentTransformed = transform(fakeCurrentRegisterRunCommandBundle);
    assert.match(currentTransformed, /for\(let e of \[`codexPlus\.focusProjectSelector`,`codexPlusToggleSidebarNameBlur`\]\)uy\(e,\(\)=>window\.CodexPlusHost\.adapters\.commands\.dispatch\(e\)\)/);
    assert.match(currentTransformed, /for\(let e of window\.CodexPlus\.commands\.all\(\)\)uy\(e\.id,\(\)=>window\.CodexPlusHost\.adapters\.commands\.dispatch\(e\.id\)\)/);

    const hotkeyTransformed = transform(fakeHotkeyRunCommandBundle);
    assert.match(hotkeyTransformed, /\[`openFolder`,c2t\],\.\.\.\[`codexPlus\.focusProjectSelector`,`codexPlusToggleSidebarNameBlur`\]\.map/);
    assert.match(hotkeyTransformed, /commands\.all[\s\S]*\[`toggleSidebar`,l2t\]/);
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
  assert.match(transformed, /_=V0\(o\),CPXAboutLines=CPXAbout\.buildInfoLines,v=\[h,\.\.\._,``,\.\.\.CPXAboutLines\]\.join/);
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
  for (const patchSet of codexPatchSets) {
    const transformed = transformFile(patchSet, "webview/index.html", "<title>Codex</title>");
    assert.match(transformed, /<title>Codex Plus<\/title>/);
    assert.match(transformed, /<script src="\.\/assets\/codex-plus\/runtime\.js"><\/script>/);
  }
});

test("ChatGPT patch set uses ChatGPT Plus branding with stable CodexPlus runtime names", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.91948-5440");
  assert.ok(patchSet);
  assert.deepEqual(patchSet.patches.map((patch) => patch.id), [
    "bundle-identity",
    "about-codex-plus-metadata",
    "nested-repository-worker",
    "multi-repository-review",
    "diagnostic-error-boundary",
    "user-message-bubble-colors",
    "project-colors",
    "native-composer-surface",
    "project-path-header",
    "sidebar-name-blur",
    "project-selector-shortcut",
    "codex-plus-native-bridge",
    "mermaid-fullscreen-viewer",
    "chatgpt-startup-announcements",
  ]);
  assert.equal(patchSet.runtimeConfig.patchedAppDisplayName, "ChatGPT Plus");
  assert.equal(patchSet.runtimeConfig.sourceFamily, "chatgpt");
  assert.equal(patchSet.sourceFamily, "chatgpt");
  assert.deepEqual(patchSet.runtimeConfig.runtimePluginsDisabled ?? [], []);

  const transformed = transformFile(patchSet, "webview/index.html", "<title>Codex</title>");
  assert.match(transformed, /<title>ChatGPT Plus<\/title>/);
  assert.match(transformed, /<script src="\.\/assets\/codex-plus\/runtime\.js"><\/script>/);
  assert.doesNotMatch(transformed, /ChatGPTPlus/);

  const aboutTransform = collectFileTransforms(patchSet).find(
    ([, candidate]) => candidate.name === "patchAboutDialog",
  )?.[1];
  assert.equal(typeof aboutTransform, "function");
  const aboutTransformed = aboutTransform(fakeAboutDialogBundle(), patchSet.runtimeConfig);
  assert.match(aboutTransformed, /"patchedAppDisplayName":"ChatGPT Plus"/);
  assert.doesNotMatch(aboutTransformed, /"patchedAppDisplayName":"Codex Plus"/);

  const announcementTransform = collectFileTransforms(patchSet).find(
    ([, candidate]) => candidate.name === "patchChatGptStartupAnnouncements",
  )?.[1];
  assert.equal(typeof announcementTransform, "function");
  const announcementBundle = patchSet.id === "chatgpt-26.707.41301-5103"
    ? "function _Ce({appBrand:e,buildFlavor:t,platform:n}){return(n===`macOS`||n===`windows`)&&e===Du.ChatGPT&&t!=null&&t!==Il.Agent&&t!==Il.Dev}function EA(e){let t=(0,DA.c)(26),{announcementSource:n,body:r,dismissAnnouncement:i,model:a,modelName:o,onTryModel:s,showSecondaryAction:c}=e,"
    : "function Nce({appBrand:e,buildFlavor:t,platform:n}){return(n===`macOS`||n===`windows`)&&e===gc.ChatGPT&&t!=null&&t!==xd.Agent&&t!==xd.Dev}function jM(e){let t=(0,MM.c)(26),{announcementSource:n,body:r,dismissAnnouncement:i,model:a,modelName:o,onTryModel:s,showSecondaryAction:c}=e,";
  const announcementTransformed = announcementTransform(announcementBundle);
  assert.equal(
    announcementTransformed,
    patchSet.id === "chatgpt-26.707.41301-5103"
      ? "function _Ce({appBrand:e,buildFlavor:t,platform:n}){return false}function EA(e){return null;let t=(0,DA.c)(26),{announcementSource:n,body:r,dismissAnnouncement:i,model:a,modelName:o,onTryModel:s,showSecondaryAction:c}=e,"
      : "function Nce({appBrand:e,buildFlavor:t,platform:n}){return false}function jM(e){return null;let t=(0,MM.c)(26),{announcementSource:n,body:r,dismissAnnouncement:i,model:a,modelName:o,onTryModel:s,showSecondaryAction:c}=e,",
  );
});

test("41301 mounts the path accessory in its native thread-shell header action slot", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.41301-5103");
  assert.ok(patchSet);
  const headerTransform = findTransform(patchSet, "header");
  const header = headerTransform([
    "function ir(e){let t=(0,ar.c)(5),{conversationId:n}=e,r=u(Me),i=u(wt),a=G(he,n),o;t[0]===i.cwd?o=t[1]:(o=i.cwd==null?null:lt(i.cwd),t[0]=i.cwd,t[1]=o);let s=o;if(s==null||!a||i.kind!==`git`||r.kind===`remote-control`)return null;let c;return t[2]!==s||t[3]!==r?(c=(0,or.jsx)(K.HeaderAction,{actionId:`thread-local-project-actions`,align:`end`,order:100,children:(0,or.jsx)(qn,{cwd:s,hostConfig:r})}),t[2]=s,t[3]=r,t[4]=c):c=t[4],c}",
  ].join(""));
  assert.match(header, /CPX_headerContext=\{cwd:i\.cwd,hostId:r\?\.id\?\?null,header:\{surface:`thread-shell`,conversationId:n\?\?null\}\}/);
  assert.match(header, /actionId:`codex-plus-project-path`,align:`start`,order:90/);
  assert.match(header, /useSyncExternalStore:tr\.useSyncExternalStore/);
  assert.match(header, /children:\[CPX_headerAction,c\]/);
  assert.doesNotMatch(header, /querySelector|fallback/i);
});

test("51957 mounts the path accessory beside the native thread-shell project action", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.51957-5175");
  assert.ok(patchSet);
  assert.equal(
    findTransformPath(patchSet, "header"),
    "webview/assets/thread-app-shell-chrome-7V1nUdHy.js",
  );
  const headerTransform = findTransform(patchSet, "header");
  const header = headerTransform([
    "function ar(e){let t=(0,or.c)(5),{conversationId:n}=e,r=c(re),i=c(ct),a=p(Qe,n),o;t[0]===i.cwd?o=t[1]:(o=i.cwd==null?null:s(i.cwd),t[0]=i.cwd,t[1]=o);let l=o;if(l==null||!a||i.kind!==`git`||r.kind===`remote-control`)return null;let u;return t[2]!==l||t[3]!==r?(u=(0,sr.jsx)(I.HeaderAction,{actionId:`thread-local-project-actions`,align:`end`,order:100,children:(0,sr.jsx)(Jn,{cwd:l,hostConfig:r})}),t[2]=l,t[3]=r,t[4]=u):u=t[4],u}",
  ].join(""));
  assert.match(header, /CPX_headerContext=\{cwd:i\.cwd,hostId:r\?\.id\?\?null,header:\{surface:`thread-shell`,conversationId:n\?\?null\}\}/);
  assert.match(header, /actionId:`codex-plus-project-path`,align:`start`,order:90/);
  assert.match(header, /useSyncExternalStore:nr\.useSyncExternalStore/);
  assert.match(header, /children:\[CPX_headerAction,u\]/);
  assert.doesNotMatch(header, /querySelector|MutationObserver|fallback/i);
});

test("51957 native title mount subscribes to the stable virtual header contract", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.51957-5175");
  const transform = collectFileTransforms(patchSet)
    .find(([filePath]) => filePath === "webview/assets/local-conversation-page-Det2I6zV.js")?.[1];
  assert.equal(typeof transform, "function");
  const transformed = transform([
    "import{n as e,s as t}from\"./rolldown-runtime.js\";import{i as n,r}from\"./react.js\";",
    "function Sl(e){let t=(0,Tl.c)(51),{conversationId:n,hostIdOverride:r,getConversationMarkdown:i,markdownParentConversationId:a,pendingWorktree:o,projectIcon:s,projectIconInteractive:c,projectHoverCardContent:l,projectName:u,title:d,titleSuffix:f,cwd:p,canPin:g,hideForkActions:_}=e,y=c===void 0?!1:c,b=g===void 0?!0:g;",
    "let F;t[16]===d?F=t[17]:(F=(0,X.jsx)(`span`,{children:d}),t[16]=d,t[17]=F);return F}",
  ].join(""));

  assert.match(transformed, /function CPXThreadHeaderTitle\(e\)/);
  assert.match(transformed, /t\(n\(\),1\)\.useSyncExternalStore/);
  assert.match(transformed, /useSyncExternalStore\(CPXH\.subscribe,CPXH\.snapshot,CPXH\.snapshot\)/);
  assert.match(transformed, /title:CPX_nativeTitle/);
  assert.match(transformed, /d=CPXThreadHeaderTitle\(CPX_nativeTitle\)/);
});

test("41301 native title mount subscribes to the stable virtual header contract", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.41301-5103");
  const transform = collectFileTransforms(patchSet)
    .find(([filePath]) => filePath === "webview/assets/local-conversation-page-BU8CFfWN.js")?.[1];
  assert.equal(typeof transform, "function");
  const transformed = transform([
    "import{n as e,s as t}from\"./rolldown-runtime.js\";",
    "function Sl(e){let t=(0,Tl.c)(51),{conversationId:n,hostIdOverride:r,getConversationMarkdown:i,markdownParentConversationId:a,pendingWorktree:o,projectIcon:s,projectIconInteractive:c,projectHoverCardContent:u,projectName:p,title:h,titleSuffix:g,cwd:_,canPin:v,hideForkActions:y}=e,b=c===void 0?!1:c,x=v===void 0?!0:v;",
    "let P;t[16]===h?P=t[17]:(P=(0,X.jsx)(`span`,{children:h}),t[16]=h,t[17]=P);return P}",
  ].join(""));

  assert.match(transformed, /function CPXThreadHeaderTitle\(e\)/);
  assert.match(transformed, /t\(I\(\),1\)\.useSyncExternalStore/);
  assert.match(transformed, /title:CPX_nativeTitle/);
  assert.match(transformed, /h=CPXThreadHeaderTitle\(CPX_nativeTitle\)/);
});

test("ChatGPT thread side panel file opener is registered from the route scope", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.91948-5440");
  const fakeAppShellBundle = [
    "function lce(){let e=(0,HA.c)(3),t,n;",
    "children:[t,n,(0,UA.jsx)(gs,{onClick:uce,children:(0,UA.jsx)(W,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
    "children:[(0,$.jsx)(ope,{}),(0,$.jsx)(Ife,{})]",
    "function Gbe(){let e=(0,G9.c)(13),t=K(H),n=U(ls),",
    "function W9(){let e=(0,G9.c)(27),{pathname:t,search:n}=jr(),r=(0,K9.useRef)(!1),i,a;",
    "function Zbe(){let e=(0,G9.c)(8);if(q9)return null;",
  ].join("");

  const transformed = transformFile(
    patchSet,
    findTransformPath(patchSet, "app-shell"),
    fakeAppShellBundle,
  );

  assert.match(transformed, /function Zbe\(\)\{let e=\(0,G9\.c\)\(8\),CPX_SCOPE=K\(H\),CPXSP=globalThis\.CodexPlusHost\.adapters\.threadSidePanel/);
  assert.match(transformed, /CPXSP\.bindMount\(\(\)=>\(\{scope:CPX_SCOPE\}\)\)/);
  assert.match(transformed, /CPXSP\.bindOpenFile\(\(e,n=\{\}\)=>Q9\(CPX_SCOPE,e,\{\.\.\.n,hostId:n\.hostId\?\?Ts,target:n\.target\?\?`right`,line:n\.line\?\?1,endLine:n\.endLine\?\?n\.line\?\?1\}\)\)/);
  assert.doesNotMatch(transformed, /function W9\(\)\{let e=\(0,G9\.c\)\(27\),\{pathname:t,search:n\}=jr\(\),CPX_SCOPE=/);
  assert.doesNotMatch(transformed, /function Gbe\(\)\{let e=\(0,G9\.c\)\(13\),t=K\(H\),CPXSP=/);
});

test("project path header plugin formats, hides, and copies paths", () => {
  const originalNavigator = globalThis.navigator;
  const originalCodexPlus = globalThis.CodexPlus;
  const originalDocument = globalThis.document;
  const originalGetComputedStyle = globalThis.getComputedStyle;
  const originalCodexPlusHost = globalThis.CodexPlusHost;
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
    globalThis.CodexPlusHost = { adapters: { clipboard: { writeText: (value) => copied.push(value) } } };
    const longPath = "/tmp/codex-plus-audit/src/similarly-named-project/worktrees/generated-thread";
    const aharnessPath = "/tmp/codex-plus-audit/projects/aharness-examples";
    const jsx = (type, props, key) => ({ type, props, key });
    const jsxs = jsx;
    const Tooltip = function Tooltip(props) { return props.children; };

    assert.equal(plugin.pathFromContext({ cwd: "  /tmp/project  " }), "/tmp/project");
    assert.equal(plugin.pathFromContext({ header: { projectName: { props: { group: { path: "/tmp/header-project" } } } } }), "");
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
    assert.equal(chip.props.style.flexShrink, 0);
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
    globalThis.document = originalDocument;
    globalThis.getComputedStyle = originalGetComputedStyle;
    globalThis.CodexPlusHost = originalCodexPlusHost;
  }
});

test("project path header has no DOM-created or synchronized fallback chip", () => {
  const plugin = fs.readFileSync(path.join(__dirname, "../src/runtime/plugins/projectPathHeader.js"), "utf8");
  assert.doesNotMatch(plugin, /MutationObserver|querySelector|fallbackChips|anchoredNativeChips/);
  assert.doesNotMatch(plugin, /display: none|data-codex-plus-project-path-header-fallback/);
});

test("81905 binds native context and title while prepending the path accessory to the end-action slot", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.81905-4598");
  const transform = findTransform(patchSet, "local-conversation-page");
  const source = [
    "function pi(e){let t=(0,W.c)(32),{conversationId:n,getConversationMarkdown:r,markdownParentConversationId:o,projectIcon:s,projectHoverCardContent:c,projectName:l,title:u,titleSuffix:d,cwd:f,canPin:m,hideForkActions:h}=e,g=m===void 0?!0:m,_=I(),v=a(),y;",
    "let y;t[0]===f?y=t[1]:(y=f?Ne(f):null,t[0]=f,t[1]=y);let b=xr(y,E(L(i,n)).id),x;",
    "let k;t[26]===Symbol.for(`react.memo_cache_sentinel`)?(k=null,t[26]=k):k=t[26];return k}",
  ].join("");
  const transformed = transform(source);
  assert.match(transformed, /function CPXBindThreadHeaderContext\(e\)/);
  assert.match(transformed, /function CPXThreadHeaderTitle\(e\)/);
  assert.match(transformed, /H\.useSyncExternalStore\(CPXH\.threadHeader\.subscribe/);
  assert.match(transformed, /title:CPX_nativeTitle/);
  assert.match(transformed, /u=CPXThreadHeaderTitle\(CPX_nativeTitle\)/);
  assert.match(transformed, /CPXBindThreadHeaderContext\(\{cwd:f,hostId:E\(L\(i,n\)\)\.id/);
  assert.match(transformed, /surface:`local-conversation`/);
  assert.match(transformed, /projectName:l\?\?null/);
  assert.doesNotMatch(transformed, /hostId:null/);
  assert.doesNotMatch(transformed, /CPXThreadHeaderAccessories/);

  const actionShellTransform = collectFileTransforms(patchSet)
    .find(([, candidate]) => candidate.name === "patchThreadHeaderActionShell")?.[1];
  assert.equal(typeof actionShellTransform, "function");
  const actionShell = actionShellTransform([
    "function THt({isHeaderEdgeScroll:e,isApplicationMenuBarEnabled:t}){",
    "h=u.filter(({align:e})=>e===`start`),g=u.filter(({align:e})=>e===`center`),_=u.filter(({align:e})=>e===`end`),v=h.length>0,",
  ].join(""));
  assert.match(actionShell, /function CPXHA\(u,e\)/);
  assert.match(actionShell, /_=\(\(e,t\)=>t==null\?e:\[\{actionId:`codex-plus-project-path`,align:`end`,node:t\},\.\.\.e\]\)\(u\.filter/);
  assert.match(actionShell, /CPXHA\(TU\.useSyncExternalStore,\{jsx:EU\.jsx,jsxs:EU\.jsxs\}\)\)/);
});

test("70822 binds native context and title while prepending the path accessory to the end-action slot", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.70822-4559");
  const transform = findTransform(patchSet, "local-conversation-page");
  const transformed = transform([
    "function pi(e){let t=(0,W.c)(32),{conversationId:n,getConversationMarkdown:r,markdownParentConversationId:i,projectIcon:a,projectHoverCardContent:s,projectName:c,title:l,titleSuffix:u,cwd:d,canPin:f,hideForkActions:m}=e,g=f===void 0?!0:f,_=L(),v=h(),y;",
    "let x=xr(y,nt(o(Pt,n)).id),S;",
    "let k;t[26]===Symbol.for(`react.memo_cache_sentinel`)?(k=null,t[26]=k):k=t[26];return k}",
  ].join(""));
  assert.match(transformed, /function CPXBindThreadHeaderContext\(e\)/);
  assert.match(transformed, /function CPXThreadHeaderTitle\(e\)/);
  assert.match(transformed, /Qi\.useSyncExternalStore\(CPXH\.threadHeader\.subscribe/);
  assert.match(transformed, /title:CPX_nativeTitle/);
  assert.match(transformed, /l=CPXThreadHeaderTitle\(CPX_nativeTitle\)/);
  assert.match(transformed, /CPXBindThreadHeaderContext\(\{cwd:d,hostId:nt\(o\(Pt,n\)\)\.id/);
  assert.doesNotMatch(transformed, /CPXThreadHeaderAccessories/);

  const actionShellTransform = collectFileTransforms(patchSet)
    .find(([, candidate]) => candidate.name === "patchThreadHeaderActionShell")?.[1];
  assert.equal(typeof actionShellTransform, "function");
  const actionShell = actionShellTransform([
    "function a7e({isHeaderEdgeScroll:e,isApplicationMenuBarEnabled:t}){",
    "h=u.filter(({align:e})=>e===`start`),g=u.filter(({align:e})=>e===`center`),_=u.filter(({align:e})=>e===`end`),v=h.length>0,",
  ].join(""));
  assert.match(actionShell, /function CPXHA\(u,e\)/);
  assert.match(actionShell, /_=\(\(e,t\)=>t==null\?e:\[\{actionId:`codex-plus-project-path`,align:`end`,node:t\},\.\.\.e\]\)\(u\.filter/);
  assert.match(actionShell, /CPXHA\(G5\.useSyncExternalStore,\{jsx:K5\.jsx,jsxs:K5\.jsxs\}\)\)/);
});

test("61825 binds native context and title while prepending the path accessory to the end-action slot", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.61825-4548");
  const transform = findTransform(patchSet, "local-conversation-page");
  const transformed = transform([
    "function mi(e){let t=(0,U.c)(32),{conversationId:n,getConversationMarkdown:r,markdownParentConversationId:i,projectIcon:a,projectHoverCardContent:o,projectName:s,title:c,titleSuffix:l,cwd:u,canPin:p,hideForkActions:h}=e,g=p===void 0?!0:p,_=R(),v=f(),y;",
    "let x=Sr(y,mt(d(tt,n)).id),S;",
    "let k;t[26]===Symbol.for(`react.memo_cache_sentinel`)?(k=null,t[26]=k):k=t[26];return k}",
  ].join(""));
  assert.match(transformed, /Qi\.useSyncExternalStore\(CPXH\.threadHeader\.subscribe/);
  assert.match(transformed, /title:CPX_nativeTitle/);
  assert.match(transformed, /c=CPXThreadHeaderTitle\(CPX_nativeTitle\)/);
  assert.match(transformed, /CPXBindThreadHeaderContext\(\{cwd:u,hostId:mt\(d\(tt,n\)\)\.id/);
  assert.doesNotMatch(transformed, /CPXThreadHeaderAccessories/);

  const actionShellTransform = collectFileTransforms(patchSet)
    .find(([, candidate]) => candidate.name === "patchThreadHeaderActionShell")?.[1];
  assert.equal(typeof actionShellTransform, "function");
  const actionShell = actionShellTransform([
    "function lb({isHeaderEdgeScroll:e,isApplicationMenuBarEnabled:t}){",
    "h=u.filter(({align:e})=>e===`start`),g=u.filter(({align:e})=>e===`center`),_=u.filter(({align:e})=>e===`end`),v=h.length>0,",
  ].join(""));
  assert.match(actionShell, /CPXHA\(sb\.useSyncExternalStore,\{jsx:yb\.jsx,jsxs:yb\.jsxs\}\)\)/);
  assert.match(actionShell, /_=\(\(e,t\)=>t==null\?e:\[\{actionId:`codex-plus-project-path`,align:`end`,node:t\},\.\.\.e\]\)\(u\.filter/);
});

test("42026 binds native context and title while prepending the path accessory to the end-action slot", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.42026-4514");
  const transform = findTransform(patchSet, "local-conversation-page");
  const transformed = transform([
    "function pi(e){let t=(0,W.c)(32),{conversationId:n,getConversationMarkdown:r,markdownParentConversationId:i,projectIcon:a,projectHoverCardContent:o,projectName:s,title:c,titleSuffix:u,cwd:p,canPin:m,hideForkActions:h}=e,_=m===void 0?!0:m,v=R(),y=f(),b;",
    "let x=xr(b,Zt(l(kt,n)).id),S;",
    "let k;t[26]===Symbol.for(`react.memo_cache_sentinel`)?(k=null,t[26]=k):k=t[26];return k}",
  ].join(""));
  assert.match(transformed, /Qi\.useSyncExternalStore\(CPXH\.threadHeader\.subscribe/);
  assert.match(transformed, /title:CPX_nativeTitle/);
  assert.match(transformed, /c=CPXThreadHeaderTitle\(CPX_nativeTitle\)/);
  assert.match(transformed, /CPXBindThreadHeaderContext\(\{cwd:p,hostId:Zt\(l\(kt,n\)\)\.id/);
  assert.doesNotMatch(transformed, /CPXThreadHeaderAccessories/);

  const actionShellTransform = collectFileTransforms(patchSet)
    .find(([, candidate]) => candidate.name === "patchThreadHeaderActionShell")?.[1];
  assert.equal(typeof actionShellTransform, "function");
  const actionShell = actionShellTransform([
    "function aGe({isHeaderEdgeScroll:e,isApplicationMenuBarEnabled:t}){",
    "h=u.filter(({align:e})=>e===`start`),g=u.filter(({align:e})=>e===`center`),_=u.filter(({align:e})=>e===`end`),v=h.length>0,",
  ].join(""));
  assert.match(actionShell, /CPXHA\(DF\.useSyncExternalStore,\{jsx:OF\.jsx,jsxs:OF\.jsxs\}\)\)/);
  assert.match(actionShell, /_=\(\(e,t\)=>t==null\?e:\[\{actionId:`codex-plus-project-path`,align:`end`,node:t\},\.\.\.e\]\)\(u\.filter/);
});

test("41415 binds native context and title while prepending the path accessory to the end-action slot", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.41415-4505");
  const transform = findTransform(patchSet, "local-conversation-page");
  const transformed = transform([
    "function mi(e){let t=(0,U.c)(32),{conversationId:n,getConversationMarkdown:r,markdownParentConversationId:i,projectIcon:a,projectHoverCardContent:s,projectName:c,title:l,titleSuffix:u,cwd:d,canPin:f,hideForkActions:p}=e,g=f===void 0?!0:f,_=N(),v=h(),y;",
    "let b=Sr(y,hn(m(gn,n)).id),x;",
    "let O;t[26]===Symbol.for(`react.memo_cache_sentinel`)?(O=null,t[26]=O):O=t[26];return O}",
  ].join(""));
  assert.match(transformed, /Qi\.useSyncExternalStore\(CPXH\.threadHeader\.subscribe/);
  assert.match(transformed, /title:CPX_nativeTitle/);
  assert.match(transformed, /l=CPXThreadHeaderTitle\(CPX_nativeTitle\)/);
  assert.match(transformed, /CPXBindThreadHeaderContext\(\{cwd:d,hostId:hn\(m\(gn,n\)\)\.id/);
  assert.doesNotMatch(transformed, /CPXThreadHeaderAccessories/);

  const actionShellTransform = collectFileTransforms(patchSet)
    .find(([, candidate]) => candidate.name === "patchThreadHeaderActionShell")?.[1];
  assert.equal(typeof actionShellTransform, "function");
  const actionShell = actionShellTransform([
    "function Xfn({isHeaderEdgeScroll:e,isApplicationMenuBarEnabled:t}){",
    "h=u.filter(({align:e})=>e===`start`),g=u.filter(({align:e})=>e===`center`),_=u.filter(({align:e})=>e===`end`),v=h.length>0,",
  ].join(""));
  assert.match(
    actionShell,
    /CPXHA\(nq\.useSyncExternalStore,\{jsx:rq\.jsx,jsxs:rq\.jsxs\}\)\)/,
  );
  assert.match(actionShell, /_=\(\(e,t\)=>t==null\?e:\[\{actionId:`codex-plus-project-path`,align:`end`,node:t\},\.\.\.e\]\)\(u\.filter/);
});

test("31921 binds native context and title while prepending the path accessory to the end-action slot", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.31921-4452");
  const transform = findTransform(patchSet, "local-conversation-page");
  const transformed = transform([
    "function mi(e){let t=(0,U.c)(32),{conversationId:n,getConversationMarkdown:r,markdownParentConversationId:i,projectIcon:a,projectHoverCardContent:o,projectName:s,title:c,titleSuffix:l,cwd:u,canPin:d,hideForkActions:f}=e,p=d===void 0?!0:d,m=F(),g=rt(),_;",
    "let v=Sr(_,C(j(ke,n)).id),y;",
    "let D;t[26]===Symbol.for(`react.memo_cache_sentinel`)?(D=null,t[26]=D):D=t[26];return D}",
  ].join(""));
  assert.match(transformed, /Qi\.useSyncExternalStore\(CPXH\.threadHeader\.subscribe/);
  assert.match(transformed, /title:CPX_nativeTitle/);
  assert.match(transformed, /c=CPXThreadHeaderTitle\(CPX_nativeTitle\)/);
  assert.match(transformed, /CPXBindThreadHeaderContext\(\{cwd:u,hostId:C\(j\(ke,n\)\)\.id/);
  assert.doesNotMatch(transformed, /CPXThreadHeaderAccessories/);

  const actionShellTransform = collectFileTransforms(patchSet)
    .find(([, candidate]) => candidate.name === "patchThreadHeaderActionShell")?.[1];
  assert.equal(typeof actionShellTransform, "function");
  const actionShell = actionShellTransform([
    "function eR({isHeaderEdgeScroll:e,isApplicationMenuBarEnabled:t}){",
    "h=u.filter(({align:e})=>e===`start`),g=u.filter(({align:e})=>e===`center`),v=u.filter(({align:e})=>e===`end`),y=h.length>0,",
  ].join(""));
  assert.match(actionShell, /CPXHA\(QL\.useSyncExternalStore,\{jsx:uR\.jsx,jsxs:uR\.jsxs\}\)\)/);
  assert.match(actionShell, /CPXScope=ge\(q\)/);
  assert.match(actionShell, /v=\(\(e,t\)=>t==null\?e:\[\{actionId:`codex-plus-project-path`,align:`end`,node:t\},\.\.\.e\]\)\(u\.filter/);
  assert.match(actionShell, /CPXSP\.bindMount\(\(\)=>\(\{scope:CPXScope\}\)\)/);
  assert.match(actionShell, /CPXSP\.bindOpenFile\(\(e,n=\{\}\)=>YG\(CPXScope,e,n\)\)/);
});

test("616 thread shell mounts the path accessory with the native Open in action", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.616.81150-4306");
  const transform = collectFileTransforms(patchSet).find(([filePath]) => filePath.includes("thread-app-shell-chrome-DCxIEqvQ"))?.[1];
  const bundle = [
    "function bt(e){let t=(0,$.c)(8),{actionId:n,conversationId:r}=e,",
    "let u=l;if(u==null||!c||o.kind!==`git`||a.kind===`remote-control`)return null;",
    "let d;t[2]!==u||t[3]!==a?(d=(0,Q.jsx)(ft,{cwd:u,hostConfig:a}),t[2]=u,t[3]=a,t[4]=d):d=t[4];",
    "let f;return t[5]!==n||t[6]!==d?(f=(0,Q.jsx)(P.HeaderAction,{actionId:n,align:`end`,order:100,children:d}),t[5]=n,t[6]=d,t[7]=f):f=t[7],f}",
    "function Pt(e){let t=(0,$.c)(24),n=o(U),r=s(Se),",
  ].join("");

  assert.equal(typeof transform, "function");
  const transformed = transform(bundle);

  assert.match(transformed, /function CPXThreadHeaderActiveAccessories/);
  assert.match(transformed, /Z\.useSyncExternalStore\(CPXH\.threadHeader\.subscribe,CPXH\.threadHeader\.snapshot,CPXH\.threadHeader\.snapshot\)/);
  assert.match(transformed, /let u=l,CPXA=CPXThreadHeaderActiveAccessories\(\{jsx:Q\.jsx,jsxs:Q\.jsxs\}\);if\(u==null/);
  assert.doesNotMatch(transformed, /;CPXA=CPXThreadHeaderActiveAccessories/);
  assert.ok(transformed.indexOf("CPXA=CPXThreadHeaderActiveAccessories") < transformed.indexOf("if(u==null"));
  assert.match(transformed, /children:\[CPXA,d\]/);
  assert.doesNotMatch(transformed, /children:d\}\)/);
  assert.match(transformed, /CPXSP\.bindMount\(\(\)=>\(\{scope:n\}\)\)/);
  assert.match(transformed, /CPXSP\.bindOpenFile\(\(e,t=\{\}\)=>ye\(n,e,t\)\)/);

  const localTransform = collectFileTransforms(patchSet).find(([filePath]) => filePath.includes("local-conversation-page-dVDt8SxG"))?.[1];
  const localBundle = [
    "function Tt(e){let t=(0,Y.c)(42),",
    "let t=(0,Y.c)(42),{conversationId:n,getConversationMarkdown:r,markdownParentConversationId:a,title:o,titleSuffix:s,cwd:c,canPin:l,hideProjectMetadata:d,hideForkActions:f}=e,p=l===void 0?!0:l,m=d===void 0?!1:d,h=A(),g;",
    "t[38]!==F||t[39]!==I||t[40]!==L?(z=(0,Z.jsx)(`div`,{className:`draggable grid w-full min-w-0 grid-cols-[minmax(0,1fr)] items-center gap-x-4 electron:h-toolbar extension:py-row-y`,children:(0,Z.jsxs)(`div`,{className:`flex min-w-0 items-center gap-2 truncate text-base electron:font-medium`,children:[F,I,L,R]})}),t[38]=F,t[39]=I,t[40]=L,t[41]=z):z=t[41]",
  ].join("");
  const transformedLocal = localTransform(localBundle);
  assert.match(transformedLocal, /CPXBindThreadHeaderContext/);
  assert.match(transformedLocal, /X\.useSyncExternalStore\(CPXH\.threadHeader\.subscribe/);
  assert.match(transformedLocal, /title:CPX_nativeTitle/);
  assert.match(transformedLocal, /o=CPXThreadHeaderTitle\(CPX_nativeTitle\)/);
  assert.match(transformedLocal, /children:\[F,I,L,R\]/);
  assert.doesNotMatch(transformedLocal, /CPXThreadHeaderAccessories/);

  const earlierPatchSet = patchSets.find((candidate) => candidate.id === "codex-26.616.71553-4265");
  const earlierTransforms = collectFileTransforms(earlierPatchSet);
  const earlierActionTransform = earlierTransforms.find(([filePath]) => filePath.includes("thread-app-shell-chrome-QpJxW8i_"))?.[1];
  const earlierLocalTransform = earlierTransforms.find(([filePath]) => filePath.includes("local-conversation-page-CEPeqs2w"))?.[1];
  assert.equal(typeof earlierActionTransform, "function");
  assert.equal(typeof earlierLocalTransform, "function");
  const earlierLocal = earlierLocalTransform(localBundle.replaceAll("function Tt", "function wt"));
  assert.match(earlierLocal, /function wt\(e\)/);
  assert.match(earlierLocal, /CPXBindThreadHeaderContext/);
  assert.match(earlierLocal, /o=CPXThreadHeaderTitle\(CPX_nativeTitle\)/);

  for (const id of ["codex-26.616.51431-4212", "codex-26.616.41845-4198"]) {
    const oldestPatchSet = patchSets.find((candidate) => candidate.id === id);
    const oldestTransforms = collectFileTransforms(oldestPatchSet);
    const oldestActionTransform = oldestTransforms.find(([filePath]) => filePath.includes("thread-app-shell-chrome-CbibVJG6"))?.[1];
    const oldestLocalTransform = oldestTransforms.find(([filePath]) => filePath.includes("local-conversation-page-DYmoiEa4"))?.[1];
    assert.equal(typeof oldestActionTransform, "function", `${id} binds the native header action shell`);
    assert.equal(typeof oldestLocalTransform, "function", `${id} binds native conversation context`);
    assert.match(oldestLocalTransform(localBundle.replaceAll("function Tt", "function wt")), /CPXBindThreadHeaderContext/);
  }
});

test("header patch renders project path accessories from thread context", () => {
  const currentChatGptPatchSet = patchSets.find((patchSet) => patchSet.id === "chatgpt-26.707.41301-5103");
  const currentChatGptHeader = findTransform(currentChatGptPatchSet, "header");
  const currentChatGptHeaderBundle = [
    "function Yn(e){let t=(0,er.c)(66),{className:n,desktopDeepLinkConversationId:r,title:i,onBack:a,trailing:o}=e,s=ke(),c=a??Zn,l=s.pathname===`/`,u=Xn;",
    "let S;t[35]!==c||t[36]!==g||t[37]!==i?(S=(0,$.jsx)(`div`,{className:`mr-3 line-clamp-1 flex min-w-0 flex-1 items-center gap-1 truncate`,style:{viewTransitionName:`header-title`},children:i?(0,$.jsxs)(`div`,{className:`flex min-w-0 flex-1 items-center gap-1`,children:[(0,$.jsx)($n,{onClick:c}),(0,$.jsx)(w,{color:`ghostActive`,type:`button`,onClick:u,className:`min-w-0 flex-1 truncate !px-0 !py-0 text-left text-sm text-token-foreground hover:!bg-transparent hover:opacity-80 electron:font-medium`,children:(0,$.jsx)(`span`,{className:`truncate`,children:i})})]}):(0,$.jsx)(`span`,{className:`text-token-description-foreground`,children:(0,$.jsx)(Qn,{mergedTasks:g,onBack:c,showBackButton:!0})})}),t[35]=c,t[36]=g,t[37]=i,t[38]=S):S=t[38];",
  ].join("");
  const currentChatGptHeaderTransformed = currentChatGptHeader(currentChatGptHeaderBundle);
  assert.match(currentChatGptHeaderTransformed, /function CPXThreadHeaderAccessories\(e\)/);
  assert.match(currentChatGptHeaderTransformed, /CPX_headerContext=\{cwd:CPX_headerCwd,header:\{surface:`header`,titleText:typeof i==`string`\?i:null\}\}/);
  assert.match(currentChatGptHeaderTransformed, /children:\[\(0,\$\.jsx\)\(\$n,\{onClick:c\}\),\(0,\$\.jsx\)\(w,\{color:`ghostActive`/);
  assert.match(currentChatGptHeaderTransformed, /CPX_headerAccessories/);

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
    "let S;t[13]===_?S=t[14]:(S=g?(0,s.jsxs)(`div`,{className:`flex items-center gap-0.5`,children:[_?(0,s.jsx)(`div`,{className:`mx-2 h-[16px] w-px bg-token-border`}):null,h]}):null,t[13]=_,t[14]=S);",
    "let C;t[15]!==S||t[16]!==f?(C=(0,s.jsxs)(`div`,{className:`flex items-center justify-end gap-1.5`,children:[f,S]}),t[15]=S,t[16]=f,t[17]=C):C=t[17];",
    "return x}export{c as t};",
  ].join("");
  const fakeLocalConversationPageBundle = [
    "function Tt(e){let t=(0,Y.c)(42),{conversationId:n,getConversationMarkdown:r,markdownParentConversationId:a,title:o,titleSuffix:s,cwd:c,canPin:l,hideProjectMetadata:d,hideForkActions:f}=e,p=l===void 0?!0:l,m=d===void 0?!1:d,h=A(),g;",
    "t[0]===c?g=t[1]:(g=c?N(c):null,t[0]=c,t[1]=g);let _=gt(g,u(i(O,n)).id),v;",
    "let F,I,L,R;t[37]===Symbol.for(`react.memo_cache_sentinel`)?(R=null,t[37]=R):R=t[37];let z;",
    "return t[38]!==F||t[39]!==I||t[40]!==L?(z=(0,Z.jsx)(`div`,{className:`draggable grid w-full min-w-0 grid-cols-[minmax(0,1fr)] items-center gap-x-4 electron:h-toolbar extension:py-row-y`,children:(0,Z.jsxs)(`div`,{className:`flex min-w-0 items-center gap-2 truncate text-base electron:font-medium`,children:[F,I,L,R]})}),t[38]=F,t[39]=I,t[40]=L,t[41]=z):z=t[41],z}",
  ].join("");

  for (const patchSet of patchSets.filter((patchSet) => patchSet.patches.some((patch) => patch.id === "project-path-header"))) {
    if (patchSet.id === "codex-26.623.31921-4452") {
      const localConversationTransform = findTransform(patchSet, "local-conversation-page");
      const transformedLocalConversation = localConversationTransform([
        "function mi(e){let t=(0,U.c)(32),",
        "{conversationId:n,getConversationMarkdown:r,markdownParentConversationId:i,projectIcon:a,projectHoverCardContent:o,projectName:s,title:c,titleSuffix:l,cwd:u,canPin:d,hideForkActions:f}=e,p=d===void 0?!0:d,m=F(),g=rt(),_;",
        "let v=Sr(_,C(j(ke,n)).id),y;",
        "let D;t[26]===Symbol.for(`react.memo_cache_sentinel`)?(D=null,t[26]=D):D=t[26];",
        "let O;return t[27]!==x||t[28]!==w||t[29]!==T||t[30]!==E?(O=(0,W.jsx)(`div`,{className:`draggable grid w-full min-w-0 grid-cols-[minmax(0,1fr)] items-center gap-x-4 electron:h-toolbar extension:py-row-y`,children:(0,W.jsxs)(`div`,{className:`flex min-w-0 items-center gap-2 truncate text-base electron:font-medium`,children:[x,w,T,E,D]})}),t[27]=x,t[28]=w,t[29]=T,t[30]=E,t[31]=O):O=t[31],O}",
      ].join(""));

      assert.match(transformedLocalConversation, /Qi\.useSyncExternalStore\(CPXH\.threadHeader\.subscribe/);
      assert.match(transformedLocalConversation, /title:CPX_nativeTitle/);
      assert.match(transformedLocalConversation, /c=CPXThreadHeaderTitle\(CPX_nativeTitle\)/);
      assert.match(transformedLocalConversation, /CPXBindThreadHeaderContext\(\{cwd:u,hostId:C\(j\(ke,n\)\)\.id/);
      assert.doesNotMatch(transformedLocalConversation, /CPXThreadHeaderAccessories/);

      const actionShellTransform = collectFileTransforms(patchSet)
        .find(([, candidate]) => candidate.name === "patchThreadHeaderActionShell")?.[1];
      assert.equal(typeof actionShellTransform, "function");
      const actionShell = actionShellTransform([
        "function eR({isHeaderEdgeScroll:e,isApplicationMenuBarEnabled:t}){",
        "h=u.filter(({align:e})=>e===`start`),g=u.filter(({align:e})=>e===`center`),v=u.filter(({align:e})=>e===`end`),y=h.length>0,",
      ].join(""));
      assert.match(actionShell, /CPXHA\(QL\.useSyncExternalStore,\{jsx:uR\.jsx,jsxs:uR\.jsxs\}\)\)/);
      assert.match(actionShell, /v=\(\(e,t\)=>t==null\?e:\[\{actionId:`codex-plus-project-path`,align:`end`,node:t\},\.\.\.e\]\)\(u\.filter/);
      continue;
    }
    if (patchSet.id === "codex-26.623.41415-4505") {
      const transform = findTransform(patchSet, "header");
      const transformed = transform([
        "function Jn(e){let t=(0,$n.c)(66),{className:n,desktopDeepLinkConversationId:r,title:i,onBack:a,trailing:o}=e,s=O(),c=a??dt,l=s.pathname===`/`,u=ut;",
        "let x;t[35]!==c||t[36]!==g||t[37]!==i?(x=(0,$.jsx)(`div`,{className:`mr-3 line-clamp-1 flex min-w-0 flex-1 items-center gap-1 truncate`,style:{viewTransitionName:`header-title`},children:i?(0,$.jsxs)(`div`,{className:`flex min-w-0 flex-1 items-center gap-1`,children:[(0,$.jsx)(Qn,{onClick:c}),(0,$.jsx)(q,{color:`ghostActive`,type:`button`,onClick:u,className:`min-w-0 flex-1 truncate !px-0 !py-0 text-left text-sm text-token-foreground hover:!bg-transparent hover:opacity-80 electron:font-medium`,children:(0,$.jsx)(`span`,{className:`truncate`,children:i})})]}):(0,$.jsx)(`span`,{className:`text-token-description-foreground`,children:(0,$.jsx)(Zn,{mergedTasks:g,onBack:c,showBackButton:!0})})}),t[35]=c,t[36]=g,t[37]=i,t[38]=x):x=t[38];",
      ].join(""));

      assert.match(transformed, /function CPXThreadHeaderAccessories\(e\)/);
      assert.match(transformed, /CPX_headerContext=\{cwd:null,hostId:null,header:\{surface:`header`,titleText:typeof i==`string`\?i:null\}\}/);
      assert.match(transformed, /deps:\{jsx:\$\.jsx,jsxs:\$\.jsxs,Tooltip:me\}/);
      assert.match(transformed, /children:\[\(0,\$\.jsx\)\(Qn,\{onClick:c\}\),\(0,\$\.jsx\)\(q,\{color:`ghostActive`/);
      assert.match(transformed, /\}\),CPX_headerAccessories\]\}\):\(0,\$\.jsx\)\(`span`/);
      assert.doesNotMatch(transformed, /t\[\d+\]!==CPX_headerAccessories/);
      assert.doesNotMatch(transformed, /t\[\d+\]=CPX_headerAccessories/);

      const localConversationTransform = findTransform(patchSet, "local-conversation-page");
      const transformedLocalConversation = localConversationTransform([
        "function mi(e){let t=(0,U.c)(32),",
        "{conversationId:n,getConversationMarkdown:r,markdownParentConversationId:i,projectIcon:a,projectHoverCardContent:s,projectName:c,title:l,titleSuffix:u,cwd:d,canPin:f,hideForkActions:p}=e,g=f===void 0?!0:f,_=N(),v=h(),y;",
        "let b=Sr(y,hn(m(gn,n)).id),x;",
      ].join(""));

      assert.match(transformedLocalConversation, /function CPXBindThreadHeaderContext\(e\)/);
      assert.match(transformedLocalConversation, /l=CPXThreadHeaderTitle\(CPX_nativeTitle\)/);
      assert.match(transformedLocalConversation, /CPXBindThreadHeaderContext\(\{cwd:d,hostId:hn\(m\(gn,n\)\)\.id/);
      assert.doesNotMatch(transformedLocalConversation, /CPXThreadHeaderAccessories/);
      continue;
    }
    if (patchSet.id === "codex-26.623.141536-4753") {
      const transform = findTransform(patchSet, "review");
      const transformed = transform([
        "import{n as e,r as t,s as n,t as r}from\"./rolldown-runtime-Czos8NxU.js\";",
        "function YPt(e){let t=(0,XPt.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e",
        "let s;t[1]!==a||t[2]!==r||t[3]!==i?(s=(0,yK.jsx)(ZDt,{diffMode:a,setTabState:r,tabState:i}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
      ].join(""));

      assert.match(transformed, /import\{t as CPXBranchPickerDropdownContent\}from"\.\/git-branch-switcher-DRHNJnp9\.js"/);
      assert.match(transformed, /CodexPlusHost\.adapters\.review/);
      assert.match(transformed, /CPXRM=e=>self\.CodexPlusHost\.adapters\.review\.renderBodyFromHost\(e,\[yK,typeof BPt!==`undefined`\?BPt:null,Hn,X,Tu,OE,kE,AE,null,Ti,Ot,ZDt,null,null,null,null,null,CPXBranchPickerDropdownContent,null,TE,pht\]\)/);
      assert.match(
        transformed,
        /s=\(0,yK\.jsx\)\(CPXRM,\{mainReviewContent:\(0,yK\.jsx\)\(ZDt,\{diffMode:a,setTabState:r,tabState:i\}\),diffMode:a,setTabState:r,tabState:i\}\)/,
      );
      assert.doesNotMatch(transformed, /plugins\?\.get\(`nestedRepositories`\)\?\.exports/);
      assert.doesNotMatch(transformed, /function CPXBranchPicker/);
      assert.doesNotMatch(transformed, /function CPXRepoPatchGroup/);
      assert.doesNotMatch(transformed, /function CPXRepoDiffBody/);
      continue;
    }
    if (patchSet.id === "codex-26.623.101652-4674") {
      assert.equal(
        collectFileTransforms(patchSet).some(([, transform]) => transform.name === "patchHeader"),
        false,
      );

      const localConversationTransform = findTransform(patchSet, "local-conversation-page");
      const transformedLocalConversation = localConversationTransform([
        "function pi(e){let t=(0,W.c)(32),",
        "let t=(0,W.c)(32),{conversationId:n,getConversationMarkdown:r,markdownParentConversationId:i,projectIcon:a,projectHoverCardContent:o,projectName:s,title:c,titleSuffix:u,cwd:d,canPin:f,hideForkActions:p}=e,m=f===void 0?!0:f,h=A(),g=Pe(),_;",
        "let y=xr(_,v(P(E,n)).id),b;",
        "let O;t[26]===Symbol.for(`react.memo_cache_sentinel`)?(O=null,t[26]=O):O=t[26];",
        "let k;return t[27]!==S||t[28]!==w||t[29]!==T||t[30]!==D?(k=(0,G.jsx)(`div`,{className:`draggable grid w-full min-w-0 grid-cols-[minmax(0,1fr)] items-center gap-x-4 electron:h-toolbar extension:py-row-y`,children:(0,G.jsxs)(`div`,{className:`flex min-w-0 items-center gap-2 truncate text-base electron:font-medium`,children:[S,w,T,D,O]})}),t[27]=S,t[28]=w,t[29]=T,t[30]=D,t[31]=k):k=t[31],k}",
      ].join(""));

      assert.match(transformedLocalConversation, /function CPXBindThreadHeaderContext\(e\)/);
      assert.match(transformedLocalConversation, /function CPXThreadHeaderTitle\(e\)/);
      assert.match(transformedLocalConversation, /Qi\.useSyncExternalStore\(CPXH\.threadHeader\.subscribe/);
      assert.match(transformedLocalConversation, /title:CPX_nativeTitle/);
      assert.match(transformedLocalConversation, /c=CPXThreadHeaderTitle\(CPX_nativeTitle\)/);
      assert.match(transformedLocalConversation, /CPXBindThreadHeaderContext\(\{cwd:d,hostId:v\(P\(E,n\)\)\.id/);
      assert.match(transformedLocalConversation, /surface:`local-conversation`/);
      assert.match(transformedLocalConversation, /projectName:s\?\?null/);
      assert.doesNotMatch(transformedLocalConversation, /hostId:null/);
      assert.doesNotMatch(transformedLocalConversation, /CPXThreadHeaderAccessories/);

      const actionShellTransform = collectFileTransforms(patchSet)
        .find(([, transform]) => transform.name === "patchThreadHeaderActionShell")?.[1];
      assert.equal(typeof actionShellTransform, "function");
      const actionShell = actionShellTransform([
        "function Nk({isHeaderEdgeScroll:e,isApplicationMenuBarEnabled:t}){",
        "h=u.filter(({align:e})=>e===`start`),g=u.filter(({align:e})=>e===`center`),_=u.filter(({align:e})=>e===`end`),v=h.length>0,",
      ].join(""));
      assert.match(actionShell, /function CPXHA\(u,e\)/);
      assert.match(actionShell, /_=\(\(e,t\)=>t==null\?e:\[\{actionId:`codex-plus-project-path`,align:`end`,node:t\},\.\.\.e\]\)\(u\.filter/);
      assert.match(actionShell, /CPXHA\(jk\.useSyncExternalStore,\{jsx:Uk\.jsx,jsxs:Uk\.jsxs\}\)\)/);
      continue;
    }
    if (patchSet.id === "codex-26.623.42026-4514") {
      const transform = findTransform(patchSet, "header");
      const transformed = transform([
        "function Jn(e){let t=(0,$n.c)(66),{className:n,desktopDeepLinkConversationId:r,title:i,onBack:a,trailing:o}=e,s=O(),c=a??dt,l=s.pathname===`/`,u=ut;",
        "let x;t[35]!==c||t[36]!==g||t[37]!==i?(x=(0,$.jsx)(`div`,{className:`mr-3 line-clamp-1 flex min-w-0 flex-1 items-center gap-1 truncate`,style:{viewTransitionName:`header-title`},children:i?(0,$.jsxs)(`div`,{className:`flex min-w-0 flex-1 items-center gap-1`,children:[(0,$.jsx)(Qn,{onClick:c}),(0,$.jsx)(L,{color:`ghostActive`,type:`button`,onClick:u,className:`min-w-0 flex-1 truncate !px-0 !py-0 text-left text-sm text-token-foreground hover:!bg-transparent hover:opacity-80 electron:font-medium`,children:(0,$.jsx)(`span`,{className:`truncate`,children:i})})]}):(0,$.jsx)(`span`,{className:`text-token-description-foreground`,children:(0,$.jsx)(Zn,{mergedTasks:g,onBack:c,showBackButton:!0})})}),t[35]=c,t[36]=g,t[37]=i,t[38]=x):x=t[38];",
      ].join(""));

      assert.match(transformed, /function CPXThreadHeaderAccessories\(e\)/);
      assert.match(transformed, /CPX_headerContext=\{cwd:null,hostId:null,header:\{surface:`header`,titleText:typeof i==`string`\?i:null\}\}/);
      assert.match(transformed, /deps:\{jsx:\$\.jsx,jsxs:\$\.jsxs,Tooltip:re\}/);
      assert.match(transformed, /children:\[\(0,\$\.jsx\)\(Qn,\{onClick:c\}\),\(0,\$\.jsx\)\(L,\{color:`ghostActive`/);
      assert.match(transformed, /\}\),CPX_headerAccessories\]\}\):\(0,\$\.jsx\)\(`span`/);
      assert.doesNotMatch(transformed, /t\[\d+\]!==CPX_headerAccessories/);
      assert.doesNotMatch(transformed, /t\[\d+\]=CPX_headerAccessories/);

      const localConversationTransform = findTransform(patchSet, "local-conversation-page");
      const transformedLocalConversation = localConversationTransform([
        "function pi(e){let t=(0,W.c)(32),",
        "let t=(0,W.c)(32),{conversationId:n,getConversationMarkdown:r,markdownParentConversationId:i,projectIcon:a,projectHoverCardContent:s,projectName:c,title:l,titleSuffix:u,cwd:p,canPin:m,hideForkActions:h}=e,g=m===void 0?!0:m,_=D(),v=N(),y;",
        "let k;t[26]===Symbol.for(`react.memo_cache_sentinel`)?(k=null,t[26]=k):k=t[26];",
        "let A;return t[27]!==T||t[28]!==F||t[29]!==I||t[30]!==L?(A=(0,G.jsx)(`div`,{className:`draggable grid w-full min-w-0 grid-cols-[minmax(0,1fr)] items-center gap-x-4 electron:h-toolbar extension:py-row-y`,children:(0,G.jsxs)(`div`,{className:`flex min-w-0 items-center gap-2 truncate text-base electron:font-medium`,children:[T,F,I,L,k]})}),t[27]=T,t[28]=F,t[29]=I,t[30]=L,t[31]=A):A=t[31],A}",
      ].join(""));

      assert.match(transformedLocalConversation, /function CPXThreadHeaderAccessories\(e\)/);
      assert.match(transformedLocalConversation, /CPX_headerContext=\{cwd:p,hostId:null/);
      assert.match(transformedLocalConversation, /surface:`local-conversation`/);
      assert.match(transformedLocalConversation, /deps:\{jsx:G\.jsx,jsxs:G\.jsxs,Tooltip:ht\}/);
      assert.match(transformedLocalConversation, /children:\[T,F,I,L,k\]/);
      assert.match(transformedLocalConversation, /,k=CPXThreadHeaderAccessories/);
      assert.doesNotMatch(transformedLocalConversation, /t\[32\]!==k/);
      assert.doesNotMatch(transformedLocalConversation, /t\[32\]=k/);
      continue;
    }
    if (patchSet.id === "codex-26.623.70822-4559") {
      const transform = findTransform(patchSet, "header");
      const transformed = transform([
        "function Jn(e){let t=(0,$n.c)(66),{className:n,desktopDeepLinkConversationId:r,title:i,onBack:a,trailing:o}=e,s=Re(),c=a??Xn,l=s.pathname===`/`,u=Yn,",
        "let x;t[35]!==c||t[36]!==g||t[37]!==i?(x=(0,$.jsx)(`div`,{className:`mr-3 line-clamp-1 flex min-w-0 flex-1 items-center gap-1 truncate`,style:{viewTransitionName:`header-title`},children:i?(0,$.jsxs)(`div`,{className:`flex min-w-0 flex-1 items-center gap-1`,children:[(0,$.jsx)(Qn,{onClick:c}),(0,$.jsx)(G,{color:`ghostActive`,type:`button`,onClick:u,className:`min-w-0 flex-1 truncate !px-0 !py-0 text-left text-sm text-token-foreground hover:!bg-transparent hover:opacity-80 electron:font-medium`,children:(0,$.jsx)(`span`,{className:`truncate`,children:i})})]}):(0,$.jsx)(`span`,{className:`text-token-description-foreground`,children:(0,$.jsx)(Zn,{mergedTasks:g,onBack:c,showBackButton:!0})})}),t[35]=c,t[36]=g,t[37]=i,t[38]=x):x=t[38];",
      ].join(""));

      assert.match(transformed, /function CPXThreadHeaderAccessories\(e\)/);
      assert.match(transformed, /CPX_headerContext=\{cwd:null,hostId:null,header:\{surface:`header`,titleText:typeof i==`string`\?i:null\}\}/);
      assert.match(transformed, /deps:\{jsx:\$\.jsx,jsxs:\$\.jsxs,Tooltip:Ae\}/);
      assert.match(transformed, /children:\[\(0,\$\.jsx\)\(Qn,\{onClick:c\}\),\(0,\$\.jsx\)\(G,\{color:`ghostActive`/);
      assert.match(transformed, /\}\),CPX_headerAccessories\]\}\):\(0,\$\.jsx\)\(`span`/);
      assert.doesNotMatch(transformed, /t\[\d+\]!==CPX_headerAccessories/);
      assert.doesNotMatch(transformed, /t\[\d+\]=CPX_headerAccessories/);

      const localConversationTransform = findTransform(patchSet, "local-conversation-page");
      const transformedLocalConversation = localConversationTransform([
        "function pi(e){let t=(0,W.c)(32),",
        "{conversationId:n,getConversationMarkdown:r,markdownParentConversationId:i,projectIcon:a,projectHoverCardContent:s,projectName:c,title:l,titleSuffix:u,cwd:d,canPin:f,hideForkActions:m}=e,g=f===void 0?!0:f,_=L(),v=h(),y;",
        "let x=xr(y,nt(o(Pt,n)).id),S;",
      ].join(""));

      assert.match(transformedLocalConversation, /function CPXBindThreadHeaderContext\(e\)/);
      assert.match(transformedLocalConversation, /l=CPXThreadHeaderTitle\(CPX_nativeTitle\)/);
      assert.match(transformedLocalConversation, /CPXBindThreadHeaderContext\(\{cwd:d,hostId:nt\(o\(Pt,n\)\)\.id/);
      assert.doesNotMatch(transformedLocalConversation, /CPXThreadHeaderAccessories/);
      continue;
    }
    if ((patchSet.id === "codex-26.623.141536-4753" || patchSet.id === "codex-26.623.101652-4674") || patchSet.id === "codex-26.623.81905-4598" || patchSet.id === "codex-26.623.61825-4548") {
      const transform = findTransform(patchSet, "header");
      const transformed = transform([
        "function Jn(e){let t=(0,$n.c)(66),{className:n,desktopDeepLinkConversationId:r,title:i,onBack:a,trailing:o}=e,s=Fe(),c=a??Xn,l=s.pathname===`/`,u=Yn,",
        "let x;t[35]!==c||t[36]!==g||t[37]!==i?(x=(0,$.jsx)(`div`,{className:`mr-3 line-clamp-1 flex min-w-0 flex-1 items-center gap-1 truncate`,style:{viewTransitionName:`header-title`},children:i?(0,$.jsxs)(`div`,{className:`flex min-w-0 flex-1 items-center gap-1`,children:[(0,$.jsx)(Qn,{onClick:c}),(0,$.jsx)(O,{color:`ghostActive`,type:`button`,onClick:u,className:`min-w-0 flex-1 truncate !px-0 !py-0 text-left text-sm text-token-foreground hover:!bg-transparent hover:opacity-80 electron:font-medium`,children:(0,$.jsx)(`span`,{className:`truncate`,children:i})})]}):(0,$.jsx)(`span`,{className:`text-token-description-foreground`,children:(0,$.jsx)(Zn,{mergedTasks:g,onBack:c,showBackButton:!0})})}),t[35]=c,t[36]=g,t[37]=i,t[38]=x):x=t[38];",
      ].join(""));

      assert.match(transformed, /function CPXThreadHeaderAccessories\(e\)/);
      assert.match(transformed, /CPX_headerContext=\{cwd:null,hostId:null,header:\{surface:`header`,titleText:typeof i==`string`\?i:null\}\}/);
      assert.match(transformed, /deps:\{jsx:\$\.jsx,jsxs:\$\.jsxs,Tooltip:ie\}/);
      assert.match(transformed, /children:\[\(0,\$\.jsx\)\(Qn,\{onClick:c\}\),\(0,\$\.jsx\)\(O,\{color:`ghostActive`/);
      assert.match(transformed, /\}\),CPX_headerAccessories\]\}\):\(0,\$\.jsx\)\(`span`/);

      const localConversationTransform = findTransform(patchSet, "local-conversation-page");
      const localConversationSource = patchSet.id === "codex-26.623.61825-4548"
        ? [
            "function mi(e){let t=(0,U.c)(32),",
            "{conversationId:n,getConversationMarkdown:r,markdownParentConversationId:i,projectIcon:a,projectHoverCardContent:o,projectName:s,title:c,titleSuffix:l,cwd:u,canPin:p,hideForkActions:h}=e,g=p===void 0?!0:p,_=R(),v=f(),y;",
            "let x=Sr(y,mt(d(tt,n)).id),S;",
          ].join("")
        : patchSet.id === "codex-26.623.81905-4598"
          ? [
              "function pi(e){let t=(0,W.c)(32),",
              "{conversationId:n,getConversationMarkdown:r,markdownParentConversationId:i,projectIcon:s,projectHoverCardContent:c,projectName:l,title:u,titleSuffix:d,cwd:f,canPin:m,hideForkActions:h}=e,g=m===void 0?!0:m,_=I(),",
              "let b=xr(y,E(L(i,n)).id),x;",
            ].join("")
        : [
            "function mi(e){let t=(0,U.c)(32),",
            "let t=(0,U.c)(32),{conversationId:n,getConversationMarkdown:r,markdownParentConversationId:i,projectIcon:a,projectHoverCardContent:o,projectName:s,title:c,titleSuffix:l,cwd:u,canPin:p,hideForkActions:h}=e,g=p===void 0?!0:p,_=R(),v=f(),y;",
            "let k;t[26]===Symbol.for(`react.memo_cache_sentinel`)?(k=null,t[26]=k):k=t[26];",
            "let A;return t[27]!==T||t[28]!==E||t[29]!==D||t[30]!==k?(A=(0,W.jsx)(`div`,{className:`draggable grid w-full min-w-0 grid-cols-[minmax(0,1fr)] items-center gap-x-4 electron:h-toolbar extension:py-row-y`,children:(0,W.jsxs)(`div`,{className:`flex min-w-0 items-center gap-2 truncate text-base electron:font-medium`,children:[T,E,D,k]})}),t[27]=T,t[28]=E,t[29]=D,t[30]=k,t[31]=A):A=t[31],A}",
          ].join("");
      const transformedLocalConversation = localConversationTransform(localConversationSource);

      if (patchSet.id === "codex-26.623.61825-4548") {
        assert.match(transformedLocalConversation, /function CPXBindThreadHeaderContext\(e\)/);
        assert.match(transformedLocalConversation, /c=CPXThreadHeaderTitle\(CPX_nativeTitle\)/);
        assert.match(transformedLocalConversation, /CPXBindThreadHeaderContext\(\{cwd:u,hostId:mt\(d\(tt,n\)\)\.id/);
        assert.doesNotMatch(transformedLocalConversation, /CPXThreadHeaderAccessories/);
        continue;
      }
      if (patchSet.id === "codex-26.623.81905-4598") {
        assert.match(transformedLocalConversation, /function CPXBindThreadHeaderContext\(e\)/);
        assert.match(transformedLocalConversation, /u=CPXThreadHeaderTitle\(CPX_nativeTitle\)/);
        assert.match(transformedLocalConversation, /CPXBindThreadHeaderContext\(\{cwd:f,hostId:E\(L\(i,n\)\)\.id/);
        assert.doesNotMatch(transformedLocalConversation, /CPXThreadHeaderAccessories/);
        continue;
      }

      assert.match(transformedLocalConversation, /function CPXThreadHeaderAccessories\(e\)/);
      assert.match(transformedLocalConversation, /CPX_headerContext=\{cwd:u,hostId:null/);
      assert.match(transformedLocalConversation, /surface:`local-conversation`/);
      assert.match(transformedLocalConversation, /projectName:s\?\?null/);
      assert.match(transformedLocalConversation, /deps:\{jsx:W\.jsx,jsxs:W\.jsxs,Tooltip:ge\}/);
      assert.match(transformedLocalConversation, /children:\[T,E,D,k\]/);
      assert.match(transformedLocalConversation, /let CPX_headerContext=.*k=CPXThreadHeaderAccessories/);
      continue;
    }

    if (
      patchSet.id === "chatgpt-26.715.72359-5718" ||
      patchSet.id === "chatgpt-26.715.72028-5706" ||
      patchSet.id === "chatgpt-26.715.71837-5702" ||
      patchSet.id === "chatgpt-26.715.61943-5628" ||
      patchSet.id === "chatgpt-26.715.52143-5591" ||
      patchSet.id === "chatgpt-26.715.31925-5551" ||
      patchSet.id === "chatgpt-26.715.31251-5538" ||
      patchSet.id === "chatgpt-26.715.21425-5488" ||
      patchSet.id === "chatgpt-26.715.21316-5484" ||
      patchSet.id === "chatgpt-26.707.31428-5059" ||
      patchSet.id === "chatgpt-26.707.62119-5211" ||
      patchSet.id === "chatgpt-26.707.61608-5200"
    ) continue;

    const transform = collectFileTransforms(patchSet)
      .find(([, candidate]) => candidate.name === "patchHeader")?.[1];
    if (!transform) continue;

    const transformed = transform(fakeHeaderBundle);
    if (patchSet.id.startsWith("chatgpt-")) {
      const expectedThreadContextFile =
        patchSet.id === "chatgpt-26.707.41301-5103"
          ? "app-initial~app-main~hotkey-window-thread-page~keyboard-shortcuts-settings~thread-app-shell~cf704xib-Do6EGhkP.js"
          : patchSet.id === "chatgpt-26.707.51957-5175"
            ? "app-initial~app-main~hotkey-window-thread-page~thread-app-shell-chrome~header~remote-conver~h59fr3q5-D_BrXX6W.js"
          : patchSet.id === "chatgpt-26.707.71524-5263"
            ? "app-initial~app-main~hotkey-window-thread-page~thread-app-shell-chrome~header~remote-conver~h59fr3q5-ByNuXnmY.js"
          : patchSet.id === "chatgpt-26.707.72221-5307"
            ? "app-initial~app-main~onboarding-page-CIkoyvFz.js"
          : patchSet.id === "chatgpt-26.707.91948-5440"
            ? "app-initial~app-main~onboarding-page-Bye92EOT.js"
          : "app-initial~app-main~hotkey-window-thread-page~thread-app-shell-chrome~header~remote-conver~h59fr3q5-DhcrijQk.js";
      const escapedThreadContextFile = expectedThreadContextFile.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      assert.match(transformed, new RegExp(`from"\\.\\/${escapedThreadContextFile}"`));
    } else {
      assert.match(transformed, /from"\.\/thread-context-B0hBrRyZ\.js"/);
    }
    assert.match(transformed, /a as CPX_readAtom/);
    assert.match(transformed, /t as CPX_Tooltip/);
    assert.match(transformed, /function CPXThreadHeaderAccessories\(e\)/);
    assert.match(transformed, /CodexPlusHost\.adapters/);
    assert.match(transformed, /CPX_headerContext=\{cwd:CPX_readAtom\(CPX_headerCwd\),hostId:CPX_readAtom\(CPX_headerHostId\)\}/);
    assert.match(transformed, /deps:\{jsx:Q\.jsx,jsxs:Q\.jsxs,Tooltip:CPX_Tooltip\}/);
    assert.match(transformed, /children:\[\(0,Q\.jsx\)\(mt,\{onClick:c\}\),\(0,Q\.jsx\)\(x,\{color:`ghostActive`/);
    assert.match(transformed, /\}\),CPX_headerAccessories\]\}\):\(0,Q\.jsx\)\(`span`/);
    assert.match(transformed, /children:\[S,C,A\]/);
    assert.doesNotMatch(transformed, /t\[\d+\]!==CPX_headerAccessories/);
    assert.doesNotMatch(transformed, /t\[\d+\]=CPX_headerAccessories/);

    if (!patchSet.id.startsWith("chatgpt-")) {
      const threadPageTransform = collectFileTransforms(patchSet).find(([filePath]) => filePath.includes("thread-page-header-D_hZ50OA"))?.[1];
      if (threadPageTransform) {
        const transformedThreadPageHeader = threadPageTransform(fakeThreadPageHeaderBundle);
        assert.doesNotMatch(transformedThreadPageHeader, /thread-context-B0hBrRyZ/);
        assert.doesNotMatch(transformedThreadPageHeader, /CPX_readAtom/);
        assert.match(transformedThreadPageHeader, /function CPXThreadHeaderAccessories\(e\)/);
        assert.match(transformedThreadPageHeader, /cwd:CPX_headerCwd/);
        assert.match(transformedThreadPageHeader, /hostId:p\?\.id\?\?null/);
        assert.match(transformedThreadPageHeader, /header:\{env:u,hostDisplayName:p\?\.display_name\?\?null/);
        assert.match(transformedThreadPageHeader, /deps:\{jsx:s\.jsx,jsxs:s\.jsxs\}/);
        assert.match(transformedThreadPageHeader, /children:\[v,y,b,l\]/);
        assert.match(transformedThreadPageHeader, /children:\[CPX_headerAccessories,f,S\]/);
        assert.doesNotMatch(transformedThreadPageHeader, /t\[\d+\]!==CPX_headerAccessories/);
        assert.doesNotMatch(transformedThreadPageHeader, /t\[\d+\]=CPX_headerAccessories/);
      }
    }

    if (!patchSet.id.startsWith("chatgpt-")) {
      const localConversationTransform = findTransform(patchSet, "local-conversation-page");
      const transformedLocalConversation = localConversationTransform(fakeLocalConversationPageBundle);
      if (transformedLocalConversation.includes("function CPXBindThreadHeaderContext(e)")) {
        assert.match(transformedLocalConversation, /CPXBindThreadHeaderContext\(\{cwd:c,hostId:u\(i\(O,n\)\)\.id/);
        assert.match(transformedLocalConversation, /o=CPXThreadHeaderTitle\(CPX_nativeTitle\)/);
        assert.doesNotMatch(transformedLocalConversation, /CPXThreadHeaderAccessories/);
        continue;
      }
      assert.match(transformedLocalConversation, /function CPXThreadHeaderAccessories\(e\)/);
      assert.match(transformedLocalConversation, /CPX_headerContext=\{cwd:c,hostId:u\(i\(O,n\)\)\.id/);
      assert.match(transformedLocalConversation, /surface:`local-conversation`/);
      assert.match(transformedLocalConversation, /deps:\{jsx:Z\.jsx,jsxs:Z\.jsxs\}/);
      assert.match(transformedLocalConversation, /children:\[F,I,L,CPX_headerAccessories,R\]/);
      assert.doesNotMatch(transformedLocalConversation, /t\[\d+\]!==CPX_headerAccessories/);
      assert.doesNotMatch(transformedLocalConversation, /t\[\d+\]=CPX_headerAccessories/);
    }
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

  for (const patchSet of patchSets.filter((patchSet) => [
    "codex-26.616.81150-4306",
    "codex-26.616.71553-4265",
    "codex-26.616.51431-4212",
    "codex-26.616.41845-4198",
  ].includes(patchSet.id))) {
    assert.equal(patchSet.runtimeConfig.mermaidCoreAsset, "mermaid.core-C39d6FHU.js");
    const transform = collectFileTransforms(patchSet).find(
      ([filePath]) => filePath.includes("mermaid-diagram-shell"),
    )?.[1];
    assert.equal(typeof transform, "function", `${patchSet.id} has mermaid shell transform`);

    const transformed = transform(fakeBundle);
    assert.match(transformed, /function CPXMermaidDiagramProps\(e\)\{return window\.CodexPlus\?\.ui\?\.mermaid\?\.diagramProps\?\.\(e\)\}/);
    assert.match(transformed, /\.\.\.CPXMermaidDiagramProps\(\{code:i\}\),"data-wide-markdown-block":E/);
    assert.doesNotMatch(transformed, /"data-codex-plus-mermaid-content":""/);
    assert.doesNotMatch(transformed, /codex-plus-mermaid-modal/);

    if (patchSet.id === "codex-26.616.51431-4212" || patchSet.id === "codex-26.616.41845-4198") {
      continue;
    }

    const transforms = collectFileTransforms(patchSet);
    const preloadTransform = transforms.find(([filePath]) => filePath === ".vite/build/preload.js")?.[1];
    assert.equal(typeof preloadTransform, "function", `${patchSet.id} has preload transform`);
    const preload = preloadTransform(
      "e.contextBridge.exposeInMainWorld(`codexWindowType`,m),e.contextBridge.exposeInMainWorld(`electronBridge`,D),typeof window<`u`",
    );
    assert.match(preload, /exposeInMainWorld\(`codexPlusHostBridge`,\{request:\(t,n\)=>e\.ipcRenderer\.invoke\(`codex_plus:native-request`,\{method:t,params:n\}\)\}\)/);

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

  const currentPatchSet = patchSets.find((patchSet) => patchSet.id === "codex-26.623.81905-4598");
  const currentTransforms = collectFileTransforms(currentPatchSet).filter(
    ([filePath]) => filePath === "webview/assets/app-initial~app-main~onboarding-page-DewXrzLR.js",
  );
  assert.ok(currentTransforms.length > 0, "current patch has verified mermaid renderer transform");
  const currentBundle = [
    "function r6t(e){let t=(0,i6t.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e",
    "let s;t[1]!==a||t[2]!==r||t[3]!==i?(s=(0,Hq.jsx)(dZt,{diffMode:a,setTabState:r,tabState:i}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
    "function nun(e){let t=(0,run.c)(94),",
    "return(0,pZ.jsx)(`form`,{className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),v()},children:",
    "ge=B?(0,hZ.jsx)(`div`,{className:`w-full p-px`,children:(0,hZ.jsx)(eun,{cwd:x??null,hostId:S,initialMessage:z.trim(),onCancel:()=>{oe(null)},onDraftChange:e=>{oe(e)},onSubmit:ce})}):ne?(0,hZ.jsx)(`div`,{\"data-user-message-bubble\":!0,role:I?`button`:void 0,",
    "function COt(e){let t=(0,wOt.c)(19),",
    'E=(0,yB.jsx)(`div`,{ref:d,className:C,"data-wide-markdown-block":w,"data-wide-markdown-block-kind":c,children:T})',
  ].join("");
  const currentTransformed = currentTransforms
    .map(([, transform]) => {
      try {
        return transform(currentBundle);
      } catch {
        return "";
      }
    })
    .find((text) => text.includes("CPXMermaidDiagramProps"));
  assert.equal(typeof currentTransformed, "string", "current patch has verified mermaid renderer transform");
  assert.match(currentTransformed, /function CPXMermaidDiagramProps\(e\)\{return window\.CodexPlus\?\.ui\?\.mermaid\?\.diagramProps\?\.\(e\)\}/);
  assert.match(currentTransformed, /\.\.\.CPXMermaidDiagramProps\(\{code:a\}\),className:C/);

  const patch101652 = patchSets.find((patchSet) => (patchSet.id === "codex-26.623.141536-4753" || patchSet.id === "codex-26.623.101652-4674"));
  const transform101652 = collectFileTransforms(patch101652).find(
    ([_filePath, transform]) => transform.name === "patchMermaidDiagramShell",
  )?.[1];
  assert.equal(typeof transform101652, "function", "101652 patch has mermaid renderer transform");
  const bundle101652 = [
    "function m_(e){let t=(0,h_.c)(19),{Renderer:n,allowWideBlocks:r,className:i,code:a,fallback:o,isCodeFenceOpen:s,wideBlockKind:c}=e,",
    "E=(0,__.jsx)(`div`,{ref:d,className:C,\"data-wide-markdown-block\":w,\"data-wide-markdown-block-kind\":c,children:T})",
  ].join("");
  const transformed101652 = transform101652(bundle101652);
  assert.match(transformed101652, /function CPXMermaidDiagramProps\(e\)\{return window\.CodexPlus\?\.ui\?\.mermaid\?\.diagramProps\?\.\(e\)\}/);
  assert.match(transformed101652, /\.\.\.CPXMermaidDiagramProps\(\{code:a\}\),className:C/);

  const chatGptPatchSet = patchSets.find((patchSet) => patchSet.id === "chatgpt-26.707.41301-5103");
  const chatGptTransform = collectFileTransforms(chatGptPatchSet).find(
    ([filePath, transform]) => filePath === "webview/assets/mermaid-diagram-BTm9waeC.js" && transform.name === "patchMermaidDiagramShell",
  )?.[1];
  assert.equal(typeof chatGptTransform, "function", "ChatGPT patch has mermaid renderer transform");
  const chatGptBundle = [
    "function cr({blockRef:e,code:t,isCodeFenceOpen:r,isDark:a,isVisible:s,onError:c,onRendered:l,renderKey:d}){",
    "(0,X.jsxs)(`div`,{className:`relative`,\"data-markdown-copy\":`code-block`,\"data-markdown-copy-text\":T,children:[",
  ].join("");
  const chatGptTransformed = chatGptTransform(chatGptBundle);
  assert.match(chatGptTransformed, /function CPXMermaidDiagramProps\(e\)\{return window\.CodexPlus\?\.ui\?\.mermaid\?\.diagramProps\?\.\(e\)\}/);
  assert.match(chatGptTransformed, /\.\.\.CPXMermaidDiagramProps\(\{code:t\}\),className:`relative`/);

  const pluginSource = fs.readFileSync(path.join(__dirname, "../src/runtime/plugins/mermaidFullscreen.js"), "utf8");
  const nativeMainSource = fs.readFileSync(path.join(__dirname, "../src/runtime/host/nativeMain.js"), "utf8");
  const commonPatches = fs.readFileSync(path.join(__dirname, "../src/patches/lib/common-patches.js"), "utf8");
  assert.match(pluginSource, /function openViewer/);
  assert.match(pluginSource, /CodexPlusHost\.adapters\.native\.request\("mermaid\/openViewer", \{ html \}\)/);
  assert.match(pluginSource, /window\.open\(liveUrl, "_blank", "noopener"\)/);
  assert.match(pluginSource, /function hostFor\(container\)/);
  assert.match(pluginSource, /container\.closest\('\[data-markdown-copy="code-block"\]'\) \|\| container/);
  assert.match(pluginSource, /container\.parentElement\?\.querySelector\(":scope > pre\.sr-only"\)\?\.textContent/);
  assert.match(pluginSource, /host\.setAttribute\("data-codex-plus-mermaid-host", ""\)/);
  assert.match(pluginSource, /host\.prepend\(control\)/);
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
  assert.match(pluginSource, /#theme-toggle\{display:inline-flex;width:58px;align-items:center;justify-content:center\}/);
  assert.match(pluginSource, /:root\[data-theme="dark"\] #theme-toggle:not\(:disabled\):hover\{background:#fff;color:#111/);
  assert.match(pluginSource, /:root\[data-theme="light"\] #theme-toggle:not\(:disabled\):hover\{background:#0a0a0a;color:#fff/);
  assert.match(pluginSource, /function previewThemeToggle\(\) \{/);
  assert.match(pluginSource, /if \(!themeToggle\.disabled\) themeToggle\.textContent = darkTheme \? "Light" : "Dark"/);
  assert.match(pluginSource, /function restoreThemeToggle\(\) \{/);
  assert.match(pluginSource, /themeToggle\.textContent = darkTheme \? "Dark" : "Light"/);
  assert.match(pluginSource, /themeToggle\.addEventListener\("click", \(\) => \{ darkTheme = !darkTheme; applyThemeChrome\(\); renderQueued = true; renderFromSource\(\); \}\)/);
  assert.match(pluginSource, /themeToggle\.addEventListener\("mouseenter", previewThemeToggle\)/);
  assert.match(pluginSource, /themeToggle\.addEventListener\("mouseleave", restoreThemeToggle\)/);
  assert.match(pluginSource, /themeToggle\.addEventListener\("focus", previewThemeToggle\)/);
  assert.match(pluginSource, /themeToggle\.addEventListener\("blur", restoreThemeToggle\)/);
  assert.match(pluginSource, /id="open-live"/);
  assert.match(pluginSource, /https:\/\/mermaid\.live\/edit#base64:/);
  assert.match(pluginSource, /<button id="close"[\s\S]*<button id="copy-source" type="button" aria-label="Copy Mermaid source" title="Copy Mermaid source"><\/button>/);
  assert.match(pluginSource, /#copy-source::before,#copy-source::after/);
  assert.match(pluginSource, /await window\.CodexPlusHost\.adapters\.clipboard\.writeText\(source\)/);
  assert.doesNotMatch(pluginSource, /navigator\.clipboard|textarea\.value = source|execCommand/);
  assert.match(pluginSource, /copySource\.addEventListener\("click", copySourceToClipboard\)/);
  assert.doesNotMatch(pluginSource, /writeText\(sourceForTheme\(\)\)/);
  assert.match(pluginSource, /function mermaidCoreAsset\(\)/);
  assert.match(pluginSource, /CodexPlus\.config\?\.mermaidCoreAsset \|\| "mermaid\.core\.js"/);
  assert.match(pluginSource, /assetUrl\(mermaidCoreAsset\(\)\)/);
  assert.doesNotMatch(pluginSource, /mermaid\.core-eIokQLcr\.js/);
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

  for (const patchSet of codexPatchSets) {
    const appShellFile = findTransformPath(patchSet, "app-shell");
    const errorBoundaryFile = findTransformPath(patchSet, "error-boundary");
    const appShell = transformFile(patchSet, appShellFile, fakeAppShellBundle);
    const errorBoundary = transformFile(patchSet, errorBoundaryFile, fakeErrorBoundaryBundle);

    assert.match(appShell, /var CPXDiagnosticDetails=function\(e\)\{return window\.CodexPlus\?\.ui\?\.errors\?\.renderDetails\?\.\(e\)\?\?null\};/);
    assert.match(appShell, /CPXDiagnosticDetails\(\{jsx:Q\.jsx,error:e\.error\}\)/);
    assert.doesNotMatch(appShell, /t\[3\]===e\.error/);
    assert.doesNotMatch(appShell, /t\[3\]=e\.error/);
    assert.doesNotMatch(appShell, /t\[3\]===CPX_error/);
    assert.doesNotMatch(appShell, /t\[3\]=CPX_error/);
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

test("141536 app shell diagnostic patch handles reload-only fallback", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.141536-4753");
  const transform = findTransform(patchSet, "app-shell");
  const fakeBundle = [
    "function Eie(){let e=(0,oA.c)(3),t,n;",
    "children:[t,n,(0,sA.jsx)(lx,{onClick:Die,children:(0,sA.jsx)(X,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
  ].join("");

  const transformed = transform(fakeBundle);

  assert.match(transformed, /var CPXDiagnosticDetails=function/);
  assert.match(transformed, /CPXDiagnosticDetails\(\{jsx:sA\.jsx,error:null\}\)/);
});

test("review patch mounts repository mux before main branch selection", () => {
  const fakeBundle = [
    'import{r as vi,t as yi}from"./dropdown-CTBRoADH.js";',
    "function uf({cwd:e,fileEntries:t,generatedPathsReady:n,hasUnhandledAttributesFiles:r,isCappedMode:i,repositorySource:a,reviewSummarySource:o}){",
    "return {children:d&&!u&&c==null?(0,$.jsx)(Oa,{}):(0,$.jsx)(of,{diffRefs:t,diffMode:e,isCappedMode:d,reviewDiffMetrics:g,showReviewGitActions:v})}",
    "}",
    "function Ap(e){let t=(0,Z.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e,a=l(Nt),o;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(o=(0,$.jsx)(`div`,{className:`min-h-0 max-w-full min-w-0`,children:(0,$.jsx)(wp,{})}),t[0]=o):o=t[0];let s;t[1]!==a||t[2]!==r||t[3]!==i?(s=(0,$.jsx)(Tf,{diffMode:a,setTabState:r,tabState:i}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];let c;return c}",
  ].join("");

  for (const patchSet of codexPatchSets) {
    if (patchSet.id === "codex-26.623.31921-4452") {
      const transform = findTransform(patchSet, "review");
      const transformed = transform([
        "function WPe(e){let t=(0,xN.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e",
        "let s;t[1]!==a||t[2]!==r||t[3]!==i?(s=(0,SN.jsx)(xje,{diffMode:a,setTabState:r,tabState:i}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
      ].join(""));

      assert.match(transformed, /CodexPlusHost\.adapters\.review/);
      assert.match(transformed, /CPXRM=e=>self\.CodexPlusHost\.adapters\.review\.renderBodyFromHost\(e,\[SN,typeof VE!==`undefined`\?VE:null,Ie,Y,xn,null,null,null,null,Qo,ce,xje,null,null,null,null,null,null,null,Wu,jT\]\)/);
      assert.match(
        transformed,
        /s=\(0,SN\.jsx\)\(CPXRM,\{mainReviewContent:\(0,SN\.jsx\)\(xje,\{diffMode:a,setTabState:r,tabState:i\}\),diffMode:a,setTabState:r,tabState:i\}\)/,
      );
      assert.doesNotMatch(transformed, /plugins\?\.get\(`nestedRepositories`\)\?\.exports/);
      assert.doesNotMatch(transformed, /function CPXBranchPicker/);
      assert.doesNotMatch(transformed, /function CPXRepoPatchGroup/);
      assert.doesNotMatch(transformed, /function CPXRepoDiffBody/);
      continue;
    }
    if (patchSet.id === "codex-26.623.41415-4505") {
      const transform = findTransform(patchSet, "review");
      const transformed = transform([
        "function oDn(e){let t=(0,sDn.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e",
        "let s;t[1]!==a||t[2]!==r||t[3]!==i?(s=(0,JX.jsx)(cxn,{diffMode:a,setTabState:r,tabState:i}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];let c;",
      ].join(""));

      assert.match(transformed, /CodexPlusHost\.adapters\.review/);
      assert.match(transformed, /CPXRM=e=>self\.CodexPlusHost\.adapters\.review\.renderBodyFromHost\(e,\[JX,typeof PJ!==`undefined`\?PJ:null,Kn,Nn,Xd,SA,CA,wA,null,Fe,Ue,cxn/);
      assert.match(
        transformed,
        /s=\(0,JX\.jsx\)\(CPXRM,\{mainReviewContent:\(0,JX\.jsx\)\(cxn,\{diffMode:a,setTabState:r,tabState:i\}\),diffMode:a,setTabState:r,tabState:i\}\)/,
      );
      assert.doesNotMatch(transformed, /function CPXBranchPicker/);
      assert.doesNotMatch(transformed, /function CPXRepoPatchGroup/);
      assert.doesNotMatch(transformed, /function CPXRepoDiffBody/);
      continue;
    }
    if (patchSet.id === "codex-26.623.42026-4514") {
      const transform = findTransform(patchSet, "review");
      const transformed = transform([
        "function mQe(e){let t=(0,hQe.c)(20),{diffMode:n,setTabState:r,tabState:i}=e",
        "_=(0,tR.jsx)(JZe,{diffMode:n,diffRefs:u,isFileTreeOpen:s,isReviewExpanded:p,setTabState:r,setScrollContainerRef:h,tabState:i}),t[9]=n,t[10]=u,t[11]=s,t[12]=p,t[13]=h,t[14]=r,t[15]=i,t[16]=_):_=t[16];",
      ].join(""));

      assert.match(transformed, /CodexPlusHost\.adapters\.review/);
      assert.match(transformed, /CPXRM=e=>self\.CodexPlusHost\.adapters\.review\.renderBodyFromHost\(e,\[tR,eR,B,X,Z,jw,Mw,Nw,null,fu,ze,JZe,za,Ia,null,null,null,null,null,ph,Hre\]\)/);
      assert.match(
        transformed,
        /_=\(0,tR\.jsx\)\(CPXRM,\{mainReviewContent:\(0,tR\.jsx\)\(JZe,\{diffMode:n,diffRefs:u,isFileTreeOpen:s,isReviewExpanded:p,setTabState:r,setScrollContainerRef:h,tabState:i\}\),diffMode:n,setTabState:r,tabState:i\}\)/,
      );
      assert.doesNotMatch(transformed, /plugins\?\.get\(`nestedRepositories`\)\?\.exports/);
      assert.doesNotMatch(transformed, /function CPXBranchPicker/);
      assert.doesNotMatch(transformed, /function CPXRepoPatchGroup/);
      assert.doesNotMatch(transformed, /function CPXRepoDiffBody/);
      continue;
    }
    if (patchSet.id === "codex-26.623.70822-4559") {
      const transform = findTransform(patchSet, "review");
      const transformed = transform([
        "function aOe(e){let t=(0,gS.c)(20),{diffMode:n,setTabState:r,tabState:i}=e",
        "_=(0,_S.jsx)(UDe,{diffMode:n,diffRefs:u,isFileTreeOpen:s,isReviewExpanded:p,setTabState:r,setScrollContainerRef:h,tabState:i}),t[9]=n,t[10]=u,t[11]=s,t[12]=p,t[13]=h,t[14]=r,t[15]=i,t[16]=_):_=t[16];",
      ].join(""));

      assert.match(transformed, /CodexPlusHost\.adapters\.review/);
      assert.match(transformed, /CPXRM=e=>self\.CodexPlusHost\.adapters\.review\.renderBodyFromHost\(e,\[_S,hS,I,Z,Gc,Aa,Da,Ci,null,Ou,Dt,UDe,No,null,null,null,null,null,null,_n,HEe\]\)/);
      assert.match(
        transformed,
        /_=\(0,_S\.jsx\)\(CPXRM,\{mainReviewContent:\(0,_S\.jsx\)\(UDe,\{diffMode:n,diffRefs:u,isFileTreeOpen:s,isReviewExpanded:p,setTabState:r,setScrollContainerRef:h,tabState:i\}\),diffMode:n,setTabState:r,tabState:i\}\)/,
      );
      assert.doesNotMatch(transformed, /plugins\?\.get\(`nestedRepositories`\)\?\.exports/);
      assert.doesNotMatch(transformed, /function CPXBranchPicker/);
      assert.doesNotMatch(transformed, /function CPXRepoPatchGroup/);
      assert.doesNotMatch(transformed, /function CPXRepoDiffBody/);
      continue;
    }
    if (patchSet.id === "codex-26.623.141536-4753") {
      const transform = findTransform(patchSet, "review");
      const transformed = transform([
        "import{n as e,r as t,s as n,t as r}from\"./rolldown-runtime-Czos8NxU.js\";",
        "function YPt(e){let t=(0,XPt.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e",
        "let s;t[1]!==a||t[2]!==r||t[3]!==i?(s=(0,yK.jsx)(ZDt,{diffMode:a,setTabState:r,tabState:i}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
      ].join(""));

      assert.match(transformed, /CodexPlusHost\.adapters\.review/);
      assert.match(transformed, /CPXRM=e=>self\.CodexPlusHost\.adapters\.review\.renderBodyFromHost\(e,\[yK,typeof BPt!==`undefined`\?BPt:null,Hn,X,Tu,OE,kE,AE,null,Ti,Ot,ZDt,null,null,null,null,null,CPXBranchPickerDropdownContent,null,TE,pht\]\)/);
      assert.match(
        transformed,
        /s=\(0,yK\.jsx\)\(CPXRM,\{mainReviewContent:\(0,yK\.jsx\)\(ZDt,\{diffMode:a,setTabState:r,tabState:i\}\),diffMode:a,setTabState:r,tabState:i\}\)/,
      );
      assert.doesNotMatch(transformed, /plugins\?\.get\(`nestedRepositories`\)\?\.exports/);
      assert.doesNotMatch(transformed, /function CPXBranchPicker/);
      assert.doesNotMatch(transformed, /function CPXRepoPatchGroup/);
      assert.doesNotMatch(transformed, /function CPXRepoDiffBody/);
      continue;
    }
    if (patchSet.id === "codex-26.623.101652-4674") {
      const transform = findTransform(patchSet, "review");
      const transformed = transform([
        "function s6e(e){let t=(0,c6e.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e",
        "let s;t[1]!==a||t[2]!==r||t[3]!==i?(s=(0,gz.jsx)(kQe,{diffMode:a,setTabState:r,tabState:i}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
      ].join(""));

      assert.match(transformed, /CodexPlusHost\.adapters\.review/);
      assert.match(transformed, /CPXRM=e=>self\.CodexPlusHost\.adapters\.review\.renderBodyFromHost\(e,\[gz,PQe,Ms,Y,os,yC,bC,xC,null,S,nr,kQe,null,null,null,null,null,null,null,mC,tGe\]\)/);
      assert.match(
        transformed,
        /s=\(0,gz\.jsx\)\(CPXRM,\{mainReviewContent:\(0,gz\.jsx\)\(kQe,\{diffMode:a,setTabState:r,tabState:i\}\),diffMode:a,setTabState:r,tabState:i\}\)/,
      );
      assert.doesNotMatch(transformed, /plugins\?\.get\(`nestedRepositories`\)\?\.exports/);
      assert.doesNotMatch(transformed, /function CPXBranchPicker/);
      assert.doesNotMatch(transformed, /function CPXRepoPatchGroup/);
      assert.doesNotMatch(transformed, /function CPXRepoDiffBody/);
      continue;
    }
    if ((patchSet.id === "codex-26.623.141536-4753" || patchSet.id === "codex-26.623.101652-4674") || patchSet.id === "codex-26.623.81905-4598" || patchSet.id === "codex-26.623.61825-4548") {
      const transform = findTransform(patchSet, "review");
      const transformed = transform([
        "function rI(e){let t=(0,iI.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e",
        "let s;t[1]!==a||t[2]!==r||t[3]!==i?(s=(0,aI.jsx)(HE,{diffMode:a,setTabState:r,tabState:i}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
      ].join(""));

      assert.match(transformed, /CodexPlusHost\.adapters\.review/);
      assert.match(transformed, /CPXRM=e=>self\.CodexPlusHost\.adapters\.review\.renderBodyFromHost\(e,\[aI,fE,We,K,za,ul,cl,ac,dl,re,je,dE,kn,null,null,null,null,null,null,Ou,rs\]\)/);
      assert.match(
        transformed,
        /s=\(0,aI\.jsx\)\(CPXRM,\{mainReviewContent:\(0,aI\.jsx\)\(HE,\{diffMode:a,setTabState:r,tabState:i\}\),diffMode:a,setTabState:r,tabState:i\}\)/,
      );
      assert.doesNotMatch(transformed, /plugins\?\.get\(`nestedRepositories`\)\?\.exports/);
      assert.doesNotMatch(transformed, /function CPXBranchPicker/);
      assert.doesNotMatch(transformed, /function CPXRepoPatchGroup/);
      assert.doesNotMatch(transformed, /function CPXRepoDiffBody/);
      continue;
    }

    const names = versionedNames(patchSet);
    const transform = findTransform(patchSet, "review");

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
  assert.doesNotMatch(pluginSource, /ReviewToolbarBoundary/);
  assert.doesNotMatch(pluginSource, /\bReviewToolbar\b/);
  assert.match(pluginSource, /parseDiff\(diffText\)/);
  assert.match(pluginSource, /createElement\(DiffCard/);
  assert.match(pluginSource, /mt-3 clear-both border-b border-token-border-default/);
  assert.match(pluginSource, /jsx\(BranchPicker, \{ repo, hostConfig, baseBranch, setBaseBranch, currentBranch, deps \}\)/);
  assert.match(pluginSource, /data-codex-plus-repo-branch-count/);
  assert.match(pluginSource, /data-codex-plus-repo-branch-option/);
  assert.doesNotMatch(pluginSource, /jsx\("select"/);
  assert.match(pluginSource, /mergeBranches\(currentBranches, branches, searchedBranches\)/);
  assert.match(pluginSource, /jsx\(\s*RepoPatchGroup,/);
  const directRepoPatchGroupCalls = pluginSource
    .split("\n")
    .filter((line) => /RepoPatchGroup\(\s*(\{|$)/.test(line) && !line.includes("function RepoPatchGroup"));
  assert.deepEqual(directRepoPatchGroupCalls, []);
  assert.match(pluginSource, /method: "codex-plus-branches"/);
  assert.doesNotMatch(pluginSource, /method: "recent-branches"/);
  assert.doesNotMatch(pluginSource, /method: "search-branches"/);
  assert.match(pluginSource, /function workerRequest/);
  assert.match(pluginSource, /function reviewDeps/);
  assert.match(pluginSource, /gitRequest: typeof deps\.gitRequest === "function" \? deps\.gitRequest : workerGitRequest/);
  assert.match(pluginSource, /pathValue: typeof deps\.pathValue === "function" \? deps\.pathValue : hostPathValue/);
  assert.match(pluginSource, /sendWorkerMessageFromView\(workerId, \{ type: "worker-request", workerId, request \}\)/);
  assert.match(pluginSource, /subscribeToWorkerMessages\(workerId/);
  assert.doesNotMatch(pluginSource, /api\.native\.request\("repository-targets"/);
});

test("51957 review hook binds every required nested-review host dependency", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.51957-5175");
  const transform = findTransform(patchSet, "review");
  const transformed = transform([
    'import{n as e,r as t,s as n,t as r}from"./rolldown-runtime-Czos8NxU.js";',
    "function oSe(e){let t=(0,xN.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e",
    "s=(0,SN.jsx)(nie,{children:(0,SN.jsx)(Rve,{diffMode:a,setTabState:r,tabState:i})}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
  ].join(""));

  assert.match(
    transformed,
    /renderBodyFromHost\(e,\[SN,n\(i\(\)\),null,null,null,null,null,null,null,va,K,Rve,null,null,null,null,null,CPXBranchPickerDropdownContent,null,Wn,lE\]\)/,
  );
});

test("51957 uses the standalone-safe Mermaid core shared with the next newest versions", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.51957-5175");

  assert.equal(patchSet.runtimeConfig.mermaidCoreAsset, "mermaid.core-C6gAAJlL.js");
});

test("worker patch allows codex plus branch picker read-only branch requests", () => {
  const fakeWorker = [
    "function pae(e,t){return e.queryClient.fetchQuery}",
    "case`submodule-paths`:a=X({paths:await pae(this.gitManager.getWorktreeRepositoryForRoot(e.params.root,r),t.signal)});break;",
    "function u2({requestKind:e,source:t}){return l2.has(e??``)||d2(t)}",
    "case`commit-message-diff`:case`submodule-paths`:case`cat-file`:",
  ].join("");

  for (const patchSet of codexPatchSets) {
    const transform = collectFileTransforms(patchSet).find(([filePath]) => filePath === ".vite/build/worker.js")?.[1];

    assert.equal(typeof transform, "function", `${patchSet.id} has worker transform`);

    const transformed = transform(fakeWorker);

    assert.match(transformed, /case`repository-targets`:a=X\(await CPXW\.repositoryTargetsFromHost/);
    assert.match(transformed, /case`codex-plus-branches`:a=X\(await CPXW\.listBranches/);
    assert.match(transformed, /case`codex-plus-current-branch`:a=X\(await CPXW\.currentBranch/);
    assert.match(transformed, /case`commit-message-diff`:case`codex-plus-trace`:case`repository-targets`:case`codex-plus-branches`:case`codex-plus-current-branch`:case`submodule-paths`:case`cat-file`:/);
    assert.match(transformed, /const CPXW=require\("\.\/codex-plus-worker\.js"\)/);
    assert.match(
      transformed,
      /function u2\(\{requestKind:e,source:t\}\)\{return l2\.has\(e\?\?``\)\|\|d2\(t\)\|\|CPXW\.isReadOnlyBranchRequest\(e,t\)\}/,
    );
  }

  const workerSource = fs.readFileSync(path.join(__dirname, "../src/runtime/host/worker.js"), "utf8");
  assert.match(workerSource, /function repositoryTargets/);
  assert.match(workerSource, /function repositoryTargetsFromHost/);
  assert.match(workerSource, /function listBranches/);
  assert.match(workerSource, /function currentBranch/);
  assert.match(workerSource, /function isReadOnlyBranchRequest/);
  assert.match(workerSource, /codex-plus-branches/);
  assert.match(workerSource, /codex-plus-current-branch/);
});

test("codex plus worker branch methods return normalized local branches", async () => {
  const { currentBranch, isReadOnlyBranchRequest, listBranches } = require("../src/runtime/host/worker");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-plus-branches-"));
  childProcess.execFileSync("git", ["init", "-b", "main"], { cwd: tmpDir, stdio: "ignore" });
  childProcess.execFileSync("git", ["config", "user.email", "codex-plus@example.invalid"], { cwd: tmpDir, stdio: "ignore" });
  childProcess.execFileSync("git", ["config", "user.name", "Codex Plus"], { cwd: tmpDir, stdio: "ignore" });
  fs.writeFileSync(path.join(tmpDir, "README.md"), "fixture\n");
  childProcess.execFileSync("git", ["add", "README.md"], { cwd: tmpDir, stdio: "ignore" });
  childProcess.execFileSync("git", ["commit", "-m", "fixture"], { cwd: tmpDir, stdio: "ignore" });
  childProcess.execFileSync("git", ["branch", "audit-alpha-base"], { cwd: tmpDir, stdio: "ignore" });
  childProcess.execFileSync("git", ["branch", "audit-shared-base"], { cwd: tmpDir, stdio: "ignore" });

  const all = await listBranches({ root: tmpDir, limit: 100 });
  assert.deepEqual(
    all.branches.map((branch) => branch.name).sort(),
    ["audit-alpha-base", "audit-shared-base", "main"],
  );

  const filtered = await listBranches({ root: tmpDir, query: "alpha", limit: 100 });
  assert.deepEqual(filtered.branches, [{ name: "audit-alpha-base" }]);
  assert.deepEqual(await currentBranch({ root: tmpDir }), { branch: "main" });
  assert.equal(isReadOnlyBranchRequest("codex-plus-branches", "codex_plus_review"), true);
  assert.equal(isReadOnlyBranchRequest("codex-plus-current-branch", "codex_plus_review"), true);
  assert.equal(isReadOnlyBranchRequest("recent-branches", "codex_plus_review"), false);
});

test("appearance settings patch adds user bubble colors and project colors only", () => {
  const fakeSettingsBundle = [
    "chromeThemeCodeFont:{id:`settings.general.appearance.chromeTheme.codeFontFamily.short`,defaultMessage:`Code font`,description:`Short label for the code font input`},pointerCursors:",
    "function tn({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){",
    "let r=a(s),i=N(),o=i.formatMessage(Q.chromeThemeAccent),c=i.formatMessage(Q.chromeThemeBackground),l=i.formatMessage(Q.chromeThemeForeground),u=i.formatMessage(Q.chromeThemeContrast),d=i.formatMessage(Q.chromeThemeTranslucentSidebar),",
    "children:[D.map(e=>(0,Z.jsx)(J,{control:(0,Z.jsx)(sn,{ariaLabel:e.ariaLabel,value:x[e.role],onChange:t=>{k(e.role,t)}}),label:e.label,variant:`nested`},e.role)),O.map",
  ].join("");

  for (const patchSet of codexPatchSets) {
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

test("141536 appearance settings patch handles current theme row shape", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.141536-4753");
  assert.ok(patchSet, "141536 patch set exists");
  const settingsFile = findTransformPath(patchSet, "general-settings");
  const fakeSettingsBundle = [
    "chromeThemeCodeFont:{id:`settings.general.appearance.chromeTheme.codeFontFamily.short`,defaultMessage:`Code font`,description:`Short label for the code font input`},pointerCursors:",
    "function Ir({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){",
    "let r=F(d),i=H(),a=i.formatMessage(J.chromeThemeAccent),o=i.formatMessage(J.chromeThemeBackground),s=i.formatMessage(J.chromeThemeForeground),c=i.formatMessage(J.chromeThemeContrast),l=i.formatMessage(J.chromeThemeTranslucentSidebar),",
    "children:[E.map(e=>(0,Y.jsx)(z,{control:(0,Y.jsx)(Vr,{ariaLabel:e.ariaLabel,value:b[e.role],onChange:t=>{O(e.role,t)}}),label:e.label,variant:`nested`},e.role)),D.map",
  ].join("");

  const transformed = transformFile(patchSet, settingsFile, fakeSettingsBundle);

  assert.match(transformed, /ui\?\.settings\?\.appearance\?\.renderRows/);
  assert.match(transformed, /SettingRow:z/);
  assert.match(transformed, /\.\.\.CPXAppearanceRows\(n\),D\.map/);
});

test("app protocol patch serves the app shell for settings deep routes", async () => {
  const fakeProtocolBundle = [
    "const o=require('path');",
    "const t={Es:e=>e,Cs:o.isAbsolute,Ds:e=>e};",
    "const he=`index.html`,ge=`/@fs`,pe=`-`,me=`fs`;",
    "function Me(e){return e.split(`/`).some(e=>e===`..`||/^\\.\\.[. ]+$/.test(e))}",
    "function je(e){if(!e.startsWith(`app://`))return null;let t=e.slice(6),n=t.indexOf(`/`);return(n>=0?t.slice(n):`/`).split(`?`)[0]?.split(`#`)[0]??null}",
    "function Ne(){return null}",
    "function xe(e,t){let n=new URL(`app://-/index.html`);return e&&n.searchParams.set(`initialRoute`,e),t?.mcpAppSandboxDevtools===!0&&n.searchParams.set(`mcpAppSandboxDevtools`,`1`),n.toString()}",
    "function Se(e,n){let r=je(e);if(!r)return null;try{if(Me(t.Es(decodeURIComponent(r))))return null}catch{return null}let i=new URL(e);if(i.protocol!==`app:`)return null;if(i.pathname.startsWith(ge))return i.host===me?Ne(i.pathname):null;if(i.host&&i.host!==pe)return null;let a=t.Es(i.pathname?i.pathname:`/`),s=a.startsWith(`/`)?a.slice(1):a,c=o.posix.normalize(s);if(c===`.`||c===``)return(0,o.join)(n,he);if(c.startsWith(`..`)||c.includes(`/..`))return null;let l=(0,o.join)(n,...c.split(`/`)),u=(0,o.relative)(n,l);return u.startsWith(`..`)||(0,o.isAbsolute)(u)?null:l}",
    "function we(e){Oe(),r.protocol.handle(`app`,async t=>{let n=Se(t.url,e);return n?Pe(n)?Fe(t,n):process.platform===`win32`?r.net.fetch((0,b.pathToFileURL)(n).toString()):Te(n):new Response(null,{status:404,statusText:`Not Found`})})}",
    "module.exports={Se,we};",
  ].join("");

  for (const patchSet of patchSets.filter((patchSet) =>
    collectFileTransforms(patchSet).some(([, transform]) => transform.name === "patchAppProtocolRoutes")
  )) {
    const transform = findTransform(patchSet, "app-protocol");
    const transformed = transform(fakeProtocolBundle);
    const module = { exports: {} };
    const handled = [];
    const redirects = [];
    const sandbox = {
      module,
      require,
      URL,
      Response: {
        redirect(url) {
          redirects.push(url);
          return { redirect: url };
        },
      },
      Oe() {},
      Pe() { return false; },
      Fe() {},
      Te(filePath) { return { filePath }; },
      process,
      r: {
        net: { fetch: (url) => ({ fetch: url }) },
        protocol: { handle: (_scheme, handler) => handled.push(handler) },
      },
      b: { pathToFileURL: (value) => ({ toString: () => `file://${value}` }) },
    };
    vm.runInNewContext(transformed, sandbox, { filename: `${patchSet.id}-protocol.js` });

    module.exports.we("/Applications/Codex.app/Contents/Resources/webview");
    assert.equal(handled.length, 1, `${patchSet.id} registered one app protocol handler`);
    assert.deepEqual(
      await handled[0]({ url: "app://-/settings/general-settings" }),
      { redirect: "app://-/index.html?initialRoute=%2Fsettings%2Fgeneral-settings" },
      `${patchSet.id} redirects settings deep route through initialRoute`,
    );
    assert.deepEqual(redirects, ["app://-/index.html?initialRoute=%2Fsettings%2Fgeneral-settings"]);
    assert.equal(
      (await handled[0]({ url: "app://-/assets/general-settings-Dyo5TGID.js" })).filePath,
      path.join("/Applications/Codex.app/Contents/Resources/webview", "assets", "general-settings-Dyo5TGID.js"),
      `${patchSet.id} keeps asset routes addressable`,
    );
  }
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
    "(te=(0,Fh.jsxs)(`div`,{...v,...O,ref:n,className:j,role:`button`,tabIndex:M,",
    "children:n.label}),t[62]=Oe,",
    "children:[l,u,(0,Z.jsx)(H_,{route:a,children:C})]",
  ].join("");

  for (const patchSet of codexPatchSets) {
    const appMainFile = findTransformPath(patchSet, "app-main");
    const transforms = collectFileTransforms(patchSet).filter(
      ([filePath]) => filePath === appMainFile,
    );

    assert.ok(transforms.length >= 2, `${patchSet.id} has app main feature transforms`);

    const transformed = transformFile(patchSet, appMainFile, fakeAppMainBundle);

    assert.match(transformed, /CPXS=window\.CodexPlusHost\.adapters\.sidebar/);
    assert.match(transformed, /CPXPR=e=>CPXS\.projectRowProps\(e\)/);
    assert.doesNotMatch(transformed, /CPXTR=/);
    assert.match(transformed, /rowAttributes:\{\.\.\.ke,\.\.\.CPXPR\(n\)\}/);
    assert.match(transformed, /\.\.\.CPXPR\(\{projectId:_,label:p\}\),ref:n,className:j,role:`button`/);
    assert.match(transformed, /ie=\(0,Z\.jsx\)\(`div`,\{\.\.\.H,\.\.\.CPXPR\(i\),children:re\}\)/);
    assert.doesNotMatch(transformed, /dataAttributes:CPXTR\(i\)/);
    assert.match(transformed, /"data-codex-plus-sidebar-name":``/);
    assert.doesNotMatch(transformed, /function CPXSidebarNameBlurCommand\(\)/);
    assert.match(transformed, /ui\?\.commands\?\.renderMenuItems/);
    assert.match(transformed, /MenuItem:Zy,register:Hp/);
    assert.match(transformed, /codexPlusToggleSidebarNameBlur:\$i/);
    assert.doesNotMatch(transformed, /localStorage\.(?:setItem|getItem)\(`codex-plus:sidebar/);
    assert.match(transformed, /children:\[l,u,\.\.\.\(window\.CodexPlus\?\.ui\?\.commands\?\.renderMenuItems/);
    assert.match(transformed, /function Pk\(e\)\{let t=\(0,Q\.c\)\(45\),/);
    assert.doesNotMatch(transformed, /t\[24\]!==a\|\|t\[45\]!==i\?/);
    assert.doesNotMatch(transformed, /t\[24\]=a,t\[45\]=i,t\[25\]=q\):q=t\[25\]/);
    assert.doesNotMatch(transformed, /CPX_PROJECT_PALETTE/);
    assert.doesNotMatch(transformed, /CPX_installProjectColorStyles/);
  }

  const projectPlugin = fs.readFileSync(path.join(__dirname, "../src/runtime/plugins/projectColors.js"), "utf8");
  const blurPlugin = fs.readFileSync(path.join(__dirname, "../src/runtime/plugins/sidebarNameBlur.js"), "utf8");
  assert.match(projectPlugin, /data-codex-plus-project-sidebar-color/);
  assert.match(projectPlugin, /data-app-action-sidebar-thread-active=\\"true\\"/);
  assert.doesNotMatch(projectPlugin, /box-shadow:inset 5px 0 0 var\(--codex-plus-project-accent\)/);
  assert.match(projectPlugin, /box-shadow:inset 6px 0 0 var\(--codex-plus-project-accent\)/);
  assert.doesNotMatch(projectPlugin, /\[data-app-action-sidebar-project-list-id\]\[data-codex-plus-project-sidebar-color\] \[data-app-action-sidebar-thread-row\]:not\(\[data-app-action-sidebar-thread-active=\\"true\\"\]\)\{border-left-color:transparent!important\}/);
  assert.match(projectPlugin, /\[data-codex-plus-user-entry\]\[data-codex-plus-project-color\]/);
  assert.match(blurPlugin, /data-codex-plus-sidebar-names-blurred/);
  assert.match(blurPlugin, /data-app-action-sidebar-project-row/);
  assert.match(blurPlugin, /data-app-action-sidebar-thread-row/);
  assert.doesNotMatch(blurPlugin, /data-app-action-sidebar-scroll/);
});

test("616.81150 and 616.71553 project colors flow through native row attributes", () => {
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
    "te=(0,Z.jsxs)(`div`,{...y,...k,ref:n,className:M,role:`button`,",
    "children:n.label}),t[62]=Oe,",
    "children:[l,u,(0,Z.jsx)(H_,{route:a,children:C})]",
  ].join("");

  for (const patchSet of patchSets.filter((candidate) =>
    candidate.id === "codex-26.616.81150-4306" || candidate.id === "codex-26.616.71553-4265"
  )) {
    const appMainFile = findTransformPath(patchSet, "app-main");
    const transformed = transformFile(patchSet, appMainFile, fakeAppMainBundle);

    assert.match(transformed, /rowAttributes:\{\.\.\.ke,\.\.\.CPXPR\(n\)\}/);
    assert.match(transformed, /te=\(0,Z\.jsxs\)\(`div`,\{\.\.\.y,\.\.\.k,ref:n,className:M,role:`button`/);
  }
});

test("thread side panel file and terminal roots prefer active virtual project context", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.81905-4598");
  const reviewFile = findTransformPath(patchSet, "review");
  const fakeReviewBundle = [
    "function r6t(e){let t=(0,i6t.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e",
    "let s;t[1]!==a||t[2]!==r||t[3]!==i?(s=(0,Hq.jsx)(dZt,{diffMode:a,setTabState:r,tabState:i}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
    "function QW(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,g=o??`local`,_=p??(o==null?`file:${t??``}`:`file:${o}:${t??``}`),v=i??sk(ck(e,_)??f),y=e.get(v.tabById$,_),b=$Rt(e),x=m??e.get(_m).formatMessage(VYt.openFileTabTitle),S=fm(t??void 0),C=t==null?x:CH({cwd:b,path:t});v.openTab(e,RYt,{props:{cwd:b,path:t,hostId:g,tabId:_,workspaceRoot:h??null,onSelectFile:(e,n,r)=>{QW(e,n,{controller:v,hostId:g,isPreview:t==null?!1:r?.isPreview,workspaceRoot:h}),t??v.closeTab(e,_)}},onMove:(e,n)=>({props:{cwd:b,path:t,hostId:g,tabId:_,workspaceRoot:h??null,onSelectFile:(e,r,i)=>{QW(e,r,{controller:n,hostId:g,isPreview:t==null?!1:i?.isPreview,workspaceRoot:h}),t??n.closeTab(e,_)}},onClose:w})})}",
    "function Dk(e){switch(e.value.routeKind){case`home`:{let t=e.get(nO),n=e.get(rO);return{conversationId:e.value.clientThreadId,conversationTitle:null,cwd:t,hostId:n}}case`local-thread`:return{conversationId:e.value.clientThreadId,conversationTitle:e.get(qC,e.value.conversationId),cwd:e.get(nO),hostId:e.get(rO)};case`new-thread-panel`:case`chatgpt-thread`:case`client-local-thread`:case`remote-thread`:case`other`:return null}}",
    "function vHt(){let e=(0,CHt.c)(33),t=jo(be),n=$e(GC.activeTab$),r=$e(CS)}",
  ].join("");

  const transformed = transformFile(patchSet, reviewFile, fakeReviewBundle);

  assert.match(transformed, /CPXPC=globalThis\.CodexPlusHost\.adapters\.context\.active\(\)/);
  assert.match(transformed, /CPXSP=globalThis\.CodexPlusHost\.adapters\.threadSidePanel/);
  assert.match(transformed, /CPXSP\.bindOpenFile\(\(t,n=\{\}\)=>QW\(e,t,n\)/);
  assert.match(transformed, /CPXSP\.bindOpenFile\(\(e,n=\{\}\)=>\(\$W\(\),QW\(t,e,n\)\)\)/);
  assert.match(transformed, /b=CPXPC\?\.cwd\?\?\$Rt\(e\)/);
  assert.match(transformed, /workspaceRoot:CPXPC\?\.cwd\?\?h\?\?null/);
  assert.match(transformed, /function Dk\(e\)\{let CPXPC=globalThis\.CodexPlusHost\.adapters\.context\.active\(\)/);
  assert.match(transformed, /conversationId:globalThis\.CodexPlus\?\.ui\?\.virtualConversations\?\.activeRouteId\?\.\(\)\?\?`codex-plus-virtual`/);
  assert.match(transformed, /cwd:CPXPC\.cwd/);
});

test("thread side panel native file opener is patched for 26.623.101652 file tab names", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.101652-4674");
  const tabsFile = collectFileTransforms(patchSet).find(([candidate]) => candidate.endsWith("/app-initial~app-main~onboarding-page-CksqH37h.js"))?.[0];
  assert.ok(tabsFile);
  const fakeBundle = [
    "function rF(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,g=o??`local`,_=p??(o==null?`file:${t??``}`:`file:${o}:${t??``}`),v=i??Fi(cf(e,_)??f),y=e.get(v.tabById$,_),b=XGe(e),x=m??e.get(Bw).formatMessage(fZe.openFileTabTitle),S=Uo(t??void 0),C=t==null?x:qM({cwd:b,path:t});v.openTab(e,lZe,{props:{cwd:b,path:t,hostId:g,tabId:_,workspaceRoot:h??null,onSelectFile:(e,n,r)=>{rF(e,n,{controller:v,hostId:g,isPreview:t==null?!1:r?.isPreview,workspaceRoot:h}),t??v.closeTab(e,_)}},onMove:(e,n)=>({props:{cwd:b,path:t,hostId:g,tabId:_,workspaceRoot:h??null,onSelectFile:(e,r,i)=>{rF(e,r,{controller:n,hostId:g,isPreview:t==null?!1:i?.isPreview,workspaceRoot:h}),t??n.closeTab(e,_)}},onClose:w})})}",
    "function IXe(e){let t=Ms(os),n=Y(no),r=Y(ure),i=Y(Ee)}",
    "function Ki({conversationId:e}){let t=N(M),n=P(E,e),r=v(n)}",
  ].join("");

  const transformed = transformFile(patchSet, tabsFile, fakeBundle);

  assert.match(transformed, /CPXSP=globalThis\.CodexPlusHost\.adapters\.threadSidePanel/);
  assert.match(transformed, /CPXSP\.bindOpenFile\(\(t,n=\{\}\)=>rF\(e,t,n\)/);
  assert.match(transformed, /CPXSP\.bindOpenFile\(\(e,n=\{\}\)=>rF\(t,e,n\)\)/);
  assert.match(transformed, /function Ki\(\{conversationId:e\}\)\{let t=N\(M\),CPXSP=globalThis\.CodexPlusHost\.adapters\.threadSidePanel/);
  assert.match(transformed, /CPXSP\.bindOpenFile\(\(e,n=\{\}\)=>\$t\(t,e,n\)\)/);
  assert.match(transformed, /b=CPXPC\?\.cwd\?\?XGe\(e\)/);
  assert.match(transformed, /workspaceRoot:CPXPC\?\.cwd\?\?h\?\?null/);
});

test("thread side panel native file opener is patched for 26.623.70822 file tab names", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.70822-4559");
  const coreFile = collectFileTransforms(patchSet).find(([candidate]) => candidate.endsWith("/app-initial~app-main~worktree-init-v2-page~remote-conversation-page~new-thread-panel-page~o~kg2pu5rs-N3llppXI.js"))?.[0];
  assert.ok(coreFile);
  const fakeBundle = [
    "function Y9(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,g=o??`local`,_=p??(o==null?`file:${t??``}`:`file:${o}:${t??``}`),v=i??lK(uK(e,_)??f),y=e.get(v.tabById$,_),b=T6e(e),x=m??e.get(yK).formatMessage(Kit.openFileTabTitle),S=Wt(t??void 0),C=t==null?x:q6({cwd:b,path:t});v.openTab(e,Uit,{props:{cwd:b,path:t,hostId:g,tabId:_,workspaceRoot:h??null,onSelectFile:(e,n,r)=>{Y9(e,n,{controller:v,hostId:g,isPreview:t==null?!1:r?.isPreview,workspaceRoot:h}),t??v.closeTab(e,_)},initialLine:l,initialEndLine:a},onMove:(e,n)=>({props:{cwd:b,path:t,hostId:g,tabId:_,workspaceRoot:h??null,onSelectFile:(e,r,i)=>{Y9(e,r,{controller:n,hostId:g,isPreview:t==null?!1:i?.isPreview,workspaceRoot:h}),t??n.closeTab(e,_)},initialLine:l,initialEndLine:a},onClose:w})})}",
    "function Q5e(){let e=(0,r7e.c)(33),t=O(hc),n=Ke(HO.activeTab$),r=Ke(HT)}",
  ].join("");

  const transformed = transformFile(patchSet, coreFile, fakeBundle);

  assert.match(transformed, /CPXSP=globalThis\.CodexPlusHost\.adapters\.threadSidePanel/);
  assert.match(transformed, /CPXSP\.bindOpenFile\(\(t,n=\{\}\)=>Y9\(e,t,n\)/);
  assert.match(transformed, /CPXSP\.bindOpenFile\(\(e,n=\{\}\)=>Y9\(t,e,n\)\)/);
  assert.match(transformed, /b=CPXPC\?\.cwd\?\?T6e\(e\)/);
  assert.match(transformed, /workspaceRoot:CPXPC\?\.cwd\?\?h\?\?null/);
});

test("thread side panel native file opener is patched for 26.623.61825 file tab names", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.61825-4548");
  const coreFile = collectFileTransforms(patchSet).find(([candidate]) => candidate.endsWith("/app-initial~app-main~worktree-init-v2-page~remote-conversation-page~new-thread-panel-page~o~hgx54pg3-D4ItPAoC.js"))?.[0];
  assert.ok(coreFile);
  const fakeBundle = [
    "function YO(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,g=o??`local`,_=p??(o==null?`file:${t??``}`:`file:${o}:${t??``}`),v=i??Tc(dc(e,_)??f),y=e.get(v.tabById$,_),b=$h(e),x=m??e.get(bo).formatMessage(ZO.openFileTabTitle),S=xt(t??void 0),C=t==null?x:Lh({cwd:b,path:t});v.openTab(e,qO,{props:{cwd:b,path:t,hostId:g,tabId:_,workspaceRoot:h??null,onSelectFile:(e,n,r)=>{YO(e,n,{controller:v,hostId:g,isPreview:t==null?!1:r?.isPreview,workspaceRoot:h}),t??v.closeTab(e,_)},initialLine:l,initialEndLine:a},onMove:(e,n)=>({props:{cwd:b,path:t,hostId:g,tabId:_,workspaceRoot:h??null,onSelectFile:(e,r,i)=>{YO(e,r,{controller:n,hostId:g,isPreview:t==null?!1:i?.isPreview,workspaceRoot:h}),t??n.closeTab(e,_)},initialLine:l,initialEndLine:a},onClose:w})})}",
    "function tb(){let e=(0,ob.c)(33),t=xe(Z),n=Y(tc.activeTab$),r=Y(sr)}",
  ].join("");

  const transformed = transformFile(patchSet, coreFile, fakeBundle);

  assert.match(transformed, /CPXSP=globalThis\.CodexPlusHost\.adapters\.threadSidePanel/);
  assert.match(transformed, /CPXSP\.bindOpenFile\(\(t,n=\{\}\)=>YO\(e,t,n\)/);
  assert.match(transformed, /CPXSP\.bindOpenFile\(\(e,n=\{\}\)=>YO\(t,e,n\)\)/);
  assert.match(transformed, /b=CPXPC\?\.cwd\?\?\$h\(e\)/);
  assert.match(transformed, /workspaceRoot:CPXPC\?\.cwd\?\?h\?\?null/);
});

test("thread side panel native file opener is patched for 26.623.42026 file tab names", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.42026-4514");
  const tabsFile = collectFileTransforms(patchSet).find(([candidate]) => candidate.endsWith("/app-initial~app-main~onboarding-page-BUwCKIcU.js"))?.[0];
  assert.ok(tabsFile);
  const fakeBundle = [
    "function EL(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,g=o??`local`,_=p??(o==null?`file:${t??``}`:`file:${o}:${t??``}`),v=i??FT(IT(e,_)??f),y=e.get(v.tabById$,_),b=OHe(e),x=m??e.get(YT).formatMessage(nZe.openFileTabTitle),S=Im(t??void 0),C=t==null?x:EN({cwd:b,path:t});v.openTab(e,$Xe,{props:{cwd:b,path:t,hostId:g,tabId:_,workspaceRoot:h??null,onSelectFile:(e,n,r)=>{EL(e,n,{controller:v,hostId:g,isPreview:t==null?!1:r?.isPreview,workspaceRoot:h}),t??v.closeTab(e,_)},initialLine:l,initialEndLine:a},onMove:(e,n)=>({props:{cwd:b,path:t,hostId:g,tabId:_,workspaceRoot:h??null,onSelectFile:(e,r,i)=>{EL(e,r,{controller:n,hostId:g,isPreview:t==null?!1:i?.isPreview,workspaceRoot:h}),t??n.closeTab(e,_)},initialLine:l,initialEndLine:a},onClose:w})})}",
    "function QWe(){let e=(0,rGe.c)(33),t=B(Z),n=X(Cw.activeTab$),r=X(ZS)}",
  ].join("");

  const transformed = transformFile(patchSet, tabsFile, fakeBundle);

  assert.match(transformed, /CPXSP=globalThis\.CodexPlusHost\.adapters\.threadSidePanel/);
  assert.match(transformed, /CPXSP\.bindOpenFile\(\(t,n=\{\}\)=>EL\(e,t,n\)/);
  assert.match(transformed, /CPXSP\.bindOpenFile\(\(e,n=\{\}\)=>EL\(t,e,n\)\)/);
  assert.match(transformed, /b=CPXPC\?\.cwd\?\?OHe\(e\)/);
  assert.match(transformed, /workspaceRoot:CPXPC\?\.cwd\?\?h\?\?null/);
});

test("thread side panel native file opener is patched for 26.623.41415 file tab names", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.41415-4505");
  const tabsFile = collectFileTransforms(patchSet).find(([candidate]) => candidate.endsWith("/app-initial~app-main~onboarding-page~profile-BoHgnEVB.js"))?.[0];
  assert.ok(tabsFile);
  const fakeBundle = [
    "function gJ(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,g=o??`local`,_=p??(o==null?`file:${t??``}`:`file:${o}:${t??``}`),v=i??hj(Fct(e,_)??f),y=e.get(v.tabById$,_),b=Gln(e),x=m??e.get(Tj).formatMessage(Ryn.openFileTabTitle),S=mN(t??void 0),C=t==null?x:cK({cwd:b,path:t});v.openTab(e,Fyn,{props:{cwd:b,path:t,hostId:g,tabId:_,workspaceRoot:h??null,onSelectFile:(e,n,r)=>{gJ(e,n,{controller:v,hostId:g,isPreview:t==null?!1:r?.isPreview,workspaceRoot:h}),t??v.closeTab(e,_)},initialLine:l,initialEndLine:a},onMove:(e,n)=>({props:{cwd:b,path:t,hostId:g,tabId:_,workspaceRoot:h??null,onSelectFile:(e,r,i)=>{gJ(e,r,{controller:n,hostId:g,isPreview:t==null?!1:i?.isPreview,workspaceRoot:h}),t??n.closeTab(e,_)},initialLine:l,initialEndLine:a},onClose:w})})}",
    "function Ufn(){let e=(0,Jfn.c)(33),t=Kn(Xd),n=Nn(HE.activeTab$),r=Nn(dw)}",
  ].join("");

  const transformed = transformFile(patchSet, tabsFile, fakeBundle);

  assert.match(transformed, /CPXSP=globalThis\.CodexPlusHost\.adapters\.threadSidePanel/);
  assert.match(transformed, /CPXSP\.bindOpenFile\(\(t,n=\{\}\)=>gJ\(e,t,n\)/);
  assert.match(transformed, /CPXSP\.bindOpenFile\(\(e,n=\{\}\)=>gJ\(t,e,n\)\)/);
  assert.match(transformed, /b=CPXPC\?\.cwd\?\?Gln\(e\)/);
  assert.match(transformed, /workspaceRoot:CPXPC\?\.cwd\?\?h\?\?null/);
});

test("thread side panel native file opener is patched for 26.623.31921 file tab names", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.31921-4452");
  const coreFile = collectFileTransforms(patchSet).find(([candidate], index, transforms) =>
    candidate.endsWith("/app-initial~app-main~remote-conversation-page~new-thread-panel-page~projects-index-page~app~ovcriy74-KTK3czaX.js") &&
    transforms[index][1].name === "patchThreadSidePanelNativeProjectContext")?.[0];
  assert.ok(coreFile);
  const fakeBundle = [
    "function YG(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,g=o??`local`,_=p??(o==null?`file:${t??``}`:`file:${o}:${t??``}`),v=i??XS(ZS(e,_)??f),y=e.get(v.tabById$,_),b=AN(e),x=m??e.get(gC).formatMessage(ZG.openFileTabTitle),S=Cs(t??void 0),C=t==null?x:mN({cwd:b,path:t});v.openTab(e,qG,{props:{cwd:b,path:t,hostId:g,tabId:_,workspaceRoot:h??null,onSelectFile:(e,n,r)=>{YG(e,n,{controller:v,hostId:g,isPreview:t==null?!1:r?.isPreview,workspaceRoot:h}),t??v.closeTab(e,_)},initialLine:l,initialEndLine:a},onMove:(e,n)=>({props:{cwd:b,path:t,hostId:g,tabId:_,workspaceRoot:h??null,onSelectFile:(e,r,i)=>{YG(e,r,{controller:n,hostId:g,isPreview:t==null?!1:i?.isPreview,workspaceRoot:h}),t??n.closeTab(e,_)},initialLine:l,initialEndLine:a},onClose:w})})}",
  ].join("");

  const transformed = transformFile(patchSet, coreFile, fakeBundle);
  assert.match(transformed, /CPXPC=globalThis\.CodexPlusHost\.adapters\.context\.active\(\)/);
  assert.match(transformed, /b=CPXPC\?\.cwd\?\?AN\(e\)/);
  assert.match(transformed, /workspaceRoot:CPXPC\?\.cwd\?\?h\?\?null/);
});

test("ChatGPT native file opener keeps native tabs while preferring active project context", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.91948-5440");
  const transform = findTransform(patchSet, "review");
  const transformed = transform([
    "function I5(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,g=o??`local`,_=Cxe(t,o,p),v=i??De(nt(e,_)??f),y=e.get(v.tabById$,_),b=Do(e),x=m??e.get(Ul).formatMessage(Txe.openFileTabTitle),S=Hs(t??void 0),C=t==null?x:Ys({cwd:b,path:t});",
    "workspaceRoot:h??null,onSelectFile:(e,n,r)=>{I5(e,n,{controller:v,hostId:g,isPreview:t==null?!1:r?.isPreview,workspaceRoot:h}),t??v.closeTab(e,_)}",
    "workspaceRoot:h??null,onSelectFile:(e,r,i)=>{I5(e,r,{controller:n,hostId:g,isPreview:t==null?!1:i?.isPreview,workspaceRoot:h}),t??n.closeTab(e,_)}",
  ].join(""));

  assert.match(transformed, /CPXPC=globalThis\.CodexPlusHost\.adapters\.context\.active\(\)/);
  assert.match(transformed, /CPXSP\.bindOpenFile\(\(t,n=\{\}\)=>I5\(e,t,n\)\)/);
  assert.match(transformed, /b=CPXPC\?\.cwd\?\?Do\(e\)/);
  assert.match(transformed, /workspaceRoot:CPXPC\?\.cwd\?\?h\?\?null/);
});

test("review mux consumes only canonical required context", () => {
  const plugin = fs.readFileSync(path.join(__dirname, "../src/runtime/plugins/nestedRepositories.js"), "utf8");
  assert.match(plugin, /const cwd = context\?\.cwd \|\| null/);
  assert.doesNotMatch(plugin, /activeVirtualProjectContext|projectContext|fallbackCwd|querySelector/);
});

test("nested review diff cards use the native controlled disclosure contract", () => {
  const plugin = fs.readFileSync(path.join(__dirname, "../src/runtime/plugins/nestedRepositories.js"), "utf8");
  assert.match(plugin, /function ControlledDiffCard/);
  assert.match(plugin, /open,\s*onOpenChange: setOpen/);
  assert.match(plugin, /"data-codex-plus-repo-patch-group": repo\.path \?\? repo\.id/);
  assert.doesNotMatch(plugin, /defaultOpen/);
});

test("current project headers receive project color row attributes on the clickable row", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.41415-4505");
  const appMainFile = findTransformPath(patchSet, "app-main");
  const fakeCurrentAppMainBundle = [
    "function gg(e){let t=(0,Rg.c)(44),{threadKeys:n,",
    "t[19]!==V||t[20]!==c||t[21]!==l||t[22]!==_||t[23]!==s||t[24]!==o?(q={onActivateGroup:V,onStartNewConversation:o,isGrouped:!0,hideRemoteHostEnvIcon:!0,hideTimestamp:l,locationId:_,floatStatusIconsRight:c,showPinActionOnHover:s},",
    "t[19]=V,t[20]=c,t[21]=l,t[22]=_,t[23]=s,t[24]=o,t[25]=q):q=t[25];",
    "X=(0,$.jsx)(`div`,{...H,children:ne})",
    "(te=(0,Fh.jsxs)(`div`,{...v,...O,ref:n,className:j,role:`button`,tabIndex:M,",
  ].join("");

  const transformed = transformFile(patchSet, appMainFile, fakeCurrentAppMainBundle);

  assert.match(transformed, /CPXS=window\.CodexPlusHost\.adapters\.sidebar/);
  assert.doesNotMatch(transformed, /CPXTR=/);
  assert.match(transformed, /\.\.\.CPXPR\(a\),children:ne/);
  assert.match(transformed, /\.\.\.CPXPR\(\{projectId:_,label:p\}\),ref:n,className:j,role:`button`/);
  assert.doesNotMatch(transformed, /dataAttributes:CPXTR\(a\)/);
  assert.doesNotMatch(transformed, /t\[44\]!==a/);
  assert.doesNotMatch(transformed, /t\[44\]=a/);
});

test("current project child lists receive their project color attributes", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.42026-4514");
  const appMainFile = findTransformPath(patchSet, "app-main");
  const fakeCurrentAppMainBundle = [
    "function Vm(e){let t=(0,Gm.c)(57),",
    "q=(0,Km.jsxs)(`div`,{...v,...O,ref:n,className:j,role:`button`,",
    "return t[41]!==Y||t[42]!==H?(ne=(0,$.jsx)(`div`,{...H,children:Y}),t[41]=Y,t[42]=H,t[43]=ne):ne=t[43],ne}",
  ].join("");

  const transformed = transformFile(patchSet, appMainFile, fakeCurrentAppMainBundle);

  assert.match(transformed, /CPXS=window\.CodexPlusHost\.adapters\.sidebar/);
  assert.match(transformed, /ne=\(0,\$\.jsx\)\(`div`,\{\.\.\.H,\.\.\.CPXPR\(a\),children:Y\}\)/);
  assert.doesNotMatch(transformed, /CPXPR\(n\),children:Y/);
});

test("101652 project child lists receive their project color attributes", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.101652-4674");
  const appMainFile = findTransformPath(patchSet, "app-main");
  const fakeCurrentAppMainBundle = [
    "function Wh(e){let t=(0,Jh.c)(57),",
    "O=Xt.sidebarProjectRow({collapsed:a,label:p,projectId:_})",
    "J=(0,Yh.jsxs)(`div`,{...v,...O,ref:n,className:j,role:`button`,tabIndex:M,",
    "function Ag(e){let t=(0,Qg.c)(44),{threadKeys:n,allowThreadDnd:r,threadOrderIsPrecomputed:i,group:a,startNewConversation:o,",
    "let ee;return t[41]!==J||t[42]!==B?(ee=(0,$.jsx)(`div`,{...B,children:J}),t[41]=J,t[42]=B,t[43]=ee):ee=t[43],ee}",
  ].join("");

  const transformed = transformFile(patchSet, appMainFile, fakeCurrentAppMainBundle);

  assert.match(transformed, /CPXS=window\.CodexPlusHost\.adapters\.sidebar/);
  assert.match(transformed, /J=\(0,Yh\.jsxs\)\(`div`,\{\.\.\.v,\.\.\.O,\.\.\.CPXPR\(\{projectId:_,label:p\}\),ref:n,className:j,role:`button`,tabIndex:M,/);
  assert.match(transformed, /ee=\(0,\$\.jsx\)\(`div`,\{\.\.\.B,\.\.\.CPXPR\(a\),children:J\}\)/);
});

test("101652 project headers receive sidebar blur name attributes", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.101652-4674");
  const appMainFile = findTransformPath(patchSet, "app-main");
  const sidebarBlurTransform = collectFileTransforms(patchSet).find(
    ([filePath, transform]) => filePath === appMainFile && transform.name === "patchAppMainSidebarBlur",
  )?.[1];
  assert.equal(typeof sidebarBlurTransform, "function");

  const fakeAppMainBundle = [
    "function Wh(e){let t=(0,Jh.c)(57),",
    "V=(0,Yh.jsx)(`span`,{className:`min-w-0 truncate pr-1`,children:p})",
  ].join("");

  const transformed = sidebarBlurTransform(fakeAppMainBundle);

  assert.match(transformed, /"data-codex-plus-sidebar-name":``/);
});

test("ChatGPT current project headers receive color and sidebar blur attributes", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.41301-5103");
  const appMainFile = findTransformPath(patchSet, "app-main");
  const fakeAppMainBundle = [
    "function Xu(e){let t=(0,Zu.c)(57),",
    "A=ee.sidebarProjectRow({collapsed:a,label:g,projectId:b})",
    "H=(0,Qu.jsx)(`span`,{className:`text-fade-truncate pr-1`,children:g})",
  ].join("");

  const transformed = transformFile(patchSet, appMainFile, fakeAppMainBundle);

  assert.match(transformed, /CPXS=window\.CodexPlusHost\.adapters\.sidebar/);
  assert.match(
    transformed,
    /A=\{\.\.\.ee\.sidebarProjectRow\(\{collapsed:a,label:g,projectId:b\}\),\.\.\.CPXPR\(\{projectId:b,label:g\}\)\}/,
  );
  assert.match(transformed, /"data-codex-plus-sidebar-name":``/);
});

test("61825 project child lists receive their project color attributes", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.61825-4548");
  const appMainFile = findTransformPath(patchSet, "app-main");
  const fakeCurrentAppMainBundle = [
    "function jy(e){let t=(0,Fy.c)(57),",
    "O=Ta.sidebarProjectRow({collapsed:a,label:p,projectId:_})",
    "function _b(e){let t=(0,zb.c)(44),{threadKeys:n,allowThreadDnd:r,threadOrderIsPrecomputed:i,group:a,startNewConversation:o,",
    "let te;return t[41]!==Y||t[42]!==V?(te=(0,$.jsx)(`div`,{...V,children:Y}),t[41]=Y,t[42]=V,t[43]=te):te=t[43],te}",
  ].join("");

  const transformed = transformFile(patchSet, appMainFile, fakeCurrentAppMainBundle);

  assert.match(transformed, /CPXS=window\.CodexPlusHost\.adapters\.sidebar/);
  assert.match(transformed, /O=\{\.\.\.Ta\.sidebarProjectRow\(\{collapsed:a,label:p,projectId:_\}\),\.\.\.CPXPR\(\{projectId:_,label:p\}\)\}/);
  assert.match(transformed, /te=\(0,\$\.jsx\)\(`div`,\{\.\.\.V,\.\.\.CPXPR\(a\),children:Y\}\)/);
});

test("31921 project child lists receive their project color attributes", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.31921-4452");
  const appMainFile = findTransformPath(patchSet, "app-main");
  const fakeCurrentAppMainBundle = [
    "function SV(e){let t=(0,EV.c)(57),",
    "O=yl.sidebarProjectRow({collapsed:a,label:p,projectId:_})",
    "function nH(e){let t=(0,OH.c)(120),",
    "ne=(0,Z.jsx)(`div`,{...R,children:te})",
  ].join("");

  const transformed = transformFile(patchSet, appMainFile, fakeCurrentAppMainBundle);

  assert.match(transformed, /CPXS=window\.CodexPlusHost\.adapters\.sidebar/);
  assert.match(transformed, /O=\{\.\.\.yl\.sidebarProjectRow\(\{collapsed:a,label:p,projectId:_\}\),\.\.\.CPXPR\(\{projectId:_,label:p\}\)\}/);
  assert.match(transformed, /ne=\(0,Z\.jsx\)\(`div`,\{\.\.\.R,\.\.\.CPXPR\(a\),children:te\}\)/);
  assert.doesNotMatch(transformed, /CPX_rowDataAttributes/);
  assert.doesNotMatch(transformed, /t\[\d+\].*CPXPR\(a\)|CPXPR\(a\).*t\[\d+\]/);
});

test("31921 local thread rows derive adapter context from the resolved cwd", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.31921-4452");
  const transform = findTransform(patchSet, "local-task-row");
  const transformed = transform([
    "function yr(e){let t=(0,xr.c)(134),",
    "threadSummary:B,dataAttributes:Le}=e,V=u===void 0?!1:u,",
    "ct=E(Se,n),ut=a??ct??et?.cwd??null,dt=E(Ne,n),ft=E(m,n),X=E(h,n)??et?.hostId??null;E(r,n)??et?.modelProvider;",
  ].join(""));

  assert.match(transformed, /dataAttributes:Le\}=e/);
  assert.match(transformed, /X=E\(h,n\)\?\?et\?\.hostId\?\?null;Le=\{\.\.\.Le,\.\.\.CPXPR\(\{projectId:Fe,label:Ie,path:ut,cwd:ut,hostId:X,threadId:n\}\)\};E\(r,n\)/);
  assert.doesNotMatch(transformed, /dataAttributes:Le=CPXPR/);
});

test("project colors resolve composer cwd to the sidebar project identity", () => {
  const styles = [];
  const context = {
    console,
    CustomEvent: class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
    window: {
      dispatchEvent() {},
      addEventListener() {},
      removeEventListener() {},
      localStorage: {
        getItem() {
          return null;
        },
        setItem() {},
      },
    },
    document: {
      querySelector() {
        return null;
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
    getComputedStyle(element) {
      return element.computedStyle;
    },
  };
  context.window.window = context.window;
  context.window.document = context.document;
  context.window.console = console;

  runRuntimeApiAndHosts(context);
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../src/runtime/plugins/projectColors.js"), "utf8"),
    context,
    { filename: "plugins/projectColors.js" },
  );

  const project = {
    projectId: "alpha-workspace",
    label: "alpha-workspace",
    path: "/tmp/codex-plus-audit/worktrees/c7ee/alpha-workspace",
    hostId: "local",
  };
  const sidebarProps = context.window.CodexPlus.ui.sidebar.projectRowProps({ project });
  const composerProps = context.window.CodexPlus.ui.composer.surfaceProps({
    project: { cwd: project.path, hostId: "local" },
  });
  const worktreeProjectProps = context.window.CodexPlus.ui.composer.surfaceProps({
    project: { cwd: "/tmp/codex-plus-audit/worktrees/c7ee/alpha-workspace", hostId: "local" },
  });

  assert.equal(composerProps.style.borderRadius, "var(--composer-border-radius, var(--radius-3xl))");
  assert.equal(sidebarProps.style.borderRadius, undefined);
  assert.equal(
    composerProps.style["--codex-plus-project-accent"],
    sidebarProps.style["--codex-plus-project-accent"],
  );
  assert.equal(
    worktreeProjectProps.style["--codex-plus-project-accent"],
    sidebarProps.style["--codex-plus-project-accent"],
  );

  const alternateWorktreeCwd = "/tmp/codex-plus-audit/worktrees/6499/alpha-workspace";
  const activeStyle = sidebarProps.style;
  context.document.querySelector = () => ({
    computedStyle: {
      getPropertyValue(name) {
        return activeStyle[name] || "";
      },
    },
  });
  const worktreeComposerProps = context.window.CodexPlus.ui.composer.surfaceProps({
    project: { cwd: alternateWorktreeCwd, hostId: "local" },
  });
  assert.equal(
    worktreeComposerProps.style["--codex-plus-project-accent"],
    activeStyle["--codex-plus-project-accent"],
  );
  assert.notEqual(worktreeComposerProps.style["--codex-plus-project-accent"], "#bab0ac");

  context.document.querySelector = () => ({
    computedStyle: {
      getPropertyValue(name) {
        return name === "--codex-plus-project-accent" ? "#bab0ac" : "";
      },
    },
  });
  const missingProjectProps = context.window.CodexPlus.ui.composer.surfaceProps({});
  assert.equal(missingProjectProps.style["--codex-plus-project-accent"], "#bab0ac");

  const chatThreadProps = context.window.CodexPlus.ui.sidebar.threadRowProps({
    id: "chat-thread-1",
    title: "Projectless chat",
    hostId: "local",
  });
  assert.equal(chatThreadProps["data-codex-plus-project-sidebar-color"], "");
  assert.equal(chatThreadProps["data-codex-plus-project-color"], "");
  assert.ok(chatThreadProps.style["--codex-plus-project-accent"]);
  assert.equal(
    context.window.CodexPlus.plugins.get("projectColors").exports.colorKey({ projectKind: "chat", hostId: "local", id: "chat-thread-1" }),
    "chat:local:chat-thread-1",
  );
});

test("current local task row patch forwards projectless chat row identity", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.70822-4559");
  const fakeLocalTaskRowBundle = [
    "function hd(e){let t=(0,gd.c)(55),",
    "onClick:y,onDoubleClick:b,onArchive:x,onContextMenu:S,dataAttributes:C}=e,",
    "dataAttributes:Zr.sidebarThreadRow({active:s,hostId:f,id:c,kind:`local`,pinned:r,title:x})",
    "sg={floatStatusIconsRight:!0,hideTimestamp:!0,locationId:`flat-chats`,showPinActionOnHover:!0}",
  ].join("");

  const transformed = transformFile(patchSet, findTransformPath(patchSet, "local-task-row"), fakeLocalTaskRowBundle);

  assert.match(transformed, /threadId:n\.threadId\?\?n\.id/);
  assert.match(transformed, /title:n\.title\?\?n\.label/);
  assert.match(transformed, /projectKind:n\.projectId\|\|n\.worktreeGitRoot\|\|n\.worktreeWorkspaceRoot\?void 0:`chat`/);
  assert.match(transformed, /projectless:!\(n\.projectId\|\|n\.worktreeGitRoot\|\|n\.worktreeWorkspaceRoot\)/);
  assert.match(transformed, /dataAttributes:\{\.\.\.Zr\.sidebarThreadRow\(\{active:s,hostId:f,id:c,kind:`local`,pinned:r,title:x\}\),\.\.\.CPXPR\(\{projectId:be,label:ye,path:k,cwd:k,hostId:f,threadId:c,title:x,projectKind:be\|\|k\?void 0:`chat`,projectless:!\(be\|\|k\)\}\)\}/);
  assert.match(transformed, /locationId:`flat-chats`,showPinActionOnHover:!0,dataAttributes:CPXPR\(\{projectKind:`chat`,projectless:!0,hostId:`local`,id:`flat-chats`,title:`Chats`\}\)/);
});

test("ChatGPT local task row patch forwards native row project identity", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.41301-5103");
  const fakeLocalTaskRowBundle = [
    "function lg(e){let t=(0,hg.c)(128),",
    "dataAttributes:ee.sidebarThreadRow({active:l,hostId:t.hostId,id:n,kind:`local`,pinned:r,title:t.label})",
    "dataAttributes:ee.sidebarThreadRow({active:l,hostId:null,id:t,kind:`remote`,pinned:r,title:e.task.title??``})",
    "dataAttributes:ee.sidebarThreadRow({active:l,hostId:p,id:o,kind:`local`,pinned:r,title:S})",
  ].join("");

  const transformed = transformFile(patchSet, findTransformPath(patchSet, "local-task-row"), fakeLocalTaskRowBundle);

  assert.match(transformed, /CPXS=window\.CodexPlusHost\.adapters\.sidebar/);
  assert.match(transformed, /threadId:n,title:t\.label/);
  assert.match(transformed, /projectless:!\(t\.projectId\|\|t\.worktreeGitRoot\|\|t\.worktreeWorkspaceRoot\)/);
  assert.match(transformed, /hostId:null,threadId:t,title:e\.task\.title\?\?``/);
  assert.match(transformed, /projectId:ye,label:ve,path:le,cwd:le,hostId:p,threadId:o,title:S,projectKind:ye\|\|le\?void 0:d,projectless:d===`projectless`/);
});

test("91948 local task rows bind project identity at the canonical native row seam", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.91948-5440");
  const fakeLocalTaskRowBundle = [
    "function Czt(e){let t=(0,Tzt.c)(142),",
    "isProjectlessHoverCard:Y",
    "let Ze=g(m5,Ye),Qe=g(Ate,n),$e=g(Qa,n)??Pe?.source,et=g(mre,n)??Pe?.title??null;g(wr,n)??Pe?.threadSource;let tt=fe?N:void 0,nt;",
    "hoverCardSideOffset:Jt,dataAttributes:de,archiveAriaLabel:Yt,",
    "function xRt(e){let t=(0,SRt.c)(57),{ref:n,className:r,actions:i,collapsed:a,contentClassName:o,dragHandleListeners:s,dragHandleRef:c,icon:l,iconDropTargetKind:u,iconRef:d,isActive:f,isDisabled:p,ariaLabel:m,ariaExpanded:h,label:g,labelEnd:_,onContextMenu:v,onPress:y,projectId:b,rowAttributes:x,selectAction:S,trailingContent:C}=e,",
    "Y=(0,d7.jsxs)(`div`,{...x,...j,ref:n,className:P,role:`button`,",
  ].join("");

  const transformed = transformFile(patchSet, findTransformPath(patchSet, "local-task-row"), fakeLocalTaskRowBundle);

  assert.match(transformed, /CPXS\.mergeThreadRowAttributes\(de,CPXPR\(\{projectId:se,label:ce,path:Ve,cwd:Ve,hostId:We,threadId:n,title:et,projectKind:Me\?`chat`:void 0,projectless:Me\}\)\)/);
  assert.match(transformed, /dataAttributes:CPXRowData/);
  assert.match(transformed, /Y=\(0,d7\.jsxs\)\(`div`,\{\.\.\.x,\.\.\.j,\.\.\.CPXPR\(\{projectId:b,label:g\}\),ref:n,className:P,role:`button`,/);
});

test("101652 local task row patch forwards projectless chat row identity", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.101652-4674");
  const fakeLocalTaskRowBundle = [
    "function Ld(e){let t=(0,Rd.c)(55),{task:n,envIconLocation:r,useStableTrailingRail:i,statusIndicatorReplacesMeta:a,hideStatusIndicator:o,isActive:s,hasAttention:c,indicatorRestNode:l,indicatorHoverNode:u,reserveLeadingSlot:d,additionalHoverActionCount:f,renderActions:p,variant:m,hoverCardProjectLabel:h,floatStatusIconsRight:g,metaContent:_,overlayMetaContent:v,onClick:y,onDoubleClick:b,onArchive:x,onContextMenu:S,dataAttributes:C}=e,",
    "function sm(e){let t=(0,pm.c)(129),",
    "dataAttributes:Xt.sidebarThreadRow({active:c,hostId:p,id:r,kind:`local`,pinned:i,title:S})",
    "g_={floatStatusIconsRight:!0,hideTimestamp:!0,locationId:`flat-chats`,showPinActionOnHover:!0}",
  ].join("");

  const transformed = transformFile(patchSet, findTransformPath(patchSet, "local-task-row"), fakeLocalTaskRowBundle);

  assert.match(transformed, /threadId:n\.threadId\?\?n\.id/);
  assert.match(transformed, /title:n\.title\?\?n\.label/);
  assert.match(transformed, /projectKind:n\.projectId\|\|n\.worktreeGitRoot\|\|n\.worktreeWorkspaceRoot\?void 0:`chat`/);
  assert.match(transformed, /projectless:!\(n\.projectId\|\|n\.worktreeGitRoot\|\|n\.worktreeWorkspaceRoot\)/);
  assert.match(transformed, /dataAttributes:\{\.\.\.Xt\.sidebarThreadRow\(\{active:c,hostId:p,id:r,kind:`local`,pinned:i,title:S\}\),\.\.\.CPXPR\(\{projectId:_e,label:ge,path:A,cwd:A,hostId:p,threadId:r,title:S,projectKind:_e\|\|A\?void 0:`chat`,projectless:u===`projectless`\}\)\}/);
  assert.match(transformed, /locationId:`flat-chats`,showPinActionOnHover:!0,dataAttributes:CPXPR\(\{projectKind:`chat`,projectless:!0,hostId:`local`,id:`flat-chats`,title:`Chats`\}\)/);
});

test("local task row patch colors standalone rows from row project context", () => {
  const fakeLocalTaskRowBundle = [
    "function fn(e){let t=(0,K.c)(124),",
    "threadSummary:Ne,dataAttributes:Fe}=e,Ie=g===void 0?!1:g,",
    "t[87]!==Fe",
    "dataAttributes:Fe,archiveAriaLabel:hn",
    "t[87]=Fe",
  ].join("");

  for (const patchSet of codexPatchSets) {
    const transform = findTransform(patchSet, "local-task-row");

    assert.equal(typeof transform, "function", `${patchSet.id} has local task row transform`);

    const transformed = transform(fakeLocalTaskRowBundle);

    assert.doesNotMatch(transformed, /CPX_threadProjectAssignments/);
    assert.match(transformed, /dataAttributes:CPXNativeFe\}=e,Fe=CPXS\.mergeThreadRowAttributes\(CPXNativeFe,CPXPR\(\{projectId:Oe,label:ke,path:r,cwd:r,threadId:n\}\)\)/);
    assert.match(transformed, /dataAttributes:Fe,archiveAriaLabel:hn/);
    assert.match(transformed, /t\[87\]!==Fe/);
    assert.match(transformed, /t\[87\]=Fe/);
    assert.doesNotMatch(transformed, /CPX_rowDataAttributes/);
  }
});

test("older local task row patches color pinned and projectless sidebar callers", () => {
  const fake41415LocalTaskRowBundle = [
    "function _p(e){let t=(0,yp.c)(134),",
    "threadSummary:le,dataAttributes:ue}=e,de=c===void 0?!1:c,",
    "dataAttributes:kr.sidebarThreadRow({active:s,hostId:p,id:l,kind:`local`,pinned:r,title:x})",
  ].join("");
  const fake42026LocalTaskRowBundle = [
    "function Ef(e){let t=(0,Of.c)(134),",
    "threadSummary:le,dataAttributes:ue}=e,de=l===void 0?!1:l,",
    "dataAttributes:Rn.sidebarThreadRow({active:s,hostId:p,id:l,kind:`local`,pinned:r,title:x})",
  ].join("");

  const patch41415 = patchSets.find((candidate) => candidate.id === "codex-26.623.41415-4505");
  const transformed41415 = transformFile(patch41415, findTransformPath(patch41415, "local-task-row"), fake41415LocalTaskRowBundle);
  assert.match(transformed41415, /CPXS=window\.CodexPlusHost\.adapters\.sidebar/);
  assert.match(transformed41415, /dataAttributes:\{\.\.\.kr\.sidebarThreadRow\(\{active:s,hostId:p,id:l,kind:`local`,pinned:r,title:x\}\),\.\.\.CPXPR\(\{projectId:ve,label:ge,path:D,cwd:D,hostId:p,threadId:l,title:x,projectKind:ve\|\|D\?void 0:`chat`,projectless:u===`projectless`\}\)\}/);

  const patch42026 = patchSets.find((candidate) => candidate.id === "codex-26.623.42026-4514");
  const transformed42026 = transformFile(patch42026, findTransformPath(patch42026, "local-task-row"), fake42026LocalTaskRowBundle);
  assert.match(transformed42026, /CPXS=window\.CodexPlusHost\.adapters\.sidebar/);
  assert.match(transformed42026, /dataAttributes:\{\.\.\.Rn\.sidebarThreadRow\(\{active:s,hostId:p,id:l,kind:`local`,pinned:r,title:x\}\),\.\.\.CPXPR\(\{projectId:_e,label:ge,path:O,cwd:O,hostId:p,threadId:l,title:x,projectKind:_e\|\|O\?void 0:`chat`,projectless:u===`projectless`\}\)\}/);
});

test("current app shell applies the Statsig dev fallback without the legacy timeout text", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "codex-26.623.70822-4559");
  const transform = collectFileTransforms(patchSet)
    .find(([, candidate]) => candidate.name === "patchStatsigDevFallback")?.[1];
  assert.equal(typeof transform, "function", `${patchSet.id} has Statsig dev fallback transform`);
  const fakeAppShellBundle = [
    "function gq(e){let t=(0,xq.c)(31),{appSessionId:n,appVersion:r,auth:i,browserLocale:a,hostBuildFlavor:o,stableId:s,statsigClientKey:c,systemName:l,systemVersion:u,children:d}=e,",
    "f={mutationFn:async e=>{let t=await RK(e),n=new Cq.StatsigClient(c,t.user,Pq);return n.dataAdapter.setData(t.statsigPayload),n.initializeSync(),n},retry:vq},",
    "e=(0,Oq.jsx)(dq,{appSessionId:n,appVersion:r,auth:i,browserLocale:a,hostBuildFlavor:o,statsigClientKey:c,systemName:l,systemVersion:u,children:d}),",
    "v=(0,Oq.jsx)(yq,{appVersion:r,authMethod:i.authMethod,client:p,deviceId:s,hostBuildFlavor:o,children:d})",
  ].join("");

  const transformed = transform(fakeAppShellBundle);

  assert.match(transformed, /\}=e,f,CPXStatsigFallback=globalThis\.__CodexPlusRuntimeConfig\?\.devModeStatsigFallback===true/);
  assert.match(transformed, /CPXStatsigFallback=globalThis\.__CodexPlusRuntimeConfig\?\.devModeStatsigFallback===true/);
  assert.match(transformed, /new Cq\.StatsigClient\(c,e,Pq\)/);
  assert.match(transformed, /f\.initializeSync\(\)/);
});

test("supported patch sets mount the local thread catalog bridge for generated fixtures", () => {
  const cases = [
    ["codex-26.623.41415-4505", "statsig-startup", "MQ", "vDe"],
    ["codex-26.623.42026-4514", "statsig-startup", "VG", "RG"],
    ["codex-26.623.61825-4548", "statsig-startup", "tG", "QW"],
    ["codex-26.623.70822-4559", "app-shell", "$H", "XH"],
  ];

  for (const [patchSetId, patchId, jsxNamespace, componentName] of cases) {
    const patchSet = patchSets.find((candidate) => candidate.id === patchSetId);
    const transform = patchId === "statsig-startup"
      ? collectFileTransforms(patchSet).find(([, candidate]) => candidate.name === "patchStatsigDevFallback")?.[1]
      : findTransform(patchSet, patchId);
    assert.equal(typeof transform, "function", `${patchSet.id} has local thread catalog bootstrap transform`);
    const fakeBundle = [
      `function YH(e){let t=(0,ZH.c)(5),n;t[0]===e?n=t[1]:(n=e===void 0?{}:e,t[0]=e,t[1]=n);let{enabled:r}=n,i=u_(\`567837310\`),a=S_.localThreadCatalog,o;return t[2]!==r||t[3]!==i?(o=!(r??i)||a==null?null:(0,${jsxNamespace}.jsx)(${componentName},{service:a}),t[2]=r,t[3]=i,t[4]=o):o=t[4],o}`,
      "function xdn(e){let t=(0,Cdn.c)(4),{onRetry:n}=e",
      "children:[r,(0,NK.jsx)(Ud,{color:`secondary`,size:`default`,onClick:n,children:i})]",
      "fallback:e=>(0,NK.jsx)(xdn,{onRetry:()=>{e.resetError()}})",
    ].join(";");

    const transformed = transform(fakeBundle);

    assert.ok(
      transformed.includes(
        `o=globalThis.__CodexPlusRuntimeConfig?.devModeStatsigFallback===true?r===!1||a==null?null:(0,${jsxNamespace}.jsx)(${componentName},{service:a}):!(r??i)||a==null?null:(0,${jsxNamespace}.jsx)(${componentName},{service:a})`,
      ),
      patchSetId,
    );
  }
});

test("supported local thread catalog state is enabled for generated fixtures", () => {
  const cases = [
    [
      "codex-26.623.41415-4505",
      "webview/assets/app-initial~app-main~worktree-init-v2-page~remote-conversation-page~new-thread-panel-page~o~bj5tp28r-D9_jEoo8.js",
      "var SV,CV,wV=e((()=>{d(),SV={},CV=En(SV,!1),wV=ot(W,null)}));",
      /CV=En\(SV,!0\),wV=ot\(W,null\)/,
    ],
    [
      "codex-26.623.42026-4514",
      "webview/assets/app-initial~app-main~worktree-init-v2-page~remote-conversation-page~new-thread-panel-page~o~bj5tp28r-Dcs9S3fj.js",
      "var qB,JB,YB=e((()=>{d(),qB={},JB=Qd(qB,!1),YB=S(q,null)}));",
      /JB=Qd\(qB,!0\),YB=S\(q,null\)/,
    ],
    [
      "codex-26.623.61825-4548",
      "webview/assets/app-initial~app-main~worktree-init-v2-page~remote-conversation-page~pull-requests-page~plug~fjtgnfyk-DDle9LSA.js",
      "var jY,MY,NY=e((()=>{W(),d(),jY={},MY=te(T,!1),NY=te(T,jY)}));",
      /MY=te\(T,!0\),NY=te\(T,jY\)/,
    ],
    [
      "codex-26.623.70822-4559",
      "webview/assets/app-initial~app-main~worktree-init-v2-page~remote-conversation-page~new-thread-panel-page~o~ko8xg8gw-DEdbMp8p.js",
      "var eQ,tQ,nQ,rQ=e((()=>{W(),d(),eQ={},tQ=R(m,!1),nQ=R(m,eQ)}));",
      /tQ=R\(m,!0\),nQ=R\(m,eQ\)/,
    ],
  ];

  for (const [patchSetId, expectedFilePath, source, expected] of cases) {
    const patchSet = patchSets.find((candidate) => candidate.id === patchSetId);
    const transformEntry = collectFileTransforms(patchSet)
      .find(([, candidate]) => candidate.name === "patchLocalThreadCatalogEnabled");
    assert.ok(transformEntry, `${patchSet.id} has local thread catalog state transform`);
    const [filePath, transform] = transformEntry;

    assert.equal(filePath, expectedFilePath);
    assert.match(transform(source), expected);
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
  assert.match(devToolsPlugin, /CodexPlusHost\.adapters\.native\.request\("devtools\/open"\)/);

  for (const patchSet of codexPatchSets) {
    const filePath = findTransformPath(patchSet, "electron-menu-shortcuts");
    const transform = findTransform(patchSet, "electron-menu-shortcuts");
    {
      const transformed = transform(fakeElectronMenuShortcutsBundle);
      const commandStart = transformed.indexOf("{id:`codexPlus.focusProjectSelector`");
      const commandEnd = transformed.indexOf("},{id:`toggleBottomPanel`");
      const commandMetadata = transformed.slice(commandStart, commandEnd);

      assert.notEqual(commandStart, -1, `${filePath} inserts runtime command metadata`);
      assert.match(transformed, /id:`codexPlus\.focusProjectSelector`/);
      assert.match(transformed, /title:`Focus project selector`/);
      assert.match(transformed, /description:`Focus or open the new chat project selector`/);
      assert.match(transformed, /commandMenuGroupKey:`workspace`/);
      assert.match(transformed, /menuTitle:`Focus project selector`/);
      assert.match(transformed, /defaultKeybindings:\[\{key:`CmdOrCtrl\+\.`\}\]/);
      assert.match(transformed, /id:`codexPlusToggleSidebarNameBlur`/);
      assert.match(transformed, /title:`Toggle sidebar blur`/);
      assert.match(transformed, /description:`Blur or show sidebar chat and project names`/);
      assert.match(transformed, /menuTitle:`Toggle sidebar blur`/);
      assert.doesNotMatch(commandMetadata, /CodexPlusHost|CodexPlus\.commands/);
      assert.doesNotMatch(commandMetadata, /id:`codexPlusOpenDevTools`/);
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
  const fake101652KeyboardShortcutsSearchBundle = [
    "\"codex.command.toggleSidebar\":{id:`codex.command.toggleSidebar`,defaultMessage:`Toggle sidebar`,description:`Command menu item to toggle the sidebar`},\"codex.command.toggleBottomPanel\":",
    "\"codex.commandMenuTitle.toggleSidebar\":{id:`codex.commandMenuTitle.toggleSidebar`,defaultMessage:`Toggle Sidebar`,description:`Native menu item to toggle the sidebar`},\"codex.commandMenuTitle.toggleBottomPanel\":",
    "\"codex.commandDescription.toggleSidebar\":{id:`codex.commandDescription.toggleSidebar`,defaultMessage:`Show or hide the sidebar`,description:`Description for the Toggle sidebar command`},\"codex.commandDescription.toggleBottomPanel\":",
    "function rY(e,t){return`titleIntlId`in e?aY(oY,e.titleIntlId)?t.formatMessage(oY[e.titleIntlId]):``:t.formatMessage(sY[e.electron.menuTitleIntlId])}",
  ].join("");

  for (const patchSet of codexPatchSets) {
    const transform = findTransform(patchSet, "keyboard-shortcuts-search-input");
    const fakeBundle = (patchSet.id === "codex-26.623.141536-4753" || patchSet.id === "codex-26.623.101652-4674")
      ? fake101652KeyboardShortcutsSearchBundle
      : fakeKeyboardShortcutsSearchBundle;

    assert.equal(typeof transform, "function", `${patchSet.id} has keyboard shortcut search transform`);

    const transformed = transform(fakeBundle);

    assert.doesNotMatch(transformed, /codexPlus\.command\.toggleSidebarNameBlur/);
    if ((patchSet.id === "codex-26.623.141536-4753" || patchSet.id === "codex-26.623.101652-4674")) {
      assert.match(transformed, /t\.formatMessage\(oY\[e\.titleIntlId\]\)/);
      assert.match(transformed, /e\.title\?\?e\.electron\?\.menuTitle\?\?t\.formatMessage\(sY\[e\.electron\.menuTitleIntlId\]\)/);
    } else {
      assert.match(transformed, /t\.formatMessage\(c\[e\.titleIntlId\]\)/);
      assert.match(transformed, /e\.title\?\?e\.electron\?\.menuTitle\?\?t\.formatMessage\(l\[e\.electron\.menuTitleIntlId\]\)/);
    }
  }
});

test("command menu appends Codex Plus runtime command metadata", () => {
  for (const patchSet of codexPatchSets) {
    const commandMenuTransform = collectFileTransforms(patchSet).find(([, transform]) => transform.name === "patchCommandMenuRuntimeCommands");
    const transform = commandMenuTransform?.[1];
    if (patchSet.id === "codex-26.616.51431-4212" || patchSet.id === "codex-26.616.41845-4198") {
      assert.equal(commandMenuTransform?.[0], "webview/assets/keyboard-shortcuts-settings-DxvtyZ5m.js");
    }
    const fakeCommandMenuBundle = patchSet.id === "codex-26.623.31921-4452"
      ? "let m=ne?N.filter(VZ):N,_;"
      : patchSet.id.startsWith("codex-26.616.")
        ? "de=F.filter(P);"
        : "let M=j,N;t[11]===o?N=t[12]:(N=()=>{o(``)},t[11]=o,t[12]=N);";

    assert.equal(typeof transform, "function", `${patchSet.id} has command menu runtime transform`);

    const transformed = transform(fakeCommandMenuBundle);

    assert.match(transformed, /globalThis\.CodexPlusHost\.adapters\.commands\.metadata/);
    if (patchSet.id === "codex-26.623.31921-4452") {
      assert.match(transformed, /filter\(e=>!N\.some\(t=>t\.id===e\.id\)\)/);
    } else if (patchSet.id.startsWith("codex-26.616.")) {
      assert.match(transformed, /filter\(e=>!F\.some\(t=>t\.id===e\.id\)\)/);
    } else {
      assert.match(transformed, /filter\(e=>!j\.some\(t=>t\.id===e\.id\)\)/);
    }
    assert.doesNotMatch(transformed, /codexPlusToggleSidebarNameBlur/);
    assert.doesNotMatch(transformed, /Toggle sidebar blur/);
  }
});

test("project colors avoid sidebar row cache-slot forwarding", () => {
  const commonPatches = fs.readFileSync(path.join(__dirname, "../src/patches/lib/common-patches.js"), "utf8");

  assert.doesNotMatch(commonPatches, /patchSidebarProjectHoverCardSourceRows/);
  assert.doesNotMatch(commonPatches, /patchRendererCommandPaletteSidebarBlur/);
  assert.doesNotMatch(commonPatches, /CPX_rowDataAttributes/);
  assert.doesNotMatch(commonPatches, /t\[\d+\].*CPX_rowDataAttributes|CPX_rowDataAttributes.*t\[\d+\]/);

  for (const patchSet of codexPatchSets) {
    const transforms = collectFileTransforms(patchSet).map(([, transform]) => transform.name);
    assert.ok(!transforms.includes("patchSidebarProjectHoverCardSourceRows"), `${patchSet.id} does not patch sidebar row caches`);
    assert.ok(!transforms.includes("patchRendererCommandPaletteSidebarBlur"), `${patchSet.id} uses one command metadata hook`);
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

  for (const patchSet of codexPatchSets) {
    const names = versionedNames(patchSet);
    const userMessageAttachmentsFile = findTransformPath(patchSet, "user-message-attachments");
    const fakeBundle = patchSet.id === "codex-26.623.31921-4452"
      ? [
        "function IVe({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){",
        "return(0,HU.jsx)(`form`,{className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),v()},children:",
        "he=V?(0,KU.jsx)(`div`,{className:`w-full p-px`,children:(0,KU.jsx)(IVe,{cwd:x??null,hostId:S,initialMessage:B.trim(),onCancel:()=>{ie(null)},onDraftChange:e=>{ie(e)},onSubmit:oe})}):q?(0,KU.jsx)(`div`,{\"data-user-message-bubble\":!0,role:L?`button`:void 0,tabIndex:0,className:Y(e,`text-left focus-visible:ring-2 focus-visible:outline-none`,L&&`cursor-interaction`),",
      ].join("")
      : patchSet.id === "codex-26.623.41415-4505"
      ? [
        "function qVn({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){",
        "return(0,b1.jsx)(`form`,{className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),v()},children:",
        "me=B?(0,S1.jsx)(`div`,{className:`w-full p-px`,children:(0,S1.jsx)(qVn,{cwd:x??null,hostId:S,initialMessage:z.trim(),onCancel:()=>{ie(null)},onDraftChange:e=>{ie(e)},onSubmit:oe})}):G?(0,S1.jsx)(`div`,{\"data-user-message-bubble\":!0,role:I?`button`:void 0,tabIndex:0,className:Y(e,`text-left focus-visible:ring-2 focus-visible:ring-token-focus-border focus-visible:outline-none`,I&&`cursor-interaction`),",
      ].join("")
      : patchSet.id === "codex-26.623.42026-4514"
        ? [
          "function xst({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){",
          "return(0,HK.jsx)(`form`,{className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),v()},children:",
          "fe=V?(0,KK.jsx)(`div`,{className:`w-full p-px`,children:(0,KK.jsx)(xst,{cwd:x??null,hostId:S,initialMessage:z.trim(),onCancel:()=>{ne(null)},onDraftChange:e=>{ne(e)},onSubmit:ie})}):q?(0,KK.jsx)(`div`,{\"data-user-message-bubble\":!0,role:I?`button`:void 0,tabIndex:0,className:Y(e,`text-left focus-visible:ring-2 focus-visible:outline-none`,I&&`cursor-interaction`),",
        ].join("")
      : patchSet.id === "codex-26.623.70822-4559"
        ? [
          "function ZB(e){let t=(0,$B.c)(94),",
          "function vRe({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){",
          "return(0,XB.jsx)(`form`,{className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),v()},children:",
          "he=H?(0,tV.jsx)(`div`,{className:`w-full p-px`,children:(0,tV.jsx)(vRe,{cwd:x??null,hostId:S,initialMessage:V.trim(),onCancel:()=>{oe(null)},onDraftChange:e=>{oe(e)},onSubmit:ce})}):te?(0,tV.jsx)(`div`,{\"data-user-message-bubble\":!0,role:R?`button`:void 0,",
        ].join("")
      : patchSet.id === "codex-26.623.141536-4753"
        ? [
          "function Uqt({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){",
          "return(0,NZ.jsx)(`form`,{className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),v()},children:",
          "me=B?(0,FZ.jsx)(`div`,{className:`w-full p-px`,children:(0,FZ.jsx)(Uqt,{cwd:x??null,hostId:S,initialMessage:z.trim(),onCancel:()=>{ie(null)},onDraftChange:e=>{ie(e)},onSubmit:oe})}):ee?(0,FZ.jsx)(`div`,{\"data-user-message-bubble\":!0,role:I?`button`:void 0,tabIndex:0,className:$(e,`text-left focus-visible:ring-2 focus-visible:ring-token-focus-border focus-visible:outline-none`,I&&`cursor-interaction`),",
        ].join("")
      : patchSet.id === "codex-26.623.101652-4674"
        ? [
          "function Wxn({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){",
          "return(0,l9.jsx)(`form`,{className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),v()},children:",
          "ve=B?(0,d9.jsx)(`div`,{className:`w-full p-px`,children:(0,d9.jsx)(Wxn,{cwd:x??null,hostId:S,initialMessage:z.trim(),onCancel:()=>{H(null)},onDraftChange:e=>{H(e)},onSubmit:ue})}):ie?(0,d9.jsx)(`div`,{\"data-user-message-bubble\":!0,role:I?`button`:void 0,tabIndex:0,className:Q(e,`text-left focus-visible:ring-2 focus-visible:ring-token-focus-border focus-visible:outline-none`,I&&`cursor-interaction`),",
        ].join("")
      : patchSet.id === "codex-26.623.81905-4598" || patchSet.id === "codex-26.623.61825-4548"
        ? [
          "function Kc({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){",
          "return(0,Jc.jsx)(`form`,{className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),v()},children:",
          "ve=B?(0,Y.jsx)(`div`,{className:`w-full p-px`,children:(0,Y.jsx)(Kc,{cwd:x??null,hostId:S,initialMessage:ee.trim(),onCancel:()=>{W(null)},onDraftChange:e=>{W(e)},onSubmit:de})}):re?(0,Y.jsx)(`div`,{\"data-user-message-bubble\":!0,role:L?`button`:void 0,",
        ].join("")
      : fakeUserMessageBundle.replace("__SRC_FILE__", names.srcFile);
    const transforms = collectFileTransforms(patchSet).filter(
      ([filePath]) => filePath === userMessageAttachmentsFile,
    );

    assert.ok(transforms.length >= 2, `${patchSet.id} has user message feature transforms`);

    const transformed = transformFile(patchSet, userMessageAttachmentsFile, fakeBundle);

    assert.match(transformed, /CPXMC=window\.CodexPlusHost\.adapters\.messageComposer/);
    assert.match(transformed, /CPXBubbleProps=e=>CPXMC\.userBubbleProps\(e\)/);
    assert.doesNotMatch(transformed, /CPX_USER_BUBBLE_OVERRIDE_KEY/);
    assert.doesNotMatch(transformed, /CPX_userBubbleOverrideEnabled/);
    assert.doesNotMatch(transformed, /function CPX_projectColorStyle\(e\)/);
    if (patchSet.id === "codex-26.623.31921-4452") {
      assert.match(transformed, /"data-user-message-bubble":!0,\.\.\.CPXBubbleProps\(\{project:\{cwd:x,hostId:S\}\}\),role:L\?`button`:void 0/);
      assert.match(transformed, /"data-codex-plus-user-entry":!0,className:`relative flex w-full flex-col rounded-3xl bg-token-foreground\/5`/);
      assert.doesNotMatch(transformed, /CPX_localThreadKey/);
      assert.doesNotMatch(transformed, /CPX_threadProjectId/);
      continue;
    }
    if (patchSet.id === "codex-26.623.41415-4505") {
      assert.match(transformed, /"data-user-message-bubble":!0,\.\.\.CPXBubbleProps\(\{project:\{cwd:x,hostId:S\}\}\),role:I\?`button`:void 0/);
      assert.match(transformed, /"data-codex-plus-user-entry":!0,className:`relative flex w-full flex-col rounded-3xl bg-token-foreground\/5`/);
      assert.doesNotMatch(transformed, /CPX_localThreadKey/);
      assert.doesNotMatch(transformed, /CPX_threadProjectId/);
      continue;
    }
    if (patchSet.id === "codex-26.623.42026-4514") {
      assert.match(transformed, /"data-user-message-bubble":!0,\.\.\.CPXBubbleProps\(\{project:\{cwd:x,hostId:S\}\}\),role:I\?`button`:void 0/);
      assert.match(transformed, /"data-codex-plus-user-entry":!0,className:`relative flex w-full flex-col rounded-3xl bg-token-foreground\/5`/);
      assert.doesNotMatch(transformed, /CPX_localThreadKey/);
      assert.doesNotMatch(transformed, /CPX_threadProjectId/);
      continue;
    }
    if (patchSet.id === "codex-26.623.70822-4559") {
      assert.match(transformed, /"data-user-message-bubble":!0,\.\.\.CPXBubbleProps\(\{project:\{cwd:x,hostId:S\}\}\),role:R\?`button`:void 0/);
      assert.match(transformed, /"data-codex-plus-user-entry":!0,className:`relative flex w-full flex-col rounded-3xl bg-token-foreground\/5`/);
      assert.doesNotMatch(transformed, /CPX_localThreadKey/);
      assert.doesNotMatch(transformed, /CPX_threadProjectId/);
      continue;
    }
    if ((patchSet.id === "codex-26.623.141536-4753" || patchSet.id === "codex-26.623.101652-4674")) {
      assert.match(transformed, /"data-user-message-bubble":!0,\.\.\.CPXBubbleProps\(\{project:\{cwd:x,hostId:S\}\}\),role:I\?`button`:void 0/);
      assert.match(transformed, /"data-codex-plus-user-entry":!0,className:`relative flex w-full flex-col rounded-3xl bg-token-foreground\/5`/);
      assert.doesNotMatch(transformed, /CPX_localThreadKey/);
      assert.doesNotMatch(transformed, /CPX_threadProjectId/);
      continue;
    }
    if (patchSet.id === "codex-26.623.81905-4598" || patchSet.id === "codex-26.623.61825-4548") {
      assert.match(transformed, /"data-user-message-bubble":!0,\.\.\.CPXBubbleProps\(\{project:\{cwd:x,hostId:S\}\}\),role:L\?`button`:void 0/);
      assert.match(transformed, /"data-codex-plus-user-entry":!0,className:`relative flex w-full flex-col rounded-3xl bg-token-foreground\/5`/);
      assert.doesNotMatch(transformed, /CPX_localThreadKey/);
      assert.doesNotMatch(transformed, /CPX_threadProjectId/);
      continue;
    }
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
  assert.match(bubblePlugin, /\[data-codex-plus-user-entry\]:not\(:has\(\[data-codex-plus-user-bubble\]\)\)/);
  assert.match(bubblePlugin, /\[data-codex-plus-user-entry\]:has\(\[data-codex-plus-user-bubble\]\)\{background-color:transparent!important;box-shadow:none!important\}/);
  assert.match(bubblePlugin, /\[data-codex-plus-user-bubble\]:has\(\[data-user-message-bubble\]\)\{background-color:transparent!important;box-shadow:none!important;border-left:0!important\}/);
  assert.match(bubblePlugin, /\[data-codex-plus-user-bubble\] \[data-user-message-bubble\].*background-color:var\(--codex-plus-user-bubble-light-bg\).*color:var\(--codex-plus-user-bubble-light-fg\)/);
  assert.match(bubblePlugin, /:root\.dark \[data-codex-plus-user-bubble\] \[data-user-message-bubble\] ~ \*.*color:var\(--color-token-text-tertiary\)!important/);
  assert.doesNotMatch(bubblePlugin, /:is\(\[data-codex-plus-user-bubble\],\[data-codex-plus-user-entry\]\)\{background-color/);
  assert.match(bubblePlugin, /\[data-codex-plus-user-entry\] :is\(\.ProseMirror,\.ProseMirror \*,\[data-codex-plus-rich-content\],\[data-codex-plus-rich-content\] \*\).*color:var\(--codex-plus-user-bubble-light-fg\)!important.*opacity:1!important.*-webkit-text-fill-color:currentColor!important/);
  assert.match(bubblePlugin, /\[data-codex-plus-user-bubble\] :is\(h1,h2,h3,h4,h5,h6,p,li,blockquote,table,thead,tbody,tr,th,td,code,a,span,\[class\*="text-token"\],\[class\*="opacity-"\]\).*color:var\(--codex-plus-user-bubble-light-fg\)!important/);
  assert.match(bubblePlugin, /\[data-codex-plus-user-entry\] :is\(button,\[role="button"\]\):not\(\[class\*="bg-token-foreground-inverse"\]\):not\(\[class\*="bg-token-foreground-primary"\]\):not\(\[class\*="bg-token-foreground-button"\]\).*opacity:1!important.*color:var\(--codex-plus-user-bubble-light-fg\)!important/);
  assert.match(bubblePlugin, /\[data-codex-plus-user-entry\] :is\(button,\[role="button"\]\):not\(\[class\*="bg-token-foreground-inverse"\]\):not\(\[class\*="bg-token-foreground-primary"\]\):not\(\[class\*="bg-token-foreground-button"\]\) \*.*color:inherit!important.*stroke:currentColor!important/);
  assert.match(bubblePlugin, /--codex-plus-user-bubble-dark-fg\)!important.*opacity:1!important.*-webkit-text-fill-color:currentColor!important/);
  assert.match(bubblePlugin, /button\[aria-disabled="true"\]/);
  assert.match(bubblePlugin, /opacity:1!important/);
  assert.match(bubblePlugin, /color:var\(--codex-plus-user-bubble-light-fg\)!important/);
  assert.match(bubblePlugin, /color:var\(--codex-plus-user-bubble-dark-fg\)!important/);
  assert.match(bubblePlugin, /\[data-codex-plus-user-entry\] :is\(button,\[role="button"\]\):is\(\[class\*="rounded-full"\],\[class\*="rounded-"\]\):is\(\[class\*="bg-token-foreground"\],\[class\*="bg-token-input"\],\[class\*="bg-token-dropdown"\]\)/);
  assert.match(bubblePlugin, /background-color:color-mix\(in srgb,var\(--codex-plus-user-bubble-light-fg\) 14%,var\(--codex-plus-user-bubble-light-bg\)\)!important/);
  assert.match(bubblePlugin, /background-color:color-mix\(in srgb,var\(--codex-plus-user-bubble-dark-fg\) 14%,var\(--codex-plus-user-bubble-dark-bg\)\)!important/);
  assert.match(bubblePlugin, /:is\(:hover,:focus-visible,:active,\[data-state="open"\],\[aria-expanded="true"\]\)\{background-color:color-mix\(in srgb,var\(--codex-plus-user-bubble-light-fg\) 14%,var\(--codex-plus-user-bubble-light-bg\)\)!important;background-image:none!important/);
  assert.match(bubblePlugin, /:is\(:hover,:focus-visible,:active,\[data-state="open"\],\[aria-expanded="true"\]\).*background-color:color-mix\(in srgb,var\(--codex-plus-user-bubble-dark-fg\) 14%,var\(--codex-plus-user-bubble-dark-bg\)\)!important;background-image:none!important/);
  assert.match(bubblePlugin, /\[data-codex-plus-user-entry\] \[data-composer-attachment-pill\]\{background-color:color-mix\(in srgb,#000 62%,var\(--codex-plus-user-bubble-light-bg\)\)!important.*color:#fff!important.*opacity:1!important/);
  assert.match(bubblePlugin, /\[data-codex-plus-user-entry\] \[data-composer-attachment-pill\]:is\(:hover,:focus-visible,:active,\[data-state="open"\],\[aria-expanded="true"\]\)\{background-color:color-mix\(in srgb,#000 62%,var\(--codex-plus-user-bubble-light-bg\)\)!important;background-image:none!important;color:#fff!important/);
  assert.match(bubblePlugin, /\[data-codex-plus-user-entry\] \[data-composer-attachment-pill\] :is\(\[role="button"\],\[role="button"\] span,\[class\*="bg-token-menu-background"\]\)\{background-color:color-mix\(in srgb,#000 52%,var\(--codex-plus-user-bubble-light-bg\)\)!important;color:#fff!important/);
  assert.match(bubblePlugin, /\[data-codex-plus-user-entry\] \[data-composer-attachment-pill\] \[role="button"\]::before\{background:linear-gradient\(to right,transparent,color-mix\(in srgb,#000 62%,var\(--codex-plus-user-bubble-light-bg\)\) 55%,color-mix\(in srgb,#000 62%,var\(--codex-plus-user-bubble-light-bg\)\)\)!important\}/);
  assert.match(bubblePlugin, /\[data-codex-plus-user-entry\] \[data-composer-attachment-pill\].*background-color:color-mix\(in srgb,#000 62%,var\(--codex-plus-user-bubble-dark-bg\)\)!important.*color:#fff!important.*opacity:1!important/);
  assert.match(bubblePlugin, /\[data-codex-plus-user-entry\] \[data-composer-attachment-pill\] \[role="button"\]::before.*background:linear-gradient\(to right,transparent,color-mix\(in srgb,#000 62%,var\(--codex-plus-user-bubble-dark-bg\)\) 55%,color-mix\(in srgb,#000 62%,var\(--codex-plus-user-bubble-dark-bg\)\)\)!important/);
  assert.match(bubblePlugin, /:not\(\[class\*="bg-token-foreground-primary"\]\):not\(\[class\*="bg-token-foreground-button"\]\)/);
  assert.match(bubblePlugin, /stroke:currentColor!important/);
  assert.match(bubblePlugin, /\[data-codex-plus-user-entry\] \[data-composer-attachment-pill\] \*\{color:inherit!important;opacity:1!important;stroke:currentColor!important;-webkit-text-fill-color:currentColor!important\}/);
  assert.match(bubblePlugin, /\[data-codex-plus-user-entry\] \[data-composer-attachment-pill\] \*,:root\.electron-dark \[data-codex-plus-user-entry\] \[data-composer-attachment-pill\] \*\{color:inherit!important;opacity:1!important;stroke:currentColor!important;-webkit-text-fill-color:currentColor!important\}/);
  assert.match(bubblePlugin, /\[data-composer-attachment-pill\]\{background-color:color-mix\(in srgb,#000 62%,var\(--codex-plus-user-bubble-light-bg\)\)!important.*color:#fff!important/);
  assert.match(bubblePlugin, /\[data-composer-attachment-pill\] :is\(\*,\[class\*="text-token"\],\[class\*="opacity-"\]\)\{color:inherit!important;opacity:1!important;stroke:currentColor!important;-webkit-text-fill-color:currentColor!important\}/);
  assert.match(bubblePlugin, /\[data-composer-attachment-pill\],:root\.electron-dark \[data-composer-attachment-pill\]\{background-color:color-mix\(in srgb,#000 62%,var\(--codex-plus-user-bubble-dark-bg\)\)!important.*color:#fff!important/);
  assert.match(bubblePlugin, /\[data-codex-plus-user-entry\] \.composer-attachment-surface\{background-color:color-mix\(in srgb,#000 62%,var\(--codex-plus-user-bubble-light-bg\)\)!important.*color:#fff!important.*opacity:1!important/);
  assert.match(bubblePlugin, /\[data-codex-plus-user-entry\] \.composer-attachment-surface :is\(\*,\[class\*="text-token"\],\[class\*="opacity-"\]\)\{color:inherit!important;opacity:1!important;stroke:currentColor!important;-webkit-text-fill-color:currentColor!important\}/);
  assert.match(bubblePlugin, /\[data-codex-plus-user-entry\] \.composer-attachment-surface,:root\.electron-dark \[data-codex-plus-user-entry\] \.composer-attachment-surface\{background-color:color-mix\(in srgb,#000 62%,var\(--codex-plus-user-bubble-dark-bg\)\)!important.*color:#fff!important/);
  assert.match(bubblePlugin, /-webkit-text-fill-color:currentColor!important/);
  assert.match(bubblePlugin, /background-image:none!important/);
});

test("composer patch applies the user entry marker and shared color variables", () => {
  const fakeComposerBundle = [
    'import{$t as q,A as oe,At as se,Ca as ce,D as J,Dt as le,Ea as ue,Fi as de,Ht as fe,Ii as pe,It as me,J as he,Jn as ge,Li as _e,Lt as ve,M as ye,Mi as be,Mt as xe,Pi as Se,Ri as Ce,Sa as we,T as Te,Vt as Ee,Yn as De,Zi as Oe,an as ke,bt as Ae,cn as je,dt as Me,en as Ne,ft as Pe,in as Fe,kt as Ie,ln as Le,m as Re,n as ze,on as Be,ot as Ve,p as He,pa as Ue,ra as We,rn as Ge,sn as Ke,st as qe,tr as Je,vt as Ye,xa as Xe,yt as Ze,z as Qe}from"./__THREAD_CONTEXT_INPUTS_FILE__";',
    "function oh(e){let t=(0,$.c)(13),{children:n,className:r,externalFooterVariant:i,inert:a,isDragActive:o,layout:s,onDragEnter:c,onDragLeave:l,onDragOver:u,onDrop:d}=e,f=i===void 0?`default`:i,p=o===void 0?!1:o,m=s===void 0?`multiline`:s,h=f===`home`&&`z-10`,g=m===`single-line`?`overflow-visible rounded-full`:rh.multilineSurface,_=p&&`bg-token-dropdown-background/50`,v;t[0]!==r||t[1]!==h||t[2]!==g||t[3]!==_?(v=qt(`relative flex flex-col border border-token-input-border bg-token-input-background/90 shadow-[0_4px_16px_0_rgba(0,0,0,0.05)] backdrop-blur-lg electron:dark:bg-token-dropdown-background`,h,g,_,r),t[0]=r,t[1]=h,t[2]=g,t[3]=_,t[4]=v):v=t[4];let y;return t[5]!==n||t[6]!==a||t[7]!==c||t[8]!==l||t[9]!==u||t[10]!==d||t[11]!==v?(y=(0,Q.jsx)(Jt.div,{inert:a,className:v,onDragEnter:c,onDragOver:u,onDragLeave:l,onDrop:d,children:n}),t[5]=n,t[6]=a,t[7]=c,t[8]=l,t[9]=u,t[10]=d,t[11]=v,t[12]=y):y=t[12],y}",
    "Il=(0,Q.jsx)(_n,{onOpen:()=>{Bc.prepare(),X.toggleContextSuggestions()}});return",
    "):(0,Q.jsxs)(ah,{className:A,externalFooterVariant:k,inert:Y,isDragActive:jo,layout:Nl,onDragEnter:kl?void 0:il,onDragOver:kl?void 0:sl,onDragLeave:kl?void 0:al,onDrop:kl?void 0:ll,children:",
  ].join("");

  for (const patchSet of codexPatchSets) {
    const names = versionedNames(patchSet);
    const composerFile = findTransformPath(patchSet, "composer");
    let fakeBundle = patchSet.id === "codex-26.623.31921-4452"
      ? [
        "function II(e){let t=(0,XI.c)(13),{children:n,className:r,externalFooterVariant:i,inert:a,isDragActive:o,layout:s,onDragEnter:c,onDragLeave:l,onDragOver:u,onDrop:d}=e,f=i===void 0?`default`:i,p=o===void 0?!1:o,m=s===void 0?`multiline`:s,h=f===`home`&&`z-10`,g=m===`single-line`?`overflow-visible rounded-full`:dh.multilineSurface,_=p&&`bg-token-dropdown-background/50`,v;t[0]!==r||t[1]!==h||t[2]!==g||t[3]!==_?(v=qt(`relative flex flex-col border border-token-input-border bg-token-input-background/90 shadow-[0_4px_16px_0_rgba(0,0,0,0.05)] backdrop-blur-lg electron:dark:bg-token-dropdown-background`,h,g,_,r),t[0]=r,t[1]=h,t[2]=g,t[3]=_,t[4]=v):v=t[4];let y;return t[5]!==n||t[6]!==a||t[7]!==c||t[8]!==l||t[9]!==u||t[10]!==d||t[11]!==v?(y=(0,ZI.jsx)(T.div,{inert:a,className:v,onDragEnter:c,onDragOver:u,onDragLeave:l,onDrop:d,children:n}),t[5]=n,t[6]=a,t[7]=c,t[8]=l,t[9]=u,t[10]=d,t[11]=v,t[12]=y):y=t[12],y}",
        "(0,$q.jsx)(Yq,{className:O,externalFooterVariant:D,hasDropTargetPortal:_c,",
      ].join("")
      : patchSet.id === "codex-26.623.41415-4505"
      ? [
        "function Wbe(e){let t=(0,gW.c)(13),",
        "{children:n,className:r,externalFooterVariant:i,inert:a,isDragActive:o,layout:s,onDragEnter:c,onDragLeave:l,onDragOver:u,onDrop:d}=e,",
        "return t[5]!==n||t[6]!==a||t[7]!==c||t[8]!==l||t[9]!==u||t[10]!==d||t[11]!==v?(y=(0,_W.jsx)(Su.div,{inert:a,className:v,onDragEnter:c,onDragOver:u,onDragLeave:l,onDrop:d,children:n}),t[5]=n,t[6]=a,t[7]=c,t[8]=l,t[9]=u,t[10]=d,t[11]=v,t[12]=y):y=t[12],y}",
        "Ls=(0,PY.jsx)(Lte,{active:Ra.ui?.active===!0&&Ra.ui.activation===`synthetic`,onOpen:()=>{ns.prepare(),fn.toggleContextSuggestions()}});return",
        "(0,PY.jsx)(sEe,{className:w,externalFooterVariant:C,hasDropTargetPortal:As,",
      ].join("")
      : patchSet.id === "codex-26.623.42026-4514"
        ? [
          "function FN(e){let t=(0,YN.c)(13),{children:n,className:r,externalFooterVariant:i,inert:a,isDragActive:o,layout:s,onDragEnter:c,onDragLeave:l,onDragOver:u,onDrop:d}=e,f=i===void 0?`default`:i,p=o===void 0?!1:o,m=s===void 0?`multiline`:s,h=f===`home`&&`z-10`,g=m===`single-line`?`overflow-visible rounded-full`:dh.multilineSurface,_=p&&`bg-token-dropdown-background/50`,v;t[0]!==r||t[1]!==h||t[2]!==g||t[3]!==_?(v=qt(`relative flex flex-col border border-token-input-border bg-token-input-background/90 shadow-[0_4px_16px_0_rgba(0,0,0,0.05)] backdrop-blur-lg electron:dark:bg-token-dropdown-background`,h,g,_,r),t[0]=r,t[1]=h,t[2]=g,t[3]=_,t[4]=v):v=t[4];let y;return t[5]!==n||t[6]!==a||t[7]!==c||t[8]!==l||t[9]!==u||t[10]!==d||t[11]!==v?(y=(0,XN.jsx)(Fm.div,{inert:a,className:v,onDragEnter:c,onDragOver:u,onDragLeave:l,onDrop:d,children:n}),t[5]=n,t[6]=a,t[7]=c,t[8]=l,t[9]=u,t[10]=d,t[11]=v,t[12]=y):y=t[12],y}",
          "function Ss(e){if(H?.type!==`local`",
          "(0,iW.jsx)(eW,{className:A,externalFooterVariant:k,hasDropTargetPortal:fc,",
        ].join("")
      : patchSet.id === "codex-26.623.70822-4559"
        ? [
          "function iL(e){let t=(0,vL.c)(13),{children:n,className:r,externalFooterVariant:i,inert:a,isDragActive:o,layout:s,onDragEnter:c,onDragLeave:l,onDragOver:u,onDrop:d}=e,f=i===void 0?`default`:i,p=o===void 0?!1:o,m=s===void 0?`multiline`:s,h=f===`home`&&`z-10`,g=m===`single-line`?`overflow-visible rounded-full`:XL.multilineSurface,_=p&&`bg-token-dropdown-background/50`,v;t[0]!==r||t[1]!==h||t[2]!==g||t[3]!==_?(v=bi(`composer-surface-chrome relative flex flex-col bg-token-input-background/90 backdrop-blur-lg electron:dark:bg-token-dropdown-background`,h,g,_,r),t[0]=r,t[1]=h,t[2]=g,t[3]=_,t[4]=v):v=t[4];let y;return t[5]!==n||t[6]!==a||t[7]!==c||t[8]!==l||t[9]!==u||t[10]!==d||t[11]!==v?(y=(0,yL.jsx)(Gs.div,{inert:a,className:v,onDragEnter:c,onDragOver:u,onDragLeave:l,onDrop:d,children:n}),t[5]=n,t[6]=a,t[7]=c,t[8]=l,t[9]=u,t[10]=d,t[11]=v,t[12]=y):y=t[12],y}",
          "Qc=(0,nJ.jsx)(Vm,{active:Go.ui?.active===!0&&Go.ui.activation===`synthetic`,onOpen:()=>{fc.prepare(),Tn.toggleContextSuggestions()}});return",
          "):(0,nJ.jsx)(Qq,{className:k,externalFooterVariant:O,hasDropTargetPortal:Uc,blockReason:Hr,isDragActive:io,isSubmitting:wt,layout:qc,onDragEnter:wc,onDragOver:Ec,onDragLeave:Tc,onDrop:Dc,showShiftOverlay:so,",
        ].join("")
      : (patchSet.id === "codex-26.623.141536-4753" || patchSet.id === "codex-26.623.101652-4674")
        ? [
          "function vP(e){let t=(0,MP.c)(13),{children:n,className:r,externalFooterVariant:i,inert:a,isDragActive:o,layout:s,onDragEnter:c,onDragLeave:l,onDragOver:u,onDrop:d}=e,f=i===void 0?`default`:i,p=o===void 0?!1:o,m=s===void 0?`multiline`:s,h=f===`home`&&`z-10`,g=m===`single-line`?`overflow-visible rounded-full`:gP.multilineSurface,_=p&&`bg-token-dropdown-background/50`,v;t[0]!==r||t[1]!==h||t[2]!==g||t[3]!==_?(v=Y(`composer-surface-chrome relative flex flex-col bg-token-input-background/90 backdrop-blur-lg electron:dark:bg-token-dropdown-background`,h,g,_,r),t[0]=r,t[1]=h,t[2]=g,t[3]=_,t[4]=v):v=t[4];let y;return t[5]!==n||t[6]!==a||t[7]!==c||t[8]!==l||t[9]!==u||t[10]!==d||t[11]!==v?(y=(0,NP.jsx)(us.div,{inert:a,className:v,onDragEnter:c,onDragOver:u,onDragLeave:l,onDrop:d,children:n}),t[5]=n,t[6]=a,t[7]=c,t[8]=l,t[9]=u,t[10]=d,t[11]=v,t[12]=y):y=t[12],y}",
          "(0,kG.jsx)(TG,{className:O,externalFooterVariant:D,hasDropTargetPortal:Jc,",
        ].join("")
      : patchSet.id === "codex-26.623.81905-4598" || patchSet.id === "codex-26.623.61825-4548"
        ? [
          "function MN(e){let t=(0,KN.c)(13),{children:n,className:r,externalFooterVariant:i,inert:a,isDragActive:o,layout:s,onDragEnter:c,onDragLeave:l,onDragOver:u,onDrop:d}=e,f=i===void 0?`default`:i,p=o===void 0?!1:o,m=s===void 0?`multiline`:s,h=f===`home`&&`z-10`,g=m===`single-line`?`overflow-visible rounded-full`:AN.multilineSurface,_=p&&`bg-token-dropdown-background/50`,v;t[0]!==r||t[1]!==h||t[2]!==g||t[3]!==_?(v=bi(`composer-surface-chrome relative flex flex-col bg-token-input-background/90 backdrop-blur-lg electron:dark:bg-token-dropdown-background`,h,g,_,r),t[0]=r,t[1]=h,t[2]=g,t[3]=_,t[4]=v):v=t[4];let y;return t[5]!==n||t[6]!==a||t[7]!==c||t[8]!==l||t[9]!==u||t[10]!==d||t[11]!==v?(y=(0,qN.jsx)(Xo.div,{inert:a,className:v,onDragEnter:c,onDragOver:u,onDragLeave:l,onDrop:d,children:n}),t[5]=n,t[6]=a,t[7]=c,t[8]=l,t[9]=u,t[10]=d,t[11]=v,t[12]=y):y=t[12],y}",
          "(0,dW.jsx)(sW,{className:T,externalFooterVariant:w,hasDropTargetPortal:Fc,",
        ].join("")
      : fakeComposerBundle.replace("__THREAD_CONTEXT_INPUTS_FILE__", names.threadContextInputsFile);
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

    assert.ok(transforms.length >= 2, `${patchSet.id} has composer feature transforms`);

    const transformed = transformFile(patchSet, composerFile, fakeBundle);

    assert.match(transformed, /CPXMC=window\.CodexPlusHost\.adapters\.messageComposer/);
    assert.match(transformed, /CPXSurfaceProps=e=>CPXMC\.composerSurfaceProps\(e\)/);
    assert.doesNotMatch(transformed, /let CPXMC=window\.CodexPlusHost\.adapters\.messageComposer/);
    assert.match(transformed, /var CPXMC=window\.CodexPlusHost\.adapters\.messageComposer/);
    assert.doesNotMatch(transformed, /codexPlusProps:CPX_surfaceProps\}=e,CPX_surfaceProps\?\?=/);
    if (patchSet.id === "codex-26.623.31921-4452") {
      assert.match(transformed, /function II\(e\)\{let t=\(0,XI\.c\)\(13\)/);
      assert.match(transformed, /codexPlusProps:CPX_surfaceProps\}=e,CPX_resolvedSurfaceProps=CPX_surfaceProps\?\?CPXSurfaceProps\(\{\}\)/);
      assert.match(transformed, /\.\.\.CPX_resolvedSurfaceProps,className:v/);
      assert.match(transformed, /return t\[5\]!==n\|\|t\[6\]!==a\|\|t\[7\]!==c\|\|t\[8\]!==l\|\|t\[9\]!==u\|\|t\[10\]!==d\|\|t\[11\]!==v\?/);
      assert.match(transformed, /codexPlusProps:CPXSurfaceProps\(\{project:\{cwd:Cn,hostId:xr\}\}\)/);
      assert.match(transformed, /key:CPXSurfaceProps\(\{project:\{cwd:Cn,hostId:xr\}\}\)\?\.\[`data-codex-plus-project-color`\]\?\?``/);
      assert.doesNotMatch(transformed, /CPX_localThreadKey/);
      assert.doesNotMatch(transformed, /CPX_threadProjectId/);
      continue;
    }
    if (patchSet.id === "codex-26.623.41415-4505") {
      assert.match(transformed, /function Wbe\(e\)\{let t=\(0,gW\.c\)\(13\)/);
      assert.match(transformed, /codexPlusProps:CPX_surfaceProps\}=e,CPX_resolvedSurfaceProps=CPX_surfaceProps\?\?CPXSurfaceProps\(\{\}\)/);
      assert.match(transformed, /\.\.\.CPX_resolvedSurfaceProps,className:v/);
      assert.match(transformed, /CPX_composerSurfaceProps=CPXSurfaceProps\(\{project:\{cwd:ln\?\?an,hostId:\$n\}\}\)/);
      assert.match(transformed, /codexPlusProps:CPX_composerSurfaceProps/);
      assert.match(transformed, /key:CPX_composerSurfaceProps\?\.\[`data-codex-plus-project-color`\]\?\?``/);
      assert.doesNotMatch(transformed, /t\[12\]!==CPX_surfaceProps/);
      assert.doesNotMatch(transformed, /t\[12\]=CPX_surfaceProps/);
      assert.doesNotMatch(transformed, /CPX_localThreadKey/);
      assert.doesNotMatch(transformed, /CPX_threadProjectId/);
      continue;
    }
    if (patchSet.id === "codex-26.623.42026-4514") {
      assert.match(transformed, /function Ss\(e\)\{if\(H\?\.type!==`local`/);
      assert.match(transformed, /function FN\(e\)\{let t=\(0,YN\.c\)\(13\)/);
      assert.match(transformed, /\.\.\.CPX_surfaceProps\}=e,CPX_resolvedSurfaceProps=Object\.keys\(CPX_surfaceProps\)\.length===0\?CPXSurfaceProps\(\{\}\):CPX_surfaceProps/);
      assert.match(transformed, /\.\.\.CPX_resolvedSurfaceProps,className:v/);
      assert.match(transformed, /\.\.\.CPXSurfaceProps\(\{project:\{cwd:fn,hostId:sr\}\}\),className:A/);
      assert.doesNotMatch(transformed, /CPXComposerProps/);
      assert.doesNotMatch(transformed, /CPX_localThreadKey/);
      assert.doesNotMatch(transformed, /CPX_threadProjectId/);
      continue;
    }
    if (patchSet.id === "codex-26.623.70822-4559") {
      assert.match(transformed, /function iL\(e\)\{let t=\(0,vL\.c\)\(13\)/);
      assert.match(transformed, /codexPlusProps:CPX_surfaceProps\}=e,CPX_resolvedSurfaceProps=CPX_surfaceProps\?\?CPXSurfaceProps\(\{\}\)/);
      assert.match(transformed, /\.\.\.CPX_resolvedSurfaceProps,className:v/);
      assert.match(transformed, /CPX_composerSurfaceProps=CPXSurfaceProps\(\{project:\{cwd:li,hostId:Dr\}\}\)/);
      assert.match(transformed, /codexPlusProps:CPX_composerSurfaceProps/);
      assert.match(transformed, /key:CPX_composerSurfaceProps\?\.\[`data-codex-plus-project-color`\]\?\?``/);
      assert.doesNotMatch(transformed, /t\[12\]!==CPX_surfaceProps/);
      assert.doesNotMatch(transformed, /t\[12\]=CPX_surfaceProps/);
      assert.doesNotMatch(transformed, /CPX_localThreadKey/);
      assert.doesNotMatch(transformed, /CPX_threadProjectId/);
      continue;
    }
    if ((patchSet.id === "codex-26.623.141536-4753" || patchSet.id === "codex-26.623.101652-4674")) {
      assert.match(transformed, /function vP\(e\)\{let t=\(0,MP\.c\)\(13\)/);
      assert.match(transformed, /codexPlusProps:CPX_surfaceProps\}=e,CPX_resolvedSurfaceProps=CPX_surfaceProps\?\?CPXSurfaceProps\(\{\}\)/);
      assert.match(transformed, /\.\.\.CPX_resolvedSurfaceProps,className:v/);
      assert.match(transformed, /codexPlusProps:CPXSurfaceProps\(\{project:\{cwd:Rn,hostId:Hr\}\}\)/);
      assert.match(transformed, /key:CPXSurfaceProps\(\{project:\{cwd:Rn,hostId:Hr\}\}\)\?\.\[`data-codex-plus-project-color`\]\?\?``/);
      assert.doesNotMatch(transformed, /CPX_localThreadKey/);
      assert.doesNotMatch(transformed, /CPX_threadProjectId/);
      continue;
    }
    if (patchSet.id === "codex-26.623.81905-4598" || patchSet.id === "codex-26.623.61825-4548") {
      assert.match(transformed, /function MN\(e\)\{let t=\(0,KN\.c\)\(13\)/);
      assert.match(transformed, /codexPlusProps:CPX_surfaceProps\}=e,CPX_resolvedSurfaceProps=CPX_surfaceProps\?\?CPXSurfaceProps\(\{\}\)/);
      assert.match(transformed, /\.\.\.CPX_resolvedSurfaceProps,className:v/);
      assert.match(transformed, /codexPlusProps:CPXSurfaceProps\(\{project:\{cwd:Cn,hostId:Ar\}\}\)/);
      assert.match(transformed, /key:CPXSurfaceProps\(\{project:\{cwd:Cn,hostId:Ar\}\}\)\?\.\[`data-codex-plus-project-color`\]\?\?``/);
      assert.doesNotMatch(transformed, /CPX_localThreadKey/);
      assert.doesNotMatch(transformed, /CPX_threadProjectId/);
      continue;
    }
    if ([
      "codex-26.616.81150-4306",
      "codex-26.616.71553-4265",
      "codex-26.616.51431-4212",
      "codex-26.616.41845-4198",
    ].includes(patchSet.id)) {
      assert.match(transformed, /CPX_composerSurfaceProps=CPXSurfaceProps\(\{project:globalThis\.CodexPlusHost\.adapters\.context\.active\(\)\}\)/);
      assert.match(transformed, /codexPlusProps:CPX_composerSurfaceProps/);
      assert.match(transformed, /key:CPX_composerSurfaceProps\?\.\[`data-codex-plus-project-color`\]\?\?``/);
      assert.doesNotMatch(transformed, /CPX_localThreadKey/);
      assert.doesNotMatch(transformed, /CPX_threadProjectId/);
      continue;
    }
    assert.ok(transformed.includes(`import{t as CPX_localThreadKey}from"./${names.sidebarThreadKeysFile}";`));
    assert.ok(transformed.includes(`import{s as CPX_threadProjectId}from"./${names.sidebarThreadRowSignalsFile}";`));
    assert.match(transformed, /function oh\(e\)\{let t=\(0,\$\.c\)\(13\)/);
    assert.doesNotMatch(transformed, /\[data-codex-plus-user-entry\]\[data-codex-plus-project-color\].*background-color:var\(--codex-plus-project/);
    assert.doesNotMatch(transformed, /--codex-plus-user-bubble-light-bg/);
    assert.doesNotMatch(transformed, /CPX_userBubbleTextColor/);
    assert.match(transformed, /\.\.\.CPX_resolvedSurfaceProps,className:v/);
    assert.match(transformed, /key:CPX_composerSurfaceProps\?\.\[`data-codex-plus-project-color`\]\?\?``/);
    assert.doesNotMatch(transformed, /t\[12\]!==CPX_surfaceProps/);
    assert.doesNotMatch(transformed, /t\[12\]=CPX_surfaceProps/);
    assert.doesNotMatch(transformed, /CPX_projectColorInlineStyle/);
    assert.match(transformed, /CPX_composerThreadProjectId=a\(CPX_threadProjectId,G==null\?null:CPX_localThreadKey\(G\)\)/);
    assert.match(transformed, /CPX_composerSurfaceProps=CPXSurfaceProps\(\{project:G==null\?On\?\{hostId:On\.hostId,path:On\.remotePath,projectId:kn,label:On\.label\?\?On\.name\}:x\?\?void 0:CPX_composerThreadProjectId\}\);return/);
    assert.match(transformed, /codexPlusProps:!Ge&&!Hn\?CPX_composerSurfaceProps:void 0/);
    assert.doesNotMatch(transformed, /style:!Ge&&!Hn\?CPX_projectColorStyle\(.*a\(CPX_threadProjectId/);
  }

  const bubblePlugin = fs.readFileSync(path.join(__dirname, "../src/runtime/plugins/userBubbleColors.js"), "utf8");
  const projectPlugin = fs.readFileSync(path.join(__dirname, "../src/runtime/plugins/projectColors.js"), "utf8");
  assert.match(bubblePlugin, /--codex-plus-user-bubble-dark-fg/);
  assert.match(bubblePlugin, /\[data-codex-plus-user-entry\] \.composer-surface-chrome\{background-color:transparent!important;background-image:none!important\}/);
  assert.match(projectPlugin, /--codex-plus-project-separator-dark/);
  assert.match(projectPlugin, /box-shadow:inset 6px 0 0 var\(--codex-plus-project-accent\)/);
  assert.match(projectPlugin, /\[data-codex-plus-user-entry\]\[data-codex-plus-project-color\]/);
  assert.match(projectPlugin, /\[data-codex-plus-user-entry\]\[data-codex-plus-project-color\]:not\(:has\(\[data-codex-plus-user-bubble\]\)\)/);
  assert.match(projectPlugin, /\[data-codex-plus-user-bubble\]\[data-codex-plus-project-color\]:has\(\[data-user-message-bubble\]\)\{box-shadow:none!important;border-left:0!important\}/);
  assert.match(projectPlugin, /\[data-codex-plus-user-bubble\]\[data-codex-plus-project-color\] \[data-user-message-bubble\]\{box-shadow:inset 6px 0 0 var\(--codex-plus-project-accent\)!important\}/);
  assert.match(projectPlugin, /\[data-app-action-sidebar-project-list-id\]\[data-codex-plus-project-sidebar-color\]\{background-color:var\(--codex-plus-project-bg-dark\)/);
});

test("ChatGPT composer project colors attach to the native composer surface", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.41301-5103");
  const composerFile = findTransformPath(patchSet, "composer");
  const fakeComposerBundle = [
    "function WX(e){let t=(0,GX.c)(107),",
    "(0,NX.jsx)(QBe,{className:C,utilityBarVariant:S,hasDropTargetPortal:Rs,",
    "Ye=(0,qX.jsxs)(`div`,{className:Le,\"data-codex-composer-root\":``,children:[ze,Ve,Je]})",
  ].join("");

  const transformed = transformFile(patchSet, composerFile, fakeComposerBundle);

  assert.match(transformed, /CPXSurfaceProps=e=>CPXMC\.composerSurfaceProps\(e\)/);
  assert.match(transformed, /\.\.\.CPXSurfaceProps\(\{project:\{cwd:vn,hostId:xr\}\}\),className:C/);
  assert.match(transformed, /key:CPXSurfaceProps\(\{project:\{cwd:vn,hostId:xr\}\}\)\?\.\[`data-codex-plus-project-color`\]\?\?``/);
  assert.match(transformed, /\(0,NX\.jsx\)\(QBe,\{key:CPXSurfaceProps\(\{project:\{cwd:vn,hostId:xr\}\}\)\?\.\[`data-codex-plus-project-color`\]\?\?``,\.\.\.CPXSurfaceProps\(\{project:\{cwd:vn,hostId:xr\}\}\),className:C/);
  assert.doesNotMatch(transformed, /"data-codex-composer-root":``,\.\.\.CPXSurfaceProps\(\{\}\),children/);
  assert.doesNotMatch(transformed, /CPX_localThreadKey/);
  assert.doesNotMatch(transformed, /CPX_threadProjectId/);
});

test("21316 native project rows forward the source path through the shared sidebar adapter", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.715.21316-5484");
  const transforms = new Map(collectFileTransforms(patchSet).map(([, transform]) => [transform.name, transform]));
  const transform = transforms.get("patchLocalTaskRow");
  const source = [
    "function Kd(e){let t=(0,Qd.c)(125),",
    "j=Te.sidebarProjectRow({collapsed:a,label:_,projectId:x})",
    "let qe=Ke,Ye=lu,Xe=s?Te:void 0,Ze=c(",
    "dataAttributes:Te.sidebarThreadRow({active:u,hostId:t.hostId,id:n,kind:`local`,pinned:a,title:t.label})",
    "dataAttributes:Te.sidebarThreadRow({active:u,hostId:null,id:t,kind:`remote`,pinned:a,title:e.task.title??``})",
    "dataAttributes:Te.sidebarThreadRow({active:u,hostId:f,id:r,kind:`local`,pinned:a,title:x})",
  ].join(";");
  const transformed = transform(source, { patchSetId: patchSet.id });

  assert.match(transformed, /Xe=\{\.\.\.\(s\?Te:void 0\),\.\.\.CPXPR\(\{projectId:N,label:z,path:M,cwd:M,hostId:i\.hostId,projectKind:i\.projectKind\}\)\}/);
});

test("72221 binds moved host seams without changing consumer contracts", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.72221-5307");
  assert.equal(patchSet.runtimeConfig.mermaidCoreAsset, "mermaid.core-C6gAAJlL.js");
  const transforms = new Map(collectFileTransforms(patchSet).map(([, transform]) => [transform.name, transform]));

  const appShell = transforms.get("patchAppShell")([
    "function Ome(){let e=(0,Yj.c)(3),t,n;",
    "children:[t,n,(0,Xj.jsx)(so,{onClick:kme,children:(0,Xj.jsx)($,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
    "function ZJ(){let e=(0,QJ.c)(23),t=af(q),n=N(KJ),r=Ul(`open-file`),i=N(CT),a=N(Cy),o=a!=null,s;",
  ].join(""));
  assert.match(appShell, /CPXDiagnosticDetails\(\{jsx:Xj\.jsx,error:null\}\)/);
  assert.match(appShell, /CodexPlusHost\.adapters\.threadSidePanel/);
  assert.match(appShell, /bindOpenFile\(\(e,n=\{\}\)=>\{let CPXPC=.*return \$Xe\(t,e,\{hostId:n\.hostId\|\|CPXPC\?\.hostId\|\|i\.id\|\|`local`,.*target:n\.target\?\?`right`/);
  assert.doesNotMatch(appShell, /bindOpenFile\([^;]+return XC\(/);

  const localTaskRow = transforms.get("patchLocalTaskRow")([
    "function hSe(e){let t=(0,yW.c)(128),",
    "dataAttributes:Ka.sidebarThreadRow({active:s,hostId:t.hostId,id:n,kind:`local`,pinned:r,title:t.label})",
    "dataAttributes:Ka.sidebarThreadRow({active:s,hostId:null,id:t,kind:`remote`,pinned:r,title:e.task.title??``})",
    "dataAttributes:Ka.sidebarThreadRow({active:s,hostId:p,id:l,kind:`local`,pinned:r,title:x})",
  ].join(""));
  assert.match(localTaskRow, /CPXPR=e=>CPXS\.projectRowProps\(e\);function hSe\(e\)\{let t=\(0,yW\.c\)\(128\),/);
  assert.match(localTaskRow, /threadId:n,title:t\.label/);
  assert.match(localTaskRow, /hostId:null,threadId:t,title:e\.task\.title\?\?``/);
  assert.match(localTaskRow, /projectId:ve,label:_e,path:E,cwd:E,hostId:p,threadId:l,title:x/);

  const composer = transforms.get("patchComposerProjectColors")([
    "function qY({aboveComposerHeaderContent:e,activeCollaborationMode:t,",
    "clientThreadId:j,interactionsDisabled:M}){let N=ia(Db),",
    "):(0,QY.jsx)(JY,{className:w,utilityBarVariant:C,hasDropTargetPortal:kc,",
  ].join(""));
  assert.match(composer, /CPX_composerSurfaceProps=CPXSurfaceProps\(\{project:globalThis\.CodexPlusHost\.adapters\.context\.active\(\)\}\)/);
  assert.match(composer, /codexPlusProps:CPX_composerSurfaceProps/);

  const commandMenu = transforms.get("patchCommandMenuRuntimeCommands")([
    "function TRe(e){let t=(0,M5.c)(126),P=lO.filter(e=>true);t[16]=O,t[17]=P):P=t[17];let F=P,I;",
    "!i&&c!=null&&K.push(c),t[29]=L,",
    "function NRe(e){let t=(0,M5.c)(13),{close:n,command:r,description:i,title:a}=e,o=rze[r.id],s;",
    "c=()=>{IC(r.id,`command_menu`),n()},t[2]=n,t[3]=r.id,t[4]=c):c=t[4];",
  ].join(""));
  assert.match(commandMenu, /function CPXCommandPaletteItem\(\{command:e,close:t\}\)/);
  assert.match(commandMenu, /K\.push\(\.\.\.globalThis\.CodexPlusHost\.adapters\.commands\.metadata\(\)\.map\(e=>\(0,P5\.jsx\)\(CPXCommandPaletteItem,\{command:e,close:n\},e\.id\)\)\)/);
  assert.match(commandMenu, /t\[16\]=O,t\[17\]=P\):P=t\[17\];let F=P,I/);
  assert.doesNotMatch(commandMenu, /let F=\[\.\.\.P,\.\.\.globalThis\.CodexPlusHost\.adapters\.commands\.metadata/);
  assert.match(commandMenu, /bindNativeDispatch\(e=>\(IC\(e,`command_menu`\),!0\)\),e\.dispatch\(r\.id\),n\(\)/);
  assert.doesNotMatch(commandMenu, /c=\(\)=>\{IC\(r\.id,`command_menu`\),n\(\)\}/);

  const announcements = transforms.get("patchChatGptStartupAnnouncements")([
    "function $me({appBrand:e,buildFlavor:t,platform:n}){return(n===`macOS`||n===`windows`)&&e===Hu.ChatGPT&&t!=null&&t!==tg.Agent&&t!==tg.Dev}",
    "function VN(e){let t=(0,HN.c)(26),{announcementSource:n,body:r,dismissAnnouncement:i,model:a,modelName:o,onTryModel:s,showSecondaryAction:c}=e,",
  ].join(""));
  assert.match(announcements, /function \$me\([^)]*\)\{return false\}/);
  assert.match(announcements, /function VN\(e\)\{return null;/);
});

test("71524 binds its moved UI producers to the strict host adapters", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.71524-5263");
  assert.equal(collectFileTransforms(patchSet).some(([, transform]) => transform.name === "patchLocalConversationPageHeader"), false);
  const transforms = new Map(collectFileTransforms(patchSet).map(([, transform]) => [transform.name, transform]));

  const errorBoundary = transforms.get("patchErrorBoundary")([
    "function d_n(e){let t=(0,f_n.c)(9),{resetError:n}=e,r=kR(),i,a;",
    "children:[i,a,(0,N$.jsxs)(`div`,{className:`flex flex-wrap items-center justify-center gap-2`,children:[o,(0,N$.jsx)(p_,{onClick:s,children:c})]})]",
    "r=e??(e=>(0,N$.jsx)(d_n,{resetError:()=>e.resetError()}));",
  ].join(""));
  assert.match(errorBoundary, /CPXDiagnosticDetails\(\{jsx:N\$\.jsx,error:CPX_error,componentStack:CPX_componentStack\}\)/);

  const messageBubble = transforms.get("patchUserMessageAttachmentsBubbleColors")([
    "function _Qe({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){",
    "return(0,yB.jsx)(`form`,{className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),v()},children:",
    "me=B?(0,CB.jsx)(`div`,{className:`w-full p-px`,children:(0,CB.jsx)(_Qe,{cwd:b??null,hostId:x,initialMessage:z.trim(),onCancel:()=>{re(null)},onDraftChange:e=>{re(e)},onSubmit:ae})}):ee?(0,CB.jsx)(`div`,{\"data-user-message-bubble\":!0,role:I?`button`:void 0,tabIndex:0,className:X(",
  ].join(""));
  assert.match(messageBubble, /data-codex-plus-user-entry/);
  assert.match(messageBubble, /CPXBubbleProps\(\{\}\)/);

  const composer = transforms.get("patchComposerProjectColors")([
    "function l5({aboveComposerHeaderContent:e,activeCollaborationMode:t,localWorkspaceMaterialization:L,clientThreadId:R,interactionsDisabled:B}){let V=ri(No),",
    "bs=(e,t=Hr)=>{let n=e.fsPath||e.path;if(!n||n.length===0)return;let r=e.startLine;ki({path:n,line:r,column:r==null?void 0:1,cwd:Mn,hostId:t,openFile:un.mutate})},xs=e=>",
    "):(0,m5.jsx)(u5,{className:E,utilityBarVariant:T,hasDropTargetPortal:zc,",
  ].join(""));
  assert.match(composer, /CPX_composerSurfaceProps=CPXSurfaceProps\(\{project:globalThis\.CodexPlusHost\.adapters\.context\.active\(\)\}\)/);
  assert.match(composer, /codexPlusProps:CPX_composerSurfaceProps/);
  assert.match(composer, /CPXSP=globalThis\.CodexPlusHost\.adapters\.threadSidePanel/);
  assert.match(composer, /CPXSP\.bindMount\(\(\)=>\(\{scope:V\}\)\)/);
  assert.match(composer, /CPXSP\.bindOpenFile\(\(e,t=\{\}\)=>ki\(\{scope:V,path:e,cwd:t\.workspaceRoot\?\?Mn,hostConfig:Ur,hostId:t\.hostId\?\?Hr,line:t\.line,endLine:t\.endLine,isPreview:t\.isPreview,title:t\.title,openFile:un\.mutate,openInSidePanel:!0\}\)\)/);

  const projectRow = transforms.get("patchAppMainProjectColors")([
    "function _R(e){let t=(0,vR.c)(57),{ref:n,className:r,actions:i,collapsed:a,contentClassName:o,label:g,projectId:b,rowAttributes:x}=e;",
    "A=dn.sidebarProjectRow({collapsed:a,label:g,projectId:b})",
  ].join(""));
  assert.match(projectRow, /CPXPR=e=>CPXS\.projectRowProps\(e\);function _R/);
  assert.match(projectRow, /A=\{\.\.\.dn\.sidebarProjectRow\([^)]*\),\.\.\.CPXPR\(\{projectId:b,label:g\}\)\}/);

  const localTaskRow = transforms.get("patchLocalTaskRow")([
    "function qW(e){let t=(0,$W.c)(128),",
    "dataAttributes:dn.sidebarThreadRow({active:s,hostId:t.hostId,id:n,kind:`local`,pinned:r,title:t.label})",
    "dataAttributes:dn.sidebarThreadRow({active:s,hostId:null,id:t,kind:`remote`,pinned:r,title:e.task.title??``})",
    "dataAttributes:dn.sidebarThreadRow({active:s,hostId:m,id:l,kind:`local`,pinned:r,title:S})",
  ].join(""));
  assert.match(localTaskRow, /CPXPR=e=>CPXS\.projectRowProps\(e\);function qW/);
  assert.match(localTaskRow, /threadId:n,title:t\.label/);
  assert.match(localTaskRow, /hostId:null,threadId:t,title:e\.task\.title\?\?``/);
  assert.match(localTaskRow, /projectId:xe,label:be,path:O,cwd:O,hostId:m,threadId:l,title:S/);

  const announcements = transforms.get("patchChatGptStartupAnnouncements")([
    "function qde({appBrand:e,buildFlavor:t,platform:n}){return(n===`macOS`||n===`windows`)&&e===Ec.ChatGPT&&t!=null&&t!==gs.Agent&&t!==gs.Dev}",
    "function qA(e){let t=(0,JA.c)(26),{announcementSource:n,body:r,dismissAnnouncement:i,model:a,modelName:o,onTryModel:s,showSecondaryAction:c}=e,",
  ].join(""));
  assert.match(announcements, /function qde\([^)]*\)\{return false\}/);
  assert.match(announcements, /function qA\(e\)\{return null;/);

  const commandMenu = transforms.get("patchCommandMenuRuntimeCommands")([
    "function ube(e){let t=(0,b2.c)(126),{close:n}=e;",
    "!i&&c!=null&&re.push(c),t[29]=I,",
    "function vbe(e){let t=(0,b2.c)(13),{close:n,command:r,description:i,title:a}=e;",
    "c=()=>{au(r.id,`command_menu`),n()},",
  ].join(""));
  assert.match(commandMenu, /function CPXCommandPaletteItem/);
  assert.match(commandMenu, /adapters\.commands\.metadata\(\)/);
  assert.match(commandMenu, /bindNativeDispatch\(e=>\(au\(e,`command_menu`\),!0\)\)/);
});

test("72221 review producer binds the strict review adapter at the moved host body", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.72221-5307");
  const transform = collectFileTransforms(patchSet).find(([, candidate]) => candidate.name === "patchThreadSidePanelTabs")?.[1];
  const source = [
    'import{n as e,r as t,s as n,t as r}from"./rolldown-runtime-Czos8NxU.js";',
    "function Vzt(e){let t=(0,Hzt.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e",
    "s=(0,mY.jsx)(jie,{children:(0,mY.jsx)(zMt,{diffMode:a,setTabState:r,tabState:i})}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
  ].join("");

  const transformed = transform(source);

  assert.match(transformed, /CPXBranchPickerDropdownContent/);
  assert.match(transformed, /CPXParseDiff/);
  assert.match(transformed, /import\{zF as CPXPathValue\}from"\.\/app-initial~app-main~hotkey-window-new-thread-page~hotkey-window-home-page~composer-utility-bar-D9zyQF1n\.js"/);
  assert.match(transformed, /CodexPlusHost\.adapters\.review\.renderBodyFromHost\(e,\[mY,Mzt,rl,I,null,null,null,Em,null,Dl,CPXPathValue,zMt,zi,No,Pt,kl,dc,CPXBranchPickerDropdownContent,null,CPXParseDiff,qAt\]\)/);
  assert.match(transformed, /mainReviewContent:\(0,mY\.jsx\)\(zMt/);
  assert.doesNotMatch(transformed, /typeof [A-Za-z_$]+!==`undefined`/);
});

test("91948 composer binds the strict side-panel adapter at its native file opener", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.91948-5440");
  const transforms = new Map(collectFileTransforms(patchSet).map(([, transform]) => [transform.name, transform]));
  const composer = transforms.get("patchComposerProjectColors")([
    "function Xq({aboveComposerHeaderContent:e,activeCollaborationMode:t,clientThreadId:N,interactionsDisabled:P}){let F=D(Dp),",
    "ds=(e,t=jr)=>{let n=e.fsPath||e.path;if(!n||n.length===0)return;let r=e.startLine;Ep({path:n,line:r,column:r==null?void 0:1,cwd:bn,hostId:t,openFile:Zt.mutate})},ps=e=>",
    ">(0,tJ.jsx)(Zq,{...CPXSurfaceProps({}),className:w,utilityBarVariant:C,hasDropTargetPortal:Hc,",
  ].join(""));

  assert.match(composer, /CPXSP=globalThis\.CodexPlusHost\.adapters\.threadSidePanel/);
  assert.match(composer, /CPXSP\.bindMount\(\(\)=>\(\{scope:F\}\)\)/);
  assert.match(composer, /CPXSP\.bindOpenFile\(\(e,t=\{\}\)=>Ep\(\{scope:F,path:e,cwd:t\.workspaceRoot\?\?bn,hostConfig:Mr,hostId:t\.hostId\?\?jr,line:t\.line,endLine:t\.endLine,isPreview:t\.isPreview,title:t\.title,openFile:Zt\.mutate,openInSidePanel:!0\}\)\)/);

  const primitive = transforms.get("patchComposerPrimitiveSurface")([
    "function nu(e){let t=(0,_u.c)(18),{children:n,className:r,utilityBarVariant:i,inert:a,isDragActive:o,layout:s,radiusVariant:l,surfaceVariant:u,onDragEnter:d,onDragLeave:f,onDragOver:p,onDrop:h}=e,",
    "t[10]!==n||t[11]!==a||t[12]!==d||t[13]!==f||t[14]!==p||t[15]!==h||t[16]!==O?",
    "k=(0,vu.jsx)(c.div,{inert:a,className:O,onMouseDown:gu,onDragEnter:d,onDragOver:p,onDragLeave:f,onDrop:h,children:n}),t[10]=n,t[11]=a,t[12]=d,t[13]=f,t[14]=p,t[15]=h,t[16]=O,t[17]=k",
  ].join(""));
  assert.match(primitive, /codexPlusProps:CPX_surfaceProps/);
  assert.match(primitive, /inert:a,\.\.\.CPX_resolvedSurfaceProps,className:O/);
});

test("91948 review producer keeps worker and path fallbacks out of minified host glue", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.91948-5440");
  const transform = findTransform(patchSet, "review");
  const transformed = transform([
    "function aTe(e){let t=(0,WP.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e",
    "s=(0,GP.jsx)(Kre,{children:(0,GP.jsx)(NSe,{diffMode:a,setTabState:r,tabState:i})}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
  ].join(""));

  assert.match(transformed, /renderBodyFromHost\(e,\[GP,EA,null,null,null,null,null,null,null,null,null,NSe,null,null,null,null,null,null,null,Do,kA\]\)/);
  assert.match(transformed, /mainReviewContent:\(0,GP\.jsx\)\(NSe,/);
  assert.doesNotMatch(transformed, /CPXBranchPickerDropdownContent/);
});

test("62119 review producer binds the native diff parser used by its host review", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.62119-5211");
  const transform = collectFileTransforms(patchSet).find(([, candidate]) => candidate.name === "patchThreadSidePanelTabs")?.[1];
  const source = [
    'import{n as e,r as t,s as n,t as r}from"./rolldown-runtime-Czos8NxU.js";',
    "function gMe(e){let t=(0,KN.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e",
    "s=(0,qN.jsx)(Aue,{children:(0,qN.jsx)(Gke,{diffMode:a,setTabState:r,tabState:i})}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
  ].join("");

  const transformed = transform(source);

  assert.match(transformed, /renderBodyFromHost\(e,\[qN,Jz,null,null,null,null,null,null,null,Tn,ae,Gke,null,null,null,null,null,CPXBranchPickerDropdownContent,null,sp,iD\]\)/);
  assert.doesNotMatch(transformed, /CPXBranchPickerDropdownContent,null,ri,iD/);
});

test("61608 review producer binds the native diff parser used by its host review", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.61608-5200");
  const transform = collectFileTransforms(patchSet).find(([, candidate]) => candidate.name === "patchThreadSidePanelTabs")?.[1];
  const source = [
    'import{n as e,r as t,s as n,t as r}from"./rolldown-runtime-Czos8NxU.js";',
    "function PCt(e){let t=(0,FCt.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e",
    "s=(0,bW.jsx)(lue,{children:(0,bW.jsx)(_gt,{diffMode:a,setTabState:r,tabState:i})}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
  ].join("");

  const transformed = transform(source);

  assert.match(transformed, /renderBodyFromHost\(e,\[bW,HY,null,null,null,null,null,null,null,Oc,kt,_gt,null,null,null,null,null,CPXBranchPickerDropdownContent,null,hg,cce\]\)/);
  assert.doesNotMatch(transformed, /CPXBranchPickerDropdownContent,null,Ci,cce/);
});

test("62119 command palette renders plugin metadata outside the native FormatJS command list", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.62119-5211");
  const transform = collectFileTransforms(patchSet).find(([, candidate]) => candidate.name === "patchCommandMenuRuntimeCommands")?.[1];
  const source = [
    "function Ppe(e){let t=(0,V0.c)(126),{close:n}=e;",
    "let f=se?P.filter(zpe):P,p;",
    "!i&&c!=null&&oe.push(c),t[29]=I,",
    "function Hpe(e){let t=(0,V0.c)(13),{close:n,command:r,description:i,title:a}=e;",
    "c=()=>{Bf(r.id,`command_menu`),n()},",
  ].join("");

  const transformed = transform(source);

  assert.match(transformed, /function CPXCommandPaletteItem\(\{command:e,close:t\}\)/);
  assert.match(transformed, /oe\.push\(\.\.\.globalThis\.CodexPlusHost\.adapters\.commands\.metadata\(\)\.map\(e=>\(0,U0\.jsx\)\(CPXCommandPaletteItem,\{command:e,close:n\},e\.id\)\)\)/);
  assert.doesNotMatch(transformed, /let f=\[\.\.\.\(se\?P\.filter\(zpe\):P\),\.\.\.\(globalThis\.CodexPlusHost\.adapters\.commands\.metadata/);
  assert.match(transformed, /bindNativeDispatch\(e=>\(Bf\(e,`command_menu`\),!0\)\),e\.dispatch\(r\.id\),n\(\)/);
});

test("61608 command palette renders plugin metadata outside the native FormatJS command list", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.61608-5200");
  const transform = collectFileTransforms(patchSet).find(([, candidate]) => candidate.name === "patchCommandMenuRuntimeCommands")?.[1];
  const source = [
    "function aJe(e){let t=(0,a8.c)(126),{close:n}=e;",
    "let f=ne?P.filter(uJe):P,p;",
    "!i&&c!=null&&K.push(c),t[29]=I,",
    "function pJe(e){let t=(0,a8.c)(13),{close:n,command:r,description:i,title:a}=e;",
    "c=()=>{xf(r.id,`command_menu`),n()},",
  ].join("");

  const transformed = transform(source);

  assert.match(transformed, /function CPXCommandPaletteItem\(\{command:e,close:t\}\)/);
  assert.match(transformed, /K\.push\(\.\.\.globalThis\.CodexPlusHost\.adapters\.commands\.metadata\(\)\.map\(e=>\(0,s8\.jsx\)\(CPXCommandPaletteItem,\{command:e,close:n\},e\.id\)\)\)/);
  assert.doesNotMatch(transformed, /let f=\[\.\.\.\(ne\?P\.filter\(uJe\):P\),\.\.\.\(globalThis\.CodexPlusHost\.adapters\.commands\.metadata/);
  assert.match(transformed, /bindNativeDispatch\(e=>\(xf\(e,`command_menu`\),!0\)\),e\.dispatch\(r\.id\),n\(\)/);
});

test("72221 project selector patches the moved composer utility producer", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.72221-5307");
  const filePath = findTransformPath(patchSet, "home-project-dropdown");
  const transform = findTransform(patchSet, "home-project-dropdown");
  const source = [
    "function CNt(e){let t=(0,wNt.c)(44),{children:n,groups:r,projectAppearances:i,selectedProjectIds:a,onSelectProjectId:o,keepOpenOnSelect:s,projectlessActionLabel:c,onSelectProjectless:l,footerItems:u,onAddLocalProject:d,onAddRemoteProject:f,emptyMessage:p}=e,m=s===void 0?!1:s,h=Xg(),g=l!=null&&c!=null,[_,v]=(0,TNt.useState)(``),y,b,x,S,C,w;if(t[0]!==g){let e=_.trim().toLowerCase();b=r.filter(t=>{if(!e)return!0;let n=t.repositoryData?.rootFolder??``;return[t.label,n,t.path??``,t.hostDisplayName??``].some(t=>t.toLowerCase().includes(e))});w=(0,W9.jsx)(Z7,{value:_,onChange:s,placeholder:c,className:`mb-1`});C=b.map(e=>(0,W9.jsx)(`span`,{className:`truncate`,children:e.label}))}",
    "function zNt({activeProjectIdOverride:e,allowLocalProjects:t=!0,allowLocalProjectActions:n=t,allowRemoteProjects:r=!0,disabled:i=!1,hideLabel:a=!1,onWorkspaceRootSelected:o,variant:s=`default`,isOpen:c,onOpenChange:l,triggerButton:u}){let d=Hr(Z),f=Xg(),[p,m]=(0,Q9.useState)(!1),se=c??p,ce=e=>{m(e),l?.(e)},le=n&&s===`home`;if(!e)return null;let ve=()=>(0,$9.jsx)(zj,{children:(0,$9.jsx)(F9,{className:`min-w-0`,children:`Project`})}),be=()=>(0,$9.jsxs)(`button`,{className:`heading-xl`,children:[]});if(le)return(0,$9.jsx)(Q7,{open:c,onOpenChange:ce,onCloseAutoFocus:I,side:`top`,triggerButton:u,contentWidth:`menu`,children:e});let Se=(0,$9.jsx)(Q7,{open:c,onOpenChange:ce,onCloseAutoFocus:I,side:`top`,align:s===`hero`?`center`:`start`,disabled:i,triggerButton:u??(s===`hero`?be():ve()),contentWidth:`workspace`,contentMaxHeight:`tall`,children:e});return Se}",
  ].join("");

  assert.equal(filePath, "webview/assets/app-initial~app-main~hotkey-window-new-thread-page~hotkey-window-home-page~composer-utility-bar-D9zyQF1n.js");
  const transformed = transform(source);
  assert.match(transformed, /CPXP\.fuzzyFilter\(r,_\)/);
  assert.match(transformed, /CPXP\.acceptFirst\(e,b,o,_\)/);
  assert.match(transformed, /CPXP\.fuzzyHighlight\(e\.label,_,W9\.jsx\)/);
  assert.match(transformed, /CPXP\.setOpenHandler\(s,\(\)=>\{ce\(!0\);return!0\}\)/);
  assert.match(transformed, /open:se/);
  assert.match(transformed, /CPXPST\(u\?\?\(s===`hero`\?be\(\):ve\(\)\),s\)/);
});

test("71524 project selector patches the mounted RX producer", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.71524-5263");
  const filePath = findTransformPath(patchSet, "home-project-dropdown");
  const transform = findTransform(patchSet, "home-project-dropdown");
  const source = [
    "function Sge(e){let t=(0,PX.c)(44),{children:n,groups:r,projectAppearances:i,selectedProjectIds:a,onSelectProjectId:o}=e,[v,y]=(0,FX.useState)(``),x,T;let e=v.trim().toLowerCase();x=r.filter(t=>{if(!e)return!0;let n=t.repositoryData?.rootFolder??``;return[t.label,n,t.path??``,t.hostDisplayName??``].some(t=>t.toLowerCase().includes(e))});T=(0,IX.jsx)(zu,{value:v,onChange:s,placeholder:c,className:`mb-1`});x.map(e=>(0,IX.jsx)(`span`,{className:`truncate`,children:e.label}))}",
    "function RX({activeProjectIdOverride:e,allowLocalProjects:t=!0,allowLocalProjectActions:n=t,allowRemoteProjects:r=!0,disabled:i=!1,hideLabel:a=!1,onWorkspaceRootSelected:o,variant:s=`default`,isOpen:c,onOpenChange:l,triggerButton:u}){let[p,m]=(0,zX.useState)(!1),W=c??p,ne=e=>{m(e),l?.(e)},re=n&&s===`home`;if(re)return(0,BX.jsx)(Ja,{open:c,onOpenChange:ne,onCloseAutoFocus:z,side:`top`,triggerButton:u,contentWidth:`menu`,children:e});if(s===`home`&&u==null)return(0,BX.jsx)(zD,{menuOpen:W,onOpenChange:ne,children:he});let ge=(0,BX.jsx)(Ja,{open:c,onOpenChange:ne,onCloseAutoFocus:z,side:`top`,align:s===`hero`?`center`:`start`,disabled:i,triggerButton:u??(s===`hero`?me():fe()),contentWidth:`workspace`,contentMaxHeight:`tall`,children:he});return ge}",
  ].join("");

  assert.equal(filePath, "webview/assets/app-initial~app-main~page-kMhXWEru.js");
  const transformed = transform(source);
  assert.match(transformed, /CPXP\.fuzzyFilter\(r,v\)/);
  assert.match(transformed, /CPXP\.acceptFirst\(e,x,o,v\)/);
  assert.match(transformed, /CPXP\.fuzzyHighlight\(e\.label,v,IX\.jsx\)/);
  assert.match(transformed, /CPXP\.setOpenHandler\(s,\(\)=>\{ne\(!0\);return!0\}\)/);
  assert.match(transformed, /open:W/);
  assert.match(transformed, /CPXPST\(u\?\?\(s===`hero`\?me\(\):fe\(\)\),s\)/);
});

test("62119 project selector patches the mounted composer utility producer", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.62119-5211");
  const filePath = findTransformPath(patchSet, "home-project-dropdown");
  const transform = findTransform(patchSet, "home-project-dropdown");
  const source = [
    "function _t(e){let t=(0,vt.c)(44),{children:n,groups:r,projectAppearances:i,selectedProjectIds:a,onSelectProjectId:c}=e,[x,te]=(0,yt.useState)(``),S,C,w,T,E,D;if(t[0]!==x){let e=x.trim().toLowerCase();C=r.filter(t=>{if(!e)return!0;let n=t.repositoryData?.rootFolder??``;return[t.label,n,t.path??``,t.hostDisplayName??``].some(t=>t.toLowerCase().includes(e))});let o=e=>{te(e.target.value)},s=`Search projects`;D=(0,Q.jsx)(b,{value:x,onChange:o,placeholder:s,className:`mb-1`});E=C.map(e=>(0,Q.jsx)(`span`,{className:`truncate`,children:e.label}))}return D}",
    "var vt,yt,Q,bt=e((()=>{vt=n(),yt=t(l(),1),Q=i()}));",
    "function Ct({activeProjectIdOverride:e,allowLocalProjects:t=!0,allowLocalProjectActions:n=t,allowRemoteProjects:i=!0,disabled:c=!1,hideLabel:l=!1,onWorkspaceRootSelected:u,variant:f=`default`,isOpen:p,onOpenChange:m,triggerButton:h}){let[ee,x]=(0,Tt.useState)(!1),H=p??ee,U=e=>{x(e),m?.(e)},je=n&&f===`home`;if(je)return(0,$.jsx)(D,{open:p,onOpenChange:U,onCloseAutoFocus:I,side:`top`,triggerButton:h,contentWidth:`menu`,children:e});let Ge=(0,$.jsx)(D,{open:p,onOpenChange:U,onCloseAutoFocus:I,side:`top`,align:f===`hero`?`center`:`start`,disabled:c,triggerButton:h??(f===`hero`?He():Ve()),contentWidth:`workspace`,contentMaxHeight:`tall`,children:e});return Ge}",
  ].join("");

  assert.equal(filePath, "webview/assets/app-initial~app-main~hotkey-window-new-thread-page~hotkey-window-home-page~composer-utility-bar-BrySP-wf.js");
  const transformed = transform(source);
  assert.match(transformed, /CPXP\.fuzzyFilter\(r,x\)/);
  assert.match(transformed, /CPXP\.acceptFirst\(e,C,c,x\)/);
  assert.match(transformed, /CPXP\.fuzzyHighlight\(e\.label,x,Q\.jsx\)/);
  assert.match(transformed, /CPXP\.setOpenHandler\(f,\(\)=>\{U\(!0\);return!0\}\)/);
  assert.match(transformed, /open:H/);
  assert.match(transformed, /triggerButton:CPXPST\(h,f\)/);
  assert.match(transformed, /CPXPST\(h\?\?\(f===`hero`\?He\(\):Ve\(\)\),f\)/);
});

test("61608 project selector patches its mounted app-main producer", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.61608-5200");
  const filePath = findTransformPath(patchSet, "home-project-dropdown");
  const transform = findTransform(patchSet, "home-project-dropdown");
  const source = [
    "function DWe(e){let t=(0,r0.c)(44),{children:n,groups:r,projectAppearances:i,selectedProjectIds:a,onSelectProjectId:o}=e,[_,v]=(0,i0.useState)(``);let e=_.trim().toLowerCase();b=r.filter(t=>{if(!e)return!0;let n=t.repositoryData?.rootFolder??``;return[t.label,n,t.path??``,t.hostDisplayName??``].some(t=>t.toLowerCase().includes(e))});",
    "w=(0,a0.jsx)(mde,{value:_,onChange:s,placeholder:c,className:`mb-1`});C=b.map(e=>(0,a0.jsx)(`span`,{className:`truncate`,children:e.label}))}",
    "function s0({activeProjectIdOverride:e,allowLocalProjects:t=!0,allowLocalProjectActions:n=t,allowRemoteProjects:r=!0,disabled:i=!1,hideLabel:a=!1,onWorkspaceRootSelected:o,variant:s=`default`,isOpen:c,onOpenChange:l,triggerButton:u}){let[p,m]=(0,c0.useState)(!1),G=c??p,ee=e=>{m(e),l?.(e)},te=n&&s===`home`;",
    "return(0,l0.jsx)(Ov,{open:c,onOpenChange:ee,onCloseAutoFocus:L,side:`top`,triggerButton:u,contentWidth:`menu`,children:e});",
    "let fe=(0,l0.jsx)(Ov,{open:c,onOpenChange:ee,onCloseAutoFocus:L,side:`top`,align:s===`hero`?`center`:`start`,disabled:i,triggerButton:u??(s===`hero`?ue():ce()),contentWidth:`workspace`,contentMaxHeight:`tall`,children:de});return fe}",
  ].join("");

  assert.equal(filePath, "webview/assets/app-initial~app-main~page-CMpPiY3-.js");
  const transformed = transform(source);
  assert.match(transformed, /CPXP\.fuzzyFilter\(r,_\)/);
  assert.match(transformed, /CPXP\.acceptFirst\(e,b,o,_\)/);
  assert.match(transformed, /CPXP\.fuzzyHighlight\(e\.label,_,a0\.jsx\)/);
  assert.match(transformed, /CPXP\.setOpenHandler\(s,\(\)=>\{ee\(!0\);return!0\}\)/);
  assert.match(transformed, /open:G/);
  assert.match(transformed, /CPXPST\(u\?\?\(s===`hero`\?ue\(\):ce\(\)\),s\)/);
});

test("71524 thread title producer binds the normalized active context", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.71524-5263");
  const [filePath, transform] = collectFileTransforms(patchSet).find(([, candidate]) => candidate.name === "patchThreadTitle");
  const source = "function Sl(e){let t=(0,Tl.c)(51),{conversationId:n,hostIdOverride:r,getConversationMarkdown:i,markdownParentConversationId:a,pendingWorktree:o,projectIcon:s,projectIconInteractive:c,projectHoverCardContent:u,projectName:p,title:h,titleSuffix:g,cwd:_,canPin:v,hideForkActions:y}=e,b=c===void 0?!1:c,x=v===void 0?!0:v,S=Nn(),C=R(l),w=ve(),T=d(Ve),E;t[0]===_?E=t[1]:(E=_?Ln(_):null,t[0]=_,t[1]=E);let D=E,O=W(rn,n),k=so(D,f(r??O).id),A;return h}";

  assert.equal(filePath, "webview/assets/local-conversation-page-DuL7_S51.js");
  const transformed = transform(source);
  assert.match(transformed, /CPXBindThreadHeaderContext/);
  assert.match(transformed, /routeId:n,threadId:n,cwd:_,workspaceRoot:_,gitRoot:D\?\?_,hostId:f\(r\?\?O\)\.id/);
  assert.match(transformed, /sourceProject:\{id:_,label:typeof p==`string`\?p:``,cwd:_\}/);
  assert.match(transformed, /h=CPXThreadHeaderTitle\(CPX_nativeTitle\)/);
});

test("62119 thread title producer uses the mounted React namespace", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.62119-5211");
  const [filePath, transform] = collectFileTransforms(patchSet).find(([, candidate]) => candidate.name === "patchThreadTitle");
  const source = [
    "var ll,ul=e((()=>{ll=t(u(),1),Ki(),sl(),$r(),Vi()}));",
    "function Sl(e){let t=(0,Tl.c)(51),{conversationId:n,hostIdOverride:r,getConversationMarkdown:a,markdownParentConversationId:s,pendingWorktree:c,projectIcon:l,projectIconInteractive:u,projectHoverCardContent:d,projectName:f,title:p,titleSuffix:h,cwd:g,canPin:_,hideForkActions:v}=e,y=u===void 0?!1:u,b=_===void 0?!0:_,x=o(),S=U(It),C=Sn(),w=on(ji),T;t[0]===g?T=t[1]:(T=g?m(g):null,t[0]=g,t[1]=T);let E=T,D=H(Lt,n),O=so(E,Re(r??D).id),k;return p}",
  ].join("");

  assert.equal(filePath, "webview/assets/local-conversation-page-BVVhqMj0.js");
  const transformed = transform(source);
  assert.match(transformed, /ll\.useSyncExternalStore/);
  assert.match(transformed, /p=CPXThreadHeaderTitle\(CPX_nativeTitle\)/);
});

test("61608 thread title producer uses the mounted React namespace", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.61608-5200");
  const [filePath, transform] = collectFileTransforms(patchSet).find(([, candidate]) => candidate.name === "patchThreadTitle");
  const source = [
    "var ll,ul=e((()=>{ll=t(n(),1),rt(),sl(),ot(),fi()}));",
    "function Sl(e){let t=(0,Tl.c)(51),{conversationId:n,hostIdOverride:r,getConversationMarkdown:i,markdownParentConversationId:a,pendingWorktree:o,projectIcon:s,projectIconInteractive:c,projectHoverCardContent:u,projectName:f,title:p,titleSuffix:m,cwd:h,canPin:g,hideForkActions:_}=e,v=c===void 0?!1:c,b=g===void 0?!0:g,x=Ur(),S=y(nr),C=d(),w=l(Di),E;t[0]===h?E=t[1]:(E=h?k(h):null,t[0]=h,t[1]=E);let D=E,O=L(Rn,n),ee=so(D,It(r??O).id),A;return p}",
  ].join("");

  assert.equal(filePath, "webview/assets/local-conversation-page-Brl_y7Vr.js");
  const transformed = transform(source);
  assert.match(transformed, /ll\.useSyncExternalStore/);
  assert.doesNotMatch(transformed, /t\(E\(\),1\)\.useSyncExternalStore/);
  assert.match(transformed, /p=CPXThreadHeaderTitle\(CPX_nativeTitle\)/);
});

test("61608 composer primitive forwards strict surface adapter props", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.61608-5200");
  const entry = collectFileTransforms(patchSet).find(([, candidate]) => candidate.name === "patchComposerPrimitiveSurface");
  assert.ok(entry, "61608 should register its mounted composer primitive producer");
  const [filePath, transform] = entry;
  const source = [
    "function h(e){let t=(0,A.c)(18),{children:n,className:r,utilityBarVariant:i,inert:o,isDragActive:c,layout:l,radiusVariant:u,surfaceVariant:d,onDragEnter:f,onDragLeave:m,onDragOver:h,onDrop:g}=e,",
    "t[10]!==n||t[11]!==o||t[12]!==f||t[13]!==m||t[14]!==h||t[15]!==g||t[16]!==M?",
    "(N=(0,j.jsx)(s.div,{inert:o,className:M,onMouseDown:k,onDragEnter:f,onDragOver:h,onDragLeave:m,onDrop:g,children:n}),t[10]=n,t[11]=o,t[12]=f,t[13]=m,t[14]=h,t[15]=g,t[16]=M,t[17]=N)",
  ].join("");

  assert.equal(filePath, "webview/assets/app-initial~app-main~pull-request-route~new-thread-panel-page~onboarding-page~projects-inde~oqn7zfcy-D76dsKXO.js");
  const transformed = transform(source);
  assert.match(transformed, /codexPlusProps:CPX_surfaceProps/);
  assert.match(transformed, /\.\.\.CPX_resolvedSurfaceProps,className:M/);
  assert.match(transformed, /t\[18\]=CPX_resolvedSurfaceProps/);
});

test("71524 header mounts the path accessory in the native action registry", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.71524-5263");
  const filePath = findTransformPath(patchSet, "header");
  const transform = findTransform(patchSet, "header");
  const source = "function ir(e){let t=(0,ar.c)(5),{conversationId:n}=e,r=u(Me),i=u(mt),a=G(he,n),o;t[0]===i.cwd?o=t[1]:(o=i.cwd==null?null:lt(i.cwd),t[0]=i.cwd,t[1]=o);let s=o;if(s==null||!a||i.kind!==`git`||r.kind===`remote-control`)return null;let c;return t[2]!==s||t[3]!==r?(c=(0,or.jsx)(q.HeaderAction,{actionId:`thread-local-project-actions`,align:`end`,order:100,children:(0,or.jsx)(qn,{cwd:s,hostConfig:r})}),t[2]=s,t[3]=r,t[4]=c):c=t[4],c}";

  assert.equal(filePath, "webview/assets/thread-app-shell-chrome-DxhbktFF.js");
  const transformed = transform(source);
  assert.match(transformed, /function CPXThreadHeaderAccessories/);
  assert.match(transformed, /CPX_headerContext=\{cwd:i\.cwd,hostId:r\?\.id\?\?null/);
  assert.match(transformed, /actionId:`codex-plus-project-path`,align:`start`,order:90/);
  assert.match(transformed, /children:\[CPX_headerAction,c\]/);
});

test("71524 native composer primitive forwards the stable surface props", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.71524-5263");
  const filePath = findTransformPath(patchSet, "composerPrimitive");
  const transform = findTransform(patchSet, "composerPrimitive");
  const source = "function h(e){let t=(0,A.c)(18),{children:n,className:a,utilityBarVariant:o,inert:s,isDragActive:c,layout:l,radiusVariant:u,surfaceVariant:d,onDragEnter:f,onDragLeave:m,onDragOver:h,onDrop:g}=e,_=o===void 0?`default`:o;let N;return t[10]!==n||t[11]!==s||t[12]!==f||t[13]!==m||t[14]!==h||t[15]!==g||t[16]!==M?(N=(0,j.jsx)(r.div,{inert:s,className:M,onMouseDown:k,onDragEnter:f,onDragOver:h,onDragLeave:m,onDrop:g,children:n}),t[10]=n,t[11]=s,t[12]=f,t[13]=m,t[14]=h,t[15]=g,t[16]=M,t[17]=N):N=t[17],N}";

  assert.equal(filePath, "webview/assets/app-initial~app-main~pull-request-route~new-thread-panel-page~onboarding-page~projects-inde~oqn7zfcy-D5V72FKd.js");
  const transformed = transform(source);
  assert.match(transformed, /codexPlusProps:CPX_surfaceProps/);
  assert.match(transformed, /CPX_resolvedSurfaceProps=CPX_surfaceProps\?\?CPXSurfaceProps\(\{\}\)/);
  assert.match(transformed, /r\.div,\{inert:s,\.\.\.CPX_resolvedSurfaceProps,className:M/);
  assert.match(transformed, /t\[18\]!==CPX_resolvedSurfaceProps/);
  assert.match(transformed, /t\[18\]=CPX_resolvedSurfaceProps/);
});

test("62119 native composer primitive forwards the stable surface props", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.62119-5211");
  const filePath = findTransformPath(patchSet, "composerPrimitive");
  const transform = findTransform(patchSet, "composerPrimitive");
  const source = "function Mln(e){let t=(0,x9.c)(18),{children:n,className:r,utilityBarVariant:i,inert:a,isDragActive:o,layout:s,radiusVariant:c,surfaceVariant:l,onDragEnter:u,onDragLeave:d,onDragOver:f,onDrop:p}=e,m=i===void 0?`default`:i;let D;return t[10]!==n||t[11]!==a||t[12]!==u||t[13]!==d||t[14]!==f||t[15]!==p||t[16]!==E?(D=(0,S9.jsx)(rp.div,{inert:a,className:E,onMouseDown:Kln,onDragEnter:u,onDragOver:f,onDragLeave:d,onDrop:p,children:n}),t[10]=n,t[11]=a,t[12]=u,t[13]=d,t[14]=f,t[15]=p,t[16]=E,t[17]=D):D=t[17],D}";

  assert.equal(filePath, "webview/assets/app-initial~app-main~quick-chat-window-page~work-home-page~chatgpt-conversation-page-BqLP6EDd.js");
  const transformed = transform(source);
  assert.match(transformed, /codexPlusProps:CPX_surfaceProps/);
  assert.match(transformed, /CPX_resolvedSurfaceProps=CPX_surfaceProps\?\?CPXSurfaceProps\(\{\}\)/);
  assert.match(transformed, /rp\.div,\{inert:a,\.\.\.CPX_resolvedSurfaceProps,className:E/);
  assert.match(transformed, /t\[18\]!==CPX_resolvedSurfaceProps/);
  assert.match(transformed, /t\[18\]=CPX_resolvedSurfaceProps/);
});

test("72221 native composer primitive forwards the stable surface props", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.72221-5307");
  const filePath = findTransformPath(patchSet, "composerPrimitive");
  const transform = findTransform(patchSet, "composerPrimitive");
  const source = "function h(e){let n=(0,A.c)(18),{children:r,className:a,utilityBarVariant:o,inert:s,isDragActive:c,layout:l,radiusVariant:u,surfaceVariant:d,onDragEnter:f,onDragLeave:m,onDragOver:h,onDrop:g}=e,_=o===void 0?`default`:o;let N;return n[10]!==r||n[11]!==s||n[12]!==f||n[13]!==m||n[14]!==h||n[15]!==g||n[16]!==M?(N=(0,j.jsx)(t.div,{inert:s,className:M,onMouseDown:k,onDragEnter:f,onDragOver:h,onDragLeave:m,onDrop:g,children:r}),n[10]=r,n[11]=s,n[12]=f,n[13]=m,n[14]=h,n[15]=g,n[16]=M,n[17]=N):N=n[17],N}";

  assert.equal(filePath, "webview/assets/app-initial~app-main~pull-request-route~new-thread-panel-page~onboarding-page~projects-inde~oqn7zfcy-CHcBauGK.js");
  const transformed = transform(source);
  assert.match(transformed, /codexPlusProps:CPX_surfaceProps/);
  assert.match(transformed, /CPX_resolvedSurfaceProps=CPX_surfaceProps\?\?CPXSurfaceProps\(\{\}\)/);
  assert.match(transformed, /t\.div,\{inert:s,\.\.\.CPX_resolvedSurfaceProps,className:M/);
  assert.match(transformed, /n\[18\]!==CPX_resolvedSurfaceProps/);
  assert.match(transformed, /n\[18\]=CPX_resolvedSurfaceProps/);
});

test("41301 native composer primitive forwards calculated surface props to its DOM root", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.41301-5103");
  const primitiveFile = findTransformPath(patchSet, "composerPrimitive");
  const source = "function b(e){let t=(0,P.c)(18),{children:n,className:r,utilityBarVariant:o,inert:s,isDragActive:c,layout:l,radiusVariant:u,surfaceVariant:d,onDragEnter:f,onDragLeave:p,onDragOver:m,onDrop:h}=e,g=o===void 0?`default`:o;let A;return t[10]!==n?(A=(0,F.jsx)(i.div,{inert:s,className:k,onDragEnter:f,onDragOver:m,onDragLeave:p,onDrop:h,children:n}),t[10]=n,t[17]=A):A=t[17],A}";

  const transformed = transformFile(patchSet, primitiveFile, source);

  assert.match(transformed, /CPXMC=window\.CodexPlusHost\.adapters\.messageComposer/);
  assert.match(transformed, /onDrop:h,codexPlusProps:CPX_surfaceProps\}=e,CPX_resolvedSurfaceProps=CPX_surfaceProps\?\?CPXSurfaceProps\(\{\}\)/);
  assert.match(transformed, /i\.div,\{inert:s,\.\.\.CPX_resolvedSurfaceProps,className:k/);
});

test("41301 composer registers its native file opener before a Files tab is mounted", () => {
  const patchSet = patchSets.find((candidate) => candidate.id === "chatgpt-26.707.41301-5103");
  const transform = collectFileTransforms(patchSet).find(([, candidate]) => candidate.name === "patchComposerProjectColors")?.[1];
  assert.equal(typeof transform, "function");
  const transformed = transform([
    "function ZBe({aboveComposerHeaderContent:e,activeCollaborationMode:t,",
    "bo=(e,t=xr)=>{let n=e.fsPath||e.path;if(!n||n.length===0)return;let r=e.startLine;bc({path:n,line:r,column:r==null?void 0:1,cwd:vn,hostId:t,openFile:Zt.mutate})},xo=e=>",
  ].join(""));
  assert.match(transformed, /CPXSP=globalThis\.CodexPlusHost\.adapters\.threadSidePanel/);
  assert.match(transformed, /CPXSP\.bindOpenFile\(\(e,t=\{\}\)=>bc\(\{scope:N,path:e,cwd:t\.workspaceRoot\?\?vn,hostConfig:Sr,hostId:t\.hostId\?\?xr,openFile:Zt\.mutate,openInSidePanel:!0\}\)/);
});
