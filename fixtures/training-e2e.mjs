// End-to-end check of the training pack in the built userscript: start panel → Play → 5-round game with a card after every
// round → recap → Next set (published ahead) → second game. Needs `npm run build` (with the training pack configured)
// and `npm run serve`. Saves a screenshot per step. Usage: node fixtures/training-e2e.mjs [out-dir]
import puppeteer from 'puppeteer-core';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';

const out=process.argv[2]??'/tmp/training-e2e';
const chrome=process.env.CHROME??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:chrome,headless:true});
const page=await browser.newPage();await page.setViewport({width:1440,height:900});
await page.setUserAgent((await browser.userAgent()).replace('HeadlessChrome','Chrome'));
const errors=[];page.on('pageerror',error=>errors.push(error.message));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const shadow=selector=>page.evaluate(selector=>!!document.getElementById('fieldwork-training')?.shadowRoot?.querySelector(selector),selector);
const screenName=()=>page.evaluate(()=>{const scr=document.getElementById('fieldwork-training')?.shadowRoot?.querySelector('.scr');
  return scr?scr.dataset.beatName??scr.dataset.screen??(scr.querySelector('.recap')?'recap':scr.querySelector('.advice')?'session':'other'):null});
const until=async(test,label,ms=20000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await test())return;await sleep(150)}throw Error('Timed out: '+label)};
const shot=async name=>{await sleep(900);await page.screenshot({path:`${out}/${name}.png`})};
const space=()=>page.keyboard.press('Space');
try{
  await page.goto('http://127.0.0.1:8787/fixtures/training-fixture.html',{waitUntil:'networkidle2',timeout:60000});
  await until(async()=>await screenName()==='start','start panel');await shot('01-start');
  await page.keyboard.press('Enter');
  await until(()=>page.evaluate(()=>location.pathname.startsWith('/game/')),'game 1 started');
  const first=await page.evaluate(()=>fixture.games[0]);
  assert.deepEqual(first.settings.forbidMoving,true);assert.equal(first.settings.timeLimit,60);assert.equal(first.coordinates.length,5);
  const plays=['wrong','right','wrong','right','right'];
  for(let round=1;round<=5;round++){
    await sleep(300);await page.click('#'+plays[round-1]);
    await until(async()=>await screenName()==='result',`round ${round} card`);
    if(round===1)await shot('02-round1-result');
    await space();
    if(plays[round-1]==='wrong'){assert.equal(await screenName(),'pinned');if(round===1)await shot('03-round1-pinned');await space()}
    assert.equal(await screenName(),'answer');if(round===1)await shot('04-round1-answer');
    await space();
    if(round<5){await until(async()=>await screenName()===null,`round ${round} card closed`);await page.click('#native-next')}
  }
  await until(async()=>await screenName()==='recap','recap');await shot('05-recap');
  const saved=await page.evaluate(()=>fixture.data['fieldwork:training:attempts']);
  assert.equal(saved.length,5);assert.deepEqual(saved.map(item=>item.correct),plays.map(play=>play==='right'));
  assert.ok(saved.every(item=>Number.isFinite(item.points)&&item.elapsedMs>0&&item.slot));
  await until(()=>page.evaluate(()=>fixture.published.length===2),'next set published ahead');
  await space();
  await until(()=>page.evaluate(()=>fixture.games.length===2&&location.pathname==='/game/'+fixture.games[1].token),'game 2 started');
  const {published,games}=await page.evaluate(()=>({published:fixture.published,games:fixture.games}));
  assert.equal(new Set(published.flat()).size,10,'no panorama repeats across the two sets');
  assert.deepEqual(games[1].coordinates.map(item=>item.panoId),published[1]);
  const studyPlayed=await page.evaluate(()=>fixture.published.flat().filter(pano=>fixture.pack.locations.find(item=>item.panoId===pano)?.split==='study').length);
  assert.equal(studyPlayed,0,'study spots are never played');
  await shot('06-game2');
  console.log(JSON.stringify({ok:true,sets:published,attempts:saved.map(item=>({region:item.region,guessed:item.guessedRegion,correct:item.correct,km:item.km,points:item.points,slot:item.slot}))},null,1));
}finally{
  if(errors.length)console.error('page errors:\n'+errors.join('\n'));
  await browser.close();
}
if(errors.length)process.exitCode=1;
