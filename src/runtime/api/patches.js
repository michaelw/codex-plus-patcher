(function () {
  const globalObject = typeof window !== "undefined" ? window : globalThis;
  const { core } = globalObject.__CodexPlusRuntime;

  function register(descriptor) {
    core.patchDescriptors.push(descriptor);
    return descriptor;
  }

  function apply(source, descriptors = core.patchDescriptors) {
    let output = source;
    for (const descriptor of descriptors) {
      const moduleMatches =
        typeof descriptor.find === "string" ? output.includes(descriptor.find) : descriptor.find.test(output);
      if (!moduleMatches) continue;
      const replacements = Array.isArray(descriptor.replacement) ? descriptor.replacement : [descriptor.replacement];
      const beforeGroup = output;
      let appliedGroup = true;
      for (const replacement of replacements) {
        const before = output;
        output = output.replace(replacement.match, replacement.replace);
        if (before === output) appliedGroup = false;
      }
      if (descriptor.group && !appliedGroup) output = beforeGroup;
      if (!descriptor.all) break;
    }
    return output;
  }

  globalObject.CodexPlus.patches = { register, apply, all: core.patchDescriptors };
})();
