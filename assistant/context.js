// The reader's move, as the home page's chip shows it and sends it with a question (v1.1.0): base, pay band and
// household, from the starting plan's answers in this browser. Shared by the home page (the chip, "What's sent?",
// the request body), the server (assistant/ask.js drops anything else) and the checks, so all of them read the
// same allow list.
//
// Only coarse answers go: the base code, the pay band, whether a spouse or partner is moving, and which age groups
// the children are in (no counts). Never the timeline, bedrooms, pets, "open to", priorities, or anything typed.
// The intake asks no MOS, names or free text, and nothing here could carry them: every value must be one the
// intake offers.

export const CONTEXT_FIELDS = ['base', 'band', 'partner', 'kids'];

// Code → page slug, full name and the chip's short name. The codes and slugs match src/lib/bases.ts (the eval's
// self-test checks every slug's page is in the corpus).
export const BASES = {
  NBSD: { slug: 'naval-base-san-diego', name: 'Naval Base San Diego', short: 'NBSD' },
  MIRAMAR: { slug: 'miramar', name: 'MCAS Miramar', short: 'Miramar' },
  NASNI: { slug: 'north-island', name: 'NAS North Island', short: 'North Island' },
  NAB: { slug: 'naval-amphibious-base', name: 'Naval Amphibious Base Coronado', short: 'NAB Coronado' },
  NBPL: { slug: 'point-loma', name: 'Naval Base Point Loma', short: 'Point Loma' },
  NMCSD: { slug: 'naval-medical-center', name: 'Naval Medical Center San Diego', short: 'NMCSD' },
  MCRD: { slug: 'mcrd', name: 'MCRD San Diego', short: 'MCRD' },
  PENDLETON: { slug: 'camp-pendleton', name: 'Camp Pendleton', short: 'Pendleton' },
  unsure: { slug: null, name: 'not sure yet', short: 'Base not set' },
};
export const BANDS = ['E1–E4', 'E5–E6', 'E7–E9', 'W1–W5', 'O1–O3E', 'O1–O3', 'O4–O6'];
export const KID_GROUPS = ['0-2', '3-5', '6-9', '10-13', '14-18'];
const ages = (kids) => kids.map((g) => g.replace('-', '–')).join(', ');

// The allowed fields with allowed values, or null. The server runs every request's `context` through this; the
// home page builds its own the same way, so what it sends always survives unchanged.
export function cleanContext(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const c = {};
  if (typeof raw.base === 'string' && Object.hasOwn(BASES, raw.base)) c.base = raw.base; // a string: ["NBSD"] isn't a base (QA L5)
  if (BANDS.includes(raw.band)) c.band = raw.band;
  // Household: partner and kids come together, from question 4, or not at all.
  if (typeof raw.partner === 'boolean' && Array.isArray(raw.kids)) {
    c.partner = raw.partner;
    c.kids = KID_GROUPS.filter((g) => raw.kids.includes(g));
  }
  return Object.keys(c).length ? c : null;
}

// From the starting plan's stored answers (localStorage 'pcs-sd:intake'): base, band, and the household once
// question 4 is answered (partner set); the children as the age groups that have any, never how many.
export function contextFromAnswers(a) {
  if (!a || typeof a !== 'object') return null;
  const household = typeof a.partner === 'boolean'
    ? { partner: a.partner, kids: KID_GROUPS.filter((g) => Number(a.kids?.[g]) > 0) }
    : {};
  return cleanContext({ base: a.base, band: a.band, ...household });
}

const householdShort = (c) => {
  if (c.partner == null) return null;
  const kids = c.kids.length ? `kids ${ages(c.kids)}` : 'no kids';
  return c.partner ? `spouse, ${kids}` : c.kids.length ? kids : 'just you';
};
const householdFull = (c) => {
  if (c.partner == null) return null;
  return `${c.partner ? 'spouse or partner' : 'no spouse or partner'}; ${c.kids.length ? `children aged ${ages(c.kids)}` : 'no children'}`;
};

// The chip: "NBSD · E5–E6 · spouse, kids 6–9" (short) and the same in full words for the menu and screen readers.
export function chipSummary(c) {
  if (!c) return null;
  const short = [c.base && BASES[c.base].short, c.band, householdShort(c)].filter(Boolean).join(' · ');
  const full = [c.base && (c.base === 'unsure' ? 'base not sure yet' : BASES[c.base].name), c.band && `pay grade ${c.band}`, householdFull(c)].filter(Boolean).join(' · ');
  return { short, full };
}

// "What's sent?": one line per field that goes, as [field, plain label, value]; the raw JSON under the list has the
// field names and values exactly as sent.
export function contextLines(c) {
  if (!c) return [];
  const out = [];
  if (c.base) out.push(['base', 'Base', c.base === 'unsure' ? 'not sure yet' : BASES[c.base].name]);
  if (c.band) out.push(['band', 'Pay grade', c.band]);
  if (c.partner != null) out.push(['partner', 'Spouse or partner', c.partner ? 'yes' : 'no']);
  if (c.kids) out.push(['kids', 'Children’s age groups', c.kids.length ? `${ages(c.kids)} (not how many)` : 'none']);
  return out;
}

// The request body: the question, the previous turn when there is one, the context when the chip is on.
// Nothing else.
export function requestBody(question, previous, context) {
  const body = { question };
  if (previous) body.previous = previous;
  if (context) body.context = context;
  return body;
}

// For the prompt: "reporting to Camp Pendleton; pay band E5–E6; spouse or partner; children aged 6–9".
export function householdLine(c) {
  if (!c) return null;
  return [
    c.base && (c.base === 'unsure' ? 'base not decided yet' : `reporting to ${BASES[c.base].name}`),
    c.band && `pay band ${c.band}`,
    householdFull(c),
  ].filter(Boolean).join('; ');
}

// The base page to route a where-to-live question to (assistant/retrieve.js), when the reader's base is known.
export const basePage = (c) => (c?.base && BASES[c.base]?.slug ? `/base/${BASES[c.base].slug}/` : null);

// What retrieval reads from the context (assistant/retrieve.js search): the base page for the where-to-live route,
// the base's slug for the tied-pages boost and its variants, and the pay band for its variants. Never words.
export const routeOf = (c) => ({ basePage: basePage(c), base: (c?.base && BASES[c.base]?.slug) || null, band: c?.band ?? null });
