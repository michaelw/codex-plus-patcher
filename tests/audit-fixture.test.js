const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildAuditFixture,
  classifyDiscoveredHomeFiles,
} = require("../src/core/audit-fixture");

function withTempDir(fn) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-plus-audit-fixture-"));
  try {
    return fn(tmpDir);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function sqliteValue(dbPath, sql) {
  return childProcess.execFileSync("sqlite3", [dbPath, sql], { encoding: "utf8" }).trim();
}

test("audit fixture builds synthetic Codex home without reading user home paths", () => {
  withTempDir((tmpDir) => {
    const devHome = path.join(tmpDir, "codex-home");
    const electronUserDataPath = path.join(tmpDir, "electron-user-data");
    const fixture = buildAuditFixture({ devHome, electronUserDataPath, rootDir: tmpDir });

    assert.equal(fixture.mode, "fixture");
    assert.equal(fixture.devHome, devHome);
    assert.deepEqual(fixture.browserState.userBubbleColors, {
      light: "#e0218a",
      dark: "#e0218a",
    });
    assert.equal(fs.existsSync(path.join(devHome, "state_5.sqlite")), true);
    assert.equal(fs.existsSync(path.join(devHome, "sqlite", "codex-dev.db")), true);
    assert.equal(fs.existsSync(path.join(devHome, ".codex-global-state.json")), true);
    assert.equal(fs.existsSync(path.join(devHome, "codex-plus-dom-survey-fixture.json")), true);
    assert.equal(fs.existsSync(path.join(devHome, "session_index.jsonl")), true);
    assert.equal(sqliteValue(path.join(devHome, "state_5.sqlite"), "select count(*) from threads;"), "10");
    assert.equal(
      sqliteValue(path.join(devHome, "sqlite", "codex-dev.db"), "select count(*) from local_thread_catalog;"),
      "10",
    );
    assert.equal(
      sqliteValue(path.join(devHome, "sqlite", "codex-dev.db"), "select count(*) from local_thread_catalog where cwd = '';"),
      "0",
    );
    assert.equal(
      sqliteValue(path.join(devHome, "sqlite", "codex-dev.db"), "select count(distinct cwd) from local_thread_catalog where display_title like 'Fixture: no project chat%';"),
      "1",
    );

    const serialized = fs.readFileSync(path.join(devHome, ".codex-global-state.json"), "utf8") +
      fs.readFileSync(path.join(devHome, "session_index.jsonl"), "utf8");
    assert.doesNotMatch(serialized, new RegExp(os.homedir().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(serialized, /Fixture: main repo path header/);
    assert.equal(fixture.workspaces.extraProjects.length, 8);
    const domSurvey = JSON.parse(fs.readFileSync(path.join(devHome, "codex-plus-dom-survey-fixture.json"), "utf8"));
    assert.deepEqual(domSurvey.runtimePluginsDisabled, ["aharnessRuns"]);
    assert.equal(domSurvey.targetThreadTitle, "Fixture: nested repos before branch selection");
    assert.equal(domSurvey.targetSidePanelTab, "Review");
    assert.equal(domSurvey.expectedProjects.aharnessProject, fixture.workspaces.aharnessProject);
    assert.equal(domSurvey.expectedAharnessStateMachines.length, 9);
  });
});

test("audit fixture retries transient dev-home removal failures", () => {
  withTempDir((tmpDir) => {
    const devHome = path.join(tmpDir, "codex-home");
    const electronUserDataPath = path.join(tmpDir, "electron-user-data");
    fs.mkdirSync(devHome, { recursive: true });
    fs.writeFileSync(path.join(devHome, "stale.txt"), "stale");
    let failedDevHomeRemoval = false;
    const fsImpl = {
      ...fs,
      rmSync(target, options) {
        if (!failedDevHomeRemoval && path.resolve(target) === path.resolve(devHome)) {
          failedDevHomeRemoval = true;
          const error = new Error("Directory not empty");
          error.code = "ENOTEMPTY";
          throw error;
        }
        return fs.rmSync(target, options);
      },
    };

    const fixture = buildAuditFixture({
      devHome,
      electronUserDataPath,
      rootDir: tmpDir,
      fsImpl,
    });

    assert.equal(failedDevHomeRemoval, true);
    assert.equal(fs.existsSync(path.join(fixture.devHome, "state_5.sqlite")), true);
    assert.equal(fs.existsSync(path.join(devHome, "stale.txt")), false);
  });
});

test("audit fixture writes project assignments, pinned data, and projectless threads", () => {
  withTempDir((tmpDir) => {
    const fixture = buildAuditFixture({
      devHome: path.join(tmpDir, "codex-home"),
      electronUserDataPath: path.join(tmpDir, "electron-user-data"),
      rootDir: tmpDir,
    });
    const state = JSON.parse(fs.readFileSync(path.join(fixture.devHome, ".codex-global-state.json"), "utf8"));
    const atomState = state["electron-persisted-atom-state"];
    const nestedThread = fixture.threads.find((thread) => thread.title.includes("nested repos"));
    const pinnedThread = fixture.threads.find((thread) => thread.title.includes("pinned thread"));
    const projectlessThread = fixture.threads.find((thread) => thread.projectless);
    const projectlessThreads = fixture.threads.filter((thread) => thread.projectless);
    const nestedAssignment = atomState["thread-project-assignments"][nestedThread.id];

    assert.ok(state["pinned-project-ids"].includes(fixture.workspaces.alpha));
    assert.ok(state["pinned-thread-ids"].includes(pinnedThread.id));
    assert.equal(projectlessThreads.length, 5);
    assert.equal(projectlessThreads.filter((thread) => thread.pinned).length, 2);
    assert.ok(state["projectless-thread-ids"].includes(projectlessThread.id));
    assert.equal(state["projectless-thread-ids"].length, 5);
    assert.equal(state["projectless-thread-ids"].some((threadId) => threadId.startsWith("local:")), false);
    assert.equal(state["project-order"].length >= 10, true);
    assert.equal(projectlessThread.sessionCwd, "~");
    assert.equal(projectlessThread.cwd, "~");
    assert.equal(fs.existsSync(projectlessThread.outputDirectory), true);
    assert.equal(projectlessThread.cwd, projectlessThread.sessionCwd);
    assert.equal(path.dirname(projectlessThread.outputDirectory), path.join(fixture.workspaces.projectlessRoot, projectlessThread.id));
    assert.equal(new Set(projectlessThreads.map((thread) => thread.cwd)).size, 1);
    assert.equal(new Set(projectlessThreads.map((thread) => thread.outputDirectory)).size, 5);
    assert.equal(atomState["thread-project-assignments"][projectlessThread.id], undefined);
    assert.equal(state["thread-writable-roots"][projectlessThread.id], undefined);
    assert.equal(
      sqliteValue(path.join(fixture.devHome, "state_5.sqlite"), `select count(*) from threads where title like 'Fixture: no project chat%' and git_sha is null and git_branch is null and git_origin_url is null;`),
      "5",
    );
    assert.equal(
      sqliteValue(path.join(fixture.devHome, "sqlite", "codex-dev.db"), `select count(*) from local_thread_catalog where display_title like 'Fixture: no project chat%' and git_branch is null;`),
      "5",
    );
    assert.deepEqual(state["thread-writable-roots"][nestedThread.id], [fixture.workspaces.nestedWorktree]);
    assert.equal(nestedAssignment.projectId, fixture.workspaces.nestedProject);
    assert.equal(nestedAssignment.cwd, fixture.workspaces.nestedWorktree);
    assert.notEqual(nestedAssignment.projectId, nestedAssignment.cwd);
    assert.equal(atomState[`sidebar-project-expanded-v1-codex:${fixture.workspaces.nestedProject}`], true);
  });
});

test("audit fixture copies only sign-in credentials from source home", () => {
  withTempDir((tmpDir) => {
    const sourceHome = path.join(tmpDir, "source-home");
    fs.mkdirSync(sourceHome, { recursive: true });
    fs.writeFileSync(path.join(sourceHome, "auth.json"), "{\"token\":\"fixture\"}\n");
    fs.writeFileSync(path.join(sourceHome, "config.toml"), "model = \"live\"\n");
    fs.writeFileSync(path.join(sourceHome, "state_5.sqlite"), "not copied");

    const fixture = buildAuditFixture({
      devHome: path.join(tmpDir, "codex-home"),
      electronUserDataPath: path.join(tmpDir, "electron-user-data"),
      rootDir: tmpDir,
      credentialsSourceHome: sourceHome,
    });

    assert.deepEqual(fixture.credentials, ["auth.json"]);
    assert.equal(fs.readFileSync(path.join(fixture.devHome, "auth.json"), "utf8"), "{\"token\":\"fixture\"}\n");
    const config = fs.readFileSync(path.join(fixture.devHome, "config.toml"), "utf8");
    assert.doesNotMatch(config, /^model =/m);
    assert.match(config, /trust_level = "trusted"/);
    assert.match(config, /alpha-main/);
    assert.notEqual(fs.readFileSync(path.join(fixture.devHome, "state_5.sqlite"), "utf8"), "not copied");
  });
});

test("audit fixture creates nested repository inputs for review probes", () => {
  withTempDir((tmpDir) => {
    const fixture = buildAuditFixture({
      devHome: path.join(tmpDir, "codex-home"),
      electronUserDataPath: path.join(tmpDir, "electron-user-data"),
      rootDir: tmpDir,
    });

    assert.equal(fs.existsSync(path.join(fixture.workspaces.nestedWorktree, ".gitmodules")), true);
    assert.equal(fs.existsSync(path.join(fixture.workspaces.nestedWorktree, ".codex", "plus.toml")), true);
    const nestedPlusToml = fs.readFileSync(path.join(fixture.workspaces.nestedWorktree, ".codex", "plus.toml"), "utf8");
    assert.doesNotMatch(nestedPlusToml, /\[\[aharness\.state_machines\]\]/);
    assert.equal(fs.existsSync(path.join(fixture.workspaces.aharnessProject, ".codex", "plus.toml")), true);
    assert.equal(fs.readFileSync(path.join(fixture.workspaces.aharnessProject, ".gitignore"), "utf8"), ".aharness/\nnode_modules/\n");
    const plusToml = fs.readFileSync(path.join(fixture.workspaces.aharnessProject, ".codex", "plus.toml"), "utf8");
    for (const target of [
      "examples/color-funnel.fsm.ts",
      "examples/ops-clear-demo.fsm.ts",
      "examples/trivia-rounds.fsm.ts",
      "examples/adventure.fsm.ts",
      "examples/await-checkpoints.fsm.ts",
      "examples/pirate-roast.fsm.ts",
      "examples/composed-pipeline.fsm.ts",
      "examples/approval-policy.fsm.ts",
      "examples/coding-smoke.fsm.ts",
    ]) {
      assert.match(plusToml, new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.equal(fs.existsSync(path.join(fixture.workspaces.aharnessProject, target)), true);
    }
    assert.equal(fs.existsSync(path.join(fixture.workspaces.aharnessProject, "examples/coding-smoke/fixture/package.json")), true);
    assert.equal(fs.existsSync(path.join(fixture.workspaces.aharnessProject, "examples/coding-smoke/fixture/src/math.ts")), true);
    assert.equal(fs.existsSync(path.join(fixture.workspaces.aharnessProject, "examples/coding-smoke/fixture/test/math.test.ts")), true);
    assert.equal(fs.existsSync(path.join(fixture.workspaces.aharnessProject, "examples/coding-smoke/fixture/vitest.config.ts")), true);
    const codingSmokeMath = fs.readFileSync(path.join(fixture.workspaces.aharnessProject, "examples/coding-smoke/fixture/src/math.ts"), "utf8");
    assert.match(codingSmokeMath, /a - b/);
    const adventureSource = fs.readFileSync(path.join(fixture.workspaces.aharnessProject, "examples/adventure.fsm.ts"), "utf8");
    assert.match(adventureSource, /createFsm/);
    assert.match(adventureSource, /forestChoice/);
    assert.match(adventureSource, /caveChoice/);
    assert.match(adventureSource, /riverChoice/);
    assert.doesNotMatch(adventureSource, /Synthetic fixture/);
    assert.equal(fs.existsSync(path.join(fixture.workspaces.aharnessProject, "examples/composed-pipeline-child.fsm.ts")), true);
    assert.equal(fs.existsSync(path.join(fixture.workspaces.aharnessProject, "examples/skills/pirate-mode/SKILL.md")), true);
    assert.equal(
      childProcess.execFileSync("git", ["status", "--short"], {
        cwd: fixture.workspaces.aharnessProject,
        encoding: "utf8",
      }),
      "",
    );
    assert.match(
      childProcess.execFileSync("git", ["ls-files", "examples/coding-smoke/fixture/src/math.ts"], {
        cwd: fixture.workspaces.aharnessProject,
        encoding: "utf8",
      }),
      /examples\/coding-smoke\/fixture\/src\/math\.ts/,
    );
    assert.equal(fs.existsSync(path.join(fixture.workspaces.nestedAlphaModule, ".git")), true);
    assert.equal(fs.existsSync(path.join(fixture.workspaces.nestedBetaModule, ".git")), true);
    assert.match(
      childProcess.execFileSync("git", ["status", "--short"], {
        cwd: fixture.workspaces.nestedAlphaModule,
        encoding: "utf8",
      }),
      /README\.md/,
    );
    assert.match(
      childProcess.execFileSync("git", ["branch", "--list"], {
        cwd: fixture.workspaces.nestedAlphaModule,
        encoding: "utf8",
      }),
      /audit-alpha-base/,
    );
    assert.match(
      childProcess.execFileSync("git", ["branch", "--list"], {
        cwd: fixture.workspaces.nestedBetaModule,
        encoding: "utf8",
      }),
      /audit-beta-base/,
    );
  });
});

test("audit fixture can seed an app-created empty-home baseline", () => {
  withTempDir((tmpDir) => {
    const calls = [];
    const fixture = buildAuditFixture({
      devHome: path.join(tmpDir, "codex-home"),
      electronUserDataPath: path.join(tmpDir, "electron-user-data"),
      rootDir: tmpDir,
      appServerBinary: "/fixture/Codex.app/Contents/Resources/codex",
      execFileSync(command, args, options = {}) {
        calls.push({ command, args, env: options.env });
        if (command === "/fixture/Codex.app/Contents/Resources/codex") {
          fs.mkdirSync(path.join(options.env.CODEX_HOME), { recursive: true });
          childProcess.execFileSync("sqlite3", [path.join(options.env.CODEX_HOME, "state_5.sqlite")], {
            input: `
              create table threads (
                id text primary key,
                rollout_path text not null,
                created_at integer not null,
                updated_at integer not null,
                source text not null,
                model_provider text not null,
                cwd text not null,
                title text not null,
                sandbox_policy text not null,
                approval_mode text not null,
                tokens_used integer not null default 0,
                has_user_event integer not null default 0,
                archived integer not null default 0,
                archived_at integer,
                git_sha text,
                git_branch text,
                git_origin_url text,
                cli_version text not null default '',
                first_user_message text not null default '',
                agent_nickname text,
                agent_role text,
                memory_mode text not null default 'enabled',
                model text,
                reasoning_effort text,
                agent_path text,
                created_at_ms integer,
                updated_at_ms integer,
                thread_source text,
                preview text not null default '',
                recency_at integer not null default 0,
                recency_at_ms integer not null default 0
              );
              create table thread_dynamic_tools (
                thread_id text not null,
                position integer not null,
                name text not null,
                description text not null,
                input_schema text not null,
                defer_loading integer not null default 0,
                namespace text,
                primary key(thread_id, position)
              );
              create table thread_spawn_edges (
                parent_thread_id text not null,
                child_thread_id text not null primary key,
                status text not null
              );
              create table local_thread_catalog_hosts (
                host_id text primary key,
                host_kind text not null
              );
              create table local_thread_catalog_metadata (
                id integer primary key,
                catalog_revision integer not null default 0
              );
              create table local_thread_catalog_sync_state (
                host_id text primary key,
                watermark_updated_at real,
                initial_build_complete integer not null default 0,
                observation_sequence integer not null default 0
              );
              create table local_thread_catalog (
                host_id text not null,
                thread_id text not null,
                display_title text not null,
                source_created_at real not null,
                source_updated_at real not null,
                cwd text not null,
                source_kind text not null,
                source_detail text,
                model_provider text not null,
                git_branch text,
                observation_sequence integer not null,
                missing_candidate integer not null default 0,
                primary key (host_id, thread_id)
              );
            `,
          });
          const error = new Error("no transport configured");
          error.stderr = "Error: no transport configured; use --listen or enable remote control";
          throw error;
        }
        return childProcess.execFileSync(command, args, options);
      },
    });

    assert.equal(fixture.baseline.created, true);
    assert.equal(fixture.files.includes("sqlite/codex-dev.db"), true);
    assert.equal(sqliteValue(path.join(fixture.devHome, "state_5.sqlite"), "select count(*) from threads;"), "10");
    assert.equal(sqliteValue(path.join(fixture.devHome, "state_5.sqlite"), "select count(*) from local_thread_catalog;"), "10");
    const appServerCall = calls.find((call) => call.command === "/fixture/Codex.app/Contents/Resources/codex");
    assert.equal(appServerCall.env.CODEX_HOME, fixture.devHome);
  });
});

test("discovery classification keeps tolerated and preexisting-only files optional", () => {
  const classified = classifyDiscoveredHomeFiles({
    appCreated: ["state_5.sqlite", "sqlite/codex-dev.db"],
    opened: ["state_5.sqlite", "sqlite/codex-dev.db", "config.toml", "auth.json"],
    preexistingOpened: ["config.toml"],
    missingTolerated: ["auth.json"],
  });

  assert.deepEqual(classified.required, ["sqlite/codex-dev.db", "state_5.sqlite"]);
  assert.deepEqual(classified.optional, ["auth.json", "config.toml"]);
});
