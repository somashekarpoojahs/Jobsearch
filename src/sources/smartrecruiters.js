// SmartRecruiters public Posting API: https://developers.smartrecruiters.com/docs/posting-api
import { fetchJson, mapLimit } from './http.js';
import { htmlToText } from '../text.js';

const BASE = 'https://api.smartrecruiters.com/v1/companies';

export async function fetchSmartRecruiters(company, { maxJobs = 300 } = {}) {
  const id = encodeURIComponent(company.slug);
  const postings = [];
  for (let offset = 0; offset < maxJobs; offset += 100) {
    const page = await fetchJson(`${BASE}/${id}/postings?country=ie&limit=100&offset=${offset}`);
    postings.push(...(page.content || []));
    if (!page.content?.length || postings.length >= (page.totalFound ?? 0)) break;
  }
  // The list endpoint has no description, so fetch details (a few at a time).
  const details = await mapLimit(postings, 5, (p) => fetchJson(String(p.ref || '').startsWith(`${BASE}/`) ? p.ref : `${BASE}/${id}/postings/${encodeURIComponent(p.id)}`, { retries: 0 }));
  return postings.map((p, i) => {
    const d = details[i] && !details[i].error ? details[i] : {};
    const sections = d.jobAd?.sections || {};
    const loc = p.location || {};
    return {
      id: `sr:${company.slug}:${p.id}`,
      title: p.name,
      company: company.name || p.company?.name,
      url: d.postingUrl || `https://jobs.smartrecruiters.com/${company.slug}/${p.id}`,
      locationStrings: [loc.fullLocation, [loc.city, loc.region].filter(Boolean).join(', ')],
      countryCodes: [loc.country].filter(Boolean),
      remote: Boolean(loc.remote),
      department: p.department?.label || p.function?.label || '',
      employmentType: p.typeOfEmployment?.label || '',
      postedAt: p.releasedDate || null,
      description: ['jobDescription', 'qualifications', 'additionalInformation']
        .map((k) => htmlToText(sections[k]?.text || '')).filter(Boolean).join('\n\n'),
    };
  });
}
