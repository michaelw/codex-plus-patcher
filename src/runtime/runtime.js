(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;
  const plugins = new Map();
  const startedPlugins = new Set();
  const hostModules = new Map();
  const waiters = [];
  const patchDescriptors = [];
  const commands = new Map();
  const styleElements = new Map();
  const settingsListeners = new Map();
  const storagePrefix = "codex-plus:plugin:";

  function safeId(id) {
    if (typeof id !== "string" || id.trim() === "") throw new Error("Codex Plus plugin ids must be non-empty strings");
    return id.trim();
  }

  function definePlugin(definition) {
    const id = safeId(definition.id || definition.name);
    return { ...definition, id };
  }

  function notifyWaiters(name, value) {
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      const waiter = waiters[index];
      if (!waiter.filter(value, name)) continue;
      waiters.splice(index, 1);
      waiter.resolve(value);
    }
  }

  function registerHostModule(name, value) {
    hostModules.set(name, value);
    notifyWaiters(name, value);
    return value;
  }

  function moduleValues() {
    return Array.from(hostModules.values());
  }

  function findByProps(...props) {
    return moduleValues().find((value) => value && props.every((prop) => prop in value));
  }

  function findByCode(text) {
    return moduleValues().find((value) => {
      try {
        return String(value).includes(text);
      } catch {
        return false;
      }
    });
  }

  function findComponentByCode(text) {
    return moduleValues().find((value) => {
      try {
        return typeof value === "function" && String(value).includes(text);
      } catch {
        return false;
      }
    });
  }

  function waitFor(filter) {
    for (const [name, value] of hostModules) {
      if (filter(value, name)) return Promise.resolve(value);
    }
    return new Promise((resolve) => waiters.push({ filter, resolve }));
  }

  function getPluginStore(pluginId) {
    const key = `${storagePrefix}${pluginId}`;
    try {
      return JSON.parse(globalObject.localStorage?.getItem(key) || "{}") || {};
    } catch {
      return {};
    }
  }

  function writePluginStore(pluginId, store) {
    const key = `${storagePrefix}${pluginId}`;
    globalObject.localStorage?.setItem(key, JSON.stringify(store));
  }

  function emitSetting(pluginId, key, value) {
    const listenerKey = `${pluginId}:${key}`;
    for (const listener of settingsListeners.get(listenerKey) || []) listener(value);
  }

  function defineSettings(pluginId, definitions) {
    const id = safeId(pluginId);
    const store = getPluginStore(id);
    for (const [key, definition] of Object.entries(definitions || {})) {
      if (!(key in store) && "default" in definition) store[key] = definition.default;
    }
    writePluginStore(id, store);
    return {
      definitions,
      get(key) {
        return getPluginStore(id)[key];
      },
      set(key, value) {
        const next = getPluginStore(id);
        next[key] = value;
        writePluginStore(id, next);
        emitSetting(id, key, value);
      },
      use(key, listener) {
        const listenerKey = `${id}:${key}`;
        const listeners = settingsListeners.get(listenerKey) || new Set();
        listeners.add(listener);
        settingsListeners.set(listenerKey, listeners);
        listener(getPluginStore(id)[key]);
        return () => listeners.delete(listener);
      },
    };
  }

  function registerPatch(descriptor) {
    patchDescriptors.push(descriptor);
    return descriptor;
  }

  function applyPatchDescriptors(source, descriptors = patchDescriptors) {
    let output = source;
    for (const descriptor of descriptors) {
      const moduleMatches =
        typeof descriptor.find === "string" ? output.includes(descriptor.find) : descriptor.find.test(output);
      if (!moduleMatches) continue;
      const replacements = Array.isArray(descriptor.replacement) ? descriptor.replacement : [descriptor.replacement];
      const beforeGroup = output;
      let appliedGroup = true;
      for (const replacement of replacements) {
        const before = output;
        output = output.replace(replacement.match, replacement.replace);
        if (before === output) appliedGroup = false;
      }
      if (descriptor.group && !appliedGroup) output = beforeGroup;
      if (!descriptor.all) break;
    }
    return output;
  }

  function registerCommand(command) {
    commands.set(safeId(command.id), command);
    return command;
  }

  function runCommand(id, ...args) {
    const command = commands.get(id);
    if (!command) throw new Error(`Unknown Codex Plus command: ${id}`);
    return command.run?.(...args);
  }

  function registerStyle(pluginId, cssText) {
    if (typeof document === "undefined") return null;
    const id = `codex-plus-style-${safeId(pluginId)}`;
    let element = styleElements.get(id) || document.getElementById(id);
    if (!element) {
      element = document.createElement("style");
      element.id = id;
      document.head?.appendChild(element);
    }
    element.textContent = cssText;
    styleElements.set(id, element);
    return element;
  }

  function setRootVars(vars) {
    if (typeof document === "undefined") return;
    for (const [key, value] of Object.entries(vars || {})) {
      if (value == null) document.documentElement.style.removeProperty(key);
      else document.documentElement.style.setProperty(key, value);
    }
  }

  function registerPlugin(definition) {
    const plugin = definePlugin(definition);
    plugins.set(plugin.id, plugin);
    if (plugin.settings) plugin.settingsStore = defineSettings(plugin.id, plugin.settings);
    for (const descriptor of plugin.patches || []) registerPatch({ ...descriptor, plugin: plugin.id });
    for (const command of plugin.commands || []) registerCommand({ ...command, plugin: plugin.id });
    if (plugin.styles) registerStyle(plugin.id, plugin.styles);
    if (plugin.required || plugin.enabledByDefault) startPlugin(plugin.id);
    return plugin;
  }

  function startPlugin(id) {
    const plugin = plugins.get(id);
    if (!plugin || startedPlugins.has(id)) return;
    plugin.start?.(CodexPlus);
    startedPlugins.add(id);
  }

  function stopPlugin(id) {
    const plugin = plugins.get(id);
    if (!plugin || !startedPlugins.has(id)) return;
    plugin.stop?.(CodexPlus);
    startedPlugins.delete(id);
  }

  const CodexPlus = {
    definePlugin,
    registerPlugin,
    startPlugin,
    stopPlugin,
    plugins,
    patches: { register: registerPatch, apply: applyPatchDescriptors, all: patchDescriptors },
    modules: { registerHostModule, findByCode, findByProps, findComponentByCode, waitFor },
    ui: {
      settings: { appearance: { rows: [], addRow(row) { this.rows.push(row); return row; } } },
      review: { wrappers: [], panels: [], wrapBody(wrapper) { this.wrappers.push(wrapper); return wrapper; }, addRepositoryPanel(panel) { this.panels.push(panel); return panel; } },
      sidebar: { projectDecorators: [], threadDecorators: [], decorateProjectRow(fn) { this.projectDecorators.push(fn); return fn; }, decorateThreadRow(fn) { this.threadDecorators.push(fn); return fn; } },
      message: { userBubbleDecorators: [], decorateUserBubble(fn) { this.userBubbleDecorators.push(fn); return fn; } },
      composer: { surfaceDecorators: [], decorateSurface(fn) { this.surfaceDecorators.push(fn); return fn; } },
      about: { buildInfo: [], addBuildInfo(fn) { this.buildInfo.push(fn); return fn; } },
      errors: { boundaryDecorators: [], decorateBoundary(fn) { this.boundaryDecorators.push(fn); return fn; } },
    },
    commands: { register: registerCommand, run: runCommand, all: commands },
    settings: { define: defineSettings },
    native: { async request(method, params) { return globalObject.CodexPlusHost?.nativeRequest?.(method, params); } },
    styles: { register: registerStyle, setRootVars },
  };

  globalObject.CodexPlus = CodexPlus;
  globalObject.CodexPlusHost ||= {};
  globalObject.CodexPlusHost.register = registerHostModule;

  const pluginFiles = [
    "plugins/aboutMetadata.js",
    "plugins/nestedRepositories.js",
    "plugins/diagnosticErrors.js",
    "plugins/userBubbleColors.js",
    "plugins/projectColors.js",
    "plugins/sidebarNameBlur.js",
  ];

  if (typeof document !== "undefined") {
    const base = new URL(".", document.currentScript?.src || globalObject.location?.href || "");
    for (const file of pluginFiles) {
      const script = document.createElement("script");
      script.src = new URL(file, base).href;
      script.async = false;
      script.defer = false;
      document.head?.appendChild(script);
    }
  }
})();
