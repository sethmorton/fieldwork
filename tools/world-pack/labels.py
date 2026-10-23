#!/usr/bin/env python3
"""Small-model labels for the judgement calls the pipeline needs about guide text (no pattern matching).

  labels.py   # per clue: is there something to spot in one panorama? which guide links are comparisons?

Writes labels/clues.json (cached per clue + text fingerprint; resumable). Learnable Meta meta -> tip mapping and
per-country tiers live in curate.py.
"""
import concurrent.futures as cf
import hashlib
import json
import subprocess
import tempfile

import text
from review import MODEL, WORKERS
from text import HERE, WORK

OUT = HERE / 'labels'
PER_CALL = 15

CLUE_SCHEMA = {'type': 'object', 'additionalProperties': False, 'required': ['results'], 'properties': {'results': {
    'type': 'array', 'items': {'type': 'object', 'additionalProperties': False, 'required': ['n', 'observable', 'comparisonLinks'],
                               'properties': {'n': {'type': 'integer'}, 'observable': {'type': 'boolean'},
                                              'comparisonLinks': {'type': 'array', 'items': {'type': 'integer'}}}}}}}
CLUE_PROMPT = """Each numbered item is one tip from the Plonk It GeoGuessr guide.
For each item answer:
- observable: true if the tip describes something a player could actually see in a single Street View panorama
  (an object, sign, pole, bollard, vehicle, building style, landscape, vegetation, soil, road feature, language on signs...).
  false if it is only a heading, a caption for a map/chart/diagram, or a note about where Street View coverage exists,
  with nothing to look for in the scene.
- comparisonLinks: the numbers of the listed links that show a contrast or comparison (the usual version, another region,
  another country, "looks similar", a NOTE about exceptions) rather than an example of the tip itself. [] if none.

{items}

Return exactly {n} results, n=1..{n}."""


def fingerprint(*parts):
    return hashlib.sha1(json.dumps(parts).encode()).hexdigest()[:12]


def guide_tips(slug):
    """{tipId: raw tip} from the cached guide page data."""
    path = next((p for p in (WORK / 'plonkit-guides' / f'{slug}.json', WORK / 'plonkit-browser-index' / f'{slug}.json')
                 if p.exists()), None)
    found = {}

    def walk(o):
        if isinstance(o, dict):
            if isinstance(o.get('links'), list) and isinstance(o.get('text'), str) and 'id' in o:
                found[o['id']] = o
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
    if path:
        walk(json.loads(path.read_text()))
    return found


def anchored_links(tip):
    """Links with anchor text, each with the sentence it sits in. Links without anchor text are the tip's own example."""
    return [(l['href'], l['text'].strip(), text.sentence_with(tip['text'], l['text'].strip()))
            for l in tip.get('links', []) if (l.get('text') or '').strip() and l['text'].strip() in tip['text']]


def ask(prompt, schema):
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as f:
        json.dump(schema, f)
    out = subprocess.run(['codex', 'exec', '--skip-git-repo-check', '--ignore-rules', '-s', 'read-only', '-m', MODEL,
                          '--output-schema', f.name, '--', prompt], capture_output=True, text=True, timeout=900,
                         cwd=tempfile.gettempdir())
    return {r['n']: r for r in json.loads(out.stdout.strip().splitlines()[-1])['results']}


def run(jobs, path, worker):
    labels = json.loads(path.read_text()) if path.exists() else {}
    todo = [j for j in jobs if labels.get(j['key'], {}).get('fingerprint') != j['fingerprint']]
    calls = [todo[i:i + PER_CALL] for i in range(0, len(todo), PER_CALL)]
    print(f'labelling {len(todo)} items in {len(calls)} calls with {MODEL}', flush=True)
    with cf.ThreadPoolExecutor(WORKERS) as pool:
        for got in pool.map(worker, calls):
            labels.update(got)
            path.write_text(json.dumps(labels))
    print(f'{path.name}: {len(labels)} labels', flush=True)


def clues():
    jobs = []
    tips_by_slug = {}
    for c in json.loads((HERE / 'clues.json').read_text()):
        tips = tips_by_slug.setdefault(c['slug'], guide_tips(c['slug']))
        links = anchored_links(tips.get(c['topicId'].rsplit(':', 1)[1], {}))
        jobs.append({'key': c['topicId'], 'clue': c, 'links': links, 'fingerprint': fingerprint(c['text'], links, CLUE_PROMPT)})

    def worker(batch):
        items = []
        for n, j in enumerate(batch, 1):
            listed = ''.join(f'\n   link {k}: "{a}" in: {s[:300]}' for k, (_, a, s) in enumerate(j['links'], 1))
            items.append(f"Item {n} ({j['clue']['title']}): {j['clue']['text'][:900]}{listed}")
        try:
            answers = ask(CLUE_PROMPT.format(items='\n\n'.join(items), n=len(batch)), CLUE_SCHEMA)
        except Exception:
            return {}
        got = {}
        for n, j in enumerate(batch, 1):
            r = answers.get(n)
            if r:
                got[j['key']] = {'observable': r['observable'], 'model': MODEL, 'fingerprint': j['fingerprint'],
                                 'comparisonLinks': [j['links'][k - 1][0] for k in r['comparisonLinks'] if 1 <= k <= len(j['links'])]}
        return got
    run(jobs, OUT / 'clues.json', worker)


if __name__ == '__main__':
    OUT.mkdir(exist_ok=True)
    clues()
