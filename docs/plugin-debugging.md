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

Sync a private development `CODEX_HOME` that snapshots thread sqlite state and
shares the original worktrees and sessions:

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

`launch-dev` also gives the copied bundle a dev-only app identity by default
(`com.openai.codex-plus.dev`). Use `--dev-instance-id <id>` when running more
than one workspace-local copy at the same time. This is the preferred
lightweight sandbox for plugin work: private sqlite state, private Electron
user data, a separate remote debugging port, and a distinct macOS app identity
without needing a VM.

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
while symlinking `worktrees/` and `sessions/` back to the original Codex home.

## Deterministic Plugin Audit

Run the reusable live audit before declaring plugin work complete:

```sh
codex-plus-patcher audit-plugins
```

The audit applies the current patch set to `work/Codex Plus.app`, syncs the
default dev home, launches with a remote debugging port, attaches to
`app://-/index.html`, and prints human-readable progress by default. On a TTY,
spinners show the active major phase while completed phases remain as stable
lines. Patch application includes its apply steps and names the selected patch
set and patches; probing names the plugins being checked. Redirected progress
uses timestamped plain lines without terminal control sequences.
It exits nonzero when any required built-in plugin probe fails.
Audit launches use the dev-only `com.openai.codex-plus.audit` bundle identity
by default so they do not compete with a kept-open manual dev copy.

Use compact JSONL progress for long-running audits and agent supervision:

```sh
codex-plus-patcher audit-plugins --jsonl
```

In this mode stdout contains JSONL only, including failures. Active work emits
a low-noise status record at least every two seconds with its phase, elapsed
time, and current patch or plugin context when known. There are no spinners or
other terminal adornments. The last record is a compact `summary`.

Add `--json` when you need the full final result and detailed post-failure
probe data:

```sh
codex-plus-patcher audit-plugins --json
```

This keeps human progress and prints the detailed JSON result at the end. It
can also be combined with `--jsonl`; in that case the final line is a JSONL
`result` record containing the detailed result:

```sh
codex-plus-patcher audit-plugins --jsonl --json
```

Plugin audits write a visual contract by default under
`work/audit-plugins/<timestamp>-<version>/`, including `contract.json`,
`audit-summary.json`, and screenshots for shell/sidebar, Review,
command-palette dispatch, and Settings. Pass `--no-visual-contract` only when
that proof is deliberately unnecessary.

Pass `--keep-open` to leave the workspace-local audit app running for manual
DevTools inspection after the probes finish. The default audit avoids opening
extra native windows so the app remains usable after a keep-open run. Use
`--include-native-open-probes` when you specifically want the audit to open
DevTools and a Mermaid viewer window as part of the live probes.

For a manual checkpoint, use `audit-plugins --manual`. Manual mode skips the
probes, keeps the app open, and still prepares the generated fixture. Do not
use a `dev-sync` live-state launch for regression review unless live source
state was explicitly requested.

When an audit app is already open, attach instead of relaunching:

```sh
codex-plus-patcher audit-plugins --no-apply --no-launch --port 9234
```

If a true clean-room check is needed, use a VM or separate macOS user account,
but that is heavier than the normal dev workflow and should not be necessary for
ordinary plugin validation.

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
  `work/codex-plus-dev-home`, both `state_5.sqlite` and
  `sqlite/state_5.sqlite` are snapshots when present, and `worktrees/` plus
  `sessions/` inside the dev home are symlinks to the original Codex home.
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
