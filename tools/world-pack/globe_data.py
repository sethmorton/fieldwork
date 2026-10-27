#!/usr/bin/env python3
"""Writes the Globe's data (fieldwork-site/globe/): countries.json and admin1/<ISO2>.json (simplified Natural Earth
GeoJSON) and data.json (Seth's world-map duel stats per country and admin-1 region, ranked metas for each, his rounds).
Stdlib only. Usage: WORLD_PACK_DATA=/path/to/world-map python3 tools/world-pack/globe_data.py [out dir]"""
import collections
import datetime as dt
import json
import math
import re
import statistics
import sys
from pathlib import Path

from build import card_image
from text import HERE, WORK

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else Path.home() / 'Desktop/code/fieldwork-site/globe')
WORLD_MAP_ERROR = 14_000_000  # maxErrorDistance (m) from which a map counts as a world map, as in sprint.duel_stats
COUNTRY_TOL, ADMIN1_TOL, MIN_AREA = 0.05, 0.01, 0.005  # degrees; MIN_AREA in square degrees
SUBJECTS = ['poles', 'landscape', 'roads', 'car', 'contrast', 'duel']
GUIDE_KINDS = {'landscape-and-vegetation', 'infrastructure', 'agriculture'}
TOP_COUNTRY, TOP_REGION = 12, 16

load = lambda path: json.loads(Path(path).read_text())
iso = lambda value: value if value and len(value) == 2 else None


# --- geometry: Douglas-Peucker as in scripts/world-geometry.mjs -----------------------------------------------------
def seg_dist(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = dx * dx + dy * dy
    t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)) if length else 0
    return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)


def simplify(points, tol):
    """Iterative Douglas-Peucker (big admin-1 rings overflow Python's recursion limit)."""
    keep, stack = {0, len(points) - 1}, [(0, len(points) - 1)]
    while stack:
        lo, hi = stack.pop()
        best, index = 0, 0
        for i in range(lo + 1, hi):
            d = seg_dist(points[i], points[lo], points[hi])
            if d > best:
                best, index = d, i
        if best > tol:
            keep.add(index)
            stack += [(lo, index), (index, hi)]
    return [points[i] for i in sorted(keep)]


def simplify_ring(ring, tol):
    """Closed ring: split at the point farthest from the start so no baseline has zero length."""
    far = max(range(len(ring)), key=lambda i: math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]))
    return simplify(ring[:far + 1], tol)[:-1] + simplify(ring[far:], tol)


def area(ring):
    return abs(sum(x * ny - nx * y for (x, y), (nx, ny) in zip(ring, ring[1:] + ring[:1]))) / 2


def polygons(geometry):
    return [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates']


def simplify_polys(polys, tol, digits):
    """Drop islets and holes under MIN_AREA (but always keep the largest polygon), simplify the rest, round."""
    largest = max(area(p[0]) for p in polys)
    out = []
    for poly in polys:
        if area(poly[0]) < MIN_AREA and area(poly[0]) != largest:
            continue
        rings = []
        for ring in poly[:1] + [h for h in poly[1:] if area(h) >= MIN_AREA]:
            simple = simplify_ring(ring, tol)
            simple = simple if len(simple) > 3 else ring  # collapsed: keep it as is
            rings.append([[round(x, digits), round(y, digits)] for x, y in simple])
        out.append(rings)
    return out


def feature(code, name, polys):
    return {'type': 'Feature', 'properties': {'code': code, 'name': name},
            'geometry': {'type': 'MultiPolygon', 'coordinates': polys}}


def inside(lng, lat, polys):
    """Even-odd ray cast over every ring (holes included)."""
    hit = False
    for poly in polys:
        for ring in poly:
            for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
                if (y1 > lat) != (y2 > lat) and lng < x1 + (lat - y1) * (x2 - x1) / (y2 - y1):
                    hit = not hit
    return hit


def bbox(polys):
    xs = [x for p in polys for x, _ in p[0]]
    ys = [y for p in polys for _, y in p[0]]
    return min(xs), min(ys), max(xs), max(ys)


def geometry():
    """(countries {ISO2: (name, polys)}, admin1 {code: (name, ISO2, polys)}, NE name -> ISO2, alias {code: [codes]})."""
    countries, to_code = {}, {}
    for f in load(WORK / 'worldwide/countries-50m.geojson')['features']:
        p = f['properties']
        code = iso(p['ISO_A2']) or iso(p['ISO_A2_EH']) or iso(p['WB_A2'])
        for k in ('NAME', 'ADMIN', 'NAME_EN'):
            to_code.setdefault(p[k], code)
        if not code or code == 'AQ':
            continue
        name, polys = countries.get(code, (p['NAME'], []))
        # Several features share a code (Australia's external territories): the one whose own ISO_A2 matches names it.
        countries[code] = (p['NAME'] if iso(p['ISO_A2']) else name, polys + polygons(f['geometry']))
    admin1, alias = {}, collections.defaultdict(set)
    for f in load(WORK / 'natural-earth-admin1.geojson')['features']:
        p = f['properties']
        code, cc = p['iso_3166_2'] or '', p['iso_a2']
        if not re.fullmatch(r'[A-Z]{2}-\w+', code) or not f['geometry']:
            continue
        name, _, polys = admin1.get(code, (p['name'], cc, []))
        admin1[code] = (name, cc, polys + polygons(f['geometry']))
        # Plonk It names some parents NE splits up (France's regions, Spain's communities): FR-HDF -> its departments.
        parent = (p['region_cod'] or '').replace('.', '-')
        if parent[:3] == cc + '-':
            alias[parent].add(code)
    return countries, admin1, to_code, {k: sorted(v) for k, v in alias.items() if k not in admin1}


def sub_code(label):
    """'Delaware (US-DE)' -> 'US-DE'."""
    m = re.search(r'\(([A-Z]{2}-\w+)\)$', label or '')
    return m and m.group(1)


def attempts():
    files = sorted((HERE / 'win').glob('sprint-attempts-*.json')) + [Path(__file__).resolve().parents[2] / '.scratch/attempts-now.json']
    newest = max((f for f in files if f.exists()), key=lambda f: f.stat().st_mtime)
    out = collections.defaultdict(list)
    for a in sorted(load(newest), key=lambda a: a['occurredAt']):
        out[a['skillId']].append(a['correct'])
    return out


def sprint_of(tries):
    if not tries:
        return {'attempts': 0, 'spotted': 0, 'state': 'new'}
    return {'attempts': len(tries), 'spotted': sum(tries), 'state': 'known' if tries[-1] else 'missed'}


def duel_summary():
    """World-map rounds plus summary {rounds, games, record, rating, since}."""
    raw = load(HERE / 'duels/raw.json')
    world = {gid for gid, g in raw['details'].items() if g['options']['map']['maxErrorDistance'] >= WORLD_MAP_ERROR}
    rounds = [r for r in load(HERE / 'duels/rounds.json') if r['gameId'] in world]
    ended = {}
    for r in rounds:
        ended[r['gameId']] = max(ended.get(r['gameId'], ''), r['endTime'] or '')
    wins, losses, ratings = 0, 0, []
    for gid in sorted(ended, key=ended.get):
        g = raw['details'][gid]
        team = next(t for t in g['teams'] if any(p['playerId'] == raw['userId'] for p in t['players']))
        me = next(p for p in team['players'] if p['playerId'] == raw['userId'])
        winner = (g.get('result') or {}).get('winningTeamId')
        wins, losses = wins + (winner == team['id']), losses + (bool(winner) and winner != team['id'])
        progress = ((me.get('progressChange') or {}).get('rankedSystemProgress') or {}).get('ratingAfter')
        if progress or me.get('rating'):
            ratings.append(progress or me['rating'])
    return rounds, {'rounds': len(rounds), 'games': len(ended), 'record': {'w': wins, 'l': losses},
                    'rating': {'now': ratings[-1] if ratings else None, 'peak': max(ratings, default=None)},
                    'since': min(ended.values(), default='')[:10]}


def rank_key(meta):
    if meta['kind'] == 'guide':
        return (1, 0, 0, len(meta['tell']))
    subject = SUBJECTS.index(meta['subject']) if meta['subject'] in SUBJECTS else 3.5  # signs, bollards: after car
    return (0, -meta['cost'], subject, 0)


def place(codes, admin1, alias):
    """Source subdivision codes -> NE admin-1 codes; codes NE lacks stay as given (country list only)."""
    placed = sorted({c for code in codes for c in ([code] if code in admin1 else alias.get(code, []))})
    return placed or sorted(codes)


def metas(admin1, alias, tries, names):
    pack = load(HERE / 'sprint/pack.json')
    regions = load(HERE / 'gap/clue-regions.json')
    exports = collections.defaultdict(list)
    for line in (HERE / 'lm/exports.jsonl').read_text().splitlines():
        e = json.loads(line)
        exports[e['metaId']] += [(l['lng'], l['lat']) for l in e['locations']]
    card_points = collections.defaultdict(list)
    for loc in pack['locations']:
        for sid in loc['skillIds']:
            card_points[sid].append((loc['lng'], loc['lat']))
    rounds = {r['id']: r for r in load(HERE / 'duels/rounds.json')}
    by_country = collections.defaultdict(list)
    for code, (_, cc, polys) in admin1.items():
        by_country[cc].append((code, bbox(polys), polys))

    def lm_regions(cc, points):
        hit = {code for lng, lat in points for code, (x0, y0, x1, y1), polys in by_country[cc]
               if x0 <= lng <= x1 and y0 <= lat <= y1 and inside(lng, lat, polys)}
        return [] if len(hit) > len(by_country[cc]) / 2 else sorted(hit)

    out, carded = {}, set()
    for s in pack['skills']:
        source = (s.get('curriculum') or {}).get('source') or {}
        kind = s['id'].split(':')[2]
        if s['subject'] == 'contrast':
            where = []
        elif kind == 'duel':
            where = [c for c in [sub_code(rounds.get(source.get('clue'), {}).get('subdivision'))] if c]
        elif kind == 'lm':
            where = lm_regions(s['country'], card_points[s['id']] + exports[int(s['id'].split(':')[-1])])
        else:
            region = regions.get(source.get('clue'), {})
            where = place(region.get('subdivisions', []), admin1, alias)
        carded.add(source.get('clue'))
        out[s['id']] = {'title': s['title'], 'tell': s.get('tell') or s['why'], 'stakes': s['stakes'], 'cost': s['cost'],
                        'subject': s['subject'], 'country': s['country'], 'regions': where,
                        'image': (s['imageUrls'] or [None])[0], 'sourceTitle': s['source']['title'],
                        'sourceUrl': s['source'].get('url'), 'kind': 'card', 'sprint': sprint_of(tries.get(s['id']))}
    kinds = {f"plonkit:{slug}:{r['tipId']}": r['kind'] for slug, v in load(HERE / 'labels/curation.json').items()
             for r in v['order']}
    units = load(WORK / 'location-database/foundations/all-guide-topic-inventory.json')['units']
    code_of_slug = {u['slug']: (u.get('code') or '').split('-')[0] for u in units}
    for c in load(HERE / 'clues.json'):
        tid, region = c['topicId'], regions.get(c['topicId'], {})
        cc = code_of_slug.get(c['slug'])
        regional = c['stage'] == 'within-country-regional' or region.get('subdivisions')
        if tid in carded or kinds.get(tid) not in GUIDE_KINDS or not regional or not cc:
            continue
        out[tid] = {'title': f"{names.get(cc, c['title'])} · {c['subsection'] or c['section']}", 'tell': c['text'],
                    'stakes': '', 'cost': 0, 'subject': kinds[tid], 'country': cc,
                    'regions': place(region.get('subdivisions', []), admin1, alias),
                    'image': card_image(c['imageUrls'][0]) if c['imageUrls'] else None, 'sourceTitle': f"Plonk It · {c['title']}",
                    'sourceUrl': c['tipUrl'], 'kind': 'guide', 'sprint': sprint_of([])}
    return out, pack['skills']


def round_stats(rs):
    km = [r['myGuess']['distance'] / 1000 for r in rs if (r.get('myGuess') or {}).get('distance') is not None]
    return {'rounds': len(rs),
            'ptsLost': sum(max(0, (r['theirScore'] or 0) - (r['myScore'] or 0)) for r in rs),
            'netPerRound': round(statistics.mean((r['myScore'] or 0) - (r['theirScore'] or 0) for r in rs), 1) if rs else None,
            'medianKm': round(statistics.median(km), 1) if km else None}


def tally(pairs):
    n, pts = collections.Counter(), collections.Counter()
    for code, p in pairs:
        n[code] += 1
        pts[code] += p
    return [{'code': c, 'n': k, 'pts': pts[c]} for c, k in n.most_common()]


def main():
    countries, admin1, to_code, alias = geometry()
    names = {cc: name for cc, (name, _) in countries.items()}
    rounds, summary = duel_summary()
    tries = attempts()
    meta, skills = metas(admin1, alias, tries, names)
    weights = load(HERE / 'acow/weights.json')['countries']
    total = sum(weights.values())

    by_cc, by_region, guessed = collections.defaultdict(list), collections.defaultdict(list), collections.defaultdict(list)
    for r in rounds:
        r['guessCode'] = to_code.get(r['myGuessCountry'])
        by_cc[r['countryCode']].append(r)
        if r['guessCode']:
            guessed[r['guessCode']].append(r)
        if sub_code(r['subdivision']):
            by_region[sub_code(r['subdivision'])].append(r)
    meta_cc, meta_region = collections.defaultdict(list), collections.defaultdict(list)
    for mid, m in meta.items():
        meta_cc[m['country']].append(mid)
        for code in m['regions']:
            meta_region[code].append(mid)
    ranked = lambda ids: sorted(ids, key=lambda i: rank_key(meta[i]))
    skill_cc = collections.defaultdict(list)
    for s in skills:
        skill_cc[s['country']].append(s)

    out_countries = {}
    for cc in sorted(set(weights) | set(by_cc)):
        rs, deficit = by_cc[cc], lambda r: (r['theirScore'] or 0) - (r['myScore'] or 0)
        right = [r for r in rs if r['guessCode'] == cc]
        sprint = [t for s in skill_cc[cc] for t in tries.get(s['id'], [])]
        modes = collections.Counter(s['mode'] for s in skill_cc[cc])
        out_countries[cc] = {
            'name': names.get(cc, rs[0]['country'] if rs else cc), 'acowShare': round(weights.get(cc, 0) / total, 4),
            **round_stats(rs), 'right': len(right), 'idRate': round(len(right) / len(rs), 3) if rs else None,
            'ptsGained': sum(max(0, -deficit(r)) for r in rs),
            'regionalRight': round(sum(r['myGuessSubdivision'] == r['subdivision'] for r in right) / len(right), 3)
            if right else None,
            'wrongAs': tally((r['guessCode'], deficit(r)) for r in rs if r['guessCode'] and r['guessCode'] != cc),
            'guessedFor': tally((r['countryCode'], deficit(r)) for r in guessed[cc] if r['countryCode'] != cc),
            'sprint': {'attempts': len(sprint), 'spotted': sum(sprint),
                       'missRate': round(1 - sum(sprint) / len(sprint), 3) if sprint else None},
            'mode': 'regional' if modes['regional'] > modes['identify'] else 'identify',
            'metaIds': ranked(meta_cc[cc])[:TOP_COUNTRY]}

    nationwide = {cc: ranked(i for i in ids if not meta[i]['regions']) for cc, ids in meta_cc.items()}
    out_regions = {}
    for code in sorted((set(by_region) | set(meta_region)) & set(admin1)):
        name, cc, _ = admin1[code]
        rs = by_region[code]
        guesses = collections.Counter(sub_code(r['myGuessSubdivision']) or r['guessCode'] for r in rs
                                      if sub_code(r['myGuessSubdivision']) != code)
        out_regions[code] = {'name': name, 'country': cc, **round_stats(rs),
                             'guessedAs': [{'code': c, 'n': n} for c, n in guesses.most_common() if c],
                             'metaIds': (ranked(meta_region[code]) + nationwide.get(cc, []))[:TOP_REGION]}

    out_rounds = [{'lat': r['view']['lat'], 'lng': r['view']['lng'], 'country': r['countryCode'],
                   'region': sub_code(r['subdivision']), 'score': r['myScore'], 'theirScore': r['theirScore'],
                   'deficit': (r['theirScore'] or 0) - (r['myScore'] or 0),
                   'guessLat': (r.get('myGuess') or {}).get('lat'), 'guessLng': (r.get('myGuess') or {}).get('lng'),
                   'date': (r['endTime'] or '')[:10], 'map': r['map'], 'mode': r['mode'],
                   'pano': 'https://www.google.com/maps/@?api=1&map_action=pano&pano={}&heading={}&pitch={}'.format(
                       r['view']['panoId'], r['view']['heading'], r['view']['pitch'])} for r in rounds]

    (OUT / 'admin1').mkdir(parents=True, exist_ok=True)
    write = lambda path, data: path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')))
    write(OUT / 'countries.json', {'type': 'FeatureCollection', 'features': [
        feature(cc, name, simplify_polys(polys, COUNTRY_TOL, 2)) for cc, (name, polys) in sorted(countries.items())]})
    region_ccs = {r['country'] for r in out_regions.values()}
    for cc in sorted(region_ccs):  # coarser until under 400 KB (Russia, Canada)
        tol = ADMIN1_TOL
        while write(OUT / f'admin1/{cc}.json', {'type': 'FeatureCollection', 'features': [
                feature(code, name, simplify_polys(polys, tol, 3))
                for code, (name, c, polys) in sorted(admin1.items()) if c == cc]}) > 400_000:
            tol *= 1.5
    write(OUT / 'data.json', {'generated': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
                              'summary': summary, 'countries': out_countries, 'regions': out_regions,
                              'metas': meta, 'rounds': out_rounds})
    kinds = collections.Counter(m['kind'] for m in meta.values())
    biggest = max((OUT / 'admin1').glob('*.json'), key=lambda f: f.stat().st_size)
    print(f"countries.json {(OUT / 'countries.json').stat().st_size // 1024} KB, {len(countries)} countries; "
          f"admin1/ {len(region_ccs)} files, largest {biggest.name} {biggest.stat().st_size // 1024} KB; "
          f"data.json {(OUT / 'data.json').stat().st_size // 1024} KB: {len(out_countries)} countries, "
          f"{len(out_regions)} regions, {kinds['card']} cards + {kinds['guide']} guides, {len(out_rounds)} rounds")


if __name__ == '__main__':
    main()
