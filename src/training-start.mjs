// Training pack start panel (the practice map page) and the look board, in the proto-v2 style: tiles with n, the focus
// country map shaded by current miss probability, due counts, Play, Look board, the manual-meta-keys setting.
// Key D toggles the debug view: the ranked candidates of the next set with every score term.
import {screen,node,board,shortRegion,metaPopover,HOST_ID} from './training-ui.mjs';
import {boardSpots} from './boards.mjs';
import {regionMap} from './region-map.mjs';
import {learnerModel} from './deal.mjs';
import {dealTiles,dueCounts} from './deal-stats.mjs';

const pct=value=>value===null||value===undefined?'–':Math.round(value*100)+'%';
const signed=(value,unit='')=>value>0?`+${value}${unit}`:`${value}${unit}`;
export const PILL_ID='fieldwork-training-pill';

/** options: attempts, onPlay() (prepares and launches the next set), manual + onManual(bool), packs + onChoosePack(id),
 *  onExport(), onReset() (debug view: erase the training history), message, debugPlan() (the planDeal result for the
 *  debug view), now. */
export function trainingStart(pack,options={}){
  const {attempts=[],onPlay,manual=false,onManual,packs=[],onChoosePack,onExport,onReset,message=null,debugPlan,now=Date.now(),random=Math.random}=options;
  document.getElementById(PILL_ID)?.remove();
  let debug=null;
  const {scr,close}=screen({onClose:()=>pill(pack,()=>trainingStart(pack,{...options,message:null})),onKey:event=>{
    if(/^(INPUT|SELECT)$/.test(event.composedPath()[0]?.tagName??''))return false;
    if(event.key==='d'||event.key==='D'){toggleDebug();return true}
    if(debug&&(event.key==='r'||event.key==='R')){resetHistory();return true}
    if(event.key==='Enter'){play.click();return true}
    if(event.key==='l'||event.key==='L'){look.click();return true}
    return false;
  }});
  scr.dataset.screen='start';
  const page=node(scr,'div','page'),mast=node(page,'div','mast');node(mast,'h1',null,'Fieldwork');
  node(mast,'span','date',new Date(now).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}));
  node(mast,'span').style.flex='1';node(mast,'span','date',pack.title);
  const wrap=node(page,'div');Object.assign(wrap.style,{display:'grid',gridTemplateColumns:'1.2fr 1fr',gap:'40px',paddingTop:'22px'});
  const left=node(wrap,'div'),right=node(wrap,'div');
  const tiles=dealTiles(attempts,{now});
  node(left,'p','kick',`Last ${tiles.days} days · new spots only`);
  const row=node(left,'div','tiles');
  for(const [value,change,label] of [[pct(tiles.countryRate),tiles.change&&signed(Math.round(tiles.change.countryRate*100)),`country hit rate · n=${tiles.n}`],
    [tiles.points?.toLocaleString('en-US')??'–',tiles.change&&signed(tiles.change.points),`points per round${tiles.pointsSe!==null?` · ±${tiles.pointsSe}`:''}`],
    [pct(tiles.fixRate),null,`fix rate · n=${tiles.fixN}`]]){
    const tile=node(row,'div','tile'),big=node(tile,'b',null,value+' ');if(change)node(big,'span',change.startsWith('-')?'down':'up',change);node(tile,'small',null,label)}
  // Only real misses are due (Fieldwork misses, metas seen in lost duel rounds), and a due meta only when some unplayed
  // spot shows it.
  const shownSoFar=[...(options.history?.played??[]),...(options.history?.burned??[])];
  const due=dueCounts(pack,attempts,now,shownSoFar),parts=[[due.metas,'meta'],[due.regions,'region']].filter(([n])=>n).map(([n,label])=>`${n} ${label}${n===1?'':'s'}`);
  node(left,'p','kick',parts.length?`Due now · ${parts.join(' · ')}`:'New · nothing due yet').style.marginTop='22px';
  const actions=node(left,'div','actions'),play=node(actions,'button','go ink','Play');play.type='button';node(play,'kbd',null,'Enter');
  const look=node(actions,'button','go','Look board');look.type='button';node(look,'kbd',null,'L');
  const status=node(left,'p','detail',message??'');status.setAttribute('role','status');status.style.fontSize='14px';
  // onPlay(progress): starts the game at once when the next set is already on the map; else it calls progress(text)
  // while the set is placed (a slim status line), then starts.
  play.onclick=async()=>{play.disabled=true;status.textContent='';
    try{await onPlay?.(text=>{status.textContent=text})}catch(error){status.textContent=String(error?.message??error);play.disabled=false}};
  look.onclick=()=>lookBoard(pack,{random,history:options.history,onBack:()=>trainingStart(pack,{...options,message:null}),region:weakest(pack,attempts,now)});
  const settings=node(left,'label');Object.assign(settings.style,{display:'block',marginTop:'18px',fontSize:'13px',color:'#727272'});
  const box=node(settings,'input');box.type='checkbox';box.checked=manual;box.onchange=()=>{options.manual=box.checked;onManual?.(box.checked)};
  settings.append(' Manual meta keys (U used it / N didn’t notice); off = graded from your pin');
  if(packs.length>1){const choose=node(left,'select');Object.assign(choose.style,{marginTop:'12px',font:'13px Libre Franklin,Arial'});
    for(const item of packs){const option=node(choose,'option',null,item.title);option.value=item.id;option.selected=item.id===pack.id}choose.onchange=()=>onChoosePack?.(choose.value)}
  if(onExport){const exportButton=node(left,'button',null,'Export progress');exportButton.type='button';Object.assign(exportButton.style,{marginLeft:'12px',font:'12px Libre Franklin,Arial',padding:'4px 8px'});exportButton.onclick=onExport}
  // Right: the focus country, regions shaded by the current miss probability, and the duel focus scores.
  const focus=pack.focus?.country;
  if(focus){
    node(right,'p','kick','Focus · picked from your duels');
    const model=learnerModel(pack,attempts,now),shade={};
    for(const [region,info] of Object.entries(pack.regions??{}))if(info.country===focus){
      const stats=model.regions.get(region);if(!stats)continue;
      const miss=(1+stats.misses)/(2+stats.misses+stats.hits);shade[region]=`rgba(192,57,43,${(0.15+0.85*miss).toFixed(2)})`;
    }
    const map=regionMap(pack,{countries:[focus],shade}).node;map.style.maxWidth='560px';right.append(map);
    node(right,'p','kick','Where points leak · focus score').style.marginTop='16px';
    const scores=(pack.focus.scores??[]).slice(0,5),top=Math.max(...scores.map(item=>item.score),1);
    for(const item of scores){const line=node(right,'div');Object.assign(line.style,{display:'grid',gridTemplateColumns:'150px 1fr 70px',gap:'10px',alignItems:'center',margin:'7px 0',fontSize:'14px'});
      node(line,'span',null,item.country);const bar=node(line,'span');Object.assign(bar.style,{height:'10px',background:'#c0392b',width:`${100*item.score/top}%`});
      node(line,'span',null,`${Math.round(item.score)} · n=${item.n}`).style.color='#727272'}
  }
  function toggleDebug(){
    if(debug){debug.remove();debug=null;return}
    debug=node(scr,'div');Object.assign(debug.style,{position:'absolute',inset:'60px 40px 30px 76px',background:'#fff',border:'2px solid #121212',overflow:'auto',padding:'14px',zIndex:20,font:'12px/1.4 ui-monospace,monospace'});
    debug.dataset.debug='1';
    // R or this button: erase the training history (onReset confirms first, then deletes and re-renders the panel).
    if(onReset){const reset=node(debug,'button',null,'Reset training history');reset.type='button';node(reset,'kbd',null,'R');
      Object.assign(reset.style,{float:'right',font:'12px Libre Franklin,Arial',padding:'4px 8px'});reset.onclick=resetHistory}
    const plan=debugPlan?.();
    if(!plan){node(debug,'p',null,'No plan available.');return}
    node(debug,'p',null,`Next set: ${plan.reasons.join(' · ')}`).style.fontWeight='700';
    const table=node(debug,'table');table.style.borderCollapse='collapse';
    const columns=['acow','miss','confusion','novelty','fade','due','metaWeak','metaNovelty','rural'];
    const head=node(table,'tr');for(const label of ['picked','region','score',...columns])node(head,'th',null,label).style.textAlign='left';
    for(const item of plan.candidates){const tr=node(table,'tr');if(item.picked)tr.style.background='#fbeee4';
      const cells=[item.picked??'',item.region,item.score.toExponential(2),...columns.map(key=>Number(item.terms[key]).toFixed(3))];
      for(const value of cells){const td=node(tr,'td',null,value);td.style.padding='2px 10px 2px 0'}}
  }
  function resetHistory(){if(onReset)onReset()}
  return {close,scr,toggleDebug};
}
// The region with the highest mean miss probability among regions played; the focus country's first region otherwise.
function weakest(pack,attempts,now){
  const model=learnerModel(pack,attempts,now);let best=null,top=-1;
  for(const [region,stats] of model.regions){const miss=(1+stats.misses)/(2+stats.misses+stats.hits);if(pack.regions?.[region]&&miss>top){top=miss;best=region}}
  return best??Object.keys(pack.regions??{}).find(region=>pack.regions[region].country===pack.focus?.country)??null;
}
/** Reopens the start panel after it was closed: one small button, bottom left. */
function pill(pack,reopen){
  document.getElementById(PILL_ID)?.remove();
  const button=document.createElement('button');button.id=PILL_ID;button.type='button';button.textContent='Fieldwork';
  Object.assign(button.style,{position:'fixed',left:'18px',bottom:'18px',zIndex:9999,font:'700 14px Libre Franklin,Arial',padding:'10px 16px',background:'#121212',color:'#fff',border:0,cursor:'pointer'});
  button.onclick=()=>{button.remove();reopen()};document.body.append(button);
}
/** Look board: four photos of one region (study, earlier board photos, then duel/Sprint panoramas; never a panorama
 *  played in training, and browsing never burns a playable spot), the country map with it shaded red. Space reshuffles,
 *  ← → change region (the focus country first, then by ACoW share), Esc goes back. `history`: boardHistory(). */
export function lookBoard(pack,{region=null,onBack,random=Math.random,history={}}={}){
  const share=pack.acow??{},focus=pack.focus?.country;
  const withStudy=new Set(pack.locations.filter(location=>location.split==='study'||location.split==='seen').map(location=>location.region));
  const regions=Object.keys(pack.regions??{}).filter(name=>withStudy.has(name))
    .sort((a,b)=>(pack.regions[b].country===focus)-(pack.regions[a].country===focus)||(share[pack.regions[b].country]??0)-(share[pack.regions[a].country]??0)||a.localeCompare(b));
  let index=Math.max(0,regions.indexOf(region)),shown=new Set();
  const {scr}=screen({onClose:onBack,onKey:event=>{
    if(event.code==='Space'){draw();return true}
    if(event.key==='ArrowRight'){index=(index+1)%regions.length;shown=new Set();draw();return true}
    if(event.key==='ArrowLeft'){index=(index+regions.length-1)%regions.length;shown=new Set();draw();return true}
    return false;
  }});
  scr.dataset.screen='look';
  const holder=node(scr,'div','beat on'),popover=metaPopover(scr,pack,{manual:false,grades:{}});
  function draw(){
    holder.replaceChildren();const name=regions[index];if(!name)return;
    const pick=exclude=>boardSpots(pack,name,{...history,exclude,random,burn:false}).spots;
    let spots=pick(shown);if(spots.length<4){shown=new Set();spots=pick(shown)}
    spots.forEach(spot=>shown.add(spot.id));scr.dataset.region=name;
    board(holder,pack,name,spots,{popover});
  }
  draw();
  return {scr,regions};
}
export {HOST_ID,shortRegion};
