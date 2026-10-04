import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JobStore, companyKey } from './src/jobStore.js';
import { resumeToText, buildProfile, ResumeError } from './src/resume.js';
import { scoreJobs } from './src/matcher.js';
import { SOURCES, parseCareersUrl } from './src/sources/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp(store) {
  const app = express();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/api/status', (req, res) => res.json(store.status()));

  app.get('/api/jobs', (req, res) => {
    if (store.isStale() && !store.refreshing) store.refresh().catch((err) => console.error('Refresh failed:', err));
    res.json({ status: store.status(), jobs: store.publicJobs() });
  });

  app.post('/api/refresh', (req, res) => {
    store.refresh().catch((err) => console.error('Refresh failed:', err));
    res.status(202).json(store.status());
  });

  app.post('/api/match', (req, res, next) => {
    upload.single('resume')(req, res, (err) => {
      if (err) {
        const msg = err.code === 'LIMIT_FILE_SIZE' ? 'That file is larger than 5 MB.' : err.message;
        return res.status(400).json({ error: msg });
      }
      next();
    });
  }, async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Please choose a resume file to upload.' });
      const text = await resumeToText(req.file.buffer, req.file.originalname, req.file.mimetype);
      const profile = buildProfile(text, { targetRole: String(req.body.targetRole || '').slice(0, 120) });
      if (store.refreshing && store.jobs.length === 0) await store.refreshing;
      const matches = scoreJobs(text, profile, store.index);
      // The resume is only held in memory for this request; nothing is written to disk.
      const { titleTokens, targetTokens, ...publicProfile } = profile;
      res.json({ profile: publicProfile, matches });
    } catch (err) {
      if (err instanceof ResumeError) return res.status(422).json({ error: err.message });
      console.error(err);
      res.status(500).json({ error: 'Something went wrong while reading your resume.' });
    }
  });

  app.get('/api/companies', async (req, res) => {
    const list = await store.loadCompanies();
    res.json({
      companies: list.map((c) => ({ ...c, key: companyKey(c) })),
      platforms: Object.entries(SOURCES).map(([id, s]) => ({ id, label: s.label, fields: s.fields, example: s.example })),
      demo: store.demo,
    });
  });

  app.post('/api/companies', async (req, res) => {
    try {
      let input = req.body || {};
      if (input.careersUrl) {
        const parsed = parseCareersUrl(String(input.careersUrl));
        if (!parsed) {
          return res.status(400).json({ error: 'That link is not a supported careers page. Supported: Greenhouse, Lever, SmartRecruiters, Ashby, Workday and Workable.' });
        }
        input = { ...parsed, name: input.name };
      }
      const company = await store.addCompany(input);
      res.status(201).json({ company: { ...company, key: companyKey(company) } });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/companies/:key', async (req, res) => {
    try {
      await store.removeCompany(req.params.key);
      res.status(204).end();
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  return app;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const demo = process.env.DEMO === '1';
  const store = new JobStore({ demo, ttlMs: Number(process.env.CACHE_HOURS || 6) * 3600 * 1000 });
  const fresh = await store.init();
  if (!fresh) store.refresh().catch((err) => console.error('Refresh failed:', err));
  const port = Number(process.env.PORT || 3000);
  createApp(store).listen(port, () => {
    console.log(`Ireland Job Matcher running at http://localhost:${port}${demo ? ' (demo data)' : ''}`);
  });
}
