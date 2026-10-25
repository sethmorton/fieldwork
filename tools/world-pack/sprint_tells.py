"""Sprint tells: one actionable line per non-duel card, 'what to look for -> where it puts you', for mid-round recall.

WRITER drafts each tell from the card's title, verbatim source note, area and subject; CHECKER is given the tell and the
same source text and says whether every claim in the tell is in it. A rejected tell is redrafted once with the
checker's feedback; a tell rejected twice is left out. Every model call is cached by fingerprint in sprint/tells-cache.json.

Usage: WORLD_PACK_DATA=<caches> python3 tools/world-pack/sprint_tells.py [limit]   -> sprint/tells.json {skillId: tell}
"""
import concurrent.futures as cf
import json
import sys
import threading

import curate
import text
from text import HERE

WRITER, CHECKER, WORKERS, MAX_WORDS = 'gpt-6.1-sol', 'gpt-6-astra', 10, 16
CACHE = HERE / 'sprint/tells-cache.json'
TELL_SCHEMA = {'type': 'object', 'additionalProperties': False, 'required': ['tell'],
               'properties': {'tell': {'type': 'string'}}}
CHECK_SCHEMA = {'type': 'object', 'additionalProperties': False, 'required': ['supported', 'unsupported'],
                'properties': {'supported': {'type': 'string', 'enum': ['yes', 'no']}, 'unsupported': {'type': 'string'}}}
MODES = {'identify': 'telling this country apart from other countries',
         'regional': 'placing a guess in the right region inside this country'}


def source_text(skill, lm_notes):
    """The card's source note as plain text; Learnable Meta notes missing from the pack come from lm/matches.json."""
    note = text.plain(skill['sourceNoteHtml']).strip()
    if not note and 'notesSourceMapId' in skill:
        meta = lm_notes[skill['notesSourceMapId'], skill['sourceMetaName']]
        note = f"{meta['metaName']}\n{text.plain(meta['note'] or '')}".strip()
    return note


def context(skill, note):
    area = f"\nArea the card covers: {skill['area']}" if skill.get('area') else ''
    return (f"Country: {skill['countryName']}\nCard title: {skill['title']}\nSubject: {skill['subject']}\n"
            f"Card purpose: {MODES[skill['mode']]}{area}\nSource text (from the {skill['countryName']} guide):\n{note}")


def write_prompt(skill, note, feedback=None):
    retry = (f"\n\nYour previous tell was rejected: {feedback}\nWrite a new tell that fixes this." if feedback else '')
    contrast = ("\n- This card contrasts two countries: build the tell from the FIRST tell in the source (the first line "
                "after the 'X vs Y' heading), in the form '<what to look for> -> <country>, not <other country>'. If "
                "that tell starts with '(if a sign is visible)', the tell must keep it." if skill['subject'] == 'contrast'
                else '')
    return (f"Write a GeoGuessr 'tell' for a competitive player to act on mid-round, from this flashcard.\n\n"
            f"{context(skill, note)}\n\nRules:\n- One line, about 14 words and at most {MAX_WORDS}, leading with the "
            "observation and the destination: '<what to look for> -> <where it puts you>'.\n- Keep any scope the source "
            "sets: 'Boxy car in Karnataka is only found around Bengaluru' -> 'Within Karnataka: boxy car -> Bengaluru "
            "area'.\n- Word places as the source text does (a belt stays a belt, not a list of states). Use the area's "
            "names only when the source text names no place.\n- Add an alternative only when the source names one that "
            "shares the clue ('-> Cyprus or Greece', '-> Czechia or Slovakia'). No generic caveats such as 'confirm with "
            "another cue'.\n- Card titles can mislead: describe what the source text says (e.g. 'wide middle lines' may "
            "mean a wide gap between two lines).\n- Examples: 'Concrete pole with a round hole near the top -> Gujarat, "
            "India'; 'Yellow centre plus white edge lines -> US or Canada, not Norway'.\n- Use only facts stated in the "
            "source text, the area or the country. Add nothing from your own knowledge.\n- The look-for part must be "
            f"something visible in a Street View panorama.{contrast}{retry}")


def check_prompt(skill, note, tell):
    contrast = (" For this contrast card the tell must come from the first tell in the source and keep '(if a sign is "
                "visible)' if that tell has it." if skill['subject'] == 'contrast' else '')
    return (f"Fact-check a one-line GeoGuessr tell against its source.\n\nTell: {tell}\n\n{context(skill, note)}\n\n"
            "Does every claim in the tell appear in the source text, the area or the country above? Paraphrase and "
            "shortening are fine; any added fact, place, frequency or exclusion that the source does not state is not. "
            "A tell that drops a scope the source sets (such as 'in Karnataka'), or lists area places where the source "
            f"text names its own place or belt, is not supported either.{contrast} Answer supported yes or no, and in "
            "unsupported quote the unsupported part (empty when yes).")


class Asker:
    def __init__(self):
        self.cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
        self.lock = threading.Lock()

    def __call__(self, prompt, schema, model):
        key = curate.fingerprint(model, schema, prompt)
        if key not in self.cache:
            answer = curate.ask(prompt, schema, (), model)
            with self.lock:
                self.cache[key] = answer
                CACHE.write_text(json.dumps(self.cache, ensure_ascii=False))
        return self.cache[key]


def tell_for(ask, skill, note):
    """(tell or None, feedback of the last rejection)."""
    feedback = None
    for _ in range(2):
        tell = ask(write_prompt(skill, note, feedback), TELL_SCHEMA, WRITER)['tell'].strip()
        words = len(tell.split())
        if words > MAX_WORDS or ' -> ' not in tell:
            feedback = f"'{tell}' is {words} words; it must be at most {MAX_WORDS} words and contain ' -> '."
            continue
        verdict = ask(check_prompt(skill, note, tell), CHECK_SCHEMA, CHECKER)
        if verdict['supported'] == 'yes':
            return tell, None
        feedback = f"'{tell}' is not supported by the source: {verdict['unsupported']}"
    return None, feedback


def main(limit=None):
    pack = json.loads((HERE / 'sprint/pack.json').read_text())
    lm_notes = {(m['mapId'], m['metaName']): m for m in json.loads((HERE / 'lm/matches.json').read_text())}
    # Contrast cards come from sprint/contrast.json, which may be newer than the pack built from it.
    contrast = HERE / 'sprint/contrast.json'
    fresh = {c['id']: c for c in json.loads(contrast.read_text())} if contrast.exists() else {}
    skills = [fresh.get(s['id'], s) for s in pack['skills'] if s['subject'] != 'duel'][:limit]
    ask = Asker()
    with cf.ThreadPoolExecutor(WORKERS) as pool:
        results = list(pool.map(lambda s: tell_for(ask, s, source_text(s, lm_notes)), skills))
    tells = {s['id']: t for s, (t, _) in zip(skills, results) if t}
    for s, (t, why) in zip(skills, results):
        if not t:
            print('omitted', s['id'], '-', why, flush=True)
    (HERE / 'sprint/tells.json').write_text(json.dumps(tells, ensure_ascii=False, indent=1))
    print(f'{len(tells)} of {len(skills)} skills have a tell', flush=True)


if __name__ == '__main__':
    main(int(sys.argv[1]) if len(sys.argv) > 1 else None)
