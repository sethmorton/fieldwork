#!/usr/bin/env python3
"""How often each practice clue is usable on A Competitive World (ACoW), the ranked No Move map.

  weights   the official ACoW country distribution (https://tinyurl.com/acowdist, A Competitive World 2.0 by BojanR)
  sample    draw ACoW-shaped rounds: countries weighted by acow/weights.json, locations from the per-country Vali
            pools (gap/pools)
  classify  small model (CURATE_MODEL) names the practice clues clearly visible in each round's four directions
  candidates acow/candidates.jsonl: each round where a clue was seen becomes a rural practice candidate for it
  score     acow/clue-value.json: for each clue, the small model's estimated detection rate per 1,000 ACoW-shaped Vali rounds
Usage: WORLD_PACK_DATA=<caches> python3 tools/world-pack/acow.py weights|sample [N]|classify [LIMIT]|candidates|score
"""
import collections
import concurrent.futures as cf
import csv
import io
import json
import random
import sys
import xml.etree.ElementTree as ET
import zipfile

import collect
import curate
import duels
import gapfill
from text import HERE, WORK

OUT = HERE / 'acow'
SHEET = 'https://docs.google.com/spreadsheets/d/1AjRLkeEKGFAPOAbXVy7fmrbfVTvstz8opiURgge19RA/export?format=csv&gid=0'


def fetch_weights():
    """Country code and locations out of 100k, from the distribution sheet's first tab."""
    countries = {}
    for row in csv.reader(io.StringIO(collect.fetch(SHEET)[1].decode())):
        cells = [c.strip() for c in row if c.strip()]
        if len(cells) == 2 and len(cells[0]) == 2 and cells[0].isupper() and cells[1].replace('.', '', 1).isdigit():
            countries[cells[0]] = countries.get(cells[0], 0) + float(cells[1])
    (OUT / 'weights.json').write_text(json.dumps({'countries': countries, 'source': 'https://tinyurl.com/acowdist'}, indent=1))
    print(json.dumps({'countries': len(countries), 'total': sum(countries.values())}))


def weights():
    return json.loads((OUT / 'weights.json').read_text())['countries']


def urban_shares():
    """ISO2 -> urban share of ACoW locations, from the distribution sheet's third tab (CountryCode/REST/URBAN in
    columns B/E/F, I/L/M, P/S/T and W/Z/AA below a two-row header)."""
    m = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
    book = zipfile.ZipFile(HERE / 'acow/acowdist.xlsx')
    strings = [''.join(t.text or '' for t in si.iter(m + 't')) for si in ET.fromstring(book.read('xl/sharedStrings.xml'))]
    counts = collections.defaultdict(lambda: [0.0, 0.0])
    for row in list(ET.fromstring(book.read('xl/worksheets/sheet3.xml')).iter(m + 'row'))[2:]:
        cells = {''.join(ch for ch in c.get('r') if ch.isalpha()): strings[int(v.text)] if c.get('t') == 's' else v.text
                 for c in row for v in [c.find(m + 'v')] if v is not None}
        for code, rest, urban in (('B', 'E', 'F'), ('I', 'L', 'M'), ('P', 'S', 'T'), ('W', 'Z', 'AA')):
            if cells.get(code):
                counts[cells[code]][0] += float(cells[rest])
                counts[cells[code]][1] += float(cells[urban])
    return {cc: round(u / (r + u), 3) for cc, (r, u) in counts.items() if r + u}


def sample(n=1200):
    """Rounds per country in proportion to ACoW (at least two, so every country is seen), from its Vali pool.
    Countries without a pool yet get one from Vali (the same generator gapfill.py uses)."""
    w = weights()
    total = sum(w.values())
    rounds = []
    for cc, weight in sorted(w.items()):
        pool = gapfill.vali_pool(cc, 300)
        for loc in random.Random(cc).sample(pool, min(len(pool), max(2, round(n * weight / total)))):
            rounds.append({'id': f"acow:{cc}:{loc['panoId']}", 'countryCode': cc,
                           'view': {'panoId': loc['panoId'], 'lat': loc['lat'], 'lng': loc['lng'],
                                    'heading': loc.get('heading') or 0, 'pitch': 0, 'zoom': 0}})
    (OUT / 'sample.json').write_text(json.dumps(rounds))
    covered = sum(w[c] for c in {r['countryCode'] for r in rounds})
    print(json.dumps({'rounds': len(rounds), 'countries': len({r['countryCode'] for r in rounds}),
                      'acowWeightCovered': round(100 * covered / total, 1)}))


def classify(limit=None):
    rounds = json.loads((OUT / 'sample.json').read_text())
    rounds = random.Random(0).sample(rounds, len(rounds))[:limit]
    by_code, line = duels.practice_clues()
    current = duels.inputs(by_code, line)
    country_at = collect.bc.geolocator(json.loads((WORK / 'worldwide/countries-50m.geojson').read_text()))
    out = OUT / 'classified.jsonl'
    done = {(r['id'], r.get('inputs')) for r in map(json.loads, out.read_text().splitlines())} if out.exists() else set()

    def one(r):
        candidates = by_code.get(r['countryCode'], [])
        images = duels.frames({**r, 'movement': {}})
        if images is None:
            return None
        stamp = {'id': r['id'], 'inputs': current.get(r['countryCode'])}
        if not candidates or not images:
            return {**stamp, 'clues': [], 'missedNote': '', 'skipped': 'no practicable clues' if images else 'panorama gone'}
        country = country_at(r['view']['lat'], r['view']['lng']) or r['countryCode']
        context = (f"This is a round of A Competitive World, the GeoGuessr ranked No Move map. The true location is in "
                   f"{country} ({r['view']['lat']:.3f}, {r['view']['lng']:.3f}). The player can turn around and zoom but "
                   f"not move, so frames 1-{len(images)} are what they can see.")
        result = duels.visible_clues(images, country, context, candidates, line)
        return result and {**stamp, **result}

    with open(out, 'a') as f, cf.ThreadPoolExecutor(curate.WORKERS) as pool:
        for rec in pool.map(one, [r for r in rounds if (r['id'], current.get(r['countryCode'])) not in done]):
            if rec:
                f.write(json.dumps(rec, ensure_ascii=False) + '\n')
                f.flush()
    print(json.dumps({'classified': sum(1 for _ in out.open())}))


def estimate(w, rounds, recs, current):
    """Estimated detection rate: each sampled round stands for its country's ACoW share split evenly over that
    country's judged rounds. Only judgements of the current sample with current inputs count. This is how often the
    small model sees a clue on country-weighted Vali locations, not measured frequency on real ACoW rounds."""
    total = sum(w.values())
    latest = {r['id']: r for r in recs if r['id'] in rounds and r.get('inputs') == current.get(rounds[r['id']]['countryCode'])}
    judged = collections.Counter(rounds[i]['countryCode'] for i, r in latest.items() if not r.get('skipped'))
    value, hits = collections.Counter(), collections.Counter()
    for i, rec in latest.items():
        cc = rounds[i]['countryCode']
        for c in rec['clues']:
            value[c['topicId']] += 1000 * w[cc] / total / judged[cc]
            hits[c['topicId']] += 1
    return {'clues': {t: {'per1000': round(v, 2), 'hits': hits[t]} for t, v in value.most_common()},
            'countriesWithoutJudgedRounds': sorted(set(w) - set(judged))}


def score():
    rounds = {r['id']: r for r in json.loads((OUT / 'sample.json').read_text())}
    recs = [json.loads(l) for l in (OUT / 'classified.jsonl').read_text().splitlines()]
    result = estimate(weights(), rounds, recs, duels.inputs(*duels.practice_clues()))
    (OUT / 'clue-value.json').write_text(json.dumps(result))
    print(json.dumps({'cluesSeen': len(result['clues']), 'seenTwiceOrMore': sum(c['hits'] >= 2 for c in result['clues'].values()),
                      'countriesWithoutJudgedRounds': result['countriesWithoutJudgedRounds']}))


def candidates():
    """Rural practice locations: each sampled round where the model saw a clue becomes a candidate for that clue.
    They are machine-oriented views, so review.py and review.accepts decide them like Vali samples."""
    rounds = {r['id']: r for r in json.loads((OUT / 'sample.json').read_text())}
    clue_text = {c['topicId']: c['text'] for c in json.loads((HERE / 'clues.json').read_text())}
    out = []
    for rec in map(json.loads, (OUT / 'classified.jsonl').read_text().splitlines()):
        r = rounds.get(rec['id'])
        for c in rec['clues'] if r else []:
            view = r['view']
            views = [{'heading': (view['heading'] + 90 * k) % 360, 'pitch': 0, 'fov': 90.0} for k in range(4)]
            paths = [collect.thumb({**view, 'heading': v['heading']}, 90.0) for v in views]
            cand = {'source': 'acow-sample', 'topicId': c['topicId'], 'view': view, 'fov': 90.0, 'coordinateCountry': None,
                    'views': [{**v, 'thumb': str(p.relative_to(HERE))} for v, p in zip(views, paths) if p]}
            cand['thumbStatus'] = 'ok' if cand['views'] else 'panorama-unavailable'
            cand['id'] = collect.candidate_id(cand, clue_text[c['topicId']])
            out.append(cand)
    (OUT / 'candidates.jsonl').write_text(''.join(json.dumps(c, ensure_ascii=False) + '\n' for c in out))
    print(json.dumps({'candidates': len(out), 'clues': len({c['topicId'] for c in out})}))


if __name__ == '__main__':
    OUT.mkdir(exist_ok=True)
    command, *rest = sys.argv[1:]
    {'weights': fetch_weights, 'sample': lambda: sample(int(rest[0]) if rest else 1200), 'score': score,
     'candidates': candidates, 'classify': lambda: classify(int(rest[0]) if rest else None)}[command]()
