// Keyword retrieval (BM25) over the site corpus (dist/assistant/corpus.json, built by
// scripts/build_corpus.mjs). Plain JavaScript with no dependencies, shared by the
// Pages Function (functions/api/ask.js) and the eval (scripts/eval_assistant.mjs).
// No embeddings in v0: LESSONS.md says what eval result would justify them.

const STOP = new Set(`a an and are as at be by can could do does did for from get got had has have how i if in into is it
its me my of on or our should so than that the their them then there these they this to us was we were what when where
which who will with would you your yours i'm im it's whats what's about any much many there's near nearby around also
just like want need know tell give find am being been`.split(/\s+/));

// Words that say nothing about which page answers ("the best neighborhood in San Diego").
// A question needs at least one other matched word to count as answered by the corpus.
// "time" (2026-10-23): on this site it's a drive or wait time, never a topic on its own. Once the repeated "drive
// times" method notes moved to /sources/, "time" alone lifted an out-of-scope question (out-04) past minScore.
const GENERIC = new Set(`san diego navy marine marines military family families pcs pcsing move moving moved neighborhood
neighborhoods area areas place places live living best good better worst bad page site guide info information question
help sailor sailors kid kids child children wife husband spouse orders report reporting base bases
time times`.split(/\s+/));

// Query expansion: a few words families use for what the pages call something else.
const SYNONYMS = {
  bah: ['housing', 'allowance'],
  allowance: ['bah'],
  daycare: ['child', 'care'], childcare: ['child', 'care'], preschool: ['child', 'care', 'preschool'], infant: ['infant', 'child', 'care'], baby: ['infant', 'child', 'care'],
  commute: ['commute', 'drive'], traffic: ['commute', 'drive'], drive: ['commute'],
  ppv: ['base', 'housing'], lmh: ['liberty', 'housing'], waitlist: ['wait'],
  wildfire: ['fire'], fires: ['fire'], flooding: ['flood'], jets: ['noise', 'aircraft'], jet: ['noise', 'aircraft'], loud: ['noise'],
  hot: ['climate', 'july', '90'], heat: ['climate', 'july', '90'], ac: ['climate', 'july'], weather: ['climate'],
  nex: ['exchange'], mcx: ['exchange'], groceries: ['commissary'],
  mortgage: ['buying', 'home', 'value'], buy: ['buying', 'home'], purchase: ['buying', 'home'],
  mello: ['mello', 'roos'], tax: ['mello', 'roos', 'tax'],
  rental: ['rent'], renting: ['rent'], lease: ['rent'],
  pet: ['pets'], dog: ['pets', 'dog'], dogs: ['pets', 'dog'], cat: ['pets', 'cat'], cats: ['pets', 'cat'],
  hospital: ['hospital', 'clinic'], tricare: ['hospital', 'clinic'],
  beach: ['beach', 'water'], swim: ['beach', 'water'],
  safe: ['hazard', 'fire', 'flood', 'noise'], safety: ['hazard', 'fire', 'flood', 'noise'], crime: ['hazard'], dangerous: ['hazard', 'fire', 'flood'],
};

const fold = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const stem = (w) => {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && /(ss|x|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
};
export function tokens(s) {
  return fold(s).split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w)).map(stem);
}

const K1 = 1.2;
const B = 0.75;
const TITLE_WEIGHT = 3; // page title and section heading count three times

// Postings for every term, built once at build time (scripts/build_corpus.mjs) and stored
// with the corpus, so a cold Pages Function only parses JSON and reads the query's terms.
// postings[term] is a flat list: chunk number, count, chunk number, count, ...
export function indexChunks(chunks) {
  const postings = {};
  const lens = chunks.map((c, i) => {
    const head = tokens(`${c.page_title} ${c.section_heading}`);
    // Not the date/source line: every Cost section's names "DTMO BAH", which swamps BAH questions. A chunk's
    // rank_text, when it has one, leaves out text the page marks data-unranked (the repeated BAH lines).
    const all = [...Array(TITLE_WEIGHT).fill(head).flat(), ...tokens(c.rank_text ?? c.text)];
    const tf = new Map();
    for (const t of all) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const [t, f] of tf) (postings[t] ??= []).push(i, f);
    return all.length;
  });
  return { postings, lens };
}

export function buildIndex(corpus) {
  const { postings, lens } = corpus.index ?? indexChunks(corpus.chunks);
  const pages = new Map();
  for (const c of corpus.chunks) {
    const url = c.url.split('#')[0];
    if (!pages.has(url)) pages.set(url, { url, title: c.page_title, titleTokens: new Set(tokens(c.page_title)) });
  }
  // Parts of one split section, in order: when one part ranks, all of them are sent.
  const groups = new Map();
  corpus.chunks.forEach((c, i) => { const g = c.group ?? c.id; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(i); });
  return { chunks: corpus.chunks, groups, postings, lens, avg: lens.reduce((n, l) => n + l, 0) / lens.length, n: lens.length, pages: [...pages.values()], priorities: corpus.intake_priorities ?? [] };
}

// Expanded query terms, each with a weight (the words the family typed count fully). `context` is the
// previous question in a conversation: its topic words count a little (so "what about Santee?" after a
// commute question finds Santee's commute), but only the new question decides which page is named.
const CONTEXT_WEIGHT = 0.4;
function queryTerms(q, context = '') {
  const typed = tokens(q);
  const terms = new Map();
  for (const t of typed) terms.set(t, 1);
  for (const t of typed) for (const s of SYNONYMS[t] ?? []) if (!terms.has(stem(s))) terms.set(stem(s), 0.5);
  for (const t of tokens(context)) if (!GENERIC.has(t) && !terms.has(t)) terms.set(t, CONTEXT_WEIGHT);
  return { typed, terms };
}

// Settings the eval tunes (LESSONS.md, session 5b).
export const SETTINGS = {
  k: 6, perPage: 3, // sections sent (every part of each), and at most this many from one page
  minScore: 4.0, // below this, the top chunk isn't about the question
  pageBoost: 1.6, // a chunk on a page the question names (all of the page title's words in the question)
};

// Where the move starts ("what do I do first?", "we just got orders"): BM25 alone sends later steps
// (seq-07), so these questions always get steps 1-3 of the Orders phase as well, ahead of what BM25
// picks. Only the new question counts, not the previous turn. Brian 2026-10-22.
const SEQUENCE_START = [
  /\bjust (?:got|gotten|received|been given) (?:my |our |the |new )?(?:pcs )?orders\b/i,
  /\b(?:after|once|when|now that) (?:i|we)(?:['’]ve| have)? (?:get|got|gotten|receive|received|have) (?:my |our |the )?(?:pcs )?orders\b/i,
  /\b(?:i|we) (?:have|got|received) (?:my |our |the )?(?:pcs )?orders\b.*\b(?:first|start|begin)\b/i,
  /\bwhere (?:do|should|can|would) (?:i|we) (?:start|begin)\b/i,
  /\bwhere to (?:start|begin)\b/i,
  /\b(?:do|start with|tackle|handle) first\b/i,
  /\bfirst (?:thing|things|step|steps)\b/i,
  /\bwhat comes first\b/i,
];
export const isSequenceStart = (q) => SEQUENCE_START.some((re) => re.test(q));
const START_PAGE = '/sequence/orders/';
const START_STEPS = /^[123]\.\s/;

export function search(index, question, settings = SETTINGS, context = '') {
  const { typed, terms } = queryTerms(question, context);
  const content = new Set(typed.filter((t) => !GENERIC.has(t)));
  const named = new Set(index.pages.filter((p) => p.titleTokens.size && [...p.titleTokens].filter((t) => !['base', 'housing'].includes(t)).every((t) => typed.includes(t)) && [...p.titleTokens].some((t) => !GENERIC.has(t) && t !== 'housing')).map((p) => p.url));
  const acc = new Map(); // chunk number -> { s, contentHits }
  for (const [t, w] of terms) {
    const post = index.postings[t];
    if (!post) continue;
    const df = post.length / 2;
    const idf = Math.log(1 + (index.n - df + 0.5) / (df + 0.5));
    for (let j = 0; j < post.length; j += 2) {
      const i = post[j];
      const f = post[j + 1];
      const a = acc.get(i) ?? { s: 0, contentHits: 0 };
      a.s += w * idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * index.lens[i]) / index.avg)));
      if (content.has(t)) a.contentHits++;
      acc.set(i, a);
    }
  }
  const scored = [...acc].map(([i, a]) => {
    const chunk = index.chunks[i];
    const s = named.has(chunk.url.split('#')[0]) ? a.s * settings.pageBoost : a.s;
    return { i, d: { chunk }, s, contentHits: a.contentHits };
  });
  scored.sort((x, y) => y.s - x.s || x.d.chunk.id.localeCompare(y.d.chunk.id));
  const top = scored[0];
  const routed = isSequenceStart(question) ? 'sequence-start' : null;
  const relevant = !!routed || (!!top && top.s >= settings.minScore && top.contentHits > 0);
  // Pick sections, not chunks: k sections (at most perPage from one page), each sent whole, so a
  // table split across parts for ranking never reaches the model with half its rows.
  const perPage = new Map();
  const picked = new Set();
  const chunks = [];
  if (routed) {
    // Orders steps 1-3 first, by step number; BM25 still picks its k sections after them (no duplicates).
    for (const [group, parts] of index.groups) {
      const c = index.chunks[parts[0]];
      if (c.url.split('#')[0] !== START_PAGE || !START_STEPS.test(c.section_heading)) continue;
      picked.add(group);
      for (const j of parts) chunks.push({ ...index.chunks[j], score: null, routed });
    }
  }
  const forced = picked.size;
  for (const x of scored) {
    if (picked.size - forced >= settings.k) break;
    const group = x.d.chunk.group ?? x.d.chunk.id;
    if (picked.has(group)) continue;
    const page = x.d.chunk.url.split('#')[0];
    if ((perPage.get(page) ?? 0) >= settings.perPage) continue;
    perPage.set(page, (perPage.get(page) ?? 0) + 1);
    picked.add(group);
    for (const j of index.groups.get(group) ?? [x.i]) chunks.push({ ...index.chunks[j], score: Math.round(x.s * 100) / 100 });
  }
  // Nearest page: the best-scoring page even when nothing clears the bar; the home page if nothing matched at all.
  const nearest = routed ? { url: START_PAGE, title: chunks[0]?.page_title ?? 'Move sequence: Orders in hand' }
    : top ? { url: top.d.chunk.url.split('#')[0], title: top.d.chunk.page_title } : { url: '/', title: 'Home: start with your base' };
  return { relevant, chunks: relevant ? chunks : [], nearest, routed, top_score: top ? Math.round(top.s * 100) / 100 : 0, terms: [...terms.keys()] };
}
