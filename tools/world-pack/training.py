#!/usr/bin/env python3
"""Build the private deal pack from cached Vali pools and independently verified labels.

WORLD_PACK_DATA=... uv run --with shapely tools/world-pack/training.py
python3 tools/world-pack/training.py test
python3 tools/world-pack/training.py refill --countries US BR CA --count 1000
"""
import argparse
import collections
import datetime as dt
import hashlib
import json
import math
import re
from pathlib import Path

from build import card_image
from label import VERSION, image_url, rows
from text import HERE
from training_regions import assignment, answer_areas, catalogue
from training_tips import guide_codes, tips_catalogue
from globe_geometry import inside

ROOT = Path(__file__).resolve().parents[2]
OUT = HERE / 'training'


def load(path, default=None):
    return json.loads(path.read_text()) if path.exists() else default


def atomic(path, document):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(document, ensure_ascii=False, separators=(',', ':')))
    tmp.replace(path)


def split(pano):
    n = int(hashlib.sha256(pano.encode()).hexdigest()[:8], 16) % 10
    return 'probe' if n == 0 else 'drill' if n < 7 else 'study'


def skill_id(cc, region):
    return 'train:' + cc.lower() + ':' + re.sub('[^a-z0-9]+', '-', region.lower()).strip('-')


def attempts():
    """Exports only, never browser credentials or a live account request."""
    config = load(ROOT / '.fieldwork.local.json', {})
    paths = list((HERE / 'win').glob('*attempts*.json')) + list((ROOT / '.scratch').glob('*attempts*.json'))
    paths += [OUT / 'attempts.json']
    if config.get('trainingAttemptsPath'):
        paths.append(Path(config['trainingAttemptsPath']))
    latest = {}
    for path in sorted((p for p in paths if p.exists()), key=lambda p: p.stat().st_mtime):
        doc = load(path, [])
        for a in doc if isinstance(doc, list) else doc.get('attempts', []):
            latest[a.get('id', json.dumps(a, sort_keys=True))] = a
    return list(latest.values())


def excluded(tries, config):
    seen = {r['view']['panoId'] for r in load(HERE / 'duels/rounds.json', []) if r.get('view', {}).get('panoId')}
    for a in tries:
        if a.get('panoId'):
            seen.add(a['panoId'])
        ref = a.get('locationRef') or ''
        if ref.startswith('pano:'):
            seen.add(ref[5:])
    # All other pack locations are reserved, whether actually practised or not.
    paths = set(HERE.glob('*/pack*.json')) | set((ROOT / 'content').glob('*.json'))
    paths |= set((ROOT / 'local').glob('*pack*.json'))
    paths |= {Path(p['packPath']) for p in config.get('additionalPacks', []) if p.get('packPath')}
    if config.get('packPath'):
        paths.add(Path(config['packPath']))
    for path in paths:
        if path.parent == OUT or not path.exists():
            continue
        pack = load(path, {})
        if isinstance(pack, dict):
            seen.update(l['panoId'] for l in pack.get('locations', []) if l.get('panoId'))
    # Preserve study exposure exclusions across pack rebuilds via optional local export.
    for e in load(OUT / 'exposures.json', []):
        ref = e if isinstance(e, str) else e.get('locationRef', '')
        if ref.startswith('pano:'):
            seen.add(ref[5:])
    return seen


def focus(rounds, weights, names, tries=(), now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    cutoff = now - dt.timedelta(days=14)
    losses = collections.defaultdict(list)
    for r in rounds:
        if r.get('mode') != 'NoMoveDuels' or r.get('map') != 'A Competitive World':
            continue
        when = dt.datetime.fromisoformat(r['endTime'].replace('Z', '+00:00')) if r.get('endTime') else None
        if when is not None and cutoff <= when <= now and r.get('countryCode') in weights:
            losses[r['countryCode']].append(max(0, r['theirScore'] - r['myScore']))
    codes = {name: cc for cc, name in names.items()}
    for a in tries:
        if not (a.get('packId') == 'training' or str(a.get('skillId', '')).startswith('train:')):
            continue
        when = dt.datetime.fromisoformat(a['occurredAt'].replace('Z', '+00:00')) if a.get('occurredAt') else None
        cc = a.get('countryCode') or codes.get(a.get('country'))
        points = a.get('worldPoints', a.get('worldScore', a.get('points')))
        if when and cutoff <= when <= now and cc in weights and isinstance(points, (int, float)):
            # No opponent in practice: deficit against a perfect world-scale score.
            losses[cc].append(max(0, 5000 - points))
    all_losses = [x for values in losses.values() for x in values]
    mean = sum(all_losses) / len(all_losses) if all_losses else 0
    total = sum(weights.values())
    scores = [{'country': names[cc], 'score': weights[cc] / total * (sum(losses[cc]) + 10 * mean) /
               (len(losses[cc]) + 10), 'n': len(losses[cc])} for cc in weights if cc in names]
    scores.sort(key=lambda r: (-r['score'], -weights[codes[r['country']]], r['country']))
    return {'country': scores[0]['country'], 'scores': scores, 'computedAt': now.isoformat()}


def rural_labels():
    settings = {r['id']: r['setting'] for r in rows(HERE / 'rurality.jsonl')}
    values = collections.defaultdict(set)
    for name in ('candidates.jsonl', 'gap/candidates.jsonl', 'near/candidates.jsonl',
                 'acow/candidates.jsonl', 'gap/rural-candidates.jsonl'):
        for c in rows(HERE / name):
            if c['id'] in settings:
                values[c['view']['panoId']].add(settings[c['id']])
    # Disagreement is not rural evidence. Non-rural labels win conservatively.
    return {pano: 'urban' if 'urban' in s else 'suburban' if 'suburban' in s else 'rural'
            for pano, s in values.items()}


def feature_maps(regions, weights, names):
    visual = load(HERE / 'labels/visual.json', {})
    codes = guide_codes()
    top = set(sorted(weights, key=lambda c: -weights[c])[:40])
    features = []
    for clue in load(HERE / 'clues.json', []):
        key, cc = clue['topicId'], codes.get(clue['slug'])
        if cc not in top or cc not in names or not clue.get('imageUrls'):
            continue
        if visual.get(key, {}).get('imageKind') != 'region-map' and key != 'plonkit:brazil:PvkL':
            continue
        features.append({'id': key, 'country': names[cc],
            'title': visual.get(key, {}).get('lookFor') or clue['text'].split('.')[0],
            'img': card_image(clue['imageUrls'][0]),
            'regions': [r for r, info in regions.items() if info['iso2'] == cc],
            'variants': [{'title': 'Example', 'img': card_image(url)} for url in clue['imageUrls'][1:4]],
            'url': clue['tipUrl']})
    features.sort(key=lambda f: (f['id'] != 'plonkit:brazil:PvkL', f['country'], f['id']))
    return features


def build():
    names, regions, by_sub, countries, admin1 = catalogue()
    weights = load(HERE / 'acow/weights.json')['countries']
    top = set(sorted(weights, key=lambda c: -weights[c])[:40])
    config = load(ROOT / '.fieldwork.local.json', {})
    tries = attempts()
    seen = excluded(tries, config)
    settings = rural_labels()
    labels = {r['panoId']: r for r in rows(OUT / 'labels.jsonl') if r.get('verified')}
    sources, _ = tips_catalogue(names, regions, by_sub, admin1)
    areas = answer_areas(regions, by_sub, countries, admin1)
    area_by_name = {f['properties']['name']: f['geometry']['coordinates'] for f in areas}
    locations, used, skipped = [], set(), collections.Counter()
    for path in sorted((HERE / 'gap/pools').glob('*-locations.json')):
        cc = path.name[:2]
        if cc not in names or not weights.get(cc):
            continue
        doc = load(path)
        for loc in doc.get('customCoordinates', []) if isinstance(doc, dict) else doc:
            pano = loc.get('panoId')
            if not pano or pano in seen or pano in used:
                skipped['seenOrDuplicate'] += 1
                continue
            region, sub = assignment(cc, loc.get('extra', {}).get('tags', []), names, by_sub)
            if not region:
                skipped['unassignedAdmin1'] += 1
                continue
            label = labels.get(pano, {})
            setting = label.get('setting') or settings.get(pano)
            if settings.get(pano) in ('urban', 'suburban') or setting in ('urban', 'suburban'):
                skipped['nonRural'] += 1
                continue
            if cc in top and setting != 'rural':
                skipped['top40Unlabelled'] += 1
                continue
            if split(pano) != 'study' and not inside(loc['lng'], loc['lat'], area_by_name[region]):
                skipped['outsidePlayableGeometry'] += 1
                continue
            used.add(pano)
            view = label.get('view', loc)
            skill = skill_id(cc, region)
            locations.append({'id': 'pano:' + pano, 'panoId': pano, 'lat': loc['lat'], 'lng': loc['lng'],
                'heading': view.get('heading') or 0, 'pitch': view.get('pitch') or 0, 'zoom': 0, 'fov': 90,
                'skillIds': [skill], 'country': names[cc], 'region': region, 'admin1': sub, 'split': split(pano),
                'rural': True if setting == 'rural' else None,
                'ruralStatus': 'verified' if setting == 'rural' else 'unlabelled',
                'assessmentEligible': True, 'image': label.get('image') or image_url(view),
                'metas': [m for m in label.get('metas', []) if (not m['metaId'] or m['metaId'] in sources)
                          and label.get('qualityVersion') == VERSION],
                'vegetation': label.get('vegetation', ''), 'regionConsistency': label.get('regionConsistency', ''),
                'verified': bool(label.get('verified'))})
    active = {l['region'] for l in locations}
    studies = collections.Counter(l['region'] for l in locations if l['split'] == 'study')
    verified_studies = collections.Counter(l['region'] for l in locations if l['split'] == 'study' and l['verified'])
    for region in active:
        if region != regions[region]['country'] and verified_studies[region] < 4:
            regions[region] = {**regions[region], 'studyFallbackCountry': regions[region]['country']}
    skills = [{'id': skill_id(info['iso2'], region), 'title': region, 'phase': 'Regions', 'prerequisites': [],
               'region': region, 'country': info['country'], 'practiceFamily': info['iso2'].lower()}
              for region, info in sorted(regions.items()) if region in active]
    rounds = load(HERE / 'duels/rounds.json', [])
    losses = []
    for r in rounds:
        if not r.get('lost'):
            continue
        cc, pano = r['countryCode'], r['view']['panoId']
        match = re.search(r'\(([A-Z]{2}-[^)]+)\)', r.get('subdivision') or '')
        region, _ = assignment(cc, [match.group(1)] if match else [], names, by_sub)
        label = labels.get(pano, {})
        losses.append({'id': r['id'], 'occurredAt': r['endTime'], 'panoId': pano,
                       'country': names.get(cc, r['country']), 'region': region,
                       'metaIds': [m['metaId'] for m in label.get('metas', [])
                                   if m['metaId'] in sources and label.get('qualityVersion') == VERSION]})
    binding = next((p.get('practiceMapId') for p in config.get('additionalPacks', [])
                    if Path(p.get('packPath', '')).resolve() == (OUT / 'pack.json').resolve()), None)
    practice_map = config.get('trainingPracticeMapId') or binding
    if not practice_map or not re.fullmatch('[a-f0-9]{24}', practice_map):
        raise ValueError('Bind the dedicated Training map in .fieldwork.local.json additionalPacks first')
    pack = {'id': 'training', 'title': 'Training', 'subject': 'GeoGuessr', 'schemaVersion': 1,
        'scheduler': 'deal', 'practiceMapId': practice_map, 'answerAreaLabel': 'Region', 'thumbSize': [640, 400],
        'gameSettings': {'forbidMoving': True, 'forbidRotating': False, 'forbidZooming': False, 'timeLimit': 60},
        'acow': {names[cc]: w / sum(weights.values()) for cc, w in weights.items() if cc in names},
        'focus': focus(rounds, weights, names, tries), 'regionFeatures': areas, 'regions': regions,
        'skills': skills, 'metas': {i: {k: v for k, v in m.items() if k not in ('text', 'subdivisions')}
                                    for i, m in sources.items()},
        'locations': locations, 'features': feature_maps(regions, weights, names), 'duelLosses': losses}
    path = OUT / 'pack.json'
    previous = load(path, {})
    before = {k: v for k, v in previous.items() if k != 'contentRevision'}
    # Focus timestamp is metadata, not a content change that forces a full cache refresh.
    if before.get('focus'):
        before['focus'] = {**before['focus'], 'computedAt': pack['focus']['computedAt']}
    pack['contentRevision'] = previous.get('contentRevision', 0) + (before != pack)
    atomic(path, pack)
    report = {'pack': str(path), 'locations': len(locations), 'splits': dict(collections.Counter(l['split'] for l in locations)),
        'countries': len({l['country'] for l in locations}), 'regions': len(active),
        'focus': pack['focus'], 'labelledLocations': sum(l['verified'] for l in locations),
        'verifiedLabelRecords': len(labels), 'labelledPerCountry': dict(collections.Counter(
            r['view']['country'] for r in labels.values())), 'unlabelledTail': sum(l['rural'] is None for l in locations),
        'featureMaps': len(pack['features']), 'skipped': dict(skipped), 'contentRevision': pack['contentRevision'],
        'studyPerRegion': dict(studies), 'verifiedStudyPerRegion': dict(verified_studies)}
    atomic(OUT / 'report.json', report)
    print(json.dumps({**report, 'focus': {**pack['focus'], 'scores': pack['focus']['scores'][:3]}},
                     ensure_ascii=False, indent=2))
    return pack


def test():
    now = dt.datetime(2026, 11, 3, tzinfo=dt.timezone.utc)
    common = {'mode': 'NoMoveDuels', 'map': 'A Competitive World', 'endTime': '2026-11-02T00:00:00Z',
              'countryCode': 'US', 'theirScore': 4000, 'myScore': 1000}
    f = focus([common, {**common, 'myScore': 5000}, {**common, 'mode': 'MoveDuels'},
               {**common, 'endTime': '2026-10-01T00:00:00Z'}], {'US': 2, 'BR': 1}, {'US': 'US', 'BR': 'BR'}, now=now)
    assert f['scores'][0]['n'] == 2
    assert math.isclose(f['scores'][0]['score'], 2 / 3 * (3000 + 10 * 1500) / 12)
    counts = collections.Counter(split(str(i)) for i in range(10000))
    assert 850 < counts['probe'] < 1150 and 5700 < counts['drill'] < 6300
    assert split('fixed') == split('fixed')
    from label import box_ok
    assert box_ok([0, 0, .5, .5]) and not box_ok([.9, 0, .2, .5])
    from training_regions import MEMBERS
    assert MEMBERS['US-CA'] == 'Pacific' and MEMBERS['BR-BA'] == 'Northeast'
    assert MEMBERS['RU-KDA'] == 'Southern' and MEMBERS['RU-BU'] == 'Far Eastern'
    assert len([s for s in MEMBERS if s.startswith('US-')]) == 51
    from tempfile import TemporaryDirectory
    from unittest.mock import patch
    import gapfill
    import label
    from urllib.parse import parse_qs, urlsplit
    with TemporaryDirectory() as tmp:
        folder = Path(tmp)
        (folder / 'pools').mkdir()
        path = folder / 'pools/US-locations.json'
        path.write_text(json.dumps({'customCoordinates': [{'panoId': 'old'}], 'source': 'preserved'}))
        with patch.object(gapfill, 'GAP', folder), patch.object(gapfill, 'generate_pool', return_value=[
                {'panoId': 'old'}, {'panoId': 'new'}, {'panoId': 'new'}, {'panoId': 'another'}]):
            assert len(gapfill.vali_pool('US', 2, append=True)) == 3
            assert json.loads(path.read_text())['source'] == 'preserved'
        saved = path.read_text()
        with patch.object(gapfill, 'GAP', folder), patch.object(gapfill, 'generate_pool', side_effect=RuntimeError('failed')):
            try:
                gapfill.vali_pool('US', 2, append=True)
                assert False, 'Refill failure must propagate'
            except RuntimeError:
                assert path.read_text() == saved
        with patch.object(label, 'OUT', folder), patch.object(label.time, 'sleep') as sleep, patch.object(
                label.curate, 'ask', side_effect=[RuntimeError('429 rate limit'), {'results': []}]) as ask:
            assert label.ask('test', {}, [], 'model', ['key']) == {'results': []}
            assert ask.call_count == 2 and sleep.call_args.args == (15,)
    query = parse_qs(urlsplit(image_url({'panoId': 'p', 'heading': 15, 'pitch': 10})).query)
    assert query['pitch'] == ['-10.00'] and query['thumbfov'] == ['90']
    pack = load(OUT / 'pack.json')
    if pack:
        ids = {l['panoId'] for l in pack['locations']}
        assert len(ids) == len(pack['locations'])
        assert not ids.intersection(excluded(attempts(), load(ROOT / '.fieldwork.local.json', {})))
        assert all(l['split'] == split(l['panoId']) for l in pack['locations'])
        assert all(l['rural'] in (True, None) for l in pack['locations'])
        assert all(not l['metas'] or l['verified'] for l in pack['locations'])
        assert all(box_ok(m['box']) for l in pack['locations'] for m in l['metas'])
        assert pack['features'][0]['id'] == 'plonkit:brazil:PvkL'
    print('training self-check passed: focus, splits, boxes, macro membership, safe refill, backoff, exact views, private pack')


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('command', choices=['build', 'test', 'refill'], nargs='?', default='build')
    ap.add_argument('--countries', nargs='+', default=['US', 'BR', 'IN', 'AU', 'RU', 'CA', 'MX', 'ID'])
    ap.add_argument('--count', type=int, default=1000, help='additional requested pool locations per country')
    args = ap.parse_args()
    if args.command == 'test':
        test()
    elif args.command == 'refill':
        import gapfill
        if args.count < 1:
            ap.error('--count must be positive')
        for cc in args.countries:
            if not re.fullmatch('[A-Z]{2}', cc):
                ap.error('countries must be uppercase ISO2 codes')
            pool = gapfill.vali_pool(cc, args.count, append=True)
            print(json.dumps({'country': cc, 'locationsAfter': len(pool)}))
    else:
        build()
