# Sprint: one broad practice map for A Competitive World (ACoW)

Goal: top 2,000 in ranked duels by Tuesday. The learner, Seth, learns fast. He needs breadth: for every ACoW country, the
clues visible from a rural road, which are utility poles, vegetation or landscape, road lines and the Google car. Each is
seen until he has spotted it twice. This replaces FSRS depth on niche metas.

## Facts (measured)

- **Urban share:** the ACoW sheet (`acow/acowdist.xlsx`, sheet 3) has 89,908 rural and 13,685 urban locations, so 87% are rural.
- **Country weights:** `acow/weights.json` lists 118 countries. Weights sum to 101,715, so normalize them.
- **Duel rounds:** `duels/rounds.json` holds 1,853 rounds, with keys map, mode, countryCode, subdivision ("Delaware (US-DE)"),
  myGuessCountry and the scores.
  - The ACoW rounds are all NoMove.
  - Wrong-country rounds cause about 75% of the points lost.
  - So country discrimination comes first.

## Pack contract (`$WORLD_PACK_DATA/sprint/pack.json`, built by `tools/world-pack/sprint.py`)

```
{ id: 'sprint-acow', title: 'Sprint · A Competitive World', subject: 'GeoGuessr', schemaVersion: 1,
  contentRevision: <unix seconds>, practiceMapId: '000000000000000000000000',
  scheduler: 'sprint', gradingPolicy: 'recognition', initialSkillIds: [],
  answerAreaLabel: '<covered> of <all> ACoW countries, poles, landscape, roads, car and your rounds',
  coverageSummary: '<n> clues across <m> countries; none yet for <uncovered country names>',
  skills: [ {                       // array order = introduction order: one stream per subject; identify-mode clues by (the
                                    // country's n-th card of that subject, points Seth loses there) alternate with regional-mode
                                    // clues by (n-th card, ACoW share); streams drawn pole, landscape, pole, roads, pole, landscape, car;
                                    // then after every 2nd card one mistake 'duel' card, most recent day and biggest deficit first;
                                    // then after every 5th card one 'contrast' card (sprint/contrast.json, biggest-loss pair first,
                                    // each with its own location; items with mergeIntoDuel add their 'A vs B' note, and their why
                                    // as tell, to that duel card instead); 'exposure' duel cards (exposure: true) form the tail,
                                    // 1 in 5 from the last regular card on; finally one deck card after every 2nd card from the
                                    // front. tell: '<one line>' from sprint/tells.json {skill id: tell}
    id: 'sprint:<ISO2>:<source id>', title: '<Country> · <short label>', phase: 'Poles' | 'Landscape' | 'Roads' | 'Car',
    practiceFamily: '<ISO2>:poles' | '<ISO2>:landscape' | '<ISO2>:roads' | '<ISO2>:car', prerequisites: [],
    availability: 'available', importance: 100,
    country: '<ISO2>', countryName: '<name>', subject: 'poles' | 'landscape' | 'roads' | 'car',
    // deck cards (sprint.py DECKS, whole Learnable Meta maps such as 'A Learnable Meta Brazil Poles'): every meta of the
    // map, skipping the judge and the quotas, id 'sprint:<ISO2>:lm:<mapId>:<metaId>', title '<Country> · <meta name>',
    // subject from gpt-6.1-sol (poles or landscape), sourceNoteHtml the Learnable Meta note verbatim; up to 2 locations
    // that both vision models confirm at zoom 0 (sprint_decks.py), rural first. A meta that gpt-6.1-sol finds repeating a
    // pole or landscape card of its country adds its confirmed locations to that card instead, up to 3 in all.
    // 'duel' cards (tools/world-pack/sprint_rounds.py): Seth's own rounds of the last 14 days on the five world maps in the
    // wrong country or more than 750 km off, plus every round of the last 24 hours, ACoW countries only. id
    // 'sprint:duel:<round id>', title '<Country> · <subdivision> (your duel, Oct 24)', phase 'Your rounds', practiceFamily
    // '<ISO2>:duel', subject 'duel', area '<subdivision>', noteLicense 'own', imageUrls [], source {title: 'Plonk It ·
    // <country>', url: guide}; sourceNoteHtml states only the round's facts ('Answer: ... You guessed ..., <km> km off, on
    // <map>.', or '<km> km off' when the guess has no place labels) and points to pack cards: 'Visible here: <clue the duel
    // check verified>' ('Visible when you turn about 90 degrees right' / 'behind you' when it was verified more than 45
    // degrees off the start heading), else 'Related cards: ...', else 'Cards for <country>: <up to 3>'. One location: the
    // round's own view (provenance {kind: 'duel-round', round}). source.url is the country's main guide (not US-HI).
    // Curation (modes, quotas, judge prompts) uses rounds before STATS_UNTIL only, so card ids stay stable.
    mode: 'regional' | 'identify',  // the country's mode: regional when Seth already identifies it (over all world-map duel
                                    // rounds n >= 6, idRate >= 0.75, false guesses <= 0.25 n), so only within-country clues;
                                    // else identify (country ID against his confusions, no continent-wide generic clues)
                                    // roads: 1 per country with share >= 0.2%; car: at most 1. Both have their teaching quote
                                    // checked by a second model (road lines only; a physical car feature that separates the
                                    // country from his confusions)
    area: 'Nationwide' | '<subdivision names>',   // from gap/clue-regions.json when known, else 'Nationwide' only if the source says so, else omitted
    why: '<one line, grounded in the source text>',
    relevance: 'Your ACoW duels: 20 rounds in India, 6 guessed wrong country.',
    sourceNoteHtml: '<p>verbatim source text</p>', imageUrls: [..up to 3], source: {title, url}, attributionHtml,
    noteLicense: 'CC BY-NC-SA 4.0',                  // Plonk It: the note ships with the hosted pack
    notesSourceMapId: '<LM mapId>', sourceMetaName: '<LM metaName>',  // Learnable Meta: hosted note fetched live
    curriculum: { scope: 'country-identification' | 'within-country-regional', rank: <1-based order>, source: {clue: '<source id>'} } } ],
  locations: [ { id, panoId, lat, lng, heading, pitch, zoom, skillIds: ['<skill id>'], country: '<name>',
                 assessmentEligible: false, sourceMapId: '<LM mapId, Learnable Meta examples only>',
                 provenance: {kind: 'source-example', source: '<learnable-meta-export|plonkit-example|...>'} } ],
             // per skill, distinct panoIds, zoom 0: first source example, then up to 2 verified duel views
             // (provenance {kind: 'duel-round', round}, note 'Your ACoW duel, <date>: ...'; tools/world-pack/sprint_duels.py,
             // two-model check plus sprint/duel-rejects.json from the contact-sheet audit), then the other source examples
  pools: [ { id: 'sprint-acow', title: 'Sprint', skillIds: [all], mapUrl: <content/world.json pools[0].mapUrl> } ],
             // the World pack's source pool; never the practice map, which stays a separate owned map
  atlas: { countries: [ { code: 'IN', name: 'India', acowShare: 0.0526, mode: 'regional', urbanShare: 0.18, duelRounds: 20,
                          wrongCountry: 6 } ] } }
```

## Scheduler contract (`src/sprint.mjs`)

- `sprintStatus(pack, attempts)` returns a `Map(skillId -> {state, shown, spotted})`.
  - `state` is one of `'new' | 'learning' | 'missed' | 'retired'`.
  - Only explicit attempts count as evidence. Attempts with `feedbackSource === 'assumed-on-advance'` add to `shown` but
    never to `spotted`.
- `planSprint(pack, attempts, {size = 5})` returns `{locationIds, reasons}`.
- `makeNextSet` calls `planSprint` when `pack.scheduler === 'sprint'`.
