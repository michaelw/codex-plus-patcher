const { replaceOnce } = require("./replace");
const { projectSelectorSearchHook, projectSelectorTriggerHook } = require("./hooks/project-selector");

function patchLocalActiveWorkspaceRootDropdownProjectSelectorShortcut(text) {
  if (text.includes("function zr(e){let t=(0,Br.c)(44),") && text.includes("function si({activeProjectIdOverride:e,")) {
    let patched = replaceOnce(
      text,
      "function zr(e){let t=(0,Br.c)(44),",
      `${projectSelectorSearchHook()}${projectSelectorTriggerHook("$")}function zr(e){let t=(0,Br.c)(44),`,
      "project selector fuzzy search adapter insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "let e=y.trim().toLowerCase();S=r.filter(t=>{if(!e)return!0;let n=t.repositoryData?.rootFolder??``;return[t.label,n,t.path??``,t.hostDisplayName??``].some(t=>t.toLowerCase().includes(e))});",
      "S=CPXP.fuzzyFilter(r,y);",
      "project selector fuzzy search filter anchor",
    );
    patched = replaceOnce(
      patched,
      "O=(0,Z.jsx)(je,{value:y,onChange:s,placeholder:c,className:`mb-1`})",
      "O=(0,Z.jsx)(je,{value:y,onChange:s,onKeyDown:e=>CPXP.acceptFirst(e,S,o,y),placeholder:c,className:`mb-1`})",
      "project selector accept first match keydown anchor",
    );
    patched = replaceOnce(
      patched,
      "(0,Z.jsx)(`span`,{className:`truncate`,children:e.label})",
      "(0,Z.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,y,Z.jsx)})",
      "project selector fuzzy search highlight anchor",
    );
    patched = replaceOnce(
      patched,
      "L=c??g,R=e=>{b(e),l?.(e)},Ce=n&&s===`home`",
      "L=c??g,R=e=>{b(e),l?.(e)},CPXOH=CPXP.setOpenHandler(s,()=>{R(!0);return!0}),Ce=n&&s===`home`",
      "project selector controlled open handler anchor",
    );
    patched = replaceOnce(
      patched,
      "triggerButton:u,contentWidth:`menu`",
      "triggerButton:CPXPST(u,s),contentWidth:`menu`",
      "project selector empty trigger anchor",
    );
    return replaceOnce(
      patched,
      "triggerButton:u??(s===`hero`?Pe():Me()),contentWidth:`workspace`",
      "triggerButton:CPXPST(u??(s===`hero`?Pe():Me()),s),contentWidth:`workspace`",
      "project selector shortcut final dropdown trigger anchor",
    );
  }
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
      "Q=Ye(),_a=`icon-xs shrink-0 opacity-75 group-focus:opacity-100 group-hover:opacity-100`,CPXP=window.CodexPlusHost.adapters.projectSelector,CPXPST=(e,t)=>CPXP.trigger(e,t,ga),va=(0,ga.memo)(function(e){let t=(0,ha.c)(177),",
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
      "Ie=l??x,Re=e=>{e&&O(!1),T(e),p?.(e)},Be=n&&c===`home`&&P.length===0&&!F;",
      "Ie=l??x,Re=e=>{e&&O(!1),T(e),p?.(e)},CPXOH=CPXP.setOpenHandler(c,()=>{Re(!0);return!0}),Be=n&&c===`home`&&P.length===0&&!F;",
      "project selector controlled open handler anchor",
    );
    patched = replaceOnce(
      patched,
      "if(Be)return(0,$.jsxs)(m,{open:l,onOpenChange:Re",
      "if(Be)return(0,$.jsxs)(m,{open:Ie,onOpenChange:Re",
      "project selector empty controlled open anchor",
    );
    patched = replaceOnce(
      patched,
      "let $e=(0,$.jsx)(m,{open:l,onOpenChange:Re",
      "let $e=(0,$.jsx)(m,{open:Ie,onOpenChange:Re",
      "project selector workspace controlled open anchor",
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
      `${projectSelectorTriggerHook("xV")}function yV({activeProjectIdOverride:e,`,
      "project selector shortcut helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "le=D&&oe!=null,ue=c??p,z=e=>{e&&g(!1),m(e),l?.(e)},de=n&&s===`home`&&S.length===0&&!C;",
      "le=D&&oe!=null,ue=c??p,z=e=>{e&&g(!1),m(e),l?.(e)},CPXOH=CPXP.setOpenHandler(s,()=>{z(!0);return!0}),de=n&&s===`home`&&S.length===0&&!C;",
      "project selector controlled open handler anchor",
    );
    patched = replaceOnce(
      patched,
      "if(de)return(0,SV.jsxs)(wc,{open:c,onOpenChange:z",
      "if(de)return(0,SV.jsxs)(wc,{open:ue,onOpenChange:z",
      "project selector empty dropdown normalized open state anchor",
    );
    patched = replaceOnce(
      patched,
      "let Te=(0,SV.jsx)(wc,{open:c,onOpenChange:z",
      "let Te=(0,SV.jsx)(wc,{open:ue,onOpenChange:z",
      "project selector dropdown normalized open state anchor",
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
      `${projectSelectorTriggerHook("vt")}function gt({activeProjectIdOverride:e,`,
      "project selector shortcut helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "Ie=h??S,Le=e=>{e&&E(!1),w(e),_?.(e)},Re=n&&d===`home`",
      "Ie=h??S,Le=e=>{e&&E(!1),w(e),_?.(e)},CPXOH=CPXP.setOpenHandler(d,()=>{Le(!0);return!0}),Re=n&&d===`home`",
      "project selector controlled open handler anchor",
    );
    patched = replaceOnce(
      patched,
      "if(Re)return(0,$.jsxs)(re,{open:h,onOpenChange:Le",
      "if(Re)return(0,$.jsxs)(re,{open:Ie,onOpenChange:Le",
      "project selector empty controlled open anchor",
    );
    patched = replaceOnce(
      patched,
      "let X=(0,$.jsx)(re,{open:h,onOpenChange:Le",
      "let X=(0,$.jsx)(re,{open:Ie,onOpenChange:Le",
      "project selector workspace controlled open anchor",
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
  patched = replaceOnce(
    patched,
    "triggerButton:E}=e,",
    "triggerButton:E}=e,[CPXO,CPXS]=(0,Me.useState)(!1);f??=CPXO;let CPXN=g;g=e=>{CPXS(e),CPXN?.(e)};let CPXOH=CPXP.setOpenHandler(ee??`default`,()=>{g(!0);return!0}),",
    "project selector controlled open handler anchor",
  );
  return replaceOnce(
    patched,
    "t[73]!==O||t[74]!==f||t[75]!==g||t[76]!==Y||t[77]!==tt||t[78]!==X||t[79]!==$?(at=(0,H.jsx)(ye,{open:f,onOpenChange:g,onCloseAutoFocus:Y,align:tt,disabled:O,triggerButton:X,contentWidth:`workspace`,contentMaxHeight:`tall`,children:$}),t[73]=O,t[74]=f,t[75]=g,t[76]=Y,t[77]=tt,t[78]=X,t[79]=$,t[80]=at):at=t[80]",
    "t[73]!==O||t[74]!==f||t[75]!==g||t[76]!==Y||t[77]!==tt||t[78]!==X||t[79]!==$?(at=(0,H.jsx)(ye,{open:f,onOpenChange:g,onCloseAutoFocus:Y,align:tt,disabled:O,triggerButton:CPXPST(X,k),contentWidth:`workspace`,contentMaxHeight:`tall`,children:$}),t[73]=O,t[74]=f,t[75]=g,t[76]=Y,t[77]=tt,t[78]=X,t[79]=$,t[80]=at):at=t[80]",
    "project selector shortcut final dropdown trigger anchor",
  );
}

function patchHomeProjectDropdownProjectSelectorShortcut(text) {
  if (text.includes("function DWe(e){let t=(0,r0.c)(44),") && text.includes("function s0({activeProjectIdOverride:e,")) {
    let patched = replaceOnce(
      text,
      "function DWe(e){let t=(0,r0.c)(44),",
      `${projectSelectorSearchHook()}${projectSelectorTriggerHook("c0")}function DWe(e){let t=(0,r0.c)(44),`,
      "61608 home project selector helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "let e=_.trim().toLowerCase();b=r.filter(t=>{if(!e)return!0;let n=t.repositoryData?.rootFolder??``;return[t.label,n,t.path??``,t.hostDisplayName??``].some(t=>t.toLowerCase().includes(e))});",
      "b=CPXP.fuzzyFilter(r,_);",
      "61608 home project selector fuzzy search filter anchor",
    );
    patched = replaceOnce(
      patched,
      "w=(0,a0.jsx)(mde,{value:_,onChange:s,placeholder:c,className:`mb-1`})",
      "w=(0,a0.jsx)(mde,{value:_,onChange:s,onKeyDown:e=>CPXP.acceptFirst(e,b,o,_),placeholder:c,className:`mb-1`})",
      "61608 home project selector accept first match keydown anchor",
    );
    patched = replaceOnce(
      patched,
      "(0,a0.jsx)(`span`,{className:`truncate`,children:e.label})",
      "(0,a0.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,_,a0.jsx)})",
      "61608 home project selector fuzzy search highlight anchor",
    );
    patched = replaceOnce(
      patched,
      "G=c??p,ee=e=>{m(e),l?.(e)},te=n&&s===`home`",
      "G=c??p,ee=e=>{m(e),l?.(e)},CPXOH=CPXP.setOpenHandler(s,()=>{ee(!0);return!0}),te=n&&s===`home`",
      "61608 home project selector controlled open handler anchor",
    );
    patched = replaceOnce(
      patched,
      "(0,l0.jsx)(Ov,{open:c,onOpenChange:ee,onCloseAutoFocus:L,side:`top`,triggerButton:u,contentWidth:`menu`,",
      "(0,l0.jsx)(Ov,{open:G,onOpenChange:ee,onCloseAutoFocus:L,side:`top`,triggerButton:CPXPST(u,s),contentWidth:`menu`,",
      "61608 home project selector empty controlled trigger anchor",
    );
    return replaceOnce(
      patched,
      "let fe=(0,l0.jsx)(Ov,{open:c,onOpenChange:ee,onCloseAutoFocus:L,side:`top`,align:s===`hero`?`center`:`start`,disabled:i,triggerButton:u??(s===`hero`?ue():ce()),contentWidth:`workspace`,",
      "let fe=(0,l0.jsx)(Ov,{open:G,onOpenChange:ee,onCloseAutoFocus:L,side:`top`,align:s===`hero`?`center`:`start`,disabled:i,triggerButton:CPXPST(u??(s===`hero`?ue():ce()),s),contentWidth:`workspace`,",
      "61608 home project selector workspace controlled trigger anchor",
    );
  }
  if (text.includes("function _t(e){let t=(0,vt.c)(44),") && text.includes("function Ct({activeProjectIdOverride:e,")) {
    let patched = replaceOnce(
      text,
      "function _t(e){let t=(0,vt.c)(44),",
      `${projectSelectorSearchHook()}${projectSelectorTriggerHook("Tt")}function _t(e){let t=(0,vt.c)(44),`,
      "62119 home project selector helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "let e=x.trim().toLowerCase();C=r.filter(t=>{if(!e)return!0;let n=t.repositoryData?.rootFolder??``;return[t.label,n,t.path??``,t.hostDisplayName??``].some(t=>t.toLowerCase().includes(e))});",
      "C=CPXP.fuzzyFilter(r,x);",
      "62119 home project selector fuzzy search filter anchor",
    );
    patched = replaceOnce(
      patched,
      "D=(0,Q.jsx)(b,{value:x,onChange:o,placeholder:s,className:`mb-1`})",
      "D=(0,Q.jsx)(b,{value:x,onChange:o,onKeyDown:e=>CPXP.acceptFirst(e,C,c,x),placeholder:s,className:`mb-1`})",
      "62119 home project selector accept first match keydown anchor",
    );
    patched = replaceOnce(
      patched,
      "(0,Q.jsx)(`span`,{className:`truncate`,children:e.label})",
      "(0,Q.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,x,Q.jsx)})",
      "62119 home project selector fuzzy search highlight anchor",
    );
    patched = replaceOnce(
      patched,
      "H=p??ee,U=e=>{x(e),m?.(e)},je=n&&f===`home`",
      "H=p??ee,U=e=>{x(e),m?.(e)},CPXOH=CPXP.setOpenHandler(f,()=>{U(!0);return!0}),je=n&&f===`home`",
      "62119 home project selector controlled open handler anchor",
    );
    patched = replaceOnce(
      patched,
      "(0,$.jsx)(D,{open:p,onOpenChange:U,onCloseAutoFocus:I,side:`top`,triggerButton:h,contentWidth:`menu`,",
      "(0,$.jsx)(D,{open:H,onOpenChange:U,onCloseAutoFocus:I,side:`top`,triggerButton:CPXPST(h,f),contentWidth:`menu`,",
      "62119 home project selector empty controlled trigger anchor",
    );
    return replaceOnce(
      patched,
      "let Ge=(0,$.jsx)(D,{open:p,onOpenChange:U,onCloseAutoFocus:I,side:`top`,align:f===`hero`?`center`:`start`,disabled:c,triggerButton:h??(f===`hero`?He():Ve()),contentWidth:`workspace`,",
      "let Ge=(0,$.jsx)(D,{open:H,onOpenChange:U,onCloseAutoFocus:I,side:`top`,align:f===`hero`?`center`:`start`,disabled:c,triggerButton:CPXPST(h??(f===`hero`?He():Ve()),f),contentWidth:`workspace`,",
      "62119 home project selector workspace controlled trigger anchor",
    );
  }
  if (text.includes("function Sge(e){let t=(0,PX.c)(44),") && text.includes("function RX({activeProjectIdOverride:e,")) {
    let patched = replaceOnce(
      text,
      "function Sge(e){let t=(0,PX.c)(44),",
      `${projectSelectorSearchHook()}${projectSelectorTriggerHook("FX")}function Sge(e){let t=(0,PX.c)(44),`,
      "71524 home project selector helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "let e=v.trim().toLowerCase();x=r.filter(t=>{if(!e)return!0;let n=t.repositoryData?.rootFolder??``;return[t.label,n,t.path??``,t.hostDisplayName??``].some(t=>t.toLowerCase().includes(e))});",
      "x=CPXP.fuzzyFilter(r,v);",
      "71524 home project selector fuzzy search filter anchor",
    );
    patched = replaceOnce(
      patched,
      "T=(0,IX.jsx)(zu,{value:v,onChange:s,placeholder:c,className:`mb-1`})",
      "T=(0,IX.jsx)(zu,{value:v,onChange:s,onKeyDown:e=>CPXP.acceptFirst(e,x,o,v),placeholder:c,className:`mb-1`})",
      "71524 home project selector accept first match keydown anchor",
    );
    patched = replaceOnce(
      patched,
      "(0,IX.jsx)(`span`,{className:`truncate`,children:e.label})",
      "(0,IX.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,v,IX.jsx)})",
      "71524 home project selector fuzzy search highlight anchor",
    );
    patched = replaceOnce(
      patched,
      "W=c??p,ne=e=>{m(e),l?.(e)},re=n&&s===`home`",
      "W=c??p,ne=e=>{m(e),l?.(e)},CPXOH=CPXP.setOpenHandler(s,()=>{ne(!0);return!0}),re=n&&s===`home`",
      "71524 home project selector controlled open handler anchor",
    );
    patched = replaceOnce(
      patched,
      "(0,BX.jsx)(Ja,{open:c,onOpenChange:ne,onCloseAutoFocus:z,side:`top`,triggerButton:u,contentWidth:`menu`,",
      "(0,BX.jsx)(Ja,{open:W,onOpenChange:ne,onCloseAutoFocus:z,side:`top`,triggerButton:CPXPST(u,s),contentWidth:`menu`,",
      "71524 home project selector empty controlled trigger anchor",
    );
    return replaceOnce(
      patched,
      "(0,BX.jsx)(Ja,{open:c,onOpenChange:ne,onCloseAutoFocus:z,side:`top`,align:s===`hero`?`center`:`start`,disabled:i,triggerButton:u??(s===`hero`?me():fe()),contentWidth:`workspace`,",
      "(0,BX.jsx)(Ja,{open:W,onOpenChange:ne,onCloseAutoFocus:z,side:`top`,align:s===`hero`?`center`:`start`,disabled:i,triggerButton:CPXPST(u??(s===`hero`?me():fe()),s),contentWidth:`workspace`,",
      "71524 home project selector workspace controlled trigger anchor",
    );
  }
  if (text.includes("function CNt(e){let t=(0,wNt.c)(44),") && text.includes("function zNt({activeProjectIdOverride:e,")) {
    let patched = replaceOnce(
      text,
      "function CNt(e){let t=(0,wNt.c)(44),",
      `${projectSelectorSearchHook()}${projectSelectorTriggerHook("Q9")}function CNt(e){let t=(0,wNt.c)(44),`,
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
      "w=(0,W9.jsx)(Z7,{value:_,onChange:s,placeholder:c,className:`mb-1`})",
      "w=(0,W9.jsx)(Z7,{value:_,onChange:s,onKeyDown:e=>CPXP.acceptFirst(e,b,o,_),placeholder:c,className:`mb-1`})",
      "home project selector accept first match keydown anchor",
    );
    patched = replaceOnce(
      patched,
      "(0,W9.jsx)(`span`,{className:`truncate`,children:e.label})",
      "(0,W9.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,_,W9.jsx)})",
      "home project selector fuzzy search highlight anchor",
    );
    patched = replaceOnce(
      patched,
      "se=c??p,ce=e=>{m(e),l?.(e)},le=n&&s===`home`",
      "se=c??p,ce=e=>{m(e),l?.(e)},CPXOH=CPXP.setOpenHandler(s,()=>{ce(!0);return!0}),le=n&&s===`home`",
      "home project selector controlled open handler anchor",
    );
    patched = replaceOnce(
      patched,
      "children:(0,$9.jsx)(F9,{className:`min-w-0`,",
      "children:(0,$9.jsx)(F9,{\"data-codex-plus-project-selector-trigger\":!0,\"data-codex-plus-project-selector-variant\":s,className:`min-w-0`,",
      "home project selector native utility trigger anchor",
    );
    patched = replaceOnce(
      patched,
      "be=()=>(0,$9.jsxs)(`button`,{className:",
      "be=()=>(0,$9.jsxs)(`button`,{\"data-codex-plus-project-selector-trigger\":!0,\"data-codex-plus-project-selector-variant\":s,className:",
      "home project selector native hero trigger anchor",
    );
    patched = replaceOnce(
      patched,
      "(0,$9.jsx)(Q7,{open:c,onOpenChange:ce,onCloseAutoFocus:I,side:`top`,triggerButton:u,contentWidth:`menu`,",
      "(0,$9.jsx)(Q7,{open:se,onOpenChange:ce,onCloseAutoFocus:I,side:`top`,triggerButton:CPXPST(u,s),contentWidth:`menu`,",
      "home project selector empty controlled trigger anchor",
    );
    return replaceOnce(
      patched,
      "(0,$9.jsx)(Q7,{open:c,onOpenChange:ce,onCloseAutoFocus:I,side:`top`,align:s===`hero`?`center`:`start`,disabled:i,triggerButton:u??(s===`hero`?be():ve()),contentWidth:`workspace`,",
      "(0,$9.jsx)(Q7,{open:se,onOpenChange:ce,onCloseAutoFocus:I,side:`top`,align:s===`hero`?`center`:`start`,disabled:i,triggerButton:CPXPST(u??(s===`hero`?be():ve()),s),contentWidth:`workspace`,",
      "home project selector workspace controlled trigger anchor",
    );
  }
  if (text.includes("function XY(e){let t=(0,ZY.c)(44),") && text.includes("function rX({activeProjectIdOverride:e,")) {
    let patched = replaceOnce(
      text,
      "function XY(e){let t=(0,ZY.c)(44),",
      `${projectSelectorSearchHook()}function XY(e){let t=(0,ZY.c)(44),`,
      "home project selector fuzzy search adapter insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "let e=_.trim().toLowerCase();b=r.filter(t=>{if(!e)return!0;let n=t.repositoryData?.rootFolder??``;return[t.label,n,t.path??``,t.hostDisplayName??``].some(t=>t.toLowerCase().includes(e))});",
      "b=CPXP.fuzzyFilter(r,_);",
      "home project selector fuzzy search filter anchor",
    );
    patched = replaceOnce(
      patched,
      "w=(0,$Y.jsx)(mee,{value:_,onChange:s,placeholder:c,className:`mb-1`})",
      "w=(0,$Y.jsx)(mee,{value:_,onChange:s,onKeyDown:e=>CPXP.acceptFirst(e,b,o,_),placeholder:c,className:`mb-1`})",
      "home project selector accept first match keydown anchor",
    );
    patched = replaceOnce(
      patched,
      "(0,$Y.jsx)(`span`,{className:`truncate`,children:e.label})",
      "(0,$Y.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,_,$Y.jsx)})",
      "home project selector fuzzy search highlight anchor",
    );
    patched = replaceOnce(
      patched,
      "function rX({activeProjectIdOverride:e,",
      `${projectSelectorTriggerHook("aX")}function rX({activeProjectIdOverride:e,`,
      "home project selector shortcut helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "W=c??p,te=e=>{m(e),l?.(e)},ne=n&&s===`home`",
      "W=c??p,te=e=>{m(e),l?.(e)},CPX_openHandler=CPXP.setOpenHandler(s,()=>{te(!0);return!0}),ne=n&&s===`home`",
      "home project selector controlled open handler anchor",
    );
    return replaceOnce(
      patched,
      "triggerButton:u??(s===`hero`?pe():de()),contentWidth:`workspace`,contentMaxHeight:`tall`,children:me})",
      "triggerButton:CPXPST(u??(s===`hero`?pe():de()),s),contentWidth:`workspace`,contentMaxHeight:`tall`,children:me})",
      "home project selector workspace trigger anchor",
    );
  }
  if (text.includes("function MZ({activeProjectIdOverride:e,")) {
    let patched = replaceOnce(
      text,
      "function wVe(e){let t=(0,OZ.c)(44),",
      `${projectSelectorSearchHook()}function wVe(e){let t=(0,OZ.c)(44),`,
      "home project selector fuzzy search adapter insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "let e=_.trim().toLowerCase();x=r.filter(t=>{if(!e)return!0;let n=t.repositoryData?.rootFolder??``;return[t.label,n,t.path??``,t.hostDisplayName??``].some(t=>t.toLowerCase().includes(e))});",
      "x=CPXP.fuzzyFilter(r,_);",
      "home project selector fuzzy search filter anchor",
    );
    patched = replaceOnce(
      patched,
      "T=(0,AZ.jsx)(vie,{value:_,onChange:s,placeholder:c,className:`mb-1`})",
      "T=(0,AZ.jsx)(vie,{value:_,onChange:s,onKeyDown:e=>CPXP.acceptFirst(e,x,o,_),placeholder:c,className:`mb-1`})",
      "home project selector accept first match keydown anchor",
    );
    patched = replaceOnce(
      patched,
      "(0,AZ.jsx)(`span`,{className:`truncate`,children:e.label})",
      "(0,AZ.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,_,AZ.jsx)})",
      "home project selector fuzzy search highlight anchor",
    );
    patched = replaceOnce(
      patched,
      "function MZ({activeProjectIdOverride:e,",
      `${projectSelectorTriggerHook("NZ")}function MZ({activeProjectIdOverride:e,`,
      "home project selector shortcut helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "children:(0,PZ.jsx)(upe,{className:`min-w-0`,\"data-composer-navigation-target\":`workspace-project`,",
      "children:(0,PZ.jsx)(upe,{\"data-codex-plus-project-selector-trigger\":!0,\"data-codex-plus-project-selector-variant\":s,className:`min-w-0`,\"data-composer-navigation-target\":`workspace-project`,",
      "home project selector native utility trigger anchor",
    );
    patched = replaceOnce(
      patched,
      "pe=()=>(0,PZ.jsxs)(`button`,{className:wi(`heading-xl text-token-text-tertiary",
      "pe=()=>(0,PZ.jsxs)(`button`,{\"data-codex-plus-project-selector-trigger\":!0,\"data-codex-plus-project-selector-variant\":s,className:wi(`heading-xl text-token-text-tertiary",
      "home project selector native hero trigger anchor",
    );
    patched = replaceOnce(
      patched,
      "if(s===`home`&&u==null)return",
      "CPXP.setOpenHandler(s,()=>{ne(!0);return!0});if(s===`home`&&u==null)return",
      "home project selector controlled open handler anchor",
    );
    return replaceOnce(
      patched,
      "triggerButton:u??(s===`hero`?pe():de()),contentWidth:`workspace`,contentMaxHeight:`tall`,children:me})",
      "triggerButton:CPXPST(u??(s===`hero`?pe():de()),s),contentWidth:`workspace`,contentMaxHeight:`tall`,children:me})",
      "home project selector workspace trigger anchor",
    );
  }
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
      "V=c??p,ue=e=>{e&&g(!1),m(e),l?.(e)},de=n&&s===`home`",
      "V=c??p,ue=e=>{e&&g(!1),m(e),l?.(e)},CPXOH=CPXP.setOpenHandler(s,()=>{ue(!0);return!0}),de=n&&s===`home`",
      "home project selector controlled open handler anchor",
    );
    patched = replaceOnce(
      patched,
      "if(de)return(0,sV.jsxs)(Fl,{open:c,onOpenChange:ue",
      "if(de)return(0,sV.jsxs)(Fl,{open:V,onOpenChange:ue",
      "home project selector empty controlled open anchor",
    );
    patched = replaceOnce(
      patched,
      "let we=(0,sV.jsx)(Fl,{open:c,onOpenChange:ue",
      "let we=(0,sV.jsx)(Fl,{open:V,onOpenChange:ue",
      "home project selector workspace controlled open anchor",
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
      "le=c??p,ue=e=>{e&&g(!1),m(e),l?.(e)},de=n&&s===`home`",
      "le=c??p,ue=e=>{e&&g(!1),m(e),l?.(e)},CPXOH=CPXP.setOpenHandler(s,()=>{ue(!0);return!0}),de=n&&s===`home`",
      "home project selector controlled open handler anchor",
    );
    patched = replaceOnce(
      patched,
      "if(de)return(0,XH.jsxs)(_o,{open:c,onOpenChange:ue",
      "if(de)return(0,XH.jsxs)(_o,{open:le,onOpenChange:ue",
      "home project selector empty controlled open anchor",
    );
    patched = replaceOnce(
      patched,
      "let we=(0,XH.jsx)(_o,{open:c,onOpenChange:ue",
      "let we=(0,XH.jsx)(_o,{open:le,onOpenChange:ue",
      "home project selector workspace controlled open anchor",
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
      `${projectSelectorSearchHook()}${projectSelectorTriggerHook("sr")}function zn(e){let t=(0,Bn.c)(44),`,
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
      "Ee=d??_,De=e=>{e&&x(!1),v(e),f?.(e)},Oe=n&&u===`home`",
      "Ee=d??_,De=e=>{e&&x(!1),v(e),f?.(e)},CPXOH=CPXP.setOpenHandler(u,()=>{De(!0);return!0}),Oe=n&&u===`home`",
      "home project selector controlled open handler anchor",
    );
    patched = replaceOnce(
      patched,
      "if(Oe)return(0,$.jsxs)(it,{open:d,onOpenChange:De",
      "if(Oe)return(0,$.jsxs)(it,{open:Ee,onOpenChange:De",
      "home project selector empty controlled open anchor",
    );
    patched = replaceOnce(
      patched,
      "let Be=(0,$.jsx)(it,{open:d,onOpenChange:De",
      "let Be=(0,$.jsx)(it,{open:Ee,onOpenChange:De",
      "home project selector workspace controlled open anchor",
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
    patched = replaceOnce(
      patched,
      "(0,Z.jsx)(`span`,{className:`truncate`,children:e.label})",
      "(0,Z.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,b,Z.jsx)})",
      "home project selector fuzzy search highlight anchor",
    );
    patched = replaceOnce(
      patched,
      "function tr({activeProjectIdOverride:e,",
      `${projectSelectorTriggerHook("rr")}function tr({activeProjectIdOverride:e,`,
      "81905 home project selector shortcut helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "Ne=l??x,Fe=e=>{e&&T(!1),C(e),p?.(e)},z=n&&c===`home`",
      "Ne=l??x,Fe=e=>{e&&T(!1),C(e),p?.(e)},CPXOH=CPXP.setOpenHandler(c,()=>{Fe(!0);return!0}),z=n&&c===`home`",
      "81905 home project selector controlled open handler anchor",
    );
    patched = replaceOnce(
      patched,
      "if(z)return(0,$.jsxs)(he,{open:l,onOpenChange:Fe",
      "if(z)return(0,$.jsxs)(he,{open:Ne,onOpenChange:Fe",
      "81905 home project selector empty controlled open anchor",
    );
    patched = replaceOnce(
      patched,
      "let Xe=(0,$.jsx)(he,{open:l,onOpenChange:Fe",
      "let Xe=(0,$.jsx)(he,{open:Ne,onOpenChange:Fe",
      "81905 home project selector workspace controlled open anchor",
    );
    patched = replaceOnce(
      patched,
      "triggerButton:_??Je(),contentWidth:`menu`",
      "triggerButton:CPXPST(_??Je(),c),contentWidth:`menu`",
      "81905 home project selector empty trigger anchor",
    );
    return replaceOnce(
      patched,
      "triggerButton:_??(c===`hero`?Ye():c===`home`?Je():We()),contentWidth:`workspace`",
      "triggerButton:CPXPST(_??(c===`hero`?Ye():c===`home`?Je():We()),c),contentWidth:`workspace`",
      "81905 home project selector workspace trigger anchor",
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
    "Pe=l??S,U=e=>{e&&A(!1),C(e),m?.(e)},Re=n&&c===`home`",
    "Pe=l??S,U=e=>{e&&A(!1),C(e),m?.(e)},CPXOH=CPXP.setOpenHandler(c,()=>{U(!0);return!0}),Re=n&&c===`home`",
    "home project selector controlled open handler anchor",
  );
  patched = replaceOnce(
    patched,
    "if(Re)return(0,$.jsxs)(ce,{open:l,onOpenChange:U",
    "if(Re)return(0,$.jsxs)(ce,{open:Pe,onOpenChange:U",
    "home project selector empty controlled open anchor",
  );
  patched = replaceOnce(
    patched,
    "let $e=(0,$.jsx)(ce,{open:l,onOpenChange:U",
    "let $e=(0,$.jsx)(ce,{open:Pe,onOpenChange:U",
    "home project selector workspace controlled open anchor",
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
  const runtimeCommandEntries = `...${staticRuntimeCommandIds}.map(e=>[e,()=>window.CodexPlusHost.adapters.commands.dispatch(e)]),...(window.CodexPlus.commands.all()).map(e=>[e.id,()=>window.CodexPlusHost.adapters.commands.dispatch(e.id)])`;
  const registerStaticRuntimeCommands = (name) =>
    `(()=>{for(let e of ${staticRuntimeCommandIds})${name}(e,()=>window.CodexPlusHost.adapters.commands.dispatch(e));for(let e of window.CodexPlus.commands.all())${name}(e.id,()=>window.CodexPlusHost.adapters.commands.dispatch(e.id))})()`;
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
