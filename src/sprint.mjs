import { notice } from './load-errors.mjs';

// Sprint scheduler: breadth over depth. A clue is learned once its last explicit attempt is a spot and it has two explicit
// spots or a "Knew it". It retires for good only after one more explicit spot at least 12 hours (occurredAt) after the
// spot that made it learned. A sooner spot does not count. A miss reactivates any clue. Review gaps count rounds: the
// clock is the attempt count, so each completed round is one tick.
const GAP={missed:5,learning:20},CHECK_AFTER=12*3600e3,DUE_CAP=3;
const explicit=attempt=>attempt.feedbackSource!=='assumed-on-advance';

// Internal state adds 'learned': awaiting its next-session check since `learnedAt`.
function progress(pack,attempts) {
  const bySkill=Map.groupBy(attempts,attempt=>attempt.skillId);
  return new Map(pack.skills.map(skill=>{
    const shown=bySkill.get(skill.id)??[];
    let state=shown.length?'learning':'new',spotted=0,knew=false,learnedAt=null;
    for(const attempt of shown.filter(explicit)){
      if(attempt.correct===false){state='missed';learnedAt=null;continue;}
      if(attempt.correct!==true)continue;
      spotted++;knew||=attempt.grade==='easy';
      const time=Date.parse(attempt.occurredAt);
      if(learnedAt===null)[state,learnedAt]=spotted>=2||knew?['learned',time]:['learning',null];
      else if(time-learnedAt>=CHECK_AFTER)state='retired';
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
  const picks=[],countries=new Set(),cap=fresh.length?DUE_CAP:size;
  const take=(list,{perCountry=true,capped=true}={})=>{
    for(const item of list){
      if(picks.length>=size) return;
      const country=item.skill.country??item.skill.id;
      if(picks.includes(item)||(perCountry&&countries.has(country))||(capped&&isDue(item)&&picks.filter(isDue).length>=cap)) continue;
      picks.push(item);countries.add(country);
    }
  };
  // While new clues remain, every pass keeps at most DUE_CAP due clues. Only a set that would be short takes more.
  // Costliest first across due and new; ties keep due (soonest first) before new (pack order: fresh mistakes first),
  // so a cost-0 due clue fills a slot only once no costed clue is left.
  const cost=item=>item.skill.cost??0;
  take([...due,...fresh].sort((a,b)=>cost(b)-cost(a)));
  take([...seen,...fresh]);
  take([...seen,...fresh],{perCountry:false});
  take(due,{perCountry:false,capped:false});
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
