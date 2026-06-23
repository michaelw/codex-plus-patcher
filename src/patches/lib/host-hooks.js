function pluginExportBridge(pluginId, exportName) {
  return "window.CodexPlus?.plugins?.get(`" + pluginId + "`)?.exports?." + exportName;
}

function pluginExportsBridge(pluginId) {
  return "window.CodexPlus?.plugins?.get(`" + pluginId + "`)?.exports";
}

module.exports = {
  pluginExportBridge,
  pluginExportsBridge,
};
