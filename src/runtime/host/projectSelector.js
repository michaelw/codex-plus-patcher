(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;

  function fuzzyFilter(projects, query) {
    const needle = String(query ?? "").trim().toLowerCase();
    return globalObject.CodexPlus?.ui?.projectSelector?.fuzzyFilter?.(projects, query) ??
      (needle
        ? projects.filter((project) =>
            [project.label, project.repositoryData?.rootFolder ?? "", project.path ?? "", project.hostDisplayName ?? ""].some((value) =>
              String(value ?? "").toLowerCase().includes(needle),
            ),
          )
        : projects);
  }

  function fuzzyHighlight(text, query, jsx) {
    return globalObject.CodexPlus?.ui?.projectSelector?.fuzzyHighlight?.({ text, query, jsx }) ?? text;
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

  function trigger(element, variant, React) {
    const cloneElement = typeof React?.cloneElement === "function" ? React.cloneElement : React?.default?.cloneElement;
    return typeof cloneElement === "function" &&
      element != null &&
      typeof element === "object" &&
      "props" in element &&
      "type" in element
      ? cloneElement(element, {
          ...element.props,
          "data-codex-plus-project-selector-trigger": true,
          "data-codex-plus-project-selector-variant": variant,
        })
      : element;
  }

  globalObject.CodexPlusHost.adapters.projectSelector = {
    acceptFirst,
    fuzzyFilter,
    fuzzyHighlight,
    trigger,
  };
})();
