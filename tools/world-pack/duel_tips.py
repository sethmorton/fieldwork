"""Two model passes over the duel cards' Plonk It tips, cached in sprint/duel-tip-verdicts.json, read by sprint_rounds.py:
1. Which listed tips are CLEARLY visible in that round's own frames: gpt-6.1-sol finds, gpt-6-astra confirms each claim
   (sprint_duels.py's two stages and prompts). Writes sprint/duel-tip-views.json ({round id: {topicId: hit}}) and
   win/duel-verified.jpg (12 hits).
2. Which tips of an answer or guessed subdivision are about one smaller place inside it (the town of Uiramutã, not all of
   Roraima): both models must agree. Writes sprint/duel-tip-scope.json ({code: [topicId]}).
Run after sprint.py has built the duel cards, then rebuild sprint.py."""
import concurrent.futures as cf
import json

import collect
import curate
import duels
import sprint_duels as sd
from sprint_rounds import SCOPE, VERIFIED, candidates, place, tips_index
from text import HERE

SCOPE_PROMPT = """These GeoGuessr guide tips (Plonk It) are listed for {name} ({code}), {country}.
For each numbered tip, answer local=true only when its text ties the clue to one specific smaller place inside {name}
(a named town, city, park, valley, island or district), so it does not describe {name} as a whole. Answer false when it
describes {name}, a larger area containing it, or several regions.

{tips}"""
SCOPE_SCHEMA = curate.schema({'n': {'type': 'integer'}, 'local': {'type': 'boolean'}})


def check(r, tips, cache):
    """{topicId: hit} for one round plus new cache entries; None when frames could not be fetched (retry later)."""
    images = duels.frames(r)
    if images is None:
        return None
    if not images or not tips:
        return {}, {}
    new = {}

    def ask(model, prompt, schema, imgs, *key):
        fp = curate.fingerprint(model, *key)
        if fp not in cache and fp not in new:
            new[fp] = curate.ask(prompt, schema, imgs, model)
        return cache.get(fp) or new[fp]

    lines = '\n'.join(f'{n}. {c["text"]}' for n, c in enumerate(tips, 1))
    prompt = sd.FIND.format(k=len(images), where=r['subdivision'] or 'an unknown area', country=r['country'], clues=lines)
    hits = {}
    try:
        found = ask(sd.FIND_MODEL, prompt, sd.FIND_SCHEMA, images, sd.FIND, r['id'], [p.name for p in images], lines)
        for m in found['matches']:
            if not (1 <= m['n'] <= len(tips) and 1 <= m['image'] <= len(images)):
                continue
            tip, image = tips[m['n'] - 1], images[m['image'] - 1]
            verdict = ask(sd.CONFIRM_MODEL, sd.CONFIRM.format(country=r['country'], clue=tip['text']), sd.CONFIRM_SCHEMA,
                          [image], sd.CONFIRM, r['id'], image.name, tip['text'])
            if verdict['visible'] == 'yes' and verdict['confidence'] >= sd.MIN_CONFIDENCE:
                hits.setdefault(tip['topicId'], {'frame': m['image'], 'image': str(image), 'feature': m['feature'],
                                                 'description': verdict['description']})
    except Exception as e:
        print('failed', r['id'], e, flush=True)
    return hits, new


def local_tips(code, name, country, tips, cache):
    """(topicIds both models call local to one smaller place inside the subdivision, new cache entries)."""
    lines = '\n'.join(f'{n}. {c["text"]}' for n, c in enumerate(tips, 1))
    prompt, new, votes = SCOPE_PROMPT.format(name=name, code=code, country=country, tips=lines), {}, []
    try:
        for model in (sd.FIND_MODEL, sd.CONFIRM_MODEL):
            fp = curate.fingerprint(model, SCOPE_PROMPT, code, lines)
            if fp not in cache:
                new[fp] = curate.ask(prompt, SCOPE_SCHEMA, (), model)
            votes.append({x['n'] for x in (cache.get(fp) or new[fp])['results'] if x['local'] and 1 <= x['n'] <= len(tips)})
    except Exception as e:
        print('failed', code, e, flush=True)
        return [], new
    return [tips[n - 1]['topicId'] for n in sorted(votes[0] & votes[1])], new


def main():
    cards = {s['curriculum']['source']['clue']: s for s in json.loads((sd.OUT / 'pack.json').read_text())['skills']
             if s['subject'] == 'duel'}
    rounds = [r for r in json.loads((HERE / 'duels/rounds.json').read_text()) if r['id'] in cards]
    by_code, by_slug = tips_index(json.loads((HERE / 'gap/clue-regions.json').read_text()))
    tips = {r['id']: candidates(place(r['subdivision'])[1], cards[r['id']]['source'].get('url', '').rpartition('/')[2],
                                by_code, by_slug) for r in rounds}
    cache = collect.JsonCache(sd.OUT / 'duel-tip-verdicts.json')
    out = {}
    with cf.ThreadPoolExecutor(curate.WORKERS) as pool:
        jobs = {pool.submit(check, r, tips[r['id']], cache.data): r for r in rounds}
        for done, job in enumerate(cf.as_completed(jobs), 1):
            r, res = jobs[job], job.result()
            if res:
                hits, new = res
                cache.data.update(new)
                cache.save()
                if hits:
                    out[r['id']] = hits
            print(f'{done}/{len(rounds)} rounds, {len(out)} with a verified tip', flush=True)
    VERIFIED.write_text(json.dumps(dict(sorted(out.items())), ensure_ascii=False, indent=1))
    places = {}  # every answer and guessed subdivision with more than one tip: {code: (name, country)}
    for r in rounds:
        for (sub, code), country in ((place(r['subdivision']), r['country']), (place(r['myGuessSubdivision']), r['myGuessCountry'])):
            if len(by_code.get(code, [])) > 1:
                places[code] = (sub, country)
    scope = {}
    with cf.ThreadPoolExecutor(curate.WORKERS) as pool:
        jobs = {pool.submit(local_tips, code, n, country, by_code[code], cache.data): code for code, (n, country) in places.items()}
        for job in cf.as_completed(jobs):
            ids, new = job.result()
            cache.data.update(new)
            cache.save()
            if ids:
                scope[jobs[job]] = ids
    SCOPE.write_text(json.dumps(dict(sorted(scope.items())), ensure_ascii=False, indent=1))
    print('subdivisions', len(places), 'with local tips', len(scope), 'local tips', sum(map(len, scope.values())))
    by_id = {r['id']: r for r in rounds}
    text = {c['topicId']: c['text'] for ts in tips.values() for c in ts}
    sample = [(by_id[rid], {'frame': h['frame'], 'image': h['image'], 'skill': {'title': f"{by_id[rid]['subdivision']}: {text[t]}"}})
              for rid, hs in list(out.items())[:12] for t, h in list(hs.items())[:1]]
    (HERE / 'win').mkdir(exist_ok=True)
    sd.contact_sheet(sample, HERE / 'win/duel-verified.jpg')
    print(json.dumps({'cards': len(cards), 'verified': len(out), 'sheet': str(HERE / 'win/duel-verified.jpg')}))


if __name__ == '__main__':
    main()
