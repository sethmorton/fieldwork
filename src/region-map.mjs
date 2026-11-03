// Country maps for the training card, drawn as SVG from the pack's regionFeatures (no map library, no tiles).
// A country is framed on its main landmass cluster, so Alaska, Hawaii or French Guiana do not shrink the map; any point
// that must show (the pin, the answer) widens the frame. Pins are HTML dots placed by percent, so they keep their size.
const SVG='http://www.w3.org/2000/svg';
export const MAP_ASPECT=1.6;
const prepared=new WeakMap();
const ringBox=ring=>{let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const [x,y] of ring){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}return [x0,y0,x1,y1]};
const ringArea=(ring,[,y0,,y1])=>{let sum=0;for(let i=0,j=ring.length-1;i<ring.length;j=i++)sum+=(ring[j][0]-ring[i][0])*(ring[j][1]+ring[i][1]);return Math.abs(sum/2)*Math.cos((y0+y1)/2*Math.PI/180)};
const union=(a,b)=>a?[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[2],b[2]),Math.max(a[3],b[3])]:b;
const gap=(a,b)=>Math.max(a[0]-b[2],b[0]-a[2],a[1]-b[3],b[1]-a[3],0);
// Rings closer than this (degrees) belong to one landmass cluster.
const CLUSTER_GAP=2.5;

function prepare(features,regions){
  let value=prepared.get(features);if(value)return value;
  const items=features.map(feature=>{
    const geometry=feature.geometry,polys=geometry?.type==='Polygon'?[geometry.coordinates]:geometry?.type==='MultiPolygon'?geometry.coordinates:[];
    const rings=polys.map(rings=>rings[0]).filter(ring=>ring?.length>2).map(ring=>{const box=ringBox(ring);return {ring,box,area:ringArea(ring,box)}});
    const name=feature.properties?.name;
    return {name,country:feature.properties?.country??regions?.[name]?.country??name,rings,box:rings.reduce((box,ring)=>union(box,ring.box),null)};
  }).filter(item=>item.box);
  value={items,frames:new Map()};prepared.set(features,value);return value;
}
// The country's main cluster: rings joined when their boxes are within CLUSTER_GAP, the cluster with the most area wins.
function countryFrame(state,country){
  if(state.frames.has(country))return state.frames.get(country);
  const rings=state.items.filter(item=>item.country===country).flatMap(item=>item.rings);
  const total=rings.reduce((sum,ring)=>sum+ring.area,0),kept=rings.filter(ring=>ring.area>=total*0.002);
  const clusters=[];
  for(const ring of kept.sort((a,b)=>b.area-a.area)){
    const near=clusters.filter(cluster=>gap(cluster.box,ring.box)<=CLUSTER_GAP);
    const merged={box:near.reduce((box,cluster)=>union(box,cluster.box),ring.box),area:near.reduce((sum,cluster)=>sum+cluster.area,ring.area)};
    for(const cluster of near)clusters.splice(clusters.indexOf(cluster),1);
    clusters.push(merged);
  }
  const frame=clusters.sort((a,b)=>b.area-a.area)[0]?.box??null;
  state.frames.set(country,frame);return frame;
}
const el=(parent,tag,attrs={},ns=SVG)=>{const node=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,v);parent?.append(node);return node};

// Outer and inner rings of any GeoJSON geometry, Feature or FeatureCollection (even-odd fill draws the holes).
export function geometryRings(value){
  if(!value)return [];
  if(value.type==='FeatureCollection')return (value.features??[]).flatMap(geometryRings);
  if(value.type==='Feature')return geometryRings(value.geometry);
  if(value.type==='GeometryCollection')return (value.geometries??[]).flatMap(geometryRings);
  const polys=value.type==='Polygon'?[value.coordinates]:value.type==='MultiPolygon'?value.coordinates:[];
  return polys.flatMap(rings=>rings??[]).filter(ring=>ring?.length>2);
}
/** A map element: {node, at(lat,lng) -> [x%, y%]}.
 *  countries: names to frame; shade: {regionName: colour}; points: [{lat,lng,color}]; line: [{lat,lng},{lat,lng}];
 *  overlays: [{geometry (GeoJSON geometry, Feature or FeatureCollection), color}] drawn over the regions (a meta's own
 *  footprint, e.g. two states). */
export function regionMap(pack,{countries=[],shade={},points=[],line=null,overlays=[],aspect=MAP_ASPECT,pad=0.06}={}){
  const state=prepare(pack.regionFeatures??[],pack.regions);
  let box=null;
  for(const country of countries){const frame=countryFrame(state,country);if(frame)box=union(box,frame)}
  for(const point of points)box=union(box,[point.lng,point.lat,point.lng,point.lat]);
  box??=[-180,-60,180,80];
  const mid=(box[1]+box[3])/2,k=Math.max(0.3,Math.cos(mid*Math.PI/180));
  // Projected frame: x = lng·k, y = −lat; padded, then widened or heightened to the aspect.
  let x0=box[0]*k,x1=box[2]*k,y0=-box[3],y1=-box[1];
  const w0=Math.max(x1-x0,2),h0=Math.max(y1-y0,2),p=Math.max(w0,h0)*pad;
  x0-=p;x1+=p;y0-=p;y1+=p;
  let w=x1-x0,h=y1-y0;
  if(w/h<aspect){const extra=h*aspect-w;x0-=extra/2;w+=extra}else{const extra=w/aspect-h;y0-=extra/2;h+=extra}
  const view=[x0/k,-(y0+h),(x0+w)/k,-y0];
  const node=document.createElement('div');node.className='rmap';node.style.aspectRatio=String(aspect);
  const svg=el(node,'svg',{viewBox:`${x0.toFixed(3)} ${y0.toFixed(3)} ${w.toFixed(3)} ${h.toFixed(3)}`,preserveAspectRatio:'xMidYMid meet',role:'img'});
  const framed=new Set(countries),digits=w>60?1:2;
  const path=rings=>rings.map(({ring})=>'M'+ring.map(([lng,lat])=>`${(lng*k).toFixed(digits)} ${(-lat).toFixed(digits)}`).join('L')+'Z').join('');
  // Only the framed countries (proto-v2: the country alone, no basemap), shaded regions on top. Rings wholly outside the
  // frame (Hawaii on a lower-48 frame) are skipped.
  const visible=state.items.filter(item=>(framed.has(item.country)||shade[item.name])&&gap(item.box,view)===0);
  for(const item of [...visible.filter(item=>!shade[item.name]),...visible.filter(item=>shade[item.name])]){
    const rings=item.rings.filter(ring=>gap(ring.box,view)===0);
    el(svg,'path',{d:path(rings),fill:shade[item.name]??'#fbf8ef',stroke:'#8a8a8a','stroke-width':0.7,'vector-effect':'non-scaling-stroke','fill-rule':'evenodd'});
  }
  for(const {geometry,color='#c0392b'} of overlays){
    const rings=geometryRings(geometry).map(ring=>({ring,box:ringBox(ring)})).filter(ring=>gap(ring.box,view)===0);
    if(rings.length)el(svg,'path',{d:path(rings),fill:color,stroke:'#8a8a8a','stroke-width':0.7,'vector-effect':'non-scaling-stroke','fill-rule':'evenodd'});
  }
  const at=(lat,lng)=>[((lng*k-x0)/w)*100,((-lat-y0)/h)*100];
  if(line){const [a,b]=line.map(p=>[p.lng*k,-p.lat]);el(svg,'line',{x1:a[0],y1:a[1],x2:b[0],y2:b[1],stroke:'#121212','stroke-width':1.5,'stroke-dasharray':'4 4','vector-effect':'non-scaling-stroke'})}
  for(const point of points){
    const [left,top]=at(point.lat,point.lng),dot=document.createElement('i');dot.className='pin';
    Object.assign(dot.style,{left:left+'%',top:top+'%',background:point.color});node.append(dot);
  }
  return {node,at};
}
/** CSS for regionMap nodes (inside the training shadow root). */
export const MAP_CSS=`.rmap{position:relative;width:100%}.rmap svg{display:block;width:100%;height:100%;overflow:hidden}
.rmap .pin{position:absolute;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)}`;
