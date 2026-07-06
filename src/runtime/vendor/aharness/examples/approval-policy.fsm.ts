import { createFsm } from '@aharness/core';

interface Data {
  mode: string;
  planPath: string;
  maxAutoApprovals: number;
  approvals: string[];
  report: string | null;
}

interface ReportPayload {
  report: string;
}

const base = createFsm<Data>();
const fsm = base.withEvents({
  policyNote: base.event<{ note: string }>(),
});

const renderPolicyMd = (data: Readonly<Data>): string =>
  [
    '# Approval Policy Demo',
    '',
    `- Mode: ${data.mode}`,
    `- Plan path: ${data.planPath}`,
    `- Max auto approvals: ${data.maxAutoApprovals}`,
    '',
    '## Permission requests seen',
    '',
    ...(data.approvals.length > 0 ? data.approvals.map((entry) => `- ${entry}`) : ['- (none)']),
    '',
    '## Report',
    '',
    data.report ?? '(none)',
    '',
  ].join('\n');

export default fsm.machine({
  id: 'approval-policy',
  input: {
    mode: fsm.input.string({
      description: 'Policy mode: observe or strict',
      default: 'observe',
      complete: fsm.input.values(['observe', 'strict']),
    }),
    planPath: fsm.input.path({
      description: 'Plan file to mention in the report',
      default: './PLAN.md',
      complete: 'file',
    }),
    maxAutoApprovals: fsm.input.number({
      description: 'Maximum strict-mode test command approvals',
      default: 1,
    }),
  },
  data: ({ input }) => ({
    mode: input.mode,
    planPath: input.planPath,
    maxAutoApprovals: input.maxAutoApprovals,
    approvals: [],
    report: null,
  }),
  initial: 'review',
  states: {
    review: fsm.state({
      prompt: (data) =>
        `Write a short approval-policy report for ${data.planPath}. ` +
        `Mode is "${data.mode}". Do not run commands just for this demo; ` +
        'if a Bash approval request happens anyway, the active state policy handles it. ' +
        'Submit the report text.',
      on: {
        permissionRequest: {
          match: '^Bash$',
          route: [
            {
              if: (data, payload) =>
                data.mode === 'strict' &&
                (payload.command?.startsWith('pnpm test') ?? false) &&
                data.approvals.length < data.maxAutoApprovals,
              reduce: (draft, payload) => {
                draft.approvals = [
                  ...draft.approvals,
                  `accepted for session: ${payload.command ?? payload.toolName}`,
                ];
              },
              return: () => 'acceptForSession',
            },
            {
              reduce: (draft, payload) => {
                draft.approvals = [
                  ...draft.approvals,
                  `delegated to browser: ${payload.command ?? payload.toolName}`,
                ];
              },
              return: () => 'delegate',
            },
          ],
        },
        policyNote: {
          reduce: (draft, payload) => {
            draft.approvals = [...draft.approvals, `note: ${payload.note}`];
          },
        },
        submit: fsm.submit<ReportPayload>({
          to: 'record',
          effect: ({ payload }) => {
            if (payload.report.trim().length === 0) {
              throw new Error('report must not be empty');
            }
          },
          reduce: (draft, payload) => {
            draft.report = payload.report;
          },
        }),
      },
    }),
    record: fsm.passive({
      always: { target: 'done' },
    }),
    done: fsm.final({
      outcome: 'success',
      artifacts: {
        'approval-policy.md': renderPolicyMd,
      },
    }),
  },
});
