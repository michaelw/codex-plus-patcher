(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;

  function projectRowProps(project) {
    return globalObject.CodexPlus?.ui?.sidebar?.projectRowProps?.({ project });
  }

  function threadRowProps(project) {
    return globalObject.CodexPlus?.ui?.sidebar?.threadRowProps?.({ project });
  }

  function mergeThreadRowAttributes(base, extra) {
    return globalObject.CodexPlus?.ui?.sidebar?.mergeDataAttributes?.(base, extra);
  }

  globalObject.CodexPlusHost.adapters.sidebar = {
    mergeThreadRowAttributes,
    projectRowProps,
    threadRowProps,
  };
})();
