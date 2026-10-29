import {build} from 'esbuild';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {splitPack,contentHash} from '../src/content-format.mjs';
import {validatePack} from '../src/next-set.mjs';

export const contentHost='https://sethmorton.github.io/fieldwork/';
// Every content/*.json is a public pack: adding a country or topic is adding one file.
export async function readPublicPacks(){
  const names=(await readdir('content')).filter(name=>name.endsWith('.json')).sort();
  return Promise.all(names.map(async name=>JSON.parse(await readFile('content/'+name,'utf8'))));
}
export const publicScriptUrl=new URL('fieldwork.user.js',contentHost).href;
export const userscriptHeader=(version,{local=true}={})=>`// ==UserScript==
// @name         Fieldwork adaptive practice
// @namespace    fieldwork.local
// @version      ${version}
// @description  Varied GeoGuessr practice, post-guess clues, and local progress on your dedicated Fieldwork map.
// @author       Seth Morton
// @license      MIT
// @homepageURL  https://github.com/sethmorton/fieldwork
// @supportURL   https://github.com/sethmorton/fieldwork/issues
// @match        https://www.geoguessr.com/*
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_listValues
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      sethmorton.github.io
// @connect      learnablemeta.com
${local?'// @connect      127.0.0.1\n// @downloadURL  http://127.0.0.1:8787/fieldwork.user.js\n// @updateURL    http://127.0.0.1:8787/fieldwork.user.js\n':`// @downloadURL  ${publicScriptUrl}\n// @updateURL    ${publicScriptUrl}\n`}// @run-at       document-start
// @require      https://raw.githubusercontent.com/miraclewhips/geoguessr-event-framework/5e449d6b64c828fce5d2915772d61c7f95263e34/geoguessr-event-framework.js
// ==/UserScript==`;
// Bundle src/browser.mjs with the given catalog file in place of dist/practice-catalog.json.
export async function bundleUserscript(catalogPath,outfile,banner){
  await build({entryPoints:['src/browser.mjs'],outfile,bundle:true,format:'iife',target:'es2022',banner:{js:banner},
    plugins:[{name:'catalog',setup:builder=>builder.onResolve({filter:/practice-catalog\.json$/},()=>({path:path.resolve(catalogPath)}))}]});
}
export async function writeContentAssets(packs,directory){
  await mkdir(directory,{recursive:true});const entries=[];
  for(const pack of packs){
    validatePack(pack);
    const {runtime,audit}=splitPack(pack,{publicContent:true});
    const body=JSON.stringify(runtime),auditBody=JSON.stringify(audit),sha256=await contentHash(body),auditSha256=await contentHash(auditBody);
    const url=`pack-${pack.id}-${sha256}.json`,auditUrl=`audit-${pack.id}-${auditSha256}.json`;
    await writeFile(directory+'/'+url,body);await writeFile(directory+'/'+auditUrl,auditBody);
    entries.push({id:pack.id,title:pack.title,subject:pack.subject,contentRevision:pack.contentRevision??0,url,sha256,auditUrl,auditSha256});
  }
  await writeFile(directory+'/catalog.json',JSON.stringify({schemaVersion:1,packs:entries}));
  return entries;
}
export async function buildPublicContent(){
  // Never read personal configuration, hydrated notes or learner storage in the publishing path.
  const packs=await readPublicPacks();
  await writeContentAssets(packs,'dist/content-host');
  // One installable script for everyone: packs ship unbound and each learner binds their own map in Map Maker.
  await writeFile('dist/public-catalog.json',JSON.stringify(packs.map(pack=>({id:pack.id,title:pack.title,subject:pack.subject,minimumRevision:pack.contentRevision??0,manifestUrl:new URL('catalog.json',contentHost).href}))));
  const {version}=JSON.parse(await readFile('package.json','utf8'));
  await bundleUserscript('dist/public-catalog.json','dist/content-host/fieldwork.user.js',userscriptHeader(version,{local:false}));
  await writeFile('dist/content-host/index.html',`<!doctype html><meta charset="utf-8"><title>Fieldwork</title><p><a href="fieldwork.user.js">Install Fieldwork</a> (Tampermonkey or Violentmonkey) · <a href="https://github.com/sethmorton/fieldwork">Fieldwork adaptive practice</a> and its versioned content.</p>`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)buildPublicContent().catch(error=>{console.error(error);process.exitCode=1});
