(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;
  const tabs = new Map();
  const providers = new Map();
  let activeTabId = null;
  let registeredHost = null;
  let nativeListenerAttached = false;
  globalObject.CodexPlusHost ||= {};
  globalObject.CodexPlusHost.adapters ||= {};
  globalObject.CodexPlusHost.adapters.threadSidePanel ||= {};

  function escapeSelector(value) {
    return globalObject.CSS?.escape ? globalObject.CSS.escape(String(value)) : String(value).replace(/["\\]/g, "\\$&");
  }

  function nativeTabs() {
    const shell = document.querySelector("[data-app-shell-tabs]");
    const tabList = shell?.querySelector?.("[role='tablist']");
    if (!shell || !tabList) return null;
    const context = globalObject.CodexPlus?.ui?.routeContext?.active?.() || globalObject.CodexPlus?.ui?.projectContext?.active?.();
    const cwd = context?.activeCwd || context?.cwd;
    if (cwd) {
      shell.setAttribute("data-codex-plus-active-project-path", cwd);
      shell.setAttribute("data-codex-plus-project-path", cwd);
      const aside = shell.closest?.("aside");
      aside?.setAttribute?.("data-codex-plus-active-project-path", cwd);
      aside?.setAttribute?.("data-codex-plus-project-path", cwd);
    }
    return { shell, tabList, aside: shell.closest?.("aside") || null };
  }

  function nativeSidePanelHost() {
    const tabsHost = nativeTabs();
    if (tabsHost?.aside) return tabsHost.aside;
    const tabPanel = document.querySelector("[role='tabpanel']");
    const tabPanelAside = tabPanel?.closest?.("aside");
    if (tabPanelAside) return tabPanelAside;
    const tabList = document.querySelector("[role='tablist']");
    return tabList?.closest?.("aside") || null;
  }

  function sidePanelHost() {
    if (registeredHost && registeredHost.isConnected !== false) return registeredHost;
    return document.querySelector("[data-codex-plus-thread-side-panel-host]") ||
      nativeSidePanelHost() ||
      document.querySelector("[data-testid*='side-panel'], [class*='side-panel'], [class*='SidePanel']");
  }

  function dispatchNativeSidePanelToggle() {
    const button = Array.from(document.querySelectorAll("button"))
      .find((candidate) => candidate.getAttribute("aria-label") === "Toggle side panel");
    if (!button) return false;
    pressElement(button);
    return true;
  }

  function pressElement(element) {
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      const EventClass = type.startsWith("pointer") && typeof PointerEvent === "function" ? PointerEvent : MouseEvent;
      element.dispatchEvent(new EventClass(type, { bubbles: true, cancelable: true, view: window, button: 0, pointerType: "mouse", isPrimary: true }));
    }
  }

  function nativeFileOpener() {
    return globalObject.CodexPlusHost?.adapters?.threadSidePanel?.openFile || null;
  }

  function findNativeFilesButton() {
    const candidates = Array.from(document.querySelectorAll("button,[role='button'],[role='tab']"));
    return candidates.find((candidate) => {
      const text = String(candidate.textContent || "").trim();
      const label = String(candidate.getAttribute?.("aria-label") || candidate.getAttribute?.("title") || "").trim();
      return text === "Files" || label === "Files" || text.startsWith("Files") || label.startsWith("Files") || /(^|\s)Files(\s|$)/.test(text) || /(^|\s)Files(\s|$)/.test(label);
    }) || null;
  }

  function activateNativeFilesSurface(timeoutMs = 4000) {
    const started = Date.now();
    return new Promise((resolve) => {
      const poll = () => {
        const filesButton = findNativeFilesButton();
        if (filesButton) {
          pressElement(filesButton);
          resolve(true);
          return;
        }
        if (Date.now() - started >= timeoutMs) {
          resolve(false);
          return;
        }
        setTimeout(poll, 50);
      };
      poll();
    });
  }

  function waitForNativeFileOpener(timeoutMs = 8000) {
    const existing = nativeFileOpener();
    if (existing) return Promise.resolve(existing);
    const started = Date.now();
    return new Promise((resolve) => {
      const poll = () => {
        const opener = nativeFileOpener();
        if (opener || Date.now() - started >= timeoutMs) {
          resolve(opener || null);
          return;
        }
        setTimeout(poll, 50);
      };
      poll();
    });
  }

  function waitForHost(timeoutMs = 1500) {
    const started = Date.now();
    return new Promise((resolve) => {
      const poll = () => {
        const host = sidePanelHost();
        if (host) {
          resolve(host);
          return;
        }
        if (Date.now() - started >= timeoutMs) {
          resolve(null);
          return;
        }
        setTimeout(poll, 50);
      };
      poll();
    });
  }

  async function ensureOpen() {
    const existing = sidePanelHost();
    if (existing) return { ok: true, host: existing };
    if (!dispatchNativeSidePanelToggle()) return { ok: false, error: "side-panel-toggle-not-found" };
    const host = await waitForHost();
    if (!host) return { ok: false, error: "side-panel-host-not-found" };
    return { ok: true, host };
  }

  function pluginTabId(tabId) {
    return `codex-plus-thread-side-panel-tab:${tabId}`;
  }

  function pluginPanelId(tabId) {
    return `codex-plus-thread-side-panel-panel:${tabId}`;
  }

  function setNativePanelsHidden(hidden) {
    const tabsHost = nativeTabs();
    if (!tabsHost) return;
    for (const panel of tabsHost.shell.querySelectorAll("[role='tabpanel']:not([data-codex-plus-thread-side-panel-body])")) {
      panel.hidden = hidden;
      panel.style.display = hidden ? "none" : "";
    }
    if (hidden) {
      for (const tab of tabsHost.tabList.querySelectorAll("[role='tab']:not([data-codex-plus-thread-side-panel-tab])")) {
        tab.setAttribute("aria-selected", "false");
      }
    }
  }

  function deactivatePluginTabs() {
    activeTabId = null;
    setNativePanelsHidden(false);
    const tabsHost = nativeTabs();
    if (!tabsHost) return;
    for (const button of tabsHost.tabList.querySelectorAll("[data-codex-plus-thread-side-panel-tab]")) {
      button.setAttribute("aria-selected", "false");
    }
    for (const panel of tabsHost.shell.querySelectorAll("[data-codex-plus-thread-side-panel-body]")) {
      panel.hidden = true;
      panel.style.display = "none";
    }
  }

  function attachNativeListener() {
    if (nativeListenerAttached) return;
    const tabsHost = nativeTabs();
    if (!tabsHost) return;
    tabsHost.tabList.addEventListener("pointerdown", (event) => {
      const nativeTab = event.target?.closest?.("[role='tab']:not([data-codex-plus-thread-side-panel-tab])");
      if (nativeTab) deactivatePluginTabs();
    }, true);
    tabsHost.tabList.addEventListener("mousedown", (event) => {
      const nativeTab = event.target?.closest?.("[role='tab']:not([data-codex-plus-thread-side-panel-tab])");
      if (nativeTab) deactivatePluginTabs();
    }, true);
    nativeListenerAttached = true;
  }

  function ensureNativePanel(tab) {
    const tabsHost = nativeTabs();
    if (!tabsHost) return null;
    attachNativeListener();
    const id = String(tab.id);
    let wrapper = tabsHost.tabList.querySelector(`[data-codex-plus-thread-side-panel-tab-wrapper="${escapeSelector(id)}"]`);
    if (!wrapper) {
      wrapper = document.createElement("div");
      wrapper.className = "my-auto flex shrink-0 relative max-w-40 pe-1 items-center contain-content gap-0.5";
      wrapper.setAttribute("data-codex-plus-thread-side-panel-tab-wrapper", id);
      wrapper.setAttribute("data-app-shell-tab-controller", "right");
      const tabFrame = document.createElement("div");
      tabFrame.className = "group/tab relative flex h-7 max-w-39 shrink-0 items-center overflow-hidden rounded-lg bg-token-main-surface-primary px-2 py-1";
      tabFrame.setAttribute("data-codex-plus-thread-side-panel-tab-frame", id);
      const bg = document.createElement("div");
      bg.className = "pointer-events-none absolute inset-0 z-0 rounded-md group-hover/tab:bg-[var(--app-shell-tab-background)] bg-[var(--app-shell-tab-background)]";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "no-drag relative flex flex-1 items-center gap-2 z-10 text-sm min-w-0 pe-2 text-token-text-primary";
      button.setAttribute("role", "tab");
      button.setAttribute("data-codex-plus-thread-side-panel-tab", id);
      button.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
        openTab(id);
      });
      button.addEventListener("mousedown", (event) => {
        event.stopPropagation();
        openTab(id);
      });
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        openTab(id);
      });
      const close = document.createElement("button");
      close.type = "button";
      close.className = "no-drag invisible absolute inset-y-0 end-1 z-30 flex cursor-interaction items-center pe-1 text-token-text-tertiary hover:text-token-text-primary group-hover/tab:visible";
      close.setAttribute("aria-label", `Close ${tab.title} tab`);
      close.textContent = "×";
      close.addEventListener("pointerdown", (event) => event.stopPropagation());
      close.addEventListener("mousedown", (event) => event.stopPropagation());
      close.addEventListener("click", (event) => {
        event.stopPropagation();
        closeTab(id);
      });
      tabFrame.appendChild(bg);
      tabFrame.appendChild(button);
      tabFrame.appendChild(close);
      wrapper.appendChild(tabFrame);
      tabsHost.tabList.appendChild(wrapper);
    }
    const nativeTabId = tab.nativeTabId || id;
    wrapper.setAttribute("data-tab-id", nativeTabId);
    if (tab.cwd) wrapper.setAttribute("data-codex-plus-project-path", tab.cwd);
    wrapper.querySelector("[data-codex-plus-thread-side-panel-tab-frame]")?.setAttribute("data-tab-id", nativeTabId);
    const button = wrapper.querySelector("[data-codex-plus-thread-side-panel-tab]");
    button.textContent = tab.title;
    button.setAttribute("aria-controls", pluginPanelId(id));
    button.setAttribute("id", pluginTabId(id));

    let panel = tabsHost.shell.querySelector(`[data-codex-plus-thread-side-panel-body="${escapeSelector(id)}"]`);
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "relative min-h-0 flex-1 outline-none";
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("tabindex", "-1");
      panel.setAttribute("data-codex-plus-thread-side-panel-body", id);
      panel.setAttribute("data-app-shell-tab-panel-controller", "right");
      panel.setAttribute("id", pluginPanelId(id));
      tabsHost.shell.appendChild(panel);
    }
    panel.setAttribute("aria-label", tab.title);
    panel.setAttribute("aria-labelledby", pluginTabId(id));
    panel.setAttribute("data-tab-id", nativeTabId);
    if (tab.cwd) panel.setAttribute("data-codex-plus-project-path", tab.cwd);
    return { button, panel, tabsHost };
  }

  function cleanupRemovedNativeTabs(entries) {
    const tabsHost = nativeTabs();
    if (!tabsHost) return;
    const activeIds = new Set(entries.map((entry) => entry.id));
    for (const wrapper of tabsHost.tabList.querySelectorAll("[data-codex-plus-thread-side-panel-tab-wrapper]")) {
      if (!activeIds.has(wrapper.getAttribute("data-codex-plus-thread-side-panel-tab-wrapper"))) wrapper.remove();
    }
    for (const panel of tabsHost.shell.querySelectorAll("[data-codex-plus-thread-side-panel-body]")) {
      if (!activeIds.has(panel.getAttribute("data-codex-plus-thread-side-panel-body"))) panel.remove();
    }
  }

  function renderNative() {
    const tabsHost = nativeTabs();
    if (!tabsHost) return { ok: false, error: "side-panel-host-not-found" };
    const entries = Array.from(tabs.values());
    cleanupRemovedNativeTabs(entries);
    if (entries.length === 0) {
      deactivatePluginTabs();
      return { ok: true };
    }
    if (!activeTabId || !tabs.has(activeTabId)) activeTabId = entries[entries.length - 1].id;
    setNativePanelsHidden(true);
    for (const tab of entries) {
      const parts = ensureNativePanel(tab);
      if (!parts) return { ok: false, error: "side-panel-host-not-found" };
      const selected = tab.id === activeTabId;
      parts.button.setAttribute("aria-selected", selected ? "true" : "false");
      parts.panel.hidden = !selected;
      parts.panel.style.display = selected ? "" : "none";
      if (selected) {
        parts.panel.innerHTML = "";
        tab.render?.({ container: parts.panel, close: () => closeTab(tab.id) });
        for (const provider of providers.values()) provider.render?.({ container: parts.panel, activeTab: tab });
      }
    }
    return { ok: true, activeTabId, native: true };
  }

  function render() {
    const nativeResult = renderNative();
    if (nativeResult.ok || nativeResult.error !== "side-panel-host-not-found") return nativeResult;
    if (!registeredHost) return nativeResult;
    return { ok: false, error: "native-side-panel-tabs-not-found" };
  }

  function registerHost(host) {
    registeredHost = host || null;
    registeredHost?.setAttribute?.("data-codex-plus-thread-side-panel-host", "");
    return render();
  }

  function registerTabProvider(provider) {
    if (!provider?.id) throw new Error("Thread side panel tab providers require an id");
    providers.set(String(provider.id), provider);
    return provider;
  }

  function openTab(tab) {
    if (typeof tab === "string") {
      if (!tabs.has(tab)) return { ok: false, error: "tab-not-found" };
      activeTabId = tab;
      return render();
    }
    if (!tab?.id || typeof tab.render !== "function") throw new Error("Thread side panel tabs require id and render");
    tabs.set(String(tab.id), { title: String(tab.title || tab.id), ...tab, id: String(tab.id) });
    activeTabId = String(tab.id);
    return render();
  }

  async function openFile(file) {
    if (!file?.path) throw new Error("Thread side panel files require a path");
    const filePath = String(file.path);
    const activeContext = globalObject.CodexPlus?.ui?.routeContext?.active?.() || globalObject.CodexPlus?.ui?.projectContext?.active?.();
    const contextCwd = activeContext?.activeCwd || activeContext?.cwd;
    const cwd = file.cwd ? String(file.cwd) : contextCwd ? String(contextCwd) : "";
    if (cwd) {
      globalObject.CodexPlus?.ui?.routeContext?.set?.({
        routeId: activeContext?.routeId || "",
        sourceProject: activeContext?.sourceProject || { id: cwd, cwd, label: file.projectLabel || activeContext?.label || "" },
        activeCwd: cwd,
        workspaceRoot: activeContext?.workspaceRoot || cwd,
        gitRoot: activeContext?.gitRoot,
        threadId: activeContext?.threadId,
        branchName: activeContext?.branchName,
        source: file.source || activeContext?.source || "thread-side-panel",
      });
    }
    await ensureOpen();
    if (!nativeFileOpener()) await activateNativeFilesSurface();
    const opener = await waitForNativeFileOpener();
    if (!opener) return { ok: false, error: "native-file-opener-not-found" };
    opener(filePath, {
      activate: true,
      hostId: "local",
      isPreview: false,
      resetTabState: true,
      target: "right",
      workspaceRoot: cwd || undefined,
    });
    return { ok: true, native: true, path: filePath, cwd };
  }

  function closeTab(tabId = activeTabId) {
    if (tabId) tabs.delete(String(tabId));
    if (activeTabId === tabId) activeTabId = null;
    return render();
  }

  globalObject.CodexPlus.ui.threadSidePanel = {
    activeTabId: () => activeTabId,
    closeTab,
    ensureOpen,
    openFile,
    openTab,
    registerHost,
    registerTabProvider,
  };
})();
