#!/usr/bin/env python3
"""Exported DECKS locations (sprint.py) for the pack. Learnable Meta authors place each location on purpose, so there is
no visibility check: a location counts unless its panorama is gone. Fetches the author's view (collect.thumb), writes
'trusted: author-placed' or 'dead' per panorama into win/location-verdicts.json, replacing an earlier verdict on the
same panorama, and labels the frame rural, suburban or urban (rurality.py, by panorama id), so sprint.py takes rural
ones first.
Usage: WORLD_PACK_DATA=<caches> WORLD_PACK_INPUTS=<inputs> python3 tools/world-pack/sprint_decks.py, then rebuild sprint.py.
"""
import collections
import concurrent.futures as cf
import json
import urllib.error

import collect
import curate
import rurality
from build import read_jsonl
from sprint import DECKS, TRUSTED
from text import HERE


def frame(loc):
    """(verdict, the author's frame); verdict None when the fetch failed (the next run retries)."""
    try:
        image = collect.thumb(loc, collect.zoom_to_fov(loc.get('zoom') or 0))
    except urllib.error.HTTPError as e:  # the thumbnail service rejects removed panoramas
        return ('dead' if e.code in (400, 404) else None), None
    except Exception as e:
        print('failed', loc['panoId'], e, flush=True)
        return None, None
    return (TRUSTED, image) if image else ('dead', None)


def main():
    metas = {(m['mapId'], m['metaId']) for m in json.loads((HERE / 'lm/matches.json').read_text()) if m['mapId'] in DECKS}
    locs = [loc for e in read_jsonl(HERE / 'lm/exports.jsonl') if (e['mapId'], e['metaId']) in metas
            for loc in e['locations'] if loc.get('panoId')]
    with cf.ThreadPoolExecutor(curate.WORKERS) as pool:
        results = dict(zip((loc['panoId'] for loc in locs), pool.map(frame, locs)))
    found = {pano: verdict for pano, (verdict, _) in results.items() if verdict}
    rurality.label([(pano, image) for pano, (_, image) in results.items() if image])
    path = HERE / 'win/location-verdicts.json'
    verdicts = json.loads(path.read_text()) if path.exists() else {}
    path.write_text(json.dumps(verdicts | found, ensure_ascii=False, indent=1))
    print(json.dumps({'locations': len(locs), 'retryLater': len(locs) - len(found), **collections.Counter(found.values())}))


if __name__ == '__main__':
    main()
