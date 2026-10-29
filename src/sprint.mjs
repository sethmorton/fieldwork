import { notice } from './load-errors.mjs';

// Sprint scheduler: breadth over depth. A clue is learned once its last explicit attempt is a spot and it has two explicit
// spots on panoramas new to that card, or one such spot marked "Knew it": a spot on a panorama the card already showed
// counts for nothing (win/LearnSeth.md: 84% right on a repeat vs 50% on a new one) until the card has shown all of its
// panoramas, after which any spot counts (endgame). It retires for good only after one more explicit spot, on any of its
// panoramas (most cards have two), at least 12 hours (occurredAt) after the spot that made it learned. A sooner spot does
// not count. A miss reactivates any clue. Explicit includes 'auto' (graded from the guessed country). Review gaps count
// rounds: the clock is the attempt count, so each completed round is one tick.
const GAP={missed:5,learning:20},CHECK_AFTER=12*3600e3,DUE_CAP=3,POLES_CAP=1;
// Share of Seth's bad-round losses by clue type (win/ClueMix.md): landscape, duel, contrast 1; unlisted 1.
const SUBJECT_WEIGHT={roads:0.8,poles:0.6,car:0.5,signs:0.2,architecture:0.2};
const explicit=attempt=>attempt.feedbackSource!=='assumed-on-advance';
// Opt-in cell coverage (pack.cellCoverage: true; us-vegetation): a clue's locations carry a cell (`state`) and that cell's
// share of the clue's ACoW pool (`cellShare`). A clue cannot become learned, so cannot retire, until every cell it has a
// panorama in has been shown once. Picks prefer a cell never shown, largest share first, then the least recently used
// panorama. Packs without the field are unchanged.
const requiredCells=(pack,locations)=>new Set(pack.cellCoverage?locations.filter(location=>location.state).map(location=>location.state):[]);

// Opt-in coaching (us-vegetation). pack.warmup (region codes): while under 30% of the last 20 graded rounds were spots, picks
// stay in those visually distinct regions, and a pin in the right L2 family counts as close; at 60% the full map returns.
// The mode is replayed from attempts, never stored. pack.contrasts: after a miss pinned in another region (A true, B pinned),
// the next set opens with a panorama of A (else B) the learner has not seen, a rule check; the first set of a later day
// re-checks regions missed the day before or a week before, on unseen panoramas.
const WARMUP_IN=0.3,WARMUP_OUT=0.6,WINDOW=20,RULE_CHECKS=2,RULE_WINDOW=10,DAY=864e5;
const graded=attempts=>attempts.filter(attempt=>explicit(attempt)&&typeof attempt.correct==='boolean');
export function warmupOn(pack,attempts){
  if(!pack.warmup?.length)return false;
  const list=graded(attempts);let on=false;
  for(let end=WINDOW;end<=list.length;end++){
    const rate=list.slice(end-WINDOW,end).filter(attempt=>attempt.correct).length/WINDOW;
    on=on?rate<WARMUP_OUT:rate<WARMUP_IN;
  }
  return on;
}
/** The muted status line's mode: 'Warm-up: 8 regions' or 'Full map'. Null for packs without pack.warmup. */
export const modeLabel=(pack,attempts)=>!pack.warmup?.length?null:warmupOn(pack,attempts)?`Warm-up: ${pack.warmup.length} regions`:'Full map';
export const pairKey=(a,b)=>[a,b].sort().join('|');
/** Pending rule checks, newest miss first: {pair, regions: [true, pinned]} for misses in the last RULE_WINDOW attempts that
 *  pinned another pack region, with no later attempt on either region. */
export function pendingRuleChecks(pack,attempts){
  if(!pack.contrasts)return [];
  const regionOf=new Map(pack.skills.map(skill=>[skill.id,skill.region])),regions=new Set(regionOf.values()),out=[];
  attempts.slice(-RULE_WINDOW).forEach((attempt,index,recent)=>{
    const a=regionOf.get(attempt.skillId),b=attempt.guessedRegion;
    if(attempt.correct!==false||!explicit(attempt)||!regions.has(b)||a===b)return;
    if(recent.slice(index+1).some(later=>[a,b].includes(regionOf.get(later.skillId))))return;
    out.unshift({pair:pairKey(a,b),regions:[a,b]});
  });
  return out;
}
/** The pair a location checks, when it is an unseen panorama of a region in a pending rule check. */
export function ruleCheckFor(pack,attempts,location){
  if(attempts.some(attempt=>attempt.locationRef===location.id))return null;
  return pendingRuleChecks(pack,attempts).find(check=>check.regions.includes(location.region))?.pair??null;
}
/** Close: while warming up, a wrong pin in the true region's L2 family. */
export function closeCall(pack,attempts,round){
  if(round.correct!==false||!warmupOn(pack,attempts))return false;
  const l2=region=>pack.skills.find(skill=>skill.region===region)?.l2;
  return !!l2(round.location.region)&&l2(round.guessedRegion)===l2(round.location.region);
}
const dayOf=time=>{const date=new Date(time);date.setHours(0,0,0,0);return date.getTime()};
/** Skill ids due a day check (first set of a day only): missed on an earlier day, then not tried since, or tried but not
 *  yet a week after that miss once the week has passed. Latest miss first. */
export function dayChecks(pack,attempts,now){
  const today=dayOf(now);
  if(!pack.contrasts||attempts.some(attempt=>dayOf(attempt.occurredAt)===today))return [];
  return [...Map.groupBy(attempts.filter(explicit),attempt=>attempt.skillId)].map(([id,list])=>{
    const missed=Math.max(...list.filter(attempt=>attempt.correct===false).map(attempt=>dayOf(attempt.occurredAt)));
    const after=list.map(attempt=>dayOf(attempt.occurredAt)).filter(day=>day>missed);
    const due=missed>-Infinity&&(!after.length||(today-missed>=7*DAY&&!after.some(day=>day-missed>=7*DAY)));
    return due&&{id,missed};
  }).filter(Boolean).sort((a,b)=>b.missed-a.missed).map(({id})=>id);
}
// Internal state adds 'learned': awaiting its next-session check since `learnedAt`.
function progress(pack,attempts) {
  const bySkill=Map.groupBy(attempts,attempt=>attempt.skillId),panos=Map.groupBy(pack.locations??[],location=>location.skillIds[0]);
  const byId=new Map((pack.locations??[]).map(location=>[location.id,location]));
  return new Map(pack.skills.map(skill=>{
    const shown=bySkill.get(skill.id)??[],seen=new Set(),all=panos.get(skill.id)?.length??0;
    const required=requiredCells(pack,panos.get(skill.id)??[]),cells=new Set();
    let state=shown.length?'learning':'new',spotted=0,knew=false,learnedAt=null;
    for(const attempt of shown){
      const fresh=!seen.has(attempt.locationRef)||seen.size>=all;seen.add(attempt.locationRef);
      cells.add(byId.get(attempt.locationRef)?.state);
      if(!explicit(attempt))continue;
      if(attempt.correct===false){state='missed';learnedAt=null;continue;}
      if(attempt.correct!==true)continue;
      const time=Date.parse(attempt.occurredAt);
      spotted+=fresh;
      if(learnedAt!==null){if(time-learnedAt>=CHECK_AFTER)state='retired';continue;}
      if(!fresh)continue;
      knew||=attempt.grade==='easy';
      const covered=[...required].every(cell=>cells.has(cell));
      [state,learnedAt]=(spotted>=2||knew)&&covered?['learned',time]:['learning',null];
    }
    return [skill.id,{state,shown:shown.length,spotted,learnedAt}];
  }));
}

export function sprintStatus(pack,attempts) {
  return new Map([...progress(pack,attempts)].map(([id,{state,shown,spotted}])=>
    [id,{state:state==='learned'?'learning':state,shown,spotted}]));
}

export function planSprint(pack,attempts,{size=5,now=Date.now()}={}) {
  const status=progress(pack,attempts),clock=attempts.length,nowMs=new Date(now).getTime();
  const lastRound=new Map(),lastUse=new Map();
  attempts.forEach((attempt,index)=>{lastRound.set(attempt.skillId,index+1);lastUse.set(attempt.locationRef,index);});
  const locations=Map.groupBy(pack.locations,location=>location.skillIds[0]);
  const all=pack.skills.filter(skill=>locations.has(skill.id)).map(skill=>{
    const {state,learnedAt}=status.get(skill.id);
    // A learned clue is due for its check once CHECK_AFTER of wall time has passed.
    const dueAt=state==='learned'?(nowMs-learnedAt>=CHECK_AFTER?clock:null):GAP[state]?lastRound.get(skill.id)+GAP[state]:null;
    return {skill,state,dueAt};
  });
  if(all.every(item=>item.state==='retired')) throw notice('Sprint complete: every clue spotted twice.');
  const isDue=item=>item.dueAt!==null&&item.dueAt<=clock,warm=warmupOn(pack,attempts);
  const pool=warm?all.filter(item=>pack.warmup.includes(item.skill.region)):all;
  const fresh=pool.filter(item=>item.state==='new');
  const seen=pool.filter(item=>item.dueAt!==null).sort((a,b)=>a.dueAt-b.dueAt);
  const due=seen.filter(isDue);
  // Endgame: retired clues and learned ones awaiting their check, least recently shown first, keep the set full.
  const resting=pool.filter(item=>item.state!=='new'&&item.dueAt===null).sort((a,b)=>lastRound.get(a.skill.id)-lastRound.get(b.skill.id));
  const picks=[],countries=new Set(),cap=fresh.length?DUE_CAP:size,poles=item=>item.skill.subject==='poles';
  // Coaching first (any region, warm-up or not): rule checks of the latest misses, then a new day's checks. A region
  // qualifies only with a panorama the learner has not seen, which pick() then takes (unused first).
  // ponytail: a set is published whole, so a miss in round 1 is checked 5 to 9 rounds later; round 5 misses within 1 to 3.
  const shown=new Set(attempts.map(attempt=>attempt.locationRef)),bySkill=new Map(all.map(item=>[item.skill.id,item]));
  const unseen=item=>item&&locations.get(item.skill.id).some(location=>!shown.has(location.id));
  const ofRegion=region=>all.find(item=>item.skill.region===region);
  const checks=pendingRuleChecks(pack,attempts).map(({regions:[a,b]})=>unseen(ofRegion(a))?ofRegion(a):unseen(ofRegion(b))?ofRegion(b):null)
    .filter(Boolean).slice(0,RULE_CHECKS);
  const coached=[...checks,...dayChecks(pack,attempts,nowMs).map(id=>bySkill.get(id)).filter(unseen)];
  for(const item of coached)if(picks.length<size&&!picks.includes(item)){picks.push(item);countries.add(item.skill.country??item.skill.id);}
  const take=(list,{perCountry=true,capped=true}={})=>{
    for(const item of list){
      if(picks.length>=size) return;
      const country=item.skill.country??item.skill.id;
      if(picks.includes(item)||(perCountry&&countries.has(country))||(capped&&isDue(item)&&picks.filter(isDue).length>=cap)
        ||(capped&&poles(item)&&picks.filter(poles).length>=POLES_CAP)) continue;
      picks.push(item);countries.add(country);
    }
  };
  // While new clues remain, every pass keeps at most DUE_CAP due clues and POLES_CAP pole clues (poles: 36% of his drill,
  // 7% of his losses, win/LearnSeth.md). Only a set that would be short takes more.
  // Recent mistakes (skill.recent: the build's latest sitting) first, then costliest across due and new; ties keep due
  // (soonest first) before new (pack order: fresh mistakes first), so a cost-0 due clue fills a slot only once no costed
  // clue is left.
  const cost=item=>(item.skill.cost??0)*(SUBJECT_WEIGHT[item.skill.subject]??1),recent=item=>item.skill.recent?1:0;
  take([...due,...fresh].sort((a,b)=>recent(b)-recent(a)||cost(b)-cost(a)));
  take([...seen,...fresh]);
  take([...seen,...fresh],{perCountry:false});
  take([...seen,...fresh],{perCountry:false,capped:false});
  take(resting,{perCountry:false});
  const plain=picks.filter(item=>!coached.includes(item));
  const counts=[['rule check',checks],['day check',coached.filter(item=>!checks.includes(item))],['new',plain.filter(item=>item.state==='new')],
    ['due',plain.filter(isDue)],['early review',plain.filter(item=>item.dueAt>clock)],['refresher',plain.filter(item=>resting.includes(item))]]
    .filter(([,list])=>list.length).map(([label,list])=>`${list.length} ${label}`);
  // Unused panoramas first (-1), otherwise the least recently used one. Ties keep pack order. With cellCoverage, a cell
  // (state) this clue never showed comes first, largest cellShare first.
  const byId=new Map(pack.locations.map(location=>[location.id,location])),shownCells=new Map();
  if(pack.cellCoverage)for(const attempt of attempts){const cell=byId.get(attempt.locationRef)?.state;
    if(cell)shownCells.set(attempt.skillId,(shownCells.get(attempt.skillId)??new Set()).add(cell));}
  const lru=list=>list.reduce((best,location)=>(lastUse.get(location.id)??-1)<(lastUse.get(best.id)??-1)?location:best);
  const pick=skill=>{
    const list=locations.get(skill.id),unshown=pack.cellCoverage?list.filter(location=>location.state&&!shownCells.get(skill.id)?.has(location.state)):[];
    if(!unshown.length)return lru(list);
    const top=Math.max(...unshown.map(location=>location.cellShare??0));
    return lru(unshown.filter(location=>(location.cellShare??0)===top));
  };
  return {
    locationIds:picks.map(({skill})=>pick(skill).id),
    reasons:[counts.join(', '),`${all.filter(item=>item.state==='retired').length} of ${pack.skills.length} clues retired`],
  };
}
