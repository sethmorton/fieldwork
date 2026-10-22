import test from 'node:test';
import assert from 'node:assert/strict';
import {completedRound,recordRecognition,advanceRecognition,publishPracticeSet,practiceFeedback} from '../session.mjs';
import {skillStatus} from '../lib/mastery.ts';
import {curriculumProgress} from '../lib/adaptive.ts';
const mapId='0123456789abcdef01234567';
const pack={id:'any-country',practiceMapId:mapId,skills:[{id:'clue'},...[1,2,3,4].map(i=>({id:'clue'+i}))],pools:[],locations:Array.from({length:5},(_,i)=>({id:`pano:${i}`,panoId:String(i),lat:i,lng:i,skillIds:[i?'clue'+i:'clue'],region:'Test region'})),regionFeatures:[{properties:{name:'Test region'},geometry:{type:'Polygon',coordinates:[[[-10,-10],[10,-10],[10,10],[-10,10],[-10,-10]]]}}]};
const state={map:{id:mapId},current_game_id:'game-id',round_in_progress:false,current_round:1,rounds:[{location:{panoId:'0'},player_guess:{lat:1,lng:1}}]};
test('only completed rounds on the dedicated map can show a clue',()=>{
  assert.equal(completedRound(pack,{...state,round_in_progress:true}),null);
  assert.equal(completedRound(pack,{...state,map:{id:'other'}}),null);
  assert.equal(completedRound(pack,{...state,current_round:0}),null);
  assert.equal(completedRound(pack,state).correct,true);
});
test('a correct region alone cannot become evidence of clue recognition; duplicate events do not inflate history',()=>{
  const round=completedRound(pack,state);
  assert.throws(()=>recordRecognition(pack,[],round,{}),/Confirm/);
  const records=recordRecognition(pack,[],round,{recognized:false});
  assert.equal(records[0].correct,true); assert.equal(records[0].evidenceValid,false);
  assert.equal(recordRecognition(pack,records,round,{recognized:true}).length,1);
  const repeat=recordRecognition(pack,records,{...round,id:'different-game'},{recognized:true});
  assert.equal(repeat[1].unfamiliar,false);
});
test('unknown geography needs an explicit region result',()=>{
  const round=completedRound({...pack,regionFeatures:[]},state);
  assert.equal(round.correct,null);
  assert.throws(()=>recordRecognition(pack,[],round,{recognized:true}),/Confirm/);
  assert.equal(recordRecognition(pack,[],round,{recognized:true,correct:false})[0].correct,false);
});
test('unknown geography is never graded as a failure; spotted/missed decides country-scored regional clues',()=>{
  const at=new Date('2026-10-22T10:00:00Z'),dueIn=records=>(Date.parse(skillStatus('clue',records,at).reviewDueAt)-at)/60000;
  // Region-scored pack: an assumed spot with no region result is practice, not a scheduler review.
  const unknown=completedRound({...pack,regionFeatures:[]},state);
  const assumed=recordRecognition(pack,[],unknown,{recognized:true,assumed:true},at);
  assert.equal(assumed[0].correct,null);assert.equal(skillStatus('clue',assumed,at).reviewDueAt,null);
  assert.equal(dueIn(recordRecognition(pack,[],unknown,{recognized:false},at)),1); // An explicit miss is still Again.
  // World-style pack: the map scores the country, the clue is regional.
  const world={...pack,skills:pack.skills.map(skill=>({...skill,curriculum:{scope:'within-country-regional',rank:1}})),
    locations:pack.locations.map(location=>({...location,country:location.region}))};
  const noCountry=completedRound({...world,regionFeatures:[]},state),scored=completedRound(world,state);
  assert.equal(noCountry.correct,null);assert.equal(scored.correct,true);
  for(const [round,choice,minutes] of [[noCountry,{recognized:true},10],[noCountry,{recognized:true,assumed:true},10],[scored,{recognized:true},10],
    [noCountry,{recognized:false},1],[scored,{recognized:false},1],[scored,{recognized:true,correct:false},1]])
    assert.equal(dueIn(recordRecognition(world,[],round,choice,at)),minutes,JSON.stringify(choice)); // 10 min = Good, 1 min = Again
});
test('publishing is limited to a distinct verified owned map, after a backup, with actual source coordinates',async()=>{
  const set={mapMaking:{customCoordinates:pack.locations}};const calls=[];
  const request=async(url,options)=>{calls.push([url,options]);return {name:'Fieldwork - Practice',version:4}};
  await publishPracticeSet(pack,set,request,async()=>calls.push(['backup']));
  assert.deepEqual(calls.map(([url,options])=>options?.method??url),[`/api/v4/user-maps/drafts/${mapId}`,'backup','PUT','PUT']);
  await assert.rejects(()=>publishPracticeSet({...pack,pools:[{id:mapId,mapUrl:'https://example.test'}]},set,request,async()=>{}),/never the source/);
  await assert.rejects(()=>publishPracticeSet(pack,{mapMaking:{customCoordinates:[...pack.locations.slice(1),{...pack.locations[0],lat:99}]}},request,async()=>{}),/source panoramas/);
});
test('publishing rejects repeated clue families before making any request',async()=>{
 const p={...pack,skills:pack.skills.map(skill=>({...skill,practiceFamily:'same'}))};let calls=0;
 await assert.rejects(()=>publishPracticeSet(p,{mapMaking:{customCoordinates:p.locations}},()=>calls++,()=>{}),/five different clue families/);assert.equal(calls,0);
});
test('failed draft update never attempts publication',async()=>{
  const methods=[];
  await assert.rejects(()=>publishPracticeSet(pack,{mapMaking:{customCoordinates:pack.locations}},async(url,options)=>{
    methods.push(options?.method??'GET');if(options)throw Error('Version conflict');return {name:'Fieldwork',version:1};
  },async()=>{}),/Version conflict/);
  assert.deepEqual(methods,['GET','PUT']);
});
test('advancing saves assumed recognition as practice and never duplicates the observation',()=>{
 const round=completedRound(pack,state),pending={round,familiar:false,correct:round.correct};
 const next={...state,current_round:2,round_in_progress:true};
 const saved=advanceRecognition(pack,[],pending,next);
 assert.equal(saved.length,1);assert.equal(saved[0].evidenceValid,true);assert.equal(saved[0].feedbackSource,'assumed-on-advance');assert.equal(saved[0].mode,'practice');
 assert.equal(advanceRecognition(pack,saved,pending,next).length,1);
 assert.equal(skillStatus('clue',saved).eligibleCount,0);
});
test('remaining on results, reloading the same round, or another game does not imply recognition',()=>{
 const pending={round:completedRound(pack,state),familiar:false,correct:true};
 for(const next of [state,{...state,current_game_id:'other',current_round:2},{...state,map:{id:'other'},current_round:2}])assert.deepEqual(advanceRecognition(pack,[],pending,next),[]);
});
test('an explicit miss takes precedence over default recognition',()=>{
 const round=completedRound(pack,state),saved=recordRecognition(pack,[],round,{recognized:false});
 assert.deepEqual(advanceRecognition(pack,saved,{round,familiar:false,correct:true},{...state,current_round:2}),saved);
 assert.equal(saved[0].evidenceValid,false);
});
test('unknown region stays unknown when recognition is assumed',()=>{
 const round=completedRound({...pack,regionFeatures:[]},state);
 const saved=advanceRecognition(pack,[],{round,familiar:false,correct:null},{...state,current_round:2});
 assert.equal(saved[0].correct,null);assert.equal(saved[0].regionCorrect,null);assert.equal(saved[0].evidenceValid,true);
});
test('an explicit miss can be recorded even when geography is unknown',()=>{
 const round=completedRound({...pack,regionFeatures:[]},state);const saved=recordRecognition(pack,[],round,{recognized:false});assert.equal(saved[0].correct,null);assert.equal(saved[0].evidenceValid,false);assert.equal(saved[0].mode,'practice');
});
test('feature recognition is scored separately from state accuracy and country discrimination',()=>{
 const p={...pack,skills:[{id:'clue',recognitionOnly:true}]},round={...completedRound(pack,state),correct:false};
 const saved=recordRecognition(p,[],round,{recognized:true});assert.equal(saved[0].correct,true);assert.equal(saved[0].regionCorrect,false);assert.match(saved[0].reason,/Country discrimination was not tested/);
});
test('an explicit correction can replace an assumed record without adding another attempt',()=>{
 const round=completedRound(pack,state);const assumed=recordRecognition(pack,[],round,{recognized:true,assumed:true});
 const corrected=recordRecognition(pack,assumed,round,{recognized:false});assert.equal(corrected.length,1);assert.equal(corrected[0].feedbackSource,'explicit');assert.equal(corrected[0].evidenceValid,false);assert.equal(corrected[0].unfamiliar,true);
});
test('twenty assumed observations cannot establish mastery',()=>{
 const records=Array.from({length:20},(_,i)=>({id:String(i),skillId:'clue',occurredAt:`2026-10-${i<10?'17':'19'}T00:00:0${i%10}Z`,correct:true,evidenceValid:true,confidence:2,unfamiliar:true,locationRef:'pano:'+i,mode:'practice',feedbackSource:'assumed-on-advance'}));
 const status=skillStatus('clue',records,'2026-10-20T00:00:00Z');assert.equal(status.eligibleCount,0);assert.equal(status.state,'learning');
});

test('explicit recognition of teaching anchors stays practice even across twenty unique scenes',()=>{
 const original=completedRound(pack,state);let records=[];
 for(let i=0;i<20;i++){
  const round={...original,id:'teaching-round-'+i,location:{...original.location,id:'teaching-location-'+i,panoId:'teaching-pano-'+i,assessmentEligible:false}};
  records=recordRecognition(pack,records,round,{recognized:true},new Date(Date.UTC(2026,9,1+i)));
 }
 assert.ok(records.every(record=>record.mode==='practice'&&record.feedbackSource==='explicit'&&record.evidenceValid));
 const progress=skillStatus('clue',records,'2026-11-01T00:00:00Z');
 assert.equal(progress.eligibleCount,0);assert.equal(progress.state,'learning');
});

test('worldwide publication enforces country diversity before making account requests',async()=>{
 const worldwide={...pack,maxLocationsPerCountry:1,locations:pack.locations.map(l=>({...l,country:'Japan'}))};
 const set={mapMaking:{customCoordinates:worldwide.locations}};let requests=0;
 await assert.rejects(()=>publishPracticeSet(worldwide,set,async()=>{requests++;},()=>{}),/varied set of known countries/);
 assert.equal(requests,0);
});

test('post-round feedback distinguishes new, weak and review without claiming practice mastery',()=>{
 const round=completedRound(pack,state),now=new Date('2026-10-21T12:00:00Z');
 assert.equal(practiceFeedback([],round,now),'New clue');
 const previous={...round,id:'previous-round'};
 const missed=recordRecognition(pack,[],previous,{recognized:false},now);
 assert.equal(practiceFeedback(missed,round,now),'Review: you missed this last time');
 const spotted=recordRecognition(pack,[],previous,{recognized:true,assumed:true},now);
 assert.equal(practiceFeedback(spotted,round,now),'Review');
});
test('assumed teaching practice unlocks introductions, but explicit corrections remove false readiness',()=>{
 const now=new Date('2026-10-21T12:00:00Z');
 const p={...pack,skills:[...pack.skills.map(s=>({...s,curriculum:{scope:'country-identification',rank:0}})),
  {id:'regional',curriculum:{scope:'within-country-regional',rank:0}}],
  locations:[...pack.locations,{...pack.locations[0],id:'regional-location',skillIds:['regional']}]};
 let records=[];
 for(let i=0;i<20;i++){
  const round={id:'practice-'+i,correct:true,location:{...pack.locations[i%5],assessmentEligible:false}};
  records=recordRecognition(p,records,round,{recognized:true,assumed:true},now);
 }
 assert.match(curriculumProgress(p,records,now).message,/Regional clues are open/);
 for(let i=16;i<20;i++)records=recordRecognition(p,records,
  {id:'practice-'+i,correct:true,location:{...pack.locations[i%5],assessmentEligible:false}},{recognized:false},now);
 assert.doesNotMatch(curriculumProgress(p,records,now).message,/are open/);
 assert.equal(records.length,20);assert.ok(records.every(a=>a.mode==='practice'));
 assert.equal(skillStatus('clue',records,now).eligibleCount,0);
});
