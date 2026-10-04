// Workday career sites (*.myworkdayjobs.com) expose a JSON API used by their own front end.
// company: { host: "acme.wd3.myworkdayjobs.com", tenant: "acme", site: "External" }
import { fetchJson, mapLimit } from './http.js';
import { htmlToText } from '../text.js';

export async function fetchWorkday(company, { maxJobs = 200 } = {}) {
  const base = `https://${company.host}/wday/cxs/${encodeURIComponent(company.tenant)}/${encodeURIComponent(company.site)}`;
  const postings = [];
  for (let offset = 0; offset < maxJobs; offset += 20) {
    const page = await fetchJson(`${base}/jobs`, {
      method: 'POST',
      body: { appliedFacets: {}, limit: 20, offset, searchText: company.searchText || 'Ireland' },
    });
    const items = page.jobPostings || [];
    postings.push(...items);
    if (items.length < 20 || postings.length >= (page.total ?? Infinity)) break;
  }
  const details = await mapLimit(postings, 4, (p) => fetchJson(`${base}${p.externalPath}`, { retries: 0 }));
  return postings.map((p, i) => {
    const info = (details[i] && !details[i].error && details[i].jobPostingInfo) || {};
    return {
      id: `wd:${company.tenant}:${info.jobReqId || p.bulletFields?.[0] || p.externalPath}`,
      title: info.title || p.title,
      company: company.name,
      url: info.externalUrl || `https://${company.host}/${company.site}${p.externalPath}`,
      locationStrings: [p.locationsText, info.location, ...(info.additionalLocations || []), info.country?.descriptor],
      remote: /remote/i.test(info.remoteType || ''),
      department: '',
      employmentType: info.timeType || '',
      postedAt: info.startDate || null,
      postedLabel: p.postedOn || '',
      description: htmlToText(info.jobDescription || ''),
    };
  });
}
