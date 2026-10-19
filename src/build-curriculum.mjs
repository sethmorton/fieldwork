import fs from 'node:fs';
const root = new URL('./', import.meta.url);
const read = (name) => JSON.parse(fs.readFileSync(new URL(name, root)));
const deck = read('deck-coverage.json');
const plonkit = read('plonkit-coverage.json');
const pack = JSON.parse(fs.readFileSync(new URL('./australia-starter-pack.json', root)));
const phase = (id, title, rationale, prerequisites, evidenceGate) => ({ id, title, rationale, prerequisites, evidenceGate, conceptFamilyIds: [] });
const progression = [
  phase('country-recognition', 'Recognize the country', 'Learn the broad visual features that separate Australia from realistic neighboring-country alternatives. Learners who can already do this may enter at state anchors.', [], 'Country identification demonstrated on varied unseen scenes; source cards or self-report alone do not establish transfer.'),
  phase('broad-landscapes', 'Read broad landscape families', 'Combine vegetation, climate, terrain and land use before attaching state names. This limits overreliance on isolated infrastructure clues.', ['country-recognition'], 'Recognize multiple scene families and contrast similar landscapes across state boundaries; do not score a single teaching panorama as generalization.'),
  phase('state-anchors', 'Build dependable state anchors', 'Start a small active set of clearly visible state clues with diverse examples. NSW plates and WA signposts are the current location-backed starting pair, not the full syllabus.', ['country-recognition'], 'Recognition feedback plus correct regional application on multiple distinct panoramas. Correct pin placement alone is insufficient.'),
  phase('close-contrasts', 'Resolve confusable clues', 'Contrast similar poles, posts, reflectors and signs, retaining both positive examples and foils. Return errors to the active set without discarding older learning.', ['state-anchors'], 'Distinguish the cue from its nearest look-alikes on unfamiliar locations, including known exceptions.'),
  phase('regional-application', 'Combine clues to regionguess', 'Combine scene context with infrastructure, settlements and route information across regions within and between states.', ['broad-landscapes', 'close-contrasts'], 'Apply multiple independent cues to mixed, unfamiliar scenes; separate clue recognition from geographic precision.'),
  phase('advanced-roads', 'Add specialist and corridor clues', 'Add route systems, local utility tags, coverage artifacts and rare vehicles after their foundations. Time-sensitive rules require contemporary checks.', ['regional-application'], 'Current claims corroborated; distinguish local and historical patterns from hard geographic boundaries.'),
  phase('unseen-transfer', 'Retain and transfer', 'Use delayed and previously unseen mixed locations to test retention and regional reasoning. Repeated anchor panoramas measure familiarity rather than transfer.', ['regional-application'], 'A separate assessment pool, no shared panoramas with teaching anchors, delayed attempts, and no hints before guessing.'),
];
const definitions = [
 ['country-foundations','Country recognition and neighboring-country contrasts',['country-recognition']],
 ['plates','State plate and learner-plate families',['state-anchors','close-contrasts']],
 ['phone-codes','Telephone area and regional prefixes',['regional-application','advanced-roads']],
 ['pole-construction','Pole materials and structural forms',['state-anchors','close-contrasts']],
 ['pole-markings','Utility markings, paint and local labels',['close-contrasts','advanced-roads']],
 ['road-numbering','Route shields, prefixes and digit patterns',['regional-application','advanced-roads']],
 ['regulatory-signs','Speed, stopping and school-zone signs',['state-anchors','close-contrasts']],
 ['direction-signs','Direction, junction and street-name sign formats',['close-contrasts','regional-application']],
 ['sign-supports','Signpost construction and colors',['state-anchors','close-contrasts']],
 ['bollards','Bollards and reflector forms',['state-anchors','close-contrasts']],
 ['barriers','Traffic-island rails and bridge-end panels',['close-contrasts']],
 ['property-markers','Rural property marker designs',['state-anchors','close-contrasts']],
 ['guardrails','Guardrail end treatments',['close-contrasts']],
 ['hydrants','Hydrants and marker posts',['close-contrasts']],
 ['road-surface','Pavement, line layouts and curb details',['broad-landscapes','close-contrasts']],
 ['street-lights','Street-light fixtures and signal frames',['close-contrasts','regional-application']],
 ['transit','Transit signs and vehicle liveries',['regional-application']],
 ['architecture','House forms, building materials and fences',['broad-landscapes','regional-application']],
 ['vegetation','Vegetation forms and agricultural cues',['country-recognition','broad-landscapes','regional-application']],
 ['landscape','Broad landscapes, soils and climate context',['broad-landscapes','regional-application']],
 ['regional-scenes','Named regional and corridor scene combinations',['regional-application']],
 ['regional-language','Regional brands and legible local text',['regional-application']],
 ['camera','Camera generations and coverage artifacts',['advanced-roads']],
 ['special-vehicles','Park and rare-car examples',['advanced-roads']],
 ['coverage-corridors','Camera artifacts along named corridors',['advanced-roads']],
 ['territories','External-territory combinations and contrasts',['regional-application','advanced-roads']],
];
const families = definitions.map(([id,title,progressionIds]) => ({id:'au:family:'+id,title,progressionIds,sourceUnitIds:[],existingPracticeSkillIds:[],relationship:'Related or overlapping source observations grouped for curation. Membership does not mean every member is the same skill, an independent drill, or mastered.'}));
const familyByKey = new Map(families.map(f => [f.id.replace('au:family:',''),f]));
const deckFamily = (s) => {
 const k=s.id.slice('au:deck:'.length);
 const exact = { 'beer-brands':'regional-language','phone-area':'phone-codes','phone-local':'phone-codes','keep-left':'regulatory-signs','street-name-signs':'direction-signs','junction-panels':'direction-signs','wa-roundabout-signs':'direction-signs','vic-sign-maker':'direction-signs','wa-yellow-posts':'sign-supports','sa-flat-posts':'sign-supports','island-rails':'barriers','chevron-panels':'barriers','nsw-guardrails':'guardrails','property-markers':'property-markers','hydrants':'hydrants','vic-hydrant-bollards':'hydrants','traffic-signals':'street-lights','nt-camera':'coverage-corridors'};
 if(exact[k]) return exact[k];
 if(k.endsWith('-transit'))return 'transit';
 if(k.endsWith('-lights'))return 'street-lights';
 if(k.includes('park-car')||k==='qld-camera'||k==='vic-camera')return 'special-vehicles';
 if(k.endsWith('-regional-landscapes'))return 'regional-scenes';
 const byGroup={'plates':'plates','poles':'pole-construction','pole-markings':'pole-markings','road-numbering':'road-numbering','signage':'regulatory-signs','bollards':'bollards','roads':'road-surface','architecture':'architecture','vegetation':'vegetation','landscape':'landscape','coverage-meta':'camera','territories':'territories'};
 if(!byGroup[s.group]) throw new Error('Unmapped deck group '+s.group+' '+k);
 return byGroup[s.group];
};
const plonkitGroups = {
 'country-foundations':['Snwr','Jbyg','yxkv','0WyC','YdCf','iPl5','C2EJ','kYwE'],
 'vegetation':['cP3a','S44S','pAMj','LyHG'],
 'camera':['jYdQ','mrYL'],
 'plates':['b54E'],
 'phone-codes':['8smD'],
 'transit':['6oil'],
 'landscape':['SH9t','lxhc','0lXU','5dWF','3wyr','Fm8m'],
 'pole-construction':['xuhU','Pbiz','UUqd','fako','dHGl','B6K8','FQEn','khBq'],
 'pole-markings':['tILb','Aujv','Y0nT','RFNj','OgUS'],
 'bollards':['NeWE','uo2W','CAL4','0nBQ'],
 'sign-supports':['QQZc','11H1','Oh44'],
 'regulatory-signs':['17uG','W6mM','e2I1','7ykV','2kHn'],
 'direction-signs':['cAlQ','nO8C','vjrK','zB6F'],
 'road-numbering':['J0tt'],
 'street-lights':['ZZKi'],
 'property-markers':['NPFj','1aB4'],
 'guardrails':['M5MM'],
 'hydrants':['X5tc','edFk'],
 'special-vehicles':['Gni4','nMfy'],
 'territories':['kN13'],
 'regional-scenes':['vw3g','I7Ah','0RLy','T9jc','ZgT0','hovh','Uejw','ttAJ','4Vvd','hYmO'],
 'coverage-corridors':['ePjU'],
 'road-surface':['tslH'],
};
const plonkitFamily = new Map();
for (const [family,ids] of Object.entries(plonkitGroups)) for(const id of ids){if(plonkitFamily.has(id))throw new Error('Repeated Plonk It mapping '+id);plonkitFamily.set(id,family);}
const sourceUnits = [
 ...deck.skills.map(original => ({id:original.id,sourceId:'definitive-australia-2022',sourceUnitId:original.id,title:original.title,conceptFamilyId:'au:family:'+deckFamily(original),sourceUrls:original.sources.map(r=>r.url),existingPracticeSkillIds:original.existingSkillIds,readiness:{catalogOnly:true,eligibleForAdaptiveSelection:false,locationStatus:original.coverageStatus,currentVerificationRequired:original.currentness==='needs_current_verification',claimReview:'slide-visual-review-complete; verify present-day generalization and variation'},original})),
 ...plonkit.skills.map(original => {const key=original.id.slice('au:plonkit:'.length);if(!plonkitFamily.has(key))throw new Error('Unmapped Plonk It '+key);return {id:original.id,sourceId:'plonkit-australia',sourceUnitId:original.id,title:original.title,conceptFamilyId:'au:family:'+plonkitFamily.get(key),sourceUrls:[original.source.url],existingPracticeSkillIds:original.existingCoverage.skillIds,readiness:{catalogOnly:true,eligibleForAdaptiveSelection:false,locationStatus:original.existingCoverage.status,currentVerificationRequired:['Miscellaneous','Local recognition'].includes(original.group)||/plate|bus|road|130|paint|coverage|camera|antenna|street-sign/i.test(original.title),claimReview:original.imageReview},original};}),
];
for(const unit of sourceUnits)familyByKey.get(unit.conceptFamilyId.replace('au:family:','')).sourceUnitIds.push(unit.id);
const explicitFamilyByPracticeSkill = {'au:lm:374':'plates','au:lm:267':'sign-supports','au:lm:367':'regulatory-signs','au:lm:287':'bollards','au:lm:266':'sign-supports','au:lm:264':'property-markers','au:lm:556776':'property-markers','au:lm:282':'pole-construction','au:lm:281':'pole-construction','au:lm:284':'pole-construction','au:lm:283':'pole-construction','au:lm:286':'pole-construction','au:lm:313':'pole-markings','au:lm:372':'pole-markings','au:lm:369':'bollards','au:lm:370':'guardrails','au:lm:373':'hydrants','au:lm:285':'bollards','au:lm:659':'pole-construction','au:lm:368':'vegetation'};
const practiceSkillAssociations=pack.skills.map(skill=>{
 const family=familyByKey.get(explicitFamilyByPracticeSkill[skill.id]);if(!family)throw new Error('Unmapped active skill '+skill.id);
 family.existingPracticeSkillIds.push(skill.id);
 return {skillId:skill.id,title:skill.title,conceptFamilyId:family.id,sourceUnitIds:sourceUnits.filter(u=>u.existingPracticeSkillIds.includes(skill.id)).map(u=>u.id),source:skill.source||null,associationMeaning:'Explicit source overlap where sourceUnitIds are present; family membership alone is thematic, not an additional validated cue label.',runtimeLocationCount:pack.locations.filter(l=>l.skillIds.includes(skill.id)).length};
});
for(const f of families)for(const id of f.progressionIds)progression.find(p=>p.id===id).conceptFamilyIds.push(f.id);
progression.find(p=>p.id==='unseen-transfer').conceptFamilyIds=families.map(f=>f.id);
const curriculum={schemaVersion:1,id:'australia-source-curriculum',subject:'Australia',purpose:'Behind-the-scenes source coverage and progression graph. It is not a checklist UI or a replacement for the actual location-backed practice pack.',sourceUnitCount:sourceUnits.length,conceptFamilyCount:families.length,sources:[{id:'definitive-australia-2022',title:deck.source.title,url:deck.source.url,year:2022,slideCount:103,visualReview:'All slides rendered and reviewed',pdfSha256:deck.source.pdfSha256},{id:'plonkit-australia',...plonkit.sources[0],visualReview:'Card contents and image URLs extracted; candidate panorama visibility still requires review.'}],countingRules:['178 source units are source observations/aggregate reference cards, not 178 independent mastery targets.','Named families group overlap conservatively; a family may require several later atomic tasks.','The 20 existing LM skill IDs remain the only associations to the current runtime pack; catalog coverage does not create practice availability.'],activationRules:{runtimePack:'content/australia.json',catalogUnitsNeverSelectableDirectly:true,requiredBeforeNewSkillActivation:['verified claim and caveats, with contemporary check where flagged','multiple actual cue-visible panoramas with reviewed labels and orientation','realistic comparison examples and exceptions','teaching/assessment split with panorama identity deduplication'],masteryEvidence:'Only actual valid learner recognition/application attempts count. Source ingestion and correct guesses alone do not establish mastery.',progressionInterpretation:'Authored pedagogical structure rather than a validated optimal schedule; unavailable source units never become fake practice or mastery.'},progressionFamilies:progression,conceptFamilies:families,sourceUnits,practiceSkillAssociations,sourceConflicts:[{id:'nt-route-letter-summary',status:'unresolved-do-not-activate-hard-rule',sourceUnitIds:['au:deck:route-families','au:deck:nt-routes'],sourceUrls:[deck.slideIndex[91].url,deck.slideIndex[101].url],issue:'Slide 102 summarizes NT as no highway letters; slide 92 describes and illustrates A/B roads. Detailed examples and summary conflict.',resolutionRequired:'Check current route authority and current signs; retain regional/route context rather than an absolute exclusion.'},{id:'nt-pole-exclusivity',status:'exception-must-be-retained',sourceUnitIds:['au:deck:nt-poles','au:plonkit:Pbiz'],practiceSkillIds:['au:lm:281'],sourceUrls:[deck.slideIndex[90].url,'https://www.plonkit.net/australia#Pbiz'],issue:'The NT-type pole also occurs in WA; the old LM note overstates exclusivity.',resolutionRequired:'Show NT/WA contrast and cue combinations; do not label every occurrence as NT.'}],referenceMaterial:{deckSlides:deck.slideIndex,landscapeAnchors:deck.landscapeAnchors,plonkitCandidatePolicy:'Resolved example links are not validated playable/labelled practice; some are foreign-country foils.'},limitations:[...deck.limitations,...plonkit.limitations]};
fs.writeFileSync(new URL('australia-curriculum.json',root),JSON.stringify(curriculum,null,2)+'\n');
console.log(JSON.stringify({sourceUnits:sourceUnits.length,conceptFamilies:families.length,existingPracticeSkillAssociations:practiceSkillAssociations.length,progressionFamilies:progression.length}));
