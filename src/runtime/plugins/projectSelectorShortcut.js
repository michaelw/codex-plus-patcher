(function () {
  const CodexPlus = window.CodexPlus;
  const triggerSelector = "[data-codex-plus-project-selector-trigger]";
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
    return window.fzf?.Fzf;
  }

  function fallbackFilter(items, query) {
    const needle = normalizeForFzf(query).text.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => projectSearchText(item).toLowerCase().includes(needle));
  }

  function fuzzyFilter(items, query) {
    const list = Array.isArray(items) ? items : [];
    const normalizedQuery = normalizeForFzf(query).text.trim();
    if (!normalizedQuery) return list;

    const Fzf = fzfConstructor();
    if (typeof Fzf !== "function") return fallbackFilter(list, query);

    return new Fzf(
      list.map((project) => ({ project, searchText: projectSearchText(project) })),
      { selector: (entry) => entry.searchText },
    ).find(normalizedQuery).map((entry) => entry.item.project);
  }

  function labelPositions(text, query) {
    const Fzf = fzfConstructor();
    if (typeof Fzf !== "function") return null;

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

  function dispatchMouseEvent(target, type) {
    if (typeof target.dispatchEvent !== "function") return false;
    const EventConstructor = type === "pointerdown"
      ? window.PointerEvent || window.MouseEvent
      : window.MouseEvent;
    if (typeof EventConstructor !== "function") return false;
    target.dispatchEvent(new EventConstructor(type, {
      bubbles: true,
      button: 0,
      buttons: type === "pointerdown" || type === "mousedown" ? 1 : 0,
      cancelable: true,
      ctrlKey: false,
      view: window,
    }));
    return true;
  }

  function visibleTriggerCandidates() {
    return Array.from(document.querySelectorAll(triggerSelector)).filter((trigger) => {
      if (!(trigger instanceof HTMLElement)) return false;
      if (trigger.disabled || trigger.getAttribute("aria-disabled") === "true") return false;
      const rect = trigger.getBoundingClientRect?.();
      return rect && rect.width > 0 && rect.height > 0;
    });
  }

  function triggerPriority(trigger) {
    const variant = trigger.getAttribute("data-codex-plus-project-selector-variant");
    if (variant === "default") return 0;
    if (variant == null || variant === "") return 1;
    return 2;
  }

  function projectSelectorTrigger() {
    const [trigger] = visibleTriggerCandidates().sort((left, right) => {
      const priority = triggerPriority(left) - triggerPriority(right);
      if (priority !== 0) return priority;
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      return rightRect.top - leftRect.top || rightRect.left - leftRect.left;
    });
    return trigger ?? null;
  }

  function focusProjectSelector() {
    const trigger = projectSelectorTrigger();
    if (trigger == null) return false;
    trigger.focus?.();
    const dispatched = [
      dispatchMouseEvent(trigger, "pointerdown"),
      dispatchMouseEvent(trigger, "mousedown"),
      dispatchMouseEvent(trigger, "mouseup"),
      dispatchMouseEvent(trigger, "click"),
    ].some(Boolean);
    if (!dispatched) trigger.click?.();
    return true;
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
          if (api.commands.run("codexPlus.focusProjectSelector")) event.preventDefault();
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
