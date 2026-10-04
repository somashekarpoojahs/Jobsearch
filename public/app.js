const $ = (sel) => document.querySelector(sel);
const PAGE_SIZE = 40;
const PLACE_ORDER = ['Dublin', 'Cork', 'Galway', 'Limerick', 'Waterford', 'Kildare', 'Belfast', 'Derry', 'Remote (Ireland)'];

const state = {
  jobs: [],
  status: null,
  matches: new Map(), // jobId -> match
  profile: null,
  file: null,
  shown: PAGE_SIZE,
  filters: { q: '', places: new Set(), loc: '', remote: false, europe: false, min: 0, company: '', posted: '', sort: 'newest' },
};

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function safeUrl(u) {
  try { const url = new URL(u); return /^https?:$/.test(url.protocol) ? url.href : '#'; } catch { return '#'; }
}

function timeAgo(iso) {
  if (!iso) return '';
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  if (days < 0) return '';
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months} month${months > 1 ? 's' : ''} ago` : 'Over a year ago';
}

function minutesAgo(iso) {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

function band(score) {
  if (score >= 75) return ['strong', 'Strong match'];
  if (score >= 55) return ['good', 'Good match'];
  if (score >= 35) return ['partial', 'Partial match'];
  return ['low', 'Low match'];
}

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ---------- loading jobs ----------
let pollTimer = null;

async function loadJobs() {
  try {
    const data = await api('/api/jobs');
    const firstLoad = state.jobs.length === 0;
    const changed = data.jobs.length !== state.jobs.length || data.status.updatedAt !== state.status?.updatedAt;
    state.jobs = data.jobs;
    state.status = data.status;
    $('#demo-banner').hidden = !data.status.demo;
    if (changed) {
      buildCompanyOptions();
      buildPlaceChips();
      if (state.file && !firstLoad) runMatch(true);
    }
    render();
    if (data.status.state === 'loading') schedulePoll();
  } catch (err) {
    $('#result-count').textContent = 'Could not load jobs';
    $('#source-status').textContent = err.message;
  }
}

function schedulePoll() {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(async () => {
    try {
      const status = await api('/api/status');
      state.status = status;
      renderStatus();
      if (status.state === 'loading') schedulePoll();
      else loadJobs();
    } catch { schedulePoll(); }
  }, 2000);
}

$('#refresh-btn').addEventListener('click', async () => {
  try {
    state.status = await api('/api/refresh', { method: 'POST' });
    renderStatus();
    schedulePoll();
  } catch (err) { alert(err.message); }
});

// ---------- resume upload ----------
const input = $('#resume-input');
const dropzone = $('#dropzone');

function setFile(file) {
  state.file = file || null;
  dropzone.classList.toggle('has-file', Boolean(file));
  $('#dz-text').innerHTML = file ? `<strong>${esc(file.name)}</strong>` : '<strong>Choose a file</strong> or drag it here';
  $('#match-btn').disabled = !file;
}

input.addEventListener('change', () => setFile(input.files[0]));
['dragenter', 'dragover'].forEach((ev) => dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add('drag'); }));
['dragleave', 'drop'].forEach((ev) => dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove('drag'); }));
dropzone.addEventListener('drop', (e) => { if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); });

$('#resume-form').addEventListener('submit', (e) => { e.preventDefault(); runMatch(); });

async function runMatch(silent = false) {
  if (!state.file) return;
  const btn = $('#match-btn');
  const errBox = $('#resume-error');
  errBox.hidden = true;
  if (!silent) { btn.disabled = true; btn.textContent = 'Reading your resume…'; }
  const body = new FormData();
  body.append('resume', state.file);
  body.append('targetRole', $('#target-role').value);
  try {
    const data = await api('/api/match', { method: 'POST', body });
    state.matches = new Map(data.matches.map((m) => [m.jobId, m]));
    state.profile = data.profile;
    state.filters.sort = 'match';
    $('#f-sort').value = 'match';
    $('#min-score-field').hidden = false;
    state.shown = PAGE_SIZE;
    renderProfile();
    render();
    if (!silent) $('.results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    errBox.textContent = err.message;
    errBox.hidden = false;
  } finally {
    btn.disabled = !state.file;
    btn.textContent = 'Find matching jobs';
  }
}

function renderProfile() {
  const p = state.profile;
  const el = $('#profile');
  if (!p) { el.hidden = true; return; }
  const strong = [...state.matches.values()].filter((m) => m.score >= 55).length;
  el.className = 'profile';
  el.innerHTML = `
    <h3>What we found in your resume</h3>
    <dl>
      <dt>Experience</dt><dd>${p.years != null ? `About ${esc(Math.round(p.years))} year${Math.round(p.years) === 1 ? '' : 's'} (${esc(p.levelName)})` : 'Not detected'}</dd>
      ${p.titles.length ? `<dt>Roles</dt><dd>${esc(p.titles.slice(0, 3).join(' · '))}</dd>` : ''}
      <dt>Good matches</dt><dd>${strong} job${strong === 1 ? '' : 's'} at 55% or above</dd>
    </dl>
    <h3>Skills detected (${p.skills.length})</h3>
    <div class="chips">${p.skills.length ? p.skills.map((s) => `<span class="chip">${esc(s)}</span>`).join('') : '<span class="muted">No known skills found. Try adding a skills section.</span>'}</div>`;
  el.hidden = false;
}

// ---------- filters ----------
function buildCompanyOptions() {
  const sel = $('#f-company');
  const current = sel.value;
  const counts = new Map();
  for (const j of state.jobs) counts.set(j.company, (counts.get(j.company) || 0) + 1);
  sel.innerHTML = '<option value="">All companies</option>' + [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([c, n]) => `<option value="${esc(c)}">${esc(c)} (${n})</option>`).join('');
  sel.value = counts.has(current) ? current : '';
  state.filters.company = sel.value;
}

function buildPlaceChips() {
  const counts = new Map();
  for (const j of state.jobs) {
    if (j.europeRemote) continue;
    for (const p of j.places) counts.set(p, (counts.get(p) || 0) + 1);
  }
  const rank = (p) => { const i = PLACE_ORDER.indexOf(p); return i === -1 ? 100 : i; };
  const places = [...counts.keys()].sort((a, b) => rank(a) - rank(b) || counts.get(b) - counts.get(a) || a.localeCompare(b));
  for (const p of [...state.filters.places]) if (!counts.has(p)) state.filters.places.delete(p);
  $('#f-places').innerHTML = places.map((p) => `<button type="button" class="chip" data-place="${esc(p)}" aria-pressed="${state.filters.places.has(p)}">${esc(p)} <span class="count">${counts.get(p)}</span></button>`).join('')
    || '<span class="muted">No locations yet</span>';
}

$('#f-places').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-place]');
  if (!chip) return;
  const p = chip.dataset.place;
  if (state.filters.places.has(p)) state.filters.places.delete(p); else state.filters.places.add(p);
  chip.setAttribute('aria-pressed', state.filters.places.has(p));
  update();
});

function bindFilter(id, key, prop = 'value', transform = (v) => v) {
  const el = $(id);
  el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', () => {
    state.filters[key] = transform(el[prop]);
    update();
  });
}
bindFilter('#f-q', 'q');
bindFilter('#f-loc', 'loc');
bindFilter('#f-remote', 'remote', 'checked');
bindFilter('#f-europe', 'europe', 'checked');
bindFilter('#f-company', 'company');
bindFilter('#f-posted', 'posted');
bindFilter('#f-sort', 'sort');
bindFilter('#f-min', 'min', 'value', Number);
$('#f-min').addEventListener('input', () => { $('#f-min-label').textContent = `${$('#f-min').value}%`; });

$('#clear-filters').addEventListener('click', () => {
  Object.assign(state.filters, { q: '', loc: '', remote: false, europe: false, min: 0, company: '', posted: '' });
  state.filters.places.clear();
  for (const [id, v] of [['#f-q', ''], ['#f-loc', ''], ['#f-company', ''], ['#f-posted', ''], ['#f-min', '0']]) $(id).value = v;
  $('#f-remote').checked = false;
  $('#f-europe').checked = false;
  $('#f-min-label').textContent = '0%';
  buildPlaceChips();
  update();
});

function update() { state.shown = PAGE_SIZE; render(); }

function filtered() {
  const f = state.filters;
  const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  const loc = f.loc.trim().toLowerCase();
  const cutoff = f.posted ? Date.now() - Number(f.posted) * 86400000 : null;
  const hasMatches = state.matches.size > 0;
  let list = state.jobs.filter((j) => {
    if (j.europeRemote && !f.europe) return false;
    if (f.places.size && !j.places.some((p) => f.places.has(p)) && !(j.europeRemote && f.europe)) return false;
    if (loc && !`${j.location} ${j.places.join(' ')}`.toLowerCase().includes(loc)) return false;
    if (f.remote && !j.remote) return false;
    if (f.company && j.company !== f.company) return false;
    if (cutoff && (!j.postedAt || Date.parse(j.postedAt) < cutoff)) return false;
    if (words.length) {
      const hay = `${j.title} ${j.company} ${j.department} ${j.snippet}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) return false;
    }
    if (hasMatches && f.min > 0 && (state.matches.get(j.id)?.score ?? 0) < f.min) return false;
    return true;
  });
  const score = (j) => state.matches.get(j.id)?.score ?? -1;
  const date = (j) => (j.postedAt ? Date.parse(j.postedAt) : 0);
  if (f.sort === 'match' && hasMatches) list.sort((a, b) => score(b) - score(a) || date(b) - date(a));
  else if (f.sort === 'company') list.sort((a, b) => a.company.localeCompare(b.company) || a.title.localeCompare(b.title));
  else list.sort((a, b) => date(b) - date(a));
  return list;
}

// ---------- rendering ----------
function renderStatus() {
  const s = state.status;
  if (!s) return;
  const progress = $('#progress');
  if (s.state === 'loading') {
    progress.hidden = false;
    const pct = s.progress.total ? Math.max(5, Math.round((s.progress.done / s.progress.total) * 100)) : 5;
    $('#progress-bar').style.width = `${pct}%`;
  } else {
    progress.hidden = true;
  }
  const ok = s.sources.filter((x) => x.ok).length;
  const failed = s.sources.filter((x) => !x.ok).length;
  const parts = [];
  if (s.state === 'loading') parts.push(`Checking careers pages… ${s.progress.done}/${s.progress.total}`);
  else if (s.updatedAt) parts.push(`${ok} companies checked · updated ${minutesAgo(s.updatedAt)}`);
  $('#source-status').innerHTML = esc(parts.join(' · ')) +
    (failed ? ` · <button class="link-btn" type="button" id="failed-link">${failed} careers page${failed > 1 ? 's' : ''} could not be read</button>` : '');
  $('#failed-link')?.addEventListener('click', openCompanies);
  $('#refresh-btn').disabled = s.state === 'loading' || s.demo;
}

function render() {
  renderStatus();
  const list = filtered();
  const total = state.jobs.filter((j) => !j.europeRemote || state.filters.europe).length;
  const loading = state.status?.state === 'loading' && state.jobs.length === 0;
  $('#result-count').textContent = loading ? 'Searching careers pages in Ireland…'
    : `${list.length.toLocaleString()} ${list.length === 1 ? 'job' : 'jobs'} in Ireland${list.length !== total ? ` (of ${total.toLocaleString()})` : ''}`;

  const ol = $('#job-list');
  ol.replaceChildren(...list.slice(0, state.shown).map(renderJob));
  $('#more-btn').hidden = list.length <= state.shown;
  const empty = $('#empty');
  empty.hidden = list.length > 0 || loading;
  empty.textContent = state.jobs.length ? 'No jobs match these filters. Try removing a location or lowering the minimum match.'
    : 'No jobs found yet. Try "Refresh jobs", or add companies in the Companies panel.';
}

$('#more-btn').addEventListener('click', () => { state.shown += PAGE_SIZE; render(); });

const tpl = $('#job-template');
function renderJob(job) {
  const node = tpl.content.firstElementChild.cloneNode(true);
  const url = safeUrl(job.url);
  const a = node.querySelector('.job-title a');
  a.href = url;
  a.textContent = job.title;
  node.querySelector('.apply').href = url;
  const meta = [`<span class="company">${esc(job.company)}</span>`, esc(job.location)];
  if (job.employmentType) meta.push(esc(job.employmentType));
  if (job.postedAt) meta.push(esc(timeAgo(job.postedAt)));
  node.querySelector('.job-meta').innerHTML = meta.filter(Boolean).join(' · ');
  node.querySelector('.snippet').textContent = job.snippet;

  const m = state.matches.get(job.id);
  if (m) {
    const [cls, label] = band(m.score);
    const score = node.querySelector('.score');
    score.hidden = false;
    score.classList.add(cls);
    score.querySelector('.ring').style.setProperty('--p', m.score);
    score.querySelector('.pct').textContent = `${m.score}%`;
    score.querySelector('.band').textContent = label;
    score.setAttribute('aria-label', `${m.score}% match, ${label}`);

    const details = node.querySelector('.match-details');
    details.hidden = false;
    const chipRow = (sel, items, kind) => {
      const row = details.querySelector(sel);
      if (!items.length) { row.remove(); return; }
      row.querySelector('.chips').innerHTML = items.map((s) => `<span class="chip ${kind}">${esc(s)}</span>`).join('');
    };
    chipRow('.matched', m.matchedSkills, 'ok');
    chipRow('.missing', m.missingSkills, 'gap');
    details.querySelector('.reasons').innerHTML = m.reasons.map((r) => `<li>${esc(r)}</li>`).join('');
    const rows = [['Skills', m.breakdown.skills], ['Description fit', m.breakdown.text], ['Job title', m.breakdown.title], ['Seniority', m.breakdown.seniority]]
      .filter(([, v]) => v != null);
    details.querySelector('.breakdown dl').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd><div class="bar"><i style="width:${Number(v)}%"></i></div></dd><dd>${Number(v)}%</dd>`).join('');
    node.querySelector('.snippet').hidden = true;
  }
  return node;
}

// ---------- companies dialog ----------
const dialog = $('#companies-dialog');
$('#companies-btn').addEventListener('click', openCompanies);

async function openCompanies() {
  await renderCompanies();
  if (!dialog.open) dialog.showModal();
}

async function renderCompanies() {
  const data = await api('/api/companies');
  const statusByKey = new Map((state.status?.sources || []).map((s) => [s.key, s]));
  const label = Object.fromEntries(data.platforms.map((p) => [p.id, p.label]));
  $('#add-company').hidden = data.demo;
  const items = data.companies.map((c) => {
    const s = statusByKey.get(c.key);
    const st = !s ? '<span class="meta">not checked yet</span>'
      : s.ok ? `<span class="meta">${s.count} job${s.count === 1 ? '' : 's'} in Ireland</span>`
        : `<span class="meta fail" title="${esc(s.error)}">could not read careers page${s.stale ? ' (showing earlier results)' : ''}: ${esc(s.error)}</span>`;
    return `<li><div><strong>${esc(c.name)}</strong> <span class="meta">· ${esc(label[c.ats] || c.ats)}</span><br>${st}</div>
      ${data.demo ? '' : `<button class="icon-btn" data-remove="${esc(c.key)}" aria-label="Remove ${esc(c.name)}">✕</button>`}</li>`;
  });
  if (data.demo) {
    for (const s of state.status?.sources || []) items.push(`<li><div><strong>${esc(s.name)}</strong> <span class="meta">· sample data</span><br><span class="meta">${s.count} jobs</span></div></li>`);
  }
  $('#company-list').innerHTML = items.join('');
}

$('#company-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-remove]');
  if (!btn) return;
  try {
    await api(`/api/companies/${encodeURIComponent(btn.dataset.remove)}`, { method: 'DELETE' });
    await renderCompanies();
    loadJobs();
  } catch (err) { alert(err.message); }
});

$('#add-company').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errBox = $('#company-error');
  errBox.hidden = true;
  try {
    await api('/api/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: $('#c-name').value, careersUrl: $('#c-url').value }),
    });
    $('#c-name').value = '';
    $('#c-url').value = '';
    await renderCompanies();
    state.status = await api('/api/refresh', { method: 'POST' });
    renderStatus();
    schedulePoll();
  } catch (err) {
    errBox.textContent = err.message;
    errBox.hidden = false;
  }
});

$("#f-sort").value = state.filters.sort;
loadJobs();
