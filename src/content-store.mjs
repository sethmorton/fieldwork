import {validatePack} from './next-set.mjs';
import {mergePacks} from './packs.mjs';
import {splitPack,contentHash} from './content-format.mjs';

const headKey=id=>`fieldwork:${id}:content-head`;
const activeKey=id=>`fieldwork:${id}:active-set`;
const gameKey=(id,game)=>`fieldwork:${id}:game:${game}`;

// Content has its own keys. Existing attempts, exposures, reviews and backups are never migrated.
export function createContentStore({get,set,catalog,fetchText,now=()=>Date.now()}) {
  const registered=new Map((get('fieldwork:catalog',[])??[]).map(entry=>[entry.id,entry]));
  const migrating=get('fieldwork:content-schema',0)!==1;
  if(migrating){
    for(const pack of mergePacks(get('fieldwork:packs',[]),get('fieldwork:pack',null),[])){
      const {runtime,audit}=splitPack(pack),key=`fieldwork:content:${pack.id}:legacy-${pack.contentRevision??0}`;
      set(key,runtime);set(key+':audit',audit);
      set(headKey(pack.id),{key,revision:pack.contentRevision??0,auditKey:key+':audit',legacy:true});
      registered.set(pack.id,{id:pack.id,title:pack.title,subject:pack.subject,practiceMapId:pack.practiceMapId,...registered.get(pack.id)});
      const active=get(activeKey(pack.id),null);
      if(active&&!active.contentKey)set(activeKey(pack.id),{...active,contentKey:key});
    }
  }
  for(const entry of catalog){
    const old=registered.get(entry.id);
    registered.set(entry.id,old?.localOnly?old:{...old,...entry,practiceMapId:old?.practiceMapId??entry.practiceMapId});
  }
  const entries=[...registered.values()];
  const maps=new Set();
  for(const entry of entries){
    if(!/^[a-f\d]{24}$/i.test(entry.practiceMapId??'')||/^0+$/.test(entry.practiceMapId)||maps.has(entry.practiceMapId))throw Error('Each pack needs a different dedicated owned practice map.');
    maps.add(entry.practiceMapId);
  }
  if(JSON.stringify(get('fieldwork:catalog',[]))!==JSON.stringify(entries))set('fieldwork:catalog',entries);
  if(migrating)set('fieldwork:content-schema',1);
  const memory=new Map(),versions=new WeakMap();
  const entryFor=id=>{const entry=entries.find(item=>item.id===id);if(!entry)throw Error('Unknown practice pack.');return entry};
  function read(id,key){
    if(!key)return null;
    if(!memory.has(key)){
      const value=get(key,null);if(!value)return null;
      if(value.id!==id)throw Error('Cached content belongs to a different pack.');
      const bound=validatePack({...value,practiceMapId:entryFor(id).practiceMapId});
      memory.set(key,bound);versions.set(bound,key);
    }
    return memory.get(key);
  }
  async function verified(url,hash){
    if(!/^[a-f\d]{64}$/.test(hash??''))throw Error('Content checksum is missing.');
    const body=await fetchText(url);
    if(await contentHash(body)!==hash)throw Error('Content checksum did not match.');
    return JSON.parse(body);
  }
  const refreshing=new Map();
  function refresh(id,options){
    if(!refreshing.has(id))refreshing.set(id,refreshContent(id,options).finally(()=>refreshing.delete(id)));
    return refreshing.get(id);
  }
  async function refreshContent(id,{force=false}={}){
    const entry=entryFor(id),head=get(headKey(id),null),cached=read(id,head?.key);
    if(!entry.manifestUrl)return cached??Promise.reject(Error('Import this custom pack through Content & progress.'));
    if(cached&&!force&&head.checkedAt&&now()-head.checkedAt<86400000)return cached;
    try{
      const manifest=JSON.parse(await fetchText(entry.manifestUrl));
      if(manifest.schemaVersion!==1||!Array.isArray(manifest.packs))throw Error('This content needs a newer Fieldwork engine.');
      const asset=manifest.packs.find(item=>item.id===id);
      if(!asset||!Number.isInteger(asset.contentRevision))throw Error('The content host did not return this pack.');
      const current=get(headKey(id),null);
      if(current?.key!==head?.key&&(current?.localOnly||current?.revision>=asset.contentRevision))return read(id,current.key);
      if(!cached&&asset.contentRevision<(entry.minimumRevision??0))throw Error('Hosted content is older than your configured pack. Import its local JSON.');
      if(cached&&(asset.contentRevision<head.revision||(asset.contentRevision===head.revision&&(head.legacy||asset.sha256===head.sha256)))){
        set(headKey(id),{...head,checkedAt:now()});return cached;
      }
      const value=await verified(new URL(asset.url,entry.manifestUrl).href,asset.sha256);
      if(value.id!==id||value.contentRevision!==asset.contentRevision)throw Error('Downloaded content identity changed.');
      const bound=validatePack({...value,practiceMapId:entry.practiceMapId});
      const latest=get(headKey(id),null);
      if(latest?.key!==head?.key&&(latest?.localOnly||latest?.revision>=value.contentRevision))return read(id,latest.key);
      // Publish the pointer last: failed or interrupted downloads leave the previous pack usable.
      const key=`fieldwork:content:${id}:${asset.sha256}`;
      set(key,value);memory.set(key,bound);versions.set(bound,key);
      set(headKey(id),{key,revision:value.contentRevision,sha256:asset.sha256,checkedAt:now(),
        auditUrl:asset.auditUrl?new URL(asset.auditUrl,entry.manifestUrl).href:null,auditSha256:asset.auditSha256});
      return bound;
    }catch(error){if(cached)return cached;throw error}
  }
  async function load(id,{gameId}={}){
    const pinned=gameId?(get(gameKey(id,gameId),null)??get(activeKey(id),null)):null;
    return read(id,pinned?.contentKey)??read(id,get(headKey(id),null)?.key)??refresh(id);
  }
  function pinSet(id,setValue,pack){
    const key=pack?versions.get(pack):get(headKey(id),null)?.key;if(!key)throw Error('Practice content is not cached.');
    set(activeKey(id),{locationIds:setValue.selectedLocations.map(location=>location.id),preparedAt:new Date(now()).toISOString(),
      contentKey:key,locations:setValue.selectedLocations,skills:setValue.sourceNotes});
  }
  function pinGame(id,gameId){
    const key=gameKey(id,gameId);if(get(key,null))return;
    const active=get(activeKey(id),null),head=get(headKey(id),null);
    if(active?.contentKey||head)set(key,active?.contentKey?active:{contentKey:head.key});
  }
  async function audit(id){
    await load(id);const head=get(headKey(id),null),key=head.auditKey??head.key+':audit';
    const cached=get(key,null);if(cached)return cached;
    if(!head.auditUrl)return {};
    const value=await verified(head.auditUrl,head.auditSha256);set(key,value);return value;
  }
  function add(pack){
    validatePack(pack);
    mergePacks([],null,[pack]);
    if(entries.some(item=>item.id!==pack.id&&item.practiceMapId===pack.practiceMapId))throw Error('Different packs cannot share a writable practice map.');
    const old=entries.find(item=>item.id===pack.id),entry={id:pack.id,title:pack.title,subject:pack.subject,practiceMapId:pack.practiceMapId,localOnly:true,manifestUrl:null};
    if(old)entries[entries.indexOf(old)]=entry;else entries.push(entry);
    const {runtime,audit}=splitPack(pack),key=`fieldwork:content:${pack.id}:import-${now()}`;
    set(key,runtime);set(key+':audit',audit);set(headKey(pack.id),{key,revision:pack.contentRevision??0,auditKey:key+':audit',legacy:true,localOnly:true});set('fieldwork:catalog',entries);
  }
  return {catalog:entries,load,refresh,pinSet,pinGame,audit,add};
}
