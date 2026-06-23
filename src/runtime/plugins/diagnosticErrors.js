(function (globalObject) {
  const DETAIL_CLASS =
    "max-h-80 max-w-full overflow-auto whitespace-pre-wrap rounded-md border border-token-border bg-token-main-surface-secondary p-2 text-left font-vscode-editor text-[11px] leading-4 text-token-text-primary";

  function diagnosticText(error, componentStack) {
    const base = error?.stack ?? error?.message ?? String(error ?? "");
    if (!base && !componentStack) return "";
    return [base, componentStack].filter(Boolean).join("\n\n");
  }

  function diagnosticSummary(error) {
    return {
      name: error?.name || null,
      message: error?.message || String(error),
      stack: error?.stack || null,
    };
  }

  function renderDetails({ jsx, error, componentStack }) {
    if (typeof jsx !== "function") return null;
    const text = diagnosticText(error, componentStack);
    if (!text) return null;
    return jsx("pre", { className: DETAIL_CLASS, children: text });
  }

  const exportsObject = {
    detailClassName: DETAIL_CLASS,
    diagnosticSummary,
    diagnosticText,
    renderDetails,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exportsObject;
  }

  const CodexPlus = globalObject?.CodexPlus;
  if (!CodexPlus) return;

  CodexPlus.registerPlugin(
    CodexPlus.definePlugin({
      id: "diagnosticErrors",
      name: "Diagnostic Errors",
      description: "Adds richer diagnostic context to selected Codex app-shell errors.",
      required: true,
      exports: exportsObject,
      start(api) {
        api.ui.errors.decorateBoundary(diagnosticSummary);
      },
    }),
  );
})(typeof window !== "undefined" ? window : globalThis);
