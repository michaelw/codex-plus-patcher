const { replaceAllOnce } = require("./replace");

function exactReplacement(oldText, newText, label) {
  return [oldText, newText, label];
}

function prependAtAnchor(anchor, helper, label) {
  return exactReplacement(anchor, `${helper}${anchor}`, label);
}

function appendImport(anchorImport, newImport, label) {
  return exactReplacement(anchorImport, `${anchorImport}${newImport}`, label);
}

function applyExactReplacements(text, descriptors) {
  return replaceAllOnce(text, descriptors);
}

module.exports = {
  appendImport,
  applyExactReplacements,
  exactReplacement,
  prependAtAnchor,
};
