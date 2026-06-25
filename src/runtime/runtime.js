(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;
  if (typeof document === "undefined") return;

  const base = new URL(".", document.currentScript?.src || globalObject.location?.href || "");
  const loadWithDocumentWrite = document.readyState === "loading" && typeof document.write === "function";

  function scriptUrl(file) {
    return new URL(file, base).href;
  }

  function loadScripts(files) {
    const diagnose = globalObject.CodexPlus?.diagnostics?.log;
    if (loadWithDocumentWrite) {
      diagnose?.("runtime.load", { mode: "document.write", count: files.length });
      for (const file of files) document.write(`<script src="${scriptUrl(file).replace(/"/g, "&quot;")}"><\/script>`);
      return;
    }
    diagnose?.("runtime.load", { mode: "appendChild", count: files.length });
    for (const file of files) {
      const script = document.createElement("script");
      script.src = scriptUrl(file);
      script.async = false;
      script.defer = false;
      document.head?.appendChild(script);
    }
  }

  globalObject.__CodexPlusLoadRuntimeFiles = loadScripts;

  if (loadWithDocumentWrite) {
    document.write(`<script src="${scriptUrl("runtime-manifest.js").replace(/"/g, "&quot;")}"><\/script>`);
  } else {
    loadScripts(["runtime-manifest.js"]);
  }
})();
