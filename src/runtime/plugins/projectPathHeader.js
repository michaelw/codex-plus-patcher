(function (globalObject) {
  function pathFromContext(context) {
    const virtualContext = activeVirtualProjectContext();
    if (virtualContext?.cwd) return virtualContext.cwd;
    const headerProject = context?.header?.projectName?.props?.group;
    const value =
      context?.cwd ??
      context?.project?.cwd ??
      context?.project?.path ??
      headerProject?.cwd ??
      headerProject?.path ??
      (headerProject?.projectKind === "local" ? headerProject?.projectId : null) ??
      null;
    if (typeof value !== "string") return "";
    return value.trim();
  }

  function middleTruncate(value, maxLength = 46) {
    const text = String(value || "");
    if (text.length <= maxLength) return text;
    if (maxLength <= 5) return text.slice(0, maxLength);
    const keep = maxLength - 3;
    const start = Math.ceil(keep / 2);
    const end = Math.floor(keep / 2);
    return `${text.slice(0, start)}...${text.slice(text.length - end)}`;
  }

  function formatPathLabel(value, maxLength = 54, tailSegments = 3) {
    const text = String(value || "");
    if (text.length <= maxLength) return text;
    const parts = text.split("/").filter(Boolean);
    const tail = parts.slice(-tailSegments).join("/");
    if (!tail) return middleTruncate(text, maxLength);
    const prefix = "…";
    const label = `${prefix}/${tail}`;
    return label.length <= maxLength ? label : `${prefix}/${parts.slice(-2).join("/")}`;
  }

  function copyPath(path) {
    return globalObject?.navigator?.clipboard?.writeText?.(path);
  }

  function normalize(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function visible(element) {
    if (!element?.getBoundingClientRect) return false;
    const rect = element.getBoundingClientRect();
    const style = globalObject.getComputedStyle?.(element);
    return rect.width > 0 && rect.height > 0 && style?.visibility !== "hidden" && style?.display !== "none";
  }

  function isComposerControl(element) {
    if (!element?.closest) return false;
    if (element.closest("[data-codex-composer], [data-codex-plus-user-entry], .composer-surface-chrome, form")) return true;
    const rect = element.getBoundingClientRect?.();
    return rect ? rect.top > (globalObject.innerHeight || 0) * 0.45 : false;
  }

  function headerProjectButtons() {
    return Array.from(globalObject.document?.querySelectorAll?.("button[aria-label^='Project:'], button[aria-label^='Change project:']") || [])
      .filter((button) => !isComposerControl(button));
  }

  function activeProjectNameFromHeader() {
    const virtualContext = activeVirtualProjectContext();
    if (virtualContext?.label) return normalize(virtualContext.label);
    const buttons = headerProjectButtons();
    const button = buttons.find(visible) || buttons[0];
    const label = button?.getAttribute?.("aria-label") || "";
    const match = label.match(/^(?:Change project|Project):\s*(.+)$/);
    return match ? normalize(match[1]) : "";
  }

  function headerProjectPathFromDom() {
    const document = globalObject.document;
    if (!document) return "";
    const virtualContext = activeVirtualProjectContext();
    if (virtualContext?.cwd) return virtualContext.cwd;
    const projectlessPath = activeProjectlessThreadPathFromDom();
    if (projectlessPath) return projectlessPath;
    const projectName = activeProjectNameFromHeader();
    if (!projectName) return "";
    const rows = Array.from(document.querySelectorAll("[data-app-action-sidebar-project-row]"));
    const row = rows.find((element) => {
      const label = normalize(element.getAttribute("data-app-action-sidebar-project-label") || element.textContent);
      return label === projectName || label.startsWith(`${projectName} `);
    });
    const path =
      row?.getAttribute("data-app-action-sidebar-project-path") ||
      row?.getAttribute("data-app-action-sidebar-project-id") ||
      row?.getAttribute("title") ||
      "";
    return path.trim();
  }

  function activeProjectlessThreadPathFromDom() {
    const active = globalObject.document?.querySelector?.(
      '[data-app-action-sidebar-thread-active="true"][data-codex-plus-projectless="true"]',
    );
    if (!active) return "";
    const path = active.getAttribute("data-codex-plus-project-path") || active.getAttribute("data-codex-plus-thread-cwd") || "~";
    return path.trim();
  }

  function activeThreadTitleFromDom() {
    const active = globalObject.document?.querySelector?.('[data-app-action-sidebar-thread-active="true"]');
    return normalize(active?.getAttribute?.("data-app-action-sidebar-thread-title") || active?.textContent);
  }

  function activeVirtualProjectContext() {
    const route = globalObject?.CodexPlus?.ui?.virtualConversations?.activeRouteId?.() ||
      decodeURIComponent(String(globalObject.location?.hash || "").replace(/^#/, ""));
    const routeId = normalize(route);
    if (!routeId) return null;
    const routeContext = globalObject?.CodexPlus?.ui?.routeContext?.active?.();
    const context = routeContext && (!routeContext.routeId || routeContext.routeId === routeId) ? {
      cwd: routeContext.activeCwd,
      label: routeContext.sourceProject?.label || "",
      source: routeContext.source || "",
      title: routeContext.title || "",
    } : globalObject?.CodexPlus?.ui?.projectContext?.active?.();
    if (!context?.cwd) return null;
    return {
      cwd: String(context.cwd).trim(),
      label: normalize(context.label || ""),
      title: normalize(context.title || ""),
    };
  }

  function headerTitleElementsForText(title) {
    if (!title) return [];
    const headers = Array.from(globalObject.document?.querySelectorAll?.("header") || []);
    const candidates = [];
    for (const header of headers) {
      if (!normalize(header.textContent).includes(title)) continue;
      for (const element of Array.from(header.querySelectorAll("button,span,div"))) {
        if (normalize(element.textContent) === title && visible(element)) candidates.push(element);
      }
    }
    return candidates.sort((left, right) => {
      const leftArea = left.getBoundingClientRect().width * left.getBoundingClientRect().height;
      const rightArea = right.getBoundingClientRect().width * right.getBoundingClientRect().height;
      return leftArea - rightArea;
    });
  }

  function findHeaderProjectButton() {
    const buttons = headerProjectButtons();
    return buttons.find(visible) || buttons[0] || null;
  }

  function findHeaderTitleElement() {
    const title = activeThreadTitleFromDom();
    return headerTitleElementsForText(title)[0] || null;
  }

  function restoreVirtualHeaderTitles() {
    const document = globalObject.document;
    if (!document?.querySelectorAll) return;
    for (const element of Array.from(document.querySelectorAll("[data-codex-plus-virtual-header-title]") || [])) {
      const original = element.getAttribute("data-codex-plus-original-header-title");
      if (original != null) element.textContent = original;
      element.removeAttribute("data-codex-plus-original-header-title");
      element.removeAttribute("data-codex-plus-virtual-header-title");
    }
  }

  function ensureDomVirtualHeaderTitle() {
    const virtualContext = activeVirtualProjectContext();
    const title = normalize(virtualContext?.title || "");
    const document = globalObject.document;
    if (!document?.querySelectorAll) return false;
    const existing = Array.from(document.querySelectorAll("[data-codex-plus-virtual-header-title]") || [])[0];
    if (!title) {
      restoreVirtualHeaderTitles();
      return false;
    }
    const titleElement = existing || findHeaderTitleElement();
    if (!titleElement) return false;
    if (!titleElement.hasAttribute("data-codex-plus-original-header-title")) {
      titleElement.setAttribute("data-codex-plus-original-header-title", normalize(titleElement.textContent));
    }
    titleElement.setAttribute("data-codex-plus-virtual-header-title", "");
    if (normalize(titleElement.textContent) !== title) titleElement.textContent = title;
    diagnose("domFallback.render.title", { title });
    return true;
  }

  function placeHeaderChip(button, chip) {
    const parent = button?.parentElement || findHeaderTitleElement()?.parentElement;
    if (!parent || !chip) return false;
    const titleElement = findHeaderTitleElement();
    if (titleElement?.parentElement === parent) {
      parent.insertBefore(chip, titleElement.nextSibling);
      return true;
    }
    const title = Array.from(parent.children).find((child) =>
      child !== button &&
      child !== chip &&
      child.tagName !== "BUTTON" &&
      normalize(child.textContent) !== ""
    );
    parent.insertBefore(chip, title?.nextSibling || button.nextSibling);
    return true;
  }

  function ensureDomProjectPathChip() {
    const document = globalObject.document;
    if (!document?.body) return false;
    ensureDomVirtualHeaderTitle();
    const path = headerProjectPathFromDom();
    const button = findHeaderProjectButton();
    const parent = button?.parentElement;
    const existing = document.querySelector("[data-codex-plus-project-path-header]");
    if (existing && existing.getAttribute("data-codex-plus-project-path-header-fallback") !== "") {
      if (existing.title === path) return visible(existing);
      existing.remove();
    }
    if (existing && existing.hasAttribute("data-codex-plus-project-path-header-fallback")) {
      if (existing.title === path) return visible(existing);
      existing.remove();
    }
    if (existing && existing.title === path) return visible(existing);
    if (existing) existing.remove();
    if (!path || (!parent && !findHeaderTitleElement())) return false;

    const chip = document.createElement("div");
    chip.setAttribute("data-codex-plus-project-path-header", "");
    chip.setAttribute("data-codex-plus-project-path-header-fallback", "");
    chip.className =
      "no-drag ml-1 flex min-w-0 items-center gap-1 overflow-hidden rounded border border-token-border px-1.5 py-0.5 text-xs text-token-description-foreground";
    chip.style.flexShrink = "0";
    chip.style.maxWidth = "min(24rem, 28vw)";
    chip.title = path;

    const label = document.createElement("span");
    label.className = "min-w-0 truncate";
    label.textContent = formatPathLabel(path);
    chip.appendChild(label);

    const copy = document.createElement("button");
    copy.type = "button";
    copy.className =
      "flex h-4 w-4 shrink-0 items-center justify-center rounded text-token-input-placeholder-foreground hover:bg-token-list-hover-background hover:text-token-foreground";
    copy.setAttribute("aria-label", "Copy project path");
    copy.title = "Copy project path";
    copy.innerHTML =
      '<svg aria-hidden="true" class="h-3 w-3" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
    copy.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      copyPath(path);
    });
    chip.appendChild(copy);

    placeHeaderChip(button, chip);
    diagnose("domFallback.render.chip", { path, label: label.textContent });
    return true;
  }

  function watchDomProjectPathHeader() {
    const document = globalObject.document;
    if (!document) return null;
    const start = () => {
      ensureDomProjectPathChip();
      if (!document.body || typeof globalObject.MutationObserver !== "function") return null;
      const observer = new globalObject.MutationObserver(() => ensureDomProjectPathChip());
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: [
          "aria-label",
          "data-app-action-sidebar-project-id",
          "data-app-action-sidebar-project-path",
          "data-app-action-sidebar-thread-active",
          "data-codex-plus-project-path",
          "data-codex-plus-projectless",
          "data-codex-plus-active-project-path",
          "data-codex-plus-project-label",
          "data-codex-plus-route-title",
        ],
      });
      return observer;
    };
    if (document.body) return start();
    document.addEventListener?.("DOMContentLoaded", start, { once: true });
    return null;
  }

  function diagnose(event, details) {
    globalObject?.CodexPlus?.diagnostics?.log?.(`projectPathHeader.${event}`, details);
  }

  function ProjectPathAccessory({ context, jsx, jsxs, Tooltip }) {
    const path = pathFromContext(context);
    if (!path) {
      diagnose("render.skip", {
        reason: "missing-cwd",
        contextKeys: context && typeof context === "object" ? Object.keys(context) : [],
      });
      return null;
    }
    const label = formatPathLabel(path);
    diagnose("render.chip", { path, label, tooltip: typeof Tooltip === "function" });
    const chip = jsxs("div", {
      "data-codex-plus-project-path-header": "",
      className:
        "no-drag ml-1 flex min-w-0 items-center gap-1 overflow-hidden rounded border border-token-border px-1.5 py-0.5 text-xs text-token-description-foreground",
      style: { flexShrink: 0, maxWidth: "min(24rem, 28vw)" },
      title: path,
      children: [
        jsx("span", { className: "min-w-0 truncate", children: label }),
        jsx("button", {
          type: "button",
          className:
            "flex h-4 w-4 shrink-0 items-center justify-center rounded text-token-input-placeholder-foreground hover:bg-token-list-hover-background hover:text-token-foreground",
          "aria-label": "Copy project path",
          title: "Copy project path",
          onClick(event) {
            event?.preventDefault?.();
            event?.stopPropagation?.();
            copyPath(path);
          },
          children: jsx("svg", {
            "aria-hidden": "true",
            className: "h-3 w-3",
            fill: "none",
            stroke: "currentColor",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeWidth: "2",
            viewBox: "0 0 24 24",
            children: [
              jsx("rect", { x: "9", y: "9", width: "13", height: "13", rx: "2", ry: "2" }),
              jsx("path", { d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" }),
            ],
          }),
        }),
      ],
    });
    if (typeof Tooltip === "function") return jsx(Tooltip, { tooltipContent: path, children: chip });
    return chip;
  }

  let headerObserver = null;
  let headerRetryTimer = null;

  const exportsObject = {
    ProjectPathAccessory,
    copyPath,
    formatPathLabel,
    headerProjectPathFromDom,
    ensureDomProjectPathChip,
    ensureDomVirtualHeaderTitle,
    middleTruncate,
    pathFromContext,
    activeVirtualProjectContext,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exportsObject;
  }

  const CodexPlus = globalObject?.CodexPlus;
  if (!CodexPlus) return;

  CodexPlus.registerPlugin(
    CodexPlus.definePlugin({
      id: "projectPathHeader",
      name: "Project Path Header",
      description: "Shows the active project path in the thread header.",
      required: true,
      exports: exportsObject,
      start(api) {
        diagnose("start", { hasThreadHeader: Boolean(api.ui.threadHeader) });
        api.ui.threadHeader.addAccessory(ProjectPathAccessory);
        headerObserver = watchDomProjectPathHeader();
        let retries = 40;
        headerRetryTimer = globalObject.setInterval?.(() => {
          if (ensureDomProjectPathChip() || --retries <= 0) {
            globalObject.clearInterval?.(headerRetryTimer);
            headerRetryTimer = null;
          }
        }, 500);
      },
      stop() {
        headerObserver?.disconnect?.();
        headerObserver = null;
        if (headerRetryTimer != null) globalObject.clearInterval?.(headerRetryTimer);
        headerRetryTimer = null;
      },
    }),
  );
})(typeof window !== "undefined" ? window : globalThis);
