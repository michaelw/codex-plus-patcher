const childProcess = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const {
  DEFAULT_DEV_HOME,
  DEFAULT_ELECTRON_USER_DATA,
  launchDevApp,
  syncDevHome,
} = require("./dev-mode");
const {
  appExecutablePath,
  defaultAuditTargetForSource,
  detectSourceFamily,
  existingDefaultSource,
} = require("./app-identity");
const {
  buildAuditFixture,
  seedAuditFixtureBrowserState,
} = require("./audit-fixture");
const { patchCodexApp } = require("./patch-engine");
const { patchSets } = require("../patches");
const packageJson = require("../../package.json");

const DEFAULT_SOURCE = existingDefaultSource();
const DEFAULT_TARGET = defaultAuditTargetForSource(DEFAULT_SOURCE);
const DEFAULT_PORT = 9234;
const DEFAULT_APP_SHELL_TIMEOUT_MS = 90000;
const CHATGPT_APP_SHELL_TIMEOUT_MS = 180000;

function safeTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function defaultAuditArtifactDir({ cwd = process.cwd(), version = "unknown", now = new Date() } = {}) {
  return path.join(cwd, "work", "audit-plugins", `${safeTimestamp(now)}-${version}`);
}

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
    json: false,
    jsonl: false,
    keepOpen: false,
    manual: false,
    includeNativeOpenProbes: false,
    disabledRuntimePlugins: [],
    noProgress: false,
    visualContract: true,
    artifactDir: null,
    quiet: false,
    devInstanceId: "audit",
    useLiveSourceHome: false,
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
    else if (arg === "--source-home") {
      args.sourceHome = path.resolve(expandPath(next()));
      args.useLiveSourceHome = true;
    }
    else if (arg === "--dev-home") args.devHome = path.resolve(expandPath(next()));
    else if (arg === "--electron-user-data") args.electronUserDataPath = path.resolve(expandPath(next()));
    else if (arg === "--dev-instance-id") args.devInstanceId = next();
    else if (arg === "--remote-debugging-port" || arg === "--port") args.remoteDebuggingPort = Number(next());
    else if (arg === "--no-apply") args.apply = false;
    else if (arg === "--no-launch") args.launch = false;
    else if (arg === "--json" || arg === "--format=json") args.json = true;
    else if (arg === "--jsonl" || arg === "--format=jsonl") args.jsonl = true;
    else if (arg === "--artifact-dir") args.artifactDir = path.resolve(expandPath(next()));
    else if (arg === "--no-visual-contract") args.visualContract = false;
    else if (arg === "--quiet") args.quiet = true;
    else if (arg === "--no-progress") args.noProgress = true;
    else if (arg === "--keep-open") args.keepOpen = true;
    else if (arg === "--manual") {
      args.manual = true;
      args.keepOpen = true;
    }
    else if (arg === "--use-live-source-home") args.useLiveSourceHome = true;
    else if (arg === "--include-native-open-probes") args.includeNativeOpenProbes = true;
    else if (arg === "--disable-plugin") args.disabledRuntimePlugins.push(next());
    else if (arg === "--disable-plugins") args.disabledRuntimePlugins.push(...next().split(",").map((value) => value.trim()).filter(Boolean));
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function auditIdentity({ cwd = path.resolve(__dirname, "../.."), execFileSync = childProcess.execFileSync } = {}) {
  const identity = {
    packageName: packageJson.name,
    packageVersion: packageJson.version,
    gitSha: "unknown",
    gitDirty: null,
    gitAvailable: false,
  };
  try {
    identity.gitSha = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || "unknown";
    identity.gitAvailable = true;
    identity.gitDirty = execFileSync("git", ["status", "--porcelain"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim().length > 0;
  } catch {
    identity.gitSha = "unknown";
    identity.gitDirty = null;
    identity.gitAvailable = false;
  }
  return identity;
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

function auditAttachCommand(port) {
  return `codex-plus-patcher audit-plugins --no-apply --no-launch --keep-open --port ${port}`;
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

async function findRendererTargetOnPort(port) {
  try {
    const targets = await getJson(`http://127.0.0.1:${port}/json/list`);
    return targets.find((entry) => entry.url === "app://-/index.html") || null;
  } catch {
    return null;
  }
}

async function waitForMermaidViewerTarget(port, beforeIds = new Set(), timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const targets = await getJson(`http://127.0.0.1:${port}/json/list`);
      const target = targets.find((entry) =>
        !beforeIds.has(entry.id) &&
        entry.url?.startsWith("file://") &&
        entry.url.includes("codex-plus-mermaid-"));
      if (target) return target;
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for Mermaid viewer target on port ${port}${lastError ? `: ${lastError.message}` : ""}`);
}

async function verifyMermaidViewerRender(appCdp, port, { Session = CdpSession, timeoutMs = 15000 } = {}) {
  const beforeTargets = await getJson(`http://127.0.0.1:${port}/json/list`).catch(() => []);
  const beforeIds = new Set(beforeTargets.map((target) => target.id));
  await appCdp.evaluate(`(() => {
    const host = document.createElement("div");
    host.setAttribute("data-markdown-copy", "code-block");
    const pre = document.createElement("pre");
    pre.className = "sr-only";
    pre.textContent = "graph TD;A-->B";
    const diagram = document.createElement("div");
    diagram.setAttribute("data-codex-plus-mermaid-diagram", "");
    host.append(pre, diagram);
    document.body.appendChild(host);
    window.CodexPlus.plugins.get("mermaidFullscreen").exports.openViewer(diagram);
    setTimeout(() => host.remove(), 1000);
    return true;
  })()`);
  const viewerTarget = await waitForMermaidViewerTarget(port, beforeIds, timeoutMs);
  const viewer = new Session(viewerTarget.webSocketDebuggerUrl);
  try {
    await viewer.connect();
    await viewer.send("Runtime.enable");
    const deadline = Date.now() + timeoutMs;
    let status = null;
    while (Date.now() < deadline) {
      status = await viewer.evaluate(`(() => {
        const svg = document.querySelector("#stage svg");
        const status = document.getElementById("render-status")?.textContent || "";
        return {
          hasSvg: Boolean(svg && svg.outerHTML.length > 1000),
          status,
          statusHidden: document.getElementById("render-status")?.hidden ?? null,
          svgLength: svg?.outerHTML?.length || 0,
          bodyText: document.body?.innerText?.slice(0, 500) || "",
        };
      })()`);
      if (status.hasSvg && !/Mermaid render failed:/i.test(status.status)) {
        return {
          ok: true,
          url: viewerTarget.url,
          status: status.status,
          svgLength: status.svgLength,
        };
      }
      if (/Mermaid render failed:/i.test(status.status) || /Mermaid render failed:/i.test(status.bodyText)) break;
      await delay(250);
    }
    return {
      ok: false,
      url: viewerTarget.url,
      message: status?.status || "Mermaid viewer did not render an SVG",
      status,
    };
  } finally {
    try {
      await viewer.send("Page.close");
    } catch {
      // The viewer may already be closed.
    }
    await viewer.close();
  }
}

async function verifyProjectSelectorShortcutKey(cdp, { wait = delay, timeoutMs = 30000 } = {}) {
  const selectorSetup = async () => cdp.evaluate(`(() => {
    const visible = (element) => {
      const rect = element?.getBoundingClientRect?.();
      const style = element ? getComputedStyle(element) : null;
      return Boolean(rect?.width > 0 && rect?.height > 0 && style?.display !== "none" && style?.visibility !== "hidden");
    };
    const newTask = Array.from(document.querySelectorAll("button,[role='button'],a"))
      .find((element) => {
        const text = String(element.textContent || "").trim();
        return visible(element) && (text.startsWith("New task") || text.startsWith("New chat"));
      });
    const rect = newTask?.getBoundingClientRect?.();
    return {
      triggerCount: document.querySelectorAll("[data-codex-plus-project-selector-trigger]").length,
      newTask: rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null,
    };
  })()`);
  let setup = await selectorSetup();
  if (setup.triggerCount === 0 && setup.newTask) {
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", ...setup.newTask, button: "left", clickCount: 1 });
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...setup.newTask, button: "left", clickCount: 1 });
    const setupDeadline = Date.now() + Math.min(timeoutMs, 10000);
    while (Date.now() < setupDeadline) {
      setup = await selectorSetup();
      if (setup.triggerCount > 0) break;
      await wait(100);
    }
  }
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 53,
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 53,
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: ".",
    code: "Period",
    windowsVirtualKeyCode: 190,
    nativeVirtualKeyCode: 47,
    modifiers: 4,
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: ".",
    code: "Period",
    windowsVirtualKeyCode: 190,
    nativeVirtualKeyCode: 47,
    modifiers: 4,
  });

  const deadline = Date.now() + timeoutMs;
  let status = null;
  while (Date.now() < deadline) {
    status = await cdp.evaluate(`(() => {
      const searchInput = document.querySelector("input[placeholder='Search projects']");
      const menuCount = document.querySelectorAll("[data-radix-menu-content], [data-radix-popper-content-wrapper], [role='menu']").length;
      return {
        triggerCount: document.querySelectorAll("[data-codex-plus-project-selector-trigger]").length,
        menuCount,
        opened: Boolean(searchInput || menuCount > 0),
        activePlaceholder: document.activeElement?.getAttribute?.("placeholder") ?? "",
      };
    })()`);
    if (status.opened) {
      const fuzzyDomTimeoutMs = Math.max(3000, timeoutMs);
      const fuzzyDom = await cdp.evaluate(`new Promise((resolve) => {
        const visible = (element) => {
          if (!element) return false;
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        };
        const normalize = (value) => String(value || "").replace(/\\s+/g, " ").trim();
        const currentMenu = () => Array.from(document.querySelectorAll("[data-radix-menu-content], [data-radix-popper-content-wrapper], [role='menu']"))
          .find(visible) || document.body;
        const input = document.querySelector("input[placeholder='Search projects']");
        const collectLabels = () => {
          const menu = currentMenu();
          const labels = [];
          const seen = new Set();
          const selectable = Array.from(menu.querySelectorAll("[role='menuitem'], [role='option'], button, a")).filter(visible);
          const labelRoots = selectable.length > 0
            ? selectable
            : Array.from(menu.querySelectorAll("div, span")).filter(visible);
          for (const element of labelRoots) {
            for (const line of String(element.innerText || element.textContent || "").split(/\\n/)) {
              const label = normalize(line);
              if (
                label &&
                label.length <= 120 &&
                !seen.has(label) &&
                /[A-Za-z].*[A-Za-z].*[A-Za-z]/.test(label) &&
                !/^No projects found$/i.test(label) &&
                !/^Search projects$/i.test(label)
              ) {
                seen.add(label);
                labels.push(label);
              }
            }
          }
          return labels;
        };
        const queryFor = (label) => {
          const letters = Array.from(label.toLowerCase()).filter((char) => /[a-z]/.test(char));
          if (letters.length < 3) return "";
          const indexes = [0, Math.max(1, Math.floor((letters.length - 1) / 2)), letters.length - 1];
          return indexes.map((index) => letters[index]).join("");
        };
        const labels = collectLabels();
        const selectedLabel = labels.find((label) => queryFor(label).length >= 3) || "";
        const query = queryFor(selectedLabel);
        if (!input || !selectedLabel || !query) {
          const menu = currentMenu();
          resolve({
            codexVersion: window.CodexPlus?.config?.codexVersion || null,
            suitableProjectFound: false,
            queryLength: query.length,
            visibleResultCount: labels.length,
            selectedProjectStillVisible: false,
            noProjectsFoundVisible: Boolean(Array.from(menu.querySelectorAll("*")).find((element) => visible(element) && normalize(element.textContent) === "No projects found")),
            highlightCount: 0,
          });
          return;
        }
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(input, query);
        input.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, data: query, inputType: "insertText" }));
        const startedAt = Date.now();
        const timeoutMs = ${JSON.stringify(fuzzyDomTimeoutMs)};
        const finishWhenReady = () => {
          const menu = currentMenu();
          const resultLabels = collectLabels();
          const noProjectsFoundVisible = Boolean(Array.from(menu.querySelectorAll("*")).find((element) => visible(element) && normalize(element.textContent) === "No projects found"));
          const selectedProjectStillVisible = resultLabels.some((label) => label.includes(selectedLabel));
          const highlightCount = Array.from(menu.querySelectorAll("strong")).filter(visible).length;
          if (!selectedProjectStillVisible || highlightCount === 0) {
            if (Date.now() - startedAt < timeoutMs) {
              setTimeout(finishWhenReady, 100);
              return;
            }
          }
          resolve({
            codexVersion: window.CodexPlus?.config?.codexVersion || null,
            suitableProjectFound: true,
            queryLength: query.length,
            visibleResultCount: resultLabels.length,
            selectedProjectStillVisible,
            noProjectsFoundVisible,
            highlightCount,
          });
        };
        setTimeout(finishWhenReady, 100);
      })`);
      await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 53 });
      await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 53 });
      const versionParts = String(fuzzyDom?.codexVersion || "").split(".").map((part) => Number.parseInt(part, 10) || 0);
      const strictFuzzyVersion =
        versionParts[0] > 26 ||
        (versionParts[0] === 26 && (versionParts[1] > 623 || (versionParts[1] === 623 && versionParts[2] >= 70822)));
      const strictFuzzyOk = Boolean(
        fuzzyDom?.suitableProjectFound &&
        fuzzyDom.selectedProjectStillVisible &&
        !fuzzyDom.noProjectsFoundVisible &&
        fuzzyDom.highlightCount > 0
      );
      const fuzzyOk = strictFuzzyVersion ? strictFuzzyOk : Boolean(fuzzyDom?.suitableProjectFound);
      return {
        ok: fuzzyOk,
        ...setup,
        ...status,
        fuzzyDom,
        strictFuzzyVersion,
        message: fuzzyOk ? undefined : `Project selector fuzzy filtering did not preserve and highlight a visible project: ${JSON.stringify(fuzzyDom)}`,
      };
    }
    await wait(100);
  }
  return { ok: false, ...setup, ...status, message: `Cmd+. did not open the project selector: ${JSON.stringify(status)}` };
}

async function activateFixtureThread(cdp, { nested = false, wait = delay, timeoutMs = 10000 } = {}) {
  const selectionDeadline = Date.now() + timeoutMs;
  let target = null;
  while (!target && Date.now() < selectionDeadline) {
    const selection = await cdp.evaluate(`(() => {
    const visible = (element) => { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden"; };
    const row = Array.from(document.querySelectorAll("[data-app-action-sidebar-thread-row]")).filter(visible).find((element) => {
      const path = element.getAttribute("data-codex-plus-project-path") || "";
      const text = String(element.textContent || "");
      return path.includes("fixture-workspaces") && (${nested} ? text.includes("nested repos") : !text.includes("nested repos"));
    });
    if (row) {
      row.scrollIntoView({ block: "center" });
      const rect = row.getBoundingClientRect();
      return {
        kind: "thread",
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        path: row.getAttribute("data-codex-plus-project-path") || "",
        title: row.getAttribute("data-app-action-sidebar-thread-title") || String(row.textContent || "").trim(),
      };
    }
    const collapsedProject = Array.from(document.querySelectorAll("[data-app-action-sidebar-project-row][aria-expanded='false']")).filter(visible).find((element) => {
      const path = element.getAttribute("data-codex-plus-project-path") || "";
      return path.includes("fixture-workspaces");
    });
    if (collapsedProject) {
      collapsedProject.scrollIntoView({ block: "center" });
      const container = collapsedProject.closest("[role='listitem']") || collapsedProject.parentElement;
      const button = container?.querySelector("button[aria-label='Expand project']") || collapsedProject;
      const rect = button.getBoundingClientRect();
      return { kind: "expand", x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    return { kind: "wait" };
  })()`);
    if (selection?.kind === "thread") {
      target = selection;
      break;
    }
    if (selection?.kind === "expand") {
      await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: selection.x, y: selection.y, button: "left", clickCount: 1 });
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: selection.x, y: selection.y, button: "left", clickCount: 1 });
    }
    await wait(250);
  }
  if (!target) return { ok: false, message: "Fixture thread row was not visible" };
  const clickTarget = async () => {
    const point = await cdp.evaluate(`(() => {
      const row = Array.from(document.querySelectorAll("[data-app-action-sidebar-thread-row]"))
        .find((element) => element.getAttribute("data-app-action-sidebar-thread-title") === ${JSON.stringify(target.title)} &&
          (element.getAttribute("data-codex-plus-project-path") || "") === ${JSON.stringify(target.path)});
      if (!row) return null;
      row.scrollIntoView({ block: "center" });
      const visible = (element) => { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden"; };
      const labels = [row, ...row.querySelectorAll("*")]
        .filter((element) => visible(element) && String(element.textContent || "").trim() === ${JSON.stringify(target.title)})
        .sort((left, right) => {
          const a = left.getBoundingClientRect();
          const b = right.getBoundingClientRect();
          return a.width * a.height - b.width * b.height;
        });
      const rect = (labels[0] || row).getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`);
    if (!point) return false;
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
    return true;
  };
  const activateTargetWithKeyboard = async () => {
    const focused = await cdp.evaluate(`(() => {
      const row = Array.from(document.querySelectorAll("[data-app-action-sidebar-thread-row]"))
        .find((element) => element.getAttribute("data-app-action-sidebar-thread-title") === ${JSON.stringify(target.title)} &&
          (element.getAttribute("data-codex-plus-project-path") || "") === ${JSON.stringify(target.path)});
      if (!row) return false;
      row.scrollIntoView({ block: "center" });
      const labels = [row, ...row.querySelectorAll("*")]
        .filter((element) => String(element.textContent || "").trim() === ${JSON.stringify(target.title)});
      const label = labels[labels.length - 1] || row;
      const control = label.closest("button, a, [role='button'], [tabindex]") ||
        (row.matches("button, a, [role='button'], [tabindex]") ? row : null);
      if (!control) return false;
      control.focus();
      return document.activeElement === control;
    })()`);
    if (!focused) return false;
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    return true;
  };
  await clickTarget();
  const deadline = Date.now() + timeoutMs;
  let nextRetry = Date.now() + 1000;
  let retries = 0;
  let active = null;
  while (Date.now() < deadline) {
    active = await cdp.evaluate(`(() => {
      const visible = (element) => { const rect = element?.getBoundingClientRect?.(); const style = element ? getComputedStyle(element) : null; return Boolean(rect?.width > 0 && rect?.height > 0 && style?.display !== "none" && style?.visibility !== "hidden"); };
      const headers = Array.from(document.querySelectorAll("header")).filter(visible);
      const header = headers.find((element) => String(element.textContent || "").includes(${JSON.stringify(target.title)}));
      const chips = Array.from(document.querySelectorAll("[data-codex-plus-project-path-header]")).filter(visible);
      const chip = chips[0] || null;
      const activeContext = CodexPlusHost.adapters.context.active();
      const openButton = Array.from(document.querySelectorAll("header[data-app-shell-header-edge-scroll] button")).find((button) => visible(button) && String(button.textContent || "").trim().startsWith("Open in"));
      const chipRect = chip?.getBoundingClientRect?.();
      const openRect = openButton?.getBoundingClientRect?.();
      return {
        titleReady: Boolean(header),
        activeCwd: activeContext?.cwd || "",
        chipPath: chip?.getAttribute("title") || "",
        chipCount: chips.length,
        fallbackChipCount: chips.filter((element) => element.hasAttribute("data-codex-plus-project-path-header-fallback")).length,
        anchoredBeforeOpenIn: Boolean(chipRect && openRect && chipRect.right <= openRect.left && openRect.left - chipRect.right <= 24),
      };
    })()`);
    if (active?.titleReady && active.activeCwd && active.chipPath === active.activeCwd && active.chipCount === 1 && active.anchoredBeforeOpenIn) {
      await cdp.evaluate(`window.__CPX_AUDIT_FIXTURE_THREAD_ACTIVE__ = true`);
      return { ok: true, target, active };
    }
    if (Date.now() >= nextRetry && retries < 2) {
      if (retries === 0) await activateTargetWithKeyboard();
      else await clickTarget();
      retries += 1;
      nextRetry = Date.now() + 1000;
    }
    await wait(100);
  }
  return {
    ok: false,
    target,
    active,
    message: `Trusted fixture-thread activation did not update the native title and path header: ${JSON.stringify({ target, active })}`,
  };
}

async function verifySidebarBlurCommandPalette(cdp, { activate = true, beforeActivate = null, wait = delay, timeoutMs = 10000 } = {}) {
  await cdp.evaluate(`(() => {
    document.documentElement.removeAttribute("data-codex-plus-sidebar-names-blurred");
    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }));
  })()`);

  const waitForPalette = async (deadlineMs = 2000) => {
    const deadline = Date.now() + deadlineMs;
    let status = null;
    while (Date.now() < deadline) {
      status = await cdp.evaluate(`(() => {
        const visible = (element) => {
          if (!element) return false;
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        };
        const dialog = Array.from(document.querySelectorAll(".command-menu-dialog, [role='dialog'], [cmdk-root]")).find(visible);
        const input = Array.from(document.querySelectorAll("input, textarea, [contenteditable='true']"))
          .find((element) => visible(element) && (dialog?.contains(element) || /command|search|type/i.test([
            element.getAttribute("placeholder"),
            element.getAttribute("aria-label"),
            element.textContent,
          ].filter(Boolean).join(" "))));
        return {
          opened: Boolean(dialog || input),
          activeTag: document.activeElement?.tagName || "",
          activePlaceholder: document.activeElement?.getAttribute?.("placeholder") || "",
          inputPlaceholder: input?.getAttribute?.("placeholder") || "",
        };
      })()`);
      if (status?.opened) return status;
      await wait(100);
    }
    return status;
  };

  await cdp.evaluate(`window.postMessage({ type: "command-menu", query: "Toggle sidebar blur" }, "*")`);
  let opened = await waitForPalette();

  const shortcuts = [
    { key: "k", code: "KeyK", windowsVirtualKeyCode: 75, modifiers: 4 },
    { key: "P", code: "KeyP", windowsVirtualKeyCode: 80, modifiers: 12 },
  ];
  for (const shortcut of shortcuts) {
    if (opened?.opened) break;
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", ...shortcut });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...shortcut });
    opened = await waitForPalette();
  }
  if (!opened?.opened) {
    return { ok: false, ...opened, message: `Command palette did not open: ${JSON.stringify(opened)}` };
  }
  if (typeof cdp.send !== "function") {
    return { ok: false, ...opened, message: "Command palette input could not be driven with trusted text events" };
  }
  await cdp.send("Input.insertText", { text: "Toggle sidebar blur" });

  const selected = await cdp.evaluate(`new Promise((resolve) => {
    const visible = (element) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const normalize = (value) => String(value || "").replace(/\\s+/g, " ").trim();
    const startedAt = Date.now();
    const finish = () => {
      const item = Array.from(document.querySelectorAll("[cmdk-item], [role='option'], [role='menuitem'], button"))
        .find((element) => visible(element) && normalize(element.textContent).includes("Toggle sidebar blur"));
      if (!item) {
        if (Date.now() - startedAt < ${JSON.stringify(timeoutMs)}) {
          setTimeout(finish, 100);
          return;
        }
        resolve({ selected: false, message: "Toggle sidebar blur command was not visible in the command palette" });
        return;
      }
      const rect = item.getBoundingClientRect();
      resolve({
        selected: true,
        itemText: normalize(item.textContent),
        rect: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      });
    };
    setTimeout(finish, 100);
  })`);
  if (!selected?.selected) return { ok: false, ...opened, ...selected };
  if (beforeActivate) await beforeActivate();
  if (!activate) return { ok: true, ...opened, ...selected, paletteVisible: true };
  if (typeof cdp.send !== "function") {
    return { ok: false, ...opened, ...selected, message: "Command palette item could not be activated with trusted keyboard events" };
  }
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });

  const deadline = Date.now() + timeoutMs;
  let status = null;
  while (Date.now() < deadline) {
    status = await cdp.evaluate(`(() => {
      const root = document.documentElement;
      const row = Array.from(document.querySelectorAll("[data-app-action-sidebar-thread-row], [data-app-action-sidebar-project-row]"))
        .find((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        });
      return {
        rootBlurred: root.getAttribute("data-codex-plus-sidebar-names-blurred") === "true",
        rowFilter: row ? getComputedStyle(row).filter : null,
      };
    })()`);
    if (status.rootBlurred && String(status.rowFilter).includes("blur")) {
      return { ok: true, ...opened, ...selected, ...status };
    }
    await wait(100);
  }
  return {
    ok: false,
    ...opened,
    ...selected,
    ...status,
    message: `Selecting Toggle sidebar blur did not blur sidebar rows: ${JSON.stringify(status)}`,
  };
}

async function verifyReviewPanelRender(cdp, { timeoutMs = 8000, maxThreadCandidates = 12 } = {}) {
  const status = await cdp.evaluate(`new Promise((resolve) => {
    const visible = (element) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const normalize = (value) => String(value || "").replace(/\\s+/g, " ").trim();
    const versionAtLeast = (version, minimum) => {
      const left = String(version || "").split(".").map((part) => Number.parseInt(part, 10) || 0);
      const right = String(minimum || "").split(".").map((part) => Number.parseInt(part, 10) || 0);
      const length = Math.max(left.length, right.length);
      for (let index = 0; index < length; index += 1) {
        if ((left[index] || 0) > (right[index] || 0)) return true;
        if ((left[index] || 0) < (right[index] || 0)) return false;
      }
      return true;
    };
    const strictNestedBranchPreload = versionAtLeast(window.CodexPlus?.config?.codexVersion, "26.623.81905");
    const visibleElements = (selector) => Array.from(document.querySelectorAll(selector)).filter(visible);
    const exactVisibleText = (text) => visibleElements("button, [role='tab'], [role='button'], div, span, p")
      .some((element) => normalize(element.textContent) === text);
    const containsVisibleText = (text) => visibleElements("button, [role='tab'], [role='button'], div, span, p, h1, h2, h3")
      .some((element) => normalize(element.textContent).includes(text));
    const reviewControl = () => {
      const controls = visibleElements("button, [role='tab'], [role='button']");
      const review = controls.find((element) => {
        const text = normalize(element.textContent);
        const label = normalize(element.getAttribute("aria-label"));
        const rect = element.getBoundingClientRect();
        return (text === "Review" || label === "Review") && rect.left >= innerWidth / 2 && rect.top < 80;
      });
      if (review) return review;
      return controls.find((element) => {
        const text = normalize(element.textContent);
        const label = normalize(element.getAttribute("aria-label"));
        const rect = element.getBoundingClientRect();
        return (text === "Changes" || label === "Changes") && rect.left >= innerWidth * 0.6 && rect.top < 240;
      });
    };
    const reviewSelected = () => visibleElements("[role='tab'][aria-selected='true'], button[aria-selected='true'], [data-state='active']")
      .some((element) => normalize(element.textContent) === "Review");
    const nativeReviewSourceVisible = () => {
      const text = normalize(document.body.textContent).replace(/→/g, "->");
      return /HEAD\\s*(->)?\\s*main/.test(text) || text.includes("Unstaged") || (text.includes("Local") && text.includes("main"));
    };
    const unstagedReviewSourceSelected = () => visibleElements("button, [role='button']")
      .some((element) => {
        const rect = element.getBoundingClientRect();
        return !element.hasAttribute("data-codex-plus-repo-branch-picker") && rect.left >= innerWidth / 2 && rect.top < 120 && normalize(element.textContent).startsWith("Unstaged");
      });
    const clickNestedFixtureThread = () => {
      const row = visibleElements("[data-app-action-sidebar-thread-row]")
        .find((element) => normalize(element.textContent).includes("Fixture: nested repos before branch selection"));
      if (!row) return false;
      row.click();
      return true;
    };
    const nestedBranchPickers = () => visibleElements("[data-codex-plus-repo-branch-picker]")
      .filter((element) => ["nested", "submodule", "configured"].includes(element.getAttribute("data-codex-plus-repo-kind")));
    const nestedBranchPickerPopulated = () => nestedBranchPickers().some((picker) => {
      const branchCount = Number(picker.getAttribute("data-codex-plus-repo-branch-count") || "0");
      if (Number.isFinite(branchCount) && branchCount >= 3) return true;
      if (picker.tagName === "SELECT") {
        return Array.from(picker.options || []).some((option) => normalize(option.textContent) && normalize(option.textContent) !== "Unstaged" && normalize(option.textContent) !== "Loading...");
      }
      return false;
    });
    const nestedBranchPickerOptionCounts = () => nestedBranchPickers().map((picker) => Number(picker.getAttribute("data-codex-plus-repo-branch-count") || "0"));
    const nestedBranchPickerDetails = () => nestedBranchPickers().map((picker) => ({
      kind: picker.getAttribute("data-codex-plus-repo-kind") || "",
      path: picker.getAttribute("data-codex-plus-repo-path") || "",
      branchCount: Number(picker.getAttribute("data-codex-plus-repo-branch-count") || "0"),
      currentBranch: picker.getAttribute("data-codex-plus-repo-current-branch") || "",
      branchLoadState: picker.getAttribute("data-codex-plus-repo-branch-load-state") || "",
      branchLoadError: picker.getAttribute("data-codex-plus-repo-branch-load-error") || "",
    }));
    const rawNestedDiffFallbackCount = () => visibleElements("pre")
      .filter((element) => /diff --git/.test(element.textContent || ""))
      .length;
    const reviewDiffCardCount = () => visibleElements(".codex-review-diff-card").length;
    const snapshot = (extra = {}) => ({
      candidateCount: extra.candidateCount ?? 0,
      attemptedCandidates: extra.attemptedCandidates ?? 0,
      reviewControlFound: Boolean(extra.reviewControlFound),
      clickedReview: Boolean(extra.clickedReview),
      clickedNestedFixtureThread: Boolean(extra.clickedNestedFixtureThread),
      clickedNestedBranchPicker: Number(extra.clickedNestedBranchPicker || 0),
      boundaryEverVisible: Boolean(extra.boundaryEverVisible),
      requiredUnstagedFallback: Boolean(extra.requiredUnstagedFallback),
      selectedUnstagedFallback: Boolean(extra.selectedUnstagedFallback),
      selectedReview: reviewSelected(),
      boundaryVisible: containsVisibleText("Tab content couldn't render"),
      boundaryText: visibleElements("div, section, article")
        .map((element) => normalize(element.textContent))
        .filter((text) => text.includes("Tab content couldn't render"))
        .sort((left, right) => left.length - right.length)[0] || "",
      boundaryDiagnostics: visibleElements("pre, code")
        .map((element) => normalize(element.textContent))
        .filter(Boolean)
        .slice(0, 4),
      tryAgainVisible: exactVisibleText("Try again"),
      repoHeaderVisible: containsVisibleText("Codex Plus repositories"),
      mainVisible: containsVisibleText("Main"),
      nativeReviewSourceVisible: nativeReviewSourceVisible(),
      unstagedReviewSourceSelected: unstagedReviewSourceSelected(),
      reviewToolbarFailureVisible: containsVisibleText("Review toolbar failed to render"),
      nestedRepoVisible: containsVisibleText("alpha-module") || containsVisibleText("beta-module"),
      strictNestedBranchPreload,
      nestedBranchPickerCount: nestedBranchPickers().length,
      nestedBranchPickerPreloadBeforeOpen: Boolean(extra.nestedBranchPickerPreloadBeforeOpen),
      nestedBranchPickerPreloadComplete: nestedBranchPickers().length >= 2 && nestedBranchPickerOptionCounts().every((count) => count >= 3),
      nestedBranchPickerPopulated: nestedBranchPickerPopulated(),
      nestedBranchPickerOptionCounts: nestedBranchPickerOptionCounts(),
      nestedBranchPickerDetails: nestedBranchPickerDetails(),
      rawNestedDiffFallbackCount: rawNestedDiffFallbackCount(),
      reviewDiffCardCount: reviewDiffCardCount(),
      reviewTabCount: visibleElements("button, [role='tab'], [role='button']").filter((element) => normalize(element.textContent) === "Review").length,
    });
    const candidates = visibleElements("[data-app-action-sidebar-thread-row]")
      .filter((element) => normalize(element.textContent || element.getAttribute("aria-label")))
      .slice(0, ${Number(maxThreadCandidates) || 12});
    let index = 0;
    const deadline = Date.now() + ${Number(timeoutMs) || 8000};
    const step = () => {
      const clickedNestedFixtureThread = clickNestedFixtureThread();
      const control = reviewControl();
      if (control) {
	        control.click();
	        let clickedInnerReview = normalize(control.textContent) === "Review";
        let nestedBranchPickerPreloadBeforeOpen = false;
        let boundaryEverVisible = false;
	        let requiredUnstagedFallback = false;
	        let selectedUnstagedFallback = false;
	        const reviewDeadline = Date.now() + 15000;
	        const waitForReviewContent = () => {
          const inner = visibleElements("button, [role='tab'], [role='button']")
            .find((element) => normalize(element.textContent) === "Review" || normalize(element.getAttribute("aria-label")) === "Review");
          if (inner && !clickedInnerReview) {
            clickedInnerReview = true;
            inner.click();
          }
          boundaryEverVisible = boundaryEverVisible || containsVisibleText("Tab content couldn't render");
          if (containsVisibleText("Codex Plus repositories") && (containsVisibleText("alpha-module") || containsVisibleText("beta-module"))) {
            const countsBeforeOpen = nestedBranchPickerOptionCounts();
            nestedBranchPickerPreloadBeforeOpen = nestedBranchPickers().length >= 2 && countsBeforeOpen.every((count) => count >= 3);
          }
	          if (nativeReviewSourceVisible() && !unstagedReviewSourceSelected()) {
	            requiredUnstagedFallback = true;
	          }
	          const current = snapshot({
	            candidateCount: candidates.length,
	            attemptedCandidates: index,
	            reviewControlFound: true,
	            clickedReview: true,
            clickedNestedFixtureThread,
            boundaryEverVisible,
            nestedBranchPickerPreloadBeforeOpen,
	            requiredUnstagedFallback,
	            selectedUnstagedFallback,
	          });
          if ((
            current.repoHeaderVisible &&
            current.mainVisible &&
            current.nativeReviewSourceVisible &&
            current.nestedRepoVisible &&
            (!current.strictNestedBranchPreload || current.nestedBranchPickerPreloadBeforeOpen) &&
            current.nestedBranchPickerPreloadComplete &&
            current.nestedBranchPickerPopulated &&
            current.nestedBranchPickerCount >= 2 &&
            current.nestedBranchPickerOptionCounts.every((count) => count >= 3) &&
            current.rawNestedDiffFallbackCount === 0 &&
            current.reviewDiffCardCount >= 2
          ) || Date.now() >= reviewDeadline) {
            resolve(current);
            return;
          }
          setTimeout(waitForReviewContent, 350);
        };
        setTimeout(waitForReviewContent, 350);
        return;
      }
      if (index >= candidates.length || Date.now() >= deadline) {
        resolve(snapshot({
          candidateCount: candidates.length,
          attemptedCandidates: index,
          reviewControlFound: false,
          clickedReview: false,
        }));
        return;
      }
      candidates[index].click();
      index += 1;
      setTimeout(step, 450);
    };
    step();
  })`);
  let finalStatus = status;
  if (!status?.unstagedReviewSourceSelected && typeof cdp.send === "function") {
    const clickCenter = async (rect) => {
      if (!rect) return false;
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: rect.x, y: rect.y, button: "none" });
      await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
      return true;
    };
    const branchRect = await cdp.evaluate(`(() => {
      const visible = (element) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };
      const normalize = (value) => String(value || "").replace(/\\s+/g, " ").trim();
      const reviewPanel = Array.from(document.querySelectorAll("[role='tabpanel'][aria-label='Review']")).find(visible);
      const branch = Array.from((reviewPanel || document).querySelectorAll("button, [role='button']"))
        .filter(visible)
        .find((element) => normalize(element.textContent) === "Branch");
      if (!branch) return null;
      const rect = branch.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    })()`);
    const clickedBranch = await clickCenter(branchRect);
    if (clickedBranch) await new Promise((resolve) => setTimeout(resolve, 500));
    const unstagedRect = await cdp.evaluate(`(() => {
      const visible = (element) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };
      const normalize = (value) => String(value || "").replace(/\\s+/g, " ").trim();
      const branch = Array.from(document.querySelectorAll("button, [role='button']"))
        .filter(visible)
        .find((element) => normalize(element.textContent) === "Branch" && element.getBoundingClientRect().left >= innerWidth / 2 && element.getBoundingClientRect().top < 120);
      const menu = branch ? document.getElementById(branch.getAttribute("aria-controls")) : null;
      const item = Array.from(menu?.querySelectorAll("[role='menuitem'], [data-radix-collection-item]") || [])
        .filter(visible)
        .find((element) => normalize(element.textContent) === "Unstaged");
      if (!item) return null;
      const rect = item.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    })()`);
    const selectedUnstaged = await clickCenter(unstagedRect);
    if (selectedUnstaged) await new Promise((resolve) => setTimeout(resolve, 3000));
    await cdp.evaluate(`(() => {
      const pickers = Array.from(document.querySelectorAll("[data-codex-plus-repo-branch-picker]"));
      for (const picker of pickers) {
        picker.scrollIntoView?.({ block: "center" });
        picker.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
        picker.focus?.();
        picker.dispatchEvent(new FocusEvent("focus", { bubbles: false, cancelable: false }));
        picker.dispatchEvent(new Event("focusin", { bubbles: true, cancelable: false }));
      }
      return pickers.length;
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    finalStatus = await cdp.evaluate(`(() => {
      const visible = (element) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };
      const normalize = (value) => String(value || "").replace(/\\s+/g, " ").trim();
      const visibleElements = (selector) => Array.from(document.querySelectorAll(selector)).filter(visible);
      const containsVisibleText = (text) => visibleElements("button, [role='tab'], [role='button'], div, span, p, h1, h2, h3")
        .some((element) => normalize(element.textContent).includes(text));
      const exactVisibleText = (text) => visibleElements("button, [role='tab'], [role='button'], div, span, p")
        .some((element) => normalize(element.textContent) === text);
      const nestedBranchPickers = () => visibleElements("[data-codex-plus-repo-branch-picker]")
        .filter((element) => ["nested", "submodule", "configured"].includes(element.getAttribute("data-codex-plus-repo-kind")));
      const nestedBranchPickerPopulated = () => nestedBranchPickers().some((picker) => {
        const branchCount = Number(picker.getAttribute("data-codex-plus-repo-branch-count") || "0");
        if (Number.isFinite(branchCount) && branchCount >= 3) return true;
        if (picker.tagName === "SELECT") {
          return Array.from(picker.options || []).some((option) => normalize(option.textContent) && normalize(option.textContent) !== "Unstaged" && normalize(option.textContent) !== "Loading...");
        }
        return false;
      });
      const nestedBranchPickerOptionCounts = () => nestedBranchPickers().map((picker) => Number(picker.getAttribute("data-codex-plus-repo-branch-count") || "0"));
      const nestedBranchPickerDetails = () => nestedBranchPickers().map((picker) => ({
        kind: picker.getAttribute("data-codex-plus-repo-kind") || "",
        path: picker.getAttribute("data-codex-plus-repo-path") || "",
        branchCount: Number(picker.getAttribute("data-codex-plus-repo-branch-count") || "0"),
        currentBranch: picker.getAttribute("data-codex-plus-repo-current-branch") || "",
        branchLoadState: picker.getAttribute("data-codex-plus-repo-branch-load-state") || "",
        branchLoadError: picker.getAttribute("data-codex-plus-repo-branch-load-error") || "",
      }));
      const rawNestedDiffFallbackCount = () => visibleElements("pre")
        .filter((element) => /diff --git/.test(element.textContent || ""))
        .length;
      const reviewDiffCardCount = () => visibleElements(".codex-review-diff-card").length;
      const unstagedReviewSourceSelected = () => visibleElements("button, [role='button']")
        .some((element) => {
          const rect = element.getBoundingClientRect();
          return !element.hasAttribute("data-codex-plus-repo-branch-picker") && rect.left >= innerWidth / 2 && rect.top < 120 && normalize(element.textContent).startsWith("Unstaged");
        });
      return {
        ...${JSON.stringify(status)},
        cdpUnstagedFallback: true,
        clickedCdpBranchFallback: ${clickedBranch ? "true" : "false"},
        selectedUnstagedFallback: ${selectedUnstaged ? "true" : "false"},
        selectedReview: visibleElements("[role='tab'][aria-selected='true'], button[aria-selected='true'], [data-state='active']")
          .some((element) => normalize(element.textContent) === "Review"),
        boundaryVisible: containsVisibleText("Tab content couldn't render"),
        tryAgainVisible: exactVisibleText("Try again"),
        repoHeaderVisible: containsVisibleText("Codex Plus repositories"),
        mainVisible: containsVisibleText("Main"),
        nativeReviewSourceVisible: normalize(document.body.textContent).includes("Unstaged") || (normalize(document.body.textContent).includes("Local") && normalize(document.body.textContent).includes("main")),
        unstagedReviewSourceSelected: unstagedReviewSourceSelected(),
        reviewToolbarFailureVisible: containsVisibleText("Review toolbar failed to render"),
        nestedRepoVisible: containsVisibleText("alpha-module") || containsVisibleText("beta-module"),
        strictNestedBranchPreload: ${JSON.stringify(status?.strictNestedBranchPreload || false)},
        nestedBranchPickerCount: nestedBranchPickers().length,
        nestedBranchPickerPreloadComplete: nestedBranchPickers().length >= 2 && nestedBranchPickerOptionCounts().every((count) => count >= 3),
        nestedBranchPickerPopulated: nestedBranchPickerPopulated(),
        nestedBranchPickerOptionCounts: nestedBranchPickerOptionCounts(),
        nestedBranchPickerDetails: nestedBranchPickerDetails(),
        boundaryEverVisible: ${JSON.stringify(status?.boundaryEverVisible || false)} || containsVisibleText("Tab content couldn't render"),
        rawNestedDiffFallbackCount: rawNestedDiffFallbackCount(),
        reviewDiffCardCount: reviewDiffCardCount(),
      };
    })()`);
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
  finalStatus = await cdp.evaluate(`(() => {
    const visible = (element) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const normalize = (value) => String(value || "").replace(/\\s+/g, " ").trim();
    const visibleElements = (selector) => Array.from(document.querySelectorAll(selector)).filter(visible);
    const containsVisibleText = (text) => visibleElements("button, [role='tab'], [role='button'], div, span, p, h1, h2, h3")
      .some((element) => normalize(element.textContent).includes(text));
    const exactVisibleText = (text) => visibleElements("button, [role='tab'], [role='button'], div, span, p")
      .some((element) => normalize(element.textContent) === text);
    const nestedBranchPickers = () => visibleElements("[data-codex-plus-repo-branch-picker]")
      .filter((element) => ["nested", "submodule", "configured"].includes(element.getAttribute("data-codex-plus-repo-kind")));
    const nestedBranchPickerOptionCounts = () => nestedBranchPickers().map((picker) => Number(picker.getAttribute("data-codex-plus-repo-branch-count") || "0"));
    const nestedBranchPickerDetails = () => nestedBranchPickers().map((picker) => ({
      kind: picker.getAttribute("data-codex-plus-repo-kind") || "",
      path: picker.getAttribute("data-codex-plus-repo-path") || "",
      branchCount: Number(picker.getAttribute("data-codex-plus-repo-branch-count") || "0"),
      currentBranch: picker.getAttribute("data-codex-plus-repo-current-branch") || "",
      branchLoadState: picker.getAttribute("data-codex-plus-repo-branch-load-state") || "",
      branchLoadError: picker.getAttribute("data-codex-plus-repo-branch-load-error") || "",
    }));
    const unstagedReviewSourceSelected = () => visibleElements("button, [role='button']")
      .some((element) => {
        const rect = element.getBoundingClientRect();
        return !element.hasAttribute("data-codex-plus-repo-branch-picker") && rect.left >= innerWidth / 2 && rect.top < 120 && normalize(element.textContent).startsWith("Unstaged");
      });
    return {
      ...${JSON.stringify(finalStatus)},
      delayedReviewStabilityCheck: true,
      boundaryVisible: containsVisibleText("Tab content couldn't render"),
      boundaryEverVisible: ${JSON.stringify(finalStatus?.boundaryEverVisible || false)} || containsVisibleText("Tab content couldn't render"),
      tryAgainVisible: exactVisibleText("Try again"),
      unstagedReviewSourceSelected: unstagedReviewSourceSelected(),
      reviewToolbarFailureVisible: containsVisibleText("Review toolbar failed to render"),
      rawNestedDiffFallbackCount: visibleElements("pre").filter((element) => /diff --git/.test(element.textContent || "")).length,
      reviewDiffCardCount: visibleElements(".codex-review-diff-card").length,
      repoPatchGroupCount: visibleElements("[data-codex-plus-repo-patch-group]").length,
      repoPatchGroupTexts: visibleElements("[data-codex-plus-repo-patch-group]").map((element) => normalize(element.textContent)).slice(0, 4),
      nestedBranchPickerCount: nestedBranchPickers().length,
      strictNestedBranchPreload: ${JSON.stringify(finalStatus?.strictNestedBranchPreload || false)},
      nestedBranchPickerPreloadComplete: nestedBranchPickers().length >= 2 && nestedBranchPickerOptionCounts().every((count) => count >= 3),
      nestedBranchPickerOptionCounts: nestedBranchPickerOptionCounts(),
      nestedBranchPickerDetails: nestedBranchPickerDetails(),
    };
  })()`);
  const disclosureStatus = await cdp.evaluate(`new Promise((resolve) => {
    const visible = (element) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const cards = Array.from(document.querySelectorAll("[data-codex-plus-repo-patch-group] .codex-review-diff-card")).filter(visible);
    const card = cards[0];
    const toggle = card && Array.from(card.querySelectorAll("button, [role='button']"))
      .find((element) => String(element.getAttribute("aria-label") || "").includes("Toggle file diff"));
    if (!card || !toggle) {
      resolve({ nestedDiffCardCount: cards.length, nestedDiffDisclosureExpanded: false, nestedDiffDisclosureCollapsed: false });
      return;
    }
    const initialHeight = card.getBoundingClientRect().height;
    const initialExpanded = toggle.getAttribute("data-app-action-review-file-expanded") === "true";
    toggle.click();
    setTimeout(() => {
      const toggledHeight = card.getBoundingClientRect().height;
      const toggledExpanded = toggle.getAttribute("data-app-action-review-file-expanded") === "true";
      toggle.click();
      setTimeout(() => {
        const restoredHeight = card.getBoundingClientRect().height;
        const restoredExpanded = toggle.getAttribute("data-app-action-review-file-expanded") === "true";
        const cycled = toggledExpanded !== initialExpanded && restoredExpanded === initialExpanded;
        const expandedHeight = Math.max(initialHeight, toggledHeight);
        const collapsedHeight = Math.min(initialHeight, toggledHeight);
        resolve({
          nestedDiffCardCount: cards.length,
          nestedDiffDisclosureExpanded: cycled && expandedHeight > collapsedHeight + 20,
          nestedDiffDisclosureCollapsed: cycled && expandedHeight > collapsedHeight + 20 && Math.abs(restoredHeight - initialHeight) < 5,
        });
      }, 350);
    }, 350);
  })`);
  finalStatus = { ...finalStatus, ...disclosureStatus };
  const ok = Boolean(
    finalStatus?.reviewControlFound &&
    finalStatus.clickedReview &&
    finalStatus.selectedReview &&
    !finalStatus.boundaryVisible &&
    !finalStatus.boundaryEverVisible &&
    !finalStatus.tryAgainVisible &&
    finalStatus.repoHeaderVisible &&
    finalStatus.mainVisible &&
    finalStatus.nativeReviewSourceVisible &&
    finalStatus.unstagedReviewSourceSelected &&
    !finalStatus.reviewToolbarFailureVisible &&
    finalStatus.nestedRepoVisible &&
    (!finalStatus.strictNestedBranchPreload || finalStatus.nestedBranchPickerPreloadBeforeOpen) &&
    finalStatus.nestedBranchPickerPreloadComplete &&
    finalStatus.nestedBranchPickerPopulated &&
    finalStatus.nestedBranchPickerCount >= 2 &&
    finalStatus.nestedBranchPickerOptionCounts?.every((count) => count >= 3) &&
    finalStatus.rawNestedDiffFallbackCount === 0 &&
    finalStatus.reviewDiffCardCount >= 3 &&
    finalStatus.nestedDiffCardCount >= 2 &&
    finalStatus.nestedDiffDisclosureExpanded &&
    finalStatus.nestedDiffDisclosureCollapsed,
  );
  return {
    ok,
    ...finalStatus,
    message: ok
      ? undefined
      : status?.reviewControlFound
        ? "Review panel did not render nested repository content"
        : "No review-capable thread was found",
  };
}

function listRunningAuditApps({
  targetApp = DEFAULT_TARGET,
  devHome = null,
  electronUserDataPath = DEFAULT_ELECTRON_USER_DATA,
  includeTargetProcesses = false,
  execFileSync = childProcess.execFileSync,
} = {}) {
  let targetBinary;
  try {
    targetBinary = appExecutablePath(targetApp);
  } catch {
    targetBinary = path.join(path.resolve(targetApp), "Contents/MacOS/Codex");
  }
  const userDataArg = `--user-data-dir=${path.resolve(electronUserDataPath)}`;
  const targetPrefix = `${path.resolve(targetApp)}${path.sep}`;
  const devHomePrefix = devHome == null ? null : `${path.resolve(devHome)}${path.sep}`;
  let text;
  try {
    text = execFileSync("ps", ["-axo", "pid=,command="], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return [];
  }
  return text
    .split("\n")
    .map((line) => {
      const match = line.match(/^\s*(\d+)\s+(.*)$/);
      if (!match) return null;
      const command = match[2];
      const targetProcess = (command.startsWith(targetBinary) || command.startsWith(targetPrefix)) &&
        (includeTargetProcesses || command.includes(userDataArg));
      const devHomeProcess = devHomePrefix != null && command.startsWith(devHomePrefix);
      if (!targetProcess && !devHomeProcess) return null;
      const portMatch = command.match(/--remote-debugging-port=(\d+)/);
      return {
        pid: Number(match[1]),
        command,
        remoteDebuggingPort: portMatch ? Number(portMatch[1]) : null,
      };
    })
    .filter(Boolean);
}

class AuditPreflightError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "AuditPreflightError";
    this.details = details;
  }
}

async function auditPreflight(args, {
  findPort = findFreePort,
  findRendererTarget = findRendererTargetOnPort,
  listRunningApps = listRunningAuditApps,
} = {}) {
  const requestedPort = args.remoteDebuggingPort;
  const existingTarget = await findRendererTarget(requestedPort);
  const runningApps = listRunningApps({
    targetApp: args.target,
    electronUserDataPath: args.electronUserDataPath,
  });
  const livePorts = Array.from(new Set(runningApps
    .map((app) => app.remoteDebuggingPort)
    .filter((port) => port != null)));
  const livePort = existingTarget ? requestedPort : livePorts[0] ?? null;
  const existingApp = runningApps[0] || null;
  const suggestedCommand = livePort == null ? null : auditAttachCommand(livePort);

  if (!args.launch) {
    return {
      port: requestedPort,
      launch: false,
      reuseExisting: Boolean(existingTarget || existingApp),
      existingApp,
      existingTarget,
      livePort,
      suggestedCommand,
    };
  }

  if (existingTarget || existingApp) {
    if (!args.apply) {
      if (livePort == null) {
        throw new AuditPreflightError(
          "Codex Plus is already running for this audit target, but no remote debugging port was detected",
          { existingApp, livePort, suggestedCommand },
        );
      }
      return {
        port: livePort,
        launch: false,
        reuseExisting: true,
        existingApp,
        existingTarget,
        livePort,
        suggestedCommand,
      };
    }
    throw new AuditPreflightError(
      `Codex Plus audit app is already running${livePort == null ? "" : ` on port ${livePort}`}; close it before applying patches, or rerun ${suggestedCommand}`,
      { existingApp, livePort, suggestedCommand },
    );
  }

  return {
    port: await findPort(requestedPort),
    launch: true,
    reuseExisting: false,
    existingApp: null,
    existingTarget: null,
    livePort: null,
    suggestedCommand: null,
  };
}

class CdpSession {
  constructor(webSocketDebuggerUrl) {
    if (typeof WebSocket !== "function") {
      throw new Error("This audit requires a Node.js runtime with global WebSocket support");
    }
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.socket = new WebSocket(webSocketDebuggerUrl);
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
      this.socket.addEventListener("close", () => {
        const error = new Error("DevTools connection closed");
        for (const pending of this.pending.values()) pending.reject(error);
        this.pending.clear();
      });
      this.socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (!message.id) {
          if (["Log.entryAdded", "Runtime.consoleAPICalled", "Runtime.exceptionThrown"].includes(message.method)) {
            this.events.push(message);
          }
          return;
        }
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
      const timeout = setTimeout(() => {
        if (!this.pending.delete(id)) return;
        reject(new Error(`DevTools request timed out: ${method}`));
      }, 90000);
      this.pending.set(id, {
        resolve(result) {
          clearTimeout(timeout);
          resolve(result);
        },
        reject(error) {
          clearTimeout(timeout);
          reject(error);
        },
      });
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

function summarizeCdpEvents(events, limit = 12) {
  return (Array.isArray(events) ? events : []).slice(-limit).map((event) => {
    if (event?.method === "Runtime.exceptionThrown") {
      const details = event.params?.exceptionDetails;
      return {
        method: event.method,
        type: "exception",
        text: String(details?.exception?.description || details?.text || "Runtime exception").slice(0, 2000),
      };
    }
    if (event?.method === "Runtime.consoleAPICalled") {
      const args = (event.params?.args || []).map((arg) => {
        if (arg?.value != null) return typeof arg.value === "string" ? arg.value : JSON.stringify(arg.value);
        return arg?.description || arg?.unserializableValue || arg?.type || "";
      }).filter(Boolean);
      return {
        method: event.method,
        type: event.params?.type || "console",
        text: args.join(" | ").slice(0, 2000),
      };
    }
    if (event?.method === "Log.entryAdded") {
      const entry = event.params?.entry || {};
      return {
        method: event.method,
        type: entry.level || "log",
        text: String(entry.text || "").slice(0, 2000),
        ...(entry.url ? { url: entry.url } : {}),
        ...(Number.isFinite(entry.lineNumber) ? { line: entry.lineNumber } : {}),
      };
    }
    return null;
  }).filter(Boolean);
}

async function waitForLiveRuntime(cdp, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = null;
  while (Date.now() < deadline) {
    lastStatus = await cdp.evaluate(`(() => {
      const plugins = window.CodexPlus?.plugins;
      const hasList = typeof plugins?.list === "function";
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
      const disabledPlugins = new Set(window.__CodexPlusRuntimeConfig?.runtimePluginsDisabled || []);
      const expectedPlugins = Math.max(1, requiredPlugins.filter((id) => !disabledPlugins.has(id)).length);
      return {
        readyState: document.readyState,
        hasCodexPlus: Boolean(window.CodexPlus),
        hasPluginList: hasList,
        registered: hasList ? plugins.list().length : null,
        started: window.__CodexPlusRuntime?.core?.startedPlugins?.size ?? null,
        expectedPlugins,
      };
    })()`);
    if (
      lastStatus.hasPluginList &&
      lastStatus.registered >= lastStatus.expectedPlugins &&
      lastStatus.started >= lastStatus.expectedPlugins
    ) return lastStatus;
    if (lastStatus.readyState === "complete" && lastStatus.hasCodexPlus && !lastStatus.hasPluginList) return lastStatus;
    await delay(250);
  }
  throw new Error(`Timed out waiting for Codex Plus runtime plugins: ${JSON.stringify(lastStatus)}`);
}

async function waitForAppShellMounted(cdp, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = null;
  while (Date.now() < deadline) {
    lastStatus = await cdp.evaluate(`(() => {
      const root = document.getElementById("root");
      const bodyText = document.body?.innerText?.trim() ?? "";
      const interactiveCount = document.querySelectorAll("button,a,nav,[role=navigation]").length;
      const hasErrorBoundary = /^Oops, an error has occurred\\b/.test(bodyText);
      return {
        readyState: document.readyState,
        hasRoot: Boolean(root),
        hasStartupLoader: Boolean(document.querySelector("#root .startup-loader, #root .openai-blossom-shimmer")),
        hasErrorBoundary,
        bodyTextLength: bodyText.length,
        elementCount: document.querySelectorAll("*").length,
        interactiveCount,
        hasNewChatText: bodyText.includes("New chat"),
        bodyTextSampleLength: Math.min(bodyText.length, 120),
      };
    })()`);
    if (lastStatus.hasErrorBoundary) {
      throw new Error(`Codex app shell rendered error boundary: ${JSON.stringify(lastStatus)}`);
    }
    if (
      lastStatus.readyState === "complete" &&
      lastStatus.hasRoot &&
      !lastStatus.hasStartupLoader &&
      lastStatus.bodyTextLength > 0 &&
      lastStatus.interactiveCount > 0
    ) {
      return lastStatus;
    }
    await delay(250);
  }
  const startupHint = lastStatus?.hasStartupLoader
    ? " The app is still on the startup logo; check for a blocking macOS Keychain access dialog for the audit/regression app."
    : "";
  throw new Error(`Timed out waiting for Codex app shell to mount: ${JSON.stringify(lastStatus)}${startupHint}`);
}

async function auditRequiredHostAdapters(cdp, { requireBindings = false } = {}) {
  const status = await cdp.evaluate(`(() => {
    const audit = window.CodexPlusHost?.auditAdapters;
    if (typeof audit?.missing !== "function") return { ok: false, missing: ["CodexPlusHost.auditAdapters.missing"] };
    const missing = audit.missing();
    const sidePanel = window.CodexPlusHost.adapters.threadSidePanel;
    const binding = typeof sidePanel?.bindingStatus === "function" ? sidePanel.bindingStatus() : {};
    if (binding.openFile !== true) missing.push("threadSidePanel.openFile(binding)");
    if (binding.mount !== true) missing.push("threadSidePanel.mount(binding)");
    return { ok: missing.length === 0, missing };
  })()`);
  const missing = (status?.missing || []).filter((path) => (
    requireBindings || !path.endsWith("(binding)")
  ));
  if (missing.length > 0) throw new Error(`Missing required CodexPlusHost adapters: ${missing.join(", ")}`);
  return { ok: true, missing: [] };
}

async function reloadAuditRenderer(cdp, { timeoutMs = 30000, wait = delay } = {}) {
  await cdp.send("Page.reload", { ignoreCache: true });
  const deadline = Date.now() + timeoutMs;
  let lastReadyState = null;
  while (Date.now() < deadline) {
    try {
      lastReadyState = await cdp.evaluate("document.readyState");
      if (lastReadyState === "interactive" || lastReadyState === "complete") {
        return { ok: true, readyState: lastReadyState };
      }
    } catch {
      // The old execution context is destroyed while Electron replaces it.
    }
    await wait(100);
  }
  throw new Error(`Timed out waiting for reloaded audit renderer: ${lastReadyState || "unavailable"}`);
}

async function closeActiveVirtualRoute(cdp, { timeoutMs = 10000, wait = delay } = {}) {
  const closeResult = await cdp.evaluate(`(() => {
    const api = window.CodexPlus?.ui?.virtualConversations;
    return typeof api?.close === "function" ? api.close() : { ok: false, error: "virtual-conversations-unavailable" };
  })()`);
  if (!closeResult?.ok) throw new Error(`Could not close active virtual route: ${JSON.stringify(closeResult)}`);
  const deadline = Date.now() + timeoutMs;
  let status = null;
  while (Date.now() < deadline) {
    status = await cdp.evaluate(`(() => ({
      activeRouteId: window.CodexPlus?.ui?.virtualConversations?.activeRouteId?.() || "",
      routeContext: window.CodexPlus?.ui?.routeContext?.active?.() || null,
      hash: String(window.location.hash || ""),
    }))()`);
    if (!status.activeRouteId && !status.routeContext && !status.hash.includes("cpx-aharness-run")) {
      return { ok: true, ...status };
    }
    await wait(100);
  }
  throw new Error(`Timed out closing active virtual route: ${JSON.stringify(status)}`);
}

function appShellTimeoutForSource(sourceApp) {
  try {
    return detectSourceFamily(sourceApp) === "chatgpt" ? CHATGPT_APP_SHELL_TIMEOUT_MS : DEFAULT_APP_SHELL_TIMEOUT_MS;
  } catch {
    return DEFAULT_APP_SHELL_TIMEOUT_MS;
  }
}

async function dismissStartupDialogs(cdp, { timeoutMs = 5000, wait = delay } = {}) {
  const deadline = Date.now() + timeoutMs;
  const dismissed = [];
  let lastStatus = null;
  while (Date.now() < deadline) {
    lastStatus = await cdp.evaluate(`(() => {
      const visible = (element) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };
      const startupDialogPhrases = [
        "Codex is now the ChatGPT app",
        "Keep coding with Codex",
        "Keep the Codex app icon",
        "The Codex app is becoming the ChatGPT app",
        "Introducing GPT-5.6 Sol",
        "Try GPT-5.6 Sol now",
        "Introducing Fast mode",
      ];
      const dialogs = Array.from(document.querySelectorAll("[role=\\"dialog\\"], dialog"))
        .filter(visible)
        .map((dialog) => ({
          element: dialog,
          text: dialog.innerText || "",
        }))
        .filter((dialog) => startupDialogPhrases.some((phrase) => dialog.text.includes(phrase)));
      if (dialogs.length === 0) return { present: false, dismissed: false };
      const dialog = dialogs[0];
      const buttons = Array.from(dialog.element.querySelectorAll("button")).filter(visible);
      const byText = (label) => buttons.find((button) => button.textContent?.trim() === label);
      const confirmButton = dialog.text.includes("Codex is now the ChatGPT app") ? byText("Get started") : null;
      const dismissButton = buttons.find((button) => button.getAttribute("aria-label") === "Close") ||
        byText("Continue with current model") ||
        byText("Not now");
      const button = confirmButton || dismissButton;
      if (!button) {
        return {
          present: true,
          dismissed: false,
          reason: "missing-dismiss-button",
          text: dialog.text.slice(0, 160),
        };
      }
      button.click();
      const bodyText = document.body?.innerText || "";
      return {
        present: true,
        dismissed: true,
        method: confirmButton ? "get-started" : "dismiss",
        text: bodyText.slice(0, 160),
      };
    })()`);
    if (!lastStatus.present) {
      return {
        present: dismissed.length > 0,
        dismissed: dismissed.length > 0,
        cleared: true,
        dialogs: dismissed,
      };
    }
    if (!lastStatus.dismissed) {
      throw new Error(`Startup dialog is blocking the audit and could not be dismissed: ${JSON.stringify(lastStatus)}`);
    }
    dismissed.push(lastStatus);
    await wait(250);
  }
  throw new Error(`Startup dialog remained visible after dismissal: ${JSON.stringify(lastStatus)}`);
}

function failedPlugins(result) {
  return Array.from(new Set((result.failures || [])
    .map((failure) => failure.plugin)
    .filter((plugin) => plugin && plugin !== "audit")));
}

function failedPatches(result) {
  return Array.from(new Set((result.failures || [])
    .flatMap((failure) => [
      failure.patch,
      failure.patchId,
      failure.details?.patch,
      failure.details?.patchId,
    ])
    .filter(Boolean)));
}

function formatAuditJson(result) {
  return `${JSON.stringify(result, null, 2)}\n`;
}

function compactAuditSummary(result) {
  return {
    ok: Boolean(result?.ok),
    failures: result?.failures || [],
    expectedWarnings: result?.expectedWarnings || [],
    source: result?.applyResult?.sourceApp || result?.source || DEFAULT_SOURCE,
    target: result?.target?.app || DEFAULT_TARGET,
    patchSet: result?.applyResult?.patchSet || null,
    codexVersion: result?.applyResult?.codexVersion || null,
    bundleVersion: result?.applyResult?.bundleVersion || null,
    runtimeStatus: result?.runtimeStatus || null,
    appShellStatus: result?.appShellStatus || null,
    cleanupResult: result?.cleanupResult || null,
    plugins: Object.fromEntries(Object.entries(result?.pluginResults || {}).map(([name, value]) => [
      name,
      {
        ok: value?.ok ?? null,
        warning: value?.warning || null,
        message: value?.message || null,
      },
    ])),
  };
}

function writeJsonFile(filePath, value, { fsImpl = fs } = {}) {
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true });
  fsImpl.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function jsonlRecord(type, payload = {}, { now = () => new Date() } = {}) {
  return {
    type,
    time: now().toISOString(),
    ...payload,
  };
}

function writeJsonl(stream, record) {
  stream.write(`${JSON.stringify(record)}\n`);
}

function createJsonlHeartbeatProcess({ intervalMs }) {
  const script = `let active=null;process.on("message",message=>{if(message.type==="active")active=message.payload;else if(message.type==="clear")active=null;else if(message.type==="close")process.exit(0)});process.on("disconnect",()=>process.exit(0));setInterval(()=>{if(!active)return;let{startedAt,...record}=active;process.stdout.write(JSON.stringify({...record,time:new Date().toISOString(),elapsedMs:Math.max(0,Date.now()-startedAt)})+"\\n")},${JSON.stringify(intervalMs)});`;
  const child = childProcess.spawn(process.execPath, ["-e", script], {
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  });
  child.unref();
  child.channel?.unref?.();
  const send = (message) => {
    if (!child.connected) return;
    try {
      child.send(message, () => {});
    } catch (error) {
      if (error.code !== "ERR_IPC_CHANNEL_CLOSED") throw error;
    }
  };
  return {
    start(payload) {
      send({ type: "active", payload });
    },
    clear() {
      send({ type: "clear" });
    },
    close() {
      send({ type: "close" });
      child.disconnect?.();
    },
  };
}

function writeAuditOutput(result, args, { stream = process.stdout, now = () => new Date() } = {}) {
  if (args.jsonl) {
    if (args.json) {
      writeJsonl(stream, jsonlRecord("result", { result }, { now }));
    } else {
      writeJsonl(stream, jsonlRecord("summary", {
        ok: result.ok,
        failures: result.failures || [],
        expectedWarnings: result.expectedWarnings || [],
        visualContract: result.visualContract ? {
          ok: result.visualContract.ok,
          artifactDir: result.visualContract.artifactDir,
        } : null,
      }, { now }));
    }
  } else if (args.json) {
    stream.write(formatAuditJson(result));
  } else {
    stream.write(formatAuditResult(result, args));
  }
}

function createJsonlProgress({
  stream = process.stdout,
  now = () => new Date(),
  context = {},
  intervalMs = 2000,
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
} = {}) {
  let active = null;
  let timer = null;
  let heartbeatProcess = null;
  const emit = (status, message, extra = {}) => writeJsonl(stream, jsonlRecord("progress", {
    status,
    message,
    ...context,
    ...extra,
  }, { now }));
  const stopTimer = () => {
    if (timer != null) clearIntervalImpl(timer);
    timer = null;
    heartbeatProcess?.clear();
  };
  const startTimer = () => {
    stopTimer();
    if (stream === process.stdout && setIntervalImpl === setInterval) {
      heartbeatProcess ||= createJsonlHeartbeatProcess({ intervalMs });
      heartbeatProcess.start({
        type: "progress",
        message: active.message,
        ...context,
        ...active.extra,
        status: "progress",
        startedAt: active.startedAt.getTime(),
      });
      return;
    }
    timer = setIntervalImpl(() => {
      if (!active) return;
      emit("progress", active.message, {
        ...active.extra,
        elapsedMs: Math.max(0, now().getTime() - active.startedAt.getTime()),
      });
    }, intervalMs);
    timer?.unref?.();
  };
  const reporter = (event = {}) => {
    if (event.step != null && event.phase == null) event = { phase: "apply", ...event };
    const message = event.label || event.message || (event.item ? `${event.itemType}: ${event.item}` : "Progress");
    if (event.status === "item") {
      emit("progress", message, event);
      return;
    }
    if (event.status === "succeed") reporter.succeed(message, event);
    else if (event.status === "fail") reporter.fail(message, event);
    else reporter.start(message, event);
  };
  reporter.start = (message, extra = {}) => {
    stopTimer();
    active = { message, extra, startedAt: now() };
    emit("start", message, { ...extra, elapsedMs: 0 });
    startTimer();
  };
  reporter.succeed = (message, extra = {}) => {
    const elapsedMs = active ? Math.max(0, now().getTime() - active.startedAt.getTime()) : 0;
    stopTimer();
    emit("pass", message, { ...(active?.extra || {}), ...extra, elapsedMs });
    active = null;
  };
  reporter.fail = (message, extra = {}) => {
    const elapsedMs = active ? Math.max(0, now().getTime() - active.startedAt.getTime()) : 0;
    stopTimer();
    emit("fail", message, { ...(active?.extra || {}), ...extra, elapsedMs });
    active = null;
  };
  reporter.item = (itemType, item, extra = {}) => reporter({ status: "item", itemType, item, ...extra });
  reporter.event = (type, payload = {}) => writeJsonl(stream, jsonlRecord(type, { ...context, ...payload }, { now }));
  reporter.child = (childContext = {}) => createJsonlProgress({
    stream,
    now,
    context: { ...context, ...childContext },
    intervalMs,
    setIntervalImpl,
    clearIntervalImpl,
  });
  reporter.close = () => {
    stopTimer();
    active = null;
    heartbeatProcess?.close();
    heartbeatProcess = null;
  };
  reporter.machineReadable = true;
  reporter.suppressCommandOutput = true;
  return reporter;
}

function formatAuditResult(result, { quiet = false } = {}) {
  const expectedWarnings = result.expectedWarnings || [];
  if (result.manual) {
    if (quiet) return "Manual audit app launched. Plugin probes skipped.\n";
    const lines = [
      "Manual audit app launched.",
      "Plugin probes skipped because --manual was set.",
      `Source: ${result.applyResult?.sourceApp || result.source || DEFAULT_SOURCE}`,
      ...(result.applyResult?.codexVersion
        ? [`Base app: Codex ${result.applyResult.codexVersion}${result.applyResult.bundleVersion ? ` (bundle ${result.applyResult.bundleVersion})` : ""}`]
        : []),
      ...(result.applyResult?.patchSet ? [`Patch set: ${result.applyResult.patchSet}`] : []),
      `DevTools: ${result.devToolsUrl || `http://127.0.0.1:${result.target?.remoteDebuggingPort ?? DEFAULT_PORT}/json/list`}`,
      `Target: ${result.target?.app || DEFAULT_TARGET}`,
      `Dev home: ${result.devHome || DEFAULT_DEV_HOME}`,
      `Electron user data: ${result.electronUserDataPath || DEFAULT_ELECTRON_USER_DATA}`,
    ];
    const pid = result.launchResult?.pid ?? result.target?.pid;
    if (pid != null) lines.push(`PID: ${pid}`);
    if (result.preflight?.suggestedCommand) lines.push(`Attach command: ${result.preflight.suggestedCommand}`);
    return `${lines.join("\n")}\n`;
  }
  if (quiet) {
    if (!result.ok) return `Plugin audit failed: ${result.failures.length} failures\n`;
    return expectedWarnings.length > 0
      ? "All plugin probes passed with expected warnings.\n"
      : "All plugin probes passed.\n";
  }

  if (!result.ok) {
    const plugins = failedPlugins(result);
    const patches = failedPatches(result);
    const lines = [
      `Plugin audit failed: ${result.failures.length} failures`,
      "",
    ];
    if (plugins.length > 0) lines.push(`Failed plugins: ${plugins.join(", ")}`);
    if (patches.length > 0) lines.push(`Failed patches: ${patches.join(", ")}`);
    if (plugins.length > 0 || patches.length > 0) lines.push("");
    for (const failure of result.failures) {
      lines.push(`${failure.plugin || "audit"}`);
      lines.push(`  ${failure.message || "probe failed"}`);
      if (failure.patch || failure.patchId || failure.details?.patch || failure.details?.patchId) {
        lines.push(`  patch: ${failure.patch || failure.patchId || failure.details?.patch || failure.details?.patchId}`);
      }
      if (Array.isArray(failure.details?.crashDumps) && failure.details.crashDumps.length > 0) {
        lines.push(`  crash dumps: ${failure.details.crashDumps.join(", ")}`);
      }
      if (failure.details?.livePort != null) {
        lines.push(`  live port: ${failure.details.livePort}`);
      }
      if (failure.details?.suggestedCommand) {
        lines.push(`  suggested command: ${failure.details.suggestedCommand}`);
      }
      lines.push("");
    }
    if (expectedWarnings.length > 0) {
      lines.push("Expected warnings:");
      for (const warning of expectedWarnings) {
        lines.push(`  ${warning.plugin || "audit"} ${warning.code || "warning"}: ${warning.message || "expected warning"}`);
      }
      lines.push("");
    }
    lines.push("Re-run with --json for full probe details.");
    return `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
  }

  const probeCount = Object.keys(result.pluginResults || {}).length;
  const runtime = result.runtimeStatus || {};
  const appShell = result.appShellStatus || {};
  const cleanup = result.cleanupResult;
  const cleanupText = cleanup?.keptOpen
    ? "kept open"
    : cleanup?.attempted
      ? cleanup.ok ? "cleaned up" : `cleanup failed: ${cleanup.message}`
      : "not launched";
  const lines = [
    "Audit Codex Plus plugins",
    `Source: ${result.applyResult?.sourceApp || result.source || DEFAULT_SOURCE}`,
    `Target: ${result.target?.app || DEFAULT_TARGET}`,
  ];
  lines.push(`Home: ${result.fixtureResult ? "generated fixture" : result.syncResult ? "live source sync" : "existing app"}`);
  if (result.applyResult?.patchSet) lines.push(`Patch set: ${result.applyResult.patchSet}`);
  lines.push(
    "",
    `Port: ${result.target?.remoteDebuggingPort ?? "unknown"}`,
    result.preflight?.reuseExisting ? "Launch: reused existing app" : "Launch: audit-launched app",
    `Runtime ready: ${runtime.registered ?? result.registeredPlugins?.length ?? 0} registered, ${runtime.started ?? result.startedPlugins?.length ?? 0} started`,
    `App shell: ${appShell.hasStartupLoader === false ? "mounted" : "unknown"}`,
    `Probed ${probeCount} plugins`,
    `Warnings: ${expectedWarnings.length} expected`,
    `Native open probes: ${result.nativeOpenProbes?.included ? "included" : "skipped"}`,
    `Visual contract: ${result.visualContract?.artifactDir || "disabled"}`,
    `Cleanup: ${cleanupText}`,
    "",
    "All plugin probes passed.",
  );
  if (expectedWarnings.length > 0) {
    lines.push("", "Expected warnings:");
    for (const warning of expectedWarnings) {
      lines.push(`${warning.plugin || "audit"} ${warning.code || "warning"}: ${warning.message || "expected warning"}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function shouldShowAuditProgress(args, stream = process.stderr) {
  return !args.jsonl && !args.quiet && !args.noProgress && stream != null;
}

function timestamp(date = new Date()) {
  return date.toISOString();
}

async function createAuditProgress(args, {
  stream = process.stderr,
  importOra = (specifier) => import(specifier),
  now = () => new Date(),
} = {}) {
  if (args.jsonl) return createJsonlProgress({ stream, now });
  if (!shouldShowAuditProgress(args, stream)) return null;
  if (stream.isTTY) {
    const { default: ora } = await importOra("ora");
    const spinner = ora({ color: "cyan", spinner: "dots", stream });
    let active = false;
    const reporter = (event = {}) => {
      const text = event.step != null ? `[${event.step}/${event.total}] ${event.label}` : event.label || event.message;
      if (event.status === "item") reporter.item(event.itemType, event.item);
      else if (event.status === "succeed") reporter.succeed(text);
      else if (event.status === "fail") reporter.fail(text);
      else reporter.start(text);
    };
    Object.assign(reporter, {
      start(text) {
        if (active) spinner.succeed();
        spinner.text = text;
        spinner.start();
        active = true;
      },
      succeed(text) {
        if (!active) return;
        spinner.succeed(text);
        active = false;
      },
      fail(text) {
        if (!active) return;
        spinner.fail(text);
        active = false;
      },
      item(itemType, item) {
        const text = `${itemType}: ${item}`;
        if (active && typeof spinner.stopAndPersist === "function") {
          const activeText = spinner.text;
          spinner.stopAndPersist({ symbol: "•", text });
          spinner.text = activeText;
          spinner.start();
        } else if (typeof spinner.info === "function") spinner.info(text);
      },
      close() {
        if (active) spinner.stop?.();
        active = false;
      },
      suppressCommandOutput: true,
    });
    return reporter;
  }
  const reporter = (event = {}) => {
    const text = event.step != null ? `[${event.step}/${event.total}] ${event.label}` : event.label || event.message;
    if (event.status === "item") reporter.item(event.itemType, event.item);
    else if (event.status === "succeed") reporter.succeed(text);
    else if (event.status === "fail") reporter.fail(text);
    else reporter.start(text);
  };
  Object.assign(reporter, {
    start(text) {
      stream.write(`[${timestamp(now())}] ${text}\n`);
    },
    succeed(text) {
      stream.write(`[${timestamp(now())}] OK ${text}\n`);
    },
    fail(text) {
      stream.write(`[${timestamp(now())}] FAIL ${text}\n`);
    },
    item(itemType, item) {
      stream.write(`[${timestamp(now())}] ${itemType}: ${item}\n`);
    },
    close() {},
    suppressCommandOutput: true,
  });
  return reporter;
}

async function capturePng(cdp, filePath, { fsImpl = fs } = {}) {
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true });
  await cdp.send("Page.bringToFront");
  await delay(250);
  const result = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  fsImpl.writeFileSync(filePath, Buffer.from(result.data || "", "base64"));
  return filePath;
}

async function visualReadback(cdp) {
  return cdp.evaluate(`(() => {
    const visible = (element) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const normalize = (value) => String(value || "").replace(/\\s+/g, " ").trim();
    const visibleElements = (selector) => Array.from(document.querySelectorAll(selector)).filter(visible);
    const textIncludes = (text) => normalize(document.body?.innerText || document.body?.textContent || "")
      .toLowerCase()
      .includes(String(text || "").toLowerCase());
    return {
      url: location.href,
      title: document.title,
      shell: {
        startupLoaderVisible: Boolean(document.querySelector("[data-testid='startup-loader']")),
        bodyTextSample: normalize(document.body?.innerText || document.body?.textContent || "").slice(0, 500),
      },
      sidebar: {
        pinnedVisible: textIncludes("Pinned"),
        harnessRunsVisible: textIncludes("Harness Runs"),
        projectsVisible: textIncludes("Projects"),
        threadRows: visibleElements("[data-app-action-sidebar-thread-row]").length,
        projectRows: visibleElements("[data-app-action-sidebar-project-row]").length,
        blurred: document.documentElement.getAttribute("data-codex-plus-sidebar-names-blurred") === "true",
      },
      review: {
        tabVisible: visibleElements("button, [role='tab'], [role='button']").some((element) => normalize(element.textContent) === "Review"),
        repoHeaderVisible: textIncludes("Codex Plus repositories"),
        diffCardCount: visibleElements(".codex-review-diff-card").length,
        rawDiffFallbackCount: visibleElements("pre").filter((element) => /diff --git/.test(element.textContent || "")).length,
      },
      commandPalette: {
        sidebarBlurred: document.documentElement.getAttribute("data-codex-plus-sidebar-names-blurred") === "true",
        visible: visibleElements(".command-menu-dialog, [role='dialog'], [cmdk-root]").length > 0,
        toggleItemVisible: visibleElements("[cmdk-item], [role='option'], [role='menuitem'], button")
          .some((element) => normalize(element.textContent).includes("Toggle sidebar blur")),
      },
      settings: {
        generalVisible: textIncludes("General"),
        backToAppVisible: textIncludes("Back to app"),
        blank: normalize(document.body?.innerText || document.body?.textContent || "").length === 0,
      },
    };
  })()`);
}

async function openSettingsForVisualContract(cdp, { wait = delay, timeoutMs = 15000 } = {}) {
  await cdp.send("Page.navigate", { url: "app://-/index.html?initialRoute=%2Fsettings%2Fgeneral-settings" });
  const deadline = Date.now() + timeoutMs;
  let readback = null;
  do {
    await wait(250);
    readback = await visualReadback(cdp);
    if (readback.settings.generalVisible && readback.settings.backToAppVisible) return readback;
  } while (Date.now() < deadline);
  return readback;
}

async function captureVisualContract(cdp, {
  artifactDir,
  result,
  reviewPanel = null,
  commandPalette = null,
  includeSettings = true,
  fsImpl = fs,
  wait = delay,
  activateFixture = activateFixtureThread,
  verifyReview = verifyReviewPanelRender,
  verifyCommand = verifySidebarBlurCommandPalette,
  preparedReview = null,
  preparedCommand = null,
} = {}) {
  if (!artifactDir) throw new Error("visual contract artifactDir is required");
  fsImpl.mkdirSync(artifactDir, { recursive: true });
  const screenshots = {};
  const shellState = await activateFixture(cdp, { wait });
  await wait(2000);
  screenshots.shell = await capturePng(cdp, path.join(artifactDir, "shell.png"), { fsImpl });
  const shell = await visualReadback(cdp);
  const reviewState = preparedReview?.state || await verifyReview(cdp);
  if (!preparedReview) await wait(500);
  screenshots.review = preparedReview?.screenshot || await capturePng(cdp, path.join(artifactDir, "review.png"), { fsImpl });
  const review = preparedReview?.readback || await visualReadback(cdp);
  const commandState = preparedCommand?.state || await verifyCommand(cdp, { activate: false, wait });
  if (!preparedCommand) await wait(250);
  screenshots.sidebarCommand = preparedCommand?.screenshot || await capturePng(cdp, path.join(artifactDir, "sidebar-command.png"), { fsImpl });
  const command = preparedCommand?.readback || await visualReadback(cdp);
  if (!preparedCommand) {
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 53 });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 53 });
  }
  let settings = null;
  if (includeSettings) {
    settings = await openSettingsForVisualContract(cdp, { wait });
    screenshots.settings = await capturePng(cdp, path.join(artifactDir, "settings.png"), { fsImpl });
  }
  const contract = {
    ok: true,
    createdAt: new Date().toISOString(),
    artifactDir,
    screenshots,
    source: result?.applyResult?.sourceApp || result?.source || DEFAULT_SOURCE,
    target: result?.target?.app || DEFAULT_TARGET,
    patchSet: result?.applyResult?.patchSet || null,
    codexVersion: result?.applyResult?.codexVersion || null,
    bundleVersion: result?.applyResult?.bundleVersion || null,
    shell,
    review: {
      ...review.review,
      probe: reviewPanel,
      captureProbe: reviewState,
    },
    commandPalette: {
      ...command.commandPalette,
      probe: commandPalette,
      captureProbe: commandState,
    },
    settings: settings?.settings || null,
  };
  if (includeSettings && (contract.settings.blank || !contract.settings.generalVisible)) {
    contract.ok = false;
    contract.message = "Settings visual contract did not render General settings";
  }
  if (!shellState?.ok || !reviewState?.ok || !commandState?.ok || !review.review.repoHeaderVisible || !command.commandPalette.visible || !command.commandPalette.toggleItemVisible) {
    contract.ok = false;
    contract.message = `Visual contract states were not capture-ready: ${JSON.stringify({ shellState, reviewState, commandState, review: review.review, command: command.commandPalette })}`;
  }
  writeJsonFile(path.join(artifactDir, "contract.json"), contract, { fsImpl });
  writeJsonFile(path.join(artifactDir, "audit-summary.json"), compactAuditSummary(result), { fsImpl });
  return contract;
}

function progressStart(progress, text) {
  progress?.start?.(text, { phase: progressPhase(text) });
}

function progressSucceed(progress, text) {
  progress?.succeed?.(text, { phase: progressPhase(text) });
}

function progressFail(progress, text) {
  progress?.fail?.(text, { phase: progressPhase(text) });
}

function progressPhase(text) {
  const value = String(text || "").toLowerCase();
  if (value.includes("preflight")) return "preflight";
  if (value.includes("patch")) return "apply";
  if (value.includes("fixture") || value.includes("source home")) return "fixture";
  if (value.includes("launch")) return "launch";
  if (value.includes("runtime") || value.includes("app shell") || value.includes("index.html") || value.includes("startup")) return "startup";
  if (value.includes("visual contract")) return "visual-contract";
  if (value.includes("clean") || value.includes("kept")) return "cleanup";
  return "probe";
}

async function withAuditProgress(progress, startText, doneText, action) {
  progressStart(progress, startText);
  try {
    const result = await action();
    progressSucceed(progress, doneText);
    return result;
  } catch (error) {
    progressFail(progress, startText);
    throw error;
  }
}

async function withAuditCheckProgress(progress, startText, doneText, action) {
  progressStart(progress, startText);
  try {
    const result = await action();
    if (result?.ok === false) {
      progressFail(progress, startText);
    } else {
      progressSucceed(progress, doneText);
    }
    return result;
  } catch (error) {
    progressFail(progress, startText);
    throw error;
  }
}

async function cleanupLaunchedAuditApp(launchResult, {
  keepOpen = false,
  kill = process.kill,
  listRunningApps = listRunningAuditApps,
  wait = delay,
} = {}) {
  const pid = launchResult?.pid;
  if (keepOpen) return { attempted: false, keptOpen: true, ok: true, pid };
  if (launchResult?.targetApp && launchResult.electronUserDataPath) {
    const apps = listRunningApps({
      targetApp: launchResult.targetApp,
      devHome: launchResult.devHome,
      electronUserDataPath: launchResult.electronUserDataPath,
      includeTargetProcesses: true,
    });
    for (const app of apps) {
      try {
        kill(app.pid, "SIGTERM");
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    }
    if (apps.length > 0) await wait(500);
  }
  if (pid == null) return { attempted: false, keptOpen: false, ok: true, pid: null };
  const signals = ["SIGTERM", "SIGKILL"];
  for (const signal of signals) {
    try {
      kill(-pid, signal);
    } catch (groupError) {
      try {
        kill(pid, signal);
      } catch (processError) {
        if (processError.code === "ESRCH") return { attempted: true, keptOpen: false, ok: true, pid };
        if (signal === "SIGKILL") {
          return {
            attempted: true,
            keptOpen: false,
            ok: false,
            pid,
            message: processError.message || groupError.message,
          };
        }
      }
    }
    await wait(signal === "SIGTERM" ? 500 : 0);
  }
  return { attempted: true, keptOpen: false, ok: true, pid };
}

function processIsAlive(pid, { kill = process.kill } = {}) {
  if (pid == null) return false;
  try {
    kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function listCrashpadPendingDumps(electronUserDataPath, { readdirSync = fs.readdirSync } = {}) {
  const pendingDir = path.join(electronUserDataPath, "Crashpad", "pending");
  try {
    return readdirSync(pendingDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && (entry.name.endsWith(".dmp") || entry.name.endsWith("_sidecar.json")))
      .map((entry) => path.join(pendingDir, entry.name))
      .sort();
  } catch {
    return [];
  }
}

async function checkKeepOpenAppStability(launchResult, {
  electronUserDataPath,
  wait = delay,
  isAlive = processIsAlive,
  listCrashDumps = listCrashpadPendingDumps,
  waitMs = 15000,
  intervalMs = 500,
} = {}) {
  const pid = launchResult?.pid ?? null;
  if (pid == null) {
    return {
      checked: false,
      ok: true,
      pid,
      alive: null,
      crashDumps: [],
      message: "No audit-launched app process to check",
    };
  }
  const deadline = Date.now() + waitMs;
  let alive = isAlive(pid);
  while (alive && Date.now() < deadline) {
    await wait(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
    alive = isAlive(pid);
  }
  const crashDumps = electronUserDataPath ? listCrashDumps(electronUserDataPath) : [];
  return {
    checked: true,
    ok: alive,
    pid,
    alive,
    crashDumps,
    message: alive ? "Audit-launched app is still running" : "Audit-launched app exited after probes",
  };
}

function appendFailure(result, failure) {
  result.failures = [...(result.failures || []), failure];
  result.ok = false;
}

function pluginAuditExpression({ includeNativeOpenProbes = false, auditPlugins = [] } = {}) {
  const options = JSON.stringify({ includeNativeOpenProbes, auditPlugins });
  return `(${async function runPluginAudit(options) {
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
    const disabledPlugins = new Set(globalThis.__CodexPlusRuntimeConfig?.runtimePluginsDisabled || []);
    const enabledRequiredPlugins = requiredPlugins.filter((id) => !disabledPlugins.has(id));
    const focusedPlugins = Array.isArray(options.auditPlugins) ? options.auditPlugins.filter(Boolean) : [];
    const probedPlugins = focusedPlugins.length > 0
      ? enabledRequiredPlugins.filter((id) => focusedPlugins.includes(id))
      : enabledRequiredPlugins;
    const shouldProbe = (id) => !disabledPlugins.has(id) && (focusedPlugins.length === 0 || focusedPlugins.includes(id));
    const pluginResults = {};
    const failures = [];
    const expectedWarnings = [];
    const add = (id, ok, details = {}) => {
      pluginResults[id] = { ok, ...details };
      if (!ok) failures.push({ plugin: id, message: details.message || "probe failed", details });
    };
    const fail = (id, error, details = {}) => add(id, false, { message: error?.message || String(error), ...details });
    const pass = (id, details = {}) => add(id, true, details);
    const warn = (id, code, message, details = {}) => {
      expectedWarnings.push({ plugin: id, code, message, details });
    };
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
    const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const versionAtLeast = (version, minimum) => {
      const left = String(version || "").split(".").map((part) => Number.parseInt(part, 10) || 0);
      const right = String(minimum || "").split(".").map((part) => Number.parseInt(part, 10) || 0);
      const length = Math.max(left.length, right.length);
      for (let index = 0; index < length; index += 1) {
        if ((left[index] || 0) > (right[index] || 0)) return true;
        if ((left[index] || 0) < (right[index] || 0)) return false;
      }
      return true;
    };
    const rowTitle = (row) => {
      const attributeTitle = [
        row?.getAttribute("data-app-action-sidebar-thread-title"),
        row?.getAttribute("data-codex-plus-thread-title"),
        row?.getAttribute("aria-label"),
        row?.getAttribute("title"),
      ].map(normalize).find(Boolean);
      if (attributeTitle) return attributeTitle;
      const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const text = normalize(node.nodeValue);
        if (text === "" || /^(?:now|\d+[smhdw])$/.test(text)) continue;
        const parentStyle = node.parentElement ? getComputedStyle(node.parentElement) : null;
        if (parentStyle && (parentStyle.display === "none" || parentStyle.visibility === "hidden")) continue;
        return text;
      }
      return normalize(row?.textContent).replace(/(?:now|\d+[smhdw])$/, "");
    };
    const visible = (element) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const visibleElements = (selector) => Array.from(document.querySelectorAll(selector)).filter(visible);
    const rendererAssetUrls = async () => {
      const roots = Array.from(new Set([
        ...Array.from(document.scripts).map((script) => script.src),
        ...performance.getEntriesByType("resource").map((entry) => entry.name),
      ])).filter((url) => typeof url === "string" && url.startsWith("app://-/") && url.endsWith(".js"));
      const urls = new Set(roots);
      for (const url of roots.filter((candidate) => candidate.includes("/assets/index-"))) {
        try {
          const text = await fetch(url).then((response) => response.text());
          for (const match of text.matchAll(/["'](\.\/[^"']+\.js)["']/g)) {
            urls.add(new URL(match[1], url).href);
          }
        } catch {
          // Missing source readback is handled by the caller's evidence checks.
        }
      }
      return Array.from(urls);
    };
    const rendererSourceEvidence = async (needles) => {
      const urls = await rendererAssetUrls();
      const evidence = Object.fromEntries(needles.map((needle) => [needle, null]));
      for (const url of urls) {
        if (!url.includes("/assets/") || url.includes("/assets/codex-plus/")) continue;
        let text = "";
        try {
          text = await fetch(url).then((response) => response.text());
        } catch {
          continue;
        }
        for (const needle of needles) {
          if (evidence[needle] == null && text.includes(needle)) evidence[needle] = url;
        }
      }
      return {
        urlsChecked: urls.length,
        evidence,
      };
    };
    const waitForProjectThreadRows = async (timeoutMs = 45000) => {
      const startedAt = Date.now();
      while (Date.now() - startedAt < timeoutMs) {
        const rows = document.querySelectorAll("[data-app-action-sidebar-project-list-id] [data-app-action-sidebar-thread-row]");
        if (rows.length > 0) return rows.length;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      return 0;
    };
    const expandProjectRows = async () => {
      const collapsedRows = Array.from(document.querySelectorAll("[data-app-action-sidebar-project-row][aria-expanded='false']"));
      for (const row of collapsedRows) {
        const container = row.closest("[role='listitem']") || row.parentElement;
        const expandButton = container?.querySelector("button[aria-label='Expand project']") ||
          container?.querySelector("button[aria-expanded='false']") ||
          row.querySelector("button[aria-expanded='false']");
        (expandButton || row).click();
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      return collapsedRows.length;
    };
    const isTransparentColor = (value) => value === "rgba(0, 0, 0, 0)" || value === "transparent";
    const findProjectlessChatRow = () => visibleElements("[data-app-action-sidebar-thread-row]")
      .find((row) => rowTitle(row).includes("Fixture: no project chat"));
    const waitForProjectlessChatRow = async (timeoutMs = 10000) => {
      const startedAt = Date.now();
      while (Date.now() - startedAt < timeoutMs) {
        const row = findProjectlessChatRow();
        if (row) return row;
        for (const scroller of Array.from(document.querySelectorAll("aside, nav, [role='navigation'], [data-radix-scroll-area-viewport], .overflow-y-auto, .overflow-auto"))) {
          if (scroller && scroller.scrollHeight > scroller.clientHeight) scroller.scrollTop = scroller.scrollHeight;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      return null;
    };
    const projectlessRowsInChatsSection = () => {
      const chatSection = visibleElements("[data-app-action-sidebar-section]")
        .find((section) => section.getAttribute("data-app-action-sidebar-section-heading") === "Chats");
      return (chatSection ? Array.from(chatSection.querySelectorAll("[data-app-action-sidebar-thread-row]")) : [])
        .map((row) => {
          const computed = getComputedStyle(row);
          return {
            accent: computed.getPropertyValue("--codex-plus-project-accent").trim(),
            background: computed.backgroundColor,
            marked: row.hasAttribute("data-codex-plus-project-sidebar-color"),
            pinned: row.getAttribute("data-app-action-sidebar-thread-pinned") === "true",
            title: rowTitle(row),
          };
        })
        .filter((row) => row.title.includes("Fixture: no project chat"));
    };
    const findFixtureProjectThreadRow = () => Array.from(document.querySelectorAll("[data-app-action-sidebar-thread-row]"))
      .find((row) => {
        const title = rowTitle(row);
        return title.includes("Fixture: main repo path header") || title.includes("Fixture: nested repos before branch selection");
      });
    const isComposerPathChip = (chip) => Boolean(chip?.closest?.("[data-codex-composer], [data-codex-plus-user-entry], .composer-surface-chrome, form"));
    const waitForLiveProjectPathChip = async (plugin, timeoutMs = 10000, acceptsTitle = (title) => title.includes("fixture-workspaces")) => {
      const startedAt = Date.now();
      while (Date.now() - startedAt < timeoutMs) {
        const candidates = visibleElements("[data-codex-plus-project-path-header]").filter((chip) => !isComposerPathChip(chip));
        const liveChip = candidates.find((chip) => normalize(chip.closest("header")?.textContent).includes("Fixture:")) || candidates[0];
        const liveChipTitle = liveChip?.getAttribute("title") || "";
        if (liveChip && acceptsTitle(liveChipTitle)) return liveChip;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      const candidates = visibleElements("[data-codex-plus-project-path-header]").filter((chip) => !isComposerPathChip(chip));
      return candidates.find((chip) => normalize(chip.closest("header")?.textContent).includes("Fixture:")) || candidates[0] || null;
    };
    const projectSelectorMenuStatus = () => {
      const searchInput = document.querySelector("input[placeholder='Search projects']");
      const menu = document.querySelector("[data-radix-menu-content], [data-radix-popper-content-wrapper], [role='menu']");
      return {
        activePlaceholder: document.activeElement?.getAttribute?.("placeholder") ?? "",
        opened: Boolean(searchInput || menu),
        searchInput: Boolean(searchInput),
        menu: Boolean(menu),
      };
    };
    const waitForProjectSelectorMenu = async (timeoutMs = 1000) => {
      const startedAt = Date.now();
      let status = projectSelectorMenuStatus();
      while (!status.opened && Date.now() - startedAt < timeoutMs) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        status = projectSelectorMenuStatus();
      }
      return status;
    };
    const visibleChooseProjectButton = () => visibleElements("button,[role='button']")
      .find((button) => normalize(button.textContent) === "Choose project" || normalize(button.getAttribute?.("aria-label")) === "Choose project");
    const closeProjectSelectorMenu = async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }));
      await new Promise((resolve) => setTimeout(resolve, 150));
    };
    const dispatchPointerClick = (target) => {
      const Pointer = window.PointerEvent || window.MouseEvent;
      for (const type of ["pointerdown", "mousedown", "mouseup", "click"]) {
        const EventConstructor = type === "pointerdown" ? Pointer : window.MouseEvent;
        target.dispatchEvent(new EventConstructor(type, {
          bubbles: true,
          button: 0,
          buttons: type === "pointerdown" || type === "mousedown" ? 1 : 0,
          cancelable: true,
          view: window,
        }));
      }
    };
    const waitForProjectlessRowsInChatsSection = async (timeoutMs = 30000) => {
      const startedAt = Date.now();
      let rows = [];
      while (Date.now() - startedAt < timeoutMs) {
        rows = projectlessRowsInChatsSection();
        if (rows.length === 3 && rows.every((row) => !row.pinned)) return rows;
        for (const scroller of Array.from(document.querySelectorAll("[data-app-action-sidebar-scroll], aside, nav, [role='navigation'], [data-radix-scroll-area-viewport], .overflow-y-auto, .overflow-auto"))) {
          if (scroller && scroller.scrollHeight > scroller.clientHeight) scroller.scrollTop = scroller.scrollHeight;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      return rows;
    };
    const waitForMountedProjectComposer = async (expectedAccents, timeoutMs = 30000) => {
      const expected = Array.isArray(expectedAccents) ? expectedAccents : [expectedAccents].filter(Boolean);
      const startedAt = Date.now();
      while (Date.now() - startedAt < timeoutMs) {
        const editor = document.querySelector("[data-codex-composer]");
        const surface = editor?.closest("[data-codex-plus-user-entry]") || editor?.closest(".composer-surface-chrome");
        if (surface) {
          const computed = getComputedStyle(surface);
          const surfaceAccent = computed.getPropertyValue("--codex-plus-project-accent").trim();
          const cornerRadii = [
            computed.borderTopLeftRadius,
            computed.borderTopRightRadius,
            computed.borderBottomRightRadius,
            computed.borderBottomLeftRadius,
          ].map((value) => parseFloat(value) || 0);
          if (
            surface.hasAttribute("data-codex-plus-user-entry") &&
            surface.hasAttribute("data-codex-plus-project-color") &&
            (expected.length === 0 || expected.includes(surfaceAccent)) &&
            computed.boxShadow !== "none"
          ) {
            return {
              marked: true,
              projectMarked: true,
              accent: surfaceAccent,
              boxShadow: computed.boxShadow,
              cornerRadii,
            };
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      const editor = document.querySelector("[data-codex-composer]");
      const surface = editor?.closest("[data-codex-plus-user-entry]") || editor?.closest(".composer-surface-chrome");
      const computed = surface ? getComputedStyle(surface) : null;
      return {
        marked: surface?.hasAttribute("data-codex-plus-user-entry") || false,
        projectMarked: surface?.hasAttribute("data-codex-plus-project-color") || false,
        accent: computed?.getPropertyValue("--codex-plus-project-accent").trim() || "",
        boxShadow: computed?.boxShadow || "",
        cornerRadii: computed ? [
          computed.borderTopLeftRadius,
          computed.borderTopRightRadius,
          computed.borderBottomRightRadius,
          computed.borderBottomLeftRadius,
        ].map((value) => parseFloat(value) || 0) : [],
      };
    };
    const rgb = (value) => {
      const text = String(value || "");
      const rgbMatch = text.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (rgbMatch) return [Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])];
      const srgbMatch = text.match(/color\(srgb\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)/);
      if (!srgbMatch) return null;
      return [srgbMatch[1], srgbMatch[2], srgbMatch[3]].map((channel) => Math.round(Number(channel) * 255));
    };
    const luminance = (color) => {
      if (!color) return null;
      const channel = (value) => {
        const normalized = value / 255;
        return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * channel(color[0]) + 0.7152 * channel(color[1]) + 0.0722 * channel(color[2]);
    };
    const contrast = (foreground, background) => {
      const fg = luminance(rgb(foreground));
      const bg = luminance(rgb(background));
      if (fg == null || bg == null) return null;
      const lighter = Math.max(fg, bg);
      const darker = Math.min(fg, bg);
      return (lighter + 0.05) / (darker + 0.05);
    };
    const isTransparent = (value) => {
      const text = String(value || "").trim();
      return text === "transparent" || text === "rgba(0, 0, 0, 0)" || /rgba\([^)]*,\s*0\)$/.test(text);
    };
    const composerPermissionPickerStatus = () => {
      const editor = document.querySelector("[data-codex-composer]");
      const labels = ["Full access", "Ask for approval", "Approve for me", "Custom"];
      const trigger = Array.from(document.querySelectorAll("button")).find((button) => {
        const text = normalize(button.textContent);
        return labels.some((label) => text === label || text.startsWith(`${label} `));
      });
      const triggerStyle = trigger ? getComputedStyle(trigger) : null;
      const surface = editor?.closest("[data-codex-plus-user-entry]");
      const surfaceStyle = surface ? getComputedStyle(surface) : null;
      let labelStyle = null;
      if (trigger) {
        const walker = document.createTreeWalker(trigger, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (normalize(node.nodeValue) !== "") {
            labelStyle = getComputedStyle(node.parentElement);
            break;
          }
        }
      }
      const triggerColor = triggerStyle?.color || null;
      const labelColor = labelStyle?.color || triggerColor;
      const labelTextFillColor = labelStyle?.webkitTextFillColor || triggerStyle?.webkitTextFillColor || null;
      const effectiveLabelColor = labelTextFillColor && !isTransparent(labelTextFillColor) ? labelTextFillColor : labelColor;
      const surfaceBackground = surfaceStyle?.backgroundColor || null;
      return {
        editorMounted: Boolean(editor),
        editorEditable: editor?.getAttribute("contenteditable") === "true",
        triggerMounted: Boolean(trigger),
        triggerText: normalize(trigger?.textContent),
        triggerDisabled: Boolean(trigger?.disabled),
        triggerAriaDisabled: trigger?.getAttribute("aria-disabled") || null,
        triggerState: trigger?.getAttribute("data-state") || null,
        triggerOpacity: triggerStyle?.opacity || null,
        triggerColor,
        labelColor,
        labelTextFillColor,
        surfaceBackground,
        triggerContrast: contrast(effectiveLabelColor, surfaceBackground),
        labelTextFillTransparent: isTransparent(labelTextFillColor),
        triggerClassName: String(trigger?.className || ""),
      };
    };
    const composerContrastStatus = () => {
      const editor = document.querySelector("[data-codex-composer]");
      const surface = editor?.closest("[data-codex-plus-user-entry]");
      if (!surface) return { editorMounted: Boolean(editor), surfaceMounted: false, checks: [] };
      const surfaceStyle = getComputedStyle(surface);
      const surfaceBackground = surfaceStyle.backgroundColor;
      const surfaceRect = surface.getBoundingClientRect();
      const occludingDescendants = Array.from(surface.querySelectorAll("*"))
        .map((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return {
            className: String(element.className || ""),
            background: style.backgroundColor,
            widthRatio: surfaceRect.width > 0 ? rect.width / surfaceRect.width : 0,
            heightRatio: surfaceRect.height > 0 ? rect.height / surfaceRect.height : 0,
          };
        })
        .filter((element) =>
          element.widthRatio >= 0.9 &&
          element.heightRatio >= 0.5 &&
          !isTransparent(element.background) &&
          element.background !== surfaceBackground
        );
      const probe = document.createElement("div");
      probe.setAttribute("data-codex-plus-composer-contrast-probe", "");
      probe.innerHTML =
        '<div data-codex-plus-rich-content><h3 class="text-token-description-foreground">Removal Plan</h3><table><tbody><tr><th class="opacity-50">Step</th><td><code class="text-token-text-link-foreground">npm test</code></td></tr></tbody></table><p><a class="text-token-text-link-foreground">Verification</a></p></div>' +
        '<button type="button" data-codex-plus-contrast-kind="policy"><span>Full access</span><svg><path d="M0 0h1"/></svg></button>' +
        '<button type="button" data-codex-plus-contrast-kind="policy" aria-disabled="true" class="opacity-25"><span>Ask for approval</span><svg><path d="M0 0h1"/></svg></button>' +
        '<button type="button" data-codex-plus-contrast-kind="policy" data-state="open"><span>Approve for me</span><svg><path d="M0 0h1"/></svg></button>' +
        '<button type="button" data-codex-plus-contrast-kind="policy"><span>Custom</span><svg><path d="M0 0h1"/></svg></button>' +
        '<button type="button" data-codex-plus-contrast-kind="model" aria-expanded="true"><span>5.6 Sol Medium</span><svg><path d="M0 0h1"/></svg></button>';
      surface.appendChild(probe);
      const actualButtons = Array.from(surface.querySelectorAll("button")).filter((button) => !probe.contains(button));
      const policyLabels = ["Full access", "Ask for approval", "Approve for me", "Custom"];
      const actualControls = actualButtons.filter((button) => {
        const text = normalize(button.textContent);
        return policyLabels.some((label) => text === label || text.startsWith(`${label} `)) ||
          /(?:gpt|codex|\bo\d|\d+\.\d+|\bmedium\b|\bhigh\b|\blow\b)/i.test(text);
      });
      const targets = [
        ...probe.querySelectorAll("[data-codex-plus-rich-content] h3,[data-codex-plus-rich-content] th,[data-codex-plus-rich-content] code,[data-codex-plus-rich-content] a,[data-codex-plus-contrast-kind]"),
        ...actualControls,
      ];
      const checks = targets.map((element) => {
        const style = getComputedStyle(element);
        const textFillColor = style.webkitTextFillColor || null;
        const effectiveColor = textFillColor && !isTransparent(textFillColor) ? textFillColor : style.color;
        const icon = element.querySelector?.("svg,svg path");
        const iconStyle = icon ? getComputedStyle(icon) : null;
        const iconColor = iconStyle?.stroke && iconStyle.stroke !== "none" ? iconStyle.stroke : iconStyle?.color || null;
        return {
          kind: element.getAttribute("data-codex-plus-contrast-kind") || (probe.contains(element) ? "rich-content" : "live-control"),
          text: normalize(element.textContent),
          opacity: style.opacity,
          color: style.color,
          textFillColor,
          textFillTransparent: isTransparent(textFillColor),
          contrast: contrast(effectiveColor, surfaceBackground),
          iconColor,
          iconContrast: iconColor ? contrast(iconColor, surfaceBackground) : null,
          synthetic: probe.contains(element),
        };
      });
      probe.remove();
      return {
        editorMounted: Boolean(editor),
        surfaceMounted: true,
        surfaceBackground,
        policyLabels,
        liveControlCount: actualControls.length,
        occludingDescendants,
        checks,
      };
    };
    const userBubbleShapeStatus = () => {
      let synthetic = null;
      let nativeBubble = visibleElements("[data-user-message-bubble]")[0] || null;
      let themeHost = nativeBubble?.closest("[data-codex-plus-user-bubble]") || null;
      if (!nativeBubble) {
        const legacyBubble = visibleElements("[data-codex-plus-user-bubble]:not(:has([data-user-message-bubble]))")[0] || null;
        if (legacyBubble) {
          nativeBubble = legacyBubble;
          themeHost = legacyBubble;
        }
      }
      if (!nativeBubble) {
        synthetic = document.createElement("div");
        synthetic.setAttribute("data-codex-plus-user-bubble", "");
        synthetic.setAttribute("data-codex-plus-project-color", "");
        synthetic.className = "flex flex-col items-end gap-2";
        synthetic.style.cssText = "position:fixed;left:0;top:0;width:320px;z-index:-1";
        synthetic.innerHTML = '<div class="group flex w-full flex-col items-end justify-end gap-1"><div data-user-message-bubble="true" class="bg-token-foreground/5 max-w-[77%] overflow-hidden rounded-2xl px-3 py-2">Fixture user message</div><div><span class="text-token-text-tertiary">1:08 PM</span><button aria-label="Copy message"><svg><path d="M0 0h1"/></svg></button></div></div>';
        document.body.appendChild(synthetic);
        nativeBubble = synthetic.querySelector("[data-user-message-bubble]");
        themeHost = synthetic;
      }
      const wrapper = themeHost !== nativeBubble ? themeHost : nativeBubble?.closest("[data-codex-plus-user-entry]") || null;
      const bubbleStyle = nativeBubble ? getComputedStyle(nativeBubble) : null;
      const wrapperStyle = wrapper ? getComputedStyle(wrapper) : null;
      const decorationRoot = nativeBubble?.nextElementSibling || null;
      const decorationText = decorationRoot?.querySelector?.(".text-token-text-tertiary") || null;
      const decorationIcon = decorationRoot?.querySelector?.("button svg,button svg path") || null;
      const mutedForeground = getComputedStyle(document.documentElement).getPropertyValue("--color-token-text-tertiary").trim();
      const decorationTextColor = decorationText ? getComputedStyle(decorationText).color : null;
      const decorationIconColor = decorationIcon ? getComputedStyle(decorationIcon).color : null;
      const cornerRadius = bubbleStyle ? Math.max(
        parseFloat(bubbleStyle.borderTopLeftRadius) || 0,
        parseFloat(bubbleStyle.borderTopRightRadius) || 0,
        parseFloat(bubbleStyle.borderBottomLeftRadius) || 0,
        parseFloat(bubbleStyle.borderBottomRightRadius) || 0,
      ) : 0;
      const status = {
        bubbleMounted: Boolean(nativeBubble),
        nativeBubbleMounted: Boolean(nativeBubble?.hasAttribute("data-user-message-bubble")),
        themeHostMounted: Boolean(themeHost),
        wrapperMounted: Boolean(wrapper),
        synthetic: Boolean(synthetic),
        bubbleBackground: bubbleStyle?.backgroundColor || null,
        wrapperBackground: wrapperStyle?.backgroundColor || null,
        wrapperBackgroundTransparent: wrapperStyle ? isTransparent(wrapperStyle.backgroundColor) : null,
        decorationsMounted: Boolean(decorationText && decorationIcon),
        mutedForeground,
        decorationTextColor,
        decorationIconColor,
        decorationsUseMutedForeground: Boolean(
          decorationText && decorationIcon && mutedForeground &&
          decorationTextColor === mutedForeground && decorationIconColor === mutedForeground
        ),
        bubbleBorderRadius: bubbleStyle?.borderRadius || null,
        cornerRadius,
        bubbleClassName: String(nativeBubble?.className || ""),
        wrapperClassName: String(wrapper?.className || ""),
      };
      synthetic?.remove();
      return status;
    };
    const composerAttachmentPillStatus = () => {
      const editor = document.querySelector("[data-codex-composer]");
      const surface = editor?.closest("[data-codex-plus-user-entry]");
      const surfaceStyle = surface ? getComputedStyle(surface) : null;
      const synthetic = [];
      if (surface && !visibleElements("[data-codex-plus-user-entry] [data-composer-attachment-pill]").length) {
        const pill = document.createElement("div");
        pill.setAttribute("data-composer-attachment-pill", "");
        pill.innerHTML = '<span class="text-token-description-foreground opacity-50">README.md</span><button type="button"><svg viewBox="0 0 10 10"><path d="M2 2L8 8"/></svg></button>';
        surface.prepend(pill);
        synthetic.push(pill);
      }
      if (surface && !visibleElements("[data-codex-plus-user-entry] .composer-attachment-surface").length) {
        const card = document.createElement("span");
        card.className = "composer-attachment-surface group/file-attachment relative w-fit max-w-64 flex-shrink-0 bg-token-input-background";
        card.innerHTML = '<span class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-token-bg-secondary text-token-text-secondary"><svg viewBox="0 0 20 20"><path d="M4 4h12v12H4z"/></svg></span><span class="text-size-chat truncate font-medium text-token-foreground"># Codex Plus Patch.md</span><button type="button" class="pointer-events-auto inline-flex cursor-interaction items-center gap-0.5 text-token-text-secondary underline underline-offset-2 hover:text-token-foreground">Show in text field</button><button type="button" aria-label="Remove" class="text-token-text-secondary">×</button>';
        surface.prepend(card);
        synthetic.push(card);
      }
      const pills = visibleElements("[data-codex-plus-user-entry] [data-composer-attachment-pill], [data-codex-plus-user-entry] .composer-attachment-surface");
      const pillDetails = pills.map((pill) => {
        const pillStyle = getComputedStyle(pill);
        const textNode = Array.from(pill.querySelectorAll("*")).find((node) => normalize(node.textContent)) || pill;
        const textStyle = getComputedStyle(textNode);
        const textFillColor = textStyle.webkitTextFillColor || null;
        const effectiveTextColor = textFillColor && !isTransparent(textFillColor) ? textFillColor : textStyle.color;
        return {
          text: normalize(pill.textContent),
          pillColor: pillStyle.color,
          pillOpacity: pillStyle.opacity,
          textColor: textStyle.color,
          textFillColor,
          textOpacity: textStyle.opacity,
          pillBackground: pillStyle.backgroundColor,
          surfaceBackground: surfaceStyle?.backgroundColor || null,
          textContrast: contrast(effectiveTextColor, pillStyle.backgroundColor),
          textFillTransparent: isTransparent(textFillColor),
          synthetic: synthetic.includes(pill),
          cardSurface: pill.classList.contains("composer-attachment-surface"),
          markerSurface: pill.hasAttribute("data-composer-attachment-pill"),
        };
      });
      synthetic.forEach((node) => node.remove());
      return {
        editorMounted: Boolean(editor),
        surfaceMounted: Boolean(surface),
        pillCount: pillDetails.length,
        syntheticMounted: synthetic.length > 0,
        pills: pillDetails,
      };
    };
    const jsx = (type, props, key) => {
      if (typeof type === "function") {
        if (type.prototype?.render) return { type, props: props || {}, key };
        return type(props || {});
      }
      return { type, props: props || {}, key };
    };
    const jsxs = jsx;
    const reviewDeps = {
      jsx,
      jsxs,
      Fragment: "fragment",
      createElement: (type, props, ...children) => ({ type, props: { ...(props || {}), children } }),
      React: {
        Component: class {
          constructor(props) {
            this.props = props;
            this.state = {};
          }

          setState(update) {
            this.state = {
              ...this.state,
              ...(typeof update === "function" ? update(this.state, this.props) : update),
            };
          }
        },
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
      hostConfigAtom: { auditValue: { id: "local", label: "Local", display_name: "Local", cloneHazard() {} } },
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

    if (shouldProbe("projectSelectorShortcut")) try {
      const details = checkCommon("projectSelectorShortcut");
      const codexVersion = window.CodexPlus?.config?.codexVersion || null;
      const newChatButton = Array.from(document.querySelectorAll("button,[role='button'],a")).find((button) => {
        const rect = button.getBoundingClientRect();
        const text = normalize(button.innerText || button.textContent);
        return rect.width > 0 && rect.height > 0 && (text.includes("New chat") || text.includes("New task"));
      });
      const fixtureThreadActive = Boolean(window.__CPX_AUDIT_FIXTURE_THREAD_ACTIVE__);
      if (!fixtureThreadActive) newChatButton?.click?.();
      const strictChooseProject = versionAtLeast(codexVersion, "26.623.81905") && !fixtureThreadActive;
      let chooseProjectButton = visibleChooseProjectButton();
      if (strictChooseProject && newChatButton && !chooseProjectButton) {
        const deadline = Date.now() + 30000;
        while (!chooseProjectButton && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          chooseProjectButton = visibleChooseProjectButton();
        }
      }
      if (!chooseProjectButton && strictChooseProject) {
        throw new Error(`Initial no-project composer did not show a visible Choose project button: ${JSON.stringify({ codexVersion })}`);
      }
      if (chooseProjectButton) {
        const marked = chooseProjectButton.hasAttribute("data-codex-plus-project-selector-trigger");
        dispatchPointerClick(chooseProjectButton);
        const directClick = await waitForProjectSelectorMenu();
        await closeProjectSelectorMenu();
        const commandResult = await window.CodexPlus.commands.run("codexPlus.focusProjectSelector");
        const shortcut = await waitForProjectSelectorMenu();
        await closeProjectSelectorMenu();
        if (!directClick.opened || !shortcut.opened) {
          throw new Error(`Initial no-project Choose project control did not open the project picker: ${JSON.stringify({ codexVersion, marked, directClick, commandResult, shortcut })}`);
        }
        pass("projectSelectorShortcut", { ...details, codexVersion, initialChooseProject: true, marked, directClick, commandResult, shortcut });
      } else {
        warn(
          "projectSelectorShortcut",
          "initial-choose-project-missing",
          "Initial no-project composer did not expose Choose project on this Codex version",
          { codexVersion },
        );
      }
    } catch (error) {
      fail("projectSelectorShortcut", error);
    }

    if (shouldProbe("aboutMetadata")) try {
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

    if (shouldProbe("nestedRepositories")) try {
      const details = checkCommon("nestedRepositories");
      const expectedReviewContext = window.CodexPlusHost.adapters.context.active();
      let nestedStateCalls = 0;
      const repositoryTargetRequests = [];
      const branchRequests = [];
      const branchRepos = new Set();
      const nestedReviewDeps = {
        ...reviewDeps,
        React: {
          ...reviewDeps.React,
          useState(initial) {
            nestedStateCalls += 1;
            if (nestedStateCalls === 1) {
              return [{
                main: { id: "main:/tmp/codex-plus-audit", kind: "main", path: ".", label: "Main", cwd: "/tmp/codex-plus-audit" },
                repositories: [
                  { id: "repo:pkg-a", kind: "nested", path: "pkg-a", label: "pkg-a", cwd: "/tmp/codex-plus-audit/pkg-a", root: "/tmp/codex-plus-audit/pkg-a" },
                  { id: "repo:pkg-b", kind: "configured", path: "pkg-b", label: "pkg-b", cwd: "/tmp/codex-plus-audit/pkg-b", root: "/tmp/codex-plus-audit/pkg-b" },
                ],
                warnings: [],
              }, () => {}];
            }
            return [typeof initial === "function" ? initial() : initial, () => {}];
          },
          useEffect(fn) {
            const cleanup = fn();
            if (typeof cleanup === "function") cleanup();
          },
        },
        gitRequest() {
          return {
        request(request) {
          repositoryTargetRequests.push(request);
          if (request?.method === "codex-plus-branches") {
            return Promise.resolve({ branches: [{ name: "main" }, { name: "audit-base" }, { name: "audit-shared-base" }] });
          }
          if (request?.method === "codex-plus-current-branch") {
            return Promise.resolve({ branch: "main" });
          }
          if (request?.method === "review-patch") {
            return Promise.resolve({ diff: { type: "success", unifiedDiff: "" } });
          }
          return Promise.resolve({
            main: { id: "main:/tmp/codex-plus-audit", kind: "main", path: ".", label: "Main", cwd: "/tmp/codex-plus-audit" },
            repositories: [
              { id: "repo:pkg-a", kind: "nested", path: "pkg-a", label: "pkg-a", cwd: "/tmp/codex-plus-audit/pkg-a", root: "/tmp/codex-plus-audit/pkg-a" },
              { id: "repo:pkg-b", kind: "configured", path: "pkg-b", label: "pkg-b", cwd: "/tmp/codex-plus-audit/pkg-b", root: "/tmp/codex-plus-audit/pkg-b" },
            ],
            warnings: [],
          });
        },
      };
        },
      };
      const wrapped = window.CodexPlus.ui.review.renderBody({ defaultBody: "body", props: {}, deps: nestedReviewDeps });
      const hostModuleRegistered = window.__CodexPlusRuntime.core.hostModules.has("codex-plus:native:repository-targets");
      if (wrapped === "body") throw new Error("Review body was not wrapped");
      if (!hostModuleRegistered) throw new Error("Repository-target host module is not registered");
      const repositoryTargetRequest = repositoryTargetRequests.find((request) => request?.method === "repository-targets");
      if (!repositoryTargetRequest) throw new Error("Review body did not request repository targets");
      const repositoryTargetParams = repositoryTargetRequest.params || {};
      if (repositoryTargetParams.cwd !== expectedReviewContext?.cwd) {
        throw new Error(`Repository target request used wrong cwd: ${JSON.stringify(repositoryTargetParams.cwd)}`);
      }
      if (repositoryTargetParams.hostId !== expectedReviewContext?.hostId || repositoryTargetParams.hostConfig?.id !== "local") {
        throw new Error(`Repository target request used wrong host context: ${JSON.stringify(repositoryTargetParams)}`);
      }
      if ("cloneHazard" in (repositoryTargetParams.hostConfig || {})) {
        throw new Error(`Repository target request leaked non-clone-safe host context: ${JSON.stringify(Object.keys(repositoryTargetParams.hostConfig || {}))}`);
      }
      if (repositoryTargetParams.operationSource !== "codex_plus_review") {
        throw new Error(`Repository target request used wrong operation source: ${JSON.stringify(repositoryTargetParams.operationSource)}`);
      }
      for (const request of repositoryTargetRequests) {
        if (["codex-plus-branches", "codex-plus-current-branch", "review-patch"].includes(request?.method) && "cloneHazard" in (request.params?.hostConfig || {})) {
          throw new Error(`Review Git request leaked non-clone-safe host context: ${JSON.stringify({ method: request.method, keys: Object.keys(request.params?.hostConfig || {}) })}`);
        }
        if (request?.method !== "codex-plus-branches") continue;
        branchRequests.push(request);
        if (request.params?.root) branchRepos.add(request.params.root);
        if (request.params?.operationSource !== "codex_plus_review") {
          throw new Error(`Branch request used wrong operation source: ${JSON.stringify(request.params?.operationSource)}`);
        }
      }
      if (branchRequests.length < 2 || branchRepos.size < 2) {
        throw new Error(`Nested repository branch requests were not loaded: ${JSON.stringify({ branchRequests })}`);
      }
      pass("nestedRepositories", {
        ...details,
        hostModuleRegistered,
        reviewWrapped: true,
        branchRequestCount: branchRequests.length,
        branchRequestRoots: Array.from(branchRepos),
        repositoryTargetRequest: {
          cwd: repositoryTargetParams.cwd,
          hostId: repositoryTargetParams.hostId,
          hostConfigId: repositoryTargetParams.hostConfig?.id,
          operationSource: repositoryTargetParams.operationSource,
        },
      });
    } catch (error) {
      fail("nestedRepositories", error);
    }

    if (shouldProbe("diagnosticErrors")) try {
      const details = checkCommon("diagnosticErrors");
      const rendered = window.CodexPlus.ui.errors.renderDetails({ jsx, error: new Error("boom") });
      const renderedDiagnostic = rendered?.type === "pre" && String(rendered?.props?.children || "").includes("boom");
      if (!renderedDiagnostic) throw new Error("Diagnostic error details did not render");
      pass("diagnosticErrors", { ...details, renderedDiagnostic });
    } catch (error) {
      fail("diagnosticErrors", error);
    }

    if (shouldProbe("userBubbleColors")) try {
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

    if (shouldProbe("projectColors")) try {
      const details = checkCommon("projectColors");
      const sampleProject = {
        projectId: "alpha-workspace",
        label: "alpha-workspace",
        path: "/tmp/alpha-workspace",
        repositoryData: { rootFolder: "alpha-workspace" },
      };
      const projectProps = window.CodexPlus.ui.sidebar.projectRowProps({ project: sampleProject });
      const threadProps = window.CodexPlus.ui.sidebar.threadRowProps({ project: sampleProject });
      const bubbleProps = window.CodexPlus.ui.message.userBubbleProps({ project: sampleProject });
      const composerProps = window.CodexPlus.ui.composer.surfaceProps({ project: sampleProject });
      const accent = projectProps?.style?.["--codex-plus-project-accent"];
      const matchingProps = [threadProps, bubbleProps, composerProps].every((props) =>
        props?.style?.["--codex-plus-project-accent"] === accent);
      const expandedProjects = await expandProjectRows();
      const liveProjectRows = Array.from(document.querySelectorAll("[data-app-action-sidebar-project-row][data-codex-plus-project-color]"));
      const liveRows = Array.from(document.querySelectorAll("[data-codex-plus-project-color]"));
      const liveAccents = liveRows.map((row) => getComputedStyle(row).getPropertyValue("--codex-plus-project-accent").trim()).filter(Boolean);
      const liveProjectAccents = liveProjectRows.map((row) => getComputedStyle(row).getPropertyValue("--codex-plus-project-accent").trim()).filter(Boolean);
      const standaloneThreadX = visibleElements("[data-app-action-sidebar-thread-row][data-codex-plus-project-sidebar-color]")
        .filter((row) => !row.closest("[data-app-action-sidebar-project-list-id]"))
        .map((row) => row.getBoundingClientRect().x)
        .sort((left, right) => left - right)[0];
      const projectlessChatRow = await waitForProjectlessChatRow();
      const projectlessChatComputed = projectlessChatRow ? getComputedStyle(projectlessChatRow) : null;
      const projectlessChat = projectlessChatRow ? {
        marked: projectlessChatRow.hasAttribute("data-codex-plus-project-sidebar-color"),
        accent: projectlessChatComputed.getPropertyValue("--codex-plus-project-accent").trim(),
        background: projectlessChatComputed.backgroundColor,
        title: rowTitle(projectlessChatRow),
      } : null;
      const chatSectionProjectlessRows = await waitForProjectlessRowsInChatsSection();
      const standaloneFixtureRows = visibleElements("[data-app-action-sidebar-thread-row]")
        .map((row) => {
          const computed = getComputedStyle(row);
          return {
            accent: computed.getPropertyValue("--codex-plus-project-accent").trim(),
            background: computed.backgroundColor,
            marked: row.hasAttribute("data-codex-plus-project-sidebar-color"),
            title: rowTitle(row),
          };
        })
        .filter((row) =>
          row.title.includes("Fixture: no project chat") ||
          row.title.includes("Fixture: main repo path header") ||
          row.title.includes("Fixture: pinned thread with color") ||
          row.title.includes("Fixture: nested repos before branch selection")
        );
      const unstyledStandaloneRows = standaloneFixtureRows.filter((row) =>
        !row.marked || !row.accent || isTransparentColor(row.background)
      );
      const projectThreadRowCount = await waitForProjectThreadRows();
      let selectedProjectAccent = "";
      let mountedComposer = null;
      const unstyledProjectThreadLists = Array.from(document.querySelectorAll("[data-app-action-sidebar-project-list-id]"))
        .map((list) => {
          const projectId = list.getAttribute("data-app-action-sidebar-project-list-id") || "";
          const projectRow = document.querySelector(`[data-app-action-sidebar-project-row][data-app-action-sidebar-project-id="${CSS.escape(projectId)}"]`);
          const threadRows = Array.from(list.querySelectorAll("[data-app-action-sidebar-thread-row]"));
          if (!projectRow || threadRows.length === 0) return null;
          const projectAccent = getComputedStyle(projectRow).getPropertyValue("--codex-plus-project-accent").trim();
          const listComputed = getComputedStyle(list);
          const listAccent = listComputed.getPropertyValue("--codex-plus-project-accent").trim();
          const listBackground = listComputed.backgroundColor;
          const listRailWidth = Number.parseFloat(listComputed.borderLeftWidth || "0");
          const projectX = projectRow.getBoundingClientRect().x;
          const listX = list.getBoundingClientRect().x;
          const alignedWithStandaloneRows = standaloneThreadX == null ||
            (Math.abs(projectX - standaloneThreadX) <= 1 && Math.abs(listX - standaloneThreadX) <= 1);
          if (!selectedProjectAccent) {
            selectedProjectAccent = projectAccent;
            threadRows[0].click();
          }
          const unstyledRows = threadRows.filter((row) => {
            const computed = getComputedStyle(row);
            const rowAccent = computed.getPropertyValue("--codex-plus-project-accent").trim();
            const rowRailWidth = Number.parseFloat(computed.borderLeftWidth || "0");
            return rowAccent !== projectAccent || isTransparentColor(computed.backgroundColor) || rowRailWidth !== 0;
          });
          const activeRowsWithoutSelectionRail = threadRows
            .filter((row) => row.getAttribute("data-app-action-sidebar-thread-active") === "true")
            .filter((row) => !/inset/.test(getComputedStyle(row).boxShadow));
          return list.hasAttribute("data-codex-plus-project-sidebar-color") &&
            listAccent === projectAccent &&
            listRailWidth === 6 &&
            alignedWithStandaloneRows &&
            !isTransparentColor(listBackground) &&
            unstyledRows.length === 0 &&
            activeRowsWithoutSelectionRail.length === 0
            ? null
            : {
                hasProjectRow: Boolean(projectRow),
                accentMatched: listAccent === projectAccent,
                listRailWidth,
                projectX,
                listX,
                standaloneThreadX,
                alignedWithStandaloneRows,
                listBackgroundTransparent: isTransparentColor(listBackground),
                threadRows: threadRows.length,
                unstyledRows: unstyledRows.length,
                activeRowsWithoutSelectionRail: activeRowsWithoutSelectionRail.length,
                listMarked: list.hasAttribute("data-codex-plus-project-sidebar-color"),
              };
        })
        .filter(Boolean);
      if (!selectedProjectAccent) {
        const projectThread = visibleElements("[data-app-action-sidebar-thread-row][data-codex-plus-project-sidebar-color]")
          .find((row) => !rowTitle(row).includes("Fixture: no project chat"));
        if (projectThread) {
          const computed = getComputedStyle(projectThread);
          selectedProjectAccent = computed.getPropertyValue("--codex-plus-project-accent").trim();
          projectThread.click();
        }
      }
      const projectNewChatButton = visibleElements("button[aria-label^='Start new chat in ']")[0];
      if (projectNewChatButton) {
        const label = projectNewChatButton.getAttribute("aria-label").replace(/^Start new chat in\s*/, "").trim();
        const projectRow = Array.from(document.querySelectorAll("[data-app-action-sidebar-project-row][data-app-action-sidebar-project-label]"))
          .find((row) => row.getAttribute("data-app-action-sidebar-project-label") === label);
        if (projectRow) selectedProjectAccent = getComputedStyle(projectRow).getPropertyValue("--codex-plus-project-accent").trim();
        projectNewChatButton.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
        projectNewChatButton.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
        projectNewChatButton.click();
      }
      const expectedComposerAccents = Array.from(new Set([selectedProjectAccent, ...liveAccents])).filter(Boolean);
      if (expectedComposerAccents.length > 0) mountedComposer = await waitForMountedProjectComposer(expectedComposerAccents);
      if (!accent) throw new Error("Project accent was not computed");
      if (!matchingProps) throw new Error("Project, thread, bubble, and composer props do not share an accent");
      const chatGptFamily = window.CodexPlus?.config?.sourceFamily === "chatgpt";
      const minimumProjectRows = chatGptFamily ? 6 : 10;
      const minimumProjectAccents = chatGptFamily ? 4 : 6;
      if (liveProjectRows.length < minimumProjectRows) throw new Error(`Expected at least ${minimumProjectRows} styled project rows, found ${liveProjectRows.length}`);
      if (new Set(liveProjectAccents).size < minimumProjectAccents) throw new Error(`Expected at least ${minimumProjectAccents} distinct project accents, found ${new Set(liveProjectAccents).size}`);
      if (!projectlessChat?.marked || !projectlessChat?.accent || isTransparentColor(projectlessChat?.background)) {
        const rowTitles = visibleElements("[data-app-action-sidebar-thread-row]").map(rowTitle).slice(0, 12);
        throw new Error(`Projectless chat row is not styled: ${JSON.stringify({ projectlessChat, rowTitles })}`);
      }
      if (!chatGptFamily && (chatSectionProjectlessRows.length !== 3 || chatSectionProjectlessRows.some((row) => row.pinned))) {
        throw new Error(`Expected the three unpinned fixture no-project chats in the Chats section: ${JSON.stringify(chatSectionProjectlessRows)}`);
      }
      if (standaloneFixtureRows.filter((row) => row.title.includes("Fixture: no project chat")).length !== 5) {
        throw new Error(`Expected all five fixture no-project chats across the sidebar: ${JSON.stringify(standaloneFixtureRows)}`);
      }
      if (unstyledStandaloneRows.length > 0) {
        throw new Error(`Pinned or projectless fixture rows are not styled: ${JSON.stringify(unstyledStandaloneRows.slice(0, 8))}`);
      }
      if (unstyledProjectThreadLists.length > 0) {
        throw new Error(`Project sidebar child rows or list containers are not styled like their project rows: ${JSON.stringify(unstyledProjectThreadLists.slice(0, 4))}`);
      }
      const composerObserved = Boolean(mountedComposer?.marked || mountedComposer?.projectMarked || mountedComposer?.accent || mountedComposer?.boxShadow);
      if (composerObserved && (!mountedComposer?.marked || !mountedComposer?.projectMarked || !expectedComposerAccents.includes(mountedComposer?.accent))) {
        throw new Error(`Mounted composer does not carry the selected project accent: ${JSON.stringify(mountedComposer)}`);
      }
      if (composerObserved && mountedComposer.cornerRadii.some((radius) => radius <= 0)) {
        throw new Error(`Mounted composer lost its rounded shape: ${JSON.stringify(mountedComposer)}`);
      }
      if (!composerObserved) {
        warn(
          "projectColors",
          "composer-not-mounted",
          "Project composer was not mounted during the in-page project color probe",
          mountedComposer,
        );
      }
      pass("projectColors", {
        ...details,
        accent,
        matchingProps,
        liveProjectRows: liveProjectRows.length,
        liveProjectAccents: Array.from(new Set(liveProjectAccents)).slice(0, 12),
        liveRows: liveRows.length,
        liveAccents: Array.from(new Set(liveAccents)).slice(0, 8),
        expandedProjects,
        projectlessChat,
        chatSectionProjectlessRows,
        standaloneFixtureRows: standaloneFixtureRows.slice(0, 8),
        styledProjectThreadLists: projectThreadRowCount,
        projectChildRowsAvailable: projectThreadRowCount > 0,
        mountedComposer,
      });
    } catch (error) {
      fail("projectColors", error);
    }

    if (shouldProbe("projectPathHeader")) try {
      const details = checkCommon("projectPathHeader");
      const plugin = window.CodexPlus.plugins.get("projectPathHeader");
      const accessory = plugin?.exports?.ProjectPathAccessory?.({ context: { cwd: "/tmp/example" }, jsx, jsxs });
      const headerAccessory = plugin?.exports?.ProjectPathAccessory?.({
        context: {
          routeId: "fixture-header-route",
          threadId: "fixture-header-thread",
          cwd: "/tmp/header-project",
          workspaceRoot: "/tmp/header-project",
          gitRoot: "/tmp/header-project",
          hostId: "fixture-header-host",
          branchName: "main",
          sourceProject: "fixture-header-project",
        },
        jsx,
        jsxs,
      });
      const missing = plugin?.exports?.ProjectPathAccessory?.({ context: {}, jsx, jsxs });
      if (accessory == null) throw new Error("Project path accessory was not rendered for cwd");
      if (headerAccessory == null) throw new Error("Project path accessory was not rendered for normalized context");
      if (headerAccessory?.props?.title !== "/tmp/header-project") {
        throw new Error(`Project path accessory used wrong header path: ${JSON.stringify(headerAccessory?.props?.title)}`);
      }
      if (missing != null) throw new Error("Project path accessory rendered without cwd");
      const fixtureThreadRow = findFixtureProjectThreadRow();
      if (!fixtureThreadRow) throw new Error("Fixture project thread row was not found");
      const liveChip = await waitForLiveProjectPathChip(plugin);
      const liveChipTitle = liveChip?.getAttribute("title") || "";
      const liveChipText = normalize(liveChip?.textContent);
      const composerChipCount = visibleElements("[data-codex-plus-project-path-header]")
        .filter((chip) => chip.closest("[data-codex-composer], [data-codex-plus-user-entry], .composer-surface-chrome, form"))
        .length;
      if (!liveChip || !liveChipTitle.includes("fixture-workspaces")) {
        throw new Error(`Project path header chip was not visible in the thread header for the fixture project: ${JSON.stringify({ liveChipTitle, liveChipText, composerChipCount })}`);
      }
      if (composerChipCount > 0) {
        throw new Error(`Project path header chip should not render in the main composer: ${JSON.stringify({ composerChipCount, liveChipTitle, liveChipText })}`);
      }
      const header = liveChip.closest("header");
      const headerText = normalize(header?.textContent);
      const chipIndex = headerText.indexOf(liveChipText);
      const titleIndex = headerText.indexOf("Fixture:");
      const titleBeforeChip = titleIndex >= 0 && chipIndex >= 0 && titleIndex < chipIndex;
      if (titleIndex < 0 || chipIndex < 0) {
        throw new Error(`Project path header chip should share the thread header with the title: ${JSON.stringify({ headerText, chipIndex, titleIndex, liveChipText })}`);
      }
      if (!titleBeforeChip) {
        throw new Error(`Project path header chip should appear after the thread title: ${JSON.stringify({ headerText, chipIndex, titleIndex, liveChipText })}`);
      }
      pass("projectPathHeader", {
        ...details,
        renderedForCwd: true,
        renderedForHeaderProjectPath: true,
        skippedMissingCwd: true,
        liveChipTitle,
        liveChipText,
        composerChipCount,
        titleBeforeChip,
      });
    } catch (error) {
      fail("projectPathHeader", error);
    }

    if (shouldProbe("audit")) try {
      const status = composerPermissionPickerStatus();
      if (status.editorMounted && status.editorEditable && status.triggerMounted) {
        const ariaDisabled = status.triggerAriaDisabled === "true";
        const visuallyDisabled = /\bopacity-40\b/.test(status.triggerClassName);
        if (status.triggerDisabled || ariaDisabled || visuallyDisabled) {
          warn(
            "audit",
            "composer-permission-picker-disabled",
            "Composer permissions picker is disabled while the composer is editable",
            status,
          );
        } else {
          const lowOpacity = Number(status.triggerOpacity) < 0.5;
          const lowContrast = status.triggerContrast != null && status.triggerContrast < 4.5;
          if (lowOpacity || lowContrast || status.labelTextFillTransparent) {
            throw new Error(`Composer permissions picker text is unreadable: ${JSON.stringify(status)}`);
          }
        }
      }
      if (status.editorMounted && !status.triggerMounted) {
        throw new Error(`Composer permissions picker was not found: ${JSON.stringify(status)}`);
      }
      if (!status.editorMounted) {
        warn(
          "audit",
          "composer-not-mounted",
          "Composer was not mounted during the in-page permissions picker probe",
          status,
        );
      }
      pass("audit", { composerPermissionPicker: status });
    } catch (error) {
      fail("audit", error);
    }

    if (shouldProbe("audit")) try {
      const status = composerContrastStatus();
      if (status.surfaceMounted) {
        if (status.occludingDescendants.length > 0) {
          throw new Error(`Composer custom color is covered by a differently colored child surface: ${JSON.stringify(status)}`);
        }
        const unreadable = status.checks.find((check) =>
          Number(check.opacity) < 0.99 ||
          check.textFillTransparent ||
          (check.contrast != null && check.contrast < 4.5) ||
          (check.iconContrast != null && check.iconContrast < 4.5)
        );
        if (unreadable) {
          throw new Error(`Composer rich content or control is unreadable: ${JSON.stringify({ ...status, unreadable })}`);
        }
      }
      if (status.editorMounted && !status.surfaceMounted) {
        warn(
          "audit",
          "composer-entry-surface-not-mounted",
          "Composer entry surface was not mounted during the composer control contrast probe",
          status,
        );
      }
      if (!status.editorMounted) {
        warn(
          "audit",
          "composer-not-mounted",
          "Composer was not mounted during the composer control contrast probe",
          status,
        );
      }
      pass("audit", { composerControlContrast: status });
    } catch (error) {
      fail("audit", error);
    }

    if (shouldProbe("audit")) try {
      const status = userBubbleShapeStatus();
      if (status.bubbleMounted && status.wrapperMounted && !status.wrapperBackgroundTransparent) {
        throw new Error(`User message wrapper painted behind the rounded bubble: ${JSON.stringify(status)}`);
      }
      if (status.bubbleMounted && status.cornerRadius <= 0) {
        throw new Error(`User message bubble lost its rounded shape: ${JSON.stringify(status)}`);
      }
      if (status.decorationsMounted && !status.decorationsUseMutedForeground) {
        throw new Error(`User message decorations do not use the transcript muted foreground: ${JSON.stringify(status)}`);
      }
      if (!status.bubbleMounted) {
        warn("audit", "user-message-bubble-not-mounted", "User message bubble was not mounted during the shape probe", status);
      }
      pass("audit", { userBubbleShape: status });
    } catch (error) {
      fail("audit", error);
    }

    if (shouldProbe("audit")) try {
      const status = composerAttachmentPillStatus();
      if (status.surfaceMounted) {
        if (status.pillCount === 0) {
          throw new Error(`Composer attachment pill was not testable: ${JSON.stringify(status)}`);
        }
        const unreadable = status.pills.find((pill) =>
          Number(pill.pillOpacity) < 0.99 ||
          Number(pill.textOpacity) < 0.99 ||
          pill.textFillTransparent ||
          (pill.textContrast != null && pill.textContrast < 4.5)
        );
        if (unreadable) {
          throw new Error(`Composer attachment pill text is unreadable: ${JSON.stringify({ ...status, unreadable })}`);
        }
      }
      if (status.editorMounted && !status.surfaceMounted) {
        warn(
          "audit",
          "composer-entry-surface-not-mounted",
          "Composer entry surface was not mounted during the attachment pill contrast probe",
          status,
        );
      }
      if (!status.editorMounted) {
        warn(
          "audit",
          "composer-not-mounted",
          "Composer was not mounted during the attachment pill contrast probe",
          status,
        );
      }
      pass("audit", { composerAttachmentPill: status });
    } catch (error) {
      fail("audit", error);
    }

    if (shouldProbe("sidebarNameBlur")) try {
      const details = checkCommon("sidebarNameBlur");
      const metadata = window.CodexPlus.ui.commands.commandMetadata().some((command) => command.id === "codexPlusToggleSidebarNameBlur");
      if (!metadata) throw new Error("Sidebar blur command metadata is missing");
      const root = document.documentElement;
      const previous = root.getAttribute("data-codex-plus-sidebar-names-blurred");
      let toggled = false;
      let filter = "";
      let rowFilter = null;
      let scrollFilter = null;
      try {
        root.removeAttribute("data-codex-plus-sidebar-names-blurred");
        window.CodexPlus.commands.run("codexPlusToggleSidebarNameBlur");
        toggled = root.getAttribute("data-codex-plus-sidebar-names-blurred") === "true";
        const probe = document.createElement("span");
        probe.setAttribute("data-codex-plus-sidebar-name", "");
        probe.textContent = "probe";
        document.body.appendChild(probe);
        filter = getComputedStyle(probe).filter;
        probe.remove();
        const scroll = visibleElements("[data-app-action-sidebar-scroll]")[0];
        if (scroll) scrollFilter = getComputedStyle(scroll).filter;
        const row = visibleElements("[data-app-action-sidebar-thread-row], [data-app-action-sidebar-project-row]")[0];
        if (row) rowFilter = getComputedStyle(row).filter;
      } finally {
        if (previous == null) root.removeAttribute("data-codex-plus-sidebar-names-blurred");
        else root.setAttribute("data-codex-plus-sidebar-names-blurred", previous);
      }
      if (!toggled) throw new Error("Sidebar blur command did not toggle the root marker");
      if (!String(filter).includes("blur")) throw new Error("Sidebar blur computed style is not active");
      if (!String(rowFilter).includes("blur")) {
        throw new Error(`Sidebar blur computed style is not active on a visible project or thread row: ${JSON.stringify({ scrollFilter, rowFilter })}`);
      }
      if (String(scrollFilter).includes("blur")) {
        throw new Error(`Sidebar blur should not blur the entire visible sidebar scroll container: ${JSON.stringify({ scrollFilter, rowFilter })}`);
      }
      const restored = root.getAttribute("data-codex-plus-sidebar-names-blurred") === previous;
      if (!restored) throw new Error("Sidebar blur probe did not restore its previous state");
      pass("sidebarNameBlur", { ...details, metadata, toggled, filter, rowFilter, scrollFilter, restored });
    } catch (error) {
      fail("sidebarNameBlur", error);
    }

    if (shouldProbe("devTools")) try {
      const details = checkCommon("devTools");
      const metadata = window.CodexPlus.ui.commands.commandMetadata().some((command) => command.id === "codexPlusOpenDevTools");
      if (!metadata) throw new Error("DevTools command metadata is missing");
      if (options.includeNativeOpenProbes) {
        const result = await window.CodexPlus.commands.run("codexPlusOpenDevTools");
        if (!result?.ok) throw new Error(`DevTools command returned ${JSON.stringify(result)}`);
        pass("devTools", { ...details, metadata, nativeOpenProbe: true, result });
      } else {
        pass("devTools", { ...details, metadata, nativeOpenProbe: false });
      }
    } catch (error) {
      fail("devTools", error);
    }

    if (shouldProbe("projectSelectorShortcut")) try {
      const details = checkCommon("projectSelectorShortcut");
      const queryFor = (label) => {
        const letters = Array.from(label.toLowerCase()).filter((char) => /[a-z]/.test(char));
        return [0, 4, 8].map((index) => letters[index]).filter(Boolean).join("");
      };
      const projects = [
        { projectId: "alpha-workspace", label: "alpha-workspace", repositoryData: { rootFolder: "alpha-workspace" } },
        { projectId: "beta-service", label: "beta-service", repositoryData: { rootFolder: "beta-service" } },
        { projectId: "gamma-tools", label: "gamma-tools", repositoryData: { rootFolder: "gamma-tools" } },
      ];
      const targetProject = projects[1];
      const query = queryFor(targetProject.label);
      const ranked = window.CodexPlus.ui.projectSelector.fuzzyFilter(projects, query).map((project) => project.projectId);
      const highlight = window.CodexPlus.ui.projectSelector.fuzzyHighlight({ text: targetProject.label, query, jsx });
      const highlightCount = Array.isArray(highlight) ? highlight.filter((part) => part?.type === "strong").length : 0;
      const rankedProjects = window.CodexPlus.ui.projectSelector.fuzzyFilter(projects, query);
      const selected = [];
      const events = [];
      window.CodexPlusHost.adapters.projectSelector.acceptFirst(
        { key: "Enter", preventDefault() { events.push("preventDefault"); }, stopPropagation() { events.push("stopPropagation"); } },
        rankedProjects,
        (projectId) => selected.push(projectId),
        query,
      );
      if (ranked[0] !== targetProject.projectId) throw new Error(`Fuzzy ranking returned ${ranked.join(", ")}`);
      if (highlightCount === 0) throw new Error("Fuzzy match highlight did not render");
      if (selected[0] !== targetProject.projectId || events.length !== 2) throw new Error("Enter-to-first-result adapter did not select first ranked result");
      document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }));
      const triggerCount = document.querySelectorAll("[data-codex-plus-project-selector-trigger]").length;
      const syntheticShortcut = await new Promise((resolve) => {
        const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: ".", metaKey: true });
        document.dispatchEvent(event);
        const startedAt = Date.now();
        const check = () => {
          const searchInput = document.querySelector("input[placeholder='Search projects']");
          const menu = document.querySelector("[data-radix-menu-content], [data-radix-popper-content-wrapper], [role='menu']");
          if (!searchInput && !menu && Date.now() - startedAt < 3000) {
            setTimeout(check, 100);
            return;
          }
          resolve({
            defaultPrevented: event.defaultPrevented,
            opened: Boolean(searchInput || menu),
            activePlaceholder: document.activeElement?.getAttribute?.("placeholder") ?? "",
          });
        };
        setTimeout(check, 100);
      });
      document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }));
      if (!syntheticShortcut.opened && versionAtLeast(window.CodexPlus?.config?.codexVersion, "26.623.81905")) {
        warn(
          "projectSelectorShortcut",
          "synthetic-shortcut-not-opened",
          "Untrusted in-page Cmd+. did not open the project selector; the CDP keyboard verifier is the product proof.",
          syntheticShortcut,
        );
      }
      pass("projectSelectorShortcut", { ...details, ranked, highlightCount, selected, triggerCount, syntheticShortcut });
    } catch (error) {
      fail("projectSelectorShortcut", error);
    }

    if (shouldProbe("mermaidFullscreen")) try {
      const details = checkCommon("mermaidFullscreen");
      const diagramProps = window.CodexPlus.ui.mermaid.diagramProps({ code: "graph TD;A-->B" });
      const marker = Object.prototype.hasOwnProperty.call(diagramProps || {}, "data-codex-plus-mermaid-diagram");
      if (!marker) throw new Error("Mermaid diagram marker is missing");
      const plugin = window.CodexPlus.plugins.get("mermaidFullscreen");
      const container = document.createElement("div");
      container.setAttribute("data-markdown-copy", "code-block");
      const diagram = document.createElement("div");
      diagram.setAttribute("data-codex-plus-mermaid-diagram", "");
      const source = document.createElement("pre");
      source.className = "sr-only";
      source.textContent = "graph TD;A-->B";
      container.appendChild(diagram);
      container.appendChild(source);
      document.body.appendChild(container);
      plugin?.exports?.decorateAll?.(document);
      const buttonRendered = Boolean(container.querySelector(":scope > .codex-plus-mermaid-expand-button"));
      container.remove();
      if (!buttonRendered) throw new Error("Mermaid expand button did not render");
      plugin?.exports?.decorateAll?.(document);
      const liveDiagrams = Array.from(document.querySelectorAll('[data-codex-plus-mermaid-diagram], [aria-label="Mermaid diagram"][role="img"]'))
        .filter((element) => element.querySelector("svg") || element.getAttribute("aria-label") === "Mermaid diagram");
      const liveMissingButtons = liveDiagrams.filter((element) => {
        const host = element.closest('[data-markdown-copy="code-block"]') || element;
        return !host.querySelector(":scope > .codex-plus-mermaid-expand-button");
      });
      if (liveMissingButtons.length > 0) throw new Error(`Live Mermaid diagrams missing popout buttons: ${liveMissingButtons.length}`);
      if (options.includeNativeOpenProbes) {
        const nativeResult = await window.CodexPlus.native.request("mermaid/openViewer", {
          html: "<!doctype html><meta charset='utf-8'><title>Codex Plus Mermaid Audit</title><div>ok</div>",
        });
        if (!nativeResult?.ok) throw new Error(`Mermaid native viewer returned ${JSON.stringify(nativeResult)}`);
        pass("mermaidFullscreen", { ...details, marker, buttonRendered, liveDiagramCount: liveDiagrams.length, nativeOpenProbe: true, nativeResult });
      } else {
        pass("mermaidFullscreen", { ...details, marker, buttonRendered, liveDiagramCount: liveDiagrams.length, nativeOpenProbe: false });
      }
    } catch (error) {
      fail("mermaidFullscreen", error);
    }

    if (shouldProbe("aharnessRuns")) try {
      const details = checkCommon("aharnessRuns");
      const waitForAharness = async (selector, timeoutMs = 20000) => {
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeoutMs) {
          const element = document.querySelector(selector);
          if (element && visible(element)) return element;
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        return document.querySelector(selector);
      };
      const press = (element) => {
        if (!element) return false;
        for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
          element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, button: 0 }));
        }
        return true;
      };
      const commandIds = window.CodexPlus.ui.commands.commandMetadata().map((command) => command.id);
      const hasOpenCommand = commandIds.includes("codexPlusAharnessOpenRuns");
      const hasRunCommand = commandIds.includes("codexPlusAharnessRunWorkflow");
      const menuItems = typeof window.CodexPlus.commands.menuItems === "function"
        ? window.CodexPlus.commands.menuItems("panels")
        : [];
      const hasMenuItem = menuItems.some((item) => item.id === "codexPlusAharnessOpenRuns");
      const listResult = await window.CodexPlus.native.request("aharness/commands/list", {});
      if (!hasOpenCommand || !hasRunCommand) throw new Error(`Aharness command metadata missing: ${JSON.stringify({ hasOpenCommand, hasRunCommand })}`);
      if (!hasMenuItem) throw new Error("Aharness native menu item is missing");
      if (!listResult?.ok || !Array.isArray(listResult.commands)) throw new Error(`Aharness command list failed: ${JSON.stringify(listResult)}`);
      const fsmRows = await waitForAharness("#codex-plus-aharness-sidebar [data-codex-plus-aharness-fsm-row]");
      if (!fsmRows) throw new Error("Harness Runs FSM rows are missing");
      const sidebarTextBeforeRun = normalize(document.querySelector("#codex-plus-aharness-sidebar")?.textContent || "");
      if (!sidebarTextBeforeRun.includes("aharness-examples")) throw new Error(`Harness Runs did not include configured aharness project: ${sidebarTextBeforeRun}`);
      for (const label of ["Color funnel", "Ops clear demo", "Trivia rounds", "Adventure", "Await checkpoints", "Pirate roast", "Composed pipeline", "Approval policy", "Coding smoke"]) {
        if (!sidebarTextBeforeRun.includes(label)) throw new Error(`Harness Runs did not include FSM ${label}: ${sidebarTextBeforeRun}`);
      }
      if (sidebarTextBeforeRun.includes("alpha-main")) throw new Error(`Harness Runs included unconfigured alpha-main project: ${sidebarTextBeforeRun}`);
      const directText = (element) => Array.from(element?.childNodes || [])
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent || "")
        .join("")
        .trim();
      const visibleOwnText = (text) => Array.from(document.querySelectorAll("h1,h2,h3,p,div,span"))
        .find((element) => directText(element) === text && visible(element));
      const harnessSidebar = document.querySelector("#codex-plus-aharness-sidebar");
      const pinnedHeading = visibleOwnText("Pinned");
      const projectsHeading = visibleOwnText("Projects");
      if (!harnessSidebar) throw new Error("Harness Runs sidebar section is missing");
      if (pinnedHeading && projectsHeading) {
        const harnessRect = harnessSidebar.getBoundingClientRect();
        const pinnedRect = pinnedHeading.getBoundingClientRect();
        const projectsRect = projectsHeading.getBoundingClientRect();
        if (Math.abs(harnessRect.left - pinnedRect.left) > 24 || Math.abs(harnessRect.left - projectsRect.left) > 24) {
          throw new Error(`Harness Runs sidebar section is in a separate column: ${JSON.stringify({ harnessLeft: harnessRect.left, pinnedLeft: pinnedRect.left, projectsLeft: projectsRect.left })}`);
        }
        const pinnedBeforeHarness = Boolean(pinnedHeading.compareDocumentPosition(harnessSidebar) & Node.DOCUMENT_POSITION_FOLLOWING);
        const harnessBeforeProjects = Boolean(harnessSidebar.compareDocumentPosition(projectsHeading) & Node.DOCUMENT_POSITION_FOLLOWING);
        if (!pinnedBeforeHarness || !harnessBeforeProjects) {
          throw new Error(`Harness Runs sidebar section is not between Pinned and Projects: ${JSON.stringify({ pinnedBeforeHarness, harnessBeforeProjects })}`);
        }
      }
      const waitForHarnessProjectColor = async (timeoutMs = 10000) => {
        const startedAt = Date.now();
        let last = null;
        while (Date.now() - startedAt < timeoutMs) {
          const harnessProjectRow = document.querySelector("#codex-plus-aharness-sidebar [data-codex-plus-aharness-project-row]");
          const nativeAharnessProjectRow = document.querySelector('[data-app-action-sidebar-project-row][data-app-action-sidebar-project-label="aharness-examples"]');
          if (harnessProjectRow && nativeAharnessProjectRow) {
            const harnessProjectStyle = getComputedStyle(harnessProjectRow);
            const nativeProjectStyle = getComputedStyle(nativeAharnessProjectRow);
            last = {
              harnessProjectRow,
              nativeAharnessProjectRow,
              harnessProjectStyle,
              nativeProjectStyle,
              harnessAccent: harnessProjectStyle.getPropertyValue("--codex-plus-project-accent").trim(),
              nativeAccent: nativeProjectStyle.getPropertyValue("--codex-plus-project-accent").trim(),
              harnessBackground: harnessProjectStyle.backgroundColor,
              nativeBackground: nativeProjectStyle.backgroundColor,
            };
            if (
              last.harnessAccent &&
              last.harnessAccent === last.nativeAccent &&
              last.harnessBackground === last.nativeBackground
            ) return last;
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        return last;
      };
      const colorMatch = await waitForHarnessProjectColor();
      const harnessProjectRow = colorMatch?.harnessProjectRow;
      const nativeAharnessProjectRow = colorMatch?.nativeAharnessProjectRow;
      if (!harnessProjectRow || !nativeAharnessProjectRow) throw new Error("Could not compare aharness project row coloring with the native project row");
      const aharnessProjectCwd = harnessProjectRow.closest("[data-codex-plus-aharness-project]")?.getAttribute("data-codex-plus-aharness-project");
      if (!aharnessProjectCwd) throw new Error("Harness project group is missing its project path");
      const verifyResult = await window.CodexPlus.native.request("aharness/verify", {
        target: "examples/color-funnel.fsm.ts",
        cwd: aharnessProjectCwd,
      });
      if (!verifyResult?.ok || !verifyResult.result?.ok) throw new Error(`Aharness verify failed: ${JSON.stringify(verifyResult)}`);
      const harnessProjectStyle = colorMatch.harnessProjectStyle;
      const nativeProjectStyle = colorMatch.nativeProjectStyle;
      const harnessAccent = colorMatch.harnessAccent;
      const nativeAccent = colorMatch.nativeAccent;
      if (!harnessProjectRow.hasAttribute("data-codex-plus-project-sidebar-color")) throw new Error("Harness project row is missing project sidebar color attributes");
      if (!harnessAccent || harnessAccent !== nativeAccent) throw new Error(`Harness project row accent does not match native project row: ${harnessAccent} vs ${nativeAccent}`);
      if (colorMatch.harnessBackground !== colorMatch.nativeBackground) {
        throw new Error(`Harness project row background does not match native project row: ${colorMatch.harnessBackground} vs ${colorMatch.nativeBackground}`);
      }
      const colorRow = document.querySelector('#codex-plus-aharness-sidebar [data-codex-plus-aharness-fsm-row="examples/color-funnel.fsm.ts"]');
      if (!colorRow) throw new Error("Color funnel FSM row is missing");
      const harnessProjectChildren = colorRow.closest(".cpx-sidebar-model-children");
      const harnessProjectChildrenStyle = getComputedStyle(harnessProjectChildren || document.body);
      const harnessProjectChildrenBorder = harnessProjectChildrenStyle.borderLeftWidth;
      const harnessProjectChildrenAccent = harnessProjectChildrenStyle.getPropertyValue("--codex-plus-project-accent").trim();
      if (!harnessProjectChildren || Number.parseFloat(harnessProjectChildrenBorder || "0") < 4 || harnessProjectChildrenAccent !== harnessAccent) {
        throw new Error(`Harness project children do not continue the left accent strip: ${JSON.stringify({
          className: harnessProjectChildren?.className || "",
          borderLeftWidth: harnessProjectChildrenBorder,
          childAccent: harnessProjectChildrenAccent,
          harnessAccent,
        })}`);
      }
      const colorTitle = colorRow.querySelector(".cpx-sidebar-model-text strong");
      const colorDescription = colorRow.querySelector(".cpx-sidebar-model-text small");
      if (!colorTitle || !colorDescription) throw new Error("Color funnel FSM title or description marker is missing");
      const titleLeft = Math.round(colorTitle.getBoundingClientRect().left);
      const descriptionLeft = Math.round(colorDescription.getBoundingClientRect().left);
      if (Math.abs(titleLeft - descriptionLeft) > 1) {
        throw new Error(`Aharness FSM description is not aligned with title: ${descriptionLeft} vs ${titleLeft}`);
      }
      const previousSidebarBlur = document.documentElement.getAttribute("data-codex-plus-sidebar-names-blurred");
      document.documentElement.setAttribute("data-codex-plus-sidebar-names-blurred", "true");
      const blurredHarnessFilter = getComputedStyle(colorRow).filter;
      if (previousSidebarBlur == null) document.documentElement.removeAttribute("data-codex-plus-sidebar-names-blurred");
      else document.documentElement.setAttribute("data-codex-plus-sidebar-names-blurred", previousSidebarBlur);
      if (!String(blurredHarnessFilter || "").includes("blur")) {
        throw new Error(`Sidebar blur does not apply to aharness rows: ${blurredHarnessFilter}`);
      }
      const createButton = colorRow.querySelector(".cpx-sidebar-model-create");
      if (!createButton) throw new Error("Color funnel FSM create button is missing");
      if (normalize(createButton.textContent || "").includes("Create")) throw new Error("Aharness FSM create affordance still uses text instead of the create icon");
      if (!createButton.querySelector("svg")) throw new Error("Aharness FSM create affordance did not render the create icon");
      const createButtonStyle = getComputedStyle(createButton);
      const createBorderWidths = [
        createButtonStyle.borderTopWidth,
        createButtonStyle.borderRightWidth,
        createButtonStyle.borderBottomWidth,
        createButtonStyle.borderLeftWidth,
      ].map((value) => Number.parseFloat(value || "0"));
      if (createBorderWidths.some((value) => Number.isFinite(value) && value > 0)) {
        throw new Error(`Aharness FSM create icon still has a button border: ${createButtonStyle.border}`);
      }
      press(createButton);
      const runRow = await waitForAharness("#codex-plus-aharness-sidebar [data-codex-plus-aharness-run-row]");
      if (!runRow) throw new Error("Harness Runs nested run row did not appear");
      const runRowBullet = runRow.querySelector(".cpx-sidebar-model-bullet");
      if (runRowBullet && visible(runRowBullet)) throw new Error("Aharness run row still shows a generic sidebar bullet");
      const runningSpinner = runRow.querySelector(".cpx-sidebar-status-spinner");
      if (!runningSpinner) throw new Error("Active aharness run row did not use the running spinner");
      const runRowComputed = getComputedStyle(runRow);
      if (runRow.getAttribute("data-app-action-sidebar-thread-active") !== "true") throw new Error("Selected aharness run row is missing the active thread marker");
      if (runRow.getAttribute("data-codex-plus-aharness-run-active") !== "true") throw new Error("Selected aharness run row is missing the aharness active marker");
      if (!String(runRowComputed.boxShadow || "").includes("inset") || !String(runRowComputed.boxShadow || "").includes("6px")) {
        throw new Error(`Selected aharness run row does not use the active-thread left accent: ${runRowComputed.boxShadow}`);
      }
      if (Number.parseFloat(runRowComputed.borderTopLeftRadius || "0") > 0 || Number.parseFloat(runRowComputed.borderBottomLeftRadius || "0") > 0) {
        throw new Error(`Selected aharness run row still has rounded left corners: ${runRowComputed.borderTopLeftRadius}/${runRowComputed.borderBottomLeftRadius}`);
      }
      const runRowMain = runRow.querySelector(".cpx-sidebar-model-main");
      const runRowMainPaddingLeft = Number.parseFloat(getComputedStyle(runRowMain || runRow).paddingLeft || "0");
      if (!Number.isFinite(runRowMainPaddingLeft) || runRowMainPaddingLeft < 16) {
        throw new Error(`Selected aharness run row text is too close to the left accent: ${runRowMainPaddingLeft}px`);
      }
      const route = await waitForAharness("[data-codex-plus-aharness-route]");
      if (!route) throw new Error("Aharness virtual conversation route did not render");
      if (visibleOwnText("What should we build?")) throw new Error("Aharness virtual route left the native home prompt visible behind the run view");
      const chat = route.querySelector(".cpx-ah-chat");
      const chatFontSize = Number.parseFloat(getComputedStyle(chat || route).fontSize || "0");
      if (!Number.isFinite(chatFontSize) || chatFontSize > 14.5) {
        throw new Error(`Aharness transcript font size does not match native chat scale: ${chatFontSize}px`);
      }
      if (document.querySelector("#codex-plus-side-panel-root")) throw new Error("Aharness installed the old fixed body side panel root");
      const activeProjectPath = document.body.getAttribute("data-codex-plus-active-project-path") ||
        document.querySelector("main")?.getAttribute("data-codex-plus-active-project-path") ||
        "";
      if (!activeProjectPath.includes("aharness-examples")) throw new Error(`Aharness route did not set the active base directory: ${activeProjectPath}`);
      const visibleForeignFileTabs = Array.from(document.querySelectorAll("[data-app-shell-tabs] [data-tab-id^='file:local:']"))
        .filter((element) => visible(element))
        .map((element) => element.getAttribute("data-tab-id"))
        .filter((tabId) => tabId && !tabId.includes("aharness-examples"));
      if (visibleForeignFileTabs.length > 0) throw new Error(`Aharness route left foreign file tabs visible: ${visibleForeignFileTabs.join(", ")}`);
      const routeText = normalize(route.textContent || "");
      if (!routeText.includes("Color funnel")) throw new Error(`Aharness route header did not use FSM label: ${routeText}`);
      const virtualProjectContext = window.CodexPlus?.ui?.projectContext?.active?.();
      if (!virtualProjectContext?.cwd?.includes("aharness-examples") || virtualProjectContext?.label !== "aharness-examples") {
        throw new Error(`Aharness virtual route did not expose the aharness project context: ${JSON.stringify(virtualProjectContext)}`);
      }
      const waitForSettledVirtualPathHeader = async (timeoutMs = 10000) => {
        const startedAt = Date.now();
        let stalePathChip = null;
        while (Date.now() - startedAt < timeoutMs) {
          const visiblePathChips = Array.from(document.querySelectorAll("[data-codex-plus-project-path-header]")).filter((chip) => visible(chip));
          stalePathChip = visiblePathChips.find((chip) => chip.getAttribute("title") && !chip.getAttribute("title").includes("aharness-examples")) || null;
          if (!stalePathChip) return null;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return stalePathChip;
      };
      const stalePathChip = await waitForSettledVirtualPathHeader();
      if (stalePathChip) throw new Error(`Aharness virtual route left a stale native header path chip visible: ${stalePathChip.getAttribute("title")}`);
      const expectedVirtualTitle = window.CodexPlus?.ui?.routeContext?.active?.()?.title || "";
      if (!expectedVirtualTitle) throw new Error("Aharness virtual route did not expose a canonical header title");
      const nativeHeader = Array.from(document.querySelectorAll("header"))
        .find((element) => visible(element) && element.querySelector("[data-codex-plus-project-path-header]"));
      const nativeHeaderText = normalize(nativeHeader?.textContent || "");
      if (!nativeHeaderText.includes(expectedVirtualTitle)) {
        throw new Error(`Aharness virtual route left a stale native header title: ${nativeHeaderText}`);
      }
      const routeBackground = getComputedStyle(route).backgroundColor;
      const rootBackground = getComputedStyle(document.querySelector("#codex-plus-virtual-conversation-root")).backgroundColor;
      if (routeBackground !== "rgba(0, 0, 0, 0)" || rootBackground !== "rgba(0, 0, 0, 0)") {
        throw new Error(`Aharness route should inherit the native background, got route=${routeBackground} root=${rootBackground}`);
      }
      const rowText = normalize(runRow.textContent || "");
      if (rowText.includes("examples/color-funnel.fsm.ts") || rowText.includes("Color funnel")) {
        throw new Error(`Aharness run row repeated the FSM label or target path: ${rowText}`);
      }
      const normalHeader = document.querySelector("header, [data-testid*='header'], [class*='header']");
      if (normalHeader && !visible(normalHeader)) throw new Error("Normal Codex header became hidden during aharness route");
      const actionDock = await waitForAharness("[data-codex-plus-aharness-route] [data-codex-plus-aharness-action-dock]");
      if (!actionDock) throw new Error("Aharness bottom action dock did not render");
      if (document.querySelector("[data-ah-cancel]") || normalize(document.body.textContent || "").includes("Cancel run")) {
        throw new Error("Aharness rendered the old dedicated Cancel run control");
      }
      const waitingComposer = await waitForAharness("[data-codex-plus-user-entry][data-codex-plus-composer-claimed][data-codex-plus-composer-mode='waiting']", 10000);
      if (!waitingComposer) throw new Error("Aharness running state did not claim the native composer in waiting mode");
      const waitingPlaceholder = normalize(
        waitingComposer.querySelector("textarea")?.getAttribute("placeholder") ||
        getComputedStyle(waitingComposer.querySelector("[data-placeholder]"), "::after")?.content?.replace(/^["']|["']$/g, "") ||
        waitingComposer.querySelector("[data-placeholder]")?.getAttribute("data-placeholder") ||
        waitingComposer.textContent ||
        "",
      );
      if (!/Aharness is working/i.test(waitingPlaceholder)) {
        throw new Error(`Aharness waiting composer did not show a waiting cue: ${waitingPlaceholder}`);
      }
      const stopControl = waitingComposer.querySelector("[data-codex-plus-composer-stop-control]");
      if (!stopControl) throw new Error("Aharness waiting composer did not expose the native stop control");
      const visibleComposerButtons = Array.from(waitingComposer.querySelectorAll("button")).filter((button) => visible(button));
      const visibleComposerText = normalize(waitingComposer.textContent || "");
      const policyLabels = ["Full access", "Ask for approval", "Approve for me", "Custom"];
      const visiblePolicyControl = visibleComposerButtons.find((button) => {
        const text = normalize(button.textContent || "");
        return policyLabels.some((label) => text === label || text.startsWith(`${label} `));
      });
      if (!visiblePolicyControl) {
        throw new Error(`Aharness waiting composer hid the native policy control: ${visibleComposerText}`);
      }
      if (!visible(stopControl)) throw new Error("Aharness waiting composer stop control is present but not visible");
      if (visibleComposerButtons.length < 3) {
        throw new Error(`Aharness waiting composer collapsed native controls: ${JSON.stringify(visibleComposerButtons.map((button) => normalize(button.textContent || button.getAttribute("aria-label") || "")))}`);
      }
      const chatRect = chat?.getBoundingClientRect?.();
      const composerRect = waitingComposer.getBoundingClientRect();
      if (chatRect?.width > 0 && chatRect?.height > 0 && composerRect.width > 0) {
        const chatCenter = chatRect.left + chatRect.width / 2;
        const composerCenter = composerRect.left + composerRect.width / 2;
        if (Math.abs(chatCenter - composerCenter) > 18) {
          throw new Error(`Aharness composer is not centered relative to the chat view: ${JSON.stringify({ chatCenter, composerCenter, chatRect, composerRect })}`);
        }
        if (chatRect.width >= 420 && composerRect.width > chatRect.width - 36) {
          throw new Error(`Aharness composer has no horizontal gutter inside the chat view: ${JSON.stringify({ chatWidth: chatRect.width, composerWidth: composerRect.width })}`);
        }
      }
      const firstInteractionCard = actionDock.querySelector("[data-codex-plus-interaction-card]");
      if (firstInteractionCard && visible(firstInteractionCard)) {
        const cardBottom = firstInteractionCard.getBoundingClientRect().bottom;
        const composerTop = waitingComposer.getBoundingClientRect().top;
        if (cardBottom > composerTop - 4) {
          throw new Error(`Aharness interaction card overlaps the native composer: ${JSON.stringify({ cardBottom, composerTop })}`);
        }
      }
      const replyVisibleOwnerChoice = async (preferredLabel, timeoutMs = 20000) => {
        const startedAt = Date.now();
        let card = null;
        let buttons = [];
        let button = null;
        while (Date.now() - startedAt < timeoutMs) {
          card = await waitForAharness("[data-codex-plus-aharness-route] [data-codex-plus-aharness-action-dock] [data-codex-plus-interaction-card]", Math.min(1000, timeoutMs));
          buttons = Array.from(card?.querySelectorAll("button") || []).filter((candidate) => visible(candidate));
          button = buttons.find((candidate) => normalize(candidate.textContent || "") === preferredLabel) || null;
          if (button) break;
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        if (!card) throw new Error("Aharness interaction card did not render inline");
        if (!button) throw new Error(`Aharness interaction card did not expose choice ${preferredLabel}: ${buttons.map((candidate) => normalize(candidate.textContent || "")).join(", ")}`);
        const activeRunId = window.CodexPlus.ui.virtualConversations.activeRouteId()?.replace(/^cpx-aharness-run:/, "");
        const activeRunBeforeReply = activeRunId ? await window.CodexPlus.native.request("aharness/run/read", { runId: activeRunId }) : null;
        const pendingChoice = activeRunBeforeReply?.run?.pending?.find?.((pendingCard) => pendingCard.kind === "owner-choice");
        if (!activeRunId || !pendingChoice) throw new Error(`Aharness active owner choice was not available through the native API: ${JSON.stringify(activeRunBeforeReply)}`);
        const replyResult = await window.CodexPlus.native.request("aharness/run/reply", {
          runId: activeRunId,
          payload: {
            kind: "owner-choice",
            state: pendingChoice.state,
            visitCount: pendingChoice.visitCount,
            label: button.textContent.trim(),
          },
        });
        if (!replyResult?.ok) throw new Error(`Aharness owner choice reply failed: ${JSON.stringify(replyResult)}`);
        return { activeRunId, label: button.textContent.trim() };
      };
      const createFsmRun = async (target) => {
        const row = document.querySelector(`#codex-plus-aharness-sidebar [data-codex-plus-aharness-fsm-row="${target}"]`);
        if (!row) throw new Error(`Aharness FSM row is missing for ${target}`);
        const button = row.querySelector(".cpx-sidebar-model-create");
        if (!button) throw new Error(`Aharness FSM create button is missing for ${target}`);
        const previousRoute = window.CodexPlus.ui.virtualConversations.activeRouteId?.() || "";
        press(button);
        const startedAt = Date.now();
        let activeRunId = "";
        while (Date.now() - startedAt < 20000) {
          const route = window.CodexPlus.ui.virtualConversations.activeRouteId?.() || "";
          if (route.startsWith("cpx-aharness-run:") && route !== previousRoute) {
            activeRunId = route.replace(/^cpx-aharness-run:/, "");
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        const routeElement = await waitForAharness(`[data-codex-plus-aharness-route="${activeRunId}"]`, 20000);
        if (!routeElement || !activeRunId) throw new Error(`Aharness route did not open for ${target}`);
        return { row, routeElement, activeRunId };
      };
      await replyVisibleOwnerChoice("red");
      const progressRow = await waitForAharness(
        "[data-codex-plus-aharness-route] [data-codex-plus-aharness-anchor]:not(.cpx-ah-row-user)",
        20000,
      );
      if (!progressRow) throw new Error("Aharness public transcript rows did not render after owner choice");
      const progressed = await waitForAharness("[data-codex-plus-aharness-route] [data-codex-plus-aharness-action-dock] [data-codex-plus-interaction-card]", 60000);
      if (!progressed) throw new Error("Aharness interaction reply did not leave a live card for the next state");
      const userBubble = await waitForAharness("[data-codex-plus-aharness-route] [data-codex-plus-user-bubble]", 10000);
      if (!userBubble) throw new Error("Aharness owner reply did not render as a user bubble");
      const scroller = document.querySelector("[data-codex-plus-aharness-route] [data-codex-plus-aharness-scroll]");
      if (!scroller) throw new Error("Aharness scroller did not render");
      scroller.scrollTop = 0;
      const activeRoute = window.CodexPlus.ui.virtualConversations.activeRouteId();
      window.CodexPlus.ui.virtualConversations.refresh();
      const refreshedScroller = document.querySelector("[data-codex-plus-aharness-route] [data-codex-plus-aharness-scroll]");
      if (refreshedScroller && refreshedScroller.scrollTop > 10) throw new Error("Aharness refresh forced scroll to the bottom while user was scrolled up");
      await replyVisibleOwnerChoice("Yes", 60000);
      const terminal = await waitForAharness("[data-codex-plus-aharness-route] .cpx-ah-terminal", 20000);
      if (!terminal || !normalize(terminal.textContent).includes("Completed")) throw new Error("Aharness long run did not complete");
      const completedRunRow = document.querySelector("#codex-plus-aharness-sidebar [data-codex-plus-aharness-run-row]");
      if (!completedRunRow) throw new Error("Completed aharness run row disappeared");
      if (completedRunRow.querySelector(".cpx-sidebar-status-spinner")) throw new Error("Completed aharness run row still shows the running spinner");
      const completedRunText = normalize(completedRunRow.textContent || "");
      if (/\bcompleted\b/i.test(completedRunText)) throw new Error(`Completed aharness run row still renders a completed label: ${completedRunText}`);
      const artifact = await waitForAharness("[data-codex-plus-aharness-route] .cpx-ah-artifact", 10000);
      if (!artifact) throw new Error("Aharness long run artifact did not render");
      const artifactButton = artifact.querySelector("[data-codex-plus-aharness-artifact-open]");
      if (!artifactButton) throw new Error("Aharness artifact open button did not render");
      const nativeFileAlerts = [];
      const nativeFileOpenCalls = [];
      const previousAlert = window.alert;
      const nativeFileAdapter = window.CodexPlusHost.adapters.threadSidePanel;
      const previousOpenFile = nativeFileAdapter.openFile;
      window.alert = (message) => {
        nativeFileAlerts.push(String(message || ""));
      };
      nativeFileAdapter.openFile = async (...args) => {
        try {
          const result = await previousOpenFile(...args);
          nativeFileOpenCalls.push({ args, result });
          return result;
        } catch (error) {
          nativeFileOpenCalls.push({ args, error: error?.message || String(error) });
          throw error;
        }
      };
      const nativeFileTabsBeforeArtifact = Array.from(new Set(Array.from(document.querySelectorAll("[role='tab']"))
        .map((tab) => tab.closest("[data-tab-id]")?.getAttribute("data-tab-id") || tab.getAttribute("data-tab-id") || "")
        .filter(Boolean)));
      let artifactTab = null;
      let artifactTabId = "";
      let artifactFileContent = null;
      try {
        press(artifactButton);
        artifactTab = await waitForAharness("[data-app-shell-tabs] [data-tab-id^='file:'][data-tab-id*='result.md'], [data-app-shell-tabs] [data-tab-id^='mcp-capability:file-viewer:file:local:'][data-tab-id*='result.md'], [data-app-shell-tabs] [data-tab-id^='text-editor:local:'][data-tab-id*='result.md'], [data-app-shell-tab-strip-controller] [data-tab-id^='file:'][data-tab-id*='result.md'], [data-app-shell-tab-strip-controller] [data-tab-id^='mcp-capability:file-viewer:file:local:'][data-tab-id*='result.md'], [data-app-shell-tab-strip-controller] [data-tab-id^='text-editor:local:'][data-tab-id*='result.md']", 20000);
        if (nativeFileAlerts.some((message) => message.includes("native-file-opener-not-found"))) {
          throw new Error(`Aharness artifact open showed native file opener alert: ${nativeFileAlerts.join(" | ")}`);
        }
        if (!artifactTab) {
          if (nativeFileAlerts.some((message) => message.includes("native-file-opener-unavailable"))) {
            throw new Error(nativeFileAlerts.join(" | "));
          }
          const visibleTabs = Array.from(new Set(Array.from(document.querySelectorAll("[data-tab-id], [role='tab']"))
            .filter(visible)
            .map((tab) => tab.closest("[data-tab-id]")?.getAttribute("data-tab-id") || tab.getAttribute("data-tab-id") || normalize(tab.textContent || ""))
            .filter(Boolean)));
          throw new Error(`Aharness artifact did not open as a native file tab: ${JSON.stringify({ nativeFileAlerts, nativeFileOpenCalls, visibleTabs })}`);
        }
        artifactTabId = artifactTab.getAttribute("data-tab-id") || artifactTab.closest("[data-tab-id]")?.getAttribute("data-tab-id") || "";
        const artifactTabUsesNativeFileViewer =
          artifactTabId.startsWith("file:local:") ||
          artifactTabId.startsWith("file:") ||
          artifactTabId.startsWith("mcp-capability:file-viewer:file:local:") ||
          artifactTabId.startsWith("text-editor:local:");
        if (!artifactTabUsesNativeFileViewer || !artifactTabId.includes("aharness-examples") || !artifactTabId.includes("result.md")) {
          throw new Error(`Aharness artifact tab did not use the aharness examples file path: ${artifactTabId}`);
        }
        const artifactAppShell = artifactTab.closest?.("[data-app-shell-tabs]");
        const artifactTabStrip = artifactTab.closest?.("[data-app-shell-tab-strip-controller]");
        if (!artifactAppShell && !artifactTabStrip) {
          throw new Error(`Aharness artifact tab is not inside the native app shell tab strip: ${artifactTabId}`);
        }
        artifactFileContent = await waitForAharness("[role='tabpanel'][data-tab-id^='file:'][data-tab-id*='result.md'], [role='tabpanel'][data-tab-id^='mcp-capability:file-viewer:file:local:'][data-tab-id*='result.md'], [role='tabpanel'][data-tab-id^='text-editor:local:'][data-tab-id*='result.md']", 30000);
        if (!artifactFileContent || !normalize(artifactFileContent.textContent).includes("Color Funnel Result")) {
          const startedAt = Date.now();
          while (Date.now() - startedAt < 30000) {
            artifactFileContent = Array.from(document.querySelectorAll("[role='tabpanel']"))
              .find((panel) => visible(panel) && normalize(panel.textContent).includes("Color Funnel Result"));
            if (artifactFileContent) break;
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
        }
        if (nativeFileAlerts.some((message) => message.includes("native-file-opener-not-found"))) {
          throw new Error(`Aharness artifact open showed native file opener alert: ${nativeFileAlerts.join(" | ")}`);
        }
        if (!artifactFileContent || !normalize(artifactFileContent.textContent).includes("Color Funnel Result")) {
          throw new Error("Aharness artifact file tab did not render artifact contents");
        }
        const artifactPanelShell = artifactFileContent.closest("[data-app-shell-tabs]");
        const artifactPanelController = artifactFileContent.matches("[data-app-shell-tab-panel-controller]")
          ? artifactFileContent
          : artifactFileContent.closest("[data-app-shell-tab-panel-controller]");
        if (artifactAppShell) {
          if (artifactPanelShell && artifactAppShell !== artifactPanelShell) {
            throw new Error(`Aharness artifact tab and panel are not contained by the same native app shell: ${artifactTabId}`);
          }
        } else if (
          !artifactPanelController ||
          artifactTabStrip.getAttribute("data-app-shell-tab-strip-controller") !== artifactPanelController.getAttribute("data-app-shell-tab-panel-controller")
        ) {
          throw new Error(`Aharness artifact tab and panel do not use the same native app shell controller: ${artifactTabId}`);
        }
        let artifactCommonShell = artifactAppShell;
        if (!artifactCommonShell) {
          artifactCommonShell = artifactTabStrip.parentElement;
          while (artifactCommonShell && !artifactCommonShell.contains(artifactPanelController)) {
            artifactCommonShell = artifactCommonShell.parentElement;
          }
          if (!artifactCommonShell || artifactCommonShell === document.body || artifactCommonShell === document.documentElement) {
            throw new Error(`Aharness artifact tab and panel do not share a bounded native app shell container: ${artifactTabId}`);
          }
        }
        const shellRect = artifactCommonShell.getBoundingClientRect();
        const tabRect = artifactTab.getBoundingClientRect();
        const panelRect = artifactFileContent.getBoundingClientRect();
        if (tabRect.left < shellRect.left - 1 || tabRect.right > shellRect.right + 1 || panelRect.left < shellRect.left - 1 || panelRect.right > shellRect.right + 1) {
          throw new Error(`Aharness artifact native file tab escaped the side panel shell: ${JSON.stringify({
            shell: { left: shellRect.left, right: shellRect.right },
            tab: { left: tabRect.left, right: tabRect.right },
            panel: { left: panelRect.left, right: panelRect.right },
          })}`);
        }
        if (document.querySelector("[data-codex-plus-thread-file-panel]")) throw new Error("Aharness artifact opened in a plugin-owned file panel");
      } finally {
        window.alert = previousAlert;
        nativeFileAdapter.openFile = previousOpenFile;
      }
      const routeAfterArtifact = await waitForAharness("[data-codex-plus-aharness-route]", 10000);
      if (!routeAfterArtifact) throw new Error("Aharness artifact open displaced the virtual chat route");
      const activeAfterArtifact = window.CodexPlus?.ui?.virtualConversations?.activeRouteId?.() || "";
      if (!activeAfterArtifact.startsWith("cpx-aharness-run:")) {
        throw new Error(`Aharness artifact open cleared the active virtual route: ${activeAfterArtifact}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 3600));
      const settledRouteAfterArtifact = document.querySelector("[data-codex-plus-aharness-route]");
      const settledActiveAfterArtifact = window.CodexPlus?.ui?.virtualConversations?.activeRouteId?.() || "";
      if (!settledRouteAfterArtifact || !settledActiveAfterArtifact.startsWith("cpx-aharness-run:")) {
        throw new Error(`Aharness artifact open did not keep the virtual chat route mounted after the File tab settled: ${settledActiveAfterArtifact}`);
      }
      const nativeFileTabsAfterArtifact = Array.from(new Set(Array.from(document.querySelectorAll("[role='tab']"))
        .map((tab) => tab.closest("[data-tab-id]")?.getAttribute("data-tab-id") || tab.getAttribute("data-tab-id") || "")
        .filter(Boolean)));
      if (nativeFileTabsBeforeArtifact.length > 0 && !nativeFileTabsBeforeArtifact.every((tabId) => nativeFileTabsAfterArtifact.includes(tabId))) {
        throw new Error("Aharness artifact tab hid an existing native file tab");
      }
      if (document.querySelector("[data-codex-plus-thread-side-panel-root]")) throw new Error("Aharness artifact opened in a plugin-owned side panel overlay");
      if (document.querySelector("#codex-plus-side-panel-root")) throw new Error("Aharness artifact opened in a fixed body overlay");
      const codingRun = await createFsmRun("examples/coding-smoke.fsm.ts");
      const codingCard = await waitForAharness("[data-codex-plus-aharness-route] [data-codex-plus-aharness-action-dock] [data-codex-plus-interaction-card]", 150000);
      if (!codingCard) {
        const codingRunId = codingRun?.runId || codingRun?.result?.runId || document.querySelector("[data-codex-plus-aharness-route]")?.getAttribute("data-codex-plus-aharness-route") || "";
        const read = codingRunId ? await window.CodexPlus?.native?.request?.("aharness/run/read", { runId: codingRunId }) : null;
        throw new Error(`Coding smoke did not reach the owner approval card: ${JSON.stringify({
          runId: codingRunId,
          status: read?.result?.run?.status,
          state: read?.result?.run?.currentState?.path,
          pending: read?.result?.run?.pending?.map?.((card) => card.kind),
          tail: normalize(document.querySelector("[data-codex-plus-aharness-route]")?.textContent || "").slice(-500),
        })}`);
      }
      const codingWaitingComposer = await waitForAharness("[data-codex-plus-user-entry][data-codex-plus-composer-claimed][data-codex-plus-composer-mode='waiting']", 10000);
      if (!codingWaitingComposer) throw new Error("Coding smoke did not keep the native composer visible in waiting mode before owner input");
      if (!codingWaitingComposer.querySelector("[data-codex-plus-composer-stop-control]")) {
        throw new Error("Coding smoke waiting composer did not expose the stop affordance");
      }
      const codingRoute = document.querySelector("[data-codex-plus-aharness-route]");
      const codingText = normalize(codingRoute?.textContent || "");
      if (codingText.includes("Valid exits:")) throw new Error("Coding smoke rendered the framework Valid exits schema block");
      const statePrompts = Array.from(codingRoute.querySelectorAll(".cpx-ah-row-state_prompt"))
        .map((element) => normalize(element.textContent || ""))
        .filter(Boolean);
      if (new Set(statePrompts).size !== statePrompts.length) throw new Error(`Coding smoke rendered duplicate state prompts: ${statePrompts.join(" | ")}`);
      const firstStatePrompt = codingRoute.querySelector(".cpx-ah-row-state_prompt");
      const statePromptStyle = firstStatePrompt ? getComputedStyle(firstStatePrompt) : null;
      if (!firstStatePrompt || Number.parseFloat(statePromptStyle.borderTopLeftRadius || "0") < 12 || statePromptStyle.backgroundColor === "rgba(0, 0, 0, 0)") {
        throw new Error(`Coding smoke state prompt is not rendered as a subdued bubble: ${JSON.stringify({ radius: statePromptStyle?.borderTopLeftRadius, background: statePromptStyle?.backgroundColor })}`);
      }
      const messageBodies = Array.from(codingRoute.querySelectorAll(".cpx-ah-row-message .cpx-ah-row-body"))
        .map((element) => normalize(element.textContent || ""))
        .filter(Boolean);
      const tokenLikeRows = messageBodies.filter((text) => text.length <= 4 && !/[.!?]$/.test(text));
      if (tokenLikeRows.length > 3) throw new Error(`Coding smoke still renders token-like message rows: ${tokenLikeRows.slice(0, 12).join(" | ")}`);
      const duplicateMessages = messageBodies.filter((text, index) => messageBodies.indexOf(text) !== index);
      if (duplicateMessages.length > 0) throw new Error(`Coding smoke rendered duplicate message rows: ${duplicateMessages.slice(0, 3).join(" | ")}`);
      const toolGroup = await waitForAharness("[data-codex-plus-aharness-route] .cpx-ah-tool-group", 30000);
      if (!toolGroup) throw new Error("Coding smoke did not render a public tool row");
      const toolText = normalize(toolGroup.textContent || "");
      if (!/Ran \d+ command|Running command/i.test(toolText) || !/bash|npm|pnpm|cat|sed|rg|test|completed|failed/i.test(toolText)) {
        throw new Error(`Coding smoke tool row lacks useful details: ${toolText}`);
      }
      const runningToolGroup = document.querySelector("[data-codex-plus-aharness-route] .cpx-ah-tool-group-running");
      if (runningToolGroup) {
        const runningLabel = runningToolGroup.querySelector("summary span");
        const runningSummary = runningToolGroup.querySelector("summary strong");
        if (!/^Running commands?$/.test(normalize(runningLabel?.textContent || ""))) {
          throw new Error(`Running tool group label is wrong: ${normalize(runningLabel?.textContent || "")}`);
        }
        if (!normalize(runningSummary?.textContent || "") || /Ran \d+ command/i.test(normalize(runningSummary?.textContent || ""))) {
          throw new Error(`Running tool group summary still looks completed: ${normalize(runningSummary?.textContent || "")}`);
        }
        if (!runningToolGroup.querySelector(".cpx-ah-tool-tail")) throw new Error("Running tool group did not show a live output tail");
      }
      if (toolGroup.open) throw new Error("Coding smoke tool group should be folded by default");
      press(toolGroup.querySelector("summary"));
      if (!toolGroup.open) throw new Error("Coding smoke tool group did not become visible after expansion");
      const toolCommand = toolGroup.querySelector(".cpx-ah-tool-command");
      if (!toolCommand) throw new Error("Coding smoke expanded tool group did not reveal command rows");
      if (toolCommand.open) throw new Error("Coding smoke command output should be folded by default");
      const toolOutputPre = toolCommand.querySelector("pre");
      if (toolOutputPre && (toolOutputPre.getClientRects().length > 0 || toolOutputPre.offsetHeight > 0)) {
        throw new Error("Coding smoke folded command output is visible before expansion");
      }
      press(toolCommand.querySelector("summary"));
      const openedOutputPre = toolCommand.querySelector("pre");
      const noOutput = toolCommand.querySelector(".cpx-ah-tool-no-output");
      if (openedOutputPre && (openedOutputPre.getClientRects().length === 0 || openedOutputPre.offsetHeight === 0)) throw new Error("Coding smoke command output did not become visible after expansion");
      if (!openedOutputPre && !noOutput) throw new Error("Coding smoke command row did not expose output or an explicit no-output label");
      await new Promise((resolve) => setTimeout(resolve, 150));
      window.CodexPlus.ui.virtualConversations.refresh();
      await new Promise((resolve) => setTimeout(resolve, 400));
      const reopenedToolGroup = document.querySelector(`[data-codex-plus-aharness-tool-group="${toolGroup.getAttribute("data-codex-plus-aharness-tool-group")}"]`);
      if (!reopenedToolGroup?.open) throw new Error("Coding smoke tool group fold did not stay open after refresh");
      const reopenedToolCommand = document.querySelector(`[data-codex-plus-aharness-tool-command="${toolCommand.getAttribute("data-codex-plus-aharness-tool-command")}"]`);
      if (!reopenedToolCommand?.open) throw new Error("Coding smoke command output fold did not stay open after refresh");
      const commandRows = Array.from(document.querySelectorAll("[data-codex-plus-aharness-route] .cpx-ah-tool-command"));
      const unlabeledEmptyTool = commandRows.find((row) => !row.querySelector("pre") && !normalize(row.textContent || "").includes("No output captured."));
      if (unlabeledEmptyTool) throw new Error(`Coding smoke empty-output tool row was not explicit: ${normalize(unlabeledEmptyTool.textContent || "")}`);
      const noisyReasoning = Array.from(document.querySelectorAll("[data-codex-plus-aharness-route] .cpx-ah-row-reasoning"))
        .map((row) => normalize(row.textContent || ""))
        .filter((text) => text === "reasoning" || text === "REASONING reasoning");
      if (noisyReasoning.length > 0) throw new Error(`Coding smoke rendered placeholder reasoning rows: ${noisyReasoning.join(" | ")}`);
      const lifecycleNoise = Array.from(document.querySelectorAll("[data-codex-plus-aharness-route] .cpx-ah-row"))
        .map((row) => normalize(row.textContent || ""))
        .find((text) => /^run started$/i.test(text) || /^run_lifecycle run started$/i.test(text));
      if (lifecycleNoise) throw new Error(`Coding smoke rendered lifecycle noise in the transcript: ${lifecycleNoise}`);
      const requestChanges = await replyVisibleOwnerChoice("Request changes", 10000);
      const openStateStartedAt = Date.now();
      let openRun = null;
      while (Date.now() - openStateStartedAt < 30000) {
        const read = await window.CodexPlus.native.request("aharness/run/read", { runId: requestChanges.activeRunId });
        if (read?.run?.currentState?.open === true) {
          openRun = read.run;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (!openRun) throw new Error("Coding smoke Request changes did not enter an open state");
      await waitForAharness("[data-codex-plus-user-entry][data-codex-plus-composer-claimed][data-codex-plus-composer-mode='input']", 10000);
      const composerForm = document.querySelector("[data-codex-plus-user-entry]");
      if (!composerForm || !composerForm.hasAttribute("data-codex-plus-composer-claimed")) throw new Error("Coding smoke open state did not claim the native composer");
      if (composerForm.getAttribute("data-codex-plus-composer-mode") !== "input") throw new Error("Coding smoke open state did not switch the native composer to input mode");
      const composerText = "Please include the exact test command before implementation.";
      const textarea = composerForm.querySelector("textarea");
      const editable = composerForm.querySelector("[contenteditable='true'], .ProseMirror");
      if (textarea) {
        textarea.value = composerText;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      } else if (editable) {
        editable.textContent = composerText;
        editable.innerText = composerText;
        editable.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: composerText }));
      } else {
        throw new Error("Coding smoke native composer did not expose a text input");
      }
      composerForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      const feedbackStartedAt = Date.now();
      let feedbackBubble = null;
      while (Date.now() - feedbackStartedAt < 20000) {
        feedbackBubble = Array.from(document.querySelectorAll("[data-codex-plus-aharness-route] [data-codex-plus-user-bubble]"))
          .find((bubble) => normalize(bubble.textContent || "").includes("Please include the exact test command")) || null;
        if (feedbackBubble) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (!feedbackBubble) {
        throw new Error("Coding smoke native composer feedback was not rendered as an owner bubble");
      }
      const codingScroller = document.querySelector("[data-codex-plus-aharness-route] [data-codex-plus-aharness-scroll]");
      if (!codingScroller) throw new Error("Coding smoke scroller did not render");
      codingScroller.scrollTop = codingScroller.scrollHeight;
      codingScroller.scrollTop = 0;
      const codingFirstRowText = normalize(codingRoute.querySelector(".cpx-ah-chat-stream .cpx-ah-row, .cpx-ah-chat-stream .cpx-ah-state-divider")?.textContent || "");
      if (!codingFirstRowText) throw new Error("Coding smoke first public row was not reachable in the DOM");
      const cancelProbe = await createFsmRun("examples/await-checkpoints.fsm.ts");
      const cancelComposer = await waitForAharness("[data-codex-plus-user-entry][data-codex-plus-composer-claimed][data-codex-plus-composer-mode='waiting']", 10000);
      if (!cancelComposer) throw new Error("Aharness cancel probe did not claim the native composer in waiting mode");
      const cancelStop = cancelComposer.querySelector("[data-codex-plus-composer-stop-control]");
      if (!cancelStop) throw new Error("Aharness cancel probe did not expose the native stop control");
      press(cancelStop);
      const cancelStartedAt = Date.now();
      let cancelledRun = null;
      while (Date.now() - cancelStartedAt < 20000) {
        const read = await window.CodexPlus.native.request("aharness/run/read", { runId: cancelProbe.activeRunId });
        if (read?.run?.status === "cancelled") {
          cancelledRun = read.run;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      if (!cancelledRun) throw new Error("Aharness native composer stop control did not cancel the run");
      const normalProject = document.querySelector('[data-app-action-sidebar-project-row][data-app-action-sidebar-project-label="alpha-main"]');
      if (normalProject) {
        press(normalProject);
        await new Promise((resolve) => setTimeout(resolve, 1800));
        const staleRoute = document.querySelector("[data-codex-plus-aharness-route]");
        if (staleRoute && visible(staleRoute)) throw new Error("Aharness virtual route stayed visible after selecting a normal project");
        if (window.CodexPlus.ui.virtualConversations.activeRouteId()) throw new Error("Aharness virtual route stayed active after selecting a normal project");
        if (decodeURIComponent(String(window.location.hash || "").replace(/^#/, "")).startsWith("cpx-aharness-run:")) {
          throw new Error(`Aharness virtual route hash stayed active after selecting a normal project: ${window.location.hash}`);
        }
      }
      pass("aharnessRuns", {
        ...details,
        hasOpenCommand,
        hasRunCommand,
        hasMenuItem,
        commandCount: listResult.commands.length,
        verifiedDemo: true,
        longRunCompleted: true,
        scrollPositionPreserved: true,
        userBubbleRendered: true,
        bottomActionDockRendered: true,
        sidebarProjectRows: document.querySelectorAll("#codex-plus-aharness-sidebar [data-codex-plus-aharness-project-row]").length,
        sidebarFsmRows: document.querySelectorAll("#codex-plus-aharness-sidebar [data-codex-plus-aharness-fsm-row]").length,
        sidebarRunRows: document.querySelectorAll("#codex-plus-aharness-sidebar [data-codex-plus-aharness-run-row]").length,
        virtualRouteRendered: true,
        transcriptRowsRendered: true,
        artifactPanelRendered: true,
        interactionReplyClicked: true,
        codingSmokeTranscriptChecked: true,
      });
    } catch (error) {
      fail("aharnessRuns", error);
    }

    for (const id of probedPlugins) {
      if (!pluginResults[id]) fail(id, new Error("Probe did not run"));
    }
    return {
      ok: failures.length === 0,
      failures,
      pluginResults,
      expectedWarnings,
      registeredPlugins: typeof window.CodexPlus?.plugins?.list === "function" ? pluginIds() : null,
      startedPlugins: started(),
    };
  }}(${options}))`;
}

async function runAudit(args, {
  progress = null,
  operations = {},
} = {}) {
  const findPort = operations.findFreePort || findFreePort;
  const patchApp = operations.patchCodexApp || patchCodexApp;
  const syncHome = operations.syncDevHome || syncDevHome;
  const buildFixture = operations.buildAuditFixture || buildAuditFixture;
  const seedFixtureBrowserState = operations.seedAuditFixtureBrowserState || seedAuditFixtureBrowserState;
  const launchApp = operations.launchDevApp || launchDevApp;
  const waitForLaunchRetry = operations.waitForLaunchRetry || delay;
  const waitRenderer = operations.waitForRendererTarget || waitForRendererTarget;
  const Session = operations.CdpSession || CdpSession;
  const waitRuntime = operations.waitForLiveRuntime || waitForLiveRuntime;
  const waitAppShell = operations.waitForAppShellMounted || waitForAppShellMounted;
  const auditAdapters = operations.auditRequiredHostAdapters || auditRequiredHostAdapters;
  const closeVirtualRoute = operations.closeActiveVirtualRoute || closeActiveVirtualRoute;
  const dismissDialogs = operations.dismissStartupDialogs || dismissStartupDialogs;
  const verifyMermaidViewer = operations.verifyMermaidViewerRender || verifyMermaidViewerRender;
  const verifyProjectSelectorShortcut = operations.verifyProjectSelectorShortcutKey || verifyProjectSelectorShortcutKey;
  const activateFixture = operations.activateFixtureThread || activateFixtureThread;
  const verifyReviewPanel = operations.verifyReviewPanelRender || verifyReviewPanelRender;
  const cleanupApp = operations.cleanupLaunchedAuditApp || cleanupLaunchedAuditApp;
  const captureContract = operations.captureVisualContract || captureVisualContract;
  const checkStability = operations.checkKeepOpenAppStability || checkKeepOpenAppStability;
  const preflightAudit = operations.auditPreflight || auditPreflight;
  const readIdentity = operations.auditIdentity || auditIdentity;
  let preflight = null;
  let port = args.remoteDebuggingPort;
  const identity = readIdentity();
  let applyResult = null;
  let syncResult = null;
  let fixtureResult = null;
  let fixtureBrowserStateResult = null;
  let launchResult = null;
  let target = null;
  let cdp = null;
  let runtimeStatus = null;
  let appShellStatus = null;
  let cleanupResult = null;
  let visualContractResult = null;
  let visualArtifactDir = args.artifactDir || null;
  let preparedReviewContract = null;
  let preparedCommandContract = null;
  let initialProjectSelectorShortcut = null;
  let result = null;
  try {
    preflight = await withAuditProgress(
      progress,
      "Running audit preflight",
      "Audit preflight passed",
      () => preflightAudit(args, { findPort }),
    );
    port = preflight.port;
    const appShellTimeoutMs = appShellTimeoutForSource(args.source);
    if (args.apply) {
      applyResult = await withAuditProgress(
        progress,
        `Applying patch set to ${args.target}`,
        "Applied patch set",
        () => patchApp({
          sourceApp: args.source,
          targetApp: args.target,
          patchSets,
          progress,
          runtimeConfig: args.disabledRuntimePlugins?.length > 0 ? {
            runtimePluginsDisabled: args.disabledRuntimePlugins,
          } : undefined,
        }),
      );
    }
    if (args.apply || args.launch) {
      if (args.useLiveSourceHome) {
        syncResult = await withAuditProgress(
          progress,
          "Syncing live source home",
          "Synced live source home",
          () => syncHome({
            sourceHome: args.sourceHome,
            devHome: args.devHome,
          }),
        );
      } else {
        fixtureResult = await withAuditProgress(
          progress,
          "Preparing generated audit fixture",
          "Prepared generated audit fixture",
          () => buildFixture({
            devHome: args.devHome,
            electronUserDataPath: args.electronUserDataPath,
            appServerBinary: path.join(path.resolve(args.target), "Contents/Resources/codex"),
            credentialsSourceHome: args.sourceHome,
          }),
        );
      }
    }
    if (preflight.launch) {
      const launchOptions = {
        targetApp: args.target,
        devHome: args.devHome,
        electronUserDataPath: args.electronUserDataPath,
        remoteDebuggingPort: port,
        devInstanceId: args.devInstanceId,
        startupLogPath: path.join(args.electronUserDataPath, "codex-plus-startup.log"),
      };
      launchResult = await withAuditProgress(
        progress,
        `Launching Codex Plus on port ${port}`,
        `Launched app on port ${port}`,
        () => launchApp(launchOptions),
      );
      if (launchResult.instanceIdentity?.bundleIdentifier?.startsWith("com.openai.chatgpt-plus.")) {
        for (let retry = 1; retry <= 2 && !target; retry += 1) {
          try {
            target = await withAuditProgress(
              progress,
              `Waiting for ChatGPT renderer ${retry}/2 on port ${port}`,
              `Found ChatGPT renderer ${retry}/2 on port ${port}`,
              () => waitRenderer(port, 30000),
            );
          } catch {
            await withAuditProgress(
              progress,
              `Cleaning failed ChatGPT start ${retry}/2 on port ${port}`,
              `Cleaned failed ChatGPT start ${retry}/2 on port ${port}`,
              () => cleanupApp(launchResult, { keepOpen: false }),
            );
            await withAuditProgress(
              progress,
              `Waiting before ChatGPT restart ${retry}/2`,
              `Ready for ChatGPT restart ${retry}/2`,
              () => waitForLaunchRetry(2000),
            );
            launchResult = await withAuditProgress(
              progress,
              `Retrying ChatGPT start ${retry}/2 on port ${port}`,
              `Retried ChatGPT start ${retry}/2 on port ${port}`,
              () => launchApp(launchOptions),
            );
          }
        }
        if (!target && launchResult.relaunchError) throw new Error(launchResult.relaunchError);
      }
    }
    if (!target) {
      try {
        target = await withAuditProgress(
          progress,
          "Waiting for app://-/index.html",
          "Found app://-/index.html",
          () => waitRenderer(port),
        );
      } catch (error) {
        const startupLogPath = launchResult?.startupLogPath;
        const startupLog = startupLogPath && fs.existsSync(startupLogPath)
          ? fs.readFileSync(startupLogPath, "utf8").trim().split("\n").slice(-40).join("\n")
          : "";
        if (!startupLog) throw error;
        throw new Error(`${error.message}\nStartup log (${startupLogPath}):\n${startupLog}`);
      }
    }
    cdp = new Session(target.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send("Runtime.enable");
    await cdp.send("Log.enable");
    runtimeStatus = await withAuditProgress(
      progress,
      "Waiting for Codex Plus runtime",
      "Runtime ready",
      () => waitRuntime(cdp),
    );
    appShellStatus = await withAuditProgress(
      progress,
      "Waiting for Codex app shell",
      "App shell mounted",
      () => waitAppShell(cdp, appShellTimeoutMs),
    );
    await withAuditProgress(
      progress,
      "Auditing required host adapters",
      "Required host adapters installed",
      () => auditAdapters(cdp),
    );
    await withAuditProgress(
      progress,
      "Dismissing startup dialogs",
      "Startup dialogs dismissed",
      () => dismissDialogs(cdp),
    );
    if (fixtureResult) {
      fixtureBrowserStateResult = await withAuditProgress(
        progress,
        "Seeding fixture browser state",
        "Seeded fixture browser state",
        () => seedFixtureBrowserState(cdp, fixtureResult),
      );
    }
    if (args.manual) {
      const devToolsUrl = `http://127.0.0.1:${port}/json/list`;
      result = {
        ok: true,
        manual: true,
        probesSkipped: true,
        failures: [],
        expectedWarnings: [],
        pluginResults: {},
        target: {
          app: path.resolve(args.target),
          remoteDebuggingPort: port,
          url: target?.url,
          webSocketDebuggerUrl: target?.webSocketDebuggerUrl,
          pid: launchResult?.pid,
        },
        devToolsUrl,
        devHome: path.resolve(args.devHome),
        electronUserDataPath: path.resolve(args.electronUserDataPath),
        applyResult,
        syncResult: syncResult && {
          copied: syncResult.copied,
          scrubbedGlobalState: syncResult.scrubbedGlobalState,
          sqliteSnapshots: syncResult.sqliteSnapshots,
          worktrees: syncResult.worktrees,
          sessions: syncResult.sessions,
        },
        fixtureResult: fixtureResult && {
          mode: fixtureResult.mode,
          files: fixtureResult.files,
          credentials: fixtureResult.credentials,
          workRoot: fixtureResult.workRoot,
          threads: fixtureResult.threads?.map((thread) => ({
            id: thread.id,
            title: thread.title,
            cwd: thread.cwd,
            projectId: thread.projectId,
          })),
          browserState: fixtureResult.browserState,
          browserStateReadback: fixtureBrowserStateResult,
        },
        launchResult: launchResult && {
          command: launchResult.command,
          args: launchResult.args,
          pid: launchResult.pid,
          devBundle: launchResult.devBundle,
          instanceIdentity: launchResult.instanceIdentity,
        },
        registeredPlugins: null,
        startedPlugins: null,
        runtimeStatus,
        appShellStatus,
        audit: identity,
        nativeOpenProbes: {
          included: false,
        },
        preflight,
      };
      if (args.visualContract === true) {
        const artifactDir = args.artifactDir || defaultAuditArtifactDir({
          version: applyResult?.codexVersion || "unknown",
        });
        visualContractResult = await withAuditProgress(
          progress,
          "Capturing visual contract",
          "Captured visual contract",
          () => captureContract(cdp, {
            artifactDir,
            result,
            includeSettings: false,
          }),
        );
        result.visualContract = visualContractResult;
        if (!visualContractResult.ok) {
          appendFailure(result, {
            plugin: "audit",
            message: visualContractResult.message || "Visual contract failed",
            details: { artifactDir },
          });
        }
      }
      return result;
    }
    initialProjectSelectorShortcut = await withAuditCheckProgress(
      progress,
      "Verifying project selector shortcut and fuzzy match",
      "Project selector shortcut fuzzy match passed",
      () => verifyProjectSelectorShortcut(cdp),
    );
    const focusedNestedAudit = Array.isArray(args.auditPlugins) &&
      args.auditPlugins.length === 1 &&
      args.auditPlugins[0] === "nestedRepositories";
    const fixtureThread = await withAuditCheckProgress(
      progress,
      "Activating fixture thread with trusted input",
      "Activated fixture thread",
      () => activateFixture(cdp, { nested: focusedNestedAudit }),
    );
    if (!fixtureThread.ok) throw new Error(fixtureThread.message);
    await withAuditProgress(
      progress,
      "Auditing native side-panel bindings",
      "Native side-panel bindings installed",
      () => auditAdapters(cdp, { requireBindings: true }),
    );
    const splitAharnessProbe = !Array.isArray(args.auditPlugins) || args.auditPlugins.length === 0;
    const baseAuditPlugins = splitAharnessProbe ? [
      "aboutMetadata", "nestedRepositories", "diagnosticErrors", "userBubbleColors",
      "projectColors", "sidebarNameBlur", "devTools",
      "projectSelectorShortcut", "mermaidFullscreen", "audit",
    ] : args.auditPlugins;
    for (const plugin of [
      ...(splitAharnessProbe ? ["aharnessRuns", "projectPathHeader"] : []),
      ...baseAuditPlugins,
    ]) {
      progress?.item?.("plugin", plugin, { phase: "probe", plugin });
    }
    let isolatedAharness = null;
    let isolatedProjectPathHeader = null;
    if (splitAharnessProbe) {
      isolatedAharness = await withAuditCheckProgress(
        progress,
        "Running isolated Aharness probe",
        "Aharness probe passed",
        () => cdp.evaluate(pluginAuditExpression({ auditPlugins: ["aharnessRuns"] })),
      );
      await withAuditProgress(
        progress,
        "Closing isolated Aharness route",
        "Closed isolated Aharness route",
        () => closeVirtualRoute(cdp),
      );
      const transitionFixture = await activateFixture(cdp, { nested: true });
      if (!transitionFixture.ok) throw new Error(transitionFixture.message);
      const restoredFixture = await activateFixture(cdp);
      if (!restoredFixture.ok) throw new Error(restoredFixture.message);
      isolatedProjectPathHeader = await withAuditCheckProgress(
        progress,
        "Verifying project path header on activated fixture",
        "Project path header passed",
        () => cdp.evaluate(pluginAuditExpression({ auditPlugins: ["projectPathHeader"] })),
      );
    }
    const live = await withAuditProgress(
      progress,
      "Running plugin probes",
      "Probed plugins",
      () => cdp.evaluate(pluginAuditExpression({
        includeNativeOpenProbes: args.includeNativeOpenProbes,
        auditPlugins: baseAuditPlugins,
      })),
    );
    if (isolatedAharness) {
      const aharnessResult = isolatedAharness.pluginResults?.aharnessRuns;
      if (aharnessResult) {
        const aharnessFailures = isolatedAharness.failures.filter((failure) => failure.plugin === "aharnessRuns");
        live.ok = live.ok && aharnessResult.ok && aharnessFailures.length === 0;
        live.failures.push(...aharnessFailures);
        live.expectedWarnings.push(...isolatedAharness.expectedWarnings.filter((warning) => warning.plugin === "aharnessRuns"));
        live.pluginResults.aharnessRuns = aharnessResult;
      }
    }
    if (isolatedProjectPathHeader) {
      const pathResult = isolatedProjectPathHeader.pluginResults?.projectPathHeader;
      if (pathResult) {
        const pathFailures = isolatedProjectPathHeader.failures.filter((failure) => failure.plugin === "projectPathHeader");
        live.ok = live.ok && pathResult.ok && pathFailures.length === 0;
        live.failures.push(...pathFailures);
        live.expectedWarnings.push(...isolatedProjectPathHeader.expectedWarnings.filter((warning) => warning.plugin === "projectPathHeader"));
        live.pluginResults.projectPathHeader = pathResult;
      }
    }
    if (live.pluginResults?.projectSelectorShortcut?.ok) {
      const shortcut = initialProjectSelectorShortcut || await withAuditCheckProgress(
        progress,
        "Verifying project selector shortcut and fuzzy match",
        "Project selector shortcut fuzzy match passed",
        () => verifyProjectSelectorShortcut(cdp),
      );
      live.pluginResults.projectSelectorShortcut.shortcut = shortcut;
      if (!shortcut.ok) {
        live.ok = false;
        live.pluginResults.projectSelectorShortcut.ok = false;
        live.failures.push({
          plugin: "projectSelectorShortcut",
          message: shortcut.message || "Cmd+. did not open the project selector",
        });
      }
    }
    if (live.pluginResults?.nestedRepositories?.ok) {
      const nestedFixture = await withAuditCheckProgress(
        progress,
        "Activating nested repository fixture",
        "Activated nested repository fixture",
        () => activateFixture(cdp, { nested: true }),
      );
      if (!nestedFixture.ok) {
        live.ok = false;
        live.pluginResults.nestedRepositories.ok = false;
        live.failures.push({
          plugin: "nestedRepositories",
          message: nestedFixture.message || "Nested repository fixture thread was not visible",
        });
      }
    }
    if (live.pluginResults?.nestedRepositories?.ok) {
      const reviewPanel = await withAuditCheckProgress(
        progress,
        "Verifying Review panel render",
        "Review panel rendered",
        () => verifyReviewPanel(cdp),
      );
      live.pluginResults.nestedRepositories.reviewPanel = reviewPanel;
      if (reviewPanel.ok && args.visualContract === true) {
        const artifactDir = visualArtifactDir ||= defaultAuditArtifactDir({ version: applyResult?.codexVersion || "unknown" });
        await delay(1000);
        preparedReviewContract = {
          state: reviewPanel,
          screenshot: await capturePng(cdp, path.join(artifactDir, "review.png")),
          readback: await visualReadback(cdp),
        };
      }
      if (!reviewPanel.ok) {
        reviewPanel.cdpDiagnostics = summarizeCdpEvents(cdp.events);
        live.ok = false;
        live.pluginResults.nestedRepositories.ok = false;
        live.failures.push({
          plugin: "nestedRepositories",
          message: reviewPanel.message || "Review panel did not render nested repository content",
        });
      }
    }
    if (live.pluginResults?.sidebarNameBlur?.ok) {
      const artifactDir = visualArtifactDir ||= defaultAuditArtifactDir({ version: applyResult?.codexVersion || "unknown" });
      const commandPalette = await withAuditCheckProgress(
        progress,
        "Verifying sidebar blur command palette action",
        "Sidebar blur command palette action passed",
        () => verifySidebarBlurCommandPalette(cdp, {
          beforeActivate: args.visualContract === true ? async () => {
            await delay(500);
            preparedCommandContract = {
              screenshot: await capturePng(cdp, path.join(artifactDir, "sidebar-command.png")),
              readback: await visualReadback(cdp),
            };
          } : null,
        }),
      );
      if (preparedCommandContract) preparedCommandContract.state = commandPalette;
      live.pluginResults.sidebarNameBlur.commandPalette = commandPalette;
      if (!commandPalette.ok) {
        commandPalette.cdpDiagnostics = summarizeCdpEvents(cdp.events);
        live.ok = false;
        live.pluginResults.sidebarNameBlur.ok = false;
        live.failures.push({
          plugin: "sidebarNameBlur",
          message: commandPalette.message || "Command palette did not toggle sidebar blur",
        });
      }
    }
    const shouldProbeMermaidViewer = live.pluginResults?.mermaidFullscreen?.ok;
    const mermaidViewerRender = shouldProbeMermaidViewer
      ? await withAuditCheckProgress(
        progress,
        "Verifying Mermaid viewer render",
        "Mermaid viewer rendered",
        () => verifyMermaidViewer(cdp, port, { Session }),
      )
      : null;
    if (mermaidViewerRender != null) {
      live.pluginResults.mermaidFullscreen.viewerRenderProbe = mermaidViewerRender;
      if (!mermaidViewerRender.ok) {
        live.ok = false;
        live.pluginResults.mermaidFullscreen.ok = false;
        live.failures.push({
          plugin: "mermaidFullscreen",
          message: `Mermaid viewer render failed: ${mermaidViewerRender.message || "no SVG rendered"}`,
        });
      }
    }
    appShellStatus = await withAuditProgress(
      progress,
      "Verifying Codex app shell after probes",
      "App shell still healthy",
      () => waitAppShell(cdp, appShellTimeoutMs),
    );
    result = {
      ok: live.ok,
      failures: live.failures,
      expectedWarnings: live.expectedWarnings || [],
      pluginResults: live.pluginResults,
      target: {
        app: path.resolve(args.target),
        remoteDebuggingPort: port,
        url: target?.url,
        webSocketDebuggerUrl: target?.webSocketDebuggerUrl,
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
        sessions: syncResult.sessions,
      },
      fixtureResult: fixtureResult && {
        mode: fixtureResult.mode,
        files: fixtureResult.files,
        credentials: fixtureResult.credentials,
        workRoot: fixtureResult.workRoot,
        threads: fixtureResult.threads?.map((thread) => ({
          id: thread.id,
          title: thread.title,
          cwd: thread.cwd,
          projectId: thread.projectId,
        })),
        browserState: fixtureResult.browserState,
        browserStateReadback: fixtureBrowserStateResult,
      },
      launchResult: launchResult && {
        command: launchResult.command,
        args: launchResult.args,
        pid: launchResult.pid,
        devBundle: launchResult.devBundle,
        instanceIdentity: launchResult.instanceIdentity,
      },
      registeredPlugins: live.registeredPlugins,
      startedPlugins: live.startedPlugins,
      runtimeStatus,
      appShellStatus,
      audit: identity,
      nativeOpenProbes: {
        included: Boolean(args.includeNativeOpenProbes),
      },
      mermaidViewerRender,
      preflight,
    };
    if (args.visualContract === true) {
      const artifactDir = visualArtifactDir ||= defaultAuditArtifactDir({
        version: applyResult?.codexVersion || "unknown",
      });
      visualContractResult = await withAuditProgress(
        progress,
        "Capturing visual contract",
        "Captured visual contract",
        () => captureContract(cdp, {
          artifactDir,
          result,
          reviewPanel: live.pluginResults?.nestedRepositories?.reviewPanel || null,
          commandPalette: live.pluginResults?.sidebarNameBlur?.commandPalette || null,
          preparedReview: preparedReviewContract,
          preparedCommand: preparedCommandContract,
        }),
      );
      result.visualContract = visualContractResult;
      if (!visualContractResult.ok) {
        appendFailure(result, {
          plugin: "audit",
          message: visualContractResult.message || "Visual contract failed",
          details: { artifactDir },
        });
      }
    }
    return result;
  } catch (error) {
    result = {
      ok: false,
      failures: [{
        plugin: "audit",
        message: error.message,
        details: error.details,
      }],
      expectedWarnings: [],
      pluginResults: {},
      target: {
        app: path.resolve(args.target),
        remoteDebuggingPort: port,
        url: target?.url,
        webSocketDebuggerUrl: target?.webSocketDebuggerUrl,
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
        sessions: syncResult.sessions,
      },
      fixtureResult: fixtureResult && {
        mode: fixtureResult.mode,
        files: fixtureResult.files,
        credentials: fixtureResult.credentials,
        workRoot: fixtureResult.workRoot,
        threads: fixtureResult.threads?.map((thread) => ({
          id: thread.id,
          title: thread.title,
          cwd: thread.cwd,
          projectId: thread.projectId,
        })),
        browserState: fixtureResult.browserState,
        browserStateReadback: fixtureBrowserStateResult,
      },
      launchResult: launchResult && {
        command: launchResult.command,
        args: launchResult.args,
        pid: launchResult.pid,
        devBundle: launchResult.devBundle,
        instanceIdentity: launchResult.instanceIdentity,
      },
      registeredPlugins: null,
      startedPlugins: null,
      runtimeStatus,
      appShellStatus,
      audit: identity,
      nativeOpenProbes: {
        included: Boolean(args.includeNativeOpenProbes),
      },
      preflight,
      cdpDiagnostics: summarizeCdpEvents(cdp?.events),
    };
    if (visualContractResult) result.visualContract = visualContractResult;
    return result;
  } finally {
    if (cdp) await cdp.close();
    if (result?.manual || (args.manual && launchResult)) {
      cleanupResult = launchResult
        ? { attempted: false, keptOpen: true, ok: true, pid: launchResult.pid ?? null }
        : { attempted: false, keptOpen: false, ok: true, pid: null };
      if (result) result.cleanupResult = cleanupResult;
    } else {
      if (result && args.keepOpen && launchResult) {
        let stability;
        try {
          stability = await withAuditCheckProgress(
            progress,
            "Checking kept-open audit app stability",
            "Kept-open audit app remained stable",
            () => checkStability(launchResult, {
              electronUserDataPath: args.electronUserDataPath,
            }),
          );
        } catch (error) {
          stability = {
            checked: true,
            ok: false,
            pid: launchResult.pid ?? null,
            alive: null,
            crashDumps: [],
            message: `Could not verify keep-open app stability: ${error.message || String(error)}`,
          };
        }
        result.appStability = stability;
        if (!stability.ok) {
          appendFailure(result, {
            plugin: "audit",
            message: stability.message,
            details: {
              pid: stability.pid,
              alive: stability.alive,
              crashDumps: stability.crashDumps,
            },
          });
        }
      }
      try {
        cleanupResult = launchResult
          ? await withAuditProgress(
              progress,
              "Cleaning up launched audit app",
              args.keepOpen ? "Kept audit app open" : "Cleaned up launched audit app",
              () => cleanupApp(launchResult, { keepOpen: args.keepOpen }),
            )
          : await cleanupApp(launchResult, { keepOpen: false });
      } catch (error) {
        cleanupResult = {
          attempted: Boolean(launchResult?.pid),
          keptOpen: false,
          ok: false,
          pid: launchResult?.pid ?? null,
          message: error.message || String(error),
        };
        progressFail(progress, "Cleaning up launched audit app");
      }
      if (result) result.cleanupResult = cleanupResult;
    }
    progress?.close?.();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const progress = args.jsonl ? createJsonlProgress() : await createAuditProgress(args);
  const result = await runAudit(args, { progress });
  writeAuditOutput(result, args);
  if (!result.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    if (process.argv.includes("--jsonl")) {
      writeJsonl(process.stdout, jsonlRecord("error", { message: error.message || String(error) }));
    } else {
      console.error(error.stack || error.message || String(error));
    }
    process.exitCode = 1;
  });
}

module.exports = {
  auditAttachCommand,
  auditIdentity,
  auditPreflight,
  auditRequiredHostAdapters,
  cleanupLaunchedAuditApp,
  checkKeepOpenAppStability,
  closeActiveVirtualRoute,
  captureVisualContract,
  createAuditProgress,
  createJsonlProgress,
  DEFAULT_PORT,
  DEFAULT_SOURCE,
  DEFAULT_TARGET,
  defaultAuditArtifactDir,
  dismissStartupDialogs,
  failedPatches,
  failedPlugins,
  findFreePort,
  findRendererTargetOnPort,
  formatAuditJson,
  formatAuditResult,
  jsonlRecord,
  listRunningAuditApps,
  listCrashpadPendingDumps,
  parseArgs,
  pluginAuditExpression,
  processIsAlive,
  reloadAuditRenderer,
  runAudit,
  summarizeCdpEvents,
  shouldShowAuditProgress,
  waitForAppShellMounted,
  waitForLiveRuntime,
  verifyMermaidViewerRender,
  verifyProjectSelectorShortcutKey,
  verifyReviewPanelRender,
  verifySidebarBlurCommandPalette,
  writeJsonl,
  writeAuditOutput,
  waitForRendererTarget,
};
