const fs = require("node:fs");
const path = require("node:path");

const { readAsar, sha256, walkFiles } = require("./asar");

const COMPOSER_CODE_TOOLBAR_MARKER = "data-composer-code-block-toolbar";
const COMPOSER_CODE_TOOLBAR_INTRODUCTION = {
  sourceFamily: "chatgpt",
  codexVersion: "26.730.61309",
  bundleVersion: "6223",
  patchSet: "chatgpt-26.730.61309-6223",
};

function compareNumericVersion(left, right) {
  const leftParts = String(left || "").split(".").map((part) => Number(part));
  const rightParts = String(right || "").split(".").map((part) => Number(part));
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function capabilityRequired(identity, introduction) {
  if (identity.sourceFamily !== introduction.sourceFamily) return false;
  const versionDifference = compareNumericVersion(identity.version, introduction.codexVersion);
  if (versionDifference !== 0) return versionDifference > 0;
  return Number(identity.bundleVersion || 0) >= Number(introduction.bundleVersion);
}

function markerMatches(sourceAsar, marker) {
  const archive = readAsar(sourceAsar);
  const matches = { javascript: [], stylesheets: [] };
  for (const [filePath, node] of walkFiles(archive.header)) {
    if (node.unpacked || (!filePath.endsWith(".js") && !filePath.endsWith(".css"))) continue;
    const offset = archive.dataStart + Number(node.offset || 0);
    const source = archive.buffer.subarray(offset, offset + Number(node.size || 0)).toString("utf8");
    const count = source.split(marker).length - 1;
    if (count === 0) continue;
    const collection = filePath.endsWith(".js") ? matches.javascript : matches.stylesheets;
    collection.push({ filePath, count });
  }
  return matches;
}

function detectSourceCapabilities({ sourceApp, identity, patchSet, operations = {} }) {
  const readSourceAsar = operations.readSourceAsar || ((appPath) =>
    fs.readFileSync(path.join(appPath, "Contents/Resources/app.asar")));
  const sourceAsar = readSourceAsar(sourceApp);
  const actualSha256 = sha256(sourceAsar);
  if (actualSha256 !== identity.asarSha256 || actualSha256 !== patchSet.asarSha256) {
    throw new Error(`Capability detection source SHA-256 mismatch: expected ${patchSet.asarSha256}, got ${actualSha256}`);
  }

  const matches = markerMatches(sourceAsar, COMPOSER_CODE_TOOLBAR_MARKER);
  const hasJavaScript = matches.javascript.length > 0;
  const hasStylesheets = matches.stylesheets.length > 0;
  const required = capabilityRequired(identity, COMPOSER_CODE_TOOLBAR_INTRODUCTION);
  if (hasJavaScript !== hasStylesheets) {
    throw new Error(`Composer code language control has partial source evidence: ${JSON.stringify(matches)}`);
  }
  if (required !== hasJavaScript) {
    const expected = required ? "required" : "unavailable";
    const observed = hasJavaScript ? "present" : "absent";
    throw new Error(`Composer code language control expected ${expected} but source evidence is ${observed}: ${JSON.stringify(matches)}`);
  }

  return {
    composerCodeLanguageControl: {
      status: required ? "required" : "unavailable",
      detector: "original-asar-marker",
      introducedBy: COMPOSER_CODE_TOOLBAR_INTRODUCTION.patchSet,
      evidence: {
        marker: COMPOSER_CODE_TOOLBAR_MARKER,
        sourceAsarSha256: actualSha256,
        javascriptMatches: matches.javascript,
        stylesheetMatches: matches.stylesheets,
      },
    },
  };
}

module.exports = {
  COMPOSER_CODE_TOOLBAR_INTRODUCTION,
  COMPOSER_CODE_TOOLBAR_MARKER,
  capabilityRequired,
  compareNumericVersion,
  detectSourceCapabilities,
  markerMatches,
};
