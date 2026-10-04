// Workable public widget API: https://apply.workable.com/api/v1/widget/accounts/{slug}
import { fetchJson } from './http.js';
import { htmlToText } from '../text.js';

export async function fetchWorkable(company) {
  const data = await fetchJson(`https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(company.slug)}?details=true`);
  return (data.jobs || []).map((j) => ({
    id: `workable:${company.slug}:${j.shortcode || j.id}`,
    title: j.title,
    company: company.name || data.name,
    url: j.url || j.shortlink || `https://apply.workable.com/${company.slug}/j/${j.shortcode}/`,
    locationStrings: [
      [j.city, j.state, j.country].filter(Boolean).join(', '),
      ...(j.locations || []).map((l) => [l.city, l.region, l.country].filter(Boolean).join(', ')),
    ],
    countryCodes: [j.country_code, ...(j.locations || []).map((l) => l.countryCode)].filter(Boolean),
    remote: Boolean(j.telecommuting),
    department: j.department || '',
    employmentType: j.employment_type || '',
    postedAt: j.published_on || j.created_at || null,
    description: htmlToText(j.description || ''),
  }));
}
