function makePatchSet({ id, codexVersion, bundleVersion, asarSha256, assetFiles, patches, runtimeConfig }) {
  return {
    id,
    codexVersion,
    bundleVersion,
    asarSha256,
    assetFiles,
    patches,
    runtimeConfig,
  };
}

module.exports = {
  makePatchSet,
};
