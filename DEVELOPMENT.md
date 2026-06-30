# Development

`codex-plus-patcher` is a source-only package for applying version-checked ASAR
patch sets to a local copy of Codex. Generated apps and release artifacts should
stay outside commits.

## Project Layout

- `src/cli.js` parses CLI flags and loads built-in, development, or release
  patch sets.
- `src/core/*` contains ASAR, plist, release, and patch application logic.
- `src/plus/*` contains code shared by tests and injected patch helpers.
- `src/patches/*` contains versioned patch sets and the patch registry.
- `src/runtime/*` contains the readable Codex Plus runtime and built-in plugin
  assets that are added to generated apps under `webview/assets/codex-plus/`.
- `tests/*` covers CLI behavior, patch selection, and shared parser logic.

## Common Commands

Install dependencies and link the local CLI:

```sh
npm install
npm link
codex-plus-patcher --help
```

Run the source checks used before commits:

```sh
npm test
npm run check
npm --cache /private/tmp/codex-plus-npm-cache pack --dry-run --json
```

Dry-run patch selection against the installed Codex app:

```sh
codex-plus-patcher apply --mode dev --patch-dir ./src/patches --dry-run --json
```

Apply to a workspace-local app target:

```sh
codex-plus-patcher apply \
  --mode dev \
  --patch-dir ./src/patches \
  --target "work/Codex Plus <version>.app"
```

Verify signing on the generated workspace app:

```sh
codesign --verify --deep --strict "work/Codex Plus <version>.app"
```

Read back the patched ASAR SHA and inspect markers:

```sh
shasum -a 256 "work/Codex Plus <version>.app/Contents/Resources/app.asar"
codex-plus-patcher asar-list \
  --asar "work/Codex Plus <version>.app/Contents/Resources/app.asar" \
  --contains "webview/assets/codex-plus/"
codex-plus-patcher asar-cat \
  --asar "work/Codex Plus <version>.app/Contents/Resources/app.asar" \
  --file "webview/assets/codex-plus/plugins/nestedRepositories.js"
```

Use the ASAR readback to confirm the expected chunk names, patch markers, and
`webview/assets/codex-plus/runtime.js` plugin assets exist in the generated
target before testing the app manually. Prefer the built-in `asar-list` and
`asar-cat` commands over ad hoc imports from external ASAR packages. Use them
after workspace-local app applies, when confirming runtime/plugin assets were
inserted, when checking patched chunks contain host hooks, and when verifying
moved feature bodies are no longer inside versioned chunks.

## Runtime Diagnostics

Generated Codex Plus apps expose **View > Open Developer Tools**. Use DevTools
to inspect runtime plugin loading, console errors, and `window.CodexPlus` when
diagnosing app-only behavior that tests or ASAR readback cannot prove.
For the full side-by-side dev launch, remote debugging port, and live proof
workflow, follow `docs/plugin-debugging.md`.

For native menu issues, launch the workspace app with menu diagnostics enabled:

```sh
CODEX_PLUS_MENU_DIAGNOSTICS=1 \
  "work/Codex Plus <version>.app/Contents/MacOS/Codex"
```

You can also inspect a generated ASAR for menu-related patch markers:

```sh
codex-plus-patcher menu-diagnostics \
  --asar "work/Codex Plus <version>.app/Contents/Resources/app.asar"
```

## Runtime Plugin Shape

Prefer new user-facing additions as readable runtime plugins backed by generic
interfaces. Add or extend a `CodexPlus` surface first, then hook that surface
into Codex core with the smallest versioned patch needed.

Keep host hooks small, fail-closed, and reusable across more than one plugin or
feature when practical. Avoid putting large feature bodies directly into
minified bundle transforms if a runtime/plugin interface can carry the behavior.
For the required layer boundaries, glue-size limits, and forbidden minified
patch shapes, follow `docs/plugin-architecture.md` before editing plugin or
patch injection code.

## Porting A New Codex Version

1. Intake the new mirror release:

   ```sh
   npm run release:intake
   ```

   To intake an older version or a non-default architecture, pass the release
   tag or asset name:

   ```sh
   npm run release:intake -- --tag codex-app-26.623.61825
   npm run release:intake -- --asset Codex-darwin-x64-26.623.61825.zip
   npm run release:intake -- --newest 3
   ```

   The script downloads the selected zip from `Wangnov/codex-app-mirror`,
   verifies it against `SHA256SUMS-macos.txt` or `SHA256SUMS.txt`, and stores
   the original app under the main checkout's ignored
   `work/sources/<version>/Codex.app`, even when run from a git worktree.
   It also writes `work/sources/<version>/source.json` with the verified zip
   hash, bundle version, and source `app.asar` hash.
2. Use the intaken source app for patch dry-runs and workspace-local applies:

   ```sh
   codex-plus-patcher apply \
     --mode dev \
     --patch-dir ./src/patches \
     --source "work/sources/<version>/Codex.app" \
     --dry-run \
     --json
   ```

3. Inspect ASAR chunk names with `readAsar` and `walkFiles` from
   `src/core/asar.js`.
4. Check each anchor count in the new chunks before editing transforms. Anchors
   should still match exactly once.
5. Copy the closest existing `src/patches/<codex-version>-<bundle>.js` file.
6. Update `id`, `codexVersion`, `bundleVersion`, and `asarSha256` in the new
   patch file.
7. Register the new patch in `src/patches/index.js`, with the newest supported
   patch set first.
8. Update `npm run check` in `package.json` if it names patch files explicitly.
9. If a patch or runtime plugin is added, removed, or renamed, update the
   README patch summary. Also verify the About dialog still reports the applied patch IDs.
10. Run the dry-run, full workspace apply, codesign verification, and ASAR
   marker/readback checks from the common commands section.

Prefer copying a patch set and tightening it to the new build over making an
older patch less strict.

## Regression From Cached Sources

After intaking mirror releases, audit every supported cached source app:

```sh
npm run regression:sources
```

The runner scans the main checkout's ignored `work/sources/*/Codex.app`,
matches each source against the registered patch sets, applies supported
versions to isolated targets under `work/regression/sources/<version>/`, and
runs the live plugin audit sequentially. Narrow the run with a case-insensitive
filter or limit the run to the newest cached sources:

```sh
npm run regression:sources -- --filter 61825
npm run regression:sources -- --newest 2
```

Use `--auto-clean` to remove each generated regression directory after its
audit finishes, or run cleanup only:

```sh
npm run regression:sources -- --auto-clean
npm run regression:sources -- --clean
npm run regression:sources -- --clean --filter 61825
```

Cleanup only removes generated output under `work/regression/sources/`; it must
not remove the original app cache under `work/sources/`.

Plugin audits and source regressions create a generated Codex home fixture by
default. The fixture seeds synthetic projects, threads, project assignments,
nested repositories, pinned/projectless sidebar state, and appearance state
under the audit or regression output directory. It does not copy or rewrite the
user's real `~/.codex` databases; it may copy only `auth.json` from
`--source-home` so the app mounts the signed-in shell. For manual live-state
debugging only, pass `--use-live-source-home` or an explicit
`--source-home <path>`.

The generated fixture and `audit-plugins` probes must cover the plugin
regressions that have broken in real ports:

- Review panel nested repositories render immediately after opening Review,
  before selecting `Unstaged` or changing the main branch selector.
- Nested repository branch selectors open and are populated with branch choices.
- Nested repository diffs keep host syntax highlighting.
- User bubble colors remain legible with both a light color such as `#e0218a`
  and a dark color.
- Synthetic fixture threads do not trigger backend "unknown thread" errors.
- At least ten projects are present so project color assignment is exercised
  beyond the first few palette entries.
- Pinned threads inherit the color of their project.
- Project chats have stable colors based on their project identity.
- `regression:sources --json` includes each failing audit probe's detailed
  fields, not only the summarized plugin failure message.

## Release And Package Checks

Before publishing or attaching release assets, run:

```sh
npm --cache /private/tmp/codex-plus-npm-cache pack --dry-run --json
```

Confirm the package includes only intended source files, README, and package
metadata. It must not include generated apps, `work/`, `outputs/`,
`.codex-plus-cache/`, npm logs, or local release artifacts.

## Git Hygiene

- Use semantic commit messages such as `feat: ...`, `fix: ...`, or
  `docs: ...`; release-please uses them to decide which changes belong in the
  generated release. Use the same format for PR titles when squash-merging,
  because GitHub uses the PR title as the squash commit subject.
- GitHub validates PR titles with `amannn/action-semantic-pull-request`.
  Do not enable automerge while the title has a non-semantic prefix such as
  `[codex]`; release-please reads the final squash commit title on `main`.
- When a PR should close a tracked issue, include a GitHub closing keyword such
  as `Closes #123` in the PR body so the issue closes automatically when the PR
  merges.
- Before creating, updating, or pushing a PR, run:

  ```sh
  npm run check:pr
  ```

  If the PR does not exist yet, pass the intended title:

  ```sh
  npm run check:pr -- --title "feat: add project selector shortcut"
  ```

- Before marking a PR ready or enabling automerge, include the clean-worktree
  gate:

  ```sh
  npm run check:pr -- --strict-worktree
  ```

- For PRs that should close a tracked issue, pass the issue explicitly:

  ```sh
  npm run check:pr -- --issue 123
  ```

- Use the guarded automerge npm script so the squash subject is the current PR
  title and the merge is pinned to the inspected head commit:

  ```sh
  npm run pr:automerge -- --dry-run <pr-number-or-url>
  npm run pr:automerge -- <pr-number-or-url>
  ```

  It runs `gh pr merge --auto --squash --subject "$title" --body "" \
  --match-head-commit "$headRefOid"` after confirming the current PR title is a
  Conventional Commit title.
- Commit source-only changes.
- Keep generated app bundles and local validation output ignored.
- For patch ports, prefer one commit for the new versioned patch and registry
  updates, and a separate commit for unrelated documentation or cleanup.
- Do not mix generated artifacts with patch source in the same commit.
