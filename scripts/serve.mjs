import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {syncTarget,handleSync} from './training-sync.mjs';

const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.jpg':'image/jpeg'};
// us-vegetation card images: the Tree Atlas folder named by `usvegImages` in .fieldwork.local.json, read-only, flat names
// plus the t/ thumbnails. Never copied into the repository or dist.
let config={};try{config=JSON.parse(await readFile('.fieldwork.local.json','utf8'))}catch{}
const images=config.usvegImages??null,syncFile=syncTarget(config);
http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://127.0.0.1').pathname,image=/^\/usveg-img\/((?:t\/)?[\w.-]+\.jpg)$/.exec(pathname)?.[1];
  // Training progress from the userscript, for the nightly focus (scripts/training-sync.mjs).
  if(pathname==='/training-sync'&&req.method==='POST')return handleSync(req,res,syncFile).catch(()=>{if(!res.headersSent){res.writeHead(500);res.end()}});
  const file=image?images&&path.join(images,image):pathname==='/'?'dist/index.html':/^\/(?:dist|fixtures|dist\/content-host)\/[\w.-]+$/.test(pathname)?pathname.slice(1):/^\/[\w.-]+$/.test(pathname)?'dist'+pathname:null;
  if(!file){res.writeHead(404);res.end('Not found');return;}
  try{const data=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]??'application/octet-stream','Cache-Control':image?'max-age=86400':'no-store'});res.end(data)}catch{res.writeHead(404);res.end('Not found. Run npm run setup first.');}
// PORT: a second server for fixture runs (the installer the userscript updates from stays on 8787).
}).listen(Number(process.env.PORT??8787),'127.0.0.1',()=>console.log(`Fieldwork installer: http://127.0.0.1:${process.env.PORT??8787} (Ctrl+C to stop)${syncFile?`; training sync → ${syncFile}`:''}`));
