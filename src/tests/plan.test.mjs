import test from 'node:test';
import assert from 'node:assert/strict';
import {makeNextSet,validatePack} from '../plan.mjs';
// Synthetic coordinates are test fixtures, never an exported teaching pack.
const mid='0123456789abcdef01234567';
const makePack=()=>{const skills=['A','B','C','D','E','F'].map(id=>({id,title:'Clue '+id,phase:'Mixed',prerequisites:[]}));return {id:'test',title:'Test topic',subject:'Any topic',skills,pools:[{id:mid,title:'Test',skillIds:skills.map(s=>s.id),mapUrl:`https://www.geoguessr.com/maps/${mid}`}],locations:skills.flatMap((s,j)=>[0,1,2].map(i=>({id:`pano:${s.id}${i}`,panoId:s.id+i,lat:j,lng:i,skillIds:[s.id],sourceMapId:mid})))}};
test('a next set contains actual supplied panoramas and valid map coordinates',()=>{
 const pack=makePack(); const set=makeNextSet(pack,[]);assert.equal(set.mapMaking.customCoordinates.length,5);assert.ok(set.selectedLocations.every(l=>pack.locations.includes(l)));assert.equal(new Set(set.focus.map(s=>s.id)).size,5);
});
test('no invented coordinates when data is unavailable',()=>{const pack=makePack();pack.locations=[];assert.throws(()=>makeNextSet(pack,[]),/different location-backed clue families/)});
test('cycle, unknown skill and invalid coordinates reject',()=>{
 for(const alter of [p=>p.skills[0].prerequisites=['A'],p=>p.locations[0].skillIds=['X'],p=>p.locations[0].lat=91]){const pack=makePack();alter(pack);assert.throws(()=>validatePack(pack))}
});
test('previously assessed panoramas are not the first selected practice locations',()=>{
 const pack=makePack();const set=makeNextSet(pack,[{id:'r',skillId:'A',occurredAt:'2026-01-01T00:00:00Z',mode:'assessment',correct:false,evidenceValid:false,unfamiliar:true,locationRef:'pano:A0',reason:'test',confidence:2}],{size:5});assert.ok(!set.selectedLocations.some(l=>l.panoId==='A0'));
});
test('skipped but exposed panoramas are avoided without inventing performance records',()=>{
 const pack=makePack();const results=[];const set=makeNextSet(pack,results,{seenLocationRefs:['pano:A0']});
 assert.ok(!set.selectedLocations.some(location=>location.panoId==='A0'));assert.deepEqual(results,[]);
});
test('unrecognized availability cannot accidentally activate unreviewed content',()=>{
 const pack=makePack();pack.skills[0].availability='needs-local-validation';assert.throws(()=>validatePack(pack),/Unknown skill availability/);
});
test('another country uses the same pack validator and selector without Australia-specific logic',()=>{
 const pack=makePack();pack.id='philippines-test-fixture';pack.title='Philippines fixture';pack.subject='Philippines';
 const set=makeNextSet(pack,[]);assert.equal(set.packId,pack.id);assert.equal(new Set(set.focus.map(s=>s.id)).size,5);assert.equal(set.selectedLocations.length,5);
});

test('too few clue families fail before a repeated-clue map can be produced',()=>{const p=makePack();p.skills.forEach(s=>s.practiceFamily='same');assert.throws(()=>makeNextSet(p,[]),/only 1/)});
