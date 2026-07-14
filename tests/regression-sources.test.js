const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  cleanRegressionDir,
  cleanRegressionSources,
  compareVersionStrings,
  defaultRegressionDirForSources,
  discoverSources,
  formatHumanResult,
  listSourceApps,
  parseArgs,
  pathsForSource,
  runRegressionSources,
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
    visualContract: true,
    artifactDir: null,
    remoteDebuggingPort: 9234,
    sourcesDir: null,
    useLiveSourceHome: false,
  });

  assert.equal(parseArgs(["--clean"]).clean, true);
  assert.equal(parseArgs(["--jsonl"]).jsonl, true);
  assert.equal(parseArgs(["--no-visual-contract"]).visualContract, false);
  assert.equal(parseArgs(["--artifact-dir", "~/contracts"]).artifactDir, path.join(os.homedir(), "contracts"));
  assert.equal(parseArgs(["--newest", "2"]).newest, 2);
  assert.equal(parseArgs(["--port", "9334"]).remoteDebuggingPort, 9334);
  assert.equal(parseArgs(["--use-live-source-home"]).useLiveSourceHome, true);
  assert.throws(() => parseArgs(["--newest", "0"]), /--newest must be a positive integer/);
  assert.throws(() => parseArgs(["--remote-debugging-port", "0"]), /must be a positive integer/);
  assert.throws(() => parseArgs(["--auto-clean", "--keep-open"]), /cannot be combined/);
  const detailedJsonl = parseArgs(["--json", "--jsonl"]);
  assert.equal(detailedJsonl.json, true);
  assert.equal(detailedJsonl.jsonl, true);
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

test("regression sources runs supported sources and continues after failures", async () => {
  await withTempDir(async (tmpDir) => {
    const sourcesDir = path.join(tmpDir, "work", "sources");
    const firstApp = createSourceApp(sourcesDir, "26.623.70822");
    const secondApp = createSourceApp(sourcesDir, "26.623.61825");
    const calls = [];
    const identities = new Map([
      [firstApp, identity("26.623.70822", "4559", "sha-a")],
      [secondApp, identity("26.623.61825", "4548", "sha-b")],
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

test("regression sources cleanup removes generated dirs only and supports filters", async () => {
  await withTempDir(async (tmpDir) => {
    const sourcesDir = path.join(tmpDir, "work", "sources");
    const regressionDir = defaultRegressionDirForSources(sourcesDir, { cwd: tmpDir });
    const keepDir = path.join(regressionDir, "26.623.70822");
    const cleanDir = path.join(regressionDir, "26.623.61825");
    fs.mkdirSync(keepDir, { recursive: true });
    fs.mkdirSync(cleanDir, { recursive: true });
    createSourceApp(sourcesDir, "26.623.61825");

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
        getAppIdentity: () => identity("26.623.61825", "4548", "sha-b"),
        patchSets: [patchSet("26.623.61825", "4548", "sha-b", "codex-previous")],
      },
    );

    assert.equal(result.ok, true);
    assert.deepEqual(result.results.map((entry) => entry.version), ["26.623.61825"]);
    assert.equal(fs.existsSync(cleanDir), false);
    assert.equal(fs.existsSync(keepDir), true);
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
