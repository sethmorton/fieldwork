# Setup with an agent or by hand

## Before you start

Use Node 24.12+ and the same Chrome profile throughout. You need a GeoGuessr
account that can create maps, Tampermonkey and permission to run userscripts.
The official Learnable Meta userscript is optional: Fieldwork shows its own
post-guess source card. Running both may show two cards.

1. Sign into GeoGuessr yourself. An agent does not need your cookies or keys.
2. Open https://www.geoguessr.com/map-maker and create/save a **new** map named
   `Fieldwork - Practice`. Use its real `/map-maker/<24-character-ID>` URL.
   Do not repurpose a map you want to keep: Fieldwork replaces its locations.
3. In the repository root, run:

   ```sh
   npm ci
   npm run check
   npm run content:refresh
   npm run setup -- --map https://www.geoguessr.com/map-maker/YOUR_MAP_ID --pack local/pack.json
   npm run serve
   ```

   Replace `YOUR_MAP_ID`. The command checks syntax and source-map separation;
   actual ownership is verified by GeoGuessr's authenticated map-draft request.

4. Open http://127.0.0.1:8787 **in that Chrome profile**. Click the installer
   link. Review the script and finish the install in Tampermonkey.
5. Enable Chrome's required userscript permission for Tampermonkey. Follow
   [Learnable Meta's Chrome instructions](https://learnablemeta.com/docs/getting-started/chrome).
   Open a fresh GeoGuessr tab; tabs open before installation may not load it.
6. Use the local installer's **Open your dedicated map** link. The Fieldwork
   panel should say `Australia · region practice` and show **Continue practice**.
   Set No Move and your preferred time setting when the native controls appear.
7. Continue practice writes/publishes five actual locations, opens the map and
   invokes GeoGuessr's Play control. Leave the first round for the learner.
8. Bookmark `https://www.geoguessr.com/maps/<YOUR_MAP_ID>`. Use that URL and
   **Continue practice** next time. Ctrl+C can stop the installer server now.

## Add the Philippines or another pack

Create a **different owned map** for each country. To add the supplied
Philippines pack without replacing your Australia configuration:

```sh
node scripts/refresh-notes.mjs content/philippines.json local/philippines-pack.json
npm run setup -- --map YOUR_PHILIPPINES_MAP_ID --pack local/philippines-pack.json --add
npm run serve
```

For a Philippines-only first setup, omit `--add`. The explicit output filename
keeps the Australian `local/pack.json` intact. Install the rebuilt userscript
once; it contains the bindings for both packs, whose content is cached separately. Each bookmarked map URL selects its
own country. The compact **Practice pack** selector on the start panel also
switches countries. History, exposures, pending reviews, map backups and the
progress tree are stored separately under each pack ID. Legacy Australia
history and map bindings are preserved during migration.

The supplied packs check for published content updates in the background when
you open a practice map. No script reinstall is needed for those content updates.
For locally authored packs, refresh the **existing local filename**, rebuild,
then import the regenerated JSON through **Content & progress**. Do not run
first-pack setup again when you mean to append another country. A pack and a
writable practice map may each appear only once in the local configuration.

Philippines geography feedback uses 11 broad editorial practice areas, not
current official administrative regions. Generalized coastlines can leave a
location unclassified; then the panel asks for your regional result. Source
teaching examples grow practice progress but cannot establish unseen mastery.

## Add worldwide foundations and intermediate clues

Create another separate owned map named `Fieldwork - Worldwide practice`:

```sh
node scripts/refresh-notes.mjs content/worldwide.json local/worldwide-pack.json
npm run setup -- --map YOUR_WORLDWIDE_MAP_ID --pack local/worldwide-pack.json --add
npm run serve
```

For a Worldwide-only first setup, omit `--add`. Keep the other packs' local
files and configuration. Install the rebuilt script and open your Worldwide
map in a fresh tab. It uses at most two clues per family **and five different
countries** per set. Unknown-country locations cannot silently fill a slot.

The mix includes bollards, pedestrian signs, language, utility poles and
stickers, chevrons, road markings, plates and Brazilian phone codes. Broad
Brazil area-code structure and basic Japanese poles precede finer regional
variants by priority. Phone codes, all pedestrian signs and all utility-pole
variants each share one family; they cannot fill a set with related clues.
Country feedback uses the actual country polygons. Recognizing a regional
pole variant or telephone code is tracked separately through clue feedback;
a correct country guess is not proof of that finer distinction. Teaching
pools are practice-only until a separate unseen assessment pool is verified.

## Add the world PlonkIt clue bank

`content/world.json` is built by `tools/world-pack/` (see its README): Plonk It
guide clues, each with two or three Street View panoramas found from guide
example links, shared Learnable Meta maps and Vali-generated regional
candidates, every view checked by a small vision model. It embeds the Plonk It
text (CC BY-NC-SA 4.0, attributed on every card), so that pack is CC BY-NC-SA
4.0. The pipeline also writes the same pack to `local/world-pack.json` for a
local install.
Regional and specialist clues practise first; country-identification clues
are left out except European utility-pole clues. The pack sets
`"gradingPolicy": "recognition"`: reviews follow spotted/missed, and a wrong
country guess is recorded but does not turn a spotted clue into a miss.

```sh
npm run setup -- --map YOUR_WORLD_MAP_ID --pack content/world.json --add
npm run serve
```

Because the pack is also in public `content/`, the rebuilt script downloads
it from GitHub Pages like the other supplied packs.

## Practise the clues you missed in duels

`tools/world-pack/duels.py` reads every duel in your activity feed (ranked and
unranked, about the last year), and has a small vision model name the World
pack clues visible in each round that would have moved your guess toward the true location (a clue whose
area also contains your guess, like a state you already guessed in, does not count). In competitive rounds your
team lost, or guessed more than 500 km away, those clues count as missed (country clues only when you guessed the wrong country). Each becomes an explicit
miss at the time of the round, so those clues are due right away and lead your
next sets. It is personal data: it stays in your data folder and in your local
build, never in the public pack.

It needs the Natural Earth admin-1 file listed in
[tools/world-pack/README.md](../tools/world-pack/README.md) under `WORLD_PACK_INPUTS`.

```sh
set -a; . ~/.config/fieldwork/gg.env; set +a   # GG_NCFA=<your _ncfa cookie>
for step in fetch rounds classify areas export report; do WORLD_PACK_DATA=/path/to/world-map python3 tools/world-pack/duels.py $step; done
```

Add the export to `.fieldwork.local.json`, rebuild, and update the userscript:

```json
"missedCluesPaths": ["/path/to/world-map/duels/missed-clues.json"]
```

Rerunning adds only new rounds. A round already replayed is never added twice.

Tick **Learn mode** on the practice panel to work through them before any review:
clues you missed in duels and never played in Fieldwork come first (most missed
first), then new clues from the countries where you have lost the most points
(curriculum order within a country). Reviews only fill what is left. Rounds
you won but guessed more than 500 km away count as missed too.

## Your own map from the duel rounds you missed

`tools/world-pack/misses.py` turns the competitive rounds you missed into a separate
practice pack: one item per round, played on that round's own panorama (facing where
the clue was visible, with a note saying what was there), poles first, then landscape.
For missed rounds no Plonk It clue explains, a small model checks the Learnable Meta
metas of that country that Plonk It does not cover (existing community metas only).
`verify` checks that every panorama is one of your own missed rounds; `guide` writes
a study guide from the same rounds.

```sh
for step in lm pack verify; do WORLD_PACK_DATA=/path/to/world-map python3 tools/world-pack/misses.py $step; done
WORLD_PACK_DATA=/path/to/world-map python3 tools/world-pack/misses.py guide ~/Desktop/geoguessr
```

Create a second owned map whose name starts with "Fieldwork" and add the pack:

```json
"additionalPacks": [{"packPath": "/path/to/world-map/duels/pack.json", "practiceMapId": "<its map ID>"}]
```

## During practice

Guess normally. After revealing the answer, review the clue. **Next** records
assumed recognition; **Missed it** records an explicit miss. On round five,
use **Continue practice** for the next set. Source examples may have caveats;
not every occurrence is a hard state boundary.

Open **Content & progress** on your practice map to see the current pack's
progress tree. Expand a family and select a target to see its reviews,
assumed recognition and unfamiliar checks. The same tree is available under
**Your progress tree** after a guess and updates when feedback is saved.
Untouched, practising, provisional and mastered are separate states; amber
rings flag the latest missed check or a due review. Family fractions count
targets practised, not mastery. Assumed recognition and source teaching
examples cannot establish mastery. The tree is hidden during guessing and
does not reveal the next set's targets.

Progress lives in Tampermonkey's local storage, separate from GeoGuessr scores.
It is not GitHub cloud sync. Clearing script storage, changing profile or using
another computer does not carry it over automatically. Export it under
**Content & progress** before clearing or migrating. The export is a backup;
the current UI imports packs, not progress backups. Do not commit exports.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| No panel | Correct Chrome profile, installed/enabled script, userscript permission, fresh tab and exact configured map URL |
| Installer downloads as a file | Open/import that `.user.js` in your userscript manager; see the official setup guide |
| Source-note refresh fails | Endpoint may be unavailable or labels changed. Retry later or review the named source; do not silently activate mismatched notes |
| “Never the source map” | Create a different dedicated owned map; keep source pools read-only |
| GeoGuessr returns 401/403 | Sign into the correct account and confirm map ownership/map-making access |
| Publication/version error | Feedback remains local. Return to the map and retry; do not launch a stale set as if publication succeeded |
| Port 8787 already in use | Stop the previous installer server; routine practice does not need it running |
| Need a different map binding | Re-run setup for that map, rebuild, then import `dist/practice-pack.json` through **Content & progress** and update the userscript |
| Deleted or replaced a public-install practice map | Create a new map whose name starts with `Fieldwork`, open its Map Maker page in a fresh tab and pick the pack (**move here**). Progress stays with the pack. A damaged stored binding is dropped at startup, so the pack is offered there too |

## Engine and content updates

Engine updates still require installing the regenerated userscript. Content is
separate: the supplied packs load from `https://sethmorton.github.io/fieldwork/`
and cache in the userscript manager. First use requires a download; after that,
the content host can be unavailable and cached practice still works (GeoGuessr
itself still needs internet). A failed first download keeps one panel open:
network, timeout and server errors retry automatically after 10 s, 30 s, 2 min,
then every 5 min, and a pack the host does not offer yet is checked every
5 min. Verification, format, engine and browser-storage errors wait for you.
The panel offers **Retry now**, any other bound pack, and a pack file import.
Background update checks never block cached Continue practice.

Version 0.10 migrates your installed packs once, and 0.11 moves pack bodies out
of userscript storage into the browser's IndexedDB (Tampermonkey loads all
userscript storage into every page). Keep the same script identity and Chrome
profile: **update** the existing script rather than deleting it. Existing history,
map bindings, exposures and pending feedback remain local and untouched. Updates
pin the content of each active game and only affect newly prepared sets.

For engine changes: pull the repository, run `npm ci`, `npm run check`,
`npm run build`, and install the regenerated script. Public content publishing
runs only from public templates after CI passes; it never publishes your
`.fieldwork.local.json`, hydrated local files, or progress. Public packs retain
source links/attribution. Openly licensed explanations (the World pack's Plonk It
text) ship in the pack; others are fetched locally after a reveal.

A custom pack with a new ID is served by the local installer for its initial
cache fill. Keep that server running until the practice panel appears. You can
also import `dist/practice-pack.json` through the panel's import control. Manual
imports are locally managed and do not receive automatic public updates.
