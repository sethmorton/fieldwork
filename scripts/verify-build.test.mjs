import test from 'node:test';
import assert from 'node:assert/strict';
import {checkHostedContent} from './verify-build.mjs';
import {contentHash} from '../src/content-format.mjs';
test('the build rejects a public pack that is missing, hosted too old, or whose body disagrees with its manifest',async()=>{
  const body=JSON.stringify({id:'au',contentRevision:3}),entry={id:'au',contentRevision:3,url:'pack-au.json',sha256:await contentHash(body)};
  const read=async()=>body,publicCatalog=[{id:'au',minimumRevision:3}];
  assert.equal((await checkHostedContent(publicCatalog,{packs:[entry]},read)).length,1);
  await assert.rejects(checkHostedContent([...publicCatalog,{id:'ph',minimumRevision:1}],{packs:[entry]},read),/ph is in the public catalog but not/);
  await assert.rejects(checkHostedContent([{id:'au',minimumRevision:4}],{packs:[entry]},read),/below 4/);
  await assert.rejects(checkHostedContent(publicCatalog,{packs:[{...entry,sha256:'0'.repeat(64)}]},read),/hash/);
  const older=JSON.stringify({id:'au',contentRevision:2});
  await assert.rejects(checkHostedContent(publicCatalog,{packs:[{...entry,sha256:await contentHash(older)}]},async()=>older),/revision does not match/);
});
