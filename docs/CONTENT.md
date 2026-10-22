# Content packs and provenance

The engine accepts any country/topic with enough location-backed families.
The Australian template records 815 distinct source panoramas and 115 stable
skill IDs. Its 74 active regional targets span 19 families and 711 panoramas.
Only locations attached to active targets can be selected. The other 41
targets remain deferred, including national-only recognition, singleton
examples and uncertain historical coverage claims. Your old skill IDs remain
unchanged. The scheduler aims for three new targets plus two reviews while
preserving five different families and a one-set rest for previous targets.

## Native export → tagged pool → curated pack

1. Use sources that permit copying. Check the source's sharing controls.
2. Export actual coordinates from an owned map using Map Maker's native
   **Export JSON**. Never scrape credentials or manufacture panoramas.
3. Match its locations against the public Learnable Meta note endpoint:

   ```sh
   node src/import-native.mjs local/locations.json OWNED_SOURCE_MAP_ID local/pool.json
   node src/curate.mjs local/pool.json local/authored-content.json local/curated.json
   npm run setup -- --map YOUR_SEPARATE_PRACTICE_MAP_ID --pack local/curated.json
   ```

   Create `local/` first for your private exports. The importer uses public
   read-only requests, caches responses locally and reports unmatched/failing
   panoramas. It does not edit maps or need an API key.

4. Author stable skill IDs, meaningful `practiceFamily`, `importance`, real
   prerequisites if needed, and availability. Keep original attribution.
   Each location's first `skillIds` entry is its primary training target.
5. A usable set requires five different families. Do not pad it with duplicate
   clues. Inspect cue visibility, heading and exceptions before activation.

See `content/australia.json` for the full schema. Required top-level fields:
`id`, `title`, `subject`, `skills`, `pools`, `locations`; setup binds the owned
`practiceMapId`. Add `answerAreaLabel` and optional `regionFeatures` GeoJSON
whose `properties.name` values match `location.region` for automatic regional
scoring. Without that geometry, explicit feedback can ask for the regional
result; an unknown result stays unknown.

The importer produces raw source skills, not an optimized syllabus. Curation
must supply at least five families and task-appropriate priorities. On an
Australia-only map, generic Australian eucalyptus or driving-side recognition
does not distinguish answers and stays out of the active regional mix.

## Australian references

- [Learnable Meta Australia](https://learnablemeta.com/maps/671f7d0a62423ae866572ba6)
- [Plonk It Australia](https://www.plonkit.net/australia)
- [Australia reference deck](https://docs.google.com/presentation/d/1ZXxLem3YRLWw_tmP6v31VrkiqMvcoE1GXWbTN7Pi0Ds/edit)

`src/deck-coverage.json`, `src/plonkit-coverage.json` and
`src/australia-curriculum.json` retain source associations and unresolved
claims. Their 178 units overlap and are not separate mastery skills. Source
group IDs identify where coordinates came from; they are not writable map
bindings. Source image URLs stay attributed to their original hosts.

Full Learnable Meta note HTML is excluded from the public template. The setup
refresh fetches notes for active targets into ignored `local/pack.json`.
Inspect changed labels rather than attaching a different clue to a location.

Use new pack IDs for different topics; keep stable IDs within updates. Do not
relabel a learned skill as something different while reusing its history ID.

## Delivery and revisions

The userscript contains a small map-binding catalog, not the content library.
`npm run content:build` writes separate runtime and audit assets under
`dist/content-host/` for every `content/*.json`: a new country or topic pack is
a new file there, with no engine or build-script change. Source labels may carry
the source's own `Country - ` prefix. CI publishes those public templates to GitHub Pages after
checks pass. Increment `contentRevision` for content changes; retain pack and
skill IDs so existing feedback stays attached. Do not change an existing skill
ID's meaning. The delivery schema is version 1; incompatible future schemas
must require an engine update rather than silently reinterpret cached data.

Public assets omit owned practice-map bindings and full source-note HTML.
The browser caches the selected pack and fetches source explanations locally
after guessing. Inventory exports load separately on demand. Ongoing games
pin their cached content version; new revisions affect future prepared sets.
Manual imports are locally managed and are not overwritten by the public host.

## Full-source reconciliation (content revision 6)

All 103 slides and 74 Plonk It cards have been reviewed and inventoried as
178 overlapping source units. `content/australia.json` → `sourceCoverage`
records a disposition for every unit, with actual target associations, active
subtopics and explicit gaps. No unit is marked comprehensively mastered or
fully covered. The ten finer-grained distinction groups found in the deck
audit remain in `sourceCoverage.atomicGaps`.

The new acquisition adds 105 source metas / 222 native-exported positions
from [A Major Bajor World](https://learnablemeta.com/maps/678f7bc66a1f9e050835ef24).
Thirty-nine source aliases extend existing target concepts, rather than
creating duplicate progress identities. The 66 new target candidates yield
31 additional active targets; others remain held. The Queensland angled
insulator target is separate from the older A6 pole target.

`src/australia-source-c.json` retains the permitted native coordinates and
public metadata, without full note HTML. `australia-source-c-curation.json`
contains explicit semantic mappings, cautions, families and priorities.
`australia-guide-candidates.json` preserves the guide's example references
and 59 resolved slide teaching anchors. Foreign foils, unresolved map-view
coordinates and unsafe absence rules never become positive practice labels.
The build is reproducible with `node src/build-australia-pack.mjs`.

A new target needs at least two distinct source panoramas for activation.
These are source-author teaching examples; most have not had an independent
current-rendering review. A repeated anchor never counts as unseen transfer.
Slide anchors remain candidates until cue labels and present-day
imagery are reviewed; one Brisbane anchor now has an explicitly checked
high-set housing label. They are not silently assigned a clue just because
their coordinates happen to fall in its region.

The biggest remaining gaps are detailed local landline prefixes, most
state route-system variants, Adelaide housing, and other states’ streetlights. External territories need an explicit
answer-area decision and matching scoring support. The specialist LM road
collection has thousands of reported positions, but route/camera labels
are not proof that a particular sign or house is visible. Do not fill those
gaps by guessing labels from coordinates.

For acquisition, use sharing-enabled LM metas → an owned personal source
map → the official Learnable Meta Upload button → native GeoGuessr Export
JSON → the public-note importer. A third-party practice map that cannot be
exported through its normal UI is a transfer resource, not a permission to
harvest private API state. The
[Plonk It Australia practice map](https://www.geoguessr.com/maps/64a1ceadb96fb3167bb2ad71)
currently lists 227 locations and covers guide steps 2–3. Its guide links
provide exact examples we can independently curate without pretending to
have exported that unowned map.

## Live field checks (content revision 7)

Seven additional targets have 16 live-reviewed panorama examples:

- Four geographic landline groups: 02, 03, 07, 08 (ten readable phone signs).
- Canberra numbered route shields (two examples).
- Queensland high-set housing, including an enclosed lower-storey variant (two).
- Darwin-area long straight streetlight outreach arms (two).

`src/australia-field-verified.json` contains authored notes, source links,
visible-feature descriptions, imagery dates, camera orientation, actual loaded
panorama IDs and original IDs. Several Maps links substituted newer imagery;
only the actually reviewed panorama inherits the visual check. Region labels
come from live address captions, retaining explicit labels where generalized
coastal boundary polygons omit the point.

These teaching anchors set `assessmentEligible: false`. Explicit and assumed
recognition still guide practice, but cannot become unfamiliar assessment or
mastery evidence. Some signs also show place names. No synthetic observations
were added to the learner's history.

Phone areas cross state borders; 08 also occurs in western NSW. The original
LM national-format note incorrectly describes mobile-number length and is not
reused. Fieldwork's authored notes use the
[ACMA geographic-number guidance](https://www.acma.gov.au/choose-your-phone-number)
and retain broad-region caveats. The phone map image is a schematic.

[Australia phone codes](https://www.geoguessr.com/maps/6995f7519b2124c0b992c603)
was verified through native GeoGuessr search: 53 locations by Baga #banalts.
Neither it nor Australian States Practice exposes a public JSON export in
the inspected UI. Public location datasets from
[Miss-Inputs](https://github.com/Miss-Inputs/GeoGuessr-maps) provide large real
residential/POI search spaces, but metadata alone never confirms a phone sign
or architectural feature. Do not import them as prelabelled clues.

The deck-linked Denis streetlight document currently requires access. No
request was sent. Generic QLD masts and an obscured Canberra lamp were
reviewed and held; LED replacements make old lamp-head claims unreliable.
The two new Darwin examples support a regional tendency, not exclusivity.

## Philippines pack

`content/philippines.json` contains 177 stable targets, of which 166 currently
have at least two actual panoramas and are active: 922 playable practice
panoramas across 15 families. Eleven singleton targets remain inactive.
The record includes 933 distinct panoramas total, with original camera
orientation and public-source attribution. Native export acquired 920 source
records (919 distinct panoramas); public note matching had zero failures or
unmatched records. Semantic aliases extend existing concepts instead of
creating duplicate learning tasks. Fourteen additional distinct, live-checked
guide examples supplement that source pool.

Every one of the 47 Plonk It Philippines cards is inventoried under
`sourceCoverage.guide`. Thirteen country-identification cards are excluded
from Philippines-only practice. Active overlap is recorded as partial;
phone area codes, municipality abbreviations, historical camera cars and
other missing examples remain explicit gaps. Shared Learnable Meta sources
cover regional landscapes, vegetation, infrastructure, poles, trikes,
motorcycle plates and province names. The two principal Philippines maps
currently disable sharing and were not imported through hidden endpoints.

Priorities start with pine highlands, albizia, broad crop patterns, regional
guardrail paint and pole construction, then mix in local infrastructure,
trikes, plates and place-name knowledge. All trike variants share one family,
as do motorcycle plate bands and province names. Housing and meter examples
are deliberately small comparison targets, not complete distributions.
Crop, architecture and meter guide anchors were checked in live Street View;
bulk Learnable Meta annotations have not all been independently rechecked.
The actual loaded panorama ID is retained when a source link substitutes newer
imagery. All Philippines locations are teaching examples (`assessmentEligible:
false`); a separate delayed, unseen assessment pool is still needed for mastery.

Regional scoring groups Natural Earth Admin 1 polygons into 11 **editorial
practice areas**, not official current regions. Geographic labels describe
the actual coordinates, never the source clue's claimed distribution. Unknown
coastal geometry remains unknown. Boundaries and changing province names do
not establish a cue's exclusivity.

## Worldwide foundations and intermediate pack

`content/worldwide.json` supplies 535 active targets across 13 families and
8,120 practice panoramas across 86 countries. Seven shared source collections
provide real coordinates, source labels and original image references:

- A Learnable Meta World (trausi), including its foundational and intermediate content.
- European pedestrian crosswalk signs (Swaggely).
- European languages (Niklas).
- World chevrons (Lireax, LordKeks).
- Brazilian phone codes (chrispunkt).
- The Brazil overview from Area Codes World (ValP).
- The basic Japanese pole examples from Identify Every Country (Lireax).

Native Map Maker export acquired 8,779 distinct location records. Public note
matching completed for every record; unresolved country labels and 22
source-versus-boundary disagreements remain out of the active pool. Some of
these may be valid cross-border examples, but they require review. Four
explicit chevron/pedestrian aliases extend the same target rather than
creating duplicate progress identities. Source metadata's `country` and
`metaName` must be combined during matching: the short name `Bollard` alone
would incorrectly merge countries. `notesCountry` also guards future note
refreshes against a different country's identically named clue.

All 190 official World Intermediate source labels receive a disposition in
`sourceCoverage.intermediateInventory`: 185 active, four deferred for
historical coverage verification, and one lacking a usable country match.
The broader pack also contains foundation and specialist targets; this is
not a claim to cover every intermediate clue in the world. All image URLs
reference their original host; no third-party imagery or full note HTML is
bundled into the public template.

`maxLocationsPerCountry: 1` adds country diversity to the normal five-family
rule. The publication guard enforces it before making an account request.
It is optional: existing country-only packs retain their behavior. Priorities
favor national infrastructure, signs and language ahead of fine regional
power-provider plates or individual Brazilian area codes. Source-country
metadata and generalized geometry are not evidence of political boundaries
or clue exclusivity. Regional distinctions remain recognition practice;
country scoring alone cannot establish them. Every current Worldwide
location is a source teaching example, excluded from unseen mastery credit.

## Curriculum scope (`curriculum` field)

Every active skill in the three supplied packs carries this field:

```json
"curriculum": {"scope": "country-identification" | "within-country-regional" | "specialist",
  "rank": 1, "source": {"guide": "indonesia", "tipId": "hYSj", "section": 2, "sourceOrder": 20,
  "guideUpdatedAt": "…", "mapping": "topic-match" | "partial-topic-match" | "unresolved", "caveat": "…"}}
```

The selector reads only `scope` and `rank`. `rank` is a total order per pack,
sorted by scope first. A skill without the field counts as
country-identification and ranks after every ranked skill. `source` is
provenance from the [Plonk It](https://www.plonkit.net/guide) guides
(CC-BY-NC-SA-4.0, attributed separately from the MIT engine). It records the
guide tip whose topic matches the target. It is not a prerequisite graph, and
scope says nothing about mastery. Scope follows the guide's section:
"Identifying X" is country identification, "Spotlight" is specialist, and
every other section is within-country regional. One authored exception: the
individual Brazilian phone codes are specialist and follow the regional
area-code foundation. Australia and the Philippines are country-only packs,
so they have no country-identification skills.

`node scripts/classify-curriculum.mjs` regenerates the fields
deterministically, and `--check` reports stale packs without writing. It
reads three inputs:

- Untracked guide caches in `local/plonkit-guides/`: `<slug>.json` holds the page's
  `__PRELOADED_DATA__.data`, and `index.json` is the guide directory.
- The source notes from `refresh-notes.mjs` in `local/worldwide-pack.json`,
  `local/pack.json` and `local/philippines-pack.json`.
- The authored `scripts/curriculum-overrides.json`: country→guide aliases,
  hand-reviewed tip matches, and scopes for unresolved targets.

Matching works in this order:

1. Quoted note text.
2. Tip anchors already present in a pack's source records.
3. A reviewed TF-IDF keyword fallback.

Paraphrased, broad or multi-tip targets stay `partial-topic-match` with a
caveat. Targets with no matching tip stay `unresolved`. A new active skill
without a match fails the script until it gets an authored scope. Fetch
missing guides one page at a time: at most one request every 10 s, and stop
on any 403/429.
