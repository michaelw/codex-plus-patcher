#!/usr/bin/env node

const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const roots = [path.resolve(__dirname)];

function collectJavaScriptFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) collectJavaScriptFiles(fullPath, out);
    else if (entry.isFile() && entry.name.endsWith(".js")) out.push(fullPath);
  }
  return out;
}

const files = roots.flatMap((root) => collectJavaScriptFiles(root)).sort();
let failures = 0;

for (const file of files) {
  const result = childProcess.spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status === 0) continue;
  failures += 1;
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

if (failures > 0) {
  console.error(`JavaScript syntax check failed for ${failures} file${failures === 1 ? "" : "s"}.`);
  process.exit(1);
}

console.log(`Checked ${files.length} JavaScript files.`);
