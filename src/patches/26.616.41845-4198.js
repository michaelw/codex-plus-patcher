const { parsePlusToml, unquoteTomlValue } = require("../plus/repositories");

const oldTitle = "<title>Codex</title>";
const newTitle = "<title>Codex Plus</title>";
const titleFile = "webview/index.html";
const workerFile = ".vite/build/worker.js";
const appShellFile = "webview/assets/app-shell-DCvuE1cb.js";
const threadSidePanelTabsFile = "webview/assets/thread-side-panel-tabs-D0dd27Zf.js";

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
    `${codexPlusReviewHelpers}function uf({cwd:e,fileEntries:t,generatedPathsReady:n,hasUnhandledAttributesFiles:r,isCappedMode:i,repositorySource:a,reviewSummarySource:o}){`,
    "review helpers insertion anchor",
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

module.exports = {
  id: "codex-26.616.41845-4198",
  codexVersion: "26.616.41845",
  bundleVersion: "4198",
  asarSha256: "9d43c52872934895b2add6e291d4743ad40435ae010ba02a6e3f4d5acfd61120",
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
      fileTransforms: [[appShellFile, patchAppShell]],
    },
  ],
};
