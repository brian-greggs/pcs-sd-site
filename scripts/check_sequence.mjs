#!/usr/bin/env node
// Move sequence (F2) checks, run after the build (postbuild). Any failure exits 1 and fails `npm run build`.
//
//   seq-export       every step and form on a sequence page is a row of src/data/sequence_steps.json /
//                    sequence_forms.json (no hand-typed step), every exported Navy row is on its page once, in
//                    order, and no USMC "not yet covered" row reaches any page
//   seq-deadlines    every deadline shown (data-deadline) is its row's deadline, word for word, and every timing
//                    line is the row's anchor; a deadline outside a step or form block fails
//   seq-sources      every step and form block has a date line naming every retrieval date of its sources, and
//                    one quote per citation (sources, side-by-side rules, superseded)
//   seq-unconfirmed  a row with a "Not yet confirmed" line (partial, confirm with the HSC) shows it, naming who
//                    to ask (CPPA, PPPO, HSC); no other row shows one
//   seq-notes        every sequence page opens with the disclaimer and the Navy-rules note; the Camp Pendleton,
//                    MCAS Miramar and MCRD San Diego base pages carry the Navy-rules note; the sequence page
//                    links Plan My Move as "build your personal checklist"
//
//   node scripts/check_sequence.mjs                 check dist/
//   node scripts/check_sequence.mjs --plant <kind>  plant one violation in memory first (it must fail);
//   node scripts/check_sequence.mjs --plant all     plant each kind in turn and report which were caught
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PHASES, ANCHOR_LABEL, SEQUENCE_DISCLAIMER, NAVY_RULES_NOTE, MARINE_BASES, citeDates, unconfirmedLine,
} from '../src/lib/sequence.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const STEPS = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'sequence_steps.json'), 'utf-8'));
const FORMS = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'sequence_forms.json'), 'utf-8'));
const BASE_SLUG = { PENDLETON: 'camp-pendleton', MIRAMAR: 'miramar', MCRD: 'mcrd' };
const NAVY_BASE_SLUGS = ['naval-base-san-diego', 'north-island', 'naval-amphibious-base', 'point-loma', 'naval-medical-center'];
const CHECKS = ['seq-export', 'seq-deadlines', 'seq-sources', 'seq-unconfirmed', 'seq-notes'];

const decode = (s) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/&quot;|&#34;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const attr = (html, name) => [...html.matchAll(new RegExp(`<[^>]*\\b${name}(?:="([^"]*)")?[^>]*>([\\s\\S]*?)<\\/`, 'g'))];
// Blocks rendered by FactBlock: <section … data-fact="id"> … </section> (never nested).
const blocks = (html) => [...html.matchAll(/<section[^>]*\bdata-fact="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g)].map((m) => ({ id: m[1], html: m[2] }));

function load() {
  const pages = {};
  const read = (rel) => { pages[rel] = existsSync(join(DIST, rel)) ? readFileSync(join(DIST, rel), 'utf-8') : null; };
  read('sequence/index.html');
  read('sequence/forms/index.html');
  for (const p of PHASES) read(`sequence/${p.slug}/index.html`);
  for (const slug of [...Object.values(BASE_SLUG), ...NAVY_BASE_SLUGS]) read(`base/${slug}/index.html`);
  return { pages, steps: structuredClone(STEPS), forms: structuredClone(FORMS) };
}

function check({ pages, steps, forms }) {
  const failures = [];
  const fail = (c, where, what) => failures.push({ check: c, where, what });
  const seqPages = Object.keys(pages).filter((k) => k.startsWith('sequence/'));
  for (const k of seqPages) if (!pages[k]) fail('seq-export', k, 'page not built');

  // Notes at the top of every sequence page; the Navy-rules note on the three Marine Corps bases.
  for (const k of seqPages.filter((k) => pages[k])) {
    const html = pages[k];
    const disc = attr(html, 'data-seq-disclaimer')[0];
    const navy = attr(html, 'data-navy-note')[0];
    if (!disc || decode(disc[2]) !== SEQUENCE_DISCLAIMER) fail('seq-notes', k, 'no disclaimer line, or its wording changed');
    if (!navy || decode(navy[2]) !== NAVY_RULES_NOTE) fail('seq-notes', k, 'no Navy-rules note, or its wording changed');
    // Both before the first step or form.
    const first = html.search(/data-fact="/);
    if (disc && first >= 0 && html.indexOf('data-seq-disclaimer') > first) fail('seq-notes', k, 'disclaimer comes after the first step');
  }
  for (const code of MARINE_BASES) {
    const k = `base/${BASE_SLUG[code]}/index.html`;
    const navy = pages[k] && attr(pages[k], 'data-navy-note')[0];
    if (!navy || decode(navy[2]) !== NAVY_RULES_NOTE) fail('seq-notes', k, 'Marine Corps base page without the Navy-rules note');
  }
  const idx = pages['sequence/index.html'];
  if (idx && !/<a href="https:\/\/www\.militaryonesource\.mil\/resources\/network\/plan-my-move\/"[^>]*>build your personal checklist<\/a>/.test(idx)) {
    fail('seq-notes', 'sequence/index.html', 'no Plan My Move link reading "build your personal checklist"');
  }

  // USMC "not yet covered" rows reach no page, under any id or as their status words.
  const hidden = forms.filter((f) => f.status === 'not_yet_covered');
  for (const [k, html] of Object.entries(pages)) {
    if (!html) continue;
    for (const f of hidden) if (html.includes(`"${f.id}"`) || html.includes(`#${f.id}"`)) fail('seq-export', k, `USMC row ${f.id} is on the page`);
    if (/not yet covered/i.test(decode(html))) fail('seq-export', k, '"not yet covered" text on a page');
  }

  // A row as a block: deadline, anchor, date line, quotes, "Not yet confirmed".
  const checkRow = (k, row, b, kind) => {
    const where = `${k} #${row.id}`;
    const dl = attr(b.html, `data-${kind}`)[0];
    if (!dl) { fail('seq-export', where, `no data-${kind} list in the block`); return; }
    const dls = attr(b.html, 'data-deadline');
    if (dls.length !== 1) fail('seq-deadlines', where, `${dls.length} deadlines in the block (want 1)`);
    else if (decode(dls[0][2]) !== row.deadline) fail('seq-deadlines', where, `deadline "${decode(dls[0][2])}" isn't the row's "${row.deadline}"`);
    const an = attr(b.html, 'data-anchor')[0];
    if (!an || decode(an[2]) !== ANCHOR_LABEL[row.anchor]) fail('seq-deadlines', where, `timing line isn't the row's anchor (${row.anchor})`);
    const asof = attr(b.html, 'data-asof')[0];
    if (!asof || !decode(asof[2]).startsWith(`${citeDates(row)}.`)) fail('seq-sources', where, `date line isn't "${citeDates(row)}"`);
    const cites = (b.html.match(/\bdata-cite\b/g) ?? []).length;
    const want = row.sources.length + (row.alternatives ?? []).reduce((n, a) => n + a.sources.length, 0);
    if (cites !== want) fail('seq-sources', where, `${cites} quotes shown, the row cites ${want}`);
    const sup = (b.html.match(/\bdata-superseded\b/g) ?? []).length;
    if (sup !== row.superseded.length) fail('seq-sources', where, `${sup} superseded quotes shown, the row has ${row.superseded.length}`);
    for (const c of [...row.sources, ...(row.alternatives ?? []).flatMap((a) => a.sources)]) {
      if (!decode(b.html).includes(`“${c.quote}”`)) fail('seq-sources', where, `quote missing: "${c.quote.slice(0, 50)}"`);
    }
    const un = attr(b.html, 'data-unconfirmed');
    if (row.unconfirmed) {
      if (un.length !== 1 || un[0][1] !== row.unconfirmed.ask || decode(un[0][2]) !== unconfirmedLine(row.unconfirmed)) fail('seq-unconfirmed', where, `no "Not yet confirmed" line asking the ${row.unconfirmed.ask}`);
    } else if (un.length) fail('seq-unconfirmed', where, '"Not yet confirmed" line on a row that has none');
  };

  // Steps: each phase page holds exactly its rows, in order.
  for (const p of PHASES) {
    const k = `sequence/${p.slug}/index.html`;
    if (!pages[k]) continue;
    const bs = blocks(pages[k]);
    const want = steps.filter((s) => s.phase === p.key).sort((a, b) => a.order - b.order);
    const got = bs.map((b) => b.id);
    for (const b of bs) {
      const row = steps.find((s) => s.id === b.id);
      if (!row) fail('seq-export', k, `block "${b.id}" is not a row of sequence_steps.json`);
      else if (row.phase !== p.key) fail('seq-export', k, `step ${b.id} belongs to ${row.phase}`);
      else checkRow(k, row, b, 'step');
    }
    if (JSON.stringify(got.filter((id) => want.some((s) => s.id === id))) !== JSON.stringify(want.map((s) => s.id))) {
      fail('seq-export', k, `steps missing or out of order: want ${want.map((s) => s.order).join(',')}`);
    }
  }
  // Forms: the forms page holds exactly the Navy rows, in export order.
  const fk = 'sequence/forms/index.html';
  if (pages[fk]) {
    const bs = blocks(pages[fk]);
    const want = forms.filter((f) => f.status !== 'not_yet_covered');
    for (const b of bs) {
      const row = want.find((f) => f.id === b.id);
      if (!row) fail('seq-export', fk, `block "${b.id}" is not a Navy row of sequence_forms.json`);
      else checkRow(fk, row, b, 'form');
    }
    if (JSON.stringify(bs.map((b) => b.id)) !== JSON.stringify(want.map((f) => f.id))) fail('seq-export', fk, 'forms missing or out of order');
  }
  // No deadline outside a step or form block, on any page read here.
  for (const [k, html] of Object.entries(pages)) {
    if (!html) continue;
    const outside = html.replace(/<section[^>]*\bdata-fact="[^"]+"[^>]*>[\s\S]*?<\/section>/g, '');
    if (/data-deadline/.test(outside)) fail('seq-deadlines', k, 'a deadline outside any step or form block');
  }
  return failures;
}

// --- Planting: one violation of each kind, in memory, to prove the check fails --------------------------
const PLANTS = {
  'hand-typed step': (s) => { const k = 'sequence/arrival/index.html'; s.pages[k] = s.pages[k].replace('<nav class="seq-nav"', '<section class="fact plain" id="extra" data-fact="extra"><dl data-step="extra"><dd data-deadline>Within 3 days.</dd></dl></section><nav class="seq-nav"'); },
  'wrong deadline': (s) => { const r = s.steps.find((x) => x.id === 'arrival-travel-claim'); r.deadline = 'Within 10 days of reporting.'; },
  'step dropped from its page': (s) => { const k = 'sequence/orders/index.html'; s.pages[k] = s.pages[k].replace(/<section[^>]*data-fact="orders-sponsor"[\s\S]*?<\/section>/, ''); },
  'deadline outside a block': (s) => { const k = 'sequence/index.html'; s.pages[k] = s.pages[k].replace('</main>', '<p data-deadline>Within 5 days.</p></main>'); },
  'no date line': (s) => { const k = 'sequence/transit/index.html'.replace('transit', 'on-the-road'); s.pages[k] = s.pages[k].replace(/<p class="asof" data-asof>[^<]*<\/p>/, ''); },
  'quote missing': (s) => { const k = 'sequence/forms/index.html'; s.pages[k] = s.pages[k].replace(/<li data-cite>[\s\S]*?<\/li>/, ''); },
  'no "Not yet confirmed" line': (s) => { const k = 'sequence/first-30-days/index.html'; s.pages[k] = s.pages[k].replace(/<p class="gap" data-unconfirmed="PPPO">[^<]*<\/p>/, ''); },
  'asks the wrong office': (s) => { const r = s.forms.find((x) => x.id === 'navy-pet-expenses'); r.unconfirmed = { ...r.unconfirmed, ask: 'HSC' }; },
  'no Navy note on a Marine base': (s) => { const k = 'base/miramar/index.html'; s.pages[k] = s.pages[k].replace(/data-navy-note/g, 'data-x'); },
  'no disclaimer on a phase page': (s) => { const k = 'sequence/arrival/index.html'; s.pages[k] = s.pages[k].replace('data-seq-disclaimer', 'data-x'); },
  'USMC row on a page': (s) => { const k = 'sequence/forms/index.html'; s.pages[k] = s.pages[k].replace('</main>', '<a href="#usmc-travel-voucher">x</a></main>'); },
};

const plantArg = process.argv.includes('--plant') ? process.argv[process.argv.indexOf('--plant') + 1] : null;
if (plantArg) {
  const kinds = plantArg === 'all' ? Object.keys(PLANTS) : [plantArg];
  let missed = 0;
  for (const kind of kinds) {
    if (!PLANTS[kind]) { console.log(`unknown plant "${kind}"; kinds: ${Object.keys(PLANTS).join(' | ')}`); process.exit(2); }
    const state = load();
    PLANTS[kind](state);
    const f = check(state);
    if (f.length) console.log(`  CAUGHT  ${kind}: ${f[0].check} ${f[0].where}: ${f[0].what}`);
    else { console.log(`  MISSED  ${kind}`); missed++; }
  }
  console.log(`\nSequence plants: ${kinds.length - missed}/${kinds.length} caught`);
  process.exit(missed ? 1 : 0);
}

const failures = check(load());
const byCheck = failures.reduce((acc, f) => ((acc[f.check] ??= []).push(f), acc), {});
console.log('\nMove sequence checks (dist)');
for (const c of CHECKS) {
  const fs = byCheck[c] ?? [];
  if (!fs.length) console.log(`  PASS  ${c}`);
  else {
    console.log(`  FAIL  ${c} (${fs.length})`);
    for (const f of fs.slice(0, 20)) console.log(`        ${f.where}: ${f.what}`);
  }
}
const navy = FORMS.filter((f) => f.status !== 'not_yet_covered').length;
console.log(`  ${STEPS.length} steps on ${PHASES.length} phase pages, ${navy} forms (${FORMS.length - navy} USMC rows hidden)`);
if (failures.length) {
  console.log(`\n${failures.length} sequence check failure(s). Build failed.\n`);
  process.exit(1);
}
console.log('');
