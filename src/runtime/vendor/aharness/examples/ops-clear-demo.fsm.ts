import { createFsm } from '@aharness/core';

interface Data {
  secret: string | null;
  recalled: string | null;
}

const fsm = createFsm<Data>();

const renderReportMd = (data: Readonly<Data>): string =>
  [
    '# clearOnEntry smoke test',
    '',
    `- Original word (round 1): **${data.secret ?? '(none)'}**`,
    `- Model's post-clear guess (round 2): **${data.recalled ?? '(none)'}**`,
    '',
    'If the model could recall the round-1 word verbatim from its own memory,',
    'the wipe failed. If it had to ask the owner again, the wipe worked.',
    '',
  ].join('\n');

export default fsm.machine({
  id: 'clear-on-entry-demo',
  initial: 'say',
  data: () => ({
    secret: null,
    recalled: null,
  }),
  states: {
    say: fsm.state({
      mode: 'open',
      prompt:
        'Take the owner reply verbatim and submit it as `word`. Trim whitespace; lowercase is fine.',
      on: {
        submit: fsm.submit<{ word: string }>({
          to: 'forget',
          reduce: (draft, payload) => {
            draft.secret = payload.word;
          },
        }),
      },
    }),
    forget: fsm.state({
      mode: 'open',
      prompt:
        'Your context was just wiped via clearOnEntry. You have NO record of what the owner typed last round. ' +
        'Tell the owner one short sentence acknowledging the wipe, then ask them to retype the word so you can record it. ' +
        'Submit whatever they say verbatim as `recalled`.',
      clearOnEntry: true,
      on: {
        submit: fsm.submit<{ recalled: string }>({
          to: 'done',
          reduce: (draft, payload) => {
            draft.recalled = payload.recalled;
          },
        }),
      },
    }),
    done: fsm.final({
      outcome: 'success',
      artifacts: {
        'report.md': renderReportMd,
      },
    }),
  },
});
