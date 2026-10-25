// One-off: Natural Earth 1:50m countries -> src/world-geometry.json, {ISO2: {name, d}} as equirectangular SVG paths
// (x=lng+180, y=90-lat). Rerun only to change the simplification: node scripts/world-geometry.mjs
import {readFile,writeFile} from 'node:fs/promises';

const source=`${process.env.WORLD_PACK_INPUTS??'/Users/sethmorton/Documents/Codex/2026-10-18/can-x20/work'}/worldwide/countries-50m.geojson`;
const tolerance=0.15,minArea=0.02;
const iso=value=>value?.length===2?value:null;
const area=ring=>Math.abs(ring.reduce((sum,[x,y],i)=>{const [nx,ny]=ring[(i+1)%ring.length];return sum+x*ny-nx*y},0))/2;
function segmentDistance([x,y],[ax,ay],[bx,by]){
  const dx=bx-ax,dy=by-ay,length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/length)):0;
  return Math.hypot(x-ax-t*dx,y-ay-t*dy);
}
function simplify(points){
  let index=0,max=0;
  for(let i=1;i<points.length-1;i++){const distance=segmentDistance(points[i],points[0],points.at(-1));if(distance>max){max=distance;index=i}}
  return max>tolerance?[...simplify(points.slice(0,index+1)).slice(0,-1),...simplify(points.slice(index))]:[points[0],points.at(-1)];
}
// Closed rings: split at the far point so Douglas-Peucker never sees a zero-length baseline.
function simplifyRing(ring){
  const reach=point=>Math.hypot(point[0]-ring[0][0],point[1]-ring[0][1]);
  const far=ring.reduce((best,point,i)=>reach(point)>reach(ring[best])?i:best,0);
  return [...simplify(ring.slice(0,far+1)).slice(0,-1),...simplify(ring.slice(far))];
}
// GeoJSON rings repeat their first point; Z closes the path instead.
const path=ring=>'M'+ring.slice(0,-1).map(([lng,lat])=>`${+(lng+180).toFixed(2)} ${+(90-lat).toFixed(2)}`).join('L')+'Z';

const countries={};
for(const {properties:p,geometry} of JSON.parse(await readFile(source,'utf8')).features){
  const code=iso(p.ISO_A2)??iso(p.ISO_A2_EH)??iso(p.WB_A2);
  if(!code||code==='AQ')continue;
  const rings=(geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates).flat();
  const largest=Math.max(...rings.map(area));
  // Tiny islets vanish, but every country keeps its largest ring (unsimplified if simplification collapses it).
  const d=rings.filter(ring=>area(ring)===largest||area(ring)>=minArea).map(ring=>{const simple=simplifyRing(ring);return path(simple.length>3?simple:ring)}).join('');
  // Several features can share a code (Australia's external territories): the one whose own ISO_A2 matches names it.
  countries[code]={name:iso(p.ISO_A2)?p.NAME:countries[code]?.name??p.NAME,d:(countries[code]?.d??'')+d};
}
await writeFile(new URL('../src/world-geometry.json',import.meta.url),JSON.stringify(countries));
console.log(`${Object.keys(countries).length} countries`);
