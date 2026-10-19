export function inRing([x,y],ring) {
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
  const [xi,yi]=ring[i], [xj,yj]=ring[j];
  if((yi>y)!==(yj>y) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) inside=!inside;
 }
 return inside;
}
export function inGeometry(point,geometry) {
 const polys=geometry.type==='Polygon'?[geometry.coordinates]:geometry.type==='MultiPolygon'?geometry.coordinates:[];
 return polys.some(rings=>rings.length&&inRing(point,rings[0])&&!rings.slice(1).some(hole=>inRing(point,hole)));
}
export function regionAt(lat,lng,features) {return features.find(f=>inGeometry([lng,lat],f.geometry))?.properties.name??null}
