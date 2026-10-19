import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (path) => JSON.parse(fs.readFileSync(new URL(path,import.meta.url)));
const curriculum=read('../australia-curriculum.json');
const deck=read('../deck-coverage.json');
const plonkit=read('../plonkit-coverage.json');
const pack=read('../australia-starter-pack.json');

test('curriculum preserves every original source unit exactly once',()=>{
 const source=[...deck.skills,...plonkit.skills];
 assert.equal(source.length,178);
 assert.equal(curriculum.sourceUnits.length,source.length);
 assert.equal(new Set(curriculum.sourceUnits.map(u=>u.sourceUnitId)).size,source.length);
 assert.deepEqual(new Set(curriculum.sourceUnits.map(u=>u.id)),new Set(source.map(u=>u.id)));
 for(const original of source){
  const unit=curriculum.sourceUnits.find(u=>u.id===original.id);
  assert.equal(unit.sourceUnitId,original.id);
  assert.deepEqual(unit.original,original);
  assert.ok(unit.sourceUrls.length);
 }
});

test('all units have exactly one conservative concept family and valid source references',()=>{
 const familyIds=new Set(curriculum.conceptFamilies.map(f=>f.id));
 const sourceIds=new Set(curriculum.sources.map(s=>s.id));
 const unitIds=new Set(curriculum.sourceUnits.map(u=>u.id));
 const membership=curriculum.conceptFamilies.flatMap(f=>f.sourceUnitIds);
 assert.equal(membership.length,curriculum.sourceUnits.length);
 assert.equal(new Set(membership).size,membership.length);
 assert.deepEqual(new Set(membership),unitIds);
 for(const unit of curriculum.sourceUnits){
  assert.ok(familyIds.has(unit.conceptFamilyId));
  assert.ok(sourceIds.has(unit.sourceId));
  assert.ok(curriculum.conceptFamilies.find(f=>f.id===unit.conceptFamilyId).sourceUnitIds.includes(unit.id));
 }
});

test('progression is an acyclic authored graph with valid family associations',()=>{
 const phases=new Map(curriculum.progressionFamilies.map(p=>[p.id,p]));
 const families=new Map(curriculum.conceptFamilies.map(f=>[f.id,f]));
 assert.deepEqual([...phases.keys()],['country-recognition','broad-landscapes','state-anchors','close-contrasts','regional-application','advanced-roads','unseen-transfer']);
 const visit=(id,ancestors=[])=>{
  assert.ok(phases.has(id));
  assert.ok(!ancestors.includes(id));
  for(const parent of phases.get(id).prerequisites)visit(parent,[...ancestors,id]);
 };
 for(const phase of phases.values()){
  visit(phase.id);
  assert.ok(phase.rationale&&phase.evidenceGate);
  for(const familyId of phase.conceptFamilyIds)assert.ok(families.has(familyId));
 }
 for(const family of families.values())for(const phaseId of family.progressionIds){
  assert.ok(phases.has(phaseId));
  assert.ok(phases.get(phaseId).conceptFamilyIds.includes(family.id));
 }
});

test('all original runtime skill IDs are retained without adding catalog skills to runtime',()=>{
 const runtimeIds=new Set(pack.skills.map(s=>s.id));
 const associations=curriculum.practiceSkillAssociations;
 const unitIds=new Set(curriculum.sourceUnits.map(u=>u.id));
 assert.equal(associations.length,20);
 assert.deepEqual(new Set(associations.map(a=>a.skillId)),runtimeIds);
 for(const association of associations){
  const skill=pack.skills.find(s=>s.id===association.skillId);
  assert.equal(association.title,skill.title);
  assert.equal(association.runtimeLocationCount,pack.locations.filter(l=>l.skillIds.includes(skill.id)).length);
  for(const id of association.sourceUnitIds){
   assert.ok(unitIds.has(id));
   assert.ok(curriculum.sourceUnits.find(u=>u.id===id).existingPracticeSkillIds.includes(skill.id));
  }
 }
 for(const unit of curriculum.sourceUnits){
  assert.equal(unit.readiness.catalogOnly,true);
  assert.equal(unit.readiness.eligibleForAdaptiveSelection,false);
  for(const id of unit.existingPracticeSkillIds)assert.ok(runtimeIds.has(id));
  assert.equal('mastery' in unit,false);
 }
 for(const family of curriculum.conceptFamilies)for(const id of family.existingPracticeSkillIds)assert.ok(runtimeIds.has(id));
});

test('source conflicts and teaching anchors cannot silently become mastery or new locations',()=>{
 const unitIds=new Set(curriculum.sourceUnits.map(u=>u.id));
 const runtimeIds=new Set(pack.skills.map(s=>s.id));
 for(const conflict of curriculum.sourceConflicts){
  for(const id of conflict.sourceUnitIds)assert.ok(unitIds.has(id));
  for(const id of conflict.practiceSkillIds||[])assert.ok(runtimeIds.has(id));
  assert.ok(conflict.issue&&conflict.resolutionRequired&&conflict.sourceUrls.length);
 }
 assert.equal(curriculum.referenceMaterial.deckSlides.length,103);
 assert.equal(curriculum.referenceMaterial.landscapeAnchors.length,59);
 assert.ok(curriculum.referenceMaterial.landscapeAnchors.every(a=>a.locationStatus==='unresolved_source_link'&&a.testEligibility.includes('teaching_anchor_only')));
 assert.equal(curriculum.activationRules.catalogUnitsNeverSelectableDirectly,true);
 assert.equal('locations' in curriculum,false);
});
