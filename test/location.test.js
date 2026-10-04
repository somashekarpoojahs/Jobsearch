import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyLocation } from '../src/location.js';

const c = (s, hints) => classifyLocation([s], hints);

test('recognises Irish cities and counties', () => {
  assert.deepEqual(c('Dublin, Ireland').places, ['Dublin']);
  assert.deepEqual(c('Ringaskiddy, Co. Cork').places, ['Cork']);
  assert.deepEqual(c('Leixlip, County Kildare').places, ['Kildare']);
  assert.deepEqual(c('Galway, IE').places, ['Galway']);
  assert.ok(c('Dublin or Cork').places.includes('Cork'));
});

test('rejects US and other towns that share an Irish name', () => {
  for (const s of ['Dublin, CA', 'Dublin, OH', 'Dublin, Ohio, United States', 'Waterford, MI', 'Cork, Ontario, Canada', 'London, UK', 'Remote - US']) {
    assert.equal(c(s).inIreland, false, s);
  }
});

test('keeps "Co." county abbreviations working', () => {
  assert.equal(c('Dublin, Co. Dublin').inIreland, true);
});

test('Northern Ireland is included and labelled', () => {
  const r = c('Belfast, Northern Ireland, United Kingdom');
  assert.equal(r.inIreland, true);
  assert.equal(r.northernIreland, true);
  assert.deepEqual(r.places, ['Belfast']);
});

test('remote roles', () => {
  assert.deepEqual(c('Remote - Ireland').places, ['Remote (Ireland)']);
  assert.equal(c('Remote, EMEA').europeRemote, true);
  assert.equal(c('Remote, EMEA').inIreland, false);
  assert.equal(c('Remote', { countryCodes: ['IE'] }).inIreland, true);
});

test('multi-location postings count when one location is in Ireland', () => {
  assert.deepEqual(c('Galway, Ireland; Boston, MA').places, ['Galway']);
  assert.equal(classifyLocation(['New York, NY', 'Dublin, Ireland']).inIreland, true);
});

test('country-only locations go to "Ireland (other)"', () => {
  assert.deepEqual(c('Ireland').places, ['Ireland (other)']);
});
