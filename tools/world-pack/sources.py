#!/usr/bin/env python3
"""Extra labelled example locations from public GeoGuessr reference sites, mapped to Plonk It tips by a small model.

  sources.py fetch   # Geometas meta pages (robots allow) + GeoHints category pages -> sources/raw.json (polite, cached)
  sources.py map     # small model: which Plonk It tip of that country does each example illustrate? -> sources/mapped.json

collect.py turns mapped examples into review candidates (sources 'geometas' / 'geohints').
"""
import concurrent.futures as cf
import hashlib
import json
import sys
import time
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

import text
from curate import WORKERS, ask, fingerprint, schema, tips
from text import HERE

OUT = HERE / 'sources'
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/141 fieldwork-study-bank'}
GEOHINTS_CATEGORIES = ['utilityPoles', 'bollards', 'licensePlates', 'phoneNumbers', 'lines', 'signs', 'architecture',
                       'houseNumbers', 'postBoxes', 'sidewalks', 'googleVehicles/cars', 'followCars', 'nature', 'sceneries']


def get(url):
    """Cached page body, or '' when the site errors (a missing page just contributes no examples)."""
    path = OUT / 'pages' / (hashlib.sha1(url.encode()).hexdigest()[:16] + '.html')
    if not path.exists():
        time.sleep(1)  # one request per second
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                path.write_bytes(r.read())
        except Exception as e:
            print('page failed', url, e, flush=True)
            return ''
    return path.read_text(errors='replace')


class Tree(HTMLParser):
    """Flat (tag, attrs, text) events, enough to read these two sites' simple markup."""
    def __init__(self):
        super().__init__()
        self.events, self.stack = [], []

    def handle_starttag(self, tag, attrs):
        self.stack.append(tag)
        self.events.append(('start', tag, dict(attrs), ''))

    def handle_endtag(self, tag):
        if self.stack:
            self.stack.pop()

    def handle_data(self, data):
        if data.strip() and (not self.stack or self.stack[-1] not in ('script', 'style')):
            self.events.append(('text', self.stack[-1] if self.stack else '', {}, data.strip()))


def events(html):
    tree = Tree()
    tree.feed(html)
    return tree.events


def geometas():
    sitemap = get('https://www.geometas.com/sitemap.xml')
    urls = [part.split('</loc>', 1)[0] for part in sitemap.split('<loc>')[1:] if '/metas/detail/' in part.split('</loc>', 1)[0]]
    rows = []
    for url in urls:
        ev = events(get(url))
        texts = [d for kind, tag, _, d in ev if kind == 'text']
        spans = [d for kind, tag, _, d in ev if kind == 'text' and tag == 'span']
        h1 = next((d for kind, tag, _, d in ev if kind == 'text' and tag == 'h1'), '')
        embed = next((a['src'] for kind, tag, a, _ in ev if tag == 'iframe' and 'streetview' in a.get('src', '')), '')
        if 'location=' not in embed:
            continue
        lat, lng = (float(x) for x in embed.split('location=', 1)[1].split('&', 1)[0].split(',')[:2])
        body = texts[texts.index(h1) + 1: texts.index('Explore on Google Streetview')] if h1 in texts and 'Explore on Google Streetview' in texts else []
        flag_country = next((s.split(' ', 1)[1] for s in spans if ' ' in s and not s[0].isascii()), None)
        rows.append({'source': 'geometas', 'url': url, 'country': flag_country, 'title': h1,
                     'text': ' '.join(b for b in body if b not in spans), 'lat': lat, 'lng': lng})
    return rows


def geohints():
    rows = []
    for category in GEOHINTS_CATEGORIES:
        ev = events(get(f'https://geohints.com/meta/{category}'))
        country, caption, image = None, '', None
        for kind, tag, attrs, data in ev:
            if kind == 'text' and tag == 'span':
                country, caption, image = data.strip(), '', None
            elif kind == 'text' and tag in ('p', 'div') and country:
                caption = (caption + ' ' + data).strip()
            elif kind == 'start' and tag == 'img' and country and 'storage' in attrs.get('src', ''):
                image = attrs['src']
            elif kind == 'start' and tag == 'a' and country and 'goo.gl' in attrs.get('href', ''):
                rows.append({'source': 'geohints', 'category': category, 'country': country, 'caption': caption,
                             'image': image, 'shortUrl': attrs['href']})
    return rows


def fetch():
    (OUT / 'pages').mkdir(parents=True, exist_ok=True)
    rows = geometas() + geohints()
    resolved = json.loads((HERE / 'resolved-links.json').read_text())
    todo = sorted({r['shortUrl'] for r in rows if r.get('shortUrl') and r['shortUrl'] not in resolved})
    print(f'{len(rows)} examples, resolving {len(todo)} links', flush=True)

    def resolve(url):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return url, {'resolvedUrl': r.geturl(), 'status': 200}
        except Exception as e:
            return url, {'resolvedUrl': None, 'status': str(e)[:120]}
    with cf.ThreadPoolExecutor(4) as pool:
        resolved.update(dict(pool.map(resolve, todo)))
    (HERE / 'resolved-links.json').write_text(json.dumps(resolved))
    for r in rows:
        if r.get('shortUrl'):
            view = text.parse_maps_view(resolved.get(r['shortUrl'], {}).get('resolvedUrl'))
            if view:
                r.update(view)
    rows = [r for r in rows if 'lat' in r]
    (OUT / 'raw.json').write_text(json.dumps(rows, ensure_ascii=False))
    print(f'{len(rows)} examples with coordinates', flush=True)


def example_image(c):
    """The reference site's own picture of this example (GeoHints), cached in sources/images/."""
    if not c.get('image'):
        return None
    path = OUT / 'images' / (hashlib.sha1(c['image'].encode()).hexdigest()[:16] + Path(c['image']).suffix)
    if not path.exists():
        path.parent.mkdir(exist_ok=True)
        try:
            time.sleep(0.5)
            with urllib.request.urlopen(urllib.request.Request(c['image'], headers=UA), timeout=60) as r:
                path.write_bytes(r.read())
        except Exception:
            return None
    return path


def map_examples():
    rows = json.loads((OUT / 'raw.json').read_text())
    by_title = {' '.join(text.words(unit['title'])): (slug, unit, tips_) for slug, (unit, tips_) in tips().items()}
    path = OUT / 'mapped.json'
    mapped = json.loads(path.read_text()) if path.exists() else {}
    groups = {}
    for r in rows:
        key = ' '.join(text.words(r['country'] or ''))
        if key in by_title:
            groups.setdefault(key, []).append(r)
    jobs = []
    for key, items in groups.items():
        slug, unit, tips_ = by_title[key]
        tip_lines = '\n'.join(f"{t['tipId']}: {t['sourceText'][:200]}" for t in tips_)
        for i in range(0, len(items), 10):
            chunk = items[i:i + 10]
            jkey = f"{slug}:{fingerprint([c.get('url') or c.get('shortUrl') for c in chunk])}"
            fp = fingerprint(tip_lines, chunk)
            if mapped.get(jkey, {}).get('fingerprint') != fp:
                jobs.append((jkey, slug, unit, tip_lines, chunk, fp))
    print(f'mapping {sum(len(j[4]) for j in jobs)} examples in {len(jobs)} calls', flush=True)
    sch = schema({'n': {'type': 'integer'}, 'tipId': {'type': 'string'}})

    def one(job):
        jkey, slug, unit, tip_lines, chunk, fp = job
        images = [example_image(c) for c in chunk]
        listing, k = [], 0
        for n, c in enumerate(chunk, 1):
            shown = f' [image {k + 1}]' if images[n - 1] else ''
            k += bool(images[n - 1])
            listing.append(f"Example {n}{shown} [{c['source']} {c.get('category', '')}]: "
                           f"{c.get('title', '')} {c.get('text', '') or c.get('caption', '')}"[:400])
        prompt = (f'Plonk It region-guessing tips for {unit["title"]}:\n{tip_lines}\n\nExamples from GeoGuessr reference sites '
                  f'(category, caption, and the site\'s own example image where attached):\n' + '\n'.join(listing) +
                  '\n\nFor each example give the tipId it is a clear example of (same feature, and for a regional tip the '
                  'same regional variant as the tip describes, judged from the image), or "none" when it only shows a '
                  f'country-wide feature or is unclear. Return exactly {len(chunk)} results, n=1..{len(chunk)}.')
        try:
            res = {r['n']: r['tipId'] for r in ask(prompt, sch, [p for p in images if p])['results']}
        except Exception:
            return None
        ids = {t.split(':', 1)[0] for t in tip_lines.splitlines()}
        return jkey, {'fingerprint': fp, 'examples': [{**c, 'topicId': f'plonkit:{slug}:{res[n]}'}
                                                      for n, c in enumerate(chunk, 1) if res.get(n) in ids]}
    with cf.ThreadPoolExecutor(WORKERS) as pool:
        for got in pool.map(one, jobs):
            if got:
                mapped[got[0]] = got[1]
                path.write_text(json.dumps(mapped, ensure_ascii=False))
    print(f"{sum(len(v['examples']) for v in mapped.values())} examples mapped to tips", flush=True)


if __name__ == '__main__':
    OUT.mkdir(exist_ok=True)
    {'fetch': fetch, 'map': map_examples}[sys.argv[1]]()
