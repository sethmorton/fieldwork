#!/usr/bin/env python3
"""Opt-in regional Vali refill, one local generator at a time, without model calls.

WORLD_PACK_DATA=... uv run --with pillow --with shapely tools/world-pack/training_refill.py
"""
import argparse
import fcntl
import json
import time
from pathlib import Path

import gapfill
from globe_geometry import inside
from rurality import settings_by_pano
from text import HERE
from training import ROOT, attempts, excluded, load
from training_images import check, rebuild, states
from training_pano import official_id
from training_regions import catalogue

OUT = HERE / 'training'
LARGE = {'US', 'BR', 'RU', 'AU', 'CA', 'IN', 'MX', 'ID'}


def run(args):
    names, regions, by_sub, _, _, _ = catalogue()
    weights = load(HERE / 'acow/weights.json')['countries']
    top = set(sorted(weights, key=lambda cc: -weights[cc])[:40])
    target = {r: args.large_min if info['iso2'] in LARGE else args.minimum
              for r, info in regions.items() if info['iso2'] in top}
    reserved = excluded(attempts(), load(ROOT / '.fieldwork.local.json', {}))
    images = states()
    events, unsupported = [], {}
    report = rebuild()
    for iteration in range(args.passes):
        pack = load(OUT / 'pack.json')
        areas = {f['properties']['name']: f['geometry']['coordinates'] for f in pack['regionFeatures']}
        shortages = [r for r in target if report['top40PlayablePerRegion'].get(r, 0) < target[r]]
        shortages.sort(key=lambda r: (-weights[regions[r]['iso2']] *
            (target[r] - report['top40PlayablePerRegion'].get(r, 0)), r))
        if not shortages:
            break
        for region in shortages:
            cc = regions[region]['iso2']
            subs = sorted(code for code, assigned in by_sub.items() if assigned == region)
            if subs:
                folder = Path(gapfill.ENV['VALI_DOWNLOAD_FOLDER']) / 'Vali' / cc
                available = {p.stem.split('+', 1)[1] for p in folder.glob('*.bin') if '+' in p.stem}
                subs = [s for s in subs if s in available]
                if not subs:
                    unsupported[region] = 'No Vali source files for this macro-region'
                    continue
            else:
                subs = None
            current = report['top40PlayablePerRegion'].get(region, 0)
            needed = target[region] - current
            if needed <= 0:
                continue
            goal = min(args.max_new, max(80, 4 * needed))
            known = settings_by_pano()

            def accept(loc):
                pano = official_id(loc.get('panoId'))
                if not pano or pano in reserved or known.get(pano) in ('urban', 'suburban'):
                    return False
                if not inside(loc['lng'], loc['lat'], areas[region]):
                    return False
                return check({**loc, 'panoId': pano, 'pitch': 0, 'fov': 90}, images)['ok'] is True

            before = len(gapfill.vali_pool(cc, 1))
            try:
                pool = gapfill.vali_pool(cc, goal, append=True, subdivisions=subs, rural=True,
                    min_distance=300 if iteration == 0 else 150, accept=accept)
                event = {'region': region, 'before': before, 'after': len(pool), 'added': len(pool) - before,
                         'ruralFilter': 'Buildings200 eq 0 and Roads200 eq 1', 'subdivisions': subs,
                         'targetPlayable': target[region], 'at': time.time()}
            except Exception as e:
                event = {'region': region, 'error': str(e)[-2000:], 'at': time.time()}
            events.append(event)
            print(json.dumps(event, ensure_ascii=False), flush=True)
            report = rebuild()
            result = {'events': events, 'unsupported': unsupported, 'targets': target,
                      'playablePerRegion': report['top40PlayablePerRegion'],
                      'shortages': {r: target[r] - report['top40PlayablePerRegion'].get(r, 0)
                                    for r in target if report['top40PlayablePerRegion'].get(r, 0) < target[r]}}
            (OUT / 'refill-report.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    report = rebuild()
    result = {'events': events, 'unsupported': unsupported, 'targets': target,
              'contentRevision': report['contentRevision'],
              'playablePerRegion': report['top40PlayablePerRegion'],
              'shortages': {r: target[r] - report['top40PlayablePerRegion'].get(r, 0)
                            for r in target if report['top40PlayablePerRegion'].get(r, 0) < target[r]}}
    (OUT / 'refill-report.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps({'contentRevision': report['contentRevision'], 'minimum': report['playableRegionMin'],
                      'median': report['playableRegionMedian'], 'unsupported': unsupported}), flush=True)


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--minimum', type=int, default=40)
    ap.add_argument('--large-min', type=int, default=80)
    ap.add_argument('--max-new', type=int, default=400)
    ap.add_argument('--passes', type=int, choices=[1, 2], default=2)
    args = ap.parse_args()
    if args.minimum < 1 or args.large_min < 1 or not 1 <= args.max_new <= 1000:
        ap.error('Supply minima must be positive, max-new 1..1000')
    OUT.mkdir(parents=True, exist_ok=True)
    with (OUT / 'refill.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        run(args)
