(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;

  function userBubbleProps(props) {
    return globalObject.CodexPlus?.ui?.message?.userBubbleProps?.(props);
  }

  function composerSurfaceProps(props) {
    return globalObject.CodexPlus?.ui?.composer?.surfaceProps?.(props);
  }

  function syncComposerSurface(element, props) {
    return globalObject.CodexPlus?.ui?.composer?.syncSurface?.(element, props);
  }

  globalObject.CodexPlusHost.adapters.messageComposer = {
    composerSurfaceProps,
    syncComposerSurface,
    userBubbleProps,
  };
})();
