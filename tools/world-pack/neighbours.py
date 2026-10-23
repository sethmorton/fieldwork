#!/usr/bin/env python3
"""More locations for short clues from the panoramas around an accepted one.

Two kinds, from one cached Street View metadata request per seed (near/meta/):
- same-spot: other capture dates within 10 m, with the seed's exact camera. The human aim still points at the
  object, so signs and plates usually stay in frame (poles right beside the camera can drift out).
- neighbour: panoramas 30-120 m along the road, level, looking at the spot ahead of the seed camera. Area-wide clues
  (landscape, vegetation, the Google car, architecture) persist, specific objects usually do not.
review.accepts decides which kinds each may teach; both need a reviewer "yes".

Usage: python3 neighbours.py [LIMIT]   writes near/candidates.jsonl (then: review.py near/candidates.jsonl, build.py)
"""
import concurrent.futures as cf
import json
import math
import sys
import urllib.parse

import collect
from text import HERE

NEAR = HERE / 'near'
PER_SEED = 3
MIN_M, MAX_M = 30, 120
SAME_SPOT_M = 10
TARGET_M = 15  # assumed distance from the seed camera to the object it was aimed at
META = ('https://maps.googleapis.com/maps/api/js/GeoPhotoService.GetMetadata?pb=!1m5!1sapiv3!5sUS!11m2!1m1!1b0!2m2'
        '!1sen!2sUS!3m3!1m2!1e2!2s{}!4m6!1e1!1e2!1e3!1e4!1e8!1e6&callback=x')


def metres(a, b):
    """Equirectangular distance; exact enough under a few hundred metres."""
    k = math.cos(math.radians((a[0] + b[0]) / 2))
    return 6371000 * math.hypot(math.radians(b[0] - a[0]), math.radians(b[1] - a[1]) * k)


def bearing(a, b):
    k = math.cos(math.radians((a[0] + b[0]) / 2))
    return math.degrees(math.atan2(math.radians(b[1] - a[1]) * k, math.radians(b[0] - a[0]))) % 360


def ahead(p, heading, m):
    k = math.cos(math.radians(p[0]))
    return (p[0] + math.degrees(m * math.cos(math.radians(heading)) / 6371000),
            p[1] + math.degrees(m * math.sin(math.radians(heading)) / 6371000 / k))


def linked(pano):
    """Panoramas Street View links around `pano`: [(panoId, lat, lng)]. Cached JSONP, parsed by walking the list."""
    path = NEAR / 'meta' / f'{pano}.json'
    if not path.exists():
        _, body = collect.fetch(META.format(urllib.parse.quote(pano)))
        page = body.decode()
        path.write_text(page[page.index('( ') + 2:page.rindex(')')])
    found = {}

    def walk(x):
        if not isinstance(x, list):
            return
        # A linked panorama is [[2, panoId], _, [[_, _, lat, lng], ...], ...].
        if (len(x) >= 3 and isinstance(x[0], list) and len(x[0]) == 2 and x[0][0] == 2 and isinstance(x[0][1], str)
                and isinstance(x[2], list) and x[2] and isinstance(x[2][0], list) and len(x[2][0]) >= 4
                and isinstance(x[2][0][2], float) and isinstance(x[2][0][3], float)):
            found.setdefault(x[0][1], (x[2][0][2], x[2][0][3]))
        for y in x:
            walk(y)

    walk(json.loads(path.read_text()))
    return [(p, lat, lng) for p, (lat, lng) in found.items() if p != pano]


def candidate(seed, source, pano, lat, lng, heading, pitch, fov, text):
    c = {'source': source, 'topicId': seed['topicId'], 'seedCandidateId': seed['id'],
         'view': {'panoId': pano, 'lat': lat, 'lng': lng, 'heading': round(heading, 2), 'pitch': pitch, 'zoom': 0},
         'fov': fov, 'coordinateCountry': None}
    path = collect.thumb(c['view'], fov)
    c['views'] = [{'heading': c['view']['heading'], 'pitch': pitch, 'fov': fov,
                   'thumb': str(path.relative_to(HERE))}] if path else []
    c['thumbStatus'] = 'ok' if path else 'panorama-unavailable'
    c['id'] = collect.candidate_id(c, text)
    return c


def expand(seed, frame, text):
    view = {**seed['view'], **seed['views'][frame]}
    origin = (view['lat'], view['lng'])
    target = ahead(origin, view['heading'] or 0, TARGET_M)
    around = linked(view['panoId'])
    same = [n for n in around if metres(origin, n[1:]) < SAME_SPOT_M][:PER_SEED]
    picks = []
    for p, lat, lng in sorted(around, key=lambda n: -metres(origin, n[1:])):
        # Spread out: every pick sits in the band and at least MIN_M from the others.
        if MIN_M <= metres(origin, (lat, lng)) <= MAX_M and all(metres((lat, lng), q[1:]) >= MIN_M for q in picks):
            picks.append((p, lat, lng))
        if len(picks) == PER_SEED:
            break
    return ([candidate(seed, 'same-spot', p, lat, lng, view['heading'] or 0, view.get('pitch') or 0, view['fov'], text)
             for p, lat, lng in same] +
            [candidate(seed, 'neighbour', p, lat, lng, bearing((lat, lng), target), 0, 90.0, text)
             for p, lat, lng in picks])


def main(limit=None):
    (NEAR / 'meta').mkdir(parents=True, exist_ok=True)
    clues = {c['topicId']: c for c in json.loads((HERE / 'clues.json').read_text())}
    bank = json.loads((HERE / 'clue-bank.json').read_text())
    out = NEAR / 'candidates.jsonl'
    # Earlier runs are kept: the clues they made playable are no longer short, so they would not be regenerated.
    earlier = {c['id']: c for c in map(json.loads, out.read_text().splitlines())} if out.exists() else {}
    by_id = {**{c['id']: c for p in ('candidates.jsonl', 'gap/candidates.jsonl')
                for c in map(json.loads, (HERE / p).read_text().splitlines())}, **earlier}
    curation = json.loads((HERE / 'labels/curation.json').read_text())
    tier = {f'plonkit:{s}:{r["tipId"]}': r['tier'] for s, v in curation.items() for r in v['order']}
    # Seeds: the chosen locations of short practice clues, foundational first.
    order = ('foundational', 'useful', 'niche')
    short = sorted((b for b in bank if b['practice'] and b['status'] == 'one-location'),
                   key=lambda b: order.index(tier.get(b['topicId'], 'niche')))[:limit]
    seeds = []
    for b in short:
        for loc in b['locations']:
            c = by_id[loc['candidateId']]
            frame = next(i for i, v in enumerate(c['views']) if v['heading'] == loc['heading'])
            seeds.append((c, frame))
    with cf.ThreadPoolExecutor(8) as pool:
        found = [c for cs in pool.map(lambda s: expand(s[0], s[1], clues[s[0]['topicId']]['text']), seeds) for c in cs]
    merged = {**earlier, **{c['id']: c for c in found}}
    with open(out, 'w') as f:
        for c in merged.values():
            f.write(json.dumps(c, ensure_ascii=False) + '\n')
    print(json.dumps({'seedClues': len(short), 'new': len(set(merged) - set(earlier)), 'total': len(merged),
                      'thumbsOk': sum(c['thumbStatus'] == 'ok' for c in found)}))


if __name__ == '__main__':
    main(int(sys.argv[1]) if len(sys.argv) > 1 else None)
