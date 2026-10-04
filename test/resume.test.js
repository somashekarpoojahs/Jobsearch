import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resumeToText, buildProfile, estimateYears, detectTitles, ResumeError } from '../src/resume.js';

const fixture = (f) => fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url));

test('reads PDF, DOCX and TXT resumes', async () => {
  assert.match(await resumeToText(fixture('resume-java.pdf'), 'cv.pdf'), /Spring Boot, Kafka/);
  assert.match(await resumeToText(fixture('resume-analyst.docx'), 'cv.docx'), /Tableau and Power BI/);
  assert.match(await resumeToText(fixture('resume-backend.txt'), 'cv.txt'), /Fintrail/);
});

test('rejects unsupported or empty files with a helpful message', async () => {
  await assert.rejects(resumeToText(Buffer.from('x'), 'cv.doc'), ResumeError);
  await assert.rejects(resumeToText(Buffer.from('x'), 'cv.png', 'image/png'), ResumeError);
  await assert.rejects(resumeToText(Buffer.from('short'), 'cv.txt'), /Very little text/);
  await assert.rejects(resumeToText(Buffer.from('not a pdf at all '.repeat(10)), 'cv.pdf'), /Could not read that PDF/);
});

test('estimates years from work dates and ignores education dates', () => {
  const now = new Date('2026-10-01');
  const text = 'Experience\nEngineer\nJan 2020 – Dec 2022\nAnalyst\n2023 - Present\nEducation\nBSc 2012 - 2016';
  const years = estimateYears(text, now);
  assert.ok(years > 6 && years < 7.2, `got ${years}`);
});

test('uses an explicit "N years of experience" statement', () => {
  assert.equal(estimateYears('Product manager with 9 years of experience in SaaS.'), 9);
});

test('detects job titles but not bullet points', () => {
  const titles = detectTitles('Experience\nSenior Data Analyst\n- Worked with the marketing manager on reports\nAcme Ltd');
  assert.deepEqual(titles, ['Senior Data Analyst']);
});

test('buildProfile pulls skills, level and target role', () => {
  const text = fs.readFileSync(new URL('./fixtures/resume-backend.txt', import.meta.url), 'utf8');
  const p = buildProfile(text, { targetRole: 'Platform Engineer' });
  assert.ok(p.skills.includes('Python') && p.skills.includes('Kubernetes'));
  assert.ok(p.years >= 6 && p.years <= 8);
  assert.equal(p.levelName, 'Senior');
  assert.deepEqual(p.targetTokens, ['platform', 'engineer']);
});
