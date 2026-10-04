// Small text helpers shared by the job sources, resume parser and matcher.

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', bull: '•', middot: '·',
  eacute: 'é', aacute: 'á', iacute: 'í', oacute: 'ó', uacute: 'ú', euro: '€', pound: '£',
};

export function decodeEntities(str = '') {
  return String(str).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

/** Convert an HTML fragment (possibly entity-encoded, as Greenhouse returns it) to plain text. */
export function htmlToText(html = '') {
  let s = String(html);
  // Greenhouse double-encodes: "&lt;p&gt;" → decode once first if it looks encoded.
  if (/&lt;\/?[a-z]/i.test(s)) s = decodeEntities(s);
  s = s
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|ul|ol)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  return s.replace(/[ \t\f\v]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export const STOPWORDS = new Set(`a about above after again against all am an and any are as at be because been before
being below between both but by can could did do does doing down during each few for from further had has have having he
her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off
on once only or other our ours ourselves out over own same she should so some such than that the their theirs them
themselves then there these they this those through to too under until up very was we were what when where which while
who whom why will with would you your yours yourself yourselves also etc via per across within including include includes
using use used able ability strong excellent good great work working works experience experienced role roles team teams
job jobs company candidate candidates opportunity looking join us we'll you'll we're you're new well must may might
year years plus e.g i.e like across based help helping make making get getting need needs required requirements
responsibilities responsibility skills skill knowledge understanding preferred desirable essential key`.split(/\s+/));

/** Lowercase word tokens; keeps tech tokens such as c++, c#, node.js. */
export function tokenize(text = '') {
  const out = [];
  const re = /[a-z0-9][a-z0-9+#.]*[a-z0-9+#]|[a-z0-9]/g;
  const lower = String(text).toLowerCase();
  let m;
  while ((m = re.exec(lower))) {
    let t = m[0];
    if (t.length < 2 && !/[cr]/.test(t)) continue;
    if (STOPWORDS.has(t) || /^\d+$/.test(t)) continue;
    out.push(stem(t));
  }
  return out;
}

/** Very light stemmer: enough to make "engineers"/"engineering"/"engineer" collide. */
export function stem(t) {
  if (t.length <= 4 || /[+#.]/.test(t)) return t;
  if (t.endsWith('ies')) return t.slice(0, -3) + 'y';
  if (t.endsWith('ing') && t.length > 6) return t.slice(0, -3);
  if (t.endsWith('ers') && t.length > 6) return t.slice(0, -1);
  if (t.endsWith('ed') && t.length > 5) return t.slice(0, -2);
  if (t.endsWith('s') && !t.endsWith('ss') && !t.endsWith('us') && !t.endsWith('is')) return t.slice(0, -1);
  return t;
}

export function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function truncate(s = '', n = 300) {
  const str = String(s).replace(/\s+/g, ' ').trim();
  return str.length > n ? str.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : str;
}
