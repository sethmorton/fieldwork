import {validatePack} from './next-set.mjs';
import {mergePacks} from './packs.mjs';
import {splitPack,contentHash} from './content-format.mjs';
import {fail,classified,notice} from './load-errors.mjs';

const headKey=id=>`fieldwork:${id}:content-head`;
const activeKey=id=>`fieldwork:${id}:active-set`;
const gameKey=(id,game)=>`fieldwork:${id}:game:${game}`;
const SCHEMA=2;
const REFRESH_MS=15*60000;
// Pack and audit bodies can be megabytes on a slow connection. Manifests and notes use fetchText's 20 s default.
const BODY_MS=120000;
const parse=body=>{try{return JSON.parse(body)}catch{throw fail('format')}};
const object=value=>typeof value==='object'&&value!==null;
const ownedMap=id=>typeof id==='string'&&/^[a-f\d]{24}$/i.test(id)&&!/^0+$/.test(id);

// GM storage (get/set/list/remove) holds learner state and small content pointers; it is loaded into every page.
// Pack bodies live in `cache` (IndexedDB in the browser). Attempts, exposures, reviews and backups are never migrated.
export function createContentStore({get:gmGet,set:gmSet,list:gmList,remove:gmRemove,cache,catalog,fetchText,now=()=>Date.now()}) {
  // A failed GM read or write is a storage problem the learner can act on, whatever the userscript manager threw.
  const gm=operation=>(...args)=>{try{return operation(...args)}catch{throw fail('storage')}};
  const get=gm(gmGet),set=gm(gmSet),list=gm(gmList),remove=gm(gmRemove);
  const registered=new Map((get('fieldwork:catalog',[])??[]).map(entry=>[entry.id,entry]));
  const schema=get('fieldwork:content-schema',0);
  // 0.9 kept every pack in one registry; register its packs now and move their bodies during migration.
  const legacyPacks=schema<1?mergePacks(get('fieldwork:packs',[]),get('fieldwork:pack',null),[]):[];
  for(const pack of legacyPacks)registered.set(pack.id,{id:pack.id,title:pack.title,subject:pack.subject,practiceMapId:pack.practiceMapId,...registered.get(pack.id)});
  // `missedClues` and `focusClues` (local builds only) are read by the browser and never stored in the GM catalog.
  for(const {missedClues,focusClues,...entry} of catalog){
    const old=registered.get(entry.id);
    registered.set(entry.id,old?.localOnly?old:{...old,...entry,practiceMapId:old?.practiceMapId??entry.practiceMapId});
  }
  const entries=[...registered.values()];
  const maps=new Set();
  // Public installs ship unbound packs; the learner binds each to their own Fieldwork map in Map Maker.
  // A damaged or shared binding (e.g. hand-edited storage) is dropped, never fatal: Map Maker offers that pack again.
  for(const entry of entries){
    if(entry.practiceMapId==null)continue;
    if(ownedMap(entry.practiceMapId)&&!maps.has(entry.practiceMapId))maps.add(entry.practiceMapId);else delete entry.practiceMapId;
  }
  if(JSON.stringify(get('fieldwork:catalog',[]))!==JSON.stringify(entries))set('fieldwork:catalog',entries);
  // Copy into the cache before deleting from GM storage: an interrupted migration simply runs again.
  async function migrate(){
    for(const pack of legacyPacks){
      const {runtime,audit}=splitPack(pack),key=`fieldwork:content:${pack.id}:legacy-${pack.contentRevision??0}`;
      await cache.set(key,runtime);await cache.set(key+':audit',audit);
      set(headKey(pack.id),{key,revision:pack.contentRevision??0,auditKey:key+':audit',legacy:true});
      const active=get(activeKey(pack.id),null);
      if(active&&!active.contentKey)set(activeKey(pack.id),{...active,contentKey:key});
    }
    for(const key of list().filter(key=>key.startsWith('fieldwork:content:'))){await cache.set(key,get(key,null));remove(key);}
    remove('fieldwork:packs');remove('fieldwork:pack');set('fieldwork:content-schema',SCHEMA);
  }
  // Lazy and retryable: a failed migration (usually storage) runs again on the next load, which copying first makes safe.
  let migration=null;
  const ready=()=>schema>=SCHEMA?null:migration??=migrate().catch(error=>{migration=null;throw error});
  const memory=new Map(),versions=new WeakMap();
  const entryFor=id=>{const entry=entries.find(item=>item.id===id);if(!entry)throw Error('Unknown practice pack.');return entry};
  // One cache read and validation per content version per page; concurrent callers share it.
  function read(id,key){
    if(!key)return Promise.resolve(null);
    if(!memory.has(key))memory.set(key,cache.get(key).then(value=>{
      if(!value){memory.delete(key);return null}
      if(value.id!==id)throw Error('Cached content belongs to a different pack.');
      const bound=validatePack({...value,practiceMapId:entryFor(id).practiceMapId});
      versions.set(bound,key);return bound;
    }).catch(error=>{memory.delete(key);throw error}));
    return memory.get(key);
  }
  async function verified(url,hash){
    if(!/^[a-f\d]{64}$/.test(hash??''))throw fail('integrity');
    const body=await fetchText(url,{timeout:BODY_MS});
    if(await contentHash(body)!==hash)throw fail('integrity');
    return parse(body);
  }
  const refreshing=new Map();
  function refresh(id,options){
    if(!refreshing.has(id))refreshing.set(id,refreshContent(id,options).finally(()=>refreshing.delete(id)));
    return refreshing.get(id);
  }
  async function refreshContent(id,{force=false}={}){
    await ready();
    const entry=entryFor(id),head=get(headKey(id),null),cached=await read(id,head?.key);
    if(!entry.manifestUrl)return cached??Promise.reject(fail('custom'));
    // The manifest is a few hundred bytes and the check runs in the background on the map page, so a new pack
    // revision reaches the learner's next set within REFRESH_MS.
    if(cached&&!force&&head.checkedAt&&now()-head.checkedAt<REFRESH_MS)return cached;
    try{
      const manifest=parse(await fetchText(entry.manifestUrl));
      if(!object(manifest))throw fail('format');
      if(manifest.schemaVersion!==1)throw fail('engine');
      if(!Array.isArray(manifest.packs))throw fail('format');
      const asset=manifest.packs.find(item=>item?.id===id);
      if(!asset)throw fail('unavailable');
      if(!Number.isInteger(asset.contentRevision)||typeof asset.url!=='string')throw fail('format');
      const url=path=>{try{return new URL(path,entry.manifestUrl).href}catch{throw fail('format')}};
      const current=get(headKey(id),null);
      if(current?.key!==head?.key&&(current?.localOnly||current?.revision>=asset.contentRevision))return read(id,current.key);
      if(!cached&&asset.contentRevision<(entry.minimumRevision??0))throw fail('unavailable');
      if(cached&&(asset.contentRevision<head.revision||(asset.contentRevision===head.revision&&(head.legacy||asset.sha256===head.sha256)))){
        set(headKey(id),{...head,checkedAt:now()});return cached;
      }
      const value=await verified(url(asset.url),asset.sha256);
      if(!object(value)||value.id!==id||value.contentRevision!==asset.contentRevision)throw fail('integrity');
      let bound;try{bound=validatePack({...value,practiceMapId:entry.practiceMapId})}catch{throw fail('format')}
      const latest=get(headKey(id),null);
      if(latest?.key!==head?.key&&(latest?.localOnly||latest?.revision>=value.contentRevision))return read(id,latest.key);
      // Publish the pointer last: failed or interrupted downloads leave the previous pack usable.
      // ponytail: superseded versions stay in IndexedDB (off the per-page path); prune by head/active-set if disk use matters.
      const key=`fieldwork:content:${id}:${asset.sha256}`;
      await cache.set(key,value);memory.set(key,Promise.resolve(bound));versions.set(bound,key);
      set(headKey(id),{key,revision:value.contentRevision,sha256:asset.sha256,checkedAt:now(),
        auditUrl:typeof asset.auditUrl==='string'?url(asset.auditUrl):null,auditSha256:asset.auditSha256});
      return bound;
    }catch(error){if(cached)return cached;throw error}
  }
  async function load(id,{gameId}={}){
    await ready();
    const pinned=gameId?(get(gameKey(id,gameId),null)??get(activeKey(id),null))?.contentKey:null;
    // A game keeps the exact content it was prepared from: never substitute another version for a missing or damaged one.
    if(pinned){
      const value=await read(id,pinned).catch(error=>{throw classified(error)?error:fail('pinned')});
      if(!value)throw fail('pinned');
      return value;
    }
    return await read(id,get(headKey(id),null)?.key)??refresh(id);
  }
  function pinSet(id,setValue,pack){
    const key=pack?versions.get(pack):get(headKey(id),null)?.key;if(!key)throw Error('Practice content is not cached.');
    set(activeKey(id),{locationIds:setValue.selectedLocations.map(location=>location.id),preparedAt:new Date(now()).toISOString(),contentKey:key});
  }
  function pinGame(id,gameId){
    const key=gameKey(id,gameId);if(get(key,null))return;
    const contentKey=get(activeKey(id),null)?.contentKey??get(headKey(id),null)?.key;
    if(contentKey)set(key,{contentKey});
  }
  async function audit(id){
    await load(id);const head=get(headKey(id),null),key=head.auditKey??head.key+':audit';
    const cached=await cache.get(key);if(cached)return cached;
    if(!head.auditUrl)return {};
    const value=await verified(head.auditUrl,head.auditSha256);await cache.set(key,value);return value;
  }
  async function add(pack){
    validatePack(pack);
    mergePacks([],null,[pack]);
    if(entries.some(item=>item.id!==pack.id&&item.practiceMapId===pack.practiceMapId))throw notice('Different packs cannot share a writable practice map.');
    await ready();
    const old=entries.find(item=>item.id===pack.id),entry={id:pack.id,title:pack.title,subject:pack.subject,practiceMapId:pack.practiceMapId,localOnly:true,manifestUrl:null};
    const {runtime,audit}=splitPack(pack),key=`fieldwork:content:${pack.id}:import-${now()}`;
    await cache.set(key,runtime);await cache.set(key+':audit',audit);
    if(old)entries[entries.indexOf(old)]=entry;else entries.push(entry);
    set(headKey(pack.id),{key,revision:pack.contentRevision??0,auditKey:key+':audit',legacy:true,localOnly:true});set('fieldwork:catalog',entries);
  }
  // Binding an already bound pack moves it, e.g. after its map was deleted. Progress is keyed by pack, not map.
  function bind(id,mapId){
    const entry=entryFor(id);
    if(!ownedMap(mapId)||entries.some(item=>item.practiceMapId===mapId))throw notice('Each pack needs a different dedicated owned practice map.');
    entry.practiceMapId=mapId;set('fieldwork:catalog',entries);
    memory.clear();// cached packs carry the old map ID
  }
  return {catalog:entries,load,refresh,pinSet,pinGame,audit,add,bind};
}
