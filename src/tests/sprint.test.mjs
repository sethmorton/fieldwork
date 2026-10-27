import test from 'node:test';
import assert from 'node:assert/strict';
import {planSprint,sprintStatus} from '../sprint.mjs';
import {makeNextSet,validatePack} from '../next-set.mjs';
// Synthetic fixture: 8 clues across 6 countries, two panoramas each.
const mid='0123456789abcdef01234567',country={A:'IN',B:'IN',C:'BR',D:'BR',E:'US',F:'FR',G:'JP',H:'KE'};
const skills=Object.entries(country).map(([id,code])=>({id,title:'Clue '+id,phase:'Poles',prerequisites:[],country:code}));
const pack={id:'sprint-test',title:'Sprint test',subject:'GeoGuessr',scheduler:'sprint',skills,
  pools:[{id:'sprint-test',title:'Sprint',skillIds:skills.map(s=>s.id),mapUrl:`https://www.geoguessr.com/maps/${mid}`}],
  locations:skills.flatMap((s,j)=>[0,1].map(i=>({id:s.id+i,panoId:'p'+s.id+i,lat:j,lng:i,skillIds:[s.id]})))};
let n=0;
const T0='2026-10-24T00:00:00Z',T12='2026-10-24T12:00:00Z';
const at=(skillId,correct,{assumed=false,easy=false,loc=skillId+'0',time=T0}={})=>({id:'r'+n++,skillId,occurredAt:time,correct,
  locationRef:loc,feedbackSource:assumed?'assumed-on-advance':'explicit',...(easy?{grade:'easy'}:{})});
const plan=(attempts,now=T0)=>planSprint(pack,attempts,{now});
const skillsOf=(attempts,now)=>plan(attempts,now).locationIds.map(id=>id[0]);

test('retirement needs two explicit spots and a later check; assumed attempts never count',()=>{
  const history=[at('A',true),at('A',true,{assumed:true}),at('A',true,{assumed:true})];
  assert.deepEqual(sprintStatus(pack,history).get('A'),{state:'learning',shown:3,spotted:1});
  assert.equal(sprintStatus(pack,[...history,at('A',true)]).get('A').state,'learning');
  assert.equal(sprintStatus(pack,[...history,at('A',true),at('A',true,{time:T12})]).get('A').state,'retired');
  assert.equal(sprintStatus(pack,[at('B',true,{assumed:true})]).get('B').state,'learning');
  assert.equal(sprintStatus(pack,[]).get('C').state,'new');
});
test('every mastery waits for a check 12 hours later, and an earlier spot does not cancel it',()=>{
  const early=[at('A',true),at('A',true),at('A',true,{time:'2026-10-24T06:00:00Z'})];
  assert.deepEqual(sprintStatus(pack,early).get('A'),{state:'learning',shown:3,spotted:3});
  assert.ok(!skillsOf(early,'2026-10-24T11:59:00Z').includes('A'));
  assert.equal(skillsOf(early,T12)[0],'A');
  assert.equal(sprintStatus(pack,[...early,at('A',true,{time:T12})]).get('A').state,'retired');
});
test('a lone Knew it is checked once after 12 hours',()=>{
  const knew=[at('A',true,{easy:true})];
  assert.equal(sprintStatus(pack,knew).get('A').state,'learning');
  assert.ok(!skillsOf(knew,'2026-10-24T11:59:00Z').includes('A'));
  assert.equal(skillsOf(knew,T12)[0],'A');
  assert.match(plan(knew,T12).reasons[0],/1 due/);
  const checked=[...knew,at('A',true,{time:T12})];
  assert.equal(sprintStatus(pack,checked).get('A').state,'retired');
  assert.ok(!skillsOf(checked,'2026-10-26T00:00:00Z').includes('A'));
});
test('a miss after retirement reactivates the clue',()=>{
  const retired=[at('A',true),at('A',true),at('A',true,{time:T12})],missed=[...retired,at('A',false)];
  assert.equal(sprintStatus(pack,retired).get('A').state,'retired');
  assert.equal(sprintStatus(pack,missed).get('A').state,'missed');
  assert.equal(sprintStatus(pack,[at('B',true,{easy:true}),at('B',false)]).get('B').state,'missed');
  assert.equal(skillsOf([...missed,...'CEFGH'.split('').map(id=>at(id,true))])[0],'A');
});
test('a missed clue returns five rounds later',()=>{
  const history=[at('A',false),...'CDEF'.split('').map(id=>at(id,true))];
  assert.equal(sprintStatus(pack,history).get('A').state,'missed');
  assert.ok(!skillsOf(history).includes('A'));
  const later=[...history,at('F',true)];
  assert.equal(skillsOf(later)[0],'A');
  assert.match(plan(later).reasons[0],/1 due/);
});
test('a set holds at most three due clues while new ones remain, one per country',()=>{
  assert.deepEqual(skillsOf([]),['A','C','E','F','G']);
  const history=[at('A',false),at('C',false),at('E',false),at('F',false),at('B',true),at('B',true),at('D',true),at('D',true),at('D',true,{assumed:true})];
  assert.deepEqual(skillsOf(history),['A','C','E','G','H']);
  assert.equal(plan(history).reasons[0],'2 new, 3 due');
});
test('the due cap holds in every fallback pass and gives way only when the set would be short',()=>{
  const missed='ACEFG'.split('').map(id=>at(id,false));
  const early=[...missed,at('B',true),...Array.from({length:4},()=>at('B',true,{assumed:true}))];
  assert.deepEqual(skillsOf(early),['A','C','E','H','B']);
  assert.equal(plan(early).reasons[0],'1 new, 3 due, 1 early review');
  const short=[...missed,...'BD'.split('').flatMap(id=>[at(id,true),at(id,true),at(id,true,{time:T12})])];
  assert.deepEqual(skillsOf(short),['A','C','E','H','F']);
  assert.equal(plan(short).reasons[0],'1 new, 4 due');
});
test('the costliest due or new clue wins over a cheap due one',()=>{
  const costed={...pack,skills:skills.map(s=>({...s,cost:{A:0,C:50,E:900,G:400,H:700}[s.id]??0}))};
  const history=[at('A',false),at('C',false),at('E',false),at('F',false),at('B',true),at('B',true),at('D',true),at('D',true),at('D',true,{assumed:true})];
  assert.deepEqual(planSprint(costed,history,{now:T0}).locationIds.map(id=>id[0]),['E','H','G','C','A']);
});
test('an unused panorama is preferred, then the least recently used, until the sprint is complete',()=>{
  const others='BCDEFGH'.split('').flatMap(id=>[at(id,true,{easy:true}),at(id,true,{time:T12})]);
  const history=[at('A',true),...others];
  assert.equal(plan(history).locationIds[0],'A1');
  assert.deepEqual(skillsOf(history),['A','B','C','D','E'],'retired clues, least recently shown first, fill the endgame set');
  const missed=[...history,at('A',false,{loc:'A1'})];
  assert.equal(plan(missed).locationIds[0],'A0');
  assert.throws(()=>plan([...missed,at('A',true),at('A',true,{time:T12})]),{code:'notice',message:'Sprint complete: every clue spotted twice.'});
});
test('makeNextSet routes sprint packs and validates the scheduler',()=>{
  const set=makeNextSet(pack,[]);
  assert.equal(set.phase,'Sprint');assert.deepEqual(set.focus.map(s=>s.id),['A','C','E','F','G']);
  assert.throws(()=>validatePack({...pack,scheduler:'fsrs'}),/Unknown scheduler/);
});
