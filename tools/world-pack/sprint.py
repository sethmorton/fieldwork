#!/usr/bin/env python3
"""Sprint pack for A Competitive World (docs/sprint-plan.md): every ACoW country's utility pole, vegetation/landscape,
road line and Google car clues, aimed at what Seth still gets wrong.

  1. mode per country from all your world-map duel rounds: 'regional' when you already identify it (REGIONAL_RULE), so
     its clues place you within it; else 'identify', so its clues tell it apart from its confusions
  2. quota per country: 6 for regional countries with ACoW shares of 2% or more, 2 for other shares of 0.2% or more,
     else 1, then the rest of TOTAL by 0.4 * ACoW share + 0.6 * wrong-country involvement over all your world-map duel
     rounds (each round weighted by its answer country's ACoW share), at most CAP per country; roads and car on top
  3. candidates: Plonk It tips (infrastructure, landscape, agriculture, signs and text, car and camera, and the
     unlabelled country-identification tips) with a source-authored example, and the exported Learnable Meta metas of
     that country; regional countries keep only the regional ones
  4. a small model (curate.MODEL) edits each country's candidates down to its quota (cached in sprint/judge.json), and
     CHECK_MODEL validates each roads and car pick's teaching quote (cached in sprint/subject-check.json)
  5. 'duel' cards ("Your rounds", sprint_rounds.py): your recent missed rounds on their own panoramas, about every 3rd
     new card
  6. deck cards (DECKS): every meta of a whole Learnable Meta map, past the judge and quotas, on the locations
     sprint_decks.py verified, leading the new cards 1 in 3; a meta repeating a pick tops that card up to 3 locations
  7. sprint/pack.json
ACoW countries without a Plonk It guide use the Learnable Meta maps named after them: `sprint.py wanted` lists their
metas, and the DECKS metas, without exported locations in sprint/export-wanted.json for `harvest_lm.py export`.
Personal data (duel rounds): WORLD_PACK_DATA must be outside the repository.
Usage: WORLD_PACK_DATA=<caches> WORLD_PACK_INPUTS=<inputs> python3 tools/world-pack/sprint.py [wanted]
"""
import collections
import concurrent.futures as cf
import datetime as dt
import itertools
import json
import os
import sys
import time
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
if __name__ == '__main__' and (not os.environ.get('WORLD_PACK_DATA') or Path(os.environ['WORLD_PACK_DATA']).resolve()
                               .is_relative_to(REPO)):
    sys.exit('Set WORLD_PACK_DATA to a data folder outside the repository: duel history is personal.')
import collect
import curate
import sprint_rounds
import text
from build import SETTING_RANK, card_image, note_html, read_jsonl
from text import HERE, WORK

OUT = HERE / 'sprint'
TOTAL, CAP, BIG_SHARE, REGIONAL_BIG = 270, 8, 0.002, 0.02
# Regional when Seth answers the country at least 6 times, identifies it in 75% of them, and guesses it wrongly in at
# most a quarter as many rounds.
REGIONAL_RULE = lambda n, hit, false: n >= 6 and hit >= 0.75 * n and false <= 0.25 * n
# Curation (modes, quotas, confusions, so the judge prompts and every card id) uses only rounds that ended before this:
# card ids must stay stable while Seth plays. Newer rounds still become 'duel' cards. Move it only to re-curate.
STATS_UNTIL = '2026-10-25T07:00'
KINDS = {'infrastructure', 'landscape-and-vegetation', 'agriculture', 'signs-and-text', 'car-and-camera'}
SUBJECTS = ('poles', 'landscape', 'roads', 'car')
# Introduction rhythm over the per-subject streams: poles most often, then landscape, then roads, then car.
PATTERN = ('poles', 'landscape', 'poles', 'roads', 'poles', 'landscape', 'car')
AUTHORED = {'plonkit-example-link', 'learnable-meta-export', 'learnable-meta-catalogue'}
EDITOR = """You are an EDITOR choosing what a fast learner practises for {country} on A Competitive World, a ranked
GeoGuessr map that is 87% rural with no moving: only what is visible from a rural road matters.
Pick only these four subjects:
- poles: utility poles (construction, tops, insulators, markings); not bollards, signs, guardrails or pylons
- landscape: vegetation and landscape (trees, crops, soil, terrain, mountains)
- roads: road line colours and patterns (centre and edge lines: colour, solid or dashed, single or double); not the
  road surface, signs or bollards
- car: the Google car or camera (snorkel, roof rack, car colour, antenna)
Pick {poles} poles and {landscape} landscape clues. If fewer distinct clues of one subject exist, give its unused slots
to the other subject; stop early only when the rest are off-subject or repeat a subject already picked. Return no picks
only when no candidate is about utility poles or vegetation/landscape at all; a local landscape clue (mountains near a
town) still counts. Poles matter most: include every distinct pole clue the candidates support (pole construction,
tops, insulators, numbering or marking styles) up to {poles}.
{focus}
Never pick two candidates that teach the same subject (the same pole type, tree, crop, soil or line pattern).
Per pick: id (exactly as listed, e.g. c12), subject, label (3 to 6 words naming the clue, drawn from its text), quote
(the one sentence of its text that teaches this clue, copied exactly), scope (country if the clue identifies {country}
nationwide, regional if it holds only in part of the country), importance (3 = learn first, 2 = solid, 1 = nice to
have)."""
IDENTIFY = """In each subject pick the broadest first: the clue that holds across most of {country} (its predominant pole
type, its predominant landscape) before regional variants. Skip clues so generic that they hold across a whole
continent (wooden poles in North America, eucalyptus in Australia) unless they tell {country} apart from the countries
Seth confuses it with. {confusions}Then prefer common, discriminative regional clues that cover substantial regions over
rare or local ones.
Roads: {roads}
Car: pick at most 1 car clue, and only when the candidate's text states that this car or camera identifies {country}
(its car meta). Otherwise pick no car clue."""
REGIONAL = """Seth already identifies {country} reliably. Pick clues that place him WITHIN it: which region, which state or
oblast. Prefer regions with the most ACoW weight and where his guesses miss.{subdiv} Never pick a clue that only
identifies the country or holds across all of it.
Roads: {roads}
Car: pick at most 1 car clue, and only when the candidate's text ties that car to a region of {country}. Otherwise pick
no car clue."""
ROADS = {'identify': 'also pick 1 roads clue, the road line pattern that holds across most of the country.',
         'regional': 'also pick 1 roads clue if road lines differ between its regions; otherwise none.'}
# Roads and car picks get a second, stronger text-only check of their teaching quote: the editor model also passes
# guardrails as road lines, and camera generations or plain white cars as car clues.
CHECK_MODEL = 'gpt-6.1-sol'
CHECKS = {
    'roads': """A GeoGuessr study card for {country} teaches this road line clue: {label}
Teaching quote: {quote}

Is this quote about road LINE colours or patterns (centre or edge lines)? Guardrails, signs, bollards, road surface
or road numbers do NOT count. Give a one-sentence reason, then answer yes or no.""",
    'car': """A GeoGuessr study card for {country} teaches this Google car clue: {label}
Teaching quote: {quote}
Seth confuses {country} with: {rivals}.

Is this quote about a PHYSICAL Google car feature visible in the panorama (car colour, roof rack, snorkel, antenna,
tape, visible car body), AND does it tell {country} apart from those listed countries (only they matter here)? Camera
generation, camera quality, coverage age or blur alone do NOT count, nor a plain white car with nothing else
distinctive. Give a one-sentence reason, then answer yes or no.""",
    # A regional country's car clue places Seth within it, so it is checked against regions, not rival countries.
    'car-regional': """A GeoGuessr study card for {country} teaches this Google car clue: {label}
Teaching quote: {quote}

Is this quote about a PHYSICAL Google car feature visible in the panorama (car colour, roof rack, snorkel, antenna,
tape, visible car body) that the source ties to a region of {country}? Camera generation, camera quality, coverage age
or blur alone do NOT count. Give a one-sentence reason, then answer yes or no."""}
CHECK_SCHEMA = {'type': 'object', 'additionalProperties': False, 'required': ['reason', 'answer'],
                'properties': {'reason': {'type': 'string'}, 'answer': {'type': 'string', 'enum': ['yes', 'no']}}}
# Learnable Meta maps taught whole, each named after its country ('A Learnable Meta Brazil Poles').
DECKS = ['682f72974b4204c8b6a3cc6d']
REPEAT = """A GeoGuessr study pack for {country} has these cards:
{cards}

New clue from a Learnable Meta map for {country}:
{clue}

Is the new clue about utility poles or about vegetation and landscape? Does it teach the same clue as one of the cards
of that subject above (the same pole type, marking, insulator, plant or terrain)? Give a one-sentence reason, the
subject, and the number of the card it repeats, or 0 if it repeats none."""
REPEAT_SCHEMA = {'type': 'object', 'additionalProperties': False, 'required': ['reason', 'subject', 'card'],
                 'properties': {'reason': {'type': 'string'}, 'subject': {'type': 'string', 'enum': ['poles', 'landscape']},
                                'card': {'type': 'integer'}}}


def urban_shares():
    """ISO2 -> urban share of ACoW locations, from the distribution sheet's third tab (CountryCode/REST/URBAN in
    columns B/E/F, I/L/M, P/S/T and W/Z/AA below a two-row header)."""
    m = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
    book = zipfile.ZipFile(HERE / 'acow/acowdist.xlsx')
    strings = [''.join(t.text or '' for t in si.iter(m + 't')) for si in ET.fromstring(book.read('xl/sharedStrings.xml'))]
    counts = collections.defaultdict(lambda: [0.0, 0.0])
    for row in list(ET.fromstring(book.read('xl/worksheets/sheet3.xml')).iter(m + 'row'))[2:]:
        cells = {''.join(ch for ch in c.get('r') if ch.isalpha()): strings[int(v.text)] if c.get('t') == 's' else v.text
                 for c in row for v in [c.find(m + 'v')] if v is not None}
        for code, rest, urban in (('B', 'E', 'F'), ('I', 'L', 'M'), ('P', 'S', 'T'), ('W', 'Z', 'AA')):
            if cells.get(code):
                counts[cells[code]][0] += float(cells[rest])
                counts[cells[code]][1] += float(cells[urban])
    return {cc: round(u / (r + u), 3) for cc, (r, u) in counts.items() if r + u}


def first_sentence(note):
    return (text.sentences(note.strip()) or [''])[0]


def duel_stats(to_code, share):
    """Per ISO2: ACoW rounds played there and guessed in another country (the card's relevance line), and over all
    world-map rounds (maxErrorDistance 14,000 km or more, as in win/WinStats.md): wrong-country involvement (answer there
    and guessed elsewhere, or the reverse), each round weighted by its answer country's ACoW share; pair counts; rounds
    answered there (n), guessed right (hit), guessed there wrongly (false) and points lost to the opponent there; only
    rounds that ended before STATS_UNTIL."""
    max_error = {g['options']['map']['name']: g['options']['map']['maxErrorDistance']
                 for g in json.loads((HERE / 'duels/raw.json').read_text())['details'].values()}
    played, wrong, involved = collections.Counter(), collections.Counter(), collections.Counter()
    world = {k: collections.Counter() for k in ('n', 'hit', 'false', 'lost')}
    confused = collections.defaultdict(collections.Counter)
    for r in json.loads((HERE / 'duels/rounds.json').read_text()):
        if max_error.get(r['map'], 0) < 14_000_000 or (r['endTime'] or '') >= STATS_UNTIL:
            continue
        cc, guess, acow = r['countryCode'], to_code.get(r['myGuessCountry']), r['map'] == 'A Competitive World'
        played[cc] += acow
        world['n'][cc] += 1
        world['hit'][cc] += guess == cc
        world['lost'][cc] += (r['theirScore'] or 0) - (r['myScore'] or 0)
        if guess and guess != cc:
            wrong[cc] += acow
            world['false'][guess] += 1
            involved[cc] += share.get(cc, 0)
            involved[guess] += share.get(cc, 0)
            confused[cc][guess] += 1
            confused[guess][cc] += 1
    return played, wrong, involved, confused, world


def quotas(share, involved, mode):
    """Base items per country, then one more at a time by D'Hondt over the quota weight, capped at CAP."""
    total_inv = sum(involved[cc] for cc in share) or 1
    weight = {cc: 0.4 * s + 0.6 * involved[cc] / total_inv for cc, s in share.items()}
    base = {cc: 6 if mode[cc] == 'regional' and s >= REGIONAL_BIG else 2 if s >= BIG_SHARE else 1
            for cc, s in share.items()}
    quota = dict(base)
    while sum(quota.values()) < TOTAL and any(q < CAP for q in quota.values()):
        cc = max((c for c in quota if quota[c] < CAP), key=lambda c: weight[c] / (quota[c] - base[c] + 1))
        quota[cc] += 1
    return quota, weight


def subdivision_note(s):
    """The prompt's line on where a regional country's ACoW locations are and how Seth's regional guesses miss there
    (win/stats-subdiv.json)."""
    if not s:
        return ''
    top = ', '.join(f'{name} {part:.0%}' for name, _, part in s['acow_top_subdivs'])
    north, east = s['mean_offset_north_km'], s['mean_offset_east_km']
    worst = ', '.join(w['subdiv'] for w in sorted(s['worst_subdivs'], key=lambda w: -w['sum_deficit'])[:4])
    return (f" Its ACoW locations by region: {top}. In the right country his guess is in the right region only "
            f"{s['my_right_subdiv_rate']:.0%} of the time, on average {abs(north)}±{s['offset_north_se']} km too far "
            f"{'north' if north > 0 else 'south'} and {abs(east)}±{s['offset_east_se']} km too far "
            f"{'east' if east > 0 else 'west'}. Regions where he loses most to opponents: {worst}.")


def candidates(code_of_slug, country_at, guideless, decks):
    """{ISO2: {source id: candidate}} with prompt line, full text, stage, images, source and authored locations."""
    clues = {c['topicId']: c for c in json.loads((HERE / 'clues.json').read_text())}
    kinds = {f"plonkit:{slug}:{r['tipId']}": r['kind'] for slug, v in curate.load('curation.json').items() for r in v['order']}
    out = collections.defaultdict(dict)
    for tip in json.loads((HERE / 'clue-bank.json').read_text()):
        tid, cc = tip['topicId'], code_of_slug.get(tip['slug'])
        locs = [l for l in tip['locations'] if l['source'] in AUTHORED]
        if not cc or not locs or kinds.get(tid, 'unlabelled') not in KINDS | {'unlabelled'}:
            continue
        c = clues[tid]
        out[cc][tid] = {'line': f"[{c['stage']} | {c['section']}] {c['text'][:350]}", 'text': c['text'],
                        'why': first_sentence(c['text']), 'stage': c['stage'], 'noteFields': {'noteLicense': 'CC BY-NC-SA 4.0'},
                        'images': [card_image(u) for u in c['imageUrls'][:3]], 'locs': locs,
                        'source': {'title': f"Plonk It · {c['title']}", 'url': c['tipUrl']},
                        'attributionHtml': f'Description and image from <a href="{c["tipUrl"]}">Plonk It</a> '
                                           '(CC BY-NC-SA 4.0, https://creativecommons.org/licenses/by-nc-sa/4.0/).'}
    # Learnable Meta: no stage of its own (the model judges each pick's scope). Its note is not redistributable, so the
    # app fetches it live from the meta's own map by panorama: a candidate keeps only its own map's locations, and the
    # same note copied into another map is skipped.
    exports = {(e['mapId'], e['metaId']): e['locations'] for e in read_jsonl(HERE / 'lm/exports.jsonl')}
    units = {curate.country_key(u['title']): u for u in guide_units()}
    groups = [(code_of_slug[units[key]['slug']], units[key]['slug'], units[key]['title'], ms, False)
              for key, ms in curate.lm_by_country().items()] + [(cc, '', title, ms, False) for cc, (title, ms) in guideless.items()] \
        + [(cc, '', title, ms, True) for cc, (title, ms) in decks.items()]
    for cc, slug, title, ms, deck in groups:
        seen = set()
        for meta in ms:
            note = text.plain(meta['note'] or '').strip()
            locs = [{**v, 'country': actual, 'source': 'learnable-meta-export', 'sourceMapId': meta['mapId']}
                    for v in exports.get((meta['mapId'], meta['metaId']), []) if v.get('panoId')
                    for actual, same in [text.in_guide_country(v, slug, title, country_at)] if same]
            if not cc or not locs or note in seen:
                continue
            seen.add(note)
            sid = f"lm:{meta['mapId']}:{meta['metaId']}"
            url = f"https://learnablemeta.com/maps/{meta['mapId']}"
            out[cc][sid] = {
                'line': f"[Learnable Meta | {meta['mapName']}] {meta['metaName']}: {note[:350]}",
                'text': f"{meta['metaName']}\n{note}", 'why': first_sentence(note or meta['metaName']), 'stage': None,
                'noteFields': {'notesSourceMapId': meta['mapId'], 'sourceMetaName': meta['metaName']},
                'images': meta['images'][:3], 'locs': locs,
                'source': {'title': f"Learnable Meta · {meta['mapName']}", 'url': url},
                'attributionHtml': f'From the Learnable Meta map <a href="{url}">{meta["mapName"]}</a>.',
                # A DECKS meta skips the judge: titled by its own name, its note shown verbatim.
                **({'deck': True, 'label': meta['metaName'].strip(), 'noteHtml': meta['note']} if deck else {})}
    return out


def guide_units():
    inventory = json.loads((WORK / 'location-database/foundations/all-guide-topic-inventory.json').read_text())
    return [u for u in inventory['units'] if u['coverageUnitType'] == 'country-or-territory']


def guideless_metas(names, countries):
    """{ISO2: (name, [meta])} for these countries (ACoW ones without a Plonk It guide): Learnable Meta metas no guide
    matched, from maps whose name contains the country's name as words ('A Learnable Meta Paraguay') or whose meta name
    starts with it ('Bosnia and Herzegovina - Serbian')."""
    keys = {f' {curate.country_key(names[cc])} ': cc for cc in countries}
    out = {cc: (names[cc], []) for cc in countries}
    for m in json.loads((HERE / 'lm/matches.json').read_text()):
        if m['country'] is None:
            cc = next((c for k, c in keys.items() if k in f" {curate.country_key(m['mapName'])} "
                       or k == f" {curate.country_key(m['metaName'].split(' - ')[0])} "), None)
            if cc:
                out[cc][1].append(m)
    return out


def judge(jobs):
    """{ISO2: [pick]} from one small-model call per country, cached by fingerprint of model, prompt and candidates.
    Candidates are listed as c1, c2, ... (the model mangles long source ids); picks carry their source id."""
    path = OUT / 'judge.json'
    known = json.loads(path.read_text()) if path.exists() else {}
    sch = curate.schema({'id': {'type': 'string'}, 'subject': {'type': 'string', 'enum': list(SUBJECTS)},
                         'label': {'type': 'string'}, 'quote': {'type': 'string'},
                         'scope': {'type': 'string', 'enum': ['country', 'regional']},
                         'importance': {'type': 'integer', 'enum': [1, 2, 3]}})
    prompts = {cc: f"{EDITOR.format(country=name, poles=-(-quota // 2), landscape=quota // 2, focus=focus)}\n\n"
                   "Candidates (id [stage or source | section] text):\n"
                   + '\n'.join(f"c{n} {c['line']}" for n, c in enumerate(cands.values(), 1))
               for cc, (name, quota, _, focus, cands) in jobs.items()}
    stamp = {cc: curate.fingerprint(curate.MODEL, sch, p) for cc, p in prompts.items()}
    todo = [cc for cc in prompts if known.get(cc, {}).get('fingerprint') != stamp[cc]]
    print(f'judging {len(todo)} of {len(prompts)} countries with {curate.MODEL}', flush=True)

    def one(cc):
        try:  # an empty answer gets one more try: it is allowed only when nothing is on subject, and the model wavers
            return cc, curate.ask(prompts[cc], sch)['results'] or curate.ask(prompts[cc], sch)['results']
        except Exception as e:
            print('judge failed', cc, e, flush=True)
            return cc, None
    with cf.ThreadPoolExecutor(12) as pool:
        for cc, picks in pool.map(one, todo):
            if picks is not None:
                known[cc] = {'fingerprint': stamp[cc], 'model': curate.MODEL, 'picks': picks}
                path.write_text(json.dumps(known, ensure_ascii=False))
    out = {}
    for cc, (_, quota, nroads, _, cands) in jobs.items():
        picks = known[cc]['picks'] if known.get(cc, {}).get('fingerprint') == stamp[cc] else []
        ids = {f'c{n}': sid for n, sid in enumerate(cands, 1)}
        by_id = {}
        for p in picks:
            if p['id'] in ids:
                by_id.setdefault(ids[p['id']], {**p, 'id': ids[p['id']]})
        # Enforce the quotas: up to ceil(quota/2) poles, the rest landscape (unused slots to the other subject), plus up
        # to nroads roads and 1 car clue on top.
        ps = collections.defaultdict(list)
        for p in by_id.values():
            ps[p['subject']].append(p)
        np = min(len(ps['poles']), max(-(-quota // 2), quota - len(ps['landscape'])))
        out[cc] = ps['poles'][:np] + ps['landscape'][:quota - np] + ps['roads'][:nroads] + ps['car'][:1]
    return out


def subject_check(picks, cands, name, rivals, mode):
    """Picks without the roads and car picks whose teaching quote CHECK_MODEL rejects (sprint/subject-check.json)."""
    check = lambda cc, p: CHECKS['car-regional' if p['subject'] == 'car' and mode[cc] == 'regional' else p['subject']]
    answers = curate.ask_cached(OUT / 'subject-check.json', {
        (cc, p['id']): check(cc, p).format(country=name(cc), label=p['label'], quote=teaching(cands[cc], p),
                                           rivals=rivals(cc) or 'no country in particular')
        for cc, ps in picks.items() for p in ps if p['subject'] in CHECKS}, CHECK_SCHEMA, CHECK_MODEL)
    ok = lambda cc, p: p['subject'] not in CHECKS or answers.get((cc, p['id']), {}).get('answer') == 'yes'
    dropped = collections.Counter(p['subject'] for cc, ps in picks.items() for p in ps if not ok(cc, p))
    print('subject check dropped', dict(dropped), flush=True)
    return {cc: [p for p in ps if ok(cc, p)] for cc, ps in picks.items()}


def deck_repeats(picks, cands, name):
    """{(ISO2, deck source id): (subject, source id of the pole or landscape pick of that subject it repeats, or None)}
    (CHECK_MODEL, sprint/deck-repeats.json)."""
    shown = {cc: [p for p in picks.get(cc, []) if p['subject'] in ('poles', 'landscape')] for cc in cands}
    answers = curate.ask_cached(OUT / 'deck-repeats.json', {
        (cc, sid): REPEAT.format(country=name(cc), clue=c['text'], cards='\n'.join(
            f"{n}. [{p['subject']}] {p['label']}: {cs[p['id']]['text'][:400]}" for n, p in enumerate(shown[cc], 1)))
        for cc, cs in cands.items() for sid, c in cs.items() if c.get('deck')}, REPEAT_SCHEMA, CHECK_MODEL)
    out = {}
    for (cc, sid), a in answers.items():
        same = shown[cc][a['card'] - 1] if 0 < a['card'] <= len(shown[cc]) else None
        out[cc, sid] = (a['subject'], same['id'] if same and same['subject'] == a['subject'] else None)
    return out


def teaching(cands, p):
    """The card's why line: the model's quote, whole, only when it is verbatim source text, else the source's first
    sentence."""
    c = cands[p['id']]
    return p['quote'] if p.get('quote') and p['quote'] in c['text'] else c['why']


def sprinkle(base, extra, every):
    """base with one extra item after every (every - 1) base items; leftover extras at the end."""
    queue = collections.deque(extra)
    out = [x for n, b in enumerate(base, 1) for x in [b] + ([queue.popleft()] if n % (every - 1) == 0 and queue else [])]
    return out + list(queue)


def main(wanted=False):
    OUT.mkdir(exist_ok=True)
    world = json.loads((WORK / 'worldwide/countries-50m.geojson').read_text())
    props = [f['properties'] for f in world['features']]
    to_code = {p[k]: p['ISO_A2_EH'] for p in props for k in ('NAME', 'ADMIN')}
    units = guide_units()
    code_of_slug = {u['slug']: (u.get('code') or '').split('-')[0] for u in units}
    # Natural Earth gives two Australian dependencies Australia's code; they have no ISO code of their own.
    names = {code_of_slug[u['slug']]: u['title'] for u in units} | {
        p['ISO_A2_EH']: p['NAME_EN'] for p in props if p['TYPE'] != 'Dependency' or p['ISO_A2'] == p['ISO_A2_EH']}
    weights = json.loads((HERE / 'acow/weights.json').read_text())['countries']
    share = {cc: w / sum(weights.values()) for cc, w in weights.items()}
    guideless = guideless_metas(names, sorted(set(share) - set(code_of_slug.values())))
    decks = {cc: (n, [m for m in ms if m['mapId'] in DECKS]) for cc, (n, ms) in guideless_metas(names, share).items()}
    if wanted:  # their metas' map-maker locations, for harvest_lm.py export
        exported = {(e['mapId'], e['metaId']) for e in read_jsonl(HERE / 'lm/exports.jsonl')}
        rows = [{'metaId': m['metaId'], 'mapId': m['mapId']} for _, ms in [*guideless.values(), *decks.values()] for m in ms
                if m['locationsCount'] and (m['mapId'], m['metaId']) not in exported]
        (OUT / 'export-wanted.json').write_text(json.dumps(rows))
        print(f'{len(rows)} metas to export for {", ".join(cc for cc, (_, ms) in [*guideless.items(), *decks.items()] if ms)}')
        return
    played, wrong, involved, confused, stats = duel_stats(to_code, share)
    mode = {cc: 'regional' if REGIONAL_RULE(stats['n'][cc], stats['hit'][cc], stats['false'][cc]) else 'identify'
            for cc in share}
    quota, qweight = quotas(share, involved, mode)
    name = lambda cc: names.get(cc, cc)
    relevance = lambda cc: f'Your ACoW duels: {played[cc]} rounds in {name(cc)}, {wrong[cc]} guessed wrong country.'
    print('code  share      n  idRate  false  mode      quota')
    for cc in sorted(share, key=lambda c: -share[c])[:25]:
        n = stats['n'][cc]
        print(f"{cc:4} {share[cc]:6.2%} {n:6} {stats['hit'][cc] / n if n else 0:7.2f} {stats['false'][cc]:6}  "
              f"{mode[cc]:9} {quota[cc]}")
    print(f'total {sum(quota.values())}', flush=True)

    cands = candidates(code_of_slug, collect.bc.geolocator(world), guideless, decks)
    # A regional country keeps only within-country candidates: the Plonk It stage, or a Learnable Meta meta (no stage),
    # whose pick the model must scope 'regional'.
    cands = {cc: {sid: c for sid, c in cs.items() if mode[cc] == 'identify' or c['stage'] in (None, 'within-country-regional')}
             for cc, cs in cands.items() if cc in share}
    rivals = lambda cc: ', '.join(name(o) for o, _ in confused[cc].most_common(5))
    subdiv = json.loads((HERE / 'win/stats-subdiv.json').read_text())

    def focus(cc):
        roads = ROADS[mode[cc]] if share[cc] >= BIG_SHARE else 'pick no roads clue.'
        if mode[cc] == 'regional':
            return REGIONAL.format(country=name(cc), subdiv=subdivision_note(subdiv.get(cc)), roads=roads)
        return IDENTIFY.format(country=name(cc), roads=roads, confusions=(
            f"Seth confuses {name(cc)} with {rivals(cc)}: prefer clues that tell them apart.\n" if rivals(cc) else ''))
    judged = {cc: {sid: c for sid, c in cs.items() if not c.get('deck')} for cc, cs in cands.items()}
    jobs = {cc: (name(cc), quota[cc], int(share[cc] >= BIG_SHARE), focus(cc), judged[cc]) for cc in quota if judged.get(cc)}
    picks = {cc: [p for p in ps if mode[cc] == 'identify' or cands[cc][p['id']]['stage'] or p.get('scope') == 'regional']
             for cc, ps in judge(jobs).items()}
    picks = subject_check(picks, cands, name, rivals, mode)

    regions = json.loads((HERE / 'gap/clue-regions.json').read_text())
    subdivision = {s['SubdivisionCode']: s['Name'] for s in json.loads((HERE / 'gap/subdivisions.json').read_text())}
    setting_of = {r['id']: r['setting'] for r in read_jsonl(HERE / 'rurality.jsonl')}
    # Deck locations are labelled by panorama id (sprint_decks.py), the others by candidate id.
    setting = setting_of | {l['panoId']: setting_of[l['candidateId']] for t in json.loads((HERE / 'clue-bank.json').read_text())
                            for l in t['locations'] if l.get('candidateId') in setting_of}
    # Each country's broadest clue first: country identification (the Plonk It stage, or the model's scope for a Learnable
    # Meta clue), then nationwide, then regional; importance breaks ties.
    stage = lambda cc, p: cands[cc][p['id']]['stage'] or ('country-identification' if p.get('scope') == 'country'
                                                          else 'within-country-regional')
    breadth = lambda cc, p: (0 if stage(cc, p) == 'country-identification' else
                             1 if regions.get(p['id'], {}).get('nationwide') else 2, -p['importance'])
    picks = {cc: sorted(ps, key=lambda p: breadth(cc, p)) for cc, ps in picks.items()}
    duels_path = OUT / 'duel-views.json'  # optional: the learner's own duel panoramas, keyed by source clue id
    duels = json.loads(duels_path.read_text()) if duels_path.exists() else {}
    # Optional vision verdicts per panorama, plus panoramas the tile service no longer serves.
    verdicts_path, dead_path = HERE / 'win/location-verdicts.json', HERE / 'win/dead-panoramas.json'
    verdicts = json.loads(verdicts_path.read_text()) if verdicts_path.exists() else {}
    bad = {pano for pano, v in verdicts.items() if v in ('no', 'dead')} | (
        {d['locationId'].split(':')[-1] for d in json.loads(dead_path.read_text())['dead']} if dead_path.exists() else set())
    verdict_rank = {'yes': 0, 'partly': 1}
    skills, locations, used = [], [], set(bad)
    # Deck metas teach only on locations sprint_decks.py verified; one that repeats a pick tops up that card instead.
    extra, deck = collections.defaultdict(list), []
    for (cc, sid), (subject, repeat) in deck_repeats(picks, cands, name).items():
        c = cands[cc][sid]
        c['locs'] = [l for l in c['locs'] if verdicts.get(l['panoId']) == 'yes']
        if repeat:
            extra[repeat] += c['locs']
        else:
            deck.append(({'id': sid, 'subject': subject, 'label': c['label'], 'importance': 3,
                          'scope': 'regional' if mode[cc] == 'regional' else 'country'}, cc))
    # One stream per subject: identify clues by (the country's n-th card of that subject, points Seth loses there, as in
    # win/WinStats.md), alternating with regional clues by (n-th card, ACoW share). The subject streams are then drawn
    # from in PATTERN order.
    hardness = {cc: share[cc] * stats['lost'][cc] / max(stats['n'][cc], 1) for cc in share}

    def stream(subject):
        by_mode = {}
        for m, prio in (('identify', hardness), ('regional', share)):
            ranked = [(n, -prio[cc], p, cc) for cc, ps in picks.items() if mode[cc] == m
                      for n, p in enumerate(q for q in ps if q['subject'] == subject)]
            by_mode[m] = [(p, cc) for _, _, p, cc in sorted(ranked, key=lambda r: r[:2])]
        return collections.deque(pc for pair in itertools.zip_longest(by_mode['identify'], by_mode['regional'])
                                 for pc in pair if pc)
    queues = {s: stream(s) for s in SUBJECTS}
    cycles = []
    while any(queues.values()):
        cycles.append([queues[s].popleft() for s in PATTERN if queues[s]])
    prefer = lambda l: (verdict_rank.get(verdicts.get(l['panoId']), 2), SETTING_RANK.get(setting.get(l['panoId']), 1))

    def add_skill(p, cc):
        """The pick's skill on up to 2 unused source locations, then Seth's duel views, then a repeating deck meta's
        locations up to 3 in all; no skill when none is left."""
        c, sid = cands[cc][p['id']], f"sprint:{cc}:{p['id']}"
        chosen = []
        for loc in sorted(c['locs'], key=prefer):
            if loc['panoId'] not in used and len(chosen) < 2:
                used.add(loc['panoId'])
                chosen.append(loc)
        mine = [d for d in duels.get(p['id'], []) if d['panoId'] not in used][:2]
        used.update(d['panoId'] for d in mine)
        if not chosen and not mine:
            return
        for loc in sorted(extra.get(p['id'], []), key=prefer):
            if loc['panoId'] not in used and len(chosen) + len(mine) < 3:
                used.add(loc['panoId'])
                chosen.append(loc)
        region = regions.get(p['id'])
        area = {'area': 'Nationwide'} if region and region['nationwide'] else {
            'area': ', '.join(subdivision[s] for s in region['subdivisions'])} if region and region['subdivisions'] else {}
        skills.append({
            'id': sid, 'title': f"{name(cc)} · {p['label']}", 'phase': p['subject'].capitalize(),
            'practiceFamily': f"{cc}:{p['subject']}", 'prerequisites': [], 'availability': 'available', 'importance': 100,
            'country': cc, 'countryName': name(cc), 'subject': p['subject'], 'mode': mode[cc], **area,
            'why': teaching(cands[cc], p),
            'relevance': relevance(cc),
            'sourceNoteHtml': c.get('noteHtml') or note_html(c['text'], None), **c['noteFields'], 'imageUrls': c['images'],
            'source': c['source'], 'attributionHtml': c['attributionHtml'],
            'curriculum': {'scope': 'country-identification' if breadth(cc, p)[0] == 0 else 'within-country-regional',
                           'rank': len(skills) + 1, 'source': {'clue': p['id']}}})
        src = [{'id': f"sprint:{loc['panoId']}", 'panoId': loc['panoId'], 'lat': loc['lat'], 'lng': loc['lng'],
                       'heading': loc['heading'] or 0, 'pitch': loc['pitch'] or 0, 'zoom': 0,  # ranked opens unzoomed
                       'skillIds': [sid], 'country': loc['country'], 'assessmentEligible': False,
                       **({'sourceMapId': loc['sourceMapId']} if 'sourceMapId' in loc else {}),
                       'provenance': {'kind': 'source-example', 'source': loc['source']}} for loc in chosen]
        mine = [{'id': f"sprint:duel:{d['panoId']}", 'panoId': d['panoId'], 'lat': d['lat'], 'lng': d['lng'],
                       'heading': d.get('heading') or 0, 'pitch': d.get('pitch') or 0, 'zoom': 0,
                       'skillIds': [sid], 'country': name(cc), 'assessmentEligible': False,
                       'note': f"Your ACoW duel, {d['date']}: the clue is visible here.",
                       'provenance': {'kind': 'duel-round', 'round': d['round']}} for d in mine]
        # The scheduler shows unused locations in order: teach on a source example, re-show on Seth's own duel.
        locations.extend(src[:1] + mine + src[1:])
    for cycle in cycles:
        for p, cc in cycle:
            add_skill(p, cc)

    # The country's own guide, not a subdivision's (united-states, not hawaii, whose code is US-HI).
    guide_url = {u['code']: f"https://www.plonkit.net/{u['slug']}" for u in units if u.get('code') and '-' not in u['code']}
    duel_skills, duel_locations = sprint_rounds.cards(
        json.loads((HERE / 'duels/rounds.json').read_text()), to_code, dt.datetime.now(dt.timezone.utc), skills, used,
        regions, duels, name, mode, relevance, guide_url)
    locations += duel_locations
    # Optional contrast cards (sprint/contrast.json: card objects, biggest-loss pairs first, each with its `location`),
    # after the duel cards so a duel card keeps its panorama.
    contrast_path = OUT / 'contrast.json'
    contrasts = []
    tells_path = OUT / 'tells.json'  # optional: {skill id: the one-line tell to look for}
    tells = json.loads(tells_path.read_text()) if tells_path.exists() else {}
    by_id = {s['id']: s for s in skills + duel_skills}
    for card in json.loads(contrast_path.read_text()) if contrast_path.exists() else []:
        card = dict(card)
        loc = card.pop('location', None)
        target = by_id.get(card.get('mergeIntoDuel'))
        if target:  # an 'A vs B' block for one of your rounds: added to that duel card, not a card of its own
            target['sourceNoteHtml'] += card['sourceNoteHtml']
            if target['id'] not in tells:
                target.setdefault('tell', card['why'])
        elif not card.get('mergeIntoDuel') and loc and loc['panoId'] not in used:
            used.add(loc['panoId'])
            contrasts.append({**card, 'subject': 'contrast'})
            locations.append({**loc, 'skillIds': [card['id']]})
    # Introduction order: a mistake duel card after every 2nd regular card, then a contrast card after every 5th card;
    # exposure duel cards make the tail, 1 in 5 from the last regular card on, the rest after everything else.
    regular = len(skills)
    for p, cc in deck:  # after the duel and contrast cards, so those keep their panoramas
        add_skill(p, cc)
    skills, deck = skills[:regular], skills[regular:]
    order = sprinkle(skills, [s for s in duel_skills if not s.get('exposure')], 3)
    order = sprinkle(order, contrasts, 6)
    last = max(i for i, s in enumerate(order) if s['subject'] in SUBJECTS) + 1 if regular else 0
    skills = order[:last] + sprinkle(order[last:], [s for s in duel_skills if s.get('exposure')], 5)
    skills = sprinkle(skills, deck, 3)  # deck cards lead the new cards, 1 in every 3: Seth wants them now
    for rank, s in enumerate(skills, 1):
        s['curriculum']['rank'] = rank
        if s['id'] in tells:
            s['tell'] = tells[s['id']]

    urban = urban_shares()
    covered = {s['country'] for s in skills}
    gaps = [name(cc) for cc in sorted(share, key=lambda c: -share[c]) if cc not in covered]
    pack = {'id': 'sprint-acow', 'title': 'Sprint · A Competitive World', 'subject': 'GeoGuessr', 'schemaVersion': 1,
            'contentRevision': int(time.time()), 'practiceMapId': '0' * 24, 'scheduler': 'sprint',
            'gradingPolicy': 'recognition', 'initialSkillIds': [],
            'answerAreaLabel': f'{len(covered)} of {len(share)} ACoW countries, poles, landscape, roads, car and your rounds',
            'coverageSummary': f'{len(skills)} clues across {len(covered)} countries'
                               + (f"; none yet for {', '.join(gaps)}" if gaps else ''),
            'skills': skills, 'locations': locations,
            # The World pack's source pool, like its other packs: the practice map itself must stay a separate owned map.
            'pools': [{'id': 'sprint-acow', 'title': 'Sprint', 'skillIds': [s['id'] for s in skills],
                       'mapUrl': json.loads((REPO / 'content/world.json').read_text())['pools'][0]['mapUrl']}],
            'atlas': {'countries': [{'code': cc, 'name': name(cc), 'acowShare': round(share[cc], 4), 'mode': mode[cc],
                                     'urbanShare': urban.get(cc), 'duelRounds': played[cc], 'wrongCountry': wrong[cc]}
                                    for cc in sorted(share, key=lambda c: -share[c])]}}
    (OUT / 'pack.json').write_text(json.dumps(pack, ensure_ascii=False, indent=1) + '\n')

    subjects = collections.defaultdict(set)
    for s in skills:
        subjects[s['country']].add(s['subject'])
    print(json.dumps({'skills': len(skills), 'locations': len(locations), 'countriesCovered': len(covered),
                      'countries': len(share), 'noCandidates': sorted(cc for cc in share if not cands.get(cc)),
                      'noPicks': sorted(cc for cc in share if cands.get(cc) and cc not in covered),
                      'missingPoles': sorted(cc for cc in covered if 'poles' not in subjects[cc]),
                      'missingLandscape': sorted(cc for cc in covered if 'landscape' not in subjects[cc])}, indent=1))
    print('per subject', dict(collections.Counter(s['subject'] for s in skills)))
    for s in skills[:20]:
        print(s['curriculum']['rank'], s['title'], '|', s['phase'], '|', s.get('area', '-'))
    for cc in ('RU', 'AU', 'NA'):
        print(f'{cc}:', ' / '.join(f"{s['title'].split(' · ', 1)[1]} ({s['subject']})" for s in skills
                                   if s['country'] == cc and s['subject'] in SUBJECTS))
    print('duel locations', sum(l['id'].startswith('sprint:duel:') for l in locations), 'duel cards', len(duel_skills))


if __name__ == '__main__':
    main(sys.argv[1:] == ['wanted'])
