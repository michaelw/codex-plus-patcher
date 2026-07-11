function nativeMainHook({ electronName = "a" } = {}) {
  return `let CPXNative=require("./codex-plus-native-main.js").create({electron:${electronName}});`;
}

module.exports = {
  nativeMainHook,
};
