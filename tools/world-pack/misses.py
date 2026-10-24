#!/usr/bin/env python3
"""Your own practice pack from the duel rounds you missed (lost, or guessed more than FAR_KM away).

Personal data: everything is read from and written to WORLD_PACK_DATA/duels/ (never the repo).
  lm     for missed rounds no Plonk It clue explains: a small model checks the round against the Learnable Meta metas of
         that country that no Plonk It tip covers (known community metas only, nothing invented) -> duels/lm.jsonl
  pack   duels/pack.json: every clue you missed, practised on the panorama you missed it on (facing the clue, with what
         was visible as the round note) plus the World pack's and Learnable Meta's other examples of the same clue
  guide  <DIR>/guide.html: a study guide to read before practising, country by country in the order you lose points:
         every utility pole, plate and phone code, tree and plant and terrain clue, the ones you missed first, each
         missed one with the duel panorama you missed it on
Run after duels.py classify. Add the pack to .fieldwork.local.json additionalPacks with its own Fieldwork map.
Usage: WORLD_PACK_DATA=<caches> python3 tools/world-pack/misses.py lm [LIMIT]|pack|guide DIR
"""
import collections
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


SCOPE_PROMPT = """Each numbered item is a Learnable Meta GeoGuessr meta for one country. For each give scope:
- region: it narrows down where in the country you are (a state, region, area, or a feature found only in part of it).
- country: it only tells you which country you are in.

{items}

Return exactly {n} results, n=1..{n}."""


def scopes(metas):
    """{metaId: 'region' | 'country'} for these metas (small model, cached in labels/lm-scope.json)."""
    path = HERE / 'labels/lm-scope.json'
    known = json.loads(path.read_text()) if path.exists() else {}
    fp = {m['metaId']: curate.fingerprint(curate.MODEL, SCOPE_PROMPT, m['metaName'], m['note']) for m in metas}
    todo = list({m['metaId']: m for m in metas if known.get(str(m['metaId']), {}).get('fingerprint') != fp[m['metaId']]}.values())
    for i in range(0, len(todo), 15):
        batch = todo[i:i + 15]
        items = '\n'.join(f"Item {n}: {m['metaName']}: {text.plain(m['note'] or '')[:300]}" for n, m in enumerate(batch, 1))
        got = curate.ask(SCOPE_PROMPT.format(items=items, n=len(batch)),
                         curate.schema({'n': {'type': 'integer'}, 'scope': {'type': 'string', 'enum': ['region', 'country']}}))
        for r in got['results']:
            if 1 <= r['n'] <= len(batch):
                m = batch[r['n'] - 1]
                known[str(m['metaId'])] = {'scope': r['scope'], 'fingerprint': fp[m['metaId']]}
        path.write_text(json.dumps(known))
    return {int(k): v['scope'] for k, v in known.items()}


def facing(r, frame):
    """Heading of the frame the clue was seen in (frames turn 90 degrees each unless rotation was forbidden)."""
    return r['view']['heading'] if r['movement'].get('forbidRotating') else (r['view']['heading'] + 90 * (frame - 1)) % 360


def pack():
    world = json.loads((REPO / 'content/world.json').read_text())
    skills = {s['id']: s for s in world['skills'] if s['availability'] == 'available'}
    world_locations = {}
    for loc in world['locations']:
        world_locations.setdefault(loc['skillIds'][0], []).append(loc)
    rounds = {r['id']: r for r in json.loads((OUT / 'rounds.json').read_text())}
    bank = {b['topicId']: b for b in json.loads((HERE / 'clue-bank.json').read_text())}
    by_country, line, meta = lm_candidates()
    lm_examples = {}
    for e in map(json.loads, (HERE / 'lm/exports.jsonl').read_text().splitlines()):
        lm_examples[e['metaId']] = e['locations']

    # Each missed round: its clues as skill ids, best first.
    picks = {}
    for rec in duels.current_judgements().values():
        r = rounds[rec['id']]
        for c in duels.round_misses(r, rec, bank):
            _, slug, tip = c['topicId'].split(':')
            picks.setdefault(r['id'], []).append((f'world:pk:{slug}:{tip}', c))
    lm_recs = [rec for rec in lm_judgements(by_country, line).values() if rec['clues'] and rec['id'] not in picks]
    scope = scopes([meta[int(c['topicId'].split(':')[2])] for rec in lm_recs for c in rec['clues']])
    for rec in lm_recs:
        r = rounds[rec['id']]
        # As with Plonk It: a country-only meta is a miss only when the guess landed in the wrong country.
        kept = [(f"duel:lm:{c['topicId'].split(':')[2]}", c) for c in rec['clues']
                if r['myGuessCountry'] != r['country'] or scope[int(c['topicId'].split(':')[2])] == 'region']
        if kept:
            picks[rec['id']] = kept

    out_skills, locations, misses, used = {}, [], {}, set()
    for rid, clues in picks.items():
        r = rounds[rid]
        for sid, _ in clues:
            misses[sid] = misses.get(sid, 0) + 1
            if sid in skills:
                out_skills[sid] = skills[sid]
            elif sid not in out_skills:
                m = meta[int(sid.rsplit(':', 1)[1])]
                url = f"https://learnablemeta.com/maps/{m['mapId']}"
                out_skills[sid] = {
                    # Scheduled with the regional clues (as the World pack does with country clues), so no country
                    # gate holds them back; the phase and lmScope say what the meta actually narrows down.
                    'id': sid, 'title': f"{r['country']} · {m['metaName']}", 'prerequisites': [],
                    'phase': 'Regional clues' if scope[m['metaId']] == 'region' else 'Country clues',
                    # One family per Learnable Meta map: at most two metas of the same map in a set.
                    'practiceFamily': f"lm:{m['mapName']}", 'importance': 100, 'availability': 'available',
                    'sourceNoteHtml': (m['note'] or '') + (m['footer'] or ''), 'notesCountry': r['country'],
                    'imageUrls': m['images'][:2], 'source': {'title': f"Learnable Meta · {m['mapName']}", 'url': url},
                    'attributionHtml': f'From the Learnable Meta map <a href="{url}">{m["mapName"]}</a>.',
                    'curriculum': {'scope': 'within-country-regional', 'rank': 0, 'source': {'learnableMeta': m['metaId'], 'lmScope': scope[m['metaId']]}}}
        sid, c = clues[0]
        # The panorama you missed, facing where the clue was seen; one panorama serves one clue (the first round).
        if r['view']['panoId'] in used:
            continue
        used.add(r['view']['panoId'])
        locations.append({'id': rid, 'panoId': r['view']['panoId'], 'lat': r['view']['lat'], 'lng': r['view']['lng'],
                          'heading': facing(r, c['frame']), 'pitch': 0, 'zoom': 0, 'skillIds': [sid], 'country': r['country'],
                          'region': r['country'], 'assessmentEligible': False, 'note': f"In your duel: {c['evidence']}",
                          'provenance': {'kind': 'duel-round', 'lost': r['lost']}})
    for sid, s in out_skills.items():
        examples = world_locations.get(sid, []) if sid in skills else [
            {'id': f"lm:{loc['panoId']}", 'panoId': loc['panoId'], 'lat': loc['lat'], 'lng': loc['lng'],
             'heading': loc.get('heading') or 0, 'pitch': loc.get('pitch') or 0, 'zoom': loc.get('zoom') or 0, 'skillIds': [sid],
             'country': s['notesCountry'], 'region': s['notesCountry'], 'assessmentEligible': False,
             'provenance': {'kind': 'learnable-meta-example'}}
            for loc in lm_examples.get(s['curriculum']['source']['learnableMeta'], [])[:5]]
        for loc in examples:
            if loc['panoId'] not in used:
                used.add(loc['panoId'])
                locations.append(loc)

    # A clue with no panorama stays listed (the guide shows it) but cannot be practised.
    located = {loc['skillIds'][0] for loc in locations}
    for sid in out_skills:
        if sid not in located:
            out_skills[sid] = {**out_skills[sid], 'availability': 'needs-locations'}
    # Most-missed first; equal counts by the points you lost in that country (competitive rounds).
    behind = duels.points_behind(rounds.values(), 'country')
    order = sorted(out_skills, key=lambda sid: (-misses[sid], -behind.get(out_skills[sid].get('notesCountry'), 0), sid))
    for rank, sid in enumerate(order, 1):
        out_skills[sid] = {**out_skills[sid], 'curriculum': {**out_skills[sid]['curriculum'], 'rank': rank}}
    result = {'id': 'duel-misses', 'title': 'Duel misses · the rounds you lost', 'subject': 'GeoGuessr', 'schemaVersion': 1,
              'contentRevision': int(time.time()), 'practiceMapId': '000000000000000000000000',
              'answerAreaLabel': 'Your missed duel rounds. Country accuracy; the clue is tracked through your answer',
              'gradingPolicy': 'recognition', 'maxLocationsPerCountry': 2, 'initialSkillIds': [],
              'regionFeatures': world['regionFeatures'],
              'coverageSummary': f'{len(out_skills)} clues from {len(picks)} missed duel rounds, {len(locations)} panoramas.',
              'skills': [out_skills[sid] for sid in order], 'locations': locations,
              'pools': [{'id': 'duel-misses', 'title': 'Your missed duel rounds', 'skillIds': order,
                         'mapUrl': world['pools'][0]['mapUrl']}]}
    (OUT / 'pack.json').write_text(json.dumps(result, ensure_ascii=False))
    print(json.dumps({'skills': len(order), 'learnableMeta': sum(sid.startswith('duel:lm:') for sid in order),
                      'rounds': len(picks), 'locations': len(locations)}))


SECTIONS = (('Utility poles', lambda s: s['practiceFamily'] == 'utility-poles'),
            ('Plates and phone codes', lambda s: s['practiceFamily'] == 'phone-and-plates'),
            ('Trees and plants', lambda s: s['practiceFamily'] == 'landscape-and-vegetation' and s['curriculum']['source'].get('plant')),
            ('Landscape and terrain', lambda s: s['practiceFamily'] == 'landscape-and-vegetation'),
            ('Everything else you missed', lambda s: True))
GUIDE_COUNTRIES = 25


def guide(target):
    """Static HTML from the built pack (duels/pack.json) and the public World pack. Images of your rounds are copied
    next to it, so the folder stands alone."""
    target = Path(target)
    (target / 'img').mkdir(parents=True, exist_ok=True)
    world = json.loads((REPO / 'content/world.json').read_text())
    mine = json.loads((OUT / 'pack.json').read_text())
    rounds = {r['id']: r for r in json.loads((OUT / 'rounds.json').read_text())}
    examples = {}
    for loc in mine['locations']:
        if loc['provenance']['kind'] == 'duel-round':
            examples.setdefault(loc['skillIds'][0], []).append(loc)
    missed = {s['id'] for s in mine['skills']}
    # A guide is for reading, so it lists every clue, also those without practice panoramas yet; broad landscape
    # overviews (density or elevation maps) are left out as in practice.
    broad = {f"world:pk:{k.split(':')[1]}:{k.split(':')[2]}" for k, v in
             json.loads((HERE / 'labels/landscape.json').read_text()).items() if v['subject'] == 'broad'}
    every = {s['id']: s for s in world['skills'] if s['id'] not in broad} | {s['id']: s for s in mine['skills']}
    # Competitive rounds only, like the misses: unranked games include city maps.
    played = [r for r in rounds.values() if r['mode'] not in (None, 'None')]
    behind = duels.points_behind(played, 'country')
    total = sum(behind.values()) or 1
    named = {s.get('notesCountry') for s in every.values()}
    countries = sorted((c for c in behind if c in named), key=lambda c: -behind[c])[:GUIDE_COUNTRIES]
    e = html.escape

    def card(s):
        shots = ''
        for loc in examples.get(s['id'], [])[:2]:
            r = rounds[loc['id']]
            path = duels.collect.thumb({**r['view'], 'heading': loc['heading']}, 90.0)
            if path:
                shutil.copy(path, target / 'img' / path.name)
                shots += f'<figure><img loading=lazy src="img/{path.name}"><figcaption>{e(loc["note"])}</figcaption></figure>'
        image = f'<img loading=lazy src="{e(s["imageUrls"][0])}">' if s.get('imageUrls') else ''
        badge = f'<span class=miss>missed {len(examples.get(s["id"], []))}x</span> ' if s['id'] in missed else ''
        title = s['title'].split(' · ', 1)[-1]
        return (f'<div class=card><label><input type=checkbox> {badge}<b>{e(title)}</b></label>{image}'
                f'<div class=note>{e(text.plain(s.get("sourceNoteHtml") or ""))}</div>'
                f'<a href="{e(s["source"]["url"])}">{e(s["source"]["title"])}</a>{shots}</div>')

    body, toc = [], []
    for name in countries:
        here = [r for r in played if r['country'] == name]
        wrong = collections.Counter(r['myGuessCountry'] for r in here if r['myGuessCountry'] and r['myGuessCountry'] != name)
        anchor = curate.country_key(name).replace(' ', '-')
        mine_here = [s for s in every.values() if s.get('notesCountry') == name]
        confused = [c for c, _ in wrong.most_common(3)]
        parts, seen = [], set()
        for title, belongs in SECTIONS:
            last = title == SECTIONS[-1][0]
            picked = sorted((s for s in mine_here if s['id'] not in seen and belongs(s) and (not last or s['id'] in missed)),
                            key=lambda s: (s['id'] not in missed, s['curriculum']['rank']))
            seen |= {s['id'] for s in picked}
            if picked:
                parts.append(f'<h3>{title} <small>{len(picked)}</small></h3>' + ''.join(map(card, picked)))
        toc.append(f'<li><a href="#{anchor}">{e(name)}</a> <small>{100 * behind[name] / total:.0f}%</small></li>')
        body.append(f'<section id={anchor}><h2>{e(name)}</h2><p class=m>{len(here)} competitive rounds, lost {sum(r["lost"] for r in here)}, '
                    f'wrong country {sum(wrong.values())} times{", mostly guessed " + ", ".join(map(e, confused)) if confused else ""}. '
                    f'{100 * behind[name] / total:.0f}% of all the points you have been behind.</p>{"".join(parts)}</section>')
    page = f"""<!doctype html><meta charset=utf-8><title>Your duel study guide</title><style>
body{{background:#0f1419;color:#d7dde3;font:15px/1.55 -apple-system,system-ui,sans-serif;max-width:900px;margin:5vh auto;padding:0 20px}}
h1{{font-size:28px}}h2{{font-size:24px;margin-top:56px;color:#9fd3e6}}h3{{margin-top:28px}}small,.m{{color:#8a96a3}}a{{color:#9fd3e6}}
.card{{background:#151c22;border:1px solid #222b33;border-radius:10px;padding:12px 16px;margin:12px 0}}.card>img{{max-width:100%;max-height:260px;display:block;margin:8px 0;border-radius:6px}}
figure{{margin:10px 0}}figure img{{max-width:100%;border-radius:6px}}figcaption{{color:#e9c46a;font-size:13px}}.miss{{background:#e76f51;color:#fff;border-radius:4px;padding:1px 6px;font-size:12px}}
.note{{margin:6px 0}}ol{{columns:3}}</style>
<h1>Your duel study guide</h1>
<p>Countries in the order you lose points in duels. In each: utility poles, plates and phone codes, trees and plants, landscape and terrain, then anything else you missed. Clues you missed come first, with the panorama you missed them on. Every clue is from Plonk It or Learnable Meta.</p>
<p>How to use it: read one country, take notes, then play <b>Duel misses</b> (your own rounds) and <b>World practice</b> with Learn mode on for that day.</p>
<ol>{''.join(toc)}</ol>{''.join(body)}"""
    (target / 'guide.html').write_text(page)
    print(json.dumps({'countries': len(countries), 'clues': sum(b.count('class=card') for b in body)}))


if __name__ == '__main__':
    command, *rest = sys.argv[1:]
    {'lm': lambda: lm(int(rest[0]) if rest else None), 'pack': pack, 'guide': lambda: guide(rest[0])}[command]()
