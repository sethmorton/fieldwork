import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceNote} from '../source-note.mjs';
const skill={id:'fr:bollard',title:'France - Bollard',sourceMetaName:'Bollard',notesCountry:'France',notesSourceMapId:'source-map'};
const location={panoId:'actual-pano'};
test('source explanations are fetched on demand, country-checked and cached locally',async()=>{
  const data={};let requests=0;
  const options={get:(key)=>data[key],set:(key,value)=>data[key]=value,fetchText:async url=>{
    requests++;assert.equal(new URL(url).searchParams.get('panoId'),'actual-pano');
    return JSON.stringify({country:'France ',metaName:'Bollard',note:'Source explanation',footer:'Author'});
  }};
  assert.equal((await sourceNote(skill,location,options)).sourceNoteHtml,'Source explanation');
  assert.equal((await sourceNote(skill,location,options)).attributionHtml,'Author');assert.equal(requests,1);
  for(const wrong of [{country:'Spain',metaName:'Bollard',note:'Wrong country'},{country:'France',metaName:'Pole',note:'Wrong clue'}]){
    await assert.rejects(sourceNote(skill,location,{...options,get:()=>null,fetchText:async()=>JSON.stringify(wrong)}),/changed/);
  }
});
test('a new country pack matches source labels carrying that country prefix without per-country code',async()=>{
  const japan={id:'jp:poles',title:'Japan - Utility poles',notesSourceMapId:'source-map'},options={get:()=>null,set:()=>{}};
  const note=country=>({fetchText:async()=>JSON.stringify({country,metaName:'Utility poles',note:'Source explanation'})});
  assert.equal((await sourceNote(japan,location,{...options,...note('Japan')})).sourceNoteHtml,'Source explanation');
  await assert.rejects(sourceNote(japan,location,{...options,...note('South Korea')}),/changed/);
});
test('existing and authored explanations require no request or storage write',async()=>{
  const options={get:()=>{throw Error('Unexpected read')},set:()=>{throw Error('Unexpected write')},fetchText:()=>{throw Error('Unexpected request')}};
  for(const existing of [{...skill,sourceNoteHtml:'Migrated note'},{...skill,noteOrigin:'fieldwork-authored',trainingNote:'Checked teaching note'}])assert.equal(await sourceNote(existing,location,options),existing);
});
