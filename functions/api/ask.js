// POST /api/ask: the assistant (F6 groundwork). A Cloudflare Pages Function, so it runs
// on the site's own origin and the browser talks to nobody else.
//
// Environment (Pages project → Settings → Variables and Secrets; never in the repo):
//   ANTHROPIC_API_KEY  secret. Missing → STUB mode (returns the retrieved sections and the prompt)
//   ASSISTANT_MODEL    model id, no default in code. Missing → STUB mode
//   ASK_LIMITS         optional KV binding: global daily request cap (no IPs stored)
//   ASK_DAILY_CAP      optional, default 200
// The corpus is the site's own dist/assistant/corpus.json, read through the static assets.
// No question or answer text is logged.
import { buildIndex } from '../../assistant/retrieve.js';
import { handleAsk, dailyCap } from '../../assistant/ask.js';

let indexPromise = null;
function getIndex(env, request) {
  indexPromise ??= env.ASSETS.fetch(new URL('/assistant/corpus.json', request.url))
    .then((res) => {
      if (!res.ok) throw new Error(`corpus ${res.status}`);
      return res.json();
    })
    .then(buildIndex)
    .catch((e) => { indexPromise = null; throw e; });
  return indexPromise;
}

const reply = (status, body, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', ...headers },
});

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return reply(400, { error: 'Send JSON: {"question": "..."}' });
  }
  const cap = await dailyCap(env);
  if (cap.over) return reply(429, { error: 'The assistant has answered all it can today. Try again tomorrow, or browse the pages.' });
  let index;
  try {
    index = await getIndex(env, request);
  } catch (e) {
    console.error('ask: corpus unavailable', e.message);
    return reply(503, { error: 'The assistant isn’t working right now.' });
  }
  const out = await handleAsk({ body, env, index });
  return reply(out.status, out.json, { 'X-Ask-Cap': cap.state });
}

export const onRequest = () => reply(405, { error: 'Use POST.' }, { Allow: 'POST' });
