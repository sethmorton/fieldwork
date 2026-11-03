"""Training macro-regions and dissolved, cached Natural Earth answer areas."""
import hashlib
import json
from collections import defaultdict

from globe_geometry import polygons, simplify_polys
from text import HERE, WORK

# Explicit membership avoids obsolete Natural Earth regional labels (notably Russia).
GROUPS = {
    'US': {
        'New England': 'CT ME MA NH RI VT', 'Middle Atlantic': 'NJ NY PA',
        'East North Central': 'IL IN MI OH WI', 'West North Central': 'IA KS MN MO NE ND SD',
        'South Atlantic': 'DE DC FL GA MD NC SC VA WV', 'East South Central': 'AL KY MS TN',
        'West South Central': 'AR LA OK TX', 'Mountain': 'AZ CO ID MT NV NM UT WY',
        'Pacific': 'AK CA HI OR WA'},
    'BR': {'North': 'AC AP AM PA RO RR TO', 'Northeast': 'AL BA CE MA PB PE PI RN SE',
           'Central-West': 'DF GO MT MS', 'Southeast': 'ES MG RJ SP', 'South': 'PR RS SC'},
    'CA': {'Pacific': 'BC', 'Prairies': 'AB SK MB', 'Ontario': 'ON', 'Quebec': 'QC',
           'Atlantic': 'NB NL NS PE', 'Northern territories': 'YT NT NU'},
    'RU': {
        'Central': 'BEL BRY VLA VOR IVA KLU KOS KRS LIP MOS MOW ORL RYA SMO TAM TVE TUL YAR',
        'Northwestern': 'ARK VLG KGD KR KO LEN MUR NEN NGR PSK SPE',
        'Southern': 'AD AST VGG KDA KL ROS', 'North Caucasian': 'DA IN KB KC SE STA CE',
        'Volga': 'BA KIR ME MO NIZ ORE PNZ PER SAM SAR TA UD ULY CU',
        'Ural': 'KGN SVE TYU KHM YAN CHE',
        'Siberian': 'AL ALT IRK KEM KYA NVS OMS TOM TY KK',
        'Far Eastern': 'AMU BU YEV ZAB KAM MAG PRI SA SAK KHA CHU'},
    'IN': {'North': 'CH DL HR HP JK LA PB RJ', 'Central': 'CG MP UP UT',
           'East': 'BR JH OD OR WB', 'Northeast': 'AR AS MN ML MZ NL SK TR',
           'West': 'DN DD DH GA GJ MH', 'South': 'AN AP KA KL LD PY TN TG TS'},
    'ID': {'Sumatra': 'AC SU SB RI KR JA SS BB BE LA', 'Java': 'BT JK JB JT YO JI',
           'Bali and Nusa Tenggara': 'BA NB NT', 'Kalimantan': 'KB KT KS KI KU',
           'Sulawesi': 'SA GO ST SR SN SG', 'Maluku': 'MA MU',
           'Papua': 'PA PB PD PE PS PT'},
    'MX': {'Northwest': 'BCN BCS CHH DUR SIN SON', 'Northeast': 'COA NLE TAM',
           'West': 'AGU COL GUA JAL MIC NAY QUE SLP ZAC',
           'Central': 'CMX DIF HID MEX MOR PUE TLA', 'South': 'CHP GRO OAX VER',
           'Southeast': 'CAM ROO TAB YUC'},
    'AR': {'Northwest': 'A Y K F T G', 'Northeast': 'H P N W', 'Cuyo': 'M J D',
           'Pampas': 'B C X E S', 'Patagonia': 'L Q R U Z V'},
}
MEMBERS = {f'{cc}-{sub}': group for cc, groups in GROUPS.items()
           for group, subs in groups.items() for sub in subs.split()}
# Alternate subdivision codes still used by Vali's cache.
ALIASES = {'ID-PP': 'ID-PA', 'IN-CT': 'IN-CG', 'IN-UK': 'IN-UT', 'IN-OR': 'IN-OD'}


def catalogue():
    from globe_data import geometry
    countries, admin1, _, aliases = geometry()
    names = {cc: name for cc, (name, _) in countries.items()}
    regions, by_sub = {}, {}
    for code, (name, cc, _) in admin1.items():
        canonical = ALIASES.get(code, code)
        macro = name if cc == 'AU' else MEMBERS.get(canonical)
        if cc in GROUPS or cc == 'AU':
            if not macro or cc not in names:
                continue
            region = names[cc] + ' — ' + macro
            regions[region] = {'country': names[cc], 'iso2': cc, 'parent': names[cc]}
            by_sub[code] = region
    for code, macro in MEMBERS.items():
        cc = code[:2]
        region = names.get(cc, '') + ' — ' + macro
        if region in regions:
            by_sub.setdefault(code, region)
    for alias, canonical in ALIASES.items():
        if canonical in by_sub:
            by_sub[alias] = by_sub[canonical]
    for cc, country in names.items():
        if cc not in GROUPS and cc != 'AU':
            regions[country] = {'country': country, 'iso2': cc, 'parent': country}
    return names, regions, by_sub, countries, admin1, aliases


def assignment(cc, tags, names, by_sub):
    tag = next((s for s in tags if s.startswith(cc + '-')), None)
    return (by_sub.get(tag), tag) if cc in GROUPS or cc == 'AU' else (names.get(cc), tag)


def answer_areas(regions, by_sub, countries, admin1):
    """Shapely is needed only when geometry inputs change. Normal refreshes use this cache."""
    stamp = hashlib.sha256(json.dumps([2, regions, by_sub, [
        (str(p), p.stat().st_mtime_ns) for p in
        (WORK / 'natural-earth-admin1.geojson', WORK / 'worldwide/countries-50m.geojson')]],
        sort_keys=True).encode()).hexdigest()
    cache = HERE / 'training/region-features.json'
    if cache.exists():
        saved = json.loads(cache.read_text())
        if saved['fingerprint'] == stamp:
            return saved['features']
    from shapely.geometry import mapping, shape
    from shapely.ops import unary_union
    grouped = defaultdict(list)
    for code, (_, _, polys) in admin1.items():
        if code in by_sub:
            grouped[by_sub[code]].append(shape({'type': 'MultiPolygon', 'coordinates': polys}))
    features = []
    for name, region in sorted(regions.items()):
        if name == region['country']:
            polys = countries[region['iso2']][1]
        else:
            dissolved = unary_union([s if s.is_valid else s.buffer(0) for s in grouped[name]])
            polys = [[list(ring) for ring in poly] for poly in polygons(mapping(dissolved))]
        # Preserve every source island. The Globe helper otherwise drops all small
        # islands except the largest, which can make an exact coastal pin ungradable.
        simplified = [piece for poly in polys for piece in simplify_polys(
            [poly], .0005 if len(poly[0]) < 30 else .005, 5)]
        features.append({'type': 'Feature', 'properties': {
            'name': name, 'country': region['country'], 'color': '#c0392b'},
            'geometry': {'type': 'MultiPolygon', 'coordinates': simplified}})
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps({'fingerprint': stamp, 'features': features}))
    return features


def tip_footprints(meta_ids, sources, admin1, aliases):
    """Precise admin1 unions, shared by identical scopes and cached between builds."""
    cache = HERE / 'training/meta-footprints.json'
    stamp = hashlib.sha256(json.dumps([1, (WORK / 'natural-earth-admin1.geojson').stat().st_mtime_ns,
                                      aliases], sort_keys=True).encode()).hexdigest()
    saved = json.loads(cache.read_text()) if cache.exists() else {}
    geometries = saved.get('geometries', {}) if saved.get('fingerprint') == stamp else {}
    out, changed = {}, saved.get('fingerprint') != stamp
    for meta_id in sorted(meta_ids):
        source = sources[meta_id]
        codes = source.get('subdivisions') or []
        resolved_groups = []
        for original in codes:
            alternatives = {original, ALIASES.get(original, original)}
            alternatives.update(old for old, current in ALIASES.items() if current == original)
            resolved_groups.append({code for item in alternatives
                for code in ([item] if item in admin1 else aliases.get(item, []))})
        if not resolved_groups or any(not group for group in resolved_groups):
            continue
        resolved = sorted(set().union(*resolved_groups))
        key = '|'.join(resolved)
        if key not in geometries:
            from shapely.geometry import mapping, shape
            from shapely.ops import unary_union
            shapes = [shape({'type': 'MultiPolygon', 'coordinates': admin1[code][2]}) for code in resolved]
            union = unary_union([s if s.is_valid else s.buffer(0) for s in shapes])
            if union.is_empty:
                continue
            polys = [[list(ring) for ring in poly] for poly in polygons(mapping(union))]
            geometries[key] = {'type': 'MultiPolygon', 'coordinates': [
                piece for poly in polys for piece in simplify_polys([poly], .01, 5)]}
            changed = True
        out[meta_id] = {'type': 'Feature', 'properties': {
            'name': source['title'], 'country': source['countries'][0]}, 'geometry': geometries[key]}
    if changed:
        tmp = cache.with_suffix('.tmp')
        tmp.write_text(json.dumps({'fingerprint': stamp, 'geometries': geometries}))
        tmp.replace(cache)
    return out
