// Photos for a region's 2x2 board (card beats 2 and 3, look boards). Always four when the country has four.
// Groups, in order:
//   1. card material of the region: study spots (never played) and panoramas the learner has already seen (split
//      'seen': duel and Sprint rounds; or attempts/exposures)
//   2. unseen drill/probe spots of the region, which are then burned: the caller adds them to exposures, so they never
//      appear in a game
//   3. and 4. the same two groups over the rest of the country
// Within a group: verified photos with a magnifier (a meta box) first, then verified photos with none, then unverified;
// then photos not shown before; then study before seen; then random. So a labelled seen photo beats an unlabelled study one.
// One pass over the locations. `exclude`: the round's own panorama and the in-flight set (never burn a coming round).
// burn: false (look boards) skips the burn groups, so browsing never uses up a playable spot.
import {PLAYABLE} from './deal.mjs';

export const BOARD_SIZE=4;
const labelRank=location=>location.verified!==true?2:(location.metas??[]).some(meta=>Array.isArray(meta.box))?0:1;
export function boardSpots(pack,region,{shown=new Set(),seen=new Set(),exclude=new Set(),n=BOARD_SIZE,random=Math.random,burn=true}={}){
  const country=pack.regions?.[region]?.country??region,groups=[[],[],[],[]];
  for(const location of pack.locations){
    if(exclude.has(location.id))continue;
    const here=location.region===region;
    if(!here&&location.country!==country)continue;
    const tier=location.split==='study'?0:location.split==='seen'||seen.has(location.id)?1:burn&&PLAYABLE.has(location.split)?2:-1;
    if(tier>=0)groups[(here?0:2)+(tier===2?1:0)].push({location,key:[labelRank(location),shown.has(location.id)?1:0,tier,random()]});
  }
  const spots=[],burned=[],byKey=(a,b)=>a.key[0]-b.key[0]||a.key[1]-b.key[1]||a.key[2]-b.key[2]||a.key[3]-b.key[3];
  groups.forEach((group,index)=>{
    if(spots.length>=n)return;
    for(const {location} of group.sort(byKey)){if(spots.length>=n)break;spots.push(location);if(index%2===1)burned.push(location.id)}
  });
  return {spots,burned};
}
