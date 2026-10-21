import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';

const map='111111111111111111111111';
const source={id:'real-source',panoId:'actual-pano',lat:1,lng:2,skillIds:['clue'],assessmentEligible:false};
const pack={id:'test',title:'Practice',subject:'test',contentRevision:1,practiceMapId:map,
  skills:[{id:'clue',title:'Actual clue',phase:'Mixed',prerequisites:[]}],pools:[],locations:[source]};
const raw=(round=2)=>({token:'current-game',map,round,rounds:Array.from({length:5},()=>source),player:{guesses:Array.from({length:round},()=>({lat:1,lng:2}))}});
const built=await build({entryPoints:[new URL('../browser.mjs',import.meta.url).pathname],bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',plugins:[{
  name:'isolated-browser-fixture',setup(plugin){
    plugin.onResolve({filter:/practice-catalog\.json$/},()=>({path:'catalog',namespace:'synthetic-catalog'}));
    plugin.onLoad({filter:/.*/,namespace:'synthetic-catalog'},()=>({loader:'json',contents:JSON.stringify([{id:pack.id,title:pack.title,subject:pack.subject,practiceMapId:map}])}));
    plugin.onLoad({filter:/\/ui\.mjs$/},()=>({loader:'js',contents:`export function reviewPanel(pack,round,options){testUI.review(pack,round,options)} export function startPanel(){testUI.start()} export function loadingPanel(){}` }));
  }
}]});
const code=built.outputFiles[0].text;
function fixture(path='/game/current-game'){
  const data={'fieldwork:pack':structuredClone(pack)},events=new EventTarget(),documentEvents=new Map(),windowEvents=new EventTarget();
  let visible=false,shownRound=2,observer=()=>{},nextResponse=raw(),networkFailure=false;
  const reviews=[],requests=[];let panel=null;
  const location={pathname:path,assign:()=>assert.fail('No navigation is allowed')};
  const marker={get textContent(){return `ROUND ${shownRound} / 5`}};
  const context=vm.createContext({URL,URLSearchParams,TextEncoder,crypto,AbortSignal,Promise,Date,EventTarget,CustomEvent,structuredClone,setTimeout,clearTimeout,
    unsafeWindow:{GEFFetchEvents:events,GeoGuessrEventFramework:{state:{current_game_id:'previous-game',current_round:5}}},location,
    GM_getValue:(key,fallback)=>data[key]??fallback,GM_setValue:(key,value)=>data[key]=value,
    document:{readyState:'complete',body:{},addEventListener:(...args)=>documentEvents.set(...args),
      querySelector:()=>visible?marker:null,querySelectorAll:()=>[],getElementById:()=>panel},
    window:{addEventListener:(...args)=>windowEvents.addEventListener(...args)},MutationObserver:class{constructor(callback){observer=callback}observe(){}},
    fetch:async url=>{requests.push(url);if(networkFailure)throw Error('offline');assert.match(url,/\/api\/v3\/games\/current-game$/);return {ok:true,text:async()=>JSON.stringify(nextResponse)}},
    testUI:{review:(pack,round,options)=>{panel={remove:()=>{panel=null}};reviews.push({pack,round,options})},start:()=>{panel={remove:()=>{panel=null}}}},console,
  });
  vm.runInContext(code,context);
  const settle=async()=>{for(let i=0;i<20;i++)await new Promise(resolve=>setImmediate(resolve))};
  return {data,reviews,requests,settle,events,location,
    response:value=>events.dispatchEvent(new CustomEvent('received_data',{detail:value})),
    reveal:round=>{shownRound=round;visible=true;observer()},
    navigate:pathname=>{location.pathname=pathname;observer()},
    next:()=>{documentEvents.get('click')({target:{closest:()=>({textContent:'NEXT',disabled:false})}});visible=false;observer()},
    setResponse:value=>nextResponse=value,setOffline:()=>{networkFailure=true},hasPanel:()=>!!panel,
  };
}
test('a game response arriving before the URL transition is retained for the matching result',async()=>{
  const f=fixture('/maps/'+map);await f.settle();
  f.response(raw());f.navigate('/game/current-game');f.reveal(2);await f.settle();
  assert.equal(f.reviews.at(-1)?.round.round,2);assert.equal(f.reviews.at(-1)?.round.gameId,'current-game');
  assert.equal(f.data['fieldwork:test:attempts'],undefined);
});
test('a missed initial event recovers a completed round through one read-only game request',async()=>{
  const f=fixture();f.reveal(2);await f.settle();
  assert.equal(f.reviews.at(-1)?.round.round,2);assert.equal(f.requests.length,1);
  f.reveal(2);await f.settle();assert.equal(f.requests.length,1);
  assert.equal(f.data['fieldwork:test:attempts'],undefined);
});
test('missing later events recover the next round without showing the previous clue or backfilling',async()=>{
  const f=fixture();f.reveal(2);await f.settle();
  f.next();await f.settle();assert.equal(f.hasPanel(),false);
  f.setResponse(raw(3));f.reveal(3);await f.settle();
  assert.deepEqual(f.reviews.map(item=>item.round.round),[2,3]);
  assert.equal(f.data['fieldwork:test:attempts'].length,1);assert.equal(f.data['fieldwork:test:attempts'][0].id,'test:current-game:2');
  assert.equal(f.data['fieldwork:test:attempts'][0].feedbackSource,'assumed-on-advance');
});
test('recovery never displays unguessed clues or another game or map',async()=>{
  for(const data of [raw(),{...raw(),token:'another-game'},{...raw(),map:'unconfigured-map'}]){
    const f=fixture();f.setResponse(data);await f.settle();assert.equal(f.reviews.length,0);
    if(data.token!=='current-game'||data.map!==map){f.reveal(2);await f.settle();assert.equal(f.reviews.length,0)}
    assert.equal(f.data['fieldwork:test:attempts'],undefined);
  }
});
test('late older responses cannot replace the current card or overwrite an explicit miss',async()=>{
  const f=fixture();f.reveal(2);await f.settle();
  f.reviews.at(-1).options.onSave({recognized:false,correct:false});f.next();await f.settle();
  f.setResponse(raw(3));f.reveal(3);await f.settle();
  f.response(raw(2));await f.settle();
  assert.deepEqual(f.reviews.map(item=>item.round.round),[2,3]);
  assert.equal(f.data['fieldwork:test:attempts'].length,1);assert.equal(f.data['fieldwork:test:attempts'][0].feedbackSource,'explicit');
  assert.equal(f.data['fieldwork:test:attempts'][0].evidenceValid,false);
});
