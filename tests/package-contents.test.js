const assert = require("node:assert/strict");
const test = require("node:test");

const {
  checkPackageContents,
  packageFileIssues,
  parsePackJson,
} = require("../scripts/check-package-contents");

function packJson(files) {
  return JSON.stringify([
    {
      name: "codex-plus-patcher",
      version: "0.12.3",
      entryCount: files.length,
      files: files.map((filePath) => ({ path: filePath, size: 1, mode: 420 })),
    },
  ]);
}

test("package contents allow only source package files", () => {
  const { issues, packageInfo } = checkPackageContents({
    packJson: packJson([
      "LICENSE",
      "README.md",
      "package.json",
      "src/cli.js",
      "src/runtime/runtime.js",
    ]),
  });

  assert.deepEqual(issues, []);
  assert.equal(packageInfo.entryCount, 5);
});

test("package contents reject generated and upstream Codex artifacts", () => {
  const issues = packageFileIssues([
    { path: "Codex-darwin-arm64-26.623.70822.zip" },
    { path: "work/sources/26.623.70822/Codex.app/Contents/Info.plist" },
    { path: "outputs/Codex Plus.app/Contents/Resources/app.asar" },
    { path: ".codex-plus-cache/release/app.zip" },
    { path: "work/sources/26.623.70822/source.json" },
    { path: "scripts/release-intake.js" },
  ]);

  assert.match(issues.join("\n"), /zip archives must not be published/);
  assert.match(issues.join("\n"), /app bundles must not be published/);
  assert.match(issues.join("\n"), /work\/ output must not be published/);
  assert.match(issues.join("\n"), /outputs\/ must not be published/);
  assert.match(issues.join("\n"), /\.codex-plus-cache\/ must not be published/);
  assert.match(issues.join("\n"), /generated source metadata must not be published/);
  assert.match(issues.join("\n"), /outside the source package allow-list/);
});

test("package contents require npm pack json with one file list", () => {
  assert.throws(() => parsePackJson("[]"), /one package with a files list/);
  assert.throws(() => parsePackJson(JSON.stringify([{ files: [] }, { files: [] }])), /one package with a files list/);
  assert.throws(() => parsePackJson(JSON.stringify([{ name: "missing-files" }])), /one package with a files list/);
});
