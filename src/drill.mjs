import {sprintStatus} from './sprint.mjs';

// Pure logic behind the sprint review card: grades, the card's status chip, the round-5 recap order, the session bar
// and the drill keys. DOM lives in ui.mjs.
export const gradeOf=attempt=>!attempt||attempt.feedbackSource!=='explicit'?null
  :attempt.correct===false||attempt.evidenceValid===false?'missed':attempt.grade==='easy'?'knew':'spotted';
export const GRADES=[['missed','Missed'],['spotted','Spotted'],['knew','Knew it']];

/** Status of this card before this round: New / Missed last time / Review N, plus explicit spots toward the two that retire it. */
export function cardStatus(attempts,round) {
  const skillId=round.location.skillIds[0],prior=attempts.filter(attempt=>attempt.skillId===skillId&&attempt.id!==round.id);
  const last=prior.at(-1),spotted=prior.filter(attempt=>gradeOf(attempt)==='spotted'||gradeOf(attempt)==='knew').length;
  const label=!last?'New':last.correct===false||last.evidenceValid===false?'Missed last time':`Review ${prior.length}`;
  return `${label} · spotted ${Math.min(spotted,2)}/2`;
}

/** This game's five cards, misses first, then round order. The current round counts even before it is graded. */
export function setRecap(pack,attempts,round) {
  const prefix=`${pack.id}:${round.gameId}:`,skills=new Map(pack.skills.map(skill=>[skill.id,skill]));
  return [1,2,3,4,5].map(n=>{
    const attempt=attempts.find(item=>item.id===prefix+n),skill=skills.get(attempt?.skillId??(n===round.round?round.location.skillIds[0]:''));
    return skill&&{round:n,skill,grade:gradeOf(attempt)};
  }).filter(Boolean).sort((a,b)=>(b.grade==='missed')-(a.grade==='missed')||a.round-b.round);
}

const IDLE=30*60e3,BLOCK=25*60e3;
/** One muted line: today's rounds and spot rate, this block's length, retired clues. A block restarts after 30 idle minutes. */
export function sessionBar(pack,attempts,{now=Date.now(),store=localStorage}={}) {
  const saved=JSON.parse(store.getItem('fieldwork:block')??'null'),start=saved&&now-saved.last<IDLE?saved.start:now;
  store.setItem('fieldwork:block',JSON.stringify({start,last:now}));
  const today=new Date(now).toDateString(),rounds=attempts.filter(attempt=>(attempt.feedbackSource==='explicit'||attempt.feedbackSource==='assumed-on-advance')
    &&new Date(attempt.occurredAt).toDateString()===today);
  const graded=rounds.filter(attempt=>attempt.feedbackSource==='explicit'),spotted=graded.filter(attempt=>gradeOf(attempt)!=='missed').length;
  const seconds=Math.floor((now-start)/1000),clock=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
  const retired=[...sprintStatus(pack,attempts).values()].filter(item=>item.state==='retired').length;
  return {text:[`Today ${rounds.length} round${rounds.length===1?'':'s'}${graded.length?`, ${Math.round(100*spotted/graded.length)}% spotted`:''}`,`Block ${clock}`,`Retired ${retired}/${pack.skills.length}`].join(' · '),
    rest:now-start>=BLOCK};
}

/** Drill keys: 1/2/3 grade; at round 5, C or Enter continues. Typing in a field and modified keys are never drill keys. */
export function drillKey(event,round) {
  const target=event.composedPath?.()[0]??event.target;
  if(event.ctrlKey||event.metaKey||event.altKey||/^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName??'')||target?.isContentEditable)return null;
  if(['1','2','3'].includes(event.key))return GRADES[Number(event.key)-1][0];
  return round===5&&(event.key==='Enter'||event.key.toLowerCase()==='c')?'continue':null;
}
