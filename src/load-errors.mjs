// Content loading failures carry a Fieldwork `code` (and `status`/`host` for HTTP and network failures). Retry policy and
// learner copy depend only on those properties, never on exception text. The message is already plain copy.
export function fail(code,details={}){
  const error=Object.assign(Error(),{code,...details});error.message=loadMessage(error);return error;
}
// A `notice` is a validation message written for the learner (wrong map, unverified draft). Its text is shown as is.
export const notice=message=>Object.assign(Error(message),{code:'notice'});
const CODES=new Set(['network','timeout','http','unavailable','integrity','format','engine','custom','pinned','storage','storage-quota','storage-blocked','notice']);
// Only our own codes count: browser DOMExceptions have numeric codes (TimeoutError 23, QuotaExceededError 22).
export const classified=error=>CODES.has(error?.code);
export const storageError=error=>classified(error)?error:fail(error?.name==='QuotaExceededError'?'storage-quota':'storage');

const TRANSIENT=[10e3,30e3,120e3,300e3];
const transient=({code,status})=>code==='network'||code==='timeout'||(code==='http'&&(status===408||status>=500));
const unavailable=({code,status})=>code==='unavailable'||(code==='http'&&status===404);

/** Milliseconds to wait after the `failures`th consecutive failure before trying again, or null for no automatic retry. */
export function retryDelay(error,failures){
  if(transient(error))return TRANSIENT[Math.min(failures,TRANSIENT.length)-1];
  if(unavailable(error)||(error.code==='http'&&error.status===429))return 300e3;
  return null;
}
// Retrying cannot fix an engine that is too old, a custom pack this browser never saved, or lost game content.
export const canRetry=error=>!['engine','custom','pinned'].includes(error.code);

const when=ms=>ms<60e3?`${ms/1e3} seconds`:`${ms/60e3} minutes`;
/** Plain learner copy for a failed load. `others` says whether another bound pack can be chosen instead. */
export function loadMessage(error,{delay=null,others=false}={}){
  if(unavailable(error))return 'This pack is not available from the content host yet. We\'ll check again in five minutes.'+(others?' You can choose another practice pack.':'');
  const host=error.host??'the content host',allow=` Check your connection. If Tampermonkey asks for permission, allow ${host}.`;
  const message=classified(error)?{
    network:`Fieldwork could not reach ${host}.`+allow,
    timeout:`The download from ${host} took too long.`+allow,
    http:error.status===429?'The content host is busy right now.':transient(error)?'The content host is having trouble right now.':'The content host refused the download.',
    integrity:'The downloaded pack could not be verified, so Fieldwork did not use it.',
    format:'The content host sent practice content Fieldwork could not read.',
    engine:'This practice content needs a newer version of Fieldwork. Update the userscript in Tampermonkey.',
    custom:'This custom pack is not saved in this browser. Import its JSON file.',
    pinned:'The saved content for this game is missing or damaged, so Fieldwork cannot show its clues. Your progress is saved. Start a new set from your practice map.',
    'storage-quota':'Browser storage is full. Free some space for geoguessr.com, then retry.',
    'storage-blocked':'Another GeoGuessr tab is holding Fieldwork\'s browser storage. Close other GeoGuessr tabs, then retry.',
    storage:'Fieldwork could not use browser storage. Check that geoguessr.com may store site data, then retry.',
    notice:error.message,
  }[error.code]:'Fieldwork could not load this pack.';
  return delay==null?message:`${message} We'll try again in ${when(delay)}.`;
}
/** Status-line copy: only classified errors carry learner text. Anything else gets the neutral `fallback`. */
export const plainMessage=(error,fallback='Fieldwork could not finish that. Try again.')=>classified(error)?error.message:fallback;
