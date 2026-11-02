#!/usr/bin/env python3
"""Answer sets for worldwide clues: every country where a clue's exact tell appears, so a pin in any of them grades the
clue right (skill `range`, src/session.mjs completedRound).

  1. skills: content/worldwide.json, scope country-identification, available, with locations; each with its Plonk It
     tip (clues.json, curriculum.source guide + tipId), its Learnable Meta note (lm/metas/<notesSourceMapId>.json) and
     the tip's guide image when cached in refs/. Its country is its locations' region (regionFeatures name).
  2. MODEL reads one skill's texts and lists the pack countries where this tell appears, with a quote naming each extra
     country; `vague` when the texts point to unnamed places ('neighbouring countries'). One call per skill, cached in
     shared/cache.json by fingerprint. An extra country stays only when its quote is in the texts.
  3. shared/ranges.json: {skillId: [own country, extras...]} for skills with an extra country.
  4. shared/review.html: those skills, then the vague or unquoted ones. Seth reviews it; CUTS records what he removed
     (a source condition such as rear plates only, old cars only or one region only, or a vibe rather than a tell).
  5. 'apply': ranges.json minus CUTS becomes each skill's `range` in content/worldwide.json (every other range is
     removed) and contentRevision goes up by one.
Usage: WORLD_PACK_DATA=<caches> WORLD_PACK_INPUTS=<inputs> python3 tools/world-pack/shared_clues.py [apply | test]
"""
import collections
import concurrent.futures as cf
import html
import json
import sys
import threading
from pathlib import Path

import curate
import text
from build import card_image
from text import HERE

PACK = Path(__file__).resolve().parents[2] / 'content/worldwide.json'
OUT = HERE / 'shared'
CACHE = OUT / 'cache.json'
MODEL, WORKERS = 'gpt-6-astra', 10
# Seth's review, 2026-11-02: extras the source qualifies (rear only, pre-2009, commercial, one region) and vibe clues.
CUTS = {'world:lm:501457': {'United Kingdom', 'France', 'Denmark'},  # Luxembourg yellow plates
        'world:lm:783063': {'Italy', 'Belgium'}, 'world:lm:783099': {'Italy', 'Belgium'},  # German: one region each
        'world:lm:783102': {'Romania', 'Slovakia'},  # Hungarian: minority regions
        'world:lm:126': '*', 'world:lm:163': '*'}  # eSwatini / Botswana vibes
PROMPT = """A GeoGuessr clue for {country}: "{title}". A player who spots this exact feature in Street View has to decide
which countries it can be. From the texts below (and the attached guide image, if any), list every country where the
texts say this same feature, design or language is found.

- Always include {country}.
- Add another country only when the texts say the SAME feature is there ("also found in X", "the only other country
  with the same design is X", "also widely spoken in X", "can appear in X"). Outside knowledge never counts; nor does
  the image.
- Never add a country when the texts:
  - call its version "similar", "comparable" or "easily confused", or give any detail that tells the two apart (shape,
    colour, reflector position, the figure on a sign, wording, script), however small, unless they say the feature
    itself cannot be told apart. Telling the countries apart by OTHER clues (landscape, vegetation, the Google car)
    does not make the feature different.
  - share only part of the clue (one letter, one word or abbreviation, one colour) while the clue as a whole differs.
  - name it as a contrast or to rule it out ("unlike X", "X uses yellow instead", "none of X's neighbours").
- Use the country names from the schema's list; a territory or region named in the text maps to the listed country it
  belongs to only when the list has no own entry for it.
- evidence: for each added country, one short quote copied word for word from the texts that names it.
- vague: true when the texts say the feature is also found in places they do not name ("neighbouring countries",
  "some other countries", "the Balkans"); those places are not added.
- reason: one sentence.
Return exactly one result.

{texts}"""
LOCK = threading.Lock()


def skills():
    """(country names, skills: id, title, country, texts, url, images, local guide images)."""
    pack = json.loads(PACK.read_text())
    tips = {c['topicId']: c for c in json.loads((HERE / 'clues.json').read_text())}
    region = collections.defaultdict(collections.Counter)
    for loc in pack['locations']:
        if loc.get('region'):
            region[loc['skillIds'][0]][loc['region']] += 1
    metas, out = {}, []
    for s in pack['skills']:
        if (s.get('curriculum') or {}).get('scope', 'country-identification') != 'country-identification' \
                or s['availability'] != 'available' or not region[s['id']]:
            continue
        mid = s['notesSourceMapId']
        if mid not in metas:
            metas[mid] = {m['id']: m for m in json.loads((HERE / 'lm/metas' / f'{mid}.json').read_text())['metas']}
        meta = metas[mid][s['sourceMetaId']]
        src = s['curriculum'].get('source', {})
        tip = tips.get(f"plonkit:{src.get('guide')}:{src.get('tipId')}")
        guide = tip['imageUrls'][:1] if tip else []
        out.append({'id': s['id'], 'title': s['title'], 'country': region[s['id']].most_common(1)[0][0],
                    'texts': ([('Plonk It', tip['text'])] if tip else [])
                    + [('Learnable Meta', f"{meta['name']}: {text.plain(meta['note']).strip()}")],
                    'url': tip['tipUrl'] if tip else s['notesSourceUrl'],
                    'images': [card_image(u) for u in guide] + s['imageUrls'][:1],
                    'local': [p for p in map(curate.local_image, guide) if p]})
    return sorted({f['properties']['name'] for f in pack['regionFeatures']}), out


def schema(countries):
    name = {'type': 'string', 'enum': countries}
    return curate.schema({'countries': {'type': 'array', 'items': name}, 'evidence': {'type': 'array', 'items': {
        'type': 'object', 'additionalProperties': False, 'required': ['country', 'quote'],
        'properties': {'country': name, 'quote': {'type': 'string'}}}}, 'vague': {'type': 'boolean'}, 'reason': {'type': 'string'}})


def flat(s):
    return ' '.join(text.fold(s).split())


def quoted(quote, texts):
    """The quote appears in the texts (case, accents and spacing ignored; surrounding quote marks and ellipses dropped)."""
    q = flat(quote.strip(' "\'“”‘’.…'))
    return bool(q) and q in flat(' '.join(t for _, t in texts))


def answer_set(skill, verdict):
    """(range: own country then each extra country with a quote found in the texts, extras dropped for lack of one)."""
    ok = {e['country'] for e in verdict['evidence'] if quoted(e['quote'], skill['texts'])}
    extras = [c for c in dict.fromkeys(verdict['countries']) if c != skill['country']]
    return [skill['country']] + [c for c in extras if c in ok], [c for c in extras if c not in ok]


def judge(skill, sch, cache):
    """The model's verdict for one skill (cached by fingerprint), or None when the call fails."""
    texts = '\n\n'.join(f'{src}: {t}' for src, t in skill['texts'])
    prompt = PROMPT.format(country=skill['country'], title=skill['title'], texts=texts)
    key = curate.fingerprint(MODEL, sch, prompt, [p.name for p in skill['local']])
    if key not in cache:
        try:
            answer = curate.ask(prompt, sch, skill['local'], MODEL)['results']
            assert len(answer) == 1, f'{len(answer)} results'
        except Exception as e:
            print('model call failed', skill['id'], e, flush=True)
            return None
        with LOCK:
            cache[key] = answer[0]
            CACHE.write_text(json.dumps(cache, ensure_ascii=False))
    return cache[key]


def row(s):
    e, v = html.escape, s['verdict']
    imgs = ''.join(f'<img src="{e(u)}" loading="lazy">' for u in s['images'])
    body = ''.join(f'<p><b>{e(src)}</b> {e(t)}</p>' for src, t in s['texts'])
    ev = ''.join(f'<li><b>{e(x["country"])}</b> “{e(x["quote"])}”</li>' for x in v['evidence'])
    flags = ' · vague' * v['vague'] + (f' · dropped, no quote in the texts: {", ".join(s["dropped"])}' if s['dropped'] else '')
    return (f'<section><h3><a href="{e(s["url"])}">{e(s["title"])}</a> <small>{e(s["id"])}</small></h3>'
            f'<p class="set"><b>{e(" · ".join(s["range"]))}</b>{e(flags)}</p><div class="cols"><div class="imgs">{imgs}</div>'
            f'<div>{body}<ul>{ev}</ul><p class="why">{e(v["reason"])}</p></div></div></section>')


def review(shared, flagged, total):
    css = ('body{font:15px/1.5 -apple-system,Helvetica,Arial,sans-serif;max-width:1400px;margin:24px auto;padding:0 20px;'
           'color:#1a1a1a}section{border:1px solid #ccc;border-radius:6px;margin:16px 0;padding:12px 14px}h3{font-size:17px;'
           'margin:0}small{color:#777;font-weight:400}.set{font-size:16px;margin:4px 0 10px}.cols{display:grid;'
           'grid-template-columns:560px 1fr;gap:24px}.imgs{display:flex;gap:8px}.imgs img{width:276px;height:200px;'
           'object-fit:contain;background:#eee}.cols p{margin:0 0 8px}ul{margin:4px 0}.why{color:#444}')
    (OUT / 'review.html').write_text(
        f'<!doctype html><meta charset="utf-8"><title>Shared clues</title><style>{css}</style>'
        f'<h1>Shared clues: {len(shared)} of {total} clues appear in more than one country</h1>'
        + ''.join(map(row, shared)) + f'<h2>Vague or unquoted ({len(flagged)})</h2>' + ''.join(map(row, flagged)))


def main():
    countries, rows = skills()
    sch = schema(countries)
    OUT.mkdir(exist_ok=True)
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    print(len(rows), 'clues', flush=True)
    with cf.ThreadPoolExecutor(WORKERS) as pool:
        for s, v in zip(rows, pool.map(lambda s: judge(s, sch, cache), rows)):
            s['verdict'] = v
            s['range'], s['dropped'] = answer_set(s, v) if v else ([s['country']], [])
    shared = [s for s in rows if len(s['range']) > 1]
    flagged = [s for s in rows if s['verdict'] and len(s['range']) == 1 and (s['verdict']['vague'] or s['dropped'])]
    (OUT / 'ranges.json').write_text(json.dumps({s['id']: s['range'] for s in shared}, ensure_ascii=False, indent=1) + '\n')
    review(shared, flagged, len(rows))
    for s in shared:
        print(s['id'], s['title'], '->', s['range'], f"(dropped {s['dropped']})" * bool(s['dropped']))
    failed = [s['id'] for s in rows if s['verdict'] is None]
    print(len(shared), 'shared,', len(flagged), 'vague or unquoted,', len(failed), 'failed', failed)


def reviewed(ranges):
    """ranges.json minus CUTS ('*' drops every extra); sets left with only their own country are gone."""
    out = {}
    for sid, r in ranges.items():
        cut = CUTS.get(sid, set())
        kept = [r[0]] + ([] if cut == '*' else [c for c in r[1:] if c not in cut])
        if len(kept) > 1:
            out[sid] = kept
    return out


def apply():
    pack, ranges = json.loads(PACK.read_text()), reviewed(json.loads((OUT / 'ranges.json').read_text()))
    for skill in pack['skills']:
        skill.pop('range', None)
        if skill['id'] in ranges:
            skill['range'] = ranges[skill['id']]
    pack['contentRevision'] += 1
    PACK.write_text(json.dumps(pack, indent=2, ensure_ascii=False) + '\n')
    print(len(ranges), 'ranges written, contentRevision', pack['contentRevision'])


def test():
    skill = {'country': 'Czechia', 'texts': [('t', 'NOTE: The only other country with the same design is Slovakia.')]}
    v = {'countries': ['Czechia', 'Slovakia', 'Austria'], 'evidence': [
        {'country': 'Slovakia', 'quote': '“the only other country with the same design is Slovakia…”'},
        {'country': 'Austria', 'quote': 'Austria has the same design'}]}
    assert answer_set(skill, v) == (['Czechia', 'Slovakia'], ['Austria'])
    assert not quoted('', skill['texts'])
    assert reviewed({'world:lm:783102': ['Hungary', 'Romania', 'Slovakia', 'Serbia'], 'world:lm:126': ['eSwatini', 'Lesotho'],
                     'x': ['A', 'B']}) == {'world:lm:783102': ['Hungary', 'Serbia'], 'x': ['A', 'B']}
    print('ok')


if __name__ == '__main__':
    {'test': test, 'apply': apply}.get(sys.argv[1] if sys.argv[1:] else '', main)()
