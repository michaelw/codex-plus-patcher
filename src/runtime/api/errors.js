(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;

  function renderDetails({ jsx, error, componentStack } = {}) {
    for (const decorator of globalObject.CodexPlus.ui.errors.boundaryDecorators) {
      const detail = decorator({ jsx, error, componentStack });
      if (detail != null) return detail;
    }
    return null;
  }

  globalObject.CodexPlus.ui.errors = {
    boundaryDecorators: [],
    decorateBoundary(fn) {
      this.boundaryDecorators.push(fn);
      return fn;
    },
    renderDetails,
  };
})();
