import test from 'node:test';import assert from 'node:assert/strict';import {updatedPack} from '../next-set.mjs';
test('bundled content upgrades the same pack identity without touching observation storage',()=>{
 const old={id:'topic',contentRevision:3},current={id:'topic',contentRevision:4};assert.equal(updatedPack(old,current),current);assert.equal(updatedPack(null,current),current);assert.deepEqual(old,{id:'topic',contentRevision:3});
});
test('another country and a newer custom pack are preserved',()=>{
 const bundled={id:'Australia',contentRevision:4},other={id:'Philippines',contentRevision:1},newer={id:'Australia',contentRevision:5};assert.equal(updatedPack(other,bundled),other);assert.equal(updatedPack(newer,bundled),newer);
});
test('content updates preserve the learner-owned practice map',()=>{
 const stored={id:'Australia',contentRevision:4,practiceMapId:'111111111111111111111111'};
 const bundled={id:'Australia',contentRevision:5,practiceMapId:'222222222222222222222222',skills:['new']};
 const upgraded=updatedPack(stored,bundled);
 assert.equal(upgraded.practiceMapId,stored.practiceMapId);assert.deepEqual(upgraded.skills,['new']);
 assert.equal(stored.contentRevision,4);
});
