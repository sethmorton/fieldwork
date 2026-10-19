import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {makeNextSet} from '../next-set.mjs';
import {publishPracticeSet} from '../session.mjs';
const read=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const pack=await read('../../content/australia.json');
const starter=await read('../australia-starter-pack.json');
const imported=await read('../australia-foundations-imported-pool.json');
test('expansion retains old progress identities and adds only actual tagged panoramas',()=>{
 assert.equal(pack.id,starter.id);assert.deepEqual(pack.initialSkillIds,[]);
 for(const skill of starter.skills)assert.ok(pack.skills.some(current=>current.id===skill.id));
 for(const location of starter.locations)assert.deepEqual(pack.locations.find(current=>current.id===location.id),location);
 assert.equal(imported.locations.length,141);assert.equal(pack.locations.length,531);
 assert.equal(new Set(pack.locations.map(location=>location.panoId)).size,531);
 for(const location of pack.locations)assert.ok([...starter.locations,...imported.locations].some(source=>source.panoId===location.panoId&&source.lat===location.lat&&source.lng===location.lng));
 assert.equal(pack.skills.filter(skill=>skill.availability==='available'||!skill.availability).length,36);
 assert.equal(pack.skills.filter(skill=>skill.availability&&skill.availability!=='available').length,6);
 assert.ok(pack.skills.filter(skill=>skill.recognitionOnly).every(skill=>skill.availability==='needs-contrasts'));
});
test('mixed foundations replace the starter gate without changing original skill identities',()=>{
 const set=makeNextSet(pack,[],{now:'2026-10-19T08:00:00Z'});assert.equal(set.selectedLocations.length,5);assert.equal(new Set(set.focus.map(f=>pack.skills.find(s=>s.id===f.id).practiceFamily)).size,5);assert.ok(set.focus.every(f=>!pack.skills.find(s=>s.id===f.id).recognitionOnly));
});
test('a union pool cannot make either owned source map writable',async()=>{
 for(const sourceId of new Set(pack.locations.map(location=>location.sourceMapId))){
  let called=false;
  await assert.rejects(()=>publishPracticeSet({...pack,practiceMapId:sourceId},makeNextSet(pack,[]),()=>{called=true},()=>{}),/never the source map/);
  assert.equal(called,false);
 }
});
