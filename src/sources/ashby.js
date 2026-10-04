// Ashby public job posting API: https://developers.ashbyhq.com/docs/public-job-posting-api
import { fetchJson } from './http.js';
import { htmlToText } from '../text.js';

export async function fetchAshby(company) {
  const data = await fetchJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(company.slug)}?includeCompensation=false`);
  return (data.jobs || []).filter((j) => j.isListed !== false).map((j) => ({
    id: `ashby:${company.slug}:${j.id}`,
    title: j.title,
    company: company.name,
    url: j.jobUrl || j.applyUrl,
    locationStrings: [
      j.location,
      ...(j.secondaryLocations || []).map((s) => s.location),
      j.address?.postalAddress?.addressLocality,
      j.address?.postalAddress?.addressCountry,
    ],
    remote: Boolean(j.isRemote) || j.workplaceType === 'Remote',
    department: [j.department, j.team].filter(Boolean).join(' · '),
    employmentType: j.employmentType || '',
    postedAt: j.publishedAt || null,
    description: j.descriptionPlain || htmlToText(j.descriptionHtml || ''),
  }));
}
