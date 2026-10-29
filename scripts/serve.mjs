import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';

const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.jpg':'image/jpeg'};
// us-vegetation card images: the Tree Atlas folder named by `usvegImages` in .fieldwork.local.json, read-only, flat names
// plus the t/ thumbnails. Never copied into the repository or dist.
let images=null;try{images=JSON.parse(await readFile('.fieldwork.local.json','utf8')).usvegImages??null}catch{}
http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://127.0.0.1').pathname,image=/^\/usveg-img\/((?:t\/)?[\w.-]+\.jpg)$/.exec(pathname)?.[1];
  const file=image?images&&path.join(images,image):pathname==='/'?'dist/index.html':/^\/(?:dist|fixtures|dist\/content-host)\/[\w.-]+$/.test(pathname)?pathname.slice(1):/^\/[\w.-]+$/.test(pathname)?'dist'+pathname:null;
  if(!file){res.writeHead(404);res.end('Not found');return;}
  try{const data=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]??'application/octet-stream','Cache-Control':image?'max-age=86400':'no-store'});res.end(data)}catch{res.writeHead(404);res.end('Not found. Run npm run setup first.');}
}).listen(8787,'127.0.0.1',()=>console.log('Fieldwork installer: http://127.0.0.1:8787 (Ctrl+C to stop)'));
