const { parsePlusToml, unquoteTomlValue } = require("../plus/repositories");
const { codexPlusRuntimeAssets } = require("../runtime/assets");

const oldTitle = "<title>Codex</title>";
const newTitle = '<title>Codex Plus</title><script src="./assets/codex-plus/runtime.js"></script>';
const titleFile = "webview/index.html";
const workerFile = ".vite/build/worker.js";
const appMainFile = "webview/assets/app-main-C-_HjS2P.js";
const appShellFile = "webview/assets/app-shell-DCvuE1cb.js";
const errorBoundaryFile = "webview/assets/error-boundary-DOI-M2iu.js";
const generalSettingsFile = "webview/assets/general-settings-Bit-KX17.js";
const sidebarProjectHoverCardSourceRowsFile = "webview/assets/sidebar-project-hover-card-source-rows-CYy4Y4ei.js";
const threadSidePanelTabsFile = "webview/assets/thread-side-panel-tabs-D0dd27Zf.js";
const userMessageAttachmentsFile = "webview/assets/user-message-attachments-CgyXEK9U.js";
const composerFile = "webview/assets/composer-CCuv6v-2.js";
const localTaskRowFile = "webview/assets/local-task-row-vTrSC6Rc.js";
const electronMenuShortcutsFile = "webview/assets/electron-menu-shortcuts-j6UKqTX5.js";
const keyboardShortcutsSearchInputFile = "webview/assets/keyboard-shortcuts-search-input-DjVpifwp.js";

function replaceOnce(text, oldText, newText, label) {
  const matches = text.split(oldText).length - 1;
  if (matches !== 1) throw new Error(`Expected one ${label}, found ${matches}`);
  return text.replace(oldText, newText);
}

function functionSource(fn, newName, replacements = []) {
  let source = fn.toString().replace(new RegExp(`function ${fn.name}`), `function ${newName}`);
  for (const [from, to] of replacements) source = source.replaceAll(from, to);
  return source;
}

function codexPlusWorkerHelpers() {
  const unquoteSource = functionSource(unquoteTomlValue, "CPX_unquote");
  const parseSource = functionSource(parsePlusToml, "CPX_parsePlusToml", [
    ["unquoteTomlValue", "CPX_unquote"],
  ]);
  return `
function CPX_error(e){return{name:e?.name??null,code:e?.code??null,message:e?.message??String(e)}}function CPX_trace(e,t){try{let n=require(\`node:fs\`),r={ts:new Date().toISOString(),event:e,data:t??null};n.appendFileSync(\`/tmp/codex-plus-trace.log\`,\`\${JSON.stringify(r)}\\n\`)}catch{}}function CPX_traceRequest(e){return CPX_trace(e?.event??\`trace\`,e?.data??null),{ok:!0}}${unquoteSource}${parseSource}async function CPX_readPlusToml(e,t){let n=await t.platformPath(),r=n.join(e,\`.codex\`,\`plus.toml\`),i={path:r,attempted:!0,readOk:!1,bytes:0,preview:null,error:null};CPX_trace(\`plus-toml:read-start\`,{path:r});try{let e=await new Response(await t.readFile(r)).text();return i.readOk=!0,i.bytes=e.length,i.preview=e.slice(0,300),CPX_trace(\`plus-toml:read-ok\`,{path:r,bytes:i.bytes,preview:i.preview}),{text:e,debug:i}}catch(e){return i.error=CPX_error(e),CPX_trace(\`plus-toml:read-error\`,{path:r,error:i.error}),{text:null,debug:i}}}async function CPX_repositoryTargets(e,t,n,r){CPX_trace(\`repository-targets:start\`,{cwd:t?.cwd,hostId:t?.hostId});let i=[],a=await e.getStableMetadata(t.cwd,n);if(a==null){let e={main:null,repositories:[],warnings:[{type:\`main-not-git\`,path:t.cwd,message:\`Current directory is not inside a git repository.\`}],debug:{requestCwd:t.cwd,projectRoot:null}};return CPX_trace(\`repository-targets:main-not-git\`,e),e}let o={id:\`main:\${a.root}\`,kind:\`main\`,path:\`.\`,label:\`Main\`,cwd:a.root,root:a.root,commonDir:a.commonDir,valid:!0},s=await n.platformPath(),c=(await pae(e.getWorktreeRepositoryForRoot(a.root,n),r)).map(e=>({kind:\`submodule\`,path:e,label:e.split(\`/\`).filter(Boolean).pop()||e})),l=await CPX_readPlusToml(a.root,n),u=CPX_parsePlusToml(l.text),d=u.repositories.map(e=>({kind:\`configured\`,...e})),f={requestCwd:t.cwd,projectRoot:a.root,plusToml:{...l.debug,parsedRepositories:u.repositories.length,tableCount:u.tableCount,ignoredLines:u.ignoredLines.slice(0,12)},submoduleCandidates:c.map(e=>({path:e.path,label:e.label})),configuredCandidates:d.map(e=>({path:e.path,label:e.label??null})),accepted:[],skipped:[]},p=new Set,m=[];CPX_trace(\`repository-targets:parsed\`,{projectRoot:a.root,plusToml:f.plusToml,submoduleCandidates:f.submoduleCandidates,configuredCandidates:f.configuredCandidates});function h(e){i.push(e),f.skipped.push(e),CPX_trace(\`repository-targets:skip\`,e)}async function g(t){let r=t.path.trim();if(r.length===0){h({kind:t.kind,type:\`empty-path\`,path:r,message:\`Skipped empty repository path.\`});return}if(s.isAbsolute(r)||r===\`..\`||r.startsWith(\`../\`)||r.startsWith(\`..\\\\\`)){h({kind:t.kind,type:\`out-of-root\`,path:r,message:\`Skipped repository outside project root.\`});return}let c=s.normalize(s.join(a.root,r)),l=s.relative(a.root,c);if(l===\`\`||l===\`..\`||l.startsWith(\`..\${s.sep}\`)||s.isAbsolute(l)){h({kind:t.kind,type:\`out-of-root\`,path:r,resolved:c,relative:l,message:\`Skipped repository outside project root.\`});return}let u=b3(l),d=\`\${t.kind}:\${u}\`;if(p.has(u)){h({kind:t.kind,type:\`duplicate\`,path:u,message:\`Skipped duplicate repository path.\`});return}p.add(u);let g;try{g=await e.getStableMetadata(c,n)}catch(e){g=null,h({kind:t.kind,type:\`metadata-error\`,path:u,resolved:c,error:CPX_error(e),message:\`Failed to inspect repository metadata.\`});return}if(g==null){t.kind===\`configured\`&&h({kind:t.kind,type:\`non-git\`,path:u,resolved:c,message:\`Configured repository is not a git repository.\`});return}let _={id:d,kind:t.kind,path:u,label:t.label??u,cwd:c,root:g.root,commonDir:g.commonDir,valid:!0};m.push(_),f.accepted.push({kind:t.kind,path:u,cwd:c,root:g.root}),CPX_trace(\`repository-targets:accept\`,{kind:t.kind,path:u,cwd:c,root:g.root})}for(let e of c)await g(e);for(let e of d)await g(e);let _={main:o,repositories:m,warnings:i,debug:f};return CPX_trace(\`repository-targets:done\`,{repositoryCount:m.length,warningCount:i.length,accepted:f.accepted,skipped:f.skipped}),_}`;
}

function patchTitle(text) {
  return replaceOnce(text, oldTitle, newTitle, `${oldTitle} in ${titleFile}`);
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
    "function CPX_isReadOnlyBranchRequest(e,t){return t===`codex_plus_review`&&(e===`recent-branches`||e===`search-branches`)}function u2({requestKind:e,source:t}){return l2.has(e??``)||d2(t)||CPX_isReadOnlyBranchRequest(e,t)}",
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
function CPX_repoKey(e){return e?.id??e?.cwd??e?.path??\`unknown\`}function CPX_label(e){return e?.kind===\`main\`?\`Main\`:e?.label??e?.path??\`Repository\`}function CPX_sessionKey(e,t,n){return JSON.stringify([e,t,n])}function CPXWarnings({warnings:e}){return!e||e.length===0?null:(0,$.jsx)(\`div\`,{className:\`px-3 py-2 text-xs text-token-description-foreground\`,children:e.map((e,t)=>(0,$.jsx)(\`div\`,{children:e.message??e.type??String(e)},\`\${e.type??\`warning\`}:\${e.path??t}\`))})}function CPXDebugText(e){try{return JSON.stringify(e,(e,t)=>typeof t===\`bigint\`?String(t):t,2)??\`\`}catch(t){return\`Unable to render debug object: \${t instanceof Error?t.message:String(t)}\`}}function CPXDebug({debug:e}){if(e==null)return null;let t=e.plusToml??{},n=t.readOk===!0?\`read ok\`:\`not read\`,r=String(t.parsedRepositories??0),i=CPXDebugText(e);return(0,$.jsxs)(\`details\`,{className:\`mx-3 mb-2 rounded-md border border-token-border bg-token-main-surface-secondary px-2 py-1 text-xs text-token-description-foreground\`,children:[(0,$.jsxs)(\`summary\`,{className:\`cursor-pointer select-none\`,children:[\`plus.toml debug: \`,n,\`, parsed \`,r]}),(0,$.jsx)(\`pre\`,{className:\`mt-2 max-h-72 overflow-auto whitespace-pre-wrap font-vscode-editor text-[11px] leading-4 text-token-foreground\`,children:i})]})}function CPXMainGroup({children:e,repo:t,collapsed:n,onToggle:r}){return(0,$.jsxs)(\`section\`,{className:\`border-b border-token-border-default\`,children:[(0,$.jsxs)(\`button\`,{type:\`button\`,className:\`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-token-foreground hover:bg-token-list-hover-background\`,onClick:r,"aria-expanded":!n,children:[(0,$.jsxs)(\`span\`,{className:\`min-w-0\`,children:[(0,$.jsx)(\`span\`,{className:\`font-medium\`,children:CPX_label(t)}),(0,$.jsx)(\`span\`,{className:\`ml-2 text-xs text-token-description-foreground\`,children:t?.path??\`.\`})]}),(0,$.jsx)(\`span\`,{className:\`shrink-0 text-xs text-token-description-foreground\`,children:n?\`Show\`:\`Hide\`})]}),n?null:e]})}function CPXBranchPicker({repo:e,hostConfig:t,baseBranch:n,setBaseBranch:r}){let[i,a]=(0,Q.useState)(!1),[o,s]=(0,Q.useState)([]),[c,l]=(0,Q.useState)(!1),[u,d]=(0,Q.useState)(null),[f,m]=(0,Q.useState)(\`\`),[h,g]=(0,Q.useState)([]),[_,v]=(0,Q.useState)(!1),[A0,b]=(0,Q.useState)(null),x=(n??\`\`).trim(),S=()=>{let n=new AbortController;l(!0),d(null),y(\`git\`).request({method:\`recent-branches\`,params:{root:e.root,limit:100,hostConfig:t,operationSource:\`codex_plus_review\`},signal:n.signal}).then(e=>{s(e?.branches??[])}).catch(e=>{n.signal.aborted||d(e instanceof Error?e.message:String(e))}).finally(()=>{n.signal.aborted||l(!1)});return n};(0,Q.useEffect)(()=>{if(!i)return;let e=S();return()=>e.abort()},[i,e.root,t.id]);(0,Q.useEffect)(()=>{if(!i)return;let n=f.trim();if(n.length===0){g([]),b(null),v(!1);return}let r=new AbortController,A=setTimeout(()=>{v(!0),b(null),y(\`git\`).request({method:\`search-branches\`,params:{root:e.root,query:n,limit:50,hostConfig:t,operationSource:\`codex_plus_review\`},signal:r.signal}).then(e=>{g(e?.branches??[])}).catch(e=>{r.signal.aborted||b(e instanceof Error?e.message:String(e))}).finally(()=>{r.signal.aborted||v(!1)})},250);return()=>{clearTimeout(A),r.abort()}},[i,f,e.root,t.id]);let C=x.length>0?x:\`Unstaged\`,w=x.length>0?null:\`Working tree changes\`,T=(0,$.jsxs)(Y,{type:\`button\`,color:x.length>0?\`ghostActive\`:\`ghost\`,size:\`toolbar\`,className:\`max-w-44 min-w-0 shrink-0 border-token-border px-1.5\`,children:[(0,$.jsx)(\`span\`,{className:\`min-w-0 truncate\`,children:C}),(0,$.jsx)(Je,{className:\`icon-2xs text-token-input-placeholder-foreground\`})]}),E=(0,$.jsx)(Ae,{tooltipContent:w??\`Base branch: \${C}\`,children:T}),D=(0,$.jsx)(CPXBranchPickerDropdownContent,{branches:o,selectedBranch:x,disabled:!1,isError:u!=null,isLoading:c,isSearchError:A0!=null,isSearchLoading:_,onClose:()=>a(!1),onRetry:S,onRetrySearch:()=>m(f),onSearchQueryChange:m,onSelectBranch:e=>{r(e),a(!1)},searchedBranches:h,searchQuery:f}),O=x.length>0?(0,$.jsxs)($.Fragment,{children:[(0,$.jsx)(vi.Separator,{}),(0,$.jsx)(vi.Item,{onSelect:()=>{r(\`\`),a(!1)},children:\`Show unstaged changes\`})]}):null;return(0,$.jsx)(yi,{align:\`end\`,contentWidth:\`menu\`,open:i,onOpenChange:a,triggerButton:E,children:(0,$.jsxs)($.Fragment,{children:[D,O]})})}function CPXRepoPatchGroup({repo:e,hostConfig:t,hostId:n,conversationId:r,baseBranch:i,setBaseBranch:a,collapsed:o,setCollapsed:s}){let[c,l]=(0,Q.useState)(null),[u,d]=(0,Q.useState)(!1),[f,m]=(0,Q.useState)(null),[h,g]=(0,Q.useState)(null);(0,Q.useEffect)(()=>{let r=!1,A=new AbortController;l(null),m(null),d(!0),y(\`git\`).request({method:\`current-branch\`,params:{root:e.root,hostConfig:t,operationSource:\`codex_plus_review\`},signal:A.signal}).then(e=>{r||g(e?.branch??null)}).catch(e=>{r||g(null)});let C=(i??\`\`).trim(),D=C.length>0?\`branch\`:\`unstaged\`;y(\`git\`).request({method:\`review-patch\`,params:{cwd:B(e.cwd),source:D,operationSource:\`codex_plus_review\`,hostConfig:t,...C.length>0?{baseBranch:C}:{}},signal:A.signal}).then(e=>{if(r)return;let t=e?.diff?.type===\`success\`?(e.diff.unifiedDiff??e.diff.diff??\`\`):\`\`;l(t.trim().length>0?t:null)}).catch(e=>{r||m(e instanceof Error?e.message:String(e))}).finally(()=>{r||d(!1)});return()=>{r=!0,A.abort()}},[e.cwd,e.root,t.id,i]);let _=CPX_label(e),v=e.path??\`\`,A0=(i??\`\`).trim(),b=f??(u?\`Loading diff...\`:c==null?\`No changes\`:c);return(0,$.jsxs)(\`section\`,{className:\`border-b border-token-border-default\`,children:[(0,$.jsxs)(\`div\`,{className:\`flex min-w-0 items-center gap-2 px-3 py-2\`,children:[(0,$.jsxs)(\`button\`,{type:\`button\`,className:\`min-w-0 flex-1 text-left hover:bg-token-list-hover-background\`,onClick:()=>s(!o),"aria-expanded":!o,children:[(0,$.jsx)(\`div\`,{className:\`truncate text-sm font-medium text-token-foreground\`,children:_}),(0,$.jsx)(\`div\`,{className:\`truncate text-xs text-token-description-foreground\`,children:[e.kind,v,h?\` - \${h}\`:\`\`].filter(Boolean).join(\` / \`)})]}),(0,$.jsx)(CPXBranchPicker,{repo:e,hostConfig:t,baseBranch:i,setBaseBranch:a}),(0,$.jsx)(dp,{conversationId:r,cwd:e.cwd,hostId:n,codexWorktree:!1,surface:\`review-toolbar\`,reviewToolbarCompact:!0},e.id)]}),o?null:(0,$.jsx)(\`pre\`,{className:\`mx-3 mb-3 max-h-[520px] overflow-auto whitespace-pre-wrap rounded-md border border-token-border bg-token-main-surface-secondary p-3 font-vscode-editor text-xs leading-5 text-token-foreground\`,children:b})]})}function CPXReviewMux(e){let t=s(ft),n=l(Or),r=l(Dr),i=l(kr),a=l(jr),o=t.value.routeKind===\`local-thread\`?t.value.conversationId:null,[c,u]=(0,Q.useState)(null),[d,f]=(0,Q.useState)(()=>new Map),[m,h]=(0,Q.useState)(()=>new Map),p=e.mainReviewContent,g=(0,Q.useMemo)(()=>p??(0,$.jsx)(of,e),[p,e.diffRefs,e.diffMode,e.isCappedMode,e.reviewDiffMetrics,e.showReviewGitActions]);(0,Q.useEffect)(()=>{if(n==null||i==null){u(null);return}let e=!1,t=new AbortController;y(\`git\`).request({method:\`repository-targets\`,params:{cwd:B(n),hostId:r,hostConfig:i,operationSource:\`codex_plus_review\`},signal:t.signal}).then(t=>{e||u(t)}).catch(t=>{u({main:null,repositories:[],warnings:[{type:\`load-error\`,message:t instanceof Error?t.message:String(t)}]})});return()=>{e=!0,t.abort()}},[n,r,i?.id]);let _=c?.main??(n==null?null:{id:\`main:\${n}\`,kind:\`main\`,path:\`.\`,label:\`Main\`,cwd:n}),v=_,A0=c?.repositories??[],b=[v,...A0].filter(Boolean);if(_==null||b.length<=1&&(!c?.warnings||c.warnings.length===0)&&c?.debug==null)return g;let x=CPX_sessionKey(r,o,n),S=e=>\`\${x}:\${CPX_repoKey(e)}\`,C=e=>d.get(S(e))===!0,w=(e,t)=>f(n=>{let r=new Map(n);return t?r.set(S(e),!0):r.delete(S(e)),r}),T=(e,t)=>h(n=>{let r=new Map(n);return r.set(S(e),t),r});return(0,$.jsxs)(\`div\`,{className:\`flex flex-col\`,children:[(0,$.jsx)(\`div\`,{className:\`px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-token-description-foreground\`,children:\`Codex Plus repositories\`}),(0,$.jsx)(CPXWarnings,{warnings:c?.warnings??[]}),(0,$.jsx)(CPXDebug,{debug:c?.debug}),_?(0,$.jsx)(CPXMainGroup,{repo:_,collapsed:C(_),onToggle:()=>w(_,!C(_)),children:g},CPX_repoKey(_)):g,A0.map(e=>(0,$.jsx)(CPXRepoPatchGroup,{repo:e,hostConfig:i,hostId:r,conversationId:o,baseBranch:m.get(S(e))??\`\`,setBaseBranch:t=>T(e,t),collapsed:C(e),setCollapsed:t=>w(e,t)},CPX_repoKey(e)))]})}`;

const codexPlusSubrepoDiffHelpers = `
function CPXPlainDiff({text:e}){return(0,$.jsx)(\`pre\`,{className:\`mx-3 mb-3 max-h-[520px] overflow-auto whitespace-pre-wrap rounded-md border border-token-border bg-token-main-surface-secondary p-3 font-vscode-editor text-xs leading-5 text-token-foreground\`,children:e})}function CPXRepoDiffBody({cwd:e,hostConfig:t,conversationId:n,diffMode:r,diffText:i,statusText:a,error:o,isLoading:s}){if(o!=null||s||i==null)return(0,$.jsx)(CPXPlainDiff,{text:a});let c;try{c=xr(i)}catch(e){let t=e instanceof Error?e.message:String(e);return(0,$.jsx)(CPXPlainDiff,{text:\`Unable to parse diff: \${t}\\n\\n\${i}\`})}return c==null||c.length===0?(0,$.jsx)(CPXPlainDiff,{text:a}):(0,$.jsx)(\`div\`,{className:\`mx-3 mb-3 flex flex-col gap-2\`,children:c.map((a,o)=>(0,Q.createElement)(Ma,{key:\`\${a.metadata?.newPath??a.metadata?.oldPath??o}:\${o}\`,containerClassName:\`codex-review-diff-card extension:rounded-lg\`,conversationId:n??void 0,cwd:B(e),defaultOpen:!0,diff:a,diffViewWrap:!0,expandScope:\`review\`,fullContentNextFallbackToDisk:!0,headerVariant:\`full-review\`,hostConfig:t,hunkActionsVariant:\`unstaged\`,hunkSeparators:a.metadata?.additionLines?\`line-info\`:\`metadata\`,roundedCorners:!1,showFileActions:!1,showHunkActions:!1,stickyHeader:!1,viewType:r??\`unified\`}))})}`;

function patchThreadSidePanelTabs(text) {
  let patched = replaceOnce(
    text,
    "import{r as vi,t as yi}from\"./dropdown-CTBRoADH.js\";",
    "import{r as vi,t as yi}from\"./dropdown-CTBRoADH.js\";import{t as CPXBranchPickerDropdownContent}from\"./git-branch-picker-dropdown-content-Ch_voM6R.js\";",
    "branch picker content import anchor",
  );
  patched = replaceOnce(
    patched,
    "function uf({cwd:e,fileEntries:t,generatedPathsReady:n,hasUnhandledAttributesFiles:r,isCappedMode:i,repositorySource:a,reviewSummarySource:o}){",
    `${codexPlusSubrepoDiffHelpers}${codexPlusReviewHelpers}function uf({cwd:e,fileEntries:t,generatedPathsReady:n,hasUnhandledAttributesFiles:r,isCappedMode:i,repositorySource:a,reviewSummarySource:o}){`,
    "review helpers insertion anchor",
  );
  patched = replaceOnce(
    patched,
    "function CPXRepoPatchGroup({repo:e,hostConfig:t,hostId:n,conversationId:r,baseBranch:i,setBaseBranch:a,collapsed:o,setCollapsed:s}){",
    "function CPXRepoPatchGroup({repo:e,hostConfig:t,hostId:n,conversationId:r,diffMode:A1,baseBranch:i,setBaseBranch:a,collapsed:o,setCollapsed:s}){",
    "subrepo diff mode prop anchor",
  );
  patched = replaceOnce(
    patched,
    "o?null:(0,$.jsx)(`pre`,{className:`mx-3 mb-3 max-h-[520px] overflow-auto whitespace-pre-wrap rounded-md border border-token-border bg-token-main-surface-secondary p-3 font-vscode-editor text-xs leading-5 text-token-foreground`,children:b})",
    "o?null:(0,$.jsx)(CPXRepoDiffBody,{cwd:e.cwd,hostConfig:t,conversationId:r,diffMode:A1,diffText:c,statusText:b,error:f,isLoading:u})",
    "subrepo highlighted diff body anchor",
  );
  patched = replaceOnce(
    patched,
    "CPXRepoPatchGroup,{repo:e,hostConfig:i,hostId:r,conversationId:o,baseBranch:m.get(S(e))??``",
    "CPXRepoPatchGroup,{repo:e,hostConfig:i,hostId:r,conversationId:o,diffMode:a,baseBranch:m.get(S(e))??``",
    "subrepo diff mode caller anchor",
  );
  patched = replaceOnce(
    patched,
    "className:`mx-3 mb-3 flex flex-col gap-2`",
    "className:`mx-3 mb-3 flex min-w-0 max-w-none flex-col gap-2`",
    "subrepo diff body width anchor",
  );
  patched = replaceOnce(
    patched,
    "children:c.map((a,o)=>(0,Q.createElement)(Ma,{key:`${a.metadata?.newPath??a.metadata?.oldPath??o}:${o}`,containerClassName:`codex-review-diff-card extension:rounded-lg`",
    "children:c.map((a,o)=>(0,Q.createElement)(Ma,{key:`${a.metadata?.newPath??a.metadata?.oldPath??o}:${o}`,containerClassName:`codex-review-diff-card extension:rounded-lg w-full max-w-none`",
    "subrepo diff card width anchor",
  );
  patched = replaceOnce(
    patched,
    "return(0,$.jsxs)(`div`,{className:`flex flex-col`,children:[(0,$.jsx)(`div`,{className:`px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-token-description-foreground`,children:`Codex Plus repositories`})",
    "return(0,$.jsxs)(`div`,{className:`flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto`,children:[(0,$.jsx)(`div`,{className:`px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-token-description-foreground`,children:`Codex Plus repositories`})",
    "review mux scroll container anchor",
  );
  return replaceOnce(
    patched,
    "let s;t[1]!==a||t[2]!==r||t[3]!==i?(s=(0,$.jsx)(Tf,{diffMode:a,setTabState:r,tabState:i}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];let c;",
    "let s;t[1]!==a||t[2]!==r||t[3]!==i?(s=(0,$.jsx)(CPXReviewMux,{mainReviewContent:(0,$.jsx)(Tf,{diffMode:a,setTabState:r,tabState:i})}),t[1]=a,t[2]=r,t[3]=i,t[4]=s):s=t[4];let c;",
    "review body mux anchor",
  );
}

function patchAppShell(text) {
  let patched = replaceOnce(
    text,
    "function En(e){return(0,Q.jsx)(wn,{onRetry:()=>{e.resetError()}})}",
    "function En(e){return(0,Q.jsx)(wn,{error:e.error,onRetry:()=>{e.resetError()}})}",
    "app shell error fallback prop anchor",
  );
  patched = replaceOnce(
    patched,
    "children:[r,(0,Q.jsx)(Le,{color:`secondary`,size:`default`,onClick:n,children:i})]",
    "children:[r,(0,Q.jsx)(`pre`,{className:`max-h-80 max-w-full overflow-auto whitespace-pre-wrap rounded-md border border-token-border bg-token-main-surface-secondary p-2 text-left font-vscode-editor text-[11px] leading-4 text-token-text-primary`,children:e.error?.stack??e.error?.message??String(e.error??``)}),(0,Q.jsx)(Le,{color:`secondary`,size:`default`,onClick:n,children:i})]",
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
    "function Xf(e){let t=(0,Vf.c)(9),{resetError:n,error:CPX_error,componentStack:CPX_componentStack}=e,r=ee(),CPX_errorText=CPX_error?.stack??CPX_error?.message??String(CPX_error??``),i,a;",
    "webview error boundary fallback prop anchor",
  );
  patched = replaceOnce(
    patched,
    "children:[i,a,(0,$.jsxs)(`div`,{className:`flex flex-wrap items-center justify-center gap-2`,children:[o,(0,$.jsx)(m,{onClick:s,children:c})]})]",
    "children:[i,a,CPX_errorText?(0,$.jsx)(`pre`,{className:`max-h-80 max-w-full overflow-auto whitespace-pre-wrap rounded-md border border-token-border bg-token-main-surface-secondary p-2 text-left font-vscode-editor text-[11px] leading-4 text-token-text-primary`,children:[CPX_errorText,CPX_componentStack?`\\n\\n${CPX_componentStack}`:``].join(``)}):null,(0,$.jsxs)(`div`,{className:`flex flex-wrap items-center justify-center gap-2`,children:[o,(0,$.jsx)(m,{onClick:s,children:c})]})]",
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
const CPX_PROJECT_COLORS_ENABLED_KEY=\`codex-plus:project-colors-enabled\`,CPX_PROJECT_COLOR_EVENT=\`codex-plus:project-colors-change\`,CPX_PROJECT_PALETTE=[[\`#5b8ff9\`,\`#dbeafe\`,\`#1d4ed8\`,\`#f8fbff\`],[\`#61dDAA\`,\`#dcfce7\`,\`#15803d\`,\`#f7fff9\`],[\`#65789b\`,\`#e0e7ff\`,\`#4338ca\`,\`#f8faff\`],[\`#f6bd16\`,\`#fef3c7\`,\`#b45309\`,\`#fffdf5\`],[\`#7262fd\`,\`#ede9fe\`,\`#6d28d9\`,\`#fbf8ff\`],[\`#78d3f8\`,\`#e0f2fe\`,\`#0369a1\`,\`#f5fcff\`],[\`#9661bc\`,\`#f3e8ff\`,\`#7e22ce\`,\`#fdf7ff\`],[\`#f6903d\`,\`#ffedd5\`,\`#c2410c\`,\`#fff9f4\`],[\`#008685\`,\`#ccfbf1\`,\`#0f766e\`,\`#f5fffd\`],[\`#f08bb4\`,\`#fce7f3\`,\`#be185d\`,\`#fff7fb\`],[\`#6dc8ec\`,\`#e0f7ff\`,\`#0e7490\`,\`#f5fdff\`],[\`#8d70f8\`,\`#ede9fe\`,\`#5b21b6\`,\`#faf8ff\`],[\`#c2c8d5\`,\`#e5e7eb\`,\`#4b5563\`,\`#fbfbfc\`],[\`#ff9d4d\`,\`#fee2e2\`,\`#b91c1c\`,\`#fff7f7\`],[\`#269a99\`,\`#d1fae5\`,\`#047857\`,\`#f6fffb\`],[\`#ff99c3\`,\`#fce7f3\`,\`#be123c\`,\`#fff8fb\`],[\`#4c78a8\`,\`#dbeafe\`,\`#1e40af\`,\`#f8fbff\`],[\`#72b7b2\`,\`#ccfbf1\`,\`#0f766e\`,\`#f5fffd\`],[\`#54a24b\`,\`#dcfce7\`,\`#166534\`,\`#f7fff7\`],[\`#eeca3b\`,\`#fef9c3\`,\`#a16207\`,\`#fffdf2\`],[\`#b279a2\`,\`#fce7f3\`,\`#9d174d\`,\`#fff7fb\`],[\`#ff9da6\`,\`#ffe4e6\`,\`#be123c\`,\`#fff7f8\`],[\`#9d755d\`,\`#ffedd5\`,\`#9a3412\`,\`#fff9f4\`],[\`#bab0ac\`,\`#e7e5e4\`,\`#57534e\`,\`#fbfaf9\`],[\`#7f7f7f\`,\`#e5e7eb\`,\`#374151\`,\`#fafafa\`],[\`#bcbd22\`,\`#fef9c3\`,\`#854d0e\`,\`#fffdf2\`],[\`#17becf\`,\`#cffafe\`,\`#0e7490\`,\`#f5feff\`],[\`#1f77b4\`,\`#dbeafe\`,\`#1d4ed8\`,\`#f7fbff\`],[\`#2ca02c\`,\`#dcfce7\`,\`#15803d\`,\`#f7fff7\`],[\`#9467bd\`,\`#f3e8ff\`,\`#7e22ce\`,\`#fcf7ff\`],[\`#8c564b\`,\`#fee2e2\`,\`#991b1b\`,\`#fff7f6\`],[\`#e377c2\`,\`#fce7f3\`,\`#be185d\`,\`#fff8fb\`]];function CPX_readBool(e,t){try{let n=localStorage.getItem(e);return n==null?t:n===\`true\`}catch{return t}}function CPX_writeBool(e,t){try{localStorage.setItem(e,t?\`true\`:\`false\`),window.dispatchEvent(new CustomEvent(CPX_PROJECT_COLOR_EVENT,{detail:{key:e,value:t}}))}catch{}}function CPX_projectColorsEnabled(){return CPX_readBool(CPX_PROJECT_COLORS_ENABLED_KEY,!0)}function CPX_hash(e){let t=2166136261;for(let n=0;n<e.length;n++)t^=e.charCodeAt(n),t=Math.imul(t,16777619);return t>>>0}function CPX_projectColorKey(e){if(e==null)return\`\`;if(typeof e===\`string\`)return e.trim();let t=e.projectId??e.id;if(t!=null&&String(t).trim()!==\`\`)return String(t).trim();let n=e.hostId??e.host??e.remoteHostId??\`local\`,r=e.path??e.cwd??e.projectPath??e.remotePath??e.root??e.workspaceRoot;return r!=null&&String(r).trim()!==\`\`?\`\${n}:\${r}\`:[e.label,e.name].filter(Boolean).join(\`:\`)}function CPX_projectColor(e){let t=CPX_projectColorKey(e);return CPX_PROJECT_PALETTE[CPX_hash(t)%CPX_PROJECT_PALETTE.length]}function CPX_projectColorStyle(e){let a=CPX_projectColorKey(e);if(!CPX_projectColorsEnabled()||a.trim()===\`\`)return void 0;let[t,n,r,i]=CPX_projectColor(a);return{"--codex-plus-project-accent":t,"--codex-plus-project-bg-light":n,"--codex-plus-project-fg-light":r,"--codex-plus-project-soft-light":i,"--codex-plus-project-bg-dark":\`color-mix(in srgb, \${t} 24%, transparent)\`,"--codex-plus-project-fg-dark":\`#f8fafc\`,"--codex-plus-project-border-dark":\`color-mix(in srgb, \${t} 62%, transparent)\`,"--codex-plus-project-separator-light":\`rgba(17,24,39,.24)\`,"--codex-plus-project-separator-dark":\`rgba(255,255,255,.34)\`,borderLeft:\`6px solid \${t}\`}}function CPX_projectColorDataAttributes(e,t){let n=CPX_projectColorStyle(e);return n==null?void 0:{"data-codex-plus-project-color":\`\`,...(t?{"data-codex-plus-project-sidebar-color":\`\`}:{}),style:n}}function CPX_installProjectColorStyles(){if(typeof document===\`undefined\`)return;let e=\`codex-plus-project-colors\`;document.getElementById(e)==null&&document.head?.appendChild(Object.assign(document.createElement(\`style\`),{id:e,textContent:\`:root:not(.dark):not(.electron-dark) [data-codex-plus-project-sidebar-color]{border-radius:0;background-color:var(--codex-plus-project-soft-light);border-left-color:var(--codex-plus-project-accent)}:root.dark [data-codex-plus-project-sidebar-color],:root.electron-dark [data-codex-plus-project-sidebar-color]{border-radius:0;background-color:var(--codex-plus-project-bg-dark);border-left-color:var(--codex-plus-project-border-dark)}:root:not(.dark):not(.electron-dark) [data-codex-plus-project-color]{border-left-color:var(--codex-plus-project-accent)}:root.dark [data-codex-plus-project-color],:root.electron-dark [data-codex-plus-project-color]{border-left-color:var(--codex-plus-project-border-dark)}:root:not(.dark):not(.electron-dark) [data-codex-plus-project-color]:not([data-codex-plus-project-sidebar-color]){background-image:linear-gradient(to right,var(--codex-plus-project-separator-light),var(--codex-plus-project-separator-light));background-repeat:no-repeat;background-size:2px 100%;background-position:left top}:root.dark [data-codex-plus-project-color]:not([data-codex-plus-project-sidebar-color]),:root.electron-dark [data-codex-plus-project-color]:not([data-codex-plus-project-sidebar-color]){background-image:linear-gradient(to right,var(--codex-plus-project-separator-dark),var(--codex-plus-project-separator-dark));background-repeat:no-repeat;background-size:2px 100%;background-position:left top}\`}))}CPX_installProjectColorStyles();
`;

const codexPlusSidebarNameBlurHelpers = `
function CPX_installSidebarNameBlurStyles(){if(typeof document===\`undefined\`)return;let e=\`codex-plus-sidebar-name-blur\`;document.getElementById(e)==null&&document.head?.appendChild(Object.assign(document.createElement(\`style\`),{id:e,textContent:\`:root[data-codex-plus-sidebar-names-blurred="true"] :is([data-thread-title],[data-codex-plus-sidebar-name]){filter:blur(4px);user-select:none}\`}))}function CPX_toggleSidebarNameBlur(){if(typeof document===\`undefined\`)return;let e=document.documentElement,t=e.getAttribute(\`data-codex-plus-sidebar-names-blurred\`)===\`true\`;t?e.removeAttribute(\`data-codex-plus-sidebar-names-blurred\`):e.setAttribute(\`data-codex-plus-sidebar-names-blurred\`,\`true\`)}function CPXSidebarNameBlurCommand(){CPX_installSidebarNameBlurStyles();Hp(\`codexPlusToggleSidebarNameBlur\`,()=>{CPX_toggleSidebarNameBlur()},{menuItem:{id:\`codexPlusToggleSidebarNameBlur\`,groupKey:\`suggested\`,render:e=>(0,Z.jsx)(Zy,{value:\`Toggle sidebar blur\`,title:\`Toggle sidebar blur\`,description:\`Blur or show sidebar chat and project names\`,onSelect:()=>{CPX_toggleSidebarNameBlur(),e?.()}},\`codex-plus-toggle-sidebar-name-blur\`)}});return null}
`;

const codexPlusUserBubbleSettingsHelpers = `
const CPX_USER_BUBBLE_COLORS_KEY=\`codex-plus:user-message-bubble-colors\`,CPX_USER_BUBBLE_COLORS_EVENT=\`codex-plus:user-message-bubble-colors-change\`;function CPX_isUserBubbleColor(e){return typeof e===\`string\`&&/^#[0-9a-fA-F]{6}$/.test(e)}function CPX_defaultUserBubbleColor(e){return e===\`dark\`?\`#2f2f2f\`:\`#f2f2f2\`}function CPX_isStoredUserBubbleColor(e,t){return CPX_isUserBubbleColor(t)&&t.toLowerCase()!==CPX_defaultUserBubbleColor(e)}function CPX_readUserBubbleColors(){try{let e=JSON.parse(localStorage.getItem(CPX_USER_BUBBLE_COLORS_KEY)??\`{}\`)??{};return{light:CPX_isStoredUserBubbleColor(\`light\`,e.light)?e.light:\`\`,dark:CPX_isStoredUserBubbleColor(\`dark\`,e.dark)?e.dark:\`\`}}catch{return{light:\`\`,dark:\`\`}}}function CPX_writeUserBubbleColor(e,t){let n=CPX_readUserBubbleColors();CPX_isStoredUserBubbleColor(e,t)?n[e]=t:delete n[e],localStorage.setItem(CPX_USER_BUBBLE_COLORS_KEY,JSON.stringify(n)),window.dispatchEvent(new CustomEvent(CPX_USER_BUBBLE_COLORS_EVENT,{detail:n}))}function CPXUserBubbleColorRow({variant:e,label:t,ariaLabel:n}){let[r,i]=(0,X.useState)(()=>CPX_readUserBubbleColors()[e]||CPX_defaultUserBubbleColor(e));return(0,X.useEffect)(()=>{let t=()=>i(CPX_readUserBubbleColors()[e]||CPX_defaultUserBubbleColor(e));return window.addEventListener(CPX_USER_BUBBLE_COLORS_EVENT,t),()=>window.removeEventListener(CPX_USER_BUBBLE_COLORS_EVENT,t)},[e]),(0,Z.jsx)(J,{control:(0,Z.jsx)(sn,{ariaLabel:n,value:r,onChange:t=>{i(t),CPX_writeUserBubbleColor(e,t)}}),label:t,variant:\`nested\`})}
`;

const codexPlusProjectColorSettingsHelpers = `
${codexPlusProjectColorHelpers}function CPXProjectColorToggleRow({label:e,ariaLabel:t}){let[n,r]=(0,X.useState)(()=>CPX_projectColorsEnabled());return(0,X.useEffect)(()=>{let e=()=>r(CPX_projectColorsEnabled());return window.addEventListener(CPX_PROJECT_COLOR_EVENT,e),()=>window.removeEventListener(CPX_PROJECT_COLOR_EVENT,e)},[]),(0,Z.jsx)(J,{control:(0,Z.jsx)(q,{checked:n,onChange:e=>{r(e),CPX_writeBool(CPX_PROJECT_COLORS_ENABLED_KEY,e)},ariaLabel:t}),label:e,variant:\`nested\`})}
`;

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
const CPX_USER_BUBBLE_COLORS_KEY=\`codex-plus:user-message-bubble-colors\`,CPX_USER_BUBBLE_COLORS_EVENT=\`codex-plus:user-message-bubble-colors-change\`;function CPX_isUserBubbleColor(e){return typeof e===\`string\`&&/^#[0-9a-fA-F]{6}$/.test(e)}function CPX_defaultUserBubbleColor(e){return e===\`dark\`?\`#2f2f2f\`:\`#f2f2f2\`}function CPX_isStoredUserBubbleColor(e,t){return CPX_isUserBubbleColor(t)&&t.toLowerCase()!==CPX_defaultUserBubbleColor(e)}function CPX_readUserBubbleColors(){try{let e=JSON.parse(localStorage.getItem(CPX_USER_BUBBLE_COLORS_KEY)??\`{}\`)??{};return{light:CPX_isStoredUserBubbleColor(\`light\`,e.light)?e.light:null,dark:CPX_isStoredUserBubbleColor(\`dark\`,e.dark)?e.dark:null}}catch{return{light:null,dark:null}}}function CPX_userBubbleTextColor(e){let t=parseInt(e.slice(1,3),16),n=parseInt(e.slice(3,5),16),r=parseInt(e.slice(5,7),16),i=e=>{let t=e/255;return t<=.03928?t/12.92:Math.pow((t+.055)/1.055,2.4)},a=.2126*i(t)+.7152*i(n)+.0722*i(r),o=(a+.05)/.05,s=(a+.05)/(.0056+.05),l=1.05/(a+.05);return s>=4.5&&s>=l?\`#111111\`:o>=l?\`#000000\`:\`#ffffff\`}function CPX_setUserBubbleVars(){let e=CPX_readUserBubbleColors(),t=document.documentElement;for(let n of[\`light\`,\`dark\`]){let r=e[n];r==null?(t.style.removeProperty(\`--codex-plus-user-bubble-\${n}-bg\`),t.style.removeProperty(\`--codex-plus-user-bubble-\${n}-fg\`)):(t.style.setProperty(\`--codex-plus-user-bubble-\${n}-bg\`,r),t.style.setProperty(\`--codex-plus-user-bubble-\${n}-fg\`,CPX_userBubbleTextColor(r)))}}function CPX_installUserBubbleColors(){if(typeof document===\`undefined\`)return;let e=\`codex-plus-user-bubble-colors\`;document.getElementById(e)==null&&document.head?.appendChild(Object.assign(document.createElement(\`style\`),{id:e,textContent:\`:root:not(.dark):not(.electron-dark) :is([data-codex-plus-user-bubble],[data-codex-plus-user-entry]){background-color:var(--codex-plus-user-bubble-light-bg);color:var(--codex-plus-user-bubble-light-fg)}:root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry] :is(.ProseMirror,.ProseMirror *,textarea,[contenteditable="true"],[data-placeholder]),:root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry] :is(button:not([class*="bg-token-foreground"]),[role="button"]:not([class*="bg-token-foreground"]),button:not([class*="bg-token-foreground"]) svg,[role="button"]:not([class*="bg-token-foreground"]) svg,[class*="text-token-foreground"],[class*="text-token-description-foreground"],[class*="text-token-input-placeholder-foreground"],[class*="text-token-text-link-foreground"],[class*="text-token-editor-warning-foreground"]){color:var(--codex-plus-user-bubble-light-fg)}:root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry] :is([data-placeholder],[class*="text-token-input-placeholder-foreground"])::before,:root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry] :is([data-placeholder],[class*="text-token-input-placeholder-foreground"])::after,:root:not(.dark):not(.electron-dark) [data-codex-plus-user-entry] :is(input,textarea,[contenteditable="true"],[class*="placeholder:text-token-input-placeholder-foreground"])::placeholder{color:var(--codex-plus-user-bubble-light-fg)}:root.dark :is([data-codex-plus-user-bubble],[data-codex-plus-user-entry]),:root.electron-dark :is([data-codex-plus-user-bubble],[data-codex-plus-user-entry]){background-color:var(--codex-plus-user-bubble-dark-bg);color:var(--codex-plus-user-bubble-dark-fg)}:root.dark [data-codex-plus-user-entry] :is(.ProseMirror,.ProseMirror *,textarea,[contenteditable="true"],[data-placeholder]),:root.electron-dark [data-codex-plus-user-entry] :is(.ProseMirror,.ProseMirror *,textarea,[contenteditable="true"],[data-placeholder]),:root.dark [data-codex-plus-user-entry] :is(button:not([class*="bg-token-foreground"]),[role="button"]:not([class*="bg-token-foreground"]),button:not([class*="bg-token-foreground"]) svg,[role="button"]:not([class*="bg-token-foreground"]) svg,[class*="text-token-foreground"],[class*="text-token-description-foreground"],[class*="text-token-input-placeholder-foreground"],[class*="text-token-text-link-foreground"],[class*="text-token-editor-warning-foreground"]),:root.electron-dark [data-codex-plus-user-entry] :is(button:not([class*="bg-token-foreground"]),[role="button"]:not([class*="bg-token-foreground"]),button:not([class*="bg-token-foreground"]) svg,[role="button"]:not([class*="bg-token-foreground"]) svg,[class*="text-token-foreground"],[class*="text-token-description-foreground"],[class*="text-token-input-placeholder-foreground"],[class*="text-token-text-link-foreground"],[class*="text-token-editor-warning-foreground"]){color:var(--codex-plus-user-bubble-dark-fg)}:root.dark [data-codex-plus-user-entry] :is([data-placeholder],[class*="text-token-input-placeholder-foreground"])::before,:root.dark [data-codex-plus-user-entry] :is([data-placeholder],[class*="text-token-input-placeholder-foreground"])::after,:root.dark [data-codex-plus-user-entry] :is(input,textarea,[contenteditable="true"],[class*="placeholder:text-token-input-placeholder-foreground"])::placeholder,:root.electron-dark [data-codex-plus-user-entry] :is([data-placeholder],[class*="text-token-input-placeholder-foreground"])::before,:root.electron-dark [data-codex-plus-user-entry] :is([data-placeholder],[class*="text-token-input-placeholder-foreground"])::after,:root.electron-dark [data-codex-plus-user-entry] :is(input,textarea,[contenteditable="true"],[class*="placeholder:text-token-input-placeholder-foreground"])::placeholder{color:var(--codex-plus-user-bubble-dark-fg)}\`})),CPX_setUserBubbleVars(),window.addEventListener(CPX_USER_BUBBLE_COLORS_EVENT,CPX_setUserBubbleVars)}CPX_installUserBubbleColors();
`;

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
    'import{Aa as x,Ta as S}from"./src-C7fSIbpz.js";',
    'import{Aa as x,Ta as S}from"./src-C7fSIbpz.js";import{t as CPX_localThreadKey}from"./sidebar-thread-keys-xpkHnzZL.js";import{s as CPX_threadProjectId}from"./sidebar-thread-row-signals-DVmC0DJ3.js";',
    "user bubble project assignment imports anchor",
  );
  patched = replaceOnce(
    patched,
    "const CPX_USER_BUBBLE_COLORS_KEY=`codex-plus:user-message-bubble-colors`,",
    `${codexPlusProjectColorHelpers}const CPX_USER_BUBBLE_COLORS_KEY=\`codex-plus:user-message-bubble-colors\`,`,
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
    'import{$t as q,A as oe,At as se,Ca as ce,D as J,Dt as le,Ea as ue,Fi as de,Ht as fe,Ii as pe,It as me,J as he,Jn as ge,Li as _e,Lt as ve,M as ye,Mi as be,Mt as xe,Pi as Se,Ri as Ce,Sa as we,T as Te,Vt as Ee,Yn as De,Zi as Oe,an as ke,bt as Ae,cn as je,dt as Me,en as Ne,ft as Pe,in as Fe,kt as Ie,ln as Le,m as Re,n as ze,on as Be,ot as Ve,p as He,pa as Ue,ra as We,rn as Ge,sn as Ke,st as qe,tr as Je,vt as Ye,xa as Xe,yt as Ze,z as Qe}from"./thread-context-inputs-CF11za43.js";',
    'import{$t as q,A as oe,At as se,Ca as ce,D as J,Dt as le,Ea as ue,Fi as de,Ht as fe,Ii as pe,It as me,J as he,Jn as ge,Li as _e,Lt as ve,M as ye,Mi as be,Mt as xe,Pi as Se,Ri as Ce,Sa as we,T as Te,Vt as Ee,Yn as De,Zi as Oe,an as ke,bt as Ae,cn as je,dt as Me,en as Ne,ft as Pe,in as Fe,kt as Ie,ln as Le,m as Re,n as ze,on as Be,ot as Ve,p as He,pa as Ue,ra as We,rn as Ge,sn as Ke,st as qe,tr as Je,vt as Ye,xa as Xe,yt as Ze,z as Qe}from"./thread-context-inputs-CF11za43.js";import{t as CPX_localThreadKey}from"./sidebar-thread-keys-xpkHnzZL.js";import{s as CPX_threadProjectId}from"./sidebar-thread-row-signals-DVmC0DJ3.js";',
    "composer project assignment imports anchor",
  );
  patched = replaceOnce(
    patched,
    "const CPX_USER_BUBBLE_COLORS_KEY=`codex-plus:user-message-bubble-colors`,",
    `${codexPlusProjectColorHelpers}const CPX_USER_BUBBLE_COLORS_KEY=\`codex-plus:user-message-bubble-colors\`,`,
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
    "Il=(0,Q.jsx)(_n,{onOpen:()=>{Bc.prepare(),X.toggleContextSuggestions()}});return",
    "Il=(0,Q.jsx)(_n,{onOpen:()=>{Bc.prepare(),X.toggleContextSuggestions()}}),CPX_composerThreadProjectId=a(CPX_threadProjectId,G==null?null:CPX_localThreadKey(G)),CPX_composerProjectStyle=CPX_projectColorStyle(G==null?On?{hostId:On.hostId,path:On.remotePath,projectId:kn,label:On.label??On.name}:x??void 0:CPX_composerThreadProjectId);return",
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
    "):(0,Q.jsxs)(ah,{className:A,externalFooterVariant:k,inert:Y,isDragActive:jo,layout:Nl,onDragEnter:kl?void 0:il,onDragOver:kl?void 0:sl,onDragLeave:kl?void 0:al,onDrop:kl?void 0:ll,children:",
    "):(0,Q.jsxs)(ah,{className:A,externalFooterVariant:k,inert:Y,isDragActive:jo,layout:Nl,style:!Ge&&!Hn?CPX_composerProjectStyle:void 0,onDragEnter:kl?void 0:il,onDragOver:kl?void 0:sl,onDragLeave:kl?void 0:al,onDrop:kl?void 0:ll,children:",
    "composer project accent style caller anchor",
  );
}

function patchElectronMenuShortcuts(text) {
  return replaceOnce(
    text,
    "{id:`toggleSidebar`,titleIntlId:`codex.command.toggleSidebar`,descriptionIntlId:`codex.commandDescription.toggleSidebar`,commandMenuGroupKey:`panels`,commandMenu:!0,electron:{menuTitle:`Toggle Sidebar`,menuTitleIntlId:`codex.commandMenuTitle.toggleSidebar`,defaultKeybindings:[{key:`CmdOrCtrl+B`}]}},{id:`toggleBottomPanel`,",
    "{id:`toggleSidebar`,titleIntlId:`codex.command.toggleSidebar`,descriptionIntlId:`codex.commandDescription.toggleSidebar`,commandMenuGroupKey:`panels`,commandMenu:!0,electron:{menuTitle:`Toggle Sidebar`,menuTitleIntlId:`codex.commandMenuTitle.toggleSidebar`,defaultKeybindings:[{key:`CmdOrCtrl+B`}]}},{id:`codexPlusToggleSidebarNameBlur`,titleIntlId:`codexPlus.command.toggleSidebarNameBlur`,descriptionIntlId:`codexPlus.commandDescription.toggleSidebarNameBlur`,commandMenuGroupKey:`panels`,commandMenu:!0,electron:{menuTitle:`Toggle sidebar blur`,menuTitleIntlId:`codexPlus.commandMenuTitle.toggleSidebarNameBlur`,defaultKeybindings:[]}},{id:`toggleBottomPanel`,",
    "sidebar blur command palette metadata anchor",
  );
}

function patchKeyboardShortcutsSearchInput(text) {
  let patched = replaceOnce(
    text,
    "\"codex.command.toggleSidebar\":{id:`codex.command.toggleSidebar`,defaultMessage:`Toggle sidebar`,description:`Command menu item to toggle the sidebar`},\"codex.command.toggleBottomPanel\":",
    "\"codex.command.toggleSidebar\":{id:`codex.command.toggleSidebar`,defaultMessage:`Toggle sidebar`,description:`Command menu item to toggle the sidebar`},\"codexPlus.command.toggleSidebarNameBlur\":{id:`codexPlus.command.toggleSidebarNameBlur`,defaultMessage:`Toggle sidebar blur`,description:`Command menu item to blur or show sidebar names`},\"codex.command.toggleBottomPanel\":",
    "sidebar blur command title intl message anchor",
  );
  patched = replaceOnce(
    patched,
    "\"codex.commandMenuTitle.toggleSidebar\":{id:`codex.commandMenuTitle.toggleSidebar`,defaultMessage:`Toggle Sidebar`,description:`Native menu item to toggle the sidebar`},\"codex.commandMenuTitle.toggleBottomPanel\":",
    "\"codex.commandMenuTitle.toggleSidebar\":{id:`codex.commandMenuTitle.toggleSidebar`,defaultMessage:`Toggle Sidebar`,description:`Native menu item to toggle the sidebar`},\"codexPlus.commandMenuTitle.toggleSidebarNameBlur\":{id:`codexPlus.commandMenuTitle.toggleSidebarNameBlur`,defaultMessage:`Toggle sidebar blur`,description:`Native menu item to blur or show sidebar names`},\"codex.commandMenuTitle.toggleBottomPanel\":",
    "sidebar blur command menu title intl message anchor",
  );
  return replaceOnce(
    patched,
    "\"codex.commandDescription.toggleSidebar\":{id:`codex.commandDescription.toggleSidebar`,defaultMessage:`Show or hide the sidebar`,description:`Description for the Toggle sidebar command`},\"codex.commandDescription.toggleBottomPanel\":",
    "\"codex.commandDescription.toggleSidebar\":{id:`codex.commandDescription.toggleSidebar`,defaultMessage:`Show or hide the sidebar`,description:`Description for the Toggle sidebar command`},\"codexPlus.commandDescription.toggleSidebarNameBlur\":{id:`codexPlus.commandDescription.toggleSidebarNameBlur`,defaultMessage:`Blur or show sidebar chat and project names`,description:`Description for the Toggle sidebar blur command`},\"codex.commandDescription.toggleBottomPanel\":",
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

module.exports = {
  id: "codex-26.616.41845-4198",
  codexVersion: "26.616.41845",
  bundleVersion: "4198",
  asarSha256: "9d43c52872934895b2add6e291d4743ad40435ae010ba02a6e3f4d5acfd61120",
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
};
