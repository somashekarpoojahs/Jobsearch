// Loads the company list, fetches jobs from each careers page, keeps the ones in Ireland, and caches them.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES } from './sources/index.js';
import { mapLimit } from './sources/http.js';
import { classifyLocation } from './location.js';
import { buildIndex } from './matcher.js';
import { truncate } from './text.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const COMPANIES_FILE = path.join(DATA_DIR, 'companies.json');
const DEFAULT_COMPANIES = path.join(ROOT, 'src', 'companies.default.json');
const CACHE_FILE = path.join(DATA_DIR, 'jobs-cache.json');
// JOBS_FILE lets demo mode load any saved list of jobs instead of the bundled samples.
const SAMPLE_FILE = process.env.JOBS_FILE ? path.resolve(process.env.JOBS_FILE) : path.join(ROOT, 'data', 'sample-jobs.json');
const MAX_DESCRIPTION = 20000;

export function companyKey(c) {
  return `${c.ats}:${(c.slug || `${c.host}/${c.site}`).toLowerCase()}`;
}

export function validateCompany(input) {
  const c = { name: String(input.name || '').trim(), ats: String(input.ats || '').trim().toLowerCase() };
  const source = SOURCES[c.ats];
  if (!c.name) throw new Error('Company name is required.');
  if (!source) throw new Error(`Unsupported careers platform "${input.ats}".`);
  for (const f of source.fields) {
    const v = String(input[f] || '').trim();
    if (!v) throw new Error(`"${f}" is required for ${source.label}.`);
    if (!/^[A-Za-z0-9._-]+$/.test(v)) throw new Error(`"${f}" contains unexpected characters.`);
    c[f] = f === 'host' ? v.toLowerCase() : v;
  }
  if (c.ats === 'workday' && !/^[a-z0-9-]+\.wd\d+\.myworkdayjobs\.com$/.test(c.host)) {
    throw new Error('Workday host should look like company.wd5.myworkdayjobs.com');
  }
  if (input.region === 'eu') c.region = 'eu';
  return c;
}

/** Turn a source's raw job into the shape the app uses, or null when it is not in Ireland. */
export function normaliseJob(raw, { includeEuropeRemote = true } = {}) {
  const loc = classifyLocation(raw.locationStrings || [], { countryCodes: raw.countryCodes, remote: raw.remote });
  if (!loc.inIreland && !(includeEuropeRemote && loc.europeRemote)) return null;
  const locationLabel = [...new Set((raw.locationStrings || []).filter(Boolean).map((s) => s.trim()))].slice(0, 3).join(' · ');
  const description = String(raw.description || '').slice(0, MAX_DESCRIPTION);
  return {
    id: raw.id,
    title: String(raw.title || '').trim(),
    company: raw.company,
    url: raw.url,
    location: locationLabel || (loc.remote ? 'Remote' : 'Ireland'),
    places: loc.europeRemote ? ['Remote (Europe-wide)'] : loc.places,
    remote: loc.remote,
    europeRemote: loc.europeRemote,
    department: raw.department || '',
    employmentType: raw.employmentType || '',
    postedAt: raw.postedAt && !Number.isNaN(Date.parse(raw.postedAt)) ? new Date(raw.postedAt).toISOString() : null,
    snippet: truncate(description, 280),
    description,
  };
}

export class JobStore {
  constructor({ demo = false, ttlMs = 6 * 60 * 60 * 1000, concurrency = 6 } = {}) {
    this.demo = demo;
    this.ttlMs = ttlMs;
    this.concurrency = concurrency;
    this.jobs = [];
    this.index = buildIndex([]);
    this.sources = [];
    this.updatedAt = null;
    this.refreshing = null;
    this.progress = { done: 0, total: 0 };
  }

  async loadCompanies() {
    try {
      return JSON.parse(await fs.readFile(COMPANIES_FILE, 'utf8'));
    } catch {
      return JSON.parse(await fs.readFile(DEFAULT_COMPANIES, 'utf8'));
    }
  }

  async saveCompanies(list) {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(COMPANIES_FILE, JSON.stringify(list, null, 2));
  }

  async addCompany(input) {
    const company = validateCompany(input);
    const list = await this.loadCompanies();
    if (list.some((c) => companyKey(c) === companyKey(company))) throw new Error(`${company.name} is already in the list.`);
    list.push(company);
    await this.saveCompanies(list);
    return company;
  }

  async removeCompany(key) {
    const list = await this.loadCompanies();
    const next = list.filter((c) => companyKey(c) !== key);
    if (next.length === list.length) throw new Error('Company not found.');
    await this.saveCompanies(next);
    this.setJobs(this.jobs.filter((j) => j.sourceKey !== key), this.sources.filter((s) => s.key !== key), this.updatedAt);
  }

  setJobs(jobs, sources, updatedAt) {
    this.jobs = jobs;
    this.index = buildIndex(jobs);
    this.sources = sources;
    this.updatedAt = updatedAt;
  }

  /** Load from the disk cache (or demo data). Returns true when the cache is fresh. */
  async init() {
    if (this.demo) {
      const sample = JSON.parse(await fs.readFile(SAMPLE_FILE, 'utf8'));
      const jobs = sample.map((r) => ({ ...normaliseJob(r), sourceKey: `demo:${r.company}` })).filter((j) => j.id);
      const names = [...new Set(jobs.map((j) => j.company))];
      this.setJobs(jobs, names.map((n) => ({ key: `demo:${n}`, name: n, ats: 'demo', ok: true, count: jobs.filter((j) => j.company === n).length })), new Date().toISOString());
      return true;
    }
    try {
      const cache = JSON.parse(await fs.readFile(CACHE_FILE, 'utf8'));
      this.setJobs(cache.jobs || [], cache.sources || [], cache.updatedAt || null);
      return this.updatedAt && Date.now() - Date.parse(this.updatedAt) < this.ttlMs;
    } catch {
      return false;
    }
  }

  isStale() {
    return !this.updatedAt || Date.now() - Date.parse(this.updatedAt) > this.ttlMs;
  }

  /** Fetch every company's careers page. Concurrent calls share one refresh. */
  refresh() {
    if (this.demo) return Promise.resolve();
    if (!this.refreshing) {
      this.refreshing = this._refresh().finally(() => { this.refreshing = null; });
    }
    return this.refreshing;
  }

  async _refresh() {
    const companies = await this.loadCompanies();
    this.progress = { done: 0, total: companies.length };
    const results = await mapLimit(companies, this.concurrency, async (company) => {
      const key = companyKey(company);
      const started = Date.now();
      try {
        const raw = await SOURCES[company.ats].fetch(company);
        const jobs = raw.map((r) => normaliseJob(r)).filter(Boolean).map((j) => ({ ...j, sourceKey: key }));
        return { jobs, status: { key, name: company.name, ats: company.ats, ok: true, count: jobs.length, scanned: raw.length, ms: Date.now() - started } };
      } catch (err) {
        return { jobs: [], status: { key, name: company.name, ats: company.ats, ok: false, count: 0, error: err.message || String(err) } };
      } finally {
        this.progress.done++;
      }
    });
    const seen = new Set();
    const jobs = [];
    for (const r of results) {
      for (const j of r.jobs) if (!seen.has(j.id)) { seen.add(j.id); jobs.push(j); }
    }
    // Keep previous jobs for a company whose page failed this time, so a blip does not empty the list.
    const sources = results.map((r) => r.status);
    for (const s of sources) {
      if (!s.ok) {
        const old = this.jobs.filter((j) => j.sourceKey === s.key && !seen.has(j.id));
        if (old.length) { jobs.push(...old); s.count = old.length; s.stale = true; }
      }
    }
    this.setJobs(jobs, sources, new Date().toISOString());
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      await fs.writeFile(CACHE_FILE, JSON.stringify({ updatedAt: this.updatedAt, sources, jobs }));
    } catch (err) {
      console.warn('Could not write job cache:', err.message);
    }
  }

  status() {
    return {
      state: this.refreshing ? 'loading' : 'ready',
      demo: this.demo,
      updatedAt: this.updatedAt,
      progress: this.progress,
      sources: this.sources,
      jobCount: this.jobs.length,
    };
  }

  /** Jobs without the long description, for the browser. */
  publicJobs() {
    return this.jobs.map(({ description, sourceKey, ...rest }) => rest);
  }
}
