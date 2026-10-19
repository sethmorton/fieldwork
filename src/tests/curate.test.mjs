import test from 'node:test';import assert from 'node:assert/strict';import {curatePool} from '../curate.mjs';
const mid='0123456789abcdef01234567';
const imported={id:'raw',title:'Raw',subject:'GeoGuessr',skills:[{id:'raw-a',title:'Real source name',phase:'Imported',prerequisites:[],sourceNoteHtml:'Source note',attributionHtml:'Original author'}],pools:[{id:mid,title:'Raw',skillIds:['raw-a'],mapUrl:`https://www.geoguessr.com/maps/${mid}`,locationIds:['pano:test']}],locations:[{id:'pano:test',panoId:'test',lat:1,lng:2,skillIds:['raw-a'],sourceMapId:mid}]};
test('curation maps source names to authored reusable skill IDs and keeps attribution',()=>{const p=curatePool(imported,{id:'topic',title:'Any topic',subject:'GeoGuessr',initialSkillIds:['new-a'],skills:[{sourceName:'Real source name',id:'new-a',title:'Authored name',phase:'Contrast',prerequisites:[]}]});assert.equal(p.locations[0].skillIds[0],'new-a');assert.equal(p.skills[0].attributionHtml,'Original author');assert.deepEqual(p.initialSkillIds,['new-a'])});
test('missing sources cannot become invented examples',()=>{assert.throws(()=>curatePool(imported,{id:'x',title:'x',subject:'x',skills:[{id:'none',sourceName:'Not present'}]}),/No authored/)});
test('curation preserves the authored answer area and regional scoring geometry',()=>{
 const boundaries=[{properties:{name:'Example'},geometry:{type:'Polygon',coordinates:[]}}];
 const p=curatePool(imported,{id:'x',title:'x',subject:'x',answerAreaLabel:'Anywhere in Example',regionFeatures:boundaries,skills:[{sourceName:'Real source name',id:'x-a',title:'Example',phase:'Mixed',prerequisites:[]}]});
 assert.equal(p.answerAreaLabel,'Anywhere in Example');assert.deepEqual(p.regionFeatures,boundaries);
});
