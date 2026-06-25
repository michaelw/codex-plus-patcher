(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;
  const { core } = globalObject.__CodexPlusRuntime;

  function diagnosticsEnabled() {
    try {
      return globalObject.localStorage?.getItem("codex-plus:diagnostics") === "1";
    } catch {
      return false;
    }
  }

  function log(event, details = {}) {
    const entry = { event, details, time: new Date().toISOString() };
    core.diagnosticEvents.push(entry);
    if (core.diagnosticEvents.length > 200) core.diagnosticEvents.shift();
    if (diagnosticsEnabled()) {
      try {
        console.info("[Codex Plus]", event, details);
      } catch {}
    }
    return entry;
  }

  const diagnostics = {
    log,
    snapshot() {
      return core.diagnosticEvents.slice();
    },
    clear() {
      core.diagnosticEvents.splice(0, core.diagnosticEvents.length);
    },
    enabled: diagnosticsEnabled,
  };

  globalObject.CodexPlus.diagnostics = diagnostics;
  globalObject.CodexPlusDiagnostics = diagnostics;
})();
