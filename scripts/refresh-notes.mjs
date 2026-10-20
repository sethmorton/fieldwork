import {readFile,writeFile,mkdir} from 'node:fs/promises';
const input=process.argv[2]??'content/australia.json';
const pack=JSON.parse(await readFile(input,'utf8'));
let failures=0;
for(const skill of pack.skills){
  if(skill.availability&&skill.availability!=='available')continue;
  if(skill.noteOrigin==='fieldwork-authored'){
    if(typeof skill.trainingNote!=='string'||!skill.trainingNote.trim())throw Error('Authored field targets need a teaching note: '+skill.id);
    continue;
  }
  const location=pack.locations.find(l=>l.skillIds[0]===skill.id);
  if(!location){failures++;console.error('Missing location:',skill.id);continue;}
  const url=new URL('https://learnablemeta.com/api/userscript/location/');
  url.search=new URLSearchParams({mapId:skill.notesSourceMapId??location.sourceMapId,panoId:location.panoId});
  try{
    const response=await fetch(url,{signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error('HTTP '+response.status);
    const note=await response.json();
    if(typeof note.metaName!=='string'||typeof note.note!=='string'||!note.note.trim())throw Error('No source explanation returned');
    const normalize=s=>s.replace(/^Australia\s*-\s*/,'').trim().toLowerCase();
    if(![skill.title,skill.sourceMetaName].filter(Boolean).some(name=>normalize(name)===normalize(note.metaName)))throw Error('Source clue label changed; review before importing');
    skill.sourceNoteHtml=note.note;skill.attributionHtml=note.footer??skill.attributionHtml;
    console.log('Fetched:',skill.id);
  }catch(e){failures++;console.error(skill.id+': '+e.message);}
}
if(failures){console.error(`${failures} clues need review. No new pack was written.`);process.exitCode=1;}
else{await mkdir('local',{recursive:true});await writeFile('local/pack.json',JSON.stringify(pack,null,2)+'\n');console.log('Source explanations saved locally to local/pack.json. Use --pack local/pack.json during setup.');}
