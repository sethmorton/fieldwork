import test from 'node:test';
import assert from 'node:assert/strict';
import {createKeyGuard} from '../key-guard.mjs';
import {boardSpots} from '../boards.mjs';
import {validatePack,makeNextSet} from '../next-set.mjs';

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

const region=(name,country,lat)=>({type:'Feature',properties:{name,country},geometry:{type:'Polygon',coordinates:[[[0,lat],[1,lat],[1,lat+1],[0,lat+1],[0,lat]]]}});
function pack(spots){
  const regions={'X — A':{country:'X'},'X — B':{country:'X'},Y:{country:'Y'}};
  const locations=Object.entries(spots).flatMap(([name,splits])=>splits.map((split,i)=>({id:`pano:${name}-${split}-${i}`,panoId:`${name}-${split}-${i}`,lat:0.5,lng:0.5,
    skillIds:['s:'+name],country:regions[name].country,region:name,split,metas:[]})));
  return {id:'training',title:'T',subject:'G',scheduler:'deal',regions,regionFeatures:[region('X — A','X',0),region('X — B','X',2),region('Y','Y',4)],metas:{},
    skills:Object.keys(regions).map(name=>({id:'s:'+name,title:name,phase:'Regions',prerequisites:[]})),locations};
}
test('a board always has four photos: study, then seen, then burned drill spots, then the rest of the country',()=>{
  const p=pack({'X — A':['study','seen','drill','drill','drill'],'X — B':['study','study','study'],Y:['study','study','study','study']});
  validatePack(p);
  const one=boardSpots(p,'X — A',{random:()=>0.5});
  assert.deepEqual(one.spots.map(spot=>spot.split),['study','seen','drill','drill']);
  assert.equal(one.burned.length,2);assert.ok(one.burned.every(id=>id.includes('-drill-')));
  // A panorama the learner already played counts as seen (no burn), and the round's own spot and the set are excluded.
  const played=p.locations.find(location=>location.split==='drill').id,next=p.locations.filter(location=>location.split==='drill')[1].id;
  const two=boardSpots(p,'X — A',{seen:new Set([played]),exclude:new Set([next]),random:()=>0.5});
  assert.ok(two.spots.some(spot=>spot.id===played)&&!two.spots.some(spot=>spot.id===next));
  assert.deepEqual(two.burned.length,1);
  // Look boards never burn: they fall back to the country instead.
  const look=boardSpots(p,'X — A',{burn:false,random:()=>0.5});
  assert.equal(look.burned.length,0);assert.deepEqual(look.spots.map(spot=>spot.region),['X — A','X — A','X — B','X — B']);
  // Fewer than four only when the whole country has fewer.
  assert.equal(boardSpots(pack({'X — A':['study'],'X — B':[],Y:['study','study','study','study']}),'X — A').spots.length,1);
});
test('seen spots are card material only: never dealt into a game',()=>{
  const p=pack({'X — A':['seen','seen','seen','drill','drill','drill'],'X — B':['seen','drill','drill'],Y:['seen','drill','drill','probe']});
  p.acow={X:0.6,Y:0.4};p.focus={country:'X'};
  const set=makeNextSet(p,[],{size:5,random:()=>0.3});
  assert.ok(set.selectedLocations.every(location=>location.split!=='seen'&&location.split!=='study'));
});
