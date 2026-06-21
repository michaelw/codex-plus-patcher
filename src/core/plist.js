const childProcess = require("node:child_process");

function execFile(command, args, options = {}) {
  return childProcess.execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function readPlistValue(plistPath, keyPath) {
  return execFile("/usr/bin/plutil", ["-extract", keyPath, "raw", plistPath]);
}

function replacePlistString(plistPath, keyPath, value) {
  childProcess.execFileSync("/usr/bin/plutil", ["-replace", keyPath, "-string", value, plistPath], {
    stdio: "inherit",
  });
}

function setPlistBuddyValue(plistPath, keyPath, value) {
  childProcess.execFileSync("/usr/libexec/PlistBuddy", ["-c", `Set ${keyPath} ${value}`, plistPath], {
    stdio: "inherit",
  });
}

module.exports = {
  readPlistValue,
  replacePlistString,
  setPlistBuddyValue,
};
