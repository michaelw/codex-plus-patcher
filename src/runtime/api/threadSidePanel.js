(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;

  function hostAdapter() {
    return globalObject.CodexPlusHost.adapters.threadSidePanel;
  }

  function mount() {
    return hostAdapter().mount();
  }

  function activeTabId() {
    const host = mount();
    if (typeof host.activeTabId !== "function") throw new Error("Thread side panel mount does not expose activeTabId");
    return host.activeTabId();
  }

  function closeTab(tabId) {
    const host = mount();
    if (typeof host.closeTab !== "function") throw new Error("Thread side panel mount does not expose closeTab");
    return host.closeTab(tabId);
  }

  function openTab(tab) {
    const host = mount();
    if (typeof host.openTab !== "function") throw new Error("Thread side panel mount does not expose openTab");
    return host.openTab(tab);
  }

  function registerTabProvider(provider) {
    const host = mount();
    if (typeof host.registerTabProvider !== "function") throw new Error("Thread side panel mount does not expose registerTabProvider");
    return host.registerTabProvider(provider);
  }

  async function openFile(file) {
    if (!file?.path) throw new Error("Thread side panel files require a path");
    const context = globalObject.CodexPlusHost.adapters.context.active();
    const filePath = String(file.path);
    const cwd = String(file.cwd || context?.cwd || "");
    const options = {
      activate: true,
      endLine: file.endLine == null ? file.line : file.endLine,
      hostId: file.hostId == null ? context?.hostId || undefined : String(file.hostId),
      isPreview: file.isPreview === true,
      line: file.line,
      openInSidePanel: true,
      resetTabState: file.resetTabState !== false,
      target: "right",
      title: file.title,
      workspaceRoot: cwd || undefined,
    };
    const result = await hostAdapter().openFile(filePath, options);
    return { ok: true, native: true, path: filePath, cwd, result };
  }

  globalObject.CodexPlus.ui.threadSidePanel = {
    activeTabId,
    closeTab,
    mount,
    openFile,
    openTab,
    registerTabProvider,
  };
})();
