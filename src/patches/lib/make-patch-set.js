function makePatchSet({ id, codexVersion, bundleVersion, asarSha256, assetFiles, patches }) {
  return {
    id,
    codexVersion,
    bundleVersion,
    asarSha256,
    assetFiles,
    patches,
  };
}

module.exports = {
  makePatchSet,
};
