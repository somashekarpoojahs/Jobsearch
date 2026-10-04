# Ireland Job Matcher

Upload your resume and see jobs in Ireland pulled straight from company careers pages. Each job gets a match percentage, the skills you have and the ones you are missing. You can filter by location (Dublin, Cork, Galway, Limerick, Belfast, remote and more), keyword, company, date posted and minimum match.

## Run it

You need Node.js 18.17 or newer.

```bash
npm install
npm start            # http://localhost:3000
```

The first start reads every company's careers page, which takes a minute or so. Results are cached in `data/jobs-cache.json` for 6 hours. Use **Refresh jobs** in the page to fetch again.

To try the site without network access, run demo mode. It uses sample jobs from fictional companies:

```bash
npm run demo
```

Settings come from environment variables:

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | Port to listen on |
| `CACHE_HOURS` | `6` | How long fetched jobs stay fresh |
| `DATA_DIR` | `./data` | Where the cache and your company list are saved |
| `DEMO` | unset | `1` uses the sample jobs |

## Where the jobs come from

Most companies host their careers page on an applicant tracking system with a public job feed. The app reads those feeds directly, so every listing links back to the company's own posting. Supported platforms:

- Greenhouse
- Lever
- SmartRecruiters
- Ashby
- Workday
- Workable

A starting list of about 40 employers with Irish offices is in `src/companies.default.json`. Open **Companies** in the page to see which careers pages were read, which failed and why. Add a company by pasting its careers page link, for example `https://boards.greenhouse.io/acme` or `https://acme.wd3.myworkdayjobs.com/External`. Your edited list is saved to `data/companies.json`.

Only jobs located in Ireland are kept. That includes the Republic and Northern Ireland, and remote roles open to Ireland. US towns that share an Irish name, such as Dublin in California or Ohio, are filtered out. Europe-wide remote roles are hidden unless you tick the box for them.

Companies with their own in-house careers sites, such as Google, Meta, Amazon and Microsoft, are not covered because they have no public feed.

## How the match percentage works

The resume is read in memory and is never saved. The score combines four parts:

| Part | What it measures | Weight |
| --- | --- | --- |
| Skills | Share of the skills named in the posting that also appear in your resume, from a dictionary of about 280 skills | up to 45% |
| Job title | How closely the job title matches titles on your resume, or the target role you type in | about 25% |
| Description fit | TF-IDF similarity between your resume and the whole posting | about 20% |
| Seniority | Your estimated years of experience against the years or level the job asks for | about 10% |

The skills weight shrinks when a posting names fewer than three recognisable skills. A large seniority gap lowers the whole score, so graduate roles rank low for experienced people and director roles rank low for juniors. Open **How this score was worked out** on any job to see each part.

## Project layout

```
server.js                 Express server and API
src/sources/              One adapter per careers platform
src/location.js           Decides whether a location is in Ireland and which city
src/resume.js             Reads PDF, DOCX and TXT resumes and builds a profile
src/skills.js             Skills dictionary
src/matcher.js            Match scoring
src/jobStore.js           Fetching, caching and the company list
public/                   The web page
data/sample-jobs.json     Fictional jobs for demo mode
test/                     Tests (npm test)
```

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/jobs` | Jobs in Ireland and fetch status |
| `GET` | `/api/status` | Fetch progress |
| `POST` | `/api/refresh` | Fetch all careers pages again |
| `POST` | `/api/match` | Multipart upload with `resume` and an optional `targetRole`; returns your profile and a score for every job |
| `GET` | `/api/companies` | Company list and supported platforms |
| `POST` | `/api/companies` | Add a company with `{ name, careersUrl }` |
| `DELETE` | `/api/companies/:key` | Remove a company |
