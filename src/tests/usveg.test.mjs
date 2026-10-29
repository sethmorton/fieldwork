import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {completedRound,recordRecognition,startPracticeGame} from '../session.mjs';
import {planSprint,sprintStatus} from '../sprint.mjs';
import {makeNextSet,validatePack} from '../next-set.mjs';
import {albersUsa,cropWindow,clauses,km,cardImages} from '../vegcard.mjs';
// Synthetic us-vegetation pack: regions R0..R6 are 1-degree squares side by side (lng i..i+1, lat 0..1), three panoramas each.
const mid='0123456789abcdef01234567',practice='76543210fedcba9876543210';
const square=i=>({type:'Feature',properties:{name:'R'+i},geometry:{type:'Polygon',coordinates:[[[i,0],[i+1,0],[i+1,1],[i,1],[i,0]]]}});
const skills=[0,1,2,3,4,5,6].map(i=>({id:'usveg:R'+i,title:'Region '+i,phase:'Vegetation',prerequisites:[],subject:'vegetation',region:'R'+i,practiceFamily:'usveg:L1'}));
const pack={id:'us-vegetation',title:'US Vegetation',subject:'GeoGuessr',scheduler:'sprint',gradingPolicy:'recognition',card:'veg',practiceMapId:practice,skills,
  pools:[{id:'us-vegetation',title:'US',skillIds:skills.map(s=>s.id),mapUrl:`https://www.geoguessr.com/maps/${mid}`}],
  regionFeatures:skills.map((_,i)=>square(i)),
  locations:skills.flatMap((s,i)=>[0,1,2].map(k=>({id:`${s.region}-${k}`,panoId:`p${s.region}-${k}`,lat:0.2+0.3*k,lng:i+0.5,skillIds:[s.id],region:s.region,state:'S'+k})))};
const state=(lat,lng,round=1)=>({map:{id:practice},current_game_id:'g',current_round:round,round_in_progress:false,
  rounds:Array.from({length:round},()=>({location:{panoId:'pR1-0'},player_guess:{lat,lng}}))});

test('a veg round is graded by the guessed point\'s ecoregion; a guess off every region is wrong, not unknown',()=>{
  const right=completedRound(pack,state(0.9,1.1));
  assert.deepEqual([right.correct,right.guessedRegion,right.guess],[true,'R1',{lat:0.9,lng:1.1}]);
  const wrong=completedRound(pack,state(0.5,3.5));
  assert.deepEqual([wrong.correct,wrong.guessedRegion],[false,'R3']);
  const off=completedRound(pack,state(5,5));
  assert.deepEqual([off.correct,off.guessedRegion],[false,null]);
  // Other packs keep their rules: a non-sprint region pack leaves an off-region guess unknown and adds no guess fields.
  const other=completedRound({...pack,scheduler:undefined},state(5,5));
  assert.equal(other.correct,null);assert.equal('guess' in other,false);
  // A sprint pack without location regions (sprint-acow) is unchanged.
  const acow=completedRound({...pack,locations:pack.locations.map(({region,...location})=>location)},state(0.5,3.5));
  assert.equal(acow.correct,null);assert.equal('guessedRegion' in acow,false);
});
test('the automatic region grade is saved as auto and the 1/2/3 keys override it once',()=>{
  const round=completedRound(pack,state(0.5,3.5)),at=new Date('2026-10-29T08:00:00Z');
  const auto=recordRecognition(pack,[],round,{recognized:round.correct,auto:true},at);
  assert.deepEqual([auto[0].correct,auto[0].feedbackSource],[false,'auto']);assert.match(auto[0].reason,/guessed region/);
  const spotted=recordRecognition(pack,auto,round,{recognized:true,correct:round.correct},at);
  assert.deepEqual([spotted.length,spotted[0].correct,spotted[0].regionCorrect,spotted[0].feedbackSource],[1,true,false,'explicit']);
  assert.equal(recordRecognition(pack,spotted,round,{recognized:false,auto:true},at),spotted,'auto never replaces an explicit grade');
});
test('a set has five regions, one panorama each, and a region rotates through its unseen panoramas first',()=>{
  let attempts=[],n=0;const used=new Map();
  for(let set=0;set<6;set++){
    const {locationIds}=planSprint(pack,attempts,{size:5,now:Date.parse('2026-10-29T08:00:00Z')+set*60e3});
    const chosen=locationIds.map(id=>pack.locations.find(location=>location.id===id));
    assert.equal(chosen.length,5);
    assert.equal(new Set(chosen.map(location=>location.region)).size,5,'at most one location per region per set');
    for(const location of chosen){
      const before=used.get(location.region)??[];
      // Until a region has shown all three panoramas, it never repeats one.
      if(before.length<3)assert.ok(!before.includes(location.id),`${location.id} repeated before its region's other panoramas`);
      used.set(location.region,[...before,location.id]);
      attempts.push({id:'a'+n++,skillId:location.skillIds[0],locationRef:location.id,correct:n%3!==0,feedbackSource:'auto',
        occurredAt:new Date(Date.parse('2026-10-29T08:00:00Z')+n*1000).toISOString()});
    }
  }
  const set=makeNextSet(pack,attempts);
  assert.equal(set.mapMaking.customCoordinates.length,5);
});
test('ACoW weighting: high-share regions are planned before zero-share ones, which stay reachable',()=>{
  // usveg.py: cost = 1000 x pool share (+ a capped duel bonus); a region without share costs 0.01.
  const weighted={...pack,skills:pack.skills.map((skill,i)=>({...skill,cost:i<2?0.01:10*i,acow:i<2?0:i/100}))};
  const first=planSprint(weighted,[],{now:Date.parse('2026-10-29T08:00:00Z')}).locationIds.map(id=>id.split('-')[0]);
  assert.deepEqual(first,['R6','R5','R4','R3','R2'],'the five highest shares, costliest first');
  const attempts=first.map((region,n)=>({id:'a'+n,skillId:'usveg:'+region,locationRef:region+'-0',correct:true,feedbackSource:'auto',
    occurredAt:new Date(Date.parse('2026-10-29T08:00:00Z')+n*1000).toISOString()}));
  const second=planSprint(weighted,attempts,{now:Date.parse('2026-10-29T08:10:00Z')}).locationIds.map(id=>id.split('-')[0]);
  assert.ok(second.includes('R0')&&second.includes('R1'),'zero-share regions come once the others are introduced');
});
test('card geometry: crops never upscale past 1.25x, labels stay at 16 words, the map projection matches usveg.py',()=>{
  for(const box of [[0.5,0.5,0.01,0.01],[0,0,1,1],[0.529,0,0.083,1],[0.1,0.9,0.8,0.1]]){
    const [x0,y0,cw,ch]=cropWindow(box,180,1.9);
    assert.ok(180/(cw*1600)<=1.25+1e-9,`box ${box} upscales`);
    assert.ok(x0>=0&&y0>=0&&x0+cw<=1+1e-9&&y0+ch<=1+1e-9);
    assert.ok(Math.abs(cw*1600/(ch*1000)-1.9)<1e-6||cw>=1-1e-9||ch>=1-1e-9,'tile aspect kept unless the whole image is shown');
  }
  assert.deepEqual(clauses('Grey scaly trunks with stiff, upswept mossy limbs: Sitka spruce, the fog-belt tree.'),
    ['Grey scaly trunks with stiff, upswept mossy limbs','Sitka spruce, the fog-belt tree.']);
  assert.ok(clauses(Array(30).fill('word').join(' ')).join(' ').trim().split(/\s+/).length<=16);
  const [x,y]=albersUsa(-96.6,38.7);assert.ok(Math.abs(x-480)<1e-6&&Math.abs(y-250)<1e-6);
  assert.equal(km({lat:0,lng:0},{lat:0,lng:1}),111);
});
// The built pack (npm run usveg; local and untracked): a guess on any panorama grades as that panorama's own region.
const built=new URL('../../local/usveg-pack.json',import.meta.url);
test('built us-vegetation pack: every location grades as its own region',{skip:!existsSync(built)&&'no local/usveg-pack.json'},()=>{
  const veg={...JSON.parse(readFileSync(built,'utf8')),practiceMapId:practice};
  for(const location of veg.locations){
    const round=completedRound(veg,{map:{id:practice},current_game_id:'g',current_round:1,round_in_progress:false,
      rounds:[{location:{panoId:location.panoId},player_guess:{lat:location.lat,lng:location.lng}}]});
    assert.equal(round.guessedRegion,location.region,location.id);assert.equal(round.correct,true);
  }
  assert.ok(veg.skills.every(skill=>veg.vegMap.regions[skill.region]),'every region has a map path');
});
test('gameSettings: validated, and Continue starts the game with exactly them',async()=>{
  const settings={forbidMoving:true,forbidZooming:false,forbidRotating:false,timeLimit:90},withSettings={...pack,gameSettings:settings};
  assert.equal(validatePack(withSettings),withSettings);
  for(const bad of [null,{...settings,timeLimit:'90'},{...settings,timeLimit:-1},{...settings,forbidMoving:1},{forbidMoving:true,timeLimit:90},{...settings,extra:1}])
    assert.throws(()=>validatePack({...pack,gameSettings:bad}),/Game settings/);
  const sent=[];
  const request=reply=>async(url,options)=>{sent.push([url,options.method,JSON.parse(options.body)]);return reply};
  const token=await startPracticeGame(withSettings,request({token:'AbC123',map:practice,...settings}));
  assert.equal(token,'AbC123');
  assert.deepEqual(sent[0],['/api/v3/games','POST',{map:practice,type:'standard',rounds:5,timeLimit:90,forbidMoving:true,forbidZooming:false,forbidRotating:false}]);
  // A game that came back with other settings (or for another map) is refused, never played as if ranked-like.
  for(const reply of [{token:'x',map:practice,...settings,timeLimit:600},{token:'x',map:practice,...settings,forbidMoving:false},{token:'x',map:mid,...settings},{map:practice,...settings}])
    await assert.rejects(startPracticeGame(withSettings,request(reply)),/settings/);
});
// One region whose pool falls in four state cells: A 50% (two panoramas), B 30%, C 15%, D 5% (below the 10% bar).
const cellPack={...pack,cellCoverage:0.1,skills:[skills[0]],pools:[{...pack.pools[0],skillIds:[skills[0].id]}],locations:[['A1','A',0.5],['A2','A',0.5],['D1','D',0.05],['C1','C',0.15],['B1','B',0.3]]
  .map(([id,state,cellShare])=>({id,panoId:'p'+id,lat:0.5,lng:0.5,skillIds:[skills[0].id],region:'R0',state,cellShare}))};
const T0=Date.parse('2026-10-29T08:00:00Z'),H=3600e3;
const shownAt=(locationRef,minutes,correct=true)=>({id:locationRef+minutes,skillId:skills[0].id,locationRef,correct,feedbackSource:'auto',occurredAt:new Date(T0+minutes*60e3).toISOString()});
test('cell coverage: a region shows each state cell it has never shown first, largest ACoW share first, then rotates',()=>{
  const order=[];let attempts=[];
  for(let i=0;i<6;i++){const [id]=planSprint(cellPack,attempts,{size:1,now:T0}).locationIds;order.push(id);attempts=[...attempts,shownAt(id,i)];}
  assert.deepEqual(order,['A1','B1','C1','D1','A2','A1'],'new cells by share (the small one too), then unused, then least recently used');
  // Without the opt-in (sprint-acow), the pick is unchanged: unused panoramas in pack order.
  const {cellCoverage,...plain}=cellPack;attempts=[];order.length=0;
  for(let i=0;i<3;i++){const [id]=planSprint(plain,attempts,{size:1,now:T0}).locationIds;order.push(id);attempts=[...attempts,shownAt(id,i)];}
  assert.deepEqual(order,['A1','A2','D1']);
});
test('cell coverage: a region cannot learn or retire until every cell with at least 10% of its pool was shown',()=>{
  const status=(p,attempts)=>sprintStatus(p,attempts).get(skills[0].id).state;
  const {cellCoverage,...plain}=cellPack;
  // Two fresh spots (A, B) and a spot 12 hours later retire a region in a plain sprint pack...
  const twoCells=[shownAt('A1',0),shownAt('B1',1),shownAt('A1',13*60)];
  assert.equal(status(plain,twoCells),'retired');
  // ...but not while cell C (15%) was never shown.
  assert.equal(status(cellPack,twoCells),'learning');
  // Showing C (a fresh spot) makes it learned; the check 12 hours later retires it. D (5%) never blocks.
  const covered=[shownAt('A1',0),shownAt('B1',1),shownAt('C1',2),shownAt('B1',13*60)];
  assert.equal(status(cellPack,covered),'retired');
  // A miss on the covering cell still reactivates: learned only after a later fresh spot with every cell shown.
  assert.equal(status(cellPack,[shownAt('A1',0),shownAt('B1',1),shownAt('C1',2,false),shownAt('A2',3),shownAt('A2',13*60)]),'retired');
  assert.equal(status(cellPack,[shownAt('A1',0),shownAt('B1',1),shownAt('C1',2,false),shownAt('B1',13*60)]),'missed','a repeat spot after the miss is not fresh');
  assert.throws(()=>validatePack({...cellPack,cellCoverage:0}),/Cell coverage/);assert.throws(()=>validatePack({...cellPack,scheduler:undefined}),/Cell coverage/);
});
test('cardImages lists exactly what the card shows: the still, species photos, up to 3 recurrence thumbnails',()=>{
  const features=[{id:'oak',name:'Oak',kind:'species',species:'oak',ref:'sp-oak.jpg'},{id:'hill',name:'Hills',kind:'landform'}];
  const region={...pack,skills:[{...skills[0],features}],locations:[0,1,2,3,4].map(k=>({id:'L'+k,panoId:'p'+k,lat:0.5,lng:0.5,skillIds:[skills[0].id],region:'R0',img:`drive-${k}.jpg`,
    giveaways:[{feature:k===4?'hill':'oak',text:'x',box:[0,0,0.1+k/100,0.1]},{feature:null,text:'y',box:[0,0,0.1,0.1]}]}))};
  assert.deepEqual(cardImages(region,region.locations[0]),['drive-0.jpg','sp-oak.jpg','t/drive-3.jpg','t/drive-2.jpg','t/drive-1.jpg']);
});
