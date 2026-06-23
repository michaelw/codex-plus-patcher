(function () {
  const CodexPlus = window.CodexPlus;
  const palette = [
    "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b", "#e377c2", "#7f7f7f",
    "#bcbd22", "#17becf", "#4e79a7", "#f28e2b", "#59a14f", "#e15759", "#76b7b2", "#edc948",
    "#b07aa1", "#ff9da7", "#9c755f", "#bab0ab", "#0072b2", "#d55e00", "#009e73", "#cc79a7",
    "#56b4e9", "#e69f00", "#f0e442", "#882255", "#44aa99", "#117733", "#999933", "#aa4499",
  ];
  function hash(value) {
    let result = 2166136261;
    for (const char of String(value || "")) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
    return result >>> 0;
  }
  CodexPlus.registerPlugin(
    CodexPlus.definePlugin({
      id: "projectColors",
      name: "Project Colors",
      description: "Provides deterministic project accent colors across sidebar, messages, and composer surfaces.",
      required: true,
      settings: {
        enabled: { type: "boolean", default: true },
      },
      start(api) {
        api.modules.registerHostModule("codex-plus:project-colors", {
          colorFor(key) {
            return palette[hash(key) % palette.length];
          },
          palette,
        });
        api.ui.settings.appearance.addRow({ id: "codex-plus-project-colors", plugin: "projectColors" });
        api.ui.sidebar.decorateProjectRow((props) => ({ ...props, "data-codex-plus-project-color": "" }));
        api.ui.sidebar.decorateThreadRow((props) => ({ ...props, "data-codex-plus-project-color": "" }));
      },
    }),
  );
})();
