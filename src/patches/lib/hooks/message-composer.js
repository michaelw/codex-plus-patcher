function messageComposerHook(reactExpression) {
  const contextSubscription = reactExpression
    ? `,CPXCTX=window.CodexPlusHost.adapters.context;function CPXSurfaceProps(e){${reactExpression}.useSyncExternalStore(CPXCTX.subscribe,CPXCTX.snapshot,CPXCTX.snapshot);return CPXMC.composerSurfaceProps({...e,project:e&&e.project!=null?e.project:CPXCTX.active()})}`
    : ",CPXSurfaceProps=e=>CPXMC.composerSurfaceProps(e)";
  return `var CPXMC=window.CodexPlusHost.adapters.messageComposer,CPXBubbleProps=e=>CPXMC.userBubbleProps(e)${contextSubscription};`;
}

module.exports = {
  messageComposerHook,
};
