(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;
  const required = Object.freeze([
    "native.request",
    "commands.dispatch",
    "commands.metadata",
    "context.active",
    "context.snapshot",
    "context.subscribe",
    "threadSidePanel.openFile",
    "threadSidePanel.mount",
    "review.renderBodyFromHost",
    "review.renderDiff",
    "review.context",
    "review.gitRequest",
    "review.pathValue",
    "projectSelector.acceptCurrent",
    "projectSelector.acceptFirst",
    "projectSelector.fuzzyFilter",
    "projectSelector.fuzzyHighlight",
    "projectSelector.projects",
    "projectSelector.setAcceptFirstHandler",
    "projectSelector.setProjects",
    "projectSelector.trigger",
    "sidebar.projectRowProps",
    "sidebar.projects",
    "sidebar.threadRowProps",
    "sidebar.mergeThreadRowAttributes",
    "messageComposer.userBubbleProps",
    "messageComposer.composerSurfaceProps",
    "messageComposer.activeComposerScope",
    "messageComposer.bindComposerScope",
    "messageComposer.composerScopeSnapshot",
    "messageComposer.setComposerProject",
    "messageComposer.syncComposerSurface",
    "messageComposer.subscribeComposerScope",
    "threadHeader.accessories",
    "threadHeader.notify",
    "threadHeader.snapshot",
    "threadHeader.subscribe",
    "threadHeader.title",
    "clipboard.writeText",
    "routing.openDeepRoute",
  ]);

  function resolve(path) {
    return path.split(".").reduce((value, key) => value?.[key], globalObject.CodexPlusHost.adapters);
  }

  function missing() {
    return required.filter((path) => typeof resolve(path) !== "function");
  }

  function assertRequired() {
    const absent = missing();
    if (absent.length > 0) throw new Error(`Missing required CodexPlusHost adapters: ${absent.join(", ")}`);
    return true;
  }

  globalObject.CodexPlusHost.requiredAdapterMethods = required;
  globalObject.CodexPlusHost.auditAdapters = { assertRequired, missing };
})();
