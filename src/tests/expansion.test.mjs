import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {makeNextSet} from '../next-set.mjs';
import {publishPracticeSet} from '../session.mjs';
const read=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const pack=await read('../../content/australia.json');
const starter=await read('../australia-starter-pack.json');
const imported=await read('../australia-foundations-imported-pool.json');
const sourceC=await read('../australia-source-c.json');
const candidates=await read('../australia-guide-candidates.json');
const curation=await read('../australia-source-c-curation.json');
const field=await read('../australia-field-verified.json');
test('expansion retains old progress identities and adds only actual tagged panoramas',()=>{
 assert.equal(pack.id,starter.id);assert.deepEqual(pack.initialSkillIds,[]);
 for(const skill of starter.skills)assert.ok(pack.skills.some(current=>current.id===skill.id));
 for(const location of starter.locations)assert.deepEqual(pack.locations.find(current=>current.id===location.id),location);
 assert.equal(imported.locations.length,141);assert.equal(pack.locations.length,815);
 assert.equal(new Set(pack.locations.map(location=>location.panoId)).size,815);
 for(const location of pack.locations)assert.ok([...starter.locations,...imported.locations,...sourceC.locations,...field.locations,...candidates.plonkit.flatMap(card=>card.locationCandidates.filter(example=>example.coordinates).map(example=>({panoId:example.panoId,lat:example.coordinates.lat,lng:example.coordinates.lng})))].some(source=>source.panoId===location.panoId&&source.lat===location.lat&&source.lng===location.lng));
 assert.equal(pack.skills.filter(skill=>skill.availability==='available'||!skill.availability).length,74);
 assert.equal(pack.skills.filter(skill=>skill.availability&&skill.availability!=='available').length,41);
 assert.ok(pack.skills.filter(skill=>skill.recognitionOnly).every(skill=>skill.availability==='needs-contrasts'));
});
test('mixed foundations replace the starter gate without changing original skill identities',()=>{
 const set=makeNextSet(pack,[],{now:'2026-10-19T08:00:00Z'});assert.equal(set.selectedLocations.length,5);
 const families=set.focus.map(f=>pack.skills.find(s=>s.id===f.id).practiceFamily);assert.ok(families.every(f=>families.filter(other=>other===f).length<=2));
 assert.ok(set.focus.every(f=>!pack.skills.find(s=>s.id===f.id).recognitionOnly));
});
test('a union pool cannot make either owned source map writable',async()=>{
 for(const sourceId of new Set(pack.locations.map(location=>location.sourceMapId))){
  let called=false;
  await assert.rejects(()=>publishPracticeSet({...pack,practiceMapId:sourceId},makeNextSet(pack,[]),()=>{called=true},()=>{}),/never the source map/);
  assert.equal(called,false);
 }
});


test('source-C merge deduplicates semantic aliases and preserves acquired coordinates',()=>{
 assert.equal(sourceC.locations.length,222);assert.equal(sourceC.skills.length,105);
 for(const location of sourceC.locations){
  const actual=pack.locations.find(l=>l.panoId===location.panoId);
  const prior=[...starter.locations,...imported.locations].find(l=>l.panoId===location.panoId);
  assert.ok(actual);assert.equal(actual.lat,prior?.lat??location.lat);assert.equal(actual.lng,prior?.lng??location.lng);
  const source=sourceC.skills.find(s=>s.id===location.skillIds[0]);
  const authored=curation.find(c=>c.sourceMetaName.replace(/^Australia\s*-\s*/,'')===source.title);
  assert.equal(actual.skillIds[0],authored.targetId);
 }
 assert.ok(pack.skills.some(s=>s.id==='au:lm:659'));
 assert.ok(pack.skills.some(s=>s.id==='au:lm:7427'));
 assert.equal(pack.skills.find(s=>s.id==='au:lm:7427').practiceFamily,'pole-construction');
});
test('every source unit is accounted for without implying full coverage or mastery',()=>{
 const units=pack.sourceCoverage.sourceUnits;
 assert.equal(units.length,178);assert.equal(new Set(units.map(u=>u.sourceUnitId)).size,178);
 assert.deepEqual(new Set(units.map(u=>u.sourceUnitId)),new Set(pack.curriculum.sourceUnits.map(u=>u.id)));
 for(const unit of units){
  assert.ok(unit.status&&unit.reason&&unit.sourceUrls.length);
  for(const id of unit.targetIds)assert.ok(pack.skills.some(s=>s.id===id));
  for(const id of unit.activeTargetIds)assert.ok(pack.skills.some(s=>s.id===id&&(!s.availability||s.availability==='available')));
  assert.equal('mastery' in unit,false);
 }
 assert.equal(pack.sourceCoverage.deckTeachingAnchors.length,59);
 assert.ok(pack.sourceCoverage.deckTeachingAnchors.every(a=>a.panoId&&Number.isFinite(a.latitude)&&Number.isFinite(a.longitude)));
 assert.equal(units.find(u=>u.sourceUnitId==='au:deck:phone-area').status,'partial-location-backed');
 assert.equal(units.find(u=>u.sourceUnitId==='au:deck:phone-local').status,'needs-tagged-locations');
});
test('unreliable historical claims and singleton new targets remain inactive',()=>{
 for(const item of curation.filter(c=>!c.existing)){
  const skill=pack.skills.find(s=>s.id===item.targetId);
  assert.equal(skill.notesSourceMapId,item.sourceMapId);
  if(item.holdReason)assert.equal(skill.availability,'needs-verification');
  if(skill.availability==='available')assert.ok(new Set(pack.locations.filter(l=>l.skillIds[0]===skill.id).map(l=>l.panoId)).size>=2);
 }
 for(const id of ['au:lm:7471','au:lm:7462','au:lm:7449','au:lm:7450'])assert.equal(pack.skills.find(s=>s.id===id).availability,'needs-verification');
 const foreign=new Set(candidates.plonkit.flatMap(card=>card.locationCandidates.filter(e=>e.exampleRole==='comparison-foil').map(e=>e.panoId)));
 for(const l of pack.locations.filter(l=>l.provenance))assert.ok(!foreign.has(l.panoId));
 assert.equal(JSON.stringify(pack).includes('sourceNoteHtml'),false);
});


test('field-reviewed examples use the actually visible panorama and do not relabel old targets',()=>{
 assert.equal(field.skills.length,7);assert.equal(field.locations.length,16);
 for(const target of field.skills){
  assert.equal(target.noteOrigin,'fieldwork-authored');assert.ok(target.trainingNote.trim());
  const examples=pack.locations.filter(l=>l.skillIds[0]===target.id);
  assert.ok(new Set(examples.map(l=>l.panoId)).size>=2);
  for(const example of examples){
   assert.equal(example.assessmentEligible,false);assert.equal(example.provenance.visualChecked,true);
   assert.equal(example.panoId,example.provenance.actualPanoId);assert.ok(example.region);
   assert.ok(example.provenance.observedCue&&example.provenance.sourceUrl.startsWith('https://'));
  }
 }
 for(const code of ['02','03','07','08'])assert.ok(field.skills.some(s=>s.id==='au:phone:'+code&&s.practiceFamily==='phone-codes'));
 // A stale source ID must not inherit visual confirmation from its replacement.
 const replaced=field.locations.filter(l=>l.provenance.originalPanoId!==l.panoId);
 assert.ok(replaced.length>=5);
 for(const l of replaced)assert.ok(!field.locations.some(other=>other.panoId===l.provenance.originalPanoId));
 assert.equal(new Set(field.skills.map(s=>s.practiceFamily)).size,4);
});
