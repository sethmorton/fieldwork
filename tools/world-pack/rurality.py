#!/usr/bin/env python3
"""Rural, suburban or urban: small-model label for the opening frame of practice locations, so build.py can prefer
rural ones like the ranked map (A Competitive World is about 87% rural).

  pack          label every location the pack uses (clue-bank.json, playable practice clues) to measure the urban share
  alternatives  label the other accepted candidates of clues whose chosen locations are not all rural
Usage: WORLD_PACK_DATA=<caches> python3 tools/world-pack/rurality.py pack|alternatives [LIMIT]
Writes rurality.jsonl ({id: candidate id, setting}). Resumable.
"""
import concurrent.futures as cf
import json
import sys
import curate
import review
from text import HERE

PER_CALL = 12
OUT = HERE / 'rurality.jsonl'
INSTRUCTIONS = ("Each numbered image is one Street View frame. Classify the setting of each: rural (countryside, farmland, "
                "forest, open road, a few scattered houses), suburban (residential streets, edge of town, villages with "
                "continuous houses) or urban (town or city centre, shops, dense buildings).")
SCHEMA = curate.schema({'n': {'type': 'integer'}, 'setting': {'type': 'string', 'enum': ['rural', 'suburban', 'urban']}})


def labelled():
    return {r['id']: r['setting'] for r in map(json.loads, OUT.read_text().splitlines())} if OUT.exists() else {}


def candidates():
    cands = {}
    for name in ('candidates.jsonl', 'gap/candidates.jsonl', 'near/candidates.jsonl', 'acow/candidates.jsonl'):
        path = HERE / name
        if path.exists():
            cands.update((c['id'], c) for c in map(json.loads, path.read_text().splitlines()))
    return cands


def frame(c, verdict, kind):
    accepted = review.accepts(c, verdict, kind)
    return HERE / c['views'][accepted[0]]['thumb'] if accepted else None


def label(items):
    """items: [(candidate id, image path)] not yet labelled."""
    done = labelled()
    todo = [(i, p) for i, p in items if i not in done and p and p.exists()]
    batches = [todo[k:k + PER_CALL] for k in range(0, len(todo), PER_CALL)]

    def one(batch):
        prompt = INSTRUCTIONS + f"\n\nReturn exactly {len(batch)} results, n=1..{len(batch)} in image order."
        try:
            answer = {r['n']: r['setting'] for r in curate.ask(prompt, SCHEMA, [p for _, p in batch])['results']}
        except Exception:
            return []  # retried on the next run
        return [{'id': i, 'setting': answer[n]} for n, (i, _) in enumerate(batch, 1) if n in answer]

    with open(OUT, 'a') as f, cf.ThreadPoolExecutor(curate.WORKERS) as pool:
        for recs in pool.map(one, batches):
            for rec in recs:
                f.write(json.dumps(rec) + '\n')
            f.flush()


def context():
    verdicts = {}
    for line in (HERE / 'review.jsonl').read_text().splitlines():
        r = json.loads(line)
        verdicts[r['id']] = r
    cur = json.loads((HERE / 'labels/curation.json').read_text())
    kind = {f'plonkit:{s}:{r["tipId"]}': r['kind'] for s, v in cur.items() for r in v['order']}
    return candidates(), verdicts, kind


def chosen():
    """Candidate ids of the locations each playable practice clue uses."""
    return {b['topicId']: [l['candidateId'] for l in b['locations']] for b in json.loads((HERE / 'clue-bank.json').read_text())
            if b['practice'] and b['status'] == 'playable'}


def pack(limit=None):
    cands, verdicts, kind = context()
    ids = [i for ids in chosen().values() for i in ids][:limit]
    label([(i, frame(cands[i], verdicts.get(i), kind.get(cands[i]['topicId']))) for i in ids])
    report(ids)


def alternatives(limit=None):
    cands, verdicts, kind = context()
    done = labelled()
    short = {t for t, ids in chosen().items() if any(done.get(i) != 'rural' for i in ids)}
    items = [(c['id'], frame(c, verdicts.get(c['id']), kind.get(c['topicId']))) for c in cands.values() if c['topicId'] in short]
    label([(i, p) for i, p in items if p][:limit])
    print(json.dumps({'cluesWithNonRural': len(short), 'labelled': len(labelled())}))


def report(ids):
    done = labelled()
    seen = [done[i] for i in ids if i in done]
    print(json.dumps({s: f'{100 * seen.count(s) / max(1, len(seen)):.0f}%' for s in ('rural', 'suburban', 'urban')}
                     | {'labelled': len(seen), 'of': len(ids)}))


if __name__ == '__main__':
    command, *rest = sys.argv[1:]
    limit = int(rest[0]) if rest else None
    {'pack': pack, 'alternatives': alternatives}[command](limit)
