(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;
  const { applyDecorators } = globalObject.__CodexPlusRuntime;
  globalObject.CodexPlus.ui.mermaid = {
    diagramDecorators: [],
    decorateDiagram(fn) {
      this.diagramDecorators.push(fn);
      return fn;
    },
    diagramProps(props) {
      return applyDecorators(props, this.diagramDecorators);
    },
  };
})();
