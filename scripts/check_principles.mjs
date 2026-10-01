#!/usr/bin/env node
// Build-time principle checks. Any failure exits 1 and fails `npm run build`.
//
//   node scripts/check_principles.mjs source   (prebuild: data files, before Astro runs)
//   node scripts/check_principles.mjs dist     (postbuild: the rendered pages in dist/)
//
// Checks (PRD §3, §9; kickoff step 3):
//   dated        every rendered fact block shows its verified/vintage date (Principle 2)
//   no-bah       no BAH dollar figure appears anywhere in dist/ (F10)
//   no-demo      no demographic descriptors of places outside /sources/ (Principle 5)
//   no-score     no column or label named score/index/rating (corollary)
//   incentive    every outbound link carries an incentive label (Principle 4, F4)
//   noindex      every page is noindex until week 5
//   placeholder  no placeholder text reaches a page (lead/gotchas render only when written)
//   third-party  no page or stylesheet loads anything from another origin (Principle 3)
//   contrast     every text/background pair in the theme is at least 4.5:1 (source stage)
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

// --- Word lists (edit here) -------------------------------------------------
// Principle 5: places are described by commute, cost and school access, never
// by who lives there. Matched as whole words/phrases, case-insensitive, in the
// visible text of every page except /sources/.
const DEMOGRAPHIC_TERMS = [
  'affluent', 'wealthy', 'upscale', 'upper-class', 'upper class', 'middle-class', 'middle class',
  'working-class', 'working class', 'blue-collar', 'white-collar', 'low-income', 'high-income',
  'diverse', 'diversity', 'ethnic', 'ethnicity', 'racial', 'race', 'hispanic', 'latino', 'latina',
  'latinx', 'asian', 'caucasian', 'african american', 'immigrant', 'immigrants', 'retirees',
  'retiree', 'elderly', 'young professionals', 'young families', 'family-friendly', 'family friendly',
  'kid-friendly', 'demographic', 'demographics', 'gentrified', 'gentrifying', 'gentrification',
  'up-and-coming', 'sketchy', 'rough area', 'bad area', 'good area', 'nice area', 'safe area',
  'religious', 'conservative', 'liberal', 'military town', 'mostly military',
];
// The one documented exception: the military-household share (ACS armed-forces share).
const DEMOGRAPHIC_ALLOWED = [/military[- ]household share/gi, /armed[- ]forces share/gi];

// Corollary: no composite scores. Labels only (headers, captions, terms), and data column names.
const SCORE_WORDS = /\b(score|scores|index|indices|indexes|rating|ratings|rank(?:ing)?s?|grade[- ]?score)\b/i;
// "Rank band" and "rank group" are military pay-grade terms on the base-housing wait lists, not rankings.
const SCORE_ALLOWED = [/\brank band\b/i, /\brank group\b/i];

// Placeholder text that must never reach dist/ (checked in the full HTML, attributes included).
const PLACEHOLDER_PATTERNS = [/PLACEHOLDER/, /Brian writes/i, /data-placeholder/, /\bTODO\b/, /lorem ipsum/i];

// Text on background pairs the pages use, as theme.css custom properties.
// Every one must reach WCAG AA for body text (4.5:1).
const CONTRAST_MIN = 4.5;
const CONTRAST_PAIRS = [
  ['text', 'bg'], ['text', 'surface'], ['muted', 'bg'], ['muted', 'surface'],
  ['link', 'bg'], ['link', 'surface'], ['on-coral', 'coral'],
  ['blue-fg', 'blue-bg'], ['mauve-fg', 'mauve-bg'], ['gold-fg', 'gold-bg'],
  ['text', 'blue-bg'], ['text', 'mauve-bg'], ['text', 'gold-bg'], // tile sub-lines, gap boxes
  ['muted', 'blue-bg'], ['muted', 'gold-bg'], ['link', 'gold-bg'], // "+1" on a tile; labels and links in a gap box
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

// BAH figures: read from the private data repo when it sits next to this one
// (local builds). On the host the data repo isn't there, so the exact-figure
// check is skipped and the context check still runs.
function loadBah() {
  const path = process.env.BAH_CSV ?? join(ROOT, '..', 'pcs-sd-data', 'EAP Data', 'csv', 'dod_bah_2026_sd_mhas.csv');
  if (!existsSync(path)) return null;
  const [header, ...rows] = readFileSync(path, 'utf-8').trim().split(/\r?\n/).map((l) => l.split(','));
  const gradeCols = header.map((h, i) => (/^[EOW]\d+E?$/.test(h) ? i : -1)).filter((i) => i >= 0);
  return new Set(rows.flatMap((r) => gradeCols.map((i) => Number(r[i]))).filter((n) => n > 0));
}
// Reviewed coincidences: a dollar figure that equals a BAH value but is something else
// (e.g. a HUD rent). Each entry: { "page": "communities/x/index.html", "value": 4410, "why": "..." }
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
      if (/^(bah|bah_|.*_bah$|.*_bah_)/i.test(c) || /^[EOW]\d+E?$/.test(c)) fail('no-bah', name, `column "${c}" looks like a BAH figure`);
      if (/^google_/.test(c)) fail('license', name, `column "${c}" (Google raw values stay in the data repo)`);
    }
    const missingDate = rows.filter((r) => !r.vintage || (!r.verified_on && !name.endsWith('sources.json')));
    if (missingDate.length) fail('dated', name, `${missingDate.length} rows without vintage/verified_on (first id: ${missingDate[0].id})`);
  }
  if (!failures.some((f) => f.check !== 'contrast')) passes.push(`source: ${files.length} data files, column names and dates OK`);
}

// --- Dist stage -------------------------------------------------------------
function checkDist() {
  const pages = walk(DIST, '.html');
  if (pages.length === 0) {
    fail('dist', 'dist/', 'no pages built');
    return;
  }
  const bah = loadBah();
  const allow = loadBahAllow();
  let factBlocks = 0, extLinks = 0;

  // third-party: stylesheets (fonts, background images) only from this site.
  for (const file of walk(DIST, '.css')) {
    const css = readFileSync(file, 'utf-8');
    for (const m of css.matchAll(/(?:url\(\s*['"]?|@import\s+['"])((?:https?:)?\/\/[^'")\s]+)/gi)) fail('third-party', relative(DIST, file), m[1]);
  }

  for (const file of pages) {
    const page = relative(DIST, file);
    const html = readFileSync(file, 'utf-8');
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

    // dated: every data-fact block has a non-empty data-asof line containing a date.
    const blocks = [...html.matchAll(/<section[^>]*data-fact="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g)];
    for (const [, id, body] of blocks) {
      factBlocks++;
      const asof = body.match(/<p[^>]*data-asof[^>]*>([\s\S]*?)<\/p>/);
      if (!asof) fail('dated', page, `fact block "${id}" has no date line`);
      else if (!/\b(19|20)\d{2}\b/.test(visibleText(asof[1]))) fail('dated', page, `fact block "${id}" date line has no year: "${visibleText(asof[1]).trim()}"`);
    }
    // Tables and fact lists must sit inside a dated block.
    const outside = html.replace(/<section[^>]*data-fact="[^"]+"[^>]*>[\s\S]*?<\/section>/g, '');
    for (const tag of ['table', 'dl']) {
      if (new RegExp(`<${tag}[\\s>]`).test(outside)) fail('dated', page, `a <${tag}> sits outside any dated fact block`);
    }

    // no-bah: context check (a dollar figure in the same sentence as BAH/housing allowance).
    for (const m of text.matchAll(/[^.;:]*\b(BAH|housing allowance|basic allowance)\b[^.;:]*/gi)) {
      const dollar = m[0].match(/\$\s?\d[\d,]*/);
      if (dollar) fail('no-bah', page, `dollar figure next to "${m[1]}": ${context(m[0], m[0].indexOf(dollar[0]))}`);
    }
    // no-bah: exact figures (local builds only).
    if (bah) {
      for (const m of text.matchAll(/\$\s?(\d{1,2},?\d{3})\b/g)) {
        const n = Number(m[1].replace(/,/g, ''));
        if (bah.has(n) && !allow.some((a) => a.page === page && a.value === n)) {
          fail('no-bah', page, `$${m[1]} equals a 2026 BAH figure: ${context(text, m.index)} (if it's a coincidence, add it to scripts/bah_check_allow.json with a reason)`);
        }
      }
    }

    // no-demo (skip /sources/)
    if (!page.startsWith('sources/')) {
      let t = text;
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

  passes.push(`dist: ${pages.length} pages, ${factBlocks} fact blocks, ${extLinks} outbound links`);
  if (!bah) skipped.push('no-bah exact-figure check (BAH table not found next to this repo; context check still ran)');
}

// --- Run --------------------------------------------------------------------
if (stage === 'source') checkSource();
else if (stage === 'dist') checkDist();
else {
  console.error(`unknown stage "${stage}" (use source or dist)`);
  process.exit(2);
}

const byCheck = failures.reduce((acc, f) => ((acc[f.check] ??= []).push(f), acc), {});
const checks = stage === 'source' ? ['no-score', 'no-bah', 'license', 'dated', 'data', 'contrast'] : ['dated', 'no-bah', 'no-demo', 'no-score', 'incentive', 'noindex', 'placeholder', 'third-party', 'dist'];
console.log(`\nPrinciple checks (${stage})`);
for (const c of checks) {
  const fs = byCheck[c] ?? [];
  if (!fs.length) console.log(`  PASS  ${c}`);
  else {
    console.log(`  FAIL  ${c} (${fs.length})`);
    for (const f of fs.slice(0, 20)) console.log(`        ${f.where}: ${f.what}`);
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
