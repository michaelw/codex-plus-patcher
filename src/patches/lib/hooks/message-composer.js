function messageComposerHook(reactExpression) {
  const contextSubscription = reactExpression
    ? `,CPXCTX=window.CodexPlusHost.adapters.context;function CPXSurfaceProps(e){${reactExpression}.useSyncExternalStore(CPXCTX.subscribe,CPXCTX.snapshot,CPXCTX.snapshot);return CPXMC.composerSurfaceProps({...e,project:e&&e.project!=null?e.project:CPXCTX.active()})}`
    : ",CPXSurfaceProps=e=>CPXMC.composerSurfaceProps(e)";
  return `var CPXMC=window.CodexPlusHost.adapters.messageComposer,CPXBubbleProps=e=>CPXMC.userBubbleProps(e)${contextSubscription};`;
}

function composerSurfaceElementHook(jsxExpression, reactExpression) {
  if (reactExpression) {
    return `var CPXMC=window.CodexPlusHost.adapters.messageComposer,CPXComposerContext;function CPXComposerScope(e){let{native:t,project:n,newChat:r,...i}=e,a=CPXComposerContext??=${reactExpression}.createContext({});return ${jsxExpression}(a.Provider,{value:{project:n,newChat:r},children:${jsxExpression}(t,i)})}function CPXComposerSurface(e){let{native:t,...n}=e,r=CPXComposerContext??=${reactExpression}.createContext({}),i=${reactExpression}.useContext(r),o=${reactExpression}.useRef(null);return ${reactExpression}.useLayoutEffect(()=>CPXMC.syncComposerSurface(o.current,i),[i]),${jsxExpression}(t,{...n,ref:o,...CPXMC.composerSurfaceProps(i)})}`;
  }
  return `function CPXComposerSurface(e){let{native:t,...n}=e;return ${jsxExpression}(t,{...n,...CPXSurfaceProps({})})}`;
}

module.exports = {
  composerSurfaceElementHook,
  messageComposerHook,
};
