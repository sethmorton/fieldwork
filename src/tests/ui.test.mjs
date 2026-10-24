import test from 'node:test';
import assert from 'node:assert/strict';
import {quickCheckPanel} from '../ui.mjs';

// Just enough DOM for a panel: a tree of nodes with text, clicks and a shadow root.
class Node{
  constructor(tag){this.tag=tag;this.children=[];this.style={};this.textContent='';this.classList={toggle(){}}}
  append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node)}}
  replaceChildren(){this.children=[]}
  attachShadow(){const root=new Node('#shadow');root.host=this;this.shadow=root;return root}
  getRootNode(){let node=this;while(node.parent)node=node.parent;return node}
  setAttribute(){}addEventListener(){}focus(){}remove(){}querySelector(){return null}querySelectorAll(){return []}
}
const all=node=>[node,...[...node.children,...node.shadow?[node.shadow]:[]].flatMap(all)];
globalThis.document={createElement:tag=>new Node(tag),getElementById:()=>null,body:new Node('body')};
globalThis.localStorage={getItem:()=>null,setItem(){}};
globalThis.DOMParser=class{parseFromString(){return {body:{textContent:''}}}};

test('a quick-check answer that fails to save says so, never showing the raw exception',()=>{
  const skill={id:'clue',title:'Clue'};
  quickCheckPanel({},[skill],{onKnown:()=>{throw Error('GM_setValue: internal storage detail')},onDone(){}});
  const nodes=all(document.body),status=nodes.find(node=>node.textContent.startsWith('Know it well'));
  nodes.find(node=>node.textContent==='Knew it (K)').onclick();
  assert.equal(status.textContent,'This change could not be saved. Try again.');
});
