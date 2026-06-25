(function () {
  const CodexPlus = window.CodexPlus;
  CodexPlus.registerPlugin(
    CodexPlus.definePlugin({
      id: "devTools",
      name: "Developer Tools",
      description: "Registers the Open Developer Tools command.",
      required: true,
      commands: [
        {
          id: "codexPlusOpenDevTools",
          title: "Open Developer Tools",
          description: "Open DevTools for the current Codex window",
          menu: { groups: ["panels"] },
          palette: { enabled: true, keywords: ["devtools", "developer", "console"] },
          shortcut: { defaultKeybindings: [] },
          run() {
            return CodexPlus.native.request("devtools/open").catch(() => ({ ok: false }));
          },
        },
      ],
      start(api) {
        api.nativeMenus.registerItem({
          id: "codexPlusOpenDevTools",
          menuId: "view-menu",
          afterLabel: "Find",
          label: "Open Developer Tools",
          nativeRequest: { method: "devtools/open" },
        });
      },
    }),
  );
})();
