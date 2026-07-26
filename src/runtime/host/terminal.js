(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;
  const configuredTerminals = new WeakSet();

  function configureUnicode11(terminal) {
    if (configuredTerminals.has(terminal)) return terminal;

    const Unicode11Addon = globalObject.Unicode11Addon?.Unicode11Addon;
    if (typeof Unicode11Addon !== "function") {
      throw new Error("Codex Plus terminal: Unicode 11 addon is unavailable");
    }
    if (
      terminal == null
      || typeof terminal.loadAddon !== "function"
      || terminal.unicode == null
      || typeof terminal.unicode.register !== "function"
    ) {
      throw new Error("Codex Plus terminal: xterm Unicode API is unavailable");
    }

    terminal.loadAddon(new Unicode11Addon());
    terminal.unicode.activeVersion = "11";
    if (terminal.unicode.activeVersion !== "11") {
      throw new Error("Codex Plus terminal: xterm rejected Unicode version 11");
    }
    configuredTerminals.add(terminal);
    return terminal;
  }

  globalObject.CodexPlusHost.adapters.terminal = {
    configureUnicode11,
  };
})();
