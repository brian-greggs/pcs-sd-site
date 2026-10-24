#!/usr/bin/env node
// Starting plan (F5) checks, run after the build (postbuild) and after
// check_principles.mjs. Any failure exits 1 and fails `npm run build`.
//
//   intake-network   the intake pages (/plan/, home, base pages) make no network requests and put
//                    nothing in a URL: their scripts use no fetch, XMLHttpRequest, sendBeacon,
//                    WebSocket, EventSource, history or location writes, and there is no <form>.
//                    One exception (v1.0.0): home asks the assistant, so its scripts may hold exactly
//                    one call, a POST to this site's /api/ask; a second call or any other still fails.
//                    `--plant network` proves it (4 plants)
//   intake-sources   every line the plan can print names a source (a page on this site that exists
//                    in dist/, or an official link with its incentive label) and that source's dates
//   intake-bah       every dollar figure in plan text is a BAH line from src/data/bah.json: the grade's
//                    with- and without-dependents figures, its year and MHA on the line, and a source
//                    dated "BAH: BAH <year> · verified <date>"; no other dollar figure anywhere (headings,
//                    notes, sources, links). The embedded BAH table equals bah.json, and no other field
//                    could carry a dollar figure (Brian 2026-10-20; replaced intake-no-bah). With a base
//                    chosen, the housing allowance section has one line per grade in the band; with
//                    "Not sure yet", it has exactly the one no-figure line below, linking to the base list,
//                    and no BAH figure appears anywhere in the plan (QUESTIONS 63)
//   intake-words     plan text passes the same word lists as the pages (scripts/principle_lists.mjs):
//                    no demographic descriptors, no score/index labels, no placeholder text
//   intake-config    the Q8 priority list and the tradeoff table are well formed
//   intake-tiers     a section headed "under 30 minutes" or "within 45 minutes" shows only places whose
//                    whole drive range is under that (the first "N–M min" on each line; rules v0.4)
//   page-tiers       base pages group each neighborhood by the top of its drive range (every card's range fits
//                    its group, and each group holds exactly the neighborhoods the plan puts in that tier for
//                    that base), and every commute table's Tier column matches its row's range (QUESTIONS 59)
//   page-ratios      the rent-to-BAH ratio divides by the reader's duty station's MHA (QUESTIONS 62): recomputed
//                    here from rent.json ÷ bah.json for every zip, band, bedroom count and MHA, it must equal
//                    rent_to_bah.json, every neighborhood page's ratio tables (one set per MHA, shown for that
//                    MHA's bases) and the plan's embedded ratios; and a plan line's ratio is the one for the
//                    MHA of the base it cites
//   intake-sequence  the admin and move-logistics lead (rules v0.9) lists steps of the phase Q3 sets
//                    (src/lib/sequence.js, TIMELINE_PHASE), each line exactly the step, its deadline and its "Not yet
//                    confirmed" line as src/data/sequence_steps.json has them, citing that phase's page with the
//                    step's date line; and the steps embedded in /plan/ equal the export (no hand-typed deadline)
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
import { tierOf, TIER_LABEL } from '../src/lib/tiers.js';
import { TIMELINE_PHASE, phaseByKey, citeDates } from '../src/lib/sequence.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const failures = [];
const passes = [];
const fail = (check, where, what) => failures.push({ check, where, what });
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const YEAR = /\b(19|20)\d{2}\b/;
const DOLLAR = /\$\s?\d/;
// The exported BAH table (Brian 2026-10-20): the only place a plan's dollar figures may come from.
const BAH_ROWS = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'bah.json'), 'utf-8'));
const STEPS = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'sequence_steps.json'), 'utf-8'));
const bahRow = (year, mha, grade) => BAH_ROWS.find((r) => r.year === year && r.mha === mha && r.grade === grade);
const BAH_LINE = /^(\w+): \$([\d,]+) a month with dependents, \$([\d,]+) without \((\d{4}) BAH, (.+) area, MHA (CA\d{3})\)$/;
let bahLines = 0;

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
// Home is where the assistant is (it replaced /ask/ in v1.0.0): one POST to /api/ask on this site, with the question,
// the previous turn and, only if the reader ticks it, four starting-plan fields ("What's sent?" shows the object). Its
// scripts may hold that one call and nothing else on the list above.
const ALLOWED_CALL = { 'index.html': /\bfetch\s*\(\s*(["'`])\/api\/ask\1\s*,\s*\{\s*method\s*:\s*(["'`])POST\2/g };
function checkNetwork(plant = null) {
  for (const page of INTAKE_PAGES) {
    const file = join(DIST, page);
    if (!existsSync(file)) { fail('intake-network', page, 'page not built'); continue; }
    const raw = readFileSync(file, 'utf-8');
    const html = plant?.page === page ? plant.edit(raw) : raw;
    if (/<form\b/i.test(html)) fail('intake-network', page, '<form> on an intake page (a form can submit answers or put them in a URL)');
    const scripts = scriptsOf(html);
    const allowed = ALLOWED_CALL[page];
    if (allowed) {
      const calls = scripts.reduce((n, s) => n + (s.code.match(allowed) ?? []).length, 0);
      if (calls > 1) fail('intake-network', page, `${calls} calls to /api/ask (one is allowed)`);
      const at = scripts.find((s) => allowed.test(s.code));
      if (at) at.code = at.code.replace(new RegExp(allowed.source), ' ');
      allowed.lastIndex = 0;
    }
    for (const { where, code } of scripts) {
      for (const re of NETWORK) {
        const m = code.match(re);
        if (m) fail('intake-network', page, `${where}: "${m[0]}"`);
      }
    }
  }
}
// Each must fail intake-network: the allowance is one POST to /api/ask on home, nowhere else.
const inject = (js) => (h) => h.replace('</body>', `<script>${js}</script></body>`);
const NETWORK_PLANTS = {
  'second /api/ask call on home': { page: 'index.html', edit: inject('fetch("/api/ask",{method:"POST",body:"{}"})') },
  'another fetch on home': { page: 'index.html', edit: inject('fetch("/api/log",{method:"POST"})') },
  'sendBeacon on home': { page: 'index.html', edit: inject('navigator.sendBeacon("/api/ask")') },
  '/api/ask call on /plan/': { page: 'plan/index.html', edit: inject('fetch("/api/ask",{method:"POST"})') },
};
if (process.argv.includes('--plant')) {
  let caught = 0;
  for (const [name, plant] of Object.entries(NETWORK_PLANTS)) {
    failures.length = 0;
    checkNetwork(plant);
    const hit = failures.some((f) => f.check === 'intake-network' && f.where === plant.page);
    caught += hit;
    console.log(`  ${hit ? 'CAUGHT' : 'MISSED'}  ${name}`);
  }
  console.log(`\nintake-network plants: ${caught} of ${Object.keys(NETWORK_PLANTS).length} caught\n`);
  process.exit(caught === Object.keys(NETWORK_PLANTS).length ? 0 : 1);
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
  if (DOLLAR.test(text)) fail('intake-bah', where, `dollar figure outside a BAH line: "${text}"`);
}
// A line with a dollar figure must be a BAH line, its figures must be bah.json's for that year, MHA and grade,
// and one of its sources must carry the BAH date.
function checkBahLine(w, line) {
  const m = line.text.match(BAH_LINE);
  if (!m) { fail('intake-bah', w, `dollar figure that isn't a BAH line from the table: "${line.text}"`); return; }
  bahLines++;
  const [, grade, withD, withoutD, year, area, mha] = m;
  const r = bahRow(Number(year), mha, grade);
  if (!r) { fail('intake-bah', w, `no ${year} ${mha} ${grade} row in bah.json`); return; }
  if (Number(withD.replace(/,/g, '')) !== r.with_dependents || Number(withoutD.replace(/,/g, '')) !== r.without_dependents) fail('intake-bah', w, `figures differ from bah.json ($${r.with_dependents} / $${r.without_dependents})`);
  if (area !== r.area) fail('intake-bah', w, `area "${area}" is not bah.json's "${r.area}" for ${mha}`);
  if (!line.sources.some((s) => s.dates.includes(`BAH: BAH ${year} · verified ${r.verified_on}`))) fail('intake-bah', w, `no source dated "BAH: BAH ${year} · verified ${r.verified_on}"`);
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
  'BAH': /\$[\d,]+ a month with dependents|\bduty station\b/,
  'Rent ratio': /allowance/,
  'Mello-Roos': /Mello-Roos/,
  'Schools': /school|serves/i,
  'Child care': /child care|licensed centers|infant/i,
  'Waits': /\bwait|\bon the \w+ \d{4} list\b/i,
  'Wait times': /\bwait/i,
  'Pets': /\b(?:pets?|dogs?|cats?)\b/i,
  'Base housing': /\bbase housing\b/i,
  'Eligibility note': /haven.t confirmed whether Camp Pendleton families can apply/i,
  'Bedroom rule': /bedroom/i,
  'Sequence': /Deadline:/,
};
// Facts a line can show, and the labels that date them.
const FACT_DATE = [
  [/\b\d+(?:–\d+)? min\b/, ['Commute']],
  [/\d+(?:–\d+)?% of the [^;]*allowance/, ['Rent ratio']],
  [/\$\s?\d/, ['BAH']],
  [/\bmonths\b/, ['Waits', 'Wait times', 'Sequence']],
  [/\b(?:pets?|dogs?|cats?)\b/i, ['Pets', 'Sequence']],
  [/Deadline:/, ['Sequence']],
  [/Mello-Roos/, ['Mello-Roos']],
  [/licensed centers/, ['Child care']],
  [/haven.t confirmed whether Camp Pendleton families can apply/i, ['Eligibility note']],
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
// The housing allowance line when no base is chosen (Brian 2026-10-20, QUESTIONS 63), as the plan must print it.
const NO_BASE_BAH = { text: 'BAH depends on your duty station, not where you live. Pick a base to see your rates', link: '/' };
function checkBahSection(plan, where, a) {
  if (!a) return;
  const sec = plan.sections.find((x) => x.id === 'bah');
  const isNoBase = (l) => l.text === NO_BASE_BAH.text;
  if (a.base === 'unsure') {
    const [line, ...more] = sec?.lines ?? [];
    if (!line || more.length || !isNoBase(line)) fail('intake-bah', where, `no base chosen: the housing allowance section must be the one line "${NO_BASE_BAH.text}"`);
    else if (!(line.links ?? []).some((l) => l.url === NO_BASE_BAH.link)) fail('intake-bah', where, 'no base chosen: the "Pick a base" line has no link to the base list (/)');
    const fig = plan.sections.flatMap((x) => x.lines).find((l) => DOLLAR.test(l.text));
    if (fig) fail('intake-bah', where, `no base chosen, but a dollar figure appears: "${fig.text.slice(0, 70)}"`);
  } else {
    const want = BAH_ROWS.filter((r) => r.pay_band === a.band && r.mha === plan.base_mha).length;
    if (!sec || sec.lines.some(isNoBase) || !sec.lines.every((l) => BAH_LINE.test(l.text)) || (want && sec.lines.length !== want)) fail('intake-bah', where, `base chosen: the housing allowance section must list the ${a.band} grades (${want}), not the no-base line`);
  }
}
let sequenceLines = 0;
function checkSequenceLead(s, where, a) {
  const ph = phaseByKey(TIMELINE_PHASE[a.timeline]);
  if (s.heading !== `Your move sequence: ${ph.label}`) fail('intake-sequence', where, `${a.timeline} should open at "${ph.label}", not "${s.heading}"`);
  for (const line of s.lines) {
    sequenceLines++;
    const id = (line.links?.[0]?.url ?? '').split('#')[1];
    const row = STEPS.find((r) => r.id === id);
    const w = `${where} § ${s.id}: "${line.text.slice(0, 50)}"`;
    if (!row) { fail('intake-sequence', w, `links to no step in sequence_steps.json (${line.links?.[0]?.url})`); continue; }
    if (row.phase !== ph.key) fail('intake-sequence', w, `step ${id} is in ${row.phase}, not ${ph.key}`);
    if (line.text !== rules.sequenceLine(row)) fail('intake-sequence', w, `text differs from step ${id} as exported (deadline "${row.deadline}")`);
    const src = line.sources[0];
    if (src?.url !== `/sequence/${ph.slug}/` || src?.dates !== `Sequence: ${citeDates(row)}`) fail('intake-sequence', w, `source is not /sequence/${ph.slug}/ dated "Sequence: ${citeDates(row)}"`);
  }
}

function checkPlan(plan, where, a) {
  plans++;
  checkBahSection(plan, where, a);
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
    if (s.heading.startsWith('Your move sequence')) checkSequenceLead(s, where, a);
    for (const line of s.lines) {
      const key = JSON.stringify(line);
      if (seenLines.has(key)) continue;
      seenLines.add(key);
      const w = `${where} § ${s.id}: "${String(line.text).slice(0, 60)}"`;
      if (!line.text?.trim()) fail('intake-sources', w, 'empty line');
      wordsFail(w, line.text.replace(/\$/g, ''), false); // dollar figures: checkBahLine
      if (DOLLAR.test(line.text)) checkBahLine(w, line);
      if (!Array.isArray(line.sources) || !line.sources.length) fail('intake-sources', w, 'line without a source');
      else { line.sources.forEach((src) => checkSource(w, src)); checkDates(w, line, s.id); }
      for (const x of line.links ?? []) { // pages on this site, shown in the line
        if (!x.url?.startsWith('/') || !pageExists(x.url) || !x.text?.trim()) fail('intake-sources', w, `site link that isn't a built page or has no text: ${JSON.stringify(x)}`);
        else wordsFail(w, x.text, false);
      }
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

    // Embedded data: the BAH table is bah.json's, for each base's MHA; nothing else could carry a dollar figure.
    if (DOLLAR.test(m[1])) fail('intake-bah', 'plan data', 'a dollar sign in the embedded data');
    // dates.bah is the BAH date line ("BAH 2026 · verified …"), not a figure.
    const { bah: embeddedBah, dates: { bah: bahDate, ...dates }, ...rest } = data;
    if (!/^BAH \d{4} · verified \d{4}-\d{2}-\d{2}$/.test(bahDate ?? '')) fail('intake-bah', 'plan data', `dates.bah is not a BAH date line: "${bahDate}"`);
    for (const k of new Set(JSON.stringify({ ...rest, dates }).match(/"[a-z_]+":/gi) ?? [])) {
      if (/bah|allowance|dollar|rent_usd|price|dependents/i.test(k)) fail('intake-bah', 'plan data', `field ${k} outside data.bah could carry a dollar figure`);
    }
    const basesJson = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'bases.json'), 'utf-8'));
    for (const b of data.bases) {
      if (b.mha !== basesJson.find((x) => x.id === b.code)?.mha) fail('intake-bah', 'plan data', `${b.code}: MHA ${b.mha} isn't bases.json's`);
    }
    for (const [mha, t] of Object.entries(embeddedBah ?? {})) {
      for (const g of t.grades) {
        const r = bahRow(t.year, mha, g.grade);
        if (!r || r.with_dependents !== g.with || r.without_dependents !== g.without || r.pay_band !== g.band || r.area !== t.area || r.verified_on !== t.verified_on) fail('intake-bah', 'plan data', `${t.year} ${mha} ${g.grade} differs from bah.json`);
      }
      if (t.grades.length !== BAH_ROWS.filter((r) => r.mha === mha && r.year === t.year).length) fail('intake-bah', 'plan data', `${mha}: grades missing from the embedded table`);
    }
    if (!embeddedBah || !data.bases.every((b) => embeddedBah[b.mha])) fail('intake-bah', 'plan data', 'a base whose MHA has no BAH table');
    // The sequence steps embedded in /plan/ are the export's, for every phase Q3 can open on.
    const planPhases = new Set(Object.values(TIMELINE_PHASE));
    const wantSteps = STEPS.filter((r) => planPhases.has(r.phase));
    if ((data.sequence ?? []).length !== wantSteps.length) fail('intake-sequence', 'plan data', `${(data.sequence ?? []).length} steps embedded, export has ${wantSteps.length} for ${[...planPhases].join(', ')}`);
    for (const e of data.sequence ?? []) {
      const r = STEPS.find((x) => x.id === e.id);
      if (!r || r.step !== e.step || r.deadline !== e.deadline || r.phase !== e.phase || JSON.stringify(r.unconfirmed) !== JSON.stringify(e.unconfirmed) || citeDates(r) !== e.dates) fail('intake-sequence', 'plan data', `step ${e.id} differs from sequence_steps.json`);
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
    // The MHA of the chosen base, for checkBahSection's grade count (not part of the plan itself).
    const withMha = (plan, a) => ({ ...plan, base_mha: data.bases.find((b) => b.code === a.base)?.mha ?? null });
    const make = (o) => rules.cleanAnswers({ ...rules.emptyAnswers(), ...o }, data, config);
    const build = (a, where) => {
      try { checkPlan(withMha(rules.buildPlan(a, data, config), a), where, a); } catch (e) { fail('intake-sources', where, `rules threw: ${e.message}`); }
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
      checkPlan(withMha(plan, a), where, a);
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

    // page-tiers: base pages and commute tables against the same rule and the plan's data.
    const htmlOf = (rel) => readFileSync(join(DIST, rel), 'utf-8');
    const minsOf = (t) => { const m = t.match(/(\d+)(?:–(\d+))? min/); return m ? [Number(m[1]), Number(m[2] ?? m[1])] : null; };
    let cards = 0, tableRows = 0;
    for (const b of data.bases) {
      const rel = `base/${b.slug}/index.html`;
      if (!existsSync(join(DIST, rel))) { fail('page-tiers', rel, 'base page not built'); continue; }
      const html = htmlOf(rel);
      const onPage = new Map();
      for (const [, key, body] of html.matchAll(/<section[^>]*data-fact="tier-([^"]+)"[^>]*>([\s\S]*?)<\/section>/g)) {
        for (const m of body.matchAll(/href="\/communities\/([^/]+)\/[^"]*"[\s\S]*?<span class="row-min">([^<]+)<\/span>/g)) {
          cards++;
          onPage.set(m[1], key);
          const r = minsOf(m[2]);
          if (!r || tierOf(r[1]) !== key) fail('page-tiers', rel, `${m[1]} (${m[2]}) is under "${TIER_LABEL[key]}"`);
        }
      }
      for (const n of data.neighborhoods) {
        const d = n.drives[b.code];
        if (!d) continue;
        const want = tierOf(d.hi);
        if (onPage.get(n.slug) !== want) fail('page-tiers', rel, `${n.name} (${d.lo}–${d.hi} min) is in "${TIER_LABEL[onPage.get(n.slug)] ?? 'no group'}" on the page, "${TIER_LABEL[want]}" in the plan`);
      }
    }
    const pagesWithCommute = [...data.neighborhoods.map((n) => `communities/${n.slug}/index.html`), ...data.areas.map((a) => `base-housing/${a.id}/index.html`)];
    for (const rel of pagesWithCommute) {
      const sec = (htmlOf(rel).match(/<section[^>]*data-fact="commute"[^>]*>([\s\S]*?)<\/section>/) ?? [])[1] ?? '';
      for (const [, row] of sec.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
        const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1].replace(/<[^>]+>/g, ' ').trim());
        if (cells.length < 4) continue;
        tableRows++;
        const r = minsOf(cells[1]);
        if (!r || cells[3] !== TIER_LABEL[tierOf(r[1])]) fail('page-tiers', rel, `commute row "${cells[0].slice(0, 40)}": ${cells[1]} labeled "${cells[3]}"`);
      }
    }
    passes.push(`page-tiers: ${cards} base page cards in ${data.bases.length} base pages, ${tableRows} commute table rows`);

    // page-ratios. Python's round() (the export's) rounds halves to even; so does this.
    const roundEven = (x) => { const f = Math.floor(x); const d = x - f; return Math.abs(d - 0.5) < 1e-9 ? (f % 2 ? f + 1 : f) : Math.round(x); };
    const readData = (n) => JSON.parse(readFileSync(join(ROOT, 'src', 'data', `${n}.json`), 'utf-8'));
    const rentRows = Object.fromEntries(readData('rent').map((r) => [r.zip, r]));
    const ratioRows = readData('rent_to_bah');
    const BANDS = { 'E1–E4': ['E1', 'E2', 'E3', 'E4'], 'E5–E6': ['E5', 'E6'], 'E7–E9': ['E7', 'E8', 'E9'], 'W1–W5': ['W1', 'W2', 'W3', 'W4', 'W5'], 'O1–O3E': ['O1E', 'O2E', 'O3E'], 'O1–O3': ['O1', 'O2', 'O3'], 'O4–O6': ['O4', 'O5', 'O6'] };
    const mhas = [...new Set(basesJson.map((b) => b.mha))];
    const want = (zip, band, br, mha) => {
      const rent = rentRows[zip]?.[`fy27_${br}br`];
      if (rent == null) return null;
      const ps = BANDS[band].map((g) => roundEven((100 * rent) / bahRow(BAH_ROWS[0].year, mha, g).with_dependents)).sort((x, y) => x - y);
      return [ps[0], ps.at(-1)];
    };
    let ratioCells = 0;
    const exported = new Map(ratioRows.map((r) => [`${r.zip}|${r.pay_band}|${r.bedrooms}|${r.mha}`, r]));
    for (const zip of Object.keys(rentRows)) for (const band of Object.keys(BANDS)) for (const br of [2, 3, 4]) for (const mha of mhas) {
      const w = want(zip, band, br, mha);
      const r = exported.get(`${zip}|${band}|${br}|${mha}`);
      if (w && (!r || r.ratio_low_pct !== w[0] || r.ratio_high_pct !== w[1])) fail('page-ratios', 'src/data/rent_to_bah.json', `${zip} ${band} ${br}-bed ${mha}: ${r ? `${r.ratio_low_pct}–${r.ratio_high_pct}%` : 'missing'}, rent ÷ BAH gives ${w[0]}–${w[1]}%`);
    }
    if (ratioRows.some((r) => !mhas.includes(r.mha))) fail('page-ratios', 'src/data/rent_to_bah.json', 'a row for an MHA no base uses');
    const fmt = (w) => (w[0] === w[1] ? `${w[0]}%` : `${w[0]}–${w[1]}%`);
    const communities = Object.fromEntries(readData('communities').map((c) => [c.slug, c]));
    for (const n of data.neighborhoods) {
      const rel = `communities/${n.slug}/index.html`;
      const sec = (htmlOf(rel).match(/<section[^>]*data-fact="cost"[^>]*>([\s\S]*?)<\/section>/) ?? [])[1] ?? '';
      const zips = communities[n.slug].zips;
      const seen = new Set();
      // The full tables sit under "Show all pay bands" (2026-10-23), so the last one is followed by the band note.
      for (const [, bases, body] of sec.matchAll(/<div class="ratio-area" data-mha-bases="([^"]*)"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*(?=<div class="ratio-area"|<h3|<p class="note"|<\/details>)/g)) {
        for (const [, caption, rows] of body.matchAll(/<caption>([\s\S]*?)<\/caption>([\s\S]*?)<\/table>/g)) {
          const mha = (caption.match(/\(MHA (CA\d{3})\)/) ?? [])[1];
          const zip = (caption.match(/Zip (\d{5})/) ?? [])[1] ?? (zips.length === 1 ? zips[0] : null);
          if (!mha || !zip) { fail('page-ratios', rel, `ratio table without its MHA or zip: "${caption}"`); continue; }
          seen.add(mha);
          const slugs = data.bases.filter((b) => b.mha === mha).map((b) => b.slug).sort().join(' ');
          if (bases.split(' ').sort().join(' ') !== slugs) fail('page-ratios', rel, `${mha} ratio tables shown for "${bases}", not that MHA's bases`);
          for (const [, band, cells] of rows.matchAll(/<tr data-band-row="([^"]+)"[^>]*>([\s\S]*?)<\/tr>/g)) {
            const vals = [...cells.matchAll(/<td class="num">([^<]*)<\/td>/g)].map((m) => m[1]);
            [2, 3, 4].forEach((br, i) => {
              ratioCells++;
              const w = want(zip, band, br, mha);
              if ((w ? fmt(w) : '—') !== vals[i]) fail('page-ratios', rel, `${zip} ${band} ${br}-bed against ${mha}: page "${vals[i]}", rent ÷ BAH ${w ? fmt(w) : '—'}`);
            });
          }
        }
      }
      if (seen.size !== mhas.length) fail('page-ratios', rel, `ratio tables for ${[...seen].join(', ') || 'no MHA'}, need ${mhas.join(', ')}`);
      // The reader's own row (2026-10-23: one per zip, band and MHA, shown for the band and base picked) against the same rule.
      const mine = [...sec.matchAll(/<tr data-ratio-mine="(\d{5})\|([^|"]+)\|(CA\d{3})"[^>]*>([\s\S]*?)<\/tr>/g)];
      if (!mine.length && ratioRows.some((r) => zips.includes(r.zip))) fail('page-ratios', rel, 'no ratio row for the reader\'s pay band');
      for (const [, zip, band, mha, cells] of mine) {
        const vals = [...cells.matchAll(/<td class="num">([^<]*)<\/td>/g)].map((m) => m[1]);
        [2, 3, 4].forEach((br, i) => {
          ratioCells++;
          const w = want(zip, band, br, mha);
          if ((w ? fmt(w) : '—') !== vals[i]) fail('page-ratios', rel, `your-band row ${zip} ${band} ${br}-bed against ${mha}: page "${vals[i]}", rent ÷ BAH ${w ? fmt(w) : '—'}`);
        });
      }
      // The plan's ratios: the range across the zips, per MHA.
      for (const mha of mhas) for (const band of Object.keys(BANDS)) for (const br of [2, 3, 4]) {
        const ws = zips.map((z) => want(z, band, br, mha)).filter(Boolean);
        const got = n.ratios[mha]?.[band]?.[br];
        const exp = ws.length ? [Math.min(...ws.map((w) => w[0])), Math.max(...ws.map((w) => w[1]))] : undefined;
        if (JSON.stringify(got) !== JSON.stringify(exp)) fail('page-ratios', `plan data ${n.slug}`, `${band} ${br}-bed ${mha}: ${JSON.stringify(got)}, rent ÷ BAH ${JSON.stringify(exp)}`);
      }
    }
    // Plan lines: the ratio shown is the one for the MHA of the base the line's source names (?base=).
    let ratioLines = 0;
    for (const base of [...data.bases.map((b) => b.code), 'unsure']) for (const band of data.bands) for (const bedrooms of ['2', '3', '4plus']) {
      const a = make({ partner: false, kids: kids({}), cats: 0, dogs: 0, base, band, bedrooms, open: ['renting'], timeline: '60-90', priorities: ['where', 'cost'] });
      const br = rules.bedroomRow(a);
      for (const s of rules.buildPlan(a, data, config).sections) for (const line of s.lines) {
        const m = line.text.match(/^(.+?): .*?(\d+)(?:–(\d+))?% of the [^;]*allowance/);
        if (!m) continue;
        ratioLines++;
        const n = data.neighborhoods.find((x) => x.name === m[1]);
        const slug = (line.sources[0].url.match(/\?base=([\w-]+)/) ?? [])[1];
        const b = data.bases.find((x) => x.slug === slug);
        const exp = n && b ? n.ratios[b.mha]?.[band]?.[br] : null;
        if (!b) fail('page-ratios', `${base} ${band} ${s.id}`, `ratio line without ?base= on its source: "${line.text.slice(0, 70)}"`);
        else if (base !== 'unsure' && b.code !== base) fail('page-ratios', `${base} ${band} ${s.id}`, `ratio line cites ${b.short}, not the chosen base`);
        else if (!exp || exp[0] !== Number(m[2]) || exp[1] !== Number(m[3] ?? m[2])) fail('page-ratios', `${base} ${band} ${s.id}`, `"${line.text.slice(0, 80)}": expected ${JSON.stringify(exp)} for ${b.mha}`);
      }
    }
    passes.push(`page-ratios: ${ratioRows.length.toLocaleString('en-US')} exported ratios, ${ratioCells.toLocaleString('en-US')} page cells and ${ratioLines.toLocaleString('en-US')} plan lines against rent ÷ BAH for the duty station's MHA`);

    passes.push(`intake: ${plans.toLocaleString('en-US')} plans, ${seenLines.size.toLocaleString('en-US')} distinct lines, ${seenSections.size} distinct section headings checked in ${((Date.now() - t0) / 1000).toFixed(1)} s; ${fallbackLead.toLocaleString('en-US')} lead with the second priority (the first has no lead yet), ${noLead.toLocaleString('en-US')} say they have no lead yet`);
    passes.push(`intake-sequence: ${sequenceLines.toLocaleString('en-US')} sequence lines checked against sequence_steps.json`);
    passes.push(`intake-bah: ${bahLines.toLocaleString('en-US')} distinct BAH lines, each against bah.json`);
    passes.push(`intake: rules ${rules.RULES_VERSION}; ${config.priorities.length} priorities, ${config.tradeoffs.length} tradeoff pairs written`);
  }
}

const checks = ['intake-network', 'intake-sources', 'intake-bah', 'intake-words', 'intake-config', 'intake-dates', 'intake-sequence', 'intake-tiers', 'page-tiers', 'page-ratios'];
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
