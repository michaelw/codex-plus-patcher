# Agent Guide

This repo ships patch source only. Never commit `Codex.app`, generated
`Codex Plus.app` bundles, or release artifacts.

- Do not commit `work/`, `outputs/`, `.codex-plus-cache/`, `.app` bundles,
  caches, npm logs, or generated package/release output.
- Keep patch sets fail-closed by exact Codex version, bundle version, and
  original `app.asar` SHA-256.
- Prefer adding a new versioned patch file over weakening anchors or broadening
  matching.
- Validate real patch application against a workspace-local target under
  `work/`, not the user's real app target.
- Run these before commits:

```sh
rtk npm test
rtk npm run check
rtk npm --cache /private/tmp/codex-plus-npm-cache pack --dry-run --json
```
