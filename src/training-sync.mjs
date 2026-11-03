// After each training set the userscript sends the pack's progress to the local installer (scripts/training-sync.mjs),
// which writes $WORLD_PACK_DATA/training/attempts.json for the nightly focus. Fire-and-forget: debounced, never awaited
// by play, and silently dropped when the installer is not running. Only for packs served by a local installer.

/** POST URL on the installer that serves this pack's content (catalog manifestUrl on 127.0.0.1/localhost), else null. */
export function syncUrl(entry){
  try{const url=new URL(entry?.manifestUrl??'');return ['127.0.0.1','localhost'].includes(url.hostname)?new URL('/training-sync',url).href:null}
  catch{return null}
}
/** The request body: the pack id, every attempt and every exposure (the installer replaces attempts.json with it). */
export const syncPayload=(packId,attempts,exposures)=>JSON.stringify({packId,attempts,exposures});
/** Debounced sender: schedule(build) sends build() once `delay` ms after the last call; errors are swallowed. */
export function createSync(send,{delay=3000,timer=setTimeout,clear=clearTimeout}={}){
  let handle=null;
  return {schedule(build){clear(handle);handle=timer(()=>{handle=null;try{Promise.resolve(send(build())).catch(()=>{})}catch{}},delay)}};
}
