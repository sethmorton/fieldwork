// US Vegetation card (pack.card 'veg', tools/world-pack/usveg.py): the Tree Atlas reveal, compact. Top line, the still with
// numbered boxes beside the "So" map, one tile per cue (crop of its box, first clause big, species range and photo),
// then the same feature in other panoramas of the region. Images come through loadImage (object URLs; on GeoGuessr a
// GM blob request to the local installer), so nothing here fetches cross-origin itself.
const COLS=['#22d3ee','#fb923c','#facc15','#c084fc','#4ade80','#f472b6'],W=1600,H=1000,MAX_ZOOM=1.25,TILE=1.9;
const CSS=`
.veg{display:grid;gap:10px}.veg figure{margin:0}.veg .img{background:#c9d8de center/cover no-repeat;border-radius:6px;position:relative;cursor:zoom-in;overflow:hidden}
.vtop{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;margin:4px 0 0;font:700 21px/1.2 'Trebuchet MS',Arial,sans-serif}.vtop.ok{color:#276b50}.vtop.bad{color:#b4471a}
.verr{margin:0;padding:6px 10px;border-radius:6px;background:#fbeee4;color:#7d3410;font:600 13px/1.3 Arial}
.vtop .st{font-weight:400;color:#496b79}.vtop small{font:600 14px/1.3 Arial,sans-serif;text-transform:none;letter-spacing:0;color:#7d3410}
.vrow{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:10px;align-items:start}
.vstill{aspect-ratio:1.6}.vbox{position:absolute;border:2.5px solid var(--c);border-radius:3px;box-shadow:0 0 0 1px #0008,inset 0 0 0 1px #0006;pointer-events:none}
.vbox b{position:absolute;left:0;top:0;min-width:18px;padding:0 4px;background:var(--c);color:#0b1d24;font:700 12px/16px Arial;text-align:center;border-radius:0 0 3px 0}
.vso p{margin:0;font:600 12px/1.3 Arial;color:#496b79;text-transform:uppercase;letter-spacing:.05em}.vso strong{display:block;font:700 17px/1.2 'Trebuchet MS',Arial;color:#0b5d3b;text-transform:none;letter-spacing:0;margin:1px 0 4px}
.vso .vibe{margin-top:6px;font:13px/1.35 Arial;color:#153946;text-transform:none;letter-spacing:0}
.vmap{display:block;width:100%;height:auto}.vmap path{stroke:#fff;stroke-width:.6}.vmap .pin{fill:#e4572e;stroke:#fff;stroke-width:2.5}
.vcues{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}
.vcue{border-top:4px solid var(--c);background:#fff;border-radius:6px;padding:6px;display:grid;gap:4px;align-content:start}
.vcue .img{width:100%;aspect-ratio:${TILE}}.vcue .big{font:700 13.5px/1.25 Arial;color:#0f2c37}.vcue .big i{font-style:normal;display:inline-block;min-width:17px;margin-right:5px;background:var(--c);border-radius:3px;text-align:center;color:#0b1d24;box-shadow:inset 0 0 0 1px #0b1d2455}
.vcue .vrest{font:12px/1.3 Arial;color:#496b79;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.vsp{display:grid;grid-template-columns:56px minmax(0,1fr);gap:2px 6px;align-items:center}.vsp .img{height:56px}.vsp .vmap{height:56px;width:auto;max-width:100%}
.vsp small{grid-column:1/-1;font:600 11px/1.2 Arial;color:#153946;text-transform:none;letter-spacing:0}
.vmore{display:grid;grid-template-columns:84px repeat(3,minmax(0,1fr));gap:8px;align-items:center}.vmore p{margin:0;overflow-wrap:anywhere;font:600 12px/1.3 Arial;color:#496b79;text-transform:uppercase;letter-spacing:.05em}.vmore .img{aspect-ratio:1.6}
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
  return [loc.img,...groups.slice(0,4).map(({F})=>F.species&&F.ref).filter(Boolean),...recurrence(pack,skill,loc,groups).map(({other})=>`t/${other.img}`)];
}
// Never "reload": a reload on a GeoGuessr results page can resume the next round (AGENTS.md). Retry re-asks loadImage,
// which forgets failed requests, so starting the installer and pressing Retry fills the card in place.
export const IMAGES_OFFLINE='Images need the Fieldwork installer: run npm run serve in ~/Desktop/code/fieldwork, then press Retry';
export function vegCard(card,skill,round,pack,{loadImage,zoom}){
  el(card,'style',null,CSS);
  const veg=el(card,'div','veg'),loc=round.location,base=pack.imageBase;
  // One line, once, when any image cannot load (not prefetched and the installer is not running), with one Retry for all.
  let offline=null;const failed=[];
  const show=(node,file)=>loadImage(base+file).then(url=>{node.style.backgroundImage=`url("${url}")`},()=>{failed.push([node,file]);
    if(offline)return;offline=el(null,'p','verr',IMAGES_OFFLINE+' ');top.after(offline);
    const retry=el(offline,'button',null,'Retry');retry.type='button';
    retry.onclick=()=>{offline.remove();offline=null;failed.splice(0).forEach(([n,f])=>show(n,f))}});
  const image=(node,file,full=file)=>{show(node,file);
    node.onclick=()=>zoom(loadImage(base+full));node.setAttribute('role','img');return node};
  const boxed=(node,[x,y,w,h],col,label,[x0,y0,cw,ch]=[0,0,1,1])=>{const b=el(node,'i','vbox');b.style.cssText=`--c:${col};left:${pct((x-x0)/cw)};top:${pct((y-y0)/ch)};width:${pct(w/cw)};height:${pct(h/ch)}`;if(label)el(b,'b',null,label)};
  // Top line: geography decides it; 1/2/3 still grade recognition below.
  const top=el(veg,'p',`vtop ${round.correct?'ok':'bad'}`);
  el(top,'span',null,`${round.correct?'✓':'✗'} ${skill.title}`);if(loc.state)el(top,'span','st',loc.state);
  if(!round.correct&&round.guess){const guessed=pack.skills.find(item=>item.region===round.guessedRegion)?.title;
    el(top,'small',null,`you pinned ${guessed??'outside the US regions'}, ${km(round.guess,loc).toLocaleString('en-US')} km`)}
  const {featureOf,groups}=groupsOf(skill,loc);
  const row=el(veg,'div','vrow'),still=image(el(row,'figure','img vstill'),loc.img);still.setAttribute('aria-label',`${skill.title}: this round's view`);
  groups.forEach(({gs,F},i)=>gs.forEach(g=>boxed(still,g.box,F.col,String(i+1))));
  const so=el(row,'div','vso');el(so,'p',null,'So:');el(so,'strong',null,skill.title);
  regionMap(so,pack,code=>code===skill.region?'#0b5d3b':!round.correct&&code===round.guessedRegion?'#efb08c':'#d5dcd8',{pin:round.correct?null:round.guess,focus:skill.region});
  if(skill.why)el(so,'p','vibe',skill.why);
  const cues=el(veg,'div','vcues');
  groups.slice(0,4).forEach(({gs,F},i)=>{
    const tile=el(cues,'div','vcue');tile.style.setProperty('--c',F.col);
    const window=cropWindow(gs[0].box,180,TILE),crop=image(el(tile,'div','img'),loc.img),[x0,y0,cw,ch]=window;
    crop.style.backgroundSize=`${100/cw}% ${100/ch}%`;crop.style.backgroundPosition=`${cw<1?x0/(1-cw)*100:0}% ${ch<1?y0/(1-ch)*100:0}%`;
    boxed(crop,gs[0].box,F.col,'',window);
    const [big,rest]=clauses(gs[0].text),line=el(tile,'div','big');el(line,'i',null,String(i+1));line.append(big);
    if(rest)el(tile,'div','vrest',rest);
    if(F.species){
      // The species photo beside its range (regions where it is a key tree or >= 3% of biomass), this region outlined.
      const sp=el(tile,'div','vsp'),range=new Set(pack.vegMap.species?.[F.species]??[]),name=skill.trees?.find(t=>t.species===F.species)?.name??F.name;
      if(F.ref)image(el(sp,'div','img'),F.ref).title=name;else el(sp,'span');
      regionMap(sp,pack,code=>range.has(code)?F.col:'#e3e9ec',{region:skill.region});
      el(sp,'small',null,`${name} · in ${range.size} regions`);
    }
  });
  const more=recurrence(pack,skill,loc,groups);
  if(more.length){
    const strip=el(veg,'div','vmore');el(strip,'p',null,`More ${skill.title}`);
    for(const {other,g} of more){const F=featureOf(g.feature),thumb=image(el(strip,'figure','img'),`t/${other.img}`,other.img);
      thumb.title=`${other.state??''} ${other.season??''}`.trim();boxed(thumb,g.box,F.col,String(groups.findIndex(({gs})=>gs[0].feature===g.feature)+1))}
  }
}
