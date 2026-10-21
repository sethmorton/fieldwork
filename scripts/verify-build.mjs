import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {contentHash} from '../src/content-format.mjs';
const script=await readFile('dist/fieldwork.user.js','utf8');
assert.ok(Buffer.byteLength(script)<100000,'The userscript must not embed content packs.');
const configured=JSON.parse(await readFile('dist/practice-packs.json','utf8'));
for(const pack of configured)assert.ok(!script.includes(pack.locations[0]?.panoId),'Panorama data leaked into the engine bundle.');
const catalog=JSON.parse(await readFile('dist/content-host/catalog.json','utf8'));
for(const entry of catalog.packs){
  const body=await readFile('dist/content-host/'+entry.url,'utf8'),pack=JSON.parse(body);
  assert.equal(await contentHash(body),entry.sha256);assert.equal(pack.id,entry.id);
  assert.equal(pack.practiceMapId,undefined);assert.equal(pack.sourceCoverage,undefined);
  assert.ok(pack.skills.every(skill=>!skill.sourceNoteHtml));
  for(const local of configured)assert.ok(!body.includes(local.practiceMapId),'A personal practice-map binding leaked into hosted content.');
}
console.log(`Verified ${Buffer.byteLength(script).toLocaleString()}-byte engine and ${catalog.packs.length} separate public packs.`);
