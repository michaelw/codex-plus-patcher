function threadHeaderHook() {
  return "let CPXTH=window.CodexPlusHost.adapters.threadHeader;function CPXThreadHeaderAccessories(e){return CPXTH.accessories(e.context,e.deps)}";
}

module.exports = {
  threadHeaderHook,
};
