// Decide whether a job is located in Ireland (Republic or Northern Ireland) and which city.

// Places in the Republic of Ireland, mapped to the label used in the location filter.
const IE_PLACES = {
  Dublin: ['dublin', 'baile átha cliath', 'sandyford', 'tallaght', 'blanchardstown', 'swords', 'dún laoghaire', 'dun laoghaire',
    'clonee', 'grange castle', 'cherrywood', 'citywest', 'ballsbridge', 'park west', 'dundrum', 'santry', 'lucan', 'clondalkin',
    'east point', 'docklands dublin', 'leopardstown', 'malahide', 'balbriggan'],
  Cork: ['cork', 'ringaskiddy', 'little island', 'carrigtwohill', 'cobh', 'mallow', 'youghal', 'midleton', 'mahon', 'ballincollig', 'bandon', 'kinsale'],
  Galway: ['galway', 'ballybrit', 'oranmore', 'parkmore', 'tuam', 'athenry'],
  Limerick: ['limerick', 'raheen', 'castletroy', 'plassey'],
  Waterford: ['waterford', 'dungarvan', 'tramore'],
  Kildare: ['kildare', 'leixlip', 'maynooth', 'naas', 'celbridge', 'newbridge', 'kilcock'],
  Wicklow: ['wicklow', 'bray', 'greystones', 'arklow'],
  Meath: ['meath', 'navan', 'ashbourne', 'trim', 'dunboyne'],
  Louth: ['louth', 'dundalk', 'drogheda'],
  Kilkenny: ['kilkenny'],
  Westmeath: ['westmeath', 'athlone', 'mullingar'],
  Sligo: ['sligo'],
  Donegal: ['donegal', 'letterkenny'],
  Wexford: ['wexford', 'enniscorthy', 'gorey'],
  Carlow: ['carlow'],
  Clare: ['county clare', 'co. clare', 'co clare', 'ennis', 'shannon'],
  Kerry: ['kerry', 'tralee', 'killarney'],
  Tipperary: ['tipperary', 'clonmel', 'thurles', 'nenagh', 'cashel'],
  Mayo: ['mayo', 'castlebar', 'ballina', 'westport'],
  Offaly: ['offaly', 'tullamore'],
  Laois: ['laois', 'portlaoise'],
  Longford: ['longford'],
  Cavan: ['cavan'],
  Monaghan: ['monaghan'],
  Roscommon: ['roscommon'],
  Leitrim: ['leitrim', 'carrick-on-shannon'],
};

const NI_PLACES = {
  Belfast: ['belfast'],
  Derry: ['derry', 'londonderry'],
  'Northern Ireland (other)': ['lisburn', 'newry', 'craigavon', 'armagh', 'coleraine', 'ballymena', 'newtownabbey', 'enniskillen',
    'omagh', 'antrim', 'portadown', 'banbridge', 'county down', 'co. down', 'co. antrim', 'co. tyrone', 'tyrone', 'fermanagh'],
};

// US / Canadian / Australian places that share an Irish town name, e.g. "Dublin, CA" or "Dublin, Ohio".
const SHARED_TOWNS = ['dublin', 'cork', 'limerick', 'waterford', 'athlone', 'kildare', 'ennis', 'shannon', 'derry', 'antrim',
  'armagh', 'tyrone', 'carlow', 'tralee', 'donegal', 'bray', 'naas', 'navan', 'galway', 'kilkenny', 'westport', 'kinsale',
  'trim', 'lucan', 'newry', 'portadown', 'cashel', 'mallow', 'cobh', 'bandon', 'arklow', 'ballina', 'londonderry'];
const townPattern = SHARED_TOWNS.map((t) => `[${t[0].toUpperCase()}${t[0]}]${t.slice(1)}`).join('|');
const STATE_CODES = 'AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|ON|QC|BC|NSW|VIC|QLD|US|USA';
// "Dublin, CA" — upper-case code after a comma, not "Co." (County).
const FALSE_FRIEND_CODES = new RegExp(`\\b(?:${townPattern})\\s*,\\s*(?:${STATE_CODES})\\b(?!\\.)`, 'g');
const FALSE_FRIEND_NAMES = new RegExp(`\\b(?:${townPattern})\\s*,?\\s*(?:california|ohio|georgia|virginia|pennsylvania|texas|new hampshire|new york|maryland|minnesota|indiana|ontario|united states|canada|australia|new zealand)\\b`, 'gi');

const EUROPE_REMOTE = /\b(emea|europe|european union|\beu\b|uk\s*&\s*ireland|uk\/ireland|anywhere|worldwide|global)\b/i;

function wordRegex(term) {
  return new RegExp(`(?<![a-zà-ÿ])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-zà-ÿ])`, 'i');
}
const IE_MATCHERS = Object.entries(IE_PLACES).flatMap(([label, terms]) => terms.map((t) => ({ label, re: wordRegex(t) })));
const NI_MATCHERS = Object.entries(NI_PLACES).flatMap(([label, terms]) => terms.map((t) => ({ label, re: wordRegex(t) })));

/**
 * Classify a job's location.
 * @param {string[]} locationStrings - free-text location fields from the careers page
 * @param {{countryCodes?: string[], remote?: boolean}} [hints] - structured data where the source offers it
 * @returns {{inIreland: boolean, places: string[], remote: boolean, europeRemote: boolean, northernIreland: boolean}}
 */
export function classifyLocation(locationStrings = [], hints = {}) {
  const raw = locationStrings.filter(Boolean).join(' | ');
  const cleaned = raw.replace(FALSE_FRIEND_CODES, ' ').replace(FALSE_FRIEND_NAMES, ' ');
  const text = cleaned.toLowerCase();
  const codes = (hints.countryCodes || []).map((c) => String(c).toLowerCase());

  const places = new Set();
  for (const { label, re } of NI_MATCHERS) if (re.test(text)) places.add(label);
  const northernIreland = places.size > 0 || /northern ireland/.test(text);
  for (const { label, re } of IE_MATCHERS) if (re.test(text)) places.add(label);

  const withoutNI = text.replace(/northern ireland/g, ' ');
  const mentionsRepublic = /\b(ireland|éire|eire|republic of ireland)\b/.test(withoutNI) || /\bIRL\b/.test(cleaned) ||
    codes.includes('ie') || codes.includes('irl');

  const remote = Boolean(hints.remote) || /\b(remote|work from home|wfh|home[- ]based|anywhere)\b/.test(text);
  const inIreland = places.size > 0 || mentionsRepublic || northernIreland || codes.includes('gb-nir');

  if (inIreland && places.size === 0) {
    if (northernIreland && !mentionsRepublic) places.add('Northern Ireland (other)');
    else if (!remote) places.add('Ireland (other)');
  }
  if (inIreland && remote) places.add('Remote (Ireland)');

  const europeRemote = !inIreland && remote && EUROPE_REMOTE.test(text);
  return { inIreland, places: [...places], remote, europeRemote, northernIreland };
}

export const PLACE_ORDER = [
  'Dublin', 'Cork', 'Galway', 'Limerick', 'Waterford', 'Kildare', 'Belfast', 'Derry', 'Remote (Ireland)',
];
