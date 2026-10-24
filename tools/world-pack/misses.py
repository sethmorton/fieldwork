#!/usr/bin/env python3
"""Your own practice pack from the duel rounds you missed (lost, or guessed more than FAR_KM away).

Personal data: everything is read from and written to WORLD_PACK_DATA/duels/ (never the repo).
  lm     for missed rounds no Plonk It clue explains: a small model checks the round against the Learnable Meta metas of
         that country that no Plonk It tip covers (known community metas only, nothing invented) -> duels/lm.jsonl
  pack   duels/pack.json: one practice item per missed round, played on that round's own panorama (facing the clue,
         with what was visible as the round note), poles first, then landscape, then the rest
  verify check that every panorama in the pack is one of your own missed duel rounds, with a clue from its country
  guide  <DIR>/guide.html: a study guide built only from those rounds, utility poles then landscape, country by
         country in the order you lose points, each clue with every round you missed it in
Run after duels.py classify. Add the pack to .fieldwork.local.json additionalPacks with its own Fieldwork map.
Usage: WORLD_PACK_DATA=<caches> python3 tools/world-pack/misses.py lm [LIMIT]|pack|verify|guide DIR
"""
import concurrent.futures as cf
import html
import json
import shutil
import os
import sys
import time
from pathlib import Path

if __name__ == '__main__' and (not os.environ.get('WORLD_PACK_DATA') or Path(os.environ['WORLD_PACK_DATA']).resolve()
                               .is_relative_to(Path(__file__).resolve().parents[2])):
    sys.exit('Set WORLD_PACK_DATA to a data folder outside the repository: duel history is personal.')
import curate
import duels
import text
from duels import HERE, OUT, REPO

CHUNK = 120  # metas per call: one prompt stays short enough for the small model to read every line
REGIONAL = (' The player already had the right country, so list only metas that narrow down where in {country} this is '
            '(a region, state or area), not metas that only identify the country.')


def lm_candidates():
    """{country key: [candidate id]} and a prompt line per id, for Learnable Meta metas no Plonk It tip covers."""
    mapped = {m['metaId'] for v in json.loads((HERE / 'labels/meta-tips.json').read_text()).values()
              for m in v['metas'] if m.get('topicId')}
    by_country, line, meta = {}, {}, {}
    for m in json.loads((HERE / 'lm/matches.json').read_text()):
        if not m['country'] or m['metaId'] in mapped or m['metaId'] in meta:
            continue
        meta[m['metaId']] = m
        cid = f"lm:{m['country']}:{m['metaId']}"
        by_country.setdefault(m['country'], []).append(cid)
        line[cid] = f"[{m['metaId']}] {m['metaName']}: {text.plain(m['note'] or '')[:200]}"
    return by_country, line, meta


def gaps():
    """Missed rounds whose judgement found no Plonk It clue that counts as a miss."""
    bank = {b['topicId']: b for b in json.loads((HERE / 'clue-bank.json').read_text())}
    judged = duels.current_judgements()
    return [r for r in json.loads((OUT / 'rounds.json').read_text())
            if duels.is_missed(r) and r['id'] in judged and judged[r['id']].get('skipped') != 'panorama gone'
            and not duels.round_misses(r, judged[r['id']], bank)]


def lm_stamps(by_country, line):
    """Per country key: fingerprint of the model, the regional instruction and every candidate meta line."""
    return {key: curate.fingerprint(curate.MODEL, REGIONAL, *(line[c] for c in ids)) for key, ids in by_country.items()}


def lm_judgements(by_country, line):
    """Latest Learnable Meta judgement per current gap round, made with the current candidates (empty ones too)."""
    path = OUT / 'lm.jsonl'
    stamp = lm_stamps(by_country, line)
    key = {r['id']: curate.country_key(r['country'] or '') for r in gaps()}
    return {rec['id']: rec for rec in map(json.loads, path.read_text().splitlines() if path.exists() else [])
            if rec['id'] in key and rec['inputs'] == stamp.get(key[rec['id']])}


def lm(limit=None):
    by_country, line, _ = lm_candidates()
    out = OUT / 'lm.jsonl'
    stamp = lm_stamps(by_country, line)
    done = {(r['id'], r['inputs']) for r in map(json.loads, out.read_text().splitlines())} if out.exists() else set()
    key = {r['id']: curate.country_key(r['country'] or '') for r in gaps()}
    todo = [r for r in gaps() if key[r['id']] in by_country and (r['id'], stamp[key[r['id']]]) not in done][:limit]

    def one(r):
        images = duels.frames(r)
        if not images:
            return None
        ids = by_country[key[r['id']]]
        picked = []
        for i in range(0, len(ids), CHUNK):
            ask = duels.context(r, len(images)) + (REGIONAL.format(country=r['country'])
                                                   if r['myGuessCountry'] == r['country'] else '')
            got = duels.visible_clues(images, r['country'], ask, ids[i:i + CHUNK], line, source='Learnable Meta')
            if got is None:
                return None  # retried on the next run
            picked += got['clues']
        return {'id': r['id'], 'inputs': stamp[key[r['id']]], 'clues': picked[:duels.MAX_CLUES]}

    with open(out, 'a') as f, cf.ThreadPoolExecutor(curate.WORKERS) as pool:
        for rec in pool.map(one, todo):
            if rec:
                f.write(json.dumps(rec, ensure_ascii=False) + '\n')
                f.flush()
    recs = [json.loads(l) for l in out.read_text().splitlines()] if out.exists() else []
    print(json.dumps({'gapRounds': len(key), 'judged': len(recs), 'withMeta': sum(bool(r['clues']) for r in recs)}))


LM_PROMPT = """Each numbered item is a Learnable Meta GeoGuessr meta for one country. For each give:
- scope: region if it narrows down where in the country you are (a state, region, area, or a feature found only in
  part of it); country if it only tells you which country you are in.
- kind: utility-poles (poles, pole markings, pole hardware); landscape (trees, plants, crops, soil, terrain, scenery);
  other (roads, signs, bollards, houses, cars, plates and everything else).

{items}

Return exactly {n} results, n=1..{n}."""
LM_SCHEMA = curate.schema({'n': {'type': 'integer'}, 'scope': {'type': 'string', 'enum': ['region', 'country']},
                           'kind': {'type': 'string', 'enum': ['utility-poles', 'landscape', 'other']}})


def lm_labels(metas):
    """{metaId: {'scope', 'kind'}} for these metas (small model, cached in labels/lm-labels.json)."""
    path = HERE / 'labels/lm-labels.json'
    known = json.loads(path.read_text()) if path.exists() else {}
    fp = {m['metaId']: curate.fingerprint(curate.MODEL, LM_PROMPT, m['metaName'], m['note']) for m in metas}
    todo = list({m['metaId']: m for m in metas if known.get(str(m['metaId']), {}).get('fingerprint') != fp[m['metaId']]}.values())
    for i in range(0, len(todo), 15):
        batch = todo[i:i + 15]
        items = '\n'.join(f"Item {n}: {m['metaName']}: {text.plain(m['note'] or '')[:300]}" for n, m in enumerate(batch, 1))
        for r in curate.ask(LM_PROMPT.format(items=items, n=len(batch)), LM_SCHEMA)['results']:
            if 1 <= r['n'] <= len(batch):
                m = batch[r['n'] - 1]
                known[str(m['metaId'])] = {'scope': r['scope'], 'kind': r['kind'], 'fingerprint': fp[m['metaId']]}
        path.write_text(json.dumps(known))
    return {int(k): v for k, v in known.items()}


# Seth's focus: poles first, then landscape (trees, plants, crops, terrain), then the rest.
FOCUS = {'utility-poles': 0, 'landscape-and-vegetation': 1, 'agriculture': 1, 'lm:utility-poles': 0, 'lm:landscape': 1}


def facing(r, frame):
    """Heading of the frame the clue was seen in (frames turn 90 degrees each unless rotation was forbidden)."""
    return r['view']['heading'] if r['movement'].get('forbidRotating') else (r['view']['heading'] + 90 * (frame - 1)) % 360


def missed_rounds():
    """{round id: [(clue id, judged clue), ...]} best first: Plonk It clues that count as misses, else Learnable Meta
    metas (region-scoped ones only when the guess was in the right country). Also returns the meta details and labels."""
    rounds = {r['id']: r for r in json.loads((OUT / 'rounds.json').read_text())}
    bank = {b['topicId']: b for b in json.loads((HERE / 'clue-bank.json').read_text())}
    by_country, line, meta = lm_candidates()
    picks = {}
    for rec in duels.current_judgements().values():
        for c in duels.round_misses(rounds[rec['id']], rec, bank):
            _, slug, tip = c['topicId'].split(':')
            picks.setdefault(rec['id'], []).append((f'world:pk:{slug}:{tip}', c))
    lm_recs = [rec for rec in lm_judgements(by_country, line).values() if rec['clues'] and rec['id'] not in picks]
    labels = lm_labels([meta[int(c['topicId'].split(':')[2])] for rec in lm_recs for c in rec['clues']])
    for rec in lm_recs:
        r = rounds[rec['id']]
        # As with Plonk It: a country-only meta is a miss only when the guess landed in the wrong country.
        kept = [(f"lm:{c['topicId'].split(':')[2]}", c) for c in rec['clues']
                if r['myGuessCountry'] != r['country'] or labels[int(c['topicId'].split(':')[2])]['scope'] == 'region']
        if kept:
            picks[rec['id']] = kept
    return rounds, picks, meta, labels


def clue_skill(cid, world_skills, meta, labels, country):
    """The clue as shown on a card: the World pack skill, or one built from a Learnable Meta meta."""
    if cid in world_skills:
        return world_skills[cid]
    m = meta[int(cid.split(':')[1])]
    url = f"https://learnablemeta.com/maps/{m['mapId']}"
    return {'title': f"{country} · {m['metaName']}", 'phase': 'Regional clues' if labels[m['metaId']]['scope'] == 'region' else 'Country clues',
            'practiceFamily': f"lm:{labels[m['metaId']]['kind']}", 'sourceNoteHtml': (m['note'] or '') + (m['footer'] or ''),
            'notesCountry': country, 'imageUrls': m['images'][:2], 'source': {'title': f"Learnable Meta · {m['mapName']}", 'url': url},
            'attributionHtml': f'From the Learnable Meta map <a href="{url}">{m["mapName"]}</a>.'}


def pack():
    """One skill per missed round, played on that round's own panorama only, so a full pass plays every round."""
    world = json.loads((REPO / 'content/world.json').read_text())
    world_skills = {s['id']: s for s in world['skills']}
    rounds, picks, meta, labels = missed_rounds()
    behind = duels.points_behind(rounds.values(), 'country')
    skills, locations, used = [], [], set()
    for rid, clues in picks.items():
        r = rounds[rid]
        if r['view']['panoId'] in used:  # one panorama serves one clue
            continue
        used.add(r['view']['panoId'])
        # The round's clue: a pole if one was visible, else landscape, else the model's best (Seth's focus).
        cid, c = min(clues, key=lambda cc: FOCUS.get(clue_skill(cc[0], world_skills, meta, labels, r['country'])['practiceFamily'], 2))
        clue = clue_skill(cid, world_skills, meta, labels, r['country'])
        # Outside every country polygon (a coast): GeoGuessr's own country, as named by the clue's guide.
        country = r['country'] or clue['notesCountry']
        skills.append({k: v for k, v in clue.items() if k not in ('id', 'curriculum', 'availability', 'actualImportedLocationCount')} | {
            'id': rid, 'prerequisites': [], 'importance': 100, 'availability': 'available',
            'curriculum': {'scope': 'within-country-regional', 'rank': 0, 'source': {'clue': cid, 'game': r['gameId'], 'round': r['round']}}})
        locations.append({'id': f'pano:{rid}', 'panoId': r['view']['panoId'], 'lat': r['view']['lat'], 'lng': r['view']['lng'],
                          # Facing where the clue was seen.
                          'heading': facing(r, c['frame']), 'pitch': 0, 'zoom': 0, 'skillIds': [rid], 'country': country,
                          'region': country, 'assessmentEligible': False, 'note': f"In your duel: {c['evidence']}",
                          'provenance': {'kind': 'duel-round', 'lost': r['lost']}})
    # Poles, then landscape, then the rest; inside each, the countries you lose most points in.
    skills.sort(key=lambda s: (FOCUS.get(s['practiceFamily'], 2), -behind.get(s['notesCountry'], 0), s['id']))
    for rank, s in enumerate(skills, 1):
        s['curriculum']['rank'] = rank
    result = {'id': 'duel-misses', 'title': 'Duel misses · the rounds you lost', 'subject': 'GeoGuessr', 'schemaVersion': 1,
              'contentRevision': int(time.time()), 'practiceMapId': '000000000000000000000000',
              'answerAreaLabel': 'Your missed duel rounds. Country accuracy; the clue is tracked through your answer',
              'gradingPolicy': 'recognition', 'maxLocationsPerCountry': 2, 'initialSkillIds': [],
              'regionFeatures': world['regionFeatures'],
              'coverageSummary': f'{len(skills)} of your missed competitive duel rounds, each on its own panorama.',
              'skills': skills, 'locations': locations,
              'pools': [{'id': 'duel-misses', 'title': 'Your missed duel rounds', 'skillIds': [s['id'] for s in skills],
                         'mapUrl': world['pools'][0]['mapUrl']}]}
    (OUT / 'pack.json').write_text(json.dumps(result, ensure_ascii=False))
    print(json.dumps({'rounds': len(skills), 'learnableMeta': sum(s['curriculum']['source']['clue'].startswith('lm:') for s in skills),
                      'poles': sum(FOCUS.get(s['practiceFamily']) == 0 for s in skills),
                      'landscape': sum(FOCUS.get(s['practiceFamily']) == 1 for s in skills)}))


def verify():
    """Every panorama in the pack is the panorama of one of your own duel rounds, in the country GeoGuessr gave it."""
    raw = json.loads((OUT / 'raw.json').read_text())
    rounds = {r['id']: r for r in json.loads((OUT / 'rounds.json').read_text())}
    p = json.loads((OUT / 'pack.json').read_text())
    skills = {s['id']: s for s in p['skills']}
    by_code, _ = duels.practice_clues()
    _, _, meta = lm_candidates()
    for loc in p['locations']:
        _, game, n = loc['skillIds'][0].split(':')
        g = raw['details'][game]
        assert any(pl['playerId'] == raw['userId'] for t in g['teams'] for pl in t['players']), loc['id']
        assert duels.pano_id(g['rounds'][int(n) - 1]['panorama']['panoId']) == loc['panoId'], loc['id']
        assert duels.is_missed(rounds[loc['skillIds'][0]]), loc['id']
        clue, r = skills[loc['skillIds'][0]]['curriculum']['source']['clue'], rounds[loc['skillIds'][0]]
        # The clue comes from the guide of the country GeoGuessr placed the round in.
        if clue.startswith('lm:'):
            assert meta[int(clue.split(':')[1])]['country'] == curate.country_key(r['country'] or ''), loc['id']
        else:
            _, _, slug, tip = clue.split(':')
            assert f'plonkit:{slug}:{tip}' in by_code[r['countryCode']], loc['id']
    print(json.dumps({'verified': len(p['locations']), 'allOwnDuelRounds': True}))


MODES = {'StandardDuels': 'Moving', 'NoMoveDuels': 'No Move', 'NmpzDuels': 'NMPZ'}
PARTS = ((0, 'Utility poles', 'Poles you could see in rounds you lost or guessed far away.'),
         (1, 'Landscape', 'Trees, plants, crops, soil and terrain from the same rounds.'))


def guide(target):
    """A study guide built only from your missed rounds, poles first, then landscape: each clue with its guide text and
    every round you missed it in. Round images are copied next to it, so the folder stands alone."""
    target = Path(target)
    (target / 'img').mkdir(parents=True, exist_ok=True)
    mine = json.loads((OUT / 'pack.json').read_text())
    rounds = {r['id']: r for r in json.loads((OUT / 'rounds.json').read_text())}
    pano = {loc['skillIds'][0]: loc for loc in mine['locations']}
    behind = duels.points_behind(rounds.values(), 'country')
    e = html.escape
    by_clue = {}
    for s in mine['skills']:
        by_clue.setdefault(s['curriculum']['source']['clue'], []).append(s)

    def shot(s):
        r, loc = rounds[s['id']], pano[s['id']]
        path = duels.collect.thumb({**r['view'], 'heading': loc['heading']}, 90.0)
        if not path:
            return ''
        shutil.copy(path, target / 'img' / path.name)
        when = r['endTime'][:10] if r.get('endTime') else ''
        how = f"you scored {r['theirScore'] - r['myScore']:,} fewer points" if r['lost'] else f"your guess was {round(r['myGuess']['distance'] / 1000):,} km off"
        return (f'<figure><img loading=lazy src="img/{path.name}"><figcaption>{e(loc["note"])} '
                f'<span class=credit><a href="https://www.geoguessr.com/duels/{r["gameId"]}/summary">{MODES.get(r["mode"], "")} duel, {when}, '
                f'round {r["round"]}</a>, {how}.</span></figcaption></figure>')

    body, total = [], 0
    for focus, title, dek in PARTS:
        clues = [(cid, ss) for cid, ss in by_clue.items() if FOCUS.get(ss[0]['practiceFamily'], 2) == focus]
        clues.sort(key=lambda kv: (-behind.get(kv[1][0]['notesCountry'], 0), -len(kv[1])))
        body.append(f'<h2 class=part>{title}</h2><p class=dek>{dek}</p>')
        country = None
        for cid, ss in clues:
            s = ss[0]
            if s['notesCountry'] != country:
                country = s['notesCountry']
                body.append(f'<h3 class=country>{e(country)}</h3>')
            image = f'<img class=guide loading=lazy src="{e(s["imageUrls"][0])}">' if s.get('imageUrls') else ''
            body.append(f'<article><p class=kicker>Missed in {len(ss)} round{"s" * (len(ss) > 1)}</p>'
                        f'<h4>{e(s["title"].split(" · ", 1)[-1])}</h4><p>{e(text.plain(s.get("sourceNoteHtml") or ""))}</p>'
                        f'{image}<p class=source>Source: <a href="{e(s["source"]["url"])}">{e(s["source"]["title"])}</a></p>'
                        f'{"".join(map(shot, ss))}</article>')
            total += len(ss)
    others = len(mine['skills']) - total
    page = f"""<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width"><title>What you keep missing</title><style>
body{{background:#fff;color:#121212;font:19px/1.6 Georgia,'Times New Roman',serif;margin:0}}main{{max-width:680px;margin:0 auto;padding:48px 20px 96px}}
.mast{{font:700 13px/1 'Helvetica Neue',Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;border-bottom:1px solid #121212;padding-bottom:10px}}
h1{{font:700 46px/1.1 Georgia,serif;margin:28px 0 12px}}.lede{{font-size:21px;color:#333}}
.by{{font:13px 'Helvetica Neue',Arial,sans-serif;color:#727272;border-bottom:1px solid #e2e2e2;padding-bottom:20px}}
h2.part{{font:700 34px/1.2 Georgia,serif;margin:72px 0 4px;border-top:3px double #121212;padding-top:20px}}.dek{{color:#555;font-style:italic;margin-top:0}}
h3.country{{font:700 13px 'Helvetica Neue',Arial,sans-serif;letter-spacing:.1em;text-transform:uppercase;margin:48px 0 0;border-bottom:1px solid #e2e2e2;padding-bottom:6px}}
article{{margin:28px 0 40px}}h4{{font:700 24px/1.25 Georgia,serif;margin:4px 0 10px}}.kicker{{font:700 12px 'Helvetica Neue',Arial,sans-serif;text-transform:uppercase;letter-spacing:.08em;color:#b3261e;margin:0}}
img{{width:100%;display:block}}img.guide{{max-height:380px;object-fit:contain;background:#f7f7f7;margin:12px 0 4px}}
figure{{margin:22px 0}}figcaption{{font:14px/1.45 'Helvetica Neue',Arial,sans-serif;color:#333;margin-top:6px}}
.credit,.source{{font:13px 'Helvetica Neue',Arial,sans-serif;color:#727272}}a{{color:#326891}}</style><main>
<div class=mast>Fieldwork &middot; Duel study guide</div>
<h1>What you keep missing</h1>
<p class=lede>Every clue below was visible in one of your own competitive duel rounds that you lost or guessed more than 500 km away. Poles first, then landscape, country by country in the order you lose points.</p>
<p class=by>{total} of your {len(mine['skills'])} missed rounds. The other {others} turn on roads, signs, plates and buildings and are left for later. Every photo is your round, turned to face the clue; the link opens the duel.</p>
{''.join(body)}</main>"""
    (target / 'guide.html').write_text(page)
    print(json.dumps({'rounds': total, 'clues': sum(1 for b in body if b.startswith('<article'))}))


if __name__ == '__main__':
    command, *rest = sys.argv[1:]
    {'lm': lambda: lm(int(rest[0]) if rest else None), 'pack': pack, 'verify': verify, 'guide': lambda: guide(rest[0])}[command]()
