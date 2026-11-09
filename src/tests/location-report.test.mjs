import test from 'node:test';
import assert from 'node:assert/strict';
import {locationReport} from '../ui.mjs';

test('location reports prefill the issue form with public clue details only',()=>{
  const privateData={practiceMapId:'learner-map-secret',attempts:['attempt-secret'],progress:'progress-secret',cookies:'cookie-secret',token:'token-secret'};
  const pack={id:'pack & country',...privateData},location={id:'pano:abc+/=',panoId:'abc+/=',lat:60.720867,lng:16.795248,heading:136.73224,...privateData},skill={id:'world:lm:131',title:'Sweden — Short & outer lines',...privateData};
  const report=locationReport(pack,location,skill,'0.13.14.57'),url=new URL(report.url);
  const pano='https://www.google.com/maps/@?api=1&map_action=pano&pano=abc%2B%2F%3D&heading=136.73224';
  const where=`Pack: pack & country\nLocation: pano:abc+/=\npanoId: abc+/=\nCoordinates: 60.720867,16.795248\n${pano}`;
  assert.equal(url.origin+url.pathname,'https://github.com/sethmorton/fieldwork/issues/new');
  assert.equal(url.searchParams.get('template'),'location.yml');
  assert.equal(url.searchParams.get('title'),'Practice location: Sweden — Short & outer lines');
  assert.equal(url.searchParams.get('location'),where);
  assert.equal(url.searchParams.get('clue'),'world:lm:131 — Sweden — Short & outer lines');
  assert.equal(url.searchParams.get('version'),'0.13.14.57');
  assert.equal(report.text,`${where}\nClue: world:lm:131 — Sweden — Short & outer lines\nScript version: 0.13.14.57`);
  for(const secret of Object.values(privateData).flat())assert.ok(!decodeURIComponent(report.url).includes(secret)&&!report.text.includes(secret));
});
