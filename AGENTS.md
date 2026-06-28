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
- Validate real patch application against a workspace-local target under
  `work/`, not the user's real app target.
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
