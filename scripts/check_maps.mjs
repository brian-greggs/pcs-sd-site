#!/usr/bin/env node
// Map checks (session 12), postbuild after the intake checks. Reads the built pages in dist/.
//
//   map-pages     the home page has the overview map, every base page its base map, every neighborhood page its locator
//   map-tiers     on every base page, the map shades each of the 40 neighborhoods exactly once, in the group tierOf()
//                 (src/lib/tiers.js) gives the top of its 0700 drive range to that base, computed here from commute.json;
//                 the same group as the page's own cards; the fill class is the group's; the legend is TIER_LABEL, in order
//   map-geometry  every drawn path names its source (data-geo) and equals the path redrawn from the exported TopoJSON
//                 named in data-geo-file (read here from src/geo/) with the projection in data-proj; nothing else is drawn
//                 but the allowed roles (the ocean rectangle, the hatch, base markers at the file's base points, freeway
//                 shields, leader lines); no file other than the two exports is named
//   map-size      the inline map SVG on a page is at most PAGE_BUDGET bytes (a locator at most LOCATOR_BUDGET)
//   map-labels    every <text> uses a label class from LABEL_CLASSES whose fill/halo pair is painted that way in site.css
//                 and is in the contrast check's CONTRAST_PAIRS; renders at 12 px or more on a 358 px-wide map; its box is
//                 at least as wide as its text, inside the map, and overlaps no other label
//   map-a11y      role="img" (role="group" on the home map, whose shapes are links), a <title> and <desc> that
//                 aria-labelledby names, a legend (on a locator, the one-line key, which must name the nearest base and the
//                 drive range computed here), and a date line with a year
//   map-links     on the home map, every neighborhood and base shape is a plain link to its built page, named with the
//                 place's name; the marker-and-label links beside them are out of the tab order; site.css gives links a
//                 visible focus style; no other map has links
//   map-bases     on a base page, its own base has the larger marker, the ring and the bold label; the other bases are muted
//   map-shields   phones show only the PHONE_ROUTES shields (the rest sit in the group site.css shows from 720 px); no shield
//                 sits on a base or a marker
//   map-palette   the four group colors (theme.css) fall in lightness, each at least 1.45:1 from its neighbor and 3:1 on the
//                 land and on the ocean; the land the site doesn't cover is a neutral gray at least 1.4:1 from the ocean
//
//   node scripts/check_maps.mjs                 # check dist/
//   node scripts/check_maps.mjs --plant all     # plant each kind of fault in memory; each must fail (writes nothing)
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { geoPath } from 'd3-geo';
import { tierOf, TIER_LABEL } from '../src/lib/tiers.js';
import { geo, projectionFrom, containsGeo, boxPoints, GEO_FILE, LABEL_CLASSES, TIERS, WIDTH, PHONE_WIDTH, MIN_LABEL_PX, PHONE_ROUTES, MARKER, textWidth } from '../src/lib/map.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const read = (p) => readFileSync(join(ROOT, p), 'utf-8');
export const PAGE_BUDGET = 90_000; // bytes of inline map SVG on one page (the county-wide maps are 65–77 KB)
export const LOCATOR_BUDGET = 50_000; // a neighborhood's locator (12–46 KB; the city ones show the most neighborhoods)

const communities = JSON.parse(read('src/data/communities.json'));
const commute = JSON.parse(read('src/data/commute.json'));
const bySlug = new Map(communities.map((c) => [c.slug, c]));
const BASE_SLUG = { NBSD: 'naval-base-san-diego', MIRAMAR: 'miramar', NASNI: 'north-island', NAB: 'naval-amphibious-base', NBPL: 'point-loma', NMCSD: 'naval-medical-center', MCRD: 'mcrd', PENDLETON: 'camp-pendleton' };
const topos = Object.fromEntries(Object.entries(GEO_FILE).map(([k, f]) => [f, JSON.parse(read(f))]));
const geos = Object.fromEntries(Object.entries(topos).map(([f, t]) => [f, geo(t)]));
const SITE_CSS = read('src/styles/site.css');
const THEME_CSS = read('src/styles/theme.css');
// Base codes, slugs and short names, in the site's order (src/lib/bases.ts; ties for "nearest" break in this order).
const BASES = [...read('src/lib/bases.ts').matchAll(/\{ code: '(\w+)', slug: '([\w-]+)', short: '([^']+)'/g)].map((m) => ({ code: m[1], slug: m[2], short: m[3] }));
const PALETTE = { adjacent: 1.45, onLand: 3, onOcean: 3, landOcean: 1.4 };
const lum = (hex) => {
  const c = hex.replace('#', '').match(/../g).map((h) => parseInt(h, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// The one-line key a locator must show: the nearest base by the 0700 drive (closest zip), and the range across the zips.
function locatorKey(slug) {
  const c = bySlug.get(slug);
  const near = BASES.map((b) => ({ b, ms: commute.filter((r) => r.base === b.code && c.zips.includes(r.zip)).map((r) => r.peak_am_min) }))
    .filter((x) => x.ms.length).map((x) => ({ ...x, lo: Math.min(...x.ms), hi: Math.max(...x.ms) })).sort((x, y) => x.lo - y.lo)[0];
  return `${c.name} · nearest base: ${near.b.short}, ${near.lo === near.hi ? `${near.lo} min` : `${near.lo}–${near.hi} min`}`;
}
function checkPalette(theme, fail) {
  const v = Object.fromEntries([...theme.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map((m) => [m[1], m[2]]));
  const tiers = TIERS.map((t) => v[`map-tier-${t}`]);
  const land = v['map-land'], ocean = v['map-ocean'];
  if (tiers.some((x) => !x) || !land || !ocean) { fail('map-palette', 'theme.css', 'a map color token is missing'); return; }
  for (let i = 0; i < tiers.length; i++) {
    const t = TIERS[i];
    if (i && !(lum(tiers[i]) < lum(tiers[i - 1]))) fail('map-palette', 'theme.css', `${t} isn't darker than ${TIERS[i - 1]}`);
    if (i && ratio(tiers[i], tiers[i - 1]) < PALETTE.adjacent) fail('map-palette', 'theme.css', `${TIERS[i - 1]} and ${t} are ${ratio(tiers[i], tiers[i - 1]).toFixed(2)}:1 apart (needs ${PALETTE.adjacent})`);
    if (ratio(tiers[i], land) < PALETTE.onLand) fail('map-palette', 'theme.css', `${t} is ${ratio(tiers[i], land).toFixed(2)}:1 on the land (needs ${PALETTE.onLand})`);
    if (ratio(tiers[i], ocean) < PALETTE.onOcean) fail('map-palette', 'theme.css', `${t} is ${ratio(tiers[i], ocean).toFixed(2)}:1 on the ocean (needs ${PALETTE.onOcean})`);
  }
  const ch = land.slice(1).match(/../g).map((h) => parseInt(h, 16));
  if (Math.max(...ch) - Math.min(...ch) > 10) fail('map-palette', 'theme.css', `--map-land ${land} isn't a neutral gray`);
  if (ratio(land, ocean) < PALETTE.landOcean) fail('map-palette', 'theme.css', `land and ocean are ${ratio(land, ocean).toFixed(2)}:1 (needs ${PALETTE.landOcean})`);
  return { tiers, land, ocean, adjacent: tiers.slice(1).map((x, i) => ratio(x, tiers[i])), onLand: tiers.map((x) => ratio(x, land)), onOcean: tiers.map((x) => ratio(x, ocean)), landOcean: ratio(land, ocean) };
}
const contrastPairs = [...read('scripts/check_principles.mjs').matchAll(/\['([\w-]+)',\s*'([\w-]+)'\]/g)].map((m) => `${m[1]}|${m[2]}`);

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') ? [p] : [];
});
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`)); return m ? m[1].replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/&amp;/g, '&') : null; };
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// The tier each neighborhood is in at each base, from the data (not from the page).
function expectedTier(slug, base) {
  const c = bySlug.get(slug);
  const mins = commute.filter((r) => r.base === base && c.zips.includes(r.zip)).map((r) => r.peak_am_min);
  return mins.length ? tierOf(Math.max(...mins)) : null;
}

// What a data-geo names, drawn from a topology.
function featureFor(G, ref) {
  const [kind, rest = ''] = ref.split(/:(.*)/s);
  if (kind === 'land') return G.land();
  if (kind === 'mexico') return G.mexico();
  if (kind === 'countyline') return G.countyline();
  if (kind === 'borders') return G.borders(communities);
  if (kind === 'base') return G.base(rest);
  if (kind === 'base-outline') return G.baseOutline(rest);
  if (kind === 'road') return G.road(rest);
  if (kind === 'communities') {
    const cs = rest.split(' ').map((s) => bySlug.get(s));
    if (cs.some((c) => !c)) throw new Error(`unknown neighborhood in "${ref}"`);
    return G.communities(cs);
  }
  throw new Error(`unknown data-geo "${ref}"`);
}

function checkPages(pages, fail, stats, css) {
  for (const [page, html] of pages) {
    const svgs = [...html.matchAll(/<svg\b[^>]*class="map-svg"[^>]*>[\s\S]*?<\/svg>/g)];
    const kind = page === 'index.html' ? 'overview' : page.startsWith('base/') && page.split('/').length === 3 ? 'base' : page.startsWith('communities/') ? 'locator' : null;
    const figures = [...html.matchAll(/<figure\b[^>]*data-map="([^"]+)"[^>]*>([\s\S]*?)<\/figure>/g)];
    if (kind && (figures.length !== 1 || figures[0][1] !== kind)) fail('map-pages', page, `expected one ${kind} map, found ${figures.map((f) => f[1]).join(', ') || 'none'}`);
    if (!kind && figures.length) fail('map-pages', page, 'a map on a page that shouldn’t have one');
    if (!svgs.length) continue;

    // map-size
    const bytes = svgs.reduce((n, m) => n + Buffer.byteLength(m[0]), 0);
    const budget = kind === 'locator' ? LOCATOR_BUDGET : PAGE_BUDGET;
    (stats.size[kind] ??= []).push({ page, bytes, gz: svgs.reduce((n, m) => n + gzipSync(m[0]).length, 0) });
    if (bytes > budget) fail('map-size', page, `${bytes.toLocaleString('en-US')} bytes of map SVG (budget ${budget.toLocaleString('en-US')})`);

    for (const [svg] of svgs) {
      const open = svg.match(/^<svg\b[^>]*>/)[0];
      const q = JSON.parse(attr(open, 'data-proj') ?? 'null');
      const file = attr(open, 'data-geo-file');
      const where = `${page} map`;

      // map-a11y
      const fig = figures.find((f) => f[2].includes(svg)) ?? figures[0];
      const ids = (attr(open, 'aria-labelledby') ?? '').split(' ').filter(Boolean);
      const hasLinks = /<a\b/.test(svg);
      if (attr(open, 'role') !== (hasLinks ? 'group' : 'img')) fail('map-a11y', where, `role should be "${hasLinks ? 'group' : 'img'}"`);
      const title = svg.match(/<title id="([^"]+)">([\s\S]*?)<\/title>/), desc = svg.match(/<desc id="([^"]+)">([\s\S]*?)<\/desc>/);
      if (!title || !title[2].trim() || !desc || !desc[2].trim()) fail('map-a11y', where, 'missing <title> or <desc>');
      else if (ids.join(' ') !== `${title[1]} ${desc[1]}`) fail('map-a11y', where, `aria-labelledby "${ids.join(' ')}" doesn't name the title and desc`);
      if (kind === 'locator') {
        const slug = attr(fig?.[0].match(/^<figure\b[^>]*>/)[0] ?? '', 'data-map-community');
        const key = fig && fig[2].match(/<p[^>]*data-map-key[^>]*>([\s\S]*?)<\/p>/);
        const got = key ? decode(key[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim() : '';
        if (!key) fail('map-a11y', where, 'no one-line key');
        else if (got !== locatorKey(slug)) fail('map-a11y', where, `key "${got}", expected "${locatorKey(slug)}"`);
      } else if (!fig || !/<ul class="map-legend"/.test(fig[2])) fail('map-a11y', where, 'no legend');
      const asof = fig && fig[2].match(/<p[^>]*data-map-asof[^>]*>([\s\S]*?)<\/p>/);
      if (!asof || !/\b20\d{2}\b/.test(asof[1])) fail('map-a11y', where, 'no date line with a year');

      // map-geometry
      if (!q || !Object.values(GEO_FILE).includes(file)) { fail('map-geometry', where, `data-geo-file "${file}" isn't one of the exported files, or no data-proj`); continue; }
      const path = geoPath(projectionFrom(q)).digits(q.digits);
      const G = geos[file];
      let paths = 0;
      for (const m of svg.matchAll(/<path\b[^>]*>/g)) {
        const tag = m[0], ref = attr(tag, 'data-geo'), d = attr(tag, 'd');
        paths++;
        if (!ref) { fail('map-geometry', where, `a path with no data-geo (hand-drawn?): ${tag.slice(0, 80)}`); continue; }
        let want;
        try { want = path(featureFor(G, ref)) ?? ''; } catch (e) { fail('map-geometry', where, e.message); continue; }
        if (want !== d) fail('map-geometry', where, `path "${ref.slice(0, 60)}" differs from ${file} redrawn (${d?.length} vs ${want.length} characters)`);
      }
      stats.paths += paths;
      const body = svg.replace(/<defs>[\s\S]*?<\/defs>/, '');
      for (const m of body.matchAll(/<(rect|circle|line|polyline|polygon|ellipse|image|foreignObject)\b[^>]*>/g)) {
        const tag = m[0], role = attr(tag, 'data-role');
        const ok = { rect: ['ocean', 'shield'], circle: ['marker', 'marker-ring'], line: ['leader'] }[m[1]] ?? [];
        if (!ok.includes(role)) { fail('map-geometry', where, `<${m[1]}> drawn outside the exported geometry: ${tag.slice(0, 80)}`); continue; }
        if (role === 'ocean' && (attr(tag, 'width') !== String(q.width) || attr(tag, 'height') !== String(q.height))) fail('map-geometry', where, 'the ocean rectangle isn’t the whole map');
        if (role === 'marker' || role === 'marker-ring') {
          const xy = projectionFrom(q)(G.basePoint(attr(tag, 'data-base')));
          if (!xy || Math.abs(xy[0] - Number(attr(tag, 'cx'))) > 0.051 || Math.abs(xy[1] - Number(attr(tag, 'cy'))) > 0.051) fail('map-geometry', where, `marker for ${attr(tag, 'data-base')} isn't at the file's base point`);
        }
      }
      for (const m of [...svg.matchAll(/<defs>([\s\S]*?)<\/defs>/g)].flatMap((x) => [...x[1].matchAll(/<(rect|line|path|circle|polygon|image)\b[^>]*>/g)])) {
        if (attr(m[0], 'data-role') !== 'hatch') fail('map-geometry', where, `<${m[1]}> in <defs> that isn't the hatch`);
      }
      for (const m of body.matchAll(/<use\b[^>]*>/g)) {
        const href = attr(m[0], 'href');
        if (!href || !href.startsWith('#') || !new RegExp(`<g id="${href.slice(1)}"`).test(svg)) fail('map-geometry', where, `<use> of something not drawn in this map: ${href}`);
      }

      // map-links
      const anchors = [...svg.matchAll(/<a\b([^>]*)>\s*(<path\b[^>]*>)?/g)];
      if (kind !== 'overview' && anchors.length) fail('map-links', where, 'links on a map other than the home map');
      if (kind === 'overview') {
        const named = new Map();
        for (const m of anchors) {
          const tag = `<a${m[1]}>`, href = attr(tag, 'href'), label = attr(tag, 'aria-label');
          if (!href || !href.startsWith('/') || !pages.has(`${href.slice(1)}index.html`)) { fail('map-links', where, `link to ${href}, which isn't a built page`); continue; }
          if (!m[2]) {
            if (attr(tag, 'tabindex') !== '-1' || attr(tag, 'aria-hidden') !== 'true' || !/^\/base\//.test(href)) fail('map-links', where, `a link without a shape that's in the tab order: ${tag}`);
            continue;
          }
          named.set(attr(m[2], 'data-geo'), { href, label: label && decode(label) });
        }
        for (const c of communities) {
          const l = named.get(`communities:${c.slug}`);
          if (!l || l.href !== `/communities/${c.slug}/` || l.label !== c.name) fail('map-links', where, `${c.slug}'s shape isn't a link to its page named "${c.name}"`);
        }
        for (const b of BASES) {
          const l = named.get(`base:${b.code}`);
          if (!l || l.href !== `/base/${b.slug}/` || l.label !== b.short) fail('map-links', where, `${b.code}'s shape isn't a link to its page named "${b.short}"`);
        }
        if (!/\.map-svg a\.map-link:focus-visible\s*\{[^}]*outline:\s*2px solid/.test(css.site)) fail('map-links', 'site.css', 'no visible focus style for map links');
      }

      // map-bases
      const circles = [...svg.matchAll(/<circle\b[^>]*>/g)].map((m) => ({ role: attr(m[0], 'data-role'), base: attr(m[0], 'data-base'), cls: attr(m[0], 'class') ?? '', r: Number(attr(m[0], 'r')), cx: Number(attr(m[0], 'cx')), cy: Number(attr(m[0], 'cy')) }));
      const labelCls = (code) => attr(svg.match(new RegExp(`<text\\b[^>]*data-label="base:${code}"[^>]*>`))?.[0] ?? '', 'class');
      if (kind === 'base') {
        const me = Object.keys(BASE_SLUG).find((k) => page === `base/${BASE_SLUG[k]}/index.html`);
        const rings = circles.filter((c) => c.role === 'marker-ring');
        if (rings.length !== 1 || rings[0].base !== me || rings[0].r !== MARKER.ring) fail('map-bases', where, `ring on ${rings.map((r) => r.base).join(', ') || 'no base'}, not ${me}`);
        for (const c of circles.filter((x) => x.role === 'marker')) {
          const mine = c.base === me;
          if (mine && (!c.cls.includes('map-marker-focus') || c.r !== MARKER.focus || labelCls(c.base) !== 'map-label-focus')) fail('map-bases', where, `${me} isn't the larger marker with the bold label`);
          if (!mine && (!c.cls.includes('map-marker-muted') || c.r !== MARKER.muted || labelCls(c.base) !== 'map-label-base-muted')) fail('map-bases', where, `${c.base} isn't muted`);
        }
      } else if (circles.some((c) => c.role === 'marker-ring' || c.cls.includes('muted'))) fail('map-bases', where, 'a ring or a muted base on a map that isn\'t a base page\'s');

      // map-shields
      const groups = [...svg.matchAll(/<g class="(map-shields(?: map-shields-extra)?)">([\s\S]*?)<\/g>/g)];
      const bases = BASES.map((b) => G.base(b.code)), proj = projectionFrom(q);
      for (const [, gcls, inner] of groups) {
        const extra = gcls.includes('extra');
        for (const m of inner.matchAll(/<rect\b[^>]*data-role="shield"[^>]*>/g)) {
          const route = attr(m[0], 'data-route');
          if (PHONE_ROUTES.includes(route) === extra) fail('map-shields', where, `${route} is ${extra ? 'hidden on phones' : 'shown on phones'}`);
          const [x, y, w, h] = ['x', 'y', 'width', 'height'].map((k) => Number(attr(m[0], k)));
          const pts = boxPoints({ x, y, w, h });
          if (pts.some(([px, py]) => bases.some((f) => containsGeo(f, proj, px, py)))) fail('map-shields', where, `${route} sits on a base`);
          if (circles.some((c) => c.cx + c.r > x && c.cx - c.r < x + w && c.cy + c.r > y && c.cy - c.r < y + h)) fail('map-shields', where, `${route} sits on a base marker`);
          stats.shields[extra ? 'extra' : 'phone']++;
        }
      }
      if (!/\.map-shields-extra\s*\{\s*display:\s*none;?\s*\}/.test(css.site) || !/@media \(min-width: 720px\)\s*\{\s*\.map-shields-extra\s*\{\s*display:\s*inline;?\s*\}/.test(css.site)) fail('map-shields', 'site.css', 'the extra shields aren\'t hidden below 720 px');

      // map-tiers (base maps)
      if (kind === 'base') {
        const baseCode = Object.keys(BASE_SLUG).find((k) => page === `base/${BASE_SLUG[k]}/index.html`);
        const seen = new Map();
        for (const m of svg.matchAll(/<path\b[^>]*data-tier="[^"]*"[^>]*>/g)) {
          const t = attr(m[0], 'data-tier'), cls = attr(m[0], 'class') ?? '';
          if (!TIERS.includes(t)) fail('map-tiers', where, `unknown group "${t}"`);
          if (!cls.split(' ').includes(`map-tier-${t}`) || cls.split(' ').some((c) => /^map-tier-/.test(c) && c !== `map-tier-${t}`)) fail('map-tiers', where, `group ${t} is filled with "${cls}"`);
          const listed = (attr(m[0], 'data-communities') ?? '').split(' ').filter(Boolean);
          if (attr(m[0], 'data-geo') !== `communities:${listed.join(' ')}`) fail('map-tiers', where, `group ${t}: the shape drawn isn't the neighborhoods it lists`);
          for (const s of listed) {
            if (seen.has(s)) fail('map-tiers', where, `${s} shaded twice (${seen.get(s)} and ${t})`);
            seen.set(s, t);
          }
        }
        // The page's own cards: section id="tier-<group>" holding /communities/<slug>/ links.
        const cards = new Map();
        for (const m of html.matchAll(/<section[^>]*id="tier-([\w-]+)"[^>]*>([\s\S]*?)<\/section>/g)) {
          for (const a of m[2].matchAll(/href="\/communities\/([\w-]+)\//g)) cards.set(a[1], m[1]);
        }
        for (const c of communities) {
          const want = expectedTier(c.slug, baseCode);
          const got = seen.get(c.slug);
          stats.tiers++;
          if (!want) { if (got) fail('map-tiers', where, `${c.slug} shaded ${got} with no drive time`); continue; }
          if (got !== want) fail('map-tiers', where, `${c.slug}: map shades ${got ?? 'nothing'}, tierOf() gives ${want}`);
          if (cards.get(c.slug) !== want) fail('map-tiers', where, `${c.slug}: the page's card is under ${cards.get(c.slug) ?? 'no group'}, tierOf() gives ${want}`);
        }
        for (const s of seen.keys()) if (!bySlug.has(s)) fail('map-tiers', where, `unknown neighborhood ${s}`);
        const legend = fig ? [...fig[2].matchAll(/<li data-legend-tier="([^"]+)">[\s\S]*?<\/span>([^<]*)<\/li>/g)].map((m) => [m[1], decode(m[2]).trim()]) : [];
        if (legend.map((l) => l.join('=')).join('|') !== TIERS.map((t) => `${t}=${TIER_LABEL[t]}`).join('|')) fail('map-tiers', where, `legend ${JSON.stringify(legend)} isn't the four groups in order`);
      }

      // map-labels
      const scale = PHONE_WIDTH / WIDTH;
      const boxes = [];
      for (const m of svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
        const tag = `<text${m[1]}>`, cls = attr(tag, 'class'), size = Number(attr(tag, 'font-size'));
        const lines = m[2].includes('<tspan') ? [...m[2].matchAll(/<tspan[^>]*>([\s\S]*?)<\/tspan>/g)].map((t) => decode(t[1])) : [decode(m[2])];
        const label = `"${lines.join(' ')}"`;
        stats.labels++;
        const pair = LABEL_CLASSES[cls];
        if (!pair) { fail('map-labels', where, `${label} has class "${cls}", not a map label class`); continue; }
        if (!contrastPairs.includes(pair.join('|'))) fail('map-labels', where, `${cls}: --${pair[0]} on --${pair[1]} isn't in CONTRAST_PAIRS`);
        const rule = css.site.match(new RegExp(`\\.${cls}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
        const halo = /stroke:\s*none/.test(rule) ? pair[1] : (rule.match(/stroke:\s*var\(--([\w-]+)\)/)?.[1] ?? 'map-halo');
        if (!rule.includes(`fill: var(--${pair[0]})`) || (cls !== 'map-shield-text' && halo !== pair[1])) fail('map-labels', where, `${cls} isn't painted --${pair[0]} on --${pair[1]} in site.css`);
        if (!(size * scale >= MIN_LABEL_PX)) fail('map-labels', where, `${label} renders at ${(size * scale).toFixed(1)} px on a phone (needs ${MIN_LABEL_PX})`);
        const [bx, by, bw, bh] = (attr(tag, 'data-box') ?? '').split(',').map(Number);
        const bold = ['map-label-focus', 'map-label-base', 'map-shield-text'].includes(cls);
        if (![bx, by, bw, bh].every(Number.isFinite)) { fail('map-labels', where, `${label} has no box`); continue; }
        if (bw + 0.11 < Math.max(...lines.map((l) => textWidth(l, size, bold)))) fail('map-labels', where, `${label}: its box is narrower than its text`);
        if (bx < 0 || by < 0 || bx + bw > q.width || by + bh > q.height) fail('map-labels', where, `${label} runs off the map`);
        for (const b of boxes) if (bx < b.x + b.w && b.x < bx + bw && by < b.y + b.h && b.y < by + bh) fail('map-labels', where, `${label} overlaps ${b.label}`);
        boxes.push({ x: bx, y: by, w: bw, h: bh, label });
      }
    }
  }
}

function run(pages, css = { site: SITE_CSS, theme: THEME_CSS }) {
  const failures = [];
  const stats = { size: {}, paths: 0, tiers: 0, labels: 0, shields: { phone: 0, extra: 0 } };
  const f = (check, where, what) => failures.push({ check, where, what });
  checkPages(pages, f, stats, css);
  stats.palette = checkPalette(css.theme, f);
  return { failures, stats };
}

const pages = new Map(walk(DIST).map((f) => [relative(DIST, f), readFileSync(f, 'utf-8')]));
const CHECKS = ['map-pages', 'map-tiers', 'map-geometry', 'map-size', 'map-labels', 'map-a11y', 'map-links', 'map-bases', 'map-shields', 'map-palette'];

// --plant: each fault, in memory, must fail the check named.
const nbsd = 'base/naval-base-san-diego/index.html';
const PLANTS = {
  // Move one neighborhood into the next group on the NBSD map (shape and list both, so only the tier rule can catch it).
  tier: ['map-tiers', (p) => {
    const h = p.get(nbsd);
    const groups = [...h.matchAll(/<path\b[^>]*data-tier="[^"]*"[^>]*>/g)].map((m) => m[0]);
    const [a, b] = groups;
    const slug = attr(a, 'data-communities').split(' ')[0];
    const q = JSON.parse(attr(h.match(/<svg\b[^>]*class="map-svg"[^>]*>/)[0], 'data-proj'));
    const G = geos[GEO_FILE.overview], path = geoPath(projectionFrom(q)).digits(q.digits);
    const redo = (tag, list) => {
      const cs = list.map((s) => bySlug.get(s));
      return tag.replace(/ d="[^"]*"/, ` d="${path(G.communities(cs))}"`).replace(/data-geo="[^"]*"/, `data-geo="communities:${list.join(' ')}"`).replace(/data-communities="[^"]*"/, `data-communities="${list.join(' ')}"`);
    };
    const la = attr(a, 'data-communities').split(' ').filter((s) => s !== slug), lb = [...attr(b, 'data-communities').split(' '), slug].sort();
    p.set(nbsd, h.replace(a, redo(a, la)).replace(b, redo(b, lb)));
    return `${slug} moved from ${attr(a, 'data-tier')} to ${attr(b, 'data-tier')} on the NBSD map`;
  }],
  'tier-class': ['map-tiers', (p) => { p.set(nbsd, p.get(nbsd).replace('map-tier map-tier-under30', 'map-tier map-tier-30-45')); return 'NBSD under-30 group filled with the 30–44 color'; }],
  'hand-drawn': ['map-geometry', (p) => { p.set('index.html', p.get('index.html').replace('<path d=', '<path d="M10,10L60,10L35,50Z" class="map-land" /><path d=')); return 'a hand-drawn triangle on the home map'; }],
  'moved-path': ['map-geometry', (p) => { p.set('index.html', p.get('index.html').replace(/(data-geo="land"[^>]*>)|( d="M)(\d)/, (m, a, b, c) => (b ? ` d="M${Number(c) + 1}` : m))); return 'the first path on the home map nudged by one unit'; }],
  'other-file': ['map-geometry', (p) => { p.set('index.html', p.get('index.html').replace('data-geo-file="src/geo/sd_map_overview.topo.json"', 'data-geo-file="src/geo/hand_drawn.json"')); return 'the home map naming another geometry file'; }],
  polygon: ['map-geometry', (p) => { p.set('index.html', p.get('index.html').replace('<rect data-role="ocean"', '<polygon points="0,0 9,9 0,9" /><rect data-role="ocean"')); return 'a <polygon> on the home map'; }],
  size: ['map-size', (p) => { const h = p.get(nbsd); p.set(nbsd, h.replace('<desc', `<desc data-pad="${'x'.repeat(PAGE_BUDGET)}"`)); return 'the NBSD map padded past the budget'; }],
  'label-class': ['map-labels', (p) => { p.set('index.html', p.get('index.html').replace('class="map-label"', 'class="map-label-dim"')); return 'a label with a class outside the contrast pairs'; }],
  'label-small': ['map-labels', (p) => { p.set('index.html', p.get('index.html').replace(/(<text\b[^>]*font-size=")[\d.]+/, '$110')); return 'a 10-unit label'; }],
  'label-overlap': ['map-labels', (p) => {
    const h = p.get('index.html');
    const tags = [...h.matchAll(/<text\b[^>]*data-box="([^"]+)"/g)];
    const [ax, ay] = tags[0][1].split(','), [, , bw, bh] = tags[1][1].split(',');
    p.set('index.html', h.replace(`data-box="${tags[1][1]}"`, `data-box="${[ax, ay, bw, bh].join(',')}"`));
    return 'a second label moved onto the first on the home map';
  }],
  'no-desc': ['map-a11y', (p) => { p.set('index.html', p.get('index.html').replace(/<desc[\s\S]*?<\/desc>/, '')); return 'the home map without <desc>'; }],
  'palette-close': ['map-palette', (p, css) => { css.theme = css.theme.replace(/--map-tier-60plus: #[0-9A-F]{6}/i, '--map-tier-60plus: #D97A01'); return '60+ set nearly to 45–59'; }],
  'land-blue': ['map-palette', (p, css) => { css.theme = css.theme.replace(/--map-land: #[0-9A-F]{6}/i, '--map-land: #1D2949'); return 'the uncovered land back to navy'; }],
  'link-name': ['map-links', (p) => { p.set('index.html', p.get('index.html').replace(/(<a href="\/communities\/[^"]+\/") aria-label="[^"]*"/, '$1')); return 'a neighborhood link with no name'; }],
  'link-dead': ['map-links', (p) => { p.set('index.html', p.get('index.html').replace(/<a href="\/communities\/[^"]+\/"/, '<a href="/communities/nowhere/"')); return 'a link to a page that isn’t built'; }],
  'link-focus': ['map-links', (p, css) => { css.site = css.site.replace('.map-svg a.map-link:focus-visible { outline: 2px solid var(--link); outline-offset: 1px; }', ''); return 'no focus style for map links'; }],
  'base-ring': ['map-bases', (p) => { p.set(nbsd, p.get(nbsd).replace(/<circle data-role="marker-ring"[^>]*>/, '')); return 'the NBSD page without its ring'; }],
  'base-loud': ['map-bases', (p) => { p.set(nbsd, p.get(nbsd).replace('map-label-base-muted', 'map-label-base')); return 'another base’s label not muted on the NBSD page'; }],
  'shield-phone': ['map-shields', (p) => {
    const k = [...p.keys()].find((x) => /<g class="map-shields map-shields-extra"><rect/.test(p.get(x)));
    p.set(k, p.get(k).replace('<g class="map-shields map-shields-extra">', '<g class="map-shields">'));
    return `the extra shields on ${k.replace(/index\.html$/, '')} shown on phones`;
  }],
  'shield-on-base': ['map-shields', (p) => {
    const h = p.get(nbsd), c = h.match(/<circle data-role="marker" data-base="MIRAMAR" cx="([\d.]+)" cy="([\d.]+)"/);
    p.set(nbsd, h.replace(/(<rect data-role="shield"[^>]*?) x="[\d.]+" y="[\d.]+"/, `$1 x="${Number(c[1]) - 8}" y="${Number(c[2]) - 8}"`));
    return 'a shield moved onto MCAS Miramar';
  }],
  'locator-key': ['map-a11y', (p) => { const k = 'communities/oceanside/index.html'; p.set(k, p.get(k).replace(/(data-map-key[\s\S]*?, )\d+/, '$199')); return 'Oceanside’s key with the wrong minutes'; }],
  'no-map': ['map-pages', (p) => { const k = 'communities/oceanside/index.html'; p.set(k, p.get(k).replace(/<figure\b[^>]*data-map[\s\S]*?<\/figure>/, '')); return 'Oceanside without its locator'; }],
};

const plant = process.argv.includes('--plant') ? process.argv[process.argv.indexOf('--plant') + 1] : null;
if (plant) {
  const names = plant === 'all' ? Object.keys(PLANTS) : [plant];
  let caught = 0;
  console.log('\nMap checks, planted faults (in memory; nothing written)');
  for (const n of names) {
    const [check, fn] = PLANTS[n];
    const copy = new Map(pages), css = { site: SITE_CSS, theme: THEME_CSS };
    const what = fn(copy, css);
    const { failures } = run(copy, css);
    const hit = failures.filter((f) => f.check === check);
    if (hit.length) caught++;
    console.log(`  ${hit.length ? 'CAUGHT' : 'MISSED'}  ${n}: ${what} → ${check} ${hit.length ? `(${hit[0].what})` : 'passed'}`);
  }
  console.log(`  ${caught}/${names.length} caught\n`);
  process.exit(caught === names.length ? 0 : 1);
}

const { failures, stats } = run(pages);
console.log('\nMap checks');
for (const c of CHECKS) {
  const fs = failures.filter((f) => f.check === c);
  console.log(fs.length ? `  FAIL  ${c} (${fs.length})` : `  PASS  ${c}`);
  for (const f of fs.slice(0, 15)) console.log(`        ${f.where}: ${f.what}`);
  if (fs.length > 15) console.log(`        … and ${fs.length - 15} more`);
}
const kb = (n) => `${(n / 1000).toFixed(1)} KB`;
const sizeLine = Object.entries(stats.size).map(([k, rs]) => {
  const max = rs.reduce((a, b) => (b.bytes > a.bytes ? b : a));
  return `${k} ${rs.length} (largest ${kb(max.bytes)}, ${kb(max.gz)} gzipped: ${max.page.replace(/index\.html$/, '')})`;
}).join('; ');
console.log(`  maps: ${sizeLine}; budget ${kb(PAGE_BUDGET)} a page, ${kb(LOCATOR_BUDGET)} a locator`);
const pal = stats.palette;
if (pal) console.log(`  palette ${pal.tiers.join(' → ')}: neighbors ${pal.adjacent.map((x) => x.toFixed(2)).join(' / ')}:1; on land ${pal.onLand.map((x) => x.toFixed(2)).join(' / ')}; on ocean ${pal.onOcean.map((x) => x.toFixed(2)).join(' / ')}; land ${pal.land} vs ocean ${pal.landOcean.toFixed(2)}:1`);
console.log(`  shields: ${stats.shields.phone} on phones (${PHONE_ROUTES.join(', ')}), ${stats.shields.extra} more from 720 px`);
console.log(`  ${stats.paths} paths redrawn from the exported files, ${stats.tiers} neighborhood–base shadings checked against tierOf(), ${stats.labels} labels`);
if (failures.length) { console.log(`\n${failures.length} map check failure(s). Build failed.\n`); process.exit(1); }
console.log('');
