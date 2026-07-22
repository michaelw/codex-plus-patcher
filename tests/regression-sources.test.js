const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  classifyImpact,
  cleanRegressionDir,
  cleanRegressionSources,
  collectGitImpact,
  compareVersionStrings,
  defaultRegressionDirForSources,
  discoverSources,
  formatHumanResult,
  listSourceApps,
  parseArgs,
  pathsForSource,
  runRegressionSources,
  selectAffectedSources,
  terminateActiveSource,
} = require("../scripts/regression-sources");

async function withTempDir(callback) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-plus-regression-test-"));
  try {
    return await callback(tmpDir);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function createSourceApp(sourcesDir, version, appName = "Codex.app") {
  const app = path.join(sourcesDir, version, appName);
  fs.mkdirSync(app, { recursive: true });
  return app;
}

function identity(version, bundleVersion, asarSha256) {
  return { version, bundleVersion, asarSha256 };
}

function familyIdentity(version, bundleVersion, asarSha256, sourceFamily) {
  return { version, bundleVersion, asarSha256, sourceFamily };
}

function patchSet(version, bundleVersion, asarSha256, id = `codex-${version}-${bundleVersion}`) {
  return { codexVersion: version, bundleVersion, asarSha256, id };
}

test("regression sources parses options and rejects unsafe combinations", () => {
  assert.deepEqual(parseArgs(["--filter", "61825", "--auto-clean", "--json"]), {
    affectedSince: null,
    autoClean: true,
    clean: false,
    filter: "61825",
    help: false,
    includeNativeOpenProbes: false,
    json: true,
    jsonl: false,
    keepOpen: false,
    newest: null,
    noProgress: false,
    preflightOnly: false,
    visualContract: true,
    artifactDir: null,
    remoteDebuggingPort: 9234,
    sourcesDir: null,
    useLiveSourceHome: false,
  });

  assert.equal(parseArgs(["--clean"]).clean, true);
  assert.equal(parseArgs(["--affected-since", "abc123"]).affectedSince, "abc123");
  assert.equal(parseArgs(["--jsonl"]).jsonl, true);
  assert.equal(parseArgs(["--preflight-only"]).preflightOnly, true);
  assert.equal(parseArgs(["--no-visual-contract"]).visualContract, false);
  assert.equal(parseArgs(["--artifact-dir", "~/contracts"]).artifactDir, path.join(os.homedir(), "contracts"));
  assert.equal(parseArgs(["--newest", "2"]).newest, 2);
  assert.equal(parseArgs(["--port", "9334"]).remoteDebuggingPort, 9334);
  assert.equal(parseArgs(["--use-live-source-home"]).useLiveSourceHome, true);
  assert.throws(() => parseArgs(["--newest", "0"]), /--newest must be a positive integer/);
  assert.throws(() => parseArgs(["--remote-debugging-port", "0"]), /must be a positive integer/);
  assert.throws(() => parseArgs(["--auto-clean", "--keep-open"]), /cannot be combined/);
  assert.throws(() => parseArgs(["--affected-since", "main", "--preflight-only"]), /cannot be combined/);
  assert.throws(() => parseArgs(["--affected-since", "main", "--clean"]), /cannot be combined/);
  const detailedJsonl = parseArgs(["--json", "--jsonl"]);
  assert.equal(detailedJsonl.json, true);
  assert.equal(detailedJsonl.jsonl, true);
});

test("impact selection keeps additive ports local and orders them newest-first", () => {
  const sources = [
    { version: "26.715.70719", sourceFamily: "chatgpt", supported: true, patchSet: "chatgpt-26.715.70719-5650" },
    { version: "26.715.72359", sourceFamily: "chatgpt", supported: true, patchSet: "chatgpt-26.715.72359-5718" },
    { version: "26.715.61943", sourceFamily: "chatgpt", supported: true, patchSet: "chatgpt-26.715.61943-5628" },
    { version: "26.623.141536", sourceFamily: "codex", supported: true, patchSet: "codex-26.623.141536-4753" },
  ];
  const changes = [
    { status: "A", path: "src/patches/26.715.72359-5718.js", additions: 70, deletions: 0 },
    { status: "A", path: "src/patches/26.715.70719-5650.js", additions: 70, deletions: 0 },
    { status: "M", path: "src/patches/index.js", additions: 4, deletions: 0 },
    { status: "M", path: "src/patches/lib/transform-ownership.js", additions: 12, deletions: 0 },
    { status: "M", path: "tests/patch-selection.test.js", additions: 20, deletions: 2 },
  ];

  const result = selectAffectedSources(sources, classifyImpact(changes));

  assert.equal(result.scope, "new-patches");
  assert.deepEqual(result.selected.map((source) => source.version), ["26.715.72359", "26.715.70719"]);
  assert.deepEqual(result.skipped.map((source) => source.version), ["26.715.61943", "26.623.141536"]);
  assert.match(result.selected[0].impactReason, /new versioned patch/);
});

test("impact selection keeps owner-gated shared transform additions local to new ports", () => {
  const sources = [
    { version: "26.715.72359", sourceFamily: "chatgpt", supported: true, patchSet: "chatgpt-new" },
    { version: "26.715.61943", sourceFamily: "chatgpt", supported: true, patchSet: "chatgpt-old" },
  ];
  const impact = classifyImpact([
    { status: "A", path: "src/patches/26.715.72359-5718.js", additions: 70, deletions: 0 },
    {
      status: "M",
      path: "src/patches/lib/common-patches.js",
      additions: 4,
      deletions: 0,
      patch: [
        "@@ -10,0 +11,4 @@ function patchComposer(text, context = {}) {",
        "+  if (patchSetOwnsTransformVariant(context.patchSetId, \"chatgpt-26.715.72359\")) {",
        "+    const patched = replaceOnce(text, \"old\", \"new\", \"new owner anchor\");",
        "+    return patched;",
        "+  }",
      ].join("\n"),
    },
  ]);

  const result = selectAffectedSources(sources, impact);
  assert.equal(result.scope, "new-patches");
  assert.deepEqual(result.selected.map((source) => source.version), ["26.715.72359"]);
  assert.deepEqual(result.ownerGatedPaths, ["src/patches/lib/common-patches.js"]);
});

test("impact selection adds one newest representative per family for audit harness changes", () => {
  const sources = [
    { version: "26.715.72359", sourceFamily: "chatgpt", supported: true, patchSet: "chatgpt-new" },
    { version: "26.715.61943", sourceFamily: "chatgpt", supported: true, patchSet: "chatgpt-old" },
    { version: "26.623.141536", sourceFamily: "codex", supported: true, patchSet: "codex-new" },
    { version: "26.623.101652", sourceFamily: "codex", supported: true, patchSet: "codex-old" },
  ];
  const impact = classifyImpact([
    { status: "M", path: "scripts/regression-sources.js", additions: 100, deletions: 5 },
    { status: "M", path: "src/core/plugin-audit.js", additions: 4, deletions: 1 },
  ]);

  const result = selectAffectedSources(sources, impact);

  assert.equal(result.scope, "family-representatives");
  assert.deepEqual(result.selected.map((source) => source.version), ["26.715.72359", "26.623.141536"]);
  assert.ok(result.selected.every((source) => /proof harness/.test(source.impactReason)));
});

test("impact selection fails closed for shared, existing-registry, and unknown changes", () => {
  const sources = [
    { version: "2", sourceFamily: "chatgpt", supported: true, patchSet: "chatgpt-2" },
    { version: "1", sourceFamily: "codex", supported: true, patchSet: "codex-1" },
  ];
  for (const changes of [
    [{ status: "M", path: "src/runtime/api/patches.js", additions: 1, deletions: 1 }],
    [{ status: "M", path: "src/patches/lib/hooks/sidebar.js", additions: 1, deletions: 1 }],
    [{ status: "M", path: "src/patches/index.js", additions: 1, deletions: 1 }],
    [{ status: "M", path: "src/patches/lib/common-patches.js", additions: 2, deletions: 0, patch: "@@ -1,0 +2 @@\n+  return changed;" }],
    [{ status: "M", path: "mystery/build-input.js", additions: 1, deletions: 0 }],
  ]) {
    const result = selectAffectedSources(sources, classifyImpact(changes));
    assert.equal(result.scope, "all-supported");
    assert.deepEqual(result.selected.map((source) => source.version), ["2", "1"]);
  }
});

test("git impact collection resolves the base and rejects invalid refs", () => {
  const calls = [];
  const execFileSync = (command, args) => {
    calls.push([command, args]);
    if (args[0] === "rev-parse") return "base-sha\n";
    if (args.includes("--name-status")) return "A\tsrc/patches/26.715.72359-5718.js\nM\tscripts/regression-sources.js\n";
    if (args.includes("--numstat")) return "70\t0\tsrc/patches/26.715.72359-5718.js\n10\t2\tscripts/regression-sources.js\n";
    if (args[0] === "ls-files") return "";
    throw new Error(`unexpected call ${args.join(" ")}`);
  };

  const result = collectGitImpact({ cwd: "/repo", baseRef: "main", execFileSync });

  assert.equal(result.baseSha, "base-sha");
  assert.deepEqual(result.changes, [
    { status: "M", path: "scripts/regression-sources.js", additions: 10, deletions: 2 },
    { status: "A", path: "src/patches/26.715.72359-5718.js", additions: 70, deletions: 0 },
  ]);
  assert.equal(calls[0][0], "git");

  assert.throws(
    () => collectGitImpact({ cwd: "/repo", baseRef: "missing", execFileSync: () => { throw new Error("bad ref"); } }),
    /Cannot resolve --affected-since ref missing/,
  );
});

test("affected live regression writes an impact summary and audits only selected sources", async () => {
  await withTempDir(async (tmpDir) => {
    const sourcesDir = path.join(tmpDir, "sources");
    const chatgptNew = createSourceApp(sourcesDir, "26.715.72359", "ChatGPT.app");
    const chatgptOld = createSourceApp(sourcesDir, "26.715.61943", "ChatGPT.app");
    const codexNew = createSourceApp(sourcesDir, "26.623.141536", "Codex.app");
    const identities = new Map([
      [chatgptNew, familyIdentity("26.715.72359", "5718", "sha-new", "chatgpt")],
      [chatgptOld, familyIdentity("26.715.61943", "5628", "sha-old", "chatgpt")],
      [codexNew, familyIdentity("26.623.141536", "4753", "sha-codex", "codex")],
    ]);
    const audited = [];
    const result = await runRegressionSources(
      {
        affectedSince: "base",
        autoClean: false,
        clean: false,
        filter: null,
        includeNativeOpenProbes: false,
        json: false,
        jsonl: false,
        keepOpen: false,
        newest: null,
        noProgress: true,
        preflightOnly: false,
        visualContract: false,
        artifactDir: null,
        remoteDebuggingPort: 9234,
        sourcesDir,
        useLiveSourceHome: false,
      },
      {
        cwd: tmpDir,
        collectGitImpact: () => ({
          baseRef: "base",
          baseSha: "base-sha",
          changes: [
            { status: "M", path: "scripts/regression-sources.js", additions: 50, deletions: 2 },
            { status: "A", path: "src/patches/26.715.72359-5718.js", additions: 70, deletions: 0 },
          ],
        }),
        getAppIdentity: (appPath) => identities.get(appPath),
        patchSets: [
          { ...patchSet("26.715.72359", "5718", "sha-new", "chatgpt-new"), sourceFamily: "chatgpt" },
          { ...patchSet("26.715.61943", "5628", "sha-old", "chatgpt-old"), sourceFamily: "chatgpt" },
          patchSet("26.623.141536", "4753", "sha-codex", "codex-new"),
        ],
        runAudit: async ({ source }) => {
          audited.push(source);
          return { ok: true, failures: [] };
        },
      },
    );

    assert.equal(result.ok, true);
    assert.deepEqual(result.results.map((entry) => entry.version), ["26.715.72359", "26.623.141536"]);
    assert.deepEqual(audited, [chatgptNew, codexNew]);
    assert.equal(fs.existsSync(result.impactSummary), true);
    const summary = JSON.parse(fs.readFileSync(result.impactSummary, "utf8"));
    assert.equal(summary.baseSha, "base-sha");
    assert.equal(summary.scope, "family-representatives");
    assert.deepEqual(summary.selected.map((entry) => entry.version), ["26.715.72359", "26.623.141536"]);
    assert.deepEqual(summary.skipped.map((entry) => entry.version), ["26.715.61943"]);
  });
});

test("regression sweep stops before the next source when interrupted", async () => {
  await withTempDir(async (tmpDir) => {
    const sourcesDir = path.join(tmpDir, "work", "sources");
    createSourceApp(sourcesDir, "2");
    createSourceApp(sourcesDir, "1");
    const controller = new AbortController();
    const audited = [];

    const result = await runRegressionSources(
      {
        autoClean: false,
        clean: false,
        filter: null,
        includeNativeOpenProbes: false,
        json: false,
        jsonl: true,
        keepOpen: false,
        newest: null,
        noProgress: false,
        preflightOnly: false,
        visualContract: false,
        artifactDir: null,
        remoteDebuggingPort: 9234,
        sourcesDir,
        useLiveSourceHome: false,
      },
      {
        signal: controller.signal,
        getAppIdentity(app) {
          const version = path.basename(path.dirname(app));
          return identity(version, version, `sha-${version}`);
        },
        patchSets: [patchSet("2", "2", "sha-2"), patchSet("1", "1", "sha-1")],
        progress: null,
        async runAudit(args) {
          audited.push(args.source);
          controller.abort();
          return { ok: true, failures: [] };
        },
      },
    );

    assert.equal(result.interrupted, true);
    assert.equal(audited.length, 1);
  });
});

test("interrupt cleanup terminates every process for the active source", () => {
  const killed = [];
  const activeSource = {
    paths: {
      targetApp: "/tmp/regression/ChatGPT Plus.app",
      devHome: "/tmp/regression/codex-home",
      electronUserDataPath: "/tmp/regression/electron-user-data",
    },
  };
  const pids = terminateActiveSource(activeSource, {
    listRunningApps(options) {
      assert.equal(options.targetApp, activeSource.paths.targetApp);
      return [{ pid: 123 }, { pid: 456 }];
    },
    kill(pid, signal) {
      killed.push([pid, signal]);
    },
  });

  assert.deepEqual(pids, [123, 456]);
  assert.deepEqual(killed, [[-123, "SIGTERM"], [-456, "SIGTERM"]]);
});

test("preflight-only validates sources without creating or launching a target app", async () => {
  await withTempDir(async (tmpDir) => {
    const sourcesDir = path.join(tmpDir, "work", "sources");
    const sourceApp = createSourceApp(sourcesDir, "26.623.70822");
    const calls = [];
    const result = await runRegressionSources(
      {
        autoClean: false,
        clean: false,
        filter: null,
        includeNativeOpenProbes: false,
        json: false,
        jsonl: false,
        keepOpen: false,
        newest: null,
        noProgress: true,
        preflightOnly: true,
        visualContract: true,
        artifactDir: null,
        remoteDebuggingPort: 9234,
        sourcesDir,
        useLiveSourceHome: false,
      },
      {
        cwd: tmpDir,
        getAppIdentity: () => identity("26.623.70822", "4559", "sha-a"),
        patchSets: [patchSet("26.623.70822", "4559", "sha-a")],
        preflightPatchSet(options) {
          calls.push(options);
          return { ok: true, transformedFiles: [{ filePath: "webview/index.js" }] };
        },
        runAudit() {
          throw new Error("live audit must not run during preflight");
        },
      },
    );

    assert.equal(result.ok, true);
    assert.equal(result.preflightOnly, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].sourceApp, sourceApp);
    assert.equal(fs.existsSync(pathsForSource(result.regressionDir, result.results[0]).targetApp), false);
    assert.equal(fs.existsSync(result.preflightSummary), true);
  });
});

test("preflight-only stops after the first supported source failure", async () => {
  await withTempDir(async (tmpDir) => {
    const sourcesDir = path.join(tmpDir, "work", "sources");
    const newestApp = createSourceApp(sourcesDir, "26.623.70822");
    const olderApp = createSourceApp(sourcesDir, "26.623.61825");
    const identities = new Map([
      [newestApp, identity("26.623.70822", "4559", "sha-a")],
      [olderApp, identity("26.623.61825", "4548", "sha-b")],
    ]);
    const calls = [];
    const result = await runRegressionSources(
      {
        autoClean: false,
        clean: false,
        filter: null,
        includeNativeOpenProbes: false,
        json: false,
        jsonl: false,
        keepOpen: false,
        newest: null,
        noProgress: true,
        preflightOnly: true,
        visualContract: true,
        artifactDir: null,
        remoteDebuggingPort: 9234,
        sourcesDir,
        useLiveSourceHome: false,
      },
      {
        cwd: tmpDir,
        getAppIdentity: (appPath) => identities.get(appPath),
        patchSets: [
          patchSet("26.623.70822", "4559", "sha-a"),
          patchSet("26.623.61825", "4548", "sha-b"),
        ],
        preflightPatchSet({ patchSet: selected }) {
          calls.push(selected.id);
          throw new Error("Expected one newest anchor, found 0");
        },
      },
    );

    assert.equal(result.ok, false);
    assert.equal(calls.length, 1);
    assert.equal(result.results.length, 1);
    assert.match(result.results[0].failures[0].message, /newest anchor/);
  });
});

test("regression sources sorts newest-first and limits newest versions numerically", async () => {
  await withTempDir(async (tmpDir) => {
    const sourcesDir = path.join(tmpDir, "sources");
    const olderApp = createSourceApp(sourcesDir, "26.623.61825");
    const newerApp = createSourceApp(sourcesDir, "26.623.70822");
    const midApp = createSourceApp(sourcesDir, "26.623.42026");
    const identities = new Map([
      [olderApp, identity("26.623.61825", "4548", "sha-a")],
      [newerApp, identity("26.623.70822", "4559", "sha-b")],
      [midApp, identity("26.623.42026", "4514", "sha-c")],
    ]);
    const operations = {
      getAppIdentity: (appPath) => identities.get(appPath),
      patchSets: [
        patchSet("26.623.61825", "4548", "sha-a"),
        patchSet("26.623.70822", "4559", "sha-b"),
        patchSet("26.623.42026", "4514", "sha-c"),
      ],
    };

    assert.equal(compareVersionStrings("26.623.70822", "26.623.61825") > 0, true);
    assert.deepEqual(
      discoverSources({ sourcesDir, filter: "26.623", operations }).map((source) => source.version),
      ["26.623.70822", "26.623.61825", "26.623.42026"],
    );
    assert.deepEqual(
      discoverSources({ sourcesDir, filter: "26.623", newest: 2, operations }).map((source) => source.version),
      ["26.623.70822", "26.623.61825"],
    );
  });
});

test("regression sources discovers source apps in stable order", async () => {
  await withTempDir(async (tmpDir) => {
    const sourcesDir = path.join(tmpDir, "sources");
    const older = createSourceApp(sourcesDir, "26.623.41415");
    const newer = createSourceApp(sourcesDir, "26.623.70822");

    assert.deepEqual(listSourceApps(sourcesDir), [older, newer]);
  });
});

test("regression sources discovers mixed ChatGPT and Codex source apps", async () => {
  await withTempDir(async (tmpDir) => {
    const sourcesDir = path.join(tmpDir, "sources");
    const chatgpt = createSourceApp(sourcesDir, "26.707.31428", "ChatGPT.app");
    const codex = createSourceApp(sourcesDir, "26.623.70822", "Codex.app");
    const identities = new Map([
      [chatgpt, familyIdentity("26.707.31428", "5059", "sha-chatgpt", "chatgpt")],
      [codex, familyIdentity("26.623.70822", "4559", "sha-codex", "codex")],
    ]);
    const operations = {
      getAppIdentity: (appPath) => identities.get(appPath),
      patchSets: [
        { ...patchSet("26.707.31428", "5059", "sha-chatgpt", "chatgpt-current"), sourceFamily: "chatgpt" },
        patchSet("26.623.70822", "4559", "sha-codex", "codex-current"),
      ],
    };

    assert.deepEqual(listSourceApps(sourcesDir), [codex, chatgpt]);
    assert.deepEqual(
      discoverSources({ sourcesDir, operations }).map((source) => [source.version, source.sourceFamily, source.patchSet]),
      [
        ["26.707.31428", "chatgpt", "chatgpt-current"],
        ["26.623.70822", "codex", "codex-current"],
      ],
    );
    assert.deepEqual(
      discoverSources({ sourcesDir, filter: "chatgpt", operations }).map((source) => source.sourceApp),
      [chatgpt],
    );
  });
});

test("regression sources matches supported sources exactly and skips unsupported", async () => {
  await withTempDir(async (tmpDir) => {
    const sourcesDir = path.join(tmpDir, "sources");
    const supportedApp = createSourceApp(sourcesDir, "26.623.70822");
    const unsupportedApp = createSourceApp(sourcesDir, "26.623.61825");
    const identities = new Map([
      [supportedApp, identity("26.623.70822", "4559", "sha-a")],
      [unsupportedApp, identity("26.623.61825", "4548", "sha-b")],
    ]);

    const sources = discoverSources({
      sourcesDir,
      operations: {
        getAppIdentity: (appPath) => identities.get(appPath),
        patchSets: [patchSet("26.623.70822", "4559", "sha-a", "codex-current")],
      },
    });

    assert.equal(sources.length, 2);
    assert.deepEqual(
      sources.map((source) => [source.version, source.supported, source.patchSet]),
      [
        ["26.623.70822", true, "codex-current"],
        ["26.623.61825", false, null],
      ],
    );
  });
});

test("regression sources filter matches version, path, and patch id", async () => {
  await withTempDir(async (tmpDir) => {
    const sourcesDir = path.join(tmpDir, "sources");
    const firstApp = createSourceApp(sourcesDir, "26.623.70822");
    const secondApp = createSourceApp(sourcesDir, "26.623.61825");
    const identities = new Map([
      [firstApp, identity("26.623.70822", "4559", "sha-a")],
      [secondApp, identity("26.623.61825", "4548", "sha-b")],
    ]);
    const operations = {
      getAppIdentity: (appPath) => identities.get(appPath),
      patchSets: [
        patchSet("26.623.70822", "4559", "sha-a", "codex-current"),
        patchSet("26.623.61825", "4548", "sha-b", "codex-previous"),
      ],
    };

    assert.deepEqual(discoverSources({ sourcesDir, filter: "61825", operations }).map((source) => source.version), ["26.623.61825"]);
    assert.deepEqual(discoverSources({ sourcesDir, filter: "CURRENT", operations }).map((source) => source.version), ["26.623.70822"]);
    assert.deepEqual(discoverSources({ sourcesDir, filter: "sources/26.623.61825", operations }).map((source) => source.version), ["26.623.61825"]);
  });
});

test("regression sources builds isolated paths for each version", () => {
  assert.equal(
    defaultRegressionDirForSources("/main/work/sources", { cwd: "/worktree" }),
    "/worktree/work/regression/sources",
  );
  assert.deepEqual(pathsForSource("/worktree/work/regression/sources", "26.623.70822"), {
    root: "/worktree/work/regression/sources/26.623.70822",
    targetApp: "/worktree/work/regression/sources/26.623.70822/Codex Plus.app",
    devHome: "/worktree/work/regression/sources/26.623.70822/codex-home",
    electronUserDataPath: "/worktree/work/regression/sources/26.623.70822/electron-user-data",
  });
  assert.deepEqual(pathsForSource("/worktree/work/regression/sources", {
    version: "26.707.31428",
    sourceFamily: "chatgpt",
  }), {
    root: "/worktree/work/regression/sources/26.707.31428",
    targetApp: "/worktree/work/regression/sources/26.707.31428/ChatGPT Plus.app",
    devHome: "/worktree/work/regression/sources/26.707.31428/codex-home",
    electronUserDataPath: "/worktree/work/regression/sources/26.707.31428/electron-user-data",
  });
});

test("regression sources runs newest-first and stops after the first failure", async () => {
  await withTempDir(async (tmpDir) => {
    const sourcesDir = path.join(tmpDir, "work", "sources");
    const firstApp = createSourceApp(sourcesDir, "26.623.70822");
    const secondApp = createSourceApp(sourcesDir, "26.623.61825");
    const thirdApp = createSourceApp(sourcesDir, "26.623.42026");
    const calls = [];
    const identities = new Map([
      [firstApp, identity("26.623.70822", "4559", "sha-a")],
      [secondApp, identity("26.623.61825", "4548", "sha-b")],
      [thirdApp, identity("26.623.42026", "4514", "sha-c")],
    ]);

    const result = await runRegressionSources(
      {
        autoClean: false,
        clean: false,
        filter: null,
        includeNativeOpenProbes: true,
        json: true,
        jsonl: false,
        keepOpen: false,
        newest: null,
        noProgress: true,
        visualContract: true,
        artifactDir: null,
        remoteDebuggingPort: 9400,
        sourcesDir,
      },
      {
        cwd: tmpDir,
        findFreePort: async (port) => port + 10,
        getAppIdentity: (appPath) => identities.get(appPath),
        patchSets: [
          patchSet("26.623.70822", "4559", "sha-a"),
          patchSet("26.623.61825", "4548", "sha-b"),
          patchSet("26.623.42026", "4514", "sha-c"),
        ],
        runAudit: async (args) => {
          calls.push(args);
          return args.source === firstApp
            ? { ok: true, failures: [] }
            : { ok: false, failures: [{ plugin: "audit", message: "boom" }] };
        },
      },
    );

    assert.equal(result.ok, false);
    assert.deepEqual(result.results.map((entry) => [entry.version, entry.ok]), [
      ["26.623.70822", true],
      ["26.623.61825", false],
    ]);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].target, path.join(tmpDir, "work", "regression", "sources", "26.623.70822", "Codex Plus.app"));
    assert.equal(calls[0].devHome, path.join(tmpDir, "work", "regression", "sources", "26.623.70822", "codex-home"));
    assert.equal(calls[0].electronUserDataPath, path.join(tmpDir, "work", "regression", "sources", "26.623.70822", "electron-user-data"));
    assert.equal(calls[0].remoteDebuggingPort, 9410);
    assert.equal(calls[1].remoteDebuggingPort, 9411);
    assert.equal(calls[0].devInstanceId, "reg-2662370822");
    assert.ok(calls[0].devInstanceId.length <= 24);
    assert.equal(calls[0].includeNativeOpenProbes, true);
    assert.equal(calls[0].useLiveSourceHome, false);
    assert.equal(calls[0].visualContract, true);
    assert.match(calls[0].artifactDir, /work\/regression\/contracts\/.*\/26\.623\.70822$/);
  });
});

test("regression sources passes prefixed progress into audits", async () => {
  await withTempDir(async (tmpDir) => {
    const sourcesDir = path.join(tmpDir, "work", "sources");
    createSourceApp(sourcesDir, "26.623.70822");
    const events = [];
    const progress = {
      start: (text) => events.push(["start", text]),
      succeed: (text) => events.push(["succeed", text]),
      fail: (text) => events.push(["fail", text]),
      item: (itemType, item) => events.push(["item", `${itemType}: ${item}`]),
    };

    const result = await runRegressionSources(
      {
        autoClean: false,
        clean: false,
        filter: null,
        includeNativeOpenProbes: false,
        json: false,
        jsonl: false,
        keepOpen: false,
        newest: null,
        noProgress: false,
        visualContract: true,
        artifactDir: null,
        remoteDebuggingPort: 9234,
        sourcesDir,
      },
      {
        cwd: tmpDir,
        getAppIdentity: () => identity("26.623.70822", "4559", "sha-a"),
        patchSets: [patchSet("26.623.70822", "4559", "sha-a")],
        progress,
        runAudit: async (_args, options) => {
          options.progress({ status: "start", step: 1, total: 2, label: "Applying patch set" });
          options.progress.item("patch", "identity");
          options.progress({ status: "succeed", step: 1, total: 2, label: "Applied patch set" });
          return { ok: true, failures: [] };
        },
      },
    );

    assert.equal(result.ok, true);
    assert.deepEqual(events, [
      ["start", "[1/1 26.623.70822] Running regression audit with codex-26.623.70822-4559"],
      ["start", "[1/1 26.623.70822] [1/2] Applying patch set"],
      ["item", "patch: identity"],
      ["succeed", "[1/1 26.623.70822] [1/2] Applied patch set"],
      ["succeed", "[1/1 26.623.70822] Regression audit passed"],
    ]);
  });
});

test("regression sources auto-cleans generated version output", async () => {
  await withTempDir(async (tmpDir) => {
    const sourcesDir = path.join(tmpDir, "work", "sources");
    const sourceApp = createSourceApp(sourcesDir, "26.623.70822");
    const regressionRoot = path.join(tmpDir, "work", "regression", "sources", "26.623.70822");
    const contractFile = path.join(tmpDir, "work", "regression", "contracts", "fixed", "26.623.70822", "contract.json");

    const result = await runRegressionSources(
      {
        autoClean: true,
        clean: false,
        filter: null,
        includeNativeOpenProbes: false,
        json: false,
        jsonl: false,
        keepOpen: false,
        newest: null,
        noProgress: true,
        visualContract: true,
        artifactDir: path.join(tmpDir, "work", "regression", "contracts", "fixed"),
        remoteDebuggingPort: 9234,
        sourcesDir,
      },
      {
        cwd: tmpDir,
        getAppIdentity: () => identity("26.623.70822", "4559", "sha-a"),
        patchSets: [patchSet("26.623.70822", "4559", "sha-a")],
        runAudit: async (args) => {
          fs.mkdirSync(regressionRoot, { recursive: true });
          fs.writeFileSync(path.join(regressionRoot, "marker"), "generated");
          fs.mkdirSync(args.artifactDir, { recursive: true });
          fs.writeFileSync(contractFile, "{}\n");
          return { ok: true, failures: [], visualContract: { ok: true, artifactDir: args.artifactDir } };
        },
      },
    );

    assert.equal(result.ok, true);
    assert.equal(result.results[0].sourceApp, sourceApp);
    assert.equal(result.results[0].cleaned, true);
    assert.equal(result.results[0].artifactDir, path.dirname(contractFile));
    assert.equal(fs.existsSync(regressionRoot), false);
    assert.equal(fs.existsSync(contractFile), true);
    assert.equal(fs.existsSync(sourceApp), true);
  });
});

test("regression source cleanup retries transient non-empty directories", () => {
  const regressionDir = path.join(path.sep, "tmp", "regression", "sources");
  const target = path.join(regressionDir, "26.623.31921");
  const calls = [];
  cleanRegressionDir(target, regressionDir, {
    fsImpl: {
      rmSync(actualTarget, options) {
        calls.push([actualTarget, options]);
      },
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], target);
  assert.deepEqual(calls[0][1], { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("regression sources jsonl progress carries source identity", async () => {
  await withTempDir(async (tmpDir) => {
    const sourcesDir = path.join(tmpDir, "work", "sources");
    const sourceApp = createSourceApp(sourcesDir, "26.623.70822");
    const writes = [];
    const stream = { write: (text) => writes.push(text) };

    const result = await runRegressionSources(
      {
        autoClean: false,
        clean: false,
        filter: null,
        includeNativeOpenProbes: false,
        json: false,
        jsonl: true,
        keepOpen: false,
        newest: null,
        noProgress: false,
        visualContract: true,
        artifactDir: path.join(tmpDir, "contracts"),
        remoteDebuggingPort: 9234,
        sourcesDir,
      },
      {
        cwd: tmpDir,
        getAppIdentity: () => identity("26.623.70822", "4559", "sha-a"),
        patchSets: [patchSet("26.623.70822", "4559", "sha-a")],
        progressOptions: { stream, now: () => new Date("2026-07-07T00:00:00.000Z") },
        createJsonlProgress: (options) => require("../src/core/plugin-audit").createJsonlProgress(options),
        runAudit: async (_args, options) => {
          options.progress.start("Applying patch set");
          options.progress.succeed("Applied patch set");
          return { ok: true, failures: [], visualContract: { ok: true, artifactDir: _args.artifactDir } };
        },
      },
    );

    assert.equal(result.ok, true);
    const records = writes.join("").trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(records.some((record) => record.version === "26.623.70822" && record.sourceApp === sourceApp), true);
    assert.equal(records.some((record) => record.type === "visual_contract" && record.artifactDir.endsWith("26.623.70822")), true);
  });
});

test("regression sources jsonl progress includes the first audit failure", async () => {
  await withTempDir(async (tmpDir) => {
    const sourcesDir = path.join(tmpDir, "work", "sources");
    createSourceApp(sourcesDir, "26.623.70822");
    const writes = [];
    const stream = { write: (text) => writes.push(text) };

    const result = await runRegressionSources(
      {
        autoClean: false,
        clean: false,
        filter: null,
        includeNativeOpenProbes: false,
        json: false,
        jsonl: true,
        keepOpen: false,
        newest: null,
        noProgress: false,
        visualContract: false,
        artifactDir: null,
        remoteDebuggingPort: 9234,
        sourcesDir,
      },
      {
        cwd: tmpDir,
        getAppIdentity: () => identity("26.623.70822", "4559", "sha-a"),
        patchSets: [patchSet("26.623.70822", "4559", "sha-a")],
        progressOptions: { stream, now: () => new Date("2026-07-07T00:00:00.000Z") },
        createJsonlProgress: (options) => require("../src/core/plugin-audit").createJsonlProgress(options),
        runAudit: async () => ({ ok: false, failures: [{ plugin: "aharnessRuns", message: "precise failure" }] }),
      },
    );

    assert.equal(result.ok, false);
    const records = writes.join("").trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(records.some((record) => record.status === "fail" && record.message.includes("aharnessRuns: precise failure")), true);
  });
});

test("regression sources cleanup removes generated dirs only and supports filters", async () => {
  await withTempDir(async (tmpDir) => {
    const sourcesDir = path.join(tmpDir, "work", "sources");
    const regressionDir = defaultRegressionDirForSources(sourcesDir, { cwd: tmpDir });
    const keepDir = path.join(regressionDir, "26.623.70822");
    const cleanDir = path.join(regressionDir, "26.623.61825");
    fs.mkdirSync(keepDir, { recursive: true });
    fs.mkdirSync(cleanDir, { recursive: true });
    createSourceApp(sourcesDir, "26.623.61825");
    const progressEvents = [];

    const result = await runRegressionSources(
      {
        autoClean: false,
        clean: true,
        filter: "61825",
        includeNativeOpenProbes: false,
        json: false,
        keepOpen: false,
        newest: null,
        noProgress: true,
        remoteDebuggingPort: 9234,
        sourcesDir,
      },
      {
        cwd: tmpDir,
        progress: {
          start(message) { progressEvents.push(["start", message]); },
          succeed(message) { progressEvents.push(["succeed", message]); },
          close() { progressEvents.push(["close"]); },
        },
        getAppIdentity: () => identity("26.623.61825", "4548", "sha-b"),
        patchSets: [patchSet("26.623.61825", "4548", "sha-b", "codex-previous")],
      },
    );

    assert.equal(result.ok, true);
    assert.deepEqual(result.results.map((entry) => entry.version), ["26.623.61825"]);
    assert.equal(fs.existsSync(cleanDir), false);
    assert.equal(fs.existsSync(keepDir), true);
    assert.deepEqual(progressEvents, [
      ["start", "Cleaning generated regression sources"],
      ["succeed", "Cleaned 1 generated regression source"],
      ["close"],
    ]);
    assert.throws(() => cleanRegressionDir(sourcesDir, regressionDir), /Refusing to clean outside regression directory/);
  });
});

test("regression sources standalone cleanup can remove all generated dirs", async () => {
  await withTempDir(async (tmpDir) => {
    const regressionDir = path.join(tmpDir, "work", "regression", "sources");
    const firstDir = path.join(regressionDir, "26.623.70822");
    const secondDir = path.join(regressionDir, "26.623.61825");
    fs.mkdirSync(firstDir, { recursive: true });
    fs.mkdirSync(secondDir, { recursive: true });

    const results = cleanRegressionSources({ regressionDir });

    assert.deepEqual(results.map((entry) => entry.version), ["26.623.70822", "26.623.61825"]);
    assert.equal(fs.existsSync(firstDir), false);
    assert.equal(fs.existsSync(secondDir), false);
  });
});

test("regression sources standalone cleanup can remove newest generated dirs", async () => {
  await withTempDir(async (tmpDir) => {
    const regressionDir = path.join(tmpDir, "work", "regression", "sources");
    const olderDir = path.join(regressionDir, "26.623.61825");
    const newerDir = path.join(regressionDir, "26.623.70822");
    fs.mkdirSync(olderDir, { recursive: true });
    fs.mkdirSync(newerDir, { recursive: true });

    const results = cleanRegressionSources({ regressionDir, newest: 1 });

    assert.deepEqual(results.map((entry) => entry.version), ["26.623.70822"]);
    assert.equal(fs.existsSync(newerDir), false);
    assert.equal(fs.existsSync(olderDir), true);
  });
});

test("regression sources formats json-shaped result data", async () => {
  await withTempDir(async (tmpDir) => {
    const sourcesDir = path.join(tmpDir, "work", "sources");
    const sourceApp = createSourceApp(sourcesDir, "26.623.70822");

    const result = await runRegressionSources(
      {
        autoClean: false,
        clean: false,
        filter: "70822",
        includeNativeOpenProbes: false,
        json: true,
        keepOpen: false,
        newest: 1,
        noProgress: true,
        remoteDebuggingPort: 9234,
        sourcesDir,
      },
      {
        cwd: tmpDir,
        getAppIdentity: () => identity("26.623.70822", "4559", "sha-a"),
        patchSets: [patchSet("26.623.70822", "4559", "sha-a")],
        runAudit: async () => ({
          ok: true,
          failures: [],
          pluginResults: {
            nestedRepositories: {
              ok: true,
              reviewPanel: { ok: true, nestedBranchPickerPopulated: true },
            },
          },
        }),
      },
    );

    assert.equal(result.sourcesDir, sourcesDir);
    assert.equal(result.regressionDir, path.join(tmpDir, "work", "regression", "sources"));
    assert.equal(result.filter, "70822");
    assert.equal(result.newest, 1);
    assert.equal(result.autoClean, false);
    assert.equal(result.results[0].sourceApp, sourceApp);
    assert.equal(result.results[0].targetApp, path.join(tmpDir, "work", "regression", "sources", "26.623.70822", "Codex Plus.app"));
    assert.equal(result.results[0].audit.pluginResults.nestedRepositories.reviewPanel.nestedBranchPickerPopulated, true);
    assert.match(formatHumanResult(result), /Summary: 1\/1 supported passed, 0 failed, 0 skipped\./);
  });
});
