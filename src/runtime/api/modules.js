(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;
  const { core } = globalObject.__CodexPlusRuntime;

  function notifyWaiters(name, value) {
    for (let index = core.waiters.length - 1; index >= 0; index -= 1) {
      const waiter = core.waiters[index];
      if (!waiter.filter(value, name)) continue;
      core.waiters.splice(index, 1);
      waiter.resolve(value);
    }
  }

  function registerHostModule(name, value) {
    core.hostModules.set(name, value);
    notifyWaiters(name, value);
    return value;
  }

  function moduleValues() {
    return Array.from(core.hostModules.values());
  }

  function findByProps(...props) {
    return moduleValues().find((value) => value && props.every((prop) => prop in value));
  }

  function findByCode(text) {
    return moduleValues().find((value) => {
      try {
        return String(value).includes(text);
      } catch {
        return false;
      }
    });
  }

  function findComponentByCode(text) {
    return moduleValues().find((value) => {
      try {
        return typeof value === "function" && String(value).includes(text);
      } catch {
        return false;
      }
    });
  }

  function waitFor(filter) {
    for (const [name, value] of core.hostModules) {
      if (filter(value, name)) return Promise.resolve(value);
    }
    return new Promise((resolve) => core.waiters.push({ filter, resolve }));
  }

  globalObject.CodexPlus.modules = { registerHostModule, findByCode, findByProps, findComponentByCode, waitFor };
  globalObject.CodexPlusHost.register = registerHostModule;
})();
