function projectColorHook() {
  return "let CPXS=window.CodexPlusHost.adapters.sidebar,CPXPR=e=>CPXS.projectRowProps(e),CPXTR=e=>CPXS.threadRowProps(e);";
}

function sidebarMergeDataAttributes(baseExpression, extraExpression) {
  return `window.CodexPlusHost.adapters.sidebar.mergeThreadRowAttributes(${baseExpression},${extraExpression})`;
}

module.exports = {
  projectColorHook,
  sidebarMergeDataAttributes,
};
