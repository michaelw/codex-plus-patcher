const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { pathToFileURL } = require("node:url");
const aharnessService = require("./aharnessService.js");

function create({ electron, aharnessRuntimeLoader } = {}) {
  let nativeMenuItems = [];
  let refreshApplicationMenu = null;
  const aharness = aharnessService.create({ runtimeLoader: aharnessRuntimeLoader });

  function menuSnapshot(menu) {
    return menu?.items?.map((item) => ({
      id: item.id,
      label: item.label,
      enabled: item.enabled,
      visible: item.visible,
      accelerator: item.accelerator,
      submenu: menuSnapshot(item.submenu),
    }));
  }

  function logMenuDiagnostics() {
    try {
      const menu = menuSnapshot(electron.Menu.getApplicationMenu()) ?? [];
      const text = JSON.stringify(menu);
      const hasOpenDeveloperTools = text.includes("codexPlusOpenDevTools") || text.includes("Open Developer Tools");
      if (process.env.CODEX_PLUS_MENU_DIAGNOSTICS === "1" || !hasOpenDeveloperTools) {
        console.log(`[Codex Plus menu diagnostics] ${JSON.stringify({ hasOpenDeveloperTools, menu })}`);
      }
    } catch (error) {
      console.log(`[Codex Plus menu diagnostics] ${JSON.stringify({ error: String(error?.message ?? error) })}`);
    }
  }

  function openDevTools(event) {
    try {
      const webContents = event?.sender;
      if (typeof webContents?.openDevTools !== "function") return { ok: false };
      webContents.openDevTools();
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  function runRendererCommand(commandId) {
    try {
      const event = focusedEvent();
      const webContents = event?.sender;
      if (typeof webContents?.executeJavaScript !== "function") return { ok: false };
      webContents.executeJavaScript(`window.CodexPlus?.commands?.run(${JSON.stringify(String(commandId))})`).catch(() => {});
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  function focusedEvent() {
    const window = electron.BrowserWindow.getFocusedWindow();
    return window && !window.isDestroyed() ? { sender: window.webContents } : null;
  }

  function runNativeMenuRequest(request) {
    switch (request?.method) {
      case "devtools/open":
        return openDevTools(focusedEvent());
      case "renderer/command":
        return runRendererCommand(request.params?.id);
      case "aharness/run/list":
      case "aharness/commands/list":
      case "aharness/project/config":
        return aharness.request(request.method, request.params);
      default:
        return { ok: false };
    }
  }

  function templateItems(menuId) {
    return nativeMenuItems
      .filter((item) => item.menuId === menuId)
      .map((item) => ({
        id: item.id,
        label: item.label,
        click: () => {
          runNativeMenuRequest(item.nativeRequest);
        },
      }));
  }

  function registerNativeMenuItem(item) {
    if (item?.id == null || item?.menuId == null || item?.label == null || item?.nativeRequest?.method == null) {
      return { ok: false };
    }
    const nextItem = {
      id: String(item.id),
      menuId: String(item.menuId),
      label: String(item.label),
      nativeRequest: {
        method: String(item.nativeRequest.method),
        params: item.nativeRequest.params,
      },
      afterId: item.afterId == null ? null : String(item.afterId),
      afterLabel: item.afterLabel == null ? null : String(item.afterLabel),
    };
    nativeMenuItems = nativeMenuItems.filter((existing) => existing.id !== nextItem.id);
    nativeMenuItems.push(nextItem);
    try {
      refreshApplicationMenu?.();
    } catch {}
    logMenuDiagnostics();
    return { ok: true };
  }

  function openMermaidViewer(params) {
    const html = params?.html;
    if (typeof html !== "string" || html.length === 0) return { ok: false };
    const filePath = path.join(os.tmpdir(), `codex-plus-mermaid-${randomUUID()}.html`);
    fs.writeFileSync(filePath, html, "utf8");
    const window = new electron.BrowserWindow({
      height: 900,
      resizable: true,
      show: true,
      title: "Mermaid diagram viewer",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
      width: 1400,
    });
    window.webContents.setWindowOpenHandler((event) => {
      try {
        const url = new URL(event.url);
        if (url.protocol === "https:" && url.hostname === "mermaid.live") electron.shell.openExternal(event.url);
      } catch {}
      return { action: "deny" };
    });
    window.on("closed", () => {
      try {
        fs.unlinkSync(filePath);
      } catch {}
    });
    window.loadURL(pathToFileURL(filePath).toString()).catch(() => {});
    return { ok: true };
  }

  function registerNativeRequest({ isTrustedIpcEvent }) {
    return electron.ipcMain.handle("codex_plus:native-request", async (event, request) => {
      if (!isTrustedIpcEvent(event)) return { ok: false };
      switch (request?.method) {
        case "aharness/commands/list":
        case "aharness/packages/install":
        case "aharness/packages/uninstall":
        case "aharness/verify":
        case "aharness/project/config":
        case "aharness/run/start":
        case "aharness/run/list":
        case "aharness/run/read":
        case "aharness/run/reply":
        case "aharness/run/cancel":
        case "aharness/run/artifact/read":
          return aharness.request(request.method, request.params);
        case "native-menu/register-item":
          return registerNativeMenuItem(request.params);
        case "devtools/open":
          return openDevTools(event);
        case "mermaid/openViewer":
          return openMermaidViewer(request.params);
        default:
          return { ok: false };
      }
    });
  }

  function setRefreshApplicationMenu(refresh) {
    refreshApplicationMenu = refresh;
  }

  return {
    aharness,
    logMenuDiagnostics,
    registerNativeRequest,
    setRefreshApplicationMenu,
    templateItems,
  };
}

module.exports = {
  create,
};
