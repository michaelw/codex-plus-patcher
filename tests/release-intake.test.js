const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  assertPatchIdentity,
  downloadFile,
  formatDownloadProgress,
  hostMacAssetName,
  intakeNewestReleases,
  intakeRelease,
  parseArgs,
  parseChecksumFile,
  requireChecksum,
  resolveDefaultSourcesDir,
  selectAsset,
  selectChecksumAsset,
} = require("../scripts/release-intake");

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function createRelease({ tag = "codex-app-26.623.70822", extraAssets = [] } = {}) {
  const version = tag.replace("codex-app-", "");
  const assets = ["arm64", "x64"].map((arch) => ({
    name: `Codex-darwin-${arch}-${version}.zip`,
    browser_download_url: `https://example.test/${version}/Codex.zip`,
  }));
  const checksumAsset = {
    name: "SHA256SUMS-macos.txt",
    browser_download_url: `https://example.test/${version}/SHA256SUMS-macos.txt`,
  };
  return {
    tag_name: tag,
    html_url: `https://github.test/releases/${tag}`,
    assets: [...assets, checksumAsset, ...extraAssets],
  };
}

function hostTestAssetName(version) {
  return hostMacAssetName(version, process.arch);
}

function checksumLine(buffer, version) {
  return `${sha256(buffer)}  ${hostTestAssetName(version)}\n`;
}

function response(body, methods = {}) {
  const buffer = Buffer.from(body);
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    json: async () => JSON.parse(body),
    text: async () => String(body),
    ...methods,
  };
}

function createFetch(routes) {
  return async (url) => {
    const route = routes[url];
    if (!route) throw new Error(`Unexpected fetch: ${url}`);
    return typeof route === "function" ? route(url) : route;
  };
}

async function withTempDir(callback) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-plus-intake-test-"));
  try {
    return await callback(tmpDir);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

test("release intake parses CLI flags", () => {
  assert.deepEqual(parseArgs(["--tag", "codex-app-26.623.61825", "--asset", "Codex-darwin-x64-26.623.61825.zip", "--force"]), {
    asset: "Codex-darwin-x64-26.623.61825.zip",
    force: true,
    help: false,
    json: false,
    newest: null,
    repo: "Wangnov/codex-app-mirror",
    sourcesDir: null,
    tag: "codex-app-26.623.61825",
  });
});

test("release intake parses newest releases mode", () => {
  assert.deepEqual(parseArgs(["--newest", "3"]), {
    asset: null,
    force: false,
    help: false,
    json: false,
    newest: 3,
    repo: "Wangnov/codex-app-mirror",
    sourcesDir: null,
    tag: "latest",
  });

  assert.throws(() => parseArgs(["--newest", "0"]), /--newest must be a positive integer/);
  assert.throws(() => parseArgs(["--newest", "2", "--tag", "codex-app-26.623.61825"]), /cannot be combined/);
  assert.throws(() => parseArgs(["--newest", "2", "--asset", "Codex-darwin-arm64-26.623.61825.zip"]), /cannot be combined/);
});

test("release intake selects host macOS zip assets", () => {
  const release = createRelease();
  assert.equal(hostMacAssetName("26.623.70822", "arm64"), "Codex-darwin-arm64-26.623.70822.zip");
  assert.equal(hostMacAssetName("26.623.70822", "x64"), "Codex-darwin-x64-26.623.70822.zip");
  assert.equal(selectAsset(release, { arch: "arm64" }).asset.name, "Codex-darwin-arm64-26.623.70822.zip");
  assert.equal(selectAsset(release, { arch: "x64" }).asset.name, "Codex-darwin-x64-26.623.70822.zip");
});

test("release intake parses macOS checksum files", () => {
  const checksums = parseChecksumFile([
    "# comment",
    "75e670b8948d262ac8ea3ad8f61149e3d0240a04e6ca0b6bc249ac54fd83d43e  Codex-mac-arm64.dmg",
    "4a29862faa4e4ceb177f7cb9fcbf93b65f42a3ddfda69ed9c1e8dfe2a0edb58b  *Codex-darwin-arm64-26.623.70822.zip",
    "",
  ].join("\n"));

  assert.equal(
    requireChecksum(checksums, "Codex-darwin-arm64-26.623.70822.zip"),
    "4a29862faa4e4ceb177f7cb9fcbf93b65f42a3ddfda69ed9c1e8dfe2a0edb58b",
  );
});

test("release intake formats download progress text", () => {
  assert.equal(formatDownloadProgress("Codex.zip", 512, null), "Downloading Codex.zip (512 B)");
  assert.equal(formatDownloadProgress("Codex.zip", 5 * 1024 * 1024, 10 * 1024 * 1024), "Downloading Codex.zip (50% 5.0 MB/10 MB)");
});

test("release intake reports download progress", async () => {
  await withTempDir(async (tmpDir) => {
    const events = [];
    const destination = path.join(tmpDir, "Codex.zip");
    const body = Buffer.from("zip-content");

    await downloadFile("https://example.test/Codex.zip", destination, {
      fetchImpl: createFetch({
        "https://example.test/Codex.zip": response(body, {
          headers: {
            get: (name) => (name === "content-length" ? String(body.length) : null),
          },
        }),
      }),
      progress: {
        downloadStart: (name, total) => events.push(["start", name, total]),
        downloadUpdate: (name, downloaded, total) => events.push(["update", name, downloaded, total]),
        downloadSucceed: (name) => events.push(["succeed", name]),
      },
    });

    assert.equal(fs.readFileSync(destination, "utf8"), "zip-content");
    assert.deepEqual(events, [
      ["start", "Codex.zip", body.length],
      ["update", "Codex.zip", body.length, body.length],
      ["succeed", "Codex.zip"],
    ]);
  });
});

test("release intake prefers macOS sums and falls back to full sums", () => {
  const fallback = { name: "SHA256SUMS.txt", browser_download_url: "https://example.test/SHA256SUMS.txt" };
  const macos = { name: "SHA256SUMS-macos.txt", browser_download_url: "https://example.test/SHA256SUMS-macos.txt" };

  assert.equal(selectChecksumAsset({ assets: [fallback, macos] }), macos);
  assert.equal(selectChecksumAsset({ assets: [fallback] }), fallback);
});

test("release intake resolves sources dir from the git common dir", () => {
  const sourcesDir = resolveDefaultSourcesDir({
    cwd: "/tmp/worktree",
    execFileSync: () => "/Users/michaelw/Documents/Code/codex-plus-patcher/.git\n",
  });

  assert.equal(sourcesDir, "/Users/michaelw/Documents/Code/codex-plus-patcher/work/sources");
});

test("release intake refuses to overwrite an existing source app without force", async () => {
  await withTempDir(async (tmpDir) => {
    const existingApp = path.join(tmpDir, "26.623.70822", "Codex.app");
    fs.mkdirSync(existingApp, { recursive: true });

    await assert.rejects(
      intakeRelease(
        {
          asset: null,
          force: false,
          json: false,
          repo: "Wangnov/codex-app-mirror",
          sourcesDir: tmpDir,
          tag: "latest",
        },
        {
          fetchImpl: createFetch({
            "https://api.github.com/repos/Wangnov/codex-app-mirror/releases/latest": response(JSON.stringify(createRelease())),
          }),
        },
      ),
      /already exists; pass --force/,
    );
  });
});

test("release intake recognizes an existing ChatGPT app from a legacy Codex-named asset", async () => {
  await withTempDir(async (tmpDir) => {
    const existingApp = path.join(tmpDir, "26.707.31428", "ChatGPT.app");
    fs.mkdirSync(existingApp, { recursive: true });

    await assert.rejects(
      intakeRelease(
        {
          asset: null,
          force: false,
          json: false,
          repo: "Wangnov/codex-app-mirror",
          sourcesDir: tmpDir,
          tag: "latest",
        },
        {
          release: createRelease({ tag: "codex-app-26.707.31428" }),
        },
      ),
      (error) => error.code === "SOURCE_EXISTS" && error.sourceApp === existingApp,
    );
  });
});

test("release intake rejects a bad checksum", async () => {
  await withTempDir(async (tmpDir) => {
    const release = createRelease();
    const zipContent = Buffer.from("zip-content");
    const wrongSha = "0".repeat(64);

    await assert.rejects(
      intakeRelease(
        {
          asset: null,
          force: false,
          json: false,
          repo: "Wangnov/codex-app-mirror",
          sourcesDir: tmpDir,
          tag: "latest",
        },
        {
          fetchImpl: createFetch({
            "https://api.github.com/repos/Wangnov/codex-app-mirror/releases/latest": response(JSON.stringify(release)),
            "https://example.test/26.623.70822/SHA256SUMS-macos.txt": response(`${wrongSha}  ${hostTestAssetName("26.623.70822")}\n`),
            "https://example.test/26.623.70822/Codex.zip": response(zipContent),
          }),
        },
      ),
      /Checksum mismatch/,
    );
  });
});

test("release intake writes metadata and allows unsupported new versions", async () => {
  await withTempDir(async (tmpDir) => {
    const release = createRelease();
    const zipContent = Buffer.from("zip-content");
    const zipSha = sha256(zipContent);
    const now = new Date("2026-06-29T12:00:00.000Z");

    const result = await intakeRelease(
      {
        asset: null,
        force: false,
        json: false,
        repo: "Wangnov/codex-app-mirror",
        sourcesDir: tmpDir,
        tag: "latest",
      },
      {
        extractZip: (_zip, destination) => {
          fs.mkdirSync(path.join(destination, "Codex.app"), { recursive: true });
        },
        fetchImpl: createFetch({
          "https://api.github.com/repos/Wangnov/codex-app-mirror/releases/latest": response(JSON.stringify(release)),
          "https://example.test/26.623.70822/SHA256SUMS-macos.txt": response(`${zipSha}  ${hostTestAssetName("26.623.70822")}\n`),
          "https://example.test/26.623.70822/Codex.zip": response(zipContent),
        }),
        getAppIdentity: () => ({
          asarSha256: "source-sha",
          bundleVersion: "4559",
          version: "26.623.70822",
        }),
        now: () => now,
        patchSets: [],
      },
    );

    assert.equal(result.supported, false);
    assert.equal(result.sourceApp, path.join(tmpDir, "26.623.70822", "Codex.app"));
    assert.equal(fs.statSync(result.sourceApp).isDirectory(), true);

    const metadata = JSON.parse(fs.readFileSync(result.metadataPath, "utf8"));
    assert.equal(metadata.releaseTag, "codex-app-26.623.70822");
    assert.equal(metadata.assetName, hostTestAssetName("26.623.70822"));
    assert.equal(metadata.verifiedZipSha256, zipSha);
    assert.equal(metadata.CFBundleShortVersionString, "26.623.70822");
    assert.equal(metadata.CFBundleVersion, "4559");
    assert.equal(metadata.sourceAsarSha256, "source-sha");
    assert.equal(metadata.intakeTimestamp, "2026-06-29T12:00:00.000Z");
  });
});

test("release intake names a legacy-packaged ChatGPT bundle from its plist identity", async () => {
  await withTempDir(async (tmpDir) => {
    const release = createRelease({ tag: "codex-app-26.707.51957" });
    const zipContent = Buffer.from("chatgpt-zip-content");
    const zipSha = sha256(zipContent);

    const result = await intakeRelease(
      {
        asset: null,
        force: false,
        json: false,
        repo: "Wangnov/codex-app-mirror",
        sourcesDir: tmpDir,
        tag: "latest",
      },
      {
        extractZip: (_zip, destination) => {
          fs.mkdirSync(path.join(destination, "Codex.app"), { recursive: true });
        },
        fetchImpl: createFetch({
          "https://example.test/26.707.51957/SHA256SUMS-macos.txt": response(`${zipSha}  ${hostTestAssetName("26.707.51957")}\n`),
          "https://example.test/26.707.51957/Codex.zip": response(zipContent),
        }),
        getAppIdentity: () => ({
          asarSha256: "chatgpt-source-sha",
          bundleVersion: "5200",
          sourceFamily: "chatgpt",
          version: "26.707.51957",
        }),
        patchSets: [],
        release,
      },
    );

    assert.equal(result.sourceApp, path.join(tmpDir, "26.707.51957", "ChatGPT.app"));
    assert.equal(fs.statSync(result.sourceApp).isDirectory(), true);
    assert.equal(fs.existsSync(path.join(tmpDir, "26.707.51957", "Codex.app")), false);
  });
});

test("release intake can intake the newest N releases", async () => {
  await withTempDir(async (tmpDir) => {
    const firstRelease = createRelease({ tag: "codex-app-26.623.70822" });
    const secondRelease = createRelease({ tag: "codex-app-26.623.61825" });
    const firstZip = Buffer.from("first-zip");
    const secondZip = Buffer.from("second-zip");
    const identities = [
      { asarSha256: "first-source-sha", bundleVersion: "4559", version: "26.623.70822" },
      { asarSha256: "second-source-sha", bundleVersion: "4548", version: "26.623.61825" },
    ];

    const results = await intakeNewestReleases(
      {
        asset: null,
        force: false,
        json: false,
        newest: 2,
        repo: "Wangnov/codex-app-mirror",
        sourcesDir: tmpDir,
        tag: "latest",
      },
      {
        extractZip: (_zip, destination) => {
          fs.mkdirSync(path.join(destination, "Codex.app"), { recursive: true });
        },
        fetchImpl: createFetch({
          "https://api.github.com/repos/Wangnov/codex-app-mirror/releases?per_page=2": response(
            JSON.stringify([firstRelease, secondRelease]),
          ),
          "https://example.test/26.623.70822/SHA256SUMS-macos.txt": response(
            checksumLine(firstZip, "26.623.70822"),
          ),
          "https://example.test/26.623.70822/Codex.zip": response(firstZip),
          "https://example.test/26.623.61825/SHA256SUMS-macos.txt": response(
            checksumLine(secondZip, "26.623.61825"),
          ),
          "https://example.test/26.623.61825/Codex.zip": response(secondZip),
        }),
        getAppIdentity: () => identities.shift(),
        patchSets: [],
      },
    );

    assert.deepEqual(
      results.map((result) => result.version),
      ["26.623.70822", "26.623.61825"],
    );
    assert.equal(fs.statSync(path.join(tmpDir, "26.623.70822", "Codex.app")).isDirectory(), true);
    assert.equal(fs.statSync(path.join(tmpDir, "26.623.61825", "Codex.app")).isDirectory(), true);
  });
});

test("release intake newest mode skips existing source apps", async () => {
  await withTempDir(async (tmpDir) => {
    const firstRelease = createRelease({ tag: "codex-app-26.623.70822" });
    const secondRelease = createRelease({ tag: "codex-app-26.623.61825" });
    const existingApp = path.join(tmpDir, "26.623.70822", "Codex.app");
    const secondZip = Buffer.from("second-zip");

    fs.mkdirSync(existingApp, { recursive: true });

    const results = await intakeNewestReleases(
      {
        asset: null,
        force: false,
        json: false,
        newest: 2,
        repo: "Wangnov/codex-app-mirror",
        sourcesDir: tmpDir,
        tag: "latest",
      },
      {
        extractZip: (_zip, destination) => {
          fs.mkdirSync(path.join(destination, "Codex.app"), { recursive: true });
        },
        fetchImpl: createFetch({
          "https://api.github.com/repos/Wangnov/codex-app-mirror/releases?per_page=2": response(
            JSON.stringify([firstRelease, secondRelease]),
          ),
          "https://example.test/26.623.61825/SHA256SUMS-macos.txt": response(
            checksumLine(secondZip, "26.623.61825"),
          ),
          "https://example.test/26.623.61825/Codex.zip": response(secondZip),
        }),
        getAppIdentity: () => ({
          asarSha256: "second-source-sha",
          bundleVersion: "4548",
          version: "26.623.61825",
        }),
        patchSets: [],
      },
    );

    assert.deepEqual(results[0], {
      version: "26.623.70822",
      sourceApp: existingApp,
      skipped: true,
      reason: "source app already exists",
    });
    assert.equal(results[1].version, "26.623.61825");
    assert.equal(fs.statSync(path.join(tmpDir, "26.623.61825", "Codex.app")).isDirectory(), true);
  });
});

test("release intake checks existing patch identity by version and bundle", () => {
  assert.deepEqual(
    assertPatchIdentity(
      { version: "1.2.3", bundleVersion: "7", asarSha256: "abc" },
      [{ id: "codex-1.2.3-7", codexVersion: "1.2.3", bundleVersion: "7", asarSha256: "abc" }],
    ),
    { supported: true, patchSet: "codex-1.2.3-7" },
  );

  assert.throws(
    () =>
      assertPatchIdentity(
        { version: "1.2.3", bundleVersion: "7", asarSha256: "wrong" },
        [{ id: "codex-1.2.3-7", codexVersion: "1.2.3", bundleVersion: "7", asarSha256: "abc" }],
      ),
    /expects app\.asar abc, got wrong/,
  );
});
