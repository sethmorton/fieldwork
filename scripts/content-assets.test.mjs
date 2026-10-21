import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {writeContentAssets} from './content-assets.mjs';
import {contentHash} from '../src/content-format.mjs';
test('published content has hashed assets, separate inventories and no personal binding or full notes',async()=>{
  const directory=await mkdtemp(tmpdir()+'/fieldwork-assets-');
  try{
    const source=JSON.parse(await readFile(new URL('../content/australia.json',import.meta.url)));
    source.practiceMapId='111111111111111111111111';source.skills[0].sourceNoteHtml='Private hydrated source explanation';
    const [entry]=await writeContentAssets([source],directory),body=await readFile(directory+'/'+entry.url,'utf8'),runtime=JSON.parse(body);
    assert.equal(runtime.practiceMapId,undefined);assert.ok(!body.includes('Private hydrated source explanation'));
    assert.equal(runtime.sourceCoverage,undefined);assert.equal(runtime.curriculum,undefined);
    assert.equal(await contentHash(body),entry.sha256);assert.ok(entry.url.includes(entry.sha256));
    assert.deepEqual(JSON.parse(await readFile(directory+'/'+entry.auditUrl,'utf8')).sourceCoverage,source.sourceCoverage);
    assert.equal(JSON.parse(await readFile(directory+'/catalog.json','utf8')).schemaVersion,1);
  }finally{await rm(directory,{recursive:true,force:true})}
});
