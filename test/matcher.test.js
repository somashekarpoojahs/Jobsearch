import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildIndex, scoreJobs, titleLevel, requiredYears } from '../src/matcher.js';
import { buildProfile } from '../src/resume.js';

const job = (id, title, description) => ({ id, title, company: 'X', description, department: '' });
const JOBS = [
  job('backend', 'Senior Backend Engineer', 'Python, Go (golang), PostgreSQL, Redis, AWS, Docker and Kubernetes. Distributed systems. 5+ years of experience.'),
  job('frontend', 'Frontend Engineer', 'React, TypeScript, CSS, Figma. 3+ years of experience building web apps.'),
  job('grad', 'Graduate Software Engineer', 'Learn Python and Java. Degree in computer science.'),
  job('payroll', 'Payroll Specialist', 'Run payroll, Sage, Excel, accounts payable, Irish tax.'),
  job('nurse', 'Clinical Nurse Manager', 'RGN registered nurse with patient care experience. 5 years of experience.'),
];
const resume = fs.readFileSync(new URL('./fixtures/resume-backend.txt', import.meta.url), 'utf8');

test('ranks the closest job first and unrelated jobs last', () => {
  const ranked = scoreJobs(resume, buildProfile(resume), buildIndex(JOBS));
  assert.equal(ranked[0].jobId, 'backend');
  assert.ok(ranked[0].score >= 75, `top score ${ranked[0].score}`);
  const last2 = ranked.slice(-2).map((r) => r.jobId).sort();
  assert.deepEqual(last2, ['nurse', 'payroll']);
  for (const r of ranked.slice(-2)) assert.ok(r.score < 25, `${r.jobId} scored ${r.score}`);
});

test('scores are whole percentages between 1 and 99 with explanations', () => {
  for (const r of scoreJobs(resume, buildProfile(resume), buildIndex(JOBS))) {
    assert.ok(Number.isInteger(r.score) && r.score >= 1 && r.score <= 99);
    assert.ok(Array.isArray(r.matchedSkills) && Array.isArray(r.reasons));
  }
});

test('lists matched and missing skills', () => {
  const r = scoreJobs(resume, buildProfile(resume), buildIndex(JOBS)).find((x) => x.jobId === 'frontend');
  assert.ok(r.missingSkills.includes('React'));
  assert.ok(r.missingSkills.includes('Figma'));
});

test('flags over-qualification for graduate roles', () => {
  const r = scoreJobs(resume, buildProfile(resume), buildIndex(JOBS)).find((x) => x.jobId === 'grad');
  assert.ok(r.reasons.some((x) => /over-qualified/.test(x)));
  assert.ok(r.score < 50);
});

test('target role boosts matching titles', () => {
  const idx = buildIndex(JOBS);
  const plain = scoreJobs(resume, buildProfile(resume), idx).find((x) => x.jobId === 'frontend').score;
  const targeted = scoreJobs(resume, buildProfile(resume, { targetRole: 'Frontend Engineer' }), idx).find((x) => x.jobId === 'frontend').score;
  assert.ok(targeted > plain, `${targeted} > ${plain}`);
});

test('titleLevel and requiredYears', () => {
  assert.equal(titleLevel('Software Engineering Intern'), 0);
  assert.equal(titleLevel('Junior Developer'), 1);
  assert.equal(titleLevel('Software Engineer'), 2);
  assert.equal(titleLevel('Senior Data Analyst'), 3);
  assert.equal(titleLevel('Staff Engineer'), 4);
  assert.equal(titleLevel('Director of Product'), 4.5);
  assert.equal(requiredYears('You have 3-5 years of relevant experience'), 3);
  assert.equal(requiredYears('7+ years of professional software experience and 2 years experience leading'), 2);
  assert.equal(requiredYears('We have been around for 25 years'), null);
});

test('empty index returns no matches', () => {
  assert.deepEqual(scoreJobs(resume, buildProfile(resume), buildIndex([])), []);
});
