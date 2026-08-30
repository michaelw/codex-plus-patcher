const { replaceOnce } = require("./replace");
// Reuse is declared separately from the exact owner recorded by each wrapper.
const { patchSetUsesTransformVariant: patchSetOwnsTransformVariant } = require("./transform-ownership");
const { projectSelectorSearchHook, projectSelectorTriggerHook } = require("./hooks/project-selector");

function patchLocalActiveWorkspaceRootDropdownProjectSelectorShortcut(text, context = {}) {
  if (context.patchSetId === "chatgpt-26.825.41651-7345") {
    let patched = replaceOnce(text, "function jZo(e){let t=(0,FZo.c)(101),", `${projectSelectorSearchHook()}${projectSelectorTriggerHook("IZo")}function jZo(e){let t=(0,FZo.c)(101),`, "26.825.41651 project selector adapter insertion anchor");
    patched = replaceOnce(patched, 'M=(0,t1.jsx)(mZo,{"aria-label":n,"data-composer-navigation-target":`workspace-project`,', 'M=(0,t1.jsx)(mZo,{"aria-label":n,"data-codex-plus-project-selector-trigger":!0,"data-composer-navigation-target":`workspace-project`,', "26.825.41651 project selector visible trigger marker anchor");
    patched = replaceOnce(patched, "function SZo(e){let t=(0,CZo.c)(28),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l}=e,", "function SZo(e){let t=(0,CZo.c)(28),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l,onSearchKeyDown:CPXKD}=e,", "26.825.41651 project selector search key handler prop anchor");
    patched = replaceOnce(patched, "onKeyDown:p,onValueChange:l", "onKeyDown:e=>{p(e),CPXKD?.(e)},onValueChange:l", "26.825.41651 project selector search key handler mount anchor");
    patched = replaceOnce(patched, "children:(0,r1.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,r1.jsx)(`span`,{className:`truncate`,children:e.label}),i?.(e)]})", "children:(0,r1.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,r1.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,e.__codexPlusQuery,r1.jsx)}),i?.(e)]})", "26.825.41651 project selector fuzzy highlight anchor");
    patched = replaceOnce(patched, "o=s==null?void 0:TZo(s.projects,k,PZo)", "o=s==null?void 0:CPXP.fuzzyFilter(s.projects,k)", "26.825.41651 project selector fuzzy filter anchor");
    patched = replaceOnce(patched, "onSelect:()=>{E.current=!0,v(e.gizmo.id,t),N(!1)},children:t},e.gizmo.id)}),", "onSelect:()=>{E.current=!0,v(e.gizmo.id,t),N(!1)},children:CPXP.fuzzyHighlight(t,k,i1.jsx)},e.gizmo.id)}),", "26.825.41651 cloud project selector fuzzy highlight anchor");
    patched = replaceOnce(patched, "ue=s==null?null:(0,i1.jsx)(OZo,{groups:d??[],selectedProjectIds:c==null?[]:[c],getProjectDetails:MZo,onSelectProject:e=>{E.current=!0,s.onSelectProject(e),N(!1)}})", "ue=s==null?null:(0,i1.jsx)(OZo,{groups:(d??[]).map(e=>({...e,__codexPlusQuery:k})),selectedProjectIds:c==null?[]:[c],getProjectDetails:MZo,onSelectProject:e=>{E.current=!0,s.onSelectProject(e),N(!1)}})", "26.825.41651 project selector highlight query mount anchor");
    patched = replaceOnce(patched, "U=(0,i1.jsx)(SZo,{searchQuery:k,onSearchQueryChange:A,hasProjectItems:(d?.length??0)+f.length>0,", "U=(0,i1.jsx)(SZo,{searchQuery:k,onSearchQueryChange:A,onSearchKeyDown:e=>CPXP.acceptFirst(e,d,e=>{let t=s?.projects.find(t=>t.projectId===e);t&&(E.current=!0,s.onSelectProject(t),N(!1))},k),hasProjectItems:(d?.length??0)+f.length>0,", "26.825.41651 project selector accept first anchor");
    patched = replaceOnce(patched, "let N=M,P;t[2]===Symbol.for(`react.memo_cache_sentinel`)", "let N=M,CPXOH=CPXP.setOpenHandler(w,()=>{N(!0);return!0}),P;t[2]===Symbol.for(`react.memo_cache_sentinel`)", "26.825.41651 project selector controlled open handler anchor");
    patched = replaceOnce(patched, "triggerButton:m,onOpenChange:N,children:U", "triggerButton:CPXPST(m,w),onOpenChange:N,children:U", "26.825.41651 project selector hero trigger anchor");
    return replaceOnce(patched, "B=yZo,G=", "B=e=>CPXPST((0,i1.jsx)(yZo,e),w),G=", "26.825.41651 project selector default trigger anchor");
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.818.61809")) {
    let patched = replaceOnce(text, "function Lkc(e){let t=(0,Vkc.c)(92),", `${projectSelectorSearchHook()}${projectSelectorTriggerHook("Hkc")}function Lkc(e){let t=(0,Vkc.c)(92),`, "26.818.61809 project selector adapter insertion anchor");
    patched = replaceOnce(patched, 'j=(0,Ekc.jsx)(ykc,{"aria-label":n,"data-composer-navigation-target":`workspace-project`,', 'j=(0,Ekc.jsx)(ykc,{"aria-label":n,"data-codex-plus-project-selector-trigger":!0,"data-composer-navigation-target":`workspace-project`,', "26.818.61809 project selector visible trigger marker anchor");
    patched = replaceOnce(patched, "function Okc(e){let t=(0,kkc.c)(24),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l}=e,", "function Okc(e){let t=(0,kkc.c)(24),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l,onSearchKeyDown:CPXKD}=e,", "26.818.61809 project selector search key handler prop anchor");
    patched = replaceOnce(patched, "p=(0,H2.jsx)(Y$.Input,{className:`mb-1`,placeholder:f,value:s,onValueChange:l})", "p=(0,H2.jsx)(Y$.Input,{className:`mb-1`,placeholder:f,value:s,onValueChange:l,onKeyDown:CPXKD})", "26.818.61809 project selector search key handler mount anchor");
    patched = replaceOnce(patched, "children:(0,U2.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,U2.jsx)(`span`,{className:`truncate`,children:e.label}),i?.(e)]})", "children:(0,U2.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,U2.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,e.__codexPlusQuery,U2.jsx)}),i?.(e)]})", "26.818.61809 project selector fuzzy highlight anchor");
    patched = replaceOnce(patched, "o=s==null?void 0:jkc(s.projects,k,Bkc)", "o=s==null?void 0:CPXP.fuzzyFilter(s.projects,k)", "26.818.61809 project selector fuzzy filter anchor");
    patched = replaceOnce(patched, "onSelect:()=>{E.current=!0,v(e.gizmo.id,t),N(!1)},children:t},e.gizmo.id)}),", "onSelect:()=>{E.current=!0,v(e.gizmo.id,t),N(!1)},children:CPXP.fuzzyHighlight(t,k,W2.jsx)},e.gizmo.id)}),", "26.818.61809 cloud project selector fuzzy highlight anchor");
    patched = replaceOnce(patched, "ne=s==null?null:(0,W2.jsx)(Pkc,{groups:d??[],selectedProjectIds:c==null?[]:[c],getProjectDetails:Rkc,onSelectProject:e=>{E.current=!0,s.onSelectProject(e),N(!1)}})", "ne=s==null?null:(0,W2.jsx)(Pkc,{groups:(d??[]).map(e=>({...e,__codexPlusQuery:k})),selectedProjectIds:c==null?[]:[c],getProjectDetails:Rkc,onSelectProject:e=>{E.current=!0,s.onSelectProject(e),N(!1)}})", "26.818.61809 project selector highlight query mount anchor");
    patched = replaceOnce(patched, "U=(0,W2.jsx)(Okc,{searchQuery:k,onSearchQueryChange:A,hasProjectItems:(d?.length??0)+f.length>0,projectItems:(0,W2.jsxs)(W2.Fragment,{children:[I,ne]}),status:P,footerItems:te,emptyMessage:re})", "U=(0,W2.jsx)(Okc,{searchQuery:k,onSearchQueryChange:A,onSearchKeyDown:e=>CPXP.acceptFirst(e,d,e=>{let t=s?.projects.find(t=>t.projectId===e);t&&(E.current=!0,s.onSelectProject(t),N(!1))},k),hasProjectItems:(d?.length??0)+f.length>0,projectItems:(0,W2.jsxs)(W2.Fragment,{children:[I,ne]}),status:P,footerItems:te,emptyMessage:re})", "26.818.61809 project selector accept first anchor");
    patched = replaceOnce(patched, "let N=M,P;t[2]===Symbol.for(`react.memo_cache_sentinel`)", "let N=M,CPXOH=CPXP.setOpenHandler(w,()=>{N(!0);return!0}),P;t[2]===Symbol.for(`react.memo_cache_sentinel`)", "26.818.61809 project selector controlled open handler anchor");
    patched = replaceOnce(patched, "triggerButton:m,onOpenChange:N,children:U", "triggerButton:CPXPST(m,w),onOpenChange:N,children:U", "26.818.61809 project selector hero trigger anchor");
    return replaceOnce(patched, "B=wkc,K=", "B=e=>CPXPST((0,W2.jsx)(wkc,e),w),K=", "26.818.61809 project selector default trigger anchor");
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.818.22352")) {
    let patched = replaceOnce(text, "function eyc(e){let t=(0,iyc.c)(92),", `${projectSelectorSearchHook()}${projectSelectorTriggerHook("ayc")}function eyc(e){let t=(0,iyc.c)(92),`, "26.818.22352 project selector adapter insertion anchor");
    patched = replaceOnce(patched, 'j=(0,Uvc.jsx)(Ivc,{"aria-label":n,"data-composer-navigation-target":`workspace-project`,', 'j=(0,Uvc.jsx)(Ivc,{"aria-label":n,"data-codex-plus-project-selector-trigger":!0,"data-composer-navigation-target":`workspace-project`,', "26.818.22352 project selector visible trigger marker anchor");
    patched = replaceOnce(patched, "function Gvc(e){let t=(0,Kvc.c)(24),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l}=e,", "function Gvc(e){let t=(0,Kvc.c)(24),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l,onSearchKeyDown:CPXKD}=e,", "26.818.22352 project selector search key handler prop anchor");
    patched = replaceOnce(patched, "p=(0,s2.jsx)(K$.Input,{className:`mb-1`,placeholder:f,value:s,onValueChange:l})", "p=(0,s2.jsx)(K$.Input,{className:`mb-1`,placeholder:f,value:s,onValueChange:l,onKeyDown:CPXKD})", "26.818.22352 project selector search key handler mount anchor");
    patched = replaceOnce(patched, "children:(0,c2.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,c2.jsx)(`span`,{className:`truncate`,children:e.label}),i?.(e)]})", "children:(0,c2.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,c2.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,e.__codexPlusQuery,c2.jsx)}),i?.(e)]})", "26.818.22352 project selector fuzzy highlight anchor");
    patched = replaceOnce(patched, "o=s==null?void 0:Jvc(s.projects,k,ryc)", "o=s==null?void 0:CPXP.fuzzyFilter(s.projects,k)", "26.818.22352 project selector fuzzy filter anchor");
    patched = replaceOnce(patched, "onSelect:()=>{E.current=!0,v(e.gizmo.id,t),N(!1)},children:t},e.gizmo.id)}),", "onSelect:()=>{E.current=!0,v(e.gizmo.id,t),N(!1)},children:CPXP.fuzzyHighlight(t,k,l2.jsx)},e.gizmo.id)}),", "26.818.22352 cloud project selector fuzzy highlight anchor");
    patched = replaceOnce(patched, "ne=s==null?null:(0,l2.jsx)(Zvc,{groups:d??[],selectedProjectIds:c==null?[]:[c],getProjectDetails:tyc,onSelectProject:e=>{E.current=!0,s.onSelectProject(e),N(!1)}})", "ne=s==null?null:(0,l2.jsx)(Zvc,{groups:(d??[]).map(e=>({...e,__codexPlusQuery:k})),selectedProjectIds:c==null?[]:[c],getProjectDetails:tyc,onSelectProject:e=>{E.current=!0,s.onSelectProject(e),N(!1)}})", "26.818.22352 project selector highlight query mount anchor");
    patched = replaceOnce(patched, "U=(0,l2.jsx)(Gvc,{searchQuery:k,onSearchQueryChange:A,hasProjectItems:(d?.length??0)+f.length>0,projectItems:(0,l2.jsxs)(l2.Fragment,{children:[I,ne]}),status:P,footerItems:te,emptyMessage:re})", "U=(0,l2.jsx)(Gvc,{searchQuery:k,onSearchQueryChange:A,onSearchKeyDown:e=>CPXP.acceptFirst(e,d,e=>{let t=s?.projects.find(t=>t.projectId===e);t&&(E.current=!0,s.onSelectProject(t),N(!1))},k),hasProjectItems:(d?.length??0)+f.length>0,projectItems:(0,l2.jsxs)(l2.Fragment,{children:[I,ne]}),status:P,footerItems:te,emptyMessage:re})", "26.818.22352 project selector accept first anchor");
    patched = replaceOnce(patched, "let N=M,P;t[2]===Symbol.for(`react.memo_cache_sentinel`)", "let N=M,CPXOH=CPXP.setOpenHandler(w,()=>{N(!0);return!0}),P;t[2]===Symbol.for(`react.memo_cache_sentinel`)", "26.818.22352 project selector controlled open handler anchor");
    patched = replaceOnce(patched, "triggerButton:m,onOpenChange:N,children:U", "triggerButton:CPXPST(m,w),onOpenChange:N,children:U", "26.818.22352 project selector hero trigger anchor");
    return replaceOnce(patched, "B=Vvc,K=", "B=e=>CPXPST((0,l2.jsx)(Vvc,e),w),K=", "26.818.22352 project selector default trigger anchor");
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.818.31338")) {
    let patched = replaceOnce(text, "function syc(e){let t=(0,dyc.c)(92),", `${projectSelectorSearchHook()}${projectSelectorTriggerHook("fyc")}function syc(e){let t=(0,dyc.c)(92),`, "26.818.31338 project selector adapter insertion anchor");
    patched = replaceOnce(patched, 'j=(0,Xvc.jsx)(Uvc,{"aria-label":n,"data-composer-navigation-target":`workspace-project`,', 'j=(0,Xvc.jsx)(Uvc,{"aria-label":n,"data-codex-plus-project-selector-trigger":!0,"data-composer-navigation-target":`workspace-project`,', "26.818.31338 project selector visible trigger marker anchor");
    patched = replaceOnce(patched, "function Qvc(e){let t=(0,$vc.c)(24),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l}=e,", "function Qvc(e){let t=(0,$vc.c)(24),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l,onSearchKeyDown:CPXKD}=e,", "26.818.31338 project selector search key handler prop anchor");
    patched = replaceOnce(patched, "p=(0,s2.jsx)(K$.Input,{className:`mb-1`,placeholder:f,value:s,onValueChange:l})", "p=(0,s2.jsx)(K$.Input,{className:`mb-1`,placeholder:f,value:s,onValueChange:l,onKeyDown:CPXKD})", "26.818.31338 project selector search key handler mount anchor");
    patched = replaceOnce(patched, "children:(0,c2.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,c2.jsx)(`span`,{className:`truncate`,children:e.label}),i?.(e)]})", "children:(0,c2.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,c2.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,e.__codexPlusQuery,c2.jsx)}),i?.(e)]})", "26.818.31338 project selector fuzzy highlight anchor");
    patched = replaceOnce(patched, "o=s==null?void 0:tyc(s.projects,k,uyc)", "o=s==null?void 0:CPXP.fuzzyFilter(s.projects,k)", "26.818.31338 project selector fuzzy filter anchor");
    patched = replaceOnce(patched, "onSelect:()=>{E.current=!0,v(e.gizmo.id,t),N(!1)},children:t},e.gizmo.id)}),", "onSelect:()=>{E.current=!0,v(e.gizmo.id,t),N(!1)},children:CPXP.fuzzyHighlight(t,k,l2.jsx)},e.gizmo.id)}),", "26.818.31338 cloud project selector fuzzy highlight anchor");
    patched = replaceOnce(patched, "ne=s==null?null:(0,l2.jsx)(iyc,{groups:d??[],selectedProjectIds:c==null?[]:[c],getProjectDetails:cyc,onSelectProject:e=>{E.current=!0,s.onSelectProject(e),N(!1)}})", "ne=s==null?null:(0,l2.jsx)(iyc,{groups:(d??[]).map(e=>({...e,__codexPlusQuery:k})),selectedProjectIds:c==null?[]:[c],getProjectDetails:cyc,onSelectProject:e=>{E.current=!0,s.onSelectProject(e),N(!1)}})", "26.818.31338 project selector highlight query mount anchor");
    patched = replaceOnce(patched, "U=(0,l2.jsx)(Qvc,{searchQuery:k,onSearchQueryChange:A,hasProjectItems:(d?.length??0)+f.length>0,projectItems:(0,l2.jsxs)(l2.Fragment,{children:[I,ne]}),status:P,footerItems:te,emptyMessage:re})", "U=(0,l2.jsx)(Qvc,{searchQuery:k,onSearchQueryChange:A,onSearchKeyDown:e=>CPXP.acceptFirst(e,d,e=>{let t=s?.projects.find(t=>t.projectId===e);t&&(E.current=!0,s.onSelectProject(t),N(!1))},k),hasProjectItems:(d?.length??0)+f.length>0,projectItems:(0,l2.jsxs)(l2.Fragment,{children:[I,ne]}),status:P,footerItems:te,emptyMessage:re})", "26.818.31338 project selector accept first anchor");
    patched = replaceOnce(patched, "let N=M,P;t[2]===Symbol.for(`react.memo_cache_sentinel`)", "let N=M,CPXOH=CPXP.setOpenHandler(w,()=>{N(!0);return!0}),P;t[2]===Symbol.for(`react.memo_cache_sentinel`)", "26.818.31338 project selector controlled open handler anchor");
    patched = replaceOnce(patched, "triggerButton:m,onOpenChange:N,children:U", "triggerButton:CPXPST(m,w),onOpenChange:N,children:U", "26.818.31338 project selector hero trigger anchor");
    return replaceOnce(patched, "B=Jvc,K=", "B=e=>CPXPST((0,l2.jsx)(Jvc,e),w),K=", "26.818.31338 project selector default trigger anchor");
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.818.32112")) {
    let patched = replaceOnce(text, "function cyc(e){let t=(0,fyc.c)(92),", `${projectSelectorSearchHook()}${projectSelectorTriggerHook("pyc")}function cyc(e){let t=(0,fyc.c)(92),`, "26.818.32112 project selector adapter insertion anchor");
    patched = replaceOnce(patched, 'j=(0,Zvc.jsx)(Wvc,{"aria-label":n,"data-composer-navigation-target":`workspace-project`,', 'j=(0,Zvc.jsx)(Wvc,{"aria-label":n,"data-codex-plus-project-selector-trigger":!0,"data-composer-navigation-target":`workspace-project`,', "26.818.32112 project selector visible trigger marker anchor");
    patched = replaceOnce(patched, "function $vc(e){let t=(0,eyc.c)(24),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l}=e,", "function $vc(e){let t=(0,eyc.c)(24),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l,onSearchKeyDown:CPXKD}=e,", "26.818.32112 project selector search key handler prop anchor");
    patched = replaceOnce(patched, "p=(0,o2.jsx)(G$.Input,{className:`mb-1`,placeholder:f,value:s,onValueChange:l})", "p=(0,o2.jsx)(G$.Input,{className:`mb-1`,placeholder:f,value:s,onValueChange:l,onKeyDown:CPXKD})", "26.818.32112 project selector search key handler mount anchor");
    patched = replaceOnce(patched, "children:(0,s2.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,s2.jsx)(`span`,{className:`truncate`,children:e.label}),i?.(e)]})", "children:(0,s2.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,s2.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,e.__codexPlusQuery,s2.jsx)}),i?.(e)]})", "26.818.32112 project selector fuzzy highlight anchor");
    patched = replaceOnce(patched, "o=s==null?void 0:nyc(s.projects,k,dyc)", "o=s==null?void 0:CPXP.fuzzyFilter(s.projects,k)", "26.818.32112 project selector fuzzy filter anchor");
    patched = replaceOnce(patched, "onSelect:()=>{E.current=!0,v(e.gizmo.id,t),N(!1)},children:t},e.gizmo.id)}),", "onSelect:()=>{E.current=!0,v(e.gizmo.id,t),N(!1)},children:CPXP.fuzzyHighlight(t,k,c2.jsx)},e.gizmo.id)}),", "26.818.32112 cloud project selector fuzzy highlight anchor");
    patched = replaceOnce(patched, "ne=s==null?null:(0,c2.jsx)(ayc,{groups:d??[],selectedProjectIds:c==null?[]:[c],getProjectDetails:lyc,onSelectProject:e=>{E.current=!0,s.onSelectProject(e),N(!1)}})", "ne=s==null?null:(0,c2.jsx)(ayc,{groups:(d??[]).map(e=>({...e,__codexPlusQuery:k})),selectedProjectIds:c==null?[]:[c],getProjectDetails:lyc,onSelectProject:e=>{E.current=!0,s.onSelectProject(e),N(!1)}})", "26.818.32112 project selector highlight query mount anchor");
    patched = replaceOnce(patched, "U=(0,c2.jsx)($vc,{searchQuery:k,onSearchQueryChange:A,hasProjectItems:(d?.length??0)+f.length>0,projectItems:(0,c2.jsxs)(c2.Fragment,{children:[I,ne]}),status:P,footerItems:te,emptyMessage:re})", "U=(0,c2.jsx)($vc,{searchQuery:k,onSearchQueryChange:A,onSearchKeyDown:e=>CPXP.acceptFirst(e,d,e=>{let t=s?.projects.find(t=>t.projectId===e);t&&(E.current=!0,s.onSelectProject(t),N(!1))},k),hasProjectItems:(d?.length??0)+f.length>0,projectItems:(0,c2.jsxs)(c2.Fragment,{children:[I,ne]}),status:P,footerItems:te,emptyMessage:re})", "26.818.32112 project selector accept first anchor");
    patched = replaceOnce(patched, "let N=M,P;t[2]===Symbol.for(`react.memo_cache_sentinel`)", "let N=M,CPXOH=CPXP.setOpenHandler(w,()=>{N(!0);return!0}),P;t[2]===Symbol.for(`react.memo_cache_sentinel`)", "26.818.32112 project selector controlled open handler anchor");
    patched = replaceOnce(patched, "triggerButton:m,onOpenChange:N,children:U", "triggerButton:CPXPST(m,w),onOpenChange:N,children:U", "26.818.32112 project selector hero trigger anchor");
    return replaceOnce(patched, "B=Yvc,K=", "B=e=>CPXPST((0,c2.jsx)(Yvc,e),w),K=", "26.818.32112 project selector default trigger anchor");
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.818.41705")) {
    let patched = replaceOnce(text, "function Fkc(e){let t=(0,zkc.c)(92),", `${projectSelectorSearchHook()}${projectSelectorTriggerHook("Bkc")}function Fkc(e){let t=(0,zkc.c)(92),`, "26.818.41705 project selector adapter insertion anchor");
    patched = replaceOnce(patched, 'j=(0,wkc.jsx)(_kc,{"aria-label":n,"data-composer-navigation-target":`workspace-project`,', 'j=(0,wkc.jsx)(_kc,{"aria-label":n,"data-codex-plus-project-selector-trigger":!0,"data-composer-navigation-target":`workspace-project`,', "26.818.41705 project selector visible trigger marker anchor");
    patched = replaceOnce(patched, "function Ekc(e){let t=(0,Dkc.c)(24),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l}=e,", "function Ekc(e){let t=(0,Dkc.c)(24),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l,onSearchKeyDown:CPXKD}=e,", "26.818.41705 project selector search key handler prop anchor");
    patched = replaceOnce(patched, "p=(0,H2.jsx)(Y$.Input,{className:`mb-1`,placeholder:f,value:s,onValueChange:l})", "p=(0,H2.jsx)(Y$.Input,{className:`mb-1`,placeholder:f,value:s,onValueChange:l,onKeyDown:CPXKD})", "26.818.41705 project selector search key handler mount anchor");
    patched = replaceOnce(patched, "children:(0,U2.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,U2.jsx)(`span`,{className:`truncate`,children:e.label}),i?.(e)]})", "children:(0,U2.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,U2.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,e.__codexPlusQuery,U2.jsx)}),i?.(e)]})", "26.818.41705 project selector fuzzy highlight anchor");
    patched = replaceOnce(patched, "o=s==null?void 0:kkc(s.projects,k,Rkc)", "o=s==null?void 0:CPXP.fuzzyFilter(s.projects,k)", "26.818.41705 project selector fuzzy filter anchor");
    patched = replaceOnce(patched, "onSelect:()=>{E.current=!0,v(e.gizmo.id,t),N(!1)},children:t},e.gizmo.id)}),", "onSelect:()=>{E.current=!0,v(e.gizmo.id,t),N(!1)},children:CPXP.fuzzyHighlight(t,k,W2.jsx)},e.gizmo.id)}),", "26.818.41705 cloud project selector fuzzy highlight anchor");
    patched = replaceOnce(patched, "ne=s==null?null:(0,W2.jsx)(Mkc,{groups:d??[],selectedProjectIds:c==null?[]:[c],getProjectDetails:Ikc,onSelectProject:e=>{E.current=!0,s.onSelectProject(e),N(!1)}})", "ne=s==null?null:(0,W2.jsx)(Mkc,{groups:(d??[]).map(e=>({...e,__codexPlusQuery:k})),selectedProjectIds:c==null?[]:[c],getProjectDetails:Ikc,onSelectProject:e=>{E.current=!0,s.onSelectProject(e),N(!1)}})", "26.818.41705 project selector highlight query mount anchor");
    patched = replaceOnce(patched, "U=(0,W2.jsx)(Ekc,{searchQuery:k,onSearchQueryChange:A,hasProjectItems:(d?.length??0)+f.length>0,projectItems:(0,W2.jsxs)(W2.Fragment,{children:[I,ne]}),status:P,footerItems:te,emptyMessage:re})", "U=(0,W2.jsx)(Ekc,{searchQuery:k,onSearchQueryChange:A,onSearchKeyDown:e=>CPXP.acceptFirst(e,d,e=>{let t=s?.projects.find(t=>t.projectId===e);t&&(E.current=!0,s.onSelectProject(t),N(!1))},k),hasProjectItems:(d?.length??0)+f.length>0,projectItems:(0,W2.jsxs)(W2.Fragment,{children:[I,ne]}),status:P,footerItems:te,emptyMessage:re})", "26.818.41705 project selector accept first anchor");
    patched = replaceOnce(patched, "let N=M,P;t[2]===Symbol.for(`react.memo_cache_sentinel`)", "let N=M,CPXOH=CPXP.setOpenHandler(w,()=>{N(!0);return!0}),P;t[2]===Symbol.for(`react.memo_cache_sentinel`)", "26.818.41705 project selector controlled open handler anchor");
    patched = replaceOnce(patched, "triggerButton:m,onOpenChange:N,children:U", "triggerButton:CPXPST(m,w),onOpenChange:N,children:U", "26.818.41705 project selector hero trigger anchor");
    return replaceOnce(patched, "B=Skc,K=", "B=e=>CPXPST((0,W2.jsx)(Skc,e),w),K=", "26.818.41705 project selector default trigger anchor");
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.818.21641")) {
    let patched = replaceOnce(text, "function ivc(e){let t=(0,cvc.c)(92),", `${projectSelectorSearchHook()}${projectSelectorTriggerHook("lvc")}function ivc(e){let t=(0,cvc.c)(92),`, "26.818.21641 project selector adapter insertion anchor");
    patched = replaceOnce(patched, 'j=(0,q_c.jsx)(B_c,{"aria-label":n,"data-composer-navigation-target":`workspace-project`,', 'j=(0,q_c.jsx)(B_c,{"aria-label":n,"data-codex-plus-project-selector-trigger":!0,"data-composer-navigation-target":`workspace-project`,', "26.818.21641 project selector visible trigger marker anchor");
    patched = replaceOnce(patched, "function Y_c(e){let t=(0,X_c.c)(24),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l}=e,", "function Y_c(e){let t=(0,X_c.c)(24),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l,onSearchKeyDown:CPXKD}=e,", "26.818.21641 project selector search key handler prop anchor");
    patched = replaceOnce(patched, "p=(0,s2.jsx)(G$.Input,{className:`mb-1`,placeholder:f,value:s,onValueChange:l})", "p=(0,s2.jsx)(G$.Input,{className:`mb-1`,placeholder:f,value:s,onValueChange:l,onKeyDown:CPXKD})", "26.818.21641 project selector search key handler mount anchor");
    patched = replaceOnce(patched, "children:(0,c2.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,c2.jsx)(`span`,{className:`truncate`,children:e.label}),i?.(e)]})", "children:(0,c2.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,c2.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,e.__codexPlusQuery,c2.jsx)}),i?.(e)]})", "26.818.21641 project selector fuzzy highlight anchor");
    patched = replaceOnce(patched, "o=s==null?void 0:Q_c(s.projects,k,svc)", "o=s==null?void 0:CPXP.fuzzyFilter(s.projects,k)", "26.818.21641 project selector fuzzy filter anchor");
    patched = replaceOnce(patched, "onSelect:()=>{E.current=!0,v(e.gizmo.id,t),N(!1)},children:t},e.gizmo.id)})", "onSelect:()=>{E.current=!0,v(e.gizmo.id,t),N(!1)},children:CPXP.fuzzyHighlight(t,k,l2.jsx)},e.gizmo.id)})", "26.818.21641 cloud project selector fuzzy highlight anchor");
    patched = replaceOnce(patched, "ne=s==null?null:(0,l2.jsx)(tvc,{groups:d??[],selectedProjectIds:c==null?[]:[c],getProjectDetails:avc,onSelectProject:e=>{E.current=!0,s.onSelectProject(e),N(!1)}})", "ne=s==null?null:(0,l2.jsx)(tvc,{groups:(d??[]).map(e=>({...e,__codexPlusQuery:k})),selectedProjectIds:c==null?[]:[c],getProjectDetails:avc,onSelectProject:e=>{E.current=!0,s.onSelectProject(e),N(!1)}})", "26.818.21641 project selector highlight query mount anchor");
    patched = replaceOnce(patched, "U=(0,l2.jsx)(Y_c,{searchQuery:k,onSearchQueryChange:A,hasProjectItems:(d?.length??0)+f.length>0,projectItems:(0,l2.jsxs)(l2.Fragment,{children:[I,ne]}),status:P,footerItems:te,emptyMessage:re})", "U=(0,l2.jsx)(Y_c,{searchQuery:k,onSearchQueryChange:A,onSearchKeyDown:e=>CPXP.acceptFirst(e,d,e=>{let t=s?.projects.find(t=>t.projectId===e);t&&(E.current=!0,s.onSelectProject(t),N(!1))},k),hasProjectItems:(d?.length??0)+f.length>0,projectItems:(0,l2.jsxs)(l2.Fragment,{children:[I,ne]}),status:P,footerItems:te,emptyMessage:re})", "26.818.21641 project selector accept first anchor");
    patched = replaceOnce(patched, "let N=M,P;t[2]===Symbol.for(`react.memo_cache_sentinel`)", "let N=M,CPXOH=CPXP.setOpenHandler(w,()=>{N(!0);return!0}),P;t[2]===Symbol.for(`react.memo_cache_sentinel`)", "26.818.21641 project selector controlled open handler anchor");
    patched = replaceOnce(patched, "triggerButton:m,onOpenChange:N,children:U", "triggerButton:CPXPST(m,w),onOpenChange:N,children:U", "26.818.21641 project selector hero trigger anchor");
    return replaceOnce(patched, "B=G_c,K=", "B=e=>CPXPST((0,l2.jsx)(G_c,e),w),K=", "26.818.21641 project selector default trigger anchor");
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.814.41407")) {
    let patched = replaceOnce(text, "function _ac(e){let t=(0,xac.c)(92),", `${projectSelectorSearchHook()}${projectSelectorTriggerHook("Sac")}function _ac(e){let t=(0,xac.c)(92),`, "26.814.41407 project selector adapter insertion anchor");
    patched = replaceOnce(patched, 'j=(0,oac.jsx)($ic,{"aria-label":n,"data-composer-navigation-target":`workspace-project`,', 'j=(0,oac.jsx)($ic,{"aria-label":n,"data-codex-plus-project-selector-trigger":!0,"data-composer-navigation-target":`workspace-project`,', "26.814.41407 project selector visible trigger marker anchor");
    patched = replaceOnce(patched, "function cac(e){let t=(0,lac.c)(24),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l}=e,", "function cac(e){let t=(0,lac.c)(24),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l,onSearchKeyDown:CPXKD}=e,", "26.814.41407 project selector search key handler prop anchor");
    patched = replaceOnce(patched, "p=(0,F0.jsx)(b$.Input,{className:`mb-1`,placeholder:f,value:s,onValueChange:l})", "p=(0,F0.jsx)(b$.Input,{className:`mb-1`,placeholder:f,value:s,onValueChange:l,onKeyDown:CPXKD})", "26.814.41407 project selector search key handler mount anchor");
    patched = replaceOnce(patched, "children:(0,I0.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,I0.jsx)(`span`,{className:`truncate`,children:e.label}),i?.(e)]})", "children:(0,I0.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,I0.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,e.__codexPlusQuery,I0.jsx)}),i?.(e)]})", "26.814.41407 project selector fuzzy highlight anchor");
    patched = replaceOnce(patched, "o=s==null?void 0:dac(s.projects,k,bac)", "o=s==null?void 0:CPXP.fuzzyFilter(s.projects,k)", "26.814.41407 project selector fuzzy filter anchor");
    patched = replaceOnce(patched, "onSelect:()=>{E.current=!0,v(e.gizmo.id,t),N(!1)},children:t},e.gizmo.id)}),", "onSelect:()=>{E.current=!0,v(e.gizmo.id,t),N(!1)},children:CPXP.fuzzyHighlight(t,k,L0.jsx)},e.gizmo.id)}),", "26.814.41407 cloud project selector fuzzy highlight anchor");
    patched = replaceOnce(patched, "ne=s==null?null:(0,L0.jsx)(mac,{groups:d??[],selectedProjectIds:c==null?[]:[c],getProjectDetails:vac,onSelectProject:e=>{E.current=!0,s.onSelectProject(e),N(!1)}})", "ne=s==null?null:(0,L0.jsx)(mac,{groups:(d??[]).map(e=>({...e,__codexPlusQuery:k})),selectedProjectIds:c==null?[]:[c],getProjectDetails:vac,onSelectProject:e=>{E.current=!0,s.onSelectProject(e),N(!1)}})", "26.814.41407 project selector highlight query mount anchor");
    patched = replaceOnce(patched, "U=(0,L0.jsx)(cac,{searchQuery:k,onSearchQueryChange:A,hasProjectItems:(d?.length??0)+f.length>0,projectItems:(0,L0.jsxs)(L0.Fragment,{children:[I,ne]}),status:P,footerItems:te,emptyMessage:re})", "U=(0,L0.jsx)(cac,{searchQuery:k,onSearchQueryChange:A,onSearchKeyDown:e=>CPXP.acceptFirst(e,d,e=>{let t=s?.projects.find(t=>t.projectId===e);t&&(E.current=!0,s.onSelectProject(t),N(!1))},k),hasProjectItems:(d?.length??0)+f.length>0,projectItems:(0,L0.jsxs)(L0.Fragment,{children:[I,ne]}),status:P,footerItems:te,emptyMessage:re})", "26.814.41407 project selector accept first anchor");
    patched = replaceOnce(patched, "let N=M,P;t[2]===Symbol.for(`react.memo_cache_sentinel`)", "let N=M,CPXOH=CPXP.setOpenHandler(w,()=>{N(!0);return!0}),P;t[2]===Symbol.for(`react.memo_cache_sentinel`)", "26.814.41407 project selector controlled open handler anchor");
    patched = replaceOnce(patched, "triggerButton:m,onOpenChange:N,children:U", "triggerButton:CPXPST(m,w),onOpenChange:N,children:U", "26.814.41407 project selector hero trigger anchor");
    return replaceOnce(patched, "B=iac,K=", "B=e=>CPXPST((0,L0.jsx)(iac,e),w),K=", "26.814.41407 project selector default trigger anchor");
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.803.61601")) {
    let patched = replaceOnce(text, "function _ys(e){let t=(0,xys.c)(92),", `${projectSelectorSearchHook()}${projectSelectorTriggerHook("Sys")}function _ys(e){let t=(0,xys.c)(92),`, "26.803.61601 project selector adapter insertion anchor");
    patched = replaceOnce(patched, "function cys(e){let t=(0,lys.c)(24),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l}=e,", "function cys(e){let t=(0,lys.c)(24),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l,onSearchKeyDown:CPXKD}=e,", "26.803.61601 project selector search key handler prop anchor");
    patched = replaceOnce(patched, "p=(0,x0.jsx)(O$.Input,{className:`mb-1`,placeholder:f,value:s,onValueChange:l})", "p=(0,x0.jsx)(O$.Input,{className:`mb-1`,placeholder:f,value:s,onValueChange:l,onKeyDown:CPXKD})", "26.803.61601 project selector search key handler mount anchor");
    patched = replaceOnce(patched, "children:(0,S0.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,S0.jsx)(`span`,{className:`truncate`,children:e.label}),i?.(e)]})", "children:(0,S0.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,S0.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,e.__codexPlusQuery,S0.jsx)}),i?.(e)]})", "26.803.61601 project selector fuzzy highlight anchor");
    patched = replaceOnce(patched, "o=s==null?void 0:dys(s.projects,k,bys)", "o=s==null?void 0:CPXP.fuzzyFilter(s.projects,k)", "26.803.61601 project selector fuzzy filter anchor");
    patched = replaceOnce(patched, "onSelect:()=>{E.current=!0,v(e.gizmo.id,t),N(!1)},children:t},e.gizmo.id)})", "onSelect:()=>{E.current=!0,v(e.gizmo.id,t),N(!1)},children:CPXP.fuzzyHighlight(t,k,r0.jsx)},e.gizmo.id)})", "26.803.61601 cloud project selector fuzzy highlight anchor");
    patched = replaceOnce(patched, "re=s==null?null:(0,C0.jsx)(mys,{groups:d??[],selectedProjectIds:c==null?[]:[c],getProjectDetails:vys,onSelectProject:e=>{E.current=!0,s.onSelectProject(e),N(!1)}})", "re=s==null?null:(0,C0.jsx)(mys,{groups:(d??[]).map(e=>({...e,__codexPlusQuery:k})),selectedProjectIds:c==null?[]:[c],getProjectDetails:vys,onSelectProject:e=>{E.current=!0,s.onSelectProject(e),N(!1)}})", "26.803.61601 project selector highlight query mount anchor");
    patched = replaceOnce(patched, "U=(0,C0.jsx)(cys,{searchQuery:k,onSearchQueryChange:A,hasProjectItems:(d?.length??0)+f.length>0,projectItems:(0,C0.jsxs)(C0.Fragment,{children:[I,re]}),status:P,footerItems:ne,emptyMessage:ie})", "U=(0,C0.jsx)(cys,{searchQuery:k,onSearchQueryChange:A,onSearchKeyDown:e=>CPXP.acceptFirst(e,d,e=>{let t=s?.projects.find(t=>t.projectId===e);t&&(E.current=!0,s.onSelectProject(t),N(!1))},k),hasProjectItems:(d?.length??0)+f.length>0,projectItems:(0,C0.jsxs)(C0.Fragment,{children:[I,re]}),status:P,footerItems:ne,emptyMessage:ie})", "26.803.61601 project selector accept first anchor");
    patched = replaceOnce(patched, "let N=M,P;t[2]===Symbol.for(`react.memo_cache_sentinel`)", "let N=M,CPXOH=CPXP.setOpenHandler(w,()=>{N(!0);return!0}),P;t[2]===Symbol.for(`react.memo_cache_sentinel`)", "26.803.61601 project selector controlled open handler anchor");
    patched = replaceOnce(patched, "triggerButton:m,onOpenChange:N,children:U", "triggerButton:CPXPST(m,w),onOpenChange:N,children:U", "26.803.61601 project selector hero trigger anchor");
    return replaceOnce(patched, "B=iys,K=", "B=e=>CPXPST((0,r0.jsx)(iys,e),w),K=", "26.803.61601 project selector default trigger anchor");
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.810.41047")) {
    let patched = replaceOnce(text, "function tPs(e){let t=(0,aPs.c)(92),", `${projectSelectorSearchHook()}${projectSelectorTriggerHook("$Ps")}function tPs(e){let t=(0,aPs.c)(92),`, "26.810.41047 project selector adapter insertion anchor");
    patched = replaceOnce(patched, "function KNs(e){let t=(0,qNs.c)(24),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l}=e,", "function KNs(e){let t=(0,qNs.c)(24),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l,onSearchKeyDown:CPXKD}=e,", "26.810.41047 project selector search key handler prop anchor");
    patched = replaceOnce(patched, "p=(0,Z1.jsx)(d$.Input,{className:`mb-1`,placeholder:f,value:s,onValueChange:l})", "p=(0,Z1.jsx)(d$.Input,{className:`mb-1`,placeholder:f,value:s,onValueChange:l,onKeyDown:CPXKD})", "26.810.41047 project selector search key handler mount anchor");
    patched = replaceOnce(patched, "children:(0,Q1.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,Q1.jsx)(`span`,{className:`truncate`,children:e.label}),i?.(e)]})", "children:(0,Q1.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,Q1.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,e.__codexPlusQuery,Q1.jsx)}),i?.(e)]})", "26.810.41047 project selector fuzzy highlight anchor");
    patched = replaceOnce(patched, "o=s==null?void 0:YNs(s.projects,k,iPs)", "o=s==null?void 0:CPXP.fuzzyFilter(s.projects,k)", "26.810.41047 project selector fuzzy filter anchor");
    patched = replaceOnce(patched, "onSelect:()=>{E.current=!0,v(e.gizmo.id,t),N(!1)},children:t},e.gizmo.id)}),", "onSelect:()=>{E.current=!0,v(e.gizmo.id,t),N(!1)},children:CPXP.fuzzyHighlight(t,k,c1.jsx)},e.gizmo.id)}),", "26.810.41047 cloud project selector fuzzy highlight anchor");
    patched = replaceOnce(patched, "ne=s==null?null:(0,$1.jsx)(QNs,{groups:d??[],selectedProjectIds:c==null?[]:[c],getProjectDetails:nPs,onSelectProject:e=>{E.current=!0,s.onSelectProject(e),N(!1)}})", "ne=s==null?null:(0,$1.jsx)(QNs,{groups:(d??[]).map(e=>({...e,__codexPlusQuery:k})),selectedProjectIds:c==null?[]:[c],getProjectDetails:nPs,onSelectProject:e=>{E.current=!0,s.onSelectProject(e),N(!1)}})", "26.810.41047 project selector highlight query mount anchor");
    patched = replaceOnce(patched, "U=(0,$1.jsx)(KNs,{searchQuery:k,onSearchQueryChange:A,hasProjectItems:(d?.length??0)+f.length>0,projectItems:(0,$1.jsxs)($1.Fragment,{children:[I,ne]}),status:P,footerItems:te,emptyMessage:re})", "U=(0,$1.jsx)(KNs,{searchQuery:k,onSearchQueryChange:A,onSearchKeyDown:e=>CPXP.acceptFirst(e,d,e=>{let t=s?.projects.find(t=>t.projectId===e);t&&(E.current=!0,s.onSelectProject(t),N(!1))},k),hasProjectItems:(d?.length??0)+f.length>0,projectItems:(0,$1.jsxs)($1.Fragment,{children:[I,ne]}),status:P,footerItems:te,emptyMessage:re})", "26.810.41047 project selector accept first anchor");
    patched = replaceOnce(patched, "let N=M,P;t[2]===Symbol.for(`react.memo_cache_sentinel`)", "let N=M,CPXOH=CPXP.setOpenHandler(w,()=>{N(!0);return!0}),P;t[2]===Symbol.for(`react.memo_cache_sentinel`)", "26.810.41047 project selector controlled open handler anchor");
    patched = replaceOnce(patched, "triggerButton:m,onOpenChange:N,children:U", "triggerButton:CPXPST(m,w),onOpenChange:N,children:U", "26.810.41047 project selector hero trigger anchor");
    return replaceOnce(patched, "B=HNs,K=", "B=e=>CPXPST((0,c1.jsx)(HNs,e),w),K=", "26.810.41047 project selector default trigger anchor");
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.810.52044")) {
    let patched = replaceOnce(
      text,
      "function JPs(e){let t=(0,QPs.c)(92),",
      `${projectSelectorSearchHook()}${projectSelectorTriggerHook("$Ps")}function JPs(e){let t=(0,QPs.c)(92),`,
      "26.810.52044 project selector adapter insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "function zPs(e){let t=(0,BPs.c)(24),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l}=e,",
      "function zPs(e){let t=(0,BPs.c)(24),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l,onSearchKeyDown:CPXKD}=e,",
      "26.810.52044 project selector search key handler prop anchor",
    );
    patched = replaceOnce(
      patched,
      "p=(0,o1.jsx)(oQ.Input,{className:`mb-1`,placeholder:f,value:s,onValueChange:l})",
      "p=(0,o1.jsx)(oQ.Input,{className:`mb-1`,placeholder:f,value:s,onValueChange:l,onKeyDown:CPXKD})",
      "26.810.52044 project selector search key handler mount anchor",
    );
    patched = replaceOnce(
      patched,
      "children:(0,s1.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,s1.jsx)(`span`,{className:`truncate`,children:e.label}),i?.(e)]})",
      "children:(0,s1.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,s1.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,e.__codexPlusQuery,s1.jsx)}),i?.(e)]})",
      "26.810.52044 project selector fuzzy highlight anchor",
    );
    patched = replaceOnce(patched, "o=s==null?void 0:HPs(s.projects,k,ZPs)", "o=s==null?void 0:CPXP.fuzzyFilter(s.projects,k)", "26.810.52044 project selector fuzzy filter anchor");
    patched = replaceOnce(
      patched,
      "onSelect:()=>{E.current=!0,v(e.gizmo.id,t),N(!1)},children:t},e.gizmo.id)}),",
      "onSelect:()=>{E.current=!0,v(e.gizmo.id,t),N(!1)},children:CPXP.fuzzyHighlight(t,k,c1.jsx)},e.gizmo.id)}),",
      "26.810.52044 cloud project selector fuzzy highlight anchor",
    );
    patched = replaceOnce(
      patched,
      "ne=s==null?null:(0,c1.jsx)(GPs,{groups:d??[],selectedProjectIds:c==null?[]:[c],getProjectDetails:YPs,onSelectProject:e=>{E.current=!0,s.onSelectProject(e),N(!1)}})",
      "ne=s==null?null:(0,c1.jsx)(GPs,{groups:(d??[]).map(e=>({...e,__codexPlusQuery:k})),selectedProjectIds:c==null?[]:[c],getProjectDetails:YPs,onSelectProject:e=>{E.current=!0,s.onSelectProject(e),N(!1)}})",
      "26.810.52044 project selector highlight query mount anchor",
    );
    patched = replaceOnce(
      patched,
      "U=(0,c1.jsx)(zPs,{searchQuery:k,onSearchQueryChange:A,hasProjectItems:(d?.length??0)+f.length>0,projectItems:(0,c1.jsxs)(c1.Fragment,{children:[I,ne]}),status:P,footerItems:te,emptyMessage:re})",
      "U=(0,c1.jsx)(zPs,{searchQuery:k,onSearchQueryChange:A,onSearchKeyDown:e=>CPXP.acceptFirst(e,d,e=>{let t=s?.projects.find(t=>t.projectId===e);t&&(E.current=!0,s.onSelectProject(t),N(!1))},k),hasProjectItems:(d?.length??0)+f.length>0,projectItems:(0,c1.jsxs)(c1.Fragment,{children:[I,ne]}),status:P,footerItems:te,emptyMessage:re})",
      "26.810.52044 project selector accept first anchor",
    );
    patched = replaceOnce(
      patched,
      "let N=M,P;t[2]===Symbol.for(`react.memo_cache_sentinel`)",
      "let N=M,CPXOH=CPXP.setOpenHandler(w,()=>{N(!0);return!0}),P;t[2]===Symbol.for(`react.memo_cache_sentinel`)",
      "26.810.52044 project selector controlled open handler anchor",
    );
    patched = replaceOnce(patched, "triggerButton:m,onOpenChange:N,children:U", "triggerButton:CPXPST(m,w),onOpenChange:N,children:U", "26.810.52044 project selector hero trigger anchor");
    return replaceOnce(patched, "B=IPs,K=", "B=e=>CPXPST((0,c1.jsx)(IPs,e),w),K=", "26.810.52044 project selector default trigger anchor");
  }
  if (context.patchSetId === "chatgpt-26.803.81509-6415") {
    let patched = replaceOnce(
      text,
      "function vys(e){let t=(0,Sys.c)(92),",
      `${projectSelectorSearchHook()}${projectSelectorTriggerHook("Cys")}function vys(e){let t=(0,Sys.c)(92),`,
      "26.803.81509 project selector adapter insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "function lys(e){let t=(0,uys.c)(24),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l}=e,",
      "function lys(e){let t=(0,uys.c)(24),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l,onSearchKeyDown:CPXKD}=e,",
      "26.803.81509 project selector search key handler prop anchor",
    );
    patched = replaceOnce(
      patched,
      "p=(0,x0.jsx)(O$.Input,{className:`mb-1`,placeholder:f,value:s,onValueChange:l})",
      "p=(0,x0.jsx)(O$.Input,{className:`mb-1`,placeholder:f,value:s,onValueChange:l,onKeyDown:CPXKD})",
      "26.803.81509 project selector search key handler mount anchor",
    );
    patched = replaceOnce(
      patched,
      "children:(0,S0.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,S0.jsx)(`span`,{className:`truncate`,children:e.label}),i?.(e)]})",
      "children:(0,S0.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,S0.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,e.__codexPlusQuery,S0.jsx)}),i?.(e)]})",
      "26.803.81509 project selector fuzzy highlight anchor",
    );
    patched = replaceOnce(
      patched,
      "o=s==null?void 0:fys(s.projects,k,xys)",
      "o=s==null?void 0:CPXP.fuzzyFilter(s.projects,k)",
      "26.803.81509 project selector fuzzy filter anchor",
    );
    patched = replaceOnce(
      patched,
      "onSelect:()=>{E.current=!0,v(e.gizmo.id,t),N(!1)},children:t},e.gizmo.id)}),",
      "onSelect:()=>{E.current=!0,v(e.gizmo.id,t),N(!1)},children:CPXP.fuzzyHighlight(t,k,C0.jsx)},e.gizmo.id)}),",
      "26.803.81509 cloud project selector fuzzy highlight anchor",
    );
    patched = replaceOnce(
      patched,
      "re=s==null?null:(0,C0.jsx)(hys,{groups:d??[],selectedProjectIds:c==null?[]:[c],getProjectDetails:yys,onSelectProject:e=>{E.current=!0,s.onSelectProject(e),N(!1)}})",
      "re=s==null?null:(0,C0.jsx)(hys,{groups:(d??[]).map(e=>({...e,__codexPlusQuery:k})),selectedProjectIds:c==null?[]:[c],getProjectDetails:yys,onSelectProject:e=>{E.current=!0,s.onSelectProject(e),N(!1)}})",
      "26.803.81509 project selector highlight query mount anchor",
    );
    patched = replaceOnce(
      patched,
      "U=(0,C0.jsx)(lys,{searchQuery:k,onSearchQueryChange:A,hasProjectItems:(d?.length??0)+f.length>0,projectItems:(0,C0.jsxs)(C0.Fragment,{children:[I,re]}),status:P,footerItems:ne,emptyMessage:ie})",
      "U=(0,C0.jsx)(lys,{searchQuery:k,onSearchQueryChange:A,onSearchKeyDown:e=>CPXP.acceptFirst(e,d,e=>{let t=s?.projects.find(t=>t.projectId===e);t&&(E.current=!0,s.onSelectProject(t),N(!1))},k),hasProjectItems:(d?.length??0)+f.length>0,projectItems:(0,C0.jsxs)(C0.Fragment,{children:[I,re]}),status:P,footerItems:ne,emptyMessage:ie})",
      "26.803.81509 project selector accept first anchor",
    );
    patched = replaceOnce(
      patched,
      "let N=M,P;t[2]===Symbol.for(`react.memo_cache_sentinel`)",
      "let N=M,CPXOH=CPXP.setOpenHandler(w,()=>{N(!0);return!0}),P;t[2]===Symbol.for(`react.memo_cache_sentinel`)",
      "26.803.81509 project selector controlled open handler anchor",
    );
    patched = replaceOnce(
      patched,
      "triggerButton:m,onOpenChange:N,children:U",
      "triggerButton:CPXPST(m,w),onOpenChange:N,children:U",
      "26.803.81509 project selector hero trigger anchor",
    );
    return replaceOnce(
      patched,
      "B=ays,K=",
      "B=e=>CPXPST((0,C0.jsx)(ays,e),w),K=",
      "26.803.81509 project selector default trigger anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.803.41515")) {
    let patched = replaceOnce(
      text,
      "function Lys(e){let t=(0,Vys.c)(92),",
      `${projectSelectorSearchHook()}${projectSelectorTriggerHook("Hys")}function Lys(e){let t=(0,Vys.c)(92),`,
      "26.803.41515 project selector adapter insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "function Oys(e){let t=(0,kys.c)(24),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l}=e,",
      "function Oys(e){let t=(0,kys.c)(24),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l,onSearchKeyDown:CPXKD}=e,",
      "26.803.41515 project selector search key handler prop anchor",
    );
    patched = replaceOnce(
      patched,
      "p=(0,t0.jsx)(FQ.Input,{className:`mb-1`,placeholder:f,value:s,onValueChange:l})",
      "p=(0,t0.jsx)(FQ.Input,{className:`mb-1`,placeholder:f,value:s,onValueChange:l,onKeyDown:CPXKD})",
      "26.803.41515 project selector search key handler mount anchor",
    );
    patched = replaceOnce(
      patched,
      "children:(0,n0.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,n0.jsx)(`span`,{className:`truncate`,children:e.label}),i?.(e)]})",
      "children:(0,n0.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,n0.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,e.__codexPlusQuery,n0.jsx)}),i?.(e)]})",
      "26.803.41515 project selector fuzzy highlight anchor",
    );
    patched = replaceOnce(
      patched,
      "o=s==null?void 0:jys(s.projects,k,Bys)",
      "o=s==null?void 0:CPXP.fuzzyFilter(s.projects,k)",
      "26.803.41515 project selector fuzzy filter anchor",
    );
    patched = replaceOnce(
      patched,
      "onSelect:()=>{E.current=!0,v(e.gizmo.id,t),N(!1)},children:t},e.gizmo.id)})",
      "onSelect:()=>{E.current=!0,v(e.gizmo.id,t),N(!1)},children:CPXP.fuzzyHighlight(t,k,r0.jsx)},e.gizmo.id)})",
      "26.803.41515 cloud project selector fuzzy highlight anchor",
    );
    patched = replaceOnce(
      patched,
      "re=s==null?null:(0,r0.jsx)(Pys,{groups:d??[],selectedProjectIds:c==null?[]:[c],getProjectDetails:Rys,onSelectProject:e=>{E.current=!0,s.onSelectProject(e),N(!1)}})",
      "re=s==null?null:(0,r0.jsx)(Pys,{groups:(d??[]).map(e=>({...e,__codexPlusQuery:k})),selectedProjectIds:c==null?[]:[c],getProjectDetails:Rys,onSelectProject:e=>{E.current=!0,s.onSelectProject(e),N(!1)}})",
      "26.803.41515 project selector highlight query mount anchor",
    );
    patched = replaceOnce(
      patched,
      "U=(0,r0.jsx)(Oys,{searchQuery:k,onSearchQueryChange:A,hasProjectItems:(d?.length??0)+f.length>0,projectItems:(0,r0.jsxs)(r0.Fragment,{children:[I,re]}),status:P,footerItems:ne,emptyMessage:ie})",
      "U=(0,r0.jsx)(Oys,{searchQuery:k,onSearchQueryChange:A,onSearchKeyDown:e=>CPXP.acceptFirst(e,d,e=>{let t=s?.projects.find(t=>t.projectId===e);t&&(E.current=!0,s.onSelectProject(t),N(!1))},k),hasProjectItems:(d?.length??0)+f.length>0,projectItems:(0,r0.jsxs)(r0.Fragment,{children:[I,re]}),status:P,footerItems:ne,emptyMessage:ie})",
      "26.803.41515 project selector accept first anchor",
    );
    patched = replaceOnce(
      patched,
      "let N=M,P;t[2]===Symbol.for(`react.memo_cache_sentinel`)",
      "let N=M,CPXOH=CPXP.setOpenHandler(w,()=>{N(!0);return!0}),P;t[2]===Symbol.for(`react.memo_cache_sentinel`)",
      "26.803.41515 project selector controlled open handler anchor",
    );
    patched = replaceOnce(
      patched,
      "triggerButton:m,onOpenChange:N,children:U",
      "triggerButton:CPXPST(m,w),onOpenChange:N,children:U",
      "26.803.41515 project selector hero trigger anchor",
    );
    return replaceOnce(
      patched,
      "B=Tys,K=",
      "B=e=>CPXPST((0,r0.jsx)(Tys,e),w),K=",
      "26.803.41515 project selector default trigger anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.730.61639")) {
    let patched = replaceOnce(
      text,
      "function VEs(e){let t=(0,GEs.c)(92),",
      `${projectSelectorSearchHook()}${projectSelectorTriggerHook("KEs")}function VEs(e){let t=(0,GEs.c)(92),`,
      "26.730.61639 project selector adapter insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "function MEs(e){let t=(0,NEs.c)(24),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l}=e,",
      "function MEs(e){let t=(0,NEs.c)(24),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l,onSearchKeyDown:CPXKD}=e,",
      "26.730.61639 project selector search key handler prop anchor",
    );
    patched = replaceOnce(
      patched,
      "p=(0,jY.jsx)(Aq.Input,{className:`mb-1`,placeholder:f,value:s,onValueChange:l})",
      "p=(0,jY.jsx)(Aq.Input,{className:`mb-1`,placeholder:f,value:s,onValueChange:l,onKeyDown:CPXKD})",
      "26.730.61639 project selector search key handler mount anchor",
    );
    patched = replaceOnce(
      patched,
      "children:(0,MY.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,MY.jsx)(`span`,{className:`truncate`,children:e.label}),i?.(e)]})",
      "children:(0,MY.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,MY.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,e.__codexPlusQuery,MY.jsx)}),i?.(e)]})",
      "26.730.61639 project selector fuzzy highlight anchor",
    );
    patched = replaceOnce(
      patched,
      "o=s==null?void 0:FEs(s.projects,k,WEs)",
      "o=s==null?void 0:CPXP.fuzzyFilter(s.projects,k)",
      "26.730.61639 project selector fuzzy filter anchor",
    );
    patched = replaceOnce(
      patched,
      "onSelect:()=>{E.current=!0,v(e.gizmo.id,t),N(!1)},children:t},e.gizmo.id)})",
      "onSelect:()=>{E.current=!0,v(e.gizmo.id,t),N(!1)},children:CPXP.fuzzyHighlight(t,k,NY.jsx)},e.gizmo.id)})",
      "26.730.61639 cloud project selector fuzzy highlight anchor",
    );
    patched = replaceOnce(
      patched,
      "re=s==null?null:(0,NY.jsx)(REs,{groups:d??[],selectedProjectIds:c==null?[]:[c],getProjectDetails:HEs,onSelectProject:e=>{E.current=!0,s.onSelectProject(e),N(!1)}})",
      "re=s==null?null:(0,NY.jsx)(REs,{groups:(d??[]).map(e=>({...e,__codexPlusQuery:k})),selectedProjectIds:c==null?[]:[c],getProjectDetails:HEs,onSelectProject:e=>{E.current=!0,s.onSelectProject(e),N(!1)}})",
      "26.730.61639 project selector highlight query mount anchor",
    );
    patched = replaceOnce(
      patched,
      "U=(0,NY.jsx)(MEs,{searchQuery:k,onSearchQueryChange:A,hasProjectItems:(d?.length??0)+f.length>0,projectItems:(0,NY.jsxs)(NY.Fragment,{children:[I,re]}),status:P,footerItems:ne,emptyMessage:ie})",
      "U=(0,NY.jsx)(MEs,{searchQuery:k,onSearchQueryChange:A,onSearchKeyDown:e=>CPXP.acceptFirst(e,d,e=>{let t=s?.projects.find(t=>t.projectId===e);t&&(E.current=!0,s.onSelectProject(t),N(!1))},k),hasProjectItems:(d?.length??0)+f.length>0,projectItems:(0,NY.jsxs)(NY.Fragment,{children:[I,re]}),status:P,footerItems:ne,emptyMessage:ie})",
      "26.730.61639 project selector accept first anchor",
    );
    patched = replaceOnce(
      patched,
      "let N=M,P;t[2]===Symbol.for(`react.memo_cache_sentinel`)",
      "let N=M,CPXOH=CPXP.setOpenHandler(w,()=>{N(!0);return!0}),P;t[2]===Symbol.for(`react.memo_cache_sentinel`)",
      "26.730.61639 project selector controlled open handler anchor",
    );
    patched = replaceOnce(
      patched,
      "triggerButton:m,onOpenChange:N,children:U",
      "triggerButton:CPXPST(m,w),onOpenChange:N,children:U",
      "26.730.61639 project selector hero trigger anchor",
    );
    return replaceOnce(
      patched,
      "B=OEs,K=",
      "B=e=>CPXPST((0,NY.jsx)(OEs,e),w),K=",
      "26.730.61639 project selector default trigger anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.730.61309")) {
    let patched = replaceOnce(
      text,
      "function BEs(e){let t=(0,WEs.c)(92),",
      `${projectSelectorSearchHook()}${projectSelectorTriggerHook("GEs")}function BEs(e){let t=(0,WEs.c)(92),`,
      "26.730.61309 project selector adapter insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "function jEs(e){let t=(0,MEs.c)(24),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l}=e,",
      "function jEs(e){let t=(0,MEs.c)(24),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l,onSearchKeyDown:CPXKD}=e,",
      "26.730.61309 project selector search key handler prop anchor",
    );
    patched = replaceOnce(
      patched,
      "p=(0,jY.jsx)(jq.Input,{className:`mb-1`,placeholder:f,value:s,onValueChange:l})",
      "p=(0,jY.jsx)(jq.Input,{className:`mb-1`,placeholder:f,value:s,onValueChange:l,onKeyDown:CPXKD})",
      "26.730.61309 project selector search key handler mount anchor",
    );
    patched = replaceOnce(
      patched,
      "children:(0,MY.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,MY.jsx)(`span`,{className:`truncate`,children:e.label}),i?.(e)]})",
      "children:(0,MY.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,MY.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,e.__codexPlusQuery,MY.jsx)}),i?.(e)]})",
      "26.730.61309 project selector fuzzy highlight anchor",
    );
    patched = replaceOnce(
      patched,
      "o=s==null?void 0:PEs(s.projects,k,UEs)",
      "o=s==null?void 0:CPXP.fuzzyFilter(s.projects,k)",
      "26.730.61309 project selector fuzzy filter anchor",
    );
    patched = replaceOnce(
      patched,
      "onSelect:()=>{E.current=!0,v(e.gizmo.id,t),N(!1)},children:t},e.gizmo.id)})",
      "onSelect:()=>{E.current=!0,v(e.gizmo.id,t),N(!1)},children:CPXP.fuzzyHighlight(t,k,NY.jsx)},e.gizmo.id)})",
      "26.730.61309 cloud project selector fuzzy highlight anchor",
    );
    patched = replaceOnce(
      patched,
      "re=s==null?null:(0,NY.jsx)(LEs,{groups:d??[],selectedProjectIds:c==null?[]:[c],getProjectDetails:VEs,onSelectProject:e=>{E.current=!0,s.onSelectProject(e),N(!1)}})",
      "re=s==null?null:(0,NY.jsx)(LEs,{groups:(d??[]).map(e=>({...e,__codexPlusQuery:k})),selectedProjectIds:c==null?[]:[c],getProjectDetails:VEs,onSelectProject:e=>{E.current=!0,s.onSelectProject(e),N(!1)}})",
      "26.730.61309 project selector highlight query mount anchor",
    );
    patched = replaceOnce(
      patched,
      "U=(0,NY.jsx)(jEs,{searchQuery:k,onSearchQueryChange:A,hasProjectItems:(d?.length??0)+f.length>0,projectItems:(0,NY.jsxs)(NY.Fragment,{children:[I,re]}),status:P,footerItems:ne,emptyMessage:ie})",
      "U=(0,NY.jsx)(jEs,{searchQuery:k,onSearchQueryChange:A,onSearchKeyDown:e=>CPXP.acceptFirst(e,d,e=>{let t=s?.projects.find(t=>t.projectId===e);t&&(E.current=!0,s.onSelectProject(t),N(!1))},k),hasProjectItems:(d?.length??0)+f.length>0,projectItems:(0,NY.jsxs)(NY.Fragment,{children:[I,re]}),status:P,footerItems:ne,emptyMessage:ie})",
      "26.730.61309 project selector accept first anchor",
    );
    patched = replaceOnce(
      patched,
      "let N=M,P;t[2]===Symbol.for(`react.memo_cache_sentinel`)",
      "let N=M,CPXOH=CPXP.setOpenHandler(w,()=>{N(!0);return!0}),P;t[2]===Symbol.for(`react.memo_cache_sentinel`)",
      "26.730.61309 project selector controlled open handler anchor",
    );
    patched = replaceOnce(
      patched,
      "triggerButton:m,onOpenChange:N,children:U",
      "triggerButton:CPXPST(m,w),onOpenChange:N,children:U",
      "26.730.61309 project selector hero trigger anchor",
    );
    return replaceOnce(
      patched,
      "B=DEs,K=",
      "B=e=>CPXPST((0,NY.jsx)(DEs,e),w),K=",
      "26.730.61309 project selector default trigger anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.727.51351")) {
    let patched = replaceOnce(
      text,
      "function Wpc(e){let t=(0,qpc.c)(32),",
      `${projectSelectorSearchHook()}${projectSelectorTriggerHook("lmc")}function Wpc(e){let t=(0,qpc.c)(32),`,
      "26.727.51351 project selector adapter insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "function PEs(e){let t=(0,FEs.c)(24),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l}=e,",
      "function PEs(e){let t=(0,FEs.c)(24),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l,onSearchKeyDown:CPXKD}=e,",
      "26.727.51351 project selector search key handler prop anchor",
    );
    patched = replaceOnce(
      patched,
      "p=(0,tX.jsx)(uJ.Input,{className:`mb-1`,placeholder:f,value:s,onValueChange:l})",
      "p=(0,tX.jsx)(uJ.Input,{className:`mb-1`,placeholder:f,value:s,onValueChange:l,onKeyDown:CPXKD})",
      "26.727.51351 project selector search key handler mount anchor",
    );
    patched = replaceOnce(
      patched,
      "function fDs(e){let t=(0,pDs.c)(13),{groups:n,selectedProjectIds:r,getProjectDetails:i,getProjectTooltipText:a,onSelectProject:o}=e,",
      "function fDs(e){let t=(0,pDs.c)(13),{groups:n,query:CPXQ,selectedProjectIds:r,getProjectDetails:i,getProjectTooltipText:a,onSelectProject:o}=e,",
      "26.727.51351 project selector highlight query prop anchor",
    );
    patched = replaceOnce(
      patched,
      "children:(0,oX.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,oX.jsx)(`span`,{className:`truncate`,children:e.label}),i?.(e)]})",
      "children:(0,oX.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,oX.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,CPXQ,oX.jsx)}),i?.(e)]})",
      "26.727.51351 project selector fuzzy highlight anchor",
    );
    patched = replaceOnce(
      patched,
      "t[0]!==r||t[1]!==g?(v=LEs(r,g,Kpc),",
      "t[0]!==r||t[1]!==g?(v=CPXP.fuzzyFilter(r,g),",
      "26.727.51351 project selector fuzzy filter anchor",
    );
    patched = replaceOnce(
      patched,
      "T=(0,l$.jsx)(fDs,{groups:y,selectedProjectIds:i,getProjectDetails:Gpc,getProjectTooltipText:C,onSelectProject:w})",
      "T=(0,l$.jsx)(fDs,{groups:y,query:g,selectedProjectIds:i,getProjectDetails:Gpc,getProjectTooltipText:C,onSelectProject:w})",
      "26.727.51351 project selector highlight query mount anchor",
    );
    patched = replaceOnce(
      patched,
      "D=(0,l$.jsx)(PEs,{searchQuery:g,onSearchQueryChange:_,hasProjectItems:S,projectItems:T,emptyMessage:p,footerItems:E,children:n})",
      "D=(0,l$.jsx)(PEs,{searchQuery:g,onSearchQueryChange:_,onSearchKeyDown:e=>CPXP.acceptFirst(e,y,t=>w(t),g),hasProjectItems:S,projectItems:T,emptyMessage:p,footerItems:E,children:n})",
      "26.727.51351 project selector accept first anchor",
    );
    patched = replaceOnce(
      patched,
      "B=c??m,V=e=>{h(e),l?.(e)},H=n&&s===`home`",
      "B=c??m,V=e=>{h(e),l?.(e)},CPXOH=CPXP.setOpenHandler(s,()=>{V(!0);return!0}),H=n&&s===`home`",
      "26.727.51351 project selector controlled open handler anchor",
    );
    return replaceOnce(
      patched,
      "triggerButton:d??(s===`hero`?ce():oe()),contentWidth:`workspace`",
      "triggerButton:CPXPST(d??(s===`hero`?ce():oe()),s),contentWidth:`workspace`",
      "26.727.51351 project selector visible trigger anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.727.40816")) {
    let patched = replaceOnce(
      text,
      "function Upc(e){let t=(0,Kpc.c)(32),",
      `${projectSelectorSearchHook()}${projectSelectorTriggerHook("cmc")}function Upc(e){let t=(0,Kpc.c)(32),`,
      "26.727.40816 project selector adapter insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "function NEs(e){let t=(0,PEs.c)(24),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l}=e,",
      "function NEs(e){let t=(0,PEs.c)(24),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l,onSearchKeyDown:CPXKD}=e,",
      "26.727.40816 project selector search key handler prop anchor",
    );
    patched = replaceOnce(
      patched,
      "p=(0,nX.jsx)(dJ.Input,{className:`mb-1`,placeholder:f,value:s,onValueChange:l})",
      "p=(0,nX.jsx)(dJ.Input,{className:`mb-1`,placeholder:f,value:s,onValueChange:l,onKeyDown:CPXKD})",
      "26.727.40816 project selector search key handler mount anchor",
    );
    patched = replaceOnce(
      patched,
      "function dDs(e){let t=(0,fDs.c)(13),{groups:n,selectedProjectIds:r,getProjectDetails:i,getProjectTooltipText:a,onSelectProject:o}=e,",
      "function dDs(e){let t=(0,fDs.c)(13),{groups:n,query:CPXQ,selectedProjectIds:r,getProjectDetails:i,getProjectTooltipText:a,onSelectProject:o}=e,",
      "26.727.40816 project selector highlight query prop anchor",
    );
    patched = replaceOnce(
      patched,
      "children:(0,sX.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,sX.jsx)(`span`,{className:`truncate`,children:e.label}),i?.(e)]})",
      "children:(0,sX.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,sX.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,CPXQ,sX.jsx)}),i?.(e)]})",
      "26.727.40816 project selector fuzzy highlight anchor",
    );
    patched = replaceOnce(
      patched,
      "t[0]!==r||t[1]!==g?(v=IEs(r,g,Gpc),",
      "t[0]!==r||t[1]!==g?(v=CPXP.fuzzyFilter(r,g),",
      "26.727.40816 project selector fuzzy filter anchor",
    );
    patched = replaceOnce(
      patched,
      "T=(0,u$.jsx)(dDs,{groups:y,selectedProjectIds:i,getProjectDetails:Wpc,getProjectTooltipText:C,onSelectProject:w})",
      "T=(0,u$.jsx)(dDs,{groups:y,query:g,selectedProjectIds:i,getProjectDetails:Wpc,getProjectTooltipText:C,onSelectProject:w})",
      "26.727.40816 project selector highlight query mount anchor",
    );
    patched = replaceOnce(
      patched,
      "D=(0,u$.jsx)(NEs,{searchQuery:g,onSearchQueryChange:_,hasProjectItems:S,projectItems:T,emptyMessage:p,footerItems:E,children:n})",
      "D=(0,u$.jsx)(NEs,{searchQuery:g,onSearchQueryChange:_,onSearchKeyDown:e=>CPXP.acceptFirst(e,y,t=>w(t),g),hasProjectItems:S,projectItems:T,emptyMessage:p,footerItems:E,children:n})",
      "26.727.40816 project selector accept first anchor",
    );
    patched = replaceOnce(
      patched,
      "B=c??m,V=e=>{h(e),l?.(e)},H=n&&s===`home`",
      "B=c??m,V=e=>{h(e),l?.(e)},CPXOH=CPXP.setOpenHandler(s,()=>{V(!0);return!0}),H=n&&s===`home`",
      "26.727.40816 project selector controlled open handler anchor",
    );
    return replaceOnce(
      patched,
      "triggerButton:d??(s===`hero`?ce():oe()),contentWidth:`workspace`",
      "triggerButton:CPXPST(d??(s===`hero`?ce():oe()),s),contentWidth:`workspace`",
      "26.727.40816 project selector visible trigger anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.721.41059")) {
    let patched = replaceOnce(
      text,
      "function o8s({activeProjectIdOverride:e,",
      `${projectSelectorSearchHook()}${projectSelectorTriggerHook("c8s")}function o8s({activeProjectIdOverride:e,`,
      "26.721.41059 project selector adapter insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "function wus(e){let t=(0,Tus.c)(24),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l}=e,",
      "function wus(e){let t=(0,Tus.c)(24),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l,onSearchKeyDown:CPXKD}=e,",
      "26.721.41059 project selector search key handler prop anchor",
    );
    patched = replaceOnce(
      patched,
      "p=(0,sZ.jsx)(mY.Input,{className:`mb-1`,placeholder:f,value:s,onValueChange:l})",
      "p=(0,sZ.jsx)(mY.Input,{className:`mb-1`,placeholder:f,value:s,onValueChange:l,onKeyDown:CPXKD})",
      "26.721.41059 project selector search key handler mount anchor",
    );
    patched = replaceOnce(
      patched,
      "function nds(e){let t=(0,rds.c)(13),{groups:n,selectedProjectIds:r,getProjectDetails:i,getProjectTooltipText:a,onSelectProject:o}=e,",
      "function nds(e){let t=(0,rds.c)(13),{groups:n,query:CPXQ,selectedProjectIds:r,getProjectDetails:i,getProjectTooltipText:a,onSelectProject:o}=e,",
      "26.721.41059 project selector highlight query prop anchor",
    );
    patched = replaceOnce(
      patched,
      "children:(0,fZ.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,fZ.jsx)(`span`,{className:`truncate`,children:e.label}),i?.(e)]})",
      "children:(0,fZ.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,fZ.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,CPXQ,fZ.jsx)}),i?.(e)]})",
      "26.721.41059 project selector fuzzy highlight anchor",
    );
    patched = replaceOnce(
      patched,
      "t[0]!==r||t[1]!==g?(v=Dus(r,g,G6s),",
      "t[0]!==r||t[1]!==g?(v=CPXP.fuzzyFilter(r,g),",
      "26.721.41059 project selector fuzzy filter anchor",
    );
    patched = replaceOnce(
      patched,
      "T=(0,$$.jsx)(nds,{groups:y,selectedProjectIds:i,getProjectDetails:W6s,getProjectTooltipText:C,onSelectProject:w})",
      "T=(0,$$.jsx)(nds,{groups:y,query:g,selectedProjectIds:i,getProjectDetails:W6s,getProjectTooltipText:C,onSelectProject:w})",
      "26.721.41059 project selector highlight query mount anchor",
    );
    patched = replaceOnce(
      patched,
      "D=(0,$$.jsx)(wus,{searchQuery:g,onSearchQueryChange:_,hasProjectItems:S,projectItems:T,emptyMessage:p,footerItems:E,children:n})",
      "D=(0,$$.jsx)(wus,{searchQuery:g,onSearchQueryChange:_,onSearchKeyDown:e=>CPXP.acceptFirst(e,y,t=>w(t),g),hasProjectItems:S,projectItems:T,emptyMessage:p,footerItems:E,children:n})",
      "26.721.41059 project selector accept first anchor",
    );
    patched = replaceOnce(
      patched,
      "B=c??m,V=e=>{h(e),l?.(e)},H=n&&s===`home`&&y.length===0&&!b;",
      "B=c??m,V=e=>{h(e),l?.(e)},CPXOH=CPXP.setOpenHandler(s,()=>{V(!0);return!0}),H=n&&s===`home`&&y.length===0&&!b;",
      "26.721.41059 project selector controlled open handler anchor",
    );
    return replaceOnce(
      patched,
      "triggerButton:d??(s===`hero`?se():ae()),contentWidth:`workspace`",
      "triggerButton:CPXPST(d??(s===`hero`?se():ae()),s),contentWidth:`workspace`",
      "26.721.41059 project selector visible trigger anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.721.31836")) {
    let patched = replaceOnce(
      text,
      "function F6s({activeProjectIdOverride:e,",
      `${projectSelectorSearchHook()}${projectSelectorTriggerHook("L6s")}function F6s({activeProjectIdOverride:e,`,
      "26.721.31836 project selector adapter insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "function $ls(e){let t=(0,eus.c)(24),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l}=e,",
      "function $ls(e){let t=(0,eus.c)(24),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l,onSearchKeyDown:CPXKD}=e,",
      "26.721.31836 project selector search key handler prop anchor",
    );
    patched = replaceOnce(
      patched,
      "p=(0,cZ.jsx)(eY.Input,{className:`mb-1`,placeholder:f,value:s,onValueChange:l})",
      "p=(0,cZ.jsx)(eY.Input,{className:`mb-1`,placeholder:f,value:s,onValueChange:l,onKeyDown:CPXKD})",
      "26.721.31836 project selector search key handler mount anchor",
    );
    patched = replaceOnce(
      patched,
      "function jus(e){let t=(0,Mus.c)(13),{groups:n,selectedProjectIds:r,getProjectDetails:i,getProjectTooltipText:a,onSelectProject:o}=e,",
      "function jus(e){let t=(0,Mus.c)(13),{groups:n,query:CPXQ,selectedProjectIds:r,getProjectDetails:i,getProjectTooltipText:a,onSelectProject:o}=e,",
      "26.721.31836 project selector highlight query prop anchor",
    );
    patched = replaceOnce(
      patched,
      "children:(0,pZ.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,pZ.jsx)(`span`,{className:`truncate`,children:e.label}),i?.(e)]})",
      "children:(0,pZ.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,pZ.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,CPXQ,pZ.jsx)}),i?.(e)]})",
      "26.721.31836 project selector fuzzy highlight anchor",
    );
    patched = replaceOnce(
      patched,
      "t[0]!==r||t[1]!==g?(v=nus(r,g,b6s),",
      "t[0]!==r||t[1]!==g?(v=CPXP.fuzzyFilter(r,g),",
      "26.721.31836 project selector fuzzy filter anchor",
    );
    patched = replaceOnce(
      patched,
      "T=(0,e1.jsx)(jus,{groups:y,selectedProjectIds:i,getProjectDetails:y6s,getProjectTooltipText:C,onSelectProject:w})",
      "T=(0,e1.jsx)(jus,{groups:y,query:g,selectedProjectIds:i,getProjectDetails:y6s,getProjectTooltipText:C,onSelectProject:w})",
      "26.721.31836 project selector highlight query mount anchor",
    );
    patched = replaceOnce(
      patched,
      "D=(0,e1.jsx)($ls,{searchQuery:g,onSearchQueryChange:_,hasProjectItems:S,projectItems:T,emptyMessage:p,footerItems:E,children:n})",
      "D=(0,e1.jsx)($ls,{searchQuery:g,onSearchQueryChange:_,onSearchKeyDown:e=>CPXP.acceptFirst(e,y,t=>w(t),g),hasProjectItems:S,projectItems:T,emptyMessage:p,footerItems:E,children:n})",
      "26.721.31836 project selector accept first anchor",
    );
    patched = replaceOnce(
      patched,
      "B=c??m,V=e=>{h(e),l?.(e)},H=n&&s===`home`&&y.length===0&&!b;",
      "B=c??m,V=e=>{h(e),l?.(e)},CPXOH=CPXP.setOpenHandler(s,()=>{V(!0);return!0}),H=n&&s===`home`&&y.length===0&&!b;",
      "26.721.31836 project selector controlled open handler anchor",
    );
    return replaceOnce(
      patched,
      "triggerButton:d??(s===`hero`?se():ae()),contentWidth:`workspace`",
      "triggerButton:CPXPST(d??(s===`hero`?se():ae()),s),contentWidth:`workspace`",
      "26.721.31836 project selector visible trigger anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.721.30844")) {
    let patched = replaceOnce(
      text,
      "function F6s({activeProjectIdOverride:e,",
      `${projectSelectorSearchHook()}${projectSelectorTriggerHook("L6s")}function F6s({activeProjectIdOverride:e,`,
      "26.721.30844 project selector adapter insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "function $ls(e){let t=(0,eus.c)(24),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l}=e,",
      "function $ls(e){let t=(0,eus.c)(24),{children:n,emptyMessage:r,footerItems:i,hasProjectItems:a,projectItems:o,searchQuery:s,status:c,onSearchQueryChange:l,onSearchKeyDown:CPXKD}=e,",
      "26.721.30844 project selector search key handler prop anchor",
    );
    patched = replaceOnce(
      patched,
      "p=(0,sZ.jsx)(hY.Input,{className:`mb-1`,placeholder:f,value:s,onValueChange:l})",
      "p=(0,sZ.jsx)(hY.Input,{className:`mb-1`,placeholder:f,value:s,onValueChange:l,onKeyDown:CPXKD})",
      "26.721.30844 project selector search key handler mount anchor",
    );
    patched = replaceOnce(
      patched,
      "function jus(e){let t=(0,Mus.c)(13),{groups:n,selectedProjectIds:r,getProjectDetails:i,getProjectTooltipText:a,onSelectProject:o}=e,",
      "function jus(e){let t=(0,Mus.c)(13),{groups:n,query:CPXQ,selectedProjectIds:r,getProjectDetails:i,getProjectTooltipText:a,onSelectProject:o}=e,",
      "26.721.30844 project selector highlight query prop anchor",
    );
    patched = replaceOnce(
      patched,
      "children:(0,fZ.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,fZ.jsx)(`span`,{className:`truncate`,children:e.label}),i?.(e)]})",
      "children:(0,fZ.jsxs)(`div`,{className:`flex min-w-0 items-center gap-1`,children:[(0,fZ.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,CPXQ,fZ.jsx)}),i?.(e)]})",
      "26.721.30844 project selector fuzzy highlight anchor",
    );
    patched = replaceOnce(
      patched,
      "t[0]!==r||t[1]!==g?(v=nus(r,g,b6s),",
      "t[0]!==r||t[1]!==g?(v=CPXP.fuzzyFilter(r,g),",
      "26.721.30844 project selector fuzzy filter anchor",
    );
    patched = replaceOnce(
      patched,
      "T=(0,$$.jsx)(jus,{groups:y,selectedProjectIds:i,getProjectDetails:y6s,getProjectTooltipText:C,onSelectProject:w})",
      "T=(0,$$.jsx)(jus,{groups:y,query:g,selectedProjectIds:i,getProjectDetails:y6s,getProjectTooltipText:C,onSelectProject:w})",
      "26.721.30844 project selector highlight query mount anchor",
    );
    patched = replaceOnce(
      patched,
      "D=(0,$$.jsx)($ls,{searchQuery:g,onSearchQueryChange:_,hasProjectItems:S,projectItems:T,emptyMessage:p,footerItems:E,children:n})",
      "D=(0,$$.jsx)($ls,{searchQuery:g,onSearchQueryChange:_,onSearchKeyDown:e=>CPXP.acceptFirst(e,y,t=>w(t),g),hasProjectItems:S,projectItems:T,emptyMessage:p,footerItems:E,children:n})",
      "26.721.30844 project selector accept first anchor",
    );
    patched = replaceOnce(
      patched,
      "B=c??m,V=e=>{h(e),l?.(e)},H=n&&s===`home`&&y.length===0&&!b;",
      "B=c??m,V=e=>{h(e),l?.(e)},CPXOH=CPXP.setOpenHandler(s,()=>{V(!0);return!0}),H=n&&s===`home`&&y.length===0&&!b;",
      "26.721.30844 project selector controlled open handler anchor",
    );
    return replaceOnce(
      patched,
      "triggerButton:d??(s===`hero`?se():ae()),contentWidth:`workspace`",
      "triggerButton:CPXPST(d??(s===`hero`?se():ae()),s),contentWidth:`workspace`",
      "26.721.30844 project selector visible trigger anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715.21425")) {
    let patched = replaceOnce(
      text,
      "function M(e){let t=(0,N.c)(23),",
      `${projectSelectorSearchHook()}function M(e){let t=(0,N.c)(23),`,
      "26.715.21425 split project selector adapter insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "h=(0,P.jsx)(E,{value:s,onChange:p,placeholder:m,className:`mb-1`})",
      "h=(0,P.jsx)(E,{value:s,onChange:p,onKeyDown:CPXP.acceptCurrent,placeholder:m,className:`mb-1`})",
      "26.715.21425 split project selector accept first anchor",
    );
    patched = replaceOnce(
      patched,
      "(0,q.jsx)(`span`,{className:`truncate`,children:e.label})",
      "(0,q.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,e.__codexPlusQuery,q.jsx)})",
      "26.715.21425 split project selector highlight anchor",
    );
    return replaceOnce(
      patched,
      '(0,Q.jsx)(x,{"aria-label":n,"data-composer-navigation-target":r,categoryLabel:null,collapse:`xs`,disabled:C,icon:u,indicator:`none`,value:M,valueClassName:T})',
      '(0,Q.jsx)(x,{"aria-label":n,"data-codex-plus-project-selector-trigger":!0,"data-codex-plus-project-selector-variant":`home`,"data-composer-navigation-target":r,categoryLabel:null,collapse:`xs`,disabled:C,icon:u,indicator:`none`,value:M,valueClassName:T})',
      "26.715.21425 project selector visible trigger anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715")) {
    let patched = replaceOnce(
      text,
      "function M(e){let t=(0,N.c)(23),",
      `${projectSelectorSearchHook()}function M(e){let t=(0,N.c)(23),`,
      "26.715 split project selector adapter insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "h=(0,P.jsx)(O,{value:s,onChange:p,placeholder:m,className:`mb-1`})",
      "h=(0,P.jsx)(O,{value:s,onChange:p,onKeyDown:CPXP.acceptCurrent,placeholder:m,className:`mb-1`})",
      "26.715 split project selector accept first anchor",
    );
    patched = replaceOnce(
      patched,
      "(0,q.jsx)(`span`,{className:`truncate`,children:e.label})",
      "(0,q.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,e.__codexPlusQuery,q.jsx)})",
      "26.715 split project selector highlight anchor",
    );
    return replaceOnce(
      patched,
      '(0,Q.jsx)(x,{"aria-label":n,"data-composer-navigation-target":r,categoryLabel:null,collapse:`xs`,disabled:C,icon:u,indicator:`none`,value:M,valueClassName:T})',
      '(0,Q.jsx)(x,{"aria-label":n,"data-codex-plus-project-selector-trigger":!0,"data-codex-plus-project-selector-variant":`home`,"data-composer-navigation-target":r,categoryLabel:null,collapse:`xs`,disabled:C,icon:u,indicator:`none`,value:M,valueClassName:T})',
      "26.715 project selector visible trigger anchor",
    );
  }
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

function patchHomeProjectDropdownProjectSelectorShortcut(text, context = {}) {
  if (context.patchSetId === "chatgpt-26.825.41651-7345") {
    let patched = replaceOnce(text, "v=TZo(r,g,lac)", "v=(CPXP.setProjects(r),CPXP.fuzzyFilter(r,g))", "26.825.41651 home project selector fuzzy filter anchor");
    patched = replaceOnce(patched, "T=(0,Q3.jsx)(OZo,{groups:y,selectedProjectIds:i,getProjectDetails:cac,getProjectTooltipText:C,onSelectProject:w})", "T=(0,Q3.jsx)(OZo,{groups:y.map(e=>({...e,__codexPlusQuery:g})),selectedProjectIds:i,getProjectDetails:cac,getProjectTooltipText:C,onSelectProject:w})", "26.825.41651 home project selector highlight query anchor");
    patched = replaceOnce(patched, "D=(0,Q3.jsx)(SZo,{searchQuery:g,onSearchQueryChange:_,hasProjectItems:S,", "D=(0,Q3.jsx)(SZo,{searchQuery:g,onSearchQueryChange:_,onSearchKeyDown:e=>CPXP.acceptFirst(e,y,t=>w(t),g),hasProjectItems:S,", "26.825.41651 home project selector accept first anchor");
    patched = replaceOnce(patched, "let fe=de,pe=h&&y===`home`&&k.length===0&&!A;", "let fe=de,CPXOH=CPXP.setOpenHandler(y,()=>{fe(!0);return!0}),CPXyZo=e=>CPXPST((0,t6.jsx)(yZo,e),y),pe=h&&y===`home`&&k.length===0&&!A;", "26.825.41651 home project selector controlled open handler anchor");
    patched = replaceOnce(patched, "ee=e=>{Ny(b,QYt,{});let t=k.find(t=>t.projectId===e);if(t!=null){if(c!=null){c(t.projectId);return}TG(b,t)}}", "ee=e=>{Ny(b,QYt,{});let t=k.find(t=>t.projectId===e);if(t!=null){window.CodexPlusHost.adapters.messageComposer.setComposerProject(t);if(c!=null){c(t.projectId);return}TG(b,t)}}", "26.825.41651 controlled composer project selection bridge anchor");
    patched = replaceOnce(patched, "q=()=>{if(Ny(b,QYt,{}),c!=null){c(null);return}TG(b,null)}", "q=()=>{if(Ny(b,QYt,{}),window.CodexPlusHost.adapters.messageComposer.setComposerProject(null),c!=null){c(null);return}TG(b,null)}", "26.825.41651 controlled composer project clear bridge anchor");
    patched = replaceOnce(patched, "i=(0,t6.jsx)(yZo,{\"aria-label\":Te,contentWidth:`menu`,", "i=(0,t6.jsx)(CPXyZo,{\"aria-label\":Te,contentWidth:`menu`,", "26.825.41651 home project selector empty trigger anchor");
    patched = replaceOnce(patched, "i=(0,t6.jsx)(yZo,{\"aria-label\":Te,disabled:_,", "i=(0,t6.jsx)(CPXyZo,{\"aria-label\":Te,disabled:_,", "26.825.41651 home project selector direct trigger anchor");
    return replaceOnce(patched, "triggerButton:Ye,contentWidth:`workspace`", "triggerButton:CPXPST(Ye,y),contentWidth:`workspace`", "26.825.41651 home project selector dropdown trigger anchor");
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.818.61809")) {
    let patched = replaceOnce(text, "v=jkc(r,g,Hol)", "v=(CPXP.setProjects(r),CPXP.fuzzyFilter(r,g))", "26.818.61809 home project selector fuzzy filter anchor");
    patched = replaceOnce(patched, "T=(0,v6.jsx)(Pkc,{groups:y,selectedProjectIds:i,getProjectDetails:Vol,getProjectTooltipText:C,onSelectProject:w})", "T=(0,v6.jsx)(Pkc,{groups:y.map(e=>({...e,__codexPlusQuery:g})),selectedProjectIds:i,getProjectDetails:Vol,getProjectTooltipText:C,onSelectProject:w})", "26.818.61809 home project selector highlight query anchor");
    patched = replaceOnce(patched, "D=(0,v6.jsx)(Okc,{searchQuery:g,onSearchQueryChange:_,hasProjectItems:S,projectItems:T,emptyMessage:p,footerItems:E,children:n})", "D=(0,v6.jsx)(Okc,{searchQuery:g,onSearchQueryChange:_,onSearchKeyDown:e=>CPXP.acceptFirst(e,y,t=>w(t),g),hasProjectItems:S,projectItems:T,emptyMessage:p,footerItems:E,children:n})", "26.818.61809 home project selector accept first anchor");
    patched = replaceOnce(patched, "let fe=de,pe=h&&y===`home`&&k.length===0&&!A;", "let fe=de,CPXOH=CPXP.setOpenHandler(y,()=>{fe(!0);return!0}),CPXwkc=e=>CPXPST((0,b6.jsx)(wkc,e),y),pe=h&&y===`home`&&k.length===0&&!A;", "26.818.61809 home project selector controlled open handler anchor");
    patched = replaceOnce(patched, "t[40]!==P||t[41]!==_||t[42]!==ne||t[43]!==xe||t[44]!==Ce||t[45]!==Pe||t[46]!==we||t[47]!==be||t[48]!==f||t[49]!==e||t[50]!==n||t[51]!==r||t[52]!==w?(i=(0,b6.jsx)(wkc,{", "t[40]!==P||t[41]!==_||t[42]!==ne||t[43]!==xe||t[44]!==Ce||t[45]!==Pe||t[46]!==we||t[47]!==be||t[48]!==f||t[49]!==e||t[50]!==n||t[51]!==r||t[52]!==w?(i=(0,b6.jsx)(CPXwkc,{", "26.818.61809 home project selector empty trigger anchor");
    patched = replaceOnce(patched, "t[83]!==P||t[84]!==_||t[85]!==Ke||t[86]!==fe||t[87]!==ne||t[88]!==xe||t[89]!==Ce||t[90]!==Pe||t[91]!==we||t[92]!==be||t[93]!==ue||t[94]!==f||t[95]!==e||t[96]!==n||t[97]!==r||t[98]!==w?(i=(0,b6.jsx)(wkc,{", "t[83]!==P||t[84]!==_||t[85]!==Ke||t[86]!==fe||t[87]!==ne||t[88]!==xe||t[89]!==Ce||t[90]!==Pe||t[91]!==we||t[92]!==be||t[93]!==ue||t[94]!==f||t[95]!==e||t[96]!==n||t[97]!==r||t[98]!==w?(i=(0,b6.jsx)(CPXwkc,{", "26.818.61809 home project selector direct trigger anchor");
    patched = replaceOnce(patched, "K=e=>{Jh(b,sDt,{});let t=k.find(t=>t.projectId===e);if(t!=null){if(c!=null){c(t.projectId);return}jW(b,t)}}", "K=e=>{Jh(b,sDt,{});let t=k.find(t=>t.projectId===e);if(t!=null){window.CodexPlusHost.adapters.messageComposer.setComposerProject(t);if(c!=null){c(t.projectId);return}jW(b,t)}}", "26.818.61809 controlled composer project selection bridge anchor");
    patched = replaceOnce(patched, "ae=()=>{if(Jh(b,sDt,{}),c!=null){c(null);return}jW(b,null)}", "ae=()=>{if(Jh(b,sDt,{}),window.CodexPlusHost.adapters.messageComposer.setComposerProject(null),c!=null){c(null);return}jW(b,null)}", "26.818.61809 controlled composer project clear bridge anchor");
    return replaceOnce(patched, "triggerButton:Je,contentWidth:`workspace`", "triggerButton:CPXPST(Je,y),contentWidth:`workspace`", "26.818.61809 home project selector dropdown trigger anchor");
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.818.22352")) {
    let patched = replaceOnce(text, "v=Jvc(r,g,Mal)", "v=(CPXP.setProjects(r),CPXP.fuzzyFilter(r,g))", "26.818.22352 home project selector fuzzy filter anchor");
    patched = replaceOnce(patched, "T=(0,y6.jsx)(Zvc,{groups:y,selectedProjectIds:i,getProjectDetails:jal,getProjectTooltipText:C,onSelectProject:w})", "T=(0,y6.jsx)(Zvc,{groups:y.map(e=>({...e,__codexPlusQuery:g})),selectedProjectIds:i,getProjectDetails:jal,getProjectTooltipText:C,onSelectProject:w})", "26.818.22352 home project selector highlight query anchor");
    patched = replaceOnce(patched, "D=(0,y6.jsx)(Gvc,{searchQuery:g,onSearchQueryChange:_,hasProjectItems:S,projectItems:T,emptyMessage:p,footerItems:E,children:n})", "D=(0,y6.jsx)(Gvc,{searchQuery:g,onSearchQueryChange:_,onSearchKeyDown:e=>CPXP.acceptFirst(e,y,t=>w(t),g),hasProjectItems:S,projectItems:T,emptyMessage:p,footerItems:E,children:n})", "26.818.22352 home project selector accept first anchor");
    patched = replaceOnce(patched, "let fe=de,pe=h&&y===`home`&&k.length===0&&!A;", "let fe=de,CPXOH=CPXP.setOpenHandler(y,()=>{fe(!0);return!0}),CPXVvc=e=>CPXPST((0,x6.jsx)(Vvc,e),y),pe=h&&y===`home`&&k.length===0&&!A;", "26.818.22352 home project selector controlled open handler anchor");
    patched = replaceOnce(patched, "K=e=>{qh(b,nDt,{});let t=k.find(t=>t.projectId===e);if(t!=null){if(c!=null){c(t.projectId);return}TW(b,t)}}", "K=e=>{qh(b,nDt,{});let t=k.find(t=>t.projectId===e);if(t!=null){window.CodexPlusHost.adapters.messageComposer.setComposerProject(t);if(c!=null){c(t.projectId);return}TW(b,t)}}", "26.818.22352 controlled composer project selection bridge anchor");
    patched = replaceOnce(patched, "ae=()=>{if(qh(b,nDt,{}),c!=null){c(null);return}TW(b,null)}", "ae=()=>{if(qh(b,nDt,{}),window.CodexPlusHost.adapters.messageComposer.setComposerProject(null),c!=null){c(null);return}TW(b,null)}", "26.818.22352 controlled composer project clear bridge anchor");
    patched = replaceOnce(patched, "i=(0,x6.jsx)(Vvc,{\"aria-label\":we,disabled:_,foreground:xe,isBrowserEnvironment:P,isRemoteProject:e,menuOpen:ue,onClearProject:n,onCloseAutoFocus:ne,onOpenChange:fe,projectIcon:r,shortcut:f,subtleHover:w,tooltipContent:Ce,tooltipOpenWhen:Pe,value:be,children:Ke})", "i=(0,x6.jsx)(CPXVvc,{\"aria-label\":we,disabled:_,foreground:xe,isBrowserEnvironment:P,isRemoteProject:e,menuOpen:ue,onClearProject:n,onCloseAutoFocus:ne,onOpenChange:fe,projectIcon:r,shortcut:f,subtleHover:w,tooltipContent:Ce,tooltipOpenWhen:Pe,value:be,children:Ke})", "26.818.22352 home project selector direct trigger anchor");
    return replaceOnce(patched, "triggerButton:Je,contentWidth:`workspace`", "triggerButton:CPXPST(Je,y),contentWidth:`workspace`", "26.818.22352 home project selector dropdown trigger anchor");
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.818.31338")) {
    let patched = replaceOnce(text, "v=tyc(r,g,zal)", "v=(CPXP.setProjects(r),CPXP.fuzzyFilter(r,g))", "26.818.31338 home project selector fuzzy filter anchor");
    patched = replaceOnce(patched, "T=(0,y6.jsx)(iyc,{groups:y,selectedProjectIds:i,getProjectDetails:Ral,getProjectTooltipText:C,onSelectProject:w})", "T=(0,y6.jsx)(iyc,{groups:y.map(e=>({...e,__codexPlusQuery:g})),selectedProjectIds:i,getProjectDetails:Ral,getProjectTooltipText:C,onSelectProject:w})", "26.818.31338 home project selector highlight query anchor");
    patched = replaceOnce(patched, "D=(0,y6.jsx)(Qvc,{searchQuery:g,onSearchQueryChange:_,hasProjectItems:S,projectItems:T,emptyMessage:p,footerItems:E,children:n})", "D=(0,y6.jsx)(Qvc,{searchQuery:g,onSearchQueryChange:_,onSearchKeyDown:e=>CPXP.acceptFirst(e,y,t=>w(t),g),hasProjectItems:S,projectItems:T,emptyMessage:p,footerItems:E,children:n})", "26.818.31338 home project selector accept first anchor");
    patched = replaceOnce(patched, "let fe=de,pe=h&&y===`home`&&k.length===0&&!A;", "let fe=de,CPXOH=CPXP.setOpenHandler(y,()=>{fe(!0);return!0}),CPXJvc=e=>CPXPST((0,x6.jsx)(Jvc,e),y),pe=h&&y===`home`&&k.length===0&&!A;", "26.818.31338 home project selector controlled open handler anchor");
    patched = replaceOnce(patched, "K=e=>{Kh(b,rDt,{});let t=k.find(t=>t.projectId===e);if(t!=null){if(c!=null){c(t.projectId);return}AW(b,t)}}", "K=e=>{Kh(b,rDt,{});let t=k.find(t=>t.projectId===e);if(t!=null){window.CodexPlusHost.adapters.messageComposer.setComposerProject(t);if(c!=null){c(t.projectId);return}AW(b,t)}}", "26.818.31338 controlled composer project selection bridge anchor");
    patched = replaceOnce(patched, "ae=()=>{if(Kh(b,rDt,{}),c!=null){c(null);return}AW(b,null)}", "ae=()=>{if(Kh(b,rDt,{}),window.CodexPlusHost.adapters.messageComposer.setComposerProject(null),c!=null){c(null);return}AW(b,null)}", "26.818.31338 controlled composer project clear bridge anchor");
    patched = replaceOnce(patched, "i=(0,x6.jsx)(Jvc,{\"aria-label\":we,disabled:_,foreground:xe,isBrowserEnvironment:P,isRemoteProject:e,menuOpen:ue,onClearProject:n,onCloseAutoFocus:ne,onOpenChange:fe,projectIcon:r,shortcut:f,subtleHover:w,tooltipContent:Ce,tooltipOpenWhen:Pe,value:be,children:Ke})", "i=(0,x6.jsx)(CPXJvc,{\"aria-label\":we,disabled:_,foreground:xe,isBrowserEnvironment:P,isRemoteProject:e,menuOpen:ue,onClearProject:n,onCloseAutoFocus:ne,onOpenChange:fe,projectIcon:r,shortcut:f,subtleHover:w,tooltipContent:Ce,tooltipOpenWhen:Pe,value:be,children:Ke})", "26.818.31338 home project selector direct trigger anchor");
    return replaceOnce(patched, "triggerButton:Je,contentWidth:`workspace`", "triggerButton:CPXPST(Je,y),contentWidth:`workspace`", "26.818.31338 home project selector dropdown trigger anchor");
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.818.32112")) {
    let patched = replaceOnce(text, "v=nyc(r,g,Bal)", "v=(CPXP.setProjects(r),CPXP.fuzzyFilter(r,g))", "26.818.32112 home project selector fuzzy filter anchor");
    patched = replaceOnce(patched, "T=(0,v6.jsx)(ayc,{groups:y,selectedProjectIds:i,getProjectDetails:zal,getProjectTooltipText:C,onSelectProject:w})", "T=(0,v6.jsx)(ayc,{groups:y.map(e=>({...e,__codexPlusQuery:g})),selectedProjectIds:i,getProjectDetails:zal,getProjectTooltipText:C,onSelectProject:w})", "26.818.32112 home project selector highlight query anchor");
    patched = replaceOnce(patched, "D=(0,v6.jsx)($vc,{searchQuery:g,onSearchQueryChange:_,hasProjectItems:S,projectItems:T,emptyMessage:p,footerItems:E,children:n})", "D=(0,v6.jsx)($vc,{searchQuery:g,onSearchQueryChange:_,onSearchKeyDown:e=>CPXP.acceptFirst(e,y,t=>w(t),g),hasProjectItems:S,projectItems:T,emptyMessage:p,footerItems:E,children:n})", "26.818.32112 home project selector accept first anchor");
    patched = replaceOnce(patched, "let fe=de,pe=h&&y===`home`&&k.length===0&&!A;", "let fe=de,CPXOH=CPXP.setOpenHandler(y,()=>{fe(!0);return!0}),CPXYvc=e=>CPXPST((0,b6.jsx)(Yvc,e),y),pe=h&&y===`home`&&k.length===0&&!A;", "26.818.32112 home project selector controlled open handler anchor");
    patched = replaceOnce(patched, "t[40]!==P||t[41]!==_||t[42]!==ne||t[43]!==xe||t[44]!==Ce||t[45]!==Pe||t[46]!==we||t[47]!==be||t[48]!==f||t[49]!==e||t[50]!==n||t[51]!==r||t[52]!==w?(i=(0,b6.jsx)(Yvc,{", "t[40]!==P||t[41]!==_||t[42]!==ne||t[43]!==xe||t[44]!==Ce||t[45]!==Pe||t[46]!==we||t[47]!==be||t[48]!==f||t[49]!==e||t[50]!==n||t[51]!==r||t[52]!==w?(i=(0,b6.jsx)(CPXYvc,{", "26.818.32112 home project selector empty trigger anchor");
    patched = replaceOnce(patched, "t[83]!==P||t[84]!==_||t[85]!==Ke||t[86]!==fe||t[87]!==ne||t[88]!==xe||t[89]!==Ce||t[90]!==Pe||t[91]!==we||t[92]!==be||t[93]!==ue||t[94]!==f||t[95]!==e||t[96]!==n||t[97]!==r||t[98]!==w?(i=(0,b6.jsx)(Yvc,{", "t[83]!==P||t[84]!==_||t[85]!==Ke||t[86]!==fe||t[87]!==ne||t[88]!==xe||t[89]!==Ce||t[90]!==Pe||t[91]!==we||t[92]!==be||t[93]!==ue||t[94]!==f||t[95]!==e||t[96]!==n||t[97]!==r||t[98]!==w?(i=(0,b6.jsx)(CPXYvc,{", "26.818.32112 home project selector direct trigger anchor");
    patched = replaceOnce(patched, "K=e=>{Kh(b,rDt,{});let t=k.find(t=>t.projectId===e);if(t!=null){if(c!=null){c(t.projectId);return}TW(b,t)}}", "K=e=>{Kh(b,rDt,{});let t=k.find(t=>t.projectId===e);if(t!=null){window.CodexPlusHost.adapters.messageComposer.setComposerProject(t);if(c!=null){c(t.projectId);return}TW(b,t)}}", "26.818.32112 controlled composer project selection bridge anchor");
    patched = replaceOnce(patched, "ae=()=>{if(Kh(b,rDt,{}),c!=null){c(null);return}TW(b,null)}", "ae=()=>{if(Kh(b,rDt,{}),window.CodexPlusHost.adapters.messageComposer.setComposerProject(null),c!=null){c(null);return}TW(b,null)}", "26.818.32112 controlled composer project clear bridge anchor");
    return replaceOnce(patched, "triggerButton:Je,contentWidth:`workspace`", "triggerButton:CPXPST(Je,y),contentWidth:`workspace`", "26.818.32112 home project selector dropdown trigger anchor");
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.818.41705")) {
    let patched = replaceOnce(text, "v=kkc(r,g,Bol)", "v=(CPXP.setProjects(r),CPXP.fuzzyFilter(r,g))", "26.818.41705 home project selector fuzzy filter anchor");
    patched = replaceOnce(patched, "T=(0,v6.jsx)(Mkc,{groups:y,selectedProjectIds:i,getProjectDetails:zol,getProjectTooltipText:C,onSelectProject:w})", "T=(0,v6.jsx)(Mkc,{groups:y.map(e=>({...e,__codexPlusQuery:g})),selectedProjectIds:i,getProjectDetails:zol,getProjectTooltipText:C,onSelectProject:w})", "26.818.41705 home project selector highlight query anchor");
    patched = replaceOnce(patched, "D=(0,v6.jsx)(Ekc,{searchQuery:g,onSearchQueryChange:_,hasProjectItems:S,projectItems:T,emptyMessage:p,footerItems:E,children:n})", "D=(0,v6.jsx)(Ekc,{searchQuery:g,onSearchQueryChange:_,onSearchKeyDown:e=>CPXP.acceptFirst(e,y,t=>w(t),g),hasProjectItems:S,projectItems:T,emptyMessage:p,footerItems:E,children:n})", "26.818.41705 home project selector accept first anchor");
    patched = replaceOnce(patched, "let fe=de,pe=h&&y===`home`&&k.length===0&&!A;", "let fe=de,CPXOH=CPXP.setOpenHandler(y,()=>{fe(!0);return!0}),CPXSkc=e=>CPXPST((0,b6.jsx)(Skc,e),y),pe=h&&y===`home`&&k.length===0&&!A;", "26.818.41705 home project selector controlled open handler anchor");
    patched = replaceOnce(patched, "K=e=>{Xh(b,rDt,{});let t=k.find(t=>t.projectId===e);if(t!=null){if(c!=null){c(t.projectId);return}jW(b,t)}}", "K=e=>{Xh(b,rDt,{});let t=k.find(t=>t.projectId===e);if(t!=null){window.CodexPlusHost.adapters.messageComposer.setComposerProject(t);if(c!=null){c(t.projectId);return}jW(b,t)}}", "26.818.41705 controlled composer project selection bridge anchor");
    patched = replaceOnce(patched, "ae=()=>{if(Xh(b,rDt,{}),c!=null){c(null);return}jW(b,null)}", "ae=()=>{if(Xh(b,rDt,{}),window.CodexPlusHost.adapters.messageComposer.setComposerProject(null),c!=null){c(null);return}jW(b,null)}", "26.818.41705 controlled composer project clear bridge anchor");
    patched = replaceOnce(patched, "i=(0,b6.jsx)(Skc,{\"aria-label\":we,disabled:_,foreground:xe,isBrowserEnvironment:P,isRemoteProject:e,menuOpen:ue,onClearProject:n,onCloseAutoFocus:ne,onOpenChange:fe,projectIcon:r,shortcut:f,subtleHover:w,tooltipContent:Ce,tooltipOpenWhen:Pe,value:be,children:Ke})", "i=(0,b6.jsx)(CPXSkc,{\"aria-label\":we,disabled:_,foreground:xe,isBrowserEnvironment:P,isRemoteProject:e,menuOpen:ue,onClearProject:n,onCloseAutoFocus:ne,onOpenChange:fe,projectIcon:r,shortcut:f,subtleHover:w,tooltipContent:Ce,tooltipOpenWhen:Pe,value:be,children:Ke})", "26.818.41705 home project selector direct trigger anchor");
    return replaceOnce(patched, "triggerButton:Je,contentWidth:`workspace`", "triggerButton:CPXPST(Je,y),contentWidth:`workspace`", "26.818.41705 home project selector dropdown trigger anchor");
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.818.21641")) {
    let patched = replaceOnce(text, "v=Q_c(r,g,Fil)", "v=(CPXP.setProjects(r),CPXP.fuzzyFilter(r,g))", "26.818.21641 home project selector fuzzy filter anchor");
    patched = replaceOnce(patched, "T=(0,y6.jsx)(tvc,{groups:y,selectedProjectIds:i,getProjectDetails:Pil,getProjectTooltipText:C,onSelectProject:w})", "T=(0,y6.jsx)(tvc,{groups:y.map(e=>({...e,__codexPlusQuery:g})),selectedProjectIds:i,getProjectDetails:Pil,getProjectTooltipText:C,onSelectProject:w})", "26.818.21641 home project selector highlight query anchor");
    patched = replaceOnce(patched, "D=(0,y6.jsx)(Y_c,{searchQuery:g,onSearchQueryChange:_,hasProjectItems:S,projectItems:T,emptyMessage:p,footerItems:E,children:n})", "D=(0,y6.jsx)(Y_c,{searchQuery:g,onSearchQueryChange:_,onSearchKeyDown:e=>CPXP.acceptFirst(e,y,t=>w(t),g),hasProjectItems:S,projectItems:T,emptyMessage:p,footerItems:E,children:n})", "26.818.21641 home project selector accept first anchor");
    patched = replaceOnce(patched, "let fe=de,pe=h&&y===`home`&&k.length===0&&!A;", "let fe=de,CPXOH=CPXP.setOpenHandler(y,()=>{fe(!0);return!0}),CPXG_c=e=>CPXPST((0,x6.jsx)(G_c,e),y),pe=h&&y===`home`&&k.length===0&&!A;", "26.818.21641 home project selector controlled open handler anchor");
    patched = replaceOnce(patched, "t[40]!==P||t[41]!==_||t[42]!==ne||t[43]!==xe||t[44]!==Ce||t[45]!==Pe||t[46]!==we||t[47]!==be||t[48]!==f||t[49]!==e||t[50]!==n||t[51]!==r||t[52]!==w?(i=(0,x6.jsx)(G_c,{", "t[40]!==P||t[41]!==_||t[42]!==ne||t[43]!==xe||t[44]!==Ce||t[45]!==Pe||t[46]!==we||t[47]!==be||t[48]!==f||t[49]!==e||t[50]!==n||t[51]!==r||t[52]!==w?(i=(0,x6.jsx)(CPXG_c,{", "26.818.21641 home project selector empty trigger anchor");
    patched = replaceOnce(patched, "t[83]!==P||t[84]!==_||t[85]!==Ke||t[86]!==fe||t[87]!==ne||t[88]!==xe||t[89]!==Ce||t[90]!==Pe||t[91]!==we||t[92]!==be||t[93]!==ue||t[94]!==f||t[95]!==e||t[96]!==n||t[97]!==r||t[98]!==w?(i=(0,x6.jsx)(G_c,{", "t[83]!==P||t[84]!==_||t[85]!==Ke||t[86]!==fe||t[87]!==ne||t[88]!==xe||t[89]!==Ce||t[90]!==Pe||t[91]!==we||t[92]!==be||t[93]!==ue||t[94]!==f||t[95]!==e||t[96]!==n||t[97]!==r||t[98]!==w?(i=(0,x6.jsx)(CPXG_c,{", "26.818.21641 home project selector direct trigger anchor");
    patched = replaceOnce(patched, "K=e=>{Zh(b,QEt,{});let t=k.find(t=>t.projectId===e);if(t!=null){if(c!=null){c(t.projectId);return}DW(b,t)}}", "K=e=>{Zh(b,QEt,{});let t=k.find(t=>t.projectId===e);if(t!=null){window.CodexPlusHost.adapters.messageComposer.setComposerProject(t);if(c!=null){c(t.projectId);return}DW(b,t)}}", "26.818.21641 controlled composer project selection bridge anchor");
    patched = replaceOnce(patched, "ae=()=>{if(Zh(b,QEt,{}),c!=null){c(null);return}DW(b,null)}", "ae=()=>{if(Zh(b,QEt,{}),window.CodexPlusHost.adapters.messageComposer.setComposerProject(null),c!=null){c(null);return}DW(b,null)}", "26.818.21641 controlled composer project clear bridge anchor");
    return replaceOnce(patched, "triggerButton:Je,contentWidth:`workspace`", "triggerButton:CPXPST(Je,y),contentWidth:`workspace`", "26.818.21641 home project selector dropdown trigger anchor");
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.814.41407")) {
    let patched = replaceOnce(
      text,
      'F=(0,nac.jsx)(Jic,{"aria-label":n,"data-composer-navigation-target":r,',
      'F=(0,nac.jsx)(Jic,{"aria-label":n,"data-codex-plus-project-selector-trigger":!0,"data-composer-navigation-target":r,',
      "26.814.41407 home project selector DOM trigger marker anchor",
    );
    patched = replaceOnce(patched, "v=dac(r,g,I6c)", "v=(CPXP.setProjects(r),CPXP.fuzzyFilter(r,g))", "26.814.41407 home project selector fuzzy filter anchor");
    patched = replaceOnce(
      patched,
      "T=(0,v6.jsx)(mac,{groups:y,selectedProjectIds:i,getProjectDetails:F6c,getProjectTooltipText:C,onSelectProject:w})",
      "T=(0,v6.jsx)(mac,{groups:y.map(e=>({...e,__codexPlusQuery:g})),selectedProjectIds:i,getProjectDetails:F6c,getProjectTooltipText:C,onSelectProject:w})",
      "26.814.41407 home project selector highlight query anchor",
    );
    patched = replaceOnce(
      patched,
      "D=(0,v6.jsx)(cac,{searchQuery:g,onSearchQueryChange:_,hasProjectItems:S,projectItems:T,emptyMessage:p,footerItems:E,children:n})",
      "D=(0,v6.jsx)(cac,{searchQuery:g,onSearchQueryChange:_,onSearchKeyDown:e=>CPXP.acceptFirst(e,y,t=>w(t),g),hasProjectItems:S,projectItems:T,emptyMessage:p,footerItems:E,children:n})",
      "26.814.41407 home project selector accept first anchor",
    );
    patched = replaceOnce(
      patched,
      "let fe=de,pe=h&&y===`home`&&k.length===0&&!A;",
      "let fe=de,CPXOH=CPXP.setOpenHandler(y,()=>{fe(!0);return!0}),CPXiac=e=>CPXPST((0,b6.jsx)(iac,e),y),pe=h&&y===`home`&&k.length===0&&!A;",
      "26.814.41407 home project selector controlled open handler anchor",
    );
    patched = replaceOnce(
      patched,
      "i=(0,b6.jsx)(iac,{\"aria-label\":we,disabled:_,foreground:xe,isBrowserEnvironment:P,isRemoteProject:e,menuOpen:ue,onClearProject:n,onCloseAutoFocus:ne,onOpenChange:fe,projectIcon:r,shortcut:f,subtleHover:w,tooltipContent:Ce,tooltipOpenWhen:Pe,value:be,children:Ke})",
      "i=(0,b6.jsx)(CPXiac,{\"aria-label\":we,disabled:_,foreground:xe,isBrowserEnvironment:P,isRemoteProject:e,menuOpen:ue,onClearProject:n,onCloseAutoFocus:ne,onOpenChange:fe,projectIcon:r,shortcut:f,subtleHover:w,tooltipContent:Ce,tooltipOpenWhen:Pe,value:be,children:Ke})",
      "26.814.41407 home project selector direct trigger anchor",
    );
    patched = replaceOnce(
      patched,
      "K=e=>{lg(b,bCt,{});let t=k.find(t=>t.projectId===e);if(t!=null){if(c!=null){c(t.projectId);return}cG(b,t)}}",
      "K=e=>{lg(b,bCt,{});let t=k.find(t=>t.projectId===e);if(t!=null){window.CodexPlusHost.adapters.messageComposer.setComposerProject(t);if(c!=null){c(t.projectId);return}cG(b,t)}}",
      "26.814.41407 controlled composer project selection bridge anchor",
    );
    patched = replaceOnce(
      patched,
      "ae=()=>{if(lg(b,bCt,{}),c!=null){c(null);return}cG(b,null)}",
      "ae=()=>{if(lg(b,bCt,{}),window.CodexPlusHost.adapters.messageComposer.setComposerProject(null),c!=null){c(null);return}cG(b,null)}",
      "26.814.41407 controlled composer project clear bridge anchor",
    );
    return replaceOnce(patched, "triggerButton:Je,contentWidth:`workspace`", "triggerButton:CPXPST(Je,y),contentWidth:`workspace`", "26.814.41407 home project selector dropdown trigger anchor");
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.810.41047")) {
    let patched = replaceOnce(text, "let fe=de,pe=h&&y===`home`&&k.length===0&&!A;", "let fe=de,CPXOH=CPXP.setOpenHandler(y,()=>{fe(!0);return!0}),CPXHNs=e=>CPXPST((0,B3.jsx)(HNs,e),y),pe=h&&y===`home`&&k.length===0&&!A;", "26.810.41047 home project selector controlled open handler anchor");
    patched = replaceOnce(patched, "t[40]!==P||t[41]!==_||t[42]!==ne||t[43]!==xe||t[44]!==Ce||t[45]!==Pe||t[46]!==we||t[47]!==be||t[48]!==f||t[49]!==e||t[50]!==n||t[51]!==r||t[52]!==w?(i=(0,B3.jsx)(HNs,{", "t[40]!==P||t[41]!==_||t[42]!==ne||t[43]!==xe||t[44]!==Ce||t[45]!==Pe||t[46]!==we||t[47]!==be||t[48]!==f||t[49]!==e||t[50]!==n||t[51]!==r||t[52]!==w?(i=(0,B3.jsx)(CPXHNs,{", "26.810.41047 home project selector empty trigger anchor");
    patched = replaceOnce(patched, "t[83]!==P||t[84]!==_||t[85]!==Ke||t[86]!==fe||t[87]!==ne||t[88]!==xe||t[89]!==Ce||t[90]!==Pe||t[91]!==we||t[92]!==be||t[93]!==ue||t[94]!==f||t[95]!==e||t[96]!==n||t[97]!==r||t[98]!==w?(i=(0,B3.jsx)(HNs,{", "t[83]!==P||t[84]!==_||t[85]!==Ke||t[86]!==fe||t[87]!==ne||t[88]!==xe||t[89]!==Ce||t[90]!==Pe||t[91]!==we||t[92]!==be||t[93]!==ue||t[94]!==f||t[95]!==e||t[96]!==n||t[97]!==r||t[98]!==w?(i=(0,B3.jsx)(CPXHNs,{", "26.810.41047 home project selector direct trigger anchor");
    patched = replaceOnce(patched, "v=YNs(r,g,QOc)", "v=CPXP.fuzzyFilter(r,g)", "26.810.41047 home project selector fuzzy filter anchor");
    patched = replaceOnce(patched, "T=(0,R3.jsx)(QNs,{groups:y,selectedProjectIds:i,", "T=(0,R3.jsx)(QNs,{groups:y.map(e=>({...e,__codexPlusQuery:g})),selectedProjectIds:i,", "26.810.41047 home project selector highlight query anchor");
    patched = replaceOnce(patched, "D=(0,R3.jsx)(KNs,{searchQuery:g,onSearchQueryChange:_,hasProjectItems:S,", "D=(0,R3.jsx)(KNs,{searchQuery:g,onSearchQueryChange:_,onSearchKeyDown:e=>CPXP.acceptFirst(e,y,t=>{let n=y.find(e=>e.projectId===t);n&&w(n)},g),hasProjectItems:S,", "26.810.41047 home project selector accept first anchor");
    return replaceOnce(patched, "triggerButton:Je,contentWidth:`workspace`", "triggerButton:CPXPST(Je,y),contentWidth:`workspace`", "26.810.41047 home project selector dropdown trigger anchor");
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.803.61601")) {
    let patched = replaceOnce(text, "B=c??m,V=e=>{h(e),l?.(e)},H=n&&s===`home`", "B=c??m,V=e=>{h(e),l?.(e)},CPXOH=CPXP.setOpenHandler(s,()=>{V(!0);return!0}),CPXTys=e=>CPXPST((0,q3.jsx)(iys,e),s),H=n&&s===`home`", "26.803.61601 home project selector controlled open handler anchor");
    patched = replaceOnce(patched, "if(!j&&d==null)return(0,K3.jsx)(iys,{", "if(!j&&d==null)return(0,K3.jsx)(CPXTys,{", "26.803.61601 home project selector empty trigger anchor");
    patched = replaceOnce(patched, "if(s===`home`&&d==null)return(0,K3.jsx)(iys,{", "if(s===`home`&&d==null)return(0,K3.jsx)(CPXTys,{", "26.803.61601 home project selector direct trigger anchor");
    patched = replaceOnce(patched, "v=dys(r,g,Hcc)", "v=CPXP.fuzzyFilter(r,g)", "26.803.61601 home project selector fuzzy filter anchor");
    patched = replaceOnce(patched, "T=(0,W3.jsx)(mys,{groups:y,selectedProjectIds:i,", "T=(0,W3.jsx)(mys,{groups:y.map(e=>({...e,__codexPlusQuery:g})),selectedProjectIds:i,", "26.803.61601 home project selector highlight query anchor");
    patched = replaceOnce(patched, "D=(0,W3.jsx)(cys,{searchQuery:g,onSearchQueryChange:_,hasProjectItems:S,", "D=(0,W3.jsx)(cys,{searchQuery:g,onSearchQueryChange:_,onSearchKeyDown:e=>CPXP.acceptFirst(e,y,t=>w(t),g),hasProjectItems:S,", "26.803.61601 home project selector accept first anchor");
    return replaceOnce(patched, "triggerButton:d??(s===`hero`?le():se()),contentWidth:`workspace`", "triggerButton:CPXPST(d??(s===`hero`?le():se()),s),contentWidth:`workspace`", "26.803.61601 home project selector dropdown trigger anchor");
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.810.52044")) {
    let patched = replaceOnce(
      text,
      "let fe=de,pe=h&&y===`home`&&k.length===0&&!A;",
      "let fe=de,CPXOH=CPXP.setOpenHandler(y,()=>{fe(!0);return!0}),CPXIPs=e=>CPXPST((0,z3.jsx)(IPs,e),y),pe=h&&y===`home`&&k.length===0&&!A;",
      "26.810.52044 home project selector controlled open handler anchor",
    );
    patched = replaceOnce(
      patched,
      "t[40]!==P||t[41]!==_||t[42]!==ne||t[43]!==xe||t[44]!==Ce||t[45]!==Pe||t[46]!==we||t[47]!==be||t[48]!==f||t[49]!==e||t[50]!==n||t[51]!==r||t[52]!==w?(i=(0,z3.jsx)(IPs,{",
      "t[40]!==P||t[41]!==_||t[42]!==ne||t[43]!==xe||t[44]!==Ce||t[45]!==Pe||t[46]!==we||t[47]!==be||t[48]!==f||t[49]!==e||t[50]!==n||t[51]!==r||t[52]!==w?(i=(0,z3.jsx)(CPXIPs,{",
      "26.810.52044 home project selector empty trigger anchor",
    );
    patched = replaceOnce(
      patched,
      "t[83]!==P||t[84]!==_||t[85]!==Ke||t[86]!==fe||t[87]!==ne||t[88]!==xe||t[89]!==Ce||t[90]!==Pe||t[91]!==we||t[92]!==be||t[93]!==ue||t[94]!==f||t[95]!==e||t[96]!==n||t[97]!==r||t[98]!==w?(i=(0,z3.jsx)(IPs,{",
      "t[83]!==P||t[84]!==_||t[85]!==Ke||t[86]!==fe||t[87]!==ne||t[88]!==xe||t[89]!==Ce||t[90]!==Pe||t[91]!==we||t[92]!==be||t[93]!==ue||t[94]!==f||t[95]!==e||t[96]!==n||t[97]!==r||t[98]!==w?(i=(0,z3.jsx)(CPXIPs,{",
      "26.810.52044 home project selector direct trigger anchor",
    );
    patched = replaceOnce(patched, "v=HPs(r,g,tkc)", "v=CPXP.fuzzyFilter(r,g)", "26.810.52044 home project selector fuzzy filter anchor");
    patched = replaceOnce(
      patched,
      "T=(0,L3.jsx)(GPs,{groups:y,selectedProjectIds:i,",
      "T=(0,L3.jsx)(GPs,{groups:y.map(e=>({...e,__codexPlusQuery:g})),selectedProjectIds:i,",
      "26.810.52044 home project selector highlight query anchor",
    );
    patched = replaceOnce(
      patched,
      "D=(0,L3.jsx)(zPs,{searchQuery:g,onSearchQueryChange:_,hasProjectItems:S,",
      "D=(0,L3.jsx)(zPs,{searchQuery:g,onSearchQueryChange:_,onSearchKeyDown:e=>CPXP.acceptFirst(e,y,t=>{let n=y.find(e=>e.projectId===t);n&&w(n)},g),hasProjectItems:S,",
      "26.810.52044 home project selector accept first anchor",
    );
    return replaceOnce(patched, "triggerButton:Je,contentWidth:`workspace`", "triggerButton:CPXPST(Je,y),contentWidth:`workspace`", "26.810.52044 home project selector dropdown trigger anchor");
  }
  if (context.patchSetId === "chatgpt-26.803.81509-6415") {
    let patched = replaceOnce(
      text,
      "B=c??m,V=e=>{h(e),l?.(e)},H=n&&s===`home`",
      "B=c??m,V=e=>{h(e),l?.(e)},CPXOH=CPXP.setOpenHandler(s,()=>{V(!0);return!0}),CPXays=e=>CPXPST((0,q3.jsx)(ays,e),s),H=n&&s===`home`",
      "26.803.81509 home project selector controlled open handler anchor",
    );
    patched = replaceOnce(
      patched,
      "if(!j&&d==null)return(0,q3.jsx)(ays,{",
      "if(!j&&d==null)return(0,q3.jsx)(CPXays,{",
      "26.803.81509 home project selector empty trigger anchor",
    );
    patched = replaceOnce(
      patched,
      "if(s===`home`&&d==null)return(0,q3.jsx)(ays,{",
      "if(s===`home`&&d==null)return(0,q3.jsx)(CPXays,{",
      "26.803.81509 home project selector direct trigger anchor",
    );
    patched = replaceOnce(
      patched,
      "v=fys(r,g,slc)",
      "v=CPXP.fuzzyFilter(r,g)",
      "26.803.81509 home project selector fuzzy filter anchor",
    );
    patched = replaceOnce(
      patched,
      "T=(0,G3.jsx)(hys,{groups:y,selectedProjectIds:i,",
      "T=(0,G3.jsx)(hys,{groups:y.map(e=>({...e,__codexPlusQuery:g})),selectedProjectIds:i,",
      "26.803.81509 home project selector highlight query anchor",
    );
    patched = replaceOnce(
      patched,
      "D=(0,G3.jsx)(lys,{searchQuery:g,onSearchQueryChange:_,hasProjectItems:S,",
      "D=(0,G3.jsx)(lys,{searchQuery:g,onSearchQueryChange:_,onSearchKeyDown:e=>CPXP.acceptFirst(e,y,t=>w(t),g),hasProjectItems:S,",
      "26.803.81509 home project selector accept first anchor",
    );
    return replaceOnce(
      patched,
      "triggerButton:d??(s===`hero`?le():se()),contentWidth:`workspace`",
      "triggerButton:CPXPST(d??(s===`hero`?le():se()),s),contentWidth:`workspace`",
      "26.803.81509 home project selector dropdown trigger anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.803.41515")) {
    let patched = replaceOnce(
      text,
      "B=c??m,V=e=>{h(e),l?.(e)},H=n&&s===`home`",
      "B=c??m,V=e=>{h(e),l?.(e)},CPXOH=CPXP.setOpenHandler(s,()=>{V(!0);return!0}),CPXTys=e=>CPXPST((0,q3.jsx)(Tys,e),s),H=n&&s===`home`",
      "26.803.41515 home project selector controlled open handler anchor",
    );
    patched = replaceOnce(
      patched,
      "if(!j&&d==null)return(0,q3.jsx)(Tys,{",
      "if(!j&&d==null)return(0,q3.jsx)(CPXTys,{",
      "26.803.41515 home project selector empty trigger anchor",
    );
    patched = replaceOnce(
      patched,
      "if(s===`home`&&d==null)return(0,q3.jsx)(Tys,{",
      "if(s===`home`&&d==null)return(0,q3.jsx)(CPXTys,{",
      "26.803.41515 home project selector direct trigger anchor",
    );
    patched = replaceOnce(
      patched,
      "v=jys(r,g,Bcc)",
      "v=CPXP.fuzzyFilter(r,g)",
      "26.803.41515 home project selector fuzzy filter anchor",
    );
    patched = replaceOnce(
      patched,
      "T=(0,G3.jsx)(Pys,{groups:y,selectedProjectIds:i,",
      "T=(0,G3.jsx)(Pys,{groups:y.map(e=>({...e,__codexPlusQuery:g})),selectedProjectIds:i,",
      "26.803.41515 home project selector highlight query anchor",
    );
    patched = replaceOnce(
      patched,
      "D=(0,G3.jsx)(Oys,{searchQuery:g,onSearchQueryChange:_,hasProjectItems:S,",
      "D=(0,G3.jsx)(Oys,{searchQuery:g,onSearchQueryChange:_,onSearchKeyDown:e=>CPXP.acceptFirst(e,y,t=>w(t),g),hasProjectItems:S,",
      "26.803.41515 home project selector accept first anchor",
    );
    return replaceOnce(
      patched,
      "triggerButton:d??(s===`hero`?le():se()),contentWidth:`workspace`",
      "triggerButton:CPXPST(d??(s===`hero`?le():se()),s),contentWidth:`workspace`",
      "26.803.41515 home project selector dropdown trigger anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.730.61639")) {
    let patched = replaceOnce(
      text,
      "B=c??m,V=e=>{h(e),l?.(e)},H=n&&s===`home`",
      "B=c??m,V=e=>{h(e),l?.(e)},CPXOH=CPXP.setOpenHandler(s,()=>{V(!0);return!0}),CPXOEs=e=>CPXPST((0,m$.jsx)(OEs,e),s),H=n&&s===`home`",
      "26.730.61639 home project selector controlled open handler anchor",
    );
    patched = replaceOnce(
      patched,
      "if(!j&&d==null)return(0,m$.jsx)(OEs,{",
      "if(!j&&d==null)return(0,m$.jsx)(CPXOEs,{",
      "26.730.61639 home project selector empty trigger anchor",
    );
    patched = replaceOnce(
      patched,
      "if(s===`home`&&d==null)return(0,m$.jsx)(OEs,{",
      "if(s===`home`&&d==null)return(0,m$.jsx)(CPXOEs,{",
      "26.730.61639 home project selector direct trigger anchor",
    );
    patched = replaceOnce(
      patched,
      "v=FEs(r,g,nhc)",
      "v=CPXP.fuzzyFilter(r,g)",
      "26.730.61639 home project selector fuzzy filter anchor",
    );
    patched = replaceOnce(
      patched,
      "T=(0,f$.jsx)(REs,{groups:y,selectedProjectIds:i,",
      "T=(0,f$.jsx)(REs,{groups:y.map(e=>({...e,__codexPlusQuery:g})),selectedProjectIds:i,",
      "26.730.61639 home project selector highlight query anchor",
    );
    patched = replaceOnce(
      patched,
      "D=(0,f$.jsx)(MEs,{searchQuery:g,onSearchQueryChange:_,hasProjectItems:S,",
      "D=(0,f$.jsx)(MEs,{searchQuery:g,onSearchQueryChange:_,onSearchKeyDown:e=>CPXP.acceptFirst(e,y,t=>w(t),g),hasProjectItems:S,",
      "26.730.61639 home project selector accept first anchor",
    );
    return replaceOnce(
      patched,
      "triggerButton:d??(s===`hero`?le():se()),contentWidth:`workspace`",
      "triggerButton:CPXPST(d??(s===`hero`?le():se()),s),contentWidth:`workspace`",
      "26.730.61639 home project selector dropdown trigger anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.730.61309")) {
    let patched = replaceOnce(
      text,
      "B=c??m,V=e=>{h(e),l?.(e)},H=n&&s===`home`",
      "B=c??m,V=e=>{h(e),l?.(e)},CPXOH=CPXP.setOpenHandler(s,()=>{V(!0);return!0}),CPXDEs=e=>CPXPST((0,m$.jsx)(DEs,e),s),H=n&&s===`home`",
      "26.730.61309 home project selector controlled open handler anchor",
    );
    patched = replaceOnce(
      patched,
      "if(!j&&d==null)return(0,m$.jsx)(DEs,{",
      "if(!j&&d==null)return(0,m$.jsx)(CPXDEs,{",
      "26.730.61309 home project selector empty trigger anchor",
    );
    patched = replaceOnce(
      patched,
      "if(s===`home`&&d==null)return(0,m$.jsx)(DEs,{",
      "if(s===`home`&&d==null)return(0,m$.jsx)(CPXDEs,{",
      "26.730.61309 home project selector direct trigger anchor",
    );
    patched = replaceOnce(
      patched,
      "v=PEs(r,g,rhc)",
      "v=CPXP.fuzzyFilter(r,g)",
      "26.730.61309 home project selector fuzzy filter anchor",
    );
    patched = replaceOnce(
      patched,
      "T=(0,f$.jsx)(LEs,{groups:y,selectedProjectIds:i,",
      "T=(0,f$.jsx)(LEs,{groups:y.map(e=>({...e,__codexPlusQuery:g})),selectedProjectIds:i,",
      "26.730.61309 home project selector highlight query anchor",
    );
    patched = replaceOnce(
      patched,
      "D=(0,f$.jsx)(jEs,{searchQuery:g,onSearchQueryChange:_,hasProjectItems:S,",
      "D=(0,f$.jsx)(jEs,{searchQuery:g,onSearchQueryChange:_,onSearchKeyDown:e=>CPXP.acceptFirst(e,y,t=>w(t),g),hasProjectItems:S,",
      "26.730.61309 home project selector accept first anchor",
    );
    return replaceOnce(
      patched,
      "triggerButton:d??(s===`hero`?le():se()),contentWidth:`workspace`",
      "triggerButton:CPXPST(d??(s===`hero`?le():se()),s),contentWidth:`workspace`",
      "26.730.61309 home project selector dropdown trigger anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.727.40816")) {
    // This release uses one selector implementation for local and home
    // surfaces. The local-selector transform installs the shared wiring.
    return text;
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.721.30844")) {
    // The current app uses one selector implementation for local and home
    // surfaces. The preceding local-selector transform already installs the
    // shared adapter and trigger wiring in that implementation.
    return text;
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715.21425")) {
    let patched = replaceOnce(
      text,
      "function mt({activeProjectIdOverride:e,allowLocalProjects:t=!0,",
      `${projectSelectorSearchHook()}${projectSelectorTriggerHook("gt")}function mt({activeProjectIdOverride:e,allowLocalProjects:t=!0,`,
      "26.715.21425 home project selector helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "_=r.filter(e),t[0]=r,t[1]=h,t[2]=_",
      "_=CPXP.fuzzyFilter(r,h).map(e=>({...e,__codexPlusQuery:h})),t[0]=r,t[1]=h,t[2]=_",
      "26.715.21425 home project selector fuzzy search anchor",
    );
    patched = replaceOnce(
      patched,
      "t[9]===a?C=t[10]:(C=e=>{a(e.projectId)},t[9]=a,t[10]=C);let w;",
      "t[9]===a?C=t[10]:(C=e=>{a(e.projectId)},t[9]=a,t[10]=C);CPXP.setAcceptFirstHandler(e=>CPXP.acceptFirst(e,v,C,h));let w;",
      "26.715.21425 home project selector accept first binding anchor",
    );
    patched = replaceOnce(
      patched,
      "R=f??v,z=e=>{y(e),p?.(e)},B=",
      "R=f??v,z=e=>{y(e),p?.(e)},CPXOH=CPXP.setOpenHandler(u,()=>{z(!0);return!0}),B=",
      "26.715.21425 home project selector controlled open handler anchor",
    );
    patched = replaceOnce(
      patched,
      "(0,Z.jsx)(Ue,{open:f,onOpenChange:z,onCloseAutoFocus:M,side:`top`,triggerButton:h,contentWidth:`menu`,",
      "(0,Z.jsx)(Ue,{open:R,onOpenChange:z,onCloseAutoFocus:M,side:`top`,triggerButton:CPXPST(h,u),contentWidth:`menu`,",
      "26.715.21425 home project selector empty controlled trigger anchor",
    );
    return replaceOnce(
      patched,
      "let Je=(0,Z.jsx)(Ue,{open:f,onOpenChange:z,onCloseAutoFocus:M,side:`top`,align:u===`hero`?`center`:`start`,disabled:s,triggerButton:h??(u===`hero`?Ke():He()),contentWidth:`workspace`,",
      "let Je=(0,Z.jsx)(Ue,{open:R,onOpenChange:z,onCloseAutoFocus:M,side:`top`,align:u===`hero`?`center`:`start`,disabled:s,triggerButton:CPXPST(h??(u===`hero`?Ke():He()),u),contentWidth:`workspace`,",
      "26.715.21425 home project selector workspace controlled trigger anchor",
    );
  }
  if (patchSetOwnsTransformVariant(context.patchSetId, "chatgpt-26.715")) {
    let patched = replaceOnce(
      text,
      "function ht({activeProjectIdOverride:e,allowLocalProjects:t=!0,",
      `${projectSelectorSearchHook()}${projectSelectorTriggerHook("_t")}function ht({activeProjectIdOverride:e,allowLocalProjects:t=!0,`,
      "26.715 home project selector helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "_=r.filter(e),t[0]=r,t[1]=h,t[2]=_",
      "_=CPXP.fuzzyFilter(r,h).map(e=>({...e,__codexPlusQuery:h})),t[0]=r,t[1]=h,t[2]=_",
      "26.715 home project selector fuzzy search anchor",
    );
    patched = replaceOnce(
      patched,
      "t[9]===a?C=t[10]:(C=e=>{a(e.projectId)},t[9]=a,t[10]=C);let w;",
      "t[9]===a?C=t[10]:(C=e=>{a(e.projectId)},t[9]=a,t[10]=C);CPXP.setAcceptFirstHandler(e=>CPXP.acceptFirst(e,v,C,h));let w;",
      "26.715 home project selector accept first binding anchor",
    );
    patched = replaceOnce(
      patched,
      "I=f??v,L=e=>{y(e),p?.(e)},Te=",
      "I=f??v,L=e=>{y(e),p?.(e)},CPXOH=CPXP.setOpenHandler(u,()=>{L(!0);return!0}),Te=",
      "26.715 home project selector controlled open handler anchor",
    );
    patched = replaceOnce(
      patched,
      "(0,X.jsx)(qe,{open:f,onOpenChange:L,onCloseAutoFocus:j,side:`top`,triggerButton:h,contentWidth:`menu`,",
      "(0,X.jsx)(qe,{open:I,onOpenChange:L,onCloseAutoFocus:j,side:`top`,triggerButton:CPXPST(h,u),contentWidth:`menu`,",
      "26.715 home project selector empty controlled trigger anchor",
    );
    return replaceOnce(
      patched,
      "let q=(0,X.jsx)(qe,{open:f,onOpenChange:L,onCloseAutoFocus:j,side:`top`,align:u===`hero`?`center`:`start`,disabled:s,triggerButton:h??(u===`hero`?Ge():We()),contentWidth:`workspace`,",
      "let q=(0,X.jsx)(qe,{open:I,onOpenChange:L,onCloseAutoFocus:j,side:`top`,align:u===`hero`?`center`:`start`,disabled:s,triggerButton:CPXPST(h??(u===`hero`?Ge():We()),u),contentWidth:`workspace`,",
      "26.715 home project selector workspace controlled trigger anchor",
    );
  }
  if (text.includes("function tY({activeProjectIdOverride:e,allowLocalProjects:t=!0,")) {
    let patched = replaceOnce(
      text,
      "function tY({activeProjectIdOverride:e,allowLocalProjects:t=!0,",
      `${projectSelectorSearchHook()}${projectSelectorTriggerHook("rY")}function tY({activeProjectIdOverride:e,allowLocalProjects:t=!0,`,
      "91948 home project selector helper insertion anchor",
    );
    patched = replaceOnce(
      patched,
      "let e=_.trim().toLowerCase();b=r.filter(t=>{if(!e)return!0;let n=t.repositoryData?.rootFolder??``;return[t.label,n,t.path??``,t.hostDisplayName??``].some(t=>t.toLowerCase().includes(e))});",
      "b=CPXP.fuzzyFilter(r,_);",
      "91948 home project selector fuzzy search filter anchor",
    );
    patched = replaceOnce(
      patched,
      "w=(0,ZJ.jsx)(Re,{value:_,onChange:s,placeholder:c,className:`mb-1`})",
      "w=(0,ZJ.jsx)(Re,{value:_,onChange:s,onKeyDown:e=>CPXP.acceptFirst(e,b,o,_),placeholder:c,className:`mb-1`})",
      "91948 home project selector accept first match keydown anchor",
    );
    patched = replaceOnce(
      patched,
      "(0,ZJ.jsx)(`span`,{className:`truncate`,children:e.label})",
      "(0,ZJ.jsx)(`span`,{className:`truncate`,children:CPXP.fuzzyHighlight(e.label,_,ZJ.jsx)})",
      "91948 home project selector fuzzy search highlight anchor",
    );
    patched = replaceOnce(
      patched,
      "te=c??p,ne=e=>{m(e),l?.(e)},re=n&&s===`home`",
      "te=c??p,ne=e=>{m(e),l?.(e)},CPXOH=CPXP.setOpenHandler(s,()=>{ne(!0);return!0}),re=n&&s===`home`",
      "91948 home project selector controlled open handler anchor",
    );
    patched = replaceOnce(
      patched,
      "(0,iY.jsx)(_e,{open:c,onOpenChange:ne,onCloseAutoFocus:z,side:`top`,triggerButton:u,contentWidth:`menu`,",
      "(0,iY.jsx)(_e,{open:te,onOpenChange:ne,onCloseAutoFocus:z,side:`top`,triggerButton:CPXPST(u,s),contentWidth:`menu`,",
      "91948 home project selector empty controlled trigger anchor",
    );
    return replaceOnce(
      patched,
      "let ge=(0,iY.jsx)(_e,{open:c,onOpenChange:ne,onCloseAutoFocus:z,side:`top`,align:s===`hero`?`center`:`start`,disabled:i,triggerButton:u??(s===`hero`?pe():de()),contentWidth:`workspace`,",
      "let ge=(0,iY.jsx)(_e,{open:te,onOpenChange:ne,onCloseAutoFocus:z,side:`top`,align:s===`hero`?`center`:`start`,disabled:i,triggerButton:CPXPST(u??(s===`hero`?pe():de()),s),contentWidth:`workspace`,",
      "91948 home project selector workspace controlled trigger anchor",
    );
  }
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
