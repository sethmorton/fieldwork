import defaultPack from '../dist/practice-pack.json';
import {makeNextSet,validatePack,updatedPack} from './next-set.mjs';
import {completedRound,recordRecognition,advanceRecognition,publishPracticeSet} from './session.mjs';
import {reviewPanel,startPanel} from './ui.mjs';
import {stateFromGameData} from './game-state.mjs';
const gameResponses=unsafeWindow.GEFFetchEvents;

const storedPack=GM_getValue('fieldwork:pack',null);
let pack=updatedPack(storedPack,defaultPack);
if(pack!==storedPack)GM_setValue('fieldwork:pack',pack);
validatePack(pack);
const key=suffix=>`fieldwork:${pack.id}:${suffix}`;
const history=()=>GM_getValue(key('attempts'),[]);
const exposures=()=>GM_getValue(key('exposures'),[]);
const nextSet=()=>makeNextSet(pack,history(),{size:5,seenLocationRefs:exposures().map(item=>item.locationRef),previousSetLocationRefs:GM_getValue(key('active-set'),null)?.locationIds??[]});
function commitPendingReview(nextState,advance=false) {
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
  const set=nextSet();
  await publishPracticeSet(pack,set,request,draft=>{if(!GM_getValue(key('pending-backup'),null))GM_setValue(key('pending-backup'),draft)});
  GM_setValue(key('previous-draft'),GM_getValue(key('pending-backup'),null));GM_setValue(key('pending-backup'),null);
  GM_setValue(key('active-set'),{locationIds:set.selectedLocations.map(location=>location.id),preparedAt:new Date().toISOString()});
  GM_setValue(key('launch-request'),{mapId:pack.practiceMapId,requestedAt:Date.now()});
  if(location.pathname===`/maps/${pack.practiceMapId}`&&startPreparedGame())return;
  location.assign(`/maps/${pack.practiceMapId}`);
}
let mounted='',lastState=null;
const remove=()=>{document.getElementById('fieldwork-practice')?.remove();mounted=''};
function render() {
  const state=lastState??(gameResponses?null:unsafeWindow.GeoGuessrEventFramework?.state);
  commitPendingReview(state);
  const mapPage=location.pathname===`/maps/${pack.practiceMapId}`||location.pathname===`/map-maker/${pack.practiceMapId}`;
  if(mapPage){
    if(launching)return;
    if(startPreparedGame()){remove();return}
    if(mounted==='start')return;
    let set,error;try{set=nextSet()}catch(cause){error=cause.message}
    startPanel(pack,set,{onNext:prepare,error,attempts:history(),getAttempts:history,
      onExport:()=>download({packId:pack.id,attempts:history(),exposures:exposures(),previousDraft:GM_getValue(key('previous-draft'),null),pendingBackup:GM_getValue(key('pending-backup'),null)},`fieldwork-progress-${pack.id}.json`),
      onImport:async imported=>{validatePack(imported);if(!/^[a-f\d]{24}$/i.test(imported.practiceMapId??''))throw Error('The pack needs a dedicated owned practiceMapId.');
        GM_setValue('fieldwork:pack',imported);pack=imported;location.assign(`/maps/${pack.practiceMapId}`)},
    });mounted='start';return;
  }
  const round=completedRound(pack,state);
  const routeId=location.pathname.split('/').filter(Boolean).at(-1);
  const resultsVisible=!!document.querySelector('[data-qa="result-view-top"], [class*="result-list_listWrapper"]');
  if(!round||routeId!==round.gameId||!resultsVisible){if(mounted)remove();return;}
  if(mounted===round.id)return;
  const seen=exposures();const familiar=seen.some(item=>item.locationRef===round.location.id&&item.id!==round.id);
  if(!seen.some(item=>item.id===round.id))GM_setValue(key('exposures'),[...seen,{id:round.id,locationRef:round.location.id}]);
  if(!history().some(item=>item.id===round.id))GM_setValue(key('pending-review'),{round,familiar,correct:round.correct});
  reviewPanel(pack,round,{familiar,attempts:history(),getAttempts:history,saved:history().some(item=>item.id===round.id&&item.feedbackSource!=='assumed-on-advance'),
    onChange:response=>{const pending=GM_getValue(key('pending-review'),null);if(pending?.round.id===round.id)GM_setValue(key('pending-review'),{...pending,...response})},
    onSave:response=>{const updated=recordRecognition(pack,history(),round,response);GM_setValue(key('attempts'),updated);GM_setValue(key('pending-review'),null);return updated},onNext:prepare});mounted=round.id;
}
function start() {
  const framework=unsafeWindow.GeoGuessrEventFramework;
  if(framework&&!gameResponses){
    framework.events.addEventListener('round_start',event=>{commitPendingReview(event.detail);lastState=event.detail;launching=false;remove()});
    framework.events.addEventListener('round_end',event=>{lastState=event.detail;render()});
  }
  document.addEventListener('click',event=>{
    const target=event.target.closest?.('button,[role="button"],a');
    const pending=GM_getValue(key('pending-review'),null);
    if(pending&&target&&!target.disabled&&target.textContent.trim().toUpperCase()==='NEXT'
      &&location.pathname.split('/').at(-1)===pending.round.gameId)commitPendingReview(null,true);
  },true);
  new MutationObserver(()=>render()).observe(document.body,{childList:true,subtree:true});
  window.addEventListener('popstate',()=>{remove();render()});window.addEventListener('load',render,{once:true});render();
}
// Subscribe before DOMContentLoaded: the initial game response can arrive first.
gameResponses?.addEventListener('received_data',event=>{
  const state=stateFromGameData(event.detail);if(!state)return;
  commitPendingReview(state);
  if(lastState?.current_game_id!==state.current_game_id||lastState?.current_round!==state.current_round){launching=false;remove();}
  lastState=state;if(document.body)render();
});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
