function makePatchSet({ id, codexVersion, bundleVersion, asarSha256, sourceFamily, assetFiles, patches, runtimeConfig }) {
  return {
    id,
    codexVersion,
    bundleVersion,
    asarSha256,
    sourceFamily,
    assetFiles,
    patches,
    runtimeConfig,
  };
}

module.exports = {
  makePatchSet,
};
