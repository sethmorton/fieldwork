import { skillStatus, type Attempt, type SkillStatus } from './mastery.ts';

export type CurriculumScope = 'country-identification' | 'within-country-regional' | 'specialist';
const scopes: CurriculumScope[] = ['country-identification', 'within-country-regional', 'specialist'];
const scopeIndex = (skill: PracticeSkill) => scopes.indexOf(skill.curriculum?.scope ?? 'country-identification');
const passed = (attempt: Attempt) => attempt.correct === true && attempt.evidenceValid;

export type PracticeSkill = {
  id: string;
  title: string;
  phase: string;
  prerequisites: string[];
  imageUrls?: string[];
  source?: { title: string; url: string };
  kind?: 'orientation';
  practiceFamily?: string;
  importance?: number;
  recognitionOnly?: boolean;
  contrastSkillIds?: string[];
  availability?: 'available' | 'needs-locations' | 'needs-verification' | 'needs-contrasts';
  curriculum?: { scope: CurriculumScope; rank: number; source?: {
    guide: string; tipId: string; section: number; sourceOrder: number; guideUpdatedAt: string;
    mapping: 'topic-match' | 'partial-topic-match' | 'unresolved'; caveat?: string;
  } };
};
export type PracticePool = {
  id: string;
  title: string;
  skillIds: string[];
  mapUrl: string;
  locationIds?: string[];
};
export type PracticeLocation = {
  id: string;
  lat: number;
  lng: number;
  skillIds: string[];
  region?: string;
  country?: string;
  panoId?: string;
  heading?: number;
  sourceMapId?: string;
};
export type PracticePack = {
  id: string;
  title: string;
  subject: string;
  skills: PracticeSkill[];
  pools: PracticePool[];
  locations?: PracticeLocation[];
  initialSkillIds?: string[];
  maxLocationsPerCountry?: number;
};
type Clock = Date | string | number;
type Plan = {
  pool: PracticePool | null;
  focusSkills: PracticeSkill[];
  reasons: string[];
  locationIds: string[];
  phase: string;
  newSkillIds: string[];
};
function practiceRecords(pack: PracticePack, attempts: Attempt[], now: Clock) {
  const nowMs = new Date(now).getTime();
  if (!Number.isFinite(nowMs)) throw new Error('Invalid current date.');
  const skillIds = new Set(pack.skills.map(skill => skill.id));
  return attempts.map(attempt => [Date.parse(attempt.occurredAt), attempt] as const)
    .filter(([time, attempt]) => skillIds.has(attempt.skillId) && Number.isFinite(time) && time <= nowMs)
    .sort((a, b) => a[0] - b[0]).map(([, attempt]) => attempt);
}

function introductionProgress(pack: PracticePack, records: Attempt[]) {
  const playable = new Set((pack.locations ?? []).map(location => location.skillIds[0]));
  const skills = pack.skills.filter(skill => playable.has(skill.id) && skill.kind !== 'orientation'
    && (!skill.availability || skill.availability === 'available'));
  const levels = new Map(skills.map(skill => [skill.id, scopeIndex(skill)]));
  const windows: Attempt[][] = [[], [], []];
  for (const attempt of records) {
    const level = levels.get(attempt.skillId);
    if (level !== undefined) windows[level].push(attempt);
  }
  const readiness = scopes.map((scope, level) => {
    const recent = windows[level].slice(-20);
    const totalSkills = skills.filter(skill => scopeIndex(skill) === level).length;
    const exposedSkills = new Set(recent.map(attempt => attempt.skillId)).size;
    const introduced = new Set(windows[level].map(attempt => attempt.skillId)).size;
    const coverageRequired = level === 0 ? Math.min(40, totalSkills) : 0;
    const successes = recent.filter(passed).length;
    const accuracy = recent.length ? successes / recent.length : null;
    return { scope, count: recent.length, successes, exposedSkills, accuracy, totalSkills, introduced, coverageRequired,
      ready: introduced >= coverageRequired && recent.length >= 20 && exposedSkills >= Math.min(8, totalSkills)
        && accuracy! >= 0.85 && recent.slice(-5).filter(passed).length >= 4 };
  });
  // A regional-only pack starts at regional foundations, not an absent country-identification gate.
  const base = skills.length ? Math.min(...skills.map(scopeIndex)) : 0;
  let open = base;
  for (let level = base + 1; level < scopes.length; level++) {
    if (!readiness[level].totalSkills) continue;
    if (!readiness[open].ready) break;
    open = level;
  }
  const recent = records.filter(attempt => levels.has(attempt.skillId)).slice(-20);
  const accuracy = recent.length ? recent.filter(passed).length / recent.length : null;
  const newLimit = accuracy === null ? 2 : accuracy >= 0.85 ? 3 : accuracy >= 0.7 ? 2 : 1;
  const label = ['Foundations', 'Regional clues', 'Specialist clues'][base];
  const evidence = readiness[base];
  const hasNext = readiness.some((entry, level) => level > base && entry.totalSkills);
  const nextLabel = readiness[1].totalSkills && base === 0 ? 'Regional clues' : 'Specialist clues';
  const message = `${label}: ${evidence.introduced} of ${evidence.totalSkills} practised.`
    + (!hasNext ? '' : open > base
      ? ` ${open === 2 ? 'Specialist clues' : nextLabel} are open${base === 0 ? ' for countries with strong recent practice' : ''}.`
      : evidence.introduced < evidence.coverageRequired
        ? ` ${nextLabel} open after ${evidence.coverageRequired}, with strong recent answers.`
        : ` Keep practising. Aim for 17 correct in your last 20, including 4 of the last 5.`);
  return { base, open, newLimit, readiness, message };
}

/** Practice-only success can open introductions; it never changes the mastery evidence rule. */
export function curriculumProgress(pack: PracticePack, attempts: Attempt[], now: Clock = Date.now()) {
  return introductionProgress(pack, practiceRecords(pack, attempts, now));
}

const ready = (status: SkillStatus | undefined) => status !== undefined
  && ['provisional', 'mastered', 'oriented'].includes(status.state);

function referenceKeys(reference: string) {
  const keys = [reference.trim()];
  // Only URLs with a query can carry a pano parameter; skipping the parser otherwise is exact and avoids throws.
  if (reference.includes('?')) try {
    const url = new URL(reference);
    const pano = url.searchParams.get('pano') ?? url.searchParams.get('panoid') ?? url.searchParams.get('panoId');
    if (pano) keys.push(pano, `pano:${pano}`);
  } catch { /* A saved location ID need not be a URL. */ }
  if (reference.startsWith('pano:')) keys.push(reference.slice(5));
  return keys;
}

/** Priority-guided mixed retrieval; importance weights are practical heuristics. */
export function planPractice(
  pack: PracticePack,
  attempts: Attempt[],
  { size = 5, now = Date.now(), seenLocationRefs = [], previousSetLocationRefs = [] }: { size?: number; now?: Clock; seenLocationRefs?: string[]; previousSetLocationRefs?: string[] } = {},
): Plan {
  const nowMs = new Date(now).getTime();
  if (!Number.isFinite(nowMs)) throw new Error('Invalid current date.');
  const limit = Number.isFinite(size) ? Math.max(0, Math.min(100, Math.floor(size))) : 5;
  const records = practiceRecords(pack, attempts, now);
  const progression = introductionProgress(pack, records);
  // skillStatus filters to one skill; handing it that skill's records is identical and avoids a skills × history scan.
  const bySkill = new Map<string, Attempt[]>();
  for (const attempt of records) { const list = bySkill.get(attempt.skillId); if (list) list.push(attempt); else bySkill.set(attempt.skillId, [attempt]); }
  const statuses = new Map(pack.skills.map(skill => [skill.id, skillStatus(skill.id, bySkill.get(skill.id) ?? [], now, skill.kind)]));
  const latest = new Map(records.map(attempt => [attempt.skillId, attempt]));
  const family = (skill: PracticeSkill) => skill.practiceFamily ?? skill.id;
  const available = pack.skills.filter(skill => (!skill.availability || skill.availability === 'available')
    && skill.kind !== 'orientation' && skill.prerequisites.every(id => ready(statuses.get(id))
      || ((bySkill.get(id)?.length ?? 0) >= 3 && bySkill.get(id)!.slice(-3).every(passed))));
  const availableIds = new Set(available.map(skill => skill.id));
  const locations = (pack.locations ?? []).filter(location => Number.isFinite(location.lat) && Number.isFinite(location.lng)
    && Math.abs(location.lat) <= 90 && Math.abs(location.lng) <= 180 && availableIds.has(location.skillIds[0]));
  const aliases = (location: PracticeLocation) => [location.id, `${location.lat},${location.lng}`,
    ...(location.panoId ? [location.panoId, `pano:${location.panoId}`] : [])];
  const byReference = new Map(locations.flatMap(location => aliases(location).map(key => [key, location] as const)));
  const restingTargets = new Set(previousSetLocationRefs.flatMap(reference => referenceKeys(reference)
    .map(key => byReference.get(key)?.skillIds[0]).filter((id): id is string => !!id)));
  const observed = new Set<string>();
  for (const reference of [...seenLocationRefs, ...previousSetLocationRefs, ...records.map(attempt => attempt.locationRef)]) {
    for (const key of referenceKeys(reference)) observed.add(key);
  }
  const introduced = new Set([...records.map(attempt => attempt.skillId), ...locations
    .filter(location => aliases(location).some(key => observed.has(key))).map(location => location.skillIds[0])]);
  const isNew = (skill: PracticeSkill) => !introduced.has(skill.id);
  const countriesBySkill = new Map<string, Set<string>>();
  for (const location of locations) {
    if (!location.country) continue;
    const countries = countriesBySkill.get(location.skillIds[0]);
    if (countries) countries.add(location.country);
    else countriesBySkill.set(location.skillIds[0], new Set([location.country]));
  }
  const foundationIds = new Set(available.filter(skill => scopeIndex(skill) === 0).map(skill => skill.id));
  const foundationCountries = new Set([...foundationIds].flatMap(id => [...(countriesBySkill.get(id) ?? [])]));
  const countryRecords = new Map<string, Attempt[]>();
  for (const attempt of records) {
    if (!foundationIds.has(attempt.skillId)) continue;
    const countries = countriesBySkill.get(attempt.skillId);
    const country = referenceKeys(attempt.locationRef).map(key => byReference.get(key)?.country).find(Boolean)
      ?? (countries?.size === 1 ? countries.values().next().value : undefined);
    if (!country) continue;
    const history = countryRecords.get(country);
    if (history) history.push(attempt);
    else countryRecords.set(country, [attempt]);
  }
  const readyCountries = new Set<string>();
  for (const [country, history] of countryRecords) {
    const recent = history.slice(-5);
    if (recent.length >= 3 && recent.filter(passed).length / recent.length >= 0.8 && passed(recent.at(-1)!)) {
      readyCountries.add(country);
    }
  }
  // Missing country lessons are a content gap, not evidence that a novice knows that country.
  const lateCoverage = progression.readiness[0].introduced >= Math.ceil(progression.readiness[0].totalSkills * 0.8);
  const countryOpen = (country: string | undefined) => !!country && readyCountries.has(country)
    || (lateCoverage && (!country || !foundationCountries.has(country)));
  const scopeOpen = (skill: PracticeSkill) => !isNew(skill) || (scopeIndex(skill) <= progression.open
    && (progression.base > 0 || scopeIndex(skill) === 0
      || [...(countriesBySkill.get(skill.id) ?? [undefined])].some(countryOpen)));
  const recentTargets = new Set([...seenLocationRefs.slice(-10).flatMap(reference => referenceKeys(reference)
    .map(key => byReference.get(key)?.skillIds[0]).filter((id): id is string => !!id)), ...records.slice(-10).map(attempt => attempt.skillId)]);
  const seed = `${pack.id}:${records.map(attempt => attempt.id).join('|')}:${seenLocationRefs.join('|')}:${previousSetLocationRefs.join('|')}`;
  // FNV-1a is sequential: continuing from the seed's state equals hashing seed + suffix, without rescanning the seed.
  const fnv = (state: number, value: string) => { for (const char of value) state = Math.imul(state ^ char.charCodeAt(0), 16777619); return state; };
  const seedState = fnv(2166136261, seed);
  const hash = (suffix: string) => fnv(seedState, suffix) >>> 0;
  const scores = new Map<string, number>();
  const score = (skill: PracticeSkill) => {
    let value = scores.get(skill.id);
    if (value === undefined) {
      const last = latest.get(skill.id);
      const error = !!last && (last.correct === false || last.evidenceValid === false);
      value = (skill.importance ?? 25) + Number(!last) * 15 + Number(error) * 35
        + Number(statuses.get(skill.id)!.due) * 20 - Number(recentTargets.has(skill.id)) * 35
        + hash(skill.id) % 21;
      scores.set(skill.id, value);
    }
    return value;
  };
  const pools = pack.pools.map(pool => {
    let mapId: string | undefined;
    try { mapId = new URL(pool.mapUrl).pathname.split('/').filter(Boolean).at(-1); } catch { /* Invalid URLs are rejected by the pack validator. */ }
    const poolSkills = new Set(pool.skillIds), poolLocations = pool.locationIds ? new Set(pool.locationIds) : null;
    const members = locations.filter(location => poolSkills.has(location.skillIds[0])
      && (poolLocations ? poolLocations.has(location.id)
        : !location.sourceMapId || location.sourceMapId === pool.id || location.sourceMapId === mapId));
    const memberSkills = new Set(members.map(location => location.skillIds[0]));
    const skills = available.filter(skill => memberSkills.has(skill.id));
    return { pool, members, skills, families: new Set(skills.map(family)).size,
      openFamilies: new Set(skills.filter(scopeOpen).map(family)).size, best: Math.max(-Infinity, ...skills.map(score)) };
  }).sort((a, b) => Math.min(limit, b.openFamilies) - Math.min(limit, a.openFamilies)
    || Math.min(limit, b.families) - Math.min(limit, a.families) || b.best - a.best);
  const chosen = pools[0];
  if (!chosen || !chosen.skills.length) return { pool: null, focusSkills: [], reasons: ['No available clue families have real tagged locations in a compatible pool.'], locationIds: [], phase: 'Not ready', newSkillIds: [] };
  // Only FSRS-due reviews are urgent; a due miss leads other due reviews.
  const urgency = (skill: PracticeSkill) => statuses.get(skill.id)!.due ? 1 + 2 * Number(latest.get(skill.id)?.correct === false
    || latest.get(skill.id)?.evidenceValid === false) : 0;
  // Most-forgotten first (lowest current retrievability); clues without outcomes count as fully retained.
  const ranked = [...chosen.skills].sort((a, b) => Number(restingTargets.has(a.id)) - Number(restingTargets.has(b.id))
    || urgency(b) - urgency(a) || (statuses.get(a.id)!.retrievability ?? 1) - (statuses.get(b.id)!.retrievability ?? 1)
    || score(b) - score(a) || a.id.localeCompare(b.id));
  const introductions = ranked.filter(isNew).sort((a, b) => scopeIndex(a) - scopeIndex(b)
    || (a.curriculum?.rank ?? Number.MAX_SAFE_INTEGER) - (b.curriculum?.rank ?? Number.MAX_SAFE_INTEGER)
    || score(b) - score(a) || a.id.localeCompare(b.id));
  const membersBySkill = new Map<string, PracticeLocation[]>();
  for (const location of chosen.members) { const list = membersBySkill.get(location.skillIds[0]); if (list) list.push(location); else membersBySkill.set(location.skillIds[0], [location]); }
  const usedFamilies = new Set<string>(), usedPanoramas = new Set<string>();
  const selected: PracticeLocation[] = [], focusSkills: PracticeSkill[] = [];
  const addTargets = (skills: PracticeSkill[], targetSize: number, relaxScope = false) => { for (const skill of skills) {
    if (selected.length >= targetSize) break;
    if (usedFamilies.has(family(skill))) continue;
    if (!relaxScope && (!scopeOpen(skill) || (scopeIndex(skill) > progression.base
      && focusSkills.some(other => scopeIndex(other) === scopeIndex(skill))))) continue;
    const candidates = (membersBySkill.get(skill.id) ?? []).filter(location => !usedPanoramas.has(location.panoId ?? location.id)
      && (relaxScope || progression.base > 0 || scopeIndex(skill) === 0 || !isNew(skill) || countryOpen(location.country))
      && (!pack.maxLocationsPerCountry || (location.country && selected.filter(other=>other.country===location.country).length<pack.maxLocationsPerCountry)));
    const seen = (location: PracticeLocation) => aliases(location).some(key => observed.has(key));
    const regionCount = (location: PracticeLocation) => location.region ? selected.filter(other => other.region === location.region).length : 0;
    candidates.sort((a, b) => Number(seen(a)) - Number(seen(b)) || regionCount(a) - regionCount(b)
      || hash(a.id) - hash(b.id));
    const location = candidates[0];
    if (!location) continue;
    selected.push(location); focusSkills.push(skill); usedFamilies.add(family(skill)); usedPanoramas.add(location.panoId ?? location.id);
  }};
  // Reserve one target per advanced scope; a weak/due review takes its introduction slot.
  for (let level = progression.base + 1; level <= progression.open; level++) {
    const needsReview = ranked.filter(skill => scopeIndex(skill) === level && !isNew(skill)
      && !restingTargets.has(skill.id) && urgency(skill) > 0);
    addTargets([...needsReview, ...introductions.filter(skill => scopeIndex(skill) === level)],
      Math.min(selected.length + 1, progression.newLimit, limit));
  }
  // Reserve review slots before a new clue can consume a weak/due clue's family.
  addTargets(ranked.filter(skill => !isNew(skill) && !restingTargets.has(skill.id) && urgency(skill) > 0),
    Math.max(selected.length, limit - progression.newLimit));
  addTargets(introductions.filter(skill => !restingTargets.has(skill.id)),
    Math.min(selected.length + progression.newLimit - focusSkills.filter(isNew).length, limit));
  // Remaining due reviews, then not-yet-due reviews (most forgotten first) only when the set is still short.
  addTargets(ranked.filter(skill => !isNew(skill) && !restingTargets.has(skill.id)), limit);
  // Five families and previous-set rest outrank the new-item budget during cold start/replenishment.
  addTargets(introductions.filter(skill => !restingTargets.has(skill.id)), limit);
  addTargets(ranked.filter(scopeOpen), limit);
  // Sparse/custom packs must remain playable. Relax curriculum only after exhausting open material.
  const beforeFallback = selected.length;
  addTargets([...ranked.filter(skill => !isNew(skill)), ...introductions], limit, true);
  // GeoGuessr chooses its own round order; do not publish a syllabus-ordered coordinate list.
  selected.sort((a, b) => hash(':order:' + a.id) - hash(':order:' + b.id));
  const reasons = [progression.message,
    `Aim for ${progression.newLimit} new clues and the rest review; cold starts and family/country constraints can require more.`,
    'Targets from the previous set rest for one set when enough other location-backed families are available, including after a miss.',
    `${selected.length} distinct clue families selected; ${selected.filter(location => !aliases(location).some(key => observed.has(key))).length} unseen panoramas.`,
    'Assumed recognition can guide practice, but does not establish verified mastery.'];
  if (selected.length > beforeFallback) reasons.push('Curriculum limits relaxed to fill distinct families in this small pool.');
  if (selected.length < limit) reasons.push(`Only ${selected.length} distinct location-backed families are available; repeated clues will not fill the missing slots.`);
  return { pool: chosen.pool, focusSkills, reasons, locationIds: selected.map(location => location.id), phase: 'Mixed practice',
    newSkillIds: focusSkills.filter(isNew).map(skill => skill.id) };
}
