const { replaceOnce } = require("./replace");

function patchLocalActiveWorkspaceRootDropdownProjectSelectorShortcut(text) {
  let patched = replaceOnce(
    text,
    "Ne=r();function Pe(e){let t=(0,Ne.c)(42),",
    "Ne=r();function CPXProjectSelectorFuzzyFilter(e,t){let n=String(t??``).trim().toLowerCase();return window.CodexPlus?.ui?.projectSelector?.fuzzyFilter?.(e,t)??(n?e.filter(e=>[e.label,e.repositoryData?.rootFolder??``,e.path??``,e.hostDisplayName??``].some(e=>String(e??``).toLowerCase().includes(n))):e)}function CPXProjectSelectorFuzzyHighlight(e,t){return window.CodexPlus?.ui?.projectSelector?.fuzzyHighlight?.({text:e,query:t,jsx:H.jsx})??e}function CPXProjectSelectorAcceptFirst(e,t,n,r){let i=t?.[0];if(e?.key!==`Enter`||String(r??``).trim().length===0||i==null)return;e.preventDefault?.(),e.stopPropagation?.(),n(i.projectId)}function Pe(e){let t=(0,Ne.c)(42),",
    "project selector fuzzy search adapter insertion anchor",
  );
  patched = replaceOnce(
    patched,
    "let e=h.trim().toLowerCase();v=n.filter(t=>{if(!e)return!0;let n=t.repositoryData?.rootFolder??``;return[t.label,n,t.path??``,t.hostDisplayName??``].some(t=>t.toLowerCase().includes(e))});",
    "v=CPXProjectSelectorFuzzyFilter(n,h);",
    "project selector fuzzy search filter anchor",
  );
  patched = replaceOnce(
    patched,
    "S=(0,H.jsx)(ve,{value:h,onChange:o,placeholder:s,className:`mb-1`})",
    "S=(0,H.jsx)(ve,{value:h,onChange:o,onKeyDown:e=>CPXProjectSelectorAcceptFirst(e,v,i,h),placeholder:s,className:`mb-1`})",
    "project selector accept first match keydown anchor",
  );
  patched = replaceOnce(
    patched,
    "(0,H.jsx)(`span`,{className:`truncate`,children:e.label})",
    "(0,H.jsx)(`span`,{className:`truncate`,children:CPXProjectSelectorFuzzyHighlight(e.label,h)})",
    "project selector fuzzy search highlight anchor",
  );
  patched = replaceOnce(
    patched,
    "function Ie(e){let t=(0,Ne.c)(81),",
    "function CPXProjectSelectorTrigger(e,t){return Me.isValidElement(e)?Me.cloneElement(e,{...e.props,\"data-codex-plus-project-selector-trigger\":!0,\"data-codex-plus-project-selector-variant\":t}):e}function Ie(e){let t=(0,Ne.c)(81),",
    "project selector shortcut helper insertion anchor",
  );
  return replaceOnce(
    patched,
    "at=(0,H.jsx)(ye,{open:f,onOpenChange:g,onCloseAutoFocus:Y,align:tt,disabled:O,triggerButton:X,contentWidth:`workspace`,contentMaxHeight:`tall`,children:$})",
    "at=(0,H.jsx)(ye,{open:f,onOpenChange:g,onCloseAutoFocus:Y,align:tt,disabled:O,triggerButton:CPXProjectSelectorTrigger(X,k),contentWidth:`workspace`,contentMaxHeight:`tall`,children:$})",
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
