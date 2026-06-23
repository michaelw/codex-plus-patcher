const { codexPlusRuntimeAssets } = require("../../runtime/assets");
const { replaceOnce } = require("./replace");
const { makePatchSet } = require("./make-patch-set");

function buildCodexPlusPatchSet(config) {
  const oldTitle = "<title>Codex</title>";
  const newTitle = '<title>Codex Plus</title><script src="./assets/codex-plus/runtime.js"></script>';
  const titleFile = "webview/index.html";
  const workerFile = ".vite/build/worker.js";
  const files = config.files;
  const anchors = config.anchors;
  const mainFile = files.main;
  const appMainFile = files.appMain;
  const appShellFile = files.appShell;
  const errorBoundaryFile = files.errorBoundary;
  const generalSettingsFile = files.generalSettings;
  const sidebarProjectHoverCardSourceRowsFile = files.sidebarProjectHoverCardSourceRows;
  const threadSidePanelTabsFile = files.threadSidePanelTabs;
  const userMessageAttachmentsFile = files.userMessageAttachments;
  const composerFile = files.composer;
  const localTaskRowFile = files.localTaskRow;
  const electronMenuShortcutsFile = files.electronMenuShortcuts;
  const keyboardShortcutsSearchInputFile = files.keyboardShortcutsSearchInput;
  const srcFile = files.src;
  const sidebarThreadKeysFile = files.sidebarThreadKeys;
  const sidebarThreadRowSignalsFile = files.sidebarThreadRowSignals;
  const branchPickerDropdownContentFile = files.branchPickerDropdownContent;

function codexPlusWorkerHelpers() {
  return `
const CPXWorkerBridge=require(\"./codex-plus-worker.js\");function CPX_traceRequest(e){return CPXWorkerBridge.traceRequest(e)}async function CPX_repositoryTargets(e,t,n,r){return CPXWorkerBridge.repositoryTargets(e,t,n,r,(i,a)=>pae(e.getWorktreeRepositoryForRoot(i,n),a))}function CPX_isReadOnlyBranchRequest(e,t){return CPXWorkerBridge.isReadOnlyBranchRequest(e,t)}`;
}

function patchTitle(text) {
  return replaceOnce(text, oldTitle, newTitle, `${oldTitle} in ${titleFile}`);
}

function patchAboutDialog(text, context = {}) {
  const aboutContext = {
    patcherRepoUrl: context.patcherRepoUrl || "https://github.com/michaelw/codex-plus-patcher",
    patcherGitSha: context.patcherGitSha || "unknown",
    sourceAsarSha256: context.sourceAsarSha256 || "unknown",
    appliedPatches: context.appliedPatches || [],
  };
  let patched = replaceOnce(
    text,
    "let i=a.app.getName(),o=a.app.getVersion()",
    `let CPXAbout=require("./codex-plus-aboutMetadata.js").aboutPayload(${JSON.stringify(aboutContext)}),i=CPXAbout.appDisplayName,o=a.app.getVersion()`,
    "about dialog app name anchor",
  );
  patched = replaceOnce(
    patched,
    "function V0(e){return[]}",
    "function V0(e){return CPXAbout.buildInfoLines}",
    "about dialog build information anchor",
  );
  patched = replaceOnce(
    patched,
    "K0({appDisplayName:i,buildInfoLabel:g,buildInfoText:v,iconDataUrl:f.htmlIconDataUrl,isDark:b,okLabel:m,title:p})",
    "K0({appDisplayName:i,buildInfoLabel:g,buildInfoText:v,codexPlusDisclaimerHeading:CPXAbout.disclaimerHeading,codexPlusDisclaimerBody:CPXAbout.disclaimerBody,iconDataUrl:f.htmlIconDataUrl,isDark:b,okLabel:m,title:p})",
    "about dialog renderer call anchor",
  );
  patched = replaceOnce(
    patched,
    "function K0({appDisplayName:e,buildInfoLabel:t,buildInfoText:n,iconDataUrl:r,isDark:i,okLabel:a,title:o}){let s=r==null?``:",
    "function K0({appDisplayName:e,buildInfoLabel:t,buildInfoText:n,codexPlusDisclaimerHeading:D,codexPlusDisclaimerBody:O,iconDataUrl:r,isDark:i,okLabel:a,title:o}){let CPXAboutMetadata=require(\"./codex-plus-aboutMetadata.js\"),q=CPXAboutMetadata.disclaimerMarkup({escape:zz.default,heading:D,body:O}),s=r==null?``:",
    "about dialog renderer signature anchor",
  );
  patched = replaceOnce(
    patched,
    "    .build-info {\n      width: 100%;\n      margin: 0;\n      line-height: 1.45;",
    "${CPXAboutMetadata.disclaimerStyles()}\n\n    .build-info {\n      width: 100%;\n      margin: 0;\n      line-height: 1.45;",
    "about dialog disclaimer styles anchor",
  );
  patched = replaceOnce(
    patched,
    "      color: var(--muted-text);\n      white-space: pre-wrap;",
    "      color: var(--muted-text);\n      text-align: left;\n      white-space: pre-wrap;",
    "about dialog build info left align anchor",
  );
  patched = replaceOnce(
    patched,
    "    .app-name,\n    .build-info,\n    .copyright {",
    "    .app-name,\n    .codex-plus-disclaimer,\n    .build-info,\n    .copyright {",
    "about dialog selectable disclaimer anchor",
  );
  return replaceOnce(
    patched,
    '      <div class="app-name" id="app-name">${(0,zz.default)(e)}</div>\n      <pre class="build-info" aria-label="${(0,zz.default)(t)}">${(0,zz.default)(n)}</pre>',
    '      <div class="app-name" id="app-name">${(0,zz.default)(e)}</div>\n      ${q}\n      <pre class="build-info" aria-label="${(0,zz.default)(t)}">${(0,zz.default)(n)}</pre>',
    "about dialog disclaimer insertion anchor",
  );
}

function patchWorker(text) {
  let patched = replaceOnce(
    text,
    "function pae(e,t){return e.queryClient.fetchQuery",
    `${codexPlusWorkerHelpers()}function pae(e,t){return e.queryClient.fetchQuery`,
    "worker helper insertion anchor",
  );
  patched = replaceOnce(
    patched,
    "case`submodule-paths`:a=X({paths:await pae(this.gitManager.getWorktreeRepositoryForRoot(e.params.root,r),t.signal)});break;",
    "case`codex-plus-trace`:a=X(CPX_traceRequest(e.params));break;case`repository-targets`:a=X(await CPX_repositoryTargets(this.gitManager,e.params,r,t.signal));break;case`submodule-paths`:a=X({paths:await pae(this.gitManager.getWorktreeRepositoryForRoot(e.params.root,r),t.signal)});break;",
    "repository-targets worker switch anchor",
  );
  patched = replaceOnce(
    patched,
    "function u2({requestKind:e,source:t}){return l2.has(e??``)||d2(t)}",
    "function u2({requestKind:e,source:t}){return l2.has(e??``)||d2(t)||CPX_isReadOnlyBranchRequest(e,t)}",
    "codex plus branch picker git allowlist anchor",
  );
  return replaceOnce(
    patched,
    "case`commit-message-diff`:case`submodule-paths`:case`cat-file`:",
    "case`commit-message-diff`:case`codex-plus-trace`:case`repository-targets`:case`submodule-paths`:case`cat-file`:",
    "repository-targets worker readonly method anchor",
  );
}

const codexPlusReviewHelpers = `
function CPXReviewMux(e){let t=window.CodexPlus?.plugins?.get(\`nestedRepositories\`)?.exports;if(t?.ReviewMux)return t.ReviewMux(e,{jsx:$.jsx,jsxs:$.jsxs,Fragment:$.Fragment,createElement:Q.createElement,React:Q,useStore:s,useAtom:l,routeAtom:ft,cwdAtom:Or,hostIdAtom:Dr,hostConfigAtom:kr,conversationIdAtom:jr,gitRequest:y,pathValue:B,DefaultReview:of,Button:Y,Tooltip:Ae,Icon:Je,Dropdown:yi,DropdownMenu:vi,BranchPickerDropdownContent:CPXBranchPickerDropdownContent,ReviewToolbar:dp,parseDiff:xr,DiffCard:Ma});return e.mainReviewContent??(0,$.jsx)(of,e)}`;

const codexPlusSubrepoDiffHelpers = `
`;

const codexPlusDiagnosticHelpers = `
function CPXDiagnosticDetails(e){return window.CodexPlus?.plugins?.get(\`diagnosticErrors\`)?.exports?.renderDetails?.(e)??null}`;

function patchThreadSidePanelTabs(text) {
  let patched = replaceOnce(
    text,
    "import{r as vi,t as yi}from\"./dropdown-CTBRoADH.js\";",
    `import{r as vi,t as yi}from"./dropdown-CTBRoADH.js";import{t as CPXBranchPickerDropdownContent}from"./${branchPickerDropdownContentFile}";`,
    "branch picker content import anchor",
  );
  patched = replaceOnce(
    patched,
    "function uf({cwd:e,fileEntries:t,generatedPathsReady:n,hasUnhandledAttributesFiles:r,isCappedMode:i,repositorySource:a,reviewSummarySource:o}){",
    `${codexPlusReviewHelpers}function uf({cwd:e,fileEntries:t,generatedPathsReady:n,hasUnhandledAttributesFiles:r,isCappedMode:i,repositorySource:a,reviewSummarySource:o}){`,
    "review host hook insertion anchor",
  );
  return replaceOnce(
    patched,
    "let s;t[1]!==a||t[2]!==r||t[3]!==i?(s=(0,$.jsx)(Tf,{diffMode:a,setTabState:r,tabState:i}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];let c;",
    "let s;t[1]!==a||t[2]!==r||t[3]!==i?(s=(0,$.jsx)(CPXReviewMux,{mainReviewContent:(0,$.jsx)(Tf,{diffMode:a,setTabState:r,tabState:i}),diffMode:a,setTabState:r,tabState:i}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];let c;",
    "review body mux anchor",
  );
}
function patchAppShell(text) {
  let patched = replaceOnce(
    text,
    "function En(e){return(0,Q.jsx)(wn,{onRetry:()=>{e.resetError()}})}",
    `${codexPlusDiagnosticHelpers}function En(e){return(0,Q.jsx)(wn,{error:e.error,onRetry:()=>{e.resetError()}})}`,
    "app shell error fallback prop anchor",
  );
  patched = replaceOnce(
    patched,
    "children:[r,(0,Q.jsx)(Le,{color:`secondary`,size:`default`,onClick:n,children:i})]",
    "children:[r,CPXDiagnosticDetails({jsx:Q.jsx,error:e.error}),(0,Q.jsx)(Le,{color:`secondary`,size:`default`,onClick:n,children:i})]",
    "app shell error detail insertion anchor",
  );
  patched = replaceOnce(
    patched,
    "return t[2]===n?a=t[3]:(a=(0,Q.jsxs)(`div`,{className:`flex h-full min-h-0 flex-col items-center justify-center gap-3 p-4 text-center text-sm text-token-text-secondary`,children:",
    "return t[2]===n&&t[3]===e.error?a=t[4]:(a=(0,Q.jsxs)(`div`,{className:`flex h-full min-h-0 flex-col items-center justify-center gap-3 p-4 text-center text-sm text-token-text-secondary`,children:",
    "app shell error cache condition anchor",
  );
  return replaceOnce(
    patched,
    "}),t[2]=n,t[3]=a),a}function Tn(e){return e.composedPath().some",
    "}),t[2]=n,t[3]=e.error,t[4]=a),a}function Tn(e){return e.composedPath().some",
    "app shell error cache assignment anchor",
  );
}

function patchErrorBoundary(text) {
  let patched = replaceOnce(
    text,
    "function Xf(e){let t=(0,Vf.c)(9),{resetError:n}=e,r=ee(),i,a;",
    `${codexPlusDiagnosticHelpers}function Xf(e){let t=(0,Vf.c)(9),{resetError:n,error:CPX_error,componentStack:CPX_componentStack}=e,r=ee(),i,a;`,
    "webview error boundary fallback prop anchor",
  );
  patched = replaceOnce(
    patched,
    "children:[i,a,(0,$.jsxs)(`div`,{className:`flex flex-wrap items-center justify-center gap-2`,children:[o,(0,$.jsx)(m,{onClick:s,children:c})]})]",
    "children:[i,a,CPXDiagnosticDetails({jsx:$.jsx,error:CPX_error,componentStack:CPX_componentStack}),(0,$.jsxs)(`div`,{className:`flex flex-wrap items-center justify-center gap-2`,children:[o,(0,$.jsx)(m,{onClick:s,children:c})]})]",
    "webview error boundary detail anchor",
  );
  return replaceOnce(
    patched,
    "r=e??(e=>(0,$.jsx)(Xf,{resetError:()=>e.resetError()}));",
    "r=e??(e=>(0,$.jsx)(Xf,{error:e.error,componentStack:e.componentStack,resetError:()=>e.resetError()}));",
    "webview error boundary error prop anchor",
  );
}

function patchAppMainProjectColors(text) {
  let patched = replaceOnce(
    text,
    "function Pk(e){let t=(0,Q.c)(45),",
    `${codexPlusProjectColorHelpers}function Pk(e){let t=(0,Q.c)(46),`,
    "project color app main helper insertion anchor",
  );
  patched = replaceOnce(
    patched,
    "H=Ha.sidebarProjectList({projectId:i.projectId,showAll:x})",
    "H=Ha.sidebarProjectList({projectId:i.projectId,showAll:x})",
    "project group color marker anchor",
  );
  patched = replaceOnce(
    patched,
    "q={onActivateGroup:V,onStartNewConversation:a,isGrouped:!0,hideRemoteHostEnvIcon:!0,hideTimestamp:l,locationId:b,floatStatusIconsRight:s,showPinActionOnHover:o}",
    "q={onActivateGroup:V,onStartNewConversation:a,isGrouped:!0,hideRemoteHostEnvIcon:!0,hideTimestamp:l,locationId:b,floatStatusIconsRight:s,showPinActionOnHover:o,dataAttributes:CPX_projectColorDataAttributes(i,!0)}",
    "project thread row color key anchor",
  );
  patched = replaceOnce(
    patched,
    "t[19]!==V||t[20]!==s||t[21]!==l||t[22]!==b||t[23]!==o||t[24]!==a?",
    "t[19]!==V||t[20]!==s||t[21]!==l||t[22]!==b||t[23]!==o||t[24]!==a||t[45]!==i?",
    "project thread row color cache dependency anchor",
  );
  patched = replaceOnce(
    patched,
    "t[19]=V,t[20]=s,t[21]=l,t[22]=b,t[23]=o,t[24]=a,t[25]=q):q=t[25]",
    "t[19]=V,t[20]=s,t[21]=l,t[22]=b,t[23]=o,t[24]=a,t[45]=i,t[25]=q):q=t[25]",
    "project thread row color cache write anchor",
  );
  patched = replaceOnce(
    patched,
    "ie=(0,Z.jsx)(`div`,{...H,children:re})",
    "ie=(0,Z.jsx)(`div`,{...H,children:re})",
    "project group color render anchor",
  );
  patched = replaceOnce(
    patched,
    "O=(0,Z.jsx)(NO,{action:T,actionTooltipContent:h,actionTooltipDisabled:p,indicator:E,isMenuOpen:g,menu:D})",
    "O=(0,Z.jsx)(NO,{action:T,actionTooltipContent:h,actionTooltipDisabled:p,indicator:E,isMenuOpen:g,menu:D})",
    "project header action render anchor",
  );
  patched = replaceOnce(
    patched,
    "Ke=(0,Z.jsx)(Oe,{rowAttributes:ke,className:Ae,collapsed:L,contentClassName:je,",
    "Ke=(0,Z.jsx)(Oe,{rowAttributes:{...ke,...CPX_projectColorDataAttributes(n,!0)},className:Ae,collapsed:L,contentClassName:je,",
    "project header row color attributes anchor",
  );
  return patched;
}

function patchAppMainSidebarBlur(text) {
  let patched = replaceOnce(
    text,
    "function Pk(e){let t=(0,Q.c)(46),",
    `${codexPlusSidebarNameBlurHelpers}function Pk(e){let t=(0,Q.c)(46),`,
    "sidebar blur app main helper insertion anchor",
  );
  patched = replaceOnce(
    patched,
    "openFolder:$y,toggleSidebar:$i,toggleTerminal:Md,",
    "openFolder:$y,toggleSidebar:$i,codexPlusToggleSidebarNameBlur:$i,toggleTerminal:Md,",
    "sidebar blur command icon anchor",
  );
  patched = replaceOnce(
    patched,
    "children:n.label}),t[62]=Oe,",
    "children:(0,Z.jsx)(`span`,{\"data-codex-plus-sidebar-name\":``,children:n.label})}),t[62]=Oe,",
    "project header sidebar blur label anchor",
  );
  return replaceOnce(
    patched,
    "children:[l,u,(0,Z.jsx)(H_,{route:a,children:C})]",
    "children:[l,u,(0,Z.jsx)(CPXSidebarNameBlurCommand,{}),(0,Z.jsx)(H_,{route:a,children:C})]",
    "sidebar name blur command mount anchor",
  );
}

function patchSidebarProjectHoverCardSourceRows(text) {
  let patched = replaceOnce(
    text,
    "function Ft(e,t,n){",
    "function CPX_mergeDataAttributes(e,t){return t==null?e:{...e,...t,style:{...e?.style,...t?.style}}}function Ft(e,t,n){",
    "sidebar row data attribute merge helper anchor",
  );
  patched = replaceOnce(
    patched,
    "var En=(0,Vt.memo)(function(e){let t=(0,zt.c)(40),{threadKey:n,canPin:r,disableHoverCard:a,floatStatusIconsRight:o,isGrouped:s,hideRemoteHostEnvIcon:c,hideTimestamp:l,locationId:u,onActivateGroup:d,onStartNewConversation:f,showPinActionOnHover:p,variant:m,shortcutLabel:h,onArchiveStart:g,onArchiveSuccess:_,onArchiveError:v}=e,",
    "var En=(0,Vt.memo)(function(e){let t=(0,zt.c)(41),{threadKey:n,canPin:r,disableHoverCard:a,floatStatusIconsRight:o,isGrouped:s,hideRemoteHostEnvIcon:c,hideTimestamp:l,locationId:u,onActivateGroup:d,onStartNewConversation:f,showPinActionOnHover:p,variant:m,shortcutLabel:h,onArchiveStart:g,onArchiveSuccess:_,onArchiveError:v,dataAttributes:CPX_rowDataAttributes}=e,",
    "sidebar row component data attributes prop anchor",
  );
  patched = replaceOnce(
    patched,
    "t[12]!==A||t[13]!==y||t[14]!==b||t[15]!==F||t[16]!==x||t[17]!==B||t[18]!==L||t[19]!==z||t[20]!==ee||t[21]!==te||t[22]!==j||t[23]!==M||t[24]!==N||t[25]!==P||t[26]!==k||t[27]!==S||t[28]!==C||t[29]!==d||t[30]!==f||t[31]!==h||t[32]!==w||t[33]!==V||t[34]!==T?",
    "t[12]!==A||t[13]!==y||t[14]!==b||t[15]!==F||t[16]!==x||t[17]!==B||t[18]!==L||t[19]!==z||t[20]!==ee||t[21]!==te||t[22]!==j||t[23]!==M||t[24]!==N||t[25]!==P||t[26]!==k||t[27]!==S||t[28]!==C||t[29]!==d||t[30]!==f||t[31]!==h||t[32]!==w||t[33]!==V||t[34]!==T||t[40]!==CPX_rowDataAttributes?",
    "sidebar row component data attributes memo dependency anchor",
  );
  patched = replaceOnce(
    patched,
    "onArchiveStart:L,onArchiveSuccess:z,onArchiveError:B}",
    "onArchiveStart:L,onArchiveSuccess:z,onArchiveError:B,dataAttributes:CPX_rowDataAttributes}",
    "sidebar row component data attributes object anchor",
  );
  patched = replaceOnce(
    patched,
    "t[32]=w,t[33]=V,t[34]=T,t[35]=H):H=t[35]",
    "t[32]=w,t[33]=V,t[34]=T,t[40]=CPX_rowDataAttributes,t[35]=H):H=t[35]",
    "sidebar row component data attributes memo write anchor",
  );
  patched = replaceOnce(
    patched,
    "function On(e){let t=(0,zt.c)(121),{entry:n,isPinned:r,isAutomationRun:a,automationDisplayName:o,isActive:s,canPin:c,disableHoverCard:u,floatStatusIconsRight:f,isGrouped:p,hideRemoteHostEnvIcon:m,hideTimestamp:h,locationId:g,onActivateGroup:y,onStartNewConversation:b,showPinActionOnHover:te,variant:C,shortcutLabel:T,hoverCardHostConfig:E,hoverCardProjectId:D,hoverCardProjectLabel:A,hoverCardRepositoryLabel:j,displayCwd:M,onArchiveStart:N,onArchiveSuccess:P,onArchiveError:F}=e,",
    "function On(e){let t=(0,zt.c)(124),{entry:n,isPinned:r,isAutomationRun:a,automationDisplayName:o,isActive:s,canPin:c,disableHoverCard:u,floatStatusIconsRight:f,isGrouped:p,hideRemoteHostEnvIcon:m,hideTimestamp:h,locationId:g,onActivateGroup:y,onStartNewConversation:b,showPinActionOnHover:te,variant:C,shortcutLabel:T,hoverCardHostConfig:E,hoverCardProjectId:D,hoverCardProjectLabel:A,hoverCardRepositoryLabel:j,displayCwd:M,onArchiveStart:N,onArchiveSuccess:P,onArchiveError:F,dataAttributes:CPX_rowDataAttributes}=e,",
    "sidebar row dispatcher data attributes prop anchor",
  );
  patched = replaceOnce(
    patched,
    "dataAttributes:ae.sidebarThreadRow({active:s,hostId:t.hostId,id:n,kind:`pending-worktree`,pinned:r,title:t.label})",
    "dataAttributes:CPX_mergeDataAttributes(ae.sidebarThreadRow({active:s,hostId:t.hostId,id:n,kind:`pending-worktree`,pinned:r,title:t.label}),CPX_rowDataAttributes)",
    "pending worktree sidebar row data attributes merge anchor",
  );
  patched = replaceOnce(
    patched,
    "dataAttributes:ae.sidebarThreadRow({active:s,hostId:null,id:t,kind:`remote`,pinned:r,title:e.task.title??``})",
    "dataAttributes:CPX_mergeDataAttributes(ae.sidebarThreadRow({active:s,hostId:null,id:t,kind:`remote`,pinned:r,title:e.task.title??``}),CPX_rowDataAttributes)",
    "remote sidebar row data attributes merge anchor",
  );
  patched = replaceOnce(
    patched,
    "dataAttributes:ae.sidebarThreadRow({active:s,hostId:f,id:i,kind:`local`,pinned:r,title:x})",
    "dataAttributes:CPX_mergeDataAttributes(ae.sidebarThreadRow({active:s,hostId:f,id:i,kind:`local`,pinned:r,title:x}),CPX_rowDataAttributes)",
    "local sidebar row data attributes merge anchor",
  );
  patched = replaceOnce(
    patched,
    "t[22]=c,t[23]=se,t[24]=Ne,t[25]=L,t[26]=Je,t[27]=J,t[28]=oe,t[29]=V,t[30]=G,t[31]=s,t[32]=z,t[33]=r,t[34]=g,t[35]=K,t[36]=y,t[37]=P,t[38]=le,t[39]=W,t[40]=ue,t[41]=et,t[42]=H,t[43]=U,t[44]=st):st=t[44]",
    "t[22]=c,t[23]=se,t[24]=Ne,t[25]=L,t[26]=Je,t[27]=J,t[28]=oe,t[29]=V,t[30]=G,t[31]=s,t[32]=z,t[33]=r,t[34]=g,t[35]=K,t[36]=y,t[37]=P,t[38]=le,t[39]=W,t[40]=ue,t[41]=et,t[42]=H,t[43]=U,t[121]=CPX_rowDataAttributes,t[44]=st):st=t[44]",
    "pending worktree sidebar row data attributes memo write anchor",
  );
  patched = replaceOnce(
    patched,
    "t[45]!==c||t[46]!==Ne||t[47]!==Fe||t[48]!==L||t[49]!==Je||t[50]!==J||t[51]!==oe||t[52]!==V||t[53]!==G||t[54]!==s||t[55]!==z||t[56]!==r||t[57]!==g||t[58]!==F||t[59]!==P||t[60]!==nt||t[61]!==Q||t[62]!==We||t[63]!==W||t[64]!==Xe||t[65]!==et||t[66]!==H||t[67]!==U?",
    "t[45]!==c||t[46]!==Ne||t[47]!==Fe||t[48]!==L||t[49]!==Je||t[50]!==J||t[51]!==oe||t[52]!==V||t[53]!==G||t[54]!==s||t[55]!==z||t[56]!==r||t[57]!==g||t[58]!==F||t[59]!==P||t[60]!==nt||t[61]!==Q||t[62]!==We||t[63]!==W||t[64]!==Xe||t[65]!==et||t[66]!==H||t[67]!==U||t[122]!==CPX_rowDataAttributes?",
    "remote sidebar row data attributes memo dependency anchor",
  );
  patched = replaceOnce(
    patched,
    "t[63]=W,t[64]=Xe,t[65]=et,t[66]=H,t[67]=U,t[68]=ht):ht=t[68]",
    "t[63]=W,t[64]=Xe,t[65]=et,t[66]=H,t[67]=U,t[122]=CPX_rowDataAttributes,t[68]=ht):ht=t[68]",
    "remote sidebar row data attributes memo write anchor",
  );
  patched = replaceOnce(
    patched,
    "t[69]!==o||t[70]!==c||t[71]!==I||t[72]!==ot||t[73]!==M||t[74]!==Pe||t[75]!==Ne||t[76]!==Fe||t[77]!==L||t[78]!==Je||t[79]!==J||t[80]!==ne||t[81]!==oe||t[82]!==V||t[83]!==E||t[84]!==A||t[85]!==G||t[86]!==s||t[87]!==a||t[88]!==z||t[89]!==r||t[90]!==pe||t[91]!==fe||t[92]!==he||t[93]!==Be||t[94]!==De||t[95]!==null||t[96]!==_e||t[97]!==me||t[98]!==ge||t[99]!==g||t[100]!==y||t[101]!==F||t[102]!==P||t[103]!==nt||t[104]!==Q||t[105]!==W||t[106]!==Xe||t[107]!==et||t[108]!==H||t[109]!==be||t[110]!==U?",
    "t[69]!==o||t[70]!==c||t[71]!==I||t[72]!==ot||t[73]!==M||t[74]!==Pe||t[75]!==Ne||t[76]!==Fe||t[77]!==L||t[78]!==Je||t[79]!==J||t[80]!==ne||t[81]!==oe||t[82]!==V||t[83]!==E||t[84]!==A||t[85]!==G||t[86]!==s||t[87]!==a||t[88]!==z||t[89]!==r||t[90]!==pe||t[91]!==fe||t[92]!==he||t[93]!==Be||t[94]!==De||t[95]!==null||t[96]!==_e||t[97]!==me||t[98]!==ge||t[99]!==g||t[100]!==y||t[101]!==F||t[102]!==P||t[103]!==nt||t[104]!==Q||t[105]!==W||t[106]!==Xe||t[107]!==et||t[108]!==H||t[109]!==be||t[110]!==U||t[123]!==CPX_rowDataAttributes?",
    "local sidebar row data attributes memo dependency anchor",
  );
  patched = replaceOnce(
    patched,
    "t[108]=H,t[109]=be,t[110]=U,t[111]=vt):vt=t[111]",
    "t[108]=H,t[109]=be,t[110]=U,t[123]=CPX_rowDataAttributes,t[111]=vt):vt=t[111]",
    "local sidebar row data attributes memo write anchor",
  );
  patched = replaceOnce(
    patched,
    "t[14]!==l?.canPin||t[15]!==l?.disableHoverCard||t[16]!==l?.floatStatusIconsRight||t[17]!==l?.hideRemoteHostEnvIcon||t[18]!==l?.hideTimestamp||t[19]!==l?.isGrouped||t[20]!==l?.locationId||t[21]!==l?.onActivateGroup||t[22]!==l?.onStartNewConversation||t[23]!==l?.showPinActionOnHover||t[24]!==l?.variant||t[25]!==b?",
    "t[14]!==l?.canPin||t[15]!==l?.disableHoverCard||t[16]!==l?.floatStatusIconsRight||t[17]!==l?.hideRemoteHostEnvIcon||t[18]!==l?.hideTimestamp||t[19]!==l?.isGrouped||t[20]!==l?.locationId||t[21]!==l?.onActivateGroup||t[22]!==l?.onStartNewConversation||t[23]!==l?.showPinActionOnHover||t[24]!==l?.variant||t[25]!==b||t[43]!==l?.dataAttributes?",
    "thread list row options data attributes memo dependency anchor",
  );
  patched = replaceOnce(
    patched,
    "showPinActionOnHover:l?.showPinActionOnHover,variant:l?.variant,shortcutLabel:b?.get(e)}),",
    "showPinActionOnHover:l?.showPinActionOnHover,variant:l?.variant,shortcutLabel:b?.get(e),dataAttributes:l?.dataAttributes}),",
    "thread list row options data attributes prop anchor",
  );
  patched = replaceOnce(
    patched,
    "t[24]=l?.variant,t[25]=b,t[26]=j):j=t[26]",
    "t[24]=l?.variant,t[25]=b,t[43]=l?.dataAttributes,t[26]=j):j=t[26]",
    "thread list row options data attributes memo write anchor",
  );
  return replaceOnce(
    patched,
    "function Rn(e){let t=(0,zt.c)(43),",
    "function Rn(e){let t=(0,zt.c)(44),",
    "thread list memo cache size anchor",
  );
}

const codexPlusProjectColorHelpers = `
function CPX_projectColors(){return window.CodexPlus?.plugins?.get(\`projectColors\`)?.exports}function CPX_projectColorStyle(e){return CPX_projectColors()?.style?.(e)}function CPX_projectColorDataAttributes(e,t){return CPX_projectColors()?.dataAttributes?.(e,t)}`;

const codexPlusSidebarNameBlurHelpers = `
function CPXSidebarNameBlurCommand(){Hp(\`codexPlusToggleSidebarNameBlur\`,()=>{window.CodexPlus?.commands?.run?.(\`codexPlusToggleSidebarNameBlur\`)},{menuItem:{id:\`codexPlusToggleSidebarNameBlur\`,groupKey:\`suggested\`,render:e=>(0,Z.jsx)(Zy,{value:\`Toggle sidebar blur\`,title:\`Toggle sidebar blur\`,description:\`Blur or show sidebar chat and project names\`,onSelect:()=>{window.CodexPlus?.commands?.run?.(\`codexPlusToggleSidebarNameBlur\`),e?.()}},\`codex-plus-toggle-sidebar-name-blur\`)}});return null}`;

const codexPlusUserBubbleSettingsHelpers = `
function CPX_userBubbleColors(){return window.CodexPlus?.plugins?.get(\`userBubbleColors\`)?.exports}function CPXUserBubbleColorRow({variant:e,label:t,ariaLabel:n}){return CPX_userBubbleColors()?.renderColorRow?.({React:X,jsx:Z.jsx,SettingRow:J,ColorInput:sn,variant:e,label:t,ariaLabel:n})??null}`;

const codexPlusProjectColorSettingsHelpers = `
${codexPlusProjectColorHelpers}function CPXProjectColorToggleRow({label:e,ariaLabel:t}){return CPX_projectColors()?.renderToggleRow?.({React:X,jsx:Z.jsx,SettingRow:J,Switch:q,label:e,ariaLabel:t})??null}`;

function patchGeneralSettingsUserBubbleColors(text) {
  let patched = replaceOnce(
    text,
    "function tn({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){",
    `${codexPlusUserBubbleSettingsHelpers}function tn({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){`,
    "user bubble settings helper insertion anchor",
  );
  patched = replaceOnce(
    patched,
    "chromeThemeCodeFont:{id:`settings.general.appearance.chromeTheme.codeFontFamily.short`,defaultMessage:`Code font`,description:`Short label for the code font input`},pointerCursors:",
    "chromeThemeCodeFont:{id:`settings.general.appearance.chromeTheme.codeFontFamily.short`,defaultMessage:`Code font`,description:`Short label for the code font input`},userBubble:{id:`settings.general.appearance.userMessageBubble.short`,defaultMessage:`User bubble`,description:`Short label for the user message bubble color input`},pointerCursors:",
    "user bubble settings message anchor",
  );
  patched = replaceOnce(
    patched,
    "let r=a(s),i=N(),o=i.formatMessage(Q.chromeThemeAccent),c=i.formatMessage(Q.chromeThemeBackground),l=i.formatMessage(Q.chromeThemeForeground),u=i.formatMessage(Q.chromeThemeContrast),d=i.formatMessage(Q.chromeThemeTranslucentSidebar),",
    "let r=a(s),i=N(),o=i.formatMessage(Q.chromeThemeAccent),c=i.formatMessage(Q.chromeThemeBackground),l=i.formatMessage(Q.chromeThemeForeground),CPX_userBubbleLabel=i.formatMessage(Q.userBubble),u=i.formatMessage(Q.chromeThemeContrast),d=i.formatMessage(Q.chromeThemeTranslucentSidebar),",
    "user bubble settings label anchor",
  );
  return replaceOnce(
    patched,
    "children:[D.map(e=>(0,Z.jsx)(J,{control:(0,Z.jsx)(sn,{ariaLabel:e.ariaLabel,value:x[e.role],onChange:t=>{k(e.role,t)}}),label:e.label,variant:`nested`},e.role)),O.map",
    "children:[D.map(e=>(0,Z.jsx)(J,{control:(0,Z.jsx)(sn,{ariaLabel:e.ariaLabel,value:x[e.role],onChange:t=>{k(e.role,t)}}),label:e.label,variant:`nested`},e.role)),(0,Z.jsx)(CPXUserBubbleColorRow,{variant:n,label:CPX_userBubbleLabel,ariaLabel:i.formatMessage({id:`settings.general.appearance.userMessageBubble`,defaultMessage:`{variant} user message bubble color`,description:`Aria label for the user message bubble color input in appearance settings`},{variant:S})}),O.map",
    "user bubble settings row anchor",
  );
}

function patchGeneralSettingsProjectColors(text) {
  let patched = replaceOnce(
    text,
    "function tn({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){",
    `${codexPlusProjectColorSettingsHelpers}function tn({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){`,
    "project colors settings helper insertion anchor",
  );
  patched = replaceOnce(
    patched,
    "userBubble:{id:`settings.general.appearance.userMessageBubble.short`,defaultMessage:`User bubble`,description:`Short label for the user message bubble color input`},pointerCursors:",
    "userBubble:{id:`settings.general.appearance.userMessageBubble.short`,defaultMessage:`User bubble`,description:`Short label for the user message bubble color input`},projectColors:{id:`settings.general.appearance.projectColors.short`,defaultMessage:`Project colors`,description:`Short label for the project colors toggle`},pointerCursors:",
    "project colors settings message anchor",
  );
  patched = replaceOnce(
    patched,
    "CPX_userBubbleLabel=i.formatMessage(Q.userBubble),u=i.formatMessage(Q.chromeThemeContrast),",
    "CPX_userBubbleLabel=i.formatMessage(Q.userBubble),CPX_projectColorsLabel=i.formatMessage(Q.projectColors),u=i.formatMessage(Q.chromeThemeContrast),",
    "project colors settings label anchor",
  );
  return replaceOnce(
    patched,
    "(0,Z.jsx)(CPXUserBubbleColorRow,{variant:n,label:CPX_userBubbleLabel,ariaLabel:i.formatMessage({id:`settings.general.appearance.userMessageBubble`,defaultMessage:`{variant} user message bubble color`,description:`Aria label for the user message bubble color input in appearance settings`},{variant:S})}),O.map",
    "(0,Z.jsx)(CPXUserBubbleColorRow,{variant:n,label:CPX_userBubbleLabel,ariaLabel:i.formatMessage({id:`settings.general.appearance.userMessageBubble`,defaultMessage:`{variant} user message bubble color`,description:`Aria label for the user message bubble color input in appearance settings`},{variant:S})}),(0,Z.jsx)(CPXProjectColorToggleRow,{label:CPX_projectColorsLabel,ariaLabel:i.formatMessage({id:`settings.general.appearance.projectColors`,defaultMessage:`{variant} project colors`,description:`Aria label for the project colors toggle in appearance settings`},{variant:S})}),O.map",
    "project colors settings row anchor",
  );
}

const codexPlusUserBubbleHelpers = `
function CPX_installUserBubbleColors(){}CPX_installUserBubbleColors();`;

function patchUserMessageAttachmentsBubbleColors(text) {
  let patched = replaceOnce(
    text,
    "var Z=i(),Q=e(n(),1),$=r();function Ue(e){",
    `var Z=i(),Q=e(n(),1),$=r();${codexPlusUserBubbleHelpers}function Ue(e){`,
    "user bubble helper insertion anchor",
  );
  patched = replaceOnce(
    patched,
    "Se=W?(0,$.jsx)(`div`,{className:`w-full p-px`,children:(0,$.jsx)(it,{cwd:T??null,hostId:k,initialMessage:U.trim(),onCancel:()=>{q(null)},onDraftChange:e=>{q(e)},onSubmit:ge})}):le?(0,$.jsx)(`div`,{\"data-user-message-bubble\":!0,role:H?`button`:void 0,tabIndex:0,className:D(e,`text-left focus-visible:ring-2 focus-visible:ring-token-focus-border focus-visible:outline-none`,H&&`cursor-interaction`),",
    "Se=W?(0,$.jsx)(`div`,{className:`w-full p-px`,children:(0,$.jsx)(it,{cwd:T??null,hostId:k,initialMessage:U.trim(),onCancel:()=>{q(null)},onDraftChange:e=>{q(e)},onSubmit:ge})}):le?(0,$.jsx)(`div`,{\"data-user-message-bubble\":!0,\"data-codex-plus-user-bubble\":!0,role:H?`button`:void 0,tabIndex:0,className:D(e,`text-left focus-visible:ring-2 focus-visible:ring-token-focus-border focus-visible:outline-none`,H&&`cursor-interaction`),",
    "user bubble marker attribute anchor",
  );
  return replaceOnce(
    patched,
    "return(0,$.jsx)(`form`,{className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),v()},children:",
    "return(0,$.jsx)(`form`,{\"data-codex-plus-user-entry\":!0,className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),v()},children:",
    "edit user message entry marker anchor",
  );
}

function patchUserMessageAttachmentsProjectColors(text) {
  let patched = replaceOnce(
    text,
    `import{Aa as x,Ta as S}from"./${srcFile}";`,
    `import{Aa as x,Ta as S}from"./${srcFile}";import{t as CPX_localThreadKey}from"./${sidebarThreadKeysFile}";import{s as CPX_threadProjectId}from"./${sidebarThreadRowSignalsFile}";`,
    "user bubble project assignment imports anchor",
  );
  patched = replaceOnce(
    patched,
    "function CPX_installUserBubbleColors(){}CPX_installUserBubbleColors();",
    `${codexPlusProjectColorHelpers}function CPX_installUserBubbleColors(){}CPX_installUserBubbleColors();`,
    "user bubble project color helper insertion anchor",
  );
  patched = replaceOnce(
    patched,
    "hasExternalAttachments:b,commentCount:ee,onEditMessage:x,threadId:S,turnId:w,cwd:T,hostId:k}=e,M=a===void 0?!1:a,",
    "hasExternalAttachments:b,commentCount:ee,onEditMessage:x,threadId:S,turnId:w,cwd:T,hostId:k}=e,CPX_userMessageProjectId=o(CPX_threadProjectId,S==null?null:CPX_localThreadKey(S)),CPX_userMessageProjectStyle=CPX_projectColorStyle(CPX_userMessageProjectId),M=a===void 0?!1:a,",
    "user bubble project assignment style anchor",
  );
  return replaceOnce(
    patched,
    "\"data-user-message-bubble\":!0,\"data-codex-plus-user-bubble\":!0,role:H?`button`:void 0,",
    "\"data-user-message-bubble\":!0,\"data-codex-plus-user-bubble\":!0,\"data-codex-plus-project-color\":CPX_userMessageProjectStyle?``:void 0,style:CPX_userMessageProjectStyle,role:H?`button`:void 0,",
    "user bubble project marker attribute anchor",
  );
}

function patchComposerBubbleColors(text) {
  let patched = replaceOnce(
    text,
    "function oh(e){let t=(0,$.c)(13),",
    `${codexPlusUserBubbleHelpers}function oh(e){let t=(0,$.c)(13),`,
    "composer user bubble helper insertion anchor",
  );
  patched = replaceOnce(
    patched,
    "return t[5]!==n||t[6]!==a||t[7]!==c||t[8]!==l||t[9]!==u||t[10]!==d||t[11]!==v?(y=(0,Q.jsx)(Jt.div,{inert:a,className:v,onDragEnter:c,onDragOver:u,onDragLeave:l,onDrop:d,children:n}),t[5]=n,t[6]=a,t[7]=c,t[8]=l,t[9]=u,t[10]=d,t[11]=v,t[12]=y):y=t[12],y}",
    "return t[5]!==n||t[6]!==a||t[7]!==c||t[8]!==l||t[9]!==u||t[10]!==d||t[11]!==v?(y=(0,Q.jsx)(Jt.div,{inert:a,\"data-codex-plus-user-entry\":!0,className:v,onDragEnter:c,onDragOver:u,onDragLeave:l,onDrop:d,children:n}),t[5]=n,t[6]=a,t[7]=c,t[8]=l,t[9]=u,t[10]=d,t[11]=v,t[12]=y):y=t[12],y}",
    "composer user entry marker render anchor",
  );
  return patched;
}

function patchComposerProjectColors(text) {
  let patched = replaceOnce(
    text,
    anchors.composerProjectImports,
    `${anchors.composerProjectImports}import{t as CPX_localThreadKey}from"./${sidebarThreadKeysFile}";import{s as CPX_threadProjectId}from"./${sidebarThreadRowSignalsFile}";`,
    "composer project assignment imports anchor",
  );
  patched = replaceOnce(
    patched,
    "function CPX_installUserBubbleColors(){}CPX_installUserBubbleColors();",
    `${codexPlusProjectColorHelpers}function CPX_installUserBubbleColors(){}CPX_installUserBubbleColors();`,
    "composer project color helper insertion anchor",
  );
  patched = replaceOnce(
    patched,
    "function oh(e){let t=(0,$.c)(13),{children:n,className:r,externalFooterVariant:i,inert:a,isDragActive:o,layout:s,onDragEnter:c,onDragLeave:l,onDragOver:u,onDrop:d}=e,",
    "function oh(e){let t=(0,$.c)(14),{children:n,className:r,externalFooterVariant:i,inert:a,isDragActive:o,layout:s,onDragEnter:c,onDragLeave:l,onDragOver:u,onDrop:d,style:CPX_projectColorInlineStyle}=e,",
    "composer surface style prop anchor",
  );
  patched = replaceOnce(
    patched,
    anchors.composerProjectStyleCaller,
    anchors.composerProjectStyleCaller.replace(";return", ",CPX_composerThreadProjectId=a(CPX_threadProjectId,G==null?null:CPX_localThreadKey(G)),CPX_composerProjectStyle=CPX_projectColorStyle(G==null?On?{hostId:On.hostId,path:On.remotePath,projectId:kn,label:On.label??On.name}:x??void 0:CPX_composerThreadProjectId);return"),
    "composer project style hook-safe caller anchor",
  );
  patched = replaceOnce(
    patched,
    "return t[5]!==n||t[6]!==a||t[7]!==c||t[8]!==l||t[9]!==u||t[10]!==d||t[11]!==v?(y=(0,Q.jsx)(Jt.div,{inert:a,\"data-codex-plus-user-entry\":!0,className:v,onDragEnter:c,onDragOver:u,onDragLeave:l,onDrop:d,children:n}),t[5]=n,t[6]=a,t[7]=c,t[8]=l,t[9]=u,t[10]=d,t[11]=v,t[12]=y):y=t[12],y}",
    "return t[5]!==n||t[6]!==a||t[7]!==c||t[8]!==l||t[9]!==u||t[10]!==d||t[11]!==v||t[12]!==CPX_projectColorInlineStyle?(y=(0,Q.jsx)(Jt.div,{inert:a,\"data-codex-plus-user-entry\":!0,\"data-codex-plus-project-color\":CPX_projectColorInlineStyle?``:void 0,style:CPX_projectColorInlineStyle,className:v,onDragEnter:c,onDragOver:u,onDragLeave:l,onDrop:d,children:n}),t[5]=n,t[6]=a,t[7]=c,t[8]=l,t[9]=u,t[10]=d,t[11]=v,t[12]=CPX_projectColorInlineStyle,t[13]=y):y=t[13],y}",
    "composer project entry styled render anchor",
  );
  return replaceOnce(
    patched,
    anchors.composerProjectAccentCaller,
    anchors.composerProjectAccentCaller.replace(",onDragEnter:", ",style:!Ge&&!Hn?CPX_composerProjectStyle:void 0,onDragEnter:"),
    "composer project accent style caller anchor",
  );
}

function patchElectronMenuShortcuts(text) {
  return replaceOnce(
    text,
    "{id:`toggleSidebar`,titleIntlId:`codex.command.toggleSidebar`,descriptionIntlId:`codex.commandDescription.toggleSidebar`,commandMenuGroupKey:`panels`,commandMenu:!0,electron:{menuTitle:`Toggle Sidebar`,menuTitleIntlId:`codex.commandMenuTitle.toggleSidebar`,defaultKeybindings:[{key:`CmdOrCtrl+B`}]}},{id:`toggleBottomPanel`,",
    "{id:`toggleSidebar`,titleIntlId:`codex.command.toggleSidebar`,descriptionIntlId:`codex.commandDescription.toggleSidebar`,commandMenuGroupKey:`panels`,commandMenu:!0,electron:{menuTitle:`Toggle Sidebar`,menuTitleIntlId:`codex.commandMenuTitle.toggleSidebar`,defaultKeybindings:[{key:`CmdOrCtrl+B`}]}},{id:\`codexPlusToggleSidebarNameBlur\`,titleIntlId:`codexPlus.command.toggleSidebarNameBlur`,descriptionIntlId:`codexPlus.commandDescription.toggleSidebarNameBlur`,commandMenuGroupKey:`panels`,commandMenu:!0,electron:{menuTitle:\`Toggle sidebar blur\`,menuTitleIntlId:`codexPlus.commandMenuTitle.toggleSidebarNameBlur`,defaultKeybindings:[]}},{id:`toggleBottomPanel`,",
    "sidebar blur command palette metadata anchor",
  );
}

function patchKeyboardShortcutsSearchInput(text) {
  let patched = replaceOnce(
    text,
    "\"codex.command.toggleSidebar\":{id:`codex.command.toggleSidebar`,defaultMessage:`Toggle sidebar`,description:`Command menu item to toggle the sidebar`},\"codex.command.toggleBottomPanel\":",
    "\"codex.command.toggleSidebar\":{id:`codex.command.toggleSidebar`,defaultMessage:`Toggle sidebar`,description:`Command menu item to toggle the sidebar`},\"codexPlus.command.toggleSidebarNameBlur\":{id:`codexPlus.command.toggleSidebarNameBlur`,defaultMessage:\`Toggle sidebar blur\`,description:`Command menu item to blur or show sidebar names`},\"codex.command.toggleBottomPanel\":",
    "sidebar blur command title intl message anchor",
  );
  patched = replaceOnce(
    patched,
    "\"codex.commandMenuTitle.toggleSidebar\":{id:`codex.commandMenuTitle.toggleSidebar`,defaultMessage:`Toggle Sidebar`,description:`Native menu item to toggle the sidebar`},\"codex.commandMenuTitle.toggleBottomPanel\":",
    "\"codex.commandMenuTitle.toggleSidebar\":{id:`codex.commandMenuTitle.toggleSidebar`,defaultMessage:`Toggle Sidebar`,description:`Native menu item to toggle the sidebar`},\"codexPlus.commandMenuTitle.toggleSidebarNameBlur\":{id:`codexPlus.commandMenuTitle.toggleSidebarNameBlur`,defaultMessage:\`Toggle sidebar blur\`,description:`Native menu item to blur or show sidebar names`},\"codex.commandMenuTitle.toggleBottomPanel\":",
    "sidebar blur command menu title intl message anchor",
  );
  return replaceOnce(
    patched,
    "\"codex.commandDescription.toggleSidebar\":{id:`codex.commandDescription.toggleSidebar`,defaultMessage:`Show or hide the sidebar`,description:`Description for the Toggle sidebar command`},\"codex.commandDescription.toggleBottomPanel\":",
    "\"codex.commandDescription.toggleSidebar\":{id:`codex.commandDescription.toggleSidebar`,defaultMessage:`Show or hide the sidebar`,description:`Description for the Toggle sidebar command`},\"codexPlus.commandDescription.toggleSidebarNameBlur\":{id:`codexPlus.commandDescription.toggleSidebarNameBlur`,defaultMessage:\`Blur or show sidebar chat and project names\`,description:`Description for the Toggle sidebar blur command`},\"codex.commandDescription.toggleBottomPanel\":",
    "sidebar blur command description intl message anchor",
  );
}

function patchLocalTaskRow(text) {
  let patched = replaceOnce(
    text,
    "function fn(e){let t=(0,K.c)(124),",
    `${codexPlusProjectColorHelpers}function fn(e){let t=(0,K.c)(124),`,
    "local task row project color helper insertion anchor",
  );
  patched = replaceOnce(
    patched,
    "threadSummary:Ne,dataAttributes:Fe}=e,Ie=g===void 0?!1:g,",
    "threadSummary:Ne,dataAttributes:Fe}=e,CPX_rowDataAttributes=Fe??CPX_projectColorDataAttributes(Oe,!0),Ie=g===void 0?!1:g,",
    "local task row project assignment anchor",
  );
  patched = replaceOnce(
    patched,
    "t[87]!==Fe",
    "t[87]!==CPX_rowDataAttributes",
    "local task row memo dependency anchor",
  );
  patched = replaceOnce(
    patched,
    "dataAttributes:Fe,archiveAriaLabel:hn",
    "dataAttributes:CPX_rowDataAttributes,archiveAriaLabel:hn",
    "local task row data attributes anchor",
  );
  return replaceOnce(
    patched,
    "t[87]=Fe",
    "t[87]=CPX_rowDataAttributes",
    "local task row memo assignment anchor",
  );
}

return makePatchSet({
    id: config.id,
    codexVersion: config.codexVersion,
    bundleVersion: config.bundleVersion,
    asarSha256: config.asarSha256,
    assetFiles: codexPlusRuntimeAssets(),
    patches: [
    {
      id: "bundle-identity",
      infoPlistStrings: {
        CFBundleDisplayName: "Codex Plus",
        CFBundleName: "Codex Plus",
        CFBundleIdentifier: "com.openai.codex-plus",
      },
      fileTransforms: [[titleFile, patchTitle]],
    },
    ...(mainFile ? [{
      id: "about-codex-plus-metadata",
      fileTransforms: [[mainFile, patchAboutDialog]],
    }] : []),
    {
      id: "nested-repository-worker",
      fileTransforms: [[workerFile, patchWorker]],
    },
    {
      id: "multi-repository-review",
      fileTransforms: [[threadSidePanelTabsFile, patchThreadSidePanelTabs]],
    },
    {
      id: "diagnostic-error-boundary",
      fileTransforms: [
        [appShellFile, patchAppShell],
        [errorBoundaryFile, patchErrorBoundary],
      ],
    },
    {
      id: "user-message-bubble-colors",
      fileTransforms: [
        [generalSettingsFile, patchGeneralSettingsUserBubbleColors],
        [userMessageAttachmentsFile, patchUserMessageAttachmentsBubbleColors],
        [composerFile, patchComposerBubbleColors],
      ],
    },
    {
      id: "project-colors",
      fileTransforms: [
        [appMainFile, patchAppMainProjectColors],
        [generalSettingsFile, patchGeneralSettingsProjectColors],
        [sidebarProjectHoverCardSourceRowsFile, patchSidebarProjectHoverCardSourceRows],
        [localTaskRowFile, patchLocalTaskRow],
        [userMessageAttachmentsFile, patchUserMessageAttachmentsProjectColors],
        [composerFile, patchComposerProjectColors],
      ],
    },
    {
      id: "sidebar-name-blur",
      fileTransforms: [
        [appMainFile, patchAppMainSidebarBlur],
        [electronMenuShortcutsFile, patchElectronMenuShortcuts],
        [keyboardShortcutsSearchInputFile, patchKeyboardShortcutsSearchInput],
      ],
    },
    ],
  });
}

module.exports = {
  buildCodexPlusPatchSet,
};
