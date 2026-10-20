import test from 'node:test';
import assert from 'node:assert/strict';
import {stateFromGameData} from '../game-state.mjs';
import {completedRound} from '../session.mjs';

const location={panoId:'actual-pano_12',lat:1,lng:1};
const data={token:'new-game',map:'owned-map',round:2,rounds:[location,location,{panoId:'unguessed'}],player:{guesses:[{lat:1,lng:1},{lat:2,lng:2}]}};
const pack={id:'test',practiceMapId:'owned-map',locations:[{...location,id:'pano:actual-pano_12',skillIds:['clue']}],regionFeatures:[]};
test('a completed game response recovers the actual game and round without a round-start event',()=>{
 const state=stateFromGameData(data);
 assert.equal(state.current_game_id,'new-game');assert.equal(state.current_round,2);assert.equal(state.round_in_progress,false);
 assert.equal(completedRound(pack,state).gameId,'new-game');assert.equal(completedRound(pack,state).round,2);
 assert.equal(state.rounds.length,2);assert.equal(state.rounds[1].player_guess.lat,2);
});
test('raw and hex-encoded panorama identities both match the supplied clue',()=>{
 for(const panoId of [location.panoId,Buffer.from(location.panoId).toString('hex')]){
  const state=stateFromGameData({...data,rounds:[location,{...location,panoId}]});
  assert.equal(completedRound(pack,state).location.id,'pano:actual-pano_12');
 }
});
test('recovery never exposes future rounds or makes an unfinished or other-map round reviewable',()=>{
 const state=stateFromGameData({...data,round:3});
 assert.equal(state.rounds.length,2);assert.equal(state.round_in_progress,true);assert.equal(completedRound(pack,state),null);
 assert.equal(completedRound(pack,stateFromGameData({...data,map:'other-map'})),null);
 for(const invalid of [null,{}, {...data,round:0},{...data,round:6},{...data,player:{}}])assert.equal(stateFromGameData(invalid),null);
});
