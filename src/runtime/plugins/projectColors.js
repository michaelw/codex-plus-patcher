(function () {
  const CodexPlus = window.CodexPlus;
  const STORAGE_KEY = "codex-plus:project-colors-enabled";
  const EVENT = "codex-plus:project-colors-change";
  const palette = [
    ["#5b8ff9", "#dbeafe", "#1d4ed8", "#f8fbff"], ["#61dDAA", "#dcfce7", "#15803d", "#f7fff9"],
    ["#65789b", "#e0e7ff", "#4338ca", "#f8faff"], ["#f6bd16", "#fef3c7", "#b45309", "#fffdf5"],
    ["#7262fd", "#ede9fe", "#6d28d9", "#fbf8ff"], ["#78d3f8", "#e0f2fe", "#0369a1", "#f5fcff"],
    ["#9661bc", "#f3e8ff", "#7e22ce", "#fdf7ff"], ["#f6903d", "#ffedd5", "#c2410c", "#fff9f4"],
    ["#008685", "#ccfbf1", "#0f766e", "#f5fffd"], ["#f08bb4", "#fce7f3", "#be185d", "#fff7fb"],
    ["#6dc8ec", "#e0f7ff", "#0e7490", "#f5fdff"], ["#8d70f8", "#ede9fe", "#5b21b6", "#faf8ff"],
    ["#c2c8d5", "#e5e7eb", "#4b5563", "#fbfbfc"], ["#ff9d4d", "#fee2e2", "#b91c1c", "#fff7f7"],
    ["#269a99", "#d1fae5", "#047857", "#f6fffb"], ["#ff99c3", "#fce7f3", "#be123c", "#fff8fb"],
    ["#4c78a8", "#dbeafe", "#1e40af", "#f8fbff"], ["#72b7b2", "#ccfbf1", "#0f766e", "#f5fffd"],
    ["#54a24b", "#dcfce7", "#166534", "#f7fff7"], ["#eeca3b", "#fef9c3", "#a16207", "#fffdf2"],
    ["#b279a2", "#fce7f3", "#9d174d", "#fff7fb"], ["#ff9da6", "#ffe4e6", "#be123c", "#fff7f8"],
    ["#9d755d", "#ffedd5", "#9a3412", "#fff9f4"], ["#bab0ac", "#e7e5e4", "#57534e", "#fbfaf9"],
    ["#7f7f7f", "#e5e7eb", "#374151", "#fafafa"], ["#bcbd22", "#fef9c3", "#854d0e", "#fffdf2"],
    ["#17becf", "#cffafe", "#0e7490", "#f5feff"], ["#1f77b4", "#dbeafe", "#1d4ed8", "#f7fbff"],
    ["#2ca02c", "#dcfce7", "#15803d", "#f7fff7"], ["#9467bd", "#f3e8ff", "#7e22ce", "#fcf7ff"],
    ["#8c564b", "#fee2e2", "#991b1b", "#fff7f6"], ["#e377c2", "#fce7f3", "#be185d", "#fff8fb"],
  ];

  function readEnabled() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored == null ? true : stored === "true";
    } catch {
      return true;
    }
  }

  function writeEnabled(value) {
    try {
      localStorage.setItem(STORAGE_KEY, value ? "true" : "false");
      window.dispatchEvent(new CustomEvent(EVENT, { detail: { key: STORAGE_KEY, value } }));
    } catch {}
  }

  function fnv1a32(value) {
    let result = 0x811c9dc5;
    for (const char of String(value || "")) result = Math.imul(result ^ char.charCodeAt(0), 0x01000193);
    return result >>> 0;
  }

  function colorKey(project) {
    if (project == null) return "";
    if (typeof project === "string") return project.trim();
    const id = project.projectId ?? project.id;
    if (id != null && String(id).trim() !== "") return String(id).trim();
    const host = project.hostId ?? project.host ?? project.remoteHostId ?? "local";
    const path = project.path ?? project.cwd ?? project.projectPath ?? project.remotePath ?? project.root ?? project.workspaceRoot;
    if (path != null && String(path).trim() !== "") return `${host}:${path}`;
    return [project.label, project.name].filter(Boolean).join(":");
  }

  function colorFor(project) {
    return palette[fnv1a32(colorKey(project)) % palette.length];
  }

  const projectByPath = new Map();
  const projectByName = new Map();

  function pathBasename(value) {
    const trimmed = String(value || "").replace(/\/+$/, "");
    if (trimmed === "") return "";
    return trimmed.split("/").pop() || "";
  }

  function projectPathKeys(project) {
    if (project == null || typeof project === "string") return [];
    const host = project.hostId ?? project.host ?? project.remoteHostId ?? "local";
    const paths = [project.path, project.cwd, project.projectPath, project.remotePath, project.root, project.workspaceRoot]
      .filter((value) => value != null && String(value).trim() !== "")
      .map((value) => String(value).trim());
    return paths.map((path) => `${host}:${path}`);
  }

  function projectNameKeys(project) {
    if (project == null || typeof project === "string") return [];
    const repositoryRoot = project.repositoryData?.rootFolder;
    const values = [
      project.label,
      project.name,
      repositoryRoot,
      pathBasename(project.projectId),
      pathBasename(project.id),
      ...projectPathKeys(project).map((key) => pathBasename(key)),
    ];
    return Array.from(new Set(values
      .filter((value) => value != null && String(value).trim() !== "")
      .map((value) => String(value).trim())));
  }

  function rememberProjectName(key, project) {
    if (key === "") return;
    const existing = projectByName.get(key);
    if (existing === undefined) {
      projectByName.set(key, project);
      return;
    }
    if (existing != null && colorKey(existing) !== colorKey(project)) projectByName.set(key, null);
  }

  function rememberProject(project) {
    const key = colorKey(project);
    if (key.trim() === "") return project;
    for (const pathKey of projectPathKeys(project)) projectByPath.set(pathKey, project);
    for (const nameKey of projectNameKeys(project)) rememberProjectName(nameKey, project);
    return project;
  }

  function resolveProject(project) {
    for (const pathKey of projectPathKeys(project)) {
      const knownProject = projectByPath.get(pathKey);
      if (knownProject) return knownProject;
    }
    for (const nameKey of projectNameKeys(project)) {
      const knownProject = projectByName.get(nameKey);
      if (knownProject) return knownProject;
    }
    return null;
  }

  function activeSidebarStyle() {
    const active = document.querySelector('[data-app-action-sidebar-thread-active="true"][data-codex-plus-project-color]');
    if (!active) return undefined;
    const computed = getComputedStyle(active);
    const accent = computed.getPropertyValue("--codex-plus-project-accent").trim();
    if (accent === "") return undefined;
    return {
      "--codex-plus-project-accent": accent,
      "--codex-plus-project-bg-light": computed.getPropertyValue("--codex-plus-project-bg-light").trim(),
      "--codex-plus-project-fg-light": computed.getPropertyValue("--codex-plus-project-fg-light").trim(),
      "--codex-plus-project-soft-light": computed.getPropertyValue("--codex-plus-project-soft-light").trim(),
      "--codex-plus-project-bg-dark": computed.getPropertyValue("--codex-plus-project-bg-dark").trim(),
      "--codex-plus-project-fg-dark": computed.getPropertyValue("--codex-plus-project-fg-dark").trim(),
      "--codex-plus-project-border-dark": computed.getPropertyValue("--codex-plus-project-border-dark").trim(),
      "--codex-plus-project-separator-light": computed.getPropertyValue("--codex-plus-project-separator-light").trim(),
      "--codex-plus-project-separator-dark": computed.getPropertyValue("--codex-plus-project-separator-dark").trim(),
      borderLeft: `6px solid ${accent}`,
    };
  }

  function style(project) {
    const key = colorKey(project);
    if (!readEnabled() || key.trim() === "") return undefined;
    const [accent, bgLight, fgLight, softLight] = colorFor(key);
    return {
      "--codex-plus-project-accent": accent,
      "--codex-plus-project-bg-light": bgLight,
      "--codex-plus-project-fg-light": fgLight,
      "--codex-plus-project-soft-light": softLight,
      "--codex-plus-project-bg-dark": `color-mix(in srgb, ${accent} 24%, transparent)`,
      "--codex-plus-project-fg-dark": "#f8fafc",
      "--codex-plus-project-border-dark": `color-mix(in srgb, ${accent} 62%, transparent)`,
      "--codex-plus-project-separator-light": "rgba(17,24,39,.24)",
      "--codex-plus-project-separator-dark": "rgba(255,255,255,.34)",
      borderLeft: `6px solid ${accent}`,
    };
  }

  function dataAttributes(project, sidebar) {
    const resolvedProject = sidebar ? rememberProject(project) : resolveProject(project);
    const directStyle = style(project);
    const inlineStyle = resolvedProject ? style(resolvedProject) : directStyle ?? activeSidebarStyle();
    if (inlineStyle == null) return undefined;
    return {
      "data-codex-plus-project-color": "",
      ...(sidebar ? { "data-codex-plus-project-sidebar-color": "" } : {}),
      style: inlineStyle,
    };
  }

  function renderToggleRow({ React, jsx, SettingRow, Switch, label, ariaLabel }) {
    const [enabled, setEnabled] = React.useState(readEnabled);
    React.useEffect(() => {
      const listener = () => setEnabled(readEnabled());
      window.addEventListener(EVENT, listener);
      return () => window.removeEventListener(EVENT, listener);
    }, []);
    return jsx(SettingRow, {
      control: jsx(Switch, {
        checked: enabled,
        onChange: (next) => {
          setEnabled(next);
          writeEnabled(next);
        },
        ariaLabel,
      }),
      label,
      variant: "nested",
    });
  }

  CodexPlus.registerPlugin(
    CodexPlus.definePlugin({
      id: "projectColors",
      name: "Project Colors",
      description: "Provides deterministic project accent colors across sidebar, messages, and composer surfaces.",
      required: true,
      styles:
        ":root:not(.dark):not(.electron-dark) :is([data-app-action-sidebar-project-row],[data-app-action-sidebar-thread-row][data-codex-plus-project-sidebar-color],[data-app-action-sidebar-project-list-id][data-codex-plus-project-sidebar-color] [data-app-action-sidebar-thread-row]){border-radius:0;background-color:var(--codex-plus-project-soft-light);border-left-color:var(--codex-plus-project-accent)}" +
        ":root:not(.dark):not(.electron-dark) :is([data-app-action-sidebar-thread-row][data-codex-plus-project-sidebar-color],[data-app-action-sidebar-project-list-id][data-codex-plus-project-sidebar-color] [data-app-action-sidebar-thread-row])[data-app-action-sidebar-thread-active=\"true\"]{background-color:var(--codex-plus-project-bg-light);box-shadow:inset 5px 0 0 var(--codex-plus-project-accent)}" +
        ":root.dark :is([data-app-action-sidebar-project-row],[data-app-action-sidebar-thread-row][data-codex-plus-project-sidebar-color],[data-app-action-sidebar-project-list-id][data-codex-plus-project-sidebar-color] [data-app-action-sidebar-thread-row]),:root.electron-dark :is([data-app-action-sidebar-project-row],[data-app-action-sidebar-thread-row][data-codex-plus-project-sidebar-color],[data-app-action-sidebar-project-list-id][data-codex-plus-project-sidebar-color] [data-app-action-sidebar-thread-row]){border-radius:0;background-color:var(--codex-plus-project-bg-dark);border-left-color:var(--codex-plus-project-border-dark)}" +
        ":root.dark :is([data-app-action-sidebar-thread-row][data-codex-plus-project-sidebar-color],[data-app-action-sidebar-project-list-id][data-codex-plus-project-sidebar-color] [data-app-action-sidebar-thread-row])[data-app-action-sidebar-thread-active=\"true\"],:root.electron-dark :is([data-app-action-sidebar-thread-row][data-codex-plus-project-sidebar-color],[data-app-action-sidebar-project-list-id][data-codex-plus-project-sidebar-color] [data-app-action-sidebar-thread-row])[data-app-action-sidebar-thread-active=\"true\"]{background-color:color-mix(in srgb,var(--codex-plus-project-accent) 38%,transparent);border-left-color:color-mix(in srgb,var(--codex-plus-project-accent) 88%,transparent);box-shadow:inset 5px 0 0 var(--codex-plus-project-accent)}" +
        ":root:not(.dark):not(.electron-dark) [data-codex-plus-project-color]{border-left-color:var(--codex-plus-project-accent)}" +
        ":root.dark [data-codex-plus-project-color],:root.electron-dark [data-codex-plus-project-color]{border-left-color:var(--codex-plus-project-border-dark)}" +
        ":root:not(.dark):not(.electron-dark) [data-codex-plus-project-color]:not([data-codex-plus-project-sidebar-color]){box-shadow:inset 6px 0 0 var(--codex-plus-project-accent);border-left-color:var(--codex-plus-project-accent)}" +
        ":root.dark [data-codex-plus-project-color]:not([data-codex-plus-project-sidebar-color]),:root.electron-dark [data-codex-plus-project-color]:not([data-codex-plus-project-sidebar-color]){box-shadow:inset 6px 0 0 var(--codex-plus-project-accent);border-left-color:var(--codex-plus-project-border-dark)}" +
        "[data-codex-plus-user-entry][data-codex-plus-project-color]{box-shadow:inset 6px 0 0 var(--codex-plus-project-accent),0 0 0 .5px rgba(255,255,255,.2)!important}",
      exports: {
        colorFor,
        colorKey,
        dataAttributes,
        eventName: EVENT,
        fnv1a32,
        palette,
        readEnabled,
        renderToggleRow,
        style,
        writeEnabled,
      },
      start(api) {
        api.ui.settings.appearance.addRow({
          id: "codex-plus-project-colors",
          order: 20,
          plugin: "projectColors",
          render: (deps) => renderToggleRow({
            ...deps,
            label: "Project colors",
            ariaLabel: `${deps.variant || "Current"} project colors`,
          }),
        });
        api.ui.sidebar.decorateProjectRow((props) => dataAttributes(props?.project, true));
        api.ui.sidebar.decorateThreadRow((props) => dataAttributes(props?.project, true));
        api.ui.message.decorateUserBubble((props) => dataAttributes(props?.project, false));
        api.ui.composer.decorateSurface((props) => dataAttributes(props?.project, false));
      },
    }),
  );
})();
