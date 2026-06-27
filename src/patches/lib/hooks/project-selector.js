function projectSelectorSearchHook() {
  return "let CPXP=window.CodexPlusHost.adapters.projectSelector;";
}

function projectSelectorTriggerHook(reactIdentifier = "Me") {
  return `function CPXPST(e,t){return CPXP.trigger(e,t,${reactIdentifier})}`;
}

module.exports = {
  projectSelectorSearchHook,
  projectSelectorTriggerHook,
};
