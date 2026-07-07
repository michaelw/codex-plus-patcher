# Agent Guide

This repo ships patch source only. Never commit `Codex.app`, generated
`Codex Plus.app` bundles, or release artifacts.

- Do not commit `work/`, `outputs/`, `.codex-plus-cache/`, `.app` bundles,
  caches, npm logs, or generated package/release output.
- Keep patch sets fail-closed by exact Codex version, bundle version, and
  original `app.asar` SHA-256.
- Prefer adding a new versioned patch file over weakening anchors or broadening
  matching.
- For plugin or patch injection work, read `docs/plugin-architecture.md` before
  editing and follow its layering rules: feature behavior belongs in readable
  runtime/plugin or host adapter code, while minified transforms should only
  install small extension points.
- Use `docs/plugin-debugging.md` for the side-by-side dev launch and live proof
  workflow. Transform tests and ASAR readback are not enough for UI/plugin
  changes that depend on runtime mount points.
- For repeat UI regressions, use a TDD loop: first add or tighten a plugin
  audit or focused test that fails on the current supported Codex version,
  then check an earlier cached version when available, and only then patch the
  runtime or transform.
- Use `npm run release:intake` before manually downloading mirror assets for a
  new Codex port. Store original apps only under the main checkout's ignored
  `work/sources/` tree.
- For version ports, run `npm run regression:sources -- --newest 1 --jsonl`
  first, inspect the default visual contract under
  `work/regression/contracts/<timestamp>/<version>/`, then run
  `npm run regression:sources -- --auto-clean` for the full cached-source
  sweep. Source apps stay under the main checkout's `work/sources/`; generated
  regression output and contracts stay under the current worktree's `work/`.
- Automated plugin audits use generated Codex home fixtures by default. Use
  `--use-live-source-home` or `--source-home <path>` only for manual live-state
  debugging, not as the normal regression path.
- Validate real patch application against a workspace-local target under
  `work/`, not the user's real app target.
- Do not commit downloaded zips, extracted original apps, or generated
  `work/sources/*/source.json` metadata unless explicitly requested.
- Before creating, updating, or pushing a PR, run `npm run check:pr`. If the PR
  does not exist yet, pass the intended title with
  `npm run check:pr -- --title "feat: ..."`. Before marking ready or enabling
  automerge, run `npm run check:pr -- --strict-worktree`. For issue-closing PRs,
  pass `--issue <number>` or include `Closes #<number>` in the PR body. For
  automerge, use `npm run pr:automerge -- --dry-run <pr-number-or-url>` and then
  `npm run pr:automerge -- <pr-number-or-url>`.
- Run these before commits:

```sh
npm test
npm run check
npm --cache /private/tmp/codex-plus-npm-cache pack --dry-run --json
```
