"""Sprint 'duel' cards ("Your rounds", docs/sprint-plan.md): your own recent world-map duel rounds where you missed, each
replayed on its own panorama, plus 'exposure' cards for every other A Competitive World round. The note states what
happened and teaches with verbatim Plonk It tips: those verified visible in the round, the subdivision's (else the
country's), only ones that tell the answer from a guessed subdivision, 1 tip for a wrongly guessed country, and the
vision survey's description of the view."""
import collections
import datetime as dt
import html
import json
from pathlib import Path

from build import note_html
from text import HERE

MAPS = {'A Competitive World', 'A Community World', 'An Arbitrary World', 'An Extra-Informed World', 'A Moving World'}
DAYS, RECENT_HOURS, FAR_M = 14, 24, 750_000
ACOW = 'A Competitive World'
TEACH = ('landscape-and-vegetation', 'infrastructure', 'agriculture')  # preference order
VERIFIED, SCOPE = HERE / 'sprint/duel-tip-views.json', HERE / 'sprint/duel-tip-scope.json'
SURVEY = HERE / 'win/survey.jsonl'  # round vision survey (optional); lost in the 2026-10-25 /tmp wipe until rerun


def place(subdivision):
    """('Goiás', 'BR-GO') from the round's 'Goiás (BR-GO)'; (None, None) when it has none."""
    name, _, code = (subdivision or '').rpartition(' (')
    return (name, code.rstrip(')')) if name else (subdivision or None, None)


def replays(rounds, to_code, now):
    """Rounds to replay: the last DAYS days on MAPS in the wrong country or more than FAR_M off, plus every round of the
    last RECENT_HOURS hours; most recent day first, then the biggest deficit."""
    out = []
    for r in rounds:
        end = dt.datetime.fromisoformat(r['endTime']) if r['endTime'] else None
        if r['map'] not in MAPS or not end or end < now - dt.timedelta(days=DAYS):
            continue
        missed = to_code.get(r['myGuessCountry']) != r['countryCode'] or (r['myGuess'] or {}).get('distance', 0) > FAR_M
        if missed or end >= now - dt.timedelta(hours=RECENT_HOURS):
            out.append((end, r))
    return [r for end, r in sorted(out, key=lambda er: (-er[0].toordinal(), (er[1]['myScore'] or 0) - (er[1]['theirScore'] or 0)))]


def direction(turn):
    """Where a clue verified at a heading `turn` degrees right of the start view is: in view within 45 degrees."""
    turn = (turn + 180) % 360 - 180
    if abs(turn) <= 45:
        return 'Visible here'
    if abs(turn) >= 135:
        return 'Visible behind you'
    return f"Visible when you turn about {round(abs(turn))} degrees {'right' if turn > 0 else 'left'}"


def tips_index(regions):
    """(by subdivision code, by (country slug, tied to subdivisions)): Plonk It tips of TEACH kinds, by kind then shortest first."""
    kinds = {f"plonkit:{slug}:{r['tipId']}": r['kind'] for slug, v in json.loads((HERE / 'labels/curation.json').read_text()).items()
             for r in v['order'] if r['tier'] != 'skip'}
    by_code, by_slug = collections.defaultdict(list), collections.defaultdict(list)
    clues = [c for c in json.loads((HERE / 'clues.json').read_text()) if kinds.get(c['topicId']) in TEACH]
    for c in sorted(clues, key=lambda c: (TEACH.index(kinds[c['topicId']]), len(c['text']))):
        reg = regions.get(c['topicId'], {})
        for code in reg.get('subdivisions', []):
            by_code[code].append(c)
        by_slug[c['slug'], bool(reg.get('subdivisions'))].append(c)  # (slug, False): nationwide tips
    return by_code, by_slug


def tip_html(c, suffix=''):
    return f'<p><a href="{html.escape(c["tipUrl"])}">{html.escape(c["text"])}</a>{html.escape(suffix)}</p>'


def candidates(code, slug, by_code, by_slug):
    """The round's Plonk It tips: up to 3 for its subdivision plus 2 nationwide, else 2 from the country's other regions."""
    return (by_code.get(code, [])[:3] + by_slug.get((slug, False), [])[:2]) or by_slug.get((slug, True), [])[:2]


def in_view(v):
    """The survey's visible yes/no categories and plain descriptions; its 'most useful clue' guess is left out."""
    seen = {k: v[k].get('visible') for k in ('poles', 'bollards', 'signs', 'car') if isinstance(v.get(k), dict)}
    seen['road lines'] = v.get('road', {}).get('lines_visible')
    out = ['Visible: ' + ', '.join(f'{k} {y}' for k, y in seen.items() if y in ('yes', 'no'))]
    pole = ' '.join(x for x in (v['poles'].get('shape'), v['poles'].get('top_crossarm_insulators')) if x and x != 'not visible') \
        if seen.get('poles') == 'yes' else ''
    road = v.get('road', {})
    lines = ' '.join(f'{k.replace("_", " ")}: {road[k]}' for k in ('centre_line', 'edge_lines') if road.get(k) not in (None, 'not visible')) \
        if seen['road lines'] == 'yes' else ''
    t = v.get('terrain', {})
    for label, text in (('Poles', pole), ('Vegetation', v.get('vegetation')), ('Terrain', '. '.join(x for x in (t.get('relief'), t.get('soil_colour')) if x)), ('Road lines', lines)):
        if text and text != 'not visible':
            out.append(f'{label}: {text}')
    return ''.join(f'<p>{html.escape(x)}</p>' for x in out)


def cards(rounds, to_code, now, pack_skills, used, regions, views, name, mode, relevance, guide_url):
    """(skills, locations): mistake cards for the replayed rounds, then 'exposure' cards for every other ACoW round, each on
    a panorama the pack does not use yet. regions: gap/clue-regions.json; views: sprint/duel-views.json ({clue: [{round, ...}]})."""
    by_clue = {s['curriculum']['source']['clue']: s for s in pack_skills}
    by_country = collections.defaultdict(list)
    for s in pack_skills:
        by_country[s['country']].append(s)
    seen = collections.defaultdict(list)  # round id -> (pack skill verified visible in it, heading it was verified at)
    for clue, vs in views.items():
        for v in vs:
            if clue in by_clue:
                seen[v['round']].append((by_clue[clue], v['heading']))
    by_code, by_slug = tips_index(regions)
    survey = {}
    if SURVEY.exists():
        survey = {x['id']: x['survey'] for x in map(json.loads, SURVEY.read_text().splitlines()) if x.get('survey')}
    verified = json.loads(VERIFIED.read_text()) if VERIFIED.exists() else {}  # duel_tips.py: {round: {topicId: hit}}
    scope = json.loads(SCOPE.read_text()) if SCOPE.exists() else {}  # duel_tips.py: {code: [tips naming a smaller place]}
    local = lambda c, code: c['topicId'] in scope.get(code, ())
    # A subdivision's tips, without those about one smaller place inside it unless nothing else is left.
    wide = lambda code: [c for c in by_code.get(code, []) if not local(c, code)] or by_code.get(code, [])[:1]
    skills, locations = [], []
    mistakes = replays(rounds, to_code, now)
    ids = {r['id'] for r in mistakes}
    for r, exposure in [(r, False) for r in mistakes] + [(r, True) for r in rounds if r['map'] == ACOW and r['id'] not in ids]:
        cc, view = r['countryCode'], r['view']
        if cc not in mode or not view or view['panoId'] in used or not r['endTime']:
            continue
        used.add(view['panoId'])
        sub, code = place(r['subdivision'])
        gsub, gcode = place(r['myGuessSubdivision'])
        guess = ', '.join(x for x in (gsub, r['myGuessCountry']) if x)
        when = dt.datetime.fromisoformat(r['endTime'])
        answer = f"Answer: {', '.join(x for x in (sub, name(cc)) if x)}."
        distance = (r.get('myGuess') or {}).get('distance')
        lines = [answer + (f" You guessed {guess + ', ' if guess else ''}{round(distance / 1000):,} km off, on {r['map']}."
                           if distance is not None else f" You made no guess, on {r['map']}.")]
        slug = guide_url.get(cc, '').rpartition('/')[2]
        gcc = to_code.get(r['myGuessCountry'])
        same = gcc == cc and gcode and gcode != code  # right country, wrong subdivision
        covers = lambda c, where: where in regions.get(c['topicId'], {}).get('subdivisions', [])
        # Verified in this round's own frames (duel_tips.py); frame k faces the opening heading + 90(k-1).
        hits = [(c, v) for c in candidates(code, slug, by_code, by_slug) if not local(c, code) or c in wide(code)
                for v in [verified.get(r['id'], {}).get(c['topicId'])] if v]
        shown = [c for c, _ in hits]
        if same:  # only what tells the two apart: the answer's tips that do not also cover the guess
            rest = [c for c in wide(code) if not covers(c, gcode) and c not in shown][:3]
            head = f'Points to {sub}, not {gsub}'
        else:
            rest = [c for c in (wide(code)[:3] + by_slug.get((slug, False), [])[:2]) or by_slug.get((slug, True), [])[:2]
                    if c not in shown]
            head = f'Other clues for {sub if by_code.get(code) else name(cc)}'
        lines += [f'{direction(heading - (view["heading"] or 0))}: {s["title"]}' for s, heading in seen[r['id']]]
        if not hits and not rest and not seen[r['id']] and by_country[cc]:
            lines.append(f'Cards for {name(cc)}: ' + '; '.join(s['title'] for s in by_country[cc][:3]))
        note = note_html('\n'.join(lines), None)
        if hits:
            note += '<p><strong>Seen in this round (verified)</strong></p>' + ''.join(
                tip_html(c, f' ({direction(90 * (v["frame"] - 1))})') for c, v in hits)
        if rest:
            note += f'<p><strong>{html.escape(head)}</strong></p>' + ''.join(map(tip_html, rest))
        other = [c for c in wide(gcode) if not covers(c, code)][:1] if same else \
            by_slug.get((guide_url.get(gcc, '').rpartition('/')[2], False), [])[:1] if gcc and gcc != cc else []
        if other:
            note += f'<p><strong>Points to {html.escape(gsub if same else name(gcc))} instead</strong></p>' + tip_html(other[0])
        if r['id'] in survey:
            note += '<p><strong>In view (model description, may be wrong)</strong></p>' + in_view(survey[r['id']])
        # The tip's own first sentence, so the tell adds no facts.
        tell = f"{hits[0][0]['text'].split('. ')[0].rstrip('.')} -> {sub or name(cc)}" if hits else None
        sid = f"sprint:duel:{r['id']}"
        title = f"{name(cc)}{f' · {sub}' if sub else ''} " + ('(ranked map)' if exposure else f"(your duel, {when:%b} {when.day})")
        skills.append({
            'id': sid, 'title': title,
            'phase': 'Your rounds', 'practiceFamily': f'{cc}:duel', 'prerequisites': [], 'availability': 'available',
            'importance': 100, 'country': cc, 'countryName': name(cc), 'subject': 'duel', 'mode': mode[cc],
            **({'area': sub} if sub else {}), **({'exposure': True} if exposure else {}), **({'tell': tell} if tell else {}), 'why': answer, 'relevance': relevance(cc),
            # Your round plus verbatim Plonk It tips, each linked to its source.
            'sourceNoteHtml': note, 'noteLicense': 'own; linked Plonk It tips CC BY-NC-SA 4.0', 'imageUrls': [],
            'source': {'title': f'Plonk It · {name(cc)}', **({'url': guide_url[cc]} if cc in guide_url else {})},
            'attributionHtml': 'Your own GeoGuessr duel round. Linked tips from Plonk It (CC BY-NC-SA 4.0, '
                               'https://creativecommons.org/licenses/by-nc-sa/4.0/).',
            'curriculum': {'scope': 'within-country-regional' if mode[cc] == 'regional' else 'country-identification',
                           'rank': 0, 'source': {'clue': r['id']}}})
        locations.append({'id': f"sprint:duel:{view['panoId']}", 'panoId': view['panoId'], 'lat': view['lat'],
                          'lng': view['lng'], 'heading': view['heading'] or 0, 'pitch': view['pitch'] or 0, 'zoom': 0,
                          'skillIds': [sid], 'country': name(cc), 'assessmentEligible': False,
                          'provenance': {'kind': 'duel-round', 'round': r['id']}})
    return skills, locations
