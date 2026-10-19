export type Skill = { id: string; title: string; prerequisites: string[]; order: number; kind?: 'orientation' };
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
  reviewDueAt: string | null;
  due: boolean;
  overconfidentErrors: number;
  reason: string;
};
const DAY = 24 * 60 * 60 * 1000;
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
    && Number.isFinite(time(attempt.occurredAt)) && time(attempt.occurredAt) <= nowMs);
  if (kind === 'orientation') {
    const oriented = records.some(attempt => attempt.mode === 'practice' && passed(attempt));
    return {
      skillId, state: oriented ? 'oriented' : records.length ? 'learning' : 'new',
      eligibleCount: 0, accuracy: null, recentAccuracy: null, firstEvidenceAt: null,
      lastEvidenceAt: null, masteredAt: null, reviewDueAt: null, due: false, overconfidentErrors: 0,
      reason: oriented ? 'Orientation completed through source recall. This does not establish panorama mastery.'
        : 'Complete the guided source-recall exercise to finish this orientation.',
    };
  }
  const unique = new Map<string, Attempt>();
  for (const attempt of [...records].sort((a, b) => time(a.occurredAt) - time(b.occurredAt))) {
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
  let reviewDueAt: string | null = null;
  if (mastered) {
    let achievedIndex = eligible.length - 1;
    while (achievedIndex > 0 && qualifies(eligible.slice(0, achievedIndex)) && passed(eligible[achievedIndex - 1])) achievedIndex--;
    masteredAt = eligible[achievedIndex].occurredAt;
    let reviewedAt = time(masteredAt);
    let reviewCount = 0;
    for (const attempt of eligible.slice(achievedIndex + 1)) {
      if (passed(attempt) && time(attempt.occurredAt) - reviewedAt >= DELAY) {
        reviewedAt = time(attempt.occurredAt);
        reviewCount++;
      }
    }
    reviewDueAt = iso(reviewedAt + [1, 3, 7, 14][Math.min(reviewCount, 3)] * DAY);
  } else if (latest && !passed(latest)) {
    reviewDueAt = latest.occurredAt;
  } else if (provisional && latest) {
    reviewDueAt = iso(time(latest.occurredAt) + DAY);
  }
  let reason = 'Start with a guided lesson, then try an unfamiliar location.';
  if (state === 'learning') reason = `${window.length}/10 unique unfamiliar assessments; practice alone does not establish mastery.`;
  if (state === 'provisional') reason = `Provisional: ${window.length} unique assessments, ${Math.round(accuracy! * 100)}% correct with valid evidence. Need 20, a delayed check, and 80% on the latest five.`;
  if (state === 'mastered') reason = `Mastered on self-reported evidence: 20 unique assessments, ${Math.round(accuracy! * 100)}% correct with valid evidence, including a delayed check.`;
  if (latest && !passed(latest)) reason = 'The latest unfamiliar assessment failed the answer or evidence check. Review this skill before advancing.';
  return {
    skillId, state, eligibleCount: window.length, accuracy, recentAccuracy,
    firstEvidenceAt: window[0]?.occurredAt ?? null, lastEvidenceAt: latest?.occurredAt ?? null,
    masteredAt, reviewDueAt, due: reviewDueAt !== null && time(reviewDueAt) <= nowMs,
    overconfidentErrors: window.filter(attempt => !passed(attempt) && attempt.confidence === 3).length,
    reason,
  };
}

export function recommendNext(skills: Skill[], attempts: Attempt[], now: Clock = Date.now()) {
  const statuses = new Map(skills.map(skill => [skill.id, skillStatus(skill.id, attempts, now, skill.kind)]));
  const ready = (state: SkillStatus['state'] | undefined) => state === 'mastered' || state === 'oriented';
  const unlocked = skills.filter(skill => skill.prerequisites.every(id => ready(statuses.get(id)?.state)));
  const overdue = unlocked.filter(skill => statuses.get(skill.id)!.due).sort((a, b) => {
    const left = statuses.get(a.id)!;
    const right = statuses.get(b.id)!;
    const learned = (status: SkillStatus) => Number(status.state === 'mastered' || status.state === 'provisional');
    return learned(right) - learned(left) || right.overconfidentErrors - left.overconfidentErrors
      || time(left.reviewDueAt!) - time(right.reviewDueAt!) || a.order - b.order;
  })[0];
  if (overdue) return { skill: overdue, kind: 'review' as const, reason: statuses.get(overdue.id)!.reason, dueAt: statuses.get(overdue.id)!.reviewDueAt };
  const ordered = [...unlocked].sort((a, b) => a.order - b.order);
  const next = ordered.find(skill => !ready(statuses.get(skill.id)!.state) && statuses.get(skill.id)!.state !== 'provisional');
  if (next) return { skill: next, kind: 'learn' as const, reason: statuses.get(next.id)!.reason, dueAt: statuses.get(next.id)!.reviewDueAt };
  const waiting = ordered.find(skill => statuses.get(skill.id)!.state === 'provisional');
  if (waiting) return { skill: waiting, kind: 'learn' as const,
    reason: 'This skill is provisional. Return for its delayed check when due; repeated practice today cannot replace that check.',
    dueAt: statuses.get(waiting.id)!.reviewDueAt };
  const complete = skills.every(skill => ready(statuses.get(skill.id)!.state));
  return { skill: null, kind: complete ? 'complete' as const : 'blocked' as const,
    reason: complete ? 'All skills meet the current evidence rule. Return when a review is due.' : 'Remaining skills require prerequisites that have not been mastered.', dueAt: null };
}

export function progressSummary(skills: Skill[], attempts: Attempt[], now: Clock = Date.now()) {
  const statuses = skills.map(skill => skillStatus(skill.id, attempts, now, skill.kind));
  const count = (state: SkillStatus['state']) => statuses.filter(status => status.state === state).length;
  const totalMasterySkills = skills.filter(skill => skill.kind !== 'orientation').length;
  return { total: skills.length, totalMasterySkills, oriented: count('oriented'), mastered: count('mastered'), provisional: count('provisional'), learning: count('learning'),
    new: count('new'), due: statuses.filter(status => status.due).length,
    percentMastered: totalMasterySkills ? Math.round(count('mastered') / totalMasterySkills * 100) : 0 };
}
