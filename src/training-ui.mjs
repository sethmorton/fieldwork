// Training pack screens (scheduler 'deal'): full-viewport overlays in one shadow root, styled after fixtures/proto-v2.html
// (white, ink #121212, red #c0392b, Playfair Display / Libre Franklin, full-bleed photos, almost no text).
// After every round: the card. Beat 1 result, beat 2 where you guessed (wrong pins only), beat 3 what the answer region
// looks like. Space advances, ← goes back, × or Esc closes. Round 5 adds the recap; every 15 minutes the session check.
import {regionMap,MAP_CSS} from './region-map.mjs';
import {createKeyGuard,KEY_EVENTS} from './key-guard.mjs';
import {boardSpots} from './boards.mjs';

const CSS=`:host{all:initial}*{box-sizing:border-box}
.scr{position:fixed;inset:0;z-index:2147483000;background:#fff;color:#121212;font:15px/1.4 'Libre Franklin',Helvetica,Arial,sans-serif;overflow:hidden}
.exit{position:fixed;top:14px;left:14px;z-index:30;width:40px;height:40px;border-radius:50%;background:rgba(18,18,18,.6);color:#fff;font:28px/38px Georgia,serif;text-align:center;cursor:pointer;border:0;padding:0}.exit:hover{background:#121212}
.beat{position:absolute;inset:0;display:none}.beat.on{display:block}
.grid{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:3px;height:100%;background:#fff}
.cell{position:relative;overflow:hidden;container-type:size;background:#fff}.bleed{position:absolute;inset:0}
/* Cover crop centred on --cx/--cy (image fractions) but never past the image edge; boxes and markers use the same frame
   (declared on each child, so the cq units resolve against the cell). Markers stay 16px inside the cell. */
.frame,.box,.mk{--w:max(100cqw,calc(100cqh*var(--ar)));--h:max(100cqh,calc(100cqw/var(--ar)));
  --fl:clamp(calc(100cqw - var(--w)),calc(50cqw - var(--cx,.5)*var(--w)),0px);--ft:clamp(calc(100cqh - var(--h)),calc(50cqh - var(--cy,.5)*var(--h)),0px)}
.frame{position:absolute;left:var(--fl);top:var(--ft);width:var(--w);height:var(--h)}
.box{left:calc(var(--fl) + var(--bx)*var(--w));top:calc(var(--ft) + var(--by)*var(--h));width:calc(var(--bw)*var(--w));height:calc(var(--bh)*var(--h))}
.mk{left:clamp(16px,calc(var(--fl) + var(--mx)*var(--w)),calc(100cqw - 16px));top:clamp(16px,calc(var(--ft) + var(--my)*var(--h)),calc(100cqh - 16px))}
.frame img{display:block;width:100%;height:100%;opacity:0;transition:opacity .2s}.frame img.in{opacity:1}
.mk{position:absolute;width:30px;height:30px;margin:-15px 0 0 -15px;padding:0;border:0;border-radius:50%;background:rgba(255,255,255,.92);box-shadow:0 1px 6px rgba(0,0,0,.45);cursor:pointer;display:grid;place-items:center;z-index:2}
.mk svg{width:17px;height:17px}.mk:hover,.mk.open{background:#121212}.mk:hover path,.mk.open path,.mk:hover circle,.mk.open circle{stroke:#fff}
.box{position:absolute;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.5);pointer-events:none;display:none;z-index:1}.box.on{display:block}
.ov{position:absolute;left:50%;top:50%;width:min(30vw,520px);transform:translate(-50%,-50%);pointer-events:none;z-index:5;filter:drop-shadow(0 0 1.5px #fff) drop-shadow(0 0 1.5px #fff) drop-shadow(0 2px 10px rgba(0,0,0,.45))}
.ov.corner{left:auto;top:auto;right:22px;bottom:22px;transform:none;width:min(30vw,480px)}
.cap{position:absolute;left:50%;transform:translateX(-50%);top:calc(50% + min(9.4vw,163px));z-index:6;background:#fff;padding:3px 10px;font:800 11px/1.4 'Libre Franklin',Arial;letter-spacing:.12em;text-transform:uppercase;white-space:nowrap;box-shadow:0 1px 6px rgba(0,0,0,.3)}
.km{position:absolute;top:16px;right:22px;z-index:6;text-align:right;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.65)}
.km b{display:block;font:900 34px/1.1 'Playfair Display',Georgia,serif}.km span{font:600 15px 'Libre Franklin',Arial}.km i{font-style:normal;margin-right:8px}.km .ok{color:#7ee2a8}.km .no{color:#ff8a7a}
.tell{position:absolute;left:50%;bottom:44px;transform:translateX(-50%);z-index:6;max-width:min(70vw,900px);background:#fff;padding:10px 16px;font:600 16px/1.35 'Libre Franklin',Arial;box-shadow:0 2px 12px rgba(0,0,0,.35);text-align:center}
.dots{position:absolute;bottom:18px;left:50%;transform:translateX(-50%);display:flex;gap:8px;z-index:6}.dots i{width:9px;height:9px;border-radius:50%;background:rgba(255,255,255,.55);box-shadow:0 0 0 1px rgba(0,0,0,.35),0 0 3px rgba(0,0,0,.5)}.dots i.on{background:#fff;box-shadow:0 0 0 1px #121212}
.pop{position:fixed;z-index:40;width:260px;background:#fff;color:#121212;box-shadow:0 6px 28px rgba(0,0,0,.4);padding:12px;display:none}.pop.on{display:block}
.pop h3{font:700 19px/1.2 'Playfair Display',Georgia,serif;margin:0 0 6px}.pop img{display:block;width:100%;max-height:150px;object-fit:contain;background:#fff;margin:6px 0}
.pop a{color:#326891;font-size:12px}.pop .rmap{margin-top:6px}.pop .keys{display:flex;gap:6px;margin-top:8px}.pop .keys button{flex:1}
button.go,.keys button,.page button{font:700 15px 'Libre Franklin',Arial;padding:10px 14px;border:1px solid #121212;background:#fff;color:#121212;cursor:pointer}
button.go:hover,.keys button:hover,.page button:hover,button.go.ink{background:#121212;color:#fff}.keys button.on{background:#121212;color:#fff}
.page{position:absolute;inset:0;overflow:auto;padding:0 40px 30px 76px}.scr:focus{outline:none}
.mast{border-bottom:2px solid #121212;padding:22px 0 10px;display:flex;align-items:baseline;gap:20px}.mast h1{font:900 46px 'Playfair Display',Georgia,serif;margin:0}
.date,.kick{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#727272}.kick{margin:0 0 8px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));border-top:1px solid #121212}.tile{padding:12px 14px 12px 0}
.tile b{font:900 40px 'Playfair Display',Georgia,serif;display:block}.tile small{color:#727272;font-size:12px}.up{color:#2e7d4f;font:600 15px 'Libre Franklin'}.down{color:#c0392b;font:600 15px 'Libre Franklin'}
.recap{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin-top:22px}.recap figure{margin:0}.recap .shot{position:relative;aspect-ratio:1.6;overflow:hidden;background:#d9d6cf}
.recap .shot img{width:100%;height:100%;object-fit:cover;display:block}.recap .shot b{position:absolute;top:6px;left:8px;font:900 30px Georgia,serif;color:#fff;text-shadow:0 2px 6px rgba(0,0,0,.7)}
.recap figcaption{font-size:13px;margin-top:6px}.recap figcaption strong{display:block;font-size:14px}.recap ul{margin:6px 0 0;padding:0;list-style:none;color:#727272;font-size:12px}
.advice{font:900 52px/1.1 'Playfair Display',Georgia,serif;margin:26px 0 8px}.detail{font-size:18px;color:#727272;margin:0 0 22px}
.actions{display:flex;gap:10px;margin-top:22px}kbd{font:11px/1 ui-monospace,monospace;padding:2px 4px;border:1px solid currentColor;border-radius:3px;opacity:.6;margin-left:6px}
${MAP_CSS}`;
const FONTS='https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@400;600;800&family=Playfair+Display:wght@700;900&display=swap';
const LENS='<svg viewBox="0 0 24 24" fill="none"><circle cx="10" cy="10" r="6.5" stroke="#121212" stroke-width="2.4"/><path d="M15 15l6 6" stroke="#121212" stroke-width="2.8" stroke-linecap="round"/></svg>';
export const HOST_ID='fieldwork-training';
export const node=(parent,tag,cls,text)=>{const item=document.createElement(tag);if(cls)item.className=cls;if(text!=null)item.textContent=text;parent?.append(item);return item};
export const shortRegion=name=>String(name??'').split(' — ').at(-1);

// Installed when the userscript loads (document-start), before GeoGuessr registers its own key listeners.
export const keyGuard=createKeyGuard();
if(typeof window!=='undefined')for(const type of KEY_EVENTS)window.addEventListener(type,keyGuard.guard,true);

/** One full-viewport screen in the training shadow root (replacing any other). While it is open the key guard stops
 *  every key before GeoGuessr sees it; `onKey(event)` gets keydowns and returns true for keys it handled. Esc closes.
 *  settle: keys in the first `settle` ms are swallowed, so a stray Space from the card before cannot act on this one. */
export function screen({onKey=()=>false,onClose,settle=0}={}){
  document.getElementById(HOST_ID)?.remove();
  if(!document.querySelector(`link[href="${FONTS}"]`)){const link=document.createElement('link');link.rel='stylesheet';link.href=FONTS;document.head.append(link)}
  const host=document.createElement('div');host.id=HOST_ID;const root=host.attachShadow({mode:'open'});
  node(root,'style',null,CSS);const scr=node(root,'section','scr');scr.tabIndex=-1;
  const close=()=>{keyGuard.close(keys);host.remove();onClose?.()};
  const openedAt=performance.now();
  const keys=event=>{if(performance.now()-openedAt<settle)return true;if(event.key==='Escape'){close();return true}return onKey(event)};
  keyGuard.open(keys,()=>host.isConnected);
  const exit=node(scr,'button','exit','×');exit.type='button';exit.setAttribute('aria-label','Close');exit.onclick=close;
  document.body.append(host);scr.focus({preventScroll:true});
  return {root,scr,close};
}

/** The exact view a location's metas were labelled on, at display size: same aspect, heading, pitch and fov. */
export function photoUrl(pack,location,width=1280){
  const [w,h]=pack.thumbSize??[1600,1000],height=Math.round(width*h/w);
  if(!Number.isFinite(location.heading)&&location.image)return location.image;
  return `https://streetviewpixels-pa.googleapis.com/v1/thumbnail?cb_client=maps_sv.share&panoid=${encodeURIComponent(location.panoId)}&w=${width}&h=${height}`
    +`&yaw=${(location.heading??0).toFixed(1)}&pitch=${(-(location.pitch??0)).toFixed(1)}&thumbfov=${location.fov??100}`;
}
const aspect=pack=>{const [w,h]=pack.thumbSize??[1600,1000];return w/h};

// Where a meta applies, on its countries' map: its own footprint (metas[id].footprint, admin-1 union) when the pack has
// one, else the macro-regions it lists (appliesTo).
const metaCountries=(pack,info)=>info?.countries?.length?info.countries:[...new Set((info?.appliesTo??[]).map(name=>pack.regions?.[name]?.country??name))];
export const metaMap=(pack,info)=>regionMap(pack,{countries:metaCountries(pack,info),
  ...(info?.footprint?{overlays:[{geometry:info.footprint}]}:{shade:Object.fromEntries((info?.appliesTo??[]).map(name=>[name,'#c0392b']))})});
// The meta popover: title, the Plonk It / Learnable Meta image, a mini map of where it applies, the source link and, with
// manual keys on, "Used it" / "Didn't notice".
export function metaPopover(root,pack,{manual,grades,onGrade}){
  const pop=node(root,'div','pop');let current=null;
  const hide=()=>{pop.classList.remove('on');current?.marker.classList.remove('open');current?.box.classList.remove('on');current=null};
  const show=(marker,box,meta,label)=>{
    if(current?.marker===marker)return;hide();current={marker,box};marker.classList.add('open');box.classList.add('on');
    const info=pack.metas?.[meta.metaId];pop.replaceChildren();
    node(pop,'h3',null,info?.title??meta.what??'Observed');
    if(info?.title&&meta.what&&meta.what!==info.title)node(pop,'div','kick',meta.what);
    if(info?.img){const img=node(pop,'img');img.src=info.img;img.alt='';img.referrerPolicy='no-referrer'}
    if(metaCountries(pack,info).length)pop.append(metaMap(pack,info).node);
    if(info?.url){const link=node(pop,'a',null,info.source==='learnablemeta'?'Learnable Meta ↗':'Plonk It ↗');link.href=info.url;link.target='_blank';link.rel='noreferrer'}
    if(manual&&meta.metaId&&onGrade){
      const keys=node(pop,'div','keys');
      const draw=()=>{keys.replaceChildren();for(const [label,used] of [['Used it',true],["Didn't notice",false]]){
        const b=node(keys,'button',grades[meta.metaId]===used?'on':'',label);b.type='button';b.onclick=()=>{grades[meta.metaId]=used;onGrade(meta.metaId,used);draw()}}};
      draw();
    }
    const rect=marker.getBoundingClientRect(),left=rect.right+12+260>innerWidth?rect.left-272:rect.right+12;
    pop.style.left=Math.max(8,left)+'px';pop.classList.add('on');pop.style.top=Math.max(8,Math.min(innerHeight-pop.offsetHeight-8,rect.top-20))+'px';
  };
  return {show,hide,get open(){return current}};
}
/** A photo cell: the labelled view cropped to cover the cell, with a magnifier on each meta box. The crop is centred on
 *  the boxes (union), so a box at the image edge stays in view, and markers are clamped inside the cell. Returns its
 *  markers. */
function photo(parent,pack,location,popover,cls='cell'){
  const cell=node(parent,'div',cls),frame=node(cell,'div','frame');
  const boxes=(location.verified===false?[]:location.metas??[]).filter(meta=>Array.isArray(meta.box)&&meta.box.length===4);
  const [cx,cy]=cropFocus(boxes.map(meta=>meta.box));
  cell.style.setProperty('--ar',aspect(pack));cell.style.setProperty('--cx',cx.toFixed(4));cell.style.setProperty('--cy',cy.toFixed(4));
  const img=node(frame,'img');img.alt='';img.referrerPolicy='no-referrer';img.decoding='async';
  img.onload=()=>img.classList.add('in');img.src=photoUrl(pack,location);if(img.complete&&img.naturalWidth)img.classList.add('in');
  const markers=[];
  for(const meta of boxes){
    const [x,y,w,h]=meta.box,box=node(cell,'div','box');
    for(const [name,value] of [['--bx',x],['--by',y],['--bw',w],['--bh',h]])box.style.setProperty(name,value);
    const marker=node(cell,'button','mk');marker.type='button';marker.innerHTML=LENS;marker.setAttribute('aria-label',pack.metas?.[meta.metaId]?.title??meta.what??'Meta');
    marker.style.setProperty('--mx',x+w/2);marker.style.setProperty('--my',y+h/2);
    const open=()=>popover.show(marker,box,meta);
    marker.onmouseenter=open;marker.onfocus=open;marker.onclick=open;markers.push({marker,open});
  }
  return {cell,markers};
}
/** The point (image fractions) a cover crop centres on: the middle of the meta boxes' union, else the image centre. */
export function cropFocus(boxes){
  if(!boxes.length)return [0.5,0.5];
  const x0=Math.min(...boxes.map(b=>b[0])),y0=Math.min(...boxes.map(b=>b[1])),x1=Math.max(...boxes.map(b=>b[0]+b[2])),y1=Math.max(...boxes.map(b=>b[1]+b[3]));
  return [(x0+x1)/2,(y0+y1)/2];
}
/** A board of one region: up to four study photos (2x2; fewer fill the screen in one row), the country map in the centre
 *  with the region shaded, its name. A region with no study photos shows the map alone. */
export function board(parent,pack,region,spots,{color='#c0392b',popover,muted=false}){
  const grid=node(parent,'div','grid');if(muted)grid.style.filter='saturate(.85)';
  if(spots.length<4)Object.assign(grid.style,{gridTemplateColumns:`repeat(${Math.max(1,spots.length)},1fr)`,gridTemplateRows:'1fr'});
  const markers=spots.flatMap(location=>photo(grid,pack,location,popover).markers);
  const country=pack.regions?.[region]?.country??region;
  const map=node(parent,'div','ov');map.append(regionMap(pack,{countries:[country],shade:{[region]:color}}).node);
  node(parent,'div','cap',shortRegion(region));
  return markers;
}
// The tell separating the pinned region from the answer: the pack's contrast line for the pair, else the answer spot's
// metas that apply to the answer region and not to the pinned one.
export function tellFor(pack,round){
  if(!round.guessedRegion||round.correct)return null;
  const pair=[round.location.region,round.guessedRegion].sort().join('|');
  if(pack.contrasts?.[pair])return pack.contrasts[pair];
  const separating=(round.location.metas??[]).map(meta=>pack.metas?.[meta.metaId]).filter(info=>info?.appliesTo?.includes(round.location.region)&&!info.appliesTo.includes(round.guessedRegion));
  return separating.length?`${[...new Set(separating.map(info=>info.title))].slice(0,2).join(', ')}: ${shortRegion(round.location.region)}, not ${shortRegion(round.guessedRegion)}.`:null;
}

/** The card after a round. options: manual (meta keys), shown (study ids already shown), boardFor(region) (the board's
 *  photos; default: boardSpots, nothing burned), onGrade(metaId, used), onShown(ids), onDone() after the last beat
 *  (Space) or a close. A beat shows once its photos have decoded (at most BEAT_WAIT ms), so it never opens blank. */
export function trainingCard(pack,round,{attempt=null,manual=false,shown=new Set(),boardFor=null,onGrade,onShown,onDone,random=Math.random}={}){
  let beat=0,finished=false;
  const finish=()=>{if(finished)return;finished=true;onDone?.()};
  const grades=Object.fromEntries((attempt?.metas??[]).filter(item=>item.source==='manual').map(item=>[item.metaId,item.used]));
  const {root,scr,close}=screen({onClose:finish,onKey:event=>{
    if(event.code==='Space'||event.key==='ArrowRight'||event.key==='Enter'){if(beat<beats.length-1)go(beat+1);else{close()}return true}
    if(event.key==='ArrowLeft'){if(beat>0)go(beat-1);return true}
    // Tab walks the magnifiers (each opens its meta on focus); with manual keys on, U / N grade the open one.
    if(popover.open&&manual&&/^[un]$/i.test(event.key)){root.querySelectorAll('.pop .keys button')[event.key.toLowerCase()==='u'?0:1]?.click();return true}
    // Digits, arrows up/down and the rest are swallowed too (the guard stops every key while a card is open).
    return /^(\d|ArrowUp|ArrowDown|[un])$/i.test(event.key);
  }});
  scr.dataset.round=round.round;scr.dataset.correct=String(round.correct);scr.style.visibility='hidden';
  const popover=metaPopover(scr,pack,{manual,grades,onGrade});
  const location=round.location,answerCountry=location.country,pinned=round.guessedRegion&&round.guessedRegion!==location.region?round.guessedRegion:null;
  const beats=[];
  // Beat 1: the panorama just played, the map with your pin (black) and the answer (green), the answer region red.
  // A timed-out round: the answer only (no pin, no distance), "Timed out" instead of the km.
  {const el=node(scr,'div','beat');el.dataset.beat='result';
    const {markers}=photo(el,pack,location,popover,'cell bleed'),guess=round.timedOut?null:round.guess;
    const countries=[...new Set([answerCountry,round.guessedCountry].filter(Boolean))];
    const map=node(el,'div','ov corner');map.append(regionMap(pack,{countries,shade:{...(pinned?{[pinned]:'#c9c3b6'}:{}),[location.region]:'#c0392b'},
      points:[...(guess?[{lat:guess.lat,lng:guess.lng,color:'#121212'}]:[]),{lat:location.lat,lng:location.lng,color:'#2e7d4f'}],line:guess?[guess,location]:null}).node);
    const km=node(el,'div','km'),big=node(km,'b');node(big,'i',round.correct?'ok':'no',round.correct?'✓':'✗');
    big.append(guess?`${round.km.toLocaleString('en-US')} km`:'Timed out');
    node(km,'span',null,`${round.points.toLocaleString('en-US')} pts`);
    beats.push({el,markers});}
  const used=new Set([location.id]);
  const boardBeat=(region,name,color,muted)=>{
    const el=node(scr,'div','beat');el.dataset.beat=name;
    const spots=boardFor?boardFor(region):boardSpots(pack,region,{shown,random,exclude:used}).spots;spots.forEach(spot=>used.add(spot.id));
    const markers=board(el,pack,region,spots,{color,popover,muted});beats.push({el,markers,spots});return el;
  };
  // Beat 2 (wrong pins in a pack region): what the region you pinned looks like, shaded grey.
  if(pinned)boardBeat(pinned,'pinned','#5b5b5b',true);
  // Beat 3: what the answer region really looks like, shaded red, with the tell when you pinned elsewhere.
  const answer=boardBeat(location.region,'answer','#c0392b',false);
  const tell=tellFor(pack,round);if(tell)node(answer,'div','tell',tell);
  const dots=node(scr,'div','dots');for(const _ of beats)node(dots,'i');
  const show=index=>{popover.hide();beats.forEach((item,i)=>item.el.classList.toggle('on',i===index));[...dots.children].forEach((dot,i)=>dot.classList.toggle('on',i===index));
    scr.dataset.beatName=beats[index].el.dataset.beat;scr.style.visibility=''};
  // `beat` is the beat asked for; it shows when its photos are ready, unless another key moved on meanwhile.
  const go=index=>{beat=index;return decoded(beats[index].el).then(()=>{if(beat===index&&!finished)show(index)})};
  const opened=go(0);
  onShown?.(beats.flatMap(item=>item.spots??[]).map(spot=>spot.id));
  return {close,go,opened,get beat(){return beat}};
}
export const BEAT_WAIT=1500;
const decoded=(el,ms=BEAT_WAIT)=>Promise.race([Promise.all([...el.querySelectorAll('img')].map(img=>img.decode().catch(()=>{}))),new Promise(resolve=>setTimeout(resolve,ms))]);
// Photos fetched ahead (set publication, the guess) so a beat opens at once. The browser cache keeps the bytes; this map
// keeps the latest 300 requests alive and deduplicated.
const preloaded=new Map();
export function preload(urls){
  for(const url of urls){
    if(preloaded.has(url))continue;
    const img=new Image();img.referrerPolicy='no-referrer';img.decoding='async';img.src=url;preloaded.set(url,img.decode().catch(()=>{}));
    if(preloaded.size>300)preloaded.delete(preloaded.keys().next().value);
  }
}

// Screens that follow a card ignore keys this long, so the Space that closed the card (or a double press) never skips them.
export const SETTLE_MS=600;
/** After round 5: the five rounds, ✓/✗, km, points and the metas each one showed. Space or Next set continues. */
export function recapScreen(pack,rounds,{onNext,onClose}={}){
  const {scr,close}=screen({onClose,settle:SETTLE_MS,onKey:event=>{if(event.code==='Space'||event.key==='Enter'){next.click();return true}return false}});
  const page=node(scr,'div','page');const mast=node(page,'div','mast');node(mast,'h1',null,'Set complete');
  const total=rounds.reduce((sum,round)=>sum+(round.points??0),0),hits=rounds.filter(round=>round.correct).length;
  node(mast,'span','date',`${hits}/${rounds.length} regions · ${total.toLocaleString('en-US')} pts`);
  const strip=node(page,'div','recap');
  for(const round of rounds){
    const location=pack.locations.find(item=>item.id===round.locationRef);if(!location)continue;
    const fig=node(strip,'figure'),shot=node(fig,'div','shot'),img=node(shot,'img');img.src=photoUrl(pack,location,640);img.alt='';img.referrerPolicy='no-referrer';
    node(shot,'b',null,round.correct?'✓':'✗').style.color=round.correct?'#7ee2a8':'#ff8a7a';
    const cap=node(fig,'figcaption');node(cap,'strong',null,round.region);
    node(cap,'span',null,`${round.timedOut?'timed out':`${(round.km??0).toLocaleString('en-US')} km`} · ${(round.points??0).toLocaleString('en-US')} pts`);
    const metas=node(cap,'ul');for(const meta of round.metas??[])node(metas,'li',null,`${meta.used?'✓':'✗'} ${pack.metas?.[meta.metaId]?.title??meta.metaId}`);
  }
  const actions=node(page,'div','actions'),next=node(actions,'button','go ink','Next set');next.type='button';node(next,'kbd',null,'Space');
  next.onclick=async()=>{next.disabled=true;next.firstChild.textContent='Starting…';try{await onNext?.()}catch(error){next.disabled=false;next.firstChild.textContent=String(error?.message??error)}};
  return {close,scr};
}
const pct=value=>value===null||value===undefined?'–':Math.round(value*100)+'%';
/** The 15-minute session check: progress so far and one recommendation. Space keeps going. */
export function sessionScreen(check,{onContinue}={}){
  const {scr,close}=screen({onClose:onContinue,settle:SETTLE_MS,onKey:event=>{if(event.code==='Space'||event.key==='Enter'){close();return true}return false}});
  const page=node(scr,'div','page'),{progress,advice}=check;const mast=node(page,'div','mast');node(mast,'h1',null,'Session check');
  node(mast,'span','date',`${progress.activeMinutes} min · ${progress.n} new spots`);
  node(page,'p','advice',advice.title).dataset.kind=advice.kind;node(page,'p','detail',advice.detail);
  const tiles=node(page,'div','tiles');
  for(const [value,label] of [[pct(progress.regionRate),`region hit rate · n=${progress.n}`],[pct(progress.countryRate),`country hit rate · n=${progress.n}`],
    [progress.points?.toLocaleString('en-US')??'–','points per round'],[pct(progress.fixRate),`fix rate · n=${progress.fixN}`],[pct(progress.lateRate),'last 10 rounds']]){
    const tile=node(tiles,'div','tile');node(tile,'b',null,value);node(tile,'small',null,label)}
  const actions=node(page,'div','actions'),go=node(actions,'button','go ink','Keep going');go.type='button';node(go,'kbd',null,'Space');go.onclick=close;
  return {close,scr};
}
