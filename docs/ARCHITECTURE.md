# Architecture and practical limits

`scripts/setup.mjs` binds a content pack to a user's separate practice map.
`scripts/build.mjs` builds a small userscript containing code and a lightweight
catalog of configured map bindings. Locations, skill metadata and boundaries
are separate JSON assets, not JavaScript bundled into every GeoGuessr page.
Routine play has no Fieldwork account or application backend.

## Content delivery and local state

- The public publishing build reads only `content/*.json`. GitHub Pages hosts
  a schema-versioned catalog and checksum-named runtime/audit JSON assets.
  Personal map bindings and full Learnable Meta explanation HTML are excluded.
- On first use, the script downloads only the selected pack, verifies its
  SHA-256 and identity, validates it, and stores it before switching the content
  pointer. It rejects unsupported schemas, mismatched identities and corrupt
  downloads. A failed update leaves the previous cached pack available.
- Cached practice starts without waiting for the host. On a practice-map page,
  the script checks for content changes in the background, at most daily after
  a successful check. Changes apply when preparing the next set, not midway
  through a game. An unavailable first download needs a retry or manual import.
- Full inventories (`sourceCoverage` and `curriculum`) are separate assets.
  **Export source inventory** downloads them only when requested; the progress
  tree needs just skill metadata and local observations.
- Full source explanations are retained from existing local packs or fetched
  after a guess from Learnable Meta, with clue/country matching and attribution.
  They are cached privately. An unavailable explanation does not block feedback;
  the original source link and authored short note remain available.

The userscript manager stores content under `fieldwork:content:<pack>:<version>`
and a small `fieldwork:catalog`. The first 0.10 startup migrates the old bulk
pack registry once, preserving existing owned-map bindings and full notes.
The old registry is retained for rollback but never read on later startups.
Attempts, exposures, pending reviews, launch requests and draft backups retain
all existing per-pack keys. Unchanged startup content is never re-saved.

Each prepared set records its five locations/skills and cached content key.
Each observed game pins that key, including legacy in-flight sets. Older cached
versions are retained for those games; their notes and scoring boundaries cannot
change because a newer pack arrives. Early framework events are serialized while
first-use content loads. No learner event is created merely by downloading data.

Game responses are retained by token across native URL transitions. If the
framework misses an event, a separate observer captures normal game responses
from absolute URLs, relative URLs and Request objects, without adding requests.
Never GET a game merely to recover a clue: that endpoint can advance its round.
Only completed guesses are normalized for feedback. Late older responses cannot
replace a newer round. Unshown rounds are not backfilled; normal advance feedback
only applies to a previously displayed pending card.

For custom packs, the local installer serves separate content files for the
first cache fill; leave it running until the pack appears, or manually import
`dist/practice-pack.json`. A manually imported pack is locally managed and will
not be replaced by public content. Existing cached custom packs migrate too.
Serving more countries does not increase the userscript's data payload.

The static installer binds only to loopback. Public content requests are
anonymous; practice still uses the signed-in GeoGuessr page for map publication.
No local progress or GeoGuessr credentials are sent to the content host.

## Practice behavior (unchanged)

The selector ranks available, location-backed skills by errors, due review,
source-informed importance, coverage and recent exposure. Previous-set targets
rank behind alternatives; each chosen family contributes one actual panorama.
Unseen panoramas and regional variety are preferred. Small pools can relax the
cross-set rest, but never the five-distinct-family publication guard.

Publication backs up the dedicated map's draft before replacing and publishing
five coordinates. It rejects source-map IDs, fabricated positions, duplicate
panoramas and repeated families. It uses the signed-in GeoGuessr page session;
there is no cookie export, API token file or Fieldwork account. The map API and
event framework are external dependencies and can change.

Advancing records explicitly labelled assumed-recognition practice. Explicit
misses take precedence; duplicate events do not inflate history. Correct
geography and clue recognition are stored separately. Strict status needs
multiple unfamiliar explicit checks and delayed evidence; assumptions cannot
establish mastery. These are transparent heuristics, not calibrated learning
probabilities or a clinically validated ADHD intervention. Research references
are in [learning-evidence.json](learning-evidence.json).

Known limits: Australia is incomplete; source tag matches do not prove every
panorama clearly shows the cue; small source pools cannot establish broad
unseen transfer; there is no progress cloud sync or progress-import UI; and
each learner needs a separate writable practice map. Test fixtures contain
synthetic observations, never real learner exports.
