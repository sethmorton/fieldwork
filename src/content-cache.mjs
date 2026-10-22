// Bulky, re-downloadable pack content lives in IndexedDB. Tampermonkey copies every GM value into
// every page load, so GM storage keeps only small learner state.
export function indexedDbCache(indexedDB,name='fieldwork-content'){
  const db=new Promise((resolve,reject)=>{
    const open=indexedDB.open(name,1);
    open.onupgradeneeded=()=>open.result.createObjectStore('content');
    open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);
  });
  const run=(mode,operation)=>db.then(database=>new Promise((resolve,reject)=>{
    const transaction=database.transaction('content',mode),request=operation(transaction.objectStore('content'));
    transaction.oncomplete=()=>resolve(request.result);transaction.onerror=transaction.onabort=()=>reject(transaction.error);
  }));
  return {get:key=>run('readonly',store=>store.get(key)),set:(key,value)=>run('readwrite',store=>store.put(value,key))};
}
