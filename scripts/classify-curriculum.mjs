// Regenerates each active skill's `curriculum` field from cached PlonkIt guides
// (CC-BY-NC-SA-4.0, plonkit.net) plus authored overrides. Deterministic: same inputs → same packs.
// Inputs stay local (untracked): guide cache dir with <slug>.json (__PRELOADED_DATA__.data)
// and index.json, plus refresh-notes output packs for source-note text.
// Usage: node scripts/classify-curriculum.mjs [--guides local/plonkit-guides] [--check]
import {readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';

const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i>0?process.argv[i+1]:fallback;};
const guidesDir=arg('--guides','local/plonkit-guides');
const check=process.argv.includes('--check');
const PACKS=[
  {content:'content/worldwide.json',notes:'local/worldwide-pack.json'},
  {content:'content/australia.json',notes:'local/pack.json',guide:'australia'},
  {content:'content/philippines.json',notes:'local/philippines-pack.json',guide:'philippines'},
];
const SCOPES=['country-identification','within-country-regional','specialist'];
// Foundations-first family value for ranking: broad, fast country reads first.
const FAMILY_ORDER=['license-plates','language','bollards','road-markings','utility-poles','chevrons',
  'pedestrian-signs','traffic-signs','roadside-structures','architecture','vegetation-crops','landscape','phone-codes'];
const TOPIC=0.6,PARTIAL=0.3; // bigram containment of source note within a guide tip
const KEYWORD=0.35,MARGIN=1.3; // TF-IDF cosine fallback for paraphrased notes: floor and lead over runner-up
const STOP=new Set('the a an and or of in on to is are be can as at by for from with this these that it its which you your usually often typically also not but some most more very only'.split(' '));

const json=async path=>JSON.parse(await readFile(path,'utf8'));
const active=skill=>(!skill.availability||skill.availability==='available')&&skill.kind!=='orientation';
const tokens=text=>String(text??'').replace(/<[^>]+>/g,' ').replace(/\]\([^)]*\)/g,' ').replace(/https?:\/\/\S+/g,' ')
  .toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(t=>t.length>1&&!STOP.has(t));
const bigrams=list=>new Set(list.length<3?list:list.slice(1).map((t,i)=>list[i]+' '+t));
const strings=value=>typeof value==='string'?[value]:Array.isArray(value)?value.flatMap(strings)
  :value&&typeof value==='object'?Object.entries(value).filter(([k])=>!/url|link|image/i.test(k)).flatMap(([,v])=>strings(v)):[];

if(!existsSync(guidesDir+'/index.json'))throw Error(`Missing guide cache ${guidesDir}/index.json; see docs/CONTENT.md (Curriculum scope).`);
const overrides=await json('scripts/curriculum-overrides.json');
const index=await json(guidesDir+'/index.json');
const guides=new Map();
const guide=async slug=>{
  if(!slug||!existsSync(`${guidesDir}/${slug}.json`))return null;
  if(guides.has(slug))return guides.get(slug);
  const {public:data}=await json(`${guidesDir}/${slug}.json`);
  const tips=[];let order=0;
  data.steps.forEach((step,s)=>{for(const item of step.items??[]){
    order++;
    if(item.kind!=='tip')continue;
    const words=tokens(strings(item.data).join(' '));
    tips.push({id:item.id,section:s+1,sectionTitle:step.title,sourceOrder:order,list:words,words:new Set(words),pairs:bigrams(words)});
  }});
  const df=new Map();
  for(const t of tips)for(const w of t.words)df.set(w,(df.get(w)??0)+1);
  const idf=new Map([...df].map(([w,n])=>[w,Math.log((tips.length+1)/(n+0.5))]));
  for(const t of tips)t.vector=unit(counts(t.list),idf);
  const result={slug,updatedAt:data.updatedAt,tips,idf,byId:new Map(tips.map(t=>[t.id,t]))};
  guides.set(slug,result);return result;
};
const counts=list=>{const m=new Map();for(const w of list)if(!/^\d+$/.test(w))m.set(w,(m.get(w)??0)+1);return m;};
const unit=(tf,idf)=>{
  const v=new Map();let n=0;
  for(const [w,c] of tf)if(idf.has(w)){const x=c*idf.get(w);v.set(w,x);n+=x*x;}
  n=Math.sqrt(n)||1;for(const [w,x] of v)v.set(w,x/n);return v;
};
// Keyword fallback: title words (minus country prefix) count double, then the source note.
const keyword=(g,title,note)=>{
  const label=tokens(title.split(/ - | · /).slice(1).join(' ')||title);
  const q=unit(counts([...label,...label,...tokens(note)]),g.idf);
  const scored=g.tips.map(t=>{let s=0;for(const [w,x] of q)s+=x*(t.vector.get(w)??0);return [s,t];}).sort((a,b)=>b[0]-a[0]);
  return {tip:scored[0]?.[1],score:scored[0]?.[0]??0,lead:(scored[0]?.[0]??0)/(scored[1]?.[0]||1e-9)};
};
const slugFor=country=>country in overrides.countryGuides?overrides.countryGuides[country]
  :index.find(g=>g.title===country||g.title===`the ${country}`)?.slug??null;
const scopeOf=tip=>tip.section===1?SCOPES[0]:/spotlight/i.test(tip.sectionTitle)?SCOPES[2]:SCOPES[1];
const contained=(a,b)=>{let n=0;for(const x of a)if(b.has(x))n++;return a.size?n/a.size:0;};

const summary={},audit=[];
for(const spec of PACKS){
  const pack=await json(spec.content);
  if(!existsSync(spec.notes))throw Error(`Missing ${spec.notes}; run: node scripts/refresh-notes.mjs ${spec.content} ${spec.notes}`);
  const notes=new Map((await json(spec.notes)).skills.map(s=>[s.id,s.sourceNoteHtml??s.trainingNote??'']));
  const cardLinks=new Map();
  for(const card of pack.sourceCoverage?.guide?.cards??[])for(const id of card.practiceSkillIds??[])cardLinks.set(id,card.cardId);
  const skills=pack.skills.filter(active);
  const countrySize=new Map();
  for(const s of skills)countrySize.set(s.notesCountry,(countrySize.get(s.notesCountry)??0)+1);
  const rows=[],missing=[];
  for(const skill of skills){
    const g=await guide(spec.guide??slugFor(skill.notesCountry));
    const o=overrides.skills[skill.id]??overrides.patterns.find(p=>new RegExp(p.title).test(skill.title))??{};
    let tip=null,mapping='unresolved',caveat,score=0;
    if(!g)caveat=`No cached PlonkIt guide for ${skill.notesCountry}; scope authored from title and family.`;
    else if(o.mapping==='unresolved')caveat='No guide tip covers this target; scope authored from title, family and source note.';
    else if(o.tipId){
      tip=g.byId.get(o.tipId);mapping='partial-topic-match';caveat='Hand-matched to this guide tip by topic; the source note is paraphrased.';
      if(!tip)throw Error(`${skill.id}: override tip ${o.tipId} not in ${g.slug}`);
    }else{
      const pairs=bigrams(tokens(notes.get(skill.id)||skill.title));
      let best=null;
      for(const t of g.tips){const c=contained(pairs,t.pairs);if(c>score)[best,score]=[t,c];}
      const linked=[JSON.stringify(skill).match(new RegExp(`plonkit\\.net/${g.slug}#(\\w+)`))?.[1],cardLinks.get(skill.id)].find(Boolean);
      if(linked&&g.byId.has(linked)&&linked!==best?.id){
        tip=g.byId.get(linked);mapping='partial-topic-match';
        caveat=`Linked by the pack's source record; source note text best matches ${score>=PARTIAL?'tip '+best.id:'no tip'}.`;
      }else if(score>=PARTIAL){
        tip=best;mapping=score>=TOPIC?'topic-match':'partial-topic-match';
        if(mapping==='partial-topic-match')caveat='Source note only partly overlaps this guide tip.';
      }else{
        const k=keyword(g,skill.title,notes.get(skill.id));
        if(k.score>=KEYWORD&&k.lead>=MARGIN){
          tip=k.tip;mapping='partial-topic-match';
          caveat=`Paraphrased source note; matched by keyword overlap (${k.score.toFixed(2)}), not by quoted text.`;
        }else caveat='No guide tip matched the source note; scope authored from title and family.';
      }
    }
    if(tip&&mapping!=='partial-topic-match'&&!o.mapping&&contained(tip.words,new Set(tokens(notes.get(skill.id))))<0.5){
      mapping='partial-topic-match';caveat='Guide tip covers more than this narrower target.';
    }
    if(o.mapping)mapping=o.mapping;
    if(o.caveat)caveat=o.caveat;
    const scope=o.scope??(tip&&mapping!=='unresolved'?scopeOf(tip):null);
    audit.push([spec.content,skill.id,skill.title,skill.practiceFamily,g?.slug??'',tip?.id??'',tip?.section??'',score.toFixed(2),mapping,scope??'MISSING',caveat??''].join('\t'));
    if(!scope){missing.push(`${skill.id} ${skill.title}`);continue;}
    const source=g?{guide:g.slug,...(tip?{tipId:tip.id,section:tip.section,sourceOrder:tip.sourceOrder}:{}),
      guideUpdatedAt:g.updatedAt,mapping,...(caveat?{caveat}:{})}:{mapping,caveat};
    const family=FAMILY_ORDER.indexOf(skill.practiceFamily);
    const value=(skill.importance??0)+3*(family<0?0:FAMILY_ORDER.length-family)
      +5*Math.log(countrySize.get(skill.notesCountry)??1)-(tip?.sourceOrder??30)/2;
    rows.push({skill,scope,source,value});
  }
  rows.sort((a,b)=>SCOPES.indexOf(a.scope)-SCOPES.indexOf(b.scope)||b.value-a.value||(a.skill.id<b.skill.id?-1:1));
  rows.forEach((r,i)=>{r.skill.curriculum={scope:r.scope,rank:i+1,source:r.source};});
  if(missing.length){console.error(`${spec.content}: ${missing.length} unresolved skills need an authored scope in scripts/curriculum-overrides.json:\n`+missing.join('\n'));process.exitCode=1;continue;}
  const text=JSON.stringify(pack,null,2)+'\n';
  if(check){if(text!==await readFile(spec.content,'utf8')){console.error(spec.content+' curriculum is stale');process.exitCode=1;}}
  else await writeFile(spec.content,text);
  const counts={};
  for(const r of rows){const k=r.scope+' / '+r.source.mapping;counts[k]=(counts[k]??0)+1;}
  summary[pack.id]=counts;
}
console.log(JSON.stringify(summary,null,2));
if(arg('--audit'))await writeFile(arg('--audit'),audit.join('\n')+'\n');
