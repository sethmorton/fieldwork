#!/usr/bin/env python3
"""Small-model curation of what is foundational for region-guessing each country.

  (guide images come only from the local refs/ cache; nothing is fetched from Plonk It)
  curate.py visual     # small vision model: one line per tip image saying what to look for -> labels/visual.json
  curate.py rank       # per country: tier + order of every tip, using text, image summaries and Learnable Meta
                       # curation (which tips the community puts in Beginner/Intermediate maps) -> labels/curation.json
  curate.py metas      # per country: which Learnable Meta meta teaches which Plonk It tip -> labels/meta-tips.json

All steps are cached by content fingerprint and resumable.
"""
import collections
import concurrent.futures as cf
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import text
from text import HERE, WORK

OUT = HERE / 'labels'
MODEL = os.environ.get('CURATE_MODEL', 'gpt-6-luna')
WORKERS = int(os.environ.get('CURATE_WORKERS', '10'))
STAGES = ('within-country-regional', 'specialist')
LEVELS = ('Beginner', 'Intermediate', 'Advanced')

TIER_RUBRIC = """Tiers (for guessing the REGION inside the country, not the country itself):
- foundational: what a strong player learns first for this country. Typically regional infrastructure (utility pole
  types, pole plates/stickers/paint, insulators and attachments, bollards, guardrails, road signs and route markers,
  road lines), phone/area codes and licence plates, scripts or languages by region, regional car/camera meta, and only
  the landscape or vegetation zones that define the country's major regions. Seen often, separates big regions reliably.
- useful: reliable in a common but narrower situation or a mid-sized area.
- niche: occasional or weak tendencies ("occasionally seen"), a single road/town/park/landmark, minor plant species,
  one-off trekkers or camera quirks.
- skip: a heading, a map caption, or a note about where coverage exists, with nothing to spot in a panorama.
Infrastructure usually beats landscape: rank landscape/vegetation as foundational only when the guide and the
Learnable Meta maps treat it as a primary regional tool for this country (e.g. Argentina, Brazil, Australia biomes).
A tip taught in a Beginner or Intermediate Learnable Meta map is evidence that the community considers it fundamental."""


def fingerprint(*parts):
    return hashlib.sha1(json.dumps(parts, sort_keys=True).encode()).hexdigest()[:12]


def ask(prompt, schema, images=(), model=None):
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as f:
        json.dump(schema, f)
    args = [a for path in images for a in ('-i', str(path))]
    out = subprocess.run(['codex', 'exec', '--skip-git-repo-check', '--ignore-rules', '-s', 'read-only', '-m', model or MODEL,
                          '--output-schema', f.name, *args, '--', prompt], capture_output=True, text=True, timeout=1200,
                         cwd=tempfile.gettempdir())
    return json.loads(out.stdout.strip().splitlines()[-1])


def schema(items):
    return {'type': 'object', 'additionalProperties': False, 'required': ['results'], 'properties': {'results': {
        'type': 'array', 'items': {'type': 'object', 'additionalProperties': False, 'required': list(items),
                                   'properties': items}}}}


def load(name):
    path = OUT / name
    return json.loads(path.read_text()) if path.exists() else {}


def save(name, data):
    (OUT / name).write_text(json.dumps(data, ensure_ascii=False))


def tips():
    """Practice-relevant guide tips grouped by guide slug, in guide order."""
    inventory = json.loads((WORK / 'location-database/foundations/all-guide-topic-inventory.json').read_text())
    europe = {u['slug'] for u in json.loads((WORK / 'location-database/foundations/foundation-inventory.json').read_text())['units']
              if 'Europe' in u.get('categories', [])}
    by_country = {}
    for unit in inventory['units']:
        if unit['coverageUnitType'] != 'country-or-territory':
            continue
        rows = [t for t in unit['topics'] if t['stage'] in STAGES
                or (t['stage'] == 'country-identification' and unit['slug'] in europe and 'utility-poles' in t['concepts'])]
        if rows:
            by_country[unit['slug']] = (unit, rows)
    return by_country


def local_image(url):
    """The tip's image if it is already cached in refs/ (under its original or resized URL), else None."""
    prefix = 'https://www.plonkit.net/images/'
    names = [url] + ([prefix + 'resize/600/80/' + url[len(prefix):]] if url.startswith(prefix) else [])
    for name in names:
        path = HERE / 'refs' / (hashlib.sha1(name.encode()).hexdigest()[:16] + Path(name).suffix)
        if path.exists():
            return path
    return None


def visual():
    labels = load('visual.json')
    jobs = []
    for slug, (unit, rows) in tips().items():
        for t in rows:
            path = local_image(t['imageUrls'][0]) if t['imageUrls'] else None
            if path:
                key = t['sourceTopicId']
                fp = fingerprint(t['sourceText'], path.name)
                if labels.get(key, {}).get('fingerprint') != fp:
                    jobs.append((key, unit['title'], t, path, fp))
    calls = [jobs[i:i + 10] for i in range(0, len(jobs), 10)]
    print(f'describing {len(jobs)} guide images in {len(calls)} calls with {MODEL}', flush=True)
    sch = schema({'n': {'type': 'integer'}, 'lookFor': {'type': 'string'}, 'imageKind': {
        'type': 'string', 'enum': ['example-photo', 'annotated-examples', 'region-map', 'chart-or-table', 'other']}})

    def one(batch):
        lines = [f"Image {n} - {title}: {t['sourceText'][:400]}" for n, (_, title, t, _, _) in enumerate(batch, 1)]
        prompt = ('Each image is the illustration for one Plonk It GeoGuessr tip (same order). For each, say in one short '
                  'sentence exactly what a player should look for in Street View (shapes, colours, positions, text), using '
                  'the image; and classify the image kind.\n\n' + '\n'.join(lines) + f'\n\nReturn exactly {len(batch)} results.')
        try:
            res = {r['n']: r for r in ask(prompt, sch, [p for *_, p, _ in batch])['results']}
        except Exception:
            return {}
        return {key: {'lookFor': res[n]['lookFor'], 'imageKind': res[n]['imageKind'], 'fingerprint': fp, 'model': MODEL}
                for n, (key, _, _, _, fp) in enumerate(batch, 1) if n in res}
    with cf.ThreadPoolExecutor(WORKERS) as pool:
        for got in pool.map(one, calls):
            labels.update(got)
            save('visual.json', labels)


def lm_by_country():
    """Learnable Meta metas per guide title, with their map's difficulty level (from the public catalogue)."""
    level = {m['mapId']: m['text'].split('\n')[1] for m in json.loads(
        (WORK / 'location-database/learnable/catalogue-visible-2026-10-22.json').read_text())['maps']}
    out = collections.defaultdict(list)
    for m in json.loads((HERE / 'lm/matches.json').read_text()):
        if m['country']:
            out[m['country']].append({**m, 'level': level.get(m['mapId'], '?')})
    return out


def country_key(title):
    return ' '.join(text.words(title))


def rank():
    labels, visuals, metas = load('curation.json'), load('visual.json'), lm_by_country()
    jobs = []
    for slug, (unit, rows) in tips().items():
        lm = metas.get(country_key(unit['title']), [])
        listing = '\n'.join(
            f"tip {t['tipId']} [{t['section']} / {t.get('subsection') or '-'}] {t['sourceText'][:350]}"
            + (f" || image: {visuals[t['sourceTopicId']]['lookFor']}" if t['sourceTopicId'] in visuals else '')
            for t in rows)
        lm_lines = '\n'.join(sorted({f"- [{m['level']}] {m['mapName']}: {m['metaName']}" for m in lm})[:250])
        fp = fingerprint(listing, lm_lines, TIER_RUBRIC)
        if labels.get(slug, {}).get('fingerprint') != fp:
            jobs.append((slug, unit, rows, listing, lm_lines, fp))
    print(f'curating {len(jobs)} countries with {MODEL}', flush=True)
    sch = schema({'tipId': {'type': 'string'}, 'tier': {'type': 'string', 'enum': ['foundational', 'useful', 'niche', 'skip']},
                  'kind': {'type': 'string', 'enum': ['infrastructure', 'signs-and-text', 'phone-and-plates', 'car-and-camera',
                                                      'architecture', 'landscape-and-vegetation', 'agriculture', 'other']},
                  'why': {'type': 'string'}})

    def one(job):
        slug, unit, rows, listing, lm_lines, fp = job
        prompt = (f'You are curating a region-guessing curriculum for {unit["title"]} in GeoGuessr.\n\n{TIER_RUBRIC}\n\n'
                  f'Plonk It guide tips for {unit["title"]}:\n{listing}\n\n'
                  f'Learnable Meta metas for {unit["title"]} (map difficulty in brackets):\n{lm_lines or "(none)"}\n\n'
                  'Return EVERY tip exactly once, ORDERED from most to least important to learn for region-guessing this '
                  'country, each with tier, kind and a few-word reason.')
        try:
            res = ask(prompt, sch)['results']
        except Exception as e:
            print('curation failed', slug, e, flush=True)
            return None
        ids = {t['tipId'] for t in rows}
        ordered = [r for r in res if r['tipId'] in ids]
        seen = {r['tipId'] for r in ordered}
        ordered += [{'tipId': t, 'tier': 'niche', 'kind': 'other', 'why': 'not returned by model'} for t in
                    [t['tipId'] for t in rows] if t not in seen]
        return slug, {'order': ordered, 'fingerprint': fp, 'model': MODEL}
    with cf.ThreadPoolExecutor(WORKERS) as pool:
        for got in pool.map(one, jobs):
            if got:
                labels[got[0]] = got[1]
                save('curation.json', labels)
    print(f'{len(labels)} countries curated', flush=True)


def meta_tips():
    labels, metas = load('meta-tips.json'), lm_by_country()
    jobs = []
    for slug, (unit, rows) in tips().items():
        tip_lines = '\n'.join(f"{t['tipId']}: {t['sourceText'][:220]}" for t in rows)
        lm = sorted(metas.get(country_key(unit['title']), []), key=lambda m: (m['mapId'], m['metaId']))
        for i in range(0, len(lm), 40):
            chunk = lm[i:i + 40]
            key = f'{slug}:{i}'
            fp = fingerprint(tip_lines, [(m['metaId'], m['mapId'], m['metaName']) for m in chunk])
            if labels.get(key, {}).get('fingerprint') != fp:
                jobs.append((key, unit, tip_lines, chunk, fp))
    print(f'mapping metas in {len(jobs)} calls with {MODEL}', flush=True)
    sch = schema({'n': {'type': 'integer'}, 'tipId': {'type': 'string'}})

    def one(job):
        key, unit, tip_lines, chunk, fp = job
        listing = '\n'.join(f"Meta {n}: {m['metaName']}: {text.plain(m['note'])[:260]}" for n, m in enumerate(chunk, 1))
        prompt = (f'Plonk It tips for {unit["title"]}:\n{tip_lines}\n\nLearnable Meta metas:\n{listing}\n\n'
                  'For each meta give the tipId of the Plonk It tip that teaches the SAME clue (same feature, same place), or '
                  f'"none". Return exactly {len(chunk)} results, n=1..{len(chunk)}.')
        try:
            res = {r['n']: r['tipId'] for r in ask(prompt, sch)['results']}
        except Exception:
            return None
        ids = {line.split(':', 1)[0] for line in tip_lines.splitlines()}
        return key, {'fingerprint': fp, 'model': MODEL, 'metas': [
            {'metaId': m['metaId'], 'mapId': m['mapId'], 'locationsCount': m['locationsCount'], 'level': m['level'],
             'topicId': f"plonkit:{key.split(':')[0]}:{res[n]}" if res.get(n) in ids else None}
            for n, m in enumerate(chunk, 1)]}
    with cf.ThreadPoolExecutor(WORKERS) as pool:
        for got in pool.map(one, jobs):
            if got:
                labels[got[0]] = got[1]
                save('meta-tips.json', labels)
    mapped = [m for v in labels.values() for m in v['metas'] if m['topicId']]
    print(f'{len(mapped)} metas mapped to {len({m["topicId"] for m in mapped})} tips', flush=True)


if __name__ == '__main__':
    OUT.mkdir(exist_ok=True)
    {'visual': visual, 'rank': rank, 'metas': meta_tips}[sys.argv[1]]()
