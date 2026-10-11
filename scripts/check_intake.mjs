#!/usr/bin/env node
// Starting plan (F5) checks, run after the build (postbuild) and after
// check_principles.mjs. Any failure exits 1 and fails `npm run build`.
//
//   intake-network   the intake pages (/plan/, home, base pages) make no network requests and put
//                    nothing in a URL: their scripts use no fetch, XMLHttpRequest, sendBeacon,
//                    WebSocket, EventSource, history or location writes, and there is no <form>
//   intake-sources   every line the plan can print names a source (a page on this site that exists
//                    in dist/, or an official link with its incentive label) and that source's dates
//   intake-no-bah    no plan text shows a dollar figure at all (the plan speaks in ratios only), and
//                    the embedded data has no dollar field
//   intake-words     plan text passes the same word lists as the pages (scripts/principle_lists.mjs):
//                    no demographic descriptors, no score/index labels, no placeholder text
//   intake-config    the Q8 priority list and the tradeoff table are well formed
//   intake-tiers     a section headed "under 30 minutes" or "within 45 minutes" shows only places whose
//                    whole drive range is under that (the first "N–M min" on each line; rules v0.4)
//   (failures print the first 20 per check; ALL=1 node scripts/check_intake.mjs prints every one)
//   intake-dates     a line's source dates are only for facts on that line, and every fact it shows
//                    is dated: each date label ("Commute: …", "Pets: …") needs its fact in the line,
//                    and a drive time, ratio, wait, pet policy, Mello-Roos status or center count needs its label
//
// The plan is built in the browser from data embedded in /plan/, so the page checks
// can't see its text. Instead this script loads the same rules (src/lib/intake/rules.js)
// and the same embedded data from dist/plan/index.html, builds plans across the answer
// space, and checks every line. Each rule's inputs are covered in full: every base
// (and "not sure") × pay band × bedroom choice × "open to" set × first priority, with
// households, pets, report windows and second priorities cycled through; "Watch for"
// (the only part the report window changes) over every base × band × bedrooms ×
// window × base-housing choice; then every first × second priority pair, every
// household up to 3 children per age group, and every pet count up to 4 cats and 4 dogs.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMOGRAPHIC_TERMS, DEMOGRAPHIC_ALLOWED, SCORE_WORDS, SCORE_ALLOWED, PLACEHOLDER_PATTERNS } from './principle_lists.mjs';
import * as rules from '../src/lib/intake/rules.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const failures = [];
const passes = [];
const fail = (check, where, what) => failures.push({ check, where, what });
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const YEAR = /\b(19|20)\d{2}\b/;
const DOLLAR = /\$\s?\d/;

// --- intake-network ------------------------------------------------------------
// Anything that can send data or change the URL. Matched in the page's inline scripts and in
// every script file it loads (and their imports), so it covers the bundled rules too.
const NETWORK = [
  /\bfetch\s*\(/, /\bXMLHttpRequest\b/, /\bsendBeacon\b/, /\bWebSocket\b/, /\bEventSource\b/, /\bimportScripts\b/,
  /\bnew\s+Image\b/, /\bhistory\s*\.\s*(?:push|replace)State\b/, /\blocation\s*\.\s*(?:assign|replace)\s*\(/,
  /\blocation(?:\s*\.\s*(?:href|search|hash|pathname))?\s*=[^=]/, /\bwindow\s*\.\s*open\s*\(/, /\bdocument\s*\.\s*cookie\b/,
  /\bserviceWorker\b/, /\bnavigator\s*\.\s*share\b/,
];
const INTAKE_PAGES = ['plan/index.html', 'index.html', ...['naval-base-san-diego', 'miramar', 'north-island', 'naval-amphibious-base', 'point-loma', 'naval-medical-center', 'mcrd', 'camp-pendleton'].map((s) => `base/${s}/index.html`)];

function scriptsOf(html) {
  const out = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const src = (m[1].match(/\ssrc="([^"]+)"/) ?? [])[1];
    if (/type="application\/json"/.test(m[1])) continue; // data, not code
    if (src) out.push(...scriptFile(src, new Set()));
    else out.push({ where: 'inline script', code: m[2] });
  }
  return out;
}
function scriptFile(src, seen) {
  if (/^(https?:)?\/\//.test(src)) return [{ where: src, code: 'fetch(' }]; // a script from another origin fails outright
  const path = join(DIST, src.replace(/^\//, ''));
  if (seen.has(path) || !existsSync(path)) return [];
  seen.add(path);
  const code = readFileSync(path, 'utf-8');
  const files = [{ where: src, code }];
  for (const m of code.matchAll(/(?:import|from)\s*\(?\s*["']([^"']+\.js)["']/g)) {
    files.push(...scriptFile(new URL(m[1], `http://x${src}`).pathname, seen));
  }
  return files;
}
function checkNetwork() {
  for (const page of INTAKE_PAGES) {
    const file = join(DIST, page);
    if (!existsSync(file)) { fail('intake-network', page, 'page not built'); continue; }
    const html = readFileSync(file, 'utf-8');
    if (/<form\b/i.test(html)) fail('intake-network', page, '<form> on an intake page (a form can submit answers or put them in a URL)');
    for (const { where, code } of scriptsOf(html)) {
      for (const re of NETWORK) {
        const m = code.match(re);
        if (m) fail('intake-network', page, `${where}: "${m[0]}"`);
      }
    }
  }
}

// --- Plan text ------------------------------------------------------------------
function wordsFail(where, text, isLabel) {
  for (const re of PLACEHOLDER_PATTERNS) if (re.test(text)) fail('intake-words', where, `placeholder text: "${text}"`);
  let t = text;
  for (const re of DEMOGRAPHIC_ALLOWED) t = t.replace(re, ' ');
  for (const term of DEMOGRAPHIC_TERMS) {
    if (new RegExp(`\\b${escapeRe(term)}\\b`, 'i').test(t)) fail('intake-words', where, `"${term}" in: "${text}"`);
  }
  if (isLabel) {
    let label = text;
    for (const re of SCORE_ALLOWED) label = label.replace(re, ' ');
    if (SCORE_WORDS.test(label)) fail('intake-words', where, `score word in a heading: "${text}"`);
  }
  if (DOLLAR.test(text)) fail('intake-no-bah', where, `dollar figure in plan text: "${text}"`);
}
const pageExists = (url) => {
  const path = url.split('#')[0].split('?')[0];
  return existsSync(join(DIST, path.replace(/^\//, ''), path.endsWith('/') ? 'index.html' : ''));
};
function checkSource(where, s) {
  if (!s || !s.url || !s.title) { fail('intake-sources', where, `source without url or title: ${JSON.stringify(s)}`); return; }
  if (!s.dates || !YEAR.test(s.dates)) fail('intake-sources', where, `source ${s.url} has no dated line: "${s.dates ?? ''}"`);
  if (/^https?:\/\//.test(s.url)) {
    if (!s.url.startsWith('https://')) fail('intake-sources', where, `source is not https: ${s.url}`);
    if (!s.incentive?.trim()) fail('intake-sources', where, `outbound source without incentive label: ${s.url}`);
  } else if (!s.url.startsWith('/') || !pageExists(s.url)) fail('intake-sources', where, `source page doesn't exist in dist/: ${s.url}`);
  wordsFail(where, `${s.title} ${s.dates}`, false);
}
// Date labels the rules write, and what each one dates (matched in the line's text and link texts).
const DATE_FACT = {
  'Commute': /\b\d+(?:–\d+)? min\b|0700 drive|minutes/,
  'Rent ratio': /allowance/,
  'Mello-Roos': /Mello-Roos/,
  'Schools': /school|serves/i,
  'Child care': /child care|licensed centers|infant/i,
  'Waits': /\bwait|\bon the \w+ \d{4} list\b/i,
  'Wait times': /\bwait/i,
  'Pets': /\b(?:pets?|dogs?|cats?)\b/i,
  'Base housing': /\bbase housing\b/i,
  'Bedroom rule': /bedroom/i,
};
// Facts a line can show, and the labels that date them.
const FACT_DATE = [
  [/\b\d+(?:–\d+)? min\b/, ['Commute']],
  [/\d+(?:–\d+)?% of the [^;]*allowance/, ['Rent ratio']],
  [/\bmonths\b/, ['Waits', 'Wait times']],
  [/\b(?:pets?|dogs?|cats?)\b/i, ['Pets']],
  [/Mello-Roos/, ['Mello-Roos']],
  [/licensed centers/, ['Child care']],
];
function checkDates(w, line, sectionId) {
  if (sectionId === 'tradeoff') return; // hand-written, dated by its author
  const shown = [line.text, ...(line.ext ?? []).map((x) => x.text)].join(' ');
  const labels = new Set();
  for (const src of line.sources) {
    if (/^https?:/.test(src.url)) continue; // an official link, dated by its own verified date
    for (const m of src.dates.matchAll(/(?:^|\.\s)([A-Z][A-Za-z -]*?):/g)) labels.add(m[1]);
  }
  for (const l of labels) {
    if (!DATE_FACT[l]) fail('intake-dates', w, `unknown date label "${l}" (add it to DATE_FACT in check_intake.mjs)`);
    else if (!DATE_FACT[l].test(shown)) fail('intake-dates', w, `dated "${l}" but shows no ${l.toLowerCase()} fact`);
  }
  for (const [re, need] of FACT_DATE) {
    if (re.test(shown) && !need.some((l) => labels.has(l)) && line.sources.some((src) => !/^https?:/.test(src.url))) {
      fail('intake-dates', w, `shows "${shown.match(re)[0]}" without a ${need.join(' or ')} date`);
    }
  }
}

const seenLines = new Set();
const seenSections = new Set();
let plans = 0;
function checkPlan(plan, where) {
  plans++;
  if (plan.rules_version !== rules.RULES_VERSION) fail('intake-sources', where, 'plan without rules_version');
  for (const s of plan.sections) {
    const sk = `${s.heading}|${s.note}`;
    if (!seenSections.has(sk)) {
      seenSections.add(sk);
      wordsFail(`${where} § ${s.id}`, s.heading, true);
      if (s.note) wordsFail(`${where} § ${s.id}`, s.note, false);
    }
    // intake-tiers: the heading's limit against the top of each line's (first) drive range.
    const limit = /\bunder 30 minutes\b/i.test(s.heading) ? 30 : /\bwithin 45 minutes\b/i.test(s.heading) ? 45 : null;
    if (limit) {
      for (const line of s.lines) {
        const m = line.text.match(/\b(\d+)(?:–(\d+))? min to\b/);
        if (m && Number(m[2] ?? m[1]) >= limit) fail('intake-tiers', `${where} § ${s.id}`, `"${s.heading}" lists "${line.text.slice(0, 70)}"`);
      }
    }
    for (const line of s.lines) {
      const key = JSON.stringify(line);
      if (seenLines.has(key)) continue;
      seenLines.add(key);
      const w = `${where} § ${s.id}: "${String(line.text).slice(0, 60)}"`;
      if (!line.text?.trim()) fail('intake-sources', w, 'empty line');
      wordsFail(w, line.text, false);
      if (!Array.isArray(line.sources) || !line.sources.length) fail('intake-sources', w, 'line without a source');
      else { line.sources.forEach((src) => checkSource(w, src)); checkDates(w, line, s.id); }
      for (const x of line.ext ?? []) {
        if (!x.url?.startsWith('https://') || !x.text?.trim() || !x.incentive?.trim()) fail('intake-sources', w, `outbound link without https, text or incentive: ${JSON.stringify(x)}`);
        else wordsFail(w, `${x.text} ${x.incentive}`, false);
      }
    }
  }
}

// --- Run ------------------------------------------------------------------------
const planFile = join(DIST, 'plan', 'index.html');
if (!existsSync(planFile)) {
  fail('intake-sources', 'dist/plan/index.html', 'starting plan page not built');
} else {
  checkNetwork();
  const html = readFileSync(planFile, 'utf-8');
  const m = html.match(/<script type="application\/json" id="plan-data">([\s\S]*?)<\/script>/);
  if (!m) fail('intake-sources', 'plan/index.html', 'no embedded plan data');
  else {
    const { data, config } = JSON.parse(m[1]);
    const t0 = Date.now();

    // Embedded data: ratios only.
    if (DOLLAR.test(m[1])) fail('intake-no-bah', 'plan data', 'a dollar figure in the embedded data');
    for (const k of new Set(JSON.stringify(data).match(/"[a-z_]+":/gi) ?? [])) {
      if (/bah|allowance|dollar|rent_usd|price/i.test(k)) fail('intake-no-bah', 'plan data', `field ${k} could carry a dollar figure`);
    }

    // Config.
    const ids = config.priorities.map((p) => p.id);
    const WHEN = [null, 'child_6_18', 'child_0_5', 'partner', 'pet'];
    for (const p of config.priorities) {
      if (!p.id || !p.label || !WHEN.includes(p.shown_when)) fail('intake-config', 'src/config/intake/priorities.json', `bad entry ${JSON.stringify(p)}`);
      wordsFail('priorities.json', p.label, true);
    }
    if (new Set(ids).size !== ids.length) fail('intake-config', 'src/config/intake/priorities.json', 'duplicate id');
    for (const t of config.tradeoffs) {
      const w = `tradeoffs.json ${t.first} × ${t.second}`;
      if (!ids.includes(t.first) || !ids.includes(t.second) || t.first === t.second) fail('intake-config', w, 'first and second must be two different priority ids');
      if (!t.text?.trim()) fail('intake-config', w, 'no text');
      if (!Array.isArray(t.sources) || !t.sources.length) fail('intake-sources', w, 'tradeoff without a source');
    }
    const dupPairs = config.tradeoffs.map((t) => `${t.first}|${t.second}`);
    if (new Set(dupPairs).size !== dupPairs.length) fail('intake-config', 'src/config/intake/tradeoffs.json', 'duplicate pair');

    // Answer space.
    const kids = (k) => ({ '0-2': 0, '3-5': 0, '6-9': 0, '10-13': 0, '14-18': 0, ...k });
    const HOUSEHOLDS = [
      { partner: false, kids: kids({}), cats: 0, dogs: 0 },
      { partner: true, kids: kids({ '0-2': 1 }), cats: 0, dogs: 0 },
      { partner: true, kids: kids({ '3-5': 1, '6-9': 1 }), separate6: true, cats: 1, dogs: 0 },
      { partner: true, kids: kids({ '10-13': 1, '14-18': 1 }), cats: 2, dogs: 1 },
      { partner: false, kids: kids({ '3-5': 2, '6-9': 2 }), separate6: false, cats: 0, dogs: 1 },
      { partner: true, kids: kids({ '0-2': 2, '6-9': 1, '10-13': 2, '14-18': 2 }), separate6: true, cats: 1, dogs: 3 },
    ];
    const OPEN = [['renting'], ['buying'], ['base-housing'], ['renting', 'buying'], ['renting', 'base-housing'], ['buying', 'base-housing'], ['renting', 'buying', 'base-housing'], ['unsure']];
    const BASES = [...data.bases.map((b) => b.code), 'unsure'];
    const make = (o) => rules.cleanAnswers({ ...rules.emptyAnswers(), ...o }, data, config);
    const build = (a, where) => {
      try { checkPlan(rules.buildPlan(a, data, config), where); } catch (e) { fail('intake-sources', where, `rules threw: ${e.message}`); }
    };
    let i = 0;
    let noLead = 0;
    let fallbackLead = 0;
    for (const base of BASES) for (const band of data.bands) for (const bedrooms of ['2', '3', '4plus', 'help']) for (const open of OPEN) for (const first of ids) {
      const t = rules.TIMELINES[i % rules.TIMELINES.length]; // the report window only feeds "Watch for", covered in full below
      const fits = HOUSEHOLDS.filter((h) => rules.availablePriorities(make(h), config.priorities).some((p) => p.id === first));
      const h = fits[i % fits.length];
      const offered = rules.availablePriorities(make(h), config.priorities).map((p) => p.id).filter((p) => p !== first);
      const second = [null, ...offered][i % (offered.length + 1)];
      const a = make({ ...h, base, band, bedrooms, open, timeline: t.id, priorities: second ? [first, second] : [first] });
      i++;
      if (rules.missingAnswers(a).length) { fail('intake-sources', `${base}/${band}/${bedrooms}`, `answers incomplete: ${rules.missingAnswers(a)}`); continue; }
      const where = `${base} ${band} ${bedrooms}bd ${open.join('+')} ${t.id} ${first}>${second ?? '-'}`;
      const plan = rules.buildPlan(a, data, config);
      if (plan.sections.some((s) => s.id === 'lead-missing')) noLead++;
      else if (plan.sections.find((s) => s.id === 'lead')?.note?.includes('leads with your second priority')) fallbackLead++;
      checkPlan(plan, where);
    }
    // "Watch for" in full: every base × band × bedrooms × report window × "open to" set that includes base housing.
    for (const base of BASES) for (const band of data.bands) for (const bedrooms of ['2', '3', '4plus', 'help']) for (const t of rules.TIMELINES) for (const open of OPEN.filter((o) => o.includes('base-housing') || o.includes('unsure'))) {
      const h = HOUSEHOLDS[i++ % HOUSEHOLDS.length];
      build(make({ ...h, base, band, bedrooms, open, timeline: t.id, priorities: ['admin'] }), `${base} ${band} ${bedrooms}bd ${open.join('+')} ${t.id} watch`);
    }
    // Every first × second pair (the tradeoff table), with a household that offers both.
    for (const first of ids) for (const second of ids) {
      if (first === second) continue;
      const h = HOUSEHOLDS.at(-1);
      build(make({ ...h, base: 'MIRAMAR', band: 'E5–E6', bedrooms: '3', open: ['unsure'], timeline: '30-60', priorities: [first, second] }), `pair ${first}>${second}`);
    }
    // Every household up to 3 children per age group, with and without the separate-rooms answer.
    const R = [0, 1, 2, 3];
    for (const a0 of R) for (const a3 of R) for (const a6 of R) for (const a10 of R) for (const a14 of R) for (const separate6 of [true, false]) {
      const a = make({ partner: true, kids: kids({ '0-2': a0, '3-5': a3, '6-9': a6, '10-13': a10, '14-18': a14 }), separate6, base: 'NBSD', band: a0 % 2 ? 'E5–E6' : 'O4–O6', bedrooms: 'help', open: ['renting', 'base-housing'], timeline: 'under30', priorities: ['where'] });
      const h = rules.bedroomHelper(a);
      if (![2, 3, 4].includes(h.row) || h.computed < 1) fail('intake-sources', `kids ${a0}/${a3}/${a6}/${a10}/${a14}`, `bedroom helper gave ${JSON.stringify(h)}`);
      build(a, `kids ${a0}/${a3}/${a6}/${a10}/${a14} separate=${separate6}`);
    }
    // Every pet count up to 4 cats and 4 dogs, at every base.
    for (const base of BASES) for (const cats of [0, 1, 2, 3, 4]) for (const dogs of [0, 1, 2, 3, 4]) {
      build(make({ partner: false, kids: kids({}), cats, dogs, base, band: 'E1–E4', bedrooms: '2', open: ['base-housing'], timeline: '60-90', priorities: [cats + dogs ? 'pets' : 'where'] }), `${base} cats=${cats} dogs=${dogs}`);
    }
    // Same answers, same plan.
    const sample = make({ ...HOUSEHOLDS[5], base: 'MIRAMAR', band: 'E5–E6', bedrooms: 'help', open: ['unsure'], timeline: 'under30', priorities: ['where', 'cost'] });
    if (JSON.stringify(rules.buildPlan(sample, data, config)) !== JSON.stringify(rules.buildPlan(structuredClone(sample), data, config))) fail('intake-sources', 'determinism', 'the same answers gave two different plans');

    passes.push(`intake: ${plans.toLocaleString('en-US')} plans, ${seenLines.size.toLocaleString('en-US')} distinct lines, ${seenSections.size} distinct section headings checked in ${((Date.now() - t0) / 1000).toFixed(1)} s; ${fallbackLead.toLocaleString('en-US')} lead with the second priority (the first has no lead yet), ${noLead.toLocaleString('en-US')} say they have no lead yet`);
    passes.push(`intake: rules ${rules.RULES_VERSION}; ${config.priorities.length} priorities, ${config.tradeoffs.length} tradeoff pairs written`);
  }
}

const checks = ['intake-network', 'intake-sources', 'intake-no-bah', 'intake-words', 'intake-config', 'intake-dates', 'intake-tiers'];
const byCheck = failures.reduce((acc, f) => ((acc[f.check] ??= []).push(f), acc), {});
console.log('\nStarting plan checks (dist)');
for (const c of checks) {
  const fs = byCheck[c] ?? [];
  if (!fs.length) console.log(`  PASS  ${c}`);
  else {
    console.log(`  FAIL  ${c} (${fs.length})`);
    for (const f of (process.env.ALL ? fs : fs.slice(0, 20))) console.log(`        ${f.where}: ${f.what}`);
    if (fs.length > 20) console.log(`        … and ${fs.length - 20} more`);
  }
}
for (const p of passes) console.log(`  ${p}`);
for (const g of rules.GAPS) console.log(`  GAP   ${g}`);
if (failures.length) {
  console.log(`\n${failures.length} starting plan check failure(s). Build failed.\n`);
  process.exit(1);
}
console.log('');
