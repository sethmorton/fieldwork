import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContentStore} from '../content-store.mjs';
import {splitPack,contentHash} from '../content-format.mjs';
import {fail,retryDelay,loadMessage,classified,plainMessage,notice} from '../load-errors.mjs';
import {indexedDbCache} from '../content-cache.mjs';
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
  assert.throws(()=>createContentStore({...saved,set:(key,value)=>{if(key==='fieldwork:catalog')throw Error('interrupted');saved.set(key,value)},catalog:[],fetchText:async()=>''}),{code:'storage'});
  assert.equal(saved.data['fieldwork:content-schema'],undefined);
  const resumed=createContentStore({...saved,catalog:[],fetchText:async()=>''});
  assert.equal((await resumed.load('custom')).id,'custom');assert.deepEqual(saved.data['fieldwork:custom:attempts'],[{id:'existing'}]);
});
test('manual imports stay local and a cold loader cannot silently install an older configured revision',async()=>{
  const saved=storage(),server=await remote(pack()),store=createContentStore({...saved,catalog:[{...descriptor,minimumRevision:2}],fetchText:server.fetchText});
  await assert.rejects(store.load('au'),{code:'unavailable'});
  await store.add(pack('au',3));assert.equal((await store.refresh('au')).contentRevision,3);
  const reopened=createContentStore({...saved,catalog:[descriptor],fetchText:async()=>{throw Error('Manual content must not contact the public host')}});
  assert.equal((await reopened.refresh('au')).contentRevision,3);
});
test('each failed first download has its own classification and installs nothing',async()=>{
  const good=await remote(pack()),cases=[
    ['unavailable',{schemaVersion:1,packs:[]}],['unavailable',{schemaVersion:1,packs:[null]}],['format','not json'],['format','null'],['format',{schemaVersion:1,packs:{}}],
    ['format',{schemaVersion:1,packs:[{...good.entry,contentRevision:'1'}]}],['format',{schemaVersion:1,packs:[{...good.entry,url:undefined}]}],
    ['format',{schemaVersion:1,packs:[{...good.entry,url:'https://['}]}],
    ['engine',{schemaVersion:2,packs:[good.entry]}],['integrity',{schemaVersion:1,packs:[{...good.entry,sha256:undefined}]}],
    ['integrity',{schemaVersion:1,packs:[{...good.entry,sha256:'0'.repeat(64)}]}]];
  // Bodies that match their manifest hash but are another pack, not a valid pack, or not JSON.
  for(const [code,body] of [['integrity',JSON.stringify(splitPack(pack('ph'),{publicContent:true}).runtime)],['format',JSON.stringify({id:'au',contentRevision:1})],['format','{broken']])
    cases.push([code,{schemaVersion:1,packs:[{...good.entry,sha256:await contentHash(body)}]},body]);
  for(const [code,manifest,body] of cases){
    const saved=storage(),store=createContentStore({...saved,catalog:[descriptor],
      fetchText:async url=>url.endsWith('catalog.json')?(typeof manifest==='string'?manifest:JSON.stringify(manifest)):body??good.fetchText(url)});
    await assert.rejects(store.load('au'),{code},code);assert.equal(saved.data['fieldwork:au:content-head'],undefined);
  }
  const custom=createContentStore({...storage(),catalog:[{...descriptor,manifestUrl:null}],fetchText:good.fetchText});
  await assert.rejects(custom.load('au'),{code:'custom'});
  // A GM write failure while publishing the first head is a storage problem, not a false ready state.
  const unwritable=storage(),gm=createContentStore({...unwritable,catalog:[descriptor],fetchText:good.fetchText,
    set:(key,value)=>{if(key==='fieldwork:au:content-head')throw Error('quota');unwritable.set(key,value)}});
  await assert.rejects(gm.load('au'),{code:'storage'});assert.equal(unwritable.data['fieldwork:au:content-head'],undefined);
});
test('a game whose pinned content is missing or damaged reports it instead of loading another version',async()=>{
  const saved=storage({'fieldwork:pack':pack()}),server=await remote(pack('au',2));
  const store=createContentStore({...saved,catalog:[descriptor],fetchText:server.fetchText});
  await store.load('au');assert.equal((await store.refresh('au')).contentRevision,2);
  const missing={contentKey:'fieldwork:content:au:missing-old'},corrupt={contentKey:'fieldwork:content:au:corrupt'};
  saved.data['fieldwork:au:game:missing']=missing;saved.data['fieldwork:au:game:corrupt']=corrupt;saved.cached.set(corrupt.contentKey,{id:'au',skills:'damaged'});
  for(const game of ['missing','corrupt'])await assert.rejects(store.load('au',{gameId:game}),{code:'pinned'},game);
  assert.deepEqual(saved.data['fieldwork:au:game:missing'],missing);assert.equal((await store.load('au')).contentRevision,2);
  assert.match(fail('pinned').message,/missing or damaged/);
});
test('learner copy is plain and the retry schedule follows the failure category',()=>{
  const host={host:'sethmorton.github.io'};
  for(const code of ['network','timeout','unavailable','integrity','format','engine','custom','storage','storage-quota','storage-blocked','http']){
    const message=loadMessage(fail(code,{...host,status:503}),{delay:10e3,others:true});
    assert.doesNotMatch(message,/[;\u2013\u2014]|undefined|Error/,code);
  }
  assert.equal(loadMessage(fail('unavailable'),{others:true}),'This pack is not available from the content host yet. We\'ll check again in five minutes. You can choose another practice pack.');
  assert.match(fail('network',host).message,/connection.*allow sethmorton\.github\.io/);
  assert.deepEqual([1,2,3,4,5,9].map(count=>retryDelay(fail('timeout'),count)),[10e3,30e3,120e3,300e3,300e3,300e3]);
  for(const status of [408,500,503])assert.equal(retryDelay(fail('http',{status}),1),10e3);
  for(const error of [fail('unavailable'),fail('http',{status:404}),fail('http',{status:429})])assert.equal(retryDelay(error,1),300e3);
  for(const code of ['integrity','format','engine','storage','storage-quota','storage-blocked','custom'])assert.equal(retryDelay(fail(code),1),null);
  assert.equal(retryDelay(fail('http',{status:403}),1),null);
});
test('quota and head-write failures during an update keep the old head, pins and observations',async()=>{
  const saved=storage({'fieldwork:pack':pack(),'fieldwork:au:attempts':[{id:'existing'}]}),server=await remote(pack('au',2));let failing='';
  const store=createContentStore({...saved,catalog:[descriptor],fetchText:server.fetchText,
    cache:{get:saved.cache.get,set:async(key,value)=>{if(failing==='quota'&&key.includes(server.entry.sha256))throw fail('storage-quota');return saved.cache.set(key,value)}},
    set:(key,value)=>{if(failing==='head'&&key==='fieldwork:au:content-head'&&value.revision===2)throw Error('GM write failed');saved.set(key,value)}});
  const original=await store.load('au');store.pinSet('au',{selectedLocations:[],sourceNotes:[]},original);store.pinGame('au','in-flight');
  const kept=['fieldwork:au:content-head','fieldwork:au:active-set','fieldwork:au:game:in-flight','fieldwork:au:attempts'].map(key=>[key,structuredClone(saved.data[key])]);
  for(failing of ['quota','head']){
    assert.equal((await store.refresh('au',{force:true})).contentRevision,1);
    for(const [key,value] of kept)assert.deepEqual(saved.data[key],value,`${failing}: ${key}`);
    assert.deepEqual(await store.load('au',{gameId:'in-flight'}),original);
  }
});
test('storage failures are reported as storage, and a failed migration resumes on the next load with its source intact',async()=>{
  const saved=storage({'fieldwork:pack':pack()});let full=true;
  const store=createContentStore({...saved,catalog:[descriptor],fetchText:async()=>{throw Error('Migration must not download')},
    cache:{get:saved.cache.get,set:async(key,value)=>{if(full)throw fail('storage-quota');return saved.cache.set(key,value)}}});
  await assert.rejects(store.load('au'),{code:'storage-quota'});
  assert.ok(saved.data['fieldwork:pack']);assert.equal(saved.data['fieldwork:au:content-head'],undefined);
  full=false;assert.equal((await store.load('au')).contentRevision,1);assert.equal(saved.data['fieldwork:pack'],undefined);
});
test('IndexedDB reports blocked, stalled, full and missing storage honestly and reopens after a failure',async()=>{
  const opens=[],indexedDB={open:()=>{const request={};opens.push(request);return request}},cache=indexedDbCache(indexedDB,'test',{openMs:20});
  const blocked=cache.get('k');opens[0].onblocked();await assert.rejects(blocked,{code:'storage-blocked'});
  await assert.rejects(cache.get('k'),{code:'storage-blocked'});assert.equal(opens.length,2);
  let closed=false;opens[1].result={close:()=>closed=true};opens[1].onsuccess();assert.ok(closed);
  const full=cache.set('k',1);
  opens[2].result={transaction:()=>{const transaction={objectStore:()=>({put:()=>({})})};setImmediate(()=>{transaction.error=new DOMException('full','QuotaExceededError');transaction.onabort()});return transaction}};
  opens[2].onsuccess();await assert.rejects(full,{code:'storage-quota'});
  await assert.rejects(indexedDbCache(undefined).get('k'),{code:'storage'});
  const broken=[],failing=indexedDbCache({open:()=>{const request={};broken.push(request);return request}},'test');
  const unknown=failing.get('k');broken[0].error=new DOMException('disk','UnknownError');broken[0].onerror();await assert.rejects(unknown,{code:'storage'});
});
test('only Fieldwork codes count as classified, and platform exceptions never reach a status line',()=>{
  for(const error of [new DOMException('t','TimeoutError'),new DOMException('q','QuotaExceededError'),new TypeError('x is undefined'),null])assert.equal(classified(error),false);
  assert.equal(new DOMException('q','QuotaExceededError').code,22);assert.equal(new DOMException('t','TimeoutError').code,23);
  assert.equal(plainMessage(new TypeError('x is undefined')),'Fieldwork could not finish that. Try again.');
  // An ordinary Error is not learner copy either. Only coded errors and explicit notices are.
  for(const error of [new DOMException('q','QuotaExceededError'),Error('GM_getValue: internal detail')])assert.equal(plainMessage(error),plainMessage(new TypeError('x')));
  assert.equal(plainMessage(fail('storage-quota')),fail('storage-quota').message);
  assert.equal(plainMessage(notice('Open your dedicated Fieldwork map.')),'Open your dedicated Fieldwork map.');
});
test('concurrent loads and refreshes share one download and a failure frees the slot for a deliberate retry',async()=>{
  const saved=storage(),server=await remote(pack());let requests=[],offline=true;
  const store=createContentStore({...saved,catalog:[descriptor],fetchText:async url=>{
    requests.push(url);await new Promise(resolve=>setImmediate(resolve));if(offline)throw fail('network');return server.fetchText(url);
  }});
  const failed=await Promise.allSettled([store.load('au'),store.refresh('au'),store.load('au')]);
  assert.deepEqual(failed.map(result=>result.reason?.code),['network','network','network']);assert.equal(requests.length,1);
  offline=false;requests=[];
  const loaded=await Promise.all([store.load('au'),store.refresh('au')]);
  assert.deepEqual(loaded.map(value=>value.contentRevision),[1,1]);assert.equal(requests.length,2);
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
test('public installs start unbound and bind each pack to one distinct learner map that survives updates',async()=>{
  const unbound=({practiceMapId,...entry})=>entry,saved=storage(),server=await remote(pack());
  const catalog=[unbound(descriptor),{...unbound(descriptor),id:'ph',title:'ph',subject:'ph'}];
  const store=createContentStore({...saved,catalog,fetchText:server.fetchText});
  assert.deepEqual(store.catalog.map(entry=>entry.practiceMapId),[undefined,undefined]);
  assert.throws(()=>store.bind('au','not-a-map'),/different dedicated/);
  store.bind('au',map);
  assert.throws(()=>store.bind('ph',map),/different dedicated/);assert.throws(()=>store.bind('au',otherMap),/already has/);
  assert.equal((await store.load('au')).practiceMapId,map);
  const reopened=createContentStore({...saved,catalog,fetchText:server.fetchText});
  assert.deepEqual(reopened.catalog.map(entry=>entry.practiceMapId),[map,undefined]);
});
