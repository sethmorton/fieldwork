#!/usr/bin/env python3
"""Spot-check sheet: numbered tiles of reviewed candidates (opening frame, verdict, clue text) so a person can count
wrong tiles before scaling a run. Run a small stage, look, then the big one.
Usage: uv run --with pillow python audit.py OUT.jpg accepted|rejected|any [N] [SEED]
"""
import json
import random
import sys
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw

import review
from text import HERE

W, H, CAPTION, COLS = 480, 300, 80, 3


def main(out, outcome, n=12, seed=0):
    cands = {c['id']: c for p in ('candidates.jsonl', 'gap/candidates.jsonl', 'near/candidates.jsonl', 'acow/candidates.jsonl')
             for c in map(json.loads, (HERE / p).read_text().splitlines())}
    clues = {c['topicId']: c for c in json.loads((HERE / 'clues.json').read_text())}
    kind = {f'plonkit:{s}:{r["tipId"]}': r['kind']
            for s, v in json.loads((HERE / 'labels/curation.json').read_text()).items() for r in v['order']}
    latest = {}
    for line in (HERE / 'review.jsonl').read_text().splitlines():
        r = json.loads(line)
        latest[r['id']] = r
    pool = [r for r in latest.values() if r['id'] in cands and (outcome == 'any' or
            bool(review.accepts(cands[r['id']], r, kind.get(cands[r['id']]['topicId']))) == (outcome == 'accepted'))]
    pick = random.Random(seed).sample(pool, min(n, len(pool)))
    rows = -(-len(pick) // COLS)
    sheet = Image.new('RGB', (W * COLS, (H + CAPTION) * rows), 'white')
    draw = ImageDraw.Draw(sheet)
    for i, r in enumerate(pick):
        c = cands[r['id']]
        x, y = i % COLS * W, i // COLS * (H + CAPTION)
        frame = c['views'][r['view'] if r['view'] is not None else 0]['thumb']
        sheet.paste(Image.open(HERE / frame).convert('RGB').resize((W, H)), (x, y))
        caption = f"{i + 1}. {c['topicId'].split(':')[1]} {c['source']} [{r['verdict']}] {clues[c['topicId']]['text']}"
        draw.text((x + 4, y + H + 2), '\n'.join(textwrap.wrap(caption, 80)[:6]), fill='black')
    sheet.save(out, quality=85)
    (Path(out).with_suffix('.ids.json')).write_text(json.dumps([r['id'] for r in pick]))
    print(f'{len(pick)} of {len(pool)} {outcome} records -> {out}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], *map(int, sys.argv[3:]))
