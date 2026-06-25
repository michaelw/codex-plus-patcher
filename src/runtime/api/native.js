(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;

  async function request(method, params) {
    return globalObject.codexPlusNative?.request?.(method, params) ?? globalObject.CodexPlusHost?.nativeRequest?.(method, params);
  }

  function registerNativeMenuItem(item) {
    return globalObject.CodexPlus.native.request("native-menu/register-item", item).catch(() => ({ ok: false }));
  }

  globalObject.CodexPlus.native = { request };
  globalObject.CodexPlus.nativeMenus = { registerItem: registerNativeMenuItem };
})();
