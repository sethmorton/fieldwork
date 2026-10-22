/**
 * FSRS-6 with the reference ts-fsrs 5.x defaults: 21 default weights, desired retention 0.9,
 * learning steps 1m/10m, relearning step 10m, same-UTC-day short-term stability, no fuzz.
 * Memory is derived by replaying outcomes; nothing here is stored.
 */
const W = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796,
  1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542];
const DECAY = -W[20];
const FACTOR = 0.9 ** (1 / DECAY) - 1;
const RETENTION = 0.9;
const MINUTE = 60000, DAY = 86400000;
const LEARNING_STEPS = [1, 10], RELEARNING_STEPS = [10];
export const AGAIN = 1, GOOD = 3;
type Grade = 1 | 2 | 3;
export type Memory = {
  stability: number; difficulty: number; phase: 'learning' | 'review' | 'relearning';
  step: number; lastReview: number; due: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const initDifficulty = (grade: number) => W[4] - Math.exp((grade - 1) * W[5]) + 1;
const forgetting = (days: number, stability: number) => (1 + FACTOR * days / stability) ** DECAY;
const interval = (stability: number) => clamp(Math.round(stability / FACTOR * (RETENTION ** (1 / DECAY) - 1)), 1, 36500);

/** Probability of recall at `now`, using fractional days so same-day misses rank by recency. */
export const retrievability = (memory: Memory, now: number) => forgetting(Math.max(0, now - memory.lastReview) / DAY, memory.stability);

function nextStability(d: number, s: number, days: number, grade: Grade) {
  if (days === 0) {
    const increase = s ** -W[19] * Math.exp(W[17] * (grade - 3 + W[18]));
    return clamp(s * (grade > 1 ? Math.max(increase, 1) : increase), 0.001, 36500);
  }
  const r = forgetting(days, s);
  if (grade === 1) return Math.min(Math.max(s / Math.exp(W[17] * W[18]), 0.001),
    clamp(W[11] * d ** -W[12] * ((s + 1) ** W[13] - 1) * Math.exp((1 - r) * W[14]), 0.001, 36500));
  return clamp(s * (1 + Math.exp(W[8]) * (11 - d) * s ** -W[9] * (Math.exp((1 - r) * W[10]) - 1) * (grade === 2 ? W[15] : 1)), 0.001, 36500);
}

/** One Again/Good review at `at` (ms). Elapsed time counts UTC calendar days, as ts-fsrs does. */
export function review(memory: Memory | null, at: number, grade: typeof AGAIN | typeof GOOD): Memory {
  if (!memory) {
    const stability = Math.max(W[grade - 1], 0.1), difficulty = clamp(initDifficulty(grade), 1, 10);
    return grade === AGAIN ? { stability, difficulty, phase: 'learning', step: 0, lastReview: at, due: at + LEARNING_STEPS[0] * MINUTE }
      : { stability, difficulty, phase: 'learning', step: 1, lastReview: at, due: at + LEARNING_STEPS[1] * MINUTE };
  }
  const days = Math.floor(at / DAY) - Math.floor(memory.lastReview / DAY);
  const stability = nextStability(memory.difficulty, memory.stability, days, grade);
  const difficulty = clamp(W[7] * initDifficulty(4) + (1 - W[7]) * (memory.difficulty - W[6] * (grade - 3) * (10 - memory.difficulty) / 9), 1, 10);
  const next = { stability, difficulty, lastReview: at };
  if (memory.phase === 'review') {
    if (grade === AGAIN) return { ...next, phase: 'relearning', step: 0, due: at + RELEARNING_STEPS[0] * MINUTE };
    const good = interval(stability), hard = Math.min(interval(nextStability(memory.difficulty, memory.stability, days, 2)), good);
    return { ...next, phase: 'review', step: 0, due: at + Math.max(good, hard + 1) * DAY };
  }
  const steps = memory.phase === 'learning' ? LEARNING_STEPS : RELEARNING_STEPS;
  if (grade === AGAIN) return { ...next, phase: memory.phase, step: 0, due: at + steps[0] * MINUTE };
  const step = steps[memory.step + 1];
  return step ? { ...next, phase: memory.phase, step: memory.step + 1, due: at + step * MINUTE }
    : { ...next, phase: 'review', step: 0, due: at + interval(stability) * DAY };
}
