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
  return parts.map((p) => ({ sub: p.sub, text: text(p.html) })).filter((p) => p.text.length > 0);
}
function windows(t) {
  if (t.length <= MAX_CHARS) return [t];
  const lines = t.split('\n');
  const out = [];
  let cur = [];
  for (const l of lines) {
    if (cur.join('\n').length + l.length > MAX_CHARS && cur.length) { out.push(cur.join('\n')); cur = []; }
    cur.push(l);
  }
  if (cur.length) out.push(cur.join('\n'));
  return out;
}

const chunks = [];
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
  const main = (html.match(/<main>([\s\S]*?)<\/main>/) ?? [, ''])[1];
  undatedChars += text(main.replace(/<section[^>]*data-fact="[^"]+"[^>]*>[\s\S]*?<\/section>/g, '').replace(/<nav[\s\S]*?<\/nav>/g, '')).length;
  for (const [, id, inner] of blocks) {
    // Each page's "Sources and dates" block repeats /sources/, which is in the corpus once.
    if (id === 'sources' && url !== '/sources/') continue;
    const asofHtml = (inner.match(/<p[^>]*data-asof[^>]*>([\s\S]*?)<\/p>/) ?? [, ''])[1];
    const dates = text(asofHtml);
    const verified = latestDate(dates);
    if (!verified) throw new Error(`build_corpus: ${url}#${id} has no date in its date line: "${dates}"`);
    const headHtml = (inner.match(/<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/) ?? [, id])[1];
    const heading = text(headHtml);
    const summary = text((inner.match(/<span class="summary-line">([\s\S]*?)<\/span>\s*<\/summary>/) ?? [, ''])[1]);
    let body = inner.replace(/<p[^>]*data-asof[^>]*>[\s\S]*?<\/p>/, '');
    body = body.replace(/<summary>[\s\S]*?<\/summary>/, '').replace(/<h2\b[^>]*>[\s\S]*?<\/h2>/, '');
    // Of the per-base and per-band variants a page renders (the script shows one), keep the visible default.
    body = body.replace(/<(\w+)\b[^>]*\shidden(?:="")?[^>]*>[\s\S]*?<\/\1>/g, ' ');
    const parts = split(body);
    parts.forEach((p, pi) => {
      const ws = windows(pi === 0 && summary ? `${summary}\n${p.text}` : p.text);
      ws.forEach((w, wi) => {
        chunks.push({
          id: `${url}#${id}${parts.length > 1 ? `-${pi}` : ''}${ws.length > 1 ? `-${wi + 1}` : ''}`,
          url: `${url}#${id}`,
          page_title: pageTitle,
          section_heading: [heading, p.sub].filter(Boolean).join(' › ') + (ws.length > 1 ? ` (part ${wi + 1} of ${ws.length})` : ''),
          text: w,
          verified_on: verified,
          dates,
        });
      });
    });
  }
}

if (!existsSync(dirname(OUT))) mkdirSync(dirname(OUT), { recursive: true });
// The BM25 postings go in the same file, built with the same tokenizer the Function uses.
const json = JSON.stringify({ built_from: 'dist/ pages after the principle checks', chunks, index: indexChunks(chunks) });
writeFileSync(OUT, json);
console.log(`\nAssistant corpus\n  ${chunks.length} chunks from ${pages} pages → dist/assistant/corpus.json (${Math.round(json.length / 1024)} KB); ${Math.round(undatedChars / 1024)} KB of undated text outside fact blocks left out\n`);
