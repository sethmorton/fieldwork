import {readFile,writeFile} from 'node:fs/promises';
import './source-bridge.js';
const [input,mapId,output] = process.argv.slice(2);
if(!input||!globalThis.FieldworkSourceBridge.validId(mapId)||!output) throw Error('Usage: node import-native.mjs locations.json owned-map-id pool.json');
const coordinates=JSON.parse(await readFile(input,'utf8'));
const cachePath=output+'.notes-cache.json';
let cache={};try {cache=JSON.parse(await readFile(cachePath,'utf8'))}catch{}
const pack=await globalThis.FieldworkSourceBridge.exportTaggedPool({mapId,title:'Tagged practice pool',coordinates,
 getMeta:async panoId=>{
  if(Object.hasOwn(cache,panoId))return cache[panoId];
  const url=new URL('https://learnablemeta.com/api/userscript/location/');url.search=new URLSearchParams({mapId,panoId});
  const response=await fetch(url,{signal:AbortSignal.timeout(15000)});
  if(response.status===404){cache[panoId]=null;return null}
  if(!response.ok)throw Error(`Note lookup failed: HTTP ${response.status}`);
  const meta=await response.json();cache[panoId]=meta;return meta;
 },onProgress:(done,total)=>{if(done%25===0||done===total)console.log(`${done}/${total} source panoramas checked`)}
});
await writeFile(cachePath,JSON.stringify(cache));
await writeFile(output,JSON.stringify(pack,null,2));
console.log(JSON.stringify({locations:pack.locations.length,clues:pack.skills.length,unmatched:pack.importReport.unmatched.length,failures:pack.importReport.failures.length,output}));
