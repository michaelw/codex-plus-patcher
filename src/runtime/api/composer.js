(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;
  const { applyDecorators, mergeDataAttributes } = globalObject.__CodexPlusRuntime;
  let activeControl = null;
  let listenerInstalled = false;
  let observerInstalled = false;
  let placeholderFrame = 0;
  let stopInFlight = false;
  let submitInFlight = false;
  let ignoreStopUntil = 0;

  function composerFormFromEvent(event) {
    const target = event?.target;
    return target?.closest?.("[data-codex-plus-user-entry]") || null;
  }

  function composerText(form) {
    const textarea = form?.querySelector?.("textarea");
    if (textarea) return String(textarea.value || "").trim();
    const editable = form?.querySelector?.("[contenteditable='true'], .ProseMirror");
    return String(editable?.innerText || editable?.textContent || "").trim();
  }

  function clearComposer(form) {
    const textarea = form?.querySelector?.("textarea");
    if (textarea) {
      textarea.value = "";
      textarea.dispatchEvent?.(new Event("input", { bubbles: true }));
      return;
    }
    const editable = form?.querySelector?.("[contenteditable='true'], .ProseMirror");
    if (editable) {
      editable.innerHTML = "";
      const InputCtor = globalObject.InputEvent || globalObject.Event || Event;
      editable.dispatchEvent?.(new InputCtor("input", { bubbles: true, inputType: "deleteContent" }));
    }
  }

  function applyPlaceholder() {
    if (typeof document === "undefined") return;
    const claimed = Boolean(activeControl);
    const mode = activeControl?.mode || "";
    document.body?.toggleAttribute?.("data-codex-plus-composer-claimed", claimed);
    if (claimed) document.body?.setAttribute?.("data-codex-plus-composer-mode", mode);
    else document.body?.removeAttribute?.("data-codex-plus-composer-mode");
    for (const form of document.querySelectorAll("[data-codex-plus-user-entry]")) {
      form.toggleAttribute("data-codex-plus-composer-claimed", claimed);
      if (claimed) form.setAttribute("data-codex-plus-composer-mode", mode);
      else form.removeAttribute?.("data-codex-plus-composer-mode");
      if (claimed && activeControl?.placeholder) form.style?.setProperty?.("--codex-plus-composer-placeholder", JSON.stringify(activeControl.placeholder));
      else form.style?.removeProperty?.("--codex-plus-composer-placeholder");
      const primaryAction = primaryActionButton(form);
      if (primaryAction) {
        const stopMode = claimed && mode === "waiting" && Boolean(activeControl?.onStop);
        primaryAction.toggleAttribute?.("data-codex-plus-composer-stop-control", stopMode);
        if (stopMode) {
          if (!primaryAction.dataset.codexPlusOriginalAriaLabel) primaryAction.dataset.codexPlusOriginalAriaLabel = primaryAction.getAttribute("aria-label") || "";
          if (!primaryAction.dataset.codexPlusOriginalTitle) primaryAction.dataset.codexPlusOriginalTitle = primaryAction.getAttribute("title") || "";
          primaryAction.setAttribute("aria-label", activeControl.stopLabel);
          primaryAction.setAttribute("title", activeControl.stopLabel);
        } else if (primaryAction.dataset?.codexPlusOriginalAriaLabel != null) {
          primaryAction.setAttribute("aria-label", primaryAction.dataset.codexPlusOriginalAriaLabel);
          primaryAction.setAttribute("title", primaryAction.dataset.codexPlusOriginalTitle || "");
          delete primaryAction.dataset.codexPlusOriginalAriaLabel;
          delete primaryAction.dataset.codexPlusOriginalTitle;
        }
      }
      for (const textarea of form.querySelectorAll("textarea")) {
        textarea.toggleAttribute?.("readonly", claimed && mode === "waiting");
        textarea.toggleAttribute?.("aria-disabled", claimed && mode === "waiting");
        if (activeControl?.placeholder) {
          if (!textarea.dataset.codexPlusOriginalPlaceholder) textarea.dataset.codexPlusOriginalPlaceholder = textarea.getAttribute("placeholder") || "";
          textarea.setAttribute("placeholder", activeControl.placeholder);
        } else if (textarea.dataset.codexPlusOriginalPlaceholder != null) {
          textarea.setAttribute("placeholder", textarea.dataset.codexPlusOriginalPlaceholder);
          delete textarea.dataset.codexPlusOriginalPlaceholder;
        }
      }
      for (const editable of form.querySelectorAll("[contenteditable], .ProseMirror")) {
        if (claimed && mode === "waiting") {
          if (!editable.dataset.codexPlusOriginalContenteditable) editable.dataset.codexPlusOriginalContenteditable = editable.getAttribute("contenteditable") || "";
          editable.setAttribute("contenteditable", "false");
          editable.setAttribute("aria-disabled", "true");
        } else if (editable.dataset.codexPlusOriginalContenteditable != null) {
          if (editable.dataset.codexPlusOriginalContenteditable) editable.setAttribute("contenteditable", editable.dataset.codexPlusOriginalContenteditable);
          else editable.removeAttribute("contenteditable");
          editable.removeAttribute("aria-disabled");
          delete editable.dataset.codexPlusOriginalContenteditable;
        }
      }
      for (const placeholder of form.querySelectorAll("[data-placeholder]")) {
        placeholder.toggleAttribute?.("aria-disabled", claimed && mode === "waiting");
        if (activeControl?.placeholder) {
          if (!placeholder.dataset.codexPlusOriginalPlaceholder) placeholder.dataset.codexPlusOriginalPlaceholder = placeholder.getAttribute("data-placeholder") || "";
          placeholder.setAttribute("data-placeholder", activeControl.placeholder);
        } else if (placeholder.dataset.codexPlusOriginalPlaceholder != null) {
          placeholder.setAttribute("data-placeholder", placeholder.dataset.codexPlusOriginalPlaceholder);
          delete placeholder.dataset.codexPlusOriginalPlaceholder;
        }
      }
    }
  }

  function scheduleApplyPlaceholder() {
    if (!activeControl || placeholderFrame) return;
    const schedule = globalObject.requestAnimationFrame || globalObject.setTimeout || ((callback) => callback());
    placeholderFrame = schedule(() => {
      placeholderFrame = 0;
      applyPlaceholder();
    });
  }

  function primaryActionButton(form) {
    return form?.querySelector?.("button[type='submit'], button[aria-label*='Send'], button[aria-label*='send']") ||
      Array.from(form?.querySelectorAll?.("button") || []).at(-1) ||
      null;
  }

  async function submitClaimedInput(form, event) {
    if (!activeControl || activeControl.mode !== "input") return false;
    const text = composerText(form);
    if (!text || typeof activeControl.onSubmit !== "function") return false;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();
    if (submitInFlight) return true;
    submitInFlight = true;
    ignoreStopUntil = Date.now() + 750;
    try {
      clearComposer(form);
      await activeControl.onSubmit({ text, form, event });
    } finally {
      submitInFlight = false;
    }
    return true;
  }

  function ensureSubmitListener() {
    if (listenerInstalled || typeof document === "undefined") return;
    listenerInstalled = true;
    document.addEventListener("submit", async (event) => {
      if (!activeControl) return;
      const form = composerFormFromEvent(event);
      if (!form) return;
      if (activeControl.mode !== "input") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        return;
      }
      await submitClaimedInput(form, event);
    }, true);
    const primaryActionListener = async (event) => {
      if (!activeControl) return;
      const form = composerFormFromEvent(event);
      if (!form) return;
      const button = event.target?.closest?.("button");
      if (!button || button !== primaryActionButton(form)) return;
      if (activeControl.mode === "input") {
        await submitClaimedInput(form, event);
        return;
      }
      if (activeControl.mode !== "waiting" || !activeControl.onStop) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      if (Date.now() < ignoreStopUntil) return;
      if (stopInFlight) return;
      stopInFlight = true;
      try {
        await activeControl.onStop({ form, event });
      } finally {
        stopInFlight = false;
      }
    };
    for (const type of ["pointerdown", "mousedown", "click"]) {
      document.addEventListener(type, primaryActionListener, true);
    }
    document.addEventListener("keydown", async (event) => {
      if (!activeControl || activeControl.mode !== "input") return;
      if (event.defaultPrevented || event.isComposing) return;
      if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
      const form = composerFormFromEvent(event);
      if (!form) return;
      await submitClaimedInput(form, event);
    }, true);
    document.addEventListener("beforeinput", (event) => {
      if (!activeControl || activeControl.mode !== "waiting") return;
      const form = composerFormFromEvent(event);
      if (!form) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    }, true);
    document.addEventListener("input", (event) => {
      if (!activeControl || activeControl.mode !== "waiting") return;
      const form = composerFormFromEvent(event);
      if (!form) return;
      event.preventDefault?.();
      event.stopPropagation?.();
      event.stopImmediatePropagation?.();
      clearComposer(form);
    }, true);
    if (!observerInstalled && globalObject.MutationObserver) {
      observerInstalled = true;
      new globalObject.MutationObserver(scheduleApplyPlaceholder).observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
      });
    }
  }

  function claimControl(options = {}) {
    const mode = options.mode === "waiting" ? "waiting" : options.mode === "input" ? "input" : "";
    if (!mode) throw new Error("Composer control claim requires input or waiting mode");
    ensureSubmitListener();
    const claim = {};
    activeControl = {
      claim,
      mode,
      placeholder: typeof options.placeholder === "string" ? options.placeholder : "",
      stopLabel: typeof options.stopLabel === "string" && options.stopLabel.trim() ? options.stopLabel.trim() : "Stop active run",
      onSubmit: typeof options.onSubmit === "function" ? options.onSubmit : null,
      onStop: typeof options.onStop === "function" ? options.onStop : null,
    };
    applyPlaceholder();
    return () => {
      if (activeControl?.claim === claim) {
        activeControl = null;
        applyPlaceholder();
      }
    };
  }

  function claimSubmit(handler, options = {}) {
    if (typeof handler !== "function") throw new Error("Composer submit claim requires a handler");
    return claimControl({ mode: "input", placeholder: options.placeholder, onSubmit: handler });
  }

  globalObject.CodexPlus.ui.composer = {
    surfaceDecorators: [],
    claimControl,
    claimSubmit,
    decorateSurface(fn) {
      this.surfaceDecorators.push(fn);
      return fn;
    },
    refreshClaimedSurface: applyPlaceholder,
    surfaceProps(props) {
      const decorated = applyDecorators(props, this.surfaceDecorators);
      const claimed = activeControl ? {
        "data-codex-plus-composer-claimed": "",
        "data-codex-plus-composer-mode": activeControl.mode,
      } : null;
      return mergeDataAttributes(decorated, claimed);
    },
  };
})();
