(function () {
  const CodexPlus = window.CodexPlus;
  CodexPlus.registerPlugin(
    CodexPlus.definePlugin({
      id: "diagnosticErrors",
      name: "Diagnostic Errors",
      description: "Adds richer diagnostic context to selected Codex app-shell errors.",
      required: true,
      start(api) {
        api.ui.errors.decorateBoundary((error) => ({
          name: error?.name || null,
          message: error?.message || String(error),
          stack: error?.stack || null,
        }));
      },
    }),
  );
})();
