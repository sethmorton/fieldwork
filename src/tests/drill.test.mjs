import test from 'node:test';
import assert from 'node:assert/strict';
import {drillKey,setRecap,sessionBar} from '../drill.mjs';

const skills='ABCDE'.split('').map(id=>({id,title:id}));
const pack={id:'p',skills};
const at=(n,skillId,grade,source='explicit')=>({id:`p:g:${n}`,skillId,occurredAt:new Date().toISOString(),feedbackSource:source,
  correct:grade!=='missed',evidenceValid:grade!=='missed',...(grade==='knew'?{grade:'easy'}:{})});

test('drill keys: 1/2/3 grade, C or Enter continue only at round 5, never while typing or with modifiers',()=>{
  const key=(key,extra={})=>({key,target:{tagName:'BODY'},...extra});
  assert.deepEqual(['1','2','3'].map(k=>drillKey(key(k),2)),['missed','spotted','knew']);
  assert.equal(drillKey(key('Enter'),4),null);
  assert.equal(drillKey(key('Enter'),5),'continue');
  assert.equal(drillKey(key('C'),5),'continue');
  assert.equal(drillKey(key('1',{target:{tagName:'INPUT'}}),2),null);
  assert.equal(drillKey(key('1',{metaKey:true}),2),null);
});

test('set recap: misses first, then round order; the ungraded current round is included',()=>{
  const attempts=[at(1,'A','spotted'),at(2,'B','missed'),at(3,'C','knew','assumed-on-advance'),at(4,'D','missed')];
  const rows=setRecap(pack,attempts,{gameId:'g',round:5,location:{skillIds:['E']}});
  assert.deepEqual(rows.map(row=>[row.skill.id,row.grade]),[['B','missed'],['D','missed'],['A','spotted'],['C',null],['E',null]]);
});

test('session bar restarts the block after 30 idle minutes and suggests a break after 25',()=>{
  const data=new Map(),store={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)},t=Date.parse('2026-10-26T10:00:00Z');
  assert.match(sessionBar(pack,[],{now:t,store}).text,/Block 0:00/);
  assert.equal(sessionBar(pack,[],{now:t+26*60e3,store}).rest,true);
  const back=sessionBar(pack,[],{now:t+60*60e3,store});
  assert.equal(back.rest,false,'34 idle minutes restart the block');
  assert.match(back.text,/Block 0:00/);
});
