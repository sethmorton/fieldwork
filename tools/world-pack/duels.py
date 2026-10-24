#!/usr/bin/env python3
"""Review your duels: for every round, which practice clues were visible, and for the rounds you lost, which you missed.

Personal data: everything is written under WORLD_PACK_DATA/duels/ (never in the repo).
  fetch     every duel in your GeoGuessr activity feed (ranked and unranked) with its rounds from the game server, needs GG_NCFA (the _ncfa cookie) in the env
  rounds    every round with its result (lost = your team scored below the opponent outside a healing round)
  classify  small model (CURATE_MODEL, default gpt-6-luna) looks at what you could see and names the visible clues
  export    duels/missed-clues.json (missed clues, plus per-clue focus weights by points lost per country) for the local build (`missedCluesPaths` in .fieldwork.local.json): rounds you lost or guessed more than FAR_KM away
  report    duels/report.json: where you lose, which countries you confuse, which clues you miss and which you use
Usage: WORLD_PACK_DATA=<caches> python3 tools/world-pack/duels.py fetch|rounds|classify [LIMIT]|export|report
"""
import concurrent.futures as cf
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

# Personal game history must never land in the repository checkout (checked before any import touches the data folder).
REPO = Path(__file__).resolve().parents[2]
if __name__ == '__main__' and (not os.environ.get('WORLD_PACK_DATA')
                               or Path(os.environ['WORLD_PACK_DATA']).resolve().is_relative_to(REPO)):
    sys.exit('Set WORLD_PACK_DATA to a data folder outside the repository: duel history is personal.')
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
    """Every Duels/TeamDuels game in your feed (the feed keeps about a year), with its full round data (cached per game)."""
    raw = json.loads((OUT / 'raw.json').read_text()) if (OUT / 'raw.json').exists() else {'details': {}}
    raw['userId'] = get('https://www.geoguessr.com/api/v3/profiles')['user']['id']
    games, token = {}, ''
    while True:
        page = get(FEED + ('?paginationToken=' + urllib.parse.quote(token) if token else ''))
        for entry in page['entries']:
            items = json.loads(entry['payload']) if isinstance(entry['payload'], str) else entry['payload']
            for item in items if isinstance(items, list) else [{'time': entry['time'], 'payload': items}]:
                p = item['payload']
                if p.get('gameId') and p.get('gameMode') in ('Duels', 'TeamDuels'):
                    games[p['gameId']] = {'gameId': p['gameId'], 'time': item['time'], 'gameMode': p['gameMode'],
                                          'competitive': p.get('competitiveGameMode', 'None')}
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


def rounds():
    raw = json.loads((OUT / 'raw.json').read_text())
    country_at = collect.bc.geolocator(json.loads((WORK / 'worldwide/countries-50m.geojson').read_text()))
    meta = {g['gameId']: g for g in raw['games']}
    out = []
    for game_id, game in raw['details'].items():
        mine = next((t for t in game['teams'] if any(p['playerId'] == raw['userId'] for p in t['players'])), None)
        if mine is None:
            continue
        others = [t for t in game['teams'] if t is not mine]
        for result in mine.get('roundResults', []):
            n = result['roundNumber']
            theirs = max((r['score'] for t in others for r in t.get('roundResults', []) if r['roundNumber'] == n), default=None)
            if theirs is None:
                continue
            p = game['rounds'][n - 1]['panorama']
            mine_guess = result.get('bestGuess') or {}
            their_guess = min((r.get('bestGuess') or {} for t in others for r in t.get('roundResults', []) if r['roundNumber'] == n),
                              key=lambda g: g.get('distance', 1e12), default={})
            out.append({
                'id': f'duel:{game_id}:{n}', 'gameId': game_id, 'round': n, 'endTime': game['rounds'][n - 1].get('endTime'),
                'mode': meta.get(game_id, {}).get('competitive'), 'movement': game.get('movementOptions') or {},
                'view': {'panoId': pano_id(p['panoId']), 'lat': p['lat'], 'lng': p['lng'], 'heading': p.get('heading') or 0,
                         'pitch': p.get('pitch') or 0, 'zoom': p.get('zoom') or 0},
                'countryCode': (p.get('countryCode') or '').upper(), 'country': country_at(p['lat'], p['lng']),
                # Healing rounds deal no damage, so scoring lower in one is not a lost round.
                'lost': result['score'] < theirs and not game['rounds'][n - 1].get('isHealingRound'),
                'map': (game.get('options') or {}).get('map', {}).get('name'),
                'myScore': result['score'], 'theirScore': theirs,
                'myGuess': {k: mine_guess.get(k) for k in ('lat', 'lng', 'distance')},
                'myGuessCountry': country_at(mine_guess['lat'], mine_guess['lng']) if mine_guess.get('lat') is not None else None,
                'theirDistance': their_guess.get('distance')})
    (OUT / 'rounds.json').write_text(json.dumps(out))
    lost = [r for r in out if r['lost']]
    print(json.dumps({'games': len(raw['details']), 'rounds': len(out), 'lostRounds': len(lost),
                      'lostWrongCountry': sum(r['myGuessCountry'] != r['country'] for r in lost)}))


def frames(r):
    """What the player could see: the opening view only when rotation was forbidden (NMPZ), else four directions."""
    v = r['view']
    if r['movement'].get('forbidRotating'):
        views = [(v, collect.zoom_to_fov(v['zoom']))]
    else:
        views = [({**v, 'heading': (v['heading'] + 90 * k) % 360}, 90.0) for k in range(4)]
    paths = []
    for view, fov in views:
        try:
            paths.append(collect.thumb(view, fov))
        except urllib.error.HTTPError as e:
            if e.code not in (400, 404):
                return None  # transient (rate limit, server error): no judgement now, the next run retries
            break  # the thumbnail service rejects unofficial or removed panoramas: treated as gone
    return [p for p in paths if p]


SCHEMA = {'type': 'object', 'additionalProperties': False, 'required': ['clues', 'missedNote'], 'properties': {
    'clues': {'type': 'array', 'items': {'type': 'object', 'additionalProperties': False,
                                         'required': ['tipId', 'frame', 'evidence'],
                                         'properties': {'tipId': {'type': 'string'}, 'frame': {'type': 'integer'},
                                                        'evidence': {'type': 'string'}}}},
    'missedNote': {'type': 'string'}}}


def practice_clues():
    """Practice clues by ISO country code, and one prompt line per clue (guide text plus what its image shows)."""
    clues = {c['topicId']: c for c in json.loads((HERE / 'clues.json').read_text())}
    visual = json.loads((HERE / 'labels/visual.json').read_text())
    codes = {u['slug']: u.get('code') for u in json.loads(
        (WORK / 'location-database/foundations/all-guide-topic-inventory.json').read_text())['units']}
    by_code = {}
    for b in json.loads((HERE / 'clue-bank.json').read_text()):
        if b['practice']:
            by_code.setdefault(codes.get(b['slug']), []).append(b['topicId'])
    line = {t: f"[{t.split(':')[2]}] {clues[t]['text'][:240]}" + (f" (Guide image shows: {visual[t]['lookFor']})" if visual.get(t, {}).get('lookFor') else '')
            for ts in by_code.values() for t in ts}
    return by_code, line


def visible_clues(images, country, context, candidates, line, source='Plonk It'):
    """Small-model judgement: which of these practice clues are clearly visible in the frames. None if the call failed."""
    prompt = (f"{context}\nFrom the numbered {source} clues for {country} below, list only clues that are actually visible in "
              f"the frames and would have pointed to the true region (or country), best first, at most {MAX_CLUES}. For each "
              "give the tip id in brackets, the frame number and what exactly is visible and where in the frame. Only list a "
              "clue when the specific thing it describes is clearly there (a road-line clue needs visible road lines, a pole "
              "clue a visible pole of that type). Do not list clues that are merely consistent with the scene. Return an empty "
              "list if none is visible. missedNote: one plain sentence on what the player should have noticed (empty if "
              "nothing).\n\n" + '\n'.join(line[t] for t in candidates))
    try:
        answer = curate.ask(prompt, SCHEMA, images)
    except Exception:
        return None  # retried on the next run
    valid, picked = {t.split(':')[2]: t for t in candidates}, {}
    for c in answer['clues']:
        tip = c['tipId'].strip('[] ')
        if tip in valid and 1 <= c['frame'] <= len(images) and valid[tip] not in picked and len(picked) < MAX_CLUES:
            picked[valid[tip]] = {'topicId': valid[tip], 'frame': c['frame'], 'evidence': c['evidence']}
    return {'clues': list(picked.values()), 'missedNote': answer['missedNote'], 'model': curate.MODEL}


def inputs(by_code, line):
    """Per country: fingerprint of the candidate clue text and the model, so a judgement is reused only for the same
    question. (A change to the prompt wording in visible_clues needs the classified files removed.)"""
    return {cc: curate.fingerprint(curate.MODEL, *(line[t] for t in ts)) for cc, ts in by_code.items()}


def classify(limit=None):
    rounds = sorted(json.loads((OUT / 'rounds.json').read_text()), key=lambda r: not r['lost'])
    by_code, line = practice_clues()
    current = inputs(by_code, line)
    out = OUT / 'classified.jsonl'
    done = {(r['id'], r.get('inputs')) for r in map(json.loads, out.read_text().splitlines())} if out.exists() else set()
    todo = [r for r in rounds if (r['id'], current.get(r['countryCode'])) not in done][:limit]

    def one(r):
        candidates = by_code.get(r['countryCode'], [])
        images = frames(r)
        if images is None:
            return None
        stamp = {'id': r['id'], 'inputs': current.get(r['countryCode'])}
        if not candidates or not images:
            return {**stamp, 'clues': [], 'missedNote': '', 'skipped': 'no practicable clues' if images else 'panorama gone'}
        result = visible_clues(images, r['country'], context(r, len(images)), candidates, line)
        return result and {**stamp, **result}

    with open(out, 'a') as f, cf.ThreadPoolExecutor(curate.WORKERS) as pool:
        for rec in pool.map(one, todo):
            if rec:
                f.write(json.dumps(rec, ensure_ascii=False) + '\n')
                f.flush()
    print(json.dumps({'judged': len(current_judgements())}))


def context(r, frame_count):
    seen = 'only frame 1 (no moving, no turning)' if r['movement'].get('forbidRotating') else f'frames 1-{frame_count} (it could turn around)'
    guess = (f"The player guessed {r['myGuessCountry'] or 'somewhere'} at {round((r['myGuess']['distance'] or 0) / 1000)} km away"
             if r['myGuess'].get('lat') is not None else 'The player did not guess')
    return (f"A GeoGuessr player {'lost' if r['lost'] else 'played'} this duel round. The true location is in {r['country']} "
            f"({r['view']['lat']:.3f}, {r['view']['lng']:.3f}). {guess}; the opponent was "
            f"{round((r['theirDistance'] or 0) / 1000)} km away. The player could see {seen}.")


def current_judgements():
    """Latest judgement per round made with the current candidate clues."""
    rounds = {r['id']: r for r in json.loads((OUT / 'rounds.json').read_text())}
    current = inputs(*practice_clues())
    return {r['id']: r for r in map(json.loads, (OUT / 'classified.jsonl').read_text().splitlines())
            if r['id'] in rounds and r.get('inputs') == current.get(rounds[r['id']]['countryCode'])}


FAR_KM = 500


def points_behind(rounds, field):
    """Points the opponent scored above you, summed per round[field], over competitive rounds only."""
    behind = {}
    for r in rounds:
        if r['mode'] not in (None, 'None'):
            behind[r[field]] = behind.get(r[field], 0) + max(0, r['theirScore'] - r['myScore'])
    return behind


def is_missed(r):
    """A competitive round (ranked or competitive-mode duel; unranked games include city maps like San Francisco)
    that you lost, or where your guess was more than FAR_KM away (a won round can still be a big miss)."""
    return r['mode'] not in (None, 'None') and (r['lost'] or (r['myGuess'].get('distance') or 0) > FAR_KM * 1000)


def round_misses(r, rec, bank):
    """The judged clues of a missed round that count as misses: playable practice clues, and country clues only when
    the guess landed in the wrong country."""
    if not is_missed(r):
        return []
    right_country = r['myGuessCountry'] == r['country']
    return [c for c in rec['clues'] if bank[c['topicId']]['practice'] and bank[c['topicId']]['status'] == 'playable'
            and not (bank[c['topicId']]['stage'] == 'country-identification' and right_country)]


def export():
    """One missed observation per (missed round, clue) whose clue is playable in the World pack (round_misses)."""
    rounds = {r['id']: r for r in json.loads((OUT / 'rounds.json').read_text())}
    bank = {b['topicId']: b for b in json.loads((HERE / 'clue-bank.json').read_text())}
    missed = []
    for rec in current_judgements().values():
        r = rounds[rec['id']]
        for c in round_misses(r, rec, bank):
            _, slug, tip = c['topicId'].split(':')
            missed.append({'id': f"{rec['id']}:{tip}", 'skillId': f'world:pk:{slug}:{tip}',
                           'occurredAt': r['endTime'], 'reason': c['evidence']})
    # Focus: every playable practice clue weighted by the points you have been behind in its country, so learn mode
    # introduces the countries you lose most in first.
    behind = points_behind(rounds.values(), 'countryCode')
    total = sum(behind.values()) or 1
    focus = {f"world:pk:{t.split(':')[1]}:{t.split(':')[2]}": round(behind[code] / total, 5)
             for code, ts in practice_clues()[0].items() if behind.get(code) for t in ts if bank[t]['status'] == 'playable'}
    (OUT / 'missed-clues.json').write_text(json.dumps({'packId': 'world-plonkit-clue-bank', 'missed': missed, 'focus': focus},
                                                      ensure_ascii=False))
    print(json.dumps({'missed': len(missed), 'clues': len({m['skillId'] for m in missed}), 'focusClues': len(focus)}))


def report():
    """Where the points go: per country rounds, losses and wrong-country guesses; the countries you confuse; per clue
    how often it was visible when you lost versus when you did not."""
    rounds = json.loads((OUT / 'rounds.json').read_text())
    judged = current_judgements()
    by_country = {}
    for r in rounds:
        c = by_country.setdefault(r['country'] or r['countryCode'], {'rounds': 0, 'lost': 0, 'wrongCountry': 0, 'pointsBehind': 0})
        c['rounds'] += 1
        c['lost'] += r['lost']
        c['wrongCountry'] += r['myGuessCountry'] != r['country']
        c['pointsBehind'] += max(0, r['theirScore'] - r['myScore'])
    confusions = {}
    for r in rounds:
        if r['myGuessCountry'] and r['country'] and r['myGuessCountry'] != r['country']:
            key = f"{r['country']} -> {r['myGuessCountry']}"
            confusions[key] = confusions.get(key, 0) + 1
    clues = {}
    outcome = {r['id']: r['lost'] for r in rounds}
    for i, rec in judged.items():
        for c in rec['clues']:
            k = clues.setdefault(c['topicId'], {'visibleLost': 0, 'visibleNotLost': 0})
            k['visibleLost' if outcome[i] else 'visibleNotLost'] += 1
    modes = {}
    for r in rounds:
        m = modes.setdefault(f"{r['mode']} | {r['map']}", {'rounds': 0, 'lost': 0})
        m['rounds'] += 1
        m['lost'] += r['lost']
    result = {'rounds': len(rounds), 'judged': len(judged), 'byCountry': by_country, 'modes': modes,
              'confusions': dict(sorted(confusions.items(), key=lambda kv: -kv[1])), 'clues': clues}
    (OUT / 'report.json').write_text(json.dumps(result, ensure_ascii=False, indent=1))
    print(json.dumps({'rounds': len(rounds), 'judged': len(judged), 'countries': len(by_country), 'confusions': len(confusions)}))


if __name__ == '__main__':
    OUT.mkdir(exist_ok=True)
    command, *rest = sys.argv[1:]
    {'fetch': fetch, 'rounds': rounds, 'export': export, 'report': report,
     'classify': lambda: classify(int(rest[0]) if rest else None)}[command]()
