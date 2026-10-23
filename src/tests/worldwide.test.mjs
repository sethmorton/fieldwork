import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {makeNextSet,validatePack} from '../next-set.mjs';
import {progressTree} from '../progress.mjs';
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
test('worldwide practice keeps five countries and at most two per family while rotating gaps and new targets',()=>{
 let attempts=[],seen=[],previous=[],covered=new Set();
 for(let step=0;step<10;step++){
  const set=makeNextSet(pack,attempts,{now,seenLocationRefs:seen,previousSetLocationRefs:previous});
  assert.equal(set.selectedLocations.length,5);
  assert.equal(new Set(set.selectedLocations.map(l=>l.country)).size,5);
  const families=set.focus.map(f=>pack.skills.find(s=>s.id===f.id).practiceFamily);
  assert.ok(families.every(f=>families.filter(other=>other===f).length<=2));
  assert.ok(set.selectedLocations.every(l=>!previous.some(id=>pack.locations.find(p=>p.id===id).skillIds[0]===l.skillIds[0])));
  previous=set.selectedLocations.map(l=>l.id);seen.push(...previous);
  for(const [i,l]of set.selectedLocations.entries()){
   // Sets played a minute apart just before now: only the misses are already due, so new targets keep rotating in.
   covered.add(l.skillIds[0]);attempts.push({id:`synthetic-${step}-${i}`,skillId:l.skillIds[0],occurredAt:`2026-10-21T11:5${step}:30Z`,correct:i!==0,evidenceValid:i!==0,confidence:2,unfamiliar:true,locationRef:l.id,mode:'practice',feedbackSource:'explicit'});
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
test('a world clue bank (6,000 clues, 15,000 panoramas, 5,000 outcomes) plans and renders progress quickly',()=>{
 // Synthetic stand-in for the world pack; guards against skills × history or skills² work on the main thread.
 const scopes=['country-identification','within-country-regional','specialist'];
 const skills=Array.from({length:6000},(_,i)=>({id:'s'+i,title:'Clue '+i,phase:'Mixed',prerequisites:i%100===1?['s'+(i-1)]:[],
  practiceFamily:'family-'+i%40,curriculum:{scope:scopes[Math.min(2,Math.floor(i/2500))],rank:i}}));
 const locations=Array.from({length:15000},(_,j)=>({id:'l'+j,panoId:'p'+j,lat:j/100-75,lng:(j*7)%350-175,skillIds:['s'+j%6000],country:'c'+(j%6000)%150}));
 const big={id:'world-scale',title:'World scale',subject:'World',skills,locations,maxLocationsPerCountry:1,
  pools:[{id:'pool',title:'World',skillIds:skills.map(s=>s.id),mapUrl:'https://www.geoguessr.com/maps/0123456789abcdef01234567'}]};
 const attempts=Array.from({length:5000},(_,i)=>{const l=locations[(i*7)%3000];return {id:'o'+i,skillId:l.skillIds[0],
  occurredAt:new Date(Date.parse(now)-(5000-i)*15*60000).toISOString(),correct:i%4!==0,evidenceValid:true,confidence:2,unfamiliar:true,
  locationRef:l.id,mode:i%2?'practice':'assessment',feedbackSource:i%3?'assumed-on-advance':'explicit'};});
 const options={now,seenLocationRefs:attempts.map(a=>a.locationRef),previousSetLocationRefs:attempts.slice(-5).map(a=>a.locationRef)};
 assert.equal(makeNextSet(big,attempts,options).selectedLocations.length,5);progressTree(big,attempts,now);
 let started=performance.now();makeNextSet(big,attempts,options);const plan=performance.now()-started;
 started=performance.now();progressTree(big,attempts,now);const tree=performance.now()-started;
 assert.ok(plan<250,`Selection took ${Math.round(plan)} ms.`);assert.ok(tree<250,`Progress tree took ${Math.round(tree)} ms.`);
});
test('worldwide country feedback uses the actual country polygons',()=>{
 assert.equal(regionAt(35.68,139.76,pack.regionFeatures),'Japan');
 assert.equal(regionAt(48.86,2.35,pack.regionFeatures),'France');
 assert.equal(regionAt(-23.55,-46.63,pack.regionFeatures),'Brazil');
 assert.equal(regionAt(0,-140,pack.regionFeatures),null);
});
