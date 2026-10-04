// Greenhouse public job board API: https://developers.greenhouse.io/job-board.html
import { fetchJson } from './http.js';
import { htmlToText } from '../text.js';

export async function fetchGreenhouse(company) {
  const data = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(company.slug)}/jobs?content=true`);
  return (data.jobs || []).map((j) => ({
    id: `gh:${company.slug}:${j.id}`,
    title: j.title,
    company: company.name,
    url: j.absolute_url,
    locationStrings: [j.location?.name, ...(j.offices || []).flatMap((o) => [o.name, o.location])],
    department: j.departments?.map((d) => d.name).filter(Boolean).join(', ') || '',
    postedAt: j.updated_at || j.first_published || null,
    description: htmlToText(j.content || ''),
  }));
}
