(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;

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
      ReviewToolbar,
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
      ReviewToolbar,
      parseDiff,
      DiffCard,
    };
    return globalObject.CodexPlus.ui.review.renderBody({
      props,
      deps,
      defaultBody: props.mainReviewContent ?? deps.jsx(DefaultReview, props),
    });
  }

  globalObject.CodexPlusHost.adapters.review = { renderBodyFromHost };
})();
