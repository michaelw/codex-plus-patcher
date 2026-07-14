(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;
  let fileOpener = null;
  let mountAccessor = null;

  function bindOpenFile(opener) {
    if (typeof opener !== "function") throw new Error("Thread side panel file opener must be a function");
    fileOpener = opener;
    return opener;
  }

  function bindMount(accessor) {
    if (typeof accessor !== "function") throw new Error("Thread side panel mount accessor must be a function");
    mountAccessor = accessor;
    return accessor;
  }

  function openFile(filePath, options) {
    if (fileOpener == null) throw new Error("Thread side panel file opener was not bound by the host bootstrap");
    return fileOpener(filePath, options);
  }

  function mount() {
    if (mountAccessor == null) throw new Error("Thread side panel mount was not bound by the host bootstrap");
    const value = mountAccessor();
    if (value == null || typeof value !== "object") throw new Error("Thread side panel mount is incomplete");
    return value;
  }

  function bindingStatus() {
    return { mount: mountAccessor != null, openFile: fileOpener != null };
  }

  globalObject.CodexPlusHost.adapters.threadSidePanel = { bindMount, bindOpenFile, bindingStatus, mount, openFile };
})();
