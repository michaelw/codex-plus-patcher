(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;
  const { core, safeId } = globalObject.__CodexPlusRuntime;

  function register(pluginId, cssText) {
    if (typeof document === "undefined") return null;
    const id = `codex-plus-style-${safeId(pluginId)}`;
    let element = core.styleElements.get(id) || document.getElementById(id);
    if (!element) {
      element = document.createElement("style");
      element.id = id;
      document.head?.appendChild(element);
    }
    element.textContent = cssText;
    core.styleElements.set(id, element);
    return element;
  }

  function setRootVars(vars) {
    if (typeof document === "undefined") return;
    for (const [key, value] of Object.entries(vars || {})) {
      if (value == null) document.documentElement.style.removeProperty(key);
      else document.documentElement.style.setProperty(key, value);
    }
  }

  globalObject.CodexPlus.styles = { register, setRootVars };
})();
