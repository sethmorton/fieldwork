#!/usr/bin/env python3
"""Review the competitive duel rounds you lost: which practicable Plonk It clue was visible that you should have used.

Personal data: everything is written under WORLD_PACK_DATA/duels/ (never in the repo).
  fetch     your competitive duels (GeoGuessr feed + game server), needs GG_NCFA (the _ncfa cookie) in the env
  lost      rounds where your team scored below the opponent
  classify  small model (CURATE_MODEL, default gpt-6-luna) looks at what you could see and names the clues you missed
  export    duels/missed-clues.json for the local build (`missedCluesPath` in .fieldwork.local.json)
Usage: WORLD_PACK_DATA=<caches> python3 tools/world-pack/duels.py fetch|lost|classify|export [LIMIT]
"""
import concurrent.futures as cf
import json
import os
import sys
import urllib.parse
import urllib.request

import collect
import curate
from text import HERE, WORK

OUT = HERE / 'duels'
FEED = 'https://www.geoguessr.com/api/v4/feed/private'
GAME = 'https://game-server.geoguessr.com/api/duels/'
MAX_CLUES = 3


def get(url):
    request = urllib.request.Request(url, headers={**collect.UA, 'Cookie': f"_ncfa={os.environ['GG_NCFA']}"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read())


def fetch():
    """Every competitive Duels/TeamDuels game in your feed, with its full round data (cached per game)."""
    raw = json.loads((OUT / 'raw.json').read_text()) if (OUT / 'raw.json').exists() else {'details': {}}
    raw['userId'] = get('https://www.geoguessr.com/api/v3/profiles')['user']['id']
    games, token = {}, ''
    while True:
        page = get(FEED + ('?paginationToken=' + urllib.parse.quote(token) if token else ''))
        for entry in page['entries']:
            items = json.loads(entry['payload']) if isinstance(entry['payload'], str) else entry['payload']
            for item in items if isinstance(items, list) else [{'time': entry['time'], 'payload': items}]:
                p = item['payload']
                if p.get('gameId') and p.get('competitiveGameMode', 'None') != 'None' and p.get('gameMode') in ('Duels', 'TeamDuels'):
                    games[p['gameId']] = {'gameId': p['gameId'], 'time': item['time'], 'gameMode': p['gameMode'],
                                          'competitive': p['competitiveGameMode']}
        token = page.get('paginationToken')
        if not token:
            break
    raw['games'] = sorted(games.values(), key=lambda g: g['time'])
    for game in raw['games']:
        if game['gameId'] not in raw['details']:
            raw['details'][game['gameId']] = get(GAME + game['gameId'])
    (OUT / 'raw.json').write_text(json.dumps(raw))
    print(json.dumps({'games': len(raw['games'])}))


def pano_id(encoded):
    """The game server sends panorama IDs as hex of their ASCII text."""
    try:
        return bytes.fromhex(encoded).decode('ascii')
    except ValueError:
        return encoded


def lost():
    raw = json.loads((OUT / 'raw.json').read_text())
    country_at = collect.bc.geolocator(json.loads((WORK / 'worldwide/countries-50m.geojson').read_text()))
    meta = {g['gameId']: g for g in raw['games']}
    rounds = []
    for game_id, game in raw['details'].items():
        mine = next((t for t in game['teams'] if any(p['playerId'] == raw['userId'] for p in t['players'])), None)
        if mine is None:
            continue
        others = [t for t in game['teams'] if t is not mine]
        for result in mine.get('roundResults', []):
            n = result['roundNumber']
            theirs = max((r['score'] for t in others for r in t.get('roundResults', []) if r['roundNumber'] == n), default=None)
            if theirs is None or result['score'] >= theirs:
                continue
            p = game['rounds'][n - 1]['panorama']
            mine_guess = result.get('bestGuess') or {}
            their_guess = min((r.get('bestGuess') or {} for t in others for r in t.get('roundResults', []) if r['roundNumber'] == n),
                              key=lambda g: g.get('distance', 1e12), default={})
            rounds.append({
                'id': f'duel:{game_id}:{n}', 'gameId': game_id, 'round': n, 'endTime': game['rounds'][n - 1].get('endTime'),
                'mode': meta.get(game_id, {}).get('competitive'), 'movement': game.get('movementOptions') or {},
                'view': {'panoId': pano_id(p['panoId']), 'lat': p['lat'], 'lng': p['lng'], 'heading': p.get('heading') or 0,
                         'pitch': p.get('pitch') or 0, 'zoom': p.get('zoom') or 0},
                'countryCode': (p.get('countryCode') or '').upper(), 'country': country_at(p['lat'], p['lng']),
                'myScore': result['score'], 'theirScore': theirs,
                'myGuess': {k: mine_guess.get(k) for k in ('lat', 'lng', 'distance')},
                'myGuessCountry': country_at(mine_guess['lat'], mine_guess['lng']) if mine_guess.get('lat') is not None else None,
                'theirDistance': their_guess.get('distance')})
    (OUT / 'lost.json').write_text(json.dumps(rounds))
    print(json.dumps({'games': len(raw['details']), 'lostRounds': len(rounds),
                      'wrongCountry': sum(r['myGuessCountry'] != r['country'] for r in rounds)}))


def frames(r):
    """What the player could see: the opening view only when rotation was forbidden (NMPZ), else four directions."""
    v = r['view']
    if r['movement'].get('forbidRotating'):
        views = [(v, collect.zoom_to_fov(v['zoom']))]
    else:
        views = [({**v, 'heading': (v['heading'] + 90 * k) % 360}, 90.0) for k in range(4)]
    return [path for path in (collect.thumb(view, fov) for view, fov in views) if path]


SCHEMA = {'type': 'object', 'additionalProperties': False, 'required': ['clues', 'missedNote'], 'properties': {
    'clues': {'type': 'array', 'items': {'type': 'object', 'additionalProperties': False,
                                         'required': ['tipId', 'frame', 'evidence'],
                                         'properties': {'tipId': {'type': 'string'}, 'frame': {'type': 'integer'},
                                                        'evidence': {'type': 'string'}}}},
    'missedNote': {'type': 'string'}}}


def classify(limit=None):
    rounds = json.loads((OUT / 'lost.json').read_text())[:limit]
    clues = {c['topicId']: c for c in json.loads((HERE / 'clues.json').read_text())}
    bank = json.loads((HERE / 'clue-bank.json').read_text())
    visual = json.loads((HERE / 'labels/visual.json').read_text())
    codes = {u['slug']: u.get('code') for u in json.loads(
        (WORK / 'location-database/foundations/all-guide-topic-inventory.json').read_text())['units']}
    by_code = {}
    for b in bank:
        if b['practice']:
            by_code.setdefault(codes.get(b['slug']), []).append(b['topicId'])
    out = OUT / 'classified.jsonl'
    done = {json.loads(l)['id'] for l in out.read_text().splitlines()} if out.exists() else set()
    todo = [r for r in rounds if r['id'] not in done]

    def one(r):
        candidates = by_code.get(r['countryCode'], [])
        images = frames(r)
        if not candidates or not images:
            return {'id': r['id'], 'clues': [], 'missedNote': '', 'skipped': 'no practicable clues' if images else 'panorama gone'}
        lines = [f"[{t.split(':')[2]}] {clues[t]['text'][:240]}" + (f" (Guide image shows: {visual[t]['lookFor']})" if visual.get(t, {}).get('lookFor') else '')
                 for t in candidates]
        seen = 'only frame 1 (no moving, no turning)' if r['movement'].get('forbidRotating') else f'frames 1-{len(images)} (it could turn around)'
        guess = (f"The player guessed {r['myGuessCountry'] or 'somewhere'} at {round((r['myGuess']['distance'] or 0) / 1000)} km away"
                 if r['myGuess'].get('lat') is not None else 'The player did not guess')
        prompt = (f"A GeoGuessr player lost this competitive duel round. The true location is in {r['country']} "
                  f"({r['view']['lat']:.3f}, {r['view']['lng']:.3f}). {guess}; the opponent was "
                  f"{round((r['theirDistance'] or 0) / 1000)} km away. The player could see {seen}.\n"
                  f"From the numbered Plonk It clues for {r['country']} below, list only clues that are actually visible in the "
                  f"frames and would have pointed to the true region (or country), best first, at most {MAX_CLUES}. For each give "
                  "the tip id in brackets, the frame number and what exactly is visible and where in the frame. Only list a clue "
                  "when the specific thing it describes is clearly there (a road-line clue needs visible road lines, a pole clue a "
                  "visible pole of that type). Do not list clues that are merely consistent with the scene. Return an empty list "
                  "if none is visible. missedNote: one plain sentence on what the player should have noticed (empty if nothing).\n\n"
                  + '\n'.join(lines))
        try:
            answer = curate.ask(prompt, SCHEMA, images)
        except Exception:
            return None  # retried on the next run
        valid, picked = {t.split(':')[2]: t for t in candidates}, {}
        for c in answer['clues']:
            tip = c['tipId'].strip('[] ')
            if tip in valid and 1 <= c['frame'] <= len(images) and valid[tip] not in picked and len(picked) < MAX_CLUES:
                picked[valid[tip]] = {'topicId': valid[tip], 'frame': c['frame'], 'evidence': c['evidence']}
        picked = list(picked.values())
        return {'id': r['id'], 'clues': picked, 'missedNote': answer['missedNote'], 'model': curate.MODEL}

    with open(out, 'a') as f, cf.ThreadPoolExecutor(curate.WORKERS) as pool:
        for rec in pool.map(one, todo):
            if rec:
                f.write(json.dumps(rec, ensure_ascii=False) + '\n')
                f.flush()
    recs = [json.loads(l) for l in out.read_text().splitlines()]
    print(json.dumps({'classified': len(recs), 'withClue': sum(bool(r['clues']) for r in recs)}))


def export():
    """One missed observation per (round, clue) whose clue is playable in the World pack."""
    rounds = {r['id']: r for r in json.loads((OUT / 'lost.json').read_text())}
    bank = {b['topicId']: b for b in json.loads((HERE / 'clue-bank.json').read_text())}
    missed = []
    for line in (OUT / 'classified.jsonl').read_text().splitlines():
        rec = json.loads(line)
        for c in rec['clues']:
            b = bank[c['topicId']]
            if b['practice'] and b['status'] == 'playable':
                _, slug, tip = c['topicId'].split(':')
                missed.append({'id': f"{rec['id']}:{tip}", 'skillId': f'world:pk:{slug}:{tip}',
                               'occurredAt': rounds[rec['id']]['endTime'], 'reason': c['evidence']})
    (OUT / 'missed-clues.json').write_text(json.dumps({'packId': 'world-plonkit-clue-bank', 'missed': missed}, ensure_ascii=False))
    print(json.dumps({'missed': len(missed), 'clues': len({m['skillId'] for m in missed})}))


if __name__ == '__main__':
    OUT.mkdir(exist_ok=True)
    command, *rest = sys.argv[1:]
    {'fetch': fetch, 'lost': lost, 'export': export,
     'classify': lambda: classify(int(rest[0]) if rest else None)}[command]()
