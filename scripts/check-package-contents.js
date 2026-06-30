#!/usr/bin/env node
const childProcess = require("node:child_process");

const ALLOWED_EXACT_PATHS = new Set(["LICENSE", "README.md", "package.json"]);
const ALLOWED_PREFIXES = ["src/"];

function normalizePackagePath(filePath) {
  return String(filePath || "").replace(/\\/g, "/");
}

function isAllowedPackagePath(filePath) {
  return ALLOWED_EXACT_PATHS.has(filePath) || ALLOWED_PREFIXES.some((prefix) => filePath.startsWith(prefix));
}

function packageFileIssues(files) {
  const issues = [];
  for (const file of files) {
    const filePath = normalizePackagePath(file.path);
    const parts = filePath.split("/");

    if (!isAllowedPackagePath(filePath)) {
      issues.push(`${filePath}: outside the source package allow-list`);
    }
    if (parts.some((part) => part.endsWith(".zip"))) {
      issues.push(`${filePath}: zip archives must not be published`);
    }
    if (parts.some((part) => part.endsWith(".app"))) {
      issues.push(`${filePath}: app bundles must not be published`);
    }
    if (filePath.startsWith("work/")) {
      issues.push(`${filePath}: work/ output must not be published`);
    }
    if (filePath.startsWith("outputs/")) {
      issues.push(`${filePath}: outputs/ must not be published`);
    }
    if (filePath.startsWith(".codex-plus-cache/")) {
      issues.push(`${filePath}: .codex-plus-cache/ must not be published`);
    }
    if (parts.at(-1) === "source.json") {
      issues.push(`${filePath}: generated source metadata must not be published`);
    }
  }
  return issues;
}

function parsePackJson(output) {
  const parsed = JSON.parse(output);
  if (!Array.isArray(parsed) || parsed.length !== 1 || !Array.isArray(parsed[0].files)) {
    throw new Error("npm pack --dry-run --json did not return one package with a files list");
  }
  return parsed[0];
}

function runNpmPack({ execFileSync = childProcess.execFileSync } = {}) {
  return execFileSync("npm", ["pack", "--dry-run", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function checkPackageContents({ packJson, execFileSync } = {}) {
  const output = packJson || runNpmPack({ execFileSync });
  const packageInfo = parsePackJson(output);
  const issues = packageFileIssues(packageInfo.files);
  return { issues, packageInfo };
}

function main() {
  const { issues, packageInfo } = checkPackageContents();
  if (issues.length > 0) {
    console.error("Package contents check failed:");
    for (const issue of issues) console.error(`- ${issue}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Package contents check passed: ${packageInfo.entryCount || packageInfo.files.length} files`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Package contents check failed: ${error.message || String(error)}`);
    process.exitCode = 1;
  }
}

module.exports = {
  checkPackageContents,
  packageFileIssues,
  parsePackJson,
};
