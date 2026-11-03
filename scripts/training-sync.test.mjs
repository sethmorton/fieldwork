import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,readFile,readdir,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {syncTarget,parseSync,handleSync} from './training-sync.mjs';

const attempt={id:'training:g:1',occurredAt:'2026-11-03T10:00:00.000Z',country:'Brazil',points:4200,correct:true};
const body=JSON.stringify({packId:'training',attempts:[attempt],exposures:[{id:'training:g:1',locationRef:'pano:x'}]});

test('the sync target: WORLD_PACK_DATA, then config.worldPackData, then the training pack\'s folder, else none',()=>{
  assert.equal(syncTarget({},{WORLD_PACK_DATA:'/data'}),path.join('/data','training','attempts.json'));
  assert.equal(syncTarget({worldPackData:'/cfg'},{}),path.join('/cfg','training','attempts.json'));
  assert.equal(syncTarget({additionalPacks:[{packPath:'/x/sprint/pack.json'},{packPath:'/w/training/pack.json'}]},{}),path.join('/w/training','attempts.json'));
  assert.equal(syncTarget({packPath:'/x/pack.json'},{}),null);
});
test('only a training progress body is accepted',()=>{
  const parsed=parseSync(body);assert.equal(parsed.packId,'training');assert.deepEqual(parsed.attempts,[attempt]);assert.ok(parsed.syncedAt);
  for(const bad of ['nope','{}',JSON.stringify({packId:'sprint',attempts:[],exposures:[]}),JSON.stringify({packId:'training',attempts:[{id:1}],exposures:[]}),
    JSON.stringify({packId:'training',attempts:[{id:'a',occurredAt:'never'}],exposures:[]}),JSON.stringify({packId:'training',attempts:[],exposures:[{}]})])
    assert.equal(parseSync(bad),null,bad);
});
test('POST /training-sync writes attempts.json atomically; bad, oversized or off-loopback requests write nothing',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'fw-sync-')),target=path.join(dir,'training','attempts.json');await mkdir(path.dirname(target));
  const server=http.createServer((req,res)=>handleSync(req,res,target,{max:4096}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const post=data=>fetch(`http://127.0.0.1:${server.address().port}/training-sync`,{method:'POST',headers:{'Content-Type':'application/json'},body:data}).then(response=>response.status);
  try{
    assert.equal(await post(body),204);
    const saved=JSON.parse(await readFile(target,'utf8'));assert.deepEqual(saved.attempts,[attempt]);assert.equal(saved.exposures.length,1);
    assert.equal(await post('{"packId":"training"}'),400);
    assert.equal(await post(JSON.stringify({packId:'training',attempts:Array.from({length:200},(_,i)=>({...attempt,id:'a'+i})),exposures:[]})),413);
    assert.deepEqual(JSON.parse(await readFile(target,'utf8')).attempts,[attempt],'a refused request leaves the file as it was');
    assert.deepEqual((await readdir(path.dirname(target))).filter(name=>name.endsWith('.tmp')),[],'no temporary files left');
  }finally{server.close()}
  // Off loopback: refused before reading.
  let status;const res={writeHead:code=>{status=code},end(){}};
  await handleSync({socket:{remoteAddress:'10.0.0.7'},headers:{}},res,target);assert.equal(status,403);
  await handleSync({socket:{remoteAddress:'127.0.0.1'},headers:{}},res,null);assert.equal(status,404);
});
