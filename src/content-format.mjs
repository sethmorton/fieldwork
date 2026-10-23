// Audit inventories are retained separately; the practice selector never reads them.
export function splitPack(pack,{publicContent=false}={}) {
  const {sourceCoverage,curriculum,...runtime}=pack;
  if(publicContent){
    delete runtime.practiceMapId;
    // Notes fetched live from their source (Learnable Meta) are never republished; a note whose source licence
    // allows redistribution (`noteLicense`, e.g. Plonk It's CC BY-NC-SA with attribution) ships with the pack.
    runtime.skills=runtime.skills.map(({sourceNoteHtml,...skill})=>skill.noteLicense?{...skill,sourceNoteHtml}:skill);
  }
  return {runtime,audit:{...(sourceCoverage?{sourceCoverage}:{}),...(curriculum?{curriculum}:{})}};
}

export async function contentHash(text) {
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
