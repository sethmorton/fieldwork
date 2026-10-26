import {renderProgressTree} from './progress.mjs';
import {practiceFeedback} from './session.mjs';
import {curriculumProgress} from './lib/adaptive.ts';
import {plainMessage} from './load-errors.mjs';
import {renderAtlas,sprintSummary,richNote} from './atlas.mjs';
import {GRADES,gradeOf,cardStatus,setRecap,sessionBar,drillKey} from './drill.mjs';
const notSaved='This change could not be saved. Try again.';
// Compact post-guess UI. Source HTML is converted to text, never executed.
// Panel size: compact by default, expanded (wide, full images and text) when the learner asks; remembered per browser.
const isWide=()=>localStorage.getItem('fieldwork:wide')==='1';
function applySize(section,treeOpen=false){
  const host=section.getRootNode().host,wide=isWide();
  host.style.width=`min(${treeOpen?850:wide?760:340}px, calc(100vw - 36px))`;section.style.maxHeight=treeOpen||wide?'85vh':'65vh';
  section.classList.toggle('wide',wide);
  const toggle=section.querySelector('.size');if(toggle){toggle.textContent=wide?'⤡':'⤢';toggle.setAttribute('aria-label',wide?'Shrink panel':'Expand panel')}
}
const toggleWide=section=>{localStorage.setItem('fieldwork:wide',isWide()?'0':'1');applySize(section,!!section.querySelector('details.tree[open]'))};
// Every Fieldwork surface is a shadow-root host sharing one stylesheet.
function shadowHost(tag,id){
  document.getElementById(id)?.remove();
  const host=document.createElement(tag);host.id=id;
  const root=host.attachShadow({mode:'open'});
  const style=document.createElement('style');style.textContent=`
    :host{color:#153946;font:14px/1.4 Arial,sans-serif}*{box-sizing:border-box}
    section{background:#eff6f8;border:1px solid #a9c2cb;border-radius:12px;padding:16px;box-shadow:0 8px 30px #10263633;max-height:65vh;overflow:auto}
    header{display:flex;align-items:center;justify-content:space-between;gap:12px}small{font:11px/1.5 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.06em}
    h2{font:600 19px/1.2 'Trebuchet MS',Arial,sans-serif;margin:10px 0}p{margin:8px 0}img{display:block;width:100%;max-height:160px;object-fit:contain;background:#d9e7ec;border-radius:6px}
    button,a,select{font:inherit}select{display:block;width:100%;margin-top:5px;padding:8px;border:1px solid #9bb7c2;border-radius:6px;background:white;color:#153946}button{border:1px solid #9bb7c2;background:white;color:#153946;border-radius:7px;padding:9px 12px;cursor:pointer}button.primary{background:#176b86;color:white;border-color:#176b86}button:disabled{opacity:.6;cursor:wait}
    button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #d1961f;outline-offset:3px}.actions{display:flex;gap:8px;margin-top:12px}.actions>*{flex:1}label{display:block;font-size:12px;margin:10px 0}input{margin-right:6px}a{color:#176b86}.muted{font-size:12px;color:#496b79}details{margin-top:10px}summary{cursor:pointer}.close{padding:2px 7px;font-size:17px;border:0;background:none}
    .tree-root{margin:16px auto 0;padding:12px;text-align:center;border:1px solid #a9c2cb;border-radius:8px;background:#d9e7ec;max-width:360px}.tree-root strong{font:600 18px 'Trebuchet MS',Arial,sans-serif}
    .tree-legend{display:flex;flex-wrap:wrap;gap:12px;margin:14px 0;font-size:12px}.tree-key{display:flex;align-items:center;gap:5px}.tree-dot{display:inline-grid;place-items:center;width:14px;height:14px;border:1px dashed #9bb7c2;border-radius:50%;font-style:normal;font-size:10px}
    .tree-branches{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:0 20px;border-top:1px solid #a9c2cb;margin-top:18px}.tree-branch{position:relative;margin:0;padding:20px 0 14px 16px;border-left:1px solid #a9c2cb}.tree-branch:before{content:'';position:absolute;left:0;top:30px;width:10px;border-top:1px solid #a9c2cb}.tree-family{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:13px}.tree-family:before{content:'+'}.tree-branch[open]>.tree-family:before{content:'−'}.tree-family strong{flex:1}.tree-preview{display:flex;flex-wrap:wrap;gap:6px;width:100%;padding-left:16px}.tree-preview .needs-review{box-shadow:0 0 0 2px #d1961f}.tree-branch[open] .tree-preview{display:none}.tree-leaves{display:flex;flex-wrap:wrap;gap:7px;margin:12px 0}
    .tree-node{display:flex;align-items:center;gap:10px;width:100%;padding:4px 0;text-align:left;border:0;background:none;border-radius:4px;font-size:12px}.tree-count{display:inline-grid;place-items:center;width:28px;height:28px;flex-shrink:0;border:1px dashed #9bb7c2;border-radius:50%;font:12px ui-monospace,monospace}.learning{background:#d2e8f0;border:1px solid #176b86;color:#153946}.provisional{background:#176b86;border:3px double #eff6f8;color:white;outline:1px solid #176b86}.mastered{background:#276b50;border:1px solid #276b50;color:white}.needs-review .tree-count{box-shadow:0 0 0 3px #d1961f}.tree-node[aria-pressed=true] .tree-name{font-weight:bold;text-decoration:underline}.tree-node:focus-visible{outline:3px solid #d1961f;outline-offset:3px}.tree-inspect{min-height:24px;font-size:12px}.tree-inspect p{margin:4px 0}
    .preview{display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden}.wide .preview{display:block}
    .wide img{max-height:none;cursor:zoom-out}img{cursor:zoom-in}header .size{margin-left:auto}
    dialog.overlay{width:100vw;height:100vh;max-width:none;max-height:none;margin:0;padding:16px;border:0;background:#eff6f8;color:#153946;overflow:auto}
    .card{font-size:15px;line-height:1.45}.card h2{font:600 13px/1.3 Arial,sans-serif;margin:12px 0 0;color:#496b79}
    .status{display:inline-block;margin-top:12px;font-size:11px;color:#496b79;border:1px solid #c3d5dc;border-radius:999px;padding:1px 8px;cursor:default}
    .tell{font:700 19px/1.3 'Trebuchet MS',Arial,sans-serif;margin:6px 0 12px;color:#0f2c37}
    .stakes{margin:0 0 14px;padding:8px 12px;border-left:3px solid #c0571a;background:#fbeee4;color:#7d3410;border-radius:0 6px 6px 0;font-size:14px;font-weight:600}
    .card img.hero{max-height:260px;margin-bottom:12px}.lead p{margin:6px 0}.lead .label{margin:12px 0 2px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#496b79}
    .session{margin:6px 0 0;font-size:11px;color:#496b79}.rest{margin:4px 0 0;font-size:12px;color:#7d3410}
    section.drill{max-height:85vh!important}.footer{position:sticky;bottom:-16px;margin:12px -16px -16px;padding:10px 16px 14px;background:#eff6f8;border-top:1px solid #dbe7eb}.footer .actions{margin-top:0}.footer p:empty{display:none}
    button.continue{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:10px}
    .grades button{display:flex;align-items:center;justify-content:center;gap:6px;padding:10px 6px}.grades button:disabled{cursor:default}button.chosen{background:#d2e8f0;border:2px solid #176b86;font-weight:600}button.chosen:disabled{opacity:1}
    kbd{font:11px/1 ui-monospace,monospace;padding:2px 4px;border:1px solid currentColor;border-radius:3px;opacity:.65}
    .recap{list-style:none;margin:16px 0 0;padding:0;border-top:1px solid #c3d5dc}.recap li{display:grid;grid-template-columns:16px 1fr;gap:1px 8px;padding:7px 6px;border-bottom:1px solid #dbe7eb;font-size:13px}
    .recap .icon{grid-row:span 2;font-weight:700;text-align:center}.recap li>span:last-child{grid-column:2;color:#496b79;font-size:12px}.recap li.miss{background:#fbeee4}.recap .miss .icon{color:#c0571a}
    dialog.fullscreen{width:100vw;height:100vh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:#0b1d24f2;cursor:zoom-out}dialog.fullscreen img{width:100%;height:100%;max-height:none;object-fit:contain;background:none;border-radius:0;cursor:zoom-out}
  `;root.append(style);return {host,root};
}
export function panel() {
  const {host,root}=shadowHost('aside','fieldwork-practice');
  Object.assign(host.style,{position:'fixed',bottom:'18px',left:'18px',zIndex:9999,width:'min(340px, calc(100vw - 36px))'});
  const section=document.createElement('section');root.append(section);document.body.append(host);
  applySize(section);
  return {host,section};
}
const text=(parent,tag,content,cls)=>{const node=document.createElement(tag);node.textContent=content;if(cls)node.className=cls;parent.append(node);return node};
const button=(parent,label,handler,cls)=>{const node=text(parent,'button',label,cls);node.type='button';node.onclick=handler;return node};
// Sprint progress is the atlas, in a full-viewport modal dialog: focus stays inside, Escape closes it and focus returns
// to the opener. Keys stop at the dialog, so typing never fires GeoGuessr shortcuts.
function openAtlas(pack,attempts,opener,loadNote){
  const {host,root}=shadowHost('div','fieldwork-atlas');
  const dialog=document.createElement('dialog');dialog.className='overlay';dialog.setAttribute('aria-label','Atlas');root.append(dialog);
  const head=document.createElement('header');dialog.append(head);text(head,'small','Fieldwork · atlas');
  button(head,'×',()=>dialog.close(),'close').setAttribute('aria-label','Close atlas');
  renderAtlas(dialog,pack,attempts,{loadNote});
  dialog.addEventListener('keydown',event=>event.stopPropagation());
  dialog.onclose=()=>{host.remove();opener.focus()};
  document.body.append(host);dialog.showModal();
}
const atlasButton=(parent,pack,getAttempts,loadNote)=>button(parent,'Open atlas',function(){openAtlas(pack,getAttempts(),this,loadNote)});
function header(section,label) {
  const head=document.createElement('header');section.append(head);text(head,'small',label);
  button(head,'⤢',()=>toggleWide(section),'close size');
  const close=button(head,'×',()=>section.getRootNode().host.remove(),'close');close.setAttribute('aria-label','Close practice panel');
  applySize(section,!!section.querySelector('details.tree[open]'));
}
function treeDetails(section,pack,getAttempts,title){
  const details=document.createElement('details');details.className='tree';text(details,'summary',title);const tree=document.createElement('div');details.append(tree);section.append(details);
  const refresh=()=>{if(details.open)renderProgressTree(tree,pack,getAttempts());};
  details.ontoggle=()=>{applySize(section,details.open);refresh();};
  return {details,refresh};
}
const exampleImage=skill=>skill.imageUrls?.find(url=>url.startsWith('https://learnablemeta.com/images/')||url.startsWith('https://www.plonkit.net/images/')||url.startsWith('https://ocsc00skc0wokcs8kw8g8k84.geohints.com/storage/'));
function clue(section,skill,sourceUrl) {
  text(section,'h2',skill.title);
  if(skill.tell){const tell=text(section,'p',null);text(tell,'strong',skill.tell).style.fontSize='1.15em';}
  const imageUrl=exampleImage(skill);
  if(imageUrl){const img=document.createElement('img');img.src=imageUrl;img.alt=skill.title+' — source example';img.title='Click to enlarge';
    img.onclick=()=>toggleWide(img.getRootNode().querySelector('section'));section.append(img);}
  const details=document.createElement('details');text(details,'summary','Clue & source');
  const parsed=new DOMParser().parseFromString(skill.sourceNoteHtml??skill.trainingNote??'','text/html');const note=(parsed.body.textContent??'').trim();
  // With a tell, the preview is just the note's first paragraph (the facts line); the rest stays under 'Clue & source'.
  const preview=skill.tell?(parsed.body.querySelector?.('p')?.textContent??'').trim():skill.trainingNote??note;
  if(preview)text(section,'p',preview,'muted preview');
  sourceDetails(details,skill,sourceUrl);section.append(details);
}
function sourceDetails(details,skill,sourceUrl){
  sourceUrl=skill.notesSourceUrl??sourceUrl;
  richNote(details,skill.sourceNoteHtml??skill.trainingNote);
  if(skill.scoringCaveats?.length)text(details,'p',skill.scoringCaveats.join(' '),'muted');
  if(sourceUrl?.startsWith('https://')){const source=text(details,'a','Original clues');source.href=sourceUrl;source.target='_blank';source.rel='noopener noreferrer';}
  if(skill.source?.url?.startsWith('https://')){text(details,'span',' · ');const guide=text(details,'a','Guide');guide.href=skill.source.url;guide.target='_blank';guide.rel='noopener noreferrer';}
  const attribution=new DOMParser().parseFromString(skill.attributionHtml??'','text/html');text(details,'p',attribution.body.textContent??'','muted');
}
// Sprint card, in decision order: tell, stakes, example, the foil block; the full note stays under 'Clue & source'.
function sprintCard(card,skill,round,attempts,sourceUrl){
  text(card,'h2',skill.title);
  const parsed=new DOMParser().parseFromString(skill.sourceNoteHtml??skill.trainingNote??'','text/html'),note=(parsed.body.textContent??'').trim();
  // Plain text above the fold: a trailing '(Source name)' citation stays under 'Clue & source'.
  const plainLine=p=>{const cite=[...p.querySelectorAll('a')].at(-1)?.textContent,line=p.textContent.trim();return cite&&line.endsWith(`(${cite})`)?line.slice(0,-cite.length-2).trim():line};
  const paragraphs=[...parsed.body.querySelectorAll('p')],isHeading=p=>p.childNodes.length===1&&p.firstChild?.nodeName==='STRONG';
  // Without a tell, the first 'Points to X' line is the headline; the facts line ('Answer: …') is not a clue.
  const pointsTo=skill.tell?null:paragraphs.find((p,index)=>index&&isHeading(paragraphs[index-1])&&/^Points to/.test(paragraphs[index-1].textContent)&&!isHeading(p));
  const first=note.match(/^.*?[.!?](?=\s|$)/)?.[0]??note,headline=skill.tell?skill.tell.replace(' -> ',' → '):pointsTo?plainLine(pointsTo):first;
  const tell=(skill.tell?.split(' -> ')[0]??(pointsTo&&headline))?.toLowerCase();
  text(card,'p',headline,'tell');
  if(skill.stakes)text(card,'p',skill.stakes,'stakes');
  const url=exampleImage(skill);
  if(url){const img=document.createElement('img');img.className='hero';img.src=url;img.alt=`${skill.title}: source example`;img.title='Click for full screen';card.append(img);
    img.onclick=()=>{const dialog=document.createElement('dialog');dialog.className='fullscreen';dialog.append(img.cloneNode());card.getRootNode().append(dialog);
      dialog.onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();dialog.showModal();};}
  const lead=document.createElement('div');lead.className='lead';card.append(lead);
  if(skill.subject==='duel'||skill.subject==='contrast'){
    // Duels: the 'Seen in this round' and 'Points to X instead' blocks. Contrasts: the pair under the title, minus the tell's line.
    // The model's 'In view' description is never shown here: it may be wrong, so it stays under 'Clue & source'.
    let take=0,headings=0,label=null;
    for(const p of paragraphs){
      if(isHeading(p)){headings++;take=/^(Seen in this round|Points to)/.test(p.textContent)||(skill.subject==='contrast'&&headings===1&&!/^In view/.test(p.textContent))?(skill.subject==='contrast'?2:1):0;
        label=take&&!(skill.subject==='contrast'&&headings===1)?p.textContent:null;continue;}
      // A line the headline already states adds only its '(Visible when you turn …)' hint.
      const dup=tell&&p.textContent.toLowerCase().includes(tell),hint=p.textContent.match(/\((Visible[^()]*)\)\s*$/)?.[1];
      if(take>0&&(!dup||hint)){take--;
        if(label)text(lead,'p',label,'label');label=null;
        text(lead,'p',dup?`${hint}.`:plainLine(p));}
    }
  // Other cards: the tell already says it; without one, the note's first paragraph after its bold first sentence.
  }else if(!skill.tell){const rest=(parsed.body.querySelector('p')?.textContent??note).trim().slice(first.length).trim();if(rest)text(lead,'p',rest,'preview');}
  const details=document.createElement('details');text(details,'summary','Clue & source');
  if(round.location.note)text(details,'p',round.location.note);
  sourceDetails(details,skill,sourceUrl);card.append(details);
  const status=text(card,'span',cardStatus(attempts,round),'status');if(skill.relevance)status.title=skill.relevance;
}
const sessionLine=(section,pack,attempts)=>{const bar=sessionBar(pack,attempts);text(section,'p',bar.text,'session');if(bar.rest)text(section,'p','Take 5 minutes, then come back.','rest');};
function sprintReview(pack,round,{familiar=false,saved=false,attempts=[],getAttempts=()=>attempts,onSave,onNext,loadNote}){
  const {host,section}=panel();section.classList.add('drill');header(section,`Fieldwork · round ${round.round}/5`);sessionLine(section,pack,attempts);
  const skill=pack.skills.find(item=>item.id===round.location.skillIds[0]),card=document.createElement('div');card.className='card';section.append(card);
  sprintCard(card,skill,round,attempts,pack.notesSourceUrl);
  if(loadNote&&!skill.sourceNoteHtml&&skill.noteOrigin!=='fieldwork-authored')
    loadNote(skill).then(loaded=>{if(card.isConnected){card.replaceChildren();sprintCard(card,loaded,round,attempts,pack.notesSourceUrl)}}).catch(()=>{});
  // The grade buttons (and Continue) stay pinned to the panel's bottom edge, so a tall card never hides them.
  const footer=document.createElement('div');footer.className='footer';section.append(footer);
  const actions=document.createElement('div');actions.className='actions grades';footer.append(actions);
  const status=text(footer,'p','','muted');status.setAttribute('role','status');
  let recap=()=>{},next=null;
  // Grading touches only the buttons and the recap rows; the card and its image stay as rendered.
  const mark=grade=>buttons.forEach((node,index)=>{node.disabled=!!grade;node.classList.toggle('chosen',GRADES[index][0]===grade)});
  const save=grade=>{try{const updated=onSave({recognized:grade!=='missed',knew:grade==='knew',familiar,correct:round.correct});mark(grade);status.textContent='';
    section.getRootNode().activeElement?.blur();recap(updated??getAttempts());if(round.round===5)section.scrollTop=section.scrollHeight;}catch(error){status.textContent=plainMessage(error,notSaved)}};
  const buttons=GRADES.map(([grade,label],index)=>{const node=button(actions,'',()=>save(grade));text(node,'kbd',String(index+1));node.append(label);return node;});
  if(saved)mark(gradeOf(attempts.find(attempt=>attempt.id===round.id))??'spotted');
  if(round.round===5){
    const list=document.createElement('ol');list.className='recap';list.setAttribute('aria-label','This set');footer.before(list);
    const icons={missed:'✗',spotted:'✓',knew:'★'};
    recap=all=>list.replaceChildren(...setRecap(pack,all,round).map(row=>{const item=document.createElement('li');if(row.grade==='missed')item.className='miss';
      text(item,'span',icons[row.grade]??'·','icon').title=row.grade??'not graded';text(item,'strong',row.skill.title);text(item,'span',(row.skill.tell??row.skill.why??'').replace(' -> ',' → '));return item;}));
    recap(getAttempts());
    next=button(footer,'',async()=>{next.disabled=true;status.textContent='Starting your next set…';try{await onNext();}catch(error){status.textContent=plainMessage(error);next.disabled=false}},'primary continue');
    text(next,'kbd','C');next.append(' Continue practice');status.before(next);
  }
  // Rounds 1-4 leave Space and Enter to GeoGuessr's own Next. The listener lives exactly as long as this panel.
  const onKey=event=>{
    const action=drillKey(event,round.round),target=action==='continue'?next:buttons[GRADES.findIndex(([grade])=>grade===action)];
    if(!target||target.disabled)return;
    event.preventDefault();event.stopPropagation();target.click();
  };
  document.addEventListener('keydown',onKey,true);
  new MutationObserver((_,observer)=>{if(!host.isConnected){document.removeEventListener('keydown',onKey,true);observer.disconnect()}}).observe(document.body,{childList:true});
}
export function reviewPanel(pack,round,options) {
  if(pack.scheduler==='sprint')return sprintReview(pack,round,options);
  const {familiar=false,saved=false,attempts=[],getAttempts=()=>attempts,onChange=()=>{},onSave,onNext,loadNote}=options;
  const {section}=panel();header(section,`Fieldwork · round ${round.round}/5`);
  const source=document.createElement('div');section.append(source);
  const currentSkill=pack.skills.find(skill=>skill.id===round.location.skillIds[0]);
  clue(source,currentSkill,pack.notesSourceUrl);
  if(loadNote&&!currentSkill.sourceNoteHtml&&currentSkill.noteOrigin!=='fieldwork-authored'){
    const status=text(source,'p','Loading source explanation…','muted');
    loadNote(currentSkill).then(skill=>{if(!source.isConnected)return;source.replaceChildren();clue(source,skill,pack.notesSourceUrl)}).catch(()=>{status.textContent='Explanation unavailable. Use the original source link; your feedback still saves.'});
  }
  // A location can say what to look for in this exact panorama (e.g. what was visible in a duel round you missed).
  if(round.location.note)text(section,'p',round.location.note);
  if(round.location.assessmentEligible===false)text(section,'p','Teaching example · practice credit only.','muted');
  text(section,'p',practiceFeedback(attempts,round),'muted');
  text(section,'p','Moving on saves “spotted it.” “Knew it” skips the short repeats and checks back later in a real round.','muted');
  if(currentSkill.recognitionOnly)text(section,'p','Feature recognition practice. Your region guess is tracked separately.','muted');
  const label=document.createElement('label');const seen=document.createElement('input');seen.type='checkbox';seen.checked=familiar;label.append(seen,document.createTextNode('I had seen this panorama before'));section.append(label);
  let result=round.correct;
  seen.onchange=()=>onChange({familiar:seen.checked,correct:result});
  if(result===null&&!currentSkill.recognitionOnly&&pack.gradingPolicy!=='recognition'){text(section,'p','Was your guess in the right region?','muted');const choices=document.createElement('div');choices.className='actions';section.append(choices);for(const [title,value] of [['Yes',true],['No',false]])button(choices,title,()=>{result=value;onChange({familiar:seen.checked,correct:result});for(const child of choices.children)child.classList.remove('primary');choices.children[value?0:1].classList.add('primary');});}
  const status=text(section,'p',saved?'Saved on this device.':'','muted');status.setAttribute('role','status');
  const actions=document.createElement('div');actions.className='actions';section.append(actions);
  const save=(recognized,knew=false)=>{try{onSave({recognized,knew,familiar:seen.checked,correct:result});tree.refresh();for(const child of actions.children)child.disabled=true;status.textContent='Saved on this device.';}catch(error){status.textContent=plainMessage(error,notSaved)}};
  button(actions,'Missed it',()=>save(false),'primary');button(actions,'Spotted it',()=>save(true));button(actions,'Knew it',()=>save(true,true));
  for(const child of actions.children)child.disabled=saved;
  if(round.round===5){const next=button(section,'Continue practice',async()=>{next.disabled=true;status.textContent='Starting your next set…';try{await onNext();}catch(error){status.textContent=plainMessage(error);next.disabled=false}},'primary');next.style.marginTop='12px';}
  const tree=treeDetails(section,pack,getAttempts,'Your progress tree');
}
function packImport(parent,onImport,status){
  const label=text(parent,'label','Import a practice pack');const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.onchange=async()=>{try{if(!input.files[0])return;await onImport(JSON.parse(await input.files[0].text()));status.textContent='Pack imported.';}catch(error){status.textContent=plainMessage(error)}};label.append(input);
}
const packChoice=(section,pack,packs,onChoosePack,label='Practice pack')=>{const wrap=text(section,'label',label);const choose=document.createElement('select');choose.setAttribute('aria-label',label);for(const item of packs){const option=text(choose,'option',item.title);option.value=item.id;option.selected=item.id===pack.id;}choose.onchange=()=>onChoosePack(choose.value);wrap.append(choose);};
// While content loads or cannot load: another bound pack opens its own map, Retry now joins the single load, and a pack file is the last resort.
export function loadingPanel(pack,{error,message='Loading practice content…',onRetry,onImport,packs=[],onChoosePack}){
  const {section}=panel();header(section,'Fieldwork · practice');text(section,'h2',pack.title);
  const status=text(section,'p',error??message,'muted');status.setAttribute('role','status');
  if(error&&onRetry)button(section,'Retry now',onRetry,'primary');
  if(packs.length&&onChoosePack)packChoice(section,pack,[pack,...packs],onChoosePack,'Practice another pack');
  if(error&&onImport){const details=document.createElement('details');text(details,'summary','Import a pack file');section.append(details);packImport(details,onImport,status)}
}
export function bindPanel(packs,{onBind}){
  const {section}=panel();header(section,'Fieldwork · setup');text(section,'h2','Use this map for practice?');
  const status=text(section,'p','Fieldwork replaces this map’s locations with each new five-round set. Pick the pack this map is for:','muted');status.setAttribute('role','status');
  for(const item of packs)button(section,item.title,()=>{try{onBind(item.id)}catch(error){status.textContent=plainMessage(error)}},'primary').style.cssText='display:block;width:100%;margin-top:8px';
}
export function startPanel(pack,{onNext,onQuickCheck,onExport,onImport,onCoverage,attempts=[],getAttempts=()=>attempts,packs=[],onChoosePack,learn=false,onLearn,atlasNote}) {
  const {section}=panel();header(section,'Fieldwork · practice');text(section,'h2',pack.title);
  if(packs.length>1)packChoice(section,pack,packs,onChoosePack);
  const sprint=pack.scheduler==='sprint';
  if(sprint)sessionLine(section,pack,attempts);
  text(section,'p',sprint?sprintSummary(pack,attempts):curriculumProgress(pack,attempts).message,'muted');
  const status=text(section,'p',sprint?`${pack.answerAreaLabel}.`:`${pack.answerAreaLabel??pack.title}. At most two clues per family. New clues adapt to recent practice.`,'muted');status.setAttribute('role','status');
  const actions=document.createElement('div');actions.className='actions';section.append(actions);
  button(actions,'Continue practice',async function(){this.disabled=true;status.textContent='Starting your next set…';try{await onNext();}catch(error){status.textContent=plainMessage(error);this.disabled=false}},'primary');
  if(sprint)atlasButton(actions,pack,getAttempts,atlasNote);
  else{
    if(onQuickCheck)button(actions,'Quick check',onQuickCheck);
    if(onLearn){const label=document.createElement('label');const box=document.createElement('input');box.type='checkbox';box.checked=learn;
      box.addEventListener('change',()=>onLearn(box.checked));label.append(box,document.createTextNode(' Learn mode: duel misses and new clues first, reviews wait'));section.append(label);}
  }
  const details=sprint?document.createElement('details'):treeDetails(section,pack,getAttempts,'Content & progress').details;
  if(sprint){text(details,'summary','Content & progress');section.append(details);}
  if(pack.coverageSummary){const coverage=document.createElement('details');text(coverage,'summary','Source coverage');text(coverage,'p',pack.coverageSummary,'muted');details.append(coverage);}
  if(onCoverage)button(details,'Export source inventory',async()=>{try{await onCoverage()}catch(error){status.textContent=plainMessage(error)}});
  button(details,'Export progress',onExport);packImport(details,onImport,status);
}
/** Clear clues you already know without spending rounds: one card at a time, K = knew it, N = not yet. */
export function quickCheckPanel(pack,queue,{onKnown,onDone}) {
  const {host,section}=panel();let index=0,known=0;
  const show=()=>{
    section.replaceChildren();header(section,`Fieldwork · quick check ${Math.min(index+1,queue.length)}/${queue.length}`);
    if(index>=queue.length){text(section,'h2','Done');text(section,'p',`${known} marked known. New ones come back in about a week to confirm.`,'muted');button(section,'Back to practice',onDone,'primary');return}
    const skill=queue[index];clue(section,skill,pack.notesSourceUrl);
    const status=text(section,'p','Know it well enough to spot it in a round? Known clues skip the short repeats. New ones return in about a week.','muted');status.setAttribute('role','status');
    const actions=document.createElement('div');actions.className='actions';section.append(actions);
    button(actions,'Knew it (K)',()=>{try{onKnown(skill.id);known++;index++;show()}catch(error){status.textContent=plainMessage(error,notSaved)}},'primary');
    button(actions,'Not yet (N)',()=>{index++;show()});
    button(section,'Stop',onDone).style.marginTop='8px';
  };
  host.tabIndex=-1;host.addEventListener('keydown',event=>{const key=event.key.toLowerCase();const target=[...section.querySelectorAll('.actions button')][key==='k'?0:key==='n'?1:-1];if(target){event.preventDefault();target.click()}});
  show();host.focus();
}
