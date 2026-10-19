# Architecture and practical limits

`scripts/setup.mjs` binds a content template to a user's separate practice map.
`scripts/build.mjs` bundles that local pack into a userscript using esbuild.
The static installer binds only to loopback. Routine play uses no Fieldwork
backend: the installed script runs on GeoGuessr, reads completed rounds and
stores feedback through the userscript manager.

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
