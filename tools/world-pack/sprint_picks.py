"""Country deck picks for sprint.py: sprint/decks/<ISO2>.json and identify-<ISO2>.json ({country, picks: [{mapId, metaId,
metaName, subject, why, and for identify picks mode 'identify' and rival}]}), Learnable Meta metas chosen by reading
each country's maps. sprint.py teaches each pick like a DECKS meta on its exported author-placed locations, keeps every
pick out of the judge's candidates so curation stays as it was, and introduces identify picks first, then the
countries in ORDER, then the rest by ACoW share."""
import json

from build import read_jsonl
from text import HERE

ORDER = ('US', 'IN', 'AU', 'CA')  # highest expected loss first (win/WinOpus.md)
SIGN = '(if a sign is visible) '  # prefixes a signs pick's why, as sprint_contrast.py does for sign tells


def load():
    """{ISO2: [meta with 'pick' and 'exportMapId']}. exportMapId is the map its locations were exported under: its own,
    else another map that shares the meta."""
    matches = json.loads((HERE / 'lm/matches.json').read_text())
    by_key, by_id = {(m['mapId'], m['metaId']): m for m in matches}, {m['metaId']: m for m in matches}
    rows = read_jsonl(HERE / 'lm/exports.jsonl')
    exported, other = {(e['mapId'], e['metaId']) for e in rows}, {}
    for e in rows:  # the first map the meta was exported under
        other.setdefault(e['metaId'], e['mapId'])
    out = {}
    for f in sorted((HERE / 'sprint/decks').glob('*.json')):
        d = json.loads(f.read_text())
        for p in [{**({'mode': d['mode']} if 'mode' in d else {}), **p} for p in d['picks']]:
            key = (p['mapId'], p['metaId'])
            meta = by_key.get(key) or by_id[p['metaId']]
            out.setdefault(d['country'], []).append({**meta, 'mapId': p['mapId'], 'pick': p,
                                                     'exportMapId': p['mapId'] if key in exported else other.get(p['metaId'])})
    return out


def rank(share):
    """Sort key of a (pick, ISO2): identify picks first, then ORDER, then ACoW share."""
    return lambda pc: (pc[0].get('mode') != 'identify', ORDER.index(pc[1]) if pc[1] in ORDER else len(ORDER),
                       -share.get(pc[1], 0))
