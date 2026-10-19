import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {configurePack} from './setup.mjs';
const template=JSON.parse(await readFile(new URL('../content/australia.json',import.meta.url)));
test('setup accepts an owned map ID or native map-maker URL without changing the template',()=>{
 const id='111111111111111111111111';
 assert.equal(configurePack(template,id).practiceMapId,id);
 assert.equal(configurePack(template,`https://www.geoguessr.com/map-maker/${id}`).practiceMapId,id);
 assert.equal(template.practiceMapId,'000000000000000000000000');
});
test('setup rejects placeholders, malformed URLs and all source-map bindings',()=>{
 for(const value of ['000000000000000000000000','not-a-map','https://example.com/maps/111111111111111111111111',...new Set(template.locations.map(l=>l.sourceMapId))])assert.throws(()=>configurePack(template,value));
});
