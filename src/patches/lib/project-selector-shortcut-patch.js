const { replaceOnce } = require("./replace");
const { projectSelectorSearchHook, projectSelectorTriggerHook } = require("./hooks/project-selector");

function patchLocalActiveWorkspaceRootDropdownProjectSelectorShortcut(text) {
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

function patchRunCommandProjectSelectorShortcut(text) {
  return replaceOnce(
    text,
    "],[`openFolder`,()=>{r()}],[`toggleSidebar`,",
    "],[`codexPlus.focusProjectSelector`,()=>{window.CodexPlus?.commands?.run?.(`codexPlus.focusProjectSelector`)}],[`openFolder`,()=>{r()}],[`toggleSidebar`,",
    "project selector shortcut command dispatch anchor",
  );
}

module.exports = {
  patchLocalActiveWorkspaceRootDropdownProjectSelectorShortcut,
  patchRunCommandProjectSelectorShortcut,
};
