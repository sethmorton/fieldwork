import test from 'node:test';
import assert from 'node:assert/strict';
import {mergePacks,packForPage} from '../packs.mjs';
const auMap='111111111111111111111111',phMap='222222222222222222222222';
const make=(id,map,revision=1)=>({id,title:id,subject:id,contentRevision:revision,practiceMapId:map,skills:[{id:id+':clue',title:'Clue',phase:'Mixed',prerequisites:[]}],pools:[],locations:[]});
test('adding a country preserves legacy Australia binding and keeps separate progress identities',()=>{
 const old=make('au',auMap),before=JSON.stringify(old);
 const packs=mergePacks(null,old,[make('au','333333333333333333333333',2),make('ph',phMap)]);
 assert.equal(packs.length,2);assert.equal(packs[0].practiceMapId,auMap);assert.equal(packs[0].contentRevision,2);
 assert.equal(packs[1].id,'ph');assert.equal(JSON.stringify(old),before);
 assert.deepEqual(mergePacks(packs,old,[make('au',auMap,2),make('ph',phMap)]),packs);
});
test('stored custom packs survive upgrades and different countries cannot share a writable map',()=>{
 const custom=make('custom','444444444444444444444444');
 assert.ok(mergePacks([custom],null,[make('au',auMap)]).includes(custom));
 assert.throws(()=>mergePacks([],null,[make('au',auMap),make('ph',auMap)]),/cannot share/);
 assert.throws(()=>mergePacks([],null,[make('ph','000000000000000000000000')]),/dedicated/);
});
test('map URLs and matching game responses select the right pack without switching on stale games',()=>{
 const packs=[make('au',auMap),make('ph',phMap)],state={current_game_id:'current',map:{id:phMap}};
 assert.equal(packForPage(packs,'/maps/'+phMap,state).id,'ph');
 assert.equal(packForPage(packs,'/map-maker/'+auMap,state).id,'au');
 assert.equal(packForPage(packs,'/game/current',state).id,'ph');
 assert.equal(packForPage(packs,'/game/other',state),null);
 assert.equal(packForPage(packs,'/maps/555555555555555555555555',state),null);
});
