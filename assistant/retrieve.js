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

// User words index plain objects here (SYNONYMS, the corpus postings): read only their own keys, so "constructor" or
// "__proto__" in a question is a word like any other, not Object's (QA S2, 2026-10-25).
const own = (o, k) => (Object.hasOwn(o, k) ? o[k] : undefined);

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
  const postings = Object.create(null); // no inherited keys while building; JSON.parse gives a plain object back
  const lens = chunks.map((c, i) => {
    const head = tokens(`${c.page_title} ${c.section_heading}`);
    // Not the date/source line: every Cost section's names "DTMO BAH", which swamps BAH questions. A chunk's
    // rank_text, when it has one, leaves out text the page marks data-unranked (the repeated BAH lines).
    const all = [...Array(TITLE_WEIGHT).fill(head).flat(), ...tokens(c.rank_text ?? c.text)];
    const tf = new Map();
    for (const t of all) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const [t, f] of tf) (Object.hasOwn(postings, t) ? postings[t] : (postings[t] = [])).push(i, f);
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
  // Pages tied to each base (scripts/build_corpus.mjs), and each base's BAH area, from the corpus.
  const ties = new Map(Object.entries(corpus.base_ties ?? {}).map(([slug, urls]) => [slug, new Set(urls)]));
  const mhaOf = new Map(Object.entries(corpus.mha_bases ?? {}).flatMap(([mha, slugs]) => slugs.map((slug) => [slug, mha])));
  const bahLines = new Map(Object.entries(corpus.bah_lines ?? {})); // "CA038|O1–O3" → that band's 2026 BAH line, once
  return { chunks: corpus.chunks, groups, postings, lens, avg: lens.reduce((n, l) => n + l, 0) / lens.length, n: lens.length, pages: [...pages.values()], priorities: corpus.intake_priorities ?? [], ties, mhaOf, bahLines };
}

// Expanded query terms, each with a weight (the words the family typed count fully). `context` is the
// previous question in a conversation: its topic words count a little (so "what about Santee?" after a
// commute question finds Santee's commute), but only the new question decides which page is named.
const CONTEXT_WEIGHT = 0.4;
function queryTerms(q, context = '') {
  const typed = tokens(q);
  const terms = new Map();
  for (const t of typed) terms.set(t, 1);
  for (const t of typed) for (const s of own(SYNONYMS, t) ?? []) if (!terms.has(stem(s))) terms.set(stem(s), 0.5);
  for (const t of tokens(context)) if (!GENERIC.has(t) && !terms.has(t)) terms.set(t, CONTEXT_WEIGHT);
  return { typed, terms };
}

// Settings the eval tunes (LESSONS.md, session 5b).
export const SETTINGS = {
  k: 6, perPage: 3, // sections sent (every part of each), and at most this many from one page
  minScore: 4.0, // below this, the top chunk isn't about the question
  pageBoost: 1.6, // a chunk on a page the question names (all of the page title's words in the question)
  baseBoost: 1.25, // with the reader's base, a chunk on a page tied to it, when the question names no page (below)
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
// On a sequence-start question, "start" and "begin" don't score: they say where the move begins, not which later
// steps fit, and alone they picked BM25's sections for seq-11 (QUESTIONS 86, Brian 2026-10-24).
const START_WORDS = ['start', 'begin'];
const START_PAGE = '/sequence/orders/';
const START_STEPS = /^[123]\.\s/;

// Where to live, for a reader whose base is known (the home page's chip, v1.1.0): "where should we look?" names no
// page and no base, so BM25 sends whatever mentions "look". With the base from the chip, these questions get that
// base page's two closest drive groups and its BAH table (the reader's pay band picks the row) ahead of what BM25
// picks. Not when the question names a page (a neighborhood or another base): that page decides.
const WHERE_TO_LIVE = [
  /\bwhere (?:should|do|can|could|would) (?:i|we) (?:look|live|rent|buy|settle|search)\b/i,
  /\bwhere to (?:look|live|rent|buy|settle)\b/i,
  /\b(?:which|what) (?:neighborhoods|areas|towns) should (?:i|we) (?:look at|consider)\b/i,
  /\bbest (?:place|area|neighborhood)s? (?:for us )?to (?:live|rent)\b/i,
];
export const isWhereToLive = (q) => WHERE_TO_LIVE.some((re) => re.test(q));
const BASE_ROUTE_SECTIONS = ['tier-under30', 'tier-30-45', 'bah-table'];

// The reader's base and band put their own variants first (2026-10-25). A chunk's `variants` are line ranges, each
// for one pay band, BAH area or base (scripts/build_corpus.mjs). A run is adjacent variants of one kind (the drive
// to each base, the rent per band and area, …). Within each run, the ones that fit the reader (every tag they carry
// that the context can check agrees with it, and at least one can be checked) move to the front; then the one the
// page shows by default; then the rest, each group in page order. Nothing is dropped. No band or base: as built.
// A Cost section carries only the page's default BAH line (the corpus keeps every band × area line once, in
// `bahLines`, QUESTIONS 89): when the family's band or area differs, their line goes in just ahead of it.
export function variantsFirst(chunk, { band = null, base = null } = {}, mhaOf = new Map(), bahLines = new Map()) {
  if (!chunk.variants?.length || (!band && !base)) return chunk;
  const mha = base ? mhaOf.get(base) ?? null : null;
  const fits = (v) => {
    const checks = [v.band && band ? v.band === band : null, v.base && base ? v.base === base : null, v.mha && mha ? v.mha === mha : null].filter((x) => x != null);
    return checks.length > 0 && checks.every(Boolean);
  };
  const lines = chunk.text.split('\n');
  const out = [];
  let i = 0;
  const vs = [...chunk.variants].sort((a, b) => a.from - b.from);
  const kind = (v) => ['band', 'mha', 'base'].filter((t) => v[t]).join();
  const rank = (v) => (fits(v) ? 0 : v.default ? 1 : 2);
  for (let k = 0; k < vs.length;) {
    out.push(...lines.slice(i, vs[k].from));
    const run = [vs[k++]];
    while (k < vs.length && vs[k].from === run.at(-1).to && kind(vs[k]) === kind(run[0])) run.push(vs[k++]);
    for (const v of [0, 1, 2].flatMap((r) => run.filter((v) => rank(v) === r))) {
      const own = v.bah && v.default ? `${mha ?? v.mha}|${band ?? v.band}` : null;
      if (own && own !== `${v.mha}|${v.band}` && bahLines.has(own)) out.push(bahLines.get(own));
      out.push(...lines.slice(v.from, v.to));
    }
    i = run.at(-1).to;
  }
  out.push(...lines.slice(i));
  return { ...chunk, text: out.join('\n') };
}

// A word of a place page's title in the question ("Pacific Beach" of "Pacific Beach / La Jolla"): the question is
// about that place, even when it doesn't name the whole title, so the reader's base doesn't lift other places.
const PLACE = /^\/(?:communities|base-housing|base)\/./;
const placeWord = (index, content) => index.pages.some((p) => PLACE.test(p.url) && [...p.titleTokens].some((t) => content.has(t) && !['base', 'housing'].includes(t)));

// `route.basePage` is the reader's base page from the context (assistant/context.js basePage), or nothing;
// `route.base` and `route.band` are the reader's base slug and pay band (assistant/context.js routeOf).
export function search(index, question, settings = SETTINGS, context = '', route = {}) {
  const { typed, terms } = queryTerms(question, context);
  if (isSequenceStart(question)) for (const w of START_WORDS) terms.delete(w);
  const content = new Set(typed.filter((t) => !GENERIC.has(t)));
  const named = new Set(index.pages.filter((p) => p.titleTokens.size && [...p.titleTokens].filter((t) => !['base', 'housing'].includes(t)).every((t) => typed.includes(t)) && [...p.titleTokens].some((t) => !GENERIC.has(t) && t !== 'housing')).map((p) => p.url));
  const acc = new Map(); // chunk number -> { s, contentHits }
  for (const [t, w] of terms) {
    const post = own(index.postings, t);
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
  const order = (xs) => xs.sort((x, y) => y.s - x.s || x.d.chunk.id.localeCompare(y.d.chunk.id));
  order(scored);
  const top = scored[0];
  const routed = isSequenceStart(question) ? 'sequence-start'
    : route.basePage && !named.size && isWhereToLive(question) ? 'where-to-live' : null;
  const relevant = !!routed || (!!top && top.s >= settings.minScore && top.contentHits > 0);
  // The reader's base (2026-10-25, narrow): when the question names no place and takes no route, sections on the pages
  // tied to that base (its neighborhoods and base housing) rank a little higher: "infant care near 32nd Street" from
  // NBSD gets North Park and Paradise Hills, not the first child care sections A to Z. Only the order of what's
  // picked changes: whether anything is relevant, and the nearest page, are decided before the boost.
  const tied = !routed && !named.size && route.base && !placeWord(index, content) ? index.ties?.get(route.base) : null;
  const picks = tied ? order(scored.map((x) => (tied.has(x.d.chunk.url.split('#')[0]) ? { ...x, s: x.s * settings.baseBoost } : x))) : scored;
  // Pick sections, not chunks: k sections (at most perPage from one page), each sent whole, so a
  // table split across parts for ranking never reaches the model with half its rows.
  const perPage = new Map();
  const picked = new Set();
  const chunks = [];
  if (routed) {
    // Orders steps 1-3 first, by step number, or the base page's drive groups and BAH table; BM25 still picks its
    // k sections after them (no duplicates).
    const take = routed === 'sequence-start'
      ? (c) => c.url.split('#')[0] === START_PAGE && START_STEPS.test(c.section_heading)
      : (c) => c.url.split('#')[0] === route.basePage && BASE_ROUTE_SECTIONS.includes(c.url.split('#')[1]);
    for (const [group, parts] of index.groups) {
      if (!take(index.chunks[parts[0]])) continue;
      picked.add(group);
      for (const j of parts) chunks.push({ ...index.chunks[j], score: null, routed });
    }
  }
  const forced = picked.size;
  for (const x of picks) {
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
  const nearest = routed === 'sequence-start' ? { url: START_PAGE, title: chunks[0]?.page_title ?? 'Move sequence: Orders in hand' }
    : routed ? { url: route.basePage, title: chunks[0]?.page_title ?? 'Your base' }
    : top ? { url: top.d.chunk.url.split('#')[0], title: top.d.chunk.page_title } : { url: '/', title: 'Home: start with your base' };
  const sent = relevant ? chunks.map((c) => variantsFirst(c, route, index.mhaOf, index.bahLines)) : [];
  return { relevant, chunks: sent, nearest, routed, base_boost: !!tied, top_score: top ? Math.round(top.s * 100) / 100 : 0, terms: [...terms.keys()] };
}
