import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {makeNextSet,validatePack} from '../next-set.mjs';
import {regionAt} from '../geo.mjs';
const pack=JSON.parse(await readFile(new URL('../../content/worldwide.json',import.meta.url)));
const now='2026-10-21T12:00:00Z';
test('worldwide pack retains country-specific identities and accounts for all intermediate source labels',()=>{
 validatePack(pack);assert.equal(pack.practiceMapId,'000000000000000000000000');assert.equal(pack.maxLocationsPerCountry,1);
 assert.equal(pack.sourceCoverage.intermediateInventory.length,190);
 assert.equal(new Set(pack.sourceCoverage.intermediateInventory.map(m=>m.metaId)).size,190);
 assert.equal(new Set(pack.locations.map(l=>l.panoId)).size,pack.locations.length);
 for(const country of ['France','Spain','Canada','United States','Japan','Indonesia','Malaysia'])assert.ok(pack.skills.some(s=>s.notesCountry===country),country);
 const bollards=pack.skills.filter(s=>s.sourceMetaName.toLowerCase()==='bollard');assert.ok(bollards.length>10);
 assert.equal(new Set(bollards.map(s=>s.id)).size,bollards.length,'A shared short name must not merge different countries.');
 assert.ok(pack.skills.every(s=>!s.sourceNoteHtml),'Full source notes stay local.');
 assert.ok(pack.sourceCoverage.sources.every(s=>s.sharingAllowed));
 for(const s of pack.skills.filter(s=>s.availability==='available'))assert.ok(pack.locations.filter(l=>l.skillIds[0]===s.id).length>=2,s.id);
 for(const mismatch of pack.sourceCoverage.matchingReport.geographyDisagreements)assert.ok(!pack.locations.some(l=>l.panoId===mismatch.panoId),'Unresolved border/source disagreements stay out of practice.');
});
test('worldwide mix includes requested infrastructure, language and phone families without activating historical cars',()=>{
 const active=pack.skills.filter(s=>s.availability==='available');
 for(const family of ['bollards','pedestrian-signs','language','utility-poles','phone-codes','chevrons'])assert.ok(active.some(s=>s.practiceFamily===family),family);
 assert.ok(active.some(s=>s.notesCountry==='Japan'&&s.practiceFamily==='utility-poles'));
 assert.ok(active.some(s=>s.notesCountry==='Indonesia'&&s.practiceFamily==='utility-poles'));
 assert.ok(active.some(s=>s.notesCountry==='Malaysia'&&s.practiceFamily==='utility-poles'));
 assert.ok(active.some(s=>s.title.startsWith('Brazil')&&s.practiceFamily==='phone-codes'));
 assert.ok(!active.some(s=>s.practiceFamily==='coverage-meta'));
});
test('worldwide practice keeps five countries and five families while rotating gaps and new targets',()=>{
 let attempts=[],seen=[],previous=[],covered=new Set();
 for(let step=0;step<10;step++){
  const set=makeNextSet(pack,attempts,{now,seenLocationRefs:seen,previousSetLocationRefs:previous});
  assert.equal(set.selectedLocations.length,5);
  assert.equal(new Set(set.selectedLocations.map(l=>l.country)).size,5);
  assert.equal(new Set(set.focus.map(f=>pack.skills.find(s=>s.id===f.id).practiceFamily)).size,5);
  assert.ok(set.selectedLocations.every(l=>!previous.some(id=>pack.locations.find(p=>p.id===id).skillIds[0]===l.skillIds[0])));
  previous=set.selectedLocations.map(l=>l.id);seen.push(...previous);
  for(const [i,l]of set.selectedLocations.entries()){
   covered.add(l.skillIds[0]);attempts.push({id:`synthetic-${step}-${i}`,skillId:l.skillIds[0],occurredAt:`2026-10-21T11:${String(step).padStart(2,'0')}:00Z`,correct:i!==0,evidenceValid:i!==0,confidence:2,unfamiliar:true,locationRef:l.id,mode:'practice',feedbackSource:'explicit'});
  }
 }
 assert.ok(covered.size>=25,`Only ${covered.size} targets across ten sets.`);
});
test('a long worldwide history still selects the next set without freezing the page',()=>{
 // Continue runs on GeoGuessr's main thread; quadratic selection froze it for seconds at this history size.
 const attempts=pack.locations.slice(0,2000).map((l,i)=>({id:`long-${i}`,skillId:l.skillIds[0],occurredAt:new Date(Date.parse(now)-(2000-i)*60000).toISOString(),correct:i%3!==0,evidenceValid:true,confidence:2,unfamiliar:true,locationRef:l.id,mode:'assessment',feedbackSource:'explicit'}));
 const options={now,seenLocationRefs:attempts.map(a=>a.locationRef),previousSetLocationRefs:attempts.slice(-5).map(a=>a.locationRef)};
 makeNextSet(pack,attempts,options);
 const started=performance.now();makeNextSet(pack,attempts,options);
 assert.ok(performance.now()-started<250,`Selection took ${Math.round(performance.now()-started)} ms.`);
});
test('worldwide country feedback uses the actual country polygons',()=>{
 assert.equal(regionAt(35.68,139.76,pack.regionFeatures),'Japan');
 assert.equal(regionAt(48.86,2.35,pack.regionFeatures),'France');
 assert.equal(regionAt(-23.55,-46.63,pack.regionFeatures),'Brazil');
 assert.equal(regionAt(0,-140,pack.regionFeatures),null);
});
