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
- For version ports, use this order and restart at step 2 after any
  implementation change: (1) add the newest exact patch and explicitly owned
  transform variants; (2) run focused transform tests; (3) run
  `rtk node scripts/regression-sources.js --preflight-only --newest 1 --jsonl`; (4) run
  `rtk node scripts/regression-sources.js --newest 1 --jsonl` and inspect every newest
  screenshot; (5) run `rtk node scripts/regression-sources.js --preflight-only --jsonl`; (6)
  run `rtk node scripts/regression-sources.js --affected-since <base-commit> --auto-clean --jsonl`
  and inspect every selected contract. A version-only additive port selects only
  the new version; addition-only shared-transform hunks stay local only when
  every hunk is explicitly guarded by a newly registered transform owner. Audit or fixture changes add the newest supported source from
  each source family. Shared runtime, adapter, API, patch-engine, hook, existing
  registry, or unclassified application changes fail closed to every supported
  version. `--affected-since` cannot narrow preflight. If an old version fails,
  inspect the Git diff and transform ownership before touching its hook. When
  its owned code is unchanged, first suspect preflight, fixture, or audit changes.
  Source apps stay under the main
  checkout's `work/sources/`; generated output stays under the current
  worktree's `work/`.
- Agent-supervised regression commands must stream a steady flow of JSONL
  updates. Invoke the script directly through `rtk node`; `rtk npm run` buffers
  child output and is not suitable for long supervised runs. Active phases
  report at least every two seconds. Keep polling the running session so a
  failure can be investigated or the run can be interrupted promptly.
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
