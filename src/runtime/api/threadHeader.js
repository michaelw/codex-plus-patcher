(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;

  function ThreadHeaderAccessoryHost({ accessory, context, deps }) {
    const rendered = accessory?.({ context, ...deps }) ?? null;
    globalObject.CodexPlus.diagnostics.log("threadHeader.accessoryHost.render", {
      accessoryName: accessory?.name || null,
      cwd: typeof context?.cwd === "string" ? context.cwd : null,
      rendered: rendered != null,
    });
    return rendered;
  }

  function ThreadHeaderAccessoriesHost({ context, deps }) {
    const jsx = deps?.jsx;
    deps?.useSyncExternalStore?.(
      globalObject.CodexPlusHost.adapters.threadHeader.subscribe,
      globalObject.CodexPlusHost.adapters.threadHeader.snapshot,
      globalObject.CodexPlusHost.adapters.threadHeader.snapshot,
    );
    const active = globalObject.CodexPlusHost.adapters.context.active();
    globalObject.CodexPlus.diagnostics.log("threadHeader.render", {
      accessoryCount: globalObject.CodexPlus.ui.threadHeader.accessories.length,
      cwd: typeof active?.cwd === "string" ? active.cwd : null,
      hostId: active?.hostId ?? null,
      header: active?.header ?? null,
    });
    const rendered = globalObject.CodexPlus.ui.threadHeader.accessories.map((accessory, index) =>
      jsx(ThreadHeaderAccessoryHost, { accessory, context: active, deps }, `thread-header-accessory:${index}`),
    );
    return rendered.length === 0 ? null : rendered;
  }

  function renderAccessories({ context, deps } = {}) {
    const jsx = deps?.jsx;
    if (typeof jsx !== "function") {
      globalObject.CodexPlus.diagnostics.log("threadHeader.render.skip", { reason: "missing-jsx" });
      return null;
    }
    return jsx(ThreadHeaderAccessoriesHost, { context, deps });
  }

  globalObject.CodexPlus.ui.threadHeader = {
    accessories: [],
    addAccessory(fn) {
      this.accessories.push(fn);
      globalObject.CodexPlusHost.adapters.threadHeader.notify();
      globalObject.CodexPlus.diagnostics.log("threadHeader.addAccessory", { accessoryName: fn?.name || null, accessoryCount: this.accessories.length });
      return fn;
    },
    renderAccessories,
  };
})();
