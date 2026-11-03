#!/usr/bin/env bash
# Latest duels -> Sprint + private Training packs -> build -> patch bump -> commit+push.
set -euo pipefail
cd "$(dirname "$0")"
ROOT=$(cd ../.. && pwd)
set -a; source ~/.config/fieldwork/gg.env; set +a
export WORLD_PACK_DATA=/Users/sethmorton/Documents/Codex/2026-10-18/can-x20/work/world-map
export WORLD_PACK_INPUTS=$(dirname "$WORLD_PACK_DATA")
count() { node -e 'try{console.log(require(process.argv[1]).length)}catch{console.log(0)}' "$WORLD_PACK_DATA/duels/rounds.json"; }
before=$(count)
python3 duels.py fetch && python3 duels.py rounds
after=$(count)
PATH="$ROOT/.scratch/nocodex:$PATH" python3 sprint.py
# Only missing duel labels incur model cost. Pool labeling/refill stays explicitly opt-in.
if [[ -f "$WORLD_PACK_DATA/training/pack.json" ]]; then
  python3 label.py run --pool-limit 0 --all-duels --duel-limit 3000 --workers 2
  python3 training.py build
fi
cd "$ROOT"
npm run build
npm run check
version=$(npm version patch --no-git-tag-version)
git add package.json package-lock.json  # the pack itself lives in WORLD_PACK_DATA, outside the repo
git commit -m 'refresh: duel cards from latest rounds'
git push
echo "version: $version"
echo "new rounds: $((after - before))"
node --input-type=module -e '
import {readFileSync,readdirSync,statSync} from "node:fs";
import {makeNextSet} from "./src/next-set.mjs";
const pack=JSON.parse(readFileSync(process.env.WORLD_PACK_DATA+"/sprint/pack.json","utf8"));
const f=readdirSync(".scratch").filter(n=>n.startsWith("attempts")&&n.endsWith(".json")).map(n=>".scratch/"+n).sort((a,b)=>statSync(b).mtimeMs-statSync(a).mtimeMs)[0];
const set=makeNextSet(pack,f?JSON.parse(readFileSync(f,"utf8")):[],{size:5});
for(const l of set.selectedLocations.slice(0,5)){const s=pack.skills.find(s=>s.id===l.skillIds[0]);console.log(s.cost,s.id,"|",s.stakes);}'
