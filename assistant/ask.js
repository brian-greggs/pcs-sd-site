// /api/ask request handling, kept out of the Pages Function file so the eval can run
// it in Node. Order: validate → fixed answers (referral, demographic) → retrieve →
// "I don't have that" when nothing relevant → STUB (no key or no model set: return the
// chunks and the assembled prompt) or LIVE (call the model). BAH figures may appear in an
// answer when they come from the sections sent (Brian 2026-10-20), so there's no BAH filter;
// the eval checks each figure against those sections.
//
// Nothing here logs a question or an answer. Errors are logged by type and status only.
import Anthropic from '@anthropic-ai/sdk';
import { search } from './retrieve.js';
import { SYSTEM_PROMPT, NO_ANSWER, userMessage } from './prompt.js';
import { isReferral, isDemographic, GUARD_TEXT } from './guards.js';
import { sectionOf, labelOf, citedOnly } from './cite.js';
import { cleanContext, householdLine, basePage } from './context.js';

export const MAX_QUESTION = 500;

// The reader's move from the home page's chip (assistant/context.js, v1.1.0): base, pay band and household only.
// Anything else in the request is dropped; every value must be one the intake offers.
export { cleanContext, householdLine } from './context.js';

// The previous turn (QUESTIONS 54, Brian 2026-10-11): the family's last question and the answer
// they saw, nothing older. Context for a follow-up ("what about Santee?"), never a source.
export const MAX_PREVIOUS_ANSWER = 2000;
export function cleanPrevious(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.question !== 'string') return null;
  const question = raw.question.replace(/\s+/g, ' ').trim().slice(0, MAX_QUESTION);
  const answer = typeof raw.answer === 'string' ? raw.answer.trim().slice(0, MAX_PREVIOUS_ANSWER) : '';
  return question ? { question, answer } : null;
}

// Whole sections are sent (every part of a split one), so a citation names the section, not a part,
// and carries the label the model cites it by (assistant/cite.js).
const citation = (c) => ({ url: c.url, title: c.page_title, section: sectionOf(c), label: labelOf(c), verified_on: c.verified_on });
const citationsOf = (chunks) => [...new Map(chunks.map((c) => [c.url, citation(c)])).values()];
const nearestChunk = (r) => r.chunks[0] ?? null;

export async function handleAsk({ body, env, index, callModel = callClaude }) {
  const question = typeof body?.question === 'string' ? body.question.replace(/\s+/g, ' ').trim() : '';
  if (!question) return { status: 400, json: { error: 'Ask a question.' } };
  if (question.length > MAX_QUESTION) return { status: 400, json: { error: `Keep it under ${MAX_QUESTION} characters.` } };
  const context = cleanContext(body.context);
  const household = householdLine(context);
  const live = Boolean(env.ANTHROPIC_API_KEY && env.ASSISTANT_MODEL);
  const mode = live ? 'live' : 'stub';
  const previous = cleanPrevious(body.previous);
  // Retrieve for the new question, with the previous question's topic words at a low weight (a follow-up
  // such as "what about Santee?" names a place but not the topic). The answer text isn't used for retrieval.
  // The reader's base, when the chip sends it, routes a where-to-live question to that base page; it is never
  // added to the question's words.
  const r = search(index, question, undefined, previous?.question ?? '', { basePage: basePage(context) });
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

  const prompt = { system: SYSTEM_PROMPT, messages: [{ role: 'user', content: userMessage(question, r.chunks, r.nearest, household, previous) }] };
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
    return { status: 200, json: { mode, kind: 'declined', answer: `I can’t answer that one here. ${pointTo}`, citations, usage: out.usage } };
  }
  return { status: 200, json: { mode, kind: 'answer', answer: out.text, ...citedOnly(out.text, citations, r.nearest), sent: citations.map((c) => c.url), usage: out.usage } };
}

// One Messages API call. The model comes from ASSISTANT_MODEL (no default in code), so the
// request uses only parameters every current model accepts; thinking and effort stay at the
// model's defaults. A refusal comes back as stop_reason "refusal" and is answered with a pointer.
// Token counts go back with the answer (no text), so the eval can report what a run cost.
export async function callClaude({ apiKey, model, system, messages }) {
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 60_000 });
  const res = await client.messages.create({ model, max_tokens: 4096, system, messages });
  const u = res.usage ?? {};
  const usage = { model: res.model, input_tokens: u.input_tokens ?? 0, output_tokens: u.output_tokens ?? 0, cache_read_input_tokens: u.cache_read_input_tokens ?? 0, cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0 };
  if (res.stop_reason === 'refusal') return { refused: true, text: '', usage };
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  return { refused: false, text, usage };
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
