# World pack pipeline

These scripts build the World pack (`content/world.json`, pack id `world-plonkit-clue-bank`): about 2,150 Plonk It
region-guessing clues, each with two or three Street View locations. Locations come from Plonk It guide example
links, Learnable Meta map-maker views, GeoHints and Geometas examples, Vali samples, and same-spot or nearby
captures. A small vision model checks every machine-sampled view against the guide text.

The code lives here. The caches (about 7 GB of thumbnails, reference images, model verdicts and exports) do not.
Every script is resumable and caches its network and model results, so a rebuild from caches is offline and takes
seconds.

## Directories

| Variable | Default | Holds |
| --- | --- | --- |
| `WORLD_PACK_DATA` | this directory | caches and intermediate files: `thumbs/`, `refs/`, `lm/`, `sources/`, `gap/`, `near/`, `labels/`, `clues.json`, `candidates.jsonl`, `review.jsonl`, `resolved-links.json`, `clue-bank.json`, `gap-report.json` |
| `WORLD_PACK_INPUTS` | parent of `WORLD_PACK_DATA` | upstream inputs, read only |
| `FIELDWORK` (run.sh) | this repo | where `content/world.json` and `local/world-pack.json` are written |

Running in-tree is possible. `.gitignore` keeps the cache directories and files out of git, and `seed/` stays tracked.

Upstream inputs under `WORLD_PACK_INPUTS`:

- `location-database/foundations/all-guide-topic-inventory.json` and `foundation-inventory.json`: every Plonk It guide
  tip with its stage, section and continent
- `location-database/build-catalogue.py` (country geolocator) and `location-database/catalogue.sqlite` (Learnable Meta
  catalogue views per clue)
- `location-database/learnable/public-maps-2026-10-22.json` and `catalogue-visible-2026-10-22.json`: shared Learnable
  Meta maps and their levels
- `worldwide/countries-50m.geojson`: Natural Earth 50m countries, used for country checks and answer areas
- `plonkit-guides/<slug>.json` or `plonkit-browser-index/<slug>.json`: cached guide pages
- `geopractice/plonkit-example-resolutions.json`: resolved guide short links

Versioned inputs under `WORLD_PACK_DATA/gap/`, rebuilt only when Vali's data changes:

- `subdivisions.json` from https://raw.githubusercontent.com/slashP/Vali/master/src/Vali.Core/Data/subdivisions.json
- `country-weights.json`, `{ISO2: weight}` parsed from `vali countries "*" --distribution acw`

## Accounts and tools

- Python 3 (stdlib only). `audit.py` also needs Pillow (`uv run --with pillow`).
- The `codex` CLI, signed in. Labels, curation, region extraction and review run `codex exec` with a small model
  (`REVIEW_MODEL` and `CURATE_MODEL`, default `gpt-6-luna`). Calls cost money.
- A Learnable Meta account for the export step only: `~/.config/fieldwork/lm.env` with `LM_TOKEN`, `LM_COOKIE`,
  `LM_POOL_ID` and `LM_POOL_GG` (a scratch personal map that the export fills and empties). Never commit this file.
- Vali (`dotnet tool install -g vali`) on .NET 8 (Homebrew `dotnet@8`) with country data in `~/vali-data`, for
  `gapfill.py`.
- Node 24 and this repo for `check-pack.test.mjs` and `npm run build`.

## Steps

`run.sh` runs them in order.

| Step | What it does | Writes |
| --- | --- | --- |
| `collect.py` | Gathers every clue's text and image, follows guide example links, adds Learnable Meta catalogue and export views and mapped GeoHints examples, fetches one Street View thumbnail per view | `clues.json`, `candidates.jsonl`, `thumbs/` |
| `labels.py` | Small model: does the clue have something to spot in one panorama, and which guide links are comparisons | `labels/clues.json` |
| `harvest_lm.py metas`, `index` | Meta lists of every shared Learnable Meta map, flattened with their guide country | `lm/metas/`, `lm/matches.json` |
| `curate.py visual`, `rank`, `metas` | Small model: describes each guide image, tiers and orders every tip per country (foundational, useful, niche, skip), maps Learnable Meta metas to tips | `labels/visual.json`, `labels/curation.json`, `labels/meta-tips.json` |
| `harvest_lm.py wanted`, `export` | Exports the map-maker locations behind foundational and useful tips (needs `lm.env`) | `lm/export-wanted.json`, `lm/exports.jsonl` |
| `sources.py fetch`, `map` | GeoHints and Geometas example pages (one request a second), then a small model maps each example to its tip | `sources/` |
| `review.py <candidates>` | Small vision model picks each candidate's frame and says whether the clue is clearly visible | `review.jsonl` |
| `build.py` | Picks up to three accepted locations per clue, orders clues by how often ranked No Move shows them (then foundational first, roadside clues before landscape), writes the pack | `clue-bank.json`, `gap-report.json`, `content/world.json`, `local/world-pack.json` |
| `regions.py` | Small model: which ISO 3166-2 subdivisions each regional clue applies to | `gap/clue-regions.json` |
| `gapfill.py` | Vali samples inside those regions for clues still short of two locations | `gap/pools/`, `gap/candidates.jsonl` |
| `neighbours.py` | Same-spot captures and road neighbours of clues with one location | `near/candidates.jsonl` |
| `acow.py weights`, `sample`, `classify`, `score` | Official A Competitive World country distribution ([tinyurl.com/acowdist](https://tinyurl.com/acowdist)), about 1,250 ACoW-shaped rounds from the Vali pools, a small model naming the clues visible in each. Score = ranked rounds per 1,000 in which the clue is visible | `acow/` |
| `audit.py` | Contact sheet of reviewed candidates for a person to spot-check | a JPEG and its id list |

Review verdicts are keyed by a fingerprint of clue text, source, panorama and camera, so a rerun never reuses a
verdict for a different location. `seed/gold-*.json` holds the hand-labelled checks behind the accept rules in
`review.py`. Nothing uses regex: meaning goes to the small model and `text.py` does plain string splitting.

## Rebuild

From existing caches (offline, no paid calls), run in the repo root:

```sh
WORLD_PACK_DATA=/path/to/world-map python3 tools/world-pack/build.py && node --test tools/world-pack/check-pack.test.mjs && npm run build
```

`build.py` writes the same pack to `content/world.json` (published by `npm run build` through
`scripts/content-assets.mjs`) and `local/world-pack.json` (for a local install bound in `.fieldwork.local.json`). Both
carry one `contentRevision`, which goes up only when the pack content changes, because installed userscripts refresh
a cached pack only when the hosted revision moves.

A full refresh with network and paid model calls is `WORLD_PACK_DATA=/path/to/world-map tools/world-pack/run.sh`.

`duels.py` is a separate personal step: it turns the competitive duel rounds you lost into missed clues for your own
local build. See [docs/SETUP.md](../../docs/SETUP.md#practise-the-clues-you-missed-in-competitive-duels).

## Licence

The pipeline code is MIT like the rest of the repo. The pack embeds Plonk It guide text and image links, which are
CC BY-NC-SA 4.0, so `content/world.json` is CC BY-NC-SA 4.0 and every card carries its attribution.
