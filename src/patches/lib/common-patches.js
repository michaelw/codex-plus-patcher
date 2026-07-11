const { codexPlusRuntimeAssets } = require("../../runtime/assets");
const { sourceFamilyConfig } = require("../../core/app-identity");
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
  const sourceFamily = config.sourceFamily || "codex";
  const familyConfig = sourceFamilyConfig(sourceFamily);
  const appDisplayName = config.appDisplayName || familyConfig.displayName;
  const bundleIdentifier = config.bundleIdentifier || familyConfig.bundleIdentifier;
  const newTitle = `<title>${appDisplayName}</title><script src="./assets/codex-plus/runtime.js"></script>`;
  const titleFile = "webview/index.html";
  const workerFile = ".vite/build/worker.js";
  const preloadFile = ".vite/build/preload.js";
  const files = config.files;
  const anchors = config.anchors;
  const mainFile = files.main;
  const electronCommandSourceFile = files.electronCommandSource;
  const appMainFile = files.appMain;
  const appShellFile = files.appShell;
  const appProtocolFile = files.appProtocol;
  const errorBoundaryFile = files.errorBoundary;
  const generalSettingsFile = files.generalSettings;
  const headerFile = files.header;
  const threadPageHeaderFile = files.threadPageHeader;
  const localConversationPageFile = files.localConversationPage;
  const threadContextFile = files.threadContext;
  const threadContextImportFile = threadContextFile?.split("/").pop();
  const threadSidePanelTabsFile = files.threadSidePanelTabs;
  const reviewPanelFile = files.reviewPanel || threadSidePanelTabsFile;
  const threadSidePanelCoreFile = files.threadSidePanelCore;
  const userMessageAttachmentsFile = files.userMessageAttachments;
  const composerFile = files.composer;
  const runCommandInUserMessageAttachments = files.runCommandInUserMessageAttachments !== false;
  const localActiveWorkspaceRootDropdownFile = files.localActiveWorkspaceRootDropdown;
  const homeProjectDropdownFile = files.homeProjectDropdown;
  const runCommandFile = files.runCommand;
  const runCommandExtraFile = files.runCommandExtra;
  const localTaskRowFile = files.localTaskRow;
  const mermaidDiagramShellFile = files.mermaidDiagramShell;
  const electronMenuShortcutsFile = files.electronMenuShortcuts;
  const keyboardShortcutsSearchInputFile = files.keyboardShortcutsSearchInput;
  const keyboardShortcutsTitleFallbackFile = files.keyboardShortcutsTitleFallback || keyboardShortcutsSearchInputFile;
  const srcFile = files.src;
  const sidebarThreadKeysFile = files.sidebarThreadKeys;
  const sidebarThreadRowSignalsFile = files.sidebarThreadRowSignals;
  const branchPickerDropdownContentFile = files.branchPickerDropdownContent;
  const statsigStartupFile = files.statsigStartup;
  const localThreadCatalogStateFile = files.localThreadCatalogState;
  const chatGptStartupAnnouncementsFile = files.chatGptStartupAnnouncements;
  const enabledPatchIds = config.enabledPatches == null ? null : new Set(config.enabledPatches);

function patchTitle(text) {
  return replaceOnce(text, oldTitle, newTitle, `${oldTitle} in ${titleFile}`);
}

function patchAboutDialog(text, context = {}) {
  const aboutContext = {
    patcherRepoUrl: context.patcherRepoUrl || "https://github.com/michaelw/codex-plus-patcher",
    patcherGitSha: context.patcherGitSha || "unknown",
    patchedAppDisplayName: context.patchedAppDisplayName || appDisplayName,
    sourceAsarSha256: context.sourceAsarSha256 || "unknown",
    appliedPatches: context.appliedPatches || [],
  };
  if (text.includes("function m8({appDisplayName:e,buildInfoLabel:t,buildInfoText:n,iconDataUrl:r,isDark:i,okLabel:a,title:o})")) {
    let patched = replaceOnce(
      text,
      "let r=c.app.getName(),o=c.app.getVersion(),s=c8(o),",
      `let CPXAbout=${aboutMetadataRequire()}.aboutPayload(${JSON.stringify(aboutContext)}),r=CPXAbout.appDisplayName,o=c.app.getVersion(),s=c8(o),`,
      "about dialog app name anchor",
    );
    patched = replaceOnce(
      patched,
      "_=f.formatMessage({messageId:Q6,defaultMessage:$6}),v=l8(o),y=[...i.o()?[`Powered by Codex & OWL`]:[],g,...v].join(`\n`),",
      "_=f.formatMessage({messageId:Q6,defaultMessage:$6}),v=CPXAbout.buildInfoLines,y=[...i.o()?[`Powered by Codex & OWL`]:[],...v].join(`\n`),",
      "about dialog build information anchor",
    );
    patched = replaceOnce(
      patched,
      "m8({appDisplayName:r,buildInfoLabel:_,buildInfoText:y,iconDataUrl:p.htmlIconDataUrl,isDark:x,okLabel:h,title:m})",
      "m8({appDisplayName:r,buildInfoLabel:_,buildInfoText:y,codexPlusDisclaimerHeading:CPXAbout.disclaimerHeading,codexPlusDisclaimerBody:CPXAbout.disclaimerBody,iconDataUrl:p.htmlIconDataUrl,isDark:x,okLabel:h,title:m})",
      "about dialog renderer call anchor",
    );
    patched = replaceOnce(
      patched,
      "function m8({appDisplayName:e,buildInfoLabel:t,buildInfoText:n,iconDataUrl:r,isDark:i,okLabel:a,title:o}){let s=r==null?``:",
      "function m8({appDisplayName:e,buildInfoLabel:t,buildInfoText:n,codexPlusDisclaimerHeading:D,codexPlusDisclaimerBody:O,iconDataUrl:r,isDark:i,okLabel:a,title:o}){let CPXAboutMetadata=" +
        aboutMetadataRequire() +
        ",q=CPXAboutMetadata.disclaimerMarkup({escape:bH.default,heading:D,body:O}),s=r==null?``:",
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
      '      <div class="app-name" id="app-name">${(0,bH.default)(e)}</div>\n      <pre class="build-info" aria-label="${(0,bH.default)(t)}">${(0,bH.default)(n)}</pre>',
      '      <div class="app-name" id="app-name">${(0,bH.default)(e)}</div>\n      ${q}\n      <pre class="build-info" aria-label="${(0,bH.default)(t)}">${(0,bH.default)(n)}</pre>',
      "about dialog disclaimer insertion anchor",
    );
  }
  if (text.includes("function X4({appDisplayName:e,buildInfoLabel:t,buildInfoText:n,iconDataUrl:r,isDark:i,okLabel:a,title:o})")) {
    let patched = replaceOnce(
      text,
      "let i=a.app.getName(),o=a.app.getVersion()",
      `let CPXAbout=${aboutMetadataRequire()}.aboutPayload(${JSON.stringify(aboutContext)}),i=CPXAbout.appDisplayName,o=a.app.getVersion()`,
      "about dialog app name anchor",
    );
    patched = replaceOnce(
      patched,
      "g=d.formatMessage({messageId:P4,defaultMessage:F4}),_=G4(o),v=_.length===0?h:[h,``,..._].join(`\n`),",
      "g=d.formatMessage({messageId:P4,defaultMessage:F4}),_=CPXAbout.buildInfoLines,v=_.length===0?h:[h,``,..._].join(`\n`),",
      "about dialog build information anchor",
    );
    patched = replaceOnce(
      patched,
      "X4({appDisplayName:i,buildInfoLabel:g,buildInfoText:v,iconDataUrl:f.htmlIconDataUrl,isDark:b,okLabel:m,title:p})",
      "X4({appDisplayName:i,buildInfoLabel:g,buildInfoText:v,codexPlusDisclaimerHeading:CPXAbout.disclaimerHeading,codexPlusDisclaimerBody:CPXAbout.disclaimerBody,iconDataUrl:f.htmlIconDataUrl,isDark:b,okLabel:m,title:p})",
      "about dialog renderer call anchor",
    );
    patched = replaceOnce(
      patched,
      "function X4({appDisplayName:e,buildInfoLabel:t,buildInfoText:n,iconDataUrl:r,isDark:i,okLabel:a,title:o}){let s=r==null?``:",
      "function X4({appDisplayName:e,buildInfoLabel:t,buildInfoText:n,codexPlusDisclaimerHeading:D,codexPlusDisclaimerBody:O,iconDataUrl:r,isDark:i,okLabel:a,title:o}){let CPXAboutMetadata=" +
        aboutMetadataRequire() +
        ",q=CPXAboutMetadata.disclaimerMarkup({escape:iV.default,heading:D,body:O}),s=r==null?``:",
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
      '      <div class="app-name" id="app-name">${(0,iV.default)(e)}</div>\n      <pre class="build-info" aria-label="${(0,iV.default)(t)}">${(0,iV.default)(n)}</pre>',
      '      <div class="app-name" id="app-name">${(0,iV.default)(e)}</div>\n      ${q}\n      <pre class="build-info" aria-label="${(0,iV.default)(t)}">${(0,iV.default)(n)}</pre>',
      "about dialog disclaimer insertion anchor",
    );
  }
  if (text.includes("function $4({appDisplayName:e,buildInfoLabel:t,buildInfoText:n,iconDataUrl:r,isDark:i,okLabel:a,title:o})")) {
    let patched = replaceOnce(
      text,
      "let i=a.app.getName(),o=a.app.getVersion()",
      `let CPXAbout=${aboutMetadataRequire()}.aboutPayload(${JSON.stringify(aboutContext)}),i=CPXAbout.appDisplayName,o=a.app.getVersion()`,
      "about dialog app name anchor",
    );
    patched = replaceOnce(
      patched,
      "g=d.formatMessage({messageId:L4,defaultMessage:R4}),_=J4(o),v=_.length===0?h:[h,``,..._].join(`\n`),",
      "g=d.formatMessage({messageId:L4,defaultMessage:R4}),_=CPXAbout.buildInfoLines,v=_.length===0?h:[h,``,..._].join(`\n`),",
      "about dialog build information anchor",
    );
    patched = replaceOnce(
      patched,
      "$4({appDisplayName:i,buildInfoLabel:g,buildInfoText:v,iconDataUrl:f.htmlIconDataUrl,isDark:b,okLabel:m,title:p})",
      "$4({appDisplayName:i,buildInfoLabel:g,buildInfoText:v,codexPlusDisclaimerHeading:CPXAbout.disclaimerHeading,codexPlusDisclaimerBody:CPXAbout.disclaimerBody,iconDataUrl:f.htmlIconDataUrl,isDark:b,okLabel:m,title:p})",
      "about dialog renderer call anchor",
    );
    patched = replaceOnce(
      patched,
      "function $4({appDisplayName:e,buildInfoLabel:t,buildInfoText:n,iconDataUrl:r,isDark:i,okLabel:a,title:o}){let s=r==null?``:",
      "function $4({appDisplayName:e,buildInfoLabel:t,buildInfoText:n,codexPlusDisclaimerHeading:D,codexPlusDisclaimerBody:O,iconDataUrl:r,isDark:i,okLabel:a,title:o}){let CPXAboutMetadata=" +
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
  if (text.includes("function L0({requestKind:e,source:t}){return I0.has(e??``)||R0(t)}")) {
    let patched = replaceOnce(
      text,
      "var Z0=ZW(`git`),",
      `${workerHook()}var Z0=ZW(\`git\`),`,
      "worker helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "function L0({requestKind:e,source:t}){return I0.has(e??``)||R0(t)}",
      "function L0({requestKind:e,source:t}){return I0.has(e??``)||R0(t)||CPXW.isReadOnlyBranchRequest(e,t)}",
      "codex plus branch picker git allowlist anchor",
    );
    return replaceOnce(
      patched,
      "case`commit-message-diff`:o=Z(await a7(qae(e.params.cwd,e.params.includeUnstaged,this.gitManager,r),t.signal));break;case`submodule-paths`:o=Z({paths:await uoe(this.gitManager.getWorktreeRepositoryForRoot(e.params.root,r),t.signal)});break;",
      "case`commit-message-diff`:o=Z(await a7(qae(e.params.cwd,e.params.includeUnstaged,this.gitManager,r),t.signal));break;case`codex-plus-trace`:o=Z(CPXW.traceRequest(e.params));break;case`repository-targets`:o=Z(await CPXW.repositoryTargetsFromHost(this.gitManager,e.params,r,t.signal,uoe));break;case`codex-plus-branches`:o=Z(await CPXW.listBranches(e.params,t.signal));break;case`codex-plus-current-branch`:o=Z(await CPXW.currentBranch(e.params,t.signal));break;case`submodule-paths`:o=Z({paths:await uoe(this.gitManager.getWorktreeRepositoryForRoot(e.params.root,r),t.signal)});break;",
      "repository-targets worker switch anchor",
    );
  }
  if (text.includes("function yae(e,t){return e.queryClient.fetchQuery")) {
    let patched = replaceOnce(
      text,
      "var d2=gG(`git`),",
      'const CPXW=require("./codex-plus-worker.js");var d2=gG(`git`),',
      "worker helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "if(!Z0(y)&&!t2(n))return",
      "if(!Z0(y)&&!CPXW.isReadOnlyBranchRequest(y?.requestKind,y?.source)&&!t2(n))return",
      "codex plus branch picker git allowlist anchor",
    );
    patched = replaceOnce(
      patched,
      "case`commit-message-diff`:a=X(await o7(nae(e.params.cwd,e.params.includeUnstaged,this.gitManager,r),t.signal));break;case`submodule-paths`:a=X({paths:await yae(this.gitManager.getWorktreeRepositoryForRoot(e.params.root,r),t.signal)});break;",
      "case`commit-message-diff`:a=X(await o7(nae(e.params.cwd,e.params.includeUnstaged,this.gitManager,r),t.signal));break;case`codex-plus-trace`:a=X(CPXW.traceRequest(e.params));break;case`repository-targets`:a=X(await CPXW.repositoryTargetsFromHost(this.gitManager,e.params,r,t.signal,yae));break;case`codex-plus-branches`:a=X(await CPXW.listBranches(e.params,t.signal));break;case`codex-plus-current-branch`:a=X(await CPXW.currentBranch(e.params,t.signal));break;case`submodule-paths`:a=X({paths:await yae(this.gitManager.getWorktreeRepositoryForRoot(e.params.root,r),t.signal)});break;",
      "repository-targets worker switch anchor",
    );
    return replaceOnce(
      patched,
      "case`review-patch`:case`commit-message-diff`:case`submodule-paths`:case`cat-file`:",
      "case`review-patch`:case`commit-message-diff`:case`codex-plus-trace`:case`repository-targets`:case`codex-plus-branches`:case`codex-plus-current-branch`:case`submodule-paths`:case`cat-file`:",
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
    "case`codex-plus-trace`:a=X(CPXW.traceRequest(e.params));break;case`repository-targets`:a=X(await CPXW.repositoryTargetsFromHost(this.gitManager,e.params,r,t.signal,pae));break;case`codex-plus-branches`:a=X(await CPXW.listBranches(e.params,t.signal));break;case`codex-plus-current-branch`:a=X(await CPXW.currentBranch(e.params,t.signal));break;case`submodule-paths`:a=X({paths:await pae(this.gitManager.getWorktreeRepositoryForRoot(e.params.root,r),t.signal)});break;",
    "repository-targets worker switch anchor",
  );
  patched = replaceOnce(
    patched,
    "function u2({requestKind:e,source:t}){return l2.has(e??``)||d2(t)}",
    "function u2({requestKind:e,source:t}){return l2.has(e??``)||d2(t)||CPXW.isReadOnlyBranchRequest(e,t)}",
    "codex plus branch picker git allowlist anchor",
  );
  return replaceOnce(
    patched,
    "case`commit-message-diff`:case`submodule-paths`:case`cat-file`:",
    "case`commit-message-diff`:case`codex-plus-trace`:case`repository-targets`:case`codex-plus-branches`:case`codex-plus-current-branch`:case`submodule-paths`:case`cat-file`:",
    "repository-targets worker readonly method anchor",
  );
}

function patchThreadSidePanelTabs(text) {
  const originalText = text;
  text = patchThreadSidePanelNativeProjectContext(text);
  if (text.includes("function r6t(e){let t=(0,i6t.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e")) {
    let patched = replaceOnce(
      text,
      "function r6t(e){let t=(0,i6t.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e",
      `${reviewHook("[Hq,pG,jo,$e,be,nO,rO,iO,null,Ma,LKe,dZt,ru,null,null,null,null,null,null,$D,oRt]")}function r6t(e){let t=(0,i6t.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e`,
      "review host hook insertion anchor",
    );
    return replaceOnce(
      patched,
      "let s;t[1]!==a||t[2]!==r||t[3]!==i?(s=(0,Hq.jsx)(dZt,{diffMode:a,setTabState:r,tabState:i}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
      "let s;t[1]!==a||t[2]!==r||t[3]!==i?(s=(0,Hq.jsx)(CPXRM,{mainReviewContent:(0,Hq.jsx)(dZt,{diffMode:a,setTabState:r,tabState:i}),diffMode:a,setTabState:r,tabState:i}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
      "review body mux anchor",
    );
  }
  if (text.includes("function rI(e){let t=(0,iI.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e")) {
    let patched = replaceOnce(
      text,
      "function rI(e){let t=(0,iI.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e",
      `${reviewHook("[aI,fE,We,K,za,ul,cl,ac,dl,re,je,dE,kn,null,null,null,null,null,null,Ou,rs]")}function rI(e){let t=(0,iI.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e`,
      "review host hook insertion anchor",
    );
    return replaceOnce(
      patched,
      "let s;t[1]!==a||t[2]!==r||t[3]!==i?(s=(0,aI.jsx)(HE,{diffMode:a,setTabState:r,tabState:i}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
      "let s;t[1]!==a||t[2]!==r||t[3]!==i?(s=(0,aI.jsx)(CPXRM,{mainReviewContent:(0,aI.jsx)(HE,{diffMode:a,setTabState:r,tabState:i}),diffMode:a,setTabState:r,tabState:i}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
      "review body mux anchor",
    );
  }
  if (text.includes("function s6e(e){let t=(0,c6e.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e")) {
    let patched = replaceOnce(
      text,
      "function s6e(e){let t=(0,c6e.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e",
      `${reviewHook("[gz,PQe,Ms,Y,os,yC,bC,xC,null,S,nr,kQe,null,null,null,null,null,null,null,mC,tGe]")}function s6e(e){let t=(0,c6e.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e`,
      "review host hook insertion anchor",
    );
    return replaceOnce(
      patched,
      "let s;t[1]!==a||t[2]!==r||t[3]!==i?(s=(0,gz.jsx)(kQe,{diffMode:a,setTabState:r,tabState:i}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
      "let s;t[1]!==a||t[2]!==r||t[3]!==i?(s=(0,gz.jsx)(CPXRM,{mainReviewContent:(0,gz.jsx)(kQe,{diffMode:a,setTabState:r,tabState:i}),diffMode:a,setTabState:r,tabState:i}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
      "review body mux anchor",
    );
  }
  if (text.includes("function mQe(e){let t=(0,hQe.c)(20),{diffMode:n,setTabState:r,tabState:i}=e")) {
    let patched = replaceOnce(
      text,
      "function mQe(e){let t=(0,hQe.c)(20),{diffMode:n,setTabState:r,tabState:i}=e",
      `${reviewHook("[tR,eR,B,X,Z,jw,Mw,Nw,null,fu,ze,JZe,za,Ia,null,null,null,null,null,ph,Hre]")}function mQe(e){let t=(0,hQe.c)(20),{diffMode:n,setTabState:r,tabState:i}=e`,
      "review host hook insertion anchor",
    );
    return replaceOnce(
      patched,
      "_=(0,tR.jsx)(JZe,{diffMode:n,diffRefs:u,isFileTreeOpen:s,isReviewExpanded:p,setTabState:r,setScrollContainerRef:h,tabState:i}),t[9]=n,t[10]=u,t[11]=s,t[12]=p,t[13]=h,t[14]=r,t[15]=i,t[16]=_):_=t[16];",
      "_=(0,tR.jsx)(CPXRM,{mainReviewContent:(0,tR.jsx)(JZe,{diffMode:n,diffRefs:u,isFileTreeOpen:s,isReviewExpanded:p,setTabState:r,setScrollContainerRef:h,tabState:i}),diffMode:n,setTabState:r,tabState:i}),t[9]=n,t[10]=u,t[11]=s,t[12]=p,t[13]=h,t[14]=r,t[15]=i,t[16]=_):_=t[16];",
      "review body mux anchor",
    );
  }
  if (text.includes("function aOe(e){let t=(0,gS.c)(20),{diffMode:n,setTabState:r,tabState:i}=e")) {
    let patched = replaceOnce(
      text,
      "function aOe(e){let t=(0,gS.c)(20),{diffMode:n,setTabState:r,tabState:i}=e",
      `${reviewHook("[_S,hS,I,Z,Gc,Aa,Da,Ci,null,Ou,Dt,UDe,No,null,null,null,null,null,null,_n,HEe]")}function aOe(e){let t=(0,gS.c)(20),{diffMode:n,setTabState:r,tabState:i}=e`,
      "review host hook insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "_=(0,_S.jsx)(UDe,{diffMode:n,diffRefs:u,isFileTreeOpen:s,isReviewExpanded:p,setTabState:r,setScrollContainerRef:h,tabState:i}),t[9]=n,t[10]=u,t[11]=s,t[12]=p,t[13]=h,t[14]=r,t[15]=i,t[16]=_):_=t[16];",
      "_=(0,_S.jsx)(CPXRM,{mainReviewContent:(0,_S.jsx)(UDe,{diffMode:n,diffRefs:u,isFileTreeOpen:s,isReviewExpanded:p,setTabState:r,setScrollContainerRef:h,tabState:i}),diffMode:n,setTabState:r,tabState:i}),t[9]=n,t[10]=u,t[11]=s,t[12]=p,t[13]=h,t[14]=r,t[15]=i,t[16]=_):_=t[16];",
      "review body mux anchor",
    );
    return patched;
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
  if (text.includes("function WPe(e){let t=(0,xN.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e")) {
    let patched = replaceOnce(
      text,
      "function WPe(e){let t=(0,xN.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e",
      `${reviewHook("[SN,typeof VE!==`undefined`?VE:null,Ie,Y,xn,null,null,null,null,null,ce,xje,null,null,null,null,null,null,null,null,null]")}function WPe(e){let t=(0,xN.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e`,
      "review host hook insertion anchor",
    );
    return replaceOnce(
      patched,
      "let s;t[1]!==a||t[2]!==r||t[3]!==i?(s=(0,SN.jsx)(xje,{diffMode:a,setTabState:r,tabState:i}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
      "let s;t[1]!==a||t[2]!==r||t[3]!==i?(s=(0,SN.jsx)(CPXRM,{mainReviewContent:(0,SN.jsx)(xje,{diffMode:a,setTabState:r,tabState:i}),diffMode:a,setTabState:r,tabState:i}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
      "review body mux anchor",
    );
  }
  if (text.includes("function YPt(e){let t=(0,XPt.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e")) {
    const importAnchors = [
      "import{n as e,r as t,s as n,t as r}from\"./rolldown-runtime-Czos8NxU.js\";",
      "import{n as e,s as t}from\"./rolldown-runtime-Czos8NxU.js\";",
    ];
    const importAnchor = importAnchors.find((anchor) => text.includes(anchor));
    if (!importAnchor) throw new Error("Could not find branch picker content import anchor");
    let patched = replaceOnce(
      text,
      importAnchor,
      `${importAnchor}import{t as CPXBranchPickerDropdownContent}from"./${branchPickerDropdownContentFile}";`,
      "branch picker content import anchor",
    );
    patched = replaceOnce(
      patched,
      "function YPt(e){let t=(0,XPt.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e",
      `${reviewHook("[yK,typeof BPt!==`undefined`?BPt:null,Hn,X,Tu,OE,kE,AE,null,Ti,Ot,ZDt,null,null,null,null,null,CPXBranchPickerDropdownContent,null,TE,pht]")}function YPt(e){let t=(0,XPt.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e`,
      "review host hook insertion anchor",
    );
    return replaceOnce(
      patched,
      "let s;t[1]!==a||t[2]!==r||t[3]!==i?(s=(0,yK.jsx)(ZDt,{diffMode:a,setTabState:r,tabState:i}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
      "let s;t[1]!==a||t[2]!==r||t[3]!==i?(s=(0,yK.jsx)(CPXRM,{mainReviewContent:(0,yK.jsx)(ZDt,{diffMode:a,setTabState:r,tabState:i}),diffMode:a,setTabState:r,tabState:i}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
      "review body mux anchor",
    );
  }
  if (text.includes("function Hwe(e){let t=(0,QF.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e")) {
    let patched = replaceOnce(
      text,
      "import{n as e,r as t,s as n,t as r}from\"./rolldown-runtime-Czos8NxU.js\";",
      `import{n as e,r as t,s as n,t as r}from"./rolldown-runtime-Czos8NxU.js";import{t as CPXBranchPickerDropdownContent}from"./${branchPickerDropdownContentFile}";`,
      "branch picker content import anchor",
    );
    patched = replaceOnce(
      patched,
      "function Hwe(e){let t=(0,QF.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e",
      `${reviewHook("[$F,Ik,Er,q,fa,_n,en,Gs,null,va,ke,bxe,Yi,null,null,L,be,CPXBranchPickerDropdownContent,null,vd,yte]")}function Hwe(e){let t=(0,QF.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e`,
      "review host hook insertion anchor",
    );
    return replaceOnce(
      patched,
      "s=(0,$F.jsx)(ute,{children:(0,$F.jsx)(bxe,{diffMode:a,setTabState:r,tabState:i})}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
      "s=(0,$F.jsx)(ute,{children:(0,$F.jsx)(CPXRM,{mainReviewContent:(0,$F.jsx)(bxe,{diffMode:a,setTabState:r,tabState:i}),diffMode:a,setTabState:r,tabState:i})}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
      "review body mux anchor",
    );
  }
  if (text.includes("function MMe(e){let t=(0,FM.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e")) {
    let patched = replaceOnce(
      text,
      "function MMe(e){let t=(0,FM.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e",
      `${reviewHook("[IM,typeof vT!==`undefined`?vT:null,typeof Si!==`undefined`?Si:null,typeof J!==`undefined`?J:null,typeof q!==`undefined`?q:null,typeof Mc!==`undefined`?Mc:null,typeof Ra!==`undefined`?Ra:null,typeof Vu!==`undefined`?Vu:null,null,typeof cl!==`undefined`?cl:null,typeof Ll!==`undefined`?Ll:null,VOe,typeof Mr!==`undefined`?Mr:null,typeof ze!==`undefined`?ze:null,null,typeof Wi!==`undefined`?Wi:null,null,null,typeof fM!==`undefined`?fM:null,typeof wu!==`undefined`?wu:null,typeof xw!==`undefined`?xw:null]")}function MMe(e){let t=(0,FM.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e`,
      "review host hook insertion anchor",
    );
    return replaceOnce(
      patched,
      "s=(0,IM.jsx)(Xce,{children:(0,IM.jsx)(VOe,{diffMode:a,setTabState:r,tabState:i})}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
      "s=(0,IM.jsx)(Xce,{children:(0,IM.jsx)(CPXRM,{mainReviewContent:(0,IM.jsx)(VOe,{diffMode:a,setTabState:r,tabState:i}),diffMode:a,setTabState:r,tabState:i})}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
      "review body mux anchor",
    );
  }
  if (!text.includes("function uf({cwd:e,fileEntries:t,generatedPathsReady:n,hasUnhandledAttributesFiles:r,isCappedMode:i,repositorySource:a,reviewSummarySource:o}){")) {
    if (text !== originalText) return text;
  }
  if (!text.includes("import{r as vi,t as yi}from\"./dropdown-CTBRoADH.js\";") && text !== originalText) return text;

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

function patchThreadSidePanelNativeProjectContext(text) {
  let patched = text;

  if (patched.includes("function QW(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,g=o??`local`,")) {
    patched = replaceOnce(
      patched,
      "function QW(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,g=o??`local`,",
      "function QW(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,CPXPC=globalThis.CodexPlus?.ui?.projectContext?.active?.(),CPXSP=globalThis.CodexPlusHost?.adapters?.threadSidePanel,g=(CPXSP&&(CPXSP.openFile=(t,n={})=>QW(e,t,n)),o??`local`),",
      "file side panel project context binding anchor",
    );
    patched = replaceOnce(
      patched,
      "b=$Rt(e),x=m??e.get(_m).formatMessage(VYt.openFileTabTitle)",
      "b=CPXPC?.cwd??$Rt(e),x=m??e.get(_m).formatMessage(VYt.openFileTabTitle)",
      "file side panel cwd anchor",
    );
    patched = replaceOnce(
      patched,
      "workspaceRoot:h??null,onSelectFile:(e,n,r)=>{QW(e,n,{controller:v,hostId:g,isPreview:t==null?!1:r?.isPreview,workspaceRoot:h}),t??v.closeTab(e,_)}",
      "workspaceRoot:CPXPC?.cwd??h??null,onSelectFile:(e,n,r)=>{QW(e,n,{controller:v,hostId:g,isPreview:t==null?!1:r?.isPreview,workspaceRoot:CPXPC?.cwd??h}),t??v.closeTab(e,_)}",
      "file side panel root anchor",
    );
    patched = replaceOnce(
      patched,
      "workspaceRoot:h??null,onSelectFile:(e,r,i)=>{QW(e,r,{controller:n,hostId:g,isPreview:t==null?!1:i?.isPreview,workspaceRoot:h}),t??n.closeTab(e,_)}",
      "workspaceRoot:CPXPC?.cwd??h??null,onSelectFile:(e,r,i)=>{QW(e,r,{controller:n,hostId:g,isPreview:t==null?!1:i?.isPreview,workspaceRoot:CPXPC?.cwd??h}),t??n.closeTab(e,_)}",
      "file side panel moved root anchor",
    );
  }

  if (patched.includes("function Dk(e){switch(e.value.routeKind){case`home`:{let t=e.get(nO),n=e.get(rO);return{conversationId:e.value.clientThreadId,conversationTitle:null,cwd:t,hostId:n}}")) {
    patched = replaceOnce(
      patched,
      "function Dk(e){switch(e.value.routeKind){case`home`:{let t=e.get(nO),n=e.get(rO);return{conversationId:e.value.clientThreadId,conversationTitle:null,cwd:t,hostId:n}}",
      "function Dk(e){let CPXPC=globalThis.CodexPlus?.ui?.projectContext?.active?.();if(CPXPC?.cwd)return{conversationId:globalThis.CodexPlus?.ui?.virtualConversations?.activeRouteId?.()??`codex-plus-virtual`,conversationTitle:CPXPC.label??null,cwd:CPXPC.cwd,hostId:e.get(rO)};switch(e.value.routeKind){case`home`:{let t=e.get(nO),n=e.get(rO);return{conversationId:e.value.clientThreadId,conversationTitle:null,cwd:t,hostId:n}}",
      "terminal project context route anchor",
    );
  }
  if (patched.includes("function sO(e){switch(e.value.routeKind){case`home`:{let t=e.get(OE),n=e.get(kE);return{conversationId:e.value.clientThreadId,conversationTitle:null,cwd:t,hostId:n}}")) {
    patched = replaceOnce(
      patched,
      "function sO(e){switch(e.value.routeKind){case`home`:{let t=e.get(OE),n=e.get(kE);return{conversationId:e.value.clientThreadId,conversationTitle:null,cwd:t,hostId:n}}",
      "function sO(e){let CPXPC=globalThis.CodexPlus?.ui?.projectContext?.active?.();if(CPXPC?.cwd)return{conversationId:globalThis.CodexPlus?.ui?.virtualConversations?.activeRouteId?.()??`codex-plus-virtual`,conversationTitle:CPXPC.label??null,cwd:CPXPC.cwd,hostId:e.get(kE)};switch(e.value.routeKind){case`home`:{let t=e.get(OE),n=e.get(kE);return{conversationId:e.value.clientThreadId,conversationTitle:null,cwd:t,hostId:n}}",
      "terminal project context route anchor",
    );
  }

  if (patched.includes("function vHt(){let e=(0,CHt.c)(33),t=jo(be),n=$e(GC.activeTab$),")) {
    patched = replaceOnce(
      patched,
      "function vHt(){let e=(0,CHt.c)(33),t=jo(be),n=$e(GC.activeTab$),",
      "function vHt(){let e=(0,CHt.c)(33),t=jo(be),CPXSP=globalThis.CodexPlusHost?.adapters?.threadSidePanel;CPXSP&&(CPXSP.openFile=(e,n={})=>($W(),QW(t,e,n)));let n=$e(GC.activeTab$),",
      "thread side panel native file opener shell anchor",
    );
  }

  if (patched.includes("function rF(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,g=o??`local`,")) {
    patched = replaceOnce(
      patched,
      "function rF(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,g=o??`local`,",
      "function rF(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,CPXPC=globalThis.CodexPlus?.ui?.projectContext?.active?.(),CPXSP=globalThis.CodexPlusHost?.adapters?.threadSidePanel,g=(CPXSP&&(CPXSP.openFile=(t,n={})=>rF(e,t,n)),o??`local`),",
      "file side panel project context binding anchor",
    );
    patched = replaceOnce(
      patched,
      "b=XGe(e),x=m??e.get(Bw).formatMessage(fZe.openFileTabTitle)",
      "b=CPXPC?.cwd??XGe(e),x=m??e.get(Bw).formatMessage(fZe.openFileTabTitle)",
      "file side panel cwd anchor",
    );
    patched = replaceOnce(
      patched,
      "workspaceRoot:h??null,onSelectFile:(e,n,r)=>{rF(e,n,{controller:v,hostId:g,isPreview:t==null?!1:r?.isPreview,workspaceRoot:h}),t??v.closeTab(e,_)}",
      "workspaceRoot:CPXPC?.cwd??h??null,onSelectFile:(e,n,r)=>{rF(e,n,{controller:v,hostId:g,isPreview:t==null?!1:r?.isPreview,workspaceRoot:CPXPC?.cwd??h}),t??v.closeTab(e,_)}",
      "file side panel root anchor",
    );
    patched = replaceOnce(
      patched,
      "workspaceRoot:h??null,onSelectFile:(e,r,i)=>{rF(e,r,{controller:n,hostId:g,isPreview:t==null?!1:i?.isPreview,workspaceRoot:h}),t??n.closeTab(e,_)}",
      "workspaceRoot:CPXPC?.cwd??h??null,onSelectFile:(e,r,i)=>{rF(e,r,{controller:n,hostId:g,isPreview:t==null?!1:i?.isPreview,workspaceRoot:CPXPC?.cwd??h}),t??n.closeTab(e,_)}",
      "file side panel moved root anchor",
    );
  }

  if (patched.includes("function Y9(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,g=o??`local`,")) {
    patched = replaceOnce(
      patched,
      "function Y9(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,g=o??`local`,",
      "function Y9(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,CPXPC=globalThis.CodexPlus?.ui?.projectContext?.active?.(),CPXSP=globalThis.CodexPlusHost?.adapters?.threadSidePanel,g=(CPXSP&&(CPXSP.openFile=(t,n={})=>Y9(e,t,n)),o??`local`),",
      "file side panel project context binding anchor",
    );
    patched = replaceOnce(
      patched,
      "b=T6e(e),x=m??e.get(yK).formatMessage(Kit.openFileTabTitle)",
      "b=CPXPC?.cwd??T6e(e),x=m??e.get(yK).formatMessage(Kit.openFileTabTitle)",
      "file side panel cwd anchor",
    );
    patched = replaceOnce(
      patched,
      "workspaceRoot:h??null,onSelectFile:(e,n,r)=>{Y9(e,n,{controller:v,hostId:g,isPreview:t==null?!1:r?.isPreview,workspaceRoot:h}),t??v.closeTab(e,_)}",
      "workspaceRoot:CPXPC?.cwd??h??null,onSelectFile:(e,n,r)=>{Y9(e,n,{controller:v,hostId:g,isPreview:t==null?!1:r?.isPreview,workspaceRoot:CPXPC?.cwd??h}),t??v.closeTab(e,_)}",
      "file side panel root anchor",
    );
    patched = replaceOnce(
      patched,
      "workspaceRoot:h??null,onSelectFile:(e,r,i)=>{Y9(e,r,{controller:n,hostId:g,isPreview:t==null?!1:i?.isPreview,workspaceRoot:h}),t??n.closeTab(e,_)}",
      "workspaceRoot:CPXPC?.cwd??h??null,onSelectFile:(e,r,i)=>{Y9(e,r,{controller:n,hostId:g,isPreview:t==null?!1:i?.isPreview,workspaceRoot:CPXPC?.cwd??h}),t??n.closeTab(e,_)}",
      "file side panel moved root anchor",
    );
  }

  if (patched.includes("function YO(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,g=o??`local`,")) {
    patched = replaceOnce(
      patched,
      "function YO(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,g=o??`local`,",
      "function YO(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,CPXPC=globalThis.CodexPlus?.ui?.projectContext?.active?.(),CPXSP=globalThis.CodexPlusHost?.adapters?.threadSidePanel,g=(CPXSP&&(CPXSP.openFile=(t,n={})=>YO(e,t,n)),o??`local`),",
      "file side panel project context binding anchor",
    );
    patched = replaceOnce(
      patched,
      "b=$h(e),x=m??e.get(bo).formatMessage(ZO.openFileTabTitle)",
      "b=CPXPC?.cwd??$h(e),x=m??e.get(bo).formatMessage(ZO.openFileTabTitle)",
      "file side panel cwd anchor",
    );
    patched = replaceOnce(
      patched,
      "workspaceRoot:h??null,onSelectFile:(e,n,r)=>{YO(e,n,{controller:v,hostId:g,isPreview:t==null?!1:r?.isPreview,workspaceRoot:h}),t??v.closeTab(e,_)}",
      "workspaceRoot:CPXPC?.cwd??h??null,onSelectFile:(e,n,r)=>{YO(e,n,{controller:v,hostId:g,isPreview:t==null?!1:r?.isPreview,workspaceRoot:CPXPC?.cwd??h}),t??v.closeTab(e,_)}",
      "file side panel root anchor",
    );
    patched = replaceOnce(
      patched,
      "workspaceRoot:h??null,onSelectFile:(e,r,i)=>{YO(e,r,{controller:n,hostId:g,isPreview:t==null?!1:i?.isPreview,workspaceRoot:h}),t??n.closeTab(e,_)}",
      "workspaceRoot:CPXPC?.cwd??h??null,onSelectFile:(e,r,i)=>{YO(e,r,{controller:n,hostId:g,isPreview:t==null?!1:i?.isPreview,workspaceRoot:CPXPC?.cwd??h}),t??n.closeTab(e,_)}",
      "file side panel moved root anchor",
    );
  }

  if (patched.includes("function EL(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,g=o??`local`,")) {
    patched = replaceOnce(
      patched,
      "function EL(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,g=o??`local`,",
      "function EL(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,CPXPC=globalThis.CodexPlus?.ui?.projectContext?.active?.(),CPXSP=globalThis.CodexPlusHost?.adapters?.threadSidePanel,g=(CPXSP&&(CPXSP.openFile=(t,n={})=>EL(e,t,n)),o??`local`),",
      "file side panel project context binding anchor",
    );
    patched = replaceOnce(
      patched,
      "b=OHe(e),x=m??e.get(YT).formatMessage(nZe.openFileTabTitle)",
      "b=CPXPC?.cwd??OHe(e),x=m??e.get(YT).formatMessage(nZe.openFileTabTitle)",
      "file side panel cwd anchor",
    );
    patched = replaceOnce(
      patched,
      "workspaceRoot:h??null,onSelectFile:(e,n,r)=>{EL(e,n,{controller:v,hostId:g,isPreview:t==null?!1:r?.isPreview,workspaceRoot:h}),t??v.closeTab(e,_)}",
      "workspaceRoot:CPXPC?.cwd??h??null,onSelectFile:(e,n,r)=>{EL(e,n,{controller:v,hostId:g,isPreview:t==null?!1:r?.isPreview,workspaceRoot:CPXPC?.cwd??h}),t??v.closeTab(e,_)}",
      "file side panel root anchor",
    );
    patched = replaceOnce(
      patched,
      "workspaceRoot:h??null,onSelectFile:(e,r,i)=>{EL(e,r,{controller:n,hostId:g,isPreview:t==null?!1:i?.isPreview,workspaceRoot:h}),t??n.closeTab(e,_)}",
      "workspaceRoot:CPXPC?.cwd??h??null,onSelectFile:(e,r,i)=>{EL(e,r,{controller:n,hostId:g,isPreview:t==null?!1:i?.isPreview,workspaceRoot:CPXPC?.cwd??h}),t??n.closeTab(e,_)}",
      "file side panel moved root anchor",
    );
  }

  if (patched.includes("function yH(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,g=o??`local`,")) {
    patched = replaceOnce(
      patched,
      "function yH(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,g=o??`local`,",
      "function yH(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,CPXPC=globalThis.CodexPlus?.ui?.projectContext?.active?.(),CPXSP=globalThis.CodexPlusHost?.adapters?.threadSidePanel,g=(CPXSP&&(CPXSP.openFile=(t,n={})=>yH(e,t,n)),o??`local`),",
      "file side panel project context binding anchor",
    );
    patched = replaceOnce(
      patched,
      "b=pgt(e),x=m??e.get(XD).formatMessage(DEt.openFileTabTitle)",
      "b=CPXPC?.cwd??pgt(e),x=m??e.get(XD).formatMessage(DEt.openFileTabTitle)",
      "file side panel cwd anchor",
    );
    patched = replaceOnce(
      patched,
      "workspaceRoot:h??null,onSelectFile:(e,n,r)=>{yH(e,n,{controller:v,hostId:g,isPreview:t==null?!1:r?.isPreview,workspaceRoot:h}),t??v.closeTab(e,_)}",
      "workspaceRoot:CPXPC?.cwd??h??null,onSelectFile:(e,n,r)=>{yH(e,n,{controller:v,hostId:g,isPreview:t==null?!1:r?.isPreview,workspaceRoot:CPXPC?.cwd??h}),t??v.closeTab(e,_)}",
      "file side panel root anchor",
    );
    patched = replaceOnce(
      patched,
      "workspaceRoot:h??null,onSelectFile:(e,r,i)=>{yH(e,r,{controller:n,hostId:g,isPreview:t==null?!1:i?.isPreview,workspaceRoot:h}),t??n.closeTab(e,_)}",
      "workspaceRoot:CPXPC?.cwd??h??null,onSelectFile:(e,r,i)=>{yH(e,r,{controller:n,hostId:g,isPreview:t==null?!1:i?.isPreview,workspaceRoot:CPXPC?.cwd??h}),t??n.closeTab(e,_)}",
      "file side panel moved root anchor",
    );
  }

  if (patched.includes("function gJ(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,g=o??`local`,")) {
    patched = replaceOnce(
      patched,
      "function gJ(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,g=o??`local`,",
      "function gJ(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,CPXPC=globalThis.CodexPlus?.ui?.projectContext?.active?.(),CPXSP=globalThis.CodexPlusHost?.adapters?.threadSidePanel,g=(CPXSP&&(CPXSP.openFile=(t,n={})=>gJ(e,t,n)),o??`local`),",
      "file side panel project context binding anchor",
    );
    patched = replaceOnce(
      patched,
      "b=Gln(e),x=m??e.get(Tj).formatMessage(Ryn.openFileTabTitle)",
      "b=CPXPC?.cwd??Gln(e),x=m??e.get(Tj).formatMessage(Ryn.openFileTabTitle)",
      "file side panel cwd anchor",
    );
    patched = replaceOnce(
      patched,
      "workspaceRoot:h??null,onSelectFile:(e,n,r)=>{gJ(e,n,{controller:v,hostId:g,isPreview:t==null?!1:r?.isPreview,workspaceRoot:h}),t??v.closeTab(e,_)}",
      "workspaceRoot:CPXPC?.cwd??h??null,onSelectFile:(e,n,r)=>{gJ(e,n,{controller:v,hostId:g,isPreview:t==null?!1:r?.isPreview,workspaceRoot:CPXPC?.cwd??h}),t??v.closeTab(e,_)}",
      "file side panel root anchor",
    );
    patched = replaceOnce(
      patched,
      "workspaceRoot:h??null,onSelectFile:(e,r,i)=>{gJ(e,r,{controller:n,hostId:g,isPreview:t==null?!1:i?.isPreview,workspaceRoot:h}),t??n.closeTab(e,_)}",
      "workspaceRoot:CPXPC?.cwd??h??null,onSelectFile:(e,r,i)=>{gJ(e,r,{controller:n,hostId:g,isPreview:t==null?!1:i?.isPreview,workspaceRoot:CPXPC?.cwd??h}),t??n.closeTab(e,_)}",
      "file side panel moved root anchor",
    );
  }

  if (patched.includes("function I5(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,g=o??`local`,")) {
    patched = replaceOnce(
      patched,
      "function I5(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,g=o??`local`,",
      "function I5(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,CPXPC=globalThis.CodexPlus?.ui?.projectContext?.active?.(),CPXSP=globalThis.CodexPlusHost?.adapters?.threadSidePanel,g=(CPXSP&&(CPXSP.openFile=(t,n={})=>I5(e,t,n)),o??`local`),",
      "file side panel project context binding anchor",
    );
    patched = replaceOnce(
      patched,
      "b=Do(e),x=m??e.get(Ul).formatMessage(Txe.openFileTabTitle)",
      "b=CPXPC?.cwd??Do(e),x=m??e.get(Ul).formatMessage(Txe.openFileTabTitle)",
      "file side panel cwd anchor",
    );
    patched = replaceOnce(
      patched,
      "workspaceRoot:h??null,onSelectFile:(e,n,r)=>{I5(e,n,{controller:v,hostId:g,isPreview:t==null?!1:r?.isPreview,workspaceRoot:h}),t??v.closeTab(e,_)}",
      "workspaceRoot:CPXPC?.cwd??h??null,onSelectFile:(e,n,r)=>{I5(e,n,{controller:v,hostId:g,isPreview:t==null?!1:r?.isPreview,workspaceRoot:CPXPC?.cwd??h}),t??v.closeTab(e,_)}",
      "file side panel root anchor",
    );
    patched = replaceOnce(
      patched,
      "workspaceRoot:h??null,onSelectFile:(e,r,i)=>{I5(e,r,{controller:n,hostId:g,isPreview:t==null?!1:i?.isPreview,workspaceRoot:h}),t??n.closeTab(e,_)}",
      "workspaceRoot:CPXPC?.cwd??h??null,onSelectFile:(e,r,i)=>{I5(e,r,{controller:n,hostId:g,isPreview:t==null?!1:i?.isPreview,workspaceRoot:CPXPC?.cwd??h}),t??n.closeTab(e,_)}",
      "file side panel moved root anchor",
    );
  }

  if (patched.includes("function LXe(e){let t=Ms(os),n=Y(no),")) {
    patched = replaceOnce(
      patched,
      "function LXe(e){let t=Ms(os),n=Y(no),",
      "function LXe(e){let t=Ms(os),CPXSP=globalThis.CodexPlusHost?.adapters?.threadSidePanel;CPXSP&&(CPXSP.openFile=(e,n={})=>rF(t,e,n));let n=Y(no),",
      "thread side panel native file opener shell anchor",
    );
  }

  if (patched.includes("function IXe(e){let t=Ms(os),n=Y(no),")) {
    patched = replaceOnce(
      patched,
      "function IXe(e){let t=Ms(os),n=Y(no),",
      "function IXe(e){let t=Ms(os),CPXSP=globalThis.CodexPlusHost?.adapters?.threadSidePanel;CPXSP&&(CPXSP.openFile=(e,n={})=>rF(t,e,n));let n=Y(no),",
      "thread side panel native file opener shell anchor",
    );
  }

  if (patched.includes("function Q5e(){let e=(0,r7e.c)(33),t=O(hc),n=Ke(HO.activeTab$),")) {
    patched = replaceOnce(
      patched,
      "function Q5e(){let e=(0,r7e.c)(33),t=O(hc),n=Ke(HO.activeTab$),",
      "function Q5e(){let e=(0,r7e.c)(33),t=O(hc),CPXSP=globalThis.CodexPlusHost?.adapters?.threadSidePanel;CPXSP&&(CPXSP.openFile=(e,n={})=>Y9(t,e,n));let n=Ke(HO.activeTab$),",
      "thread side panel native file opener shell anchor",
    );
  }

  if (patched.includes("function tb(){let e=(0,ob.c)(33),t=xe(Z),n=Y(tc.activeTab$),")) {
    patched = replaceOnce(
      patched,
      "function tb(){let e=(0,ob.c)(33),t=xe(Z),n=Y(tc.activeTab$),",
      "function tb(){let e=(0,ob.c)(33),t=xe(Z),CPXSP=globalThis.CodexPlusHost?.adapters?.threadSidePanel;CPXSP&&(CPXSP.openFile=(e,n={})=>YO(t,e,n));let n=Y(tc.activeTab$),",
      "thread side panel native file opener shell anchor",
    );
  }

  if (patched.includes("function QWe(){let e=(0,rGe.c)(33),t=B(Z),n=X(Cw.activeTab$),")) {
    patched = replaceOnce(
      patched,
      "function QWe(){let e=(0,rGe.c)(33),t=B(Z),n=X(Cw.activeTab$),",
      "function QWe(){let e=(0,rGe.c)(33),t=B(Z),CPXSP=globalThis.CodexPlusHost?.adapters?.threadSidePanel;CPXSP&&(CPXSP.openFile=(e,n={})=>EL(t,e,n));let n=X(Cw.activeTab$),",
      "thread side panel native file opener shell anchor",
    );
  }

  if (patched.includes("function Ufn(){let e=(0,Jfn.c)(33),t=Kn(Xd),n=Nn(HE.activeTab$),")) {
    patched = replaceOnce(
      patched,
      "function Ufn(){let e=(0,Jfn.c)(33),t=Kn(Xd),n=Nn(HE.activeTab$),",
      "function Ufn(){let e=(0,Jfn.c)(33),t=Kn(Xd),CPXSP=globalThis.CodexPlusHost?.adapters?.threadSidePanel;CPXSP&&(CPXSP.openFile=(e,n={})=>gJ(t,e,n));let n=Nn(HE.activeTab$),",
      "thread side panel native file opener shell anchor",
    );
  }
  if (patched.includes("function Myt(){let e=(0,Lyt.c)(33),t=Hn(Tu),n=X(vS.activeTab$),")) {
    patched = replaceOnce(
      patched,
      "function Myt(){let e=(0,Lyt.c)(33),t=Hn(Tu),n=X(vS.activeTab$),",
      "function Myt(){let e=(0,Lyt.c)(33),t=Hn(Tu),CPXSP=globalThis.CodexPlusHost?.adapters?.threadSidePanel;CPXSP&&(CPXSP.openFile=(e,n={})=>yH(t,e,n));let n=X(vS.activeTab$),",
      "thread side panel native file opener shell anchor",
    );
  }

  return patched;
}
function patchLocalThreadCatalogBootstrap(text) {
  const match = text.match(
    /o=!\(r\?\?i\)\|\|a==null\?null:\(0,([A-Za-z0-9_$]+)\.jsx\)\(([A-Za-z0-9_$]+),\{service:a\}\)/,
  );
  if (!match) return text;
  return replaceOnce(
    text,
    match[0],
    `o=globalThis.__CodexPlusRuntimeConfig?.devModeStatsigFallback===true?r===!1||a==null?null:(0,${match[1]}.jsx)(${match[2]},{service:a}):!(r??i)||a==null?null:(0,${match[1]}.jsx)(${match[2]},{service:a})`,
    "local thread catalog bootstrap anchor",
  );
}

function patchAppShell(text) {
  text = patchLocalThreadCatalogBootstrap(text);
  if (text.includes("function PD(e){let t=(0,ID.c)(4),{onRetry:n}=e")) {
    let patched = replaceOnce(
      text,
      "function PD(e){let t=(0,ID.c)(4),{onRetry:n}=e",
      `${diagnosticDetailsHook()}function PD(e){let t=(0,ID.c)(4),{onRetry:n,error:CPX_error}=e`,
      "app shell error fallback prop anchor",
    );
    patched = replaceOnce(
      patched,
      "children:[r,(0,RD.jsx)(At,{color:`secondary`,size:`default`,onClick:n,children:i})]",
      "children:[r,CPXDiagnosticDetails({jsx:RD.jsx,error:CPX_error}),(0,RD.jsx)(At,{color:`secondary`,size:`default`,onClick:n,children:i})]",
      "app shell error detail insertion anchor",
    );
    return replaceOnce(
      patched,
      "fallback:e=>(0,RD.jsx)(PD,{onRetry:()=>{e.resetError()}})",
      "fallback:e=>(0,RD.jsx)(PD,{error:e.error,onRetry:()=>{e.resetError()}})",
      "app shell boundary error prop anchor",
    );
  }
  if (text.includes("function yne(){let e=(0,gA.c)(3),t,n;")) {
    let patched = replaceOnce(
      text,
      "function yne(){let e=(0,gA.c)(3),t,n;",
      `${diagnosticDetailsHook()}function yne(){let e=(0,gA.c)(3),t,n;`,
      "app shell error fallback prop anchor",
    );
    return replaceOnce(
      patched,
      "children:[t,n,(0,_A.jsx)(Sc,{onClick:bne,children:(0,_A.jsx)(B,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
      "children:[t,n,CPXDiagnosticDetails({jsx:_A.jsx,error:null}),(0,_A.jsx)(Sc,{onClick:bne,children:(0,_A.jsx)(B,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
      "app shell error detail insertion anchor",
    );
  }
  if (text.includes("function hte(){let e=(0,zA.c)(3),t,n;")) {
    let patched = replaceOnce(
      text,
      "function hte(){let e=(0,zA.c)(3),t,n;",
      `${diagnosticDetailsHook()}function hte(){let e=(0,zA.c)(3),t,n;`,
      "app shell error fallback prop anchor",
    );
    return replaceOnce(
      patched,
      "children:[t,n,(0,BA.jsx)(Fc,{onClick:gte,children:(0,BA.jsx)(X,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
      "children:[t,n,CPXDiagnosticDetails({jsx:BA.jsx,error:null}),(0,BA.jsx)(Fc,{onClick:gte,children:(0,BA.jsx)(X,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
      "app shell error detail insertion anchor",
    );
  }
  if (text.includes("function Lne(){let e=(0,rj.c)(3),t,n;")) {
    let patched = replaceOnce(
      text,
      "function Lne(){let e=(0,rj.c)(3),t,n;",
      `${diagnosticDetailsHook()}function Lne(){let e=(0,rj.c)(3),t,n;`,
      "app shell error fallback prop anchor",
    );
    return replaceOnce(
      patched,
      "children:[t,n,(0,ij.jsx)(Ji,{onClick:Rne,children:(0,ij.jsx)(Y,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
      "children:[t,n,CPXDiagnosticDetails({jsx:ij.jsx,error:null}),(0,ij.jsx)(Ji,{onClick:Rne,children:(0,ij.jsx)(Y,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
      "app shell error detail insertion anchor",
    );
  }
  if (text.includes("function Sie(){let e=(0,hj.c)(3),t,n;")) {
    let patched = replaceOnce(
      text,
      "function Sie(){let e=(0,hj.c)(3),t,n;",
      `${diagnosticDetailsHook()}function Sie(){let e=(0,hj.c)(3),t,n;`,
      "app shell error fallback prop anchor",
    );
    return replaceOnce(
      patched,
      "children:[t,n,(0,gj.jsx)(Le,{onClick:Cie,children:(0,gj.jsx)(X,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
      "children:[t,n,CPXDiagnosticDetails({jsx:gj.jsx,error:null}),(0,gj.jsx)(Le,{onClick:Cie,children:(0,gj.jsx)(X,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
      "app shell error detail insertion anchor",
    );
  }
  if (text.includes("function Eie(){let e=(0,oA.c)(3),t,n;")) {
    let patched = replaceOnce(
      text,
      "function Eie(){let e=(0,oA.c)(3),t,n;",
      `${diagnosticDetailsHook()}function Eie(){let e=(0,oA.c)(3),t,n;`,
      "app shell error fallback prop anchor",
    );
    return replaceOnce(
      patched,
      "children:[t,n,(0,sA.jsx)(lx,{onClick:Die,children:(0,sA.jsx)(X,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
      "children:[t,n,CPXDiagnosticDetails({jsx:sA.jsx,error:null}),(0,sA.jsx)(lx,{onClick:Die,children:(0,sA.jsx)(X,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
      "app shell error detail insertion anchor",
    );
  }
  if (text.includes("function USe(){let e=(0,CO.c)(3),t,n;")) {
    let patched = replaceOnce(
      text,
      "function USe(){let e=(0,CO.c)(3),t,n;",
      `${diagnosticDetailsHook()}function USe(){let e=(0,CO.c)(3),t,n;`,
      "app shell error fallback prop anchor",
    );
    return replaceOnce(
      patched,
      "children:[t,n,(0,wO.jsx)(Ia,{onClick:WSe,children:(0,wO.jsx)(X,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
      "children:[t,n,CPXDiagnosticDetails({jsx:wO.jsx,error:null}),(0,wO.jsx)(Ia,{onClick:WSe,children:(0,wO.jsx)(X,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
      "app shell error detail insertion anchor",
    );
  }
  if (text.includes("function lce(){let e=(0,HA.c)(3),t,n;")) {
    let patched = replaceOnce(
      text,
      "function lce(){let e=(0,HA.c)(3),t,n;",
      `${diagnosticDetailsHook()}function CPXCommandMenuBridgeItem(e){let t=e.command,n=t.title??t.id,r=t.description??"",i=t.menuGroups?.[0]??t.commandMenuGroupKey??"suggested";return Sq({id:t.id,enabled:t.commandMenu!==!1,groupKey:i,dependencies:[n,r,t.id],render:i=>(0,$.jsx)(Cx,{value:n,keywords:[r,t.id],title:n,description:r,onSelect:()=>{globalThis.CodexPlus?.commands?.run?.(t.id),i?.()}},t.id)}),null}function CPXCommandMenuBridge(){let e=globalThis.CodexPlus?.ui?.commands?.commandMetadata?.()?.filter?.(e=>e?.id&&e?.title)??[];return(0,$.jsx)($.Fragment,{children:e.map(e=>(0,$.jsx)(CPXCommandMenuBridgeItem,{command:e},e.id))})}function lce(){let e=(0,HA.c)(3),t,n;`,
      "app shell error fallback prop anchor",
    );
    patched = replaceOnce(
      patched,
      "function Zbe(){let e=(0,G9.c)(8);if(q9)return null;",
      "function Zbe(){let e=(0,G9.c)(8),CPX_SCOPE=K(H),CPXSP=globalThis.CodexPlusHost?.adapters?.threadSidePanel;CPXSP&&(CPXSP.openFile=(e,n={})=>Q9(CPX_SCOPE,e,{...n,hostId:n.hostId??Ts,target:n.target??`right`,line:n.line??1,endLine:n.endLine??n.line??1}));if(q9)return null;",
      "ChatGPT route-scoped native file opener anchor",
    );
    patched = replaceOnce(
      patched,
      "children:[t,n,(0,UA.jsx)(gs,{onClick:uce,children:(0,UA.jsx)(W,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
      "children:[t,n,CPXDiagnosticDetails({jsx:UA.jsx,error:null}),(0,UA.jsx)(gs,{onClick:uce,children:(0,UA.jsx)(W,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
      "app shell error detail insertion anchor",
    );
    return replaceOnce(
      patched,
      "children:[(0,$.jsx)(ope,{}),(0,$.jsx)(Ife,{})]",
      "children:[(0,$.jsx)(ope,{}),(0,$.jsx)(Ife,{}),(0,$.jsx)(CPXCommandMenuBridge,{})]",
      "ChatGPT command menu runtime bridge mount anchor",
    );
  }
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
  if (text.includes("function mT(e){let t=(0,hT.c)(9),{resetError:n}=e")) {
    let patched = replaceOnce(
      text,
      "function mT(e){let t=(0,hT.c)(9),{resetError:n}=e",
      `${diagnosticDetailsHook()}function mT(e){let t=(0,hT.c)(9),{resetError:n,error:CPX_error,componentStack:CPX_componentStack}=e`,
      "webview error boundary fallback prop anchor",
    );
    patched = replaceOnce(
      patched,
      "children:[i,a,(0,_T.jsxs)(`div`,{className:`flex flex-wrap items-center justify-center gap-2`,children:[o,(0,_T.jsx)(At,{onClick:s,children:c})]})]",
      "children:[i,a,CPXDiagnosticDetails({jsx:_T.jsx,error:CPX_error,componentStack:CPX_componentStack}),(0,_T.jsxs)(`div`,{className:`flex flex-wrap items-center justify-center gap-2`,children:[o,(0,_T.jsx)(At,{onClick:s,children:c})]})]",
      "webview error boundary detail anchor",
    );
    return replaceOnce(
      patched,
      "r=e??(e=>(0,_T.jsx)(mT,{resetError:()=>e.resetError()}));",
      "r=e??(e=>(0,_T.jsx)(mT,{error:e.error,componentStack:e.componentStack,resetError:()=>e.resetError()}));",
      "webview error boundary error prop anchor",
    );
  }
  if (text.includes("function Sg(e){let t=(0,Cg.c)(9),{resetError:n}=e,r=be(),i,a;")) {
    let patched = replaceOnce(
      text,
      "function Sg(e){let t=(0,Cg.c)(9),{resetError:n}=e,r=be(),i,a;",
      `${diagnosticDetailsHook()}function Sg(e){let t=(0,Cg.c)(9),{resetError:n,error:CPX_error,componentStack:CPX_componentStack}=e,r=be(),i,a;`,
      "webview error boundary fallback prop anchor",
    );
    patched = replaceOnce(
      patched,
      "children:[i,a,(0,Tg.jsxs)(`div`,{className:`flex flex-wrap items-center justify-center gap-2`,children:[o,(0,Tg.jsx)(oe,{onClick:c,children:l})]})]",
      "children:[i,a,CPXDiagnosticDetails({jsx:Tg.jsx,error:CPX_error,componentStack:CPX_componentStack}),(0,Tg.jsxs)(`div`,{className:`flex flex-wrap items-center justify-center gap-2`,children:[o,(0,Tg.jsx)(oe,{onClick:c,children:l})]})]",
      "webview error boundary detail anchor",
    );
    return replaceOnce(
      patched,
      "r=e??(e=>(0,Tg.jsx)(Sg,{resetError:()=>e.resetError()}));",
      "r=e??(e=>(0,Tg.jsx)(Sg,{error:e.error,componentStack:e.componentStack,resetError:()=>e.resetError()}));",
      "webview error boundary error prop anchor",
    );
  }
  if (text.includes("function X5n(e){let t=(0,Z5n.c)(9),{resetError:n}=e,r=CM(),i,a;")) {
    let patched = replaceOnce(
      text,
      "function X5n(e){let t=(0,Z5n.c)(9),{resetError:n}=e,r=CM(),i,a;",
      `${diagnosticDetailsHook()}function X5n(e){let t=(0,Z5n.c)(9),{resetError:n,error:CPX_error,componentStack:CPX_componentStack}=e,r=CM(),i,a;`,
      "webview error boundary fallback prop anchor",
    );
    patched = replaceOnce(
      patched,
      "children:[i,a,(0,DX.jsxs)(`div`,{className:`flex flex-wrap items-center justify-center gap-2`,children:[o,(0,DX.jsx)(mh,{onClick:s,children:c})]})]",
      "children:[i,a,CPXDiagnosticDetails({jsx:DX.jsx,error:CPX_error,componentStack:CPX_componentStack}),(0,DX.jsxs)(`div`,{className:`flex flex-wrap items-center justify-center gap-2`,children:[o,(0,DX.jsx)(mh,{onClick:s,children:c})]})]",
      "webview error boundary detail anchor",
    );
    return replaceOnce(
      patched,
      "r=e??(e=>(0,DX.jsx)(X5n,{resetError:()=>e.resetError()}));",
      "r=e??(e=>(0,DX.jsx)(X5n,{error:e.error,componentStack:e.componentStack,resetError:()=>e.resetError()}));",
      "webview error boundary error prop anchor",
    );
  }
  if (text.includes("function d_n(e){let t=(0,f_n.c)(9),{resetError:n}=e,r=jR(),i,a;")) {
    let patched = replaceOnce(
      text,
      "function d_n(e){let t=(0,f_n.c)(9),{resetError:n}=e,r=jR(),i,a;",
      `${diagnosticDetailsHook()}function d_n(e){let t=(0,f_n.c)(9),{resetError:n,error:CPX_error,componentStack:CPX_componentStack}=e,r=jR(),i,a;`,
      "webview error boundary fallback prop anchor",
    );
    patched = replaceOnce(
      patched,
      "children:[i,a,(0,N$.jsxs)(`div`,{className:`flex flex-wrap items-center justify-center gap-2`,children:[o,(0,N$.jsx)(p_,{onClick:s,children:c})]})]",
      "children:[i,a,CPXDiagnosticDetails({jsx:N$.jsx,error:CPX_error,componentStack:CPX_componentStack}),(0,N$.jsxs)(`div`,{className:`flex flex-wrap items-center justify-center gap-2`,children:[o,(0,N$.jsx)(p_,{onClick:s,children:c})]})]",
      "webview error boundary detail anchor",
    );
    return replaceOnce(
      patched,
      "r=e??(e=>(0,N$.jsx)(d_n,{resetError:()=>e.resetError()}));",
      "r=e??(e=>(0,N$.jsx)(d_n,{error:e.error,componentStack:e.componentStack,resetError:()=>e.resetError()}));",
      "webview error boundary error prop anchor",
    );
  }
  if (text.includes("function hte(){let e=(0,zA.c)(3),t,n;") && text.includes("CPXDiagnosticDetails({jsx:BA.jsx,error:null})")) {
    return text;
  }
  if (text.includes("function Lne(){let e=(0,rj.c)(3),t,n;") && text.includes("CPXDiagnosticDetails({jsx:ij.jsx,error:null})")) {
    return text;
  }
  if (text.includes("function Sie(){let e=(0,hj.c)(3),t,n;") && text.includes("CPXDiagnosticDetails({jsx:gj.jsx,error:null})")) {
    return text;
  }
  if (text.includes("function Eie(){let e=(0,oA.c)(3),t,n;") && text.includes("CPXDiagnosticDetails({jsx:sA.jsx,error:null})")) {
    return text;
  }
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
  if (text.includes("function Of(e){let t=(0,kf.c)(57),")) {
    let patched = replaceOnce(
      text,
      "function Of(e){let t=(0,kf.c)(57),",
      `${projectColorHook()}function Of(e){let t=(0,kf.c)(57),`,
      "project color app main helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "A=tr.sidebarProjectRow({collapsed:a,label:g,projectId:b})",
      "A={...tr.sidebarProjectRow({collapsed:a,label:g,projectId:b}),...CPXPR({projectId:b,label:g})}",
      "project header row color attributes anchor",
    );
  }
  if (text.includes("function Xu(e){let t=(0,Zu.c)(57),")) {
    let patched = replaceOnce(
      text,
      "function Xu(e){let t=(0,Zu.c)(57),",
      `${projectColorHook()}function Xu(e){let t=(0,Zu.c)(57),`,
      "project color app main helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "A=ee.sidebarProjectRow({collapsed:a,label:g,projectId:b})",
      "A={...ee.sidebarProjectRow({collapsed:a,label:g,projectId:b}),...CPXPR({projectId:b,label:g})}",
      "project header row color attributes anchor",
    );
  }
  if (text.includes("function jh(e){let t=(0,vg.c)(73),") && text.includes("function Kh(e){let t=(0,vg.c)(120),")) {
    let patched = replaceOnce(
      text,
      "function jh(e){let t=(0,vg.c)(73),",
      `${projectColorHook()}function jh(e){let t=(0,vg.c)(73),`,
      "project color app main helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "Ue=(0,$.jsx)(Ee,{rowAttributes:De,className:Oe,collapsed:F,contentClassName:X,dragHandleListeners:ke,dragHandleRef:Ae,icon:je,isActive:I,ariaLabel:Me,label:O,onPress:ye,onContextMenu:Ne,projectId:D,actions:ze,selectAction:Be,toggle:Ve,trailingContent:He})",
      "Ue=(0,$.jsx)(Ee,{rowAttributes:{...De,...CPXPR({projectId:D,label:O})},className:Oe,collapsed:F,contentClassName:X,dragHandleListeners:ke,dragHandleRef:Ae,icon:je,isActive:I,ariaLabel:Me,label:O,onPress:ye,onContextMenu:Ne,projectId:D,actions:ze,selectAction:Be,toggle:Ve,trailingContent:He})",
      "project header row color attributes anchor",
    );
    return replaceOnce(
      patched,
      'nt=(0,$.jsx)(`div`,{ref:Je,style:Xe,className:$e,role:`listitem`,"aria-label":O,children:tt})',
      'nt=(0,$.jsx)(`div`,{ref:Je,style:Xe,className:$e,role:`listitem`,"aria-label":O,...CPXPR({projectId:D,label:O}),children:tt})',
      "project group color render anchor",
    );
  }
  if (text.includes("function Fm(e){let t=(0,zm.c)(57),")) {
    let patched = replaceOnce(
      text,
      "function Fm(e){let t=(0,zm.c)(57),",
      `${projectColorHook()}function Fm(e){let t=(0,zm.c)(57),`,
      "project color app main helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "O=Zr.sidebarProjectRow({collapsed:a,label:p,projectId:_})",
      "O={...Zr.sidebarProjectRow({collapsed:a,label:p,projectId:_}),...CPXPR({projectId:_,label:p})}",
      "project header row color attributes anchor",
    );
    return replaceOnce(
      patched,
      "X=(0,$.jsx)(`div`,{...U,children:te})",
      "X=(0,$.jsx)(`div`,{...U,...CPXPR(a),children:te})",
      "project group color render anchor",
    );
  }
  if (text.includes("function jy(e){let t=(0,Fy.c)(57),")) {
    let patched = replaceOnce(
      text,
      "function jy(e){let t=(0,Fy.c)(57),",
      `${projectColorHook()}function jy(e){let t=(0,Fy.c)(57),`,
      "project color app main helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "O=Ta.sidebarProjectRow({collapsed:a,label:p,projectId:_})",
      "O={...Ta.sidebarProjectRow({collapsed:a,label:p,projectId:_}),...CPXPR({projectId:_,label:p})}",
      "project header row color attributes anchor",
    );
    return replaceOnce(
      patched,
      "te=(0,$.jsx)(`div`,{...V,children:Y})",
      "te=(0,$.jsx)(`div`,{...V,...CPXPR(a),children:Y})",
      "project group color render anchor",
    );
  }
  if (text.includes("function SV(e){let t=(0,EV.c)(57),") && text.includes("function nH(e){let t=(0,OH.c)(120),")) {
    let patched = replaceOnce(
      text,
      "function SV(e){let t=(0,EV.c)(57),",
      `${projectColorHook()}function SV(e){let t=(0,EV.c)(57),`,
      "project color app main helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "O=yl.sidebarProjectRow({collapsed:a,label:p,projectId:_})",
      "O={...yl.sidebarProjectRow({collapsed:a,label:p,projectId:_}),...CPXPR({projectId:_,label:p})}",
      "project header row color attributes anchor",
    );
    return replaceOnce(
      patched,
      "ne=(0,Z.jsx)(`div`,{...R,children:te})",
      "ne=(0,Z.jsx)(`div`,{...R,...CPXPR(a),children:te})",
      "project group color render anchor",
    );
  }
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
  if (text.includes("function Wh(e){let t=(0,Jh.c)(57),") && text.includes("function Ag(e){let t=(0,Qg.c)(44),{threadKeys:n,")) {
    let patched = replaceOnce(
      text,
      "function Wh(e){let t=(0,Jh.c)(57),",
      `${projectColorHook()}function Wh(e){let t=(0,Jh.c)(57),`,
      "project color app main helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "ee=(0,$.jsx)(`div`,{...B,children:J})",
      "ee=(0,$.jsx)(`div`,{...B,...CPXPR(a),children:J})",
      "project group color render anchor",
    );
    return replaceOnce(
      patched,
      "J=(0,Yh.jsxs)(`div`,{...v,...O,ref:n,className:j,role:`button`,tabIndex:M,",
      "J=(0,Yh.jsxs)(`div`,{...v,...O,...CPXPR({projectId:_,label:p}),ref:n,className:j,role:`button`,tabIndex:M,",
      "current project header row color attributes anchor",
    );
  }
  if (text.includes("function qB(e){let t=(0,ZB.c)(57),") && text.includes("function jV(e){let t=(0,$V.c)(44),{threadKeys:n,")) {
    let patched = replaceOnce(
      text,
      "function qB(e){let t=(0,ZB.c)(57),",
      `${projectColorHook()}function qB(e){let t=(0,ZB.c)(57),`,
      "project color app main helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "U=(0,QB.jsxs)(`div`,{...v,...O,ref:n,className:j,role:`button`,",
      "U=(0,QB.jsxs)(`div`,{...v,...O,...CPXPR({projectId:_,label:p}),ref:n,className:j,role:`button`,",
      "current project header row color attributes anchor",
    );
    return replaceOnce(
      patched,
      "U=(0,Z.jsx)(`div`,{...ee,children:ie})",
      "U=(0,Z.jsx)(`div`,{...ee,...CPXPR(a),children:ie})",
      "project group color render anchor",
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
  if (text.includes("function Of(e){let t=(0,kf.c)(57),")) {
    return replaceOnce(
      text,
      "H=(0,Af.jsx)(`span`,{className:`text-fade-truncate pr-1`,children:g})",
      "H=(0,Af.jsx)(`span`,{\"data-codex-plus-sidebar-name\":``,className:`text-fade-truncate pr-1`,children:g})",
      "project header sidebar blur label anchor",
    );
  }
  if (text.includes("function Xu(e){let t=(0,Zu.c)(57),")) {
    return replaceOnce(
      text,
      "H=(0,Qu.jsx)(`span`,{className:`text-fade-truncate pr-1`,children:g})",
      "H=(0,Qu.jsx)(`span`,{\"data-codex-plus-sidebar-name\":``,className:`text-fade-truncate pr-1`,children:g})",
      "project header sidebar blur label anchor",
    );
  }
  if (text.includes("function qB(e){let t=(0,ZB.c)(57),")) {
    return replaceOnce(
      text,
      "B=(0,QB.jsx)(`span`,{className:`min-w-0 truncate pr-1`,children:p})",
      "B=(0,QB.jsx)(`span`,{\"data-codex-plus-sidebar-name\":``,className:`min-w-0 truncate pr-1`,children:p})",
      "project header sidebar blur label anchor",
    );
  }
  if (text.includes("function Uh(e){let t=(0,vg.c)(15),")) {
    return replaceOnce(
      text,
      "c=(0,$.jsx)(`span`,{className:`min-w-0 truncate pr-1`,children:n})",
      "c=(0,$.jsx)(`span`,{\"data-codex-plus-sidebar-name\":``,className:`min-w-0 truncate pr-1`,children:n})",
      "project header sidebar blur label anchor",
    );
  }
  if (text.includes("function Fm(e){let t=(0,zm.c)(57),")) {
    return replaceOnce(
      text,
      "V=(0,Bm.jsx)(`span`,{className:`min-w-0 truncate pr-1`,children:p})",
      "V=(0,Bm.jsx)(`span`,{\"data-codex-plus-sidebar-name\":``,className:`min-w-0 truncate pr-1`,children:p})",
      "project header sidebar blur label anchor",
    );
  }
  if (text.includes("function jy(e){let t=(0,Fy.c)(57),")) {
    return replaceOnce(
      text,
      "V=(0,Iy.jsx)(`span`,{className:`min-w-0 truncate pr-1`,children:p})",
      "V=(0,Iy.jsx)(`span`,{\"data-codex-plus-sidebar-name\":``,className:`min-w-0 truncate pr-1`,children:p})",
      "project header sidebar blur label anchor",
    );
  }
  if (text.includes("function SV(e){let t=(0,EV.c)(57),")) {
    return replaceOnce(
      text,
      "V=(0,DV.jsx)(`span`,{className:`min-w-0 truncate pr-1`,children:p})",
      "V=(0,DV.jsx)(`span`,{\"data-codex-plus-sidebar-name\":``,className:`min-w-0 truncate pr-1`,children:p})",
      "project header sidebar blur label anchor",
    );
  }
  if (text.includes("function Wh(e){let t=(0,Jh.c)(57),")) {
    return replaceOnce(
      text,
      "V=(0,Yh.jsx)(`span`,{className:`min-w-0 truncate pr-1`,children:p})",
      "V=(0,Yh.jsx)(`span`,{\"data-codex-plus-sidebar-name\":``,className:`min-w-0 truncate pr-1`,children:p})",
      "project header sidebar blur label anchor",
    );
  }
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
  if (text.includes("function ir(e){let t=(0,ar.c)(5),{conversationId:n}=e,")) {
    return text;
  }
  if (
    text.includes("function Jn(e){let t=(0,$n.c)(66),") &&
    text.includes("(0,$.jsx)(G,{color:`ghostActive`,type:`button`,onClick:u,")
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
      "let CPX_headerContext={cwd:null,hostId:null,header:{surface:`header`,titleText:typeof i==`string`?i:null}},CPX_headerAccessories=CPXThreadHeaderAccessories({context:CPX_headerContext,deps:{jsx:$.jsx,jsxs:$.jsxs,Tooltip:Ae}});let x;t[35]!==c||t[36]!==g||t[37]!==i?",
      "thread header accessory render anchor",
    );
    return replaceOnce(
      patched,
      "(0,$.jsx)(G,{color:`ghostActive`,type:`button`,onClick:u,className:`min-w-0 flex-1 truncate !px-0 !py-0 text-left text-sm text-token-foreground hover:!bg-transparent hover:opacity-80 electron:font-medium`,children:(0,$.jsx)(`span`,{className:`truncate`,children:i})})]}):",
      "(0,$.jsx)(G,{color:`ghostActive`,type:`button`,onClick:u,className:`min-w-0 flex-1 truncate !px-0 !py-0 text-left text-sm text-token-foreground hover:!bg-transparent hover:opacity-80 electron:font-medium`,children:(0,$.jsx)(`span`,{className:`truncate`,children:i})}),CPX_headerAccessories]}):",
      "thread header title accessory children anchor",
    );
  }
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
  if (
    text.includes("function Jn(e){let t=(0,$n.c)(66),") &&
    text.includes("(0,$.jsx)(l,{color:`ghostActive`,type:`button`,onClick:p,")
  ) {
    let patched = replaceOnce(
      text,
      "function Jn(e){let t=(0,$n.c)(66),",
      `${threadHeaderHook()}function Jn(e){let t=(0,$n.c)(66),`,
      "thread header accessory helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "let w;t[35]!==u||t[36]!==y||t[37]!==i?",
      "let CPX_headerContext={cwd:null,hostId:null,header:{surface:`header`,titleText:typeof i==`string`?i:null}},CPX_headerAccessories=CPXThreadHeaderAccessories({context:CPX_headerContext,deps:{jsx:$.jsx,jsxs:$.jsxs}});let w;t[35]!==u||t[36]!==y||t[37]!==i?",
      "thread header accessory context anchor",
    );
    return replaceOnce(
      patched,
      "children:(0,$.jsx)(`span`,{className:`truncate`,children:i})})]}):",
      "children:(0,$.jsx)(`span`,{className:`truncate`,children:i})}),CPX_headerAccessories]}):",
      "thread header accessory render anchor",
    );
  }
  if (
    text.includes("function Jn(e){let t=(0,$n.c)(66),") &&
    text.includes("(0,$.jsx)(O,{color:`ghostActive`,type:`button`,onClick:u,")
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
      "let CPX_headerContext={cwd:null,hostId:null,header:{surface:`header`,titleText:typeof i==`string`?i:null}},CPX_headerAccessories=CPXThreadHeaderAccessories({context:CPX_headerContext,deps:{jsx:$.jsx,jsxs:$.jsxs,Tooltip:ie}});let x;t[35]!==c||t[36]!==g||t[37]!==i?",
      "thread header accessory context anchor",
    );
    return replaceOnce(
      patched,
      "children:(0,$.jsx)(`span`,{className:`truncate`,children:i})})]}):",
      "children:(0,$.jsx)(`span`,{className:`truncate`,children:i})}),CPX_headerAccessories]}):",
      "thread header accessory render anchor",
    );
  }
  if (
    text.includes("function Jn(e){let t=(0,$n.c)(66),") &&
    text.includes("(0,$.jsx)(K,{color:`ghostActive`,type:`button`,onClick:u,")
  ) {
    let patched = replaceOnce(
      text,
      "function Jn(e){let t=(0,$n.c)(66),",
      `${threadHeaderHook()}function Jn(e){let t=(0,$n.c)(66),`,
      "thread header accessory helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "let S;t[35]!==c||t[36]!==g||t[37]!==i?",
      "let CPX_headerContext={cwd:null,hostId:null,header:{surface:`header`,titleText:typeof i==`string`?i:null}},CPX_headerAccessories=CPXThreadHeaderAccessories({context:CPX_headerContext,deps:{jsx:$.jsx,jsxs:$.jsxs,Tooltip:xe}});let S;t[35]!==c||t[36]!==g||t[37]!==i?",
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
  if (text.includes("function xl(e){let t=(0,wl.c)(51),")) {
    let patched = replaceOnce(
      text,
      "function xl(e){let t=(0,wl.c)(51),",
      `${threadHeaderHook()}function xl(e){let t=(0,wl.c)(51),`,
      "local conversation header helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "let ie;t[46]===Symbol.for(`react.memo_cache_sentinel`)?(ie=null,t[46]=ie):ie=t[46];",
      "let CPX_headerContext={cwd:h,hostId:r??E,header:{surface:`local-conversation`,titleText:typeof p==`string`?p:null,projectName:f??null}},ie=CPXThreadHeaderAccessories({context:CPX_headerContext,deps:{jsx:Tl.jsx,jsxs:Tl.jsxs,Tooltip:Ze}});",
      "local conversation header accessory render anchor",
    );
  }
  if (text.includes("function pi(e){let t=(0,W.c)(32),")) {
    if (text.includes("projectIcon:a,projectHoverCardContent:o,projectName:s,title:c,titleSuffix:u,cwd:d,canPin:f,hideForkActions:p")) {
      let patched = replaceOnce(
        text,
        "function pi(e){let t=(0,W.c)(32),",
        `${threadHeaderHook()}function pi(e){let t=(0,W.c)(32),`,
        "local conversation header helper insertion anchor",
      );
      return replaceOnce(
        patched,
        "let O;t[26]===Symbol.for(`react.memo_cache_sentinel`)?(O=null,t[26]=O):O=t[26];",
        "let CPX_headerContext={cwd:d,hostId:null,header:{surface:`local-conversation`,titleText:typeof c==`string`?c:null,projectName:s??null}},O=CPXThreadHeaderAccessories({context:CPX_headerContext,deps:{jsx:G.jsx,jsxs:G.jsxs,Tooltip:it}});",
        "local conversation header accessory render anchor",
      );
    }
    if (text.includes("projectIcon:a,projectHoverCardContent:s,projectName:c,title:l,titleSuffix:u,cwd:d,canPin:f,hideForkActions:m")) {
      let patched = replaceOnce(
        text,
        "function pi(e){let t=(0,W.c)(32),",
        `${threadHeaderHook()}function pi(e){let t=(0,W.c)(32),`,
        "local conversation header helper insertion anchor",
      );
      return replaceOnce(
        patched,
        "let k;t[26]===Symbol.for(`react.memo_cache_sentinel`)?(k=null,t[26]=k):k=t[26];",
        "let CPX_headerContext={cwd:d,hostId:null,header:{surface:`local-conversation`,titleText:typeof l==`string`?l:null,projectName:c??null}},k=CPXThreadHeaderAccessories({context:CPX_headerContext,deps:{jsx:G.jsx,jsxs:G.jsxs,Tooltip:ht}});",
        "local conversation header accessory render anchor",
      );
    }
    if (text.includes("projectIcon:o,projectHoverCardContent:s,projectName:c,title:l,titleSuffix:u,cwd:p,canPin:m,hideForkActions:h")) {
      let patched = replaceOnce(
        text,
        "function pi(e){let t=(0,W.c)(32),",
        `${threadHeaderHook()}function pi(e){let t=(0,W.c)(32),`,
        "local conversation header helper insertion anchor",
      );
      return replaceOnce(
        patched,
        "let A;t[26]===Symbol.for(`react.memo_cache_sentinel`)?(A=null,t[26]=A):A=t[26];",
        "let CPX_headerContext={cwd:p,hostId:null,header:{surface:`local-conversation`,titleText:typeof l==`string`?l:null,projectName:c??null}},A=CPXThreadHeaderAccessories({context:CPX_headerContext,deps:{jsx:G.jsx,jsxs:G.jsxs,Tooltip:nt}});",
        "local conversation header accessory render anchor",
      );
    }
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
    if (text.includes("projectIcon:a,projectHoverCardContent:o,projectName:s,title:c,titleSuffix:l,cwd:u,canPin:p,hideForkActions:h")) {
      let patched = replaceOnce(
        text,
        "function mi(e){let t=(0,U.c)(32),",
        `${threadHeaderHook()}function mi(e){let t=(0,U.c)(32),`,
        "local conversation header helper insertion anchor",
      );
      return replaceOnce(
        patched,
        "let k;t[26]===Symbol.for(`react.memo_cache_sentinel`)?(k=null,t[26]=k):k=t[26];",
        "let CPX_headerContext={cwd:u,hostId:null,header:{surface:`local-conversation`,titleText:typeof c==`string`?c:null,projectName:s??null}},k=CPXThreadHeaderAccessories({context:CPX_headerContext,deps:{jsx:W.jsx,jsxs:W.jsxs,Tooltip:ge}});",
        "local conversation header accessory render anchor",
      );
    }
    if (text.includes("projectIcon:a,projectHoverCardContent:o,projectName:s,title:c,titleSuffix:l,cwd:u,canPin:d,hideForkActions:f")) {
      let patched = replaceOnce(
        text,
        "function mi(e){let t=(0,U.c)(32),",
        `${threadHeaderHook()}function mi(e){let t=(0,U.c)(32),`,
        "local conversation header helper insertion anchor",
      );
      patched = replaceOnce(
        patched,
        "let D;t[26]===Symbol.for(`react.memo_cache_sentinel`)?(D=null,t[26]=D):D=t[26];",
        "let CPX_headerContext={cwd:u,hostId:null,header:{surface:`local-conversation`,titleText:typeof c==`string`?c:null,projectName:s??null}};let D;t[26]===Symbol.for(`react.memo_cache_sentinel`)?(D=null,t[26]=D):D=t[26];",
        "local conversation header accessory context anchor",
      );
      return replaceOnce(
        patched,
        "children:[x,w,T,E,D]",
        "children:[x,w,T,E,CPXThreadHeaderAccessories({context:CPX_headerContext,deps:{jsx:W.jsx,jsxs:W.jsxs,Tooltip:Ge}}),D]",
        "local conversation header accessory mount anchor",
      );
    }
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
    text.includes("function Or({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){") &&
    text.includes("children:[T.map(e=>(0,J.jsx)(U,{size:`compact`,control:(0,J.jsx)(Nr,{ariaLabel:e.ariaLabel,value:y[e.role],onChange:t=>{D(e.role,t)}}),label:e.label},e.role)),E.map")
  ) {
    let patched = replaceOnce(
      text,
      "function Or({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){",
      `${appearanceSettingsHook("{React:Kr,jsx:J.jsx,SettingRow:U,ColorInput:Nr,Switch:Bn}")}function Or({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){`,
      "user bubble settings helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "children:[T.map(e=>(0,J.jsx)(U,{size:`compact`,control:(0,J.jsx)(Nr,{ariaLabel:e.ariaLabel,value:y[e.role],onChange:t=>{D(e.role,t)}}),label:e.label},e.role)),E.map",
      "children:[T.map(e=>(0,J.jsx)(U,{size:`compact`,control:(0,J.jsx)(Nr,{ariaLabel:e.ariaLabel,value:y[e.role],onChange:t=>{D(e.role,t)}}),label:e.label},e.role)),...CPXAppearanceRows(n),E.map",
      "user bubble settings row anchor",
    );
  }
  if (
    text.includes("function Or({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){") &&
    text.includes("children:[E.map(e=>(0,J.jsx)(G,{size:`compact`,control:(0,J.jsx)(Nr,{ariaLabel:e.ariaLabel,value:b[e.role],onChange:t=>{k(e.role,t)}}),label:e.label},e.role)),D.map")
  ) {
    let patched = replaceOnce(
      text,
      "function Or({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){",
      `${appearanceSettingsHook("{React:Kr,jsx:J.jsx,SettingRow:G,ColorInput:Nr,Switch:U}")}function Or({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){`,
      "user bubble settings helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "children:[E.map(e=>(0,J.jsx)(G,{size:`compact`,control:(0,J.jsx)(Nr,{ariaLabel:e.ariaLabel,value:b[e.role],onChange:t=>{k(e.role,t)}}),label:e.label},e.role)),D.map",
      "children:[E.map(e=>(0,J.jsx)(G,{size:`compact`,control:(0,J.jsx)(Nr,{ariaLabel:e.ariaLabel,value:b[e.role],onChange:t=>{k(e.role,t)}}),label:e.label},e.role)),...CPXAppearanceRows(n),D.map",
      "user bubble settings row anchor",
    );
  }
  if (
    text.includes("function Ir({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){") &&
    text.includes("children:[D.map(e=>(0,Y.jsx)(W,{control:(0,Y.jsx)(Vr,{ariaLabel:e.ariaLabel,value:x[e.role],onChange:t=>{k(e.role,t)}}),label:e.label,variant:`nested`},e.role)),O.map")
  ) {
    let patched = replaceOnce(
      text,
      "function Ir({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){",
      `${appearanceSettingsHook("{React:ei,jsx:Y.jsx,SettingRow:W,ColorInput:Vr,Switch:Te}")}function Ir({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){`,
      "user bubble settings helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "children:[D.map(e=>(0,Y.jsx)(W,{control:(0,Y.jsx)(Vr,{ariaLabel:e.ariaLabel,value:x[e.role],onChange:t=>{k(e.role,t)}}),label:e.label,variant:`nested`},e.role)),O.map",
      "children:[D.map(e=>(0,Y.jsx)(W,{control:(0,Y.jsx)(Vr,{ariaLabel:e.ariaLabel,value:x[e.role],onChange:t=>{k(e.role,t)}}),label:e.label,variant:`nested`},e.role)),...CPXAppearanceRows(n),O.map",
      "user bubble settings row anchor",
    );
  }
  if (
    text.includes("function Ir({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){") &&
    text.includes("children:[E.map(e=>(0,Y.jsx)(z,{control:(0,Y.jsx)(Vr,{ariaLabel:e.ariaLabel,value:b[e.role],onChange:t=>{O(e.role,t)}}),label:e.label,variant:`nested`},e.role)),D.map")
  ) {
    let patched = replaceOnce(
      text,
      "function Ir({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){",
      `${appearanceSettingsHook("{React:ei,jsx:Y.jsx,SettingRow:z,ColorInput:Vr,Switch:Qt}")}function Ir({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){`,
      "user bubble settings helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "children:[E.map(e=>(0,Y.jsx)(z,{control:(0,Y.jsx)(Vr,{ariaLabel:e.ariaLabel,value:b[e.role],onChange:t=>{O(e.role,t)}}),label:e.label,variant:`nested`},e.role)),D.map",
      "children:[E.map(e=>(0,Y.jsx)(z,{control:(0,Y.jsx)(Vr,{ariaLabel:e.ariaLabel,value:b[e.role],onChange:t=>{O(e.role,t)}}),label:e.label,variant:`nested`},e.role)),...CPXAppearanceRows(n),D.map",
      "user bubble settings row anchor",
    );
  }
  if (
    text.includes("function Lr({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){") &&
    text.includes("children:[T.map(e=>(0,J.jsx)(U,{control:(0,J.jsx)(Hr,{ariaLabel:e.ariaLabel,value:y[e.role],onChange:t=>{O(e.role,t)}}),label:e.label,variant:`nested`},e.role)),E.map")
  ) {
    let patched = replaceOnce(
      text,
      "function Lr({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){",
      `${appearanceSettingsHook("{React:ti,jsx:J.jsx,SettingRow:U,ColorInput:Hr,Switch:ye}")}function Lr({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){`,
      "user bubble settings helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "children:[T.map(e=>(0,J.jsx)(U,{control:(0,J.jsx)(Hr,{ariaLabel:e.ariaLabel,value:y[e.role],onChange:t=>{O(e.role,t)}}),label:e.label,variant:`nested`},e.role)),E.map",
      "children:[T.map(e=>(0,J.jsx)(U,{control:(0,J.jsx)(Hr,{ariaLabel:e.ariaLabel,value:y[e.role],onChange:t=>{O(e.role,t)}}),label:e.label,variant:`nested`},e.role)),...CPXAppearanceRows(n),E.map",
      "user bubble settings row anchor",
    );
  }
  if (
    text.includes("function Lr({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){") &&
    text.includes("children:[D.map(e=>(0,J.jsx)(W,{control:(0,J.jsx)(Hr,{ariaLabel:e.ariaLabel,value:b[e.role],onChange:t=>{k(e.role,t)}}),label:e.label,variant:`nested`},e.role)),O.map")
  ) {
    let patched = replaceOnce(
      text,
      "function Lr({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){",
      `${appearanceSettingsHook("{React:ti,jsx:J.jsx,SettingRow:W,ColorInput:Hr,Switch:Fe}")}function Lr({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){`,
      "user bubble settings helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "children:[D.map(e=>(0,J.jsx)(W,{control:(0,J.jsx)(Hr,{ariaLabel:e.ariaLabel,value:b[e.role],onChange:t=>{k(e.role,t)}}),label:e.label,variant:`nested`},e.role)),O.map",
      "children:[D.map(e=>(0,J.jsx)(W,{control:(0,J.jsx)(Hr,{ariaLabel:e.ariaLabel,value:b[e.role],onChange:t=>{k(e.role,t)}}),label:e.label,variant:`nested`},e.role)),...CPXAppearanceRows(n),O.map",
      "user bubble settings row anchor",
    );
  }
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
  if (
    text.includes("function Lr({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){") &&
    text.includes("children:[D.map(e=>(0,J.jsx)(U,{control:(0,J.jsx)(Hr,{ariaLabel:e.ariaLabel,value:x[e.role],onChange:t=>{k(e.role,t)}}),label:e.label,variant:`nested`},e.role)),O.map")
  ) {
    let patched = replaceOnce(
      text,
      "function Lr({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){",
      `${appearanceSettingsHook("{React:ti,jsx:J.jsx,SettingRow:U,ColorInput:Hr,Switch:I}")}function Lr({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){`,
      "user bubble settings helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "children:[D.map(e=>(0,J.jsx)(U,{control:(0,J.jsx)(Hr,{ariaLabel:e.ariaLabel,value:x[e.role],onChange:t=>{k(e.role,t)}}),label:e.label,variant:`nested`},e.role)),O.map",
      "children:[D.map(e=>(0,J.jsx)(U,{control:(0,J.jsx)(Hr,{ariaLabel:e.ariaLabel,value:x[e.role],onChange:t=>{k(e.role,t)}}),label:e.label,variant:`nested`},e.role)),...CPXAppearanceRows(n),O.map",
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
  if (text.includes("function uIe({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){")) {
    let patched = replaceOnce(
      text,
      "function uIe({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){",
      `${messageComposerHook()}function uIe({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){`,
      "user bubble helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "return(0,pz.jsx)(`form`,{className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),y()},children:",
      "return(0,pz.jsx)(`form`,{\"data-codex-plus-user-entry\":!0,className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),y()},children:",
      "edit user message entry marker anchor",
    );
    return replaceOnce(
      patched,
      "me=B?(0,vz.jsx)(`div`,{className:`w-full p-px`,children:(0,vz.jsx)(uIe,{cwd:b??null,hostId:x,initialMessage:z.trim(),onCancel:()=>{ie(null)},onDraftChange:e=>{ie(e)},onSubmit:oe})}):ee?(0,vz.jsx)(`div`,{\"data-user-message-bubble\":!0,role:I?`button`:void 0,tabIndex:0,className:X(e,`text-left focus-visible:ring-2 focus-visible:ring-token-focus-border focus-visible:outline-none`,I&&`cursor-interaction`),",
      "me=B?(0,vz.jsx)(`div`,{className:`w-full p-px`,children:(0,vz.jsx)(uIe,{cwd:b??null,hostId:x,initialMessage:z.trim(),onCancel:()=>{ie(null)},onDraftChange:e=>{ie(e)},onSubmit:oe})}):ee?(0,vz.jsx)(`div`,{\"data-user-message-bubble\":!0,...CPXBubbleProps({}),role:I?`button`:void 0,tabIndex:0,className:X(e,`text-left focus-visible:ring-2 focus-visible:ring-token-focus-border focus-visible:outline-none`,I&&`cursor-interaction`),",
      "user bubble marker attribute anchor",
    );
  }
  if (
    text.includes("function tG(e){let t=(0,aG.c)(279),") &&
    text.includes("x=(0,oG.jsxs)(`div`,{className:p,children:[g,_,v,b]})")
  ) {
    let patched = replaceOnce(
      text,
      "function tG(e){let t=(0,aG.c)(279),",
      `${messageComposerHook()}function tG(e){let t=(0,aG.c)(279),`,
      "user bubble helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "x=(0,oG.jsxs)(`div`,{className:p,children:[g,_,v,b]})",
      "x=(0,oG.jsxs)(`div`,{...CPXBubbleProps({}),className:p,children:[g,_,v,b]})",
      "user bubble marker attribute anchor",
    );
  }
  if (text.includes("function nun(e){let t=(0,run.c)(94),")) {
    let patched = replaceOnce(
      text,
      "function nun(e){let t=(0,run.c)(94),",
      `${messageComposerHook()}function nun(e){let t=(0,run.c)(94),`,
      "user bubble helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "return(0,pZ.jsx)(`form`,{className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),v()},children:",
      "return(0,pZ.jsx)(`form`,{\"data-codex-plus-user-entry\":!0,className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),v()},children:",
      "edit user message entry marker anchor",
    );
    return replaceOnce(
      patched,
      "ge=B?(0,hZ.jsx)(`div`,{className:`w-full p-px`,children:(0,hZ.jsx)(eun,{cwd:x??null,hostId:S,initialMessage:z.trim(),onCancel:()=>{oe(null)},onDraftChange:e=>{oe(e)},onSubmit:ce})}):ne?(0,hZ.jsx)(`div`,{\"data-user-message-bubble\":!0,role:I?`button`:void 0,",
      "ge=B?(0,hZ.jsx)(`div`,{className:`w-full p-px`,children:(0,hZ.jsx)(eun,{cwd:x??null,hostId:S,initialMessage:z.trim(),onCancel:()=>{oe(null)},onDraftChange:e=>{oe(e)},onSubmit:ce})}):ne?(0,hZ.jsx)(`div`,{\"data-user-message-bubble\":!0,...CPXBubbleProps({}),role:I?`button`:void 0,",
      "user bubble marker attribute anchor",
    );
  }
  if (text.includes("function ZB(e){let t=(0,$B.c)(94),")) {
    let patched = replaceOnce(
      text,
      "function ZB(e){let t=(0,$B.c)(94),",
      `${messageComposerHook()}function ZB(e){let t=(0,$B.c)(94),`,
      "user bubble helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "he=H?(0,tV.jsx)(`div`,{className:`w-full p-px`,children:(0,tV.jsx)(vRe,{cwd:x??null,hostId:S,initialMessage:V.trim(),onCancel:()=>{oe(null)},onDraftChange:e=>{oe(e)},onSubmit:ce})}):te?(0,tV.jsx)(`div`,{\"data-user-message-bubble\":!0,role:R?`button`:void 0,",
      "he=H?(0,tV.jsx)(`div`,{className:`w-full p-px`,children:(0,tV.jsx)(vRe,{cwd:x??null,hostId:S,initialMessage:V.trim(),onCancel:()=>{oe(null)},onDraftChange:e=>{oe(e)},onSubmit:ce})}):te?(0,tV.jsx)(`div`,{\"data-user-message-bubble\":!0,...CPXBubbleProps({}),role:R?`button`:void 0,",
      "user bubble marker attribute anchor",
    );
    return replaceOnce(
      patched,
      "return(0,XB.jsx)(`form`,{className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),v()},children:",
      "return(0,XB.jsx)(`form`,{\"data-codex-plus-user-entry\":!0,className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),v()},children:",
      "edit user message entry marker anchor",
    );
  }
  if (text.includes("function Kc({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){")) {
    let patched = replaceOnce(
      text,
      "function Kc({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){",
      `${messageComposerHook()}function Kc({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){`,
      "user bubble helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "return(0,Jc.jsx)(`form`,{className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),v()},children:",
      "return(0,Jc.jsx)(`form`,{\"data-codex-plus-user-entry\":!0,className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),v()},children:",
      "edit user message entry marker anchor",
    );
    return replaceOnce(
      patched,
      "ve=B?(0,Y.jsx)(`div`,{className:`w-full p-px`,children:(0,Y.jsx)(Kc,{cwd:x??null,hostId:S,initialMessage:ee.trim(),onCancel:()=>{W(null)},onDraftChange:e=>{W(e)},onSubmit:de})}):re?(0,Y.jsx)(`div`,{\"data-user-message-bubble\":!0,role:L?`button`:void 0,",
      "ve=B?(0,Y.jsx)(`div`,{className:`w-full p-px`,children:(0,Y.jsx)(Kc,{cwd:x??null,hostId:S,initialMessage:ee.trim(),onCancel:()=>{W(null)},onDraftChange:e=>{W(e)},onSubmit:de})}):re?(0,Y.jsx)(`div`,{\"data-user-message-bubble\":!0,...CPXBubbleProps({}),role:L?`button`:void 0,",
      "user bubble marker attribute anchor",
    );
  }
  if (text.includes("function IVe({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){")) {
    let patched = replaceOnce(
      text,
      "function IVe({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){",
      `${messageComposerHook()}function IVe({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){`,
      "user bubble helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "return(0,HU.jsx)(`form`,{className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),v()},children:",
      "return(0,HU.jsx)(`form`,{\"data-codex-plus-user-entry\":!0,className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),v()},children:",
      "edit user message entry marker anchor",
    );
    return replaceOnce(
      patched,
      "he=V?(0,KU.jsx)(`div`,{className:`w-full p-px`,children:(0,KU.jsx)(IVe,{cwd:x??null,hostId:S,initialMessage:B.trim(),onCancel:()=>{ie(null)},onDraftChange:e=>{ie(e)},onSubmit:oe})}):q?(0,KU.jsx)(`div`,{\"data-user-message-bubble\":!0,role:L?`button`:void 0,",
      "he=V?(0,KU.jsx)(`div`,{className:`w-full p-px`,children:(0,KU.jsx)(IVe,{cwd:x??null,hostId:S,initialMessage:B.trim(),onCancel:()=>{ie(null)},onDraftChange:e=>{ie(e)},onSubmit:oe})}):q?(0,KU.jsx)(`div`,{\"data-user-message-bubble\":!0,...CPXBubbleProps({}),role:L?`button`:void 0,",
      "user bubble marker attribute anchor",
    );
  }
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
  if (text.includes("function Wxn({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){")) {
    let patched = replaceOnce(
      text,
      "function Wxn({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){",
      `${messageComposerHook()}function Wxn({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){`,
      "user bubble helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "return(0,l9.jsx)(`form`,{className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),v()},children:",
      "return(0,l9.jsx)(`form`,{\"data-codex-plus-user-entry\":!0,className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),v()},children:",
      "edit user message entry marker anchor",
    );
    return replaceOnce(
      patched,
      "ve=B?(0,d9.jsx)(`div`,{className:`w-full p-px`,children:(0,d9.jsx)(Wxn,{cwd:x??null,hostId:S,initialMessage:z.trim(),onCancel:()=>{H(null)},onDraftChange:e=>{H(e)},onSubmit:ue})}):ie?(0,d9.jsx)(`div`,{\"data-user-message-bubble\":!0,role:I?`button`:void 0,tabIndex:0,className:Q(e,`text-left focus-visible:ring-2 focus-visible:ring-token-focus-border focus-visible:outline-none`,I&&`cursor-interaction`),",
      "ve=B?(0,d9.jsx)(`div`,{className:`w-full p-px`,children:(0,d9.jsx)(Wxn,{cwd:x??null,hostId:S,initialMessage:z.trim(),onCancel:()=>{H(null)},onDraftChange:e=>{H(e)},onSubmit:ue})}):ie?(0,d9.jsx)(`div`,{\"data-user-message-bubble\":!0,...CPXBubbleProps({}),role:I?`button`:void 0,tabIndex:0,className:Q(e,`text-left focus-visible:ring-2 focus-visible:ring-token-focus-border focus-visible:outline-none`,I&&`cursor-interaction`),",
      "user bubble marker attribute anchor",
    );
  }
  if (text.includes("function Uqt({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){")) {
    let patched = replaceOnce(
      text,
      "function Uqt({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){",
      `${messageComposerHook()}function Uqt({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){`,
      "user bubble helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "return(0,NZ.jsx)(`form`,{className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),v()},children:",
      "return(0,NZ.jsx)(`form`,{\"data-codex-plus-user-entry\":!0,className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),v()},children:",
      "edit user message entry marker anchor",
    );
    return replaceOnce(
      patched,
      "me=B?(0,FZ.jsx)(`div`,{className:`w-full p-px`,children:(0,FZ.jsx)(Uqt,{cwd:x??null,hostId:S,initialMessage:z.trim(),onCancel:()=>{ie(null)},onDraftChange:e=>{ie(e)},onSubmit:oe})}):ee?(0,FZ.jsx)(`div`,{\"data-user-message-bubble\":!0,role:I?`button`:void 0,tabIndex:0,className:$(e,`text-left focus-visible:ring-2 focus-visible:ring-token-focus-border focus-visible:outline-none`,I&&`cursor-interaction`),",
      "me=B?(0,FZ.jsx)(`div`,{className:`w-full p-px`,children:(0,FZ.jsx)(Uqt,{cwd:x??null,hostId:S,initialMessage:z.trim(),onCancel:()=>{ie(null)},onDraftChange:e=>{ie(e)},onSubmit:oe})}):ee?(0,FZ.jsx)(`div`,{\"data-user-message-bubble\":!0,...CPXBubbleProps({}),role:I?`button`:void 0,tabIndex:0,className:$(e,`text-left focus-visible:ring-2 focus-visible:ring-token-focus-border focus-visible:outline-none`,I&&`cursor-interaction`),",
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
  if (text.includes("\"data-user-message-bubble\":!0,...CPXBubbleProps({}),role:I?`button`:void 0,tabIndex:0,className:X(")) {
    return replaceOnce(
      text,
      "\"data-user-message-bubble\":!0,...CPXBubbleProps({}),role:I?`button`:void 0,",
      "\"data-user-message-bubble\":!0,...CPXBubbleProps({project:{cwd:b,hostId:x}}),role:I?`button`:void 0,",
      "user bubble project marker attribute anchor",
    );
  }
  if (text.includes("...CPXBubbleProps({}),className:p,children:[g,_,v,b]")) {
    return replaceOnce(
      text,
      "...CPXBubbleProps({}),className:p,children:[g,_,v,b]",
      "...CPXBubbleProps({project:{cwd:m,hostId:h}}),className:p,children:[g,_,v,b]",
      "user bubble project marker attribute anchor",
    );
  }
  if (text.includes("\"data-user-message-bubble\":!0,...CPXBubbleProps({}),role:R?`button`:void 0,")) {
    return replaceOnce(
      text,
      "\"data-user-message-bubble\":!0,...CPXBubbleProps({}),role:R?`button`:void 0,",
      "\"data-user-message-bubble\":!0,...CPXBubbleProps({project:{cwd:x,hostId:S}}),role:R?`button`:void 0,",
      "user bubble project marker attribute anchor",
    );
  }
  if (text.includes("\"data-user-message-bubble\":!0,...CPXBubbleProps({}),role:L?`button`:void 0,")) {
    return replaceOnce(
      text,
      "\"data-user-message-bubble\":!0,...CPXBubbleProps({}),role:L?`button`:void 0,",
      "\"data-user-message-bubble\":!0,...CPXBubbleProps({project:{cwd:x,hostId:S}}),role:L?`button`:void 0,",
      "user bubble project marker attribute anchor",
    );
  }
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
  if (text.includes("function WX(e){let t=(0,GX.c)(107),")) {
    let patched = replaceOnce(
      text,
      "function WX(e){let t=(0,GX.c)(107),",
      `${messageComposerHook()}function WX(e){let t=(0,GX.c)(107),`,
      "composer user bubble helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "Ye=(0,qX.jsxs)(`div`,{className:Le,\"data-codex-composer-root\":``,children:[ze,Ve,Je]})",
      "Ye=(0,qX.jsxs)(`div`,{className:Le,\"data-codex-composer-root\":``,...CPXSurfaceProps({}),children:[ze,Ve,Je]})",
      "composer user entry marker render anchor",
    );
  }
  if (text.includes("function Fv(e){let t=(0,Yv.c)(18),")) {
    let patched = replaceOnce(
      text,
      "function Fv(e){let t=(0,Yv.c)(18),",
      `${messageComposerHook()}function Fv(e){let t=(0,Yv.c)(18),`,
      "composer user bubble helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "function Fv(e){let t=(0,Yv.c)(18),{children:n,className:r,utilityBarVariant:i,inert:a,isDragActive:o,layout:s,radiusVariant:c,surfaceVariant:l,onDragEnter:u,onDragLeave:d,onDragOver:f,onDrop:p}=e,",
      "function Fv(e){let t=(0,Yv.c)(18),{children:n,className:r,utilityBarVariant:i,inert:a,isDragActive:o,layout:s,radiusVariant:c,surfaceVariant:l,onDragEnter:u,onDragLeave:d,onDragOver:f,onDrop:p,codexPlusProps:CPX_surfaceProps}=e,CPX_resolvedSurfaceProps=CPX_surfaceProps??CPXSurfaceProps({}),",
      "composer host surface props anchor",
    );
    return replaceOnce(
      patched,
      "D=(0,Xv.jsx)(jc.div,{inert:a,className:E,onDragEnter:u,onDragOver:f,onDragLeave:d,onDrop:p,children:n})",
      "D=(0,Xv.jsx)(jc.div,{inert:a,...CPX_resolvedSurfaceProps,className:E,onDragEnter:u,onDragOver:f,onDragLeave:d,onDrop:p,children:n})",
      "composer user entry marker render anchor",
    );
  }
  if (text.includes("function hj(e){let t=(0,kj.c)(13),")) {
    let patched = replaceOnce(
      text,
      "function hj(e){let t=(0,kj.c)(13),",
      `${messageComposerHook()}function hj(e){let t=(0,kj.c)(13),`,
      "composer user bubble helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "function hj(e){let t=(0,kj.c)(13),{children:n,className:r,externalFooterVariant:i,inert:a,isDragActive:o,layout:s,onDragEnter:c,onDragLeave:l,onDragOver:u,onDrop:d}=e,",
      "function hj(e){let t=(0,kj.c)(13),{children:n,className:r,externalFooterVariant:i,inert:a,isDragActive:o,layout:s,onDragEnter:c,onDragLeave:l,onDragOver:u,onDrop:d,codexPlusProps:CPX_surfaceProps}=e,CPX_resolvedSurfaceProps=CPX_surfaceProps??CPXSurfaceProps({}),",
      "composer host surface props anchor",
    );
    return replaceOnce(
      patched,
      "return t[5]!==n||t[6]!==a||t[7]!==c||t[8]!==l||t[9]!==u||t[10]!==d||t[11]!==v?(y=(0,Aj.jsx)(zo.div,{inert:a,className:v,onDragEnter:c,onDragOver:u,onDragLeave:l,onDrop:d,children:n}),t[5]=n,t[6]=a,t[7]=c,t[8]=l,t[9]=u,t[10]=d,t[11]=v,t[12]=y):y=t[12],y}",
      "return t[5]!==n||t[6]!==a||t[7]!==c||t[8]!==l||t[9]!==u||t[10]!==d||t[11]!==v?(y=(0,Aj.jsx)(zo.div,{inert:a,...CPX_resolvedSurfaceProps,className:v,onDragEnter:c,onDragOver:u,onDragLeave:l,onDrop:d,children:n}),t[5]=n,t[6]=a,t[7]=c,t[8]=l,t[9]=u,t[10]=d,t[11]=v,t[12]=y):y=t[12],y}",
      "composer user entry marker render anchor",
    );
  }
  if (text.includes("function iL(e){let t=(0,vL.c)(13),")) {
    let patched = replaceOnce(
      text,
      "function iL(e){let t=(0,vL.c)(13),",
      `${messageComposerHook()}function iL(e){let t=(0,vL.c)(13),`,
      "composer user bubble helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "function iL(e){let t=(0,vL.c)(13),{children:n,className:r,externalFooterVariant:i,inert:a,isDragActive:o,layout:s,onDragEnter:c,onDragLeave:l,onDragOver:u,onDrop:d}=e,",
      "function iL(e){let t=(0,vL.c)(13),{children:n,className:r,externalFooterVariant:i,inert:a,isDragActive:o,layout:s,onDragEnter:c,onDragLeave:l,onDragOver:u,onDrop:d,codexPlusProps:CPX_surfaceProps}=e,CPX_resolvedSurfaceProps=CPX_surfaceProps??CPXSurfaceProps({}),",
      "composer host surface props anchor",
    );
    return replaceOnce(
      patched,
      "return t[5]!==n||t[6]!==a||t[7]!==c||t[8]!==l||t[9]!==u||t[10]!==d||t[11]!==v?(y=(0,yL.jsx)(Gs.div,{inert:a,className:v,onDragEnter:c,onDragOver:u,onDragLeave:l,onDrop:d,children:n}),t[5]=n,t[6]=a,t[7]=c,t[8]=l,t[9]=u,t[10]=d,t[11]=v,t[12]=y):y=t[12],y}",
      "return t[5]!==n||t[6]!==a||t[7]!==c||t[8]!==l||t[9]!==u||t[10]!==d||t[11]!==v?(y=(0,yL.jsx)(Gs.div,{inert:a,...CPX_resolvedSurfaceProps,className:v,onDragEnter:c,onDragOver:u,onDragLeave:l,onDrop:d,children:n}),t[5]=n,t[6]=a,t[7]=c,t[8]=l,t[9]=u,t[10]=d,t[11]=v,t[12]=y):y=t[12],y}",
      "composer user entry marker render anchor",
    );
  }
  if (text.includes("function MN(e){let t=(0,KN.c)(13),")) {
    let patched = replaceOnce(
      text,
      "function MN(e){let t=(0,KN.c)(13),",
      `${messageComposerHook()}function MN(e){let t=(0,KN.c)(13),`,
      "composer user bubble helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "function MN(e){let t=(0,KN.c)(13),{children:n,className:r,externalFooterVariant:i,inert:a,isDragActive:o,layout:s,onDragEnter:c,onDragLeave:l,onDragOver:u,onDrop:d}=e,",
      "function MN(e){let t=(0,KN.c)(13),{children:n,className:r,externalFooterVariant:i,inert:a,isDragActive:o,layout:s,onDragEnter:c,onDragLeave:l,onDragOver:u,onDrop:d,codexPlusProps:CPX_surfaceProps}=e,CPX_resolvedSurfaceProps=CPX_surfaceProps??CPXSurfaceProps({}),",
      "composer host surface props anchor",
    );
    return replaceOnce(
      patched,
      "(0,qN.jsx)(Xo.div,{inert:a,className:v,",
      "(0,qN.jsx)(Xo.div,{inert:a,...CPX_resolvedSurfaceProps,className:v,",
      "composer user entry marker render anchor",
    );
  }
  if (text.includes("function vP(e){let t=(0,MP.c)(13),")) {
    let patched = replaceOnce(
      text,
      "function vP(e){let t=(0,MP.c)(13),",
      `${messageComposerHook()}function vP(e){let t=(0,MP.c)(13),`,
      "composer user bubble helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "function vP(e){let t=(0,MP.c)(13),{children:n,className:r,externalFooterVariant:i,inert:a,isDragActive:o,layout:s,onDragEnter:c,onDragLeave:l,onDragOver:u,onDrop:d}=e,",
      "function vP(e){let t=(0,MP.c)(13),{children:n,className:r,externalFooterVariant:i,inert:a,isDragActive:o,layout:s,onDragEnter:c,onDragLeave:l,onDragOver:u,onDrop:d,codexPlusProps:CPX_surfaceProps}=e,CPX_resolvedSurfaceProps=CPX_surfaceProps??CPXSurfaceProps({}),",
      "composer host surface props anchor",
    );
    return replaceOnce(
      patched,
      "(0,NP.jsx)(us.div,{inert:a,className:v,",
      "(0,NP.jsx)(us.div,{inert:a,...CPX_resolvedSurfaceProps,className:v,",
      "composer user entry marker render anchor",
    );
  }
  if (text.includes("function II(e){let t=(0,XI.c)(13),")) {
    let patched = replaceOnce(
      text,
      "function II(e){let t=(0,XI.c)(13),",
      `${messageComposerHook()}function II(e){let t=(0,XI.c)(13),`,
      "composer user bubble helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "function II(e){let t=(0,XI.c)(13),{children:n,className:r,externalFooterVariant:i,inert:a,isDragActive:o,layout:s,onDragEnter:c,onDragLeave:l,onDragOver:u,onDrop:d}=e,",
      "function II(e){let t=(0,XI.c)(13),{children:n,className:r,externalFooterVariant:i,inert:a,isDragActive:o,layout:s,onDragEnter:c,onDragLeave:l,onDragOver:u,onDrop:d,codexPlusProps:CPX_surfaceProps}=e,CPX_resolvedSurfaceProps=CPX_surfaceProps??CPXSurfaceProps({}),",
      "composer host surface props anchor",
    );
    return replaceOnce(
      patched,
      "(0,ZI.jsx)(T.div,{inert:a,className:v,",
      "(0,ZI.jsx)(T.div,{inert:a,...CPX_resolvedSurfaceProps,className:v,",
      "composer user entry marker render anchor",
    );
  }
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
  if (text.includes("function zO(e){let t=(0,$O.c)(13),")) {
    let patched = replaceOnce(
      text,
      "function zO(e){let t=(0,$O.c)(13),",
      `${messageComposerHook()}function zO(e){let t=(0,$O.c)(13),`,
      "composer user bubble helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "function zO(e){let t=(0,$O.c)(13),{children:n,className:r,externalFooterVariant:i,inert:a,isDragActive:o,layout:s,onDragEnter:c,onDragLeave:l,onDragOver:u,onDrop:d}=e,",
      "function zO(e){let t=(0,$O.c)(13),{children:n,className:r,externalFooterVariant:i,inert:a,isDragActive:o,layout:s,onDragEnter:c,onDragLeave:l,onDragOver:u,onDrop:d,codexPlusProps:CPX_surfaceProps}=e,CPX_resolvedSurfaceProps=CPX_surfaceProps??CPXSurfaceProps({}),",
      "composer host surface props anchor",
    );
    return replaceOnce(
      patched,
      "return t[5]!==n||t[6]!==a||t[7]!==c||t[8]!==l||t[9]!==u||t[10]!==d||t[11]!==v?(y=(0,ek.jsx)(Ts.div,{inert:a,className:v,onDragEnter:c,onDragOver:u,onDragLeave:l,onDrop:d,children:n}),t[5]=n,t[6]=a,t[7]=c,t[8]=l,t[9]=u,t[10]=d,t[11]=v,t[12]=y):y=t[12],y}",
      "return t[5]!==n||t[6]!==a||t[7]!==c||t[8]!==l||t[9]!==u||t[10]!==d||t[11]!==v?(y=(0,ek.jsx)(Ts.div,{inert:a,...CPX_resolvedSurfaceProps,className:v,onDragEnter:c,onDragOver:u,onDragLeave:l,onDrop:d,children:n}),t[5]=n,t[6]=a,t[7]=c,t[8]=l,t[9]=u,t[10]=d,t[11]=v,t[12]=y):y=t[12],y}",
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
  if (
    text.includes("function dS(e){let t=(0,OS.c)(228),") &&
    text.includes("(0,AS.jsx)(Qv,{utilityBarVariant:Vt,layout:dt,radiusVariant:g,surfaceVariant:_,children:Wt})")
  ) {
    return replaceOnce(
      text,
      "(0,AS.jsx)(Qv,{utilityBarVariant:Vt,layout:dt,radiusVariant:g,surfaceVariant:_,children:Wt})",
      "(0,AS.jsx)(Qv,{key:CPXSurfaceProps({project:{threadId:a,title:a,projectKind:`chat`,projectless:!0}})?.[`data-codex-plus-project-color`]??``,codexPlusProps:CPXSurfaceProps({project:{threadId:a,title:a,projectKind:`chat`,projectless:!0}}),utilityBarVariant:Vt,layout:dt,radiusVariant:g,surfaceVariant:_,children:Wt})",
      "composer project accent style caller anchor",
    );
  }
  if (
    text.includes("function hj(e){let t=(0,kj.c)(13),") &&
    text.includes("(0,TV.jsx)(xV,{className:A,externalFooterVariant:k,hasDropTargetPortal:Vc,")
  ) {
    let patched = replaceOnce(
      text,
      "Xc=(0,TV.jsx)(Af,{active:Ro.ui?.active===!0&&Ro.ui.activation===`synthetic`,onOpen:()=>{cc.prepare(),On.toggleContextSuggestions()}});return",
      "Xc=(0,TV.jsx)(Af,{active:Ro.ui?.active===!0&&Ro.ui.activation===`synthetic`,onOpen:()=>{cc.prepare(),On.toggleContextSuggestions()}}),CPX_composerSurfaceProps=CPXSurfaceProps({project:{cwd:K.cwd,hostId:Tr}});return",
      "composer project style hook-safe caller anchor",
    );
    return replaceOnce(
      patched,
      "(0,TV.jsx)(xV,{className:A,externalFooterVariant:k,hasDropTargetPortal:Vc,",
      "(0,TV.jsx)(xV,{key:CPX_composerSurfaceProps?.[`data-codex-plus-project-color`]??``,codexPlusProps:CPX_composerSurfaceProps,className:A,externalFooterVariant:k,hasDropTargetPortal:Vc,",
      "composer project accent style caller anchor",
    );
  }
  if (
    text.includes("function iL(e){let t=(0,vL.c)(13),") &&
    text.includes("):(0,nJ.jsx)(Qq,{className:k,externalFooterVariant:O,hasDropTargetPortal:Uc,blockReason:Hr,isDragActive:io,isSubmitting:wt,layout:qc,onDragEnter:wc,onDragOver:Ec,onDragLeave:Tc,onDrop:Dc,showShiftOverlay:so,")
  ) {
    let patched = replaceOnce(
      text,
      "Qc=(0,nJ.jsx)(Vm,{active:Go.ui?.active===!0&&Go.ui.activation===`synthetic`,onOpen:()=>{fc.prepare(),Tn.toggleContextSuggestions()}});return",
      "Qc=(0,nJ.jsx)(Vm,{active:Go.ui?.active===!0&&Go.ui.activation===`synthetic`,onOpen:()=>{fc.prepare(),Tn.toggleContextSuggestions()}}),CPX_composerSurfaceProps=CPXSurfaceProps({project:{cwd:li,hostId:Dr}});return",
      "composer project style hook-safe caller anchor",
    );
    return replaceOnce(
      patched,
      "):(0,nJ.jsx)(Qq,{className:k,externalFooterVariant:O,hasDropTargetPortal:Uc,blockReason:Hr,isDragActive:io,isSubmitting:wt,layout:qc,onDragEnter:wc,onDragOver:Ec,onDragLeave:Tc,onDrop:Dc,showShiftOverlay:so,",
      "):(0,nJ.jsx)(Qq,{className:k,externalFooterVariant:O,codexPlusProps:CPX_composerSurfaceProps,key:CPX_composerSurfaceProps?.[`data-codex-plus-project-color`]??``,hasDropTargetPortal:Uc,blockReason:Hr,isDragActive:io,isSubmitting:wt,layout:qc,onDragEnter:wc,onDragOver:Ec,onDragLeave:Tc,onDrop:Dc,showShiftOverlay:so,",
      "composer project accent style caller anchor",
    );
  }
  if (text.includes("(0,kG.jsx)(TG,{className:O,externalFooterVariant:D,hasDropTargetPortal:Jc,")) {
    return replaceOnce(
      text,
      "(0,kG.jsx)(TG,{className:O,externalFooterVariant:D,hasDropTargetPortal:Jc,",
      "(0,kG.jsx)(TG,{key:CPXSurfaceProps({project:{cwd:Rn,hostId:Hr}})?.[`data-codex-plus-project-color`]??``,codexPlusProps:CPXSurfaceProps({project:{cwd:Rn,hostId:Hr}}),className:O,externalFooterVariant:D,hasDropTargetPortal:Jc,",
      "composer project accent style caller anchor",
    );
  }
  if (text.includes("(0,dW.jsx)(sW,{className:T,externalFooterVariant:w,hasDropTargetPortal:Fc,")) {
    return replaceOnce(
      text,
      "(0,dW.jsx)(sW,{className:T,externalFooterVariant:w,hasDropTargetPortal:Fc,",
      "(0,dW.jsx)(sW,{key:CPXSurfaceProps({project:{cwd:Cn,hostId:Ar}})?.[`data-codex-plus-project-color`]??``,codexPlusProps:CPXSurfaceProps({project:{cwd:Cn,hostId:Ar}}),className:T,externalFooterVariant:w,hasDropTargetPortal:Fc,",
      "composer project accent style caller anchor",
    );
  }
  if (text.includes("(0,$q.jsx)(Yq,{className:O,externalFooterVariant:D,hasDropTargetPortal:_c,")) {
    return replaceOnce(
      text,
      "(0,$q.jsx)(Yq,{className:O,externalFooterVariant:D,hasDropTargetPortal:_c,",
      "(0,$q.jsx)(Yq,{key:CPXSurfaceProps({project:{cwd:Cn,hostId:xr}})?.[`data-codex-plus-project-color`]??``,codexPlusProps:CPXSurfaceProps({project:{cwd:Cn,hostId:xr}}),className:O,externalFooterVariant:D,hasDropTargetPortal:_c,",
      "composer project accent style caller anchor",
    );
  }
  if (text.includes("(0,iW.jsx)(eW,{className:A,externalFooterVariant:k,hasDropTargetPortal:fc,")) {
    return replaceOnce(
      text,
      "(0,iW.jsx)(eW,{className:A,externalFooterVariant:k,hasDropTargetPortal:fc,",
      "(0,iW.jsx)(eW,{...CPXSurfaceProps({project:{cwd:fn,hostId:sr}}),className:A,externalFooterVariant:k,hasDropTargetPortal:fc,",
      "composer project accent style caller anchor",
    );
  }
  if (text.includes("function zO(e){let t=(0,$O.c)(13),") && text.includes("(0,Pz.jsx)(Az,{className:O,externalFooterVariant:E,hasDropTargetPortal:yc,")) {
    return replaceOnce(
      text,
      "(0,Pz.jsx)(Az,{className:O,externalFooterVariant:E,hasDropTargetPortal:yc,",
      "(0,Pz.jsx)(Az,{key:CPXSurfaceProps({project:{cwd:U.cwd,hostId:U.hostId}})?.[`data-codex-plus-project-color`]??``,codexPlusProps:CPXSurfaceProps({project:{cwd:U.cwd,hostId:U.hostId}}),className:O,externalFooterVariant:E,hasDropTargetPortal:yc,",
      "composer project accent style caller anchor",
    );
  }
  if (text.includes("function WX(e){let t=(0,GX.c)(107),") && text.includes("(0,NX.jsx)(QBe,{className:C,utilityBarVariant:S,hasDropTargetPortal:Rs,")) {
    return replaceOnce(
      text,
      "(0,NX.jsx)(QBe,{className:C,utilityBarVariant:S,hasDropTargetPortal:Rs,",
      "(0,NX.jsx)(QBe,{key:CPXSurfaceProps({project:{cwd:vn,hostId:xr}})?.[`data-codex-plus-project-color`]??``,...CPXSurfaceProps({project:{cwd:vn,hostId:xr}}),className:C,utilityBarVariant:S,hasDropTargetPortal:Rs,",
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
  if (text.includes("vscodeCommand:{commandId:`chatgpt.newChat`,title:`New Task in ChatGPT Sidebar`")) return text;
  if (text.includes("function uJ(e,t){return`titleIntlId`in e?")) {
    return replaceOnce(
      text,
      "function uJ(e,t){return`titleIntlId`in e?fJ(pJ,e.titleIntlId)?t.formatMessage(pJ[e.titleIntlId]):``:t.formatMessage(mJ[e.electron.menuTitleIntlId])}",
      "function uJ(e,t){return`titleIntlId`in e?fJ(pJ,e.titleIntlId)?t.formatMessage(pJ[e.titleIntlId]):``:e.title??e.electron?.menuTitle??(e.electron?.menuTitleIntlId&&mJ[e.electron.menuTitleIntlId]?t.formatMessage(mJ[e.electron.menuTitleIntlId]):``)}",
      "generic command metadata title fallback anchor",
    );
  }
  if (text.includes("function QY(e,t){return`titleIntlId`in e?")) {
    return replaceOnce(
      text,
      "function QY(e,t){return`titleIntlId`in e?eX(tX,e.titleIntlId)?t.formatMessage(tX[e.titleIntlId]):``:t.formatMessage(nX[e.electron.menuTitleIntlId])}",
      "function QY(e,t){return`titleIntlId`in e?eX(tX,e.titleIntlId)?t.formatMessage(tX[e.titleIntlId]):``:e.title??e.electron?.menuTitle??t.formatMessage(nX[e.electron.menuTitleIntlId])}",
      "generic command metadata title fallback anchor",
    );
  }
  if (text.includes("function p(e,t){return`titleIntlId`in e?")) {
    return replaceOnce(
      text,
      "function p(e,t){return`titleIntlId`in e?h(g,e.titleIntlId)?t.formatMessage(g[e.titleIntlId]):``:t.formatMessage(_[e.electron.menuTitleIntlId])}",
      "function p(e,t){return`titleIntlId`in e?h(g,e.titleIntlId)?t.formatMessage(g[e.titleIntlId]):``:e.title??e.electron?.menuTitle??t.formatMessage(_[e.electron.menuTitleIntlId])}",
      "generic command metadata title fallback anchor",
    );
  }
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
  if (text.includes("function rY(e,t){return`titleIntlId`in e?")) {
    return replaceOnce(
      text,
      "function rY(e,t){return`titleIntlId`in e?aY(oY,e.titleIntlId)?t.formatMessage(oY[e.titleIntlId]):``:t.formatMessage(sY[e.electron.menuTitleIntlId])}",
      "function rY(e,t){return`titleIntlId`in e?aY(oY,e.titleIntlId)?t.formatMessage(oY[e.titleIntlId]):``:e.title??e.electron?.menuTitle??t.formatMessage(sY[e.electron.menuTitleIntlId])}",
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
  if (text.includes("function yJ({commandId:e}){let t=bJ(fJ(e));return t?.menuTitle==null||t.menuTitleIntlId==null?null:{menuTitle:t.menuTitle,menuTitleIntlId:t.menuTitleIntlId}}")) {
    return replaceOnce(
      text,
      "function yJ({commandId:e}){let t=bJ(fJ(e));return t?.menuTitle==null||t.menuTitleIntlId==null?null:{menuTitle:t.menuTitle,menuTitleIntlId:t.menuTitleIntlId}}",
      "function yJ({commandId:e}){let t=bJ(fJ(e));return t?.menuTitle==null?null:{menuTitle:t.menuTitle,menuTitleIntlId:t.menuTitleIntlId}}",
      "ChatGPT command menu runtime title metadata anchor",
    );
  }
  if (text.includes("let m=se?P.filter(tY):P,_;")) {
    return replaceOnce(
      text,
      "let m=se?P.filter(tY):P,_;",
      "let m=[...(se?P.filter(tY):P),...(globalThis.CodexPlus?.ui?.commands?.commandMetadata?.()?.filter?.(e=>!P.some(t=>t.id===e.id))??[])],_;",
      "command menu runtime command metadata anchor",
    );
  }
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

function patchAppCommandPaletteRuntimeCommands(text) {
  let patched = text;
  if (patched.includes("function x2(e,t){return`titleIntlId`in e?")) {
    patched = replaceOnce(
      patched,
      "function x2(e,t){return`titleIntlId`in e?C2(w2,e.titleIntlId)?t.formatMessage(w2[e.titleIntlId]):``:t.formatMessage(T2[e.electron.menuTitleIntlId])}",
      "function x2(e,t){return`titleIntlId`in e?C2(w2,e.titleIntlId)?t.formatMessage(w2[e.titleIntlId]):``:e.title??e.electron?.menuTitle??t.formatMessage(T2[e.electron.menuTitleIntlId])}",
      "app command palette title fallback anchor",
    );
  }
  if (patched.includes("N=vC.filter(e=>!mge(e)||(e.id===`openBrowserTab`||e.id===`toggleBrowserPanel`)&&!C||e.id===`openControlWindow`&&!w||e.id===`installPrimaryRuntime`&&(!T||!O)||!Fp(e.id)&&$t(f,e.id)===0?!1:sGe(e)),") &&
    !patched.includes("CPXCommandPaletteRuntimeCommands")) {
    patched = replaceOnce(
      patched,
      "N=vC.filter(e=>!mge(e)||(e.id===`openBrowserTab`||e.id===`toggleBrowserPanel`)&&!C||e.id===`openControlWindow`&&!w||e.id===`installPrimaryRuntime`&&(!T||!O)||!Fp(e.id)&&$t(f,e.id)===0?!1:sGe(e)),",
      "N=[...vC.filter(e=>!mge(e)||(e.id===`openBrowserTab`||e.id===`toggleBrowserPanel`)&&!C||e.id===`openControlWindow`&&!w||e.id===`installPrimaryRuntime`&&(!T||!O)||!Fp(e.id)&&$t(f,e.id)===0?!1:sGe(e)),...(globalThis.CodexPlus?.ui?.commands?.commandMetadata?.()?.filter?.(e=>!vC.some(t=>t.id===e.id))??[])],",
      "app command palette runtime command metadata anchor",
    );
  }
  if (patched.includes("c=()=>{xf(r.id,`command_menu`),n()},") &&
    !patched.includes("CodexPlus?.commands?.run?.(r.id)")) {
    patched = replaceOnce(
      patched,
      "c=()=>{xf(r.id,`command_menu`),n()},",
      "c=()=>{globalThis.CodexPlus?.commands?.run?.(r.id)===!0||xf(r.id,`command_menu`),n()},",
      "app command palette runtime command dispatch anchor",
    );
  }
  return patched;
}

function patchLocalTaskRow(text) {
  if (text.includes("function lg(e){let t=(0,hg.c)(128),")) {
    let patched = replaceOnce(
      text,
      "function lg(e){let t=(0,hg.c)(128),",
      `${projectColorHook()}function lg(e){let t=(0,hg.c)(128),`,
      "local task row project color helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "dataAttributes:ee.sidebarThreadRow({active:l,hostId:t.hostId,id:n,kind:`local`,pinned:r,title:t.label})",
      "dataAttributes:{...ee.sidebarThreadRow({active:l,hostId:t.hostId,id:n,kind:`local`,pinned:r,title:t.label}),...CPXPR({projectId:t.projectId,label:t.label,path:t.worktreeGitRoot??t.worktreeWorkspaceRoot,cwd:t.worktreeGitRoot??t.worktreeWorkspaceRoot,hostId:t.hostId,threadId:n,title:t.label,projectKind:t.projectId||t.worktreeGitRoot||t.worktreeWorkspaceRoot?void 0:`chat`,projectless:!(t.projectId||t.worktreeGitRoot||t.worktreeWorkspaceRoot)})}",
      "local pending task row project color attributes anchor",
    );
    patched = replaceOnce(
      patched,
      "dataAttributes:ee.sidebarThreadRow({active:l,hostId:null,id:t,kind:`remote`,pinned:r,title:e.task.title??``})",
      "dataAttributes:{...ee.sidebarThreadRow({active:l,hostId:null,id:t,kind:`remote`,pinned:r,title:e.task.title??``}),...CPXPR({hostId:null,threadId:t,title:e.task.title??``})}",
      "remote sidebar row project color attributes anchor",
    );
    return replaceOnce(
      patched,
      "dataAttributes:ee.sidebarThreadRow({active:l,hostId:p,id:o,kind:`local`,pinned:r,title:S})",
      "dataAttributes:{...ee.sidebarThreadRow({active:l,hostId:p,id:o,kind:`local`,pinned:r,title:S}),...CPXPR({projectId:ye,label:ve,path:le,cwd:le,hostId:p,threadId:o,title:S,projectKind:ye||le?void 0:d,projectless:d===`projectless`})}",
      "local sidebar row project color attributes anchor",
    );
  }
  if (text.includes("function Vv(e){let t=(0,qv.c)(128),")) {
    let patched = replaceOnce(
      text,
      "function Vv(e){let t=(0,qv.c)(128),",
      `${projectColorHook()}function Vv(e){let t=(0,qv.c)(128),`,
      "local task row project color helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "dataAttributes:tr.sidebarThreadRow({active:s,hostId:t.hostId,id:n,kind:`local`,pinned:r,title:t.label})",
      "dataAttributes:{...tr.sidebarThreadRow({active:s,hostId:t.hostId,id:n,kind:`local`,pinned:r,title:t.label}),...CPXPR({projectId:t.projectId,label:t.label,path:t.worktreeGitRoot??t.worktreeWorkspaceRoot,cwd:t.worktreeGitRoot??t.worktreeWorkspaceRoot,hostId:t.hostId,threadId:n,title:t.label,projectKind:t.projectId||t.worktreeGitRoot||t.worktreeWorkspaceRoot?void 0:`chat`,projectless:!(t.projectId||t.worktreeGitRoot||t.worktreeWorkspaceRoot)})}",
      "local pending task row project color attributes anchor",
    );
    patched = replaceOnce(
      patched,
      "dataAttributes:tr.sidebarThreadRow({active:s,hostId:null,id:t,kind:`remote`,pinned:r,title:e.task.title??``})",
      "dataAttributes:{...tr.sidebarThreadRow({active:s,hostId:null,id:t,kind:`remote`,pinned:r,title:e.task.title??``}),...CPXPR({hostId:null,threadId:t,title:e.task.title??``})}",
      "remote sidebar row project color attributes anchor",
    );
    return replaceOnce(
      patched,
      "dataAttributes:tr.sidebarThreadRow({active:s,hostId:p,id:l,kind:`local`,pinned:r,title:S})",
      "dataAttributes:{...tr.sidebarThreadRow({active:s,hostId:p,id:l,kind:`local`,pinned:r,title:S}),...CPXPR({projectId:ye,label:ve,path:ue,cwd:ue,hostId:p,threadId:l,title:S,projectKind:ye||ue?void 0:u,projectless:u===`projectless`})}",
      "local sidebar row project color attributes anchor",
    );
  }
  if (text.includes("function hd(e){let t=(0,gd.c)(77),")) {
    let patched = replaceOnce(
      text,
      "function hd(e){let t=(0,gd.c)(77),",
      `${projectColorHook()}function hd(e){let t=(0,gd.c)(77),`,
      "local task row project color helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "onClick:y,onDoubleClick:b,onArchive:x,onContextMenu:S,dataAttributes:C}=e,",
      "onClick:y,onDoubleClick:b,onArchive:x,onContextMenu:S,dataAttributes:C=CPXPR({projectId:n.projectId,label:n.label,path:n.worktreeGitRoot??n.worktreeWorkspaceRoot,cwd:n.worktreeGitRoot??n.worktreeWorkspaceRoot,hostId:n.hostId,threadId:n.threadId??n.id,title:n.title??n.label,projectKind:n.projectId||n.worktreeGitRoot||n.worktreeWorkspaceRoot?void 0:`chat`,projectless:!(n.projectId||n.worktreeGitRoot||n.worktreeWorkspaceRoot)})}=e,",
      "local task row project assignment anchor",
    );
    patched = replaceOnce(
      patched,
      "dataAttributes:fn.sidebarThreadRow({active:s,hostId:p,id:l,kind:`local`,pinned:r,title:x})",
      "dataAttributes:{...fn.sidebarThreadRow({active:s,hostId:p,id:l,kind:`local`,pinned:r,title:x}),...CPXPR({projectId:be,label:ve,path:E,cwd:E,hostId:p,threadId:l,title:x,projectKind:be||E?void 0:`chat`,projectless:f})}",
      "local sidebar row project color attributes anchor",
    );
    return replaceOnce(
      patched,
      "Ig={floatStatusIconsRight:!0,hideTimestamp:!0,locationId:`flat-chats`,showPinActionOnHover:!0}",
      "Ig={floatStatusIconsRight:!0,hideTimestamp:!0,locationId:`flat-chats`,showPinActionOnHover:!0,dataAttributes:CPXPR({projectKind:`chat`,projectless:!0,hostId:`local`,id:`flat-chats`,title:`Chats`})}",
      "flat chat row projectless color attributes anchor",
    );
  }
  if (text.includes("function hd(e){let t=(0,gd.c)(55),")) {
    let patched = replaceOnce(
      text,
      "function hd(e){let t=(0,gd.c)(55),",
      `${projectColorHook()}function hd(e){let t=(0,gd.c)(55),`,
      "local task row project color helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "onClick:y,onDoubleClick:b,onArchive:x,onContextMenu:S,dataAttributes:C}=e,",
      "onClick:y,onDoubleClick:b,onArchive:x,onContextMenu:S,dataAttributes:C=CPXPR({projectId:n.projectId,label:n.label,path:n.worktreeGitRoot??n.worktreeWorkspaceRoot,cwd:n.worktreeGitRoot??n.worktreeWorkspaceRoot,hostId:n.hostId,threadId:n.threadId??n.id,title:n.title??n.label,projectKind:n.projectId||n.worktreeGitRoot||n.worktreeWorkspaceRoot?void 0:`chat`,projectless:!(n.projectId||n.worktreeGitRoot||n.worktreeWorkspaceRoot)})}=e,",
      "local task row project assignment anchor",
    );
    patched = replaceOnce(
      patched,
      "dataAttributes:Zr.sidebarThreadRow({active:s,hostId:f,id:c,kind:`local`,pinned:r,title:x})",
      "dataAttributes:{...Zr.sidebarThreadRow({active:s,hostId:f,id:c,kind:`local`,pinned:r,title:x}),...CPXPR({projectId:be,label:ye,path:k,cwd:k,hostId:f,threadId:c,title:x,projectKind:be||k?void 0:`chat`,projectless:!(be||k)})}",
      "local conversation row project color attributes anchor",
    );
    return replaceOnce(
      patched,
      "sg={floatStatusIconsRight:!0,hideTimestamp:!0,locationId:`flat-chats`,showPinActionOnHover:!0}",
      "sg={floatStatusIconsRight:!0,hideTimestamp:!0,locationId:`flat-chats`,showPinActionOnHover:!0,dataAttributes:CPXPR({projectKind:`chat`,projectless:!0,hostId:`local`,id:`flat-chats`,title:`Chats`})}",
      "flat chat row projectless color attributes anchor",
    );
  }
  if (text.includes("function jy(e){let t=(0,Fy.c)(57),")) {
    return replaceOnce(
      text,
      "dataAttributes:Ta.sidebarThreadRow({active:c,hostId:f,id:s,kind:`local`,pinned:r,title:x})",
      "dataAttributes:{...Ta.sidebarThreadRow({active:c,hostId:f,id:s,kind:`local`,pinned:r,title:x}),...CPXPR({projectId:X,label:ge,path:O,cwd:O,hostId:f,threadId:s,title:x,projectKind:X||O?void 0:`chat`,projectless:!(X||O)})}",
      "local task row project assignment anchor",
    );
  }
  if (text.includes("function yr(e){let t=(0,xr.c)(134),")) {
    let patched = replaceOnce(
      text,
      "function yr(e){let t=(0,xr.c)(134),",
      `${projectColorHook()}function yr(e){let t=(0,xr.c)(134),`,
      "local task row project color helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "threadSummary:B,dataAttributes:Le}=e,V=u===void 0?!1:u,",
      "threadSummary:B,dataAttributes:Le=CPXPR({projectId:Fe,label:Ie,path:a,cwd:a})}=e,V=u===void 0?!1:u,",
      "local task row project assignment anchor",
    );
  }
  if (text.includes("function Ef(e){let t=(0,Of.c)(134),")) {
    let patched = replaceOnce(
      text,
      "function Ef(e){let t=(0,Of.c)(134),",
      `${projectColorHook()}function Ef(e){let t=(0,Of.c)(134),`,
      "local task row project color helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "threadSummary:le,dataAttributes:ue}=e,de=l===void 0?!1:l,",
      "threadSummary:le,dataAttributes:ue=CPXPR({projectId:oe,label:se,path:r,cwd:r})}=e,de=l===void 0?!1:l,",
      "local task row project assignment anchor",
    );
    if (patched.includes("dataAttributes:Rn.sidebarThreadRow({active:s,hostId:p,id:l,kind:`local`,pinned:r,title:x})")) {
      patched = replaceOnce(
        patched,
        "dataAttributes:Rn.sidebarThreadRow({active:s,hostId:p,id:l,kind:`local`,pinned:r,title:x})",
        "dataAttributes:{...Rn.sidebarThreadRow({active:s,hostId:p,id:l,kind:`local`,pinned:r,title:x}),...CPXPR({projectId:_e,label:ge,path:O,cwd:O,hostId:p,threadId:l,title:x,projectKind:_e||O?void 0:`chat`,projectless:u===`projectless`})}",
        "local sidebar row project color attributes anchor",
      );
    }
    return patched;
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
    if (patched.includes("dataAttributes:kr.sidebarThreadRow({active:s,hostId:p,id:l,kind:`local`,pinned:r,title:x})")) {
      return replaceOnce(
        patched,
        "dataAttributes:kr.sidebarThreadRow({active:s,hostId:p,id:l,kind:`local`,pinned:r,title:x})",
        "dataAttributes:{...kr.sidebarThreadRow({active:s,hostId:p,id:l,kind:`local`,pinned:r,title:x}),...CPXPR({projectId:ve,label:ge,path:D,cwd:D,hostId:p,threadId:l,title:x,projectKind:ve||D?void 0:`chat`,projectless:u===`projectless`})}",
        "local sidebar row project color attributes anchor",
      );
    }
    return replaceOnce(
      patched,
      "dataAttributes:Rn.sidebarThreadRow({active:s,hostId:p,id:l,kind:`local`,pinned:r,title:x})",
      "dataAttributes:{...Rn.sidebarThreadRow({active:s,hostId:p,id:l,kind:`local`,pinned:r,title:x}),...CPXPR({projectId:ve,label:ge,path:D,cwd:D,hostId:p,threadId:l,title:x,projectKind:ve||D?void 0:`chat`,projectless:u===`projectless`})}",
      "local sidebar row project color attributes anchor",
    );
  }
  if (text.includes("function sm(e){let t=(0,pm.c)(129),")) {
    let patched = replaceOnce(
      text,
      "function sm(e){let t=(0,pm.c)(129),",
      `${projectColorHook()}function sm(e){let t=(0,pm.c)(129),`,
      "local task row project color helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "onClick:y,onDoubleClick:b,onArchive:x,onContextMenu:S,dataAttributes:C}=e,",
      "onClick:y,onDoubleClick:b,onArchive:x,onContextMenu:S,dataAttributes:C=CPXPR({projectId:n.projectId,label:n.label,path:n.worktreeGitRoot??n.worktreeWorkspaceRoot,cwd:n.worktreeGitRoot??n.worktreeWorkspaceRoot,hostId:n.hostId,threadId:n.threadId??n.id,title:n.title??n.label,projectKind:n.projectId||n.worktreeGitRoot||n.worktreeWorkspaceRoot?void 0:`chat`,projectless:!(n.projectId||n.worktreeGitRoot||n.worktreeWorkspaceRoot)})}=e,",
      "local task row project assignment anchor",
    );
    patched = replaceOnce(
      patched,
      "dataAttributes:Xt.sidebarThreadRow({active:c,hostId:p,id:r,kind:`local`,pinned:i,title:S})",
      "dataAttributes:{...Xt.sidebarThreadRow({active:c,hostId:p,id:r,kind:`local`,pinned:i,title:S}),...CPXPR({projectId:_e,label:ge,path:A,cwd:A,hostId:p,threadId:r,title:S,projectKind:_e||A?void 0:`chat`,projectless:u===`projectless`})}",
      "local sidebar row project color attributes anchor",
    );
    return replaceOnce(
      patched,
      "g_={floatStatusIconsRight:!0,hideTimestamp:!0,locationId:`flat-chats`,showPinActionOnHover:!0}",
      "g_={floatStatusIconsRight:!0,hideTimestamp:!0,locationId:`flat-chats`,showPinActionOnHover:!0,dataAttributes:CPXPR({projectKind:`chat`,projectless:!0,hostId:`local`,id:`flat-chats`,title:`Chats`})}",
      "flat chat row projectless color attributes anchor",
    );
  }
  if (text.includes("function sB(e){let t=(0,pB.c)(129),")) {
    let patched = replaceOnce(
      text,
      "function sB(e){let t=(0,pB.c)(129),",
      `${projectColorHook()}function sB(e){let t=(0,pB.c)(129),`,
      "local task row project color helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "dataAttributes:wd.sidebarThreadRow({active:s,hostId:p,id:l,kind:`local`,pinned:r,title:x})",
      "dataAttributes:{...wd.sidebarThreadRow({active:s,hostId:p,id:l,kind:`local`,pinned:r,title:x}),...CPXPR({projectId:be,label:ye,path:E,cwd:E,hostId:p,threadId:l,title:x,projectKind:be||E?void 0:`chat`,projectless:f})}",
      "local sidebar row project color attributes anchor",
    );
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
  if (text.includes("function vwr(e){let t=(0,ywr.c)(19),")) {
    let patched = replaceOnce(
      text,
      "function vwr(e){let t=(0,ywr.c)(19),",
      `${mermaidDiagramHook()}function vwr(e){let t=(0,ywr.c)(19),`,
      "mermaid diagram shell helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "E=(0,p2.jsx)(`div`,{ref:d,className:C,\"data-wide-markdown-block\":w,\"data-wide-markdown-block-kind\":c,children:T})",
      "E=(0,p2.jsx)(`div`,{ref:d,...CPXMermaidDiagramProps({code:a}),className:C,\"data-wide-markdown-block\":w,\"data-wide-markdown-block-kind\":c,children:T})",
      "mermaid diagram shell host props anchor",
    );
  }
  if (text.includes("function bz(e){let t=(0,xz.c)(19),")) {
    let patched = replaceOnce(
      text,
      "function bz(e){let t=(0,xz.c)(19),",
      `${mermaidDiagramHook()}function bz(e){let t=(0,xz.c)(19),`,
      "mermaid diagram shell helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "E=(0,Cz.jsx)(`div`,{ref:d,className:C,\"data-wide-markdown-block\":w,\"data-wide-markdown-block-kind\":c,children:T})",
      "E=(0,Cz.jsx)(`div`,{ref:d,...CPXMermaidDiagramProps({code:a}),className:C,\"data-wide-markdown-block\":w,\"data-wide-markdown-block-kind\":c,children:T})",
      "mermaid diagram shell host props anchor",
    );
  }
  if (text.includes("function COt(e){let t=(0,wOt.c)(19),")) {
    let patched = replaceOnce(
      text,
      "function COt(e){let t=(0,wOt.c)(19),",
      `${mermaidDiagramHook()}function COt(e){let t=(0,wOt.c)(19),`,
      "mermaid diagram shell helper insertion anchor",
    );
    return replaceOnce(
      patched,
      'E=(0,yB.jsx)(`div`,{ref:d,className:C,"data-wide-markdown-block":w,"data-wide-markdown-block-kind":c,children:T})',
      'E=(0,yB.jsx)(`div`,{ref:d,...CPXMermaidDiagramProps({code:a}),className:C,"data-wide-markdown-block":w,"data-wide-markdown-block-kind":c,children:T})',
      "mermaid diagram shell host props anchor",
    );
  }
  if (text.includes("function pbe(e){let t=(0,Q8.c)(19),")) {
    let patched = replaceOnce(
      text,
      "function pbe(e){let t=(0,Q8.c)(19),",
      `${mermaidDiagramHook()}function pbe(e){let t=(0,Q8.c)(19),`,
      "mermaid diagram shell helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "E=(0,e5.jsx)(`div`,{ref:d,className:C,\"data-wide-markdown-block\":w,\"data-wide-markdown-block-kind\":c,children:T})",
      "E=(0,e5.jsx)(`div`,{ref:d,...CPXMermaidDiagramProps({code:a}),className:C,\"data-wide-markdown-block\":w,\"data-wide-markdown-block-kind\":c,children:T})",
      "mermaid diagram shell host props anchor",
    );
  }
  if (text.includes("function Npe(e){let t=(0,_4.c)(19),")) {
    let patched = replaceOnce(
      text,
      "function Npe(e){let t=(0,_4.c)(19),",
      `${mermaidDiagramHook()}function Npe(e){let t=(0,_4.c)(19),`,
      "mermaid diagram shell helper insertion anchor",
    );
    return replaceOnce(
      patched,
      'D=(0,y4.jsx)(`div`,{ref:d,className:C,"data-wide-markdown-block":T,"data-wide-markdown-block-kind":c,children:E})',
      'D=(0,y4.jsx)(`div`,{ref:d,...CPXMermaidDiagramProps({code:a}),className:C,"data-wide-markdown-block":T,"data-wide-markdown-block-kind":c,children:E})',
      "mermaid diagram shell host props anchor",
    );
  }
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
  if (text.includes("function m_(e){let t=(0,h_.c)(19),")) {
    let patched = replaceOnce(
      text,
      "function m_(e){let t=(0,h_.c)(19),",
      `${mermaidDiagramHook()}function m_(e){let t=(0,h_.c)(19),`,
      "mermaid diagram shell helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "E=(0,__.jsx)(`div`,{ref:d,className:C,\"data-wide-markdown-block\":w,\"data-wide-markdown-block-kind\":c,children:T})",
      "E=(0,__.jsx)(`div`,{ref:d,...CPXMermaidDiagramProps({code:a}),className:C,\"data-wide-markdown-block\":w,\"data-wide-markdown-block-kind\":c,children:T})",
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
  if (text.includes("function or({blockRef:e,code:t,isCodeFenceOpen:n,isDark:r,isVisible:i,onError:a,onRendered:o,renderKey:c}){")) {
    let patched = replaceOnce(
      text,
      "function or({blockRef:e,code:t,isCodeFenceOpen:n,isDark:r,isVisible:i,onError:a,onRendered:o,renderKey:c}){",
      `${mermaidDiagramHook()}function or({blockRef:e,code:t,isCodeFenceOpen:n,isDark:r,isVisible:i,onError:a,onRendered:o,renderKey:c}){`,
      "mermaid diagram shell helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "(0,X.jsx)(`div`,{ref:u,className:ee(vr,!i&&`invisible`,p?`max-h-[var(--markdown-wide-block-max-height)] overflow-auto`:`overflow-x-auto`),\"aria-hidden\":!i||void 0,",
      "(0,X.jsx)(`div`,{ref:u,...CPXMermaidDiagramProps({code:t}),className:ee(vr,!i&&`invisible`,p?`max-h-[var(--markdown-wide-block-max-height)] overflow-auto`:`overflow-x-auto`),\"aria-hidden\":!i||void 0,",
      "mermaid diagram shell host props anchor",
    );
  }
  if (text.includes("function cr({blockRef:e,code:t,isCodeFenceOpen:r,isDark:a,isVisible:s,onError:c,onRendered:l,renderKey:d}){")) {
    let patched = replaceOnce(
      text,
      "function cr({blockRef:e,code:t,isCodeFenceOpen:r,isDark:a,isVisible:s,onError:c,onRendered:l,renderKey:d}){",
      `${mermaidDiagramHook()}function cr({blockRef:e,code:t,isCodeFenceOpen:r,isDark:a,isVisible:s,onError:c,onRendered:l,renderKey:d}){`,
      "mermaid diagram shell helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "(0,X.jsxs)(`div`,{className:`relative`,\"data-markdown-copy\":`code-block`,\"data-markdown-copy-text\":T,children:[",
      "(0,X.jsxs)(`div`,{...CPXMermaidDiagramProps({code:t}),className:`relative`,\"data-markdown-copy\":`code-block`,\"data-markdown-copy-text\":T,children:[",
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
  if (text.includes("e.contextBridge.exposeInMainWorld(`codexWindowType`,g),e.contextBridge.exposeInMainWorld(`electronBridge`,j),typeof window<`u`")) {
    return replaceOnce(
      text,
      "e.contextBridge.exposeInMainWorld(`codexWindowType`,g),e.contextBridge.exposeInMainWorld(`electronBridge`,j),typeof window<`u`",
      "e.contextBridge.exposeInMainWorld(`codexWindowType`,g),e.contextBridge.exposeInMainWorld(`electronBridge`,j),e.contextBridge.exposeInMainWorld(`codexPlusNative`,{request:(t,n)=>e.ipcRenderer.invoke(`codex_plus:native-request`,{method:t,params:n})}),typeof window<`u`",
      "codex plus native preload bridge anchor",
    );
  }
  return replaceOnce(
    text,
    "e.contextBridge.exposeInMainWorld(`codexWindowType`,m),e.contextBridge.exposeInMainWorld(`electronBridge`,D),typeof window<`u`",
    "e.contextBridge.exposeInMainWorld(`codexWindowType`,m),e.contextBridge.exposeInMainWorld(`electronBridge`,D),e.contextBridge.exposeInMainWorld(`codexPlusNative`,{request:(t,n)=>e.ipcRenderer.invoke(`codex_plus:native-request`,{method:t,params:n})}),typeof window<`u`",
    "codex plus native preload bridge anchor",
  );
}

function patchAppProtocolRoutes(text) {
  const withWindowsFetch =
    "function we(e){Oe(),r.protocol.handle(`app`,async t=>{let n=Se(t.url,e);return n?Pe(n)?Fe(t,n):process.platform===`win32`?r.net.fetch((0,b.pathToFileURL)(n).toString()):Te(n):new Response(null,{status:404,statusText:`Not Found`})})}";
  const withWindowsFetchRedirect =
    "function we(e){Oe(),r.protocol.handle(`app`,async t=>{let i=je(t.url),a=i&&i!==`/`&&!i.includes(`.`)&&!Me(i)?xe(i):null;if(a)return Response.redirect(a);let n=Se(t.url,e);return n?Pe(n)?Fe(t,n):process.platform===`win32`?r.net.fetch((0,b.pathToFileURL)(n).toString()):Te(n):new Response(null,{status:404,statusText:`Not Found`})})}";
  if (text.includes(withWindowsFetch)) {
    return replaceOnce(text, withWindowsFetch, withWindowsFetchRedirect, "app protocol deep route initialRoute redirect anchor");
  }
  return replaceOnce(
    text,
    "function we(e){Oe(),r.protocol.handle(`app`,async t=>{let n=Se(t.url,e);return n?Pe(n)?Fe(t,n):Te(n):new Response(null,{status:404,statusText:`Not Found`})})}",
    "function we(e){Oe(),r.protocol.handle(`app`,async t=>{let i=je(t.url),a=i&&i!==`/`&&!i.includes(`.`)&&!Me(i)?xe(i):null;if(a)return Response.redirect(a);let n=Se(t.url,e);return n?Pe(n)?Fe(t,n):Te(n):new Response(null,{status:404,statusText:`Not Found`})})}",
    "app protocol deep route initialRoute redirect anchor",
  );
}

function patchMainNativeBridge(text) {
  if (text.includes("function V6(e){let{desktopSentry:t,hotkeyWindowLifecycleManager:i,") && text.includes("H6({buildFlavor:o,getContextForWebContents:R.getContextForWebContents,isTrustedIpcEvent:ae,usesOwlAppShell:x}),")) {
    let patched = replaceOnce(
      text,
      "function V6(e){let{desktopSentry:t,hotkeyWindowLifecycleManager:i,",
      `${nativeMainHook({ electronName: "c" })}function V6(e){let{desktopSentry:t,hotkeyWindowLifecycleManager:i,`,
      "codex plus native main helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "H6({buildFlavor:o,getContextForWebContents:R.getContextForWebContents,isTrustedIpcEvent:ae,usesOwlAppShell:x}),",
      "H6({buildFlavor:o,getContextForWebContents:R.getContextForWebContents,isTrustedIpcEvent:ae,usesOwlAppShell:x}),CPXNative.registerNativeRequest({isTrustedIpcEvent:ae}),",
      "codex plus native main registration anchor",
    );
  }
  if (text.includes("function _4(e){let{") && text.includes("U2(l,k),z2(k);let A=!1;")) {
    let patched = replaceOnce(
      text,
      "function _4(e){let{",
      `${nativeMainHook()}function _4(e){let{`,
      "codex plus native main helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "U2(l,k),z2(k);let A=!1;",
      "U2(l,k),z2(k),CPXNative.registerNativeRequest({isTrustedIpcEvent:k});let A=!1;",
      "codex plus native main registration anchor",
    );
  }
  if (text.includes("function b4(e){let{") && text.includes("K2(l,k),H2(k);let A=!1;")) {
    let patched = replaceOnce(
      text,
      "function b4(e){let{",
      `${nativeMainHook()}function b4(e){let{`,
      "codex plus native main helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "K2(l,k),H2(k);let A=!1;",
      "K2(l,k),H2(k),CPXNative.registerNativeRequest({isTrustedIpcEvent:k});let A=!1;",
      "codex plus native main registration anchor",
    );
  }
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
  if (text.includes("at={...D(`toggleSidePanel`),click:async()=>{let e=await E();e&&_.sendMessageToWindow(e,{type:`toggle-diff-panel`})}},ot=")) {
    let patched = replaceOnce(
      text,
      "at={...D(`toggleSidePanel`),click:async()=>{let e=await E();e&&_.sendMessageToWindow(e,{type:`toggle-diff-panel`})}},ot=",
      "at={...D(`toggleSidePanel`),click:async()=>{let e=await E();e&&_.sendMessageToWindow(e,{type:`toggle-diff-panel`})}},ot=",
      "codex plus menu template helper presence anchor",
    );
    patched = replaceOnce(
      patched,
      "Me,Ne,Pe,Fe,Ie,...l.browserPane?[Le]:[],at,...l.browserPane?",
      "Me,Ne,Pe,Fe,Ie,...l.browserPane?[Le]:[],at,...CPXNative.templateItems(`view-menu`),...l.browserPane?",
      "codex plus view menu template items anchor",
    );
    return replaceOnce(
      patched,
      "w=()=>{C.refresh()};return{applicationMenuManager:C,",
      "w=()=>{C.refresh()};CPXNative.setRefreshApplicationMenu(w),CPXNative.logMenuDiagnostics();return{applicationMenuManager:C,",
      "codex plus menu diagnostics refresh anchor",
    );
  }
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

function patchStatsigDevFallback(text) {
  text = patchLocalThreadCatalogBootstrap(text);
  const providerPattern =
    /function ([A-Za-z0-9_$]+)\(e\)\{let t=\(0,([A-Za-z0-9_$]+)\.c\)\((\d+)\),\{appSessionId:n,appVersion:r,auth:i,browserLocale:a,hostBuildFlavor:o,stableId:s,statsigClientKey:c,systemName:l,systemVersion:u,children:d\}=e,/;
  const match = text.match(providerPattern);
  if (!match) {
    if (!text.includes("Timed out while fetching post-login Statsig bootstrap")) return text;
    throw new Error("Could not find post-login Statsig provider anchor");
  }
  const [anchor, functionName, cacheName, cacheSize] = match;
  const providerStart = match.index ?? text.indexOf(anchor);
  const providerBody = text.slice(providerStart, providerStart + 2500);
  const jsxMatch = providerBody.match(/\(0,([A-Za-z0-9_$]+)\.jsx\)\([A-Za-z0-9_$]+,\{appSessionId:n,appVersion:r,auth:i,browserLocale:a,/);
  if (!jsxMatch) throw new Error("Could not find post-login Statsig provider JSX helper");
  const jsxName = jsxMatch[1];
  const readyProviderMatch = providerBody.match(new RegExp(
    "\\(0," +
      jsxName +
      "\\.jsx\\)\\(([A-Za-z0-9_$]+),\\{appVersion:r,authMethod:i\\.authMethod,client:p,deviceId:s,hostBuildFlavor:o,children:d\\}",
  ));
  if (!readyProviderMatch) throw new Error("Could not find post-login Statsig ready provider");
  const readyProvider = readyProviderMatch[1];
  const statsigClientMatch = providerBody.match(
    /new ([A-Za-z0-9_$]+)\.StatsigClient\(c,t\.user,([A-Za-z0-9_$]+)\)/,
  );
  if (!statsigClientMatch) throw new Error("Could not find post-login Statsig client constructor");
  const statsigNamespace = statsigClientMatch[1];
  const statsigOptions = statsigClientMatch[2];
  const replacement =
    `function ${functionName}(e){let t=(0,${cacheName}.c)(${Math.max(Number(cacheSize), 18)}),{appSessionId:n,appVersion:r,auth:i,browserLocale:a,hostBuildFlavor:o,stableId:s,statsigClientKey:c,systemName:l,systemVersion:u,children:d}=e,f,CPXStatsigFallback=globalThis.__CodexPlusRuntimeConfig?.devModeStatsigFallback===true;if(CPXStatsigFallback){let e,f,p,m;if(t[0]!==n||t[1]!==r||t[2]!==i.accountId||t[3]!==i.authMethod||t[4]!==i.email||t[5]!==i.userId||t[6]!==a||t[7]!==o||t[8]!==s||t[9]!==c||t[10]!==l||t[11]!==u){e={userID:i.userId??i.accountUserId??s,email:i.email??void 0,locale:a,customIDs:{...s==null?{}:{stableID:s},...i.accountId==null?{}:{account_id:i.accountId}},appVersion:r,custom:{auth_status:i.authMethod===\`chatgpt\`?\`logged_in\`:\`logged_out\`,auth_method:i.authMethod??void 0,account_id:i.accountId??void 0,plan_type:i.planAtLogin??void 0,compute_residency:i.computeResidency??void 0,brand_name:ES,systemName:l,systemVersion:u,codex_window_type:\`electron\`,codex_build_flavor:o,codex_app_session_id:n??void 0}},f=new ${statsigNamespace}.StatsigClient(c,e,${statsigOptions}),f.initializeSync(),t[0]=n,t[1]=r,t[2]=i.accountId,t[3]=i.authMethod,t[4]=i.email,t[5]=i.userId,t[6]=a,t[7]=o,t[8]=s,t[9]=c,t[10]=l,t[11]=u,t[12]=f}else f=t[12];return t[13]!==r||t[14]!==i.authMethod||t[15]!==f||t[16]!==d||t[17]!==o?(p=(0,${jsxName}.jsx)(${readyProvider},{appVersion:r,authMethod:i.authMethod,client:f,deviceId:s,hostBuildFlavor:o,children:d}),t[13]=r,t[14]=i.authMethod,t[15]=f,t[16]=d,t[17]=o,t[18]=p):p=t[18],p}`;
  return replaceOnce(text, anchor, replacement, "post-login Statsig dev fallback provider anchor");
}

function patchLocalThreadCatalogEnabled(text) {
  const anchors = [
    ["CV=En(SV,!1),wV=ot(W,null)", "CV=En(SV,!0),wV=ot(W,null)"],
    ["JB=Qd(qB,!1),YB=S(q,null)", "JB=Qd(qB,!0),YB=S(q,null)"],
    ["MY=te(T,!1),NY=te(T,jY)", "MY=te(T,!0),NY=te(T,jY)"],
    ["tQ=R(m,!1),nQ=R(m,eQ)", "tQ=R(m,!0),nQ=R(m,eQ)"],
  ];
  const match = anchors.find(([anchor]) => text.includes(anchor));
  if (!match) throw new Error("Could not find local thread catalog enabled anchor");
  return replaceOnce(text, match[0], match[1], "local thread catalog enabled anchor");
}

function patchChatGptStartupAnnouncements(text) {
  if (text.includes("function _Ce({appBrand:e,buildFlavor:t,platform:n}){return(n===`macOS`||n===`windows`)&&e===Du.ChatGPT&&t!=null&&t!==Il.Agent&&t!==Il.Dev}")) {
    let patched = replaceOnce(
      text,
      "function _Ce({appBrand:e,buildFlavor:t,platform:n}){return(n===`macOS`||n===`windows`)&&e===Du.ChatGPT&&t!=null&&t!==Il.Agent&&t!==Il.Dev}",
      "function _Ce({appBrand:e,buildFlavor:t,platform:n}){return false}",
      "ChatGPT migration announcement eligibility anchor",
    );
    return replaceOnce(
      patched,
      "function EA(e){let t=(0,DA.c)(26),{announcementSource:n,body:r,dismissAnnouncement:i,model:a,modelName:o,onTryModel:s,showSecondaryAction:c}=e,",
      "function EA(e){return null;let t=(0,DA.c)(26),{announcementSource:n,body:r,dismissAnnouncement:i,model:a,modelName:o,onTryModel:s,showSecondaryAction:c}=e,",
      "ChatGPT model upgrade announcement modal anchor",
    );
  }
  let patched = replaceOnce(
    text,
    "function Nce({appBrand:e,buildFlavor:t,platform:n}){return(n===`macOS`||n===`windows`)&&e===gc.ChatGPT&&t!=null&&t!==xd.Agent&&t!==xd.Dev}",
    "function Nce({appBrand:e,buildFlavor:t,platform:n}){return false}",
    "ChatGPT migration announcement eligibility anchor",
  );
  return replaceOnce(
    patched,
    "function jM(e){let t=(0,MM.c)(26),{announcementSource:n,body:r,dismissAnnouncement:i,model:a,modelName:o,onTryModel:s,showSecondaryAction:c}=e,",
    "function jM(e){return null;let t=(0,MM.c)(26),{announcementSource:n,body:r,dismissAnnouncement:i,model:a,modelName:o,onTryModel:s,showSecondaryAction:c}=e,",
    "ChatGPT model upgrade announcement modal anchor",
  );
}

  const patches = [
    {
      id: "bundle-identity",
      infoPlistStrings: {
        CFBundleDisplayName: appDisplayName,
        CFBundleName: appDisplayName,
        CFBundleIdentifier: bundleIdentifier,
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
      fileTransforms: [[reviewPanelFile, patchThreadSidePanelTabs]],
    },
    ...(threadSidePanelCoreFile && threadSidePanelCoreFile !== reviewPanelFile ? [{
      id: "thread-side-panel-native-context",
      fileTransforms: [[threadSidePanelCoreFile, patchThreadSidePanelNativeProjectContext]],
    }] : []),
    {
      id: "diagnostic-error-boundary",
      fileTransforms: [
        [appShellFile, patchAppShell],
        [errorBoundaryFile, patchErrorBoundary],
      ],
    },
    ...(appProtocolFile ? [{
      id: "app-protocol-deep-route-fallback",
      fileTransforms: [[appProtocolFile, patchAppProtocolRoutes]],
    }] : []),
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
        [appShellFile, patchAppCommandPaletteRuntimeCommands],
        [electronMenuShortcutsFile, patchElectronMenuShortcuts],
        [keyboardShortcutsTitleFallbackFile, patchKeyboardShortcutsSearchInput],
        [keyboardShortcutsSearchInputFile, patchCommandMenuRuntimeCommands],
      ],
    },
    {
      id: "project-selector-shortcut",
      fileTransforms: [
        ...(localActiveWorkspaceRootDropdownFile ? [[localActiveWorkspaceRootDropdownFile, patchLocalActiveWorkspaceRootDropdownProjectSelectorShortcut]] : []),
        ...(homeProjectDropdownFile ? [[homeProjectDropdownFile, patchHomeProjectDropdownProjectSelectorShortcut]] : []),
        [runCommandFile, patchRunCommandProjectSelectorShortcut],
        ...(runCommandInUserMessageAttachments && userMessageAttachmentsFile && userMessageAttachmentsFile !== runCommandFile ? [[userMessageAttachmentsFile, patchRunCommandProjectSelectorShortcut]] : []),
        ...(runCommandExtraFile ? [[runCommandExtraFile, patchRunCommandProjectSelectorShortcut]] : []),
      ],
    },
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
    ...(statsigStartupFile && config.runtimeConfig?.devModeStatsigFallback !== false ? [{
      id: "statsig-dev-fallback",
      fileTransforms: [[statsigStartupFile, patchStatsigDevFallback]],
    }] : []),
    ...(localThreadCatalogStateFile ? [{
      id: "local-thread-catalog-state",
      fileTransforms: [[localThreadCatalogStateFile, patchLocalThreadCatalogEnabled]],
    }] : []),
    ...(chatGptStartupAnnouncementsFile ? [{
      id: "chatgpt-startup-announcements",
      fileTransforms: [[chatGptStartupAnnouncementsFile, patchChatGptStartupAnnouncements]],
    }] : []),
  ];

return makePatchSet({
    id: config.id,
    codexVersion: config.codexVersion,
    bundleVersion: config.bundleVersion,
    asarSha256: config.asarSha256,
    sourceFamily,
    runtimeConfig: {
      ...(config.runtimeConfig || {}),
      bundleVersion: config.bundleVersion,
      codexVersion: config.codexVersion,
      patchedAppDisplayName: appDisplayName,
      patchSetId: config.id,
      sourceFamily,
    },
    assetFiles: codexPlusRuntimeAssets({
      ...(config.runtimeConfig || {}),
      bundleVersion: config.bundleVersion,
      codexVersion: config.codexVersion,
      patchedAppDisplayName: appDisplayName,
      patchSetId: config.id,
      sourceFamily,
    }),
    patches: enabledPatchIds == null ? patches : patches.filter((patch) => enabledPatchIds.has(patch.id)),
  });
}

module.exports = {
  buildCodexPlusPatchSet,
};
