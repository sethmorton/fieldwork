#!/usr/bin/env python3
"""Network-only thumbnail availability and black-frame checks, cached by exact view.

WORLD_PACK_DATA=... uv run --with pillow --with shapely tools/world-pack/training_images.py
"""
import argparse
import concurrent.futures as cf
import fcntl
import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import HTTPError

from text import HERE
from training_pano import official_id

OUT = HERE / 'training'
CACHE = OUT / 'thumb-checks.jsonl'


def view_key(view):
    values = [official_id(view.get('panoId')), round(float(view.get('heading') or 0), 2),
              round(float(view.get('pitch') or 0), 2), float(view.get('fov') or 90), 640, 400]
    return hashlib.sha256(json.dumps(values).encode()).hexdigest()


def states():
    out = {}
    if CACHE.exists():
        with CACHE.open() as f:
            for line in f:
                if not line.endswith('\n'):
                    break
                if line.strip():
                    rec = json.loads(line)
                    out[rec['key']] = rec
    return out


def save(rec):
    OUT.mkdir(parents=True, exist_ok=True)
    with CACHE.open('a') as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        f.write(json.dumps(rec) + '\n')
        f.flush()


def check(view, known=None):
    """False is a known bad frame. None is a transient network failure, never a false claim of availability."""
    known = known if known is not None else states()
    key = view_key(view)
    if key in known and known[key]['ok'] is not None:
        return known[key]
    from PIL import Image, ImageStat, UnidentifiedImageError
    pano = official_id(view.get('panoId'))
    rec = {'key': key, 'panoId': pano or view.get('panoId'), 'heading': view.get('heading') or 0,
           'pitch': view.get('pitch') or 0, 'fov': view.get('fov') or 90, 'at': time.time()}
    try:
        if not pano:
            rec.update(ok=False, reason='non-official-panorama')
        else:
            import collect
            path = collect.thumb({**view, 'panoId': pano}, view.get('fov') or 90)
            if path is None:
                rec.update(ok=False, reason='unavailable-placeholder')
            else:
                with Image.open(path) as image:
                    image.load()
                    stat = ImageStat.Stat(image.convert('L').resize((64, 40)))
                    mean, variance = stat.mean[0], stat.var[0]
                black = mean < 8 and variance < 20
                rec.update(ok=not black, reason='black-frame' if black else 'available',
                           mean=round(mean, 2), variance=round(variance, 2))
    except HTTPError as e:
        rec.update(ok=False if e.code in (404, 410) else None, reason=f'http-{e.code}')
    except UnidentifiedImageError:
        rec.update(ok=False, reason='unreadable-image')
    except (OSError, ValueError) as e:
        rec.update(ok=None, reason=type(e).__name__ + ': ' + str(e)[:100])
    save(rec)
    known[key] = rec
    return rec


def rebuild():
    result = subprocess.run(['uv', 'run', '--with', 'shapely', str(Path(__file__).with_name('training.py')), 'build'],
                            capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr[-1000:])
    return json.loads(result.stdout)


def run(args):
    pack = json.loads((OUT / 'pack.json').read_text())
    known = states()
    locations = sorted(pack['locations'], key=lambda l: (
        l['split'] not in ('study', 'seen'), not bool(l.get('metaCount')), -pack['acow'].get(l['country'], 0), l['id']))
    todo, used = [], set()
    for loc in locations:
        key = view_key(loc)
        if key not in used and (key not in known or known[key]['ok'] is None):
            used.add(key)
            todo.append(loc)
            if len(todo) == args.limit:
                break
    print(json.dumps({'pending': len(todo), 'cachedViews': len(known), 'workers': args.workers}), flush=True)
    counts, checked = {'available': 0, 'bad': 0, 'networkError': 0}, 0
    with cf.ThreadPoolExecutor(args.workers) as pool:
        for rec in pool.map(lambda loc: check(loc, known), todo):
            checked += 1
            counts['available' if rec['ok'] is True else 'bad' if rec['ok'] is False else 'networkError'] += 1
            if checked % 100 == 0:
                print(json.dumps({'checked': checked, **counts}), flush=True)
            if args.rebuild_every and checked % args.rebuild_every == 0:
                rebuild()
    report = {'checked': checked, **counts, 'at': time.time()}
    (OUT / 'thumb-report.json').write_text(json.dumps(report, indent=2))
    rebuild()
    print(json.dumps(report), flush=True)


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--limit', type=int, default=60000)
    ap.add_argument('--workers', type=int, choices=range(1, 7), default=4)
    ap.add_argument('--rebuild-every', type=int, default=512)
    args = ap.parse_args()
    if args.limit < 1 or args.limit > 100000 or args.rebuild_every < 0:
        ap.error('limit must be 1..100000 and rebuild interval nonnegative')
    run(args)
