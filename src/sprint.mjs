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

// Internal state adds 'learned': awaiting its next-session check since `learnedAt`.
function progress(pack,attempts) {
  const bySkill=Map.groupBy(attempts,attempt=>attempt.skillId),panos=Map.groupBy(pack.locations??[],location=>location.skillIds[0]);
  return new Map(pack.skills.map(skill=>{
    const shown=bySkill.get(skill.id)??[],seen=new Set(),all=panos.get(skill.id)?.length??0;
    let state=shown.length?'learning':'new',spotted=0,knew=false,learnedAt=null;
    for(const attempt of shown){
      const fresh=!seen.has(attempt.locationRef)||seen.size>=all;seen.add(attempt.locationRef);
      if(!explicit(attempt))continue;
      if(attempt.correct===false){state='missed';learnedAt=null;continue;}
      if(attempt.correct!==true)continue;
      const time=Date.parse(attempt.occurredAt);
      spotted+=fresh;
      if(learnedAt!==null){if(time-learnedAt>=CHECK_AFTER)state='retired';continue;}
      if(!fresh)continue;
      knew||=attempt.grade==='easy';
      [state,learnedAt]=spotted>=2||knew?['learned',time]:['learning',null];
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
  const isDue=item=>item.dueAt!==null&&item.dueAt<=clock;
  const fresh=all.filter(item=>item.state==='new');
  const seen=all.filter(item=>item.dueAt!==null).sort((a,b)=>a.dueAt-b.dueAt);
  const due=seen.filter(isDue);
  // Endgame: retired clues and learned ones awaiting their check, least recently shown first, keep the set full.
  const resting=all.filter(item=>item.state!=='new'&&item.dueAt===null).sort((a,b)=>lastRound.get(a.skill.id)-lastRound.get(b.skill.id));
  const picks=[],countries=new Set(),cap=fresh.length?DUE_CAP:size,poles=item=>item.skill.subject==='poles';
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
  const counts=[['new',picks.filter(item=>item.state==='new')],['due',picks.filter(isDue)],
    ['early review',picks.filter(item=>item.dueAt>clock)],['refresher',picks.filter(item=>resting.includes(item))]]
    .filter(([,list])=>list.length).map(([label,list])=>`${list.length} ${label}`);
  return {
    // Unused panoramas first (-1), otherwise the least recently used one. Ties keep pack order.
    locationIds:picks.map(({skill})=>locations.get(skill.id).reduce((best,location)=>
      (lastUse.get(location.id)??-1)<(lastUse.get(best.id)??-1)?location:best).id),
    reasons:[counts.join(', '),`${all.filter(item=>item.state==='retired').length} of ${pack.skills.length} clues retired`],
  };
}
