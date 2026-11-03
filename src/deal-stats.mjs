// Progress numbers for the training pack, from deal attempts only (every one is a panorama the learner had never seen):
// tiles for the start panel and the 15-minute session check with its recommendation.
import {isDealAttempt,retests,SESSION_GAP} from './deal.mjs';

const MIN=60000,DAY=864e5;
// A gap this long ends a session; a gap this long counts as a break.
export const BREAK_GAP=4*MIN,CHECK_EVERY=15*MIN;
const mean=list=>list.reduce((sum,value)=>sum+value,0)/list.length;
const rate=(list,test)=>list.length?list.filter(test).length/list.length:null;

/** Country hit rate, points per round (± standard error) and fix rate (retests of a miss on a new spot that were right),
 *  over the last `days` days, with the change against the `days` before when both windows have at least 20 rounds. */
export function dealTiles(attempts,{now=Date.now(),days=3}={}){
  const nowMs=new Date(now).getTime(),rounds=attempts.filter(isDealAttempt);
  const window=(from,to)=>rounds.filter(item=>{const time=Date.parse(item.occurredAt);return time>from&&time<=to});
  const current=window(nowMs-days*DAY,nowMs),previous=window(nowMs-2*days*DAY,nowMs-days*DAY);
  const summary=list=>{
    const points=list.filter(item=>Number.isFinite(item.points)).map(item=>item.points),retest=list.filter(item=>item.retest);
    const sd=points.length>1?Math.sqrt(points.reduce((sum,value)=>sum+(value-mean(points))**2,0)/(points.length-1)):null;
    return {n:list.length,countryRate:rate(list,item=>item.countryCorrect===true),regionRate:rate(list,item=>item.correct),
      points:points.length?Math.round(mean(points)):null,pointsSe:sd===null?null:Math.round(sd/Math.sqrt(points.length)),
      fixRate:rate(retest,item=>item.correct),fixN:retest.length};
  };
  const now3=summary(current),before=summary(previous),comparable=now3.n>=20&&before.n>=20;
  return {...now3,days,change:comparable?{countryRate:now3.countryRate-before.countryRate,points:now3.points-before.points}:null};
}

/** Start-panel counts: open retests due now, by kind. */
export function dueCounts(pack,attempts,now=Date.now()){
  const due=retests(pack,attempts,now).filter(item=>item.due);
  return {metas:due.filter(item=>item.kind==='meta').length,regions:due.filter(item=>item.kind==='region').length};
}

/** The current session: trailing deal rounds with no gap over SESSION_GAP. Active minutes add gaps up to BREAK_GAP;
 *  `sinceBreak` counts from the last gap of BREAK_GAP or more. */
export function currentSession(attempts,now=Date.now()){
  const nowMs=new Date(now).getTime(),rounds=attempts.filter(isDealAttempt);
  let start=rounds.length;
  while(start>0&&(start===rounds.length?nowMs:Date.parse(rounds[start].occurredAt))-Date.parse(rounds[start-1].occurredAt)<=SESSION_GAP)start--;
  const session=rounds.slice(start),times=session.map(item=>Date.parse(item.occurredAt));
  let active=0,breakAt=times[0]??nowMs;
  for(let i=1;i<times.length;i++){const gap=times[i]-times[i-1];if(gap>=BREAK_GAP)breakAt=times[i];else active+=gap}
  return {rounds:session,startedAt:times[0]??null,activeMinutes:Math.round(active/MIN),sinceBreakMinutes:Math.round(((times.at(-1)??nowMs)-breakAt)/MIN)};
}

/** The 15-minute check: progress so far and one recommendation, from accuracy trend and time on task.
 *  kind: 'break' | 'duels' | 'sprint' | 'continue'. */
export function sessionCheck(attempts,now=Date.now()){
  const {rounds,activeMinutes,sinceBreakMinutes}=currentSession(attempts,now);
  const early=rounds.slice(0,-10),late=rounds.slice(-10),points=rounds.filter(item=>Number.isFinite(item.points));
  const lateRate=rate(late,item=>item.correct),earlyRate=rate(early,item=>item.correct);
  const dropping=early.length>=10&&lateRate!==null&&earlyRate!==null&&lateRate<=earlyRate-0.15;
  const retest=rounds.filter(item=>item.retest),fix=rate(retest,item=>item.correct);
  const progress={n:rounds.length,activeMinutes,regionRate:rate(rounds,item=>item.correct),countryRate:rate(rounds,item=>item.countryCorrect===true),
    points:points.length?Math.round(mean(points.map(item=>item.points))):null,lateRate,earlyRate,fixRate:fix,fixN:retest.length};
  // Order matters: fatigue first, then the end of the training block, then a stuck retest loop, else keep going.
  const advice=(dropping&&sinceBreakMinutes>=25)||sinceBreakMinutes>=50?{kind:'break',title:'Take a 5-minute break',
      detail:dropping?'Accuracy is falling. Off screen, then come back.':`${sinceBreakMinutes} minutes without a break.`}
    :activeMinutes>=100?{kind:'duels',title:'Play ranked duels now',detail:`${activeMinutes} minutes trained today. Test it.`}
    :activeMinutes>=45&&lateRate!==null&&lateRate>=0.75?{kind:'duels',title:'Play ranked duels now',detail:'You are hot: last 10 at '+Math.round(lateRate*100)+'%.'}
    :retest.length>=6&&fix<0.4?{kind:'sprint',title:'Switch to the Sprint map',detail:'Misses are not fixing yet. Drill them as cards.'}
    :{kind:'continue',title:'Keep going',detail:dropping?'Accuracy dipped. Slow down on the next set.':'Steady. Next set.'};
  return {progress,advice};
}
/** True when a session check is due: CHECK_EVERY of session time since its start or the last check. */
export function checkDue(attempts,lastCheckAt,now=Date.now()){
  const {startedAt}=currentSession(attempts,now),nowMs=new Date(now).getTime();
  if(startedAt===null)return false;
  return nowMs-Math.max(startedAt,lastCheckAt??0)>=CHECK_EVERY;
}
