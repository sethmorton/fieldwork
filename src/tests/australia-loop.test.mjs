import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {makeNextSet} from '../next-set.mjs';
const pack=JSON.parse(await readFile(new URL('../../content/australia.json',import.meta.url)));
const now='2026-10-19T08:00:00Z';
test('Australia-only practice selects regional differences across five families and keeps repair varied',()=>{
 const first=makeNextSet(pack,[],{size:5,now});const skills=first.focus.map(f=>pack.skills.find(s=>s.id===f.id));
 assert.equal(new Set(skills.map(s=>s.practiceFamily)).size,5);assert.ok(skills.every(s=>!s.recognitionOnly));
 assert.equal(first.selectedLocations.length,5);assert.equal(new Set(first.selectedLocations.map(l=>l.panoId)).size,5);
 const records=first.selectedLocations.map((l,i)=>({id:`synthetic-${i}`,skillId:l.skillIds[0],occurredAt:`2026-10-19T07:00:0${i}Z`,correct:i!==0,evidenceValid:i!==0,confidence:2,unfamiliar:true,locationRef:l.id,mode:'assessment'}));
 const repair=makeNextSet(pack,records,{size:5,now,seenLocationRefs:first.selectedLocations.map(l=>l.id)});
 assert.equal(repair.selectedLocations.filter(l=>l.skillIds[0]===records[0].skillId).length,1);
 assert.equal(new Set(repair.focus.map(f=>pack.skills.find(s=>s.id===f.id).practiceFamily)).size,5);
 assert.ok(repair.selectedLocations.every(l=>!first.selectedLocations.some(old=>old.panoId===l.panoId)));
});
test('multiple successive mixed sets keep distinct families while covering more targets',()=>{
 let records=[],exposed=[],covered=new Set();
 for(let round=0;round<6;round++){
  const set=makeNextSet(pack,records,{size:5,now,seenLocationRefs:exposed});
  assert.equal(new Set(set.focus.map(f=>pack.skills.find(s=>s.id===f.id).practiceFamily)).size,5);
  assert.ok(set.focus.every(f=>!pack.skills.find(s=>s.id===f.id).recognitionOnly));
  for(const [i,l]of set.selectedLocations.entries()){covered.add(l.skillIds[0]);exposed.push(l.id);records.push({id:`synthetic-${round}-${i}`,skillId:l.skillIds[0],occurredAt:`2026-10-19T07:${String(round).padStart(2,'0')}:0${i}Z`,correct:true,evidenceValid:true,confidence:2,unfamiliar:true,locationRef:l.id,mode:'practice',feedbackSource:'assumed-on-advance'});}
 }
 assert.ok(covered.size>=12,`Only ${covered.size} targets were covered across six sets.`);
});
test('country-only clues stay excluded even when historical misses make them urgent',()=>{
 const national=pack.skills.filter(s=>s.recognitionOnly);
 assert.equal(national.length,5);
 const attempts=national.map((s,i)=>({id:`national-miss-${i}`,skillId:s.id,occurredAt:'2026-10-19T07:00:00Z',correct:false,evidenceValid:false,confidence:2,unfamiliar:true,locationRef:pack.locations.find(l=>l.skillIds[0]===s.id).id,mode:'practice'}));
 for(let i=0;i<20;i++){
  const set=makeNextSet(pack,attempts,{now,seenLocationRefs:pack.locations.slice(i,i+10).map(l=>l.id)});
  assert.ok(set.focus.every(f=>!national.some(s=>s.id===f.id)));
 }
});
