import {fail,storageError} from './load-errors.mjs';
// Bulky, re-downloadable pack content lives in IndexedDB. Tampermonkey copies every GM value into
// every page load, so GM storage keeps only small learner state.
// ponytail: only opening is deadline-bound. Transactions on an open database have no deadline of their own.
export function indexedDbCache(indexedDB,name='fieldwork-content',{openMs=10000}={}){
  // A failed or blocked open is retried by the next operation, so Retry works once the learner fixes storage.
  let db=null;
  const open=()=>db??=new Promise((resolve,reject)=>{
    const request=indexedDB.open(name,1);
    // Another tab can hold the database open indefinitely: give up after openMs instead of loading forever,
    // and close a connection that arrives after giving up so it cannot block a later open.
    let gaveUp=false;const giveUp=()=>{gaveUp=true;reject(fail('storage-blocked'))};
    const timer=setTimeout(giveUp,openMs);
    request.onupgradeneeded=()=>request.result.createObjectStore('content');
    request.onsuccess=()=>{clearTimeout(timer);if(gaveUp)request.result.close();else resolve(request.result)};
    request.onerror=()=>{clearTimeout(timer);reject(request.error)};
    request.onblocked=()=>{clearTimeout(timer);giveUp()};
  }).catch(error=>{db=null;throw storageError(error)});
  const run=(mode,operation)=>open().then(database=>new Promise((resolve,reject)=>{
    const transaction=database.transaction('content',mode),request=operation(transaction.objectStore('content'));
    transaction.oncomplete=()=>resolve(request.result);transaction.onerror=transaction.onabort=()=>reject(storageError(transaction.error));
  }).catch(error=>{throw storageError(error)}));
  return {get:key=>run('readonly',store=>store.get(key)),set:(key,value)=>run('readwrite',store=>store.put(value,key))};
}
