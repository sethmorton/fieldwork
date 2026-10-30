"""Tree deck for the US Vegetation pack (usveg.py): roadside trees taught one at a time, the way Plonk It teaches bollards.

Each DECK card is one tree you can name from the car at Street View distance (look-alikes that the view cannot separate
share a card). Per card, a skill (subject 'tree', practiceFamily 'trees') with:
  - spot: 3 bullets of at most SPOT_WORDS words (silhouette, bark or colour, setting) and area: where it lives in a few
    words, written by MODEL from that species card's text and its range names only, cached in local/usveg-trees.json
  - range: ecoregions where any of its species is a key tree or >= 3% of biomass, plus the regions of its labelled
    panoramas; states: the pool states those regions cover (>= 1% of their points). A tree round is right when the pin
    lands in any range region (session.mjs completedRound)
  - examples: crops (tree box + PAD a side) from labelled panoramas, high confidence first, largest box first
  - cost: 1000 x the ACoW share of panoramas that name it (sum over regions of region share x share of its panoramas)
One location per panorama that labels it at high confidence: a copy of the region location, id 'usveg:tree:<card>:<pano>',
with `tree` = that label's {label, box}.
Why the provisional list changed: slash pine joins loblolly (same plantation crown and bark at road distance); Jeffrey
pine joins ponderosa (same orange plates and open stands); Engelmann spruce joins subalpine fir (the same dark spire);
red spruce joins balsam fir (the same eastern spire); one-seed and western juniper join Utah juniper (same shaggy bush-
tree in the same open woodland). Eucalyptus, ohia and kiawe are out: the atlas has no species card or range for them.
"""
import json
import sys
from pathlib import Path

MODEL, SPOT_WORDS, AREA_WORDS, PAD, EXAMPLES = 'gpt-6-astra', 10, 10, 0.15, 6
CACHE = Path(__file__).resolve().parents[2] / 'local/usveg-trees.json'
# card id (its first species' card is the text source): [species ids it covers], title when merged
DECK = {
    'ponderosa-pine': (['ponderosa-pine', 'jeffrey-pine'], 'Ponderosa pine'),
    'douglas-fir': (['douglas-fir'], None), 'western-hemlock': (['western-hemlock'], None),
    'western-redcedar': (['western-redcedar'], None), 'sitka-spruce': (['sitka-spruce'], None),
    'coast-redwood': (['coast-redwood'], None), 'lodgepole-pine': (['lodgepole-pine'], None),
    'quaking-aspen': (['quaking-aspen', 'aspen'], None),
    'subalpine-fir': (['subalpine-fir', 'engelmann-spruce'], 'Subalpine fir / Engelmann spruce'),
    'utah-juniper': (['utah-juniper', 'one-seed-juniper', 'western-juniper'], 'Utah / western juniper'),
    'pinyon-pine': (['pinyon-pine', 'singleleaf-pinyon'], 'Pinyon pine'),
    'joshua-tree': (['joshua-tree'], None), 'saguaro': (['saguaro'], None), 'blue-oak': (['blue-oak'], None),
    'coast-live-oak': (['coast-live-oak'], None), 'gray-pine': (['gray-pine'], None),
    'cottonwood': (['cottonwood', 'fremont-cottonwood', 'eastern-cottonwood'], 'Cottonwood'),
    'eastern-white-pine': (['eastern-white-pine'], None), 'red-pine': (['red-pine'], None),
    'paper-birch': (['paper-birch'], None), 'eastern-redcedar': (['eastern-redcedar'], None),
    'eastern-hemlock': (['eastern-hemlock'], None), 'balsam-fir': (['balsam-fir', 'red-spruce'], 'Balsam fir / red spruce'),
    'loblolly-pine': (['loblolly-pine', 'slash-pine'], 'Loblolly / slash pine'),
    'longleaf-pine': (['longleaf-pine'], None), 'live-oak': (['live-oak'], 'Live oak (Spanish moss)'),
    'bald-cypress': (['bald-cypress', 'pondcypress'], None), 'sabal-palm': (['sabal-palm'], 'Cabbage palm'),
    'saw-palmetto': (['saw-palmetto'], None), 'sycamore': (['sycamore'], 'American sycamore'),
    'mesquite': (['honey-mesquite', 'mesquite', 'velvet-mesquite'], 'Mesquite'), 'ashe-juniper': (['ashe-juniper'], None),
    'black-spruce': (['black-spruce'], None),
}


def crop(box, pad=PAD):
    """The tree box grown by `pad` of its size a side, clipped to the image: [x0, y0, w, h] fractions."""
    x, y, w, h = box
    x0, y0, x1, y1 = max(0, x - pad * w), max(0, y - pad * h), min(1, x + w + pad * w), min(1, y + h + pad * h)
    return [round(x0, 4), round(y0, 4), round(x1 - x0, 4), round(y1 - y0, 4)]


def clip(text, most):
    words = ' '.join(str(text).split()).lstrip('-•* ').rstrip('.').split()
    return ' '.join(words[:most])


def fallback(card):
    """Without a model answer: the card's own first sentences, clipped."""
    first = lambda t: t.split('. ')[0]
    bark = next((f for f in card.get('features', []) if any(w in f.lower() for w in ('bark', 'colour', 'color', 'white'))), '')
    where = next((f for f in card.get('features', []) if any(w in f.lower() for w in ('grows', 'stands', 'along', 'soil'))), '')
    return [clip(first(t), SPOT_WORDS) for t in (card.get('silhouette', ''), bark, where) if t]


def spoken(title):
    """'Western hemlock' -> 'western hemlock' for "See the western hemlock?"; proper names (Joshua, Sitka) stay."""
    return title if title.split()[0] in ('Joshua', 'Sitka', 'Douglas', 'Utah', 'American', 'Ashe') else title[0].lower() + title[1:]


def written(data, cards):
    """{card id: {spot, area}} from MODEL (one cached call per card), else the card's own text."""
    import curate
    eco = data['ecoregions']
    prompts = {('tree', cid): (
        'A GeoGuessr player learns to name this tree from a car on a US road in Street View, the way Plonk It teaches one '
        'bollard at a time. Using ONLY the facts below, write exactly 3 bullets of 5 to 9 words each, only what shows from '
        '20 to 100 m away (never cones, needles, leaf detail, berries or flowers): 1) its whole-tree silhouette, 2) its trunk '
        'or bark colour, or its foliage colour (if the facts give no colour, its trunk or branch form instead; never say a '
        'fact is missing), 3) the roadside setting it stands in. Plain words, no Latin, no dashes, no '
        f'"look for". Then `area`: the core of where it lives (not its edges), at most {AREA_WORDS} words, as a player '
        'would say it (e.g. "interior West, Black Hills to the Sierra").\n'
        + json.dumps({'tree': c['title'], 'card': {k: c['card'].get(k) for k in ('common', 'latin', 'silhouette', 'features')},
                      'rangeRegions': [eco[r]['name'] for r in c['range']], 'states': c['states']}))
        for cid, c in cards.items()}
    schema = {'type': 'object', 'additionalProperties': False, 'required': ['spot', 'area'],
              'properties': {'spot': {'type': 'array', 'items': {'type': 'string'}}, 'area': {'type': 'string'}}}
    answers = curate.ask_cached(CACHE, prompts, schema, MODEL)
    out = {}
    for cid, c in cards.items():
        a = answers.get(('tree', cid)) or {}
        spot = [clip(s, SPOT_WORDS) for s in a.get('spot', [])][:3]
        out[cid] = {'spot': spot if len(spot) == 3 else fallback(c['card']),
                    'area': clip(a.get('area') or ', '.join(eco[r]['name'] for r in c['range'][:2]), AREA_WORDS)}
    return out


def deck(data, kept, acow, counts, range_of):
    """(tree skills, tree locations) for the pack. `kept`: the graded region locations; `acow`: {region code: pool share};
    `counts`: {(region, state): pool points}; range_of: usveg.range_of."""
    eco, species = data['ecoregions'], data['species']
    named = lambda p, ids: bool(set(p.get('species') or []) & set(ids)) or any(t.get('species') in ids for t in p.get('trees') or [])
    cards = {}
    for cid, (ids, title) in DECK.items():
        card = species.get(ids[0])
        if not card:
            print(f'tree deck: no species card for {ids[0]}', file=sys.stderr)
            continue
        labels = sorted(((loc, t) for loc in kept for t in loc.get('trees', []) if t.get('species') in ids),
                        key=lambda lt: (lt[1].get('confidence') != 'high', -lt[1]['box'][2] * lt[1]['box'][3]))
        high, best = [], set()
        for loc, t in labels:
            if t.get('confidence') == 'high' and loc['panoId'] not in best:
                best.add(loc['panoId'])
                high.append((loc, t))
        rng = sorted({c for s in ids for c in range_of(eco, s)} | {loc['region'] for loc, _ in high})
        points = {}
        for (code, state), n in counts.items():
            if code in rng and state:
                points[state] = points.get(state, 0) + n
        total = sum(points.values()) or 1
        states = sorted({s for s, n in points.items() if n / total >= 0.01} | {loc['state'] for loc, _ in high if loc.get('state')})
        seen, examples = set(), []
        for loc, t in labels:
            if loc['panoId'] not in seen and len(examples) < EXAMPLES:
                seen.add(loc['panoId'])
                examples.append({'img': loc['img'], 'crop': crop(t['box']), 'state': loc.get('state'), 'region': loc['region']})
        share = sum(acow.get(code, 0) * sum(named(p, ids) for p in drive) / len(drive)
                    for code, r in eco.items() if (drive := [p for p in r.get('panos', []) if p.get('drive')]))
        cards[cid] = {'ids': ids, 'title': title or card['common'], 'card': card, 'range': rng, 'states': states,
                      'examples': examples, 'high': high, 'acow': round(share, 5)}
    text = written(data, cards)
    skills, locations = [], []
    for cid, c in cards.items():
        sid = f'usveg:tree:{cid}'
        ref = next((i['file'].removeprefix('img/') for i in c['card'].get('images', []) if i.get('kind') == 'whole'), None)
        skills.append({'id': sid, 'title': c['title'], 'name': spoken(c['title']), 'phase': 'Vegetation', 'practiceFamily': 'trees', 'prerequisites': [],
                       'availability': 'available', 'subject': 'tree', 'species': c['ids'], 'range': c['range'],
                       'states': c['states'], 'acow': c['acow'], 'cost': round(1000 * c['acow'], 3) or 0.01,
                       **text[cid], 'examples': c['examples'], **({'ref': ref} if ref else {})})
        for loc, t in c['high']:
            locations.append({**loc, 'id': f"{sid}:{loc['panoId']}", 'skillIds': [sid], 'tree': {'label': t['label'], 'box': t['box']}})
    return skills, locations


def check():
    assert crop([0.5, 0.5, 0.2, 0.4]) == [0.47, 0.44, 0.26, 0.52]
    assert crop([0.0, 0.9, 0.2, 0.2]) == [0.0, 0.87, 0.23, 0.13], 'clipped at the image edge'
    assert clip(' '.join(['w'] * 14) + '.', SPOT_WORDS).split() == ['w'] * 10
    assert fallback({'silhouette': 'Tall spire. More.', 'features': ['Bark is white.', 'Grows along rivers.']}) == \
        ['Tall spire', 'Bark is white', 'Grows along rivers']
