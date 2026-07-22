function threadHeaderHook() {
  return "let CPXH=window.CodexPlusHost.adapters;function CPXThreadHeaderAccessories(e){CPXH.context.bindActive(e.context);return CPXH.threadHeader.accessories(e.context,e.deps)}";
}

function threadHeaderActiveHook() {
  return "let CPXH=window.CodexPlusHost.adapters;function CPXHA(u,e){let h=CPXH.threadHeader;u(h.subscribe,h.snapshot,h.snapshot);return h.accessories(CPXH.context.active(),e)}";
}

function threadHeaderContextHook() {
  return "let CPXH=window.CodexPlusHost.adapters;function CPXBindThreadHeaderContext(e){return CPXH.context.bindActive(e)}";
}

function threadHeaderBoundTitleHook(reactExpression = "t(r(),1)") {
  return `function CPXThreadHeaderTitle(e){${reactExpression}.useSyncExternalStore(CPXH.threadHeader.subscribe,CPXH.threadHeader.snapshot,CPXH.threadHeader.snapshot);return CPXH.threadHeader.title(e)}`;
}

function threadHeaderTitleHook(reactExpression = "t(n(),1)") {
  return `let CPXH=window.CodexPlusHost.adapters.threadHeader;function CPXThreadHeaderTitle(e){${reactExpression}.useSyncExternalStore(CPXH.subscribe,CPXH.snapshot,CPXH.snapshot);return CPXH.title(e)}`;
}

module.exports = {
  threadHeaderActiveHook,
  threadHeaderBoundTitleHook,
  threadHeaderContextHook,
  threadHeaderHook,
  threadHeaderTitleHook,
};
