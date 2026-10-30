#!/usr/bin/env python3
"""US Vegetation pack (`us-vegetation`, sprint scheduler) from the Tree Atlas: `npm run usveg` -> local/usveg-pack.json.

  - one skill per ecoregion (data.json ecoregions): title = region name, practiceFamily per Level I, `acow` = the region's
    share of the ACoW proxy pool (POOL: coverage-spread official US points), cost = 1000 x acow plus up to DUEL_BONUS for
    points Seth lost in US duel rounds there (ecoregions[code].rounds), ZERO_COST without pool share (reachable, last);
    `recent` = a round lost there in the latest session. Skills are in cost order, so planSprint fills by share too
  - one location per `drive: true` pano, its coach giveaways (feature id, text, box) and region/state; within a region
    the order round-robins states, then seasons, so the scheduler's unseen-first pick rotates them
  - regionFeatures: simplified polygons (properties.name = code) for auto-grading; every location is checked to land in
    its own region with src/geo.mjs's even-odd, first-match rule, else that region is re-simplified finer, else dropped
  - vegMap: Albers USA (d3.geoAlbersUsa constants, Alaska/Hawaii insets) SVG path per region, and per species the
    regions where it is a key tree or >= 3% of biomass (coach.js rangeOf), for the card's small maps
  - warmup: WARMUP, eight visually distinct regions the sprint scheduler narrows to while the learner is struggling
  - contrasts: {'A|B' (sorted codes): {rule, features: {code: [feature ids]}}}, one conditional rule of at most 16 words
    per pair the learner can confuse (duel confusions, key neighbours, top SIMILAR look-alikes per region), written by
    CONTRAST_MODEL from the two regions' facts only and cached in local/usveg-contrasts.json (rebuilds reuse it)
Images are not copied: scripts/serve.mjs serves trees/img read-only under /usveg-img/ (config `usvegImages`).
Env: TREES (default ~/Desktop/code/fieldwork-site/trees), WORLD_PACK_DATA (duels/rounds.json; optional).
  - tree deck (usveg_trees.py): one skill per roadside tree (subject 'tree', graded by its range), its own locations,
    spot-it bullets, examples and area; also written to TREES/deck.json for the atlas's Tree deck page
Self-check: python3 tools/world-pack/usveg.py check
"""
import datetime as dt
import json
import math
import os
import re
import sys
import time
from collections import Counter
from pathlib import Path

import usveg_trees

REPO = Path(__file__).resolve().parents[2]
TREES = Path(os.environ.get('TREES', Path.home() / 'Desktop/code/fieldwork-site/trees'))
WORLD = Path(os.environ.get('WORLD_PACK_DATA', '/Users/sethmorton/Documents/Codex/2026-10-18/can-x20/work/world-map'))
OUT = REPO / 'local/usveg-pack.json'
IMAGE_BASE = 'http://127.0.0.1:8787/usveg-img/'
# The competitive map Seth's US duel rounds come from; provenance only, never a writable binding.
SOURCE_MAP = 'https://www.geoguessr.com/maps/66fda352ee1c8ee4735e1aa8'
POOL = Path(os.environ.get('USVEG_POOL', WORLD / 'gap/pools/US-locations.json'))
DUEL_BONUS, ZERO_COST = 10, 0.01  # a top region (~5% share) costs ~50: duel losses lift a region, never dominate
GRADE_TOL, MAP_TOL = 0.02, 1.2  # degrees (~2 km) for grading; SVG px (960-wide map) for drawing
# Ranked-like rounds: Seth's ranked ACoW is NoMove; 90 s leaves room to read the vegetation under time pressure.
GAME_SETTINGS = {'forbidMoving': True, 'forbidZooming': False, 'forbidRotating': False, 'timeLimit': 90}
RECENT_HOURS = 24
SEASONS = ('leaf-on', 'green', 'leaf-off', 'dormant')
# Desert, Pacific conifer, Great Plains grass, southern pine, northern hardwoods, Florida subtropics, Rockies, California oak.
WARMUP = ('10.2.1', '7.1.8', '9.3.3', '8.3.5', '5.3.1', '15.4.1', '6.2.10', '11.1.1')
CONTRAST_MODEL, SIMILAR, RULE_WORDS = 'gpt-6-astra', 5, 16
CONTRASTS = REPO / 'local/usveg-contrasts.json'


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


def look(card, most=16):
    """One short line on how a tree looks: the species card's silhouette, its first sentence; a bare one ('A tall deciduous
    tree.') gains the first bark/leaf feature. At most `most` words."""
    first = lambda text: text.split('. ')[0].rstrip('.')
    line = first(card.get('silhouette', ''))
    if len(line.split()) < 7:
        extra = next((f for f in card.get('features', []) if 'bark' in f.lower()), (card.get('features') or [''])[0])
        line = f'{line}. {first(extra)}' if extra else line
    words = line.split()
    return ' '.join(words[:most]) + ('…' if len(words) > most else '')


def range_of(eco, species):
    return [c for c, r in eco.items() if species in (r.get('key') or {}).get('trees', [])
            or any(t.get('species') == species and t.get('share', 0) >= 0.03 for t in (r.get('abundance') or {}).get('topSpecies', []))]


# Headline scoring (vegcard.mjs headline): each region's `mix` of area shares ('ft:' forest-type group x forest share, 'sp:'
# species biomass share, a key tree at least 0.03, 'lc:' NLCD land cover); each feature's `signal`, the mix keys it shows.
CONIFERS = ('spruce', 'fir', 'pine', 'hemlock', 'conifer', 'redwood', 'larch', 'juniper', 'cedar', 'cypress')
LAND = {'crop': ('field', 'crop', 'farm', 'pasture', 'hay', 'corn', 'soybean'), 'grass': ('grass', 'prairie', 'range', 'meadow'),
        'shrub': ('shrub', 'sage', 'scrub', 'chaparral', 'brush', 'desert'), 'wetland': ('marsh', 'wet', 'swamp', 'bog'),
        'developed': ('town', 'urban', 'suburb', 'house'), 'forest': ('forest', 'wood', 'tree')}


def mix(r):
    key, ab = r.get('key') or {}, r.get('abundance') or {}
    f = ab.get('forestShare') or 0
    out = {f"ft:{t['group']}": round(f * t['share'], 4) for t in ab.get('forestTypes', [])}
    out |= {f"sp:{t['species']}": t['share'] for t in ab.get('topSpecies', [])}
    out |= {f'sp:{s}': max(out.get(f'sp:{s}', 0), 0.03) for s in key.get('trees', [])}
    return out | {f'lc:{k}': v for k, v in (ab.get('landCover') or {}).items()}


def signal(feature, groups):
    """Mix keys a feature shows: its species; else forest-type groups sharing a tree word with its name (any conifer
    group for 'conifer'/'evergreen'); else the first land-cover class its name names; else none (scored by presence)."""
    if feature.get('species'):
        return [f"sp:{feature['species']}"]
    words = set(re.findall(r'[a-z]+', feature['name'].lower()))
    conifer = bool(words & {'conifer', 'conifers', 'evergreen', 'evergreens'})
    trees = [g for g in groups if words & set(re.findall(r'[a-z]+', g.lower())) - {'other', 'western', 'mountain', 'mixed', 'california', 'hardwoods', 'exotic', 'tropical'}
             or conifer and any(w in g.lower() for w in CONIFERS)]
    if trees:
        return [f'ft:{g}' for g in sorted(trees)]
    return next(([f'lc:{k}'] for k, stems in LAND.items() if any(w.startswith(s) for w in words for s in stems)), [])


def weighted_cost(acow, loss):
    """1000 x pool share plus DUEL_BONUS x (points lost there / most lost anywhere); ZERO_COST without share."""
    return round(1000 * acow + DUEL_BONUS * loss, 3) if acow > 0 else ZERO_COST


def pool_counts(features):
    """{(code, state): pool points}; state from the point's 'US-XX' tag. Points off every region are left out."""
    boxes = []
    for f in features:
        pts = [p for rings in polys(f['geometry']) for p in rings[0]]
        boxes.append((min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts), f))
    counts = {}
    for point in json.loads(POOL.read_text()):
        lat, lng = point['lat'], point['lng']
        hit = next((f['properties']['name'] for x0, y0, x1, y1, f in boxes
                    if x0 <= lng <= x1 and y0 <= lat <= y1 and in_geometry(lng, lat, f['geometry'])), None)
        state = next((t[3:] for t in point.get('extra', {}).get('tags', []) if t.startswith('US-')), None)
        if hit:
            counts[hit, state] = counts.get((hit, state), 0) + 1
    return counts


def revision():
    """A contentRevision above the last build's (installs replace a cached pack only for a higher or re-hashed one)."""
    try:
        last = json.loads(OUT.read_text()).get('contentRevision', 0)
    except (OSError, ValueError):
        last = 0
    return max(int(time.time()), last + 1)


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
    groups = sorted({t['group'] for r in eco.values() for t in (r.get('abundance') or {}).get('forestTypes', [])})
    for code in codes:
        r = eco[code]
        feats = [{k: f[k] for k in ('id', 'name', 'kind', 'species') if f.get(k)} | ({'ref': ref(f['species'])} if f.get('species') and ref(f['species']) else {})
                 | ({'signal': s} if (s := signal(f, groups)) else {}) for f in r.get('features', [])]
        key = r.get('key') or {}
        skills.append({'id': f'usveg:{code}', 'title': r['name'], 'phase': 'Vegetation', 'practiceFamily': f"usveg:{r.get('l1', '')}",
                       'prerequisites': [], 'availability': 'available', 'subject': 'vegetation', 'region': code, 'l1': r.get('l1'), 'l2': r.get('l2'),
                       'why': key.get('vibe') or r.get('group') or '', 'lost': (r.get('rounds') or {}).get('ptsLost', 0),
                       **({'recent': True} if code in recent else {}), 'features': feats, 'mix': mix(r),
                       # ponytail: 'coast' in the name marks a coastal region; a shoreline test if inland/coast phrasing misfires.
                       **({'coastal': True} if 'coast' in r['name'].lower() else {}),
                       'trees': [{'species': s, 'name': (sp(s) or {}).get('common', s.replace('-', ' ')), **({'ref': ref(s)} if ref(s) else {}),
                                  **({'line': look(sp(s))} if sp(s) else {})} for s in key.get('trees', [])]})
        for p in ordered([p for p in r.get('panos', []) if p.get('drive')]):
            loc = {'id': f"usveg:{p['panoId']}", 'panoId': p['panoId'], 'lat': p['lat'], 'lng': p['lng'], 'heading': p.get('heading', 0),
                   'pitch': p.get('pitch', 0), 'zoom': p.get('zoom', 0), 'skillIds': [f'usveg:{code}'], 'region': code,
                   'state': p.get('state'), 'img': p['img'].removeprefix('img/'), 'season': p.get('season'), 'date': p.get('date'),
                   'verdict': (p.get('coach') or {}).get('verdict') or p.get('caption', ''),
                   'giveaways': [{'feature': g.get('feature'), 'text': g['text'], 'box': g['box']} for g in (p.get('coach') or {}).get('giveaways', [])],
                   # What the panorama itself names: its species list and, when labelled, one box per tree (card viewer 'Trees').
                   **({'species': p['species']} if p.get('species') else {}),
                   **({'trees': [{'species': t.get('species'), 'label': t['label'], 'box': t['box'], 'confidence': t.get('confidence', 'medium')}
                                 for t in p['trees']]} if p.get('trees') else {})}
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
    # ACoW weighting: each region's share of the pool, graded with the same polygons as a guess; each location's
    # cellShare is its state's share of its region's points (src/sprint.mjs cellCoverage: unseen cells first, largest
    # share first, and every state cell with a panorama must be shown before the region can retire).
    counts = pool_counts(order) if POOL.exists() else {}
    total, per_region = sum(counts.values()) or 1, {}
    for (code, _), n in counts.items():
        per_region[code] = per_region.get(code, 0) + n
    for loc in kept:
        loc['cellShare'] = round(counts.get((loc['region'], loc['state']), 0) / per_region.get(loc['region'], 1), 4)
    have = {(loc['region'], loc['state']) for loc in kept}
    gaps = sorted(f'{code} {state}' for (code, state) in counts if (code, state) not in have)
    if gaps:
        print(f"{len(gaps)} state cells in the pool have no panorama: {', '.join(gaps)}", file=sys.stderr)
    most = max((s['lost'] for s in skills), default=0) or 1
    for s in skills:
        s['acow'] = round(per_region.get(s['region'], 0) / total, 5)
        s['cost'] = weighted_cost(s['acow'], s.pop('lost') / most)
        # The states the region has panoramas in, most first (at most 4): the miss headline's "(ME / NH / VT / NY)".
        s['states'] = [st for st, _ in Counter(loc['state'] for loc in kept if loc['region'] == s['region'] and loc['state']).most_common(4)]
    skills.sort(key=lambda s: -s['cost'])

    used = {f['species'] for s in skills for f in s['features'] if f.get('species')} | {t['species'] for s in skills for t in s['trees']}
    trees, tree_locs = usveg_trees.deck(data, kept, {s['region']: s['acow'] for s in skills}, counts, range_of)
    paths = {c: svg_path(shapes[c]) for c in codes}
    xs = [float(v) for d in paths.values() for seg in d.replace('M', 'L').replace('Z', '').split('L') if seg for v in seg.split()[0::2]]
    ys = [float(v) for d in paths.values() for seg in d.replace('M', 'L').replace('Z', '').split('L') if seg for v in seg.split()[1::2]]
    view = [math.floor(min(xs)) - 4, math.floor(min(ys)) - 4, math.ceil(max(xs) - min(xs)) + 8, math.ceil(max(ys) - min(ys)) + 8]
    pack = {'id': 'us-vegetation', 'title': 'US Vegetation', 'subject': 'GeoGuessr', 'schemaVersion': 1,
            'contentRevision': revision(), 'scheduler': 'sprint', 'gradingPolicy': 'recognition', 'card': 'veg',
            'gameSettings': GAME_SETTINGS, 'cellCoverage': True, 'warmup': [c for c in WARMUP if c in {loc['region'] for loc in kept}],
            'contrasts': contrasts(eco, {loc['region'] for loc in kept}, order), 'initialSkillIds': [], 'imageBase': IMAGE_BASE,
            'answerAreaLabel': f"{len({loc['region'] for loc in kept})} US ecoregions, {len(kept)} panoramas, graded by the ecoregion you pin",
            'coverageSummary': f"Tree Atlas drive panoramas with coach giveaways (fieldwork-site/trees, {data.get('generated', '')}); EPA Level III ecoregions.",
            'skills': skills + trees, 'locations': kept + tree_locs,
            'pools': [{'id': 'us-vegetation', 'title': 'US ecoregions', 'skillIds': [s['id'] for s in skills + trees], 'mapUrl': SOURCE_MAP}],
            'regionFeatures': order,
            'vegMap': {'viewBox': view, 'regions': paths,
                       'species': {s: range_of(eco, s) for s in sorted(used)}}}
    return pack, dropped


def similarity(a, b):
    """Look-alike score: shared forest (forest-type shares x forest share, plus the open share) and shared feature ids."""
    def mix(r):
        ab = r.get('abundance') or {}
        f = ab.get('forestShare', 0)
        return {'open': 1 - f, **{t['group']: f * t['share'] for t in ab.get('forestTypes', [])}}
    ma, mb = mix(a), mix(b)
    fa, fb = {f['id'] for f in a.get('features', [])}, {f['id'] for f in b.get('features', [])}
    return sum(min(v, mb.get(k, 0)) for k, v in ma.items()) + 0.5 * len(fa & fb) / (len(fa | fb) or 1)


def confused_pairs():
    """(true, pinned) region pairs from Seth's US duel rounds where his guess landed in another region."""
    path = WORLD / 'duels/rounds.json'
    if not path.exists():
        return []
    return [r for r in json.loads(path.read_text()) if r.get('countryCode') == 'US' and (r.get('myGuess') or {}).get('lat') is not None]


def contrast_pairs(eco, playable, duels=()):
    """Sorted code pairs with a playable side: duel confusions, key neighbours, each region's SIMILAR closest look-alikes."""
    pairs = set()
    for r in duels:
        pairs.add(tuple(sorted((r[0], r[1]))))
    for code in playable:
        pairs |= {tuple(sorted((code, n['code']))) for n in (eco[code].get('key') or {}).get('neighbours') or [] if n['code'] in eco}
        near = sorted((c for c in eco if c != code), key=lambda c: -similarity(eco[code], eco[c]))[:SIMILAR]
        pairs |= {tuple(sorted((code, c))) for c in near}
    return sorted(p for p in pairs if p[0] != p[1])


def facts(code, r):
    key, ab = r.get('key') or {}, r.get('abundance') or {}
    return {'code': code, 'name': r['name'], 'family': [r.get('l1'), r.get('l2')], 'vibe': key.get('vibe'), 'tells': key.get('tells', []),
            'keyTrees': key.get('trees', []), 'features': {f['id']: f['name'] for f in r.get('features', [])},
            'forestShare': ab.get('forestShare'), 'forestTypes': ab.get('forestTypes', []), 'landCover': ab.get('landCover')}


def rule_ok(answer, a, b, eco):
    """A cached answer as a pack entry, its feature ids kept only where the region has them; None past RULE_WORDS words."""
    rule = ' '.join(answer.get('rule', '').split())
    if not rule or len(rule.split()) > RULE_WORDS:
        return None
    ids = lambda code, got: [i for i in got if i in {f['id'] for f in eco[code].get('features', [])}][:2]
    return {'rule': rule, 'features': {a: ids(a, answer.get('featuresA', [])), b: ids(b, answer.get('featuresB', []))}}


def contrasts(eco, playable, features):
    """The pack's contrasts map. CONTRAST_MODEL (one codex call per pair, curate.ask_cached) answers only pairs missing from
    the CONTRASTS cache. Without a rule for a pair the card falls back to the two vibe lines."""
    import curate
    duels = [(region_at(r['view']['lat'], r['view']['lng'], features), region_at(r['myGuess']['lat'], r['myGuess']['lng'], features))
             for r in confused_pairs()]
    pairs = contrast_pairs(eco, playable, [d for d in duels if None not in d and d[0] != d[1]])
    prompts = {(a, b): (
        'Two US ecoregions a GeoGuessr player confuses from a Street View panorama. Using ONLY the facts below, write ONE '
        f'conditional rule of at most {RULE_WORDS} words that tells them apart by what is visible from a road, in the form '
        "'<visible cue> = <short name A>. <visible cue> = <short name B>.' If the facts give no visible separator, say the "
        'view cannot separate them and name the shared look. Then list the feature ids (from each region\'s features) the '
        'rule relies on, at most two per region.\n'
        f'A: {json.dumps(facts(a, eco[a]))}\nB: {json.dumps(facts(b, eco[b]))}') for a, b in pairs}
    schema = {'type': 'object', 'additionalProperties': False, 'required': ['rule', 'featuresA', 'featuresB'],
              'properties': {'rule': {'type': 'string'}, 'featuresA': {'type': 'array', 'items': {'type': 'string'}},
                             'featuresB': {'type': 'array', 'items': {'type': 'string'}}}}
    answers = curate.ask_cached(CONTRASTS, prompts, schema, CONTRAST_MODEL)
    out = {f'{a}|{b}': entry for (a, b), answer in answers.items() if (entry := rule_ok(answer, a, b, eco))}
    print(f'contrasts: {len(out)} of {len(pairs)} pairs have a rule', file=sys.stderr)
    return out


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
    assert weighted_cost(0.05, 0) == 50 and weighted_cost(0.01, 1) == 20 and weighted_cost(0, 1) == ZERO_COST
    assert weighted_cost(0.03, 0) > weighted_cost(0.01, 1), 'a duel loss lifts a region but cannot outrank 3x its share'
    assert look({'silhouette': 'A tall deciduous tree. More.', 'features': ['Leaves big.', 'Bark is grey and smooth.']}) == 'A tall deciduous tree. Bark is grey and smooth'
    assert len(look({'silhouette': ' '.join(['w'] * 30)}).split()) == 16
    eco = {'A': {'features': [{'id': 'oak'}]}, 'B': {'features': [{'id': 'pine'}], 'key': {'neighbours': [{'code': 'A'}]}}}
    assert rule_ok({'rule': 'Oaks = A. Pines = B.', 'featuresA': ['oak', 'nope'], 'featuresB': ['pine']}, 'A', 'B', eco) == \
        {'rule': 'Oaks = A. Pines = B.', 'features': {'A': ['oak'], 'B': ['pine']}}
    assert rule_ok({'rule': ' '.join(['w'] * 17)}, 'A', 'B', eco) is None, 'a rule past 16 words falls back to the vibes'
    assert contrast_pairs(eco, {'B'}) == [('A', 'B')]
    groups = ['Douglas-fir', 'Maple/Beech/Birch', 'Spruce/Fir', 'White/Red/Jack Pine']
    assert signal({'name': 'Dark spruce-fir among hardwoods'}, groups) == ['ft:Douglas-fir', 'ft:Spruce/Fir']
    assert signal({'name': 'Dark conifers in the hollows'}, groups) == ['ft:Douglas-fir', 'ft:Spruce/Fir', 'ft:White/Red/Jack Pine']
    assert signal({'name': 'Narrow road walled by forest'}, groups) == ['lc:forest']
    assert signal({'name': 'Plateau back road'}, groups) == [] and signal({'name': 'x', 'species': 'oak'}, groups) == ['sp:oak']
    usveg_trees.check()
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
    # The atlas's Tree deck page (fieldwork-site trees/#deck) reads the same cards and map.
    trees = [s for s in pack['skills'] if s['subject'] == 'tree']
    (TREES / 'deck.json').write_text(json.dumps({'viewBox': pack['vegMap']['viewBox'], 'regions': pack['vegMap']['regions'],
                                                 'names': {c: r['name'] for c, r in data['ecoregions'].items()}, 'cards': trees},
                                                separators=(',', ':')))
    regions = [loc for loc in pack['locations'] if not loc['id'].startswith('usveg:tree:')]
    print(f"{OUT.relative_to(REPO)}: {len(pack['skills']) - len(trees)} regions, {len(regions)} panoramas, "
          f"{len({loc['region'] for loc in regions})} regions playable; {len(trees)} trees, "
          f"{sum(1 for s in trees if any(loc['skillIds'] == [s['id']] for loc in pack['locations']))} playable; {OUT.stat().st_size // 1024} KB")


if __name__ == '__main__':
    main()
