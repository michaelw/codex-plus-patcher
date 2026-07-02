const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const FIXTURE_NOW_SECONDS = Math.floor(Date.now() / 1000);
const FIXTURE_NOW_MS = FIXTURE_NOW_SECONDS * 1000;
const FIXTURE_BROWSER_COLORS = {
  light: "#e0218a",
  dark: "#e0218a",
};
const FIXTURE_GIT_SHA = "0123456789abcdef0123456789abcdef01234567";
const CREDENTIAL_FILES = ["auth.json"];

function sqliteLiteral(value) {
  if (value == null) return "null";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function writeJson(filePath, value, fsImpl = fs) {
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true });
  fsImpl.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath, value, fsImpl = fs) {
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true });
  fsImpl.writeFileSync(filePath, value);
}

function git(args, cwd, execFileSync = childProcess.execFileSync) {
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function createGitRepo(repoPath, { label, dirtyFile = "README.md", branches = [], fsImpl = fs, execFileSync = childProcess.execFileSync }) {
  fsImpl.mkdirSync(repoPath, { recursive: true });
  git(["init", "-b", "main"], repoPath, execFileSync);
  git(["config", "user.email", "fixture@example.invalid"], repoPath, execFileSync);
  git(["config", "user.name", "Codex Plus Fixture"], repoPath, execFileSync);
  writeText(path.join(repoPath, dirtyFile), `# ${label}\n\nBaseline fixture content.\n`, fsImpl);
  git(["add", dirtyFile], repoPath, execFileSync);
  git(["commit", "-m", `Seed ${label}`], repoPath, execFileSync);
  for (const branch of branches) git(["branch", branch], repoPath, execFileSync);
  fsImpl.appendFileSync(path.join(repoPath, dirtyFile), "\nUncommitted fixture change.\n");
}

function fixtureLayout(rootDir) {
  const workRoot = path.join(rootDir, "fixture-workspaces");
  const projectlessRoot = path.join(rootDir, "fixture-projectless-workspaces");
  const projectsRoot = path.join(workRoot, "projects");
  const codexWorktreesRoot = path.join(workRoot, "codex-worktrees");
  const alpha = path.join(projectsRoot, "alpha-main");
  const beta = path.join(projectsRoot, "beta-service");
  const nestedProject = path.join(projectsRoot, "nested-suite");
  const nestedWorktree = path.join(codexWorktreesRoot, "nested-suite-worktree");
  const missingProject = path.join(projectsRoot, "missing-project");
  const extraProjects = [
    "color-lab-01",
    "color-lab-02",
    "color-lab-03",
    "color-lab-04",
    "color-lab-05",
    "color-lab-06",
    "color-lab-07",
    "color-lab-08",
  ].map((name) => path.join(projectsRoot, name));
  return {
    workRoot,
    projectlessRoot,
    projectsRoot,
    codexWorktreesRoot,
    alpha,
    beta,
    nestedProject,
    nestedWorktree,
    nestedProjectAlphaModule: path.join(nestedProject, "repos", "alpha-module"),
    nestedProjectBetaModule: path.join(nestedProject, "repos", "beta-module"),
    nestedAlphaModule: path.join(nestedWorktree, "repos", "alpha-module"),
    nestedBetaModule: path.join(nestedWorktree, "repos", "beta-module"),
    missingProject,
    extraProjects,
  };
}

function createNestedRepositoryInputs(rootPath, { alphaModule, betaModule, fsImpl = fs, execFileSync = childProcess.execFileSync }) {
  createGitRepo(alphaModule, { label: "Nested Alpha Module", branches: ["audit-alpha-base", "audit-shared-base"], fsImpl, execFileSync });
  createGitRepo(betaModule, { label: "Nested Beta Module", dirtyFile: "module.txt", branches: ["audit-beta-base", "audit-shared-base"], fsImpl, execFileSync });
  writeText(
    path.join(rootPath, ".gitmodules"),
    [
      "[submodule \"alpha-module\"]",
      "\tpath = repos/alpha-module",
      "\turl = ./repos/alpha-module",
      "[submodule \"beta-module\"]",
      "\tpath = repos/beta-module",
      "\turl = ./repos/beta-module",
      "",
    ].join("\n"),
    fsImpl,
  );
  writeText(
    path.join(rootPath, ".codex", "plus.toml"),
    [
      "[[repositories]]",
      "label = \"Alpha Module\"",
      "path = \"repos/alpha-module\"",
      "",
      "[[repositories]]",
      "label = \"Beta Module\"",
      "path = \"repos/beta-module\"",
      "",
    ].join("\n"),
    fsImpl,
  );
}

function createFixtureWorkspaces(rootDir, { fsImpl = fs, execFileSync = childProcess.execFileSync } = {}) {
  const layout = fixtureLayout(rootDir);
  fsImpl.rmSync(layout.workRoot, { recursive: true, force: true });
  createGitRepo(layout.alpha, { label: "Alpha Main", fsImpl, execFileSync });
  createGitRepo(layout.beta, { label: "Beta Service", fsImpl, execFileSync });
  createGitRepo(layout.nestedProject, { label: "Nested Suite Main", fsImpl, execFileSync });
  createGitRepo(layout.nestedWorktree, { label: "Nested Suite Worktree", fsImpl, execFileSync });
  for (const [index, project] of layout.extraProjects.entries()) {
    createGitRepo(project, { label: `Color Lab ${index + 1}`, fsImpl, execFileSync });
  }
  createNestedRepositoryInputs(layout.nestedProject, {
    alphaModule: layout.nestedProjectAlphaModule,
    betaModule: layout.nestedProjectBetaModule,
    fsImpl,
    execFileSync,
  });
  createNestedRepositoryInputs(layout.nestedWorktree, {
    alphaModule: layout.nestedAlphaModule,
    betaModule: layout.nestedBetaModule,
    fsImpl,
    execFileSync,
  });
  return layout;
}

function fixtureThreads(layout) {
  const projectlessThreads = Array.from({ length: 5 }, (_, index) => {
    const timestamp = (FIXTURE_NOW_MS - (index * 120000)).toString(16).padStart(12, "0");
    const id = `${timestamp.slice(0, 8)}-${timestamp.slice(8, 12)}-7000-8000-00000000001${index}`;
    const outputDirectory = path.join(layout.projectlessRoot, id, "outputs");
    return {
      id,
      title: `Fixture: no project chat ${index + 1}`,
      cwd: "~",
      sessionCwd: "~",
      outputDirectory,
      projectId: null,
      preview: `Projectless fixture chat ${index + 1}`,
      pinned: index < 2,
      projectless: true,
    };
  });
  return [
    ...projectlessThreads,
    {
      id: "019f0000-0000-7000-8000-000000000006",
      title: "Fixture: main repo path header",
      cwd: layout.alpha,
      projectId: layout.alpha,
      preview: "Main repository fixture chat",
      pinned: true,
    },
    {
      id: "019f0000-0000-7000-8000-000000000005",
      title: "Fixture: pinned thread with color",
      cwd: layout.alpha,
      projectId: layout.alpha,
      preview: "Pinned thread fixture",
      pinned: true,
    },
    {
      id: "019f0000-0000-7000-8000-000000000004",
      title: "Fixture: unpinned project child",
      cwd: layout.beta,
      projectId: layout.beta,
      preview: "Unpinned project fixture",
    },
    {
      id: "019f0000-0000-7000-8000-000000000003",
      title: "Fixture: nested repos before branch selection",
      cwd: layout.nestedWorktree,
      projectId: layout.nestedProject,
      preview: "Nested repository fixture chat",
      pinned: true,
    },
    {
      id: "019f0000-0000-7000-8000-000000000001",
      title: "Fixture: missing cwd header skip",
      cwd: layout.missingProject,
      projectId: layout.missingProject,
      preview: "Missing cwd fixture chat",
    },
  ];
}

function fixtureSessionPath(devHome, thread) {
  return path.join(
    path.resolve(devHome),
    "sessions",
    "2026",
    "06",
    "30",
    `rollout-2026-06-30T00-00-00-${thread.id}.jsonl`,
  );
}

function createStateDatabase(dbPath, threads, { fsImpl = fs, execFileSync = childProcess.execFileSync } = {}) {
  fsImpl.mkdirSync(path.dirname(dbPath), { recursive: true });
  fsImpl.rmSync(dbPath, { force: true });
  fsImpl.rmSync(`${dbPath}-wal`, { force: true });
  fsImpl.rmSync(`${dbPath}-shm`, { force: true });
  const devHome = path.dirname(path.resolve(dbPath));
  const rows = threads.map((thread, index) => {
    const created = FIXTURE_NOW_SECONDS - ((index + 1) * 600);
    const updated = FIXTURE_NOW_SECONDS - (index * 120);
    return [
      sqliteLiteral(thread.id),
      sqliteLiteral(fixtureSessionPath(devHome, thread)),
      created * 1000,
      updated * 1000,
      sqliteLiteral("vscode"),
      sqliteLiteral("openai"),
      sqliteLiteral(thread.cwd),
      sqliteLiteral(thread.title),
      sqliteLiteral("danger-full-access"),
      sqliteLiteral("never"),
      1,
      1,
      0,
      "null",
      sqliteLiteral(thread.projectless ? null : FIXTURE_GIT_SHA),
      sqliteLiteral(thread.projectless ? null : "main"),
      sqliteLiteral(thread.projectless ? null : "https://example.invalid/codex-plus-fixture.git"),
      sqliteLiteral("fixture"),
      sqliteLiteral(thread.preview),
      "null",
      "null",
      sqliteLiteral("enabled"),
      sqliteLiteral("gpt-5.5"),
      sqliteLiteral("medium"),
      "null",
      created * 1000,
      updated * 1000,
      sqliteLiteral("user"),
      sqliteLiteral(thread.preview),
      updated,
      updated * 1000,
    ].join(", ");
  }).join("),\n(");
  execFileSync("sqlite3", [dbPath], {
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
      create index idx_threads_archived on threads(archived);
      create index idx_threads_created_at_ms on threads(created_at_ms desc, id desc);
      create index idx_threads_updated_at_ms on threads(updated_at_ms desc, id desc);
      create index idx_threads_archived_cwd_recency_at_ms on threads(archived, cwd, recency_at_ms desc, id desc);
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
      insert into threads values
        (${rows});
    `,
    stdio: "pipe",
  });
}

function createCatalogDatabase(dbPath, threads, { fsImpl = fs, execFileSync = childProcess.execFileSync } = {}) {
  fsImpl.mkdirSync(path.dirname(dbPath), { recursive: true });
  fsImpl.rmSync(dbPath, { force: true });
  fsImpl.rmSync(`${dbPath}-wal`, { force: true });
  fsImpl.rmSync(`${dbPath}-shm`, { force: true });
  const rows = threads.map((thread, index) => {
    const created = FIXTURE_NOW_SECONDS - ((index + 1) * 600);
    const updated = FIXTURE_NOW_SECONDS - (index * 120);
    return [
      sqliteLiteral("local"),
      sqliteLiteral(thread.id),
      sqliteLiteral(thread.title),
      created * 1000,
      updated * 1000,
      sqliteLiteral(thread.cwd),
      sqliteLiteral("vscode"),
      "null",
      sqliteLiteral("openai"),
      sqliteLiteral(thread.projectless ? null : "main"),
      index + 1,
      0,
    ].join(", ");
  }).join("),\n(");
  execFileSync("sqlite3", [dbPath], {
    input: `
      create table inbox_items (
        id text primary key,
        title text,
        description text,
        thread_id text,
        read_at integer,
        created_at integer
      );
      create table automations (
        id text primary key,
        name text not null,
        prompt text not null,
        status text not null default 'ACTIVE',
        next_run_at integer,
        last_run_at integer,
        cwds text not null default '[]',
        rrule text not null default 'FREQ=HOURLY;INTERVAL=24;BYMINUTE=0',
        model text,
        reasoning_effort text,
        created_at integer not null,
        updated_at integer not null
      );
      create table automation_runs (
        thread_id text primary key,
        automation_id text not null,
        status text not null,
        read_at integer,
        thread_title text,
        source_cwd text,
        inbox_title text,
        inbox_summary text,
        created_at integer not null,
        updated_at integer not null,
        archived_user_message text,
        archived_assistant_message text,
        archived_reason text
      );
      create table local_app_server_feature_enablement (
        feature_name text primary key,
        enabled integer not null,
        updated_at integer not null
      );
      insert into local_app_server_feature_enablement(feature_name, enabled, updated_at)
        values('remote_control', 1, ${FIXTURE_NOW_SECONDS * 1000});
      create table local_thread_catalog_hosts (
        host_id text primary key,
        host_kind text not null check (host_kind in ('local', 'ssh', 'wsl', 'remote-control'))
      );
      create table local_thread_catalog_metadata (
        id integer primary key check (id = 1),
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
        missing_candidate integer not null default 0 check (missing_candidate in (0, 1)),
        primary key (host_id, thread_id)
      );
      create index local_thread_catalog_updated_idx
        on local_thread_catalog(host_id, source_updated_at desc, source_created_at desc, thread_id)
        where missing_candidate = 0;
      insert into local_thread_catalog_hosts(host_id, host_kind) values('local', 'local');
      insert into local_thread_catalog_metadata(id, catalog_revision) values(1, ${threads.length});
      insert into local_thread_catalog_sync_state(host_id, watermark_updated_at, initial_build_complete, observation_sequence)
        values('local', null, 1, ${threads.length});
      insert into local_thread_catalog values
        (${rows});
    `,
    stdio: "pipe",
  });
}

function sqliteTableExists(dbPath, tableName, execFileSync = childProcess.execFileSync) {
  const output = execFileSync("sqlite3", [
    dbPath,
    `select count(*) from sqlite_master where type = 'table' and name = ${sqliteLiteral(tableName)};`,
  ], { encoding: "utf8", stdio: "pipe" }).trim();
  return output === "1";
}

function initializeEmptyHomeBaseline({ appServerBinary, devHome, execFileSync = childProcess.execFileSync }) {
  if (!appServerBinary) return null;
  try {
    execFileSync(appServerBinary, ["app-server", "--listen", "off", "--analytics-default-enabled"], {
      env: { ...process.env, CODEX_HOME: devHome },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const stderr = String(error.stderr || "");
    if (!stderr.includes("no transport configured")) throw error;
  }
  return { appServerBinary, created: true };
}

function seedStateDatabase(dbPath, threads, { execFileSync = childProcess.execFileSync } = {}) {
  if (!sqliteTableExists(dbPath, "threads", execFileSync)) throw new Error(`Fixture baseline is missing threads table: ${dbPath}`);
  const devHome = path.dirname(path.resolve(dbPath));
  const threadRows = threads.map((thread, index) => {
    const created = FIXTURE_NOW_SECONDS - ((index + 1) * 600);
    const updated = FIXTURE_NOW_SECONDS - (index * 120);
    return [
      sqliteLiteral(thread.id),
      sqliteLiteral(fixtureSessionPath(devHome, thread)),
      created,
      updated,
      sqliteLiteral("vscode"),
      sqliteLiteral("openai"),
      sqliteLiteral(thread.cwd),
      sqliteLiteral(thread.title),
      sqliteLiteral("danger-full-access"),
      sqliteLiteral("never"),
      0,
      0,
      0,
      "null",
      sqliteLiteral(thread.projectless ? null : FIXTURE_GIT_SHA),
      sqliteLiteral(thread.projectless ? null : "main"),
      sqliteLiteral(thread.projectless ? null : "https://example.invalid/codex-plus-fixture.git"),
      sqliteLiteral("fixture"),
      sqliteLiteral(thread.preview),
      "null",
      "null",
      sqliteLiteral("enabled"),
      sqliteLiteral("gpt-5.5"),
      sqliteLiteral("medium"),
      "null",
      created * 1000,
      updated * 1000,
      sqliteLiteral("user"),
      sqliteLiteral(thread.preview),
      updated,
      updated * 1000,
    ].join(", ");
  }).join("),\n(");
  const catalogRows = threads.map((thread, index) => {
    const created = FIXTURE_NOW_SECONDS - ((index + 1) * 600);
    const updated = FIXTURE_NOW_SECONDS - (index * 120);
    return [
      sqliteLiteral("local"),
      sqliteLiteral(thread.id),
      sqliteLiteral(thread.title),
      created,
      updated,
      sqliteLiteral(thread.cwd),
      sqliteLiteral("vscode"),
      "null",
      sqliteLiteral("openai"),
      sqliteLiteral(thread.projectless ? null : "main"),
      index + 1,
      0,
    ].join(", ");
  }).join("),\n(");
  const featureEnablementSql = sqliteTableExists(dbPath, "local_app_server_feature_enablement", execFileSync)
    ? `
      delete from local_app_server_feature_enablement;
      insert into local_app_server_feature_enablement(feature_name, enabled, updated_at)
        values('remote_control', 1, ${FIXTURE_NOW_SECONDS * 1000});
    `
    : "";
  const catalogSql = sqliteTableExists(dbPath, "local_thread_catalog", execFileSync)
    ? `
      delete from local_thread_catalog;
      delete from local_thread_catalog_hosts;
      delete from local_thread_catalog_metadata;
      delete from local_thread_catalog_sync_state;
      insert into local_thread_catalog_hosts(host_id, host_kind) values('local', 'local');
      insert into local_thread_catalog_metadata(id, catalog_revision) values(1, ${threads.length});
      insert into local_thread_catalog_sync_state(host_id, watermark_updated_at, initial_build_complete, observation_sequence)
        values('local', null, 1, ${threads.length});
      insert into local_thread_catalog values
        (${catalogRows});
    `
    : "";
  execFileSync("sqlite3", [dbPath], {
    input: `
      pragma foreign_keys = off;
      ${featureEnablementSql}
      delete from thread_dynamic_tools;
      delete from thread_spawn_edges;
      delete from threads;
      insert into threads(
        id,
        rollout_path,
        created_at,
        updated_at,
        source,
        model_provider,
        cwd,
        title,
        sandbox_policy,
        approval_mode,
        tokens_used,
        has_user_event,
        archived,
        archived_at,
        git_sha,
        git_branch,
        git_origin_url,
        cli_version,
        first_user_message,
        agent_nickname,
        agent_role,
        memory_mode,
        model,
        reasoning_effort,
        agent_path,
        created_at_ms,
        updated_at_ms,
        thread_source,
        preview,
        recency_at,
        recency_at_ms
      ) values
        (${threadRows});
      ${catalogSql}
    `,
    stdio: "pipe",
  });
}

function createGlobalState(layout, threads) {
  const projectOrder = [layout.alpha, layout.nestedProject, layout.beta, layout.missingProject, ...layout.extraProjects];
  const assignments = {};
  const workspaceHints = {};
  const writableRoots = {};
  const outputDirectories = {};
  const addThreadKey = (target, thread, value) => {
    target[thread.id] = value;
  };
  const addProjectlessThreadKey = (target, thread, value) => {
    target[thread.id] = value;
  };
  for (const thread of threads) {
    if (thread.cwd) {
      const addKey = thread.projectless ? addProjectlessThreadKey : addThreadKey;
      addKey(workspaceHints, thread, thread.projectId || (thread.projectless ? layout.projectlessRoot : thread.cwd));
      if (!thread.projectless) addThreadKey(writableRoots, thread, [thread.cwd]);
    }
    if (thread.projectless) addProjectlessThreadKey(outputDirectories, thread, thread.outputDirectory || path.join(thread.cwd, "outputs"));
    if (thread.projectId) {
      const assignment = {
        projectKind: "local",
        projectId: thread.projectId,
        cwd: thread.cwd,
        pendingCoreUpdate: false,
      };
      addThreadKey(assignments, thread, assignment);
    }
  }
  const pinnedThreadIds = threads.filter((thread) => thread.pinned).map((thread) => thread.id);
  const projectlessThreadIds = threads.filter((thread) => thread.projectless).map((thread) => thread.id);
  const expandedProjects = Object.fromEntries(projectOrder.map((project) => [`sidebar-project-expanded-v1-codex:${project}`, true]));
  return {
    "electron-persisted-atom-state": {
      "composer-auto-context-enabled": false,
      "composer-permission-mode-visibility": {
        "guardian-approvals": true,
        "full-access": false,
      },
      "electron:onboarding-hide-first-new-thread-promos": false,
      "electron:onboarding-override": "auto",
      "electron:onboarding-projectless-completed": true,
      "electron:onboarding-welcome-pending": false,
      "electron:onboarding-welcome-v2-role-state": {
        roles: ["something_else"],
        personalizedSuggestionsEnabled: false,
      },
      "last_completed_onboarding": FIXTURE_NOW_SECONDS,
      "agent-mode": "custom",
      "agent-mode-by-host-id": { local: "full-access" },
      "preferred-non-full-access-agent-mode-by-host-id": { local: "guardian-approvals" },
      "sidebar-organize-mode-v1": "project",
      "sidebar-keep-projects-in-recent-v1": true,
      "active-workspace-roots": [layout.nestedWorktree],
      "project-order": projectOrder,
      "pinned-project-ids": [layout.alpha],
      "pinned-thread-ids": pinnedThreadIds,
      "projectless-thread-ids": projectlessThreadIds,
      "thread-workspace-root-hints": workspaceHints,
      "thread-writable-roots": writableRoots,
      "thread-projectless-output-directories": outputDirectories,
      "electron-saved-workspace-roots": projectOrder,
      "electron-workspace-root-labels": {
        [layout.nestedWorktree]: "nested-suite-worktree",
        [layout.alpha]: "alpha-main",
        [layout.nestedProject]: "nested-suite",
        [layout.beta]: "beta-service",
        [layout.missingProject]: "missing-project",
        ...Object.fromEntries(layout.extraProjects.map((project) => [project, path.basename(project)])),
      },
      ...Object.fromEntries(projectOrder.map((project) => [
        `composer-mode-by-project:${JSON.stringify(["local", project])}`,
        "worktree",
      ])),
      "local-env-selections-by-workspace": Object.fromEntries(projectOrder.map((project) => [
        `local:${project}`,
        path.join(project, ".codex", "environments", "environment.toml"),
      ])),
      "thread-project-assignments": assignments,
      "unread-thread-ids-by-host-v1": { local: [] },
      ...Object.fromEntries(threads.map((thread, index) => [
        `thread-client-id-v1:local%3A${thread.id}`,
        `client-new-thread:codex-plus-fixture-${index + 1}`,
      ])),
      ...expandedProjects,
    },
    "active-workspace-roots": [layout.nestedWorktree],
    "project-order": projectOrder,
    "pinned-project-ids": [layout.alpha],
    "pinned-thread-ids": pinnedThreadIds,
    "projectless-thread-ids": projectlessThreadIds,
    "thread-project-assignments": assignments,
    "thread-workspace-root-hints": workspaceHints,
    "thread-writable-roots": writableRoots,
    "thread-projectless-output-directories": outputDirectories,
    "electron-saved-workspace-roots": projectOrder,
    "electron-workspace-root-labels": {
      [layout.nestedWorktree]: "nested-suite-worktree",
      [layout.alpha]: "alpha-main",
      [layout.nestedProject]: "nested-suite",
      [layout.beta]: "beta-service",
      [layout.missingProject]: "missing-project",
      ...Object.fromEntries(layout.extraProjects.map((project) => [project, path.basename(project)])),
    },
  };
}

function tomlBasicString(value) {
  return JSON.stringify(String(value));
}

function createFixtureConfig(layout) {
  const trustedProjects = [
    layout.alpha,
    layout.beta,
    layout.nestedProject,
    layout.nestedWorktree,
    layout.nestedAlphaModule,
    layout.nestedBetaModule,
    ...layout.extraProjects,
  ];
  return `${[
    "[desktop]",
    "conversationDetailMode = \"STEPS_COMMANDS\"",
    "ambient-suggestions-enabled = false",
    "",
  ].join("\n")}${trustedProjects.map((projectPath) => [
    `[projects.${tomlBasicString(projectPath)}]`,
    "trust_level = \"trusted\"",
    "",
  ].join("\n")).join("\n")}`;
}

function writeSessionIndex(devHome, threads, fsImpl = fs) {
  const lines = threads.map((thread, index) => JSON.stringify({
    id: thread.id,
    thread_name: thread.title,
    updated_at: new Date((FIXTURE_NOW_SECONDS - (index * 120)) * 1000).toISOString(),
  }));
  writeText(path.join(devHome, "session_index.jsonl"), `${lines.join("\n")}\n`, fsImpl);
  for (const [index, thread] of threads.entries()) {
    const timestamp = new Date((FIXTURE_NOW_SECONDS - (index * 120)) * 1000).toISOString();
    const sessionCwd = thread.sessionCwd || thread.cwd;
    const turnId = thread.id.replace(/.$/, "a");
    const records = [
      {
        timestamp,
        type: "session_meta",
        payload: {
          session_id: thread.id,
          id: thread.id,
          timestamp,
          cwd: sessionCwd,
          originator: "codex_plus_audit_fixture",
          cli_version: "fixture",
          source: "vscode",
          thread_source: "user",
          model_provider: "openai",
          base_instructions: { text: "Synthetic Codex Plus audit fixture." },
          ...(!thread.projectless && thread.cwd ? { git: { commit_hash: FIXTURE_GIT_SHA, branch: "main" } } : {}),
        },
      },
      {
        timestamp,
        type: "event_msg",
        payload: {
          type: "task_started",
          turn_id: turnId,
          model_context_window: 258400,
        },
      },
      {
        timestamp,
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: thread.preview }],
        },
      },
      {
        timestamp,
        type: "event_msg",
        payload: {
          type: "task_complete",
          turn_id: turnId,
        },
      },
    ];
    writeText(
      fixtureSessionPath(devHome, thread),
      `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
      fsImpl,
    );
  }
}

function copyFixtureCredentials({ sourceHome, devHome, fsImpl = fs } = {}) {
  if (!sourceHome) return [];
  const copied = [];
  for (const relativePath of CREDENTIAL_FILES) {
    const source = path.join(sourceHome, relativePath);
    const target = path.join(devHome, relativePath);
    if (!fsImpl.existsSync(source)) continue;
    fsImpl.mkdirSync(path.dirname(target), { recursive: true });
    fsImpl.copyFileSync(source, target);
    copied.push(relativePath);
  }
  return copied;
}

function classifyDiscoveredHomeFiles({ appCreated = [], opened = [], preexistingOpened = [], missingTolerated = [] } = {}) {
  const created = new Set(appCreated.map((filePath) => path.normalize(filePath)));
  const preexisting = new Set(preexistingOpened.map((filePath) => path.normalize(filePath)));
  const tolerated = new Set(missingTolerated.map((filePath) => path.normalize(filePath)));
  const required = new Set();
  const optional = new Set();
  for (const filePath of opened.map((entry) => path.normalize(entry))) {
    if (created.has(filePath)) required.add(filePath);
    else if (preexisting.has(filePath) || tolerated.has(filePath)) optional.add(filePath);
  }
  for (const filePath of created) required.add(filePath);
  for (const filePath of preexisting) {
    if (!required.has(filePath)) optional.add(filePath);
  }
  for (const filePath of tolerated) {
    if (!required.has(filePath)) optional.add(filePath);
  }
  return {
    required: [...required].sort(),
    optional: [...optional].sort(),
  };
}

function buildAuditFixture({
  devHome,
  electronUserDataPath,
  appServerBinary = null,
  credentialsSourceHome = null,
  rootDir = path.dirname(path.resolve(devHome)),
  fsImpl = fs,
  execFileSync = childProcess.execFileSync,
} = {}) {
  if (!devHome) throw new Error("devHome is required");
  const resolvedDevHome = path.resolve(devHome);
  const resolvedElectronUserDataPath = electronUserDataPath ? path.resolve(electronUserDataPath) : null;
  fsImpl.rmSync(resolvedDevHome, { recursive: true, force: true });
  if (resolvedElectronUserDataPath) fsImpl.rmSync(resolvedElectronUserDataPath, { recursive: true, force: true });
  fsImpl.mkdirSync(resolvedDevHome, { recursive: true });
  if (resolvedElectronUserDataPath) fsImpl.mkdirSync(resolvedElectronUserDataPath, { recursive: true });

  const layout = createFixtureWorkspaces(rootDir, { fsImpl, execFileSync });
  const threads = fixtureThreads(layout);
  for (const thread of threads) {
    if (thread.sessionCwd && thread.sessionCwd !== "~") fsImpl.mkdirSync(thread.sessionCwd, { recursive: true });
    if (thread.outputDirectory) fsImpl.mkdirSync(thread.outputDirectory, { recursive: true });
  }
  const credentials = copyFixtureCredentials({
    sourceHome: credentialsSourceHome,
    devHome: resolvedDevHome,
    fsImpl,
  });
  const baseline = initializeEmptyHomeBaseline({
    appServerBinary,
    devHome: resolvedDevHome,
    execFileSync,
  });
  if (baseline) {
    seedStateDatabase(path.join(resolvedDevHome, "state_5.sqlite"), threads, { execFileSync });
  } else {
    createStateDatabase(path.join(resolvedDevHome, "state_5.sqlite"), threads, { fsImpl, execFileSync });
  }
  createCatalogDatabase(path.join(resolvedDevHome, "sqlite", "codex-dev.db"), threads, { fsImpl, execFileSync });
  writeJson(path.join(resolvedDevHome, ".codex-global-state.json"), createGlobalState(layout, threads), fsImpl);
  writeSessionIndex(resolvedDevHome, threads, fsImpl);
  writeText(path.join(resolvedDevHome, "config.toml"), createFixtureConfig(layout), fsImpl);
  if (!credentials.includes("auth.json")) writeText(path.join(resolvedDevHome, "auth.json"), "{}\n", fsImpl);
  writeText(path.join(resolvedDevHome, "installation_id"), "codex-plus-audit-fixture\n", fsImpl);
  writeJson(path.join(resolvedDevHome, "version.json"), { version: "fixture" }, fsImpl);
  writeText(path.join(resolvedDevHome, "history.jsonl"), "", fsImpl);

  return {
    mode: "fixture",
    devHome: resolvedDevHome,
    electronUserDataPath: resolvedElectronUserDataPath,
    workRoot: layout.workRoot,
    workspaces: layout,
    threads,
    files: [
      "state_5.sqlite",
      "sqlite/codex-dev.db",
      ".codex-global-state.json",
      "session_index.jsonl",
      "config.toml",
      "auth.json",
      "installation_id",
      "version.json",
      "history.jsonl",
    ],
    credentials,
    browserState: {
      userBubbleColors: FIXTURE_BROWSER_COLORS,
    },
    baseline,
    warning: "Using generated Codex home fixture for audit.",
  };
}

async function seedAuditFixtureBrowserState(cdp, fixture) {
  if (!fixture?.browserState) return null;
  const payload = JSON.stringify(fixture.browserState);
  return cdp.evaluate(`(() => {
    const state = ${payload};
    if (state.userBubbleColors) {
      localStorage.setItem("codex-plus:user-message-bubble-colors", JSON.stringify(state.userBubbleColors));
      window.dispatchEvent(new CustomEvent("codex-plus:user-message-bubble-colors-change", { detail: state.userBubbleColors }));
      window.CodexPlus?.plugins?.get?.("userBubbleColors")?.exports?.setVars?.();
    }
    const storedUserBubbleColors = JSON.parse(localStorage.getItem("codex-plus:user-message-bubble-colors") || "{}");
    const rootStyle = getComputedStyle(document.documentElement);
    const readback = {
      userBubbleColors: storedUserBubbleColors,
      userBubbleLightBg: rootStyle.getPropertyValue("--codex-plus-user-bubble-light-bg").trim(),
      userBubbleDarkBg: rootStyle.getPropertyValue("--codex-plus-user-bubble-dark-bg").trim(),
      userBubbleLightFg: rootStyle.getPropertyValue("--codex-plus-user-bubble-light-fg").trim(),
      userBubbleDarkFg: rootStyle.getPropertyValue("--codex-plus-user-bubble-dark-fg").trim(),
    };
    if (state.userBubbleColors) {
      for (const variant of ["light", "dark"]) {
        if (storedUserBubbleColors[variant] !== state.userBubbleColors[variant]) {
          throw new Error(\`Fixture user bubble \${variant} color did not persist: \${JSON.stringify(readback)}\`);
        }
        if (readback[\`userBubble\${variant[0].toUpperCase() + variant.slice(1)}Bg\`] !== state.userBubbleColors[variant]) {
          throw new Error(\`Fixture user bubble \${variant} CSS variable did not update: \${JSON.stringify(readback)}\`);
        }
      }
    }
    return { state, readback };
  })()`);
}

module.exports = {
  CREDENTIAL_FILES,
  FIXTURE_BROWSER_COLORS,
  buildAuditFixture,
  classifyDiscoveredHomeFiles,
  copyFixtureCredentials,
  createFixtureWorkspaces,
  createGlobalState,
  fixtureLayout,
  fixtureThreads,
  initializeEmptyHomeBaseline,
  seedStateDatabase,
  seedAuditFixtureBrowserState,
};
