import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {completedRound,recordRecognition,startPracticeGame,launchRequest} from '../session.mjs';
import {planSprint,sprintStatus} from '../sprint.mjs';
import {makeNextSet,validatePack} from '../next-set.mjs';
import {albersUsa,cropWindow,clauses,km,cardImages,regionThumbs,spotTree,fitCrop} from '../vegcard.mjs';
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
      rounds:[{location:{panoId:location.panoId},player_guess:{lat:location.lat,lng:location.lng}}]},[location.id]);
    assert.equal(round.location.id,location.id);assert.equal(round.guessedRegion,location.region,location.id);assert.equal(round.correct,true);
  }
  assert.ok(veg.skills.every(skill=>skill.subject==='tree'||veg.vegMap.regions[skill.region]),'every region has a map path');
  assert.ok(veg.skills.filter(skill=>skill.subject==='tree').every(skill=>skill.spot.length===3&&skill.spot.every(line=>line.split(' ').length<=10)&&skill.range.length),'tree cards: 3 short bullets and a range');
});
test('gameSettings: validated, and Continue starts the game with exactly them',async()=>{
  const settings={forbidMoving:true,forbidZooming:false,forbidRotating:false,timeLimit:90},withSettings={...pack,gameSettings:settings};
  assert.equal(validatePack(withSettings),withSettings);
  for(const bad of [null,{...settings,timeLimit:'90'},{...settings,timeLimit:-1},{...settings,forbidMoving:1},{forbidMoving:true,timeLimit:90},{...settings,extra:1}])
    assert.throws(()=>validatePack({...pack,gameSettings:bad}),/Game settings/);
  const sent=[];
  const request=reply=>async(url,options)=>{sent.push([url,options.method,JSON.parse(options.body)]);return reply};
  const token=await startPracticeGame(launchRequest(withSettings),request({token:'AbC123',map:practice,...settings}));
  assert.equal(token,'AbC123');
  assert.deepEqual(sent[0],['/api/v3/games','POST',{map:practice,type:'standard',rounds:5,timeLimit:90,forbidMoving:true,forbidZooming:false,forbidRotating:false}]);
  // A game that came back with other settings (or for another map) is refused, never played as if ranked-like.
  for(const reply of [{token:'x',map:practice,...settings,timeLimit:600},{token:'x',map:practice,...settings,forbidMoving:false},{token:'x',map:mid,...settings},{map:practice,...settings}])
    await assert.rejects(startPracticeGame(launchRequest(withSettings),request(reply)),/settings/);
});
// One region whose pool falls in four state cells: A 50% (two panoramas), B 30%, C 15%, D 5%.
const cellPack={...pack,cellCoverage:true,skills:[skills[0]],pools:[{...pack.pools[0],skillIds:[skills[0].id]}],locations:[['A1','A',0.5],['A2','A',0.5],['D1','D',0.05],['C1','C',0.15],['B1','B',0.3]]
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
test('cell coverage: a region cannot learn or retire until every state cell with a panorama was shown',()=>{
  const status=(p,attempts)=>sprintStatus(p,attempts).get(skills[0].id).state;
  const {cellCoverage,...plain}=cellPack;
  // Two fresh spots (A, B) and a spot 12 hours later retire a region in a plain sprint pack...
  const twoCells=[shownAt('A1',0),shownAt('B1',1),shownAt('A1',13*60)];
  assert.equal(status(plain,twoCells),'retired');
  // ...but not while cell C (15%) was never shown.
  assert.equal(status(cellPack,twoCells),'learning');
  // C (15%) shown but D (5%) not: still learning. Every cell has a panorama, so even the smallest blocks retirement.
  assert.equal(status(cellPack,[shownAt('A1',0),shownAt('B1',1),shownAt('C1',2),shownAt('B1',13*60)]),'learning');
  // Showing D too (a fresh spot) makes it learned; the check 12 hours later retires it.
  const covered=[shownAt('A1',0),shownAt('B1',1),shownAt('C1',2),shownAt('D1',3),shownAt('B1',13*60)];
  assert.equal(status(cellPack,covered),'retired');
  // A miss on a covering cell still reactivates: learned only after a later fresh spot with every cell shown.
  assert.equal(status(cellPack,[shownAt('A1',0),shownAt('B1',1),shownAt('C1',2),shownAt('D1',3,false),shownAt('A2',4),shownAt('A2',13*60)]),'retired');
  assert.equal(status(cellPack,[shownAt('A1',0),shownAt('B1',1),shownAt('C1',2),shownAt('D1',3,false),shownAt('B1',13*60)]),'missed','a repeat spot after the miss is not fresh');
  assert.throws(()=>validatePack({...cellPack,cellCoverage:0}),/Cell coverage/);
  assert.equal(status({...cellPack,cellCoverage:0.1},covered.slice(0,2)),'learning','a cached 0.1 build loads and follows the every-cell rule');assert.throws(()=>validatePack({...cellPack,scheduler:undefined}),/Cell coverage/);
});
test('cardImages lists exactly what the card shows: the still, species photos, up to 3 recurrence thumbnails',()=>{
  const features=[{id:'oak',name:'Oak',kind:'species',species:'oak',ref:'sp-oak.jpg'},{id:'hill',name:'Hills',kind:'landform'}];
  const region={...pack,skills:[{...skills[0],features}],locations:[0,1,2,3,4].map(k=>({id:'L'+k,panoId:'p'+k,lat:0.5,lng:0.5,skillIds:[skills[0].id],region:'R0',img:`drive-${k}.jpg`,
    giveaways:[{feature:k===4?'hill':'oak',text:'x',box:[0,0,0.1+k/100,0.1]},{feature:null,text:'y',box:[0,0,0.1,0.1]}]}))};
  assert.deepEqual(cardImages(region,region.locations[0]),['drive-0.jpg','sp-oak.jpg','t/drive-3.jpg','t/drive-2.jpg','t/drive-1.jpg']);
});
test('a pack upgraded mid-session launches its next game with the new content\'s gameSettings',async()=>{
  // The page had loaded the old us-vegetation (no gameSettings); Continue prepared the set from the upgraded content.
  const old={...pack},upgraded={...pack,contentRevision:2,gameSettings:{forbidMoving:true,forbidZooming:false,forbidRotating:false,timeLimit:90}};
  assert.deepEqual(launchRequest(old,1),{mapId:practice,requestedAt:1},'old content: native Play keeps the learner\'s settings');
  const pending=launchRequest(upgraded,1);
  assert.deepEqual(pending.gameSettings,upgraded.gameSettings);
  let body;await startPracticeGame(pending,async(url,options)=>{body=JSON.parse(options.body);return {token:'t1',map:practice,...upgraded.gameSettings}});
  assert.deepEqual([body.map,body.timeLimit,body.forbidMoving],[practice,90,true]);
});
test('wrong-pin comparison thumbnails: this round\'s season first, then unseen panoramas, then pack order, never this round',()=>{
  const region={...pack,locations:[['a','leaf-off'],['b','leaf-on'],['c','leaf-on'],['d','leaf-on'],['e','leaf-off']].map(([id,season])=>({id,panoId:'p'+id,lat:0.5,lng:0.5,skillIds:[skills[0].id],region:'R0',season}))};
  const ids=options=>regionThumbs(region,skills[0],options).map(location=>location.id);
  assert.deepEqual(ids({season:'leaf-on'}),['b','c']);
  assert.deepEqual(ids({season:'leaf-on',seen:new Set(['b'])}),['c','d']);
  assert.deepEqual(ids({season:'leaf-on',exclude:'c',seen:new Set(['b'])}),['d','b']);
  assert.deepEqual(ids({season:'dormant'}),['a','b'],'no same-season panorama: unseen in pack order');
});
// Tree deck: T0 lives in R1-R2 (two panoramas), T1 in every region (two). Tree locations copy region panoramas.
const trees=[['T0',['R1','R2'],['R1-0','R2-0']],['T1',skills.map(s=>s.region),['R3-1','R4-1']]].map(([id,range,from])=>({id:'usveg:tree:'+id,title:'Tree '+id,
  subject:'tree',practiceFamily:'trees',phase:'Vegetation',prerequisites:[],species:[id.toLowerCase()],range,area:'somewhere',spot:['a','b','c'],examples:[],from}));
const treed={...pack,skills:[...skills,...trees],locations:[...pack.locations,...trees.flatMap(tree=>tree.from.map(ref=>{
  const base=pack.locations.find(location=>location.id===ref);return {...base,id:`${tree.id}:${base.panoId}`,skillIds:[tree.id],tree:{label:tree.title,box:[0,0,1,1]}}}))]};
test('a tree round is right anywhere in its range; the in-flight set decides which clue a shared panorama is',()=>{
  const active=['usveg:tree:T0:pR1-0'];
  assert.deepEqual([completedRound(treed,state(0.5,2.5),active).correct,completedRound(treed,state(0.5,2.5),active).location.id],[true,active[0]]);
  assert.equal(completedRound(treed,state(0.5,3.5),active).correct,false,'outside the range');
  assert.deepEqual([completedRound(treed,state(0.5,2.5)).correct,completedRound(treed,state(0.5,2.5)).location.id],[false,'R1-0'],'no set: the region clue');
});
test('the card leads with the panorama\'s high-confidence deck tree, the most range-restricted one',()=>{
  const loc={...pack.locations[0],trees:[{species:'t1',confidence:'high',box:[0,0,.1,.1]},{species:'t0',confidence:'high',box:[.5,0,.1,.1]},{species:null,confidence:'high',box:[0,0,1,1]}]};
  assert.equal(spotTree(treed,skills[0],loc).tree.id,'usveg:tree:T0');
  assert.deepEqual(spotTree(treed,skills[0],loc).box,[.5,0,.1,.1]);
  assert.equal(spotTree(treed,skills[0],{...loc,trees:[{species:'t0',confidence:'medium',box:[0,0,1,1]},{species:'oak',confidence:'high',box:[0,0,1,1]}]}),null,'medium or off-deck: no lead');
  assert.equal(spotTree(treed,trees[1],treed.locations.at(-1)).tree.id,'usveg:tree:T1','a tree round leads with its own tree');
  const [x0,y0,cw,ch]=fitCrop([0.4,0.05,0.1,0.9],0.75);
  assert.ok(Math.abs(cw*1600/(ch*1000)-0.75)<1e-9&&x0<=0.4&&x0+cw>=0.5&&y0>=0&&y0+ch<=1,'example crops fill a 3:4 tile, tree inside, within the image');
});
test('every set holds one tree round, in the middle, on a panorama no region round uses; warm-up keeps trees near',()=>{
  let attempts=[],n=0;
  for(let set=0;set<5;set++){
    const {locationIds,reasons}=planSprint(treed,attempts,{size:5,now:Date.parse('2026-10-29T08:00:00Z')+set*60e3});
    const chosen=locationIds.map(id=>treed.locations.find(location=>location.id===id));
    assert.equal(chosen.length,5);assert.deepEqual(chosen.map(location=>!!location.tree),[false,false,true,false,false],locationIds.join());
    assert.equal(new Set(chosen.map(location=>location.panoId)).size,5);assert.match(reasons[0],/1 tree/);
    for(const location of chosen)attempts.push({id:'a'+n++,skillId:location.skillIds[0],locationRef:location.id,correct:true,feedbackSource:'auto',
      occurredAt:new Date(Date.parse('2026-10-29T08:00:00Z')+n*1000).toISOString()});
  }
  const misses=Array.from({length:20},(_,i)=>({id:'m'+i,skillId:'usveg:R5',locationRef:'R5-0',correct:false,feedbackSource:'auto',occurredAt:new Date(Date.parse('2026-10-29T08:00:00Z')+i*1000).toISOString()}));
  const warm={...treed,warmup:['R1','R2'],skills:treed.skills.map(skill=>skill.id==='usveg:tree:T1'?{...skill,range:['R5'],cost:99}:skill)};
  const picked=planSprint(warm,misses,{now:Date.parse('2026-10-29T09:00:00Z')}).locationIds.map(id=>warm.locations.find(location=>location.id===id));
  assert.ok(picked.filter(location=>!location.tree).every(location=>['R1','R2'].includes(location.region)),'regions stay in the warm-up');
  assert.equal(picked.find(location=>location.tree).skillIds[0],'usveg:tree:T0','the costlier T1 is out of the warm-up range');
});
