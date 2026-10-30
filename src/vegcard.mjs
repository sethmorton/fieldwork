// US Vegetation card (pack.card 'veg', tools/world-pack/usveg.py): the Tree Atlas reveal, compact. Top line, the still with
// numbered boxes beside the "So" map, one tile per cue (crop of its box, first clause big, species range and photo),
// then the same feature in other panoramas of the region. Images come through loadImage (object URLs; on GeoGuessr a
// GM blob request to the local installer), so nothing here fetches cross-origin itself. A miss leads with one contrast rule
// (pack.contrasts, else both vibe lines) and only the boxes it names; the rest sits behind More (M).
import {pairKey} from './sprint.mjs';
const COLS=['#22d3ee','#fb923c','#facc15','#c084fc','#4ade80','#f472b6'],W=1600,H=1000,MAX_ZOOM=1.25,TILE=1.9;
const CSS=`
.veg{display:grid;gap:10px}.veg figure{margin:0}.veg .img{background:#c9d8de center/cover no-repeat;border-radius:6px;position:relative;cursor:zoom-in;overflow:hidden}
.vtop{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;margin:4px 0 0;font:700 21px/1.2 'Trebuchet MS',Arial,sans-serif}.vtop.ok{color:#276b50}.vtop.bad{color:#b4471a}
.verr{margin:0;padding:6px 10px;border-radius:6px;background:#fbeee4;color:#7d3410;font:600 13px/1.3 Arial}
.vtop .st{font-weight:400;color:#496b79}.vtop small{font:600 14px/1.3 Arial,sans-serif;text-transform:none;letter-spacing:0;color:#7d3410}
.vrule{margin:0;font:700 24px/1.25 'Trebuchet MS',Arial,sans-serif;color:#0f2c37}.vrule.two{font-size:17px;font-weight:600}
.vcheck{margin:0;font:600 13px/1.3 Arial;color:#496b79;text-transform:uppercase;letter-spacing:.05em}
.vfold>summary{cursor:pointer;font:600 13px/1.3 Arial;color:#496b79;padding:2px 0}.vfold>summary kbd{margin-left:4px;padding:0 5px;border:1px solid #9fb3bb;border-radius:3px;font:600 11px Arial}.vfold[open]{display:grid;gap:10px}
.vrow{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:10px;align-items:start}
.vstill{aspect-ratio:1.6}.vbox{position:absolute;border:2.5px solid var(--c);border-radius:3px;box-shadow:0 0 0 1px #0008,inset 0 0 0 1px #0006;pointer-events:none}
.vbox b{position:absolute;left:0;top:0;white-space:nowrap;min-width:18px;padding:0 4px;background:var(--c);color:#0b1d24;font:700 12px/16px Arial;text-align:center;border-radius:0 0 3px 0}
.vso p{margin:0;font:600 12px/1.3 Arial;color:#496b79;text-transform:uppercase;letter-spacing:.05em}.vso strong{display:block;font:700 17px/1.2 'Trebuchet MS',Arial;color:#0b5d3b;text-transform:none;letter-spacing:0;margin:1px 0 4px}
.vso .vibe{margin-top:6px;font:13px/1.35 Arial;color:#153946;text-transform:none;letter-spacing:0}
.vmap{display:block;width:100%;height:auto}.vmap path{stroke:#fff;stroke-width:.6}.vmap .pin{fill:#e4572e;stroke:#fff;stroke-width:2.5}
.vcues{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}
.vcue{border-top:4px solid var(--c);background:#fff;border-radius:6px;padding:6px;display:grid;gap:4px;align-content:start}
.vcue .img{width:100%;aspect-ratio:${TILE}}.vcue .big{font:700 13.5px/1.25 Arial;color:#0f2c37}.vcue .big i{font-style:normal;display:inline-block;min-width:17px;margin-right:5px;background:var(--c);border-radius:3px;text-align:center;color:#0b1d24;box-shadow:inset 0 0 0 1px #0b1d2455}
.vcue .vrest{font:12px/1.3 Arial;color:#496b79;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.vsp{display:grid;grid-template-columns:56px minmax(0,1fr);gap:2px 6px;align-items:center}.vsp .img{height:56px}.vsp .vmap{height:56px;width:auto;max-width:100%}
.vsp small{grid-column:1/-1;font:600 11px/1.2 Arial;color:#153946;text-transform:none;letter-spacing:0}.vsp small.common{font-weight:400;color:#6a8794}
.vmore{display:grid;grid-template-columns:84px repeat(3,minmax(0,1fr));gap:8px;align-items:center}.vmore p{margin:0;overflow-wrap:anywhere;font:600 12px/1.3 Arial;color:#496b79;text-transform:uppercase;letter-spacing:.05em}.vmore .img{aspect-ratio:1.6}
.vcmp{display:grid;grid-template-columns:1fr 1fr;gap:10px}.vcmp>div{background:#fff;border-radius:6px;padding:8px;display:grid;gap:6px;align-content:start;border-top:4px solid #0b5d3b}.vcmp>.pin{border-top-color:#e4572e}
.vlab{margin:0;font:13px/1.25 Arial;color:#496b79}.vlab b{font:700 15px/1.25 'Trebuchet MS',Arial;color:#0f2c37}.vvibe{margin:0;font:12px/1.3 Arial;color:#153946;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.vthumbs{display:grid;grid-template-columns:1fr 1fr;gap:6px}.vthumbs .img{aspect-ratio:1.6}.vthumbs .vbox b{font-size:10px;line-height:13px;min-width:13px;padding:0 2px}
.vtrees{display:grid;gap:5px}.vtree{display:grid;grid-template-columns:44px minmax(0,1fr);gap:7px;align-items:center}.vtree .img{height:44px;border-radius:5px}.vtree .none{display:block;background:#e3e9ec;cursor:default}
.vtree b{display:block;font:700 13px/1.2 Arial;color:#0f2c37}.vtree small{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font:11.5px/1.3 Arial;color:#496b79;text-transform:none;letter-spacing:0}
.vhere{display:grid;grid-template-columns:84px minmax(0,1fr);gap:8px;align-items:center}.vhere>p{margin:0;font:600 12px/1.3 Arial;color:#496b79;text-transform:uppercase;letter-spacing:.05em}.vhere .vtrees{grid-template-columns:repeat(3,minmax(0,1fr))}
dialog.vview{width:100vw;height:100vh;max-width:none;max-height:none;margin:0;padding:16px;border:0;background:#0b1d24f5;color:#e8f1f4;display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:16px;cursor:zoom-out}
.vmain{display:grid;place-items:center;min-height:0}.vframe{position:relative;margin:0;aspect-ratio:1.6;width:min(100%,calc((100vh - 32px)*1.6))}.vframe img{display:block;width:100%;height:100%;max-height:none;border-radius:6px;background:#173440}
.vframe.free{aspect-ratio:auto;width:auto;height:calc(100vh - 32px)}.vframe.free img{width:auto;height:100%;object-fit:contain}
.vframe .vbox{border-width:3px}.vframe .vbox b{font-size:15px;line-height:20px;min-width:22px}
.vside{align-self:center;display:grid;gap:10px}.vside h3{margin:0;font:700 22px/1.2 'Trebuchet MS',Arial;color:#fff}.vmeta{margin:0;font:12px/1.4 Arial;color:#9fbac4}
.vtbox{position:absolute;border:1.5px solid #fff;border-radius:2px;box-shadow:0 0 0 1px #0009;pointer-events:none}.vtbox b{position:absolute;left:-1.5px;bottom:100%;white-space:nowrap;padding:1px 5px;background:#fffffff0;color:#0b1d24;font:600 12px/16px Arial;border-radius:3px 3px 3px 0}
.vtoggle{display:flex;gap:6px;align-items:center}.vtoggle button{padding:5px 12px;border-radius:6px;border:1px solid #6d8c97;background:none;color:#e8f1f4;cursor:pointer;font:600 13px Arial}.vtoggle button.on{background:#e8f1f4;color:#0b1d24}.vtoggle kbd{color:#9fbac4}
.vlist li.tree{display:block;font:14px/1.3 Arial}
.vlist{list-style:none;margin:0;padding:0;display:grid;gap:10px}.vlist li{display:grid;grid-template-columns:26px 1fr;gap:8px;font:14px/1.4 Arial}.vlist i{font:700 14px/24px Arial;font-style:normal;text-align:center;background:var(--c);color:#0b1d24;border-radius:4px;height:24px}.vlist b{display:block;color:#fff}
`;
const el=(parent,tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;parent?.append(node);return node};
const svgEl=(parent,tag,attrs)=>{const node=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,v);parent.append(node);return node};
const pct=v=>`${(v*100).toFixed(2)}%`;

// d3.geoAlbersUsa, the same constants as usveg.py's project(): lower 48, Alaska and Hawaii insets.
const K=1070,INSETS={lower48:[29.5,45.5,96,-0.6,38.7,K,480,250],alaska:[55,65,154,-2,58.5,.35*K,480-.307*K,250+.201*K],hawaii:[8,18,157,-3,19.9,K,480-.205*K,250+.212*K]};
export function albersUsa(lng,lat){
  const [p0,p1,rot,clng,clat,k,tx,ty]=INSETS[lat>50&&(lng<-129||lng>170)?'alaska':lat<24&&lng<-150?'hawaii':'lower48'],rad=Math.PI/180;
  const s0=Math.sin(p0*rad),n=(s0+Math.sin(p1*rad))/2,c=1+s0*(2*n-s0),r0=Math.sqrt(c)/n;
  const raw=(l,p)=>{const r=Math.sqrt(c-2*n*Math.sin(p))/n;return [r*Math.sin(l*n),r0-r*Math.cos(l*n)]};
  const [cx,cy]=raw(clng*rad,clat*rad),[px,py]=raw((((lng+rot+180)%360+360)%360-180)*rad,lat*rad);
  return [tx+k*(px-cx),ty-k*(py-cy)];
}
export function km(a,b){
  const rad=Math.PI/180,h=Math.sin((b.lat-a.lat)*rad/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin((b.lng-a.lng)*rad/2)**2;
  return Math.round(12742*Math.asin(Math.sqrt(h)));
}
// The giveaway's first clause big, the rest small; 16 words at most in all.
export function clauses(text){
  const words=text.trim().split(/\s+/),short=words.slice(0,16).join(' ')+(words.length>16?'…':'');
  const cut=short.search(/[:;—]\s|\s-\s/);
  return cut>0?[short.slice(0,cut),short.slice(cut+1).trim().replace(/^-\s*/,'')]:[short,''];
}
/** The image window showing a box: padded 18% a side, at the tile's aspect, never shown past MAX_ZOOM source pixels at
 *  tileWidth. Returns fractions of the image: [x0, y0, cw, ch]. */
export function cropWindow([x,y,w,h],tileWidth,aspect=1.6){
  let cw=Math.max(1.36*w,tileWidth/(MAX_ZOOM*W)),ch=Math.max(1.36*h,cw*W/aspect/H);
  cw=Math.max(cw,ch*H*aspect/W);
  const s=Math.min(1,1/cw,1/ch);cw*=s;ch*=s;
  const start=(mid,len)=>Math.min(1-len,Math.max(0,mid-len/2));
  return [start(x+w/2,cw),start(y+h/2,ch),cw,ch];
}
// All regions filled by `fill`; `region` outlined; `pin` a dot; `focus` zooms to that region and the pin (at least 28% of
// the US wide, so neighbours keep it placed; small Alaska/Hawaii inset regions still read).
function regionMap(parent,pack,fill,{region,pin,focus}={}){
  const {viewBox,regions}=pack.vegMap;let [vx,vy,vw,vh]=viewBox;
  const at=pin&&albersUsa(pin.lng,pin.lat),aspect=vw/vh;
  if(focus&&regions[focus]){
    const n=regions[focus].match(/-?\d+(?:\.\d+)?/g).map(Number),xs=n.filter((_,i)=>i%2===0).concat(at?[at[0]]:[]),ys=n.filter((_,i)=>i%2).concat(at?[at[1]]:[]);
    const [x0,x1,y0,y1]=[Math.min(...xs),Math.max(...xs),Math.min(...ys),Math.max(...ys)];
    let w=Math.max(1.8*(x1-x0),0.28*vw,1.8*(y1-y0)*aspect);w=Math.min(w,vw);const h=w/aspect;
    vx=Math.min(Math.max((x0+x1-w)/2,viewBox[0]),viewBox[0]+vw-w);vy=Math.min(Math.max((y0+y1-h)/2,viewBox[1]),viewBox[1]+vh-h);vw=w;vh=h;
  }
  const svg=svgEl(parent,'svg',{class:'vmap',viewBox:[vx,vy,vw,vh].map(v=>Math.round(v)).join(' '),role:'img'});
  for(const [code,d] of Object.entries(regions))svgEl(svg,'path',{d,fill:fill(code)});
  if(region&&regions[region])svgEl(svg,'path',{d:regions[region],fill:'none',stroke:'#0b1d24','stroke-width':2.2,'vector-effect':'non-scaling-stroke'});
  if(at)svgEl(svg,'circle',{class:'pin',cx:at[0].toFixed(1),cy:at[1].toFixed(1),r:(vw/45).toFixed(1)});
  return svg;
}
// One number per feature (repeats share it), one-off cues their own; colours by the feature's index in the region.
function groupsOf(skill,loc){
  const feats=skill.features??[],featureOf=id=>{const index=feats.findIndex(f=>f.id===id);return index<0?{col:'#ffffff'}:{...feats[index],col:COLS[index%COLS.length]}};
  return {featureOf,groups:Object.values(Object.groupBy(loc.giveaways??[],(g,i)=>g.feature??`one-off ${i}`)).map(gs=>({gs,F:featureOf(gs[0].feature)}))};
}
// The same feature in up to 3 other panoramas of this region, clearest (largest box) first.
function recurrence(pack,skill,loc,groups){
  const ids=groups.map(({gs})=>gs[0].feature).filter(Boolean),area=b=>b[2]*b[3];
  return pack.locations.filter(other=>other.skillIds[0]===skill.id&&other.id!==loc.id).map(other=>{
    const g=other.giveaways.filter(g=>ids.includes(g.feature)).sort((a,b)=>ids.indexOf(a.feature)-ids.indexOf(b.feature)||area(b.box)-area(a.box))[0];
    return g&&{other,g};
  }).filter(Boolean).sort((a,b)=>ids.indexOf(a.g.feature)-ids.indexOf(b.g.feature)||area(b.g.box)-area(a.g.box)).slice(0,3);
}
/** Image files (relative to pack.imageBase) a location's card shows: the still, species photos, recurrence thumbnails.
 *  Continue prefetches them, so a card still renders if the installer stops mid-game. */
export function cardImages(pack,loc){
  const skill=pack.skills.find(item=>item.id===loc.skillIds[0]),{groups}=groupsOf(skill,loc);
  return [loc.img,...groups.slice(0,4).map(({F})=>F.species&&F.ref).filter(Boolean),...recurrence(pack,skill,loc,groups).map(({other})=>`t/${other.img}`),
    ...(skill.trees??[]).slice(0,3).map(tree=>tree.ref).filter(Boolean)];
}
// Never "reload": a reload on a GeoGuessr results page can resume the next round (AGENTS.md). Retry re-asks loadImage,
// which forgets failed requests, so starting the installer and pressing Retry fills the card in place.
export const IMAGES_OFFLINE='Images need the Fieldwork installer: run npm run serve in ~/Desktop/code/fieldwork, then press Retry';
// Two panoramas of a region for the wrong-pin comparison: this round's season first, then ones the learner has not seen,
// then pack order (which rotates states and seasons).
export function regionThumbs(pack,skill,{exclude,season,seen=new Set()}={},n=2){
  return pack.locations.map((location,index)=>({location,index})).filter(({location})=>location.skillIds[0]===skill.id&&location.id!==exclude)
    .sort((a,b)=>(b.location.season===season)-(a.location.season===season)||seen.has(a.location.id)-seen.has(b.location.id)||a.index-b.index)
    .slice(0,n).map(({location})=>location);
}
export function vegCard(card,skill,round,pack,{loadImage,seen=new Set()}){
  el(card,'style',null,CSS);
  const veg=el(card,'div','veg'),loc=round.location,base=pack.imageBase,skillOf=location=>pack.skills.find(item=>item.id===location.skillIds[0]);
  // One line, once, when any image cannot load (not prefetched and the installer is not running), with one Retry for all.
  let offline=null;const failed=[];
  const show=(node,file)=>loadImage(base+file).then(url=>{node.style.backgroundImage=`url("${url}")`},()=>{failed.push([node,file]);
    if(offline)return;offline=el(null,'p','verr',IMAGES_OFFLINE+' ');top.after(offline);
    const retry=el(offline,'button',null,'Retry');retry.type='button';
    retry.onclick=()=>{offline.remove();offline=null;failed.splice(0).forEach(([n,f])=>show(n,f))}});
  // Every image opens the viewer: full size, with its panorama's boxes and giveaway list; arrows step through this card's.
  const views=[];
  const image=(node,file,{full=file,location=null,caption=''}={})=>{show(node,file);
    let index=views.findIndex(view=>view.file===full);if(index<0)index=views.push({file:full,location,caption})-1;
    node.onclick=()=>openViewer(index);node.setAttribute('role','img');node.title||=caption||skillOf(location??loc).title;return node};
  const boxed=(node,[x,y,w,h],col,label,[x0,y0,cw,ch]=[0,0,1,1])=>{const b=el(node,'i','vbox');b.style.cssText=`--c:${col};left:${pct((x-x0)/cw)};top:${pct((y-y0)/ch)};width:${pct(w/cw)};height:${pct(h/ch)}`;if(label)el(b,'b',null,label)};
  const allBoxes=(node,location)=>groupsOf(skillOf(location),location).groups.forEach(({gs,F},i)=>gs.forEach(g=>boxed(node,g.box,F.col,String(i+1))));
  function openViewer(start){
    // A panorama with per-tree labels (location.trees) opens on 'Trees'; T switches to the numbered clue boxes and back.
    let index=start,mode=null;const dialog=el(null,'dialog','vview');card.getRootNode().append(dialog);
    const draw=()=>{
      dialog.replaceChildren();const view=views[index],main=el(dialog,'div','vmain'),side=el(dialog,'div','vside');
      const frame=el(main,'figure',view.location?'vframe':'vframe free'),img=el(frame,'img');img.alt=view.caption||skillOf(view.location).title;
      loadImage(base+view.file).then(url=>{img.src=url},()=>{});
      if(view.location){
        const owner=skillOf(view.location),labelled=view.location.trees?.length>0,shown=labelled?mode??'trees':'clues';
        el(side,'h3',null,`${owner.title}${view.location.state?`, ${view.location.state}`:''}`);
        if(view.location.season)el(side,'p','vmeta',`${view.location.season}${view.location.date?` ${view.location.date}`:''}`);
        if(labelled){const toggle=el(side,'div','vtoggle');
          for(const [value,label] of [['trees','Trees'],['clues','Clues']]){const choice=el(toggle,'button',value===shown?'on':null,label);choice.type='button';
            choice.onclick=event=>{event.stopPropagation();mode=value;draw()}}
          el(toggle,'kbd',null,'T');}
        const list=el(side,'ol','vlist');
        if(shown==='trees')view.location.trees.forEach(tree=>{
          const tag=`${tree.label}${tree.confidence==='medium'?'?':''}`,box=el(frame,'i','vtbox'),[x,y,w,h]=tree.box;
          box.style.cssText=`left:${pct(x)};top:${pct(y)};width:${pct(w)};height:${pct(h)}`;el(box,'b',null,tag);
          el(el(list,'li','tree'),'span',null,tag)});
        else{allBoxes(frame,view.location);
          groupsOf(owner,view.location).groups.forEach(({gs,F},i)=>{const item=el(list,'li');item.style.setProperty('--c',F.col);el(item,'i',null,String(i+1));
            const text=el(item,'div');if(F.name)el(text,'b',null,F.name);el(text,'span',null,gs.map(g=>g.text).join(' '))});}
      }else el(side,'h3',null,view.caption);
      el(side,'p','vmeta',`${index+1} of ${views.length}. Arrow keys step, Esc or a click closes.`);
    };
    dialog.onclick=()=>dialog.close();
    dialog.addEventListener('keydown',event=>{
      if(event.key==='ArrowRight'||event.key==='ArrowLeft'){index=(index+(event.key==='ArrowRight'?1:views.length-1))%views.length;draw();event.preventDefault()}
      else if(event.key.toLowerCase()==='t'&&views[index].location?.trees?.length){mode=(mode??'trees')==='trees'?'clues':'trees';draw();event.preventDefault()}
      event.stopPropagation()});
    dialog.onclose=()=>dialog.remove();draw();dialog.showModal();
  }
  // Key trees as photo chips: ref photo and common name, with the species card's one-line look when `lines`.
  const trees=(parent,owner,lines)=>{const list=el(parent,'div','vtrees');
    for(const tree of (owner.trees??[]).slice(0,3)){const chip=el(list,'div','vtree');
      if(tree.ref)image(el(chip,'div','img'),tree.ref,{caption:tree.name});else el(chip,'span','img none');
      const words=el(chip,'div');el(words,'b',null,tree.name);if(lines&&tree.line)el(words,'small',null,tree.line);}
    return list};
  // Top line: geography decides it; 1/2/3 still grade recognition below. A warm-up close pin (right L2 family) reads ≈.
  const wrong=!round.correct,top=el(veg,'p',`vtop ${wrong&&!round.close?'bad':'ok'}`),pinned=wrong&&pack.skills.find(item=>item.region===round.guessedRegion);
  el(top,'span',null,`${!wrong?'✓':round.close?'≈ right area:':'✗'} ${skill.title}`);if(loc.state)el(top,'span','st',loc.state);
  if(wrong&&round.guess)el(top,'small',null,`you pinned ${pinned?.title??'outside the US regions'}, ${km(round.guess,loc).toLocaleString('en-US')} km`);
  // ruleCheck is 'true|pinned' of the miss that set this check (sprint.mjs ruleCheckFor), named in that order.
  if(round.ruleCheck)el(veg,'p','vcheck',`Rule check: ${round.ruleCheck.split('|').map(code=>pack.skills.find(item=>item.region===code)?.title??code).join(' vs ')}`);
  const {featureOf,groups}=groupsOf(skill,loc);
  // A miss leads with this panorama's giveaway that best separates the true region from the pinned one, with only its box
  // (labelled); with none above HEADLINE_MIN, the pair's contrast rule and the boxes it names (else the view's top two).
  // Everything else waits in More.
  const lead=wrong&&pinned&&round.guess?headline(skill,pinned,loc,round.guess):null;
  const takeaway=lead??(wrong&&(pinned?contrast(pack,skill,pinned):{lines:[skill.why].filter(Boolean),features:[]}));
  if(takeaway)takeaway.lines.forEach((line,i)=>el(veg,'p',takeaway.lines.length===1||lead&&!i?'vrule':'vrule two',line));
  const named=lead?[lead.index]:takeaway&&groups.map((group,i)=>i).filter(i=>takeaway.features.includes(groups[i].gs[0].feature)).slice(0,2);
  const boxedGroups=!takeaway?groups.map((group,i)=>i):named.length?named:[0,1].filter(i=>i<groups.length);
  const row=el(veg,'div','vrow'),still=image(el(row,'figure','img vstill'),loc.img,{location:loc});still.setAttribute('aria-label',`${skill.title}: this round's view`);
  if(lead)boxed(still,groups[lead.index].gs[0].box,groups[lead.index].F.col,lead.label);
  else for(const i of boxedGroups)groups[i].gs.forEach(g=>boxed(still,g.box,groups[i].F.col,String(i+1)));
  const so=el(row,'div','vso');el(so,'p',null,'So:');el(so,'strong',null,skill.title);
  regionMap(so,pack,code=>code===skill.region?'#0b5d3b':wrong&&code===round.guessedRegion?'#efb08c':'#d5dcd8',{pin:wrong?round.guess:null,focus:skill.region});
  if(!wrong&&skill.why)el(so,'p','vibe',skill.why);
  // Right pins keep the first three cue tiles in view. More (M) holds the rest: the wrong-pin comparison, other cues,
  // key trees and the same feature in other panoramas of this region.
  if(!wrong)cueTiles(veg,groups.slice(0,3).map((group,i)=>i));
  const fold=el(veg,'details','vfold'),summary=el(fold,'summary',null,'More ');el(summary,'kbd',null,'M');
  if(pinned){
    const compare=el(fold,'div','vcmp');
    for(const [owner,label,cls] of [[pinned,'You pinned','pin'],[skill,'It was','was']]){
      const column=el(compare,'div',cls),head=el(column,'p','vlab');el(head,'span',null,`${label}: `);el(head,'b',null,owner.title);
      if(owner.why)el(column,'p','vvibe',owner.why);
      const thumbs=regionThumbs(pack,owner,{exclude:loc.id,season:loc.season,seen});
      if(thumbs.length){const strip=el(column,'div','vthumbs');for(const other of thumbs)allBoxes(image(el(strip,'figure','img'),`t/${other.img}`,{full:other.img,location:other}),other);}
      trees(column,owner,true);
    }
  }
  if(wrong)cueTiles(fold,groups.slice(0,4).map((group,i)=>i).filter(i=>!boxedGroups.includes(i)));
  if(!pinned&&skill.trees?.length){const strip=el(fold,'div','vhere');el(strip,'p',null,'Trees here');trees(strip,skill,true);}
  const more=recurrence(pack,skill,loc,groups);
  if(more.length){
    const strip=el(fold,'div','vmore');el(strip,'p',null,`More ${skill.title}`);
    for(const {other,g} of more){const F=featureOf(g.feature),thumb=image(el(strip,'figure','img'),`t/${other.img}`,{full:other.img,location:other});
      thumb.title=`${other.state??''} ${other.season??''}`.trim();boxed(thumb,g.box,F.col,String(groups.findIndex(({gs})=>gs[0].feature===g.feature)+1))}
  }
  if(!fold.children[1])fold.remove();
  // One tile per cue (by group index): crop of its box, first clause big, species range and photo.
  function cueTiles(parent,indexes){
    if(!indexes.length)return;
    const cues=el(parent,'div','vcues');
    for(const i of indexes){const {gs,F}=groups[i];
      const tile=el(cues,'div','vcue');tile.style.setProperty('--c',F.col);
      const window=cropWindow(gs[0].box,180,TILE),crop=image(el(tile,'div','img'),loc.img,{location:loc}),[x0,y0,cw,ch]=window;
      crop.style.backgroundSize=`${100/cw}% ${100/ch}%`;crop.style.backgroundPosition=`${cw<1?x0/(1-cw)*100:0}% ${ch<1?y0/(1-ch)*100:0}%`;
      boxed(crop,gs[0].box,F.col,'',window);
      const [big,rest]=clauses(gs[0].text),line=el(tile,'div','big');el(line,'i',null,String(i+1));line.append(big);
      if(rest)el(tile,'div','vrest',rest);
      if(F.species){
        // The species photo beside its range (regions where it is a key tree or >= 3% of biomass), this region outlined.
        const sp=el(tile,'div','vsp'),range=new Set(pack.vegMap.species?.[F.species]??[]),name=skill.trees?.find(t=>t.species===F.species)?.name??F.name;
        if(F.ref)image(el(sp,'div','img'),F.ref,{caption:name});else el(sp,'span');
        regionMap(sp,pack,code=>range.has(code)?F.col:'#e3e9ec',{region:skill.region});
        // Only the panorama's own labels (its species list or per-tree labels) say what this tree is; a feature's species is
        // what is common in the region, not a claim about this view.
        const isNamed=loc.species?.includes(F.species)||loc.trees?.some(tree=>tree.species===F.species);
        const caption=el(sp,'small',isNamed?'named':'common',isNamed?`This is ${name}`:`Common here: ${name}`);caption.title=`${name}: key tree or at least 3% of biomass in ${range.size} regions`;
      }
    }
  }
}
/** The miss's takeaway for (true skill, pinned skill): the pack's contrast rule and the true region's feature ids it names,
 *  or, with no rule for the pair, the two regions' vibe lines. */
export function contrast(pack,skill,pinned){
  const entry=pack.contrasts?.[pairKey(skill.region,pinned.region)];
  return entry?{lines:[entry.rule],features:entry.features?.[skill.region]??[]}
    :{lines:[`${skill.title}: ${skill.why}`,`${pinned.title}: ${pinned.why}`],features:[]};
}
// Miss headline (usveg.py precomputes skill.mix, feature.signal, skill.states, skill.coastal).
const HEADLINE_MIN=0.25,VEG=new Set(['vegetation','species']),share=(owner,keys)=>keys.reduce((sum,key)=>sum+(owner.mix?.[key]??0),0);
/** How well feature F separates the true region from the pinned one, 0 to 1: the part of its signal's area share the
 *  pinned region lacks; with no signal, 0.5 unless the pinned region lists a feature of that id or name. */
export function separation(skill,pinned,F){
  if(!F.signal?.length)return pinned.features?.some(f=>f.id===F.id||f.name===F.name)?0:0.5;
  const a=share(skill,F.signal);
  return a>0?Math.max(0,(a-share(pinned,F.signal))/a):0;
}
/** Where to move from the guess: 'push northeast toward the coast (ME / NH / VT / NY)'. */
export function direction(skill,pinned,guess,loc){
  const rad=Math.PI/180,dl=(loc.lng-guess.lng)*rad,y=Math.sin(dl)*Math.cos(loc.lat*rad),
    x=Math.cos(guess.lat*rad)*Math.sin(loc.lat*rad)-Math.sin(guess.lat*rad)*Math.cos(loc.lat*rad)*Math.cos(dl);
  const way=['north','northeast','east','southeast','south','southwest','west','northwest'][Math.round((Math.atan2(y,x)/rad+360)%360/45)%8];
  const coast=skill.coastal&&!pinned?.coastal?' toward the coast':!skill.coastal&&pinned?.coastal?' inland':'';
  return `push ${way}${coast}${skill.states?.length?` (${skill.states.join(' / ')})`:''}`;
}
// What the pinned region has instead, in the terms of the signal: its main forest type, land cover or key trees.
function instead(pinned,signal=[]){
  const top=prefix=>Object.entries(pinned.mix??{}).filter(([key])=>key.startsWith(prefix)).sort((a,b)=>b[1]-a[1]),kind=signal[0]?.slice(0,3);
  const ft=top('ft:'),wood=ft.reduce((sum,[,v])=>sum+v,0),lc=top('lc:').slice(0,2);
  if(kind==='ft:'&&wood)return `${pinned.title} woods are mostly ${ft[0][0].slice(3)} (${Math.round(100*ft[0][1]/wood)}%).`;
  if(kind==='lc:'&&lc.length)return `${pinned.title} is ${lc.map(([key,v])=>`${Math.round(100*v)}% ${key.slice(3)}`).join(', ')}.`;
  return pinned.trees?.length?`${pinned.title} key trees: ${pinned.trees.map(tree=>tree.name).join(', ')}.`:`${pinned.title}: ${pinned.why}`;
}
/** A miss's lead from this panorama's own giveaways: the feature that best separates the true region from the pinned one
 *  (vegetation first on ties), as {index (its group), label, lines}; null when none reaches HEADLINE_MIN. */
export function headline(skill,pinned,loc,guess){
  const best=groupsOf(skill,loc).groups.map(({F},index)=>({index,F,score:Math.round(100*separation(skill,pinned,F))/100}))
    .filter(item=>item.F.id).sort((a,b)=>b.score-a.score||VEG.has(b.F.kind)-VEG.has(a.F.kind))[0];
  return best&&best.score>=HEADLINE_MIN?{index:best.index,label:best.F.name,
    lines:[`${best.F.name} → ${direction(skill,pinned,guess,loc)}.`,instead(pinned,best.F.signal)]}:null;
}
