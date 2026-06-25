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

  function renderAccessories({ context, deps } = {}) {
    const jsx = deps?.jsx;
    if (typeof jsx !== "function") {
      globalObject.CodexPlus.diagnostics.log("threadHeader.render.skip", { reason: "missing-jsx" });
      return null;
    }
    globalObject.CodexPlus.diagnostics.log("threadHeader.render", {
      accessoryCount: globalObject.CodexPlus.ui.threadHeader.accessories.length,
      cwd: typeof context?.cwd === "string" ? context.cwd : null,
      hostId: context?.hostId ?? null,
      header: context?.header ?? null,
    });
    const rendered = globalObject.CodexPlus.ui.threadHeader.accessories.map((accessory, index) =>
      jsx(ThreadHeaderAccessoryHost, { accessory, context, deps }, `thread-header-accessory:${index}`),
    );
    return rendered.length === 0 ? null : rendered;
  }

  globalObject.CodexPlus.ui.threadHeader = {
    accessories: [],
    addAccessory(fn) {
      this.accessories.push(fn);
      globalObject.CodexPlus.diagnostics.log("threadHeader.addAccessory", { accessoryName: fn?.name || null, accessoryCount: this.accessories.length });
      return fn;
    },
    renderAccessories,
  };
})();
