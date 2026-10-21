import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {validatePack} from '../src/next-set.mjs';

export function configurePack(template,map) {
  const id=/^https:\/\/www\.geoguessr\.com\/(?:maps|map-maker)\/([a-f\d]{24})\/?$/i.exec(map)?.[1]??map;
  if(!/^[a-f\d]{24}$/i.test(id)||/^0+$/.test(id))throw Error('Provide your owned practice map URL or 24-character map ID.');
  validatePack(template);
  if(template.pools.some(p=>p.id===id||p.mapUrl.endsWith('/'+id))||template.locations.some(l=>l.sourceMapId===id))throw Error('Use a separate owned practice map, never a source map.');
  return {...template,practiceMapId:id};
}
async function main(){
  const args=process.argv.slice(2),map=args[args.indexOf('--map')+1];
  if(!args.includes('--map')||!map)throw Error('Usage: npm run setup -- --map <owned-map-URL-or-ID> [--pack content/australia.json] [--add]');
  const packPath=args.includes('--pack')?args[args.indexOf('--pack')+1]:'content/australia.json';
  const template=JSON.parse(await readFile(packPath,'utf8'));
  const pack=configurePack(template,map);
  const entry={packPath,practiceMapId:pack.practiceMapId};
  let config=entry;
  if(args.includes('--add')){
    try{config=JSON.parse(await readFile('.fieldwork.local.json','utf8'))}catch{throw Error('Set up the first pack before using --add.');}
    for(const existing of [config,...(config.additionalPacks??[])]){
      const current=JSON.parse(await readFile(existing.packPath,'utf8'));
      if(current.id===pack.id||existing.practiceMapId===pack.practiceMapId)throw Error('That pack or practice map is already configured. Update its existing local configuration.');
    }
    config={...config,additionalPacks:[...(config.additionalPacks??[]),entry]};
  }
  await writeFile('.fieldwork.local.json',JSON.stringify(config,null,2)+'\n');
  const {buildFieldwork}=await import('./build.mjs');await buildFieldwork();
  console.log('Ready: npm run serve, then open http://127.0.0.1:8787 and install the userscript.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1});
