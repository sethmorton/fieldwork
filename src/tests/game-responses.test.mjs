import test from 'node:test';
import assert from 'node:assert/strict';
import {observeGameResponses} from '../game-responses.mjs';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('native absolute, relative, URL and Request inputs are observed without extra requests or consuming the response',async()=>{
  const seen=[],calls=[],body={token:'game',round:1};let originalPromise;
  const target={fetch(...args){calls.push(args);originalPromise=Promise.resolve(new Response(JSON.stringify(body)));return originalPromise}};
  observeGameResponses(target,data=>seen.push(data));
  for(const input of ['https://www.geoguessr.com/api/v3/games/game','/api/v3/games/game',new URL('https://www.geoguessr.com/api/v3/games'),new Request('https://www.geoguessr.com/api/v3/games/game')]){
    const promise=target.fetch(input,{method:'POST'});assert.equal(promise,originalPromise);
    assert.deepEqual(await(await promise).json(),body);await flush();
  }
  assert.equal(calls.length,4);assert.equal(seen.length,4);assert.ok(calls.every(args=>args[1].method==='POST'));
});
test('unrelated origins and API routes are untouched, and multiple listeners share one observer',async()=>{
  let calls=0;const first=[],second=[],target={fetch(){calls++;return Promise.resolve(new Response('{"round":1}'))}};
  observeGameResponses(target,data=>first.push(data));const wrapped=target.fetch;
  observeGameResponses(target,data=>second.push(data));assert.equal(target.fetch,wrapped);
  for(const input of ['https://example.com/api/v3/games/game','/api/v4/user-maps/drafts/map','/api/v3/games/game/other'])await target.fetch(input);
  await flush();assert.equal(first.length,0);assert.equal(second.length,0);
  await target.fetch('/api/v3/games/game');await flush();assert.equal(calls,4);assert.equal(first.length,1);assert.equal(second.length,1);
});
