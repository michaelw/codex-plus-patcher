import { createFsm } from '@aharness/core';
import child from './composed-pipeline-child.fsm.js';

interface ParentCtx {
  topic: string;
  shippedTopic?: string;
}

interface GoPayload {
  readonly ready: boolean;
}

const fsm = createFsm<ParentCtx>();

export default fsm.machine({
  id: 'pipeline',
  input: {
    topic: fsm.input.string({ description: 'Project topic' }),
  },
  data: ({ input }) => ({
    topic: input.topic,
  }),
  initial: 'router',
  states: {
    router: fsm.state({
      prompt: (data) =>
        `Pipeline for topic: ${data.topic}. ` +
        `Submit ready=true when you want to enter the spec phase, ready=false to stay here.`,
      on: {
        go: fsm.submit<GoPayload>({
          route: [{ if: (data, payload) => payload.ready === true, to: 'spec' }, { to: 'router' }],
        }),
      },
    }),
    spec: fsm.embed(child, {
      input: (data) => ({ topic: data.topic }),
      on: {
        shipped: {
          to: 'done',
          reduce: (draft, output) => {
            draft.shippedTopic = output.topic;
          },
        },
        failed: { to: 'router' },
      },
    }),
    done: fsm.final({ outcome: 'success' }),
  },
});
