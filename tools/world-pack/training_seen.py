"""Previously seen panoramas are card-only study material, never fresh game spots."""
import json
import re
from collections import defaultdict

from globe_geometry import bbox, inside
from text import HERE
from training_pano import official_id


def seen_spots(names, regions, by_sub, admin1, areas):
    by_country = defaultdict(list)
    for feature in areas:
        polys = feature['geometry']['coordinates']
        by_country[feature['properties']['country']].append((feature['properties']['name'], bbox(polys), polys))
    sub_areas = defaultdict(list)
    for code, (_, cc, polys) in admin1.items():
        if code in by_sub:
            sub_areas[cc].append((code, bbox(polys), polys))
    codes = {name: cc for cc, name in names.items()}
    sources = []
    rounds = HERE / 'duels/rounds.json'
    for r in json.loads(rounds.read_text()) if rounds.exists() else []:
        match = re.search(r'\(([A-Z]{2}-[^)]+)\)', r.get('subdivision') or '')
        sources.append({**r['view'], 'countryCode': r['countryCode'],
                        'admin1': match.group(1) if match else None,
                        'seenSource': 'duel', 'sourceId': r['id'], 'lost': bool(r.get('lost'))})
    sprint = HERE / 'sprint/pack.json'
    for loc in json.loads(sprint.read_text()).get('locations', []) if sprint.exists() else []:
        cc = codes.get(loc.get('country'))
        if not cc:
            cc = next((s.split(':')[1] for s in loc.get('skillIds', [])
                       if s.startswith('sprint:') and len(s.split(':')) > 1), None)
        sources.append({**loc, 'countryCode': cc, 'seenSource': 'sprint', 'sourceId': loc['id']})
    used = set()
    for spot in sources:
        pano, cc = official_id(spot.get('panoId')), spot.get('countryCode')
        if not pano or pano in used or cc not in names:
            continue
        used.add(pano)
        country, x, y = names[cc], spot['lng'], spot['lat']
        sub = spot.get('admin1')
        region = next((name for name, (x1, y1, x2, y2), polys in by_country[country]
                       if x1 <= x <= x2 and y1 <= y <= y2 and inside(x, y, polys)), None)
        if not sub:
            sub = next((code for code, (x1, y1, x2, y2), polys in sub_areas[cc]
                        if x1 <= x <= x2 and y1 <= y <= y2 and inside(x, y, polys)), None)
        region = region or by_sub.get(sub) or (country if country in regions else None)
        hints = [prefix + skill.split(prefix, 1)[1] for skill in spot.get('skillIds', [])
                 for prefix in ('plonkit:', 'lm:') if prefix in skill]
        yield {'panoId': pano, 'lat': y, 'lng': x, 'heading': spot.get('heading') or 0,
               'pitch': spot.get('pitch') or 0, 'zoom': 0, 'fov': 90, 'countryCode': cc,
               'country': country, 'region': region or country, 'admin1': sub, 'kind': 'seen',
               'regionAssignment': 'geometry-or-admin1' if region else 'country-only',
               'seenSource': spot['seenSource'], 'sourceId': spot['sourceId'], 'lost': spot.get('lost', False),
               'hintMetaIds': hints}
