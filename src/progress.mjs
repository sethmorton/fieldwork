import {skillStatus} from './lib/mastery.ts';

const labels={new:'Untouched',learning:'Practising',provisional:'Provisional',mastered:'Mastered',oriented:'Oriented'};
export function progressTree(pack,attempts,now=Date.now()) {
  const families=new Map();let deferred=0;
  for(const skill of pack.skills){
    if(skill.availability&&skill.availability!=='available'){deferred++;continue;}
    const records=attempts.filter(item=>item.skillId===skill.id&&Number.isFinite(Date.parse(item.occurredAt))&&Date.parse(item.occurredAt)<=new Date(now).getTime()).sort((a,b)=>Date.parse(a.occurredAt)-Date.parse(b.occurredAt));
    const status=skillStatus(skill.id,records,now,skill.kind),last=records.at(-1);
    const family=skill.practiceFamily??'other';
    if(!families.has(family))families.set(family,{id:family,title:family.replaceAll('-',' ').replace(/^./,letter=>letter.toUpperCase()),nodes:[]});
    families.get(family).nodes.push({id:skill.id,title:skill.title,status,label:labels[status.state],reviews:records.length,
      assumed:records.filter(item=>item.feedbackSource==='assumed-on-advance').length,
      needsPractice:!!last&&last.feedbackSource!=='assumed-on-advance'&&(last.correct===false||last.evidenceValid===false)});
  }
  const nodes=[...families.values()].flatMap(family=>family.nodes);
  return {title:pack.title,families:[...families.values()],deferred,total:nodes.length,
    practised:nodes.filter(node=>node.reviews>0).length,mastered:nodes.filter(node=>node.status.state==='mastered').length};
}

const add=(parent,tag,value,cls)=>{const el=document.createElement(tag);if(value)el.textContent=value;if(cls)el.className=cls;parent.append(el);return el};
export function renderProgressTree(parent,pack,attempts,now=Date.now()) {
  const opened=new Set([...parent.querySelectorAll('.tree-branch[open]')].map(branch=>branch.dataset.family));
  const selected=parent.querySelector('.tree-node[aria-pressed=true]')?.dataset.skill;
  const tree=progressTree(pack,attempts,now);parent.replaceChildren();
  const root=add(parent,'div',null,'tree-root');add(root,'strong',tree.title);
  add(root,'p',`${tree.practised}/${tree.total} targets practised · ${tree.mastered} mastered`,'muted');
  const legend=add(parent,'div',null,'tree-legend');
  for(const state of ['new','learning','provisional','mastered']){const key=add(legend,'span',null,'tree-key');add(key,'i',state==='mastered'?'✓':'','tree-dot '+state);add(key,'span',labels[state]);}
  add(parent,'p','Amber ring: last check needs practice or a review is due. Counts show reviews, including assumed recognition.','muted');
  const branches=add(parent,'div',null,'tree-branches');
  for(const family of tree.families){
    const branch=add(branches,'details',null,'tree-branch');branch.dataset.family=family.id;branch.open=opened.has(family.id);const heading=add(branch,'summary',null,'tree-family');
    add(heading,'strong',family.title);add(heading,'span',`${family.nodes.filter(node=>node.reviews).length}/${family.nodes.length}`,'muted');
    const preview=add(heading,'span',null,'tree-preview');preview.setAttribute('aria-hidden','true');
    for(const node of family.nodes)add(preview,'i',node.status.state==='mastered'?'✓':'',`tree-dot ${node.status.state}${node.needsPractice||node.status.due?' needs-review':''}`);
    const leaves=add(branch,'div',null,'tree-leaves');
    const inspect=add(branch,'div',null,'tree-inspect');inspect.setAttribute('aria-live','polite');
    add(inspect,'span','Select a target','muted');
    for(const node of family.nodes){
      const needsReview=node.needsPractice||node.status.due;
      const leaf=add(leaves,'button',null,`tree-node${needsReview?' needs-review':''}`);
      leaf.dataset.skill=node.id;
      add(leaf,'span',node.status.state==='mastered'?'✓':node.reviews?String(node.reviews):'·','tree-count '+node.status.state);
      add(leaf,'span',node.title,'tree-name');
      leaf.type='button';leaf.setAttribute('aria-pressed','false');
      const reviews=`${node.reviews} ${node.reviews===1?'review':'reviews'}`;
      leaf.setAttribute('aria-label',`${node.title}: ${node.label}, ${reviews}${needsReview?', needs practice or review':''}`);leaf.title=leaf.getAttribute('aria-label');
      leaf.onclick=()=>{
        for(const other of leaves.children)other.setAttribute('aria-pressed','false');leaf.setAttribute('aria-pressed','true');inspect.replaceChildren();
        add(inspect,'strong',node.title);add(inspect,'p',`${node.label}${node.status.due?' · Review due':node.needsPractice?' · Needs practice':''}`,'muted');
        add(inspect,'p',`${reviews} · ${node.assumed} assumed · ${node.status.eligibleCount} unfamiliar checks`,'muted');
      };
      if(selected===node.id)leaf.click();
    }
  }
  if(!tree.practised)add(parent,'p','Finish a round to grow your tree.','muted');
  add(parent,'p','Practice grows the tree. Mastery requires explicit checks on unfamiliar locations, including a delayed check.','muted');
  if(tree.deferred)add(parent,'p',`${tree.deferred} other targets are outside this practice pool or still need suitable locations.`,'muted');
}
