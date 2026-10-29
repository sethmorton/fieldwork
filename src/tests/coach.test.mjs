import test from 'node:test';
import assert from 'node:assert/strict';
import {planSprint,warmupOn,modeLabel,ruleCheckFor,closeCall,dayChecks} from '../sprint.mjs';
import {contrast} from '../vegcard.mjs';
import {mostMissed} from '../drill.mjs';
// Ten regions (R0-R9), three panoramas each; R0 and R1 share an L2 family. Warm-up: R0-R5.
const skills=[...Array(10).keys()].map(i=>({id:'S'+i,title:'Region '+i,region:'R'+i,l2:i<2?'L0':'L'+i,why:'Vibe '+i,country:'US'+i}));
const base={id:'coach-test',title:'Coach',scheduler:'sprint',skills,
  locations:skills.flatMap(s=>[0,1,2].map(i=>({id:`${s.id}-${i}`,panoId:`p${s.id}${i}`,lat:0,lng:0,region:s.region,skillIds:[s.id]})))};
const coached={...base,warmup:['R0','R1','R2','R3','R4','R5'],contrasts:{}};
const T0='2026-10-20T18:00:00Z',T1='2026-10-21T18:00:00Z',T8='2026-10-28T18:00:00Z';
let n=0;
const at=(skill,correct,{loc=skill+'-0',time=T0,...extra}={})=>({id:'a'+n++,skillId:skill,occurredAt:time,correct,locationRef:loc,feedbackSource:'auto',...extra});
const misses=k=>[...Array(k)].map((_,i)=>at('S'+(6+i%4),false,{loc:`S${6+i%4}-${i%3}`}));
const spots=k=>[...Array(k)].map(()=>at('S9',true,{loc:'S9-0'}));

test('warm-up starts under 30% of the last 20 graded rounds and fades at 60%',()=>{
  assert.equal(warmupOn(coached,misses(19)),false,'fewer than 20 rounds never narrows');
  assert.equal(warmupOn(coached,misses(20)),true);
  assert.equal(warmupOn(coached,[...misses(14),...spots(6)]),false,'30% is not under 30%');
  assert.equal(warmupOn(coached,[...misses(20),...spots(11)]),true,'55% stays in warm-up');
  assert.equal(warmupOn(coached,[...misses(20),...spots(12)]),false,'60% widens back');
  assert.equal(modeLabel(coached,misses(20)),'Warm-up: 6 regions');
  assert.equal(modeLabel(coached,[]),'Full map');
  const regions=planSprint({...coached,contrasts:undefined},misses(20),{now:T0}).locationIds.map(id=>id.split('-')[0]);
  assert.ok(regions.every(id=>Number(id.slice(1))<6),regions.join());
});

test('a close pin needs warm-up and the true L2 family',()=>{
  const round=(guessedRegion,correct=false)=>({correct,guessedRegion,location:base.locations[0]});
  assert.equal(closeCall(coached,misses(20),round('R1')),true);
  assert.equal(closeCall(coached,misses(20),round('R2')),false);
  assert.equal(closeCall(coached,[],round('R1')),false,'no warm-up, no close');
  assert.equal(closeCall(coached,misses(20),round('R0',true)),false);
});

test('a miss on (A, B) is rule-checked on a different, unseen panorama within 3 rounds',()=>{
  const history=[...['S5','S6','S7','S8'].map(id=>at(id,true,{loc:id+'-0'})),at('S0',false,{loc:'S0-0',guessedRegion:'R1'})];
  const ids=planSprint(coached,history,{now:T0}).locationIds,index=ids.findIndex(id=>/^S[01]-/.test(id));
  assert.ok(index>=0&&index<3,ids.join());
  assert.notEqual(ids[index],'S0-0');
  const location=coached.locations.find(item=>item.id===ids[index]);
  assert.equal(ruleCheckFor(coached,history,location),'R0|R1');
  assert.equal(ruleCheckFor(coached,history,coached.locations[0]),null,'the missed panorama is no check');
  assert.equal(ruleCheckFor(coached,[...history,at('S1',true,{loc:'S1-1'})],coached.locations[1]),null,'one check clears the pair');
  assert.equal(ruleCheckFor(base,history,location),null,'packs without contrasts never rule-check');
});

test('a missed pair without a cached rule falls back to both vibe lines',()=>{
  const [a,b]=skills;
  assert.deepEqual(contrast(coached,a,b),{lines:['Region 0: Vibe 0','Region 1: Vibe 1'],features:[]});
  const ruled={...coached,contrasts:{'R0|R1':{rule:'Oaks = Region 0. Pines = Region 1.',features:{R0:['oak'],R1:['pine']}}}};
  assert.deepEqual(contrast(ruled,b,a),{lines:['Oaks = Region 0. Pines = Region 1.'],features:['pine']});
});

test('a later day opens with checks of missed regions: next day and a week on',()=>{
  const history=[at('S2',false,{loc:'S2-0'}),at('S3',true,{loc:'S3-0'})];
  assert.deepEqual(dayChecks(coached,history,Date.parse(T0)),[],'same day: no check');
  assert.deepEqual(dayChecks(coached,history,Date.parse(T1)),['S2']);
  const checked=[...history,at('S2',true,{loc:'S2-1',time:T1})];
  assert.deepEqual(dayChecks(coached,checked,Date.parse(T1)+3600e3),[],'one set a day');
  assert.deepEqual(dayChecks(coached,checked,Date.parse('2026-10-23T18:00:00Z')),[],'checked the next day, the week check waits');
  assert.deepEqual(dayChecks(coached,checked,Date.parse(T8)),['S2']);
  assert.equal(planSprint(coached,history,{now:T1}).locationIds[0],'S2-1','an unseen panorama of the missed region first');
  assert.deepEqual(mostMissed(coached,[...history,at('S4',false),at('S4',false)]).map(skill=>skill.id),['S4','S2']);
});

test('packs without warm-up or contrasts plan exactly as before',()=>{
  const plain=[...misses(20),at('S0',false,{loc:'S0-0',guessedRegion:'R1'})];
  const stripped=plain.map(({guessedRegion,...attempt})=>attempt);
  assert.deepEqual(planSprint(base,plain,{now:T1}),planSprint(base,stripped,{now:T1}));
  assert.equal(modeLabel(base,plain),null);
  assert.deepEqual(dayChecks(base,plain,Date.parse(T8)),[]);
  assert.equal(warmupOn(base,misses(20)),false);
});
