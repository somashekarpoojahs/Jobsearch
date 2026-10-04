import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSkills } from '../src/skills.js';

test('finds skills through aliases and special characters', () => {
  const s = extractSkills('Worked with C#, C++, Node.js, ReactJS, k8s, golang, Power BI and scikit-learn on ASP.NET.');
  for (const name of ['C#', 'C++', 'Node.js', 'React', 'Kubernetes', 'Go', 'Power BI', 'scikit-learn', '.NET']) {
    assert.ok(s.includes(name), `expected ${name} in ${s}`);
  }
});

test('does not match ordinary English words', () => {
  const s = extractSkills('Go to the rest of the team, less is more, word of mouth, competitive benefits, Irish market, react quickly.');
  for (const name of ['Go', 'REST APIs', 'CSS', 'Microsoft Office', 'Compensation and benefits', 'Irish language']) {
    assert.ok(!s.includes(name), `did not expect ${name}`);
  }
});

test('Java is not found inside JavaScript', () => {
  const s = extractSkills('JavaScript developer');
  assert.ok(s.includes('JavaScript'));
  assert.ok(!s.includes('Java'));
});

test('recognises testing and payments skills', () => {
  const s = extractSkills('Python with pytest, Robot Framework and behave (BDD/Gherkin). API testing with Postman, JMeter load tests. ISO8583 card payments, acquiring and dispute case management. Xray, Confluence, Selenium.');
  for (const name of ['pytest', 'Robot Framework', 'BDD', 'Postman', 'JMeter', 'API testing', 'ISO 8583', 'Card payments', 'Payment processing', 'Disputes and chargebacks', 'Xray', 'Confluence', 'Selenium']) {
    assert.ok(s.includes(name), `expected ${name}`);
  }
  assert.ok(!s.includes('Industrial automation'), 'test automation is not industrial automation');
});
