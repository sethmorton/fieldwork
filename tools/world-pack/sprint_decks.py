#!/usr/bin/env python3
"""Vision check of the exported DECKS locations (sprint.py): does the view a card opens on (its heading and pitch, zoom
0) clearly show its meta's clue? sprint_duels.py's two strong models must both answer its CONFIRM question yes: FIND_MODEL
first, then CONFIRM_MODEL; answers cached by fingerprint in sprint/deck-verdicts.json. Writes yes, no or dead per
panorama into win/location-verdicts.json, replacing an earlier verdict on the same panorama (it lists the replaced ones:
check that no pack card lost a location); sprint.py teaches a deck card only on a yes. Each frame is also labelled rural,
suburban or urban (rurality.py, by panorama id), so sprint.py takes rural ones first.
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


def check(meta, loc, country, cache):
    """(verdict, frame, new cache entries); verdict None when a fetch or call failed (the next run retries)."""
    try:
        image = collect.thumb(loc, collect.zoom_to_fov(0))
    except urllib.error.HTTPError as e:
        if e.code not in (400, 404):
            return None, None, {}
        image = None  # the thumbnail service rejects removed panoramas
    except Exception:
        return None, None, {}
    if not image:
        return 'dead', None, {}
    clue = f"{meta['metaName'].strip()}. {text.plain(meta['note'])}"
    new = {}
    try:
        for model in (sd.FIND_MODEL, sd.CONFIRM_MODEL):
            fp = curate.fingerprint(model, sd.CONFIRM, image.name, clue)
            if fp not in cache:
                new[fp] = curate.ask(sd.CONFIRM.format(country=country, clue=clue), sd.CONFIRM_SCHEMA, [image], model)
            answer = cache.get(fp) or new[fp]
            if answer['visible'] != 'yes' or answer['confidence'] < sd.MIN_CONFIDENCE:
                return 'no', image, new
        return 'yes', image, new
    except Exception as e:
        print('failed', loc['panoId'], e, flush=True)
        return None, image, new


def main():
    country_at = collect.bc.geolocator(json.loads((WORK / 'worldwide/countries-50m.geojson').read_text()))
    metas = {(m['mapId'], m['metaId']): m for m in json.loads((HERE / 'lm/matches.json').read_text()) if m['mapId'] in DECKS}
    jobs = [(metas[e['mapId'], e['metaId']], loc) for e in read_jsonl(HERE / 'lm/exports.jsonl')
            if (e['mapId'], e['metaId']) in metas for loc in e['locations'] if loc.get('panoId')]
    cache = collect.JsonCache(HERE / 'sprint/deck-verdicts.json')
    print(f'checking {len(jobs)} deck locations: {sd.FIND_MODEL}, then {sd.CONFIRM_MODEL}', flush=True)
    found, frames = {}, []
    with cf.ThreadPoolExecutor(curate.WORKERS) as pool:
        futures = {pool.submit(check, meta, loc, country_at(loc['lat'], loc['lng']) or 'an unknown country', cache.data): loc
                   for meta, loc in jobs}
        for future in cf.as_completed(futures):
            pano = futures[future]['panoId']
            verdict, image, new = future.result()
            cache.data.update(new)
            cache.save()
            if verdict:
                found[pano] = verdict
            if image:
                frames.append((pano, image))
    rurality.label(frames)
    path = HERE / 'win/location-verdicts.json'
    verdicts = json.loads(path.read_text()) if path.exists() else {}
    path.write_text(json.dumps(verdicts | found, ensure_ascii=False, indent=1))
    print(json.dumps({'locations': len(jobs), 'retryLater': len(jobs) - len(found),
                      **collections.Counter(found.values()),
                      'replaced': {p: verdicts[p] for p in found if verdicts.get(p, found[p]) != found[p]}}))


if __name__ == '__main__':
    main()
