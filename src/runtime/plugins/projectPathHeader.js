(function (globalObject) {
  function pathFromContext(context) {
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
      style: { flexShrink: 999, maxWidth: "min(24rem, 28vw)" },
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

  const exportsObject = {
    ProjectPathAccessory,
    copyPath,
    formatPathLabel,
    middleTruncate,
    pathFromContext,
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
      },
    }),
  );
})(typeof window !== "undefined" ? window : globalThis);
