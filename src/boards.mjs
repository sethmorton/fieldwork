// Photos for a region's 2x2 board (card beats 2 and 3, look boards). Always four when the country has four:
//   1. study spots of the region (never played; unshown first, ones with metas first)
//   2. panoramas of the region the learner has already seen (split 'seen': duel rounds; or attempts/exposures)
//   3. unseen drill/probe spots of the region, which are then burned: the caller adds them to exposures, so they never
//      appear in a game
//   4. the same three tiers over the rest of the country
// One pass over the locations. `exclude`: the round's own panorama and the in-flight set (never burn a coming round).
// burn: false (look boards) skips tier 3, so browsing never uses up a playable spot.
import {PLAYABLE} from './deal.mjs';

export const BOARD_SIZE=4;
export function boardSpots(pack,region,{shown=new Set(),seen=new Set(),exclude=new Set(),n=BOARD_SIZE,random=Math.random,burn=true}={}){
  const country=pack.regions?.[region]?.country??region,tiers=[[],[],[],[],[],[]];
  for(const location of pack.locations){
    if(exclude.has(location.id))continue;
    const here=location.region===region;
    if(!here&&location.country!==country)continue;
    const kind=location.split==='study'?0:location.split==='seen'||seen.has(location.id)?1:burn&&PLAYABLE.has(location.split)?2:-1;
    if(kind>=0)tiers[(here?0:3)+kind].push(location);
  }
  const spots=[],burned=[];
  tiers.forEach((tier,index)=>{
    if(spots.length>=n)return;
    const ordered=tier.map(location=>({location,key:(shown.has(location.id)?2:0)+((location.metas??[]).length?0:1)+random()})).sort((a,b)=>a.key-b.key);
    for(const {location} of ordered){if(spots.length>=n)break;spots.push(location);if(index%3===2)burned.push(location.id)}
  });
  return {spots,burned};
}
