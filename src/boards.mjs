// Photos for a region's 2x2 board (card beats 2 and 3, look boards). Always four when the country has four.
// A board never shows a panorama the learner played or was shown as a Fieldwork training round (`played`).
// Order:
//   1. the region's photos not shown on a board in the last week (`shown`), by group:
//        study spots (never played) and drill spots already burned onto an earlier board (`burned`),
//        then unseen drill/probe spots, which are then burned: the caller adds them to exposures, so they never appear
//        in a game,
//        then 'seen' spots (duel and Sprint panoramas, never played in training)
//   2. the region's recently shown photos, in the same group order: a repeat only once the region is exhausted
//   3. and 4. the same over the rest of the country
// Never rural:false or thumbOk:false. Within that: verified photos with a magnifier first, then verified with none, then
// unverified; then rural:true before unclassified; then random. One pass, then one sort of the candidates.
// `exclude`: the round's own panorama and the in-flight set (never burn a coming round). burn: false (look boards)
// skips the burn group, so browsing never uses up a playable spot.
import {PLAYABLE} from './deal.mjs';

export const BOARD_SIZE=4,BOARD_REPEAT_DAYS=7;
const labelRank=location=>location.verified!==true?2:(location.metas??[]).some(meta=>Array.isArray(meta.box))?0:1;
export function boardSpots(pack,region,{shown=new Set(),played=new Set(),burned:burnedBefore=new Set(),exclude=new Set(),n=BOARD_SIZE,random=Math.random,burn=true}={}){
  const country=pack.regions?.[region]?.country??region,candidates=[];
  for(const location of pack.locations){
    if(exclude.has(location.id)||played.has(location.id)||location.rural===false||location.thumbOk===false)continue;
    const here=location.region===region;
    if(!here&&location.country!==country)continue;
    const group=location.split==='study'||burnedBefore.has(location.id)?0:PLAYABLE.has(location.split)?(burn?1:-1):location.split==='seen'?2:-1;
    if(group<0)continue;
    candidates.push({location,group,key:[here?0:1,shown.has(location.id)?1:0,group,labelRank(location),location.rural===true?0:1,random()]});
  }
  candidates.sort((a,b)=>{for(let i=0;i<a.key.length;i++)if(a.key[i]!==b.key[i])return a.key[i]-b.key[i];return 0});
  const picked=candidates.slice(0,n);
  return {spots:picked.map(item=>item.location),burned:picked.filter(item=>item.group===1).map(item=>item.location.id)};
}
/** From attempts and exposures: the panoramas played or shown as training rounds, and drill spots burned onto boards. */
export function boardHistory(attempts,exposures){
  const played=new Set(attempts.map(attempt=>attempt.locationRef).filter(Boolean)),burned=new Set();
  for(const exposure of exposures)(String(exposure.id).includes(':board:')?burned:played).add(exposure.locationRef);
  for(const ref of played)burned.delete(ref);
  return {played,burned};
}
/** Board photos shown recently: entries [locationId, shownAt ms] (latest kept), the ones within BOARD_REPEAT_DAYS. */
export const recentlyShown=(entries,now=Date.now())=>new Set(entries.filter(([,at])=>now-at<BOARD_REPEAT_DAYS*864e5).map(([id])=>id));
