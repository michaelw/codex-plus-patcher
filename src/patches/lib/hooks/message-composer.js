function messageComposerHook() {
  return "let CPXMC=window.CodexPlusHost.adapters.messageComposer,CPXBubbleProps=e=>CPXMC.userBubbleProps(e),CPXSurfaceProps=e=>CPXMC.composerSurfaceProps(e);";
}

module.exports = {
  messageComposerHook,
};
