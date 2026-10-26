#!/usr/bin/env python3
"""Which Sprint clues are CLEARLY visible in your own ACoW duel rounds, so those panoramas become practice locations.

Two independent checks by two different strong vision models; a match counts only when both agree:
  1. per round (FIND_MODEL): the frames plus every Sprint clue of the round's country; the model names the clearly
     visible ones (frame, where, what it sees).
  2. per claim (CONFIRM_MODEL): only the claimed frame and that one clue; accepted on an unambiguous yes with
     confidence >= MIN_CONFIDENCE.
Verdicts are cached by fingerprint in sprint/duel-verdicts.json; frames reuse duels.frames() and its thumbnail cache.
Writes sprint/duel-views.json ({source clue id: [views]}) and sprint/duel-views-audit.jpg (contact sheet of matches),
leaving out the matches a human rejected on the sheet (sprint/duel-rejects.json: [{round, clue: source id}]).
With SINCE (an ISO time) only rounds that ended since then are checked; the other rounds keep their views and come first.
Usage: WORLD_PACK_DATA=<caches> uv run --with pillow python3 tools/world-pack/sprint_duels.py [SINCE]
"""
import concurrent.futures as cf
import json
import os
import sys
import textwrap
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
if not os.environ.get('WORLD_PACK_DATA') or Path(os.environ['WORLD_PACK_DATA']).resolve().is_relative_to(REPO):
    sys.exit('Set WORLD_PACK_DATA to a data folder outside the repository: duel history is personal.')
from PIL import Image, ImageDraw, ImageFont

import collect
import curate
import duels
import text
from text import HERE

# Strong vision models (the default small curate model invented matches); a different model confirms, so errors don't repeat.
FIND_MODEL, CONFIRM_MODEL = 'gpt-6.1-sol', 'gpt-6-astra'
OUT = HERE / 'sprint'
MAP = 'A Competitive World'
MIN_CONFIDENCE = 0.8

FIND = """These {k} images are the four directions a GeoGuessr player could see in one round (image 1 faces the opening
heading, each next image is 90 degrees further right). The round is in {where}, {country}.
Below are numbered practice clues for {country}. Name each clue whose specific feature is CLEARLY visible:
- a pole clue needs a pole of exactly the described type, near and sharp enough to tell its material and shape (not
  a tiny, distant, blurry, cut-off or foliage-hidden shape, nor a tree trunk, pylon or post that could be mistaken for it);
- a landscape or vegetation clue needs the described landscape or plants unmistakably shown, not merely a scene that
  is consistent with it;
- a clue limited to an area counts only if the round's location is inside that area.
For each give n, the image number where it is clearest, where in that image, and describe the actual feature you see.
When in doubt leave it out. An empty list is a normal answer.

{clues}"""

CONFIRM = """GeoGuessr clue for {country}: {clue}

First describe what you actually see that decides it. Then answer yes only when the exact feature it describes is
plainly there and big enough to recognise at a glance (for a pole: near and sharp enough to tell its material and
shape). Answer no if it is absent, small, distant, cut off at the edge, partly hidden, blurry, ambiguous, could be
something else (a tree trunk, a pylon, a post, a shadow), or the scene is merely consistent with it.
Give your confidence from 0 to 1."""
# Rules for the subjects added after the first duel pass. They are appended to prompts rather than templated in, so the
# cached pole and landscape answers keep their keys. A stage-1 answer cached without them can only over-claim, and stage
# 2 filters that: CONFIRM gets the rule of the clue's subject, keyed with it.
RULES = {'roads': 'Road lines count only when the line colour and pattern are clearly visible near the camera.',
         'car': 'A car clue counts only when that part of the Google car is visible in the frame.'}
FIND_RULES = 'Also: ' + ' '.join(RULES.values())

FIND_SCHEMA = {'type': 'object', 'additionalProperties': False, 'required': ['matches'], 'properties': {'matches': {
    'type': 'array', 'items': {'type': 'object', 'additionalProperties': False, 'required': ['n', 'image', 'where', 'feature'],
                               'properties': {'n': {'type': 'integer'}, 'image': {'type': 'integer'},
                                              'where': {'type': 'string'}, 'feature': {'type': 'string'}}}}}}
CONFIRM_SCHEMA = {'type': 'object', 'additionalProperties': False, 'required': ['description', 'visible', 'confidence'],
                  'properties': {'description': {'type': 'string'}, 'visible': {'type': 'string', 'enum': ['yes', 'no']},
                                 'confidence': {'type': 'number'}}}


def clue_text(skill):
    area = f" Area: {skill['area']}." if skill.get('area') else ''
    return f"{skill['title']}. {skill['why']}{area} Guide note: {text.plain(skill['sourceNoteHtml'])[:600]}"


def check(r, skills, cache):
    """Accepted and rejected claims for one round, plus new cache entries; None when a fetch or call failed (retry later)."""
    images = duels.frames(r)
    if images is None:
        return None
    if not images or not skills:
        return {'accepted': [], 'rejected': [], 'cache': {}}
    new = {}

    def ask(model, prompt, schema, imgs, *key):
        fp = curate.fingerprint(model, *key)
        if fp not in cache and fp not in new:
            new[fp] = curate.ask(prompt, schema, imgs, model)
        return cache.get(fp) or new[fp]

    lines = '\n'.join(f'{n}. {clue_text(s)}' for n, s in enumerate(skills, 1))
    prompt = FIND.format(k=len(images), where=r['subdivision'] or 'an unknown area', country=r['country'], clues=lines)
    prompt += '\n\n' + FIND_RULES
    try:
        found = ask(FIND_MODEL, prompt, FIND_SCHEMA, images, FIND, r['id'], [p.name for p in images], lines)
        accepted, rejected, seen = [], [], set()
        for m in found['matches']:
            if not (1 <= m['n'] <= len(skills) and 1 <= m['image'] <= len(images)) or m['n'] in seen:
                continue
            seen.add(m['n'])
            skill, image = skills[m['n'] - 1], images[m['image'] - 1]
            clue, rule = clue_text(skill), RULES.get(skill['subject'])
            verdict = ask(CONFIRM_MODEL, CONFIRM.format(country=r['country'], clue=clue) + (f'\n{rule}' if rule else ''),
                          CONFIRM_SCHEMA, [image], CONFIRM, *([rule] if rule else []), r['id'], image.name, clue)
            claim = {'skill': skill, 'frame': m['image'], 'image': image, 'claim': m, 'verdict': verdict}
            ok = verdict['visible'] == 'yes' and verdict['confidence'] >= MIN_CONFIDENCE
            (accepted if ok else rejected).append(claim)
    except Exception as e:
        print('failed', r['id'], e, flush=True)
        return {'failed': True, 'cache': new}
    return {'accepted': accepted, 'rejected': rejected, 'cache': new}


def views(accepted):
    out = {}
    for r, c in accepted:
        v = r['view']
        heading = (v['heading'] + 90 * (c['frame'] - 1)) % 360  # duels.frames(): frame k faces opening heading + 90(k-1)
        entries = out.setdefault(c['skill']['curriculum']['source']['clue'], [])
        if all(e['panoId'] != v['panoId'] for e in entries):
            entries.append({'panoId': v['panoId'], 'lat': v['lat'], 'lng': v['lng'], 'heading': heading, 'pitch': v['pitch'],
                            'zoom': v['zoom'], 'round': r['id'], 'date': (r['endTime'] or '')[:10]})
    return dict(sorted(out.items()))


def contact_sheet(accepted, path, cols=4, w=400, h=250, caption=48):
    rows = max(1, -(-len(accepted) // cols))
    sheet = Image.new('RGB', (cols * w, rows * (h + caption)), 'white')
    draw, font = ImageDraw.Draw(sheet), ImageFont.load_default(size=13)
    for i, (r, c) in enumerate(accepted):
        x, y = i % cols * w, i // cols * (h + caption)
        sheet.paste(Image.open(c['image']).convert('RGB').resize((w, h)), (x, y))
        label = textwrap.wrap(c['skill']['title'], 52)[:2] + [f"{r['id']} · frame {c['frame']}"]
        draw.multiline_text((x + 4, y + h + 2), '\n'.join(label), fill='black', font=font, spacing=1)
    sheet.save(path, quality=85)


def main(since=''):
    pack = json.loads((OUT / 'pack.json').read_text())
    by_country = {}
    for s in pack['skills']:
        if s['subject'] != 'duel':  # your own rounds are not clues to look for
            by_country.setdefault(s['country'], []).append(s)
    rounds = [r for r in json.loads((HERE / 'duels/rounds.json').read_text()) if r['map'] == MAP and (r['endTime'] or '') >= since]
    cache = collect.JsonCache(OUT / 'duel-verdicts.json')
    accepted, rejected, failed = [], [], 0
    print(f'checking {len(rounds)} {MAP} rounds: {FIND_MODEL} finds, {CONFIRM_MODEL} confirms', flush=True)
    with cf.ThreadPoolExecutor(curate.WORKERS) as pool:
        jobs = {pool.submit(check, r, by_country.get(r['countryCode'], []), cache.data): r for r in rounds}
        for done, job in enumerate(cf.as_completed(jobs), 1):
            r, res = jobs[job], job.result()
            if res is None or res.get('failed'):
                failed += 1
            if res:
                cache.data.update(res['cache'])
                cache.save()
                accepted += [(r, c) for c in res.get('accepted', [])]
                rejected += [(r, c) for c in res.get('rejected', [])]
            print(f'{done}/{len(rounds)} rounds, {len(accepted)} accepted, {len(rejected)} rejected at stage 2, {failed} failed',
                  flush=True)
    rejects = {(x['round'], x['clue']) for x in json.loads((OUT / 'duel-rejects.json').read_text())} \
        if (OUT / 'duel-rejects.json').exists() else set()
    accepted = sorted(((r, c) for r, c in accepted if (r['id'], c['skill']['curriculum']['source']['clue']) not in rejects),
                      key=lambda rc: (rc[1]['skill']['id'], rc[0]['id']))
    found = views(accepted)
    if since:  # earlier rounds keep their views, first, so the cards that show them keep their locations
        checked = {r['id'] for r in rounds}
        old = json.loads((OUT / 'duel-views.json').read_text())
        found = dict(sorted({clue: [v for v in old.get(clue, []) if v['round'] not in checked] + found.get(clue, [])
                             for clue in old.keys() | found.keys()}.items()))
    (OUT / 'duel-views.json').write_text(json.dumps(found, ensure_ascii=False, indent=1))
    contact_sheet(accepted, OUT / 'duel-views-audit.jpg')
    print(json.dumps({'rounds': len(rounds), 'failed': failed, 'accepted': len(accepted), 'clues': len(found),
                      'rejectedStage2': len(rejected), 'sheet': str(OUT / 'duel-views-audit.jpg')}))


if __name__ == '__main__':
    main(*sys.argv[1:2])
