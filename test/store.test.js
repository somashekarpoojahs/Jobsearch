import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'jobstore-'));
const { JobStore, validateCompany } = await import('../src/jobStore.js');
const { setFetch, resetFetch } = await import('../src/sources/http.js');

test.afterEach(() => resetFetch());

test('refresh keeps Irish jobs, records failures and keeps earlier jobs for a failing company', async () => {
  fs.writeFileSync(path.join(process.env.DATA_DIR, 'companies.json'), JSON.stringify([
    { name: 'Good', ats: 'greenhouse', slug: 'good' },
    { name: 'Flaky', ats: 'ashby', slug: 'flaky' },
  ]));
  let flakyUp = true;
  setFetch(async (url) => {
    if (url.includes('/boards/good/')) {
      return { ok: true, status: 200, json: async () => ({ jobs: [
        { id: 1, title: 'Analyst', absolute_url: 'https://x/1', location: { name: 'Cork, Ireland' }, content: 'SQL' },
        { id: 2, title: 'Analyst', absolute_url: 'https://x/2', location: { name: 'Austin, TX' }, content: 'SQL' },
      ] }) };
    }
    if (url.includes('/job-board/flaky') && flakyUp) {
      return { ok: true, status: 200, json: async () => ({ jobs: [{ id: 'f1', title: 'Designer', jobUrl: 'https://y/1', location: 'Dublin, Ireland' }] }) };
    }
    return { ok: false, status: 503, json: async () => ({}) };
  });

  const store = new JobStore();
  await store.refresh();
  assert.equal(store.jobs.length, 2);
  assert.ok(store.sources.every((s) => s.ok));

  flakyUp = false;
  await store.refresh();
  const flaky = store.sources.find((s) => s.name === 'Flaky');
  assert.equal(flaky.ok, false);
  assert.match(flaky.error, /503/);
  assert.equal(flaky.stale, true);
  assert.equal(store.jobs.length, 2, 'earlier Flaky job kept');

  const reloaded = new JobStore();
  await reloaded.init();
  assert.equal(reloaded.jobs.length, 2, 'cache written to disk');
});

test('concurrent refresh calls share one run', async () => {
  const store = new JobStore();
  let calls = 0;
  setFetch(async () => { calls++; return { ok: true, status: 200, json: async () => ({ jobs: [] }) }; });
  await Promise.all([store.refresh(), store.refresh()]);
  assert.equal(calls, 2, 'one request per company, not per refresh call');
});

test('validateCompany rejects bad input', () => {
  assert.throws(() => validateCompany({ name: 'A', ats: 'myspace', slug: 'a' }), /Unsupported/);
  assert.throws(() => validateCompany({ name: 'A', ats: 'greenhouse', slug: '../etc' }), /unexpected characters/);
  assert.throws(() => validateCompany({ name: 'A', ats: 'workday', host: 'evil.com', tenant: 'a', site: 'b' }), /Workday host/);
  assert.deepEqual(validateCompany({ name: ' A ', ats: 'Lever', slug: 'a', region: 'eu' }), { name: 'A', ats: 'lever', slug: 'a', region: 'eu' });
});
