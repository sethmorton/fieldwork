import { review, retrievability, AGAIN, GOOD, EASY, type Memory } from './fsrs.ts';
export type Attempt = {
  id: string;
  skillId: string;
  occurredAt: string;
  correct: boolean | null;
  evidenceValid: boolean;
  confidence: number;
  unfamiliar: boolean;
  locationRef: string;
  mode: 'practice' | 'assessment';
  reason: string;
  /** Set only by "Knew it" (result card or quick check); every other success replays as Good. */
  grade?: 'easy';
};
type Clock = Date | string | number;
export type SkillStatus = {
  skillId: string;
  state: 'new' | 'learning' | 'provisional' | 'mastered' | 'oriented';
  eligibleCount: number;
  accuracy: number | null;
  recentAccuracy: number | null;
  firstEvidenceAt: string | null;
  lastEvidenceAt: string | null;
  masteredAt: string | null;
  /** FSRS-6 schedule from all outcomes; the planner and tree share this one notion of due. */
  reviewDueAt: string | null;
  due: boolean;
  retrievability: number | null;
  overconfidentErrors: number;
  reason: string;
};
const DELAY = 20 * 60 * 60 * 1000;
const passed = (attempt: Attempt) => attempt.correct === true && attempt.evidenceValid;
const time = (value: Clock) => new Date(value).getTime();
const iso = (value: number) => new Date(value).toISOString();
const rate = (attempts: Attempt[]) => attempts.filter(passed).length / attempts.length;

/** One pass over time-sorted evidence: does each prefix of length k qualify (20 unique, 80% overall and latest five, 3 delayed)? */
function qualifyingPrefixes(attempts: Attempt[]) {
  const passes = [0], qualifies = [false];
  let delayedFrom = -1;
  for (let k = 1; k <= attempts.length; k++) {
    passes.push(passes[k - 1] + Number(passed(attempts[k - 1])));
    if (delayedFrom < 0 && time(attempts[k - 1].occurredAt) - time(attempts[0].occurredAt) >= DELAY) delayedFrom = k - 1;
    qualifies.push(k >= 20 && (passes[k] - passes[k - 20]) / 20 >= 0.8 && (passes[k] - passes[k - 5]) / 5 >= 0.8
      && delayedFrom >= 0 && k - delayedFrom >= 3);
  }
  return qualifies;
}

export function skillStatus(skillId: string, attempts: Attempt[], now: Clock = Date.now(), kind?: 'orientation'): SkillStatus {
  const nowMs = time(now);
  if (!Number.isFinite(nowMs)) throw new Error('Invalid current date.');
  const records = attempts.filter(attempt => attempt.skillId === skillId
    && Number.isFinite(time(attempt.occurredAt)) && time(attempt.occurredAt) <= nowMs)
    .sort((a, b) => time(a.occurredAt) - time(b.occurredAt));
  if (kind === 'orientation') {
    const oriented = records.some(attempt => attempt.mode === 'practice' && passed(attempt));
    return {
      skillId, state: oriented ? 'oriented' : records.length ? 'learning' : 'new',
      eligibleCount: 0, accuracy: null, recentAccuracy: null, firstEvidenceAt: null,
      lastEvidenceAt: null, masteredAt: null, reviewDueAt: null, due: false, retrievability: null, overconfidentErrors: 0,
      reason: oriented ? 'Orientation completed through source recall. This does not establish panorama mastery.'
        : 'Complete the guided source-recall exercise to finish this orientation.',
    };
  }
  const unique = new Map<string, Attempt>();
  for (const attempt of records) {
    if (attempt.mode === 'assessment' && attempt.unfamiliar === true && typeof attempt.locationRef === 'string'
      && attempt.locationRef.trim() && typeof attempt.correct === 'boolean' && typeof attempt.evidenceValid === 'boolean') {
      unique.set(attempt.locationRef.trim(), attempt);
    }
  }
  const eligible = [...unique.values()].sort((a, b) => time(a.occurredAt) - time(b.occurredAt));
  const window = eligible.slice(-20);
  const latest = eligible.at(-1);
  const accuracy = window.length ? rate(window) : null;
  const recentAccuracy = window.length ? rate(window.slice(-5)) : null;
  const provisional = window.length >= 10 && accuracy! >= 0.8;
  const qualifies = qualifyingPrefixes(eligible);
  // A failed latest assessment always prompts repair, even if the aggregate still passes.
  const mastered = qualifies[eligible.length] && !!latest && passed(latest);
  const state = mastered ? 'mastered' : provisional ? 'provisional' : records.length ? 'learning' : 'new';
  let masteredAt: string | null = null;
  if (mastered) {
    let achievedIndex = eligible.length - 1;
    while (achievedIndex > 0 && qualifies[achievedIndex] && passed(eligible[achievedIndex - 1])) achievedIndex--;
    masteredAt = eligible[achievedIndex].occurredAt;
  }
  // Every outcome (practice or assessment, explicit or assumed) is one FSRS review: a recognition miss or wrong answer
  // is Again, a right answer Good, and a right answer the learner marked "Knew it" (grade 'easy') Easy.
  // An unknown answer (correct null, nothing failed) is not a review at all.
  let memory: Memory | null = null;
  for (const attempt of records) {
    if (!attempt.evidenceValid || attempt.correct === false) memory = review(memory, time(attempt.occurredAt), AGAIN);
    else if (attempt.correct === true) memory = review(memory, time(attempt.occurredAt), attempt.grade === 'easy' ? EASY : GOOD);
  }
  let reason = 'Start with a guided lesson, then try an unfamiliar location.';
  if (state === 'learning') reason = `${window.length}/10 unique unfamiliar assessments; practice alone does not establish mastery.`;
  if (state === 'provisional') reason = `Provisional: ${window.length} unique assessments, ${Math.round(accuracy! * 100)}% correct with valid evidence. Need 20, a delayed check, and 80% on the latest five.`;
  if (state === 'mastered') reason = `Mastered on self-reported evidence: 20 unique assessments, ${Math.round(accuracy! * 100)}% correct with valid evidence, including a delayed check.`;
  if (latest && !passed(latest)) reason = 'The latest unfamiliar assessment failed the answer or evidence check. Review this skill before advancing.';
  return {
    skillId, state, eligibleCount: window.length, accuracy, recentAccuracy,
    firstEvidenceAt: window[0]?.occurredAt ?? null, lastEvidenceAt: latest?.occurredAt ?? null,
    masteredAt, reviewDueAt: memory && iso(memory.due), due: !!memory && memory.due <= nowMs,
    retrievability: memory && retrievability(memory, nowMs),
    overconfidentErrors: window.filter(attempt => !passed(attempt) && attempt.confidence === 3).length,
    reason,
  };
}
