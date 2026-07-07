# Coding Smoke Demo

This demo is intentionally small: one broken TypeScript function, one Vitest
test, and an aharness FSM that forces the same gates used for larger coding
migrations.

The fixture starts with a failing implementation:

- `fixture/src/math.ts` exports `add(a, b)`.
- `fixture/test/math.test.ts` expects `add(2, 3)` to return `5`.
- The model must plan, wait for owner approval, implement, run tests, repair on
  failure, and write a final report.

## Run It

From the repository root:

```bash
pnpm run build
node packages/core/dist/cli/main.js verify examples/coding-smoke.fsm.ts
node packages/core/dist/cli/main.js run examples/coding-smoke.fsm.ts
```

During the run, approve the plan when aharness asks for owner input. The model
should repair the fixture and run:

```bash
pnpm --dir ./examples/coding-smoke/fixture test
```

The final artifact is written to the run directory as
`artifacts/coding-smoke-report.md`.

## What To Look For

- The model cannot enter implementation until the owner selects the authored
  `Approve` choice.
- The test gate requires structured evidence: command, pass/fail status, and an
  output summary.
- A failed test routes through `repair` before another test attempt.
- The run is short enough for a live walkthrough, but the process shape is the
  same one you would use for a longer migration.
