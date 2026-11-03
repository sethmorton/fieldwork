// Renders every training screen from fixtures/game-fixture.html?mode=training in headless Chrome and saves screenshots.
// Needs `npm run serve` (or node scripts/serve.mjs) running and dist/preview-ui.js built.
// Usage: node fixtures/training-shots.mjs <out-dir> [extra query, e.g. pack=/dist/training-pack.json]
import puppeteer from 'puppeteer-core';
import {mkdir} from 'node:fs/promises';

const out=process.argv[2]??'/tmp/training-shots',extra=process.argv[3]?'&'+process.argv[3]:'';
const chrome=process.env.CHROME??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const shots=[['right-1','screen=right'],['right-2','screen=right&beat=1'],['wrong-1','screen=wrong&region=Mid-Atlantic&pin=South Atlantic'],
  ['wrong-2','screen=wrong&region=Mid-Atlantic&pin=South Atlantic&beat=1'],['wrong-3','screen=wrong&region=Mid-Atlantic&pin=South Atlantic&beat=2'],
  ['wrong-meta','screen=wrong&region=Mid-Atlantic&pin=South Atlantic&beat=2&open=0&manual'],['recap','screen=recap'],['session','screen=session'],
  ['start','screen=start'],['look','screen=look'],['debug','screen=debug']];
await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--window-size=1440,900']});
const errors=[];
try{
  for(const [name,query] of (process.env.ONLY?shots.filter(([name])=>process.env.ONLY.split(',').includes(name)):shots)){
    const page=await browser.newPage();await page.setViewport({width:1440,height:900});
    // Street View thumbnails answer 403 to the HeadlessChrome user agent.
    await page.setUserAgent((await browser.userAgent()).replace('HeadlessChrome','Chrome'));
    page.on('pageerror',error=>errors.push(`${name}: ${error.message}`));
    page.on('console',message=>{if(message.type()==='error'&&!/Failed to load resource/.test(message.text()))errors.push(`${name}: ${message.text()}`)});
    await page.goto(`${process.env.BASE??'http://127.0.0.1:8787'}/fixtures/game-fixture.html?mode=training&${query}${extra}`,{waitUntil:'networkidle2',timeout:60000});
    await new Promise(resolve=>setTimeout(resolve,1800));
    const state=await page.evaluate(()=>{const scr=document.getElementById('fieldwork-training')?.shadowRoot?.querySelector('.scr');
      return {title:document.title,beat:scr?.dataset.beatName??null,images:[...(scr?.querySelectorAll('img')??[])].filter(img=>img.offsetParent!==null||img.closest('.beat.on')).map(img=>img.complete&&img.naturalWidth>0)}});
    await page.screenshot({path:`${out}/${name}.png`});
    console.log(name,JSON.stringify({...state,images:`${state.images.filter(Boolean).length}/${state.images.length} loaded`}));
    await page.close();
  }
}finally{await browser.close()}
if(errors.length){console.error(errors.join('\n'));process.exitCode=1}
