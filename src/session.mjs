import {regionAt} from './geo.mjs';
import {MAX_PER_FAMILY} from './lib/adaptive.ts';
import {skillStatus} from './lib/mastery.ts';
import {notice} from './load-errors.mjs';

/** Only render this after a completed guess; never disclose an upcoming target. */
export function practiceFeedback(history,round,now=Date.now()) {
  const nowMs=new Date(now).getTime();
  const prior=history.filter(attempt=>attempt.skillId===round.location.skillIds[0]&&attempt.id!==round.id
    && Date.parse(attempt.occurredAt)<=nowMs).sort((a,b)=>Date.parse(a.occurredAt)-Date.parse(b.occurredAt));
  const latest=prior.at(-1);
  return !latest?'New clue'
    :latest.correct===false||latest.evidenceValid===false?'Review: you missed this last time':'Review';
}

export function completedRound(pack,state) {
  if(!state || state.map?.id!==pack.practiceMapId || state.round_in_progress!==false
    || !Number.isInteger(state.current_round) || state.current_round<1 || !state.current_game_id) return null;
  const round=state.rounds?.[state.current_round-1];
  if(!round?.location?.panoId || !Number.isFinite(round.player_guess?.lat) || !Number.isFinite(round.player_guess?.lng)) return null;
  const location=pack.locations.find(location=>location.panoId===round.location.panoId);
  if(!location) return null;
  const guessedRegion=regionAt(round.player_guess.lat,round.player_guess.lng,pack.regionFeatures??[]);
  return {id:`${pack.id}:${state.current_game_id}:${state.current_round}`,location,
    round:state.current_round,gameId:state.current_game_id,
    correct:guessedRegion&&location.region?guessedRegion===location.region:null};
}

export function recordRecognition(pack,history,round,{recognized,knew=false,familiar=false,correct=round.correct,assumed=false},now=new Date()) {
  const skill=pack.skills.find(skill=>skill.id===round.location.skillIds[0]);
  if(!skill) throw Error('Unknown clue.');
  // gradingPolicy 'recognition' (and recognition-only clues): spotted = Good, missed = Again; the geographic result is kept as regionCorrect.
  const byRecognition=skill.recognitionOnly||pack.gradingPolicy==='recognition';
  // Without either, a map scored only by country cannot judge a regional/specialist clue; with no country result, spotted/missed decides it.
  // Elsewhere an unknown region result stays unknown: practice, but no scheduler review.
  const recognitionDecides=byRecognition||(typeof correct!=='boolean'&&!!round.location.country&&round.location.region===round.location.country
    &&(skill.curriculum?.scope??'country-identification')!=='country-identification');
  if(typeof recognized!=='boolean' || (!assumed&&!recognitionDecides&&recognized&&typeof correct!=='boolean')) throw notice('Confirm clue recognition and the region result.');
  const prior=history.find(attempt=>attempt.id===round.id);
  if(prior && (assumed || prior.feedbackSource!=='assumed-on-advance'))return history;
  const wasSeen=history.some(attempt=>attempt.id!==round.id&&attempt.locationRef===round.location.id);
  const attempt={id:round.id,skillId:round.location.skillIds[0],occurredAt:now.toISOString(),
    correct:recognitionDecides?recognized:correct,regionCorrect:correct,evidenceValid:recognized,confidence:recognized&&knew?3:2,unfamiliar:!familiar&&!wasSeen,
    ...(recognized&&knew?{grade:'easy'}:{}),
    locationRef:round.location.id,mode:assumed||round.location.assessmentEligible===false||(!skill.recognitionOnly&&correct===null)?'practice':'assessment',feedbackSource:assumed?'assumed-on-advance':'explicit',
    reason:(assumed?'Recognition assumed on advance by learner preference; not verified mastery evidence.'
      :round.location.assessmentEligible===false?'Source teaching example; practice only, not unseen assessment evidence.'
      :skill.recognitionOnly?'Explicit visual-feature recognition; geographic result recorded separately. Country discrimination was not tested.'
        :'Region result plus self-reported clue recognition after reveal. Confidence was not measured (neutral default).')
      +(recognized&&knew?' Learner marked it known cold (confidence 3, Easy).':'')};
  // Duplicate framework events and reloads cannot create extra evidence.
  return prior?history.map(item=>item.id===attempt.id?attempt:item):[...history,attempt];
}

/** Clues a quick check can clear: playable ones that are new or on a minutes-long learning/relearning step, in the order
 *  practice introduces them (scope, then curriculum rank). A clue on a scheduled interval of a day or more stays with FSRS
 *  until a miss puts it back on a step, so a card can never replace a due panorama review. */
export function quickCheckQueue(pack,history,now=Date.now()) {
  const nowMs=new Date(now).getTime(),playable=new Set(pack.locations.map(location=>location.skillIds[0]));
  const bySkill=Map.groupBy(history.filter(attempt=>Date.parse(attempt.occurredAt)<=nowMs),attempt=>attempt.skillId);
  const graded=attempt=>attempt.correct!==null||attempt.evidenceValid===false;
  const onStep=skill=>{const records=bySkill.get(skill.id)?.filter(graded);if(!records?.length)return true;const due=skillStatus(skill.id,records,nowMs).reviewDueAt;
    return Date.parse(due)-Math.max(...records.map(attempt=>Date.parse(attempt.occurredAt)))<86400000};
  const scope=skill=>['country-identification','within-country-regional','specialist'].indexOf(skill.curriculum?.scope??'country-identification');
  return pack.skills.filter(skill=>playable.has(skill.id)&&skill.kind!=='orientation'&&(!skill.availability||skill.availability==='available')&&onStep(skill))
    .sort((a,b)=>scope(a)-scope(b)||(a.curriculum?.rank??Number.MAX_SAFE_INTEGER)-(b.curriculum?.rank??Number.MAX_SAFE_INTEGER)||a.id.localeCompare(b.id));
}

/** "Knew it" in a quick check: one Easy review from the card alone (grade 'easy', no panorama). FSRS brings the clue
 *  back in about a week to confirm; a miss then restarts it normally. */
export function recordKnown(pack,history,skillId,now=new Date()) {
  if(!pack.skills.some(skill=>skill.id===skillId)) throw Error('Unknown clue.');
  return [...history,{id:`${pack.id}:quick-check:${skillId}:${now.getTime()}`,skillId,occurredAt:now.toISOString(),correct:true,regionCorrect:null,
    evidenceValid:true,confidence:3,grade:'easy',unfamiliar:false,locationRef:'',mode:'practice',feedbackSource:'quick-check',
    reason:'Quick check: the learner already knew this clue from its card; not panorama evidence.'}];
}

/** Clues missed outside Fieldwork (competitive duel rounds, from tools/world-pack/duels.py). Each is one explicit miss at
 *  the time it happened, so FSRS makes the clue due now and the planner leads with it like any due miss. Idempotent by
 *  id, and clues the pack does not contain are ignored. */
export function recordMissed(pack,history,missed){
  const known=new Set(history.map(attempt=>attempt.id)),skills=new Set(pack.skills.map(skill=>skill.id));
  const added=missed.filter(item=>!known.has(item.id)&&skills.has(item.skillId)&&Number.isFinite(Date.parse(item.occurredAt)))
    .map(item=>({id:item.id,skillId:item.skillId,occurredAt:item.occurredAt,correct:false,regionCorrect:null,evidenceValid:false,
      confidence:2,unfamiliar:true,locationRef:'',mode:'practice',feedbackSource:'missed-elsewhere',reason:String(item.reason).slice(0,2000)}));
  return added.length?[...history,...added]:history;
}

export function advanceRecognition(pack,history,pending,nextState,now=new Date()) {
  if(!pending || nextState?.map?.id!==pack.practiceMapId || nextState.current_game_id!==pending.round.gameId
    || !Number.isInteger(nextState.current_round) || nextState.current_round<=pending.round.round)return history;
  return recordRecognition(pack,history,pending.round,{recognized:true,familiar:pending.familiar,correct:pending.correct,assumed:true},now);
}

export async function publishPracticeSet(pack,set,request,backup) {
  const id=pack.practiceMapId;
  if(!/^[a-f\d]{24}$/i.test(id??'') || pack.pools.some(pool=>pool.id===id||pool.mapUrl.endsWith('/'+id))
    || pack.locations.some(location=>location.sourceMapId===id)) throw notice('Use a separate owned practice map, never the source map.');
  const coordinates=set.mapMaking.customCoordinates;
  if(coordinates.length!==5 || new Set(coordinates.map(location=>location.panoId)).size!==5
    || coordinates.some(location=>!pack.locations.some(source=>source.panoId===location.panoId&&source.lat===location.lat&&source.lng===location.lng))) throw Error('A practice map requires five distinct source panoramas.');
  const families=coordinates.map(location=>{
    const source=pack.locations.find(source=>source.panoId===location.panoId);
    const skill=pack.skills.find(skill=>skill.id===source.skillIds[0]);
    return skill.practiceFamily??skill.id;
  });
  if(families.some(family=>families.filter(value=>value===family).length>MAX_PER_FAMILY))throw Error(`A practice map allows at most ${MAX_PER_FAMILY} clues per family.`);
  if(pack.maxLocationsPerCountry){
    const countries=coordinates.map(location=>pack.locations.find(source=>source.panoId===location.panoId).country);
    if(countries.some(country=>!country||countries.filter(value=>value===country).length>pack.maxLocationsPerCountry))throw Error('This practice pack requires a varied set of known countries.');
  }
  const url=`/api/v4/user-maps/drafts/${id}`;
  const draft=await request(url);
  if(typeof draft.name!=='string'||!draft.name.startsWith('Fieldwork')||!Number.isInteger(draft.version)) throw notice('Open your dedicated Fieldwork map. Its draft could not be verified.');
  await backup(draft);
  const {name,avatar,description,highlighted}=draft;
  await request(url,{method:'PUT',body:JSON.stringify({name,avatar,description,highlighted,version:draft.version+1,customCoordinates:coordinates})});
  await request(url+'/publish',{method:'PUT',body:'{}'});
}
