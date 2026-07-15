(function () {
  const CodexPlus = window.CodexPlus;
  const ROUTE_PREFIX = "cpx-aharness-run:";
  const SECTION_ID = "codex-plus-aharness-sidebar";
  const terminalStatuses = new Set(["completed", "failed", "cancelled"]);
  let refreshTimer = null;
  let knownRuns = [];
  let knownProjects = [];
  const projectConfigCache = new Map();
  const foldState = new Map();
  const toolOutputState = new Map();
  const projectFoldState = new Map();
  const fileEditState = new Map();
  const scrollState = new Map();
  const composerModeOverride = new Map();
  let routeUnsubscribe = null;
  let projectColorUnsubscribe = null;
  let projectColorRefreshTimer = null;
  let projectColorObserver = null;
  let composerRelease = null;
  let composerClaimKey = "";
  let selectionRefreshPending = false;
  let selectionListenerInstalled = false;
  let composerBoundsListenerInstalled = false;
  let composerBoundsObserver = null;
  let composerBoundsTarget = null;

  function request(method, params) {
    return window.CodexPlusHost.adapters.native.request(method, params);
  }

  function routeId(runId) {
    return `${ROUTE_PREFIX}${runId}`;
  }

  function routeFromHash() {
    const candidate = decodeURIComponent(String(window.location.hash || "").replace(/^#/, ""));
    return candidate.startsWith(ROUTE_PREFIX) ? candidate : "";
  }

  function appInitialRoute() {
    try {
      return new URLSearchParams(String(window.location.search || "")).get("initialRoute") || "";
    } catch {
      return "";
    }
  }

  function shouldRestoreHashRoute() {
    return !appInitialRoute();
  }

  function shouldStartInThisWindow() {
    const initialRoute = appInitialRoute();
    return !initialRoute || !initialRoute.startsWith("/settings");
  }

  function clearHashRoute(route) {
    if (!route || routeFromHash() !== route) return;
    window.history?.replaceState?.(
      window.history.state,
      "",
      `${window.location.pathname || ""}${window.location.search || ""}`,
    );
  }

  function hasSelectionInAharnessRoute() {
    const selection = window.getSelection?.();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return false;
    const node = selection.getRangeAt(0).commonAncestorContainer;
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    return Boolean(element?.closest?.("[data-codex-plus-aharness-route]"));
  }

  function installSelectionRefreshListener() {
    if (selectionListenerInstalled) return;
    selectionListenerInstalled = true;
    document.addEventListener("selectionchange", () => {
      if (!selectionRefreshPending || hasSelectionInAharnessRoute()) return;
      selectionRefreshPending = false;
      CodexPlus.ui.virtualConversations.refresh?.();
    });
  }

  function releaseComposer() {
    composerRelease?.();
    composerRelease = null;
    composerClaimKey = "";
  }

  function shortRunId(runId) {
    const text = String(runId || "");
    const parts = text.split(/[-_:]/).filter(Boolean);
    const last = parts[parts.length - 1];
    return last && last.length >= 6 ? last.slice(0, 12) : text.slice(0, 8);
  }

  function runTitle(run) {
    const label = run?.stateMachine?.label || run?.target?.split(/[\\/]/).pop()?.replace(/\.fsm\.[tj]s$/, "") || run?.target || "Aharness run";
    return `${label} · ${shortRunId(run?.runId)}`;
  }

  function runStateLabel(run) {
    return run?.currentState?.path || (run?.pending || []).find((card) => card?.state)?.state || "pending";
  }

  function runIdFromRoute(route) {
    return String(route || "").startsWith(ROUTE_PREFIX) ? String(route).slice(ROUTE_PREFIX.length) : null;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char]));
  }

  function safeClass(value) {
    return String(value || "event").replace(/[^a-z0-9_-]/gi, "-");
  }

  function rowLabel(row) {
    return row?.summary || row?.text || row?.label || row?.kind || row?.type || "event";
  }

  function pathBasename(value) {
    const text = String(value || "").replace(/\\/g, "/");
    return text.split("/").filter(Boolean).pop() || text || "file";
  }

  function isAbsolutePath(value) {
    return String(value || "").startsWith("/") || /^[A-Za-z]:[\\/]/.test(String(value || ""));
  }

  function projectRelativePath(filePath, run) {
    const text = String(filePath || "");
    const cwd = String(run?.project?.cwd || run?.cwd || "").replace(/\/+$/, "");
    if (cwd && text === cwd) return ".";
    if (cwd && text.startsWith(`${cwd}/`)) return text.slice(cwd.length + 1);
    return text;
  }

  function looksLikeFilePath(value) {
    const text = String(value || "").trim();
    if (!text || /\sfiles?$/i.test(text)) return false;
    if (isAbsolutePath(text) || text.startsWith("./") || text.startsWith("../")) return true;
    return /[\\/]/.test(text) || /\.[A-Za-z0-9]{1,8}$/.test(text);
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  function renderInlineMarkdown(value) {
    let html = escapeHtml(value);
    html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    html = html.replace(/\*\*([^*\n][\s\S]*?[^*\n])\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*([^*\n][^*\n]*)\*/g, "<em>$1</em>");
    html = html.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_match, text, href) => (
      `<a href="${escapeAttribute(href)}" target="_blank" rel="noreferrer">${text}</a>`
    ));
    return html;
  }

  function renderMarkdown(value) {
    const text = String(value == null ? "" : value).replace(/\r\n/g, "\n");
    const parts = text.split(/(```[\s\S]*?```)/g).filter((part) => part.length > 0);
    const html = [];
    for (const part of parts) {
      if (part.startsWith("```")) {
        const code = part.replace(/^```[^\n]*\n?/, "").replace(/\n?```$/, "");
        html.push(`<pre><code>${escapeHtml(code)}</code></pre>`);
        continue;
      }
      const lines = part.split("\n");
      let paragraph = [];
      let listType = null;
      let listItems = [];
      const flushParagraph = () => {
        if (paragraph.length === 0) return;
        html.push(`<p>${renderInlineMarkdown(paragraph.join("\n")).replace(/\n/g, "<br>")}</p>`);
        paragraph = [];
      };
      const flushList = () => {
        if (!listType) return;
        html.push(`<${listType}>${listItems.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</${listType}>`);
        listType = null;
        listItems = [];
      };
      for (const line of lines) {
        const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
        const numbered = /^\s*\d+\.\s+(.+)$/.exec(line);
        if (!line.trim()) {
          flushParagraph();
          flushList();
        } else if (bullet || numbered) {
          flushParagraph();
          const nextType = bullet ? "ul" : "ol";
          if (listType && listType !== nextType) flushList();
          listType = nextType;
          listItems.push(bullet ? bullet[1] : numbered[1]);
        } else {
          flushList();
          paragraph.push(line);
        }
      }
      flushParagraph();
      flushList();
    }
    return html.join("");
  }

  function projectKey(project) {
    return project?.cwd || project?.id || "";
  }

  function statusCounts(runs) {
    const active = runs.filter((run) => !terminalStatuses.has(run.status)).length;
    const failed = runs.filter((run) => run.status === "failed").length;
    const completed = runs.filter((run) => run.status === "completed").length;
    return { active, completed, failed };
  }

  function projectColorAttributes(project) {
    const projectColors = CodexPlus.plugins?.get?.("projectColors")?.exports;
    const identity = {
      id: project?.cwd || project?.id,
      projectId: project?.cwd || project?.id,
      cwd: project?.cwd,
      label: project?.label,
    };
    const style = projectColorStyleFromNativeRow(project) || projectColors?.style?.(identity);
    if (style) {
      return {
        "data-codex-plus-project-color": "",
        "data-codex-plus-project-sidebar-color": "",
        ...(project?.cwd ? { "data-codex-plus-project-path": String(project.cwd) } : {}),
        style,
      };
    }
    return projectColors?.dataAttributes?.(identity, true) || {};
  }

  function projectColorStyleFromNativeRow(project) {
    const cwd = project?.cwd ? String(project.cwd) : "";
    const label = project?.label ? String(project.label) : "";
    const row = Array.from(document.querySelectorAll("[data-app-action-sidebar-project-row]"))
      .find((candidate) => {
        return (cwd && candidate.getAttribute("data-codex-plus-project-path") === cwd) ||
          (label && candidate.getAttribute("data-app-action-sidebar-project-label") === label);
      });
    if (!row || typeof getComputedStyle !== "function") return null;
    const computed = getComputedStyle(row);
    const accent = computed.getPropertyValue("--codex-plus-project-accent").trim();
    if (!accent) return null;
    return {
      "--codex-plus-project-accent": accent,
      "--codex-plus-project-bg-light": computed.getPropertyValue("--codex-plus-project-bg-light").trim(),
      "--codex-plus-project-fg-light": computed.getPropertyValue("--codex-plus-project-fg-light").trim(),
      "--codex-plus-project-soft-light": computed.getPropertyValue("--codex-plus-project-soft-light").trim(),
      "--codex-plus-project-bg-dark": computed.getPropertyValue("--codex-plus-project-bg-dark").trim(),
      "--codex-plus-project-fg-dark": computed.getPropertyValue("--codex-plus-project-fg-dark").trim(),
      "--codex-plus-project-border-dark": computed.getPropertyValue("--codex-plus-project-border-dark").trim(),
      "--codex-plus-project-separator-light": computed.getPropertyValue("--codex-plus-project-separator-light").trim(),
      "--codex-plus-project-separator-dark": computed.getPropertyValue("--codex-plus-project-separator-dark").trim(),
      borderLeft: `6px solid ${accent}`,
    };
  }

  function projectRowModelColor(project) {
    const attrs = projectColorAttributes(project);
    const attributes = {};
    const style = {};
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "style" && value && typeof value === "object") {
        for (const [styleName, styleValue] of Object.entries(value)) {
          if (styleName !== "borderLeft") style[styleName] = styleValue;
        }
      } else {
        attributes[key] = value == null ? "" : String(value);
      }
    }
    return { attributes, style };
  }

  function popoutIconSvg() {
    return [
      '<svg aria-hidden="true" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
      '<path d="M7 17 17 7"/>',
      '<path d="M9 7h8v8"/>',
      '<path d="M5 5h7"/>',
      '<path d="M5 5v14h14v-7"/>',
      "</svg>",
    ].join("");
  }

  function fileActionLabel(value) {
    const text = String(value || "").toLowerCase();
    if (text === "add" || text === "added" || text === "create" || text === "created") return "Created";
    if (text === "delete" || text === "deleted" || text === "remove" || text === "removed") return "Deleted";
    if (text === "rename" || text === "renamed") return "Renamed";
    return "Edited";
  }

  function fileChangeInfos(row, run) {
    const text = rowLabel(row);
    const data = row?.data && typeof row.data === "object" ? row.data : {};
    const changes = Array.isArray(data.changes) ? data.changes
      : Array.isArray(data.files) ? data.files
        : Array.isArray(data.changedFiles) ? data.changedFiles
          : Array.isArray(row?.changes) ? row.changes
            : Array.isArray(row?.files) ? row.files
              : Array.isArray(row?.changedFiles) ? row.changedFiles
                : [];
    if (changes.length > 0) {
      return changes.map((change) => {
        const filePath = String(change?.path || change?.filePath || change?.name || "").trim();
        if (!looksLikeFilePath(filePath)) return null;
        return {
          action: fileActionLabel(change?.kind || change?.status || row?.label),
          filePath,
          relativePath: projectRelativePath(filePath, run),
          stats: change?.stats || "",
        };
      }).filter(Boolean);
    }
    const dataPath = data.path || data.filePath || row?.path || row?.filePath;
    const match = /^(Edited|Created|Deleted|Modified|Renamed)\s+(.+?)(?:\s+\(([^)]*)\))?$/.exec(text);
    const filePath = String(dataPath || match?.[2] || "").trim();
    if (!looksLikeFilePath(filePath)) return [];
    return [{
      action: match?.[1] || row?.label || "Changed",
      filePath,
      relativePath: projectRelativePath(filePath, run),
      stats: data.stats || match?.[3] || "",
    }];
  }

  function fileChangeInfo(row, run) {
    return fileChangeInfos(row, run)[0] || null;
  }

  function isFileChangeRow(row, run) {
    if (!row) return false;
    const kind = String(row.kind || row.label || "").toLowerCase();
    return (kind.includes("file") && kind.includes("change") && fileChangeInfos(row, run).length > 0) || fileChangeInfos(row, run).length > 0;
  }

  function runIsWaiting(run) {
    return Boolean((run?.pending || []).length > 0 || run?.currentState?.open === true);
  }

  function discoverProjects() {
    const projects = [];
    for (const row of Array.from(document.querySelectorAll("[data-app-action-sidebar-project-row]"))) {
      const label = row.getAttribute("data-app-action-sidebar-project-label") || row.textContent?.trim()?.split(/\n/)[0] || "Project";
      const id = row.getAttribute("data-app-action-sidebar-project-id") || label;
      const cwd = row.getAttribute("data-codex-plus-project-path") || (id.startsWith("/") ? id : null);
      if (!cwd) continue;
      projects.push({ id, label, cwd });
    }
    for (const run of knownRuns) {
      const cwd = run.project?.cwd || run.cwd;
      if (!cwd || projects.some((project) => project.cwd === cwd)) continue;
      projects.push({
        id: run.project?.id || cwd,
        label: run.project?.label || cwd.split("/").filter(Boolean).pop() || "Project",
        cwd,
      });
    }
    knownProjects = projects;
    return projects;
  }

  function projectForRun(run, projects) {
    const cwd = run.project?.cwd || run.cwd;
    return projects.find((project) => project.cwd === cwd) || {
      id: run.project?.id || cwd || "unknown",
      label: run.project?.label || "Current project",
      cwd: cwd || "",
    };
  }

  async function refreshProjectConfigs(projects) {
    await Promise.all(projects.map(async (project) => {
      const key = projectKey(project);
      if (!key || projectConfigCache.has(key)) return;
      const config = await request("aharness/project/config", { cwd: project.cwd, includeDemoFallback: false });
      projectConfigCache.set(key, config.ok ? (config.stateMachines || []) : []);
    }));
  }

  function harnessProjects(projects, runsByProject) {
    return projects.filter((project) => {
      const runs = runsByProject.get(project.cwd) || [];
      const machines = projectConfigCache.get(projectKey(project)) || [];
      return runs.length > 0 || machines.length > 0;
    });
  }

  function renderSidebar() {
    const activeRoute = CodexPlus.ui.virtualConversations.activeRouteId?.() || "";
    if (!activeRoute.startsWith(ROUTE_PREFIX)) releaseComposer();
    const projects = discoverProjects();
    const runsByProject = new Map();
    for (const project of projects) runsByProject.set(project.cwd, []);
    for (const run of knownRuns) {
      const project = projectForRun(run, projects);
      if (!runsByProject.has(project.cwd)) {
        projects.push(project);
        runsByProject.set(project.cwd, []);
      }
      runsByProject.get(project.cwd).push(run);
    }
    const visibleProjects = harnessProjects(projects, runsByProject);
    const rows = [];
    for (const project of visibleProjects) {
      const runs = runsByProject.get(project.cwd) || [];
      const counts = statusCounts(runs);
      const key = projectKey(project);
      const collapsed = projectFoldState.get(key) === true;
      const projectColor = projectRowModelColor(project);
      const machines = projectConfigCache.get(projectKey(project)) || [];
      const children = [];
      if (machines.length === 0 && runs.length > 0) {
        children.push({
          id: `${key}:recorded`,
          kind: "fsm",
          label: "Recorded runs",
          collapsible: false,
          attributes: { "data-codex-plus-aharness-fsm-row": "recorded" },
          children: runRows(runs, project),
        });
      } else {
        for (const machine of machines) {
          const machineRuns = runs.filter((run) => run.target === machine.target);
          const machineColor = projectRowModelColor(project);
          children.push({
            id: `${key}:${machine.target}`,
            kind: "fsm",
            label: machine.label || machine.target,
            description: machine.description || "",
            collapsible: false,
            emptyText: machineRuns.length === 0 ? "No runs yet." : "",
            attributes: {
              ...machineColor.attributes,
              "data-codex-plus-aharness-fsm-row": machine.target,
            },
            style: machineColor.style,
            createAction: { label: "Create aharness run", target: machine.target, project, machine },
            children: runRows(machineRuns, project),
          });
        }
      }
      rows.push({
        id: key,
        kind: "project",
        label: project.label,
        description: `${counts.active} active · ${counts.completed} done${counts.failed ? ` · ${counts.failed} failed` : ""}`,
        collapsed,
        attributes: {
          ...projectColor.attributes,
          "data-codex-plus-aharness-project": project.cwd,
          "data-codex-plus-aharness-project-row": "",
        },
        style: {
          ...projectColor.style,
          "border-left": "6px solid var(--codex-plus-project-accent,currentColor)",
        },
        children,
      });
    }
    CodexPlus.ui.sidebar.renderSection({
      id: SECTION_ID,
      elementId: SECTION_ID,
      title: "Harness Runs",
      afterSectionTitle: "Pinned",
      rows,
      handlers: {
        onToggle(row) {
          if (row.kind !== "project") return;
          projectFoldState.set(row.id, !row.collapsed);
          renderSidebar();
        },
        onCreate(_row, action) {
          startRun(action.target, action.project, action.machine);
        },
        onSelect(row) {
          if (row.kind === "run" && row.runId) CodexPlus.ui.virtualConversations.open(routeId(row.runId));
        },
      },
    });
  }

  function runRows(runs, project) {
    return runs.map((run) => {
      const color = projectRowModelColor(project);
      const waiting = runIsWaiting(run);
      const running = !terminalStatuses.has(run.status) && !waiting;
      return {
        id: run.runId,
        runId: run.runId,
        kind: "run",
        label: shortRunId(run.runId),
        status: terminalStatuses.has(run.status) ? run.status : waiting ? "waiting" : "running",
        active: CodexPlus.ui.virtualConversations.activeRouteId?.() === routeId(run.runId),
        title: `${run.target || ""}\n${run.runId || ""}`.trim(),
        attributes: {
          ...color.attributes,
          "data-codex-plus-aharness-run-row": run.runId,
          "data-app-action-sidebar-thread-active": CodexPlus.ui.virtualConversations.activeRouteId?.() === routeId(run.runId) ? "true" : null,
          "data-codex-plus-aharness-run-active": CodexPlus.ui.virtualConversations.activeRouteId?.() === routeId(run.runId) ? "true" : null,
          "data-codex-plus-aharness-run-waiting": waiting ? "true" : null,
          "data-codex-plus-aharness-run-running": running ? "true" : null,
        },
        style: color.style,
      };
    });
  }

  async function refreshRuns() {
    const result = await request("aharness/run/list");
    if (result.ok) knownRuns = result.runs || [];
    await refreshProjectConfigs(discoverProjects());
    renderSidebar();
    const active = CodexPlus.ui.virtualConversations.activeRouteId?.();
    const hashRoute = routeFromHash();
    if (hashRoute && !shouldRestoreHashRoute()) {
      if (active?.startsWith(ROUTE_PREFIX)) CodexPlus.ui.virtualConversations.close?.();
      else clearHashRoute(hashRoute);
      return knownRuns;
    }
    if (active?.startsWith(ROUTE_PREFIX)) {
      if (hasSelectionInAharnessRoute()) {
        selectionRefreshPending = true;
        installSelectionRefreshListener();
      } else CodexPlus.ui.virtualConversations.refresh?.();
    }
    else if (hashRoute && shouldRestoreHashRoute()) CodexPlus.ui.virtualConversations.open?.(hashRoute);
    return knownRuns;
  }

  function startAutoRefresh() {
    if (refreshTimer) return;
    refreshTimer = window.setInterval(refreshRuns, 1500);
  }

  function startProjectColorRefresh() {
    const eventName = CodexPlus.plugins?.get?.("projectColors")?.exports?.eventName;
    const repaint = () => {
      projectColorRefreshTimer = null;
      renderSidebar();
      if (CodexPlus.ui.virtualConversations.activeRouteId?.()?.startsWith(ROUTE_PREFIX)) {
        CodexPlus.ui.virtualConversations.refresh?.();
      }
    };
    const scheduleRepaint = () => {
      if (projectColorRefreshTimer) return;
      if (typeof window.setTimeout === "function") projectColorRefreshTimer = window.setTimeout(repaint, 0);
      else repaint();
    };
    if (eventName) {
      window.addEventListener(eventName, scheduleRepaint);
      projectColorUnsubscribe = () => window.removeEventListener(eventName, scheduleRepaint);
    }
    const observerTarget = document.body?.nodeType ? document.body : document.documentElement?.nodeType ? document.documentElement : null;
    if (observerTarget && typeof MutationObserver === "function") {
      projectColorObserver = new MutationObserver((mutations) => {
        if (mutations.some((mutation) => {
          const target = mutation.target instanceof Element ? mutation.target : null;
          if (target?.hasAttribute?.("data-app-action-sidebar-project-row")) return true;
          return Array.from(mutation.addedNodes || []).some((node) =>
            node instanceof Element && (
              node.hasAttribute?.("data-app-action-sidebar-project-row") ||
              node.querySelector?.("[data-app-action-sidebar-project-row]")
            ));
        })) scheduleRepaint();
      });
      projectColorObserver.observe(observerTarget, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "data-codex-plus-project-color", "data-codex-plus-project-sidebar-color"],
      });
    }
    scheduleRepaint();
  }

  async function startRun(target, project = null, stateMachine = null) {
    const result = await request("aharness/run/start", {
      target,
      cwd: project?.cwd,
      project: project ? { id: project.id, label: project.label, cwd: project.cwd, sourceCwd: project.cwd } : undefined,
      stateMachine: stateMachine ? {
        label: stateMachine.label,
        target: stateMachine.target || target,
        description: stateMachine.description,
      } : undefined,
    });
    if (!result.ok || !result.run) {
      window.alert?.(result.message || result.error || "Failed to start aharness run");
      return null;
    }
    knownRuns = [result.run, ...knownRuns.filter((run) => run.runId !== result.run.runId)];
    scrollState.set(result.run.runId, { forceBottom: true, scrollTop: 0, scrollHeight: 0, clientHeight: 0, nearBottom: true });
    renderSidebar();
    startAutoRefresh();
    CodexPlus.ui.virtualConversations.open(routeId(result.run.runId));
    renderSidebar();
    return result.run;
  }

  async function startRunFromPrompt() {
    const target = window.prompt("Aharness target (.fsm.ts or installed command)", "await-checkpoints");
    if (!target) return;
    const project = discoverProjects()[0] || null;
    await startRun(target, project);
  }

  async function verifyFromPrompt() {
    const target = window.prompt("Aharness target to verify", "await-checkpoints");
    if (!target) return;
    const result = await request("aharness/verify", { target });
    if (!result.ok || !result.result?.ok) window.alert?.(result.message || result.error || "verify failed");
  }

  async function reply(runId, payload) {
    await request("aharness/run/reply", { runId, payload });
    scrollState.set(runId, { forceBottom: true, scrollTop: 0, scrollHeight: 0, clientHeight: 0, nearBottom: true });
    await refreshRuns();
  }

  async function cancelRun(runId) {
    await request("aharness/run/cancel", { runId, reason: "Cancelled from Codex Plus" });
    await refreshRuns();
  }

  function duration(start, end) {
    const left = Date.parse(start || "");
    const right = Date.parse(end || "") || Date.now();
    if (!Number.isFinite(left) || !Number.isFinite(right)) return "";
    const seconds = Math.max(0, Math.round((right - left) / 1000));
    return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  }

  function stateBlocks(rows, run) {
    const blocks = [];
    let current = null;
    for (const row of rows) {
      if (row.type === "state.changed") {
        if (current) current.end = row.time;
        const path = row.data?.path || row.summary || row.id || "state";
        const visitCount = row.data?.visitCount || 1;
        current = { key: `${run.runId}:${path}:${visitCount}:${row.eventId || row.id}`, state: row.summary || path, start: row.time, rows: [] };
        blocks.push(current);
      } else if (current) {
        current.rows.push(row);
      } else {
        current = { key: `${run.runId}:preamble`, state: "Run", start: row.time, rows: [row] };
        blocks.push(current);
      }
    }
    if (current && terminalStatuses.has(run.status)) current.end = run.terminal?.time || rows[rows.length - 1]?.time;
    return blocks;
  }

  function isSummaryRow(row) {
    return row.kind === "state_summary" || row.type === "state.summary" || row.data?.summary === true;
  }

  function shouldFoldBlock(block, isActiveBlock) {
    return !isActiveBlock && block.rows.some(isSummaryRow);
  }

  function renderInteraction(run, card) {
    return CodexPlus.ui.interactions.renderCard({
      card,
      onReply(payload) {
        reply(run.runId, payload);
      },
    });
  }

  function updateComposerBounds(container) {
    if (typeof document === "undefined") return;
    const chat = container?.querySelector?.(".cpx-ah-chat") || document.querySelector("[data-codex-plus-aharness-route] .cpx-ah-chat");
    const rect = chat?.getBoundingClientRect?.();
    if (!rect || rect.width <= 0) return;
    const gutter = rect.width >= 420 ? 24 : rect.width >= 320 ? 16 : 8;
    const availableWidth = Math.max(0, rect.width - gutter * 2);
    const width = Math.min(760, availableWidth || rect.width);
    const composer = document.querySelector("[data-codex-plus-user-entry][data-codex-plus-composer-claimed]");
    const parentRect = composer?.offsetParent?.getBoundingClientRect?.();
    const parentLeft = parentRect && parentRect.width > 0 ? parentRect.left : 0;
    const left = rect.left - parentLeft + ((rect.width - width) / 2);
    document.body?.style?.setProperty?.("--codex-plus-aharness-chat-left", `${Math.max(0, rect.left)}px`);
    document.body?.style?.setProperty?.("--codex-plus-aharness-chat-width", `${Math.max(0, rect.width)}px`);
    document.body?.style?.setProperty?.("--codex-plus-aharness-composer-left", `${Math.max(0, left)}px`);
    document.body?.style?.setProperty?.("--codex-plus-aharness-composer-width", `${Math.max(0, width)}px`);
  }

  function scheduleComposerBounds(container) {
    updateComposerBounds(container);
    const schedule = window.requestAnimationFrame || window.setTimeout || ((callback) => callback());
    schedule(() => updateComposerBounds(container));
    schedule(() => schedule(() => updateComposerBounds(container)));
    const chat = container?.querySelector?.(".cpx-ah-chat") || document.querySelector("[data-codex-plus-aharness-route] .cpx-ah-chat");
    if (chat && typeof ResizeObserver !== "undefined" && composerBoundsTarget !== chat) {
      composerBoundsObserver?.disconnect?.();
      composerBoundsTarget = chat;
      composerBoundsObserver = new ResizeObserver(() => updateComposerBounds(container));
      composerBoundsObserver.observe(chat);
    }
    if (composerBoundsListenerInstalled) return;
    composerBoundsListenerInstalled = true;
    const refresh = () => scheduleComposerBounds();
    window.addEventListener?.("resize", refresh, { passive: true });
    window.visualViewport?.addEventListener?.("resize", refresh, { passive: true });
    window.visualViewport?.addEventListener?.("scroll", refresh, { passive: true });
  }

  function isOwnerRow(row) {
    return row.kind === "reply" || row.data?.label === "owner" || row.label === "owner";
  }

  function formatElapsed(ms) {
    if (!Number.isFinite(ms)) return "";
    if (ms < 1000) return `${Math.round(ms)}ms`;
    const seconds = ms / 1000;
    return seconds < 60 ? `${seconds.toFixed(seconds < 10 ? 1 : 0)}s` : `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  }

  function toolElapsed(row) {
    if (Number.isFinite(row?.elapsedMs)) return formatElapsed(row.elapsedMs);
    if (!isRunningTool(row)) return "";
    const parsed = Date.parse(row?.time || row?.data?.startedAt || "");
    if (!Number.isFinite(parsed)) return "";
    return formatElapsed(Date.now() - parsed);
  }

  function toolTitle(row) {
    return row.data?.command || row.data?.target || row.summary || row.label || "tool";
  }

  function toolOutputPreview(row) {
    const output = String(row.output || row.text || "");
    const command = String(row.data?.command || "");
    if (/\.aharness\/runs\/[^"'\s]*events\.jsonl|events\.jsonl/.test(command) && /"schema"\s*:\s*"aharness\.event\.v1"/.test(output)) {
      return "events.jsonl output hidden from transcript preview.";
    }
    return output.length > 4000 ? `${output.slice(0, 4000)}\n… output truncated …` : output;
  }

  function isRunningTool(row) {
    return /running|started|progress|inProgress/i.test(String(row.status || row.data?.status || ""));
  }

  function toolGroupKey(run, rows) {
    const first = rows[0] || {};
    const last = rows[rows.length - 1] || first;
    return `${run?.runId || ""}:tools:${first.eventId || first.id || first.seq || "first"}:${last.eventId || last.id || last.seq || "last"}`;
  }

  function commandKey(run, row, groupKey) {
    return `${groupKey}:command:${row.id || row.eventId || row.seq || toolTitle(row)}`;
  }

  function toolSummary(rows) {
    const running = rows.find(isRunningTool);
    if (running) return `Running command${rows.length === 1 ? "" : "s"}`;
    return `Ran ${rows.length} command${rows.length === 1 ? "" : "s"}`;
  }

  function toolLiveTail(row) {
    const output = String(row.output || row.text || "").trim().split(/\r?\n/).filter(Boolean).slice(-5).join("\n");
    return output ? `<pre class="cpx-ah-tool-tail"><code>${escapeHtml(output)}</code></pre>` : "";
  }

  function captureScrollAnchor(scroller) {
    if (!scroller) return null;
    const scrollerRect = scroller.getBoundingClientRect();
    const anchors = Array.from(scroller.querySelectorAll("[data-codex-plus-aharness-anchor]"));
    for (const anchor of anchors) {
      const rect = anchor.getBoundingClientRect();
      if (rect.bottom > scrollerRect.top + 1) {
        return {
          id: anchor.getAttribute("data-codex-plus-aharness-anchor"),
          top: rect.top - scrollerRect.top,
        };
      }
    }
    return null;
  }

  function restoreScrollAnchor(scroller, anchor) {
    if (!scroller || !anchor?.id) return false;
    const element = Array.from(scroller.querySelectorAll("[data-codex-plus-aharness-anchor]"))
      .find((candidate) => candidate.getAttribute("data-codex-plus-aharness-anchor") === anchor.id);
    if (!element) return false;
    const scrollerRect = scroller.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    scroller.scrollTop += rect.top - scrollerRect.top - anchor.top;
    return true;
  }

  function appendToolCommand(parent, row, run, groupKey) {
    const running = isRunningTool(row);
    const meta = [
      row.status,
      row.data?.cwd ? `cwd ${row.data.cwd}` : "",
      toolElapsed(row),
    ].filter(Boolean).join(" · ");
    const output = toolOutputPreview(row);
    const key = commandKey(run, row, groupKey);
    const details = document.createElement("details");
    details.className = `cpx-ah-tool-command${running ? " cpx-ah-tool-command-running" : ""}`;
    details.setAttribute("data-codex-plus-aharness-tool-command", key);
    details.setAttribute("data-codex-plus-aharness-anchor", key);
    if (toolOutputState.get(key) === true) details.open = true;
    details.innerHTML = [
      `<summary><strong>${escapeHtml(toolTitle(row))}</strong>${meta ? `<small>${escapeHtml(meta)}</small>` : ""}</summary>`,
      output ? `<pre><code>${escapeHtml(output)}</code></pre>` : '<small class="cpx-ah-tool-no-output">No output captured.</small>',
    ].join("");
    let toggleAnchor = null;
    const rememberOpenState = () => window.setTimeout(() => {
      toolOutputState.set(key, details.open);
      restoreScrollAnchor(parent.closest("[data-codex-plus-aharness-scroll]"), toggleAnchor);
      toggleAnchor = null;
    }, 0);
    details.addEventListener("toggle", rememberOpenState);
    details.querySelector("summary")?.addEventListener("mousedown", () => {
      toggleAnchor = captureScrollAnchor(parent.closest("[data-codex-plus-aharness-scroll]"));
    });
    details.querySelector("summary")?.addEventListener("click", rememberOpenState);
    parent.appendChild(details);
  }

  function appendToolGroup(parent, rows, run) {
    if (!rows.length) return;
    const groupKey = toolGroupKey(run, rows);
    const running = rows.find(isRunningTool);
    const group = document.createElement("details");
    group.className = `cpx-ah-tool-group${running ? " cpx-ah-tool-group-running" : ""}`;
    group.setAttribute("data-codex-plus-aharness-tool-group", groupKey);
    group.setAttribute("data-codex-plus-aharness-anchor", groupKey);
    if (toolOutputState.get(groupKey) === true) group.open = true;
    group.innerHTML = [
      `<summary><span>${escapeHtml(running ? toolSummary(rows) : "Commands")}</span><strong>${escapeHtml(running ? toolTitle(running).slice(0, 80) : toolSummary(rows))}</strong></summary>`,
      running ? toolLiveTail(running) : "",
      '<div class="cpx-ah-tool-command-list"></div>',
    ].join("");
    let toggleAnchor = null;
    const rememberOpenState = () => window.setTimeout(() => {
      toolOutputState.set(groupKey, group.open);
      restoreScrollAnchor(parent.closest("[data-codex-plus-aharness-scroll]"), toggleAnchor);
      toggleAnchor = null;
    }, 0);
    group.addEventListener("toggle", rememberOpenState);
    group.querySelector("summary")?.addEventListener("mousedown", () => {
      toggleAnchor = captureScrollAnchor(parent.closest("[data-codex-plus-aharness-scroll]"));
    });
    group.querySelector("summary")?.addEventListener("click", rememberOpenState);
    const list = group.querySelector(".cpx-ah-tool-command-list");
    for (const row of rows) appendToolCommand(list, row, run, groupKey);
    parent.appendChild(group);
  }

  function fileEditGroupKey(run, rows) {
    const first = rows[0] || {};
    const last = rows[rows.length - 1] || first;
    return `${run?.runId || "run"}:files:${first.id || first.eventId || first.seq || 0}:${last.id || last.eventId || last.seq || rows.length}`;
  }

  function fileEditSummary(rows, run) {
    const infos = dedupeFileChangeInfos(rows, run);
    const unique = Array.from(new Set(infos.map((info) => info.relativePath)));
    if (unique.length === 0) return "Edited files";
    if (unique.length === 1) return `${infos[0].action} ${unique[0]}`;
    const names = unique.slice(0, 2).join(", ");
    return `Edited ${unique.length} files: ${names}${unique.length > 2 ? ", ..." : ""}`;
  }

  async function openRunFile(run, filePath) {
    const cwd = run?.cwd || run?.project?.cwd || "";
    const absolutePath = isAbsolutePath(filePath) ? filePath : cwd ? `${cwd.replace(/\/+$/, "")}/${filePath}` : filePath;
    try {
      await window.CodexPlusHost.adapters.threadSidePanel.openFile(absolutePath, {
        openInSidePanel: true,
        target: "right",
        title: pathBasename(absolutePath),
        workspaceRoot: cwd,
      });
    } catch (error) {
      window.alert?.(`Failed to open aharness file: ${error?.message || String(error)}`);
    }
  }

  function dedupeFileChangeInfos(rows, run) {
    const seen = new Set();
    const infos = [];
    for (const row of rows) {
      for (const info of fileChangeInfos(row, run)) {
        const key = `${info.action}:${info.relativePath}:${info.stats}`;
        if (seen.has(key)) continue;
        seen.add(key);
        infos.push(info);
      }
    }
    return infos;
  }

  function appendFileEditGroup(parent, rows, run) {
    if (!rows.length) return;
    const infos = dedupeFileChangeInfos(rows, run);
    if (!infos.length) return;
    const groupKey = fileEditGroupKey(run, rows);
    const group = document.createElement("details");
    group.className = "cpx-ah-file-group";
    group.setAttribute("data-codex-plus-aharness-file-group", groupKey);
    group.setAttribute("data-codex-plus-aharness-anchor", groupKey);
    if (fileEditState.get(groupKey) === true) group.open = true;
    group.innerHTML = [
      `<summary><span>File edits</span><strong>${escapeHtml(fileEditSummary(rows, run))}</strong></summary>`,
      '<div class="cpx-ah-file-list"></div>',
    ].join("");
    let toggleAnchor = null;
    const rememberOpenState = () => window.setTimeout(() => {
      fileEditState.set(groupKey, group.open);
      restoreScrollAnchor(parent.closest("[data-codex-plus-aharness-scroll]"), toggleAnchor);
      toggleAnchor = null;
    }, 0);
    group.addEventListener("toggle", rememberOpenState);
    group.querySelector("summary")?.addEventListener("mousedown", () => {
      toggleAnchor = captureScrollAnchor(parent.closest("[data-codex-plus-aharness-scroll]"));
    });
    group.querySelector("summary")?.addEventListener("click", rememberOpenState);
    const list = group.querySelector(".cpx-ah-file-list");
    for (const info of infos) {
      const item = document.createElement("div");
      item.className = "cpx-ah-file-edit";
      item.setAttribute("data-codex-plus-aharness-anchor", info.relativePath);
      item.innerHTML = [
        `<span>${escapeHtml(info.action)}</span>`,
        `<button type="button" data-codex-plus-aharness-file-open title="${escapeAttribute(info.filePath)}"><strong>${escapeHtml(info.relativePath)}</strong>${popoutIconSvg()}</button>`,
        info.stats ? `<small>${escapeHtml(info.stats)}</small>` : "",
      ].join("");
      item.querySelector("[data-codex-plus-aharness-file-open]").addEventListener("click", () => openRunFile(run, info.filePath));
      list.appendChild(item);
    }
    parent.appendChild(group);
  }

  function appendRows(parent, rows, run) {
    let tools = [];
    let files = [];
    const flushTools = () => {
      if (tools.length) appendToolGroup(parent, tools, run);
      tools = [];
    };
    const flushFiles = () => {
      if (files.length) appendFileEditGroup(parent, files, run);
      files = [];
    };
    for (const row of rows) {
      if (row.kind === "tool") {
        flushFiles();
        tools.push(row);
        continue;
      }
      if (isFileChangeRow(row, run)) {
        flushTools();
        files.push(row);
        continue;
      }
      flushTools();
      flushFiles();
      appendRow(parent, row, run);
    }
    flushTools();
    flushFiles();
  }

  function appendRow(parent, row, run) {
    if (row.type === "request.created") return;
    if (row.type === "state.changed") {
      const divider = document.createElement("div");
      divider.className = "cpx-ah-state-divider";
      divider.textContent = row.summary || row.data?.path || "state";
      parent.appendChild(divider);
      return;
    }
    const item = document.createElement("article");
    item.className = `cpx-ah-row cpx-ah-row-${safeClass(row.kind)}${isOwnerRow(row) ? " cpx-ah-row-user" : ""}`;
    item.setAttribute("data-codex-plus-aharness-anchor", row.id || row.eventId || row.seq || row.kind || "row");
    if (isOwnerRow(row)) item.setAttribute("data-codex-plus-user-bubble", "");
    if (row.data?.transientReasoning === true) item.setAttribute("data-codex-plus-aharness-transient", "");
    item.innerHTML = `<span>${escapeHtml(row.label || row.kind || row.type || "event")}</span><div class="cpx-ah-row-body">${renderMarkdown(rowLabel(row))}</div>`;
    parent.appendChild(item);
  }

  function configureComposerForRun(run) {
    const active = run && !terminalStatuses.has(run.status);
    const override = active ? composerModeOverride.get(run.runId) : null;
    if (override && (
      override.path !== (run.currentState?.path || "") ||
      override.visitCount !== (run.currentState?.visitCount || "") ||
      (override.latestEventId && run.latestEventId && override.latestEventId !== run.latestEventId)
    )) {
      composerModeOverride.delete(run.runId);
    }
    const forcedMode = active ? composerModeOverride.get(run.runId)?.mode : "";
    const mode = forcedMode || (active && run.currentState?.open === true ? "input" : active ? "waiting" : "");
    const key = active ? `${run.runId}:${run.currentState?.path || ""}:${run.currentState?.visitCount || ""}:${mode}` : "";
    if (!active) {
      if (run?.runId) composerModeOverride.delete(run.runId);
      releaseComposer();
      return;
    }
    if (composerClaimKey === key && composerRelease) {
      CodexPlus.ui.composer?.refreshClaimedSurface?.();
      return;
    }
    releaseComposer();
    composerClaimKey = key;
    composerRelease = CodexPlus.ui.composer?.claimControl?.({
      mode,
      placeholder: mode === "input" ? "Reply to aharness..." : "Aharness is working...",
      stopLabel: "Stop aharness run",
      onSubmit: mode === "input" ? async ({ text }) => {
        composerModeOverride.set(run.runId, {
          mode: "waiting",
          path: run.currentState?.path || "",
          visitCount: run.currentState?.visitCount || "",
          latestEventId: run.latestEventId || "",
        });
        configureComposerForRun(run);
        await reply(run.runId, { kind: "text", text });
      } : null,
      onStop: async () => {
        await cancelRun(run.runId);
      },
    }) || null;
  }

  async function openArtifact(run, artifact) {
    const result = await request("aharness/run/artifact/read", { runId: run.runId, path: artifact.path });
    if (!result.ok) {
      window.alert?.(result.message || result.error || "Failed to read aharness artifact");
      return;
    }
    const file = {
      path: result.artifact?.path || artifact.path,
      name: result.artifact?.name || artifact.name,
      cwd: run.cwd || run.project?.cwd,
      content: result.artifact?.content || "",
    };
    try {
      await window.CodexPlusHost.adapters.threadSidePanel.openFile(file.path, {
        openInSidePanel: true,
        target: "right",
        title: file.name,
        workspaceRoot: file.cwd,
      });
    } catch (error) {
      window.alert?.(`Codex side panel is not available: ${error?.message || String(error)}`);
    }
  }

  function renderRunView({ routeId: activeRoute, container }) {
    const runId = runIdFromRoute(activeRoute);
    const run = knownRuns.find((candidate) => candidate.runId === runId);
    const previousScroller = container.querySelector?.("[data-codex-plus-aharness-scroll]");
    const previousState = previousScroller ? {
      scrollTop: previousScroller.scrollTop,
      scrollHeight: previousScroller.scrollHeight,
      clientHeight: previousScroller.clientHeight,
      nearBottom: previousScroller.scrollHeight - previousScroller.scrollTop - previousScroller.clientHeight < 48,
      anchor: captureScrollAnchor(previousScroller),
    } : scrollState.get(runId);
    container.className = "cpx-ah-chat-route";
    container.setAttribute("data-codex-plus-aharness-route", runId || "");
    if (!run) {
      releaseComposer();
      container.innerHTML = '<section class="cpx-ah-chat"><p>Aharness run not found.</p></section>';
      refreshRuns();
      return;
    }
    configureComposerForRun(run);
    window.CodexPlusHost.adapters.context.set({
      routeId: activeRoute,
      sourceProject: run.project ? {
        id: run.project.id || run.project.cwd || "",
        label: run.project.label || "",
        cwd: run.project.cwd || "",
      } : null,
      activeCwd: run.cwd,
      workspaceRoot: run.cwd,
      source: "aharness",
      title: runTitle(run),
    });
    const rows = Array.isArray(run.recentRows) ? run.recentRows : [];
    container.innerHTML = [
      '<section class="cpx-ah-chat">',
      '<header class="cpx-ah-chat-header">',
      `<div><strong>${escapeHtml(runTitle(run))}</strong><small>${escapeHtml(run.project?.label || run.cwd || "")}</small><small data-codex-plus-aharness-header-state>State: ${escapeHtml(runStateLabel(run))}</small></div>`,
      `<span>${escapeHtml(run.status || "unknown")}</span>`,
      "</header>",
      '<div class="cpx-ah-chat-scroll" data-codex-plus-aharness-scroll>',
      '<div class="cpx-ah-chat-stream"></div>',
      "</div>",
      '<footer class="cpx-ah-action-dock" data-codex-plus-aharness-action-dock></footer>',
      "</section>",
    ].join("");
    const stream = container.querySelector(".cpx-ah-chat-stream");
    const scroller = container.querySelector("[data-codex-plus-aharness-scroll]");
    const actionDock = container.querySelector("[data-codex-plus-aharness-action-dock]");
    scheduleComposerBounds(container);
    const blocks = stateBlocks(rows, run);
    for (const block of blocks) {
      const storedOpen = foldState.get(block.key);
      const isActiveBlock = !terminalStatuses.has(run.status) && block === blocks[blocks.length - 1];
      const shouldFold = shouldFoldBlock(block, isActiveBlock);
      if (shouldFold) {
        const open = storedOpen == null ? false : storedOpen;
        const details = document.createElement("details");
        details.className = "cpx-ah-work-block";
        details.setAttribute("data-codex-plus-aharness-fold", block.key);
        if (open) details.open = true;
        details.addEventListener("toggle", () => {
          foldState.set(block.key, details.open);
        });
        const summaryRow = block.rows.find(isSummaryRow);
        const summaryText = summaryRow?.summary || summaryRow?.text || `Worked for ${duration(block.start, block.end) || "0s"}`;
        details.innerHTML = `<summary>${escapeHtml(summaryText)}</summary>`;
        appendRows(details, block.rows.filter((candidate) => !isSummaryRow(candidate)), run);
        stream.appendChild(details);
      } else {
        const group = document.createElement("section");
        group.className = "cpx-ah-state-group";
        group.setAttribute("data-codex-plus-aharness-state-group", block.key);
        group.innerHTML = `<div class="cpx-ah-state-divider">${escapeHtml(isActiveBlock ? `Working: ${block.state}` : block.state)}</div>`;
        appendRows(group, block.rows, run);
        stream.appendChild(group);
      }
    }
    for (const card of run.pending || []) actionDock.appendChild(renderInteraction(run, card));
    if (run.status === "completed") {
      stream.insertAdjacentHTML("beforeend", '<article class="cpx-ah-terminal"><strong>Completed</strong><p>Aharness run completed successfully.</p></article>');
    } else if (run.status === "failed" || run.status === "cancelled") {
      stream.insertAdjacentHTML("beforeend", `<article class="cpx-ah-terminal"><strong>${escapeHtml(run.status)}</strong><p>${escapeHtml(run.error || run.terminal?.reason || "")}</p></article>`);
    }
    for (const artifact of run.artifacts || []) {
      const item = document.createElement("article");
      item.className = "cpx-ah-artifact";
      const artifactName = artifact.name || artifact.path;
      item.innerHTML = `<strong>Artifact</strong><p><span>${escapeHtml(artifactName)}</span><button type="button" class="cpx-ah-artifact-popout" data-codex-plus-aharness-artifact-open aria-label="Open artifact ${escapeHtml(artifactName)}" title="Open artifact">${popoutIconSvg()}</button></p>`;
      item.querySelector("[data-codex-plus-aharness-artifact-open]").addEventListener("click", () => openArtifact(run, artifact));
      stream.appendChild(item);
    }
    (window.requestAnimationFrame || window.setTimeout || ((callback) => callback()))(() => {
      const state = scrollState.get(run.runId) || previousState;
      const shouldStick = !state || state.nearBottom || state.forceBottom;
      if (shouldStick) scroller.scrollTop = scroller.scrollHeight;
      else if (!restoreScrollAnchor(scroller, state.anchor)) scroller.scrollTop = Math.max(0, state.scrollTop + (scroller.scrollHeight - state.scrollHeight));
      scrollState.set(run.runId, {
        scrollTop: scroller.scrollTop,
        scrollHeight: scroller.scrollHeight,
        clientHeight: scroller.clientHeight,
        nearBottom: scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 48,
        anchor: captureScrollAnchor(scroller),
      });
    });
    scroller.addEventListener("scroll", () => {
      scrollState.set(run.runId, {
        scrollTop: scroller.scrollTop,
        scrollHeight: scroller.scrollHeight,
        clientHeight: scroller.clientHeight,
        nearBottom: scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 48,
        anchor: captureScrollAnchor(scroller),
      });
    }, { passive: true });
  }

  CodexPlus.registerPlugin(
    CodexPlus.definePlugin({
      id: "aharnessRuns",
      name: "Aharness Runs",
      description: "Runs aharness workflows inside Codex Plus.",
      required: true,
      styles:
        "#codex-plus-virtual-conversation-root{position:absolute;inset:0;z-index:0;height:100%;min-height:0;background:transparent;color:var(--text-primary,inherit);overflow:hidden}" +
        "body[data-codex-plus-virtual-route^=\"cpx-aharness-run:\"] [data-codex-plus-user-entry]:not([data-codex-plus-composer-claimed]){display:none!important}" +
        "body[data-codex-plus-composer-claimed] [data-codex-plus-user-entry][data-codex-plus-composer-claimed]{position:fixed!important;left:var(--codex-plus-aharness-composer-left,var(--codex-plus-virtual-main-left,0px))!important;right:auto!important;bottom:8px!important;width:var(--codex-plus-aharness-composer-width,min(760px,calc(100vw - var(--codex-plus-virtual-main-left,0px) - var(--codex-plus-virtual-main-right,0px) - 48px)))!important;max-width:var(--codex-plus-aharness-chat-width,calc(100vw - var(--codex-plus-virtual-main-left,0px) - var(--codex-plus-virtual-main-right,0px) - 48px))!important;z-index:50!important}" +
        "body[data-codex-plus-virtual-route^=\"cpx-aharness-run:\"][data-codex-plus-composer-claimed] #codex-plus-virtual-conversation-root .cpx-ah-chat-scroll{padding-bottom:190px}" +
        "body[data-codex-plus-virtual-route^=\"cpx-aharness-run:\"][data-codex-plus-composer-claimed] #codex-plus-virtual-conversation-root .cpx-ah-action-dock{padding-bottom:180px}" +
        "body[data-codex-plus-virtual-route^=\"cpx-aharness-run:\"] [data-codex-plus-user-entry][data-codex-plus-composer-claimed] [data-placeholder]::after{content:var(--codex-plus-composer-placeholder)!important}" +
        "body[data-codex-plus-virtual-route^=\"cpx-aharness-run:\"] [data-codex-plus-user-entry][data-codex-plus-composer-mode=\"waiting\"] :is(textarea,[contenteditable=\"true\"],.ProseMirror){cursor:not-allowed!important}" +
        "body[data-codex-plus-virtual-route^=\"cpx-aharness-run:\"] [data-codex-plus-composer-stop-control] svg{display:none!important}" +
        "body[data-codex-plus-virtual-route^=\"cpx-aharness-run:\"] [data-codex-plus-composer-stop-control]::before{content:\"\";display:block;width:10px;height:10px;border-radius:2px;background:currentColor}" +
        "#codex-plus-aharness-sidebar{margin:14px 8px 8px;border-top:1px solid color-mix(in srgb,currentColor 14%,transparent);padding-top:10px;color:var(--text-primary,#f5f5f5);font:13px/1.4 system-ui,sans-serif}" +
        "#codex-plus-aharness-sidebar h2{margin:0 0 8px 8px;font-size:14px;line-height:20px;font-weight:400;color:var(--text-secondary,#bbb)}" +
        "#codex-plus-aharness-sidebar .cpx-sidebar-model-row{--cpx-sidebar-indent:calc(var(--cpx-sidebar-depth,0)*13px);margin:2px 0 0 var(--cpx-sidebar-indent);display:flex;align-items:center;gap:4px;color:inherit}" +
        "#codex-plus-aharness-sidebar .cpx-sidebar-model-main{min-width:0;width:100%;display:flex;align-items:center;gap:8px;border:0;background:transparent;color:inherit;text-align:left;padding:4px 6px;border-radius:4px}" +
        "#codex-plus-aharness-sidebar .cpx-sidebar-model-main:hover{background:color-mix(in srgb,currentColor 8%,transparent)}" +
        "#codex-plus-aharness-sidebar .cpx-sidebar-model-text{min-width:0;display:flex;flex-direction:column;flex:1 1 auto}.cpx-sidebar-model-text strong{font-weight:400;overflow-wrap:anywhere}.cpx-sidebar-model-text small,.cpx-sidebar-model-empty{opacity:.7}" +
        "#codex-plus-aharness-sidebar .cpx-sidebar-model-row-project{margin-left:0;background:var(--codex-plus-project-bg-dark,color-mix(in srgb,currentColor 9%,transparent));border-left:6px solid var(--codex-plus-project-accent,currentColor)}#codex-plus-aharness-sidebar .cpx-sidebar-model-row-project+.cpx-sidebar-model-children{margin-left:0;padding-left:10px;border-left:6px solid var(--codex-plus-project-accent,currentColor)}.cpx-sidebar-model-row-project>.cpx-sidebar-model-main{padding:7px 8px;background:transparent;border-radius:0}.cpx-sidebar-model-row-project>.cpx-sidebar-model-main strong{font-weight:700}:root:not(.dark):not(.electron-dark) .cpx-sidebar-model-row-project{background:var(--codex-plus-project-soft-light,color-mix(in srgb,currentColor 9%,transparent))}" +
        "#codex-plus-aharness-sidebar .cpx-sidebar-model-chevron{display:grid;place-items:center;flex:0 0 16px;order:3;opacity:0;transition:opacity .12s ease}#codex-plus-aharness-sidebar .cpx-sidebar-model-row-project:hover>.cpx-sidebar-model-main .cpx-sidebar-model-chevron,#codex-plus-aharness-sidebar .cpx-sidebar-model-row-project:focus-within>.cpx-sidebar-model-main .cpx-sidebar-model-chevron{opacity:.78}" +
        "#codex-plus-aharness-sidebar .cpx-sidebar-model-bullet{width:6px;height:6px;border-radius:50%;background:var(--codex-plus-project-border-dark,color-mix(in srgb,currentColor 35%,transparent));flex:0 0 auto}" +
        "html[data-codex-plus-sidebar-names-blurred=\"true\"] #codex-plus-aharness-sidebar .cpx-sidebar-model-row-project,html[data-codex-plus-sidebar-names-blurred=\"true\"] #codex-plus-aharness-sidebar .cpx-sidebar-model-row-fsm,html[data-codex-plus-sidebar-names-blurred=\"true\"] #codex-plus-aharness-sidebar .cpx-sidebar-model-row-run{filter:blur(4px)}" +
        "#codex-plus-aharness-sidebar .cpx-sidebar-model-row-fsm>.cpx-sidebar-model-main{align-items:flex-start;padding:4px 2px}.cpx-sidebar-model-row-fsm>.cpx-sidebar-model-main>.cpx-sidebar-model-bullet{margin-top:.58em}.cpx-sidebar-model-create{width:24px;height:24px;display:grid;place-items:center;padding:0;border:0;background:transparent;color:inherit;border-radius:4px}.cpx-sidebar-model-create:hover{background:color-mix(in srgb,currentColor 10%,transparent)}" +
        "#codex-plus-aharness-sidebar .cpx-sidebar-model-row-run{border-radius:4px;background:color-mix(in srgb,var(--codex-plus-project-border-dark,currentColor) 8%,transparent)}.cpx-sidebar-model-row-run:hover{background:color-mix(in srgb,var(--codex-plus-project-border-dark,currentColor) 14%,transparent)}.cpx-sidebar-model-row-run .cpx-sidebar-model-bullet{display:none}.cpx-sidebar-model-row-run .cpx-sidebar-model-main{min-height:26px;padding:5px 6px;border-radius:inherit;border-left:0!important;box-shadow:none!important;background:transparent}.cpx-sidebar-model-row-run[data-codex-plus-aharness-run-active=\"true\"]{border-radius:0!important;background:color-mix(in srgb,var(--codex-plus-project-accent,currentColor) 38%,transparent)!important;box-shadow:inset 6px 0 0 var(--codex-plus-project-accent,currentColor)!important}#codex-plus-aharness-sidebar .cpx-sidebar-model-row-run[data-codex-plus-aharness-run-active=\"true\"] .cpx-sidebar-model-main{padding-left:18px}" +
        "#codex-plus-aharness-sidebar .cpx-sidebar-status-spinner{width:12px;height:12px;border:2px solid color-mix(in srgb,currentColor 24%,transparent);border-top-color:currentColor;border-radius:50%;animation:cpx-ah-spin .8s linear infinite}.cpx-sidebar-status-waiting{width:8px;height:8px;border-radius:50%;background:#4da3ff;box-shadow:0 0 0 2px color-mix(in srgb,#4da3ff 20%,transparent)}@keyframes cpx-ah-spin{to{transform:rotate(360deg)}}" +
        "#codex-plus-aharness-sidebar .cpx-sidebar-model-empty{margin:2px 0 8px calc(var(--cpx-sidebar-depth,1)*13px + 18px)}" +
        ".cpx-ah-artifact p{display:flex;align-items:center;gap:6px}.cpx-ah-artifact-popout{display:inline-grid;place-items:center;border:0;background:transparent;color:inherit;border-radius:4px;padding:2px;opacity:.78}.cpx-ah-artifact-popout:hover{background:color-mix(in srgb,currentColor 10%,transparent);opacity:1}" +
        ".cpx-ah-chat{height:100%;min-height:0;max-width:920px;margin:0 auto;padding:0 32px;display:flex;flex-direction:column;background:transparent;font:14px/1.5 system-ui,sans-serif}.cpx-ah-chat-header{flex:0 0 auto;background:transparent;display:flex;justify-content:space-between;gap:12px;padding:28px 0 14px;border-bottom:1px solid color-mix(in srgb,currentColor 12%,transparent)}.cpx-ah-chat-header div{display:flex;flex-direction:column;min-width:0}.cpx-ah-chat-header small{opacity:.72}" +
        ".cpx-ah-chat-scroll{flex:1 1 auto;min-height:0;overflow:auto;padding-bottom:16px;scrollbar-width:thin;scrollbar-color:color-mix(in srgb,currentColor 28%,transparent) transparent}.cpx-ah-chat-scroll::-webkit-scrollbar{width:8px;height:8px}.cpx-ah-chat-scroll::-webkit-scrollbar-track{background:transparent}.cpx-ah-chat-scroll::-webkit-scrollbar-thumb{border-radius:999px;background:color-mix(in srgb,currentColor 24%,transparent);border:2px solid transparent;background-clip:content-box}.cpx-ah-chat-scroll::-webkit-scrollbar-thumb:hover{background:color-mix(in srgb,currentColor 38%,transparent);background-clip:content-box}.cpx-ah-chat-stream{display:flex;flex-direction:column;gap:12px}.cpx-ah-action-dock{flex:0 0 auto;border-top:1px solid color-mix(in srgb,currentColor 12%,transparent);background:transparent;padding:12px 0 24px}.cpx-ah-work-block,.cpx-ah-state-group,.cpx-ah-terminal,.cpx-ah-artifact,.cpx-interaction-card{border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:8px;padding:10px 12px;background:color-mix(in srgb,currentColor 3%,transparent)}.cpx-ah-state-group{border-color:transparent;background:transparent;padding:0}.cpx-ah-work-block summary{cursor:pointer;color:var(--text-secondary,#bbb)}.cpx-ah-state-divider{font-size:12px;opacity:.72;margin:4px 0}.cpx-ah-row{padding:8px 0;border-top:1px solid color-mix(in srgb,currentColor 8%,transparent)}.cpx-ah-row:first-of-type{border-top:0}.cpx-ah-row span{display:block;font-size:11px;text-transform:uppercase;opacity:.62}.cpx-ah-row-state_prompt{border:0;border-radius:16px;padding:9px 12px;width:77%;margin:8px auto 14px 0;background:color-mix(in srgb,var(--codex-plus-user-bubble-dark-bg,var(--codex-plus-user-bubble-light-bg,currentColor)) 26%,transparent);color:inherit}.cpx-ah-row-state_prompt span{opacity:.68}.cpx-ah-row-body p,.cpx-ah-terminal p,.cpx-ah-artifact p,.cpx-interaction-card p{margin:4px 0 0;overflow-wrap:anywhere}.cpx-ah-row-body ul,.cpx-ah-row-body ol{margin:6px 0 0 20px;padding:0}.cpx-ah-row-body li{margin:2px 0}.cpx-ah-row-body pre,.cpx-ah-tool-command pre,.cpx-ah-tool-tail{margin:7px 0 0;padding:8px;border-radius:6px;background:color-mix(in srgb,currentColor 8%,transparent);white-space:pre-wrap;overflow:auto}.cpx-ah-row-body code,.cpx-ah-tool-command code,.cpx-ah-tool-tail code{font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.cpx-ah-row-body a{color:inherit;text-decoration:underline}.cpx-ah-tool-group,.cpx-ah-file-group{padding:8px 0;border-top:1px solid color-mix(in srgb,currentColor 8%,transparent)}.cpx-ah-tool-group>summary,.cpx-ah-file-group>summary{cursor:pointer;display:flex;align-items:center;gap:8px;color:var(--text-secondary,#bbb)}.cpx-ah-tool-group>summary span,.cpx-ah-file-group>summary span,.cpx-ah-file-edit span{font-size:11px;text-transform:uppercase;opacity:.72}.cpx-ah-tool-group>summary strong,.cpx-ah-file-group>summary strong{font-weight:500;color:var(--text-primary,inherit)}.cpx-ah-tool-group-running>summary span,.cpx-ah-tool-command-running>summary small,.cpx-ah-row-reasoning[data-codex-plus-aharness-transient] .cpx-ah-row-body{opacity:.78;animation:cpx-ah-shimmer 1.25s ease-in-out infinite}.cpx-ah-tool-command-list,.cpx-ah-file-list{display:flex;flex-direction:column;gap:4px;margin-top:8px}.cpx-ah-tool-command,.cpx-ah-file-edit{border-radius:6px;padding:3px 6px;background:color-mix(in srgb,currentColor 4%,transparent)}.cpx-ah-tool-command>summary{cursor:pointer;display:flex;gap:8px;align-items:baseline;justify-content:space-between}.cpx-ah-tool-command>summary strong{font-weight:600;overflow-wrap:anywhere}.cpx-ah-tool-command>summary small,.cpx-ah-tool-no-output,.cpx-ah-file-edit small{opacity:.68}.cpx-ah-file-edit{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px;align-items:center}.cpx-ah-file-edit button{display:inline-flex;align-items:center;gap:5px;min-width:0;border:0;background:transparent;color:inherit;text-align:left;padding:2px;border-radius:4px}.cpx-ah-file-edit button:hover{background:color-mix(in srgb,currentColor 10%,transparent)}.cpx-ah-file-edit button strong{overflow-wrap:anywhere}.cpx-ah-tool-command:not([open]) pre{display:none}@keyframes cpx-ah-shimmer{50%{opacity:.38}}.cpx-ah-row-user{align-self:flex-end;max-width:77%;border:0;border-radius:16px;padding:8px 12px;margin:8px 0 0 auto;background-color:var(--codex-plus-user-bubble-dark-bg,var(--codex-plus-user-bubble-light-bg,color-mix(in srgb,currentColor 14%,transparent)));color:var(--codex-plus-user-bubble-dark-fg,var(--codex-plus-user-bubble-light-fg,currentColor))}.cpx-interaction-card button,.cpx-ah-action-dock button{margin:8px 6px 0 0;border:1px solid color-mix(in srgb,currentColor 18%,transparent);background:transparent;color:inherit;border-radius:6px;padding:5px 9px}",
      commands: [
        {
          id: "codexPlusAharnessOpenRuns",
          title: "Aharness: Open Runs",
          description: "Open the latest aharness run",
          menu: { groups: ["suggested", "panels"] },
          palette: { enabled: true, keywords: ["aharness", "workflow", "fsm"] },
          shortcut: { defaultKeybindings: [] },
          async run() {
            await refreshRuns();
            if (knownRuns[0]) CodexPlus.ui.virtualConversations.open(routeId(knownRuns[0].runId));
          },
        },
        {
          id: "codexPlusAharnessRunWorkflow",
          title: "Aharness: Run Workflow",
          description: "Start an aharness workflow without opening the loopback UI",
          menu: { groups: ["suggested", "workspace"] },
          palette: { enabled: true, keywords: ["aharness", "run", "workflow"] },
          shortcut: { defaultKeybindings: [] },
          run: startRunFromPrompt,
        },
      ],
      start(api) {
        if (!shouldStartInThisWindow()) return;
        api.ui.virtualConversations.registerProvider({
          id: "aharnessRuns",
          match: (candidate) => runIdFromRoute(candidate) != null,
          list: () => knownRuns.map((run) => ({ routeId: routeId(run.runId), title: runTitle(run) })),
          render: renderRunView,
        });
        routeUnsubscribe = api.ui.virtualConversations.subscribe(renderSidebar);
        startProjectColorRefresh();
        api.nativeMenus.registerItem({
          id: "codexPlusAharnessOpenRuns",
          menuId: "view-menu",
          afterLabel: "Find",
          label: "Aharness Runs",
          nativeRequest: { method: "renderer/command", params: { id: "codexPlusAharnessOpenRuns" } },
        });
        refreshRuns();
        startAutoRefresh();
      },
      stop() {
        if (refreshTimer) window.clearInterval(refreshTimer);
        refreshTimer = null;
        if (projectColorRefreshTimer && typeof window.clearTimeout === "function") window.clearTimeout(projectColorRefreshTimer);
        projectColorRefreshTimer = null;
        projectColorUnsubscribe?.();
        projectColorUnsubscribe = null;
        projectColorObserver?.disconnect?.();
        projectColorObserver = null;
        releaseComposer();
        routeUnsubscribe?.();
        routeUnsubscribe = null;
      },
    }),
  );
})();
