function diagnosticDetailsHook() {
  return "function CPXDiagnosticDetails(e){return window.CodexPlus?.ui?.errors?.renderDetails?.(e)??null}";
}

module.exports = {
  diagnosticDetailsHook,
};
