#!/usr/bin/env python3
"""Sprint 'contrast' cards: 'A vs B, here is the tell' for the country pairs Seth confuses in his world-map duels.

  1. pairs: wrong-country rounds (truth A, guess B) on world maps (maxErrorDistance 14,000 km or more), weighted by
     points lost to the opponent; REQUIRED pairs first, then the Brazil Centre-West / Northeast regional pair, then the
     heaviest, up to PAIRS
  2. per direction A -> B: its oldest round whose panorama sprint/pack.json does not use (stable card ids), else its
     oldest round whose panorama only a 'Your rounds' duel card uses (the item says `mergeIntoDuel: <duel skill id>`:
     sprint.py appends its tells to that duel card instead of adding a card), else no card; shown as played at zoom 0
  3. SELECT_MODEL picks up to 3 tells from both sides' source texts (Plonk It country-identification tips, the pack's own
     clues, Beginner/Intermediate Learnable Meta metas), rural-road tells first; a signs-or-text tell, only when nothing
     else separates the pair, is prefixed SIGN. VERIFY_MODEL keeps only tells its sources support, that tell A from B and
     that do not infer a place from a feature's absence. Both calls are cached in sprint/contrast-cache.json.
  4. sprint/contrast.json: skills, biggest-loss pair first, each with its round's `location`; sprint.py wires them in.
Usage: WORLD_PACK_DATA=<caches> WORLD_PACK_INPUTS=<inputs> python3 tools/world-pack/sprint_contrast.py [SINCE [A-B ...]]
  With SINCE (an ISO time) the existing cards stay as they are; only pairs that cost more than NEW_MIN points in rounds
  ended since then, and the A-B pairs named, are added when they have no card yet.
"""
import collections
import concurrent.futures as cf
import html
import json
import sys
import threading
from pathlib import Path

import curate
import sprint
import sprint_rounds
import text
from build import card_image
from text import HERE, WORK

OUT = HERE / 'sprint'
CACHE = OUT / 'contrast-cache.json'
SURVEY = HERE / 'win/survey.jsonl'  # round vision survey (optional): what each round's panorama shows
SELECT_MODEL, VERIFY_MODEL, WORKERS, PAIRS, NEW_MIN = 'gpt-6.1-sol', 'gpt-6-astra', 10, 25, 2000
REQUIRED = [('US', 'CA'), ('MY', 'ID'), ('RU', 'UA'), ('BE', 'SK'), ('BE', 'NL'), ('TR', 'CY'), ('NO', 'US'),
            ('NO', 'SE'), ('NA', 'KE'), ('NA', 'ZA'), ('ES', 'TR')]
# Brazilian macro-regions as sides of a regional pair (IBGE regions; ISO 3166-2 has none).
REGIONS = {'BR.NE': ('Northeast Brazil', {'BR-MA', 'BR-PI', 'BR-CE', 'BR-RN', 'BR-PB', 'BR-PE', 'BR-AL', 'BR-SE', 'BR-BA'}),
           'BR.CW': ('Centre-West Brazil', {'BR-MT', 'BR-MS', 'BR-GO', 'BR-DF'})}
LEVELS = {'Beginner', 'Intermediate'}

SELECT = """Seth plays ranked GeoGuessr duels on world maps (mostly A Competitive World: 87% rural, no moving). In one
of his rounds the answer was {a} and he guessed {b}. Write a discrimination card: up to 3 tells that tell {a} apart
from {b}, best first.
- Each tell must come from the candidate texts below: quote them or paraphrase tightly. Add nothing they do not say.
- A tell must separate the two places: what {a} has and {b} does not, or the reverse. Name both places when the texts
  allow it ('{a}: ...; {b}: ...').
- Rural first: on A Competitive World readable text shows in about 1 round in 10. Pick tells from what a rural road
  shows: road lines, poles, bollards, landscape or soil, the Google car. Use a signs-or-text tell (signs, licence
  plates, any writing) only when no other category in the texts separates the two places.
- Never make absence a tell: not seeing a feature of one place does not point to the other (no 'X: red car; Y: no red
  car'). A tell states something seen in {a}, or something seen in {b}, or both.
- One short sentence per tell. sources: the ids of the one or two texts it comes from. category: what the tell looks at.
{seen}
Candidates for {a} (id [source | section] text):
{cands_a}

Candidates for {b}:
{cands_b}"""
SEEN = """A vision model not told the country described this round's panorama; prefer tells it shows, still only from
the candidate texts: {survey}
"""
VERIFY = """You check the tells of a GeoGuessr card that teaches telling {a} apart from {b}. For each numbered tell:
- supported: true only if every claim in the tell is stated by, or tightly paraphrases, its cited source texts. A tell
  that adds a detail, number, place or contrast the sources do not state is not supported.
- distinguishes: true only if the tell, as written, separates {a} from {b}: it is not equally true of both, judging by
  the other source texts listed and what you know.
- absence_ok: false if the tell asks the player to infer one place from NOT seeing a feature (e.g. 'Russia: no red
  Generation 3 car', or 'these signs are absent'), even when the source says the other place lacks it; true otherwise.

Tells:
{tells}

Other source texts for {a}:
{cands_a}

Other source texts for {b}:
{cands_b}"""
CATEGORIES = ['road-lines', 'poles', 'bollards', 'landscape-or-soil', 'google-car', 'signs-or-text', 'other']
SELECT_SCHEMA = curate.schema({'tell': {'type': 'string'}, 'category': {'type': 'string', 'enum': CATEGORIES},
                               'sources': {'type': 'array', 'items': {'type': 'string'}}})
VERIFY_SCHEMA = curate.schema({'n': {'type': 'integer'}, 'reason': {'type': 'string'}, 'supported': {'type': 'boolean'},
                               'distinguishes': {'type': 'boolean'}, 'absence_ok': {'type': 'boolean'}})
SIGN = '(if a sign is visible) '


def plonkit(c):
    return {'id': c['topicId'], 'section': c['section'], 'text': c['text'], 'url': c['tipUrl'],
            'title': f"Plonk It · {c['title']}", 'images': [card_image(u) for u in c['imageUrls']], 'lm': False}


def learnable(m):
    return {'id': f"lm:{m['mapId']}:{m['metaId']}", 'section': m['mapName'],
            'text': f"{m['metaName']}\n{text.plain(m['note'] or '').strip()}",
            'url': f"https://learnablemeta.com/maps/{m['mapId']}", 'title': f"Learnable Meta · {m['mapName']}",
            'images': m['images'], 'lm': True}


def texts(cc, units, names, clues, lm, pack_ids, regions, states=None):
    """Source texts for country cc: its Plonk It country-identification tips, the pack's own clues and its Beginner or
    Intermediate Learnable Meta metas (every meta for a country without a guide); for a region side, only the texts
    whose clue-regions lie in `states` (subdivision codes)."""
    unit = next((u for u in units if (u.get('code') or '') == cc), None)
    metas = lm.get(curate.country_key(unit['title']), []) if unit else sprint.guideless_metas(names, [cc])[cc][1]
    rows = [(plonkit(c), c['stage'] == 'country-identification') for c in clues if unit and c['slug'] == unit['slug']]
    rows += [(learnable(m), not unit or m.get('level') in LEVELS) for m in metas]
    out, seen = [], set()
    for r, broad in rows:
        keep = states & set(regions.get(r['id'], {}).get('subdivisions', [])) if states else broad or r['id'] in pack_ids
        if keep and r['text'] not in seen:
            seen.add(r['text'])
            out.append(r)
    return out


def listing(prefix, rows):
    return '\n'.join(f"{prefix}{n} [{r['title']} | {r['section']}] {r['text'][:500]}" for n, r in enumerate(rows, 1))


LOCK = threading.Lock()


def ask_cached(cache, model, prompt, schema):
    """The model's results, cached in sprint/contrast-cache.json by fingerprint; None when the call fails."""
    key = curate.fingerprint(model, schema, prompt)
    if key not in cache:
        try:
            answer = curate.ask(prompt, schema, (), model)['results']
        except Exception as e:
            print('model call failed', model, e, flush=True)
            return None
        with LOCK:
            cache[key] = answer
            CACHE.write_text(json.dumps(cache, ensure_ascii=False))
    return cache[key]


def tells(job, cache):
    """Verified tells [(tell, [source rows])] for one card job, or None when a model call failed."""
    a, b, side_a, side_b, survey = job['a'], job['b'], job['side_a'], job['side_b'], job['survey']
    ids = {f'a{n}': r for n, r in enumerate(side_a, 1)} | {f'b{n}': r for n, r in enumerate(side_b, 1)}
    seen = SEEN.format(survey=json.dumps(survey, ensure_ascii=False)) if survey else ''
    picks = ask_cached(cache, SELECT_MODEL, SELECT.format(a=a, b=b, seen=seen, cands_a=listing('a', side_a),
                                                          cands_b=listing('b', side_b)), SELECT_SCHEMA)
    if picks is None:
        return None
    # Rural tells first; a signs-or-text tell says it needs a visible sign.
    picks = sorted(picks[:3], key=lambda p: p['category'] == 'signs-or-text')
    picks = [(SIGN * (p['category'] == 'signs-or-text') + p['tell'],
              [ids[s] for s in dict.fromkeys(p['sources']) if s in ids][:2]) for p in picks]
    picks = [(t, src) for t, src in picks if src]
    if not picks:
        return []
    numbered = '\n\n'.join(f"Tell {n}: {t}\n" + '\n'.join(f"Cited source ({r['title']}, {r['url']}): {r['text']}" for r in src)
                           for n, (t, src) in enumerate(picks, 1))
    verdicts = ask_cached(cache, VERIFY_MODEL, VERIFY.format(a=a, b=b, tells=numbered, cands_a=listing('', side_a),
                                                             cands_b=listing('', side_b)), VERIFY_SCHEMA)
    if verdicts is None:
        return None
    ok = {v['n'] for v in verdicts if v['supported'] and v['distinguishes'] and v['absence_ok']}
    return [p for n, p in enumerate(picks, 1) if n in ok]


def card(job, kept, rank):
    a, b, r, view = job['a'], job['b'], job['round'], job['round']['view']
    first = kept[0][1][0]
    sources = list({s['url']: s for _, src in kept for s in src}.values())
    image = lambda side: next((s['images'][0] for _, src in kept for s in src if s in side and s['images']), None)
    link = lambda s: f'<a href="{html.escape(s["url"])}">{html.escape(s["title"])}</a>'
    note = f'<p><strong>{html.escape(a)} vs {html.escape(b)}</strong></p>' + ''.join(
        f"<p>{html.escape(t)} ({', '.join(link(s) for s in src)})</p>" for t, src in kept)
    sid = f"sprint:contrast:{job['ka']}-{job['kb']}:{r['id']}"
    merge = {'mergeIntoDuel': job['duel']} if job['duel'] else {}
    return {
        'id': sid, 'title': f'{a} vs {b}', 'phase': 'Contrast', 'practiceFamily': f"{job['cc']}:contrast",
        'prerequisites': [], 'availability': 'available', 'importance': 100, 'country': job['cc'],
        'countryName': job['country'], 'subject': 'contrast', 'mode': job['mode'], 'why': kept[0][0],
        'relevance': f"Your world-map duels: {job['n']} round{'s' * (job['n'] > 1)} in {a} guessed {b}, "
                     f"{job['lost']:,} points lost.",
        'sourceNoteHtml': note, 'noteLicense': 'own+sources',
        'imageUrls': [u for u in (image(job['side_a']), image(job['side_b'])) if u],
        'source': {'title': first['title'], 'url': first['url']},
        'attributionHtml': 'Your own GeoGuessr duel round. Tells from ' + ', '.join(
            link(s) + ('' if s['lm'] else ' (CC BY-NC-SA 4.0, https://creativecommons.org/licenses/by-nc-sa/4.0/)')
            for s in sources) + '.',
        'curriculum': {'scope': 'within-country-regional' if job['mode'] == 'regional' else 'country-identification',
                       'rank': rank, 'source': {'clue': r['id']}}, **merge,
        'location': {'id': f"sprint:contrast:{view['panoId']}", 'panoId': view['panoId'], 'lat': view['lat'],
                     'lng': view['lng'], 'heading': view['heading'] or 0, 'pitch': view['pitch'] or 0, 'zoom': 0,
                     'country': job['country'], 'assessmentEligible': False,
                     'provenance': {'kind': 'duel-round', 'round': r['id']}}}


def side_of(r, guess_code):
    """(truth side, guess side) keys: ISO2 countries, or Brazilian regions when both are in Brazil."""
    if r['countryCode'] == guess_code == 'BR':
        region = lambda sub: next((k for k, (_, states) in REGIONS.items() if sprint_rounds.place(sub)[1] in states), None)
        return region(r['subdivision']), region(r['myGuessSubdivision'])
    return r['countryCode'], guess_code


def main(since=None, *wanted):
    """since (an ISO time): only add pairs that cost more than NEW_MIN points in rounds ended since then, plus the wanted
    pairs ('NO-CA'), that have no card yet, keeping sprint/contrast.json's cards as they are."""
    world = json.loads((WORK / 'worldwide/countries-50m.geojson').read_text())
    props = [f['properties'] for f in world['features']]
    to_code = {p[k]: p['ISO_A2_EH'] for p in props for k in ('NAME', 'ADMIN')}
    units = sprint.guide_units()
    names = {(u.get('code') or '').split('-')[0]: u['title'] for u in units} | {
        p['ISO_A2_EH']: p['NAME_EN'] for p in props if p['TYPE'] != 'Dependency' or p['ISO_A2'] == p['ISO_A2_EH']}
    label = lambda k: REGIONS[k][0] if k in REGIONS else names.get(k, k)
    max_error = {g['options']['map']['name']: g['options']['map']['maxErrorDistance']
                 for g in json.loads((HERE / 'duels/raw.json').read_text())['details'].values()}
    pack = json.loads((OUT / 'pack.json').read_text())
    contrast = {s['id'] for s in pack['skills'] if s['subject'] == 'contrast'}
    pack_locs = [l for l in pack['locations'] if not set(l['skillIds']) & contrast]
    duel = {l['panoId']: l['skillIds'][0] for l in pack_locs if l['skillIds'][0].startswith('sprint:duel:')}
    used = {l['panoId'] for l in pack_locs} - set(duel)
    old = json.loads((OUT / 'contrast.json').read_text()) if since else []
    used |= {c['location']['panoId'] for c in old}
    pack_ids = {s['curriculum']['source']['clue'] for s in pack['skills']}

    lost, rounds = collections.Counter(), collections.defaultdict(list)
    for r in json.loads((HERE / 'duels/rounds.json').read_text()):
        if max_error.get(r['map'], 0) < 14_000_000:
            continue
        ka, kb = side_of(r, to_code.get(r['myGuessCountry']))
        if ka and kb and ka != kb:
            lost[ka, kb] += max(0, (r['theirScore'] or 0) - (r['myScore'] or 0))
            rounds[ka, kb].append(r)
    weight = collections.Counter()
    for (ka, kb), v in lost.items():
        weight[frozenset((ka, kb))] += v
    regional = frozenset(REGIONS)
    pairs = list(dict.fromkeys([frozenset(p) for p in REQUIRED] + [regional] * (regional in weight)
                               + [p for p, _ in weight.most_common() if not p & regional]))[:PAIRS]
    if since:
        have = {frozenset(c['id'].split(':')[2].split('-')) for c in old}
        recent = collections.Counter()
        for (ka, kb), rs in rounds.items():
            recent[frozenset((ka, kb))] += sum(max(0, (r['theirScore'] or 0) - (r['myScore'] or 0))
                                               for r in rs if (r['endTime'] or '') >= since)
        pairs = [p for p in dict.fromkeys([p for p, v in recent.items() if v > NEW_MIN]
                                          + [frozenset(w.split('-')) for w in wanted]) if p not in have]
        print('new pairs', [(sorted(p), recent[p]) for p in pairs])
    pairs.sort(key=lambda p: -weight[p])

    clues = json.loads((HERE / 'clues.json').read_text())
    regions = json.loads((HERE / 'gap/clue-regions.json').read_text())
    survey = {s['id']: s['survey'] for s in map(json.loads, SURVEY.open())} if SURVEY.exists() else {}
    lm = curate.lm_by_country()
    side = {k: texts('BR', units, names, clues, lm, pack_ids, regions, REGIONS[k][1]) if k in REGIONS
            else texts(k, units, names, clues, lm, pack_ids, regions) for p in pairs for k in p}
    jobs = []
    for p in pairs:
        for ka, kb in sorted(((x, y) for x in p for y in p if x != y), key=lambda d: -lost[d]):
            fresh = sorted((r for r in rounds[ka, kb] if r['view'].get('panoId') and r['view']['panoId'] not in used),
                           key=lambda r: (r['view']['panoId'] in duel, r['endTime'] or ''))
            if not fresh or not side[ka] or not side[kb]:
                if rounds[ka, kb]:
                    print('no card for', ka, kb, 'fresh rounds', len(fresh), 'texts', len(side[ka]), len(side[kb]))
                continue
            pano = fresh[0]['view']['panoId']
            used.add(pano)
            cc = 'BR' if ka in REGIONS else ka
            jobs.append({'a': label(ka), 'b': label(kb), 'ka': ka, 'kb': kb, 'cc': cc, 'country': names.get(cc, cc),
                         'mode': 'regional' if ka in REGIONS else 'identify', 'round': fresh[0],
                         'survey': survey.get(fresh[0]['id']), 'n': len(rounds[ka, kb]), 'lost': lost[ka, kb],
                         'duel': duel.get(pano), 'side_a': side[ka], 'side_b': side[kb]})

    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    with cf.ThreadPoolExecutor(WORKERS) as pool:
        results = list(pool.map(lambda j: tells(j, cache), jobs))
    out = [card(j, kept, rank) | ({'added': since} if since else {})  # sprint.py leads with cards added this session
           for rank, (j, kept) in enumerate(((j, k) for j, k in zip(jobs, results) if k), len(old) + 1)]
    (OUT / 'contrast.json').write_text(json.dumps(old + out, ensure_ascii=False, indent=1) + '\n')
    for j, k in zip(jobs, results):
        print(f"{j['ka']}->{j['kb']}", 'failed' if k is None else f'{len(k)} tells', j['round']['id'])
    print(len(out), 'contrast cards over', len({frozenset((j['ka'], j['kb'])) for j, k in zip(jobs, results) if k}), 'pairs')


if __name__ == '__main__':
    main(*sys.argv[1:2])
