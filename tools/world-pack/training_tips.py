"""Canonical cited tips with conservative geographic scope for training labels."""
import json
import re
from collections import defaultdict

from build import card_image
from text import HERE, WORK, fold, plain


def guide_codes():
    inventory = json.loads((WORK / 'location-database/foundations/all-guide-topic-inventory.json').read_text())
    return {u['slug']: u.get('code') for u in inventory['units']}


def mentions(text, name):
    return bool(name and re.search(r'(?<!\w)' + re.escape(fold(name)) + r'(?!\w)', fold(text)))


def tips_catalogue(names, regions, by_sub, admin1):
    clues = json.loads((HERE / 'clues.json').read_text())
    scope = json.loads((HERE / 'gap/clue-regions.json').read_text())
    visual = json.loads((HERE / 'labels/visual.json').read_text())
    codes = guide_codes()
    by_country, metas = defaultdict(list), {}
    for c in clues:
        cc = codes.get(c['slug'])
        if cc not in names:
            continue
        area = scope.get(c['topicId'], {})
        # A city-specific tip cannot safely be promoted to its entire state.
        if not area.get('nationwide') and not (area.get('wholeSubdivisions') and area.get('subdivisions')):
            continue
        applies = [r for r, info in regions.items() if info['iso2'] == cc] if area.get('nationwide') else sorted({
            by_sub.get(s, names[cc]) for s in area['subdivisions']})
        topic = c['topicId']
        text = c['text']
        meta = {'title': visual.get(topic, {}).get('lookFor') or text.split('.')[0],
                'source': 'plonkit', 'url': c['tipUrl'],
                'img': card_image((c.get('imageUrls') or [''])[0]),
                'appliesTo': applies, 'countries': [names[cc]], 'text': text,
                'subdivisions': None if area.get('nationwide') else area['subdivisions']}
        metas[topic] = meta
        by_country[cc].append(topic)
    links = {(str(m['mapId']), str(m['metaId'])): m.get('topicId')
             for rec in json.loads((HERE / 'labels/meta-tips.json').read_text()).values()
             for m in rec.get('metas', [])}
    aliases = {'US': ['United States', 'USA', 'US'], 'GB': ['United Kingdom', 'UK', 'Great Britain'],
               'KR': ['South Korea'], 'CZ': ['Czechia', 'Czech Republic']}
    for m in json.loads((HERE / 'lm/matches.json').read_text()):
        key = f"lm:{m['mapId']}:{m['metaId']}"
        if key in metas:
            continue
        linked = metas.get(links.get((str(m['mapId']), str(m['metaId']))))
        country_matches = [cc for cc, name in names.items()
                           if any(mentions(m['mapName'], alias) for alias in [name] + aliases.get(cc, []))]
        cc = next((cc for cc, name in names.items() if linked and name == linked['countries'][0]), None)
        cc = cc or (country_matches[0] if len(country_matches) == 1 else None)
        if not cc:
            continue
        note = plain(m.get('note', ''))
        text = m['metaName'] + '\n' + note
        subs = [code for code, (name, country, _) in admin1.items()
                if country == cc and mentions(text, name)]
        macro_regions = [r for r, info in regions.items() if info['iso2'] == cc and ' — ' in r
                         and len(r.split(' — ')[1]) > 5 and mentions(text, r.split(' — ')[1])]
        if subs:
            applies = sorted({by_sub.get(s, names[cc]) for s in subs})
            restricted = subs
        elif macro_regions:
            applies = macro_regions
            restricted = [s for s, r in by_sub.items() if r in applies]
        elif linked:
            applies, restricted = linked['appliesTo'], linked['subdivisions']
        else:
            # Unmatched LM notes need a named subdivision, not invented national scope.
            continue
        metas[key] = {'title': m['metaName'], 'source': 'learnablemeta',
            'url': f"https://learnablemeta.com/maps/{m['mapId']}",
            'img': (m.get('images') or [linked['img'] if linked else ''])[0],
            'appliesTo': applies, 'countries': [names[cc]], 'subdivisions': restricted,
            'text': note + ('\nLinked Plonk It scope: ' + linked['text'] if linked else '')}
        by_country[cc].append(key)
    return metas, by_country


def candidates(spot, metas, by_country):
    eligible = [i for i in by_country.get(spot['countryCode'], [])
                if metas[i]['subdivisions'] is None or spot['admin1'] in metas[i]['subdivisions']]
    eligible.sort(key=lambda i: (metas[i]['subdivisions'] is None, metas[i]['source'] != 'plonkit', i))
    unique, texts = [], set()
    for i in eligible:
        text = re.sub(r'\s+', ' ', metas[i]['text']).strip()
        if text not in texts:
            unique.append(i)
            texts.add(text)
        if len(unique) == 80:
            break
    return unique
