import {sprintStatus} from './sprint.mjs';

// The ACoW atlas: the map fills each country by clue coverage, the list holds the same countries by ACoW share (small
// ones are hard to tap), and the detail shows a country's clues by subject. Source HTML becomes text, never runs.
const css=`
  .atlas{color:#153946;font:14px/1.4 Arial,sans-serif}.atlas *{box-sizing:border-box}.atlas h2{margin:4px 0}.atlas h3{margin:14px 0 4px}
  .atlas-head p{margin:4px 0}.legend{display:flex;flex-wrap:wrap;gap:6px}.muted{font-size:12px;color:#496b79}
  .atlas-body{display:grid;grid-template-columns:minmax(0,1fr) 300px;grid-template-areas:"map side" "detail side";gap:12px 16px;align-items:start;margin-top:10px}
  .atlas-map{grid-area:map;display:block;width:100%;height:auto;background:#d9e7ec;border-radius:8px}
  .atlas-map path{stroke:#eff6f8;stroke-width:.5px;vector-effect:non-scaling-stroke}.atlas-map path:not(.other){cursor:pointer}
  .atlas-map path.missed{stroke:#d1961f;stroke-width:2px}.atlas-map path.selected{stroke:#153946;stroke-width:2.5px}
  .atlas .none,.atlas .new{fill:#c9dde4;background:#c9dde4}.atlas .some,.atlas .learning{fill:#4f97b0;background:#4f97b0;color:white}
  .atlas .done,.atlas .retired{fill:#276b50;background:#276b50;color:white}.atlas .other{fill:#ececec;background:#ececec}.atlas-map path.other{stroke:#fafafa}
  .chip{font:11px/1.7 ui-monospace,monospace;padding:0 6px;border-radius:9px;white-space:nowrap}.chip.missed{box-shadow:0 0 0 2px #d1961f}
  .atlas-side{grid-area:side}.atlas-side input{width:100%;margin:0;padding:8px;border:1px solid #9bb7c2;border-radius:6px;font:inherit}
  .atlas-list{list-style:none;margin:8px 0 0;padding:0;max-height:75vh;overflow:auto}
  .atlas-list button{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;width:100%;padding:6px 4px;border:0;border-bottom:1px solid #d2e3e9;border-radius:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}
  .atlas-list .name{flex:1}.atlas-detail{grid-area:detail}.clue{border-top:1px solid #a9c2cb;padding:8px 0}.clue p{margin:6px 0}
  .clue-head{display:flex;justify-content:space-between;align-items:start;gap:8px}.note{white-space:pre-line}
  .zoom{display:block;width:100%;padding:0;border:0;background:none;cursor:zoom-in}.zoom[aria-pressed=true]{cursor:zoom-out}
  .zoom img{display:block;width:100%;max-height:180px;object-fit:contain;background:#d9e7ec;border-radius:6px}.zoom[aria-pressed=true] img{max-height:none}
  .back{display:none;font-size:12px;color:#176b86}
  @media (max-width:700px){.atlas-body{grid-template-columns:minmax(0,1fr);grid-template-areas:"map" "side" "detail"}.atlas-list{max-height:40vh}.back{display:inline-block}}
`;
const add=(parent,tag,value,cls)=>{const node=document.createElement(tag);if(value!=null)node.textContent=value;if(cls)node.className=cls;parent.append(node);return node};
const svg=(parent,tag,attributes)=>{const node=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [name,value] of Object.entries(attributes))node.setAttribute(name,value);parent.append(node);return node};
const percent=share=>`${(share*100).toFixed(share<0.01?1:0)}%`;
const unseen={state:'new',shown:0,spotted:0};
const stateLabels={new:'New',learning:'Learning',missed:'Missed',retired:'Retired'};
// Subjects in this fixed order: [heading, short chip label]. A pack shows only the subjects its skills use.
const subjectLabels={poles:['Poles','Poles'],landscape:['Landscape','Land'],roads:['Roads','Roads'],car:['Car','Car'],contrast:['Contrasts','vs'],duel:['Your rounds','Yours']};
const modes={regional:['R','Regional: you already identify this country, so these clues place you within it'],identify:['ID','Identify: clues that tell this country apart from what you confuse it with']};

function coverage(skills,status){
  const states=skills.map(skill=>status.get(skill.id)??unseen);
  return {total:states.length,shown:states.filter(item=>item.shown>0).length,retired:states.filter(item=>item.state==='retired').length,missed:states.filter(item=>item.state==='missed').length};
}
// Fill: none shown, some shown, all retired. Missed clues add an amber outline on top of any fill.
const coverageClass=item=>`${item.total&&item.retired===item.total?'done':item.shown?'some':'none'}${item.missed?' missed':''}`;
function totals(pack,status){
  const all=coverage(pack.skills,status),touched=new Set(pack.skills.filter(skill=>status.get(skill.id)?.shown>0).map(skill=>skill.country));
  const countries=pack.atlas.countries.filter(country=>touched.has(country.code)).length;
  return `${countries}/${pack.atlas.countries.length} countries touched · ${all.retired}/${all.total} clues retired · ${all.missed} missed`;
}
export const sprintSummary=(pack,attempts)=>totals(pack,sprintStatus(pack,attempts));

// Source note HTML rebuilt node by node: only p, strong and https links survive; everything else becomes its text.
function copySafe(target,source){
  for(const node of Array.from(source.childNodes??[])){
    if(node.nodeType===3){target.append(node.textContent);continue}
    if(node.nodeType!==1)continue;
    const tag=node.tagName.toLowerCase(),href=node.getAttribute('href')??'';
    if(tag==='p'||tag==='strong'||(tag==='a'&&href.startsWith('https://'))){
      const copy=document.createElement(tag);
      if(tag==='a'){copy.href=href;copy.target='_blank';copy.rel='noopener'}
      copySafe(copy,node);target.append(copy);
    }else copySafe(target,node);
  }
  return target;
}
export const richNote=(parent,html,cls)=>copySafe(add(parent,'div',null,cls),new DOMParser().parseFromString(html??'','text/html').body);
function clueCard(parent,skill,{state,shown,spotted},hydrate){
  const card=add(parent,'article',null,'clue'),head=add(card,'div',null,'clue-head');
  add(head,'strong',skill.title);add(head,'span',stateLabels[state],`chip ${state}`);
  if(skill.tell)add(add(card,'p'),'strong',skill.tell);
  add(card,'p',`shown ${shown} · spotted ${spotted}`,'muted');
  if(!skill.tell&&skill.why)add(card,'p',skill.why);
  if(skill.area)add(card,'p',`Area: ${skill.area}`,'muted');
  const image=skill.imageUrls?.[0];
  if(image?.startsWith('https://')){
    const zoom=add(card,'button',null,'zoom');zoom.type='button';zoom.setAttribute('aria-pressed','false');zoom.setAttribute('aria-label',`Enlarge example image: ${skill.title}`);
    zoom.onclick=()=>zoom.setAttribute('aria-pressed',String(zoom.getAttribute('aria-pressed')!=='true'));
    const img=add(zoom,'img');img.loading='lazy';img.src=image;img.alt=`${skill.title} source example`;
  }
  // Learnable Meta notes are never republished: the userscript fetches them when the card opens.
  if(skill.sourceNoteHtml)richNote(card,skill.sourceNoteHtml,'note');
  else if(hydrate){const note=add(card,'p','Loading source note…','note'),fallback='Open the source link for the full note.';
    hydrate(skill).then(full=>{if(full.sourceNoteHtml){const rich=richNote(card,full.sourceNoteHtml,'note');note.replaceWith(rich)}else note.textContent=fallback}).catch(()=>{note.textContent=fallback})}
  if(skill.source?.url?.startsWith('https://')){const link=add(card,'a',skill.source.title??'Source');link.href=skill.source.url;link.target='_blank';link.rel='noopener noreferrer'}
}

export function renderAtlas(parent,pack,attempts,{progress=true,loadNote}={}){
  const hydrate=loadNote&&(skill=>loadNote(skill,pack.locations?.find(location=>location.skillIds[0]===skill.id)));
  const status=progress?sprintStatus(pack,attempts):new Map();
  const byCountry=Map.groupBy(pack.skills,skill=>skill.country),acow=new Map(pack.atlas.countries.map(country=>[country.code,country]));
  const skillsIn=(code,subject)=>(byCountry.get(code)??[]).filter(skill=>!subject||skill.subject===subject);
  const subjects=Object.keys(subjectLabels).filter(subject=>pack.skills.some(skill=>skill.subject===subject));
  const root=add(parent,'div',null,'atlas');add(root,'style',css);
  const head=add(root,'div',null,'atlas-head');add(head,'h2',pack.title);
  add(head,'p',progress?totals(pack,status):pack.coverageSummary,'muted');
  const legend=add(head,'p',null,'legend');
  for(const [label,cls] of [['None shown','none'],['Some shown','some'],['All retired','done'],['Has missed','none missed'],['Not in ACoW','other']])add(legend,'span',label,'chip '+cls);
  const body=add(root,'div',null,'atlas-body');
  const map=svg(body,'svg',{viewBox:'0 0 360 170',class:'atlas-map',role:'img','aria-label':'World map: A Competitive World countries by clue coverage. The list has the same countries.'});
  const shapes=new Map();
  for(const [code,{d}] of Object.entries(pack.atlas.geometry)){
    const country=acow.get(code),shape=svg(map,'path',{d,class:country?coverageClass(coverage(skillsIn(code),status)):'other'});
    if(!country)continue;
    svg(shape,'title',{}).textContent=`${country.name} · ${percent(country.acowShare)} of ACoW`;
    shape.onclick=()=>select(code);shapes.set(code,shape);
  }
  // Outlines draw over neighbours only when painted last.
  for(const shape of map.querySelectorAll('.missed'))map.append(shape);
  const side=add(body,'div',null,'atlas-side');
  const filter=add(side,'input');filter.type='search';filter.placeholder='Find a country';filter.setAttribute('aria-label','Find a country');
  const list=add(side,'ul',null,'atlas-list');
  const rows=[...pack.atlas.countries].sort((a,b)=>b.acowShare-a.acowShare).map(country=>{
    const row=add(list,'li'),choose=add(row,'button');choose.type='button';choose.onclick=()=>select(country.code);
    add(choose,'span',country.name,'name');if(modes[country.mode])add(choose,'span',modes[country.mode][0],'muted');add(choose,'span',percent(country.acowShare),'muted');
    for(const subject of subjects){const skills=skillsIn(country.code,subject);if(!skills.length)continue;const item=coverage(skills,status);add(choose,'span',`${subjectLabels[subject][1]} ${item.retired}/${item.total}`,'chip '+coverageClass(item))}
    return {country,row};
  });
  filter.oninput=()=>{const query=filter.value.trim().toLowerCase();for(const {country,row} of rows)row.hidden=!!query&&!country.name.toLowerCase().includes(query)&&country.code.toLowerCase()!==query};
  const detail=add(body,'div',null,'atlas-detail');detail.setAttribute('aria-live','polite');
  add(detail,'p','Tap a country on the map or in the list to see its clues.','muted');
  function select(code){
    const country=acow.get(code);
    for(const [key,shape] of shapes)shape.classList.toggle('selected',key===code);
    if(shapes.has(code))map.append(shapes.get(code));
    detail.replaceChildren();
    const back=add(detail,'a','Back to list','back');back.href='#';back.onclick=event=>{event.preventDefault();side.scrollIntoView({behavior:'smooth'})};
    add(detail,'h2',country.name);if(modes[country.mode])add(detail,'p',modes[country.mode][1]);
    add(detail,'p',`${percent(country.acowShare)} of ACoW · ${percent(country.urbanShare)} urban · your ACoW duels: ${country.duelRounds} rounds, ${country.wrongCountry} wrong country`,'muted');
    for(const subject of subjects){
      const skills=skillsIn(code,subject);add(detail,'h3',subjectLabels[subject][0]);
      if(!skills.length)add(detail,'p','No clues in this pack.','muted');
      for(const skill of skills)clueCard(detail,skill,status.get(skill.id)??unseen,hydrate);
    }
    detail.scrollIntoView?.({block:'nearest',behavior:'smooth'});
  }
}
