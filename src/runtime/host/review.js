(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;
  let boundDeps = null;

  function required(name) {
    const value = boundDeps?.[name];
    if (typeof value !== "function") throw new Error(`Review adapter is missing host dependency: ${name}`);
    return value;
  }

  function renderBodyFromHost(props, hostDeps) {
    const [
      jsxRuntime,
      React,
      useStore,
      useAtom,
      routeAtom,
      cwdAtom,
      hostIdAtom,
      hostConfigAtom,
      conversationIdAtom,
      gitRequest,
      pathValue,
      DefaultReview,
      Button,
      Tooltip,
      Icon,
      Dropdown,
      DropdownMenu,
      BranchPickerDropdownContent,
      ,
      parseDiff,
      DiffCard,
    ] = hostDeps;
    const deps = {
      jsx: jsxRuntime.jsx,
      jsxs: jsxRuntime.jsxs,
      Fragment: jsxRuntime.Fragment,
      createElement: React.createElement,
      React,
      useStore,
      useAtom,
      routeAtom,
      cwdAtom,
      hostIdAtom,
      hostConfigAtom,
      conversationIdAtom,
      gitRequest,
      pathValue,
      DefaultReview,
      Button,
      Tooltip,
      Icon,
      Dropdown,
      DropdownMenu,
      BranchPickerDropdownContent,
      parseDiff,
      DiffCard,
    };
    boundDeps = deps;
    for (const name of ["gitRequest", "pathValue", "parseDiff", "DiffCard"]) required(name);
    const { mainReviewContent: hostBody, ...pluginProps } = props;
    return globalObject.CodexPlus.ui.review.renderBody({
      props: { ...pluginProps, hostBody },
      deps,
      defaultBody: hostBody,
    });
  }

  function context() {
    return globalObject.CodexPlusHost.adapters.context.active();
  }

  function gitRequest(...args) {
    return required("gitRequest")(...args);
  }

  function pathValue(...args) {
    return required("pathValue")(...args);
  }

  function renderDiff(props) {
    return required("createElement")(required("DiffCard"), props);
  }

  globalObject.CodexPlusHost.adapters.review = { context, gitRequest, pathValue, renderBodyFromHost, renderDiff };
})();
