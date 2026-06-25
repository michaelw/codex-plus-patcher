(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;

  function accessories(context, deps) {
    return globalObject.CodexPlus?.ui?.threadHeader?.renderAccessories?.({ context, deps }) ?? null;
  }

  globalObject.CodexPlusHost.adapters.threadHeader = { accessories };
})();
