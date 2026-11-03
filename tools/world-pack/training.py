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
import statistics
from pathlib import Path

from label import VERSION, image_url, rows
from text import HERE
from training_regions import assignment, answer_areas, catalogue, tip_footprints
from training_tips import guide_codes, tips_catalogue
from globe_geometry import inside
from training_pano import official_id
from rurality import settings_by_pano

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
    return {pano for value in seen if (pano := official_id(value))}


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


def feature_maps(regions, weights, names):
    from build import card_image
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


def annotations(label, sources, region):
    if label.get('qualityVersion') != VERSION or label.get('view', {}).get('region') != region:
        return []
    return [m for m in label.get('metas', []) if not m['metaId'] or m['metaId'] in sources]


def build():
    names, regions, by_sub, countries, admin1, aliases = catalogue()
    weights = load(HERE / 'acow/weights.json')['countries']
    top = set(sorted(weights, key=lambda c: -weights[c])[:40])
    config = load(ROOT / '.fieldwork.local.json', {})
    tries = attempts()
    seen = excluded(tries, config)
    settings = settings_by_pano()
    labels = {official_id(r['panoId']): r for r in rows(OUT / 'labels.jsonl')
              if r.get('verified') and official_id(r['panoId'])}
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
            pano = official_id(loc.get('panoId'))
            if not pano:
                skipped['nonOfficial'] += 1
                continue
            loc = {**loc, 'panoId': pano}
            if not pano or pano in seen or pano in used:
                skipped['seenOrDuplicate'] += 1
                continue
            region, sub = assignment(cc, loc.get('extra', {}).get('tags', []), names, by_sub)
            if not region:
                skipped['unassignedAdmin1'] += 1
                continue
            label = labels.get(pano, {})
            setting = label.get('setting') or settings.get(pano)
            if label.get('indoor') or label.get('urbanFlag') or settings.get(pano) in ('urban', 'suburban') or setting in ('urban', 'suburban'):
                skipped['nonRural'] += 1
                continue
            if cc in top and setting != 'rural' and split(pano) == 'study':
                skipped['top40UnlabelledStudy'] += 1
                continue
            if split(pano) != 'study' and not inside(loc['lng'], loc['lat'], area_by_name[region]):
                skipped['outsidePlayableGeometry'] += 1
                continue
            used.add(pano)
            view = label.get('view', loc)
            skill = skill_id(cc, region)
            magnifiers = annotations(label, sources, region)
            locations.append({'id': 'pano:' + pano, 'panoId': pano, 'lat': loc['lat'], 'lng': loc['lng'],
                'heading': view.get('heading') or 0, 'pitch': view.get('pitch') or 0, 'zoom': 0, 'fov': 90,
                'skillIds': [skill], 'country': names[cc], 'region': region, 'admin1': sub, 'split': split(pano),
                'rural': True if setting == 'rural' else None,
                'ruralStatus': 'verified' if setting == 'rural' else 'unlabelled',
                'assessmentEligible': True, 'image': label.get('image') or image_url(view),
                'metas': magnifiers, 'metaCount': len(magnifiers),
                'vegetation': label.get('vegetation', ''), 'regionConsistency': label.get('regionConsistency', ''),
                'verified': bool(label.get('verified'))})
    from training_seen import seen_spots
    seen_regions = {}
    for spot in seen_spots(names, regions, by_sub, admin1, areas):
        pano, region, cc = spot['panoId'], spot['region'], spot['countryCode']
        seen_regions[pano] = region
        if pano in used:
            continue
        used.add(pano)
        if region not in regions:
            regions[region] = {'country': names[cc], 'iso2': cc, 'parent': names[cc], 'studyOnly': True}
        label = labels.get(pano, {})
        view = label.get('view', spot)
        setting = label.get('setting') or settings.get(pano)
        if (label.get('indoor') or label.get('urbanFlag') or setting in ('urban', 'suburban')
                or settings.get(pano) in ('urban', 'suburban')):
            skipped['seenUrbanOrIndoor'] += 1
            continue
        magnifiers = annotations(label, sources, region)
        locations.append({'id': 'pano:' + pano, 'panoId': pano, 'lat': spot['lat'], 'lng': spot['lng'],
            'heading': view.get('heading') or 0, 'pitch': view.get('pitch') or 0, 'zoom': 0, 'fov': 90,
            'country': names[cc], 'region': region, 'admin1': spot['admin1'], 'split': 'seen',
            'skillIds': [skill_id(cc, region)], 'assessmentEligible': False,
            'rural': setting == 'rural' if setting else None,
            'ruralStatus': setting or 'unlabelled', 'seenSource': spot['seenSource'],
            'regionAssignment': spot['regionAssignment'], 'image': label.get('image') or image_url(view),
            'metas': magnifiers, 'metaCount': len(magnifiers),
            'vegetation': label.get('vegetation', ''), 'regionConsistency': label.get('regionConsistency', ''),
            'verified': bool(label.get('verified'))})
    from training_images import states, view_key
    thumb_states = states()
    for loc in locations:
        loc['thumbOk'] = thumb_states.get(view_key(loc), {}).get('ok')
    skipped['badThumbnail'] = sum(l['thumbOk'] is False for l in locations)
    locations = [l for l in locations if l['thumbOk'] is not False]
    active = {l['region'] for l in locations}
    studies = collections.Counter(l['region'] for l in locations if l['split'] == 'study')
    verified_studies = collections.Counter(l['region'] for l in locations if l['split'] == 'study' and l['verified'])
    seen_studies = collections.Counter(l['region'] for l in locations if l['split'] in ('study', 'seen'))
    playable = {l['region'] for l in locations if l['split'] in ('drill', 'probe')}
    for region in active:
        if region != regions[region]['country'] and seen_studies[region] < 4:
            regions[region] = {**regions[region], 'studyFallbackCountry': regions[region]['country']}
    skills = [{'id': skill_id(info['iso2'], region), 'title': region, 'phase': 'Regions', 'prerequisites': [],
               'region': region, 'country': info['country'], 'practiceFamily': info['iso2'].lower()}
              for region, info in sorted(regions.items()) if region in active]
    rounds = load(HERE / 'duels/rounds.json', [])
    losses = []
    for r in rounds:
        if not r.get('lost'):
            continue
        cc, pano = r['countryCode'], official_id(r['view']['panoId'])
        if not pano:
            continue
        match = re.search(r'\(([A-Z]{2}-[^)]+)\)', r.get('subdivision') or '')
        region, _ = assignment(cc, [match.group(1)] if match else [], names, by_sub)
        region = seen_regions.get(pano, region)
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
    used_metas = {m['metaId'] for loc in locations for m in loc['metas'] if m['metaId'] in sources}
    used_metas.update(i for loss in losses for i in loss['metaIds'])
    footprints = tip_footprints(used_metas, sources, admin1, aliases)
    meta_table = {i: {**{k: v for k, v in sources[i].items() if k not in ('text', 'subdivisions')},
                      'appliesToAdmin1': sources[i].get('subdivisions') or [],
                      'footprint': footprints.get(i)} for i in sorted(used_metas)}
    pack = {'id': 'training', 'title': 'Training', 'subject': 'GeoGuessr', 'schemaVersion': 1,
        'scheduler': 'deal', 'practiceMapId': practice_map, 'answerAreaLabel': 'Region', 'thumbSize': [640, 400],
        'gameSettings': {'forbidMoving': True, 'forbidRotating': False, 'forbidZooming': False, 'timeLimit': 60},
        'acow': {names[cc]: w / sum(weights.values()) for cc, w in weights.items() if cc in names},
        'focus': focus(rounds, weights, names, tries), 'regionFeatures': areas, 'regions': regions,
        'skills': skills, 'metas': meta_table,
        'locations': locations, 'features': feature_maps(regions, weights, names), 'duelLosses': losses}
    path = OUT / 'pack.json'
    previous = load(path, {})
    before = {k: v for k, v in previous.items() if k != 'contentRevision'}
    # Focus timestamp is metadata, not a content change that forces a full cache refresh.
    if before.get('focus'):
        before['focus'] = {**before['focus'], 'computedAt': pack['focus']['computedAt']}
    pack['contentRevision'] = previous.get('contentRevision', 0) + (before != pack)
    atomic(path, pack)
    meta_bearing = collections.Counter(l['region'] for l in locations
        if l['split'] in ('study', 'seen') and l['rural'] is True and l['verified'] and l['metaCount'])
    top20 = set(sorted(weights, key=lambda c: -weights[c])[:20])
    top20_counts = {r: meta_bearing[r] for r, info in regions.items()
                    if info['iso2'] in top20 and not info.get('studyOnly')}
    game_counts = collections.Counter(l['region'] for l in locations if l['split'] in ('drill', 'probe'))
    top40_counts = {r: game_counts[r] for r, info in regions.items()
                    if info['iso2'] in top and not info.get('studyOnly')}
    report = {'pack': str(path), 'locations': len(locations), 'splits': dict(collections.Counter(l['split'] for l in locations)),
        'countries': len({l['country'] for l in locations}), 'regions': len(active),
        'focus': pack['focus'], 'labelledLocations': sum(l['verified'] for l in locations),
        'verifiedLabelRecords': len(labels), 'labelledPerCountry': dict(collections.Counter(
            r['view']['country'] for r in labels.values())), 'unlabelledTail': sum(l['rural'] is None for l in locations),
        'metaBearingStudySeenPerRegion': dict(meta_bearing), 'top20MetaBearingPerRegion': top20_counts,
        'playablePerRegion': dict(game_counts), 'top40PlayablePerRegion': top40_counts,
        'playableRegionMin': min(top40_counts.values(), default=0),
        'playableRegionMedian': statistics.median(top40_counts.values()) if top40_counts else 0,
        'verifiedMetaLocations': sum(bool(l['metaCount']) for l in locations),
        'thumbOkFalse': skipped['badThumbnail'], 'thumbUnknown': sum(l['thumbOk'] is None for l in locations),
        'metaFootprints': sum(bool(m.get('footprint')) for m in meta_table.values()),
        'metaAdmin1WithoutFootprint': [mid for mid, m in meta_table.items()
                                     if m.get('appliesToAdmin1') and not m.get('footprint')],
        'featureMaps': len(pack['features']), 'skipped': dict(skipped), 'contentRevision': pack['contentRevision'],
        'studyPerRegion': dict(studies), 'verifiedStudyPerRegion': dict(verified_studies),
        'studySeenPerRegion': dict(seen_studies),
        'regionsBelowFourStudySeen': {r: seen_studies[r] for r in sorted(playable) if seen_studies[r] < 4},
        'seenCountryOnly': sum(l.get('regionAssignment') == 'country-only' for l in locations)}
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
        schema_paths = []

        def fail_model(command, **kwargs):
            schema_paths.append(Path(command[command.index('--output-schema') + 1]))
            raise TimeoutError('test deadline')

        with patch.object(label.curate.subprocess, 'run', side_effect=fail_model):
            try:
                label.curate.ask('test', {})
                assert False, 'Model timeout must propagate'
            except TimeoutError:
                pass
        assert schema_paths and all(not p.exists() for p in schema_paths)
        import training_seen
        import training_seed
        import training as training_module
        from types import SimpleNamespace
        region = 'US — Test'
        fake_regions = {region: {'iso2': 'US', 'country': 'US'}}
        fake_admin1 = {'US-X': ('Test', 'US', [])}
        fake_geo = ({'US': 'US'}, fake_regions, {'US-X': region}, {}, fake_admin1, {})
        (folder / 'acow').mkdir()
        (folder / 'duels').mkdir()
        (folder / 'acow/weights.json').write_text(json.dumps({'countries': {'US': 100}}))
        (folder / 'duels/rounds.json').write_text(json.dumps([{
            'view': {'panoId': ('a' * 22).encode().hex(), 'lat': 0, 'lng': 0},
            'countryCode': 'US', 'country': 'US', 'subdivision': 'Test (US-X)',
            'lost': True, 'theirScore': 5000, 'myScore': 0, 'id': 'test'}]))
        (folder / 'region-features.json').write_text(json.dumps({'features': []}))
        with patch.object(label, 'HERE', folder), patch.object(label, 'OUT', folder), patch.object(
                label, 'catalogue', return_value=fake_geo), patch.object(label, 'pool_spots', return_value=iter(())), patch.object(
                training_seen, 'seen_spots', return_value=iter([{'panoId': 'a' * 22}, {'panoId': 'b' * 22}])) as seen:
            result = list(label.spots(0, 1, True, 2))
            assert [r['panoId'] for r in result] == ['a' * 22, 'b' * 22]
            assert seen.call_args.args[3] is fake_admin1
        (folder / 'gap/pools').mkdir(parents=True)
        (folder / 'gap/pools/US-locations.json').write_text(json.dumps({'customCoordinates': [
            {'panoId': c * 22, 'extra': {'tags': ['US-X']}} for c in 'ab']}))
        with patch.object(label, 'HERE', folder), patch.object(
                training_module, 'excluded', return_value={'a' * 22}), patch.object(
                training_module, 'attempts', return_value=[]):
            result = list(label.pool_spots(2, {'US': 'US'}, {'US-X': region}, {'US': 100}))
            assert [s['panoId'] for s in result] == ['b' * 22]
        (folder / 'training').mkdir()
        (folder / 'training/region-features.json').write_text(json.dumps({'features': []}))
        photos = [{'panoId': c * 22, 'countryCode': 'US', 'country': 'US', 'region': region,
                   'kind': 'seen', 'admin1': 'US-X'} for c in 'abcdef']
        latest = {s['panoId']: {'metas': [{'metaId': 'cue'}], 'qualityVersion': 2, 'verified': True,
                  'setting': 'rural', 'view': {'region': region, 'panoId': s['panoId']}} for s in photos[:4]}
        with patch.object(training_seed, 'HERE', folder), patch.object(
                training_seed, 'seen_spots', side_effect=lambda *a: iter(photos)), patch.object(
                training_module, 'excluded', return_value=set()), patch.object(training_module, 'attempts', return_value=[]):
            jobs, counts, _, counted = training_seed.source_jobs(
                SimpleNamespace(pool_limit=0), *fake_geo[:3], fake_admin1, {'cue': {}}, latest, {})
            assert not jobs and counts[region] == 4 and len(counted[region]) == 4
            jobs, counts, _, _ = training_seed.source_jobs(
                SimpleNamespace(pool_limit=0), *fake_geo[:3], fake_admin1, {'cue': {}}, latest,
                {photos[0]['panoId']: 'suburban'})
            assert counts[region] == 3 and all(s['panoId'] != photos[0]['panoId'] for s in jobs)
            jobs, counts, _, _ = training_seed.source_jobs(
                SimpleNamespace(pool_limit=0), *fake_geo[:3], fake_admin1, {}, {}, {})
            assert len(jobs) == 6 and counts[region] == 0
        assert training_seed.batch_limit(0, 8) == 6
        assert training_seed.batch_limit(3, 8) == 3
        assert training_seed.batch_limit(4, 8) == 0
        with patch.object(label, 'CALLS', 2), patch.object(label, 'CALL_LIMIT', 2), patch.object(label.curate, 'ask') as ask:
            try:
                label.ask('test', {}, [], 'model', [])
                assert False, 'Budget must stop before a model call'
            except label.ModelBudgetExhausted:
                assert not ask.called
    view = {'panoId': 'a' * 22, 'heading': 0, 'pitch': 0, 'fov': 90}
    assert label.cache_key(view, [], {}) == label.cache_key({**view, 'kind': 'seen'}, [], {})
    assert label.cache_key(view, [], {}) != label.cache_key({**view, 'heading': 1}, [], {})
    assert official_id('AF1Qip' + 'x' * 40) is None
    assert official_id(('a' * 22).encode().hex()) == 'a' * 22
    query = parse_qs(urlsplit(image_url({'panoId': 'a' * 22, 'heading': 15, 'pitch': 10})).query)
    assert query['pitch'] == ['-10.00'] and query['thumbfov'] == ['90']
    assert 'yaw=0.00' in image_url({'panoId': 'a' * 22, 'heading': None, 'pitch': None})
    pack = load(OUT / 'pack.json')
    if pack:
        ids = {l['panoId'] for l in pack['locations']}
        assert len(ids) == len(pack['locations'])
        assert all(official_id(l['panoId']) == l['panoId'] for l in pack['locations'])
        assert all(l['rural'] is True or l['rural'] is None for l in pack['locations'])
        fresh = [l for l in pack['locations'] if l['split'] != 'seen']
        assert not {l['panoId'] for l in fresh}.intersection(excluded(attempts(), load(ROOT / '.fieldwork.local.json', {})))
        assert all(l['split'] == split(l['panoId']) for l in fresh)
        assert all(l['rural'] in (True, None) for l in fresh)
        assert all(not l['assessmentEligible'] for l in pack['locations'] if l['split'] == 'seen')
        assert all(not l['metas'] or l['verified'] for l in pack['locations'])
        assert all(box_ok(m['box']) for l in pack['locations'] for m in l['metas'])
        assert all(l['metaCount'] == len(l['metas']) for l in pack['locations'])
        assert all(l['thumbOk'] is not False for l in pack['locations'])
        assert all(m['metaId'] is None or m['metaId'] in pack['metas']
                   for l in pack['locations'] for m in l['metas'])
        assert all(m['narrowsTo'] and m['vs'] and (m['kind'] != 'object' or m['box'][2] * m['box'][3] <= .2)
                   for l in pack['locations'] for m in l['metas'])
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
        import fcntl
        OUT.mkdir(parents=True, exist_ok=True)
        with (OUT / 'build.lock').open('w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            build()
