import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {validatePack} from './plan.mjs';

export function curatePool(imported,content) {
  validatePack(imported);
  if(!content || typeof content.id!=='string' || !Array.isArray(content.skills)) throw Error('Content needs an id and an authored skill list.');
  const bySourceName = new Map(imported.skills.map(skill=>[skill.title,skill]));
  const mappings = new Map();
  const missing = [];
  const skills = [];
  for(const authored of content.skills) {
    const source = bySourceName.get(authored.sourceName);
    if(!source) {missing.push(authored.sourceName);continue;}
    mappings.set(source.id,authored.id);
    skills.push({...source,...authored});
  }
  if(!skills.length) throw Error('No authored clues matched the imported source.');
  const selectedIds = new Set(skills.map(skill=>skill.id));
  // Missing source skills must not silently satisfy authored dependencies.
  for(const skill of skills) if(skill.prerequisites.some(id=>!selectedIds.has(id))) throw Error(`Missing source prerequisite for ${skill.title}`);
  const locations=imported.locations.map(location=>({...location,skillIds:location.skillIds.map(id=>mappings.get(id)).filter(Boolean)})).filter(location=>location.skillIds.length);
  const pack={...imported,id:content.id,title:content.title,subject:content.subject,
    answerAreaLabel:content.answerAreaLabel??imported.answerAreaLabel,
    regionFeatures:content.regionFeatures??imported.regionFeatures,
    initialSkillIds:(content.initialSkillIds??[]).filter(id=>selectedIds.has(id)),
    skills,locations,pools:imported.pools.map(pool=>({...pool,skillIds:pool.skillIds.map(id=>mappings.get(id)).filter(Boolean),locationIds:locations.filter(location=>!pool.locationIds||pool.locationIds.includes(location.id)).map(location=>location.id)})),
    curationReport:{matched:skills.length,missingSourceNames:missing,source:content.source},
  };
  return validatePack(pack);
}
async function main(){
 const [input,content,output]=process.argv.slice(2);
 if(!input||!content||!output)throw Error('Usage: node curate.mjs exported-pool.json authored-content.json pack.json');
 const pack=curatePool(JSON.parse(await readFile(input,'utf8')),JSON.parse(await readFile(content,'utf8')));
 await writeFile(output,JSON.stringify(pack,null,2)+'\n');
 console.log(JSON.stringify({clues:pack.skills.length,locations:pack.locations.length,unmatched:pack.curationReport.missingSourceNames,output}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(error.message);process.exitCode=1});
