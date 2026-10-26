#!/usr/bin/env python3
"""DECKS maps for sprint.py, their repeat check, and their exported locations for the pack. Learnable Meta authors
place each location on purpose, so there is
no visibility check: a location counts unless its panorama is gone. Fetches the author's view (collect.thumb), writes
'trusted: author-placed' or 'dead' per panorama into win/location-verdicts.json, replacing an earlier verdict on the
same panorama, and labels the frame rural, suburban or urban (rurality.py, by panorama id), so sprint.py takes rural
ones first.
Usage: WORLD_PACK_DATA=<caches> WORLD_PACK_INPUTS=<inputs> python3 tools/world-pack/sprint_decks.py, then rebuild sprint.py.
"""
import collections
import concurrent.futures as cf
import json
import urllib.error

import collect
import curate
import rurality
from build import read_jsonl
from text import HERE

# Whole Learnable Meta maps ('A Learnable Meta Brazil Poles', '... Brazil - Vegetation'), taught on their author-placed
# locations.
DECKS, TRUSTED = ['682f72974b4204c8b6a3cc6d', '6857dcd4087c8c0071fe0740'], 'trusted: author-placed'
REPEAT = """A GeoGuessr study pack for {country} has these cards:
{cards}

New clue from a Learnable Meta map for {country}:
{clue}

Is the new clue about utility poles or about vegetation and landscape? Does it teach the same clue as one of the cards
of that subject above (the same pole type, marking, insulator, plant or terrain)? Give a one-sentence reason, the
subject, and the number of the card it repeats, or 0 if it repeats none."""
REPEAT_SCHEMA = {'type': 'object', 'additionalProperties': False, 'required': ['reason', 'subject', 'card'],
                 'properties': {'reason': {'type': 'string'}, 'subject': {'type': 'string', 'enum': ['poles', 'landscape']},
                                'card': {'type': 'integer'}}}


def deck_repeats(picks, cands, name, model):
    """{(ISO2, deck source id): (subject, source id of the pole or landscape pick of that subject it repeats, or None)}
    for the DECKS metas, not sprint/decks picks (model, sprint/deck-repeats.json)."""
    shown = {cc: [p for p in picks.get(cc, []) if p['subject'] in ('poles', 'landscape')] for cc in cands}
    answers = curate.ask_cached(HERE / 'sprint/deck-repeats.json', {
        (cc, sid): REPEAT.format(country=name(cc), clue=c['text'], cards='\n'.join(
            f"{n}. [{p['subject']}] {p['label']}: {cs[p['id']]['text'][:400]}" for n, p in enumerate(shown[cc], 1)))
        for cc, cs in cands.items() for sid, c in cs.items() if c.get('deck') and 'pick' not in c}, REPEAT_SCHEMA, model)
    out = {}
    for (cc, sid), a in answers.items():
        same = shown[cc][a['card'] - 1] if 0 < a['card'] <= len(shown[cc]) else None
        out[cc, sid] = (a['subject'], same['id'] if same and same['subject'] == a['subject'] else None)
    return out


def frame(loc):
    """(verdict, the author's frame); verdict None when the fetch failed (the next run retries)."""
    try:
        image = collect.thumb(loc, collect.zoom_to_fov(loc.get('zoom') or 0))
    except urllib.error.HTTPError as e:  # the thumbnail service rejects removed panoramas
        return ('dead' if e.code in (400, 404) else None), None
    except Exception as e:
        print('failed', loc['panoId'], e, flush=True)
        return None, None
    return (TRUSTED, image) if image else ('dead', None)


def main():
    metas = {(m['mapId'], m['metaId']) for m in json.loads((HERE / 'lm/matches.json').read_text()) if m['mapId'] in DECKS}
    locs = [loc for e in read_jsonl(HERE / 'lm/exports.jsonl') if (e['mapId'], e['metaId']) in metas
            for loc in e['locations'] if loc.get('panoId')]
    with cf.ThreadPoolExecutor(curate.WORKERS) as pool:
        results = dict(zip((loc['panoId'] for loc in locs), pool.map(frame, locs)))
    found = {pano: verdict for pano, (verdict, _) in results.items() if verdict}
    rurality.label([(pano, image) for pano, (_, image) in results.items() if image])
    path = HERE / 'win/location-verdicts.json'
    verdicts = json.loads(path.read_text()) if path.exists() else {}
    path.write_text(json.dumps(verdicts | found, ensure_ascii=False, indent=1))
    print(json.dumps({'locations': len(locs), 'retryLater': len(locs) - len(found), **collections.Counter(found.values())}))


if __name__ == '__main__':
    main()
