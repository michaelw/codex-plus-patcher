const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { readPlistValue } = require("./plist");

const CHATGPT_APP = "/Applications/ChatGPT.app";
const CODEX_APP = "/Applications/Codex.app";

const SOURCE_FAMILIES = {
  chatgpt: {
    appName: "ChatGPT.app",
    displayName: "ChatGPT Plus",
    bundleIdentifier: "com.openai.chatgpt-plus",
    defaultTargetName: "ChatGPT Plus.app",
    executable: "ChatGPT",
  },
  codex: {
    appName: "Codex.app",
    displayName: "Codex Plus",
    bundleIdentifier: "com.openai.codex-plus",
    defaultTargetName: "Codex Plus.app",
    executable: "Codex",
  },
};

function existingDefaultSource({ fsImpl = fs } = {}) {
  if (fsImpl.existsSync(CHATGPT_APP)) return CHATGPT_APP;
  return CODEX_APP;
}

function sourceFamilyFromAppPath(appPath) {
  const base = path.basename(appPath || "");
  if (base === "ChatGPT.app" || base === "ChatGPT Plus.app") return "chatgpt";
  if (base === "Codex.app" || base === "Codex Plus.app") return "codex";
  return null;
}

function sourceFamilyFromPlist(plistPath, { readPlistValueImpl = readPlistValue } = {}) {
  try {
    const displayName = readPlistValueImpl(plistPath, "CFBundleDisplayName");
    if (displayName === "ChatGPT" || displayName === "ChatGPT Plus") return "chatgpt";
    if (displayName === "Codex" || displayName === "Codex Plus") return "codex";
  } catch {}
  try {
    const name = readPlistValueImpl(plistPath, "CFBundleName");
    if (name === "ChatGPT" || name === "ChatGPT Plus") return "chatgpt";
    if (name === "Codex" || name === "Codex Plus") return "codex";
  } catch {}
  try {
    const bundleIdentifier = readPlistValueImpl(plistPath, "CFBundleIdentifier");
    if (bundleIdentifier === "com.openai.chatgpt-plus") return "chatgpt";
    if (bundleIdentifier === "com.openai.codex-plus") return "codex";
  } catch {}
  return null;
}

function detectSourceFamily(appPath, operations = {}) {
  const plistPath = path.join(path.resolve(appPath), "Contents/Info.plist");
  return sourceFamilyFromPlist(plistPath, operations) || sourceFamilyFromAppPath(appPath) || "codex";
}

function sourceFamilyConfig(sourceFamily) {
  return SOURCE_FAMILIES[sourceFamily] || SOURCE_FAMILIES.codex;
}

function defaultTargetForSource(sourceApp) {
  const family = detectSourceFamily(sourceApp);
  return path.join(os.homedir(), "Applications", sourceFamilyConfig(family).defaultTargetName);
}

function defaultAuditTargetForSource(sourceApp = existingDefaultSource()) {
  const family = detectSourceFamily(sourceApp);
  return path.resolve("work", sourceFamilyConfig(family).defaultTargetName);
}

function readBundleExecutable(appPath, { readPlistValueImpl = readPlistValue } = {}) {
  const plistPath = path.join(path.resolve(appPath), "Contents/Info.plist");
  return readPlistValueImpl(plistPath, "CFBundleExecutable");
}

function appExecutablePath(appPath, operations = {}) {
  const executable = readBundleExecutable(appPath, operations);
  return path.join(path.resolve(appPath), "Contents/MacOS", executable);
}

module.exports = {
  CHATGPT_APP,
  CODEX_APP,
  SOURCE_FAMILIES,
  appExecutablePath,
  defaultAuditTargetForSource,
  defaultTargetForSource,
  detectSourceFamily,
  existingDefaultSource,
  readBundleExecutable,
  sourceFamilyConfig,
  sourceFamilyFromAppPath,
};
