// Deal scheduler (pack.scheduler 'deal', the training pack): a ranked feed of panoramas the learner has never been shown.
// Study spots are card material and are never played. Everything is replayed from attempts after every guess (never
// stored), so the next set always reflects the latest round. Model (explicit, see learnerModel):
//   region / meta mastery  Beta(1 + misses, 1 + hits), each outcome weighted by recency (half-life 3 days, ×2 in session)
//   confusions             true region → pinned region, same recency weights
//   retests                a miss is retested on a fresh spot later in the session, the next day and 3 days after
// Each fresh spot scores ACoW weight × Thompson sample of its region's miss probability × due-meta boost × confusion
// boost × novelty × fade (planDeal). A set then satisfies, in order: the latest confusion as a contrast pair, ≥2 spots
// showing due metas, ≥1 focus-country spot, ≥2 world spots, ≤2 per country, one per region except a contrast pair.
import {regionAt} from './geo.mjs';

export const PLAYABLE=new Set(['drill','probe']);
const DAY=864e5;
// Retest steps after a miss: any later round of the session (the next set), then the next calendar day, then 3 days later.
export const RETEST_DAYS=[1,3];
// Recency: an outcome's weight halves every HALF_LIFE_DAYS; outcomes in the current session count SESSION_WEIGHT times.
export const HALF_LIFE_DAYS=3,SESSION_WEIGHT=2,SESSION_GAP=30*60000;
// A right answer slower than FAST_MS counts SLOW_HIT of a hit (the rest a miss). Fade: the latest FADE_HITS rounds of a
// region all fast and right; such a region scores FADE_WEIGHT. A round without a recorded time counts as fast.
export const FAST_MS=20000,SLOW_HIT=0.7,FADE_HITS=3,FADE_WEIGHT=0.25;
// Score terms: each due meta a verified spot shows adds DUE_BOOST; confusion adds CONFUSION_BOOST × min(2, weight);
// a region or meta not met for NOVELTY_DAYS (or never) multiplies by NOVELTY.
export const DUE_BOOST=1.5,CONFUSION_BOOST=1,NOVELTY=1.3,NOVELTY_DAYS=7;
const COUNTRY_CAP=2;
const dayStart=time=>{const date=new Date(time);date.setHours(0,0,0,0);return date.getTime()};
export const isDealAttempt=attempt=>attempt.feedbackSource==='auto'&&typeof attempt.correct==='boolean';

/** GeoGuessr's world-map score for a distance: 5000·e^(−10·d/14916.862 km). Single-country sets are scored on the world
 *  scale too, so the points compare with duels and ACoW. */
export const worldPoints=km=>Math.round(5000*Math.exp(-10*km/14916.862));
export function distanceKm(a,b){
  const rad=Math.PI/180,h=Math.sin((b.lat-a.lat)*rad/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin((b.lng-a.lng)*rad/2)**2;
  return 12742*Math.asin(Math.min(1,Math.sqrt(h)));
}
// A pin within this distance of the answer counts as the answer region, wherever it lands: sea next to a coastal spot, or
// the far side of a simplified border (the pack's polygons put ~2% of border spots in the neighbour).
export const COAST_KM=25;

/** Grades a completed deal round: region by regionFeatures (macro-region = region), country by the region's country,
 *  distance, world-scale points and the guess time when GeoGuessr sent one. */
export function gradeDeal(pack,location,guess,seconds){
  const km=distanceKm(guess,location);
  const guessedRegion=km<=COAST_KM?location.region:regionAt(guess.lat,guess.lng,pack.regionFeatures??[]);
  const guessedCountry=guessedRegion?pack.regions?.[guessedRegion]?.country??guessedRegion:null;
  return {guess:{lat:guess.lat,lng:guess.lng},guessedRegion,guessedCountry,regionCorrect:guessedRegion===location.region,
    countryCorrect:guessedCountry===location.country,correct:guessedRegion===location.region,km:Math.round(km),points:worldPoints(km),
    ...(Number.isFinite(seconds)&&seconds>0?{elapsedMs:Math.round(seconds*1000)}:{})};
}

/** One attempt per round, graded at once (feedbackSource 'auto'). Metas visible in the spot are graded from the pin
 *  (right region = used) unless the learner set them by hand (`metaGrades`: {metaId: true|false}). Re-saving the same
 *  round replaces its attempt, so manual keys can change it later. `slot` is what the plan picked it for. */
export function recordDeal(pack,history,round,{slot=null,metaGrades={}}={},now=new Date()){
  const prior=history.find(attempt=>attempt.id===round.id),location=round.location;
  const metas=[...new Set((location.metas??[]).map(meta=>meta.metaId).filter(Boolean))].map(metaId=>{
    const manual=metaGrades[metaId]??prior?.metas?.find(item=>item.metaId===metaId&&item.source==='manual')?.used;
    return typeof manual==='boolean'?{metaId,used:manual,source:'manual'}:{metaId,used:round.correct,source:'auto'};
  });
  const picked=slot??(prior?.slot?{slot:prior.slot,retest:prior.retest}:null);
  const attempt={id:round.id,skillId:location.skillIds[0],occurredAt:prior?.occurredAt??now.toISOString(),correct:round.correct,
    regionCorrect:round.regionCorrect,countryCorrect:round.countryCorrect,evidenceValid:round.correct,region:location.region,country:location.country,
    guessedRegion:round.guessedRegion,guessedCountry:round.guessedCountry,guess:round.guess,km:round.km,points:round.points,
    ...(round.elapsedMs?{elapsedMs:round.elapsedMs}:{}),metas,locationRef:location.id,mode:'assessment',feedbackSource:'auto',
    ...(picked?{slot:picked.slot,retest:!!picked.retest}:{}),reason:'Deal round graded automatically from the pinned region.'};
  return prior?history.map(item=>item.id===attempt.id?attempt:item):[...history,attempt];
}

// Seeded generator (mulberry32) for tests and the debug view; the browser passes Math.random.
export function seeded(seed){
  let a=seed>>>0;
  return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296};
}
function gamma(shape,random){
  if(shape<1)return gamma(shape+1,random)*random()**(1/shape);
  const d=shape-1/3,c=1/Math.sqrt(9*d);
  for(;;){
    let x,v;
    do{x=Math.sqrt(-2*Math.log(random()||1e-12))*Math.cos(2*Math.PI*random());v=1+c*x}while(v<=0);
    v=v**3;const u=random();
    if(u<1-0.0331*x**4||Math.log(u)<0.5*x*x+d*(1-v+Math.log(v)))return d*v;
  }
}
/** A draw from Beta(a, b). */
export function betaSample(a,b,random){const x=gamma(a,random),y=gamma(b,random);return x/(x+y)}

/** The learner model, from duel losses and deal attempts in time order.
 *  regions / metas: Map key → {misses, hits (recency-weighted), lastAt}; confusions: Map region → weight (as truth or as
 *  the pinned region); pairs: Map 'truth|pinned' → weight; latestConfusion: {truth, pinned, at} of the newest wrong pin
 *  into another pack region, if neither region was played since. */
export function learnerModel(pack,attempts,now=Date.now()){
  const nowMs=new Date(now).getTime(),deal=attempts.filter(isDealAttempt);
  let sessionStart=nowMs;
  for(let i=deal.length-1;i>=0;i--){const time=Date.parse(deal[i].occurredAt);if(sessionStart-time>SESSION_GAP)break;sessionStart=time}
  const weight=time=>0.5**(Math.max(0,nowMs-time)/(HALF_LIFE_DAYS*DAY))*(time>=sessionStart?SESSION_WEIGHT:1);
  const regions=new Map(),metas=new Map(),confusions=new Map(),pairs=new Map();
  const add=(map,key,hit,w,time)=>{const item=map.get(key)??{misses:0,hits:0,lastAt:0};item.hits+=hit*w;item.misses+=(1-hit)*w;item.lastAt=Math.max(item.lastAt,time);map.set(key,item)};
  const bump=(map,key,w)=>map.set(key,(map.get(key)??0)+w);
  for(const loss of pack.duelLosses??[]){
    const time=Date.parse(loss.occurredAt);if(!Number.isFinite(time))continue;const w=weight(time);
    if(loss.region)add(regions,loss.region,0,w,time);
    for(const metaId of loss.metaIds??[])add(metas,metaId,0,w,time);
  }
  let latestConfusion=null;
  for(const attempt of deal){
    const time=Date.parse(attempt.occurredAt),w=weight(time);
    const hit=attempt.correct?(attempt.elapsedMs>FAST_MS?SLOW_HIT:1):0;
    if(attempt.region)add(regions,attempt.region,hit,w,time);
    for(const meta of attempt.metas??[])add(metas,meta.metaId,meta.used?hit||1:0,w,time);
    if(latestConfusion&&(attempt.region===latestConfusion.truth||attempt.region===latestConfusion.pinned))latestConfusion=null;
    if(!attempt.correct&&attempt.guessedRegion&&attempt.guessedRegion!==attempt.region&&pack.regions?.[attempt.guessedRegion]){
      bump(confusions,attempt.region,w);bump(confusions,attempt.guessedRegion,w);bump(pairs,attempt.region+'|'+attempt.guessedRegion,w);
      latestConfusion={truth:attempt.region,pinned:attempt.guessedRegion,at:time};
    }
  }
  return {regions,metas,confusions,pairs,latestConfusion,sessionStart};
}

// Per key ('region:<name>' or 'meta:<id>'): misses and hits in time order, then the retest step machine.
function retestState(events,now){
  let stage=0,missAt=0;
  const dueAt=()=>stage===1?missAt+1:dayStart(missAt)+RETEST_DAYS[stage-2]*DAY;
  for(const event of events){
    if(!event.ok){stage=1;missAt=event.time;continue}
    if(!stage||event.time<dueAt())continue;
    stage=stage>RETEST_DAYS.length?0:stage+1;
  }
  return stage?{stage,missAt,dueAt:dueAt(),due:now>=dueAt()}:null;
}
/** Every key with an open retest: {kind, key (region name or meta id), stage 1-3, missAt, dueAt, due}. A miss is due at
 *  once (stage 1: any later round), then on the next day, then 3 days after it. Due ones first, newest miss first. */
export function retests(pack,attempts,now=Date.now()){
  const nowMs=new Date(now).getTime(),events=new Map(),push=(key,event)=>{const list=events.get(key);if(list)list.push(event);else events.set(key,[event])};
  for(const loss of pack.duelLosses??[]){
    const time=Date.parse(loss.occurredAt);if(!Number.isFinite(time))continue;
    if(loss.region)push('region:'+loss.region,{ok:false,time});
    for(const metaId of loss.metaIds??[])push('meta:'+metaId,{ok:false,time});
  }
  for(const attempt of attempts){
    if(!isDealAttempt(attempt))continue;
    const time=Date.parse(attempt.occurredAt);
    if(attempt.region)push('region:'+attempt.region,{ok:attempt.correct,time});
    for(const meta of attempt.metas??[])push('meta:'+meta.metaId,{ok:meta.used,time});
  }
  const open=[];
  for(const [key,list] of events){
    list.sort((a,b)=>a.time-b.time);
    const state=retestState(list,nowMs);
    if(state)open.push({kind:key.startsWith('meta:')?'meta':'region',key:key.slice(key.indexOf(':')+1),...state});
  }
  return open.sort((a,b)=>b.due-a.due||b.missAt-a.missAt);
}
/** Regions whose latest FADE_HITS rounds were fast and right. */
export function fadedRegions(attempts){
  const recent=new Map();
  for(const attempt of attempts)if(isDealAttempt(attempt)&&attempt.region){
    const list=recent.get(attempt.region)??[];list.push(attempt);if(list.length>FADE_HITS)list.shift();recent.set(attempt.region,list);
  }
  return new Set([...recent].filter(([,list])=>list.length===FADE_HITS&&list.every(item=>item.correct&&!(item.elapsedMs>FAST_MS))).map(([region])=>region));
}

/** The next set: {locationIds, slots: {locationId: {slot: 'pair'|'due'|'focus'|'world'|'top', retest}}, reasons,
 *  candidates (the 20 best regions with their score terms, for the debug view)}. Linear in locations and attempts. */
export function planDeal(pack,attempts,{size=5,now=Date.now(),seenLocationRefs=[],random=Math.random}={}){
  const nowMs=new Date(now).getTime(),seen=new Set(seenLocationRefs);
  for(const attempt of attempts)if(attempt.locationRef)seen.add(attempt.locationRef);
  const model=learnerModel(pack,attempts,nowMs),open=retests(pack,attempts,nowMs),faded=fadedRegions(attempts);
  const dueMetas=new Set(open.filter(item=>item.due&&item.kind==='meta').map(item=>item.key));
  const openRegions=new Set(open.filter(item=>item.kind==='region').map(item=>item.key));
  const verifiedMetas=location=>location.verified===false?[]:[...new Set((location.metas??[]).map(meta=>meta.metaId).filter(Boolean))];
  // One pass: fresh playable spots grouped by region, with each region's count per country for the ACoW split.
  const byRegion=new Map(),countryCount=new Map();
  for(const location of pack.locations){
    if(!PLAYABLE.has(location.split)||location.rural===false||seen.has(location.id))continue;
    const list=byRegion.get(location.region);if(list)list.push(location);else byRegion.set(location.region,[location]);
    countryCount.set(location.country,(countryCount.get(location.country)??0)+1);
  }
  const acow=pack.acow??Object.fromEntries(countryCount);
  const acowTotal=Object.values(acow).reduce((sum,value)=>sum+value,0)||1,stale=nowMs-NOVELTY_DAYS*DAY;
  const novel=(map,key)=>!(map.get(key)?.lastAt>stale);
  // Region terms once per plan (one Thompson draw per region), spot terms per fresh spot.
  const candidates=[];
  for(const [region,list] of byRegion){
    const country=list[0].country,stats=model.regions.get(region)??{misses:0,hits:0};
    const terms={acow:(acow[country]??0)/acowTotal*list.length/countryCount.get(country),miss:betaSample(1+stats.misses,1+stats.hits,random),
      confusion:1+CONFUSION_BOOST*Math.min(2,model.confusions.get(region)??0),novelty:novel(model.regions,region)?NOVELTY:1,fade:faded.has(region)?FADE_WEIGHT:1};
    const base=terms.acow*terms.miss*terms.confusion*terms.novelty*terms.fade;
    for(const location of list){
      const metas=verifiedMetas(location),due=metas.filter(id=>dueMetas.has(id)).length,newMetas=metas.filter(id=>novel(model.metas,id)).length;
      const spot={location,region,country,due,score:base*(1+DUE_BOOST*due)*(newMetas?NOVELTY:1),terms:{...terms,due:1+DUE_BOOST*due,metaNovelty:newMetas?NOVELTY:1},
        retest:openRegions.has(region)};
      candidates.push(spot);
    }
  }
  // Best spot per region (ties: a random one), and the best due-meta spot per region.
  const bestOf=filter=>{const best=new Map();for(const spot of candidates){if(!filter(spot))continue;const held=best.get(spot.region);
    if(!held||spot.score>held.score||(spot.score===held.score&&random()<0.5))best.set(spot.region,spot)}return [...best.values()].sort((a,b)=>b.score-a.score)};
  const ranked=bestOf(()=>true),dueRanked=bestOf(spot=>spot.due>0);
  const picks=[],slots={},regionsUsed=new Set(),perCountry=new Map(),focus=pack.focus?.country;
  const fits=(spot,pair=false)=>!slots[spot.location.id]&&(pair||!regionsUsed.has(spot.region))&&(perCountry.get(spot.country)??0)<COUNTRY_CAP;
  const take=(spot,slot)=>{picks.push(spot);slots[spot.location.id]={slot,retest:spot.retest};regionsUsed.add(spot.region);perCountry.set(spot.country,(perCountry.get(spot.country)??0)+1)};
  const fill=(list,slot,want,test=()=>true)=>{let n=0;for(const spot of list){if(n>=want||picks.length>=size)break;if(test(spot)&&fits(spot)){take(spot,slot);n++}}};
  // 1. The latest confusion as a contrast pair: a fresh spot of the true region and one of the region pinned instead.
  const pair=model.latestConfusion;
  if(pair)for(const region of [pair.truth,pair.pinned]){
    const spot=dueRanked.find(item=>item.region===region)??ranked.find(item=>item.region===region);
    if(spot&&picks.length<size&&fits(spot,true))take(spot,'pair');
  }
  // 2. At least two spots showing due metas. 3. At least one focus-country spot. 4. At least two world spots.
  const count=test=>picks.filter(test).length;
  fill(dueRanked,'due',2-count(spot=>spot.due>0));
  // Too few due-meta spots (unlabelled pools): due region retests fill the two due slots, best score first.
  const dueRegions=new Set(open.filter(item=>item.due&&item.kind==='region').map(item=>item.key));
  fill(ranked,'due',2-count(spot=>spot.due>0||dueRegions.has(spot.region)),spot=>dueRegions.has(spot.region));
  if(focus)fill(ranked,'focus',1-count(spot=>spot.country===focus),spot=>spot.country===focus);
  fill(ranked,'world',2-count(spot=>spot.country!==focus),spot=>spot.country!==focus);
  // 5. The rest by score; a short pool relaxes the per-country cap, never the never-repeat rule.
  fill(ranked,'top',size-picks.length);
  if(picks.length<size){candidates.sort((a,b)=>b.score-a.score);
    for(const spot of candidates){if(picks.length>=size)break;if(!slots[spot.location.id]&&!regionsUsed.has(spot.region))take(spot,'top')}
    for(const spot of candidates){if(picks.length>=size)break;if(!slots[spot.location.id])take(spot,'top')}}
  const by=label=>picks.filter(spot=>slots[spot.location.id].slot===label).length;
  const reasons=[['pair','contrast pair'],['due','due meta'],['focus','focus'],['world','world'],['top','top ranked']].filter(([label])=>by(label)).map(([label,text])=>`${by(label)} ${text}`).join(', ');
  // Debug view: the 20 best regions (their best spot's terms), each marked with the slot a pick from that region filled.
  const pickedRegion=new Map(picks.map(spot=>[spot.region,slots[spot.location.id].slot]));
  return {locationIds:picks.map(spot=>spot.location.id),slots,reasons:[reasons,`${open.filter(item=>item.due).length} due, ${faded.size} faded`],
    candidates:ranked.slice(0,20).map(spot=>({locationId:spot.location.id,region:spot.region,country:spot.country,score:spot.score,terms:spot.terms,
      picked:pickedRegion.get(spot.region)??null}))};
}
