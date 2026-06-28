const { codexPlusRuntimeAssets } = require("../../runtime/assets");
const { replaceOnce } = require("./replace");
const { makePatchSet } = require("./make-patch-set");
const { aboutMetadataRequire } = require("./hooks/about");
const { diagnosticDetailsHook } = require("./hooks/diagnostics");
const { mermaidDiagramHook } = require("./hooks/mermaid");
const { messageComposerHook } = require("./hooks/message-composer");
const { nativeMainHook } = require("./hooks/native-main");
const { reviewHook } = require("./hooks/review");
const { projectColorHook } = require("./hooks/sidebar");
const { appearanceSettingsHook, commandMenuItemsExpression } = require("./hooks/settings-commands");
const { threadHeaderHook } = require("./hooks/thread-header");
const { workerHook } = require("./hooks/worker");
const {
  patchHomeProjectDropdownProjectSelectorShortcut,
  patchLocalActiveWorkspaceRootDropdownProjectSelectorShortcut,
  patchRunCommandProjectSelectorShortcut,
} = require("./project-selector-shortcut-patch");

function buildCodexPlusPatchSet(config) {
  const oldTitle = "<title>Codex</title>";
  const newTitle = '<title>Codex Plus</title><script src="./assets/codex-plus/runtime.js"></script>';
  const titleFile = "webview/index.html";
  const workerFile = ".vite/build/worker.js";
  const preloadFile = ".vite/build/preload.js";
  const files = config.files;
  const anchors = config.anchors;
  const mainFile = files.main;
  const electronCommandSourceFile = files.electronCommandSource;
  const appMainFile = files.appMain;
  const appShellFile = files.appShell;
  const errorBoundaryFile = files.errorBoundary;
  const generalSettingsFile = files.generalSettings;
  const headerFile = files.header;
  const threadPageHeaderFile = files.threadPageHeader;
  const localConversationPageFile = files.localConversationPage;
  const threadContextFile = files.threadContext;
  const threadContextImportFile = threadContextFile?.split("/").pop();
  const threadSidePanelTabsFile = files.threadSidePanelTabs;
  const userMessageAttachmentsFile = files.userMessageAttachments;
  const composerFile = files.composer;
  const localActiveWorkspaceRootDropdownFile = files.localActiveWorkspaceRootDropdown;
  const homeProjectDropdownFile = files.homeProjectDropdown;
  const runCommandFile = files.runCommand;
  const localTaskRowFile = files.localTaskRow;
  const mermaidDiagramShellFile = files.mermaidDiagramShell;
  const electronMenuShortcutsFile = files.electronMenuShortcuts;
  const keyboardShortcutsSearchInputFile = files.keyboardShortcutsSearchInput;
  const statsigStartupFile = files.statsigStartup;
  const srcFile = files.src;
  const sidebarThreadKeysFile = files.sidebarThreadKeys;
  const sidebarThreadRowSignalsFile = files.sidebarThreadRowSignals;
  const branchPickerDropdownContentFile = files.branchPickerDropdownContent;

function patchTitle(text) {
  return replaceOnce(text, oldTitle, newTitle, `${oldTitle} in ${titleFile}`);
}

function patchDevModeStatsigFallback(text) {
  if (text.includes("function XY(e){let t=(0,sX.c)(27),")) {
    return replaceOnce(
      text,
      "function XY(e){let t=(0,sX.c)(27),{auth:n,appVersion:r,currentAccount:i,hostBuildFlavor:a,plan:o,statsigClientKey:s,systemName:c,systemVersion:l,children:u}=e,d=o===void 0?null:o,f=s===void 0?OY:s,p,m,h;if",
      "function XY(e){let t=(0,sX.c)(27),{auth:n,appVersion:r,currentAccount:i,hostBuildFlavor:a,plan:o,statsigClientKey:s,systemName:c,systemVersion:l,children:u}=e,d=o===void 0?null:o,f=s===void 0?OY:s,p,m,h;if(window.__CodexPlusRuntimeConfig?.devModeStatsigFallback)return u;if",
      "dev mode statsig fallback anchor",
    );
  }
  return replaceOnce(
    text,
    "function Ske(e){let t=(0,J1.c)(27),{auth:n,appVersion:r,currentAccount:i,hostBuildFlavor:a,plan:o,statsigClientKey:s,systemName:c,systemVersion:l,children:u}=e,d=o===void 0?null:o,f=s===void 0?F1:s,p,m,h;if",
    "function Ske(e){let t=(0,J1.c)(27),{auth:n,appVersion:r,currentAccount:i,hostBuildFlavor:a,plan:o,statsigClientKey:s,systemName:c,systemVersion:l,children:u}=e,d=o===void 0?null:o,f=s===void 0?F1:s,p,m,h;if(window.__CodexPlusRuntimeConfig?.devModeStatsigFallback)return u;if",
    "dev mode statsig fallback anchor",
  );
}

function patchAboutDialog(text, context = {}) {
  const aboutContext = {
    patcherRepoUrl: context.patcherRepoUrl || "https://github.com/michaelw/codex-plus-patcher",
    patcherGitSha: context.patcherGitSha || "unknown",
    sourceAsarSha256: context.sourceAsarSha256 || "unknown",
    appliedPatches: context.appliedPatches || [],
  };
  if (text.includes("function Q4({appDisplayName:e,buildInfoLabel:t,buildInfoText:n,iconDataUrl:r,isDark:i,okLabel:a,title:o})")) {
    let patched = replaceOnce(
      text,
      "let i=a.app.getName(),o=a.app.getVersion()",
      `let CPXAbout=${aboutMetadataRequire()}.aboutPayload(${JSON.stringify(aboutContext)}),i=CPXAbout.appDisplayName,o=a.app.getVersion()`,
      "about dialog app name anchor",
    );
    patched = replaceOnce(
      patched,
      "g=d.formatMessage({messageId:I4,defaultMessage:L4}),_=q4(o),v=_.length===0?h:[h,``,..._].join(`\n`),",
      "g=d.formatMessage({messageId:I4,defaultMessage:L4}),_=CPXAbout.buildInfoLines,v=_.length===0?h:[h,``,..._].join(`\n`),",
      "about dialog build information anchor",
    );
    patched = replaceOnce(
      patched,
      "Q4({appDisplayName:i,buildInfoLabel:g,buildInfoText:v,iconDataUrl:f.htmlIconDataUrl,isDark:b,okLabel:m,title:p})",
      "Q4({appDisplayName:i,buildInfoLabel:g,buildInfoText:v,codexPlusDisclaimerHeading:CPXAbout.disclaimerHeading,codexPlusDisclaimerBody:CPXAbout.disclaimerBody,iconDataUrl:f.htmlIconDataUrl,isDark:b,okLabel:m,title:p})",
      "about dialog renderer call anchor",
    );
    patched = replaceOnce(
      patched,
      "function Q4({appDisplayName:e,buildInfoLabel:t,buildInfoText:n,iconDataUrl:r,isDark:i,okLabel:a,title:o}){let s=r==null?``:",
      "function Q4({appDisplayName:e,buildInfoLabel:t,buildInfoText:n,codexPlusDisclaimerHeading:D,codexPlusDisclaimerBody:O,iconDataUrl:r,isDark:i,okLabel:a,title:o}){let CPXAboutMetadata=" +
        aboutMetadataRequire() +
        ",q=CPXAboutMetadata.disclaimerMarkup({escape:sV.default,heading:D,body:O}),s=r==null?``:",
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
      '      <div class="app-name" id="app-name">${(0,sV.default)(e)}</div>\n      <pre class="build-info" aria-label="${(0,sV.default)(t)}">${(0,sV.default)(n)}</pre>',
      '      <div class="app-name" id="app-name">${(0,sV.default)(e)}</div>\n      ${q}\n      <pre class="build-info" aria-label="${(0,sV.default)(t)}">${(0,sV.default)(n)}</pre>',
      "about dialog disclaimer insertion anchor",
    );
  }
  let patched = replaceOnce(
    text,
    "let i=a.app.getName(),o=a.app.getVersion()",
    `let CPXAbout=${aboutMetadataRequire()}.aboutPayload(${JSON.stringify(aboutContext)}),i=CPXAbout.appDisplayName,o=a.app.getVersion()`,
    "about dialog app name anchor",
  );
  patched = replaceOnce(
    patched,
    "g=d.formatMessage({messageId:A0,defaultMessage:j0}),_=V0(o),v=_.length===0?h:[h,``,..._].join(`\n`),",
    "g=d.formatMessage({messageId:A0,defaultMessage:j0}),_=CPXAbout.buildInfoLines,v=_.length===0?h:[h,``,..._].join(`\n`),",
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
    "function K0({appDisplayName:e,buildInfoLabel:t,buildInfoText:n,codexPlusDisclaimerHeading:D,codexPlusDisclaimerBody:O,iconDataUrl:r,isDark:i,okLabel:a,title:o}){let CPXAboutMetadata=" +
      aboutMetadataRequire() +
      ",q=CPXAboutMetadata.disclaimerMarkup({escape:zz.default,heading:D,body:O}),s=r==null?``:",
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
  if (text.includes("function yae(e,t){return e.queryClient.fetchQuery")) {
    let patched = replaceOnce(
      text,
      "var d2=gG(`git`),",
      'const CPXW=require("./codex-plus-worker.js"),CPXT=e=>CPXW.traceRequest(e),CPXR=(e,t,n,r)=>CPXW.repositoryTargetsFromHost(e,t,n,r,yae),CPXB=e=>CPXW.isReadOnlyBranchRequest(e?.requestKind,e?.source);var d2=gG(`git`),',
      "worker helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "if(!Z0(y)&&!t2(n))return",
      "if(!Z0(y)&&!CPXB(y)&&!t2(n))return",
      "codex plus branch picker git allowlist anchor",
    );
    patched = replaceOnce(
      patched,
      "case`commit-message-diff`:a=X(await o7(nae(e.params.cwd,e.params.includeUnstaged,this.gitManager,r),t.signal));break;case`submodule-paths`:a=X({paths:await yae(this.gitManager.getWorktreeRepositoryForRoot(e.params.root,r),t.signal)});break;",
      "case`commit-message-diff`:a=X(await o7(nae(e.params.cwd,e.params.includeUnstaged,this.gitManager,r),t.signal));break;case`codex-plus-trace`:a=X(CPXT(e.params));break;case`repository-targets`:a=X(await CPXR(this.gitManager,e.params,r,t.signal));break;case`submodule-paths`:a=X({paths:await yae(this.gitManager.getWorktreeRepositoryForRoot(e.params.root,r),t.signal)});break;",
      "repository-targets worker switch anchor",
    );
    return replaceOnce(
      patched,
      "case`review-patch`:case`commit-message-diff`:case`submodule-paths`:case`cat-file`:",
      "case`review-patch`:case`commit-message-diff`:case`codex-plus-trace`:case`repository-targets`:case`submodule-paths`:case`cat-file`:",
      "repository-targets worker readonly method anchor",
    );
  }
  let patched = replaceOnce(
    text,
    "function pae(e,t){return e.queryClient.fetchQuery",
    `${workerHook()}function pae(e,t){return e.queryClient.fetchQuery`,
    "worker helper insertion anchor",
  );
  patched = replaceOnce(
    patched,
    "case`submodule-paths`:a=X({paths:await pae(this.gitManager.getWorktreeRepositoryForRoot(e.params.root,r),t.signal)});break;",
    "case`codex-plus-trace`:a=X(CPXT(e.params));break;case`repository-targets`:a=X(await CPXR(this.gitManager,e.params,r,t.signal));break;case`submodule-paths`:a=X({paths:await pae(this.gitManager.getWorktreeRepositoryForRoot(e.params.root,r),t.signal)});break;",
    "repository-targets worker switch anchor",
  );
  patched = replaceOnce(
    patched,
    "function u2({requestKind:e,source:t}){return l2.has(e??``)||d2(t)}",
    "function u2({requestKind:e,source:t}){return l2.has(e??``)||d2(t)||CPXB(e,t)}",
    "codex plus branch picker git allowlist anchor",
  );
  return replaceOnce(
    patched,
    "case`commit-message-diff`:case`submodule-paths`:case`cat-file`:",
    "case`commit-message-diff`:case`codex-plus-trace`:case`repository-targets`:case`submodule-paths`:case`cat-file`:",
    "repository-targets worker readonly method anchor",
  );
}

function patchThreadSidePanelTabs(text) {
  if (text.includes("function mQe(e){let t=(0,hQe.c)(20),{diffMode:n,setTabState:r,tabState:i}=e")) {
    let patched = replaceOnce(
      text,
      "function mQe(e){let t=(0,hQe.c)(20),{diffMode:n,setTabState:r,tabState:i}=e",
      `${reviewHook("[tR,eR,B,X,Z,jw,Mw,Ow,null,fu,ze,JZe,za,Ia,null,null,null,null,null,null,null]")}function mQe(e){let t=(0,hQe.c)(20),{diffMode:n,setTabState:r,tabState:i}=e`,
      "review host hook insertion anchor",
    );
    return replaceOnce(
      patched,
      "_=(0,tR.jsx)(JZe,{diffMode:n,diffRefs:u,isFileTreeOpen:s,isReviewExpanded:p,setTabState:r,setScrollContainerRef:h,tabState:i}),t[9]=n,t[10]=u,t[11]=s,t[12]=p,t[13]=h,t[14]=r,t[15]=i,t[16]=_):_=t[16];",
      "_=(0,tR.jsx)(CPXRM,{mainReviewContent:(0,tR.jsx)(JZe,{diffMode:n,diffRefs:u,isFileTreeOpen:s,isReviewExpanded:p,setTabState:r,setScrollContainerRef:h,tabState:i}),diffMode:n,setTabState:r,tabState:i}),t[9]=n,t[10]=u,t[11]=s,t[12]=p,t[13]=h,t[14]=r,t[15]=i,t[16]=_):_=t[16];",
      "review body mux anchor",
    );
  }
  if (text.includes("function oDn(e){let t=(0,sDn.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e")) {
    let patched = replaceOnce(
      text,
      "function oDn(e){let t=(0,sDn.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e",
      `${reviewHook("[JX,typeof PJ!==`undefined`?PJ:null,Kn,Nn,Xd,SA,CA,wA,null,Fe,Ue,cxn,null,null,null,null,null,null,null,typeof yA!==`undefined`?yA:null,typeof Gcn!==`undefined`?Gcn:null]")}function oDn(e){let t=(0,sDn.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e`,
      "review host hook insertion anchor",
    );
    return replaceOnce(
      patched,
      "let s;t[1]!==a||t[2]!==r||t[3]!==i?(s=(0,JX.jsx)(cxn,{diffMode:a,setTabState:r,tabState:i}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];let c;",
      "let s;t[1]!==a||t[2]!==r||t[3]!==i?(s=(0,JX.jsx)(CPXRM,{mainReviewContent:(0,JX.jsx)(cxn,{diffMode:a,setTabState:r,tabState:i}),diffMode:a,setTabState:r,tabState:i}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];let c;",
      "review body mux anchor",
    );
  }
  let patched = replaceOnce(
    text,
    "import{r as vi,t as yi}from\"./dropdown-CTBRoADH.js\";",
    `import{r as vi,t as yi}from"./dropdown-CTBRoADH.js";import{t as CPXBranchPickerDropdownContent}from"./${branchPickerDropdownContentFile}";`,
    "branch picker content import anchor",
  );
  patched = replaceOnce(
    patched,
    "function uf({cwd:e,fileEntries:t,generatedPathsReady:n,hasUnhandledAttributesFiles:r,isCappedMode:i,repositorySource:a,reviewSummarySource:o}){",
    `${reviewHook()}function uf({cwd:e,fileEntries:t,generatedPathsReady:n,hasUnhandledAttributesFiles:r,isCappedMode:i,repositorySource:a,reviewSummarySource:o}){`,
    "review host hook insertion anchor",
  );
  return replaceOnce(
    patched,
    "let s;t[1]!==a||t[2]!==r||t[3]!==i?(s=(0,$.jsx)(Tf,{diffMode:a,setTabState:r,tabState:i}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];let c;",
    "let s;t[1]!==a||t[2]!==r||t[3]!==i?(s=(0,$.jsx)(CPXRM,{mainReviewContent:(0,$.jsx)(Tf,{diffMode:a,setTabState:r,tabState:i}),diffMode:a,setTabState:r,tabState:i}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];let c;",
    "review body mux anchor",
  );
}
function patchAppShell(text) {
  if (text.includes("function QUe(e){let t=(0,NP.c)(4),{onRetry:n}=e,")) {
    let patched = replaceOnce(
      text,
      "function QUe(e){let t=(0,NP.c)(4),{onRetry:n}=e,",
      `${diagnosticDetailsHook()}function QUe(e){let t=(0,NP.c)(4),{onRetry:n,error:CPX_error}=e,`,
      "app shell error fallback prop anchor",
    );
    patched = replaceOnce(
      patched,
      "children:[r,(0,FP.jsx)(za,{color:`secondary`,size:`default`,onClick:n,children:i})]",
      "children:[r,CPXDiagnosticDetails({jsx:FP.jsx,error:CPX_error}),(0,FP.jsx)(za,{color:`secondary`,size:`default`,onClick:n,children:i})]",
      "app shell error detail insertion anchor",
    );
    return replaceOnce(
      patched,
      "fallback:e=>(0,FP.jsx)(QUe,{onRetry:()=>{e.resetError()}})",
      "fallback:e=>(0,FP.jsx)(QUe,{error:e.error,onRetry:()=>{e.resetError()}})",
      "app shell boundary error prop anchor",
    );
  }
  if (text.includes("function xdn(e){let t=(0,Cdn.c)(4),{onRetry:n}=e")) {
    let patched = replaceOnce(
      text,
      "function xdn(e){let t=(0,Cdn.c)(4),{onRetry:n}=e",
      `${diagnosticDetailsHook()}function xdn(e){let t=(0,Cdn.c)(4),{onRetry:n,error:CPX_error}=e`,
      "app shell error fallback prop anchor",
    );
    patched = replaceOnce(
      patched,
      "children:[r,(0,NK.jsx)(Ud,{color:`secondary`,size:`default`,onClick:n,children:i})]",
      "children:[r,CPXDiagnosticDetails({jsx:NK.jsx,error:CPX_error}),(0,NK.jsx)(Ud,{color:`secondary`,size:`default`,onClick:n,children:i})]",
      "app shell error detail insertion anchor",
    );
    return replaceOnce(
      patched,
      "fallback:e=>(0,NK.jsx)(xdn,{onRetry:()=>{e.resetError()}})",
      "fallback:e=>(0,NK.jsx)(xdn,{error:e.error,onRetry:()=>{e.resetError()}})",
      "app shell boundary error prop anchor",
    );
  }
  let patched = replaceOnce(
    text,
    "function En(e){return(0,Q.jsx)(wn,{onRetry:()=>{e.resetError()}})}",
    `${diagnosticDetailsHook()}function En(e){return(0,Q.jsx)(wn,{error:e.error,onRetry:()=>{e.resetError()}})}`,
    "app shell error fallback prop anchor",
  );
  patched = replaceOnce(
    patched,
    "children:[r,(0,Q.jsx)(Le,{color:`secondary`,size:`default`,onClick:n,children:i})]",
    "children:[r,CPXDiagnosticDetails({jsx:Q.jsx,error:e.error}),(0,Q.jsx)(Le,{color:`secondary`,size:`default`,onClick:n,children:i})]",
    "app shell error detail insertion anchor",
  );
  return patched;
}

function patchErrorBoundary(text) {
  if (
    !text.includes("function Xf(e){let t=(0,Vf.c)(9),{resetError:n}=e,r=ee(),i,a;") &&
    text.includes("function QUe(e){let t=(0,NP.c)(4),{onRetry:n,error:CPX_error}=e,")
  ) {
    return text;
  }
  if (
    !text.includes("function Xf(e){let t=(0,Vf.c)(9),{resetError:n}=e,r=ee(),i,a;") &&
    text.includes("function xdn(e){let t=(0,Cdn.c)(")
  ) {
    return text;
  }
  let patched = replaceOnce(
    text,
    "function Xf(e){let t=(0,Vf.c)(9),{resetError:n}=e,r=ee(),i,a;",
    `${diagnosticDetailsHook()}function Xf(e){let t=(0,Vf.c)(9),{resetError:n,error:CPX_error,componentStack:CPX_componentStack}=e,r=ee(),i,a;`,
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
  if (
    text.includes("function Vm(e){let t=(0,Gm.c)(57),") &&
    text.includes("return t[41]!==Y||t[42]!==H?(ne=(0,$.jsx)(`div`,{...H,children:Y})")
  ) {
    let patched = replaceOnce(
      text,
      "function Vm(e){let t=(0,Gm.c)(57),",
      `${projectColorHook()}function Vm(e){let t=(0,Gm.c)(57),`,
      "project color app main helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "q=(0,Km.jsxs)(`div`,{...v,...O,ref:n,className:j,role:`button`,",
      "q=(0,Km.jsxs)(`div`,{...v,...O,...CPXPR({projectId:_,label:p}),ref:n,className:j,role:`button`,",
      "project header row color attributes anchor",
    );
    return replaceOnce(
      patched,
      "ne=(0,$.jsx)(`div`,{...H,children:Y})",
      "ne=(0,$.jsx)(`div`,{...H,...CPXPR(a),children:Y})",
      "project group color render anchor",
    );
  }
  if (text.includes("function gg(e){let t=(0,Rg.c)(44),{threadKeys:n,")) {
    let patched = replaceOnce(
      text,
      "function gg(e){let t=(0,Rg.c)(44),",
      `${projectColorHook()}function gg(e){let t=(0,Rg.c)(44),`,
      "project color app main helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "X=(0,$.jsx)(`div`,{...H,children:ne})",
      "X=(0,$.jsx)(`div`,{...H,...CPXPR(a),children:ne})",
      "project group color render anchor",
    );
    return replaceOnce(
      patched,
      "(te=(0,Fh.jsxs)(`div`,{...v,...O,ref:n,className:j,role:`button`,tabIndex:M,",
      "(te=(0,Fh.jsxs)(`div`,{...v,...O,...CPXPR({projectId:_,label:p}),ref:n,className:j,role:`button`,tabIndex:M,",
      "current project header row color attributes anchor",
    );
  }
  let patched = replaceOnce(
    text,
    "function Pk(e){let t=(0,Q.c)(45),",
    `${projectColorHook()}function Pk(e){let t=(0,Q.c)(45),`,
    "project color app main helper insertion anchor",
  );
  patched = replaceOnce(
    patched,
    "ie=(0,Z.jsx)(`div`,{...H,children:re})",
    "ie=(0,Z.jsx)(`div`,{...H,...CPXPR(i),children:re})",
    "project group color render anchor",
  );
  patched = replaceOnce(
    patched,
    "Ke=(0,Z.jsx)(Oe,{rowAttributes:ke,className:Ae,collapsed:L,contentClassName:je,",
    "Ke=(0,Z.jsx)(Oe,{rowAttributes:{...ke,...CPXPR(n)},className:Ae,collapsed:L,contentClassName:je,",
    "project header row color attributes anchor",
  );
  patched = replaceOnce(
    patched,
    "(te=(0,Fh.jsxs)(`div`,{...v,...O,ref:n,className:j,role:`button`,tabIndex:M,",
    "(te=(0,Fh.jsxs)(`div`,{...v,...O,...CPXPR({projectId:_,label:p}),ref:n,className:j,role:`button`,tabIndex:M,",
    "current project header row color attributes anchor",
  );
  return patched;
}

function patchAppMainSidebarBlur(text) {
  if (text.includes("function vh(e){let t=(0,qh.c)(15),")) {
    return replaceOnce(
      text,
      "c=(0,$.jsx)(`span`,{className:`min-w-0 truncate pr-1`,children:n})",
      "c=(0,$.jsx)(`span`,{\"data-codex-plus-sidebar-name\":``,className:`min-w-0 truncate pr-1`,children:n})",
      "project header sidebar blur label anchor",
    );
  }
  if (!text.includes("openFolder:$y,toggleSidebar:$i,toggleTerminal:Md,")) {
    return replaceOnce(
      text,
      "se=(0,$.jsx)(`span`,{className:`flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap`,children:(0,$.jsx)(lg,{label:O,labelEnd:ae,labelTooltipContent:oe})})",
      "se=(0,$.jsx)(`span`,{\"data-codex-plus-sidebar-name\":``,className:`flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap`,children:(0,$.jsx)(lg,{label:O,labelEnd:ae,labelTooltipContent:oe})})",
      "project header sidebar blur label anchor",
    );
  }
  let patched = text;
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
    `children:[l,u,...(${commandMenuItemsExpression("suggested", "Z.jsx", "Zy", "Hp")}),(0,Z.jsx)(H_,{route:a,children:C})]`,
    "sidebar name blur command mount anchor",
  );
}

function patchHeader(text) {
  if (
    text.includes("function Jn(e){let t=(0,$n.c)(66),") &&
    text.includes("(0,$.jsx)(L,{color:`ghostActive`,type:`button`,onClick:u,")
  ) {
    let patched = replaceOnce(
      text,
      "function Jn(e){let t=(0,$n.c)(66),",
      `${threadHeaderHook()}function Jn(e){let t=(0,$n.c)(66),`,
      "thread header accessory helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "let x;t[35]!==c||t[36]!==g||t[37]!==i?",
      "let CPX_headerContext={cwd:null,hostId:null,header:{surface:`header`,titleText:typeof i==`string`?i:null}},CPX_headerAccessories=CPXThreadHeaderAccessories({context:CPX_headerContext,deps:{jsx:$.jsx,jsxs:$.jsxs,Tooltip:re}});let x;t[35]!==c||t[36]!==g||t[37]!==i?",
      "thread header accessory context anchor",
    );
    return replaceOnce(
      patched,
      "children:(0,$.jsx)(`span`,{className:`truncate`,children:i})})]}):",
      "children:(0,$.jsx)(`span`,{className:`truncate`,children:i})}),CPX_headerAccessories]}):",
      "thread header accessory render anchor",
    );
  }
  if (text.includes("function Jn(e){let t=(0,$n.c)(66),")) {
    let patched = replaceOnce(
      text,
      "function Jn(e){let t=(0,$n.c)(66),",
      `${threadHeaderHook()}function Jn(e){let t=(0,$n.c)(66),`,
      "thread header accessory helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "let x;t[35]!==c||t[36]!==g||t[37]!==i?(x=(0,$.jsx)(`div`,{className:`mr-3 line-clamp-1 flex min-w-0 flex-1 items-center gap-1 truncate`,style:{viewTransitionName:`header-title`},children:i?(0,$.jsxs)(`div`,{className:`flex min-w-0 flex-1 items-center gap-1`,children:[(0,$.jsx)(Qn,{onClick:c}),(0,$.jsx)(q,{color:`ghostActive`,type:`button`,onClick:u,className:`min-w-0 flex-1 truncate !px-0 !py-0 text-left text-sm text-token-foreground hover:!bg-transparent hover:opacity-80 electron:font-medium`,children:(0,$.jsx)(`span`,{className:`truncate`,children:i})})]}):(0,$.jsx)(`span`,{className:`text-token-description-foreground`,children:(0,$.jsx)(Zn,{mergedTasks:g,onBack:c,showBackButton:!0})})}),t[35]=c,t[36]=g,t[37]=i,t[38]=x):x=t[38];",
      "let CPX_headerContext={cwd:null,hostId:null,header:{surface:`header`,titleText:typeof i==`string`?i:null}},CPX_headerAccessories=CPXThreadHeaderAccessories({context:CPX_headerContext,deps:{jsx:$.jsx,jsxs:$.jsxs,Tooltip:me}});let x;t[35]!==c||t[36]!==g||t[37]!==i?(x=(0,$.jsx)(`div`,{className:`mr-3 line-clamp-1 flex min-w-0 flex-1 items-center gap-1 truncate`,style:{viewTransitionName:`header-title`},children:i?(0,$.jsxs)(`div`,{className:`flex min-w-0 flex-1 items-center gap-1`,children:[(0,$.jsx)(Qn,{onClick:c}),(0,$.jsx)(q,{color:`ghostActive`,type:`button`,onClick:u,className:`min-w-0 flex-1 truncate !px-0 !py-0 text-left text-sm text-token-foreground hover:!bg-transparent hover:opacity-80 electron:font-medium`,children:(0,$.jsx)(`span`,{className:`truncate`,children:i})}),CPX_headerAccessories]}):(0,$.jsx)(`span`,{className:`text-token-description-foreground`,children:(0,$.jsx)(Zn,{mergedTasks:g,onBack:c,showBackButton:!0})})}),t[35]=c,t[36]=g,t[37]=i,t[38]=x):x=t[38];",
      "thread header accessory render anchor",
    );
  }
  let patched = replaceOnce(
    text,
    `import{Z as r,a as i,s as a}from"./app-scope-CWE-zIhQ.js";`,
    `import{Z as r,a as i,a as CPX_readAtom,s as a}from"./app-scope-CWE-zIhQ.js";`,
    "thread header atom reader alias import anchor",
  );
  patched = replaceOnce(
    patched,
    `import{t as ee}from"./tooltip-B-u9JAuV.js";`,
    `import{t as ee,t as CPX_Tooltip}from"./tooltip-B-u9JAuV.js";`,
    "thread header tooltip alias import anchor",
  );
  patched = replaceOnce(
    patched,
    `import{t as _e}from"./dock-DAmmeMut.js";`,
    `import{t as _e}from"./dock-DAmmeMut.js";import{n as CPX_headerCwd,i as CPX_headerHostId}from"./${threadContextImportFile}";`,
    "thread header context import anchor",
  );
  patched = replaceOnce(
    patched,
    "function lt(e){let t=(0,Z.c)(68),",
    `${threadHeaderHook()}function lt(e){let t=(0,Z.c)(68),`,
    "thread header accessory helper insertion anchor",
  );
  patched = replaceOnce(
    patched,
    "let C;t[36]!==c||t[37]!==g||t[38]!==i?(C=(0,Q.jsx)(`div`,{className:`mr-3 line-clamp-1 flex min-w-0 flex-1 items-center gap-1 truncate`,style:{viewTransitionName:`header-title`},children:i?(0,Q.jsxs)(`div`,{className:`flex min-w-0 flex-1 items-center gap-1`,children:[(0,Q.jsx)(mt,{onClick:c}),(0,Q.jsx)(x,{color:`ghostActive`,type:`button`,onClick:u,className:`min-w-0 flex-1 truncate !px-0 !py-0 text-left text-sm text-token-foreground hover:!bg-transparent hover:opacity-80 electron:font-medium`,children:(0,Q.jsx)(`span`,{className:`truncate`,children:i})})]}):(0,Q.jsx)(`span`,{className:`text-token-description-foreground`,children:(0,Q.jsx)(pt,{mergedTasks:g,onBack:c,showBackButton:!0})})}),t[36]=c,t[37]=g,t[38]=i,t[39]=C):C=t[39];",
    "let CPX_headerContext={cwd:CPX_readAtom(CPX_headerCwd),hostId:CPX_readAtom(CPX_headerHostId)},CPX_headerAccessories=CPXThreadHeaderAccessories({context:CPX_headerContext,deps:{jsx:Q.jsx,jsxs:Q.jsxs,Tooltip:CPX_Tooltip}});let C;t[36]!==c||t[37]!==g||t[38]!==i?(C=(0,Q.jsx)(`div`,{className:`mr-3 line-clamp-1 flex min-w-0 flex-1 items-center gap-1 truncate`,style:{viewTransitionName:`header-title`},children:i?(0,Q.jsxs)(`div`,{className:`flex min-w-0 flex-1 items-center gap-1`,children:[(0,Q.jsx)(mt,{onClick:c}),(0,Q.jsx)(x,{color:`ghostActive`,type:`button`,onClick:u,className:`min-w-0 flex-1 truncate !px-0 !py-0 text-left text-sm text-token-foreground hover:!bg-transparent hover:opacity-80 electron:font-medium`,children:(0,Q.jsx)(`span`,{className:`truncate`,children:i})}),CPX_headerAccessories]}):(0,Q.jsx)(`span`,{className:`text-token-description-foreground`,children:(0,Q.jsx)(pt,{mergedTasks:g,onBack:c,showBackButton:!0})})}),t[36]=c,t[37]=g,t[38]=i,t[39]=C):C=t[39];",
    "thread header accessory render anchor",
  );
  return patched;
}

function patchThreadPageHeader(text) {
  let patched = text;
  patched = replaceOnce(
    patched,
    "function c(e){let t=(0,o.c)(21),",
    `${threadHeaderHook()}function c(e){let t=(0,o.c)(21),`,
    "thread page header helper insertion anchor",
  );
  patched = replaceOnce(
    patched,
    "let t=(0,o.c)(21),{start:c,startActions:l,env:u,secondary:d,trailing:f,hostConfig:p}=e,m;",
    "let t=(0,o.c)(21),{start:c,startActions:l,env:u,secondary:d,trailing:f,hostConfig:p,cwd:CPX_headerCwd}=e,CPX_headerContext={cwd:CPX_headerCwd,hostId:p?.id??null,header:{env:u,hostDisplayName:p?.display_name??null,startText:typeof c==`string`?c:null,secondaryText:typeof d==`string`?d:null,hasTrailing:f!=null}},CPX_headerAccessories=CPXThreadHeaderAccessories({context:CPX_headerContext,deps:{jsx:s.jsx,jsxs:s.jsxs}}),m;",
    "thread page header accessory render anchor",
  );
  patched = replaceOnce(
    patched,
    "t[8]!==l||t[9]!==v||t[10]!==y||t[11]!==b?(x=(0,s.jsxs)(`div`,{className:`text-md flex min-w-0 items-center gap-2 truncate text-base electron:font-medium`,children:[v,y,b,l]}),t[8]=l,t[9]=v,t[10]=y,t[11]=b,t[12]=x):x=t[12]",
    "t[8]!==l||t[9]!==v||t[10]!==y||t[11]!==b?(x=(0,s.jsxs)(`div`,{className:`text-md flex min-w-0 items-center gap-2 truncate text-base electron:font-medium`,children:[v,y,b,CPX_headerAccessories,l]}),t[8]=l,t[9]=v,t[10]=y,t[11]=b,t[12]=x):x=t[12]",
    "thread page header accessory mount anchor",
  );
  return patched;
}

function patchLocalConversationPageHeader(text) {
  if (text.includes("function pi(e){let t=(0,W.c)(32),")) {
    let patched = replaceOnce(
      text,
      "function pi(e){let t=(0,W.c)(32),",
      `${threadHeaderHook()}function pi(e){let t=(0,W.c)(32),`,
      "local conversation header helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "let k;t[26]===Symbol.for(`react.memo_cache_sentinel`)?(k=null,t[26]=k):k=t[26];",
      "let CPX_headerContext={cwd:p,hostId:null,header:{surface:`local-conversation`,titleText:typeof c==`string`?c:null,projectName:s??null}},k=CPXThreadHeaderAccessories({context:CPX_headerContext,deps:{jsx:G.jsx,jsxs:G.jsxs,Tooltip:ht}});",
      "local conversation header accessory render anchor",
    );
    return patched;
  }
  if (text.includes("function mi(e){let t=(0,U.c)(32),")) {
    let patched = replaceOnce(
      text,
      "function mi(e){let t=(0,U.c)(32),",
      `${threadHeaderHook()}function mi(e){let t=(0,U.c)(32),`,
      "local conversation header helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "let t=(0,U.c)(32),{conversationId:n,getConversationMarkdown:r,markdownParentConversationId:i,projectIcon:a,projectHoverCardContent:s,projectName:c,title:l,titleSuffix:u,cwd:d,canPin:f,hideForkActions:p}=e,g=f===void 0?!0:f,_=N(),v=h(),y;",
      "let t=(0,U.c)(32),{conversationId:n,getConversationMarkdown:r,markdownParentConversationId:i,projectIcon:a,projectHoverCardContent:s,projectName:c,title:l,titleSuffix:u,cwd:d,canPin:f,hideForkActions:p}=e,CPX_headerContext={cwd:d,hostId:null,header:{surface:`local-conversation`,titleText:typeof l==`string`?l:null,projectName:c??null}},CPX_headerAccessories=CPXThreadHeaderAccessories({context:CPX_headerContext,deps:{jsx:W.jsx,jsxs:W.jsxs,Tooltip:wt}}),g=f===void 0?!0:f,_=N(),v=h(),y;",
      "local conversation header accessory render anchor",
    );
    patched = replaceOnce(
      patched,
      "let O;t[26]===Symbol.for(`react.memo_cache_sentinel`)?(O=null,t[26]=O):O=t[26];",
      "let O=CPX_headerAccessories;",
      "local conversation header accessory slot anchor",
    );
    return replaceOnce(
      patched,
      "let k;return t[27]!==C||t[28]!==T||t[29]!==E||t[30]!==D?(k=(0,W.jsx)(`div`,{className:`draggable grid w-full min-w-0 grid-cols-[minmax(0,1fr)] items-center gap-x-4 electron:h-toolbar extension:py-row-y`,children:(0,W.jsxs)(`div`,{className:`flex min-w-0 items-center gap-2 truncate text-base electron:font-medium`,children:[C,T,E,D,O]})}),t[27]=C,t[28]=T,t[29]=E,t[30]=D,t[31]=k):k=t[31],k}",
      "let k;return t[27]!==C||t[28]!==T||t[29]!==E||t[30]!==D?(k=(0,W.jsx)(`div`,{className:`draggable grid w-full min-w-0 grid-cols-[minmax(0,1fr)] items-center gap-x-4 electron:h-toolbar extension:py-row-y`,children:(0,W.jsxs)(`div`,{className:`flex min-w-0 items-center gap-2 truncate text-base electron:font-medium`,children:[C,T,E,D,O]})}),t[27]=C,t[28]=T,t[29]=E,t[30]=D,t[31]=k):k=t[31],k}",
      "local conversation header accessory mount anchor",
    );
  }
  let patched = replaceOnce(
    text,
    "function Tt(e){let t=(0,Y.c)(42),",
    `${threadHeaderHook()}function Tt(e){let t=(0,Y.c)(42),`,
    "local conversation header helper insertion anchor",
  );
  patched = replaceOnce(
    patched,
    "let t=(0,Y.c)(42),{conversationId:n,getConversationMarkdown:r,markdownParentConversationId:a,title:o,titleSuffix:s,cwd:c,canPin:l,hideProjectMetadata:d,hideForkActions:f}=e,p=l===void 0?!0:l,m=d===void 0?!1:d,h=A(),g;",
    "let t=(0,Y.c)(42),{conversationId:n,getConversationMarkdown:r,markdownParentConversationId:a,title:o,titleSuffix:s,cwd:c,canPin:l,hideProjectMetadata:d,hideForkActions:f}=e,CPX_headerContext={cwd:c,hostId:u(i(O,n)).id,header:{surface:`local-conversation`,titleText:typeof o==`string`?o:null}},CPX_headerAccessories=CPXThreadHeaderAccessories({context:CPX_headerContext,deps:{jsx:Z.jsx,jsxs:Z.jsxs}}),p=l===void 0?!0:l,m=d===void 0?!1:d,h=A(),g;",
    "local conversation header accessory render anchor",
  );
  patched = replaceOnce(
    patched,
    "t[38]!==F||t[39]!==I||t[40]!==L?(z=(0,Z.jsx)(`div`,{className:`draggable grid w-full min-w-0 grid-cols-[minmax(0,1fr)] items-center gap-x-4 electron:h-toolbar extension:py-row-y`,children:(0,Z.jsxs)(`div`,{className:`flex min-w-0 items-center gap-2 truncate text-base electron:font-medium`,children:[F,I,L,R]})}),t[38]=F,t[39]=I,t[40]=L,t[41]=z):z=t[41]",
    "t[38]!==F||t[39]!==I||t[40]!==L?(z=(0,Z.jsx)(`div`,{className:`draggable grid w-full min-w-0 grid-cols-[minmax(0,1fr)] items-center gap-x-4 electron:h-toolbar extension:py-row-y`,children:(0,Z.jsxs)(`div`,{className:`flex min-w-0 items-center gap-2 truncate text-base electron:font-medium`,children:[F,I,L,CPX_headerAccessories,R]})}),t[38]=F,t[39]=I,t[40]=L,t[41]=z):z=t[41]",
    "local conversation header accessory mount anchor",
  );
  return patched;
}

function patchGeneralSettingsUserBubbleColors(text) {
  if (
    text.includes("function Lr({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){") &&
    text.includes("children:[T.map(e=>(0,J.jsx)(L,{control:(0,J.jsx)(Hr,{ariaLabel:e.ariaLabel,value:y[e.role],onChange:t=>{k(e.role,t)}}),label:e.label,variant:`nested`},e.role)),E.map")
  ) {
    let patched = replaceOnce(
      text,
      "function Lr({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){",
      `${appearanceSettingsHook("{React:ti,jsx:J.jsx,SettingRow:L,ColorInput:Hr,Switch:Ze}")}function Lr({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){`,
      "user bubble settings helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "children:[T.map(e=>(0,J.jsx)(L,{control:(0,J.jsx)(Hr,{ariaLabel:e.ariaLabel,value:y[e.role],onChange:t=>{k(e.role,t)}}),label:e.label,variant:`nested`},e.role)),E.map",
      "children:[T.map(e=>(0,J.jsx)(L,{control:(0,J.jsx)(Hr,{ariaLabel:e.ariaLabel,value:y[e.role],onChange:t=>{k(e.role,t)}}),label:e.label,variant:`nested`},e.role)),...CPXAppearanceRows(n),E.map",
      "user bubble settings row anchor",
    );
  }
  if (text.includes("function Lr({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){")) {
    let patched = replaceOnce(
      text,
      "function Lr({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){",
      `${appearanceSettingsHook("{React:ti,jsx:J.jsx,SettingRow:L,ColorInput:Hr,Switch:qt}")}function Lr({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){`,
      "user bubble settings helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "children:[E.map(e=>(0,J.jsx)(L,{control:(0,J.jsx)(Hr,{ariaLabel:e.ariaLabel,value:b[e.role],onChange:t=>{O(e.role,t)}}),label:e.label,variant:`nested`},e.role)),D.map",
      "children:[E.map(e=>(0,J.jsx)(L,{control:(0,J.jsx)(Hr,{ariaLabel:e.ariaLabel,value:b[e.role],onChange:t=>{O(e.role,t)}}),label:e.label,variant:`nested`},e.role)),...CPXAppearanceRows(n),D.map",
      "user bubble settings row anchor",
    );
  }
  let patched = replaceOnce(
    text,
    "function tn({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){",
    `${appearanceSettingsHook()}function tn({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){`,
    "user bubble settings helper insertion anchor",
  );
  return replaceOnce(
    patched,
    "children:[D.map(e=>(0,Z.jsx)(J,{control:(0,Z.jsx)(sn,{ariaLabel:e.ariaLabel,value:x[e.role],onChange:t=>{k(e.role,t)}}),label:e.label,variant:`nested`},e.role)),O.map",
    "children:[D.map(e=>(0,Z.jsx)(J,{control:(0,Z.jsx)(sn,{ariaLabel:e.ariaLabel,value:x[e.role],onChange:t=>{k(e.role,t)}}),label:e.label,variant:`nested`},e.role)),...CPXAppearanceRows(n),O.map",
    "user bubble settings row anchor",
  );
}

function patchUserMessageAttachmentsBubbleColors(text) {
  if (text.includes("function xst({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){")) {
    let patched = replaceOnce(
      text,
      "function xst({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){",
      `${messageComposerHook()}function xst({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){`,
      "user bubble helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "return(0,HK.jsx)(`form`,{className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),v()},children:",
      "return(0,HK.jsx)(`form`,{\"data-codex-plus-user-entry\":!0,className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),v()},children:",
      "edit user message entry marker anchor",
    );
    return replaceOnce(
      patched,
      "fe=V?(0,KK.jsx)(`div`,{className:`w-full p-px`,children:(0,KK.jsx)(xst,{cwd:x??null,hostId:S,initialMessage:z.trim(),onCancel:()=>{ne(null)},onDraftChange:e=>{ne(e)},onSubmit:ie})}):q?(0,KK.jsx)(`div`,{\"data-user-message-bubble\":!0,role:I?`button`:void 0,",
      "fe=V?(0,KK.jsx)(`div`,{className:`w-full p-px`,children:(0,KK.jsx)(xst,{cwd:x??null,hostId:S,initialMessage:z.trim(),onCancel:()=>{ne(null)},onDraftChange:e=>{ne(e)},onSubmit:ie})}):q?(0,KK.jsx)(`div`,{\"data-user-message-bubble\":!0,...CPXBubbleProps({}),role:I?`button`:void 0,",
      "user bubble marker attribute anchor",
    );
  }
  if (text.includes("function qVn({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){")) {
    let patched = replaceOnce(
      text,
      "function qVn({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){",
      `${messageComposerHook()}function qVn({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){`,
      "user bubble helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "return(0,b1.jsx)(`form`,{className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),v()},children:",
      "return(0,b1.jsx)(`form`,{\"data-codex-plus-user-entry\":!0,className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),v()},children:",
      "edit user message entry marker anchor",
    );
    return replaceOnce(
      patched,
      "me=B?(0,S1.jsx)(`div`,{className:`w-full p-px`,children:(0,S1.jsx)(qVn,{cwd:x??null,hostId:S,initialMessage:z.trim(),onCancel:()=>{ie(null)},onDraftChange:e=>{ie(e)},onSubmit:oe})}):G?(0,S1.jsx)(`div`,{\"data-user-message-bubble\":!0,role:I?`button`:void 0,tabIndex:0,className:Y(e,`text-left focus-visible:ring-2 focus-visible:ring-token-focus-border focus-visible:outline-none`,I&&`cursor-interaction`),",
      "me=B?(0,S1.jsx)(`div`,{className:`w-full p-px`,children:(0,S1.jsx)(qVn,{cwd:x??null,hostId:S,initialMessage:z.trim(),onCancel:()=>{ie(null)},onDraftChange:e=>{ie(e)},onSubmit:oe})}):G?(0,S1.jsx)(`div`,{\"data-user-message-bubble\":!0,...CPXBubbleProps({}),role:I?`button`:void 0,tabIndex:0,className:Y(e,`text-left focus-visible:ring-2 focus-visible:ring-token-focus-border focus-visible:outline-none`,I&&`cursor-interaction`),",
      "user bubble marker attribute anchor",
    );
  }
  let patched = replaceOnce(
    text,
    "var Z=i(),Q=e(n(),1),$=r();function Ue(e){",
    `var Z=i(),Q=e(n(),1),$=r();${messageComposerHook()}function Ue(e){`,
    "user bubble helper insertion anchor",
  );
  patched = replaceOnce(
    patched,
    "Se=W?(0,$.jsx)(`div`,{className:`w-full p-px`,children:(0,$.jsx)(it,{cwd:T??null,hostId:k,initialMessage:U.trim(),onCancel:()=>{q(null)},onDraftChange:e=>{q(e)},onSubmit:ge})}):le?(0,$.jsx)(`div`,{\"data-user-message-bubble\":!0,role:H?`button`:void 0,tabIndex:0,className:D(e,`text-left focus-visible:ring-2 focus-visible:ring-token-focus-border focus-visible:outline-none`,H&&`cursor-interaction`),",
    "Se=W?(0,$.jsx)(`div`,{className:`w-full p-px`,children:(0,$.jsx)(it,{cwd:T??null,hostId:k,initialMessage:U.trim(),onCancel:()=>{q(null)},onDraftChange:e=>{q(e)},onSubmit:ge})}):le?(0,$.jsx)(`div`,{\"data-user-message-bubble\":!0,...CPXBubbleProps({}),role:H?`button`:void 0,tabIndex:0,className:D(e,`text-left focus-visible:ring-2 focus-visible:ring-token-focus-border focus-visible:outline-none`,H&&`cursor-interaction`),",
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
  if (text.includes("\"data-user-message-bubble\":!0,...CPXBubbleProps({}),role:I?`button`:void 0,")) {
    return replaceOnce(
      text,
      "\"data-user-message-bubble\":!0,...CPXBubbleProps({}),role:I?`button`:void 0,",
      "\"data-user-message-bubble\":!0,...CPXBubbleProps({project:{cwd:x,hostId:S}}),role:I?`button`:void 0,",
      "user bubble project marker attribute anchor",
    );
  }
  let patched = replaceOnce(
    text,
    `import{Aa as x,Ta as S}from"./${srcFile}";`,
    `import{Aa as x,Ta as S}from"./${srcFile}";import{t as CPX_localThreadKey}from"./${sidebarThreadKeysFile}";import{s as CPX_threadProjectId}from"./${sidebarThreadRowSignalsFile}";`,
    "user bubble project assignment imports anchor",
  );
  patched = replaceOnce(
    patched,
    "hasExternalAttachments:b,commentCount:ee,onEditMessage:x,threadId:S,turnId:w,cwd:T,hostId:k}=e,M=a===void 0?!1:a,",
    "hasExternalAttachments:b,commentCount:ee,onEditMessage:x,threadId:S,turnId:w,cwd:T,hostId:k}=e,CPX_userMessageProjectId=o(CPX_threadProjectId,S==null?null:CPX_localThreadKey(S)),M=a===void 0?!1:a,",
    "user bubble project assignment style anchor",
  );
  return replaceOnce(
    patched,
    "\"data-user-message-bubble\":!0,...CPXBubbleProps({}),role:H?`button`:void 0,",
    "\"data-user-message-bubble\":!0,...CPXBubbleProps({project:CPX_userMessageProjectId}),role:H?`button`:void 0,",
    "user bubble project marker attribute anchor",
  );
}

function patchComposerBubbleColors(text) {
  if (text.includes("function FN(e){let t=(0,YN.c)(13),")) {
    let patched = replaceOnce(
      text,
      "function FN(e){let t=(0,YN.c)(13),",
      `${messageComposerHook()}function FN(e){let t=(0,YN.c)(13),`,
      "composer user bubble helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "function FN(e){let t=(0,YN.c)(13),{children:n,className:r,externalFooterVariant:i,inert:a,isDragActive:o,layout:s,onDragEnter:c,onDragLeave:l,onDragOver:u,onDrop:d}=e,",
      "function FN(e){let t=(0,YN.c)(13),{children:n,className:r,externalFooterVariant:i,inert:a,isDragActive:o,layout:s,onDragEnter:c,onDragLeave:l,onDragOver:u,onDrop:d,...CPX_surfaceProps}=e,CPX_resolvedSurfaceProps=Object.keys(CPX_surfaceProps).length===0?CPXSurfaceProps({}):CPX_surfaceProps,",
      "composer host surface props anchor",
    );
    return replaceOnce(
      patched,
      "return t[5]!==n||t[6]!==a||t[7]!==c||t[8]!==l||t[9]!==u||t[10]!==d||t[11]!==v?(y=(0,XN.jsx)(Fm.div,{inert:a,className:v,onDragEnter:c,onDragOver:u,onDragLeave:l,onDrop:d,children:n}),t[5]=n,t[6]=a,t[7]=c,t[8]=l,t[9]=u,t[10]=d,t[11]=v,t[12]=y):y=t[12],y}",
      "return t[5]!==n||t[6]!==a||t[7]!==c||t[8]!==l||t[9]!==u||t[10]!==d||t[11]!==v?(y=(0,XN.jsx)(Fm.div,{inert:a,...CPX_resolvedSurfaceProps,className:v,onDragEnter:c,onDragOver:u,onDragLeave:l,onDrop:d,children:n}),t[5]=n,t[6]=a,t[7]=c,t[8]=l,t[9]=u,t[10]=d,t[11]=v,t[12]=y):y=t[12],y}",
      "composer user entry marker render anchor",
    );
  }
  if (
    text.includes("function Ss(e){if(H?.type!==`local`") &&
    text.includes("(0,iW.jsx)(eW,{className:A,externalFooterVariant:k,hasDropTargetPortal:fc,")
  ) {
    let patched = replaceOnce(
      text,
      "function Ss(e){if(H?.type!==`local`",
      `${messageComposerHook()}function Ss(e){if(H?.type!==\`local\``,
      "composer user bubble helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "(0,iW.jsx)(eW,{className:A,externalFooterVariant:k,hasDropTargetPortal:fc,",
      "(0,iW.jsx)(eW,{...CPXSurfaceProps({}),className:A,externalFooterVariant:k,hasDropTargetPortal:fc,",
      "composer user entry marker render anchor",
    );
  }
  if (text.includes("function Wbe(e){let t=(0,gW.c)(13),")) {
    let patched = replaceOnce(
      text,
      "function Wbe(e){let t=(0,gW.c)(13),",
      `${messageComposerHook()}function Wbe(e){let t=(0,gW.c)(13),`,
      "composer user bubble helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "function Wbe(e){let t=(0,gW.c)(13),{children:n,className:r,externalFooterVariant:i,inert:a,isDragActive:o,layout:s,onDragEnter:c,onDragLeave:l,onDragOver:u,onDrop:d}=e,",
      "function Wbe(e){let t=(0,gW.c)(13),{children:n,className:r,externalFooterVariant:i,inert:a,isDragActive:o,layout:s,onDragEnter:c,onDragLeave:l,onDragOver:u,onDrop:d,codexPlusProps:CPX_surfaceProps}=e,CPX_resolvedSurfaceProps=CPX_surfaceProps??CPXSurfaceProps({}),",
      "composer host surface props anchor",
    );
    return replaceOnce(
      patched,
      "return t[5]!==n||t[6]!==a||t[7]!==c||t[8]!==l||t[9]!==u||t[10]!==d||t[11]!==v?(y=(0,_W.jsx)(Su.div,{inert:a,className:v,onDragEnter:c,onDragOver:u,onDragLeave:l,onDrop:d,children:n}),t[5]=n,t[6]=a,t[7]=c,t[8]=l,t[9]=u,t[10]=d,t[11]=v,t[12]=y):y=t[12],y}",
      "return t[5]!==n||t[6]!==a||t[7]!==c||t[8]!==l||t[9]!==u||t[10]!==d||t[11]!==v?(y=(0,_W.jsx)(Su.div,{inert:a,...CPX_resolvedSurfaceProps,className:v,onDragEnter:c,onDragOver:u,onDragLeave:l,onDrop:d,children:n}),t[5]=n,t[6]=a,t[7]=c,t[8]=l,t[9]=u,t[10]=d,t[11]=v,t[12]=y):y=t[12],y}",
      "composer user entry marker render anchor",
    );
  }
  let patched = replaceOnce(
    text,
    "function oh(e){let t=(0,$.c)(13),",
    `${messageComposerHook()}function oh(e){let t=(0,$.c)(13),`,
    "composer user bubble helper insertion anchor",
  );
  patched = replaceOnce(
    patched,
    "function oh(e){let t=(0,$.c)(13),{children:n,className:r,externalFooterVariant:i,inert:a,isDragActive:o,layout:s,onDragEnter:c,onDragLeave:l,onDragOver:u,onDrop:d}=e,",
    "function oh(e){let t=(0,$.c)(13),{children:n,className:r,externalFooterVariant:i,inert:a,isDragActive:o,layout:s,onDragEnter:c,onDragLeave:l,onDragOver:u,onDrop:d,codexPlusProps:CPX_surfaceProps}=e,CPX_resolvedSurfaceProps=CPX_surfaceProps??CPXSurfaceProps({}),",
    "composer host surface props anchor",
  );
  patched = replaceOnce(
    patched,
    "return t[5]!==n||t[6]!==a||t[7]!==c||t[8]!==l||t[9]!==u||t[10]!==d||t[11]!==v?(y=(0,Q.jsx)(Jt.div,{inert:a,className:v,onDragEnter:c,onDragOver:u,onDragLeave:l,onDrop:d,children:n}),t[5]=n,t[6]=a,t[7]=c,t[8]=l,t[9]=u,t[10]=d,t[11]=v,t[12]=y):y=t[12],y}",
    "return t[5]!==n||t[6]!==a||t[7]!==c||t[8]!==l||t[9]!==u||t[10]!==d||t[11]!==v?(y=(0,Q.jsx)(Jt.div,{inert:a,...CPX_resolvedSurfaceProps,className:v,onDragEnter:c,onDragOver:u,onDragLeave:l,onDrop:d,children:n}),t[5]=n,t[6]=a,t[7]=c,t[8]=l,t[9]=u,t[10]=d,t[11]=v,t[12]=y):y=t[12],y}",
    "composer user entry marker render anchor",
  );
  return patched;
}

function patchComposerProjectColors(text) {
  if (text.includes("(0,iW.jsx)(eW,{className:A,externalFooterVariant:k,hasDropTargetPortal:fc,")) {
    return replaceOnce(
      text,
      "(0,iW.jsx)(eW,{className:A,externalFooterVariant:k,hasDropTargetPortal:fc,",
      "(0,iW.jsx)(eW,{...CPXSurfaceProps({project:{cwd:fn,hostId:sr}}),className:A,externalFooterVariant:k,hasDropTargetPortal:fc,",
      "composer project accent style caller anchor",
    );
  }
  if (text.includes("function Wbe(e){let t=(0,gW.c)(13),") && text.includes("CPX_resolvedSurfaceProps=CPX_surfaceProps??CPXSurfaceProps({})")) {
    let patched = text;
    patched = replaceOnce(
      patched,
      anchors.composerProjectStyleCaller,
      anchors.composerProjectStyleCaller.replace(";return", ",CPX_composerSurfaceProps=CPXSurfaceProps({project:{cwd:ln??an,hostId:$n}});return"),
      "composer project style hook-safe caller anchor",
    );
    return replaceOnce(
      patched,
      "(0,PY.jsx)(sEe,{className:w,externalFooterVariant:C,hasDropTargetPortal:As,",
      "(0,PY.jsx)(sEe,{key:CPX_composerSurfaceProps?.[`data-codex-plus-project-color`]??``,className:w,externalFooterVariant:C,codexPlusProps:CPX_composerSurfaceProps,hasDropTargetPortal:As,",
      "composer project accent style caller anchor",
    );
  }
  let patched = replaceOnce(
    text,
    anchors.composerProjectImports,
    `${anchors.composerProjectImports}import{t as CPX_localThreadKey}from"./${sidebarThreadKeysFile}";import{s as CPX_threadProjectId}from"./${sidebarThreadRowSignalsFile}";`,
    "composer project assignment imports anchor",
  );
  patched = replaceOnce(
    patched,
    anchors.composerProjectStyleCaller,
    anchors.composerProjectStyleCaller.replace(";return", ",CPX_composerThreadProjectId=a(CPX_threadProjectId,G==null?null:CPX_localThreadKey(G)),CPX_composerSurfaceProps=CPXSurfaceProps({project:G==null?On?{hostId:On.hostId,path:On.remotePath,projectId:kn,label:On.label??On.name}:x??void 0:CPX_composerThreadProjectId});return"),
    "composer project style hook-safe caller anchor",
  );
  return replaceOnce(
    patched,
    anchors.composerProjectAccentCaller,
    anchors.composerProjectAccentCaller.replace(",onDragEnter:", ",key:CPX_composerSurfaceProps?.[`data-codex-plus-project-color`]??``,codexPlusProps:!Ge&&!Hn?CPX_composerSurfaceProps:void 0,onDragEnter:"),
    "composer project accent style caller anchor",
  );
}

function patchElectronMenuShortcuts(text) {
  return replaceOnce(
    text,
    "{id:`toggleSidebar`,titleIntlId:`codex.command.toggleSidebar`,descriptionIntlId:`codex.commandDescription.toggleSidebar`,commandMenuGroupKey:`panels`,commandMenu:!0,electron:{menuTitle:`Toggle Sidebar`,menuTitleIntlId:`codex.commandMenuTitle.toggleSidebar`,defaultKeybindings:[{key:`CmdOrCtrl+B`}]}},{id:`toggleBottomPanel`,",
    "{id:`toggleSidebar`,titleIntlId:`codex.command.toggleSidebar`,descriptionIntlId:`codex.commandDescription.toggleSidebar`,commandMenuGroupKey:`panels`,commandMenu:!0,electron:{menuTitle:`Toggle Sidebar`,menuTitleIntlId:`codex.commandMenuTitle.toggleSidebar`,defaultKeybindings:[{key:`CmdOrCtrl+B`}]}},{id:`codexPlus.focusProjectSelector`,title:`Focus project selector`,description:`Focus or open the new chat project selector`,commandMenuGroupKey:`workspace`,commandMenu:!0,electron:{menuTitle:`Focus project selector`,defaultKeybindings:[{key:`CmdOrCtrl+.`}]}},{id:`codexPlusToggleSidebarNameBlur`,title:`Toggle sidebar blur`,description:`Blur or show sidebar chat and project names`,commandMenuGroupKey:`panels`,commandMenu:!0,electron:{menuTitle:`Toggle sidebar blur`,defaultKeybindings:[]}},...(globalThis.CodexPlus?.ui?.commands?.commandMetadata?.()?.filter?.(e=>e.id!==`codexPlus.focusProjectSelector`&&e.id!==`codexPlusToggleSidebarNameBlur`)??[]),{id:`toggleBottomPanel`,",
    "sidebar blur command palette metadata anchor",
  );
}

function patchKeyboardShortcutsSearchInput(text) {
  if (text.includes("function qX(e,t){return`titleIntlId`in e?")) {
    return replaceOnce(
      text,
      "function qX(e,t){return`titleIntlId`in e?YX(XX,e.titleIntlId)?t.formatMessage(XX[e.titleIntlId]):``:t.formatMessage(ZX[e.electron.menuTitleIntlId])}",
      "function qX(e,t){return`titleIntlId`in e?YX(XX,e.titleIntlId)?t.formatMessage(XX[e.titleIntlId]):``:e.title??e.electron?.menuTitle??t.formatMessage(ZX[e.electron.menuTitleIntlId])}",
      "generic command metadata title fallback anchor",
    );
  }
  if (text.includes("function Kke(e,t){return`titleIntlId`in e?")) {
    return replaceOnce(
      text,
      "function Kke(e,t){return`titleIntlId`in e?S0(C0,e.titleIntlId)?t.formatMessage(C0[e.titleIntlId]):``:t.formatMessage(w0[e.electron.menuTitleIntlId])}",
      "function Kke(e,t){return`titleIntlId`in e?S0(C0,e.titleIntlId)?t.formatMessage(C0[e.titleIntlId]):``:e.title??e.electron?.menuTitle??t.formatMessage(w0[e.electron.menuTitleIntlId])}",
      "generic command metadata title fallback anchor",
    );
  }
  return replaceOnce(
    text,
    "function d(e,t){return`titleIntlId`in e?t.formatMessage(c[e.titleIntlId]):t.formatMessage(l[e.electron.menuTitleIntlId])}",
    "function d(e,t){return`titleIntlId`in e?t.formatMessage(c[e.titleIntlId]):e.title??e.electron?.menuTitle??t.formatMessage(l[e.electron.menuTitleIntlId])}",
    "generic command metadata title fallback anchor",
  );
}

function patchCommandMenuRuntimeCommands(text) {
  if (text.includes("let m=ne?N.filter(VZ):N,_;")) {
    return replaceOnce(
      text,
      "let m=ne?N.filter(VZ):N,_;",
      "let m=[...(ne?N.filter(VZ):N),...(globalThis.CodexPlus?.ui?.commands?.commandMetadata?.()?.filter?.(e=>!N.some(t=>t.id===e.id))??[])],_;",
      "command menu runtime command metadata anchor",
    );
  }
  return replaceOnce(
    text,
    "let M=j,N;t[11]===o?N=t[12]:",
    "let M=[...j,...(globalThis.CodexPlus?.ui?.commands?.commandMetadata?.()?.filter?.(e=>!j.some(t=>t.id===e.id))??[])],N;t[11]===o?N=t[12]:",
    "command menu runtime command metadata anchor",
  );
}

function patchLocalTaskRow(text) {
  if (text.includes("function Ef(e){let t=(0,Of.c)(134),")) {
    let patched = replaceOnce(
      text,
      "function Ef(e){let t=(0,Of.c)(134),",
      `${projectColorHook()}function Ef(e){let t=(0,Of.c)(134),`,
      "local task row project color helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "threadSummary:le,dataAttributes:ue}=e,de=l===void 0?!1:l,",
      "threadSummary:le,dataAttributes:ue=CPXPR({projectId:oe,label:se,path:r,cwd:r})}=e,de=l===void 0?!1:l,",
      "local task row project assignment anchor",
    );
  }
  if (text.includes("function _p(e){let t=(0,yp.c)(134),")) {
    let patched = replaceOnce(
      text,
      "function _p(e){let t=(0,yp.c)(134),",
      `${projectColorHook()}function _p(e){let t=(0,yp.c)(134),`,
      "local task row project color helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "threadSummary:le,dataAttributes:ue}=e,de=c===void 0?!1:c,",
      "threadSummary:le,dataAttributes:ue=CPXPR({projectId:oe,label:se,path:r,cwd:r,hostId:R?.id})}=e,de=c===void 0?!1:c,",
      "local task row project assignment anchor",
    );
    return patched;
  }
  let patched = replaceOnce(
    text,
    "function fn(e){let t=(0,K.c)(124),",
    `${projectColorHook()}function fn(e){let t=(0,K.c)(124),`,
    "local task row project color helper insertion anchor",
  );
  patched = replaceOnce(
    patched,
    "threadSummary:Ne,dataAttributes:Fe}=e,Ie=g===void 0?!1:g,",
    "threadSummary:Ne,dataAttributes:Fe=CPXPR(Oe)}=e,Ie=g===void 0?!1:g,",
    "local task row project assignment anchor",
  );
  return patched;
}

function patchMermaidDiagramShell(text) {
  if (text.includes("function xbe(e){let t=(0,E2.c)(19),")) {
    let patched = replaceOnce(
      text,
      "function xbe(e){let t=(0,E2.c)(19),",
      `${mermaidDiagramHook()}function xbe(e){let t=(0,E2.c)(19),`,
      "mermaid diagram shell helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "E=(0,O2.jsx)(`div`,{ref:d,className:C,\"data-wide-markdown-block\":w,\"data-wide-markdown-block-kind\":c,children:T})",
      "E=(0,O2.jsx)(`div`,{ref:d,...CPXMermaidDiagramProps({code:a}),className:C,\"data-wide-markdown-block\":w,\"data-wide-markdown-block-kind\":c,children:T})",
      "mermaid diagram shell host props anchor",
    );
  }
  if (text.includes("function or({blockRef:e,code:t,isCodeFenceOpen:n,isDark:r,isVisible:i,onError:a,onRendered:o,renderKey:s}){")) {
    let patched = replaceOnce(
      text,
      "function or({blockRef:e,code:t,isCodeFenceOpen:n,isDark:r,isVisible:i,onError:a,onRendered:o,renderKey:s}){",
      `${mermaidDiagramHook()}function or({blockRef:e,code:t,isCodeFenceOpen:n,isDark:r,isVisible:i,onError:a,onRendered:o,renderKey:s}){`,
      "mermaid diagram shell helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "(0,X.jsx)(`div`,{ref:u,className:re(vr,!i&&`invisible`,m?`max-h-[var(--markdown-wide-block-max-height)] overflow-auto`:`overflow-x-auto`),\"aria-hidden\":!i||void 0,",
      "(0,X.jsx)(`div`,{ref:u,...CPXMermaidDiagramProps({code:t}),className:re(vr,!i&&`invisible`,m?`max-h-[var(--markdown-wide-block-max-height)] overflow-auto`:`overflow-x-auto`),\"aria-hidden\":!i||void 0,",
      "mermaid diagram shell host props anchor",
    );
  }
  let patched = replaceOnce(
    text,
    "function d(e){let t=(0,s.c)(18),{Renderer:n,className:r,code:i,fallback:d,isCodeFenceOpen:f,wideBlockKind:p}=e,",
    `${mermaidDiagramHook()}function d(e){let t=(0,s.c)(18),{Renderer:n,className:r,code:i,fallback:d,isCodeFenceOpen:f,wideBlockKind:p}=e,`,
    "mermaid diagram shell helper insertion anchor",
  );
  return replaceOnce(
    patched,
    "O=(0,c.jsx)(`div`,{className:T,\"data-wide-markdown-block\":E,\"data-wide-markdown-block-kind\":p,children:D})",
    "O=(0,c.jsx)(`div`,{className:T,...CPXMermaidDiagramProps({code:i}),\"data-wide-markdown-block\":E,\"data-wide-markdown-block-kind\":p,children:D})",
    "mermaid diagram shell host props anchor",
  );
}

function patchPreloadNativeBridge(text) {
  return replaceOnce(
    text,
    "e.contextBridge.exposeInMainWorld(`codexWindowType`,m),e.contextBridge.exposeInMainWorld(`electronBridge`,D),typeof window<`u`",
    "e.contextBridge.exposeInMainWorld(`codexWindowType`,m),e.contextBridge.exposeInMainWorld(`electronBridge`,D),e.contextBridge.exposeInMainWorld(`codexPlusNative`,{request:(t,n)=>e.ipcRenderer.invoke(`codex_plus:native-request`,{method:t,params:n})}),typeof window<`u`",
    "codex plus native preload bridge anchor",
  );
}

function patchMainNativeBridge(text) {
  if (text.includes("function y4(e){let{") && text.includes("G2(l,k),V2(k);let A=!1;")) {
    let patched = replaceOnce(
      text,
      "function y4(e){let{",
      `${nativeMainHook()}function y4(e){let{`,
      "codex plus native main helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "G2(l,k),V2(k);let A=!1;",
      "G2(l,k),V2(k),CPXNative.registerNativeRequest({isTrustedIpcEvent:k});let A=!1;",
      "codex plus native main registration anchor",
    );
  }
  let patched = replaceOnce(
    text,
    "function z1(e){return a.ipcMain.handle(Tl,async(t,n)=>{",
    `${nativeMainHook()}function z1(e){return a.ipcMain.handle(Tl,async(t,n)=>{`,
    "codex plus native main helper insertion anchor",
  );
  return replaceOnce(
    patched,
    "v0({buildFlavor:i,getContextForWebContents:N.getContextForWebContents,isTrustedIpcEvent:te,usesOwlAppShell:y}),a.ipcMain.on(kl,",
    "v0({buildFlavor:i,getContextForWebContents:N.getContextForWebContents,isTrustedIpcEvent:te,usesOwlAppShell:y}),CPXNative.registerNativeRequest({isTrustedIpcEvent:te}),a.ipcMain.on(kl,",
    "codex plus native main registration anchor",
  );
}

function patchMainMenuDiagnostics(text) {
  let patched = replaceOnce(
    text,
    "He={...b(`toggleSidePanel`),click:async()=>{let e=await y();e&&_.sendMessageToWindow(e,{type:`toggle-diff-panel`})}},Ue=",
    "He={...b(`toggleSidePanel`),click:async()=>{let e=await y();e&&_.sendMessageToWindow(e,{type:`toggle-diff-panel`})}},Ue=",
    "codex plus menu template helper presence anchor",
  );
  patched = replaceOnce(
    patched,
    "He,We,{type:`separator`}",
    "He,We,...CPXNative.templateItems(`view-menu`),{type:`separator`}",
    "codex plus view menu template items anchor",
  );
  if (patched.includes("fe.refreshApplicationMenu(),w(`application menu refreshed`,A),")) {
    return replaceOnce(
      patched,
      "fe.refreshApplicationMenu(),w(`application menu refreshed`,A),",
      "CPXNative.setRefreshApplicationMenu(()=>fe.refreshApplicationMenu()),fe.refreshApplicationMenu(),CPXNative.logMenuDiagnostics(),w(`application menu refreshed`,A),",
      "codex plus menu diagnostics refresh anchor",
    );
  }
  return replaceOnce(
    patched,
    "me.refreshApplicationMenu(),w(`application menu refreshed`,A),",
    "CPXNative.setRefreshApplicationMenu(()=>me.refreshApplicationMenu()),me.refreshApplicationMenu(),CPXNative.logMenuDiagnostics(),w(`application menu refreshed`,A),",
    "codex plus menu diagnostics refresh anchor",
  );
}

return makePatchSet({
    id: config.id,
    codexVersion: config.codexVersion,
    bundleVersion: config.bundleVersion,
    asarSha256: config.asarSha256,
    assetFiles: codexPlusRuntimeAssets(config.runtimeConfig),
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
        [localTaskRowFile, patchLocalTaskRow],
        [userMessageAttachmentsFile, patchUserMessageAttachmentsProjectColors],
        [composerFile, patchComposerProjectColors],
      ],
    },
    ...(headerFile ? [{
      id: "project-path-header",
      fileTransforms: [
        [headerFile, patchHeader],
        ...(threadPageHeaderFile ? [[threadPageHeaderFile, patchThreadPageHeader]] : []),
        ...(localConversationPageFile ? [[localConversationPageFile, patchLocalConversationPageHeader]] : []),
      ],
    }] : []),
    {
      id: "sidebar-name-blur",
      fileTransforms: [
        [appMainFile, patchAppMainSidebarBlur],
        [electronMenuShortcutsFile, patchElectronMenuShortcuts],
        [keyboardShortcutsSearchInputFile, patchKeyboardShortcutsSearchInput],
        [keyboardShortcutsSearchInputFile, patchCommandMenuRuntimeCommands],
      ],
    },
    {
      id: "project-selector-shortcut",
      fileTransforms: [
        [localActiveWorkspaceRootDropdownFile, patchLocalActiveWorkspaceRootDropdownProjectSelectorShortcut],
        ...(homeProjectDropdownFile ? [[homeProjectDropdownFile, patchHomeProjectDropdownProjectSelectorShortcut]] : []),
        [runCommandFile, patchRunCommandProjectSelectorShortcut],
      ],
    },
    ...(statsigStartupFile ? [{
      id: "dev-mode-statsig-fallback",
      fileTransforms: [[statsigStartupFile, patchDevModeStatsigFallback]],
    }] : []),
    ...(mainFile ? [{
      id: "codex-plus-native-bridge",
      fileTransforms: [
        [preloadFile, patchPreloadNativeBridge],
        [mainFile, patchMainNativeBridge],
        ...(electronCommandSourceFile ? [[mainFile, patchMainMenuDiagnostics]] : []),
      ],
    }] : []),
    ...(mermaidDiagramShellFile ? [{
      id: "mermaid-fullscreen-viewer",
      fileTransforms: [[mermaidDiagramShellFile, patchMermaidDiagramShell]],
    }] : []),
    ],
  });
}

module.exports = {
  buildCodexPlusPatchSet,
};
