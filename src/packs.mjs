import {validatePack,updatedPack} from './next-set.mjs';

export function mergePacks(stored,legacy,bundled) {
  const packs=new Map((stored??[]).map(pack=>[pack.id,pack]));
  if(legacy&&!packs.has(legacy.id))packs.set(legacy.id,legacy);
  for(const pack of bundled)packs.set(pack.id,updatedPack(packs.get(pack.id),pack));
  const maps=new Set();
  for(const pack of packs.values()){
    validatePack(pack);
    if(!/^[a-f\d]{24}$/i.test(pack.practiceMapId??'')||/^0+$/.test(pack.practiceMapId))throw Error('Each pack needs a dedicated owned practice map.');
    if(maps.has(pack.practiceMapId))throw Error('Different packs cannot share a writable practice map.');
    maps.add(pack.practiceMapId);
  }
  return [...packs.values()];
}

export function packForPage(packs,pathname,state) {
  const map=/^\/(?:maps|map-maker)\/([a-f\d]{24})\/?$/i.exec(pathname)?.[1];
  if(map)return packs.find(pack=>pack.practiceMapId===map)??null;
  if(/^\/(?:game|results)\//.test(pathname)&&pathname.split('/').at(-1)===state?.current_game_id)
    return packs.find(pack=>pack.practiceMapId===state.map?.id)??null;
  return null;
}
