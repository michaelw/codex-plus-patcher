function projectSelectorSearchHook() {
  return "let CPXP=window.CodexPlusHost.adapters.projectSelector;";
}

function projectSelectorTriggerHook() {
  return "function CPXPST(e,t){return CPXP.trigger(e,t,Me)}";
}

module.exports = {
  projectSelectorSearchHook,
  projectSelectorTriggerHook,
};
