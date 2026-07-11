const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const runtimeRoot = path.join(__dirname, "../src/runtime");

function runtimeFile(filePath) {
  return fs.readFileSync(path.join(runtimeRoot, filePath), "utf8");
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function createElement(tag, className = "") {
  const node = {
    tag,
    tagName: String(tag).toUpperCase(),
    children: [],
    childNodes: [],
    attributes: {},
    dataset: {},
    hidden: false,
    className,
    _innerHTML: "",
    parentElement: null,
    style: {
      values: {},
      setProperty(key, value) {
        this.values[key] = String(value);
      },
      removeProperty(key) {
        delete this.values[key];
      },
    },
    appendChild(child) {
      child.parentElement = this;
      this.children.push(child);
      this.childNodes.push(child);
      return child;
    },
    insertBefore(child, before = null) {
      child.parentElement = this;
      const index = before ? this.children.indexOf(before) : -1;
      if (index >= 0) this.children.splice(index, 0, child);
      else this.children.push(child);
      this.childNodes = this.children.slice();
      return child;
    },
    remove() {
      const siblings = this.parentElement?.children;
      if (siblings) {
        const index = siblings.indexOf(this);
        if (index >= 0) siblings.splice(index, 1);
      }
      this.parentElement = null;
    },
    setAttribute(key, value = "") {
      this.attributes[key] = String(value);
      if (key === "id") this.id = String(value);
      if (key.startsWith("data-")) {
        const dataKey = key.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
        this.dataset[dataKey] = String(value);
      }
    },
    getAttribute(key) {
      return this.attributes[key] ?? null;
    },
    getAttributeNames() {
      return Object.keys(this.attributes);
    },
    removeAttribute(key) {
      delete this.attributes[key];
    },
    toggleAttribute(key, value) {
      if (value) this.setAttribute(key, "");
      else this.removeAttribute(key);
    },
    matches(selector) {
      if (selector === "main") return this.tag === "main";
      if (selector === "aside") return this.tag === "aside";
      if (selector === "button") return this.tag === "button";
      if (selector === "form") return this.tag === "form";
      if (selector === "textarea") return this.tag === "textarea";
      if (selector === "button[type='submit']" || selector === 'button[type="submit"]') return this.tag === "button" && this.attributes.type === "submit";
      if (selector.startsWith(".")) return String(this.className || "").split(/\s+/).includes(selector.slice(1));
      const attr = selector.match(/^\[([^=\]]+)(?:=['"]?([^'"\]]+)['"]?)?\]$/);
      if (attr) return attr[2] == null ? this.attributes[attr[1]] != null : this.attributes[attr[1]] === attr[2];
      return false;
    },
    closest(selector) {
      let current = this;
      while (current) {
        if (current.matches?.(selector)) return current;
        current = current.parentElement;
      }
      return null;
    },
    contains(child) {
      return this === child || this.children.some((candidate) => candidate.contains?.(child));
    },
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    },
    querySelectorAll(selector) {
      const selectors = selector.split(",").map((part) => part.trim());
      const found = [];
      const visit = (child) => {
        if (selectors.some((part) => child.matches?.(part))) found.push(child);
        for (const grandchild of child.children || []) visit(grandchild);
      };
      for (const child of this.children) visit(child);
      return found;
    },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
    getBoundingClientRect() {
      return { left: 0, right: 800, top: 0, bottom: 600, width: 800, height: 600 };
    },
  };
  Object.defineProperty(node, "innerHTML", {
    get() {
      return this._innerHTML;
    },
    set(value) {
      this._innerHTML = String(value);
      this.children = [];
      this.childNodes = [];
      const slotMatches = Array.from(this._innerHTML.matchAll(/<(header|main|footer)[^>]*data-codex-plus-virtual-slot="([^"]+)"[^>]*><\/\1>/g));
      for (const [, childTag, slot] of slotMatches) {
        const child = createElement(childTag);
        child.setAttribute("data-codex-plus-virtual-slot", slot);
        this.appendChild(child);
      }
    },
  });
  return node;
}

function createContext() {
  const body = createElement("body");
  const main = createElement("main");
  const documentElement = createElement("html");
  body.appendChild(main);
  const document = {
    body,
    documentElement,
    createElement,
    querySelector(selector) {
      if (selector === "main") return main;
      return body.querySelector(selector);
    },
    querySelectorAll(selector) {
      return selector === "main" ? [main] : body.querySelectorAll(selector);
    },
    getElementById(id) {
      return body.querySelector(`[id="${id}"]`);
    },
    addEventListener() {},
  };
  const window = {
    CodexPlus: null,
    CodexPlusHost: {},
    document,
    history: { state: null, replaceState() {} },
    location: { hash: "", pathname: "/", search: "" },
    addEventListener() {},
    getComputedStyle() {
      return { display: "block", visibility: "visible" };
    },
    MouseEvent: function MouseEvent(type) { this.type = type; },
    Event: function Event(type) { this.type = type; },
    URLSearchParams,
    setTimeout(callback) {
      callback();
      return 1;
    },
    requestAnimationFrame(callback) {
      callback();
      return 1;
    },
  };
  const context = {
    window,
    globalThis: window,
    document,
    getComputedStyle: window.getComputedStyle,
    MouseEvent: window.MouseEvent,
    Event: window.Event,
    URL,
    URLSearchParams,
    Date,
    setTimeout: window.setTimeout,
    requestAnimationFrame: window.requestAnimationFrame,
  };
  vm.runInNewContext(runtimeFile("api/index.js"), context, { filename: "api/index.js" });
  return { context, window, document, body, main };
}

test("route context exposes stable set, active, clear, and project compatibility APIs", () => {
  const { context, window, body } = createContext();
  vm.runInNewContext(runtimeFile("api/routeContext.js"), context, { filename: "api/routeContext.js" });
  const seen = [];
  const unsubscribe = window.CodexPlus.ui.routeContext.subscribe((value) => seen.push(value));

  const result = window.CodexPlus.ui.routeContext.set({
    routeId: "virtual:one",
    sourceProject: { id: "repo", label: "Repo", cwd: "/repo" },
    activeCwd: "/repo/work",
    workspaceRoot: "/repo/work",
    gitRoot: "/repo",
    branchName: "feature",
    source: "test",
    title: "Virtual task",
  });

  assert.equal(result.ok, true);
  assert.equal(window.CodexPlus.ui.routeContext.active().activeCwd, "/repo/work");
  assert.deepEqual(plain(window.CodexPlus.ui.projectContext.active()), {
    cwd: "/repo/work",
    label: "Repo",
    source: "test",
    routeId: "virtual:one",
    title: "Virtual task",
    workspaceRoot: "/repo/work",
    gitRoot: "/repo",
    threadId: "",
    branchName: "feature",
  });
  assert.equal(body.getAttribute("data-codex-plus-active-project-path"), "/repo/work");
  assert.equal(window.CodexPlus.ui.routeContext.clear("other").context.activeCwd, "/repo/work");
  assert.equal(window.CodexPlus.ui.routeContext.clear("virtual:one").context, null);
  assert.equal(seen.length, 2);
  unsubscribe();
});

test("virtual conversations render through host slots without hiding outer controls", () => {
  const { context, window, main, document } = createContext();
  const header = createElement("header");
  const host = createElement("section", "app-shell-main-content-frame");
  const stale = createElement("div");
  const composer = createElement("form", "composer-surface-chrome");
  host.appendChild(stale);
  main.appendChild(header);
  main.appendChild(host);
  main.appendChild(composer);
  document.querySelector = (selector) => {
    if (selector === "main") return main;
    if (selector === ".app-shell-main-content-frame") return host;
    return main.querySelector(selector);
  };
  document.querySelectorAll = (selector) => {
    if (selector === "main" || selector.includes("main")) return [main];
    return main.querySelectorAll(selector);
  };
  vm.runInNewContext(runtimeFile("api/routeContext.js"), context, { filename: "api/routeContext.js" });
  vm.runInNewContext(runtimeFile("api/composer.js"), context, { filename: "api/composer.js" });
  vm.runInNewContext(runtimeFile("api/virtualConversations.js"), context, { filename: "api/virtualConversations.js" });

  window.CodexPlus.ui.virtualConversations.registerProvider({
    id: "test",
    match: (routeId) => routeId === "virtual:test",
    render({ slots }) {
      slots.header.textContent = "Header";
      slots.transcript.textContent = "Transcript";
      slots.actions.textContent = "Actions";
    },
  });

  const opened = window.CodexPlus.ui.virtualConversations.open("virtual:test");

  assert.equal(opened.ok, true);
  assert.equal(header.hidden, false);
  assert.equal(composer.hidden, false);
  assert.equal(stale.hidden, true);
  assert.equal(window.CodexPlus.ui.virtualConversations.activeRouteId(), "virtual:test");
  assert.equal(host.querySelector('[data-codex-plus-virtual-slot="transcript"]').textContent, "Transcript");
  window.CodexPlus.ui.virtualConversations.close();
  assert.equal(stale.hidden, false);
});

test("virtual conversations close and restore native content on app deep routes", () => {
  const { context, window, main, document } = createContext();
  const host = createElement("section", "app-shell-main-content-frame");
  const settingsContent = createElement("section");
  host.appendChild(settingsContent);
  main.appendChild(host);
  document.querySelector = (selector) => {
    if (selector === ".app-shell-main-content-frame" || selector === "main") return host;
    return main.querySelector(selector);
  };
  document.querySelectorAll = (selector) => selector.includes("main") ? [host] : main.querySelectorAll(selector);
  vm.runInNewContext(runtimeFile("api/routeContext.js"), context, { filename: "api/routeContext.js" });
  vm.runInNewContext(runtimeFile("api/virtualConversations.js"), context, { filename: "api/virtualConversations.js" });
  window.CodexPlus.ui.virtualConversations.registerProvider({
    id: "test",
    match: (routeId) => routeId === "virtual:test",
    render({ container }) {
      container.innerHTML = "virtual";
    },
  });

  assert.equal(window.CodexPlus.ui.virtualConversations.open("virtual:test").ok, true);
  assert.equal(settingsContent.hidden, true);

  window.location.search = "?initialRoute=%2Fsettings%2Fgeneral-settings";
  const refreshed = window.CodexPlus.ui.virtualConversations.refresh();

  assert.equal(refreshed.ok, true);
  assert.equal(refreshed.closed, true);
  assert.equal(window.CodexPlus.ui.virtualConversations.activeRouteId(), null);
  assert.equal(settingsContent.hidden, false);
  assert.equal(settingsContent.getAttribute("data-codex-plus-virtual-hidden"), null);
});

test("virtual conversations fail closed instead of hiding the app root when no main host exists", () => {
  const body = createElement("body");
  const appRoot = createElement("div");
  appRoot.setAttribute("id", "root");
  body.appendChild(appRoot);
  const documentElement = createElement("html");
  const document = {
    body,
    documentElement,
    createElement,
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    getElementById(id) {
      return body.querySelector(`[id="${id}"]`);
    },
    addEventListener() {},
  };
  const window = {
    CodexPlus: null,
    CodexPlusHost: {},
    document,
    history: { state: null, replaceState() {} },
    location: { hash: "", pathname: "/index.html", search: "" },
    addEventListener() {},
    getComputedStyle() {
      return { display: "block", visibility: "visible" };
    },
    URLSearchParams,
  };
  const context = {
    window,
    globalThis: window,
    document,
    getComputedStyle: window.getComputedStyle,
    URLSearchParams,
  };
  vm.runInNewContext(runtimeFile("api/index.js"), context, { filename: "api/index.js" });
  vm.runInNewContext(runtimeFile("api/routeContext.js"), context, { filename: "api/routeContext.js" });
  vm.runInNewContext(runtimeFile("api/virtualConversations.js"), context, { filename: "api/virtualConversations.js" });
  window.CodexPlus.ui.virtualConversations.registerProvider({
    id: "test",
    match: (routeId) => routeId === "virtual:test",
    render({ container }) {
      container.innerHTML = "virtual";
    },
  });

  const opened = window.CodexPlus.ui.virtualConversations.open("virtual:test");

  assert.equal(opened.ok, false);
  assert.equal(opened.error, "virtual-route-host-not-found");
  assert.equal(window.CodexPlus.ui.virtualConversations.activeRouteId(), null);
  assert.equal(appRoot.hidden, false);
  assert.equal(appRoot.getAttribute("data-codex-plus-virtual-hidden"), null);
  assert.equal(document.getElementById("codex-plus-virtual-conversation-root"), null);
});

test("sidebar sections mount only into the native main sidebar model", () => {
  const { context, window, body } = createContext();
  vm.runInNewContext(runtimeFile("api/sidebar.js"), context, { filename: "api/sidebar.js" });
  const sidebar = createElement("aside");
  const pinned = createElement("h2");
  pinned.textContent = "Pinned";
  pinned.setAttribute("data-app-action-sidebar-section-heading", "Pinned");
  const projects = createElement("h2");
  projects.textContent = "Projects";
  projects.setAttribute("data-app-action-sidebar-section-heading", "Projects");
  sidebar.appendChild(pinned);
  sidebar.appendChild(projects);
  body.appendChild(sidebar);

  const result = window.CodexPlus.ui.sidebar.renderSection({
    id: "sample",
    title: "Sample",
    rows: [{ id: "row", kind: "project", label: "Row", color: "#00f" }],
  });

  assert.equal(result.ok, true);
  assert.equal(sidebar.children[1].getAttribute("data-codex-plus-sidebar-section"), "sample");
  result.section.remove();
  sidebar.remove();
  const preferencesSidebar = createElement("aside");
  const general = createElement("h2");
  general.textContent = "General";
  preferencesSidebar.appendChild(general);
  body.appendChild(preferencesSidebar);
  assert.deepEqual(plain(window.CodexPlus.ui.sidebar.renderSection({ id: "sample", title: "Sample" })), {
    ok: false,
    error: "sidebar-host-not-found",
  });
  assert.equal(preferencesSidebar.children.length, 1);
  assert.equal(preferencesSidebar.children[0].textContent, "General");
});

test("composer control exposes input, waiting, stop, and release behavior", () => {
  const { context, window, body, document } = createContext();
  vm.runInNewContext(runtimeFile("api/composer.js"), context, { filename: "api/composer.js" });
  const form = createElement("form");
  form.setAttribute("data-codex-plus-user-entry", "");
  const textarea = createElement("textarea");
  const button = createElement("button");
  button.setAttribute("type", "submit");
  form.appendChild(textarea);
  form.appendChild(button);
  body.appendChild(form);
  document.querySelectorAll = (selector) => selector === "[data-codex-plus-user-entry]" ? [form] : body.querySelectorAll(selector);

  const release = window.CodexPlus.ui.composer.claimControl({
    mode: "waiting",
    placeholder: "Working...",
    stopLabel: "Stop sample run",
    onStop() {},
  });

  assert.equal(form.getAttribute("data-codex-plus-composer-mode"), "waiting");
  assert.equal(button.getAttribute("aria-label"), "Stop sample run");
  assert.equal(textarea.getAttribute("placeholder"), "Working...");
  assert.equal(window.CodexPlus.ui.composer.surfaceProps({})["data-codex-plus-composer-mode"], "waiting");
  release();
  assert.equal(form.getAttribute("data-codex-plus-composer-mode"), null);
});

test("thread side panel openFile uses route context cwd and native opener", async () => {
  const { context, window, body } = createContext();
  vm.runInNewContext(runtimeFile("api/routeContext.js"), context, { filename: "api/routeContext.js" });
  vm.runInNewContext(runtimeFile("api/threadSidePanel.js"), context, { filename: "api/threadSidePanel.js" });
  const aside = createElement("aside");
  const shell = createElement("div");
  shell.setAttribute("data-app-shell-tabs", "true");
  const tablist = createElement("div");
  tablist.setAttribute("role", "tablist");
  const tabpanel = createElement("div");
  tabpanel.setAttribute("role", "tabpanel");
  body.appendChild(aside);
  aside.appendChild(shell);
  shell.appendChild(tablist);
  shell.appendChild(tabpanel);
  const opened = [];
  window.CodexPlusHost.adapters.threadSidePanel.openFile = (filePath, options) => {
    opened.push({ filePath, options });
    tabpanel.setAttribute("data-tab-id", `file:local:${filePath}`);
    tabpanel.textContent = "README.md";
    return { viewer: "reviewFileSource", status: "opened", placement: "right" };
  };
  window.CodexPlus.ui.routeContext.set({
    routeId: "virtual:file",
    sourceProject: { id: "repo", label: "Repo", cwd: "/repo" },
    activeCwd: "/repo/work",
    workspaceRoot: "/repo/work",
    source: "test",
  });

  const result = await window.CodexPlus.ui.threadSidePanel.openFile({ path: "README.md" });

  assert.equal(result.ok, true);
  assert.equal(result.cwd, "/repo/work");
  assert.equal(result.result.viewer, "reviewFileSource");
  assert.deepEqual(plain(opened), [{
    filePath: "README.md",
    options: {
      activate: true,
      isPreview: false,
      resetTabState: true,
      target: "right",
      workspaceRoot: "/repo/work",
    },
  }]);
});

test("thread side panel openFile returns structured failure when native opener fails", async () => {
  const { context, window } = createContext();
  let now = 0;
  context.Date = { now: () => { now += 10000; return now; } };
  vm.runInNewContext(runtimeFile("api/threadSidePanel.js"), context, { filename: "api/threadSidePanel.js" });

  const missing = await window.CodexPlus.ui.threadSidePanel.openFile({ path: "README.md" });
  assert.deepEqual(plain(missing), {
    ok: false,
    native: false,
    error: "native-file-opener-unavailable",
    message: "native-file-opener-unavailable: ChatGPT file opener hook did not produce a host tab",
    path: "README.md",
    cwd: "",
  });

  window.CodexPlusHost.adapters.threadSidePanel.openFile = () => {
    throw new Error("Missing scope instance");
  };
  const failed = await window.CodexPlus.ui.threadSidePanel.openFile({ path: "README.md" });
  assert.deepEqual(plain(failed), {
    ok: false,
    native: false,
    error: "native-file-opener-failed",
    message: "Missing scope instance",
    path: "README.md",
    cwd: "",
  });
});
