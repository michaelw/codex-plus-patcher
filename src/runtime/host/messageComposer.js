(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;

  function userBubbleProps(props) {
    return globalObject.CodexPlus?.ui?.message?.userBubbleProps?.(props);
  }

  function composerSurfaceProps(props) {
    return globalObject.CodexPlus?.ui?.composer?.surfaceProps?.(props);
  }

  globalObject.CodexPlusHost.adapters.messageComposer = {
    composerSurfaceProps,
    userBubbleProps,
  };
})();
