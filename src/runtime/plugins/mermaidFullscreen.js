(function () {
  const CodexPlus = window.CodexPlus;
  const SELECTOR = "[data-codex-plus-mermaid-diagram]";
  const BUTTON_CLASS = "codex-plus-mermaid-expand-button";

  function sourceFor(container) {
    return container.querySelector("pre.sr-only")?.textContent ||
      container.parentElement?.querySelector(":scope > pre.sr-only")?.textContent ||
      "";
  }

  function hostFor(container) {
    return container.closest('[data-markdown-copy="code-block"]') || container;
  }

  function assetUrl(assetPath) {
    const appScript = document.querySelector('script[type="module"][src*="/assets/"],script[type="module"][src^="./assets/"]');
    if (appScript?.src) return new URL(assetPath, new URL(".", appScript.src)).href;
    return new URL(`assets/${assetPath}`, document.baseURI).href;
  }

  function mermaidCoreAsset() {
    return CodexPlus.config?.mermaidCoreAsset || "mermaid.core.js";
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[char]);
  }

  function mermaidLiveUrl(source) {
    const state = JSON.stringify({
      code: source,
      mermaid: { theme: "default" },
      updateEditor: false,
    });
    return `https://mermaid.live/edit#base64:${btoa(unescape(encodeURIComponent(state))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
  }

  function viewerHtml({ source, isDark, mermaidModuleUrl, debug }) {
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Mermaid diagram viewer</title>
<style>
:root{color-scheme:${isDark ? "dark" : "light"};--viewer-bg:${isDark ? "#0a0a0a" : "#fff"};--viewer-fg:${isDark ? "#fff" : "#111"};--viewer-toolbar-bg:${isDark ? "#252525" : "#f7f7f7"};--viewer-border:${isDark ? "rgba(255,255,255,.18)" : "rgba(0,0,0,.16)"};--viewer-button-border:${isDark ? "rgba(255,255,255,.22)" : "rgba(0,0,0,.18)"};--viewer-button-bg:${isDark ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.06)"};--viewer-muted:${isDark ? "#cfcfcf" : "#333"}}
:root[data-theme="dark"]{color-scheme:dark;--viewer-bg:#0a0a0a;--viewer-fg:#fff;--viewer-toolbar-bg:#252525;--viewer-border:rgba(255,255,255,.18);--viewer-button-border:rgba(255,255,255,.22);--viewer-button-bg:rgba(255,255,255,.08);--viewer-muted:#cfcfcf}
:root[data-theme="light"]{color-scheme:light;--viewer-bg:#fff;--viewer-fg:#111;--viewer-toolbar-bg:#f7f7f7;--viewer-border:rgba(0,0,0,.16);--viewer-button-border:rgba(0,0,0,.18);--viewer-button-bg:rgba(0,0,0,.06);--viewer-muted:#333}
*{box-sizing:border-box}
html,body{height:100%;margin:0}
body{display:flex;flex-direction:column;background:var(--viewer-bg);color:var(--viewer-fg);font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.toolbar{display:flex;gap:8px;justify-content:flex-end;padding:10px;border-bottom:1px solid var(--viewer-border);background:var(--viewer-toolbar-bg)}
button{min-width:42px;border:1px solid var(--viewer-button-border);border-radius:6px;background:var(--viewer-button-bg);color:inherit;padding:6px 10px}
button:focus-visible{outline:2px solid #60a5fa;outline-offset:2px}
.viewport{flex:1;overflow:auto;padding:16px}
.stage{width:max-content;min-width:100%}
.stage svg{display:block;max-width:none;background:var(--viewer-bg)}
.render-status{position:fixed;left:12px;bottom:10px;z-index:10;color:var(--viewer-muted);font-size:12px}
.render-status[hidden]{display:none}
</style>
</head>
<body>
<div class="toolbar">
  <button id="zoom-fit" type="button" aria-label="Zoom to fit">Fit</button>
  <button id="zoom-width" type="button" aria-label="Zoom to width">Width</button>
  <button id="zoom-height" type="button" aria-label="Zoom to height">Height</button>
  <button id="zoom-out" type="button" aria-label="Zoom out">-</button>
  <button id="zoom-reset" type="button" aria-label="Reset zoom">100%</button>
  <button id="zoom-in" type="button" aria-label="Zoom in">+</button>
  <button id="theme-toggle" type="button" aria-label="Toggle Mermaid theme">${isDark ? "Dark" : "Light"}</button>
  <button id="open-live" type="button" aria-label="Open in Mermaid Live">Live</button>
  <button id="close" type="button" aria-label="Close Mermaid diagram viewer">Close</button>
</div>
<div class="viewport"><div class="stage" id="stage"></div></div>
<div class="render-status" id="render-status" hidden>Rendering Mermaid source...</div>
<script type="module">
let scale = 1;
let darkTheme = ${isDark ? "true" : "false"};
const source = ${JSON.stringify(source)};
const mermaidModuleUrl = ${JSON.stringify(mermaidModuleUrl)};
const liveUrl = ${JSON.stringify(mermaidLiveUrl(source))};
const debug = ${debug ? "true" : "false"} || localStorage.getItem("codexPlusMermaidDebug") === "1";
const stage = document.getElementById("stage");
const viewport = document.querySelector(".viewport");
const reset = document.getElementById("zoom-reset");
const themeToggle = document.getElementById("theme-toggle");
const renderStatus = document.getElementById("render-status");
let fitMode = "fit";
let renderCount = 0;
let renderInFlight = false;
let renderQueued = false;
function diagram() {
  return stage.querySelector("svg");
}
function baseSize() {
  const svg = diagram();
  const viewBox = svg?.viewBox?.baseVal;
  if (viewBox && viewBox.width > 0 && viewBox.height > 0) return { width: viewBox.width, height: viewBox.height };
  const rect = svg?.getBoundingClientRect();
  return { width: rect?.width || 800, height: rect?.height || 600 };
}
let base = { width: 800, height: 600 };
function setScale(next, mode = null) {
  fitMode = mode;
  scale = Math.max(0.05, Math.min(8, next));
  const svg = diagram();
  if (svg) {
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.style.width = Math.round(base.width * scale) + "px";
    svg.style.height = Math.round(base.height * scale) + "px";
  }
  reset.textContent = Math.round(scale * 100) + "%";
}
function fitScale(mode) {
  const width = Math.max(1, viewport.clientWidth - 32);
  const height = Math.max(1, viewport.clientHeight - 32);
  const byWidth = width / base.width;
  const byHeight = height / base.height;
  if (mode === "width") return byWidth;
  if (mode === "height") return byHeight;
  return Math.min(byWidth, byHeight);
}
function applyFit(mode) {
  setScale(fitScale(mode), mode);
}
function applyThemeChrome() {
  document.documentElement.dataset.theme = darkTheme ? "dark" : "light";
  document.documentElement.style.colorScheme = darkTheme ? "dark" : "light";
  themeToggle.textContent = darkTheme ? "Dark" : "Light";
  themeToggle.setAttribute("aria-pressed", String(darkTheme));
}
function themeDirective() {
  return "%%{init: " + JSON.stringify({ theme: darkTheme ? "dark" : "default" }) + "}%%" + String.fromCharCode(10);
}
function sourceForTheme() {
  const trimmed = source.trimStart();
  if (!trimmed.startsWith("%%{")) return themeDirective() + source;
  const markerEnd = trimmed.indexOf("}%%");
  if (markerEnd < 0) return themeDirective() + source;
  const directive = trimmed.slice(0, markerEnd + 3).toLowerCase();
  if (!directive.startsWith("%%{init:") && !directive.startsWith("%%{initialize:")) return themeDirective() + source;
  let rest = trimmed.slice(markerEnd + 3);
  while ([9, 10, 13, 32].includes(rest.charCodeAt(0))) rest = rest.slice(1);
  return themeDirective() + rest;
}
async function renderFromSource() {
  if (renderInFlight) {
    renderQueued = true;
    return;
  }
  renderInFlight = true;
  renderStatus.hidden = !debug;
  renderStatus.textContent = "Rendering Mermaid source...";
  themeToggle.disabled = true;
  try {
    const mermaid = (await import(mermaidModuleUrl)).default;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      deterministicIds: true,
      deterministicIDSeed: "codex-plus-mermaid-viewer",
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      darkMode: darkTheme,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      theme: darkTheme ? "dark" : "default",
    });
    applyThemeChrome();
    const rendered = await mermaid.render("codex-plus-mermaid-viewer-" + String(renderCount += 1), sourceForTheme());
    stage.innerHTML = rendered.svg;
    renderStatus.textContent = "Rendered from Mermaid source";
    base = baseSize();
    applyFit(fitMode || "fit");
  } finally {
    renderInFlight = false;
    themeToggle.disabled = false;
    if (renderQueued) {
      renderQueued = false;
      renderFromSource();
    }
  }
}
document.getElementById("zoom-fit").addEventListener("click", () => applyFit("fit"));
document.getElementById("zoom-width").addEventListener("click", () => applyFit("width"));
document.getElementById("zoom-height").addEventListener("click", () => applyFit("height"));
document.getElementById("zoom-out").addEventListener("click", () => setScale(scale - 0.2));
reset.addEventListener("click", () => setScale(1));
document.getElementById("zoom-in").addEventListener("click", () => setScale(scale + 0.2));
themeToggle.addEventListener("click", () => { darkTheme = !darkTheme; applyThemeChrome(); renderQueued = true; renderFromSource(); });
document.getElementById("open-live").addEventListener("click", () => window.open(liveUrl, "_blank", "noopener"));
document.getElementById("close").addEventListener("click", () => window.close());
window.addEventListener("resize", () => { if (fitMode) applyFit(fitMode); });
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") window.close();
  if ((event.metaKey || event.ctrlKey) && event.key === "=") { event.preventDefault(); setScale(scale + 0.2); }
  if ((event.metaKey || event.ctrlKey) && event.key === "-") { event.preventDefault(); setScale(scale - 0.2); }
  if ((event.metaKey || event.ctrlKey) && event.key === "0") { event.preventDefault(); setScale(1); }
});
applyThemeChrome();
renderFromSource().catch((error) => {
  renderStatus.hidden = false;
  renderStatus.textContent = "Mermaid render failed: " + String(error?.message || error);
  console.error("[Codex Plus] Mermaid source render failed", error);
});
</script>
</body>
</html>`;
  }

  function button(label) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = BUTTON_CLASS;
    element.setAttribute("aria-label", label);
    element.title = label;
    return element;
  }

  function openViewer(container) {
    const source = sourceFor(container);
    const isDark = document.documentElement.classList.contains("dark") || document.documentElement.classList.contains("electron-dark");
    const debug = localStorage.getItem("codexPlusMermaidDebug") === "1";
    const html = source
      ? viewerHtml({ source, isDark, mermaidModuleUrl: assetUrl(mermaidCoreAsset()), debug })
      : `<!doctype html><meta charset="utf-8"><body>${escapeHtml("No Mermaid source was found.")}</body>`;
    CodexPlus.native.request("mermaid/openViewer", { html }).catch(() => {});
  }

  function decorate(container) {
    const host = hostFor(container);
    if (host.querySelector(`:scope > .${BUTTON_CLASS}`)) return;
    host.setAttribute("data-codex-plus-mermaid-host", "");
    host.style.position ||= "relative";
    const control = button("Open Mermaid diagram fullscreen");
    control.addEventListener("click", () => openViewer(host));
    host.prepend(control);
  }

  function decorateAll(root = document) {
    for (const container of root.querySelectorAll(SELECTOR)) decorate(container);
  }

  CodexPlus.registerPlugin(
    CodexPlus.definePlugin({
      id: "mermaidFullscreen",
      name: "Mermaid Fullscreen Viewer",
      description: "Adds a separate fullscreen viewer with zoom controls to rendered Mermaid diagrams.",
      required: true,
      styles:
        `[data-codex-plus-mermaid-host]{position:relative}` +
        `[data-codex-plus-mermaid-diagram]{position:relative}` +
        `.${BUTTON_CLASS}{position:absolute;left:.5rem;top:.5rem;z-index:30;display:inline-flex;width:1.75rem;height:1.75rem;align-items:center;justify-content:center;border:1px solid var(--color-token-input-border,rgba(127,127,127,.35));border-radius:.375rem;background:var(--color-background-elevated-primary,#fff);color:var(--color-token-foreground,#111);box-shadow:0 2px 8px rgba(0,0,0,.12);opacity:.82}` +
        `.${BUTTON_CLASS}::before,.${BUTTON_CLASS}::after{content:"";position:absolute;width:.42rem;height:.42rem;border-color:currentColor;border-style:solid}` +
        `.${BUTTON_CLASS}::before{right:.42rem;top:.42rem;border-width:2px 2px 0 0}` +
        `.${BUTTON_CLASS}::after{left:.42rem;bottom:.42rem;border-width:0 0 2px 2px}` +
        `.${BUTTON_CLASS}:hover,.${BUTTON_CLASS}:focus-visible{opacity:1;outline:2px solid var(--color-token-focus-border,#3b82f6);outline-offset:2px}` +
        `:root.dark .${BUTTON_CLASS},:root.electron-dark .${BUTTON_CLASS}{background:var(--color-background-elevated-primary,#111);color:var(--color-token-foreground,#fff);box-shadow:0 2px 10px rgba(0,0,0,.45)}`,
      exports: { decorateAll, openViewer },
      start(api) {
        api.ui.mermaid.decorateDiagram(() => ({ "data-codex-plus-mermaid-diagram": "" }));
        const install = () => {
          if (!document.body) return;
          decorateAll();
          const observer = new MutationObserver((records) => {
            for (const record of records) {
              for (const node of record.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) continue;
                if (node.matches?.(SELECTOR)) decorate(node);
                decorateAll(node);
              }
            }
          });
          observer.observe(document.body, { childList: true, subtree: true });
        };
        if (document.body) install();
        else document.addEventListener("DOMContentLoaded", install, { once: true });
      },
    }),
  );
})();
