import { createFsm } from '@aharness/core';

interface Data {
  completed: string[];
}

const fsm = createFsm<Data>();

const renderDeployLogMd = (data: Readonly<Data>): string =>
  [
    '# Deploy Gate Log',
    '',
    'Each row is a deterministic owner-choice checkpoint accepted during the run.',
    '',
    '| Stage  | Status |',
    '| ------ | ------ |',
    `| lint   | ${data.completed.includes('lint') ? 'accepted' : '(none)'} |`,
    `| tests  | ${data.completed.includes('tests') ? 'accepted' : '(none)'} |`,
    `| build  | ${data.completed.includes('build') ? 'accepted' : '(none)'} |`,
    '',
  ].join('\n');

export default fsm.machine({
  id: 'await-checkpoints',
  initial: 'lintCheck',
  data: () => ({
    completed: [],
  }),
  states: {
    lintCheck: fsm.state({
      prompt:
        'Pretend a lint pass just ran. Output one short line summarizing a fake (positive) lint ' +
        'result, then submit.',
      on: {
        submit: fsm.submit<Record<string, never>>({
          to: 'lintGate',
          reduce: (draft) => {
            draft.completed = [...draft.completed, 'lint'];
          },
        }),
      },
    }),
    lintGate: fsm.choice({
      question: 'lint passed — proceed to tests?',
      options: [{ label: 'Proceed to tests', to: 'testsCheck' }],
    }),
    testsCheck: fsm.state({
      prompt:
        'Pretend the test suite just ran. Output one short line summarizing a fake (positive) ' +
        'test result, then submit.',
      on: {
        submit: fsm.submit<Record<string, never>>({
          to: 'testsGate',
          reduce: (draft) => {
            draft.completed = [...draft.completed, 'tests'];
          },
        }),
      },
    }),
    testsGate: fsm.choice({
      question: 'tests passed — proceed to build?',
      options: [{ label: 'Proceed to build', to: 'buildCheck' }],
    }),
    buildCheck: fsm.state({
      prompt:
        'Pretend a release build just ran. Output one short line summarizing a fake (positive) ' +
        'build result, then submit.',
      on: {
        submit: fsm.submit<Record<string, never>>({
          to: 'buildGate',
          reduce: (draft) => {
            draft.completed = [...draft.completed, 'build'];
          },
        }),
      },
    }),
    buildGate: fsm.choice({
      question: 'build green — ship it?',
      options: [{ label: 'Ship it', to: 'done' }],
    }),
    done: fsm.final({
      outcome: 'success',
      artifacts: {
        'deploy-log.md': renderDeployLogMd,
      },
    }),
  },
});
