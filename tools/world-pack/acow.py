#!/usr/bin/env python3
"""How often each practice clue is usable on A Competitive World (ACoW), the ranked No Move map.

  weights   the official ACoW country distribution (https://tinyurl.com/acowdist, A Competitive World 2.0 by BojanR)
  sample    draw ACoW-shaped rounds: countries weighted by acow/weights.json, locations from the per-country Vali
            pools (gap/pools)
  classify  small model (CURATE_MODEL) names the practice clues clearly visible in each round's four directions
  score     acow/clue-value.json: for each clue, ranked rounds per 1,000 in which it is visible and usable
Usage: WORLD_PACK_DATA=<caches> python3 tools/world-pack/acow.py weights|sample [N]|classify [LIMIT]|score
"""
import collections
import concurrent.futures as cf
import csv
import io
import json
import random
import sys

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


def inputs(by_code, line):
    """Per country: fingerprint of the candidate clue text and the model, so a judgement is reused only for the same
    question. (A change to the prompt wording in duels.visible_clues needs acow/classified.jsonl removed.)"""
    return {cc: curate.fingerprint(curate.MODEL, *(line[t] for t in ts)) for cc, ts in by_code.items()}


def classify(limit=None):
    rounds = json.loads((OUT / 'sample.json').read_text())
    rounds = random.Random(0).sample(rounds, len(rounds))[:limit]
    by_code, line = duels.practice_clues()
    current = inputs(by_code, line)
    country_at = collect.bc.geolocator(json.loads((WORK / 'worldwide/countries-50m.geojson').read_text()))
    out = OUT / 'classified.jsonl'
    done = {(r['id'], r.get('inputs')) for r in map(json.loads, out.read_text().splitlines())} if out.exists() else set()

    def one(r):
        candidates = by_code.get(r['countryCode'], [])
        images = duels.frames({**r, 'movement': {}})
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
    result = estimate(weights(), rounds, recs, inputs(*duels.practice_clues()))
    (OUT / 'clue-value.json').write_text(json.dumps(result))
    print(json.dumps({'cluesSeen': len(result['clues']), 'seenTwiceOrMore': sum(c['hits'] >= 2 for c in result['clues'].values()),
                      'countriesWithoutJudgedRounds': result['countriesWithoutJudgedRounds']}))


if __name__ == '__main__':
    OUT.mkdir(exist_ok=True)
    command, *rest = sys.argv[1:]
    {'weights': fetch_weights, 'sample': lambda: sample(int(rest[0]) if rest else 1200), 'score': score,
     'classify': lambda: classify(int(rest[0]) if rest else None)}[command]()
