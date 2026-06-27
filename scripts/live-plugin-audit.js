#!/usr/bin/env node
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const {
  DEFAULT_DEV_HOME,
  DEFAULT_ELECTRON_USER_DATA,
  launchDevApp,
  syncDevHome,
} = require("../src/core/dev-mode");
const { patchCodexApp } = require("../src/core/patch-engine");
const { patchSets } = require("../src/patches");

const DEFAULT_SOURCE = "/Applications/Codex.app";
const DEFAULT_TARGET = path.resolve("work/Codex Plus.app");
const DEFAULT_PORT = 9234;

function expandPath(input) {
  if (input === "~") return os.homedir();
  if (input.startsWith("~/")) return path.join(os.homedir(), input.slice(2));
  return input;
}

function parseArgs(argv) {
  const args = {
    source: DEFAULT_SOURCE,
    target: DEFAULT_TARGET,
    sourceHome: path.join(os.homedir(), ".codex"),
    devHome: DEFAULT_DEV_HOME,
    electronUserDataPath: DEFAULT_ELECTRON_USER_DATA,
    remoteDebuggingPort: DEFAULT_PORT,
    apply: true,
    launch: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`Missing value for ${arg}`);
      return argv[index];
    };
    if (arg === "--source") args.source = path.resolve(expandPath(next()));
    else if (arg === "--target") args.target = path.resolve(expandPath(next()));
    else if (arg === "--source-home") args.sourceHome = path.resolve(expandPath(next()));
    else if (arg === "--dev-home") args.devHome = path.resolve(expandPath(next()));
    else if (arg === "--electron-user-data") args.electronUserDataPath = path.resolve(expandPath(next()));
    else if (arg === "--remote-debugging-port" || arg === "--port") args.remoteDebuggingPort = Number(next());
    else if (arg === "--no-apply") args.apply = false;
    else if (arg === "--no-launch") args.launch = false;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function portIsFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function findFreePort(start) {
  for (let port = start; port < start + 100; port += 1) {
    if (await portIsFree(port)) return port;
  }
  throw new Error(`Could not find a free remote debugging port starting at ${start}`);
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`${url} returned ${response.statusCode}: ${text}`));
          return;
        }
        try {
          resolve(JSON.parse(text));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("error", reject);
    request.setTimeout(1000, () => request.destroy(new Error(`${url} timed out`)));
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRendererTarget(port, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const targets = await getJson(`http://127.0.0.1:${port}/json/list`);
      const target = targets.find((entry) => entry.url === "app://-/index.html");
      if (target) return target;
    } catch (error) {
      lastError = error;
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for app://-/index.html on port ${port}${lastError ? `: ${lastError.message}` : ""}`);
}

class CdpSession {
  constructor(webSocketDebuggerUrl) {
    if (typeof WebSocket !== "function") {
      throw new Error("This audit requires a Node.js runtime with global WebSocket support");
    }
    this.nextId = 1;
    this.pending = new Map();
    this.socket = new WebSocket(webSocketDebuggerUrl);
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
      this.socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (!message.id) return;
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
        else pending.resolve(message.result);
      });
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  async evaluate(expression, { awaitPromise = true } = {}) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      const details = result.exceptionDetails;
      throw new Error(details.exception?.description || details.text || "Runtime.evaluate failed");
    }
    return result.result?.value;
  }

  async close() {
    try {
      this.socket.close();
    } catch {
      // Nothing useful to do while finishing JSON output.
    }
  }
}

async function waitForLiveRuntime(cdp, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = null;
  while (Date.now() < deadline) {
    lastStatus = await cdp.evaluate(`(() => {
      const plugins = window.CodexPlus?.plugins;
      const hasList = typeof plugins?.list === "function";
      return {
        readyState: document.readyState,
        hasCodexPlus: Boolean(window.CodexPlus),
        hasPluginList: hasList,
        registered: hasList ? plugins.list().length : null,
        started: window.__CodexPlusRuntime?.core?.startedPlugins?.size ?? null,
      };
    })()`);
    if (lastStatus.hasPluginList && lastStatus.registered >= 10 && lastStatus.started >= 10) return lastStatus;
    if (lastStatus.readyState === "complete" && lastStatus.hasCodexPlus && !lastStatus.hasPluginList) return lastStatus;
    await delay(250);
  }
  throw new Error(`Timed out waiting for Codex Plus runtime plugins: ${JSON.stringify(lastStatus)}`);
}

function pluginAuditExpression() {
  return `(${async function runPluginAudit() {
    const requiredPlugins = [
      "aboutMetadata",
      "nestedRepositories",
      "diagnosticErrors",
      "userBubbleColors",
      "projectColors",
      "projectPathHeader",
      "sidebarNameBlur",
      "devTools",
      "projectSelectorShortcut",
      "mermaidFullscreen",
    ];
    const pluginResults = {};
    const failures = [];
    const add = (id, ok, details = {}) => {
      pluginResults[id] = { ok, ...details };
      if (!ok) failures.push({ plugin: id, message: details.message || "probe failed", details });
    };
    const fail = (id, error, details = {}) => add(id, false, { message: error?.message || String(error), ...details });
    const pass = (id, details = {}) => add(id, true, details);
    const pluginIds = () => {
      if (typeof window.CodexPlus?.plugins?.list !== "function") {
        throw new Error("CodexPlus.plugins.list is not available");
      }
      return window.CodexPlus.plugins.list().map((plugin) => plugin.id);
    };
    const started = () => Array.from(window.__CodexPlusRuntime?.core?.startedPlugins || []);
    const common = (id) => ({
      registered: pluginIds().includes(id),
      started: started().includes(id),
    });
    const checkCommon = (id) => {
      const details = common(id);
      if (!details.registered || !details.started) throw new Error(`${id} is not registered and started`);
      return details;
    };
    const jsx = (type, props, key) => ({ type, props: props || {}, key });
    const jsxs = jsx;
    const reviewDeps = {
      jsx,
      jsxs,
      Fragment: "fragment",
      createElement: (type, props, ...children) => ({ type, props: { ...(props || {}), children } }),
      React: {
        createElement: (type, props, ...children) => ({ type, props: { ...(props || {}), children } }),
        useState(initial) { return [typeof initial === "function" ? initial() : initial, () => {}]; },
        useMemo(fn) { return fn(); },
        useEffect() {},
      },
      useStore() { return { value: { routeKind: "local-thread", conversationId: "audit-conversation" } }; },
      useAtom(atom) { return atom?.auditValue; },
      routeAtom: { auditValue: { routeKind: "local-thread", conversationId: "audit-conversation" } },
      cwdAtom: { auditValue: "/tmp/codex-plus-audit" },
      hostIdAtom: { auditValue: "local" },
      hostConfigAtom: { auditValue: { id: "local", label: "Local" } },
      conversationIdAtom: { auditValue: "audit-conversation" },
      gitRequest: { request() { return Promise.resolve({ main: null, repositories: [] }); } },
      pathValue(value) { return value; },
      DefaultReview: "default-review",
      Button: "button",
      Tooltip: "tooltip",
      Icon: "icon",
      Dropdown: "dropdown",
      DropdownMenu: "dropdown-menu",
      BranchPickerDropdownContent: "branch-picker",
      ReviewToolbar: "review-toolbar",
      parseDiff() { return []; },
      DiffCard: "diff-card",
    };

    try {
      const details = checkCommon("aboutMetadata");
      const providerOutput = window.CodexPlus.ui.about.buildInfo.map((provider) => provider());
      const provenance = providerOutput.some((entry) =>
        entry?.lines?.includes("Codex Plus runtime plugin layer active") &&
        entry?.lines?.includes("Plugin: aboutMetadata"));
      if (!provenance) throw new Error("About build info lacks Codex Plus provenance");
      pass("aboutMetadata", { ...details, provenance });
    } catch (error) {
      fail("aboutMetadata", error);
    }

    try {
      const details = checkCommon("nestedRepositories");
      let nestedStateCalls = 0;
      const nestedReviewDeps = {
        ...reviewDeps,
        React: {
          ...reviewDeps.React,
          useState(initial) {
            nestedStateCalls += 1;
            if (nestedStateCalls === 1) {
              return [{
                main: { id: "main:/tmp/codex-plus-audit", kind: "main", path: ".", label: "Main", cwd: "/tmp/codex-plus-audit" },
                repositories: [{ id: "repo:pkg", kind: "nested", path: "pkg", label: "pkg", cwd: "/tmp/codex-plus-audit/pkg" }],
                warnings: [],
              }, () => {}];
            }
            return [typeof initial === "function" ? initial() : initial, () => {}];
          },
        },
      };
      const wrapped = window.CodexPlus.ui.review.renderBody({ defaultBody: "body", props: {}, deps: nestedReviewDeps });
      const hostModuleRegistered = window.__CodexPlusRuntime.core.hostModules.has("codex-plus:native:repository-targets");
      if (wrapped === "body") throw new Error("Review body was not wrapped");
      if (!hostModuleRegistered) throw new Error("Repository-target host module is not registered");
      pass("nestedRepositories", { ...details, hostModuleRegistered, reviewWrapped: true });
    } catch (error) {
      fail("nestedRepositories", error);
    }

    try {
      const details = checkCommon("diagnosticErrors");
      const rendered = window.CodexPlus.ui.errors.renderDetails({ jsx, error: new Error("boom") });
      const renderedDiagnostic = rendered?.type === "pre" && String(rendered?.props?.children || "").includes("boom");
      if (!renderedDiagnostic) throw new Error("Diagnostic error details did not render");
      pass("diagnosticErrors", { ...details, renderedDiagnostic });
    } catch (error) {
      fail("diagnosticErrors", error);
    }

    try {
      const details = checkCommon("userBubbleColors");
      const bubbleProps = window.CodexPlus.ui.message.userBubbleProps({});
      const composerProps = window.CodexPlus.ui.composer.surfaceProps({});
      const bubbleMarked = Object.prototype.hasOwnProperty.call(bubbleProps || {}, "data-codex-plus-user-bubble");
      const composerMarked = Object.prototype.hasOwnProperty.call(composerProps || {}, "data-codex-plus-user-entry");
      if (!bubbleMarked || !composerMarked) throw new Error("User bubble or composer marker is missing");
      pass("userBubbleColors", { ...details, bubbleMarked, composerMarked });
    } catch (error) {
      fail("userBubbleColors", error);
    }

    try {
      const details = checkCommon("projectColors");
      const sampleProject = {
        projectId: "hassio-dev",
        label: "hassio-dev",
        path: "/tmp/hassio-dev",
        repositoryData: { rootFolder: "hassio-dev" },
      };
      const projectProps = window.CodexPlus.ui.sidebar.projectRowProps({ project: sampleProject });
      const threadProps = window.CodexPlus.ui.sidebar.threadRowProps({ project: sampleProject });
      const bubbleProps = window.CodexPlus.ui.message.userBubbleProps({ project: sampleProject });
      const composerProps = window.CodexPlus.ui.composer.surfaceProps({ project: sampleProject });
      const accent = projectProps?.style?.["--codex-plus-project-accent"];
      const matchingProps = [threadProps, bubbleProps, composerProps].every((props) =>
        props?.style?.["--codex-plus-project-accent"] === accent);
      const liveRows = Array.from(document.querySelectorAll("[data-codex-plus-project-color]"));
      const liveAccents = liveRows.map((row) => getComputedStyle(row).getPropertyValue("--codex-plus-project-accent").trim()).filter(Boolean);
      if (!accent) throw new Error("Project accent was not computed");
      if (!matchingProps) throw new Error("Project, thread, bubble, and composer props do not share an accent");
      pass("projectColors", {
        ...details,
        accent,
        matchingProps,
        liveRows: liveRows.length,
        liveAccents: Array.from(new Set(liveAccents)).slice(0, 8),
      });
    } catch (error) {
      fail("projectColors", error);
    }

    try {
      const details = checkCommon("projectPathHeader");
      const plugin = window.CodexPlus.plugins.get("projectPathHeader");
      const accessory = plugin?.exports?.ProjectPathAccessory?.({ context: { cwd: "/tmp/example" }, jsx, jsxs });
      const missing = plugin?.exports?.ProjectPathAccessory?.({ context: {}, jsx, jsxs });
      if (accessory == null) throw new Error("Project path accessory was not rendered for cwd");
      if (missing != null) throw new Error("Project path accessory rendered without cwd");
      pass("projectPathHeader", { ...details, renderedForCwd: true, skippedMissingCwd: true });
    } catch (error) {
      fail("projectPathHeader", error);
    }

    try {
      const details = checkCommon("sidebarNameBlur");
      const metadata = window.CodexPlus.ui.commands.commandMetadata().some((command) => command.id === "codexPlusToggleSidebarNameBlur");
      if (!metadata) throw new Error("Sidebar blur command metadata is missing");
      document.documentElement.removeAttribute("data-codex-plus-sidebar-names-blurred");
      window.CodexPlus.commands.run("codexPlusToggleSidebarNameBlur");
      const toggled = document.documentElement.getAttribute("data-codex-plus-sidebar-names-blurred") === "true";
      const probe = document.createElement("span");
      probe.setAttribute("data-codex-plus-sidebar-name", "");
      probe.textContent = "probe";
      document.body.appendChild(probe);
      const filter = getComputedStyle(probe).filter;
      probe.remove();
      if (!toggled) throw new Error("Sidebar blur command did not toggle the root marker");
      if (!String(filter).includes("blur")) throw new Error("Sidebar blur computed style is not active");
      pass("sidebarNameBlur", { ...details, metadata, toggled, filter });
    } catch (error) {
      fail("sidebarNameBlur", error);
    }

    try {
      const details = checkCommon("devTools");
      const metadata = window.CodexPlus.ui.commands.commandMetadata().some((command) => command.id === "codexPlusOpenDevTools");
      if (!metadata) throw new Error("DevTools command metadata is missing");
      const result = await window.CodexPlus.commands.run("codexPlusOpenDevTools");
      if (!result?.ok) throw new Error(`DevTools command returned ${JSON.stringify(result)}`);
      pass("devTools", { ...details, metadata, result });
    } catch (error) {
      fail("devTools", error);
    }

    try {
      const details = checkCommon("projectSelectorShortcut");
      const projects = [
        { projectId: "codex-plus", label: "codex-plus", repositoryData: { rootFolder: "codex-plus" } },
        { projectId: "hassio-dev", label: "hassio-dev", repositoryData: { rootFolder: "hassio-dev" } },
        { projectId: "dotfiles", label: "dotfiles", repositoryData: { rootFolder: "dotfiles" } },
      ];
      const ranked = window.CodexPlus.ui.projectSelector.fuzzyFilter(projects, "hdev").map((project) => project.projectId);
      const highlight = window.CodexPlus.ui.projectSelector.fuzzyHighlight({ text: "hassio-dev", query: "hdev", jsx });
      const highlightCount = Array.isArray(highlight) ? highlight.filter((part) => part?.type === "strong").length : 0;
      const rankedProjects = window.CodexPlus.ui.projectSelector.fuzzyFilter(projects, "hdev");
      const selected = [];
      const events = [];
      window.CodexPlusHost.adapters.projectSelector.acceptFirst(
        { key: "Enter", preventDefault() { events.push("preventDefault"); }, stopPropagation() { events.push("stopPropagation"); } },
        rankedProjects,
        (projectId) => selected.push(projectId),
        "hdev",
      );
      if (ranked[0] !== "hassio-dev") throw new Error(`Fuzzy ranking returned ${ranked.join(", ")}`);
      if (highlightCount === 0) throw new Error("Fuzzy match highlight did not render");
      if (selected[0] !== "hassio-dev" || events.length !== 2) throw new Error("Enter-to-first-result adapter did not select first ranked result");
      pass("projectSelectorShortcut", { ...details, ranked, highlightCount, selected });
    } catch (error) {
      fail("projectSelectorShortcut", error);
    }

    try {
      const details = checkCommon("mermaidFullscreen");
      const diagramProps = window.CodexPlus.ui.mermaid.diagramProps({ code: "graph TD;A-->B" });
      const marker = Object.prototype.hasOwnProperty.call(diagramProps || {}, "data-codex-plus-mermaid-diagram");
      if (!marker) throw new Error("Mermaid diagram marker is missing");
      const container = document.createElement("div");
      container.setAttribute("data-codex-plus-mermaid-diagram", "");
      const source = document.createElement("pre");
      source.className = "sr-only";
      source.textContent = "graph TD;A-->B";
      container.appendChild(source);
      document.body.appendChild(container);
      window.CodexPlus.plugins.get("mermaidFullscreen")?.exports?.decorateAll?.(document);
      const buttonRendered = Boolean(container.querySelector(".codex-plus-mermaid-expand-button"));
      container.remove();
      if (!buttonRendered) throw new Error("Mermaid expand button did not render");
      const nativeResult = await window.CodexPlus.native.request("mermaid/openViewer", {
        html: "<!doctype html><meta charset='utf-8'><title>Codex Plus Mermaid Audit</title><div>ok</div>",
      });
      if (!nativeResult?.ok) throw new Error(`Mermaid native viewer returned ${JSON.stringify(nativeResult)}`);
      pass("mermaidFullscreen", { ...details, marker, buttonRendered, nativeResult });
    } catch (error) {
      fail("mermaidFullscreen", error);
    }

    for (const id of requiredPlugins) {
      if (!pluginResults[id]) fail(id, new Error("Probe did not run"));
    }
    return {
      ok: failures.length === 0,
      failures,
      pluginResults,
      registeredPlugins: typeof window.CodexPlus?.plugins?.list === "function" ? pluginIds() : null,
      startedPlugins: started(),
    };
  }}())`;
}

async function runAudit(args) {
  const port = await findFreePort(args.remoteDebuggingPort);
  let applyResult = null;
  let syncResult = null;
  let launchResult = null;
  if (args.apply) {
    applyResult = await patchCodexApp({
      sourceApp: args.source,
      targetApp: args.target,
      patchSets,
      progress: undefined,
    });
  }
  syncResult = syncDevHome({
    sourceHome: args.sourceHome,
    devHome: args.devHome,
  });
  if (args.launch) {
    launchResult = launchDevApp({
      targetApp: args.target,
      devHome: args.devHome,
      electronUserDataPath: args.electronUserDataPath,
      remoteDebuggingPort: port,
    });
  }
  const target = await waitForRendererTarget(port);
  const cdp = new CdpSession(target.webSocketDebuggerUrl);
  await cdp.connect();
  try {
    await cdp.send("Runtime.enable");
    const runtimeStatus = await waitForLiveRuntime(cdp);
    const live = await cdp.evaluate(pluginAuditExpression());
    return {
      ok: live.ok,
      failures: live.failures,
      pluginResults: live.pluginResults,
      target: {
        app: path.resolve(args.target),
        remoteDebuggingPort: port,
        url: target.url,
        webSocketDebuggerUrl: target.webSocketDebuggerUrl,
        pid: launchResult?.pid,
      },
      devHome: path.resolve(args.devHome),
      electronUserDataPath: path.resolve(args.electronUserDataPath),
      applyResult,
      syncResult: syncResult && {
        copied: syncResult.copied,
        scrubbedGlobalState: syncResult.scrubbedGlobalState,
        sqliteSnapshots: syncResult.sqliteSnapshots,
        worktrees: syncResult.worktrees,
      },
      launchResult: launchResult && {
        command: launchResult.command,
        args: launchResult.args,
        pid: launchResult.pid,
      },
      registeredPlugins: live.registeredPlugins,
      startedPlugins: live.startedPlugins,
      runtimeStatus,
    };
  } finally {
    await cdp.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  try {
    const result = await runAudit(args);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    const result = {
      ok: false,
      failures: [{ plugin: "audit", message: error.message }],
      pluginResults: {},
      target: {
        app: path.resolve(args.target),
        remoteDebuggingPort: args.remoteDebuggingPort,
      },
      devHome: path.resolve(args.devHome),
    };
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = 1;
  }
}

main();
