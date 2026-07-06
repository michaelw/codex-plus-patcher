(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;
  const providers = new Map();
  let activeRouteId = null;
  let activeProvider = null;
  let rootHost = null;
  let navigationListenerInstalled = false;
  let rowCloseListeners = [];
  let registeredHost = null;
  let resizeListenerInstalled = false;
  let resizeFrame = 0;
  const routeListeners = new Set();
  let hiddenHostNodes = [];

  function nodeContains(parent, child) {
    if (!parent || !child) return false;
    if (parent === child) return true;
    if (typeof parent.contains === "function") return parent.contains(child);
    for (const candidate of Array.from(parent.children || [])) {
      if (nodeContains(candidate, child)) return true;
    }
    return false;
  }

  function nativeComposerElements(root) {
    if (!root?.querySelectorAll) return [];
    return Array.from(root.querySelectorAll("[data-codex-plus-user-entry], [data-codex-composer], .composer-surface-chrome, form"));
  }

  function isNativeComposerSurface(element) {
    return Boolean(element?.matches?.("[data-codex-plus-user-entry], .composer-surface-chrome"));
  }

  function hideNode(node) {
    if (!node || node.id === "codex-plus-virtual-conversation-root") return;
    if (hiddenHostNodes.some((entry) => entry.node === node)) return;
    hiddenHostNodes.push({
      node,
      hidden: node.hidden === true,
      marker: node.getAttribute?.("data-codex-plus-virtual-hidden"),
    });
    node.hidden = true;
    node.setAttribute?.("data-codex-plus-virtual-hidden", "");
  }

  function hideNonComposerChildren(node, root) {
    if (isNativeComposerSurface(node)) return;
    const composers = nativeComposerElements(node);
    for (const child of Array.from(node.children || [])) {
      if (child === root || nodeContains(child, root)) continue;
      if (composers.some((composer) => child === composer || nodeContains(child, composer))) {
        hideNonComposerChildren(child, root);
      } else {
        hideNode(child);
      }
    }
  }

  function hideHostChildren(host, root) {
    restoreHostChildren();
    const composers = nativeComposerElements(host);
    for (const child of Array.from(host.children || [])) {
      if (child === root || nodeContains(child, root)) continue;
      if (composers.some((composer) => child === composer || nodeContains(child, composer))) {
        hideNonComposerChildren(child, root);
      } else {
        hideNode(child);
      }
    }
  }

  function restoreHostChildren() {
    for (const entry of hiddenHostNodes.splice(0)) {
      if (!entry.node) continue;
      entry.node.hidden = entry.hidden;
      if (entry.marker == null) entry.node.removeAttribute?.("data-codex-plus-virtual-hidden");
      else entry.node.setAttribute?.("data-codex-plus-virtual-hidden", entry.marker);
    }
  }

  function updateVirtualRouteSurface(routeId) {
    if (typeof document === "undefined") return;
    const body = document.body;
    if (!body) return;
    if (!routeId) {
      body.removeAttribute?.("data-codex-plus-virtual-route");
      body.style?.removeProperty?.("--codex-plus-virtual-main-left");
      body.style?.removeProperty?.("--codex-plus-virtual-main-right");
      body.style?.removeProperty?.("--codex-plus-virtual-main-bottom");
      return;
    }
    body.setAttribute?.("data-codex-plus-virtual-route", routeId);
    const frame = document.querySelector(".app-shell-main-content-frame") || rootHost;
    const rect = frame?.getBoundingClientRect?.();
    if (!rect || !body.style || typeof window === "undefined") return;
    body.style.setProperty("--codex-plus-virtual-main-left", `${Math.max(0, rect.left)}px`);
    body.style.setProperty("--codex-plus-virtual-main-right", `${Math.max(0, window.innerWidth - rect.right)}px`);
    body.style.setProperty("--codex-plus-virtual-main-bottom", `${Math.max(0, window.innerHeight - rect.bottom)}px`);
  }

  function appInitialRoute() {
    try {
      return new URLSearchParams(String(globalObject.location?.search || "")).get("initialRoute") || "";
    } catch {
      return "";
    }
  }

  function virtualRoutesAllowed() {
    return !appInitialRoute();
  }

  function scheduleVirtualRouteSurfaceUpdate() {
    if (!activeRouteId) return;
    if (resizeFrame && typeof cancelAnimationFrame === "function") cancelAnimationFrame(resizeFrame);
    const update = () => {
      resizeFrame = 0;
      updateVirtualRouteSurface(activeRouteId);
    };
    resizeFrame = typeof requestAnimationFrame === "function" ? requestAnimationFrame(update) : 0;
    if (!resizeFrame) update();
  }

  function installResizeListener() {
    if (resizeListenerInstalled || typeof window === "undefined") return;
    resizeListenerInstalled = true;
    window.addEventListener?.("resize", scheduleVirtualRouteSurfaceUpdate, { passive: true });
    window.visualViewport?.addEventListener?.("resize", scheduleVirtualRouteSurfaceUpdate, { passive: true });
    window.visualViewport?.addEventListener?.("scroll", scheduleVirtualRouteSurfaceUpdate, { passive: true });
  }

  function visibleElement(element, minWidth = 120, minHeight = 40) {
    if (!element || typeof element.getBoundingClientRect !== "function") return false;
    const rect = element.getBoundingClientRect();
    const style = typeof getComputedStyle === "function" ? getComputedStyle(element) : {};
    return rect.width >= minWidth && rect.height >= minHeight && style.display !== "none" && style.visibility !== "hidden";
  }

  function nativeThreadMessageHost() {
    const scroll = Array.from(document.querySelectorAll(".thread-scroll-container"))
      .find((element) => visibleElement(element, 240, 200));
    if (!scroll) return null;
    const content = Array.from(scroll.querySelectorAll("div"))
      .find((element) => {
        const className = String(element.className || "");
        return className.includes("max-w-(--thread-content-max-width)") &&
          className.includes("flex-1") &&
          !className.includes("sticky") &&
          visibleElement(element, 240, 80);
      });
    if (content) return content;
    return Array.from(scroll.children || []).find((element) => visibleElement(element, 240, 120)) || scroll;
  }

  function candidateHosts() {
    return Array.from(document.querySelectorAll("[data-codex-plus-virtual-conversation-host], [data-testid*='message'], [class*='message'], main, [role='main'], [data-testid*='conversation'], [class*='conversation']"))
      .filter((element) => element.id !== "codex-plus-virtual-conversation-root" && !element.closest("#codex-plus-virtual-conversation-root"));
  }

  function hostForRoot() {
    if (registeredHost && registeredHost.isConnected !== false) return registeredHost;
    const explicitHost = document.querySelector("[data-codex-plus-virtual-conversation-host]");
    if (explicitHost) return explicitHost;
    const threadHost = nativeThreadMessageHost();
    if (threadHost) return threadHost;
    const mainFrame = document.querySelector(".app-shell-main-content-frame");
    if (mainFrame && visibleElement(mainFrame, 240, 200)) return mainFrame;
    const root = document.getElementById("codex-plus-virtual-conversation-root");
    if (root?.parentElement && root.parentElement !== document.body) return root.parentElement;
    return candidateHosts().find((element) => {
      return visibleElement(element, 240, 200);
    }) || document.querySelector("main") || null;
  }

  function clearRowCloseListeners() {
    for (const { row, listener } of rowCloseListeners) {
      for (const type of ["pointerdown", "mousedown", "click"]) row.removeEventListener?.(type, listener, true);
    }
    rowCloseListeners = [];
  }

  function attachRowCloseListeners() {
    clearRowCloseListeners();
    for (const row of document.querySelectorAll("[data-app-action-sidebar-project-row], [data-app-action-sidebar-thread-row]")) {
      if (row.closest?.("[data-codex-plus-sidebar-section]")) continue;
      const listener = () => {
        if (activeRouteId) close();
      };
      for (const type of ["pointerdown", "mousedown", "click"]) row.addEventListener?.(type, listener, true);
      rowCloseListeners.push({ row, listener });
    }
  }

  function ensureRoot() {
    let root = document.getElementById("codex-plus-virtual-conversation-root");
    const host = hostForRoot();
    if (!host) return null;
    if (!root) {
      root = document.createElement("section");
      root.id = "codex-plus-virtual-conversation-root";
      root.setAttribute("data-codex-plus-virtual-conversation", "");
      root.hidden = true;
    }
    if (root.parentElement !== host) host.appendChild(root);
    rootHost = host;
    if (activeRouteId) hideHostChildren(host, root);
    return root;
  }

  function providerFor(routeId) {
    for (const provider of providers.values()) {
      if (provider.match?.(routeId)) return provider;
    }
    return null;
  }

  function createSlots(root) {
    root.className = "cpx-virtual-chat-surface";
    root.innerHTML = [
      '<header class="cpx-virtual-chat-header" data-codex-plus-virtual-slot="header"></header>',
      '<main class="cpx-virtual-chat-transcript" data-codex-plus-virtual-slot="transcript"></main>',
      '<footer class="cpx-virtual-chat-actions" data-codex-plus-virtual-slot="actions"></footer>',
    ].join("");
    return {
      header: root.querySelector('[data-codex-plus-virtual-slot="header"]'),
      transcript: root.querySelector('[data-codex-plus-virtual-slot="transcript"]'),
      actions: root.querySelector('[data-codex-plus-virtual-slot="actions"]'),
      composerControl: globalObject.CodexPlus?.ui?.composer || null,
      root,
    };
  }

  function notifyRouteChange() {
    for (const listener of Array.from(routeListeners)) listener(activeRouteId);
  }

  function open(routeId) {
    if (!virtualRoutesAllowed()) {
      if (activeRouteId) close();
      return { ok: false, error: "native-route-active" };
    }
    const provider = providerFor(routeId);
    if (!provider) return { ok: false, error: "virtual-route-not-found" };
    const root = ensureRoot();
    if (!root) return { ok: false, error: "virtual-route-host-not-found" };
    activeRouteId = routeId;
    activeProvider = provider;
    attachRowCloseListeners();
    root.hidden = false;
    hideHostChildren(rootHost, root);
    const slots = createSlots(root);
    provider.render?.({ routeId, container: root, slots, close });
    updateVirtualRouteSurface(routeId);
    installResizeListener();
    window.history.replaceState(window.history.state, "", `#${encodeURIComponent(routeId)}`);
    globalObject.CodexPlus.diagnostics?.log("virtualConversation.open", { routeId, provider: provider.id });
    notifyRouteChange();
    return { ok: true, routeId };
  }

  function refresh() {
    if (!activeRouteId || !activeProvider) return { ok: false, error: "no-active-virtual-route" };
    if (!virtualRoutesAllowed()) {
      const closed = close();
      return { ...closed, closed: true };
    }
    const root = ensureRoot();
    if (!root) {
      const closed = close();
      return { ...closed, ok: false, error: "virtual-route-host-not-found", closed: true };
    }
    const slots = root.querySelector("[data-codex-plus-virtual-slot]") ? {
      header: root.querySelector('[data-codex-plus-virtual-slot="header"]'),
      transcript: root.querySelector('[data-codex-plus-virtual-slot="transcript"]'),
      actions: root.querySelector('[data-codex-plus-virtual-slot="actions"]'),
      composerControl: globalObject.CodexPlus?.ui?.composer || null,
      root,
    } : createSlots(root);
    activeProvider.render?.({ routeId: activeRouteId, container: root, slots, close, refresh: true });
    updateVirtualRouteSurface(activeRouteId);
    return { ok: true, routeId: activeRouteId };
  }

  function close() {
    const root = typeof document !== "undefined" ? document.getElementById("codex-plus-virtual-conversation-root") : null;
    const closingRouteId = activeRouteId;
    if (root) {
      root.hidden = true;
      root.innerHTML = "";
      root.className = "";
    }
    restoreHostChildren();
    if (root) {
      for (const name of Array.from(root.getAttributeNames?.() || [])) {
        if (name.startsWith("data-codex-plus-") && name !== "data-codex-plus-virtual-conversation") root.removeAttribute(name);
      }
    }
    updateVirtualRouteSurface(null);
    clearRowCloseListeners();
    globalObject.CodexPlus?.ui?.routeContext?.clear?.(closingRouteId);
    activeRouteId = null;
    activeProvider = null;
    const location = globalObject.location;
    const history = globalObject.history;
    const hashRoute = location ? decodeURIComponent(String(location.hash || "").replace(/^#/, "")) : "";
    if (closingRouteId && hashRoute === closingRouteId && typeof history?.replaceState === "function") {
      history.replaceState(history.state, "", String(location.pathname || "") + String(location.search || ""));
    }
    notifyRouteChange();
    return { ok: true };
  }

  function registerProvider(provider) {
    if (!provider?.id || typeof provider.match !== "function" || typeof provider.render !== "function") {
      throw new Error("Virtual conversation providers require id, match, and render");
    }
    providers.set(provider.id, provider);
    return provider;
  }

  function registerHost(host) {
    registeredHost = host || null;
    if (registeredHost?.setAttribute) registeredHost.setAttribute("data-codex-plus-virtual-conversation-host", "");
    if (activeRouteId) ensureRoot();
    return registeredHost;
  }

  function list() {
    return Array.from(providers.values()).flatMap((provider) => provider.list?.() || []);
  }

  function subscribe(listener) {
    if (typeof listener !== "function") throw new Error("Virtual conversation route listeners must be functions");
    routeListeners.add(listener);
    return () => routeListeners.delete(listener);
  }

  function installNavigationCloseListener() {
    if (navigationListenerInstalled || typeof document === "undefined" || typeof document.addEventListener !== "function") return;
    navigationListenerInstalled = true;
    const listener = (event) => {
      if (!activeRouteId) return;
      const target = event.target;
      const path = typeof event.composedPath === "function" ? event.composedPath() : [];
      const inPluginSidebarSection = target?.closest?.("[data-codex-plus-sidebar-section]") ||
        path.some((node) => node?.matches?.("[data-codex-plus-sidebar-section]"));
      if (inPluginSidebarSection) return;
      const row = target?.closest?.("[data-app-action-sidebar-project-row], [data-app-action-sidebar-thread-row]") ||
        path.find((node) => node?.matches?.("[data-app-action-sidebar-project-row], [data-app-action-sidebar-thread-row]"));
      if (row) close();
    };
    for (const type of ["pointerdown", "mousedown", "click"]) {
      document.addEventListener(type, listener, true);
      globalObject.addEventListener?.(type, listener, true);
    }
  }

  installNavigationCloseListener();

  globalObject.CodexPlus.ui.virtualConversations = {
    activeRouteId: () => activeRouteId,
    close,
    list,
    open,
    refresh,
    registerHost,
    registerProvider,
    subscribe,
  };
})();
