import test from 'node:test';
import assert from 'node:assert/strict';
import {syncUrl,syncPayload,createSync} from '../training-sync.mjs';

test('progress is synced only to a local installer',()=>{
  assert.equal(syncUrl({manifestUrl:'http://127.0.0.1:8787/catalog.json'}),'http://127.0.0.1:8787/training-sync');
  assert.equal(syncUrl({manifestUrl:'http://localhost:8791/catalog.json'}),'http://localhost:8791/training-sync');
  assert.equal(syncUrl({manifestUrl:'https://sethmorton.github.io/fieldwork/catalog.json'}),null);
  assert.equal(syncUrl(undefined),null);assert.equal(syncUrl({manifestUrl:'not a url'}),null);
});
test('the payload is the pack id with every attempt and exposure, in the shape the installer accepts',()=>{
  const attempts=[{id:'training:g:1',occurredAt:'2026-11-03T10:00:00.000Z',country:'Brazil',points:4200}],exposures=[{id:'training:g:1',locationRef:'pano:x'}];
  assert.deepEqual(JSON.parse(syncPayload('training',attempts,exposures)),{packId:'training',attempts,exposures});
});
test('sends are debounced, built at send time, and failures never surface',async()=>{
  const timers=[],sent=[];let built=0;
  const sync=createSync(payload=>{sent.push(payload);return Promise.reject(Error('installer down'))},
    {delay:3000,timer:(fn,ms)=>{timers.push({fn,ms,live:true});return timers.length-1},clear:id=>{if(id!=null)timers[id].live=false}});
  sync.schedule(()=>++built);sync.schedule(()=>++built);sync.schedule(()=>++built);
  assert.equal(timers.filter(timer=>timer.live).length,1);assert.equal(built,0,'nothing built until it is sent');
  timers.find(timer=>timer.live).fn();await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(sent,[1]);
  // A send that throws synchronously is swallowed too.
  const throwing=createSync(()=>{throw Error('no GM')},{timer:fn=>{fn();return 0},clear(){}});
  assert.doesNotThrow(()=>throwing.schedule(()=>({})));
});
