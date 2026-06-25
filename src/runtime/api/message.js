(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;
  const { applyDecorators } = globalObject.__CodexPlusRuntime;
  globalObject.CodexPlus.ui.message = {
    userBubbleDecorators: [],
    decorateUserBubble(fn) {
      this.userBubbleDecorators.push(fn);
      return fn;
    },
    userBubbleProps(props) {
      return applyDecorators(props, this.userBubbleDecorators);
    },
  };
})();
