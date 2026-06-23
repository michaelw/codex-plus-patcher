(function () {
  const CodexPlus = window.CodexPlus;
  CodexPlus.registerPlugin(
    CodexPlus.definePlugin({
      id: "userBubbleColors",
      name: "User Bubble Colors",
      description: "Manages user-message bubble color settings and CSS variables.",
      required: true,
      settings: {
        light: { type: "color", default: "" },
        dark: { type: "color", default: "" },
      },
      start(api) {
        api.ui.settings.appearance.addRow({ id: "codex-plus-user-bubble-colors", plugin: "userBubbleColors" });
        api.ui.message.decorateUserBubble((props) => ({ ...props, "data-codex-plus-user-bubble": "" }));
        api.ui.composer.decorateSurface((props) => ({ ...props, "data-codex-plus-user-entry": "" }));
      },
    }),
  );
})();
