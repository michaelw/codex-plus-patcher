const assert = require("node:assert/strict");
const test = require("node:test");

const { parsePlusToml, unquoteTomlValue } = require("../src/plus/repositories");

test("parsePlusToml reads configured repositories", () => {
  const parsed = parsePlusToml(`
[[repositories]]
path = "repos/example"
label = "Example"

[[repositories]]
path = 'vendor/other'
`);

  assert.equal(parsed.tableCount, 2);
  assert.deepEqual(parsed.repositories, [
    { path: "repos/example", label: "Example" },
    { path: "vendor/other", label: undefined },
  ]);
  assert.deepEqual(parsed.ignoredLines, []);
});

test("parsePlusToml reads aharness state machines", () => {
  const parsed = parsePlusToml(`
[[aharness.state_machines]]
label = "Await checkpoints"
target = "await-checkpoints"
description = "Demo workflow"

[[aharness.state_machines]]
target = "./flows/release.fsm.ts"
`);

  assert.equal(parsed.tables.aharnessStateMachines, 2);
  assert.deepEqual(parsed.aharnessStateMachines, [
    { label: "Await checkpoints", target: "await-checkpoints", description: "Demo workflow" },
    { label: "./flows/release.fsm.ts", target: "./flows/release.fsm.ts", description: undefined },
  ]);
});

test("parsePlusToml ignores tables without a path and records unsupported lines", () => {
  const parsed = parsePlusToml(`
title = "ignored"
[[repositories]]
label = "No path"
`);

  assert.equal(parsed.tableCount, 1);
  assert.deepEqual(parsed.repositories, []);
  assert.deepEqual(parsed.ignoredLines, [{ line: 2, text: 'title = "ignored"' }]);
});

test("unquoteTomlValue handles simple quoted strings", () => {
  assert.equal(unquoteTomlValue('"repos/example"'), "repos/example");
  assert.equal(unquoteTomlValue("'repos/example'"), "repos/example");
  assert.equal(unquoteTomlValue("repos/example"), "repos/example");
});
