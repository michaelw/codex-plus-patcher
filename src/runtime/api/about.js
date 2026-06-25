(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;
  const { ui } = globalObject.CodexPlus;

  const buildInfo = [];

  function addBuildInfo(fn) {
    buildInfo.push(fn);
    return fn;
  }

  ui.about = {
    addBuildInfo,
    buildInfo,
  };
})();
