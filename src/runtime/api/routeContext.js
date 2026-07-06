(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;
  let activeRouteContext = null;
  const listeners = new Set();

  function normalizeContext(context) {
    if (!context || typeof context !== "object") return null;
    const activeCwd = context.activeCwd || context.workspaceRoot || context.cwd || context.sourceProject?.cwd || "";
    if (!activeCwd) return null;
    return {
      routeId: context.routeId == null ? "" : String(context.routeId),
      sourceProject: context.sourceProject && typeof context.sourceProject === "object" ? { ...context.sourceProject } : null,
      activeCwd: String(activeCwd),
      workspaceRoot: context.workspaceRoot == null ? String(activeCwd) : String(context.workspaceRoot),
      gitRoot: context.gitRoot == null ? "" : String(context.gitRoot),
      threadId: context.threadId == null ? "" : String(context.threadId),
      branchName: context.branchName == null ? "" : String(context.branchName),
      source: context.source == null ? "" : String(context.source),
      title: context.title == null ? "" : String(context.title),
    };
  }

  function applyContextAttributes(context) {
    if (typeof document === "undefined") return;
    const targets = [
      document.body,
      document.querySelector("main"),
      document.querySelector(".app-shell-main-content-frame"),
      document.querySelector("[data-app-shell-tabs]"),
      document.querySelector("[data-app-shell-focus-area='right-panel']"),
      document.querySelector("[data-app-shell-focus-area='bottom-panel']"),
      document.querySelector("[data-testid*='terminal']"),
      document.querySelector("[class*='terminal'], [class*='Terminal']"),
    ].filter(Boolean);
    for (const target of targets) {
      if (!target?.setAttribute) continue;
      if (context?.activeCwd) {
        target.setAttribute("data-codex-plus-active-project-path", context.activeCwd);
        target.setAttribute("data-codex-plus-project-path", context.activeCwd);
        target.setAttribute("data-codex-plus-route-context-source", context.source || "");
        if (context.sourceProject?.label) target.setAttribute("data-codex-plus-project-label", context.sourceProject.label);
        if (context.title) target.setAttribute("data-codex-plus-route-title", context.title);
        if (context.workspaceRoot) target.setAttribute("data-codex-plus-workspace-root", context.workspaceRoot);
        if (context.threadId) target.setAttribute("data-codex-plus-owner-thread-id", context.threadId);
      } else {
        target.removeAttribute?.("data-codex-plus-active-project-path");
        target.removeAttribute?.("data-codex-plus-project-path");
        target.removeAttribute?.("data-codex-plus-route-context-source");
        target.removeAttribute?.("data-codex-plus-project-label");
        target.removeAttribute?.("data-codex-plus-route-title");
        target.removeAttribute?.("data-codex-plus-workspace-root");
        target.removeAttribute?.("data-codex-plus-owner-thread-id");
      }
    }
  }

  function notify() {
    const snapshot = activeRouteContext ? { ...activeRouteContext, sourceProject: activeRouteContext.sourceProject ? { ...activeRouteContext.sourceProject } : null } : null;
    for (const listener of Array.from(listeners)) listener(snapshot);
  }

  function active() {
    return activeRouteContext ? {
      ...activeRouteContext,
      sourceProject: activeRouteContext.sourceProject ? { ...activeRouteContext.sourceProject } : null,
    } : null;
  }

  function set(context) {
    activeRouteContext = normalizeContext(context);
    applyContextAttributes(activeRouteContext);
    notify();
    return { ok: true, context: active() };
  }

  function clear(routeId) {
    if (routeId && activeRouteContext?.routeId && String(routeId) !== activeRouteContext.routeId) return { ok: true, context: active() };
    activeRouteContext = null;
    applyContextAttributes(null);
    notify();
    return { ok: true, context: null };
  }

  function subscribe(listener) {
    if (typeof listener !== "function") throw new Error("Route context listeners must be functions");
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  globalObject.CodexPlus.ui.routeContext = { active, clear, set, subscribe };
  globalObject.CodexPlus.ui.projectContext = {
    active() {
      const context = active();
      if (!context) return null;
      return {
        cwd: context.activeCwd,
        label: context.sourceProject?.label || "",
        source: context.source || "",
        routeId: context.routeId,
        title: context.title || "",
        workspaceRoot: context.workspaceRoot,
        gitRoot: context.gitRoot,
        threadId: context.threadId,
        branchName: context.branchName,
      };
    },
    clear,
    set(context) {
      return set({
        routeId: context?.routeId || "",
        sourceProject: {
          id: context?.id || context?.projectId || context?.cwd || "",
          label: context?.label || "",
          cwd: context?.cwd || "",
        },
        activeCwd: context?.cwd,
        workspaceRoot: context?.workspaceRoot || context?.cwd,
        gitRoot: context?.gitRoot,
        threadId: context?.threadId,
        branchName: context?.branchName,
        source: context?.source,
        title: context?.title,
      });
    },
  };
})();
