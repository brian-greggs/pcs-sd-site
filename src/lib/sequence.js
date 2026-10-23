// The move sequence (F2): phases, anchors and the fixed lines every sequence page carries. Plain JavaScript,
// shared by the pages, the starting plan's rules (src/lib/intake/rules.js) and the checks, so the wording
// can't drift between them. The steps and forms themselves come only from src/data/sequence_*.json.

// PRD §5 phases, in order, with the URL slug for /sequence/<slug>/.
export const PHASES = [
  { key: 'orders', slug: 'orders', label: 'Orders in hand', blurb: 'From the day you have orders' },
  { key: '90_60_30', slug: 'before-you-go', label: '90, 60 and 30 days out', blurb: 'The months before you detach' },
  { key: 'transit', slug: 'on-the-road', label: 'On the road', blurb: 'Between detaching and reporting' },
  { key: 'arrival', slug: 'arrival', label: 'Arrival', blurb: 'Reporting in to San Diego' },
  { key: 'first_30_days', slug: 'first-30-days', label: 'First 30 days', blurb: 'Delivery, claims and settling in' },
];
export const phaseByKey = (key) => PHASES.find((p) => p.key === key);

// What a step's timing counts from.
export const ANCHOR_LABEL = {
  orders_in_hand: 'From when you have orders',
  detachment: 'Counted from your detachment date',
  report_date: 'Counted from your report date',
  address_in_hand: 'Once you have a San Diego address',
  delivery_date: 'Counted from your household goods delivery date',
};

// Q3 (when do you report?) → the phase the plan's admin and move-logistics lead opens on (PRD §10.1).
export const TIMELINE_PHASE = {
  under30: 'arrival',
  '30-60': '90_60_30',
  '60-90': '90_60_30',
  '90plus': 'orders',
  'no-orders': 'orders',
};

// Top of every sequence page (Brian 2026-10-20).
export const SEQUENCE_DISCLAIMER = 'This is the order the official rules imply. Your command, CPPA and transportation office have the final word.';
// The Marine Corps bases' pages and every sequence page (Brian 2026-10-20). USMC rows stay hidden.
export const NAVY_RULES_NOTE = 'The forms and deadlines here are Navy rules. Marine Corps steps aren’t covered yet.';
export const MARINE_BASES = ['PENDLETON', 'MIRAMAR', 'MCRD'];

// Who a "Not yet confirmed" line sends the reader to.
export const ASK_LABEL = {
  CPPA: 'your CPPA (Command Pay and Personnel Administrator)',
  PPPO: 'your PPPO (the personal property office at your transportation office)',
  HSC: 'the Housing Service Center (HSC)',
  NAVY_HHG: 'Navy Household Goods, 855-444-6683', // Brian 2026-10-22 (F2-26); the number is on NAVSUP's PPM page
};
export const unconfirmedLine = (u) => `Not yet confirmed: ${u.text.replace(/\.$/, '')}. Ask ${ASK_LABEL[u.ask]}.`;
// A row's notes: one paragraph per line of `note` (the export joins separate notes with a newline).
export const noteParas = (note) => (note ? note.split('\n').filter(Boolean) : []);

const BASE_NAMES = {
  NBSD: 'Naval Base San Diego', NASNI: 'NAS North Island', NAB: 'Naval Amphibious Base Coronado', NBPL: 'Naval Base Point Loma',
  NMCSD: 'Naval Medical Center San Diego', MIRAMAR: 'MCAS Miramar', MCRD: 'MCRD San Diego', PENDLETON: 'Camp Pendleton',
};
// Who a step is for, in words; null when it applies to everyone.
export function appliesText(a) {
  const parts = [];
  if (Array.isArray(a.base)) parts.push(`Only at ${a.base.map((b) => BASE_NAMES[b]).join(' and ')}`);
  if (a.housing_choice === 'base_housing') parts.push('If you’re applying for base housing');
  if (a.kids === 'yes') parts.push('Families with children');
  else if (a.dependents === 'yes') parts.push('If family members are moving with you');
  if (a.pets === 'yes') parts.push('If you have pets');
  if (a.vehicles === 'yes') parts.push('If you have a vehicle');
  if (a.vehicles === 'ppm') parts.push('If you’re moving some or all of your things yourself (PPM)');
  return parts.length ? parts.join('. ') : null;
}

// A row's date line: every distinct retrieval date of the pages it cites.
export function citeDates(row) {
  const all = [...row.sources, ...(row.alternatives ?? []).flatMap((a) => a.sources)].map((c) => c.retrieved_on);
  const days = [...new Set(all)].sort();
  return `Official pages retrieved ${days.join(' and ')}`;
}
export function citeNames(row) {
  const all = [...row.sources, ...(row.alternatives ?? []).flatMap((a) => a.sources)];
  return [...new Set(all.map((c) => `${c.agency}, ${c.title}`))].join('; ');
}

// DLA rates (DTMO's primary table, src/data/sequence_dla.json): shown on this step and with this form, for the
// reader's pay band (the same picker and storage key as the BAH lines).
export const DLA_STEP = 'pre-dla-advance';
export const DLA_FORM = 'navy-dla';
export const DLA_DEFAULT_BAND = 'E5–E6';
export const usd = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const dlaLine = (r) => `${r.grade}: ${usd(r.with_dependents_usd)} with dependents, ${usd(r.without_dependents_usd)} without dependents`;

// Every timing counted from the report or detachment date links to the effective-date line on /sequence/ (Brian
// 2026-10-22), which quotes DTMO's computation example.
export const EFFECTIVE_ANCHORS = ['report_date', 'detachment'];
export const EFFECTIVE_HREF = '/sequence/#effective-date';
export const EFFECTIVE_LINK_TEXT = 'how your orders’ effective date is figured';

export const stepHref = (step) => `/sequence/${phaseByKey(step.phase).slug}/#${step.id}`;
export const formHref = (id) => `/sequence/forms/#${id}`;
