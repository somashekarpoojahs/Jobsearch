import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'jobmatcher-'));
const { createApp } = await import('../server.js');
const { JobStore } = await import('../src/jobStore.js');

const store = new JobStore({ demo: true });
await store.init();
const server = createApp(store).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

test('GET /api/jobs returns Irish jobs without full descriptions', async () => {
  const data = await (await fetch(`${base}/api/jobs`)).json();
  assert.equal(data.status.demo, true);
  assert.ok(data.jobs.length >= 20);
  assert.ok(data.jobs.every((j) => !('description' in j) && j.places.length));
  assert.ok(!data.jobs.some((j) => /Dublin, CA|London/.test(j.location)), 'non-Irish jobs filtered out');
});

test('POST /api/match scores an uploaded resume', async () => {
  const body = new FormData();
  body.append('resume', new Blob([fs.readFileSync(new URL('./fixtures/resume-backend.txt', import.meta.url))], { type: 'text/plain' }), 'cv.txt');
  body.append('targetRole', 'Backend Engineer');
  const res = await fetch(`${base}/api/match`, { method: 'POST', body });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.profile.skills.includes('Python'));
  assert.equal(data.matches.length, store.jobs.length);
  const top = store.jobs.find((j) => j.id === data.matches[0].jobId);
  assert.match(top.title, /Backend/);
});

test('POST /api/match rejects missing or unsupported files', async () => {
  let res = await fetch(`${base}/api/match`, { method: 'POST', body: new FormData() });
  assert.equal(res.status, 400);
  const body = new FormData();
  body.append('resume', new Blob(['x']), 'photo.png');
  res = await fetch(`${base}/api/match`, { method: 'POST', body });
  assert.equal(res.status, 422);
  assert.match((await res.json()).error, /Unsupported file type/);
});

test('companies can be added from a careers URL and removed', async () => {
  let res = await fetch(`${base}/api/companies`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Acme', careersUrl: 'https://jobs.ashbyhq.com/acme' }),
  });
  assert.equal(res.status, 201);
  const { company } = await res.json();
  assert.equal(company.key, 'ashby:acme');

  res = await fetch(`${base}/api/companies`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Acme', careersUrl: 'https://jobs.ashbyhq.com/acme' }),
  });
  assert.equal(res.status, 400, 'duplicate rejected');

  res = await fetch(`${base}/api/companies`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Bad', careersUrl: 'https://example.com/jobs' }),
  });
  assert.equal(res.status, 400);

  res = await fetch(`${base}/api/companies/${encodeURIComponent('ashby:acme')}`, { method: 'DELETE' });
  assert.equal(res.status, 204);
  const list = await (await fetch(`${base}/api/companies`)).json();
  assert.ok(!list.companies.some((c) => c.key === 'ashby:acme'));
});
