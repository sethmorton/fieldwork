import test from 'node:test';
import assert from 'node:assert/strict';
import {createKeyGuard} from '../key-guard.mjs';
import {boardSpots,boardHistory} from '../boards.mjs';
import {validatePack,makeNextSet} from '../next-set.mjs';
import {gameInProgress,completedRound,readySet} from '../session.mjs';
import {stateFromGameData} from '../game-state.mjs';
import {recordDeal,retests} from '../deal.mjs';
import {cropFocus} from '../training-ui.mjs';
import {geometryRings} from '../region-map.mjs';

const key=(type,code)=>({type,code,key:code===' '?' ':code,stopped:false,prevented:false,
  stopImmediatePropagation(){this.stopped=true},preventDefault(){this.prevented=true}});
test('keys never leak to GeoGuessr while a card is open, nor the keyup of the key that closed it',()=>{
  const guard=createKeyGuard(),seen=[];let alive=true;
  const handler=event=>{seen.push(event.code);return ['Space','Escape','ArrowLeft','KeyU'].includes(event.code)};
  guard.open(handler,()=>alive);
  for(const code of ['Space','Escape','ArrowLeft','KeyU','KeyQ','Digit1'])for(const type of ['keydown','keypress','keyup']){
    const event=key(type,code);guard.guard(event);
    assert.equal(event.stopped,true,`${type} ${code} stopped`);
    assert.equal(event.prevented,type!=='keydown'||['Space','Escape','ArrowLeft','KeyU'].includes(code),`${type} ${code} default`);
  }
  assert.deepEqual(seen,['Space','Escape','ArrowLeft','KeyU','KeyQ','Digit1'],'the card sees every keydown');
  // Space closes the card on keydown; its keypress and keyup arrive after the card is gone and are still swallowed.
  const down=key('keydown','Space');guard.guard(down);guard.close(handler);
  for(const type of ['keypress','keyup']){const event=key(type,'Space');guard.guard(event);assert.equal(event.stopped,true,type)}
  // Then GeoGuessr's own Space (next round) works normally.
  for(const type of ['keydown','keypress','keyup']){const event=key(type,'Space');guard.guard(event);assert.equal(event.stopped,false);assert.equal(event.prevented,false)}
  // An overlay removed without close() releases the guard at the next key.
  guard.open(handler,()=>alive);alive=false;const late=key('keydown','KeyN');guard.guard(late);assert.equal(late.stopped,false);assert.equal(guard.active,false);
});
test('a held key acts once: its auto-repeat never reaches GeoGuessr after the card it closed',()=>{
  const guard=createKeyGuard(),handler=()=>true;guard.open(handler);
  guard.guard(key('keydown','Space'));guard.close(handler);
  const repeat={...key('keydown','Space'),repeat:true};guard.guard(repeat);assert.equal(repeat.stopped,true);assert.equal(repeat.prevented,true);
  const up=key('keyup','Space');guard.guard(up);assert.equal(up.stopped,true);
  const fresh=key('keydown','Space');guard.guard(fresh);assert.equal(fresh.stopped,false,'a new press is GeoGuessr\'s');
});

const region=(name,country,lat)=>({type:'Feature',properties:{name,country},geometry:{type:'Polygon',coordinates:[[[0,lat],[1,lat],[1,lat+1],[0,lat+1],[0,lat]]]}});
function pack(spots){
  const regions={'X — A':{country:'X'},'X — B':{country:'X'},Y:{country:'Y'}};
  const locations=Object.entries(spots).flatMap(([name,splits])=>splits.map((split,i)=>({id:`pano:${name}-${split}-${i}`,panoId:`${name}-${split}-${i}`,lat:0.5,lng:0.5,
    skillIds:['s:'+name],country:regions[name].country,region:name,split,metas:[]})));
  return {id:'training',title:'T',subject:'G',scheduler:'deal',regions,regionFeatures:[region('X — A','X',0),region('X — B','X',2),region('Y','Y',4)],metas:{},
    skills:Object.keys(regions).map(name=>({id:'s:'+name,title:name,phase:'Regions',prerequisites:[]})),locations};
}
test('a board has four photos: fresh study, then burned drill spots, then seen (duel/Sprint), then the rest of the country',()=>{
  const p=pack({'X — A':['study','seen','drill','drill','drill'],'X — B':['study','study','study'],Y:['study','study','study','study']});
  validatePack(p);
  const one=boardSpots(p,'X — A',{random:()=>0.5});
  assert.deepEqual(one.spots.map(spot=>spot.split),['study','drill','drill','drill']);
  assert.equal(one.burned.length,3);assert.ok(one.burned.every(id=>id.includes('-drill-')));
  // The round's own spot and the in-flight set are excluded; then 'seen' fills in before the country.
  const drills=p.locations.filter(location=>location.split==='drill').map(location=>location.id);
  const two=boardSpots(p,'X — A',{exclude:new Set(drills.slice(0,2)),random:()=>0.5});
  assert.deepEqual(two.spots.map(spot=>spot.split),['study','drill','seen','study']);assert.equal(two.spots[3].region,'X — B');
  // Look boards never burn: study, then seen, then the country.
  const look=boardSpots(p,'X — A',{burn:false,random:()=>0.5});
  assert.equal(look.burned.length,0);assert.deepEqual(look.spots.map(spot=>[spot.region,spot.split]),[['X — A','study'],['X — A','seen'],['X — B','study'],['X — B','study']]);
  // Fewer than four only when the whole country has fewer.
  assert.equal(boardSpots(pack({'X — A':['study'],'X — B':[],Y:['study','study','study','study']}),'X — A').spots.length,1);
});
test('a board never shows a panorama played or shown as a training round; earlier board burns are reused',()=>{
  const p=pack({'X — A':['study','drill','drill','drill','drill','seen'],'X — B':['study','study'],Y:['study']});
  const [study,played1,played2,burnedBefore,fresh]=p.locations;
  const attempts=[{locationRef:played1.id}],exposures=[{id:'training:g:2',locationRef:played2.id},{id:'training:board:'+burnedBefore.id,locationRef:burnedBefore.id}];
  const history=boardHistory(attempts,exposures);
  assert.deepEqual([...history.played].sort(),[played1.id,played2.id].sort());assert.deepEqual([...history.burned],[burnedBefore.id]);
  for(const burn of [true,false]){
    const {spots,burned}=boardSpots(p,'X — A',{...history,burn,random:()=>0.5});
    assert.ok(!spots.some(spot=>spot.id===played1.id||spot.id===played2.id),'played panoramas never on a board');
    assert.ok(spots.slice(0,2).map(spot=>spot.id).includes(burnedBefore.id),'an earlier burn is card material');assert.ok(spots.includes(study));
    assert.ok(!burned.includes(burnedBefore.id));if(burn)assert.deepEqual(burned,[fresh.id]);
  }
});
test('board order within a group: verified magnifier, verified none, unverified; rural before unclassified; never urban or a bad thumb',()=>{
  const p=pack({'X — A':['study','study','study','study','study','study','study'],'X — B':['study'],Y:['study']});
  const [plain,none,magnifier,ruralPlain,urban,badThumb,nullPlain]=p.locations;
  magnifier.verified=true;magnifier.metas=[{metaId:null,what:'pole bands',box:[0.1,0.1,0.2,0.3]}];none.verified=true;
  ruralPlain.rural=true;plain.rural=null;nullPlain.rural=null;urban.rural=false;urban.verified=true;badThumb.thumbOk=false;badThumb.verified=true;
  const {spots}=boardSpots(p,'X — A',{random:()=>0.5});
  assert.deepEqual(spots.map(spot=>spot.id),[magnifier.id,none.id,ruralPlain.id,plain.id]);
  assert.ok(!boardSpots(p,'X — A',{n:10,random:()=>0.5}).spots.some(spot=>spot===urban||spot===badThumb));
});
test('seen spots are card material only: never dealt into a game',()=>{
  const p=pack({'X — A':['seen','seen','seen','drill','drill','drill'],'X — B':['seen','drill','drill'],Y:['seen','drill','drill','probe']});
  p.acow={X:0.6,Y:0.4};p.focus={country:'X'};
  const set=makeNextSet(p,[],{size:5,random:()=>0.3});
  assert.ok(set.selectedLocations.every(location=>location.split!=='seen'&&location.split!=='study'));
});
test('nothing is published while a game on the practice map is between rounds 1 and 5',()=>{
  const map='0123456789abcdef01234567',at=(round,inProgress,game='g1')=>({current_game_id:game,map:{id:map},current_round:round,round_in_progress:inProgress});
  for(const [round,inProgress] of [[1,true],[1,false],[2,true],[4,false],[5,true]])assert.equal(gameInProgress('/game/g1',at(round,inProgress),map),true,`${round} ${inProgress}`);
  assert.equal(gameInProgress('/game/g1',at(5,false),map),false,'after round 5');
  assert.equal(gameInProgress('/game/g1',null,map),true,'unknown state');
  assert.equal(gameInProgress('/game/g1',at(2,true,'other'),map),true,'a state of another game');
  assert.equal(gameInProgress('/maps/'+map,null,map),false);assert.equal(gameInProgress('/results/g1',null,map),false);
});
test('a timed-out round is a miss with no guess location, no distance and no points',()=>{
  const p={...pack({'X — A':['drill','study'],'X — B':['study'],Y:['study']}),practiceMapId:'0123456789abcdef01234567'},spot=p.locations[0];
  // GeoGuessr's data: guess at 0,0 with timedOut, and the next round already added.
  const state=stateFromGameData({token:'g',map:p.practiceMapId,round:2,rounds:[{lat:spot.lat,lng:spot.lng,panoId:spot.panoId},{lat:1,lng:1,panoId:'next'}],
    player:{guesses:[{lat:0,lng:0,timedOut:true,timedOutWithGuess:false,time:60}]}});
  assert.equal(state.rounds[0].player_guess.timedOut,true);
  const round=completedRound(p,{...state,current_round:1,round_in_progress:false},[spot.id]);
  assert.deepEqual([round.timedOut,round.correct,round.guess,round.km,round.points,round.guessedRegion],[true,false,null,null,0,null]);
  // A bare 0,0 guess (the event framework's view of a timeout) is the same.
  const bare=completedRound(p,{map:{id:p.practiceMapId},current_game_id:'g',current_round:1,round_in_progress:false,rounds:[{location:{panoId:spot.panoId},player_guess:{lat:0,lng:0}}]},[]);
  assert.equal(bare.timedOut,true);
  const attempts=recordDeal(p,[],round);
  assert.deepEqual([attempts[0].timedOut,attempts[0].correct,attempts[0].guess,attempts[0].points],[true,false,null,0]);
  assert.ok(retests(p,attempts,Date.now()+60000).some(item=>item.kind==='region'&&item.key==='X — A'&&item.due),'the region is retested');
});
test('photos crop toward their meta boxes: the focus is the middle of the boxes\' union',()=>{
  assert.deepEqual(cropFocus([]),[0.5,0.5]);
  assert.deepEqual(cropFocus([[0,0.4,0.06,0.5]]),[0.03,0.65]);
  assert.deepEqual(cropFocus([[0.1,0.2,0.1,0.1],[0.7,0.6,0.2,0.2]]).map(value=>+value.toFixed(3)),[0.5,0.5]);
});
test('a meta footprint can be any GeoJSON shape: its rings are drawn over the country map',()=>{
  const square=(x)=>[[x,0],[x+1,0],[x+1,1],[x,1],[x,0]];
  assert.equal(geometryRings({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Polygon',coordinates:[square(0)]}},
    {type:'Feature',geometry:{type:'MultiPolygon',coordinates:[[square(2)],[square(4),square(4.2)]]}}]}).length,4);
  assert.deepEqual(geometryRings(null),[]);assert.deepEqual(geometryRings({type:'Point',coordinates:[0,0]}),[]);
});
test('a placed but unplayed set stays the next set for 12 hours; a played, partial or stale one does not',()=>{
  const now=Date.parse('2026-11-03T12:00:00Z'),ids=['a','b','c','d','e'].map(id=>'pano:'+id);
  const set=(hours,locationIds=ids)=>({locationIds,preparedAt:new Date(now-hours*3600e3).toISOString()});
  assert.equal(readySet(set(1),[],[],now),true);
  assert.equal(readySet(set(11.9),[],[],now),true);
  assert.equal(readySet(set(12.1),[],[],now),false,'stale: replaced when the panel next opens');
  assert.equal(readySet(set(1),[{locationRef:'pano:c'}],[],now),false,'a round of it was played');
  assert.equal(readySet(set(1),[],[{id:'training:g:1',locationRef:'pano:e'}],now),false,'a round of it was shown');
  assert.equal(readySet(set(1,ids.slice(0,4)),[],[],now),false);assert.equal(readySet(null,[],[],now),false);
  assert.equal(readySet({locationIds:ids},[],[],now),false,'no placement time');
});
