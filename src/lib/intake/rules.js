// Intake rules (F5, PRD §10.1). Plain JavaScript so the browser (the /plan/ page
// script) and Node (scripts/check_intake.mjs) run the same code.
//
// buildPlan(answers, data, config) is a pure function: no network, no storage, no
// clock, no randomness. The same answers and the same data always give the same
// plan. `data` is the digest the /plan/ page embeds (src/lib/intake/digest.ts);
// `config` is the Q8 priority list and the tradeoff table (src/config/intake/).
//
// A plan is a list of sections; a section has lines; every line names at least one
// source (a page on this site, or an official link) with that source's dates.
// When a rule points at something the site doesn't have yet (the F2 sequence, the
// courtesy-move rule, rental pet policies, an unwritten tradeoff), the line is left
// out. No placeholder, no link to nothing. GAPS below lists each one.
//
// Changing a rule: bump RULES_VERSION and add a changelog entry.

import { tierOf } from '../tiers.js';

// A place's tier comes from the top of its drive range (src/lib/tiers.js, shared with the base pages):
// "under 30 minutes" means every zip in it is under 30, so Vista at 14–35 is a 30–44 place.
export const RULES_VERSION = 'v0.7';

// Rules in §10.1 that have nothing to point at yet. Shown in STATUS.md, not on the page.
export const GAPS = [
  'Q3 / modifier: reporting in under 30 days or no orders yet opens the plan with the arrival and first-30-days steps (needs the F2 sequence)',
  'Lead for "The admin sequence" and "Move logistics" (needs the F2 sequence); the plan leads with the second priority instead and says why',
  'Modifier: the courtesy-move rule (contact the Housing Service Center within 30 days of arrival; rejecting an offer can forfeit the move) is not on any page',
  'Lead for "Pets" when base housing is ruled out: rental pet policies are not on any page (the plan leads with the second priority and says why); base housing breed restrictions are not in the data',
  'Tradeoff: no pair is written yet (src/config/intake/tradeoffs.json is empty)',
];

export const KID_GROUPS = ['0-2', '3-5', '6-9', '10-13', '14-18'];

export const TIMELINES = [
  { id: 'under30', label: 'Under 30 days', windowMonths: 1 },
  { id: '30-60', label: '30–60 days', windowMonths: 2 },
  { id: '60-90', label: '60–90 days', windowMonths: 3 },
  { id: '90plus', label: '90 days or more', windowMonths: null },
  { id: 'no-orders', label: 'No orders yet', windowMonths: null },
];

export const BEDROOM_CHOICES = [
  { id: '2', label: '2' },
  { id: '3', label: '3' },
  { id: '4plus', label: '4 or more' },
  { id: 'help', label: 'Help me figure it out' },
];

export const OPEN_CHOICES = [
  { id: 'renting', label: 'Renting' },
  { id: 'buying', label: 'Buying' },
  { id: 'base-housing', label: 'Base housing' },
  { id: 'unsure', label: 'Not sure yet' },
];

// --- Answers -------------------------------------------------------------------

export function emptyAnswers() {
  return {
    base: null, band: null, timeline: null, partner: null,
    kids: Object.fromEntries(KID_GROUPS.map((g) => [g, 0])),
    bedrooms: null, separate6: null, cats: 0, dogs: 0, open: [], priorities: [],
  };
}

const count = (n) => (Number.isInteger(n) && n > 0 ? Math.min(n, 9) : 0);

// Anything read back from storage goes through here, so a stale or hand-edited
// value can't reach the rules.
export function cleanAnswers(raw, data, config) {
  const a = emptyAnswers();
  if (!raw || typeof raw !== 'object') return a;
  const bases = data.bases.map((b) => b.code);
  if (raw.base === 'unsure' || bases.includes(raw.base)) a.base = raw.base;
  if (data.bands.includes(raw.band)) a.band = raw.band;
  if (TIMELINES.some((t) => t.id === raw.timeline)) a.timeline = raw.timeline;
  if (typeof raw.partner === 'boolean') a.partner = raw.partner;
  for (const g of KID_GROUPS) a.kids[g] = count(raw.kids?.[g]);
  if (BEDROOM_CHOICES.some((b) => b.id === raw.bedrooms)) a.bedrooms = raw.bedrooms;
  if (typeof raw.separate6 === 'boolean') a.separate6 = raw.separate6;
  a.cats = count(raw.cats);
  a.dogs = count(raw.dogs);
  const open = Array.isArray(raw.open) ? raw.open.filter((o) => OPEN_CHOICES.some((c) => c.id === o)) : [];
  a.open = open.includes('unsure') ? ['unsure'] : [...new Set(open)];
  const offered = availablePriorities(a, config.priorities).map((p) => p.id);
  a.priorities = (Array.isArray(raw.priorities) ? raw.priorities : []).filter((p, i, xs) => offered.includes(p) && xs.indexOf(p) === i).slice(0, 2);
  return a;
}

const kidsIn = (a, groups) => groups.reduce((n, g) => n + a.kids[g], 0);
export const hasSchoolAge = (a) => kidsIn(a, ['6-9', '10-13', '14-18']) > 0;
export const hasUnder6 = (a) => kidsIn(a, ['0-2', '3-5']) > 0;
const hasInfant = (a) => a.kids['0-2'] > 0;
const hasPet = (a) => a.cats + a.dogs > 0;

// Q8 offers some priorities only when Q4 or Q6 make them matter.
export function availablePriorities(a, priorities) {
  const when = { child_6_18: hasSchoolAge(a), child_0_5: hasUnder6(a), partner: a.partner === true, pet: hasPet(a) };
  return priorities.filter((p) => !p.shown_when || when[p.shown_when]);
}

export function missingAnswers(a) {
  const missing = [];
  if (!a.base) missing.push(1);
  if (!a.band) missing.push(2);
  if (!a.timeline) missing.push(3);
  if (a.partner == null) missing.push(4);
  if (!a.bedrooms || (a.bedrooms === 'help' && needsSeparateQuestion(a) && a.separate6 == null)) missing.push(5);
  if (!a.open.length) missing.push(7);
  if (!a.priorities.length) missing.push(8);
  return missing;
}

// --- Bedroom helper (Q5) ----------------------------------------------------------
// CNIC's enlisted guidelines: parents don't share with children; no more than two
// children per room; children 6 or older don't share with the opposite sex; children
// 10 or older get their own room. We don't ask children's sexes; when it changes the
// count we ask whether any child 6 or older needs a separate room, and "yes" gives
// each child aged 6–9 a room of their own.
function bedroomsFor(a, separate6) {
  const older = kidsIn(a, ['10-13', '14-18']);
  const mid = a.kids['6-9'];
  const young = kidsIn(a, ['0-2', '3-5']);
  const kidRooms = separate6 ? older + mid + Math.ceil(young / 2) : older + Math.ceil((mid + young) / 2);
  return 1 + kidRooms;
}
export const needsSeparateQuestion = (a) => bedroomsFor(a, true) !== bedroomsFor(a, false);

export function bedroomHelper(a) {
  const n = bedroomsFor(a, needsSeparateQuestion(a) ? a.separate6 === true : false);
  return { computed: n, row: n <= 2 ? 2 : n === 3 ? 3 : 4 };
}

export function bedroomRow(a) {
  if (a.bedrooms === 'help') return bedroomHelper(a).row;
  return a.bedrooms === '4plus' ? 4 : Number(a.bedrooms);
}

// --- Pay grades -----------------------------------------------------------------
// E1…E9, then W1…W5, then O1…O6. The wait lists print ranges such as "E1-O3" that
// run across all three. O1E–O3E sit with O1–O3.
const GRADES = [...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `E${n}`), ...[1, 2, 3, 4, 5].map((n) => `W${n}`), ...[1, 2, 3, 4, 5, 6].map((n) => `O${n}`)];
const gradeAt = (g) => GRADES.indexOf(g.trim().replace(/^O(\d)E$/, 'O$1'));
export function gradeSpan(s) {
  const [lo, hi = lo] = s.split(/[–-]/).map(gradeAt);
  if (lo < 0 || hi < 0) throw new Error(`unknown pay grade range "${s}"`);
  return [lo, hi];
}
const overlaps = (x, y) => x[0] <= y[1] && x[1] >= y[0];

// --- Formatting -----------------------------------------------------------------
const span = (lo, hi, unit = '') => (lo === hi ? `${lo}${unit}` : `${lo}–${hi}${unit}`);
const mins = (d) => span(d.lo, d.hi, ' min');
const list = (names, max = 4) => (names.length <= max ? names.join(', ') : `${names.slice(0, max).join(', ')} and ${names.length - max} more`);
const NEAR_TIERS = ['under30', '30-45'];

// --- Plan context -----------------------------------------------------------------

function context(a, data, config) {
  const base = a.base === 'unsure' ? null : data.bases.find((b) => b.code === a.base);
  const br = bedroomRow(a);
  const unsureOpen = a.open.includes('unsure');
  const open = {
    renting: unsureOpen || a.open.includes('renting'),
    buying: unsureOpen || a.open.includes('buying'),
    housing: unsureOpen || a.open.includes('base-housing'),
  };
  const baseName = base ? base.short : 'the nearest base';
  // Base not chosen: a place's nearest bases by drive (the same order the line lists them in).
  const nearestOf = (place) => Object.entries(place.drives).map(([code, d]) => ({ code, ...d })).sort((x, y) => x.lo - y.lo || x.code.localeCompare(y.code));
  // A neighborhood's drive for this plan: to the chosen base, or (base not chosen) to its two nearest bases.
  const driveOf = (place) => {
    if (base) {
      const d = place.drives[base.code];
      return d ? { lo: d.lo, hi: d.hi, tier: tierOf(d.hi), text: `${mins(d)} to ${base.short}` } : null;
    }
    const near = nearestOf(place).slice(0, 2);
    if (!near.length) return null;
    const name = (code) => data.bases.find((b) => b.code === code).short;
    return { lo: near[0].lo, hi: near[0].hi, tier: tierOf(near[0].hi), text: near.map((d) => `${mins(d)} to ${name(d.code)}`).join(', ') };
  };
  // The ratio divides by the BAH of the duty station's housing area (rules v0.7, QUESTIONS 62): the chosen
  // base's MHA, or (base not chosen) the nearest base's, which the line then names.
  const ratioBase = (n) => base ?? data.bases.find((b) => b.code === nearestOf(n)[0]?.code) ?? null;
  const ratioOf = (n) => { const b = ratioBase(n); return b ? n.ratios[b.mha]?.[a.band]?.[br] ?? null : null; };
  const placesIn = (tiers) => data.neighborhoods
    .map((n) => ({ n, drive: driveOf(n) }))
    .filter((x) => x.drive && tiers.includes(x.drive.tier))
    .sort((x, y) => x.drive.lo - y.drive.lo || x.drive.hi - y.drive.hi || x.n.name.localeCompare(y.n.name));
  // Base housing areas a family at this base would look at: the ones LMH ties to the base and
  // the ones it ties to no base (as the base page lists them). Base not chosen: all of them.
  // Camp Pendleton (rules v0.5): the untied areas are back, each with the Pendleton base page's caveat
  // (eligibility unconfirmed, PRD Q9). `caveat(ar)` is that sentence and its source, or null.
  const areas = data.areas
    .filter((ar) => !base || ar.base_group === 'NONE' || (data.groupBases[ar.base_group] ?? []).includes(base.code))
    .map((ar) => ({ ar, drive: driveOf(ar) }))
    .sort((x, y) => (x.drive?.lo ?? 999) - (y.drive?.lo ?? 999) || x.ar.name.localeCompare(y.ar.name));
  const caveat = (ar) => (base?.code === 'PENDLETON' && ar.base_group === 'NONE' ? {
    text: 'We haven’t confirmed whether Camp Pendleton families can apply here. Ask LMH',
    source: { url: '/base/camp-pendleton/#housing-untied', title: 'Camp Pendleton (base page)', dates: `Eligibility note: ${data.pendletonUntied.written}` },
  } : null);
  const bandSpan = gradeSpan(a.band);
  const waitOf = (ar) => {
    const rows = ar.waits.filter((w) => overlaps(gradeSpan(w.band), bandSpan) && (br === 4 ? w.br >= 4 : w.br === br));
    const known = rows.filter((w) => w.lo != null);
    if (!known.length) return { rows: rows.length, lo: null, hi: null, first: null };
    // lo–hi is the range across every matching row (the lead shows it); `first` is the one row that starts
    // soonest, with its own range, for "the shortest wait is …" (rules v0.4: no more "1–18 months").
    const first = [...known].sort((x, y) => x.lo - y.lo || x.hi - y.hi)[0];
    return { rows: rows.length, lo: Math.min(...known.map((w) => w.lo)), hi: Math.max(...known.map((w) => w.hi)), first: { lo: first.lo, hi: first.hi } };
  };
  const brText = `${br}-bed`;
  // A line with a ratio links the page with ?base= for the base the ratio uses, so the page shows that table.
  const nbSource = (n, ...what) => ({
    url: `/communities/${n.slug}/${what.includes('ratio') && ratioBase(n) ? `?base=${ratioBase(n).slug}` : ''}`, title: n.name,
    dates: what.map((w) => `${DATE_LABEL[w]}: ${data.dates[w]}`).join('. '),
  });
  // A base housing area page, dated only by the facts the line uses: 'waits' (Camp Pendleton isn't on the
  // wait list, so its page dates that section by the LMH pages), 'pets-list' (printed on the wait list),
  // 'pets-lmh' (stated on LMH's community pages) and 'commute'.
  const AREA_DATE = {
    waits: (ar) => (ar.waitsInData === false ? `Wait times: LMH pages ${ar.lmhVintage}` : `Waits: ${data.dates.waits}`),
    'pets-list': () => `Pets: ${data.dates.waits}`,
    'pets-lmh': (ar) => `Pets: LMH pages ${ar.lmhVintage}`,
    commute: () => `Commute: ${data.dates.commute}`,
  };
  const areaSource = (ar, ...what) => ({ url: `/base-housing/${ar.id}/`, title: `${ar.name} base housing`, dates: what.map((w) => AREA_DATE[w](ar)).join('. ') });
  const linkSource = (id) => {
    const l = data.links[id];
    return { url: l.url, title: l.title, dates: `verified ${l.verified_on}`, incentive: l.incentive };
  };
  const ext = (id, text) => ({ url: data.links[id].url, text: text ?? data.links[id].title, incentive: data.links[id].incentive });
  const baseSource = (what) => (base
    ? { url: `/base/${base.slug}/`, title: base.short, dates: what.map((w) => `${DATE_LABEL[w]}: ${data.dates[w]}`).join('. ') }
    : { url: '/neighborhoods/', title: 'Neighborhoods', dates: what.map((w) => `${DATE_LABEL[w]}: ${data.dates[w]}`).join('. ') });
  return { a, data, config, base, baseName, br, brText, open, driveOf, ratioBase, ratioOf, placesIn, areas, caveat, waitOf, nbSource, areaSource, linkSource, ext, baseSource };
}

const DATE_LABEL = {
  commute: 'Commute', ratio: 'Rent ratio', bah: 'BAH', ownership: 'Mello-Roos', schools: 'Schools',
  childcare: 'Child care', waits: 'Waits', bedroomRule: 'Bedroom rule',
};

const MELLO = {
  none: 'no Mello-Roos district listed',
  check: 'Mello-Roos: check the parcel',
  charge: 'Mello-Roos charge on the tax bill',
  unmatched: 'Mello-Roos not matched yet',
};

// --- Leads (rank-1 priority) ---------------------------------------------------------

function placeLine(c, { n, drive }, firstFact) {
  const r = c.ratioOf(n);
  const at = c.base || !c.ratioBase(n) ? '' : ` at ${c.ratioBase(n).short}`; // base not chosen: say whose allowance
  const ratio = r ? `${c.brText} rent is ${span(r[0], r[1], '%')} of the ${c.a.band} housing allowance${at}` : `no rent-to-allowance ratio for ${c.brText}`;
  const parts = firstFact === 'drive' ? [drive.text, ratio] : [ratio, drive.text];
  if (c.open.buying) parts.push(MELLO[n.mello]);
  return {
    text: `${n.name}: ${parts.join('; ')}`,
    sources: [c.nbSource(n, 'commute', 'ratio', ...(c.open.buying ? ['ownership'] : []))],
  };
}

// A line about one base housing area, with the Pendleton caveat appended (and its source) when it applies.
function withCaveat(c, ar, line) {
  const cv = c.caveat(ar);
  return cv ? { ...line, text: `${line.text}. ${cv.text}`, sources: [...line.sources, cv.source] } : line;
}

function areaLine(c, { ar, drive }) {
  let wait;
  if (ar.waitsInData === false) wait = 'wait times aren’t in our data';
  else {
    const w = c.waitOf(ar);
    wait = w.lo != null
      ? `latest wait for ${c.a.band}, ${c.brText}: ${span(w.lo, w.hi)} months`
      : w.rows ? `no ${c.brText} homes open to ${c.a.band} on the ${c.data.dates.month} list` : `no ${c.brText} rows for ${c.a.band} on the ${c.data.dates.month} list`;
  }
  return withCaveat(c, ar, { text: `${ar.name}: ${drive ? `${drive.text}; ` : ''}${wait}`, sources: [c.areaSource(ar, 'waits', ...(drive ? ['commute'] : []))] });
}

function leadPlaces(c) {
  const rows = c.placesIn(['under30']);
  const sections = [{
    id: 'lead',
    heading: c.base ? `Neighborhoods under 30 minutes from ${c.base.short}` : 'Neighborhoods under 30 minutes from their nearest base',
    note: `Sorted by the weekday drive at 0700.${c.base ? '' : ' You’re not sure of your base yet, so each one shows its two nearest bases.'} Rent is HUD’s reference rent for ${c.br} bedrooms${c.br === 4 && c.a.bedrooms !== 'help' ? ' (the largest row we have)' : ''} as a share of the ${c.a.band} housing allowance${c.base ? ` at ${c.base.short}` : ' at each neighborhood’s nearest base'} (BAH follows your duty station).`,
    lines: rows.map((x) => placeLine(c, x, 'drive')),
  }];
  if (c.open.housing && c.areas.length) {
    sections.push({
      id: 'lead-housing',
      heading: c.base ? `Base housing for ${c.base.short}` : 'Base housing',
      note: c.base ? 'The areas Liberty Military Housing ties to this base, and the ones it ties to no base, by the 0700 drive.' : 'Every base housing area, by the 0700 drive to its two nearest bases.',
      lines: c.areas.map((x) => areaLine(c, x)),
    });
  }
  return sections;
}

function leadCost(c) {
  const rows = c.placesIn(NEAR_TIERS).filter((x) => { const r = c.ratioOf(x.n); return r && r[1] <= 100; })
    .sort((x, y) => c.ratioOf(x.n)[0] - c.ratioOf(y.n)[0] || c.ratioOf(x.n)[1] - c.ratioOf(y.n)[1] || x.drive.lo - y.drive.lo || x.n.name.localeCompare(y.n.name));
  const lines = rows.length ? rows.map((x) => placeLine(c, x, 'ratio')) : [{
    text: `No neighborhood within 45 minutes of ${c.baseName} has ${c.brText} rent at or under the ${c.a.band} housing allowance.`,
    sources: [c.baseSource(['ratio', 'commute'])],
  }];
  return [{
    id: 'lead',
    heading: `Within 45 minutes, where ${c.brText} rent fits the ${c.a.band} allowance`,
    note: `Neighborhoods whose HUD reference rent for ${c.br} bedrooms is at or under 100% of the housing allowance for every grade in ${c.a.band}, lowest first.${c.base ? '' : ' You’re not sure of your base yet, so each one shows its two nearest bases.'}`,
    lines,
  }];
}

function leadSchools(c) {
  const rows = c.placesIn(NEAR_TIERS);
  const byDistrict = new Map();
  for (const x of rows) {
    for (const d of x.n.districts) {
      if (!byDistrict.has(d)) byDistrict.set(d, { name: d, places: [], first: x });
      byDistrict.get(d).places.push(x.n.name);
    }
  }
  const lines = [...byDistrict.values()].map((d) => {
    const url = c.data.districts[d.name];
    return {
      text: `${d.name}: serves ${list(d.places)}${url ? '' : '. No boundary lookup found yet; ask the district'}`,
      ext: url ? [{ url, text: 'District boundary lookup', incentive: 'Public school district' }] : [],
      sources: [c.nbSource(d.first.n, 'schools')],
    };
  });
  const nearest = rows[0];
  if (nearest) {
    lines.push({ text: 'Moving mid-year, or need help with enrollment? The School Liaison Officers are free', ext: [c.ext('slo-navy-san-diego'), c.ext('slo-mcas-miramar')], sources: [c.nbSource(nearest.n, 'schools')] });
  }
  lines.push({ text: 'Changing schools between states', ext: [c.ext('interstate-compact-military-children')], sources: [c.linkSource('interstate-compact-military-children')] });
  return [{
    id: 'lead',
    heading: `School districts within 45 minutes of ${c.baseName}`,
    note: 'Districts with a public school in the neighborhoods under 30 and 30–44 minutes away, nearest first. Your assigned school depends on your street, so check the boundary lookup before you sign a lease.',
    lines,
  }];
}

function leadChildcare(c) {
  const rows = c.placesIn(NEAR_TIERS);
  const lines = rows.map(({ n, drive }) => ({
    text: `${n.name} (${drive.text}): ${n.care.centers} licensed centers, ${n.care.infant} licensed for infants, ${n.care.homes} large family child care homes`,
    sources: [c.nbSource(n, 'childcare', 'commute')],
  }));
  const nearest = rows[0];
  if (nearest) {
    // The infant-care gap is in "Watch for" whenever a child is 0–2 (rules v0.3), so it isn't repeated here.
    lines.push({ text: 'The county’s free child care referral service', ext: [c.ext('ymca-childcare-resource-service')], sources: [c.nbSource(nearest.n, 'childcare')] });
    lines.push({ text: 'Requesting military child care', ext: [c.ext('militarychildcare-request-care')], sources: [c.nbSource(nearest.n, 'childcare')] });
  }
  return [{
    id: 'lead',
    heading: `Licensed child care within 45 minutes of ${c.baseName}`,
    note: 'Licensed centers and large family child care homes in each neighborhood under 30 and 30–44 minutes away, nearest first.',
    lines,
  }];
}

function leadSpouse(c) {
  return [{
    id: 'lead',
    heading: 'Your spouse’s job',
    note: '',
    lines: [
      { text: 'Spouse employment', ext: [c.ext('mos-msep')], sources: [c.linkSource('mos-msep')] },
      { text: 'California licensing for military spouses', ext: [c.ext('dca-military-expedited-licensure', 'Expedited licensure')], sources: [c.linkSource('dca-military-expedited-licensure')] },
      { text: 'California licensing for military spouses', ext: [c.ext('dca-military-temporary-licensure', 'Temporary licensure')], sources: [c.linkSource('dca-military-temporary-licensure')] },
      { text: 'Licenses from another state', ext: [c.ext('dca-federal-license-portability', 'Federal license portability')], sources: [c.linkSource('dca-federal-license-portability')] },
      { text: 'A second commute: every neighborhood page shows the 0700 drive to all eight bases. Drives to other work areas aren’t in our data yet', sources: [{ url: '/neighborhoods/', title: 'Neighborhood pages, Commute section', dates: `Commute: ${c.data.dates.commute}` }] },
    ],
  }];
}

function leadPets(c) {
  if (!c.open.housing) return [];
  // One line per distinct policy, naming its communities, unless the whole area shares one policy
  // (rules v0.3: "2 pets …; 2 pets … Upstairs …" told nobody which community was which).
  const lines = c.areas.filter(({ ar }) => ar.pets.length).flatMap(({ ar }) => {
    const groups = new Map();
    for (const p of ar.pets) {
      const key = `${p.from}|${p.policy}`;
      if (!groups.has(key)) groups.set(key, { ...p, communities: [] });
      groups.get(key).communities.push(p.community);
    }
    const all = [...groups.values()];
    if (all.length === 1 && all[0].communities.length === ar.communities) {
      return [withCaveat(c, ar, { text: `${ar.name} base housing: ${all[0].policy}`, sources: [c.areaSource(ar, `pets-${all[0].from}`)] })];
    }
    return all.map((g) => withCaveat(c, ar, { text: `${ar.name} base housing, ${list(g.communities)}: ${g.policy}`, sources: [c.areaSource(ar, `pets-${g.from}`)] }));
  });
  return lines.length ? [{ id: 'lead', heading: 'Pets in base housing', note: 'Pet policies as printed on the latest wait list, or as the LMH community page states them when the list doesn’t. Communities that state no policy aren’t listed.', lines }] : [];
}

// Priorities without a builder (the admin sequence, move logistics) get no lead until F2 exists.
export const LEADS = { where: leadPlaces, commute: leadPlaces, cost: leadCost, schools: leadSchools, childcare: leadChildcare, spouse: leadSpouse, pets: leadPets };

// --- Modifiers --------------------------------------------------------------------

// Most pets a printed policy allows: the largest alternative ("1 dog and 1 cat or 2 cats" -> 2).
export function petLimit(policy) {
  if (/\bno pets\b/i.test(policy)) return 0;
  const alts = policy.split(/\bor\b/i).map((alt) => [...alt.matchAll(/(\d+)\s*(?:pets?|dogs?|cats?)\b/gi)].reduce((n, m) => n + Number(m[1]), 0));
  const best = Math.max(...alts);
  return best > 0 ? best : null;
}

function modifiers(c) {
  const lines = [];
  const t = TIMELINES.find((x) => x.id === c.a.timeline);
  if (c.open.housing && t.windowMonths != null) {
    const waits = c.areas.filter(({ ar }) => ar.waitsInData !== false).map((x) => ({ ...x, w: c.waitOf(x.ar) })).filter((x) => x.w.lo != null);
    if (waits.length) {
      const shortest = [...waits].sort((x, y) => x.w.first.lo - y.w.first.lo || x.w.first.hi - y.w.first.hi || x.ar.name.localeCompare(y.ar.name))[0];
      // At or past the window (rules v0.4): reporting in under 30 days, a 1–3 month wait doesn't fit.
      if (shortest.w.first.lo >= t.windowMonths) {
        lines.push(withCaveat(c, shortest.ar, {
          text: `No base housing wait for ${c.a.band}, ${c.brText} on the ${c.data.dates.month} list fits your report window (${t.label.toLowerCase()}). The shortest is ${span(shortest.w.first.lo, shortest.w.first.hi)} months, at ${shortest.ar.name}. Plan on renting first and moving in when a home comes up`,
          sources: [c.areaSource(shortest.ar, 'waits')],
        }));
      }
    }
  }
  // A child 0–2: the infant-care gap, whatever the priorities (rules v0.3). Every neighborhood page's
  // Child care section states it; the line cites the nearest one to the base.
  if (hasInfant(c.a)) {
    const near = c.placesIn(NEAR_TIERS)[0] ?? c.placesIn(['45-60', '60plus'])[0];
    if (near) {
      lines.push({
        text: 'Infant care: small family child care homes (up to 8 children) aren’t in the child care counts. They’re licensed, but the state doesn’t publish them, and they’re often where infant care is. The way to find them is the county’s free referral service',
        ext: [c.ext('ymca-childcare-resource-service')],
        sources: [c.nbSource(near.n, 'childcare')],
      });
    }
  }
  // Camp Pendleton: no wait data. Say so once, with the page that already states the gap.
  const pendleton = c.data.areas.find((ar) => ar.waitsInData === false);
  if (c.open.housing && c.base?.code === 'PENDLETON' && pendleton) {
    lines.push({
      text: 'Camp Pendleton’s base housing wait times aren’t in our data. Contact LMH or the Camp Pendleton housing office for the current wait',
      sources: [{ url: `/base-housing/${pendleton.id}/`, title: `${pendleton.name} base housing`, dates: `Wait times: LMH pages ${pendleton.lmhVintage}` }],
    });
  }
  const pets = c.a.cats + c.a.dogs;
  if (c.open.housing && pets > 2) {
    // ar.petLimits holds the policies as printed on the wait list; LMH-only wording has no number.
    const limited = c.areas.filter(({ ar }) => ar.petLimits.some((p) => petLimit(p) != null));
    if (limited.length && limited.every(({ ar }) => ar.petLimits.every((p) => (petLimit(p) ?? 0) <= 2))) {
      lines.push({
        text: `You listed ${pets} pets. Every pet policy printed for these base housing areas allows two at most${limited.some(({ ar }) => c.caveat(ar)) ? '. We haven’t confirmed whether Camp Pendleton families can apply to the areas LMH ties to no base. Ask LMH' : ''}`,
        // Every area the claim covers (rules v0.4); the base housing index doesn't list pet policies.
        // For Camp Pendleton, the untied areas among them carry the caveat (rules v0.5).
        sources: [...limited.map(({ ar }) => c.areaSource(ar, 'pets-list')), ...(limited.some(({ ar }) => c.caveat(ar)) ? [c.caveat(limited.find(({ ar }) => c.caveat(ar)).ar).source] : [])],
      });
    }
  }
  return lines.length ? [{ id: 'watch', heading: 'Watch for', note: '', lines }] : [];
}

function bedroomSection(c) {
  if (c.a.bedrooms !== 'help') return [];
  const h = bedroomHelper(c.a);
  const senior = !['E1–E4', 'E5–E6'].includes(c.a.band);
  const used = h.computed === h.row ? `The plan uses the ${h.row}-bedroom rows.` : h.computed < h.row ? `The smallest row we have is ${h.row} bedrooms, so the plan uses that.` : `The largest row we have is ${h.row} bedrooms, so the plan uses that.`;
  const area = c.areas[0]?.ar ?? c.data.areas[0];
  return [{
    id: 'bedrooms',
    heading: 'Bedrooms',
    note: '',
    lines: [{
      text: `${h.computed} ${h.computed === 1 ? 'bedroom' : 'bedrooms'} under Navy Housing’s guidelines for enlisted families, applied to your household. ${used}${senior ? ' CNIC lists no bedroom standard for officers and senior enlisted, so this is only a starting point; ask the Housing Service Center.' : ''}`,
      ext: [c.ext(c.data.bedroomRule.link_id, 'CNIC, Applying for Housing')],
      sources: [{ url: `/base-housing/${area.id}/`, title: `Bedroom guidelines (${area.name} base housing page)`, dates: `${DATE_LABEL.bedroomRule}: ${c.data.dates.bedroomRule}` }],
    }],
  }];
}

// The BAH for the family's band at their base (rules v0.6, Brian 2026-10-20): one line per grade in the
// band, with dependents first, each with its year and MHA, citing the base page's BAH table and its date.
// No base chosen: no line (the two MHAs differ, and the plan doesn't know which applies).
export function bahLine(t, g) {
  return `${g.grade}: $${g.with.toLocaleString('en-US')} a month with dependents, $${g.without.toLocaleString('en-US')} without (${t.year} BAH, ${t.area} area, MHA ${t.mha})`;
}
function bahSection(c) {
  if (!c.base) return [];
  const t = c.data.bah[c.base.mha];
  if (!t) return [];
  const source = { url: `/base/${c.base.slug}/#bah`, title: `${c.base.short} (base page, Housing allowance)`, dates: `${DATE_LABEL.bah}: ${c.data.dates.bah}` };
  return [{
    id: 'bah',
    heading: `Your housing allowance at ${c.base.short}`,
    note: 'BAH follows your duty station, not where you live.',
    lines: t.grades.filter((g) => g.band === c.a.band).map((g) => ({ text: bahLine({ ...t, mha: c.base.mha }, g), sources: [source] })),
  }];
}

function skipList(c) {
  const lines = [];
  if (!hasSchoolAge(c.a)) lines.push({ text: 'Schools sections: no children 6–18 in your household', sources: [{ url: '/neighborhoods/', title: 'Neighborhood pages, Schools section', dates: `Schools: ${c.data.dates.schools}` }] });
  if (!hasUnder6(c.a)) lines.push({ text: 'Child care sections: no children under 6 in your household', sources: [{ url: '/neighborhoods/', title: 'Neighborhood pages, Child care section', dates: `Child care: ${c.data.dates.childcare}` }] });
  if (!c.open.buying) lines.push({ text: 'Mello-Roos and home values under Buying: you’re not buying', sources: [{ url: '/neighborhoods/', title: 'Neighborhood pages, Cost section', dates: `Mello-Roos: ${c.data.dates.ownership}` }] });
  if (!c.open.housing) lines.push({ text: 'Base housing pages and the base housing half of your base page: you’re not considering base housing', sources: [{ url: '/base-housing/', title: 'Base housing', dates: `Base housing: ${c.data.dates.waits}` }] });
  return lines.length ? [{ id: 'skip', heading: 'You can skip', note: 'Parts of the site your answers make irrelevant.', lines }] : [];
}

function tradeoff(c) {
  const [first, second] = c.a.priorities;
  if (!first || !second) return [];
  const pair = c.config.tradeoffs.find((p) => (p.first === first && p.second === second) || (p.either_order && p.first === second && p.second === first));
  if (!pair) return [];
  return [{ id: 'tradeoff', heading: 'The tradeoff', note: '', lines: [{ text: pair.text, sources: pair.sources }] }];
}

// --- The plan ----------------------------------------------------------------------

// Why a first priority has no lead of its own (QUESTIONS 45, Brian 2026-10-11: lead with the
// second priority and say so plainly). Shown in the lead's note, which states no facts.
const NO_LEAD_REASON = {
  admin: 'The move sequence isn’t written yet',
  logistics: 'The move sequence isn’t written yet',
  pets: 'Rental pet policies aren’t on this site yet, and base housing (the only pet rules we have) is off your list',
};
const leadFor = (id, c) => {
  const sections = (LEADS[id]?.(c) ?? []).filter((s) => s.lines.length);
  return sections.length ? sections : null;
};

function lead(c) {
  const [first, second] = c.a.priorities;
  const own = leadFor(first, c);
  if (own) return own;
  const label = (id) => c.config.priorities.find((p) => p.id === id)?.label ?? id;
  const reason = NO_LEAD_REASON[first] ?? `Nothing on this site answers “${label(first)}” for your answers yet`;
  const fallback = second ? leadFor(second, c) : null;
  if (fallback) {
    const [top, ...rest] = fallback;
    return [{ ...top, note: `${reason}, so this plan leads with your second priority, “${label(second)}”.${top.note ? ` ${top.note}` : ''}` }, ...rest];
  }
  return [{ id: 'lead-missing', heading: 'No lead yet', note: `${reason}, so this plan has no lead yet.`, lines: [], notice: true }];
}

export function buildPlan(answers, data, config) {
  const missing = missingAnswers(answers);
  if (missing.length) throw new Error(`buildPlan: unanswered questions ${missing.join(', ')}`);
  const c = context(answers, data, config);
  return {
    rules_version: RULES_VERSION,
    sections: [
      ...lead(c),
      ...bedroomSection(c),
      ...bahSection(c),
      ...modifiers(c),
      ...tradeoff(c),
      ...skipList(c),
    ].filter((s) => s.lines.length || s.notice),
  };
}
