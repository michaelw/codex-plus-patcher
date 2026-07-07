import { createFsm } from '@aharness/core';

interface ChildCtx {
  topic: string;
}

interface Decision {
  readonly accepted: boolean;
}

const fsm = createFsm<ChildCtx>();

export default fsm.machine({
  id: 'spec',
  input: {
    topic: fsm.input.string({ description: 'Topic to spec' }),
  },
  data: ({ input }) => ({
    topic: input.topic,
  }),
  initial: 'compose',
  states: {
    compose: fsm.state({
      prompt: (data) =>
        `Compose a 1-paragraph spec for the topic: ${data.topic}. ` +
        `Submit with accepted=true once the spec is satisfactory; accepted=false to abort.`,
      on: {
        decide: fsm.submit<Decision>({
          route: [
            { if: (data, payload) => payload.accepted === true, to: 'shipped' },
            { to: 'failed' },
          ],
        }),
      },
    }),
    shipped: fsm.final({
      outcome: 'success',
      output: (data) => ({ topic: data.topic }),
    }),
    failed: fsm.final({ outcome: 'failure' }),
  },
});
