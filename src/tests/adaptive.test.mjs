import test from 'node:test';
import assert from 'node:assert/strict';
import {planPractice} from '../lib/adaptive.ts';
const now='2026-10-19T08:00:00Z';
// Synthetic fixtures only; no learner observations or fabricated production locations.
const skill=(id,extra={})=>({id,title:id,phase:'Mixed',prerequisites:[],practiceFamily:id,importance:25,...extra});
const makePack=()=>{const skills=['A','B','C','D','E','F','G','H'].map(id=>skill(id));return {id:'fixture',title:'Fixture',subject:'Any topic',skills,pools:[{id:'pool',title:'Mixed',skillIds:skills.map(s=>s.id),mapUrl:'https://example.test/maps/pool'}],locations:skills.flatMap((s,j)=>Array.from({length:4},(_,i)=>({id:`${s.id}-${i}`,panoId:`${s.id}-${i}`,lat:j,lng:i,skillIds:[s.id],region:'R'+j})))};};
const attempt=(id,extra={})=>({id:'check-'+id,skillId:id,occurredAt:'2026-10-19T07:00:00Z',correct:true,evidenceValid:true,confidence:2,unfamiliar:true,locationRef:id+'-0',mode:'assessment',...extra});
const familyIds=(pack,plan)=>plan.focusSkills.map(s=>s.practiceFamily??s.id);
test('five different clue families from the outset, without a sequential clean-run gate',()=>{
 const p=makePack(),r=planPractice(p,[attempt('A',{correct:false})],{now,size:5});
 assert.equal(r.locationIds.length,5);assert.equal(new Set(familyIds(p,r)).size,5);assert.ok(r.focusSkills.some(s=>s.id==='A'));assert.ok(r.newSkillIds.length>=4);
});
test('different landscape or pole labels cannot evade the family cap',()=>{
 const p=makePack();p.skills.slice(0,4).forEach(s=>{s.practiceFamily='landscape';s.importance=100});
 const r=planPractice(p,[],{now,size:5});assert.equal(r.locationIds.length,5);assert.equal(r.focusSkills.filter(s=>s.practiceFamily==='landscape').length,1);
});
test('insufficient families yield a short explicit plan rather than duplicate clues',()=>{
 const p=makePack();p.skills.forEach(s=>s.practiceFamily='same');const r=planPractice(p,[],{now,size:5});assert.equal(r.locationIds.length,1);assert.match(r.reasons.join(' '),/repeated clues will not fill/);
});
test('misses are reviewed once while retaining four other families',()=>{
 const p=makePack();const r=planPractice(p,[attempt('A',{evidenceValid:false})],{now,size:5});assert.ok(r.focusSkills.some(s=>s.id==='A'));assert.equal(r.locationIds.filter(id=>id.startsWith('A-')).length,1);assert.equal(r.focusSkills.length,5);
});
test('struggling learners get one new clue and four reviews when families allow',()=>{
 const p=makePack();
 const records=['A','B','C','D','E'].map(id=>attempt(id,{correct:false,evidenceValid:false}));
 const r=planPractice(p,records,{now,size:5});
 assert.equal(r.newSkillIds.length,1);
 assert.equal(r.focusSkills.filter(s=>records.some(a=>a.skillId===s.id)).length,4);
 assert.equal(new Set(familyIds(p,r)).size,5);
});
test('an exposed target is review even without recognition feedback',()=>{
 const p=makePack();
 const r=planPractice(p,[],{now,size:5,seenLocationRefs:p.skills.slice(0,5).map(s=>s.id+'-0')});
 assert.equal(r.newSkillIds.length,2);
 assert.equal(r.focusSkills.filter(s=>['A','B','C','D','E'].includes(s.id)).length,3);
});
test('shrinking new-content pools fill remaining slots with varied review, not duplicates',()=>{
 const p=makePack();const records=p.skills.slice(0,7).map(s=>attempt(s.id));
 const r=planPractice(p,records,{now,size:5});assert.deepEqual(r.newSkillIds,['H']);
 assert.equal(r.locationIds.length,5);assert.equal(new Set(familyIds(p,r)).size,5);
});
test('a missed target rests for one set, then returns on a fresh panorama',()=>{
 const p=makePack();p.skills.push(skill('I'),skill('J'));
 for(const [j,s]of p.skills.slice(8).entries())p.locations.push({id:s.id+'-0',panoId:s.id+'-0',lat:8+j,lng:0,skillIds:[s.id]});
 p.pools[0].skillIds=p.skills.map(s=>s.id);
 const records=[attempt('A',{correct:false})];
 const rested=planPractice(p,records,{now,size:5,previousSetLocationRefs:['A-0','B-0','C-0','D-0','E-0']});
 assert.deepEqual(new Set(rested.focusSkills.map(s=>s.id)),new Set(['F','G','H','I','J']));
 const review=planPractice(p,records,{now,size:5,previousSetLocationRefs:rested.locationIds});
 assert.ok(review.focusSkills.some(s=>s.id==='A'));
 assert.ok(review.locationIds.some(id=>id.startsWith('A-')&&id!=='A-0'));
});
test('small pools relax spacing only when needed to keep five distinct families',()=>{
 const p=makePack();p.skills=p.skills.slice(0,5);p.pools[0].skillIds=p.skills.map(s=>s.id);
 const r=planPractice(p,[attempt('A',{correct:false})],{now,size:5,previousSetLocationRefs:p.skills.map(s=>s.id+'-0')});
 assert.equal(r.locationIds.length,5);assert.equal(new Set(familyIds(p,r)).size,5);
});
test('foundational importance leads cold selection while later coverage still rotates',()=>{
 const p=makePack();p.skills.slice(0,5).forEach(s=>s.importance=100);const first=planPractice(p,[],{now,size:5});assert.deepEqual(new Set(first.focusSkills.map(s=>s.id)),new Set(['A','B','C','D','E']));
 p.skills.forEach(s=>s.importance=25);const records=first.focusSkills.map(s=>attempt(s.id));const next=planPractice(p,records,{now,size:5,seenLocationRefs:first.locationIds});assert.ok(next.focusSkills.some(s=>!first.focusSkills.some(old=>old.id===s.id)));
});
test('fresh panoramas are preferred and URL aliases of seen positions are recognized',()=>{
 const p=makePack();const seen=p.locations.filter(l=>l.id.endsWith('-0')).map(l=>'https://www.google.com/maps?pano='+l.panoId);const r=planPractice(p,[],{now,size:5,seenLocationRefs:seen});assert.ok(r.locationIds.every(id=>!id.endsWith('-0')));
});
test('duplicate panoramas never fill separate family slots',()=>{
 const p=makePack();for(const l of p.locations.filter(l=>['A','B'].includes(l.skillIds[0])))l.panoId='shared';const r=planPractice(p,[],{now,size:5});const locs=r.locationIds.map(id=>p.locations.find(l=>l.id===id));assert.equal(new Set(locs.map(l=>l.panoId)).size,locs.length);
});
test('explicit pool membership and source-map membership are respected',()=>{
 const p=makePack();p.pools[0].locationIds=p.locations.filter(l=>l.id.endsWith('-2')).map(l=>l.id);const r=planPractice(p,[],{now,size:5});assert.ok(r.locationIds.every(id=>id.endsWith('-2')));
 delete p.pools[0].locationIds;p.locations.forEach(l=>l.sourceMapId='other');assert.equal(planPractice(p,[],{now,size:5}).locationIds.length,0);
});
test('availability and real prerequisites are respected without gating unrelated families',()=>{
 const p=makePack();p.skills[0].availability='needs-verification';p.skills[1].prerequisites=['A'];p.skills[2].availability='needs-contrasts';const r=planPractice(p,[],{now,size:5});assert.equal(r.locationIds.length,5);assert.ok(r.focusSkills.every(s=>!['A','B','C'].includes(s.id)));
});
test('no invented coordinates and invalid coordinates cannot become playable',()=>{
 const p=makePack();p.locations.forEach(l=>l.lat=999);const r=planPractice(p,[],{now,size:5});assert.deepEqual(r.locationIds,[]);assert.match(r.reasons.join(' '),/real tagged locations/);
});
test('plans are deterministic and unrelated or future observations have no influence',()=>{
 const p=makePack();const a=planPractice(p,[],{now,size:5});const b=planPractice(p,[attempt('foreign'),attempt('A',{occurredAt:'2099-01-01T00:00:00Z'})],{now,size:5});assert.deepEqual(a,b);
});
test('a source pool with enough families is chosen over a single-clue drill',()=>{
 const p=makePack();p.pools.unshift({id:'narrow',title:'Narrow',mapUrl:'https://example.test/narrow',skillIds:['A'],locationIds:p.locations.filter(l=>l.skillIds[0]==='A').map(l=>l.id)});assert.equal(planPractice(p,[],{now,size:5}).pool.id,'pool');
});
test('size zero and bad clocks are handled honestly',()=>{
 const p=makePack();assert.deepEqual(planPractice(p,[],{now,size:0}).locationIds,[]);assert.throws(()=>planPractice(p,[],{now:'bad'}),/Invalid current date/);
});
test('worldwide sets can require five countries as well as five clue families',()=>{
 const p=makePack();p.maxLocationsPerCountry=1;
 p.skills.slice(0,4).forEach(s=>s.importance=100);
 for(const l of p.locations)l.country=['A','B','C','D'].includes(l.skillIds[0])?'JP':l.skillIds[0];
 const plan=planPractice(p,[],{now,size:5});
 assert.equal(plan.locationIds.length,5);
 assert.equal(new Set(plan.locationIds.map(id=>p.locations.find(l=>l.id===id).country)).size,5);
 assert.equal(new Set(familyIds(p,plan)).size,5);
 // A country-only pack keeps its existing behavior unless the cap is requested.
 delete p.maxLocationsPerCountry;assert.equal(planPractice(p,[],{now,size:5}).locationIds.length,5);
});

const curriculumPack=(foundationCount=30)=>{
 const scopes=['country-identification','within-country-regional','specialist'];
 const skills=scopes.flatMap((scope,level)=>Array.from({length:level===0?foundationCount:30},(_,rank)=>skill(`${level}:${rank}`,{
  curriculum:{scope,rank},importance:level*100,practiceFamily:'family-'+rank%10,
 })));
 return {id:'curriculum-fixture',title:'Synthetic curriculum',subject:'World',skills,maxLocationsPerCountry:1,
  pools:[{id:'pool',title:'Mixed',skillIds:skills.map(s=>s.id),mapUrl:'https://example.test/maps/pool'}],
  locations:skills.flatMap((s,j)=>Array.from({length:3},(_,i)=>({id:`${s.id}-${i}`,panoId:`${s.id}-${i}`,
   lat:j%90,lng:i,skillIds:[s.id],country:'country-'+j%10,assessmentEligible:false})))};
};
function simulate(pack,sets,correct) {
 const records=[],seen=[],plans=[];let previous=[];
 for(let step=0;step<sets;step++){
  const plan=planPractice(pack,records,{now,seenLocationRefs:seen,previousSetLocationRefs:previous});
  assert.equal(plan.locationIds.length,5);
  assert.equal(new Set(plan.focusSkills.map(s=>s.practiceFamily)).size,5);
  const locations=plan.locationIds.map(id=>pack.locations.find(l=>l.id===id));
  assert.equal(new Set(locations.map(l=>l.country)).size,5);
  const previousSkills=new Set(previous.map(id=>pack.locations.find(l=>l.id===id).skillIds[0]));
  assert.ok(plan.focusSkills.every(s=>!previousSkills.has(s.id)));
  assert.deepEqual(plan,planPractice(pack,records,{now,seenLocationRefs:seen,previousSetLocationRefs:previous}));
  plans.push(plan);previous=plan.locationIds;seen.push(...previous);
  locations.forEach((location,i)=>records.push(attempt(location.skillIds[0],{
   id:`synthetic-${step}-${i}`,occurredAt:new Date(Date.parse(now)-(sets-step)*60000+i*1000).toISOString(),
   locationRef:location.id,mode:'practice',correct,evidenceValid:correct,feedbackSource:'assumed-on-advance',
  })));
 }
 return {plans,records};
}
test('first four successful sets introduce ranked country foundations, not higher-importance regional details',()=>{
 const p=curriculumPack(),{plans}=simulate(p,4,true);
 const introduced=plans.flatMap(plan=>plan.focusSkills.filter(s=>plan.newSkillIds.includes(s.id)));
 assert.ok(introduced.every(s=>s.curriculum.scope==='country-identification'));
 assert.deepEqual(introduced.map(s=>s.curriculum.rank),Array.from({length:introduced.length},(_,i)=>i));
});
test('practice success opens regional and specialist clues gradually while keeping foundations and review',()=>{
 const p=curriculumPack(),{plans,records}=simulate(p,30,true);
 assert.equal(plans.findIndex(plan=>plan.focusSkills.some(s=>s.curriculum.scope==='within-country-regional')),9);
 assert.ok(plans.some(plan=>plan.focusSkills.some(s=>s.curriculum.scope==='specialist')));
 for(const plan of plans){
  assert.ok(plan.focusSkills.filter(s=>s.curriculum.scope==='within-country-regional').length<=1);
  assert.ok(plan.focusSkills.filter(s=>s.curriculum.scope==='specialist').length<=1);
  assert.ok(plan.focusSkills.filter(s=>s.curriculum.scope==='country-identification').length>=3);
 }
 assert.ok(records.every(a=>a.mode==='practice'));
});
test('struggling learners and exposure without retrieval stay on country foundations',()=>{
 const p=curriculumPack(),{plans}=simulate(p,30,false);
 assert.ok(plans.every(plan=>plan.focusSkills.every(s=>s.curriculum.scope==='country-identification')));
 const exposed=p.locations.map(l=>l.id);
 const plan=planPractice(p,[],{now,seenLocationRefs:exposed.filter(id=>id.startsWith('0:'))});
 assert.ok(plan.focusSkills.every(s=>s.curriculum.scope==='country-identification'));
});
test('sparse curricula and regional-only packs remain playable without relaxing family or country caps',()=>{
 for(const regionalOnly of [false,true]){
  const p=curriculumPack();p.skills=p.skills.filter(s=>regionalOnly?s.id.startsWith('1:'):['0:0','0:1','1:2','1:3','2:4'].includes(s.id));
  p.pools[0].skillIds=p.skills.map(s=>s.id);
  const plan=planPractice(p,[],{now});
  assert.equal(plan.locationIds.length,5);assert.equal(new Set(plan.focusSkills.map(s=>s.practiceFamily)).size,5);
  if(!regionalOnly)assert.match(plan.reasons.join(' '),/Curriculum limits relaxed/);
 }
});
test('unranked skills stay available after ranked foundations, and practice can satisfy a prerequisite',()=>{
 const p=makePack();p.skills[0].curriculum={scope:'country-identification',rank:1};p.skills[0].importance=0;
 assert.equal(planPractice(p,[],{now}).focusSkills[0].id,'A');
 p.skills[1].prerequisites=['A'];p.skills[1].importance=100;
 const records=Array.from({length:3},(_,i)=>attempt('A',{id:'practice-'+i,mode:'practice',locationRef:'A-'+i}));
 assert.ok(planPractice(p,records,{now}).focusSkills.some(s=>s.id==='B'));
});
test('older practice and weak advanced clues get review rather than being displaced by novelty',()=>{
 const p=makePack();p.skills[0].importance=0;p.skills.slice(1).forEach(s=>s.importance=100);
 const records=p.skills.map(s=>attempt(s.id,{mode:'practice',occurredAt:s.id==='A'?'2026-10-17T07:00:00Z':'2026-10-19T07:00:00Z'}));
 assert.ok(planPractice(p,records,{now}).focusSkills.some(s=>s.id==='A'));
 const curriculum=curriculumPack(),successful=simulate(curriculum,11,true);
 const weak=successful.plans[9].focusSkills.find(s=>s.curriculum.scope==='within-country-regional');
 successful.records.push(attempt(weak.id,{id:'explicit-miss',mode:'practice',correct:false,evidenceValid:false,
  occurredAt:'2026-10-19T07:59:59Z'}));
 const plan=planPractice(curriculum,successful.records,{now,previousSetLocationRefs:successful.plans[10].locationIds});
 assert.ok(plan.focusSkills.some(s=>s.id===weak.id));
 assert.equal(plan.focusSkills.filter(s=>s.curriculum.scope==='within-country-regional').length,1);
});
test('a missing intermediate scope does not make the next supplied scope unreachable',()=>{
 const p=curriculumPack();p.skills=p.skills.filter(s=>s.curriculum.scope!=='within-country-regional');
 p.pools[0].skillIds=p.skills.map(s=>s.id);
 const {plans}=simulate(p,10,true);
 assert.ok(plans[9].focusSkills.some(s=>s.curriculum.scope==='specialist'));
});
test('a ranked introduction cannot take the family slot needed for a weak review',()=>{
 const p=curriculumPack();
 const records=[attempt('0:0',{mode:'practice',correct:false,evidenceValid:false})];
 const plan=planPractice(p,records,{now});
 assert.ok(plan.focusSkills.some(s=>s.id==='0:0'));
 assert.ok(!plan.focusSkills.some(s=>s.id==='0:10'));
});

test('strong recent answers do not bypass forty distinct foundation introductions',()=>{
 const p=curriculumPack(100);
 const records=Array.from({length:40},(_,i)=>attempt(`0:${i%10}`,{id:'repeat-'+i,mode:'practice'}));
 const plan=planPractice(p,records,{now});
 assert.ok(plan.focusSkills.every(s=>s.curriculum.scope==='country-identification'));
 const covered=Array.from({length:40},(_,i)=>attempt(`0:${i}`,{id:'covered-'+i,mode:'practice'}));
 assert.ok(planPractice(p,covered,{now}).focusSkills.some(s=>s.curriculum.scope==='within-country-regional'));
});
test('regional introductions require successful practice of that country, not only other countries',()=>{
 const p=curriculumPack(100);
 const records=Array.from({length:50},(_,i)=>i).filter(i=>i%10!==0)
  .map(i=>attempt(`0:${i}`,{id:'foundation-'+i,mode:'practice'}));
 assert.ok(!planPractice(p,records,{now}).focusSkills.some(s=>s.id==='1:0'));
 records.push(...Array.from({length:3},(_,i)=>attempt('0:0',{id:'country-'+i,mode:'practice'})));
 assert.ok(planPractice(p,records,{now}).focusSkills.some(s=>s.id==='1:0'));
 records.push(attempt('0:0',{id:'country-miss',mode:'practice',correct:false,evidenceValid:false}));
 assert.ok(!planPractice(p,records,{now}).focusSkills.some(s=>s.id==='1:0'));
});
test('countries with no foundation lessons wait for eighty percent foundation coverage',()=>{
 const p=curriculumPack(100);
 p.locations.filter(l=>l.skillIds[0]==='1:0').forEach(l=>l.country='missing-country');
 const records=Array.from({length:40},(_,i)=>attempt(`0:${i}`,{id:'foundation-'+i,mode:'practice'}));
 assert.ok(!planPractice(p,records,{now}).focusSkills.some(s=>s.id==='1:0'));
 records.push(...Array.from({length:40},(_,i)=>attempt(`0:${i+40}`,{id:'later-'+i,mode:'practice'})));
 assert.ok(planPractice(p,records,{now}).focusSkills.some(s=>s.id==='1:0'));
});
