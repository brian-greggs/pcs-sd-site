// /api/ask request handling, kept out of the Pages Function file so the eval can run
// it in Node. Order: validate → fixed answers (referral, demographic) → retrieve →
// "I don't have that" when nothing relevant → STUB (no key or no model set: return the
// chunks and the assembled prompt) or LIVE (call the model, filter its output).
//
// Nothing here logs a question or an answer. Errors are logged by type and status only.
import Anthropic from '@anthropic-ai/sdk';
import { search } from './retrieve.js';
import { SYSTEM_PROMPT, NO_ANSWER, userMessage } from './prompt.js';
import { isReferral, isDemographic, GUARD_TEXT, filterBahDollars } from './guards.js';

export const MAX_QUESTION = 500;

// Intake context the family can choose to send (base, pay band, kids' age groups, top 2 priorities).
// Anything else in the request is dropped; every value must be one the intake offers.
const BASES = {
  NBSD: 'Naval Base San Diego', MIRAMAR: 'MCAS Miramar', NASNI: 'NAS North Island', NAB: 'Naval Amphibious Base Coronado',
  NBPL: 'Naval Base Point Loma', NMCSD: 'Naval Medical Center San Diego', MCRD: 'MCRD San Diego', PENDLETON: 'Camp Pendleton', unsure: 'not sure yet',
};
const BANDS = ['E1–E4', 'E5–E6', 'E7–E9', 'W1–W5', 'O1–O3E', 'O1–O3', 'O4–O6'];
const KID_GROUPS = ['0-2', '3-5', '6-9', '10-13', '14-18'];
// Q8 labels come with the corpus (scripts/build_corpus.mjs copies src/config/intake/priorities.json
// into it). Not a JSON import: Node needs `with { type: 'json' }` for one, and the wrangler 3 that
// Cloudflare Pages uses to compile functions/ can't parse that syntax (LESSONS, session 5c).
const priorityLabels = (index) => Object.fromEntries((index?.priorities ?? []).map((p) => [p.id, p.label]));

export function cleanContext(raw, PRIORITY = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const c = {};
  if (Object.hasOwn(BASES, raw.base)) c.base = raw.base;
  if (BANDS.includes(raw.band)) c.band = raw.band;
  if (Array.isArray(raw.kids)) c.kids = KID_GROUPS.filter((g) => raw.kids.includes(g));
  if (Array.isArray(raw.priorities)) c.priorities = raw.priorities.filter((p, i, xs) => Object.hasOwn(PRIORITY, p) && xs.indexOf(p) === i).slice(0, 2);
  return Object.keys(c).length ? c : null;
}
export function householdLine(c, PRIORITY = {}) {
  if (!c) return null;
  return [
    c.base && `reporting to ${BASES[c.base]}`,
    c.band && `pay band ${c.band}`,
    c.kids && (c.kids.length ? `children aged ${c.kids.map((g) => g.replace('-', '–')).join(', ')}` : 'no children'),
    c.priorities?.length && `top priorities: ${c.priorities.map((p) => PRIORITY[p]).join(', then ')}`,
  ].filter(Boolean).join('; ');
}

const citation = (c) => ({ url: c.url, title: c.page_title, section: c.section_heading, verified_on: c.verified_on });
const citationsOf = (chunks) => [...new Map(chunks.map((c) => [c.url, citation(c)])).values()];
const nearestChunk = (r) => r.chunks[0] ?? null;

export async function handleAsk({ body, env, index, callModel = callClaude }) {
  const question = typeof body?.question === 'string' ? body.question.replace(/\s+/g, ' ').trim() : '';
  if (!question) return { status: 400, json: { error: 'Ask a question.' } };
  if (question.length > MAX_QUESTION) return { status: 400, json: { error: `Keep it under ${MAX_QUESTION} characters.` } };
  const labels = priorityLabels(index);
  const context = cleanContext(body.context, labels);
  const household = householdLine(context, labels);
  const live = Boolean(env.ANTHROPIC_API_KEY && env.ASSISTANT_MODEL);
  const mode = live ? 'live' : 'stub';
  const r = search(index, question);
  const pointer = r.relevant
    ? { url: nearestChunk(r).url, title: nearestChunk(r).page_title, verified_on: nearestChunk(r).verified_on }
    : { url: r.nearest.url, title: r.nearest.title };
  const pointTo = `The nearest page is ${pointer.title}: ${pointer.url}${pointer.verified_on ? ` (verified ${pointer.verified_on})` : ''}.`;

  // Fixed answers, before any model call.
  // These point to the page the question names (not a section of it), or the nearest page.
  for (const [kind, test] of [['referral', isReferral], ['demographic', isDemographic]]) {
    if (test(question)) {
      const top = nearestChunk(r);
      const page = top ? `The page for ${top.page_title} is ${top.url.split('#')[0]} (verified ${top.verified_on}).` : pointTo;
      return { status: 200, json: { mode, kind, answer: `${GUARD_TEXT[kind]} ${page}`, citations: top ? [{ ...citation(top), url: top.url.split('#')[0] }] : [] } };
    }
  }
  if (!r.relevant) {
    return { status: 200, json: { mode, kind: 'no_answer', answer: `${NO_ANSWER} ${pointTo}`, citations: [], nearest: r.nearest } };
  }

  const prompt = { system: SYSTEM_PROMPT, messages: [{ role: 'user', content: userMessage(question, r.chunks, r.nearest, household) }] };
  const citations = citationsOf(r.chunks);
  if (!live) {
    const missing = ['ANTHROPIC_API_KEY', 'ASSISTANT_MODEL'].filter((k) => !env[k]);
    return { status: 200, json: { mode, kind: 'retrieved', note: `STUB mode: ${missing.join(' and ')} not set, so no model was called. These are the sections that would be sent, and the prompt.`, citations, chunks: r.chunks, prompt, household } };
  }

  let out;
  try {
    out = await callModel({ apiKey: env.ANTHROPIC_API_KEY, model: env.ASSISTANT_MODEL, ...prompt });
  } catch (e) {
    const status = e instanceof Anthropic.APIError ? e.status : undefined;
    console.error('ask: model call failed', e?.constructor?.name ?? 'Error', status ?? '');
    const busy = e instanceof Anthropic.RateLimitError || (status ?? 0) >= 500 || e instanceof Anthropic.APIConnectionError;
    return { status: busy ? 503 : 502, json: { error: busy ? 'The assistant is busy. Try again in a minute.' : 'The assistant isn’t working right now.', citations } };
  }
  if (out.refused || !out.text) {
    return { status: 200, json: { mode, kind: 'declined', answer: `I can’t answer that one here. ${pointTo}`, citations } };
  }
  const filtered = filterBahDollars(out.text);
  return { status: 200, json: { mode, kind: 'answer', answer: filtered.text, blocked: filtered.blocked, citations } };
}

// One Messages API call. The model comes from ASSISTANT_MODEL (no default in code), so the
// request uses only parameters every current model accepts; thinking and effort stay at the
// model's defaults. A refusal comes back as stop_reason "refusal" and is answered with a pointer.
export async function callClaude({ apiKey, model, system, messages }) {
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 60_000 });
  const res = await client.messages.create({ model, max_tokens: 4096, system, messages });
  if (res.stop_reason === 'refusal') return { refused: true, text: '' };
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  return { refused: false, text };
}

// Global daily cap, if the ASK_LIMITS KV namespace is bound. One counter per UTC day, no IPs or
// anything else about the asker. KV is eventually consistent, so the cap can run a little over.
export async function dailyCap(env, now = new Date()) {
  if (!env.ASK_LIMITS) return { over: false, state: 'off' };
  const cap = Number.parseInt(env.ASK_DAILY_CAP ?? '', 10) > 0 ? Number.parseInt(env.ASK_DAILY_CAP, 10) : 200;
  const key = `asks:${now.toISOString().slice(0, 10)}`;
  const n = Number.parseInt((await env.ASK_LIMITS.get(key)) ?? '0', 10) || 0;
  if (n >= cap) return { over: true, state: `${n}/${cap}` };
  await env.ASK_LIMITS.put(key, String(n + 1), { expirationTtl: 2 * 24 * 60 * 60 });
  return { over: false, state: `${n + 1}/${cap}` };
}
