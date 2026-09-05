(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;
  const composerScopes = new Map();
  const composerScopeListeners = new Set();
  let composerProject;
  let composerProjectKnown = false;
  let composerScopeVersion = 0;

  function notifyComposerScope() {
    composerScopeVersion += 1;
    for (const listener of composerScopeListeners) listener();
  }

  function activeComposerScope() {
    const scope = Array.from(composerScopes.values()).at(-1) || {};
    return composerProjectKnown ? { ...scope, project: composerProject } : scope;
  }

  function bindComposerScope(owner, scope) {
    if (scope?.newChat === false || scope?.project != null) {
      composerProject = undefined;
      composerProjectKnown = false;
    }
    composerScopes.delete(owner);
    composerScopes.set(owner, scope || {});
    notifyComposerScope();
    return () => {
      if (!composerScopes.delete(owner)) return;
      notifyComposerScope();
    };
  }

  function setComposerProject(project) {
    composerProject = globalObject.CodexPlusHost?.adapters?.projectSelector?.resolveProject?.(project) ?? project;
    composerProjectKnown = true;
    notifyComposerScope();
  }

  function composerScopeSnapshot() {
    return composerScopeVersion;
  }

  function subscribeComposerScope(listener) {
    composerScopeListeners.add(listener);
    return () => composerScopeListeners.delete(listener);
  }

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
    activeComposerScope,
    bindComposerScope,
    composerSurfaceProps,
    composerScopeSnapshot,
    setComposerProject,
    syncComposerSurface,
    subscribeComposerScope,
    userBubbleProps,
  };
})();
