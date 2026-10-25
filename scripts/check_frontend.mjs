#!/usr/bin/env node
// Front end checks (v1.0.0: ask first), run after the build (postbuild). Any failure exits 1 and fails
// `npm run build`. They read the built pages in dist/; scripts/check_frontend_browser.mjs checks the same things that
// need a browser (the fold, focus, the cards' keyboard behavior).
//
//   home-start      the start screen ([data-start] on /) has one ask box (one labeled textarea, one send button) and
//                   no data: no table, figure, map, fact list, image, fact block or source key, no BAH figure, and no
//                   digit outside the example questions (which carry no $ or %)
//   home-layout     home is the start screen, then the region map right after it (the example chips last in the
//                   start screen; no "Not sure what to ask?" card), and nothing else: no base cards, counts or other
//                   sections; the footer's first line is "Every answer cites its official source and date…"
//   home-chip       the ask box's bottom bar holds the move chip at the left and Ask at the right; empty, the chip is
//                   "+ Add your move", a link to /plan/; set, a menu button (aria-expanded, aria-controls its menu)
//                   whose menu has See your plan (/plan/), Edit answers (/plan/#edit) and Clear, and a labeled × button;
//                   the chip button has a name of its own (aria-label) before the script fills it; the old "Include my
//                   starting-plan answers" checkbox is gone; "What's sent?" is under the box, not inside it (the box is
//                   sticky in a conversation, so a panel in it covers the answer)
//   ask-context     what the chip sends (assistant/context.js): from every kind of stored answer, only base, band,
//                   partner and the children's age groups, each a value the intake offers, never a count, a timeline,
//                   pets, priorities or anything else; the request body has only question, previous and context; the
//                   server drops any other field and never puts the context in the question; the prompt's rules line
//   home-examples   every example question gets sections from retrieval (never "I don't have that"), run on the
//                   built corpus with the assistant's own search
//   menu-links      the drawer on every page lists the same links as /browse/ (the menu without JavaScript), every
//                   link resolves to a built page, and they include the eight bases, both indexes, the sequence, the
//                   forms page, the starting plan and /sources/; the menu button is a link to /browse/
//   site-name       every page's header has "San Diego PCS Guide" linking to /; /plan/ shows "Start over" under it
//   no-orphans      every built page but home and /ask/ has a link from another page or from the menu, so taking the
//                   old content off home left nothing reachable only from home
//   ask-redirect    /ask/ redirects to /: a 301 in _redirects (Cloudflare) and, in dist/ask/, a meta refresh and a
//                   link to /, with no ask box left there
//   plan-cards      /plan/ has one card (fieldset) per question, numbered 1 to 8 in order, covering every answer
//                   field the rules define (emptyAnswers) and every choice the rules and config offer; each yes/no radio,
//                   bedroom count and count input has a name that says what it is (aria-label), and the yes/no and
//                   count groups are labeled by their question
//   plan-singles    over every base (and "not sure") × pay band × bedroom choice, for a member moving alone: every
//                   section showing a rent-to-allowance ratio says it uses the with-dependents rate; with a base, it
//                   carries the band's without-dependents rate (lo–hi) exactly as bah.json has it for the base's MHA,
//                   citing /base/<slug>/#bah-table with the BAH date; with "not sure", none. A household with a partner
//                   or children gets neither. No plan says "the smallest row we have"; every BAH line cites #bah-table.
//                   The bedroom helper says CNIC lists no standard for officers and senior enlisted, and only E1–E6 hear
//                   "enlisted guidelines"
//   no-notes-refs   no built page shows "QUESTIONS.md" (the /sources/ table said "see QUESTIONS.md")
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
import * as askContext from '../assistant/context.js';
import { handleAsk } from '../assistant/ask.js';
import { SYSTEM_PROMPT } from '../assistant/prompt.js';

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

// --- home-layout ---------------------------------------------------------------------
const HOME_FOOTER = 'Every answer cites its official source and date. No ads, no referrals. This site stores nothing you type.';
function checkHomeLayout(files) {
  const html = files['index.html'];
  const main = elementWith(html, 'id="main"') ?? '';
  const inner = main.replace(/^<main[^>]*>|<\/main>$/g, '');
  const kids = [];
  for (let i = 0, m; (m = inner.slice(i).match(/<(\w+)\b[^>]*>/));) {
    const el = elementAt(inner, i + m.index);
    kids.push(el);
    i += m.index + el.length;
  }
  const what = kids.map((k) => (/\sdata-start\b/.test(k) ? 'start' : /\sdata-home-map\b/.test(k) ? 'map' : k.match(/^<\w+[^>]*>/)[0].slice(0, 40)));
  if (what.join(' ') !== 'start map') fail('home-layout', 'index.html', `home's main holds ${what.join(', ')} (want the start screen, then the map, nothing else)`);
  const start = kids.find((k) => /\sdata-start\b/.test(k)) ?? '';
  if (!/<div class="ask-examples" data-examples>[\s\S]*?<\/ul>\s*<\/div>\s*<\/div>\s*<\/section>$/.test(start)) fail('home-layout', 'index.html', 'the example chips aren\'t the last thing before the map');
  if (/\sdata-plan-cta\b|Not sure what to ask\?/.test(main)) fail('home-layout', 'index.html', '"Not sure what to ask?" is still on home');
  const map = kids.find((k) => /\sdata-home-map\b/.test(k)) ?? '';
  if (!/<figure\b[^>]*class="map\b/.test(map) || !/<svg\b/.test(map)) fail('home-layout', 'index.html', 'no region map after the start screen');
  for (const [re, w] of [[/cards-bases/, 'the base cards'], [/class="browse"/, 'the browse counts'], [/<h2\b/, 'a section heading']]) if (re.test(main)) fail('home-layout', 'index.html', `${w} still on home`);
  const note = (html.match(/<p data-footer-note>([\s\S]*?)<\/p>/) ?? [])[1];
  if (decode(note ?? '') !== HOME_FOOTER) fail('home-layout', 'index.html', `footer line is "${note ?? ''}"`);
}

// --- home-chip ---------------------------------------------------------------------------
function checkHomeChip(files) {
  const html = files['index.html'];
  const box = elementWith(html, 'data-box') ?? '';
  const bar = elementWith(box, 'class="ask-bar"');
  if (!bar) { fail('home-chip', 'index.html', 'no bottom bar (.ask-bar) in the ask box'); return; }
  const ctx = bar.indexOf(' data-ctx>');
  const send = bar.search(/<button\b[^>]*\sdata-send\b/);
  if (ctx < 0 || send < 0 || ctx > send) fail('home-chip', 'index.html', 'the bar doesn\'t hold the chip at the left and Ask at the right');
  if (!/<textarea\b[\s\S]*<div class="ask-bar">/.test(elementWith(box, 'class="ask-field"') ?? '')) fail('home-chip', 'index.html', 'the bar isn\'t under the textarea, inside the box');
  const add = bar.match(/<a\b([^>]*)\sdata-ctx-add\b[^>]*>([^<]*)<\/a>/);
  if (!add || !/\shref="\/plan\/"/.test(add[0]) || decode(add[2]).trim() !== '+ Add your move') fail('home-chip', 'index.html', 'empty chip isn\'t "+ Add your move" linking to /plan/');
  const btn = bar.match(/<button\b[^>]*\sdata-ctx-btn\b[^>]*>/)?.[0] ?? '';
  const menuId = btn.match(/\saria-controls="([^"]+)"/)?.[1];
  const menu = menuId ? elementWith(bar, `id="${menuId}"`) : null;
  if (!btn || !/\stype="button"/.test(btn) || !/\saria-expanded="false"/.test(btn) || !menu) fail('home-chip', 'index.html', 'the set chip isn\'t a button with aria-expanded controlling its menu');
  const items = menu ? [...menu.matchAll(/<(a|button)\b([^>]*)>([^<]*)<\/\1>/g)].map((m) => ({ tag: m[1], href: m[2].match(/\shref="([^"]*)"/)?.[1], text: decode(m[3]).trim() })) : [];
  const want = [['See your plan', 'a', '/plan/'], ['Edit answers', 'a', '/plan/#edit'], ['Clear', 'button']];
  for (const [text, tag, href] of want) if (!items.some((i) => i.text === text && i.tag === tag && (!href || i.href === href))) fail('home-chip', 'index.html', `the menu has no "${text}"${href ? ` linking to ${href}` : ''}`);
  if (!/<button\b[^>]*\sdata-ctx-x\b[^>]*\saria-label="[^"]+"[^>]*>/.test(bar)) fail('home-chip', 'index.html', 'no labeled × button on the chip');
  if (!/\saria-label="[^"]*\w[^"]*"/.test(btn)) fail('home-chip', 'index.html', 'the chip button has no name of its own (aria-label)');
  const panel = elementWith(html, 'data-sent-panel');
  if (!panel) fail('home-chip', 'index.html', 'no "What\'s sent?" panel');
  else if (box.includes(' data-sent-panel')) fail('home-chip', 'index.html', '"What\'s sent?" is inside the ask box, which sticks to the bottom of the screen in a conversation');
  if (/\sdata-context(?=[\s=>])|Include my starting-plan answers/.test(html)) fail('home-chip', 'index.html', 'the old starting-plan checkbox is still there');
}

// --- ask-context ---------------------------------------------------------------------------
// Every kind of answer the intake stores, plus fields it never asks (MOS, a name, free text), which must never go.
const ANSWERS = (base, band, partner, kids) => ({
  base, band, timeline: '30-60', partner, kids, bedrooms: '3', separate6: true, cats: 1, dogs: 2,
  open: ['renting'], priorities: ['where', 'cost'], mos: '0311', name: 'Jane Doe', notes: 'call me at 555-0100',
});
const KID_SETS = [{}, { '0-2': 1 }, { '6-9': 2, '10-13': 1 }, { '0-2': 1, '3-5': 1, '6-9': 1, '10-13': 1, '14-18': 3 }];
async function checkAskContext(ctx) {
  const { CONTEXT_FIELDS, BASES, BANDS, KID_GROUPS } = askContext;
  const okValue = (k, v) => (k === 'base' ? Object.hasOwn(BASES, v) : k === 'band' ? BANDS.includes(v) : k === 'partner' ? typeof v === 'boolean'
    : Array.isArray(v) && v.every((g) => KID_GROUPS.includes(g)));
  let n = 0;
  for (const base of [...Object.keys(BASES), null]) for (const band of [...BANDS, null]) for (const partner of [true, false, null]) for (const kidSet of KID_SETS) {
    const kids = Object.fromEntries(KID_GROUPS.map((g) => [g, kidSet[g] ?? 0]));
    const c = ctx.contextFromAnswers(ANSWERS(base, band, partner, kids));
    n++;
    const where = `${base} ${band} partner=${partner} ${JSON.stringify(kidSet)}`;
    if (!c) { if (base || band || partner != null) fail('ask-context', where, 'no context from answers that have some'); continue; }
    for (const [k, v] of Object.entries(c)) {
      if (!CONTEXT_FIELDS.includes(k)) fail('ask-context', where, `sends "${k}" (only ${CONTEXT_FIELDS.join(', ')})`);
      else if (!okValue(k, v)) fail('ask-context', where, `${k} = ${JSON.stringify(v)} isn't a value the intake offers`);
    }
    const wantKids = partner == null ? undefined : KID_GROUPS.filter((g) => kidSet[g]);
    if (JSON.stringify(c.kids) !== JSON.stringify(wantKids)) fail('ask-context', where, `kids sent as ${JSON.stringify(c.kids)} (want the age groups ${JSON.stringify(wantKids)}, no counts)`);
    if ((partner == null) !== (c.partner == null)) fail('ask-context', where, 'household sent without question 4, or dropped with it');
    if (JSON.stringify(ctx.cleanContext(c)) !== JSON.stringify(c)) fail('ask-context', where, 'the server would change what the chip sends');
    const names = ctx.contextLines(c).map(([name]) => name);
    if (names.join() !== Object.keys(c).join()) fail('ask-context', where, `"What's sent?" lists ${names.join(', ')} for ${Object.keys(c).join(', ')}`);
    const body = ctx.requestBody('q', { question: 'p', answer: 'a' }, c);
    if (Object.keys(body).join() !== 'question,previous,context') fail('ask-context', where, `body fields ${Object.keys(body).join(', ')}`);
  }
  if (Object.keys(ctx.requestBody('q', null, null)).join() !== 'question') fail('ask-context', 'off', 'with the chip off or empty, the body has more than the question');
  // The server: unknown fields and values dropped, the context never in the question, the rules line in the prompt.
  const raw = { base: 'PENDLETON', band: 'E5–E6', partner: true, kids: ['6-9', '6-9', '99'], mos: '0311', name: 'Jane Doe', timeline: '30-60', priorities: ['where'] };
  if (JSON.stringify(ctx.cleanContext(raw)) !== JSON.stringify({ base: 'PENDLETON', band: 'E5–E6', partner: true, kids: ['6-9'] })) fail('ask-context', 'server', `cleanContext keeps ${JSON.stringify(ctx.cleanContext(raw))}`);
  if (ctx.cleanContext({ base: 'XYZ', band: 'E10', partner: 'yes', kids: ['6-9'] }) !== null) fail('ask-context', 'server', 'bad values kept');
  const question = 'How do I file my PCS travel claim?';
  const r = await handleAsk({ body: { question, context: raw, mos: '0311', notes: 'Jane Doe' }, env: {}, index: ctx.index });
  const user = r.json.prompt?.messages[0].content ?? '';
  if (/0311|Jane|30-60|priorit/i.test(user)) fail('ask-context', 'server', 'a field outside the allow list reached the prompt');
  if (!user.endsWith(`Question: ${question}`) || !/Household details from the family's starting plan \(for relevance only, not a source\): reporting to Camp Pendleton; pay band E5–E6; spouse or partner; children aged 6–9\n/.test(user)) fail('ask-context', 'server', 'the context isn\'t its own line, apart from the question');
  for (const words of [/only to pick what's relevant/, /never state a fact the sections don't support/, /Don't open with them or restate them as a preamble, and never say whether the answer depends on them/, /When a figure or list depends on the base or pay grade \(BAH, drive groups, base housing eligibility\), name the base and pay grade it applies to/]) if (!words.test(SYSTEM_PROMPT)) fail('ask-context', 'prompt', `the rules line lacks ${words}`);
  if (/say so in a few words|same for every base and pay grade/.test(SYSTEM_PROMPT)) fail('ask-context', 'prompt', 'the rules line still asks the model to say the answer doesn\'t depend on the household');
  passes.push(`ask-context: ${n} answer sets; the body has only question, previous and context`);
}

// --- site-name -------------------------------------------------------------------------
function checkSiteName(files) {
  for (const [page, html] of Object.entries(files)) {
    const bar = elementWith(html, 'class="bar"') ?? '';
    const a = bar.match(/<a class="site-name" href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a || a[1] !== '/' || !visible(a[2]).startsWith('San Diego PCS Guide')) fail('site-name', page, 'no "San Diego PCS Guide" link to / in the header');
  }
  const plan = files['plan/index.html'] ?? '';
  if (!/<span class="site-sub" data-site-sub>Start over<\/span>/.test(plan)) fail('site-name', 'plan/index.html', 'no visible "Start over" under the site name');
}

// --- no-orphans ---------------------------------------------------------------------
function checkOrphans(files) {
  // Links from home don't count: home was the only way to some pages before; it mustn't be now.
  const fromElsewhere = new Set();
  for (const [page, html] of Object.entries(files)) {
    if (page === 'index.html') continue;
    const self = `/${page.replace(/index\.html$/, '')}`;
    for (const href of hrefs(html)) {
      const path = href.split('#')[0].split('?')[0];
      if (path.startsWith('/') && path !== self) fromElsewhere.add(path);
    }
  }
  const pages = Object.keys(files).map((p) => `/${p.replace(/index\.html$/, '')}`).filter((p) => p !== '/' && p !== '/ask/' && !p.endsWith('.html'));
  for (const p of pages) if (!fromElsewhere.has(p)) fail('no-orphans', p, 'no link to it from any page but home');
  passes.push(`no-orphans: ${pages.length} pages, each linked from another page or the menu`);
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
  // Names: an input whose visible label is only "Yes", "2" or "cats" says what it is, and its group is labeled.
  for (const m of html.matchAll(/<input\b[^>]*\sname="(partner|separate6|bedrooms|kids-[^"]+|cats|dogs)"[^>]*>/g)) {
    const value = m[0].match(/\svalue="([^"]*)"/)?.[1];
    if (m[1] === 'bedrooms' && value === 'help') continue; // "Help me figure it out" says it
    if (!/\saria-label="[^"]*\w[^"]*"/.test(m[0])) fail('plan-cards', 'plan/index.html', `input "${m[1]}"${value ? ` = "${value}"` : ''} has no name that says what it is`);
  }
  for (const name of ['partner', 'separate6', 'kids-0-2']) {
    const at = html.search(new RegExp(`<input\\b[^>]*\\sname="${name}"`));
    const group = at < 0 ? '' : html.slice(html.lastIndexOf('<div', html.lastIndexOf('<label', at)), at);
    const id = group.match(/\saria-labelledby="([^"]+)"/)?.[1];
    if (!id || !/\srole="(radiogroup|group)"/.test(group) || !new RegExp(`\\sid="${id}"`).test(html)) fail('plan-cards', 'plan/index.html', `the "${name}" inputs aren't in a group labeled by their question`);
  }
  passes.push(`plan-cards: ${cards.length} cards cover ${fields.length} answer fields and ${choices} choices`);
}

// --- plan-singles -------------------------------------------------------------------------
const BAH_ROWS = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'bah.json'), 'utf-8'));
const RATIO = /\d+(?:–\d+)?% of the [^;]*allowance/;
function checkPlanSingles(files, r = rules) {
  const html = files['plan/index.html'];
  if (!html) return;
  const { data, config } = JSON.parse(html.match(/<script type="application\/json" id="plan-data">([\s\S]*?)<\/script>/)[1]);
  const kids0 = Object.fromEntries(r.KID_GROUPS.map((g) => [g, 0]));
  const HOUSEHOLDS = [['alone', { partner: false, kids: kids0 }], ['partner', { partner: true, kids: kids0 }], ['child', { partner: false, kids: { ...kids0, '6-9': 1 } }]];
  let plans = 0;
  let sections = 0;
  for (const base of [...data.bases.map((b) => b.code), 'unsure']) for (const band of data.bands) for (const bedrooms of ['2', '3', '4plus', 'help']) for (const [who, h] of HOUSEHOLDS) for (const first of ['where', 'cost']) {
    const a = { ...r.emptyAnswers(), ...h, base, band, bedrooms, timeline: '60-90', open: ['renting'], priorities: [first] };
    const where = `${base} ${band} ${bedrooms} ${who} ${first}`;
    const plan = r.buildPlan(a, data, config);
    plans++;
    const b = data.bases.find((x) => x.code === base);
    for (const s of plan.sections) {
      const ratio = s.lines.some((l) => RATIO.test(l.text));
      const said = (s.note ?? '').includes(r.SINGLE_RATIO_NOTE);
      if (who !== 'alone' || !ratio) {
        if (said || s.without) fail('plan-singles', `${where} § ${s.id}`, `says the with-dependents note or carries a rate without dependents (${who}, ${ratio ? 'ratios' : 'no ratios'})`);
        continue;
      }
      sections++;
      if (!said) fail('plan-singles', `${where} § ${s.id}`, 'a ratio section for a member alone doesn\'t say it uses the with-dependents rate');
      if (!b) { if (s.without) fail('plan-singles', `${where} § ${s.id}`, 'base not sure, but a rate without dependents is shown'); continue; }
      const rows = BAH_ROWS.filter((x) => x.pay_band === band && x.mha === b.mha);
      const w = s.without;
      const want = rows.length && { lo: Math.min(...rows.map((x) => x.without_dependents)), hi: Math.max(...rows.map((x) => x.without_dependents)), year: rows[0].year, mha: b.mha, area: rows[0].area };
      if (!w || !want || w.lo !== want.lo || w.hi !== want.hi || w.year !== want.year || w.mha !== want.mha || w.area !== want.area || w.band !== band) fail('plan-singles', `${where} § ${s.id}`, `rate without dependents ${JSON.stringify(w && { lo: w.lo, hi: w.hi, year: w.year, mha: w.mha })}, bah.json has ${JSON.stringify(want)}`);
      else if (w.source?.url !== `/base/${b.slug}/#bah-table` || !w.source.dates?.includes(`BAH ${want.year} · verified ${rows[0].verified_on}`)) fail('plan-singles', `${where} § ${s.id}`, `rate without dependents cites ${JSON.stringify(w.source)}`);
    }
    for (const s of plan.sections) for (const l of s.lines) {
      if (/smallest row/i.test(l.text)) fail('plan-singles', `${where} § ${s.id}`, `"${l.text.slice(0, 80)}"`);
      if (s.id === 'bah' && /\$/.test(l.text) && !l.sources.every((x) => x.url.endsWith('/#bah-table'))) fail('plan-singles', `${where} § bah`, `BAH line cites ${l.sources.map((x) => x.url).join(', ')}`);
    }
  }
  for (const band of data.bands) {
    const text = r.bedroomHelperText({ ...r.emptyAnswers(), partner: true, kids: { ...kids0, '10-13': 1 }, band, bedrooms: 'help' });
    const senior = !['E1–E4', 'E5–E6'].includes(band);
    if (senior ? !/CNIC lists no bedroom standard for officers and senior enlisted/.test(text) || /enlisted guidelines/.test(text) : !/enlisted guidelines/.test(text)) fail('plan-singles', `bedroom helper ${band}`, `"${text}"`);
  }
  if (!sections) fail('plan-singles', 'plan', 'no ratio section for a member alone, so nothing was tested');
  passes.push(`plan-singles: ${plans} plans, ${sections} ratio sections for a member alone`);
}

// --- no-notes-refs ----------------------------------------------------------------------
function checkNotesRefs(files) {
  for (const [page, html] of Object.entries(files)) if (/QUESTIONS\.md/.test(visible(html))) fail('no-notes-refs', page, 'shows "QUESTIONS.md"');
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
  return { files, redirects, index, ctx: askContext, rules };
}
async function run({ files, redirects, index, ctx, rules: r }) {
  const examples = checkHome(files);
  checkHomeLayout(files);
  checkHomeChip(files);
  await checkAskContext({ ...ctx, index });
  checkExamples(examples, index);
  checkMenu(files);
  checkSiteName(files);
  checkOrphans(files);
  checkRedirect(files, redirects);
  checkPlanCards(files);
  checkPlanSingles(files, r);
  checkNotesRefs(files);
  checkAskView();
}
const CHECKS = ['home-start', 'home-layout', 'home-chip', 'ask-context', 'home-examples', 'menu-links', 'site-name', 'no-orphans', 'ask-redirect', 'plan-cards', 'plan-singles', 'no-notes-refs', 'ask-view'];

// One fault of each kind, planted in memory (nothing on disk changes); each must fail the check named.
const edit = (page, fn) => (s) => ({ ...s, files: { ...s.files, [page]: fn(s.files[page]) } });
const PLANTS = {
  'a table on the start screen': ['home-start', edit('index.html', (h) => h.replace('<div class="ask-examples"', '<table><tr><td>x</td></tr></table><div class="ask-examples"'))],
  'a count on the start screen': ['home-start', edit('index.html', (h) => h.replace('>Try one<', '>Try one of 40 neighborhoods<'))],
  'a figure on the start screen': ['home-start', edit('index.html', (h) => h.replace('<div class="ask-examples"', '<figure><svg></svg></figure><div class="ask-examples"'))],
  'a second textarea': ['home-start', edit('index.html', (h) => h.replace('<div class="ask-examples"', '<textarea></textarea><div class="ask-examples"'))],
  'ask box unlabeled': ['home-start', edit('index.html', (h) => h.replace(/<label class="ask-label" for="ask-q"[^>]*>[^<]*<\/label>/, ''))],
  'base cards back on home': ['home-layout', edit('index.html', (h) => h.replace('<div class="home-map"', '<ul class="cards cards-bases"><li>x</li></ul><div class="home-map"'))],
  '"Not sure what to ask?" card back': ['home-layout', edit('index.html', (h) => h.replace(/(<\/div>\s*<\/div>\s*)(<\/section>)/, '$1<a class="card start-plan" href="/plan/" data-plan-cta>Not sure what to ask?</a>$2'))],
  'chip at the right of Ask': ['home-chip', edit('index.html', (h) => h.replace(/(<div class="ask-bar">)([\s\S]*?)(<button type="button" class="ask-send" data-send>Ask<\/button>)/, '$1$3$2'))],
  'empty chip not a link to the plan': ['home-chip', edit('index.html', (h) => h.replace('href="/plan/" data-ctx-add', 'href="/browse/" data-ctx-add'))],
  'no "Edit answers" in the menu': ['home-chip', edit('index.html', (h) => h.replace('<li><a href="/plan/#edit">Edit answers</a></li>', ''))],
  'unlabeled ×': ['home-chip', edit('index.html', (h) => h.replace(/(data-ctx-x) aria-label="[^"]*"/, '$1'))],
  'chip sends the timeline': ['ask-context', (s) => ({ ...s, ctx: { ...s.ctx, contextFromAnswers: (a) => { const c = askContext.contextFromAnswers(a); return c && { ...c, timeline: a.timeline }; } } })],
  'chip sends kid counts': ['ask-context', (s) => ({ ...s, ctx: { ...s.ctx, contextFromAnswers: (a) => { const c = askContext.contextFromAnswers(a); return c?.kids ? { ...c, kids: Object.entries(a.kids).flatMap(([g, k]) => Array(k).fill(g)) } : c; } } })],
  'body carries an extra field': ['ask-context', (s) => ({ ...s, ctx: { ...s.ctx, requestBody: (...xs) => ({ ...askContext.requestBody(...xs), page: '/' }) } })],
  'server keeps unknown fields': ['ask-context', (s) => ({ ...s, ctx: { ...s.ctx, cleanContext: (raw) => (raw && typeof raw === 'object' ? { ...raw } : null) } })],
  'footer line missing': ['home-layout', edit('index.html', (h) => h.replace(/<p data-footer-note>[\s\S]*?<\/p>/, '<p>Every fact carries the date it was checked.</p>'))],
  'site name not linked home': ['site-name', edit('sources/index.html', (h) => h.replace('<a class="site-name" href="/"', '<a class="site-name" href="/sources/"'))],
  'no "Start over" on the plan': ['site-name', edit('plan/index.html', (h) => h.replace('<span class="site-sub" data-site-sub>', '<span class="site-sub" data-site-sub hidden>'))],
  '/browse/ reachable only from home': ['no-orphans', (st) => ({ ...st, files: Object.fromEntries(Object.entries(st.files).map(([k, v]) => [k, k === 'index.html' ? v : v.replaceAll('href="/browse/"', 'href="#"')])) })],
  'an example retrieval can\'t answer': ['home-examples', edit('index.html', (h) => h.replace(/(<button\b[^>]*data-example[^>]*>)[^<]*/, '$1What time do the Padres play on Sunday?'))],
  'a broken menu link': ['menu-links', edit('browse/index.html', (h) => h.replace('href="/sequence/forms/"', 'href="/sequence/claims/"'))],
  'drawer differs from /browse/': ['menu-links', edit('sources/index.html', (h) => h.replace('href="/plan/"', 'href="/changelog/"'))],
  'menu button needs JavaScript': ['menu-links', edit('index.html', (h) => h.replace(/(<a\b[^>]*)href="\/browse\/"([^>]*data-menu-btn)/, '$1href="#"$2'))],
  'redirect dropped': ['ask-redirect', (s) => ({ ...s, redirects: s.redirects.replace(/^\/ask\/ .*$/m, '') })],
  'old ask page back': ['ask-redirect', edit('ask/index.html', (h) => h.replace(/<meta http-equiv="refresh"[^>]*>/, '').replace('</main>', '<textarea></textarea></main>'))],
  'a card missing (pets)': ['plan-cards', edit('plan/index.html', (h) => h.replace(/<fieldset class="q" data-q="6"[\s\S]*?<\/fieldset>/, ''))],
  'a choice missing (Camp Pendleton)': ['plan-cards', edit('plan/index.html', (h) => h.replace(/<label class="opt"><input type="radio" name="base" value="PENDLETON"[^>]*>[^<]*<\/label>/, ''))],
  'no "Ask about this plan"': ['plan-cards', edit('plan/index.html', (h) => h.replace('href="/#ask-with-plan"', 'href="/"'))],
  'a count input named only "cats"': ['plan-cards', edit('plan/index.html', (h) => h.replace(/(name="cats"[^>]*?) aria-label="[^"]*"/, '$1'))],
  'the partner radios in no labeled group': ['plan-cards', edit('plan/index.html', (h) => h.replace('role="radiogroup" aria-labelledby="q-partner"', ''))],
  'chip button without a name': ['home-chip', edit('index.html', (h) => h.replace(/(data-ctx-btn) aria-label="[^"]*"/, '$1'))],
  '"What\'s sent?" back in the sticky box': ['home-chip', edit('index.html', (h) => {
    const panel = elementWith(h, 'data-sent-panel');
    return h.replace(panel, '').replace('<p class="gap" data-error', `${panel}<p class="gap" data-error`);
  })],
  'alone: no with-dependents note': ['plan-singles', (s) => ({ ...s, rules: { ...rules, buildPlan: (...xs) => { const p = rules.buildPlan(...xs); return { ...p, sections: p.sections.map((x) => ({ ...x, note: x.note?.replace(rules.SINGLE_RATIO_NOTE, '') })) }; } } })],
  'alone: rate without dependents off by a dollar': ['plan-singles', (s) => ({ ...s, rules: { ...rules, buildPlan: (...xs) => { const p = rules.buildPlan(...xs); return { ...p, sections: p.sections.map((x) => (x.without ? { ...x, without: { ...x.without, hi: x.without.hi + 1 } } : x)) }; } } })],
  'a partner gets the alone note': ['plan-singles', (s) => ({ ...s, rules: { ...rules, buildPlan: (a, ...xs) => rules.buildPlan(a.partner ? { ...a, partner: false } : a, ...xs) } })],
  '"smallest row" back': ['plan-singles', (s) => ({ ...s, rules: { ...rules, buildPlan: (...xs) => { const p = rules.buildPlan(...xs); return { ...p, sections: p.sections.map((x) => (x.id === 'bedrooms' ? { ...x, lines: x.lines.map((l) => ({ ...l, text: l.text.replace('The rent-to-allowance ratios start', 'The smallest row we have is 2 bedrooms. The ratios start') })) } : x)) }; } } })],
  'BAH line cites #bah': ['plan-singles', (s) => ({ ...s, rules: { ...rules, buildPlan: (...xs) => { const p = rules.buildPlan(...xs); return { ...p, sections: p.sections.map((x) => (x.id === 'bah' ? { ...x, lines: x.lines.map((l) => ({ ...l, sources: l.sources.map((y) => ({ ...y, url: y.url.replace('#bah-table', '#bah') })) })) } : x)) }; } } })],
  'senior helper says enlisted guidelines': ['plan-singles', (s) => ({ ...s, rules: { ...rules, bedroomHelperText: (a) => `Navy Housing's enlisted guidelines give 2 bedrooms (${a.band}).` } })],
  '"see QUESTIONS.md" back on /sources/': ['no-notes-refs', edit('sources/index.html', (h) => h.replace('<td>Link only.</td>', '<td>Link only (see QUESTIONS.md).</td>'))],
};

const loaded = load();
const plantArg = process.argv.includes('--plant') ? process.argv[process.argv.indexOf('--plant') + 1] : null;
if (plantArg) {
  let caught = 0;
  const names = plantArg === 'all' ? Object.keys(PLANTS) : [plantArg];
  for (const name of names) {
    const [check, plant] = PLANTS[name];
    failures.length = 0;
    await run(plant(loaded));
    const hit = failures.some((f) => f.check === check);
    caught += hit;
    console.log(`  ${hit ? 'CAUGHT' : 'MISSED'}  ${check}: ${name}`);
  }
  console.log(`\nFront end plants: ${caught} of ${names.length} caught\n`);
  process.exit(caught === names.length ? 0 : 1);
}

await run(loaded);
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
