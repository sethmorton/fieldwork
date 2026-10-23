#!/usr/bin/env python3
"""Small vision-model review: is the guide clue clearly visible in the candidate's Street View frame(s)?

Usage: python3 review.py candidates.jsonl [gap/candidates.jsonl ...]   (resumable; appends to review.jsonl)
Runs `codex exec` with a small model (REVIEW_MODEL, default gpt-6-luna) on batches of candidates.
"""
import concurrent.futures as cf
import json
import os
import subprocess
import sys
import tempfile
import threading

from text import HERE

MODEL = os.environ.get('REVIEW_MODEL', 'gpt-6-luna')
WORKERS = int(os.environ.get('REVIEW_WORKERS', '6'))
ACCEPT_P = 0.6  # minimum self-reported verdict confidence for a "yes"
# Human-aimed cameras (the guide author's link, the map maker's original view) are trusted as placed: Seth's call, and a
# zoomed re-review of 362 rejected aimed views recovered only 15. The reviewer only picks their opening frame.
# Machine-oriented views (level rotations, Vali samples) need a confident "yes", and never for small-detail kinds:
# hand-labelled gold in seed/ shows rotated-view "yes" right 10/18 on infrastructure, aimed-view "yes" 21/21.
INFRA_KINDS = {'infrastructure', 'signs-and-text', 'phone-and-plates'}
IMAGES_PER_CALL = 12
INSTRUCTIONS = """You check Street View frames for a GeoGuessr study map.
Each numbered item below lists its own attached images (Street View frames from ONE location; several frames face different directions).
For each item decide whether THAT item's clue (the specific feature it describes) is clearly visible in one of its frames, so a player looking at that frame could learn the clue.
Landscape, vegetation and architecture clues count when the scene clearly shows the described type.
A generic scene that merely does not contradict the clue does NOT count. Blank, black or indoor frames do not count.
For every item return visible (yes/partial/no), confidence (0-1, how sure you are of that verdict) and bestView (1-based
frame number within that item showing the clue, 0 if none)."""
SCHEMA = {'type': 'object', 'additionalProperties': False, 'required': ['results'], 'properties': {'results': {
    'type': 'array', 'items': {'type': 'object', 'additionalProperties': False,
                               'required': ['n', 'visible', 'confidence', 'bestView'],
                               'properties': {'n': {'type': 'integer'}, 'visible': {'type': 'string', 'enum': ['yes', 'partial', 'no']},
                                              'confidence': {'type': 'number'}, 'bestView': {'type': 'integer'}}}}}}


def accepts(candidate, verdict, kind):
    """The one acceptance rule. Returns (frame index, reviewer confirmed) or None."""
    views = len(candidate['views']) if candidate['thumbStatus'] == 'ok' else 0
    yes = (verdict is not None and verdict['verdict'] == 'yes' and verdict['verdictConfidence'] >= ACCEPT_P
           and isinstance(verdict.get('view'), int) and 0 <= verdict['view'] < views)
    aimed = (candidate['source'] == 'plonkit-example-link' or
             (candidate.get('framing') == 'original' and candidate['source'] in ('learnable-meta-export', 'learnable-meta-catalogue')))
    if aimed and views:
        return (verdict['view'], True) if yes else (0, False)
    # Same-spot captures keep the human's camera, so a "yes" counts for every kind (see neighbours.py).
    return (verdict['view'], True) if yes and (kind not in INFRA_KINDS or candidate['source'] == 'same-spot') else None


def batches(todo):
    batch, images = [], 0
    for c in todo:
        if batch and images + len(c['views']) > IMAGES_PER_CALL:
            yield batch
            batch, images = [], 0
        batch.append(c)
        images += len(c['views'])
    if batch:
        yield batch


# One-line descriptions of each tip's guide illustration (curate.py visual) tell the reviewer what the feature looks like.
VISUAL = json.loads((HERE / 'labels/visual.json').read_text()) if (HERE / 'labels/visual.json').exists() else {}


def ask(items, clues, schema_path):
    lines, args, image = [], [], 1
    for n, c in enumerate(items, 1):
        clue = clues[c['topicId']]
        first, last = image, image + len(c['views']) - 1
        frames = f'image {first}' if first == last else f'images {first}-{last} (frames 1-{len(c["views"])})'
        look = VISUAL.get(c['topicId'], {}).get('lookFor')
        lines.append(f"Item {n} [{frames}] - {clue['title']}: {clue['text'][:600]}" + (f' (Guide image shows: {look})' if look else ''))
        for v in c['views']:
            args += ['-i', str(HERE / v['thumb'])]
        image = last + 1
    prompt = INSTRUCTIONS + '\n\n' + '\n'.join(lines) + f'\n\nReturn exactly {len(items)} results, n=1..{len(items)}.'
    out = subprocess.run(['codex', 'exec', '--skip-git-repo-check', '--ignore-rules', '-s', 'read-only', '-m', MODEL,
                          '--output-schema', schema_path, *args, '--', prompt],
                         capture_output=True, text=True, timeout=900, cwd=tempfile.gettempdir())
    results = json.loads(out.stdout.strip().splitlines()[-1])['results']
    return {r['n']: r for r in results}


def main(paths):
    clues = {c['topicId']: c for c in json.loads((HERE / 'clues.json').read_text())}
    out = HERE / 'review.jsonl'
    done = {json.loads(l)['id'] for l in out.read_text().splitlines()} if out.exists() else set()
    todo = [c for p in paths for c in map(json.loads, (HERE / p).read_text().splitlines())
            if c['thumbStatus'] == 'ok' and c['id'] not in done]
    print(f'reviewing {len(todo)} candidates with {MODEL}', flush=True)
    schema = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False)
    json.dump(SCHEMA, schema)
    schema.close()
    lock = threading.Lock()
    counter = [0]

    def one(items):
        try:
            answers = ask(items, clues, schema.name)
        except Exception:
            return []  # retried on the next run
        recs = []
        for n, c in enumerate(items, 1):
            r = answers.get(n)
            if not r:
                continue
            confidence = max(0.0, min(1.0, float(r['confidence'])))
            # The round opens facing the frame the reviewer named.
            framed = 1 <= r['bestView'] <= len(c['views'])
            recs.append({'id': c['id'], 'verdict': r['visible'], 'verdictConfidence': round(confidence, 3),
                         'view': r['bestView'] - 1 if framed else None, 'model': MODEL})
        return recs

    with open(out, 'a') as f, cf.ThreadPoolExecutor(WORKERS) as pool:
        for recs in pool.map(one, batches(todo)):
            with lock:
                for rec in recs:
                    f.write(json.dumps(rec) + '\n')
                f.flush()
                before = counter[0] // 500
                counter[0] += len(recs)
                if counter[0] // 500 > before:
                    print(f'reviewed {counter[0]}/{len(todo)}', flush=True)


if __name__ == '__main__':
    main(sys.argv[1:])
