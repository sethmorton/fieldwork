import {skillStatus} from './lib/mastery.ts';
import {renderProgressTree} from './progress.mjs';
// Compact post-guess UI. Source HTML is converted to text, never executed.
export function panel() {
  document.getElementById('fieldwork-practice')?.remove();
  const host=document.createElement('aside');host.id='fieldwork-practice';
  Object.assign(host.style,{position:'fixed',bottom:'18px',left:'18px',zIndex:9999,width:'min(340px, calc(100vw - 36px))'});
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
  `;root.append(style);const section=document.createElement('section');root.append(section);document.body.append(host);
  return {host,section};
}
const text=(parent,tag,content,cls)=>{const node=document.createElement(tag);node.textContent=content;if(cls)node.className=cls;parent.append(node);return node};
const button=(parent,label,handler,cls)=>{const node=text(parent,'button',label,cls);node.type='button';node.onclick=handler;return node};
const progressText=(progress,records=[])=>`${progress.state==='mastered'?'Mastered on explicit checks':progress.state==='new'?'New clue':'Learning'} · ${records.length} ${records.length===1?'review':'reviews'} · ${records.filter(item=>item.feedbackSource==='assumed-on-advance').length} assumed`;
function header(section,label) {const head=document.createElement('header');section.append(head);text(head,'small',label);const close=button(head,'×',()=>section.getRootNode().host.remove(),'close');close.setAttribute('aria-label','Close practice panel');}
function treeDetails(section,pack,getAttempts,title){
  const details=document.createElement('details');text(details,'summary',title);const tree=document.createElement('div');details.append(tree);section.append(details);
  const refresh=()=>{if(details.open)renderProgressTree(tree,pack,getAttempts());};
  details.ontoggle=()=>{const host=section.getRootNode().host;host.style.width=details.open?'min(850px, calc(100vw - 36px))':'min(340px, calc(100vw - 36px))';section.style.maxHeight=details.open?'80vh':'65vh';refresh();};
  return {details,refresh};
}
function clue(section,skill,sourceUrl) {
  sourceUrl=skill.notesSourceUrl??sourceUrl;
  text(section,'h2',skill.title);
  const imageUrl=skill.imageUrls?.find(url=>url.startsWith('https://learnablemeta.com/images/')||url.startsWith('https://ocsc00skc0wokcs8kw8g8k84.geohints.com/storage/'));
  if(imageUrl){const img=document.createElement('img');img.src=imageUrl;img.alt=skill.title+' — source example';section.append(img);}
  const details=document.createElement('details');text(details,'summary','Clue & source');
  const parsed=new DOMParser().parseFromString(skill.sourceNoteHtml??skill.trainingNote??'','text/html');const note=(parsed.body.textContent??'').trim();
  const preview=skill.trainingNote??note;
  if(preview)text(section,'p',preview.length>280?preview.slice(0,280)+'…':preview,'muted');
  text(details,'p',note);
  if(skill.scoringCaveats?.length)text(details,'p',skill.scoringCaveats.join(' '),'muted');
  if(sourceUrl?.startsWith('https://')){const source=text(details,'a','Original clues');source.href=sourceUrl;source.target='_blank';source.rel='noopener noreferrer';}
  if(skill.source?.url?.startsWith('https://')){text(details,'span',' · ');const guide=text(details,'a','Guide');guide.href=skill.source.url;guide.target='_blank';guide.rel='noopener noreferrer';}
  const attribution=new DOMParser().parseFromString(skill.attributionHtml??'','text/html');text(details,'p',attribution.body.textContent??'','muted');section.append(details);
}
export function reviewPanel(pack,round,{familiar=false,saved=false,attempts=[],getAttempts=()=>attempts,onChange=()=>{},onSave,onNext,loadNote}) {
  const {section}=panel();header(section,`Fieldwork · round ${round.round}/5`);
  const source=document.createElement('div');section.append(source);
  const currentSkill=pack.skills.find(skill=>skill.id===round.location.skillIds[0]);
  clue(source,currentSkill,pack.notesSourceUrl);
  if(loadNote&&!currentSkill.sourceNoteHtml&&currentSkill.noteOrigin!=='fieldwork-authored'){
    const status=text(source,'p','Loading source explanation…','muted');
    loadNote(currentSkill).then(skill=>{if(!source.isConnected)return;source.replaceChildren();clue(source,skill,pack.notesSourceUrl)}).catch(()=>{status.textContent='Explanation unavailable. Use the original source link; your feedback still saves.'});
  }
  if(round.location.assessmentEligible===false)text(section,'p','Teaching example · practice credit only.','muted');
  const progress=skillStatus(round.location.skillIds[0],attempts);
  const skill=pack.skills.find(skill=>skill.id===round.location.skillIds[0]);
  const progressLine=text(section,'p',progressText(progress,attempts.filter(item=>item.skillId===skill.id)),'muted');
  text(section,'p','Moving on saves “spotted it.” Tap “Missed it” if you didn’t.','muted');
  if(skill.recognitionOnly)text(section,'p','Feature recognition practice. Your region guess is tracked separately.','muted');
  const label=document.createElement('label');const seen=document.createElement('input');seen.type='checkbox';seen.checked=familiar;label.append(seen,document.createTextNode('I had seen this panorama before'));section.append(label);
  let result=round.correct;
  seen.onchange=()=>onChange({familiar:seen.checked,correct:result});
  if(result===null&&!skill.recognitionOnly){text(section,'p','Was your guess in the right region?','muted');const choices=document.createElement('div');choices.className='actions';section.append(choices);for(const [title,value] of [['Yes',true],['No',false]])button(choices,title,()=>{result=value;onChange({familiar:seen.checked,correct:result});for(const child of choices.children)child.classList.remove('primary');choices.children[value?0:1].classList.add('primary');});}
  const status=text(section,'p',saved?'Saved on this device.':'','muted');status.setAttribute('role','status');
  const actions=document.createElement('div');actions.className='actions';section.append(actions);
  const save=recognized=>{try{const updated=onSave({recognized,familiar:seen.checked,correct:result});if(Array.isArray(updated))progressLine.textContent=progressText(skillStatus(skill.id,updated),updated.filter(item=>item.skillId===skill.id));tree.refresh();for(const child of actions.children)child.disabled=true;status.textContent='Saved on this device.';}catch(error){status.textContent=error.message}};
  button(actions,'Missed it',()=>save(false),'primary');button(actions,'Confirm spotted it',()=>save(true));
  for(const child of actions.children)child.disabled=saved;
  if(round.round===5){const next=button(section,'Continue practice',async()=>{next.disabled=true;status.textContent='Starting your next set…';try{await onNext();}catch(error){const updated=getAttempts();progressLine.textContent=progressText(skillStatus(skill.id,updated),updated.filter(item=>item.skillId===skill.id));status.textContent=error.message;next.disabled=false}},'primary');next.style.marginTop='12px';}
  const tree=treeDetails(section,pack,getAttempts,'Your progress tree');
}
function packImport(parent,onImport,status){
  const label=text(parent,'label','Import a practice pack');const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.onchange=async()=>{try{if(!input.files[0])return;await onImport(JSON.parse(await input.files[0].text()));status.textContent='Pack imported.';}catch(error){status.textContent=error.message}};label.append(input);
}
export function loadingPanel(pack,{error,message='Loading practice content…',onRetry,onImport}){
  const {section}=panel();header(section,'Fieldwork · practice');text(section,'h2',pack.title);
  const status=text(section,'p',error??message,'muted');status.setAttribute('role','status');
  if(error){button(section,'Retry',onRetry,'primary');packImport(section,onImport,status)}
}
export function bindPanel(packs,{onBind}){
  const {section}=panel();header(section,'Fieldwork · setup');text(section,'h2','Use this map for practice?');
  const status=text(section,'p','Fieldwork replaces this map’s locations with each new five-round set. Pick the pack this map is for:','muted');status.setAttribute('role','status');
  for(const item of packs)button(section,item.title,()=>{try{onBind(item.id)}catch(error){status.textContent=error.message}},'primary').style.cssText='display:block;width:100%;margin-top:8px';
}
export function startPanel(pack,{onNext,onExport,onImport,onCoverage,attempts=[],getAttempts=()=>attempts,packs=[],onChoosePack}) {
  const {section}=panel();header(section,'Fieldwork · practice');text(section,'h2',pack.title);
  if(packs.length>1){const label=text(section,'label','Practice pack');const choose=document.createElement('select');choose.setAttribute('aria-label','Practice pack');for(const item of packs){const option=text(choose,'option',item.title);option.value=item.id;option.selected=item.id===pack.id;}choose.onchange=()=>onChoosePack(choose.value);label.append(choose);}
  const status=text(section,'p',`${pack.answerAreaLabel??pack.title}. Up to three new targets plus review. Five different clue families.`,'muted');status.setAttribute('role','status');
  button(section,'Continue practice',async function(){this.disabled=true;status.textContent='Starting your next set…';try{await onNext();}catch(error){status.textContent=error.message;this.disabled=false}},'primary');
  const {details}=treeDetails(section,pack,getAttempts,'Content & progress');
  if(pack.coverageSummary){const coverage=document.createElement('details');text(coverage,'summary','Source coverage');text(coverage,'p',pack.coverageSummary,'muted');details.append(coverage);}
  if(onCoverage)button(details,'Export source inventory',async()=>{try{await onCoverage()}catch(error){status.textContent=error.message}});
  button(details,'Export progress',onExport);packImport(details,onImport,status);
}
