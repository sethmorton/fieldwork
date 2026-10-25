#!/usr/bin/env python3
"""Vision check of the exported DECKS locations (sprint.py): which view of each location clearly shows its meta's clue?
Tried in order until one passes: the author's own view (heading, pitch, zoom), the same at zoom 1 and then zoom 2, then
turned 90, 180 and 270 degrees at zoom 1 (poles often stand beside the road). sprint_duels.py's two strong models must
both answer its CONFIRM question yes: FIND_MODEL first, then CONFIRM_MODEL; answers cached by fingerprint in
sprint/deck-verdicts.json. Writes yes, no or dead per panorama into win/location-verdicts.json, replacing an earlier
verdict on the same panorama (it lists the replaced ones: check that no pack card lost a location), and the passing view
into sprint/deck-views.json, which the card keeps; sprint.py teaches a deck card only on a yes. The author's frame is also
labelled rural, suburban or urban (rurality.py, by panorama id), so sprint.py takes rural ones first.
Usage: WORLD_PACK_DATA=<caches> WORLD_PACK_INPUTS=<inputs> uv run --with pillow python3 tools/world-pack/sprint_decks.py,
then rebuild sprint.py.
"""
import collections
import concurrent.futures as cf
import json
import urllib.error

import collect
import curate
import rurality
import sprint_duels as sd
import text
from build import read_jsonl
from sprint import DECKS
from text import HERE, WORK


def views(loc):
    """(heading, zoom) in the order tried."""
    h = loc['heading'] or 0
    return [(h, loc.get('zoom') or 0), (h, 1), (h, 2)] + [((h + turn) % 360, 1) for turn in (90, 180, 270)]


def check(meta, loc, country, cache):
    """(verdict, the view that passed, the author's frame, new cache entries); verdict None when a fetch or call failed
    (the next run retries)."""
    clue = f"{meta['metaName'].strip()}. {text.plain(meta['note'])}"
    first, new = None, {}

    def passes(model, image):
        fp = curate.fingerprint(model, sd.CONFIRM, image.name, clue)
        if fp not in cache and fp not in new:
            new[fp] = curate.ask(sd.CONFIRM.format(country=country, clue=clue), sd.CONFIRM_SCHEMA, [image], model)
        answer = cache.get(fp) or new[fp]
        return answer['visible'] == 'yes' and answer['confidence'] >= sd.MIN_CONFIDENCE
    try:
        for heading, zoom in views(loc):
            image = collect.thumb({**loc, 'heading': heading}, collect.zoom_to_fov(zoom))
            if not image:
                return 'dead', None, None, new
            first = first or image
            if all(passes(model, image) for model in (sd.FIND_MODEL, sd.CONFIRM_MODEL)):  # confirmed only after a find
                return 'yes', {'heading': heading, 'pitch': loc['pitch'] or 0, 'zoom': zoom}, first, new
        return 'no', None, first, new
    except urllib.error.HTTPError as e:  # the thumbnail service rejects removed panoramas
        return ('dead' if e.code in (400, 404) else None), None, first, new
    except Exception as e:
        print('failed', loc['panoId'], e, flush=True)
        return None, None, first, new


def main():
    country_at = collect.bc.geolocator(json.loads((WORK / 'worldwide/countries-50m.geojson').read_text()))
    metas = {(m['mapId'], m['metaId']): m for m in json.loads((HERE / 'lm/matches.json').read_text()) if m['mapId'] in DECKS}
    jobs = [(metas[e['mapId'], e['metaId']], loc) for e in read_jsonl(HERE / 'lm/exports.jsonl')
            if (e['mapId'], e['metaId']) in metas for loc in e['locations'] if loc.get('panoId')]
    cache = collect.JsonCache(HERE / 'sprint/deck-verdicts.json')
    print(f'checking {len(jobs)} deck locations: {sd.FIND_MODEL}, then {sd.CONFIRM_MODEL}', flush=True)
    found, passed, frames = {}, {}, []
    with cf.ThreadPoolExecutor(curate.WORKERS) as pool:
        futures = {pool.submit(check, meta, loc, country_at(loc['lat'], loc['lng']) or 'an unknown country', cache.data): loc
                   for meta, loc in jobs}
        for future in cf.as_completed(futures):
            loc = futures[future]
            verdict, view, image, new = future.result()
            cache.data.update(new)
            cache.save()
            if verdict:
                found[loc['panoId']] = verdict
            if view:
                passed[loc['panoId']] = view
            if image:
                frames.append((loc['panoId'], image))
    rurality.label(frames)
    path = HERE / 'win/location-verdicts.json'
    verdicts = json.loads(path.read_text()) if path.exists() else {}
    path.write_text(json.dumps(verdicts | found, ensure_ascii=False, indent=1))
    (HERE / 'sprint/deck-views.json').write_text(json.dumps(dict(sorted(passed.items())), indent=1))
    author = {loc['panoId']: views(loc)[0] for _, loc in jobs}
    print(json.dumps({'locations': len(jobs), 'retryLater': len(jobs) - len(found),
                      **collections.Counter(found.values()),
                      'passedAtAuthorView': sum((v['heading'], v['zoom']) == author[p] for p, v in passed.items()),
                      'replaced': {p: verdicts[p] for p in found if verdicts.get(p, found[p]) != found[p]}}))


if __name__ == '__main__':
    main()
