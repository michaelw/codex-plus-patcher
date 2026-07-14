(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;

  async function request(method, params) {
    return globalObject.CodexPlusHost.adapters.native.request(method, params);
  }

  function registerNativeMenuItem(item) {
    return globalObject.CodexPlusHost.adapters.native.request("native-menu/register-item", item);
  }

  globalObject.CodexPlus.native = { request };
  globalObject.CodexPlus.nativeMenus = { registerItem: registerNativeMenuItem };
})();
