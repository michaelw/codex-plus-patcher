(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;
  const listeners = new Set();
  let version = 0;

  function accessories(context, deps) {
    if (typeof deps?.jsx !== "function") throw new Error("Thread header adapter requires jsx");
    const active = globalObject.CodexPlusHost.adapters.context.active();
    return globalObject.CodexPlus.ui.threadHeader.renderAccessories({ context: active, deps });
  }

  function notify() {
    version += 1;
    for (const listener of Array.from(listeners)) listener();
    return { ok: true, version };
  }

  function snapshot() {
    return version;
  }

  function subscribe(listener) {
    if (typeof listener !== "function") throw new Error("Thread header subscriber must be a function");
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function title(nativeTitle) {
    const route = globalObject.CodexPlus.ui.routeContext.active();
    return route?.routeId && route.title ? route.title : nativeTitle;
  }

  globalObject.CodexPlusHost.adapters.threadHeader = { accessories, notify, snapshot, subscribe, title };
})();
