import {regionAt} from './geo.mjs';

// Keep source acquisition separate from authored labels and runtime availability.
export function expandAustralia(pack,imported,curation,candidates,field) {
  const skills=structuredClone(pack.skills), locations=structuredClone(pack.locations);
  const sourceToTarget=new Map(), byId=new Map(skills.map(skill=>[skill.id,skill]));
  for(const item of curation){
    const source=imported.skills.find(skill=>skill.title===item.sourceMetaName.replace(/^Australia\s*-\s*/,''));
    if(!source)throw Error(`Missing source meta ${item.sourceMetaId}`);
    sourceToTarget.set(source.id,item.targetId);
    if(!item.existing){
      const skill={...source,id:item.targetId,title:item.title,phase:item.importance>=25?'Regional foundations':'Regional refinements',
        prerequisites:[],sourceMetaId:item.sourceMetaId,sourceMetaName:item.sourceMetaName,
        notesSourceUrl:'https://learnablemeta.com/maps/'+item.sourceMapId,notesSourceMapId:item.sourceMapId,
        source:{title:'A Major Bajor World · Australia',url:'https://learnablemeta.com/maps/'+item.sourceMapId},
        practiceFamily:item.practiceFamily,importance:item.importance,scoringCaveats:item.scoringCaveats,
        trainingNote:item.scoringCaveats.join(' '),
        availability:'needs-verification',...(item.holdReason?{deferredReason:item.holdReason}:{}),
        validation:{tagMatch:'Native owned-map export matched to the public Learnable Meta explanation.',appearance:'Source-author examples; current rendering and cue visibility have not all been independently reviewed.',retention:'Teaching examples are not an unseen assessment pool.'}};
      skills.push(skill);byId.set(skill.id,skill);
    }
  }
  for(const original of imported.locations){
    const skillIds=original.skillIds.map(id=>sourceToTarget.get(id));
    if(skillIds.some(id=>!id))throw Error('Unmapped imported source target');
    const existing=locations.find(location=>location.panoId===original.panoId);
    if(existing){if(existing.skillIds[0]!==skillIds[0])throw Error('Conflicting primary target for existing panorama');continue;}
    locations.push({...original,skillIds,region:regionAt(original.lat,original.lng,pack.regionFeatures)??undefined});
  }
  // Explicit source-topic associations only. Foreign/negative examples are not positive target labels.
  const guideAliases={'au:plonkit:6oil':['au:lm:7409'],'au:plonkit:khBq':['au:lm:282'],
    'au:plonkit:dHGl':['au:lm:7427'],'au:plonkit:ZZKi':[]};
  for(const card of candidates.plonkit){
    const targets=guideAliases[card.sourceId]??[...new Set([
      ...curation.filter(item=>!item.existing&&item.sourceUnitIds.includes(card.sourceId)).map(item=>item.targetId),
      ...card.runtimeSkillIds])];
    if(targets.length!==1||card.status.startsWith('excluded')||card.status.startsWith('missing-absence'))continue;
    for(const example of card.locationCandidates){
      if(!example.sourceSupportsCue||example.exampleRole==='comparison-foil'||!example.panoId
        ||!example.coordinates?.meaning.startsWith('encoded Street View'))continue;
      if(locations.some(location=>location.panoId===example.panoId))continue;
      const region=regionAt(example.coordinates.lat,example.coordinates.lng,pack.regionFeatures);
      if(!region)continue;
      locations.push({id:'pano:'+example.panoId,panoId:example.panoId,lat:example.coordinates.lat,lng:example.coordinates.lng,
        heading:example.heading??0,pitch:example.pitch??0,skillIds:targets,region,
        sourceReferenceUrl:example.url,provenance:{sourceUrl:card.source.url,role:example.exampleRole,
          validation:'Guide-author example and exact source coordinates; current panorama rendering not independently checked.'}});
    }
  }
  for(const item of curation.filter(item=>!item.existing)){
    const skill=byId.get(item.targetId), examples=locations.filter(location=>location.skillIds[0]===skill.id);
    skill.actualImportedLocationCount=examples.length;
    // A singleton teaches a photograph. Keep it recorded until more examples are curated.
    if(!item.holdReason&&examples.length>=2){skill.availability='available';delete skill.deferredReason;}
    else if(!item.holdReason)skill.deferredReason='Only one distinct source panorama. Acquire another cue-visible example before adaptive activation.';
  }
  for(const skill of field.skills){
    if(byId.has(skill.id))throw Error('Field target would overwrite an existing progress identity');
    skills.push(skill);byId.set(skill.id,skill);
  }
  for(const location of field.locations){
    if(!location.provenance?.visualChecked||location.provenance.actualPanoId!==location.panoId)throw Error('Field locations need a reviewed exact panorama');
    if(locations.some(existing=>existing.panoId===location.panoId))throw Error('Reconcile a shared panorama before assigning a new primary target');
    locations.push({...location,region:location.region??regionAt(location.lat,location.lng,pack.regionFeatures)??undefined});
  }
  for(const skill of field.skills)if(locations.filter(location=>location.skillIds[0]===skill.id).length<2)throw Error('A new field target needs at least two reviewed examples');
  const guideMappings=pack.curriculum.sourceUnits.map(unit=>{
    const targets=[...new Set([...unit.existingPracticeSkillIds,...curation.filter(item=>item.sourceUnitIds.includes(unit.id)).map(item=>item.targetId),...field.skills.filter(skill=>skill.sourceUnitIds.includes(unit.id)).map(skill=>skill.id)])];
    const card=candidates.plonkit.find(card=>card.sourceId===unit.id);
    const active=targets.filter(id=>byId.get(id)?.availability==='available'||(byId.has(id)&&!byId.get(id).availability));
    const excluded=card?.status.startsWith('excluded')||unit.id==='au:deck:camera-generation';
    const outOfScope=unit.id==='au:plonkit:kN13'||['au:deck:cocos','au:deck:christmas'].includes(unit.id);
    return {sourceUnitId:unit.id,title:unit.title,sourceUrls:unit.sourceUrls,targetIds:targets,activeTargetIds:active,
      status:excluded?'excluded-national-or-reference':outOfScope?'outside-current-answer-area':active.length?'partial-location-backed':targets.length?'held-for-verification':'needs-tagged-locations',
      reason:active.length?'Explicit subtopics have teaching examples; this does not certify every variant in the source unit.':excluded?'Not an Australia-only regional discrimination task.':outOfScope?'Needs an explicit external-territory practice scope.':targets.length?'Examples or current claims do not yet meet activation requirements.':'Source retained; no cue-visible, labelled runtime examples acquired yet.'};
  });
  const active=skills.filter(skill=>!skill.availability||skill.availability==='available');
  const availableIds=new Set(active.map(skill=>skill.id));
  return {...pack,contentRevision:7,skills:skills.sort((a,b)=>(b.importance??0)-(a.importance??0)||a.id.localeCompare(b.id)),locations,
    pools:[{...pack.pools[0],skillIds:skills.map(skill=>skill.id),locationIds:locations.map(location=>location.id)}],
    coverageSummary:`${active.length} active regional targets across ${new Set(active.map(skill=>skill.practiceFamily)).size} families. Up to three new targets plus review. ${guideMappings.length} source units tracked; coverage remains partial.`,
    sourceCoverage:{schemaVersion:1,sourceUnits:guideMappings,deckTeachingAnchors:candidates.deckAnchors.map(anchor=>{
        const reviewed=field.locations.find(location=>location.provenance.originalPanoId===anchor.panoId);
        return reviewed?{...anchor,locationStatus:'live-panorama-and-cue-reviewed',activeTargetIds:reviewed.skillIds,currentPanoId:reviewed.panoId,visualValidation:reviewed.provenance.observedCue,testEligibility:'teaching-only; no unseen mastery credit'}:anchor;
      }),atomicGaps:candidates.atomicGaps,
      limitations:['All 103 slides and 74 Plonk It cards are inventoried. Aggregate units are not independent mastery targets.',
        'Slide anchors remain candidates except those explicitly linked to a field-reviewed teaching example.',
        'Source-author examples are training material, not independently validated unseen transfer tests.',
        ...field.unresolved]},
    curationReport:{...pack.curationReport,sourcePanoramas:locations.length,activeRegionalTargets:active.length,
      activePanoramas:locations.filter(location=>availableIds.has(location.skillIds[0])).length,
      fieldVerified:{targets:field.skills.length,panoramas:field.locations.length,reviewedAt:field.reviewedAt},
      sourceC:{sourceClues:imported.skills.length,nativePanoramas:imported.locations.length,failures:imported.importReport.failures,unmatched:imported.importReport.unmatched},
      missingRegions:locations.filter(location=>!location.region).map(location=>location.id),
      deferred:skills.filter(skill=>skill.availability&&skill.availability!=='available').map(({id,title,availability,deferredReason})=>({id,title,availability,deferredReason}))}};
}
