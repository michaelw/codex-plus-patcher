function projectSelectorSearchHook() {
  return "let CPXP=window.CodexPlusHost.adapters.projectSelector,CPXPSF=(e,t)=>CPXP.fuzzyFilter(e,t),CPXPSH=(e,t)=>CPXP.fuzzyHighlight(e,t,H.jsx),CPXPSA=(e,t,n,r)=>CPXP.acceptFirst(e,t,n,r);";
}

function projectSelectorTriggerHook() {
  return "function CPXPST(e,t){return CPXP.trigger(e,t,Me)}";
}

module.exports = {
  projectSelectorSearchHook,
  projectSelectorTriggerHook,
};
