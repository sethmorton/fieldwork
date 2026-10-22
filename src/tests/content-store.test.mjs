import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContentStore} from '../content-store.mjs';
import {splitPack,contentHash} from '../content-format.mjs';
import {makeNextSet} from '../next-set.mjs';
import {progressTree} from '../progress.mjs';

const map='111111111111111111111111',otherMap='222222222222222222222222';
const pack=(id='au',revision=1)=>({id,title:id,subject:id,contentRevision:revision,practiceMapId:map,
  skills:[{id:id+':clue',title:'Clue',phase:'Mixed',prerequisites:[],sourceNoteHtml:'Local explanation'}],
  pools:[],locations:[],sourceCoverage:{units:['original']},curriculum:{units:['original']}});
const descriptor={id:'au',title:'au',subject:'au',practiceMapId:map,manifestUrl:'https://example.com/catalog.json'};
function storage(initial={}){
  const data=structuredClone(initial),reads=[],writes=[],cached=new Map();
  return {data,reads,writes,cached,get:(key,fallback)=>{reads.push(key);return data[key]??fallback},set:(key,value)=>{writes.push(key);data[key]=structuredClone(value)},
    list:()=>Object.keys(data),remove:key=>{writes.push(key);delete data[key]},
    cache:{get:async key=>structuredClone(cached.get(key)),set:async(key,value)=>{cached.set(key,structuredClone(value))}}};
}
// Tampermonkey copies every GM value into every page load; pack bodies must not live there.
const gmContent=saved=>Object.keys(saved.data).filter(key=>key.startsWith('fieldwork:content:')||key==='fieldwork:packs'||key==='fieldwork:pack');
async function remote(value){
  const {runtime,audit}=splitPack(value,{publicContent:true}),body=JSON.stringify(runtime),auditBody=JSON.stringify(audit);
  const entry={id:value.id,title:value.title,contentRevision:value.contentRevision,url:'pack.json',sha256:await contentHash(body),auditUrl:'audit.json',auditSha256:await contentHash(auditBody)};
  return {entry,fetchText:async url=>url.endsWith('catalog.json')?JSON.stringify({schemaVersion:1,packs:[entry]}):url.endsWith('audit.json')?auditBody:body};
}
test('migration separates content once and preserves every learner key and owned binding',async()=>{
  const old=pack(),ph={...pack('ph'),practiceMapId:otherMap},attempts=[{id:'real-history'}];
  const saved=storage({'fieldwork:packs':[old,ph],'fieldwork:pack':old,'fieldwork:au:attempts':attempts,'fieldwork:au:pending-review':{untouched:true},'fieldwork:au:active-set':{locationIds:['old']}});
  const store=createContentStore({...saved,catalog:[{...descriptor,practiceMapId:'333333333333333333333333'}],fetchText:async()=>{throw Error('offline')}});
  assert.equal(store.catalog[0].practiceMapId,map);assert.equal(store.catalog.length,2);
  const loaded=await store.load('au');assert.equal(loaded.skills[0].sourceNoteHtml,'Local explanation');assert.equal(loaded.sourceCoverage,undefined);
  assert.deepEqual(await store.audit('au'),{sourceCoverage:old.sourceCoverage,curriculum:old.curriculum});
  assert.deepEqual(saved.data['fieldwork:au:attempts'],attempts);assert.deepEqual(saved.data['fieldwork:au:pending-review'],{untouched:true});
  assert.equal(saved.data['fieldwork:au:active-set'].locationIds[0],'old');assert.ok(saved.data['fieldwork:au:active-set'].contentKey);
  assert.deepEqual(gmContent(saved),[]);
  saved.reads.length=0;saved.writes.length=0;
  const second=createContentStore({...saved,catalog:[descriptor],fetchText:async()=>{throw Error('offline')}});
  await second.load('au');
  assert.ok(!saved.reads.includes('fieldwork:packs'));assert.ok(!saved.reads.includes('fieldwork:pack'));
  assert.ok(!saved.reads.some(key=>key.startsWith('fieldwork:content:ph:')));assert.deepEqual(saved.writes,[]);
});
test('0.10 content kept in GM storage moves to the cache once without touching progress or the in-flight set',async()=>{
  const {runtime,audit}=splitPack(pack()),key='fieldwork:content:au:legacy-1',attempts=[{id:'real-history'}];
  const saved=storage({'fieldwork:content-schema':1,'fieldwork:packs':[pack()],[key]:runtime,[key+':audit']:audit,'fieldwork:au:content-head':{key,revision:1,auditKey:key+':audit',legacy:true},
    'fieldwork:catalog':[descriptor],'fieldwork:au:attempts':attempts,'fieldwork:au:active-set':{locationIds:['in-flight'],contentKey:key}});
  const store=createContentStore({...saved,catalog:[descriptor],fetchText:async()=>{throw Error('offline')}});
  assert.equal((await store.load('au',{gameId:'in-flight-game'})).skills[0].sourceNoteHtml,'Local explanation');
  assert.deepEqual(gmContent(saved),[]);assert.deepEqual(saved.cached.get(key),runtime);
  assert.deepEqual(saved.data['fieldwork:au:attempts'],attempts);assert.deepEqual(saved.data['fieldwork:au:active-set'],{locationIds:['in-flight'],contentKey:key});
  assert.deepEqual(await store.audit('au'),audit);
});
test('first download verifies content and defers source inventory until requested',async()=>{
  const saved=storage(),server=await remote(pack()),requests=[];
  const store=createContentStore({...saved,catalog:[descriptor],fetchText:async url=>{requests.push(url);return server.fetchText(url)}});
  const loaded=await store.load('au');assert.equal(loaded.practiceMapId,map);assert.equal(loaded.skills[0].sourceNoteHtml,undefined);
  assert.deepEqual(requests,['https://example.com/catalog.json','https://example.com/pack.json']);
  assert.deepEqual((await store.audit('au')).sourceCoverage,{units:['original']});assert.equal(requests.at(-1),'https://example.com/audit.json');
});
test('failed, corrupt, incompatible and wrong-country updates leave the working cache untouched',async()=>{
  const saved=storage({'fieldwork:pack':pack()}),server=await remote(pack('au',2));let mode='offline';
  const store=createContentStore({...saved,catalog:[descriptor],fetchText:async url=>{
    if(mode==='offline')throw Error('offline');
    if(url.endsWith('catalog.json'))return JSON.stringify({schemaVersion:mode==='schema'?999:1,packs:[server.entry]});
    if(mode==='corrupt')return '{}';
    return server.fetchText(url);
  }});
  const original=await store.load('au');
  for(mode of ['offline','corrupt','schema']){assert.equal((await store.refresh('au')).contentRevision,1);assert.deepEqual(await store.load('au'),original)}
  const wrong=await remote(pack('ph',3));server.entry=wrong.entry;
  assert.equal((await store.refresh('au')).id,'au');
});
test('content updates keep in-flight games pinned and never modify observations',async()=>{
  const saved=storage({'fieldwork:pack':pack(),'fieldwork:au:attempts':[{id:'existing'}]});let server=await remote(pack('au',2));
  const store=createContentStore({...saved,catalog:[descriptor],fetchText:url=>server.fetchText(url)});
  await store.load('au');store.pinSet('au',{selectedLocations:[],sourceNotes:[]});store.pinGame('au','first-game');
  const next=await store.refresh('au');assert.equal(next.contentRevision,2);assert.equal(next.practiceMapId,map);
  assert.equal((await store.load('au',{gameId:'first-game'})).contentRevision,1);
  const audit=await store.audit('au');assert.equal(audit.sourceCoverage.units[0],'original');
  assert.deepEqual(saved.data['fieldwork:au:attempts'],[{id:'existing'}]);
  store.pinSet('au',{selectedLocations:[],sourceNotes:[]});store.pinGame('au','second-game');
  assert.equal((await store.load('au',{gameId:'second-game'})).contentRevision,2);
});
test('an update arriving during publication cannot change the prepared set content version',async()=>{
  const saved=storage({'fieldwork:pack':pack()}),server=await remote(pack('au',2));
  const store=createContentStore({...saved,catalog:[descriptor],fetchText:url=>server.fetchText(url)});
  const selectedFrom=await store.load('au');await store.refresh('au');
  store.pinSet('au',{selectedLocations:[],sourceNotes:[]},selectedFrom);store.pinGame('au','published-before-update');
  assert.equal((await store.load('au',{gameId:'published-before-update'})).contentRevision,1);
  assert.equal((await store.load('au')).contentRevision,2);
});
test('failed first downloads reject rather than creating a false ready state',async()=>{
  const saved=storage(),store=createContentStore({...saved,catalog:[descriptor],fetchText:async()=>{throw Error('offline')}});
  await assert.rejects(store.load('au'),/offline/);assert.equal(saved.data['fieldwork:au:content-head'],undefined);
});
test('interrupted migration retries without dropping a custom pack or altering progress',async()=>{
  const saved=storage({'fieldwork:pack':pack('custom'),'fieldwork:custom:attempts':[{id:'existing'}]});
  assert.throws(()=>createContentStore({...saved,set:(key,value)=>{if(key==='fieldwork:catalog')throw Error('interrupted');saved.set(key,value)},catalog:[],fetchText:async()=>''}),/interrupted/);
  assert.equal(saved.data['fieldwork:content-schema'],undefined);
  const resumed=createContentStore({...saved,catalog:[],fetchText:async()=>''});
  assert.equal((await resumed.load('custom')).id,'custom');assert.deepEqual(saved.data['fieldwork:custom:attempts'],[{id:'existing'}]);
});
test('manual imports stay local and a cold loader cannot silently install an older configured revision',async()=>{
  const saved=storage(),server=await remote(pack()),store=createContentStore({...saved,catalog:[{...descriptor,minimumRevision:2}],fetchText:server.fetchText});
  await assert.rejects(store.load('au'),/older/);
  await store.add(pack('au',3));assert.equal((await store.refresh('au')).contentRevision,3);
  const reopened=createContentStore({...saved,catalog:[descriptor],fetchText:async()=>{throw Error('Manual content must not contact the public host')}});
  assert.equal((await reopened.refresh('au')).contentRevision,3);
});
test('splitting all three packs preserves exact adaptive selections, camera settings and progress states',async()=>{
  for(const name of ['australia','philippines','worldwide']){
    const original=JSON.parse(await readFile(new URL('../../content/'+name+'.json',import.meta.url))),{runtime}=splitPack(original,{publicContent:true});
    let attempts=[],seen=[],previous=[];
    for(let step=0;step<3;step++){
      const options={now:'2026-10-21T12:00:00Z',seenLocationRefs:seen,previousSetLocationRefs:previous};
      const before=makeNextSet(original,attempts,options),after=makeNextSet(runtime,attempts,options);
      assert.deepEqual(after.mapMaking,before.mapMaking);assert.deepEqual(after.focus,before.focus);assert.deepEqual(after.reasons,before.reasons);
      assert.deepEqual(progressTree(runtime,attempts,options.now),progressTree(original,attempts,options.now));
      previous=before.selectedLocations.map(l=>l.id);seen.push(...previous);
      attempts.push(...before.selectedLocations.map((l,i)=>({id:`${step}:${i}`,skillId:l.skillIds[0],occurredAt:'2026-10-21T11:00:00Z',correct:i!==0,evidenceValid:i!==0,confidence:2,unfamiliar:true,locationRef:l.id,mode:'practice',feedbackSource:'explicit'})));
    }
  }
});
