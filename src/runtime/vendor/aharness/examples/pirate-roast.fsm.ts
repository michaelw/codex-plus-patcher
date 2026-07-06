import { createFsm } from '@aharness/core';

interface Data {
  deed: string | null;
  verdict: string | null;
}

const fsm = createFsm<Data>();

const renderVerdictMd = (data: Readonly<Data>): string =>
  [
    '# Pirate Verdict',
    '',
    '## The Deed',
    '',
    data.deed ?? '(no deed recorded)',
    '',
    '## Captain Saltbeard rules',
    '',
    data.verdict ?? '(no verdict recorded)',
    '',
  ].join('\n');

export default fsm.machine({
  id: 'pirate-roast',
  initial: 'confess',
  data: () => ({
    deed: null,
    verdict: null,
  }),
  states: {
    confess: fsm.state({
      mode: 'open',
      skills: [fsm.skill.path('./skills/pirate-mode/SKILL.md')],
      prompt:
        'Adopt the pirate persona from the loaded skill immediately. ' +
        'Greet the owner in-character (one short sentence) so they can see the persona is live. ' +
        "Then submit a one-line recap of the owner's reply under `deed` — keep the recap " +
        'plain (no pirate accent in the recap field, just the facts).',
      on: {
        submit: fsm.submit<{ deed: string }>({
          to: 'verdict',
          reduce: (draft, payload) => {
            draft.deed = payload.deed;
          },
        }),
      },
    }),
    verdict: fsm.state({
      prompt: (data) =>
        `The owner confessed: "${data.deed ?? '(unknown)'}". ` +
        'Stay in pirate persona. Write a 3-sentence ribbing of the deed — boisterous, ' +
        'fond, never mean — using at least one nautical metaphor. Submit the full text ' +
        'under `verdict` (pirate accent IS expected in this field).',
      on: {
        submit: fsm.submit<{ verdict: string }>({
          to: 'done',
          reduce: (draft, payload) => {
            draft.verdict = payload.verdict;
          },
        }),
      },
    }),
    done: fsm.final({
      outcome: 'success',
      artifacts: {
        'pirate-verdict.md': renderVerdictMd,
      },
    }),
  },
});
