#!/usr/bin/env python3
"""Gap fill: Vali-generated Street View locations inside each clue's region become review candidates.

Needs: Vali (dotnet tool) with downloaded country data, clues.json, review.jsonl, gap/clue-regions.json.
Writes gap/pools/<CC>-locations.json (Vali output) and gap/candidates.jsonl (four 90-degree views per location).
  (no argument)  sample short practice clues
  rural [LIMIT]  sample landscape, agriculture and architecture clues whose chosen locations are not all rural
                 (rurality.jsonl), so build.py has rural alternatives; writes gap/rural-candidates.jsonl. LIMIT = new clues.
Usage: python3 gapfill.py [rural [LIMIT]]
"""
import concurrent.futures as cf
import collections
import json
import os
import random
import subprocess
import sys
from pathlib import Path

import collect
import review
import rurality
from text import HERE, WORK

GAP = HERE / 'gap'
PER_CLUE = 6  # Vali locations judged per short clue
RURAL_PER_CLUE = 8
RURAL_KINDS = {'landscape-and-vegetation', 'agriculture', 'architecture'}
TERRITORIES = {'alaska': ('US', ['US-AK']), 'hawaii': ('US', ['US-HI']), 'azores': ('PT', ['PT-20']),
               'madeira': ('PT', ['PT-30']), 'us-minor-outlying-islands': ('UM', None)}
ENV = {**os.environ, 'PATH': f"/opt/homebrew/opt/dotnet@8/bin:{Path.home()}/.dotnet/tools:{os.environ['PATH']}",
       'DOTNET_ROOT': '/opt/homebrew/opt/dotnet@8/libexec', 'VALI_DOWNLOAD_FOLDER': str(Path.home() / 'vali-data')}


def vali_pool(cc, goal):
    out = GAP / 'pools' / f'{cc}-locations.json'
    out.parent.mkdir(parents=True, exist_ok=True)
    if not out.exists():
        spec = GAP / 'pools' / f'{cc}.json'
        spec.write_text(json.dumps({'countryCodes': [cc], 'distributionStrategy': {
            'key': 'FixedCountByMaxMinDistance', 'locationCountGoal': goal, 'minMinDistance': 300},
            'output': {'panoVerificationStrategy': 'Newest', 'locationTags': ['SubdivisionCode']}}))
        # Vali polls the console for a stop key, so it needs a pseudo-terminal.
        subprocess.run(['script', '-q', '/dev/null', 'vali', 'generate', '--file', spec.name], cwd=spec.parent,
                       env=ENV, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=3600)
    if not out.exists():
        return []
    doc = json.loads(out.read_text())
    return [l for l in (doc['customCoordinates'] if isinstance(doc, dict) else doc) if l.get('panoId')]


def eligible_subdivisions(region):
    """None = whole country; list = whole subdivisions. False when the clue's area is finer than a subdivision
    or was never extracted: sampling a whole subdivision would teach a scene from outside the claimed area."""
    if not region:
        return False
    if region['nationwide']:
        return None
    return region['subdivisions'] if region.get('wholeSubdivisions') and region['subdivisions'] else False


def clue_area(stage, slug, region):
    """Where gap-fill may sample a clue: None = whole country, list = ISO subdivisions, False = nowhere safe."""
    fixed = TERRITORIES.get(slug, (None, None))[1]
    if stage == 'country-identification':
        return fixed
    if fixed:
        # A territory guide is a single ISO subdivision, so "whole subdivision" says nothing; only clues that apply
        # to the whole territory are safe (island- or town-specific ones are not).
        return fixed if region and region['nationwide'] else False
    return eligible_subdivisions(region)


def sample(clue, subs, by_sub, pool, n, used=frozenset()):
    """n Vali locations of the clue's area (pool split by subdivision tag), as candidates without views."""
    options = [l for l in ([l for s in subs for l in by_sub.get(s, [])] if subs else pool) if l['panoId'] not in used]
    return [{'source': 'vali-region', 'topicId': clue['topicId'], 'clueSubdivisions': subs,
             'subdivision': (loc.get('extra', {}).get('tags') or [None])[0],
             'view': {'panoId': loc['panoId'], 'lat': loc['lat'], 'lng': loc['lng'],
                      'heading': loc.get('heading') or 0, 'pitch': 0, 'zoom': 0},
             'fov': 90.0, 'coordinateCountry': None}
            for loc in random.Random(clue['topicId']).sample(options, min(n, len(options)))]


def split(pool):
    by_sub = collections.defaultdict(list)
    for loc in pool:
        for tag in loc.get('extra', {}).get('tags', []):
            by_sub[tag].append(loc)
    return by_sub


def finish(c):
    """Four 90-degree thumbnails around the panorama's heading."""
    views = [({**c['view'], 'heading': (c['view']['heading'] + 90 * k) % 360}, c['fov']) for k in range(4)]
    c['views'] = []
    try:
        for view, fov in views:
            path = collect.thumb(view, fov)
            if path is None:
                break
            c['views'].append({'heading': view['heading'], 'pitch': view['pitch'], 'fov': fov,
                               'thumb': str(path.relative_to(HERE))})
        c['thumbStatus'] = 'ok' if c['views'] else 'panorama-unavailable'
    except Exception as e:
        c['thumbStatus'] = f'error: {str(e)[:80]}'
    return c


def write(out, existing, candidates, clues):
    with cf.ThreadPoolExecutor(6) as pool:
        for i, _ in enumerate(pool.map(finish, candidates), 1):
            if i % 1000 == 0:
                print(f'thumbs {i}/{len(candidates)}', flush=True)
    text = {c['topicId']: c['text'] for c in clues}
    with open(out, 'w') as f:
        for c in existing + candidates:
            c['id'] = collect.candidate_id(c, text[c['topicId']])  # re-fingerprint: changed clue text needs a fresh verdict
            f.write(json.dumps(c, ensure_ascii=False) + '\n')
    print(json.dumps({'candidates': len(candidates), 'thumbsOk': sum(c['thumbStatus'] == 'ok' for c in candidates),
                      'clues': len({c['topicId'] for c in candidates})}))


def setup():
    clues = json.loads((HERE / 'clues.json').read_text())
    regions = json.loads((GAP / 'clue-regions.json').read_text())
    codes = {u['slug']: u.get('code') for u in json.loads(
        (WORK / 'location-database/foundations/all-guide-topic-inventory.json').read_text())['units']}
    stage = {c['topicId']: c['stage'] for c in clues}
    slug = {c['topicId']: c['slug'] for c in clues}
    curation = json.loads((HERE / 'labels/curation.json').read_text())
    kind = {f'plonkit:{s}:{r["tipId"]}': r['kind'] for s, v in curation.items() for r in v['order']}

    def area(topic):
        return clue_area(stage[topic], slug[topic], regions.get(topic))

    def country(clue):
        return TERRITORIES.get(clue['slug'], (codes[clue['slug']], None))[0]
    return clues, kind, area, country


def rural(limit=None):
    clues, kind, area, country = setup()
    out = GAP / 'rural-candidates.jsonl'
    existing = [json.loads(l) for l in out.read_text().splitlines()] if out.exists() else []
    used = {c['view']['panoId'] for c in rurality.candidates().values()} | {c['view']['panoId'] for c in existing}
    done, sampled = rurality.labelled(), {c['topicId'] for c in existing}
    targets = {t for t, ids in rurality.chosen().items()
               if kind.get(t) in RURAL_KINDS and any(done.get(i) != 'rural' for i in ids)}
    todo = [c for c in clues if c['topicId'] in targets - sampled and area(c['topicId']) is not False][:limit]
    print(f'kept {len(existing)} earlier candidates; clues with non-rural locations={len(targets)} sampling={len(todo)}',
          flush=True)
    by_country = collections.defaultdict(list)
    for c in todo:
        by_country[country(c)].append(c)
    candidates = []
    for cc, items in sorted(by_country.items()):
        pool = vali_pool(cc, 300)
        by_sub = split(pool)
        for clue in items:
            picked = sample(clue, area(clue['topicId']), by_sub, pool, RURAL_PER_CLUE, used)
            used |= {c['view']['panoId'] for c in picked}
            candidates += picked
    write(out, existing, candidates, clues)


def main():
    (GAP / 'pools').mkdir(parents=True, exist_ok=True)
    clues, kind, area, country = setup()
    bank = {b['topicId']: b for b in json.loads((HERE / 'clue-bank.json').read_text())}
    out = GAP / 'candidates.jsonl'
    existing = [json.loads(l) for l in out.read_text().splitlines()] if out.exists() else []
    pano_sub = {}
    for path in (GAP / 'pools').glob('*-locations.json'):
        doc = json.loads(path.read_text())
        for l in doc['customCoordinates'] if isinstance(doc, dict) else doc:
            pano_sub[l['panoId']] = (l.get('extra', {}).get('tags') or [None])[0]
    # Earlier samples keep their identity and verdicts while they still sit inside the clue's current area.
    existing = [c for c in existing if area(c['topicId']) is not False
                and (area(c['topicId']) is None or pano_sub.get(c['view']['panoId']) in area(c['topicId']))]
    # Vali views can only prove kinds the reviewer reads reliably at 90 degrees (review.accepts), so small-detail
    # kinds are never sampled; every other short clue is sampled once.
    sampled = {c['topicId'] for c in existing}
    short = [c for c in clues if bank[c['topicId']]['practice'] and bank[c['topicId']]['status'] != 'playable'
             and c['topicId'] not in sampled and kind.get(c['topicId']) not in review.INFRA_KINDS]
    by_country = collections.defaultdict(list)
    skipped = 0
    for c in short:
        subs = area(c['topicId'])
        if subs is False:
            skipped += 1
            continue
        by_country[country(c)].append((c, subs))
    print(f'kept {len(existing)} earlier candidates; short practice clues to sample={len(short)} '
          f'sampled={len(short) - skipped} skipped(sub-subdivision or unextracted)={skipped}', flush=True)
    candidates = []
    for cc, items in sorted(by_country.items()):
        pool = vali_pool(cc, min(4000, max(300, 12 * len(items))))
        by_sub = split(pool)
        for clue, subs in items:
            candidates += sample(clue, subs, by_sub, pool, PER_CLUE)
    write(out, existing, candidates, clues)


if __name__ == '__main__':
    if sys.argv[1:2] == ['rural']:
        rural(int(sys.argv[2]) if sys.argv[2:] else None)
    else:
        main()
