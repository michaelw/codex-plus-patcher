# Aharness fork dependency

Codex Plus keeps authored FSM imports compatible with upstream aharness:

```ts
import { createFsm } from "@aharness/core";
import { startAharnessRun } from "@aharness/core/runtime";
```

The installed package is a Codex Plus-owned fork hosted in
`michaelw/aharness`. Until `@codex-plus/aharness-core@0.1.3-cpx.1` is
published to npm, this repository consumes the package tarball from the GitHub
release `aharness-core-v0.1.3-cpx.1` through the dependency key
`@aharness/core`.

The fork package metadata is:

```json
{
  "name": "@codex-plus/aharness-core",
  "version": "0.1.3-cpx.1"
}
```

After publishing the fork to npm, switch the dependency to the npm alias form:

```json
"@aharness/core": "npm:@codex-plus/aharness-core@0.1.3-cpx.1"
```

## Fork delta

The fork is based on upstream `@aharness/core@0.1.3`. Its delta is documented in
the fork repo at `packages/core/CODEX_PLUS_DELTA.md`.

Codex Plus must not string-patch `node_modules/@aharness/core` during runtime
asset packaging. The installed fork package should already contain the required
runtime behavior.

## Updating the fork

1. Rebase the fork on the target upstream aharness release.
2. Port or drop the Codex Plus delta depending on what upstream now contains.
3. Bump the fork version as `0.1.x-cpx.N`.
4. Run the fork tests in the local `michaelw/aharness` checkout.
5. Pack `packages/core`, publish a GitHub release tarball, and update the
   Codex Plus dependency URL.
6. Run Codex Plus aharness tests, `audit-plugins --plugin aharnessRuns`, and
   `npm run regression:sources -- --auto-clean`.
