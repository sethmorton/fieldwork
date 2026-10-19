# Content packs and provenance

The engine accepts any country/topic with enough location-backed families.
The Australian template has 531 source panoramas, 42 stable skill IDs, 36
active regional targets and 12 families. Only locations attached to active
targets can be selected. Five country-identification targets and one locally
unverified target remain deferred.

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
