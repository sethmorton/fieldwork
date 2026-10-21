import catalog from '../dist/practice-catalog.json';
import {createContentStore} from './content-store.mjs';
import {sourceNote} from './source-note.mjs';
import {makeNextSet} from './next-set.mjs';
import {packForPage} from './packs.mjs';
import {completedRound,recordRecognition,advanceRecognition,publishPracticeSet} from './session.mjs';
import {reviewPanel,startPanel,loadingPanel} from './ui.mjs';
import {stateFromGameData} from './game-state.mjs';
const gameResponses=unsafeWindow.GEFFetchEvents;

function fetchText(url) {
  if(typeof GM_xmlhttpRequest==='function')return new Promise((resolve,reject)=>GM_xmlhttpRequest({url,method:'GET',anonymous:true,timeout:20000,
    onload:response=>response.status>=200&&response.status<300?resolve(response.responseText):reject(Error(`Content returned ${response.status}.`)),
    onerror:()=>reject(Error('Content could not be downloaded.')),ontimeout:()=>reject(Error('Content download timed out.'))}));
  return fetch(url,{credentials:'omit',signal:AbortSignal.timeout(20000)}).then(response=>{if(!response.ok)throw Error(`Content returned ${response.status}.`);return response.text()});
}
const store=createContentStore({get:GM_getValue,set:GM_setValue,catalog,fetchText});
const packs=store.catalog;
let pack=null,context='',loading='',stateQueue=Promise.resolve();
const gameStates=new Map(),recoveryAttempts=new Set(),recovering=new Set();
const gameId=()=>/^\/(?:game|results)\/([^/]+)$/.exec(location.pathname)?.[1];
const contextFor=entry=>`${entry.id}:${gameId()??'map'}`;
const importPack=async imported=>{store.add(imported);location.assign(`/maps/${imported.practiceMapId}`)};
const key=(suffix,id=pack.id)=>`fieldwork:${id}:${suffix}`;
const history=(id=pack.id)=>GM_getValue(key('attempts',id),[]);
const exposures=(id=pack.id)=>GM_getValue(key('exposures',id),[]);
const nextSet=(subject=pack)=>makeNextSet(subject,history(subject.id),{size:5,seenLocationRefs:exposures(subject.id).map(item=>item.locationRef),previousSetLocationRefs:GM_getValue(key('active-set',subject.id),null)?.locationIds??[]});
function commitPendingReview(nextState,advance=false) {
  if(!pack)return;
  const pending=GM_getValue(key('pending-review'),null);
  if(!pending)return;
  const old=history();
  const updated=advance?recordRecognition(pack,old,pending.round,{recognized:true,familiar:pending.familiar,correct:pending.correct,assumed:true})
    :advanceRecognition(pack,old,pending,nextState);
  if(updated!==old)GM_setValue(key('attempts'),updated);
  if(updated!==old||old.some(attempt=>attempt.id===pending.round.id))GM_setValue(key('pending-review'),null);
}
function download(value,name) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function request(url,options={}) {
  const response=await fetch(url,{...options,credentials:'same-origin',headers:{'Content-Type':'application/json'}});
  if(!response.ok)throw Error(`GeoGuessr returned ${response.status}. Your feedback is still saved; retry from the practice map.`);
  const body=await response.text();return body?JSON.parse(body):null;
}
let launching=false;
function startPreparedGame() {
  const pending=GM_getValue(key('launch-request'),null);
  if(!pending)return false;
  if(pending.mapId!==pack.practiceMapId||Date.now()-pending.requestedAt>120000){GM_setValue(key('launch-request'),null);return false}
  if(document.readyState!=='complete')return false;
  // Use the native control so GeoGuessr retains the learner's game settings.
  const play=[...document.querySelectorAll('main button')].find(button=>button.textContent.trim()==='Play'&&!button.disabled&&button.getClientRects().length);
  if(!play)return false;
  GM_setValue(key('launch-request'),null);launching=true;play.click();
  setTimeout(()=>{if(location.pathname===`/maps/${pack.practiceMapId}`){launching=false;mounted='';render()}},10000);
  return true;
}
async function prepare() {
  if(GM_getValue(key('pending-review'),null)?.round.round===5)commitPendingReview(null,true);
  const route=location.pathname,chosen=await store.load(pack.id),set=nextSet(chosen),chosenKey=suffix=>key(suffix,chosen.id);
  await publishPracticeSet(chosen,set,request,draft=>{if(!GM_getValue(chosenKey('pending-backup'),null))GM_setValue(chosenKey('pending-backup'),draft)});
  GM_setValue(chosenKey('previous-draft'),GM_getValue(chosenKey('pending-backup'),null));GM_setValue(chosenKey('pending-backup'),null);
  store.pinSet(chosen.id,set,chosen);
  GM_setValue(chosenKey('launch-request'),{mapId:chosen.practiceMapId,requestedAt:Date.now()});
  if(location.pathname!==route)return;
  if(location.pathname===`/maps/${chosen.practiceMapId}`&&startPreparedGame())return;
  location.assign(`/maps/${chosen.practiceMapId}`);
}
let mounted='',lastState=null;
const remove=()=>{document.getElementById('fieldwork-practice')?.remove();mounted=''};
function render() {
  const currentGame=gameId();
  const state=gameStates.get(currentGame)??lastState??(gameResponses?null:unsafeWindow.GeoGuessrEventFramework?.state);
  const marker=document.querySelector('[data-qa="result-view-top"], [class*="result-list_listWrapper"]');
  const resultsVisible=!!marker&&(!marker.getClientRects||marker.getClientRects().length>0);
  const shownRound=location.pathname.startsWith('/results/')?5:Number(marker?.textContent?.match(/\bROUND\s+([1-5])\s*\/\s*5\b/i)?.[1])||null;
  if(currentGame&&(!state||state.current_game_id!==currentGame||(resultsVisible&&(state.round_in_progress||shownRound&&shownRound!==state.current_round)))){
    // Events can be missed at startup or arrive before native navigation. Recover without reloading.
    if(!state||state.current_game_id!==currentGame||!shownRound||state.current_round<=shownRound)recoverGame(currentGame,resultsVisible?shownRound??'result':'start');
    if(mounted)remove();return;
  }
  const selected=packForPage(packs,location.pathname,state);
  if(!selected){if(mounted||loading)remove();loading='';return;}
  const wanted=contextFor(selected);
  if(context!==wanted){
    if(loading===wanted)return;
    loading=wanted;const route=location.pathname;
    if(!gameId())loadingPanel(selected,{onImport:importPack});
    store.load(selected.id,{gameId:gameId()}).then(value=>{
      if(location.pathname!==route)return;
      pack=value;context=wanted;loading='';launching=false;
      if(gameId())store.pinGame(pack.id,gameId());
      remove();render();
      // Warm-cache practice never waits for the content host. Apply updates to the next set.
      if(!gameId())store.refresh(pack.id).catch(()=>{});
    }).catch(error=>{if(location.pathname===route)loadingPanel(selected,{error:error.message,onRetry:()=>{loading='';render()},onImport:importPack})});
    return;
  }
  commitPendingReview(state);
  const mapPage=location.pathname===`/maps/${pack.practiceMapId}`||location.pathname===`/map-maker/${pack.practiceMapId}`;
  if(mapPage){
    if(launching)return;
    if(startPreparedGame()){remove();return}
    if(mounted==='start')return;
    let set,error;try{set=nextSet()}catch(cause){error=cause.message}
    startPanel(pack,set,{onNext:prepare,error,attempts:history(),getAttempts:history,packs,onChoosePack:id=>location.assign(`/maps/${packs.find(item=>item.id===id).practiceMapId}`),
      onExport:()=>download({packId:pack.id,attempts:history(),exposures:exposures(),previousDraft:GM_getValue(key('previous-draft'),null),pendingBackup:GM_getValue(key('pending-backup'),null)},`fieldwork-progress-${pack.id}.json`),
      onImport:importPack,onCoverage:async()=>download(await store.audit(pack.id),`fieldwork-sources-${pack.id}.json`),
    });mounted='start';return;
  }
  const round=completedRound(pack,state);
  const routeId=location.pathname.split('/').filter(Boolean).at(-1);
  if(!round||routeId!==round.gameId||!resultsVisible){if(mounted)remove();return;}
  if(mounted===round.id)return;
  const seen=exposures();const familiar=seen.some(item=>item.locationRef===round.location.id&&item.id!==round.id);
  if(!seen.some(item=>item.id===round.id))GM_setValue(key('exposures'),[...seen,{id:round.id,locationRef:round.location.id}]);
  if(!history().some(item=>item.id===round.id))GM_setValue(key('pending-review'),{round,familiar,correct:round.correct});
  reviewPanel(pack,round,{familiar,attempts:history(),getAttempts:history,saved:history().some(item=>item.id===round.id&&item.feedbackSource!=='assumed-on-advance'),
    onChange:response=>{const pending=GM_getValue(key('pending-review'),null);if(pending?.round.id===round.id)GM_setValue(key('pending-review'),{...pending,...response})},
    loadNote:skill=>sourceNote(skill,round.location,{fetchText,get:GM_getValue,set:GM_setValue,revision:pack.contentRevision}),
    onSave:response=>{const updated=recordRecognition(pack,history(),round,response);GM_setValue(key('attempts'),updated);GM_setValue(key('pending-review'),null);return updated},onNext:prepare});mounted=round.id;
}
function start() {
  const framework=unsafeWindow.GeoGuessrEventFramework;
  if(framework&&!gameResponses){
    framework.events.addEventListener('round_start',event=>receiveState(structuredClone(event.detail)));
    framework.events.addEventListener('round_end',event=>receiveState(structuredClone(event.detail)));
  }
  document.addEventListener('click',event=>{
    const target=event.target.closest?.('button,[role="button"],a');
    if(target&&!target.disabled&&target.textContent.trim().toUpperCase()==='NEXT'){
      const routeId=gameId();
      stateQueue=stateQueue.then(()=>{if(!pack)return;const pending=GM_getValue(key('pending-review'),null);if(pending?.round.gameId===routeId)commitPendingReview(null,true)});
    }
  },true);
  new MutationObserver(()=>render()).observe(document.body,{childList:true,characterData:true,subtree:true});
  window.addEventListener('popstate',()=>{remove();render()});window.addEventListener('load',render,{once:true});render();
}
// Serialize early game events while a first-use content download is pending.
function receiveState(state) {
  const selected=packs.find(item=>item.practiceMapId===state.map?.id);if(!selected)return Promise.resolve();
  const prior=gameStates.get(state.current_game_id);
  if(prior&&(prior.current_round>state.current_round||(prior.current_round===state.current_round&&!prior.round_in_progress&&state.round_in_progress)))return Promise.resolve();
  // Keep authoritative responses by token even while GeoGuessr still shows the previous URL.
  gameStates.set(state.current_game_id,state);
  stateQueue=stateQueue.then(async()=>{
    if(gameId()!==state.current_game_id)return;
    const value=await store.load(selected.id,{gameId:state.current_game_id});
    // A navigation can finish during the download. Never show an old game's card there.
    if(gameId()!==state.current_game_id)return;
    if(lastState?.current_game_id!==state.current_game_id||lastState?.current_round!==state.current_round){launching=false;remove();}
    pack=value;context=contextFor(selected);loading='';store.pinGame(pack.id,state.current_game_id);
    commitPendingReview(state);lastState=state;if(document.body)render();
  }).catch(error=>{loading='';if(document.body&&gameId()===state.current_game_id)loadingPanel(selected,{error:error.message,onRetry:()=>receiveState(state),onImport:importPack})});
  return stateQueue;
}
function recoverGame(id,round){
  const attempt=`${id}:${round}`;
  if(recovering.has(id)||recoveryAttempts.has(attempt))return;
  recovering.add(id);recoveryAttempts.add(attempt);
  request(`/api/v3/games/${encodeURIComponent(id)}`).then(data=>{
    const state=stateFromGameData(data);
    if(state?.current_game_id===id)return receiveState(state);
  }).catch(error=>{
    const known=packs.find(item=>GM_getValue(`fieldwork:${item.id}:game:${id}`,null));
    if(known&&gameId()===id&&document.body){remove();loadingPanel(known,{error:error.message,onRetry:()=>{recoveryAttempts.delete(attempt);recoverGame(id,round)},onImport:importPack})}
  }).finally(()=>{recovering.delete(id);if(gameId()===id&&document.body)render()});
}
// Subscribe before DOMContentLoaded: the initial game response can arrive first.
gameResponses?.addEventListener('received_data',event=>{
  const state=stateFromGameData(event.detail);if(state)receiveState(state);
});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
