#!/bin/sh
# Rebuild the world clue bank end to end. Every step is resumable and caches its network results;
# review verdicts are keyed by a fingerprint of clue text + source + panorama + cameras, so reruns never reuse
# a verdict for a different location. See README.md for inputs and accounts.
# Needs: ~/.config/fieldwork/lm.env (Learnable Meta token+session, export step only), codex CLI (small-model labels,
# review and region extraction), Vali (dotnet tool) with ~/vali-data.
# No regex anywhere: meaning goes to the small model, mechanics are plain string splitting (text.py).
set -eu
cd "$(dirname "$0")"
FIELDWORK=${FIELDWORK:-$(cd ../.. && pwd)}
DATA=${WORLD_PACK_DATA:-$PWD}
INPUTS=${WORLD_PACK_INPUTS:-$(dirname "$DATA")}
# Versioned inputs (rebuild them only when Vali's data changes):
#   gap/subdivisions.json   = https://raw.githubusercontent.com/slashP/Vali/master/src/Vali.Core/Data/subdivisions.json
# Upstream inventories come from $INPUTS/location-database, $INPUTS/plonkit-guides and $INPUTS/plonkit-browser-index.
for f in "$DATA/gap/subdivisions.json" "$INPUTS/location-database/foundations/all-guide-topic-inventory.json"; do
  [ -f "$f" ] || { echo "missing prerequisite $f" >&2; exit 1; }
done
python3 collect.py                                   # writes clues.json (first pass)
python3 labels.py                                    # small model: observable? which guide links are comparisons?
python3 harvest_lm.py metas                          # shared Learnable Meta meta lists (cached per map)
python3 harvest_lm.py index                          # flat meta list for curation
python3 curate.py visual                             # small model describes each guide image (local refs only)
python3 curate.py rank                               # per country: tier (foundational/useful/niche/skip), kind, order
python3 curate.py metas                              # small model maps Learnable Meta metas to Plonk It tips
python3 harvest_lm.py wanted                         # metas behind foundational and useful tips
python3 harvest_lm.py export "$DATA/lm/export-wanted.json"  # one export per meta; resumes, skips exported metas
python3 sources.py fetch                             # GeoHints examples (cached pages, 1 request/second)
python3 sources.py map                               # small model maps each example to its tip
python3 collect.py                                   # guide links, map-maker views, GeoHints, thumbnails
python3 review.py candidates.jsonl                   # picks frames; gates machine-oriented views (review.accepts)
python3 acow.py weights                              # official A Competitive World country distribution
python3 build.py --fieldwork "$FIELDWORK"            # first pass marks short clues
python3 regions.py                                   # where each regional clue applies (cached per clue)
python3 gapfill.py                                   # Vali candidates for short clues a 90-degree view can prove
python3 review.py gap/candidates.jsonl
python3 acow.py sample                               # ~1,250 ACoW-shaped rounds from the Vali pools
python3 acow.py classify                             # small model: which clues each round shows
python3 acow.py score                                # estimated detection rate per 1,000 ACoW-shaped rounds
python3 build.py --fieldwork "$FIELDWORK"
python3 neighbours.py                                # same-spot captures and road neighbours of one-location clues
python3 review.py near/candidates.jsonl
python3 build.py --fieldwork "$FIELDWORK"
FIELDWORK="$FIELDWORK" node --test check-pack.test.mjs
(cd "$FIELDWORK" && npm run build)                   # refresh the installer's catalog + pack assets
