const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

async function downloadFile(url, destination) {
  const response = await fetch(url, {
    headers: { "user-agent": "codex-plus-patcher" },
  });
  if (!response.ok) throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
}

async function getGitHubReleaseAssetUrl({ repo, tag = "latest", assetName }) {
  const releaseUrl =
    tag === "latest"
      ? `https://api.github.com/repos/${repo}/releases/latest`
      : `https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`;
  const response = await fetch(releaseUrl, {
    headers: { "user-agent": "codex-plus-patcher" },
  });
  if (!response.ok) throw new Error(`Failed to fetch ${releaseUrl}: HTTP ${response.status}`);
  const release = await response.json();
  const asset = release.assets?.find((asset) => asset.name === assetName);
  if (!asset) throw new Error(`Release ${repo}@${tag} does not contain asset ${assetName}`);
  return asset.browser_download_url;
}

async function resolveReleasePatchDirectory({ repo, tag = "latest", assetName, cacheDir }) {
  const root = cacheDir || path.join(os.homedir(), ".cache", "codex-plus-patcher");
  const archive = path.join(root, `${repo.replaceAll("/", "-")}-${tag}-${assetName}`);
  const extracted = path.join(root, `${repo.replaceAll("/", "-")}-${tag}`);
  const url = await getGitHubReleaseAssetUrl({ repo, tag, assetName });
  await downloadFile(url, archive);
  fs.rmSync(extracted, { recursive: true, force: true });
  fs.mkdirSync(extracted, { recursive: true });
  childProcess.execFileSync("/usr/bin/tar", ["-xzf", archive, "-C", extracted], { stdio: "inherit" });
  return extracted;
}

module.exports = {
  downloadFile,
  getGitHubReleaseAssetUrl,
  resolveReleasePatchDirectory,
};
