#!/usr/bin/env node
// Assistant corpus (F6 groundwork), run after the build (postbuild, after the checks).
// Chunks every published page by section into dist/assistant/corpus.json, which the
// /api/ask Pages Function reads from the site's own static assets.
//
// Only content already on the site goes in: the rendered pages in dist/, after
// they've passed the principle checks. A chunk is one dated fact block (a page
// section), split at its <h3> subsections and again when it's long, with:
//   url             the page, with the section anchor (/communities/santee/#cost)
//   page_title      the page's title
//   section_heading the section (and subsection) heading
//   text            the section's visible text; table rows as "cell | cell" lines
//   verified_on     the latest date in the section's date line (YYYY-MM-DD or YYYY-MM)
//   dates           the date line as the page prints it
// Text outside a dated block (page intros, navigation) is left out, so every chunk
// the assistant can cite carries a date (Principle 2). Tool pages (/plan/, /ask/)
// and the changelog aren't content and are skipped, and so is each page's "Sources
// and dates" block (the /sources/ page has the same rows once).
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexChunks } from '../assistant/retrieve.js';
import { BASES } from '../assistant/context.js';
import { TIMELINE_ID } from '../src/lib/sequence.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const OUT = join(DIST, 'assistant', 'corpus.json');
const SKIP = [/^plan\//, /^ask\//, /^changelog\//];
const MAX_CHARS = 1600; // longer sections (school tables) split into parts of about this size

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') ? [p] : [];
});
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;|&rsquo;|&#x27;/g, '’').replace(/&lsquo;/g, '‘').replace(/&quot;|&#34;/g, '"')
  .replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–');
// Visible text, keeping table rows and list items on their own lines.
const text = (html) => decode(html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<small class="incentive"[^>]*>([\s\S]*?)<\/small>/gi, ' ($1)')
  .replace(/<\/t[dh]>/gi, ' | ')
  .replace(/<\/(tr|li|p|dd|caption|h[1-6]|blockquote)>/gi, '\n')
  .replace(/<\/dt>/gi, ': ')
  .replace(/<[^>]+>/g, ' '))
  .split('\n').map((l) => l.replace(/\s+/g, ' ').replace(/\s*\|\s*$/, '').trim()).filter(Boolean).join('\n');
const latestDate = (s) => {
  const days = s.match(/\b20\d{2}-\d{2}-\d{2}\b/g);
  if (days) return days.sort().at(-1);
  const months = s.match(/\b20\d{2}-\d{2}\b/g);
  return months ? months.sort().at(-1) : null;
};

function split(body) {
  // One part per <h3> subsection (the text before the first <h3> is its own part).
  const parts = [];
  let last = 0, heading = '';
  for (const m of body.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi)) {
    parts.push({ sub: heading, html: body.slice(last, m.index) });
    heading = text(m[1]);
    last = m.index + m[0].length;
  }
  parts.push({ sub: heading, html: body.slice(last) });
  return parts.map((p) => ({ sub: p.sub, text: text(p.html), unranked: unrankedLines(p.html), captions: captionLines(p.html) })).filter((p) => p.text.length > 0);
}
// Split a long section without breaking a table: lines are grouped into blocks (a whole table with its
// caption, or one line of text) and blocks are packed into parts of about MAX_CHARS. Only a table that is
// itself longer than that (the school lists) is split, between rows, and each part repeats its caption and
// header row. The caption carries what the rows need to be read (the zip, the housing area, the units):
// before, a caption could end one part while its table opened the next (in-11, Oceanside's access table).
// Retrieval sends every part of a section together (assistant/retrieve.js), so parts are for ranking,
// never for cutting a section in half.
// Text a page marks data-unranked (the BAH lines on neighborhood and base housing pages, which repeat the
// base pages' tables 60 times) is sent with its section but left out of the ranking text (rank_text).
function unrankedLines(html) {
  const lines = new Set();
  let out = html, m;
  while ((m = out.match(/<(\w+)\b[^>]*\sdata-unranked(?=[\s=>])[^>]*>/))) {
    const re = new RegExp(`<${m[1]}\\b[^>]*>|</${m[1]}>`, 'gi');
    re.lastIndex = m.index + m[0].length;
    let depth = 1, end = out.length, x;
    while ((x = re.exec(out))) { if (x[0][1] !== '/') depth++; else if (--depth === 0) { end = x.index + x[0].length; break; } }
    for (const l of text(out.slice(m.index, end)).split('\n')) lines.add(l);
    out = out.slice(0, m.index) + ' ' + out.slice(end);
  }
  return lines;
}
// Hidden elements that aren't a variant (labelVariants takes those first). Balanced on the element's own tag, so a
// hidden wrapper takes its nested divs with it. Before 2026-10-25 this ran on the variants too and kept only the
// visible default, so the model never saw another pay band's row or the drive to a base other than the nearest
// (--plant variants builds that way and must fail corpus-variants).
const stripHidden = (html) => dropElements(html, /<(\w+)\b[^>]*\shidden(?:="")?(?=[\s>])[^>]*>/);

// Per-base and per-band variants (2026-10-25). A page renders one variant per pay band (data-band-show), per BAH
// area (data-mha-bases) and per base (data-base); its script shows the reader's and hides the rest. Every variant
// goes in the corpus as its own line (or block, for a table), labeled with what it's for: "3-bed rent vs. BAH,
// O1–O3, San Diego area: 99–114% (HUD rent / BAH)", "Commute at 0700 to MCAS Miramar: 16–18 min". Two kinds a page
// repeats from elsewhere go in once, not per section: the BAH lines (BAH_LINES) and the Commute summary per base (the
// section's table has every base). Each is
// wrapped in marker lines (VARIANT_OPEN/VARIANT_CLOSE) that unmark() turns into the chunk's `variants` ranges, so
// the Function can put the reader's band and base first (assistant/retrieve.js variantsFirst). Only the variant
// the page shows by default is ranked (rank_text): ranking stays what it was, and the other variants are sent with it.
const VARIANT = [];
const BAH_LINES = new Map(); // "CA038|O1–O3" → its line, the same on every page that prints it
const VARIANT_OPEN = /^⟦v(\d+)⟧$/;
const VARIANT_CLOSE = '⟦/v⟧';
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null;
const isHidden = (tag) => /\shidden(?:="")?(?=[\s>])/.test(tag);
const BASE_NAME = Object.fromEntries(Object.values(BASES).filter((b) => b.slug).map((b) => [b.slug, b.name]));
const variantHtml = (tags, inner) => `<p>⟦v${VARIANT.push({ ...tags, id: VARIANT.length }) - 1}⟧</p>${inner}<p>${VARIANT_CLOSE}</p>`;
// Replace each element whose opening tag matches `open` (balanced on its own tag) with fn(openTag, innerHtml, before).
function replaceElements(html, open, fn) {
  let out = html, from = 0, m;
  const re = new RegExp(open.source, open.flags.replace('g', '') + 'g');
  while ((re.lastIndex = from, m = re.exec(out))) {
    const close = new RegExp(`<${m[1]}\\b[^>]*>|</${m[1]}>`, 'gi');
    close.lastIndex = m.index + m[0].length;
    let depth = 1, end = out.length, innerEnd = out.length, x;
    while ((x = close.exec(out))) { if (x[0][1] !== '/') depth++; else if (--depth === 0) { innerEnd = x.index; end = x.index + x[0].length; break; } }
    const rep = fn(m[0], out.slice(m.index + m[0].length, innerEnd), out.slice(0, m.index));
    out = out.slice(0, m.index) + rep + out.slice(end);
    from = m.index + rep.length;
  }
  return out;
}
// The variants on a section, as the page renders them: one per data-base, one per data-band-show, and one per
// data-mha-bases wrapper that holds neither (the BAH area block counts by its bands). corpus-variants checks that
// every one reaches the corpus.
const variantCount = (html) => [...html.matchAll(/<\w+\b[^>]*>/g)].map((m) => m[0])
  .filter((t) => !/\sdata-band-picker(?=[\s>=])/.test(t))
  .filter((t) => attr(t, 'data-base') || attr(t, 'data-band-show') || (attr(t, 'data-mha-bases') && !attr(t, 'data-bah-block'))).length;
// `areas`: data-mha-bases value → { mha, area } from the page's BAH blocks ("San Diego area (MHA CA038)").
function labelVariants(html, areas) {
  let out = dropElements(html, /<(\w+)\b[^>]*\sdata-band-picker(?=[\s>=])[^>]*>/); // the band select: UI
  const areaOf = (bases) => {
    if (!areas.has(bases)) throw new Error(`build_corpus: no BAH block on the page for data-mha-bases="${bases}"`);
    return areas.get(bases);
  };
  // A BAH area block (the BAH lines a neighborhood or base housing Cost section repeats from the base page's table):
  // one line per band, under the block's own label. Only the page's default goes in the section; every band × area
  // line goes in BAH_LINES once for the corpus (QUESTIONS 89), and the Function adds the family's next to it.
  out = replaceElements(out, /<(div)\b(?=[^>]*\sdata-mha-bases=")[^>]*\sdata-bah-block="[^"]*"[^>]*>/, (tag, inner) => {
    const label = text((inner.match(/<p[^>]*data-bah-label[^>]*>([\s\S]*?)<\/p>/) ?? [, ''])[1]);
    const { mha } = areaOf(attr(tag, 'data-mha-bases'));
    return replaceElements(inner.replace(/<p[^>]*data-bah-label[^>]*>[\s\S]*?<\/p>/, ''), /<(ul)\b[^>]*\sdata-band-show="[^"]*"[^>]*>/, (ul, items) => {
      const band = attr(ul, 'data-band-show');
      const line = `${label}, ${band} — ${bandItems(items)}`;
      const key = `${mha}|${band}`;
      if (BAH_LINES.has(key) && BAH_LINES.get(key) !== line) throw new Error(`build_corpus: two BAH lines for ${key}:\n  ${BAH_LINES.get(key)}\n  ${line}`);
      BAH_LINES.set(key, line);
      const shown = !isHidden(tag) && !isHidden(ul);
      if (!shown) { VARIANT.push({ band, mha, shared: true, id: VARIANT.length }); return ''; }
      return variantHtml({ band, mha, bah: true, shown }, `<p>${line}</p>`);
    });
  });
  // Any other per-band list (the DLA rates, under their own label line): every band's items, one per line as the
  // page prints them; each names its grade ("E-5: $3,548.02 with dependents, …").
  out = replaceElements(out, /<(ul)\b[^>]*\sdata-band-show="[^"]*"[^>]*>/, (ul, items) => variantHtml({ band: attr(ul, 'data-band-show'), shown: !isHidden(ul) }, `<ul>${items}</ul>`));
  // At a glance: a term with one value per base or band becomes one labeled line per value.
  out = out.replace(/<dt\b[^>]*>([\s\S]*?)<\/dt>((?:\s*<dd\b[^>]*\sdata-(?:base|band-show|mha-bases)="[^>]*>[\s\S]*?<\/dd>)+)/g, (_, dt, dds) => {
    const term = text(dt);
    return [...dds.matchAll(/<dd\b([^>]*)>([\s\S]*?)<\/dd>/g)].map(([, a, inner]) => {
      const tag = `<dd${a}>`;
      const [value, note = ''] = [...inner.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/g)].map((s) => text(s[1]));
      const base = attr(tag, 'data-base'), band = attr(tag, 'data-band-show'), bases = attr(tag, 'data-mha-bases');
      if (base) {
        const name = BASE_NAME[base] ?? base;
        const rest = note.replace(new RegExp(`^to ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`), '');
        return variantHtml({ base, shown: !isHidden(tag) }, `<p>${term} to ${name}: ${value}${rest ? ` ${rest}` : ''}</p>`);
      }
      // "HUD rent, O1–O3, San Diego area BAH" → "3-bed rent vs. BAH, O1–O3, San Diego area: 99–114% (HUD rent / BAH)":
      // the same words, so the default line ranks as it did.
      const { mha, area } = areaOf(bases);
      const short = area.replace(/ \(MHA CA\d+\)$/, '');
      const hud = note === `HUD rent, ${band}, ${short} BAH`;
      return variantHtml({ band, mha, shown: !isHidden(tag) }, `<p>${term}, ${band}, ${hud ? short : area}: ${value}${hud ? ' (HUD rent / BAH)' : note ? ` (${note})` : ''}</p>`);
    }).join('');
  });
  // A wrapper per BAH area (the full ratio tables): kept whole; its captions name the area.
  out = replaceElements(out, /<(\w+)\b[^>]*\sdata-mha-bases="[^"]*"[^>]*>/, (tag, inner) => variantHtml({ mha: areaOf(attr(tag, 'data-mha-bases')).mha, shown: !isHidden(tag) }, inner));
  // A summary line per base (the Commute section's): only the default goes in, since the section's own table, sent
  // with it, has the drive to every base (QUESTIONS 89/90); corpus-variants checks that table names the base.
  out = replaceElements(out, /<(\w+)\b[^>]*\sdata-base="[^"]*"[^>]*>/, (tag, inner) => {
    if (isHidden(tag)) { VARIANT.push({ base: attr(tag, 'data-base'), inTable: true, id: VARIANT.length }); return ''; }
    return variantHtml({ base: attr(tag, 'data-base'), shown: true }, `<p>${inner}</p>`);
  });
  return out;
}
// "E5: $3,975 with dependents, …; E6: …" from a band's <li> items.
const bandItems = (html) => [...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((m) => text(m[1]).replace(/^(\S+)\s+:\s*/, '$1: ')).join('; ');
// The marker lines out of a part's windows: each window's text, and its variants as line ranges with their tags.
// A variant can run past the end of a window (a long table); the next window continues it.
function unmark(ws) {
  let open = null;
  return ws.map((w) => {
    const lines = [], variants = [];
    let from = 0;
    for (const l of w.split('\n')) {
      const o = l.match(VARIANT_OPEN);
      if (o) { open = VARIANT[Number(o[1])]; from = lines.length; continue; }
      if (l === VARIANT_CLOSE) { if (lines.length > from) variants.push({ from, to: lines.length, ...open }); open = null; continue; }
      lines.push(l);
    }
    if (open && lines.length > from) variants.push({ from, to: lines.length, ...open });
    return { text: lines.join('\n'), variants };
  }).filter((w) => w.text);
}
// What the pages mark as not content (2026-10-23): the SourceChip (its date line is read first, as `dates`), toggle
// labels ("Show all pay bands", data-ui), the reader's own rows that repeat a full table further down (data-dup) and
// lines that state no fact (data-nofact: the "How the numbers work" hints and links).
const stripUi = (html) => dropElements(html, /<(\w+)\b[^>]*\s(?:data-source-chip|data-ui|data-dup|data-nofact)(?:="[^"]*")?(?=[\s>])[^>]*>/);
function dropElements(html, open) {
  let out = html, m;
  while ((m = out.match(open))) {
    const re = new RegExp(`<${m[1]}\\b[^>]*>|</${m[1]}>`, 'gi');
    re.lastIndex = m.index + m[0].length;
    let depth = 1, end = m.index + m[0].length, x; // no closing tag (a void element): drop the tag alone
    while ((x = re.exec(out))) { if (x[0][1] !== '/') depth++; else if (--depth === 0) { end = x.index + x[0].length; break; } }
    out = out.slice(0, m.index) + ' ' + out.slice(end);
  }
  return out;
}
const isRow = (l) => l.includes(' | ');
// A table's <caption> text, one line each, as text() writes it.
const captionLines = (html) => new Set([...html.matchAll(/<caption\b[^>]*>([\s\S]*?)<\/caption>/gi)].map((m) => text(m[1])).filter(Boolean));
// Variant lines the page hides by default, and the marker lines around every variant, weigh nothing here: a section
// splits where it did when only its default variant went in (so ranking is unchanged), and the other variants ride
// along in the part that holds their default.
// `attach: false` is the old packing, kept only for --plant caption (the check must catch it).
function windows(t, captions = new Set(), { attach = true } = {}) {
  let hidden = false;
  const all = t.split('\n').map((l) => {
    const o = l.match(VARIANT_OPEN);
    if (o) { hidden = !VARIANT[Number(o[1])].shown; return { l, w: 0 }; }
    if (l === VARIANT_CLOSE) { hidden = false; return { l, w: 0 }; }
    return { l, w: hidden ? 0 : l.length + 1 };
  });
  const size = (ls) => Math.max(0, ls.reduce((n, x) => n + x.w, 0) - 1);
  const join = (ls) => ls.map((x) => x.l).join('\n');
  if (size(all) <= MAX_CHARS) return [t];
  const blocks = [];
  for (const x of all) {
    const l = x.l;
    const last = blocks.at(-1);
    if (last && isRow(l) && last.table) last.lines.push(x);
    else if (attach && last?.caption && !last.table && isRow(l)) { last.table = true; last.lines.push(x); }
    else blocks.push({ table: isRow(l), caption: !isRow(l) && captions.has(l), lines: [x] });
  }
  const out = [];
  let cur = [];
  const flush = () => { if (cur.length) out.push(join(cur)); cur = []; };
  for (const b of blocks) {
    if (size([...cur, ...b.lines]) <= MAX_CHARS) { cur.push(...b.lines); continue; }
    flush();
    if (size(b.lines) <= MAX_CHARS || !b.table) { cur.push(...b.lines); continue; }
    const head = b.lines.slice(0, b.caption ? 2 : 1); // caption (if any) and header row
    let part = [...head];
    for (const r of b.lines.slice(head.length)) {
      if (part.length > head.length && size([...part, r]) > MAX_CHARS) { out.push(join(part)); part = [...head]; }
      part.push(r);
    }
    cur = part;
  }
  flush();
  return out;
}
// The check (corpus-captions): in a split section, every run of table rows in every part sits right under
// its table's caption. Every captioned section on the site captions all its tables (none mixes), so a
// run with no caption above it is a table that lost its context.
function uncaptioned(ws, captions) {
  if (ws.length < 2 || !captions.size) return [];
  return ws.flatMap((w, wi) => w.split('\n').flatMap((l, i, ls) => (isRow(l) && !isRow(ls[i - 1] ?? '') && !captions.has(ls[i - 1] ?? '') ? [`part ${wi + 1}: "${l.slice(0, 50)}"`] : [])));
}

const args = process.argv.slice(2);
const plant = args.includes('--plant') ? args[args.indexOf('--plant') + 1] : null;
if (plant && !['caption', 'variants'].includes(plant)) { console.error('build_corpus: --plant takes "caption" or "variants"'); process.exit(2); }
const chunks = [];
const missing = [];
const unlabeled = [];
// Pages tied to each base (assistant/retrieve.js baseBoost). A base housing page: the base LMH ties it to (the base
// page's "Tied to" section). A neighborhood page: the base it leads with (its nearest, data-default-base) when that
// base's page also lists it under 30 min, so Alpine, nearest to NBSD at 50 min, isn't tied to it.
const baseTies = {};
const tie = (slug, page) => { (baseTies[slug] ??= []).includes(page) || baseTies[slug].push(page); };
const nearestBase = new Map(); // neighborhood page → its default base
const under30 = new Map(); // base slug → the neighborhood pages its page lists under 30 min
const mhaBases = {}; // MHA → the bases whose BAH it is, for matching a reader's base to a BAH area variant
let pages = 0, undatedChars = 0;
for (const file of walk(DIST)) {
  const rel = relative(DIST, file);
  if (SKIP.some((re) => re.test(rel))) continue;
  const html = readFileSync(file, 'utf-8');
  const url = `/${rel.replace(/index\.html$/, '')}`;
  const pageTitle = decode((html.match(/<title>([\s\S]*?)<\/title>/) ?? [, ''])[1]).replace(/\s*·\s*San Diego PCS Guide.*$/, '').trim();
  const blocks = [...html.matchAll(/<section[^>]*data-fact="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g)];
  if (!blocks.length) continue;
  pages++;
  // data-mha-bases → its BAH area, from the page's own BAH blocks ("2026 BAH, San Diego area (MHA CA038)").
  const areas = new Map([...html.matchAll(/<div\b[^>]*\sdata-bah-block="[^"]*"[^>]*>\s*<p[^>]*data-bah-label[^>]*>([\s\S]*?)<\/p>/g)]
    .map((m) => [attr(m[0], 'data-mha-bases'), { mha: attr(m[0], 'data-mha'), area: text(m[1]).replace(/^\d{4} BAH, /, '') }]));
  for (const [bases, { mha }] of areas) mhaBases[mha] ??= bases.split(' ');
  const defaultBase = (html.match(/\sdata-default-base="([^"]+)"/) ?? [])[1];
  if (defaultBase && url.startsWith('/communities/')) nearestBase.set(url, defaultBase);
  if (url.startsWith('/base/') && url !== '/base/') {
    const section = (fact) => (html.match(new RegExp(`<section[^>]*data-fact="${fact}"[^>]*>([\\s\\S]*?)<\\/section>`)) ?? [, ''])[1];
    for (const m of section('housing-tied').matchAll(/href="(\/base-housing\/[^"#?]+\/)/g)) tie(url.split('/')[2], m[1]);
    under30.set(url.split('/')[2], new Set([...section('tier-under30').matchAll(/href="(\/communities\/[^"#?]+\/)/g)].map((m) => m[1])));
  }
  const main = (html.match(/<main>([\s\S]*?)<\/main>/) ?? [, ''])[1];
  undatedChars += text(main.replace(/<section[^>]*data-fact="[^"]+"[^>]*>[\s\S]*?<\/section>/g, '').replace(/<nav[\s\S]*?<\/nav>/g, '')).length;
  for (const [, id, inner] of blocks) {
    // Each page's "Sources and dates" block repeats /sources/, which is in the corpus once.
    if (id === 'sources' && url !== '/sources/') continue;
    // The phase timeline repeats the step cards under it.
    if (id === TIMELINE_ID) continue;
    // The SourceChip's date line (data-asof) gives the section's verified date; its other dated lines (a CAL FIRE
    // download, links checked) ride along in `dates`.
    const asofHtml = (inner.match(/<p[^>]*data-asof[^>]*>([\s\S]*?)<\/p>/) ?? [, ''])[1];
    const moreLines = [...inner.matchAll(/<p[^>]*data-asof-more[^>]*>([\s\S]*?)<\/p>/g)].map((m) => text(m[1]));
    const verified = latestDate(text(asofHtml));
    const dates = [text(asofHtml), ...moreLines].join(' ');
    if (!verified) throw new Error(`build_corpus: ${url}#${id} has no date in its date line: "${dates}"`);
    const content = stripUi(inner);
    const headHtml = (content.match(/<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/) ?? [, id])[1];
    const heading = text(headHtml);
    // The summary line, like the body, can hold one variant per base: each is labeled (labelVariants).
    // --plant variants drops the hidden ones first, as the corpus did before 2026-10-25.
    const variants = (h) => stripHidden(labelVariants(plant === 'variants' ? stripHidden(h) : h, areas));
    const summaryHtml = (content.match(/<summary>([\s\S]*?)<\/summary>/) ?? [, ''])[1].replace(/^[\s\S]*?<span class="summary-line"[^>]*>/, '');
    const seen = VARIANT.length;
    const summary = text(variants(summaryHtml));
    let body = content;
    body = body.replace(/<summary>[\s\S]*?<\/summary>/, '').replace(/<h2\b[^>]*>[\s\S]*?<\/h2>/, '');
    const expected = variantCount(summaryHtml) + variantCount(body);
    body = variants(body);
    const parts = split(body);
    const sent = new Set();
    parts.forEach((p, pi) => {
      const raw = windows(pi === 0 && summary ? `${summary}\n${p.text}` : p.text, p.captions, { attach: plant !== 'caption' });
      for (const m of uncaptioned(raw, p.captions)) missing.push(`${url}#${id}${p.sub ? ` › ${p.sub}` : ''} ${m}`);
      const ws = unmark(raw);

      ws.forEach((w, wi) => {
        // Ranked: what the page shows by default, without the lines it marks data-unranked.
        const lines = w.text.split('\n');
        const unshown = new Set(w.variants.filter((v) => !v.shown).flatMap((v) => lines.slice(v.from, v.to).map((_, i) => v.from + i)));
        const ranked = lines.filter((l, i) => !p.unranked.has(l) && !unshown.has(i));
        for (const v of w.variants) sent.add(v.id);
        chunks.push({
          id: `${url}#${id}${parts.length > 1 ? `-${pi}` : ''}${ws.length > 1 ? `-${wi + 1}` : ''}`,
          url: `${url}#${id}`,
          page_title: pageTitle,
          section_heading: [heading, p.sub].filter(Boolean).join(' › ') + (ws.length > 1 ? ` (part ${wi + 1} of ${ws.length})` : ''),
          group: `${url}#${id}${parts.length > 1 ? `-${pi}` : ''}`, // all parts of one (sub)section; retrieval sends them together
          text: w.text,
          ...(ranked.length < lines.length ? { rank_text: ranked.join('\n') } : {}), // ranking only; `text` is what's sent
          ...(w.variants.length ? { variants: w.variants.map(({ from, to, band, mha, base, shown, bah }) => ({ from, to, ...(band ? { band } : {}), ...(mha ? { mha } : {}), ...(base ? { base } : {}), ...(shown ? { default: true } : {}), ...(bah ? { bah: true } : {}) })) } : {}),
          verified_on: verified,
          dates,
        });
      });
    });
    // corpus-variants: every variant the section renders is in a chunk, labeled.
    const sectionRows = chunks.filter((c) => c.url === `${url}#${id}`).flatMap((c) => c.text.split('\n')).filter(isRow);
    const reached = VARIANT.slice(seen).filter((v) => sent.has(v.id) || (v.shared && BAH_LINES.has(`${v.mha}|${v.band}`))
      || (v.inTable && sectionRows.some((r) => r.startsWith(BASE_NAME[v.base])))).length;
    if (reached !== expected) unlabeled.push(`${url}#${id}: ${expected} variants on the page, ${reached} in the corpus`);
  }
}

for (const [page, slug] of nearestBase) if (under30.get(slug)?.has(page)) tie(slug, page);

// --plant caption builds with the old packing in memory and must fail corpus-captions; --plant variants keeps only
// each variant's visible default and must fail corpus-variants. Neither writes anything.
if (plant) {
  const caught = plant === 'caption' ? missing : unlabeled;
  console.log(`\nAssistant corpus, --plant ${plant}: ${caught.length ? `caught, ${caught.length} ${plant === 'caption' ? 'uncaptioned table run(s)' : 'section(s) missing variants'}:\n    ${caught.slice(0, 10).join('\n    ')}${caught.length > 10 ? `\n    … ${caught.length - 10} more` : ''}` : 'NOT caught'}`);
  process.exit(caught.length ? 0 : 1);
}
if (missing.length) {
  console.error(`  FAIL  corpus-captions: ${missing.length} table run(s) in a split section without their caption:\n    ${missing.slice(0, 10).join('\n    ')}`);
  process.exit(1);
}
console.log('  PASS  corpus-captions (every table in a split section keeps its caption)');
if (unlabeled.length) {
  console.error(`  FAIL  corpus-variants: ${unlabeled.length} section(s) where a pay band, BAH area or base variant didn't reach the corpus:\n    ${unlabeled.slice(0, 10).join('\n    ')}`);
  process.exit(1);
}
console.log(`  PASS  corpus-variants (all ${VARIANT.length} pay band, BAH area and base variants are labeled lines)`);
if (!existsSync(dirname(OUT))) mkdirSync(dirname(OUT), { recursive: true });
// The BM25 postings go in the same file, built with the same tokenizer the Function uses.
// The Q8 priority labels ride along for /api/ask's intake context (the Function can't import JSON
// in a way both Node and Cloudflare's wrangler 3 accept). They're public: /plan/ shows them.
const intakePriorities = JSON.parse(readFileSync(join(ROOT, 'src', 'config', 'intake', 'priorities.json'), 'utf-8')).priorities.map(({ id, label }) => ({ id, label }));
// rank_text only builds the postings: the Function reads the postings, so it isn't shipped (QUESTIONS 90).
const index = indexChunks(chunks);
const json = JSON.stringify({ built_from: 'dist/ pages after the principle checks', chunks: chunks.map(({ rank_text, ...c }) => c), index, intake_priorities: intakePriorities, base_ties: baseTies, mha_bases: mhaBases, bah_lines: Object.fromEntries(BAH_LINES) });
writeFileSync(OUT, json);
console.log(`\nAssistant corpus\n  ${chunks.length} chunks from ${pages} pages → dist/assistant/corpus.json (${Math.round(json.length / 1024)} KB); ${Math.round(undatedChars / 1024)} KB of undated text outside fact blocks left out\n`);
