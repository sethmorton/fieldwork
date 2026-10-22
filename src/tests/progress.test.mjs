import {test} from 'node:test';
import assert from 'node:assert/strict';
import {progressTree} from '../progress.mjs';

const pack={id:'other-country',title:'Another country',skills:[
 {id:'a',title:'First clue',practiceFamily:'road-lines',prerequisites:[]},
 {id:'b',title:'Second clue',practiceFamily:'road-lines',prerequisites:[]},
 {id:'c',title:'Third clue',practiceFamily:'architecture',prerequisites:[]},
 {id:'d',title:'Missing locations',practiceFamily:'architecture',availability:'needs-locations',prerequisites:[]},
]};
const record=(skillId,i,extra={})=>({id:skillId+i,skillId,occurredAt:new Date(Date.UTC(2026,9,1+i)).toISOString(),correct:true,evidenceValid:true,confidence:2,unfamiliar:true,locationRef:'pano:'+skillId+i,mode:'assessment',feedbackSource:'explicit',...extra});
const now='2026-11-01T00:00:00Z';
test('progress tree groups the current pack without counting deferred targets or inventing an unlock sequence',()=>{
 const tree=progressTree(pack,[],now);
 assert.equal(tree.title,'Another country');assert.equal(tree.total,3);assert.equal(tree.deferred,1);assert.equal(tree.practised,0);
 assert.deepEqual(tree.families.map(f=>[f.id,f.nodes.map(n=>n.id)]),[['road-lines',['a','b']],['architecture',['c']]]);
 assert.ok(tree.families.flatMap(f=>f.nodes).every(n=>n.label==='Untouched'));
});
test('tree reflects new observations, assumed practice, mastery and due review using the existing evidence rules',()=>{
 const history=Array.from({length:20},(_,i)=>record('a',i));
 history.push(...Array.from({length:20},(_,i)=>record('b',i,{mode:'practice',feedbackSource:'assumed-on-advance'})));
 history.push(record('c',0,{correct:false,evidenceValid:false}));
 const before=JSON.stringify(history),tree=progressTree(pack,history,now),nodes=tree.families.flatMap(f=>f.nodes);
 assert.equal(tree.practised,3);assert.equal(tree.mastered,1);
 // Twenty daily successes give a long FSRS interval; an old miss is due. The tree shows the planner's due date.
 assert.equal(nodes[0].label,'Mastered');assert.equal(nodes[0].status.due,false);assert.equal(nodes[2].status.due,true);
 assert.equal(progressTree(pack,history,nodes[0].status.reviewDueAt).families[0].nodes[0].status.due,true);
 assert.equal(nodes[1].label,'Practising');assert.equal(nodes[1].assumed,20);assert.equal(nodes[1].status.eligibleCount,0);
 assert.equal(nodes[2].needsPractice,true);assert.equal(JSON.stringify(history),before);
 const updated=progressTree(pack,[...history,record('c',25)],now);
 assert.equal(updated.families[1].nodes[0].needsPractice,false);
});
test('future, invalid and other-pack observations cannot inflate tree progress',()=>{
 const tree=progressTree(pack,[record('a',40),record('b',0,{occurredAt:'invalid'}),record('unknown',0)],now);
 assert.equal(tree.practised,0);assert.equal(tree.mastered,0);
});
