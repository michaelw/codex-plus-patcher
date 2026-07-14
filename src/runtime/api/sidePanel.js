(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;

  globalObject.CodexPlus.ui.sidePanel = {
    activeTabId: () => globalObject.CodexPlus.ui.threadSidePanel.activeTabId(),
    close: (tabId) => globalObject.CodexPlus.ui.threadSidePanel.closeTab(tabId),
    open: (tabId) => globalObject.CodexPlus.ui.threadSidePanel.openTab(tabId),
    registerTab: (tab) => globalObject.CodexPlus.ui.threadSidePanel.openTab(tab),
  };
})();
