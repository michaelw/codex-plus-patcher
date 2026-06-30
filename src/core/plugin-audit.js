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
  buildAuditFixture,
  seedAuditFixtureBrowserState,
} = require("./audit-fixture");
const { patchCodexApp } = require("./patch-engine");
const { patchSets } = require("../patches");
const packageJson = require("../../package.json");

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
    json: false,
    keepOpen: false,
    includeNativeOpenProbes: false,
    noProgress: false,
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
    else if (arg === "--quiet") args.quiet = true;
    else if (arg === "--no-progress") args.noProgress = true;
    else if (arg === "--keep-open") args.keepOpen = true;
    else if (arg === "--use-live-source-home") args.useLiveSourceHome = true;
    else if (arg === "--include-native-open-probes") args.includeNativeOpenProbes = true;
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

async function verifyProjectSelectorShortcutKey(cdp, { wait = delay, timeoutMs = 5000 } = {}) {
  const setup = await cdp.evaluate(`new Promise((resolve) => {
    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }));
    const newChatButton = Array.from(document.querySelectorAll("button")).find((button) => {
      const rect = button.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (button.innerText || "").includes("New chat");
    });
    newChatButton?.click?.();
    let attempts = 0;
    const check = () => {
      const triggerCount = document.querySelectorAll("[data-codex-plus-project-selector-trigger]").length;
      if (triggerCount > 0 || attempts >= 30) {
        resolve({ triggerCount, clickedNewChat: Boolean(newChatButton) });
        return;
      }
      attempts += 1;
      setTimeout(check, 100);
    };
    check();
  })`);
  if (!setup?.triggerCount) {
    return { ok: false, ...setup, message: "Project selector shortcut trigger marker is missing from the main composer" };
  }

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
      const fuzzyDom = await cdp.evaluate(`new Promise((resolve) => {
        const visible = (element) => {
          if (!element) return false;
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        };
        const normalize = (value) => String(value || "").replace(/\\s+/g, " ").trim();
        const menu = Array.from(document.querySelectorAll("[data-radix-menu-content], [data-radix-popper-content-wrapper], [role='menu']"))
          .find(visible) || document.body;
        const input = document.querySelector("input[placeholder='Search projects']");
        const collectLabels = () => {
          const labels = [];
          const seen = new Set();
          for (const element of Array.from(menu.querySelectorAll("[role='menuitem'], [role='option'], button, a, div, span"))) {
            if (!visible(element)) continue;
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
          resolve({
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
        const finishWhenReady = () => {
          const resultLabels = collectLabels();
          const noProjectsFoundVisible = Boolean(Array.from(menu.querySelectorAll("*")).find((element) => visible(element) && normalize(element.textContent) === "No projects found"));
          const selectedProjectStillVisible = resultLabels.some((label) => label.includes(selectedLabel));
          const highlightCount = Array.from(menu.querySelectorAll("strong")).filter(visible).length;
          if (!selectedProjectStillVisible || highlightCount === 0) {
            if (Date.now() - startedAt < 3000) {
              setTimeout(finishWhenReady, 100);
              return;
            }
          }
          resolve({
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
      const ok = Boolean(
        fuzzyDom?.suitableProjectFound &&
        fuzzyDom.selectedProjectStillVisible &&
        fuzzyDom.highlightCount > 0 &&
        !fuzzyDom.noProjectsFoundVisible,
      );
      return {
        ok,
        ...setup,
        ...status,
        fuzzyDom,
        message: ok ? undefined : "Project selector fuzzy filtering did not preserve and highlight a visible project",
      };
    }
    await wait(100);
  }
  return { ok: false, ...setup, ...status, message: `Cmd+. did not open the project selector: ${JSON.stringify(status)}` };
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
    const visibleElements = (selector) => Array.from(document.querySelectorAll(selector)).filter(visible);
    const exactVisibleText = (text) => visibleElements("button, [role='tab'], [role='button'], div, span, p")
      .some((element) => normalize(element.textContent) === text);
    const containsVisibleText = (text) => visibleElements("button, [role='tab'], [role='button'], div, span, p, h1, h2, h3")
      .some((element) => normalize(element.textContent).includes(text));
    const reviewControl = () => visibleElements("button, [role='tab'], [role='button']")
      .find((element) => {
        const text = normalize(element.textContent);
        const label = normalize(element.getAttribute("aria-label"));
        return text === "Review" || label === "Review" || text === "Changes" || label === "Changes";
      });
    const reviewSelected = () => visibleElements("[role='tab'][aria-selected='true'], button[aria-selected='true'], [data-state='active']")
      .some((element) => normalize(element.textContent) === "Review");
    const nativeReviewSourceVisible = () => {
      const text = normalize(document.body.textContent).replace(/→/g, "->");
      return /HEAD\\s*(->)?\\s*main/.test(text) || text.includes("Unstaged") || (text.includes("Local") && text.includes("main"));
    };
    const clickNestedFixtureThread = () => {
      const row = visibleElements("[data-app-action-sidebar-thread-row]")
        .find((element) => normalize(element.textContent).includes("Fixture: nested repos before branch selection"));
      if (!row) return false;
      row.click();
      return true;
    };
    const nestedBranchPickers = () => visibleElements("[data-codex-plus-repo-branch-picker]")
      .filter((element) => ["nested", "submodule", "configured"].includes(element.getAttribute("data-codex-plus-repo-kind")));
    const selectUnstagedReviewSource = () => {
      const item = visibleElements("[role='menuitem'], [cmdk-item], [data-radix-collection-item]")
        .find((element) => ["Unstaged", "Show unstaged changes"].includes(normalize(element.textContent)));
      if (item) {
        item.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        item.click();
        return true;
      }
      const reviewPanel = visibleElements("[role='tabpanel'][aria-label='Review']")[0];
      const controls = (reviewPanel ? Array.from(reviewPanel.querySelectorAll("button, [role='button']")).filter(visible) : visibleElements("button, [role='button']"));
      const sourceTrigger = controls
        .find((element) => normalize(element.textContent) === "Branch" || normalize(element.getAttribute("title")) === "Switch branch");
      if (sourceTrigger) {
        sourceTrigger.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        sourceTrigger.click();
      }
      return false;
    };
    const loadNestedBranchPicker = () => {
      const picker = nestedBranchPickers()[0];
      if (!picker) return false;
      picker.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      picker.focus?.();
      picker.click?.();
      return true;
    };
    const nestedBranchPickerPopulated = () => nestedBranchPickers().some((picker) => {
      const branchCount = Number(picker.getAttribute("data-codex-plus-repo-branch-count") || "0");
      if (Number.isFinite(branchCount) && branchCount > 0) return true;
      if (picker.tagName === "SELECT") {
        return Array.from(picker.options || []).some((option) => normalize(option.textContent) && normalize(option.textContent) !== "Unstaged" && normalize(option.textContent) !== "Loading...");
      }
      return normalize(document.body.textContent).includes("main");
    });
    const nestedBranchPickerOptionCounts = () => nestedBranchPickers().map((picker) => Number(picker.getAttribute("data-codex-plus-repo-branch-count") || "0"));
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
      clickedNestedBranchPicker: Boolean(extra.clickedNestedBranchPicker),
      requiredUnstagedFallback: Boolean(extra.requiredUnstagedFallback),
      selectedUnstagedFallback: Boolean(extra.selectedUnstagedFallback),
      selectedReview: reviewSelected(),
      boundaryVisible: containsVisibleText("Tab content couldn't render"),
      tryAgainVisible: exactVisibleText("Try again"),
      repoHeaderVisible: containsVisibleText("Codex Plus repositories"),
      mainVisible: containsVisibleText("Main"),
      nativeReviewSourceVisible: nativeReviewSourceVisible(),
      nestedRepoVisible: containsVisibleText("alpha-module") || containsVisibleText("beta-module"),
      nestedBranchPickerCount: nestedBranchPickers().length,
      nestedBranchPickerPopulated: nestedBranchPickerPopulated(),
      nestedBranchPickerOptionCounts: nestedBranchPickerOptionCounts(),
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
	        let clickedNestedBranchPicker = false;
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
	          if (!clickedNestedBranchPicker && containsVisibleText("Codex Plus repositories") && (containsVisibleText("alpha-module") || containsVisibleText("beta-module"))) {
	            clickedNestedBranchPicker = loadNestedBranchPicker();
	          }
	          if (nativeReviewSourceVisible() && !containsVisibleText("Codex Plus repositories") && containsVisibleText("No sources yet") && !selectedUnstagedFallback) {
	            requiredUnstagedFallback = true;
	            selectedUnstagedFallback = selectUnstagedReviewSource() || selectedUnstagedFallback;
	          }
	          const current = snapshot({
	            candidateCount: candidates.length,
	            attemptedCandidates: index,
	            reviewControlFound: true,
	            clickedReview: true,
	            clickedNestedFixtureThread,
	            clickedNestedBranchPicker,
	            requiredUnstagedFallback,
	            selectedUnstagedFallback,
	          });
          if ((
            current.repoHeaderVisible &&
            current.mainVisible &&
            current.nativeReviewSourceVisible &&
            current.nestedRepoVisible &&
            current.nestedBranchPickerPopulated &&
            current.rawNestedDiffFallbackCount === 0 &&
            current.reviewDiffCardCount > 0
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
  if (status?.requiredUnstagedFallback && !status.selectedUnstagedFallback && typeof cdp.send === "function") {
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
      const item = Array.from(document.querySelectorAll("[role='menuitem'], [data-radix-collection-item]"))
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
        if (Number.isFinite(branchCount) && branchCount > 0) return true;
        if (picker.tagName === "SELECT") {
          return Array.from(picker.options || []).some((option) => normalize(option.textContent) && normalize(option.textContent) !== "Unstaged" && normalize(option.textContent) !== "Loading...");
        }
        return normalize(document.body.textContent).includes("main");
      });
      const nestedBranchPickerOptionCounts = () => nestedBranchPickers().map((picker) => Number(picker.getAttribute("data-codex-plus-repo-branch-count") || "0"));
      const rawNestedDiffFallbackCount = () => visibleElements("pre")
        .filter((element) => /diff --git/.test(element.textContent || ""))
        .length;
      const reviewDiffCardCount = () => visibleElements(".codex-review-diff-card").length;
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
        nestedRepoVisible: containsVisibleText("alpha-module") || containsVisibleText("beta-module"),
        nestedBranchPickerCount: nestedBranchPickers().length,
        nestedBranchPickerPopulated: nestedBranchPickerPopulated(),
        nestedBranchPickerOptionCounts: nestedBranchPickerOptionCounts(),
        rawNestedDiffFallbackCount: rawNestedDiffFallbackCount(),
        reviewDiffCardCount: reviewDiffCardCount(),
      };
    })()`);
  }
  const ok = Boolean(
    finalStatus?.reviewControlFound &&
    finalStatus.clickedReview &&
    finalStatus.selectedReview &&
    !finalStatus.boundaryVisible &&
    !finalStatus.tryAgainVisible &&
    finalStatus.repoHeaderVisible &&
    finalStatus.mainVisible &&
    finalStatus.nativeReviewSourceVisible &&
    finalStatus.nestedRepoVisible &&
    finalStatus.nestedBranchPickerPopulated &&
    finalStatus.nestedBranchPickerOptionCounts?.every((count) => count > 0) &&
    finalStatus.rawNestedDiffFallbackCount === 0 &&
    finalStatus.reviewDiffCardCount > 0,
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
  electronUserDataPath = DEFAULT_ELECTRON_USER_DATA,
  execFileSync = childProcess.execFileSync,
} = {}) {
  const targetBinary = path.join(path.resolve(targetApp), "Contents/MacOS/Codex");
  const userDataArg = `--user-data-dir=${path.resolve(electronUserDataPath)}`;
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
      if (!command.startsWith(targetBinary) || !command.includes(userDataArg)) return null;
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
        hasStartupLoader: Boolean(document.querySelector("#root .startup-loader")),
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

function formatAuditResult(result, { quiet = false } = {}) {
  const expectedWarnings = result.expectedWarnings || [];
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

function shouldShowAuditProgress(args, stream = process.stdout) {
  return !args.json && !args.quiet && !args.noProgress && stream != null;
}

function timestamp(date = new Date()) {
  return date.toISOString();
}

async function createAuditProgress(args, {
  stream = process.stdout,
  importOra = (specifier) => import(specifier),
  now = () => new Date(),
} = {}) {
  if (!shouldShowAuditProgress(args, stream)) return null;
  if (stream.isTTY) {
    const { default: ora } = await importOra("ora");
    const spinner = ora({ color: "cyan", spinner: "dots", stream });
    let active = false;
    return {
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
    };
  }
  return {
    start(text) {
      stream.write(`[${timestamp(now())}] ${text}\n`);
    },
    succeed(text) {
      stream.write(`[${timestamp(now())}] OK ${text}\n`);
    },
    fail(text) {
      stream.write(`[${timestamp(now())}] FAIL ${text}\n`);
    },
  };
}

function progressStart(progress, text) {
  progress?.start?.(text);
}

function progressSucceed(progress, text) {
  progress?.succeed?.(text);
}

function progressFail(progress, text) {
  progress?.fail?.(text);
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

async function cleanupLaunchedAuditApp(launchResult, {
  keepOpen = false,
  kill = process.kill,
  wait = delay,
} = {}) {
  const pid = launchResult?.pid;
  if (keepOpen) return { attempted: false, keptOpen: true, ok: true, pid };
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

function pluginAuditExpression({ includeNativeOpenProbes = false } = {}) {
  const options = JSON.stringify({ includeNativeOpenProbes });
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
      .find((row) => normalize(row.textContent).includes("Fixture: no project chat"));
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
    const waitForMountedProjectComposer = async (expectedAccents, timeoutMs = 20000) => {
      const expected = Array.isArray(expectedAccents) ? expectedAccents : [expectedAccents].filter(Boolean);
      const startedAt = Date.now();
      while (Date.now() - startedAt < timeoutMs) {
        const editor = document.querySelector("[data-codex-composer]");
        const surface = editor?.closest("[data-codex-plus-user-entry]") || editor?.closest(".composer-surface-chrome");
        if (surface) {
          const computed = getComputedStyle(surface);
          const surfaceAccent = computed.getPropertyValue("--codex-plus-project-accent").trim();
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
      };
    };
    const composerPermissionPickerStatus = () => {
      const editor = document.querySelector("[data-codex-composer]");
      const labels = ["Full access", "Ask for approval", "Approve for me", "Custom"];
      const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
      const rgb = (value) => {
        const match = String(value || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
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
      const repositoryTargetRequests = [];
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
          useEffect(fn) {
            const cleanup = fn();
            if (typeof cleanup === "function") cleanup();
          },
        },
        gitRequest() {
          return {
        request(request) {
          repositoryTargetRequests.push(request);
          return Promise.resolve({
            main: { id: "main:/tmp/codex-plus-audit", kind: "main", path: ".", label: "Main", cwd: "/tmp/codex-plus-audit" },
            repositories: [{ id: "repo:pkg", kind: "nested", path: "pkg", label: "pkg", cwd: "/tmp/codex-plus-audit/pkg" }],
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
      if (repositoryTargetParams.cwd !== "/tmp/codex-plus-audit") {
        throw new Error(`Repository target request used wrong cwd: ${JSON.stringify(repositoryTargetParams.cwd)}`);
      }
      if (repositoryTargetParams.hostId !== "local" || repositoryTargetParams.hostConfig?.id !== "local") {
        throw new Error(`Repository target request used wrong host context: ${JSON.stringify(repositoryTargetParams)}`);
      }
      if (repositoryTargetParams.operationSource !== "codex_plus_review") {
        throw new Error(`Repository target request used wrong operation source: ${JSON.stringify(repositoryTargetParams.operationSource)}`);
      }
      pass("nestedRepositories", {
        ...details,
        hostModuleRegistered,
        reviewWrapped: true,
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
      const projectlessChatRow = await waitForProjectlessChatRow();
      const projectlessChatComputed = projectlessChatRow ? getComputedStyle(projectlessChatRow) : null;
      const projectlessChat = projectlessChatRow ? {
        marked: projectlessChatRow.hasAttribute("data-codex-plus-project-sidebar-color"),
        accent: projectlessChatComputed.getPropertyValue("--codex-plus-project-accent").trim(),
        background: projectlessChatComputed.backgroundColor,
        text: normalize(projectlessChatRow.textContent),
      } : null;
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
          if (!selectedProjectAccent) {
            selectedProjectAccent = projectAccent;
            threadRows[0].click();
          }
          const unstyledRows = threadRows.filter((row) => {
            const computed = getComputedStyle(row);
            const rowAccent = computed.getPropertyValue("--codex-plus-project-accent").trim();
            return rowAccent !== projectAccent || isTransparentColor(computed.backgroundColor);
          });
          return list.hasAttribute("data-codex-plus-project-sidebar-color") &&
            listAccent === projectAccent &&
            !isTransparentColor(listBackground) &&
            unstyledRows.length === 0
            ? null
            : {
                hasProjectRow: Boolean(projectRow),
                accentMatched: listAccent === projectAccent,
                listBackgroundTransparent: isTransparentColor(listBackground),
                threadRows: threadRows.length,
                unstyledRows: unstyledRows.length,
                listMarked: list.hasAttribute("data-codex-plus-project-sidebar-color"),
              };
        })
        .filter(Boolean);
      const expectedComposerAccents = Array.from(new Set([selectedProjectAccent, ...liveAccents])).filter(Boolean);
      if (expectedComposerAccents.length > 0) mountedComposer = await waitForMountedProjectComposer(expectedComposerAccents);
      if (!accent) throw new Error("Project accent was not computed");
      if (!matchingProps) throw new Error("Project, thread, bubble, and composer props do not share an accent");
      if (liveProjectRows.length < 10) throw new Error(`Expected at least 10 styled project rows, found ${liveProjectRows.length}`);
      if (new Set(liveProjectAccents).size < 6) throw new Error(`Expected at least 6 distinct project accents, found ${new Set(liveProjectAccents).size}`);
      if (!projectlessChat?.marked || !projectlessChat?.accent || isTransparentColor(projectlessChat?.background)) {
        const rowTitles = visibleElements("[data-app-action-sidebar-thread-row]").map((row) => normalize(row.textContent)).slice(0, 12);
        throw new Error(`Projectless chat row is not styled: ${JSON.stringify({ projectlessChat, rowTitles })}`);
      }
      if (unstyledProjectThreadLists.length > 0) {
        throw new Error(`Project sidebar child rows or list containers are not styled like their project rows: ${JSON.stringify(unstyledProjectThreadLists.slice(0, 4))}`);
      }
      if (!mountedComposer?.marked || !mountedComposer?.projectMarked || !expectedComposerAccents.includes(mountedComposer?.accent)) {
        throw new Error(`Mounted composer does not carry the selected project accent: ${JSON.stringify(mountedComposer)}`);
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
        styledProjectThreadLists: projectThreadRowCount,
        projectChildRowsAvailable: projectThreadRowCount > 0,
        mountedComposer,
      });
    } catch (error) {
      fail("projectColors", error);
    }

    try {
      const details = checkCommon("projectPathHeader");
      const plugin = window.CodexPlus.plugins.get("projectPathHeader");
      const accessory = plugin?.exports?.ProjectPathAccessory?.({ context: { cwd: "/tmp/example" }, jsx, jsxs });
      const headerAccessory = plugin?.exports?.ProjectPathAccessory?.({
        context: {
          header: {
            projectName: {
              props: {
                group: {
                  projectKind: "local",
                  projectId: "/tmp/header-project-id",
                  path: "/tmp/header-project",
                },
              },
            },
          },
        },
        jsx,
        jsxs,
      });
      const missing = plugin?.exports?.ProjectPathAccessory?.({ context: {}, jsx, jsxs });
      if (accessory == null) throw new Error("Project path accessory was not rendered for cwd");
      if (headerAccessory == null) throw new Error("Project path accessory was not rendered for header project path");
      if (headerAccessory?.props?.title !== "/tmp/header-project") {
        throw new Error(`Project path accessory used wrong header path: ${JSON.stringify(headerAccessory?.props?.title)}`);
      }
      if (missing != null) throw new Error("Project path accessory rendered without cwd");
      pass("projectPathHeader", { ...details, renderedForCwd: true, renderedForHeaderProjectPath: true, skippedMissingCwd: true });
    } catch (error) {
      fail("projectPathHeader", error);
    }

    try {
      const status = composerPermissionPickerStatus();
      if (status.editorMounted && status.editorEditable && status.triggerMounted) {
        const lowOpacity = Number(status.triggerOpacity) < 0.5;
        const lowContrast = status.triggerContrast != null && status.triggerContrast < 4.5;
        if (lowOpacity || lowContrast || status.labelTextFillTransparent) {
          throw new Error(`Composer permissions picker text is unreadable: ${JSON.stringify(status)}`);
        }
        const ariaDisabled = status.triggerAriaDisabled === "true";
        const visuallyDisabled = /\bopacity-40\b/.test(status.triggerClassName);
        if (status.triggerDisabled || ariaDisabled || visuallyDisabled) {
          warn(
            "audit",
            "composer-permission-picker-disabled",
            "Composer permissions picker is disabled while the composer is editable",
            status,
          );
        }
      }
      if (!status.editorMounted || !status.triggerMounted) {
        throw new Error(`Composer permissions picker was not found: ${JSON.stringify(status)}`);
      }
      pass("audit", { composerPermissionPicker: status });
    } catch (error) {
      fail("audit", error);
    }

    try {
      const details = checkCommon("sidebarNameBlur");
      const metadata = window.CodexPlus.ui.commands.commandMetadata().some((command) => command.id === "codexPlusToggleSidebarNameBlur");
      if (!metadata) throw new Error("Sidebar blur command metadata is missing");
      const commandPalette = await rendererSourceEvidence([
        "globalThis.CodexPlus?.ui?.commands?.commandMetadata",
        "e.title??e.electron?.menuTitle??",
      ]);
      if (!commandPalette.evidence["globalThis.CodexPlus?.ui?.commands?.commandMetadata"]) {
        throw new Error("Sidebar blur command is not wired into the renderer command palette");
      }
      if (!commandPalette.evidence["e.title??e.electron?.menuTitle??"]) {
        throw new Error("Renderer command palette cannot read literal Codex Plus command titles");
      }
      const root = document.documentElement;
      const previous = root.getAttribute("data-codex-plus-sidebar-names-blurred");
      let toggled = false;
      let filter = "";
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
      } finally {
        if (previous == null) root.removeAttribute("data-codex-plus-sidebar-names-blurred");
        else root.setAttribute("data-codex-plus-sidebar-names-blurred", previous);
      }
      if (!toggled) throw new Error("Sidebar blur command did not toggle the root marker");
      if (!String(filter).includes("blur")) throw new Error("Sidebar blur computed style is not active");
      const restored = root.getAttribute("data-codex-plus-sidebar-names-blurred") === previous;
      if (!restored) throw new Error("Sidebar blur probe did not restore its previous state");
      pass("sidebarNameBlur", { ...details, metadata, commandPalette, toggled, filter, restored });
    } catch (error) {
      fail("sidebarNameBlur", error);
    }

    try {
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

    try {
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
      const newChatButton = Array.from(document.querySelectorAll("button")).find((button) => {
        const rect = button.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && (button.innerText || "").includes("New chat");
      });
      newChatButton?.click?.();
      let triggerCount = 0;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        triggerCount = document.querySelectorAll("[data-codex-plus-project-selector-trigger]").length;
        if (triggerCount > 0) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (triggerCount === 0) throw new Error("Project selector shortcut trigger marker is missing from the main composer");
      const syntheticShortcut = await new Promise((resolve) => {
        const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: ".", metaKey: true });
        document.dispatchEvent(event);
        setTimeout(() => {
          const searchInput = document.querySelector("input[placeholder='Search projects']");
          const menu = document.querySelector("[data-radix-menu-content], [data-radix-popper-content-wrapper], [role='menu']");
          resolve({
            defaultPrevented: event.defaultPrevented,
            opened: Boolean(searchInput || menu),
            activePlaceholder: document.activeElement?.getAttribute?.("placeholder") ?? "",
          });
        }, 400);
      });
      document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }));
      pass("projectSelectorShortcut", { ...details, ranked, highlightCount, selected, triggerCount, syntheticShortcut });
    } catch (error) {
      fail("projectSelectorShortcut", error);
    }

    try {
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

    for (const id of requiredPlugins) {
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
  const waitRenderer = operations.waitForRendererTarget || waitForRendererTarget;
  const Session = operations.CdpSession || CdpSession;
  const waitRuntime = operations.waitForLiveRuntime || waitForLiveRuntime;
  const waitAppShell = operations.waitForAppShellMounted || waitForAppShellMounted;
  const verifyMermaidViewer = operations.verifyMermaidViewerRender || verifyMermaidViewerRender;
  const verifyProjectSelectorShortcut = operations.verifyProjectSelectorShortcutKey || verifyProjectSelectorShortcutKey;
  const verifyReviewPanel = operations.verifyReviewPanelRender || verifyReviewPanelRender;
  const cleanupApp = operations.cleanupLaunchedAuditApp || cleanupLaunchedAuditApp;
  const checkStability = operations.checkKeepOpenAppStability || checkKeepOpenAppStability;
  const preflightAudit = operations.auditPreflight || auditPreflight;
  const readIdentity = operations.auditIdentity || auditIdentity;
  let preflight = null;
  let port = args.remoteDebuggingPort;
  const identity = readIdentity();
  let applyResult = null;
  let syncResult = null;
  let fixtureResult = null;
  let launchResult = null;
  let target = null;
  let cdp = null;
  let runtimeStatus = null;
  let appShellStatus = null;
  let cleanupResult = null;
  let result = null;
  try {
    preflight = await preflightAudit(args, { findPort });
    port = preflight.port;
    if (args.apply) {
      applyResult = await withAuditProgress(
        progress,
        `Applying patch set to ${args.target}`,
        "Applied patch set",
        () => patchApp({
          sourceApp: args.source,
          targetApp: args.target,
          patchSets,
          progress: undefined,
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
      launchResult = await withAuditProgress(
        progress,
        `Launching Codex Plus on port ${port}`,
        `Launched app on port ${port}`,
        () => launchApp({
          targetApp: args.target,
          devHome: args.devHome,
          electronUserDataPath: args.electronUserDataPath,
          remoteDebuggingPort: port,
          devInstanceId: args.devInstanceId,
        }),
      );
    }
    target = await withAuditProgress(
      progress,
      "Waiting for app://-/index.html",
      "Found app://-/index.html",
      () => waitRenderer(port),
    );
    cdp = new Session(target.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send("Runtime.enable");
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
      () => waitAppShell(cdp),
    );
    if (fixtureResult) {
      await withAuditProgress(
        progress,
        "Seeding fixture browser state",
        "Seeded fixture browser state",
        () => seedFixtureBrowserState(cdp, fixtureResult),
      );
    }
    const live = await withAuditProgress(
      progress,
      "Running plugin probes",
      "Probed plugins",
      () => cdp.evaluate(pluginAuditExpression({ includeNativeOpenProbes: args.includeNativeOpenProbes })),
    );
    if (live.pluginResults?.projectSelectorShortcut?.ok) {
      const shortcut = await withAuditProgress(
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
      const reviewPanel = await withAuditProgress(
        progress,
        "Verifying Review panel render",
        "Review panel rendered",
        () => verifyReviewPanel(cdp),
      );
      live.pluginResults.nestedRepositories.reviewPanel = reviewPanel;
      if (!reviewPanel.ok) {
        live.ok = false;
        live.pluginResults.nestedRepositories.ok = false;
        live.failures.push({
          plugin: "nestedRepositories",
          message: reviewPanel.message || "Review panel did not render nested repository content",
        });
      }
    }
    const shouldProbeMermaidViewer = live.pluginResults?.mermaidFullscreen?.ok;
    const mermaidViewerRender = shouldProbeMermaidViewer
      ? await withAuditProgress(
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
      () => waitAppShell(cdp),
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
    };
    return result;
  } finally {
    if (cdp) await cdp.close();
    if (result && args.keepOpen && launchResult) {
      let stability;
      try {
        stability = await checkStability(launchResult, {
          electronUserDataPath: args.electronUserDataPath,
        });
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
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const progress = await createAuditProgress(args);
  const result = await runAudit(args, { progress });
  process.stdout.write(args.json ? formatAuditJson(result) : formatAuditResult(result, args));
  if (!result.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  auditAttachCommand,
  auditIdentity,
  auditPreflight,
  cleanupLaunchedAuditApp,
  checkKeepOpenAppStability,
  createAuditProgress,
  DEFAULT_PORT,
  DEFAULT_SOURCE,
  DEFAULT_TARGET,
  failedPatches,
  failedPlugins,
  findFreePort,
  findRendererTargetOnPort,
  formatAuditJson,
  formatAuditResult,
  listRunningAuditApps,
  listCrashpadPendingDumps,
  parseArgs,
  pluginAuditExpression,
  processIsAlive,
  runAudit,
  shouldShowAuditProgress,
  waitForAppShellMounted,
  waitForLiveRuntime,
  verifyMermaidViewerRender,
  verifyProjectSelectorShortcutKey,
  verifyReviewPanelRender,
  waitForRendererTarget,
};
