#!/usr/bin/env python3
"""Cheap, cached rural-only classification for unplayed game candidates. No meta-model calls.

WORLD_PACK_DATA=... CURATE_MODEL=gpt-6-luna uv run --with pillow --with shapely tools/world-pack/training_rural.py
"""
import argparse
import collections
import concurrent.futures as cf
import fcntl
import json
import time

import curate
import rurality
from text import HERE
from training_images import check, rebuild, states, view_key

OUT = HERE / 'training'
LARGE = {'US', 'BR', 'RU', 'AU', 'CA', 'IN', 'MX', 'ID'}


def run(args):
    curate.MODEL, curate.WORKERS = 'gpt-6-luna', args.workers
    pack = json.loads((OUT / 'pack.json').read_text())
    weights = json.loads((HERE / 'acow/weights.json').read_text())['countries']
    top = set(sorted(weights, key=lambda cc: -weights[cc])[:40])
    pools = collections.defaultdict(list)
    targets = {}
    for loc in pack['locations']:
        info = pack['regions'][loc['region']]
        cc = info['iso2']
        if cc in top and loc['split'] in ('drill', 'probe') and loc.get('thumbOk') is not False:
            pools[loc['region']].append(loc)
            targets[loc['region']] = 80 if cc in LARGE else 40
    # A stable shuffle prevents taking adjacent pano IDs or the same part of a region first.
    for region in pools:
        pools[region].sort(key=lambda l: view_key(l))
    images = states()
    attempted, submitted, model_images, rounds = set(), 0, 0, 0
    started = time.time()
    while submitted < args.limit:
        known = rurality.settings_by_pano()
        rural_counts = {r: sum(l.get('rural') is True or known.get(l['panoId']) == 'rural' for l in locs)
                        for r, locs in pools.items()}
        candidates = {r: [l for l in locs if l['panoId'] not in known and l.get('rural') is None
                         and view_key(l) not in attempted] for r, locs in pools.items()}
        deficits = {r: max(0, targets[r] - rural_counts[r]) for r in pools}
        estimated = dict(deficits)
        batch = []
        while len(batch) < min(96, args.limit - submitted):
            eligible = [r for r in pools if candidates[r] and estimated[r] > 0]
            if not eligible:
                break
            region = max(eligible, key=lambda r: (weights[pack['regions'][r]['iso2']] * estimated[r], r))
            loc = candidates[region].pop()
            attempted.add(view_key(loc))
            batch.append(loc)
            estimated[region] -= .7  # Planning only. The next chunk uses actual cached rural verdicts.
        # ponytail: a chunk can overshoot its rural target by at most 96 views, avoiding per-view rebuilds.
        if not batch:
            break
        with cf.ThreadPoolExecutor(args.workers) as pool:
            verdicts = list(pool.map(lambda loc: check(loc, images), batch))
        items = []
        with (OUT / 'rurality-candidates.jsonl').open('a') as f:
            fcntl.flock(f, fcntl.LOCK_EX)
            for loc, verdict in zip(batch, verdicts):
                if verdict['ok'] is not True:
                    continue
                import collect
                path = collect.thumb(loc, 90)
                if path is None:
                    continue
                key = 'training-rural:' + view_key(loc)
                view = {k: loc[k] for k in ('panoId', 'heading', 'pitch', 'fov') if k in loc}
                f.write(json.dumps({'id': key, 'view': view}) + '\n')
                items.append((key, path))
        # The existing rurality pipeline supplies the one cheap setting-only pass.
        rurality.label(items)
        submitted += len(batch)
        model_images += len(items)
        rounds += 1
        known = rurality.settings_by_pano()
        rural_counts = {r: sum(known.get(l['panoId']) == 'rural' or
                              (l.get('rural') is True and l['panoId'] not in known) for l in locs)
                        for r, locs in pools.items()}
        report = {'attemptedViews': submitted, 'modelImages': model_images, 'cap': args.limit,
                  'model': curate.MODEL, 'workers': args.workers, 'elapsedSeconds': round(time.time() - started),
                  'verifiedRuralPerRegion': rural_counts, 'at': time.time()}
        (OUT / 'rural-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
        print(json.dumps({k: v for k, v in report.items() if k != 'verifiedRuralPerRegion'}), flush=True)
        if rounds % 4 == 0:
            rebuild()
    rebuild()


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--limit', type=int, default=8000)
    ap.add_argument('--workers', type=int, choices=[1, 2], default=2)
    args = ap.parse_args()
    if not 1 <= args.limit <= 8000:
        ap.error('Rural classification cap must be 1..8000 views')
    OUT.mkdir(parents=True, exist_ok=True)
    with (OUT / 'rural.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        run(args)
