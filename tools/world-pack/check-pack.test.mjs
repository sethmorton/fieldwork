// Engine-level checks on the built world pack. Run from the repo: node --test tools/world-pack/check-pack.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=process.env.FIELDWORK??new URL('../..',import.meta.url).pathname;
const {makeNextSet,validatePack}=await import(`${root}/src/next-set.mjs`);
const {progressTree}=await import(`${root}/src/progress.mjs`);
const {sourceNote}=await import(`${root}/src/source-note.mjs`);
const pack=JSON.parse(await readFile(`${root}/content/world.json`,'utf8'));
const now='2026-10-23T12:00:00Z';
const skillOf=new Map(pack.skills.map(s=>[s.id,s]));
test('world clue bank: every playable clue has two own panoramas and a readable PlonkIt note with attribution',async()=>{
 validatePack(pack);assert.equal(pack.practiceMapId,'000000000000000000000000');assert.equal(pack.maxLocationsPerCountry,1);
 assert.equal(pack.gradingPolicy,'recognition','Spotted/missed, not the country guess, schedules a clue.');
 // Publication maps a round back to its clue by panoId, so one panorama must never serve two clues.
 assert.equal(new Set(pack.locations.map(l=>l.panoId)).size,pack.locations.length);
 const counts=new Map();for(const l of pack.locations)counts.set(l.skillIds[0],(counts.get(l.skillIds[0])??0)+1);
 for(const s of pack.skills.filter(s=>s.availability==='available')){
  assert.ok(counts.get(s.id)>=2,s.id);
  // The card shows the embedded Plonk It text without fetching anything.
  const offline={get:()=>undefined,set:()=>{},fetchText:()=>{throw Error('Unexpected request')}};
  assert.ok((await sourceNote(s,pack.locations.find(l=>l.skillIds[0]===s.id),offline)).sourceNoteHtml.includes('<p>'),s.id);
  assert.match(s.attributionHtml,/Plonk It/);assert.match(s.attributionHtml,/CC BY-NC-SA 4\.0/);
  assert.match(s.source.url,/^https:\/\/www\.plonkit\.net\//);
  // Plonk It answers hotlinked originals with 403; only its resized copies render on the card.
  for(const url of s.imageUrls??[])assert.match(url,/^https:\/\/www\.plonkit\.net\/images\/resize\//,s.id);
 }
 assert.ok(pack.locations.every(l=>l.country&&l.region===l.country),'Country feedback needs a polygon country.');
});
test('world practice opens on regional clues, not a country-identification gate',()=>{
 const set=makeNextSet(pack,[],{now,seenLocationRefs:[],previousSetLocationRefs:[]});
 assert.equal(set.selectedLocations.length,5);
 assert.ok(set.focus.some(f=>skillOf.get(f.id).phase==='Regional clues'));
});
test('new clues come landscape and poles first, then by estimated ranked No Move detection, then foundational, useful, niche',()=>{
 const order={foundational:0,useful:1,niche:2},group={'landscape-and-poles':0,other:1};
 const ranked=pack.skills.filter(s=>s.availability==='available').sort((a,b)=>a.curriculum.rank-b.curriculum.rank);
 for(let i=1;i<ranked.length;i++){
  const [a,b]=[ranked[i-1].curriculum.source,ranked[i].curriculum.source];
  assert.ok(group[a.priorityGroup]<group[b.priorityGroup]||(a.priorityGroup===b.priorityGroup&&(a.acowPer1000>b.acowPer1000
   ||(a.acowPer1000===b.acowPer1000&&order[a.utilityTier]<=order[b.utilityTier]))),ranked[i].id);
 }
 // A scored build introduces clues ranked games show; a build without acow/clue-value.json keeps the curated order.
 const set=makeNextSet(pack,[],{now,seenLocationRefs:[],previousSetLocationRefs:[]});
 if(ranked.some(s=>s.curriculum.source.acowPer1000>0))
  assert.ok(set.focus.every(f=>skillOf.get(f.id).curriculum.source.acowPer1000>0),JSON.stringify(set.focus.map(f=>f.id)));
});
test('world practice keeps five countries and at most two clues per family per set and is publishable',()=>{
 let attempts=[],seen=[],previous=[],covered=new Set();
 for(let step=0;step<10;step++){
  const set=makeNextSet(pack,attempts,{now:`2026-10-23T12:${String(step).padStart(2,'0')}:00Z`,seenLocationRefs:seen,previousSetLocationRefs:previous});
  assert.equal(set.selectedLocations.length,5);
  assert.equal(new Set(set.selectedLocations.map(l=>l.country)).size,5);
  // publishPracticeSet resolves families via the first location with that panoId; the engine caps a family at two per set.
  const families=set.selectedLocations.map(l=>skillOf.get(pack.locations.find(p=>p.panoId===l.panoId).skillIds[0]).practiceFamily);
  assert.ok(Object.values(Object.groupBy(families,f=>f)).every(g=>g.length<=2),JSON.stringify(families));
  previous=set.selectedLocations.map(l=>l.id);seen.push(...previous);
  for(const [i,l] of set.selectedLocations.entries()){
   covered.add(l.skillIds[0]);
   attempts.push({id:`w-${step}-${i}`,skillId:l.skillIds[0],occurredAt:`2026-10-23T12:${String(step).padStart(2,'0')}:30Z`,correct:true,evidenceValid:i!==0,confidence:2,unfamiliar:true,locationRef:l.id,mode:'practice',feedbackSource:'explicit'});
  }
 }
 assert.ok(covered.size>=20,`Only ${covered.size} clues across ten sets.`);
});
test('the real world pack plans a set and renders progress quickly after a long history',()=>{
 const attempts=pack.locations.slice(0,3000).map((l,i)=>({id:`h-${i}`,skillId:l.skillIds[0],occurredAt:new Date(Date.parse(now)-(3000-i)*600000).toISOString(),correct:i%4!==0,evidenceValid:i%4!==0,confidence:2,unfamiliar:true,locationRef:l.id,mode:'practice',feedbackSource:'explicit'}));
 const options={now,seenLocationRefs:attempts.map(a=>a.locationRef),previousSetLocationRefs:attempts.slice(-5).map(a=>a.locationRef)};
 makeNextSet(pack,attempts,options);
 let started=performance.now();makeNextSet(pack,attempts,options);
 assert.ok(performance.now()-started<250,`Selection took ${Math.round(performance.now()-started)} ms.`);
 started=performance.now();progressTree(pack,attempts,now);
 assert.ok(performance.now()-started<250,`Progress took ${Math.round(performance.now()-started)} ms.`);
});
