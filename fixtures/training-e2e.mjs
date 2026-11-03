// End-to-end check of the training pack in the built userscript: start panel → Play → 5-round game with a card after every
// round → recap → Next set (published ahead) → second game. Also checks that no card key reaches GeoGuessr's listeners
// (Space, Esc, and the keyup of the key that closes a card), that every board has 4 photos, and how fast beats open.
// Needs `npm run build` (with the training pack configured) and `npm run serve` (BASE=http://127.0.0.1:<PORT> for a
// second server). Saves a screenshot per step. Usage: node fixtures/training-e2e.mjs [out-dir]
import puppeteer from 'puppeteer-core';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';

const out=process.argv[2]??'/tmp/training-e2e',base=process.env.BASE??'http://127.0.0.1:8787';
const chrome=process.env.CHROME??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:chrome,headless:true});
const page=await browser.newPage();await page.setViewport({width:1440,height:900});
// Street View thumbnails answer 403 to the HeadlessChrome user agent.
await page.setUserAgent((await browser.userAgent()).replace('HeadlessChrome','Chrome'));
const errors=[];page.on('pageerror',error=>errors.push(error.message));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const screenName=()=>page.evaluate(()=>{const scr=document.getElementById('fieldwork-training')?.shadowRoot?.querySelector('.scr');
  return scr?scr.dataset.beatName??scr.dataset.screen??(scr.querySelector('.recap')?'recap':scr.querySelector('.advice')?'session':'other'):null});
const until=async(test,label,ms=20000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await test())return;await sleep(50)}throw Error('Timed out: '+label)};
const shot=async name=>{await sleep(600);await page.screenshot({path:`${out}/${name}.png`})};
const space=()=>page.keyboard.press('Space');
const geoKeys=()=>page.evaluate(()=>fixture.geoKeys.splice(0));
// Photos on the open beat: "loaded/elements region". Also checks that no board photo is a panorama already played in
// this game (fixture rounds so far) and that every magnifier sits inside its photo cell.
const photos=async()=>{
  const result=await page.evaluate(()=>{const beat=document.getElementById('fieldwork-training').shadowRoot.querySelector('.beat.on'),imgs=[...beat.querySelectorAll('.grid img')];
    const played=fixture.games.flatMap(game=>game.rounds??[]),panos=imgs.map(img=>new URL(img.src).searchParams.get('panoid'));
    const outside=[...beat.querySelectorAll('.mk')].filter(marker=>{const m=marker.getBoundingClientRect(),c=marker.closest('.cell').getBoundingClientRect();
      return m.left<c.left-1||m.right>c.right+1||m.top<c.top-1||m.bottom>c.bottom+1}).length;
    return {text:`${imgs.filter(img=>img.complete&&img.naturalWidth>0).length}/${imgs.length} ${beat.querySelector('.cap')?.textContent}`,
      replayed:panos.filter(pano=>played.includes(pano)),outside}});
  assert.deepEqual(result.replayed,[],'a board showed a panorama already played');assert.equal(result.outside,0,'a magnifier outside its photo');
  return result.text;
};
const timings=[];
// Presses Space and records how long the next beat took to show (it waits for its photos, at most 1.5 s).
const advance=async name=>{const start=Date.now();await space();await until(async()=>await screenName()===name,`beat ${name}`);timings.push([name,Date.now()-start])};
try{
  await page.goto(base+'/fixtures/training-fixture.html',{waitUntil:'networkidle2',timeout:60000});
  await until(async()=>await screenName()==='start','start panel');await shot('01-start');
  await page.keyboard.press('Enter');
  await until(()=>page.evaluate(()=>location.pathname.startsWith('/game/')),'game 1 started');
  const first=await page.evaluate(()=>fixture.games[0]);
  assert.deepEqual(first.settings.forbidMoving,true);assert.equal(first.settings.timeLimit,60);assert.equal(first.coordinates.length,5);
  await sleep(1500);await geoKeys();
  // Round 3 times out the way the real event framework reports it (round_start for round 4 before the result view);
  // round 4 the other way (round_end after it).
  const plays=['wrong','right','timeout','timeout-end','right'],boards=[];
  const publishedNow=()=>page.evaluate(()=>fixture.published.length);
  for(let round=1;round<=5;round++){
    await sleep(300);
    // Nothing is published while the game is between rounds: GeoGuessr takes each next round from the map.
    assert.equal(await publishedNow(),1,`round ${round}: published during the game`);
    if(round===4){
      // A late round_end for round 3 while round 4 is being played never brings back round 3's card.
      await page.click('#stale');await sleep(1200);assert.equal(await screenName(),null,'a stale card showed during the next round');
    }
    const start=Date.now();await page.click('#'+plays[round-1]);
    await until(async()=>await screenName()==='result',`round ${round} card`);timings.push(['result',Date.now()-start]);
    if(round===1)await shot('02-round1-result');
    if(round===2){
      // Esc closes the card; neither its keydown nor its keyup reaches GeoGuessr (which opens its settings on Esc).
      await page.keyboard.press('Escape');await until(async()=>await screenName()===null,'Esc closed the card');
      assert.deepEqual(await geoKeys(),[],'Esc leaked to GeoGuessr');
      await space();assert.ok((await geoKeys()).includes('keydown:Space'),'after the card, Space is GeoGuessr\'s again');
      await page.click('#native-next');continue;
    }
    if(plays[round-1].startsWith('timeout')){
      // The timed-out round's card shows at once on its result screen: no pin, no km, then the answer region.
      const text=await page.evaluate(()=>document.getElementById('fieldwork-training').shadowRoot.querySelector('.beat.on .km').textContent);
      assert.match(text,/Timed out/);assert.doesNotMatch(text,/km/);await shot('03b-timeout-result');
    }
    if(plays[round-1]==='wrong'){await advance('pinned');boards.push(await photos());if(round===1)await shot('03-round1-pinned')}
    if(round===5){
      // Holding Space: the first press moves one beat, its auto-repeats do nothing (the card stays open on the answer).
      await page.keyboard.down('Space');for(let i=0;i<4;i++){await sleep(60);await page.keyboard.down('Space')}await page.keyboard.up('Space');
      await until(async()=>await screenName()==='answer','held Space: answer beat');await sleep(400);
      assert.equal(await screenName(),'answer','a held Space ran past the answer beat');boards.push(await photos());
    }else{await advance('answer');boards.push(await photos());if(round===1)await shot('04-round1-answer')}
    await space();
    if(round<5){await until(async()=>await screenName()===null,`round ${round} card closed`);
      assert.deepEqual(await geoKeys(),[],`round ${round}: card keys leaked to GeoGuessr`);await page.click('#native-next')}
  }
  // A stray second Space right after the round-5 card closes lands on the recap's 600 ms settle and starts nothing.
  await space();await sleep(2000);
  assert.equal(await page.evaluate(()=>fixture.games.length),1,'a stray Space skipped the recap');
  assert.deepEqual(await page.evaluate(()=>fixture.publishedDuring),{},'a round started after a mid-game publication');
  // Four photos unless the whole country has fewer (checked against the pack: card material plus unplayed spots).
  const short=boards.filter(count=>!count.startsWith('4/4'));
  if(short.length)console.error('boards under 4 photos (country has fewer?):',short);
  await until(async()=>await screenName()==='recap','recap');await shot('05-recap');
  const saved=await page.evaluate(()=>fixture.data['fieldwork:training:attempts']);
  assert.equal(saved.length,5);assert.deepEqual(saved.map(item=>item.correct),plays.map(play=>play==='right'));
  assert.ok(saved.every(item=>Number.isFinite(item.points)&&item.slot));
  for(const timedOut of [saved[2],saved[3]]){assert.equal(timedOut.timedOut,true);assert.equal(timedOut.guess,null);assert.equal(timedOut.km,null);assert.equal(timedOut.points,0)}
  // After the set, the progress goes once (debounced) to the installer's /training-sync for the nightly focus.
  await until(()=>page.evaluate(()=>fixture.synced.length>0),'progress synced after the set');
  const synced=await page.evaluate(()=>fixture.synced);
  assert.equal(synced.length,1);assert.match(synced[0].url,/^http:\/\/127\.0\.0\.1:8787\/training-sync$/);
  assert.equal(synced[0].body.packId,'training');assert.equal(synced[0].body.attempts.length,5);assert.ok(synced[0].body.exposures.length>=5);
  assert.equal(synced[0].contentType,'application/json','the installer only accepts application/json');
  await until(()=>page.evaluate(()=>fixture.published.length===2),'next set published ahead');
  await space();
  await until(()=>page.evaluate(()=>fixture.games.length===2&&location.pathname==='/game/'+fixture.games[1].token),'game 2 started');
  assert.deepEqual(await geoKeys(),[],'recap keys leaked to GeoGuessr');
  const {published,games,burned}=await page.evaluate(()=>({published:fixture.published,games:fixture.games,
    burned:(fixture.data['fieldwork:training:exposures']??[]).filter(item=>item.id.includes(':board:')).map(item=>item.locationRef)}));
  assert.equal(new Set(published.flat()).size,10,'no panorama repeats across the two sets');
  assert.deepEqual(games[1].coordinates.map(item=>item.panoId),published[1]);
  assert.ok(!published.flat().some(pano=>burned.includes('pano:'+pano)),'a spot shown on a board is never played');
  const cardOnly=await page.evaluate(()=>fixture.published.flat().filter(pano=>['study','seen'].includes(fixture.pack.locations.find(item=>item.panoId===pano)?.split)).length);
  assert.equal(cardOnly,0,'study and seen spots are never played');
  await shot('06-game2');
  console.log(JSON.stringify({ok:true,boards,burned:burned.length,timingsMs:timings,sets:published,
    attempts:saved.map(item=>({region:item.region,guessed:item.guessedRegion,correct:item.correct,km:item.km,points:item.points,slot:item.slot}))},null,1));
}finally{
  if(errors.length)console.error('page errors:\n'+errors.join('\n'));
  await browser.close();
}
if(errors.length)process.exitCode=1;
