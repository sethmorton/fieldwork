// POST /training-sync on the local installer: the userscript sends the training pack's progress ({packId, attempts,
// exposures}) after each set, and it is written atomically to $WORLD_PACK_DATA/training/attempts.json, which the
// nightly pack build (tools/world-pack/training.py) reads for focus. Loopback only, size-capped, shape-checked.
import {writeFile,rename} from 'node:fs/promises';
import path from 'node:path';

export const SYNC_MAX_BYTES=16*1024*1024;
const LOOPBACK=new Set(['127.0.0.1','::1','::ffff:127.0.0.1']);

/** Where attempts.json goes: $WORLD_PACK_DATA/training/, else config.worldPackData/training/, else the folder of the
 *  configured training pack (…/training/pack.json). Null when none is known: the request is then refused. */
export function syncTarget(config,env=process.env){
  const root=env.WORLD_PACK_DATA??config?.worldPackData;
  if(root)return path.join(root,'training','attempts.json');
  const entry=[{packPath:config?.packPath},...(config?.additionalPacks??[])].find(item=>/[\\/]training[\\/]pack\.json$/.test(item?.packPath??''));
  return entry?path.join(path.dirname(entry.packPath),'attempts.json'):null;
}
/** The body if it is a training sync, else null. Attempts need an id and an ISO occurredAt; exposures an id. */
export function parseSync(text){
  let value;try{value=JSON.parse(text)}catch{return null}
  if(!value||typeof value!=='object'||value.packId!=='training'||!Array.isArray(value.attempts)||!Array.isArray(value.exposures))return null;
  if(!value.attempts.every(item=>item&&typeof item.id==='string'&&Number.isFinite(Date.parse(item.occurredAt))))return null;
  if(!value.exposures.every(item=>item&&typeof item.id==='string'))return null;
  return {packId:'training',syncedAt:new Date().toISOString(),attempts:value.attempts,exposures:value.exposures};
}
/** Handles one request (the caller routes POST /training-sync here). 204 on write; 403 off loopback; 415 unless
 *  Content-Type is application/json (a web page can then only send it after a CORS preflight, which this server never
 *  answers; the userscript's GM request is not a web page request); 413 too large; 400 bad shape; 404 when no target
 *  is configured. */
export async function handleSync(req,res,target,{max=SYNC_MAX_BYTES}={}){
  const reply=(status,text='')=>{res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end(text)};
  if(!LOOPBACK.has(req.socket.remoteAddress))return reply(403,'Loopback only.');
  if(!target)return reply(404,'No training data folder configured.');
  if(!/^application\/json\s*(;|$)/i.test(req.headers['content-type']??''))return reply(415,'Send application/json.');
  if(Number(req.headers['content-length'])>max)return reply(413,'Too large.');
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>max)return reply(413,'Too large.');chunks.push(chunk)}
  const body=parseSync(Buffer.concat(chunks).toString('utf8'));
  if(!body)return reply(400,'Expected {packId:"training", attempts, exposures}.');
  const temp=`${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp,JSON.stringify(body));await rename(temp,target);
  reply(204);
}
