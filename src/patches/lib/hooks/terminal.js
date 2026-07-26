function terminalUnicode11Hook(terminalExpression) {
  return `window.CodexPlusHost.adapters.terminal.configureUnicode11(${terminalExpression})`;
}

module.exports = {
  terminalUnicode11Hook,
};
