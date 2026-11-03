// Photos for a region's 2x2 board (card beats 2 and 3, look boards). Always four when the country has four.
// A board never shows a panorama the learner played or was shown as a Fieldwork training round (`played`). Groups:
//   1. study spots of the region (never played), plus drill spots already burned onto an earlier board (`burned`)
//   2. unseen drill/probe spots of the region, which are then burned: the caller adds them to exposures, so they never
//      appear in a game
//   3. 'seen' spots of the region: duel and Sprint panoramas, never played in training
//   4. to 6. the same three groups over the rest of the country
// Never rural:false or thumbOk:false. Within a group: verified photos with a magnifier first, then verified with none,
// then unverified; then rural:true before unclassified; then photos not shown on a board before; then random.
// One pass over the locations. `exclude`: the round's own panorama and the in-flight set (never burn a coming round).
// burn: false (look boards) skips the burn groups, so browsing never uses up a playable spot.
import {PLAYABLE} from './deal.mjs';

export const BOARD_SIZE=4;
const labelRank=location=>location.verified!==true?2:(location.metas??[]).some(meta=>Array.isArray(meta.box))?0:1;
export function boardSpots(pack,region,{shown=new Set(),played=new Set(),burned:burnedBefore=new Set(),exclude=new Set(),n=BOARD_SIZE,random=Math.random,burn=true}={}){
  const country=pack.regions?.[region]?.country??region,groups=[[],[],[],[],[],[]];
  for(const location of pack.locations){
    if(exclude.has(location.id)||played.has(location.id)||location.rural===false||location.thumbOk===false)continue;
    const here=location.region===region;
    if(!here&&location.country!==country)continue;
    const group=location.split==='study'||burnedBefore.has(location.id)?0:PLAYABLE.has(location.split)?(burn?1:-1):location.split==='seen'?2:-1;
    if(group>=0)groups[(here?0:3)+group].push({location,key:[labelRank(location),location.rural===true?0:1,shown.has(location.id)?1:0,random()]});
  }
  const spots=[],burned=[],byKey=(a,b)=>a.key[0]-b.key[0]||a.key[1]-b.key[1]||a.key[2]-b.key[2]||a.key[3]-b.key[3];
  groups.forEach((group,index)=>{
    if(spots.length>=n)return;
    for(const {location} of group.sort(byKey)){if(spots.length>=n)break;spots.push(location);if(index%3===1)burned.push(location.id)}
  });
  return {spots,burned};
}
/** From attempts and exposures: the panoramas played or shown as training rounds, and drill spots burned onto boards. */
export function boardHistory(attempts,exposures){
  const played=new Set(attempts.map(attempt=>attempt.locationRef).filter(Boolean)),burned=new Set();
  for(const exposure of exposures)(String(exposure.id).includes(':board:')?burned:played).add(exposure.locationRef);
  for(const ref of played)burned.delete(ref);
  return {played,burned};
}
