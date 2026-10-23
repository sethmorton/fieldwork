#!/usr/bin/env python3
"""Collect candidate views for every PlonkIt clue: guide example links + Learnable Meta catalogue views.

Resumable. Network: follows guide short links (google redirects), fetches one Street View thumbnail per
candidate view and one PlonkIt reference image per clue. Writes candidates.jsonl; review happens separately.
"""
import collections
import concurrent.futures as cf
import hashlib
import importlib.util
import json
import os
import sqlite3
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import text
from text import HERE, WORK

DB = WORK / 'location-database'
STAGES = {'country-identification', 'within-country-regional', 'specialist'}
LM_PER_CLUE = 4  # level 4-view map-pool locations judged per clue
LM_ORIGINAL_PER_CLUE = 12  # original-framing tries for core/useful clues (niche clues keep LM_PER_CLUE)
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'}
BLANK_BYTES = 2000  # the thumbnail service returns a ~1.2 kB placeholder for unavailable panoramas

spec = importlib.util.spec_from_file_location('bc', DB / 'build-catalogue.py')
bc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bc)


def fetch(url, tries=4, headers=None):
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={**UA, **(headers or {})}), timeout=30) as r:
                return r.geturl(), r.read()
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503) and attempt < tries - 1:
                time.sleep(5 * 2 ** attempt)
                continue
            raise
        except (urllib.error.URLError, TimeoutError):
            if attempt == tries - 1:
                raise
            time.sleep(3)


class JsonCache:
    def __init__(self, path):
        self.path, self.lock = path, threading.Lock()
        self.data = json.loads(path.read_text()) if path.exists() else {}

    def save(self):
        with self.lock:
            tmp = self.path.with_suffix('.tmp')
            tmp.write_text(json.dumps(self.data))
            tmp.replace(self.path)


def parse_view(url):
    return text.parse_maps_view(url)


def thumb(view, fov):
    """Exact source view. Thumbnail pitch is positive-down; source pitch is Street View POV (positive-up)."""
    pitch = -(view.get('pitch') or 0)
    key = f"{view['panoId']}_{view.get('heading') or 0:.1f}_{pitch:.1f}_{fov:.0f}"
    path = HERE / 'thumbs' / (hashlib.sha1(key.encode()).hexdigest()[:16] + '.jpg')
    if not path.exists():
        q = urllib.parse.urlencode({'cb_client': 'maps_sv.share', 'panoid': view['panoId'], 'w': 640, 'h': 400,
                                    'yaw': f"{view.get('heading') or 0:.2f}", 'pitch': f'{pitch:.2f}', 'thumbfov': f'{fov:.0f}'})
        _, body = fetch('https://streetviewpixels-pa.googleapis.com/v1/thumbnail?' + q)
        path.write_bytes(body)
    return path if path.stat().st_size > BLANK_BYTES else None


def zoom_to_fov(zoom):
    return max(20.0, min(100.0, 180 / 2 ** (zoom or 0)))


def candidate_id(c, clue_text):
    """Identity = clue (and its text) + source + panorama + reviewed cameras, so a stored verdict can never
    attach to a different clue, panorama or framing after a rerun."""
    key = [c['topicId'], hashlib.sha1(clue_text.encode()).hexdigest()[:10], c['source'], c['view']['panoId'],
           [[round(v['heading'] or 0, 1), round(v['pitch'] or 0, 1), round(v['fov'])] for v in c.get('views', [])]]
    return 'c-' + hashlib.sha1(json.dumps(key).encode()).hexdigest()[:16]


def main():
    (HERE / 'thumbs').mkdir(exist_ok=True)
    (HERE / 'refs').mkdir(exist_ok=True)
    inventory = json.loads((DB / 'foundations/all-guide-topic-inventory.json').read_text())
    country_at = bc.geolocator(json.loads((WORK / 'worldwide/countries-50m.geojson').read_text()))
    resolved = JsonCache(HERE / 'resolved-links.json')
    seed = WORK / 'geopractice/plonkit-example-resolutions.json'
    for url, rec in json.loads(seed.read_text()).items():
        resolved.data.setdefault(url, {'resolvedUrl': rec['resolvedUrl'], 'status': rec['httpStatus']})

    # Guide links the small model marked as comparisons (labels.py clues) illustrate a contrast, not the clue.
    label_path = HERE / 'labels/clues.json'
    comparison = {(t, url) for t, v in (json.loads(label_path.read_text()) if label_path.exists() else {}).items()
                  for url in v['comparisonLinks']}
    clues, links = [], []
    for unit in inventory['units']:
        if unit['coverageUnitType'] != 'country-or-territory':
            continue
        for t in unit['topics']:
            if t['stage'] not in STAGES:
                continue
            clue = {'topicId': t['sourceTopicId'], 'slug': unit['slug'], 'title': unit['title'], 'stage': t['stage'],
                    'section': t['section'], 'subsection': t.get('subsection'), 'tipUrl': t['tipUrl'],
                    'text': t['sourceText'], 'imageUrls': t['imageUrls'],
                    'skillIds': [s['skillId'] for s in t['existingSkills']]}
            clues.append(clue)
            links += [(clue, link['url']) for link in t['exampleLinks'] if (clue['topicId'], link['url']) not in comparison]

    def resolve(url):
        if url in resolved.data:
            return
        try:
            final, _ = fetch(url)
            resolved.data[url] = {'resolvedUrl': final, 'status': 200}
        except Exception as e:  # dead links are evidence too; keep the reason
            resolved.data[url] = {'resolvedUrl': None, 'status': str(e)[:120]}

    short = sorted({u for _, u in links if 'goo.gl' in u and u not in resolved.data})
    print(f'clues={len(clues)} links={len(links)} short-to-resolve={len(short)}', flush=True)
    with cf.ThreadPoolExecutor(4) as pool:
        for i, _ in enumerate(pool.map(resolve, short), 1):
            if i % 250 == 0:
                resolved.save()
                print(f'resolved {i}/{len(short)}', flush=True)
    resolved.save()

    def ref_image(clue):
        if not clue['imageUrls']:
            return None
        url = clue['imageUrls'][0]
        path = HERE / 'refs' / (hashlib.sha1(url.encode()).hexdigest()[:16] + Path(urllib.parse.urlparse(url).path).suffix)
        # plonkit.net throttles bulk image fetches to a crawl; references are a review aid, so fetching is opt-in.
        if not path.exists() and os.environ.get('FETCH_REFS') == '1':
            try:
                path.write_bytes(fetch(url, headers={'Referer': clue['tipUrl'], 'Accept': 'image/*'})[1])
            except Exception:
                return None
        return str(path.relative_to(HERE)) if path.exists() else None

    candidates = []
    for clue, url in links:
        final = url if 'goo.gl' not in url else resolved.data.get(url, {}).get('resolvedUrl')
        view = parse_view(final)
        if not view:
            continue
        country, same = text.in_guide_country(view, clue['slug'], clue['title'], country_at)
        if same is False:
            continue  # contrast example from another country
        candidates.append({'source': 'plonkit-example-link', 'sourceUrl': url, 'topicId': clue['topicId'], 'view': view,
                           'fov': max(20.0, min(100.0, view.get('fov') or 75.0)), 'coordinateCountry': country})

    # Learnable Meta map makers frame each location on its clue, so every map location gets an "original framing"
    # candidate (their exact camera); the first few also get four level 90-degree views. Foundational and useful clues
    # get more original-framing tries because small infrastructure (pole plates, stickers) is easy to miss at 90 degrees.
    curation_path = HERE / 'labels/curation.json'
    tiers = {f'plonkit:{slug}:{r["tipId"]}': r['tier']
             for slug, v in (json.loads(curation_path.read_text()) if curation_path.exists() else {}).items() for r in v['order']}
    rotated, original, seen = collections.Counter(), collections.Counter(), set()

    def add_lm(topic, view, extra):
        if (topic, view['panoId']) in seen:
            return
        seen.add((topic, view['panoId']))
        if rotated[topic] < LM_PER_CLUE:
            rotated[topic] += 1
            candidates.append({**extra, 'topicId': topic, 'view': view, 'fov': 90.0, 'coordinateCountry': None})
        if original[topic] < (LM_ORIGINAL_PER_CLUE if tiers.get(topic) in ('foundational', 'useful') else LM_PER_CLUE):
            original[topic] += 1
            candidates.append({**extra, 'framing': 'original', 'topicId': topic, 'view': view,
                               'fov': zoom_to_fov(view.get('zoom')), 'coordinateCountry': None})

    db = sqlite3.connect(DB / 'catalogue.sqlite')
    for clue in clues:
        for sid in clue['skillIds']:
            rows = db.execute('SELECT c.pano_id,c.lat,c.lng,c.heading,c.pitch,c.zoom,a.data FROM assignments a JOIN captures c '
                              'ON c.id=a.capture_id WHERE a.skill_id=? AND a.shared_eligible=1 AND c.camera_complete=1 '
                              'ORDER BY c.pano_id', (sid,)).fetchall()
            for pano, lat, lng, heading, pitch, zoom, data in rows:
                add_lm(clue['topicId'], {'panoId': pano, 'lat': lat, 'lng': lng, 'heading': heading, 'pitch': pitch, 'zoom': zoom},
                       {'source': 'learnable-meta-catalogue', 'skillId': sid, 'sourceMapIds': json.loads(data).get('sourceMapIds')})

    # Per-meta exports from shared Learnable Meta maps (harvest_lm.py export). The small model mapped each meta to the
    # Plonk It tip it teaches (curate.py metas); unmapped metas are not used.
    exports = HERE / 'lm/exports.jsonl'
    meta_tips = HERE / 'labels/meta-tips.json'
    if exports.exists() and meta_tips.exists():
        topic_of = {f"{m['metaId']}:{m['mapId']}": m['topicId']
                    for v in json.loads(meta_tips.read_text()).values() for m in v['metas'] if m['topicId']}
        for line in exports.read_text().splitlines():
            e = json.loads(line)
            key = f"{e['metaId']}:{e['mapId']}"
            if key not in topic_of:
                continue
            for loc in e['locations']:
                add_lm(topic_of[key], {k: loc.get(k) for k in ('panoId', 'lat', 'lng', 'heading', 'pitch', 'zoom')},
                       {'source': 'learnable-meta-export', 'sourceMetaId': e['metaId'], 'sourceMapIds': [e['mapId']]})

    # Reference-site examples (sources.py: GeoHints, Geometas) the small model mapped to a specific tip. Only examples
    # whose link names a panorama can be checked and played; coordinate-only examples are skipped.
    mapped = HERE / 'sources/mapped.json'
    for example in (e for v in (json.loads(mapped.read_text()) if mapped.exists() else {}).values() for e in v['examples']):
        if example.get('panoId'):
            add_lm(example['topicId'], {k: example.get(k) for k in ('panoId', 'lat', 'lng', 'heading', 'pitch')},
                   {'source': example['source'], 'sourceUrl': example.get('url') or example.get('shortUrl')})

    by_topic = {c['topicId']: c for c in clues}
    need_ref = {c['topicId'] for c in clues}  # gap fill reviews clues without example links too

    def finish(c):
        """Guide links and original Learnable Meta framings keep the author's camera. Level map-pool views face the
        default heading, which often misses the clue, so they get four 90-degree views and review picks one."""
        base = c['view']
        if c['source'] == 'plonkit-example-link' or c.get('framing') == 'original':
            views = [(base, c['fov'])]
        else:
            views = [({**base, 'heading': ((base.get('heading') or 0) + 90 * k) % 360, 'pitch': 0}, 90.0) for k in range(4)]
        c['views'] = []
        try:
            for view, fov in views:
                path = thumb(view, fov)
                if path is None:
                    break  # unavailable panorama: every heading is blank
                c['views'].append({'heading': view.get('heading'), 'pitch': view.get('pitch'), 'fov': fov,
                                   'thumb': str(path.relative_to(HERE))})
            c['thumbStatus'] = 'ok' if c['views'] else 'panorama-unavailable'
        except Exception as e:
            c['thumbStatus'] = f'error: {str(e)[:80]}'
        return c

    with cf.ThreadPoolExecutor(6) as pool:
        for i, _ in enumerate(pool.map(finish, candidates), 1):
            if i % 500 == 0:
                print(f'thumbs {i}/{len(candidates)}', flush=True)
    with cf.ThreadPoolExecutor(2) as pool:
        refs = dict(zip(sorted(need_ref), pool.map(lambda t: ref_image(by_topic[t]), sorted(need_ref))))
    for clue in clues:
        clue['refImage'] = refs.get(clue['topicId'])

    (HERE / 'clues.json').write_text(json.dumps(clues, ensure_ascii=False, indent=1))
    with open(HERE / 'candidates.jsonl', 'w') as f:
        for c in candidates:
            c['id'] = candidate_id(c, by_topic[c['topicId']]['text'])
            f.write(json.dumps(c, ensure_ascii=False) + '\n')
    ok = sum(c['thumbStatus'] == 'ok' for c in candidates)
    print(json.dumps({'clues': len(clues), 'candidates': len(candidates), 'thumbsOk': ok,
                      'cluesWithCandidate': len({c['topicId'] for c in candidates if c['thumbStatus'] == 'ok'})}))


if __name__ == '__main__':
    sys.exit(main())
