import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {makeNextSet,validatePack} from '../next-set.mjs';
import {regionAt} from '../geo.mjs';
import {progressTree} from '../progress.mjs';
const pack=JSON.parse(await readFile(new URL('../../content/philippines.json',import.meta.url)));
const now='2026-10-20T12:00:00Z';
test('Philippines content is location-backed, deduplicated, attributed and country-only',()=>{
 validatePack(pack);
 assert.equal(pack.practiceMapId,'000000000000000000000000');
 assert.equal(new Set(pack.locations.map(l=>l.panoId)).size,pack.locations.length);
 for(const skill of pack.skills){
  assert.ok(skill.id.startsWith('ph:'));assert.ok(skill.source.url.startsWith('https://'));
  assert.equal(skill.sourceNoteHtml,undefined,'Full third-party notes belong in ignored local files.');
  if(skill.availability==='available'){
   assert.ok(pack.locations.filter(l=>l.skillIds[0]===skill.id).length>=2,skill.id);
   if(!skill.noteOrigin)assert.ok(pack.locations.some(l=>l.skillIds[0]===skill.id&&l.sourceMapId===skill.notesSourceMapId),'Note refresh needs an original-source panorama: '+skill.id);
  }
 }
 assert.equal(pack.sourceCoverage.guide.cards.length,47);
 assert.equal(pack.sourceCoverage.guide.cards.filter(c=>c.practiceStatus==='excluded-country-identification').length,13);
 assert.ok(pack.locations.every(l=>l.lat>4&&l.lat<22&&l.lng>116&&l.lng<127));
 assert.ok(pack.locations.every(l=>l.assessmentEligible===false),'Source anchors are not an independently held-out assessment pool.');
});
test('Philippines starts with regional fundamentals and keeps successive sets varied',()=>{
 let records=[],seen=[],previous=[],covered=new Set();
 for(let step=0;step<8;step++){
  const set=makeNextSet(pack,records,{now,seenLocationRefs:seen,previousSetLocationRefs:previous});
  const skills=set.focus.map(f=>pack.skills.find(s=>s.id===f.id));
  assert.equal(new Set(skills.map(s=>s.practiceFamily)).size,5);
  assert.ok(skills.every(s=>!s.recognitionOnly&&s.availability==='available'));
  assert.ok(set.selectedLocations.every(l=>!previous.some(id=>pack.locations.find(p=>p.id===id)?.skillIds[0]===l.skillIds[0])));
  if(step===0)assert.ok(skills.every(s=>s.importance>=75),'Start with regional fundamentals, not rare microvariants.');
  previous=set.selectedLocations.map(l=>l.id);seen.push(...previous);
  for(const [i,l]of set.selectedLocations.entries()){
   covered.add(l.skillIds[0]);records.push({id:`synthetic-${step}-${i}`,skillId:l.skillIds[0],occurredAt:`2026-10-20T11:${String(step).padStart(2,'0')}:00Z`,correct:i!==0,evidenceValid:i!==0,confidence:2,unfamiliar:true,locationRef:l.id,mode:'practice',feedbackSource:'assumed-on-advance'});
  }
 }
 assert.ok(covered.size>=18,`Only ${covered.size} targets across eight sets.`);
 const tree=progressTree(pack,records,now);assert.equal(tree.mastered,0);assert.ok(tree.practised>=18);
});
test('Philippines practice areas match known island/city anchors without claiming official administrative regions',()=>{
 assert.equal(regionAt(14.60,120.98,pack.regionFeatures),'Central Luzon / Metro Manila');
 assert.equal(regionAt(10.30,123.89,pack.regionFeatures),'Central Visayas');
 assert.equal(regionAt(7.07,125.60,pack.regionFeatures),'South / Central Mindanao');
 assert.equal(regionAt(-33.87,151.20,pack.regionFeatures),null);
 assert.ok(pack.geographySource.limits.includes('not current official'));
});
