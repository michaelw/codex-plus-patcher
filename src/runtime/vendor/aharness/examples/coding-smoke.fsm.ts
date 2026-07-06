import { createFsm } from '@aharness/core';

interface Data {
  fixtureRoot: string;
  task: string;
  plan: string | null;
  ownerReply: string | null;
  implementationSummary: string | null;
  changedFiles: string[];
  testCommand: string | null;
  testPassed: boolean | null;
  testSummary: string | null;
  repairAttempts: number;
  maxRepairAttempts: number;
  finalReport: string | null;
}

const fsm = createFsm<Data>();

const renderCodingSmokeReport = (data: Readonly<Data>): string =>
  [
    '# Coding Smoke Demo Report',
    '',
    `- Fixture root: \`${data.fixtureRoot}\``,
    `- Repair attempts: ${data.repairAttempts} / ${data.maxRepairAttempts}`,
    `- Final test status: ${data.testPassed === true ? 'passed' : 'not passed'}`,
    '',
    '## Task',
    '',
    data.task,
    '',
    '## Approved Plan',
    '',
    data.plan ?? '(none)',
    '',
    '## Owner Approval',
    '',
    data.ownerReply ?? '(none)',
    '',
    '## Changed Files',
    '',
    ...(data.changedFiles.length > 0
      ? data.changedFiles.map((file) => `- \`${file}\``)
      : ['- (none)']),
    '',
    '## Test Evidence',
    '',
    `- Command: \`${data.testCommand ?? '(none)'}\``,
    `- Passed: ${data.testPassed === true ? 'yes' : 'no'}`,
    '',
    data.testSummary ?? '(none)',
    '',
    '## Final Report',
    '',
    data.finalReport ?? '(none)',
    '',
  ].join('\n');

const requireNonEmpty = (value: string, name: string): void => {
  if (value.trim().length === 0) {
    throw new Error(`${name} must not be empty`);
  }
};

const requireChangedFiles = (files: string[]): void => {
  if (files.length === 0) {
    throw new Error('changedFiles must list at least one file');
  }
};

export default fsm.machine({
  id: 'coding-smoke',
  input: {
    fixtureRoot: fsm.input.path({
      description: 'Fixture package the coding model should repair',
      default: './examples/coding-smoke/fixture',
      complete: 'directory',
    }),
    maxRepairAttempts: fsm.input.number({
      description: 'Maximum repair loops after failing test evidence',
      default: 2,
    }),
  },
  data: ({ input }) => ({
    fixtureRoot: input.fixtureRoot,
    maxRepairAttempts: input.maxRepairAttempts,
    task:
      'Fix the tiny TypeScript math fixture so the Vitest test suite passes. ' +
      'Inspect src/math.ts and test/math.test.ts, make the smallest correct code change, ' +
      'and preserve the public add(a, b) API.',
    plan: null,
    ownerReply: null,
    implementationSummary: null,
    changedFiles: [],
    testCommand: null,
    testPassed: null,
    testSummary: null,
    repairAttempts: 0,
    finalReport: null,
  }),
  initial: 'plan',
  states: {
    plan: fsm.state({
      prompt: (data) =>
        `You are in the planning gate for a coding smoke demo.\n\n` +
        `Fixture root: ${data.fixtureRoot}\n` +
        `Task: ${data.task}\n\n` +
        'Inspect the fixture files if needed, then submit a concise implementation plan. ' +
        'Do not edit files in this state.',
      on: {
        submitPlan: fsm.submit<{ plan: string }>({
          to: 'ownerApproval',
          effect: ({ payload }) => {
            requireNonEmpty(payload.plan, 'plan');
          },
          reduce: (draft, payload) => {
            draft.plan = payload.plan;
          },
        }),
      },
    }),
    ownerApproval: fsm.choice({
      question: (data) =>
        ['Approve this plan for the coding smoke fixture?', '', data.plan ?? '(missing plan)'].join(
          '\n',
        ),
      options: [
        { label: 'Approve', to: 'recordApproval' },
        { label: 'Request changes', to: 'revisePlan' },
      ],
    }),
    recordApproval: fsm.state({
      prompt: 'Record that the owner approved the current plan, then submit.',
      on: {
        submit: fsm.submit<Record<string, never>>({
          to: 'implement',
          reduce: (draft) => {
            draft.ownerReply = 'Approved';
          },
        }),
      },
    }),
    revisePlan: fsm.state({
      mode: 'open',
      prompt:
        'Ask the owner for requested changes to the plan. Submit a revisedPlan that addresses the feedback.',
      on: {
        submit: fsm.submit<{ ownerReply: string; revisedPlan: string }>({
          to: 'ownerApproval',
          effect: ({ payload }) => {
            requireNonEmpty(payload.ownerReply, 'ownerReply');
            requireNonEmpty(payload.revisedPlan, 'revisedPlan');
          },
          reduce: (draft, payload) => {
            draft.ownerReply = payload.ownerReply;
            draft.plan = payload.revisedPlan;
          },
        }),
      },
    }),
    implement: fsm.state({
      prompt: (data) =>
        `Implement the approved plan in ${data.fixtureRoot}.\n\n` +
        `Approved plan:\n${data.plan ?? '(missing plan)'}\n\n` +
        'Edit only the fixture files needed for the task. After editing, submit a summary and ' +
        'the changed file paths relative to the repository root. Do not claim tests passed here; ' +
        'the next state owns test evidence.',
      on: {
        submitImplementation: fsm.submit<{ summary: string; changedFiles: string[] }>({
          to: 'test',
          effect: ({ payload }) => {
            requireNonEmpty(payload.summary, 'summary');
            requireChangedFiles(payload.changedFiles);
          },
          reduce: (draft, payload) => {
            draft.implementationSummary = payload.summary;
            draft.changedFiles = payload.changedFiles;
            draft.testCommand = null;
            draft.testPassed = null;
            draft.testSummary = null;
          },
        }),
      },
    }),
    test: fsm.state({
      prompt: (data) =>
        `Run the fixture test command from the repo root:\n\n` +
        `pnpm --dir ${data.fixtureRoot} test\n\n` +
        'Submit structured evidence with the command you ran, whether it passed, and a short ' +
        'output summary. If tests fail, the FSM will route to repair instead of final report.',
      on: {
        submitTestEvidence: fsm.submit<{ command: string; passed: boolean; outputSummary: string }>(
          {
            route: [
              {
                if: (_data, payload) => payload.passed,
                to: 'finalReport',
                effect: ({ payload }) => {
                  requireNonEmpty(payload.command, 'command');
                  requireNonEmpty(payload.outputSummary, 'outputSummary');
                },
                reduce: (draft, payload) => {
                  draft.testCommand = payload.command;
                  draft.testPassed = payload.passed;
                  draft.testSummary = payload.outputSummary;
                },
              },
              {
                if: (data) => data.repairAttempts < data.maxRepairAttempts,
                to: 'repair',
                effect: ({ payload }) => {
                  requireNonEmpty(payload.command, 'command');
                  requireNonEmpty(payload.outputSummary, 'outputSummary');
                },
                reduce: (draft, payload) => {
                  draft.testCommand = payload.command;
                  draft.testPassed = payload.passed;
                  draft.testSummary = payload.outputSummary;
                },
              },
              {
                to: 'failed',
                effect: ({ payload }) => {
                  requireNonEmpty(payload.command, 'command');
                  requireNonEmpty(payload.outputSummary, 'outputSummary');
                },
                reduce: (draft, payload) => {
                  draft.testCommand = payload.command;
                  draft.testPassed = payload.passed;
                  draft.testSummary = payload.outputSummary;
                },
              },
            ],
          },
        ),
      },
    }),
    repair: fsm.state({
      prompt: (data) =>
        `The latest fixture test run failed. Repair attempt ${data.repairAttempts + 1} of ` +
        `${data.maxRepairAttempts}.\n\n` +
        `Last command: ${data.testCommand ?? '(none)'}\n` +
        `Last output summary:\n${data.testSummary ?? '(none)'}\n\n` +
        'Inspect the failure, edit only the fixture files needed, and submit a repair summary ' +
        'with the changed file paths relative to the repository root.',
      on: {
        submitRepair: fsm.submit<{ summary: string; changedFiles: string[] }>({
          to: 'test',
          effect: ({ payload }) => {
            requireNonEmpty(payload.summary, 'summary');
            requireChangedFiles(payload.changedFiles);
          },
          reduce: (draft, payload) => {
            draft.repairAttempts += 1;
            draft.implementationSummary = payload.summary;
            draft.changedFiles = Array.from(
              new Set([...draft.changedFiles, ...payload.changedFiles]),
            );
            draft.testCommand = null;
            draft.testPassed = null;
            draft.testSummary = null;
          },
        }),
      },
    }),
    finalReport: fsm.state({
      prompt: (data) =>
        'Write the final owner-facing report for this coding smoke demo. Include the approved ' +
        'plan, files changed, exact test command, and observed passing result.\n\n' +
        `Fixture root: ${data.fixtureRoot}\n` +
        `Changed files: ${data.changedFiles.join(', ')}\n` +
        `Test command: ${data.testCommand ?? '(none)'}\n` +
        `Test summary: ${data.testSummary ?? '(none)'}`,
      on: {
        submitReport: fsm.submit<{ report: string }>({
          to: 'done',
          effect: ({ payload }) => {
            requireNonEmpty(payload.report, 'report');
          },
          reduce: (draft, payload) => {
            draft.finalReport = payload.report;
          },
        }),
      },
    }),
    done: fsm.final({
      outcome: 'success',
      artifacts: {
        'coding-smoke-report.md': renderCodingSmokeReport,
      },
    }),
    failed: fsm.final({
      outcome: 'failure',
      artifacts: {
        'coding-smoke-report.md': renderCodingSmokeReport,
      },
    }),
  },
});
