#!/usr/bin/env python3
"""Turn reviewed candidates into the world clue bank and a Fieldwork pack.

Inputs: clues.json, candidates.jsonl, gap/candidates.jsonl (optional), review.jsonl (cheap-model verdicts).
Outputs: clue-bank.json, gap-report.json, <fieldwork>/content/world.json (the public pack) and
<fieldwork>/local/world-pack.json (the same pack for a local install). The pack embeds the Plonk It text under
CC BY-NC-SA 4.0 with per-card attribution.
Usage: python3 build.py [--fieldwork <Fieldwork checkout, default: this repo>]
"""
import argparse
import collections
import html
import json
import math
from pathlib import Path

import collect
import gapfill
import review
import text
from text import HERE, WORK

bc = collect.bc

PER_CLUE = 3
MIN_PLAYABLE = 2  # Fieldwork convention: a target needs two distinct panoramas (docs/CONTENT.md)
SOURCE_RANK = {'plonkit-example-link': 0, 'learnable-meta-export': 1, 'learnable-meta-catalogue': 2, 'geohints': 2,
               'geometas': 2, 'same-spot': 2, 'vali-region': 3, 'neighbour': 3}
STAGE_LABEL = {'within-country-regional': 'Regional clues', 'specialist': 'Specialist clues',
               'country-identification': 'Country clues'}
REGIONAL_CAVEAT = ('Country accuracy is scored from the map. The regional or specific clue is tracked by your '
                   '"spotted it" / "missed it" answer; a correct country does not prove the finer distinction.')


def read_jsonl(path):
    return [json.loads(l) for l in path.read_text().splitlines() if l.strip()] if path.exists() else []


def headline(note):
    first = (text.sentences(note.strip()) or [''])[0]
    return first if len(first) <= 90 else first[:87].rsplit(' ', 1)[0] + '…'


def note_html(text, cautions):
    """Plonk It text is imported source material, shown as the card's source note (escaped, one paragraph per line)."""
    paragraphs = [p.strip() for p in (text + ('\n' + cautions if cautions else '')).splitlines() if p.strip()]
    return ''.join(f'<p>{html.escape(p)}</p>' for p in paragraphs)


def card_image(url):
    """Plonk It refuses hotlinked originals (403) but serves its own resized copies, which is what the guide shows."""
    prefix = 'https://www.plonkit.net/images/'
    return url if not url.startswith(prefix) or url.startswith(prefix + 'resize/') else prefix + 'resize/600/80/' + url[len(prefix):]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--fieldwork', default=Path(__file__).resolve().parents[2])
    args = ap.parse_args()
    fieldwork = Path(args.fieldwork)

    clues = json.loads((HERE / 'clues.json').read_text())
    inventory = json.loads((WORK / 'location-database/foundations/all-guide-topic-inventory.json').read_text())
    topics = {t['sourceTopicId']: (u, t) for u in inventory['units'] for t in u['topics']}
    continents = {u['slug']: u.get('categories', []) for u in
                  json.loads((WORK / 'location-database/foundations/foundation-inventory.json').read_text())['units']}
    clue_text = {c['topicId']: c['text'] for c in clues}
    clue_labels = json.loads((HERE / 'labels/clues.json').read_text())
    # A verdict counts only for the exact candidate it reviewed: the id fingerprints clue text, source, panorama and cameras.
    candidates = {c['id']: c for p in ('candidates.jsonl', 'gap/candidates.jsonl', 'near/candidates.jsonl')
                  for c in read_jsonl(HERE / p)
                  if c['topicId'] in clue_text and c['id'] == collect.candidate_id(c, clue_text[c['topicId']])}
    verdicts = {v['id']: v for v in read_jsonl(HERE / 'review.jsonl')}
    world = json.loads((WORK / 'worldwide/countries-50m.geojson').read_text())
    country_at = bc.geolocator(world)
    regions = json.loads((HERE / 'gap/clue-regions.json').read_text()) if (HERE / 'gap/clue-regions.json').exists() else {}
    # Official A Competitive World country distribution (acow.py weights, https://tinyurl.com/acowdist), and for each
    # clue the small model's estimated detection rate on ACoW-shaped rounds (acow.py score). A clue seen only once is
    # too uncertain to jump the curated order, so only clues seen in two or more rounds are promoted.
    country_weights = json.loads((HERE / 'acow/weights.json').read_text())['countries']
    acow_seen = json.loads((HERE / 'acow/clue-value.json').read_text())['clues'] if (HERE / 'acow/clue-value.json').exists() else {}
    acow_value = {t: c['per1000'] for t, c in acow_seen.items() if c['hits'] >= 2}
    pano_subdivision = {l['panoId']: (l.get('extra', {}).get('tags') or [None])[0]
                        for p in (HERE / 'gap/pools').glob('*-locations.json')
                        for l in (lambda d: d['customCoordinates'] if isinstance(d, dict) else d)(json.loads(p.read_text()))}

    def region_ok(c):
        """Vali views qualify only inside the clue's current safe sampling area (gapfill.clue_area)."""
        if c['source'] != 'vali-region':
            return True
        area = gapfill.clue_area(clue_stage[c['topicId']], clue_slug[c['topicId']], regions.get(c['topicId']))
        return area is not False and (area is None or pano_subdivision.get(c['view']['panoId']) in area)

    clue_stage = {c['topicId']: c['stage'] for c in clues}
    clue_slug = {c['topicId']: c['slug'] for c in clues}
    # Per-country small-model curation (curate.py rank): every tip gets a tier and a position, judged against the whole
    # guide, its images and which tips the Learnable Meta community puts in Beginner/Intermediate maps.
    curation = json.loads((HERE / 'labels/curation.json').read_text())
    TIERS = ('foundational', 'useful', 'niche', 'skip')
    curated = {f'plonkit:{slug}:{r["tipId"]}': (r['tier'], r['kind'], i)
               for slug, v in curation.items() for i, r in enumerate(v['order'])}
    accepted = collections.defaultdict(list)
    for cid, c in candidates.items():
        v = verdicts.get(cid)
        ok = review.accepts(c, v, curated.get(c['topicId'], ('niche', 'other'))[1])
        if ok and region_ok(c):
            accepted[c['topicId']].append((c, ok[0], ok[1], v))

    bank, skills, locations, order_key, utility_tier = [], [], [], {}, {}
    max_weight = math.log1p(max(country_weights.values()))

    # Fallback priority for clues the ACoW sample never showed: roadside things you read (poles, signs, phone codes,
    # plates, car meta) before buildings and crops, and landscape last.
    KIND_GROUP = {'infrastructure': 0, 'signs-and-text': 0, 'phone-and-plates': 0, 'car-and-camera': 0,
                  'architecture': 1, 'agriculture': 1, 'other': 1, 'landscape-and-vegetation': 2}

    def utility_key(clue, weight):
        """How often the clue is usable in ranked No Move first (measured on ACoW). Clues never seen there follow in
        the curated order: tier, kind group, then each country's own order interleaved by ACoW country weight."""
        tier, kind, position = curated.get(clue['topicId'], ('niche', 'other', 999))
        utility_tier[clue['topicId']] = tier
        return (-acow_value.get(clue['topicId'], 0), TIERS.index(tier), clue['stage'] == 'specialist', KIND_GROUP[kind],
                position / (0.5 + math.log1p(weight) / max_weight))

    def is_practice(clue):
        """Seth already identifies countries; country clues stay in the bank but only European utility-pole clues
        enter practice, alongside every regional and specialist clue. Headings, map captions and coverage notes give
        nothing to spot in a panorama (small-model labels)."""
        _, topic = topics[clue['topicId']]
        tier = curated.get(clue['topicId'], ('niche',))[0]
        return ((clue['stage'] != 'country-identification' or (
            'utility-poles' in topic['concepts'] and 'Europe' in continents.get(clue['slug'], [])))
            and tier != 'skip' and clue_labels.get(clue['topicId'], {}).get('observable', False))

    # The engine resolves a published round back to its clue by panoId, so a panorama may serve one clue only.
    # Practice clues claim panoramas before bank-only ones; inside each, foundational first, then useful, then the rest.
    used_panos = set()
    for clue in sorted(clues, key=lambda c: (not is_practice(c), TIERS.index(curated.get(c['topicId'], ('niche',))[0]),
                                             c['stage'] == 'specialist')):
        unit, topic = topics[clue['topicId']]
        tier, kind, _ = curated.get(clue['topicId'], ('niche', 'other', 999))
        stage = clue['stage']
        practice = is_practice(clue)
        chosen = []
        # Reviewer-confirmed views first, then the human-placed ones, then by source.
        ranked = sorted(accepted[clue['topicId']], key=lambda a: (not a[2], SOURCE_RANK[a[0]['source']],
                                                                   -(a[3] or {}).get('verdictConfidence', 0)))
        for c, frame, confirmed, v in ranked:
            if c['view']['panoId'] in used_panos:
                continue
            view = c['views'][frame]
            # Every source must sit in the clue's own country: guide pages and map pools include contrast examples
            # and border panoramas, and the round is scored on the country.
            country, same = text.in_guide_country(c['view'], clue['slug'], clue['title'], country_at)
            if same is not True:
                continue
            used_panos.add(c['view']['panoId'])
            chosen.append({'panoId': c['view']['panoId'], 'lat': c['view']['lat'], 'lng': c['view']['lng'],
                           'heading': view['heading'] or 0, 'pitch': view['pitch'] or 0,
                           'zoom': round(max(0.0, min(3.0, math.log2(180 / view['fov']))), 3),
                           'country': country, 'source': c['source'], 'candidateId': c['id'],
                           'review': {'confirmed': confirmed, 'confidence': v and v['verdictConfidence'],
                                      'model': v and v['model']},
                           'sourceUrl': c.get('sourceUrl'), 'sourceMapIds': c.get('sourceMapIds')})
            if len(chosen) == PER_CLUE:
                break
        status = 'playable' if len(chosen) >= MIN_PLAYABLE else 'one-location' if chosen else 'no-location'
        bank.append({**{k: clue[k] for k in ('topicId', 'slug', 'title', 'stage', 'tipUrl')}, 'practice': practice,
                     'status': status, 'locations': chosen})
        if not practice:
            continue
        sid = f"world:pk:{clue['slug']}:{topic['tipId']}"
        # Family = the curated kind (infrastructure, signs-and-text, phone-and-plates, car-and-camera, landscape...).
        # The engine allows at most two clues per family in a set, so landscape can never take over a set.
        family = kind
        code = unit.get('code') or ''
        # Sub-national guides (Alaska, Hawaii, Azores, Madeira) are a small slice of their parent country's coverage.
        weight = country_weights.get(code.split('-')[0], 0) * (0.1 if '-' in code else 1)
        order_key[sid] = utility_key(clue, weight)
        skills.append({
            'id': sid, 'title': f"{clue['title']} · {headline(clue['text'])}", 'phase': STAGE_LABEL[stage],
            'prerequisites': [], 'practiceFamily': family,
            'importance': 0,  # set below from the utility order
            'availability': 'available' if len(chosen) >= MIN_PLAYABLE else 'needs-locations',
            'sourceNoteHtml': note_html(clue['text'], topic.get('cautions')), 'noteLicense': 'CC BY-NC-SA 4.0',
            'notesCountry': clue['title'], 'imageUrls': [card_image(u) for u in clue['imageUrls'][:1]],
            'source': {'title': f"Plonk It · {clue['title']}", 'url': clue['tipUrl']},
            'attributionHtml': f'Description and image from <a href="{clue["tipUrl"]}">Plonk It</a> '
                               '(CC BY-NC-SA 4.0, https://creativecommons.org/licenses/by-nc-sa/4.0/).',
            'scoringCaveats': [REGIONAL_CAVEAT],
            'actualImportedLocationCount': len(chosen),
            # European country pole clues practise alongside regional clues (Seth's request), so they share its scope.
            'curriculum': {'scope': 'within-country-regional' if stage == 'country-identification' else stage,
                           'rank': 0,  # set below: the engine introduces new clues in rank order
                           'source': {'guide': clue['slug'], 'tipId': topic['tipId'], 'section': topic['sectionIndex'],
                                      'sourceOrder': topic['sourceOrder'], 'guideStage': stage,
                                      'guideUpdatedAt': unit.get('guideUpdatedAt'), 'mapping': 'topic-match',
                                      'utilityTier': utility_tier[clue['topicId']],
                                      'acowPer1000': acow_value.get(clue['topicId'], 0)}},
        })
        for loc in chosen:
            locations.append({'id': f"pk:{clue['slug']}:{topic['tipId']}:{loc['panoId']}", 'panoId': loc['panoId'],
                              'lat': loc['lat'], 'lng': loc['lng'], 'heading': loc['heading'], 'pitch': loc['pitch'],
                              'zoom': loc['zoom'], 'skillIds': [sid], 'country': loc['country'], 'region': loc['country'],
                              'assessmentEligible': False,
                              'provenance': {'kind': loc['source'], 'sourceUrl': loc['sourceUrl'], 'sourceMapIds': loc['sourceMapIds'],
                                             'visualChecked': 'cheap-model' if loc['review']['confirmed'] else 'human-placed',
                                             'reviewModel': loc['review']['model'], 'reviewConfidence': loc['review']['confidence'],
                                             'countryBasis': 'Natural Earth 50m polygon'}})

    # One world-wide introduction order (see utility_key): what ranked No Move shows most, then the curated order.
    skills.sort(key=lambda s: (order_key[s['id']], s['id']))
    for rank, skill in enumerate(skills, 1):
        skill['curriculum']['rank'] = rank
        skill['importance'] = round(100 - 60 * (rank - 1) / max(1, len(skills) - 1), 1)

    active = [s for s in skills if s['availability'] == 'available']
    summary = (f"{len(active)} playable PlonkIt clues ({sum(s['phase'] == 'Regional clues' for s in active)} regional), "
               f"{len(locations)} panoramas across {len({l['country'] for l in locations})} countries. "
               'Every panorama was checked by a small vision model against the guide text; expect occasional misses.')
    features = [{'type': 'Feature', 'properties': {'name': f['properties']['ADMIN']}, 'geometry': f['geometry']}
                for f in world['features']]
    pack = {'id': 'world-plonkit-clue-bank', 'title': 'World · PlonkIt clue bank', 'subject': 'GeoGuessr',
            'schemaVersion': 1, 'contentRevision': 1, 'practiceMapId': '0' * 24,
            'answerAreaLabel': 'Worldwide. Country accuracy; regional clues are tracked through your clue answer',
            # Seth judges each round by whether he spotted the clue; the country guess is recorded but not graded.
            'gradingPolicy': 'recognition', 'maxLocationsPerCountry': 1, 'initialSkillIds': [],
            'skills': skills, 'locations': locations,
            'pools': [{'id': 'world-clue-bank', 'title': 'PlonkIt clue bank, worldwide',
                       'mapUrl': 'https://www.geoguessr.com/maps/66fda352ee1c8ee4735e1aa8',
                       'skillIds': [s['id'] for s in skills], 'locationIds': [l['id'] for l in locations]}],
            'coverageSummary': summary, 'regionFeatures': features,
            'geographySource': {'title': 'Natural Earth 50m Admin 0 countries',
                                'url': 'https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries-2/',
                                'license': 'Public domain', 'limits': 'Generalized boundaries are country feedback, not political claims.'},
            'sourceCoverage': {'builtFrom': 'Plonk It guides (CC BY-NC-SA 4.0), guide example links, shared Learnable Meta maps, Vali-generated regional candidates',
                               'review': 'Guide links and Learnable Meta map-maker views are used as placed; machine-sampled views count only when a small vision model clearly sees the clue.'}}
    # content/world.json is published unbound by scripts/content-assets.mjs, local/world-pack.json is what a local
    # install binds in .fieldwork.local.json. Both carry one revision, and installed userscripts refresh a cached pack
    # only when the hosted revision moves, so bump it on any change.
    targets = [fieldwork / 'content/world.json', fieldwork / 'local/world-pack.json']
    body = lambda p: {k: v for k, v in p.items() if k != 'contentRevision'}
    previous = [json.loads(t.read_text()) for t in targets if t.exists()]
    revision = max((p['contentRevision'] for p in previous), default=1)
    pack['contentRevision'] = revision if all(body(p) == body(pack) for p in previous) else revision + 1
    for target in targets:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(pack, ensure_ascii=False, indent=1) + '\n')

    for b in bank:
        b['tier'] = curated.get(b['topicId'], ('niche',))[0]
    (HERE / 'clue-bank.json').write_text(json.dumps(bank, ensure_ascii=False, indent=1))
    practice = [b for b in bank if b['practice']]
    by_tier = collections.Counter((b['tier'], b['status']) for b in practice)
    gaps = [{k: b[k] for k in ('topicId', 'title', 'tier', 'stage', 'tipUrl', 'status')} for b in practice
            if b['status'] != 'playable' and b['tier'] in ('foundational', 'useful')]
    (HERE / 'gap-report.json').write_text(json.dumps({'counts': {f'{t}:{s}': n for (t, s), n in sorted(by_tier.items())},
                                                      'foundationalAndUsefulGaps': gaps}, ensure_ascii=False, indent=1))
    print(summary)
    print(json.dumps({f'{t}:{s}': n for (t, s), n in sorted(by_tier.items())}, indent=1))


if __name__ == '__main__':
    main()
