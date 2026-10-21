import { skillStatus, type Attempt, type SkillStatus } from './mastery.ts';

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
const ready = (status: SkillStatus | undefined) => status !== undefined
  && ['provisional', 'mastered', 'oriented'].includes(status.state);

function referenceKeys(reference: string) {
  const keys = [reference.trim()];
  try {
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
  const records = attempts.filter(attempt => pack.skills.some(skill => skill.id === attempt.skillId)
    && Number.isFinite(Date.parse(attempt.occurredAt)) && Date.parse(attempt.occurredAt) <= nowMs)
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  const statuses = new Map(pack.skills.map(skill => [skill.id, skillStatus(skill.id, records, now, skill.kind)]));
  const latest = new Map(records.map(attempt => [attempt.skillId, attempt]));
  const family = (skill: PracticeSkill) => skill.practiceFamily ?? skill.id;
  const available = pack.skills.filter(skill => (!skill.availability || skill.availability === 'available')
    && skill.kind !== 'orientation' && skill.prerequisites.every(id => ready(statuses.get(id))));
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
  const recentTargets = new Set([...seenLocationRefs.slice(-10).flatMap(reference => referenceKeys(reference)
    .map(key => byReference.get(key)?.skillIds[0]).filter((id): id is string => !!id)), ...records.slice(-10).map(attempt => attempt.skillId)]);
  const seed = `${pack.id}:${records.map(attempt => attempt.id).join('|')}:${seenLocationRefs.join('|')}:${previousSetLocationRefs.join('|')}`;
  const hash = (value: string) => { let result = 2166136261; for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619); return result >>> 0; };
  const score = (skill: PracticeSkill) => {
    const last = latest.get(skill.id);
    const error = !!last && (last.correct === false || last.evidenceValid === false);
    const age = last ? Math.min(15, Math.max(0, (nowMs - Date.parse(last.occurredAt)) / 86400000) * 3) : 0;
    return (skill.importance ?? 25) + Number(!last) * 15 + Number(error) * 35
      + Number(statuses.get(skill.id)!.due) * 20 + age - Number(recentTargets.has(skill.id)) * 35
      + hash(seed + skill.id) % 21;
  };
  const pools = pack.pools.map(pool => {
    let mapId: string | undefined;
    try { mapId = new URL(pool.mapUrl).pathname.split('/').filter(Boolean).at(-1); } catch { /* Invalid URLs are rejected by the pack validator. */ }
    const members = locations.filter(location => pool.skillIds.includes(location.skillIds[0])
      && (pool.locationIds ? pool.locationIds.includes(location.id)
        : !location.sourceMapId || location.sourceMapId === pool.id || location.sourceMapId === mapId));
    const skills = available.filter(skill => members.some(location => location.skillIds[0] === skill.id));
    return { pool, members, skills, families: new Set(skills.map(family)).size };
  }).sort((a, b) => Math.min(limit, b.families) - Math.min(limit, a.families)
    || Math.max(-Infinity, ...b.skills.map(score)) - Math.max(-Infinity, ...a.skills.map(score)));
  const chosen = pools[0];
  if (!chosen || !chosen.skills.length) return { pool: null, focusSkills: [], reasons: ['No available clue families have real tagged locations in a compatible pool.'], locationIds: [], phase: 'Not ready', newSkillIds: [] };
  const urgency = (skill: PracticeSkill) => Number(latest.get(skill.id)?.correct === false || latest.get(skill.id)?.evidenceValid === false) * 2
    + Number(statuses.get(skill.id)!.due);
  const ranked = [...chosen.skills].sort((a, b) => Number(restingTargets.has(a.id)) - Number(restingTargets.has(b.id))
    || urgency(b) - urgency(a) || score(b) - score(a) || a.id.localeCompare(b.id));
  const usedFamilies = new Set<string>(), usedPanoramas = new Set<string>();
  const selected: PracticeLocation[] = [], focusSkills: PracticeSkill[] = [];
  const addTargets = (skills: PracticeSkill[], targetSize: number) => { for (const skill of skills) {
    if (selected.length >= targetSize) break;
    if (usedFamilies.has(family(skill))) continue;
    const candidates = chosen.members.filter(location => location.skillIds[0] === skill.id
      && !usedPanoramas.has(location.panoId ?? location.id)
      && (!pack.maxLocationsPerCountry || (location.country && selected.filter(other=>other.country===location.country).length<pack.maxLocationsPerCountry)));
    const seen = (location: PracticeLocation) => aliases(location).some(key => observed.has(key));
    const regionCount = (location: PracticeLocation) => location.region ? selected.filter(other => other.region === location.region).length : 0;
    candidates.sort((a, b) => Number(seen(a)) - Number(seen(b)) || regionCount(a) - regionCount(b)
      || hash(seed + a.id) - hash(seed + b.id));
    const location = candidates[0];
    if (!location) continue;
    selected.push(location); focusSkills.push(skill); usedFamilies.add(family(skill)); usedPanoramas.add(location.panoId ?? location.id);
  }};
  addTargets(ranked.filter(isNew), Math.min(3, limit));
  addTargets(ranked.filter(skill => !isNew(skill) && !restingTargets.has(skill.id)), limit);
  addTargets(ranked.filter(skill => !restingTargets.has(skill.id)), limit);
  addTargets(ranked, limit);
  // GeoGuessr chooses its own round order; do not publish a syllabus-ordered coordinate list.
  selected.sort((a, b) => hash(seed + ':order:' + a.id) - hash(seed + ':order:' + b.id));
  const reasons = ['One target per clue family; priorities mix foundations, gaps, errors and older review without a sequential completion gate.',
    'Aim for three previously unexposed targets and two reviews per five, subject to available families and locations.',
    'Targets from the previous set rest for one set when enough other location-backed families are available, including after a miss.',
    `${selected.length} distinct clue families selected; ${selected.filter(location => !aliases(location).some(key => observed.has(key))).length} unseen panoramas.`,
    'Assumed recognition can guide practice, but does not establish verified mastery.'];
  if (selected.length < limit) reasons.push(`Only ${selected.length} distinct location-backed families are available; repeated clues will not fill the missing slots.`);
  return { pool: chosen.pool, focusSkills, reasons, locationIds: selected.map(location => location.id), phase: 'Mixed practice',
    newSkillIds: focusSkills.filter(isNew).map(skill => skill.id) };
}
