(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;
  const core = {
    commands: new Map(),
    diagnosticEvents: [],
    hostModules: new Map(),
    patchDescriptors: [],
    plugins: new Map(),
    settingsListeners: new Map(),
    startedPlugins: new Set(),
    storagePrefix: "codex-plus:plugin:",
    styleElements: new Map(),
    waiters: [],
  };

  function safeId(id) {
    if (typeof id !== "string" || id.trim() === "") throw new Error("Codex Plus plugin ids must be non-empty strings");
    return id.trim();
  }

  function definePlugin(definition) {
    const id = safeId(definition.id || definition.name);
    return { ...definition, id };
  }

  function registerPlugin(definition) {
    const plugin = definePlugin(definition);
    core.plugins.set(plugin.id, plugin);
    if (plugin.settings) plugin.settingsStore = CodexPlus.settings.define(plugin.id, plugin.settings);
    for (const descriptor of plugin.patches || []) CodexPlus.patches.register({ ...descriptor, plugin: plugin.id });
    for (const command of plugin.commands || []) CodexPlus.commands.register({ ...command, plugin: plugin.id });
    if (plugin.styles) CodexPlus.styles.register(plugin.id, plugin.styles);
    if (plugin.required || plugin.enabledByDefault) startPlugin(plugin.id);
    CodexPlus.diagnostics.log("plugin.register", { id: plugin.id, started: core.startedPlugins.has(plugin.id) });
    return plugin;
  }

  function startPlugin(id) {
    const plugin = core.plugins.get(id);
    if (!plugin || core.startedPlugins.has(id)) return;
    plugin.start?.(CodexPlus);
    core.startedPlugins.add(id);
    CodexPlus.diagnostics.log("plugin.start", { id });
  }

  function stopPlugin(id) {
    const plugin = core.plugins.get(id);
    if (!plugin || !core.startedPlugins.has(id)) return;
    plugin.stop?.(CodexPlus);
    core.startedPlugins.delete(id);
  }

  function mergeDataAttributes(base, extra) {
    if (extra == null) return base;
    if (base == null) return extra;
    return { ...base, ...extra, style: { ...base.style, ...extra.style } };
  }

  function applyDecorators(props, decorators) {
    let result;
    for (const decorator of decorators) result = mergeDataAttributes(result, decorator(props));
    return result;
  }

  core.plugins.list = () => Array.from(core.plugins.values());

  const CodexPlus = {
    config: globalObject.__CodexPlusRuntimeConfig || {},
    definePlugin,
    registerPlugin,
    startPlugin,
    stopPlugin,
    plugins: core.plugins,
    ui: {},
  };

  globalObject.CodexPlus = CodexPlus;
  globalObject.CodexPlusDiagnostics = null;
  globalObject.CodexPlusHost ||= {};
  globalObject.CodexPlusHost.adapters ||= {};
  globalObject.__CodexPlusRuntime = { core, safeId, mergeDataAttributes, applyDecorators };
})();
