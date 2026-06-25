function nativeMainHook() {
  return 'let CPXNative=require("./codex-plus-native-main.js").create({electron:a});';
}

module.exports = {
  nativeMainHook,
};
