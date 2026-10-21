import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {splitPack,contentHash} from '../src/content-format.mjs';
import {validatePack} from '../src/next-set.mjs';

export const contentHost='https://sethmorton.github.io/fieldwork/';
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
  const packs=await Promise.all(['australia','philippines','worldwide'].map(async name=>JSON.parse(await readFile('content/'+name+'.json','utf8'))));
  await writeContentAssets(packs,'dist/content-host');
  await writeFile('dist/content-host/index.html','<!doctype html><meta charset="utf-8"><title>Fieldwork content</title><p>Versioned content for <a href="https://github.com/sethmorton/fieldwork">Fieldwork adaptive practice</a>.</p>');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)buildPublicContent().catch(error=>{console.error(error);process.exitCode=1});
