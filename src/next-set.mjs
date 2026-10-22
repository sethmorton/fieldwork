import { MAX_PER_FAMILY, planPractice } from './lib/adaptive.ts';

export function updatedPack(stored,bundled) {
  if(!stored)return bundled;
  if(stored.id!==bundled.id || (stored.contentRevision??0)>=(bundled.contentRevision??0))return stored;
  return stored.practiceMapId?{...bundled,practiceMapId:stored.practiceMapId}:bundled;
}

export function validatePack(pack) {
  if (!pack || typeof pack.id !== 'string' || typeof pack.title !== 'string' || typeof pack.subject !== 'string'
    || !Array.isArray(pack.skills) || !pack.skills.length || !Array.isArray(pack.pools) || !Array.isArray(pack.locations))
    throw new Error('A pack needs id, title, subject, skills, pools and real tagged locations.');
  if(pack.maxLocationsPerCountry!==undefined&&(!Number.isInteger(pack.maxLocationsPerCountry)||pack.maxLocationsPerCountry<1))throw Error('Country limit must be a positive integer.');
  if(pack.gradingPolicy!==undefined&&pack.gradingPolicy!=='recognition')throw Error('Unknown grading policy.');
  const skills = new Set(pack.skills.map(skill => skill.id));
  if (skills.size !== pack.skills.length) throw new Error('Skill IDs must be unique.');
  for (const skill of pack.skills) {
    if (typeof skill.id !== 'string' || !skill.id || typeof skill.title !== 'string' || typeof skill.phase !== 'string'
      || !Array.isArray(skill.prerequisites) || skill.prerequisites.some(id => !skills.has(id))) throw new Error('Invalid skill or prerequisite.');
    if (skill.availability !== undefined && !['available','needs-locations','needs-verification','needs-contrasts'].includes(skill.availability)) throw new Error('Unknown skill availability; unresolved content cannot become active by default.');
    if ((skill.practiceFamily !== undefined && (typeof skill.practiceFamily!=='string'||!skill.practiceFamily.trim()))
      || (skill.importance !== undefined && !Number.isFinite(skill.importance))) throw new Error('Invalid clue family or importance.');
    if (skill.curriculum !== undefined && (!skill.curriculum
      || !['country-identification','within-country-regional','specialist'].includes(skill.curriculum.scope)
      || !Number.isSafeInteger(skill.curriculum.rank))) throw new Error('Invalid curriculum scope or rank.');
  }
  const byId = new Map(pack.skills.map(skill => [skill.id, skill])), visited = new Map();
  const visit = id => {
    if(visited.get(id)===2) return;
    if(visited.get(id)===1) throw new Error('Prerequisites contain a cycle.');
    visited.set(id,1);
    for(const child of byId.get(id).prerequisites) visit(child);
    visited.set(id,2);
  };
  pack.skills.forEach(skill=>visit(skill.id));
  const locations = new Set();
  for (const location of pack.locations) {
    if (typeof location.id !== 'string' || locations.has(location.id) || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)
      || Math.abs(location.lat)>90 || Math.abs(location.lng)>180 || typeof location.panoId !== 'string' || !location.panoId
      || !Array.isArray(location.skillIds) || !location.skillIds.length || location.skillIds.some(id=>!skills.has(id))) throw new Error('Invalid, duplicate or untagged location.');
    locations.add(location.id);
  }
  for (const pool of pack.pools) {
    if(typeof pool.id !== 'string' || !Array.isArray(pool.skillIds) || pool.skillIds.some(id=>!skills.has(id))
      || !/^https:\/\/www\.geoguessr\.com\/maps\/[a-f\d]{24}$/i.test(pool.mapUrl)
      || (pool.locationIds && (!Array.isArray(pool.locationIds) || pool.locationIds.some(id=>!locations.has(id))))) throw new Error('Invalid practice pool.');
  }
  const locationsBySkill = new Map();
  for (const location of pack.locations) {
    if(locationsBySkill.has(location.skillIds[0])) locationsBySkill.get(location.skillIds[0]).push(location);
    else locationsBySkill.set(location.skillIds[0],[location]);
  }
  const pools = pack.pools.map(pool=>({pool,skillIds:new Set(pool.skillIds),locationIds:pool.locationIds&&new Set(pool.locationIds)}));
  for (const skill of pack.skills.filter(skill=>!skill.availability||skill.availability==='available')) {
    for (const id of skill.prerequisites) {
      const prerequisite=byId.get(id);
      if ((prerequisite.availability&&prerequisite.availability!=='available')
        || (prerequisite.kind!=='orientation'&&!(locationsBySkill.get(id)??[]).some(location=>pools.some(({pool,skillIds,locationIds})=>
          skillIds.has(id)&&(locationIds?locationIds.has(location.id)
            :!location.sourceMapId||location.sourceMapId===pool.id||pool.mapUrl.endsWith('/'+location.sourceMapId))))))
        throw new Error('An active prerequisite needs playable practice evidence or source-recall orientation.');
    }
  }
  return pack;
}
export function makeNextSet(pack, attempts, options = {}) {
  validatePack(pack);
  if(!Array.isArray(attempts)) throw new Error('Results must be an attempt array.');
  const plan = planPractice(pack,attempts,{size:options.size??5,now:options.now??Date.now(),seenLocationRefs:options.seenLocationRefs??[],previousSetLocationRefs:options.previousSetLocationRefs??[]});
  const selected = plan.locationIds.map(id=>pack.locations.find(location=>location.id===id));
  if (selected.length < (options.size??5)) throw new Error(`Need ${options.size??5} location-backed clues, at most ${MAX_PER_FAMILY} per family. ${plan.reasons.at(-1)}`);
  return {
    packId:pack.id, phase:plan.phase, focus:plan.focusSkills.map(({id,title})=>({id,title})), reasons:plan.reasons,
    // Assignment is a training selection; it is not evidence that a clue was recognized.
    selectedLocations:selected,
    mapMaking: { name:`Practice · ${pack.title}`, customCoordinates:selected.map(location=>({
      lat:location.lat,lng:location.lng,panoId:location.panoId,heading:location.heading??0,pitch:location.pitch??0,zoom:location.zoom??0,
      countryCode:null,stateCode:null,extra:{tags:location.skillIds},
    })) },
    sourceNotes: pack.skills.filter(skill=>plan.focusSkills.some(focus=>focus.id===skill.id)),
  };
}
