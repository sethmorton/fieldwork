import {skillStatus} from './lib/mastery.ts';
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
    button,a{font:inherit}button{border:1px solid #9bb7c2;background:white;color:#153946;border-radius:7px;padding:9px 12px;cursor:pointer}button.primary{background:#176b86;color:white;border-color:#176b86}button:disabled{opacity:.6;cursor:wait}
    button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid #d1961f;outline-offset:3px}.actions{display:flex;gap:8px;margin-top:12px}.actions>*{flex:1}label{display:block;font-size:12px;margin:10px 0}input{margin-right:6px}a{color:#176b86}.muted{font-size:12px;color:#496b79}details{margin-top:10px}.close{padding:2px 7px;font-size:17px;border:0;background:none}
  `;root.append(style);const section=document.createElement('section');root.append(section);document.body.append(host);
  return {host,section};
}
const text=(parent,tag,content,cls)=>{const node=document.createElement(tag);node.textContent=content;if(cls)node.className=cls;parent.append(node);return node};
const button=(parent,label,handler,cls)=>{const node=text(parent,'button',label,cls);node.type='button';node.onclick=handler;return node};
const progressText=(progress,records=[])=>`${progress.state==='mastered'?'Mastered on explicit checks':progress.state==='new'?'New clue':'Learning'} · ${records.length} ${records.length===1?'review':'reviews'} · ${records.filter(item=>item.feedbackSource==='assumed-on-advance').length} assumed`;
function header(section,label) {const head=document.createElement('header');section.append(head);text(head,'small',label);const close=button(head,'×',()=>section.getRootNode().host.remove(),'close');close.setAttribute('aria-label','Close practice panel');}
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
export function reviewPanel(pack,round,{familiar=false,saved=false,attempts=[],getAttempts=()=>attempts,onChange=()=>{},onSave,onNext}) {
  const {section}=panel();header(section,`Fieldwork · round ${round.round}/5`);
  clue(section,pack.skills.find(skill=>skill.id===round.location.skillIds[0]),pack.notesSourceUrl);
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
  const save=recognized=>{try{const updated=onSave({recognized,familiar:seen.checked,correct:result});if(Array.isArray(updated))progressLine.textContent=progressText(skillStatus(skill.id,updated),updated.filter(item=>item.skillId===skill.id));for(const child of actions.children)child.disabled=true;status.textContent='Saved on this device.';}catch(error){status.textContent=error.message}};
  button(actions,'Missed it',()=>save(false),'primary');button(actions,'Confirm spotted it',()=>save(true));
  for(const child of actions.children)child.disabled=saved;
  if(round.round===5){const next=button(section,'Continue practice',async()=>{next.disabled=true;status.textContent='Starting your next set…';try{await onNext();}catch(error){const updated=getAttempts();progressLine.textContent=progressText(skillStatus(skill.id,updated),updated.filter(item=>item.skillId===skill.id));status.textContent=error.message;next.disabled=false}},'primary');next.style.marginTop='12px';}
}
export function startPanel(pack,_set,{onNext,onExport,onImport,error,attempts=[]}) {
  const {section}=panel();header(section,'Fieldwork · practice');text(section,'h2',pack.title);
  const status=text(section,'p',error??`${pack.answerAreaLabel??pack.title}. Up to three new targets plus review. Five different clue families.`,'muted');status.setAttribute('role','status');
  const next=button(section,'Continue practice',async function(){this.disabled=true;status.textContent='Starting your next set…';try{await onNext();}catch(error){status.textContent=error.message;this.disabled=false}},'primary');next.disabled=!!error;
  const details=document.createElement('details');text(details,'summary','Content & progress');
  if(pack.coverageSummary)text(details,'p',pack.coverageSummary,'muted');
  for(const skill of pack.skills){const progress=skillStatus(skill.id,attempts);if(progress.state!=='new')text(details,'p',`${skill.title}: ${progressText(progress,attempts.filter(item=>item.skillId===skill.id))}`,'muted')}
  button(details,'Export progress',onExport);const label=text(details,'label','Import a practice pack');const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.onchange=async()=>{try{await onImport(JSON.parse(await input.files[0].text()));status.textContent='Pack imported.';}catch(error){status.textContent=error.message}};label.append(input);section.append(details);
}
