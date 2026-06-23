(function () {
  const CodexPlus = window.CodexPlus;
  CodexPlus.registerPlugin(
    CodexPlus.definePlugin({
      id: "aboutMetadata",
      name: "About Metadata",
      description: "Adds Codex Plus provenance and disclaimer metadata to the About dialog host surface.",
      required: true,
      start(api) {
        api.ui.about.addBuildInfo(() => ({
          heading: "Disclaimer of Warranty and Limitation of Liability",
          lines: ["Codex Plus runtime plugin layer active", "Plugin: aboutMetadata"],
        }));
      },
    }),
  );
})();
