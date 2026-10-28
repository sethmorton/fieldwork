#!/usr/bin/env python3
"""Fill trees/mixes/understory of thin US Tree Atlas ecoregions from EPA Level IV descriptions (see trees/CONTRACT.md).

  uv run --with geopandas --with shapely --with pyogrio trees_l4.py          # -> trees/data.json (only thin regions)
  python3 trees_l4.py check                                                  # self-check of filter + aggregation

A region is thin when its Level III trees are empty, contain a generic id ('oak', 'pine') or have fewer than 2
specific species. Each state's Level IV poster/table text (EPA S3, cached in .scratch/eco/l4) is read by gpt-6.1-sol,
which lists, per Level IV unit, the tree species named; a name is kept only if it appears in that document's text.
Where Level IV text names fewer than 2 specific species, the USDA Forest Service section descriptions (McNab and Avers
1994, cached in .scratch/eco/usfs) are read the same way, one section per unit.
Species marked dominant in >= 2 units (or in 1 unit and named in >= half of them) are 'dominant', named in >= 2 units
'common', in 1 'regional'. Level III species keep their EPA Level III role; generic ids are dropped once a specific
species of the genus is named. Only trees, mixes, understory and treeSources of thin regions are written.
"""
import collections
import gzip
import html
import json
import re
import subprocess
import sys
from pathlib import Path
from urllib.request import urlretrieve

sys.path.insert(0, str(Path(__file__).parent))

SCRATCH = Path.home() / 'Desktop/code/fieldwork/.scratch/eco'
L4 = SCRATCH / 'l4'
SITE = Path.home() / 'Desktop/code/fieldwork-site/trees'
S3 = 'https://dmap-prod-oms-edc.s3.us-east-1.amazonaws.com/ORD/Ecoregions/'
MODEL = 'gpt-6.1-sol'

# (title, states covered, S3 keys holding the Level IV descriptions and tables)
DOCS = [
    ('Ecoregions of Alabama and Georgia', ['Alabama'], ['al/al_eco_desc.doc', 'al/al_eco_table.doc']),
    ('Ecoregions of Arkansas', ['Arkansas'], ['ar/ar_front.pdf', 'ar/ar_back.pdf']),
    ('Ecoregions of Arizona', ['Arizona'], ['az/az_eco_desc_tables.doc']),
    ('Ecoregions of California', ['California'], ['ca/CA_eco_PosterText_Final_Feb2016.docx']),
    ('Ecoregions of Colorado', ['Colorado'], ['co/co_front.pdf', 'co/co_back.pdf']),
    ('Ecoregions of New England', ['Connecticut', 'Massachusetts', 'Maine', 'New Hampshire', 'Rhode Island', 'Vermont'],
     ['ma/new_eng_front.pdf', 'ma/new_eng_back.pdf']),
    ('Ecoregions of EPA Region 3 (Pennsylvania, Maryland, Delaware, Virginia, West Virginia)',
     ['Pennsylvania', 'Maryland', 'Delaware', 'Virginia', 'West Virginia', 'District of Columbia'], ['reg3/reg3_eco_desc.doc']),
    ('Ecoregions of Florida', ['Florida'], ['fl/florida_back.pdf']),
    ('Ecoregions of Georgia', ['Georgia'], ['ga/ga_eco_desc.doc', 'ga/ga_eco_table.doc']),
    ('Ecoregions of Iowa and Missouri', ['Iowa', 'Missouri'], ['ia/moia_front.pdf', 'ia/moia_back.pdf']),
    ('Ecoregions of Idaho', ['Idaho'], ['id/id_descriptions.doc', 'id/id_tables.doc']),
    ('Ecoregions of Illinois', ['Illinois'], ['il/il_eco_desc.pdf']),
    ('Ecoregions of Indiana and Ohio', ['Indiana', 'Ohio'], ['in/ohin_front.pdf', 'in/ohin_back.pdf']),
    ('Ecoregions of Nebraska and Kansas', ['Kansas', 'Nebraska'], ['ks/ksne_front.pdf', 'ks/ksne_back.pdf']),
    ('Ecoregions of Kentucky', ['Kentucky'], ['ky/ky_front.pdf', 'ky/ky_back.pdf']),
    ('Ecoregions of Louisiana', ['Louisiana'], ['la/la_front.pdf', 'la/la_back.pdf']),
    ('Ecoregions of Michigan (draft descriptions)', ['Michigan'], ['mi/MI_DRAFT_Desc-Issues12-27-07.pdf']),
    ('Ecoregions of Minnesota', ['Minnesota'], ['mn/mn_eco_desc.pdf']),
    ('Ecoregions of Mississippi', ['Mississippi'], ['ms/ms_front.pdf', 'ms/ms_back.pdf']),
    ('Ecoregions of Montana', ['Montana'], ['mt/MT_RevDescL4.doc']),
    ('Ecoregions of North Carolina', ['North Carolina'], ['nc/nc_eco_desc.doc', 'nc/nc_table.doc']),
    ('Ecoregions of South Carolina', ['South Carolina'], ['sc/sc_eco_desc.doc', 'sc/sc_table.doc']),
    ('Ecoregions of North Dakota and South Dakota', ['North Dakota', 'South Dakota'], ['nd/ndsd_front.pdf', 'nd/ndsd_back.pdf']),
    ('Ecoregions of New Jersey', ['New Jersey'], ['nj/nj_eco_desc.pdf']),
    ('Ecoregions of New Mexico', ['New Mexico'], ['nm/nm_front.pdf', 'nm/nm_back.pdf']),
    ('Ecoregions of Nevada', ['Nevada'], ['nv/nv_front.pdf', 'nv/nv_back.pdf']),
    ('Ecoregions of New York', ['New York'], ['ny/NY_front.pdf', 'ny/NY_back.pdf']),
    ('Ecoregions of Oklahoma', ['Oklahoma'], ['ok/ok_front.pdf', 'ok/ok_back.pdf']),
    ('Ecoregions of Oregon', ['Oregon'], ['or/or_front.pdf', 'or/or_back.pdf']),
    ('Level IV Ecoregions of Oregon and Washington (Region 10)', ['Washington'],
     ['reg10/ORWAFront90.pdf', 'reg10/ORWABack.pdf']),
    ('Ecoregions of Tennessee', ['Tennessee'], ['tn/tn_front.pdf', 'tn/tn_back.pdf']),
    ('Ecoregions of Texas', ['Texas'], ['tx/tx_front.pdf', 'tx/tx_back.pdf']),
    ('Ecoregions of Utah', ['Utah'], ['ut/ut_front.pdf', 'ut/ut_back.pdf']),
    ('Ecoregions of Wisconsin', ['Wisconsin'], ['wi/wi_eco.pdf']),
    ('Ecoregions of Wyoming', ['Wyoming'], ['wy/wy_front.pdf', 'wy/wy_back.pdf']),
    ('Ecoregions of the Mississippi Alluvial Plain', ['Mississippi', 'Arkansas', 'Louisiana', 'Missouri', 'Tennessee',
                                                       'Kentucky', 'Illinois'], ['map/map_front.pdf', 'map/map_back.pdf']),
]
# ids whose species the text does not pin down (id -> suffixes of the species it covers); dropped once the same region
# names a covered species. 'cottonwood' and 'mesquite' stay: TreeGuide has cards for them.
GENERIC = {'oak': ('-oak',), 'pine': ('-pine',), 'hickory': ('hickory', 'pecan'), 'maple': ('-maple',),
           'beech': ('-beech',), 'birch': ('-birch',), 'spruce': ('-spruce',), 'fir': ('-fir',), 'hemlock': ('-hemlock',),
           'cedar': ('cedar',), 'juniper': ('-juniper',), 'ash': ('-ash',), 'elm': ('-elm',), 'gum': ('gum', 'tupelo'),
           'tupelo': ('tupelo', 'blackgum'), 'cypress': ('cypress',), 'palmetto': ('palmetto', 'sabal-palm'),
           'sagebrush': ('-sagebrush',), 'yucca': ('-yucca',), 'cholla': ('-cholla',), 'willow': ('-willow',),
           'saltbush': ('-saltbush',), 'acacia': ('-acacia',), 'sycamore': ('-sycamore',), 'walnut': ('-walnut',),
           'magnolia': ('-magnolia',), 'holly': ('-holly',), 'alder': ('-alder',), 'chestnut': ('-chestnut',),
           'hackberry': ('-hackberry', 'sugarberry'), 'basswood': ('-basswood',), 'larch': ('-larch',),
           'ceanothus': ('-ceanothus',), 'manzanita': ('-manzanita',), 'mountain-mahogany': ('-mountain-mahogany',),
           'dogwood': ('-dogwood',), 'sumac': ('-sumac',), 'cherry': ('-cherry',), 'plum': ('-plum',),
           'hawthorn': ('-hawthorn',), 'locust': ('-locust',)}
NOT_A = {'fir': {'douglas-fir', 'bigcone-douglas-fir'}}  # Douglas-fir is no true fir
# the model's id drift: misspellings and synonyms of one species (ids that differ only by hyphens are merged in canon)
ALIASES = {'big-leaf-maple': 'bigleaf-maple', 'pines': 'pine', 'oaks': 'oak', 'bottomland-oaks': 'oak',
           'saltbrush': 'saltbush', 'burr-oak': 'bur-oak', 'chinquapin-oak': 'chinkapin-oak', 'black-gum': 'blackgum',
           'sour-gum': 'blackgum', 'black-tupelo': 'blackgum', 'swamp-blackgum': 'swamp-tupelo',
           'tupelo-gum': 'water-tupelo', 'tulip-tree': 'tulip-poplar', 'tuliptree': 'tulip-poplar',
           'yellow-poplar': 'tulip-poplar', 'choke-cherry': 'chokecherry', 'one-seeded-juniper': 'one-seed-juniper',
           'peach-leaf-willow': 'peachleaf-willow', 'saltcedar': 'tamarisk', 'nuttalls-saltbush': 'nuttall-saltbush',
           'white-cedar': 'northern-white-cedar', 'yaupon-holly': 'yaupon', 'big-tooth-aspen': 'bigtooth-aspen',
           'eastern-hophornbeam': 'hophornbeam'}
# Level III regions where 'black oak' is California black oak (eastern black oak grows no further west than the Plains)
PACIFIC = {1, 2, 3, 4, 5, 6, 7, 8, 9, 78, 85}
ROLES = ('dominant', 'common', 'regional')
MAX_TREES = 15  # ponytail: plain cap; regional species past it are dropped, rank by unit count if that loses signal

PROMPT = """You extract tree species from EPA Level IV ecoregion descriptions and tables for a tree-identification atlas.
Use ONLY the document text below (a state ecoregion poster or table; PDF columns may be interleaved). Never add a species
the text does not name.

For every Level IV ecoregion (codes like 65a, 65b) of these Level III ecoregions: {targets}
return one unit with:
- code: the Level IV code as printed (e.g. "65a"); l3: its Level III number.
- trees: each tree or large shrub species the unit's description or its 'natural vegetation' / 'potential natural
  vegetation' table entry names as natural or current forest, woodland or shrub cover (include pine plantations; skip
  crops, orchards and ornamentals). name = the words exactly as written in the text (e.g. "loblolly pine",
  "bur oak", "Douglas-fir"); species = lowercase-hyphen id of the common name, reusing one of these ids when it is the
  same species: {ids}. A genus alone ("oaks", "pine") gets the genus id ("oak", "pine"). role = "dominant" if the unit's
  text says it dominates or is the main cover, else "common".
- understory: understory, ground-cover, grass or small shrub plants named for that unit, each as written.
- mixes: short phrases for typical combinations named together for that unit, in the text's own words
  (e.g. "oak-hickory forest", "longleaf pine-wiregrass", "bur oak savanna").
Include units with no named trees (empty lists). Skip Level IV units of other Level III ecoregions.

Document: {title}
\"\"\"{text}\"\"\""""

SCHEMA = {'type': 'object', 'additionalProperties': False, 'required': ['units'], 'properties': {'units': {
    'type': 'array', 'items': {
        'type': 'object', 'additionalProperties': False, 'required': ['code', 'l3', 'trees', 'understory', 'mixes'],
        'properties': {
            'code': {'type': 'string'}, 'l3': {'type': 'integer'},
            'trees': {'type': 'array', 'items': {
                'type': 'object', 'additionalProperties': False, 'required': ['name', 'species', 'role'],
                'properties': {'name': {'type': 'string'}, 'species': {'type': 'string'},
                               'role': {'enum': ['dominant', 'common']}}}},
            'understory': {'type': 'array', 'items': {'type': 'string'}},
            'mixes': {'type': 'array', 'items': {'type': 'string'}}}}}}}


def flat(text):
    """Lowercase, one space, line-break hyphens joined both ways ('Douglas-\\nfir' matches 'douglas-fir' and 'douglasfir')."""
    t = re.sub(r'\s+', ' ', text.replace('\u00ad', '').replace('\u2010', '-')).lower()
    return t + ' ' + re.sub(r'(\w)- (\w)', r'\1-\2', t) + ' ' + re.sub(r'(\w)- (\w)', r'\1\2', t)


def doc_text(keys):
    out = []
    for key in keys:
        path = L4 / key.replace('/', '_')
        if not path.exists():
            L4.mkdir(parents=True, exist_ok=True)
            urlretrieve(S3 + key, path)
        txt = path.with_name(path.name + '.txt')
        if not txt.exists():
            cmd = ['pdftotext', '-q', str(path), str(txt)] if key.endswith('.pdf') else \
                ['textutil', '-convert', 'txt', str(path), '-output', str(txt)]
            subprocess.run(cmd, check=True)
        out.append(txt.read_text(errors='ignore'))
    return '\n\n'.join(out)


def specific(sid):
    return sid not in GENERIC


def covers(generic, sid):
    return sid != generic and sid not in NOT_A.get(generic, ()) and sid.endswith(GENERIC[generic])


def canon(units, known):
    """id -> canonical id: ALIASES applied, ids that differ only by hyphens merged onto a known id, else the most used."""
    used = collections.Counter(ALIASES.get(t['species'], t['species']) for _, u in units for t in u['trees'])
    best = {}
    for sid in sorted(used, key=lambda s: (s in known, used[s])):
        best[sid.replace('-', '')] = sid
    return lambda s: best.get(ALIASES.get(s, s).replace('-', ''), ALIASES.get(s, s))


def thin(eco):
    ids = [t['species'] for t in eco['trees']]
    return sum(map(specific, ids)) < 2 or any(not specific(i) for i in ids)


def aggregate(units, text_of, known=()):
    """{l3: {'trees': {species: {codes}}, 'dom': {species: {codes}}, 'units': {codes}, 'mixes': Counter,
    'understory': Counter, 'docs': {doc}}} from the model's units, keeping names found in their document."""
    ident = canon(units, set(known))
    agg = collections.defaultdict(lambda: {'trees': collections.defaultdict(set), 'dom': collections.defaultdict(set),
                                           'units': set(), 'mixes': collections.Counter(),
                                           'understory': collections.Counter(), 'docs': set()})
    for doc, u in units:
        code = u['code'].strip().lower()
        if not re.fullmatch(r'\d+[a-z]{1,2}', code) or int(re.match(r'\d+', code).group()) != u['l3']:
            continue
        a, text = agg[u['l3']], text_of[doc]
        a['units'].add(code)
        kept = [t for t in u['trees'] if t['name'].strip() and t['name'].lower().strip() in text]
        for t in kept:
            sid = ident(t['species'])
            if sid == 'black-oak' and u['l3'] in PACIFIC:  # 'black oak' in the Pacific states is California black oak
                sid = 'california-black-oak'
            a['trees'][sid].add(code)
            if t['role'] == 'dominant':
                a['dom'][sid].add(code)
        if kept:
            a['docs'].add(doc)
        names = [t['name'].lower() for t in kept]
        a['mixes'].update(m for m in set(u['mixes']) if m.lower() in text or any(n in m.lower() for n in names))
        a['understory'].update(x.lower() for x in set(u['understory']) if x.strip() and x.lower() in text)
    return agg


def merge(eco, a):
    """New trees/mixes/understory for one thin region from its Level III entry and its Level IV aggregate."""
    n = max(len(a['units']), 1)
    roles = {t['species']: t['role'] for t in eco['trees']}
    for sid, codes in a['trees'].items():
        if sid in roles:
            continue
        k, dom = len(codes), len(a['dom'][sid])
        roles[sid] = 'regional' if k < 2 else 'dominant' if dom >= 2 or (dom and k >= n / 2) else 'common'
    rank = {sid: len(a['trees'].get(sid, ())) for sid in roles}
    for g in [s for s in roles if not specific(s)]:
        if any(covers(g, s) for s in roles):
            del roles[g]
    level3 = {t['species'] for t in eco['trees']}
    ordered = sorted(roles, key=lambda s: (ROLES.index(roles[s]), -rank[s]))
    extra = MAX_TREES - len(level3 & set(roles))
    trees = [s for s in ordered if s in level3 or (extra := extra - 1) >= 0]
    mixes = uniq(eco['mixes'] + [m for m, _ in a['mixes'].most_common()])
    under = uniq([u for u in eco['understory'] + [u for u, _ in a['understory'].most_common()]
                  if u.lower().replace(' ', '-') not in trees])
    return {'trees': [{'species': s, 'role': roles[s]} for s in trees], 'mixes': mixes[:8], 'understory': under[:10]}


def uniq(phrases):
    """First of each phrase that differs only by case, dashes, spacing or a plural 's'."""
    seen, out = set(), []
    for p in phrases:
        key = re.sub(r'[\s\-\u2013\u2014/]+', ' ', p.lower()).strip().rstrip('s')
        if key not in seen:
            seen.add(key)
            out.append(p)
    return out


def level3(ecos):
    """{code: {trees, mixes, understory}} from EcoData's cached Level III answers, so reruns never build on our output."""
    import curate
    import trees_eco as te
    text = te.descriptions()
    prompts = {(str(e['l3']), e['name']): te.PROMPT.format(l3=e['l3'], name=e['name'], text=text[e['l3']],
                                                           ids=', '.join(te.KNOWN_IDS), groups=' | '.join(te.GROUPS))
               for e in ecos.values()}
    answers = curate.ask_cached(SCRATCH / 'trees-eco-cache.json', prompts, te.SCHEMA, te.MODEL)
    return {c: te.clean(answers[str(e['l3']), e['name']], text[e['l3']]) for c, e in ecos.items()}


# Level III -> (chapter, sections) of McNab & Avers (1994) for regions whose Level IV text names < 2 species; matched by
# name and location. ponytail: no polygon overlap, the USFS section GIS was unreachable; use it if more regions need this.
SECTIONS = {28: ('ch28.html', ['251F']), 44: ('ch42.html', ['332C']), 49: ('ch14.html', ['212M', '212N']),
            76: ('ch50.html', ['411A'])}
USFS = 'http://web.archive.org/web/2022id_/https://www.fs.fed.us/land/pubs/ecoregions/'
USFS_TITLE = 'USDA Forest Service, McNab and Avers (1994), Ecological Subregions of the United States: Section Descriptions'
USFS_PROMPT = """You extract tree species from one USDA Forest Service ecological section description for a
tree-identification atlas. Use ONLY the text below; never add a species it does not name.
- trees: each tree or large shrub species named as natural or potential natural vegetation. name = the words exactly
  as written (e.g. "slash pine"); species = lowercase-hyphen id of the common name, reusing one of these ids when it is
  the same species: {ids}. A genus alone gets the genus id ("oak"). role = "dominant" if the text says it dominates.
- understory: understory, ground-cover, grass or small shrub plants named, each as written.
- mixes: short phrases for typical combinations named together, in the text's own words.

\"\"\"{text}\"\"\""""


def section_text(chapter, section):
    path = SCRATCH / 'usfs' / chapter
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        urlretrieve(USFS + chapter, path)
    raw = path.read_bytes()
    page = html.unescape(re.sub(r'<[^>]+>', ' ', (gzip.decompress(raw) if raw[:2] == b'\x1f\x8b' else raw).decode('latin-1')))
    return re.search(rf'Section {section}--.*?(?=Section M?\d{{3}}[A-Z]--|$)', page, re.S).group()


def usfs(l3s, ids, text_of, cite):
    """Units (one per USFS section) for these Level III regions; registers each section's text and citation."""
    import curate
    prompts = {}
    for l3 in l3s:
        chapter, sections = SECTIONS[l3]
        for i, sec in enumerate(sections):
            doc = f'usfs:{sec}'
            raw = section_text(chapter, sec)
            text_of[doc] = flat(raw)
            cite[doc] = [{'title': f'{USFS_TITLE}, Section {sec}', 'url': USFS + chapter}]
            prompts[(doc, f'{l3}{chr(97 + i)}')] = USFS_PROMPT.format(ids=', '.join(ids), text=raw)
    unit = SCHEMA['properties']['units']['items']
    schema = {**unit, 'required': ['trees', 'understory', 'mixes'],
              'properties': {k: unit['properties'][k] for k in ('trees', 'understory', 'mixes')}}
    answers = curate.ask_cached(SCRATCH / 'trees-usfs-cache.json', prompts, schema, MODEL)
    return [(doc, {'code': code, 'l3': int(re.match(r'\d+', code).group()), **a}) for (doc, code), a in answers.items()]


def main():
    import curate
    from trees_eco import KNOWN_IDS
    ecos = json.loads((SITE / 'data.json').read_text())['ecoregions']
    base = level3(ecos)
    states = json.loads((SCRATCH / 'l3_states.json').read_text())
    targets = {ecos[c]['l3']: c for c, e in base.items() if thin(e)}
    ids = sorted({t['species'] for e in base.values() for t in e['trees']} | set(KNOWN_IDS))
    prompts, text_of, files = {}, {}, {}
    for title, sts, keys in DOCS:
        mine = sorted(l3 for l3 in targets if set(states[str(l3)]) & set(sts))
        if not mine:
            continue
        raw = doc_text(keys).replace('\x00', '')
        text_of[title], files[title] = flat(raw), keys
        prompts[(title, 'l4')] = PROMPT.format(
            targets='; '.join(f"{l3}. {ecos[targets[l3]]['name']}" for l3 in mine), ids=', '.join(ids), title=title,
            text=raw)
    answers = curate.ask_cached(SCRATCH / 'trees-l4-cache.json', prompts, SCHEMA, MODEL)
    units = [(title, u) for (title, _), a in answers.items() for u in a['units'] if u['l3'] in targets]
    cite = {title: [{'title': f'U.S. EPA, {title} (Level IV descriptions)', 'url': S3 + k} for k in files[title]]
            for title in files}
    agg = aggregate(units, text_of, ids)
    weak = [l3 for l3 in SECTIONS if l3 in targets and sum(map(specific, agg.get(l3, {'trees': {}})['trees'])) < 2]
    units += usfs(weak, ids, text_of, cite)
    agg = aggregate(units, text_of, ids)
    new = {}
    for l3, code in targets.items():
        a = agg.get(l3)
        if not a or not a['trees']:
            print('no Level IV or USFS section trees', l3, ecos[code]['name'])
            continue
        new[code] = {**merge(base[code], a), 'treeSources': [s for doc in sorted(a['docs']) for s in cite[doc]]}
    # re-read right before writing: other agents write panos/species into the same file
    path = SITE / 'data.json'
    data = json.loads(path.read_text())
    for code, v in new.items():
        data['ecoregions'][code].update(v)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1))
    good = [c for c, e in data['ecoregions'].items() if sum(specific(t['species']) for t in e['trees']) >= 2]
    print(path, len(new), 'regions filled;', len(good), 'of', len(data['ecoregions']), 'have >= 2 specific trees')


def check():
    text = flat('Bur oak savanna and oak-hickory forest with big bluestem. Douglas-\nfir on slopes.')
    units = [('d', {'code': '47a', 'l3': 47, 'mixes': ['bur oak savanna', 'pine barrens'],
                    'understory': ['big bluestem', 'wiregrass'],
                    'trees': [{'name': 'bur oak', 'species': 'bur-oak', 'role': 'dominant'},
                              {'name': 'Douglas-fir', 'species': 'douglas-fir', 'role': 'common'},
                              {'name': 'red pine', 'species': 'red-pine', 'role': 'common'}]}),
             ('d', {'code': '47b', 'l3': 47, 'mixes': [], 'understory': [],
                    'trees': [{'name': 'bur oak', 'species': 'bur-oak', 'role': 'dominant'}]}),
             ('d', {'code': '48a', 'l3': 47, 'mixes': [], 'understory': [], 'trees': []})]
    a = aggregate(units, {'d': text})[47]
    assert set(a['trees']) == {'bur-oak', 'douglas-fir'} and a['units'] == {'47a', '47b'}, a
    got = merge({'trees': [{'species': 'oak', 'role': 'common'}, {'species': 'fir', 'role': 'common'}],
                 'mixes': [], 'understory': []}, a)
    assert got['trees'] == [{'species': 'bur-oak', 'role': 'dominant'}, {'species': 'fir', 'role': 'common'},
                            {'species': 'douglas-fir', 'role': 'regional'}], got
    assert got['mixes'] == ['bur oak savanna'] and got['understory'] == ['big bluestem'], got
    assert thin({'trees': [{'species': 'longleaf-pine'}, {'species': 'pine'}]})
    assert not thin({'trees': [{'species': 'longleaf-pine'}, {'species': 'slash-pine'}]})
    print('ok')


if __name__ == '__main__':
    check() if sys.argv[1:] == ['check'] else main()
