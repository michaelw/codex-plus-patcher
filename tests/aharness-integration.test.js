const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const aharnessService = require("../src/runtime/host/aharnessService");
const { runtimeFiles } = require("../src/runtime/assets");

const EXAMPLE_TARGETS = [
  "color-funnel.fsm.ts",
  "ops-clear-demo.fsm.ts",
  "trivia-rounds.fsm.ts",
  "adventure.fsm.ts",
  "await-checkpoints.fsm.ts",
  "pirate-roast.fsm.ts",
  "composed-pipeline.fsm.ts",
  "approval-policy.fsm.ts",
];

async function loadRealAharnessExample(fileName) {
  const runtime = await import("@aharness/core/runtime");
  const cwd = path.resolve(__dirname, "..");
  return runtime.loadFsm({
    filePath: path.join(cwd, "src/runtime/vendor/aharness/examples", fileName),
    repoRoot: cwd,
    noCache: true,
  });
}

async function createRealExampleActor(fileName) {
  const [{ createActor }, loaded] = await Promise.all([
    import("xstate"),
    loadRealAharnessExample(fileName),
  ]);
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-plus-aharness-real-run-"));
  const actor = createActor(loaded.machine, {
    input: { runId: "real-test-run", runDir },
  }).start();
  return { actor, loaded, runDir };
}

function runRuntimeApi(context) {
  for (const [asarPath, localPath] of runtimeFiles) {
    if (!asarPath.startsWith("webview/assets/codex-plus/api/")) continue;
    vm.runInNewContext(
      fs.readFileSync(path.join(__dirname, "../src/runtime", localPath), "utf8"),
      context,
      { filename: localPath },
    );
  }
}

test("aharness service lists trusted commands from the store without shelling out", async () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-plus-aharness-home-"));
  const aharnessHome = path.join(homeDir, ".aharness");
  fs.mkdirSync(aharnessHome, { recursive: true });
  fs.writeFileSync(path.join(aharnessHome, "commands.json"), JSON.stringify({
    schemaVersion: 1,
    generation: "test",
    commands: {
      "@scope/workflows/build": {
        packageName: "@scope/workflows",
        commandName: "build",
        entry: "dist/build.fsm.js",
        packageRoot: "/tmp/workflows",
        packageVersion: "1.2.3",
        lockFingerprint: "abc",
        description: "Build safely",
      },
    },
  }));

  const service = aharnessService.create({ runtimeLoader: () => ({}) });
  const result = await service.request("aharness/commands/list", { homeDir });

  assert.equal(result.ok, true);
  assert.deepEqual(result.commands, [{
    identity: "@scope/workflows/build",
    packageName: "@scope/workflows",
    commandName: "build",
    packageVersion: "1.2.3",
    description: "Build safely",
    entry: "dist/build.fsm.js",
    packageRoot: "/tmp/workflows",
    lockFingerprint: "abc",
  }]);
});

test("aharness service starts runs through startAharnessRun and routes replies through the handle", async () => {
  const calls = [];
  let listener;
  const handle = {
    runId: "run-1",
    subscribe(fn) {
      listener = fn;
    },
    sendText(text) {
      calls.push(["sendText", text]);
      listener?.({
        schema: "aharness.event.v1",
        runId: "run-1",
        seq: 3,
        id: "run-1:3",
        time: "2026-07-03T00:00:02.000Z",
        type: "transcript.row",
        data: { row: { id: "row-3", kind: "message", label: "agentMessage", text: "I saw the owner text.", status: "completed" } },
      });
      return Promise.resolve({ ok: true, status: 200, body: {} });
    },
    chooseOwnerOption(payload) {
      calls.push(["chooseOwnerOption", payload]);
      return Promise.resolve({ ok: true, status: 200, body: {} });
    },
    result() {
      return new Promise(() => {});
    },
  };
  const service = aharnessService.create({
    runtimeLoader: () => ({
      startAharnessRun(options) {
        calls.push(["startAharnessRun", options]);
        return Promise.resolve(handle);
      },
    }),
  });

  const started = await service.request("aharness/run/start", { target: "./demo.fsm.ts", cwd: "/tmp/demo" });
  assert.equal(started.ok, true);
  assert.equal(started.run.runId, "run-1");
  assert.equal(calls[0][0], "startAharnessRun");
  assert.deepEqual(calls[0][1], { target: "./demo.fsm.ts", cwd: "/tmp/demo", input: undefined, permissionMode: undefined, ui: false });

  listener({
    schema: "aharness.event.v1",
    runId: "run-1",
    seq: 1,
    id: "run-1:1",
    time: "2026-07-03T00:00:00.000Z",
    type: "state.changed",
    data: { path: "plan", row: { id: "row-1", kind: "state_change", text: "entered plan" } },
  });
  const read = await service.request("aharness/run/read", { runId: "run-1" });
  assert.equal(read.run.currentState.path, "plan");
  assert.equal(read.run.recentRows[0].text, "entered plan");

  listener({
    schema: "aharness.event.v1",
    runId: "run-1",
    seq: 2,
    id: "run-1:2",
    time: "2026-07-03T00:00:01.000Z",
    type: "artifact.written",
    data: { path: "/tmp/demo/deploy-log.md", row: { id: "row-2", kind: "framework_note", summary: "deploy-log.md written" } },
  });
  const withArtifact = await service.request("aharness/run/read", { runId: "run-1" });
  assert.deepEqual(withArtifact.run.artifacts, [{
    path: "/tmp/demo/deploy-log.md",
    name: "deploy-log.md",
    kind: "file",
    eventId: "run-1:2",
    time: "2026-07-03T00:00:01.000Z",
  }]);

  await service.request("aharness/run/reply", { runId: "run-1", payload: { kind: "text", text: "continue" } });
  const afterTextReply = await service.request("aharness/run/read", { runId: "run-1" });
  assert.ok(
    afterTextReply.run.recentRows.findIndex((row) => row.text === "continue") <
      afterTextReply.run.recentRows.findIndex((row) => row.text === "I saw the owner text."),
  );
  await service.request("aharness/run/reply", { runId: "run-1", payload: { kind: "owner-choice", state: "approve", visitCount: 1, label: "Approve" } });
  assert.deepEqual(calls.slice(1), [
    ["sendText", "continue"],
    ["chooseOwnerOption", { kind: "owner-choice", state: "approve", visitCount: 1, label: "Approve" }],
  ]);
});

test("aharness service reads project state machines from plus.toml", async () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "codex-plus-aharness-project-"));
  fs.mkdirSync(path.join(project, ".codex"), { recursive: true });
  fs.mkdirSync(path.join(project, "subdir"), { recursive: true });
  fs.writeFileSync(path.join(project, ".codex", "plus.toml"), [
    "[[aharness.state_machines]]",
    "label = \"Release gate\"",
    "target = \"await-checkpoints\"",
    "description = \"Run release checks\"",
    "",
  ].join("\n"));
  const service = aharnessService.create({ runtimeLoader: () => ({}) });

  const result = await service.request("aharness/project/config", { cwd: path.join(project, "subdir") });

  assert.equal(result.ok, true);
  assert.equal(result.projectRoot, project);
  assert.equal(result.readOk, true);
  assert.deepEqual(result.stateMachines, [{
    label: "Release gate",
    target: "await-checkpoints",
    description: "Run release checks",
  }]);
});

test("aharness projection coalesces streamed agent messages and replaces them with completed text", () => {
  const projection = aharnessService.createProjection("run-stream", { cwd: "/tmp/demo", target: "demo.fsm.ts" });

  aharnessService.applyEventToProjection(projection, {
    id: "run-stream:1",
    seq: 1,
    type: "model.delta",
    itemId: "item-1",
    data: { row: { kind: "message", text: "I" } },
  });
  aharnessService.applyEventToProjection(projection, {
    id: "run-stream:2",
    seq: 2,
    type: "model.delta",
    itemId: "item-1",
    data: { row: { kind: "message", text: "'ll inspect it." } },
  });

  assert.equal(projection.recentRows.length, 1);
  assert.equal(projection.recentRows[0].text, "I'll inspect it.");
  assert.equal(projection.recentRows[0].status, "streaming");

  aharnessService.applyEventToProjection(projection, {
    id: "run-stream:3",
    seq: 3,
    type: "item.completed",
    itemId: "item-1",
    data: {
      itemId: "item-1",
      itemType: "agentMessage",
      row: { kind: "message", label: "agentMessage", text: "I'll inspect the tiny fixture first.", status: "completed" },
    },
  });

  assert.equal(projection.recentRows.length, 1);
  assert.equal(projection.recentRows[0].text, "I'll inspect the tiny fixture first.");
  assert.equal(projection.recentRows[0].status, "completed");
});

test("aharness projection renders one accepted owner reply", () => {
  const projection = aharnessService.createProjection("run-reply", { cwd: "/tmp/demo", target: "demo.fsm.ts" });

  aharnessService.applyEventToProjection(projection, {
    id: "run-reply:1",
    seq: 1,
    type: "reply.submitted",
    requestId: "request-1",
    data: { row: { kind: "reply", label: "owner choice", status: "submitted", summary: "Approve" } },
  });
  aharnessService.applyEventToProjection(projection, {
    id: "run-reply:2",
    seq: 2,
    type: "reply.resolved",
    requestId: "request-1",
    data: { row: { kind: "reply", label: "owner choice", status: "accepted", summary: "Approve" } },
  });

  assert.deepEqual(projection.recentRows.map((row) => [row.kind, row.status, row.summary]), [
    ["reply", "accepted", "Approve"],
  ]);
});

test("aharness projection suppresses generic user-prompt reply placeholders", () => {
  const projection = aharnessService.createProjection("run-user-prompt", { cwd: "/tmp/demo", target: "demo.fsm.ts" });

  aharnessService.applyEventToProjection(projection, {
    id: "run-user-prompt:1",
    seq: 1,
    type: "reply.resolved",
    requestId: "request-1",
    data: { row: { kind: "reply", label: "user-prompt", status: "accepted", summary: "user-prompt" } },
  });
  aharnessService.applyEventToProjection(projection, {
    id: "run-user-prompt:2",
    seq: 2,
    type: "reply.resolved",
    requestId: "request-2",
    data: { row: { kind: "reply", label: "owner", status: "accepted", text: "Please revise the plan.", summary: "Please revise the plan." } },
  });
  aharnessService.applyEventToProjection(projection, {
    id: "run-user-prompt:3",
    seq: 3,
    type: "transcript.row",
    data: { itemType: "userMessage", row: { kind: "message", label: "userMessage", text: "Please revise the plan.", status: "completed" } },
  });

  assert.deepEqual(projection.recentRows.map((row) => row.text || row.summary), ["Please revise the plan."]);
});

test("aharness projection normalizes framework prompts and suppresses matching user message echoes", () => {
  const projection = aharnessService.createProjection("run-note", { cwd: "/tmp/demo", target: "demo.fsm.ts" });
  const note = [
    '[aharness] Now in state "caveVictory".',
    "Valid exits:",
    '  - "submit" -> call aharness_submit({state: "caveVictory", exit: "submit", data: {"type":"object"}})',
    "",
    "Write a 1-2 sentence victorious cave ending and submit it.",
  ].join("\n");

  aharnessService.applyEventToProjection(projection, {
    id: "run-note:1",
    seq: 1,
    type: "framework.note",
    data: { id: "note-1", variant: "info", row: { kind: "framework_note", text: note, status: "info" } },
  });
  aharnessService.applyEventToProjection(projection, {
    id: "run-note:2",
    seq: 2,
    type: "item.completed",
    itemId: "user-1",
    data: { itemType: "userMessage", row: { kind: "message", label: "userMessage", text: note, status: "completed" } },
  });
  aharnessService.applyEventToProjection(projection, {
    id: "run-note:3",
    seq: 3,
    type: "item.completed",
    itemId: "agent-1",
    data: { itemType: "agentMessage", row: { kind: "message", label: "agentMessage", text: "I will submit now.", status: "completed" } },
  });
  aharnessService.applyEventToProjection(projection, {
    id: "run-note:4",
    seq: 4,
    type: "item.completed",
    itemId: "user-2",
    data: { itemType: "userMessage", row: { kind: "message", label: "userMessage", text: note, status: "completed" } },
  });

  assert.equal(projection.recentRows.length, 2);
  assert.equal(projection.recentRows[0].kind, "state_prompt");
  assert.equal(projection.recentRows[0].text, "Write a 1-2 sentence victorious cave ending and submit it.");
  assert.doesNotMatch(projection.recentRows[0].text, /Valid exits/);
  assert.equal(projection.recentRows[1].text, "I will submit now.");
});

test("aharness projection keeps public tool details and full scrollback", () => {
  const projection = aharnessService.createProjection("run-long", { cwd: "/tmp/demo", target: "demo.fsm.ts" });

  aharnessService.applyEventToProjection(projection, {
    id: "run-long:tool",
    seq: 1,
    type: "item.completed",
    itemId: "tool-1",
    data: {
      itemId: "tool-1",
      itemType: "commandExecution",
      row: {
        kind: "tool",
        label: "bash",
        status: "completed",
        summary: "bash",
        output: "ok\n",
        elapsedMs: 1234,
        data: { displayKind: "command", command: "npm test", cwd: "/tmp/demo" },
      },
    },
  });
  for (let index = 0; index < 250; index += 1) {
    aharnessService.applyEventToProjection(projection, {
      id: `run-long:${index}`,
      seq: index + 2,
      type: "item.completed",
      itemId: `message-${index}`,
      data: { itemType: "agentMessage", row: { kind: "message", label: "agentMessage", text: `message ${index}` } },
    });
  }

  assert.equal(projection.recentRows[0].kind, "tool");
  assert.equal(projection.recentRows[0].output, "ok\n");
  assert.equal(projection.recentRows[0].elapsedMs, 1234);
  assert.deepEqual(projection.recentRows[0].data, { displayKind: "command", command: "npm test", cwd: "/tmp/demo" });
  assert.equal(projection.recentRows.at(-1).text, "message 249");
  assert.equal(projection.recentRows.length, 251);
});

test("aharness projection preserves public file change lists", () => {
  const projection = aharnessService.createProjection("run-files", { cwd: "/tmp/demo", target: "demo.fsm.ts" });

  aharnessService.applyEventToProjection(projection, {
    id: "run-files:1",
    seq: 1,
    type: "item.completed",
    itemId: "files-1",
    data: {
      itemType: "fileChange",
      row: {
        kind: "file_change",
        label: "fileChange",
        text: "Edited 2 files (+22 -1)",
        changes: [
          { path: "/tmp/demo/examples/coding-smoke/fixture/src/math.ts", status: "modified", stats: "+10 -1" },
          { path: "/tmp/demo/examples/coding-smoke/fixture/test/math.test.ts", status: "modified", stats: "+12" },
        ],
      },
    },
  });

  assert.equal(projection.recentRows.length, 1);
  assert.deepEqual(projection.recentRows[0].data.changes, [
    { path: "/tmp/demo/examples/coding-smoke/fixture/src/math.ts", status: "modified", stats: "+10 -1" },
    { path: "/tmp/demo/examples/coding-smoke/fixture/test/math.test.ts", status: "modified", stats: "+12" },
  ]);
});

test("aharness projection shows transient reasoning while streaming and hides it on next output", () => {
  const projection = aharnessService.createProjection("run-noise", { cwd: "/tmp/demo", target: "demo.fsm.ts" });

  aharnessService.applyEventToProjection(projection, {
    id: "run-noise:started",
    seq: 1,
    type: "run.started",
    data: { row: { kind: "run_lifecycle", text: "Run started", summary: "Run started" } },
  });
  aharnessService.applyEventToProjection(projection, {
    id: "run-noise:reasoning-empty",
    seq: 2,
    type: "model.delta",
    itemId: "reasoning-1",
    data: { itemType: "reasoning", row: { kind: "reasoning", label: "reasoning", text: "reasoning" } },
  });
  assert.deepEqual(projection.recentRows.map((row) => row.text), ["Thinking"]);
  assert.equal(projection.recentRows[0].status, "streaming");
  assert.equal(projection.recentRows[0].data.transientReasoning, true);

  aharnessService.applyEventToProjection(projection, {
    id: "run-noise:agent-ready",
    seq: 3,
    type: "item.completed",
    itemId: "agent-1",
    data: { itemType: "agentMessage", row: { kind: "message", label: "agentMessage", text: "Checking fixture files." } },
  });
  assert.deepEqual(projection.recentRows.map((row) => row.text), ["Checking fixture files."]);

  aharnessService.applyEventToProjection(projection, {
    id: "run-noise:reasoning-completed-placeholder",
    seq: 4,
    type: "item.completed",
    itemId: "reasoning-1",
    data: { itemType: "reasoning", row: { kind: "reasoning", label: "reasoning", text: "reasoning" } },
  });
  assert.deepEqual(projection.recentRows.map((row) => row.text), ["Checking fixture files."]);

  aharnessService.applyEventToProjection(projection, {
    id: "run-noise:reasoning-useful",
    seq: 5,
    type: "item.completed",
    itemId: "reasoning-2",
    data: { itemType: "reasoning", row: { kind: "reasoning", label: "reasoning", text: "Checking fixture files." } },
  });

  assert.deepEqual(projection.recentRows.map((row) => row.text), ["Checking fixture files.", "Checking fixture files."]);
});

test("aharness projection preserves open-state metadata", () => {
  const projection = aharnessService.createProjection("run-open", { cwd: "/tmp/demo", target: "demo.fsm.ts" });

  aharnessService.applyEventToProjection(projection, {
    id: "run-open:state",
    seq: 1,
    type: "state.changed",
    data: {
      path: "revisePlan",
      visitCount: 2,
      mode: "open",
      row: { kind: "state", type: "state.changed", data: { open: true } },
    },
  });

  assert.equal(projection.currentState.path, "revisePlan");
  assert.equal(projection.currentState.open, true);
  assert.equal(projection.status, "running");

  aharnessService.applyEventToProjection(projection, {
    id: "run-open:state-repeat",
    seq: 2,
    type: "state.changed",
    data: {
      path: "revisePlan",
      visitCount: 2,
      row: { kind: "state", type: "state.changed", data: {} },
    },
  });

  assert.equal(projection.currentState.path, "revisePlan");
  assert.equal(projection.currentState.open, true);
});

test("aharness projection normalizes state order after event replay", () => {
  const projection = aharnessService.createProjection("run-order", { cwd: "/tmp/demo", target: "demo.fsm.ts" });

  aharnessService.applyEventToProjection(projection, {
    id: "run-order:37",
    seq: 37,
    type: "state.changed",
    data: { path: "verdict", kind: "stateful", row: { kind: "state", data: { open: false } } },
  });
  aharnessService.applyEventToProjection(projection, {
    id: "run-order:53",
    seq: 53,
    type: "state.changed",
    data: { path: "done", kind: "terminal", row: { kind: "state" } },
  });
  aharnessService.applyEventToProjection(projection, {
    id: "run-order:3",
    seq: 3,
    type: "state.changed",
    data: { path: "confess", kind: "stateful", mode: "open", row: { kind: "state", data: { open: true } } },
  });

  aharnessService.normalizeProjection(projection);

  assert.equal(projection.currentState.path, "done");
  assert.equal(projection.currentState.kind, "terminal");
  assert.deepEqual(projection.stateVisits.map((visit) => visit.path), ["confess", "verdict", "done"]);
});

test("aharness project config does not synthesize demo machines unless requested", async () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "codex-plus-aharness-empty-project-"));
  fs.mkdirSync(path.join(project, ".codex"), { recursive: true });
  fs.writeFileSync(path.join(project, ".codex", "plus.toml"), "");
  const service = aharnessService.create({ runtimeLoader: () => ({}) });

  const normal = await service.request("aharness/project/config", { cwd: project });
  const fallback = await service.request("aharness/project/config", { cwd: project, includeDemoFallback: true });

  assert.deepEqual(normal.stateMachines, []);
  assert.deepEqual(fallback.stateMachines, [{
    target: "await-checkpoints",
    label: "Await checkpoints",
    description: "Vendored demo workflow with owner gates",
  }]);
});

test("real aharness runtime loads every documented example from authored source", async () => {
  for (const target of EXAMPLE_TARGETS) {
    const loaded = await loadRealAharnessExample(target);
    assert.equal(loaded.issues.length, 0, target);
    assert.ok(loaded.machine.id, target);
    assert.ok(Object.keys(loaded.machine.config.states).length > 0, target);
  }
});

test("real color funnel example preserves authored choices, reductions, and artifact", async () => {
  const { actor, loaded } = await createRealExampleActor("color-funnel.fsm.ts");
  const pickColor = loaded.machine.config.states.pickColor.meta.aharness;

  assert.equal(pickColor.question, "Pick a color.");
  assert.deepEqual(pickColor.options.map((option) => option.label), ["red", "green", "blue", "yellow"]);

  actor.send({ type: "OWNER_CHOICE__pickColor", payload: { label: "green" } });
  assert.equal(actor.getSnapshot().value, "greenFruit");
  actor.send({ type: "SUBMIT__greenFruit__submit", payload: { fruit: "Kiwi", reason: "Its flesh is green." } });
  actor.send({ type: "OWNER_CHOICE__confirm", payload: { label: "Yes" } });

  const snapshot = actor.getSnapshot();
  const finalize = loaded.machine.config.states.finalize.meta.aharness;
  const artifact = finalize.artifacts["result.md"](snapshot.context);
  assert.equal(snapshot.value, "finalize");
  assert.equal(snapshot.context.color, "green");
  assert.equal(snapshot.context.fruit, "Kiwi");
  assert.match(artifact, /# Color Funnel Result/);
  assert.match(artifact, /- Color: green/);
  assert.match(artifact, /- Fruit: Kiwi/);
  assert.doesNotMatch(artifact, /completed with fixture defaults|Continue/);
});

test("real adventure example follows the authored two-choice branch", async () => {
  const { actor, loaded } = await createRealExampleActor("adventure.fsm.ts");
  const entranceChoice = loaded.machine.config.states.entranceChoice.meta.aharness;
  const caveChoice = loaded.machine.config.states.caveChoice.meta.aharness;

  assert.deepEqual({
    question: entranceChoice.question,
    options: entranceChoice.options.map((option) => option.label),
  }, {
    question: "Choose a path.",
    options: ["Forest", "Cave", "River"],
  });
  assert.deepEqual({
    question: caveChoice.question,
    options: caveChoice.options.map((option) => option.label),
  }, {
    question: "Bold or cautious?",
    options: ["Bold", "Cautious"],
  });

  actor.send({ type: "SUBMIT__entrance__submit", payload: { scene: "A mossy crossroads opens before you." } });
  actor.send({ type: "OWNER_CHOICE__entranceChoice", payload: { label: "Cave" } });
  actor.send({ type: "SUBMIT__cave__submit", payload: { scene: "The cave breathes cold air and distant light." } });
  actor.send({ type: "OWNER_CHOICE__caveChoice", payload: { label: "Cautious" } });
  actor.send({ type: "SUBMIT__caveVictory__submit", payload: { ending: "You read the stones, avoid the trap, and emerge with the crown." } });

  const snapshot = actor.getSnapshot();
  const victory = loaded.machine.config.states.victory.meta.aharness;
  const artifact = victory.artifacts["adventure.md"](snapshot.context);
  assert.equal(snapshot.value, "victory");
  assert.equal(snapshot.context.outcome, "victory");
  assert.match(artifact, /Outcome: \*\*victory\*\*/);
  assert.match(artifact, /cave: The cave breathes cold air/);
});

test("aharness service carries project metadata into started runs", async () => {
  const handle = {
    runId: "run-project",
    subscribe() {},
    result() {
      return new Promise(() => {});
    },
  };
  const service = aharnessService.create({
    runtimeLoader: () => ({
      startAharnessRun() {
        return Promise.resolve(handle);
      },
    }),
  });

  const result = await service.request("aharness/run/start", {
    target: "await-checkpoints",
    cwd: "/tmp/project",
    project: { id: "/tmp/project", label: "Project", cwd: "/tmp/project" },
    stateMachine: { label: "Await checkpoints", target: "await-checkpoints", description: "Owner gates" },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.run.project, { id: "/tmp/project", label: "Project", cwd: "/tmp/project" });
  assert.deepEqual(result.run.stateMachine, {
    label: "Await checkpoints",
    target: "await-checkpoints",
    description: "Owner gates",
  });
});

test("aharness service reads only artifacts reported by a live run", async () => {
  let listener;
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-plus-aharness-artifact-"));
  fs.mkdirSync(path.join(runDir, "artifacts"), { recursive: true });
  const artifactPath = path.join(runDir, "artifacts", "result.md");
  fs.writeFileSync(artifactPath, "# Result\n\nok\n");
  const service = aharnessService.create({
    runtimeLoader: () => ({
      startAharnessRun() {
        return Promise.resolve({
          runId: "artifact-run",
          runDir,
          eventsPath: path.join(runDir, "events.jsonl"),
          subscribe(fn) { listener = fn; },
          result() { return new Promise(() => {}); },
        });
      },
    }),
  });

  await service.request("aharness/run/start", { target: "await-checkpoints", cwd: runDir });
  listener({
    schema: "aharness.event.v1",
    runId: "artifact-run",
    seq: 1,
    id: "artifact-run:1",
    time: "2026-07-03T00:00:00.000Z",
    type: "artifact.written",
    data: { relPath: "result.md" },
  });

  const read = await service.request("aharness/run/artifact/read", { runId: "artifact-run", path: artifactPath });
  assert.equal(read.ok, true);
  assert.equal(read.artifact.content, "# Result\n\nok\n");

  const rejected = await service.request("aharness/run/artifact/read", { runId: "artifact-run", path: path.join(os.tmpdir(), "other.md") });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error, "artifact-not-in-run");
});

test("aharness plugin registers native commands and menu item", async () => {
  const nativeRequests = [];
  const styles = [];
  const bodyChildren = [];
  function element(tag) {
    return {
      tag,
      children: [],
      style: {},
      hidden: false,
      innerHTML: "",
      textContent: "",
      appendChild(child) {
        this.children.push(child);
        return child;
      },
      insertBefore(child) {
        this.children.unshift(child);
        return child;
      },
      insertAdjacentHTML() {},
      addEventListener() {},
      setAttribute(key, value) {
        this[key] = value;
      },
      getAttribute(key) {
        return this[key] ?? null;
      },
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
    };
  }
  const window = {
    location: { href: "https://example.invalid/webview/assets/codex-plus/runtime.js" },
    localStorage: { getItem() { return null; }, setItem() {} },
    history: { state: null, replaceState() {} },
    setInterval() { return 1; },
    clearInterval() {},
    codexPlusHostBridge: {
      request(method, params) {
        nativeRequests.push({ method, params });
        return Promise.resolve({ ok: true, runs: [] });
      },
    },
  };
  const context = {
    window,
    globalThis: window,
    URL,
    document: {
      head: { appendChild(element) { styles.push(element); } },
      body: {
        appendChild(child) { bodyChildren.push(child); return child; },
        insertBefore(child) { bodyChildren.unshift(child); return child; },
      },
      createElement: element,
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      documentElement: { style: { setProperty() {}, removeProperty() {} } },
    },
  };
  runRuntimeApi(context);
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../src/runtime/host/coreAdapters.js"), "utf8"),
    context,
    { filename: "host/coreAdapters.js" },
  );
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../src/runtime/plugins/aharnessRuns.js"), "utf8"),
    context,
    { filename: "plugins/aharnessRuns.js" },
  );

  const api = window.CodexPlus;
  assert.ok(api.plugins.get("aharnessRuns"));
  assert.ok(api.commands.all().some((command) => command.id === "codexPlusAharnessOpenRuns"));
  assert.ok(api.commands.all().some((command) => command.id === "codexPlusAharnessRunWorkflow"));
  assert.equal(typeof api.ui.virtualConversations.open, "function");
  assert.deepEqual(JSON.parse(JSON.stringify(api.ui.virtualConversations.list())), []);
  assert.ok(styles.some((element) => element.id === "codex-plus-style-aharnessRuns"));
  assert.deepEqual(JSON.parse(JSON.stringify(nativeRequests[0])), {
    method: "native-menu/register-item",
    params: {
      id: "codexPlusAharnessOpenRuns",
      menuId: "view-menu",
      afterLabel: "Find",
      label: "Aharness Runs",
      nativeRequest: { method: "renderer/command", params: { id: "codexPlusAharnessOpenRuns" } },
    },
  });
});

test("virtual conversations do not hide normal Codex route siblings", () => {
  const elements = new Map();
  function element(tag) {
    const node = {
      tag,
      children: [],
      hidden: false,
      attributes: {},
      innerHTML: "",
      className: "",
      parentElement: null,
      appendChild(child) {
        child.parentElement = this;
        this.children.push(child);
        if (child.id) elements.set(child.id, child);
        return child;
      },
      setAttribute(key, value) {
        this.attributes[key] = value;
        if (key === "id") {
          this.id = value;
          elements.set(value, this);
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
      querySelectorAll() {
        return [];
      },
      querySelector() {
        return null;
      },
      closest() {
        return null;
      },
      getBoundingClientRect() {
        return { width: 800, height: 600 };
      },
      addEventListener() {},
      removeEventListener() {},
    };
    return node;
  }
  const shell = element("main");
  const host = element("section");
  host.className = "app-shell-main-content-frame";
  const header = element("header");
  const composer = element("footer");
  const staleContent = element("div");
  shell.appendChild(header);
  shell.appendChild(host);
  shell.appendChild(composer);
  host.appendChild(staleContent);
  const window = {
    CodexPlus: { ui: {}, diagnostics: { log() {} } },
    CodexPlusHost: { adapters: { context: { clear() {} } } },
    history: { state: null, replaceState() {} },
    addEventListener() {},
  };
  window.CodexPlus.ui.routeContext = { clear() {} };
  const context = {
    window,
    globalThis: window,
    document: {
      body: element("body"),
      createElement: element,
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelector(selector) {
        if (selector === ".app-shell-main-content-frame") return host;
        return selector === "main" ? shell : null;
      },
      querySelectorAll(selector) {
        return selector.includes("main") ? [shell] : [];
      },
      addEventListener() {},
    },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../src/runtime/api/virtualConversations.js"), "utf8"),
    context,
    { filename: "api/virtualConversations.js" },
  );
  window.CodexPlus.ui.virtualConversations.registerProvider({
    id: "test",
    match: (route) => route === "virtual:test",
    render({ container }) {
      container.innerHTML = "virtual";
    },
  });
  const routeChanges = [];
  const unsubscribe = window.CodexPlus.ui.virtualConversations.subscribe((route) => routeChanges.push(route));

  const opened = window.CodexPlus.ui.virtualConversations.open("virtual:test");

  assert.equal(opened.ok, true);
  assert.deepEqual(routeChanges, ["virtual:test"]);
  assert.ok(host.children.some((child) => child.id === "codex-plus-virtual-conversation-root"));
  assert.equal(header.hidden, false);
  assert.equal(composer.hidden, false);
  assert.equal(staleContent.hidden, true);
  assert.equal(staleContent.attributes["data-codex-plus-virtual-hidden"], "");
  assert.equal(header.attributes["data-codex-plus-virtual-hidden"], undefined);
  assert.equal(composer.attributes["data-codex-plus-virtual-hidden"], undefined);
  window.CodexPlus.ui.virtualConversations.close();
  assert.equal(staleContent.hidden, false);
  assert.equal(staleContent.attributes["data-codex-plus-virtual-hidden"], undefined);
  assert.deepEqual(routeChanges, ["virtual:test", null]);
  unsubscribe();
});

test("virtual conversations preserve native composer descendants inside the mount host", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/runtime/api/virtualConversations.js"), "utf8");

  assert.match(source, /function nativeComposerElements\(root\)/);
  assert.match(source, /function hideHostChildren\(host, root\)/);
  assert.match(source, /function restoreHostChildren\(\)/);
  assert.match(source, /data-codex-plus-virtual-route/);
  assert.match(source, /--codex-plus-virtual-main-left/);
  assert.doesNotMatch(source, /style\.minWidth = "min\(760px, calc\(100vw - 360px\)\)"/);
  assert.doesNotMatch(source, /styledHost\.style\.minWidth = styledHostPrevious\.minWidth/);
  assert.match(source, /scheduleVirtualRouteSurfaceUpdate/);
  assert.match(source, /visualViewport\?\.addEventListener\?\.\("resize"/);
});

test("virtual conversations replace home content without hiding claimed composer ancestors", () => {
  const elements = new Map();
  function textNode(text) {
    return { nodeType: 3, textContent: text };
  }
  function element(tag, className = "") {
    const node = {
      tag,
      tagName: tag.toUpperCase(),
      children: [],
      childNodes: [],
      hidden: false,
      attributes: {},
      innerHTML: "",
      textContent: "",
      className,
      parentElement: null,
      appendChild(child) {
        child.parentElement = this;
        this.children.push(child);
        this.childNodes.push(child);
        if (child.id) elements.set(child.id, child);
        return child;
      },
      setAttribute(key, value) {
        this.attributes[key] = value;
        if (key === "id") {
          this.id = value;
          elements.set(value, this);
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
      querySelectorAll(selector) {
        const selectors = selector.split(",").map((part) => part.trim());
        const matches = [];
        const visit = (child) => {
          for (const candidate of selectors) {
            if (candidate === "[data-codex-plus-user-entry]" && child.attributes["data-codex-plus-user-entry"] != null) matches.push(child);
            if (candidate === "[data-codex-composer]" && child.attributes["data-codex-composer"] != null) matches.push(child);
            if (candidate === ".composer-surface-chrome" && String(child.className || "").includes("composer-surface-chrome")) matches.push(child);
            if (candidate === "form" && child.tagName === "FORM") matches.push(child);
          }
          for (const grandchild of child.children || []) visit(grandchild);
        };
        for (const child of this.children) visit(child);
        return matches;
      },
      querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
      },
      matches(selector) {
        return selector.split(",").map((part) => part.trim()).some((candidate) => {
          if (candidate === "[data-codex-plus-user-entry]") return this.attributes["data-codex-plus-user-entry"] != null;
          if (candidate === "[data-codex-composer]") return this.attributes["data-codex-composer"] != null;
          if (candidate === ".composer-surface-chrome") return String(this.className || "").includes("composer-surface-chrome");
          if (candidate === "form") return this.tagName === "FORM";
          return false;
        });
      },
      closest() {
        return null;
      },
      getBoundingClientRect() {
        return { width: 900, height: 650, left: 300, right: 1200, bottom: 820 };
      },
      addEventListener() {},
      removeEventListener() {},
    };
    node.childNodes.push(textNode(""));
    return node;
  }
  const host = element("section", "app-shell-main-content-frame");
  const home = element("div");
  const title = element("h1");
  title.textContent = "What should we build?";
  const composerWrap = element("div");
  const composer = element("form", "composer-surface-chrome");
  const composerEditor = element("div");
  const composerFooter = element("div");
  composer.setAttribute("data-codex-plus-user-entry", "");
  composerEditor.setAttribute("data-codex-composer", "true");
  host.appendChild(home);
  home.appendChild(title);
  home.appendChild(composerWrap);
  composerWrap.appendChild(composer);
  composer.appendChild(composerEditor);
  composer.appendChild(composerFooter);
  const window = {
    innerWidth: 1400,
    innerHeight: 900,
    CodexPlus: { ui: {}, diagnostics: { log() {} } },
    CodexPlusHost: { adapters: { context: { clear() {} } } },
    history: { state: null, replaceState() {} },
    addEventListener() {},
  };
  window.CodexPlus.ui.routeContext = { clear() {} };
  const context = {
    window,
    globalThis: window,
    getComputedStyle() {
      return { display: "block", visibility: "visible" };
    },
    document: {
      body: element("body"),
      createElement: element,
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelector(selector) {
        if (selector === ".app-shell-main-content-frame") return host;
        if (selector === "main") return host;
        return host.querySelector(selector);
      },
      querySelectorAll(selector) {
        if (selector.includes("[data-codex-plus-virtual-conversation-host]")) return [];
        if (selector.includes("main")) return [host];
        return host.querySelectorAll(selector);
      },
      addEventListener() {},
    },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../src/runtime/api/virtualConversations.js"), "utf8"),
    context,
    { filename: "api/virtualConversations.js" },
  );
  window.CodexPlus.ui.virtualConversations.registerProvider({
    id: "test",
    match: (route) => route === "virtual:test",
    render({ container }) {
      container.innerHTML = "virtual";
    },
  });

  const opened = window.CodexPlus.ui.virtualConversations.open("virtual:test");

  assert.equal(opened.ok, true);
  assert.equal(title.hidden, true);
  assert.equal(composer.hidden, false);
  assert.equal(composerWrap.hidden, false);
  assert.equal(composerEditor.hidden, false);
  assert.equal(composerFooter.hidden, false);
  assert.ok(host.children.some((child) => child.id === "codex-plus-virtual-conversation-root"));
  window.CodexPlus.ui.virtualConversations.close();
  assert.equal(title.hidden, false);
});

test("virtual conversations prefer the native thread transcript column", () => {
  const elements = new Map();
  function element(tag, className = "") {
    const node = {
      tag,
      tagName: tag.toUpperCase(),
      children: [],
      hidden: false,
      attributes: {},
      innerHTML: "",
      className,
      parentElement: null,
      appendChild(child) {
        child.parentElement = this;
        this.children.push(child);
        if (child.id) elements.set(child.id, child);
        return child;
      },
      setAttribute(key, value) {
        this.attributes[key] = value;
        if (key === "id") {
          this.id = value;
          elements.set(value, this);
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
      querySelectorAll(selector) {
        const matches = [];
        const visit = (child) => {
          if (selector === "div" && child.tagName === "DIV") matches.push(child);
          if (selector === ".thread-scroll-container" && String(child.className).includes("thread-scroll-container")) matches.push(child);
          for (const grandchild of child.children) visit(grandchild);
        };
        for (const child of this.children) visit(child);
        return matches;
      },
      querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
      },
      closest() {
        return null;
      },
      getBoundingClientRect() {
        return { width: 760, height: 620 };
      },
      addEventListener() {},
      removeEventListener() {},
    };
    return node;
  }
  const main = element("main");
  const scroll = element("div", "thread-scroll-container");
  const transcript = element("div", "mx-auto w-full max-w-(--thread-content-max-width) px-toolbar relative flex flex-1 shrink-0 flex-col pb-8");
  const composer = element("div", "relative z-10 flex flex-col mx-auto w-full max-w-(--thread-content-max-width) px-toolbar sticky");
  main.appendChild(scroll);
  scroll.appendChild(transcript);
  scroll.appendChild(composer);
  const window = {
    CodexPlus: { ui: {}, diagnostics: { log() {} } },
    history: { state: null, replaceState() {} },
    addEventListener() {},
  };
  const context = {
    window,
    globalThis: window,
    getComputedStyle() {
      return { display: "block", visibility: "visible" };
    },
    document: {
      body: element("body"),
      createElement: element,
      getElementById(id) {
        return elements.get(id) || null;
      },
      querySelector(selector) {
        if (selector === "main") return main;
        return main.querySelector(selector);
      },
      querySelectorAll(selector) {
        if (selector.includes(".thread-scroll-container")) return main.querySelectorAll(".thread-scroll-container");
        if (selector.includes("main")) return [main];
        return [];
      },
      addEventListener() {},
    },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../src/runtime/api/virtualConversations.js"), "utf8"),
    context,
    { filename: "api/virtualConversations.js" },
  );
  window.CodexPlus.ui.virtualConversations.registerProvider({
    id: "test",
    match: (route) => route === "virtual:test",
    render({ container }) {
      container.innerHTML = "virtual";
    },
  });

  const opened = window.CodexPlus.ui.virtualConversations.open("virtual:test");

  assert.equal(opened.ok, true);
  assert.ok(transcript.children.some((child) => child.id === "codex-plus-virtual-conversation-root"));
  assert.equal(composer.children.some((child) => child.id === "codex-plus-virtual-conversation-root"), false);
  assert.equal(main.children.some((child) => child.id === "codex-plus-virtual-conversation-root"), false);
});

test("sidebar sections mount in the native section list, not the outer sidebar shell", () => {
  const elements = [];
  function textNode(text) {
    return { nodeType: 3, textContent: text };
  }
  function element(tag, text = "") {
    const styleProps = {};
    const node = {
      tag,
      tagName: tag.toUpperCase(),
      children: [],
      childNodes: text ? [textNode(text)] : [],
      attributes: {},
      parentElement: null,
      textContent: text,
      className: "",
      style: {
        props: styleProps,
        setProperty(key, value) {
          styleProps[key] = value;
        },
        getPropertyValue(key) {
          return styleProps[key] || "";
        },
      },
      appendChild(child) {
        child.parentElement = this;
        this.children.push(child);
        this.childNodes.push(child);
        elements.push(child);
        return child;
      },
      insertBefore(child, before) {
        child.parentElement = this;
        const existingParent = child.parentElement;
        if (existingParent && existingParent !== this) {
          const existingIndex = existingParent.children.indexOf(child);
          if (existingIndex >= 0) existingParent.children.splice(existingIndex, 1);
        }
        const index = before ? this.children.indexOf(before) : -1;
        if (index >= 0) this.children.splice(index, 0, child);
        else this.children.push(child);
        if (!this.childNodes.includes(child)) this.childNodes.push(child);
        elements.push(child);
        return child;
      },
      setAttribute(key, value) {
        this.attributes[key] = value;
      },
      getAttribute(key) {
        return this.attributes[key] ?? null;
      },
      querySelectorAll(selector) {
        return queryAll(this, selector);
      },
      querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
      },
      addEventListener() {},
    };
    elements.push(node);
    return node;
  }
  function directText(node) {
    return (node.childNodes || [])
      .filter((child) => child.nodeType === 3)
      .map((child) => child.textContent || "")
      .join("")
      .trim();
  }
  function matches(node, selector) {
    if (selector === "[data-app-action-sidebar-section-heading]" && node.attributes["data-app-action-sidebar-section-heading"] != null) return true;
    if (["h1", "h2", "h3", "p", "div", "span", "aside"].includes(selector) && node.tagName === selector.toUpperCase()) return true;
    if (selector === "[data-app-action-sidebar]") return node.attributes["data-app-action-sidebar"] != null;
    if (selector === "[data-app-action-sidebar-project-row]") return node.attributes["data-app-action-sidebar-project-row"] != null;
    if (selector === "[data-app-action-sidebar-thread-row]") return node.attributes["data-app-action-sidebar-thread-row"] != null;
    return false;
  }
  function queryAll(root, selector) {
    const selectors = selector.split(",").map((part) => part.trim());
    const found = [];
    const visit = (node) => {
      if (selectors.some((candidate) => matches(node, candidate))) found.push(node);
      for (const child of node.children || []) visit(child);
    };
    visit(root);
    return found;
  }
  const body = element("body");
  const outer = element("aside");
  outer.setAttribute("data-app-action-sidebar", "");
  const injectedWrongColumn = element("div");
  const nativeList = element("div");
  const nav = element("div");
  const pinned = element("h2", "Pinned");
  const pinnedRow = element("div", "Fixture");
  const projects = element("h2", "Projects");
  const projectRow = element("div", "nested-suite");
  projectRow.setAttribute("data-app-action-sidebar-project-row", "");
  body.appendChild(outer);
  outer.appendChild(injectedWrongColumn);
  outer.appendChild(nativeList);
  nativeList.appendChild(nav);
  nativeList.appendChild(pinned);
  nativeList.appendChild(pinnedRow);
  nativeList.appendChild(projects);
  nativeList.appendChild(projectRow);
  const window = {
    CodexPlus: { ui: {} },
    __CodexPlusRuntime: {
      applyDecorators: (props) => props,
      mergeDataAttributes: (props) => props,
    },
    CSS: { escape: (value) => value },
  };
  const context = {
    window,
    globalThis: window,
    document: {
      body,
      documentElement: element("html"),
      createElement: (tag) => element(tag),
      querySelector(selector) {
        return queryAll(body, selector)[0] || null;
      },
      querySelectorAll(selector) {
        return queryAll(body, selector);
      },
    },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../src/runtime/api/sidebar.js"), "utf8"),
    context,
    { filename: "api/sidebar.js" },
  );

  const result = window.CodexPlus.ui.sidebar.renderSection({
    id: "test",
    title: "Harness Runs",
    rows: [{
      id: "row",
      label: "aharness-examples",
      style: { "--codex-plus-project-accent": "rgb(123, 45, 67)" },
      children: [{ id: "child", label: "Color funnel", kind: "fsm" }],
    }],
  });

  assert.equal(result.ok, true);
  assert.equal(result.section.parentElement, nativeList);
  assert.deepEqual(nativeList.children.map((child) => directText(child) || child.attributes["data-codex-plus-sidebar-section"]), [
    undefined,
    "Pinned",
    "Fixture",
    "test",
    "Projects",
    "nested-suite",
  ]);
  assert.equal(outer.children[0], injectedWrongColumn);
  const childList = elements.find((node) => node.className === "cpx-sidebar-model-children");
  assert.equal(childList?.style.getPropertyValue("--codex-plus-project-accent"), "rgb(123, 45, 67)");
});

test("sidebar sections do not mount into settings pages without the native sidebar host", () => {
  const elements = [];
  function element(tag, text = "") {
    const node = {
      tag,
      tagName: tag.toUpperCase(),
      children: [],
      childNodes: text ? [{ nodeType: 3, textContent: text }] : [],
      attributes: {},
      parentElement: null,
      textContent: text,
      className: "",
      style: { setProperty() {}, getPropertyValue() { return ""; } },
      appendChild(child) {
        child.parentElement = this;
        this.children.push(child);
        return child;
      },
      insertBefore(child, before) {
        child.parentElement = this;
        const index = before ? this.children.indexOf(before) : -1;
        if (index >= 0) this.children.splice(index, 0, child);
        else this.children.push(child);
        return child;
      },
      setAttribute(key, value) {
        this.attributes[key] = value;
      },
      getAttribute(key) {
        return this.attributes[key] ?? null;
      },
      querySelectorAll(selector) {
        return queryAll(this, selector);
      },
      querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
      },
      addEventListener() {},
      remove() {
        if (!this.parentElement) return;
        const index = this.parentElement.children.indexOf(this);
        if (index >= 0) this.parentElement.children.splice(index, 1);
        this.parentElement = null;
      },
    };
    elements.push(node);
    return node;
  }
  function matches(node, selector) {
    if (selector === "[data-app-action-sidebar-section-heading]") return node.attributes["data-app-action-sidebar-section-heading"] != null;
    if (["h1", "h2", "h3", "p", "div", "span", "aside"].includes(selector)) return node.tagName === selector.toUpperCase();
    if (selector === "[data-app-action-sidebar]") return node.attributes["data-app-action-sidebar"] != null;
    if (selector === "[data-app-action-sidebar-scroll]") return node.attributes["data-app-action-sidebar-scroll"] != null;
    if (selector === "[data-app-action-sidebar-project-row]") return node.attributes["data-app-action-sidebar-project-row"] != null;
    if (selector === "[data-app-action-sidebar-thread-row]") return node.attributes["data-app-action-sidebar-thread-row"] != null;
    if (selector === '[data-codex-plus-sidebar-section="test"]') return node.attributes["data-codex-plus-sidebar-section"] === "test";
    if (selector === "[class*='sidebar']" || selector === "[data-testid*='sidebar']") return false;
    return false;
  }
  function queryAll(root, selector) {
    const selectors = selector.split(",").map((part) => part.trim());
    const found = [];
    const visit = (node) => {
      if (selectors.some((candidate) => matches(node, candidate))) found.push(node);
      for (const child of node.children || []) visit(child);
    };
    visit(root);
    return found;
  }
  const body = element("body");
  const settings = element("main");
  const staleHarness = element("section", "Harness Runs");
  staleHarness.setAttribute("data-codex-plus-sidebar-section", "test");
  body.appendChild(settings);
  body.appendChild(staleHarness);
  settings.appendChild(element("h1", "General"));
  settings.appendChild(element("button", "Appearance"));
  settings.appendChild(element("button", "Worktrees"));
  const window = {
    CodexPlus: { ui: {} },
    __CodexPlusRuntime: {
      applyDecorators: (props) => props,
      mergeDataAttributes: (props) => props,
    },
    CSS: { escape: (value) => value },
  };
  const context = {
    window,
    globalThis: window,
    document: {
      body,
      documentElement: element("html"),
      createElement: (tag) => element(tag),
      querySelector(selector) {
        return queryAll(body, selector)[0] || null;
      },
      querySelectorAll(selector) {
        return queryAll(body, selector);
      },
    },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../src/runtime/api/sidebar.js"), "utf8"),
    context,
    { filename: "api/sidebar.js" },
  );

  const result = window.CodexPlus.ui.sidebar.renderSection({
    id: "test",
    title: "Harness Runs",
    rows: [{ id: "row", label: "aharness-examples" }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "sidebar-host-not-found");
  assert.equal(staleHarness.parentElement, null);
  assert.equal(body.children.includes(staleHarness), false);
});

test("aharness plugin stays idle in settings initialRoute windows", async () => {
  const nativeRequests = [];
  const timers = [];
  const plugins = [];
  const window = {
    location: { href: "app://-/index.html?initialRoute=%2Fsettings%2Fgeneral-settings", search: "?initialRoute=%2Fsettings%2Fgeneral-settings", hash: "" },
    history: { state: null, replaceState() {} },
    localStorage: { getItem() { return null; }, setItem() {} },
    setInterval(callback, delay) {
      timers.push({ callback, delay });
      return timers.length;
    },
    clearInterval() {},
    CodexPlus: {
      native: {
        request(method, params) {
          nativeRequests.push({ method, params });
          return Promise.resolve(undefined);
        },
      },
      ui: {
        virtualConversations: {
          registerProvider() {},
          subscribe() { return () => {}; },
          activeRouteId() { return ""; },
        },
        sidebar: {
          registerSection() {},
        },
        projectContext: {
          active() { return null; },
        },
      },
      nativeMenus: {
        registerItem() {},
      },
      commands: {
        all() { return []; },
      },
      registerPlugin(plugin) {
        plugins.push(plugin);
        plugin.start?.(this);
      },
      definePlugin(plugin) {
        return plugin;
      },
    },
  };
  const context = {
    window,
    globalThis: window,
    document: {
      body: {
        setAttribute() {},
        removeAttribute() {},
        querySelector() { return null; },
        querySelectorAll() { return []; },
      },
      head: { appendChild() {} },
      createElement() {
        return { setAttribute() {}, appendChild() {}, style: {} };
      },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      addEventListener() {},
      documentElement: { style: { setProperty() {}, removeProperty() {} } },
    },
    URLSearchParams,
    Node: { ELEMENT_NODE: 1 },
  };

  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../src/runtime/plugins/aharnessRuns.js"), "utf8"),
    context,
    { filename: "plugins/aharnessRuns.js" },
  );
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(plugins.length, 1);
  assert.deepEqual(nativeRequests, []);
  assert.deepEqual(timers, []);
});

test("aharness artifact UI uses thread side panel API instead of a plugin-owned fixed body overlay", () => {
  const sidePanelApi = fs.readFileSync(path.join(__dirname, "../src/runtime/api/sidePanel.js"), "utf8");
  const threadSidePanelApi = fs.readFileSync(path.join(__dirname, "../src/runtime/api/threadSidePanel.js"), "utf8");
  const plugin = fs.readFileSync(path.join(__dirname, "../src/runtime/plugins/aharnessRuns.js"), "utf8");

  assert.doesNotMatch(sidePanelApi, /document\.body\.appendChild/);
  assert.doesNotMatch(plugin, /codex-plus-side-panel-root/);
  assert.doesNotMatch(plugin, /position:fixed;top:0;right:0;bottom:0/);
  assert.doesNotMatch(threadSidePanelApi, /position:fixed/);
  assert.doesNotMatch(threadSidePanelApi, /document\.body\.appendChild/);
  assert.doesNotMatch(threadSidePanelApi, /codex-plus-thread-file-fallback-root/);
  assert.doesNotMatch(threadSidePanelApi, /openFallbackFilePanel/);
  assert.doesNotMatch(threadSidePanelApi, /data-codex-plus-thread-file-panel/);
  assert.doesNotMatch(threadSidePanelApi, /cpx-thread-file-panel/);
  assert.match(threadSidePanelApi, /registerTabProvider/);
  assert.match(plugin, /CodexPlusHost\.adapters\.threadSidePanel\.openFile/);
  assert.doesNotMatch(plugin, /CodexPlus\.ui\.threadSidePanel/);
  assert.match(threadSidePanelApi, /hostAdapter\(\)\.openFile\(filePath, options\)/);
  assert.doesNotMatch(threadSidePanelApi, /nativeFileOpener|waitForNativeFileOpener|dispatchNativeFilesLauncher/);
  assert.match(threadSidePanelApi, /workspaceRoot: cwd \|\| undefined/);
  assert.match(threadSidePanelApi, /resetTabState: file\.resetTabState !== false/);
  assert.doesNotMatch(threadSidePanelApi, /file:local:\$\{filePath\}/);
  assert.doesNotMatch(plugin, /data-codex-plus-aharness-artifact-content/);
  assert.doesNotMatch(plugin, /cpx-ah-artifact-panel/);
  assert.doesNotMatch(plugin, /data-codex-plus-thread-side-panel-root/);
});

test("project context marks active project without hiding native tabs", () => {
  function element(tag) {
    const node = {
      tagName: tag.toUpperCase(),
      children: [],
      parentElement: null,
      attributes: {},
      hidden: false,
      style: { display: "" },
      appendChild(child) {
        child.parentElement = this;
        this.children.push(child);
        return child;
      },
      setAttribute(key, value) {
        this.attributes[key] = String(value);
      },
      getAttribute(key) {
        return this.attributes[key] ?? null;
      },
      removeAttribute(key) {
        delete this.attributes[key];
      },
      hasAttribute(key) {
        return this.attributes[key] != null;
      },
      querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
      },
      querySelectorAll(selector) {
        const matches = [];
        const visit = (child) => {
          if (selector === "[data-tab-id]" && child.attributes["data-tab-id"] != null) matches.push(child);
          if (selector === "[role='tab']" && child.attributes.role === "tab") matches.push(child);
          for (const grandchild of child.children) visit(grandchild);
        };
        for (const child of this.children) visit(child);
        return matches;
      },
    };
    return node;
  }
  const body = element("body");
  const main = element("main");
  const shell = element("div");
  shell.setAttribute("data-app-shell-tabs", "true");
  const nestedWrapper = element("div");
  nestedWrapper.setAttribute("data-tab-id", "file:local:/tmp/nested-suite-worktree/README.md");
  const nestedTab = element("button");
  nestedTab.setAttribute("role", "tab");
  nestedTab.setAttribute("aria-selected", "true");
  nestedWrapper.appendChild(nestedTab);
  shell.appendChild(nestedWrapper);
  body.appendChild(main);
  body.appendChild(shell);

  const context = {
    window: {},
    globalThis: {},
    document: {
      body,
      querySelector(selector) {
        if (selector === "main") return main;
        if (selector === "[data-app-shell-tabs]") return shell;
        return null;
      },
    },
  };
  context.window = context.globalThis;
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../src/runtime/api/index.js"), "utf8"),
    context,
    { filename: "api/index.js" },
  );
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../src/runtime/api/routeContext.js"), "utf8"),
    context,
    { filename: "api/routeContext.js" },
  );

  context.window.CodexPlus.ui.projectContext.set({
    cwd: "/tmp/aharness-examples",
    label: "aharness-examples",
    source: "aharness",
  });

  assert.equal(body.getAttribute("data-codex-plus-active-project-path"), "/tmp/aharness-examples");
  assert.equal(shell.getAttribute("data-codex-plus-active-project-path"), "/tmp/aharness-examples");
  assert.equal(nestedWrapper.hidden, false);
  assert.equal(nestedWrapper.style.display, "");
  assert.equal(nestedTab.getAttribute("aria-selected"), "true");

  context.window.CodexPlus.ui.projectContext.clear();

  assert.equal(nestedWrapper.hidden, false);
  assert.equal(nestedWrapper.style.display, "");
  assert.equal(nestedTab.getAttribute("aria-selected"), "true");
});

test("aharness plugin shortens run rows and keeps full target out of sidebar labels", () => {
  const plugin = fs.readFileSync(path.join(__dirname, "../src/runtime/plugins/aharnessRuns.js"), "utf8");

  assert.match(plugin, /function shortRunId\(runId\)/);
  assert.match(plugin, /const last = parts\[parts\.length - 1\]/);
  assert.match(plugin, /function runRows\(runs, project\)/);
  assert.match(plugin, /label: shortRunId\(run\.runId\)/);
  assert.doesNotMatch(plugin, /<span>\$\{escapeHtml\(run\.target \|\| run\.runId\)\}<\/span>/);
  assert.match(plugin, /function runIsWaiting\(run\)/);
  assert.match(plugin, /run\?\.currentState\?\.open === true/);
  assert.match(plugin, /run\?\.pending \|\| \[\]/);
  assert.match(plugin, /cpx-sidebar-status-spinner/);
  assert.match(plugin, /cpx-sidebar-status-waiting/);
  assert.match(plugin, /data-codex-plus-aharness-run-waiting/);
  assert.match(plugin, /data-codex-plus-aharness-run-running/);
  assert.match(plugin, /status: terminalStatuses\.has\(run\.status\) \? run\.status : waiting \? "waiting" : "running"/);
  assert.match(plugin, /const projectFoldState = new Map\(\)/);
  assert.match(plugin, /CodexPlus\.ui\.sidebar\.renderSection/);
  assert.match(plugin, /afterSectionTitle: "Pinned"/);
  assert.match(plugin, /projectFoldState\.set\(row\.id, !row\.collapsed\)/);
  assert.match(plugin, /function projectRowModelColor\(project\)/);
  assert.match(plugin, /styleName !== "borderLeft"/);
  assert.match(plugin, /"border-left": "6px solid var\(--codex-plus-project-accent,currentColor\)"/);
  assert.match(plugin, /\.cpx-sidebar-model-row-project\{[^}]*border-left:6px solid var\(--codex-plus-project-accent,currentColor\)/);
  assert.match(plugin, /\.cpx-sidebar-model-row-project\+\.cpx-sidebar-model-children\{[^}]*border-left:6px solid var\(--codex-plus-project-accent,currentColor\)/);
  assert.match(plugin, /html\[data-codex-plus-sidebar-names-blurred=\\"true\\"\] #codex-plus-aharness-sidebar \.cpx-sidebar-model-row-project,html\[data-codex-plus-sidebar-names-blurred=\\"true\\"\] #codex-plus-aharness-sidebar \.cpx-sidebar-model-row-fsm,html\[data-codex-plus-sidebar-names-blurred=\\"true\\"\] #codex-plus-aharness-sidebar \.cpx-sidebar-model-row-run\{filter:blur\(4px\)/);
  assert.match(plugin, /data-codex-plus-aharness-run-active/);
  assert.match(plugin, /data-app-action-sidebar-thread-active/);
  assert.match(plugin, /routeUnsubscribe = api\.ui\.virtualConversations\.subscribe\(renderSidebar\)/);
  assert.match(plugin, /function appInitialRoute\(\)/);
  assert.match(plugin, /function shouldRestoreHashRoute\(\)/);
  assert.match(plugin, /if \(hashRoute && shouldRestoreHashRoute\(\)\) CodexPlus\.ui\.virtualConversations\.open\?\.\(hashRoute\)/);
  assert.match(plugin, /createAction: \{ label: "Create aharness run"/);
  assert.match(plugin, /\.cpx-sidebar-model-create\{[^}]*border:0;background:transparent/);
  assert.doesNotMatch(plugin, />Create<\/button>/);
  assert.match(plugin, /data-codex-plus-aharness-fsm-row/);
  assert.match(plugin, /\.cpx-sidebar-model-row-fsm>\.cpx-sidebar-model-main\{align-items:flex-start/);
  assert.match(plugin, /\.cpx-sidebar-model-row-fsm>\.cpx-sidebar-model-main>\.cpx-sidebar-model-bullet\{margin-top:\.58em/);
  assert.doesNotMatch(plugin, /\.cpx-sidebar-model-row-fsm \.cpx-sidebar-model-text small\{margin-left:13px\}/);
  assert.match(plugin, /\.cpx-sidebar-model-row-run \.cpx-sidebar-model-bullet\{display:none\}/);
  assert.match(plugin, /\.cpx-sidebar-model-row-run \.cpx-sidebar-model-main\{[^}]*border-left:0!important;box-shadow:none!important/);
  assert.match(plugin, /\.cpx-sidebar-model-row-run\[data-codex-plus-aharness-run-active=\\"true\\"\]\{[^}]*border-radius:0!important/);
  assert.match(plugin, /box-shadow:inset 6px 0 0 var\(--codex-plus-project-accent,currentColor\)!important/);
  assert.match(plugin, /#codex-plus-aharness-sidebar \.cpx-sidebar-model-row-run\[data-codex-plus-aharness-run-active=\\"true\\"\] \.cpx-sidebar-model-main\{padding-left:18px\}/);
  assert.match(plugin, /#codex-plus-virtual-conversation-root\{[^}]*z-index:0/);
  assert.match(plugin, /data-codex-plus-virtual-route\^=\\"cpx-aharness-run:/);
  assert.match(plugin, /data-codex-plus-user-entry.*data-codex-plus-composer-claimed/);
  assert.match(plugin, /function updateComposerBounds\(container\)/);
  assert.match(plugin, /--codex-plus-aharness-chat-left/);
  assert.match(plugin, /--codex-plus-aharness-chat-width/);
  assert.match(plugin, /--codex-plus-aharness-composer-left/);
  assert.match(plugin, /--codex-plus-aharness-composer-width/);
  assert.match(plugin, /composer\?\.offsetParent\?\.getBoundingClientRect/);
  assert.match(plugin, /const gutter = rect\.width >= 420 \? 24 : rect\.width >= 320 \? 16 : 8/);
  assert.match(plugin, /rect\.width - gutter \* 2/);
  assert.match(plugin, /new ResizeObserver\(\(\) => updateComposerBounds\(container\)\)/);
  assert.match(plugin, /body\[data-codex-plus-composer-claimed\] \[data-codex-plus-user-entry\]\[data-codex-plus-composer-claimed\]\{[^}]*position:fixed/);
  assert.match(plugin, /left:var\(--codex-plus-aharness-composer-left,var\(--codex-plus-virtual-main-left,0px\)\)!important/);
  assert.match(plugin, /width:var\(--codex-plus-aharness-composer-width/);
  assert.match(plugin, /bottom:8px!important/);
  assert.doesNotMatch(plugin, /bottom:calc\(var\(--codex-plus-virtual-main-bottom/);
  assert.match(plugin, /data-codex-plus-composer-claimed\] #codex-plus-virtual-conversation-root \.cpx-ah-chat-scroll\{padding-bottom:190px/);
  assert.match(plugin, /data-codex-plus-composer-claimed\] #codex-plus-virtual-conversation-root \.cpx-ah-action-dock\{padding-bottom:180px/);
  assert.match(plugin, /data-codex-plus-composer-claimed\] \[data-placeholder\]::after\{content:var\(--codex-plus-composer-placeholder\)!important/);
  assert.match(plugin, /\[data-codex-plus-composer-stop-control\] svg\{display:none!important\}/);
  assert.match(plugin, /\[data-codex-plus-composer-stop-control\]::before\{content:\\"\\";display:block;width:10px;height:10px/);
  assert.match(plugin, /#codex-plus-virtual-conversation-root\{[^}]*background:transparent/);
  assert.match(plugin, /\.cpx-ah-chat\{[^}]*background:transparent;font:14px\/1\.5 system-ui,sans-serif/);
  assert.match(plugin, /\.cpx-ah-chat-scroll\{[^}]*scrollbar-width:thin/);
  assert.match(plugin, /\.cpx-ah-chat-scroll::-webkit-scrollbar\{width:8px/);
  assert.match(plugin, /\.cpx-ah-chat-header\{[^}]*background:transparent/);
  assert.match(plugin, /\.cpx-ah-action-dock\{[^}]*background:transparent/);
  assert.doesNotMatch(plugin, /#0f0f0f/);
  assert.match(plugin, /function runTitle\(run\)/);
  assert.match(plugin, /function runStateLabel\(run\)/);
  assert.match(plugin, /run\?\.currentState\?\.path \|\| \(run\?\.pending \|\| \[\]\)\.find\(\(card\) => card\?\.state\)\?\.state \|\| "pending"/);
  assert.match(plugin, /data-codex-plus-aharness-header-state>State: \$\{escapeHtml\(runStateLabel\(run\)\)\}/);
  assert.doesNotMatch(plugin, /cpx-ah-state-line/);
  assert.match(plugin, /function hasSelectionInAharnessRoute\(\)/);
  assert.match(plugin, /selectionRefreshPending = true/);
  assert.match(plugin, /installSelectionRefreshListener\(\)/);
  assert.match(plugin, /selectionchange/);
  assert.match(plugin, /closest\?\.\("\[data-codex-plus-aharness-route\]"\)/);
  assert.match(plugin, /function renderMarkdown\(value\)/);
  assert.match(plugin, /function renderInlineMarkdown\(value\)/);
  assert.match(plugin, /function appendToolGroup\(parent, rows, run\)/);
  assert.match(plugin, /function appendToolCommand\(parent, row, run, groupKey\)/);
  assert.match(plugin, /function appendRows\(parent, rows, run\)/);
  assert.match(plugin, /function toolGroupKey\(run, rows\)/);
  assert.match(plugin, /function captureScrollAnchor\(scroller\)/);
  assert.match(plugin, /function restoreScrollAnchor\(scroller, anchor\)/);
  assert.match(plugin, /data-codex-plus-aharness-anchor/);
  assert.match(plugin, /anchor: captureScrollAnchor\(previousScroller\)/);
  assert.match(plugin, /restoreScrollAnchor\(scroller, state\.anchor\)/);
  assert.match(plugin, /const toolOutputState = new Map\(\)/);
  assert.match(plugin, /const fileEditState = new Map\(\)/);
  assert.match(plugin, /data-codex-plus-aharness-tool-group/);
  assert.match(plugin, /data-codex-plus-aharness-tool-command/);
  assert.match(plugin, /data-codex-plus-aharness-transient/);
  assert.match(plugin, /toolOutputState\.set\(key, details\.open\)/);
  assert.match(plugin, /toolOutputState\.set\(groupKey, group\.open\)/);
  assert.match(plugin, /const running = rows\.find\(isRunningTool\)/);
  assert.match(plugin, /if \(running\) return `Running command\$\{rows\.length === 1 \? "" : "s"\}`/);
  assert.match(plugin, /Ran \$\{rows\.length\} command/);
  assert.match(plugin, /Running command/);
  assert.match(plugin, /function toolElapsed\(row\)/);
  assert.match(plugin, /Date\.now\(\) - parsed/);
  assert.match(plugin, /running \? toolSummary\(rows\) : "Commands"/);
  assert.match(plugin, /cpx-ah-tool-group-running/);
  assert.match(plugin, /cpx-ah-tool-command-running/);
  assert.match(plugin, /\.cpx-ah-tool-group-running>summary span,\.cpx-ah-tool-command-running>summary small,\.cpx-ah-row-reasoning\[data-codex-plus-aharness-transient\] \.cpx-ah-row-body\{[^}]*animation:cpx-ah-shimmer/);
  assert.doesNotMatch(plugin, /\.cpx-ah-tool-group-running>summary strong\{[^}]*animation:cpx-ah-shimmer/);
  assert.match(plugin, /slice\(-5\)\.join\("\\n"\)/);
  assert.match(plugin, /No output captured\./);
  assert.match(plugin, /function configureComposerForRun\(run\)/);
  assert.match(plugin, /const composerModeOverride = new Map\(\)/);
  assert.match(plugin, /composerModeOverride\.set\(run\.runId,\s*\{\s*mode: "waiting"/);
  assert.match(plugin, /latestEventId: run\.latestEventId \|\| ""/);
  assert.match(plugin, /override\.latestEventId && run\.latestEventId && override\.latestEventId !== run\.latestEventId/);
  assert.match(plugin, /configureComposerForRun\(run\);\s*await reply\(run\.runId, \{ kind: "text", text \}\)/);
  assert.match(plugin, /composerModeOverride\.delete\(run\.runId\)/);
  assert.match(plugin, /forcedMode \|\| \(active && run\.currentState\?\.open === true \? "input" : active \? "waiting" : ""\)/);
  assert.match(plugin, /CodexPlus\.ui\.composer\?\.claimControl/);
  assert.match(plugin, /kind: "text", text/);
  assert.match(plugin, /await cancelRun\(run\.runId\)/);
  assert.doesNotMatch(plugin, /Cancel run/);
  assert.doesNotMatch(plugin, /data-ah-cancel/);
  assert.doesNotMatch(plugin, /window\.prompt\("Answer aharness prompt"/);
  assert.match(plugin, /function releaseComposer\(\)/);
  assert.match(plugin, /function toolOutputPreview\(row\)/);
  assert.match(plugin, /events\.jsonl output hidden from transcript preview/);
  assert.match(plugin, /\.cpx-ah-tool-command:not\(\[open\]\) pre\{display:none\}/);
  assert.match(plugin, /@keyframes cpx-ah-shimmer/);
  assert.match(plugin, /row\.kind === "tool"/);
  assert.match(plugin, /function isFileChangeRow\(row, run\)/);
  assert.match(plugin, /function looksLikeFilePath\(value\)/);
  assert.match(plugin, /\\sfiles\?\$\/i\.test\(text\)/);
  assert.match(plugin, /function fileChangeInfos\(row, run\)/);
  assert.match(plugin, /Array\.isArray\(data\.changes\)/);
  assert.match(plugin, /Array\.isArray\(data\.changedFiles\)/);
  assert.match(plugin, /Array\.isArray\(row\?\.changes\)/);
  assert.match(plugin, /function dedupeFileChangeInfos\(rows, run\)/);
  assert.match(plugin, /const key = `\$\{info\.action\}:\$\{info\.relativePath\}:\$\{info\.stats\}`/);
  assert.match(plugin, /function appendFileEditGroup\(parent, rows, run\)/);
  assert.match(plugin, /function projectRelativePath\(filePath, run\)/);
  assert.match(plugin, /function openRunFile\(run, filePath\)/);
  assert.match(plugin, /CodexPlusHost\.adapters\.threadSidePanel\.openFile\(absolutePath/);
  assert.match(plugin, /data-codex-plus-aharness-file-group/);
  assert.match(plugin, /data-codex-plus-aharness-file-open/);
  assert.match(plugin, /fileEditState\.set\(groupKey, group\.open\)/);
  assert.match(plugin, /appendFileEditGroup\(parent, files, run\)/);
  assert.match(plugin, /Edited \$\{unique\.length\} files: \$\{names\}/);
  assert.match(plugin, /appendToolGroup\(parent, tools, run\)/);
  assert.match(plugin, /renderMarkdown\(rowLabel\(row\)\)/);
  assert.match(plugin, /function popoutIconSvg\(\)/);
  assert.match(plugin, /#codex-plus-aharness-sidebar h2\{margin:0 0 8px 8px;font-size:14px;line-height:20px;font-weight:400/);
  assert.match(plugin, /\.cpx-sidebar-model-chevron\{[^}]*opacity:0/);
  assert.match(plugin, /#codex-plus-aharness-sidebar \.cpx-sidebar-model-row-project:hover>\.cpx-sidebar-model-main \.cpx-sidebar-model-chevron/);
  assert.match(plugin, /class="cpx-ah-artifact-popout"/);
  assert.match(plugin, /data-codex-plus-aharness-artifact-open aria-label="Open artifact/);
  assert.match(plugin, /\.cpx-ah-row-state_prompt\{[^}]*width:77%/);
  assert.match(plugin, /\.cpx-ah-row-state_prompt\{[^}]*margin:8px auto 14px 0/);
  assert.match(plugin, /\.cpx-ah-row-state_prompt\{[^}]*background:color-mix\(in srgb,var\(--codex-plus-user-bubble-dark-bg,var\(--codex-plus-user-bubble-light-bg,currentColor\)\) 26%,transparent\)/);
  assert.match(plugin, /\.cpx-ah-row-state_prompt span\{[^}]*opacity:\.68/);
  assert.doesNotMatch(plugin, /data-codex-plus-aharness-artifact-open>Open<\/button>/);
});

test("composer API can claim native composer control", async () => {
  const submitted = [];
  const stopped = [];
  const editable = {
    innerText: "please revise the plan",
    textContent: "please revise the plan",
    innerHTML: "please revise the plan",
    dispatchEvent() {},
  };
  const primaryButton = {
    attributes: { type: "submit" },
    dataset: {},
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    getAttribute(name) {
      return this.attributes[name] ?? null;
    },
    toggleAttribute(name, value) {
      if (value) this.attributes[name] = "";
      else delete this.attributes[name];
    },
    closest(selector) {
      if (selector === "[data-codex-plus-user-entry]") return form;
      return selector === "button" ? this : null;
    },
  };
  const form = {
    attributes: {},
    dataset: {},
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    removeAttribute(name) {
      delete this.attributes[name];
    },
    toggleAttribute(name, value) {
      if (value) this.attributes[name] = "";
      else delete this.attributes[name];
    },
    querySelector(selector) {
      if (selector.includes("button")) return primaryButton;
      if (selector.includes("contenteditable") || selector.includes("ProseMirror")) return editable;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "button") return [primaryButton];
      return [];
    },
    closest(selector) {
      return selector === "[data-codex-plus-user-entry]" ? this : null;
    },
  };
  let submitListener = null;
  const pointerListeners = {};
  const body = {
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    removeAttribute(name) {
      delete this.attributes[name];
    },
    toggleAttribute(name, value) {
      if (value) this.attributes[name] = "";
      else delete this.attributes[name];
    },
  };
  const window = {
    __CodexPlusRuntime: {
      applyDecorators() {
        return undefined;
      },
      mergeDataAttributes(base, extra) {
        return { ...(base || {}), ...(extra || {}) };
      },
    },
    CodexPlus: { ui: {} },
    CodexPlusHost: { adapters: {} },
    Event: class {
      constructor(type) {
        this.type = type;
      }
    },
  };
  const context = {
    window,
    globalThis: window,
    document: {
      body,
      addEventListener(type, listener) {
        if (type === "submit") submitListener = listener;
        if (type === "pointerdown" || type === "mousedown" || type === "click") pointerListeners[type] = listener;
      },
      querySelectorAll(selector) {
        return selector === "[data-codex-plus-user-entry]" ? [form] : [];
      },
    },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../src/runtime/api/composer.js"), "utf8"),
    context,
    { filename: "api/composer.js" },
  );
  const releaseWaiting = window.CodexPlus.ui.composer.claimControl({
    mode: "waiting",
    placeholder: "Aharness is working...",
    stopLabel: "Stop aharness run",
    onStop: () => stopped.push("stop"),
  });
  const props = window.CodexPlus.ui.composer.surfaceProps({});
  const stopEvent = {
    target: primaryButton,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
    stopPropagation() {
      this.stopped = true;
    },
    stopImmediatePropagation() {
      this.immediateStopped = true;
    },
  };
  await pointerListeners.pointerdown(stopEvent);

  assert.deepEqual(stopped, ["stop"]);
  assert.equal(stopEvent.prevented, true);
  assert.equal(form.attributes["data-codex-plus-composer-mode"], "waiting");
  assert.equal(body.attributes["data-codex-plus-composer-mode"], "waiting");
  assert.equal(primaryButton.attributes["data-codex-plus-composer-stop-control"], "");
  assert.equal(primaryButton.attributes["aria-label"], "Stop aharness run");
  releaseWaiting();
  assert.equal(Object.prototype.hasOwnProperty.call(primaryButton.attributes, "data-codex-plus-composer-stop-control"), false);

  const releaseInput = window.CodexPlus.ui.composer.claimControl({
    mode: "input",
    placeholder: "Reply to aharness...",
    onSubmit: ({ text }) => submitted.push(text),
  });
  assert.equal(Object.prototype.hasOwnProperty.call(primaryButton.attributes, "data-codex-plus-composer-stop-control"), false);
  assert.equal(primaryButton.attributes["aria-label"], "");
  const event = {
    target: form,
    prevented: false,
    stopped: false,
    preventDefault() {
      this.prevented = true;
    },
    stopPropagation() {
      this.stopped = true;
    },
    stopImmediatePropagation() {
      this.immediateStopped = true;
    },
  };

  await submitListener(event);

  assert.deepEqual(submitted, ["please revise the plan"]);
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
  assert.equal(event.immediateStopped, true);
  assert.equal(editable.innerHTML, "");
  editable.innerText = "second revision";
  editable.textContent = "second revision";
  editable.innerHTML = "second revision";
  const pointerSubmitEvent = {
    target: primaryButton,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
    stopPropagation() {
      this.stopped = true;
    },
    stopImmediatePropagation() {
      this.immediateStopped = true;
    },
  };
  await pointerListeners.pointerdown(pointerSubmitEvent);
  assert.deepEqual(submitted, ["please revise the plan", "second revision"]);
  assert.equal(pointerSubmitEvent.prevented, true);
  assert.equal(pointerSubmitEvent.immediateStopped, true);
  assert.equal(Object.prototype.hasOwnProperty.call(props, "data-codex-plus-composer-claimed"), true);
  assert.equal(Object.prototype.hasOwnProperty.call(body.attributes, "data-codex-plus-composer-claimed"), true);
  assert.equal(window.CodexPlus.ui.composer.surfaceProps({})["data-codex-plus-composer-mode"], "input");

  let releasePostSubmitWaiting = null;
  window.CodexPlus.ui.composer.claimControl({
    mode: "input",
    placeholder: "Reply to aharness...",
    onSubmit: ({ text }) => {
      submitted.push(text);
      releasePostSubmitWaiting = window.CodexPlus.ui.composer.claimControl({
        mode: "waiting",
        placeholder: "Aharness is working...",
        onStop: () => stopped.push("post-submit-stop"),
      });
    },
  });
  editable.innerText = "third revision";
  editable.textContent = "third revision";
  editable.innerHTML = "third revision";
  const submitThenClickEvent = {
    target: primaryButton,
    preventDefault() {},
    stopPropagation() {},
    stopImmediatePropagation() {},
  };
  await pointerListeners.pointerdown(submitThenClickEvent);
  await pointerListeners.click(submitThenClickEvent);
  assert.deepEqual(submitted, ["please revise the plan", "second revision", "third revision"]);
  assert.deepEqual(stopped, ["stop"]);
  assert.equal(window.CodexPlus.ui.composer.surfaceProps({})["data-codex-plus-composer-mode"], "waiting");
  releasePostSubmitWaiting?.();
  releaseInput();
  assert.equal(Object.prototype.hasOwnProperty.call(window.CodexPlus.ui.composer.surfaceProps({}), "data-codex-plus-composer-claimed"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(body.attributes, "data-codex-plus-composer-claimed"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(body.attributes, "data-codex-plus-composer-mode"), false);
});
