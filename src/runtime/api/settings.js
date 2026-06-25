(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;
  const { core, safeId } = globalObject.__CodexPlusRuntime;

  function getPluginStore(pluginId) {
    const key = `${core.storagePrefix}${pluginId}`;
    try {
      return JSON.parse(globalObject.localStorage?.getItem(key) || "{}") || {};
    } catch {
      return {};
    }
  }

  function writePluginStore(pluginId, store) {
    const key = `${core.storagePrefix}${pluginId}`;
    globalObject.localStorage?.setItem(key, JSON.stringify(store));
  }

  function emitSetting(pluginId, key, value) {
    const listenerKey = `${pluginId}:${key}`;
    for (const listener of core.settingsListeners.get(listenerKey) || []) listener(value);
  }

  function define(pluginId, definitions) {
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
        const listeners = core.settingsListeners.get(listenerKey) || new Set();
        listeners.add(listener);
        core.settingsListeners.set(listenerKey, listeners);
        listener(getPluginStore(id)[key]);
        return () => listeners.delete(listener);
      },
    };
  }

  function AppearanceRowHost({ row, deps, variant }) {
    return row.render?.({ ...deps, variant, row }) ?? null;
  }

  const appearance = {
    rows: [],
    addRow(row) {
      this.rows.push(row);
      return row;
    },
    renderRows({ deps, variant, section = "appearance" } = {}) {
      const jsx = deps?.jsx;
      if (typeof jsx !== "function") return [];
      return this.rows
        .filter((row) => (row.section || "appearance") === section)
        .slice()
        .sort((left, right) => (left.order || 0) - (right.order || 0))
        .map((row) => jsx(AppearanceRowHost, { row, deps, variant }, row.id));
    },
  };

  globalObject.CodexPlus.ui.settings = { appearance };
  globalObject.CodexPlus.settings = { define };
})();
