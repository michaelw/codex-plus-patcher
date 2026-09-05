const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
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
  activateFixtureThread,
  auditPreflight,
  auditRequiredHostAdapters,
  auditIdentity,
  captureVisualContract,
  captureNewChatComposerProof,
  checkKeepOpenAppStability,
  cleanupLaunchedAuditApp,
  formatAuditJson: formatCoreAuditJson,
  createJsonlProgress,
  dismissStartupDialogs,
  listCrashpadPendingDumps,
  listRunningAuditApps,
  mergeFocusedPluginAudit,
  pluginAuditExpression,
  projectColorsNeedsFixtureRetry,
  reconcileNestedReviewProof,
  refreshFixtureRendererForRetry,
  runAudit,
  setComposerColorForVisualContract,
  summarizeCdpEvents,
  verifyProjectSelectorShortcutKey,
  reviewPanelNeedsWarmRetry,
  verifyMermaidViewerRender,
  verifyReviewPanelRender,
  verifySidebarBlurCommandPalette,
  waitForReviewFixtureDiffText,
  verifyTerminalUnicodeCursor,
  waitForAppShellMounted,
  writeAuditOutput,
} = require("../src/core/plugin-audit");

test("fixture activation keeps retrying trusted input until the header contract is ready", async () => {
  const sent = [];
  const activeStates = [
    { titleReady: false },
    {
      titleReady: true,
      activeCwd: "/fixture-workspaces/alpha-main",
      chipPath: "/fixture-workspaces/alpha-main",
      chipCount: 1,
      anchoredBeforeAction: true,
    },
  ];
  let evaluation = 0;
  const cdp = {
    evaluate() {
      evaluation += 1;
      if (evaluation === 1) return Promise.resolve(false);
      if (evaluation === 2) {
        return Promise.resolve({
          kind: "thread",
          title: "Fixture: main repo path header",
          path: "/fixture-workspaces/alpha-main",
        });
      }
      if (evaluation === 3 || evaluation === 5) {
        return Promise.resolve({ x: 10, y: 10, hitInsideRow: true });
      }
      return Promise.resolve(activeStates.shift());
    },
    send(method, params) {
      sent.push({ method, params });
      return Promise.resolve();
    },
  };

  const result = await activateFixtureThread(cdp, {
    wait() {},
    timeoutMs: 1000,
    retryIntervalMs: 0,
  });

  assert.equal(result.ok, true);
  assert.equal(sent.find((call) => call.method.startsWith("Input."))?.method, "Input.dispatchMouseEvent");
  assert.equal(sent.filter((call) => call.method === "Input.dispatchKeyEvent").length, 0);
  assert.equal(sent.filter((call) => call.method === "Input.dispatchMouseEvent" && call.params.type === "mousePressed").length, 2);
  assert.equal(sent.filter((call) => call.method === "Input.dispatchMouseEvent" && call.params.type === "mouseMoved").length, 0);
});

test("fixture activation retries the stable row hit target after a label attempt", async () => {
  let activeChecks = 0;
  let rowPoints = 0;
  const cdp = {
    evaluate(expression) {
      if (expression.includes('location.search.includes')) return Promise.resolve(false);
      if (expression.includes("const collapsedProject")) {
        return Promise.resolve({
          kind: "thread",
          title: "Fixture: main repo path header",
          path: "/fixture-workspaces/alpha-main",
        });
      }
      if (expression.includes("const clickElement = row;")) {
        rowPoints += 1;
        return Promise.resolve({ x: 10, y: 10, hitInsideRow: true });
      }
      if (expression.includes("const clickElement = (labels[0] || row);")) {
        return Promise.resolve({ x: 11, y: 11, hitInsideRow: true });
      }
      if (expression.includes("control.focus()")) return Promise.resolve(true);
      if (expression.includes("const headers =")) {
        activeChecks += 1;
        if (activeChecks < 4) return Promise.resolve({ titleReady: false });
        return Promise.resolve({
          titleReady: true,
          activeCwd: "/fixture-workspaces/alpha-main",
          chipPath: "/fixture-workspaces/alpha-main",
          chipCount: 1,
          anchoredBeforeAction: true,
        });
      }
      return Promise.resolve(true);
    },
    send() { return Promise.resolve(); },
  };

  const result = await activateFixtureThread(cdp, {
    wait() {},
    timeoutMs: 1000,
    retryIntervalMs: 0,
  });

  assert.equal(result.ok, true);
  assert.equal(rowPoints, 1);
});

test("fixture activation fails immediately when opening the thread renders an error boundary", async () => {
  let activeChecks = 0;
  const cdp = {
    evaluate(expression) {
      if (expression.includes('location.search.includes')) return Promise.resolve(false);
      if (expression.includes("const collapsedProject")) {
        return Promise.resolve({
          kind: "thread",
          title: "Fixture: main repo path header",
          path: "/fixture-workspaces/alpha-main",
        });
      }
      if (expression.includes("const clickElement =")) return Promise.resolve({ x: 10, y: 10, hitInsideRow: true });
      if (expression.includes("const headers =")) {
        activeChecks += 1;
        return Promise.resolve({ titleReady: false, errorBoundaryText: "Oops, an error has occurred TypeError: broken host hook" });
      }
      return Promise.resolve(false);
    },
    send() { return Promise.resolve(); },
  };

  const result = await activateFixtureThread(cdp, { wait() {}, timeoutMs: 1000, retryIntervalMs: 0 });

  assert.equal(result.ok, false);
  assert.equal(activeChecks, 1);
  assert.match(result.message, /rendered an error boundary.*broken host hook/);
});

test("fixture activation fails before clicking a covered thread row", async () => {
  const sent = [];
  const cdp = {
    evaluate(expression) {
      if (expression.includes('location.search.includes')) return Promise.resolve(false);
      if (expression.includes("const collapsedProject")) {
        return Promise.resolve({
          kind: "thread",
          title: "Fixture: main repo path header",
          path: "/fixture-workspaces/alpha-main",
        });
      }
      if (expression.includes("const clickElement =")) {
        return Promise.resolve({
          x: 10,
          y: 10,
          hitInsideRow: false,
          hitTag: "BUTTON",
          hitText: "Upgrade",
        });
      }
      return Promise.resolve(false);
    },
    send(method, params) {
      sent.push({ method, params });
      return Promise.resolve();
    },
  };

  const result = await activateFixtureThread(cdp, { wait() {}, timeoutMs: 1000, retryIntervalMs: 0 });

  assert.equal(result.ok, false);
  assert.equal(sent.filter((call) => call.method.startsWith("Input.")).length, 0);
  assert.match(result.message, /covered by another surface.*Upgrade/);
});

test("fixture activation closes the embedded checkout before trusted input", async () => {
  const sent = [];
  let targetChecks = 0;
  const cdp = {
    evaluate(expression) {
      if (expression.includes('location.search.includes')) return Promise.resolve(false);
      if (expression.includes("const collapsedProject")) {
        return Promise.resolve({
          kind: "thread",
          title: "Fixture: main repo path header",
          path: "/fixture-workspaces/alpha-main",
        });
      }
      if (expression.includes("const clickElement =")) {
        return Promise.resolve({ x: 10, y: 10, hitInsideRow: true, hitText: "Fixture: main repo path header" });
      }
      if (expression.includes("control.focus()")) return Promise.resolve(false);
      if (expression.includes("const currentUrl")) {
        return Promise.resolve({
          url: "app://-/index.html",
          titleReady: true,
          activeCwd: "/fixture-workspaces/alpha-main",
          chipPath: "/fixture-workspaces/alpha-main",
          chipCount: 1,
          anchoredBeforeAction: true,
        });
      }
      return Promise.resolve(true);
    },
    send(method, params) {
      sent.push({ method, params });
      if (method === "Target.getTargets") {
        targetChecks += 1;
        return Promise.resolve({
          targetInfos: targetChecks === 1 ? [{
            targetId: "checkout-1",
            type: "webview",
            title: "ChatGPT Plans",
            url: "https://chatgpt.com/?source=codex-embedded-checkout#pricing",
          }] : [],
        });
      }
      if (method === "Target.closeTarget") return Promise.resolve({ success: true });
      return Promise.resolve();
    },
  };

  const result = await activateFixtureThread(cdp, { wait() {}, timeoutMs: 1000, retryIntervalMs: 0 });

  assert.equal(result.ok, true);
  assert.equal(result.dismissedAuxiliaryTargets.length, 1);
  assert.deepEqual(sent.slice(0, 2).map((call) => call.method), ["Target.getTargets", "Target.closeTarget"]);
  assert.equal(sent[1].params.targetId, "checkout-1");
  assert.equal(sent.some((call) => call.method === "Page.bringToFront"), true);
  assert.equal(sent.some((call) => call.method === "Input.dispatchMouseEvent"), true);
});

test("fixture activation prefers the browser target list for auxiliary-window dismissal", async () => {
  const closed = [];
  let targetChecks = 0;
  const cdp = {
    listTargets() {
      targetChecks += 1;
      return Promise.resolve(targetChecks === 1 ? [{
        id: "browser-checkout-1",
        type: "webview",
        title: "ChatGPT Plans",
        url: "https://chatgpt.com/?source=codex-embedded-checkout#pricing",
      }, {
        id: "browser-avatar-overlay-1",
        type: "page",
        title: "ChatGPT Plus",
        url: "app://-/index.html?initialRoute=%2Favatar-overlay",
      }] : []);
    },
    closeTarget(targetId) {
      closed.push(targetId);
      return Promise.resolve(false);
    },
    evaluate(expression) {
      if (expression.includes('location.search.includes')) return Promise.resolve(false);
      if (expression.includes("const collapsedProject")) {
        return Promise.resolve({ kind: "thread", title: "Fixture: main repo path header", path: "/fixture-workspaces/alpha-main" });
      }
      if (expression.includes("const clickElement =")) return Promise.resolve({ x: 10, y: 10, hitInsideRow: true });
      if (expression.includes("const currentUrl")) {
        return Promise.resolve({
          url: "app://-/index.html",
          titleReady: true,
          activeCwd: "/fixture-workspaces/alpha-main",
          chipPath: "/fixture-workspaces/alpha-main",
          chipCount: 1,
          anchoredBeforeAction: true,
        });
      }
      return Promise.resolve(true);
    },
    send(method) {
      if (method.startsWith("Target.")) throw new Error(`page target domain should not be used: ${method}`);
      return Promise.resolve();
    },
  };

  const result = await activateFixtureThread(cdp, { wait() {}, timeoutMs: 1000, retryIntervalMs: 0 });

  assert.equal(result.ok, true);
  assert.deepEqual(closed, ["browser-checkout-1"]);
  assert.equal(result.dismissedAuxiliaryTargets[0].targetId, "browser-checkout-1");
});

test("fixture activation closes an embedded checkout that appears after the first click", async () => {
  const sent = [];
  let targetChecks = 0;
  const cdp = {
    evaluate(expression) {
      if (expression.includes('location.search.includes')) return Promise.resolve(false);
      if (expression.includes("const collapsedProject")) {
        return Promise.resolve({
          kind: "thread",
          title: "Fixture: main repo path header",
          path: "/fixture-workspaces/alpha-main",
        });
      }
      if (expression.includes("const clickElement =")) {
        return Promise.resolve({ x: 10, y: 10, hitInsideRow: true, hitText: "Fixture: main repo path header" });
      }
      if (expression.includes("control.focus()")) return Promise.resolve(false);
      if (expression.includes("const currentUrl")) {
        return Promise.resolve({
          url: "app://-/index.html",
          titleReady: true,
          activeCwd: "/fixture-workspaces/alpha-main",
          chipPath: "/fixture-workspaces/alpha-main",
          chipCount: 1,
          anchoredBeforeAction: true,
        });
      }
      return Promise.resolve(true);
    },
    send(method, params) {
      sent.push({ method, params });
      if (method === "Target.getTargets") {
        targetChecks += 1;
        return Promise.resolve({
          targetInfos: targetChecks === 2 ? [{
            targetId: "late-checkout-1",
            type: "webview",
            title: "ChatGPT Plans",
            url: "https://chatgpt.com/?source=codex-embedded-checkout#pricing",
          }] : [],
        });
      }
      if (method === "Target.closeTarget") return Promise.resolve({ success: true });
      return Promise.resolve();
    },
  };

  const result = await activateFixtureThread(cdp, { wait() {}, timeoutMs: 1000, retryIntervalMs: 0 });

  assert.equal(result.ok, true);
  assert.equal(result.dismissedAuxiliaryTargets.length, 1);
  assert.equal(sent.some((call) => call.method === "Target.closeTarget" && call.params.targetId === "late-checkout-1"), true);
});

test("fixture activation keeps watching for a late checkout while trusted pointer input is pending", { timeout: 500 }, async () => {
  for (const pendingType of ["mousePressed", "mouseReleased"]) {
    let targetChecks = 0;
    let releasePointer;
    const cdp = {
      evaluate(expression) {
        if (expression.includes('location.search.includes')) return Promise.resolve(false);
        if (expression.includes("const collapsedProject")) {
          return Promise.resolve({ kind: "thread", title: "Fixture: main repo path header", path: "/fixture-workspaces/alpha-main" });
        }
        if (expression.includes("const clickElement =")) {
          return Promise.resolve({ x: 10, y: 10, hitInsideRow: true, hitText: "Fixture: main repo path header" });
        }
        if (expression.includes("const currentUrl")) {
          return Promise.resolve({
            url: "app://-/index.html",
            titleReady: true,
            activeCwd: "/fixture-workspaces/alpha-main",
            chipPath: "/fixture-workspaces/alpha-main",
            chipCount: 1,
            anchoredBeforeAction: true,
          });
        }
        return Promise.resolve(true);
      },
      send(method, params) {
        if (method === "Target.getTargets") {
          targetChecks += 1;
          return Promise.resolve({
            targetInfos: targetChecks === 6 ? [{
              targetId: `pending-${pendingType}`,
              type: "webview",
              title: "ChatGPT Plans",
              url: "https://chatgpt.com/?source=codex-embedded-checkout#pricing",
            }] : [],
          });
        }
        if (method === "Target.closeTarget") {
          releasePointer?.();
          return Promise.resolve({ success: true });
        }
        if (method === "Input.dispatchMouseEvent" && params.type === pendingType) {
          return new Promise((resolve) => { releasePointer = resolve; });
        }
        return Promise.resolve();
      },
    };

    const result = await activateFixtureThread(cdp, { wait() {}, timeoutMs: 1000, retryIntervalMs: 0 });

    assert.equal(result.ok, true, pendingType);
    assert.equal(result.dismissedAuxiliaryTargets.some((target) => target.targetId === `pending-${pendingType}`), true, pendingType);
  }
});

test("fixture activation reports pointer phase and renderer state when trusted input times out", async () => {
  let dispatchTimeoutMs = null;
  const cdp = {
    evaluate(expression) {
      if (expression.includes('location.search.includes')) return Promise.resolve(false);
      if (expression.includes("const collapsedProject")) {
        return Promise.resolve({ kind: "thread", title: "Fixture: main repo path header", path: "/fixture-workspaces/alpha-main" });
      }
      if (expression.includes("const clickElement =")) {
        return Promise.resolve({ x: 10, y: 10, hitInsideRow: true, hitText: "Fixture: main repo path header" });
      }
      if (expression.includes("bodyText: document.body")) {
        return Promise.resolve({ url: "app://-/index.html", title: "ChatGPT", bodyText: "fixture" });
      }
      return Promise.resolve(true);
    },
    send(method, params, options) {
      if (method === "Target.getTargets") return Promise.resolve({ targetInfos: [] });
      if (method === "Input.dispatchMouseEvent" && params.type === "mouseReleased") {
        dispatchTimeoutMs = options?.timeoutMs ?? null;
        return Promise.reject(new Error("DevTools request timed out: Input.dispatchMouseEvent"));
      }
      return Promise.resolve();
    },
  };

  await assert.rejects(
    activateFixtureThread(cdp, { wait() {}, timeoutMs: 1000, retryIntervalMs: 0 }),
    /Trusted mouseReleased did not settle.*renderer=.*app:\/\/-\/index\.html.*targets=\[\]/,
  );
  assert.equal(dispatchTimeoutMs, 45000);
});

test("fixture activation reconnects when navigation swallows the trusted release response", async () => {
  let reconnected = false;
  const cdp = {
    evaluate(expression) {
      if (expression.includes('location.search.includes')) return Promise.resolve(false);
      if (expression.includes("const collapsedProject")) {
        return Promise.resolve({ kind: "thread", title: "Fixture: main repo path header", path: "/fixture-workspaces/alpha-main" });
      }
      if (expression.includes("const clickElement =")) {
        return Promise.resolve({ x: 10, y: 10, hitInsideRow: true, hitText: "Fixture: main repo path header" });
      }
      if (expression.includes("const currentUrl")) {
        return Promise.resolve(reconnected ? {
          url: "app://-/index.html",
          titleReady: true,
          activeCwd: "/fixture-workspaces/alpha-main",
          chipPath: "/fixture-workspaces/alpha-main",
          chipCount: 1,
          anchoredBeforeAction: true,
        } : { url: "app://-/index.html", titleReady: false });
      }
      return Promise.resolve(true);
    },
    send(method, params) {
      if (method === "Target.getTargets") return Promise.resolve({ targetInfos: [] });
      if (method === "Input.dispatchMouseEvent" && params.type === "mouseReleased") return new Promise(() => {});
      return Promise.resolve();
    },
    reconnect() {
      reconnected = true;
      return Promise.resolve();
    },
  };

  const outcome = await Promise.race([
    activateFixtureThread(cdp, { wait() {}, pointerSettleMs: 0, timeoutMs: 1000, retryIntervalMs: 0 }),
    new Promise((resolve) => setTimeout(() => resolve("timed out"), 100)),
  ]);

  assert.notEqual(outcome, "timed out");
  assert.equal(outcome.ok, true);
  assert.equal(reconnected, true);
});

test("fixture activation fails immediately when the renderer navigates away", async () => {
  let activeChecks = 0;
  const cdp = {
    evaluate(expression) {
      if (expression.includes('location.search.includes')) return Promise.resolve(false);
      if (expression.includes("const collapsedProject")) {
        return Promise.resolve({
          kind: "thread",
          title: "Fixture: main repo path header",
          path: "/fixture-workspaces/alpha-main",
        });
      }
      if (expression.includes("const clickElement =")) {
        return Promise.resolve({ x: 10, y: 10, hitInsideRow: true, hitText: "Fixture: main repo path header" });
      }
      if (expression.includes("const currentUrl")) {
        activeChecks += 1;
        return Promise.resolve({ url: "https://chatgpt.com/#pricing" });
      }
      return Promise.resolve(false);
    },
    send() { return Promise.resolve(); },
  };

  const result = await activateFixtureThread(cdp, { wait() {}, timeoutMs: 1000, retryIntervalMs: 0 });

  assert.equal(result.ok, false);
  assert.equal(activeChecks, 1);
  assert.match(result.message, /navigated away from the app.*chatgpt\.com/);
});

test("successful trusted Review capture supersedes only the matching cold-render failure", () => {
  const result = {
    ok: false,
    failures: [
      { plugin: "nestedRepositories", message: "Review panel did not render nested repository content" },
      { plugin: "projectColors", message: "unrelated" },
    ],
    pluginResults: { nestedRepositories: { ok: false, reviewPanel: { ok: false } } },
  };

  reconcileNestedReviewProof(result, { ok: true, repoHeaderVisible: true, nestedRepoVisible: true });

  assert.deepEqual(result.failures, [{ plugin: "projectColors", message: "unrelated" }]);
  assert.equal(result.pluginResults.nestedRepositories.ok, true);
  assert.equal(result.pluginResults.nestedRepositories.reviewPanel.ok, true);
  assert.equal(result.ok, false);
});

test("startup dialog dismissal recognizes Chronicle permission setup", async () => {
  let visible = true;
  const inputEvents = [];
  const closeButton = {
    textContent: "",
    getAttribute(name) { return name === "aria-label" ? "Close" : null; },
    getBoundingClientRect() { return { left: 10, top: 20, width: 24, height: 24 }; },
    contains(element) { return element === this; },
  };
  const dialog = {
    innerText: "Allow Screen Recording to use Chronicle",
    getBoundingClientRect() { return { width: 420, height: 260 }; },
    querySelectorAll() { return [closeButton]; },
  };
  const cdp = {
    evaluate(expression) {
      return Promise.resolve(vm.runInNewContext(expression, {
        document: {
          body: { innerText: dialog.innerText },
          querySelectorAll() { return visible ? [dialog] : []; },
          elementFromPoint() { return closeButton; },
        },
        getComputedStyle() { return { visibility: "visible", display: "block" }; },
      }));
    },
    send(method, params) {
      inputEvents.push({ method, params });
      if (params.type === "mouseReleased") visible = false;
      return Promise.resolve({});
    },
  };

  const result = await dismissStartupDialogs(cdp, { wait: async () => {} });

  assert.deepEqual(inputEvents.map((event) => event.params.type), ["mouseMoved", "mousePressed", "mouseReleased"]);
  assert.equal(result.cleared, true);
  assert.equal(result.dialogs[0].dismissed, true);
});

test("composer contrast fixture waits for asynchronous color persistence before applying variables", async () => {
  let persisted = false;
  let appliedAfterPersistence = false;
  const cdp = {
    evaluate(expression) {
      return Promise.resolve(vm.runInNewContext(expression, {
        document: { documentElement: { classList: { toggle() {} } } },
        window: {
          CodexPlus: {
            plugins: {
              get() {
                return {
                  exports: {
                    async writeColor() { persisted = true; },
                    setVars() { appliedAfterPersistence = persisted; },
                  },
                };
              },
            },
          },
        },
      }));
    },
  };

  await setComposerColorForVisualContract(cdp, "light", "#f8fafc");

  assert.equal(persisted, true);
  assert.equal(appliedAfterPersistence, true);
});

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

test("live terminal Unicode audit asserts CSI 6n coordinates and captures the terminal", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-plus-terminal-unicode-"));
  const evaluations = [
    { terminalVisible: false, toggle: { x: 100, y: 20 } },
    { x: 400, y: 500 },
    true,
    { x: 400, y: 500 },
    true,
    {
      rows: ["🍎📦", "CPX_UNICODE11_DSR row=7 col=5"],
      cursor: { row: 7, column: 5 },
    },
    { x: 100, y: 20 },
  ];
  const calls = [];
  const cdp = {
    async evaluate() {
      return evaluations.shift();
    },
    async send(method, params) {
      calls.push({ method, params });
      if (method === "Page.captureScreenshot") return { data: Buffer.from("png").toString("base64") };
      return {};
    },
  };

  try {
    const result = await verifyTerminalUnicodeCursor(cdp, {
      artifactDir: tmpDir,
      wait() {},
    });

    assert.deepEqual(result, {
      ok: true,
      expectedColumn: 5,
      row: 7,
      column: 5,
      fixture: "🍎📦",
      screenshot: path.join(tmpDir, "terminal-unicode11.png"),
      message: undefined,
    });
    assert.equal(fs.existsSync(result.screenshot), true);
    assert.match(calls.find((call) => call.method === "Input.insertText").params.text, /🍎📦.*\\e\[6n/);
    assert.equal(calls.filter((call) => call.method === "Input.dispatchMouseEvent").length, 9);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
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
  const capableExpression = pluginAuditExpression({ capabilities: { composerCodeLanguageControl: { status: "required" } } });

  assert.match(defaultExpression, /"includeNativeOpenProbes":false/);
  assert.match(strictExpression, /"includeNativeOpenProbes":true/);
  assert.match(focusedExpression, /"auditPlugins":\["projectColors"\]/);
  assert.match(capableExpression, /"composerCodeLanguageControl":\{"status":"required"\}/);
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
  assert.match(defaultExpression, /const mountedComposerElements = \(\) =>/);
  assert.match(defaultExpression, /\[data-codex-composer\], \[contenteditable='true'\], textarea/);
  assert.match(defaultExpression, /\[data-codex-plus-user-entry\]:not\(:has\(\[data-user-message-bubble\]\)\)/);
  assert.match(defaultExpression, /editor: editor \|\| surface/);
  assert.match(defaultExpression, /const \{ editor, surface \} = mountedComposerElements\(\)/);
  assert.match(defaultExpression, /await replyVisibleOwnerChoice\("red", 180000\)/);
  assert.match(defaultExpression, /await replyVisibleOwnerChoice\("Yes", 180000\)/);
  assert.match(defaultExpression, /const progressed = await waitForAharness\([^;]+, 180000\)/);
  assert.match(defaultExpression, /const visuallyExposed = \(element\) =>/);
  assert.match(defaultExpression, /document\.elementFromPoint/);
  assert.match(defaultExpression, /if \(stalePathChip\) \{\s*press\(runRow\);\s*stalePathChip = await waitForSettledVirtualPathHeader\(\);/);
  assert.match(defaultExpression, /if \(nativeHeader && !nativeHeaderText\.includes\(expectedVirtualTitle\)\)/);
  assert.match(defaultExpression, /data-app-action-sidebar-project-list-id/);
  assert.match(defaultExpression, /data-codex-plus-project-sidebar-color/);
  assert.match(defaultExpression, /composerPermissionPickerStatus/);
  assert.match(defaultExpression, /text-editor:local:/);
  assert.match(defaultExpression, /composerContrastStatus/);
  assert.match(defaultExpression, /Ask for approval/);
  assert.match(defaultExpression, /Approve for me/);
  assert.match(defaultExpression, /data-codex-plus-rich-content/);
  assert.match(defaultExpression, /composerControlContrast/);
  assert.match(defaultExpression, /caretContrast/);
  assert.match(defaultExpression, /Composer text caret is unreadable/);
  assert.match(defaultExpression, /occludingDescendants/);
  assert.match(defaultExpression, /codeToolbarBackground/);
  assert.match(defaultExpression, /codeToolbarMatchesSubmit/);
  assert.match(defaultExpression, /!requiresCodeToolbar \|\| \(codeToolbarBackground !== surfaceBackground/);
  assert.match(defaultExpression, /effectiveBackground = isTransparent\(style\.backgroundColor\) \? surfaceBackground : style\.backgroundColor/);
  assert.match(defaultExpression, /Composer code toolbar does not match the submit button background/);
  assert.match(defaultExpression, /Composer custom color is covered by a differently colored child surface/);
  assert.match(defaultExpression, /data-codex-plus-contrast-kind="goal-status"/);
  assert.match(defaultExpression, /data-codex-plus-contrast-kind="context-window-indicator"/);
  assert.match(defaultExpression, /goalStatusFlattened/);
  assert.match(defaultExpression, /contextIndicatorContrast/);
  assert.match(defaultExpression, /userBubbleShapeStatus/);
  assert.match(defaultExpression, /User message wrapper painted behind the rounded bubble/);
  assert.match(defaultExpression, /\[data-user-message-bubble\]/);
  assert.match(defaultExpression, /nativeBubbleMounted/);
  assert.match(defaultExpression, /decorationsUseMutedForeground/);
  assert.match(defaultExpression, /User message decorations do not use the transcript muted foreground/);
  assert.match(defaultExpression, /composerAttachmentPillStatus/);
  assert.match(defaultExpression, /composer-attachment-surface rounded-full bg-token-dropdown-background/);
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
  assert.match(defaultExpression, /sidebarStatusPill/);
  assert.match(defaultExpression, /Sidebar Needs input pill is unreadable/);
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

test("project color fixture retry is limited to the missing Chats rows readiness failure", () => {
  assert.equal(projectColorsNeedsFixtureRetry({
    failures: [{
      plugin: "projectColors",
      message: "Expected the three unpinned fixture no-project chats in the Chats section: []",
    }],
  }), true);
  assert.equal(projectColorsNeedsFixtureRetry({
    failures: [{
      plugin: "projectColors",
      message: "Mounted composer lost its rounded shape",
    }],
  }), false);
  assert.equal(projectColorsNeedsFixtureRetry({
    failures: [{
      plugin: "nestedRepositories",
      message: "Expected the three unpinned fixture no-project chats in the Chats section: []",
    }],
  }), false);
});

test("focused plugin retry replaces only that plugin result, failure, and warnings", () => {
  const live = {
    ok: false,
    failures: [
      { plugin: "projectColors", message: "fixture rows missing" },
      { plugin: "audit", message: "other failure" },
    ],
    expectedWarnings: [
      { plugin: "projectColors", code: "old-warning" },
      { plugin: "audit", code: "other-warning" },
    ],
    pluginResults: {
      projectColors: { ok: false },
      audit: { ok: false },
    },
  };
  const retry = {
    ok: true,
    failures: [],
    expectedWarnings: [{ plugin: "projectColors", code: "retry-warning" }],
    pluginResults: {
      projectColors: { ok: true, retried: true },
    },
  };

  mergeFocusedPluginAudit(live, retry, "projectColors");

  assert.equal(live.ok, false);
  assert.deepEqual(live.failures, [{ plugin: "audit", message: "other failure" }]);
  assert.deepEqual(live.expectedWarnings, [
    { plugin: "audit", code: "other-warning" },
    { plugin: "projectColors", code: "retry-warning" },
  ]);
  assert.deepEqual(live.pluginResults.projectColors, { ok: true, retried: true });
  assert.deepEqual(live.pluginResults.audit, { ok: false });
});

test("project color fixture retry reloads stale sidebar data before focused recheck", async () => {
  const calls = [];
  const result = await refreshFixtureRendererForRetry(
    {},
    { browserState: { userBubbleColors: { dark: "#123456" } } },
    {
      reloadRenderer: async () => {
        calls.push("reload");
        return { ok: true };
      },
      waitRuntime: async () => {
        calls.push("runtime");
        return { ok: true };
      },
      waitAppShell: async () => {
        calls.push("shell");
        return { ok: true };
      },
      dismissDialogs: async () => {
        calls.push("dialogs");
        return { ok: true };
      },
      seedBrowserState: async () => {
        calls.push("seed");
        return { ok: true };
      },
      activateFixture: async () => {
        calls.push("activate");
        return { ok: true };
      },
    },
  );

  assert.deepEqual(calls, ["reload", "runtime", "shell", "dialogs", "seed", "activate"]);
  assert.equal(result.activation.ok, true);
});

test("project selector shortcut verifier uses trusted CDP key events", async () => {
  const sent = [];
  const waits = [];
  const expressions = [];
  const evaluations = [
    { triggerCount: 0, newTask: { x: 80, y: 40 } },
    { triggerCount: 1, newTask: null },
    { triggerCount: 0, menuCount: 1, opened: true, activePlaceholder: "Search projects" },
    {
      codexVersion: "26.730.61309",
      suitableProjectFound: true,
      selectedLabel: "alpha-main",
      query: "aaa",
      visibleResultCount: 2,
      inputRect: { x: 100, y: 50, width: 200, height: 30 },
    },
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

  const result = await verifyProjectSelectorShortcutKey(cdp, { wait(ms) { waits.push(ms); }, timeoutMs: 1000 });

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
  assert.match(expressions[2], /opened: Boolean\(searchInput\)/);
  assert.match(expressions[2], /Array\.from\(document\.querySelectorAll/);
  assert.match(expressions[2], /\.find\(visible\)/);
  assert.doesNotMatch(expressions[2], /searchInput \|\| menuCount > 0/);
  assert.match(expressions[3], /candidates\.find\(\(element\) => visible\(element\) && element\.contains\(input\)\)/);
  assert.match(expressions[3], /input\[placeholder='Search projects'\], textarea\[placeholder='Search projects'\]/);
  assert.match(expressions[3], /const selectable = Array\.from\(menu\.querySelectorAll\("\[role='menuitem'\], \[role='option'\], button, a"\)\)\.filter\(visible\)/);
  assert.match(expressions[3], /const projectItems = selectable\.filter\(\(element\) => element\.matches\("\[role='menuitem'\], \[role='option'\]"\)\)/);
  assert.match(expressions[3], /const labelRoots = projectItems\.length > 0/);
  assert.match(expressions[3], /input\.focus\(\)/);
  assert.match(expressions[3], /input\.select\?\.\(\)/);
  assert.match(expressions[3], /inputRect/);
  assert.match(expressions[4], /const collectState = \(\) =>/);
  assert.match(expressions[4], /const fuzzyMatchesQuery = \(label\) =>/);
  assert.match(expressions[4], /labels\.some\(\(label\) => label === selectedLabel \|\| fuzzyMatchesQuery\(label\)\)/);
  assert.deepEqual(sent.map((call) => call.method), [
    "Input.dispatchMouseEvent",
    "Input.dispatchMouseEvent",
    "Page.bringToFront",
    "Input.dispatchKeyEvent",
    "Input.dispatchKeyEvent",
    "Input.dispatchKeyEvent",
    "Input.dispatchKeyEvent",
    "Input.dispatchMouseEvent",
    "Input.dispatchMouseEvent",
    "Input.dispatchKeyEvent",
    "Input.dispatchKeyEvent",
    "Input.insertText",
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
  assert.deepEqual(sent.slice(7, 9).map((call) => call.params.type), ["mousePressed", "mouseReleased"]);
  assert.deepEqual(sent.slice(9, 11).map((call) => ({ key: call.params.key, modifiers: call.params.modifiers })), [
    { key: "a", modifiers: 4 },
    { key: "a", modifiers: 4 },
  ]);
  assert.deepEqual(sent[9].params.commands, ["selectAll"]);
  assert.equal(sent.some((call) => call.method === "Input.insertText"), true);
  assert.equal(waits.filter((ms) => ms === 150).length, 1);
  assert.deepEqual(sent[11], { method: "Input.insertText", params: { text: "aaa" } });
});

test("project selector shortcut verifier retries the trusted shortcut while the menu stays closed", async () => {
  const sent = [];
  const evaluations = [
    { triggerCount: 1, newTask: null },
    { triggerCount: 1, menuCount: 0, opened: false, activePlaceholder: "" },
    { triggerCount: 1, menuCount: 1, opened: true, activePlaceholder: "Search projects" },
    { codexVersion: "26.730.61309", suitableProjectFound: true, selectedLabel: "alpha-main", query: "aaa", visibleResultCount: 1, inputRect: { x: 100, y: 50, width: 200, height: 30 } },
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

test("project selector shortcut verifier retries when a visible picker disappears before fuzzy input", async () => {
  const sent = [];
  const evaluations = [
    { triggerCount: 1, newTask: null },
    { triggerCount: 1, menuCount: 1, opened: true, activePlaceholder: "Search projects" },
    { retryable: true, suitableProjectFound: false },
    { triggerCount: 1, menuCount: 1, opened: true, activePlaceholder: "Search projects" },
    { codexVersion: "26.715.61943", suitableProjectFound: true, selectedLabel: "alpha-main", query: "aaa", visibleResultCount: 1, inputRect: { x: 100, y: 50, width: 200, height: 30 } },
    {
      suitableProjectFound: true,
      queryLength: 3,
      visibleResultCount: 1,
      selectedProjectStillVisible: true,
      noProjectsFoundVisible: false,
      highlightCount: 1,
      codexVersion: "26.715.61943",
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

test("project selector shortcut verifier retries once when strict fuzzy highlighting is transient", async () => {
  const evaluations = [
    { triggerCount: 1, newTask: null },
    { triggerCount: 1, menuCount: 1, opened: true, activePlaceholder: "Search projects" },
    { codexVersion: "26.730.61309", suitableProjectFound: true, selectedLabel: "alpha-main", query: "aaa", visibleResultCount: 1, inputRect: { x: 100, y: 50, width: 200, height: 30 } },
    { codexVersion: "26.730.61309", suitableProjectFound: true, queryLength: 3, visibleResultCount: 1, selectedProjectStillVisible: true, noProjectsFoundVisible: false, highlightCount: 0 },
    { triggerCount: 1, newTask: null },
    { triggerCount: 1, menuCount: 1, opened: true, activePlaceholder: "Search projects" },
    { codexVersion: "26.730.61309", suitableProjectFound: true, selectedLabel: "alpha-main", query: "aaa", visibleResultCount: 1, inputRect: { x: 100, y: 50, width: 200, height: 30 } },
    { codexVersion: "26.730.61309", suitableProjectFound: true, queryLength: 3, visibleResultCount: 1, selectedProjectStillVisible: true, noProjectsFoundVisible: false, highlightCount: 1 },
  ];
  const cdp = {
    send() { return Promise.resolve(); },
    evaluate() { return Promise.resolve(evaluations.shift()); },
  };

  const result = await verifyProjectSelectorShortcutKey(cdp, { wait() {}, timeoutMs: 1000, retryIntervalMs: 0 });

  assert.equal(result.ok, true);
  assert.equal(result.fuzzyDom.highlightCount, 1);
  assert.equal(evaluations.length, 0);
});

test("fixture activation verifies the canonical active cwd and retries the stable thread identity", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/core/plugin-audit.js"), "utf8");
  const start = source.indexOf("async function activateFixtureThread");
  const end = source.indexOf("async function verifySidebarBlurCommandPalette", start);
  const activation = source.slice(start, end);

  assert.match(activation, /timeoutMs = 60000/);
  assert.match(activation, /CodexPlusHost\.adapters\.context\.active\(\)/);
  assert.match(activation, /current = current\.parentElement/);
  assert.match(activation, /getAttribute\("aria-hidden"\) === "true"/);
  assert.match(activation, /header\?\.querySelectorAll\("\[data-codex-plus-project-path-header\]"\)/);
  assert.match(activation, /header\?\.querySelectorAll\("button"\)/);
  assert.match(activation, /const nativeAction = actionButtons\.find/);
  assert.match(activation, /chipRect\.right <= actionRect\.left/);
  assert.doesNotMatch(activation, /startsWith\("Open in"\)/);
  assert.match(activation, /activeContext\?\.cwd/);
  assert.match(activation, /target\.title/);
  assert.match(activation, /data-app-action-sidebar-thread-title/);
  assert.match(activation, /target\.path/);
  assert.match(activation, /data-app-action-sidebar-project-row.*aria-expanded='false'/);
  assert.match(activation, /aria-label='Expand project'/);
  assert.match(activation, /clickTarget = async \(preferRow = false\)/);
  assert.match(activation, /preferRow \? "row" : "\(labels\[0\] \|\| row\)"/);
  assert.match(activation, /const initialInteraction = await clickTarget\(\);/);
  assert.match(activation, /Input\.dispatchMouseEvent/);
  assert.doesNotMatch(activation, /Input\.dispatchKeyEvent/);
  assert.doesNotMatch(activation, /target\.rowText/);
  assert.doesNotMatch(activation, /replace\(\/\\s\+\/g/);
  assert.match(activation, /JSON\.stringify\(\{ target, initialInteraction, active \}\)/);
  assert.doesNotMatch(activation, /active\.chipPath === target\.path/);
  assert.doesNotMatch(activation, /getAttribute\("data-codex-plus-project-path"\) ===/);
  assert.match(activation, /initialRoute/);
  assert.match(activation, /Page\.navigate/);
  assert.match(activation, /app:\/\/-\/index\.html/);
});

test("visual readback tolerates the document swap while settings navigation loads", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/core/plugin-audit.js"), "utf8");
  const start = source.indexOf("async function visualReadback");
  const end = source.indexOf("async function openSettingsForVisualContract", start);
  const readback = source.slice(start, end);

  assert.equal(
    readback.match(/document\.documentElement\?\.getAttribute/g)?.length,
    2,
  );
  assert.doesNotMatch(readback, /document\.documentElement\.getAttribute/);
});

test("default audit closes the isolated Aharness route without reloading fixture state", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/core/plugin-audit.js"), "utf8");
  const start = source.indexOf("if (splitAharnessProbe) {");
  const end = source.indexOf("let live = null;", start);
  const isolatedProbe = source.slice(start, end);

  assert.match(isolatedProbe, /Closing isolated Aharness route/);
  assert.match(isolatedProbe, /closeVirtualRoute\(cdp\)/);
  assert.match(isolatedProbe, /activateFixture\(cdp, \{ nested: true \}\)/);
  assert.doesNotMatch(isolatedProbe, /reloadRenderer/);
  assert.doesNotMatch(isolatedProbe, /seedFixtureBrowserState/);
});

test("isolated Aharness audit allows its explicit interaction waits to outlive the default DevTools request timeout", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/core/plugin-audit.js"), "utf8");
  const start = source.indexOf("if (splitAharnessProbe) {");
  const end = source.indexOf("let live = null;", start);
  const isolatedProbe = source.slice(start, end);

  assert.match(source, /send\(method, params = \{\}, \{ timeoutMs = 90000 \} = \{\}\)/);
  assert.match(source, /async evaluate\(expression, \{ awaitPromise = true, timeoutMs = 90000 \} = \{\}\)/);
  assert.match(source, /this\.send\("Runtime\.evaluate", \{[\s\S]*?\}, \{ timeoutMs \}\)/);
  assert.match(isolatedProbe, /cdp\.evaluate\([\s\S]*?auditPlugins: \["aharnessRuns"\][\s\S]*?\{ timeoutMs: 600000 \}/);
});

test("Aharness audit accepts a visible native header after a hidden stale header", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/core/plugin-audit.js"), "utf8");
  const start = source.indexOf('if (shouldProbe("aharnessRuns"))');
  const end = source.indexOf('if (shouldProbe("audit"))', start);
  const aharnessAudit = source.slice(start, end);

  assert.match(aharnessAudit, /querySelectorAll\("header, \[data-testid\*='header'\], \[class\*='header'\]"\)/);
  assert.match(aharnessAudit, /normalHeaders\.some\(visible\)/);
  assert.doesNotMatch(aharnessAudit, /const normalHeader = document\.querySelector/);
});

test("broad plugin audit isolates each plugin behind a named bounded request with a project-color budget", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/core/plugin-audit.js"), "utf8");
  const start = source.indexOf("let live = null;");
  const end = source.indexOf("if (fixtureResult && projectColorsNeedsFixtureRetry", start);
  const broadProbe = source.slice(start, end);

  assert.match(broadProbe, /for \(const plugin of baseAuditPlugins\)/);
  assert.match(broadProbe, /`Running plugin probe: \$\{plugin\}`/);
  assert.match(broadProbe, /auditPlugins: \[plugin\]/);
  assert.match(broadProbe, /plugin === "projectColors" \? 180000 : 90000/);
  assert.match(broadProbe, /timeoutMs: Math\.min\(runtimeTimeoutMs, pluginTimeoutMs\)/);
  assert.match(broadProbe, /mergeFocusedPluginAudit\(live, focused, plugin\)/);
  assert.doesNotMatch(broadProbe, /auditPlugins: baseAuditPlugins/);
});

test("project color audit proves New Chat project changes and the neutral no-project state", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/core/plugin-audit.js"), "utf8");
  const start = source.indexOf('if (shouldProbe("projectColors"))');
  const end = source.indexOf('if (shouldProbe("projectPathHeader"))', start);
  const projectAudit = source.slice(start, end);

  assert.match(projectAudit, /projectComposerTransitions/);
  assert.match(source, /status\.accent !== sidebar\.accent/);
  assert.match(source, /target, sidebar, previous, neutral, status/);
  assert.match(source, /data-app-action-sidebar-project-row/);
  assert.match(projectAudit, /initialNoProjectComposer/);
  assert.match(projectAudit, /newChatNeutral/);
  assert.match(projectAudit, /noProjectComposer/);
  assert.match(projectAudit, /restoredExistingComposer/);
  assert.match(projectAudit, /dispatchPointerClick/);
  assert.match(projectAudit, /dispatchPointerClick\(projectlessChatRow\)/);
  assert.match(projectAudit, /requiresProjectComposerTransitions/);
  assert.match(projectAudit, /versionAtLeast\(26, 715\)/);
  assert.match(projectAudit, /const projectNewChatTargets = requiresProjectComposerTransitions \?/);
  assert.match(projectAudit, /requiresNoProjectNewChatProof/);
  assert.match(projectAudit, /26, 707, 51957/);
  assert.match(projectAudit, /const chatSectionProjectlessRows = chatGptFamily \? \[\] : await waitForProjectlessRowsInChatsSection\(\)/);
  assert.match(projectAudit, /new-chat-navigation-unavailable/);
  assert.match(projectAudit, /userEntryMarked/);
  assert.match(source, /projectSelectorMounted/);
  assert.match(projectAudit, /initialNoProjectComposer\.userEntryMarked/);
  assert.match(projectAudit, /!initialNoProjectComposer\.projectMarked/);
  assert.match(projectAudit, /!initialNoProjectComposer\.accent/);
  assert.match(projectAudit, /initialNoProjectComposer\.railWidth === 0/);
  assert.match(projectAudit, /observed\.background !== initialNoProjectComposer\.background/);
  assert.match(projectAudit, /observed\.railWidth !== 6/);
  assert.match(projectAudit, /observed\.railColor !== observed\.accentColor/);
  assert.match(source, /status\.userEntryMarked/);
  assert.match(projectAudit, /data-codex-plus-project-color/);
  assert.match(source, /data-codex-plus-composer-surface/);
  assert.match(projectAudit, /target\.projectAccent !== selectedProjectAccent/);
});

test("New Chat visual proof captures neutral and two project-color states with trusted input", () => {
  const source = captureNewChatComposerProof.toString();

  assert.match(source, /Input\.dispatchMouseEvent/);
  assert.match(source, /__codexPlusComposerProjectCalls/);
  assert.match(source, /bridgeProjectCalls/);
  assert.match(source, /work in a project/);
  assert.match(source, /data-codex-plus-project-selector-trigger/);
  assert.match(source, /projectSelectorMounted/);
  assert.match(source, /occludingDescendants/);
  assert.match(source, /element\.closest\("\[data-composer-code-block\]"\)/);
  assert.match(source, /neutral\.occludingDescendants\.length > 0/);
  assert.match(source, /status\.occludingDescendants\.length > 0/);
  assert.match(source, /New Chat composer color is covered by a differently colored child surface/);
  assert.match(source, /borderRadii/);
  assert.match(source, /New Chat composer does not preserve rounded upstream corners/);
  assert.match(source, /Project New Chat composer radius differs from the no-project composer/);
  assert.match(source, /Choose project/);
  assert.match(source, /const projectLabels = new Set/);
  assert.match(source, /projectLabels\.has\(text\)/);
  assert.match(source, /kind === "project-option"/);
  assert.match(source, /\[role='menuitem'\],\[role='option'\],button/);
  assert.match(source, /element\.closest\("\[role='listbox'\],\[role='menu'\]"\)/);
  assert.match(source, /!element\.closest\("\[data-app-action-sidebar-project-row\]"\)/);
  assert.match(source, /Start new task in/);
  assert.match(source, /Start new \(\?:chat\|task\) in/);
  assert.match(source, /target\?\.scrollIntoView\(\{ block: "center" \}\)/);
  assert.match(source, /document\.elementFromPoint\(point\.x, point\.y\)/);
  assert.match(source, /target\.contains\(hitTarget\)/);
  assert.doesNotMatch(source, /const usesProjectSelector =/);
  assert.match(source, /const projectSelectorTrigger = await pointFor\("project-selector-trigger"\)/);
  assert.match(source, /const selectProject = async/);
  assert.match(source, /await selectProject\(target\.label\)/);
  assert.match(source, /await selectProject\(target\.label, \{ retry: true \}\)/);
  assert.match(source, /New Chat project target was not visible/);
  assert.match(source, /if \(projectSelectorTrigger\)/);
  assert.match(source, /await click\(projectSelectorTrigger\)/);
  assert.match(source, /const projectNewChat = await waitForStablePoint\("project-new-chat", label\)/);
  assert.match(source, /await wait\(500\);\n      const projectOption/);
  assert.match(source, /await waitForState\(projectStateReady, \{ timeout: 1500, required: false \}\)/);
  assert.doesNotMatch(source, /await click\(await waitForStablePoint\("project-new-chat", target\.label\)\)/);
  assert.match(source, /const waitForStablePoint = async/);
  assert.match(source, /await waitForStablePoint\("project-option", label\)/);
  assert.match(source, /waitForStablePoint\("project-new-chat", label\)/);
  assert.doesNotMatch(source, /composerCodeLanguageControl|typeFencedBlock|validCodeToolbar/);
  assert.match(source, /neutral\.projectMarked \|\| neutral\.accent \|\| neutral\.railWidth !== 0/);
  assert.doesNotMatch(source, /const labels =/);
  assert.match(source, /new-chat-no-project\.png/);
  assert.match(source, /new-chat-project-\$\{index \+ 1\}\.png/);
  assert.match(source, /status\.background !== neutral\.background/);
  assert.match(source, /status\.accent !== target\.accent/);
  assert.match(source, /sidebar\.label !== target\.label/);
  assert.match(source, /status\.railWidth !== 6/);
  assert.match(source, /status\.railColor !== status\.accentColor/);
  assert.doesNotMatch(source, /newChatProjectSelector|requiresProjectSelector/);
  assert.doesNotMatch(source, /projects: \[\], screenshots/);
  assert.doesNotMatch(source, /versionAtLeast\("26\.715"\)/);
});

test("Aharness audit waits for the new run row to become active before asserting its styling", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/core/plugin-audit.js"), "utf8");
  const start = source.indexOf("const waitForAharness = async");
  const end = source.indexOf('const route = await waitForAharness("[data-codex-plus-aharness-route]")', start);
  const runAudit = source.slice(start, end);

  assert.match(runAudit, /waitForAharness\([^,]+,\s*\(element\)/);
  assert.match(runAudit, /querySelectorAll\(selector\)/);
  assert.match(runAudit, /data-app-action-sidebar-thread-active/);
  assert.match(runAudit, /data-codex-plus-aharness-run-active/);
});

test("Aharness coding smoke fails fast with direct native run diagnostics", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/core/plugin-audit.js"), "utf8");
  const start = source.indexOf('const codingRun = await createFsmRun("examples/coding-smoke.fsm.ts")');
  const end = source.indexOf("const codingWaitingComposer", start);
  const codingSmoke = source.slice(start, end);

  assert.match(codingSmoke, /codingRun\.activeRunId/);
  assert.match(codingSmoke, /read\?\.run\?\.status/);
  assert.match(codingSmoke, /read\?\.run\?\.currentState\?\.path/);
  assert.match(codingSmoke, /read\?\.run\?\.recentRows/);
  assert.doesNotMatch(codingSmoke, /read\?\.result\?\.run/);
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
    { codexVersion: "26.730.61309", suitableProjectFound: false, selectedLabel: "", query: "", visibleResultCount: 0 },
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

  const result = await verifyProjectSelectorShortcutKey(cdp, { wait() {}, timeoutMs: 1000, fuzzyRetryCount: 0 });

  assert.equal(result.ok, false);
  assert.equal(result.opened, true);
  assert.equal(result.fuzzyDom.suitableProjectFound, false);
  assert.match(result.message, /Project selector fuzzy filtering did not preserve/);
  assert.equal(JSON.stringify(result).includes("/"), false);
  assert.deepEqual(sent.filter((call) => call.method === "Input.dispatchKeyEvent").map((call) => call.params.key), ["Escape", "Escape", ".", ".", "Escape", "Escape"]);
});

test("sidebar blur command palette verifier activates the exact live result with trusted keyboard input", async () => {
  const sent = [];
  const evaluations = [
    undefined,
    undefined,
    { opened: true, activeTag: "INPUT", inputPlaceholder: "Search commands", inputValue: "Toggle sidebar blur", inputRect: { x: 80, y: 40 } },
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
    "Input.dispatchKeyEvent",
    "Input.dispatchKeyEvent",
  ]);
  assert.deepEqual(sent.map((call) => call.params.type), ["keyDown", "keyUp"]);
  assert.deepEqual(sent.map((call) => call.params.key), ["Enter", "Enter"]);
});

test("sidebar blur command palette verifier focuses and types into an unseeded palette query", async () => {
  const sent = [];
  const evaluations = [
    undefined,
    undefined,
    { opened: true, activeTag: "INPUT", inputPlaceholder: "Search commands", inputValue: "", inputRect: { x: 80, y: 40 } },
    { selected: true, itemText: "Toggle sidebar blur", rect: { x: 64, y: 32 } },
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

  const result = await verifySidebarBlurCommandPalette(cdp, { activate: false, wait() {}, timeoutMs: 1000 });

  assert.equal(result.ok, true);
  assert.deepEqual(sent.map((call) => call.method), [
    "Input.dispatchMouseEvent",
    "Input.dispatchMouseEvent",
    "Input.insertText",
  ]);
  assert.deepEqual(sent.slice(0, 2).map((call) => call.params.type), ["mousePressed", "mouseReleased"]);
  assert.equal(sent[2].params.text, "Toggle sidebar blur");
});

test("sidebar blur command palette verifier rejects an unexpected non-empty query", async () => {
  const sent = [];
  const evaluations = [
    undefined,
    undefined,
    { opened: true, activeTag: "INPUT", inputPlaceholder: "Search commands", inputValue: "Toggle sidebar blurToggle sidebar blur", inputRect: { x: 80, y: 40 } },
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

  const result = await verifySidebarBlurCommandPalette(cdp, { activate: false, wait() {}, timeoutMs: 1000 });

  assert.equal(result.ok, false);
  assert.match(result.message, /unexpected query/);
  assert.deepEqual(sent, []);
});

test("sidebar command visual proof waits for transient chat loading to clear", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/core/plugin-audit.js"), "utf8");
  const waitIndex = source.indexOf('text.includes("Loading chats…")');
  const captureIndex = source.indexOf('path.join(artifactDir, "sidebar-command.png")', waitIndex);
  assert.notEqual(waitIndex, -1);
  assert.match(source.slice(waitIndex, captureIndex), /text\.includes\("Loading tasks…"\)/);
  assert.match(source.slice(waitIndex, captureIndex), /text\.includes\("Loading tasks\.\.\."\)/);
  assert.ok(captureIndex > waitIndex);
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
        strictNestedComments: true,
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
        nestedInteractiveDiffCount: 2,
        nestedUndefinedDiffCount: 0,
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
  assert.equal(result.nestedInteractiveDiffCount, 2);
  assert.equal(result.nestedUndefinedDiffCount, 0);
  assert.equal(result.nestedDiffDisclosureExpanded, true);
  assert.equal(result.nestedDiffDisclosureCollapsed, true);
  assert.equal(result.message, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(result, "title"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, "path"), false);
});

test("review panel verifier retries a visible host error boundary with trusted input", async () => {
  const sent = [];
  let evaluateCalls = 0;
  const ready = {
    candidateCount: 1,
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
    unstagedReviewSourceSelected: true,
    reviewToolbarFailureVisible: false,
    nestedRepoVisible: true,
    strictNestedBranchPreload: false,
    strictNestedComments: false,
    nestedBranchPickerCount: 2,
    nestedBranchPickerPreloadBeforeOpen: true,
    nestedBranchPickerPreloadComplete: true,
    nestedBranchPickerPopulated: true,
    nestedBranchPickerOptionCounts: [3, 3],
    rawNestedDiffFallbackCount: 0,
    reviewDiffCardCount: 3,
    nestedDiffCardCount: 2,
    nestedInteractiveDiffCount: 1,
    nestedUndefinedDiffCount: 0,
    nestedDiffDisclosureExpanded: true,
    nestedDiffDisclosureCollapsed: true,
  };
  const result = await verifyReviewPanelRender({
    evaluate() {
      evaluateCalls += 1;
      if (evaluateCalls === 1) {
        return Promise.resolve({ ...ready, boundaryVisible: true, boundaryEverVisible: true, tryAgainVisible: true });
      }
      if (evaluateCalls === 2) return Promise.resolve({ x: 640, y: 448 });
      return Promise.resolve({ ...ready, boundaryEverVisible: true });
    },
    send(method, params) {
      sent.push([method, params]);
      return Promise.resolve();
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.recoveredBoundary, true);
  assert.deepEqual(sent.slice(0, 3).map(([, params]) => params.type), ["mouseMoved", "mousePressed", "mouseReleased"]);
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
    strictNestedComments: true,
    nestedBranchPickerCount: 2,
    nestedBranchPickerPreloadBeforeOpen: true,
    nestedBranchPickerPreloadComplete: true,
    nestedBranchPickerPopulated: true,
    nestedBranchPickerOptionCounts: [3, 3],
    rawNestedDiffFallbackCount: 0,
    reviewDiffCardCount: 3,
    nestedDiffCardCount: 2,
    nestedInteractiveDiffCount: 2,
    nestedUndefinedDiffCount: 0,
    nestedDiffDisclosureExpanded: true,
    nestedDiffDisclosureCollapsed: true,
  };
  const branch = await verifyReviewPanelRender({ evaluate: () => Promise.resolve({ ...base, unstagedReviewSourceSelected: false, reviewToolbarFailureVisible: false }) });
  const legacyUnstagedFixture = await verifyReviewPanelRender({ evaluate: () => Promise.resolve({
    ...base,
    unstagedReviewSourceSelected: false,
    mainUnstagedFixtureVisible: true,
    reviewToolbarFailureVisible: false,
  }) });
  const toolbarFailure = await verifyReviewPanelRender({ evaluate: () => Promise.resolve({ ...base, unstagedReviewSourceSelected: true, reviewToolbarFailureVisible: true }) });
  const commentsDisabled = await verifyReviewPanelRender({ evaluate: () => Promise.resolve({ ...base, unstagedReviewSourceSelected: true, reviewToolbarFailureVisible: false, nestedInteractiveDiffCount: 0 }) });
  const undefinedText = await verifyReviewPanelRender({ evaluate: () => Promise.resolve({ ...base, unstagedReviewSourceSelected: true, reviewToolbarFailureVisible: false, nestedUndefinedDiffCount: 1 }) });

  assert.equal(branch.ok, false);
  assert.equal(legacyUnstagedFixture.ok, true);
  assert.equal(toolbarFailure.ok, false);
  assert.equal(commentsDisabled.ok, false);
  assert.equal(undefinedText.ok, false);
});

test("Review panel audit retries only a cold nested branch preload", () => {
  const otherwiseReady = {
    ok: false,
    reviewControlFound: true,
    clickedReview: true,
    selectedReview: true,
    boundaryVisible: false,
    boundaryEverVisible: false,
    tryAgainVisible: false,
    repoHeaderVisible: true,
    mainVisible: true,
    nativeReviewSourceVisible: true,
    unstagedReviewSourceSelected: true,
    reviewToolbarFailureVisible: false,
    nestedRepoVisible: true,
    strictNestedBranchPreload: true,
    nestedBranchPickerPreloadBeforeOpen: false,
    nestedBranchPickerPreloadComplete: true,
    nestedBranchPickerPopulated: true,
    nestedBranchPickerCount: 2,
    nestedBranchPickerOptionCounts: [3, 3],
    rawNestedDiffFallbackCount: 0,
    reviewDiffCardCount: 7,
    reviewLoadingPlaceholderCount: 0,
    nestedDiffCardCount: 2,
    nestedInteractiveDiffCount: 2,
    nestedUndefinedDiffCount: 0,
    nestedDiffDisclosureExpanded: true,
    nestedDiffDisclosureCollapsed: true,
  };

  assert.equal(reviewPanelNeedsWarmRetry(otherwiseReady), true);
  assert.equal(reviewPanelNeedsWarmRetry({ ...otherwiseReady, nestedRepoVisible: false }), false);
  assert.equal(reviewPanelNeedsWarmRetry({ ...otherwiseReady, rawNestedDiffFallbackCount: 1 }), false);
  assert.equal(reviewPanelNeedsWarmRetry({ ...otherwiseReady, boundaryVisible: true }), false);
  assert.equal(reviewPanelNeedsWarmRetry({ ...otherwiseReady, strictNestedBranchPreload: false }), false);
  assert.equal(reviewPanelNeedsWarmRetry({
    ...otherwiseReady,
    repoHeaderVisible: false,
    mainVisible: false,
    nestedRepoVisible: false,
    nestedBranchPickerCount: 0,
    nestedBranchPickerPreloadComplete: false,
    nestedBranchPickerPopulated: false,
    nestedBranchPickerOptionCounts: [],
    reviewDiffCardCount: 0,
    reviewLoadingPlaceholderCount: 1,
    nestedDiffCardCount: 0,
    nestedDiffDisclosureExpanded: false,
    nestedDiffDisclosureCollapsed: false,
  }), true);
  assert.equal(reviewPanelNeedsWarmRetry({
    ...otherwiseReady,
    repoHeaderVisible: false,
    mainVisible: false,
    nestedRepoVisible: true,
    nestedBranchPickerCount: 0,
    nestedBranchPickerPreloadComplete: false,
    nestedBranchPickerPopulated: false,
    nestedBranchPickerOptionCounts: [],
    reviewDiffCardCount: 5,
    nestedDiffCardCount: 0,
    nestedDiffDisclosureExpanded: false,
    nestedDiffDisclosureCollapsed: false,
  }), true);
});

test("review panel verifier scopes Unstaged selection to the native Branch menu", () => {
  const source = verifyReviewPanelRender.toString();

  assert.match(source, /getAttribute\("aria-controls"\)/);
  assert.match(source, /initialExpanded = toggle\.getAttribute\("data-app-action-review-file-expanded"\) === "true"/);
  assert.match(source, /toggledExpanded !== initialExpanded && restoredExpanded === initialExpanded/);
  assert.match(source, /Math\.max\(initialHeight, toggledHeight\)/);
  assert.match(source, /Math\.min\(initialHeight, toggledHeight\)/);
  assert.match(source, /normalize\(element\.textContent\) === "Show"/);
  assert.match(source, /visibleElements\("button,\[role='button'\],span,div"\)/);
  assert.match(source, /!element\.closest\("\[data-codex-plus-repo-patch-group\]"\)/);
  assert.match(source, /\(leftRect\.width \* leftRect\.height\) - \(rightRect\.width \* rightRect\.height\)/);
  assert.match(source, /Input\.dispatchMouseEvent/);
  assert.match(source, /expandedMainReview/);
  assert.match(source, /mainDiffDisclosureExpanded/);
  assert.match(source, /mainReviewDeadline/);
  assert.match(source, /reviewDiffCardCount >= 3/);
  assert.match(source, /reviewDiffCardCount >= 2 &&\s*\(finalStatus\.reviewDiffCardCount >= 3 \|\| finalStatus\.mainDiffDisclosureExpanded\)/);
  assert.doesNotMatch(source, /selectUnstagedReviewSource/);
  assert.doesNotMatch(source, /loadNestedBranchPickers/);
});

test("Mermaid viewer audit reports source-render failures before waiting for a native target", () => {
  const source = verifyMermaidViewerRender.toString();

  assert.match(source, /const openResult = await appCdp\.evaluate/);
  assert.match(source, /if \(!openResult\?\.ok\)/);
  assert.match(source, /Mermaid viewer did not open: \$\{openResult\?\.message/);
});

test("live review audit opens the native Review control with trusted input", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/core/plugin-audit.js"), "utf8");
  const start = source.indexOf("async function activateReviewControlWithTrustedInput");
  const end = source.indexOf("async function verifyReviewPanelRender", start);
  const activation = source.slice(start, end);
  const visualContract = captureVisualContract.toString();

  assert.match(activation, /Input\.dispatchMouseEvent/);
  assert.match(activation, /text === "Review" \|\| label === "Review"/);
  assert.match(activation, /text === "Changes" \|\| label === "Changes"/);
  assert.match(activation, /rect\.left >= innerWidth \* 0\.6 && rect\.top < 240/);
  assert.match(activation, /clickCount: 1/);
  assert.match(visualContract, /if \(verifyReview === verifyReviewPanelRender\) await activateReviewControlWithTrustedInput\(cdp\)/);
});

test("live review audit permits six bounded warm retries while Review is still loading", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/core/plugin-audit.js"), "utf8");
  assert.match(source, /retryAttempt < 6/);
  assert.match(source, /reviewPanelNeedsWarmRetry\(reviewPanel\)/);
});

test("visual Review proof waits for actual nested fixture renders instead of card counts", async () => {
  const source = waitForReviewFixtureDiffText.toString();
  assert.match(source, /const mainDiffToggles/);
  assert.match(source, /!toggle\.closest\("\[data-codex-plus-repo-patch-group\]"\)/);
  assert.match(source, /data-app-action-review-file-expanded/);
  assert.match(source, /const mainHideButton/);
  assert.match(source, /button,\[role='button'\],span,div/);
  assert.match(source, /\(button\.textContent \|\| ""\)\.trim\(\) === "Hide"/);
  assert.match(source, /Full file content failed to load/);

  const states = [
    {
      plusTomlVisible: false,
      renderedNestedDiffKeys: ["repos/alpha-module"],
      loadingPlaceholderCount: 0,
      retryButtonCount: 2,
      clickedRetryCount: 2,
      expandedNestedDiffCount: 2,
      failureMessageCount: 2,
      nestedScroll: { x: 1180, y: 410, deltaY: 600 },
    },
    {
      plusTomlVisible: true,
      renderedNestedDiffKeys: ["repos/beta-module"],
      loadingPlaceholderCount: 0,
      retryButtonCount: 0,
      clickedRetryCount: 0,
      expandedNestedDiffCount: 0,
      failureMessageCount: 0,
      nestedScroll: null,
      captureScroll: { x: 1180, y: 410, deltaY: 400 },
      capturePosition: { firstTop: 700, lastBottom: 1100 },
    },
    {
      plusTomlVisible: false,
      renderedNestedDiffKeys: ["repos/alpha-module", "repos/beta-module"],
      loadingPlaceholderCount: 0,
      retryButtonCount: 0,
      clickedRetryCount: 0,
      expandedNestedDiffCount: 0,
      failureMessageCount: 0,
      nestedScroll: null,
      captureScroll: null,
      capturePosition: { firstTop: 350, lastBottom: 780 },
    },
  ];
  const sent = [];
  const result = await waitForReviewFixtureDiffText(
    {
      send: async (method, params) => sent.push({ method, params }),
      evaluate: async (expression) => {
        assert.match(expression, /diffs-container/);
        assert.match(expression, /\[data-placeholder\]\[data-loading\]/);
        assert.match(expression, /data-codex-plus-repo-patch-group/);
        assert.match(expression, /data-codex-plus-audit-retry-clicked/);
        assert.match(expression, /renderedNestedDiffKeys/);
        assert.match(expression, /# Nested Alpha Module/);
        assert.match(expression, /# Nested Beta Module/);
        assert.doesNotMatch(expression, /scrollIntoView/);
        return states.shift() ?? {
          plusTomlVisible: true,
          renderedNestedDiffKeys: ["repos/alpha-module", "repos/beta-module"],
          loadingPlaceholderCount: 0,
          retryButtonCount: 0,
          clickedRetryCount: 0,
          expandedNestedDiffCount: 0,
          failureMessageCount: 0,
          nestedScroll: null,
          captureScroll: null,
        };
      },
    },
    { timeoutMs: 10, pollMs: 0, wait: async () => {} },
  );

  assert.deepEqual(result, {
    ok: true,
    plusTomlVisible: true,
    renderedNestedDiffKeys: ["repos/alpha-module", "repos/beta-module"],
    nestedRenderedDiffCount: 2,
    loadingPlaceholderCount: 0,
    retryButtonCount: 0,
    clickedRetryCount: 0,
    expandedNestedDiffCount: 0,
    failureMessageCount: 0,
    nestedScroll: null,
    captureScroll: null,
    capturePosition: { firstTop: 350, lastBottom: 780 },
    retryClickCount: 2,
  });
  assert.deepEqual(sent, [
    {
      method: "Input.dispatchMouseEvent",
      params: { type: "mouseWheel", x: 1180, y: 410, deltaX: 0, deltaY: 600 },
    },
    {
      method: "Input.dispatchMouseEvent",
      params: { type: "mouseWheel", x: 1180, y: 410, deltaX: 0, deltaY: 400 },
    },
  ]);
});

test("visual Review proof does not fail when capture positioning reaches the scroll limit", async () => {
  const captureScroll = { x: 1180, y: 410, deltaY: 250 };
  const sent = [];
  const result = await waitForReviewFixtureDiffText(
    {
      send: async (method, params) => sent.push({ method, params }),
      evaluate: async () => ({
        plusTomlVisible: true,
        renderedNestedDiffKeys: ["repos/alpha-module", "repos/beta-module"],
        loadingPlaceholderCount: 0,
        retryButtonCount: 0,
        clickedRetryCount: 0,
        expandedNestedDiffCount: 0,
        failureMessageCount: 0,
        nestedScroll: null,
      captureScroll,
      capturePosition: { firstTop: 380, lastBottom: 800 },
      }),
    },
    { timeoutMs: 10, pollMs: 0, wait: async () => {} },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(sent, [
    {
      method: "Input.dispatchMouseEvent",
      params: { type: "mouseWheel", x: 1180, y: 410, deltaX: 0, deltaY: 250 },
    },
  ]);
});

test("visual Review proof does not require the repository manifest to appear as a diff", async () => {
  const result = await waitForReviewFixtureDiffText(
    {
      send: async () => {},
      evaluate: async () => ({
        plusTomlVisible: false,
        renderedNestedDiffKeys: ["repos/alpha-module", "repos/beta-module"],
        loadingPlaceholderCount: 0,
        retryButtonCount: 0,
        clickedRetryCount: 0,
        expandedNestedDiffCount: 0,
        failureMessageCount: 0,
        nestedScroll: null,
        captureScroll: null,
        capturePosition: { firstTop: 369, lastBottom: 820 },
      }),
    },
    { timeoutMs: 10, pollMs: 0, wait: async () => {} },
  );

  assert.equal(result.ok, true);
  assert.equal(result.plusTomlVisible, false);
  assert.deepEqual(result.renderedNestedDiffKeys, [
    "repos/alpha-module",
    "repos/beta-module",
  ]);
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
    "recoveredBoundary",
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

test("app shell wait reports a sustained startup loader as a possible native dialog", async () => {
  let clock = 0;
  const blockers = [];
  await assert.rejects(
    () => waitForAppShellMounted(
      {
        evaluate() {
          return Promise.resolve({
            readyState: "complete",
            hasRoot: true,
            hasStartupLoader: true,
            bodyTextLength: 0,
            elementCount: 141,
            interactiveCount: 0,
          });
        },
      },
      1000,
      {
        blockerAfterMs: 500,
        now: () => clock,
        onStartupBlocker: (status) => blockers.push(status),
        wait: async (ms) => { clock += ms; },
      },
    ),
    /Timed out waiting for Codex app shell to mount/,
  );
  assert.equal(blockers.length, 1);
  assert.equal(blockers[0].possibleNativeDialog, true);
  assert.equal(blockers[0].elapsedMs, 500);
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
  let launchOptions = null;
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
      launchDevHome: "/tmp/cpx-r/test-home",
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
        launchDevApp(options) {
          launchOptions = options;
          return Promise.resolve({ pid: 123, command: "Codex", args: [] });
        },
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
  assert.equal(launchOptions.devHome, "/tmp/cpx-r/test-home");
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
  assert.deepEqual(calls.find((call) => call[0] === "shellTimeoutMs"), ["shellTimeoutMs", 240000]);
  assert.deepEqual(calls.find((call) => call[0] === "runtimeTimeoutMs"), ["runtimeTimeoutMs", 240000]);
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
  const gitOptions = [];
  const clean = auditIdentity({
    cwd: "/repo",
    execFileSync(command, args, options) {
      assert.equal(command, "git");
      gitOptions.push(options);
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
  assert.equal(gitOptions.length, 2);
  assert.ok(gitOptions.every((options) => options.timeout === 2000));

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
    let dialogDismissals = 0;
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
          review: { tabVisible: true, repoHeaderVisible: true, diffCardCount: 2, loadingPlaceholderCount: 0, rawDiffFallbackCount: 0 },
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
          patchSet: "chatgpt-test",
          codexVersion: "26.623.141536",
          bundleVersion: "4753",
        },
        target: { app: "/tmp/Codex Plus.app" },
        pluginResults: {
          projectColors: {
            ok: true,
            newChatNeutral: true,
            initialNoProjectComposer: { background: "rgb(24, 24, 24)", railWidth: 0 },
            projectComposerTransitions: [{ observed: { background: "rgb(24, 24, 24)", railWidth: 6 } }],
          },
        },
      },
      wait() {},
      activateFixture: async () => ({ ok: true }),
      verifyComposer: async () => ({ ok: true, pillCount: 1, synthetic: true }),
      verifyComposerVerbatim: async () => ({ ok: true, supported: false, screenshots: {} }),
      captureNewChat: async () => ({ ok: true, supported: false, screenshots: {} }),
      verifyComposerState: async () => ({
        ok: true,
        synthetic: true,
        goalStatusFlattened: true,
        textContrast: 12,
        contextIndicatorContrast: 12,
        contextIndicatorAdaptive: true,
      }),
      verifySidebarStatus: async () => ({ ok: true, synthetic: true, textContrast: 12 }),
      verifyReview: async () => ({ ok: true }),
      waitReviewFixture: async () => ({ ok: true, plusTomlVisible: true, subprojectCommitCount: 2, loadingPlaceholderCount: 0 }),
      verifyCommand: async () => ({ ok: true }),
      dismissDialogs: async () => {
        dialogDismissals += 1;
        return { cleared: true };
      },
    });

    assert.equal(contract.ok, true);
    assert.equal(dialogDismissals, 1);
    for (const file of ["contract.json", "audit-summary.json", "composer-pill.png", "composer-state-contrast.png", "sidebar-needs-input.png", "shell.png", "review.png", "sidebar-command.png", "settings.png"]) {
      assert.equal(fs.existsSync(path.join(tmpDir, file)), true);
    }
    const readback = JSON.parse(fs.readFileSync(path.join(tmpDir, "contract.json"), "utf8"));
    assert.equal(readback.settings.generalVisible, true);
    assert.equal(readback.review.diffCardCount, 2);
    assert.equal(readback.composerPill.ok, true);
    assert.equal(readback.composerStateContrast.goalStatusFlattened, true);
    assert.equal(readback.composerStateContrast.contextIndicatorAdaptive, true);
    assert.equal(readback.sidebarNeedsInput.ok, true);
    const summary = JSON.parse(fs.readFileSync(path.join(tmpDir, "audit-summary.json"), "utf8"));
    assert.equal(summary.newChatComposer.newChatNeutral, true);
    assert.equal(summary.newChatComposer.projectComposerTransitions[0].observed.railWidth, 6);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("visual contract uses preflighted capability evidence for the fenced-code language control matrix", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/core/plugin-audit.js"), "utf8");
  const start = source.indexOf("async function verifyComposerVerbatimContrast");
  const end = source.indexOf("async function verifySidebarStatusPillContrast", start);
  const verifier = source.slice(start, end);

  assert.doesNotMatch(verifier, /versionAtLeast|codexVersion/);
  assert.match(verifier, /capability\?\.status === "unavailable"/);
  assert.match(verifier, /capability\?\.status !== "required"/);
  assert.match(verifier, /srgbMatch/);
  assert.match(verifier, /submitBackground/);
  assert.match(verifier, /footerControls/);
  assert.match(verifier, /entry\.contrast != null && entry\.contrast >= 4\.5/);
  assert.match(verifier, /entry\.paintContrasts\.every\(\(paint\) => paint\.contrast != null && paint\.contrast >= 4\.5\)/);
  assert.match(verifier, /paintElement\.namespaceURI === "http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(verifier, /const themes = \["light", "dark"\]/);
  assert.match(verifier, /#f8fafc/);
  assert.match(verifier, /#e0218a/);
  assert.match(verifier, /#111827/);
  assert.match(verifier, /mouseMoved", x: 1, y: 1/);
  assert.match(verifier, /document\.elementFromPoint/);
  assert.match(verifier, /hitInsideControl/);
  assert.match(verifier, /const waitForMenu = async/);
  assert.match(verifier, /await waitForMenu\(\)/);
  assert.match(verifier, /dismissBlockingAuxiliaryTargets\(cdp\)/);
  assert.match(verifier, /key: "Enter"/);
  assert.doesNotMatch(verifier, /control\?\.click|control\.click/);
  assert.match(verifier, /hover\.hovered/);
  assert.match(verifier, /focused\.focused && open\.open/);
  assert.match(verifier, /open\.menuMounted && open\.optionCount > 0/);
  assert.match(verifier, /state\.menuContrast != null && state\.menuContrast >= 4\.5/);
  assert.match(verifier, /for \(let attempt = 0; attempt < 3 && !reopened\?\.menuMounted; attempt \+= 1\)/);
  assert.match(verifier, /for \(let attempt = 0; attempt < 3 && selected\.selectedText === initial\.selectedText; attempt \+= 1\)/);
  assert.match(verifier, /const shouldSelect = cases\.length === 0/);
  assert.match(verifier, /const selectionOk = cases\.some/);
  assert.match(verifier, /state\.toolbarBackground === state\.controlBackground/);
  assert.match(verifier, /const adaptiveColorsOk = themes\.every/);
  assert.match(verifier, /new Set\(themeCases\.map\(\(entry\) => entry\.initial\.controlBackground\)\)\.size === colors\.length/);
  assert.doesNotMatch(verifier, /state\.toolbarBackground === state\.submitBackground/);
  assert.match(source, /composerVerbatim\?\.screenshots/);
});

test("visual contract rejects Review screenshots while diff cards are still loading", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-plus-contract-review-loading-"));
  try {
    const png = Buffer.from("png").toString("base64");
    const cdp = {
      async send(method) {
        if (method === "Page.captureScreenshot") return { data: png };
        return {};
      },
      async evaluate() {
        return {
          url: "app://-/index.html",
          title: "Codex Plus",
          shell: { startupLoaderVisible: false, bodyTextSample: "Pinned Harness Runs Projects" },
          sidebar: { pinnedVisible: true, harnessRunsVisible: true, projectsVisible: true, threadRows: 3, projectRows: 2, blurred: false },
          review: { tabVisible: true, repoHeaderVisible: true, diffCardCount: 2, loadingPlaceholderCount: 2, rawDiffFallbackCount: 0 },
          commandPalette: { sidebarBlurred: true, visible: true, toggleItemVisible: true },
          settings: { generalVisible: true, backToAppVisible: true, blank: false },
        };
      },
    };

    const contract = await captureVisualContract(cdp, {
      artifactDir: tmpDir,
      result: { ok: true, failures: [], expectedWarnings: [], applyResult: {}, target: {}, pluginResults: {} },
      wait() {},
      activateFixture: async () => ({ ok: true }),
      verifySidebarStatus: async () => ({ ok: true }),
      verifyComposer: async () => ({ ok: true }),
      verifyReview: async () => ({ ok: true }),
      waitReviewFixture: async () => ({ ok: true, plusTomlVisible: true, subprojectCommitCount: 2, loadingPlaceholderCount: 0 }),
      verifyCommand: async () => ({ ok: true }),
      dismissDialogs: async () => ({ present: false, dismissed: false }),
    });

    assert.equal(contract.ok, false);
    assert.match(contract.message, /capture-ready/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("visual contract accepts exact late Review readiness after an early transient miss", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-plus-contract-review-late-"));
  try {
    const png = Buffer.from("png").toString("base64");
    const cdp = {
      async send(method) {
        if (method === "Page.captureScreenshot") return { data: png };
        return {};
      },
      async evaluate() {
        return {
          url: "app://-/index.html",
          title: "Codex Plus",
          shell: { startupLoaderVisible: false, bodyTextSample: "Pinned Harness Runs Projects" },
          sidebar: { pinnedVisible: true, harnessRunsVisible: true, projectsVisible: true, threadRows: 3, projectRows: 2, blurred: false },
          review: { tabVisible: true, repoHeaderVisible: true, diffCardCount: 2, loadingPlaceholderCount: 0, rawDiffFallbackCount: 0 },
          commandPalette: { sidebarBlurred: true, visible: true, toggleItemVisible: true },
          settings: { generalVisible: true, backToAppVisible: true, blank: false },
        };
      },
    };

    const contract = await captureVisualContract(cdp, {
      artifactDir: tmpDir,
      result: { ok: true, failures: [], expectedWarnings: [], applyResult: {}, target: {}, pluginResults: {} },
      wait() {},
      activateFixture: async () => ({ ok: true }),
      verifySidebarStatus: async () => ({ ok: true }),
      verifyComposer: async () => ({ ok: true }),
      verifyReview: async () => ({ ok: false, repoHeaderVisible: false }),
      waitReviewFixture: async () => ({
        ok: true,
        renderedNestedDiffKeys: ["repos/alpha-module", "repos/beta-module"],
        nestedRenderedDiffCount: 2,
        loadingPlaceholderCount: 0,
        failureMessageCount: 0,
      }),
      verifyCommand: async () => ({ ok: true }),
    });

    assert.equal(contract.ok, true);
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
      review: { tabVisible: true, repoHeaderVisible: true, diffCardCount: 2, loadingPlaceholderCount: 0, rawDiffFallbackCount: 0 },
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
      verifySidebarStatus: async () => ({ ok: true }),
      verifyComposer: async () => ({ ok: true }),
      verifyReview: async () => ({ ok: true }),
      waitReviewFixture: async () => ({ ok: true, plusTomlVisible: true, subprojectCommitCount: 2, loadingPlaceholderCount: 0 }),
      verifyCommand: async () => ({ ok: true }),
      dismissDialogs: async () => ({ present: false, dismissed: false }),
    });

    assert.equal(contract.ok, true);
    assert.equal(contract.settings.generalVisible, true);
    assert.ok(settingsCaptureEvaluation >= 6);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("visual contract waits for fixture diff text immediately before capturing Review", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-plus-contract-review-content-"));
  try {
    const events = [];
    const png = Buffer.from("png").toString("base64");
    const readback = {
      url: "app://-/index.html",
      title: "Codex Plus",
      shell: { startupLoaderVisible: false, bodyTextSample: "Pinned Harness Runs Projects" },
      sidebar: { pinnedVisible: true, harnessRunsVisible: true, projectsVisible: true, threadRows: 3, projectRows: 2, blurred: false },
      review: { tabVisible: true, repoHeaderVisible: true, diffCardCount: 7, loadingPlaceholderCount: 0, rawDiffFallbackCount: 0 },
      commandPalette: { sidebarBlurred: true, visible: true, toggleItemVisible: true },
      settings: { generalVisible: true, backToAppVisible: true, blank: false },
    };
    const cdp = {
      async send(method) {
        if (method === "Page.captureScreenshot") {
          events.push("capture");
          return { data: png };
        }
        return {};
      },
      async evaluate() {
        return readback;
      },
    };

    const contract = await captureVisualContract(cdp, {
      artifactDir: tmpDir,
      result: { ok: true, failures: [], expectedWarnings: [], applyResult: {}, target: {}, pluginResults: {} },
      wait() {},
      activateFixture: async () => ({ ok: true }),
      verifySidebarStatus: async () => ({ ok: true }),
      verifyComposer: async () => ({ ok: true }),
      verifyReview: async () => {
        events.push("verify");
        return { ok: true };
      },
      waitReviewFixture: async () => {
        events.push("fixture-text");
        return { ok: true, plusTomlVisible: true, subprojectCommitCount: 2, loadingPlaceholderCount: 0 };
      },
      verifyCommand: async () => ({ ok: true }),
      includeSettings: false,
    });

    assert.equal(contract.ok, true);
    const reviewVerification = events.indexOf("verify");
    assert.deepEqual(events.slice(reviewVerification, reviewVerification + 3), ["verify", "fixture-text", "capture"]);
    assert.deepEqual(contract.review.fixtureDiffText, {
      ok: true,
      plusTomlVisible: true,
      subprojectCommitCount: 2,
      loadingPlaceholderCount: 0,
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
