#!/usr/bin/env python3
"""Network-only thumbnail availability and black-frame checks, cached by exact view.

WORLD_PACK_DATA=... uv run --with pillow --with shapely tools/world-pack/training_images.py
"""
import argparse
import concurrent.futures as cf
import fcntl
import hashlib
from io import BytesIO
import json
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from text import HERE
from training_pano import official_id

OUT = HERE / 'training'
CACHE = OUT / 'thumb-checks.jsonl'
PIXEL_VERSION = 2
DISPLAY_SIZE = (1280, 800)


def display_url(view):
    from label import image_url
    url = urlsplit(view.get('image') or image_url(view))
    query = dict(parse_qsl(url.query))
    query.update(w='1280', h='800')
    return urlunsplit((url.scheme, url.netloc, url.path, urlencode(query), url.fragment))


def view_key(view, size=(640, 400)):
    if size == DISPLAY_SIZE:
        params = dict(parse_qsl(urlsplit(display_url(view)).query))
        values = [official_id(params.get('panoid')), float(params.get('yaw', 0)),
                  -float(params.get('pitch', 0)), float(params.get('thumbfov', 90)), *size]
    else:
        values = [official_id(view.get('panoId')), round(float(view.get('heading') or 0), 2),
                  round(float(view.get('pitch') or 0), 2), float(view.get('fov') or 90), *size]
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
                    out[rec['key']] = ({**rec, 'ok': None} if rec['ok'] is True and
                        rec.get('pixelVersion', 0) < PIXEL_VERSION else rec)
    return out


def save(rec):
    OUT.mkdir(parents=True, exist_ok=True)
    with CACHE.open('a') as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        f.write(json.dumps(rec) + '\n')
        f.flush()


def pixel_quality(image):
    """Ignore credit text at the edges, then reject dark or nearly uniform unusable views."""
    width, height = image.size
    gray = image.convert('L').crop((int(width * .02), int(height * .02),
                                   int(width * .98), int(height * .93))).resize((128, 80))
    hist = gray.histogram()
    total = sum(hist)
    mean = sum(i * n for i, n in enumerate(hist)) / total
    variance = sum((i - mean) ** 2 * n for i, n in enumerate(hist)) / total
    dark = sum(hist[:16]) / total
    uniform = max(sum(hist[i:i + 8]) for i in range(249)) / total
    bad = mean < 12 or dark >= .95 or variance < 4 or uniform >= .98
    return {'ok': not bad, 'reason': 'black-or-uniform-frame' if bad else 'available',
            'mean': round(mean, 2), 'variance': round(variance, 2),
            'darkFraction': round(dark, 4), 'uniformFraction': round(uniform, 4)}


def check(view, known=None, refresh=False, size=(640, 400)):
    """False is a known bad frame. None is a transient network failure, never a false claim of availability."""
    known = known if known is not None else states()
    key = view_key(view, size)
    previous = known.get(key, {})
    if previous.get('ok') is False or (not refresh and previous.get('ok') is True and
                                      previous.get('pixelVersion', 0) >= PIXEL_VERSION):
        return previous
    from PIL import Image, UnidentifiedImageError
    pano = official_id(view.get('panoId'))
    rec = {'key': key, 'panoId': pano or view.get('panoId'), 'heading': view.get('heading') or 0,
           'pitch': view.get('pitch') or 0, 'fov': view.get('fov') or 90,
           'size': list(size), 'pixelVersion': PIXEL_VERSION, 'at': time.time()}
    try:
        if not pano:
            rec.update(ok=False, reason='non-official-panorama')
        else:
            import collect
            if size == DISPLAY_SIZE:
                url = display_url(view)
                _, body = collect.fetch(url)
                source = BytesIO(body)
                rec.update(url=url, networkCheckedAt=time.time())
            else:
                source = collect.thumb({**view, 'panoId': pano}, view.get('fov') or 90, refresh=refresh)
                if refresh:
                    rec['networkCheckedAt'] = time.time()
            if source is None:
                rec.update(ok=False, reason='unavailable-placeholder')
            else:
                with Image.open(source) as image:
                    image.load()
                    rec.update(pixel_quality(image))
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
        if args.board_only and loc['split'] not in ('study', 'seen') and not loc.get('metaCount'):
            continue
        key = view_key(loc, DISPLAY_SIZE)
        if key not in used and (key not in known or known[key]['ok'] is None or
                               (args.refresh_network and known[key]['ok'] is True)):
            used.add(key)
            todo.append(loc)
            if len(todo) == args.limit:
                break
    print(json.dumps({'pending': len(todo), 'cachedViews': len(known), 'workers': args.workers}), flush=True)
    counts, checked = {'available': 0, 'bad': 0, 'networkError': 0}, 0
    with cf.ThreadPoolExecutor(args.workers) as pool:
        for rec in pool.map(lambda loc: check(loc, known, args.refresh_network, DISPLAY_SIZE), todo):
            checked += 1
            counts['available' if rec['ok'] is True else 'bad' if rec['ok'] is False else 'networkError'] += 1
            if checked % 100 == 0:
                print(json.dumps({'checked': checked, **counts}), flush=True)
            if args.rebuild_every and checked % args.rebuild_every == 0:
                rebuild()
    report = {'checked': checked, **counts, 'size': list(DISPLAY_SIZE), 'boardOnly': args.board_only, 'at': time.time()}
    (OUT / 'thumb-report.json').write_text(json.dumps(report, indent=2))
    rebuild()
    print(json.dumps(report), flush=True)


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--limit', type=int, default=60000)
    ap.add_argument('--workers', type=int, choices=range(1, 7), default=4)
    ap.add_argument('--rebuild-every', type=int, default=512)
    ap.add_argument('--refresh-network', action='store_true', help='Refetch current views before decoding pixels')
    ap.add_argument('--board-only', action='store_true', help='Study/seen and meta-bearing playable photos first')
    args = ap.parse_args()
    if args.limit < 1 or args.limit > 100000 or args.rebuild_every < 0:
        ap.error('limit must be 1..100000 and rebuild interval nonnegative')
    run(args)
