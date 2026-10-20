import {readFile,writeFile} from 'node:fs/promises';
import {validatePack} from './next-set.mjs';
import {regionAt} from './geo.mjs';
import {expandAustralia} from './expand-australia.mjs';

const read=async name=>JSON.parse(await readFile(new URL(name,import.meta.url),'utf8'));
const base=await read('./australia-starter-pack.json');
const imported=await read('./australia-foundations-imported-pool.json');
const content=await read('./australia-expansion-content.json');
const curriculum=await read('./australia-curriculum.json');
const priorities=await read('./australia-priorities.json');
const recognitionIds=new Set(['au:lm:13866','au:lm:159','au:lm:155','au:lm:10213','au:lm:10214']);
const recognitionTitles={'au:lm:159':'Australian bollard construction','au:lm:155':'Give-way sign lettering and border','au:lm:10213':'White road-line patterns','au:lm:10214':'Edge rumble strips'};
const mappings=new Map();
const additions=content.skills.map(authored=>{
  const name=authored.sourceMetaName.replace(/^Australia\s*-\s*/, '');
  const source=imported.skills.find(skill=>skill.title===name);
  if(!source)throw Error(`Missing imported clue: ${name}`);
  mappings.set(source.id,authored.id);
  const recognitionOnly=recognitionIds.has(authored.id);
  const available=authored.availability==='needs-locations'||recognitionOnly;
  return {...source,...authored,prerequisites:[],sourceMetaId:authored.metaId,
    notesSourceUrl:authored.sourceUrl,
    source:{title:authored.associations[0]?.title??'Learnable Meta',url:authored.associations[0]?.url??authored.sourceUrl},
    contrastSkillIds:authored.contrastIds,
    title:recognitionTitles[authored.id]??authored.title,recognitionOnly,
    answerLevel:recognitionOnly?'recognition':authored.answerLevel,
    availability:recognitionOnly?'needs-contrasts':available?'available':authored.availability==='needs-local-validation'?'needs-verification':authored.availability,
    ...(recognitionOnly?{deferredReason:'Identifies Australia, not a region within Australia. Requires a separate practice pool containing non-Australian contrasts.'}:{}),
    actualImportedLocationCount:imported.locations.filter(location=>location.skillIds.includes(source.id)).length,
    validation:{tagMatch:'Native owned-map export matched to the public Learnable Meta explanation.',
      appearance:'Source-author tagging; individual panoramas have not all been independently visually reviewed.',
      retention:'Small source pools cannot establish 20-unseen-location mastery; more transfer locations are needed.'},
  };
});
const locations=[...base.locations];
for(const location of imported.locations){
  if(locations.some(prior=>prior.panoId===location.panoId))throw Error('Expansion duplicates an existing panorama; reconcile its tags before merging.');
  locations.push({...location,skillIds:location.skillIds.map(id=>mappings.get(id)),region:regionAt(location.lat,location.lng,base.regionFeatures)??undefined});
}
const skills=[...base.skills,...additions].map(skill=>{
  if(!priorities.skills[skill.id])throw Error(`No authored family for ${skill.id}`);
  return {...skill,...priorities.skills[skill.id],notesSourceUrl:skill.notesSourceUrl??base.notesSourceUrl};
}).sort((a,b)=>b.importance-a.importance||a.id.localeCompare(b.id));
const available=skills.filter(skill=>!skill.availability||skill.availability==='available').length;
const pack=validatePack({...base,schemaVersion:1,contentRevision:5,country:'AU',title:'Australia · region practice',answerAreaLabel:'Anywhere in Australia',initialSkillIds:[],
  skills,locations,
  pools:[{id:'au-curated-union',title:'Australia curated locations',mapUrl:base.pools[0].mapUrl,
    skillIds:skills.map(skill=>skill.id),locationIds:locations.map(location=>location.id)}],
  curriculum,coverageSummary:`${available} regional targets across ${new Set(skills.filter(skill=>!skill.availability||skill.availability==='available').map(skill=>skill.practiceFamily)).size} clue families. Five different families per set. Country-identification clues are excluded from Australia-only practice. Further regional guide coverage remains incomplete.`,
  curationReport:{sourcePanoramas:locations.length,existingClues:base.skills.length,additionalClues:additions.length,
    sourceUnitCount:curriculum.sourceUnitCount,conceptFamilyCount:curriculum.conceptFamilyCount,
    importFailures:imported.importReport.failures,unmatched:imported.importReport.unmatched,
    deferred:additions.filter(skill=>skill.availability!=='available').map(({id,title,availability,scoringCaveats})=>({id,title,availability,scoringCaveats})),
    missingRegions:locations.filter(location=>!location.region).map(location=>location.id),
    transferLimit:'Source examples are training material. Small five-location pools cannot support full unseen mastery; do not infer comprehensive country ability.'},
});
const expanded=validatePack(expandAustralia(pack,await read('./australia-source-c.json'),await read('./australia-source-c-curation.json'),await read('./australia-guide-candidates.json'),await read('./australia-field-verified.json')));
await writeFile(new URL('../content/australia.json',import.meta.url),JSON.stringify(expanded,null,2)+'\n');
console.log(JSON.stringify({skills:expanded.skills.length,available:expanded.curationReport.activeRegionalTargets,locations:expanded.locations.length,activePanoramas:expanded.curationReport.activePanoramas,missingRegions:expanded.curationReport.missingRegions.length}));
