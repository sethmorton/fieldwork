import test from 'node:test';
import assert from 'node:assert/strict';
import './source-bridge.js';
const { normalizeCoordinate, uniqueCoordinates, exportTaggedPool } = globalThis.FieldworkSourceBridge;
const mapId = '0123456789abcdef01234567';
// Synthetic data is strictly a unit-test fixture, never a teaching dataset.
const a = {lat:1,lng:2,panoId:'test-a',heading:22};
const b = {lat:3,lng:4,panoId:'test-b'};
test('coordinate validation rejects missing or out-of-range coordinates and missing panorama IDs',()=>{
  for(const value of [null,{}, {...a,lat:NaN},{...a,lng:181},{...a,lat:91},{...a,panoId:''},{...a,lat:'1'}]) assert.equal(normalizeCoordinate(value),null);
  assert.deepEqual(normalizeCoordinate(a),a);
});
test('duplicate panoramas collapse, distinct panoramas remain',()=> assert.equal(uniqueCoordinates([a,a,b,null]).length,2));
test('tag attribution comes only from public note metadata',async()=>{
  const p = await exportTaggedPool({mapId,title:'Test',coordinates:[a,b],getMeta:async id=>({metaName:id==='test-a'?'Clue A':'Clue B',images:['https://example.com/a.jpg','javascript:bad'],note:'Example',footer:'Credit'})});
  assert.equal(p.skills.length,2);assert.equal(p.locations.length,2);assert.equal(p.locations[0].skillIds[0],`${mapId}:Clue A`);assert.equal(p.skills[0].imageUrls.length,1);assert.equal(p.skills[0].attributionHtml,'Credit');assert.equal(p.pools[0].locationIds.length,2);
});
test('missing tags and request errors do not become guessed metadata',async()=>{
  const p=await exportTaggedPool({mapId,coordinates:[a,b],getMeta:async id=>{if(id==='test-a')return null;throw Error('failed')}});
  assert.equal(p.locations.length,0);assert.equal(p.importReport.unmatched.length,1);assert.equal(p.importReport.failures.length,1);
});
test('cancellation produces an explicit partial report',async()=>{
  let stop=false;const p=await exportTaggedPool({mapId,coordinates:[a,b],getMeta:async()=>({metaName:'A'}),onProgress:()=>{stop=true},cancelled:()=>stop});
  assert.equal(p.locations.length,1);assert.equal(p.importReport.cancelled,true);
});
test('invalid map IDs reject before any network request',async()=>{await assert.rejects(exportTaggedPool({mapId:'bad',coordinates:[a],getMeta:async()=>{throw Error('should not be called')}}),/valid GeoGuessr/)});
