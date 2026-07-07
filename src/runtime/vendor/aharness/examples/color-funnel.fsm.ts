import { createFsm } from '@aharness/core';

type Color = 'red' | 'green' | 'blue' | 'yellow';

interface Data {
  color: Color | null;
  fruit: string | null;
  reason: string | null;
}

const fsm = createFsm<Data>();

const renderResultMd = (data: Readonly<Data>): string =>
  [
    '# Color Funnel Result',
    '',
    `- Color: ${data.color ?? '(none)'}`,
    `- Fruit: ${data.fruit ?? '(none)'}`,
    '',
    '## Why this fruit',
    '',
    data.reason ?? '(none)',
    '',
  ].join('\n');

export default fsm.machine({
  id: 'color-funnel',
  initial: 'pickColor',
  data: () => ({
    color: null,
    fruit: null,
    reason: null,
  }),
  states: {
    pickColor: fsm.choice({
      question: 'Pick a color.',
      options: [
        { label: 'red', to: 'redFruit' },
        { label: 'green', to: 'greenFruit' },
        { label: 'blue', to: 'blueFruit' },
        { label: 'yellow', to: 'yellowFruit' },
      ],
    }),
    redFruit: fsm.state({
      prompt:
        'Pick one specific real-world fruit whose typical exterior is red. Submit the fruit name and one-sentence reason.',
      on: {
        submit: fsm.submit<{ fruit: string; reason: string }>({
          to: 'confirm',
          reduce: (draft, payload) => {
            draft.color = 'red';
            draft.fruit = payload.fruit;
            draft.reason = payload.reason;
          },
        }),
      },
    }),
    greenFruit: fsm.state({
      prompt:
        'Pick one specific real-world fruit whose typical exterior is green. Submit the fruit name and one-sentence reason.',
      on: {
        submit: fsm.submit<{ fruit: string; reason: string }>({
          to: 'confirm',
          reduce: (draft, payload) => {
            draft.color = 'green';
            draft.fruit = payload.fruit;
            draft.reason = payload.reason;
          },
        }),
      },
    }),
    blueFruit: fsm.state({
      prompt:
        'Pick one specific real-world fruit whose typical exterior is blue or blue-purple. Submit the fruit name and one-sentence reason.',
      on: {
        submit: fsm.submit<{ fruit: string; reason: string }>({
          to: 'confirm',
          reduce: (draft, payload) => {
            draft.color = 'blue';
            draft.fruit = payload.fruit;
            draft.reason = payload.reason;
          },
        }),
      },
    }),
    yellowFruit: fsm.state({
      prompt:
        'Pick one specific real-world fruit whose typical exterior is yellow. Submit the fruit name and one-sentence reason.',
      on: {
        submit: fsm.submit<{ fruit: string; reason: string }>({
          to: 'confirm',
          reduce: (draft, payload) => {
            draft.color = 'yellow';
            draft.fruit = payload.fruit;
            draft.reason = payload.reason;
          },
        }),
      },
    }),
    confirm: fsm.choice({
      question: (data) => `Suggested fruit: ${data.fruit ?? '(none)'}. Want this one?`,
      options: [
        { label: 'Yes', to: 'finalize' },
        { label: 'No, pick another', to: 'pickColor' },
      ],
    }),
    finalize: fsm.final({
      outcome: 'success',
      artifacts: {
        'result.md': renderResultMd,
      },
    }),
  },
});
