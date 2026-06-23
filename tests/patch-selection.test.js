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

function versionedNames(patchSet) {
  if (patchSet.id === "codex-26.616.71553-4265") {
    return {
      srcFile: "src-l0hbMZ-p.js",
      threadContextInputsFile: "thread-context-inputs-B6tQCr7t.js",
      sidebarThreadKeysFile: "sidebar-thread-keys-Ch_amVKz.js",
      sidebarThreadRowSignalsFile: "sidebar-thread-row-signals-ZqNv-_WT.js",
      branchPickerDropdownContentFile: "git-branch-picker-dropdown-content-tZj3VhUw.js",
    };
  }
  return {
    srcFile: "src-C7fSIbpz.js",
    threadContextInputsFile: "thread-context-inputs-CF11za43.js",
    sidebarThreadKeysFile: "sidebar-thread-keys-xpkHnzZL.js",
    sidebarThreadRowSignalsFile: "sidebar-thread-row-signals-DVmC0DJ3.js",
    branchPickerDropdownContentFile: "git-branch-picker-dropdown-content-Ch_voM6R.js",
  };
}

function extractUserBubbleTextColor(transformed) {
  const match = transformed.match(/(function CPX_userBubbleTextColor\(e\)\{[\s\S]*?\})function CPX_setUserBubbleVars/);
  assert.ok(match, "transformed bundle has CPX_userBubbleTextColor");
  return vm.runInNewContext(`${match[1]};CPX_userBubbleTextColor`);
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
    assert.ok(addedFiles.includes("webview/assets/codex-plus/runtime.js"));
    assert.ok(addedFiles.includes("webview/assets/codex-plus/plugins/aboutMetadata.js"));
    assert.ok(addedFiles.includes("webview/assets/codex-plus/plugins/nestedRepositories.js"));
    assert.ok(addedFiles.includes("webview/assets/codex-plus/plugins/diagnosticErrors.js"));
    assert.ok(addedFiles.includes("webview/assets/codex-plus/plugins/userBubbleColors.js"));
    assert.ok(addedFiles.includes("webview/assets/codex-plus/plugins/projectColors.js"));
    assert.ok(addedFiles.includes("webview/assets/codex-plus/plugins/sidebarNameBlur.js"));
  }
});

test("current patch queues expose project colors and sidebar blur separately from bubble colors", () => {
  for (const patchSet of patchSets) {
    const patchIds = patchSet.patches.map((patch) => patch.id);
    assert.ok(patchIds.includes("user-message-bubble-colors"));
    assert.ok(patchIds.includes("project-colors"));
    assert.ok(patchIds.includes("sidebar-name-blur"));
    assert.ok(patchIds.indexOf("user-message-bubble-colors") < patchIds.indexOf("project-colors"));
    assert.ok(patchIds.indexOf("project-colors") < patchIds.indexOf("sidebar-name-blur"));
  }
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

test("runtime API registers plugins, settings, commands, styles, modules, and patches", () => {
  const runtime = fs.readFileSync("src/runtime/runtime.js", "utf8");
  const styles = [];
  const storage = new Map();
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

  vm.runInNewContext(runtime, context);

  const api = window.CodexPlus;
  api.registerPlugin(
    api.definePlugin({
      id: "sample",
      name: "Sample",
      required: true,
      settings: { enabled: { type: "boolean", default: true } },
      commands: [{ id: "sample.command", run: () => "ok" }],
      styles: ".sample{}",
      patches: [{ find: "hello", replacement: { match: "hello", replace: "hi" } }],
      start(instance) {
        instance.modules.registerHostModule("sample", { marker: true });
      },
    }),
  );

  assert.equal(api.plugins.get("sample").settingsStore.get("enabled"), true);
  assert.equal(api.commands.run("sample.command"), "ok");
  assert.deepEqual(api.modules.findByProps("marker"), { marker: true });
  assert.equal(api.patches.apply("hello world"), "hi world");
  assert.equal(styles.some((element) => element.id === "codex-plus-style-sample"), true);
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

  assert.match(transformed, /let i=`Codex Plus`,o=a\.app\.getVersion\(\)/);
  assert.match(transformed, /codexPlusDisclaimerHeading:"Disclaimer of Warranty and Limitation of Liability"/);
  assert.match(transformed, /codexPlusDisclaimerBody:"THIS SOFTWARE IS PROVIDED/);
  assert.match(transformed, /class="codex-plus-disclaimer"/);
  assert.match(transformed, /class="codex-plus-disclaimer-heading"/);
  assert.match(transformed, /\.codex-plus-disclaimer \{\n      width: 100%;\n      margin: 0 0 12px;/);
  assert.match(transformed, /\.codex-plus-disclaimer-heading \{\n      margin-bottom: 4px;\n      font-weight: 700;/);
  assert.match(transformed, /\.build-info \{\n      width: 100%;\n      margin: 0;\n      line-height: 1\.45;\n      color: var\(--muted-text\);\n      text-align: left;/);
  assert.match(transformed, /\.codex-plus-disclaimer,\n    \.build-info,/);
  assert.match(transformed, /\$\{q\}\n      <pre class="build-info"/);
  assert.doesNotMatch(transformed, /This app is Codex Plus\./);
  assert.match(transformed, /https:\/\/github\.com\/michaelw\/codex-plus-patcher/);
  assert.match(transformed, /Patcher commit: abc123def456/);
  assert.match(transformed, /Source app\.asar: source-sha/);
  assert.match(transformed, /- bundle-identity/);
  assert.match(transformed, /- about-codex-plus-metadata/);
});

test("title patch loads the Codex Plus runtime bootstrap", () => {
  for (const patchSet of patchSets) {
    const transformed = transformFile(patchSet, "webview/index.html", "<title>Codex</title>");
    assert.match(transformed, /<title>Codex Plus<\/title>/);
    assert.match(transformed, /<script src="\.\/assets\/codex-plus\/runtime\.js"><\/script>/);
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
  assert.match(readme, /Toggle sidebar blur/);
  assert.match(readme, /Runtime Plugin Support\]\(docs\/plugin-support\.md\)/);
  assert.match(readme, /Versioned ASAR patches install the runtime,\s+built-in plugins/);
  assert.match(development, /If a patch or runtime plugin is added, removed, or renamed/);
  assert.match(development, /README patch summary/);
  assert.match(development, /About dialog still reports the applied patch IDs/);
  assert.match(development, /Prefer new user-facing additions as readable runtime plugins/);
  assert.match(development, /hook that surface\s+into Codex core with the smallest versioned patch needed/);

  const pluginSupport = fs.readFileSync("docs/plugin-support.md", "utf8");
  assert.match(pluginSupport, /window\.CodexPlus/);
  assert.match(pluginSupport, /window\.CodexPlusHost/);
  assert.match(pluginSupport, /CodexPlus\.definePlugin/);
  assert.match(pluginSupport, /CodexPlus\.registerPlugin/);
  assert.match(pluginSupport, /aboutMetadata/);
  assert.match(pluginSupport, /sidebarNameBlur/);
  assert.match(pluginSupport, /third-party plugin marketplace/);
  assert.equal(packageJson.version, "0.3.0");
  assert.equal(packageJson.scripts.check, "node scripts/check-syntax.js");
});

test("about dialog applied patch examples stay aligned with the active patch queue", () => {
  const patchSet = patchSets.find((patchSet) => patchSet.id === "codex-26.616.51431-4212");
  const transform = collectFileTransforms(patchSet).find(([filePath]) => filePath === ".vite/build/main-B6erVVHq.js")?.[1];
  const transformed = transform(fakeAboutDialogBundle(), {
    appliedPatches: patchSet.patches.map((patch) => patch.id),
  });

  for (const patch of patchSet.patches) {
    assert.match(transformed, new RegExp(`- ${patch.id}`));
  }
  assert.doesNotMatch(transformed, /Patch descriptions:/);
});

test("about dialog patch fails closed when the build information hook changes", () => {
  const patchSet = patchSets.find((patchSet) => patchSet.id === "codex-26.616.51431-4212");
  const transform = collectFileTransforms(patchSet).find(([filePath]) => filePath === ".vite/build/main-B6erVVHq.js")?.[1];

  assert.throws(
    () => transform(fakeAboutDialogBundle().replace("function V0(e){return[]}", "function V0(e){return[1]}")),
    /Expected one about dialog build information anchor, found 0/,
  );
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
      /s=\(0,\$\.jsx\)\(CPXReviewMux,\{mainReviewContent:\(0,\$\.jsx\)\(Tf,\{diffMode:a,setTabState:r,tabState:i\}\)\}\)/,
    );
    assert.match(transformed, /p=e\.mainReviewContent,g=\(0,Q\.useMemo\)\(\(\)=>p\?\?/);
    assert.match(transformed, /function CPXBranchPicker\(\{repo:e,hostConfig:t,baseBranch:n,setBaseBranch:r\}\)/);
    assert.match(transformed, /method:`recent-branches`/);
    assert.match(transformed, /method:`search-branches`/);
    assert.match(transformed, /CPXBranchPickerDropdownContent/);
    assert.match(transformed, /source:D,operationSource:`codex_plus_review`,hostConfig:t,\.\.\.C\.length>0\?\{baseBranch:C\}:\{\}/);
    assert.match(transformed, /function CPXRepoDiffBody\(\{cwd:e,hostConfig:t,conversationId:n,diffMode:r,diffText:i,statusText:a,error:o,isLoading:s\}\)/);
    assert.match(transformed, /c=xr\(i\)/);
    assert.match(transformed, /\(0,Q\.createElement\)\(Ma,\{key:/);
    assert.match(
      transformed,
      /o\?null:\(0,\$\.jsx\)\(CPXRepoDiffBody,\{cwd:e\.cwd,hostConfig:t,conversationId:r,diffMode:A1,diffText:c,statusText:b,error:f,isLoading:u\}\)/,
    );
    assert.match(transformed, /conversationId:o,diffMode:a,baseBranch:m\.get\(S\(e\)\)\?\?``/);
    assert.match(transformed, /className:`mx-3 mb-3 flex min-w-0 max-w-none flex-col gap-2`/);
    assert.match(transformed, /containerClassName:`codex-review-diff-card extension:rounded-lg w-full max-w-none`/);
    assert.match(transformed, /className:`flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto`/);
    assert.doesNotMatch(transformed, /placeholder:`base`/);
    assert.doesNotMatch(transformed, /\(0,\$\.jsx\)\(`input`,\{className:`h-7 w-28/);
  }
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

    assert.match(transformed, /case`repository-targets`:a=X\(await CPX_repositoryTargets/);
    assert.match(transformed, /case`commit-message-diff`:case`codex-plus-trace`:case`repository-targets`:case`submodule-paths`:case`cat-file`:/);
    assert.match(
      transformed,
      /function CPX_isReadOnlyBranchRequest\(e,t\)\{return t===`codex_plus_review`&&\(e===`recent-branches`\|\|e===`search-branches`\)\}/,
    );
    assert.match(
      transformed,
      /function u2\(\{requestKind:e,source:t\}\)\{return l2\.has\(e\?\?``\)\|\|d2\(t\)\|\|CPX_isReadOnlyBranchRequest\(e,t\)\}/,
    );
  }
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

    assert.equal(transforms.length, 2, `${patchSet.id} has split appearance settings transforms`);

    const transformed = transformFile(patchSet, settingsFile, fakeSettingsBundle);

    {
      const helperStart = transformed.indexOf("const CPX_PROJECT_COLORS_ENABLED_KEY");
      const helperEnd = transformed.indexOf("function tn", helperStart);
      assert.doesNotThrow(() => new Function(transformed.slice(helperStart, helperEnd)));
    }
    assert.match(transformed, /CPX_USER_BUBBLE_COLORS_KEY=`codex-plus:user-message-bubble-colors`/);
    assert.match(transformed, /CPX_USER_BUBBLE_COLORS_EVENT=`codex-plus:user-message-bubble-colors-change`/);
    assert.match(transformed, /CPX_PROJECT_COLORS_ENABLED_KEY=`codex-plus:project-colors-enabled`/);
    assert.doesNotMatch(transformed, /CPX_USER_BUBBLE_OVERRIDE_KEY/);
    assert.doesNotMatch(transformed, /codex-plus:user-bubble-color-override/);
    assert.match(transformed, /CPX_PROJECT_PALETTE=\[\[/);
    assert.match(transformed, /function CPX_projectColorKey\(e\)\{if\(e==null\)return``;if\(typeof e===`string`\)return e\.trim\(\)/);
    {
      const paletteStart = transformed.indexOf("CPX_PROJECT_PALETTE=");
      const paletteEnd = transformed.indexOf(";function CPX_readBool", paletteStart);
      const paletteSource = transformed.slice(paletteStart, paletteEnd);
      assert.ok((paletteSource.match(/\[`#[0-9a-fA-F]{6}`/g) ?? []).length >= 32);
    }
    assert.match(transformed, /userBubble:\{id:`settings\.general\.appearance\.userMessageBubble\.short`,defaultMessage:`User bubble`/);
    assert.match(transformed, /projectColors:\{id:`settings\.general\.appearance\.projectColors\.short`,defaultMessage:`Project colors`/);
    assert.doesNotMatch(transformed, /userBubbleOverride/);
    assert.match(transformed, /CPX_defaultUserBubbleColor\(e\)\{return e===`dark`\?`#2f2f2f`:`#f2f2f2`\}/);
    assert.match(transformed, /CPX_isStoredUserBubbleColor\(e,t\)\{return CPX_isUserBubbleColor\(t\)&&t\.toLowerCase\(\)!==CPX_defaultUserBubbleColor\(e\)\}/);
    assert.match(transformed, /light:CPX_isStoredUserBubbleColor\(`light`,e\.light\)\?e\.light:``/);
    assert.match(transformed, /dark:CPX_isStoredUserBubbleColor\(`dark`,e\.dark\)\?e\.dark:``/);
    assert.match(transformed, /CPX_readUserBubbleColors\(\)\[e\]\|\|CPX_defaultUserBubbleColor\(e\)/);
    assert.match(transformed, /CPX_isStoredUserBubbleColor\(e,t\)\?n\[e\]=t:delete n\[e\]/);
    assert.match(transformed, /CPX_userBubbleLabel=i\.formatMessage\(Q\.userBubble\)/);
    assert.match(transformed, /CPX_projectColorsLabel=i\.formatMessage\(Q\.projectColors\)/);
    assert.doesNotMatch(transformed, /CPX_userBubbleOverrideLabel/);
    assert.match(transformed, /\(0,Z\.jsx\)\(CPXUserBubbleColorRow,\{variant:n,label:CPX_userBubbleLabel,ariaLabel:i\.formatMessage/);
    assert.match(transformed, /\(0,Z\.jsx\)\(CPXProjectColorToggleRow,\{label:CPX_projectColorsLabel,ariaLabel:i\.formatMessage/);
    assert.doesNotMatch(transformed, /CPXUserBubbleOverrideToggleRow/);
    assert.match(transformed, /defaultMessage:`\{variant\} user message bubble color`/);
    assert.match(transformed, /defaultMessage:`\{variant\} project colors`/);
    assert.doesNotMatch(transformed, /custom user bubble colors override project colors/);
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

    assert.match(transformed, /CPX_PROJECT_COLORS_ENABLED_KEY=`codex-plus:project-colors-enabled`/);
    assert.match(transformed, /CPX_PROJECT_PALETTE=\[\[/);
    assert.match(transformed, /function CPX_projectColorKey\(e\)\{if\(e==null\)return``;if\(typeof e===`string`\)return e\.trim\(\)/);
    assert.match(transformed, /let t=e\.projectId\?\?e\.id/);
    assert.match(transformed, /data-codex-plus-project-color/);
    assert.match(transformed, /data-codex-plus-project-sidebar-color/);
    assert.match(transformed, /data-codex-plus-project-sidebar-color\]\{border-radius:0;background-color/);
    assert.match(transformed, /--codex-plus-project-separator-light/);
    assert.match(transformed, /\[data-codex-plus-project-color\]:not\(\[data-codex-plus-project-sidebar-color\]\)\{background-image:linear-gradient/);
    assert.match(transformed, /background-size:2px 100%/);
    assert.match(transformed, /rowAttributes:\{\.\.\.ke,\.\.\.CPX_projectColorDataAttributes\(n,!0\)\}/);
    assert.match(transformed, /dataAttributes:CPX_projectColorDataAttributes\(i,!0\)/);
    assert.match(transformed, /"data-codex-plus-sidebar-name":``/);
    assert.match(transformed, /function CPXSidebarNameBlurCommand\(\)/);
    assert.match(transformed, /Hp\(`codexPlusToggleSidebarNameBlur`/);
    assert.match(transformed, /Toggle sidebar blur/);
    assert.match(transformed, /codexPlusToggleSidebarNameBlur:\$i/);
    assert.match(transformed, /data-codex-plus-sidebar-names-blurred/);
    assert.doesNotMatch(transformed, /localStorage\.(?:setItem|getItem)\(`codex-plus:sidebar/);
    assert.match(transformed, /children:\[l,u,\(0,Z\.jsx\)\(CPXSidebarNameBlurCommand,\{\}\),\(0,Z\.jsx\)\(H_,\{route:a,children:C\}\)\]/);
    assert.match(transformed, /function Pk\(e\)\{let t=\(0,Q\.c\)\(46\),/);
    assert.match(transformed, /t\[24\]!==a\|\|t\[45\]!==i\?/);
    assert.match(transformed, /t\[24\]=a,t\[45\]=i,t\[25\]=q\):q=t\[25\]/);
    assert.match(transformed, /CPX_installProjectColorStyles\(\)/);
  }
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
    assert.match(transformed, /CPX_rowDataAttributes=Fe\?\?CPX_projectColorDataAttributes\(Oe,!0\)/);
    assert.match(transformed, /dataAttributes:CPX_rowDataAttributes/);
    assert.match(transformed, /t\[87\]!==CPX_rowDataAttributes/);
    assert.match(transformed, /t\[87\]=CPX_rowDataAttributes/);
  }
});

test("command palette metadata exposes the sidebar blur command without a shortcut", () => {
  const fakeElectronMenuShortcutsBundle = [
    "{id:`toggleSidebar`,titleIntlId:`codex.command.toggleSidebar`,descriptionIntlId:`codex.commandDescription.toggleSidebar`,commandMenuGroupKey:`panels`,commandMenu:!0,electron:{menuTitle:`Toggle Sidebar`,menuTitleIntlId:`codex.commandMenuTitle.toggleSidebar`,defaultKeybindings:[{key:`CmdOrCtrl+B`}]}},{id:`toggleBottomPanel`,",
  ].join("");

  for (const patchSet of patchSets) {
    const transform = collectFileTransforms(patchSet).find(
      ([filePath]) => filePath === "webview/assets/electron-menu-shortcuts-j6UKqTX5.js",
    )?.[1];

    assert.equal(typeof transform, "function", `${patchSet.id} has command metadata transform`);

    const transformed = transform(fakeElectronMenuShortcutsBundle);
    const commandStart = transformed.indexOf("id:`codexPlusToggleSidebarNameBlur`");
    const commandEnd = transformed.indexOf("},{id:`toggleBottomPanel`");
    const commandMetadata = transformed.slice(commandStart, commandEnd);

    assert.notEqual(commandStart, -1);
    assert.match(commandMetadata, /titleIntlId:`codexPlus\.command\.toggleSidebarNameBlur`/);
    assert.match(commandMetadata, /descriptionIntlId:`codexPlus\.commandDescription\.toggleSidebarNameBlur`/);
    assert.match(commandMetadata, /commandMenuGroupKey:`panels`/);
    assert.match(commandMetadata, /commandMenu:!0/);
    assert.match(commandMetadata, /electron:\{menuTitle:`Toggle sidebar blur`,menuTitleIntlId:`codexPlus\.commandMenuTitle\.toggleSidebarNameBlur`,defaultKeybindings:\[\]\}/);
    assert.doesNotMatch(commandMetadata, /localStorage/);
  }
});

test("keyboard shortcut search metadata defines sidebar blur intl messages", () => {
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

    assert.match(transformed, /"codexPlus\.command\.toggleSidebarNameBlur":\{id:`codexPlus\.command\.toggleSidebarNameBlur`,defaultMessage:`Toggle sidebar blur`/);
    assert.match(transformed, /"codexPlus\.commandMenuTitle\.toggleSidebarNameBlur":\{id:`codexPlus\.commandMenuTitle\.toggleSidebarNameBlur`,defaultMessage:`Toggle sidebar blur`/);
    assert.match(transformed, /"codexPlus\.commandDescription\.toggleSidebarNameBlur":\{id:`codexPlus\.commandDescription\.toggleSidebarNameBlur`,defaultMessage:`Blur or show sidebar chat and project names`/);
    assert.match(transformed, /t\.formatMessage\(c\[e\.titleIntlId\]\)/);
    assert.match(transformed, /t\.formatMessage\(l\[e\.electron\.menuTitleIntlId\]\)/);
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

    assert.match(transformed, /function CPX_mergeDataAttributes\(e,t\)/);
    assert.match(transformed, /dataAttributes:CPX_rowDataAttributes/);
    assert.match(transformed, /dataAttributes:l\?\.dataAttributes/);
    assert.match(transformed, /CPX_mergeDataAttributes\(ae\.sidebarThreadRow\(\{active:s,hostId:f,id:i,kind:`local`,pinned:r,title:x\}\),CPX_rowDataAttributes\)/);
    assert.match(transformed, /CPX_mergeDataAttributes\(ae\.sidebarThreadRow\(\{active:s,hostId:null,id:t,kind:`remote`,pinned:r,title:e\.task\.title\?\?``\}\),CPX_rowDataAttributes\)/);
    assert.match(transformed, /CPX_mergeDataAttributes\(ae\.sidebarThreadRow\(\{active:s,hostId:t\.hostId,id:n,kind:`pending-worktree`,pinned:r,title:t\.label\}\),CPX_rowDataAttributes\)/);
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

    assert.match(transformed, /CPX_USER_BUBBLE_COLORS_KEY=`codex-plus:user-message-bubble-colors`/);
    assert.match(transformed, /CPX_PROJECT_COLORS_ENABLED_KEY=`codex-plus:project-colors-enabled`/);
    assert.doesNotMatch(transformed, /CPX_USER_BUBBLE_OVERRIDE_KEY/);
    assert.doesNotMatch(transformed, /CPX_userBubbleOverrideEnabled/);
    assert.match(transformed, /function CPX_projectColorStyle\(e\)/);
    assert.match(transformed, /function CPX_projectColorKey\(e\)\{if\(e==null\)return``;if\(typeof e===`string`\)return e\.trim\(\)/);
    assert.ok(transformed.includes(`import{t as CPX_localThreadKey}from"./${names.sidebarThreadKeysFile}";`));
    assert.ok(transformed.includes(`import{s as CPX_threadProjectId}from"./${names.sidebarThreadRowSignalsFile}";`));
    assert.match(transformed, /CPX_isStoredUserBubbleColor\(e,t\)\{return CPX_isUserBubbleColor\(t\)&&t\.toLowerCase\(\)!==CPX_defaultUserBubbleColor\(e\)\}/);
    assert.match(transformed, /light:CPX_isStoredUserBubbleColor\(`light`,e\.light\)\?e\.light:null/);
    assert.match(transformed, /dark:CPX_isStoredUserBubbleColor\(`dark`,e\.dark\)\?e\.dark:null/);
    assert.match(transformed, /CPX_userBubbleTextColor\(e\)/);
    assert.match(transformed, /s>=4\.5&&s>=l\?`#111111`:o>=l\?`#000000`:`#ffffff`/);
    const userBubbleTextColor = extractUserBubbleTextColor(transformed);
    assert.equal(userBubbleTextColor("#e0218a"), "#000000");
    assert.equal(userBubbleTextColor("#65FB63"), "#111111");
    assert.equal(userBubbleTextColor("#2f2f2f"), "#ffffff");
    assert.match(transformed, /function CPX_setUserBubbleVars\(\)/);
    assert.match(transformed, /--codex-plus-user-bubble-light-bg/);
    assert.match(transformed, /--codex-plus-user-bubble-dark-fg/);
    assert.match(transformed, /--codex-plus-project-separator-light/);
    assert.match(transformed, /\[data-codex-plus-project-color\]:not\(\[data-codex-plus-project-sidebar-color\]\)\{background-image:linear-gradient/);
    assert.match(transformed, /background-size:2px 100%/);
    assert.doesNotMatch(transformed, /\[data-codex-plus-user-bubble\]\[data-codex-plus-project-color\]\).*background-color:var\(--codex-plus-project/);
    assert.match(transformed, /function CPX_installUserBubbleColors\(\)/);
    assert.match(transformed, /:root:not\(\.dark\):not\(\.electron-dark\) :is\(\[data-codex-plus-user-bubble\],\[data-codex-plus-user-entry\]\)/);
    assert.match(transformed, /:root\.dark :is\(\[data-codex-plus-user-bubble\],\[data-codex-plus-user-entry\]\),:root\.electron-dark :is\(\[data-codex-plus-user-bubble\],\[data-codex-plus-user-entry\]\)/);
    assert.match(transformed, /:root:not\(\.dark\):not\(\.electron-dark\) \[data-codex-plus-user-entry\] :is\(\.ProseMirror,\.ProseMirror \*,textarea,\[contenteditable="true"\],\[data-placeholder\]\),:root:not\(\.dark\):not\(\.electron-dark\) \[data-codex-plus-user-entry\] :is\(button:not\(\[class\*="bg-token-foreground"\]\),\[role="button"\]:not\(\[class\*="bg-token-foreground"\]\),button:not\(\[class\*="bg-token-foreground"\]\) svg,\[role="button"\]:not\(\[class\*="bg-token-foreground"\]\) svg,\[class\*="text-token-foreground"\],\[class\*="text-token-description-foreground"\],\[class\*="text-token-input-placeholder-foreground"\],\[class\*="text-token-text-link-foreground"\],\[class\*="text-token-editor-warning-foreground"\]\)\{color:var\(--codex-plus-user-bubble-light-fg\)\}/);
    assert.match(transformed, /:root:not\(\.dark\):not\(\.electron-dark\) \[data-codex-plus-user-entry\] :is\(\[data-placeholder\],\[class\*="text-token-input-placeholder-foreground"\]\)::before,:root:not\(\.dark\):not\(\.electron-dark\) \[data-codex-plus-user-entry\] :is\(\[data-placeholder\],\[class\*="text-token-input-placeholder-foreground"\]\)::after,:root:not\(\.dark\):not\(\.electron-dark\) \[data-codex-plus-user-entry\] :is\(input,textarea,\[contenteditable="true"\],\[class\*="placeholder:text-token-input-placeholder-foreground"\]\)::placeholder\{color:var\(--codex-plus-user-bubble-light-fg\)\}/);
    assert.match(transformed, /:root\.dark \[data-codex-plus-user-entry\] :is\(\.ProseMirror,\.ProseMirror \*,textarea,\[contenteditable="true"\],\[data-placeholder\]\),:root\.electron-dark \[data-codex-plus-user-entry\] :is\(\.ProseMirror,\.ProseMirror \*,textarea,\[contenteditable="true"\],\[data-placeholder\]\),:root\.dark \[data-codex-plus-user-entry\] :is\(button:not\(\[class\*="bg-token-foreground"\]\),\[role="button"\]:not\(\[class\*="bg-token-foreground"\]\),button:not\(\[class\*="bg-token-foreground"\]\) svg,\[role="button"\]:not\(\[class\*="bg-token-foreground"\]\) svg,\[class\*="text-token-foreground"\],\[class\*="text-token-description-foreground"\],\[class\*="text-token-input-placeholder-foreground"\],\[class\*="text-token-text-link-foreground"\],\[class\*="text-token-editor-warning-foreground"\]\),:root\.electron-dark \[data-codex-plus-user-entry\] :is\(button:not\(\[class\*="bg-token-foreground"\]\),\[role="button"\]:not\(\[class\*="bg-token-foreground"\]\),button:not\(\[class\*="bg-token-foreground"\]\) svg,\[role="button"\]:not\(\[class\*="bg-token-foreground"\]\) svg,\[class\*="text-token-foreground"\],\[class\*="text-token-description-foreground"\],\[class\*="text-token-input-placeholder-foreground"\],\[class\*="text-token-text-link-foreground"\],\[class\*="text-token-editor-warning-foreground"\]\)\{color:var\(--codex-plus-user-bubble-dark-fg\)\}/);
    assert.match(transformed, /:root\.dark \[data-codex-plus-user-entry\] :is\(\[data-placeholder\],\[class\*="text-token-input-placeholder-foreground"\]\)::before,:root\.dark \[data-codex-plus-user-entry\] :is\(\[data-placeholder\],\[class\*="text-token-input-placeholder-foreground"\]\)::after,:root\.dark \[data-codex-plus-user-entry\] :is\(input,textarea,\[contenteditable="true"\],\[class\*="placeholder:text-token-input-placeholder-foreground"\]\)::placeholder,:root\.electron-dark \[data-codex-plus-user-entry\] :is\(\[data-placeholder\],\[class\*="text-token-input-placeholder-foreground"\]\)::before,:root\.electron-dark \[data-codex-plus-user-entry\] :is\(\[data-placeholder\],\[class\*="text-token-input-placeholder-foreground"\]\)::after,:root\.electron-dark \[data-codex-plus-user-entry\] :is\(input,textarea,\[contenteditable="true"\],\[class\*="placeholder:text-token-input-placeholder-foreground"\]\)::placeholder\{color:var\(--codex-plus-user-bubble-dark-fg\)\}/);
    assert.match(transformed, /window\.addEventListener\(CPX_USER_BUBBLE_COLORS_EVENT,CPX_setUserBubbleVars\)/);
    assert.doesNotMatch(transformed, /window\.addEventListener\(CPX_PROJECT_COLOR_EVENT,CPX_setUserBubbleVars\)/);
    assert.match(transformed, /CPX_installUserBubbleColors\(\)/);
    assert.match(transformed, /CPX_userMessageProjectId=o\(CPX_threadProjectId,S==null\?null:CPX_localThreadKey\(S\)\)/);
    assert.match(transformed, /CPX_userMessageProjectStyle=CPX_projectColorStyle\(CPX_userMessageProjectId\)/);
    assert.match(transformed, /"data-user-message-bubble":!0,"data-codex-plus-user-bubble":!0,"data-codex-plus-project-color":CPX_userMessageProjectStyle\?``:void 0,style:CPX_userMessageProjectStyle/);
    assert.match(transformed, /borderLeft:`6px solid \$\{t\}`/);
    assert.match(transformed, /"data-codex-plus-user-entry":!0,className:`relative flex w-full flex-col rounded-3xl bg-token-foreground\/5`/);
    assert.match(transformed, /bg-token-foreground\/5 max-w-\[77%\]/);
  }
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
    if (patchSet.id === "codex-26.616.71553-4265") {
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

    assert.match(transformed, /CPX_USER_BUBBLE_COLORS_KEY=`codex-plus:user-message-bubble-colors`/);
    assert.match(transformed, /CPX_PROJECT_COLORS_ENABLED_KEY=`codex-plus:project-colors-enabled`/);
    assert.match(transformed, /function CPX_projectColorKey\(e\)\{if\(e==null\)return``;if\(typeof e===`string`\)return e\.trim\(\)/);
    assert.ok(transformed.includes(`import{t as CPX_localThreadKey}from"./${names.sidebarThreadKeysFile}";`));
    assert.ok(transformed.includes(`import{s as CPX_threadProjectId}from"./${names.sidebarThreadRowSignalsFile}";`));
    assert.match(transformed, /function CPX_installUserBubbleColors\(\)/);
    assert.match(transformed, /function oh\(e\)\{let t=\(0,\$\.c\)\(14\)/);
    assert.doesNotMatch(transformed, /\[data-codex-plus-user-entry\]\[data-codex-plus-project-color\].*background-color:var\(--codex-plus-project/);
    assert.match(transformed, /:root:not\(\.dark\):not\(\.electron-dark\) :is\(\[data-codex-plus-user-bubble\],\[data-codex-plus-user-entry\]\)/);
    assert.match(transformed, /\[data-codex-plus-user-entry\] :is\(\.ProseMirror,\.ProseMirror \*,textarea,\[contenteditable="true"\],\[data-placeholder\]\),:root:not\(\.dark\):not\(\.electron-dark\) \[data-codex-plus-user-entry\] :is\(button:not\(\[class\*="bg-token-foreground"\]\),\[role="button"\]:not\(\[class\*="bg-token-foreground"\]\)/);
    assert.match(transformed, /\[data-placeholder\],\[class\*="text-token-input-placeholder-foreground"\]\)::before/);
    assert.match(transformed, /\[data-placeholder\],\[class\*="text-token-input-placeholder-foreground"\]\)::after/);
    assert.match(transformed, /input,textarea,\[contenteditable="true"\],\[class\*="placeholder:text-token-input-placeholder-foreground"\]\)::placeholder/);
    assert.doesNotMatch(transformed, /\.ProseMirror\[data-placeholder\]::before/);
    assert.doesNotMatch(transformed, /p\.is-editor-empty:first-child::before/);
    assert.match(transformed, /button:not\(\[class\*="bg-token-foreground"\]\) svg/);
    assert.match(transformed, /\[class\*="text-token-description-foreground"\]/);
    assert.match(transformed, /\[class\*="text-token-input-placeholder-foreground"\]/);
    assert.match(transformed, /\[class\*="text-token-text-link-foreground"\]/);
    assert.match(transformed, /\[class\*="text-token-editor-warning-foreground"\]/);
    assert.match(transformed, /text-token-text-link-foreground"\],\[class\*="text-token-editor-warning-foreground"\]\)\{color:var\(--codex-plus-user-bubble-light-fg\)\}/);
    assert.match(transformed, /text-token-text-link-foreground"\],\[class\*="text-token-editor-warning-foreground"\]\)\{color:var\(--codex-plus-user-bubble-dark-fg\)\}/);
    assert.match(transformed, /\[role="button"\]:not\(\[class\*="bg-token-foreground"\]\) svg/);
    assert.match(transformed, /\[data-codex-plus-user-entry\] :is\(\.ProseMirror,\.ProseMirror \*,textarea,\[contenteditable="true"\],\[data-placeholder\]\),:root\.electron-dark \[data-codex-plus-user-entry\] :is\(\.ProseMirror,\.ProseMirror \*,textarea,\[contenteditable="true"\],\[data-placeholder\]\),:root\.dark \[data-codex-plus-user-entry\] :is\(button:not\(\[class\*="bg-token-foreground"\]\)/);
    assert.match(transformed, /style:CPX_projectColorInlineStyle,className:v/);
    assert.match(transformed, /data-codex-plus-project-color":CPX_projectColorInlineStyle\?``:void 0/);
    assert.match(transformed, /CPX_composerThreadProjectId=a\(CPX_threadProjectId,G==null\?null:CPX_localThreadKey\(G\)\)/);
    assert.match(transformed, /CPX_composerProjectStyle=CPX_projectColorStyle\(G==null\?On\?\{hostId:On\.hostId,path:On\.remotePath,projectId:kn,label:On\.label\?\?On\.name\}:x\?\?void 0:CPX_composerThreadProjectId\);return/);
    assert.match(transformed, /style:!Ge&&!Hn\?CPX_composerProjectStyle:void 0/);
    assert.doesNotMatch(transformed, /style:!Ge&&!Hn\?CPX_projectColorStyle\(.*a\(CPX_threadProjectId/);
    assert.match(transformed, /--codex-plus-project-separator-dark/);
    assert.match(transformed, /background-size:2px 100%/);
  }
});
