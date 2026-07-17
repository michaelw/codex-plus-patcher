(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;
  const openHandlers = new Map();
  let acceptFirstHandler = null;

  function fuzzyFilter(projects, query) {
    return globalObject.CodexPlus.ui.projectSelector.fuzzyFilter(projects, query);
  }

  function fuzzyHighlight(text, query, jsx) {
    return globalObject.CodexPlus.ui.projectSelector.fuzzyHighlight({ text, query, jsx });
  }

  function closeDropdown(event) {
    const KeyboardEventConstructor = globalObject.KeyboardEvent;
    if (typeof KeyboardEventConstructor !== "function") return;

    const target = event?.target;
    const dispatchTarget = typeof target?.dispatchEvent === "function" ? target : globalObject.document;
    dispatchTarget?.dispatchEvent?.(new KeyboardEventConstructor("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape",
    }));
  }

  function acceptFirst(event, projects, selectProjectId, query) {
    const project = projects?.[0];
    if (event?.key !== "Enter" || String(query ?? "").trim().length === 0 || project == null) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    selectProjectId(project.projectId);
    closeDropdown(event);
  }

  function acceptCurrent(event) {
    return acceptFirstHandler?.(event);
  }

  function setAcceptFirstHandler(handler) {
    acceptFirstHandler = typeof handler === "function" ? handler : null;
  }

  function trigger(element, variant, React) {
    const cloneElement = typeof React?.cloneElement === "function" ? React.cloneElement : React?.default?.cloneElement;
    if (typeof cloneElement !== "function") throw new Error("Project selector adapter requires React.cloneElement");
    if (element == null || typeof element !== "object" || !("props" in element) || !("type" in element)) {
      throw new Error("Project selector adapter requires a React element trigger");
    }
    return cloneElement(element, {
      ...element.props,
      "data-codex-plus-project-selector-trigger": true,
      "data-codex-plus-project-selector-variant": variant,
    });
  }

  function setOpenHandler(variant, handler) {
    if (typeof handler === "function") openHandlers.set(variant || "default", handler);
    if (globalObject.CodexPlus?.ui?.projectSelector) globalObject.CodexPlus.ui.projectSelector.open = open;
  }

  function open(variant = "default") {
    let handler = openHandlers.get(variant);
    if (handler == null && variant === "default") {
      for (const candidate of ["home", "hero"]) {
        handler = openHandlers.get(candidate);
        if (handler != null) break;
      }
      if (handler == null) handler = openHandlers.values().next().value;
    }
    if (typeof handler !== "function") throw new Error(`Project selector host did not bind the ${variant} trigger`);
    return handler() !== false;
  }

  globalObject.CodexPlusHost.adapters.projectSelector = {
    acceptCurrent,
    acceptFirst,
    fuzzyFilter,
    fuzzyHighlight,
    open,
    setAcceptFirstHandler,
    setOpenHandler,
    trigger,
  };
})();
