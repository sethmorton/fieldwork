// Turns an in-card Fieldwork report into a GitHub issue, so players need no account.
// Only locations in the published packs are accepted, and pack data (not the client) names the clue.
const host='https://sethmorton.github.io/fieldwork/',repo='sethmorton/fieldwork';
const reasons=new Set(['Clue not visible','Wrong clue','Something else']);
const packs=new Map();let catalog=null;
// ponytail: per-instance 10-minute cache, no shared store; fine at this volume.
async function json(url){const response=await fetch(url);if(!response.ok)throw Error(`${url}: HTTP ${response.status}`);return response.json()}
async function pack(id){
  if(!catalog||Date.now()-catalog.at>600000)catalog={at:Date.now(),body:await json(host+'catalog.json')};
  const entry=catalog.body.packs.find(item=>item.id===id);if(!entry)return null;
  if(!packs.has(entry.url))packs.set(entry.url,await json(host+entry.url));
  return packs.get(entry.url);
}
const github=(path,init={})=>fetch('https://api.github.com'+path,{...init,headers:{authorization:`Bearer ${process.env.GITHUB_TOKEN}`,accept:'application/vnd.github+json','user-agent':'fieldwork-reports'}});
export async function report(body,{findPack=pack,api=github}={}){
  const text=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
  const packId=text(body?.packId,100),locationId=text(body?.locationId,200),reason=text(body?.reason,40),note=text(body?.note,500),version=text(body?.version,40);
  if(!reasons.has(reason))return {status:400,body:{ok:false,error:'Unknown reason.'}};
  const found=await findPack(packId),location=found?.locations.find(item=>item.id===locationId);
  if(!location)return {status:404,body:{ok:false,error:'Unknown location.'}};
  const skill=found.skills.find(item=>item.id===location.skillIds[0]);
  const pano=`https://www.google.com/maps/@?api=1&map_action=pano&pano=${encodeURIComponent(location.panoId)}&heading=${location.heading??0}`;
  const quote=value=>value.replace(/[<>@`]/g,'').split('\n').map(line=>'> '+line).join('\n');
  const entry=`**${reason}**${note?'\n\n'+quote(note):''}\n\nScript version: ${version||'unknown'}`;
  const search=await api(`/search/issues?q=${encodeURIComponent(`repo:${repo} is:issue is:open label:location in:body "${location.id}"`)}`);
  const existing=search.ok?(await search.json()).items?.[0]:null;
  if(existing){
    const comment=await api(`/repos/${repo}/issues/${existing.number}/comments`,{method:'POST',body:JSON.stringify({body:`Another report from Fieldwork.\n\n${entry}`})});
    return comment.ok?{status:200,body:{ok:true,issue:existing.html_url}}:{status:502,body:{ok:false,error:'GitHub refused the report.'}};
  }
  const issue=await api(`/repos/${repo}/issues`,{method:'POST',body:JSON.stringify({labels:['location'],title:`${reason}: ${skill?.title??location.id}`,
    body:`Reported from the Fieldwork clue card.\n\n${entry}\n\n| | |\n|---|---|\n| Pack | \`${found.id}\` |\n| Location | \`${location.id}\` |\n| Clue | \`${skill?.id}\` ${skill?.title??''} |\n| Coordinates | ${location.lat}, ${location.lng} |\n| Street View | ${pano} |`})});
  if(!issue.ok)return {status:502,body:{ok:false,error:'GitHub refused the report.'}};
  return {status:201,body:{ok:true,issue:(await issue.json()).html_url}};
}
export async function POST(request){
  let body;try{body=await request.json()}catch{return Response.json({ok:false,error:'Send JSON.'},{status:400})}
  try{const result=await report(body);return Response.json(result.body,{status:result.status})}
  catch(error){console.error(error);return Response.json({ok:false,error:'Report failed.'},{status:502})}
}
