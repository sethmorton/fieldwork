// Notes stay on their original service or in this browser's private cache.
// Pack labels may carry the source's own country as a "Country - " prefix (e.g. "Australia - Roadlines" vs "Roadlines").
export function sameClue(skill,note){
  const country=(note.country??'').trim().replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const normalize=name=>name.replace(new RegExp(`^${country}\\s*-\\s*`,'i'),'').trim().toLowerCase();
  return [skill.title,skill.sourceMetaName].filter(Boolean).some(name=>normalize(name)===normalize(note.metaName));
}
export async function sourceNote(skill,location,{fetchText,get,set,revision=0}){
  if(skill.sourceNoteHtml||skill.noteOrigin==='fieldwork-authored')return skill;
  const mapId=skill.notesSourceMapId??location.sourceMapId;
  if(!mapId)return skill;
  const key=`fieldwork:note:${mapId}:${skill.id}:${revision}:${skill.sourceMetaName??skill.title}`;
  const saved=get(key,null);if(saved)return {...skill,...saved};
  const url=new URL('https://learnablemeta.com/api/userscript/location/');
  url.search=new URLSearchParams({mapId,panoId:location.panoId});
  const note=JSON.parse(await fetchText(url.href));
  if(typeof note.metaName!=='string'||typeof note.note!=='string'||!note.note.trim()
    ||(skill.notesCountry&&note.country?.trim()!==skill.notesCountry)||!sameClue(skill,note))throw Error('Source clue changed; use the original source link while it is reviewed.');
  const value={sourceNoteHtml:note.note,attributionHtml:note.footer??skill.attributionHtml};set(key,value);
  return {...skill,...value};
}
