import test from 'node:test';
import assert from 'node:assert/strict';
import { setFetch, resetFetch } from '../src/sources/http.js';
import { SOURCES, parseCareersUrl } from '../src/sources/index.js';
import { normaliseJob } from '../src/jobStore.js';

/** Mock fetch: routes is a list of [regex, responseBody]. */
function mock(routes) {
  const calls = [];
  setFetch(async (url, opts) => {
    calls.push({ url, opts });
    const hit = routes.find(([re]) => re.test(url));
    if (!hit) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => (typeof hit[1] === 'function' ? hit[1](url, opts) : hit[1]) };
  });
  return calls;
}

test.afterEach(() => resetFetch());

test('Greenhouse: decodes encoded HTML and reads offices', async () => {
  mock([[/boards-api\.greenhouse\.io\/v1\/boards\/acme\/jobs\?content=true/, { jobs: [
    { id: 1, title: 'Backend Engineer', absolute_url: 'https://boards.greenhouse.io/acme/jobs/1', updated_at: '2026-09-30T10:00:00Z',
      location: { name: 'Dublin' }, offices: [{ name: 'Dublin', location: 'Dublin, Ireland' }], departments: [{ name: 'Engineering' }],
      content: '&lt;p&gt;We use &lt;strong&gt;Python&lt;/strong&gt; &amp;amp; Go.&lt;/p&gt;' },
    { id: 2, title: 'AE', absolute_url: 'x', location: { name: 'Dublin, CA' }, content: '' },
  ] }]]);
  const raw = await SOURCES.greenhouse.fetch({ name: 'Acme', slug: 'acme' });
  assert.equal(raw.length, 2);
  assert.equal(raw[0].description, 'We use Python & Go.');
  const jobs = raw.map((r) => normaliseJob(r)).filter(Boolean);
  assert.equal(jobs.length, 1);
  assert.deepEqual(jobs[0].places, ['Dublin']);
  assert.equal(jobs[0].department, 'Engineering');
});

test('Lever: combines description and lists, supports EU region', async () => {
  const calls = mock([[/api\.eu\.lever\.co\/v0\/postings\/acme\?mode=json/, [
    { id: 'abc', text: 'Data Analyst', hostedUrl: 'https://jobs.eu.lever.co/acme/abc', createdAt: 1790000000000,
      categories: { location: 'Cork, Ireland', team: 'Data', commitment: 'Full-time' }, workplaceType: 'hybrid',
      descriptionPlain: 'Join us.', lists: [{ text: 'Requirements', content: '<li>SQL</li><li>Tableau</li>' }], additionalPlain: '' },
  ]]]);
  const raw = await SOURCES.lever.fetch({ name: 'Acme', slug: 'acme', region: 'eu' });
  assert.match(calls[0].url, /api\.eu\.lever\.co/);
  assert.match(raw[0].description, /Requirements\n• SQL\n• Tableau/);
  assert.deepEqual(normaliseJob(raw[0]).places, ['Cork']);
});

test('SmartRecruiters: filters to Ireland and fetches each posting for its description', async () => {
  const calls = mock([
    [/postings\?country=ie/, { totalFound: 1, content: [{ id: '744', name: 'QA Engineer', ref: 'https://api.smartrecruiters.com/v1/companies/Acme/postings/744',
      releasedDate: '2026-09-01T00:00:00Z', location: { city: 'Galway', country: 'ie', fullLocation: 'Galway, Ireland' },
      typeOfEmployment: { label: 'Full-time' } }] }],
    [/postings\/744$/, { postingUrl: 'https://jobs.smartrecruiters.com/Acme/744-qa', jobAd: { sections: {
      jobDescription: { text: '<p>Test automation with Selenium.</p>' }, qualifications: { text: '<p>Java</p>' } } } }],
  ]);
  const raw = await SOURCES.smartrecruiters.fetch({ name: 'Acme', slug: 'Acme' });
  assert.equal(calls.length, 2);
  assert.equal(raw[0].url, 'https://jobs.smartrecruiters.com/Acme/744-qa');
  assert.match(raw[0].description, /Selenium[\s\S]*Java/);
  assert.equal(normaliseJob(raw[0]).places[0], 'Galway');
});

test('Ashby: reads secondary locations and remote flag', async () => {
  mock([[/api\.ashbyhq\.com\/posting-api\/job-board\/acme/, { jobs: [
    { id: 'u1', title: 'Platform Engineer', jobUrl: 'https://jobs.ashbyhq.com/acme/u1', location: 'London',
      secondaryLocations: [{ location: 'Dublin' }], isRemote: false, publishedAt: '2026-09-20T00:00:00Z', descriptionPlain: 'Kubernetes' },
    { id: 'u2', title: 'Hidden', isListed: false, location: 'Dublin' },
  ] }]]);
  const raw = await SOURCES.ashby.fetch({ name: 'Acme', slug: 'acme' });
  assert.equal(raw.length, 1);
  assert.deepEqual(normaliseJob(raw[0]).places, ['Dublin']);
});

test('Workday: pages through search results and reads job details', async () => {
  const calls = mock([
    [/\/wday\/cxs\/acme\/External\/jobs$/, (url, opts) => {
      const { offset } = JSON.parse(opts.body);
      const page = offset === 0 ? Array.from({ length: 20 }, (_, i) => ({ title: `Job ${i}`, externalPath: `/job/Dublin/Job_${i}`, locationsText: 'Dublin, Ireland' }))
        : [{ title: 'Job 20', externalPath: '/job/Cork/Job_20', locationsText: 'Cork, Ireland' }];
      return { total: 21, jobPostings: page };
    }],
    [/\/wday\/cxs\/acme\/External\/job\//, (url) => ({ jobPostingInfo: { title: 'Detail', jobReqId: url.split('_').pop(),
      jobDescription: '<p>Excel and SAP</p>', location: url.includes('Cork') ? 'Cork, Ireland' : 'Dublin, Ireland',
      externalUrl: `https://acme.wd3.myworkdayjobs.com/External${new URL(url).pathname.split('External')[1]}` } })],
  ]);
  const raw = await SOURCES.workday.fetch({ name: 'Acme', host: 'acme.wd3.myworkdayjobs.com', tenant: 'acme', site: 'External' });
  assert.equal(raw.length, 21);
  assert.equal(calls.filter((c) => c.opts.method === 'POST').length, 2);
  assert.equal(JSON.parse(calls[0].opts.body).searchText, 'Ireland');
  assert.equal(raw[20].description, 'Excel and SAP');
  assert.deepEqual(normaliseJob(raw[20]).places, ['Cork']);
});

test('Workable: reads city/country', async () => {
  mock([[/apply\.workable\.com\/api\/v1\/widget\/accounts\/acme/, { name: 'Acme', jobs: [
    { title: 'Designer', shortcode: 'AB12', url: 'https://apply.workable.com/j/AB12', city: 'Galway', country: 'Ireland', description: '<p>Figma</p>' },
  ] }]]);
  const raw = await SOURCES.workable.fetch({ name: 'Acme', slug: 'acme' });
  assert.equal(normaliseJob(raw[0]).places[0], 'Galway');
});

test('HTTP errors propagate so the store can report the failing company', async () => {
  mock([]);
  await assert.rejects(SOURCES.greenhouse.fetch({ name: 'Nope', slug: 'nope' }), /HTTP 404/);
});

test('parseCareersUrl understands each supported careers page', () => {
  assert.deepEqual(parseCareersUrl('https://boards.greenhouse.io/stripe'), { ats: 'greenhouse', slug: 'stripe' });
  assert.deepEqual(parseCareersUrl('https://job-boards.eu.greenhouse.io/acme/jobs/123'), { ats: 'greenhouse', slug: 'acme' });
  assert.deepEqual(parseCareersUrl('https://boards.greenhouse.io/embed/job_board?for=acme'), { ats: 'greenhouse', slug: 'acme' });
  assert.deepEqual(parseCareersUrl('jobs.lever.co/palantir'), { ats: 'lever', slug: 'palantir' });
  assert.deepEqual(parseCareersUrl('https://jobs.eu.lever.co/acme'), { ats: 'lever', slug: 'acme', region: 'eu' });
  assert.deepEqual(parseCareersUrl('https://jobs.smartrecruiters.com/ServiceNow'), { ats: 'smartrecruiters', slug: 'ServiceNow' });
  assert.deepEqual(parseCareersUrl('https://jobs.ashbyhq.com/notion'), { ats: 'ashby', slug: 'notion' });
  assert.deepEqual(parseCareersUrl('https://apply.workable.com/acme/'), { ats: 'workable', slug: 'acme' });
  assert.deepEqual(parseCareersUrl('https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced'),
    { ats: 'workday', host: 'adobe.wd5.myworkdayjobs.com', tenant: 'adobe', site: 'external_experienced' });
  assert.equal(parseCareersUrl('https://example.com/careers'), null);
});
