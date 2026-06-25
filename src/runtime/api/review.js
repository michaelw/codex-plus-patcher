(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;

  function renderBody({ props, deps, defaultBody } = {}) {
    let body = defaultBody;
    for (const wrapper of globalObject.CodexPlus.ui.review.wrappers) {
      body = wrapper({ ...props, mainReviewContent: body }, deps);
    }
    return body;
  }

  globalObject.CodexPlus.ui.review = {
    wrappers: [],
    wrapBody(wrapper) {
      this.wrappers.push(wrapper);
      return wrapper;
    },
    renderBody,
  };
})();
