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

Tampermonkey and Violentmonkey copy **every** stored GM value into every page
load, so GM storage holds only small state: `fieldwork:catalog`, per-pack content
pointers (`content-head`, `active-set`, per-game pins) and learner data (attempts,
exposures, pending reviews, launch requests, draft backups). Pack bodies and audit
inventories live in the `fieldwork-content` IndexedDB database on the GeoGuessr
origin, keyed `fieldwork:content:<pack>:<version>`, and are read only when a page
needs that pack. Content schema 2 migrates once: 0.9's bulk registry and 0.10's
GM-stored packs are copied into IndexedDB, then deleted from GM storage. If the
browser clears site data, hosted packs re-download; imported custom packs need
re-importing. Learner keys are never migrated or rewritten.

Each prepared set records its location IDs and content key. Each observed game
pins that key, including legacy in-flight sets. Older cached versions are kept
for those games; their notes and scoring boundaries cannot change because a newer
pack arrives. Early framework events are serialized while first-use content
loads. No learner event is created merely by downloading data.

Continue practice publishes the set, then navigates to the practice map with
GeoGuessr's own Next.js router (a full page load only if the router is missing or
cancels). The script, its loaded content and GeoGuessr's app stay alive, so the
native Play control is clicked as soon as it renders; an ignored click is retried
until a game page opens. Concurrent Continue clicks join one publication. DOM
changes are reconciled at most once per animation frame; a completed round whose
result view is revealed by a class change is re-checked for up to five seconds.

The selector runs on GeoGuessr's main thread on every Continue. It is linear in
history and pack size (about 10 ms for the 8,725-location worldwide pack); a
regression test fails if a 2,000-attempt worldwide selection exceeds 250 ms.

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

## Practice behavior

Skills may supply `curriculum.scope` (country-identification, within-country-regional,
specialist) and integer `rank`. Introductions follow rank within scope, subject to
five distinct families, country caps and previous-set rest; unannotated skills are
unranked country foundations. Provenance is audit metadata, not a selection signal.
A regional-only pack starts at its lowest supplied scope rather than waiting for
absent country foundations.

Introduction readiness is separate from mastery. The latest 20 outcomes in a scope
must include 17 successes, 4/5 latest successes and eight distinct skills (or all
playable skills when fewer) before the next scope opens. Both correct geography and
recognition are required unless the skill explicitly measures recognition only.
Assumed-on-advance practice can contribute, but explicit corrections replace it;
unknown answers are not successes. Readiness is recomputed, so struggling again
pauses advanced introductions without hiding already introduced review material.
Country foundations additionally require **40 distinct practised skills**, or all
playable foundations if fewer. Only skills with recorded outcomes count toward
coverage, not merely assigned panoramas. Forty is a product heuristic, not a
research-derived optimum. It allows several mixed sessions of country practice
before a strong learner sees regional details, without requiring all 275 foundations.

Worldwide advanced introductions also require practice of the specific country:
at least three foundation outcomes, 80% success over the latest five available
outcomes, and a successful latest outcome. Country identity comes from existing
location tags, not guessed title parsing. Countries with no foundation lessons wait
for 80% total foundation coverage. This is a late-content fallback for missing
lessons, not evidence that the country was learned. Existing advanced review remains
available. Sparse-pool fallback can relax these gates only after open material is
exhausted. Regional-only packs do not acquire an unreachable country gate.

New-target budgets are three at ≥85% recent success, two at 70–84% or without
feedback, and one below 70%, over the latest 20 outcomes. At most one target from
each advanced scope normally appears per set; an advanced weak/due review takes
its introduction slot. Errors, verified due review and practice older than a day
lead review selection. Unseen panoramas and regional variety remain preferred.
Cold starts and diversity/rest constraints can require more new clues. Small pools
relax curriculum limits only after exhausting open material; they never relax
family/country/publication guards. Prerequisites accept three latest successful
practice attempts as well as the existing strict statuses; validation rejects
cycles, missing IDs and active dependencies without playable or orientation evidence.

Post-guess cards show one short selection label: "New clue", "Review: you missed
this last time", or "Review". Practice counts and readiness appear only on the
start panel. No target names or clues appear before the guess.
These parameters are heuristics: [spacing experiments](https://pubmed.ncbi.nlm.nih.gov/19076480/)
support revisiting, [category experiments](https://pubmed.ncbi.nlm.nih.gov/18578849/)
support interleaving, and [retrieval experiments](https://pubmed.ncbi.nlm.nih.gov/20804289/)
support guessing before feedback. The [85% model](https://www.nature.com/articles/s41467-019-12552-4)
is not a validated GeoGuessr threshold. [Worked-example findings](https://www.jstor.org/stable/3233555)
motivate concise source explanations; [ADHD classroom guidance](https://www.cdc.gov/adhd/treatment/classroom.html)
motivates clear short tasks and breaks, not a clinical prescription for adults.

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
