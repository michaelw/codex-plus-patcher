function mermaidDiagramHook() {
  return "function CPXMermaidDiagramProps(e){return window.CodexPlus?.ui?.mermaid?.diagramProps?.(e)}";
}

module.exports = {
  mermaidDiagramHook,
};
