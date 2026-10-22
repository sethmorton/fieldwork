import { review, retrievability, AGAIN, GOOD, type Memory } from './fsrs.ts';
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
};
type AttemptInput = Omit<Attempt, 'id' | 'occurredAt'>;
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

export function validateAttempt(input: unknown, allowedSkillIds: readonly string[]) :
  { ok: true; value: AttemptInput } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error });
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('Attempt must be an object.');
  const value = input as Record<string, unknown>;
  if (typeof value.skillId !== 'string' || !allowedSkillIds.includes(value.skillId)) return fail('Unknown skill.');
  if (value.mode !== 'practice' && value.mode !== 'assessment') return fail('Choose practice or assessment.');
  for (const field of ['correct', 'evidenceValid', 'unfamiliar']) {
    if (typeof value[field] !== 'boolean') return fail(`${field} must be true or false.`);
  }
  if (!Number.isInteger(value.confidence) || (value.confidence as number) < 1 || (value.confidence as number) > 3) {
    return fail('Confidence must be 1, 2, or 3.');
  }
  if (typeof value.reason !== 'string' || !value.reason.trim() || value.reason.length > 2000) {
    return fail('Explain your evidence in 1–2000 characters.');
  }
  if (value.locationRef !== undefined && typeof value.locationRef !== 'string') return fail('Location reference must be text.');
  const locationRef = ((value.locationRef as string | undefined) ?? '').trim();
  if (locationRef.length > 500) return fail('Location reference must be at most 500 characters.');
  if (value.mode === 'assessment' && !locationRef) return fail('Assessment requires a location reference.');
  if (value.occurredAt !== undefined && (typeof value.occurredAt !== 'string' || !Number.isFinite(time(value.occurredAt)))) {
    return fail('Invalid assessment date.');
  }
  return { ok: true, value: {
    skillId: value.skillId, mode: value.mode, correct: value.correct as boolean,
    evidenceValid: value.evidenceValid as boolean, unfamiliar: value.unfamiliar as boolean,
    confidence: value.confidence as number, locationRef, reason: value.reason.trim(),
  } };
}

function qualifies(attempts: Attempt[]) {
  const window = attempts.slice(-20);
  return window.length >= 20 && rate(window) >= 0.8 && rate(window.slice(-5)) >= 0.8
    && attempts.filter(attempt => time(attempt.occurredAt) - time(attempts[0].occurredAt) >= DELAY).length >= 3;
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
  // A failed latest assessment always prompts repair, even if the aggregate still passes.
  const mastered = qualifies(eligible) && !!latest && passed(latest);
  const state = mastered ? 'mastered' : provisional ? 'provisional' : records.length ? 'learning' : 'new';
  let masteredAt: string | null = null;
  if (mastered) {
    let achievedIndex = eligible.length - 1;
    while (achievedIndex > 0 && qualifies(eligible.slice(0, achievedIndex)) && passed(eligible[achievedIndex - 1])) achievedIndex--;
    masteredAt = eligible[achievedIndex].occurredAt;
  }
  // Every outcome (practice or assessment, explicit or assumed) is one FSRS review: passed = Good, otherwise Again.
  let memory: Memory | null = null;
  for (const attempt of records) memory = review(memory, time(attempt.occurredAt), passed(attempt) ? GOOD : AGAIN);
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
