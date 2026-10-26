"""The build-time `stakes` line of each sprint skill (at most MAX characters): what that clue has cost Seth in his
world-map duels (duels/rounds.json; for the totals, maps with maxErrorDistance 14,000 km or more, as in
win/WinStats.md). pts is the positive deficit, their score minus his. First match wins: a duel card's own round, a
contrast card's relevance numbers, an identify skill's wrong-country losses (its pick's rival first), a regional skill's
misplaced rounds in its area (else in its country), else the country's ACoW share."""
import collections
import datetime as dt
import json

from sprint_rounds import place
from text import HERE

MAX, FAR_M = 90, 500_000


def fit(*lines):
    """The first line of at most MAX characters, else the last one cut to MAX."""
    return next((line for line in lines if len(line) <= MAX), lines[-1][:MAX])


def rounds_text(n):
    return f"{n} round{'s' * (n != 1)}"


def totals(rounds, to_code):
    """({ISO2: {guessed ISO2: [pts, rounds]}} for wrong-country rounds, {subdivision code or ISO2: [pts, rounds]} for
    right-country rounds more than FAR_M off)."""
    wrong = collections.defaultdict(lambda: collections.defaultdict(lambda: [0, 0]))
    far = collections.defaultdict(lambda: [0, 0])
    for r in rounds:
        cc, gcc, pts = r['countryCode'], to_code.get(r['myGuessCountry']), max(0, (r['theirScore'] or 0) - (r['myScore'] or 0))
        if gcc and gcc != cc:
            rows = [wrong[cc][gcc]]
        elif gcc == cc and (r['myGuess'] or {}).get('distance', 0) > FAR_M:
            rows = [far[cc]] + ([far[place(r['subdivision'])[1]]] if place(r['subdivision'])[1] else [])
        else:
            rows = []
        for row in rows:
            row[0] += pts
            row[1] += 1
    return wrong, far


def duel(r, lost):
    when = dt.datetime.fromisoformat(r['endTime'])
    answer = place(r['subdivision'])[0] or r['country']
    deficit, day = (r['theirScore'] or 0) - (r['myScore'] or 0), f'{when:%b} {when.day}'
    if deficit <= 0:
        return fit(f'You won this round: {answer}, {day}', f"You won this round: {r['country']}, {day}")
    guess = place(r['myGuessSubdivision'])[0] or r['myGuessCountry'] or 'no guess'
    tail = ' (lost that game)' if r['gameId'] in lost else ''
    return fit(f'Cost you {deficit:,} pts: {answer} guessed as {guess}, {day}{tail}',
               f"Cost you {deficit:,} pts: {answer} guessed as {r['myGuessCountry'] or 'no guess'}, {day}{tail}",
               f"Cost you {deficit:,} pts: {r['country']} guessed as {r['myGuessCountry'] or 'no guess'}, {day}{tail}")


def contrast(s):
    """From the card's relevance line: 'Your world-map duels: {n} round(s) in {A} guessed {B}, {lost:,} points lost.'"""
    a, b = s['title'].split(' vs ', 1)
    rel = s['relevance']
    n, lost = int(rel.split(': ', 1)[1].split(' round', 1)[0]), rel.rpartition(', ')[2].split(' points', 1)[0]
    return fit(f'{a} guessed as {b}: {lost} pts lost in {rounds_text(n)}')


def add(skills, to_code, name, share, regions, rivals):
    """Sets skill['stakes'] on every skill. regions: gap/clue-regions.json; rivals: {skill id: ISO2 of its pick's rival}."""
    raw = json.loads((HERE / 'duels/raw.json').read_text())
    world = {g['options']['map']['name'] for g in raw['details'].values()
             if g['options']['map']['maxErrorDistance'] >= 14_000_000}
    mine = lambda g: next(t['id'] for t in g['teams'] if any(p['playerId'] == raw['userId'] for p in t['players']))
    lost = {gid for gid, g in raw['details'].items() if g['result'].get('winningTeamId') not in (None, mine(g))}
    every = json.loads((HERE / 'duels/rounds.json').read_text())
    by_id = {r['id']: r for r in every}
    wrong, far = totals([r for r in every if r['map'] in world], to_code)
    for s in skills:
        cc, src = s['country'], s['curriculum']['source']['clue']
        if s['subject'] == 'duel':
            s['stakes'] = duel(by_id[src], lost)
        elif s['subject'] == 'contrast':
            s['stakes'] = contrast(s)
        elif s['mode'] == 'identify':
            options, rival = wrong.get(cc, {}), rivals.get(s['id'])
            if rival not in options:
                rival = max(options, key=options.get, default=None)
            pts, n = options.get(rival, (0, 0))
            s['stakes'] = fit(f'{name(cc)} guessed as {name(rival)}: {pts:,} pts lost in {rounds_text(n)}' if n
                              else f'Wrong-country guesses on {name(cc)}: none yet')
        elif s['mode'] == 'regional' and s.get('area'):
            codes = regions.get(src, {}).get('subdivisions', [])
            pts, n = map(sum, zip((0, 0), *(far[c] for c in codes if c in far)))
            area = s['area'].split(', ')
            s['stakes'] = fit(f"{s['area']}: {pts:,} pts lost in {rounds_text(n)} when you misplaced it",
                              f'{area[0]} and {len(area) - 1} more: {pts:,} pts lost in {rounds_text(n)} when you misplaced it',
                              f'{area[0]} and {len(area) - 1} more: {pts:,} pts lost in {rounds_text(n)}') if n else \
                fit(f"{name(cc)} regional misses: {far.get(cc, [0])[0]:,} pts in {rounds_text(far.get(cc, [0, 0])[1])}")
        else:
            s['stakes'] = fit(f'{name(cc)}: {100 * share.get(cc, 0):.1f}% of ranked rounds')
