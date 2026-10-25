import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

// A standalone, read-only atlas of a sprint pack: one HTML file with the bundle, styles and clue data inline.
// Given attempts, it is a progress snapshot as of the last attempt; without them every clue shows as new.
export async function buildAtlasPage(pack,outDir,attempts=[]){
  const data={title:pack.title,coverageSummary:pack.coverageSummary,skills:pack.skills,atlas:pack.atlas},progress=attempts.length>0;
  const {outputFiles:[bundle]}=await build({write:false,bundle:true,format:'iife',target:'es2022',minify:true,define:{PACK:JSON.stringify(data),ATTEMPTS:JSON.stringify(attempts)},
    stdin:{contents:`import {renderAtlas} from './src/atlas.mjs';renderAtlas(document.body,PACK,ATTEMPTS,{progress:${progress}});`,resolveDir:fileURLToPath(new URL('..',import.meta.url))}});
  const note=progress?`Progress snapshot from ${attempts.map(attempt=>attempt.occurredAt).sort().at(-1).slice(0,10)}. Live progress is in the userscript.`
    :'Every clue in the pack, shown as new. Your progress lives in the Fieldwork userscript: open the atlas there to see it.';
  // `</` occurs only inside string literals, where `<\/` means the same and cannot close the script element.
  const script=bundle.text.replaceAll('</','<\\/');
  await mkdir(outDir,{recursive:true});
  await writeFile(`${outDir}/index.html`,`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Field atlas · A Competitive World</title><style>body{max-width:1400px;margin:0 auto;padding:16px;background:#eff6f8;font:13px/1.4 Arial,sans-serif;color:#496b79}</style>
<p>${note}</p>
<script>${script}</script>
`);
}
