import catalog from '../dist/practice-catalog.json';
import {createContentStore} from './content-store.mjs';
import {indexedDbCache} from './content-cache.mjs';
import {sourceNote} from './source-note.mjs';
import {makeNextSet} from './next-set.mjs';
import {packForPage} from './packs.mjs';
import {completedRound,recordRecognition,advanceRecognition,publishPracticeSet} from './session.mjs';
import {reviewPanel,startPanel,loadingPanel} from './ui.mjs';
import {stateFromGameData} from './game-state.mjs';
import {observeGameResponses} from './game-responses.mjs';
const gameResponses=unsafeWindow.GEFFetchEvents;

function fetchText(url) {
  if(typeof GM_xmlhttpRequest==='function')return new Promise((resolve,reject)=>GM_xmlhttpRequest({url,method:'GET',anonymous:true,timeout:20000,
    onload:response=>response.status>=200&&response.status<300?resolve(response.responseText):reject(Error(`Content returned ${response.status}.`)),
    onerror:()=>reject(Error('Content could not be downloaded.')),ontimeout:()=>reject(Error('Content download timed out.'))}));
  return fetch(url,{credentials:'omit',signal:AbortSignal.timeout(20000)}).then(response=>{if(!response.ok)throw Error(`Content returned ${response.status}.`);return response.text()});
}
const store=createContentStore({get:GM_getValue,set:GM_setValue,list:GM_listValues,remove:GM_deleteValue,cache:indexedDbCache(globalThis.indexedDB??unsafeWindow.indexedDB),catalog,fetchText});
const packs=store.catalog;
let pack=null,context='',loading='',stateQueue=Promise.resolve();
const gameStates=new Map();
const gameId=()=>/^\/(?:game|results)\/([^/]+)$/.exec(location.pathname)?.[1];
const contextFor=entry=>`${entry.id}:${gameId()??'map'}`;
// Client-side navigation keeps GeoGuessr's app, this script and its loaded content alive; a full page load is the fallback.
function go(path) {
  const router=unsafeWindow.next?.router;
  if(typeof router?.push!=='function')return location.assign(path);
  // Next's router resolves false when a navigation is cancelled; then load the page directly.
  Promise.resolve(router.push(path)).then(ok=>{if(ok===false)location.assign(path)},()=>location.assign(path));
}
const importPack=async imported=>{await store.add(imported);go(`/maps/${imported.practiceMapId}`)};
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
// Use the native Play control so GeoGuessr retains the learner's game settings. The request survives a full
// page load; GeoGuessr can ignore an early click while the map page settles, so retry until a game opens.
function startPreparedGame() {
  const pending=GM_getValue(key('launch-request'),null);
  if(!pending)return false;
  if(pending.mapId!==pack.practiceMapId||Date.now()-pending.requestedAt>30000){GM_setValue(key('launch-request'),null);return false}
  if(Date.now()-(pending.clickedAt??0)<1500)return true;
  const play=document.readyState==='complete'&&[...document.querySelectorAll('main button')].find(button=>button.textContent.trim()==='Play'&&!button.disabled&&button.getClientRects().length);
  if(!play)return !!pending.clickedAt;
  GM_setValue(key('launch-request'),{...pending,clickedAt:Date.now()});play.click();
  setTimeout(scheduleRender,1600);
  return true;
}
let preparing=null;
// Single flight: a remounted panel or a second click joins the publication already in progress.
const prepare=()=>preparing??=preparePractice().finally(()=>{preparing=null});
async function preparePractice() {
  if(GM_getValue(key('pending-review'),null)?.round.round===5)commitPendingReview(null,true);
  const route=location.pathname,routeGame=gameId(),chosen=await store.load(pack.id),set=nextSet(chosen),chosenKey=suffix=>key(suffix,chosen.id);
  await publishPracticeSet(chosen,set,request,draft=>{if(!GM_getValue(chosenKey('pending-backup'),null))GM_setValue(chosenKey('pending-backup'),draft)});
  GM_setValue(chosenKey('previous-draft'),GM_getValue(chosenKey('pending-backup'),null));GM_setValue(chosenKey('pending-backup'),null);
  store.pinSet(chosen.id,set,chosen);
  GM_setValue(chosenKey('launch-request'),{mapId:chosen.practiceMapId,requestedAt:Date.now()});
  // Opening the finished game's summary meanwhile is still this request; another page is the learner's choice.
  if(location.pathname!==route&&!(routeGame&&gameId()===routeGame))return;
  const mapPath=`/maps/${chosen.practiceMapId}`;
  if(location.pathname===mapPath){mounted='';render();return}
  go(mapPath);
}
let mounted='',lastShown='',revealRound='',revealChecks=0,lastState=null;
const remove=()=>{document.getElementById('fieldwork-practice')?.remove();mounted=''};
// GeoGuessr mutates the DOM continuously; reconcile at most once per frame instead of once per mutation batch.
let renderQueued=false;
function scheduleRender() {
  if(renderQueued)return;
  renderQueued=true;requestAnimationFrame(()=>{renderQueued=false;render()});
}
function render() {
  const currentGame=gameId();
  const frameworkState=unsafeWindow.GeoGuessrEventFramework?.state;
  const state=gameStates.get(currentGame)??(lastState?.current_game_id===currentGame?lastState:null)??(frameworkState?.current_game_id===currentGame?frameworkState:null);
  // A clicked launch is done once any game page opens, even before that game's first response arrives.
  if(pack&&currentGame&&GM_getValue(key('launch-request'),null)?.clickedAt)GM_setValue(key('launch-request'),null);
  const marker=document.querySelector('[data-qa="result-view-top"], [class*="result-list_listWrapper"]');
  const resultsVisible=!!marker&&(!marker.getClientRects||marker.getClientRects().length>0);
  const shownRound=location.pathname.startsWith('/results/')?5:Number(marker?.textContent?.match(/\bROUND\s+([1-5])\s*\/\s*5\b/i)?.[1])||null;
  if(currentGame&&(!state||state.current_game_id!==currentGame||(resultsVisible&&(state.round_in_progress||shownRound&&shownRound!==state.current_round)))){
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
      // A navigation finished first: release the lock so that page (or a later return here) loads afresh.
      if(location.pathname!==route){if(loading===wanted)loading='';return}
      pack=value;context=wanted;loading='';
      if(gameId())store.pinGame(pack.id,gameId());
      remove();render();
      // Warm-cache practice never waits for the content host. Apply updates to the next set.
      if(!gameId())store.refresh(pack.id).catch(()=>{});
    }).catch(error=>{if(loading===wanted)loading='';if(location.pathname===route)loadingPanel(selected,{error:error.message,onRetry:()=>{loading='';render()},onImport:importPack})});
    return;
  }
  commitPendingReview(state);
  const mapPage=location.pathname===`/maps/${pack.practiceMapId}`||location.pathname===`/map-maker/${pack.practiceMapId}`;
  if(mapPage){
    if(startPreparedGame()){if(mounted!=='launch'){loadingPanel(pack,{message:'Starting your next set…'});mounted='launch'}return}
    if(mounted==='start')return;
    startPanel(pack,{onNext:prepare,attempts:history(),getAttempts:history,packs,onChoosePack:id=>go(`/maps/${packs.find(item=>item.id===id).practiceMapId}`),
      onExport:()=>download({packId:pack.id,attempts:history(),exposures:exposures(),previousDraft:GM_getValue(key('previous-draft'),null),pendingBackup:GM_getValue(key('pending-backup'),null)},`fieldwork-progress-${pack.id}.json`),
      onImport:importPack,onCoverage:async()=>download(await store.audit(pack.id),`fieldwork-sources-${pack.id}.json`),
    });mounted='start';return;
  }
  const round=completedRound(pack,state);
  const routeId=location.pathname.split('/').filter(Boolean).at(-1);
  // The result view can be revealed by a class change, which the DOM observer does not report: re-check for up to 5 s.
  if(round&&routeId===round.gameId&&!resultsVisible&&round.id!==lastShown){
    if(revealRound!==round.id){revealRound=round.id;revealChecks=0}
    if(revealChecks++<20)setTimeout(scheduleRender,250);
  }
  if(!round||routeId!==round.gameId||!resultsVisible){if(mounted)remove();return;}
  if(mounted===round.id)return;
  const seen=exposures();const familiar=seen.some(item=>item.locationRef===round.location.id&&item.id!==round.id);
  if(!seen.some(item=>item.id===round.id))GM_setValue(key('exposures'),[...seen,{id:round.id,locationRef:round.location.id}]);
  if(!history().some(item=>item.id===round.id))GM_setValue(key('pending-review'),{round,familiar,correct:round.correct});
  reviewPanel(pack,round,{familiar,attempts:history(),getAttempts:history,saved:history().some(item=>item.id===round.id&&item.feedbackSource!=='assumed-on-advance'),
    onChange:response=>{const pending=GM_getValue(key('pending-review'),null);if(pending?.round.id===round.id)GM_setValue(key('pending-review'),{...pending,...response})},
    loadNote:skill=>sourceNote(skill,round.location,{fetchText,get:GM_getValue,set:GM_setValue,revision:pack.contentRevision}),
    onSave:response=>{const updated=recordRecognition(pack,history(),round,response);GM_setValue(key('attempts'),updated);GM_setValue(key('pending-review'),null);return updated},onNext:prepare});mounted=lastShown=round.id;
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
      // A failed save must not reject the shared queue and drop the next round's card.
      stateQueue=stateQueue.then(()=>{if(!pack)return;const pending=GM_getValue(key('pending-review'),null);if(pending?.round.gameId===routeId)commitPendingReview(null,true)})
        .catch(error=>console.warn('Fieldwork could not save the advanced round.',error));
    }
  },true);
  new MutationObserver(scheduleRender).observe(document.body,{childList:true,characterData:true,subtree:true});
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
    pack=value;context=contextFor(selected);loading='';store.pinGame(pack.id,state.current_game_id);
    commitPendingReview(state);lastState=state;if(document.body)render();
  }).catch(error=>{loading='';if(document.body&&gameId()===state.current_game_id)loadingPanel(selected,{error:error.message,onRetry:()=>receiveState(state),onImport:importPack})});
  return stateQueue;
}
// Subscribe before DOMContentLoaded: the initial game response can arrive first.
const acceptData=data=>{const state=stateFromGameData(data);if(state)receiveState(state)};
gameResponses?.addEventListener('received_data',event=>acceptData(event.detail));
observeGameResponses(unsafeWindow,acceptData);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
