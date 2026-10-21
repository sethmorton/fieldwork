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
once; it contains both configured packs. Each bookmarked map URL selects its
own country. The compact **Practice pack** selector on the start panel also
switches countries. History, exposures, pending reviews, map backups and the
progress tree are stored separately under each pack ID. Legacy Australia
history and map bindings are preserved during migration.

To update content later, refresh each configured template to its **existing
local filename**, then run `npm run build` and update the script. Do not run
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
map in a fresh tab. It uses five different clue families **and five different
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

Updates are explicit: pull the repository, run `npm ci`, `npm run check`,
refresh your configured content, run `npm run build`, and install the regenerated script.
For the supplied Australia setup, `npm run content:refresh` replaces the local
hydrated pack with the latest template and source notes. For a custom topic,
refresh/re-curate that topic's pack instead; do not replace it with Australia.
Personalized builds do
not auto-download a universal GitHub userscript with somebody else's map ID.
Content migration preserves the locally configured map and existing history.
