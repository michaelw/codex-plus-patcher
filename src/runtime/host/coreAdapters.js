(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;
  let nativeDispatch = null;
  let nativeContext = null;
  let nativeContextKey = "null";
  let contextNotifyScheduled = false;
  const contextListeners = new Set();
  let contextVersion = 0;

  function bridgeRequest(method, params) {
    const request = globalObject.codexPlusHostBridge?.request;
    if (typeof request !== "function") throw new Error("Missing native Codex Plus host bridge");
    return request(method, params);
  }

  function metadata() {
    return globalObject.CodexPlus.ui.commands.commandMetadata();
  }

  function dispatch(id) {
    const commandId = String(id || "");
    const plugin = globalObject.CodexPlus.commands.all().find((command) => command.id === commandId);
    if (plugin) {
      globalObject.CodexPlus.commands.run(commandId);
      return { handled: true, source: "plugin" };
    }
    if (typeof nativeDispatch !== "function") return { handled: false, source: null };
    const handled = nativeDispatch(commandId) === true;
    return { handled, source: handled ? "native" : null };
  }

  function bindNativeDispatch(dispatcher) {
    if (typeof dispatcher !== "function") throw new Error("Native command dispatcher must be a function");
    nativeDispatch = dispatcher;
  }

  function activeContext() {
    const context = globalObject.CodexPlus.ui.routeContext.active() || nativeContext;
    if (context == null) return null;
    return {
      routeId: String(context.routeId || ""),
      threadId: String(context.threadId || ""),
      cwd: String(context.cwd || ""),
      workspaceRoot: String(context.workspaceRoot || ""),
      gitRoot: String(context.gitRoot || ""),
      hostId: String(context.hostId || ""),
      branchName: String(context.branchName || ""),
      sourceProject: context.sourceProject == null ? null : { ...context.sourceProject },
    };
  }

  function notifyContext() {
    contextVersion += 1;
    for (const listener of Array.from(contextListeners)) listener();
    globalObject.CodexPlusHost.adapters.threadHeader.notify();
  }

  function contextSnapshot() {
    return contextVersion;
  }

  function subscribeContext(listener) {
    if (typeof listener !== "function") throw new Error("Context subscriber must be a function");
    contextListeners.add(listener);
    return () => contextListeners.delete(listener);
  }

  function bindActive(context) {
    const nextContext = context == null ? null : { ...context };
    const nextKey = JSON.stringify(nextContext);
    const changed = nextKey !== nativeContextKey;
    nativeContext = nextContext;
    nativeContextKey = nextKey;
    if (changed && !contextNotifyScheduled) {
      contextNotifyScheduled = true;
      Promise.resolve().then(() => {
        contextNotifyScheduled = false;
        notifyContext();
      });
    }
    return activeContext();
  }

  function setContext(context) {
    const result = globalObject.CodexPlus.ui.routeContext.set(context);
    notifyContext();
    return result;
  }

  function clearContext(routeId) {
    const result = globalObject.CodexPlus.ui.routeContext.clear(routeId);
    notifyContext();
    return result;
  }

  function writeText(text) {
    return bridgeRequest("clipboard/write-text", { text: String(text) });
  }

  function openDeepRoute(route) {
    if (typeof route !== "string" || !route.startsWith("/")) throw new Error(`Unsupported Codex Plus deep route: ${route}`);
    return bridgeRequest("routing/open-deep-route", { route });
  }

  globalObject.CodexPlusHost.adapters.native = { request: bridgeRequest };
  globalObject.CodexPlusHost.adapters.commands = { bindNativeDispatch, dispatch, metadata };
  globalObject.CodexPlusHost.adapters.context = {
    active: activeContext,
    bindActive,
    clear: clearContext,
    set: setContext,
    snapshot: contextSnapshot,
    subscribe: subscribeContext,
  };
  globalObject.CodexPlusHost.adapters.clipboard = { writeText };
  globalObject.CodexPlusHost.adapters.routing = { openDeepRoute };
})();
