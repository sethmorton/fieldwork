import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {makeNextSet,validatePack} from '../next-set.mjs';
import {completedRound,publishPracticeSet} from '../session.mjs';
import {planDeal,recordDeal,retests,learnerModel,fadedRegions,worldPoints,distanceKm,gradeDeal,seeded,betaSample,
  RETEST_DAYS,FADE_WEIGHT,HALF_LIFE_DAYS,SESSION_WEIGHT} from '../deal.mjs';
import {dealTiles,sessionCheck,checkDue,currentSession} from '../deal-stats.mjs';

// Synthetic world: three countries, square regions on a grid, 12 drill + 4 study spots each. Region r of country c is
// the 1°×1° square at (lat c*10 + r, lng 0). Metas: each region has its own meta, plus one shared 'm:poles'.
const DAY=864e5,T0=Date.parse('2026-11-03T12:00:00Z');
const square=(lat,lng)=>({type:'Polygon',coordinates:[[[lng,lat],[lng+1,lat],[lng+1,lat+1],[lng,lat+1],[lng,lat]]]});
function world({focus='A',acow={A:0.5,B:0.3,C:0.2},regionsPer=3,drill=12,study=4}={}){
  const regionFeatures=[],regions={},skills=[],locations=[],metas={'m:poles':{title:'Poles',source:'plonkit',url:'https://example.test',appliesTo:[],countries:['A','B','C']}};
  Object.keys(acow).forEach((country,c)=>{for(let r=0;r<regionsPer;r++){
    const name=`${country} — R${r}`,lat=c*10+r,metaId=`m:${country}${r}`;
    regionFeatures.push({type:'Feature',properties:{name,country},geometry:square(lat,0)});regions[name]={country,iso2:country};
    skills.push({id:`train:${country}:r${r}`,title:name,phase:'Regions',prerequisites:[],region:name,country,practiceFamily:country});
    metas[metaId]={title:`Meta ${country}${r}`,source:'plonkit',url:'https://example.test',appliesTo:[name],countries:[country]};
    for(let i=0;i<drill+study;i++)locations.push({id:`pano:${country}${r}-${i}`,panoId:`${country}${r}-${i}`,lat:lat+0.05+i*0.05,lng:0.5,heading:0,pitch:0,zoom:0,fov:90,
      skillIds:[`train:${country}:r${r}`],country,region:name,split:i<study?'study':i===study?'probe':'drill',rural:true,verified:true,
      metas:[{metaId,what:'x',box:[0.1,0.1,0.2,0.2],source:'plonkit',confidence:0.8},...(i%2?[{metaId:'m:poles',what:'p',box:[0.5,0.1,0.1,0.4],source:'plonkit',confidence:0.8}]:[])]});
  }});
  return {id:'training',title:'Training',subject:'GeoGuessr',schemaVersion:1,contentRevision:1,scheduler:'deal',practiceMapId:'0123456789abcdef01234567',
    acow,focus:{country:focus,scores:[],computedAt:'2026-11-03T00:00:00Z'},regionFeatures,regions,skills,metas,locations};
}
const byId=pack=>new Map(pack.locations.map(location=>[location.id,location]));
// Plays one round on `location`, pinning `pinRegion` (default: right), `seconds` to guess.
function play(pack,attempts,location,{pinRegion=location.region,at=T0,seconds=8,slot=null,n=attempts.length}={}){
  const target=pack.locations.find(item=>item.region===pinRegion);
  const guess=pinRegion===location.region?{lat:location.lat+0.001,lng:location.lng}:{lat:target.lat,lng:target.lng};
  const round={id:`training:g:${n}`,location,round:1,gameId:'g',...gradeDeal(pack,location,guess,seconds)};
  return recordDeal(pack,attempts,round,{slot},new Date(at));
}
const plan=(pack,attempts,options={})=>planDeal(pack,attempts,{now:T0,random:seeded(1),...options});

test('deal packs validate without pools; study spots and unknown metas are rejected',()=>{
  const pack=world();assert.equal(validatePack(pack),pack);
  assert.throws(()=>validatePack({...pack,locations:[{...pack.locations[0],split:'other'},...pack.locations.slice(1)]}),/split/);
  assert.throws(()=>validatePack({...pack,locations:[{...pack.locations[0],metas:[{metaId:'m:none',box:[0,0,1,1]}]},...pack.locations.slice(1)]}),/metas/);
  assert.throws(()=>validatePack({...pack,regionFeatures:undefined}),/regionFeatures/);
});
test('grading: the pinned macro-region, its country, world-scale points and the guess time',()=>{
  const pack=world(),location=pack.locations.find(item=>item.region==='A — R1'&&item.split==='drill');
  const right=gradeDeal(pack,location,{lat:location.lat+0.01,lng:location.lng},12.5);
  assert.deepEqual([right.correct,right.countryCorrect,right.guessedRegion,right.elapsedMs,right.points],[true,true,'A — R1',12500,worldPoints(distanceKm({lat:location.lat+0.01,lng:location.lng},location))]);
  const wrong=gradeDeal(pack,location,{lat:2.5,lng:0.5});
  assert.deepEqual([wrong.correct,wrong.countryCorrect,wrong.guessedRegion],[false,true,'A — R2']);
  const otherCountry=gradeDeal(pack,location,{lat:10.5,lng:0.5});assert.equal(otherCountry.countryCorrect,false);assert.equal(otherCountry.guessedCountry,'B');
  // Sea next to a coastal answer counts as the answer region; far out at sea is a miss with no region.
  assert.equal(gradeDeal(pack,location,{lat:location.lat,lng:location.lng-0.1}).correct,true);
  const sea=gradeDeal(pack,location,{lat:-40,lng:-40});assert.equal(sea.correct,false);assert.equal(sea.guessedRegion,null);
  // World formula: 0 km = 5000, 1,492 km ≈ 1,839, never inflated for small maps.
  assert.equal(worldPoints(0),5000);assert.equal(worldPoints(1491.6862),Math.round(5000/Math.E));
});
test('completedRound grades deal rounds through regionFeatures and keeps the guess time',()=>{
  const pack=world(),location=pack.locations.find(item=>item.split==='drill');
  const state={map:{id:pack.practiceMapId},current_game_id:'g1',current_round:2,round_in_progress:false,
    rounds:[{},{location:{panoId:location.panoId},player_guess:{lat:2.5,lng:0.5,time:21}}]};
  const round=completedRound(pack,state,[location.id]);
  assert.equal(round.id,'training:g1:2');assert.equal(round.correct,false);assert.equal(round.guessedRegion,'A — R2');assert.equal(round.elapsedMs,21000);
});
test('a set is 5 fresh playable spots: never a study spot, never a panorama already played or shown',()=>{
  const pack=world();let attempts=[];const seenRefs=new Set(),locations=byId(pack);
  for(let set=0;set<20;set++){
    const next=makeNextSet(pack,attempts,{size:5,now:T0+set*600000,seenLocationRefs:[...seenRefs].slice(0,3),random:seeded(set)});
    assert.equal(next.selectedLocations.length,5);
    for(const location of next.selectedLocations){
      assert.notEqual(location.split,'study');assert.ok(!seenRefs.has(location.id),`repeat ${location.id} in set ${set}`);
      seenRefs.add(location.id);attempts=play(pack,attempts,location,{at:T0+set*600000,pinRegion:set%3?location.region:'B — R0'});
    }
    assert.ok(Object.values(next.slots).every(slot=>['pair','due','focus','world','top'].includes(slot.slot)));
  }
  // Exposures (shown, ungraded) are excluded too.
  const exposed=pack.locations.filter(location=>location.split!=='study').slice(0,100).map(location=>location.id);
  assert.ok(plan(pack,[],{seenLocationRefs:exposed}).locationIds.every(id=>!exposed.includes(id)));
  assert.equal(locations.size,pack.locations.length);
});
test('publication refuses a study spot in a deal set',async()=>{
  const pack=world(),study=pack.locations.filter(location=>location.split==='study').slice(0,5);
  const set={mapMaking:{customCoordinates:study.map(location=>({lat:location.lat,lng:location.lng,panoId:location.panoId}))}};
  await assert.rejects(publishPracticeSet(pack,set,async()=>{throw Error('no request expected')},async()=>{}),/Study spots/);
});
test('posteriors: misses raise and hits lower the miss weight, recency halves it every 3 days, the session counts double',()=>{
  const pack=world(),[a,b,c]=pack.locations.filter(location=>location.region==='A — R0'&&location.split==='drill');
  let attempts=play(pack,[],a,{pinRegion:'A — R1',at:T0-6*DAY});
  let model=learnerModel(pack,attempts,T0);
  assert.ok(Math.abs(model.regions.get('A — R0').misses-0.25)<1e-9,'two half-lives old: 0.25');
  attempts=play(pack,attempts,b,{at:T0-60000});model=learnerModel(pack,attempts,T0);
  assert.ok(Math.abs(model.regions.get('A — R0').hits-SESSION_WEIGHT*0.5**(60000/(HALF_LIFE_DAYS*DAY)))<1e-9,'a hit in this session counts double');
  attempts=play(pack,attempts,c,{at:T0-30000,seconds:45});model=learnerModel(pack,attempts,T0);
  const slow=model.regions.get('A — R0');assert.ok(slow.hits<2*SESSION_WEIGHT&&slow.misses>0.25,'a slow right answer is part hit, part miss');
  // The pinned confusion is counted both ways.
  assert.ok(learnerModel(pack,play(pack,[],a,{pinRegion:'A — R1'}),T0).confusions.get('A — R1')>0);
  // Beta draws are seeded and in [0, 1].
  const r1=seeded(4),r2=seeded(4);assert.equal(betaSample(2,5,r1),betaSample(2,5,r2));
  const draws=Array.from({length:2000},()=>betaSample(9,1,seeded(Math.random()*1e9)));assert.ok(draws.reduce((s,v)=>s+v,0)/draws.length>0.85);
});
test('confusion fires on the very next set: a fresh spot of the true region and of the region pinned instead',()=>{
  const pack=world({focus:'B'}),first=pack.locations.find(location=>location.region==='C — R1'&&location.split==='drill');
  const attempts=play(pack,[],first,{pinRegion:'C — R2'});
  const next=plan(pack,attempts),locations=byId(pack);
  const pair=next.locationIds.filter(id=>next.slots[id].slot==='pair').map(id=>locations.get(id).region);
  assert.deepEqual(pair.sort(),['C — R1','C — R2']);
  assert.ok(!next.locationIds.includes(first.id));
  // Once both regions were played again, the pair is no longer forced.
  const later=play(pack,play(pack,attempts,locations.get(next.locationIds.find(id=>locations.get(id).region==='C — R1'))),locations.get(next.locationIds.find(id=>locations.get(id).region==='C — R2')));
  assert.ok(!Object.values(plan(pack,later).slots).some(slot=>slot.slot==='pair'));
});
test('retest timing: due in the next set, then the next day, then 3 days after the miss; a retest miss restarts it',()=>{
  const pack=world(),spots=pack.locations.filter(location=>location.region==='A — R0'&&location.split==='drill');
  const missAt=T0;let attempts=play(pack,[],spots[0],{pinRegion:'A — R1',at:missAt});
  const state=(now,list=attempts)=>retests(pack,list,now).find(item=>item.kind==='region'&&item.key==='A — R0');
  assert.deepEqual([state(missAt+60000).stage,state(missAt+60000).due],[1,true]);
  attempts=play(pack,attempts,spots[1],{at:missAt+5*60000});
  const day=new Date(missAt);day.setHours(0,0,0,0);const nextDay=day.getTime()+RETEST_DAYS[0]*DAY;
  assert.deepEqual([state(missAt+10*60000).stage,state(missAt+10*60000).due],[2,false]);
  assert.equal(state(nextDay).due,true);
  // A hit before the next day does not advance the step.
  assert.equal(state(nextDay,play(pack,attempts,spots[2],{at:missAt+20*60000})).stage,2);
  attempts=play(pack,attempts,spots[2],{at:nextDay+3600e3});
  assert.equal(state(nextDay+2*3600e3).stage,3);assert.equal(state(nextDay+2*3600e3).due,false);
  assert.equal(state(day.getTime()+RETEST_DAYS[1]*DAY).due,true);
  const done=play(pack,attempts,spots[3],{at:day.getTime()+RETEST_DAYS[1]*DAY+60000});
  assert.equal(state(T0+5*DAY,done),undefined,'three retests passed: closed');
  const restarted=play(pack,attempts,spots[3],{pinRegion:'A — R2',at:nextDay+5*3600e3});
  assert.equal(state(nextDay+6*3600e3,restarted).stage,1);
  // Duel losses are misses: their metas and region are due at once.
  const duel={...pack,duelLosses:[{id:'duel:1',occurredAt:new Date(T0-DAY).toISOString(),region:'B — R2',metaIds:['m:B2']}]};
  assert.deepEqual(retests(duel,[],T0).filter(item=>item.due).map(item=>item.kind+':'+item.key).sort(),['meta:m:B2','region:B — R2']);
});
test('due metas: at least two spots that show a due meta, from duel losses or misses',()=>{
  const pack={...world(),duelLosses:[{id:'duel:1',occurredAt:new Date(T0-DAY).toISOString(),metaIds:['m:C0','m:B1']}]};
  for(let seed=1;seed<20;seed++){
    const next=planDeal(pack,[],{now:T0,random:seeded(seed)}),locations=byId(pack);
    const due=next.locationIds.filter(id=>locations.get(id).metas.some(meta=>['m:C0','m:B1'].includes(meta.metaId)));
    assert.ok(due.length>=2,`seed ${seed}: ${due.length}`);
  }
});
test('composition: ≥1 focus spot, ≥2 world spots, ≤2 per country, one per region unless a contrast pair',()=>{
  const pack=world({acow:{A:0.4,B:0.3,C:0.2,D:0.1}});let attempts=[];const locations=byId(pack);
  for(let set=0;set<15;set++){
    const next=planDeal(pack,attempts,{now:T0+set*600000,random:seeded(100+set)}),picked=next.locationIds.map(id=>locations.get(id));
    assert.equal(picked.length,5);
    assert.ok(picked.some(location=>location.country==='A'),'focus');
    assert.ok(picked.filter(location=>location.country!=='A').length>=2,'world');
    const perCountry=Map.groupBy(picked,location=>location.country);assert.ok([...perCountry.values()].every(list=>list.length<=2),'country cap');
    const pairs=picked.filter(location=>next.slots[location.id].slot==='pair').map(location=>location.region);
    const regions=picked.map(location=>location.region);assert.equal(new Set(regions).size,regions.length,'one per region');
    assert.ok(pairs.length===0||pairs.length===2);
    for(const location of picked)attempts=play(pack,attempts,location,{at:T0+set*600000,pinRegion:set%2?location.region:Object.keys(pack.regions).find(name=>name!==location.region&&pack.regions[name].country===location.country)});
  }
});
test('fade: three fast right answers in a row make a region rarer; a slow or wrong one does not',()=>{
  const pack=world({acow:{A:1}}),spots=pack.locations.filter(location=>location.region==='A — R0'&&location.split==='drill');
  let attempts=[];for(const spot of spots.slice(0,3))attempts=play(pack,attempts,spot,{at:T0-3*DAY,seconds:6});
  assert.ok(fadedRegions(attempts).has('A — R0'));
  assert.ok(!fadedRegions(play(pack,attempts,spots[3],{seconds:40})).has('A — R0'));
  assert.ok(!fadedRegions(play(pack,attempts,spots[3],{pinRegion:'A — R1'})).has('A — R0'));
  const terms=plan(pack,attempts).candidates.find(item=>item.region==='A — R0').terms;assert.equal(terms.fade,FADE_WEIGHT);
});
test('weak regions are picked more: Thompson sampling follows the miss posterior',()=>{
  const pack=world({acow:{A:1},regionsPer:3}),locations=byId(pack);let attempts=[];
  const spots=region=>pack.locations.filter(location=>location.region===region&&location.split==='drill');
  for(const spot of spots('A — R0').slice(0,4))attempts=play(pack,attempts,spot,{pinRegion:'A — R1',at:T0-2*DAY});
  for(const spot of spots('A — R2').slice(0,4))attempts=play(pack,attempts,spot,{at:T0-2*DAY});
  const counts=new Map();
  for(let seed=0;seed<200;seed++){const next=planDeal({...pack,focus:null},attempts,{now:T0,random:seeded(seed),size:1});
    const region=locations.get(next.locationIds[0]).region;counts.set(region,(counts.get(region)??0)+1)}
  assert.ok((counts.get('A — R0')??0)>(counts.get('A — R2')??0)*2,JSON.stringify([...counts]));
});
test('planning is deterministic for a seed and linear in the pool (50,000 spots)',()=>{
  const pack=world({acow:Object.fromEntries(Array.from({length:50},(_,i)=>['C'+i,1/50])),regionsPer:4,drill:240,study:10});
  const attempts=pack.locations.filter(location=>location.split==='drill').slice(0,600).reduce((list,location,i)=>play(pack,list,location,{at:T0-i*60000,pinRegion:i%4?location.region:undefined}),[]);
  assert.ok(pack.locations.length>=50000);
  const start=performance.now(),one=planDeal(pack,attempts,{now:T0,random:seeded(9)}),elapsed=performance.now()-start;
  assert.deepEqual(one.locationIds,planDeal(pack,attempts,{now:T0,random:seeded(9)}).locationIds);
  assert.ok(elapsed<400,`${elapsed} ms`);
});
test('manual meta keys override the pin grade and survive a re-save',()=>{
  const pack=world(),location=pack.locations.find(item=>item.split==='drill'&&item.metas.length===2);
  const round={id:'training:g:1',location,round:1,gameId:'g',...gradeDeal(pack,location,{lat:location.lat,lng:location.lng},5)};
  let attempts=recordDeal(pack,[],round,{slot:{slot:'due',retest:true}});
  assert.deepEqual(attempts[0].metas.map(meta=>[meta.used,meta.source]),[[true,'auto'],[true,'auto']]);
  attempts=recordDeal(pack,attempts,round,{metaGrades:{[location.metas[0].metaId]:false}});
  assert.equal(attempts.length,1);assert.deepEqual(attempts[0].metas[0],{metaId:location.metas[0].metaId,used:false,source:'manual'});
  assert.equal(attempts[0].slot,'due');assert.equal(attempts[0].retest,true);
  assert.deepEqual(recordDeal(pack,attempts,round)[0].metas[0].source,'manual');
  // A meta the learner did not notice is due at once.
  assert.ok(retests(pack,attempts,T0+DAY).some(item=>item.kind==='meta'&&item.key===location.metas[0].metaId&&item.due));
});
test('tiles, session check and its recommendation',()=>{
  const pack=world();let attempts=[];const drills=pack.locations.filter(location=>location.split==='drill');
  // 40 rounds over 60 minutes without a break, accuracy falling from 90% to 30%.
  drills.slice(0,40).forEach((location,i)=>{attempts=play(pack,attempts,location,{at:T0-60*60000+i*90000,pinRegion:(i<20?i%10===0:i%10<7)?drills[(i+20)%drills.length].region:location.region,
    slot:i%5===0?{slot:'due',retest:true}:{slot:'world',retest:false}})});
  const now=T0-60*60000+40*90000,session=currentSession(attempts,now);
  assert.equal(session.rounds.length,40);assert.ok(session.activeMinutes>=55);
  const check=sessionCheck(attempts,now);assert.equal(check.advice.kind,'break');assert.equal(check.progress.n,40);
  assert.ok(check.progress.lateRate<check.progress.earlyRate);
  assert.equal(checkDue(attempts,now-5*60000,now),false);assert.equal(checkDue(attempts,now-16*60000,now),true);
  const tiles=dealTiles(attempts,{now});assert.equal(tiles.n,40);assert.equal(tiles.fixN,8);assert.ok(tiles.points>0&&tiles.pointsSe>0);
  assert.equal(sessionCheck(attempts.slice(0,8),T0-60*60000+8*90000).advice.kind,'continue');
});
test('the checked-in sample pack validates and deals a set',async()=>{
  const pack=JSON.parse(await readFile(new URL('../../fixtures/training-sample-pack.json',import.meta.url),'utf8'));
  validatePack(pack);
  const set=makeNextSet(pack,[],{size:5,random:seeded(3),now:T0});
  assert.equal(set.selectedLocations.length,5);assert.ok(set.selectedLocations.every(location=>location.split!=='study'));
});
