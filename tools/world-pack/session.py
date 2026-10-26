#!/usr/bin/env python3
"""Session analysis behind win/Session-<date>.md (methods of win/LastDay.md and win/WinStats.md): duel rounds that ended
since SINCE vs every earlier round on the same map, plus the Sprint attempts after an older attempts snapshot.
Deficit = their score minus his (negative: he is ahead). Writes JSON to stdout.
Usage: WORLD_PACK_DATA=<caches> WORLD_PACK_INPUTS=<inputs> python3 tools/world-pack/session.py SINCE OLD.json NEW.json
"""
import collections
import json
import statistics
import sys

from text import HERE, WORK

ACOW = 'A Competitive World'
PACKS = ('pack.json', 'pack.v0.14.5.json', 'pack.before-decks.json', 'pack.before-recovery.json', 'pack.recovered-run.json')


def load(path):
    return json.loads((HERE / path).read_text())


def to_code():
    props = [f['properties'] for f in json.loads((WORK / 'worldwide/countries-50m.geojson').read_text())['features']]
    return {p[k]: p['ISO_A2_EH'] for p in props for k in ('NAME', 'ADMIN')}


def deficit(r):
    return (r['theirScore'] or 0) - (r['myScore'] or 0)


def km(m):
    return round(m / 1000) if m is not None else None


def map_stats(rs, code):
    """LastDay's per-map row: wrong-country rate, deficit by right/wrong country, his vs their right-country median km."""
    wrong = [r for r in rs if code.get(r['myGuessCountry']) != r['countryCode']]
    right = [r for r in rs if r not in wrong]
    mean = lambda xs: round(statistics.mean(xs)) if xs else None
    med = lambda xs: round(statistics.median(xs)) if xs else None
    return {'n': len(rs), 'wrong_rate': round(len(wrong) / len(rs), 2) if rs else None,
            'mean_deficit': mean([deficit(r) for r in rs]),
            'round_win_rate': round(sum(deficit(r) < 0 for r in rs) / len(rs), 2) if rs else None,
            'wrong_mean_deficit': mean([deficit(r) for r in wrong]), 'right_mean_deficit': mean([deficit(r) for r in right]),
            'right_my_median_km': med([km((r['myGuess'] or {}).get('distance')) for r in right if r['myGuess']]),
            'right_their_median_km': med([km(r['theirDistance']) for r in right if r['theirDistance'] is not None])}


def games(rs, raw, me, earlier):
    """Per game: map, won, rounds, ratings before/after (overall and the mode's), the biggest-damage round of a loss."""
    out = []
    by_game = collections.defaultdict(list)
    for r in rs:
        by_game[r['gameId']].append(r)
    for gid, grs in sorted(by_game.items(), key=lambda kv: min(r['endTime'] for r in kv[1])):
        d = raw['details'][gid]
        mine = next(t for t in d['teams'] if any(p['playerId'] == me for p in t['players']))
        other = next(t for t in d['teams'] if t is not mine)
        prog = (mine['players'][0]['progressChange'] or {}).get('rankedSystemProgress') or {}
        won = d['result']['winningTeamId'] == mine['id']
        g = {'id': gid, 'map': grs[0]['map'], 'start': min(r['endTime'] for r in grs)[:16], 'won': won,
             'rounds': len(mine['roundResults']), 'inLastDay': gid in earlier, 'mode': prog.get('gameMode'),
             'rating': [prog.get('ratingBefore'), prog.get('ratingAfter')],
             'modeRating': [prog.get('gameModeRatingBefore'), prog.get('gameModeRatingAfter')],
             'oppRating': other['players'][0]['rating'], 'style': d['result'].get('winnerStyle')}
        if not won:
            hp = d['options']['initialHealth']
            worst = max(mine['roundResults'], key=lambda x: x['healthBefore'] - x['healthAfter'])
            r = next((x for x in grs if x['round'] == worst['roundNumber']), None)
            g['blowup'] = {'round': worst['roundNumber'], 'hpShare': round((worst['healthBefore'] - worst['healthAfter']) / hp, 2),
                           **(row(r) if r else {})}
        out.append(g)
    return out


def row(r, code=None):
    return {'id': r['id'], 'map': r['map'], 'truth': r['countryCode'], 'guess': r['myGuessCountry'],
            'sub': r['subdivision'], 'guessSub': r['myGuessSubdivision'], 'km': km((r['myGuess'] or {}).get('distance')),
            'theirKm': km(r['theirDistance']), 'my': r['myScore'], 'their': r['theirScore'], 'deficit': deficit(r)}


def sprint(old, new, code):
    """Attempts after the old snapshot: miss rate by subject, mode and both, by country, the deck cards, missed cards."""
    skills = {}
    for p in PACKS:
        if (HERE / 'sprint' / p).exists():
            for s in load(f'sprint/{p}')['skills']:
                skills.setdefault(s['id'], s)
    current = {s['id'] for s in load('sprint/pack.json')['skills']}
    assert new[:len(old)] == old, 'the new snapshot must extend the old one'
    att = new[len(old):]
    rate = lambda xs: {'n': len(xs), 'miss': sum(not a['correct'] for a in xs),
                       'rate': round(sum(not a['correct'] for a in xs) / len(xs), 2) if xs else None}
    group = lambda key: {k: rate(v) for k, v in sorted(groupby(att, key).items(), key=lambda kv: -len(kv[1]))}
    s = lambda a: skills.get(a['skillId'], {})
    deck = lambda a: ':lm:682f72974b4204c8b6a3cc6d:' in a['skillId']
    last = {}
    for a in att:
        last[a['skillId']] = a
    cards = groupby(att, lambda a: a['skillId'])
    missed = sorted(((sum(not a['correct'] for a in v), len(v), k) for k, v in cards.items()), reverse=True)
    return {'n': len(att), 'from': att[0]['occurredAt'], 'to': att[-1]['occurredAt'], **rate(att),
            'cardsTouched': len(cards), 'notInPack': sum(k not in current for k in cards),
            'unknownSkill': sum(k not in skills for k in cards),
            'bySubject': group(lambda a: s(a).get('subject', '?')), 'byMode': group(lambda a: s(a).get('mode', '?')),
            'bySubjectMode': group(lambda a: f"{s(a).get('subject', '?')}/{s(a).get('mode', '?')}"),
            'byCountry': group(lambda a: s(a).get('country', '?')),
            'deck': {**rate([a for a in att if deck(a)]), 'cards': len({a['skillId'] for a in att if deck(a)}),
                     'lastMissed': sorted(s(a).get('title', k) for k, a in last.items() if deck(a) and not a['correct']),
                     'cardsInPack': sum(deck({'skillId': k}) for k in current)},
            'mostMissed': [{'title': s({'skillId': k}).get('title', k), 'miss': m, 'n': n, 'lastRight': last[k]['correct']}
                           for m, n, k in missed[:15] if m >= 2]}


def groupby(xs, key):
    out = collections.defaultdict(list)
    for x in xs:
        out[key(x)].append(x)
    return out


def main(since, old_path, new_path):
    code = to_code()
    raw, rounds = load('duels/raw.json'), load('duels/rounds.json')
    earlier = {g['id'] for g in load('win/lastday-duels.json')['games']}
    window = [r for r in rounds if (r['endTime'] or '') >= since]
    wrong = lambda r: code.get(r['myGuessCountry']) != r['countryCode']
    per_map = {m: {'window': map_stats([r for r in window if r['map'] == m], code),
                   'new': map_stats([r for r in window if r['map'] == m and r['gameId'] not in earlier], code),
                   'before': map_stats([r for r in rounds if r['map'] == m and r['endTime'] and r['endTime'] < since], code)}
               for m in sorted({r['map'] for r in window})}
    by_country = collections.defaultdict(lambda: [0, 0, 0])  # deficit, rounds, wrong-country rounds
    for r in window:
        c = by_country[r['countryCode']]
        c[0] += deficit(r)
        c[1] += 1
        c[2] += wrong(r)
    pairs = collections.defaultdict(lambda: [0, 0])
    for r in window:
        if wrong(r) and code.get(r['myGuessCountry']):
            pairs[r['countryCode'], code[r['myGuessCountry']]][0] += deficit(r)
            pairs[r['countryCode'], code[r['myGuessCountry']]][1] += 1
    contrast = {tuple(c['id'].split(':')[2].split('-')) for c in load('sprint/contrast.json')}
    old, new = json.loads(open(old_path).read()), json.loads(open(new_path).read())
    out = {
        'since': since, 'games': games(window, raw, raw['userId'], earlier), 'perMap': per_map,
        'wrongCountry': [{**row(r), 'inLastDay': r['gameId'] in earlier} for r in window if wrong(r)],
        'regional': [{**row(r), 'inLastDay': r['gameId'] in earlier}
                     for r in sorted((r for r in window if not wrong(r)), key=deficit, reverse=True)[:10]],
        'byCountry': sorted(([cc, *v] for cc, v in by_country.items()), key=lambda x: -x[1]),
        'pairs': sorted(([f'{a}-{b}', d, n, (a, b) in contrast] for (a, b), d, n in
                         ((k, *v) for k, v in pairs.items())), key=lambda x: -x[1]),
        'sprint': sprint(old, new, code)}
    json.dump(out, sys.stdout, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main(*sys.argv[1:4])
