#!/usr/bin/env python3
"""Where is each regional/specialist clue found? Small-model extraction into ISO 3166-2 subdivisions.

Writes gap/clue-regions.json: {topicId: {nationwide, subdivisions, wholeSubdivisions}}. Resumable.
wholeSubdivisions=false marks clues whose area is only part of a subdivision (gap fill skips those).
Usage: python3 regions.py
"""
import collections
import concurrent.futures as cf
import json
import subprocess
import tempfile

from gapfill import GAP, TERRITORIES
from review import MODEL, WORKERS
from text import HERE, WORK

PER_CALL = 20
SCHEMA = {'type': 'object', 'additionalProperties': False, 'required': ['results'], 'properties': {'results': {
    'type': 'array', 'items': {'type': 'object', 'additionalProperties': False,
                               'required': ['n', 'nationwide', 'wholeSubdivisions', 'subdivisions'],
                               'properties': {'n': {'type': 'integer'}, 'nationwide': {'type': 'boolean'},
                                              'wholeSubdivisions': {'type': 'boolean'},
                                              'subdivisions': {'type': 'array', 'items': {'type': 'string'}}}}}}}
PROMPT = """Each numbered item is a GeoGuessr guide clue for {title}. For each, decide where in {title} the clue's feature is found.
- nationwide=true (subdivisions=[]) when it applies across the whole country/territory or the text does not restrict location.
- Otherwise list the ISO codes below covering the clue's own area (not contrast areas it mentions).
- wholeSubdivisions=true only when the area is essentially those entire subdivisions; false when it is a smaller or vaguer part (e.g. "the western half of X", a single city, a valley, a road).

Subdivisions of {title}:
{subs}

{items}

Return exactly {n} results, n=1..{n}."""


def main():
    clues = json.loads((HERE / 'clues.json').read_text())
    subs = collections.defaultdict(list)
    for s in json.loads((GAP / 'subdivisions.json').read_text()):
        subs[s['CountryCode']].append(s)
    codes = {u['slug']: u.get('code') for u in json.loads(
        (WORK / 'location-database/foundations/all-guide-topic-inventory.json').read_text())['units']}
    path = GAP / 'clue-regions.json'
    regions = json.loads(path.read_text()) if path.exists() else {}
    groups = collections.defaultdict(list)
    for c in clues:
        # Country clues are country-wide by definition; entries without wholeSubdivisions predate this extractor.
        if c['stage'] == 'country-identification' or 'wholeSubdivisions' in regions.get(c['topicId'], {}):
            continue
        cc, fixed = TERRITORIES.get(c['slug'], (codes[c['slug']], None))
        options = [s for s in subs.get(cc, []) if not fixed or s['SubdivisionCode'] in fixed]
        if options:
            groups[(c['title'], cc, tuple(fixed or ()))].append((c, options))
    calls = [(title, items[i:i + PER_CALL]) for (title, _, _), items in groups.items() for i in range(0, len(items), PER_CALL)]
    print(f'extracting {sum(len(b) for _, b in calls)} clues in {len(calls)} calls with {MODEL}', flush=True)
    schema = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False)
    json.dump(SCHEMA, schema)
    schema.close()

    def one(call):
        title, batch = call
        options = batch[0][1]
        prompt = PROMPT.format(title=title, n=len(batch),
                               subs='\n'.join(f"{s['SubdivisionCode']}: {s['Name']}" for s in options),
                               items='\n'.join(f"Item {i}: [{c['section']} / {c.get('subsection') or ''}] {c['text'][:700]}"
                                               for i, (c, _) in enumerate(batch, 1)))
        try:
            out = subprocess.run(['codex', 'exec', '--skip-git-repo-check', '--ignore-rules', '-s', 'read-only', '-m', MODEL,
                                  '--output-schema', schema.name, '--', prompt],
                                 capture_output=True, text=True, timeout=900, cwd=tempfile.gettempdir())
            results = {r['n']: r for r in json.loads(out.stdout.strip().splitlines()[-1])['results']}
        except Exception:
            return {}
        valid = {s['SubdivisionCode'] for s in options}
        got = {}
        for i, (c, _) in enumerate(batch, 1):
            r = results.get(i)
            if r:
                keep = [s for s in r['subdivisions'] if s in valid]
                # An empty or unrecognised subdivision answer is unusable, never an implicit "nationwide".
                got[c['topicId']] = {'nationwide': r['nationwide'], 'subdivisions': [] if r['nationwide'] else keep,
                                     'wholeSubdivisions': bool(r['wholeSubdivisions'] and (r['nationwide'] or keep)),
                                     'model': MODEL}
        return got

    with cf.ThreadPoolExecutor(WORKERS) as pool:
        for got in pool.map(one, calls):
            regions.update(got)
            path.write_text(json.dumps(regions))
    print(f'{len(regions)} clues have regions', flush=True)


if __name__ == '__main__':
    main()
