const fs = require("node:fs");

function errorObject(error) {
  return {
    name: error?.name ?? null,
    code: error?.code ?? null,
    message: error?.message ?? String(error),
  };
}

function trace(event, data) {
  try {
    fs.appendFileSync(
      "/tmp/codex-plus-trace.log",
      `${JSON.stringify({ ts: new Date().toISOString(), event, data: data ?? null })}\n`,
    );
  } catch {}
}

function traceRequest(params) {
  trace(params?.event ?? "trace", params?.data ?? null);
  return { ok: true };
}

function unquoteTomlValue(value) {
  const trimmed = String(value || "").trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1);
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1);
  return trimmed;
}

function parsePlusToml(text) {
  const repositories = [];
  const ignoredLines = [];
  let current = null;
  let tableCount = 0;

  for (const [index, rawLine] of String(text || "").split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (line === "[[repositories]]") {
      if (current?.path) repositories.push(current);
      current = {};
      tableCount += 1;
      continue;
    }
    const match = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (match && current) {
      const [, key, rawValue] = match;
      if (key === "path" || key === "label") current[key] = unquoteTomlValue(rawValue);
      else ignoredLines.push({ line: index + 1, text: rawLine });
      continue;
    }
    ignoredLines.push({ line: index + 1, text: rawLine });
  }

  if (current?.path) repositories.push(current);
  return { repositories, tableCount, ignoredLines };
}

async function readPlusToml(projectRoot, platform) {
  const path = await platform.platformPath();
  const tomlPath = path.join(projectRoot, ".codex", "plus.toml");
  const debug = { path: tomlPath, attempted: true, readOk: false, bytes: 0, preview: null, error: null };
  trace("plus-toml:read-start", { path: tomlPath });
  try {
    const text = await new Response(await platform.readFile(tomlPath)).text();
    debug.readOk = true;
    debug.bytes = text.length;
    debug.preview = text.slice(0, 300);
    trace("plus-toml:read-ok", { path: tomlPath, bytes: debug.bytes, preview: debug.preview });
    return { text, debug };
  } catch (error) {
    debug.error = errorObject(error);
    trace("plus-toml:read-error", { path: tomlPath, error: debug.error });
    return { text: null, debug };
  }
}

function normalizeSlash(value) {
  return String(value || "").replaceAll("\\", "/");
}

async function repositoryTargets(gitManager, params, platform, signal, getSubmodulePaths) {
  trace("repository-targets:start", { cwd: params?.cwd, hostId: params?.hostId });
  const warnings = [];
  const metadata = await gitManager.getStableMetadata(params.cwd, platform);
  if (metadata == null) {
    const result = {
      main: null,
      repositories: [],
      warnings: [{ type: "main-not-git", path: params.cwd, message: "Current directory is not inside a git repository." }],
      debug: { requestCwd: params.cwd, projectRoot: null },
    };
    trace("repository-targets:main-not-git", result);
    return result;
  }

  const main = {
    id: `main:${metadata.root}`,
    kind: "main",
    path: ".",
    label: "Main",
    cwd: metadata.root,
    root: metadata.root,
    commonDir: metadata.commonDir,
    valid: true,
  };
  const path = await platform.platformPath();
  const submoduleCandidates = (await getSubmodulePaths(metadata.root, signal)).map((entry) => ({
    kind: "submodule",
    path: entry,
    label: entry.split("/").filter(Boolean).pop() || entry,
  }));
  const plusToml = await readPlusToml(metadata.root, platform);
  const parsed = parsePlusToml(plusToml.text);
  const configuredCandidates = parsed.repositories.map((entry) => ({ kind: "configured", ...entry }));
  const debug = {
    requestCwd: params.cwd,
    projectRoot: metadata.root,
    plusToml: {
      ...plusToml.debug,
      parsedRepositories: parsed.repositories.length,
      tableCount: parsed.tableCount,
      ignoredLines: parsed.ignoredLines.slice(0, 12),
    },
    submoduleCandidates: submoduleCandidates.map((entry) => ({ path: entry.path, label: entry.label })),
    configuredCandidates: configuredCandidates.map((entry) => ({ path: entry.path, label: entry.label ?? null })),
    accepted: [],
    skipped: [],
  };
  const seen = new Set();
  const repositories = [];

  function skip(entry) {
    warnings.push(entry);
    debug.skipped.push(entry);
    trace("repository-targets:skip", entry);
  }

  async function acceptCandidate(candidate) {
    const rawPath = candidate.path.trim();
    if (!rawPath) {
      skip({ kind: candidate.kind, type: "empty-path", path: rawPath, message: "Skipped empty repository path." });
      return;
    }
    if (path.isAbsolute(rawPath) || rawPath === ".." || rawPath.startsWith("../") || rawPath.startsWith("..\\")) {
      skip({ kind: candidate.kind, type: "out-of-root", path: rawPath, message: "Skipped repository outside project root." });
      return;
    }
    const resolved = path.normalize(path.join(metadata.root, rawPath));
    const relative = path.relative(metadata.root, resolved);
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      skip({
        kind: candidate.kind,
        type: "out-of-root",
        path: rawPath,
        resolved,
        relative,
        message: "Skipped repository outside project root.",
      });
      return;
    }
    const normalized = normalizeSlash(relative);
    if (seen.has(normalized)) {
      skip({ kind: candidate.kind, type: "duplicate", path: normalized, message: "Skipped duplicate repository path." });
      return;
    }
    seen.add(normalized);

    let repoMetadata;
    try {
      repoMetadata = await gitManager.getStableMetadata(resolved, platform);
    } catch (error) {
      skip({
        kind: candidate.kind,
        type: "metadata-error",
        path: normalized,
        resolved,
        error: errorObject(error),
        message: "Failed to inspect repository metadata.",
      });
      return;
    }
    if (repoMetadata == null) {
      if (candidate.kind === "configured") {
        skip({ kind: candidate.kind, type: "non-git", path: normalized, resolved, message: "Configured repository is not a git repository." });
      }
      return;
    }

    const repo = {
      id: `${candidate.kind}:${normalized}`,
      kind: candidate.kind,
      path: normalized,
      label: candidate.label ?? normalized,
      cwd: resolved,
      root: repoMetadata.root,
      commonDir: repoMetadata.commonDir,
      valid: true,
    };
    repositories.push(repo);
    debug.accepted.push({ kind: candidate.kind, path: normalized, cwd: resolved, root: repoMetadata.root });
    trace("repository-targets:accept", { kind: candidate.kind, path: normalized, cwd: resolved, root: repoMetadata.root });
  }

  for (const candidate of submoduleCandidates) await acceptCandidate(candidate);
  for (const candidate of configuredCandidates) await acceptCandidate(candidate);

  const result = { main, repositories, warnings, debug };
  trace("repository-targets:done", {
    repositoryCount: repositories.length,
    warningCount: warnings.length,
    accepted: debug.accepted,
    skipped: debug.skipped,
  });
  return result;
}

function isReadOnlyBranchRequest(requestKind, source) {
  return source === "codex_plus_review" && (requestKind === "recent-branches" || requestKind === "search-branches");
}

function repositoryTargetsFromHost(gitManager, params, platform, signal, getSubmodulePaths) {
  return repositoryTargets(gitManager, params, platform, signal, (root, submoduleSignal) =>
    getSubmodulePaths(gitManager.getWorktreeRepositoryForRoot(root, platform), submoduleSignal),
  );
}

module.exports = {
  isReadOnlyBranchRequest,
  repositoryTargetsFromHost,
  repositoryTargets,
  traceRequest,
};
