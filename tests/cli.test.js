const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const packageJson = require("../package.json");

const {
  createApplyProgress,
  createAuditProgress,
  expandPath,
  formatAsarCatResult,
  formatAsarListResult,
  formatAuditJson,
  formatAuditResult,
  formatError,
  formatLaunchDevResult,
  formatMenuDiagnosticsResult,
  formatResult,
  formatSyncDevHomeResult,
  helpText,
  listAsarFiles,
  launchDevApp,
  menuDiagnostics,
  parseArgs,
  readAsarFile,
  shouldShowApplyProgress,
  syncDevHome,
} = require("../src/cli");
const {
  auditPreflight,
  auditIdentity,
  checkKeepOpenAppStability,
  cleanupLaunchedAuditApp,
  formatAuditJson: formatCoreAuditJson,
  listCrashpadPendingDumps,
  listRunningAuditApps,
  pluginAuditExpression,
  runAudit,
  waitForAppShellMounted,
} = require("../src/core/plugin-audit");

test("empty invocation shows help", () => {
  assert.equal(parseArgs([]).command, "help");
});

test("help documents codex-plus-patcher as the only command", () => {
  const output = helpText();

  assert.match(output, /codex-plus-patcher apply/);
  assert.match(output, /codex-plus-patcher audit-plugins/);
  assert.match(output, /codex-plus-patcher dev-sync/);
  assert.match(output, /codex-plus-patcher launch-dev/);
  assert.match(output, /codex-plus-patcher menu-diagnostics/);
  assert.match(output, /codex-plus-patcher asar-list/);
  assert.match(output, /codex-plus-patcher asar-cat/);
  assert.doesNotMatch(output, /codex-plus apply/);
});

test("apply uses simple production defaults", () => {
  const args = parseArgs(["apply"]);

  assert.equal(args.command, "apply");
  assert.equal(args.source, "/Applications/Codex.app");
  assert.equal(args.target, path.join(os.homedir(), "Applications", "Codex Plus.app"));
  assert.equal(args.mode, "builtin");
  assert.equal(args.dryRun, false);
});

test("flags imply apply and can request json output", () => {
  const args = parseArgs(["--dry-run", "--json", "--debug"]);

  assert.equal(args.command, "apply");
  assert.equal(args.dryRun, true);
  assert.equal(args.json, true);
  assert.equal(args.debug, true);
});

test("target and patch directory expand home paths", () => {
  const args = parseArgs(["apply", "--target", "~/tmp/Codex Plus.app", "--patch-dir", "~/patches"]);

  assert.equal(args.target, path.join(os.homedir(), "tmp", "Codex Plus.app"));
  assert.equal(args.patchDir, path.join(os.homedir(), "patches"));
});

test("asar commands parse readback flags", () => {
  const listArgs = parseArgs(["asar-list", "--asar", "~/tmp/app.asar", "--contains", "codex-plus", "--json"]);
  assert.equal(listArgs.command, "asar-list");
  assert.equal(listArgs.asar, path.join(os.homedir(), "tmp", "app.asar"));
  assert.equal(listArgs.contains, "codex-plus");
  assert.equal(listArgs.json, true);

  const catArgs = parseArgs(["asar-cat", "--asar", "~/tmp/app.asar", "--file", "webview/assets/codex-plus/runtime.js"]);
  assert.equal(catArgs.command, "asar-cat");
  assert.equal(catArgs.asar, path.join(os.homedir(), "tmp", "app.asar"));
  assert.equal(catArgs.file, "webview/assets/codex-plus/runtime.js");

  const diagnosticsArgs = parseArgs(["menu-diagnostics", "--asar", "~/tmp/app.asar", "--json"]);
  assert.equal(diagnosticsArgs.command, "menu-diagnostics");
  assert.equal(diagnosticsArgs.asar, path.join(os.homedir(), "tmp", "app.asar"));
  assert.equal(diagnosticsArgs.json, true);
});

test("dev mode commands parse isolated state flags", () => {
  const syncArgs = parseArgs(["dev-sync", "--source-home", "~/real-codex", "--dev-home", "~/dev-codex", "--json"]);
  assert.equal(syncArgs.command, "dev-sync");
  assert.equal(syncArgs.sourceHome, path.join(os.homedir(), "real-codex"));
  assert.equal(syncArgs.devHome, path.join(os.homedir(), "dev-codex"));
  assert.equal(syncArgs.json, true);

  const launchArgs = parseArgs([
    "launch-dev",
    "--target",
    "~/tmp/Codex Plus.app",
    "--dev-home",
    "~/dev-codex",
    "--electron-user-data",
    "~/dev-electron",
    "--dev-instance-id",
    "manual-check",
    "--remote-debugging-port",
    "9234",
  ]);
  assert.equal(launchArgs.command, "launch-dev");
  assert.equal(launchArgs.target, path.join(os.homedir(), "tmp", "Codex Plus.app"));
  assert.equal(launchArgs.devHome, path.join(os.homedir(), "dev-codex"));
  assert.equal(launchArgs.electronUserDataPath, path.join(os.homedir(), "dev-electron"));
  assert.equal(launchArgs.devInstanceId, "manual-check");
  assert.equal(launchArgs.remoteDebuggingPort, "9234");
});

test("audit-plugins parses output, launch, and path flags", () => {
  const args = parseArgs([
    "audit-plugins",
    "--json",
    "--quiet",
    "--no-progress",
    "--keep-open",
    "--include-native-open-probes",
    "--no-apply",
    "--no-launch",
    "--source",
    "~/Codex.app",
    "--target",
    "~/audit/Codex Plus.app",
    "--source-home",
    "~/real-codex",
    "--dev-home",
    "~/dev-codex",
    "--electron-user-data",
    "~/dev-electron",
    "--dev-instance-id",
    "manual-audit",
    "--remote-debugging-port",
    "9240",
  ]);

  assert.equal(args.command, "audit-plugins");
  assert.equal(args.json, true);
  assert.equal(args.quiet, true);
  assert.equal(args.noProgress, true);
  assert.equal(args.keepOpen, true);
  assert.equal(args.includeNativeOpenProbes, true);
  assert.equal(args.apply, false);
  assert.equal(args.launch, false);
  assert.equal(args.source, path.join(os.homedir(), "Codex.app"));
  assert.equal(args.target, path.join(os.homedir(), "audit/Codex Plus.app"));
  assert.equal(args.sourceHome, path.join(os.homedir(), "real-codex"));
  assert.equal(args.devHome, path.join(os.homedir(), "dev-codex"));
  assert.equal(args.electronUserDataPath, path.join(os.homedir(), "dev-electron"));
  assert.equal(args.devInstanceId, "manual-audit");
  assert.equal(args.remoteDebuggingPort, 9240);

  const defaults = parseArgs(["audit-plugins"]);
  assert.equal(defaults.target, path.resolve("work/Codex Plus.app"));
  assert.equal(defaults.remoteDebuggingPort, 9234);
  assert.equal(defaults.includeNativeOpenProbes, false);
  assert.equal(defaults.devInstanceId, "audit");
});

test("formatResult prints a concise open command for created apps", () => {
  const output = formatResult({
    sourceApp: "/Applications/Codex.app",
    targetApp: "/Users/example/Applications/Codex Plus.app",
    patchSet: "codex-example",
    patches: ["bundle-identity"],
    addedFiles: ["webview/assets/codex-plus/runtime.js"],
    patchedAsarSha: "abc123",
    dryRun: false,
  });

  assert.match(output, /Codex Plus app created\./);
  assert.match(output, /Open: open "\/Users\/example\/Applications\/Codex Plus\.app"/);
  assert.doesNotMatch(output, /Added files:/);
});

function sampleAuditResult(overrides = {}) {
  return {
    ok: true,
    failures: [],
    expectedWarnings: [],
    pluginResults: {
      aboutMetadata: { ok: true },
      devTools: { ok: true },
    },
    target: {
      app: "/repo/work/Codex Plus.app",
      remoteDebuggingPort: 9234,
      url: "app://-/index.html",
      pid: 123,
    },
    devHome: "/repo/work/codex-plus-dev-home",
    applyResult: {
      sourceApp: "/Applications/Codex.app",
      targetApp: "/repo/work/Codex Plus.app",
      patchSet: "codex-26.623.41415-4505",
      patches: ["bundle-identity", "project-colors"],
    },
    registeredPlugins: ["aboutMetadata", "devTools"],
    startedPlugins: ["aboutMetadata", "devTools"],
    runtimeStatus: {
      registered: 2,
      started: 2,
    },
    appShellStatus: {
      readyState: "complete",
      hasRoot: true,
      hasStartupLoader: false,
      bodyTextLength: 42,
      elementCount: 100,
      interactiveCount: 5,
      sampleText: "New chat",
    },
    cleanupResult: {
      attempted: true,
      keptOpen: false,
      ok: true,
      pid: 123,
    },
    nativeOpenProbes: {
      included: false,
    },
    ...overrides,
  };
}

test("audit human formatter prints success summary", () => {
  const output = formatAuditResult(sampleAuditResult());

  assert.match(output, /Audit Codex Plus plugins/);
  assert.match(output, /Source: \/Applications\/Codex\.app/);
  assert.match(output, /Target: \/repo\/work\/Codex Plus\.app/);
  assert.match(output, /Patch set: codex-26\.623\.41415-4505/);
  assert.match(output, /Port: 9234/);
  assert.match(output, /Runtime ready: 2 registered, 2 started/);
  assert.match(output, /App shell: mounted/);
  assert.match(output, /Probed 2 plugins/);
  assert.match(output, /Warnings: 0 expected/);
  assert.match(output, /Native open probes: skipped/);
  assert.match(output, /Cleanup: cleaned up/);
  assert.match(output, /All plugin probes passed\./);
});

test("audit human formatter prints success summary with expected warnings", () => {
  const output = formatAuditResult(sampleAuditResult({
    expectedWarnings: [{
      plugin: "audit",
      code: "composer-permission-picker-disabled",
      message: "Composer permissions picker is disabled while the composer is editable",
      details: { triggerText: "Full access" },
    }],
  }));

  assert.match(output, /Warnings: 1 expected/);
  assert.match(output, /All plugin probes passed\./);
  assert.match(output, /Expected warnings:/);
  assert.match(output, /audit composer-permission-picker-disabled: Composer permissions picker is disabled while the composer is editable/);
  assert.doesNotMatch(output, /Plugin audit failed/);
});

test("audit human formatter prints failure summary with failed plugins and patches", () => {
  const output = formatAuditResult(sampleAuditResult({
    ok: false,
    failures: [
      { plugin: "nestedRepositories", message: "Review body was not wrapped", patch: "multi-repository-review" },
      { plugin: "mermaidFullscreen", message: "Mermaid diagram marker is missing", details: { patchId: "mermaid-fullscreen-viewer" } },
    ],
  }));

  assert.match(output, /Plugin audit failed: 2 failures/);
  assert.match(output, /Failed plugins: nestedRepositories, mermaidFullscreen/);
  assert.match(output, /Failed patches: multi-repository-review, mermaid-fullscreen-viewer/);
  assert.match(output, /nestedRepositories\n  Review body was not wrapped\n  patch: multi-repository-review/);
  assert.match(output, /mermaidFullscreen\n  Mermaid diagram marker is missing\n  patch: mermaid-fullscreen-viewer/);
  assert.match(output, /Re-run with --json for full probe details\./);
});

test("audit human formatter prints live audit app rerun guidance", () => {
  const output = formatAuditResult(sampleAuditResult({
    ok: false,
    failures: [{
      plugin: "audit",
      message: "Codex Plus audit app is already running on port 9234; close it before applying patches, or rerun codex-plus-patcher audit-plugins --no-apply --no-launch --keep-open --port 9234",
      details: {
        livePort: 9234,
        suggestedCommand: "codex-plus-patcher audit-plugins --no-apply --no-launch --keep-open --port 9234",
      },
    }],
  }));

  assert.match(output, /Plugin audit failed: 1 failures/);
  assert.match(output, /live port: 9234/);
  assert.match(output, /suggested command: codex-plus-patcher audit-plugins --no-apply --no-launch --keep-open --port 9234/);
});

test("audit quiet formatter prints minimal output", () => {
  assert.equal(formatAuditResult(sampleAuditResult(), { quiet: true }), "All plugin probes passed.\n");
  assert.equal(
    formatAuditResult(sampleAuditResult({ expectedWarnings: [{ plugin: "audit", code: "x", message: "warning" }] }), { quiet: true }),
    "All plugin probes passed with expected warnings.\n",
  );
  assert.equal(
    formatAuditResult(sampleAuditResult({ ok: false, failures: [{ plugin: "x", message: "bad" }] }), { quiet: true }),
    "Plugin audit failed: 1 failures\n",
  );
});

test("audit json formatter preserves the machine payload shape", () => {
  const result = sampleAuditResult();
  const parsed = JSON.parse(formatAuditJson(result));

  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.failures, []);
  assert.deepEqual(parsed.expectedWarnings, []);
  assert.deepEqual(Object.keys(parsed.pluginResults), ["aboutMetadata", "devTools"]);
  assert.equal(parsed.target.app, "/repo/work/Codex Plus.app");
  assert.equal(parsed.devHome, "/repo/work/codex-plus-dev-home");
  assert.deepEqual(parsed.nativeOpenProbes, { included: false });
});

test("audit human formatter reports keep-open app exits as failures", () => {
  const output = formatAuditResult(sampleAuditResult({
    ok: false,
    failures: [{
      plugin: "audit",
      message: "Audit-launched app exited after probes",
      details: {
        pid: 123,
        crashDumps: ["/repo/work/codex-plus-electron-user-data/Crashpad/pending/crash.dmp"],
      },
    }],
    cleanupResult: {
      attempted: false,
      keptOpen: true,
      ok: true,
      pid: 123,
    },
    appStability: {
      checked: true,
      ok: false,
      pid: 123,
      alive: false,
      crashDumps: ["/repo/work/codex-plus-electron-user-data/Crashpad/pending/crash.dmp"],
      message: "Audit-launched app exited after probes",
    },
  }));

  assert.match(output, /Plugin audit failed: 1 failures/);
  assert.match(output, /audit\n  Audit-launched app exited after probes/);
  assert.match(output, /crash dumps: \/repo\/work\/codex-plus-electron-user-data\/Crashpad\/pending\/crash\.dmp/);
  assert.match(output, /Re-run with --json for full probe details\./);
});

test("audit probe expression skips native window-opening probes by default", () => {
  const defaultExpression = pluginAuditExpression();
  const strictExpression = pluginAuditExpression({ includeNativeOpenProbes: true });

  assert.match(defaultExpression, /"includeNativeOpenProbes":false/);
  assert.match(strictExpression, /"includeNativeOpenProbes":true/);
  assert.match(defaultExpression, /if \(options\.includeNativeOpenProbes\)/);
  assert.match(defaultExpression, /window\.CodexPlus\.commands\.run\("codexPlusOpenDevTools"\)/);
  assert.match(defaultExpression, /window\.CodexPlus\.native\.request\("mermaid\/openViewer"/);
  assert.match(defaultExpression, /previous = root\.getAttribute\("data-codex-plus-sidebar-names-blurred"\)/);
  assert.match(defaultExpression, /finally \{/);
  assert.match(defaultExpression, /root\.removeAttribute\("data-codex-plus-sidebar-names-blurred"\)/);
  assert.match(defaultExpression, /root\.setAttribute\("data-codex-plus-sidebar-names-blurred", previous\)/);
  assert.match(defaultExpression, /rendererSourceEvidence/);
  assert.match(defaultExpression, /Sidebar blur command is not wired into the renderer command palette/);
  assert.match(defaultExpression, /Renderer command palette cannot read literal Codex Plus command titles/);
  assert.match(defaultExpression, /Live Mermaid diagrams missing popout buttons/);
  assert.match(defaultExpression, /liveDiagramCount/);
  assert.match(defaultExpression, /Project sidebar child rows or list containers are not styled like their project rows/);
  assert.match(defaultExpression, /Mounted composer does not carry the selected project accent/);
  assert.match(defaultExpression, /waitForMountedProjectComposer/);
  assert.match(defaultExpression, /data-app-action-sidebar-project-list-id/);
  assert.match(defaultExpression, /data-codex-plus-project-sidebar-color/);
  assert.match(defaultExpression, /composerPermissionPickerStatus/);
  assert.match(defaultExpression, /const expectedWarnings = \[\]/);
  assert.match(defaultExpression, /const warn = \(id, code, message, details = \{\}\)/);
  assert.match(defaultExpression, /Composer permissions picker text is unreadable/);
  assert.match(defaultExpression, /composer-permission-picker-disabled/);
  assert.match(defaultExpression, /expectedWarnings/);
  assert.match(defaultExpression, /triggerAriaDisabled/);
  assert.match(defaultExpression, /surfaceBackground/);
  assert.match(defaultExpression, /labelTextFillTransparent/);
  assert.match(defaultExpression, /webkitTextFillColor/);
});

test("keep-open stability check reports live and exited audit apps", async () => {
  const live = await checkKeepOpenAppStability(
    { pid: 123 },
    {
      wait() {},
      isAlive(pid) {
        assert.equal(pid, 123);
        return true;
      },
      listCrashDumps() {
        return [];
      },
      waitMs: 0,
    },
  );
  assert.equal(live.checked, true);
  assert.equal(live.ok, true);
  assert.equal(live.alive, true);

  const exited = await checkKeepOpenAppStability(
    { pid: 456 },
    {
      electronUserDataPath: "/repo/work/codex-plus-electron-user-data",
      wait() {},
      isAlive(pid) {
        assert.equal(pid, 456);
        return false;
      },
      listCrashDumps(userDataPath) {
        assert.equal(userDataPath, "/repo/work/codex-plus-electron-user-data");
        return ["/repo/work/codex-plus-electron-user-data/Crashpad/pending/crash.dmp"];
      },
      waitMs: 0,
    },
  );
  assert.equal(exited.checked, true);
  assert.equal(exited.ok, false);
  assert.equal(exited.alive, false);
  assert.deepEqual(exited.crashDumps, ["/repo/work/codex-plus-electron-user-data/Crashpad/pending/crash.dmp"]);
});

test("crashpad pending report listing includes dumps and sidecars", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-plus-crashpad-"));
  const pendingDir = path.join(tmpDir, "Crashpad", "pending");
  fs.mkdirSync(pendingDir, { recursive: true });
  writeFile(tmpDir, "Crashpad/pending/a.dmp", "");
  writeFile(tmpDir, "Crashpad/pending/a_sidecar.json", "{}");
  writeFile(tmpDir, "Crashpad/pending/ignored.txt", "");

  assert.deepEqual(listCrashpadPendingDumps(tmpDir), [
    path.join(pendingDir, "a.dmp"),
    path.join(pendingDir, "a_sidecar.json"),
  ]);
});

test("core audit json preserves shape with stability metadata", () => {
  const result = sampleAuditResult({
    appStability: {
      checked: true,
      ok: true,
      pid: 123,
      alive: true,
      crashDumps: [],
      message: "Audit-launched app is still running",
    },
  });
  const parsed = JSON.parse(formatCoreAuditJson(result));

  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.failures, []);
  assert.deepEqual(parsed.expectedWarnings, []);
  assert.deepEqual(Object.keys(parsed.pluginResults), ["aboutMetadata", "devTools"]);
  assert.equal(parsed.target.app, "/repo/work/Codex Plus.app");
  assert.equal(parsed.devHome, "/repo/work/codex-plus-dev-home");
  assert.equal(parsed.appStability.ok, true);
});

test("app shell wait fails while the startup loader remains", async () => {
  let calls = 0;
  await assert.rejects(
    () => waitForAppShellMounted(
      {
        evaluate() {
          calls += 1;
          return Promise.resolve({
            readyState: "complete",
            hasRoot: true,
            hasStartupLoader: true,
            bodyTextLength: 0,
            elementCount: 141,
            interactiveCount: 0,
            sampleText: "",
          });
        },
      },
      1,
    ),
    /Timed out waiting for Codex app shell to mount/,
  );
  assert.equal(calls, 1);
});

test("app shell wait returns once real UI has mounted", async () => {
  const states = [
    {
      readyState: "complete",
      hasRoot: true,
      hasStartupLoader: true,
      bodyTextLength: 0,
      elementCount: 141,
      interactiveCount: 0,
      sampleText: "",
    },
    {
      readyState: "complete",
      hasRoot: true,
      hasStartupLoader: false,
      bodyTextLength: 8,
      elementCount: 400,
      interactiveCount: 3,
      sampleText: "New chat",
    },
  ];
  const status = await waitForAppShellMounted(
    {
      evaluate() {
        return Promise.resolve(states.shift());
      },
    },
    1000,
  );
  assert.equal(status.hasStartupLoader, false);
  assert.equal(status.sampleText, "New chat");
});

test("app shell wait rejects the React error boundary", async () => {
  await assert.rejects(
    () => waitForAppShellMounted(
      {
        evaluate() {
          return Promise.resolve({
            readyState: "complete",
            hasRoot: true,
            hasStartupLoader: false,
            hasErrorBoundary: true,
            bodyTextLength: 50,
            elementCount: 171,
            interactiveCount: 2,
            sampleText: "Oops, an error has occurred\nUpdate Codex\nTry again",
          });
        },
      },
      1000,
    ),
    /Codex app shell rendered error boundary/,
  );
});

test("runAudit fails when probes leave the app shell in the error boundary", async () => {
  let shellChecks = 0;
  class FakeCdpSession {
    connect() { return Promise.resolve(); }
    send() { return Promise.resolve(); }
    evaluate() {
      return Promise.resolve({
        ok: true,
        failures: [],
        pluginResults: {},
        registeredPlugins: [],
        startedPlugins: [],
      });
    }
    close() { return Promise.resolve(); }
  }

  const result = await runAudit(
    {
      source: "/Applications/Codex.app",
      target: "/repo/work/Codex Plus.app",
      sourceHome: "/repo/source-home",
      devHome: "/repo/dev-home",
      electronUserDataPath: "/repo/electron-user-data",
      remoteDebuggingPort: 9234,
      apply: true,
      launch: true,
      keepOpen: false,
      includeNativeOpenProbes: false,
    },
    {
      progress: { start() {}, succeed() {}, fail() {} },
      operations: {
        auditPreflight() {
          return Promise.resolve({ port: 9234, launch: true, reuseExisting: false });
        },
        findFreePort() { return Promise.resolve(9234); },
        patchCodexApp() { return Promise.resolve({ patchSet: "codex-test" }); },
        syncDevHome() { return Promise.resolve({ copied: [] }); },
        launchDevApp() { return Promise.resolve({ pid: 123, command: "Codex", args: [] }); },
        waitForRendererTarget() {
          return Promise.resolve({ url: "app://-/index.html", webSocketDebuggerUrl: "ws://127.0.0.1:9234/devtools/page/1" });
        },
        CdpSession: FakeCdpSession,
        waitForLiveRuntime() { return Promise.resolve({ registered: 0, started: 0 }); },
        waitForAppShellMounted() {
          shellChecks += 1;
          if (shellChecks === 2) throw new Error("Codex app shell rendered error boundary");
          return Promise.resolve({ hasErrorBoundary: false, sampleText: "New chat" });
        },
        cleanupLaunchedAuditApp() {
          return Promise.resolve({ attempted: true, keptOpen: false, ok: true, pid: 123 });
        },
        auditIdentity() {
          return { packageName: "codex-plus-patcher", packageVersion: "0.7.0" };
        },
      },
    },
  );

  assert.equal(shellChecks, 2);
  assert.equal(result.ok, false);
  assert.match(result.failures[0].message, /error boundary/);
});

test("runAudit fails when the Mermaid viewer cannot render standalone", async () => {
  class FakeCdpSession {
    connect() { return Promise.resolve(); }
    send() { return Promise.resolve(); }
    evaluate() {
      return Promise.resolve({
        ok: true,
        failures: [],
        pluginResults: {
          mermaidFullscreen: {
            ok: true,
            registered: true,
            started: true,
            marker: true,
            buttonRendered: true,
          },
        },
        registeredPlugins: ["mermaidFullscreen"],
        startedPlugins: ["mermaidFullscreen"],
      });
    }
    close() { return Promise.resolve(); }
  }

  const result = await runAudit(
    {
      source: "/Applications/Codex.app",
      target: "/repo/work/Codex Plus.app",
      sourceHome: "/repo/source-home",
      devHome: "/repo/dev-home",
      electronUserDataPath: "/repo/electron-user-data",
      remoteDebuggingPort: 9234,
      apply: false,
      launch: false,
      keepOpen: false,
      includeNativeOpenProbes: false,
    },
    {
      progress: { start() {}, succeed() {}, fail() {} },
      operations: {
        auditPreflight() {
          return Promise.resolve({ port: 9234, launch: false, reuseExisting: true });
        },
        syncDevHome() { return Promise.resolve({ copied: [] }); },
        waitForRendererTarget() {
          return Promise.resolve({ url: "app://-/index.html", webSocketDebuggerUrl: "ws://127.0.0.1:9234/devtools/page/1" });
        },
        CdpSession: FakeCdpSession,
        waitForLiveRuntime() { return Promise.resolve({ registered: 1, started: 1 }); },
        waitForAppShellMounted() { return Promise.resolve({ hasErrorBoundary: false, sampleText: "New chat" }); },
        verifyMermaidViewerRender() {
          return Promise.resolve({
            ok: false,
            message: "Mermaid render failed: Cannot read properties of undefined (reading 'adapters')",
          });
        },
        cleanupLaunchedAuditApp() {
          return Promise.resolve({ attempted: false, keptOpen: false, ok: true });
        },
        auditIdentity() {
          return { packageName: "codex-plus-patcher", packageVersion: "0.7.0" };
        },
      },
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.pluginResults.mermaidFullscreen.ok, false);
  assert.equal(result.pluginResults.mermaidFullscreen.viewerRenderProbe.ok, false);
  assert.deepEqual(result.failures, [{
    plugin: "mermaidFullscreen",
    message: "Mermaid viewer render failed: Mermaid render failed: Cannot read properties of undefined (reading 'adapters')",
  }]);
});

test("runAudit fails keep-open audits when the launched app exits after probes", async () => {
  const progressEvents = [];
  class FakeCdpSession {
    constructor(url) {
      this.url = url;
    }

    connect() {
      return Promise.resolve();
    }

    send() {
      return Promise.resolve();
    }

    evaluate(expression) {
      assert.match(expression, /"includeNativeOpenProbes":false/);
      return Promise.resolve({
        ok: true,
        failures: [],
        pluginResults: {
          devTools: { ok: true, nativeOpenProbe: false },
          mermaidFullscreen: { ok: true, nativeOpenProbe: false },
        },
        registeredPlugins: ["devTools", "mermaidFullscreen"],
        startedPlugins: ["devTools", "mermaidFullscreen"],
      });
    }

    close() {
      return Promise.resolve();
    }
  }

  const result = await runAudit(
    {
      source: "/Applications/Codex.app",
      target: "/repo/work/Codex Plus.app",
      sourceHome: "/repo/source-home",
      devHome: "/repo/dev-home",
      electronUserDataPath: "/repo/electron-user-data",
      remoteDebuggingPort: 9234,
      apply: true,
      launch: true,
      keepOpen: true,
      includeNativeOpenProbes: false,
    },
    {
      progress: {
        start(text) { progressEvents.push(["start", text]); },
        succeed(text) { progressEvents.push(["succeed", text]); },
        fail(text) { progressEvents.push(["fail", text]); },
      },
      operations: {
        auditPreflight() {
          return Promise.resolve({
            port: 9234,
            launch: true,
            reuseExisting: false,
            existingApp: null,
            existingTarget: null,
            livePort: null,
            suggestedCommand: null,
          });
        },
        findFreePort() { return Promise.resolve(9234); },
        patchCodexApp() { return Promise.resolve({ patchSet: "codex-test" }); },
        syncDevHome() { return Promise.resolve({ copied: [] }); },
        launchDevApp() { return Promise.resolve({ pid: 123, command: "Codex", args: [] }); },
        waitForRendererTarget() {
          return Promise.resolve({
            url: "app://-/index.html",
            webSocketDebuggerUrl: "ws://127.0.0.1:9234/devtools/page/1",
          });
        },
        CdpSession: FakeCdpSession,
        waitForLiveRuntime() { return Promise.resolve({ registered: 2, started: 2 }); },
        waitForAppShellMounted() {
          return Promise.resolve({
            readyState: "complete",
            hasRoot: true,
            hasStartupLoader: false,
            bodyTextLength: 42,
            elementCount: 100,
            interactiveCount: 5,
            sampleText: "New chat",
          });
        },
        verifyMermaidViewerRender() {
          return Promise.resolve({ ok: true, svgLength: 1200 });
        },
        cleanupLaunchedAuditApp(launchResult, options) {
          assert.equal(launchResult.pid, 123);
          assert.equal(options.keepOpen, true);
          return Promise.resolve({ attempted: false, keptOpen: true, ok: true, pid: 123 });
        },
        checkKeepOpenAppStability() {
          return Promise.resolve({
            checked: true,
            ok: false,
            pid: 123,
            alive: false,
            crashDumps: ["/repo/electron-user-data/Crashpad/pending/crash.dmp"],
            message: "Audit-launched app exited after probes",
          });
        },
        auditIdentity() {
          return { packageName: "codex-plus-patcher", packageVersion: "0.7.0" };
        },
      },
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].plugin, "audit");
  assert.match(result.failures[0].message, /exited after probes/);
  assert.equal(result.cleanupResult.keptOpen, true);
  assert.equal(result.appStability.ok, false);
  assert.deepEqual(progressEvents.at(-1), ["succeed", "Kept audit app open"]);
});

test("audit preflight fails fast when applying while audit app is already running", async () => {
  await assert.rejects(
    () => auditPreflight(
      {
        target: "/repo/work/Codex Plus.app",
        electronUserDataPath: "/repo/work/codex-plus-electron-user-data",
        remoteDebuggingPort: 9234,
        apply: true,
        launch: true,
      },
      {
        findRendererTarget() {
          return Promise.resolve({ url: "app://-/index.html" });
        },
        listRunningApps() {
          return [{
            pid: 123,
            command: "/repo/work/Codex Plus.app/Contents/MacOS/Codex --user-data-dir=/repo/work/codex-plus-electron-user-data --remote-debugging-port=9234",
            remoteDebuggingPort: 9234,
          }];
        },
        findPort() {
          throw new Error("findPort must not run when the audit app is already open");
        },
      },
    ),
    (error) => {
      assert.match(error.message, /already running on port 9234/);
      assert.equal(error.details.livePort, 9234);
      assert.equal(error.details.suggestedCommand, "codex-plus-patcher audit-plugins --no-apply --no-launch --keep-open --port 9234");
      return true;
    },
  );
});

test("audit preflight reuses running app when no-apply launch is requested", async () => {
  const preflight = await auditPreflight(
    {
      target: "/repo/work/Codex Plus.app",
      electronUserDataPath: "/repo/work/codex-plus-electron-user-data",
      remoteDebuggingPort: 9234,
      apply: false,
      launch: true,
    },
    {
      findRendererTarget() {
        return Promise.resolve(null);
      },
      listRunningApps() {
        return [{
          pid: 123,
          command: "/repo/work/Codex Plus.app/Contents/MacOS/Codex --user-data-dir=/repo/work/codex-plus-electron-user-data --remote-debugging-port=9234",
          remoteDebuggingPort: 9234,
        }];
      },
      findPort() {
        throw new Error("findPort must not run while reusing the existing app");
      },
    },
  );

  assert.equal(preflight.port, 9234);
  assert.equal(preflight.launch, false);
  assert.equal(preflight.reuseExisting, true);
  assert.equal(preflight.suggestedCommand, "codex-plus-patcher audit-plugins --no-apply --no-launch --keep-open --port 9234");
});

test("audit preflight no-launch mode uses requested port without free-port search", async () => {
  const preflight = await auditPreflight(
    {
      target: "/repo/work/Codex Plus.app",
      electronUserDataPath: "/repo/work/codex-plus-electron-user-data",
      remoteDebuggingPort: 9234,
      apply: false,
      launch: false,
    },
    {
      findRendererTarget() {
        return Promise.resolve({ url: "app://-/index.html" });
      },
      listRunningApps() {
        return [];
      },
      findPort() {
        throw new Error("findPort must not run in no-launch mode");
      },
    },
  );

  assert.equal(preflight.port, 9234);
  assert.equal(preflight.launch, false);
  assert.equal(preflight.reuseExisting, true);
});

test("running audit app process detection matches target and electron user data", () => {
  const rows = [
    "  123 /repo/work/Codex Plus.app/Contents/MacOS/Codex --user-data-dir=/repo/work/codex-plus-electron-user-data --remote-debugging-port=9234",
    "  456 /repo/work/Codex Plus.app/Contents/MacOS/Codex --user-data-dir=/tmp/other --remote-debugging-port=9235",
    "  789 /other/Codex Plus.app/Contents/MacOS/Codex --user-data-dir=/repo/work/codex-plus-electron-user-data --remote-debugging-port=9236",
  ].join("\n");
  const running = listRunningAuditApps({
    targetApp: "/repo/work/Codex Plus.app",
    electronUserDataPath: "/repo/work/codex-plus-electron-user-data",
    execFileSync(command, args) {
      assert.equal(command, "ps");
      assert.deepEqual(args, ["-axo", "pid=,command="]);
      return rows;
    },
  });

  assert.deepEqual(running, [{
    pid: 123,
    command: "/repo/work/Codex Plus.app/Contents/MacOS/Codex --user-data-dir=/repo/work/codex-plus-electron-user-data --remote-debugging-port=9234",
    remoteDebuggingPort: 9234,
  }]);
});

test("runAudit no-launch mode attaches to the requested port", async () => {
  class FakeCdpSession {
    connect() { return Promise.resolve(); }
    send() { return Promise.resolve(); }
    evaluate() {
      return Promise.resolve({
        ok: true,
        failures: [],
        expectedWarnings: [{
          plugin: "audit",
          code: "composer-permission-picker-disabled",
          message: "Composer permissions picker is disabled while the composer is editable",
          details: { triggerText: "Full access" },
        }],
        pluginResults: { aboutMetadata: { ok: true } },
        registeredPlugins: ["aboutMetadata"],
        startedPlugins: ["aboutMetadata"],
      });
    }
    close() { return Promise.resolve(); }
  }

  const result = await runAudit(
    {
      source: "/Applications/Codex.app",
      target: "/repo/work/Codex Plus.app",
      sourceHome: "/repo/source-home",
      devHome: "/repo/dev-home",
      electronUserDataPath: "/repo/electron-user-data",
      remoteDebuggingPort: 9234,
      apply: false,
      launch: false,
      keepOpen: false,
      includeNativeOpenProbes: false,
    },
    {
      operations: {
        auditPreflight() {
          return Promise.resolve({
            port: 9234,
            launch: false,
            reuseExisting: true,
            existingApp: null,
            existingTarget: { url: "app://-/index.html" },
            livePort: 9234,
            suggestedCommand: "codex-plus-patcher audit-plugins --no-apply --no-launch --keep-open --port 9234",
          });
        },
        findFreePort() {
          throw new Error("findFreePort must not run in no-launch mode");
        },
        syncDevHome() { return Promise.resolve({ copied: [] }); },
        waitForRendererTarget(port) {
          assert.equal(port, 9234);
          return Promise.resolve({
            url: "app://-/index.html",
            webSocketDebuggerUrl: "ws://127.0.0.1:9234/devtools/page/1",
          });
        },
        CdpSession: FakeCdpSession,
        waitForLiveRuntime() { return Promise.resolve({ registered: 1, started: 1 }); },
        waitForAppShellMounted() {
          return Promise.resolve({
            readyState: "complete",
            hasRoot: true,
            hasStartupLoader: false,
            bodyTextLength: 42,
            elementCount: 100,
            interactiveCount: 5,
            sampleText: "New chat",
          });
        },
        cleanupLaunchedAuditApp(launchResult) {
          assert.equal(launchResult, null);
          return Promise.resolve({ attempted: false, keptOpen: false, ok: true, pid: null });
        },
        auditIdentity() {
          return { packageName: "codex-plus-patcher", packageVersion: "0.7.0" };
        },
      },
    },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.expectedWarnings, [{
    plugin: "audit",
    code: "composer-permission-picker-disabled",
    message: "Composer permissions picker is disabled while the composer is editable",
    details: { triggerText: "Full access" },
  }]);
  assert.equal(result.target.remoteDebuggingPort, 9234);
  assert.equal(result.syncResult, null);
});

function writeFile(root, relativePath, text = relativePath) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text);
}

test("dev-sync copies allowed config and symlinks original worktrees", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-plus-dev-sync-"));
  const sourceHome = path.join(tmpDir, "source-home");
  const devHome = path.join(tmpDir, "dev-home");
  fs.mkdirSync(path.join(sourceHome, "worktrees", "ffde"), { recursive: true });
  fs.mkdirSync(path.join(sourceHome, "sessions", "2026"), { recursive: true });
  writeFile(devHome, "cache/stale.txt", "remove me");
  writeFile(devHome, "sqlite/codex-dev.db", "remove me");
  writeFile(devHome, "sqlite/state_5.sqlite-wal", "remove me");
  writeFile(devHome, "sqlite/state_5.sqlite-shm", "remove me");
  writeFile(devHome, "sessions/stale.jsonl", "remove me");
  writeFile(devHome, "logs_2.sqlite", "remove me");
  writeFile(devHome, "logs_2.sqlite-wal", "remove me");
  writeFile(sourceHome, "config.toml", "model = 'gpt-5'\n");
  writeFile(sourceHome, "auth.json", "{}\n");
  writeFile(sourceHome, ".codex-global-state.json", JSON.stringify({
    "electron-persisted-atom-state": {
      "composer-prompt-drafts-v1": {
        "local:thread-1": "blur",
      },
      "project-order": ["/repo"],
    },
  }));
  writeFile(sourceHome, "rules/default.rules", "rule\n");
  writeFile(sourceHome, "skills/example/SKILL.md", "# Skill\n");
  writeFile(sourceHome, "plugins/example/plugin.json", "{}\n");
  writeFile(sourceHome, "vendor_imports/skills-curated-cache.json", "{}\n");
  writeFile(sourceHome, "computer-use/config.json", "{}\n");
  childProcess.execFileSync("sqlite3", [
    path.join(sourceHome, "state_5.sqlite"),
    "create table threads(id text primary key, title text); insert into threads values('thread-1','Visible in dev');",
  ]);
  fs.mkdirSync(path.join(sourceHome, "sqlite"), { recursive: true });
  childProcess.execFileSync("sqlite3", [
    path.join(sourceHome, "sqlite/state_5.sqlite"),
    "create table threads(id text primary key, title text); insert into threads values('thread-2','Visible from nested sqlite');",
  ]);
  writeFile(sourceHome, "sqlite/codex.db", "do not copy");
  writeFile(sourceHome, "sessions/2026/rollout.jsonl", "do not copy");
  writeFile(sourceHome, "logs_2.sqlite", "do not copy");
  writeFile(sourceHome, "state_5.sqlite-wal", "do not copy");
  writeFile(sourceHome, "state_5.sqlite-shm", "do not copy");
  writeFile(sourceHome, "sqlite/state_5.sqlite-wal", "do not copy");
  writeFile(sourceHome, "sqlite/state_5.sqlite-shm", "do not copy");
  writeFile(sourceHome, "cache/generated.txt", "do not copy");

  const result = syncDevHome({ sourceHome, devHome });

  assert.equal(fs.readFileSync(path.join(devHome, "config.toml"), "utf8"), "model = 'gpt-5'\n");
  const devGlobalState = JSON.parse(fs.readFileSync(path.join(devHome, ".codex-global-state.json"), "utf8"));
  assert.equal(devGlobalState["electron-persisted-atom-state"]["composer-prompt-drafts-v1"], undefined);
  assert.deepEqual(devGlobalState["electron-persisted-atom-state"]["project-order"], ["/repo"]);
  assert.equal(fs.readFileSync(path.join(devHome, "rules/default.rules"), "utf8"), "rule\n");
  assert.equal(fs.readFileSync(path.join(devHome, "computer-use/config.json"), "utf8"), "{}\n");
  assert.equal(fs.lstatSync(path.join(devHome, "worktrees")).isSymbolicLink(), true);
  assert.equal(fs.readlinkSync(path.join(devHome, "worktrees")), path.join(sourceHome, "worktrees"));
  assert.equal(fs.lstatSync(path.join(devHome, "sessions")).isSymbolicLink(), true);
  assert.equal(fs.readlinkSync(path.join(devHome, "sessions")), path.join(sourceHome, "sessions"));
  assert.equal(
    childProcess.execFileSync("sqlite3", [path.join(devHome, "state_5.sqlite"), "select title from threads where id = 'thread-1';"], { encoding: "utf8" }).trim(),
    "Visible in dev",
  );
  assert.equal(
    childProcess.execFileSync("sqlite3", [path.join(devHome, "sqlite/state_5.sqlite"), "select title from threads where id = 'thread-2';"], { encoding: "utf8" }).trim(),
    "Visible from nested sqlite",
  );
  assert.equal(fs.existsSync(path.join(devHome, "sqlite/codex.db")), false);
  assert.equal(fs.existsSync(path.join(devHome, "sqlite/state_5.sqlite-wal")), false);
  assert.equal(fs.existsSync(path.join(devHome, "sqlite/state_5.sqlite-shm")), false);
  assert.equal(fs.existsSync(path.join(devHome, "logs_2.sqlite")), false);
  assert.equal(fs.existsSync(path.join(devHome, "logs_2.sqlite-wal")), false);
  assert.equal(fs.existsSync(path.join(devHome, "state_5.sqlite-wal")), false);
  assert.equal(fs.existsSync(path.join(devHome, "state_5.sqlite-shm")), false);
  assert.equal(fs.existsSync(path.join(devHome, "cache", "generated.txt")), false);
  assert.equal(fs.existsSync(path.join(devHome, "cache", "stale.txt")), false);
  assert.equal(result.scrubbedGlobalState, true);
  assert.deepEqual(result.sqliteSnapshots, ["state_5.sqlite", "sqlite/state_5.sqlite"]);
  assert.deepEqual(result.worktrees, {
    source: path.join(sourceHome, "worktrees"),
    target: path.join(devHome, "worktrees"),
  });
  assert.deepEqual(result.sessions, {
    source: path.join(sourceHome, "sessions"),
    target: path.join(devHome, "sessions"),
  });
  assert.match(formatSyncDevHomeResult(result), /SQLite snapshots: state_5\.sqlite, sqlite\/state_5\.sqlite/);
  assert.match(formatSyncDevHomeResult(result), /Sessions: .*dev-home\/sessions -> .*source-home\/sessions/);
  assert.match(formatSyncDevHomeResult(result), /Scrubbed writable state: composer prompt drafts/);
  assert.match(formatSyncDevHomeResult(result), /Dev mode shares the original Codex worktrees/);
});

test("dev-sync skips missing sqlite snapshot sources without failing", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-plus-dev-sync-"));
  const sourceHome = path.join(tmpDir, "source-home");
  const devHome = path.join(tmpDir, "dev-home");
  fs.mkdirSync(sourceHome, { recursive: true });
  fs.mkdirSync(devHome, { recursive: true });
  writeFile(devHome, "sqlite/state_5.sqlite", "stale");
  writeFile(devHome, "sqlite/state_5.sqlite-wal", "stale");

  const result = syncDevHome({ sourceHome, devHome });

  assert.deepEqual(result.sqliteSnapshots, []);
  assert.equal(fs.existsSync(path.join(devHome, "state_5.sqlite")), false);
  assert.equal(fs.existsSync(path.join(devHome, "sqlite")), false);
  assert.equal(result.worktrees, null);
  assert.equal(result.sessions, null);
  assert.match(formatSyncDevHomeResult(result), /SQLite snapshots: \(none\)/);
  assert.match(formatSyncDevHomeResult(result), /Sessions: \(missing\)/);
});

test("dev-sync rejects the real source home as dev home", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-plus-dev-sync-"));

  assert.throws(
    () => syncDevHome({ sourceHome: tmpDir, devHome: tmpDir }),
    /--dev-home must not be the same as --source-home/,
  );
});

test("launch-dev uses isolated Codex and Electron state", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-plus-launch-dev-"));
  const targetApp = path.join(tmpDir, "Codex Plus.app");
  const devHome = path.join(tmpDir, "dev-home");
  const electronUserDataPath = path.join(tmpDir, "electron-user-data");
  const calls = [];
  const result = launchDevApp({
    targetApp,
    devHome,
    electronUserDataPath,
    remoteDebuggingPort: "9234",
    env: { KEEP_ME: "yes" },
    markDevRuntimeConfigImpl(appPath) {
      calls.push({ markDevRuntimeConfig: appPath });
      return { asar: path.join(appPath, "Contents/Resources/app.asar"), patchedAsarSha: "dev-sha" };
    },
    markDevBundleIdentityImpl(appPath, devInstanceId) {
      calls.push({ markDevBundleIdentity: appPath, devInstanceId });
      return {
        id: "dev",
        bundleIdentifier: "com.openai.codex-plus.dev",
        displayName: "Codex Plus (dev)",
        name: "Codex Plus dev",
      };
    },
    signDevAppImpl(appPath) {
      calls.push({ signDevApp: appPath });
      return { signed: true };
    },
    spawn(command, args, options) {
      calls.push({ command, args, options });
      return {
        pid: 12345,
        unref() {
          calls.push({ unref: true });
        },
      };
    },
  });

  assert.equal(result.command, path.join(targetApp, "Contents/MacOS/Codex"));
  assert.deepEqual(result.args, [`--user-data-dir=${electronUserDataPath}`, "--remote-debugging-port=9234"]);
  assert.equal(result.env.CODEX_HOME, devHome);
  assert.equal(result.env.CODEX_ELECTRON_USER_DATA_PATH, electronUserDataPath);
  assert.deepEqual(result.devRuntimeConfig, {
    asar: path.join(targetApp, "Contents/Resources/app.asar"),
    patchedAsarSha: "dev-sha",
  });
  assert.deepEqual(result.devBundle, {
    id: "dev",
    bundleIdentifier: "com.openai.codex-plus.dev",
    displayName: "Codex Plus (dev)",
    name: "Codex Plus dev",
  });
  assert.deepEqual(result.instanceIdentity, result.devBundle);
  assert.deepEqual(result.devSignature, { signed: true });
  assert.equal(fs.statSync(devHome).isDirectory(), true);
  assert.equal(fs.statSync(electronUserDataPath).isDirectory(), true);
  assert.deepEqual(calls[0], { markDevRuntimeConfig: targetApp });
  assert.deepEqual(calls[1], { markDevBundleIdentity: targetApp, devInstanceId: undefined });
  assert.deepEqual(calls[2], { signDevApp: targetApp });
  assert.deepEqual(calls[3].args, [`--user-data-dir=${electronUserDataPath}`, "--remote-debugging-port=9234"]);
  assert.equal(calls[3].options.detached, true);
  assert.equal(calls[3].options.env.KEEP_ME, "yes");
  assert.equal(calls[3].options.env.CODEX_HOME, devHome);
  assert.equal(calls[3].options.env.CODEX_ELECTRON_USER_DATA_PATH, electronUserDataPath);
  assert.deepEqual(calls[4], { unref: true });
  assert.match(formatLaunchDevResult(result), /CODEX_ELECTRON_USER_DATA_PATH/);
  assert.match(formatLaunchDevResult(result), /com\.openai\.codex-plus\.dev/);
});

test("audit cleanup handles launched, kept-open, missing, and failed process cleanup", async () => {
  const killed = [];
  const cleaned = await cleanupLaunchedAuditApp(
    { pid: 123 },
    {
      kill(pid, signal) {
        killed.push([pid, signal]);
      },
      wait() {},
    },
  );
  assert.deepEqual(cleaned, { attempted: true, keptOpen: false, ok: true, pid: 123 });
  assert.deepEqual(killed, [[-123, "SIGTERM"], [-123, "SIGKILL"]]);

  assert.deepEqual(await cleanupLaunchedAuditApp({ pid: 456 }, { keepOpen: true }), {
    attempted: false,
    keptOpen: true,
    ok: true,
    pid: 456,
  });
  assert.deepEqual(await cleanupLaunchedAuditApp(null), {
    attempted: false,
    keptOpen: false,
    ok: true,
    pid: null,
  });

  const failed = await cleanupLaunchedAuditApp(
    { pid: 789 },
    {
      kill() {
        const error = new Error("no permission");
        error.code = "EPERM";
        throw error;
      },
      wait() {},
    },
  );
  assert.equal(failed.attempted, true);
  assert.equal(failed.keptOpen, false);
  assert.equal(failed.ok, false);
  assert.equal(failed.pid, 789);
  assert.match(failed.message, /no permission/);
});

test("audit identity helper handles clean, dirty, and non-git cases", () => {
  const clean = auditIdentity({
    cwd: "/repo",
    execFileSync(command, args) {
      assert.equal(command, "git");
      if (args[0] === "rev-parse") return "abc123\n";
      if (args[0] === "status") return "";
      throw new Error("unexpected git command");
    },
  });
  assert.equal(clean.packageName, "codex-plus-patcher");
  assert.equal(clean.packageVersion, packageJson.version);
  assert.equal(clean.gitSha, "abc123");
  assert.equal(clean.gitDirty, false);
  assert.equal(clean.gitAvailable, true);

  const dirty = auditIdentity({
    cwd: "/repo",
    execFileSync(command, args) {
      if (args[0] === "rev-parse") return "def456\n";
      if (args[0] === "status") return " M package.json\n";
      throw new Error("unexpected git command");
    },
  });
  assert.equal(dirty.gitSha, "def456");
  assert.equal(dirty.gitDirty, true);
  assert.equal(dirty.gitAvailable, true);

  const nonGit = auditIdentity({
    cwd: "/repo",
    execFileSync() {
      throw new Error("not a git repository");
    },
  });
  assert.equal(nonGit.gitSha, "unknown");
  assert.equal(nonGit.gitDirty, null);
  assert.equal(nonGit.gitAvailable, false);
});

function makeAsar(fileMap) {
  const header = { files: {} };
  let offset = 0;
  const buffers = [];
  for (const [filePath, text] of Object.entries(fileMap)) {
    const parts = filePath.split("/");
    let node = header;
    for (const part of parts.slice(0, -1)) {
      node.files[part] ||= { files: {} };
      node = node.files[part];
    }
    const buffer = Buffer.from(text, "utf8");
    node.files[parts.at(-1)] = { size: buffer.length, offset: String(offset) };
    buffers.push(buffer);
    offset += buffer.length;
  }
  const json = Buffer.from(JSON.stringify(header), "utf8");
  const prefix = Buffer.alloc(16);
  prefix.writeUInt32LE(4, 0);
  prefix.writeUInt32LE(json.length + 8, 4);
  prefix.writeUInt32LE(json.length + 4, 8);
  prefix.writeUInt32LE(json.length, 12);
  return Buffer.concat([prefix, json, ...buffers]);
}

function writeFixtureAsar() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-plus-cli-asar-"));
  const asarPath = path.join(tmpDir, "app.asar");
  fs.writeFileSync(
    asarPath,
    makeAsar({
      "webview/assets/codex-plus/runtime.js": "window.CodexPlus={};",
      "webview/assets/codex-plus/plugins/devTools.js": 'id: "devTools"; codexPlusOpenDevTools; devtools/open;',
      "webview/assets/codex-plus/plugins/nestedRepositories.js": "function ReviewMux(){}",
      ".vite/build/thread-side-panel-tabs.js": "CPXRM",
      ".vite/build/src-menu.js": "{id:`codexPlusOpenDevTools`,title:`Open Developer Tools`,commandMenuGroupKey:`panels`},{id:`toggleBottomPanel`,electron:{menuTitle:`Toggle Bottom Panel`}}",
      ".vite/build/main.js": "CPXOpenDevTools; devtools/open; openDevTools; Menu.setApplicationMenu; refreshApplicationMenu; CPXLogMenuDiagnostics;",
    }),
  );
  return asarPath;
}

function writeUnpackedFixtureAsar() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-plus-cli-asar-"));
  const asarPath = path.join(tmpDir, "app.asar");
  const header = { files: { "unpacked.js": { size: 0, unpacked: true } } };
  const json = Buffer.from(JSON.stringify(header), "utf8");
  const prefix = Buffer.alloc(16);
  prefix.writeUInt32LE(4, 0);
  prefix.writeUInt32LE(json.length + 8, 4);
  prefix.writeUInt32LE(json.length + 4, 8);
  prefix.writeUInt32LE(json.length, 12);
  fs.writeFileSync(asarPath, Buffer.concat([prefix, json]));
  return asarPath;
}

test("asar-list lists files and filters by substring", () => {
  const asar = writeFixtureAsar();

  assert.deepEqual(listAsarFiles({ asar }).files, [
    "webview/assets/codex-plus/runtime.js",
    "webview/assets/codex-plus/plugins/devTools.js",
    "webview/assets/codex-plus/plugins/nestedRepositories.js",
    ".vite/build/thread-side-panel-tabs.js",
    ".vite/build/src-menu.js",
    ".vite/build/main.js",
  ]);
  assert.deepEqual(listAsarFiles({ asar, contains: "codex-plus/plugins" }), {
    asar,
    files: [
      "webview/assets/codex-plus/plugins/devTools.js",
      "webview/assets/codex-plus/plugins/nestedRepositories.js",
    ],
  });
  assert.equal(formatAsarListResult({ files: ["a", "b"] }), "a\nb\n");
  assert.equal(formatAsarListResult({ files: [] }), "");
});

test("menu-diagnostics reports command metadata, native bridge, runtime plugin, and menu hooks", () => {
  const asar = writeFixtureAsar();
  const result = menuDiagnostics({ asar });

  assert.deepEqual(result.summary.commandMetadataFilesWithCommand, [
    "webview/assets/codex-plus/plugins/devTools.js",
    ".vite/build/src-menu.js",
  ]);
  assert.deepEqual(result.summary.nativeBridgeFilesWithRequest, [
    "webview/assets/codex-plus/plugins/devTools.js",
    ".vite/build/main.js",
  ]);
  assert.deepEqual(result.summary.runtimePluginFilesWithCommand, ["webview/assets/codex-plus/plugins/devTools.js"]);
  assert.deepEqual(result.summary.applicationMenuFilesWithDiagnostics, [".vite/build/main.js"]);

  const output = formatMenuDiagnosticsResult(result);
  assert.match(output, /Command metadata bundles:/);
  assert.match(output, /\.vite\/build\/src-menu\.js: command=yes/);
  assert.match(output, /Native bridge bundles:/);
  assert.match(output, /\.vite\/build\/main\.js: request=yes, openDevTools=yes/);
  assert.throws(() => menuDiagnostics({}), /--asar is required/);
});

test("asar-cat extracts packed file content", () => {
  const asar = writeFixtureAsar();
  const result = readAsarFile({ asar, file: "webview/assets/codex-plus/plugins/nestedRepositories.js" });

  assert.deepEqual(result, {
    asar,
    file: "webview/assets/codex-plus/plugins/nestedRepositories.js",
    size: "function ReviewMux(){}".length,
    content: "function ReviewMux(){}",
  });
  assert.equal(formatAsarCatResult(result), "function ReviewMux(){}");
});

test("asar readback validates required inputs", () => {
  assert.throws(() => listAsarFiles({}), /--asar is required/);
  assert.throws(() => readAsarFile({ asar: "/tmp/app.asar" }), /--file is required/);
});

test("asar-cat fails clearly for missing files", () => {
  const asar = writeFixtureAsar();

  assert.throws(
    () => readAsarFile({ asar, file: "missing.js" }),
    new RegExp(`Could not find missing\\.js in ${asar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
  );
});

test("asar-list shows unpacked files and asar-cat rejects them", () => {
  const asar = writeUnpackedFixtureAsar();

  assert.deepEqual(listAsarFiles({ asar }), { asar, files: ["unpacked.js"] });
  assert.throws(
    () => readAsarFile({ asar, file: "unpacked.js" }),
    new RegExp(`Cannot read unpacked ASAR file unpacked\\.js from ${asar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
  );
});

test("formatError hides stack traces unless debug is enabled", () => {
  const error = new Error("Unsupported Codex.app 1");

  assert.equal(formatError(error), "Error: Unsupported Codex.app 1");
  assert.match(formatError(error, { debug: true }), /Error: Unsupported Codex\.app 1\n\s+at /);
});

test("apply progress is shown only for interactive non-json apply", () => {
  assert.equal(shouldShowApplyProgress({ dryRun: false, json: false }, { isTTY: true }), true);
  assert.equal(shouldShowApplyProgress({ dryRun: true, json: false }, { isTTY: true }), false);
  assert.equal(shouldShowApplyProgress({ dryRun: false, json: true }, { isTTY: true }), false);
  assert.equal(shouldShowApplyProgress({ dryRun: false, json: false }, { isTTY: false }), false);
});

test("disabled apply progress does not import ora", async () => {
  const progress = await createApplyProgress(
    { dryRun: true, json: false },
    {
      stream: { isTTY: true },
      importOra() {
        throw new Error("ora should not be imported");
      },
    },
  );

  assert.equal(progress, null);
});

test("enabled apply progress reports and completes spinner steps", async () => {
  const calls = [];
  const spinner = {
    succeed(text) {
      calls.push(["succeed", text]);
    },
    start() {
      calls.push(["start", this.text]);
    },
    fail() {
      calls.push(["fail", this.text]);
    },
  };
  const progress = await createApplyProgress(
    { dryRun: false, json: false },
    {
      stream: { isTTY: true },
      async importOra(specifier) {
        assert.equal(specifier, "ora");
        return {
          default(options) {
            calls.push(["ora", options.stream.isTTY]);
            return spinner;
          },
        };
      },
    },
  );

  progress({ step: 1, total: 2, label: "Inspect source app" });
  progress({ status: "succeed", step: 1, total: 2, label: "Inspect source app" });
  progress({ step: 2, total: 2, label: "Finish" });
  progress({ status: "succeed", step: 2, total: 2, label: "Finish" });

  assert.deepEqual(calls, [
    ["ora", true],
    ["start", "[1/2] Inspect source app"],
    ["succeed", "[1/2] Inspect source app"],
    ["start", "[2/2] Finish"],
    ["succeed", "[2/2] Finish"],
  ]);
});

test("audit progress is suppressed in json, quiet, and no-progress modes", async () => {
  for (const args of [{ json: true }, { quiet: true }, { noProgress: true }]) {
    const progress = await createAuditProgress(args, {
      stream: { isTTY: true, write() {} },
      importOra() {
        throw new Error("ora should not be imported");
      },
    });
    assert.equal(progress, null);
  }
});

test("audit progress uses ora for tty output", async () => {
  const calls = [];
  const spinner = {
    succeed(text) {
      calls.push(["succeed", text]);
    },
    start() {
      calls.push(["start", this.text]);
    },
    fail(text) {
      calls.push(["fail", text]);
    },
  };
  const progress = await createAuditProgress(
    {},
    {
      stream: { isTTY: true },
      async importOra(specifier) {
        assert.equal(specifier, "ora");
        return {
          default(options) {
            calls.push(["ora", options.stream.isTTY]);
            return spinner;
          },
        };
      },
    },
  );

  progress.start("Running plugin probes");
  progress.succeed("Probed plugins");
  progress.start("Cleaning up launched audit app");
  progress.fail("Cleaning up launched audit app");

  assert.deepEqual(calls, [
    ["ora", true],
    ["start", "Running plugin probes"],
    ["succeed", "Probed plugins"],
    ["start", "Cleaning up launched audit app"],
    ["fail", "Cleaning up launched audit app"],
  ]);
});

test("audit progress prints timestamped plain lines for non-tty output", async () => {
  const writes = [];
  const progress = await createAuditProgress(
    {},
    {
      stream: {
        isTTY: false,
        write(text) {
          writes.push(text);
        },
      },
      now: () => new Date("2026-06-27T12:00:00.000Z"),
    },
  );

  progress.start("Waiting for Codex Plus runtime");
  progress.succeed("Runtime ready");
  progress.fail("Running plugin probes");

  assert.deepEqual(writes, [
    "[2026-06-27T12:00:00.000Z] Waiting for Codex Plus runtime\n",
    "[2026-06-27T12:00:00.000Z] OK Runtime ready\n",
    "[2026-06-27T12:00:00.000Z] FAIL Running plugin probes\n",
  ]);
});
