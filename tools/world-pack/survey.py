"""Vision survey of what is visible at each ACoW NoMove duel spot (4 frames). Cached per round in survey.jsonl.
Usage: WORLD_PACK_DATA=... python3 survey.py [LIMIT]"""
import concurrent.futures as cf
import json
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import duels

DATA = Path(os.environ['WORLD_PACK_DATA'])
OUT = DATA / 'win/survey.jsonl'
CACHE = DATA / 'win/survey-cache'  # per-round schema and raw model answer
MODEL = 'gpt-6.1-sol'

YN = {'type': 'string', 'enum': ['yes', 'no']}
S = {'type': 'string'}


def obj(**props):
    return {'type': 'object', 'additionalProperties': False, 'required': list(props), 'properties': props}


SCHEMA = obj(
    setting={'type': 'string', 'enum': ['rural', 'suburban', 'urban']},
    poles=obj(visible=YN, distance={'type': 'string', 'enum': ['near', 'far', 'near and far', 'not visible']},
              material={'type': 'string', 'enum': ['wood', 'concrete', 'metal', 'mixed', 'unclear', 'not visible']},
              shape=S, top_crossarm_insulators=S, markings=S),
    road=obj(surface={'type': 'string', 'enum': ['paved', 'dirt or gravel', 'no road visible']},
             lines_visible=YN, centre_line=S, edge_lines=S),
    bollards=obj(visible=YN, description=S),
    signs=obj(visible=YN, readable_text=YN, script_or_language=S, text=S),
    vegetation=S,
    terrain=obj(relief={'type': 'string', 'enum': ['flat', 'hilly', 'mountains']}, soil_colour=S),
    car=obj(visible=YN, parts=S, camera_generation_clues=S, blur_or_antenna=S),
    other=S,
    most_useful_clue=S,
    most_useful_frame={'type': 'integer'})

PROMPT = """These 4 images are views 90 degrees apart (frame 1 is the starting view, each next frame turns right) from one Google Street View
spot somewhere in the world. Survey WHAT IS ACTUALLY VISIBLE. Describe only what you can see in these images; write
'not visible' instead of guessing, and do not name or guess the country anywhere except in most_useful_clue.
- setting: rural, suburban or urban.
- poles: utility/electric/telephone poles. visible yes/no; distance near (clearly resolvable, roughly <50 m) or far;
  material; shape (round, square, H-frame, tapered, lattice...); top/crossarm/insulators; markings (paint bands, plates,
  stickers, numbers). Use 'not visible' text when no pole.
- road: surface; lines_visible yes/no; centre line colour and pattern (solid/dashed/double, white/yellow); edge lines.
- bollards: roadside posts/delineators only (not guardrails or fences); visible yes/no and description (colour, shape, reflectors).
- signs: any signs or written text; visible yes/no; readable_text yes only if you can actually read letters/words;
  script or language; the text you can read.
- vegetation: dominant trees or crops, in plain words.
- terrain: relief (flat, hilly, mountains) and soil colour where bare ground is visible.
- car: ONLY the Google Street View camera car or camera rig itself (its roof, bonnet, mast, shadow, antenna, rear at the
  bottom of frames). Other vehicles on the road do NOT count (mention them under other). Give generation clues
  (gen 3 / gen 4 / trekker / low cam), blur, antenna.
- other: other notable clues (house style, fences, guardrails, chevrons, plates, sun position...).
- most_useful_clue: ONE line, the single most useful visible clue for identifying the country, written as
  'what is visible -> what it points to'.
- most_useful_frame: frame number 1-4 where that clue is, 0 if none."""


def ask(images, rid):
    """curate.ask reads the last stdout line, but this model pretty-prints; read the final message file instead."""
    d = CACHE / str(rid)
    if not (d / 'out.json').exists():
        d.mkdir(parents=True, exist_ok=True)
        (d / 's.json').write_text(json.dumps(SCHEMA))
        args = [a for p in images for a in ('-i', str(p))]
        subprocess.run(['codex', 'exec', '--skip-git-repo-check', '--ignore-rules', '-s', 'read-only', '-m', MODEL,
                        '--output-schema', f'{d}/s.json', '-o', f'{d}/out.json', *args, '--', PROMPT],
                       capture_output=True, text=True, timeout=1200, cwd=d, stdin=subprocess.DEVNULL)
    return json.loads((d / 'out.json').read_text())


def one(r):
    images = duels.frames(r)
    if not images:
        return None
    try:
        ans = ask(images, r['id'])
    except Exception as e:
        print('fail', r['id'], repr(e)[:200], file=sys.stderr)
        return None
    return {'id': r['id'], 'model': MODEL, 'frames': [str(p) for p in images], 'survey': ans}


def main(limit=None):
    rounds = [r for r in json.loads((DATA / 'duels/rounds.json').read_text()) if r['map'] == 'A Competitive World']
    done = {json.loads(l)['id'] for l in OUT.read_text().splitlines()} if OUT.exists() else set()
    todo = [r for r in rounds if r['id'] not in done][:limit]
    print(len(rounds), 'rounds,', len(todo), 'to do', flush=True)
    with open(OUT, 'a') as f, cf.ThreadPoolExecutor(10) as pool:
        for n, rec in enumerate(pool.map(one, todo), 1):
            if rec:
                f.write(json.dumps(rec, ensure_ascii=False) + '\n')
                f.flush()
            if n % 20 == 0:
                print(n, flush=True)


if __name__ == '__main__':
    main(int(sys.argv[1]) if len(sys.argv) > 1 else None)
