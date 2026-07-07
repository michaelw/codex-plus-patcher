import { createFsm } from '@aharness/core';

interface RoundRecord {
  round: number;
  genre: string;
  correct: number;
  total: number;
}

interface Data {
  round: number;
  qInRound: number;
  currentGenre: string | null;
  currentQuestion: string | null;
  correctAnswer: 'A' | 'B' | 'C' | 'D' | null;
  currentRoundCorrect: number;
  rounds: RoundRecord[];
}

interface QuestionPayload {
  question: string;
  correctAnswer: 'A' | 'B' | 'C' | 'D';
}

type Answer = 'A' | 'B' | 'C' | 'D';

const TOTAL_ROUNDS = 3;
const QUESTIONS_PER_ROUND = 3;

const fsm = createFsm<Data>();

const renderScoreboardMd = (data: Readonly<Data>): string => {
  const total = data.rounds.reduce((s, r) => s + r.correct, 0);
  const max = data.rounds.reduce((s, r) => s + r.total, 0);
  const lines = [
    '# Trivia Scoreboard',
    '',
    `**Final score: ${total} / ${max}**`,
    '',
    '| Round | Genre | Correct | Total |',
    '|---|---|---|---|',
  ];
  for (const r of data.rounds) {
    lines.push(`| ${r.round} | ${r.genre} | ${r.correct} | ${r.total} |`);
  }
  return lines.join('\n') + '\n';
};

function appendRound(data: Readonly<Data>, wasCorrect: boolean): RoundRecord {
  return {
    round: data.round,
    genre: data.currentGenre ?? '(unknown)',
    correct: data.currentRoundCorrect + (wasCorrect ? 1 : 0),
    total: QUESTIONS_PER_ROUND,
  };
}

function recordAnswer(draft: Data, answer: Answer): void {
  const wasCorrect = draft.correctAnswer === answer;
  if (draft.qInRound + 1 >= QUESTIONS_PER_ROUND) {
    draft.rounds = [...draft.rounds, appendRound(draft, wasCorrect)];
    draft.round += 1;
    draft.qInRound = 0;
    draft.currentRoundCorrect = 0;
    draft.currentGenre = null;
  } else {
    draft.qInRound += 1;
    draft.currentRoundCorrect += wasCorrect ? 1 : 0;
  }
  draft.currentQuestion = null;
  draft.correctAnswer = null;
}

function finalRoundComplete(data: Readonly<Data>): boolean {
  return data.qInRound + 1 >= QUESTIONS_PER_ROUND && data.round >= TOTAL_ROUNDS;
}

function nextAfterAnswer(data: Readonly<Data>): 'finalize' | 'freshRound' | 'askQuestion' {
  if (finalRoundComplete(data)) return 'finalize';
  if (data.qInRound + 1 >= QUESTIONS_PER_ROUND) return 'freshRound';
  return 'askQuestion';
}

export default fsm.machine({
  id: 'trivia-rounds',
  initial: 'pickGenre',
  data: () => ({
    round: 1,
    qInRound: 0,
    currentGenre: null,
    currentQuestion: null,
    correctAnswer: null,
    currentRoundCorrect: 0,
    rounds: [],
  }),
  states: {
    pickGenre: fsm.choice({
      question: (data) => `Round ${data.round} of ${TOTAL_ROUNDS}. Pick a trivia genre.`,
      options: [
        { label: 'Movies', to: 'genreMovies' },
        { label: 'Science', to: 'genreScience' },
        { label: 'History', to: 'genreHistory' },
      ],
    }),
    pickGenreFresh: fsm.choice({
      question: (data) => `Round ${data.round} of ${TOTAL_ROUNDS}. Pick a trivia genre.`,
      options: [
        { label: 'Movies', to: 'genreMovies' },
        { label: 'Science', to: 'genreScience' },
        { label: 'History', to: 'genreHistory' },
      ],
    }),
    freshRound: fsm.state({
      clearOnEntry: true,
      prompt:
        'This state starts a fresh model thread between trivia rounds. Acknowledge the fresh context in one short sentence, then submit.',
      on: {
        submit: fsm.submit<Record<string, never>>({
          to: 'pickGenreFresh',
        }),
      },
    }),
    genreMovies: fsm.state({
      prompt: 'Record the selected genre as movies and submit.',
      on: {
        submit: fsm.submit<Record<string, never>>({
          to: 'askQuestion',
          reduce: (draft) => {
            draft.currentGenre = 'movies';
          },
        }),
      },
    }),
    genreScience: fsm.state({
      prompt: 'Record the selected genre as science and submit.',
      on: {
        submit: fsm.submit<Record<string, never>>({
          to: 'askQuestion',
          reduce: (draft) => {
            draft.currentGenre = 'science';
          },
        }),
      },
    }),
    genreHistory: fsm.state({
      prompt: 'Record the selected genre as history and submit.',
      on: {
        submit: fsm.submit<Record<string, never>>({
          to: 'askQuestion',
          reduce: (draft) => {
            draft.currentGenre = 'history';
          },
        }),
      },
    }),
    askQuestion: fsm.state({
      prompt: (data) =>
        `Compose ONE multiple-choice trivia question on "${data.currentGenre ?? '?'}". ` +
        `This is question ${data.qInRound + 1} of ${QUESTIONS_PER_ROUND} in round ${data.round}. ` +
        'Present four labelled choices A) B) C) D), then submit the question text and correct letter.',
      on: {
        submit: fsm.submit<QuestionPayload>({
          to: 'answerGate',
          reduce: (draft, payload) => {
            draft.currentQuestion = payload.question;
            draft.correctAnswer = payload.correctAnswer;
          },
        }),
      },
    }),
    answerGate: fsm.choice({
      question: (data) => data.currentQuestion ?? 'Your answer?',
      options: [
        { label: 'A', to: 'answerA' },
        { label: 'B', to: 'answerB' },
        { label: 'C', to: 'answerC' },
        { label: 'D', to: 'answerD' },
      ],
    }),
    answerA: fsm.state({
      prompt: 'Record answer A for the current question and submit.',
      on: {
        submit: fsm.submit<Record<string, never>>({
          route: [
            {
              if: (data) => nextAfterAnswer(data) === 'finalize',
              to: 'finalize',
              reduce: (draft) => recordAnswer(draft, 'A'),
            },
            {
              if: (data) => nextAfterAnswer(data) === 'freshRound',
              to: 'freshRound',
              reduce: (draft) => recordAnswer(draft, 'A'),
            },
            { to: 'askQuestion', reduce: (draft) => recordAnswer(draft, 'A') },
          ],
        }),
      },
    }),
    answerB: fsm.state({
      prompt: 'Record answer B for the current question and submit.',
      on: {
        submit: fsm.submit<Record<string, never>>({
          route: [
            {
              if: (data) => nextAfterAnswer(data) === 'finalize',
              to: 'finalize',
              reduce: (draft) => recordAnswer(draft, 'B'),
            },
            {
              if: (data) => nextAfterAnswer(data) === 'freshRound',
              to: 'freshRound',
              reduce: (draft) => recordAnswer(draft, 'B'),
            },
            { to: 'askQuestion', reduce: (draft) => recordAnswer(draft, 'B') },
          ],
        }),
      },
    }),
    answerC: fsm.state({
      prompt: 'Record answer C for the current question and submit.',
      on: {
        submit: fsm.submit<Record<string, never>>({
          route: [
            {
              if: (data) => nextAfterAnswer(data) === 'finalize',
              to: 'finalize',
              reduce: (draft) => recordAnswer(draft, 'C'),
            },
            {
              if: (data) => nextAfterAnswer(data) === 'freshRound',
              to: 'freshRound',
              reduce: (draft) => recordAnswer(draft, 'C'),
            },
            { to: 'askQuestion', reduce: (draft) => recordAnswer(draft, 'C') },
          ],
        }),
      },
    }),
    answerD: fsm.state({
      prompt: 'Record answer D for the current question and submit.',
      on: {
        submit: fsm.submit<Record<string, never>>({
          route: [
            {
              if: (data) => nextAfterAnswer(data) === 'finalize',
              to: 'finalize',
              reduce: (draft) => recordAnswer(draft, 'D'),
            },
            {
              if: (data) => nextAfterAnswer(data) === 'freshRound',
              to: 'freshRound',
              reduce: (draft) => recordAnswer(draft, 'D'),
            },
            { to: 'askQuestion', reduce: (draft) => recordAnswer(draft, 'D') },
          ],
        }),
      },
    }),
    finalize: fsm.final({
      outcome: 'success',
      artifacts: {
        'scoreboard.md': renderScoreboardMd,
      },
    }),
  },
});
