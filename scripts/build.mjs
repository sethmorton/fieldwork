import {build} from 'esbuild';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {configurePack} from './setup.mjs';
import {mergePacks} from '../src/packs.mjs';
import {writeContentAssets,contentHost,buildPublicContent,readPublicPacks,userscriptHeader,bundleUserscript} from './content-assets.mjs';

export async function buildFieldwork(){
  let config;try{config=JSON.parse(await readFile('.fieldwork.local.json','utf8'))}catch{throw Error('Run npm run setup -- --map <your-owned-map-ID> first.');}
  const pack=configurePack(JSON.parse(await readFile(config.packPath,'utf8')),config.practiceMapId);
  const packs=mergePacks([],null,[pack,...await Promise.all((config.additionalPacks??[]).map(async entry=>configurePack(JSON.parse(await readFile(entry.packPath,'utf8')),entry.practiceMapId)))]);
  await mkdir('dist',{recursive:true});
  await writeFile('dist/practice-pack.json',JSON.stringify(pack,null,2)+'\n');
  await writeFile('dist/practice-packs.json',JSON.stringify(packs,null,2)+'\n');
  const publicPacks=await readPublicPacks();
  await writeContentAssets(packs,'dist');
  await buildPublicContent();
  // Personal: clues you missed in competitive duels (tools/world-pack/duels.py export), replayed as due misses.
  const missed=new Map(await Promise.all((config.missedCluesPaths??[]).map(async file=>{const value=JSON.parse(await readFile(file,'utf8'));return [value.packId,value.missed]})));
  const catalog=packs.map(item=>({id:item.id,title:item.title,subject:item.subject,practiceMapId:item.practiceMapId,minimumRevision:item.contentRevision??0,
    manifestUrl:publicPacks.some(source=>source.id===item.id)?new URL('catalog.json',contentHost).href:'http://127.0.0.1:8787/catalog.json',
    ...(missed.has(item.id)?{missedClues:missed.get(item.id)}:{})}));
  await writeFile('dist/practice-catalog.json',JSON.stringify(catalog));
  const {version}=JSON.parse(await readFile('package.json','utf8'));
  await bundleUserscript('dist/practice-catalog.json','dist/fieldwork.user.js',userscriptHeader(version));
  await build({entryPoints:['src/ui.mjs'],outfile:'dist/preview-ui.js',bundle:true,format:'esm',target:'es2022'});
  await writeFile('dist/index.html',`<!doctype html><meta charset="utf-8"><title>Install Fieldwork</title><style>body{font:18px/1.6 system-ui;max-width:600px;margin:10vh auto;padding:24px}a{color:#176b86}</style><h1>Fieldwork</h1><p>Adaptive GeoGuessr practice. Your configured practice packs are ready.</p><ol><li><a href="/fieldwork.user.js">Install or update Fieldwork</a> in Tampermonkey.</li><li>Open a practice pack in a fresh Chrome tab and choose <b>Continue practice</b>:<ul>${packs.map(item=>`<li><a href="https://www.geoguessr.com/maps/${item.practiceMapId}">${item.title.replaceAll('&','&amp;').replaceAll('<','&lt;')}</a></li>`).join('')}</ul>Bookmark these practice URLs.</li></ol><p>Once the first pack has loaded, the local server can stop. Progress stays in this browser's userscript storage.</p>`);
  console.log('Built dist/fieldwork.user.js and separate content assets');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)buildFieldwork().catch(e=>{console.error(e.message);process.exitCode=1});
