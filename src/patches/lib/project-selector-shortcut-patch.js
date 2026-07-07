const { replaceOnce } = require("./replace");
const { projectSelectorSearchHook, projectSelectorTriggerHook } = require("./hooks/project-selector");

function patchLocalActiveWorkspaceRootDropdownProjectSelectorShortcut(text) {
  if (
    text.includes("var ha,ga,Q,_a,va,$,ya=e((()=>{") &&
    text.includes("Q=Ye(),_a=`icon-xs shrink-0 opacity-75 group-focus:opacity-100 group-hover:opacity-100`,va=(0,ga.memo)(function(e){let t=(0,ha.c)(177),")
  ) {
    let patched = replaceOnce(
      text,
      "var ha,ga,Q,_a,va,$,ya=e((()=>{",
      "var ha,ga,Q,_a,va,$,CPXP,CPXPST,ya=e((()=>{",
      "project selector shortcut helper variable anchor",
    );
    patched = replaceOnce(
      patched,
      "Q=Ye(),_a=`icon-xs shrink-0 opacity-75 group-focus:opacity-100 group-hover:opacity-100`,va=(0,ga.memo)(function(e){let t=(0,ha.c)(177),",
      "Q=Ye(),_a=`icon-xs shrink-0 opacity-75 group-focus:opacity-100 group-hover:opacity-100`,CPXP=window.CodexPlusHost.adapters.projectSelector,CPXPST=(e,t)=>CPXP.trigger(e,t,Q),va=(0,ga.memo)(function(e){let t=(0,ha.c)(177),",
      "project selector shortcut helper insertion anchor",
    );
    return replaceOnce(
      patched,
      "triggerButton:C===`summary-panel`?Ot:(0,Q.jsx)(U,{tooltipContent:(0,Q.jsx)(S,{...$.localRemoteWhereRun}),children:Ot}),children:",
      "triggerButton:CPXPST(C===`summary-panel`?Ot:(0,Q.jsx)(U,{tooltipContent:(0,Q.jsx)(S,{...$.localRemoteWhereRun}),children:Ot}),C),children:",
      "project selector shortcut final dropdown trigger anchor",
    );
  }
  if (
    text.includes("function yr(e){let t=(0,Sr.c)(22),{composerMode:n,conversationId:r,disabled:i,setComposerMode:a,side:o}=e") &&
    !text.includes("activeProjectIdOverride")
  ) {
    return text;
  }
  if (text.includes("function sa(e){let t=(0,ha.c)(64),")) {
    let patched = replaceOnce(
      text,
      "function sa(e){let t=(0,ha.c)(64),",
      `${projectSelectorSearchHook()}${projectSelectorTriggerHook("ga")}function sa(e){let t=(0,ha.c)(64),`,
      "project selector shortcut helper insertion anchor",
    );
    if (patched.includes("triggerButton:_===`summary-panel`?B:(0,Q.jsx)(Oe,{tooltipContent:h,tooltipMaxWidth:g,children:B}),children:")) {
      return replaceOnce(
        patched,
        "triggerButton:_===`summary-panel`?B:(0,Q.jsx)(Oe,{tooltipContent:h,tooltipMaxWidth:g,children:B}),children:",
        "triggerButton:CPXPST(_===`summary-panel`?B:(0,Q.jsx)(Oe,{tooltipContent:h,tooltipMaxWidth:g,children:B}),_),children:",
        "project selector shortcut final dropdown trigger anchor",
      );
    }
    if (patched.includes("triggerButton:g===`summary-panel`?z:(0,Q.jsx)(it,{tooltipContent:m,tooltipMaxWidth:h,children:z}),children:")) {
      return replaceOnce(
        patched,
        "triggerButton:g===`summary-panel`?z:(0,Q.jsx)(it,{tooltipContent:m,tooltipMaxWidth:h,children:z}),children:",
        "triggerButton:CPXPST(g===`summary-panel`?z:(0,Q.jsx)(it,{tooltipContent:m,tooltipMaxWidth:h,children:z}),g),children:",
        "project selector shortcut final dropdown trigger anchor",
      );
    }
    return replaceOnce(
      patched,
      "triggerButton:g===`summary-panel`?B:(0,Q.jsx)(Fe,{tooltipContent:m,tooltipMaxWidth:h,children:B}),children:",
      "triggerButton:CPXPST(g===`summary-panel`?B:(0,Q.jsx)(Fe,{tooltipContent:m,tooltipMaxWidth:h,children:B}),g),children:",
      "project selector shortcut final dropdown trigger anchor",
    );
  }
  if (text.includes("function rt(e){let t=(0,it.c)(44),") && text.includes("function St({activeProjectIdOverride:e,")) {
    let patched = replaceOnce(
      text,
      "var et,tt,nt=e((()=>{et=L(),Je(),_e(),tt=o()}));function rt(e){let t=(0,it.c)(44),",
      `var et,tt,nt=e((()=>{et=L(),Je(),_e(),tt=o()}));${projectSelectorSearchHook()}function rt(e){let t=(0,it.c)(44),`,
      "project selector fuzzy search adapter insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "let e=_.trim().toLowerCase();b=r.filter(t=>{if(!e)return!0;let n=t.repositoryData?.rootFolder??``;return[t.label,n,t.path??``,t.hostDisplayName??``].some(t=>t.toLowerCase().includes(e))});",
      "b=CPXP.fuzzyFilter(r,_);",
      "project selector fuzzy search filter anchor",
    );
    patched = replaceOnce(
      patched,
      "T=(0,X.jsx)(fe,{value:_,onChange:s,placeholder:c,className:`mb-1`})",
      "T=(0,X.jsx)(fe,{value:_,onChange:s,onKeyDown:e=>CPXP.acceptFirst(e,b,o,_),placeholder:c,className:`mb-1`})",
      "project selector accept first match keydown anchor",
    );
    patched = replaceOnce(
      patched,
      "(0,X.jsx)(`span`,{className:`truncate`,children:e.label})",
      "(0,X.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,_,X.jsx)})",
      "project selector fuzzy search highlight anchor",
    );
    patched = replaceOnce(
      patched,
      "var wt,$,Tt=e((()=>{Se(),F(),r(),ge(),wt=t(b(),1),",
      `${projectSelectorTriggerHook("wt")}var wt,$,Tt=e((()=>{Se(),F(),r(),ge(),wt=t(b(),1),`,
      "project selector shortcut helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "children:(0,$.jsx)(gt,{categoryLabel:(0,$.jsx)(z,{id:`composer.localCwdDropdown.footerCategory`",
      "children:(0,$.jsx)(gt,{\"data-codex-plus-project-selector-trigger\":!0,\"data-codex-plus-project-selector-variant\":c,categoryLabel:(0,$.jsx)(z,{id:`composer.localCwdDropdown.footerCategory`",
      "project selector default button marker anchor",
    );
    patched = replaceOnce(
      patched,
      "Ze=()=>(0,$.jsxs)(`button`,{className:a(`heading-xl text-token-text-tertiary",
      "Ze=()=>(0,$.jsxs)(`button`,{\"data-codex-plus-project-selector-trigger\":!0,\"data-codex-plus-project-selector-variant\":c,className:a(`heading-xl text-token-text-tertiary",
      "project selector hero button marker anchor",
    );
    patched = replaceOnce(
      patched,
      "triggerButton:h??J(),contentWidth:`menu`",
      "triggerButton:CPXPST(h??J(),c),contentWidth:`menu`",
      "project selector empty trigger anchor",
    );
    return replaceOnce(
      patched,
      "triggerButton:h??(c===`hero`?Ze():c===`home`?J():Je()),contentWidth:`workspace`",
      "triggerButton:CPXPST(h??(c===`hero`?Ze():c===`home`?J():Je()),c),contentWidth:`workspace`",
      "project selector shortcut final dropdown trigger anchor",
    );
  }
  if (text.includes("function Ti(e){let t=(0,Oi.c)(109),")) {
    return replaceOnce(
      text,
      "de=(0,X.jsx)(`button`,{type:`button`,className:`flex min-w-0 items-center gap-1.5 rounded-lg bg-token-foreground/5 px-2 py-0.5 text-base leading-6 font-medium tracking-[-0.13px] text-token-foreground`,disabled:re,children:ue})",
      "de=(0,X.jsx)(`button`,{type:`button`,\"data-codex-plus-project-selector-trigger\":!0,\"data-codex-plus-project-selector-variant\":`default`,className:`flex min-w-0 items-center gap-1.5 rounded-lg bg-token-foreground/5 px-2 py-0.5 text-base leading-6 font-medium tracking-[-0.13px] text-token-foreground`,disabled:re,children:ue})",
      "project selector shortcut final dropdown trigger anchor",
    );
  }
  if (text.includes("function sV(e){let t=(0,cV.c)(44),") && text.includes("function yV({activeProjectIdOverride:e,")) {
    let patched = replaceOnce(
      text,
      "function sV(e){let t=(0,cV.c)(44),",
      `${projectSelectorSearchHook()}function sV(e){let t=(0,cV.c)(44),`,
      "project selector fuzzy search adapter insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "let e=_.trim().toLowerCase();b=r.filter(t=>{if(!e)return!0;let n=t.repositoryData?.rootFolder??``;return[t.label,n,t.path??``,t.hostDisplayName??``].some(t=>t.toLowerCase().includes(e))});",
      "b=CPXP.fuzzyFilter(r,_);",
      "project selector fuzzy search filter anchor",
    );
    patched = replaceOnce(
      patched,
      "w=(0,uV.jsx)(yl,{value:_,onChange:s,placeholder:c,className:`mb-1`})",
      "w=(0,uV.jsx)(yl,{value:_,onChange:s,onKeyDown:e=>CPXP.acceptFirst(e,b,o,_),placeholder:c,className:`mb-1`})",
      "project selector accept first match keydown anchor",
    );
    patched = replaceOnce(
      patched,
      "(0,uV.jsx)(`span`,{className:`truncate`,children:e.label})",
      "(0,uV.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,_,uV.jsx)})",
      "project selector fuzzy search highlight anchor",
    );
    patched = replaceOnce(
      patched,
      "function yV({activeProjectIdOverride:e,",
      `${projectSelectorTriggerHook("SV")}function yV({activeProjectIdOverride:e,`,
      "project selector shortcut helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "triggerButton:u??Ce(),contentWidth:`menu`",
      "triggerButton:CPXPST(u??Ce(),s),contentWidth:`menu`",
      "project selector empty trigger anchor",
    );
    return replaceOnce(
      patched,
      "triggerButton:u??(s===`hero`?we():s===`home`?Ce():be()),contentWidth:`workspace`",
      "triggerButton:CPXPST(u??(s===`hero`?we():s===`home`?Ce():be()),s),contentWidth:`workspace`",
      "project selector shortcut final dropdown trigger anchor",
    );
  }
  if (text.includes("function Ze(e){let t=(0,Qe.c)(44),") && text.includes("function gt({activeProjectIdOverride:e,")) {
    let patched = replaceOnce(
      text,
      "function Ze(e){let t=(0,Qe.c)(44),",
      `${projectSelectorSearchHook()}function Ze(e){let t=(0,Qe.c)(44),`,
      "project selector fuzzy search adapter insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "let e=v.trim().toLowerCase();x=r.filter(t=>{if(!e)return!0;let n=t.repositoryData?.rootFolder??``;return[t.label,n,t.path??``,t.hostDisplayName??``].some(t=>t.toLowerCase().includes(e))});",
      "x=CPXP.fuzzyFilter(r,v);",
      "project selector fuzzy search filter anchor",
    );
    patched = replaceOnce(
      patched,
      "T=(0,X.jsx)(ne,{value:v,onChange:s,placeholder:c,className:`mb-1`})",
      "T=(0,X.jsx)(ne,{value:v,onChange:s,onKeyDown:e=>CPXP.acceptFirst(e,x,o,v),placeholder:c,className:`mb-1`})",
      "project selector accept first match keydown anchor",
    );
    patched = replaceOnce(
      patched,
      "(0,X.jsx)(`span`,{className:`truncate`,children:e.label})",
      "(0,X.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,v,X.jsx)})",
      "project selector fuzzy search highlight anchor",
    );
    patched = replaceOnce(
      patched,
      "function gt({activeProjectIdOverride:e,",
      `${projectSelectorTriggerHook("$")}function gt({activeProjectIdOverride:e,`,
      "project selector shortcut helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "triggerButton:v??Qe(),contentWidth:`menu`",
      "triggerButton:CPXPST(v??Qe(),d),contentWidth:`menu`",
      "project selector empty trigger anchor",
    );
    return replaceOnce(
      patched,
      "triggerButton:v??(d===`hero`?$e():d===`home`?Qe():J()),contentWidth:`workspace`",
      "triggerButton:CPXPST(v??(d===`hero`?$e():d===`home`?Qe():J()),d),contentWidth:`workspace`",
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
  if (
    text.includes("function hte(){let e=(0,zA.c)(3),t,n;") &&
    !text.includes("activeProjectIdOverride") &&
    !text.includes("function qH({activeProjectIdOverride:e,")
  ) {
    return text;
  }
  if (text.includes("function iV({activeProjectIdOverride:e,")) {
    let patched = replaceOnce(
      text,
      "function iV({activeProjectIdOverride:e,",
      `${projectSelectorSearchHook()}${projectSelectorTriggerHook("oV")}function iV({activeProjectIdOverride:e,`,
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
      "w=(0,YB.jsx)(Ql,{value:_,onChange:s,placeholder:c,className:`mb-1`})",
      "w=(0,YB.jsx)(Ql,{value:_,onChange:s,onKeyDown:e=>CPXP.acceptFirst(e,b,o,_),placeholder:c,className:`mb-1`})",
      "home project selector accept first match keydown anchor",
    );
    patched = replaceOnce(
      patched,
      "(0,YB.jsx)(`span`,{className:`truncate`,children:e.label})",
      "(0,YB.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,_,YB.jsx)})",
      "home project selector fuzzy search highlight anchor",
    );
    patched = replaceOnce(
      patched,
      "children:(0,sV.jsxs)(Fc,{size:`composerSm`,color:`ghost`,className:`min-w-0`,children:",
      "children:(0,sV.jsxs)(Fc,{\"data-codex-plus-project-selector-trigger\":!0,\"data-codex-plus-project-selector-variant\":s,size:`composerSm`,color:`ghost`,className:`min-w-0`,children:",
      "home project selector default button marker anchor",
    );
    patched = replaceOnce(
      patched,
      "children:(0,sV.jsx)(yA,{categoryLabel:(0,sV.jsx)(X,{id:`composer.localCwdDropdown.footerCategory`",
      "children:(0,sV.jsx)(yA,{\"data-codex-plus-project-selector-trigger\":!0,\"data-codex-plus-project-selector-variant\":s,categoryLabel:(0,sV.jsx)(X,{id:`composer.localCwdDropdown.footerCategory`",
      "home project selector footer button marker anchor",
    );
    patched = replaceOnce(
      patched,
      "Ce=()=>(0,sV.jsxs)(`button`,{className:pu(`heading-xl text-token-text-tertiary",
      "Ce=()=>(0,sV.jsxs)(`button`,{\"data-codex-plus-project-selector-trigger\":!0,\"data-codex-plus-project-selector-variant\":s,className:pu(`heading-xl text-token-text-tertiary",
      "home project selector hero button marker anchor",
    );
    patched = replaceOnce(
      patched,
      "triggerButton:u??Se(),contentWidth:`menu`",
      "triggerButton:CPXPST(u??Se(),s),contentWidth:`menu`",
      "home project selector empty trigger anchor",
    );
    return replaceOnce(
      patched,
      "triggerButton:u??(s===`hero`?Ce():s===`home`?Se():ye()),contentWidth:`workspace`",
      "triggerButton:CPXPST(u??(s===`hero`?Ce():s===`home`?Se():ye()),s),contentWidth:`workspace`",
      "home project selector shortcut final dropdown trigger anchor",
    );
  }
  if (text.includes("function qH({activeProjectIdOverride:e,")) {
    let patched = replaceOnce(
      text,
      "function qH({activeProjectIdOverride:e,",
      `${projectSelectorSearchHook()}${projectSelectorTriggerHook("YH")}function qH({activeProjectIdOverride:e,`,
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
      "w=(0,RH.jsx)(oc,{value:_,onChange:s,placeholder:c,className:`mb-1`})",
      "w=(0,RH.jsx)(oc,{value:_,onChange:s,onKeyDown:e=>CPXP.acceptFirst(e,b,o,_),placeholder:c,className:`mb-1`})",
      "home project selector accept first match keydown anchor",
    );
    patched = replaceOnce(
      patched,
      "(0,RH.jsx)(`span`,{className:`truncate`,children:e.label})",
      "(0,RH.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,_,RH.jsx)})",
      "home project selector fuzzy search highlight anchor",
    );
    patched = replaceOnce(
      patched,
      "children:(0,XH.jsxs)(Ji,{size:`composerSm`,color:`ghost`,className:`min-w-0`,children:",
      "children:(0,XH.jsxs)(Ji,{\"data-codex-plus-project-selector-trigger\":!0,\"data-codex-plus-project-selector-variant\":s,size:`composerSm`,color:`ghost`,className:`min-w-0`,children:",
      "home project selector default button marker anchor",
    );
    patched = replaceOnce(
      patched,
      "children:(0,XH.jsx)(gv,{categoryLabel:(0,XH.jsx)(Y,{id:`composer.localCwdDropdown.footerCategory`",
      "children:(0,XH.jsx)(gv,{\"data-codex-plus-project-selector-trigger\":!0,\"data-codex-plus-project-selector-variant\":s,categoryLabel:(0,XH.jsx)(Y,{id:`composer.localCwdDropdown.footerCategory`",
      "home project selector footer button marker anchor",
    );
    patched = replaceOnce(
      patched,
      "Ce=()=>(0,XH.jsxs)(`button`,{className:Qo(`heading-xl text-token-text-tertiary",
      "Ce=()=>(0,XH.jsxs)(`button`,{\"data-codex-plus-project-selector-trigger\":!0,\"data-codex-plus-project-selector-variant\":s,className:Qo(`heading-xl text-token-text-tertiary",
      "home project selector hero button marker anchor",
    );
    patched = replaceOnce(
      patched,
      "triggerButton:u??Se(),contentWidth:`menu`",
      "triggerButton:CPXPST(u??Se(),s),contentWidth:`menu`",
      "home project selector empty trigger anchor",
    );
    return replaceOnce(
      patched,
      "triggerButton:u??(s===`hero`?Ce():s===`home`?Se():ye()),contentWidth:`workspace`",
      "triggerButton:CPXPST(u??(s===`hero`?Ce():s===`home`?Se():ye()),s),contentWidth:`workspace`",
      "home project selector shortcut final dropdown trigger anchor",
    );
  }
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
  if (
    text.includes("function Fn(e){let t=(0,In.c)(44),") &&
    text.includes("let e=b.trim().toLowerCase();C=r.filter(t=>{if(!e)return!0;let n=t.repositoryData?.rootFolder??``;return[t.label,n,t.path??``,t.hostDisplayName??``].some(t=>t.toLowerCase().includes(e))});")
  ) {
    let patched = replaceOnce(
      text,
      "function Fn(e){let t=(0,In.c)(44),",
      `${projectSelectorSearchHook()}function Fn(e){let t=(0,In.c)(44),`,
      "home project selector shortcut helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "let e=b.trim().toLowerCase();C=r.filter(t=>{if(!e)return!0;let n=t.repositoryData?.rootFolder??``;return[t.label,n,t.path??``,t.hostDisplayName??``].some(t=>t.toLowerCase().includes(e))});",
      "C=CPXP.fuzzyFilter(r,b);",
      "home project selector fuzzy search filter anchor",
    );
    patched = replaceOnce(
      patched,
      "O=(0,Z.jsx)(et,{value:b,onChange:s,placeholder:c,className:`mb-1`})",
      "O=(0,Z.jsx)(et,{value:b,onChange:s,onKeyDown:e=>CPXP.acceptFirst(e,C,o,b),placeholder:c,className:`mb-1`})",
      "home project selector accept first match keydown anchor",
    );
    return replaceOnce(
      patched,
      "(0,Z.jsx)(`span`,{className:`truncate`,children:e.label})",
      "(0,Z.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,b,Z.jsx)})",
      "home project selector fuzzy search highlight anchor",
    );
  }
  if (!text.includes("function St({activeProjectIdOverride:e,")) {
    return text;
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
  const staticRuntimeCommandIds = "[`codexPlus.focusProjectSelector`,`codexPlusToggleSidebarNameBlur`]";
  const runtimeCommandEntries = `...${staticRuntimeCommandIds}.map(e=>[e,()=>window.CodexPlus?.commands?.run?.(e)]),...(window.CodexPlus?.commands?.all?.()??[]).map(e=>[e.id,()=>window.CodexPlus?.commands?.run?.(e.id)])`;
  const registerStaticRuntimeCommands = (name) =>
    `(()=>{for(let e of ${staticRuntimeCommandIds})${name}(e,()=>window.CodexPlus?.commands?.run?.(e));for(let e of window.CodexPlus?.commands?.all?.()??[])${name}(e.id,()=>window.CodexPlus?.commands?.run?.(e.id))})()`;
  if (text.includes("Fi(`newThread`,S),")) {
    return replaceOnce(
      text,
      "Fi(`newThread`,S),",
      `Fi(\`newThread\`,S),${registerStaticRuntimeCommands("Fi")},`,
      "codex plus runtime command dispatch anchor",
    );
  }
  if (text.includes("Xi(`toggleSidebar`,r);")) {
    return replaceOnce(
      text,
      "Xi(`toggleSidebar`,r);",
      `Xi(\`toggleSidebar\`,r);${registerStaticRuntimeCommands("Xi")};`,
      "codex plus runtime command dispatch anchor",
    );
  }
  if (text.includes("Jy(`toggleSidebar`,r);")) {
    return replaceOnce(
      text,
      "Jy(`toggleSidebar`,r);",
      `Jy(\`toggleSidebar\`,r);${registerStaticRuntimeCommands("Jy")};`,
      "codex plus runtime command dispatch anchor",
    );
  }
  if (text.includes("tc(`toggleSidebar`,r);")) {
    return replaceOnce(
      text,
      "tc(`toggleSidebar`,r);",
      `tc(\`toggleSidebar\`,r);${registerStaticRuntimeCommands("tc")};`,
      "codex plus runtime command dispatch anchor",
    );
  }
  if (text.includes("uy(`toggleSidebar`,r);")) {
    return replaceOnce(
      text,
      "uy(`toggleSidebar`,r);",
      `uy(\`toggleSidebar\`,r);${registerStaticRuntimeCommands("uy")};`,
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
  const commandMapEntry = text.match(/\],\[`openFolder`,([A-Za-z_$][\w$]*)\],\[`toggleSidebar`,/);
  if (commandMapEntry) {
    return replaceOnce(
      text,
      `],[\`openFolder\`,${commandMapEntry[1]}],[\`toggleSidebar\`,`,
      `],[\`openFolder\`,${commandMapEntry[1]}],${runtimeCommandEntries},[\`toggleSidebar\`,`,
      "codex plus runtime command dispatch anchor",
    );
  }
  if (!text.includes("],[`openFolder`,()=>{r()}],[`toggleSidebar`,")) {
    return text;
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
