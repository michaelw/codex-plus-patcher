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
    const transform = collectFileTransforms(patchSet).find(
      ([filePath]) => filePath.includes("thread-side-panel-tabs"),
    )?.[1];

    assert.equal(typeof transform, "function", `${patchSet.id} has review transform`);

    const transformed = transform(fakeBundle);

    assert.match(
      transformed,
      /import\{r as vi,t as yi\}from"\.\/dropdown-CTBRoADH\.js";import\{t as CPXBranchPickerDropdownContent\}from"\.\/git-branch-picker-dropdown-content-Ch_voM6R\.js";/,
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

test("appearance settings patch adds light and dark user bubble color controls", () => {
  const fakeSettingsBundle = [
    "chromeThemeCodeFont:{id:`settings.general.appearance.chromeTheme.codeFontFamily.short`,defaultMessage:`Code font`,description:`Short label for the code font input`},pointerCursors:",
    "function tn({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){",
    "let r=a(s),i=N(),o=i.formatMessage(Q.chromeThemeAccent),c=i.formatMessage(Q.chromeThemeBackground),l=i.formatMessage(Q.chromeThemeForeground),u=i.formatMessage(Q.chromeThemeContrast),d=i.formatMessage(Q.chromeThemeTranslucentSidebar),",
    "children:[D.map(e=>(0,Z.jsx)(J,{control:(0,Z.jsx)(sn,{ariaLabel:e.ariaLabel,value:x[e.role],onChange:t=>{k(e.role,t)}}),label:e.label,variant:`nested`},e.role)),O.map",
  ].join("");

  for (const patchSet of patchSets) {
    const transform = collectFileTransforms(patchSet).find(
      ([filePath]) => filePath === "webview/assets/general-settings-Bit-KX17.js",
    )?.[1];

    assert.equal(typeof transform, "function", `${patchSet.id} has appearance settings transform`);

    const transformed = transform(fakeSettingsBundle);

    assert.match(transformed, /CPX_USER_BUBBLE_COLORS_KEY=`codex-plus:user-message-bubble-colors`/);
    assert.match(transformed, /CPX_USER_BUBBLE_COLORS_EVENT=`codex-plus:user-message-bubble-colors-change`/);
    assert.match(transformed, /userBubble:\{id:`settings\.general\.appearance\.userMessageBubble\.short`,defaultMessage:`User bubble`/);
    assert.match(transformed, /CPX_defaultUserBubbleColor\(e\)\{return e===`dark`\?`#2f2f2f`:`#f2f2f2`\}/);
    assert.match(transformed, /CPX_isStoredUserBubbleColor\(e,t\)\{return CPX_isUserBubbleColor\(t\)&&t\.toLowerCase\(\)!==CPX_defaultUserBubbleColor\(e\)\}/);
    assert.match(transformed, /light:CPX_isStoredUserBubbleColor\(`light`,e\.light\)\?e\.light:``/);
    assert.match(transformed, /dark:CPX_isStoredUserBubbleColor\(`dark`,e\.dark\)\?e\.dark:``/);
    assert.match(transformed, /CPX_readUserBubbleColors\(\)\[e\]\|\|CPX_defaultUserBubbleColor\(e\)/);
    assert.match(transformed, /CPX_isStoredUserBubbleColor\(e,t\)\?n\[e\]=t:delete n\[e\]/);
    assert.match(transformed, /CPX_userBubbleLabel=i\.formatMessage\(Q\.userBubble\)/);
    assert.match(transformed, /\(0,Z\.jsx\)\(CPXUserBubbleColorRow,\{variant:n,label:CPX_userBubbleLabel,ariaLabel:i\.formatMessage/);
    assert.match(transformed, /defaultMessage:`\{variant\} user message bubble color`/);
  }
});

test("user message patch applies variant-specific bubble colors with default fallback", () => {
  const fakeUserMessageBundle = [
    'import{t as ze}from"./use-measured-text-collapse-BhNFLYvW.js";',
    "var Z=i(),Q=e(n(),1),$=r();function Ue(e){return null}",
    "function it(){return(0,$.jsx)(`form`,{className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),v()},children:null})}",
    "function ot(e){let t=(0,Z.c)(93),{message:n,sentAtMs:r,collapsedLineCount:i,alwaysShowActions:a,compactActions:u,messageStatus:f,messageStatusIcon:p,hookStats:m,threadDetailLevel:h,referencesPriorConversation:g,reviewMode:_,pullRequestFixMode:v,autoResolveSync:y,hasExternalAttachments:b,commentCount:ee,onEditMessage:x,threadId:S,turnId:w,cwd:T,hostId:k}=e,M=a===void 0?!1:a,N=u===void 0?!1:u,P=g===void 0?!1:g,F=_===void 0?!1:_,I=v===void 0?!1:v,L=y===void 0?!1:y,te=b===void 0?!1:b,R=ee===void 0?0:ee,z=s(re),B=l(n),V=B.trim(),H=x!=null&&w!=null&&!B.startsWith(`PLEASE IMPLEMENT THIS PLAN:`),[ie,ae]=(0,Q.useState)(!1),U=o(at,w),W=H&&U!=null,G=C(),oe=c(ne),se=B.startsWith(`PLEASE IMPLEMENT THIS PLAN:`)?G.formatMessage({id:`codex.userMessage.implementPlan`,defaultMessage:`Yes, implement this plan`,description:`Display text for the synthetic implement-plan follow-up prompt`}):B,K=se.trim().length>0,ce=P||F||I||L||te||R>0,le=K||!ce,ue=ce||f!=null||!N,de;",
    "let xe=be,Y,Se;if(t[27]!==H){let e=D(`bg-token-foreground/5 max-w-[77%] min-w-0 overflow-hidden break-words rounded-2xl px-3 py-2 [&_.contain-inline-size]:[contain:initial]`,!K&&`leading-none`),n;Se=W?(0,$.jsx)(`div`,{className:`w-full p-px`,children:(0,$.jsx)(it,{cwd:T??null,hostId:k,initialMessage:U.trim(),onCancel:()=>{q(null)},onDraftChange:e=>{q(e)},onSubmit:ge})}):le?(0,$.jsx)(`div`,{\"data-user-message-bubble\":!0,role:H?`button`:void 0,tabIndex:0,className:D(e,`text-left focus-visible:ring-2 focus-visible:ring-token-focus-border focus-visible:outline-none`,H&&`cursor-interaction`),children:xe}):null}",
  ].join("");

  for (const patchSet of patchSets) {
    const transform = collectFileTransforms(patchSet).find(
      ([filePath]) => filePath === "webview/assets/user-message-attachments-CgyXEK9U.js",
    )?.[1];

    assert.equal(typeof transform, "function", `${patchSet.id} has user message transform`);

    const transformed = transform(fakeUserMessageBundle);

    assert.match(transformed, /CPX_USER_BUBBLE_COLORS_KEY=`codex-plus:user-message-bubble-colors`/);
    assert.match(transformed, /CPX_isStoredUserBubbleColor\(e,t\)\{return CPX_isUserBubbleColor\(t\)&&t\.toLowerCase\(\)!==CPX_defaultUserBubbleColor\(e\)\}/);
    assert.match(transformed, /light:CPX_isStoredUserBubbleColor\(`light`,e\.light\)\?e\.light:null/);
    assert.match(transformed, /dark:CPX_isStoredUserBubbleColor\(`dark`,e\.dark\)\?e\.dark:null/);
    assert.match(transformed, /CPX_userBubbleTextColor\(e\)/);
    assert.match(transformed, /function CPX_setUserBubbleVars\(\)/);
    assert.match(transformed, /--codex-plus-user-bubble-light-bg/);
    assert.match(transformed, /--codex-plus-user-bubble-dark-fg/);
    assert.match(transformed, /function CPX_installUserBubbleColors\(\)/);
    assert.match(transformed, /:root:not\(\.dark\):not\(\.electron-dark\) :is\(\[data-codex-plus-user-bubble\],\[data-codex-plus-user-entry\]\)/);
    assert.match(transformed, /:root\.dark :is\(\[data-codex-plus-user-bubble\],\[data-codex-plus-user-entry\]\),:root\.electron-dark :is\(\[data-codex-plus-user-bubble\],\[data-codex-plus-user-entry\]\)/);
    assert.match(transformed, /:root:not\(\.dark\):not\(\.electron-dark\) \[data-codex-plus-user-entry\] :is\(\.ProseMirror,\.ProseMirror \*,textarea,\[contenteditable="true"\],\[data-placeholder\]\),:root:not\(\.dark\):not\(\.electron-dark\) \[data-codex-plus-user-entry\] :is\(button:not\(\[class\*="bg-token-foreground"\]\),\[role="button"\]:not\(\[class\*="bg-token-foreground"\]\),button:not\(\[class\*="bg-token-foreground"\]\) svg,\[role="button"\]:not\(\[class\*="bg-token-foreground"\]\) svg,\[class\*="text-token-foreground"\],\[class\*="text-token-description-foreground"\],\[class\*="text-token-input-placeholder-foreground"\]\)\{color:var\(--codex-plus-user-bubble-light-fg\)\}/);
    assert.match(transformed, /:root:not\(\.dark\):not\(\.electron-dark\) \[data-codex-plus-user-entry\] :is\(\[data-placeholder\],\[class\*="text-token-input-placeholder-foreground"\]\)::before,:root:not\(\.dark\):not\(\.electron-dark\) \[data-codex-plus-user-entry\] :is\(\[data-placeholder\],\[class\*="text-token-input-placeholder-foreground"\]\)::after,:root:not\(\.dark\):not\(\.electron-dark\) \[data-codex-plus-user-entry\] :is\(input,textarea,\[contenteditable="true"\],\[class\*="placeholder:text-token-input-placeholder-foreground"\]\)::placeholder\{color:var\(--codex-plus-user-bubble-light-fg\)\}/);
    assert.match(transformed, /:root\.dark \[data-codex-plus-user-entry\] :is\(\.ProseMirror,\.ProseMirror \*,textarea,\[contenteditable="true"\],\[data-placeholder\]\),:root\.electron-dark \[data-codex-plus-user-entry\] :is\(\.ProseMirror,\.ProseMirror \*,textarea,\[contenteditable="true"\],\[data-placeholder\]\),:root\.dark \[data-codex-plus-user-entry\] :is\(button:not\(\[class\*="bg-token-foreground"\]\),\[role="button"\]:not\(\[class\*="bg-token-foreground"\]\),button:not\(\[class\*="bg-token-foreground"\]\) svg,\[role="button"\]:not\(\[class\*="bg-token-foreground"\]\) svg,\[class\*="text-token-foreground"\],\[class\*="text-token-description-foreground"\],\[class\*="text-token-input-placeholder-foreground"\]\),:root\.electron-dark \[data-codex-plus-user-entry\] :is\(button:not\(\[class\*="bg-token-foreground"\]\),\[role="button"\]:not\(\[class\*="bg-token-foreground"\]\),button:not\(\[class\*="bg-token-foreground"\]\) svg,\[role="button"\]:not\(\[class\*="bg-token-foreground"\]\) svg,\[class\*="text-token-foreground"\],\[class\*="text-token-description-foreground"\],\[class\*="text-token-input-placeholder-foreground"\]\)\{color:var\(--codex-plus-user-bubble-dark-fg\)\}/);
    assert.match(transformed, /:root\.dark \[data-codex-plus-user-entry\] :is\(\[data-placeholder\],\[class\*="text-token-input-placeholder-foreground"\]\)::before,:root\.dark \[data-codex-plus-user-entry\] :is\(\[data-placeholder\],\[class\*="text-token-input-placeholder-foreground"\]\)::after,:root\.dark \[data-codex-plus-user-entry\] :is\(input,textarea,\[contenteditable="true"\],\[class\*="placeholder:text-token-input-placeholder-foreground"\]\)::placeholder,:root\.electron-dark \[data-codex-plus-user-entry\] :is\(\[data-placeholder\],\[class\*="text-token-input-placeholder-foreground"\]\)::before,:root\.electron-dark \[data-codex-plus-user-entry\] :is\(\[data-placeholder\],\[class\*="text-token-input-placeholder-foreground"\]\)::after,:root\.electron-dark \[data-codex-plus-user-entry\] :is\(input,textarea,\[contenteditable="true"\],\[class\*="placeholder:text-token-input-placeholder-foreground"\]\)::placeholder\{color:var\(--codex-plus-user-bubble-dark-fg\)\}/);
    assert.match(transformed, /window\.addEventListener\(CPX_USER_BUBBLE_COLORS_EVENT,CPX_setUserBubbleVars\)/);
    assert.match(transformed, /CPX_installUserBubbleColors\(\)/);
    assert.match(transformed, /"data-user-message-bubble":!0,"data-codex-plus-user-bubble":!0,role:H\?`button`/);
    assert.match(transformed, /"data-codex-plus-user-entry":!0,className:`relative flex w-full flex-col rounded-3xl bg-token-foreground\/5`/);
    assert.match(transformed, /bg-token-foreground\/5 max-w-\[77%\]/);
  }
});

test("composer patch applies the user entry marker and shared color variables", () => {
  const fakeComposerBundle = [
    "function oh(e){let t=(0,$.c)(13),{children:n,className:r,externalFooterVariant:i,inert:a,isDragActive:o,layout:s,onDragEnter:c,onDragLeave:l,onDragOver:u,onDrop:d}=e,f=i===void 0?`default`:i,p=o===void 0?!1:o,m=s===void 0?`multiline`:s,h=f===`home`&&`z-10`,g=m===`single-line`?`overflow-visible rounded-full`:rh.multilineSurface,_=p&&`bg-token-dropdown-background/50`,v;t[0]!==r||t[1]!==h||t[2]!==g||t[3]!==_?(v=qt(`relative flex flex-col border border-token-input-border bg-token-input-background/90 shadow-[0_4px_16px_0_rgba(0,0,0,0.05)] backdrop-blur-lg electron:dark:bg-token-dropdown-background`,h,g,_,r),t[0]=r,t[1]=h,t[2]=g,t[3]=_,t[4]=v):v=t[4];let y;return t[5]!==n||t[6]!==a||t[7]!==c||t[8]!==l||t[9]!==u||t[10]!==d||t[11]!==v?(y=(0,Q.jsx)(Jt.div,{inert:a,className:v,onDragEnter:c,onDragOver:u,onDragLeave:l,onDrop:d,children:n}),t[5]=n,t[6]=a,t[7]=c,t[8]=l,t[9]=u,t[10]=d,t[11]=v,t[12]=y):y=t[12],y}",
  ].join("");

  for (const patchSet of patchSets) {
    const transform = collectFileTransforms(patchSet).find(
      ([filePath]) => filePath === "webview/assets/composer-CCuv6v-2.js",
    )?.[1];

    assert.equal(typeof transform, "function", `${patchSet.id} has composer transform`);

    const transformed = transform(fakeComposerBundle);

    assert.match(transformed, /CPX_USER_BUBBLE_COLORS_KEY=`codex-plus:user-message-bubble-colors`/);
    assert.match(transformed, /function CPX_installUserBubbleColors\(\)/);
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
    assert.match(transformed, /\[role="button"\]:not\(\[class\*="bg-token-foreground"\]\) svg/);
    assert.match(transformed, /\[data-codex-plus-user-entry\] :is\(\.ProseMirror,\.ProseMirror \*,textarea,\[contenteditable="true"\],\[data-placeholder\]\),:root\.electron-dark \[data-codex-plus-user-entry\] :is\(\.ProseMirror,\.ProseMirror \*,textarea,\[contenteditable="true"\],\[data-placeholder\]\),:root\.dark \[data-codex-plus-user-entry\] :is\(button:not\(\[class\*="bg-token-foreground"\]\)/);
    assert.match(transformed, /\(0,Q\.jsx\)\(Jt\.div,\{inert:a,"data-codex-plus-user-entry":!0,className:v/);
  }
});
