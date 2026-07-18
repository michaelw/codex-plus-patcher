function makePatchSet({ id, codexVersion, bundleVersion, asarSha256, sourceFamily, assetFiles, patches, runtimeConfig }) {
  const patchSet = {
    id,
    codexVersion,
    bundleVersion,
    asarSha256,
    sourceFamily,
    patches,
    runtimeConfig,
  };
  if (typeof assetFiles !== "function") patchSet.assetFiles = assetFiles;
  else {
    let resolvedAssetFiles;
    Object.defineProperty(patchSet, "assetFiles", {
      enumerable: true,
      get() {
        resolvedAssetFiles ??= assetFiles();
        return resolvedAssetFiles;
      },
    });
  }
  return patchSet;
}

module.exports = {
  makePatchSet,
};
