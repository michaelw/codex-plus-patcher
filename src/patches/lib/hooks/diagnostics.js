function diagnosticDetailsHook() {
  return "var CPXDiagnosticDetails=function(e){return window.CodexPlus?.ui?.errors?.renderDetails?.(e)??null};";
}

module.exports = {
  diagnosticDetailsHook,
};
