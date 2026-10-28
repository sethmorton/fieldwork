#!/usr/bin/env python3
"""EPA Level III ecoregions for the US Tree Atlas (fieldwork-site/trees, see trees/CONTRACT.md).

  uv run --with geopandas --with shapely --with pyogrio trees_eco.py geometry   # -> trees/ecoregions.json
  uv run --with geopandas --with shapely --with pyogrio trees_eco.py data       # -> trees/data.json (ecoregions)
  uv run --with geopandas --with shapely --with pyogrio trees_eco.py check      # self-check of the EPA-text filter

Inputs (downloaded into .scratch/eco by `geometry`/`data` if missing):
  us_eco_l3.zip                    EPA Level III shapefile (Albers, NAD83)
  Eco_Level_III_descriptions.doc   EPA 'Primary Distinguishing Characteristics of Level III Ecoregions' (2013)
Trees/mixes/understory/group come from gpt-6.1-sol reading only the verbatim EPA text; every sentence must be a
substring of the EPA paragraph and every species name must appear in the vegetation text, else it is dropped.
"""
import json
import os
import re
import subprocess
import sys
import zipfile
from datetime import date
from pathlib import Path
from urllib.request import urlretrieve

import geopandas as gpd
import shapely

sys.path.insert(0, str(Path(__file__).parent))
import curate  # noqa: E402

SCRATCH = Path.home() / 'Desktop/code/fieldwork/.scratch/eco'
SITE = Path.home() / 'Desktop/code/fieldwork-site/trees'
WORLD = Path(os.environ.get('WORLD_PACK_DATA', '/Users/sethmorton/Documents/Codex/2026-10-18/can-x20/work/world-map'))
S3 = 'https://dmap-prod-oms-edc.s3.us-east-1.amazonaws.com/ORD/Ecoregions/us/'
SOURCES = [
    {'title': 'U.S. EPA, Level III and IV Ecoregions of the Continental United States',
     'url': 'https://www.epa.gov/eco-research/level-iii-and-iv-ecoregions-continental-united-states'},
    {'title': 'U.S. EPA, Primary Distinguishing Characteristics of Level III Ecoregions of the Continental United States (2013)',
     'url': S3 + 'Eco_Level_III_descriptions.doc'},
    {'title': 'U.S. EPA, Level III ecoregions of the conterminous United States (shapefile us_eco_l3.zip)',
     'url': S3 + 'us_eco_l3.zip'},
    {'title': 'Wikipedia: Fagus grandifolia (one of two North American beeches, the other Mexican)',
     'url': 'https://en.wikipedia.org/wiki/Fagus_grandifolia'},
    {'title': 'Wikipedia: Populus grandidentata (bigtooth aspen, native to eastern North America)',
     'url': 'https://en.wikipedia.org/wiki/Populus_grandidentata'},
]
GROUPS = ['southern pine', 'oak-hickory', 'northern hardwood', 'spruce-fir', 'Douglas-fir/hemlock',
          'ponderosa/mixed conifer', 'pinyon-juniper', 'sagebrush steppe', 'desert scrub', 'grassland',
          'riparian/bottomland', 'chaparral/oak woodland', 'agriculture']
# Ids TreeGuide fills in the species guide; the model must reuse them when the text names that species.
KNOWN_IDS = ('longleaf-pine loblolly-pine slash-pine shortleaf-pine live-oak spanish-moss sabal-palm saw-palmetto '
             'bald-cypress sweetgum eastern-white-pine red-pine jack-pine paper-birch quaking-aspen eastern-hemlock '
             'western-hemlock douglas-fir western-redcedar sitka-spruce ponderosa-pine lodgepole-pine engelmann-spruce '
             'subalpine-fir pinyon-pine utah-juniper big-sagebrush creosote-bush joshua-tree saguaro mesquite '
             'coast-redwood blue-oak coast-live-oak sugar-maple eastern-redcedar cottonwood osage-orange fireweed kudzu '
             'grand-fir balsam-fir black-spruce').split()
MODEL = 'gpt-6.1-sol'


def fetch(name):
    path = SCRATCH / name
    if not path.exists():
        SCRATCH.mkdir(parents=True, exist_ok=True)
        urlretrieve(S3 + name, path)
    return path


def regions():
    """Dissolved Level III polygons (Albers) with code/l3/name/l1/l2."""
    path = SCRATCH / 'us_eco_l3.shp'
    if not path.exists():
        zipfile.ZipFile(fetch('us_eco_l3.zip')).extractall(SCRATCH)
    df = gpd.read_file(path)
    df['l3'] = df.US_L3CODE.astype(int)
    df = df.dissolve('l3', aggfunc='first').reset_index()
    df = df.rename(columns={'NA_L3CODE': 'code', 'US_L3NAME': 'name', 'NA_L2NAME': 'l2', 'NA_L1NAME': 'l1'})
    # US 6 and 85 share NA code 11.1.1; the later one gets '-<l3>' so code stays a unique key
    dup = df.code.duplicated()
    df.loc[dup, 'code'] = df.code[dup] + '-' + df.l3[dup].astype(str)
    return df


def geometry(tolerance=1500, digits=3):
    df = regions()
    df['geometry'] = shapely.coverage_simplify(df.geometry.values, tolerance)
    df = df[['code', 'l3', 'name', 'geometry']].to_crs(4326)
    df['geometry'] = shapely.set_precision(df.geometry.values, 10 ** -digits)
    out = SITE / 'ecoregions.json'
    out.write_text(df.to_json(drop_id=True, separators=(',', ':')))
    print(out, out.stat().st_size // 1024, 'KB', len(df), 'regions')


def descriptions():
    """{l3: verbatim paragraph} from the EPA descriptions document."""
    txt = SCRATCH / 'desc.txt'
    if not txt.exists():
        subprocess.run(['textutil', '-convert', 'txt', str(fetch('Eco_Level_III_descriptions.doc')), '-output', str(txt)],
                       check=True)
    parts = re.split(r'^(\d+)\. [A-Z][^\n]*$', txt.read_text(), flags=re.M)
    return {int(n): body.strip() for n, body in zip(parts[1::2], parts[2::2])}


PROMPT = """You extract vegetation facts from one EPA Level III ecoregion description for a tree-identification atlas.
Use ONLY the text below. Never add species, mixes or understory plants that the text does not name.

Ecoregion {l3}. {name}
EPA text:
\"\"\"{text}\"\"\"

Return:
- sentences: every sentence of the EPA text that describes natural or potential natural vegetation (forest, woodland,
  shrub, grass, savanna, prairie or wetland cover and its species). Copy each sentence EXACTLY, character for
  character. Empty list if none.
- trees: each tree or large shrub species/genus the text names. name = the words exactly as written in the text
  (e.g. "western red cedar", "loblolly pine", "oak"); species = lowercase-hyphen id of the common name; reuse one of
  these ids when it is the same species: {ids}. role = "dominant" if the text says it dominates/predominates or is the
  main forest type, "regional" if limited to part of the region, an elevation band or a site type, else "common".
- mixes: short phrases for typical combinations the text names together (e.g. "longleaf pine with wiregrass
  understory", "oak-hickory forest", "ponderosa pine and some lodgepole pine"), using the text's own words.
- understory: understory, ground-cover or grass/shrub plants the text names (e.g. "wiregrass", "saw palmetto",
  "bluestem"), each as written in the text.
- group: the one map-shading group that best fits the region's natural vegetation per the text (if the text gives no
  natural vegetation, the dominant land cover it describes): {groups}."""

SCHEMA = {'type': 'object', 'additionalProperties': False, 'required': ['sentences', 'trees', 'mixes', 'understory', 'group'],
          'properties': {
              'sentences': {'type': 'array', 'items': {'type': 'string'}},
              'trees': {'type': 'array', 'items': {
                  'type': 'object', 'additionalProperties': False, 'required': ['name', 'species', 'role'],
                  'properties': {'name': {'type': 'string'}, 'species': {'type': 'string'},
                                 'role': {'enum': ['dominant', 'common', 'regional']}}}},
              'mixes': {'type': 'array', 'items': {'type': 'string'}},
              'understory': {'type': 'array', 'items': {'type': 'string'}},
              'group': {'enum': GROUPS}}}


def inside(text, phrase):
    return phrase.lower() in text.lower()


# the model's id drift across regions (EPA spells 'big leaf maple' in 4 and has the typo 'saltbrush' in 20)
ALIASES = {'big-leaf-maple': 'bigleaf-maple', 'pines': 'pine', 'saltbrush': 'saltbush'}
# EPA genus names that can only mean one species: Fagus grandifolia is the only beech native to the US (the other North
# American beech is Mexican), and bigtooth aspen is native to eastern North America only, so 'aspen' in these western
# Level I regions is quaking aspen. Mesquite, palmetto and cottonwood stay generic: several species are possible.
WEST = {'Marine West Coast Forest', 'Northwestern Forested Mountains', 'North American Deserts', 'Mediterranean California',
        'Temperate Sierras', 'Southern Semi-Arid Highlands'}


def specific(trees, l1):
    ids = {'beech': 'american-beech', **({'aspen': 'quaking-aspen'} if l1 in WEST else {})}
    out, seen = [], set()
    for t in trees:
        species = ids.get(t['species'], t['species'])
        if species not in seen:
            seen.add(species)
            out.append({**t, 'species': species})
    return out


def clean(answer, paragraph):
    """Keep only sentences copied verbatim and names that appear in the kept vegetation text."""
    epa = ' '.join(s.strip() for s in answer['sentences'] if s.strip() and s.strip() in paragraph)
    trees, seen = [], set()
    for t in answer['trees']:
        species = ALIASES.get(t['species'], t['species'])
        if inside(epa, t['name']) and species not in seen:
            seen.add(species)
            trees.append({'species': species, 'role': t['role']})
    return {'epa': epa, 'trees': trees,
            'mixes': [m for m in answer['mixes'] if any(inside(m, t['name']) for t in answer['trees'] if inside(epa, t['name']))
                      or inside(epa, m)],
            'understory': [u for u in answer['understory'] if inside(epa, u)],
            'group': answer['group']}


def rounds(df):
    """{l3: {n, ptsLost}} for Seth's US duel rounds, ptsLost summing positive theirScore - myScore."""
    rows = [r for r in json.loads((WORLD / 'duels/rounds.json').read_text()) if r.get('countryCode') == 'US']
    pts = gpd.GeoDataFrame({'lost': [max(0, (r.get('theirScore') or 0) - (r.get('myScore') or 0)) for r in rows]},
                           geometry=gpd.points_from_xy([r['view']['lng'] for r in rows], [r['view']['lat'] for r in rows]),
                           crs=4326).to_crs(df.crs)
    hit = gpd.sjoin(pts, df[['l3', 'geometry']], predicate='within')
    print(f'rounds: {len(rows)} US, {len(hit)} inside an ecoregion')
    return {int(l3): {'n': int(len(g)), 'ptsLost': int(g.lost.sum())} for l3, g in hit.groupby('l3')}


def title(caps):
    """EPA's upper-case L1/L2 names in title case, keeping USA and a lower-case 'and'."""
    return caps.title().replace('Usa', 'USA').replace(' And ', ' and ')


def data():
    df, text = regions(), descriptions()
    prompts = {(str(r.l3), r.name): PROMPT.format(l3=r.l3, name=r.name, text=text[r.l3], ids=', '.join(KNOWN_IDS),
                                                  groups=' | '.join(GROUPS)) for r in df.itertuples()}
    answers = curate.ask_cached(SCRATCH / 'trees-eco-cache.json', prompts, SCHEMA, MODEL)
    counts = rounds(df)
    out = SITE / 'data.json'
    old = json.loads(out.read_text()) if out.exists() else {}
    ecos = {}
    for r in df.sort_values('l3').itertuples():
        a = answers.get((str(r.l3), r.name))
        if not a:
            print('missing answer', r.l3, r.name)
            continue
        prev = old.get('ecoregions', {}).get(r.code, {})
        eco = {'name': r.name, 'l3': int(r.l3), 'l1': title(r.l1), 'l2': title(r.l2), **clean(a, text[r.l3]),
               'panos': prev.get('panos', []), 'rounds': counts.get(r.l3, {'n': 0, 'ptsLost': 0})}
        if 'treeSources' in prev:  # trees/mixes/understory enriched from Level IV / USFS section text by another pass
            eco.update({k: prev[k] for k in ('trees', 'mixes', 'understory', 'treeSources')})
        eco['trees'] = specific(eco['trees'], eco['l1'])
        ecos[r.code] = eco
    sources = old.get('sources', [])
    sources += [s for s in SOURCES if s not in sources]
    out.write_text(json.dumps({'generated': date.today().isoformat(), 'sources': sources, 'ecoregions': ecos,
                               'species': old.get('species', {}), 'pairs': old.get('pairs', [])},
                              ensure_ascii=False, indent=1))
    print(out, len(ecos), 'ecoregions')


def check():
    para = 'Soils are deep. Longleaf pine with a wiregrass understory dominated. Some areas are urban.'
    got = clean({'sentences': ['Longleaf pine with a wiregrass understory dominated.', 'Invented sentence.'],
                 'trees': [{'name': 'longleaf pine', 'species': 'longleaf-pine', 'role': 'dominant'},
                           {'name': 'slash pine', 'species': 'slash-pine', 'role': 'common'}],
                 'mixes': ['longleaf pine with wiregrass', 'slash pine flatwoods'], 'understory': ['wiregrass', 'saw palmetto'],
                 'group': 'southern pine'}, para)
    assert got['epa'] == 'Longleaf pine with a wiregrass understory dominated.', got
    assert got['trees'] == [{'species': 'longleaf-pine', 'role': 'dominant'}], got
    assert got['mixes'] == ['longleaf pine with wiregrass'] and got['understory'] == ['wiregrass'], got
    print('ok')


if __name__ == '__main__':
    {'geometry': geometry, 'data': data, 'check': check}[sys.argv[1]]()
