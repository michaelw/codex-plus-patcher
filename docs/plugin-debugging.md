# Plugin Debugging

Use this workflow when changing Codex Plus plugins or patch injection points.
Transform tests are necessary, but runtime UI work is not done until the
patched app is launched and checked through DevTools.

## Side-By-Side Dev Launch

Apply patches to a workspace-local app under `work/`:

```sh
codex-plus-patcher apply \
  --mode dev \
  --patch-dir ./src/patches \
  --target "work/Codex Plus.app"
```

Sync a private development `CODEX_HOME` that shares the original worktrees:

```sh
codex-plus-patcher dev-sync
```

Launch the copied app with private Electron user data and a remote debugging
port:

```sh
codex-plus-patcher launch-dev \
  --target "work/Codex Plus.app" \
  --remote-debugging-port 9234
```

Open the DevTools target at `http://127.0.0.1:9234/json/list` and attach to the
page whose URL is `app://-/index.html`.

Dev mode intentionally shares real worktrees while keeping sqlite and Electron
user data private. Use it for plugin and UI validation, not for starting
concurrent turns or edits against the same checkout from both apps.

Production Codex and production Codex Plus cannot safely run side-by-side. Both
use the same default `~/.codex` state, including sqlite databases and their WAL
and lock files. When both apps open those databases, sqlite locking can prevent
startup or leave one app waiting on the other. The dev launch avoids that clash
by giving Codex Plus a private `CODEX_HOME` and Electron user data directory
while symlinking only `worktrees/` back to the original Codex home.

## Deterministic Plugin Audit

Run the reusable live audit before declaring plugin work complete:

```sh
codex-plus-patcher audit-plugins
```

The audit applies the current patch set to `work/Codex Plus.app`, syncs the
default dev home, launches with a remote debugging port, attaches to
`app://-/index.html`, and prints a human-readable progress summary by default.
It exits nonzero when any required built-in plugin probe fails.

Use JSON for automation:

```sh
codex-plus-patcher audit-plugins --json
```

Pass `--keep-open` to leave the workspace-local audit app running for manual
DevTools inspection after the probes finish.

## Live Proof Recipes

- Plugins: in the renderer target, check
  `window.CodexPlus.plugins.list().map((plugin) => plugin.id)` and confirm every
  built-in plugin is started.
- Commands: check `window.CodexPlus.ui.commands.commandMetadata()` for
  `codexPlusToggleSidebarNameBlur`, `codexPlus.focusProjectSelector`, and
  `codexPlusOpenDevTools`.
- Project colors: inspect sidebar project rows, child thread rows, the active
  thread, user bubbles, and the composer. Their computed
  `--codex-plus-project-accent` values should match for the selected project.
- Project selector: open the selector, type a fuzzy query such as `hdev`, and
  verify ranking, match highlights, and Enter-to-first-result.
- Sidebar blur: run
  `window.CodexPlus.commands.run("codexPlusToggleSidebarNameBlur")` and confirm
  sidebar project and chat names receive `filter: blur(4px)`.
- Mermaid fullscreen: render a Mermaid diagram, open the fullscreen viewer, and
  confirm the current `mermaid.core-*` asset loads.
- DevTools bridge: run
  `window.CodexPlus.native.request("devtools/open")` and confirm it resolves to
  `{ ok: true }`.
- Nested repositories: request nested repository targets through the worker
  bridge and confirm subrepositories appear in the Review pane.
- Dev sqlite isolation: confirm sqlite handles point under
  `work/codex-plus-dev-home`, and `worktrees/` inside the dev home is a symlink
  to the original Codex home.
- Startup cleanliness: after launch, the initial composer must be empty. Text
  left from a command search, such as `blur`, is a defect.

## Stable Hook Discovery

Start from the live UI and the patched ASAR, not from guesses. Inspect the DOM,
React props where visible, and the minified bundle around the rendered element.

Prefer hook points in this order:

1. Existing prop or object boundaries.
2. Stable data-attribute boundaries.
3. Generic host adapters such as `CodexPlus.ui.*`, `CodexPlus.commands.*`, and
   `CodexPlus.native.*`.
4. Narrow imports or requires that load readable runtime code.

Reject React compiler cache branches, cache sizes, and `t[...]` writes as hook
points unless there is no smaller current hook. If one is unavoidable, add a
test that proves the anchor fails closed and write down the reason near the
patch.
