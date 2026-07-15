# Host Adapter Migration Inventory

This inventory records the required host-capability fallbacks removed by the
strict `CodexPlusHost.adapters.*` migration. Explicit user-data error displays
and explicitly enabled development behavior are not capability fallbacks.

| Capability | Rejected shape | Introduction | Present at migration start | Final disposition |
| --- | --- | --- | --- | --- |
| Native IPC | `codexPlusNative.request` with `CodexPlusHost.nativeRequest` fallback | `7bff78bc` and predecessors | Yes | Removed; consumers require `adapters.native.request` |
| File opening | `CodexPlusNativeHooks.openFile` and optional `threadSidePanel.openFile` | Uncommitted 26.707.51957 port | Yes | Removed; every version binds `adapters.threadSidePanel.openFile` |
| Side-panel mount | App-shell, `aside`, tab-list, and tab-panel DOM discovery | `9226f0cc`; hardened by `4346da7f` | Yes | Removed; every version supplies `adapters.threadSidePanel.mount` |
| Context | Route/project aliases and DOM path attributes | `9226f0cc`, `ec458ba1`, and later ports | Yes | Removed; consumers use normalized `adapters.context.active` |
| Review context | DOM-derived `fallbackCwd` | `87b52f19` | Yes | Removed; Review requires the review and context adapters |
| Review body | `mainReviewContent` when the review adapter is absent | Ports including `9c1006ea` and `dcf6f34e` | Yes | Removed; raw output remains only for parse/data failure |
| Project selector | Custom scoring/highlight fallback when packaged `fzf` is absent | `9f9af3e1` | Yes | Removed; packaged `fzf` is required |
| UI hooks | Identity composer props, empty sidebar props, fabricated selector methods, missing-header `null` | Uncommitted 26.707.51957 port | Yes | Removed; required adapters are called directly |
| Path header | Mutation-observer DOM chip and displaced-native hiding | Uncommitted 26.707.51957 port | Yes | Removed; versioned native mounts render the header contribution |
| Commands | Plugin dispatch followed by native dispatch | `7bff78bc` and later audit hardening | Yes | Removed; palette execution uses one structured `adapters.commands.dispatch` result |
| Clipboard | `navigator.clipboard` followed by textarea/`execCommand` | `b3699d54` | Yes | Removed; consumers require `adapters.clipboard.writeText` |
| Deep routing | Native/protocol redirect fallback chain | Existing app-protocol patch lineage | Yes | Removed; consumers require `adapters.routing.openDeepRoute` |
| Malformed diff | Explicit raw diff with diagnostic | Review feature lineage | Yes | Retained only for actual parse/data failure |
| Statsig development | Development startup substitution | Current dev-mode patch lineage | Configured only | Retained only under `devModeStatsigFallback === true` and audited |

The migration started with 15 supported patch sets and 10 cached live sources.
`release:intake` acquired the five missing originals: `26.623.31921`,
`26.616.81150`, `26.616.71553`, `26.616.51431`, and `26.616.41845`. Final live
acceptance therefore covered all 15 patch sets.

The July port added four exact identities without changing the adapter
manifest:

| Version | Build | Source ASAR SHA-256 |
| --- | ---: | --- |
| 26.707.72221 | 5307 | `b5da51e5df6e996076e4cb19045cec46dd4c08cf61c19cdbc5cb426b8413b73c` |
| 26.707.71524 | 5263 | `d28f31b4bbb04c519be65c2af8277d8c5faf77b4239ee89b928f0a7423dacd84` |
| 26.707.62119 | 5211 | `165db3a1d32009724fcb91427a73926fe8de2a1e24141d5f1e24951d120424f7` |
| 26.707.61608 | 5200 | `7cd7f277d4d4b6221eb2121fd36d2238c28f203875c62f8abd36f3f12898cb86` |

## Action log

- Inventoried the dirty worktree, registered versions, source cache, adapter
  consumers, native globals, optional adapter access, DOM substitutes, and
  fallback provenance before changing the architecture.
- Added one frozen required-method manifest, path-specific preflight failures,
  scoped architecture lint, negative fixtures, and a generated 15-version
  adapter matrix with transformed-ASAR readback.
- Bound native IPC, commands, canonical context, file opening, side-panel
  mounts, Review, project selection, sidebar, composer, header, clipboard, and
  routing through the stable adapter contract on every version.
- Removed `CodexPlusNativeHooks`, `codexPlusNative`, required optional adapter
  access, DOM-derived required context, identity/no-op adapter defaults,
  consumer-side native substitutes, browser clipboard fallback, protocol route
  fallback, and custom project-selector scoring.
- Ported 26.707.51957 file opening through its native mutation and
  `openInSidePanel` seam while preserving the shared `openFile(filePath,
  options)` contract and explicit native errors.
- Moved the project path contribution to the actual versioned action slot.
  Live DOM geometry identified and removed duplicate or displaced mounts; the
  final contract requires exactly one chip immediately before `Open in`.
- Fixed project selector producers version by version using their controlled
  native open state. Runtime inspection corrected React namespace bindings and
  early-return placement without adding a consumer fallback.
- Bound Review's native `gitRequest`, `pathValue`, parser, and DiffCard
  dependencies; added controlled nested disclosure state; required populated
  nested branch data before opening; and retained raw diff only for actual
  malformed data.
- Added live adapter-only proofs for file opening, canonical context, Review,
  native and plugin command dispatch, selector matching, IPC errors, clipboard
  errors, unsupported routes, and required-capability failures.
- Corrected audit-only failures where trusted Command-. input, changing thread
  age text, project-root versus worktree cwd, and Branch versus Unstaged fixture
  state had been mistaken for product regressions.
- Fixed 26.616.71553's startup failure, `SyntaxError: Identifier 'f' has already
  been declared`. The selector injection now ends the surrounding minified
  declaration before installing the controlled open handler. A focused test
  rejects the declaration-collision shape and the real transformed module
  passes a module syntax check.
- Fixed a transient final-sweep `ENOTEMPTY` cleanup failure by using bounded
  filesystem retries. A focused test requires the native retry options.
- Ran `npm test` (309 passing), `npm run check`, package dry-run, and
  `git diff --check`. Then ran 26.707.51957 first, restarted from newest after
  fixes, and completed the full newest-first sweep with 15 of 15 versions
  passing and no audit failures.
- Read back every final `contract.json` and `audit-summary.json`. Every version
  recorded successful nested disclosure interaction, two nested DiffCards, a
  selected command result, a visible General settings page, and zero failures.
- Manually inspected all 60 final screenshots. Each is 1280 by 820 pixels and
  shows fully painted application-controlled regions, one correctly placed
  path chip, main and nested Review content, the command result, and complete
  Settings. Final evidence is under
  `work/regression/contracts/2026-07-14T15-21-35-591Z/`.
- Ported 26.707.72221, 26.707.71524, 26.707.62119, and 26.707.61608 from their
  real ASARs. The two July builds use the newer `src-HagpvBpE.js` Electron
  family; each patch keeps its moved chunk names and single-match anchors in
  the versioned producer.
- Kept the required adapter manifest unchanged. Version-specific producers
  bind the moved selector, composer, title, Review, command, and native seams;
  no consumer fallback or broadened old anchor was added.
- Fixed 26.707.62119's missing composer surface binding, wrong Review parser
  alias, and plugin-command metadata being passed through the native FormatJS
  command list. Focused tests now cover each exact producer shape.
- Fixed 26.707.61608's selector transform returning unchanged, wrong title
  React namespace, wrong Review parser (`Ci` instead of native `hg`), native
  FormatJS command collision, and missing exact composer primitive chunk.
- Validated the transforms in registered execution order. This caught a
  command-palette transform that passed alone but failed after the earlier
  native-dispatch transform had modified the same module.
- Restarted 26.707.72221 after every shared-code fix. Final focused evidence is
  under `work/regression/contracts/2026-07-15T01-16-49-799Z/` (72221),
  `2026-07-15T01-23-17-852Z/` (71524),
  `2026-07-15T01-27-05-972Z/` (62119), and
  `2026-07-15T01-19-57-664Z/` (61608).
- Ran the complete 19-version newest-first live sweep with generated fixtures.
  All 19 versions passed with zero failures or skips. Readback confirmed every
  plugin audit, nested branch preload, two nested DiffCards, command action,
  and Settings capture. Manual inspection accepted all 76 fully painted final
  screenshots. Final evidence is under
  `work/regression/contracts/2026-07-15T01-34-46-812Z/`.

## Process improvements

- Parse every transformed real module before signing or launching it. This
  catches invalid minified declaration boundaries before an expensive GUI run.
- Emit compact saved per-version summaries and a generated screenshot review
  index, instead of depending on verbose terminal output.
- Keep cleanup retries centralized and bounded so transient filesystem races do
  not force a full sweep restart.
- Run real-source transformed-module syntax checks, adapter matrix readback,
  architecture lint, negative fixtures, live probes, raster-region checks, and
  manual review as separate layers so each failure has a precise owner.
- Require every expected transform to insert its version marker. A no-throw
  transform that returns unchanged is not a successful port.
- Test version transforms both alone and in registered execution order so
  overlapping exact edits cannot invalidate a later producer unnoticed.
- Record the native role of every minified symbol from its call sites before
  binding it. This would have prevented the 61608 `Ci`/`hg` parser mistake.
- Cache copied and signed regression targets by source ASAR plus patch digest.
  This can shorten focused iteration without reusing evidence after code
  changes.
- Preserve failed `audit-summary.json` diagnostics even when auto-clean removes
  a failed visual-contract directory, so triage does not depend on truncated
  terminal output.
