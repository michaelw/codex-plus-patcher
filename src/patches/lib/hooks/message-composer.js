function messageComposerHook(reactExpression) {
  const contextSubscription = reactExpression
    ? `,CPXCTX=window.CodexPlusHost.adapters.context;function CPXSurfaceProps(e){${reactExpression}.useSyncExternalStore(CPXCTX.subscribe,CPXCTX.snapshot,CPXCTX.snapshot);return CPXMC.composerSurfaceProps({...e,project:e&&e.project!=null?e.project:CPXCTX.active()})}`
    : ",CPXSurfaceProps=e=>CPXMC.composerSurfaceProps(e)";
  return `var CPXMC=window.CodexPlusHost.adapters.messageComposer,CPXBubbleProps=e=>CPXMC.userBubbleProps(e)${contextSubscription};`;
}

function composerSurfaceElementHook(jsxExpression, reactExpression) {
  if (reactExpression) {
    return `var CPXMS=window.CodexPlusHost.adapters.messageComposer,CPXComposerContext;function CPXComposerScope(e){let{native:t,project:n,newChat:r,bridge:i,...o}=e,a=CPXComposerContext??=${reactExpression}.createContext({}),s=${reactExpression}.useRef({}).current;return ${reactExpression}.useLayoutEffect(()=>i?CPXMS.bindComposerScope(s,{project:n,newChat:r}):void 0,[i,n,r]),${jsxExpression}(a.Provider,{value:{project:n,newChat:r},children:${jsxExpression}(t,o)})}function CPXComposerSurface(e){let{native:t,...n}=e,r=CPXComposerContext??=${reactExpression}.createContext({}),i=${reactExpression}.useContext(r),o=${reactExpression}.useRef(null);${reactExpression}.useSyncExternalStore(CPXMS.subscribeComposerScope,CPXMS.composerScopeSnapshot,CPXMS.composerScopeSnapshot);let a=(Object.hasOwn(i,\`project\`)?true:Object.hasOwn(i,\`newChat\`))?i:CPXMS.activeComposerScope();return ${reactExpression}.useLayoutEffect(()=>CPXMS.syncComposerSurface(o.current,a),[a]),${jsxExpression}(t,{...n,ref:o,...CPXMS.composerSurfaceProps(a)})}`;
  }
  return `function CPXComposerSurface(e){let{native:t,...n}=e;return ${jsxExpression}(t,{...n,...CPXSurfaceProps({})})}`;
}

module.exports = {
  composerSurfaceElementHook,
  messageComposerHook,
};
