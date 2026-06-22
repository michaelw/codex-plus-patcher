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
- `tests/*` covers CLI behavior, patch selection, and shared parser logic.

## Common Commands

Install dependencies and link the local CLI:

```sh
rtk npm install
rtk npm link
rtk codex-plus-patcher --help
```

Run the source checks used before commits:

```sh
rtk npm test
rtk npm run check
rtk npm --cache /private/tmp/codex-plus-npm-cache pack --dry-run --json
```

Dry-run patch selection against the installed Codex app:

```sh
rtk codex-plus-patcher apply --mode dev --patch-dir ./src/patches --dry-run --json
```

Apply to a workspace-local app target:

```sh
rtk codex-plus-patcher apply \
  --mode dev \
  --patch-dir ./src/patches \
  --target "work/Codex Plus <version>.app"
```

Verify signing on the generated workspace app:

```sh
rtk codesign --verify --deep --strict "work/Codex Plus <version>.app"
```

Read back the patched ASAR SHA and inspect markers:

```sh
rtk shasum -a 256 "work/Codex Plus <version>.app/Contents/Resources/app.asar"
rtk node -e 'const { readAsar, walkFiles } = require("./src/core/asar"); const archive = readAsar("work/Codex Plus <version>.app/Contents/Resources/app.asar"); console.log(walkFiles(archive.header).map(([file]) => file).filter((file) => file.includes("webview/assets/")).join("\n"));'
```

Use the ASAR readback to confirm the expected chunk names and patch markers
exist in the generated target before testing the app manually.

## Porting A New Codex Version

1. Install the new `Codex.app`.
2. Read the app identity:

   ```sh
   rtk /usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' /Applications/Codex.app/Contents/Info.plist
   rtk /usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' /Applications/Codex.app/Contents/Info.plist
   rtk shasum -a 256 /Applications/Codex.app/Contents/Resources/app.asar
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
9. If a patch is added, removed, or renamed, update the README patch summary
   and verify the About dialog still reports the applied patch IDs from the
   patch queue.
10. Run the dry-run, full workspace apply, codesign verification, and ASAR
   marker/readback checks from the common commands section.

Prefer copying a patch set and tightening it to the new build over making an
older patch less strict.

## Release And Package Checks

Before publishing or attaching release assets, run:

```sh
rtk npm --cache /private/tmp/codex-plus-npm-cache pack --dry-run --json
```

Confirm the package includes only intended source files, README, and package
metadata. It must not include generated apps, `work/`, `outputs/`,
`.codex-plus-cache/`, npm logs, or local release artifacts.

## Git Hygiene

- Commit source-only changes.
- Keep generated app bundles and local validation output ignored.
- For patch ports, prefer one commit for the new versioned patch and registry
  updates, and a separate commit for unrelated documentation or cleanup.
- Do not mix generated artifacts with patch source in the same commit.
