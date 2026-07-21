const TRANSFORM_VARIANT_OWNERS = Object.freeze({
  "chatgpt-26.715.52143": Object.freeze([
    "chatgpt-26.715.52143-5591",
  ]),
  "chatgpt-26.715.31925": Object.freeze([
    "chatgpt-26.715.31925-5551",
  ]),
  "chatgpt-26.715.31251": Object.freeze([
    "chatgpt-26.715.31251-5538",
  ]),
  "chatgpt-26.715.21425": Object.freeze([
    "chatgpt-26.715.21425-5488",
  ]),
  "chatgpt-26.715": Object.freeze([
    "chatgpt-26.715.21316-5484",
    "chatgpt-26.715.21425-5488",
  ]),
});

const TRANSFORM_VARIANT_IMPLEMENTATION_USERS = Object.freeze({
  "chatgpt-26.715.31925": Object.freeze([
    "chatgpt-26.715.52143-5591",
  ]),
  "chatgpt-26.715.31251": Object.freeze([
    "chatgpt-26.715.31925-5551",
    "chatgpt-26.715.52143-5591",
  ]),
  "chatgpt-26.715.21425": Object.freeze([
    "chatgpt-26.715.31251-5538",
    "chatgpt-26.715.31925-5551",
    "chatgpt-26.715.52143-5591",
  ]),
  "chatgpt-26.715": Object.freeze([
    "chatgpt-26.715.31251-5538",
    "chatgpt-26.715.31925-5551",
    "chatgpt-26.715.52143-5591",
  ]),
});

function patchSetOwnsTransformVariant(patchSetId, variantId) {
  const owners = TRANSFORM_VARIANT_OWNERS[variantId];
  if (!owners) throw new Error(`Unknown transform variant ${variantId}`);
  return owners.includes(patchSetId);
}

function patchSetUsesTransformVariant(patchSetId, variantId) {
  if (patchSetOwnsTransformVariant(patchSetId, variantId)) return true;
  return TRANSFORM_VARIANT_IMPLEMENTATION_USERS[variantId]?.includes(patchSetId) || false;
}

module.exports = {
  TRANSFORM_VARIANT_IMPLEMENTATION_USERS,
  TRANSFORM_VARIANT_OWNERS,
  patchSetOwnsTransformVariant,
  patchSetUsesTransformVariant,
};
