import test from 'node:test';
import assert from 'node:assert/strict';
import {planPractice} from '../lib/adaptive.ts';
import {skillStatus} from '../lib/mastery.ts';
import {makeNextSet} from '../next-set.mjs';
// Synthetic outcomes only. Interval numbers are ts-fsrs 5.4.2 (FSRS-6 defaults, no fuzz) for the same sequence.
const DAY=86400000,start=Date.parse('2026-10-01T09:00:00Z');
const outcome=(skillId,at,passed=true,i=0)=>({id:`${skillId}-${at}-${i}`,skillId,occurredAt:new Date(at).toISOString(),correct:passed,
 evidenceValid:passed,confidence:2,unfamiliar:true,locationRef:`${skillId}-0`,mode:'practice',feedbackSource:'explicit'});
/** Review a clue every time it falls due; returns its outcomes and the gaps FSRS chose. */
function onTime(skillId,reviews,from=start){
 const records=[outcome(skillId,from)],gaps=[];
 for(let i=0;i<reviews;i++){
  const due=Date.parse(skillStatus(skillId,records,records.at(-1).occurredAt).reviewDueAt);
  gaps.push((due-Date.parse(records.at(-1).occurredAt))/DAY);records.push(outcome(skillId,due,true,i+1));
 }
 return {records,gaps};
}
const skill=(id,family=id)=>({id,title:id,phase:'Mixed',prerequisites:[],practiceFamily:family});
const makePack=skills=>({id:'fsrs-fixture',title:'Fixture',subject:'Any topic',skills,
 pools:[{id:'pool',title:'Mixed',skillIds:skills.map(s=>s.id),mapUrl:'https://example.test/maps/pool'}],
 locations:skills.flatMap((s,j)=>[0,1,2].map(i=>({id:`${s.id}-${i}`,panoId:`${s.id}-${i}`,lat:j,lng:i,skillIds:[s.id],country:'C'+j})))});

test('repeated successes grow the interval as FSRS-6 schedules it',()=>{
 const {gaps}=onTime('a',5);
 // Same-day learning step (10 min), then 2, 11, 46, 163 days (ts-fsrs gives the same on-time sequence).
 assert.ok(Math.abs(gaps[0]*1440-10)<1e-6);
 assert.deepEqual(gaps.slice(1),[2,11,46,163]);
});

test('a miss makes even a well-known clue due again within the same day',()=>{
 const {records}=onTime('a',4),last=Date.parse(records.at(-1).occurredAt);
 const missedAt=last+40*DAY;records.push(outcome('a',missedAt,false,9));
 const status=skillStatus('a',records,missedAt);
 assert.equal(status.due,false);
 assert.ok(Date.parse(status.reviewDueAt)-missedAt<=10*60000);
 assert.equal(skillStatus('a',records,missedAt+11*60000).due,true);
 // Missing it again the same day keeps it short-term; it does not jump to a multi-day interval.
 records.push(outcome('a',missedAt+11*60000,false,10));
 assert.ok(Date.parse(skillStatus('a',records,missedAt+11*60000).reviewDueAt)-missedAt<DAY);
});

test('a long-unreviewed clue becomes due and keeps losing retrievability',()=>{
 const {records}=onTime('a',3),due=Date.parse(skillStatus('a',records,records.at(-1).occurredAt).reviewDueAt);
 assert.equal(skillStatus('a',records,due-1).due,false);
 const late=skillStatus('a',records,due+300*DAY),onDue=skillStatus('a',records,due);
 assert.equal(onDue.due,true);assert.equal(late.due,true);
 assert.ok(Math.abs(onDue.retrievability-0.9)<0.01);assert.ok(late.retrievability<onDue.retrievability);
});

test('due reviews are chosen most-forgotten first, misses lead, and family/country caps still hold',()=>{
 // Eight graduated clues (each reviewed twice); older reviews have lower retrievability now.
 const ids=['A','B','C','D','E','F','G','H'],p=makePack(ids.map(id=>skill(id,id==='B'?'shared':id==='C'?'shared':id)));
 p.maxLocationsPerCountry=1;p.locations.filter(l=>l.skillIds[0]==='D').forEach(l=>l.country='C0');
 const records=ids.flatMap((id,i)=>[outcome(id,start+i*DAY),outcome(id,start+i*DAY+15*60000,true,1)]);
 const now=start+40*DAY;
 assert.ok(ids.every(id=>skillStatus(id,records,now).due));
 const plan=planPractice(p,records,{now,size:3});
 // A is most forgotten; B and C share a family (B is older); D shares A's country, so E is next.
 assert.deepEqual(plan.focusSkills.map(s=>s.id),['A','B','E']);
 records.push(outcome('G',now-DAY,false,2));
 // The longest-overdue due clue (A) keeps its reserved slot; the fresh miss leads the remaining reviews.
 assert.deepEqual(planPractice(p,records,{now,size:3}).focusSkills.slice(0,2).map(s=>s.id),['A','G']);
});

test('not-yet-due reviews are skipped while due ones fill the set, and used only to keep it playable',()=>{
 const ids=['A','B','C','D','E','F','G','H'],p=makePack(ids.map(id=>skill(id)));
 const now=start+40*DAY;
 // A-F reviewed long ago (due); G and H graduated recently with multi-day intervals (not due).
 const records=ids.flatMap((id,i)=>{const at=i<6?start+i*DAY:now-DAY;return [outcome(id,at),outcome(id,at+15*60000,true,1)];});
 assert.ok(!skillStatus('G',records,now).due&&!skillStatus('H',records,now).due);
 const plan=planPractice(p,records,{now});
 assert.equal(plan.locationIds.length,5);assert.ok(plan.focusSkills.every(s=>!['G','H'].includes(s.id)));
 // With the due clues resting from the previous set, not-due reviews fill the set instead of repeating a family.
 const rested=planPractice(p,records,{now,previousSetLocationRefs:['A-0','B-0','C-0','D-0','E-0']});
 assert.equal(rested.locationIds.length,5);assert.ok(['F','G','H'].every(id=>rested.focusSkills.some(s=>s.id===id)));
});

test('a due success is not starved by clues missed every session',()=>{
 // Ten clues missed every time they appear and one clue G answered correctly once; one five-round set a day, previous set resting.
 const ids=[...Array.from({length:10},(_,i)=>'M'+i),'G'],p=makePack(ids.map(id=>skill(id)));
 const records=ids.map(id=>outcome(id,start,id==='G')),seen=[];
 let previous=[],waited=0,picked=0,lowest=1;
 for(let day=1;day<=365;day++){
  const now=start+day*DAY,g=skillStatus('G',records,now),plan=planPractice(p,records,{now,seenLocationRefs:seen,previousSetLocationRefs:previous});
  assert.equal(plan.locationIds.length,5);
  const hasG=plan.focusSkills.some(s=>s.id==='G');
  // Only clues that fell due before G (here the day-0 misses) may go first: G waits at most two sets.
  if(g.due){waited=hasG?0:waited+1;assert.ok(waited<=2,`G waited ${waited} sets while due`);lowest=Math.min(lowest,g.retrievability);}
  picked+=hasG;
  plan.focusSkills.forEach((s,i)=>records.push(outcome(s.id,now+i*60000,s.id==='G',day)));
  previous=plan.locationIds;seen.push(...previous);
 }
 assert.ok(picked>=4);assert.ok(lowest>0.85,`G retrievability fell to ${lowest}`);
});

test('the country limit repairs earlier picks instead of returning a short set',()=>{
 // Families A-E, one location per country. A (a due miss, picked first) prefers its unseen panorama in country cB,
 // which is B's only country; A must move to its seen panorama in cA so B fits.
 const p=makePack(['A','B','C','D','E'].map(id=>skill(id)));p.maxLocationsPerCountry=1;
 p.pools[0].mapUrl='https://www.geoguessr.com/maps/0123456789abcdef01234567';
 p.locations=[{id:'A-seen',country:'cA'},{id:'A-new',country:'cB'},{id:'B-0',country:'cB'},{id:'C-0',country:'cC'},{id:'D-0',country:'cD'},{id:'E-0',country:'cE'}]
  .map((l,i)=>({...l,panoId:l.id,lat:i,lng:i,skillIds:[l.id[0]]}));
 const records=[{...outcome('A',start,false),locationRef:'A-seen'}],now=start+DAY;
 const set=makeNextSet(p,records,{now,seenLocationRefs:['A-seen']});
 assert.deepEqual(set.selectedLocations.map(l=>l.id).sort(),['A-seen','B-0','C-0','D-0','E-0']);
 // Truly short content says so; enough families and countries without any valid assignment is named as that.
 assert.throws(()=>makeNextSet({...p,locations:p.locations.filter(l=>l.id!=='E-0')},records,{now}),/Only 4 distinct/);
 const tight={...p,skills:[...p.skills,skill('F','C')],pools:[{...p.pools[0],skillIds:['A','B','C','D','E','F']}],
  locations:[...p.locations.filter(l=>l.id!=='A-new').map(l=>l.id==='B-0'?{...l,country:'cA'}:l),{id:'F-0',panoId:'F-0',lat:9,lng:9,skillIds:['F'],country:'cF'}]};
 assert.throws(()=>makeNextSet(tight,records,{now}),/no combination of 5 distinct families/);
});

test('mastery and scheduling stay linear on one heavily practised clue',()=>{
 const records=Array.from({length:5000},(_,i)=>({...outcome('a',start+i*DAY,true,i),locationRef:'L'+i,mode:'assessment'}));
 const at=start+5000*DAY,began=performance.now(),status=skillStatus('a',records,at),elapsed=performance.now()-began;
 assert.equal(status.state,'mastered');assert.equal(status.masteredAt,records[19].occurredAt);
 assert.ok(elapsed<300,`5,000 assessments took ${elapsed} ms`);
});
