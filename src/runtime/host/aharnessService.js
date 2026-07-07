const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function safeString(value, fallback = "") {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function jsonClone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function textFrom(value) {
  return typeof value === "string" ? value : "";
}

function normalizeText(value) {
  return textFrom(value).replace(/\r\n/g, "\n").trim();
}

function stripFrameworkNote(value) {
  const original = normalizeText(value);
  if (!original) return "";
  const withoutStateLine = original.replace(/^\[aharness\]\s+Now in state\s+"[^"]+"\.\s*/i, "").trimStart();
  const validExitsMatch = /\bValid exits:\s*/i.exec(withoutStateLine);
  if (!validExitsMatch) return withoutStateLine;
  const before = withoutStateLine.slice(0, validExitsMatch.index).trim();
  const afterValidExits = withoutStateLine.slice(validExitsMatch.index + validExitsMatch[0].length);
  const promptStart = afterValidExits.search(/\n\s*\n/);
  const after = promptStart >= 0 ? afterValidExits.slice(promptStart).trim() : "";
  return [before, after].filter(Boolean).join("\n\n").trim();
}

function stableRowId(event, row) {
  if (event?.type === "model.delta" && event.itemId) return `${row.kind === "reasoning" ? "reasoning" : "message"}:${event.itemId}`;
  const itemType = typeof event?.data?.itemType === "string" ? event.data.itemType : "";
  if ((itemType === "agentMessage" || itemType === "userMessage" || itemType === "reasoning") && event.itemId) {
    return `${itemType === "reasoning" ? "reasoning" : "message"}:${event.itemId}`;
  }
  if (row.kind === "tool" && event?.itemId) return `tool:${event.itemId}`;
  if (row.kind === "reply" && event?.requestId) return `reply:${event.requestId}`;
  return safeString(row.id, event?.id);
}

function isPlaceholderReasoningText(value) {
  const visibleText = normalizeText(value);
  return !visibleText || visibleText.toLowerCase() === "reasoning";
}

function isPlaceholderReasoningEvent(event) {
  const row = event?.data?.row;
  const itemType = typeof event?.data?.itemType === "string" ? event.data.itemType : "";
  return Boolean(
    row &&
    typeof row === "object" &&
    (row.kind === "reasoning" || itemType === "reasoning") &&
    isPlaceholderReasoningText(row.text || row.summary || row.label),
  );
}

function unquoteTomlValue(value) {
  const trimmed = String(value || "").trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).replace(/\\(["\\])/g, "$1");
  }
  return trimmed;
}

function parseAharnessStateMachines(text) {
  const machines = [];
  const ignoredLines = [];
  let current = null;
  for (const [index, rawLine] of String(text || "").split(/\r?\n/).entries()) {
    const line = rawLine.replace(/#.*$/g, "").trim();
    if (!line) continue;
    if (line === "[[aharness.state_machines]]") {
      current = {};
      machines.push(current);
      continue;
    }
    if (line.startsWith("[[")) {
      current = null;
      continue;
    }
    const match = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(line);
    if (match && current) current[match[1]] = unquoteTomlValue(match[2]);
    else if (current) ignoredLines.push({ line: index + 1, text: rawLine.slice(0, 160) });
  }
  return {
    stateMachines: machines
      .filter((machine) => typeof machine.target === "string" && machine.target.trim().length > 0)
      .map((machine) => ({
        target: machine.target.trim(),
        label: typeof machine.label === "string" && machine.label.trim().length > 0 ? machine.label.trim() : machine.target.trim(),
        description: typeof machine.description === "string" && machine.description.trim().length > 0 ? machine.description.trim() : undefined,
      })),
    ignoredLines,
  };
}

function resolveAharnessHome(env = process.env, homeDir = os.homedir()) {
  return path.resolve(env.AHARNESS_HOME || path.join(homeDir, ".aharness"));
}

function findProjectRoot(cwd) {
  let current = path.resolve(safeString(cwd, process.cwd()));
  for (;;) {
    if (fs.existsSync(path.join(current, ".git")) || fs.existsSync(path.join(current, ".codex", "plus.toml"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(safeString(cwd, process.cwd()));
    current = parent;
  }
}

function rowFromEvent(event) {
  if (event?.type === "reply.submitted") return null;
  const row = event?.data?.row;
  if (!row || typeof row !== "object") return null;
  if (event?.type === "run.started" || row.kind === "run_lifecycle") return null;
  const data = row.data && typeof row.data === "object" ? jsonClone(row.data) : {};
  for (const key of ["changes", "files", "changedFiles"]) {
    if (Array.isArray(row[key]) && !Array.isArray(data[key])) data[key] = jsonClone(row[key]);
  }
  const normalized = {
    id: stableRowId(event, row),
    eventId: safeString(row.eventId, event.id),
    seq: Number.isFinite(row.seq) ? row.seq : event.seq,
    time: safeString(row.time, event.time),
    type: safeString(row.type, event.type),
    kind: safeString(row.kind, "event"),
    label: typeof row.label === "string" ? row.label : undefined,
    text: typeof row.text === "string" ? row.text : undefined,
    output: typeof row.output === "string" ? row.output : undefined,
    status: typeof row.status === "string" ? row.status : undefined,
    summary: typeof row.summary === "string" ? row.summary : undefined,
    requestId: typeof row.requestId === "string" ? row.requestId : event.requestId,
    itemId: typeof event.itemId === "string" ? event.itemId : typeof event.data?.itemId === "string" ? event.data.itemId : undefined,
    elapsedMs: Number.isFinite(row.elapsedMs) ? row.elapsedMs : undefined,
    data: Object.keys(data).length > 0 ? data : undefined,
  };
  if (event?.type === "model.delta") normalized.status = "streaming";
  if (normalized.kind === "reasoning" && isPlaceholderReasoningText(normalized.text || normalized.summary || normalized.label)) {
    if (event?.type !== "model.delta") return null;
    normalized.text = "Thinking";
    normalized.summary = "Thinking";
    normalized.data = { ...(normalized.data || {}), transientReasoning: true };
  }
  if (normalized.kind === "reply") {
    const visibleText = normalizeText(normalized.text || normalized.summary || normalized.label);
    if (visibleText.toLowerCase() === "user-prompt") return null;
  }
  if (normalized.kind === "message" && normalized.label === "userMessage") {
    const visibleText = normalizeText(normalized.text || normalized.summary);
    if (visibleText.startsWith("[aharness] Now in state")) return null;
  }
  if (event?.type === "model.delta") return normalized;
  if (event?.type === "framework.note") {
    const variant = safeString(event.data?.variant, normalized.status);
    const stripped = stripFrameworkNote(normalized.text);
    if (!stripped && variant !== "warn" && variant !== "error") return null;
    if (variant === "warn" || variant === "error") {
      normalized.kind = "diagnostic";
      normalized.label = `framework ${variant}`;
      return normalized;
    }
    normalized.id = `state-prompt:${safeString(event.data?.id, event.id)}`;
    normalized.kind = "state_prompt";
    normalized.label = "state prompt";
    normalized.text = stripped;
    normalized.summary = undefined;
    normalized.data = { ...(normalized.data || {}), sourceText: normalizeText(row.text) };
  }
  return normalized;
}

function pendingCardFromEvent(event) {
  const card = event?.data?.pendingCard;
  if (!card || typeof card !== "object") return null;
  return {
    ...jsonClone(card),
    requestId: safeString(card.requestId, event.requestId),
    eventId: event.id,
  };
}

function currentStateFromEvent(event) {
  if (event?.type !== "state.changed" || !event.data || typeof event.data !== "object") return null;
  const pathValue = safeString(event.data.path, safeString(event.data.to));
  if (!pathValue) return null;
  const rowData = event.data.row?.data && typeof event.data.row.data === "object" ? event.data.row.data : {};
  const hasOpenSignal = event.data.open === true || event.data.open === false || rowData.open === true || rowData.open === false || typeof event.data.mode === "string" || typeof rowData.mode === "string";
  return {
    path: pathValue,
    leaf: typeof event.data.leaf === "string" ? event.data.leaf : pathValue.split(".").pop(),
    kind: typeof event.data.kind === "string" ? event.data.kind : undefined,
    open: event.data.open === true || rowData.open === true || event.data.mode === "open" || rowData.mode === "open",
    hasOpenSignal,
    visitCount: Number.isFinite(event.data.visitCount) ? event.data.visitCount : undefined,
    exits: Array.isArray(event.data.exits) ? jsonClone(event.data.exits) : [],
  };
}

function terminalStatusFromEvent(event) {
  if (event?.type === "run.completed") return "completed";
  if (event?.type === "run.failed") return "failed";
  if (event?.type === "run.cancelled") return "cancelled";
  return null;
}

function eventOrder(value) {
  if (Number.isFinite(value?.seq)) return value.seq;
  const id = safeString(value?.eventId, safeString(value?.id));
  const match = /:(\d+)$/.exec(id);
  return match ? Number(match[1]) : 0;
}

function normalizeProjection(projection) {
  projection.events.sort((a, b) => eventOrder(a) - eventOrder(b));
  projection.recentRows.sort((a, b) => eventOrder(a) - eventOrder(b));
  projection.stateVisits.sort((a, b) => eventOrder(a) - eventOrder(b));
  const latestState = projection.stateVisits[projection.stateVisits.length - 1];
  if (latestState) projection.currentState = jsonClone(latestState);
  const latestEvent = projection.events[projection.events.length - 1];
  if (latestEvent?.id) projection.latestEventId = latestEvent.id;
  return projection;
}

function nextSyntheticEventOrder(projection) {
  return projection.events.reduce((max, event) => Math.max(max, eventOrder(event)), 0) + 0.1;
}

function ownerReplyText(payload = {}) {
  if (typeof payload.text === "string") return payload.text;
  if (typeof payload.label === "string") return payload.label;
  if (typeof payload.decision === "string") return payload.decision;
  if (typeof payload.action === "string") return payload.action;
  return "";
}

function recordOwnerReply(projection, runId, payload = {}) {
  const text = ownerReplyText(payload);
  if (!text) return;
  const requestId = safeString(payload.requestId, payload.kind === "owner-choice" && payload.state ? `owner-choice:${payload.state}#${payload.visitCount || 1}` : `owner-reply:${Date.now()}`);
  applyEventToProjection(projection, {
    id: `${runId}:owner-reply:${requestId}`,
    seq: nextSyntheticEventOrder(projection),
    time: new Date().toISOString(),
    type: "reply.resolved",
    requestId,
    data: {
      row: {
        id: requestId,
        kind: "reply",
        label: payload.kind === "text" || payload.kind === "user-prompt" ? "owner" : "owner choice",
        status: "accepted",
        text,
        summary: text,
        data: jsonClone(payload),
      },
    },
  });
}

function artifactFromEvent(event) {
  if (event?.type !== "artifact.written" || !event.data || typeof event.data !== "object") return null;
  const relPath = safeString(event.data.relPath);
  const basePath = safeString(event.data.runDir, safeString(event.data.cwd));
  const artifactPath = safeString(event.data.path, relPath && basePath ? path.join(basePath, "artifacts", relPath) : relPath ? path.join("artifacts", relPath) : "");
  if (!artifactPath) return null;
  return {
    path: artifactPath,
    name: safeString(event.data.name, path.basename(artifactPath)),
    kind: safeString(event.data.kind, "file"),
    eventId: event.id,
    time: safeString(event.time),
  };
}

function applyEventToProjection(projection, event) {
  if (!event || typeof event !== "object") return projection;
  if (event.id && projection.events.some((candidate) => candidate.id === event.id)) return projection;
  projection.latestEventId = event.id;
  projection.events.push(jsonClone(event));
  if (projection.events.length > 500) projection.events.shift();

  const row = rowFromEvent(event);
  if (!row && isPlaceholderReasoningEvent(event) && event.type !== "model.delta") {
    const rowId = stableRowId(event, event.data.row);
    projection.recentRows = projection.recentRows.filter((candidate) => candidate.id !== rowId);
  }
  if (row) {
    if (row.kind !== "reasoning") {
      projection.recentRows = projection.recentRows.filter((candidate) => candidate.data?.transientReasoning !== true);
    }
    const previous = projection.recentRows[projection.recentRows.length - 1];
    if (
      row.kind === "message" &&
      row.label === "userMessage" &&
      previous?.kind === "state_prompt" &&
      normalizeText(row.text) === normalizeText(previous.data?.sourceText)
    ) {
      return projection;
    }
    if (
      row.kind === "reply" &&
      previous?.kind === "reply" &&
      normalizeText(row.text || row.summary) === normalizeText(previous.text || previous.summary)
    ) {
      return projection;
    }
    if (
      row.kind === "message" &&
      row.label === "userMessage" &&
      previous?.kind === "reply" &&
      normalizeText(row.text || row.summary) === normalizeText(previous.text || previous.summary)
    ) {
      return projection;
    }
    const existing = projection.recentRows.findIndex((candidate) => candidate.id === row.id);
    if (existing >= 0) {
      if (event.type === "model.delta") {
        projection.recentRows[existing] = {
          ...projection.recentRows[existing],
          ...row,
          text: `${projection.recentRows[existing].text || ""}${row.text || ""}`,
        };
      } else {
        projection.recentRows[existing] = row;
      }
    }
    else projection.recentRows.push(row);
  }

  const state = currentStateFromEvent(event);
  if (state) {
    if (!state.hasOpenSignal && projection.currentState?.path === state.path) {
      state.open = projection.currentState.open === true;
    }
    delete state.hasOpenSignal;
    projection.currentState = state;
    projection.stateVisits.push({ ...state, eventId: event.id, seq: event.seq, time: event.time });
  }

  const artifact = artifactFromEvent(event);
  if (artifact) {
    if (!path.isAbsolute(artifact.path)) {
      artifact.path = path.join(projection.runDir || projection.cwd || process.cwd(), artifact.path);
    }
    const existing = projection.artifacts.findIndex((candidate) => candidate.path === artifact.path);
    if (existing >= 0) projection.artifacts[existing] = artifact;
    else projection.artifacts.push(artifact);
  }

  const card = pendingCardFromEvent(event);
  if (card) {
    projection.pending = projection.pending.filter((candidate) => candidate.requestId !== card.requestId);
    if (event.type !== "request.resolved" && event.type !== "reply.resolved") projection.pending.push(card);
  } else if ((event.type === "request.resolved" || event.type === "reply.resolved") && event.requestId) {
    projection.pending = projection.pending.filter((candidate) => candidate.requestId !== event.requestId);
  }

  const status = terminalStatusFromEvent(event);
  if (status) {
    projection.status = status;
    projection.terminal = {
      status,
      state: typeof event.data?.state === "string" ? event.data.state : undefined,
      outcome: typeof event.data?.outcome === "string" ? event.data.outcome : undefined,
      reason: typeof event.data?.reason === "string" ? event.data.reason : undefined,
    };
  } else if (event.type === "run.started" && projection.status === "starting") {
    projection.status = "running";
  } else if (projection.status === "starting" && event.type !== "reply.submitted") {
    projection.status = "running";
  }

  return projection;
}

function applyEventsFromFile(projection, eventsPath) {
  if (!eventsPath || typeof eventsPath !== "string") return projection;
  let text = "";
  try {
    text = fs.readFileSync(eventsPath, "utf8");
  } catch {
    return projection;
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      applyEventToProjection(projection, JSON.parse(trimmed));
    } catch {}
  }
  return projection;
}

function createProjection(runId, params = {}) {
  return {
    runId,
    target: safeString(params.target, "unknown"),
    cwd: safeString(params.cwd, process.cwd()),
    runDir: typeof params.runDir === "string" ? params.runDir : undefined,
    project: params.project && typeof params.project === "object" ? jsonClone(params.project) : null,
    stateMachine: params.stateMachine && typeof params.stateMachine === "object" ? jsonClone(params.stateMachine) : null,
    status: "starting",
    latestEventId: null,
    currentState: null,
    stateVisits: [],
    pending: [],
    recentRows: [],
    events: [],
    terminal: null,
    artifacts: [],
    error: null,
  };
}

function listInstalledCommandsFromStore(options = {}) {
  const home = resolveAharnessHome(options.env, options.homeDir);
  const commandsFile = readJsonFile(path.join(home, "commands.json"));
  if (!commandsFile?.commands || typeof commandsFile.commands !== "object") return [];
  return Object.entries(commandsFile.commands)
    .map(([identity, command]) => ({
      identity,
      packageName: command.packageName,
      commandName: command.commandName,
      packageVersion: command.packageVersion,
      description: command.description,
      entry: command.entry,
      packageRoot: command.packageRoot,
      lockFingerprint: command.lockFingerprint,
    }))
    .sort((a, b) => a.identity.localeCompare(b.identity));
}

function loadRuntime(runtimeLoader) {
  if (runtimeLoader) return Promise.resolve(runtimeLoader());
  configureBundledEsbuildBinary();
  return import("@aharness/core/runtime").catch((error) => ({
    __codexPlusUnavailable: true,
    message: error?.message || String(error),
  }));
}

function configureBundledEsbuildBinary() {
  if (process.env.ESBUILD_BINARY_PATH) return;
  const marker = `${path.sep}app.asar${path.sep}`;
  if (!__dirname.includes(marker)) return;
  const unpackedBuildDir = __dirname.replace(marker, `${path.sep}app.asar.unpacked${path.sep}`);
  const esbuildRoot = path.join(unpackedBuildDir, "node_modules", "@esbuild");
  let candidates = [];
  try {
    candidates = fs.readdirSync(esbuildRoot)
      .map((name) => path.join(esbuildRoot, name, "bin", "esbuild"))
      .filter((candidate) => fs.existsSync(candidate));
  } catch {}
  if (candidates.length > 0) process.env.ESBUILD_BINARY_PATH = candidates[0];
}

function unavailable(method, runtime) {
  return {
    ok: false,
    error: "aharness-api-unavailable",
    method,
    message: runtime?.message || "@aharness/core/runtime is not available in this Codex Plus bundle",
  };
}

function create(options = {}) {
  const runtimePromise = loadRuntime(options.runtimeLoader);
  const runs = new Map();
  const subscriptions = new Map();

  async function runtimeFor(method) {
    const runtime = await runtimePromise;
    if (runtime?.__codexPlusUnavailable) return unavailable(method, runtime);
    return runtime;
  }

  function notify(runId) {
    const projection = runs.get(runId)?.projection;
    if (!projection) return;
    for (const listener of subscriptions.get(runId) || []) {
      try {
        listener(snapshotRun(runId));
      } catch {}
    }
  }

  function snapshotRun(runId) {
    const entry = runs.get(runId);
    if (!entry) return null;
    return jsonClone(normalizeProjection(entry.projection));
  }

  async function listCommands(params = {}) {
    const runtime = await runtimePromise;
    if (typeof runtime.listInstalledCommands === "function") {
      const commands = await runtime.listInstalledCommands(params);
      return { ok: true, commands: jsonClone(commands) };
    }
    return { ok: true, commands: listInstalledCommandsFromStore(params), degraded: runtime.__codexPlusUnavailable ? "store-only" : undefined };
  }

  async function installPackage(params = {}) {
    const runtime = await runtimeFor("installAharnessPackage");
    if (runtime.ok === false) return runtime;
    if (typeof runtime.installAharnessPackage !== "function") return unavailable("installAharnessPackage", runtime);
    return { ok: true, result: jsonClone(await runtime.installAharnessPackage(params.source, params)) };
  }

  async function uninstallPackage(params = {}) {
    const runtime = await runtimeFor("uninstallAharnessPackage");
    if (runtime.ok === false) return runtime;
    if (typeof runtime.uninstallAharnessPackage !== "function") return unavailable("uninstallAharnessPackage", runtime);
    return { ok: true, result: jsonClone(await runtime.uninstallAharnessPackage(params.packageName, params)) };
  }

  async function verifyTarget(params = {}) {
    const runtime = await runtimeFor("verifyAharnessTarget");
    if (runtime.ok === false) return runtime;
    if (typeof runtime.verifyAharnessTarget !== "function") {
      if (typeof runtime.loadFsm === "function") {
        try {
          const cwd = safeString(params.cwd, process.cwd());
          const target = safeString(params.target);
          if (!target) return { ok: false, error: "missing-target" };
          const loaded = await runtime.loadFsm({
            filePath: path.resolve(cwd, target),
            repoRoot: cwd,
            noCache: params.noCache === true,
          });
          return {
            ok: true,
            result: {
              ok: loaded.issues.length === 0,
              issues: jsonClone(loaded.issues),
              hash: loaded.hash,
              modulePath: loaded.modulePath,
            },
          };
        } catch (error) {
          return {
            ok: true,
            result: {
              ok: false,
              issues: [{ message: error?.message || String(error) }],
            },
          };
        }
      }
      return unavailable("verifyAharnessTarget", runtime);
    }
    return { ok: true, result: jsonClone(await runtime.verifyAharnessTarget(params.target, params)) };
  }

  async function projectConfig(params = {}) {
    const projectRoot = findProjectRoot(params.cwd);
    const plusTomlPath = path.join(projectRoot, ".codex", "plus.toml");
    let parsed = { stateMachines: [], ignoredLines: [] };
    let readOk = false;
    try {
      parsed = parseAharnessStateMachines(fs.readFileSync(plusTomlPath, "utf8"));
      readOk = true;
    } catch {}
    if (parsed.stateMachines.length === 0 && params.includeDemoFallback === true) {
      parsed.stateMachines = [{
        target: "await-checkpoints",
        label: "Await checkpoints",
        description: "Vendored demo workflow with owner gates",
      }];
    }
    return {
      ok: true,
      projectRoot,
      plusTomlPath,
      readOk,
      stateMachines: parsed.stateMachines,
      warnings: parsed.ignoredLines,
    };
  }

  async function startRun(params = {}) {
    const runtime = await runtimeFor("startAharnessRun");
    if (runtime.ok === false) return runtime;
    if (typeof runtime.startAharnessRun !== "function") return unavailable("startAharnessRun", runtime);
    const target = safeString(params.target);
    if (!target) return { ok: false, error: "missing-target" };

    const handle = await runtime.startAharnessRun({
      target,
      cwd: safeString(params.cwd, process.cwd()),
      input: params.input && typeof params.input === "object" ? params.input : undefined,
      permissionMode: params.permissionMode,
      ui: false,
    });
    const projection = createProjection(handle.runId, {
      target,
      cwd: params.cwd,
      runDir: handle.runDir,
      project: params.project,
      stateMachine: params.stateMachine,
    });
    runs.set(handle.runId, { handle, projection });
    if (typeof handle.subscribe === "function") {
      handle.subscribe((event) => {
        applyEventToProjection(projection, event);
        notify(handle.runId);
      });
    }
    Promise.resolve(handle.result?.()).then((result) => {
      applyEventsFromFile(projection, handle.eventsPath);
      projection.status = result?.status || projection.status;
      projection.terminal = { ...(projection.terminal || {}), ...jsonClone(result) };
      notify(handle.runId);
    }).catch((error) => {
      projection.status = "failed";
      projection.error = error?.message || String(error);
      notify(handle.runId);
    });
    return { ok: true, run: snapshotRun(handle.runId) };
  }

  async function listRuns(params = {}) {
    const liveRuns = Array.from(runs.keys()).map((runId) => snapshotRun(runId)).filter(Boolean);
    const runtime = await runtimePromise;
    if (typeof runtime.listRecordedRuns !== "function") return { ok: true, runs: liveRuns };
    const recorded = await runtime.listRecordedRuns(params);
    return { ok: true, runs: liveRuns, recorded: jsonClone(recorded) };
  }

  async function readRun(params = {}) {
    const runId = safeString(params.runId);
    if (!runId) return { ok: false, error: "missing-run-id" };
    const live = snapshotRun(runId);
    if (live) return { ok: true, run: live };
    const runtime = await runtimePromise;
    if (typeof runtime.loadRecordedRun !== "function") return { ok: false, error: "run-not-found" };
    return { ok: true, run: jsonClone(await runtime.loadRecordedRun(runId, params)) };
  }

  async function reply(params = {}) {
    const runId = safeString(params.runId);
    const entry = runs.get(runId);
    if (!entry) return { ok: false, error: "run-not-found" };
    const payload = params.payload && typeof params.payload === "object" ? params.payload : params;
    let result;
    switch (payload.kind) {
      case "user-prompt":
      case "text":
        {
          recordOwnerReply(entry.projection, runId, {
            ...payload,
            requestId: payload.requestId || `owner-text:${Date.now()}`,
          });
          notify(runId);
        }
        result = await entry.handle.sendText(payload.text || "");
        break;
      case "owner-choice":
        result = await entry.handle.chooseOwnerOption(payload);
        recordOwnerReply(entry.projection, runId, payload);
        notify(runId);
        break;
      case "owner-input":
        result = await entry.handle.answerOwnerInput(payload);
        recordOwnerReply(entry.projection, runId, payload);
        notify(runId);
        break;
      case "approval":
        result = await entry.handle.resolveApproval(payload);
        recordOwnerReply(entry.projection, runId, payload);
        notify(runId);
        break;
      case "permission":
        result = await entry.handle.resolvePermission(payload);
        recordOwnerReply(entry.projection, runId, payload);
        notify(runId);
        break;
      case "elicitation":
        result = await entry.handle.resolveElicitation(payload);
        recordOwnerReply(entry.projection, runId, payload);
        notify(runId);
        break;
      default:
        return { ok: false, error: "unsupported-reply-kind" };
    }
    return { ok: true, result: jsonClone(result) };
  }

  async function cancelRun(params = {}) {
    const runId = safeString(params.runId);
    const entry = runs.get(runId);
    if (!entry) return { ok: false, error: "run-not-found" };
    await entry.handle.cancel(params.reason);
    entry.projection.status = "cancelled";
    notify(runId);
    return { ok: true, run: snapshotRun(runId) };
  }

  async function readArtifact(params = {}) {
    const runId = safeString(params.runId);
    const artifactPath = path.resolve(safeString(params.path));
    if (!runId || !artifactPath) return { ok: false, error: "missing-artifact" };
    const entry = runs.get(runId);
    const projection = entry?.projection || snapshotRun(runId);
    if (!projection) return { ok: false, error: "run-not-found" };
    const artifact = projection.artifacts.find((candidate) => path.resolve(candidate.path) === artifactPath);
    if (!artifact) return { ok: false, error: "artifact-not-in-run" };
    const runDir = path.resolve(entry?.handle?.runDir || path.dirname(entry?.handle?.eventsPath || artifactPath));
    const relative = path.relative(runDir, artifactPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) return { ok: false, error: "artifact-outside-run" };
    let content;
    try {
      content = fs.readFileSync(artifactPath, "utf8");
    } catch (error) {
      return { ok: false, error: "artifact-read-failed", message: error?.message || String(error) };
    }
    return { ok: true, artifact: { ...jsonClone(artifact), content } };
  }

  function subscribe(runId, listener) {
    const set = subscriptions.get(runId) || new Set();
    set.add(listener);
    subscriptions.set(runId, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) subscriptions.delete(runId);
    };
  }

  async function request(method, params) {
    switch (method) {
      case "aharness/commands/list":
        return listCommands(params);
      case "aharness/packages/install":
        return installPackage(params);
      case "aharness/packages/uninstall":
        return uninstallPackage(params);
      case "aharness/verify":
        return verifyTarget(params);
      case "aharness/project/config":
        return projectConfig(params);
      case "aharness/run/start":
        return startRun(params);
      case "aharness/run/list":
        return listRuns(params);
      case "aharness/run/read":
        return readRun(params);
      case "aharness/run/reply":
        return reply(params);
      case "aharness/run/cancel":
        return cancelRun(params);
      case "aharness/run/artifact/read":
        return readArtifact(params);
      default:
        return { ok: false, error: "unknown-aharness-method" };
    }
  }

  async function close() {
    await Promise.allSettled(Array.from(runs.values()).map((entry) => entry.handle.cancel?.("Codex Plus is shutting down")));
  }

  return {
    close,
    request,
    subscribe,
    _runtime: runtimePromise,
    _runs: runs,
  };
}

module.exports = {
  applyEventToProjection,
  create,
  createProjection,
  listInstalledCommandsFromStore,
  normalizeProjection,
};
