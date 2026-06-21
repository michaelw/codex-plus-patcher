const assert = require("node:assert/strict");
const test = require("node:test");

const { applyPatchSet, collectFileTransforms, collectInfoPlistStrings, selectPatch } = require("../src/core/patch-engine");
const { patchSets } = require("../src/patches");

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

test("applyPatchSet reports non-dry-run apply steps in order", async () => {
  const progress = [];
  const operations = {
    fs: {
      rmSync() {},
      mkdirSync() {},
    },
    run() {},
    patchAsar() {
      return "patched-sha";
    },
    replacePlistString() {},
    setPlistBuddyValue() {},
  };

  const result = await applyPatchSet({
    sourceApp: "/Applications/Codex.app",
    targetApp: "/Users/example/Applications/Codex Plus.app",
    patchSet: {
      id: "codex-example",
      infoPlistStrings: { CFBundleName: "Codex Plus" },
      fileTransforms: [["webview/index.html", (text) => text]],
    },
    progress: (event) => progress.push(event),
    progressOffset: 2,
    progressTotal: 8,
    operations,
  });

  assert.equal(result.patchedAsarSha, "patched-sha");
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

test("review patch mounts repository mux before main branch selection", () => {
  const fakeBundle = [
    "function uf({cwd:e,fileEntries:t,generatedPathsReady:n,hasUnhandledAttributesFiles:r,isCappedMode:i,repositorySource:a,reviewSummarySource:o}){",
    "return {children:d&&!u&&c==null?(0,$.jsx)(Oa,{}):(0,$.jsx)(of,{diffRefs:t,diffMode:e,isCappedMode:d,reviewDiffMetrics:g,showReviewGitActions:v})}",
    "}",
    "function Ap(e){let t=(0,Z.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e,a=l(Nt),o;t[0]===Symbol.for(`react.memo_cache_sentinel`)?(o=(0,$.jsx)(`div`,{className:`min-h-0 max-w-full min-w-0`,children:(0,$.jsx)(wp,{})}),t[0]=o):o=t[0];let s;t[1]!==a||t[2]!==r||t[3]!==i?(s=(0,$.jsx)(Tf,{diffMode:a,setTabState:r,tabState:i}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];let c;return c}",
  ].join("");

  for (const patchSet of patchSets) {
    const transform = collectFileTransforms(patchSet).find(
      ([filePath]) => filePath.includes("thread-side-panel-tabs"),
    )?.[1];

    assert.equal(typeof transform, "function", `${patchSet.id} has review transform`);

    const transformed = transform(fakeBundle);

    assert.match(transformed, /children:d&&!u&&c==null\?\(0,\$\.jsx\)\(Oa,\{\}\):\(0,\$\.jsx\)\(of,/);
    assert.match(
      transformed,
      /s=\(0,\$\.jsx\)\(CPXReviewMux,\{mainReviewContent:\(0,\$\.jsx\)\(Tf,\{diffMode:a,setTabState:r,tabState:i\}\)\}\)/,
    );
    assert.match(transformed, /p=e\.mainReviewContent,g=\(0,Q\.useMemo\)\(\(\)=>p\?\?/);
  }
});
