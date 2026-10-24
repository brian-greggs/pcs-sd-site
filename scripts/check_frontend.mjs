#!/usr/bin/env node
// Front end checks (v1.0.0: ask first), run after the build (postbuild). Any failure exits 1 and fails
// `npm run build`. They read the built pages in dist/; scripts/check_frontend_browser.mjs checks the same things that
// need a browser (the fold, focus, the cards' keyboard behavior).
//
//   home-start      the start screen ([data-start] on /) has one ask box (one labeled textarea, one send button) and
//                   no data: no table, figure, map, fact list, image, fact block or source key, no BAH figure, and no
//                   digit outside the example questions (which carry no $ or %)
//   home-examples   every example question gets sections from retrieval (never "I don't have that"), run on the
//                   built corpus with the assistant's own search
//   menu-links      the drawer on every page lists the same links as /browse/ (the menu without JavaScript), every
//                   link resolves to a built page, and they include the eight bases, both indexes, the sequence, the
//                   forms page, the starting plan and /sources/; the menu button is a link to /browse/
//   ask-redirect    /ask/ redirects to /: a 301 in _redirects (Cloudflare) and, in dist/ask/, a meta refresh and a
//                   link to /, with no ask box left there
//   plan-cards      /plan/ has one card (fieldset) per question, numbered 1 to 8 in order, covering every answer
//                   field the rules define (emptyAnswers) and every choice the rules and config offer
//   ask-view        the source chip's date, the related-page card and the follow-ups (src/lib/askView.js) on fixed
//                   replies
//
//   node scripts/check_frontend.mjs               run the checks
//   node scripts/check_frontend.mjs --plant all   plant one fault of each kind in memory; each must fail its check
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex, search } from '../assistant/retrieve.js';
import * as rules from '../src/lib/intake/rules.js';
import { latestDate, relatedPage, followUps } from '../src/lib/askView.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const read = (p) => readFileSync(join(DIST, p), 'utf-8');
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') ? [p] : [];
});
const decode = (s) => s.replace(/&#39;|&rsquo;/g, '’').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ');
const visible = (html) => decode(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
// The element that opens at `i` (a match of its start tag), through its balanced closing tag.
function elementAt(html, i) {
  const tag = html.slice(i).match(/^<(\w+)/)[1];
  const re = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, 'gi');
  re.lastIndex = i;
  let depth = 0;
  for (let m; (m = re.exec(html));) {
    depth += m[0][1] === '/' ? -1 : 1;
    if (depth === 0) return html.slice(i, re.lastIndex);
  }
  return html.slice(i);
}
const elementWith = (html, attr) => {
  const m = html.match(new RegExp(`<\\w+\\b[^>]*\\s${attr}(?=[\\s=>])[^>]*>`));
  return m ? elementAt(html, m.index) : null;
};
const hrefs = (html) => [...html.matchAll(/<a\b[^>]*\shref="([^"]*)"/g)].map((m) => m[1]);
const pageExists = (url) => {
  const path = url.split('#')[0].split('?')[0];
  return path.startsWith('/') && existsSync(join(DIST, path.replace(/^\//, ''), path.endsWith('/') ? 'index.html' : ''));
};

const failures = [];
const passes = [];
const fail = (check, where, what) => failures.push({ check, where, what });

// --- home-start -------------------------------------------------------------------
function checkHome(files) {
  const html = files['index.html'];
  const start = elementWith(html, 'data-start');
  if (!start) { fail('home-start', 'index.html', 'no [data-start] start screen'); return; }
  const textareas = [...start.matchAll(/<textarea\b[^>]*>/g)];
  if (textareas.length !== 1) fail('home-start', 'index.html', `${textareas.length} textareas on the start screen (one ask box)`);
  else {
    const id = (textareas[0][0].match(/\sid="([^"]+)"/) ?? [])[1];
    if (!id || !new RegExp(`<label\\b[^>]*\\sfor="${id}"[^>]*>[^<]*\\w`).test(start)) fail('home-start', 'index.html', 'the ask box has no visible <label for=…>');
  }
  const sends = start.match(/<button\b[^>]*\sdata-send\b[^>]*>/g) ?? [];
  if (sends.length !== 1) fail('home-start', 'index.html', `${sends.length} send buttons on the start screen`);
  for (const [re, what] of [[/<table\b/, 'a table'], [/<figure\b/, 'a figure'], [/<svg\b/, 'an SVG (map or chart)'], [/<dl\b/, 'a fact list'], [/<img\b/, 'an image'], [/<canvas\b/, 'a canvas'], [/\sdata-fact=/, 'a fact block'], [/\sdata-src=/, 'a source key'], [/\sdata-bah/, 'a BAH figure'], [/class="count"/, 'a count']]) {
    if (re.test(start)) fail('home-start', 'index.html', `${what} on the start screen`);
  }
  const examples = [...start.matchAll(/<button\b[^>]*\sdata-example\b[^>]*>([\s\S]*?)<\/button>/g)].map((m) => visible(m[1]));
  const rest = visible(start.replace(/<button\b[^>]*\sdata-example\b[^>]*>[\s\S]*?<\/button>/g, ' '));
  const digit = rest.match(/.{0,30}\d.{0,30}/);
  if (digit) fail('home-start', 'index.html', `a figure on the start screen: "${digit[0]}"`);
  for (const e of examples) if (/[$%]/.test(e)) fail('home-start', 'index.html', `an example question with a figure: "${e}"`);
  if (examples.length < 3 || examples.length > 4) fail('home-start', 'index.html', `${examples.length} example questions (3 or 4)`);
  return examples;
}

// --- home-examples ------------------------------------------------------------------
function checkExamples(examples, index) {
  for (const q of examples ?? []) {
    const r = search(index, q);
    if (!r.relevant) fail('home-examples', q, `retrieval finds nothing relevant (the answer would be "I don't have that"; nearest ${r.nearest?.url})`);
  }
}

// --- menu-links ----------------------------------------------------------------------
const MUST = ['/', '/neighborhoods/', '/base-housing/', '/sequence/', '/sequence/forms/', '/plan/', '/sources/',
  ...['naval-base-san-diego', 'miramar', 'north-island', 'naval-amphibious-base', 'point-loma', 'naval-medical-center', 'mcrd', 'camp-pendleton'].map((s) => `/base/${s}/`)];
function checkMenu(files) {
  const browse = files['browse/index.html'];
  const browseLinks = browse ? hrefs(elementWith(browse, 'data-menu-links') ?? '') : [];
  if (!browse) fail('menu-links', 'browse/index.html', '/browse/ not built');
  else if (!browseLinks.length) fail('menu-links', 'browse/index.html', 'no menu links on /browse/');
  for (const href of MUST) if (!browseLinks.includes(href)) fail('menu-links', 'browse/index.html', `no link to ${href}`);
  for (const href of browseLinks) if (!pageExists(href)) fail('menu-links', 'browse/index.html', `${href} doesn't resolve to a built page`);
  let pages = 0;
  for (const [page, html] of Object.entries(files)) {
    if (page === 'ask/index.html') continue; // the redirect page carries the layout too; checked below
    pages++;
    const drawer = elementWith(html, 'data-drawer');
    if (!drawer) { fail('menu-links', page, 'no menu drawer'); continue; }
    const links = hrefs(elementWith(drawer, 'data-menu-links') ?? '');
    if (links.join(' ') !== browseLinks.join(' ')) fail('menu-links', page, `drawer links differ from /browse/: ${links.join(' ')}`);
    for (const href of links) if (!pageExists(href)) fail('menu-links', page, `${href} doesn't resolve`);
    const btn = html.match(/<a\b[^>]*\sdata-menu-btn\b[^>]*>/)?.[0] ?? '';
    if (!/\shref="\/browse\/"/.test(btn)) fail('menu-links', page, 'the menu button is not a link to /browse/ (the menu without JavaScript)');
    if (!/\saria-controls="site-menu"/.test(btn) || !/\sid="site-menu"/.test(drawer)) fail('menu-links', page, 'the menu button doesn\'t control the drawer');
    if (!/<button\b[^>]*\sdata-menu-close\b[^>]*\saria-label="[^"]+"/.test(drawer)) fail('menu-links', page, 'the drawer has no labeled close button');
  }
  passes.push(`menu-links: ${browseLinks.length} links, the same in the drawer on ${pages} pages and on /browse/, each resolving`);
}

// --- ask-redirect --------------------------------------------------------------------
function checkRedirect(files, redirects) {
  if (!/^\/ask\/\s+\/\s+301$/m.test(redirects ?? '')) fail('ask-redirect', '_redirects', 'no "/ask/ / 301" line');
  if (!/^\/ask\s+\/\s+301$/m.test(redirects ?? '')) fail('ask-redirect', '_redirects', 'no "/ask / 301" line');
  const html = files['ask/index.html'];
  if (!html) { fail('ask-redirect', 'ask/index.html', 'no fallback page'); return; }
  if (!/<meta http-equiv="refresh" content="0; url=\/"/.test(html)) fail('ask-redirect', 'ask/index.html', 'no meta refresh to /');
  const main = elementWith(html, 'id="main"') ?? '';
  if (!hrefs(main).includes('/')) fail('ask-redirect', 'ask/index.html', 'no link to / on the page');
  if (/<textarea\b|\sdata-send\b/.test(html)) fail('ask-redirect', 'ask/index.html', 'an ask box is still on /ask/');
}

// --- plan-cards ------------------------------------------------------------------------
// Each answer field the rules define, and the inputs that set it.
const FIELD_INPUTS = {
  base: ['base'], band: ['band'], timeline: ['timeline'], partner: ['partner'], kids: rules.KID_GROUPS.map((g) => `kids-${g}`),
  bedrooms: ['bedrooms'], separate6: ['separate6'], cats: ['cats'], dogs: ['dogs'], open: ['open'], priorities: ['priority-1', 'priority-2'],
};
function checkPlanCards(files) {
  const html = files['plan/index.html'];
  if (!html) { fail('plan-cards', 'plan/index.html', 'not built'); return; }
  const cards = [...html.matchAll(/<fieldset\b[^>]*\sdata-q="(\d+)"[^>]*>/g)].map((m) => ({ n: Number(m[1]), html: elementAt(html, m.index) }));
  const nums = cards.map((c) => c.n);
  if (nums.join() !== '1,2,3,4,5,6,7,8') fail('plan-cards', 'plan/index.html', `cards numbered ${nums.join(', ')} (want 1 to 8, in order)`);
  for (const c of cards) {
    const legend = visible((c.html.match(/<legend>([\s\S]*?)<\/legend>/) ?? [, ''])[1]);
    if (!legend.startsWith(`${c.n}. `)) fail('plan-cards', `card ${c.n}`, `legend "${legend}" doesn't carry its number`);
  }
  for (const n of [1, 2, 3, 4, 5, 7, 8]) if (!nums.includes(n)) fail('plan-cards', 'plan/index.html', `question ${n} (missingAnswers asks for it) has no card`);
  const inCard = (name) => cards.find((c) => new RegExp(`\\sname="${name}"`).test(c.html));
  const fields = Object.keys(rules.emptyAnswers());
  for (const f of fields) {
    if (!FIELD_INPUTS[f]) { fail('plan-cards', 'rules', `answer field "${f}" has no input listed here; add its card and FIELD_INPUTS`); continue; }
    for (const name of FIELD_INPUTS[f]) if (!inCard(name)) fail('plan-cards', 'plan/index.html', `answer field "${f}": no input "${name}" on any card`);
  }
  const data = JSON.parse(html.match(/<script type="application\/json" id="plan-data">([\s\S]*?)<\/script>/)[1]);
  const values = (name) => {
    const c = inCard(name);
    if (!c) return [];
    return [...c.html.matchAll(new RegExp(`<input\\b[^>]*\\sname="${name}"[^>]*\\svalue="([^"]*)"`, 'g'))].map((m) => m[1])
      .concat([...(c.html.match(new RegExp(`<select\\b[^>]*\\sname="${name}"[^>]*>[\\s\\S]*?</select>`))?.[0] ?? '').matchAll(/<option\b[^>]*\svalue="([^"]+)"/g)].map((m) => m[1]));
  };
  const want = {
    base: [...data.data.bases.map((b) => b.code), 'unsure'], band: data.data.bands, timeline: rules.TIMELINES.map((t) => t.id),
    partner: ['yes', 'no'], bedrooms: rules.BEDROOM_CHOICES.map((b) => b.id), separate6: ['yes', 'no'], open: rules.OPEN_CHOICES.map((o) => o.id),
    'priority-1': data.config.priorities.map((p) => p.id), 'priority-2': data.config.priorities.map((p) => p.id),
  };
  let choices = 0;
  for (const [name, list] of Object.entries(want)) {
    const got = values(name);
    for (const v of list) { choices++; if (!got.includes(v)) fail('plan-cards', 'plan/index.html', `"${name}": choice "${v}" isn't offered on its card`); }
  }
  for (const attr of ['data-card-top', 'data-progress', 'data-card-nav', 'data-card-back', 'data-card-next', 'data-pick-list']) {
    if (!new RegExp(`\\s${attr}(?=[\\s=>])`).test(html)) fail('plan-cards', 'plan/index.html', `no ${attr}`);
  }
  if (!/<a\b[^>]*\shref="\/#ask-with-plan"[^>]*>Ask about this plan<\/a>/.test(html)) fail('plan-cards', 'plan/index.html', 'no "Ask about this plan" link to /#ask-with-plan');
  passes.push(`plan-cards: ${cards.length} cards cover ${fields.length} answer fields and ${choices} choices`);
}

// --- ask-view -------------------------------------------------------------------------
function checkAskView() {
  const cite = (url, title, section, verified_on) => ({ url, title, section, label: `${title}: ${section}`, verified_on });
  const santee = { kind: 'answer', citations: [cite('/communities/santee/#cost', 'Santee', 'Cost', '2026-09-22'), cite('/communities/santee/#commute', 'Santee', 'Commute at 0700', '2026-10-01'), cite('/base/miramar/#bah-table', 'MCAS Miramar', 'Housing allowance (BAH) by pay grade', '2026-10-20')] };
  const cases = [
    ['latest date', latestDate(santee.citations), '2026-10-20'],
    ['latest date, months and days', latestDate([{ verified_on: '2026-10' }, { verified_on: '2026-09-30' }]), '2026-10'],
    ['latest date, none', latestDate([]), null],
    ['related: top cited section', relatedPage(santee), { url: '/communities/santee/#cost', title: 'Santee', sub: 'Cost' }],
    ['related: nearest page for "I don\'t have that"', relatedPage({ kind: 'no_answer', citations: [], nearest: { url: '/sequence/', title: 'Move sequence' } }), { url: '/sequence/', title: 'Move sequence', sub: 'Nearest page' }],
    ['related: nothing', relatedPage({ error: 'busy' }), null],
    ['follow-ups skip cited sections', followUps(santee, 'q'), ['Which schools serve Santee?', 'What hazards should we know about in Santee?', 'What child care is there in Santee?']],
    ['no follow-ups for a fixed answer', followUps({ ...santee, kind: 'referral' }), []],
    ['no follow-ups off the place pages', followUps({ kind: 'answer', citations: [cite('/sequence/arrival/#arrival-travel-claim', 'Arrival', 'x')] }), []],
    ['follow-ups never repeat the question', followUps({ kind: 'answer', citations: [cite('/base-housing/murphy-canyon/#glance', 'Murphy Canyon base housing', 'At a glance')] }, 'How long is the wait for Murphy Canyon base housing?').length, 3],
  ];
  for (const [name, got, want] of cases) if (JSON.stringify(got) !== JSON.stringify(want)) fail('ask-view', name, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  passes.push(`ask-view: ${cases.length} cases`);
}

// --- Run --------------------------------------------------------------------------------
function load() {
  const files = Object.fromEntries(walk(DIST).map((f) => [relative(DIST, f), readFileSync(f, 'utf-8')]));
  const redirects = existsSync(join(DIST, '_redirects')) ? read('_redirects') : null;
  const index = buildIndex(JSON.parse(read('assistant/corpus.json')));
  return { files, redirects, index };
}
function run({ files, redirects, index }) {
  const examples = checkHome(files);
  checkExamples(examples, index);
  checkMenu(files);
  checkRedirect(files, redirects);
  checkPlanCards(files);
  checkAskView();
}
const CHECKS = ['home-start', 'home-examples', 'menu-links', 'ask-redirect', 'plan-cards', 'ask-view'];

// One fault of each kind, planted in memory (nothing on disk changes); each must fail the check named.
const edit = (page, fn) => (s) => ({ ...s, files: { ...s.files, [page]: fn(s.files[page]) } });
const PLANTS = {
  'a table on the start screen': ['home-start', edit('index.html', (h) => h.replace('<p class="start-trust"', '<table><tr><td>x</td></tr></table><p class="start-trust"'))],
  'a count on the start screen': ['home-start', edit('index.html', (h) => h.replace('Not sure what to ask?', 'Not sure what to ask? 40 neighborhoods'))],
  'the map moved above the fold': ['home-start', edit('index.html', (h) => h.replace('<p class="start-trust"', '<figure><svg></svg></figure><p class="start-trust"'))],
  'a second textarea': ['home-start', edit('index.html', (h) => h.replace('<p class="start-trust"', '<textarea></textarea><p class="start-trust"'))],
  'ask box unlabeled': ['home-start', edit('index.html', (h) => h.replace(/<label class="ask-label" for="ask-q"[^>]*>[^<]*<\/label>/, ''))],
  'an example retrieval can\'t answer': ['home-examples', edit('index.html', (h) => h.replace(/(<button\b[^>]*data-example[^>]*>)[^<]*/, '$1What time do the Padres play on Sunday?'))],
  'a broken menu link': ['menu-links', edit('browse/index.html', (h) => h.replace('href="/sequence/forms/"', 'href="/sequence/claims/"'))],
  'drawer differs from /browse/': ['menu-links', edit('sources/index.html', (h) => h.replace('href="/plan/"', 'href="/changelog/"'))],
  'menu button needs JavaScript': ['menu-links', edit('index.html', (h) => h.replace(/(<a\b[^>]*)href="\/browse\/"([^>]*data-menu-btn)/, '$1href="#"$2'))],
  'redirect dropped': ['ask-redirect', (s) => ({ ...s, redirects: s.redirects.replace(/^\/ask\/ .*$/m, '') })],
  'old ask page back': ['ask-redirect', edit('ask/index.html', (h) => h.replace(/<meta http-equiv="refresh"[^>]*>/, '').replace('</main>', '<textarea></textarea></main>'))],
  'a card missing (pets)': ['plan-cards', edit('plan/index.html', (h) => h.replace(/<fieldset class="q" data-q="6"[\s\S]*?<\/fieldset>/, ''))],
  'a choice missing (Camp Pendleton)': ['plan-cards', edit('plan/index.html', (h) => h.replace(/<label class="opt"><input type="radio" name="base" value="PENDLETON"[^>]*>[^<]*<\/label>/, ''))],
  'no "Ask about this plan"': ['plan-cards', edit('plan/index.html', (h) => h.replace('href="/#ask-with-plan"', 'href="/"'))],
};

const loaded = load();
const plantArg = process.argv.includes('--plant') ? process.argv[process.argv.indexOf('--plant') + 1] : null;
if (plantArg) {
  let caught = 0;
  const names = plantArg === 'all' ? Object.keys(PLANTS) : [plantArg];
  for (const name of names) {
    const [check, plant] = PLANTS[name];
    failures.length = 0;
    run(plant(loaded));
    const hit = failures.some((f) => f.check === check);
    caught += hit;
    console.log(`  ${hit ? 'CAUGHT' : 'MISSED'}  ${check}: ${name}`);
  }
  console.log(`\nFront end plants: ${caught} of ${names.length} caught\n`);
  process.exit(caught === names.length ? 0 : 1);
}

run(loaded);
const byCheck = failures.reduce((acc, f) => ((acc[f.check] ??= []).push(f), acc), {});
console.log('\nFront end checks (dist)');
for (const c of CHECKS) {
  const fs = byCheck[c] ?? [];
  if (!fs.length) console.log(`  PASS  ${c}`);
  else {
    console.log(`  FAIL  ${c} (${fs.length})`);
    for (const f of fs.slice(0, 20)) console.log(`        ${f.where}: ${f.what}`);
  }
}
for (const p of passes) console.log(`  ${p}`);
if (failures.length) {
  console.log(`\n${failures.length} front end check failure(s). Build failed.\n`);
  process.exit(1);
}
console.log('');
