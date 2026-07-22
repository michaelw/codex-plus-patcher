const { codexPlusRuntimeAssets } = require("../../runtime/assets");
const { sourceFamilyConfig } = require("../../core/app-identity");
const { replaceOnce } = require("./replace");
const { makePatchSet } = require("./make-patch-set");
// Reuse is declared separately from the exact owner recorded by each wrapper.
const { patchSetUsesTransformVariant: patchSetOwnsTransformVariant } = require("./transform-ownership");
const { aboutMetadataRequire } = require("./hooks/about");
const { diagnosticDetailsHook } = require("./hooks/diagnostics");
const { mermaidDiagramHook } = require("./hooks/mermaid");
const { messageComposerHook } = require("./hooks/message-composer");
const { nativeMainHook } = require("./hooks/native-main");
const { reviewHook } = require("./hooks/review");
const { projectColorHook } = require("./hooks/sidebar");
const { appearanceSettingsHook, commandMenuItemsExpression } = require("./hooks/settings-commands");
const { threadHeaderActiveHook, threadHeaderBoundTitleHook, threadHeaderContextHook, threadHeaderHook, threadHeaderTitleHook } = require("./hooks/thread-header");
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
  const threadHeaderActionShellFile = files.threadHeaderActionShell;
  const threadTitleFile = files.threadTitle;
  const threadPageHeaderFile = files.threadPageHeader;
  const localConversationPageFile = files.localConversationPage;
  const threadContextFile = files.threadContext;
  const threadContextImportFile = threadContextFile?.split("/").pop();
  const threadSidePanelTabsFile = files.threadSidePanelTabs;
  const reviewPanelFile = files.reviewPanel || threadSidePanelTabsFile;
  const threadSidePanelCoreFile = files.threadSidePanelCore;
  const userMessageAttachmentsFile = files.userMessageAttachments;
  const composerFile = files.composer;
  const composerPrimitiveFile = files.composerPrimitive;
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
  const commandMenuRuntimeFile = files.commandMenuRuntime || keyboardShortcutsSearchInputFile;
  const srcFile = files.src;
  const sidebarThreadKeysFile = files.sidebarThreadKeys;
  const sidebarThreadRowSignalsFile = files.sidebarThreadRowSignals;
  const branchPickerDropdownContentFile = files.branchPickerDropdownContent;
  const reviewDiffRuntimeFile = files.reviewDiffRuntime;
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
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715.52143")) {
    let patched = replaceOnce(
      text,
      "let r=l.app.getName(),o=l.app.getVersion(),s=b5(o),",
      `let CPXAbout=${aboutMetadataRequire()}.aboutPayload(${JSON.stringify(aboutContext)}),r=CPXAbout.appDisplayName,o=l.app.getVersion(),s=b5(o),`,
      "52143 about dialog app name anchor",
    );
    patched = replaceOnce(
      patched,
      "_=f.formatMessage({messageId:u5,defaultMessage:d5}),v=x5(o),y=[...i.o()?[`Powered by Codex & OWL`]:[],g,...v].join(`\n`),",
      "_=f.formatMessage({messageId:u5,defaultMessage:d5}),v=x5(o),CPXAboutLines=CPXAbout.buildInfoLines,y=[...i.o()?[`Powered by Codex & OWL`]:[],g,...v,...CPXAboutLines].join(`\n`),",
      "52143 about dialog build information anchor",
    );
    patched = replaceOnce(
      patched,
      "E5({appDisplayName:r,buildInfoLabel:_,buildInfoText:y,iconDataUrl:p.htmlIconDataUrl,isDark:x,okLabel:h,title:m})",
      "E5({appDisplayName:r,buildInfoLabel:_,buildInfoText:y,codexPlusDisclaimerHeading:CPXAbout.disclaimerHeading,codexPlusDisclaimerBody:CPXAbout.disclaimerBody,iconDataUrl:p.htmlIconDataUrl,isDark:x,okLabel:h,title:m})",
      "52143 about dialog renderer call anchor",
    );
    patched = replaceOnce(
      patched,
      "function E5({appDisplayName:e,buildInfoLabel:t,buildInfoText:n,iconDataUrl:r,isDark:i,okLabel:a,title:o}){let s=r==null?``:",
      "function E5({appDisplayName:e,buildInfoLabel:t,buildInfoText:n,codexPlusDisclaimerHeading:D,codexPlusDisclaimerBody:O,iconDataUrl:r,isDark:i,okLabel:a,title:o}){let CPXAboutMetadata=" +
        aboutMetadataRequire() +
        ",q=CPXAboutMetadata.disclaimerMarkup({escape:Hz.default,heading:D,body:O}),s=r==null?``:",
      "52143 about dialog renderer signature anchor",
    );
    patched = replaceOnce(patched, "    .build-info {\n      width: 100%;\n      margin: 0;\n      line-height: 1.45;", "${CPXAboutMetadata.disclaimerStyles()}\n\n    .build-info {\n      width: 100%;\n      margin: 0;\n      line-height: 1.45;", "52143 about dialog disclaimer styles anchor");
    patched = replaceOnce(patched, "      color: var(--muted-text);\n      white-space: pre-wrap;", "      color: var(--muted-text);\n      text-align: left;\n      white-space: pre-wrap;", "52143 about dialog build info left align anchor");
    patched = replaceOnce(patched, "    .app-name,\n    .build-info,\n    .copyright {", "    .app-name,\n    .codex-plus-disclaimer,\n    .build-info,\n    .copyright {", "52143 about dialog selectable disclaimer anchor");
    return replaceOnce(
      patched,
      '      <div class="app-name" id="app-name">${(0,Hz.default)(e)}</div>\n      <pre class="build-info" aria-label="${(0,Hz.default)(t)}">${(0,Hz.default)(n)}</pre>',
      '      <div class="app-name" id="app-name">${(0,Hz.default)(e)}</div>\n      ${q}\n      <pre class="build-info" aria-label="${(0,Hz.default)(t)}">${(0,Hz.default)(n)}</pre>',
      "52143 about dialog disclaimer insertion anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715")) {
    let patched = replaceOnce(
      text,
      "let r=c.app.getName(),o=c.app.getVersion(),s=x5(o),",
      `let CPXAbout=${aboutMetadataRequire()}.aboutPayload(${JSON.stringify(aboutContext)}),r=CPXAbout.appDisplayName,o=c.app.getVersion(),s=x5(o),`,
      "21316 about dialog app name anchor",
    );
    patched = replaceOnce(
      patched,
      "_=f.formatMessage({messageId:d5,defaultMessage:f5}),v=S5(o),y=[...i.o()?[`Powered by Codex & OWL`]:[],g,...v].join(`\n`),",
      "_=f.formatMessage({messageId:d5,defaultMessage:f5}),v=S5(o),CPXAboutLines=CPXAbout.buildInfoLines,y=[...i.o()?[`Powered by Codex & OWL`]:[],g,...v,...CPXAboutLines].join(`\n`),",
      "21316 about dialog build information anchor",
    );
    patched = replaceOnce(
      patched,
      "D5({appDisplayName:r,buildInfoLabel:_,buildInfoText:y,iconDataUrl:p.htmlIconDataUrl,isDark:x,okLabel:h,title:m})",
      "D5({appDisplayName:r,buildInfoLabel:_,buildInfoText:y,codexPlusDisclaimerHeading:CPXAbout.disclaimerHeading,codexPlusDisclaimerBody:CPXAbout.disclaimerBody,iconDataUrl:p.htmlIconDataUrl,isDark:x,okLabel:h,title:m})",
      "21316 about dialog renderer call anchor",
    );
    patched = replaceOnce(
      patched,
      "function D5({appDisplayName:e,buildInfoLabel:t,buildInfoText:n,iconDataUrl:r,isDark:i,okLabel:a,title:o}){let s=r==null?``:",
      "function D5({appDisplayName:e,buildInfoLabel:t,buildInfoText:n,codexPlusDisclaimerHeading:D,codexPlusDisclaimerBody:O,iconDataUrl:r,isDark:i,okLabel:a,title:o}){let CPXAboutMetadata=" +
        aboutMetadataRequire() +
        ",q=CPXAboutMetadata.disclaimerMarkup({escape:Uz.default,heading:D,body:O}),s=r==null?``:",
      "21316 about dialog renderer signature anchor",
    );
    patched = replaceOnce(patched, "    .build-info {\n      width: 100%;\n      margin: 0;\n      line-height: 1.45;", "${CPXAboutMetadata.disclaimerStyles()}\n\n    .build-info {\n      width: 100%;\n      margin: 0;\n      line-height: 1.45;", "21316 about dialog disclaimer styles anchor");
    patched = replaceOnce(patched, "      color: var(--muted-text);\n      white-space: pre-wrap;", "      color: var(--muted-text);\n      text-align: left;\n      white-space: pre-wrap;", "21316 about dialog build info left align anchor");
    patched = replaceOnce(patched, "    .app-name,\n    .build-info,\n    .copyright {", "    .app-name,\n    .codex-plus-disclaimer,\n    .build-info,\n    .copyright {", "21316 about dialog selectable disclaimer anchor");
    return replaceOnce(
      patched,
      '      <div class="app-name" id="app-name">${(0,Uz.default)(e)}</div>\n      <pre class="build-info" aria-label="${(0,Uz.default)(t)}">${(0,Uz.default)(n)}</pre>',
      '      <div class="app-name" id="app-name">${(0,Uz.default)(e)}</div>\n      ${q}\n      <pre class="build-info" aria-label="${(0,Uz.default)(t)}">${(0,Uz.default)(n)}</pre>',
      "21316 about dialog disclaimer insertion anchor",
    );
  }
  if (text.includes("function g8({appDisplayName:e,buildInfoLabel:t,buildInfoText:n,iconDataUrl:r,isDark:i,okLabel:a,title:o})")) {
    let patched = replaceOnce(
      text,
      "let r=c.app.getName(),o=c.app.getVersion(),s=u8(o),",
      `let CPXAbout=${aboutMetadataRequire()}.aboutPayload(${JSON.stringify(aboutContext)}),r=CPXAbout.appDisplayName,o=c.app.getVersion(),s=u8(o),`,
      "about dialog app name anchor",
    );
    patched = replaceOnce(
      patched,
      "_=f.formatMessage({messageId:e8,defaultMessage:t8}),v=d8(o),y=[...i.o()?[`Powered by Codex & OWL`]:[],g,...v].join(`\n`),",
      "_=f.formatMessage({messageId:e8,defaultMessage:t8}),v=d8(o),CPXAboutLines=CPXAbout.buildInfoLines,y=[...i.o()?[`Powered by Codex & OWL`]:[],g,...v,...CPXAboutLines].join(`\n`),",
      "about dialog build information anchor",
    );
    patched = replaceOnce(
      patched,
      "g8({appDisplayName:r,buildInfoLabel:_,buildInfoText:y,iconDataUrl:p.htmlIconDataUrl,isDark:x,okLabel:h,title:m})",
      "g8({appDisplayName:r,buildInfoLabel:_,buildInfoText:y,codexPlusDisclaimerHeading:CPXAbout.disclaimerHeading,codexPlusDisclaimerBody:CPXAbout.disclaimerBody,iconDataUrl:p.htmlIconDataUrl,isDark:x,okLabel:h,title:m})",
      "about dialog renderer call anchor",
    );
    patched = replaceOnce(
      patched,
      "function g8({appDisplayName:e,buildInfoLabel:t,buildInfoText:n,iconDataUrl:r,isDark:i,okLabel:a,title:o}){let s=r==null?``:",
      "function g8({appDisplayName:e,buildInfoLabel:t,buildInfoText:n,codexPlusDisclaimerHeading:D,codexPlusDisclaimerBody:O,iconDataUrl:r,isDark:i,okLabel:a,title:o}){let CPXAboutMetadata=" +
        aboutMetadataRequire() +
        ",q=CPXAboutMetadata.disclaimerMarkup({escape:xH.default,heading:D,body:O}),s=r==null?``:",
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
      '      <div class="app-name" id="app-name">${(0,xH.default)(e)}</div>\n      <pre class="build-info" aria-label="${(0,xH.default)(t)}">${(0,xH.default)(n)}</pre>',
      '      <div class="app-name" id="app-name">${(0,xH.default)(e)}</div>\n      ${q}\n      <pre class="build-info" aria-label="${(0,xH.default)(t)}">${(0,xH.default)(n)}</pre>',
      "about dialog disclaimer insertion anchor",
    );
  }
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
      "_=f.formatMessage({messageId:Q6,defaultMessage:$6}),v=l8(o),CPXAboutLines=CPXAbout.buildInfoLines,y=[...i.o()?[`Powered by Codex & OWL`]:[],g,...v,...CPXAboutLines].join(`\n`),",
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
      "g=d.formatMessage({messageId:P4,defaultMessage:F4}),_=G4(o),CPXAboutLines=CPXAbout.buildInfoLines,v=[h,..._,``,...CPXAboutLines].join(`\n`),",
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
      "g=d.formatMessage({messageId:L4,defaultMessage:R4}),_=J4(o),CPXAboutLines=CPXAbout.buildInfoLines,v=[h,..._,``,...CPXAboutLines].join(`\n`),",
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
      "g=d.formatMessage({messageId:I4,defaultMessage:L4}),_=q4(o),CPXAboutLines=CPXAbout.buildInfoLines,v=[h,..._,``,...CPXAboutLines].join(`\n`),",
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
    "g=d.formatMessage({messageId:A0,defaultMessage:j0}),_=V0(o),CPXAboutLines=CPXAbout.buildInfoLines,v=[h,..._,``,...CPXAboutLines].join(`\n`),",
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

function patchWorker(text, context = {}) {
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715.31925")) {
    let patched = replaceOnce(text, "var L1=`/usr/bin/git`,", `${workerHook()}var L1=\`/usr/bin/git\`,`, "31925 worker helper insertion anchor");
    patched = replaceOnce(
      patched,
      "function F1({requestKind:e,source:t}){return P1.has(e??``)||I1(t)}",
      "function F1({requestKind:e,source:t}){return P1.has(e??``)||I1(t)||CPXW.isReadOnlyBranchRequest(e,t)}",
      "31925 branch picker git allowlist anchor",
    );
    patched = replaceOnce(
      patched,
      "case`commit-message-diff`:f=Z(await n7(_se(e.params.cwd,e.params.includeUnstaged,this.gitManager,o),i.signal));break;case`submodule-paths`:f=Z({paths:await Pse(this.gitManager.getWorktreeRepositoryForRoot(e.params.root,o),i.signal)});break;",
      "case`commit-message-diff`:f=Z(await n7(_se(e.params.cwd,e.params.includeUnstaged,this.gitManager,o),i.signal));break;case`codex-plus-trace`:f=Z(CPXW.traceRequest(e.params));break;case`repository-targets`:f=Z(await CPXW.repositoryTargetsFromHost(this.gitManager,e.params,o,i.signal,Pse));break;case`codex-plus-branches`:f=Z(await CPXW.listBranches(e.params,i.signal));break;case`codex-plus-current-branch`:f=Z(await CPXW.currentBranch(e.params,i.signal));break;case`submodule-paths`:f=Z({paths:await Pse(this.gitManager.getWorktreeRepositoryForRoot(e.params.root,o),i.signal)});break;",
      "31925 repository-targets worker switch anchor",
    );
    return replaceOnce(
      patched,
      "case`review-patch`:case`commit-message-diff`:case`submodule-paths`:case`cat-file`:",
      "case`review-patch`:case`commit-message-diff`:case`codex-plus-trace`:case`repository-targets`:case`codex-plus-branches`:case`codex-plus-current-branch`:case`submodule-paths`:case`cat-file`:",
      "31925 repository-targets worker readonly method anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715")) {
    let patched = replaceOnce(text, "var z1=`/usr/bin/git`,", `${workerHook()}var z1=\`/usr/bin/git\`,`, "21316 worker helper insertion anchor");
    patched = replaceOnce(patched, "function L1({requestKind:e,source:t}){return I1.has(e??``)||R1(t)}", "function L1({requestKind:e,source:t}){return I1.has(e??``)||R1(t)||CPXW.isReadOnlyBranchRequest(e,t)}", "21316 branch picker git allowlist anchor");
    patched = replaceOnce(
      patched,
      "case`commit-message-diff`:f=Z(await i7(hse(e.params.cwd,e.params.includeUnstaged,this.gitManager,o),i.signal));break;case`submodule-paths`:f=Z({paths:await Mse(this.gitManager.getWorktreeRepositoryForRoot(e.params.root,o),i.signal)});break;",
      "case`commit-message-diff`:f=Z(await i7(hse(e.params.cwd,e.params.includeUnstaged,this.gitManager,o),i.signal));break;case`codex-plus-trace`:f=Z(CPXW.traceRequest(e.params));break;case`repository-targets`:f=Z(await CPXW.repositoryTargetsFromHost(this.gitManager,e.params,o,i.signal,Mse));break;case`codex-plus-branches`:f=Z(await CPXW.listBranches(e.params,i.signal));break;case`codex-plus-current-branch`:f=Z(await CPXW.currentBranch(e.params,i.signal));break;case`submodule-paths`:f=Z({paths:await Mse(this.gitManager.getWorktreeRepositoryForRoot(e.params.root,o),i.signal)});break;",
      "21316 repository-targets worker switch anchor",
    );
    return replaceOnce(
      patched,
      "case`review-patch`:case`commit-message-diff`:case`submodule-paths`:case`cat-file`:",
      "case`review-patch`:case`commit-message-diff`:case`codex-plus-trace`:case`repository-targets`:case`codex-plus-branches`:case`codex-plus-current-branch`:case`submodule-paths`:case`cat-file`:",
      "21316 repository-targets worker readonly method anchor",
    );
  }
  if (text.includes("function G0({requestKind:e,source:t}){return W0.has(e??``)||K0(t)}")) {
    let patched = replaceOnce(
      text,
      "var q0=`/usr/bin/git`,",
      `${workerHook()}var q0=\`/usr/bin/git\`,`,
      "72221 worker helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "function G0({requestKind:e,source:t}){return W0.has(e??``)||K0(t)}",
      "function G0({requestKind:e,source:t}){return W0.has(e??``)||K0(t)||CPXW.isReadOnlyBranchRequest(e,t)}",
      "72221 branch picker git allowlist anchor",
    );
    patched = replaceOnce(
      patched,
      "case`commit-message-diff`:o=Z(await a7(ooe(e.params.cwd,e.params.includeUnstaged,this.gitManager,r),t.signal));break;case`submodule-paths`:o=Z({paths:await Coe(this.gitManager.getWorktreeRepositoryForRoot(e.params.root,r),t.signal)});break;",
      "case`commit-message-diff`:o=Z(await a7(ooe(e.params.cwd,e.params.includeUnstaged,this.gitManager,r),t.signal));break;case`codex-plus-trace`:o=Z(CPXW.traceRequest(e.params));break;case`repository-targets`:o=Z(await CPXW.repositoryTargetsFromHost(this.gitManager,e.params,r,t.signal,Coe));break;case`codex-plus-branches`:o=Z(await CPXW.listBranches(e.params,t.signal));break;case`codex-plus-current-branch`:o=Z(await CPXW.currentBranch(e.params,t.signal));break;case`submodule-paths`:o=Z({paths:await Coe(this.gitManager.getWorktreeRepositoryForRoot(e.params.root,r),t.signal)});break;",
      "72221 repository-targets worker switch anchor",
    );
    return replaceOnce(
      patched,
      "case`commit-message-diff`:case`submodule-paths`:case`cat-file`:",
      "case`commit-message-diff`:case`codex-plus-trace`:case`repository-targets`:case`codex-plus-branches`:case`codex-plus-current-branch`:case`submodule-paths`:case`cat-file`:",
      "72221 repository-targets worker readonly method anchor",
    );
  }
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

function patchThreadSidePanelTabs(text, context = {}) {
  const originalText = text;
  text = patchThreadSidePanelNativeProjectContext(text);
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715.31925")) {
    let patched = replaceOnce(
      text,
      "function KT(e){let t=(0,JT.c)(15),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e",
      `${reviewHook("[YT,PT,null,null,null,null,null,null,null,null,null,DC,null,null,null,null,null,null,null,Ac,Od]")}function KT(e){let t=(0,JT.c)(15),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e`,
      "31925 review host hook insertion anchor",
    );
    return replaceOnce(
      patched,
      "c=(0,YT.jsx)(Bu,{children:(0,YT.jsx)(DC,{diffMode:a,setTabState:r,tabState:i})}),t[1]=a,t[2]=r,t[3]=i,t[4]=c):c=t[4];",
      "c=(0,YT.jsx)(Bu,{children:(0,YT.jsx)(CPXRM,{mainReviewContent:(0,YT.jsx)(DC,{diffMode:a,setTabState:r,tabState:i}),diffMode:a,setTabState:r,tabState:i})}),t[1]=a,t[2]=r,t[3]=i,t[4]=c):c=t[4];",
      "31925 review body mux anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715.21425")) {
    let patched = replaceOnce(
      text,
      "function _T(e){let t=(0,yT.c)(15),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e",
      `${reviewHook("[bT,aT,null,null,null,null,null,null,null,null,null,QS,null,null,null,null,null,null,null,hc,yd]")}function _T(e){let t=(0,yT.c)(15),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e`,
      "21425 review host hook insertion anchor",
    );
    return replaceOnce(
      patched,
      "c=(0,bT.jsx)(Mu,{children:(0,bT.jsx)(QS,{diffMode:a,setTabState:r,tabState:i})}),t[1]=a,t[2]=r,t[3]=i,t[4]=c):c=t[4];",
      "c=(0,bT.jsx)(Mu,{children:(0,bT.jsx)(CPXRM,{mainReviewContent:(0,bT.jsx)(QS,{diffMode:a,setTabState:r,tabState:i}),diffMode:a,setTabState:r,tabState:i})}),t[1]=a,t[2]=r,t[3]=i,t[4]=c):c=t[4];",
      "21425 review body mux anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715")) {
    let patched = replaceOnce(
      text,
      "function _T(e){let t=(0,yT.c)(15),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e",
      `${reviewHook("[bT,aT,null,null,null,null,null,null,null,null,null,QS,null,null,null,null,null,null,null,uc,yd]")}function _T(e){let t=(0,yT.c)(15),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e`,
      "21316 review host hook insertion anchor",
    );
    return replaceOnce(
      patched,
      "c=(0,bT.jsx)(Mu,{children:(0,bT.jsx)(QS,{diffMode:a,setTabState:r,tabState:i})}),t[1]=a,t[2]=r,t[3]=i,t[4]=c):c=t[4];",
      "c=(0,bT.jsx)(Mu,{children:(0,bT.jsx)(CPXRM,{mainReviewContent:(0,bT.jsx)(QS,{diffMode:a,setTabState:r,tabState:i}),diffMode:a,setTabState:r,tabState:i})}),t[1]=a,t[2]=r,t[3]=i,t[4]=c):c=t[4];",
      "21316 review body mux anchor",
    );
  }
  if (text.includes("function aTe(e){let t=(0,WP.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e")) {
    let patched = replaceOnce(
      text,
      "function aTe(e){let t=(0,WP.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e",
      `${reviewHook("[GP,EA,null,null,null,null,null,null,null,null,null,NSe,null,null,null,null,null,null,null,Do,kA]")}function aTe(e){let t=(0,WP.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e`,
      "91948 review host hook insertion anchor",
    );
    return replaceOnce(
      patched,
      "s=(0,GP.jsx)(Kre,{children:(0,GP.jsx)(NSe,{diffMode:a,setTabState:r,tabState:i})}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
      "s=(0,GP.jsx)(Kre,{children:(0,GP.jsx)(CPXRM,{mainReviewContent:(0,GP.jsx)(NSe,{diffMode:a,setTabState:r,tabState:i}),diffMode:a,setTabState:r,tabState:i})}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
      "91948 review body mux anchor",
    );
  }
  if (text.includes("function PCt(e){let t=(0,FCt.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e")) {
    const importAnchor = 'import{n as e,r as t,s as n,t as r}from"./rolldown-runtime-Czos8NxU.js";';
    let patched = replaceOnce(text, importAnchor, `${importAnchor}import{t as CPXBranchPickerDropdownContent}from"./${branchPickerDropdownContentFile}";`, "61608 branch picker content import anchor");
    patched = replaceOnce(
      patched,
      "function PCt(e){let t=(0,FCt.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e",
      `${reviewHook("[bW,HY,null,null,null,null,null,null,null,Oc,kt,_gt,null,null,null,null,null,CPXBranchPickerDropdownContent,null,hg,cce]")}function PCt(e){let t=(0,FCt.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e`,
      "61608 review host hook insertion anchor",
    );
    return replaceOnce(
      patched,
      "s=(0,bW.jsx)(lue,{children:(0,bW.jsx)(_gt,{diffMode:a,setTabState:r,tabState:i})}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
      "s=(0,bW.jsx)(lue,{children:(0,bW.jsx)(CPXRM,{mainReviewContent:(0,bW.jsx)(_gt,{diffMode:a,setTabState:r,tabState:i}),diffMode:a,setTabState:r,tabState:i})}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
      "61608 review body mux anchor",
    );
  }
  if (text.includes("function gMe(e){let t=(0,KN.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e")) {
    const importAnchor = 'import{n as e,r as t,s as n,t as r}from"./rolldown-runtime-Czos8NxU.js";';
    let patched = replaceOnce(
      text,
      importAnchor,
      `${importAnchor}import{t as CPXBranchPickerDropdownContent}from"./${branchPickerDropdownContentFile}";`,
      "62119 branch picker content import anchor",
    );
    patched = replaceOnce(
      patched,
      "function gMe(e){let t=(0,KN.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e",
      `${reviewHook("[qN,Jz,null,null,null,null,null,null,null,Tn,ae,Gke,null,null,null,null,null,CPXBranchPickerDropdownContent,null,sp,iD]")}function gMe(e){let t=(0,KN.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e`,
      "62119 review host hook insertion anchor",
    );
    return replaceOnce(
      patched,
      "s=(0,qN.jsx)(Aue,{children:(0,qN.jsx)(Gke,{diffMode:a,setTabState:r,tabState:i})}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
      "s=(0,qN.jsx)(Aue,{children:(0,qN.jsx)(CPXRM,{mainReviewContent:(0,qN.jsx)(Gke,{diffMode:a,setTabState:r,tabState:i}),diffMode:a,setTabState:r,tabState:i})}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
      "62119 review body mux anchor",
    );
  }
  if (text.includes("function lVe(e){let t=(0,_P.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e")) {
    const importAnchor = 'import{n as e,r as t,s as n,t as r}from"./rolldown-runtime-Czos8NxU.js";';
    let patched = replaceOnce(
      text,
      importAnchor,
      `${importAnchor}import{t as CPXBranchPickerDropdownContent}from"./${branchPickerDropdownContentFile}";`,
      "71524 branch picker content import anchor",
    );
    patched = replaceOnce(
      patched,
      "function lVe(e){let t=(0,_P.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e",
      `${reviewHook("[vP,QE,ki,J,se,null,null,null,null,Ll,uu,DLe,zr,Ze,oa,Gi,ot,CPXBranchPickerDropdownContent,null,Tu,GT]")}function lVe(e){let t=(0,_P.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e`,
      "71524 review host hook insertion anchor",
    );
    return replaceOnce(
      patched,
      "s=(0,vP.jsx)(Hpe,{children:(0,vP.jsx)(DLe,{diffMode:a,setTabState:r,tabState:i})}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
      "s=(0,vP.jsx)(Hpe,{children:(0,vP.jsx)(CPXRM,{mainReviewContent:(0,vP.jsx)(DLe,{diffMode:a,setTabState:r,tabState:i}),diffMode:a,setTabState:r,tabState:i})}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
      "71524 review body mux anchor",
    );
  }
  if (text.includes("function Vzt(e){let t=(0,Hzt.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e")) {
    const importAnchor = 'import{n as e,r as t,s as n,t as r}from"./rolldown-runtime-Czos8NxU.js";';
    let patched = replaceOnce(
      text,
      importAnchor,
      `${importAnchor}import{t as CPXBranchPickerDropdownContent}from"./${branchPickerDropdownContentFile}";import{op as CPXParseDiff}from"./${reviewDiffRuntimeFile}";import{zF as CPXPathValue}from"./app-initial~app-main~hotkey-window-new-thread-page~hotkey-window-home-page~composer-utility-bar-D9zyQF1n.js";`,
      "72221 review dependency import anchor",
    );
    patched = replaceOnce(
      patched,
      "function Vzt(e){let t=(0,Hzt.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e",
      `${reviewHook("[mY,Mzt,rl,I,null,null,null,Em,null,Dl,CPXPathValue,zMt,zi,No,Pt,kl,dc,CPXBranchPickerDropdownContent,null,CPXParseDiff,qAt]")}function Vzt(e){let t=(0,Hzt.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e`,
      "72221 review host hook insertion anchor",
    );
    return replaceOnce(
      patched,
      "s=(0,mY.jsx)(jie,{children:(0,mY.jsx)(zMt,{diffMode:a,setTabState:r,tabState:i})}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
      "s=(0,mY.jsx)(jie,{children:(0,mY.jsx)(CPXRM,{mainReviewContent:(0,mY.jsx)(zMt,{diffMode:a,setTabState:r,tabState:i}),diffMode:a,setTabState:r,tabState:i})}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
      "72221 review body mux anchor",
    );
  }
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
      `${reviewHook("[SN,typeof VE!==`undefined`?VE:null,Ie,Y,xn,null,null,null,null,Qo,ce,xje,null,null,null,null,null,null,null,Wu,jT]")}function WPe(e){let t=(0,xN.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e`,
      "review host hook insertion anchor",
    );
    return replaceOnce(
      patched,
      "let s;t[1]!==a||t[2]!==r||t[3]!==i?(s=(0,SN.jsx)(xje,{diffMode:a,setTabState:r,tabState:i}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
      "let s;t[1]!==a||t[2]!==r||t[3]!==i?(s=(0,SN.jsx)(CPXRM,{mainReviewContent:(0,SN.jsx)(xje,{diffMode:a,setTabState:r,tabState:i}),diffMode:a,setTabState:r,tabState:i}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
      "review body mux anchor",
    );
  }
  if (text.includes("function oSe(e){let t=(0,xN.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e")) {
    const importAnchor = "import{n as e,r as t,s as n,t as r}from\"./rolldown-runtime-Czos8NxU.js\";";
    let patched = replaceOnce(
      text,
      importAnchor,
      `${importAnchor}import{t as CPXBranchPickerDropdownContent}from"./${branchPickerDropdownContentFile}";`,
      "branch picker content import anchor",
    );
    patched = replaceOnce(
      patched,
      "function oSe(e){let t=(0,xN.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e",
      `${reviewHook("[SN,n(i()),null,null,null,null,null,null,null,va,K,Rve,null,null,null,null,null,CPXBranchPickerDropdownContent,null,Wn,lE]")}function oSe(e){let t=(0,xN.c)(14),{expandedActionsPortalTarget:n,setTabState:r,tabState:i}=e`,
      "review host hook insertion anchor",
    );
    return replaceOnce(
      patched,
      "s=(0,SN.jsx)(nie,{children:(0,SN.jsx)(Rve,{diffMode:a,setTabState:r,tabState:i})}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
      "s=(0,SN.jsx)(nie,{children:(0,SN.jsx)(CPXRM,{mainReviewContent:(0,SN.jsx)(Rve,{diffMode:a,setTabState:r,tabState:i}),diffMode:a,setTabState:r,tabState:i})}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];",
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

  if (patched.includes("function Ki({conversationId:e}){let t=N(M),n=P(E,e),r=v(n)")) {
    patched = replaceOnce(
      patched,
      "function Ki({conversationId:e}){let t=N(M),n=P(E,e),r=v(n)",
      "function Ki({conversationId:e}){let t=N(M),CPXSP=globalThis.CodexPlusHost.adapters.threadSidePanel;CPXSP.bindMount(()=>({scope:t}));CPXSP.bindOpenFile((e,n={})=>$t(t,e,n));let n=P(E,e),r=v(n)",
      "101652 local thread native side panel binding anchor",
    );
  }

  if (patched.includes("function QW(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,g=o??`local`,")) {
    patched = replaceOnce(
      patched,
      "function QW(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,g=o??`local`,",
      "function QW(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,CPXPC=globalThis.CodexPlusHost.adapters.context.active(),CPXSP=globalThis.CodexPlusHost.adapters.threadSidePanel,CPXM=CPXSP.bindMount(()=>({scope:e})),g=(CPXSP.bindOpenFile((t,n={})=>QW(e,t,n)),o??`local`),",
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

  if (patched.includes("function YG(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,g=o??`local`,")) {
    patched = replaceOnce(
      patched,
      "function YG(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,g=o??`local`,",
      "function YG(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,CPXPC=globalThis.CodexPlusHost.adapters.context.active(),g=o??`local`,",
      "31921 file side panel project context anchor",
    );
    patched = replaceOnce(patched, "b=AN(e),x=m??e.get(gC).formatMessage(ZG.openFileTabTitle)", "b=CPXPC?.cwd??AN(e),x=m??e.get(gC).formatMessage(ZG.openFileTabTitle)", "31921 file side panel cwd anchor");
    patched = replaceOnce(patched, "workspaceRoot:h??null,onSelectFile:(e,n,r)=>{YG(e,n,{controller:v,hostId:g,isPreview:t==null?!1:r?.isPreview,workspaceRoot:h}),t??v.closeTab(e,_)}", "workspaceRoot:CPXPC?.cwd??h??null,onSelectFile:(e,n,r)=>{YG(e,n,{controller:v,hostId:g,isPreview:t==null?!1:r?.isPreview,workspaceRoot:CPXPC?.cwd??h}),t??v.closeTab(e,_)}", "31921 file side panel root anchor");
    patched = replaceOnce(patched, "workspaceRoot:h??null,onSelectFile:(e,r,i)=>{YG(e,r,{controller:n,hostId:g,isPreview:t==null?!1:i?.isPreview,workspaceRoot:h}),t??n.closeTab(e,_)}", "workspaceRoot:CPXPC?.cwd??h??null,onSelectFile:(e,r,i)=>{YG(e,r,{controller:n,hostId:g,isPreview:t==null?!1:i?.isPreview,workspaceRoot:CPXPC?.cwd??h}),t??n.closeTab(e,_)}", "31921 file side panel moved root anchor");
  }

  if (patched.includes("function Dk(e){switch(e.value.routeKind){case`home`:{let t=e.get(nO),n=e.get(rO);return{conversationId:e.value.clientThreadId,conversationTitle:null,cwd:t,hostId:n}}")) {
    patched = replaceOnce(
      patched,
      "function Dk(e){switch(e.value.routeKind){case`home`:{let t=e.get(nO),n=e.get(rO);return{conversationId:e.value.clientThreadId,conversationTitle:null,cwd:t,hostId:n}}",
      "function Dk(e){let CPXPC=globalThis.CodexPlusHost.adapters.context.active();if(CPXPC?.cwd)return{conversationId:globalThis.CodexPlus?.ui?.virtualConversations?.activeRouteId?.()??`codex-plus-virtual`,conversationTitle:CPXPC.label??null,cwd:CPXPC.cwd,hostId:e.get(rO)};switch(e.value.routeKind){case`home`:{let t=e.get(nO),n=e.get(rO);return{conversationId:e.value.clientThreadId,conversationTitle:null,cwd:t,hostId:n}}",
      "terminal project context route anchor",
    );
  }
  if (patched.includes("function sO(e){switch(e.value.routeKind){case`home`:{let t=e.get(OE),n=e.get(kE);return{conversationId:e.value.clientThreadId,conversationTitle:null,cwd:t,hostId:n}}")) {
    patched = replaceOnce(
      patched,
      "function sO(e){switch(e.value.routeKind){case`home`:{let t=e.get(OE),n=e.get(kE);return{conversationId:e.value.clientThreadId,conversationTitle:null,cwd:t,hostId:n}}",
      "function sO(e){let CPXPC=globalThis.CodexPlusHost.adapters.context.active();if(CPXPC?.cwd)return{conversationId:globalThis.CodexPlus?.ui?.virtualConversations?.activeRouteId?.()??`codex-plus-virtual`,conversationTitle:CPXPC.label??null,cwd:CPXPC.cwd,hostId:e.get(kE)};switch(e.value.routeKind){case`home`:{let t=e.get(OE),n=e.get(kE);return{conversationId:e.value.clientThreadId,conversationTitle:null,cwd:t,hostId:n}}",
      "terminal project context route anchor",
    );
  }

  if (patched.includes("function vHt(){let e=(0,CHt.c)(33),t=jo(be),n=$e(GC.activeTab$),")) {
    patched = replaceOnce(
      patched,
      "function vHt(){let e=(0,CHt.c)(33),t=jo(be),n=$e(GC.activeTab$),",
      "function vHt(){let e=(0,CHt.c)(33),t=jo(be),CPXSP=globalThis.CodexPlusHost.adapters.threadSidePanel;CPXSP.bindMount(()=>({scope:t}));CPXSP.bindOpenFile((e,n={})=>($W(),QW(t,e,n)));let n=$e(GC.activeTab$),",
      "thread side panel native file opener shell anchor",
    );
  }

  if (patched.includes("function rF(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,g=o??`local`,")) {
    patched = replaceOnce(
      patched,
      "function rF(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,g=o??`local`,",
      "function rF(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,CPXPC=globalThis.CodexPlusHost.adapters.context.active(),CPXSP=globalThis.CodexPlusHost.adapters.threadSidePanel,CPXM=CPXSP.bindMount(()=>({scope:e})),g=(CPXSP.bindOpenFile((t,n={})=>rF(e,t,n)),o??`local`),",
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
      "function Y9(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,CPXPC=globalThis.CodexPlusHost.adapters.context.active(),CPXSP=globalThis.CodexPlusHost.adapters.threadSidePanel,CPXM=CPXSP.bindMount(()=>({scope:e})),g=(CPXSP.bindOpenFile((t,n={})=>Y9(e,t,n)),o??`local`),",
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
      "function YO(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,CPXPC=globalThis.CodexPlusHost.adapters.context.active(),CPXSP=globalThis.CodexPlusHost.adapters.threadSidePanel,CPXM=CPXSP.bindMount(()=>({scope:e})),g=(CPXSP.bindOpenFile((t,n={})=>YO(e,t,n)),o??`local`),",
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
      "function EL(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,CPXPC=globalThis.CodexPlusHost.adapters.context.active(),CPXSP=globalThis.CodexPlusHost.adapters.threadSidePanel,CPXM=CPXSP.bindMount(()=>({scope:e})),g=(CPXSP.bindOpenFile((t,n={})=>EL(e,t,n)),o??`local`),",
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
      "function yH(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,CPXPC=globalThis.CodexPlusHost.adapters.context.active(),CPXSP=globalThis.CodexPlusHost.adapters.threadSidePanel,CPXM=CPXSP.bindMount(()=>({scope:e})),g=(CPXSP.bindOpenFile((t,n={})=>yH(e,t,n)),o??`local`),",
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
      "function gJ(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,CPXPC=globalThis.CodexPlusHost.adapters.context.active(),CPXSP=globalThis.CodexPlusHost.adapters.threadSidePanel,CPXM=CPXSP.bindMount(()=>({scope:e})),g=(CPXSP.bindOpenFile((t,n={})=>gJ(e,t,n)),o??`local`),",
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
      "function I5(e,t,n={}){let{activate:r=!0,controller:i,endLine:a,hostId:o,icon:s,isPreview:c,line:l,resetTabState:u=!1,syncOpenTabs:d=!0,target:f=`right`,tabId:p,title:m,workspaceRoot:h}=n,CPXPC=globalThis.CodexPlusHost.adapters.context.active(),CPXSP=globalThis.CodexPlusHost.adapters.threadSidePanel,CPXM=CPXSP.bindMount(()=>({scope:e})),g=(CPXSP.bindOpenFile((t,n={})=>I5(e,t,n)),o??`local`),",
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
      "function LXe(e){let t=Ms(os),CPXSP=globalThis.CodexPlusHost.adapters.threadSidePanel;CPXSP.bindMount(()=>({scope:t}));CPXSP.bindOpenFile((e,n={})=>rF(t,e,n));let n=Y(no),",
      "thread side panel native file opener shell anchor",
    );
  }

  if (patched.includes("function IXe(e){let t=Ms(os),n=Y(no),")) {
    patched = replaceOnce(
      patched,
      "function IXe(e){let t=Ms(os),n=Y(no),",
      "function IXe(e){let t=Ms(os),CPXSP=globalThis.CodexPlusHost.adapters.threadSidePanel;CPXSP.bindMount(()=>({scope:t}));CPXSP.bindOpenFile((e,n={})=>rF(t,e,n));let n=Y(no),",
      "thread side panel native file opener shell anchor",
    );
  }

  if (patched.includes("function Q5e(){let e=(0,r7e.c)(33),t=O(hc),n=Ke(HO.activeTab$),")) {
    patched = replaceOnce(
      patched,
      "function Q5e(){let e=(0,r7e.c)(33),t=O(hc),n=Ke(HO.activeTab$),",
      "function Q5e(){let e=(0,r7e.c)(33),t=O(hc),CPXSP=globalThis.CodexPlusHost.adapters.threadSidePanel;CPXSP.bindMount(()=>({scope:t}));CPXSP.bindOpenFile((e,n={})=>Y9(t,e,n));let n=Ke(HO.activeTab$),",
      "thread side panel native file opener shell anchor",
    );
  }

  if (patched.includes("function tb(){let e=(0,ob.c)(33),t=xe(Z),n=Y(tc.activeTab$),")) {
    patched = replaceOnce(
      patched,
      "function tb(){let e=(0,ob.c)(33),t=xe(Z),n=Y(tc.activeTab$),",
      "function tb(){let e=(0,ob.c)(33),t=xe(Z),CPXSP=globalThis.CodexPlusHost.adapters.threadSidePanel;CPXSP.bindMount(()=>({scope:t}));CPXSP.bindOpenFile((e,n={})=>YO(t,e,n));let n=Y(tc.activeTab$),",
      "thread side panel native file opener shell anchor",
    );
  }

  if (patched.includes("function QWe(){let e=(0,rGe.c)(33),t=B(Z),n=X(Cw.activeTab$),")) {
    patched = replaceOnce(
      patched,
      "function QWe(){let e=(0,rGe.c)(33),t=B(Z),n=X(Cw.activeTab$),",
      "function QWe(){let e=(0,rGe.c)(33),t=B(Z),CPXSP=globalThis.CodexPlusHost.adapters.threadSidePanel;CPXSP.bindMount(()=>({scope:t}));CPXSP.bindOpenFile((e,n={})=>EL(t,e,n));let n=X(Cw.activeTab$),",
      "thread side panel native file opener shell anchor",
    );
  }

  if (patched.includes("function Ufn(){let e=(0,Jfn.c)(33),t=Kn(Xd),n=Nn(HE.activeTab$),")) {
    patched = replaceOnce(
      patched,
      "function Ufn(){let e=(0,Jfn.c)(33),t=Kn(Xd),n=Nn(HE.activeTab$),",
      "function Ufn(){let e=(0,Jfn.c)(33),t=Kn(Xd),CPXSP=globalThis.CodexPlusHost.adapters.threadSidePanel;CPXSP.bindMount(()=>({scope:t}));CPXSP.bindOpenFile((e,n={})=>gJ(t,e,n));let n=Nn(HE.activeTab$),",
      "thread side panel native file opener shell anchor",
    );
  }
  if (patched.includes("function Myt(){let e=(0,Lyt.c)(33),t=Hn(Tu),n=X(vS.activeTab$),")) {
    patched = replaceOnce(
      patched,
      "function Myt(){let e=(0,Lyt.c)(33),t=Hn(Tu),n=X(vS.activeTab$),",
      "function Myt(){let e=(0,Lyt.c)(33),t=Hn(Tu),CPXSP=globalThis.CodexPlusHost.adapters.threadSidePanel;CPXSP.bindMount(()=>({scope:t}));CPXSP.bindOpenFile((e,n={})=>yH(t,e,n));let n=X(vS.activeTab$),",
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

function patchAppShell(text, context = {}) {
  text = patchLocalThreadCatalogBootstrap(text);
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715.72028")) {
    let patched = replaceOnce(text, "function nP(){let e=(0,aP.c)(3),t,n;", `${diagnosticDetailsHook()}function nP(){let e=(0,aP.c)(3),t,n;`, "72028 app shell error fallback prop anchor");
    return replaceOnce(
      patched,
      "children:[t,n,(0,oP.jsx)(nr,{onClick:rP,children:(0,oP.jsx)(X,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
      "children:[t,n,CPXDiagnosticDetails({jsx:oP.jsx,error:null}),(0,oP.jsx)(nr,{onClick:rP,children:(0,oP.jsx)(X,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
      "72028 app shell diagnostic details anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715.72359")) {
    let patched = replaceOnce(text, "function rP(){let e=(0,oP.c)(3),t,n;", `${diagnosticDetailsHook()}function rP(){let e=(0,oP.c)(3),t,n;`, "72359 app shell error fallback prop anchor");
    return replaceOnce(
      patched,
      "children:[t,n,(0,sP.jsx)(nr,{onClick:iP,children:(0,sP.jsx)(X,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
      "children:[t,n,CPXDiagnosticDetails({jsx:sP.jsx,error:null}),(0,sP.jsx)(nr,{onClick:iP,children:(0,sP.jsx)(X,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
      "72359 app shell diagnostic details anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715.31925")) {
    let patched = replaceOnce(text, "function rP(){let e=(0,oP.c)(3),t,n;", `${diagnosticDetailsHook()}function rP(){let e=(0,oP.c)(3),t,n;`, "31925 app shell error fallback prop anchor");
    return replaceOnce(
      patched,
      "children:[t,n,(0,sP.jsx)(ar,{onClick:iP,children:(0,sP.jsx)(Y,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
      "children:[t,n,CPXDiagnosticDetails({jsx:sP.jsx,error:null}),(0,sP.jsx)(ar,{onClick:iP,children:(0,sP.jsx)(Y,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
      "31925 app shell diagnostic details anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715.31251")) {
    let patched = replaceOnce(text, "function qN(){let e=(0,XN.c)(3),t,n;", `${diagnosticDetailsHook()}function qN(){let e=(0,XN.c)(3),t,n;`, "31251 app shell error fallback prop anchor");
    return replaceOnce(
      patched,
      "children:[t,n,(0,ZN.jsx)(rr,{onClick:JN,children:(0,ZN.jsx)(X,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
      "children:[t,n,CPXDiagnosticDetails({jsx:ZN.jsx,error:null}),(0,ZN.jsx)(rr,{onClick:JN,children:(0,ZN.jsx)(X,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
      "31251 app shell error detail insertion anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715")) {
    let patched = replaceOnce(text, "function qN(){let e=(0,XN.c)(3),t,n;", `${diagnosticDetailsHook()}function qN(){let e=(0,XN.c)(3),t,n;`, "21316 app shell error fallback prop anchor");
    return replaceOnce(
      patched,
      "children:[t,n,(0,ZN.jsx)(ir,{onClick:JN,children:(0,ZN.jsx)(X,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
      "children:[t,n,CPXDiagnosticDetails({jsx:ZN.jsx,error:null}),(0,ZN.jsx)(ir,{onClick:JN,children:(0,ZN.jsx)(X,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
      "21316 app shell error detail insertion anchor",
    );
  }
  if (text.includes("function fse(){let e=(0,mj.c)(3),t,n;")) {
    let patched = replaceOnce(
      text,
      "function fse(){let e=(0,mj.c)(3),t,n;",
      `${diagnosticDetailsHook()}function fse(){let e=(0,mj.c)(3),t,n;`,
      "91948 app shell error fallback prop anchor",
    );
    return replaceOnce(
      patched,
      "children:[t,n,(0,hj.jsx)(Qn,{onClick:pse,children:(0,hj.jsx)(Z,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
      "children:[t,n,CPXDiagnosticDetails({jsx:hj.jsx,error:null}),(0,hj.jsx)(Qn,{onClick:pse,children:(0,hj.jsx)(Z,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
      "91948 app shell error detail insertion anchor",
    );
  }
  if (text.includes("function JSe(){let e=(0,kk.c)(3),t,n;")) {
    let patched = replaceOnce(text, "function JSe(){let e=(0,kk.c)(3),t,n;", `${diagnosticDetailsHook()}function JSe(){let e=(0,kk.c)(3),t,n;`, "61608 app shell error fallback prop anchor");
    return replaceOnce(
      patched,
      "children:[t,n,(0,Ak.jsx)(Ng,{onClick:YSe,children:(0,Ak.jsx)($,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
      "children:[t,n,CPXDiagnosticDetails({jsx:Ak.jsx,error:null}),(0,Ak.jsx)(Ng,{onClick:YSe,children:(0,Ak.jsx)($,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
      "61608 app shell error detail insertion anchor",
    );
  }
  if (text.includes("function ble(){let e=(0,xA.c)(3),t,n;")) {
    let patched = replaceOnce(
      text,
      "function ble(){let e=(0,xA.c)(3),t,n;",
      `${diagnosticDetailsHook()}function ble(){let e=(0,xA.c)(3),t,n;`,
      "62119 app shell error fallback prop anchor",
    );
    return replaceOnce(
      patched,
      "children:[t,n,(0,SA.jsx)(wu,{onClick:xle,children:(0,SA.jsx)(z,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
      "children:[t,n,CPXDiagnosticDetails({jsx:SA.jsx,error:null}),(0,SA.jsx)(wu,{onClick:xle,children:(0,SA.jsx)(z,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
      "62119 app shell error detail insertion anchor",
    );
  }
  if (text.includes("function Sde(){let e=(0,$O.c)(3),t,n;")) {
    let patched = replaceOnce(
      text,
      "function Sde(){let e=(0,$O.c)(3),t,n;",
      `${diagnosticDetailsHook()}function Sde(){let e=(0,$O.c)(3),t,n;`,
      "71524 app shell error fallback prop anchor",
    );
    return replaceOnce(
      patched,
      "children:[t,n,(0,ek.jsx)(Qr,{onClick:Cde,children:(0,ek.jsx)(Y,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
      "children:[t,n,CPXDiagnosticDetails({jsx:ek.jsx,error:null}),(0,ek.jsx)(Qr,{onClick:Cde,children:(0,ek.jsx)(Y,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
      "71524 app shell error detail insertion anchor",
    );
  }
  if (text.includes("function Ome(){let e=(0,Yj.c)(3),t,n;")) {
    let patched = replaceOnce(
      text,
      "function Ome(){let e=(0,Yj.c)(3),t,n;",
      `${diagnosticDetailsHook()}function Ome(){let e=(0,Yj.c)(3),t,n;`,
      "72221 app shell error fallback prop anchor",
    );
    patched = replaceOnce(
      patched,
      "children:[t,n,(0,Xj.jsx)(so,{onClick:kme,children:(0,Xj.jsx)($,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
      "children:[t,n,CPXDiagnosticDetails({jsx:Xj.jsx,error:null}),(0,Xj.jsx)(so,{onClick:kme,children:(0,Xj.jsx)($,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
      "72221 app shell error detail insertion anchor",
    );
    return replaceOnce(
      patched,
      "function ZJ(){let e=(0,QJ.c)(23),t=af(q),n=N(KJ),r=Ul(`open-file`),i=N(CT),a=N(Cy),o=a!=null,s;",
      "function ZJ(){let e=(0,QJ.c)(23),t=af(q),CPXSP=globalThis.CodexPlusHost.adapters.threadSidePanel,CPXM=CPXSP.bindMount(()=>({scope:t})),CPXO=CPXSP.bindOpenFile((e,n={})=>{let CPXPC=globalThis.CodexPlusHost.adapters.context.active();return $Xe(t,e,{hostId:n.hostId||CPXPC?.hostId||i.id||`local`,line:n.line,endLine:n.endLine,isPreview:n.isPreview,title:n.title,target:n.target??`right`})}),n=N(KJ),r=Ul(`open-file`),i=N(CT),a=N(Cy),o=a!=null,s;",
      "72221 route-scoped native file opener anchor",
    );
  }
  if (text.includes("function Yue(){let e=(0,aj.c)(3),t,n;")) {
    let patched = replaceOnce(
      text,
      "function Yue(){let e=(0,aj.c)(3),t,n;",
      `${diagnosticDetailsHook()}function Yue(){let e=(0,aj.c)(3),t,n;`,
      "app shell error fallback prop anchor",
    );
    return replaceOnce(
      patched,
      "children:[t,n,(0,oj.jsx)(dr,{onClick:Xue,children:(0,oj.jsx)(Z,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
      "children:[t,n,CPXDiagnosticDetails({jsx:oj.jsx,error:null}),(0,oj.jsx)(dr,{onClick:Xue,children:(0,oj.jsx)(Z,{id:`codex.errorBoundary.goHome`,defaultMessage:`Try again`,description:`Button label to navigate to the home page after an error`})})]",
      "app shell error detail insertion anchor",
    );
  }
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
      `${diagnosticDetailsHook()}function CPXCommandMenuBridgeItem(e){let t=e.command,n=t.title??t.id,r=t.description??"",i=t.menuGroups?.[0]??t.commandMenuGroupKey??"suggested";return Sq({id:t.id,enabled:t.commandMenu!==!1,groupKey:i,dependencies:[n,r,t.id],render:i=>(0,$.jsx)(Cx,{value:n,keywords:[r,t.id],title:n,description:r,onSelect:()=>{globalThis.CodexPlusHost.adapters.commands.dispatch(t.id),i?.()}},t.id)}),null}function CPXCommandMenuBridge(){let e=globalThis.CodexPlusHost.adapters.commands.metadata().filter(e=>e?.id&&e?.title);return(0,$.jsx)($.Fragment,{children:e.map(e=>(0,$.jsx)(CPXCommandMenuBridgeItem,{command:e},e.id))})}function lce(){let e=(0,HA.c)(3),t,n;`,
      "app shell error fallback prop anchor",
    );
    patched = replaceOnce(
      patched,
      "function Zbe(){let e=(0,G9.c)(8);if(q9)return null;",
      "function Zbe(){let e=(0,G9.c)(8),CPX_SCOPE=K(H),CPXSP=globalThis.CodexPlusHost.adapters.threadSidePanel;CPXSP.bindMount(()=>({scope:CPX_SCOPE}));CPXSP.bindOpenFile((e,n={})=>Q9(CPX_SCOPE,e,{...n,hostId:n.hostId??Ts,target:n.target??`right`,line:n.line??1,endLine:n.endLine??n.line??1}));if(q9)return null;",
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

function patchErrorBoundary(text, context = {}) {
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715")) {
    let patched = replaceOnce(
      text,
      "function bg(e){let t=(0,xg.c)(9),{resetError:n}=e,r=he(),i,a;",
      `${diagnosticDetailsHook()}function bg(e){let t=(0,xg.c)(9),{resetError:n,error:CPX_error,componentStack:CPX_componentStack}=e,r=he(),i,a;`,
      "21316 webview error boundary fallback prop anchor",
    );
    patched = replaceOnce(
      patched,
      "children:[i,a,(0,Cg.jsxs)(`div`,{className:`flex flex-wrap items-center justify-center gap-2`,children:[o,(0,Cg.jsx)(ie,{onClick:s,children:c})]})]",
      "children:[i,a,CPXDiagnosticDetails({jsx:Cg.jsx,error:CPX_error,componentStack:CPX_componentStack}),(0,Cg.jsxs)(`div`,{className:`flex flex-wrap items-center justify-center gap-2`,children:[o,(0,Cg.jsx)(ie,{onClick:s,children:c})]})]",
      "21316 webview error boundary detail anchor",
    );
    return replaceOnce(
      patched,
      "r=e??(e=>(0,Cg.jsx)(bg,{resetError:()=>e.resetError()}));",
      "r=e??(e=>(0,Cg.jsx)(bg,{error:e.error,componentStack:e.componentStack,resetError:()=>e.resetError()}));",
      "21316 webview error boundary error prop anchor",
    );
  }
  if (text.includes("function FCe(e){let t=(0,mF.c)(9),{resetError:n}=e,r=va(),i,a;")) {
    let patched = replaceOnce(
      text,
      "function FCe(e){let t=(0,mF.c)(9),{resetError:n}=e,r=va(),i,a;",
      `${diagnosticDetailsHook()}function FCe(e){let t=(0,mF.c)(9),{resetError:n,error:CPX_error,componentStack:CPX_componentStack}=e,r=va(),i,a;`,
      "91948 webview error boundary fallback prop anchor",
    );
    patched = replaceOnce(
      patched,
      "children:[i,a,(0,gF.jsxs)(`div`,{className:`flex flex-wrap items-center justify-center gap-2`,children:[o,(0,gF.jsx)(an,{onClick:s,children:c})]})]",
      "children:[i,a,CPXDiagnosticDetails({jsx:gF.jsx,error:CPX_error,componentStack:CPX_componentStack}),(0,gF.jsxs)(`div`,{className:`flex flex-wrap items-center justify-center gap-2`,children:[o,(0,gF.jsx)(an,{onClick:s,children:c})]})]",
      "91948 webview error boundary detail anchor",
    );
    return replaceOnce(
      patched,
      "r=e??(e=>(0,gF.jsx)(FCe,{resetError:()=>e.resetError()}));",
      "r=e??(e=>(0,gF.jsx)(FCe,{error:e.error,componentStack:e.componentStack,resetError:()=>e.resetError()}));",
      "91948 webview error boundary error prop anchor",
    );
  }
  if (text.includes("function SPe(e){let t=(0,CPe.c)(9),{resetError:n}=e,r=Yn(),i,a;")) {
    let patched = replaceOnce(text, "function SPe(e){let t=(0,CPe.c)(9),{resetError:n}=e,r=Yn(),i,a;", `${diagnosticDetailsHook()}function SPe(e){let t=(0,CPe.c)(9),{resetError:n,error:CPX_error,componentStack:CPX_componentStack}=e,r=Yn(),i,a;`, "61608 webview error boundary fallback prop anchor");
    patched = replaceOnce(
      patched,
      "children:[i,a,(0,fY.jsxs)(`div`,{className:`flex flex-wrap items-center justify-center gap-2`,children:[o,(0,fY.jsx)(so,{onClick:s,children:c})]})]",
      "children:[i,a,CPXDiagnosticDetails({jsx:fY.jsx,error:CPX_error,componentStack:CPX_componentStack}),(0,fY.jsxs)(`div`,{className:`flex flex-wrap items-center justify-center gap-2`,children:[o,(0,fY.jsx)(so,{onClick:s,children:c})]})]",
      "61608 webview error boundary detail anchor",
    );
    return replaceOnce(patched, "r=e??(e=>(0,fY.jsx)(SPe,{resetError:()=>e.resetError()}));", "r=e??(e=>(0,fY.jsx)(SPe,{error:e.error,componentStack:e.componentStack,resetError:()=>e.resetError()}));", "61608 webview error boundary error prop anchor");
  }
  if (text.includes("function hA(e){let t=(0,gA.c)(9),{resetError:n}=e,r=ye(),i,a;")) {
    let patched = replaceOnce(
      text,
      "function hA(e){let t=(0,gA.c)(9),{resetError:n}=e,r=ye(),i,a;",
      `${diagnosticDetailsHook()}function hA(e){let t=(0,gA.c)(9),{resetError:n,error:CPX_error,componentStack:CPX_componentStack}=e,r=ye(),i,a;`,
      "62119 webview error boundary fallback prop anchor",
    );
    patched = replaceOnce(
      patched,
      "children:[i,a,(0,vA.jsxs)(`div`,{className:`flex flex-wrap items-center justify-center gap-2`,children:[o,(0,vA.jsx)(Ln,{onClick:s,children:c})]})]",
      "children:[i,a,CPXDiagnosticDetails({jsx:vA.jsx,error:CPX_error,componentStack:CPX_componentStack}),(0,vA.jsxs)(`div`,{className:`flex flex-wrap items-center justify-center gap-2`,children:[o,(0,vA.jsx)(Ln,{onClick:s,children:c})]})]",
      "62119 webview error boundary detail anchor",
    );
    return replaceOnce(
      patched,
      "r=e??(e=>(0,vA.jsx)(hA,{resetError:()=>e.resetError()}));",
      "r=e??(e=>(0,vA.jsx)(hA,{error:e.error,componentStack:e.componentStack,resetError:()=>e.resetError()}));",
      "62119 webview error boundary error prop anchor",
    );
  }
  if (text.includes("function d_n(e){let t=(0,f_n.c)(9),{resetError:n}=e,r=kR(),i,a;")) {
    let patched = replaceOnce(
      text,
      "function d_n(e){let t=(0,f_n.c)(9),{resetError:n}=e,r=kR(),i,a;",
      `${diagnosticDetailsHook()}function d_n(e){let t=(0,f_n.c)(9),{resetError:n,error:CPX_error,componentStack:CPX_componentStack}=e,r=kR(),i,a;`,
      "71524 webview error boundary fallback prop anchor",
    );
    patched = replaceOnce(
      patched,
      "children:[i,a,(0,N$.jsxs)(`div`,{className:`flex flex-wrap items-center justify-center gap-2`,children:[o,(0,N$.jsx)(p_,{onClick:s,children:c})]})]",
      "children:[i,a,CPXDiagnosticDetails({jsx:N$.jsx,error:CPX_error,componentStack:CPX_componentStack}),(0,N$.jsxs)(`div`,{className:`flex flex-wrap items-center justify-center gap-2`,children:[o,(0,N$.jsx)(p_,{onClick:s,children:c})]})]",
      "71524 webview error boundary detail anchor",
    );
    return replaceOnce(
      patched,
      "r=e??(e=>(0,N$.jsx)(d_n,{resetError:()=>e.resetError()}));",
      "r=e??(e=>(0,N$.jsx)(d_n,{error:e.error,componentStack:e.componentStack,resetError:()=>e.resetError()}));",
      "71524 webview error boundary error prop anchor",
    );
  }
  if (text.includes("function ORe(e){let t=(0,kRe.c)(9),{resetError:n}=e,r=dr(),i,a;")) {
    let patched = replaceOnce(
      text,
      "function ORe(e){let t=(0,kRe.c)(9),{resetError:n}=e,r=dr(),i,a;",
      `${diagnosticDetailsHook()}function ORe(e){let t=(0,kRe.c)(9),{resetError:n,error:CPX_error,componentStack:CPX_componentStack}=e,r=dr(),i,a;`,
      "72221 webview error boundary fallback prop anchor",
    );
    patched = replaceOnce(
      patched,
      "children:[i,a,(0,VK.jsxs)(`div`,{className:`flex flex-wrap items-center justify-center gap-2`,children:[o,(0,VK.jsx)(dn,{onClick:s,children:c})]})]",
      "children:[i,a,CPXDiagnosticDetails({jsx:VK.jsx,error:CPX_error,componentStack:CPX_componentStack}),(0,VK.jsxs)(`div`,{className:`flex flex-wrap items-center justify-center gap-2`,children:[o,(0,VK.jsx)(dn,{onClick:s,children:c})]})]",
      "72221 webview error boundary detail anchor",
    );
    return replaceOnce(
      patched,
      "r=e??(e=>(0,VK.jsx)(ORe,{resetError:()=>e.resetError()}));",
      "r=e??(e=>(0,VK.jsx)(ORe,{error:e.error,componentStack:e.componentStack,resetError:()=>e.resetError()}));",
      "72221 webview error boundary error prop anchor",
    );
  }
  if (text.includes("function qZn(e){let t=(0,JZn.c)(9),{resetError:n}=e,r=qT(),i,a;")) {
    let patched = replaceOnce(
      text,
      "function qZn(e){let t=(0,JZn.c)(9),{resetError:n}=e,r=qT(),i,a;",
      `${diagnosticDetailsHook()}function qZn(e){let t=(0,JZn.c)(9),{resetError:n,error:CPX_error,componentStack:CPX_componentStack}=e,r=qT(),i,a;`,
      "webview error boundary fallback prop anchor",
    );
    patched = replaceOnce(
      patched,
      "children:[i,a,(0,Pz.jsxs)(`div`,{className:`flex flex-wrap items-center justify-center gap-2`,children:[o,(0,Pz.jsx)(Lf,{onClick:s,children:c})]})]",
      "children:[i,a,CPXDiagnosticDetails({jsx:Pz.jsx,error:CPX_error,componentStack:CPX_componentStack}),(0,Pz.jsxs)(`div`,{className:`flex flex-wrap items-center justify-center gap-2`,children:[o,(0,Pz.jsx)(Lf,{onClick:s,children:c})]})]",
      "webview error boundary detail anchor",
    );
    return replaceOnce(
      patched,
      "r=e??(e=>(0,Pz.jsx)(qZn,{resetError:()=>e.resetError()}));",
      "r=e??(e=>(0,Pz.jsx)(qZn,{error:e.error,componentStack:e.componentStack,resetError:()=>e.resetError()}));",
      "webview error boundary error prop anchor",
    );
  }
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

function patchAppMainProjectColors(text, context = {}) {
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715")) return text;
  if (
    text.includes("function JJ(e){let t=(0,YJ.c)(44),{children:n,groups:r,projectAppearances:i,selectedProjectIds:a,") &&
    text.includes("function pW(e){let t=(0,mW.c)(3),{target:n}=e")
  ) {
    return text;
  }
  if (text.includes("function Kf(e){let t=(0,qf.c)(57),")) {
    let patched = replaceOnce(text, "function Kf(e){let t=(0,qf.c)(57),", `${projectColorHook()}function Kf(e){let t=(0,qf.c)(57),`, "61608 project color app main helper insertion anchor");
    return replaceOnce(patched, "A=ki.sidebarProjectRow({collapsed:a,label:g,projectId:b})", "A={...ki.sidebarProjectRow({collapsed:a,label:g,projectId:b}),...CPXPR({projectId:b,label:g})}", "61608 project header row color attributes anchor");
  }
  if (text.includes("function Ju(e){let t=(0,Yu.c)(57),")) {
    let patched = replaceOnce(
      text,
      "function Ju(e){let t=(0,Yu.c)(57),",
      `${projectColorHook()}function Ju(e){let t=(0,Yu.c)(57),`,
      "62119 project color app main helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "j=ci.sidebarProjectRow({collapsed:a,label:_,projectId:x})",
      "j={...ci.sidebarProjectRow({collapsed:a,label:_,projectId:x}),...CPXPR({projectId:x,label:_})}",
      "62119 project header row color attributes anchor",
    );
  }
  if (text.includes("function _R(e){let t=(0,vR.c)(57),")) {
    let patched = replaceOnce(
      text,
      "function _R(e){let t=(0,vR.c)(57),",
      `${projectColorHook()}function _R(e){let t=(0,vR.c)(57),`,
      "71524 project color app main helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "A=dn.sidebarProjectRow({collapsed:a,label:g,projectId:b})",
      "A={...dn.sidebarProjectRow({collapsed:a,label:g,projectId:b}),...CPXPR({projectId:b,label:g})}",
      "71524 project header row color attributes anchor",
    );
  }
  if (text.includes("function Oz(e){let t=(0,kz.c)(57),")) {
    let patched = replaceOnce(
      text,
      "function Oz(e){let t=(0,kz.c)(57),",
      `${projectColorHook()}function Oz(e){let t=(0,kz.c)(57),`,
      "72221 project color app main helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "A=Ka.sidebarProjectRow({collapsed:a,label:g,projectId:b})",
      "A={...Ka.sidebarProjectRow({collapsed:a,label:g,projectId:b}),...CPXPR({projectId:b,label:g})}",
      "72221 project header row color attributes anchor",
    );
  }
  if (text.includes("function yl(e){let t=(0,bl.c)(57),{ref:n,className:r,actions:i,collapsed:a,contentClassName:o,")) {
    let patched = replaceOnce(
      text,
      "function yl(e){let t=(0,bl.c)(57),{ref:n,className:r,actions:i,collapsed:a,contentClassName:o,",
      `${projectColorHook()}function yl(e){let t=(0,bl.c)(57),{ref:n,className:r,actions:i,collapsed:a,contentClassName:o,`,
      "project color app main helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "J=(0,xl.jsxs)(`div`,{...x,...A,ref:n,className:N,role:`button`,",
      "J=(0,xl.jsxs)(`div`,{...x,...A,...CPXPR({projectId:b,label:g}),ref:n,className:N,role:`button`,",
      "project header row color attributes anchor",
    );
  }
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
  if (
    text.includes("function Pk(e){let t=(0,Q.c)(45),") &&
    text.includes("Ke=(0,Z.jsx)(Oe,{rowAttributes:ke,className:Ae,collapsed:L,contentClassName:je,") &&
    text.includes("te=(0,Z.jsxs)(`div`,{...y,...k,ref:n,className:M,role:`button`,")
  ) {
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
    return replaceOnce(
      patched,
      "Ke=(0,Z.jsx)(Oe,{rowAttributes:ke,className:Ae,collapsed:L,contentClassName:je,",
      "Ke=(0,Z.jsx)(Oe,{rowAttributes:{...ke,...CPXPR(n)},className:Ae,collapsed:L,contentClassName:je,",
      "project header row color attributes anchor",
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

function patchAppMainSidebarBlur(text, context = {}) {
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715")) return text;
  if (text.includes("function pW(e){let t=(0,mW.c)(3),{target:n}=e")) {
    if (text.includes("o=(0,gW.jsx)(Lm,{icon:a,label:i})")) {
      return replaceOnce(
        text,
        "o=(0,gW.jsx)(Lm,{icon:a,label:i})",
        "o=(0,gW.jsx)(Lm,{icon:a,label:(0,gW.jsx)(`span`,{\"data-codex-plus-sidebar-name\":``,children:i})})",
        "91948 sidebar conversation blur raw label anchor",
      );
    }
    return replaceOnce(
      text,
      "o=(0,gW.jsx)(Lm,{icon:a,label:(0,gW.jsx)(`span`,{...CPXPR(n.kind===`optimistic`?{threadId:n.conversationId,title:i,projectless:!0}:{threadId:n.conversation.id,title:i,cwd:n.conversation.cwd,projectId:n.conversation.projectId??null}),children:i})})",
      "o=(0,gW.jsx)(Lm,{icon:a,label:(0,gW.jsx)(`span`,{...CPXPR(n.kind===`optimistic`?{threadId:n.conversationId,title:i,projectless:!0}:{threadId:n.conversation.id,title:i,cwd:n.conversation.cwd,projectId:n.conversation.projectId??null}),\"data-codex-plus-sidebar-name\":``,children:i})})",
      "91948 sidebar conversation blur label anchor",
    );
  }
  if (text.includes("function Kf(e){let t=(0,qf.c)(57),")) {
    return replaceOnce(text, "U=(0,Jf.jsx)(`span`,{className:`text-fade-truncate pr-1`,children:g})", "U=(0,Jf.jsx)(`span`,{\"data-codex-plus-sidebar-name\":``,className:`text-fade-truncate pr-1`,children:g})", "61608 project header sidebar blur label anchor");
  }
  if (text.includes("function Ju(e){let t=(0,Yu.c)(57),")) {
    return replaceOnce(
      text,
      "W=(0,Xu.jsx)(`span`,{className:`text-fade-truncate pr-1`,children:_})",
      "W=(0,Xu.jsx)(`span`,{\"data-codex-plus-sidebar-name\":``,className:`text-fade-truncate pr-1`,children:_})",
      "62119 project header sidebar blur label anchor",
    );
  }
  if (text.includes("function _R(e){let t=(0,vR.c)(57),")) {
    return replaceOnce(
      text,
      "H=(0,yR.jsx)(`span`,{className:`text-fade-truncate pr-1`,children:g})",
      "H=(0,yR.jsx)(`span`,{\"data-codex-plus-sidebar-name\":``,className:`text-fade-truncate pr-1`,children:g})",
      "71524 project header sidebar blur label anchor",
    );
  }
  if (text.includes("function Oz(e){let t=(0,kz.c)(57),")) {
    return replaceOnce(
      text,
      "U=(0,Az.jsx)(`span`,{className:`text-fade-truncate pr-1`,children:g})",
      "U=(0,Az.jsx)(`span`,{\"data-codex-plus-sidebar-name\":``,className:`text-fade-truncate pr-1`,children:g})",
      "72221 project header sidebar blur label anchor",
    );
  }
  if (text.includes("function yl(e){let t=(0,bl.c)(57),")) {
    return replaceOnce(
      text,
      "U=(0,xl.jsx)(`span`,{className:`text-fade-truncate pr-1`,children:g})",
      "U=(0,xl.jsx)(`span`,{\"data-codex-plus-sidebar-name\":``,className:`text-fade-truncate pr-1`,children:g})",
      "project header sidebar blur label anchor",
    );
  }
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

function patchHeader(text, context = {}) {
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715.31925")) {
    let patched = replaceOnce(text, "function sr(e){let t=(0,cr.c)(5),{conversationId:n}=e,", `${threadHeaderHook()}function sr(e){let t=(0,cr.c)(5),{conversationId:n}=e,`, "31925 thread shell header accessory helper insertion anchor");
    return replaceOnce(
      patched,
      "let l=c;if(l==null||!s||o.kind!==`git`||a.kind===`remote-control`)return null;let u;return t[2]!==l||t[3]!==a?(u=(0,lr.jsx)(W.HeaderAction,{actionId:`thread-local-project-actions`,align:`end`,order:100,children:(0,lr.jsx)(Xn,{cwd:l,hostConfig:a})}),t[2]=l,t[3]=a,t[4]=u):u=t[4],u}",
      "let l=c,CPX_headerContext={cwd:o.cwd,hostId:a?.id??null,header:{surface:`thread-shell`,conversationId:n??null}},CPX_headerAccessories=CPXThreadHeaderAccessories({context:CPX_headerContext,deps:{jsx:lr.jsx,jsxs:lr.jsxs,useSyncExternalStore:ir.useSyncExternalStore}}),CPX_headerAction=CPX_headerAccessories==null?null:(0,lr.jsx)(W.HeaderAction,{actionId:`codex-plus-project-path`,align:`start`,order:90,children:CPX_headerAccessories});if(l==null||!s||o.kind!==`git`||a.kind===`remote-control`)return CPX_headerAction;let u;return t[2]!==l||t[3]!==a?(u=(0,lr.jsx)(W.HeaderAction,{actionId:`thread-local-project-actions`,align:`end`,order:100,children:(0,lr.jsx)(Xn,{cwd:l,hostConfig:a})}),t[2]=l,t[3]=a,t[4]=u):u=t[4],CPX_headerAction==null?u:(0,lr.jsxs)(lr.Fragment,{children:[CPX_headerAction,u]})}",
      "31925 thread shell header accessory mount anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715")) {
    let patched = replaceOnce(text, "function ar(e){let t=(0,or.c)(5),{conversationId:n}=e,", `${threadHeaderHook()}function ar(e){let t=(0,or.c)(5),{conversationId:n}=e,`, "21316 thread shell header accessory helper insertion anchor");
    return replaceOnce(
      patched,
      "let l=c;if(l==null||!s||o.kind!==`git`||a.kind===`remote-control`)return null;let u;return t[2]!==l||t[3]!==a?(u=(0,sr.jsx)(U.HeaderAction,{actionId:`thread-local-project-actions`,align:`end`,order:100,children:(0,sr.jsx)(Jn,{cwd:l,hostConfig:a})}),t[2]=l,t[3]=a,t[4]=u):u=t[4],u}",
      "let l=c,CPX_headerContext={cwd:o.cwd,hostId:a?.id??null,header:{surface:`thread-shell`,conversationId:n??null}},CPX_headerAccessories=CPXThreadHeaderAccessories({context:CPX_headerContext,deps:{jsx:sr.jsx,jsxs:sr.jsxs,useSyncExternalStore:nr.useSyncExternalStore}}),CPX_headerAction=CPX_headerAccessories==null?null:(0,sr.jsx)(U.HeaderAction,{actionId:`codex-plus-project-path`,align:`start`,order:90,children:CPX_headerAccessories});if(l==null||!s||o.kind!==`git`||a.kind===`remote-control`)return CPX_headerAction;let u;return t[2]!==l||t[3]!==a?(u=(0,sr.jsx)(U.HeaderAction,{actionId:`thread-local-project-actions`,align:`end`,order:100,children:(0,sr.jsx)(Jn,{cwd:l,hostConfig:a})}),t[2]=l,t[3]=a,t[4]=u):u=t[4],CPX_headerAction==null?u:(0,sr.jsxs)(sr.Fragment,{children:[CPX_headerAction,u]})}",
      "21316 thread shell header accessory mount anchor",
    );
  }
  if (
    text.includes("function ar(e){let t=(0,or.c)(5),{conversationId:n}=e,") &&
    text.includes("(0,sr.jsx)(G.HeaderAction,{actionId:`thread-local-project-actions`")
  ) {
    let patched = replaceOnce(
      text,
      "function ar(e){let t=(0,or.c)(5),{conversationId:n}=e,",
      `${threadHeaderHook()}function ar(e){let t=(0,or.c)(5),{conversationId:n}=e,`,
      "91948 thread shell header accessory helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "let c=s;if(c==null||!a||i.kind!==`git`||r.kind===`remote-control`)return null;let l;return t[2]!==c||t[3]!==r?(l=(0,sr.jsx)(G.HeaderAction,{actionId:`thread-local-project-actions`,align:`end`,order:100,children:(0,sr.jsx)(Jn,{cwd:c,hostConfig:r})}),t[2]=c,t[3]=r,t[4]=l):l=t[4],l}",
      "let c=s,CPX_headerContext={cwd:i.cwd,hostId:r?.id??null,header:{surface:`thread-shell`,conversationId:n??null}},CPX_headerAccessories=CPXThreadHeaderAccessories({context:CPX_headerContext,deps:{jsx:sr.jsx,jsxs:sr.jsxs,useSyncExternalStore:nr.useSyncExternalStore}}),CPX_headerAction=CPX_headerAccessories==null?null:(0,sr.jsx)(G.HeaderAction,{actionId:`codex-plus-project-path`,align:`start`,order:90,children:CPX_headerAccessories});if(c==null||!a||i.kind!==`git`||r.kind===`remote-control`)return CPX_headerAction;let l;return t[2]!==c||t[3]!==r?(l=(0,sr.jsx)(G.HeaderAction,{actionId:`thread-local-project-actions`,align:`end`,order:100,children:(0,sr.jsx)(Jn,{cwd:c,hostConfig:r})}),t[2]=c,t[3]=r,t[4]=l):l=t[4],CPX_headerAction==null?l:(0,sr.jsxs)(sr.Fragment,{children:[CPX_headerAction,l]})}",
      "91948 thread shell header accessory mount anchor",
    );
  }
  if (
    text.includes("function ar(e){let t=(0,or.c)(5),{conversationId:n}=e,") &&
    text.includes("(0,sr.jsx)(H.HeaderAction,{actionId:`thread-local-project-actions`")
  ) {
    let patched = replaceOnce(text, "function ar(e){let t=(0,or.c)(5),{conversationId:n}=e,", `${threadHeaderHook()}function ar(e){let t=(0,or.c)(5),{conversationId:n}=e,`, "61608 thread shell header accessory helper insertion anchor");
    return replaceOnce(
      patched,
      "let s=o;if(s==null||!a||i.kind!==`git`||r.kind===`remote-control`)return null;let l;return t[2]!==s||t[3]!==r?(l=(0,sr.jsx)(H.HeaderAction,{actionId:`thread-local-project-actions`,align:`end`,order:100,children:(0,sr.jsx)(Jn,{cwd:s,hostConfig:r})}),t[2]=s,t[3]=r,t[4]=l):l=t[4],l}",
      "let s=o,CPX_headerContext={cwd:i.cwd,hostId:r?.id??null,header:{surface:`thread-shell`,conversationId:n??null}},CPX_headerAccessories=CPXThreadHeaderAccessories({context:CPX_headerContext,deps:{jsx:sr.jsx,jsxs:sr.jsxs,useSyncExternalStore:nr.useSyncExternalStore}}),CPX_headerAction=CPX_headerAccessories==null?null:(0,sr.jsx)(H.HeaderAction,{actionId:`codex-plus-project-path`,align:`start`,order:90,children:CPX_headerAccessories});if(s==null||!a||i.kind!==`git`||r.kind===`remote-control`)return CPX_headerAction;let l;return t[2]!==s||t[3]!==r?(l=(0,sr.jsx)(H.HeaderAction,{actionId:`thread-local-project-actions`,align:`end`,order:100,children:(0,sr.jsx)(Jn,{cwd:s,hostConfig:r})}),t[2]=s,t[3]=r,t[4]=l):l=t[4],CPX_headerAction==null?l:(0,sr.jsxs)(sr.Fragment,{children:[CPX_headerAction,l]})}",
      "61608 thread shell header accessory mount anchor",
    );
  }
  if (
    text.includes("function ar(e){let t=(0,or.c)(5),{conversationId:n}=e,") &&
    text.includes("actionId:`thread-local-project-actions`,align:`end`,order:100") &&
    text.includes("a.kind!==`git`")
  ) {
    let patched = replaceOnce(
      text,
      "function ar(e){let t=(0,or.c)(5),{conversationId:n}=e,",
      `${threadHeaderHook()}function ar(e){let t=(0,or.c)(5),{conversationId:n}=e,`,
      "72221 thread shell header accessory helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "let c=s;if(c==null||!o||a.kind!==`git`||i.kind===`remote-control`)return null;let l;return t[2]!==c||t[3]!==i?(l=(0,sr.jsx)(W.HeaderAction,{actionId:`thread-local-project-actions`,align:`end`,order:100,children:(0,sr.jsx)(Jn,{cwd:c,hostConfig:i})}),t[2]=c,t[3]=i,t[4]=l):l=t[4],l}",
      "let c=s,CPX_headerContext={cwd:a.cwd,hostId:i?.id??null,header:{surface:`thread-shell`,conversationId:n??null}},CPX_headerAccessories=CPXThreadHeaderAccessories({context:CPX_headerContext,deps:{jsx:sr.jsx,jsxs:sr.jsxs,useSyncExternalStore:nr.useSyncExternalStore}}),CPX_headerAction=CPX_headerAccessories==null?null:(0,sr.jsx)(W.HeaderAction,{actionId:`codex-plus-project-path`,align:`start`,order:90,children:CPX_headerAccessories});if(c==null||!o||a.kind!==`git`||i.kind===`remote-control`)return CPX_headerAction;let l;return t[2]!==c||t[3]!==i?(l=(0,sr.jsx)(W.HeaderAction,{actionId:`thread-local-project-actions`,align:`end`,order:100,children:(0,sr.jsx)(Jn,{cwd:c,hostConfig:i})}),t[2]=c,t[3]=i,t[4]=l):l=t[4],CPX_headerAction==null?l:(0,sr.jsxs)(sr.Fragment,{children:[CPX_headerAction,l]})}",
      "72221 thread shell header accessory mount anchor",
    );
  }
  if (
    text.includes("function Yn(e){let t=(0,er.c)(66),") &&
    text.includes("(0,$.jsx)(w,{color:`ghostActive`,type:`button`,onClick:u,") &&
    text.includes("let x;t[35]!==c||t[36]!==g||t[37]!==i?")
  ) {
    let patched = replaceOnce(
      text,
      "function Yn(e){let t=(0,er.c)(66),",
      `${threadHeaderHook()}function Yn(e){let t=(0,er.c)(66),`,
      "thread header accessory helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "{className:n,desktopDeepLinkConversationId:r,title:i,onBack:a,trailing:o}=e,",
      "{className:n,desktopDeepLinkConversationId:r,title:i,onBack:a,trailing:o,cwd:CPX_headerCwd}=e,",
      "thread header cwd prop anchor",
    );
    patched = replaceOnce(
      patched,
      "let x;t[35]!==c||t[36]!==g||t[37]!==i?",
      "let CPX_headerContext={cwd:CPX_headerCwd,hostId:null,header:{surface:`header`,titleText:typeof i==`string`?i:null}},CPX_headerAccessories=CPXThreadHeaderAccessories({context:CPX_headerContext,deps:{jsx:$.jsx,jsxs:$.jsxs,Tooltip:ne,useSyncExternalStore:qn.useSyncExternalStore}});let x;t[35]!==c||t[36]!==g||t[37]!==i||CPX_headerAccessories?",
      "thread header accessory context anchor",
    );
    return replaceOnce(
      patched,
      "children:(0,$.jsx)(`span`,{className:`truncate`,children:i})})]}):",
      "children:(0,$.jsx)(`span`,{className:`truncate`,children:i})}),CPX_headerAccessories]}):",
      "thread header accessory render anchor",
    );
  }
  if (text.includes("function ar(e){let t=(0,or.c)(5),{conversationId:n}=e,")) {
    let patched = replaceOnce(
      text,
      "function ar(e){let t=(0,or.c)(5),{conversationId:n}=e,",
      `${threadHeaderHook()}function ar(e){let t=(0,or.c)(5),{conversationId:n}=e,`,
      "51957 thread shell header accessory helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "let l=o;if(l==null||!a||i.kind!==`git`||r.kind===`remote-control`)return null;let u;return t[2]!==l||t[3]!==r?(u=(0,sr.jsx)(I.HeaderAction,{actionId:`thread-local-project-actions`,align:`end`,order:100,children:(0,sr.jsx)(Jn,{cwd:l,hostConfig:r})}),t[2]=l,t[3]=r,t[4]=u):u=t[4],u}",
      "let l=o,CPX_headerContext={cwd:i.cwd,hostId:r?.id??null,header:{surface:`thread-shell`,conversationId:n??null}},CPX_headerAccessories=CPXThreadHeaderAccessories({context:CPX_headerContext,deps:{jsx:sr.jsx,jsxs:sr.jsxs,useSyncExternalStore:nr.useSyncExternalStore}}),CPX_headerAction=CPX_headerAccessories==null?null:(0,sr.jsx)(I.HeaderAction,{actionId:`codex-plus-project-path`,align:`start`,order:90,children:CPX_headerAccessories});if(l==null||!a||i.kind!==`git`||r.kind===`remote-control`)return CPX_headerAction;let u;return t[2]!==l||t[3]!==r?(u=(0,sr.jsx)(I.HeaderAction,{actionId:`thread-local-project-actions`,align:`end`,order:100,children:(0,sr.jsx)(Jn,{cwd:l,hostConfig:r})}),t[2]=l,t[3]=r,t[4]=u):u=t[4],CPX_headerAction==null?u:(0,sr.jsxs)(sr.Fragment,{children:[CPX_headerAction,u]})}",
      "51957 thread shell header accessory mount anchor",
    );
    return patched;
  }
  if (
    text.includes("function ir(e){let t=(0,ar.c)(5),{conversationId:n}=e,") &&
    text.includes("(0,or.jsx)(q.HeaderAction,{actionId:`thread-local-project-actions`")
  ) {
    let patched = replaceOnce(
      text,
      "function ir(e){let t=(0,ar.c)(5),{conversationId:n}=e,",
      `${threadHeaderHook()}function ir(e){let t=(0,ar.c)(5),{conversationId:n}=e,`,
      "71524 thread shell header accessory helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "let s=o;if(s==null||!a||i.kind!==`git`||r.kind===`remote-control`)return null;let c;return t[2]!==s||t[3]!==r?(c=(0,or.jsx)(q.HeaderAction,{actionId:`thread-local-project-actions`,align:`end`,order:100,children:(0,or.jsx)(qn,{cwd:s,hostConfig:r})}),t[2]=s,t[3]=r,t[4]=c):c=t[4],c}",
      "let s=o,CPX_headerContext={cwd:i.cwd,hostId:r?.id??null,header:{surface:`thread-shell`,conversationId:n??null}},CPX_headerAccessories=CPXThreadHeaderAccessories({context:CPX_headerContext,deps:{jsx:or.jsx,jsxs:or.jsxs,useSyncExternalStore:tr.useSyncExternalStore}}),CPX_headerAction=CPX_headerAccessories==null?null:(0,or.jsx)(q.HeaderAction,{actionId:`codex-plus-project-path`,align:`start`,order:90,children:CPX_headerAccessories});if(s==null||!a||i.kind!==`git`||r.kind===`remote-control`)return CPX_headerAction;let c;return t[2]!==s||t[3]!==r?(c=(0,or.jsx)(q.HeaderAction,{actionId:`thread-local-project-actions`,align:`end`,order:100,children:(0,or.jsx)(qn,{cwd:s,hostConfig:r})}),t[2]=s,t[3]=r,t[4]=c):c=t[4],CPX_headerAction==null?c:(0,or.jsxs)(or.Fragment,{children:[CPX_headerAction,c]})}",
      "71524 thread shell header accessory mount anchor",
    );
    return patched;
  }
  if (text.includes("function ir(e){let t=(0,ar.c)(5),{conversationId:n}=e,")) {
    let patched = replaceOnce(
      text,
      "function ir(e){let t=(0,ar.c)(5),{conversationId:n}=e,",
      `${threadHeaderHook()}function ir(e){let t=(0,ar.c)(5),{conversationId:n}=e,`,
      "41301 thread shell header accessory helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "let s=o;if(s==null||!a||i.kind!==`git`||r.kind===`remote-control`)return null;let c;return t[2]!==s||t[3]!==r?(c=(0,or.jsx)(K.HeaderAction,{actionId:`thread-local-project-actions`,align:`end`,order:100,children:(0,or.jsx)(qn,{cwd:s,hostConfig:r})}),t[2]=s,t[3]=r,t[4]=c):c=t[4],c}",
      "let s=o,CPX_headerContext={cwd:i.cwd,hostId:r?.id??null,header:{surface:`thread-shell`,conversationId:n??null}},CPX_headerAccessories=CPXThreadHeaderAccessories({context:CPX_headerContext,deps:{jsx:or.jsx,jsxs:or.jsxs,useSyncExternalStore:tr.useSyncExternalStore}}),CPX_headerAction=CPX_headerAccessories==null?null:(0,or.jsx)(K.HeaderAction,{actionId:`codex-plus-project-path`,align:`start`,order:90,children:CPX_headerAccessories});if(s==null||!a||i.kind!==`git`||r.kind===`remote-control`)return CPX_headerAction;let c;return t[2]!==s||t[3]!==r?(c=(0,or.jsx)(K.HeaderAction,{actionId:`thread-local-project-actions`,align:`end`,order:100,children:(0,or.jsx)(qn,{cwd:s,hostConfig:r})}),t[2]=s,t[3]=r,t[4]=c):c=t[4],CPX_headerAction==null?c:(0,or.jsxs)(or.Fragment,{children:[CPX_headerAction,c]})}",
      "41301 thread shell header accessory mount anchor",
    );
    return patched;
  }
  if (text.includes("function Yn(e){let t=(0,er.c)(66),")) {
    let patched = replaceOnce(
      text,
      "function Yn(e){let t=(0,er.c)(66),",
      `${threadHeaderHook()}function Yn(e){let t=(0,er.c)(66),`,
      "41301 thread header accessory helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "{className:n,desktopDeepLinkConversationId:r,title:i,onBack:a,trailing:o}=e,",
      "{className:n,desktopDeepLinkConversationId:r,title:i,onBack:a,trailing:o,cwd:CPX_headerCwd}=e,",
      "41301 thread header cwd prop anchor",
    );
    patched = replaceOnce(
      patched,
      "let S;t[35]!==c||t[36]!==g||t[37]!==i?",
      "let CPX_headerContext={cwd:CPX_headerCwd,header:{surface:`header`,titleText:typeof i==`string`?i:null}},CPX_headerAccessories=CPXThreadHeaderAccessories({context:CPX_headerContext,deps:{jsx:$.jsx,jsxs:$.jsxs}});let S;t[35]!==c||t[36]!==g||t[37]!==i?",
      "41301 thread header accessory context anchor",
    );
    return replaceOnce(
      patched,
      "children:(0,$.jsx)(`span`,{className:`truncate`,children:i})})]}):(0,$.jsx)(`span`,{className:`text-token-description-foreground`,children:(0,$.jsx)(Qn,{mergedTasks:g,onBack:c,showBackButton:!0})})}),t[35]=c,t[36]=g,t[37]=i,t[38]=S):S=t[38];",
      "children:(0,$.jsx)(`span`,{className:`truncate`,children:i})}),CPX_headerAccessories]}):(0,$.jsx)(`span`,{className:`text-token-description-foreground`,children:(0,$.jsx)(Qn,{mergedTasks:g,onBack:c,showBackButton:!0})})}),t[35]=c,t[36]=g,t[37]=i,t[38]=S):S=t[38];",
      "41301 thread header title accessory render anchor",
    );
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
    const nativeActionAnchor = "children:[o,E]}),t[48]=E,t[49]=o,t[50]=D):D=t[50];";
    const nativeActionMount = text.includes(nativeActionAnchor);
    const accessoryHook = nativeActionMount
      ? "let CPXH=window.CodexPlusHost.adapters;function CPXThreadHeaderAccessories(e){return CPXH.threadHeader.accessories(CPXH.context.active(),e.deps)}"
      : threadHeaderHook();
    let patched = replaceOnce(
      text,
      "function Jn(e){let t=(0,$n.c)(66),",
      `${accessoryHook}function Jn(e){let t=(0,$n.c)(66),`,
      "thread header accessory helper insertion anchor",
    );
    if (!nativeActionMount) {
      return replaceOnce(
        patched,
        "let x;t[35]!==c||t[36]!==g||t[37]!==i?(x=(0,$.jsx)(`div`,{className:`mr-3 line-clamp-1 flex min-w-0 flex-1 items-center gap-1 truncate`,style:{viewTransitionName:`header-title`},children:i?(0,$.jsxs)(`div`,{className:`flex min-w-0 flex-1 items-center gap-1`,children:[(0,$.jsx)(Qn,{onClick:c}),(0,$.jsx)(q,{color:`ghostActive`,type:`button`,onClick:u,className:`min-w-0 flex-1 truncate !px-0 !py-0 text-left text-sm text-token-foreground hover:!bg-transparent hover:opacity-80 electron:font-medium`,children:(0,$.jsx)(`span`,{className:`truncate`,children:i})})]}):(0,$.jsx)(`span`,{className:`text-token-description-foreground`,children:(0,$.jsx)(Zn,{mergedTasks:g,onBack:c,showBackButton:!0})})}),t[35]=c,t[36]=g,t[37]=i,t[38]=x):x=t[38];",
        "let CPX_headerContext={cwd:null,hostId:null,header:{surface:`header`,titleText:typeof i==`string`?i:null}},CPX_headerAccessories=CPXThreadHeaderAccessories({context:CPX_headerContext,deps:{jsx:$.jsx,jsxs:$.jsxs,Tooltip:me}});let x;t[35]!==c||t[36]!==g||t[37]!==i?(x=(0,$.jsx)(`div`,{className:`mr-3 line-clamp-1 flex min-w-0 flex-1 items-center gap-1 truncate`,style:{viewTransitionName:`header-title`},children:i?(0,$.jsxs)(`div`,{className:`flex min-w-0 flex-1 items-center gap-1`,children:[(0,$.jsx)(Qn,{onClick:c}),(0,$.jsx)(q,{color:`ghostActive`,type:`button`,onClick:u,className:`min-w-0 flex-1 truncate !px-0 !py-0 text-left text-sm text-token-foreground hover:!bg-transparent hover:opacity-80 electron:font-medium`,children:(0,$.jsx)(`span`,{className:`truncate`,children:i})}),CPX_headerAccessories]}):(0,$.jsx)(`span`,{className:`text-token-description-foreground`,children:(0,$.jsx)(Zn,{mergedTasks:g,onBack:c,showBackButton:!0})})}),t[35]=c,t[36]=g,t[37]=i,t[38]=x):x=t[38];",
        "thread header accessory render anchor",
      );
    }
    patched = replaceOnce(
      patched,
      "let x;t[35]!==c||t[36]!==g||t[37]!==i?(x=(0,$.jsx)(`div`,{className:`mr-3 line-clamp-1 flex min-w-0 flex-1 items-center gap-1 truncate`,style:{viewTransitionName:`header-title`},children:i?(0,$.jsxs)(`div`,{className:`flex min-w-0 flex-1 items-center gap-1`,children:[(0,$.jsx)(Qn,{onClick:c}),(0,$.jsx)(q,{color:`ghostActive`,type:`button`,onClick:u,className:`min-w-0 flex-1 truncate !px-0 !py-0 text-left text-sm text-token-foreground hover:!bg-transparent hover:opacity-80 electron:font-medium`,children:(0,$.jsx)(`span`,{className:`truncate`,children:i})})]}):(0,$.jsx)(`span`,{className:`text-token-description-foreground`,children:(0,$.jsx)(Zn,{mergedTasks:g,onBack:c,showBackButton:!0})})}),t[35]=c,t[36]=g,t[37]=i,t[38]=x):x=t[38];",
      "let CPX_headerContext={cwd:null,hostId:null,header:{surface:`header`,titleText:typeof i==`string`?i:null}},CPX_headerAccessories=CPXThreadHeaderAccessories({context:CPX_headerContext,deps:{jsx:$.jsx,jsxs:$.jsxs,Tooltip:me,useSyncExternalStore:Kn.useSyncExternalStore}});let x;t[35]!==c||t[36]!==g||t[37]!==i?(x=(0,$.jsx)(`div`,{className:`mr-3 line-clamp-1 flex min-w-0 flex-1 items-center gap-1 truncate`,style:{viewTransitionName:`header-title`},children:i?(0,$.jsxs)(`div`,{className:`flex min-w-0 flex-1 items-center gap-1`,children:[(0,$.jsx)(Qn,{onClick:c}),(0,$.jsx)(q,{color:`ghostActive`,type:`button`,onClick:u,className:`min-w-0 flex-1 truncate !px-0 !py-0 text-left text-sm text-token-foreground hover:!bg-transparent hover:opacity-80 electron:font-medium`,children:(0,$.jsx)(`span`,{className:`truncate`,children:i})})]}):(0,$.jsx)(`span`,{className:`text-token-description-foreground`,children:(0,$.jsx)(Zn,{mergedTasks:g,onBack:c,showBackButton:!0})})}),t[35]=c,t[36]=g,t[37]=i,t[38]=x):x=t[38];",
      "thread header accessory render anchor",
    );
    return replaceOnce(
      patched,
      nativeActionAnchor,
      "children:[o,CPX_headerAccessories,E]}),t[48]=E,t[49]=o,t[50]=D):D=t[50];",
      "thread header native action accessory anchor",
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

function patchThreadTitle(text, context = {}) {
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715.21425")) {
    let patched = replaceOnce(
      text,
      "var zl,Bl,Vl=e((()=>{zl=h(),",
      "var CPXReact,zl,Bl,Vl=e((()=>{CPXReact=t(c(),1),zl=h(),",
      "21425 thread title React namespace initializer anchor",
    );
    patched = replaceOnce(
      patched,
      "function Il(e){let t=(0,zl.c)(43),",
      `${threadHeaderContextHook()}${threadHeaderBoundTitleHook("CPXReact")}function Il(e){let t=(0,zl.c)(43),`,
      "21425 thread title context helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "projectName:f,title:p,titleSuffix:m,cwd:h,canPin:g,hideForkActions:_}=e,v=u===void 0?!1:u,",
      "projectName:f,title:CPX_nativeTitle,titleSuffix:m,cwd:h,canPin:g,hideForkActions:_}=e,p=CPXThreadHeaderTitle(CPX_nativeTitle),v=u===void 0?!1:u,",
      "21425 thread title adapter mount anchor",
    );
    return replaceOnce(
      patched,
      "let w=C,T=r(xt,i),E=bo(w,Le(a??T).id),D;",
      "let w=C,T=r(xt,i),CPXC=CPXBindThreadHeaderContext({routeId:i,threadId:i,cwd:h,workspaceRoot:h,gitRoot:w??h,hostId:Le(a??T).id,sourceProject:{id:h,label:typeof f==`string`?f:``,cwd:h}}),E=bo(w,Le(a??T).id),D;",
      "21425 thread title native context anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715")) {
    let patched = replaceOnce(
      text,
      "var zl,Bl,Vl=e((()=>{zl=h(),",
      "var CPXReact,zl,Bl,Vl=e((()=>{CPXReact=t(c(),1),zl=h(),",
      "21316 thread title React namespace initializer anchor",
    );
    patched = replaceOnce(
      patched,
      "function Il(e){let t=(0,zl.c)(43),",
      `${threadHeaderContextHook()}${threadHeaderBoundTitleHook("CPXReact")}function Il(e){let t=(0,zl.c)(43),`,
      "21316 thread title context helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "projectName:f,title:p,titleSuffix:m,cwd:h,canPin:g,hideForkActions:_}=e,v=u===void 0?!1:u,",
      "projectName:f,title:CPX_nativeTitle,titleSuffix:m,cwd:h,canPin:g,hideForkActions:_}=e,p=CPXThreadHeaderTitle(CPX_nativeTitle),v=u===void 0?!1:u,",
      "21316 thread title adapter mount anchor",
    );
    return replaceOnce(
      patched,
      "let w=C,T=r(St,i),E=bo(w,Ne(a??T).id),D;",
      "let w=C,T=r(St,i),CPXC=CPXBindThreadHeaderContext({routeId:i,threadId:i,cwd:h,workspaceRoot:h,gitRoot:w??h,hostId:Ne(a??T).id,sourceProject:{id:h,label:typeof f==`string`?f:``,cwd:h}}),E=bo(w,Ne(a??T).id),D;",
      "21316 thread title native context anchor",
    );
  }
  if (
    text.includes("function Sl(e){let t=(0,Tl.c)(51),{conversationId:n,hostIdOverride:r,") &&
    text.includes("projectName:f,title:p,titleSuffix:m,cwd:g,canPin:_,hideForkActions:v}=e")
  ) {
    let patched = replaceOnce(
      text,
      "function Sl(e){let t=(0,Tl.c)(51),",
      `${threadHeaderContextHook()}${threadHeaderBoundTitleHook("ll")}function Sl(e){let t=(0,Tl.c)(51),`,
      "91948 thread title context helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "projectName:f,title:p,titleSuffix:m,cwd:g,canPin:_,hideForkActions:v}=e,y=l===void 0?!1:l,",
      "projectName:f,title:CPX_nativeTitle,titleSuffix:m,cwd:g,canPin:_,hideForkActions:v}=e,p=CPXThreadHeaderTitle(CPX_nativeTitle),y=l===void 0?!1:l,",
      "91948 thread title adapter mount anchor",
    );
    return replaceOnce(
      patched,
      "let D=E,O=c(kt,n),k=co(D,Ot(r??O).id),A;",
      "let D=E,O=c(kt,n),CPXC=CPXBindThreadHeaderContext({routeId:n,threadId:n,cwd:g,workspaceRoot:g,gitRoot:D??g,hostId:Ot(r??O).id,sourceProject:{id:g,label:typeof f==`string`?f:``,cwd:g}}),k=co(D,Ot(r??O).id),A;",
      "91948 thread title native context anchor",
    );
  }
  if (
    text.includes("function Sl(e){let t=(0,Tl.c)(51),{conversationId:n,hostIdOverride:r,") &&
    text.includes("projectName:f,title:p,titleSuffix:m,cwd:h,canPin:g,hideForkActions:_}=e")
  ) {
    let patched = replaceOnce(text, "function Sl(e){let t=(0,Tl.c)(51),", `${threadHeaderContextHook()}${threadHeaderBoundTitleHook("ll")}function Sl(e){let t=(0,Tl.c)(51),`, "61608 thread title context helper insertion anchor");
    patched = replaceOnce(patched, "projectName:f,title:p,titleSuffix:m,cwd:h,canPin:g,hideForkActions:_}=e,v=c===void 0?!1:c,", "projectName:f,title:CPX_nativeTitle,titleSuffix:m,cwd:h,canPin:g,hideForkActions:_}=e,p=CPXThreadHeaderTitle(CPX_nativeTitle),v=c===void 0?!1:c,", "61608 thread title adapter mount anchor");
    return replaceOnce(
      patched,
      "let D=E,O=L(Rn,n),ee=so(D,It(r??O).id),A;",
      "let D=E,O=L(Rn,n),CPXC=CPXBindThreadHeaderContext({routeId:n,threadId:n,cwd:h,workspaceRoot:h,gitRoot:D??h,hostId:It(r??O).id,sourceProject:{id:h,label:typeof f==`string`?f:``,cwd:h}}),ee=so(D,It(r??O).id),A;",
      "61608 thread title native context anchor",
    );
  }
  if (
    text.includes("function Sl(e){let t=(0,Tl.c)(51),{conversationId:n,hostIdOverride:r,") &&
    text.includes("projectName:f,title:p,titleSuffix:h,cwd:g,canPin:_,hideForkActions:v}=e")
  ) {
    let patched = replaceOnce(
      text,
      "function Sl(e){let t=(0,Tl.c)(51),",
      `${threadHeaderContextHook()}${threadHeaderBoundTitleHook("ll")}function Sl(e){let t=(0,Tl.c)(51),`,
      "62119 thread title context helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "projectName:f,title:p,titleSuffix:h,cwd:g,canPin:_,hideForkActions:v}=e,y=u===void 0?!1:u,",
      "projectName:f,title:CPX_nativeTitle,titleSuffix:h,cwd:g,canPin:_,hideForkActions:v}=e,p=CPXThreadHeaderTitle(CPX_nativeTitle),y=u===void 0?!1:u,",
      "62119 thread title adapter mount anchor",
    );
    return replaceOnce(
      patched,
      "let E=T,D=H(Lt,n),O=so(E,Re(r??D).id),k;",
      "let E=T,D=H(Lt,n),CPXC=CPXBindThreadHeaderContext({routeId:n,threadId:n,cwd:g,workspaceRoot:g,gitRoot:E??g,hostId:Re(r??D).id,sourceProject:{id:g,label:typeof f==`string`?f:``,cwd:g}}),O=so(E,Re(r??D).id),k;",
      "62119 thread title native context anchor",
    );
  }
  if (
    text.includes("function Sl(e){let t=(0,Tl.c)(51),{conversationId:n,hostIdOverride:r,") &&
    text.includes("projectName:d,title:p,titleSuffix:m,cwd:h,canPin:g,hideForkActions:_}=e")
  ) {
    let patched = replaceOnce(
      text,
      "function Sl(e){let t=(0,Tl.c)(51),",
      `${threadHeaderTitleHook("t(P(),1)")}function Sl(e){let t=(0,Tl.c)(51),`,
      "72221 thread title adapter helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "projectName:d,title:p,titleSuffix:m,cwd:h,canPin:g,hideForkActions:_}=e,v=c===void 0?!1:c,",
      "projectName:d,title:CPX_nativeTitle,titleSuffix:m,cwd:h,canPin:g,hideForkActions:_}=e,p=CPXThreadHeaderTitle(CPX_nativeTitle),v=c===void 0?!1:c,",
      "72221 thread title adapter mount anchor",
    );
  }
  if (
    text.includes("function Sl(e){let t=(0,Tl.c)(51),{conversationId:n,hostIdOverride:r,") &&
    text.includes("pendingWorktree:o,projectIcon:s,projectIconInteractive:c,projectHoverCardContent:u,projectName:p,title:h,titleSuffix:g,cwd:_,canPin:v,hideForkActions:y}=e") &&
    text.includes("let D=E,O=W(rn,n),k=so(D,f(r??O).id),A;")
  ) {
    let patched = replaceOnce(
      text,
      "function Sl(e){let t=(0,Tl.c)(51),",
      `${threadHeaderContextHook()}${threadHeaderBoundTitleHook("t(I(),1)")}function Sl(e){let t=(0,Tl.c)(51),`,
      "71524 thread title context helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "projectName:p,title:h,titleSuffix:g,cwd:_,canPin:v,hideForkActions:y}=e,b=c===void 0?!1:c,",
      "projectName:p,title:CPX_nativeTitle,titleSuffix:g,cwd:_,canPin:v,hideForkActions:y}=e,h=CPXThreadHeaderTitle(CPX_nativeTitle),b=c===void 0?!1:c,",
      "71524 thread title adapter mount anchor",
    );
    return replaceOnce(
      patched,
      "let D=E,O=W(rn,n),k=so(D,f(r??O).id),A;",
      "let D=E,O=W(rn,n),CPXC=CPXBindThreadHeaderContext({routeId:n,threadId:n,cwd:_,workspaceRoot:_,gitRoot:D??_,hostId:f(r??O).id,sourceProject:{id:_,label:typeof p==`string`?p:``,cwd:_}}),k=so(D,f(r??O).id),A;",
      "71524 thread title native context anchor",
    );
  }
  if (
    text.includes("function xl(e){let t=(0,wl.c)(51),{conversationId:n,hostIdOverride:r,") &&
    text.includes("projectName:f,title:p,titleSuffix:m,cwd:h,canPin:g,hideForkActions:_}=e")
  ) {
    let patched = replaceOnce(
      text,
      "function xl(e){let t=(0,wl.c)(51),",
      `${threadHeaderTitleHook("t(rt(),1)")}function xl(e){let t=(0,wl.c)(51),`,
      "31428 thread title adapter helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "projectName:f,title:p,titleSuffix:m,cwd:h,canPin:g,hideForkActions:_}=e,v=l===void 0?!1:l,",
      "projectName:f,title:CPX_nativeTitle,titleSuffix:m,cwd:h,canPin:g,hideForkActions:_}=e,p=CPXThreadHeaderTitle(CPX_nativeTitle),v=l===void 0?!1:l,",
      "31428 thread title adapter mount anchor",
    );
  }
  if (
    text.includes("function Sl(e){let t=(0,Tl.c)(51),{conversationId:n,hostIdOverride:r,") &&
    text.includes("projectName:p,title:h,titleSuffix:g,cwd:_,canPin:v,hideForkActions:y}=e")
  ) {
    let patched = replaceOnce(
      text,
      "function Sl(e){let t=(0,Tl.c)(51),",
      `${threadHeaderTitleHook("t(I(),1)")}function Sl(e){let t=(0,Tl.c)(51),`,
      "41301 thread title adapter helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "projectName:p,title:h,titleSuffix:g,cwd:_,canPin:v,hideForkActions:y}=e,b=c===void 0?!1:c,",
      "projectName:p,title:CPX_nativeTitle,titleSuffix:g,cwd:_,canPin:v,hideForkActions:y}=e,h=CPXThreadHeaderTitle(CPX_nativeTitle),b=c===void 0?!1:c,",
      "41301 thread title adapter mount anchor",
    );
  }
  let patched = replaceOnce(
    text,
    "function Sl(e){let t=(0,Tl.c)(51),",
    `${threadHeaderTitleHook()}function Sl(e){let t=(0,Tl.c)(51),`,
    "thread title adapter helper insertion anchor",
  );
  return replaceOnce(
    patched,
    "projectName:u,title:d,titleSuffix:f,cwd:p,canPin:g,hideForkActions:_}=e,y=c===void 0?!1:c,",
    "projectName:u,title:CPX_nativeTitle,titleSuffix:f,cwd:p,canPin:g,hideForkActions:_}=e,d=CPXThreadHeaderTitle(CPX_nativeTitle),y=c===void 0?!1:c,",
    "thread title adapter mount anchor",
  );
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
    "t[8]!==l||t[9]!==v||t[10]!==y||t[11]!==b?(x=(0,s.jsxs)(`div`,{className:`text-md flex min-w-0 items-center gap-2 truncate text-base electron:font-medium`,children:[v,y,b,l]}),t[8]=l,t[9]=v,t[10]=y,t[11]=b,t[12]=x):x=t[12]",
    "thread page header title-cell anchor",
  );
  return replaceOnce(
    patched,
    "let C;t[15]!==S||t[16]!==f?(C=(0,s.jsxs)(`div`,{className:`flex items-center justify-end gap-1.5`,children:[f,S]}),t[15]=S,t[16]=f,t[17]=C):C=t[17];",
    "let C;t[15]!==S||t[16]!==f?(C=(0,s.jsxs)(`div`,{className:`flex items-center justify-end gap-1.5`,children:[CPX_headerAccessories,f,S]}),t[15]=S,t[16]=f,t[17]=C):C=t[17];",
    "thread page header native action-cell accessory anchor",
  );
}

function patchThreadHeaderActionShell(text) {
  if (text.includes("function bt(e){let t=(0,$.c)(8),{actionId:n,conversationId:r}=e,")) {
    let patched = replaceOnce(
      text,
      "function bt(e){let t=(0,$.c)(8),{actionId:n,conversationId:r}=e,",
      "let CPXH=window.CodexPlusHost.adapters;function CPXThreadHeaderActiveAccessories(e){Z.useSyncExternalStore(CPXH.threadHeader.subscribe,CPXH.threadHeader.snapshot,CPXH.threadHeader.snapshot);return CPXH.threadHeader.accessories(CPXH.context.active(),e)}function bt(e){let t=(0,$.c)(9),{actionId:n,conversationId:r}=e,",
      "616 thread header action-shell helper anchor",
    );
    patched = replaceOnce(
      patched,
      "let u=l;if(u==null||!c||o.kind!==`git`||a.kind===`remote-control`)return null;",
      "let u=l,CPXA=CPXThreadHeaderActiveAccessories({jsx:Q.jsx,jsxs:Q.jsxs});if(u==null||!c||o.kind!==`git`||a.kind===`remote-control`)return null;",
      "616 thread header native action accessory anchor",
    );
    patched = replaceOnce(
      patched,
      "let f;return t[5]!==n||t[6]!==d?(f=(0,Q.jsx)(P.HeaderAction,{actionId:n,align:`end`,order:100,children:d}),t[5]=n,t[6]=d,t[7]=f):f=t[7],f}",
      "let f;return t[5]!==CPXA||t[6]!==n||t[7]!==d?(f=(0,Q.jsx)(P.HeaderAction,{actionId:n,align:`end`,order:100,children:(0,Q.jsxs)(Q.Fragment,{children:[CPXA,d]})}),t[5]=CPXA,t[6]=n,t[7]=d,t[8]=f):f=t[8],f}",
      "616 thread header Open in accessory mount anchor",
    );
    return replaceOnce(
      patched,
      "function Pt(e){let t=(0,$.c)(24),n=o(U),r=s(Se),",
      "function Pt(e){let t=(0,$.c)(24),n=o(U),CPXSP=globalThis.CodexPlusHost.adapters.threadSidePanel;CPXSP.bindMount(()=>({scope:n}));CPXSP.bindOpenFile((e,t={})=>ye(n,e,t));let r=s(Se),",
      "616 thread side panel native binding anchor",
    );
  }
  if (text.includes("function eR({isHeaderEdgeScroll:e,isApplicationMenuBarEnabled:t}){")) {
    let patched = replaceOnce(
      text,
      "function eR({isHeaderEdgeScroll:e,isApplicationMenuBarEnabled:t}){",
      `${threadHeaderActiveHook()}function eR({isHeaderEdgeScroll:e,isApplicationMenuBarEnabled:t}){let CPXScope=ge(q),CPXSP=globalThis.CodexPlusHost.adapters.threadSidePanel;CPXSP.bindMount(()=>({scope:CPXScope}));CPXSP.bindOpenFile((e,n={})=>YG(CPXScope,e,n));`,
      "31921 thread header action-shell helper anchor",
    );
    return replaceOnce(
      patched,
      "h=u.filter(({align:e})=>e===`start`),g=u.filter(({align:e})=>e===`center`),v=u.filter(({align:e})=>e===`end`),y=h.length>0,",
      "h=u.filter(({align:e})=>e===`start`),g=u.filter(({align:e})=>e===`center`),v=((e,t)=>t==null?e:[{actionId:`codex-plus-project-path`,align:`end`,node:t},...e])(u.filter(({align:e})=>e===`end`),CPXHA(QL.useSyncExternalStore,{jsx:uR.jsx,jsxs:uR.jsxs})),y=h.length>0,",
      "31921 thread header native end-action anchor",
    );
  }
  if (text.includes("function Xfn({isHeaderEdgeScroll:e,isApplicationMenuBarEnabled:t}){")) {
    let patched = replaceOnce(
      text,
      "function Xfn({isHeaderEdgeScroll:e,isApplicationMenuBarEnabled:t}){",
      `${threadHeaderActiveHook()}function Xfn({isHeaderEdgeScroll:e,isApplicationMenuBarEnabled:t}){`,
      "41415 thread header action-shell helper anchor",
    );
    return replaceOnce(
      patched,
      "h=u.filter(({align:e})=>e===`start`),g=u.filter(({align:e})=>e===`center`),_=u.filter(({align:e})=>e===`end`),v=h.length>0,",
      "h=u.filter(({align:e})=>e===`start`),g=u.filter(({align:e})=>e===`center`),_=((e,t)=>t==null?e:[{actionId:`codex-plus-project-path`,align:`end`,node:t},...e])(u.filter(({align:e})=>e===`end`),CPXHA(nq.useSyncExternalStore,{jsx:rq.jsx,jsxs:rq.jsxs})),v=h.length>0,",
      "41415 thread header native end-action anchor",
    );
  }
  if (text.includes("function aGe({isHeaderEdgeScroll:e,isApplicationMenuBarEnabled:t}){")) {
    let patched = replaceOnce(
      text,
      "function aGe({isHeaderEdgeScroll:e,isApplicationMenuBarEnabled:t}){",
      `${threadHeaderActiveHook()}function aGe({isHeaderEdgeScroll:e,isApplicationMenuBarEnabled:t}){`,
      "42026 thread header action-shell helper anchor",
    );
    return replaceOnce(
      patched,
      "h=u.filter(({align:e})=>e===`start`),g=u.filter(({align:e})=>e===`center`),_=u.filter(({align:e})=>e===`end`),v=h.length>0,",
      "h=u.filter(({align:e})=>e===`start`),g=u.filter(({align:e})=>e===`center`),_=((e,t)=>t==null?e:[{actionId:`codex-plus-project-path`,align:`end`,node:t},...e])(u.filter(({align:e})=>e===`end`),CPXHA(DF.useSyncExternalStore,{jsx:OF.jsx,jsxs:OF.jsxs})),v=h.length>0,",
      "42026 thread header native end-action anchor",
    );
  }
  if (text.includes("function lb({isHeaderEdgeScroll:e,isApplicationMenuBarEnabled:t}){")) {
    let patched = replaceOnce(
      text,
      "function lb({isHeaderEdgeScroll:e,isApplicationMenuBarEnabled:t}){",
      `${threadHeaderActiveHook()}function lb({isHeaderEdgeScroll:e,isApplicationMenuBarEnabled:t}){`,
      "61825 thread header action-shell helper anchor",
    );
    return replaceOnce(
      patched,
      "h=u.filter(({align:e})=>e===`start`),g=u.filter(({align:e})=>e===`center`),_=u.filter(({align:e})=>e===`end`),v=h.length>0,",
      "h=u.filter(({align:e})=>e===`start`),g=u.filter(({align:e})=>e===`center`),_=((e,t)=>t==null?e:[{actionId:`codex-plus-project-path`,align:`end`,node:t},...e])(u.filter(({align:e})=>e===`end`),CPXHA(sb.useSyncExternalStore,{jsx:yb.jsx,jsxs:yb.jsxs})),v=h.length>0,",
      "61825 thread header native end-action anchor",
    );
  }
  if (text.includes("function a7e({isHeaderEdgeScroll:e,isApplicationMenuBarEnabled:t}){")) {
    let patched = replaceOnce(
      text,
      "function a7e({isHeaderEdgeScroll:e,isApplicationMenuBarEnabled:t}){",
      `${threadHeaderActiveHook()}function a7e({isHeaderEdgeScroll:e,isApplicationMenuBarEnabled:t}){`,
      "70822 thread header action-shell helper anchor",
    );
    return replaceOnce(
      patched,
      "h=u.filter(({align:e})=>e===`start`),g=u.filter(({align:e})=>e===`center`),_=u.filter(({align:e})=>e===`end`),v=h.length>0,",
      "h=u.filter(({align:e})=>e===`start`),g=u.filter(({align:e})=>e===`center`),_=((e,t)=>t==null?e:[{actionId:`codex-plus-project-path`,align:`end`,node:t},...e])(u.filter(({align:e})=>e===`end`),CPXHA(G5.useSyncExternalStore,{jsx:K5.jsx,jsxs:K5.jsxs})),v=h.length>0,",
      "70822 thread header native end-action anchor",
    );
  }
  if (text.includes("function THt({isHeaderEdgeScroll:e,isApplicationMenuBarEnabled:t}){")) {
    let patched = replaceOnce(
      text,
      "function THt({isHeaderEdgeScroll:e,isApplicationMenuBarEnabled:t}){",
      `${threadHeaderActiveHook()}function THt({isHeaderEdgeScroll:e,isApplicationMenuBarEnabled:t}){`,
      "81905 thread header action-shell helper anchor",
    );
    return replaceOnce(
      patched,
      "h=u.filter(({align:e})=>e===`start`),g=u.filter(({align:e})=>e===`center`),_=u.filter(({align:e})=>e===`end`),v=h.length>0,",
      "h=u.filter(({align:e})=>e===`start`),g=u.filter(({align:e})=>e===`center`),_=((e,t)=>t==null?e:[{actionId:`codex-plus-project-path`,align:`end`,node:t},...e])(u.filter(({align:e})=>e===`end`),CPXHA(TU.useSyncExternalStore,{jsx:EU.jsx,jsxs:EU.jsxs})),v=h.length>0,",
      "81905 thread header native end-action anchor",
    );
  }
  if (text.includes("function Nk({isHeaderEdgeScroll:e,isApplicationMenuBarEnabled:t}){")) {
    let patched = replaceOnce(
      text,
      "function Nk({isHeaderEdgeScroll:e,isApplicationMenuBarEnabled:t}){",
      `${threadHeaderActiveHook()}function Nk({isHeaderEdgeScroll:e,isApplicationMenuBarEnabled:t}){`,
      "101652 thread header action-shell helper anchor",
    );
    return replaceOnce(
      patched,
      "h=u.filter(({align:e})=>e===`start`),g=u.filter(({align:e})=>e===`center`),_=u.filter(({align:e})=>e===`end`),v=h.length>0,",
      "h=u.filter(({align:e})=>e===`start`),g=u.filter(({align:e})=>e===`center`),_=((e,t)=>t==null?e:[{actionId:`codex-plus-project-path`,align:`end`,node:t},...e])(u.filter(({align:e})=>e===`end`),CPXHA(jk.useSyncExternalStore,{jsx:Uk.jsx,jsxs:Uk.jsxs})),v=h.length>0,",
      "101652 thread header native end-action anchor",
    );
  }
  let patched = replaceOnce(
    text,
    "function zyt({isHeaderEdgeScroll:e,isApplicationMenuBarEnabled:t}){",
    `${threadHeaderActiveHook()}function zyt({isHeaderEdgeScroll:e,isApplicationMenuBarEnabled:t}){`,
    "141536 thread header action-shell helper anchor",
  );
  return replaceOnce(
    patched,
    "h=u.filter(({align:e})=>e===`start`),g=u.filter(({align:e})=>e===`center`),_=u.filter(({align:e})=>e===`end`),v=h.length>0,",
    "h=u.filter(({align:e})=>e===`start`),g=u.filter(({align:e})=>e===`center`),_=((e,t)=>t==null?e:[{actionId:`codex-plus-project-path`,align:`end`,node:t},...e])(u.filter(({align:e})=>e===`end`),CPXHA(aV.useSyncExternalStore,{jsx:oV.jsx,jsxs:oV.jsxs})),v=h.length>0,",
    "141536 thread header native end-action anchor",
  );
}

function patchLocalConversationPageHeader(text) {
  text = patchThreadSidePanelNativeProjectContext(text);
  if (text.includes("(0,$.jsx)(kf,{desktopDeepLinkConversationId:n,onBack:g,title:_,trailing:v})")) {
    return replaceOnce(
      text,
      "(0,$.jsx)(kf,{desktopDeepLinkConversationId:n,onBack:g,title:_,trailing:v})",
      "(0,$.jsx)(kf,{desktopDeepLinkConversationId:n,onBack:g,title:_,trailing:v,cwd:d})",
      "62119 local conversation header cwd bridge anchor",
    );
  }
  if (text.includes("projectIcon:o,projectHoverCardContent:s,projectName:c,title:l,titleSuffix:u,cwd:p,canPin:m,hideForkActions:h")) {
    let patched = replaceOnce(
      text,
      "function pi(e){let t=(0,W.c)(32),",
      `${threadHeaderContextHook()}${threadHeaderBoundTitleHook()}function pi(e){let t=(0,W.c)(32),`,
      "141536 local conversation context helper anchor",
    );
    patched = replaceOnce(
      patched,
      "projectIcon:o,projectHoverCardContent:s,projectName:c,title:l,titleSuffix:u,cwd:p,canPin:m,hideForkActions:h}=e,v=m===void 0?!0:m,",
      "projectIcon:o,projectHoverCardContent:s,projectName:c,title:CPX_nativeTitle,titleSuffix:u,cwd:p,canPin:m,hideForkActions:h}=e,CPXC=CPXBindThreadHeaderContext({cwd:p,hostId:_(yt,n),header:{surface:`local-conversation`,titleText:typeof CPX_nativeTitle==`string`?CPX_nativeTitle:null,projectName:c??null}}),l=CPXThreadHeaderTitle(CPX_nativeTitle),v=m===void 0?!0:m,",
      "141536 local conversation native context anchor",
    );
    return patched;
  }
  if (text.includes("(0,$.jsx)(kf,{desktopDeepLinkConversationId:n,onBack:_,title:v,trailing:y})")) {
    return replaceOnce(
      text,
      "(0,$.jsx)(kf,{desktopDeepLinkConversationId:n,onBack:_,title:v,trailing:y})",
      "(0,$.jsx)(kf,{desktopDeepLinkConversationId:n,onBack:_,title:v,trailing:y,cwd:d})",
      "local conversation header cwd bridge anchor",
    );
  }
  if (text.includes("function QS(e){let t=(0,oC.c)(29),")) {
    return replaceOnce(
      text,
      "(0,$.jsx)(Of,{desktopDeepLinkConversationId:n,onBack:g,title:_,trailing:v})",
      "(0,$.jsx)(Of,{desktopDeepLinkConversationId:n,onBack:g,title:_,trailing:v,cwd:d??f})",
      "41301 local conversation header cwd bridge anchor",
    );
  }
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
    if (text.includes("projectIcon:s,projectHoverCardContent:c,projectName:l,title:u,titleSuffix:d,cwd:f,canPin:m,hideForkActions:h")) {
      if (threadHeaderActionShellFile) {
        let patched = replaceOnce(
          text,
          "function pi(e){let t=(0,W.c)(32),",
          `${threadHeaderContextHook()}${threadHeaderBoundTitleHook("H")}function pi(e){let t=(0,W.c)(32),`,
          "81905 local conversation context helper insertion anchor",
        );
        patched = replaceOnce(
          patched,
          "projectIcon:s,projectHoverCardContent:c,projectName:l,title:u,titleSuffix:d,cwd:f,canPin:m,hideForkActions:h}=e,g=m===void 0?!0:m,_=I(),",
          "projectIcon:s,projectHoverCardContent:c,projectName:l,title:CPX_nativeTitle,titleSuffix:d,cwd:f,canPin:m,hideForkActions:h}=e,g=m===void 0?!0:m,u=CPXThreadHeaderTitle(CPX_nativeTitle),_=I(),",
          "81905 local conversation native title anchor",
        );
        return replaceOnce(
          patched,
          "let b=xr(y,E(L(i,n)).id),x;",
          "let b=xr(y,E(L(i,n)).id),CPXC=CPXBindThreadHeaderContext({cwd:f,hostId:E(L(i,n)).id,header:{surface:`local-conversation`,titleText:typeof CPX_nativeTitle==`string`?CPX_nativeTitle:null,projectName:l??null}}),x;",
          "81905 local conversation native context anchor",
        );
      }
      let patched = replaceOnce(
        text,
        "function pi(e){let t=(0,W.c)(32),",
        `${threadHeaderHook()}function pi(e){let t=(0,W.c)(32),`,
        "81905 local conversation header helper insertion anchor",
      );
      return replaceOnce(
        patched,
        "let k;t[26]===Symbol.for(`react.memo_cache_sentinel`)?(k=null,t[26]=k):k=t[26];",
        "let CPX_headerContext={cwd:f,hostId:null,header:{surface:`local-conversation`,titleText:typeof u==`string`?u:null,projectName:l??null}},k=CPXThreadHeaderAccessories({context:CPX_headerContext,deps:{jsx:G.jsx,jsxs:G.jsxs,Tooltip:re}});",
        "81905 local conversation header accessory render anchor",
      );
    }
    if (text.includes("projectIcon:a,projectHoverCardContent:o,projectName:s,title:c,titleSuffix:u,cwd:d,canPin:f,hideForkActions:p")) {
      if (threadHeaderActionShellFile) {
        let patched = replaceOnce(
          text,
          "function pi(e){let t=(0,W.c)(32),",
          `${threadHeaderContextHook()}${threadHeaderBoundTitleHook("Qi")}function pi(e){let t=(0,W.c)(32),`,
          "101652 local conversation header context helper insertion anchor",
        );
        patched = replaceOnce(
          patched,
          "projectIcon:a,projectHoverCardContent:o,projectName:s,title:c,titleSuffix:u,cwd:d,canPin:f,hideForkActions:p}=e,m=f===void 0?!0:f,h=A(),g=Pe(),_;",
          "projectIcon:a,projectHoverCardContent:o,projectName:s,title:CPX_nativeTitle,titleSuffix:u,cwd:d,canPin:f,hideForkActions:p}=e,m=f===void 0?!0:f,h=A(),g=Pe(),c=CPXThreadHeaderTitle(CPX_nativeTitle),_;",
          "101652 local conversation native title anchor",
        );
        return replaceOnce(
          patched,
          "let y=xr(_,v(P(E,n)).id),b;",
          "let y=xr(_,v(P(E,n)).id),CPXC=CPXBindThreadHeaderContext({cwd:d,hostId:v(P(E,n)).id,header:{surface:`local-conversation`,titleText:typeof CPX_nativeTitle==`string`?CPX_nativeTitle:null,projectName:s??null}}),b;",
          "101652 local conversation native context anchor",
        );
      }
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
      if (threadHeaderActionShellFile) {
        let patched = replaceOnce(
          text,
          "function pi(e){let t=(0,W.c)(32),",
          `${threadHeaderContextHook()}${threadHeaderBoundTitleHook("Qi")}function pi(e){let t=(0,W.c)(32),`,
          "70822 local conversation header context helper insertion anchor",
        );
        patched = replaceOnce(
          patched,
          "projectIcon:a,projectHoverCardContent:s,projectName:c,title:l,titleSuffix:u,cwd:d,canPin:f,hideForkActions:m}=e,g=f===void 0?!0:f,_=L(),v=h(),y;",
          "projectIcon:a,projectHoverCardContent:s,projectName:c,title:CPX_nativeTitle,titleSuffix:u,cwd:d,canPin:f,hideForkActions:m}=e,g=f===void 0?!0:f,_=L(),v=h(),l=CPXThreadHeaderTitle(CPX_nativeTitle),y;",
          "70822 local conversation native title anchor",
        );
        return replaceOnce(
          patched,
          "let x=xr(y,nt(o(Pt,n)).id),S;",
          "let x=xr(y,nt(o(Pt,n)).id),CPXC=CPXBindThreadHeaderContext({cwd:d,hostId:nt(o(Pt,n)).id,header:{surface:`local-conversation`,titleText:typeof CPX_nativeTitle==`string`?CPX_nativeTitle:null,projectName:c??null}}),S;",
          "70822 local conversation native context anchor",
        );
      }
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
    if (text.includes("projectIcon:a,projectHoverCardContent:o,projectName:s,title:c,titleSuffix:u,cwd:p,canPin:m,hideForkActions:h")) {
      if (threadHeaderActionShellFile) {
        let patched = replaceOnce(
          text,
          "function pi(e){let t=(0,W.c)(32),",
          `${threadHeaderContextHook()}${threadHeaderBoundTitleHook("Qi")}function pi(e){let t=(0,W.c)(32),`,
          "42026 local conversation header context helper insertion anchor",
        );
        patched = replaceOnce(
          patched,
          "projectIcon:a,projectHoverCardContent:o,projectName:s,title:c,titleSuffix:u,cwd:p,canPin:m,hideForkActions:h}=e,_=m===void 0?!0:m,v=R(),y=f(),b;",
          "projectIcon:a,projectHoverCardContent:o,projectName:s,title:CPX_nativeTitle,titleSuffix:u,cwd:p,canPin:m,hideForkActions:h}=e,_=m===void 0?!0:m,v=R(),y=f(),c=CPXThreadHeaderTitle(CPX_nativeTitle),b;",
          "42026 local conversation native title anchor",
        );
        return replaceOnce(
          patched,
          "let x=xr(b,Zt(l(kt,n)).id),S;",
          "let x=xr(b,Zt(l(kt,n)).id),CPXC=CPXBindThreadHeaderContext({cwd:p,hostId:Zt(l(kt,n)).id,header:{surface:`local-conversation`,titleText:typeof CPX_nativeTitle==`string`?CPX_nativeTitle:null,projectName:s??null}}),S;",
          "42026 local conversation native context anchor",
        );
      }
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
    if (text.includes("projectIcon:a,projectHoverCardContent:s,projectName:c,title:l,titleSuffix:u,cwd:d,canPin:f,hideForkActions:p")) {
      if (threadHeaderActionShellFile) {
        let patched = replaceOnce(
          text,
          "function mi(e){let t=(0,U.c)(32),",
          `${threadHeaderContextHook()}${threadHeaderBoundTitleHook("Qi")}function mi(e){let t=(0,U.c)(32),`,
          "41415 local conversation header context helper insertion anchor",
        );
        patched = replaceOnce(
          patched,
          "projectIcon:a,projectHoverCardContent:s,projectName:c,title:l,titleSuffix:u,cwd:d,canPin:f,hideForkActions:p}=e,g=f===void 0?!0:f,_=N(),v=h(),y;",
          "projectIcon:a,projectHoverCardContent:s,projectName:c,title:CPX_nativeTitle,titleSuffix:u,cwd:d,canPin:f,hideForkActions:p}=e,g=f===void 0?!0:f,_=N(),v=h(),l=CPXThreadHeaderTitle(CPX_nativeTitle),y;",
          "41415 local conversation native title anchor",
        );
        return replaceOnce(
          patched,
          "let b=Sr(y,hn(m(gn,n)).id),x;",
          "let b=Sr(y,hn(m(gn,n)).id),CPXC=CPXBindThreadHeaderContext({cwd:d,hostId:hn(m(gn,n)).id,header:{surface:`local-conversation`,titleText:typeof CPX_nativeTitle==`string`?CPX_nativeTitle:null,projectName:c??null}}),x;",
          "41415 local conversation native context anchor",
        );
      }
    }
    if (text.includes("projectIcon:a,projectHoverCardContent:o,projectName:s,title:c,titleSuffix:l,cwd:u,canPin:p,hideForkActions:h")) {
      if (threadHeaderActionShellFile) {
        let patched = replaceOnce(
          text,
          "function mi(e){let t=(0,U.c)(32),",
          `${threadHeaderContextHook()}${threadHeaderBoundTitleHook("Qi")}function mi(e){let t=(0,U.c)(32),`,
          "61825 local conversation header context helper insertion anchor",
        );
        patched = replaceOnce(
          patched,
          "projectIcon:a,projectHoverCardContent:o,projectName:s,title:c,titleSuffix:l,cwd:u,canPin:p,hideForkActions:h}=e,g=p===void 0?!0:p,_=R(),v=f(),y;",
          "projectIcon:a,projectHoverCardContent:o,projectName:s,title:CPX_nativeTitle,titleSuffix:l,cwd:u,canPin:p,hideForkActions:h}=e,g=p===void 0?!0:p,_=R(),v=f(),c=CPXThreadHeaderTitle(CPX_nativeTitle),y;",
          "61825 local conversation native title anchor",
        );
        return replaceOnce(
          patched,
          "let x=Sr(y,mt(d(tt,n)).id),S;",
          "let x=Sr(y,mt(d(tt,n)).id),CPXC=CPXBindThreadHeaderContext({cwd:u,hostId:mt(d(tt,n)).id,header:{surface:`local-conversation`,titleText:typeof CPX_nativeTitle==`string`?CPX_nativeTitle:null,projectName:s??null}}),S;",
          "61825 local conversation native context anchor",
        );
      }
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
      if (threadHeaderActionShellFile) {
        let patched = replaceOnce(
          text,
          "function mi(e){let t=(0,U.c)(32),",
          `${threadHeaderContextHook()}${threadHeaderBoundTitleHook("Qi")}function mi(e){let t=(0,U.c)(32),`,
          "31921 local conversation header context helper insertion anchor",
        );
        patched = replaceOnce(
          patched,
          "projectIcon:a,projectHoverCardContent:o,projectName:s,title:c,titleSuffix:l,cwd:u,canPin:d,hideForkActions:f}=e,p=d===void 0?!0:d,m=F(),g=rt(),_;",
          "projectIcon:a,projectHoverCardContent:o,projectName:s,title:CPX_nativeTitle,titleSuffix:l,cwd:u,canPin:d,hideForkActions:f}=e,p=d===void 0?!0:d,m=F(),g=rt(),c=CPXThreadHeaderTitle(CPX_nativeTitle),_;",
          "31921 local conversation native title anchor",
        );
        return replaceOnce(
          patched,
          "let v=Sr(_,C(j(ke,n)).id),y;",
          "let v=Sr(_,C(j(ke,n)).id),CPXC=CPXBindThreadHeaderContext({cwd:u,hostId:C(j(ke,n)).id,header:{surface:`local-conversation`,titleText:typeof CPX_nativeTitle==`string`?CPX_nativeTitle:null,projectName:s??null}}),y;",
          "31921 local conversation native context anchor",
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
  const local616HeaderName = ["Tt", "wt"].find((name) => text.includes(`function ${name}(e){let t=(0,Y.c)(42),`));
  if (threadHeaderActionShellFile && local616HeaderName) {
    let patched = replaceOnce(
      text,
      `function ${local616HeaderName}(e){let t=(0,Y.c)(42),`,
      `${threadHeaderContextHook()}${threadHeaderBoundTitleHook("X")}function ${local616HeaderName}(e){let t=(0,Y.c)(42),`,
      "616 local conversation header context helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "let t=(0,Y.c)(42),{conversationId:n,getConversationMarkdown:r,markdownParentConversationId:a,title:o,titleSuffix:s,cwd:c,canPin:l,hideProjectMetadata:d,hideForkActions:f}=e,p=l===void 0?!0:l,m=d===void 0?!1:d,h=A(),g;",
      "let t=(0,Y.c)(42),{conversationId:n,getConversationMarkdown:r,markdownParentConversationId:a,title:CPX_nativeTitle,titleSuffix:s,cwd:c,canPin:l,hideProjectMetadata:d,hideForkActions:f}=e,CPXC=CPXBindThreadHeaderContext({cwd:c,hostId:u(i(O,n)).id,header:{surface:`local-conversation`,titleText:typeof CPX_nativeTitle==`string`?CPX_nativeTitle:null}}),o=CPXThreadHeaderTitle(CPX_nativeTitle),p=l===void 0?!0:l,m=d===void 0?!1:d,h=A(),g;",
      "616 local conversation native context anchor",
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

function patchGeneralSettingsUserBubbleColors(text, context = {}) {
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715.31925")) {
    let patched = replaceOnce(
      text,
      "function Tr({showCodeFont:e,showTranslucentSidebarToggle:t,variant:r}){",
      `${appearanceSettingsHook("{React:Ur,jsx:J.jsx,SettingRow:U,ColorInput:Ar,Switch:V}")}function Tr({showCodeFont:e,showTranslucentSidebarToggle:t,variant:r}){`,
      "31925 user bubble settings helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "children:[D.map(e=>(0,J.jsx)(U,{size:`compact`,control:(0,J.jsx)(Ar,{ariaLabel:e.ariaLabel,value:x[e.role],onChange:t=>{k(e.role,t)}}),label:e.label},e.role)),O.map",
      "children:[D.map(e=>(0,J.jsx)(U,{size:`compact`,control:(0,J.jsx)(Ar,{ariaLabel:e.ariaLabel,value:x[e.role],onChange:t=>{k(e.role,t)}}),label:e.label},e.role)),...CPXAppearanceRows(r),O.map",
      "31925 user bubble settings row anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715")) {
    let patched = replaceOnce(
      text,
      "function Cr({showCodeFont:e,showTranslucentSidebarToggle:t,variant:r}){",
      `${appearanceSettingsHook("{React:Vr,jsx:J.jsx,SettingRow:U,ColorInput:Or,Switch:V}")}function Cr({showCodeFont:e,showTranslucentSidebarToggle:t,variant:r}){`,
      "21316 user bubble settings helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "children:[D.map(e=>(0,J.jsx)(U,{size:`compact`,control:(0,J.jsx)(Or,{ariaLabel:e.ariaLabel,value:x[e.role],onChange:t=>{k(e.role,t)}}),label:e.label},e.role)),O.map",
      "children:[D.map(e=>(0,J.jsx)(U,{size:`compact`,control:(0,J.jsx)(Or,{ariaLabel:e.ariaLabel,value:x[e.role],onChange:t=>{k(e.role,t)}}),label:e.label},e.role)),...CPXAppearanceRows(r),O.map",
      "21316 user bubble settings row anchor",
    );
  }
  if (
    text.includes("function Ar({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){") &&
    text.includes("children:[k.map(e=>(0,J.jsx)(H,{size:`compact`,control:(0,J.jsx)(Fr,{ariaLabel:e.ariaLabel,value:S[e.role],onChange:t=>{A(e.role,t)}}),label:e.label},e.role)),ee.map")
  ) {
    let patched = replaceOnce(
      text,
      "function Ar({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){",
      `${appearanceSettingsHook("{React:Jr,jsx:J.jsx,SettingRow:H,ColorInput:Fr,Switch:Vn}")}function Ar({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){`,
      "91948 user bubble settings helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "children:[k.map(e=>(0,J.jsx)(H,{size:`compact`,control:(0,J.jsx)(Fr,{ariaLabel:e.ariaLabel,value:S[e.role],onChange:t=>{A(e.role,t)}}),label:e.label},e.role)),ee.map",
      "children:[k.map(e=>(0,J.jsx)(H,{size:`compact`,control:(0,J.jsx)(Fr,{ariaLabel:e.ariaLabel,value:S[e.role],onChange:t=>{A(e.role,t)}}),label:e.label},e.role)),...CPXAppearanceRows(n),ee.map",
      "91948 user bubble settings row anchor",
    );
  }
  if (
    text.includes("function Or({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){") &&
    text.includes("children:[D.map(e=>(0,J.jsx)(L,{size:`compact`,control:(0,J.jsx)(Nr,{ariaLabel:e.ariaLabel,value:x[e.role],onChange:t=>{k(e.role,t)}}),label:e.label},e.role)),O.map")
  ) {
    let patched = replaceOnce(text, "function Or({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){", `${appearanceSettingsHook("{React:Kr,jsx:J.jsx,SettingRow:L,ColorInput:Nr,Switch:G}")}function Or({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){`, "61608 user bubble settings helper insertion anchor");
    return replaceOnce(
      patched,
      "children:[D.map(e=>(0,J.jsx)(L,{size:`compact`,control:(0,J.jsx)(Nr,{ariaLabel:e.ariaLabel,value:x[e.role],onChange:t=>{k(e.role,t)}}),label:e.label},e.role)),O.map",
      "children:[D.map(e=>(0,J.jsx)(L,{size:`compact`,control:(0,J.jsx)(Nr,{ariaLabel:e.ariaLabel,value:x[e.role],onChange:t=>{k(e.role,t)}}),label:e.label},e.role)),...CPXAppearanceRows(n),O.map",
      "61608 user bubble settings row anchor",
    );
  }
  if (
    text.includes("function Or({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){") &&
    text.includes("children:[D.map(e=>(0,J.jsx)(V,{size:`compact`,control:(0,J.jsx)(Nr,{ariaLabel:e.ariaLabel,value:x[e.role],onChange:t=>{k(e.role,t)}}),label:e.label},e.role)),O.map")
  ) {
    let patched = replaceOnce(
      text,
      "function Or({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){",
      `${appearanceSettingsHook("{React:Kr,jsx:J.jsx,SettingRow:V,ColorInput:Nr,Switch:H}")}function Or({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){`,
      "62119 user bubble settings helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "children:[D.map(e=>(0,J.jsx)(V,{size:`compact`,control:(0,J.jsx)(Nr,{ariaLabel:e.ariaLabel,value:x[e.role],onChange:t=>{k(e.role,t)}}),label:e.label},e.role)),O.map",
      "children:[D.map(e=>(0,J.jsx)(V,{size:`compact`,control:(0,J.jsx)(Nr,{ariaLabel:e.ariaLabel,value:x[e.role],onChange:t=>{k(e.role,t)}}),label:e.label},e.role)),...CPXAppearanceRows(n),O.map",
      "62119 user bubble settings row anchor",
    );
  }
  if (
    text.includes("function Or({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){") &&
    text.includes("children:[T.map(e=>(0,J.jsx)(H,{size:`compact`,control:(0,J.jsx)(Nr,{ariaLabel:e.ariaLabel,value:y[e.role],onChange:t=>{D(e.role,t)}}),label:e.label},e.role)),E.map")
  ) {
    let patched = replaceOnce(
      text,
      "function Or({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){",
      `${appearanceSettingsHook("{React:Kr,jsx:J.jsx,SettingRow:H,ColorInput:Nr,Switch:G}")}function Or({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){`,
      "72221 user bubble settings helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "children:[T.map(e=>(0,J.jsx)(H,{size:`compact`,control:(0,J.jsx)(Nr,{ariaLabel:e.ariaLabel,value:y[e.role],onChange:t=>{D(e.role,t)}}),label:e.label},e.role)),E.map",
      "children:[T.map(e=>(0,J.jsx)(H,{size:`compact`,control:(0,J.jsx)(Nr,{ariaLabel:e.ariaLabel,value:y[e.role],onChange:t=>{D(e.role,t)}}),label:e.label},e.role)),...CPXAppearanceRows(n),E.map",
      "72221 user bubble settings row anchor",
    );
  }
  if (
    text.includes("function Or({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){") &&
    text.includes("children:[D.map(e=>(0,J.jsx)(H,{size:`compact`,control:(0,J.jsx)(Nr,{ariaLabel:e.ariaLabel,value:b[e.role],onChange:t=>{k(e.role,t)}}),label:e.label},e.role)),O.map")
  ) {
    let patched = replaceOnce(
      text,
      "function Or({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){",
      `${appearanceSettingsHook("{React:Kr,jsx:J.jsx,SettingRow:H,ColorInput:Nr,Switch:I}")}function Or({showCodeFont:e,showTranslucentSidebarToggle:t,variant:n}){`,
      "user bubble settings helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "children:[D.map(e=>(0,J.jsx)(H,{size:`compact`,control:(0,J.jsx)(Nr,{ariaLabel:e.ariaLabel,value:b[e.role],onChange:t=>{k(e.role,t)}}),label:e.label},e.role)),O.map",
      "children:[D.map(e=>(0,J.jsx)(H,{size:`compact`,control:(0,J.jsx)(Nr,{ariaLabel:e.ariaLabel,value:b[e.role],onChange:t=>{k(e.role,t)}}),label:e.label},e.role)),...CPXAppearanceRows(n),O.map",
      "user bubble settings row anchor",
    );
  }
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

function patchUserMessageAttachmentsBubbleColors(text, context = {}) {
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715")) {
    let patched = replaceOnce(text, "function Ey({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){", `${messageComposerHook()}function Ey({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){`, "21316 user bubble helper insertion anchor");
    patched = replaceOnce(
      patched,
      "return(0,Oy.jsx)(`form`,{className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),y()},children:",
      "return(0,Oy.jsx)(`form`,{\"data-codex-plus-user-entry\":!0,className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),y()},children:",
      "21316 edit user message entry marker anchor",
    );
    return replaceOnce(patched, "\"data-user-message-bubble\":!0,role:V?`button`:void 0,", "\"data-user-message-bubble\":!0,...CPXBubbleProps({}),role:V?`button`:void 0,", "21316 user bubble marker attribute anchor");
  }
  if (text.includes("function Rae({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){")) {
    let patched = replaceOnce(
      text,
      "function Rae({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){",
      `${messageComposerHook()}function Rae({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){`,
      "91948 user bubble helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "return(0,aT.jsx)(`form`,{className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),v()},children:",
      "return(0,aT.jsx)(`form`,{\"data-codex-plus-user-entry\":!0,className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),v()},children:",
      "91948 edit user message entry marker anchor",
    );
    return replaceOnce(
      patched,
      "\"data-user-message-bubble\":!0,role:B?`button`:void 0,",
      "\"data-user-message-bubble\":!0,...CPXBubbleProps({}),role:B?`button`:void 0,",
      "91948 user bubble marker attribute anchor",
    );
  }
  if (text.includes("function FNt({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){")) {
    let patched = replaceOnce(text, "function FNt({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){", `${messageComposerHook()}function FNt({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){`, "61608 user bubble helper insertion anchor");
    patched = replaceOnce(
      patched,
      "return(0,UY.jsx)(`form`,{className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),v()},children:",
      "return(0,UY.jsx)(`form`,{\"data-codex-plus-user-entry\":!0,className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),v()},children:",
      "61608 edit user message entry marker anchor",
    );
    return replaceOnce(
      patched,
      "de=V?(0,qY.jsx)(`div`,{className:`w-full p-px`,children:(0,qY.jsx)(FNt,{cwd:b??null,hostId:x,initialMessage:B.trim(),onCancel:()=>{te(null)},onDraftChange:e=>{te(e)},onSubmit:re})}):q?(0,qY.jsx)(`div`,{\"data-user-message-bubble\":!0,role:I?`button`:void 0,",
      "de=V?(0,qY.jsx)(`div`,{className:`w-full p-px`,children:(0,qY.jsx)(FNt,{cwd:b??null,hostId:x,initialMessage:B.trim(),onCancel:()=>{te(null)},onDraftChange:e=>{te(e)},onSubmit:re})}):q?(0,qY.jsx)(`div`,{\"data-user-message-bubble\":!0,...CPXBubbleProps({}),role:I?`button`:void 0,",
      "61608 user bubble marker attribute anchor",
    );
  }
  if (text.includes("function TFe({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){")) {
    let patched = replaceOnce(
      text,
      "function TFe({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){",
      `${messageComposerHook()}function TFe({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){`,
      "62119 user bubble helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "return(0,Yz.jsx)(`form`,{className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),v()},children:",
      "return(0,Yz.jsx)(`form`,{\"data-codex-plus-user-entry\":!0,className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),v()},children:",
      "62119 edit user message entry marker anchor",
    );
    return replaceOnce(
      patched,
      "de=U?(0,eB.jsx)(`div`,{className:`w-full p-px`,children:(0,eB.jsx)(TFe,{cwd:b??null,hostId:x,initialMessage:H.trim(),onCancel:()=>{re(null)},onDraftChange:e=>{re(e)},onSubmit:Z})}):Y?(0,eB.jsx)(`div`,{\"data-user-message-bubble\":!0,role:z?`button`:void 0,",
      "de=U?(0,eB.jsx)(`div`,{className:`w-full p-px`,children:(0,eB.jsx)(TFe,{cwd:b??null,hostId:x,initialMessage:H.trim(),onCancel:()=>{re(null)},onDraftChange:e=>{re(e)},onSubmit:Z})}):Y?(0,eB.jsx)(`div`,{\"data-user-message-bubble\":!0,...CPXBubbleProps({}),role:z?`button`:void 0,",
      "62119 user bubble marker attribute anchor",
    );
  }
  if (text.includes("function _Qe({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){")) {
    let patched = replaceOnce(
      text,
      "function _Qe({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){",
      `${messageComposerHook()}function _Qe({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){`,
      "71524 user bubble helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "return(0,yB.jsx)(`form`,{className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),v()},children:",
      "return(0,yB.jsx)(`form`,{\"data-codex-plus-user-entry\":!0,className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),v()},children:",
      "71524 edit user message entry marker anchor",
    );
    return replaceOnce(
      patched,
      "me=B?(0,CB.jsx)(`div`,{className:`w-full p-px`,children:(0,CB.jsx)(_Qe,{cwd:b??null,hostId:x,initialMessage:z.trim(),onCancel:()=>{re(null)},onDraftChange:e=>{re(e)},onSubmit:ae})}):ee?(0,CB.jsx)(`div`,{\"data-user-message-bubble\":!0,role:I?`button`:void 0,",
      "me=B?(0,CB.jsx)(`div`,{className:`w-full p-px`,children:(0,CB.jsx)(_Qe,{cwd:b??null,hostId:x,initialMessage:z.trim(),onCancel:()=>{re(null)},onDraftChange:e=>{re(e)},onSubmit:ae})}):ee?(0,CB.jsx)(`div`,{\"data-user-message-bubble\":!0,...CPXBubbleProps({}),role:I?`button`:void 0,",
      "71524 user bubble marker attribute anchor",
    );
  }
  if (text.includes("function DZt({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){")) {
    let patched = replaceOnce(
      text,
      "function DZt({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){",
      `${messageComposerHook()}function DZt({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){`,
      "72221 user bubble helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "return(0,GQ.jsx)(`form`,{className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),v()},children:",
      "return(0,GQ.jsx)(`form`,{\"data-codex-plus-user-entry\":!0,className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),v()},children:",
      "72221 edit user message entry marker anchor",
    );
    return replaceOnce(
      patched,
      "me=V?(0,qQ.jsx)(`div`,{className:`w-full p-px`,children:(0,qQ.jsx)(DZt,{cwd:b??null,hostId:x,initialMessage:B.trim(),onCancel:()=>{ie(null)},onDraftChange:e=>{ie(e)},onSubmit:oe})}):q?(0,qQ.jsx)(`div`,{\"data-user-message-bubble\":!0,role:L?`button`:void 0,",
      "me=V?(0,qQ.jsx)(`div`,{className:`w-full p-px`,children:(0,qQ.jsx)(DZt,{cwd:b??null,hostId:x,initialMessage:B.trim(),onCancel:()=>{ie(null)},onDraftChange:e=>{ie(e)},onSubmit:oe})}):q?(0,qQ.jsx)(`div`,{\"data-user-message-bubble\":!0,...CPXBubbleProps({}),role:L?`button`:void 0,",
      "72221 user bubble marker attribute anchor",
    );
  }
  if (text.includes("function XO({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){")) {
    let patched = replaceOnce(
      text,
      "function XO({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){",
      `${messageComposerHook()}function XO({cwd:e,hostId:t,initialMessage:n,onCancel:r,onDraftChange:i,onSubmit:a}){`,
      "user bubble helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "return(0,QO.jsx)(`form`,{className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),y()},children:",
      "return(0,QO.jsx)(`form`,{\"data-codex-plus-user-entry\":!0,className:`relative flex w-full flex-col rounded-3xl bg-token-foreground/5`,onSubmit:e=>{e.preventDefault(),y()},children:",
      "edit user message entry marker anchor",
    );
    return replaceOnce(
      patched,
      "be=B?(0,ik.jsx)(`div`,{className:`w-full p-px`,children:(0,ik.jsx)(XO,{cwd:b??null,hostId:x,initialMessage:z.trim(),onCancel:()=>{le(null)},onDraftChange:e=>{le(e)},onSubmit:fe})}):re?(0,ik.jsx)(`div`,{\"data-user-message-bubble\":!0,role:I?`button`:void 0,",
      "be=B?(0,ik.jsx)(`div`,{className:`w-full p-px`,children:(0,ik.jsx)(XO,{cwd:b??null,hostId:x,initialMessage:z.trim(),onCancel:()=>{le(null)},onDraftChange:e=>{le(e)},onSubmit:fe})}):re?(0,ik.jsx)(`div`,{\"data-user-message-bubble\":!0,...CPXBubbleProps({}),role:I?`button`:void 0,",
      "user bubble marker attribute anchor",
    );
  }
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

function patchUserMessageAttachmentsProjectColors(text, context = {}) {
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715")) {
    return replaceOnce(
      text,
      "\"data-user-message-bubble\":!0,...CPXBubbleProps({}),role:V?`button`:void 0,",
      "\"data-user-message-bubble\":!0,...CPXBubbleProps({project:globalThis.CodexPlusHost.adapters.context.active()}),role:V?`button`:void 0,",
      "21316 user bubble canonical project context anchor",
    );
  }
  if (text.includes("\"data-user-message-bubble\":!0,...CPXBubbleProps({}),role:B?`button`:void 0,")) {
    return replaceOnce(
      text,
      "\"data-user-message-bubble\":!0,...CPXBubbleProps({}),role:B?`button`:void 0,",
      "\"data-user-message-bubble\":!0,...CPXBubbleProps({project:globalThis.CodexPlusHost.adapters.context.active()}),role:B?`button`:void 0,",
      "91948 user bubble canonical project context anchor",
    );
  }
  if (
    text.includes("function FNt(") &&
    text.includes("\"data-user-message-bubble\":!0,...CPXBubbleProps({}),role:I?`button`:void 0,")
  ) {
    return replaceOnce(text, "\"data-user-message-bubble\":!0,...CPXBubbleProps({}),role:I?`button`:void 0,", "\"data-user-message-bubble\":!0,...CPXBubbleProps({project:{cwd:b,hostId:x}}),role:I?`button`:void 0,", "61608 user bubble project marker attribute anchor");
  }
  if (text.includes("\"data-user-message-bubble\":!0,...CPXBubbleProps({}),role:z?`button`:void 0,")) {
    return replaceOnce(
      text,
      "\"data-user-message-bubble\":!0,...CPXBubbleProps({}),role:z?`button`:void 0,",
      "\"data-user-message-bubble\":!0,...CPXBubbleProps({project:{cwd:b,hostId:x}}),role:z?`button`:void 0,",
      "62119 user bubble project marker attribute anchor",
    );
  }
  if (text.includes("\"data-user-message-bubble\":!0,...CPXBubbleProps({}),role:L?`button`:void 0,tabIndex:0,className:Q(")) {
    return replaceOnce(
      text,
      "\"data-user-message-bubble\":!0,...CPXBubbleProps({}),role:L?`button`:void 0,",
      "\"data-user-message-bubble\":!0,...CPXBubbleProps({project:{cwd:b,hostId:x}}),role:L?`button`:void 0,",
      "72221 user bubble project marker attribute anchor",
    );
  }
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

function patchComposerBubbleColors(text, context = {}) {
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715.72028")) {
    let patched = replaceOnce(text, "function qk(e){let t=(0,Jk.c)(55),", `${messageComposerHook()}function qk(e){let t=(0,Jk.c)(55),`, "72028 composer user bubble helper insertion anchor");
    patched = replaceOnce(patched, "p=(0,Yk.jsx)(`div`,{className:n,onDragEnter:r,", "p=(0,Yk.jsx)(`div`,{...CPXSurfaceProps({}),className:n,onDragEnter:r,", "72028 composer external surface marker anchor");
    patched = replaceOnce(patched, "y=(0,Yk.jsx)(Ag,{className:n,inert:r,", "y=(0,Yk.jsx)(Ag,{...CPXSurfaceProps({}),className:n,inert:r,", "72028 composer home surface marker anchor");
    return replaceOnce(patched, "A=(0,Yk.jsx)(Gy,{...p,className:C,", "A=(0,Yk.jsx)(Gy,{...p,...CPXSurfaceProps({}),className:C,", "72028 composer user entry marker render anchor");
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715.72359")) {
    let patched = replaceOnce(text, "function qk(e){let t=(0,Jk.c)(55),", `${messageComposerHook()}function qk(e){let t=(0,Jk.c)(55),`, "72359 composer user bubble helper insertion anchor");
    patched = replaceOnce(patched, "p=(0,Yk.jsx)(`div`,{className:n,onDragEnter:r,", "p=(0,Yk.jsx)(`div`,{...CPXSurfaceProps({}),className:n,onDragEnter:r,", "72359 composer external surface marker anchor");
    patched = replaceOnce(patched, "y=(0,Yk.jsx)(Ag,{className:n,inert:r,", "y=(0,Yk.jsx)(Ag,{...CPXSurfaceProps({}),className:n,inert:r,", "72359 composer home surface marker anchor");
    return replaceOnce(patched, "A=(0,Yk.jsx)(Gy,{...p,className:C,", "A=(0,Yk.jsx)(Gy,{...p,...CPXSurfaceProps({}),className:C,", "72359 composer user entry marker render anchor");
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715.31925")) {
    let patched = replaceOnce(text, "function qk(e){let t=(0,Jk.c)(55),", `${messageComposerHook()}function qk(e){let t=(0,Jk.c)(55),`, "31925 composer user bubble helper insertion anchor");
    patched = replaceOnce(patched, "p=(0,Yk.jsx)(`div`,{className:n,onDragEnter:r,", "p=(0,Yk.jsx)(`div`,{...CPXSurfaceProps({}),className:n,onDragEnter:r,", "31925 composer external surface marker anchor");
    patched = replaceOnce(patched, "y=(0,Yk.jsx)(Mg,{className:n,inert:r,", "y=(0,Yk.jsx)(Mg,{...CPXSurfaceProps({}),className:n,inert:r,", "31925 composer home surface marker anchor");
    return replaceOnce(patched, "A=(0,Yk.jsx)(Gy,{...p,className:C,", "A=(0,Yk.jsx)(Gy,{...p,...CPXSurfaceProps({}),className:C,", "31925 composer user entry marker render anchor");
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715.31251")) {
    let patched = replaceOnce(text, "function qk(e){let t=(0,Jk.c)(55),", `${messageComposerHook()}function qk(e){let t=(0,Jk.c)(55),`, "31251 composer user bubble helper insertion anchor");
    patched = replaceOnce(patched, "p=(0,Yk.jsx)(`div`,{className:n,onDragEnter:r,", "p=(0,Yk.jsx)(`div`,{...CPXSurfaceProps({}),className:n,onDragEnter:r,", "31251 composer external surface marker anchor");
    patched = replaceOnce(patched, "y=(0,Yk.jsx)(Ag,{className:n,inert:r,", "y=(0,Yk.jsx)(Ag,{...CPXSurfaceProps({}),className:n,inert:r,", "31251 composer home surface marker anchor");
    return replaceOnce(patched, "A=(0,Yk.jsx)(Gy,{...p,className:C,", "A=(0,Yk.jsx)(Gy,{...p,...CPXSurfaceProps({}),className:C,", "31251 composer user entry marker render anchor");
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715.21425")) {
    let patched = replaceOnce(text, "function Kk(e){let t=(0,qk.c)(55),", `${messageComposerHook()}function Kk(e){let t=(0,qk.c)(55),`, "21425 composer user bubble helper insertion anchor");
    patched = replaceOnce(patched, "p=(0,Jk.jsx)(`div`,{className:n,onDragEnter:r,", "p=(0,Jk.jsx)(`div`,{...CPXSurfaceProps({}),className:n,onDragEnter:r,", "21425 composer external surface marker anchor");
    patched = replaceOnce(patched, "y=(0,Jk.jsx)(Ag,{className:n,inert:r,", "y=(0,Jk.jsx)(Ag,{...CPXSurfaceProps({}),className:n,inert:r,", "21425 composer home surface marker anchor");
    return replaceOnce(patched, "A=(0,Jk.jsx)(Uy,{...p,className:C,", "A=(0,Jk.jsx)(Uy,{...p,...CPXSurfaceProps({}),className:C,", "21425 composer user entry marker render anchor");
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715")) {
    let patched = replaceOnce(text, "function Wk(e){let t=(0,Gk.c)(55),", `${messageComposerHook()}function Wk(e){let t=(0,Gk.c)(55),`, "21316 composer user bubble helper insertion anchor");
    patched = replaceOnce(patched, "p=(0,Kk.jsx)(`div`,{className:n,onDragEnter:r,", "p=(0,Kk.jsx)(`div`,{...CPXSurfaceProps({}),className:n,onDragEnter:r,", "21316 composer external surface marker anchor");
    patched = replaceOnce(patched, "y=(0,Kk.jsx)(Fg,{className:n,inert:r,", "y=(0,Kk.jsx)(Fg,{...CPXSurfaceProps({}),className:n,inert:r,", "21316 composer home surface marker anchor");
    return replaceOnce(patched, "A=(0,Kk.jsx)(Oy,{...p,className:C,", "A=(0,Kk.jsx)(Oy,{...p,...CPXSurfaceProps({}),className:C,", "21316 composer user entry marker render anchor");
  }
  if (
    text.includes("function ec(e){if(L?.type!==`local`") &&
    text.includes("(0,tJ.jsx)(Zq,{className:w,utilityBarVariant:C,hasDropTargetPortal:Hc,")
  ) {
    let patched = replaceOnce(
      text,
      "function ec(e){if(L?.type!==`local`",
      `${messageComposerHook()}function ec(e){if(L?.type!==\`local\``,
      "91948 composer user bubble helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "(0,tJ.jsx)(Zq,{className:w,utilityBarVariant:C,hasDropTargetPortal:Hc,",
      "(0,tJ.jsx)(Zq,{...CPXSurfaceProps({}),className:w,utilityBarVariant:C,hasDropTargetPortal:Hc,",
      "91948 composer user entry marker render anchor",
    );
  }
  if (text.includes("function NUe({aboveComposerHeaderContent:e,activeCollaborationMode:t,")) {
    return replaceOnce(text, "function NUe({aboveComposerHeaderContent:e,activeCollaborationMode:t,", `${messageComposerHook()}function NUe({aboveComposerHeaderContent:e,activeCollaborationMode:t,`, "61608 composer helper insertion anchor");
  }
  if (text.includes("function xq({aboveComposerHeaderContent:e,activeCollaborationMode:t,")) {
    return replaceOnce(
      text,
      "function xq({aboveComposerHeaderContent:e,activeCollaborationMode:t,",
      `${messageComposerHook()}function xq({aboveComposerHeaderContent:e,activeCollaborationMode:t,`,
      "62119 composer helper insertion anchor",
    );
  }
  if (text.includes("function l5({aboveComposerHeaderContent:e,activeCollaborationMode:t,")) {
    return replaceOnce(
      text,
      "function l5({aboveComposerHeaderContent:e,activeCollaborationMode:t,",
      `${messageComposerHook()}function l5({aboveComposerHeaderContent:e,activeCollaborationMode:t,`,
      "71524 composer helper insertion anchor",
    );
  }
  if (text.includes("function JY(e){let t=(0,YY.c)(30),")) {
    let patched = replaceOnce(
      text,
      "function JY(e){let t=(0,YY.c)(30),",
      `${messageComposerHook()}function JY(e){let t=(0,YY.c)(30),`,
      "72221 composer surface helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "T=(0,QY.jsxs)(iS,{...f,className:_,inert:v,isDragActive:y,onDragEnter:b,onDragLeave:x,onDragOver:S,onDrop:C,children:[w,r]})",
      "T=(0,QY.jsxs)(iS,{...f,...CPXSurfaceProps({}),className:_,inert:v,isDragActive:y,onDragEnter:b,onDragLeave:x,onDragOver:S,onDrop:C,children:[w,r]})",
      "72221 composer user entry marker render anchor",
    );
  }
  if (text.includes("function mDa(e){let t=(0,s7.c)(18),")) {
    let patched = replaceOnce(
      text,
      "function mDa(e){let t=(0,s7.c)(18),",
      `${messageComposerHook()}function mDa(e){let t=(0,s7.c)(18),`,
      "composer user bubble helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "function mDa(e){let t=(0,s7.c)(18),{children:n,className:r,utilityBarVariant:i,inert:a,isDragActive:o,layout:s,radiusVariant:c,surfaceVariant:l,onDragEnter:u,onDragLeave:d,onDragOver:f,onDrop:p}=e,",
      "function mDa(e){let t=(0,s7.c)(18),{children:n,className:r,utilityBarVariant:i,inert:a,isDragActive:o,layout:s,radiusVariant:c,surfaceVariant:l,onDragEnter:u,onDragLeave:d,onDragOver:f,onDrop:p,codexPlusProps:CPX_surfaceProps}=e,CPX_resolvedSurfaceProps=CPX_surfaceProps??CPXSurfaceProps({}),",
      "composer host surface props anchor",
    );
    return replaceOnce(
      patched,
      "D=(0,c7.jsx)($d.div,{inert:a,className:E,onMouseDown:ODa,onDragEnter:u,onDragOver:f,onDragLeave:d,onDrop:p,children:n})",
      "D=(0,c7.jsx)($d.div,{inert:a,...CPX_resolvedSurfaceProps,className:E,onMouseDown:ODa,onDragEnter:u,onDragOver:f,onDragLeave:d,onDrop:p,children:n})",
      "composer user entry marker render anchor",
    );
  }
  if (text.includes("function WX(e){let t=(0,GX.c)(107),")) {
    let patched = replaceOnce(
      text,
      "function WX(e){let t=(0,GX.c)(107),",
      `${messageComposerHook()}function WX(e){let t=(0,GX.c)(107),`,
      "composer user bubble helper insertion anchor",
    );
    return patched;
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

function patchComposerPrimitiveSurface(text, context) {
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715")) {
    let patched = replaceOnce(
      text,
      "function C(e){let t=(0,L.c)(36),{children:r,className:i,utilityBarVariant:a,inert:o,isDragActive:s,layout:c,radiusVariant:l,surfaceOverflow:u,surfaceVariant:d,onDragEnter:f,onDragLeave:p,onDragOver:h,onDrop:g}=e,",
      `${messageComposerHook("R")}function C(e){let t=(0,L.c)(37),{children:r,className:i,utilityBarVariant:a,inert:o,isDragActive:s,layout:c,radiusVariant:l,surfaceOverflow:u,surfaceVariant:d,onDragEnter:f,onDragLeave:p,onDragOver:h,onDrop:g,codexPlusProps:CPX_surfaceProps}=e,CPX_resolvedSurfaceProps=CPXSurfaceProps({}),`,
      "26.715 native composer primitive surface props anchor",
    );
    patched = replaceOnce(
      patched,
      "t[19]!==T||t[20]!==r||t[21]!==f||t[22]!==p||t[23]!==h||t[24]!==g||t[25]!==k||t[26]!==A?",
      "t[19]!==T||t[20]!==r||t[21]!==f||t[22]!==p||t[23]!==h||t[24]!==g||t[25]!==k||t[26]!==A||t[36]!==CPX_resolvedSurfaceProps?",
      "26.715 native composer primitive surface cache anchor",
    );
    return replaceOnce(
      patched,
      "M=(0,z.jsx)(T,{inert:k,className:A,onMouseDown:I,onDragEnter:f,onDragOver:h,onDragLeave:p,onDrop:g,children:r}),t[19]=T,t[20]=r,t[21]=f,t[22]=p,t[23]=h,t[24]=g,t[25]=k,t[26]=A,t[27]=M",
      "M=(0,z.jsx)(T,{inert:k,...CPX_resolvedSurfaceProps,className:A,onMouseDown:I,onDragEnter:f,onDragOver:h,onDragLeave:p,onDrop:g,children:r}),t[19]=T,t[20]=r,t[21]=f,t[22]=p,t[23]=h,t[24]=g,t[25]=k,t[26]=A,t[27]=M,t[36]=CPX_resolvedSurfaceProps",
      "26.715 native composer primitive surface render anchor",
    );
  }
  if (text.includes("function nu(e){let t=(0,_u.c)(18),{children:n,className:r,utilityBarVariant:i,")) {
    let patched = replaceOnce(
      text,
      "function nu(e){let t=(0,_u.c)(18),{children:n,className:r,utilityBarVariant:i,inert:a,isDragActive:o,layout:s,radiusVariant:l,surfaceVariant:u,onDragEnter:d,onDragLeave:f,onDragOver:p,onDrop:h}=e,",
      `${messageComposerHook()}function nu(e){let t=(0,_u.c)(19),{children:n,className:r,utilityBarVariant:i,inert:a,isDragActive:o,layout:s,radiusVariant:l,surfaceVariant:u,onDragEnter:d,onDragLeave:f,onDragOver:p,onDrop:h,codexPlusProps:CPX_surfaceProps}=e,CPX_resolvedSurfaceProps=CPX_surfaceProps??CPXSurfaceProps({}),`,
      "91948 native composer primitive surface props anchor",
    );
    patched = replaceOnce(
      patched,
      "t[10]!==n||t[11]!==a||t[12]!==d||t[13]!==f||t[14]!==p||t[15]!==h||t[16]!==O?",
      "t[10]!==n||t[11]!==a||t[12]!==d||t[13]!==f||t[14]!==p||t[15]!==h||t[16]!==O||t[18]!==CPX_resolvedSurfaceProps?",
      "91948 native composer primitive surface cache anchor",
    );
    return replaceOnce(
      patched,
      "k=(0,vu.jsx)(c.div,{inert:a,className:O,onMouseDown:gu,onDragEnter:d,onDragOver:p,onDragLeave:f,onDrop:h,children:n}),t[10]=n,t[11]=a,t[12]=d,t[13]=f,t[14]=p,t[15]=h,t[16]=O,t[17]=k",
      "k=(0,vu.jsx)(c.div,{inert:a,...CPX_resolvedSurfaceProps,className:O,onMouseDown:gu,onDragEnter:d,onDragOver:p,onDragLeave:f,onDrop:h,children:n}),t[10]=n,t[11]=a,t[12]=d,t[13]=f,t[14]=p,t[15]=h,t[16]=O,t[17]=k,t[18]=CPX_resolvedSurfaceProps",
      "91948 native composer primitive surface render anchor",
    );
  }
  if (text.includes("function h(e){let t=(0,A.c)(18),{children:n,className:r,utilityBarVariant:i,")) {
    let patched = replaceOnce(
      text,
      "function h(e){let t=(0,A.c)(18),{children:n,className:r,utilityBarVariant:i,inert:o,isDragActive:c,layout:l,radiusVariant:u,surfaceVariant:d,onDragEnter:f,onDragLeave:m,onDragOver:h,onDrop:g}=e,",
      `${messageComposerHook()}function h(e){let t=(0,A.c)(19),{children:n,className:r,utilityBarVariant:i,inert:o,isDragActive:c,layout:l,radiusVariant:u,surfaceVariant:d,onDragEnter:f,onDragLeave:m,onDragOver:h,onDrop:g,codexPlusProps:CPX_surfaceProps}=e,CPX_resolvedSurfaceProps=CPX_surfaceProps??CPXSurfaceProps({}),`,
      "61608 native composer primitive surface props anchor",
    );
    patched = replaceOnce(
      patched,
      "t[10]!==n||t[11]!==o||t[12]!==f||t[13]!==m||t[14]!==h||t[15]!==g||t[16]!==M?",
      "t[10]!==n||t[11]!==o||t[12]!==f||t[13]!==m||t[14]!==h||t[15]!==g||t[16]!==M||t[18]!==CPX_resolvedSurfaceProps?",
      "61608 native composer primitive surface cache anchor",
    );
    return replaceOnce(
      patched,
      "(N=(0,j.jsx)(s.div,{inert:o,className:M,onMouseDown:k,onDragEnter:f,onDragOver:h,onDragLeave:m,onDrop:g,children:n}),t[10]=n,t[11]=o,t[12]=f,t[13]=m,t[14]=h,t[15]=g,t[16]=M,t[17]=N)",
      "(N=(0,j.jsx)(s.div,{inert:o,...CPX_resolvedSurfaceProps,className:M,onMouseDown:k,onDragEnter:f,onDragOver:h,onDragLeave:m,onDrop:g,children:n}),t[10]=n,t[11]=o,t[12]=f,t[13]=m,t[14]=h,t[15]=g,t[16]=M,t[17]=N,t[18]=CPX_resolvedSurfaceProps)",
      "61608 native composer primitive surface render anchor",
    );
  }
  if (text.includes("function Mln(e){let t=(0,x9.c)(18),{children:n,className:r,utilityBarVariant:i,")) {
    let patched = replaceOnce(
      text,
      "function Mln(e){let t=(0,x9.c)(18),{children:n,className:r,utilityBarVariant:i,inert:a,isDragActive:o,layout:s,radiusVariant:c,surfaceVariant:l,onDragEnter:u,onDragLeave:d,onDragOver:f,onDrop:p}=e,",
      `${messageComposerHook()}function Mln(e){let t=(0,x9.c)(19),{children:n,className:r,utilityBarVariant:i,inert:a,isDragActive:o,layout:s,radiusVariant:c,surfaceVariant:l,onDragEnter:u,onDragLeave:d,onDragOver:f,onDrop:p,codexPlusProps:CPX_surfaceProps}=e,CPX_resolvedSurfaceProps=CPX_surfaceProps??CPXSurfaceProps({}),`,
      "62119 native composer primitive surface props anchor",
    );
    patched = replaceOnce(
      patched,
      "t[10]!==n||t[11]!==a||t[12]!==u||t[13]!==d||t[14]!==f||t[15]!==p||t[16]!==E?",
      "t[10]!==n||t[11]!==a||t[12]!==u||t[13]!==d||t[14]!==f||t[15]!==p||t[16]!==E||t[18]!==CPX_resolvedSurfaceProps?",
      "62119 native composer primitive surface cache anchor",
    );
    return replaceOnce(
      patched,
      "(D=(0,S9.jsx)(rp.div,{inert:a,className:E,onMouseDown:Kln,onDragEnter:u,onDragOver:f,onDragLeave:d,onDrop:p,children:n}),t[10]=n,t[11]=a,t[12]=u,t[13]=d,t[14]=f,t[15]=p,t[16]=E,t[17]=D)",
      "(D=(0,S9.jsx)(rp.div,{inert:a,...CPX_resolvedSurfaceProps,className:E,onMouseDown:Kln,onDragEnter:u,onDragOver:f,onDragLeave:d,onDrop:p,children:n}),t[10]=n,t[11]=a,t[12]=u,t[13]=d,t[14]=f,t[15]=p,t[16]=E,t[17]=D,t[18]=CPX_resolvedSurfaceProps)",
      "62119 native composer primitive surface render anchor",
    );
  }
  if (text.includes("function h(e){let t=(0,A.c)(18),{children:n,className:a,utilityBarVariant:o,")) {
    let patched = replaceOnce(
      text,
      "function h(e){let t=(0,A.c)(18),{children:n,className:a,utilityBarVariant:o,inert:s,isDragActive:c,layout:l,radiusVariant:u,surfaceVariant:d,onDragEnter:f,onDragLeave:m,onDragOver:h,onDrop:g}=e,",
      `${messageComposerHook()}function h(e){let t=(0,A.c)(19),{children:n,className:a,utilityBarVariant:o,inert:s,isDragActive:c,layout:l,radiusVariant:u,surfaceVariant:d,onDragEnter:f,onDragLeave:m,onDragOver:h,onDrop:g,codexPlusProps:CPX_surfaceProps}=e,CPX_resolvedSurfaceProps=CPX_surfaceProps??CPXSurfaceProps({}),`,
      "71524 native composer primitive surface props anchor",
    );
    patched = replaceOnce(
      patched,
      "t[10]!==n||t[11]!==s||t[12]!==f||t[13]!==m||t[14]!==h||t[15]!==g||t[16]!==M?",
      "t[10]!==n||t[11]!==s||t[12]!==f||t[13]!==m||t[14]!==h||t[15]!==g||t[16]!==M||t[18]!==CPX_resolvedSurfaceProps?",
      "71524 native composer primitive surface cache anchor",
    );
    return replaceOnce(
      patched,
      "(N=(0,j.jsx)(r.div,{inert:s,className:M,onMouseDown:k,onDragEnter:f,onDragOver:h,onDragLeave:m,onDrop:g,children:n}),t[10]=n,t[11]=s,t[12]=f,t[13]=m,t[14]=h,t[15]=g,t[16]=M,t[17]=N)",
      "(N=(0,j.jsx)(r.div,{inert:s,...CPX_resolvedSurfaceProps,className:M,onMouseDown:k,onDragEnter:f,onDragOver:h,onDragLeave:m,onDrop:g,children:n}),t[10]=n,t[11]=s,t[12]=f,t[13]=m,t[14]=h,t[15]=g,t[16]=M,t[17]=N,t[18]=CPX_resolvedSurfaceProps)",
      "71524 native composer primitive surface render anchor",
    );
  }
  if (text.includes("function h(e){let n=(0,A.c)(18),{children:r,className:a,utilityBarVariant:o,")) {
    let patched = replaceOnce(
      text,
      "function h(e){let n=(0,A.c)(18),{children:r,className:a,utilityBarVariant:o,inert:s,isDragActive:c,layout:l,radiusVariant:u,surfaceVariant:d,onDragEnter:f,onDragLeave:m,onDragOver:h,onDrop:g}=e,",
      `${messageComposerHook()}function h(e){let n=(0,A.c)(19),{children:r,className:a,utilityBarVariant:o,inert:s,isDragActive:c,layout:l,radiusVariant:u,surfaceVariant:d,onDragEnter:f,onDragLeave:m,onDragOver:h,onDrop:g,codexPlusProps:CPX_surfaceProps}=e,CPX_resolvedSurfaceProps=CPX_surfaceProps??CPXSurfaceProps({}),`,
      "72221 native composer primitive surface props anchor",
    );
    patched = replaceOnce(
      patched,
      "n[10]!==r||n[11]!==s||n[12]!==f||n[13]!==m||n[14]!==h||n[15]!==g||n[16]!==M?",
      "n[10]!==r||n[11]!==s||n[12]!==f||n[13]!==m||n[14]!==h||n[15]!==g||n[16]!==M||n[18]!==CPX_resolvedSurfaceProps?",
      "72221 native composer primitive surface cache anchor",
    );
    return replaceOnce(
      patched,
      "(N=(0,j.jsx)(t.div,{inert:s,className:M,onMouseDown:k,onDragEnter:f,onDragOver:h,onDragLeave:m,onDrop:g,children:r}),n[10]=r,n[11]=s,n[12]=f,n[13]=m,n[14]=h,n[15]=g,n[16]=M,n[17]=N)",
      "(N=(0,j.jsx)(t.div,{inert:s,...CPX_resolvedSurfaceProps,className:M,onMouseDown:k,onDragEnter:f,onDragOver:h,onDragLeave:m,onDrop:g,children:r}),n[10]=r,n[11]=s,n[12]=f,n[13]=m,n[14]=h,n[15]=g,n[16]=M,n[17]=N,n[18]=CPX_resolvedSurfaceProps)",
      "72221 native composer primitive surface render anchor",
    );
  }
  if (!text.includes("function b(e){let t=(0,P.c)(18),{children:n,className:r,utilityBarVariant:o,inert:s,isDragActive:c,layout:l,radiusVariant:u,surfaceVariant:d,onDragEnter:f,onDragLeave:p,onDragOver:m,onDrop:h}=e,")) {
    return text;
  }
  let patched = replaceOnce(
    text,
    "function b(e){let t=(0,P.c)(18),{children:n,className:r,utilityBarVariant:o,inert:s,isDragActive:c,layout:l,radiusVariant:u,surfaceVariant:d,onDragEnter:f,onDragLeave:p,onDragOver:m,onDrop:h}=e,",
    `${messageComposerHook()}function b(e){let t=(0,P.c)(18),{children:n,className:r,utilityBarVariant:o,inert:s,isDragActive:c,layout:l,radiusVariant:u,surfaceVariant:d,onDragEnter:f,onDragLeave:p,onDragOver:m,onDrop:h,codexPlusProps:CPX_surfaceProps}=e,CPX_resolvedSurfaceProps=CPX_surfaceProps??CPXSurfaceProps({}),`,
    "41301 native composer primitive surface props anchor",
  );
  return replaceOnce(
    patched,
    "A=(0,F.jsx)(i.div,{inert:s,className:k,onDragEnter:f,onDragOver:m,onDragLeave:p,onDrop:h,children:n}),",
    "A=(0,F.jsx)(i.div,{inert:s,...CPX_resolvedSurfaceProps,className:k,onDragEnter:f,onDragOver:m,onDragLeave:p,onDrop:h,children:n}),",
    "41301 native composer primitive surface render anchor",
  );
}

function patchComposerProjectColors(text, context = {}) {
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715.72028")) {
    let patched = text;
    const surfaceAnchor = "CPXSurfaceProps({})";
    const surfaceReplacement = "CPXSurfaceProps({project:globalThis.CodexPlusHost.adapters.context.active()})";
    const surfaceCount = patched.split(surfaceAnchor).length - 1;
    if (surfaceCount !== 3) throw new Error(`Expected three 72028 composer project surface anchors, found ${surfaceCount}`);
    patched = patched.replaceAll(surfaceAnchor, surfaceReplacement);
    return replaceOnce(
      patched,
      "Qo=(e,t=Ir)=>{let n=e.fsPath||e.path;",
      "CPXSP=globalThis.CodexPlusHost.adapters.threadSidePanel,CPXM=CPXSP.bindMount(()=>({scope:U})),CPXOpenFile=CPXSP.bindOpenFile((e,t={})=>Ll({scope:U,path:e,cwd:t.workspaceRoot??jn,hostConfig:Rr,hostId:t.hostId??Ir,line:t.line,endLine:t.endLine,isPreview:t.isPreview,title:t.title,openInSidePanel:!0})),Qo=(e,t=Ir)=>{let n=e.fsPath||e.path;",
      "72028 composer-native file opener adapter anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715.72359")) {
    let patched = text;
    const surfaceAnchor = "CPXSurfaceProps({})";
    const surfaceReplacement = "CPXSurfaceProps({project:globalThis.CodexPlusHost.adapters.context.active()})";
    const surfaceCount = patched.split(surfaceAnchor).length - 1;
    if (surfaceCount !== 3) throw new Error(`Expected three 72359 composer project surface anchors, found ${surfaceCount}`);
    patched = patched.replaceAll(surfaceAnchor, surfaceReplacement);
    return replaceOnce(
      patched,
      "Qo=(e,t=Ir)=>{let n=e.fsPath||e.path;",
      "CPXSP=globalThis.CodexPlusHost.adapters.threadSidePanel,CPXM=CPXSP.bindMount(()=>({scope:U})),CPXOpenFile=CPXSP.bindOpenFile((e,t={})=>Ll({scope:U,path:e,cwd:t.workspaceRoot??jn,hostConfig:Rr,hostId:t.hostId??Ir,line:t.line,endLine:t.endLine,isPreview:t.isPreview,title:t.title,openInSidePanel:!0})),Qo=(e,t=Ir)=>{let n=e.fsPath||e.path;",
      "72359 composer-native file opener adapter anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715.31925")) {
    let patched = text;
    const surfaceAnchor = "CPXSurfaceProps({})";
    const surfaceReplacement = "CPXSurfaceProps({project:globalThis.CodexPlusHost.adapters.context.active()})";
    const surfaceCount = patched.split(surfaceAnchor).length - 1;
    if (surfaceCount !== 3) throw new Error(`Expected three 31925 composer project surface anchors, found ${surfaceCount}`);
    patched = patched.replaceAll(surfaceAnchor, surfaceReplacement);
    return replaceOnce(
      patched,
      "Zo=(e,t=Ir)=>{let n=e.fsPath||e.path;",
      "CPXSP=globalThis.CodexPlusHost.adapters.threadSidePanel,CPXM=CPXSP.bindMount(()=>({scope:U})),CPXOpenFile=CPXSP.bindOpenFile((e,t={})=>Il({scope:U,path:e,cwd:t.workspaceRoot??jn,hostConfig:Lr,hostId:t.hostId??Ir,line:t.line,endLine:t.endLine,isPreview:t.isPreview,title:t.title,openInSidePanel:!0})),Zo=(e,t=Ir)=>{let n=e.fsPath||e.path;",
      "31925 composer-native file opener adapter anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715.31251")) {
    let patched = text;
    const surfaceAnchor = "CPXSurfaceProps({})";
    const surfaceReplacement = "CPXSurfaceProps({project:globalThis.CodexPlusHost.adapters.context.active()})";
    const surfaceCount = patched.split(surfaceAnchor).length - 1;
    if (surfaceCount !== 3) throw new Error(`Expected three 31251 composer project surface anchors, found ${surfaceCount}`);
    patched = patched.replaceAll(surfaceAnchor, surfaceReplacement);
    return replaceOnce(
      patched,
      "Qo=(e,t=Ir)=>{let n=e.fsPath||e.path;",
      "CPXSP=globalThis.CodexPlusHost.adapters.threadSidePanel,CPXM=CPXSP.bindMount(()=>({scope:U})),CPXOpenFile=CPXSP.bindOpenFile((e,t={})=>Ml({scope:U,path:e,cwd:t.workspaceRoot??jn,hostConfig:Rr,hostId:t.hostId??Ir,line:t.line,endLine:t.endLine,isPreview:t.isPreview,title:t.title,openInSidePanel:!0})),Qo=(e,t=Ir)=>{let n=e.fsPath||e.path;",
      "31251 composer-native file opener adapter anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715.21425")) {
    let patched = text;
    const surfaceAnchor = "CPXSurfaceProps({})";
    const surfaceReplacement = "CPXSurfaceProps({project:globalThis.CodexPlusHost.adapters.context.active()})";
    const surfaceCount = patched.split(surfaceAnchor).length - 1;
    if (surfaceCount !== 3) throw new Error(`Expected three 21425 composer project surface anchors, found ${surfaceCount}`);
    patched = patched.replaceAll(surfaceAnchor, surfaceReplacement);
    return replaceOnce(
      patched,
      "$o=(e,t=Ir)=>{let n=e.fsPath||e.path;",
      "CPXSP=globalThis.CodexPlusHost.adapters.threadSidePanel,CPXM=CPXSP.bindMount(()=>({scope:U})),CPXOpenFile=CPXSP.bindOpenFile((e,t={})=>Ml({scope:U,path:e,cwd:t.workspaceRoot??jn,hostConfig:Rr,hostId:t.hostId??Ir,line:t.line,endLine:t.endLine,isPreview:t.isPreview,title:t.title,openInSidePanel:!0})),$o=(e,t=Ir)=>{let n=e.fsPath||e.path;",
      "21425 composer-native file opener adapter anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715")) {
    let patched = text;
    const surfaceAnchor = "CPXSurfaceProps({})";
    const surfaceReplacement = "CPXSurfaceProps({project:globalThis.CodexPlusHost.adapters.context.active()})";
    const surfaceCount = patched.split(surfaceAnchor).length - 1;
    if (surfaceCount !== 3) throw new Error(`Expected three 21316 composer project surface anchors, found ${surfaceCount}`);
    patched = patched.replaceAll(surfaceAnchor, surfaceReplacement);
    return replaceOnce(
      patched,
      "os=(e,t=Ar)=>{let n=e.fsPath||e.path;",
      "CPXSP=globalThis.CodexPlusHost.adapters.threadSidePanel,CPXM=CPXSP.bindMount(()=>({scope:U})),CPXOpenFile=CPXSP.bindOpenFile((e,t={})=>vs({scope:U,path:e,cwd:t.workspaceRoot??Tn,hostConfig:jr,hostId:t.hostId??Ar,line:t.line,endLine:t.endLine,isPreview:t.isPreview,title:t.title,openInSidePanel:!0})),os=(e,t=Ar)=>{let n=e.fsPath||e.path;",
      "21316 composer-native file opener adapter anchor",
    );
  }
  if (text.includes("(0,tJ.jsx)(Zq,{...CPXSurfaceProps({}),className:w,utilityBarVariant:C,hasDropTargetPortal:Hc,")) {
    let patched = replaceOnce(
      text,
      "(0,tJ.jsx)(Zq,{...CPXSurfaceProps({}),className:w,utilityBarVariant:C,hasDropTargetPortal:Hc,",
      "(0,tJ.jsx)(Zq,{key:CPXSurfaceProps({project:globalThis.CodexPlusHost.adapters.context.active()})?.[`data-codex-plus-project-color`]??``,codexPlusProps:CPXSurfaceProps({project:globalThis.CodexPlusHost.adapters.context.active()}),className:w,utilityBarVariant:C,hasDropTargetPortal:Hc,",
      "91948 composer canonical project context anchor",
    );
    return replaceOnce(
      patched,
      "ds=(e,t=jr)=>{let n=e.fsPath||e.path;if(!n||n.length===0)return;let r=e.startLine;Ep({path:n,line:r,column:r==null?void 0:1,cwd:bn,hostId:t,openFile:Zt.mutate})},ps=e=>",
      "CPXSP=globalThis.CodexPlusHost.adapters.threadSidePanel,CPXM=CPXSP.bindMount(()=>({scope:F})),CPXOpenFile=CPXSP.bindOpenFile((e,t={})=>Ep({scope:F,path:e,cwd:t.workspaceRoot??bn,hostConfig:Mr,hostId:t.hostId??jr,line:t.line,endLine:t.endLine,isPreview:t.isPreview,title:t.title,openFile:Zt.mutate,openInSidePanel:!0})),ds=(e,t=jr)=>{let n=e.fsPath||e.path;if(!n||n.length===0)return;let r=e.startLine;Ep({path:n,line:r,column:r==null?void 0:1,cwd:bn,hostId:t,openFile:Zt.mutate})},ps=e=>",
      "91948 composer-native file opener adapter anchor",
    );
  }
  if (
    text.includes("function NUe({aboveComposerHeaderContent:e,activeCollaborationMode:t,") &&
    text.includes("):(0,E$.jsx)(PUe,{className:C,utilityBarVariant:S,hasDropTargetPortal:_s,")
  ) {
    let patched = replaceOnce(text, "interactionsDisabled:M}){let N=Ke(yp),", "interactionsDisabled:M}){let CPX_composerSurfaceProps=CPXSurfaceProps({project:globalThis.CodexPlusHost.adapters.context.active()}),N=Ke(yp),", "61608 composer canonical project context anchor");
    patched = replaceOnce(
      patched,
      "):(0,E$.jsx)(PUe,{className:C,utilityBarVariant:S,hasDropTargetPortal:_s,",
      "):(0,E$.jsx)(PUe,{key:CPX_composerSurfaceProps?.[`data-codex-plus-project-color`]??``,...CPX_composerSurfaceProps,className:C,utilityBarVariant:S,hasDropTargetPortal:_s,",
      "61608 composer project accent caller anchor",
    );
    return replaceOnce(
      patched,
      "ro=(e,t=lr)=>{let n=e.fsPath||e.path;if(!n||n.length===0)return;let r=e.startLine;ib({path:n,line:r,column:r==null?void 0:1,cwd:an,hostId:t,openFile:It.mutate})},oee=e=>",
      "CPXSP=globalThis.CodexPlusHost.adapters.threadSidePanel,CPXM=CPXSP.bindMount(()=>({scope:N})),CPXOpenFile=CPXSP.bindOpenFile((e,t={})=>ib({scope:N,path:e,cwd:t.workspaceRoot??an,hostConfig:ur,hostId:t.hostId??lr,line:t.line,endLine:t.endLine,isPreview:t.isPreview,title:t.title,openFile:It.mutate,openInSidePanel:!0})),ro=(e,t=lr)=>{let n=e.fsPath||e.path;if(!n||n.length===0)return;let r=e.startLine;ib({path:n,line:r,column:r==null?void 0:1,cwd:an,hostId:t,openFile:It.mutate})},oee=e=>",
      "61608 composer-native file opener adapter anchor",
    );
  }
  if (
    text.includes("function xq({aboveComposerHeaderContent:e,activeCollaborationMode:t,") &&
    text.includes("):(0,Eq.jsx)(Sq,{className:k,utilityBarVariant:D,hasDropTargetPortal:Qc,")
  ) {
    let patched = replaceOnce(
      text,
      "interactionsDisabled:z}){let B=Xn(Bs),",
      "interactionsDisabled:z}){let CPX_composerSurfaceProps=CPXSurfaceProps({project:globalThis.CodexPlusHost.adapters.context.active()}),B=Xn(Bs),",
      "62119 composer canonical project context anchor",
    );
    patched = replaceOnce(
      patched,
      "):(0,Eq.jsx)(Sq,{className:k,utilityBarVariant:D,hasDropTargetPortal:Qc,",
      "):(0,Eq.jsx)(Sq,{key:CPX_composerSurfaceProps?.[`data-codex-plus-project-color`]??``,codexPlusProps:CPX_composerSurfaceProps,className:k,utilityBarVariant:D,hasDropTargetPortal:Qc,",
      "62119 composer project accent caller anchor",
    );
    return replaceOnce(
      patched,
      "xs=(e,t=qr)=>{let n=e.fsPath||e.path;if(!n||n.length===0)return;let r=e.startLine;eg({path:n,line:r,column:r==null?void 0:1,cwd:Nn,hostId:t,openFile:en.mutate})},Ss=e=>",
      "CPXSP=globalThis.CodexPlusHost.adapters.threadSidePanel,CPXM=CPXSP.bindMount(()=>({scope:B})),CPXOpenFile=CPXSP.bindOpenFile((e,t={})=>eg({scope:B,path:e,cwd:t.workspaceRoot??Nn,hostConfig:Jr,hostId:t.hostId??qr,line:t.line,endLine:t.endLine,isPreview:t.isPreview,title:t.title,openFile:en.mutate,openInSidePanel:!0})),xs=(e,t=qr)=>{let n=e.fsPath||e.path;if(!n||n.length===0)return;let r=e.startLine;eg({path:n,line:r,column:r==null?void 0:1,cwd:Nn,hostId:t,openFile:en.mutate})},Ss=e=>",
      "62119 composer-native file opener adapter anchor",
    );
  }
  if (text.includes("clientThreadId:R,interactionsDisabled:B}){let V=ri(No),") && text.includes("):(0,m5.jsx)(u5,{className:E,utilityBarVariant:T,hasDropTargetPortal:zc,")) {
    let patched = replaceOnce(
      text,
      "clientThreadId:R,interactionsDisabled:B}){let V=ri(No),",
      "clientThreadId:R,interactionsDisabled:B}){let CPX_composerSurfaceProps=CPXSurfaceProps({project:globalThis.CodexPlusHost.adapters.context.active()}),V=ri(No),",
      "71524 composer canonical project context anchor",
    );
    patched = replaceOnce(
      patched,
      "):(0,m5.jsx)(u5,{className:E,utilityBarVariant:T,hasDropTargetPortal:zc,",
      "):(0,m5.jsx)(u5,{key:CPX_composerSurfaceProps?.[`data-codex-plus-project-color`]??``,codexPlusProps:CPX_composerSurfaceProps,className:E,utilityBarVariant:T,hasDropTargetPortal:zc,",
      "71524 composer project accent caller anchor",
    );
    return replaceOnce(
      patched,
      "bs=(e,t=Hr)=>{let n=e.fsPath||e.path;if(!n||n.length===0)return;let r=e.startLine;ki({path:n,line:r,column:r==null?void 0:1,cwd:Mn,hostId:t,openFile:un.mutate})},xs=e=>",
      "CPXSP=globalThis.CodexPlusHost.adapters.threadSidePanel,CPXM=CPXSP.bindMount(()=>({scope:V})),CPXOpenFile=CPXSP.bindOpenFile((e,t={})=>ki({scope:V,path:e,cwd:t.workspaceRoot??Mn,hostConfig:Ur,hostId:t.hostId??Hr,line:t.line,endLine:t.endLine,isPreview:t.isPreview,title:t.title,openFile:un.mutate,openInSidePanel:!0})),bs=(e,t=Hr)=>{let n=e.fsPath||e.path;if(!n||n.length===0)return;let r=e.startLine;ki({path:n,line:r,column:r==null?void 0:1,cwd:Mn,hostId:t,openFile:un.mutate})},xs=e=>",
      "71524 composer-native file opener adapter anchor",
    );
  }
  if (text.includes("clientThreadId:j,interactionsDisabled:M}){let N=ia(Db),") && text.includes("):(0,QY.jsx)(JY,{className:w,utilityBarVariant:C,hasDropTargetPortal:kc,")) {
    let patched = replaceOnce(
      text,
      "clientThreadId:j,interactionsDisabled:M}){let N=ia(Db),",
      "clientThreadId:j,interactionsDisabled:M}){let CPX_composerSurfaceProps=CPXSurfaceProps({project:globalThis.CodexPlusHost.adapters.context.active()}),N=ia(Db),",
      "72221 composer canonical project context anchor",
    );
    return replaceOnce(
      patched,
      "):(0,QY.jsx)(JY,{className:w,utilityBarVariant:C,hasDropTargetPortal:kc,",
      "):(0,QY.jsx)(JY,{key:CPX_composerSurfaceProps?.[`data-codex-plus-project-color`]??``,codexPlusProps:CPX_composerSurfaceProps,className:w,utilityBarVariant:C,hasDropTargetPortal:kc,",
      "72221 composer project accent caller anchor",
    );
  }
  if (text.includes("(0,Q9.jsx)(YGa,{className:S,utilityBarVariant:x,hasDropTargetPortal:oee,")) {
    return replaceOnce(
      text,
      "(0,Q9.jsx)(YGa,{className:S,utilityBarVariant:x,hasDropTargetPortal:oee,",
      "(0,Q9.jsx)(YGa,{key:(globalThis.CodexPlusHost.adapters.threadSidePanel.bindMount(()=>({scope:j})),globalThis.CodexPlusHost.adapters.threadSidePanel.bindOpenFile((e,n={})=>_k({scope:j,path:e,cwd:n.workspaceRoot??sn,hostConfig:cr,hostId:n.hostId??sr,line:n.line,endLine:n.endLine,isPreview:n.isPreview,title:n.title,openFile:zt.mutate,openInSidePanel:!0})),CPXSurfaceProps({project:{cwd:nn,hostId:sr}})?.[`data-codex-plus-project-color`]??``),codexPlusProps:CPXSurfaceProps({project:{cwd:nn,hostId:sr}}),className:S,utilityBarVariant:x,hasDropTargetPortal:oee,",
      "composer project accent style caller anchor",
    );
  }
  if (text.includes("function ZBe({aboveComposerHeaderContent:e,activeCollaborationMode:t,") && text.includes("bo=(e,t=xr)=>{let n=e.fsPath||e.path;if(!n||n.length===0)return;let r=e.startLine;bc({path:n,line:r,column:r==null?void 0:1,cwd:vn,hostId:t,openFile:Zt.mutate})},xo=e=>")) {
    return replaceOnce(
      text,
      "bo=(e,t=xr)=>{let n=e.fsPath||e.path;if(!n||n.length===0)return;let r=e.startLine;bc({path:n,line:r,column:r==null?void 0:1,cwd:vn,hostId:t,openFile:Zt.mutate})},xo=e=>",
      "CPXSP=globalThis.CodexPlusHost.adapters.threadSidePanel,CPXM=CPXSP.bindMount(()=>({scope:N})),CPXOpenFile=CPXSP.bindOpenFile((e,t={})=>bc({scope:N,path:e,cwd:t.workspaceRoot??vn,hostConfig:Sr,hostId:t.hostId??xr,openFile:Zt.mutate,openInSidePanel:!0})),bo=(e,t=xr)=>{let n=e.fsPath||e.path;if(!n||n.length===0)return;let r=e.startLine;bc({path:n,line:r,column:r==null?void 0:1,cwd:vn,hostId:t,openFile:Zt.mutate})},xo=e=>",
      "41301 composer-native file opener adapter anchor",
    );
  }
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
  if (/^[RI]l=\(0,Q\.jsx\)\(_n,/.test(anchors.composerProjectStyleCaller)) {
    let patched = replaceOnce(
      text,
      anchors.composerProjectStyleCaller,
      anchors.composerProjectStyleCaller.replace(";return", ",CPX_composerSurfaceProps=CPXSurfaceProps({project:globalThis.CodexPlusHost.adapters.context.active()});return"),
      "616 composer canonical project context anchor",
    );
    return replaceOnce(
      patched,
      anchors.composerProjectAccentCaller,
      anchors.composerProjectAccentCaller.replace(",onDragEnter:", ",key:CPX_composerSurfaceProps?.[`data-codex-plus-project-color`]??``,codexPlusProps:CPX_composerSurfaceProps,onDragEnter:"),
      "616 composer project accent anchor",
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
    "{id:`toggleSidebar`,titleIntlId:`codex.command.toggleSidebar`,descriptionIntlId:`codex.commandDescription.toggleSidebar`,commandMenuGroupKey:`panels`,commandMenu:!0,electron:{menuTitle:`Toggle Sidebar`,menuTitleIntlId:`codex.commandMenuTitle.toggleSidebar`,defaultKeybindings:[{key:`CmdOrCtrl+B`}]}},{id:`codexPlus.focusProjectSelector`,title:`Focus project selector`,description:`Focus or open the new chat project selector`,commandMenuGroupKey:`workspace`,commandMenu:!0,electron:{menuTitle:`Focus project selector`,defaultKeybindings:[{key:`CmdOrCtrl+.`}]}},{id:`codexPlusToggleSidebarNameBlur`,title:`Toggle sidebar blur`,description:`Blur or show sidebar chat and project names`,commandMenuGroupKey:`panels`,commandMenu:!0,electron:{menuTitle:`Toggle sidebar blur`,defaultKeybindings:[]}},{id:`toggleBottomPanel`,",
    "sidebar blur command palette metadata anchor",
  );
}

function patchKeyboardShortcutsSearchInput(text, context = {}) {
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715")) return text;
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

function patchCommandMenuRuntimeCommands(text, context = {}) {
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715.72028")) {
    let patched = replaceOnce(
      text,
      "function b4(e){let t=(0,R4.c)(13),",
      "function CPXCommandPaletteItem({command:e,close:t}){let n=e.title??e.id,r=e.description??``;return(0,B4.jsx)(_O,{value:n,keywords:[r,e.id],title:n,onSelect:()=>{globalThis.CodexPlusHost.adapters.commands.dispatch(e.id),t()}},e.id)}function b4(e){let t=(0,R4.c)(13),",
      "72028 command palette plugin item anchor",
    );
    patched = replaceOnce(
      patched,
      "},V=[],H=N.filter",
      "},V=globalThis.CodexPlusHost.adapters.commands.metadata().map(t=>(0,B4.jsx)(CPXCommandPaletteItem,{command:t,close:e},t.id)),H=N.filter",
      "72028 command palette plugin item mount anchor",
    );
    return replaceOnce(
      patched,
      "c=()=>{gh(r.id,`command_menu`),r.id!==`searchChats`&&n()},t[2]=n,t[3]=r.id,t[4]=c):c=t[4];",
      "c=()=>{let e=globalThis.CodexPlusHost.adapters.commands;e.bindNativeDispatch(e=>(gh(e,`command_menu`),!0)),e.dispatch(r.id),r.id!==`searchChats`&&n()},t[2]=n,t[3]=r.id,t[4]=c):c=t[4];",
      "72028 command menu stable dispatch anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715.72359")) {
    let patched = replaceOnce(
      text,
      "function b4({close:e,inputRef:t,rootChatSearchIntent:n,search:r,setSearch:i}){",
      "function CPXCommandPaletteItem({command:e,close:t}){let n=e.title??e.id,r=e.description??``;return(0,V4.jsx)(vO,{value:n,keywords:[r,e.id],title:n,onSelect:()=>{globalThis.CodexPlusHost.adapters.commands.dispatch(e.id),t()}},e.id)}function b4({close:e,inputRef:t,rootChatSearchIntent:n,search:r,setSearch:i}){",
      "72359 command palette plugin item anchor",
    );
    patched = replaceOnce(
      patched,
      "},V=[],H=N.filter",
      "},V=globalThis.CodexPlusHost.adapters.commands.metadata().map(t=>(0,V4.jsx)(CPXCommandPaletteItem,{command:t,close:e},t.id)),H=N.filter",
      "72359 command palette plugin item mount anchor",
    );
    return replaceOnce(
      patched,
      "c=()=>{hh(r.id,`command_menu`),r.id!==`searchChats`&&n()},t[2]=n,t[3]=r.id,t[4]=c):c=t[4];",
      "c=()=>{let e=globalThis.CodexPlusHost.adapters.commands;e.bindNativeDispatch(e=>(hh(e,`command_menu`),!0)),e.dispatch(r.id),r.id!==`searchChats`&&n()},t[2]=n,t[3]=r.id,t[4]=c):c=t[4];",
      "72359 command menu stable dispatch anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715.31925")) {
    let patched = replaceOnce(
      text,
      "function b4({close:e,inputRef:t,rootChatSearchIntent:n,search:r,setSearch:i}){",
      "function CPXCommandPaletteItem({command:e,close:t}){let n=e.title??e.id,r=e.description??``;return(0,V4.jsx)(vO,{value:n,keywords:[r,e.id],title:n,onSelect:()=>{globalThis.CodexPlusHost.adapters.commands.dispatch(e.id),t()}},e.id)}function b4({close:e,inputRef:t,rootChatSearchIntent:n,search:r,setSearch:i}){",
      "31925 command palette plugin item anchor",
    );
    patched = replaceOnce(
      patched,
      "G=[];if(W&&!ie)",
      "G=[];if(!ie)V.push(...globalThis.CodexPlusHost.adapters.commands.metadata().map(t=>(0,V4.jsx)(CPXCommandPaletteItem,{command:t,close:e},t.id)));if(W&&!ie)",
      "31925 command palette plugin item mount anchor",
    );
    return replaceOnce(
      patched,
      "c=()=>{mh(r.id,`command_menu`),r.id!==`searchChats`&&n()},t[2]=n,t[3]=r.id,t[4]=c):c=t[4];",
      "c=()=>{let e=globalThis.CodexPlusHost.adapters.commands;e.bindNativeDispatch(e=>(mh(e,`command_menu`),!0)),e.dispatch(r.id),r.id!==`searchChats`&&n()},t[2]=n,t[3]=r.id,t[4]=c):c=t[4];",
      "31925 command menu stable dispatch anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715.31251")) {
    let patched = replaceOnce(
      text,
      "function o4(e){let t=(0,z4.c)(134),",
      "function CPXCommandPaletteItem({command:e,close:t}){let n=e.title??e.id,r=e.description??``;return(0,V4.jsx)(nO,{value:n,keywords:[r,e.id],title:n,onSelect:()=>{globalThis.CodexPlusHost.adapters.commands.dispatch(e.id),t()}},e.id)}function o4(e){let t=(0,z4.c)(134),",
      "31251 command palette plugin item anchor",
    );
    patched = replaceOnce(
      patched,
      "!i&&c!=null&&oe.push(c),t[30]=U,",
      "oe.push(...globalThis.CodexPlusHost.adapters.commands.metadata().map(e=>(0,V4.jsx)(CPXCommandPaletteItem,{command:e,close:n},e.id))),!i&&c!=null&&oe.push(c),t[30]=U,",
      "31251 command palette plugin item mount anchor",
    );
    return replaceOnce(
      patched,
      "c=()=>{ph(r.id,`command_menu`),r.id!==`searchChats`&&n()},t[2]=n,t[3]=r.id,t[4]=c):c=t[4];",
      "c=()=>{let e=globalThis.CodexPlusHost.adapters.commands;e.bindNativeDispatch(e=>(ph(e,`command_menu`),!0)),e.dispatch(r.id),r.id!==`searchChats`&&n()},t[2]=n,t[3]=r.id,t[4]=c):c=t[4];",
      "31251 command menu stable dispatch anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715.21425")) {
    let patched = replaceOnce(
      text,
      "function o4(e){let t=(0,z4.c)(134),",
      "function CPXCommandPaletteItem({command:e,close:t}){let n=e.title??e.id,r=e.description??``;return(0,V4.jsx)(aO,{value:n,keywords:[r,e.id],title:n,onSelect:()=>{globalThis.CodexPlusHost.adapters.commands.dispatch(e.id),t()}},e.id)}function o4(e){let t=(0,z4.c)(134),",
      "21425 command palette plugin item anchor",
    );
    patched = replaceOnce(
      patched,
      "!i&&c!=null&&oe.push(c),t[30]=U,",
      "oe.push(...globalThis.CodexPlusHost.adapters.commands.metadata().map(e=>(0,V4.jsx)(CPXCommandPaletteItem,{command:e,close:n},e.id))),!i&&c!=null&&oe.push(c),t[30]=U,",
      "21425 command palette plugin item mount anchor",
    );
    return replaceOnce(
      patched,
      "c=()=>{hh(r.id,`command_menu`),r.id!==`searchChats`&&n()},t[2]=n,t[3]=r.id,t[4]=c):c=t[4];",
      "c=()=>{let e=globalThis.CodexPlusHost.adapters.commands;e.bindNativeDispatch(e=>(hh(e,`command_menu`),!0)),e.dispatch(r.id),r.id!==`searchChats`&&n()},t[2]=n,t[3]=r.id,t[4]=c):c=t[4];",
      "21425 command menu stable dispatch anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715")) {
    let patched = replaceOnce(
      text,
      "function o4(e){let t=(0,z4.c)(134),",
      "function CPXCommandPaletteItem({command:e,close:t}){let n=e.title??e.id,r=e.description??``;return(0,V4.jsx)(eO,{value:n,keywords:[r,e.id],title:n,onSelect:()=>{globalThis.CodexPlusHost.adapters.commands.dispatch(e.id),t()}},e.id)}function o4(e){let t=(0,z4.c)(134),",
      "21316 command palette plugin item anchor",
    );
    patched = replaceOnce(
      patched,
      "!i&&c!=null&&oe.push(c),t[30]=U,",
      "G||oe.push(...globalThis.CodexPlusHost.adapters.commands.metadata().map(e=>(0,V4.jsx)(CPXCommandPaletteItem,{command:e,close:n},e.id))),!i&&c!=null&&oe.push(c),t[30]=U,",
      "21316 command palette plugin item mount anchor",
    );
    return replaceOnce(
      patched,
      "c=()=>{Hs(r.id,`command_menu`),r.id!==`searchChats`&&n()},t[2]=n,t[3]=r.id,t[4]=c):c=t[4];",
      "c=()=>{let e=globalThis.CodexPlusHost.adapters.commands;e.bindNativeDispatch(e=>(Hs(e,`command_menu`),!0)),e.dispatch(r.id),r.id!==`searchChats`&&n()},t[2]=n,t[3]=r.id,t[4]=c):c=t[4];",
      "21316 command menu stable dispatch anchor",
    );
  }
  if (text.includes("function CPXCommandPaletteItem") && text.includes("bindNativeDispatch")) return text;
  if (
    text.includes("function yle(e){let t=(0,u4.c)(126),") &&
    text.includes("let f=ie?F.filter(wle):F,p;")
  ) {
    let patched = replaceOnce(
      text,
      "function yle(e){let t=(0,u4.c)(126),",
      "function CPXCommandPaletteItem({command:e,close:t}){let n=e.title??e.id,r=e.description??``;return(0,f4.jsx)(RA,{value:n,keywords:[r,e.id],title:n,onSelect:()=>{globalThis.CodexPlusHost.adapters.commands.dispatch(e.id),t()}},e.id)}function yle(e){let t=(0,u4.c)(126),",
      "91948 command palette plugin item anchor",
    );
    patched = replaceOnce(
      patched,
      "!i&&c!=null&&G.push(c),t[29]=L,",
      "W||G.push(...globalThis.CodexPlusHost.adapters.commands.metadata().map(e=>(0,f4.jsx)(CPXCommandPaletteItem,{command:e,close:n},e.id))),!i&&c!=null&&G.push(c),t[29]=L,",
      "91948 command palette plugin item mount anchor",
    );
    return replaceOnce(
      patched,
      "c=()=>{Vv(r.id,`command_menu`),n()},t[2]=n,t[3]=r.id,t[4]=c):c=t[4];",
      "c=()=>{let e=globalThis.CodexPlusHost.adapters.commands;e.bindNativeDispatch(e=>(Vv(e,`command_menu`),!0)),e.dispatch(r.id),n()},t[2]=n,t[3]=r.id,t[4]=c):c=t[4];",
      "91948 command menu stable dispatch anchor",
    );
  }
  if (text.includes("function aJe(e){let t=(0,a8.c)(126),") && text.includes("let f=ne?P.filter(uJe):P,p;")) {
    let patched = replaceOnce(
      text,
      "function aJe(e){let t=(0,a8.c)(126),",
      "function CPXCommandPaletteItem({command:e,close:t}){let n=e.title??e.id,r=e.description??``;return(0,s8.jsx)(pD,{value:n,keywords:[r,e.id],title:n,onSelect:()=>{globalThis.CodexPlusHost.adapters.commands.dispatch(e.id),t()}},e.id)}function aJe(e){let t=(0,a8.c)(126),",
      "61608 command palette plugin item anchor",
    );
    patched = replaceOnce(
      patched,
      "!i&&c!=null&&K.push(c),t[29]=I,",
      "K.push(...globalThis.CodexPlusHost.adapters.commands.metadata().map(e=>(0,s8.jsx)(CPXCommandPaletteItem,{command:e,close:n},e.id))),!i&&c!=null&&K.push(c),t[29]=I,",
      "61608 command palette plugin item mount anchor",
    );
    if (patched.includes("e.bindNativeDispatch(e=>(xf(e,`command_menu`),!0)),e.dispatch(r.id)")) return patched;
    return replaceOnce(patched, "c=()=>{xf(r.id,`command_menu`),n()},", "c=()=>{let e=globalThis.CodexPlusHost.adapters.commands;e.bindNativeDispatch(e=>(xf(e,`command_menu`),!0)),e.dispatch(r.id),n()},", "61608 command menu stable dispatch anchor");
  }
  if (text.includes("function Ppe(e){let t=(0,V0.c)(126),") && text.includes("let f=se?P.filter(zpe):P,p;")) {
    let patched = replaceOnce(
      text,
      "function Ppe(e){let t=(0,V0.c)(126),",
      "function CPXCommandPaletteItem({command:e,close:t}){let n=e.title??e.id,r=e.description??``;return(0,U0.jsx)(Ba,{value:n,keywords:[r,e.id],title:n,onSelect:()=>{globalThis.CodexPlusHost.adapters.commands.dispatch(e.id),t()}},e.id)}function Ppe(e){let t=(0,V0.c)(126),",
      "62119 command palette plugin item anchor",
    );
    patched = replaceOnce(
      patched,
      "!i&&c!=null&&oe.push(c),t[29]=I,",
      "oe.push(...globalThis.CodexPlusHost.adapters.commands.metadata().map(e=>(0,U0.jsx)(CPXCommandPaletteItem,{command:e,close:n},e.id))),!i&&c!=null&&oe.push(c),t[29]=I,",
      "62119 command palette plugin item mount anchor",
    );
    return replaceOnce(
      patched,
      "c=()=>{Bf(r.id,`command_menu`),n()},",
      "c=()=>{let e=globalThis.CodexPlusHost.adapters.commands;e.bindNativeDispatch(e=>(Bf(e,`command_menu`),!0)),e.dispatch(r.id),n()},",
      "62119 command menu stable dispatch anchor",
    );
  }
  if (text.includes("function Vhe(e){let t=(0,O4.c)(126),") || text.includes("function ube(e){let t=(0,b2.c)(126),")) {
    return patchAppCommandPaletteRuntimeCommands(text, context);
  }
  if (text.includes("function TRe(e){let t=(0,M5.c)(126),") && text.includes("t[16]=O,t[17]=P):P=t[17];let F=P,I;")) {
    let patched = replaceOnce(
      text,
      "function TRe(e){let t=(0,M5.c)(126),",
      "function CPXCommandPaletteItem({command:e,close:t}){let n=e.title??e.id,r=e.description??``;return(0,P5.jsx)(hE,{value:n,keywords:[r,e.id],title:n,onSelect:()=>{globalThis.CodexPlusHost.adapters.commands.dispatch(e.id),t()}},e.id)}function TRe(e){let t=(0,M5.c)(126),",
      "72221 command palette plugin item anchor",
    );
    patched = replaceOnce(
      patched,
      "!i&&c!=null&&K.push(c),t[29]=L,",
      "U||K.push(...globalThis.CodexPlusHost.adapters.commands.metadata().map(e=>(0,P5.jsx)(CPXCommandPaletteItem,{command:e,close:n},e.id))),!i&&c!=null&&K.push(c),t[29]=L,",
      "72221 command palette plugin item mount anchor",
    );
    return replaceOnce(
      patched,
      "c=()=>{IC(r.id,`command_menu`),n()},t[2]=n,t[3]=r.id,t[4]=c):c=t[4];",
      "c=()=>{let e=globalThis.CodexPlusHost.adapters.commands;e.bindNativeDispatch(e=>(IC(e,`command_menu`),!0)),e.dispatch(r.id),n()},t[2]=n,t[3]=r.id,t[4]=c):c=t[4];",
      "72221 command menu stable dispatch anchor",
    );
  }
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
      "let m=[...(se?P.filter(tY):P),...(globalThis.CodexPlusHost.adapters.commands.metadata().filter(e=>!P.some(t=>t.id===e.id)))],_;",
      "command menu runtime command metadata anchor",
    );
  }
  if (text.includes("let m=ne?N.filter(VZ):N,_;")) {
    return replaceOnce(
      text,
      "let m=ne?N.filter(VZ):N,_;",
      "let m=[...(ne?N.filter(VZ):N),...(globalThis.CodexPlusHost.adapters.commands.metadata().filter(e=>!N.some(t=>t.id===e.id)))],_;",
      "command menu runtime command metadata anchor",
    );
  }
  if (text.includes("de=F.filter(P);")) {
    return replaceOnce(
      text,
      "de=F.filter(P);",
      "de=[...F.filter(P),...(globalThis.CodexPlusHost.adapters.commands.metadata().filter(e=>!F.some(t=>t.id===e.id)))];",
      "command menu runtime command metadata anchor",
    );
  }
  return replaceOnce(
    text,
    "let M=j,N;t[11]===o?N=t[12]:",
    "let M=[...j,...(globalThis.CodexPlusHost.adapters.commands.metadata().filter(e=>!j.some(t=>t.id===e.id)))],N;t[11]===o?N=t[12]:",
    "command menu runtime command metadata anchor",
  );
}

function patchAppCommandPaletteRuntimeCommands(text, context = {}) {
  let patched = text;
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715")) {
    return patched;
  }
  if (patched.includes("function ube(e){let t=(0,b2.c)(126),") && !patched.includes("function CPXCommandPaletteItem")) {
    patched = replaceOnce(
      patched,
      "function ube(e){let t=(0,b2.c)(126),",
      "function CPXCommandPaletteItem({command:e,close:t}){let n=e.title??e.id,r=e.description??``;return(0,S2.jsx)(rO,{value:n,keywords:[r,e.id],title:n,onSelect:()=>{globalThis.CodexPlusHost.adapters.commands.dispatch(e.id),t()}},e.id)}function ube(e){let t=(0,b2.c)(126),",
      "71524 app command palette runtime item helper anchor",
    );
    patched = replaceOnce(
      patched,
      "!i&&c!=null&&re.push(c),t[29]=I,",
      "re.push(...globalThis.CodexPlusHost.adapters.commands.metadata().map(e=>(0,S2.jsx)(CPXCommandPaletteItem,{command:e,close:n},e.id))),!i&&c!=null&&re.push(c),t[29]=I,",
      "71524 app command palette runtime item mount anchor",
    );
  }
  if (patched.includes("function Vhe(e){let t=(0,O4.c)(126),") && !patched.includes("function CPXCommandPaletteItem")) {
    patched = replaceOnce(
      patched,
      "function Vhe(e){let t=(0,O4.c)(126),",
      "function CPXCommandPaletteItem({command:e,close:t}){let n=e.title??e.id,r=e.description??``;return(0,A4.jsx)(Pl,{value:n,keywords:[r,e.id],title:n,onSelect:()=>{globalThis.CodexPlusHost.adapters.commands.dispatch(e.id),t()}},e.id)}function Vhe(e){let t=(0,O4.c)(126),",
      "app command palette runtime item helper anchor",
    );
    patched = replaceOnce(
      patched,
      "!i&&c!=null&&ne.push(c),t[29]=I,",
      "ne.push(...(globalThis.CodexPlusHost.adapters.commands.metadata().map(e=>(0,A4.jsx)(CPXCommandPaletteItem,{command:e,close:n},e.id)))),!i&&c!=null&&ne.push(c),t[29]=I,",
      "app command palette runtime item mount anchor",
    );
  }
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
      "N=[...vC.filter(e=>!mge(e)||(e.id===`openBrowserTab`||e.id===`toggleBrowserPanel`)&&!C||e.id===`openControlWindow`&&!w||e.id===`installPrimaryRuntime`&&(!T||!O)||!Fp(e.id)&&$t(f,e.id)===0?!1:sGe(e)),...(globalThis.CodexPlusHost.adapters.commands.metadata().filter(e=>!vC.some(t=>t.id===e.id)))],",
      "app command palette runtime command metadata anchor",
    );
  }
  if (patched.includes("c=()=>{xf(r.id,`command_menu`),n()},") &&
    !patched.includes("CodexPlus?.commands?.run?.(r.id)")) {
    patched = replaceOnce(
      patched,
      "c=()=>{xf(r.id,`command_menu`),n()},",
      "c=()=>{let e=globalThis.CodexPlusHost.adapters.commands;e.bindNativeDispatch(e=>(xf(e,`command_menu`),!0)),e.dispatch(r.id),n()},",
      "app command palette runtime command dispatch anchor",
    );
  }
  if (patched.includes("c=()=>{cx(r.id,`command_menu`),n()},") && !patched.includes("CodexPlus?.commands?.run?.(r.id)===!0||cx")) {
    patched = replaceOnce(
      patched,
      "c=()=>{cx(r.id,`command_menu`),n()},",
      "c=()=>{let e=globalThis.CodexPlusHost.adapters.commands;e.bindNativeDispatch(e=>(cx(e,`command_menu`),!0)),e.dispatch(r.id),n()},",
      "app command palette runtime command dispatch anchor",
    );
  }
  if (patched.includes("c=()=>{au(r.id,`command_menu`),n()},")) {
    patched = replaceOnce(
      patched,
      "c=()=>{au(r.id,`command_menu`),n()},",
      "c=()=>{let e=globalThis.CodexPlusHost.adapters.commands;e.bindNativeDispatch(e=>(au(e,`command_menu`),!0)),e.dispatch(r.id),n()},",
      "71524 app command palette runtime command dispatch anchor",
    );
  }
  return patched;
}

function patchLocalTaskRow(text, context = {}) {
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715.21425")) {
    let patched = replaceOnce(text, "function Kd(e){let t=(0,Qd.c)(125),", `${projectColorHook()}function Kd(e){let t=(0,Qd.c)(125),`, "21425 local task row project color helper insertion anchor");
    patched = replaceOnce(patched, "j=De.sidebarProjectRow({collapsed:a,label:_,projectId:x})", "j={...De.sidebarProjectRow({collapsed:a,label:_,projectId:x}),...CPXPR({projectId:x,label:_})}", "21425 native project row attributes anchor");
    patched = replaceOnce(patched, "Ye=lu,Ze=s?Ee:void 0,Qe=c(", "Ye=lu,Ze={...(s?Ee:void 0),...CPXPR({projectId:N,label:z,path:M,cwd:M,hostId:i.hostId,projectKind:i.projectKind})},Qe=c(", "21425 native project identity anchor");
    patched = replaceOnce(
      patched,
      "dataAttributes:De.sidebarThreadRow({active:u,hostId:t.hostId,id:n,kind:`local`,pinned:a,title:t.label})",
      "dataAttributes:{...De.sidebarThreadRow({active:u,hostId:t.hostId,id:n,kind:`local`,pinned:a,title:t.label}),...CPXPR({projectId:t.projectId,label:t.label,path:t.worktreeGitRoot??t.worktreeWorkspaceRoot,cwd:t.worktreeGitRoot??t.worktreeWorkspaceRoot,hostId:t.hostId,threadId:n,title:t.label,projectKind:t.projectId||t.worktreeGitRoot||t.worktreeWorkspaceRoot?void 0:`chat`,projectless:!(t.projectId||t.worktreeGitRoot||t.worktreeWorkspaceRoot)})}",
      "21425 pending local task row project color attributes anchor",
    );
    patched = replaceOnce(patched, "dataAttributes:De.sidebarThreadRow({active:u,hostId:null,id:t,kind:`remote`,pinned:a,title:e.task.title??``})", "dataAttributes:{...De.sidebarThreadRow({active:u,hostId:null,id:t,kind:`remote`,pinned:a,title:e.task.title??``}),...CPXPR({hostId:null,threadId:t,title:e.task.title??``})}", "21425 remote task row project color attributes anchor");
    return replaceOnce(
      patched,
      "dataAttributes:De.sidebarThreadRow({active:u,hostId:f,id:r,kind:`local`,pinned:a,title:x})",
      "dataAttributes:{...De.sidebarThreadRow({active:u,hostId:f,id:r,kind:`local`,pinned:a,title:x}),...CPXPR({projectId:_e,label:ge,path:k,cwd:k,hostId:f,threadId:r,title:x,projectKind:_e||k?void 0:`chat`,projectless:h})}",
      "21425 local task row project color attributes anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715")) {
    let patched = replaceOnce(text, "function Kd(e){let t=(0,Qd.c)(125),", `${projectColorHook()}function Kd(e){let t=(0,Qd.c)(125),`, "21316 local task row project color helper insertion anchor");
    patched = replaceOnce(patched, "j=Te.sidebarProjectRow({collapsed:a,label:_,projectId:x})", "j={...Te.sidebarProjectRow({collapsed:a,label:_,projectId:x}),...CPXPR({projectId:x,label:_})}", "21316 native project row attributes anchor");
    patched = replaceOnce(patched, "Ye=lu,Xe=s?Te:void 0,Ze=c(", "Ye=lu,Xe={...(s?Te:void 0),...CPXPR({projectId:N,label:z,path:M,cwd:M,hostId:i.hostId,projectKind:i.projectKind})},Ze=c(", "21316 native project identity anchor");
    patched = replaceOnce(
      patched,
      "dataAttributes:Te.sidebarThreadRow({active:u,hostId:t.hostId,id:n,kind:`local`,pinned:a,title:t.label})",
      "dataAttributes:{...Te.sidebarThreadRow({active:u,hostId:t.hostId,id:n,kind:`local`,pinned:a,title:t.label}),...CPXPR({projectId:t.projectId,label:t.label,path:t.worktreeGitRoot??t.worktreeWorkspaceRoot,cwd:t.worktreeGitRoot??t.worktreeWorkspaceRoot,hostId:t.hostId,threadId:n,title:t.label,projectKind:t.projectId||t.worktreeGitRoot||t.worktreeWorkspaceRoot?void 0:`chat`,projectless:!(t.projectId||t.worktreeGitRoot||t.worktreeWorkspaceRoot)})}",
      "21316 pending local task row project color attributes anchor",
    );
    patched = replaceOnce(patched, "dataAttributes:Te.sidebarThreadRow({active:u,hostId:null,id:t,kind:`remote`,pinned:a,title:e.task.title??``})", "dataAttributes:{...Te.sidebarThreadRow({active:u,hostId:null,id:t,kind:`remote`,pinned:a,title:e.task.title??``}),...CPXPR({hostId:null,threadId:t,title:e.task.title??``})}", "21316 remote task row project color attributes anchor");
    return replaceOnce(
      patched,
      "dataAttributes:Te.sidebarThreadRow({active:u,hostId:f,id:r,kind:`local`,pinned:a,title:x})",
      "dataAttributes:{...Te.sidebarThreadRow({active:u,hostId:f,id:r,kind:`local`,pinned:a,title:x}),...CPXPR({projectId:_e,label:ge,path:k,cwd:k,hostId:f,threadId:r,title:x,projectKind:_e||k?void 0:`chat`,projectless:h})}",
      "21316 local task row project color attributes anchor",
    );
  }
  if (text.includes("function Czt(e){let t=(0,Tzt.c)(142),") && text.includes("isProjectlessHoverCard:Y")) {
    let patched = replaceOnce(
      text,
      "function Czt(e){let t=(0,Tzt.c)(142),",
      `${projectColorHook()}function Czt(e){let t=(0,Tzt.c)(142),`,
      "91948 canonical local task row helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "let Ze=g(m5,Ye),Qe=g(Ate,n),$e=g(Qa,n)??Pe?.source,et=g(mre,n)??Pe?.title??null;g(wr,n)??Pe?.threadSource;let tt=fe?N:void 0,nt;",
      "let Ze=g(m5,Ye),Qe=g(Ate,n),$e=g(Qa,n)??Pe?.source,et=g(mre,n)??Pe?.title??null;g(wr,n)??Pe?.threadSource;let CPXRowData=CPXS.mergeThreadRowAttributes(de,CPXPR({projectId:se,label:ce,path:Ve,cwd:Ve,hostId:We,threadId:n,title:et,projectKind:Me?`chat`:void 0,projectless:Me})),tt=fe?N:void 0,nt;",
      "91948 canonical local task row project context anchor",
    );
    patched = replaceOnce(
      patched,
      "hoverCardSideOffset:Jt,dataAttributes:de,archiveAriaLabel:Yt,",
      "hoverCardSideOffset:Jt,dataAttributes:CPXRowData,archiveAriaLabel:Yt,",
      "91948 canonical local task row data attributes anchor",
    );
    return replaceOnce(
      patched,
      "Y=(0,d7.jsxs)(`div`,{...x,...j,ref:n,className:P,role:`button`,",
      "Y=(0,d7.jsxs)(`div`,{...x,...j,...CPXPR({projectId:b,label:g}),ref:n,className:P,role:`button`,",
      "91948 canonical native project row attributes anchor",
    );
  }
  if (text.includes("function pW(e){let t=(0,mW.c)(3),{target:n}=e")) {
    let patched = replaceOnce(
      text,
      "function pW(e){let t=(0,mW.c)(3),{target:n}=e,",
      `${projectColorHook()}function pW(e){let t=(0,mW.c)(3),{target:n}=e,`,
      "91948 conversation row project color helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "o=(0,gW.jsx)(Lm,{icon:a,label:i})",
      "o=(0,gW.jsx)(Lm,{icon:a,label:(0,gW.jsx)(`span`,{...CPXPR(n.kind===`optimistic`?{threadId:n.conversationId,title:i,projectless:!0}:{threadId:n.conversation.id,title:i,cwd:n.conversation.cwd,projectId:n.conversation.projectId??null}),children:i})})",
      "91948 conversation row project color attributes anchor",
    );
  }
  if (text.includes("function ey(e){let t=(0,oy.c)(128),")) {
    let patched = replaceOnce(text, "function ey(e){let t=(0,oy.c)(128),", `${projectColorHook()}function ey(e){let t=(0,oy.c)(128),`, "61608 local task row project color helper insertion anchor");
    patched = replaceOnce(patched, "dataAttributes:ki.sidebarThreadRow({active:s,hostId:t.hostId,id:n,kind:`local`,pinned:r,title:t.label})", "dataAttributes:{...ki.sidebarThreadRow({active:s,hostId:t.hostId,id:n,kind:`local`,pinned:r,title:t.label}),...CPXPR({projectId:t.projectId,label:t.label,path:t.worktreeGitRoot??t.worktreeWorkspaceRoot,cwd:t.worktreeGitRoot??t.worktreeWorkspaceRoot,hostId:t.hostId,threadId:n,title:t.label,projectKind:t.projectId||t.worktreeGitRoot||t.worktreeWorkspaceRoot?void 0:`chat`,projectless:!(t.projectId||t.worktreeGitRoot||t.worktreeWorkspaceRoot)})}", "61608 local pending task row project color attributes anchor");
    patched = replaceOnce(patched, "dataAttributes:ki.sidebarThreadRow({active:s,hostId:null,id:t,kind:`remote`,pinned:r,title:e.task.title??``})", "dataAttributes:{...ki.sidebarThreadRow({active:s,hostId:null,id:t,kind:`remote`,pinned:r,title:e.task.title??``}),...CPXPR({hostId:null,threadId:t,title:e.task.title??``})}", "61608 remote sidebar row project color attributes anchor");
    return replaceOnce(patched, "dataAttributes:ki.sidebarThreadRow({active:s,hostId:p,id:l,kind:`local`,pinned:r,title:x})", "dataAttributes:{...ki.sidebarThreadRow({active:s,hostId:p,id:l,kind:`local`,pinned:r,title:x}),...CPXPR({projectId:_e,label:ge,path:O,cwd:O,hostId:p,threadId:l,title:x,projectKind:_e||O?void 0:u,projectless:f||u===`projectless`})}", "61608 local sidebar row project color attributes anchor");
  }
  if (text.includes("function Fg(e){let t=(0,Vg.c)(128),")) {
    let patched = replaceOnce(
      text,
      "function Fg(e){let t=(0,Vg.c)(128),",
      `${projectColorHook()}function Fg(e){let t=(0,Vg.c)(128),`,
      "62119 local task row project color helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "dataAttributes:ci.sidebarThreadRow({active:s,hostId:t.hostId,id:n,kind:`local`,pinned:r,title:t.label})",
      "dataAttributes:{...ci.sidebarThreadRow({active:s,hostId:t.hostId,id:n,kind:`local`,pinned:r,title:t.label}),...CPXPR({projectId:t.projectId,label:t.label,path:t.worktreeGitRoot??t.worktreeWorkspaceRoot,cwd:t.worktreeGitRoot??t.worktreeWorkspaceRoot,hostId:t.hostId,threadId:n,title:t.label,projectKind:t.projectId||t.worktreeGitRoot||t.worktreeWorkspaceRoot?void 0:`chat`,projectless:!(t.projectId||t.worktreeGitRoot||t.worktreeWorkspaceRoot)})}",
      "62119 local pending task row project color attributes anchor",
    );
    patched = replaceOnce(
      patched,
      "dataAttributes:ci.sidebarThreadRow({active:s,hostId:null,id:t,kind:`remote`,pinned:r,title:e.task.title??``})",
      "dataAttributes:{...ci.sidebarThreadRow({active:s,hostId:null,id:t,kind:`remote`,pinned:r,title:e.task.title??``}),...CPXPR({hostId:null,threadId:t,title:e.task.title??``})}",
      "62119 remote sidebar row project color attributes anchor",
    );
    return replaceOnce(
      patched,
      "dataAttributes:ci.sidebarThreadRow({active:s,hostId:f,id:l,kind:`local`,pinned:r,title:S})",
      "dataAttributes:{...ci.sidebarThreadRow({active:s,hostId:f,id:l,kind:`local`,pinned:r,title:S}),...CPXPR({projectId:ye,label:ve,path:k,cwd:k,hostId:f,threadId:l,title:S,projectKind:ye||k?void 0:u,projectless:m||u===`projectless`})}",
      "62119 local sidebar row project color attributes anchor",
    );
  }
  if (text.includes("...CPXPR({projectId:b,label:g}),ref:n,className:N,role:`button`,") && !text.includes("function fm(e){let t=(0,vm.c)(128),")) {
    return text;
  }
  if (text.includes("function fm(e){let t=(0,vm.c)(128),")) {
    let patched = text;
    patched = replaceOnce(
      patched,
      "dataAttributes:Hn.sidebarThreadRow({active:s,hostId:t.hostId,id:n,kind:`local`,pinned:r,title:t.label})",
      "dataAttributes:{...Hn.sidebarThreadRow({active:s,hostId:t.hostId,id:n,kind:`local`,pinned:r,title:t.label}),...CPXPR({projectId:t.projectId,label:t.label,path:t.worktreeGitRoot??t.worktreeWorkspaceRoot,cwd:t.worktreeGitRoot??t.worktreeWorkspaceRoot,hostId:t.hostId,threadId:n,title:t.label,projectKind:t.projectId||t.worktreeGitRoot||t.worktreeWorkspaceRoot?void 0:`chat`,projectless:!(t.projectId||t.worktreeGitRoot||t.worktreeWorkspaceRoot)})}",
      "local pending task row project color attributes anchor",
    );
    patched = replaceOnce(
      patched,
      "dataAttributes:Hn.sidebarThreadRow({active:s,hostId:null,id:t,kind:`remote`,pinned:r,title:e.task.title??``})",
      "dataAttributes:{...Hn.sidebarThreadRow({active:s,hostId:null,id:t,kind:`remote`,pinned:r,title:e.task.title??``}),...CPXPR({hostId:null,threadId:t,title:e.task.title??``})}",
      "remote sidebar row project color attributes anchor",
    );
    return replaceOnce(
      patched,
      "dataAttributes:Hn.sidebarThreadRow({active:s,hostId:m,id:u,kind:`local`,pinned:r,title:S})",
      "dataAttributes:{...Hn.sidebarThreadRow({active:s,hostId:m,id:u,kind:`local`,pinned:r,title:S}),...CPXPR({projectId:Se,label:xe,path:A,cwd:A,hostId:m,threadId:u,title:S,projectKind:Se||A?void 0:`chat`,projectless:p})}",
      "local sidebar row project color attributes anchor",
    );
  }
  if (text.includes("function hSe(e){let t=(0,yW.c)(128),")) {
    let patched = replaceOnce(
      text,
      "function hSe(e){let t=(0,yW.c)(128),",
      `${projectColorHook()}function hSe(e){let t=(0,yW.c)(128),`,
      "72221 local task row project color helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "dataAttributes:Ka.sidebarThreadRow({active:s,hostId:t.hostId,id:n,kind:`local`,pinned:r,title:t.label})",
      "dataAttributes:{...Ka.sidebarThreadRow({active:s,hostId:t.hostId,id:n,kind:`local`,pinned:r,title:t.label}),...CPXPR({projectId:t.projectId,label:t.label,path:t.worktreeGitRoot??t.worktreeWorkspaceRoot,cwd:t.worktreeGitRoot??t.worktreeWorkspaceRoot,hostId:t.hostId,threadId:n,title:t.label,projectKind:t.projectId||t.worktreeGitRoot||t.worktreeWorkspaceRoot?void 0:`chat`,projectless:!(t.projectId||t.worktreeGitRoot||t.worktreeWorkspaceRoot)})}",
      "72221 local pending task row project color attributes anchor",
    );
    patched = replaceOnce(
      patched,
      "dataAttributes:Ka.sidebarThreadRow({active:s,hostId:null,id:t,kind:`remote`,pinned:r,title:e.task.title??``})",
      "dataAttributes:{...Ka.sidebarThreadRow({active:s,hostId:null,id:t,kind:`remote`,pinned:r,title:e.task.title??``}),...CPXPR({hostId:null,threadId:t,title:e.task.title??``})}",
      "72221 remote sidebar row project color attributes anchor",
    );
    return replaceOnce(
      patched,
      "dataAttributes:Ka.sidebarThreadRow({active:s,hostId:p,id:l,kind:`local`,pinned:r,title:x})",
      "dataAttributes:{...Ka.sidebarThreadRow({active:s,hostId:p,id:l,kind:`local`,pinned:r,title:x}),...CPXPR({projectId:ve,label:_e,path:E,cwd:E,hostId:p,threadId:l,title:x,projectKind:ve||E?void 0:u,projectless:u===`projectless`})}",
      "72221 local sidebar row project color attributes anchor",
    );
  }
  if (text.includes("function qW(e){let t=(0,$W.c)(128),")) {
    let patched = replaceOnce(
      text,
      "function qW(e){let t=(0,$W.c)(128),",
      `${projectColorHook()}function qW(e){let t=(0,$W.c)(128),`,
      "71524 local task row project color helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "dataAttributes:dn.sidebarThreadRow({active:s,hostId:t.hostId,id:n,kind:`local`,pinned:r,title:t.label})",
      "dataAttributes:{...dn.sidebarThreadRow({active:s,hostId:t.hostId,id:n,kind:`local`,pinned:r,title:t.label}),...CPXPR({projectId:t.projectId,label:t.label,path:t.worktreeGitRoot??t.worktreeWorkspaceRoot,cwd:t.worktreeGitRoot??t.worktreeWorkspaceRoot,hostId:t.hostId,threadId:n,title:t.label,projectKind:t.projectId||t.worktreeGitRoot||t.worktreeWorkspaceRoot?void 0:`chat`,projectless:!(t.projectId||t.worktreeGitRoot||t.worktreeWorkspaceRoot)})}",
      "71524 local pending task row project color attributes anchor",
    );
    patched = replaceOnce(
      patched,
      "dataAttributes:dn.sidebarThreadRow({active:s,hostId:null,id:t,kind:`remote`,pinned:r,title:e.task.title??``})",
      "dataAttributes:{...dn.sidebarThreadRow({active:s,hostId:null,id:t,kind:`remote`,pinned:r,title:e.task.title??``}),...CPXPR({hostId:null,threadId:t,title:e.task.title??``})}",
      "71524 remote sidebar row project color attributes anchor",
    );
    return replaceOnce(
      patched,
      "dataAttributes:dn.sidebarThreadRow({active:s,hostId:m,id:l,kind:`local`,pinned:r,title:S})",
      "dataAttributes:{...dn.sidebarThreadRow({active:s,hostId:m,id:l,kind:`local`,pinned:r,title:S}),...CPXPR({projectId:xe,label:be,path:O,cwd:O,hostId:m,threadId:l,title:S,projectKind:xe||O?void 0:u,projectless:p||u===`projectless`})}",
      "71524 local sidebar row project color attributes anchor",
    );
  }
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
    patched = replaceOnce(
      patched,
      "threadSummary:B,dataAttributes:Le}=e,V=u===void 0?!1:u,",
      "threadSummary:B,dataAttributes:Le}=e,V=u===void 0?!1:u,",
      "local task row project assignment anchor",
    );
    return replaceOnce(
      patched,
      "ft=E(m,n),X=E(h,n)??et?.hostId??null;E(r,n)??et?.modelProvider;",
      "ft=E(m,n),X=E(h,n)??et?.hostId??null;Le={...Le,...CPXPR({projectId:Fe,label:Ie,path:ut,cwd:ut,hostId:X,threadId:n})};E(r,n)??et?.modelProvider;",
      "local task row resolved cwd adapter anchor",
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
    "threadSummary:Ne,dataAttributes:CPXNativeFe}=e,Fe=CPXS.mergeThreadRowAttributes(CPXNativeFe,CPXPR({projectId:Oe,label:ke,path:r,cwd:r,threadId:n})),Ie=g===void 0?!1:g,",
    "local task row project assignment anchor",
  );
  return patched;
}

function patchMermaidDiagramShell(text) {
  if (text.includes("function cr({blockRef:e,code:t,isCodeFenceOpen:r,isDark:i,isVisible:a,onError:o,onRendered:s,renderKey:c}){")) {
    let patched = replaceOnce(
      text,
      "function cr({blockRef:e,code:t,isCodeFenceOpen:r,isDark:i,isVisible:a,onError:o,onRendered:s,renderKey:c}){",
      `${mermaidDiagramHook()}function cr({blockRef:e,code:t,isCodeFenceOpen:r,isDark:i,isVisible:a,onError:o,onRendered:s,renderKey:c}){`,
      "26.715 mermaid diagram shell helper insertion anchor",
    );
    return replaceOnce(
      patched,
      '(0,X.jsxs)(`div`,{className:`relative`,"data-markdown-copy":`code-block`,"data-markdown-copy-text":w,children:[',
      '(0,X.jsxs)(`div`,{...CPXMermaidDiagramProps({code:t}),className:`relative`,"data-markdown-copy":`code-block`,"data-markdown-copy-text":w,children:[',
      "26.715 mermaid diagram shell host props anchor",
    );
  }
  if (text.includes("function cr({blockRef:e,code:t,isCodeFenceOpen:n,isDark:r,isVisible:i,onError:o,onRendered:s,renderKey:l}){")) {
    let patched = replaceOnce(
      text,
      "function cr({blockRef:e,code:t,isCodeFenceOpen:n,isDark:r,isVisible:i,onError:o,onRendered:s,renderKey:l}){",
      `${mermaidDiagramHook()}function cr({blockRef:e,code:t,isCodeFenceOpen:n,isDark:r,isVisible:i,onError:o,onRendered:s,renderKey:l}){`,
      "91948 mermaid diagram shell helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "(0,X.jsxs)(`div`,{className:`relative`,\"data-markdown-copy\":`code-block`,\"data-markdown-copy-text\":T,children:[",
      "(0,X.jsxs)(`div`,{...CPXMermaidDiagramProps({code:t}),className:`relative`,\"data-markdown-copy\":`code-block`,\"data-markdown-copy-text\":T,children:[",
      "91948 mermaid diagram shell host props anchor",
    );
  }
  if (text.includes("function cr({blockRef:e,code:t,isCodeFenceOpen:n,isDark:r,isVisible:i,onError:a,onRendered:o,renderKey:s}){")) {
    let patched = replaceOnce(text, "function cr({blockRef:e,code:t,isCodeFenceOpen:n,isDark:r,isVisible:i,onError:a,onRendered:o,renderKey:s}){", `${mermaidDiagramHook()}function cr({blockRef:e,code:t,isCodeFenceOpen:n,isDark:r,isVisible:i,onError:a,onRendered:o,renderKey:s}){`, "61608 mermaid diagram shell helper insertion anchor");
    return replaceOnce(patched, "(0,X.jsxs)(`div`,{className:`relative`,\"data-markdown-copy\":`code-block`,\"data-markdown-copy-text\":C,children:[", "(0,X.jsxs)(`div`,{...CPXMermaidDiagramProps({code:t}),className:`relative`,\"data-markdown-copy\":`code-block`,\"data-markdown-copy-text\":C,children:[", "61608 mermaid diagram shell host props anchor");
  }
  if (text.includes("function cr({blockRef:e,code:t,isCodeFenceOpen:n,isDark:r,isVisible:i,onError:c,onRendered:l,renderKey:u}){")) {
    let patched = replaceOnce(
      text,
      "function cr({blockRef:e,code:t,isCodeFenceOpen:n,isDark:r,isVisible:i,onError:c,onRendered:l,renderKey:u}){",
      `${mermaidDiagramHook()}function cr({blockRef:e,code:t,isCodeFenceOpen:n,isDark:r,isVisible:i,onError:c,onRendered:l,renderKey:u}){`,
      "62119 mermaid diagram shell helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "(0,X.jsxs)(`div`,{className:`relative`,\"data-markdown-copy\":`code-block`,\"data-markdown-copy-text\":C,children:[",
      "(0,X.jsxs)(`div`,{...CPXMermaidDiagramProps({code:t}),className:`relative`,\"data-markdown-copy\":`code-block`,\"data-markdown-copy-text\":C,children:[",
      "62119 mermaid diagram shell host props anchor",
    );
  }
  if (text.includes("function QVn(e){let t=(0,$Vn.c)(19),")) {
    let patched = replaceOnce(
      text,
      "function QVn(e){let t=(0,$Vn.c)(19),",
      `${mermaidDiagramHook()}function QVn(e){let t=(0,$Vn.c)(19),`,
      "71524 mermaid diagram shell helper insertion anchor",
    );
    return replaceOnce(
      patched,
      'E=(0,x3.jsx)(`div`,{ref:d,className:C,"data-wide-markdown-block":w,"data-wide-markdown-block-kind":c,children:T})',
      'E=(0,x3.jsx)(`div`,{ref:d,...CPXMermaidDiagramProps({code:a}),className:C,"data-wide-markdown-block":w,"data-wide-markdown-block-kind":c,children:T})',
      "71524 mermaid diagram shell host props anchor",
    );
  }
  if (text.includes("function NQe(e){let t=(0,PQe.c)(19),")) {
    let patched = replaceOnce(
      text,
      "function NQe(e){let t=(0,PQe.c)(19),",
      `${mermaidDiagramHook()}function NQe(e){let t=(0,PQe.c)(19),`,
      "72221 mermaid diagram shell helper insertion anchor",
    );
    return replaceOnce(
      patched,
      'E=(0,a$.jsx)(`div`,{ref:d,className:C,"data-wide-markdown-block":w,"data-wide-markdown-block-kind":c,children:T})',
      'E=(0,a$.jsx)(`div`,{ref:d,...CPXMermaidDiagramProps({code:a}),className:C,"data-wide-markdown-block":w,"data-wide-markdown-block-kind":c,children:T})',
      "72221 mermaid diagram shell host props anchor",
    );
  }
  if (text.includes("function cr({blockRef:e,code:t,isCodeFenceOpen:n,isDark:r,isVisible:i,onError:a,onRendered:o,renderKey:l}){")) {
    let patched = replaceOnce(
      text,
      "function cr({blockRef:e,code:t,isCodeFenceOpen:n,isDark:r,isVisible:i,onError:a,onRendered:o,renderKey:l}){",
      `${mermaidDiagramHook()}function cr({blockRef:e,code:t,isCodeFenceOpen:n,isDark:r,isVisible:i,onError:a,onRendered:o,renderKey:l}){`,
      "mermaid diagram shell helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "(0,X.jsxs)(`div`,{className:`relative`,\"data-markdown-copy\":`code-block`,\"data-markdown-copy-text\":S,children:[",
      "(0,X.jsxs)(`div`,{...CPXMermaidDiagramProps({code:t}),className:`relative`,\"data-markdown-copy\":`code-block`,\"data-markdown-copy-text\":S,children:[",
      "mermaid diagram shell host props anchor",
    );
  }
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

function patchPreloadNativeBridge(text, context = {}) {
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715")) {
    return replaceOnce(
      text,
      "e.contextBridge.exposeInMainWorld(`codexWindowType`,C),e.contextBridge.exposeInMainWorld(`electronBridge`,z),typeof window<`u`",
      "e.contextBridge.exposeInMainWorld(`codexWindowType`,C),e.contextBridge.exposeInMainWorld(`electronBridge`,z),e.contextBridge.exposeInMainWorld(`codexPlusHostBridge`,{request:(t,n)=>e.ipcRenderer.invoke(`codex_plus:native-request`,{method:t,params:n})}),typeof window<`u`",
      "21316 codex plus native preload bridge anchor",
    );
  }
  if (text.includes("e.contextBridge.exposeInMainWorld(`codexWindowType`,g),e.contextBridge.exposeInMainWorld(`electronBridge`,j),typeof window<`u`")) {
    return replaceOnce(
      text,
      "e.contextBridge.exposeInMainWorld(`codexWindowType`,g),e.contextBridge.exposeInMainWorld(`electronBridge`,j),typeof window<`u`",
      "e.contextBridge.exposeInMainWorld(`codexWindowType`,g),e.contextBridge.exposeInMainWorld(`electronBridge`,j),e.contextBridge.exposeInMainWorld(`codexPlusHostBridge`,{request:(t,n)=>e.ipcRenderer.invoke(`codex_plus:native-request`,{method:t,params:n})}),typeof window<`u`",
      "codex plus native preload bridge anchor",
    );
  }
  return replaceOnce(
    text,
    "e.contextBridge.exposeInMainWorld(`codexWindowType`,m),e.contextBridge.exposeInMainWorld(`electronBridge`,D),typeof window<`u`",
    "e.contextBridge.exposeInMainWorld(`codexWindowType`,m),e.contextBridge.exposeInMainWorld(`electronBridge`,D),e.contextBridge.exposeInMainWorld(`codexPlusHostBridge`,{request:(t,n)=>e.ipcRenderer.invoke(`codex_plus:native-request`,{method:t,params:n})}),typeof window<`u`",
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

function patchMainNativeBridge(text, context = {}) {
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715.52143")) {
    let patched = replaceOnce(text, "async function kae(){a.n(q9);", `${nativeMainHook({ electronName: "l" })}async function kae(){a.n(q9);`, "52143 codex plus native main helper insertion anchor");
    return replaceOnce(
      patched,
      "Il({chunkedMessageSender:R,isTrustedIpcEvent:B}),e5({buildFlavor:s,getContextForWebContents:z.getContextForWebContents,isTrustedIpcEvent:B}),l.ipcMain.on",
      "Il({chunkedMessageSender:R,isTrustedIpcEvent:B}),e5({buildFlavor:s,getContextForWebContents:z.getContextForWebContents,isTrustedIpcEvent:B}),CPXNative.registerNativeRequest({isTrustedIpcEvent:B}),l.ipcMain.on",
      "52143 codex plus native main registration anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715.31925")) {
    let patched = replaceOnce(text, "async function Aae(){a.n(q9);", `${nativeMainHook({ electronName: "c" })}async function Aae(){a.n(q9);`, "31925 codex plus native main helper insertion anchor");
    return replaceOnce(
      patched,
      "t5({buildFlavor:o,getContextForWebContents:L.getContextForWebContents,isTrustedIpcEvent:R}),",
      "t5({buildFlavor:o,getContextForWebContents:L.getContextForWebContents,isTrustedIpcEvent:R}),CPXNative.registerNativeRequest({isTrustedIpcEvent:R}),",
      "31925 codex plus native main registration anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715")) {
    let patched = replaceOnce(text, "async function Aae(){a.n(q9);", `${nativeMainHook({ electronName: "c" })}async function Aae(){a.n(q9);`, "21316 codex plus native main helper insertion anchor");
    return replaceOnce(
      patched,
      "t5({buildFlavor:o,getContextForWebContents:L.getContextForWebContents,isTrustedIpcEvent:ae}),",
      "t5({buildFlavor:o,getContextForWebContents:L.getContextForWebContents,isTrustedIpcEvent:ae}),CPXNative.registerNativeRequest({isTrustedIpcEvent:ae}),",
      "21316 codex plus native main registration anchor",
    );
  }
  if (text.includes("async function Ere(){let{startedAtMs:e,buildFlavor:o,") && text.includes("W6({buildFlavor:o,getContextForWebContents:R.getContextForWebContents,isTrustedIpcEvent:ae,usesOwlAppShell:x}),")) {
    let patched = replaceOnce(
      text,
      "async function Ere(){let{startedAtMs:e,buildFlavor:o,",
      `${nativeMainHook({ electronName: "c" })}async function Ere(){let{startedAtMs:e,buildFlavor:o,`,
      "codex plus native main helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "W6({buildFlavor:o,getContextForWebContents:R.getContextForWebContents,isTrustedIpcEvent:ae,usesOwlAppShell:x}),",
      "W6({buildFlavor:o,getContextForWebContents:R.getContextForWebContents,isTrustedIpcEvent:ae,usesOwlAppShell:x}),CPXNative.registerNativeRequest({isTrustedIpcEvent:ae}),",
      "codex plus native main registration anchor",
    );
  }
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

function patchMainMenuDiagnostics(text, context = {}) {
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715.52143")) {
    let patched = replaceOnce(
      text,
      "Ne,...c.browserPane?[Pe]:[],nt,...c.browserPane?",
      "Ne,...c.browserPane?[Pe]:[],nt,...CPXNative.templateItems(`view-menu`),...c.browserPane?",
      "52143 codex plus view menu template items anchor",
    );
    return replaceOnce(
      patched,
      "pe=be.refreshApplicationMenu;let xe=",
      "pe=be.refreshApplicationMenu,CPXNative.setRefreshApplicationMenu(()=>be.refreshApplicationMenu()),CPXNative.logMenuDiagnostics();let xe=",
      "52143 codex plus menu diagnostics refresh anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715")) {
    let patched = replaceOnce(
      text,
      "Ne,...l.browserPane?[Pe]:[],nt,...l.browserPane?",
      "Ne,...l.browserPane?[Pe]:[],nt,...CPXNative.templateItems(`view-menu`),...l.browserPane?",
      "21316 codex plus view menu template items anchor",
    );
    return replaceOnce(
      patched,
      "w=()=>{C.refresh()};return{applicationMenuManager:C,",
      "w=()=>{C.refresh()};CPXNative.setRefreshApplicationMenu(w),CPXNative.logMenuDiagnostics();return{applicationMenuManager:C,",
      "21316 codex plus menu diagnostics refresh anchor",
    );
  }
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

function patchChatGptStartupAnnouncements(text, context) {
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715.72028")) {
    return replaceOnce(
      text,
      "function jR({appBrand:e,buildFlavor:t,platform:n}){return(n===`macOS`||n===`windows`)&&e===Ze.ChatGPT&&t!=null&&t!==vt.Agent&&t!==vt.Dev}",
      "function jR({appBrand:e,buildFlavor:t,platform:n}){return false}",
      "72028 ChatGPT migration announcement eligibility anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715.72359")) {
    return replaceOnce(
      text,
      "function MR({appBrand:e,buildFlavor:t,platform:n}){return(n===`macOS`||n===`windows`)&&e===Ze.ChatGPT&&t!=null&&t!==vt.Agent&&t!==vt.Dev}",
      "function MR({appBrand:e,buildFlavor:t,platform:n}){return false}",
      "72359 ChatGPT migration announcement eligibility anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715.31925")) {
    return replaceOnce(
      text,
      "function MR({appBrand:e,buildFlavor:t,platform:n}){return(n===`macOS`||n===`windows`)&&e===Qe.ChatGPT&&t!=null&&t!==yt.Agent&&t!==yt.Dev}",
      "function MR({appBrand:e,buildFlavor:t,platform:n}){return false}",
      "31925 ChatGPT migration announcement eligibility anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715.31251")) {
    return replaceOnce(
      text,
      "function SR({appBrand:e,buildFlavor:t,platform:n}){return(n===`macOS`||n===`windows`)&&e===Ze.ChatGPT&&t!=null&&t!==vt.Agent&&t!==vt.Dev}",
      "function SR({appBrand:e,buildFlavor:t,platform:n}){return false}",
      "31251 ChatGPT migration announcement eligibility anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715")) {
    let patched = replaceOnce(
      text,
      "function SR({appBrand:e,buildFlavor:t,platform:n}){return(n===`macOS`||n===`windows`)&&e===Ze.ChatGPT&&t!=null&&t!==_t.Agent&&t!==_t.Dev}",
      "function SR({appBrand:e,buildFlavor:t,platform:n}){return false}",
      "26.715 ChatGPT migration announcement eligibility anchor",
    );
    return replaceOnce(
      patched,
      "function Ez(e){let t=(0,Dz.c)(26),{announcementSource:n,body:r,dismissAnnouncement:i,model:a,modelName:s,onTryModel:c,showSecondaryAction:l}=e,",
      "function Ez(e){return null;let t=(0,Dz.c)(26),{announcementSource:n,body:r,dismissAnnouncement:i,model:a,modelName:s,onTryModel:c,showSecondaryAction:l}=e,",
      "26.715 ChatGPT model upgrade announcement modal anchor",
    );
  }
  if (text.includes("function Vse({appBrand:e,buildFlavor:t,platform:n}){return(n===`macOS`||n===`windows`)&&e===en.ChatGPT&&t!=null&&t!==Pt.Agent&&t!==Pt.Dev}")) {
    let patched = replaceOnce(
      text,
      "function Vse({appBrand:e,buildFlavor:t,platform:n}){return(n===`macOS`||n===`windows`)&&e===en.ChatGPT&&t!=null&&t!==Pt.Agent&&t!==Pt.Dev}",
      "function Vse({appBrand:e,buildFlavor:t,platform:n}){return false}",
      "91948 ChatGPT migration announcement eligibility anchor",
    );
    return replaceOnce(
      patched,
      "function yN(e){let t=(0,bN.c)(26),{announcementSource:n,body:r,dismissAnnouncement:i,model:a,modelName:o,onTryModel:s,showSecondaryAction:c}=e,",
      "function yN(e){return null;let t=(0,bN.c)(26),{announcementSource:n,body:r,dismissAnnouncement:i,model:a,modelName:o,onTryModel:s,showSecondaryAction:c}=e,",
      "91948 ChatGPT model upgrade announcement modal anchor",
    );
  }
  if (text.includes("function SCe({appBrand:e,buildFlavor:t,platform:n}){return(n===`macOS`||n===`windows`)&&e===xn.ChatGPT&&t!=null&&t!==Zt.Agent&&t!==Zt.Dev}")) {
    let patched = replaceOnce(text, "function SCe({appBrand:e,buildFlavor:t,platform:n}){return(n===`macOS`||n===`windows`)&&e===xn.ChatGPT&&t!=null&&t!==Zt.Agent&&t!==Zt.Dev}", "function SCe({appBrand:e,buildFlavor:t,platform:n}){return false}", "61608 ChatGPT migration announcement eligibility anchor");
    return replaceOnce(patched, "function Fj(e){let t=(0,Ij.c)(26),{announcementSource:n,body:r,dismissAnnouncement:i,model:a,modelName:o,onTryModel:s,showSecondaryAction:c}=e,", "function Fj(e){return null;let t=(0,Ij.c)(26),{announcementSource:n,body:r,dismissAnnouncement:i,model:a,modelName:o,onTryModel:s,showSecondaryAction:c}=e,", "61608 ChatGPT model upgrade announcement modal anchor");
  }
  if (text.includes("function Wle({appBrand:e,buildFlavor:t,platform:n}){return(n===`macOS`||n===`windows`)&&e===w.ChatGPT&&t!=null&&t!==gt.Agent&&t!==gt.Dev}")) {
    let patched = replaceOnce(
      text,
      "function Wle({appBrand:e,buildFlavor:t,platform:n}){return(n===`macOS`||n===`windows`)&&e===w.ChatGPT&&t!=null&&t!==gt.Agent&&t!==gt.Dev}",
      "function Wle({appBrand:e,buildFlavor:t,platform:n}){return false}",
      "62119 ChatGPT migration announcement eligibility anchor",
    );
    return replaceOnce(
      patched,
      "function cM(e){let t=(0,lM.c)(26),{announcementSource:n,body:r,dismissAnnouncement:i,model:a,modelName:o,onTryModel:s,showSecondaryAction:c}=e,",
      "function cM(e){return null;let t=(0,lM.c)(26),{announcementSource:n,body:r,dismissAnnouncement:i,model:a,modelName:o,onTryModel:s,showSecondaryAction:c}=e,",
      "62119 ChatGPT model upgrade announcement modal anchor",
    );
  }
  if (text.includes("function qde({appBrand:e,buildFlavor:t,platform:n}){return(n===`macOS`||n===`windows`)&&e===Ec.ChatGPT&&t!=null&&t!==gs.Agent&&t!==gs.Dev}")) {
    let patched = replaceOnce(
      text,
      "function qde({appBrand:e,buildFlavor:t,platform:n}){return(n===`macOS`||n===`windows`)&&e===Ec.ChatGPT&&t!=null&&t!==gs.Agent&&t!==gs.Dev}",
      "function qde({appBrand:e,buildFlavor:t,platform:n}){return false}",
      "71524 ChatGPT migration announcement eligibility anchor",
    );
    return replaceOnce(
      patched,
      "function qA(e){let t=(0,JA.c)(26),{announcementSource:n,body:r,dismissAnnouncement:i,model:a,modelName:o,onTryModel:s,showSecondaryAction:c}=e,",
      "function qA(e){return null;let t=(0,JA.c)(26),{announcementSource:n,body:r,dismissAnnouncement:i,model:a,modelName:o,onTryModel:s,showSecondaryAction:c}=e,",
      "71524 ChatGPT model upgrade announcement modal anchor",
    );
  }
  if (text.includes("function $me({appBrand:e,buildFlavor:t,platform:n}){return(n===`macOS`||n===`windows`)&&e===Hu.ChatGPT&&t!=null&&t!==tg.Agent&&t!==tg.Dev}")) {
    let patched = replaceOnce(
      text,
      "function $me({appBrand:e,buildFlavor:t,platform:n}){return(n===`macOS`||n===`windows`)&&e===Hu.ChatGPT&&t!=null&&t!==tg.Agent&&t!==tg.Dev}",
      "function $me({appBrand:e,buildFlavor:t,platform:n}){return false}",
      "72221 ChatGPT migration announcement eligibility anchor",
    );
    return replaceOnce(
      patched,
      "function VN(e){let t=(0,HN.c)(26),{announcementSource:n,body:r,dismissAnnouncement:i,model:a,modelName:o,onTryModel:s,showSecondaryAction:c}=e,",
      "function VN(e){return null;let t=(0,HN.c)(26),{announcementSource:n,body:r,dismissAnnouncement:i,model:a,modelName:o,onTryModel:s,showSecondaryAction:c}=e,",
      "72221 ChatGPT model upgrade announcement modal anchor",
    );
  }
  if (text.includes("function Cde({appBrand:e,buildFlavor:t,platform:n}){return(n===`macOS`||n===`windows`)&&e===E.ChatGPT&&t!=null&&t!==U.Agent&&t!==U.Dev}")) {
    let patched = replaceOnce(
      text,
      "function Cde({appBrand:e,buildFlavor:t,platform:n}){return(n===`macOS`||n===`windows`)&&e===E.ChatGPT&&t!=null&&t!==U.Agent&&t!==U.Dev}",
      "function Cde({appBrand:e,buildFlavor:t,platform:n}){return false}",
      "ChatGPT migration announcement eligibility anchor",
    );
    return replaceOnce(
      patched,
      "function ON(e){let t=(0,kN.c)(26),{announcementSource:n,body:r,dismissAnnouncement:i,model:a,modelName:o,onTryModel:s,showSecondaryAction:c}=e,",
      "function ON(e){return null;let t=(0,kN.c)(26),{announcementSource:n,body:r,dismissAnnouncement:i,model:a,modelName:o,onTryModel:s,showSecondaryAction:c}=e,",
      "ChatGPT model upgrade announcement modal anchor",
    );
  }
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
    ...(composerPrimitiveFile ? [{
      id: "native-composer-surface",
      fileTransforms: [[composerPrimitiveFile, patchComposerPrimitiveSurface]],
    }] : []),
    ...(headerFile || threadHeaderActionShellFile || threadTitleFile || threadPageHeaderFile || localConversationPageFile ? [{
      id: "project-path-header",
      fileTransforms: [
        ...(headerFile ? [[headerFile, patchHeader]] : []),
        ...(threadHeaderActionShellFile ? [[threadHeaderActionShellFile, patchThreadHeaderActionShell]] : []),
        ...(threadTitleFile ? [[threadTitleFile, patchThreadTitle]] : []),
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
        [commandMenuRuntimeFile, patchCommandMenuRuntimeCommands],
      ],
    },
    {
      id: "project-selector-shortcut",
      fileTransforms: [
        ...(localActiveWorkspaceRootDropdownFile ? [[localActiveWorkspaceRootDropdownFile, patchLocalActiveWorkspaceRootDropdownProjectSelectorShortcut]] : []),
        ...(homeProjectDropdownFile ? [[homeProjectDropdownFile, patchHomeProjectDropdownProjectSelectorShortcut]] : []),
        ...(runCommandFile ? [[runCommandFile, patchRunCommandProjectSelectorShortcut]] : []),
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

  let nextTransformOrder = 0;
  const ownedPatches = patches.map((patch) => ({
    ...patch,
    fileTransforms: (patch.fileTransforms || []).map(([filePath, transform]) => {
      const variantId = `${config.id}/${patch.id}/${transform.name || "anonymous"}/${filePath}`;
      const transformOrder = nextTransformOrder++;
      const ownedTransform = function ownedPatchTransform(text, context = {}) {
        if (context.patchSetId != null && context.patchSetId !== config.id) {
          throw new Error(`Transform variant ${variantId} belongs to ${config.id}, not ${context.patchSetId}`);
        }
        const providedIdentity = context.sourceIdentity;
        if (providedIdentity != null) {
          const expectedIdentity = {
            version: config.codexVersion,
            bundleVersion: config.bundleVersion,
            asarSha256: config.asarSha256,
            sourceFamily,
          };
          for (const [key, expected] of Object.entries(expectedIdentity)) {
            if (providedIdentity[key] != null && providedIdentity[key] !== expected) {
              throw new Error(`Transform variant ${variantId} expected source ${key} ${expected}, got ${providedIdentity[key]}`);
            }
          }
        }
        return transform(text, {
          ...context,
          patchSetId: config.id,
          sourceIdentity: providedIdentity || {
            version: config.codexVersion,
            bundleVersion: config.bundleVersion,
            asarSha256: config.asarSha256,
            sourceFamily,
          },
          transformVariant: {
            id: variantId,
            owningPatchSetIds: [config.id],
          },
        });
      };
      Object.defineProperties(ownedTransform, {
        name: { value: transform.name || "anonymous" },
        ownerPatchSetId: { value: config.id },
        owningPatchSetIds: { value: Object.freeze([config.id]) },
        variantId: { value: variantId },
        transformOrder: { value: transformOrder },
        expectedChange: {
          value: !(config.unchangedTransformVariants || []).includes(`${patch.id}/${transform.name || "anonymous"}`),
        },
      });
      return [filePath, ownedTransform];
    }),
  }));

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
    assetFiles: () => codexPlusRuntimeAssets({
      ...(config.runtimeConfig || {}),
      bundleVersion: config.bundleVersion,
      codexVersion: config.codexVersion,
      patchedAppDisplayName: appDisplayName,
      patchSetId: config.id,
      sourceFamily,
    }),
    patches: enabledPatchIds == null ? ownedPatches : ownedPatches.filter((patch) => enabledPatchIds.has(patch.id)),
  });
}

module.exports = {
  buildCodexPlusPatchSet,
};
