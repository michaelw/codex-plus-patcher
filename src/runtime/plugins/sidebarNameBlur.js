(function () {
  const CodexPlus = window.CodexPlus;
  CodexPlus.registerPlugin(
    CodexPlus.definePlugin({
      id: "sidebarNameBlur",
      name: "Sidebar Name Blur",
      description: "Registers the session-only Toggle sidebar blur command.",
      required: true,
      styles: ':root[data-codex-plus-sidebar-names-blurred="true"] :is([data-thread-title],[data-codex-plus-sidebar-name]){filter:blur(4px);user-select:none}',
      commands: [
        {
          id: "codexPlusToggleSidebarNameBlur",
          title: "Toggle sidebar blur",
          description: "Blur or show sidebar chat and project names",
          menu: { groups: ["suggested", "panels"] },
          palette: { enabled: true, keywords: ["privacy", "blur"] },
          shortcut: { defaultKeybindings: [] },
          run() {
            const root = document.documentElement;
            const enabled = root.getAttribute("data-codex-plus-sidebar-names-blurred") === "true";
            if (enabled) root.removeAttribute("data-codex-plus-sidebar-names-blurred");
            else root.setAttribute("data-codex-plus-sidebar-names-blurred", "true");
          },
        },
      ],
    }),
  );
})();
