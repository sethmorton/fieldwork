"""Bounded diagnostic seeding of separate study boards or unplayed game spots."""
import hashlib
import json
from collections import Counter, defaultdict
from itertools import chain

from globe_geometry import inside

from text import HERE
from training_pano import official_id
from training_regions import assignment
from training_seen import seen_spots


def batch_limit(found, available, target=4):
    return min(available, target + 2 - found) if found < target else 0


def feedback_priority(tries):
    regions, metas = Counter(), Counter()
    for attempt in tries:
        missed = [m['metaId'] for m in attempt.get('metas', []) if m.get('used') is False and m.get('metaId')]
        metas.update(missed)
        if attempt.get('regionCorrect') is False or missed:
            regions.update(r for r in (attempt.get('region'), attempt.get('guessedRegion')) if r)
    return regions, metas


def due_feedback():
    path = HERE / 'training/attempts.json'
    doc = json.loads(path.read_text()) if path.exists() else []
    return feedback_priority(doc.get('attempts', []) if isinstance(doc, dict) else doc)


def source_jobs(args, names, regions, by_sub, admin1, metas, latest, known):
    weights = json.loads((HERE / 'acow/weights.json').read_text())['countries']
    top = set(sorted(weights, key=lambda cc: -weights[cc])[:20])
    playable = getattr(args, 'command', 'seed') == 'playable'
    target_count = 3 if playable else 4
    due_regions, due_metas = due_feedback() if playable else ({}, {})
    areas = json.loads((HERE / 'training/region-features.json').read_text())['features']
    area_by_name = {f['properties']['name']: f['geometry']['coordinates'] for f in areas}
    groups, pool_groups, used = defaultdict(list), defaultdict(list), set()
    from training import ROOT, attempts, excluded, load
    reserved = excluded(attempts(), load(ROOT / '.fieldwork.local.json', {}))
    from training_images import states, view_key
    images = states()

    def add(spot, target):
        pano, cc = official_id(spot.get('panoId')), spot['countryCode']
        if not pano or pano in used or cc not in top or spot['region'] not in regions:
            return
        if playable and not inside(spot['lng'], spot['lat'], area_by_name[spot['region']]):
            return
        if spot['kind'] == 'pool' and pano in reserved:
            return
        if images.get(view_key(spot), {}).get('ok') is False:
            return
        record = latest.get(pano, {})
        setting = record.get('setting') or known.get(pano)
        if (record.get('indoor') or record.get('urbanFlag') or setting in ('urban', 'suburban')
                or known.get(pano) in ('urban', 'suburban')):
            return
        used.add(pano)
        target[spot['region']].append({**spot, 'panoId': pano})

    # Authored seen examples are richer than a random roadside frame, and already
    # permitted on cards. Fresh study candidates remain in their immutable hash split.
    if not playable:
        for spot in seen_spots(names, regions, by_sub, admin1, areas):
            add(spot, groups)
    for cc in sorted(top, key=lambda c: -weights[c]):
        path = HERE / 'gap/pools' / f'{cc}-locations.json'
        if not path.exists():
            continue
        doc = json.loads(path.read_text())
        for loc in doc.get('customCoordinates', []) if isinstance(doc, dict) else doc:
            pano = official_id(loc.get('panoId'))
            if not pano or (int(hashlib.sha256(pano.encode()).hexdigest()[:8], 16) % 10 < 7) != playable:
                continue
            region, sub = assignment(cc, loc.get('extra', {}).get('tags', []), names, by_sub)
            if region:
                add({**loc, 'panoId': pano, 'countryCode': cc, 'country': names[cc], 'region': region,
                     'admin1': sub, 'kind': 'pool'}, pool_groups)
    order = sorted((r for r, info in regions.items() if info['iso2'] in top), key=lambda r: (
        -due_regions.get(r, 0), regions[r]['iso2'] != 'US', -weights[regions[r]['iso2']], r))
    for region in pool_groups:
        pool_groups[region].sort(key=lambda s: hashlib.sha256(s['panoId'].encode()).hexdigest())
    pool_count = 0
    while pool_groups and pool_count < args.pool_limit:
        for region in order:
            if region not in pool_groups:
                continue
            groups[region].append(pool_groups[region].pop())
            pool_count += 1
            if not pool_groups[region]:
                del pool_groups[region]
            if pool_count == args.pool_limit:
                break
    counts, counted = {}, {}
    for region in order:
        candidates = groups[region]
        counted[region] = {s['panoId'] for s in chain(candidates, pool_groups.get(region, []))
            if (r := latest.get(s['panoId'], {})).get('metas') and r.get('qualityVersion') == 2
            and r.get('verified') and r.get('setting') == 'rural' and not r.get('indoor')
            and r.get('view', {}).get('region') == region
            and any(not m['metaId'] or m['metaId'] in metas for m in r['metas'])
            and images.get(view_key(r['view']), {}).get('ok') is not False}
        counts[region] = len(counted[region])

        def priority(spot):
            record = latest.get(spot['panoId'], {})
            hinted = any(i in metas and metas[i]['subdivisions'] is not None for i in spot.get('hintMetaIds', []))
            return (not hinted, (record.get('setting') or known.get(spot['panoId'])) != 'rural',
                    spot['kind'] != 'seen', hashlib.sha256(spot['panoId'].encode()).hexdigest())
        if playable:
            for spot in candidates:
                spot['hintMetaIds'] = [i for i in due_metas if i in metas and
                                      spot['country'] in metas[i]['countries']]
        candidates.sort(key=priority)
    jobs = []
    indices = {r: 0 for r in order}
    while True:
        added = False
        for region in order:
            i = indices[region]
            if counts[region] >= target_count or i >= len(groups[region]):
                continue
            jobs.append(groups[region][i])
            indices[region] += 1
            added = True
        if not added:
            break
    return jobs, counts, {r: len(groups[r]) for r in order}, counted
