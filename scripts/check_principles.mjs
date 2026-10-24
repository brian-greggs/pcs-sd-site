#!/usr/bin/env node
// Build-time principle checks. Any failure exits 1 and fails `npm run build`.
//
//   node scripts/check_principles.mjs source   (prebuild: data files, before Astro runs)
//   node scripts/check_principles.mjs dist     (postbuild: the rendered pages in dist/)
//
// Checks (PRD §3, §9; kickoff step 3):
//   dated        every section has one SourceChip whose dates cover every fact in it (Principle 2; Brian
//                2026-10-23): every fact names its source (data-src), the chip lists exactly the sources its
//                section uses (data-chip-src), and each source's own date (provenance.json, links.json, the
//                sequence export, …: sourceDates below) is in the chip's date lines; a line that states no fact
//                (data-nofact) has no digit. Tables and fact lists sit inside a section. A collapsed section's
//                chip sits inside it (shown when opened); the page-level "Sources and dates" table has none, and
//                each of its rows must give its source's own verified date (Brian 2026-10-24).
//                `node scripts/check_principles.mjs dist --plant all` plants each kind of fault and must catch it
//   bah-figures  every BAH dollar figure comes from src/data/bah.json and carries its year, MHA and a
//                source/date line; no other dollar figure sits next to "BAH" or equals a BAH figure
//                (Brian 2026-10-20; replaced no-bah, which allowed no BAH figure at all)
//   no-demo      no demographic descriptors of places outside /sources/ (Principle 5). The one exemption
//                (Brian 2026-10-22, F2-23): a verbatim official quote in a move-sequence quote block
//                (<blockquote data-official-quote>), and only if its text is a quote in the sequence export;
//                page prose, notes and step text are always checked
//   no-score     no column or label named score/index/rating (corollary)
//   incentive    every outbound link carries an incentive label (Principle 4, F4)
//   noindex      every page is noindex until week 5
//   placeholder  no placeholder text reaches a page (lead/gotchas render only when written)
//   third-party  no page or stylesheet loads anything from another origin (Principle 3)
//   contrast     every text/background pair in the theme is at least 4.5:1 (source stage)
//   bah-source   BAH figures are only in src/data/bah.json, each row with its year, MHA, source and
//                date, and (local builds) equal to the data repo's DTMO table (source stage)
//
// The pages are our own generated HTML, so the checks read it with regular
// expressions against markup the components control (data-fact, data-asof,
// data-incentive). If a component changes its markup, change the check with it.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const DATA = join(ROOT, 'src', 'data');
const stage = process.argv[2] ?? 'dist';

// --- Word lists: scripts/principle_lists.mjs (edit there) --------------------
import { DEMOGRAPHIC_TERMS, DEMOGRAPHIC_ALLOWED, SCORE_WORDS, SCORE_ALLOWED, PLACEHOLDER_PATTERNS } from './principle_lists.mjs';
import { FIXED_DATES } from '../src/lib/fixedNotes.js';

// Text on background pairs the pages use, as theme.css custom properties.
// Every one must reach WCAG AA for body text (4.5:1).
const CONTRAST_MIN = 4.5;
const CONTRAST_PAIRS = [
  ['text', 'bg'], ['text', 'surface'], ['muted', 'bg'], ['muted', 'surface'],
  ['link', 'bg'], ['link', 'surface'], ['on-coral', 'coral'],
  ['blue-fg', 'blue-bg'], ['mauve-fg', 'mauve-bg'], ['gold-fg', 'gold-bg'],
  ['text', 'blue-bg'], ['text', 'mauve-bg'], ['text', 'gold-bg'], // tile sub-lines, gap boxes
  ['muted', 'blue-bg'], ['muted', 'gold-bg'], ['link', 'gold-bg'], // "+1" on a tile; labels and links in a gap box
  ['ink', 'paper'], ['ink-muted', 'paper'], // the printed starting plan
  // Map labels (src/lib/map.js LABEL_CLASSES): each label class's fill on the halo it's drawn with; water labels sit
  // on the ocean, shield text on its shield. scripts/check_maps.mjs fails a label with any other class.
  ['map-label', 'map-halo'], ['map-label-muted', 'map-halo'], ['map-label-base', 'map-halo'], ['map-label-focus', 'map-halo'],
  ['map-label-water', 'map-ocean'], ['map-shield-text', 'map-shield'],
  // The base page's drive-group chips: dark text on each of the map's amber steps (Brian 2026-10-23).
  ['on-tier', 'map-tier-under30'], ['on-tier', 'map-tier-30-45'], ['on-tier', 'map-tier-45-60'], ['on-tier', 'map-tier-60plus'],
];

// --- Helpers ----------------------------------------------------------------
const failures = [];
const passes = [];
const skipped = [];
const fail = (check, where, what) => failures.push({ check, where, what });

function walk(dir, ext) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p, ext) : p.endsWith(ext) ? [p] : [];
  });
}
const visibleText = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&#39;|&rsquo;|&#x27;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
const context = (text, i, n = 60) => `…${text.slice(Math.max(0, i - n), i + n).trim()}…`;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// BAH figures: src/data/bah.json, the exported DTMO table (one row per year, MHA and grade). It's in this
// repo, so the checks run on the host too. Keyed "year|MHA|grade", the key pages put in data-bah.
const BAH_FILE = join(DATA, 'bah.json');
const BAH_NAME = relative(ROOT, BAH_FILE);
function loadBah() {
  if (!existsSync(BAH_FILE)) return null;
  return new Map(JSON.parse(readFileSync(BAH_FILE, 'utf-8')).map((r) => [`${r.year}|${r.mha}|${r.grade}`, r]));
}
// The data repo's DTMO table, when it sits next to this one (local builds): bah.json must match it.
function loadBahCsv() {
  const path = process.env.BAH_CSV ?? join(ROOT, '..', 'pcs-sd-data', 'EAP Data', 'csv', 'dod_bah_2026_sd_mhas.csv');
  if (!existsSync(path)) return null;
  const [header, ...rows] = readFileSync(path, 'utf-8').trim().split(/\r?\n/).map((l) => l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/));
  return Object.fromEntries(rows.map((r) => [`${r[0]}|${r[2]}`, Object.fromEntries(header.map((h, i) => [h, r[i]]))]));
}
// Elements that carry an attribute, each with its inner HTML (balanced on its own tag name).
function elementsWith(html, attr) {
  const out = [];
  for (const m of html.matchAll(new RegExp(`<(\\w+)\\b[^>]*\\s${attr}(?=[\\s=/>])(?:="([^"]*)")?[^>]*>`, 'g'))) {
    const tag = m[1];
    const re = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, 'gi');
    re.lastIndex = m.index + m[0].length;
    let depth = 1, end = html.length, x;
    while ((x = re.exec(html))) {
      if (x[0][1] !== '/') depth++;
      else if (--depth === 0) { end = x.index; break; }
    }
    out.push({ value: m[2] ?? '', start: m.index, end: end + tag.length + 3, inner: html.slice(m.index + m[0].length, end) });
  }
  return out;
}
// --- Source keys and their own dates (the `dated` check) -------------------------------------------------------
// Each key a SourceChip can list, and the dates its date lines must name: the source's verified or retrieval date,
// read from the data files (not from the page). A key with no entry here fails.
const readJson = (f) => (existsSync(join(DATA, f)) ? JSON.parse(readFileSync(join(DATA, f), 'utf-8')) : []);
function sourceDates() {
  const m = new Map();
  for (const r of readJson('provenance.json')) m.set(`prov:${r.id}`, [r.verified_on]);
  for (const r of readJson('links.json')) m.set(`link:${r.id}`, [r.verified_on]);
  for (const r of readJson('housing_rules.json')) m.set(`rule:${r.id}`, [r.verified_on]);
  for (const r of readJson('base_housing_areas.json')) m.set(`areas:${r.id}`, [r.verified_on]);
  for (const r of readJson('hazards.json')) if (r.fhsz_retrieved_on) m.set(`fhsz:${r.zip}`, [r.fhsz_retrieved_on]);
  for (const [k, d] of Object.entries(FIXED_DATES)) m.set(`fixed:${k}`, [d]);
  const days = (cites) => [...new Set(cites.filter(Boolean).map((c) => c.retrieved_on))].sort();
  const cites = (r) => [...(r.sources ?? []), ...(r.alternatives ?? []).flatMap((a) => a.sources), ...(r.superseded ?? [])];
  for (const f of ['sequence_steps.json', 'sequence_forms.json', 'sequence_effective_date.json']) for (const r of readJson(f)) m.set(`seq:${r.id}`, days(cites(r)));
  const w = readJson('sequence_weights.json').sort((a, b) => a.id.localeCompare(b.id))[0];
  if (w) m.set('seq:weight-allowances', days([w.source, ...cites(w)]));
  const log = readJson('sources.json').map((r) => r.retrieved).filter((d) => /^\d{4}-/.test(d)).sort();
  if (log.length) m.set('log:sources', [log.at(-1)]);
  for (const dir of ['communities', 'base-housing-areas']) {
    for (const f of walk(join(ROOT, 'src', 'content', dir), '.md')) {
      const d = readFileSync(f, 'utf-8').match(/^verified_on:\s*['"]?(\d{4}-\d{2}-\d{2})/m);
      if (d) m.set(`notes:${dir}/${f.split('/').pop().replace(/\.md$/, '')}`, [d[1]]);
    }
  }
  return m;
}
// A changelog entry is dated by its own day (changelog:<date>).
const keyDates = (reg, k) => reg.get(k) ?? (/^changelog:\d{4}-\d{2}-\d{2}$/.test(k) ? [k.slice(10)] : null);
// The HTML with every element matched by `open` removed (balanced on the element's own tag).
function dropElements(html, open) {
  let out = html, m;
  while ((m = out.match(open))) {
    const re = new RegExp(`<${m[1]}\\b[^>]*>|</${m[1]}>`, 'gi');
    re.lastIndex = m.index + m[0].length;
    let depth = 1, end = m.index + m[0].length, x;
    while ((x = re.exec(out))) { if (x[0][1] !== '/') depth++; else if (--depth === 0) { end = x.index + x[0].length; break; } }
    out = out.slice(0, m.index) + ' ' + out.slice(end);
  }
  return out;
}
const attrRe = (name) => new RegExp(`<(\\w+)\\b[^>]*\\s${name}(?:="[^"]*")?(?=[\\s/>])[^>]*>`);
// One section's `dated` faults: one chip, its keys both ways, every key's dates in its date lines, every fact tagged.
// The page-level "Sources and dates" table (Brian 2026-10-24) has no SourceChip: each row is a receipt. Every row
// names its source key, and its Verified cell is that source's own date; the summary's "last checked" is the latest.
function sourcesTableFaults(body, reg) {
  const out = [];
  if (elementsWith(body, 'data-source-chip').length) out.push('the Sources and dates table carries a SourceChip (its rows are the receipts)');
  const rows = [...body.matchAll(/<tr\b[^>]*\sdata-src="([^"]*)"[^>]*>([\s\S]*?)<\/tr>/g)];
  if (!rows.length) return [...out, 'no source rows'];
  const days = [];
  for (const [, key, row] of rows) {
    const want = keyDates(reg, key);
    const cell = row.match(/<td[^>]*\sdata-verified[^>]*>([\s\S]*?)<\/td>/);
    const got = cell ? visibleText(cell[1]).trim() : '';
    days.push(got);
    if (!want) out.push(`unknown source key "${key}"`);
    else if (!want.includes(got)) out.push(`row "${key}" says verified "${got}", its source says ${want.join(' / ')}`);
  }
  const latest = days.sort().at(-1);
  const summary = (body.match(/<span class="summary-line"[^>]*>([\s\S]*?)<\/span>/) ?? [, ''])[1];
  if (!visibleText(summary).includes(`last checked ${latest}`)) out.push(`summary doesn't say "last checked ${latest}"`);
  // Every other line is a heading, the header row, the summary or a no-fact link.
  let rest = dropElements(body, attrRe('data-src'));
  rest = dropElements(rest, attrRe('data-nofact'));
  rest = dropElements(rest, /<(h[1-6]|thead)\b[^>]*>/);
  const loose = visibleText(rest).replace(/[\s·.,;:()–—-]+/g, ' ').trim();
  if (loose) out.push(`text that names no source: "${loose.slice(0, 100)}"`);
  return out;
}
function datedFaults(body, reg) {
  const out = [];
  const chips = elementsWith(body, 'data-source-chip');
  if (chips.length !== 1) return [`${chips.length} SourceChips (want 1)`];
  const chip = chips[0];
  // A collapsed section keeps its chip inside, as the body's last part, so it shows when the section is opened
  // (Brian 2026-10-24); a section that is always open (a sequence step, the timeline, At a glance) has it at the end.
  const lid = body.match(/^\s*<details(?![^>]*\bsrc-chip\b)[^>]*>/);
  if (lid) {
    const d = elementsWith(body.replace(/^(\s*<details)/, '$1 data-lid'), 'data-lid')[0];
    if (!d || chip.start < d.start || chip.end > d.end) out.push('collapsed section with its SourceChip outside (it belongs inside, shown when opened)');
  }
  const listed = (body.slice(chip.start, chip.end).match(/data-chip-src="([^"]*)"/) ?? [, ''])[1].split(' ').filter(Boolean);
  const asof = chip.inner.match(/<p[^>]*\sdata-asof(?=[\s>])[^>]*>([\s\S]*?)<\/p>/);
  if (!asof) return ['no date line in its SourceChip'];
  if (!/\b(19|20)\d{2}\b/.test(visibleText(asof[1]))) out.push(`date line has no year: "${visibleText(asof[1]).trim()}"`);
  const dateText = [asof[1], ...[...chip.inner.matchAll(/<p[^>]*\sdata-asof-more[^>]*>([\s\S]*?)<\/p>/g)].map((m) => m[1])].map(visibleText).join(' ');
  const used = new Set([...body.matchAll(/\sdata-src="([^"]*)"/g)].flatMap((m) => m[1].split(' ').filter(Boolean)));
  for (const k of used) if (!listed.includes(k)) out.push(`a fact names "${k}", which its SourceChip doesn't list`);
  // Dates by the word that introduces them ("verified 2026-09-18", "Links checked 2026-09-18 and 2026-09-30"), so a
  // key's date has to be stated as that kind of date, not just appear somewhere in the line.
  const said = {};
  for (const m of dateText.matchAll(/\b(verified|checked|downloaded|retrieved)\s+((?:\d{4}-\d{2}(?:-\d{2})?(?:,\s*|\s+and\s+)?)+)/gi)) {
    for (const d of m[2].match(/\d{4}-\d{2}(?:-\d{2})?/g)) (said[m[1].toLowerCase()] ??= new Set()).add(d);
  }
  const WORD = { prov: 'verified', link: 'checked', fhsz: 'downloaded', seq: 'retrieved', rule: 'retrieved', areas: 'verified' };
  for (const k of listed) {
    if (!used.has(k)) out.push(`SourceChip lists "${k}", which no fact in the section names`);
    const want = keyDates(reg, k);
    const word = WORD[k.split(':')[0]];
    if (!want) out.push(`unknown source key "${k}"`);
    else for (const d of want) {
      if (word ? !said[word]?.has(d) : !dateText.includes(d)) out.push(`"${k}" is dated ${d}, which its SourceChip doesn't state${word ? ` as "${word} ${d}"` : ''}: "${dateText.trim().slice(0, 120)}"`);
    }
  }
  // Every fact is inside an element that names its source. Left out: the chip, headings (section titles),
  // form controls, toggle labels (data-ui) and lines that state no fact (data-nofact); those two carry no digit.
  let rest = body.slice(0, chip.start) + ' ' + body.slice(chip.end);
  for (const n of [...elementsWith(rest, 'data-nofact'), ...elementsWith(rest, 'data-ui')]) {
    const t = visibleText(dropElements(n.inner, /<(select)\b[^>]*>/));
    if (/\d/.test(t)) out.push(`a line marked as stating no fact has a figure: "${t.trim().slice(0, 80)}"`);
  }
  rest = dropElements(rest, attrRe('data-src'));
  rest = dropElements(rest, attrRe('data-nofact'));
  rest = dropElements(rest, attrRe('data-ui'));
  rest = dropElements(rest, /<(h[1-6]|select)\b[^>]*>/);
  const loose = visibleText(rest).replace(/[\s·.,;:()–—-]+/g, ' ').trim();
  if (loose) out.push(`text that names no source: "${loose.slice(0, 100)}"`);
  return out;
}

const dollarsIn = (s) => [...s.matchAll(/\$\s?(\d[\d,]*)/g)].map((m) => Number(m[1].replace(/,/g, '')));
// Reviewed coincidences: a dollar figure outside the BAH markup that equals a BAH value but is something
// else (e.g. a HUD rent). Each entry: { "page": "communities/x/index.html", "value": 4410, "why": "..." }
function loadBahAllow() {
  const p = join(ROOT, 'scripts', 'bah_check_allow.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf-8')) : [];
}

// --- Contrast -------------------------------------------------------------------
const luminance = (hex) => {
  const c = hex.replace('#', '').match(/../g).map((h) => parseInt(h, 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
function checkContrast() {
  const styles = join(ROOT, 'src', 'styles');
  const theme = readFileSync(join(styles, 'theme.css'), 'utf-8');
  const vars = Object.fromEntries([...theme.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map((m) => [m[1], m[2]]));
  let worst = Infinity;
  for (const [fg, bg] of CONTRAST_PAIRS) {
    if (!vars[fg] || !vars[bg]) { fail('contrast', 'src/styles/theme.css', `--${fg} or --${bg} is not a 6-digit hex color`); continue; }
    const r = ratio(vars[fg], vars[bg]);
    worst = Math.min(worst, r);
    if (r < CONTRAST_MIN) fail('contrast', 'src/styles/theme.css', `--${fg} on --${bg} is ${r.toFixed(2)}:1 (needs ${CONTRAST_MIN}:1)`);
  }
  // Every other stylesheet takes its colors from the theme, so the pairs above are the whole palette.
  for (const f of walk(styles, '.css').filter((f) => !f.endsWith('theme.css'))) {
    const css = readFileSync(f, 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');
    const m = css.match(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i);
    if (m) fail('contrast', relative(ROOT, f), `raw color "${m[0]}" (use a theme.css custom property)`);
  }
  if (!failures.some((f) => f.check === 'contrast')) passes.push(`contrast: ${CONTRAST_PAIRS.length} theme pairs, lowest ${worst.toFixed(2)}:1`);
}

// --- Source stage -----------------------------------------------------------
function checkSource() {
  checkContrast();
  const files = walk(DATA, '.json');
  if (files.length === 0) fail('data', 'src/data', 'no exported data files; run pull/export_for_site.py in pcs-sd-data');
  for (const f of files) {
    const rows = JSON.parse(readFileSync(f, 'utf-8'));
    const name = relative(ROOT, f);
    const cols = new Set(rows.flatMap((r) => Object.keys(r)));
    for (const c of cols) {
      const label = SCORE_ALLOWED.reduce((t, re) => t.replace(re, ' '), c.replace(/_/g, ' '));
      if (SCORE_WORDS.test(label)) fail('no-score', name, `column "${c}"`);
      // BAH dollar figures live in bah.json only (its with_/without_dependents columns).
      if (name !== BAH_NAME && (/^(bah|bah_|.*_bah$|.*_bah_)/i.test(c) || /^[EOW]\d+E?$/.test(c) || /_dependents$/.test(c))) fail('bah-source', name, `column "${c}" looks like a BAH figure (BAH figures go in bah.json only)`);
      if (/^google_/.test(c)) fail('license', name, `column "${c}" (Google raw values stay in the data repo)`);
    }
    if (name === BAH_NAME) checkBahRows(rows);
    const missingDate = rows.filter((r) => !r.vintage || (!r.verified_on && !name.endsWith('sources.json')));
    if (missingDate.length) fail('dated', name, `${missingDate.length} rows without vintage/verified_on (first id: ${missingDate[0].id})`);
  }
  if (!files.includes(BAH_FILE)) fail('bah-source', 'src/data/bah.json', 'missing: run pull/export_for_site.py in pcs-sd-data');
  if (!failures.some((f) => f.check !== 'contrast')) passes.push(`source: ${files.length} data files, column names and dates OK`);
}
// bah.json: every row has its year, MHA, grade, both figures, source and date; local builds also compare
// each figure with the data repo's DTMO table, so a hand edit to bah.json fails.
function checkBahRows(rows) {
  const csv = loadBahCsv();
  for (const r of rows) {
    const where = `src/data/bah.json ${r.id}`;
    for (const k of ['year', 'mha', 'area', 'grade', 'with_dependents', 'without_dependents', 'source_name', 'source_url', 'verified_on']) {
      if (r[k] == null || r[k] === '') fail('bah-source', where, `no ${k}`);
    }
    if (r.id !== `${r.year}-${r.mha}-${r.grade}`) fail('bah-source', where, 'id is not year-MHA-grade');
    if (csv) {
      const w = csv[`${r.mha}|with`], wo = csv[`${r.mha}|without`];
      if (!w || Number(w[r.grade]) !== r.with_dependents || Number(wo[r.grade]) !== r.without_dependents) fail('bah-source', where, `${r.with_dependents}/${r.without_dependents} differs from the DTMO table in pcs-sd-data`);
    }
  }
  if (!csv) skipped.push('bah-source comparison with the data repo (DTMO table not next to this repo; bah.json checked on its own)');
  else passes.push(`bah-source: ${rows.length} BAH rows match the DTMO table`);
}

// --- Dist stage -------------------------------------------------------------
function checkDist(plant = null) {
  const pages = walk(DIST, '.html');
  if (pages.length === 0) {
    fail('dist', 'dist/', 'no pages built');
    return;
  }
  // Every verbatim quote the move sequence exports (steps, side-by-side rules, superseded, forms, the weight table).
  const officialQuotes = new Set();
  for (const f of ['sequence_steps', 'sequence_forms', 'sequence_weights', 'sequence_dla', 'sequence_effective_date']) {
    const p = join(DATA, `${f}.json`);
    if (!existsSync(p)) continue;
    const add = (c) => c && c.quote && officialQuotes.add(c.quote.replace(/\s+/g, ' ').trim());
    for (const r of JSON.parse(readFileSync(p, 'utf-8'))) {
      for (const c of [...(r.sources ?? []), ...(r.superseded ?? []), ...(r.alternatives ?? []).flatMap((a) => a.sources), r.source]) add(c);
    }
  }
  const bah = loadBah();
  const bahValues = new Set([...(bah?.values() ?? [])].flatMap((r) => [r.with_dependents, r.without_dependents]));
  const allow = loadBahAllow();
  let factBlocks = 0, extLinks = 0, bahFigures = 0, chipKeys = 0;
  const reg = sourceDates();
  if (!bah) fail('bah-figures', 'src/data/bah.json', 'missing: run pull/export_for_site.py in pcs-sd-data');

  // third-party: stylesheets (fonts, background images) only from this site.
  for (const file of walk(DIST, '.css')) {
    const css = readFileSync(file, 'utf-8');
    for (const m of css.matchAll(/(?:url\(\s*['"]?|@import\s+['"])((?:https?:)?\/\/[^'")\s]+)/gi)) fail('third-party', relative(DIST, file), m[1]);
  }

  for (const file of pages) {
    const page = relative(DIST, file);
    const raw = readFileSync(file, 'utf-8');
    const html = plant && plant.page === page ? plant.edit(raw) : raw;
    if (plant && plant.page === page && html === raw) fail('plant', page, 'the plant changed nothing');
    const text = visibleText(html);

    // third-party: anything the browser fetches on its own (not <a> links, which the reader chooses).
    for (const m of html.matchAll(/<(?!a\b)(\w+)\b[^>]*\s(?:src|href|srcset|poster|data)="((?:https?:)?\/\/[^"]+)"/gi)) {
      fail('third-party', page, `<${m[1]}> loads ${m[2]}`);
    }
    for (const m of html.matchAll(/url\(\s*['"]?((?:https?:)?\/\/[^'")\s]+)/gi)) fail('third-party', page, `inline style loads ${m[1]}`);

    // placeholder
    for (const re of PLACEHOLDER_PATTERNS) {
      const m = html.match(re);
      if (m) fail('placeholder', page, `"${m[0]}": ${context(html, m.index)}`);
    }

    // noindex
    if (!/<meta name="robots" content="noindex/.test(html)) fail('noindex', page, 'missing <meta name="robots" content="noindex">');

    // dated: every section has one SourceChip whose dates cover every fact in it.
    const blocks = [...html.matchAll(/<section[^>]*data-fact="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g)];
    for (const [, id, body] of blocks) {
      factBlocks++;
      for (const f of (id === 'sources' && page !== 'sources/index.html' ? sourcesTableFaults : datedFaults)(body, reg)) { fail('dated', page, `section "${id}": ${f}`); }
      chipKeys += (body.match(/data-chip-src="([^"]*)"/) ?? [, ''])[1].split(' ').filter(Boolean).length;
    }
    // Tables and fact lists must sit inside a dated block.
    const outside = html.replace(/<section[^>]*data-fact="[^"]+"[^>]*>[\s\S]*?<\/section>/g, '');
    for (const tag of ['table', 'dl']) {
      if (new RegExp(`<${tag}[\\s>]`).test(outside)) fail('dated', page, `a <${tag}> sits outside any dated fact block`);
    }

    // bah-figures. A BAH figure is printed only inside a [data-bah-block="YEAR|MHA"] whose [data-bah-label]
    // names the year, the area and the MHA, one [data-bah="YEAR|MHA|GRADE"] element per grade holding that
    // row's with- and without-dependents figures in that order, and the block sits in a fact block whose
    // date line names the BAH source with the year and the verified date.
    if (bah) {
      const sections = [...html.matchAll(/<section[^>]*data-fact="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g)].map((m) => ({ id: m[1], start: m.index, end: m.index + m[0].length, body: m[2] }));
      const blocks = elementsWith(html, 'data-bah-block');
      for (const b of blocks) {
        const [year, mha] = b.value.split('|');
        const rows = [...bah.values()].filter((r) => String(r.year) === year && r.mha === mha);
        const where = `block ${b.value}`;
        if (!rows.length) { fail('bah-figures', page, `${where}: no ${year} rows for ${mha} in bah.json`); continue; }
        const label = elementsWith(b.inner, 'data-bah-label')[0];
        const labelText = label ? visibleText(label.inner) : '';
        if (!label || !labelText.includes(`${year} BAH`) || !labelText.includes(mha) || !labelText.includes(rows[0].area)) fail('bah-figures', page, `${where}: label "${labelText.trim()}" doesn't name the year, the area and the MHA`);
        const sec = sections.find((x) => x.start < b.start && b.end <= x.end);
        const asof = sec && sec.body.match(/<p[^>]*data-asof[^>]*>([\s\S]*?)<\/p>/);
        const dateLine = asof ? visibleText(asof[1]) : '';
        if (!sec) fail('bah-figures', page, `${where}: not inside a dated fact block`);
        else if (!dateLine.includes(`BAH ${year} · verified ${rows[0].verified_on}`) || !dateLine.includes(rows[0].source_name)) fail('bah-figures', page, `${where}: date line of "${sec.id}" doesn't give "BAH ${year} · verified ${rows[0].verified_on}" and "${rows[0].source_name}": "${dateLine.trim()}"`);
        const lines = elementsWith(b.inner, 'data-bah');
        if (!lines.length) fail('bah-figures', page, `${where}: no BAH lines`);
        for (const l of lines) {
          const r = bah.get(l.value);
          const got = dollarsIn(visibleText(l.inner));
          bahFigures += got.length;
          if (!r) fail('bah-figures', page, `${where}: "${l.value}" is not a row of bah.json`);
          else if (!l.value.startsWith(`${year}|${mha}|`)) fail('bah-figures', page, `${where}: line "${l.value}" is for another year or MHA`);
          else if (got.join() !== `${r.with_dependents},${r.without_dependents}`) fail('bah-figures', page, `${where} ${r.grade}: shows ${got.map((n) => `$${n}`).join(', ') || 'no figure'}, bah.json has $${r.with_dependents} with and $${r.without_dependents} without dependents`);
        }
        const outside = b.inner.replace(/<(\w+)\b[^>]*\sdata-bah="[^"]*"[^>]*>[\s\S]*?<\/\1>/g, ' ');
        if (dollarsIn(visibleText(outside)).length) fail('bah-figures', page, `${where}: a dollar figure outside its data-bah lines`);
      }
      // Outside the blocks: no data-bah line, no dollar figure next to BAH, none equal to a BAH figure
      // (a hand-typed BAH figure), except reviewed coincidences in scripts/bah_check_allow.json.
      let rest = html;
      for (const b of [...blocks].sort((x, y) => y.start - x.start)) rest = rest.slice(0, b.start) + ' ' + rest.slice(b.end);
      if (elementsWith(rest, 'data-bah').length) fail('bah-figures', page, 'a data-bah line outside any data-bah-block');
      const restText = visibleText(rest);
      for (const m of restText.matchAll(/[^.;:]*\b(BAH|housing allowance|basic allowance)\b[^.;:]*/gi)) {
        const dollar = m[0].match(/\$\s?\d[\d,]*/);
        if (dollar) fail('bah-figures', page, `dollar figure next to "${m[1]}" outside the BAH markup (hand-typed?): ${context(m[0], m[0].indexOf(dollar[0]))}`);
      }
      // BAH figures are whole dollars, so an amount with cents (a DLA rate, checked by seq-dla) isn't one.
      for (const m of restText.matchAll(/\$\s?(\d{1,2},?\d{3})\b(?!\.\d)/g)) {
        const n = Number(m[1].replace(/,/g, ''));
        if (bahValues.has(n) && !allow.some((a) => a.page === page && a.value === n)) {
          fail('bah-figures', page, `$${m[1]} equals a BAH figure but isn't in the BAH markup: ${context(restText, m.index)} (if it's a coincidence, add it to scripts/bah_check_allow.json with a reason)`);
        }
      }
    }

    // no-demo (skip /sources/). Official quote blocks are left out only when their text is an exported quote;
    // a data-official-quote blockquote holding anything else is itself a failure.
    if (!page.startsWith('sources/')) {
      let prose = html;
      for (const m of html.matchAll(/<blockquote\b[^>]*\bdata-official-quote\b[^>]*>([\s\S]*?)<\/blockquote>/g)) {
        const q = visibleText(m[1]).replace(/&quot;|&#34;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .trim().replace(/^“|”$/g, '').trim();
        if (officialQuotes.has(q)) prose = prose.replace(m[0], ' ');
        else fail('no-demo', page, `a quote block that isn't an exported official quote: ${q.slice(0, 80)}`);
      }
      let t = visibleText(prose);
      for (const re of DEMOGRAPHIC_ALLOWED) t = t.replace(re, ' ');
      for (const term of DEMOGRAPHIC_TERMS) {
        const re = new RegExp(`\\b${escapeRe(term)}\\b`, 'gi');
        for (const m of t.matchAll(re)) fail('no-demo', page, `"${m[0]}": ${context(t, m.index)}`);
      }
    }

    // no-score: labels (th, dt, caption, label, headings).
    for (const m of html.matchAll(/<(th|dt|caption|label|h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/g)) {
      let label = visibleText(m[2]).trim();
      for (const re of SCORE_ALLOWED) label = label.replace(re, ' ');
      if (SCORE_WORDS.test(label)) fail('no-score', page, `<${m[1]}> "${visibleText(m[2]).trim()}"`);
    }

    // incentive: every outbound link has data-incentive and the visible label right after it.
    for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
      const attrs = m[1];
      const href = (attrs.match(/href="([^"]*)"/) ?? [])[1] ?? '';
      if (!/^(https?:)?\/\//i.test(href)) continue;
      extLinks++;
      const label = (attrs.match(/data-incentive="([^"]*)"/) ?? [])[1];
      if (!label || !label.trim()) {
        fail('incentive', page, `link without incentive label: ${href}`);
        continue;
      }
      const after = html.slice(m.index + m[0].length, m.index + m[0].length + 400);
      if (!/^\s*<small class="incentive"[^>]*>/.test(after)) fail('incentive', page, `label not shown next to link: ${href}`);
    }
  }

  passes.push(`dist: ${pages.length} pages, ${factBlocks} sections (${chipKeys.toLocaleString('en-US')} source keys in their SourceChips, each dated from its data file), ${extLinks} outbound links, ${bahFigures.toLocaleString('en-US')} BAH figures checked against bah.json`);
}

// --- Plants for `dated` (--plant <kind> | all): one fault each, in memory; each must fail the check ------------
const NBHD = 'communities/santee/index.html';
const PLANTS = {
  'fact with no source': { page: NBHD, edit: (h) => h.replace('<h3>Buying</h3>', '<h3>Buying</h3><p>Median rent $2,100 a month.</p>') },
  'source the chip doesn\'t list': { page: NBHD, edit: (h) => h.replace(/(<section[^>]*data-fact="climate"[\s\S]*?<div class="table-wrap" data-src=")prov:climate/, '$1prov:climate prov:ownership') },
  'chip lists an unused source': { page: NBHD, edit: (h) => h.replace(/(<section[^>]*data-fact="climate"[\s\S]*?data-chip-src=")prov:climate/, '$1prov:climate prov:schools') },
  'chip date isn\'t the source\'s': { page: NBHD, edit: (h) => h.replace(/(<section[^>]*data-fact="childcare"[\s\S]*?<p class="asof" data-asof>)2026-09-18 · verified 2026-09-18/, '$12026-09-18 · verified 2026-09-19') },
  'link date missing from the chip': { page: NBHD, edit: (h) => h.replace(/(<section[^>]*data-fact="schools"[\s\S]*?)<p class="asof" data-asof-more>[^<]*<\/p>/, '$1') },
  'fire download date missing': { page: 'communities/escondido/index.html', edit: (h) => h.replace(/(<section[^>]*data-fact="hazards"[\s\S]*?)<p class="asof" data-asof-more>CAL FIRE[^<]*<\/p>/, '$1') },
  'superseded quote date missing': { page: 'sequence/first-30-days/index.html', edit: (h) => h.replace(/(<section[^>]*data-fact="f30-loss-damage-claim"[\s\S]*?)<p class="asof" data-asof-more>[^<]*<\/p>/, '$1') },
  'section with no chip': { page: NBHD, edit: (h) => h.replace(/(<section[^>]*data-fact="access"[\s\S]*?)<details class="src-chip"[\s\S]*?<\/details>\s*<\/section>/, '$1</section>') },
  'two chips in a section': { page: NBHD, edit: (h) => { const c = h.match(/<details class="src-chip" data-source-chip[\s\S]*?<\/details>/)[0]; return h.replace(/(<section[^>]*data-fact="climate"[^>]*>)/, `$1${c}`); } },
  'figure in a no-fact line': { page: NBHD, edit: (h) => h.replace('your street can change them.', 'your street can change them by 10 minutes.') },
  'unknown source key': { page: NBHD, edit: (h) => h.replace(/data-fact="climate"([\s\S]*?)prov:climate([\s\S]*?)data-chip-src="prov:climate"/, 'data-fact="climate"$1prov:weather$2data-chip-src="prov:weather"') },
  'chip outside a collapsed section': { page: NBHD, edit: (h) => h.replace(/(<section[^>]*data-fact="climate"[^>]*>)([\s\S]*?)(<details class="src-chip"[\s\S]*?<\/details>)(\s*<\/div>\s*<\/details>)/, '$1$2$4$3') },
  'Sources table row with a wrong date': { page: NBHD, edit: (h) => h.replace(/(<tr data-src="prov:schools">(?:<td>[^<]*<\/td>){3}<td data-verified>)[^<]*/, '$12026-09-01') },
  'Sources table row with no source': { page: NBHD, edit: (h) => h.replace('<tr data-src="prov:climate">', '<tr>') },
  'chip on the Sources table': { page: NBHD, edit: (h) => { const c = h.match(/<details class="src-chip" data-source-chip[\s\S]*?<\/details>/)[0]; return h.replace(/(<section[^>]*data-fact="sources"[\s\S]*?)(<\/section>)/, `$1${c}$2`); } },
  'sequence step figure untagged': { page: 'sequence/arrival/index.html', edit: (h) => h.replace(/(<section[^>]*data-fact="arrival-travel-claim"[^>]*>)/, '$1<p>Due in 5 days.</p>') },
};

// --- Run --------------------------------------------------------------------
const plantArg = process.argv.includes('--plant') ? process.argv[process.argv.indexOf('--plant') + 1] : null;
if (plantArg) {
  const kinds = plantArg === 'all' ? Object.keys(PLANTS) : [plantArg];
  let missed = 0;
  for (const k of kinds) {
    if (!PLANTS[k]) { console.log(`unknown plant "${k}"; kinds: ${Object.keys(PLANTS).join(' | ')}`); process.exit(2); }
    failures.length = 0;
    checkDist(PLANTS[k]);
    const f = failures.find((x) => x.check === 'dated');
    const broke = failures.find((x) => x.check === 'plant');
    if (f && !broke) console.log(`  CAUGHT  ${k}: ${f.where}: ${f.what.slice(0, 140)}`);
    else { console.log(`  MISSED  ${k}${broke ? ' (the plant changed nothing)' : ''}`); missed++; }
  }
  console.log(`\ndated plants: ${kinds.length - missed}/${kinds.length} caught`);
  process.exit(missed ? 1 : 0);
}
if (stage === 'source') checkSource();
else if (stage === 'dist') checkDist();
else {
  console.error(`unknown stage "${stage}" (use source or dist)`);
  process.exit(2);
}

const byCheck = failures.reduce((acc, f) => ((acc[f.check] ??= []).push(f), acc), {});
const checks = stage === 'source' ? ['no-score', 'bah-source', 'license', 'dated', 'data', 'contrast'] : ['dated', 'bah-figures', 'no-demo', 'no-score', 'incentive', 'noindex', 'placeholder', 'third-party', 'dist'];
console.log(`\nPrinciple checks (${stage})`);
for (const c of checks) {
  const fs = byCheck[c] ?? [];
  if (!fs.length) console.log(`  PASS  ${c}`);
  else {
    console.log(`  FAIL  ${c} (${fs.length})`);
    for (const f of fs.slice(0, Number(process.env.SHOW ?? 20))) console.log(`        ${f.where}: ${f.what}`);
    if (fs.length > 20) console.log(`        … and ${fs.length - 20} more`);
  }
}
for (const s of skipped) console.log(`  SKIP  ${s}`);
for (const p of passes) console.log(`  ${p}`);
if (failures.length) {
  console.log(`\n${failures.length} principle check failure(s). Build failed.\n`);
  process.exit(1);
}
console.log('');
