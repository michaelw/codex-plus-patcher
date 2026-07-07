import { createFsm } from '@aharness/core';

interface Data {
  trail: string[];
  ending: string | null;
  outcome: 'victory' | 'defeat' | null;
}

const fsm = createFsm<Data>();

const renderEndingMd = (data: Readonly<Data>): string => {
  const lines = [
    '# Adventure',
    '',
    `Outcome: **${data.outcome ?? '(unknown)'}**`,
    '',
    '## Trail',
    '',
  ];
  for (const step of data.trail) lines.push(`- ${step}`);
  lines.push('', '## Ending', '', data.ending ?? '(no ending recorded)', '');
  return lines.join('\n');
};

function recordTrail(draft: Data, step: string): void {
  draft.trail = [...draft.trail, step];
}

export default fsm.machine({
  id: 'adventure',
  initial: 'entrance',
  data: (): Data => ({
    trail: [],
    ending: null,
    outcome: null,
  }),
  states: {
    entrance: fsm.state({
      prompt:
        'Open a short fantasy-adventure scene at a crossroads. Mention three paths: forest, cave, and river. Submit a one-line recap under `scene`.',
      on: {
        submit: fsm.submit<{ scene: string }>({
          to: 'entranceChoice',
          reduce: (draft, payload) => recordTrail(draft, `entrance: ${payload.scene}`),
        }),
      },
    }),
    entranceChoice: fsm.choice({
      question: 'Choose a path.',
      options: [
        { label: 'Forest', to: 'forest' },
        { label: 'Cave', to: 'cave' },
        { label: 'River', to: 'river' },
      ],
    }),
    forest: fsm.state({
      prompt:
        'Continue the story in the forest. Present a bold option and a cautious option, then submit a one-line scene recap.',
      on: {
        submit: fsm.submit<{ scene: string }>({
          to: 'forestChoice',
          reduce: (draft, payload) => recordTrail(draft, `forest: ${payload.scene}`),
        }),
      },
    }),
    forestChoice: fsm.choice({
      question: 'Bold or cautious?',
      options: [
        { label: 'Bold', to: 'forestVictory' },
        { label: 'Cautious', to: 'forestDefeat' },
      ],
    }),
    forestVictory: fsm.state({
      prompt: 'Write a 1-2 sentence victorious forest ending and submit it.',
      on: {
        submit: fsm.submit<{ ending: string }>({
          to: 'victory',
          reduce: (draft, payload) => {
            draft.ending = payload.ending;
            draft.outcome = 'victory';
          },
        }),
      },
    }),
    forestDefeat: fsm.state({
      prompt: 'Write a 1-2 sentence defeated forest ending and submit it.',
      on: {
        submit: fsm.submit<{ ending: string }>({
          to: 'defeat',
          reduce: (draft, payload) => {
            draft.ending = payload.ending;
            draft.outcome = 'defeat';
          },
        }),
      },
    }),
    cave: fsm.state({
      prompt:
        'Continue the story in the cave. Present a bold option and a cautious option, then submit a one-line scene recap.',
      on: {
        submit: fsm.submit<{ scene: string }>({
          to: 'caveChoice',
          reduce: (draft, payload) => recordTrail(draft, `cave: ${payload.scene}`),
        }),
      },
    }),
    caveChoice: fsm.choice({
      question: 'Bold or cautious?',
      options: [
        { label: 'Bold', to: 'caveDefeat' },
        { label: 'Cautious', to: 'caveVictory' },
      ],
    }),
    caveDefeat: fsm.state({
      prompt: 'Write a 1-2 sentence defeated cave ending and submit it.',
      on: {
        submit: fsm.submit<{ ending: string }>({
          to: 'defeat',
          reduce: (draft, payload) => {
            draft.ending = payload.ending;
            draft.outcome = 'defeat';
          },
        }),
      },
    }),
    caveVictory: fsm.state({
      prompt: 'Write a 1-2 sentence victorious cave ending and submit it.',
      on: {
        submit: fsm.submit<{ ending: string }>({
          to: 'victory',
          reduce: (draft, payload) => {
            draft.ending = payload.ending;
            draft.outcome = 'victory';
          },
        }),
      },
    }),
    river: fsm.state({
      prompt:
        'Continue the story at the river. Present a bold option and a cautious option, then submit a one-line scene recap.',
      on: {
        submit: fsm.submit<{ scene: string }>({
          to: 'riverChoice',
          reduce: (draft, payload) => recordTrail(draft, `river: ${payload.scene}`),
        }),
      },
    }),
    riverChoice: fsm.choice({
      question: 'Bold or cautious?',
      options: [
        { label: 'Bold', to: 'riverVictory' },
        { label: 'Cautious', to: 'riverDefeat' },
      ],
    }),
    riverVictory: fsm.state({
      prompt: 'Write a 1-2 sentence victorious river ending and submit it.',
      on: {
        submit: fsm.submit<{ ending: string }>({
          to: 'victory',
          reduce: (draft, payload) => {
            draft.ending = payload.ending;
            draft.outcome = 'victory';
          },
        }),
      },
    }),
    riverDefeat: fsm.state({
      prompt: 'Write a 1-2 sentence defeated river ending and submit it.',
      on: {
        submit: fsm.submit<{ ending: string }>({
          to: 'defeat',
          reduce: (draft, payload) => {
            draft.ending = payload.ending;
            draft.outcome = 'defeat';
          },
        }),
      },
    }),
    victory: fsm.final({
      outcome: 'success',
      artifacts: {
        'adventure.md': renderEndingMd,
      },
    }),
    defeat: fsm.final({
      outcome: 'failure',
      artifacts: {
        'adventure.md': renderEndingMd,
      },
    }),
  },
});
