#!/usr/bin/env python3
"""Cached exact-view labels, independently checked against the image and cited tip.

WORLD_PACK_DATA=... python3 tools/world-pack/label.py run --pool-limit 3000
WORLD_PACK_DATA=... python3 tools/world-pack/label.py qa
Only `run` calls models. Budgets count attempted spots, including failed images.
"""
import argparse
import concurrent.futures as cf
import hashlib
import fcntl
import html
import json
import random
import re
import threading
import time
from collections import defaultdict
from urllib.parse import urlencode

import collect
import curate
from training_tips import candidates, tips_catalogue
from text import HERE
from training_regions import assignment, catalogue

OUT = HERE / 'training'
LABELER, VERIFIER = 'gpt-6.1-sol', 'gpt-6-astra'
VERSION = 2
LOCK = threading.Lock()
CALLS, CALL_LIMIT = 0, 2000


def rows(path):
    if path.exists():
        with path.open() as f:
            for line in f:
                if not line.endswith('\n'):
                    break  # Another process may currently be appending this last record.
                if line.strip():
                    yield json.loads(line)


def append(name, record):
    OUT.mkdir(parents=True, exist_ok=True)
    with LOCK, (OUT / name).open('a') as f:
        f.write(json.dumps(record, ensure_ascii=False) + '\n')
        f.flush()


def image_url(view):
    return 'https://streetviewpixels-pa.googleapis.com/v1/thumbnail?' + urlencode({
        'cb_client': 'maps_sv.share', 'panoid': view['panoId'], 'w': 640, 'h': 400,
        'yaw': f"{view.get('heading', 0):.2f}", 'pitch': f"{-view.get('pitch', 0):.2f}", 'thumbfov': 90})




def pool_spots(limit, names, by_sub, weights):
    """Weighted allocation, round-robin within macro-regions, one country pool in RAM."""
    top = sorted(weights, key=lambda c: -weights[c])[:40]
    total = sum(weights[c] * (1.5 if c == 'US' else 1) for c in top)
    remaining = limit
    for n, cc in enumerate(top):
        goal = min(remaining, max(12, round(limit * weights[cc] * (1.5 if cc == 'US' else 1) / total)))
        if n == len(top) - 1:
            goal = remaining
        path = HERE / 'gap/pools' / f'{cc}-locations.json'
        if not path.exists():
            continue
        doc = json.loads(path.read_text())
        groups = defaultdict(list)
        for loc in doc.get('customCoordinates', []) if isinstance(doc, dict) else doc:
            region, admin1 = assignment(cc, loc.get('extra', {}).get('tags', []), names, by_sub)
            if region and loc.get('panoId'):
                groups[region].append({**loc, 'countryCode': cc, 'country': names[cc],
                                       'region': region, 'admin1': admin1, 'kind': 'pool'})
        for region, spots in groups.items():
            random.Random(region).shuffle(spots)
        selected = []
        while groups and len(selected) < goal:
            for region in list(groups):
                selected.append(groups[region].pop())
                if not groups[region]:
                    del groups[region]
                if len(selected) == goal:
                    break
        remaining -= len(selected)
        yield from selected


def spots(pool_limit, duel_limit, all_duels=False):
    names, regions, by_sub, _, _ = catalogue()
    weights = json.loads((HERE / 'acow/weights.json').read_text())['countries']
    rounds = json.loads((HERE / 'duels/rounds.json').read_text())
    rounds = sorted((r for r in rounds if all_duels or r.get('lost')), key=lambda r: (
        r.get('countryCode') != 'US', not r.get('lost'), -max(0, r['theirScore'] - r['myScore'])))
    seen = set()
    for r in rounds[:duel_limit]:
        v = r['view']
        if not v.get('panoId') or v['panoId'] in seen:
            continue
        seen.add(v['panoId'])
        cc = r['countryCode']
        tag = re.search(r'\(([A-Z]{2}-[^)]+)\)', r.get('subdivision') or '')
        region, admin1 = assignment(cc, [tag.group(1)] if tag else [], names, by_sub)
        yield {**v, 'countryCode': cc, 'country': names.get(cc, r['country']),
               'region': region, 'admin1': admin1, 'kind': 'duel', 'roundId': r['id']}
    for spot in pool_spots(pool_limit, names, by_sub, weights):
        if spot['panoId'] not in seen:
            seen.add(spot['panoId'])
            yield spot


def pilot_spots():
    """Fixed composition: 15 fresh US pool spots, 10 losses, 15 other top-country spots."""
    saved = OUT / 'pilot-spots.json'
    if saved.exists():
        return json.loads(saved.read_text())
    chosen, counts = [], defaultdict(int)
    targets = {'US': 15, 'BR': 3, 'RU': 3, 'AU': 3, 'IN': 3, 'ID': 3}
    for spot in spots(3000, 3000):
        bucket = 'duel' if spot['kind'] == 'duel' else spot['countryCode']
        goal = 10 if bucket == 'duel' else targets.get(bucket, 0)
        if counts[bucket] >= goal:
            continue
        try:
            if collect.thumb(spot, 90) is None:
                continue
        except Exception:
            continue
        chosen.append(spot)
        counts[bucket] += 1
        if len(chosen) == 40:
            break
    if len(chosen) != 40:
        raise RuntimeError(f'Pilot requires 40 spots, found {len(chosen)}')
    (OUT / 'pilot-spots.json').write_text(json.dumps(chosen, ensure_ascii=False, indent=2))
    return chosen


def box_ok(box):
    return (isinstance(box, list) and len(box) == 4 and all(isinstance(x, (int, float)) for x in box)
            and 0 <= box[0] < 1 and 0 <= box[1] < 1 and 0 < box[2] <= 1 - box[0] + 1e-6
            and 0 < box[3] <= 1 - box[1] + 1e-6)


def schemas():
    string = {'type': 'string'}
    meta = {'type': 'object', 'additionalProperties': False,
            'required': ['metaId', 'what', 'box', 'confidence', 'narrowsTo', 'vs', 'kind'], 'properties': {
                'metaId': string, 'what': string, 'box': {'type': 'array', 'items': {'type': 'number'},
                'minItems': 4, 'maxItems': 4}, 'confidence': {'type': 'number'},
                'narrowsTo': {'type': 'array', 'items': string}, 'vs': {'type': 'array', 'items': string},
                'kind': {'type': 'string', 'enum': ['object', 'landscape']}}}
    label = curate.schema({'n': {'type': 'integer'}, 'setting': {'type': 'string',
        'enum': ['rural', 'suburban', 'urban']}, 'vegetation': string, 'regionConsistency': string,
        'metas': {'type': 'array', 'items': meta}})
    verify = curate.schema({'n': {'type': 'integer'}, 'keep': {'type': 'array', 'items': {'type': 'integer'}},
        'settingAgrees': {'type': 'boolean'}, 'vegetationAgrees': {'type': 'boolean'},
        'regionConsistencyAgrees': {'type': 'boolean'}})
    return label, verify


def ask(prompt, schema, images, model, keys):
    global CALLS
    for attempt in range(3):
        with LOCK:
            if CALLS >= CALL_LIMIT:
                raise RuntimeError('Per-run model-call budget exhausted')
            CALLS += 1
        append('calls.jsonl', {'at': time.time(), 'model': model, 'keys': keys, 'attempt': attempt})
        try:
            return curate.ask(prompt, schema, images, model=model)
        except Exception as e:
            message = str(e)
            append('errors.jsonl', {'at': time.time(), 'keys': keys, 'error': message[:300]})
            if attempt == 2 or not any(s in message.lower() for s in ('429', 'rate', 'timeout', 'timed out', 'overload')):
                raise
            time.sleep(15 * 2 ** attempt)


def run(args):
    global CALLS, CALL_LIMIT
    CALLS, CALL_LIMIT = 0, args.max_calls
    OUT.mkdir(parents=True, exist_ok=True)
    names, regions, by_sub, _, admin1 = catalogue()
    metas, by_country = tips_catalogue(names, regions, by_sub, admin1)
    done = {r['fingerprint'] for r in rows(OUT / 'labels.jsonl')}
    drafts = {r['fingerprint']: r for r in rows(OUT / 'drafts.jsonl')}
    failures = defaultdict(int)
    for r in rows(OUT / 'failures.jsonl'):
        failures[r['fingerprint']] += 1
    jobs = defaultdict(list)
    pending = 0
    selected = pilot_spots() if args.pilot else spots(args.pool_limit, args.duel_limit, args.all_duels)
    for spot in selected:
        spot.update({'heading': spot.get('heading') or 0, 'pitch': spot.get('pitch') or 0, 'fov': 90})
        tips = candidates(spot, metas, by_country)
        fingerprint = hashlib.sha256(json.dumps([VERSION, spot, {i: metas[i] for i in tips},
                                                 LABELER, VERIFIER], sort_keys=True).encode()).hexdigest()
        if fingerprint not in done and failures[fingerprint] < 3:
            jobs[spot['countryCode']].append((fingerprint, spot, tips))
            pending += 1
            if pending >= args.new_limit:
                break
    label_schema, verify_schema = schemas()
    batches = [items[k:k + args.batch_size] for items in jobs.values() for k in range(0, len(items), args.batch_size)]
    print(json.dumps({'pending': sum(map(len, batches)), 'batches': len(batches), 'workers': args.workers,
                      'poolCap': args.pool_limit, 'duelCap': args.duel_limit}), flush=True)

    def one(batch):
        keys = [key for key, _, _ in batch]
        if (OUT / 'PAUSE').exists():
            return 0
        try:
            images, active = [], []
            for key, spot, tips in batch:
                image = collect.thumb(spot, 90)
                if image:
                    images.append(image)
                    active.append((key, spot, tips))
                else:
                    append('failures.jsonl', {'fingerprint': key, 'panoId': spot['panoId'], 'error': 'unavailable'})
            if not active:
                return 0
            # Repeat the exact cited text for both independent model passes.
            source_ids = sorted({i for _, _, tips in active for i in tips})
            sources = {i: {k: metas[i][k] for k in ('title', 'text', 'source', 'appliesTo', 'subdivisions')}
                       for i in source_ids}
            context = json.dumps({'images': [{'n': n, 'country': s['country'], 'region': s['region'],
                'admin1': s['admin1'], 'allowedTips': tips} for n, (_, s, tips) in enumerate(active, 1)],
                'tips': sources}, ensure_ascii=False)
            missing = any(k not in drafts for k, _, _ in active)
            if missing:
                prompt = ('Label each numbered image (640x400, same image order). Return at most TWO '
                    'DIAGNOSTIC GeoGuessr magnifiers, or honestly NONE. A diagnostic cue must narrow a big '
                    'country to a macro-region/state group, or distinguish its country from plausible '
                    'look-alike NEIGHBOURS. Generic road lines, green trees, dry grass, rural roads or '
                    'nationwide architecture are NOT magnifiers. Put generic scenery in vegetation instead. '
                    'Prefer the supplied geographically applicable Plonk It or Learnable Meta tips. '
                    'Cite exact allowedTips IDs. Empty metaId is allowed only for a clearly readable '
                    'geographic identifier, never an uncited distribution claim. narrowsTo must name '
                    'the specific supplied macro-regions or countries the feature supports. vs must '
                    'name plausible macro-regions/countries it rules out, justified by the cited text. '
                    'Do not use unseen details or outside geographic knowledge to invent exclusivity. '
                    'Object boxes must TIGHTLY enclose the actual pole/sign/bollard/line etc, area <=20% '
                    'of the full frame. At most ONE landscape/species/soil cue per image, and only if '
                    'the source establishes a regional diagnostic range. Boxes [x,y,width,height] '
                    'are image fractions. Check the actual subdivision against every regional claim. '
                    'Zero magnifiers is better than a generic one. Add one concise vegetation note, '
                    'a cautious region-consistency note, and rural/suburban/urban setting.\\n' + context)
                result = ask(prompt, label_schema, images, LABELER, keys)
                by_n = {r['n']: r for r in result['results']}
                for n, (key, _, _) in enumerate(active, 1):
                    if key not in drafts and n in by_n:
                        drafts[key] = {'fingerprint': key, 'draft': by_n[n]}
                        append('drafts.jsonl', drafts[key])
            claims = [{'n': n, **drafts[key]['draft']} for n, (key, _, _) in enumerate(active, 1)]
            for n, claim in enumerate(claims, 1):
                claim['n'] = n
            prompt = ('Independently verify these proposed DIAGNOSTIC magnifiers against the image AND '
                'the exact cited tip text. Keep zero-based meta indices ONLY when the cue is visibly '
                'correct AND useful for distinguishing the named narrowsTo from plausible vs places. '
                'REJECT generic road markings, generic woodland/scrub/farmland, vague architecture, '
                'or cues widespread throughout the country and its look-alike neighbours. Mere truth '
                'is insufficient: reject non-diagnostic claims. Check geographic scope against the '
                'actual subdivision. Reject unsupported exclusivity and wrong source matches. Object '
                'boxes must be tight and <=20% of the frame, not huge boxes around half the road or '
                'forest. At most one genuinely regional landscape cue. An empty keep list is valid. '
                'Observed claims need a clearly readable geographic identifier, not assumed range. '
                'Check setting, vegetation and consistency separately.\\n' + context + '\\nClaims:\\n' +
                json.dumps(claims, ensure_ascii=False))
            verified = {r['n']: r for r in ask(prompt, verify_schema, images, VERIFIER, keys)['results']}
            count = 0
            for n, (key, spot, tips) in enumerate(active, 1):
                if n not in verified:
                    raise ValueError('Verifier omitted image')
                draft, verdict = drafts[key]['draft'], verified[n]
                accepted = []
                for i in verdict['keep']:
                    if not 0 <= i < len(draft['metas']):
                        continue
                    m = draft['metas'][i]
                    source = metas.get(m['metaId']) if m['metaId'] in tips else None
                    if (m['metaId'] and source is None) or not box_ok(m['box']) or not .75 <= m['confidence'] <= 1:
                        continue
                    if not m['narrowsTo'] or not m['vs'] or set(m['narrowsTo']).intersection(m['vs']):
                        continue
                    if m['kind'] == 'object' and m['box'][2] * m['box'][3] > .2:
                        continue
                    if m['kind'] == 'landscape' and any(a['kind'] == 'landscape' for a in accepted):
                        continue
                    if source and set(m['vs']).intersection(source['appliesTo']):
                        continue
                    accepted.append({**m, 'metaId': m['metaId'] or None,
                                     'source': source['source'] if source else 'observed'})
                rec = {'fingerprint': key, 'view': spot, 'panoId': spot['panoId'], 'image': image_url(spot),
                       'metas': accepted, 'vegetation': draft['vegetation'] if verdict['vegetationAgrees'] else '',
                       'regionConsistency': draft['regionConsistency'] if verdict['regionConsistencyAgrees'] else '',
                       'setting': draft['setting'] if verdict['settingAgrees'] else None,
                       'verified': True, 'qualityVersion': VERSION, 'labeler': LABELER,
                       'verifier': VERIFIER, 'at': time.time()}
                append('labels.jsonl', rec)
                count += 1
            return count
        except Exception as e:
            for key, spot, _ in batch:
                append('failures.jsonl', {'fingerprint': key, 'panoId': spot['panoId'], 'error': str(e)[:300]})
            print('batch failed: ' + str(e)[:180], flush=True)
            return 0
    completed = 0
    with cf.ThreadPoolExecutor(args.workers) as executor:
        for count in executor.map(one, batches):
            completed += count
            if count:
                print(json.dumps({'newVerified': completed, 'at': time.time()}), flush=True)


def qa(pilot=False):
    latest = {r['panoId']: r for r in rows(OUT / 'labels.jsonl') if r.get('qualityVersion') == VERSION}
    if pilot:
        expected = json.loads((OUT / 'pilot-spots.json').read_text())
        sample = [latest[s['panoId']] for s in expected if s['panoId'] in latest]
    else:
        sample = random.Random(20261103).sample(list(latest.values()), min(60, len(latest)))
    stem = 'qa-pilot' if pilot else 'qa'
    cards = []
    for r in sample:
        boxes = ''.join('<div class="box" style="left:%s%%;top:%s%%;width:%s%%;height:%s%%">%s</div>' % (
            *(100 * x for x in m['box']), n) for n, m in enumerate(r['metas'], 1))
        claims = '<br>'.join(html.escape(f"{n}. {m['what']} [{m['source']}, {m['metaId']}, {m['confidence']}] "
            f"narrowsTo={m.get('narrowsTo', [])}, vs={m.get('vs', [])}") for n, m in enumerate(r['metas'], 1))
        cards.append('<article><h2>' + html.escape(r['view']['country'] + ': ' + str(r['view']['region'])) +
            '</h2><div class="photo"><img loading="lazy" src="' + html.escape(r['image']) + '">' + boxes +
            '</div><p>' + claims + '</p><p>' + html.escape(r['vegetation']) + '</p><p>' +
            html.escape(r['regionConsistency']) + '</p><code>' + html.escape(r['panoId']) + '</code></article>')
    page = '<!doctype html><meta charset="utf-8"><title>Training label QA</title><style>' + (
        'body{font:15px system-ui;max-width:1400px;margin:30px auto;background:#fafafa}'
        'main{display:grid;grid-template-columns:1fr 1fr;gap:24px}article{background:white;padding:16px}'
        '.photo{position:relative}.photo img{display:block;width:100%}.box{position:absolute;border:2px solid red;'
        'box-sizing:border-box;color:white;text-shadow:0 0 3px black}h2{font-size:18px}code{overflow-wrap:anywhere}') + (
        '</style><h1>Training label QA sample</h1><p>Independent model verification is not a human accuracy score.</p>'
        '<main>') + ''.join(cards) + '</main>'
    (OUT / (stem + '.html')).write_text(page)
    (OUT / (stem + '-sample.json')).write_text(json.dumps(sample, ensure_ascii=False, indent=2))
    print(json.dumps({'qa': str(OUT / (stem + '.html')), 'sample': len(sample)}))


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('command', choices=['run', 'qa'])
    ap.add_argument('--pool-limit', type=int, default=3000)
    ap.add_argument('--duel-limit', type=int, default=3000)
    ap.add_argument('--all-duels', action='store_true')
    ap.add_argument('--pilot', action='store_true')
    ap.add_argument('--new-limit', type=int, default=6000)
    ap.add_argument('--max-calls', type=int, default=2000)
    ap.add_argument('--workers', type=int, choices=range(1, 5), default=2)
    ap.add_argument('--batch-size', type=int, choices=range(1, 9), default=6)
    args = ap.parse_args()
    if not 0 <= args.pool_limit <= 3000 or not 0 <= args.duel_limit <= 3000:
        ap.error('Each spot cap must be between 0 and 3000')
    if not 1 <= args.new_limit <= 6000 or not 1 <= args.max_calls <= 2000:
        ap.error('New spots must be 1..6000 and model calls 1..2000')
    if args.command == 'run':
        OUT.mkdir(parents=True, exist_ok=True)
        with (OUT / 'label.lock').open('w') as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                ap.error('A labeling run is already active')
            run(args)
    else:
        qa(args.pilot)
