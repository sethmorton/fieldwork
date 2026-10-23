"""Plain string helpers for guide text and Maps URLs. Deliberately regex-free: judgement calls about meaning go
to the small model (labels.py), and everything here is mechanical splitting."""
import html
import os
import unicodedata
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

# Every step reads and writes its caches under HERE and reads upstream inputs (location-database, worldwide,
# plonkit-guides, plonkit-browser-index, geopractice) under WORK.
HERE = Path(os.environ.get('WORLD_PACK_DATA') or Path(__file__).resolve().parent)
WORK = Path(os.environ.get('WORLD_PACK_INPUTS') or HERE.parent)

STOPS = '.!?'


def sentences(text):
    """Split on '.', '!' or '?' followed by whitespace."""
    out, start = [], 0
    for i, ch in enumerate(text):
        if ch in STOPS and (i + 1 == len(text) or text[i + 1].isspace()):
            out.append(text[start:i + 1].strip())
            start = i + 1
    if text[start:].strip():
        out.append(text[start:].strip())
    return out


def sentence_with(text, anchor):
    """The sentence of `text` containing `anchor` (paragraph-local)."""
    at = text.find(anchor)
    if at < 0:
        return ''
    paragraph = text[text.rfind('\n', 0, at) + 1:].split('\n', 1)[0]
    return next((s for s in sentences(paragraph) if anchor in s), paragraph)


class _Text(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)


def plain(markup):
    parser = _Text()
    parser.feed(markup or '')
    return html.unescape(' '.join(parser.parts))


def fold(text):
    return ''.join(c for c in unicodedata.normalize('NFKD', text.casefold()) if not unicodedata.combining(c))


def words(text):
    return ''.join(c if c.isalnum() else ' ' for c in fold(text)).split()


def parse_maps_view(url):
    """Street View camera encoded in a Google Maps URL, or None. Pitch is Street View POV (tilt - 90)."""
    parsed = urlparse(url or '')
    if 'google.' not in (parsed.hostname or ''):
        return None
    try:
        query = parse_qs(parsed.query)
        if query.get('map_action') == ['pano'] and query.get('pano') and query.get('viewpoint'):
            lat, lng = (float(x) for x in query['viewpoint'][0].split(',')[:2])
            view = {'panoId': query['pano'][0], 'lat': lat, 'lng': lng}
            for key in ('heading', 'pitch', 'fov'):
                if query.get(key):
                    view[key] = float(query[key][0])
            return view
        if '/@' not in parsed.path or '!1s' not in unquote(parsed.path):
            return None
        camera = parsed.path.split('/@', 1)[1].split('/', 1)[0].split(',')
        if not any(part.endswith('a') for part in camera[2:]):
            return None  # a place or map view, not a Street View camera
        view = {'panoId': unquote(parsed.path).split('!1s', 1)[1].split('!', 1)[0],
                'lat': float(camera[0]), 'lng': float(camera[1])}
        for part in camera[2:]:
            if part.endswith('y'):
                view['fov'] = float(part[:-1])
            elif part.endswith('h'):
                view['heading'] = float(part[:-1])
            elif part.endswith('t'):
                view['pitch'] = float(part[:-1]) - 90
        if not view['panoId'] or abs(view['lat']) > 90 or abs(view['lng']) > 180:
            return None
        return view
    except (ValueError, IndexError):
        return None


# Guide units whose Natural Earth country has another name, or that are part of a parent country.
COUNTRY_ALIASES = {'israel-west-bank': ['Israel', 'Palestine'], 'hong-kong': ['Hong Kong S.A.R.'], 'macau': ['Macao S.A.R'],
                   'tanzania': ['United Republic of Tanzania'], 'serbia': ['Republic of Serbia'], 'eswatini': ['eSwatini'],
                   'us-virgin-islands': ['United States Virgin Islands'], 'united-states': ['United States of America'],
                   'czechia': ['Czechia', 'Czech Republic'],
                   'south-georgia-sandwich-islands': ['South Georgia and the Islands'],
                   'hawaii': ['United States of America'], 'alaska': ['United States of America'], 'azores': ['Portugal'],
                   'madeira': ['Portugal'], 'reunion': ['France'], 'svalbard': ['Norway'],
                   'christmas-island': ['Indian Ocean Territories'], 'cocos-islands': ['Indian Ocean Territories']}


def in_guide_country(view, slug, title, country_at):
    """(polygon country, True/False/None): does the location lie in the guide's own country?"""
    actual = country_at(view['lat'], view['lng'])
    if actual is None:
        return None, None
    key = lambda name: ''.join(c for c in fold(name) if c.isalnum())
    return actual, key(actual) in {key(n) for n in COUNTRY_ALIASES.get(slug, [title])}
