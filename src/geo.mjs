function inRing([x,y],ring) {
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
  const [xi,yi]=ring[i], [xj,yj]=ring[j];
  if((yi>y)!==(yj>y) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) inside=!inside;
 }
 return inside;
}
function inGeometry(point,geometry) {
 const polys=geometry.type==='Polygon'?[geometry.coordinates]:geometry.type==='MultiPolygon'?geometry.coordinates:[];
 return polys.some(rings=>rings.length&&inRing(point,rings[0])&&!rings.slice(1).some(hole=>inRing(point,hole)));
}
export function regionAt(lat,lng,features) {return features.find(f=>inGeometry([lng,lat],f.geometry))?.properties.name??null}
// The atlas outlines (src/world-geometry.json, {ISO2: {name, d}}): SVG paths of rings, x=lng+180, y=90-lat, even-odd.
// ponytail: 0.15° simplification, so a guess within ~15 km of a border or coast can land in the neighbour or nowhere (null).
export function countryAt(lat,lng,geometry) {
 const point=[lng+180,90-lat];
 return Object.entries(geometry??{}).find(([,{d}])=>d.split('Z').filter(Boolean)
  .reduce((inside,ring)=>inRing(point,ring.slice(1).split('L').map(xy=>xy.split(' ').map(Number)))?!inside:inside,false))?.[0]??null;
}
