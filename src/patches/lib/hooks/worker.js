function workerHook() {
  return 'const CPXW=require("./codex-plus-worker.js"),CPXT=e=>CPXW.traceRequest(e),CPXR=(e,t,n,r)=>CPXW.repositoryTargetsFromHost(e,t,n,r,pae),CPXB=(e,t)=>CPXW.isReadOnlyBranchRequest(e,t);';
}

module.exports = {
  workerHook,
};
