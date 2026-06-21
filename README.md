# Codex Plus Patcher

`codex-plus-patcher` creates a local `Codex Plus.app` from an installed `Codex.app` by applying version-checked ASAR patch queues. It does not ship `Codex.app` or any OpenAI app binaries.

## Purpose

Codex Plus is an experimental local demonstrator for changes that can be layered onto an installed Codex desktop app without redistributing the app itself. The patcher is meant for technically curious users who want to inspect, test, or iterate on small binary patch sets against their own local copy.

The current built-in patches rename the copied app, add patch provenance to the About dialog, expose nested repositories in the Review pane, and add diagnostic detail for selected app-shell errors.

## How It Works

The patcher reads the installed `Codex.app`, verifies the exact Codex version, bundle version, and original `Contents/Resources/app.asar` SHA-256, then selects the matching patch queue. Unsupported app versions fail closed so a patch written for one bundle is not applied to a different bundle by accident.

When applying patches, the tool copies `Codex.app` to the target `Codex Plus.app`, rewrites selected packed ASAR files with ordered text transforms, updates bundle metadata such as the app name and identifier, refreshes Electron ASAR integrity metadata, and signs the copied app ad hoc. The source app is not modified.

## Disclaimer

**Disclaimer of Warranty and Limitation of Liability**

THIS SOFTWARE IS PROVIDED "AS IS," WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED. This is a modified, binary-patched demonstrator provided strictly for experimental or demonstration purposes.

The upstream developers, contributors, and maintainers assume NO responsibility or liability for any errors, malfunctions, data loss, or damages—including consequential or incidental damages—arising from the installation or use of this patched version. You use, test, or distribute this patched app at your sole and absolute risk.

The original authors and upstream suppliers are under no obligation to provide support, updates, fixes, or assistance with any issues, mess, or conflicts caused by this modified build.

## Usage

Install the CLI:

```bash
npm install -g codex-plus-patcher
```

Or run it without a global install:

```bash
npx codex-plus-patcher apply
```

Show help:

```bash
codex-plus-patcher
```

Apply built-in patches with defaults:

```bash
codex-plus-patcher apply
```

By default this reads `/Applications/Codex.app` and creates `~/Applications/Codex Plus.app`.

Validate the installed Codex version without copying or signing:

```bash
codex-plus-patcher apply --dry-run
```

Apply a local development patch queue:

```bash
codex-plus-patcher apply --mode dev --patch-dir ./src/patches --target "./work/Codex Plus.app"
```

Apply patches from a GitHub release asset:

```bash
codex-plus-patcher apply \
  --mode release \
  --github-repo OWNER/REPO
```

Print the machine-readable result:

```bash
codex-plus-patcher apply --dry-run --json
```

For local development of the CLI wrapper:

```bash
npm link
codex-plus-patcher --help
```

## Patch Format

Patch queues export `patchSets` from `index.js`. Each patch set declares:

- exact Codex version, bundle version, and original `app.asar` SHA-256
- an ordered `patches` array with stable patch IDs
- optional bundle metadata updates for the copied app
- ordered file transforms applied to packed ASAR files

Unsupported app versions fail closed.

## Development

```bash
npm test
npm run check
npm pack --dry-run
```

Business logic that can be tested outside Codex lives under `src/plus/`. The current nested repository TOML parser is shared by tests and the injected worker patch source.

## Porting Patches To A New Codex Version

1. Install the new `Codex.app`.
2. Record `CFBundleShortVersionString`, `CFBundleVersion`, and raw `Contents/Resources/app.asar` SHA-256.
3. Copy the closest existing patch set in `src/patches/`.
4. Update target chunk filenames and fail-closed anchor strings by inspecting the new ASAR.
5. Run `npm test`, `npm run check`, and a dry run.
6. Apply the patch to a copied app and verify `codesign --verify --deep --strict`.
7. Launch manually and validate Review pane nested repository behavior.

## Update Hook Direction

The update hook should be implemented as a separate patch in the queue. V1 should detect Codex update completion, check GitHub Releases for a matching patch bundle, and offer to repatch `Codex Plus.app`. Silent auto-apply should be avoided until patch availability and signing failures are handled reliably.
