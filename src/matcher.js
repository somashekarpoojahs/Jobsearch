// Scores how well a resume fits each job: skills overlap, text similarity (TF-IDF), title fit and seniority fit.
import { tokenize } from './text.js';
import { extractSkills } from './skills.js';

const SENIORITY_WORDS = new Set(['senior', 'sr', 'sr.', 'junior', 'jr', 'jr.', 'lead', 'principal', 'staff', 'ii', 'iii', 'iv',
  'intern', 'internship', 'graduate', 'grad', 'trainee', 'associate', 'entry', 'level', 'head', 'chief', 'vp', 'director',
  'mid', 'experienced', 'hybrid', 'remote', 'dublin', 'ireland', 'cork', 'galway', 'limerick', 'belfast', 'emea', 'europe',
  'contract', 'temporary', 'permanent', 'full', 'part', 'time', 'month', 'fixed', 'term', 'm/f/d', 'f/m/d']);

/** Approximate seniority (0 entry … 5 executive) from a job title. */
export function titleLevel(title = '') {
  const t = ` ${title.toLowerCase()} `;
  if (/\b(intern|internship|graduate|grad|trainee|apprentice|placement|student|co-op|working student)\b/.test(t)) return 0;
  if (/\b(vp|vice president|chief|cto|cfo|ceo|coo|svp|evp)\b/.test(t)) return 5;
  if (/\b(director|head of|distinguished|fellow)\b/.test(t)) return 4.5;
  if (/\b(principal|staff|senior manager|sr\.? manager)\b/.test(t)) return 4;
  if (/\b(lead|manager|architect)\b/.test(t)) return 3.5;
  if (/\b(senior|sr\.?|iii)\b/.test(t)) return 3;
  if (/\b(junior|jr\.?|entry[- ]level|associate)\b|\bi\b(?!\w)/.test(t)) return 1;
  return 2;
}

/** Smallest "N years" experience requirement mentioned in a job description, or null. */
export function requiredYears(description = '') {
  let best = null;
  const re = /(\d{1,2})\s*\+?\s*(?:(?:-|–|to)\s*\d{1,2}\s*)?\+?\s*(?:years|yrs)['’]?\s*(?:of\s+)?(?:[\w-]+\s+){0,4}?(?:experience|exp\b)/gi;
  for (const m of description.matchAll(re)) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 20) best = best == null ? n : Math.min(best, n);
  }
  return best;
}

/** Precompute per-job features and the IDF table. Call again whenever the job list changes. */
export function buildIndex(jobs) {
  const df = new Map();
  const docs = jobs.map((job) => {
    const text = `${job.title} ${job.title} ${job.title} ${job.department || ''} ${job.description || ''}`;
    const tf = new Map();
    for (const tok of tokenize(text)) tf.set(tok, (tf.get(tok) || 0) + 1);
    for (const tok of tf.keys()) df.set(tok, (df.get(tok) || 0) + 1);
    return {
      job,
      tf,
      skills: extractSkills(`${job.title}\n${job.description || ''}`),
      level: titleLevel(job.title),
      reqYears: requiredYears(job.description || ''),
      coreTitle: [...new Set(tokenize(job.title).filter((t) => !SENIORITY_WORDS.has(t)))],
    };
  });
  const N = jobs.length;
  const idf = (tok) => Math.log((N + 1) / ((df.get(tok) || 0) + 1)) + 1;
  for (const d of docs) {
    d.vec = new Map();
    let norm = 0;
    for (const [tok, c] of d.tf) {
      const w = (1 + Math.log(c)) * idf(tok);
      d.vec.set(tok, w);
      norm += w * w;
    }
    d.norm = Math.sqrt(norm) || 1;
    delete d.tf;
  }
  return { docs, idf, byId: new Map(docs.map((d) => [d.job.id, d])) };
}

function resumeVector(text, idf) {
  const tf = new Map();
  for (const tok of tokenize(text)) tf.set(tok, (tf.get(tok) || 0) + 1);
  const vec = new Map();
  let norm = 0;
  for (const [tok, c] of tf) {
    const w = (1 + Math.log(c)) * idf(tok);
    vec.set(tok, w);
    norm += w * w;
  }
  return { vec, norm: Math.sqrt(norm) || 1 };
}

function cosine(a, b) {
  const [small, large] = a.vec.size < b.vec.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [tok, w] of small.vec) { const v = large.vec.get(tok); if (v) dot += w * v; }
  return dot / (a.norm * b.norm);
}

const overlap = (core, tokens) => (core.length ? core.filter((t) => tokens.has(t)).length / core.length : 0);

/**
 * Score every job in the index against a resume.
 * @returns {Array<{jobId, score, matchedSkills, missingSkills, reasons, breakdown}>} sorted best first
 */
export function scoreJobs(resumeText, profile, index) {
  const rv = resumeVector(`${profile.targetRole} ${profile.targetRole} ${resumeText}`, index.idf);
  const resumeSkills = new Set(profile.skills);
  const resumeTokens = new Set(tokenize(resumeText));
  const titleTokens = new Set(profile.titleTokens);
  const targetTokens = new Set(profile.targetTokens);

  return index.docs.map((d) => {
    const reasons = [];
    // 1. Skills mentioned in the posting that also appear in the resume.
    const matchedSkills = d.skills.filter((s) => resumeSkills.has(s));
    const missingSkills = d.skills.filter((s) => !resumeSkills.has(s));
    const skillScore = d.skills.length ? Math.min(1, matchedSkills.length / Math.min(d.skills.length, 10)) : null;
    if (d.skills.length) reasons.push(`Matches ${matchedSkills.length} of ${d.skills.length} skills the posting mentions`);

    // 2. Overall wording similarity.
    const textScore = Math.min(1, cosine(rv, d) / 0.3);

    // 3. Job title vs. titles held / target role.
    const fromTitles = Math.max(overlap(d.coreTitle, titleTokens), 0.5 * overlap(d.coreTitle, resumeTokens));
    const titleScore = targetTokens.size
      ? 0.65 * overlap(d.coreTitle, targetTokens) + 0.35 * fromTitles
      : fromTitles;
    if (titleScore >= 0.6) reasons.push('Job title lines up with your background');
    else if (titleScore < 0.25) reasons.push('Job title is a different line of work from your resume');

    // 4. Seniority: years asked for, and title level vs. the resume's level.
    let seniority = 0.7;
    if (profile.years != null) {
      const diff = d.level - profile.level;
      const levelFit = diff <= 0 ? Math.max(0.5, 1 + diff * 0.15) : Math.max(0, 1 - diff * 0.3);
      seniority = levelFit;
      if (d.reqYears != null) {
        const gap = d.reqYears - profile.years;
        seniority = Math.min(levelFit, gap <= 0 ? 1 : Math.max(0, 1 - gap * 0.18));
        if (gap > 1) reasons.push(`Asks for ${d.reqYears}+ years; your resume shows about ${Math.round(profile.years)}`);
      } else if (diff >= 1.5) {
        reasons.push('Role looks more senior than your experience');
      }
      if (d.level === 0 && profile.level >= 2) {
        seniority = Math.min(seniority, profile.level >= 3 ? 0.3 : 0.5);
        reasons.push('Entry-level role; you may be over-qualified');
      } else if (d.level <= 1 && profile.level >= 3) {
        seniority = Math.min(seniority, 0.45);
        reasons.push('Junior role; you may be over-qualified');
      }
    }

    // Skills carry the most weight, but less when the posting names only one or two recognisable skills.
    const wSkill = d.skills.length ? 0.45 * Math.min(1, d.skills.length / 3) : 0;
    const rest = 1 - wSkill;
    let combined = wSkill * (skillScore ?? 0) + rest * (0.36 * textScore + 0.46 * titleScore + 0.18 * seniority);
    // A big seniority mismatch caps the score however well the rest fits.
    if (seniority < 0.6) combined *= 0.4 + seniority;
    const score = Math.max(1, Math.min(99, Math.round(100 * combined)));

    return {
      jobId: d.job.id,
      score,
      matchedSkills,
      missingSkills: missingSkills.slice(0, 10),
      reasons,
      breakdown: {
        skills: skillScore == null ? null : Math.round(skillScore * 100),
        text: Math.round(textScore * 100),
        title: Math.round(titleScore * 100),
        seniority: Math.round(seniority * 100),
      },
    };
  }).sort((a, b) => b.score - a.score);
}
