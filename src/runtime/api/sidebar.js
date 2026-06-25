(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;
  const { applyDecorators, mergeDataAttributes } = globalObject.__CodexPlusRuntime;
  const sidebar = {
    projectDecorators: [],
    threadDecorators: [],
    decorateProjectRow(fn) {
      this.projectDecorators.push(fn);
      return fn;
    },
    decorateThreadRow(fn) {
      this.threadDecorators.push(fn);
      return fn;
    },
    mergeDataAttributes,
    projectRowProps(props) {
      return applyDecorators(props, this.projectDecorators);
    },
    threadRowProps(props) {
      return applyDecorators(props, this.threadDecorators);
    },
  };
  globalObject.CodexPlus.ui.sidebar = sidebar;
})();
