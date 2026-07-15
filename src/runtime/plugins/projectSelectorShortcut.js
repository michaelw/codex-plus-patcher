(function () {
  const CodexPlus = window.CodexPlus;
  let keydownHandler = null;

  function normalizeForFzf(value) {
    const source = String(value ?? "");
    const map = [];
    let text = "";
    let inSeparator = false;

    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (/[\s-]/.test(char)) {
        if (!inSeparator) {
          text += " ";
          map.push(index);
          inSeparator = true;
        }
        continue;
      }
      text += char;
      map.push(index);
      inSeparator = false;
    }

    return { map, text };
  }

  function projectSearchText(project) {
    return [
      project?.label,
      project?.repositoryData?.rootFolder,
      project?.path,
      project?.hostDisplayName,
    ].map((value) => normalizeForFzf(value).text.trim()).filter(Boolean).join(" ");
  }

  function fzfConstructor() {
    const Fzf = window.fzf?.Fzf;
    if (typeof Fzf !== "function") throw new Error("Required Codex Plus fzf asset is unavailable");
    return Fzf;
  }

  function fuzzyFilter(items, query) {
    const list = Array.isArray(items) ? items : [];
    const normalizedQuery = normalizeForFzf(query).text.trim();
    if (!normalizedQuery) return list;

    const Fzf = fzfConstructor();
    return new Fzf(list, { selector: projectSearchText }).find(normalizedQuery).map((entry) => entry.item);
  }

  function labelPositions(text, query) {
    const Fzf = fzfConstructor();
    const normalizedText = normalizeForFzf(text);
    const normalizedQuery = normalizeForFzf(query).text.trim();
    if (!normalizedText.text || !normalizedQuery) return null;

    const [entry] = new Fzf([normalizedText.text]).find(normalizedQuery);
    if (!entry || typeof entry.positions?.forEach !== "function") return null;

    const positions = [];
    entry.positions.forEach((index) => positions.push(index));
    return positions.map((index) => normalizedText.map[index]).filter((index) => Number.isInteger(index));
  }

  function fuzzyHighlight({ text, query, jsx }) {
    if (typeof jsx !== "function") return text;

    const positions = labelPositions(text, query);
    if (positions == null || positions.length === 0) return text;

    const matchedIndices = new Set(positions);
    const parts = [];
    let index = 0;
    let key = 0;
    const style = {
      color: "var(--color-token-text-link-foreground, #2563eb)",
    };

    while (index < text.length) {
      const isMatched = matchedIndices.has(index);
      const start = index;
      while (index < text.length && matchedIndices.has(index) === isMatched) index += 1;

      const value = text.slice(start, index);
      parts.push(
        isMatched
          ? jsx("strong", {
              className: "font-semibold",
              style,
              children: value,
            }, key++)
          : value,
      );
    }

    return parts;
  }

  function focusProjectSelector() {
    return window.CodexPlusHost.adapters.projectSelector.open("default");
  }

  CodexPlus.registerPlugin(
    CodexPlus.definePlugin({
      id: "projectSelectorShortcut",
      name: "Project Selector Shortcut",
      description: "Registers the Focus project selector command.",
      required: true,
      commands: [
        {
          id: "codexPlus.focusProjectSelector",
          title: "Focus project selector",
          description: "Focus or open the new chat project selector",
          menu: { groups: ["suggested", "workspace"] },
          palette: { enabled: true, keywords: ["project", "selector", "new chat"] },
          shortcut: { defaultKeybindings: [{ key: "CmdOrCtrl+." }] },
          run: focusProjectSelector,
        },
      ],
      start(api) {
        api.ui.projectSelector = {
          fuzzyFilter,
          fuzzyHighlight,
        };
        keydownHandler = (event) => {
          if (event.defaultPrevented || event.key !== "." || (!event.metaKey && !event.ctrlKey) || event.altKey || event.shiftKey) {
            return;
          }
          if (window.CodexPlusHost.adapters.commands.dispatch("codexPlus.focusProjectSelector").handled) event.preventDefault();
        };
        document.addEventListener("keydown", keydownHandler, true);
      },
      stop() {
        if (keydownHandler) document.removeEventListener("keydown", keydownHandler, true);
        keydownHandler = null;
      },
    }),
  );
})();
