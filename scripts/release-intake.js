#!/usr/bin/env node
const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { sha256File } = require("../src/core/asar");
const { getAppIdentity } = require("../src/core/patch-engine");
const { patchSets } = require("../src/patches");

const DEFAULT_REPO = "Wangnov/codex-app-mirror";
const MACOS_SUMS = "SHA256SUMS-macos.txt";
const FALLBACK_SUMS = "SHA256SUMS.txt";

function expandPath(input) {
  if (input === "~") return os.homedir();
  if (input.startsWith("~/")) return path.join(os.homedir(), input.slice(2));
  return input;
}

function parseArgs(argv) {
  const args = {
    asset: null,
    force: false,
    help: false,
    json: false,
    newest: null,
    repo: DEFAULT_REPO,
    sourcesDir: null,
    tag: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`Missing value for ${arg}`);
      return argv[index];
    };

    if (arg === "--asset") args.asset = next();
    else if (arg === "--force") args.force = true;
    else if (arg === "--json") args.json = true;
    else if (arg === "--newest") {
      const value = Number(next());
      if (!Number.isInteger(value) || value < 1) throw new Error("--newest must be a positive integer");
      args.newest = value;
    }
    else if (arg === "--repo") args.repo = next();
    else if (arg === "--sources-dir") args.sourcesDir = path.resolve(expandPath(next()));
    else if (arg === "--tag") args.tag = next();
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (args.newest != null && args.tag != null) throw new Error("--newest cannot be combined with --tag");
  if (args.newest != null && args.asset != null) throw new Error("--newest cannot be combined with --asset");
  if (args.tag == null) args.tag = "latest";

  return args;
}

function helpText() {
  return `Usage:
  npm run release:intake -- [options]

Options:
  --tag <release-tag>      Mirror release tag. Default: latest
  --newest <N>             Intake the newest N mirror releases
  --asset <name>           Asset name. Default: host darwin zip
  --sources-dir <path>     Storage root override. Default: main checkout work/sources
  --repo <owner/repo>      GitHub mirror repo. Default: ${DEFAULT_REPO}
  --force                  Replace an existing work/sources/<version> directory
  --json                   Print the machine-readable result
`;
}

function fetchUrl(url, { fetchImpl = fetch } = {}) {
  return fetchImpl(url, {
    headers: { "user-agent": "codex-plus-patcher" },
  });
}

async function fetchJson(url, operations = {}) {
  const response = await fetchUrl(url, operations);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  return response.json();
}

async function fetchText(url, operations = {}) {
  const response = await fetchUrl(url, operations);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  return response.text();
}

function responseContentLength(response) {
  const value = response.headers?.get?.("content-length");
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = unitIndex === 0 || value >= 10 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function formatDownloadProgress(name, downloaded, total) {
  if (total == null || total === 0) return `Downloading ${name} (${formatBytes(downloaded)})`;
  const percent = Math.floor((downloaded / total) * 100);
  return `Downloading ${name} (${percent}% ${formatBytes(downloaded)}/${formatBytes(total)})`;
}

async function createDownloadProgress({ enabled, importOra = (specifier) => import(specifier), stream = process.stderr } = {}) {
  if (!enabled) return null;
  const imported = await importOra("ora");
  const ora = imported.default || imported;
  let spinner = null;
  let lastText = null;

  return {
    downloadStart(name, total) {
      spinner = ora({
        color: "cyan",
        spinner: "dots",
        stream,
        text: formatDownloadProgress(name, 0, total),
      });
      lastText = spinner.text;
      spinner.start();
    },
    downloadUpdate(name, downloaded, total) {
      if (!spinner) return;
      const text = formatDownloadProgress(name, downloaded, total);
      if (text === lastText) return;
      spinner.text = text;
      lastText = text;
    },
    downloadSucceed(name) {
      if (!spinner) return;
      spinner.succeed(`Downloaded ${name}`);
      spinner = null;
      lastText = null;
    },
    downloadFail(name) {
      if (!spinner) return;
      spinner.fail(`Download failed: ${name}`);
      spinner = null;
      lastText = null;
    },
  };
}

async function writeResponseBody(response, destination, { fsImpl = fs, onProgress } = {}) {
  const total = responseContentLength(response);
  if (!response.body || typeof fsImpl.createWriteStream !== "function") {
    const buffer = Buffer.from(await response.arrayBuffer());
    fsImpl.writeFileSync(destination, buffer);
    if (onProgress) onProgress(buffer.length, total || buffer.length);
    return;
  }

  const output = fsImpl.createWriteStream(destination);
  let downloaded = 0;
  try {
    for await (const chunk of response.body) {
      const buffer = Buffer.from(chunk);
      downloaded += buffer.length;
      if (!output.write(buffer)) {
        await new Promise((resolve, reject) => {
          const cleanup = () => {
            output.off("drain", onDrain);
            output.off("error", onError);
          };
          const onDrain = () => {
            cleanup();
            resolve();
          };
          const onError = (error) => {
            cleanup();
            reject(error);
          };
          output.once("drain", onDrain);
          output.once("error", onError);
        });
      }
      if (onProgress) onProgress(downloaded, total);
    }
    await new Promise((resolve, reject) => {
      output.end(resolve);
      output.once("error", reject);
    });
  } catch (error) {
    output.destroy();
    throw error;
  }
}

async function downloadFile(url, destination, operations = {}) {
  const fsImpl = operations.fs || fs;
  const response = await fetchUrl(url, operations);
  if (!response.ok) throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  fsImpl.mkdirSync(path.dirname(destination), { recursive: true });
  const progress = operations.progress;
  const name = path.basename(destination);
  const total = responseContentLength(response);
  if (progress?.downloadStart) progress.downloadStart(name, total);
  try {
    await writeResponseBody(response, destination, {
      fsImpl,
      onProgress: (downloaded, contentLength) => {
        if (progress?.downloadUpdate) progress.downloadUpdate(name, downloaded, contentLength);
      },
    });
    if (progress?.downloadSucceed) progress.downloadSucceed(name);
  } catch (error) {
    if (progress?.downloadFail) progress.downloadFail(name);
    throw error;
  }
}

function releaseApiUrl({ repo, tag }) {
  if (tag === "latest") return `https://api.github.com/repos/${repo}/releases/latest`;
  return `https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`;
}

function releasesApiUrl({ repo, limit }) {
  return `https://api.github.com/repos/${repo}/releases?per_page=${encodeURIComponent(String(limit))}`;
}

function releaseVersionFromTag(tagName) {
  const match = /^codex-app-(.+)$/.exec(tagName || "");
  if (!match) throw new Error(`Release tag does not match codex-app-<version>: ${tagName}`);
  return match[1];
}

function releaseVersionFromAsset(assetName) {
  const match = /^Codex-darwin-(?:arm64|x64)-(.+)\.zip$/.exec(assetName || "");
  if (!match) return null;
  return match[1];
}

function hostMacAssetName(version, arch = process.arch) {
  const macArch = arch === "arm64" ? "arm64" : "x64";
  return `Codex-darwin-${macArch}-${version}.zip`;
}

function selectAsset(release, { assetName, arch = process.arch } = {}) {
  const version = releaseVersionFromTag(release.tag_name);
  const selectedName = assetName || hostMacAssetName(version, arch);
  const asset = (release.assets || []).find((candidate) => candidate.name === selectedName);
  if (!asset) throw new Error(`Release ${release.tag_name} does not contain asset ${selectedName}`);

  const assetVersion = releaseVersionFromAsset(asset.name);
  if (assetVersion !== version) {
    throw new Error(`Asset ${asset.name} does not match release version ${version}`);
  }

  return { asset, version };
}

function selectChecksumAsset(release) {
  const assets = release.assets || [];
  return assets.find((asset) => asset.name === MACOS_SUMS) || assets.find((asset) => asset.name === FALLBACK_SUMS) || null;
}

function parseChecksumFile(content) {
  const checksums = new Map();
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([a-fA-F0-9]{64})\s+\*?(.+)$/.exec(trimmed);
    if (!match) continue;
    checksums.set(match[2].trim(), match[1].toLowerCase());
  }
  return checksums;
}

function requireChecksum(checksums, assetName) {
  const checksum = checksums.get(assetName);
  if (!checksum) throw new Error(`Checksum file does not contain ${assetName}`);
  return checksum;
}

function verifyFileSha256(file, expectedSha256, { sha256FileImpl = sha256File } = {}) {
  const actualSha256 = sha256FileImpl(file);
  if (actualSha256 !== expectedSha256) {
    throw new Error(`Checksum mismatch for ${path.basename(file)}: expected ${expectedSha256}, got ${actualSha256}`);
  }
  return actualSha256;
}

function resolveDefaultSourcesDir({ cwd = process.cwd(), execFileSync = childProcess.execFileSync } = {}) {
  const commonDirOutput = execFileSync("git", ["rev-parse", "--git-common-dir"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  const commonDir = path.resolve(cwd, commonDirOutput);
  const mainCheckout = path.dirname(commonDir);
  return path.join(mainCheckout, "work", "sources");
}

function findSourceApps(root, { fsImpl = fs } = {}) {
  const apps = [];
  const visit = (current) => {
    const stat = fsImpl.statSync(current);
    if (!stat.isDirectory()) return;
    if (path.basename(current) === "Codex.app" || path.basename(current) === "ChatGPT.app") {
      apps.push(current);
      return;
    }
    for (const entry of fsImpl.readdirSync(current)) visit(path.join(current, entry));
  };
  visit(root);
  return apps;
}

const findCodexApps = findSourceApps;

function extractZip(zipPath, destination, { execFileSync = childProcess.execFileSync } = {}) {
  execFileSync("/usr/bin/ditto", ["-x", "-k", zipPath, destination], { stdio: "inherit" });
}

function buildMetadata({ release, asset, checksumAsset, verifiedZipSha256, identity, sourceAsarSha256, now }) {
  return {
    releaseTag: release.tag_name,
    releaseUrl: release.html_url,
    assetName: asset.name,
    assetUrl: asset.browser_download_url,
    checksumName: checksumAsset.name,
    checksumUrl: checksumAsset.browser_download_url,
    verifiedZipSha256,
    CFBundleShortVersionString: identity.version,
    CFBundleVersion: identity.bundleVersion,
    sourceAsarSha256,
    intakeTimestamp: now().toISOString(),
  };
}

function findMatchingPatchSet(identity, patchSetList = patchSets) {
  return patchSetList.find(
    (patchSet) => patchSet.codexVersion === identity.version && patchSet.bundleVersion === identity.bundleVersion,
  );
}

function assertPatchIdentity(identity, patchSetList = patchSets) {
  const matchingPatchSet = findMatchingPatchSet(identity, patchSetList);
  if (!matchingPatchSet) return { supported: false, patchSet: null };
  if (matchingPatchSet.asarSha256 !== identity.asarSha256) {
    throw new Error(
      `Existing patch ${matchingPatchSet.id} expects app.asar ${matchingPatchSet.asarSha256}, got ${identity.asarSha256}`,
    );
  }
  return { supported: true, patchSet: matchingPatchSet.id };
}

function removeIfExists(target, { fsImpl = fs } = {}) {
  fsImpl.rmSync(target, { recursive: true, force: true });
}

function existingSourceApp(versionDir, { fsImpl = fs } = {}) {
  for (const appName of ["ChatGPT.app", "Codex.app"]) {
    const candidate = path.join(versionDir, appName);
    if (fsImpl.existsSync(candidate)) return candidate;
  }
  return null;
}

function sourceAppName(identity) {
  return identity?.sourceFamily === "chatgpt" ? "ChatGPT.app" : "Codex.app";
}

async function intakeRelease(args, operations = {}) {
  const fsImpl = operations.fs || fs;
  const cwd = operations.cwd || process.cwd();
  const now = operations.now || (() => new Date());
  const release =
    operations.release || (await fetchJson(releaseApiUrl({ repo: args.repo, tag: args.tag }), operations));
  const { asset, version } = selectAsset(release, { assetName: args.asset, arch: operations.arch || process.arch });
  const checksumAsset = selectChecksumAsset(release);
  if (!checksumAsset) throw new Error(`Release ${release.tag_name} does not contain ${MACOS_SUMS} or ${FALLBACK_SUMS}`);

  const sourcesDir = args.sourcesDir || resolveDefaultSourcesDir({ cwd, execFileSync: operations.execFileSync });
  const versionDir = path.join(sourcesDir, version);
  const existingApp = existingSourceApp(versionDir, { fsImpl });
  if (existingApp && !args.force) {
    const error = new Error(`${existingApp} already exists; pass --force to replace it`);
    error.code = "SOURCE_EXISTS";
    error.version = version;
    error.sourceApp = existingApp;
    throw error;
  }

  const stagingRoot = path.join(sourcesDir, `.intake-${process.pid}-${crypto.randomBytes(6).toString("hex")}`);
  const downloadPath = path.join(stagingRoot, asset.name);
  const extractDir = path.join(stagingRoot, "extracted");
  try {
    fsImpl.mkdirSync(extractDir, { recursive: true });
    const checksumText = await fetchText(checksumAsset.browser_download_url, operations);
    const expectedZipSha256 = requireChecksum(parseChecksumFile(checksumText), asset.name);

    await downloadFile(asset.browser_download_url, downloadPath, operations);
    const verifiedZipSha256 = verifyFileSha256(downloadPath, expectedZipSha256, operations);

    const extract = operations.extractZip || extractZip;
    extract(downloadPath, extractDir, operations);
    const apps = findSourceApps(extractDir, { fsImpl });
    if (apps.length !== 1) throw new Error(`Expected one source app in ${asset.name}, found ${apps.length}`);

    const identity = operations.getAppIdentity ? operations.getAppIdentity(apps[0]) : getAppIdentity(apps[0]);
    if (identity.version !== version) {
      throw new Error(`Extracted source app version ${identity.version} does not match release ${version}`);
    }
    const destinationApp = path.join(versionDir, sourceAppName(identity));

    const sourceAsarSha256 = identity.asarSha256;
    const patchIdentity = assertPatchIdentity(identity, operations.patchSets || patchSets);
    const metadata = buildMetadata({
      release,
      asset,
      checksumAsset,
      verifiedZipSha256,
      identity,
      sourceAsarSha256,
      now,
    });

    if (args.force) removeIfExists(versionDir, { fsImpl });
    fsImpl.mkdirSync(versionDir, { recursive: true });
    fsImpl.renameSync(apps[0], destinationApp);
    fsImpl.writeFileSync(path.join(versionDir, "source.json"), `${JSON.stringify(metadata, null, 2)}\n`);

    return {
      version,
      sourcesDir,
      sourceApp: destinationApp,
      metadataPath: path.join(versionDir, "source.json"),
      supported: patchIdentity.supported,
      patchSet: patchIdentity.patchSet,
      metadata,
    };
  } finally {
    removeIfExists(stagingRoot, { fsImpl });
  }
}

async function intakeNewestReleases(args, operations = {}) {
  const releases = await fetchJson(releasesApiUrl({ repo: args.repo, limit: args.newest }), operations);
  if (!Array.isArray(releases)) throw new Error("GitHub releases response was not an array");
  const selected = releases.slice(0, args.newest);
  if (selected.length < args.newest) {
    throw new Error(`Requested ${args.newest} releases, but only found ${selected.length}`);
  }

  const results = [];
  for (const release of selected) {
    try {
      results.push(
        await intakeRelease(
          {
            ...args,
            tag: release.tag_name,
          },
          {
            ...operations,
            release,
          },
        ),
      );
    } catch (error) {
      if (error.code !== "SOURCE_EXISTS") throw error;
      results.push({
        version: error.version || releaseVersionFromTag(release.tag_name),
        sourceApp: error.sourceApp,
        skipped: true,
        reason: "source app already exists",
      });
    }
  }
  return results;
}

function formatResult(result) {
  if (Array.isArray(result)) {
    return result.map((entry) => formatResult(entry).trimEnd()).join("\n\n") + "\n";
  }

  if (result.skipped) {
    return [
      "Release intake skipped.",
      `Source app: ${result.sourceApp}`,
      `Warning: ${result.reason}`,
    ].join("\n") + "\n";
  }

  const lines = [
    "Release intake succeeded.",
    `Source app: ${result.sourceApp}`,
    `Metadata: ${result.metadataPath}`,
    `Zip SHA-256: ${result.metadata.verifiedZipSha256}`,
  ];
  if (result.supported) lines.push(`Existing patch identity: ${result.patchSet}`);
  else lines.push("Existing patch identity: not registered yet");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(helpText());
    return;
  }
  const progress = await createDownloadProgress({ enabled: !args.json && process.stderr.isTTY });
  const operations = { progress };
  const result = args.newest == null ? await intakeRelease(args, operations) : await intakeNewestReleases(args, operations);
  process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : formatResult(result));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Error: ${error.message || String(error)}`);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_REPO,
  FALLBACK_SUMS,
  MACOS_SUMS,
  assertPatchIdentity,
  buildMetadata,
  createDownloadProgress,
  downloadFile,
  existingSourceApp,
  fetchJson,
  fetchText,
  findCodexApps,
  findSourceApps,
  formatResult,
  formatBytes,
  formatDownloadProgress,
  helpText,
  hostMacAssetName,
  intakeNewestReleases,
  intakeRelease,
  parseArgs,
  parseChecksumFile,
  releaseApiUrl,
  releasesApiUrl,
  releaseVersionFromAsset,
  releaseVersionFromTag,
  requireChecksum,
  resolveDefaultSourcesDir,
  selectAsset,
  selectChecksumAsset,
  sourceAppName,
  verifyFileSha256,
};
