import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {contentHash} from '../src/content-format.mjs';
// Every public pack the userscript knows must be hosted at or above its minimum revision, and every hosted body must be
// the one its manifest entry describes. Runtime still handles mismatches: requests can cross a deployment.
export async function checkHostedContent(publicCatalog,manifest,readBody){
  for(const entry of publicCatalog){
    const hosted=manifest.packs.find(item=>item.id===entry.id);
    assert.ok(hosted,`${entry.id} is in the public catalog but not in the hosted manifest.`);
    assert.ok(hosted.contentRevision>=entry.minimumRevision,`${entry.id} is hosted at revision ${hosted.contentRevision}, below ${entry.minimumRevision}.`);
  }
  const bodies=[];
  for(const entry of manifest.packs){
    const body=await readBody(entry.url),pack=JSON.parse(body);
    assert.equal(await contentHash(body),entry.sha256,`${entry.id} body does not match its manifest hash.`);
    assert.equal(pack.id,entry.id,`${entry.url} holds another pack.`);
    assert.equal(pack.contentRevision,entry.contentRevision,`${entry.id} body revision does not match its manifest.`);
    bodies.push({body,pack});
  }
  return bodies;
}
// The smallest hosted pack body is over 800 KB, so an engine under ENGINE_MAX cannot be carrying one. The bundled
// catalog (personal bindings and missed duel clues in local builds) is configuration, not engine, so it does not count.
const ENGINE_MAX=150000;
async function verifyBuild(){
  const script=await readFile('dist/fieldwork.user.js','utf8');
  const catalogBytes=Buffer.byteLength(await readFile('dist/practice-catalog.json','utf8'));
  assert.ok(Buffer.byteLength(script)-catalogBytes<ENGINE_MAX,'The userscript must not embed content packs.');
  const configured=JSON.parse(await readFile('dist/practice-packs.json','utf8'));
  for(const pack of configured)assert.ok(!script.includes(pack.locations[0]?.panoId),'Panorama data leaked into the engine bundle.');
  const catalog=JSON.parse(await readFile('dist/content-host/catalog.json','utf8'));
  const publicCatalog=JSON.parse(await readFile('dist/public-catalog.json','utf8'));
  for(const {body,pack} of await checkHostedContent(publicCatalog,catalog,url=>readFile('dist/content-host/'+url,'utf8'))){
    assert.equal(pack.practiceMapId,undefined);assert.equal(pack.sourceCoverage,undefined);
    assert.ok(pack.skills.every(skill=>!skill.sourceNoteHtml||skill.noteLicense),'Only openly licensed notes may ship in hosted content.');
    for(const local of configured)assert.ok(!body.includes(local.practiceMapId),'A personal practice-map binding leaked into hosted content.');
  }
  const publicScript=await readFile('dist/content-host/fieldwork.user.js','utf8');
  assert.ok(Buffer.byteLength(publicScript)<ENGINE_MAX,'The public userscript must not embed content packs.');
  assert.match(publicScript,/@updateURL\s+https:\/\/sethmorton\.github\.io\/fieldwork\/fieldwork\.user\.js/);
  for(const local of configured)assert.ok(!publicScript.includes(local.practiceMapId)&&!publicScript.includes(local.locations[0]?.panoId),'Personal bindings or panoramas leaked into the public userscript.');
  console.log(`Verified ${Buffer.byteLength(script).toLocaleString()}-byte engine, ${Buffer.byteLength(publicScript).toLocaleString()}-byte public engine and ${catalog.packs.length} separate public packs.`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await verifyBuild();
