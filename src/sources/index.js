import { fetchGreenhouse } from './greenhouse.js';
import { fetchLever } from './lever.js';
import { fetchSmartRecruiters } from './smartrecruiters.js';
import { fetchAshby } from './ashby.js';
import { fetchWorkday } from './workday.js';
import { fetchWorkable } from './workable.js';

export const SOURCES = {
  greenhouse: { label: 'Greenhouse', fetch: fetchGreenhouse, fields: ['slug'], example: 'boards.greenhouse.io/<slug>' },
  lever: { label: 'Lever', fetch: fetchLever, fields: ['slug'], example: 'jobs.lever.co/<slug>' },
  smartrecruiters: { label: 'SmartRecruiters', fetch: fetchSmartRecruiters, fields: ['slug'], example: 'jobs.smartrecruiters.com/<slug>' },
  ashby: { label: 'Ashby', fetch: fetchAshby, fields: ['slug'], example: 'jobs.ashbyhq.com/<slug>' },
  workday: { label: 'Workday', fetch: fetchWorkday, fields: ['host', 'tenant', 'site'], example: '<tenant>.wd5.myworkdayjobs.com/<site>' },
  workable: { label: 'Workable', fetch: fetchWorkable, fields: ['slug'], example: 'apply.workable.com/<slug>' },
};

/**
 * Work out the ATS and identifiers from a careers-page URL the user pastes in.
 * Returns null when the URL is not a supported job board.
 */
export function parseCareersUrl(input) {
  let url;
  try { url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`); } catch { return null; }
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);
  if (/(^|\.)greenhouse\.io$/.test(host)) {
    const slug = url.searchParams.get('for') || (parts[0] === 'embed' ? null : parts[0]);
    return slug ? { ats: 'greenhouse', slug } : null;
  }
  if (/(^|\.)lever\.co$/.test(host) && parts[0]) return { ats: 'lever', slug: parts[0], ...(host.includes('.eu.') ? { region: 'eu' } : {}) };
  if (host.endsWith('smartrecruiters.com') && parts[0]) return { ats: 'smartrecruiters', slug: parts[0] };
  if (host === 'jobs.ashbyhq.com' && parts[0]) return { ats: 'ashby', slug: parts[0] };
  if (host === 'apply.workable.com' && parts[0]) return { ats: 'workable', slug: parts[0] };
  const wd = host.match(/^([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com$/);
  if (wd) {
    const site = parts.find((p) => !/^[a-z]{2}-[A-Z]{2}$/.test(p));
    return site ? { ats: 'workday', host, tenant: wd[1], site } : null;
  }
  return null;
}
