// Fixed answers for questions the site never answers, checked before retrieval or a
// model call. Deterministic, so the eval can test them without a model. (The BAH dollar
// filter on model output was removed 2026-10-20: BAH figures from the sections are allowed.)
import { DEMOGRAPHIC_TERMS, DEMOGRAPHIC_ALLOWED } from '../scripts/principle_lists.mjs';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DEMO_RE = new RegExp(`\\b(?:${DEMOGRAPHIC_TERMS.map(escapeRe).join('|')})\\b`, 'i');
const DEMO_EXTRA = [
  /\bwho (?:lives|live|is living)\b/i, /\bwhat (?:kind|type|sort) of (?:people|neighbou?rs|families|residents|crowd)\b/i,
  /\bwhat are the (?:people|neighbou?rs|residents) like\b/i, /\b(?:people|neighbou?rs|residents) (?:there|in|around)\b.*\blike\b/i,
  /\b(?:mostly|majority)\s+(?:white|black|mexican|asian|hispanic|latino|filipino|military|older|young)\b/i,
  /\b(?:rich|poor|wealthy|ghetto|hood|bougie|snobby|trashy|classy)\b/i,
];
export function isDemographic(q) {
  let t = q;
  for (const re of DEMOGRAPHIC_ALLOWED) t = t.replace(re, ' ');
  return DEMO_RE.test(t) || DEMO_EXTRA.some((re) => re.test(t));
}

const WHO = /\b(?:realtors?|real[- ]estate (?:agents?|brokers?)|buyer'?s agents?|listing agents?|agents?|brokers?|lenders?|mortgage (?:brokers?|lenders?|companies|company)|loan officers?|movers?|moving (?:companies|company)|landlords?|property (?:managers?|management(?: companies| company)?))\b/i;
const ASK = /\b(?:recommend|recommendation|which|who|best|good|reputable|trust|use|suggest|name|know (?:a|any)|should i (?:call|use|go with))\b/i;
export const isReferral = (q) => WHO.test(q) && ASK.test(q) && !/\btravel agent\b/i.test(q);

export const GUARD_TEXT = {
  referral: 'This site doesn’t name or recommend realtors, lenders, movers or landlords. Nobody pays us for an introduction and we take no referral fees, so we don’t point you at anyone. What we do have: rent against your housing allowance on every neighborhood page, base housing waits and how to apply, and the Navy Housing Service Center, where every family checks in, even if you plan to rent off base.',
  demographic: 'This site doesn’t describe places by who lives there. We describe them by the commute, the cost against your housing allowance, school access, hazards and climate, so you can weigh the facts for your own household.',
};
