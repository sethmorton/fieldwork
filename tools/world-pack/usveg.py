#!/usr/bin/env python3
"""US Vegetation pack (`us-vegetation`, sprint scheduler) from the Tree Atlas: `npm run usveg` -> local/usveg-pack.json.

  - one skill per ecoregion (data.json ecoregions): title = region name, practiceFamily per Level I, cost = points Seth
    lost in US duel rounds there (ecoregions[code].rounds), `recent` = a round lost there in the latest session
  - one location per `drive: true` pano, its coach giveaways (feature id, text, box) and region/state; within a region
    the order round-robins states, then seasons, so the scheduler's unseen-first pick rotates them
  - regionFeatures: simplified polygons (properties.name = code) for auto-grading; every location is checked to land in
    its own region with src/geo.mjs's even-odd, first-match rule, else that region is re-simplified finer, else dropped
  - vegMap: Albers USA (d3.geoAlbersUsa constants, Alaska/Hawaii insets) SVG path per region, and per species the
    regions where it is a key tree or >= 3% of biomass (coach.js rangeOf), for the card's small maps
Images are not copied: scripts/serve.mjs serves trees/img read-only under /usveg-img/ (config `usvegImages`).
Env: TREES (default ~/Desktop/code/fieldwork-site/trees), WORLD_PACK_DATA (duels/rounds.json; optional).
Self-check: python3 tools/world-pack/usveg.py check
"""
import datetime as dt
import json
import math
import os
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
TREES = Path(os.environ.get('TREES', Path.home() / 'Desktop/code/fieldwork-site/trees'))
WORLD = Path(os.environ.get('WORLD_PACK_DATA', '/Users/sethmorton/Documents/Codex/2026-10-18/can-x20/work/world-map'))
OUT = REPO / 'local/usveg-pack.json'
IMAGE_BASE = 'http://127.0.0.1:8787/usveg-img/'
# The competitive map Seth's US duel rounds come from; provenance only, never a writable binding.
SOURCE_MAP = 'https://www.geoguessr.com/maps/66fda352ee1c8ee4735e1aa8'
GRADE_TOL, MAP_TOL = 0.02, 1.2  # degrees (~2 km) for grading; SVG px (960-wide map) for drawing
RECENT_HOURS = 24
SEASONS = ('leaf-on', 'green', 'leaf-off', 'dormant')


# ---- geometry (stdlib only)
def in_ring(x, y, ring):
    inside, j = False, len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][:2]
        xj, yj = ring[j][:2]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def polys(geometry):
    return [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates']


def in_geometry(lng, lat, geometry):
    """src/geo.mjs inGeometry: inside an outer ring and outside its holes."""
    return any(rings and in_ring(lng, lat, rings[0]) and not any(in_ring(lng, lat, h) for h in rings[1:])
               for rings in polys(geometry))


def region_at(lat, lng, features):
    return next((f['properties']['name'] for f in features if in_geometry(lng, lat, f['geometry'])), None)


def dp(points, tol):
    """Douglas-Peucker on an open polyline; keeps both ends."""
    if len(points) < 3:
        return list(points)
    keep, stack = {0, len(points) - 1}, [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = points[a][:2], points[b][:2]
        dx, dy, best, at = bx - ax, by - ay, -1.0, None
        norm = math.hypot(dx, dy)
        for i in range(a + 1, b):
            px, py = points[i][:2]
            d = abs(dy * (px - ax) - dx * (py - ay)) / norm if norm else math.hypot(px - ax, py - ay)
            if d > best:
                best, at = d, i
        if at is not None and best > tol:
            keep.add(at)
            stack += [(a, at), (at, b)]
    return [points[i] for i in sorted(keep)]


def simplify(geometry, tol, digits=4):
    out = []
    for rings in polys(geometry):
        kept = []
        for ring in rings:
            r = dp(ring[:-1], tol)
            if len(r) >= 3:
                kept.append([[round(x, digits), round(y, digits)] for x, y, *_ in r + [r[0]]])
        if kept and len(kept[0]) >= 4:
            out.append(kept)
    return {'type': 'MultiPolygon', 'coordinates': out}


# d3.geoAlbersUsa: lower 48 conic equal-area (29.5/45.5, rotate 96, center -0.6/38.7) at scale 1070 and [480, 250];
# Alaska (55/65, rotate 154, center -2/58.5) at 0.35 scale shifted by [-0.307, 0.201] * 1070; Hawaii (8/18, rotate 157,
# center -3/19.9) shifted by [-0.205, 0.212] * 1070. The card projects the guess pin with the same numbers (vegcard.mjs).
K = 1070
INSETS = {'lower48': (29.5, 45.5, 96, -0.6, 38.7, K, 480, 250),
          'alaska': (55, 65, 154, -2, 58.5, 0.35 * K, 480 - 0.307 * K, 250 + 0.201 * K),
          'hawaii': (8, 18, 157, -3, 19.9, K, 480 - 0.205 * K, 250 + 0.212 * K)}


def inset_of(lng, lat):
    return 'alaska' if lat > 50 and (lng < -129 or lng > 170) else 'hawaii' if lat < 24 and lng < -150 else 'lower48'


def project(lng, lat, inset):
    p0, p1, rot, clng, clat, k, tx, ty = INSETS[inset]
    s0 = math.sin(math.radians(p0))
    n = (s0 + math.sin(math.radians(p1))) / 2
    c = 1 + s0 * (2 * n - s0)
    r0 = math.sqrt(c) / n

    def raw(lam, phi):
        r = math.sqrt(c - 2 * n * math.sin(phi)) / n
        return r * math.sin(lam * n), r0 - r * math.cos(lam * n)
    cx, cy = raw(math.radians(clng), math.radians(clat))
    lam = (lng + rot + 180) % 360 - 180
    px, py = raw(math.radians(lam), math.radians(lat))
    return tx + k * (px - cx), ty - k * (py - cy)


def svg_path(geometry):
    first = polys(geometry)[0][0][0]
    inset = inset_of(*first[:2])
    parts = []
    for rings in polys(geometry):
        for ring in rings:
            pts = dp([project(x, y, inset) for x, y, *_ in ring[:-1]], MAP_TOL)
            if len(pts) >= 3:
                parts.append('M' + 'L'.join(f'{x:.0f} {y:.0f}' for x, y in pts) + 'Z')
    return ''.join(parts)


# ---- pack
def ordered(panos):
    """Round-robin over states, and within a state over seasons, so unseen-first selection rotates both."""
    by_state = {}
    for p in panos:
        by_state.setdefault(p.get('state') or '', []).append(p)
    queues = []
    for group in by_state.values():
        seasons = {}
        for p in group:
            seasons.setdefault(p.get('season') or '', []).append(p)
        lists = [seasons[s] for s in sorted(seasons, key=lambda s: SEASONS.index(s) if s in SEASONS else 9)]
        queues.append([lst[i] for i in range(max(map(len, lists))) for lst in lists if i < len(lst)])
    return [q[i] for i in range(max(map(len, queues), default=0)) for q in queues if i < len(q)]


def recent_regions(features):
    """Codes where Seth lost a US duel round in the latest session (RECENT_HOURS up to his newest round)."""
    path = WORLD / 'duels/rounds.json'
    if not path.exists():
        return set()
    rounds = json.loads(path.read_text())
    newest = max(dt.datetime.fromisoformat(r['endTime']) for r in rounds if r.get('endTime'))
    cut = newest - dt.timedelta(hours=RECENT_HOURS)
    return {region_at(r['view']['lat'], r['view']['lng'], features) for r in rounds
            if r.get('countryCode') == 'US' and r.get('endTime') and dt.datetime.fromisoformat(r['endTime']) >= cut
            and (r.get('myScore') or 0) < (r.get('theirScore') or 0)} - {None}


def range_of(eco, species):
    return [c for c, r in eco.items() if species in (r.get('key') or {}).get('trees', [])
            or any(t.get('species') == species and t.get('share', 0) >= 0.03 for t in (r.get('abundance') or {}).get('topSpecies', []))]


def build(data, geo):
    eco, species, aliases = data['ecoregions'], data['species'], data.get('aliases', {})
    sp = lambda sid: species.get(aliases.get(sid, sid))
    ref = lambda sid: next((i['file'].removeprefix('img/') for i in (sp(sid) or {}).get('images', []) if i.get('kind') == 'whole'),
                           None)
    shapes = {f['properties']['code']: f['geometry'] for f in geo['features'] if f['properties']['code'] in eco}
    codes = [c for c in eco if c in shapes]
    raw = [{'type': 'Feature', 'properties': {'name': c}, 'geometry': shapes[c]} for c in codes]
    recent = recent_regions(raw)
    features = {c: {'type': 'Feature', 'properties': {'name': c}, 'geometry': simplify(shapes[c], GRADE_TOL)} for c in codes}

    skills, locations, dropped = [], [], []
    for code in codes:
        r = eco[code]
        feats = [{k: f[k] for k in ('id', 'name', 'kind', 'species') if f.get(k)} | ({'ref': ref(f['species'])} if f.get('species') and ref(f['species']) else {})
                 for f in r.get('features', [])]
        key = r.get('key') or {}
        skills.append({'id': f'usveg:{code}', 'title': r['name'], 'phase': 'Vegetation', 'practiceFamily': f"usveg:{r.get('l1', '')}",
                       'prerequisites': [], 'availability': 'available', 'subject': 'vegetation', 'region': code, 'l1': r.get('l1'),
                       'why': key.get('vibe') or r.get('group') or '', 'cost': (r.get('rounds') or {}).get('ptsLost', 0),
                       **({'recent': True} if code in recent else {}), 'features': feats,
                       'trees': [{'species': s, 'name': (sp(s) or {}).get('common', s.replace('-', ' ')), **({'ref': ref(s)} if ref(s) else {})}
                                 for s in key.get('trees', [])]})
        for p in ordered([p for p in r.get('panos', []) if p.get('drive')]):
            loc = {'id': f"usveg:{p['panoId']}", 'panoId': p['panoId'], 'lat': p['lat'], 'lng': p['lng'], 'heading': p.get('heading', 0),
                   'pitch': p.get('pitch', 0), 'zoom': p.get('zoom', 0), 'skillIds': [f'usveg:{code}'], 'region': code,
                   'state': p.get('state'), 'img': p['img'].removeprefix('img/'), 'season': p.get('season'), 'date': p.get('date'),
                   'verdict': (p.get('coach') or {}).get('verdict') or p.get('caption', ''),
                   'giveaways': [{'feature': g.get('feature'), 'text': g['text'], 'box': g['box']} for g in (p.get('coach') or {}).get('giveaways', [])]}
            locations.append(loc)

    # Grading consistency: a guess on the pano itself must grade as its own region. A miss refines that region and the
    # neighbour that claimed the point (finer, then raw); a pano outside its own raw polygon is mislabelled and dropped.
    order = [features[c] for c in codes]
    for tol in (0.002, 0):
        bad = {c for loc in locations if (hit := region_at(loc['lat'], loc['lng'], order)) != loc['region'] for c in (loc['region'], hit) if c}
        for c in bad:
            features[c]['geometry'] = simplify(shapes[c], tol, 6) if tol else shapes[c]
        order = [features[c] for c in codes]
    kept = []
    for loc in locations:
        (kept if region_at(loc['lat'], loc['lng'], order) == loc['region'] else dropped).append(loc)
    seen = set()
    kept = [loc for loc in kept if not (loc['panoId'] in seen or seen.add(loc['panoId']))]

    used = {f['species'] for s in skills for f in s['features'] if f.get('species')} | {t['species'] for s in skills for t in s['trees']}
    paths = {c: svg_path(shapes[c]) for c in codes}
    xs = [float(v) for d in paths.values() for seg in d.replace('M', 'L').replace('Z', '').split('L') if seg for v in seg.split()[0::2]]
    ys = [float(v) for d in paths.values() for seg in d.replace('M', 'L').replace('Z', '').split('L') if seg for v in seg.split()[1::2]]
    view = [math.floor(min(xs)) - 4, math.floor(min(ys)) - 4, math.ceil(max(xs) - min(xs)) + 8, math.ceil(max(ys) - min(ys)) + 8]
    pack = {'id': 'us-vegetation', 'title': 'US Vegetation', 'subject': 'GeoGuessr', 'schemaVersion': 1,
            'contentRevision': int(time.time()), 'scheduler': 'sprint', 'gradingPolicy': 'recognition', 'card': 'veg',
            'initialSkillIds': [], 'imageBase': IMAGE_BASE,
            'answerAreaLabel': f"{len({loc['region'] for loc in kept})} US ecoregions, {len(kept)} panoramas, graded by the ecoregion you pin",
            'coverageSummary': f"Tree Atlas drive panoramas with coach giveaways (fieldwork-site/trees, {data.get('generated', '')}); EPA Level III ecoregions.",
            'skills': skills, 'locations': kept,
            'pools': [{'id': 'us-vegetation', 'title': 'US ecoregions', 'skillIds': [s['id'] for s in skills], 'mapUrl': SOURCE_MAP}],
            'regionFeatures': order,
            'vegMap': {'viewBox': view, 'regions': paths,
                       'species': {s: range_of(eco, s) for s in sorted(used)}}}
    return pack, dropped


def check():
    sq = {'type': 'Polygon', 'coordinates': [[[0, 0], [10, 0], [10, 10], [5, 10.001], [0, 10], [0, 0]]]}
    s = simplify(sq, 0.01)
    assert len(s['coordinates'][0][0]) == 5, s
    assert in_geometry(5, 5, s) and not in_geometry(11, 5, s)
    x, y = project(-96.6, 38.7, 'lower48')
    assert abs(x - 480) < 1e-6 and abs(y - 250) < 1e-6, (x, y)  # the center lands on the translate
    assert inset_of(-150, 61) == 'alaska' and inset_of(-157, 21) == 'hawaii' and inset_of(-100, 40) == 'lower48'
    assert [p['state'] for p in ordered([{'state': 'A', 'season': 'leaf-on'}, {'state': 'A', 'season': 'leaf-on'},
                                         {'state': 'A', 'season': 'leaf-off'}, {'state': 'B', 'season': 'green'}])] == ['A', 'B', 'A', 'A']
    print('ok')


def main():
    if sys.argv[1:] == ['check']:
        return check()
    data = json.loads((TREES / 'data.json').read_text())
    geo = json.loads((TREES / 'ecoregions.json').read_text())
    pack, dropped = build(data, geo)
    for loc in dropped:
        print(f"dropped {loc['img']}: not inside {loc['region']} ({loc['lat']}, {loc['lng']})", file=sys.stderr)
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(pack, separators=(',', ':')))
    print(f"{OUT.relative_to(REPO)}: {len(pack['skills'])} regions, {len(pack['locations'])} panoramas, "
          f"{len({loc['region'] for loc in pack['locations']})} regions playable, {OUT.stat().st_size // 1024} KB")


if __name__ == '__main__':
    main()
