import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
import {splitPack,contentHash} from '../content-format.mjs';

const map='111111111111111111111111',otherMap='222222222222222222222222';
const source={id:'real-source',panoId:'actual-pano',lat:1,lng:2,skillIds:['clue'],assessmentEligible:false};
const pack={id:'test',title:'Practice',subject:'test',contentRevision:1,practiceMapId:map,
  skills:[{id:'clue',title:'Actual clue',phase:'Mixed',prerequisites:[]}],pools:[],locations:[source]};
const raw=(round=2)=>({token:'current-game',map,round,rounds:Array.from({length:5},()=>source),player:{guesses:Array.from({length:round},()=>({lat:1,lng:2}))}});
const built=await build({entryPoints:[new URL('../browser.mjs',import.meta.url).pathname],bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',plugins:[{
  name:'isolated-browser-fixture',setup(plugin){
    plugin.onResolve({filter:/practice-catalog\.json$/},()=>({path:'catalog',namespace:'synthetic-catalog'}));
    plugin.onLoad({filter:/.*/,namespace:'synthetic-catalog'},()=>({loader:'json',contents:JSON.stringify([{id:pack.id,title:pack.title,subject:pack.subject,practiceMapId:map,manifestUrl:'https://content.example/catalog.json'},
      {id:'other',title:'Other',subject:'test',practiceMapId:otherMap},{id:'unbound',title:'Unbound',subject:'test'}])}));
    plugin.onLoad({filter:/\/ui\.mjs$/},()=>({loader:'js',contents:`export function reviewPanel(pack,round,options){testUI.review(pack,round,options)} export function startPanel(pack,options){testUI.start(options)} export function loadingPanel(pack,options){testUI.loading(pack,options)} export function bindPanel(packs,options){testUI.bind(packs,options)} export function quickCheckPanel(){}` }));
    plugin.onLoad({filter:/\/content-cache\.mjs$/},()=>({loader:'js',contents:`export function indexedDbCache(){const saved=new Map();return {get:async key=>structuredClone(saved.get(key)),set:async(key,value)=>{saved.set(key,structuredClone(value))}}}`}));
  }
}]});
const code=built.outputFiles[0].text;
// The content host for cold installs: only the public runtime body and audit inventory, as published.
const {runtime,audit}=splitPack(pack,{publicContent:true}),body=JSON.stringify(runtime),auditBody=JSON.stringify(audit);
const files={'https://content.example/catalog.json':JSON.stringify({schemaVersion:1,packs:[{id:pack.id,title:pack.title,contentRevision:1,url:'pack.json',sha256:await contentHash(body),auditUrl:'audit.json',auditSha256:await contentHash(auditBody)}]}),
  'https://content.example/pack.json':body,'https://content.example/audit.json':auditBody};
const serve=details=>setImmediate(()=>details.onload({status:200,responseText:files[details.url]}));
const status=code=>details=>setImmediate(()=>details.onload({status:code,responseText:''}));
const offline=details=>setImmediate(()=>details.onerror());
// Timers advance only when a test says so. Callbacks run in due order, settling promises after each.
function fakeClock(settle){
  const timers=new Map();let now=0,id=0;
  return {setTimeout:(callback,ms=0)=>{timers.set(++id,{at:now+ms,callback});return id},clearTimeout:key=>timers.delete(key),
    delays:()=>[...timers.values()].map(timer=>timer.at-now),
    async advance(ms){
      const end=now+ms;
      for(let due;(due=[...timers].filter(([,timer])=>timer.at<=end).sort((a,b)=>a[1].at-b[1].at)[0]);){timers.delete(due[0]);now=due[1].at;due[1].callback();await settle()}
      now=end;await settle();
    }};
}
// cold: no cached content and a fake clock. GM requests go to `host` (changeable later). gm:false uses native fetch
// instead, answered by `contentFetch` when given. gmSetFails/gmGetFails make every GM write/read throw.
function fixture(path='/game/current-game',{cold=false,gm=true,host:initialHost=offline,contentFetch,gmSetFails=false,gmGetFails=false}={}){
  const data=cold?{}:{'fieldwork:pack':structuredClone(pack)},events=new EventTarget(),documentEvents=new Map(),windowEvents=new EventTarget();
  let visible=false,shownRound=2,observer=()=>{},nextResponse=raw(),networkFailure=false,host=initialHost,startOptions=null;
  const reviews=[],requests=[],binds=[],loads=[],downloads=[],signals=[];let panel=null,starts=0;
  const location={pathname:path,assign:()=>assert.fail('No navigation is allowed')};
  const marker={get textContent(){return `ROUND ${shownRound} / 5`}};
  const nativeFetch=async url=>{
    requests.push(url);if(contentFetch&&url.startsWith('https://content.example/'))return contentFetch(url);if(networkFailure)throw Error('offline');
    return {ok:true,text:async()=>files[url]??JSON.stringify(nextResponse),clone:()=>({json:async()=>nextResponse})};
  };
  const navigate=pathname=>{location.pathname=pathname;observer()};
  const page={fetch:nativeFetch,GEFFetchEvents:events,GeoGuessrEventFramework:{state:{current_game_id:'previous-game',current_round:5}},next:{router:{push:async pathname=>{navigate(pathname);return true}}}};
  const settle=async()=>{for(let i=0;i<20;i++)await new Promise(resolve=>setImmediate(resolve))};
  const clock=cold?fakeClock(settle):{setTimeout,clearTimeout};
  const gmRequest=details=>{const request={details,aborted:false,abort(){request.aborted=true;details.onabort?.()}};downloads.push(request);host(details);return request};
  const context=vm.createContext({URL,URLSearchParams,TextEncoder,crypto,Promise,Date,EventTarget,CustomEvent,structuredClone,setTimeout:clock.setTimeout,clearTimeout:clock.clearTimeout,
    AbortSignal:{timeout:ms=>{signals.push(ms);return AbortSignal.timeout(ms)}},
    unsafeWindow:page,location,...gm&&{GM_xmlhttpRequest:gmRequest},
    GM_getValue:(key,fallback)=>{if(gmGetFails)throw Error('GM_getValue: internal read detail');return data[key]??fallback},
    GM_setValue:(key,value)=>{if(gmSetFails)throw Error('Tampermonkey storage unavailable');data[key]=value},GM_listValues:()=>Object.keys(data),GM_deleteValue:key=>{delete data[key]},
    requestAnimationFrame:callback=>setImmediate(callback),
    document:{readyState:'complete',body:{},addEventListener:(...args)=>documentEvents.set(...args),
      querySelector:()=>visible?marker:null,querySelectorAll:()=>[],getElementById:()=>panel},
    window:{addEventListener:(...args)=>windowEvents.addEventListener(...args)},MutationObserver:class{constructor(callback){observer=callback}observe(){}},
    fetch:nativeFetch,
    testUI:{review:(pack,round,options)=>{panel={remove:()=>{panel=null}};reviews.push({pack,round,options})},start:options=>{starts++;startOptions=options;panel={remove:()=>{panel=null}}},
      loading:(pack,options)=>{panel={remove:()=>{panel=null}};loads.push({pack,...options})},bind:(packs,options)=>{panel={remove:()=>{panel=null}};binds.push({packs,options})}},console,
  });
  vm.runInContext(code,context);
  return {data,reviews,requests,binds,loads,downloads,signals,clock,settle,events,location,navigate,
    get starts(){return starts},get startOptions(){return startOptions},host:behaviour=>{host=behaviour},mutate:()=>observer(),
    response:value=>events.dispatchEvent(new CustomEvent('received_data',{detail:value})),
    reveal:round=>{shownRound=round;visible=true;observer()},
    // GeoGuessr can reveal the result view with a class change, which the DOM observer does not report.
    revealSilently:round=>{shownRound=round;visible=true},
    next:()=>{documentEvents.get('click')({target:{closest:()=>({textContent:'NEXT',disabled:false})}});visible=false;observer()},
    nativeResponse:()=>page.fetch('/api/v3/games/current-game'),setResponse:value=>nextResponse=value,setOffline:()=>{networkFailure=true},hasPanel:()=>!!panel,
  };
}
test('a game response arriving before the URL transition is retained for the matching result',async()=>{
  const f=fixture('/maps/'+map);await f.settle();
  f.response(raw());f.navigate('/game/current-game');f.reveal(2);await f.settle();
  assert.equal(f.reviews.at(-1)?.round.round,2);assert.equal(f.reviews.at(-1)?.round.gameId,'current-game');
  assert.equal(f.data['fieldwork:test:attempts'],undefined);
});
test('a relative native response recovers the card when the framework misses its event',async()=>{
  const f=fixture();await f.nativeResponse();f.reveal(2);await f.settle();
  assert.equal(f.reviews.at(-1)?.round.round,2);assert.equal(f.requests.length,1);
  f.reveal(2);await f.settle();assert.equal(f.requests.length,1);
  assert.equal(f.data['fieldwork:test:attempts'],undefined);
});
test('missing later events recover the next round without showing the previous clue or backfilling',async()=>{
  const f=fixture();await f.nativeResponse();f.reveal(2);await f.settle();
  f.next();await f.settle();assert.equal(f.hasPanel(),false);
  f.setResponse(raw(3));await f.nativeResponse();f.reveal(3);await f.settle();
  assert.deepEqual(f.reviews.map(item=>item.round.round),[2,3]);
  assert.equal(f.data['fieldwork:test:attempts'].length,1);assert.equal(f.data['fieldwork:test:attempts'][0].id,'test:current-game:2');
  assert.equal(f.data['fieldwork:test:attempts'][0].feedbackSource,'assumed-on-advance');
});
test('recovery never displays unguessed clues or another game or map',async()=>{
  for(const data of [raw(),{...raw(),token:'another-game'},{...raw(),map:'unconfigured-map'}]){
    const f=fixture();f.setResponse(data);await f.nativeResponse();await f.settle();assert.equal(f.reviews.length,0);
    if(data.token!=='current-game'||data.map!==map){f.reveal(2);await f.settle();assert.equal(f.reviews.length,0)}
    assert.equal(f.data['fieldwork:test:attempts'],undefined);
  }
});
test('late older responses cannot replace the current card or overwrite an explicit miss',async()=>{
  const f=fixture();await f.nativeResponse();f.reveal(2);await f.settle();
  f.reviews.at(-1).options.onSave({recognized:false,correct:false});f.next();await f.settle();
  f.setResponse(raw(3));await f.nativeResponse();f.reveal(3);await f.settle();
  f.response(raw(2));await f.settle();
  assert.deepEqual(f.reviews.map(item=>item.round.round),[2,3]);
  assert.equal(f.data['fieldwork:test:attempts'].length,1);assert.equal(f.data['fieldwork:test:attempts'][0].feedbackSource,'explicit');
  assert.equal(f.data['fieldwork:test:attempts'][0].evidenceValid,false);
});

test('startup and result rendering never issue game requests themselves',async()=>{const f=fixture();f.reveal(2);await f.settle();assert.equal(f.requests.length,0);assert.equal(f.reviews.length,0)});
const inProgress=round=>({...raw(round),player:{guesses:Array.from({length:round-1},()=>({lat:1,lng:2}))}});
test('every guessed round shows its own card once, whatever order responses, reveals and stale events arrive in',async()=>{
  for(let seed=1;seed<=150;seed++){
    let s=seed;const random=()=>(s=Math.imul(s^(s>>>15),2246822507)+0x6d2b79f5>>>0)/2**32;
    const f=fixture(random()<0.5?'/maps/'+map:'/game/current-game');await f.settle();
    if(f.location.pathname!=='/game/current-game'){if(random()<0.5)f.response(inProgress(1));f.navigate('/game/current-game');await f.settle();}
    for(let round=1;round<=5;round++){
      const steps=[()=>f.response(raw(round)),()=>f.reveal(round)];
      if(random()<0.5)steps.push(async()=>{f.setResponse(raw(round));await f.nativeResponse()});
      if(round>1&&random()<0.3)steps.push(()=>f.response(raw(round-1)));
      for(let i=steps.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[steps[i],steps[j]]=[steps[j],steps[i]]}
      for(const step of steps){await step();if(random()<0.5)await f.settle()}
      await f.settle();
      assert.equal(f.reviews.at(-1)?.round.round,round,`seed ${seed}: round ${round} card`);
      if(round<5){f.next();if(random()<0.6)f.response(inProgress(round+1));await f.settle();}
    }
    assert.deepEqual(f.reviews.map(review=>review.round.round),[1,2,3,4,5],`seed ${seed}: each card exactly once`);
  }
});
test('a result view revealed without a reported DOM mutation still shows its card',async()=>{
  const f=fixture();f.response(raw(2));await f.settle();assert.equal(f.reviews.length,0);
  f.revealSilently(2);await new Promise(resolve=>setTimeout(resolve,400));await f.settle();
  assert.equal(f.reviews.at(-1)?.round.round,2);
});
test('a public install binds an unbound pack only on the learner\'s own Fieldwork map in Map Maker',async()=>{
  const own='aaaaaaaaaaaaaaaaaaaaaaaa';
  const other=fixture('/map-maker/'+own);other.setResponse({name:'Holiday photos',version:3});other.navigate('/map-maker/'+own);await other.settle();
  assert.equal(other.binds.length,0);assert.equal(other.hasPanel(),false);
  const f=fixture('/map-maker/'+own);f.setResponse({name:'Fieldwork - Practice',version:3});f.navigate('/map-maker/'+own);await f.settle();
  assert.deepEqual([...f.binds.at(-1).packs].map(item=>item.id),['unbound']);assert.deepEqual(f.requests,['/api/v4/user-maps/drafts/'+own]);
  f.binds.at(-1).options.onBind('unbound');await f.settle();
  assert.equal(f.data['fieldwork:catalog'].find(item=>item.id==='unbound').practiceMapId,own);
  assert.equal(f.data['fieldwork:catalog'].find(item=>item.id===pack.id).practiceMapId,map);
  const bound=fixture('/map-maker/'+map);await bound.settle();assert.equal(bound.binds.length,0);
});

const practice='/maps/'+map,network=/could not reach content\.example\. Check your connection\. If Tampermonkey asks for permission, allow content\.example\./;
test('a cold first-load failure keeps one error panel and one retry through mutations and repeated game responses',async()=>{
  const f=fixture(practice,{cold:true});await f.settle();
  for(let i=0;i<20;i++){f.mutate();await f.settle()}
  assert.equal(f.downloads.length,1);assert.deepEqual(f.clock.delays(),[10e3]);assert.ok(f.hasPanel());
  assert.match(f.loads.at(-1).error,network);assert.match(f.loads.at(-1).error,/try again in 10 seconds/);
  const g=fixture('/game/current-game',{cold:true});
  for(let i=0;i<10;i++){g.response(raw());g.mutate();await g.settle()}
  assert.equal(g.downloads.length,1);assert.deepEqual(g.clock.delays(),[10e3]);assert.match(g.loads.at(-1).error,network);assert.equal(g.reviews.length,0);
});
test('transient failures back off from each failure and then recover to practice without a reload',async()=>{
  const f=fixture(practice,{cold:true});await f.settle();
  for(const [index,delay] of [10e3,30e3,120e3,300e3,300e3].entries()){
    await f.clock.advance(delay-1);assert.equal(f.downloads.length,index+1);
    if(index===4)f.host(serve);
    await f.clock.advance(1);
  }
  assert.equal(f.starts,1);assert.deepEqual(f.clock.delays(),[]);assert.equal(f.downloads.length,7);
  for(let i=0;i<5;i++){f.mutate();await f.settle()}
  assert.equal(f.downloads.length,7);
});
test('Retry now cancels the scheduled retry and never runs two attempts',async()=>{
  const f=fixture(practice,{cold:true});await f.settle();
  const retry=f.loads.at(-1).onRetry;f.host(()=>{});retry();retry();await f.settle();
  assert.equal(f.downloads.length,2);assert.deepEqual(f.clock.delays(),[20e3],'only the request deadline remains');
  await f.clock.advance(20e3);assert.ok(f.downloads[1].aborted);assert.deepEqual(f.clock.delays(),[30e3]);
  assert.match(f.loads.at(-1).error,/took too long/);
  f.host(offline);f.loads.at(-1).onRetry();retry();await f.settle();
  assert.equal(f.downloads.length,3);assert.deepEqual(f.clock.delays(),[120e3]);
});
test('leaving a page drops its panel and retries, and returning starts one fresh load that stale callbacks cannot touch',async()=>{
  const f=fixture(practice,{cold:true});await f.settle();
  f.navigate('/');await f.settle();assert.equal(f.hasPanel(),false);assert.deepEqual(f.clock.delays(),[]);
  await f.clock.advance(600e3);assert.equal(f.downloads.length,1);assert.equal(f.hasPanel(),false);
  f.host(()=>{});f.navigate(practice);await f.settle();assert.equal(f.downloads.length,2);
  f.navigate('/');await f.settle();f.navigate(practice);await f.settle();
  assert.equal(f.downloads.length,2,'the return joins the download still in flight');
  const shown=f.loads.length;await f.clock.advance(20e3);
  assert.equal(f.loads.length,shown+1);assert.deepEqual(f.clock.delays(),[10e3]);
  // Map to game: the game page has no response yet, so nothing of the map's load may remain.
  f.navigate('/game/current-game');await f.settle();assert.equal(f.hasPanel(),false);assert.deepEqual(f.clock.delays(),[]);
  await f.clock.advance(600e3);assert.equal(f.downloads.length,2);
});
test('denied, stalled, aborted and late requests settle once, abort on their deadline and ignore late answers',async()=>{
  for(const host of [()=>{throw Error('Tampermonkey refused')},offline,details=>setImmediate(()=>details.onabort())]){
    const f=fixture(practice,{cold:true,host});await f.settle();
    assert.match(f.loads.at(-1).error,network);assert.deepEqual(f.clock.delays(),[10e3]);
  }
  let late;const f=fixture(practice,{cold:true,host:details=>{late=details}});await f.settle();
  assert.deepEqual(f.clock.delays(),[20e3]);await f.clock.advance(20e3);
  assert.ok(f.downloads[0].aborted);assert.match(f.loads.at(-1).error,/took too long/);
  late.onload({status:200,responseText:files[late.url]});await f.settle();
  assert.equal(f.starts,0);assert.deepEqual(f.clock.delays(),[10e3]);
});
test('manifests get 20 seconds and pack bodies 120 seconds through GM and native fetch alike',async()=>{
  const deadlines=[],f=fixture(practice,{cold:true,host:details=>{deadlines.push(details.timeout);if(details.url.endsWith('catalog.json'))serve(details)}});await f.settle();
  assert.deepEqual(deadlines,[20e3,120e3]);
  await f.clock.advance(120e3-1);assert.ok(!f.loads.at(-1).error);assert.equal(f.downloads[1].aborted,false);
  await f.clock.advance(1);assert.ok(f.downloads[1].aborted);assert.match(f.loads.at(-1).error,/took too long/);
  const native=fixture(practice,{cold:true,gm:false});await native.settle();
  assert.deepEqual(native.signals,[20e3,120e3]);assert.equal(native.starts,1);
});
test('a missing pack offers another bound pack on its own map, and an import recovers the same page',async()=>{
  const f=fixture(practice,{cold:true,host:status(404)});await f.settle();
  const shown=f.loads.at(-1);assert.deepEqual(f.clock.delays(),[300e3]);
  assert.equal(shown.error,'This pack is not available from the content host yet. We\'ll check again in five minutes. You can choose another practice pack.');
  assert.deepEqual([...shown.packs].map(item=>item.id),['other']);
  shown.onChoosePack('other');await f.settle();
  assert.equal(f.location.pathname,'/maps/'+otherMap);assert.deepEqual(f.clock.delays(),[]);assert.equal(f.loads.at(-1).pack.id,'other');
  const g=fixture(practice,{cold:true,host:status(404)});await g.settle();
  await g.loads.at(-1).onImport(structuredClone(pack));await g.settle();
  assert.equal(g.starts,1);assert.equal(g.location.pathname,practice);assert.deepEqual(g.clock.delays(),[]);
});
test('a scheduled retry or stale Retry now does nothing after a navigation the page has not reconciled yet',async()=>{
  const f=fixture(practice,{cold:true});await f.settle();const retry=f.loads.at(-1).onRetry,shown=f.loads.length;
  f.location.pathname='/';await f.clock.advance(10e3);
  assert.equal(f.downloads.length,1);assert.equal(f.loads.length,shown);assert.equal(f.hasPanel(),false);
  retry();await f.settle();assert.equal(f.downloads.length,1);assert.deepEqual(f.clock.delays(),[]);
  // Observed, but the retry fires before the next frame reconciles it.
  const g=fixture(practice,{cold:true});await g.settle();
  g.navigate('/');await g.clock.advance(10e3);assert.equal(g.downloads.length,1);assert.equal(g.hasPanel(),false);
});
test('a first download on a game page shows a clue-free loading panel that offers the other bound pack',async()=>{
  const f=fixture('/game/current-game',{cold:true,host:()=>{}});f.response(raw());await f.settle();
  const shown=f.loads.at(-1);assert.ok(!shown.error);assert.ok(f.hasPanel());assert.equal(f.reviews.length,0);
  assert.deepEqual([...shown.packs].map(item=>item.id),['other']);
});
test('responses queued during a failed cold game load recover to the current round only, without feedback',async()=>{
  const f=fixture('/game/current-game',{cold:true});f.response(raw(2));f.response(inProgress(3));await f.settle();
  assert.equal(f.reviews.length,0);assert.match(f.loads.at(-1).error,network);
  f.host(serve);await f.clock.advance(10e3);
  f.response(raw(3));f.reveal(3);await f.settle();
  assert.deepEqual(f.reviews.map(review=>review.round.round),[3]);assert.equal(f.data['fieldwork:test:attempts'],undefined);
});
test('native fetch timeouts and failures, including while reading the body, are classified like GM ones',async()=>{
  const timeout=()=>Promise.reject(new DOMException('signal timed out','TimeoutError'));
  for(const [contentFetch,pattern] of [[timeout,/took too long/],[async()=>({ok:true,text:timeout}),/took too long/],
    [()=>Promise.reject(new TypeError('Failed to fetch')),network],[async()=>({ok:true,text:()=>Promise.reject(new DOMException('aborted','AbortError'))}),network]]){
    const f=fixture(practice,{cold:true,gm:false,contentFetch});await f.settle();
    assert.match(f.loads.at(-1).error,pattern);assert.deepEqual(f.clock.delays(),[10e3]);
  }
});
test('source notes get the 20 second deadline and source inventories the 120 second one',async()=>{
  const f=fixture();await f.nativeResponse();f.reveal(2);await f.settle();
  await f.reviews.at(-1).options.loadNote({id:'clue',title:'Actual clue',notesSourceMapId:'source-map'}).catch(()=>{});
  assert.match(f.downloads.at(-1).details.url,/^https:\/\/learnablemeta\.com\//);assert.equal(f.downloads.at(-1).details.timeout,20e3);
  const g=fixture(practice,{cold:true,host:serve});await g.settle();
  await g.startOptions.onCoverage().catch(()=>{});
  assert.equal(g.downloads.at(-1).details.url,'https://content.example/audit.json');assert.equal(g.downloads.at(-1).details.timeout,120e3);
});
test('a store that cannot start shows one plain recovery panel and nothing else',async()=>{
  const f=fixture(practice,{cold:true,gmSetFails:true});await f.settle();
  assert.equal(f.loads.length,1);assert.equal(f.loads[0].pack.title,'Fieldwork could not start');
  assert.match(f.loads[0].error,/could not use browser storage/);assert.equal(typeof f.loads[0].onRetry,'function');
  f.response(raw());f.mutate();await f.settle();assert.equal(f.downloads.length,0);assert.equal(f.loads.length,1);
});
test('an ordinary exception from a GM read at startup shows storage guidance, never its own text',async()=>{
  const f=fixture(practice,{cold:true,gmGetFails:true});await f.settle();
  assert.equal(f.loads.length,1);assert.match(f.loads[0].error,/could not use browser storage/);assert.doesNotMatch(f.loads[0].error,/internal/);
});
// Decision: an away-and-back the page reconciles once keeps its load. The next retry is for the page the learner is on.
test('a coalesced A to B to A navigation keeps one load: one download per retry slot and no duplicate panels',async()=>{
  const f=fixture(practice,{cold:true});await f.settle();const shown=f.loads.length;
  f.navigate('/');f.navigate(practice);await f.settle();
  assert.equal(f.loads.length,shown);assert.deepEqual(f.clock.delays(),[10e3]);assert.equal(f.downloads.length,1);
  await f.clock.advance(10e3);for(let i=0;i<5;i++){f.mutate();await f.settle()}
  assert.equal(f.downloads.length,2);assert.equal(f.loads.length,shown+2,'one loading and one error panel for the retry');
  assert.deepEqual(f.clock.delays(),[30e3]);
});
