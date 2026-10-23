import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { makeNextSet } from './next-set.mjs';

async function main() {
  const [packPath,resultsPath,outputPath,size] = process.argv.slice(2);
  if(!packPath||!resultsPath||!outputPath) throw new Error('Usage: node plan.mjs pack.json results.json next-set.json [size]');
  const pack = JSON.parse(await readFile(packPath,'utf8'));
  const results = JSON.parse(await readFile(resultsPath,'utf8'));
  const next = makeNextSet(pack,Array.isArray(results)?results:results.attempts,{size:size?Number(size):5});
  await writeFile(outputPath,JSON.stringify(next,null,2)+'\n');
  process.stdout.write(JSON.stringify({phase:next.phase,focus:next.focus.map(skill=>skill.title),locations:next.selectedLocations.length,output:outputPath})+'\n');
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) main().catch(error=>{console.error(error.message);process.exitCode=1});
