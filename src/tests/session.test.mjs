import test from 'node:test';
import assert from 'node:assert/strict';
import {completedRound,recordRecognition,advanceRecognition,publishPracticeSet,practiceFeedback,quickCheckQueue,recordKnown} from '../session.mjs';
import {skillStatus} from '../lib/mastery.ts';
import {curriculumProgress} from '../lib/adaptive.ts';
import {validatePack} from '../next-set.mjs';
const mapId='0123456789abcdef01234567';
const pack={id:'any-country',practiceMapId:mapId,skills:[{id:'clue'},...[1,2,3,4].map(i=>({id:'clue'+i}))],pools:[],locations:Array.from({length:5},(_,i)=>({id:`pano:${i}`,panoId:String(i),lat:i,lng:i,skillIds:[i?'clue'+i:'clue'],region:'Test region'})),regionFeatures:[{properties:{name:'Test region'},geometry:{type:'Polygon',coordinates:[[[-10,-10],[10,-10],[10,10],[-10,10],[-10,-10]]]}}]};
const state={map:{id:mapId},current_game_id:'game-id',round_in_progress:false,current_round:1,rounds:[{location:{panoId:'0'},player_guess:{lat:1,lng:1}}]};
test('only completed rounds on the dedicated map can show a clue',()=>{
  assert.equal(completedRound(pack,{...state,round_in_progress:true}),null);
  assert.equal(completedRound(pack,{...state,map:{id:'other'}}),null);
  assert.equal(completedRound(pack,{...state,current_round:0}),null);
  assert.equal(completedRound(pack,state).correct,true);
});
test('a sprint round is graded automatically from the guessed country; an explicit grade overrides it once',()=>{
  // Atlas outlines: x=lng+180, y=90-lat. Testland spans lat/lng -10..10, Otherland lng 20..40.
  const geometry={XA:{name:'Testland',d:'M170 80L190 80L190 100L170 100Z'},XB:{name:'Otherland',d:'M200 80L220 80L220 100L200 100Z'}};
  const sprint={...pack,scheduler:'sprint',gradingPolicy:'recognition',regionFeatures:undefined,atlas:{geometry},
    skills:pack.skills.map(skill=>({...skill,country:'XA'})),locations:pack.locations.map(({region,...location})=>location)};
  const at=(lat,lng)=>completedRound(sprint,{...state,rounds:[{location:{panoId:'0'},player_guess:{lat,lng}}]});
  assert.deepEqual([at(1,1).guessedCountry,at(1,1).correct],['XA',true]);
  assert.deepEqual([at(1,30).guessedCountry,at(1,30).correct],['XB',false]);
  assert.equal(at(1,60).correct,null,'off every outline: no automatic grade');
  const auto=recordRecognition(sprint,[],at(1,30),{recognized:false,auto:true});
  assert.deepEqual([auto[0].correct,auto[0].regionCorrect,auto[0].feedbackSource],[false,false,'auto']);
  assert.equal(recordRecognition(sprint,auto,at(1,30),{recognized:true,auto:true}),auto,'auto never replaces auto');
  const knew=recordRecognition(sprint,auto,at(1,30),{recognized:true,knew:true});
  assert.deepEqual([knew.length,knew[0].correct,knew[0].grade,knew[0].feedbackSource],[1,true,'easy','explicit']);
  assert.equal(recordRecognition(sprint,knew,at(1,30),{recognized:false}),knew,'an explicit grade is final');
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
test('a recognition-graded pack schedules spotted/missed regardless of the country result',()=>{
  const at=new Date('2026-10-22T10:00:00Z'),dueIn=records=>(Date.parse(skillStatus('clue',records,at).reviewDueAt)-at)/60000;
  // A country-scored world pack; the guess lands in another country's polygon.
  const legacy={...pack,skills:pack.skills.map(skill=>({...skill,curriculum:{scope:'specialist',rank:1}})),
    locations:pack.locations.map(location=>({...location,country:location.region})),
    regionFeatures:[...pack.regionFeatures,{properties:{name:'Elsewhere'},geometry:{type:'Polygon',coordinates:[[[40,40],[60,40],[60,60],[40,60],[40,40]]]}}]};
  const world={...legacy,gradingPolicy:'recognition'};
  const wrong=completedRound(world,{...state,rounds:[{location:{panoId:'0'},player_guess:{lat:50,lng:50}}]});
  assert.equal(wrong.correct,false);
  const spotted=recordRecognition(world,[],wrong,{recognized:true},at),missed=recordRecognition(world,[],wrong,{recognized:false},at);
  assert.equal(spotted[0].correct,true);assert.equal(spotted[0].regionCorrect,false);assert.equal(dueIn(spotted),10); // Good
  assert.equal(missed[0].correct,false);assert.equal(dueIn(missed),1); // Again
  // Without the field a wrong country stays Again, as before.
  const old=recordRecognition(legacy,[],wrong,{recognized:true},at);
  assert.equal(old[0].correct,false);assert.equal(dueIn(old),1);
  const minimal={id:'p',title:'t',subject:'s',skills:[{id:'clue',title:'c',phase:'p',prerequisites:[]}],pools:[],locations:[]};
  assert.equal(validatePack({...minimal,gradingPolicy:'recognition'}).gradingPolicy,'recognition');
  assert.throws(()=>validatePack({...minimal,gradingPolicy:'country'}),/grading policy/);
});
test('a clue known cold skips the learning repeats, comes back to be confirmed, and restarts on a miss',()=>{
  const at=new Date('2026-10-22T10:00:00Z'),DAY=86400000,dueIn=records=>(Date.parse(skillStatus('clue',records,at).reviewDueAt)-at)/DAY;
  const world={...pack,gradingPolicy:'recognition'},round=completedRound(world,state);
  const knew=recordRecognition(world,[],round,{recognized:true,knew:true},at);
  assert.equal(knew[0].grade,'easy');assert.equal(dueIn(knew),8); // Easy: ts-fsrs 5.4.2 gives 8 days, not a 10-minute step
  // Knowing it is only claimed for a spotted clue: a miss stays a miss.
  const missed=recordRecognition(world,[],round,{recognized:false,knew:true},at);
  assert.equal(missed[0].grade,undefined);assert.equal(missed[0].correct,false);
  const relapse=[...knew,{...knew[0],id:'later',occurredAt:new Date(at.getTime()+8*DAY).toISOString(),correct:false,evidenceValid:false,confidence:2}];
  assert.ok(Date.parse(skillStatus('clue',relapse,at.getTime()+8*DAY).reviewDueAt)-(at.getTime()+8*DAY)<DAY);
});
test('quick check lists unscheduled clues in curriculum order; a known clue stays with FSRS even once due',()=>{
  const at=new Date('2026-10-22T10:00:00Z');
  const ranked={...pack,skills:pack.skills.map((skill,i)=>({...skill,curriculum:{scope:'within-country-regional',rank:5-i}}))};
  assert.deepEqual(quickCheckQueue(ranked,[],at).map(skill=>skill.id),['clue4','clue3','clue2','clue1','clue']);
  const known=recordKnown(ranked,[],'clue3',at);
  assert.deepEqual(quickCheckQueue(ranked,known,at).map(skill=>skill.id),['clue4','clue2','clue1','clue']);
  assert.equal(skillStatus('clue3',known,at).due,false);
  assert.equal(skillStatus('clue3',known,new Date(at.getTime()+8*86400000)).due,true);
  // Its confirmation is a panorama round, never another card.
  assert.ok(!quickCheckQueue(ranked,known,new Date(at.getTime()+9*86400000)).some(skill=>skill.id==='clue3'));
  assert.throws(()=>recordKnown(ranked,[],'nope',at),/Unknown clue/);
});
test('publishing is limited to a distinct verified owned map, after a backup, with actual source coordinates',async()=>{
  const set={mapMaking:{customCoordinates:pack.locations}};const calls=[];
  const request=async(url,options)=>{calls.push([url,options]);return {name:'Fieldwork - Practice',mode:'coordinates',version:4}};
  await publishPracticeSet(pack,set,request,async()=>calls.push(['backup']));
  assert.deepEqual(calls.map(([url,options])=>options?.method??url),[`/api/v4/user-maps/drafts/${mapId}`,'backup','PUT','PUT']);
  await assert.rejects(()=>publishPracticeSet({...pack,pools:[{id:mapId,mapUrl:'https://example.test'}]},set,request,async()=>{}),/never the source/);
  await assert.rejects(()=>publishPracticeSet(pack,{mapMaking:{customCoordinates:[...pack.locations.slice(1),{...pack.locations[0],lat:99}]}},request,async()=>{}),/source panoramas/);
});
test('a Polygonal regions map is refused before any backup or write, because GeoGuessr would ignore the coordinates',async()=>{
  const calls=[];
  await assert.rejects(()=>publishPracticeSet(pack,{mapMaking:{customCoordinates:pack.locations}},async(url,options)=>{calls.push(options?.method??'GET');return {name:'Fieldwork - Practice',mode:'regions',version:4}},()=>calls.push('backup')),/Polygonal regions/);
  assert.deepEqual(calls,['GET']);
});
test('publishing allows two clues per family and rejects a third before making any request',async()=>{
 const withFamilies=families=>({...pack,skills:pack.skills.map((skill,i)=>({...skill,practiceFamily:families[i]}))});
 const set={mapMaking:{customCoordinates:pack.locations}};let calls=0;
 await publishPracticeSet(withFamilies(['x','x','y','y','z']),set,async()=>{calls++;return {name:'Fieldwork - Practice',mode:'coordinates',version:1}},async()=>{});
 assert.equal(calls,3);calls=0;
 await assert.rejects(()=>publishPracticeSet(withFamilies(['x','x','x','y','z']),set,()=>calls++,()=>{}),/at most 2 clues per family/);assert.equal(calls,0);
});
test('failed draft update never attempts publication',async()=>{
  const methods=[];
  await assert.rejects(()=>publishPracticeSet(pack,{mapMaking:{customCoordinates:pack.locations}},async(url,options)=>{
    methods.push(options?.method??'GET');if(options)throw Error('Version conflict');return {name:'Fieldwork',mode:'coordinates',version:1};
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
