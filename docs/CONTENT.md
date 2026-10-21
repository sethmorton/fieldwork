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
