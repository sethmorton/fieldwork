// Observe native requests only. A separate GET can resume/advance a GeoGuessr game.
export function observeGameResponses(target,onData){
  const events=target.FieldworkGameResponses??new EventTarget();
  events.addEventListener('received_data',event=>onData(event.detail));
  if(target.FieldworkGameResponses)return;
  target.FieldworkGameResponses=events;
  const original=target.fetch;
  target.fetch=function(...args){
    const result=original.apply(this,args);
    const input=args[0];let gameRequest=false;
    try{
      const url=new URL(typeof input==='string'?input:input?.url??String(input),'https://www.geoguessr.com');
      gameRequest=url.origin==='https://www.geoguessr.com'&&/^\/api\/v3\/games(?:\/[\w-]+)?\/?$/.test(url.pathname);
    }catch{/* Unrelated request input is left entirely to native fetch. */}
    if(gameRequest)Promise.resolve(result).then(response=>response.clone().json()).then(data=>events.dispatchEvent(new CustomEvent('received_data',{detail:data}))).catch(()=>{});
    // Return the original promise: observing must not delay or replace the native response.
    return result;
  };
}
