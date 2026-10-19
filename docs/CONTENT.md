# Content packs and provenance

The engine accepts any country/topic with enough location-backed families.
The Australian template records 799 distinct source panoramas and 108 stable
skill IDs. Its 67 active regional targets span 16 families and 695 panoramas.
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
The 59 slide anchors remain candidates until cue labels and present-day
imagery are reviewed. They are not silently assigned a clue just because
their coordinates happen to fall in its region.

The biggest remaining gaps are landline codes, most route-system variants,
state housing and streetlights. External territories need an explicit
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
