const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const packageJson = require("../package.json");
const {
  defaultAuditTargetForSource,
  defaultTargetForSource,
  existingDefaultSource,
} = require("../src/core/app-identity");
const { buildLaunchDev } = require("../src/core/dev-mode");

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
  auditRequiredHostAdapters,
  auditIdentity,
  captureVisualContract,
  checkKeepOpenAppStability,
  cleanupLaunchedAuditApp,
  formatAuditJson: formatCoreAuditJson,
  createJsonlProgress,
  listCrashpadPendingDumps,
  listRunningAuditApps,
  pluginAuditExpression,
  runAudit,
  summarizeCdpEvents,
  verifyProjectSelectorShortcutKey,
  verifyReviewPanelRender,
  verifySidebarBlurCommandPalette,
  waitForAppShellMounted,
  writeAuditOutput,
} = require("../src/core/plugin-audit");

test("CDP diagnostics keep concise exception and console evidence", () => {
  const events = [
    { method: "Runtime.exceptionThrown", params: { exceptionDetails: { exception: { description: "TypeError: broken\n    at host.js:1:2" } } } },
    { method: "Runtime.consoleAPICalled", params: { type: "error", args: [{ value: "command failed" }, { description: "Error: detail\n    at plugin.js:3:4" }] } },
    { method: "Log.entryAdded", params: { entry: { level: "error", text: "renderer crashed", url: "app://-/host.js", lineNumber: 8 } } },
  ];

  assert.deepEqual(summarizeCdpEvents(events), [
    { method: "Runtime.exceptionThrown", type: "exception", text: "TypeError: broken\n    at host.js:1:2" },
    { method: "Runtime.consoleAPICalled", type: "error", text: "command failed | Error: detail\n    at plugin.js:3:4" },
    { method: "Log.entryAdded", type: "error", text: "renderer crashed", url: "app://-/host.js", line: 8 },
  ]);
});

test("required adapter bootstrap audit defers native side-panel binding until a thread mounts", async () => {
  const cdp = {
    evaluate() {
      return Promise.resolve({
        ok: false,
        missing: ["threadSidePanel.openFile(binding)", "threadSidePanel.mount(binding)"],
      });
    },
  };

  assert.deepEqual(await auditRequiredHostAdapters(cdp), { ok: true, missing: [] });
  await assert.rejects(
    auditRequiredHostAdapters(cdp, { requireBindings: true }),
    /threadSidePanel\.openFile\(binding\), threadSidePanel\.mount\(binding\)/,
  );
});

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
  assert.match(output, /--manual\s+Launch a manual audit app and skip plugin probes/);
  assert.doesNotMatch(output, /codex-plus apply/);
});

test("apply uses source-family production defaults", () => {
  const args = parseArgs(["apply"]);
  const defaultSource = existingDefaultSource();

  assert.equal(args.command, "apply");
  assert.equal(args.source, defaultSource);
  assert.equal(args.target, defaultTargetForSource(defaultSource));
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
    "--plugin",
    "projectColors",
    "--plugins",
    "devTools,mermaidFullscreen",
    "--disable-plugin",
    "projectColors",
    "--disable-plugins",
    "devTools,mermaidFullscreen",
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
  assert.equal(args.jsonl, false);
  assert.equal(args.quiet, true);
  assert.equal(args.noProgress, true);
  assert.equal(args.keepOpen, true);
  assert.equal(args.includeNativeOpenProbes, true);
  assert.equal(args.manual, false);
  assert.deepEqual(args.auditPlugins, ["projectColors", "devTools", "mermaidFullscreen"]);
  assert.deepEqual(args.disabledRuntimePlugins, ["projectColors", "devTools", "mermaidFullscreen"]);
  assert.equal(args.apply, false);
  assert.equal(args.launch, false);
  assert.equal(args.source, path.join(os.homedir(), "Codex.app"));
  assert.equal(args.target, path.join(os.homedir(), "audit/Codex Plus.app"));
  assert.equal(args.sourceHome, path.join(os.homedir(), "real-codex"));
  assert.equal(args.devHome, path.join(os.homedir(), "dev-codex"));
  assert.equal(args.electronUserDataPath, path.join(os.homedir(), "dev-electron"));
  assert.equal(args.devInstanceId, "manual-audit");
  assert.equal(args.remoteDebuggingPort, 9240);
  assert.equal(args.useLiveSourceHome, true);
  assert.equal(args.visualContract, true);

  const jsonlArgs = parseArgs(["audit-plugins", "--jsonl", "--artifact-dir", "~/contracts", "--no-visual-contract"]);
  assert.equal(jsonlArgs.jsonl, true);
  assert.equal(jsonlArgs.visualContract, false);
  assert.equal(jsonlArgs.artifactDir, path.join(os.homedir(), "contracts"));
  const detailedJsonl = parseArgs(["audit-plugins", "--json", "--jsonl"]);
  assert.equal(detailedJsonl.json, true);
  assert.equal(detailedJsonl.jsonl, true);

  const defaults = parseArgs(["audit-plugins"]);
  assert.equal(defaults.target, defaultAuditTargetForSource(existingDefaultSource()));
  assert.equal(defaults.remoteDebuggingPort, 9234);
  assert.equal(defaults.includeNativeOpenProbes, false);
  assert.equal(defaults.manual, false);
  assert.deepEqual(defaults.auditPlugins, []);
  assert.deepEqual(defaults.disabledRuntimePlugins, []);
  assert.equal(defaults.devInstanceId, "audit");
  assert.equal(defaults.useLiveSourceHome, false);
  assert.equal(defaults.visualContract, true);
});

test("audit-plugins manual mode parses and implies keep-open", () => {
  const args = parseArgs(["audit-plugins", "--manual"]);

  assert.equal(args.command, "audit-plugins");
  assert.equal(args.manual, true);
  assert.equal(args.keepOpen, true);

  const noApply = parseArgs(["audit-plugins", "--manual", "--no-apply"]);
  assert.equal(noApply.manual, true);
  assert.equal(noApply.keepOpen, true);
  assert.equal(noApply.apply, false);
});

test("formatResult prints a concise open command for created apps", () => {
  const output = formatResult({
    sourceApp: "/Applications/Codex.app",
    targetApp: "/tmp/codex-plus-audit/Applications/Codex Plus.app",
    patchSet: "codex-example",
    patches: ["bundle-identity"],
    addedFiles: ["webview/assets/codex-plus/runtime.js"],
    patchedAsarSha: "abc123",
    dryRun: false,
  });

  assert.match(output, /Codex Plus app created\./);
  assert.match(output, /Open: open "\/tmp\/codex-plus-audit\/Applications\/Codex Plus\.app"/);
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
      codexVersion: "26.623.41415",
      bundleVersion: "4505",
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
      hasNewChatText: true,
      bodyTextSampleLength: 42,
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

test("audit human formatter prints manual launch summary", () => {
  const output = formatAuditResult(sampleAuditResult({
    manual: true,
    probesSkipped: true,
    pluginResults: {},
    devToolsUrl: "http://127.0.0.1:9234/json/list",
    electronUserDataPath: "/repo/work/codex-plus-electron-user-data",
    cleanupResult: {
      attempted: false,
      keptOpen: true,
      ok: true,
      pid: 123,
    },
    preflight: {
      suggestedCommand: "codex-plus-patcher audit-plugins --no-apply --no-launch --keep-open --port 9234",
    },
  }));

  assert.match(output, /Manual audit app launched\./);
  assert.match(output, /Plugin probes skipped because --manual was set\./);
  assert.match(output, /Source: \/Applications\/Codex\.app/);
  assert.match(output, /Base app: Codex 26\.623\.41415 \(bundle 4505\)/);
  assert.match(output, /Patch set: codex-26\.623\.41415-4505/);
  assert.match(output, /DevTools: http:\/\/127\.0\.0\.1:9234\/json\/list/);
  assert.match(output, /Target: \/repo\/work\/Codex Plus\.app/);
  assert.match(output, /Dev home: \/repo\/work\/codex-plus-dev-home/);
  assert.match(output, /Electron user data: \/repo\/work\/codex-plus-electron-user-data/);
  assert.match(output, /PID: 123/);
  assert.match(output, /Attach command: codex-plus-patcher audit-plugins --no-apply --no-launch --keep-open --port 9234/);
  assert.doesNotMatch(output, /All plugin probes passed/);
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

test("audit json formatter preserves manual launch fields", () => {
  const parsed = JSON.parse(formatAuditJson(sampleAuditResult({
    manual: true,
    probesSkipped: true,
    pluginResults: {},
    devToolsUrl: "http://127.0.0.1:9234/json/list",
  })));

  assert.equal(parsed.manual, true);
  assert.equal(parsed.probesSkipped, true);
  assert.equal(parsed.devToolsUrl, "http://127.0.0.1:9234/json/list");
  assert.deepEqual(parsed.pluginResults, {});
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
  const focusedExpression = pluginAuditExpression({ auditPlugins: ["projectColors"] });

  assert.match(defaultExpression, /"includeNativeOpenProbes":false/);
  assert.match(strictExpression, /"includeNativeOpenProbes":true/);
  assert.match(focusedExpression, /"auditPlugins":\["projectColors"\]/);
  assert.match(focusedExpression, /shouldProbe = \(id\) => !disabledPlugins\.has\(id\) && \(focusedPlugins\.length === 0 \|\| focusedPlugins\.includes\(id\)\)/);
  assert.match(defaultExpression, /if \(options\.includeNativeOpenProbes\)/);
  assert.match(defaultExpression, /window\.CodexPlus\.commands\.run\("codexPlusOpenDevTools"\)/);
  assert.match(defaultExpression, /window\.CodexPlus\.native\.request\("mermaid\/openViewer"/);
  assert.match(defaultExpression, /previous = root\.getAttribute\("data-codex-plus-sidebar-names-blurred"\)/);
  assert.match(defaultExpression, /finally \{/);
  assert.match(defaultExpression, /root\.removeAttribute\("data-codex-plus-sidebar-names-blurred"\)/);
  assert.match(defaultExpression, /root\.setAttribute\("data-codex-plus-sidebar-names-blurred", previous\)/);
  assert.match(defaultExpression, /Sidebar blur computed style is not active on a visible project or thread row/);
  assert.match(defaultExpression, /Sidebar blur should not blur the entire visible sidebar scroll container/);
  assert.match(defaultExpression, /Live Mermaid diagrams missing popout buttons/);
  assert.match(defaultExpression, /liveDiagramCount/);
  assert.match(defaultExpression, /Project sidebar child rows or list containers are not styled like their project rows/);
  assert.match(defaultExpression, /Mounted composer does not carry the selected project accent/);
  assert.match(defaultExpression, /Mounted composer lost its rounded shape/);
  assert.match(defaultExpression, /waitForMountedProjectComposer/);
  assert.match(defaultExpression, /data-app-action-sidebar-project-list-id/);
  assert.match(defaultExpression, /data-codex-plus-project-sidebar-color/);
  assert.match(defaultExpression, /composerPermissionPickerStatus/);
  assert.match(defaultExpression, /text-editor:local:/);
  assert.match(defaultExpression, /composerContrastStatus/);
  assert.match(defaultExpression, /Ask for approval/);
  assert.match(defaultExpression, /Approve for me/);
  assert.match(defaultExpression, /data-codex-plus-rich-content/);
  assert.match(defaultExpression, /composerControlContrast/);
  assert.match(defaultExpression, /occludingDescendants/);
  assert.match(defaultExpression, /Composer custom color is covered by a differently colored child surface/);
  assert.match(defaultExpression, /userBubbleShapeStatus/);
  assert.match(defaultExpression, /User message wrapper painted behind the rounded bubble/);
  assert.match(defaultExpression, /\[data-user-message-bubble\]/);
  assert.match(defaultExpression, /nativeBubbleMounted/);
  assert.match(defaultExpression, /decorationsUseMutedForeground/);
  assert.match(defaultExpression, /User message decorations do not use the transcript muted foreground/);
  assert.match(defaultExpression, /composerAttachmentPillStatus/);
  assert.match(defaultExpression, /const expectedWarnings = \[\]/);
  assert.match(defaultExpression, /const warn = \(id, code, message, details = \{\}\)/);
  assert.match(defaultExpression, /Composer permissions picker text is unreadable/);
  assert.match(defaultExpression, /Composer attachment pill text is unreadable/);
  assert.match(defaultExpression, /pillBackground/);
  assert.match(defaultExpression, /color\\\(srgb/);
  assert.match(defaultExpression, /composer-attachment-surface/);
  assert.match(defaultExpression, /cardSurface/);
  assert.match(defaultExpression, /composer-permission-picker-disabled/);
  assert.match(defaultExpression, /expectedWarnings/);
  assert.match(defaultExpression, /triggerAriaDisabled/);
  assert.match(defaultExpression, /surfaceBackground/);
  assert.match(defaultExpression, /labelTextFillTransparent/);
  assert.match(defaultExpression, /composerAttachmentPill/);
  assert.match(defaultExpression, /webkitTextFillColor/);
  assert.doesNotMatch(defaultExpression, /Project selector trigger is missing from the main composer/);
  assert.doesNotMatch(defaultExpression, /newChatButton\.click\(\)/);
  assert.match(defaultExpression, /if \(!fixtureThreadActive\) newChatButton\?\.click/);
  assert.match(defaultExpression, /includes\("New chat"\)/);
  assert.match(defaultExpression, /input\[placeholder='Search projects'\]/);
  assert.match(defaultExpression, /syntheticShortcut/);
  assert.match(defaultExpression, /workspaceRoot: "\/tmp\/header-project"/);
  assert.doesNotMatch(defaultExpression, /projectName:\s*\{/);
  assert.match(defaultExpression, /closest\("header"\)\?\.textContent\)\.includes\("Fixture:"\)/);
  assert.doesNotMatch(defaultExpression, /commandFallback/);
  assert.doesNotMatch(defaultExpression, /projectlessThreadRow\?\.click/);
});

test("project selector shortcut verifier uses trusted CDP key events", async () => {
  const sent = [];
  const expressions = [];
  const evaluations = [
    { triggerCount: 0, newTask: { x: 80, y: 40 } },
    { triggerCount: 1, newTask: null },
    { triggerCount: 0, menuCount: 1, opened: true, activePlaceholder: "Search projects" },
    {
      suitableProjectFound: true,
      queryLength: 3,
      visibleResultCount: 2,
      selectedProjectStillVisible: true,
      noProjectsFoundVisible: false,
      highlightCount: 2,
    },
  ];
  const cdp = {
    send(method, params) {
      sent.push({ method, params });
      return Promise.resolve();
    },
    evaluate(expression) {
      expressions.push(expression);
      return Promise.resolve(evaluations.shift());
    },
  };

  const result = await verifyProjectSelectorShortcutKey(cdp, { wait() {}, timeoutMs: 1000 });

  assert.equal(result.ok, true);
  assert.equal(result.opened, true);
  assert.deepEqual(result.fuzzyDom, {
    suitableProjectFound: true,
    queryLength: 3,
    visibleResultCount: 2,
    selectedProjectStillVisible: true,
    noProjectsFoundVisible: false,
    highlightCount: 2,
  });
  assert.equal(Object.prototype.hasOwnProperty.call(result.fuzzyDom, "label"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result.fuzzyDom, "path"), false);
  expressions.forEach((expression, index) => {
    assert.doesNotThrow(() => new Function(`return (${expression})`), `browser expression ${index} must parse`);
  });
  assert.match(expressions[0], /data-codex-plus-project-selector-trigger/);
  assert.match(expressions[0], /New chat|New task/);
  assert.match(expressions[0], /startsWith\(\"New task\"\)/);
  assert.doesNotMatch(expressions[0], /\.click/);
  assert.match(expressions[3], /const currentMenu = \(\) =>/);
  assert.match(expressions[3], /candidates\.find\(\(element\) => visible\(element\) && element\.contains\(input\)\)/);
  assert.match(expressions[3], /input\[placeholder='Search projects'\], textarea\[placeholder='Search projects'\]/);
  assert.match(expressions[3], /HTMLTextAreaElement\.prototype/);
  assert.match(expressions[3], /const menu = currentMenu\(\);/);
  assert.match(expressions[3], /const selectable = Array\.from\(menu\.querySelectorAll\("\[role='menuitem'\], \[role='option'\], button, a"\)\)\.filter\(visible\)/);
  assert.match(expressions[3], /const labelRoots = selectable\.length > 0/);
  assert.deepEqual(sent.map((call) => call.method), [
    "Input.dispatchMouseEvent",
    "Input.dispatchMouseEvent",
    "Page.bringToFront",
    "Input.dispatchKeyEvent",
    "Input.dispatchKeyEvent",
    "Input.dispatchKeyEvent",
    "Input.dispatchKeyEvent",
    "Input.dispatchKeyEvent",
    "Input.dispatchKeyEvent",
  ]);
  assert.deepEqual(sent[3].params, {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 53,
  });
  assert.deepEqual(sent[4].params, {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 53,
  });
  assert.deepEqual(sent[5].params, {
    type: "keyDown",
    key: ".",
    code: "Period",
    windowsVirtualKeyCode: 190,
    nativeVirtualKeyCode: 47,
    modifiers: 4,
  });
  assert.deepEqual(sent[6].params, {
    type: "keyUp",
    key: ".",
    code: "Period",
    windowsVirtualKeyCode: 190,
    nativeVirtualKeyCode: 47,
    modifiers: 4,
  });
});

test("project selector shortcut verifier retries the trusted shortcut while the menu stays closed", async () => {
  const sent = [];
  const evaluations = [
    { triggerCount: 1, newTask: null },
    { triggerCount: 1, menuCount: 0, opened: false, activePlaceholder: "" },
    { triggerCount: 1, menuCount: 1, opened: true, activePlaceholder: "Search projects" },
    {
      suitableProjectFound: true,
      queryLength: 3,
      visibleResultCount: 1,
      selectedProjectStillVisible: true,
      noProjectsFoundVisible: false,
      highlightCount: 1,
    },
  ];
  const cdp = {
    send(method, params) {
      sent.push({ method, params });
      return Promise.resolve();
    },
    evaluate() {
      return Promise.resolve(evaluations.shift());
    },
  };

  const result = await verifyProjectSelectorShortcutKey(cdp, { wait() {}, timeoutMs: 1000, retryIntervalMs: 0 });

  assert.equal(result.ok, true);
  assert.equal(sent.filter((call) => call.method === "Input.dispatchKeyEvent" && call.params.key === ".").length, 4);
});

test("fixture activation verifies the canonical active cwd and retries the stable thread identity", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/core/plugin-audit.js"), "utf8");
  const start = source.indexOf("async function activateFixtureThread");
  const end = source.indexOf("async function verifySidebarBlurCommandPalette", start);
  const activation = source.slice(start, end);

  assert.match(activation, /CodexPlusHost\.adapters\.context\.active\(\)/);
  assert.match(activation, /activeContext\?\.cwd/);
  assert.match(activation, /target\.title/);
  assert.match(activation, /data-app-action-sidebar-thread-title/);
  assert.match(activation, /target\.path/);
  assert.match(activation, /data-app-action-sidebar-project-row.*aria-expanded='false'/);
  assert.match(activation, /aria-label='Expand project'/);
  assert.match(activation, /activateTargetWithKeyboard/);
  assert.match(activation, /Input\.dispatchKeyEvent/);
  assert.match(activation, /key: "Enter"/);
  assert.doesNotMatch(activation, /target\.rowText/);
  assert.doesNotMatch(activation, /replace\(\/\\s\+\/g/);
  assert.match(activation, /JSON\.stringify\(\{ target, active \}\)/);
  assert.doesNotMatch(activation, /active\.chipPath === target\.path/);
  assert.doesNotMatch(activation, /getAttribute\("data-codex-plus-project-path"\) ===/);
});

test("default audit closes the isolated Aharness route without reloading fixture state", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/core/plugin-audit.js"), "utf8");
  const start = source.indexOf("if (splitAharnessProbe) {");
  const end = source.indexOf("const live = await withAuditProgress", start);
  const isolatedProbe = source.slice(start, end);

  assert.match(isolatedProbe, /Closing isolated Aharness route/);
  assert.match(isolatedProbe, /closeVirtualRoute\(cdp\)/);
  assert.match(isolatedProbe, /activateFixture\(cdp, \{ nested: true \}\)/);
  assert.doesNotMatch(isolatedProbe, /reloadRenderer/);
  assert.doesNotMatch(isolatedProbe, /seedFixtureBrowserState/);
});

test("aharness artifact audit recognizes both native app-shell tab layouts", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/core/plugin-audit.js"), "utf8");
  const start = source.indexOf("const nativeFileTabsBeforeArtifact");
  const end = source.indexOf("const routeAfterArtifact", start);
  const artifactAudit = source.slice(start, end);

  assert.match(artifactAudit, /data-app-shell-tabs/);
  assert.match(artifactAudit, /data-app-shell-tab-strip-controller/);
  assert.match(artifactAudit, /data-app-shell-tab-panel-controller/);
  assert.match(artifactAudit, /artifactCommonShell/);
  assert.match(artifactAudit, /new Set/);
});

test("aharness sidebar placement uses document order instead of scroll-relative coordinates", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/core/plugin-audit.js"), "utf8");
  const start = source.indexOf("const harnessSidebar = document.querySelector");
  const end = source.indexOf("const waitForHarnessProjectColor", start);
  const placementAudit = source.slice(start, end);

  assert.match(placementAudit, /compareDocumentPosition/);
  assert.match(placementAudit, /Node\.DOCUMENT_POSITION_FOLLOWING/);
  assert.doesNotMatch(placementAudit, /harnessRect\.top/);
});

test("project selector shortcut verifier fails with fuzzy DOM details diagnostic", async () => {
  const sent = [];
  const evaluations = [
    { triggerCount: 1, newTask: null },
    { triggerCount: 1, menuCount: 1, opened: true, activePlaceholder: "Search projects" },
    {
      suitableProjectFound: false,
      queryLength: 0,
      visibleResultCount: 0,
      selectedProjectStillVisible: false,
      noProjectsFoundVisible: false,
      highlightCount: 0,
    },
  ];
  const cdp = {
    send(method, params) {
      sent.push({ method, params });
      return Promise.resolve();
    },
    evaluate() {
      return Promise.resolve(evaluations.shift());
    },
  };

  const result = await verifyProjectSelectorShortcutKey(cdp, { wait() {}, timeoutMs: 1000 });

  assert.equal(result.ok, false);
  assert.equal(result.opened, true);
  assert.equal(result.fuzzyDom.suitableProjectFound, false);
  assert.match(result.message, /Project selector fuzzy filtering did not preserve/);
  assert.equal(JSON.stringify(result).includes("/"), false);
  assert.deepEqual(sent.filter((call) => call.method === "Input.dispatchKeyEvent").map((call) => call.params.key), ["Escape", "Escape", ".", ".", "Escape", "Escape"]);
});

test("sidebar blur command palette verifier uses trusted Enter key activation", async () => {
  const sent = [];
  const evaluations = [
    undefined,
    undefined,
    { opened: true, activeTag: "INPUT", inputPlaceholder: "Search commands" },
    { selected: true, itemText: "Toggle sidebar blur", rect: { x: 64, y: 32 } },
    { rootBlurred: true, rowFilter: "blur(4px)" },
  ];
  const cdp = {
    send(method, params) {
      sent.push({ method, params });
      return Promise.resolve();
    },
    evaluate() {
      return Promise.resolve(evaluations.shift());
    },
  };

  const result = await verifySidebarBlurCommandPalette(cdp, { wait() {}, timeoutMs: 1000 });

  assert.equal(result.ok, true);
  assert.equal(result.selected, true);
  assert.deepEqual(sent.map((call) => call.method), [
    "Input.insertText",
    "Input.dispatchKeyEvent",
    "Input.dispatchKeyEvent",
  ]);
  assert.equal(sent[0].params.text, "Toggle sidebar blur");
  assert.deepEqual(sent.slice(1).map((call) => call.params.type), ["keyDown", "keyUp"]);
  assert.deepEqual(sent.slice(1).map((call) => call.params.key), ["Enter", "Enter"]);
});

test("review panel verifier returns sanitized success details", async () => {
  const result = await verifyReviewPanelRender({
    evaluate() {
      return Promise.resolve({
        candidateCount: 3,
        attemptedCandidates: 1,
        reviewControlFound: true,
        clickedReview: true,
        selectedReview: true,
        boundaryVisible: false,
        tryAgainVisible: false,
        repoHeaderVisible: true,
        mainVisible: true,
        nativeReviewSourceVisible: true,
        unstagedReviewSourceSelected: true,
        reviewToolbarFailureVisible: false,
        nestedRepoVisible: true,
        strictNestedBranchPreload: true,
        nestedBranchPickerCount: 2,
        nestedBranchPickerPreloadBeforeOpen: true,
        nestedBranchPickerPreloadComplete: true,
        nestedBranchPickerPopulated: true,
        nestedBranchPickerOptionCounts: [3, 3],
        nestedBranchPickerDetails: [
          { kind: "submodule", path: "repos/alpha-module", branchCount: 3, currentBranch: "main", branchLoadState: "loaded", branchLoadError: "" },
          { kind: "configured", path: "repos/beta-module", branchCount: 3, currentBranch: "main", branchLoadState: "loaded", branchLoadError: "" },
        ],
        rawNestedDiffFallbackCount: 0,
        reviewDiffCardCount: 3,
        nestedDiffCardCount: 2,
        nestedDiffDisclosureExpanded: true,
        nestedDiffDisclosureCollapsed: true,
        reviewTabCount: 1,
      });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.candidateCount, 3);
  assert.equal(result.reviewControlFound, true);
  assert.deepEqual(result.nestedBranchPickerOptionCounts, [3, 3]);
  assert.deepEqual(result.nestedBranchPickerDetails.map((detail) => detail.branchLoadState), ["loaded", "loaded"]);
  assert.equal(result.rawNestedDiffFallbackCount, 0);
  assert.equal(result.reviewDiffCardCount, 3);
  assert.equal(result.nestedDiffDisclosureExpanded, true);
  assert.equal(result.nestedDiffDisclosureCollapsed, true);
  assert.equal(result.message, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(result, "title"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, "path"), false);
});

test("review panel verifier rejects raw nested repository diffs", async () => {
  const result = await verifyReviewPanelRender({
    evaluate() {
      return Promise.resolve({
        candidateCount: 3,
        attemptedCandidates: 1,
        reviewControlFound: true,
        clickedReview: true,
        selectedReview: true,
        boundaryVisible: false,
        tryAgainVisible: false,
        repoHeaderVisible: true,
        mainVisible: true,
        nativeReviewSourceVisible: true,
        nestedRepoVisible: true,
        nestedBranchPickerCount: 2,
        nestedBranchPickerPopulated: true,
        nestedBranchPickerOptionCounts: [1, 1],
        nestedBranchPickerDetails: [
          { kind: "submodule", path: "repos/alpha-module", branchCount: 1, currentBranch: "", branchLoadState: "error", branchLoadError: "blocked" },
          { kind: "configured", path: "repos/beta-module", branchCount: 1, currentBranch: "", branchLoadState: "empty", branchLoadError: "" },
        ],
        rawNestedDiffFallbackCount: 2,
        reviewDiffCardCount: 0,
        reviewTabCount: 1,
      });
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.rawNestedDiffFallbackCount, 2);
  assert.equal(result.reviewDiffCardCount, 0);
  assert.deepEqual(result.nestedBranchPickerDetails.map((detail) => detail.branchLoadState), ["error", "empty"]);
  assert.equal(result.message, "Review panel did not render nested repository content");
});

test("review panel verifier rejects Branch proof and nested toolbar failures", async () => {
  const base = {
    candidateCount: 3,
    attemptedCandidates: 1,
    reviewControlFound: true,
    clickedReview: true,
    selectedReview: true,
    boundaryVisible: false,
    boundaryEverVisible: false,
    tryAgainVisible: false,
    repoHeaderVisible: true,
    mainVisible: true,
    nativeReviewSourceVisible: true,
    nestedRepoVisible: true,
    strictNestedBranchPreload: true,
    nestedBranchPickerCount: 2,
    nestedBranchPickerPreloadBeforeOpen: true,
    nestedBranchPickerPreloadComplete: true,
    nestedBranchPickerPopulated: true,
    nestedBranchPickerOptionCounts: [3, 3],
    rawNestedDiffFallbackCount: 0,
    reviewDiffCardCount: 3,
    nestedDiffCardCount: 2,
    nestedDiffDisclosureExpanded: true,
    nestedDiffDisclosureCollapsed: true,
  };
  const branch = await verifyReviewPanelRender({ evaluate: () => Promise.resolve({ ...base, unstagedReviewSourceSelected: false, reviewToolbarFailureVisible: false }) });
  const toolbarFailure = await verifyReviewPanelRender({ evaluate: () => Promise.resolve({ ...base, unstagedReviewSourceSelected: true, reviewToolbarFailureVisible: true }) });

  assert.equal(branch.ok, false);
  assert.equal(toolbarFailure.ok, false);
});

test("review panel verifier scopes Unstaged selection to the native Branch menu", () => {
  const source = verifyReviewPanelRender.toString();

  assert.match(source, /getAttribute\("aria-controls"\)/);
  assert.match(source, /initialExpanded = toggle\.getAttribute\("data-app-action-review-file-expanded"\) === "true"/);
  assert.match(source, /toggledExpanded !== initialExpanded && restoredExpanded === initialExpanded/);
  assert.match(source, /Math\.max\(initialHeight, toggledHeight\)/);
  assert.match(source, /Math\.min\(initialHeight, toggledHeight\)/);
  assert.doesNotMatch(source, /selectUnstagedReviewSource/);
  assert.doesNotMatch(source, /loadNestedBranchPickers/);
});

test("review panel verifier fails when no review-capable thread exists", async () => {
  const result = await verifyReviewPanelRender({
    evaluate() {
      return Promise.resolve({
        candidateCount: 2,
        attemptedCandidates: 2,
        reviewControlFound: false,
        clickedReview: false,
        selectedReview: false,
        boundaryVisible: false,
        tryAgainVisible: false,
        repoHeaderVisible: false,
        mainVisible: false,
        reviewTabCount: 0,
      });
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.message, "No review-capable thread was found");
  assert.deepEqual(Object.keys(result).sort(), [
    "attemptedCandidates",
    "boundaryVisible",
    "candidateCount",
    "clickedReview",
    "mainVisible",
    "message",
    "ok",
    "repoHeaderVisible",
    "reviewControlFound",
    "reviewTabCount",
    "selectedReview",
    "tryAgainVisible",
  ].sort());
});

test("review panel verifier fails when the tab boundary is visible", async () => {
  const result = await verifyReviewPanelRender({
    evaluate() {
      return Promise.resolve({
        candidateCount: 1,
        attemptedCandidates: 0,
        reviewControlFound: true,
        clickedReview: true,
        selectedReview: true,
        boundaryVisible: true,
        tryAgainVisible: true,
        repoHeaderVisible: false,
        mainVisible: false,
        reviewTabCount: 1,
      });
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.message, "Review panel did not render nested repository content");
  assert.equal(result.boundaryVisible, true);
  assert.equal(result.tryAgainVisible, true);
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
        evaluate(expression) {
          calls += 1;
          assert.match(expression, /openai-blossom-shimmer/);
          return Promise.resolve({
            readyState: "complete",
            hasRoot: true,
            hasStartupLoader: true,
            bodyTextLength: 0,
            elementCount: 141,
            interactiveCount: 0,
            hasNewChatText: false,
            bodyTextSampleLength: 0,
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
      hasNewChatText: false,
      bodyTextSampleLength: 0,
    },
    {
      readyState: "complete",
      hasRoot: true,
      hasStartupLoader: false,
      bodyTextLength: 8,
      elementCount: 400,
      interactiveCount: 3,
      hasNewChatText: true,
      bodyTextSampleLength: 8,
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
  assert.equal(status.hasNewChatText, true);
  assert.equal(status.bodyTextSampleLength, 8);
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
            hasNewChatText: false,
            bodyTextSampleLength: 50,
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
        buildAuditFixture() { return Promise.resolve({ mode: "fixture", files: [] }); },
        seedAuditFixtureBrowserState() { return Promise.resolve({}); },
        launchDevApp() { return Promise.resolve({ pid: 123, command: "Codex", args: [] }); },
        waitForRendererTarget() {
          return Promise.resolve({ url: "app://-/index.html", webSocketDebuggerUrl: "ws://127.0.0.1:9234/devtools/page/1" });
        },
        CdpSession: FakeCdpSession,
        reloadAuditRenderer: async () => ({ ok: true, readyState: "complete" }),
        closeActiveVirtualRoute: async () => ({ ok: true, activeRouteId: "", routeContext: null, hash: "" }),
        activateFixtureThread: async () => ({ ok: true }),
        waitForLiveRuntime() { return Promise.resolve({ registered: 0, started: 0 }); },
        waitForAppShellMounted() {
          shellChecks += 1;
          if (shellChecks === 2) throw new Error("Codex app shell rendered error boundary");
          return Promise.resolve({ hasErrorBoundary: false, hasNewChatText: true });
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
  const progressEvents = [];
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
      progress: {
        start(text) { progressEvents.push(["start", text]); },
        succeed(text) { progressEvents.push(["succeed", text]); },
        fail(text) { progressEvents.push(["fail", text]); },
      },
      operations: {
        auditPreflight() {
          return Promise.resolve({ port: 9234, launch: false, reuseExisting: true });
        },
        syncDevHome() { return Promise.resolve({ copied: [] }); },
        waitForRendererTarget() {
          return Promise.resolve({ url: "app://-/index.html", webSocketDebuggerUrl: "ws://127.0.0.1:9234/devtools/page/1" });
        },
        CdpSession: FakeCdpSession,
        reloadAuditRenderer: async () => ({ ok: true, readyState: "complete" }),
        closeActiveVirtualRoute: async () => ({ ok: true, activeRouteId: "", routeContext: null, hash: "" }),
        activateFixtureThread: async () => ({ ok: true }),
        waitForLiveRuntime() { return Promise.resolve({ registered: 1, started: 1 }); },
        waitForAppShellMounted() { return Promise.resolve({ hasErrorBoundary: false, hasNewChatText: true }); },
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
  assert.ok(progressEvents.some(([kind, text]) => kind === "fail" && text === "Verifying Mermaid viewer render"));
  assert.equal(progressEvents.some(([kind, text]) => kind === "succeed" && text === "Mermaid viewer rendered"), false);
});

test("runAudit progress fails when the required project selector verifier returns not ok on every source family", async () => {
  const progressEvents = [];
  class FakeCdpSession {
    connect() { return Promise.resolve(); }
    send() { return Promise.resolve(); }
    evaluate() {
      return Promise.resolve({
        ok: true,
        failures: [],
        pluginResults: {
          projectSelectorShortcut: {
            ok: true,
            registered: true,
            started: true,
          },
        },
        registeredPlugins: ["projectSelectorShortcut"],
        runtimeStatus: { config: { sourceFamily: "codex" } },
        startedPlugins: ["projectSelectorShortcut"],
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
      progress: {
        start(text) { progressEvents.push(["start", text]); },
        succeed(text) { progressEvents.push(["succeed", text]); },
        fail(text) { progressEvents.push(["fail", text]); },
      },
      operations: {
        auditPreflight() {
          return Promise.resolve({ port: 9234, launch: false, reuseExisting: true });
        },
        waitForRendererTarget() {
          return Promise.resolve({ url: "app://-/index.html", webSocketDebuggerUrl: "ws://127.0.0.1:9234/devtools/page/1" });
        },
        CdpSession: FakeCdpSession,
        reloadAuditRenderer: async () => ({ ok: true, readyState: "complete" }),
        closeActiveVirtualRoute: async () => ({ ok: true, activeRouteId: "", routeContext: null, hash: "" }),
        activateFixtureThread: async () => ({ ok: true }),
        waitForLiveRuntime() { return Promise.resolve({ registered: 1, started: 1 }); },
        waitForAppShellMounted() { return Promise.resolve({ hasErrorBoundary: false, hasNewChatText: true }); },
        verifyProjectSelectorShortcutKey() {
          return Promise.resolve({
            ok: false,
            message: "Project selector fuzzy filtering did not preserve and highlight a visible project",
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
  assert.equal(result.pluginResults.projectSelectorShortcut.ok, false);
  assert.deepEqual(result.failures, [{
    plugin: "projectSelectorShortcut",
    message: "Project selector fuzzy filtering did not preserve and highlight a visible project",
  }]);
  assert.ok(progressEvents.some(([kind, text]) => kind === "fail" && text === "Verifying project selector shortcut and fuzzy match"));
  assert.equal(progressEvents.some(([kind, text]) => kind === "succeed" && text === "Project selector shortcut fuzzy match passed"), false);
});

test("runAudit fails when the Review panel live probe cannot find a review thread", async () => {
  const fixtureActivations = [];
  class FakeCdpSession {
    connect() { return Promise.resolve(); }
    send() { return Promise.resolve(); }
    evaluate() {
      return Promise.resolve({
        ok: true,
        failures: [],
        pluginResults: {
          nestedRepositories: {
            ok: true,
            registered: true,
            started: true,
            hostModuleRegistered: true,
            reviewWrapped: true,
          },
        },
        registeredPlugins: ["nestedRepositories"],
        startedPlugins: ["nestedRepositories"],
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
        reloadAuditRenderer: async () => ({ ok: true, readyState: "complete" }),
        closeActiveVirtualRoute: async () => ({ ok: true, activeRouteId: "", routeContext: null, hash: "" }),
        activateFixtureThread: async (_cdp, options = {}) => {
          fixtureActivations.push(options);
          return { ok: true };
        },
        waitForLiveRuntime() { return Promise.resolve({ registered: 1, started: 1 }); },
        waitForAppShellMounted() { return Promise.resolve({ hasErrorBoundary: false, hasNewChatText: true }); },
        verifyReviewPanelRender() {
          return Promise.resolve({
            ok: false,
            message: "No review-capable thread was found",
            candidateCount: 0,
            attemptedCandidates: 0,
            reviewControlFound: false,
            boundaryVisible: false,
            tryAgainVisible: false,
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
  assert.equal(result.pluginResults.nestedRepositories.ok, false);
  assert.equal(result.pluginResults.nestedRepositories.reviewPanel.ok, false);
  assert.deepEqual(result.failures, [{
    plugin: "nestedRepositories",
    message: "No review-capable thread was found",
  }]);
  assert.equal(fixtureActivations.some((options) => options.nested === true), true);
  assert.equal(JSON.stringify(result.pluginResults.nestedRepositories.reviewPanel).includes("/"), false);
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
        buildAuditFixture() { return Promise.resolve({ mode: "fixture", files: [] }); },
        seedAuditFixtureBrowserState() { return Promise.resolve({}); },
        launchDevApp() { return Promise.resolve({ pid: 123, command: "Codex", args: [] }); },
        waitForRendererTarget() {
          return Promise.resolve({
            url: "app://-/index.html",
            webSocketDebuggerUrl: "ws://127.0.0.1:9234/devtools/page/1",
          });
        },
        CdpSession: FakeCdpSession,
        reloadAuditRenderer: async () => ({ ok: true, readyState: "complete" }),
        closeActiveVirtualRoute: async () => ({ ok: true, activeRouteId: "", routeContext: null, hash: "" }),
        activateFixtureThread() { return Promise.resolve({ ok: true }); },
        verifyProjectSelectorShortcutKey() { return Promise.resolve({ ok: true }); },
        waitForLiveRuntime() { return Promise.resolve({ registered: 2, started: 2 }); },
        waitForAppShellMounted() {
          return Promise.resolve({
            readyState: "complete",
            hasRoot: true,
            hasStartupLoader: false,
            bodyTextLength: 42,
            elementCount: 100,
            interactiveCount: 5,
            hasNewChatText: true,
            bodyTextSampleLength: 42,
          });
        },
        auditRequiredHostAdapters() { return Promise.resolve({ ok: true, missing: [], bindings: { mount: true, openFile: true } }); },
        dismissStartupDialogs() { return Promise.resolve({ present: false, dismissed: false }); },
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
  assert.equal(progressEvents.some(([status, text]) => status === "start" && text === "Checking kept-open audit app stability"), true);
  assert.equal(progressEvents.some(([status, text]) => status === "fail" && text === "Checking kept-open audit app stability"), true);
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
    "  124 /repo/work/Codex Plus.app/Contents/Frameworks/Codex Helper.app/Contents/MacOS/Codex Helper --type=utility --user-data-dir=/repo/work/codex-plus-electron-user-data --remote-debugging-port=9234",
    "  125 /repo/work/codex-plus-dev-home/computer-use/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService",
    "  126 /repo/work/Codex Plus.app/Contents/Frameworks/Codex Framework.framework/Helpers/browser_crashpad_handler --database=/repo/work/codex-plus-electron-user-data/Crashpad",
    "  127 /repo/work/Codex Plus.app/Contents/Resources/codex app-server --analytics-default-enabled",
    "  456 /repo/work/Codex Plus.app/Contents/MacOS/Codex --user-data-dir=/tmp/other --remote-debugging-port=9235",
    "  789 /other/Codex Plus.app/Contents/MacOS/Codex --user-data-dir=/repo/work/codex-plus-electron-user-data --remote-debugging-port=9236",
  ].join("\n");
  const running = listRunningAuditApps({
    targetApp: "/repo/work/Codex Plus.app",
    devHome: "/repo/work/codex-plus-dev-home",
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
  }, {
    pid: 124,
    command: "/repo/work/Codex Plus.app/Contents/Frameworks/Codex Helper.app/Contents/MacOS/Codex Helper --type=utility --user-data-dir=/repo/work/codex-plus-electron-user-data --remote-debugging-port=9234",
    remoteDebuggingPort: 9234,
  }, {
    pid: 125,
    command: "/repo/work/codex-plus-dev-home/computer-use/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService",
    remoteDebuggingPort: null,
  }]);

  const cleanupProcesses = listRunningAuditApps({
    targetApp: "/repo/work/Codex Plus.app",
    devHome: "/repo/work/codex-plus-dev-home",
    electronUserDataPath: "/repo/work/codex-plus-electron-user-data",
    includeTargetProcesses: true,
    execFileSync() {
      return rows;
    },
  });
  assert.deepEqual(cleanupProcesses.map(({ pid }) => pid), [123, 124, 125, 126, 127, 456]);
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
        reloadAuditRenderer: async () => ({ ok: true, readyState: "complete" }),
        closeActiveVirtualRoute: async () => ({ ok: true, activeRouteId: "", routeContext: null, hash: "" }),
        activateFixtureThread: async () => ({ ok: true }),
        waitForLiveRuntime() { return Promise.resolve({ registered: 1, started: 1 }); },
        waitForAppShellMounted() {
          return Promise.resolve({
            readyState: "complete",
            hasRoot: true,
            hasStartupLoader: false,
            bodyTextLength: 42,
            elementCount: 100,
            interactiveCount: 5,
            hasNewChatText: true,
            bodyTextSampleLength: 42,
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

test("runAudit manual mode launches and skips plugin probes and cleanup", async () => {
  const progressEvents = [];
  const calls = [];
  let launchCount = 0;
  let rendererWaitCount = 0;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-plus-chatgpt-audit-"));
  const chatgptSource = path.join(tmpDir, "ChatGPT.app");
  fs.mkdirSync(path.join(chatgptSource, "Contents"), { recursive: true });
  fs.writeFileSync(path.join(chatgptSource, "Contents", "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.openai.chat</string>
<key>CFBundleExecutable</key><string>ChatGPT</string>
</dict></plist>
`);
  class FakeCdpSession {
    connect() {
      calls.push("connect");
      return Promise.resolve();
    }
    send(method) {
      calls.push(["send", method]);
      return Promise.resolve();
    }
    evaluate() {
      throw new Error("manual mode must not run plugin probes");
    }
    close() {
      calls.push("close");
      return Promise.resolve();
    }
  }

  const result = await runAudit(
    {
      source: chatgptSource,
      target: "/repo/work/Codex Plus.app",
      sourceHome: "/repo/source-home",
      devHome: "/repo/dev-home",
      electronUserDataPath: "/repo/electron-user-data",
      remoteDebuggingPort: 9234,
      apply: true,
      launch: true,
      keepOpen: true,
      manual: true,
      includeNativeOpenProbes: false,
      disabledRuntimePlugins: ["projectColors"],
      visualContract: true,
    },
    {
      progress: {
        start(text) { progressEvents.push(["start", text]); },
        succeed(text) { progressEvents.push(["succeed", text]); },
        fail(text) { progressEvents.push(["fail", text]); },
      },
      operations: {
        auditPreflight() {
          calls.push("preflight");
          return Promise.resolve({ port: 9234, launch: true, reuseExisting: false });
        },
        patchCodexApp(options) {
          calls.push("patch");
          calls.push(["runtimeConfig", options.runtimeConfig]);
          return Promise.resolve({ sourceApp: "/Applications/Codex.app", patchSet: "codex-test" });
        },
        buildAuditFixture() {
          calls.push("fixture");
          return Promise.resolve({
            mode: "fixture",
            files: [],
            workRoot: "/repo/dev-home/fixture-workspaces",
            threads: [{ id: "thread-1", title: "Fixture", cwd: "/repo/dev-home/fixture-workspaces/main" }],
          });
        },
        seedAuditFixtureBrowserState() {
          calls.push("seed");
          return Promise.resolve({ seeded: true });
        },
        launchDevApp() {
          calls.push("launch");
          launchCount += 1;
          return Promise.resolve({
            pid: 122 + launchCount,
            command: "/repo/work/Codex Plus.app/Contents/MacOS/ChatGPT",
            args: ["--remote-debugging-port=9234"],
            instanceIdentity: { bundleIdentifier: "com.openai.chatgpt-plus.reg-2670771524" },
          });
        },
        waitForRendererTarget(_port, timeoutMs) {
          calls.push("waitRenderer");
          calls.push(["rendererTimeout", timeoutMs]);
          rendererWaitCount += 1;
          if (rendererWaitCount <= 2) {
            return Promise.reject(new Error(`ChatGPT start ${rendererWaitCount} exited before renderer startup`));
          }
          return Promise.resolve({
            url: "app://-/index.html",
            webSocketDebuggerUrl: "ws://127.0.0.1:9234/devtools/page/1",
          });
        },
        CdpSession: FakeCdpSession,
        reloadAuditRenderer: async () => ({ ok: true, readyState: "complete" }),
        closeActiveVirtualRoute: async () => ({ ok: true, activeRouteId: "", routeContext: null, hash: "" }),
        waitForLiveRuntime(_cdp, timeoutMs) {
          calls.push("runtime");
          calls.push(["runtimeTimeoutMs", timeoutMs]);
          return Promise.resolve({ registered: 10, started: 10 });
        },
        waitForAppShellMounted(_cdp, timeoutMs) {
          calls.push("shell");
          calls.push(["shellTimeoutMs", timeoutMs]);
          return Promise.resolve({ readyState: "complete", hasStartupLoader: false });
        },
        auditRequiredHostAdapters() { return Promise.resolve({ ok: true, missing: [], bindings: { mount: true, openFile: true } }); },
        dismissStartupDialogs() {
          calls.push("dismissStartupDialogs");
          return Promise.resolve({ present: true, dismissed: true, cleared: true });
        },
        cleanupLaunchedAuditApp() {
          calls.push("cleanupRetry");
          return Promise.resolve({ attempted: true, keptOpen: false, ok: true });
        },
        waitForLaunchRetry(ms) {
          assert.equal(ms, 2000);
          calls.push("waitRetry");
          return Promise.resolve();
        },
        checkKeepOpenAppStability() {
          throw new Error("manual mode must not run post-probe stability checks");
        },
        captureVisualContract(_cdp, options) {
          calls.push(["captureVisualContract", options.includeSettings]);
          return Promise.resolve({ ok: true, artifactDir: options.artifactDir, settings: null });
        },
        auditIdentity() {
          return { packageName: "codex-plus-patcher", packageVersion: "0.7.0" };
        },
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.manual, true);
  assert.equal(result.probesSkipped, true);
  assert.equal(result.devToolsUrl, "http://127.0.0.1:9234/json/list");
  assert.deepEqual(result.pluginResults, {});
  assert.equal(result.launchResult.pid, 125);
  assert.equal(result.fixtureResult.browserStateReadback.seeded, true);
  assert.equal(result.visualContract.ok, true);
  assert.deepEqual(result.cleanupResult, { attempted: false, keptOpen: true, ok: true, pid: 125 });
  assert.deepEqual(
    calls.filter((call) => typeof call === "string"),
    ["preflight", "patch", "fixture", "launch", "waitRenderer", "cleanupRetry", "waitRetry", "launch", "waitRenderer", "cleanupRetry", "waitRetry", "launch", "waitRenderer", "connect", "runtime", "shell", "dismissStartupDialogs", "seed", "close"],
  );
  assert.deepEqual(calls.find((call) => call[0] === "captureVisualContract"), ["captureVisualContract", false]);
  assert.deepEqual(calls.filter((call) => Array.isArray(call) && call[0] === "rendererTimeout"), [
    ["rendererTimeout", 30000],
    ["rendererTimeout", 30000],
    ["rendererTimeout", undefined],
  ]);
  assert.deepEqual(calls.find((call) => call[0] === "shellTimeoutMs"), ["shellTimeoutMs", 180000]);
  assert.deepEqual(calls.find((call) => call[0] === "runtimeTimeoutMs"), ["runtimeTimeoutMs", 180000]);
  assert.deepEqual(calls.find((call) => call[0] === "runtimeConfig")[1], {
    runtimePluginsDisabled: ["projectColors"],
  });
  assert.equal(progressEvents.some(([, text]) => text === "Waiting for ChatGPT renderer 1/2 on port 9234"), true);
  assert.equal(progressEvents.some(([, text]) => text === "Waiting before ChatGPT restart 1/2"), true);
  assert.equal(progressEvents.some(([, text]) => text === "Running plugin probes"), false);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("runAudit manual no-launch mode attaches without launching or probing", async () => {
  class FakeCdpSession {
    connect() { return Promise.resolve(); }
    send() { return Promise.resolve(); }
    evaluate() {
      throw new Error("manual no-launch mode must not run plugin probes");
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
      keepOpen: true,
      manual: true,
      includeNativeOpenProbes: false,
    },
    {
      operations: {
        auditPreflight() {
          return Promise.resolve({
            port: 9234,
            launch: false,
            reuseExisting: true,
            suggestedCommand: "codex-plus-patcher audit-plugins --no-apply --no-launch --keep-open --port 9234",
          });
        },
        launchDevApp() {
          throw new Error("manual no-launch mode must not launch");
        },
        waitForRendererTarget() {
          return Promise.resolve({
            url: "app://-/index.html",
            webSocketDebuggerUrl: "ws://127.0.0.1:9234/devtools/page/1",
          });
        },
        CdpSession: FakeCdpSession,
        reloadAuditRenderer: async () => ({ ok: true, readyState: "complete" }),
        closeActiveVirtualRoute: async () => ({ ok: true, activeRouteId: "", routeContext: null, hash: "" }),
        waitForLiveRuntime() { return Promise.resolve({ registered: 1, started: 1 }); },
        waitForAppShellMounted() { return Promise.resolve({ readyState: "complete", hasStartupLoader: false }); },
        auditRequiredHostAdapters() { return Promise.resolve({ ok: true, missing: [], bindings: { mount: true, openFile: true } }); },
        dismissStartupDialogs() { return Promise.resolve({ present: false, dismissed: false }); },
        cleanupLaunchedAuditApp() {
          throw new Error("manual no-launch mode must not cleanup");
        },
        auditIdentity() {
          return { packageName: "codex-plus-patcher", packageVersion: "0.7.0" };
        },
      },
    },
  );

  assert.equal(result.manual, true);
  assert.equal(result.probesSkipped, true);
  assert.equal(result.launchResult, null);
  assert.equal(result.preflight.suggestedCommand, "codex-plus-patcher audit-plugins --no-apply --no-launch --keep-open --port 9234");
  assert.deepEqual(result.cleanupResult, { attempted: false, keptOpen: false, ok: true, pid: null });
});

test("runAudit manual mode keeps a launched app open after readiness failure", async () => {
  class FakeCdpSession {
    connect() { return Promise.resolve(); }
    send() { return Promise.resolve(); }
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
      launch: true,
      keepOpen: true,
      manual: true,
      includeNativeOpenProbes: false,
    },
    {
      operations: {
        auditPreflight() {
          return Promise.resolve({ port: 9234, launch: true, reuseExisting: false });
        },
        buildAuditFixture() {
          return Promise.resolve({ mode: "fixture", files: [] });
        },
        launchDevApp() {
          return Promise.resolve({ pid: 123, command: "Codex", args: [] });
        },
        waitForRendererTarget() {
          return Promise.resolve({
            url: "app://-/index.html",
            webSocketDebuggerUrl: "ws://127.0.0.1:9234/devtools/page/1",
          });
        },
        CdpSession: FakeCdpSession,
        reloadAuditRenderer: async () => ({ ok: true, readyState: "complete" }),
        closeActiveVirtualRoute: async () => ({ ok: true, activeRouteId: "", routeContext: null, hash: "" }),
        waitForLiveRuntime() {
          throw new Error("runtime did not become ready");
        },
        cleanupLaunchedAuditApp() {
          throw new Error("manual failure must not cleanup the launched app");
        },
        checkKeepOpenAppStability() {
          throw new Error("manual failure must not run post-probe stability checks");
        },
        auditIdentity() {
          return { packageName: "codex-plus-patcher", packageVersion: "0.7.0" };
        },
      },
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.failures[0].message, "runtime did not become ready");
  assert.deepEqual(result.cleanupResult, { attempted: false, keptOpen: true, ok: true, pid: 123 });
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
    platform: "linux",
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
  assert.deepEqual(result.args, [`--user-data-dir=${electronUserDataPath}`, "--use-mock-keychain", "--remote-debugging-port=9234"]);
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
  assert.deepEqual(calls[3].args, [`--user-data-dir=${electronUserDataPath}`, "--use-mock-keychain", "--remote-debugging-port=9234"]);
  assert.equal(calls[3].options.detached, true);
  assert.equal(calls[3].options.env.KEEP_ME, "yes");
  assert.equal(calls[3].options.env.CODEX_HOME, devHome);
  assert.equal(calls[3].options.env.CODEX_ELECTRON_USER_DATA_PATH, electronUserDataPath);
  assert.deepEqual(calls[4], { unref: true });
  assert.match(formatLaunchDevResult(result), /CODEX_ELECTRON_USER_DATA_PATH/);
  assert.match(formatLaunchDevResult(result), /com\.openai\.codex-plus\.dev/);
});

test("launch-dev directly launches the ChatGPT executable with isolated identity", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-plus-chatgpt-launch-dev-"));
  const targetApp = path.join(tmpDir, "ChatGPT Plus.app");

  const result = buildLaunchDev({
    targetApp,
    devInstanceId: "audit",
    remoteDebuggingPort: 9234,
  });

  assert.equal(result.command, path.join(targetApp, "Contents/MacOS/ChatGPT"));
  assert.deepEqual(result.instanceIdentity, {
    id: "audit",
    bundleIdentifier: "com.openai.chatgpt-plus.audit",
    displayName: "ChatGPT Plus (audit)",
    name: "ChatGPT Plus audit",
  });

  const calls = [];
  const startupLogPath = path.join(tmpDir, "startup", "codex-plus.log");
  const launched = launchDevApp({
    targetApp,
    devHome: path.join(tmpDir, "dev-home"),
    electronUserDataPath: path.join(tmpDir, "electron-user-data"),
    remoteDebuggingPort: 9234,
    startupLogPath,
    platform: "darwin",
    markDevRuntimeConfigImpl: () => ({ patchedAsarSha: "dev-sha" }),
    markDevBundleIdentityImpl: () => result.instanceIdentity,
    signDevAppImpl: () => ({ signed: true }),
    spawn(command, args, options) {
      calls.push({ command, args, options });
      return { pid: 1357, unref() {} };
    },
  });

  assert.equal(launched.command, path.join(targetApp, "Contents/MacOS/ChatGPT"));
  assert.deepEqual(launched.args, [
    `--user-data-dir=${path.join(tmpDir, "electron-user-data")}`,
    "--use-mock-keychain",
    "--remote-debugging-port=9234",
  ]);
  assert.deepEqual(calls[0].args, launched.args);
  assert.deepEqual(calls[0].options.stdio.slice(0, 1), ["ignore"]);
  assert.equal(Number.isInteger(calls[0].options.stdio[1]), true);
  assert.equal(calls[0].options.stdio[1], calls[0].options.stdio[2]);
  assert.equal(launched.startupLogPath, startupLogPath);
  assert.equal(fs.existsSync(startupLogPath), true);

});

test("launch-dev directly launches the executable with isolated state on macOS", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-plus-macos-launch-dev-"));
  const targetApp = path.join(tmpDir, "Codex Plus.app");
  const devHome = path.join(tmpDir, "dev-home");
  const electronUserDataPath = path.join(tmpDir, "electron-user-data");
  const calls = [];
  const result = launchDevApp({
    targetApp,
    devHome,
    electronUserDataPath,
    remoteDebuggingPort: 9234,
    platform: "darwin",
    markDevRuntimeConfigImpl: () => ({ patchedAsarSha: "dev-sha" }),
    markDevBundleIdentityImpl: () => ({ bundleIdentifier: "com.openai.codex-plus.dev" }),
    signDevAppImpl: () => ({ signed: true }),
    spawn(command, args, options) {
      calls.push({ command, args, options });
      return { pid: 2468, unref() {} };
    },
  });

  assert.equal(result.command, path.join(targetApp, "Contents/MacOS/Codex"));
  assert.deepEqual(result.args, [
    `--user-data-dir=${electronUserDataPath}`,
    "--use-mock-keychain",
    "--remote-debugging-port=9234",
  ]);
  assert.deepEqual(calls[0].args, result.args);
  assert.equal(calls[0].options.detached, true);
  assert.equal(calls[0].options.stdio, "ignore");
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

test("audit cleanup stops matching app helpers for a direct launch", async () => {
  const killed = [];
  const result = await cleanupLaunchedAuditApp(
    {
      command: "/repo/work/ChatGPT Plus.app/Contents/MacOS/ChatGPT",
      pid: 2468,
      targetApp: "/repo/work/ChatGPT Plus.app",
      devHome: "/repo/work/dev-home",
      electronUserDataPath: "/repo/work/electron-user-data",
    },
    {
      listRunningApps(options) {
        assert.equal(options.targetApp, "/repo/work/ChatGPT Plus.app");
        assert.equal(options.devHome, "/repo/work/dev-home");
        assert.equal(options.electronUserDataPath, "/repo/work/electron-user-data");
        assert.equal(options.includeTargetProcesses, true);
        return [{ pid: 9753 }];
      },
      kill(pid, signal) {
        killed.push([pid, signal]);
        if (pid === -2468 && signal === "SIGKILL") {
          const error = new Error("gone");
          error.code = "ESRCH";
          throw error;
        }
      },
      wait() {},
    },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(killed, [
    [9753, "SIGTERM"],
    [-2468, "SIGTERM"],
    [-2468, "SIGKILL"],
    [2468, "SIGKILL"],
  ]);
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

test("audit progress remains visible with json and is suppressed in quiet and no-progress modes", async () => {
  for (const args of [{ quiet: true }, { noProgress: true }]) {
    const progress = await createAuditProgress(args, {
      stream: { isTTY: true, write() {} },
      importOra() {
        throw new Error("ora should not be imported");
      },
    });
    assert.equal(progress, null);
  }
  const writes = [];
  const progress = await createAuditProgress({ json: true }, {
    stream: { isTTY: false, write: (text) => writes.push(text) },
  });
  progress.start("Preparing audit");
  assert.equal(writes.length, 1);
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

test("audit jsonl progress emits compact event records", () => {
  const writes = [];
  const progress = createJsonlProgress({
    stream: { write: (text) => writes.push(text) },
    now: () => new Date("2026-07-07T00:00:00.000Z"),
    context: { version: "26.623.141536" },
  });

  progress.start("Running plugin probes");
  progress.succeed("Probed plugins");
  progress.event("summary", { ok: true });

  assert.deepEqual(writes.map((line) => JSON.parse(line)), [
    {
      type: "progress",
      time: "2026-07-07T00:00:00.000Z",
      status: "start",
      message: "Running plugin probes",
      version: "26.623.141536",
      elapsedMs: 0,
    },
    {
      type: "progress",
      time: "2026-07-07T00:00:00.000Z",
      status: "pass",
      message: "Probed plugins",
      version: "26.623.141536",
      elapsedMs: 0,
    },
    {
      type: "summary",
      time: "2026-07-07T00:00:00.000Z",
      version: "26.623.141536",
      ok: true,
    },
  ]);
});

test("audit jsonl progress emits active status and stops its timer", () => {
  const writes = [];
  const timers = new Map();
  let nextTimer = 1;
  let currentTime = 0;
  const progress = createJsonlProgress({
    stream: { write: (text) => writes.push(JSON.parse(text)) },
    now: () => new Date(currentTime),
    setIntervalImpl(callback, delay) {
      const id = nextTimer++;
      timers.set(id, { callback, delay });
      return id;
    },
    clearIntervalImpl(id) {
      timers.delete(id);
    },
  });
  progress.start("Waiting for app shell", { phase: "startup", plugin: "audit" });
  currentTime = 2000;
  timers.values().next().value.callback();
  progress.succeed("App shell mounted");

  assert.equal(writes[1].status, "progress");
  assert.equal(writes[1].elapsedMs, 2000);
  assert.equal(writes[1].phase, "startup");
  assert.equal(writes[1].plugin, "audit");
  assert.equal(timers.size, 0);
});

test("audit jsonl progress reaches a supervising process steadily before exit", async () => {
  const modulePath = require.resolve("../src/core/plugin-audit");
  const script = [
    `const { createJsonlProgress } = require(${JSON.stringify(modulePath)});`,
    "const progress = createJsonlProgress({ intervalMs: 40 });",
    "progress({ status: 'start', label: 'Long phase', phase: 'copy', version: '26.715.31251', patchSet: 'chatgpt-26.715.31251-5538', sourceIndex: 1, sourceTotal: 1 });",
    "setTimeout(() => { progress.succeed('Long phase complete'); progress.close(); }, 500);",
  ].join("");
  const child = childProcess.spawn(process.execPath, ["-e", script], { stdio: ["ignore", "pipe", "pipe"] });
  const records = [];
  let pending = "";
  let exitedAt = null;
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    pending += chunk;
    const lines = pending.split("\n");
    pending = lines.pop();
    for (const line of lines) records.push({ at: Date.now(), record: JSON.parse(line) });
  });
  const exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => {
      exitedAt = Date.now();
      resolve(code);
    });
  });

  assert.equal(exitCode, 0);
  assert.ok(records.length >= 5, `expected start, steady heartbeats, and completion; got ${records.length}`);
  assert.ok(records[0].at < exitedAt, "first progress record must arrive before process exit");
  assert.equal(records[0].record.version, "26.715.31251");
  assert.equal(records.filter(({ record }) => record.status === "progress").length >= 3, true);
});

test("audit output supports detailed json in human and jsonl modes", () => {
  const result = { ok: true, failures: [], pluginResults: { audit: { ok: true } } };
  const humanWrites = [];
  writeAuditOutput(result, { json: true, jsonl: false }, { stream: { write: (text) => humanWrites.push(text) } });
  assert.deepEqual(JSON.parse(humanWrites.join("")), result);

  const jsonlWrites = [];
  writeAuditOutput(result, { json: true, jsonl: true }, {
    stream: { write: (text) => jsonlWrites.push(JSON.parse(text)) },
    now: () => new Date("2026-07-12T00:00:00.000Z"),
  });
  assert.equal(jsonlWrites.length, 1);
  assert.equal(jsonlWrites[0].type, "result");
  assert.deepEqual(jsonlWrites[0].result, result);
});

test("visual contract writes screenshots and compact readbacks", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-plus-contract-test-"));
  try {
    const png = Buffer.from("png").toString("base64");
    const cdp = {
      async send(method) {
        assert.match(method, /^(Page\.(bringToFront|captureScreenshot|navigate)|Input\.dispatchKeyEvent)$/);
        if (method === "Page.navigate") return {};
        if (method === "Page.bringToFront") return {};
        if (method === "Input.dispatchKeyEvent") return {};
        return { data: png };
      },
      async evaluate(expression) {
        return {
          url: "app://-/index.html",
          title: "Codex Plus",
          shell: { startupLoaderVisible: false, bodyTextSample: "Pinned Harness Runs Projects General" },
          sidebar: { pinnedVisible: true, harnessRunsVisible: true, projectsVisible: true, threadRows: 3, projectRows: 2, blurred: false },
          review: { tabVisible: true, repoHeaderVisible: true, diffCardCount: 2, rawDiffFallbackCount: 0 },
          commandPalette: { sidebarBlurred: true, visible: true, toggleItemVisible: true },
          settings: { generalVisible: true, backToAppVisible: true, blank: false },
        };
      },
    };

    const contract = await captureVisualContract(cdp, {
      artifactDir: tmpDir,
      result: {
        ok: true,
        failures: [],
        expectedWarnings: [],
        applyResult: {
          sourceApp: "/Applications/Codex.app",
          patchSet: "codex-test",
          codexVersion: "26.623.141536",
          bundleVersion: "4753",
        },
        target: { app: "/tmp/Codex Plus.app" },
        pluginResults: {},
      },
      wait() {},
      activateFixture: async () => ({ ok: true }),
      verifyReview: async () => ({ ok: true }),
      verifyCommand: async () => ({ ok: true }),
    });

    assert.equal(contract.ok, true);
    for (const file of ["contract.json", "audit-summary.json", "shell.png", "review.png", "sidebar-command.png", "settings.png"]) {
      assert.equal(fs.existsSync(path.join(tmpDir, file)), true);
    }
    const readback = JSON.parse(fs.readFileSync(path.join(tmpDir, "contract.json"), "utf8"));
    assert.equal(readback.settings.generalVisible, true);
    assert.equal(readback.review.diffCardCount, 2);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("visual contract waits for General settings before capturing the settings screenshot", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-plus-contract-settings-ready-"));
  try {
    const png = Buffer.from("png").toString("base64");
    let evaluations = 0;
    let settingsCaptureEvaluation = null;
    const readback = (settingsReady) => ({
      url: "app://-/index.html",
      title: "Codex Plus",
      shell: { startupLoaderVisible: false, bodyTextSample: "Pinned Harness Runs Projects" },
      sidebar: { pinnedVisible: true, harnessRunsVisible: true, projectsVisible: true, threadRows: 3, projectRows: 2, blurred: false },
      review: { tabVisible: true, repoHeaderVisible: true, diffCardCount: 2, rawDiffFallbackCount: 0 },
      commandPalette: { sidebarBlurred: true, visible: true, toggleItemVisible: true },
      settings: { generalVisible: settingsReady, backToAppVisible: settingsReady, blank: !settingsReady },
    });
    const cdp = {
      async send(method) {
        if (method === "Page.captureScreenshot") {
          if (settingsCaptureEvaluation == null && evaluations >= 6) settingsCaptureEvaluation = evaluations;
          return { data: png };
        }
        return {};
      },
      async evaluate() {
        evaluations += 1;
        return readback(evaluations >= 6);
      },
    };

    const contract = await captureVisualContract(cdp, {
      artifactDir: tmpDir,
      result: { ok: true, failures: [], expectedWarnings: [], applyResult: {}, target: {}, pluginResults: {} },
      wait() {},
      activateFixture: async () => ({ ok: true }),
      verifyReview: async () => ({ ok: true }),
      verifyCommand: async () => ({ ok: true }),
    });

    assert.equal(contract.ok, true);
    assert.equal(contract.settings.generalVisible, true);
    assert.equal(settingsCaptureEvaluation, 6);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
