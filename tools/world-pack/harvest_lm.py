#!/usr/bin/env python3
"""Learnable Meta harvest for the world map.

  harvest_lm.py metas   # public meta lists of every shared map -> lm/metas/<mapId>.json
  harvest_lm.py index   # flat meta list with guide country -> lm/matches.json (curate.py maps metas to tips)
  harvest_lm.py wanted  # metas mapped to foundational/useful tips -> lm/export-wanted.json
  harvest_lm.py export  # per meta: add to scratch personal map, export with token, remove -> lm/exports.jsonl

export needs ~/.config/fieldwork/lm.env (LM_TOKEN, LM_COOKIE, LM_POOL_ID, LM_POOL_GG). The scratch pool is left empty.
Only metas from maps with isShared=true are used (LM rejects others server-side too).
"""
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import text
from text import HERE, WORK

LM = HERE / 'lm'
BASE = 'https://learnablemeta.com'
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'



def request(path, method='GET', body=None, headers=None, tries=4):
    h = {'User-Agent': UA, **(headers or {})}
    for attempt in range(tries):
        try:
            req = urllib.request.Request(BASE + path, data=body, method=method, headers=h)
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < tries - 1:
                time.sleep(5 * 2 ** attempt)
                continue
            raise


def unflatten(arr):
    """SvelteKit devalue payload -> Python value."""
    memo = {}

    def h(i):
        if i < 0:
            return None
        if i in memo:
            return memo[i]
        v = arr[i]
        if isinstance(v, dict):
            out = memo[i] = {}
            out.update({k: h(j) for k, j in v.items()})
            return out
        if isinstance(v, list):
            if v and isinstance(v[0], str) and v[0] in ('Date', 'Set', 'Map', 'BigInt', 'RegExp'):
                return v[1] if len(v) > 1 else None
            out = memo[i] = []
            out.extend(h(j) for j in v)
            return out
        return v
    return h(0)


def fetch_metas():
    out = LM / 'metas'
    out.mkdir(parents=True, exist_ok=True)
    maps = json.loads((WORK / 'location-database/learnable/public-maps-2026-10-22.json').read_text())['maps']
    for m in maps:
        path = out / f"{m['geoguessrId']}.json"
        if not m['isShared'] or path.exists():
            continue
        doc = json.loads(request(f"/maps/{m['geoguessrId']}/__data.json"))
        page = unflatten(next(n for n in doc['nodes'] if n and n.get('type') == 'data')['data'])
        path.write_text(json.dumps({'map': m, 'metas': page['metaList']}, ensure_ascii=False))
        print(m['name'], len(page['metaList']), flush=True)
        time.sleep(1)


def index():
    """Flat list of every shared meta with its guide country (the text before ' - ' in its name) -> lm/matches.json."""
    titles = {' '.join(text.words(c['title'])) for c in json.loads((HERE / 'clues.json').read_text())}
    aliases = {'usa': 'united states of america', 'united states': 'united states of america', 'us': 'united states of america',
               'czech republic': 'czechia', 'turkiye': 'turkey', 'israel': 'israel west bank', 'west bank': 'israel west bank',
               'uk': 'united kingdom', 'swaziland': 'eswatini'}
    rows = []
    for f in sorted((LM / 'metas').glob('*.json')):
        doc = json.loads(f.read_text())
        for meta in doc['metas']:
            country = ' '.join(text.words(meta['name'].split(' - ')[0]))
            country = aliases.get(country, country)
            rows.append({'metaId': meta['id'], 'mapId': doc['map']['geoguessrId'], 'mapName': doc['map']['name'],
                         'metaName': meta['name'], 'country': country if country in titles else None,
                         'locationsCount': int(meta.get('locationsCount') or 0), 'note': meta['note'],
                         'footer': meta.get('footer'), 'images': meta.get('images') or []})
    (LM / 'matches.json').write_text(json.dumps(rows, ensure_ascii=False))
    print(json.dumps({'metas': len(rows), 'countryKnown': sum(r['country'] is not None for r in rows)}))


def export(wanted):
    env = dict(l.split('=', 1) for l in (Path.home() / '.config/fieldwork/lm.env').read_text().split())
    pool, pool_gg = env['LM_POOL_ID'], env['LM_POOL_GG']
    action_headers = {'Cookie': env['LM_COOKIE'], 'Origin': BASE, 'x-sveltekit-action': 'true',
                      'Content-Type': 'application/x-www-form-urlencoded'}

    def action(path, fields):
        res = json.loads(request(path, 'POST', urllib.parse.urlencode(fields).encode(), action_headers))
        if res.get('type') != 'success':
            raise RuntimeError(f'{path}: {res}')

    def locations():
        doc = json.loads(request(f'/api/userscript/map/{pool_gg}/locations', headers={'Authorization': 'Bearer ' + env['LM_TOKEN']}))
        return doc['customCoordinates']

    out = LM / 'exports.jsonl'
    done = {json.loads(l)['metaId'] for l in out.read_text().splitlines()} if out.exists() else set()
    inflight = LM / 'export-inflight.json'
    if inflight.exists():  # a killed run left its own meta in the scratch pool; remove only that one
        action(f'/personal/{pool}?/removeMetasFromPersonalMap', [('id', json.loads(inflight.read_text())['metaId'])])
        inflight.unlink()
    if locations():
        raise SystemExit(f'scratch pool {pool} is not empty; refusing to mix labels')
    todo = [w for w in wanted if w['metaId'] not in done]
    print(f'exporting {len(todo)} metas', flush=True)
    with open(out, 'a') as f:
        for i, w in enumerate(todo, 1):
            inflight.write_text(json.dumps(w))
            action(f"/maps/{w['mapId']}?/addMetasToPersonalMap", [('id', w['metaId']), ('mapId', pool)])
            try:
                locs = locations()
            finally:
                action(f'/personal/{pool}?/removeMetasFromPersonalMap', [('id', w['metaId'])])
                inflight.unlink()
            f.write(json.dumps({'metaId': w['metaId'], 'mapId': w['mapId'], 'locations': locs}) + '\n')
            f.flush()
            if i % 50 == 0:
                print(f'exported {i}/{len(todo)}', flush=True)
            time.sleep(0.5)


def wanted():
    """Every meta the small model mapped to a foundational or useful tip (labels/meta-tips.json, labels/curation.json)."""
    curation = json.loads((HERE / 'labels/curation.json').read_text())
    tier = {f'plonkit:{slug}:{r["tipId"]}': r['tier'] for slug, v in curation.items() for r in v['order']}
    rows = [{'metaId': m['metaId'], 'mapId': m['mapId'], 'topicId': m['topicId']}
            for v in json.loads((HERE / 'labels/meta-tips.json').read_text()).values() for m in v['metas']
            if m['topicId'] and m['locationsCount'] and tier.get(m['topicId']) in ('foundational', 'useful')]
    (LM / 'export-wanted.json').write_text(json.dumps(rows))
    print(f'{len(rows)} metas to export')


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'metas':
        fetch_metas()
    elif cmd == 'index':
        index()
    elif cmd == 'wanted':
        wanted()
    elif cmd == 'export':
        export(json.loads(Path(sys.argv[2]).read_text()))
