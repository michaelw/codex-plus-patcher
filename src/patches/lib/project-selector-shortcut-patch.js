const { replaceOnce } = require("./replace");
const { projectSelectorSearchHook, projectSelectorTriggerHook } = require("./hooks/project-selector");

function patchLocalActiveWorkspaceRootDropdownProjectSelectorShortcut(text) {
  if (text.includes("function Ti(e){let t=(0,Oi.c)(109),")) {
    return replaceOnce(
      text,
      "de=(0,X.jsx)(`button`,{type:`button`,className:`flex min-w-0 items-center gap-1.5 rounded-lg bg-token-foreground/5 px-2 py-0.5 text-base leading-6 font-medium tracking-[-0.13px] text-token-foreground`,disabled:re,children:ue})",
      "de=(0,X.jsx)(`button`,{type:`button`,\"data-codex-plus-project-selector-trigger\":!0,\"data-codex-plus-project-selector-variant\":`default`,className:`flex min-w-0 items-center gap-1.5 rounded-lg bg-token-foreground/5 px-2 py-0.5 text-base leading-6 font-medium tracking-[-0.13px] text-token-foreground`,disabled:re,children:ue})",
      "project selector shortcut final dropdown trigger anchor",
    );
  }
  let patched = replaceOnce(
    text,
    "Ne=r();function Pe(e){let t=(0,Ne.c)(42),",
    `Ne=r();${projectSelectorSearchHook()}function Pe(e){let t=(0,Ne.c)(42),`,
    "project selector fuzzy search adapter insertion anchor",
  );
  patched = replaceOnce(
    patched,
    "let e=h.trim().toLowerCase();v=n.filter(t=>{if(!e)return!0;let n=t.repositoryData?.rootFolder??``;return[t.label,n,t.path??``,t.hostDisplayName??``].some(t=>t.toLowerCase().includes(e))});",
    "v=CPXP.fuzzyFilter(n,h);",
    "project selector fuzzy search filter anchor",
  );
  patched = replaceOnce(
    patched,
    "S=(0,H.jsx)(ve,{value:h,onChange:o,placeholder:s,className:`mb-1`})",
    "S=(0,H.jsx)(ve,{value:h,onChange:o,onKeyDown:e=>CPXP.acceptFirst(e,v,i,h),placeholder:s,className:`mb-1`})",
    "project selector accept first match keydown anchor",
  );
  patched = replaceOnce(
    patched,
    "(0,H.jsx)(`span`,{className:`truncate`,children:e.label})",
    "(0,H.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,h,H.jsx)})",
    "project selector fuzzy search highlight anchor",
  );
  patched = replaceOnce(
    patched,
    "function Ie(e){let t=(0,Ne.c)(81),",
    `${projectSelectorTriggerHook()}function Ie(e){let t=(0,Ne.c)(81),`,
    "project selector shortcut helper insertion anchor",
  );
  return replaceOnce(
    patched,
    "at=(0,H.jsx)(ye,{open:f,onOpenChange:g,onCloseAutoFocus:Y,align:tt,disabled:O,triggerButton:X,contentWidth:`workspace`,contentMaxHeight:`tall`,children:$})",
    "at=(0,H.jsx)(ye,{open:f,onOpenChange:g,onCloseAutoFocus:Y,align:tt,disabled:O,triggerButton:CPXPST(X,k),contentWidth:`workspace`,contentMaxHeight:`tall`,children:$})",
    "project selector shortcut final dropdown trigger anchor",
  );
}

function patchHomeProjectDropdownProjectSelectorShortcut(text) {
  if (text.includes("function zn(e){let t=(0,Bn.c)(44),") && text.includes("function ar({activeProjectIdOverride:e,")) {
    let patched = replaceOnce(
      text,
      "function zn(e){let t=(0,Bn.c)(44),",
      `${projectSelectorSearchHook()}${projectSelectorTriggerHook("$")}function zn(e){let t=(0,Bn.c)(44),`,
      "home project selector shortcut helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "let e=_.trim().toLowerCase();b=r.filter(t=>{if(!e)return!0;let n=t.repositoryData?.rootFolder??``;return[t.label,n,t.path??``,t.hostDisplayName??``].some(t=>t.toLowerCase().includes(e))});",
      "b=CPXP.fuzzyFilter(r,_);",
      "home project selector fuzzy search filter anchor",
    );
    patched = replaceOnce(
      patched,
      "w=(0,Z.jsx)(_t,{value:_,onChange:s,placeholder:c,className:`mb-1`})",
      "w=(0,Z.jsx)(_t,{value:_,onChange:s,onKeyDown:e=>CPXP.acceptFirst(e,b,o,_),placeholder:c,className:`mb-1`})",
      "home project selector accept first match keydown anchor",
    );
    patched = replaceOnce(
      patched,
      "(0,Z.jsx)(`span`,{className:`truncate`,children:e.label})",
      "(0,Z.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,_,Z.jsx)})",
      "home project selector fuzzy search highlight anchor",
    );
    patched = replaceOnce(
      patched,
      "children:(0,$.jsxs)(me,{size:`composerSm`,color:`ghost`,className:`min-w-0`,children:",
      "children:(0,$.jsxs)(me,{\"data-codex-plus-project-selector-trigger\":!0,\"data-codex-plus-project-selector-variant\":u,size:`composerSm`,color:`ghost`,className:`min-w-0`,children:",
      "home project selector default button marker anchor",
    );
    patched = replaceOnce(
      patched,
      "children:(0,$.jsx)($n,{categoryLabel:(0,$.jsx)(R,{id:`composer.localCwdDropdown.footerCategory`",
      "children:(0,$.jsx)($n,{\"data-codex-plus-project-selector-trigger\":!0,\"data-codex-plus-project-selector-variant\":u,categoryLabel:(0,$.jsx)(R,{id:`composer.localCwdDropdown.footerCategory`",
      "home project selector footer button marker anchor",
    );
    patched = replaceOnce(
      patched,
      "ze=()=>(0,$.jsxs)(`button`,{className:V(`heading-xl text-token-text-tertiary",
      "ze=()=>(0,$.jsxs)(`button`,{\"data-codex-plus-project-selector-trigger\":!0,\"data-codex-plus-project-selector-variant\":u,className:V(`heading-xl text-token-text-tertiary",
      "home project selector hero button marker anchor",
    );
    patched = replaceOnce(
      patched,
      "triggerButton:p??G(),contentWidth:`menu`",
      "triggerButton:CPXPST(p??G(),u),contentWidth:`menu`",
      "home project selector empty trigger anchor",
    );
    return replaceOnce(
      patched,
      "triggerButton:p??(u===`hero`?ze():u===`home`?G():Ie()),contentWidth:`workspace`",
      "triggerButton:CPXPST(p??(u===`hero`?ze():u===`home`?G():Ie()),u),contentWidth:`workspace`",
      "home project selector workspace trigger anchor",
    );
  }
  let patched = replaceOnce(
    text,
    "function St({activeProjectIdOverride:e,allowLocalProjects:t=!0,allowLocalProjectActions:n=t,allowRemoteProjects:r=!0,disabled:a=!1,hideLabel:o=!1,onWorkspaceRootSelected:s,variant:c=`default`,isOpen:l,onOpenChange:m,triggerButton:_}){",
    `${projectSelectorSearchHook()}${projectSelectorTriggerHook("wt")}function St({activeProjectIdOverride:e,allowLocalProjects:t=!0,allowLocalProjectActions:n=t,allowRemoteProjects:r=!0,disabled:a=!1,hideLabel:o=!1,onWorkspaceRootSelected:s,variant:c=\`default\`,isOpen:l,onOpenChange:m,triggerButton:_}){`,
    "home project selector shortcut helper insertion anchor",
  );
  patched = replaceOnce(
    patched,
    "let e=_.trim().toLowerCase();b=r.filter(t=>{if(!e)return!0;let n=t.repositoryData?.rootFolder??``;return[t.label,n,t.path??``,t.hostDisplayName??``].some(t=>t.toLowerCase().includes(e))});",
    "b=CPXP.fuzzyFilter(r,_);",
    "home project selector fuzzy search filter anchor",
  );
  patched = replaceOnce(
    patched,
    "w=(0,X.jsx)(ie,{value:_,onChange:s,placeholder:c,className:`mb-1`})",
    "w=(0,X.jsx)(ie,{value:_,onChange:s,onKeyDown:e=>CPXP.acceptFirst(e,b,o,_),placeholder:c,className:`mb-1`})",
    "home project selector accept first match keydown anchor",
  );
  patched = replaceOnce(
    patched,
    "(0,X.jsx)(`span`,{className:`truncate`,children:e.label})",
    "(0,X.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,_,X.jsx)})",
    "home project selector fuzzy search highlight anchor",
  );
  patched = replaceOnce(
    patched,
    "children:(0,$.jsxs)(Ne,{size:`composerSm`,color:`ghost`,className:`min-w-0`,children:",
    "children:(0,$.jsxs)(Ne,{\"data-codex-plus-project-selector-trigger\":!0,\"data-codex-plus-project-selector-variant\":c,size:`composerSm`,color:`ghost`,className:`min-w-0`,children:",
    "home project selector default button marker anchor",
  );
  patched = replaceOnce(
    patched,
    "children:(0,$.jsx)(gt,{categoryLabel:(0,$.jsx)(R,{id:`composer.localCwdDropdown.footerCategory`",
    "children:(0,$.jsx)(gt,{\"data-codex-plus-project-selector-trigger\":!0,\"data-codex-plus-project-selector-variant\":c,categoryLabel:(0,$.jsx)(R,{id:`composer.localCwdDropdown.footerCategory`",
    "home project selector footer button marker anchor",
  );
  patched = replaceOnce(
    patched,
    "Ze=()=>(0,$.jsxs)(`button`,{className:W(`heading-xl text-token-text-tertiary",
    "Ze=()=>(0,$.jsxs)(`button`,{\"data-codex-plus-project-selector-trigger\":!0,\"data-codex-plus-project-selector-variant\":c,className:W(`heading-xl text-token-text-tertiary",
    "home project selector hero button marker anchor",
  );
  patched = replaceOnce(
    patched,
    "triggerButton:_??J(),contentWidth:`menu`",
    "triggerButton:CPXPST(_??J(),c),contentWidth:`menu`",
    "home project selector empty trigger anchor",
  );
  return replaceOnce(
    patched,
    "triggerButton:_??(c===`hero`?Ze():c===`home`?J():Ke()),contentWidth:`workspace`",
    "triggerButton:CPXPST(_??(c===`hero`?Ze():c===`home`?J():Ke()),c),contentWidth:`workspace`",
    "home project selector workspace trigger anchor",
  );
}

function patchRunCommandProjectSelectorShortcut(text) {
  const runtimeCommandEntries = "...(window.CodexPlus?.commands?.all?.()??[]).map(e=>[e.id,()=>window.CodexPlus?.commands?.run?.(e.id)])";
  if (text.includes("Jy(`toggleSidebar`,r);")) {
    return replaceOnce(
      text,
      "Jy(`toggleSidebar`,r);",
      "Jy(`toggleSidebar`,r);for(let e of window.CodexPlus?.commands?.all?.()??[])Jy(e.id,()=>window.CodexPlus?.commands?.run?.(e.id));",
      "codex plus runtime command dispatch anchor",
    );
  }
  if (text.includes("],[`openFolder`,GTt],[`toggleSidebar`,")) {
    return replaceOnce(
      text,
      "],[`openFolder`,GTt],[`toggleSidebar`,",
      `],[\`openFolder\`,GTt],${runtimeCommandEntries},[\`toggleSidebar\`,`,
      "codex plus runtime command dispatch anchor",
    );
  }
  return replaceOnce(
    text,
    "],[`openFolder`,()=>{r()}],[`toggleSidebar`,",
    `],[\`openFolder\`,()=>{r()}],${runtimeCommandEntries},[\`toggleSidebar\`,`,
    "codex plus runtime command dispatch anchor",
  );
}

module.exports = {
  patchHomeProjectDropdownProjectSelectorShortcut,
  patchLocalActiveWorkspaceRootDropdownProjectSelectorShortcut,
  patchRunCommandProjectSelectorShortcut,
};
