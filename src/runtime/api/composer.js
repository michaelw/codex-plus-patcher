(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;
  const { applyDecorators } = globalObject.__CodexPlusRuntime;
  globalObject.CodexPlus.ui.composer = {
    surfaceDecorators: [],
    decorateSurface(fn) {
      this.surfaceDecorators.push(fn);
      return fn;
    },
    surfaceProps(props) {
      return applyDecorators(props, this.surfaceDecorators);
    },
  };
})();
