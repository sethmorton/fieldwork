import test from 'node:test';
import assert from 'node:assert/strict';
import {report} from '../../relay/api/report.js';

const published={id:'worldwide',locations:[{id:'pano:abc',panoId:'abc',lat:60.7,lng:16.8,heading:90,skillIds:['s1']}],skills:[{id:'s1',title:'Sweden - Short outer lines'}]};
const findPack=async id=>id==='worldwide'?published:null;
function fakeGithub(openIssue){
  const calls=[];
  const api=async(path,init={})=>{calls.push({path,body:init.body&&JSON.parse(init.body)});
    if(path.startsWith('/search'))return Response.json({items:openIssue?[openIssue]:[]});
    return Response.json({html_url:'https://github.com/sethmorton/fieldwork/issues/99'},{status:201});};
  return {api,calls};
}
const valid={packId:'worldwide',locationId:'pano:abc',reason:'Clue not visible',note:'2025 pano @everyone `x`',version:'0.13.14.57',skillTitle:'spoofed'};

test('relay files a labelled issue named from the published pack, never from client text',async()=>{
  const {api,calls}=fakeGithub(null),result=await report(valid,{findPack,api});
  assert.equal(result.status,201);assert.equal(result.body.issue,'https://github.com/sethmorton/fieldwork/issues/99');
  const issue=calls.find(call=>call.path==='/repos/sethmorton/fieldwork/issues').body;
  assert.equal(issue.title,'Clue not visible: Sweden - Short outer lines');assert.deepEqual(issue.labels,['location']);
  assert.ok(issue.body.includes('pano=abc&heading=90')&&issue.body.includes('`pano:abc`'));
  assert.ok(!issue.body.includes('spoofed')&&!issue.body.includes('@everyone')&&issue.body.includes('> 2025 pano everyone x'));
});

test('a second report on an open issue becomes a comment, not a duplicate',async()=>{
  const {api,calls}=fakeGithub({number:7,html_url:'https://github.com/sethmorton/fieldwork/issues/7'}),result=await report(valid,{findPack,api});
  assert.equal(result.body.issue,'https://github.com/sethmorton/fieldwork/issues/7');
  assert.deepEqual(calls.map(call=>call.path.split('?')[0]),['/search/issues','/repos/sethmorton/fieldwork/issues/7/comments']);
});

test('unknown locations and reasons are refused before GitHub is touched',async()=>{
  for(const body of [{...valid,locationId:'pano:nope'},{...valid,packId:'other'},{...valid,reason:'spam'},null]){
    const {api,calls}=fakeGithub(null),result=await report(body,{findPack,api});
    assert.ok(result.status===400||result.status===404);assert.equal(calls.length,0);
  }
});
