// What the home page's conversation shows around an answer, as plain functions of the /api/ask reply (no DOM), so
// scripts/check_frontend.mjs can test them in Node: the source chip's latest date, the one related-page card, and
// the follow-up suggestions. Nothing here calls the model or the network.

// The latest verified date among the cited sections (YYYY-MM-DD or YYYY-MM; both sort as text).
export const latestDate = (citations = []) => citations.map((c) => c.verified_on).filter(Boolean).sort().at(-1) ?? null;

// One card: the top cited section's page, linked to that section; for "I don't have that", the nearest page.
export function relatedPage(reply) {
  const top = reply?.citations?.[0];
  if (top?.url) return { url: top.url, title: top.title ?? top.label, sub: top.section && top.section !== top.title ? top.section : undefined };
  if (reply?.nearest?.url) return { url: reply.nearest.url, title: reply.nearest.title, sub: 'Nearest page' };
  return null;
}

// Follow-ups from the cited sections: on a neighborhood, base housing or base page, the page's other sections the
// answer didn't cite, asked about that page (at most three). The section ids are the pages' own anchors.
const TOPICS = {
  communities: [
    ['commute', (t) => `How long is the drive from ${t} at 0700?`],
    ['cost', (t) => `How does rent in ${t} compare with BAH?`],
    ['schools', (t) => `Which schools serve ${t}?`],
    ['hazards', (t) => `What hazards should we know about in ${t}?`],
    ['childcare', (t) => `What child care is there in ${t}?`],
  ],
  'base-housing': [
    ['wait-times', (t) => `How long is the wait for ${t}?`],
    ['apply', (t) => `How do I apply for ${t}?`],
    ['commute', (t) => `How long is the drive from ${t} at 0700?`],
    ['schools', (t) => `Which schools serve ${t}?`],
  ],
  base: [
    ['tier-under30', (t) => `Which neighborhoods are under 30 minutes from ${t}?`],
    ['housing-tied', (t) => `What base housing is tied to ${t}?`],
    ['bah-table', (t) => `What’s the BAH at ${t}?`],
  ],
};
const MAX_FOLLOW_UPS = 3;
export function followUps(reply, question = '') {
  if (reply?.kind !== 'answer' || !reply.citations?.length) return [];
  const top = reply.citations[0];
  const m = top.url?.match(/^\/(communities|base-housing|base)\/[^/]+\/(?:#(.*))?$/);
  if (!m || !top.title) return [];
  const page = top.url.split('#')[0];
  const cited = new Set(reply.citations.filter((c) => c.url.split('#')[0] === page).map((c) => c.url.split('#')[1]));
  const asked = question.trim().toLowerCase();
  return TOPICS[m[1]].filter(([id]) => !cited.has(id)).map(([, ask]) => ask(top.title))
    .filter((s) => s.toLowerCase() !== asked).slice(0, MAX_FOLLOW_UPS);
}
