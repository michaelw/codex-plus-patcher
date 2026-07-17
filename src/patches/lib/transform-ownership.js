const TRANSFORM_VARIANT_OWNERS = Object.freeze({
  "chatgpt-26.715.21425": Object.freeze([
    "chatgpt-26.715.21425-5488",
  ]),
  "chatgpt-26.715": Object.freeze([
    "chatgpt-26.715.21316-5484",
    "chatgpt-26.715.21425-5488",
  ]),
});

function patchSetOwnsTransformVariant(patchSetId, variantId) {
  const owners = TRANSFORM_VARIANT_OWNERS[variantId];
  if (!owners) throw new Error(`Unknown transform variant ${variantId}`);
  return owners.includes(patchSetId);
}

module.exports = {
  TRANSFORM_VARIANT_OWNERS,
  patchSetOwnsTransformVariant,
};
