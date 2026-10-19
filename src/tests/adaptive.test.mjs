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
test('new material has three slots even when old mistakes dominate the priority scores',()=>{
 const p=makePack();
 const records=['A','B','C','D','E'].map(id=>attempt(id,{correct:false,evidenceValid:false}));
 const r=planPractice(p,records,{now,size:5});
 assert.deepEqual(new Set(r.newSkillIds),new Set(['F','G','H']));
 assert.equal(r.focusSkills.filter(s=>records.some(a=>a.skillId===s.id)).length,2);
 assert.equal(new Set(familyIds(p,r)).size,5);
});
test('an exposed target is review even without recognition feedback',()=>{
 const p=makePack();
 const r=planPractice(p,[],{now,size:5,seenLocationRefs:p.skills.slice(0,5).map(s=>s.id+'-0')});
 assert.deepEqual(new Set(r.newSkillIds),new Set(['F','G','H']));
 assert.equal(r.focusSkills.filter(s=>['A','B','C','D','E'].includes(s.id)).length,2);
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
