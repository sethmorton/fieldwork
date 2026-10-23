# Sources and attribution

The MIT license covers original Fieldwork code and documentation only. It does
not relicense third-party notes, photographs, guide/reference material,
coordinates, map boundaries or dependencies. Their original rights and terms
continue to apply; source/author attribution is retained in the content data.

- Learnable Meta: https://learnablemeta.com/ and the per-skill source links.
  Publicly displayed image references from Oliver’s Philippines guide are used
  for crop and woven-wall previews; no locations were exported from that
  share-disabled collection.
  Full source-note HTML is fetched into ignored local files during setup.
  Images are referenced by original URLs, not copied into this repository.
- Worldwide source collections: trausi (World), Swaggely (European pedestrian
  signs), Niklas (European languages), Lireax and LordKeks (chevrons),
  chrispunkt (Brazilian phone codes), ValP (area codes), and Lireax
  (Japanese pole foundations). Exact shared collection URLs and per-location
  provenance are retained in `content/worldwide.json`.
- Plonk It Australia: https://www.plonkit.net/australia — reference coverage
  and priorities. The source inventory is not an endorsement by Plonk It.
- Plonk It Philippines: https://www.plonkit.net/philippines — regional
  priorities, audited guide references and individual teaching examples.
- Plonk It guide (World pack): https://www.plonkit.net/ provides the clue text
  shipped in `content/world.json` under CC BY-NC-SA 4.0
  (https://creativecommons.org/licenses/by-nc-sa/4.0/). Every card credits its
  guide page, and images are referenced by their plonkit.net URLs, not copied.
  That pack is therefore CC BY-NC-SA 4.0 and may not be used commercially.
  Its Street View locations come from guide example links and public Learnable
  Meta community maps.
- GeoPinning Philippines: https://geopinning.space/en/rule/asia/philippines/
  — three individually checked banana, pineapple and sugarcane teaching examples.
- Philippines electricity-counter guide: https://docs.google.com/document/d/1rO9360kGXASORPft6Y2HwjOewlt_R98vJ6E_jsmGyRI/edit
  — comparison guidance; the complete guide and specialist datasets are not bundled.
- GeoHints: https://geohints.com/ — linked architecture and route-shield
  examples. Images remain at their original host; they are not bundled or
  relicensed as Fieldwork assets.
- Australia reference slides: https://docs.google.com/presentation/d/1ZXxLem3YRLWw_tmP6v31VrkiqMvcoE1GXWbTN7Pi0Ds/edit
  — source associations; the slide deck and rendered slide images are not bundled.
- GeoGuessr Event Framework by miraclewhips:
  https://github.com/miraclewhips/geoguessr-event-framework — loaded from the
  pinned commit in the userscript header, not vendored as original code.
- FSRS by open-spaced-repetition: https://github.com/open-spaced-repetition
  provides the FSRS-6 algorithm and default parameters that `src/lib/fsrs.ts`
  reimplements. No FSRS package is bundled.
- Google Street View / GeoGuessr: panorama IDs and coordinates are location
  references; neither imagery nor these services are provided by Fieldwork.

The geographic boundary source is recorded under `geographySource` in the
country content packs. Natural Earth data is public domain; the Philippines
practice-area grouping is editorial and is not an official administrative map. Dependencies installed by npm retain their licenses.

Respect content sharing settings when importing additional sources. Publishing
this repository does not grant permission to redistribute another creator's
maps or images under the Fieldwork license.
