// Lever public postings API: https://github.com/lever/postings-api
import { fetchJson } from './http.js';
import { htmlToText } from '../text.js';

export async function fetchLever(company) {
  const host = company.region === 'eu' ? 'api.eu.lever.co' : 'api.lever.co';
  const data = await fetchJson(`https://${host}/v0/postings/${encodeURIComponent(company.slug)}?mode=json`);
  return (Array.isArray(data) ? data : []).map((j) => ({
    id: `lever:${company.slug}:${j.id}`,
    title: j.text,
    company: company.name,
    url: j.hostedUrl,
    locationStrings: [j.categories?.location, ...(j.categories?.allLocations || [])],
    countryCodes: j.country ? [j.country] : [],
    remote: j.workplaceType === 'remote',
    department: [j.categories?.department, j.categories?.team].filter(Boolean).join(' · '),
    employmentType: j.categories?.commitment || '',
    postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
    description: [
      j.descriptionPlain || htmlToText(j.description || ''),
      ...(j.lists || []).map((l) => `${l.text}\n${htmlToText(l.content || '')}`),
      j.additionalPlain || '',
    ].join('\n\n'),
  }));
}
