// Turn an uploaded resume (PDF, DOCX, TXT) into plain text and a simple candidate profile.
import { extractText, getDocumentProxy } from 'unpdf';
import mammoth from 'mammoth';
import { extractSkills } from './skills.js';
import { tokenize } from './text.js';

export class ResumeError extends Error {}

export async function resumeToText(buffer, filename = '', mimetype = '') {
  const name = filename.toLowerCase();
  let text = '';
  if (name.endsWith('.pdf') || mimetype === 'application/pdf') {
    try {
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      text = (await extractText(pdf, { mergePages: true })).text;
    } catch {
      throw new ResumeError('Could not read that PDF. Try exporting it again, or upload a DOCX/TXT version.');
    }
  } else if (name.endsWith('.docx') || mimetype.includes('wordprocessingml')) {
    try {
      text = (await mammoth.extractRawText({ buffer })).value;
    } catch {
      throw new ResumeError('Could not read that Word document. Try saving it as .docx or PDF again.');
    }
  } else if (name.endsWith('.doc')) {
    throw new ResumeError('Old .doc files are not supported. Please save your resume as PDF or .docx.');
  } else if (/\.(txt|md|text|rtf)$/.test(name) || mimetype.startsWith('text/')) {
    text = buffer.toString('utf8');
  } else {
    throw new ResumeError('Unsupported file type. Please upload a PDF, DOCX or TXT resume.');
  }
  text = text.replace(/\u0000/g, '').replace(/[ \t]+/g, ' ').trim();
  if (text.length < 80) {
    throw new ResumeError('Very little text was found in that file. If it is a scanned PDF, please upload a text-based PDF or DOCX.');
  }
  return text;
}

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
const MONTH_RE = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DATE_RE = `(?:(${MONTH_RE})\\.?\\s*|(\\d{1,2})\\s*[/.-]\\s*)?((?:19|20)\\d{2})`;
const RANGE_RE = new RegExp(`${DATE_RE}\\s*(?:-|–|—|to|until)\\s*(?:${DATE_RE}|(present|current|now|today|date|ongoing))`, 'gi');

const SECTION_HEADERS = {
  experience: /^(work |professional |employment |career |relevant )?(experience|history|employment)( history)?$/i,
  education: /^(education|academic|qualifications|education (and|&) training|academic background)/i,
  other: /^(skills|technical skills|projects|certifications?|summary|profile|about me|interests|hobbies|references|languages|awards|publications|volunteering|achievements|contact)/i,
};

function splitSections(text) {
  const sections = [];
  let current = { kind: 'unknown', lines: [] };
  for (const raw of text.split(/\n/)) {
    const line = raw.trim().replace(/[:•\-–|]+$/, '').trim();
    const kind = line.length <= 40 && Object.entries(SECTION_HEADERS).find(([, re]) => re.test(line))?.[0];
    if (kind) {
      sections.push(current);
      current = { kind, lines: [] };
    } else {
      current.lines.push(raw);
    }
  }
  sections.push(current);
  return sections.filter((s) => s.lines.length);
}

function monthIndex(name, num) {
  if (name) return MONTHS[name.toLowerCase().slice(0, name.toLowerCase().startsWith('sept') ? 4 : 3)] ?? 0;
  if (num) return Math.min(11, Math.max(0, Number(num) - 1));
  return null;
}

/** Estimate total years of work experience from date ranges (excluding education) and "N years" statements. */
export function estimateYears(text, now = new Date()) {
  const sections = splitSections(text);
  const workText = sections.some((s) => s.kind === 'experience')
    ? sections.filter((s) => s.kind === 'experience' || s.kind === 'unknown').map((s) => s.lines.join('\n')).join('\n')
    : sections.filter((s) => s.kind !== 'education').map((s) => s.lines.join('\n')).join('\n');

  const intervals = [];
  for (const m of workText.matchAll(RANGE_RE)) {
    const startY = Number(m[3]);
    const startM = monthIndex(m[1], m[2]) ?? 0;
    let endY; let endM;
    if (m[7]) { endY = now.getFullYear(); endM = now.getMonth(); } else { endY = Number(m[6]); endM = monthIndex(m[4], m[5]) ?? 11; }
    const s = startY * 12 + startM; const e = endY * 12 + endM;
    if (e >= s && e - s < 50 * 12 && startY > 1960) intervals.push([s, e]);
  }
  intervals.sort((a, b) => a[0] - b[0]);
  let months = 0; let cur = null;
  for (const iv of intervals) {
    if (!cur || iv[0] > cur[1]) { if (cur) months += cur[1] - cur[0]; cur = [...iv]; } else cur[1] = Math.max(cur[1], iv[1]);
  }
  if (cur) months += cur[1] - cur[0];
  const fromRanges = months / 12;

  let stated = 0;
  for (const m of text.matchAll(/(\d{1,2})\s*\+?\s*(?:years|yrs)['’]?\s*(?:of\s+)?(?:\w+\s+){0,2}experience/gi)) {
    stated = Math.max(stated, Number(m[1]));
  }
  const years = Math.max(fromRanges, stated);
  return years > 0 ? Math.min(45, Math.round(years * 10) / 10) : null;
}

const ROLE_WORDS = /\b(engineer|developer|analyst|scientist|manager|designer|consultant|specialist|accountant|architect|administrator|coordinator|associate|executive|officer|director|lead|intern|technician|nurse|assistant|representative|advisor|adviser|recruiter|marketer|writer|researcher|programmer|tester|owner|strategist|controller|auditor|buyer|planner|operator|pharmacist|chemist|teacher|lecturer|head of|agent|partner|editor|producer|clerk)s?\b/i;

/** Lines that look like job titles held (short lines containing a role word). */
export function detectTitles(text) {
  const sections = splitSections(text);
  const pool = sections.filter((s) => s.kind !== 'education' && s.kind !== 'other');
  const lines = (pool.length ? pool : sections).flatMap((s) => s.lines);
  const titles = [];
  for (const raw of lines) {
    if (/^\s*[-•*▪◦●–]/.test(raw)) continue; // bullet points describe duties, not titles
    const line = raw.replace(RANGE_RE, '').replace(/[|•·,–—-]+\s*$/, '').replace(/\s+/g, ' ').trim();
    if (line.length < 4 || line.length > 80 || /[.!?]$/.test(line) || /@|https?:/.test(line)) continue;
    if (line.split(' ').length > 9) continue;
    if (ROLE_WORDS.test(line) && !titles.some((t) => t.toLowerCase() === line.toLowerCase())) titles.push(line);
    if (titles.length >= 8) break;
  }
  return titles;
}

export function yearsToLevel(years) {
  if (years == null) return null;
  if (years < 1) return 0;
  if (years < 3) return 1;
  if (years < 6) return 2;
  if (years < 10) return 3;
  if (years < 15) return 4;
  return 5;
}

export const LEVEL_NAMES = ['Entry / graduate', 'Junior', 'Mid-level', 'Senior', 'Lead / principal', 'Executive'];

export function buildProfile(text, { targetRole = '' } = {}) {
  const years = estimateYears(text);
  const titles = detectTitles(text);
  const level = yearsToLevel(years);
  return {
    skills: extractSkills(text),
    years,
    level,
    levelName: level == null ? null : LEVEL_NAMES[level],
    titles,
    targetRole: targetRole.trim(),
    titleTokens: [...new Set(tokenize(titles.join(' ')))],
    targetTokens: [...new Set(tokenize(targetRole))],
    wordCount: text.split(/\s+/).length,
  };
}
