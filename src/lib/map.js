// Static maps (session 12): drawn at build time from src/geo/sd_map*.topo.json (Census boundaries, exported by the
// data repo's pull/pull_map_layers.py) and output as inline SVG. No tiles, no map library in the browser, nothing
// fetched. Plain JavaScript like tiers.js, so the component and scripts/check_maps.mjs share it.
//
// Projection: Lambert conformal conic on California State Plane Zone 6's parallels (32°47′, 33°53′) and central
// meridian (116°15′ W), the conformal projection surveyors use for San Diego County, fitted to each map's extent.
// Every <path> carries data-geo naming the TopoJSON features it was drawn from, and the <svg> carries data-proj
// with the projection's numbers, so the check can redraw each path from the exported file and compare.
import { geoConicConformal, geoPath, geoBounds } from 'd3-geo';
import { feature, merge, mesh } from 'topojson-client';
import { tierOf, TIER_LABEL } from './tiers.js';
import { advance, KERN_SLACK } from './fontMetrics.js';

export const PARALLELS = [32 + 47 / 60, 33 + 53 / 60];
export const ROTATE = [116 + 15 / 60, 0];
export const DIGITS = 1; // path coordinates to 0.1 unit
export const WIDTH = 360; // viewBox width; the figure is never narrower than 358 px (390 px screen less 16 px gutters)
export const MIN_LABEL_PX = 12; // smallest label as rendered at 358 px wide
export const PHONE_WIDTH = 358;
// Label classes and the theme tokens they're painted with (site.css). Each fill/halo pair is in the contrast check
// (scripts/check_principles.mjs CONTRAST_PAIRS); scripts/check_maps.mjs fails a label with any other class.
export const LABEL_CLASSES = {
  'map-label': ['map-label', 'map-halo'],
  'map-label-muted': ['map-label-muted', 'map-halo'],
  'map-label-base': ['map-label-base', 'map-halo'],
  'map-label-base-muted': ['map-label-muted', 'map-halo'],
  'map-label-focus': ['map-label-focus', 'map-halo'],
  'map-label-water': ['map-label-water', 'map-ocean'],
  'map-shield-text': ['map-shield-text', 'map-shield'],
};
export const FONT = { label: 12.5, base: 13, focus: 14.5, shield: 12.5 };
// Marker radii: a base, the base a page is about (with a ring around it), and the other bases on that page.
export const MARKER = { base: 4, focus: 6, ring: 10, muted: 3.2 };
// The freeway shields a phone shows; the rest only from 720 px up (site.css .map-shields-extra).
export const PHONE_ROUTES = ['I-5', 'I-15', 'I-8', 'SR-78'];
export const TIERS = ['under30', '30-45', '45-60', '60plus'];
// Short names for the map only (the cards and headings keep the full names).
export const BASE_LABEL = {
  NBSD: 'NBSD', MIRAMAR: 'MCAS Miramar', NASNI: 'North Island', NAB: 'NAB Coronado', NBPL: 'Point Loma',
  NMCSD: 'Naval Medical Ctr', MCRD: 'MCRD', PENDLETON: 'Camp Pendleton',
};
// Two exports of the same layers: "detail" (60 m) for the neighborhood locators, "overview" (250 m) for the
// county-wide maps. data-geo-file on each <svg> names the one it was drawn from. (The component imports the files;
// this module takes a topology as an argument, so the check can hand it the file it read itself.)
export const GEO_FILE = { detail: 'src/geo/sd_map.topo.json', overview: 'src/geo/sd_map_overview.topo.json' };

// Every feature a map can draw, from one topology. The check (scripts/check_maps.mjs) calls this too, with the
// file it read itself, to redraw what data-geo names.
export function geo(topo) {
  const zipGeoms = new Map(topo.objects.zcta.geometries.map((g) => [g.properties.zip, g]));
  const baseGeoms = new Map(topo.objects.bases.geometries.map((g) => [g.properties.code, g]));
  // land, mexico and countyline are one feature each (a one-member collection in the file).
  const one = (o) => { const f = feature(topo, o); return f.type === 'FeatureCollection' ? f.features[0] : f; };
  const zipsOf = (cs) => cs.flatMap((c) => c.zips.map((z) => {
    const g = zipGeoms.get(z);
    if (!g) throw new Error(`map: no polygon for zip ${z} (${c.slug})`);
    return g;
  }));
  return {
    land: () => one(topo.objects.land),
    mexico: () => one(topo.objects.mexico),
    countyline: () => one(topo.objects.countyline),
    roads: () => feature(topo, topo.objects.roads).features,
    road: (route) => feature(topo, topo.objects.roads).features.find((f) => f.properties.route === route),
    base: (code) => feature(topo, baseGeoms.get(code)),
    baseOutline: (code) => mesh(topo, baseGeoms.get(code)),
    basePoint: (code) => [baseGeoms.get(code).properties.label_lon, baseGeoms.get(code).properties.label_lat],
    // Neighborhoods are unions of their zips (shared arcs, so no seams); several at once give one shape.
    communities: (cs) => ({ type: 'Feature', properties: {}, geometry: merge(topo, zipsOf(cs)) }),
    // The lines between neighboring neighborhoods, each drawn once (not an edge between two zips of one neighborhood,
    // and not the outer edge, which the fill against the land and water already shows).
    borders: (all) => {
      const cs = [...all].sort((a, b) => a.slug.localeCompare(b.slug)); // the same lines whatever order they come in
      const owner = new Map(cs.flatMap((c) => c.zips.map((z) => [z, c.slug])));
      return mesh(topo, { type: 'GeometryCollection', geometries: zipsOf(cs) }, (x, y) => x !== y && owner.get(x.properties.zip) !== owner.get(y.properties.zip));
    },
  };
}

// The projection for a map: fitted to `extent` (a GeoJSON object) inside WIDTH × height with `pad` units of margin.
// Height follows the extent's shape, between minH and maxH; extra room goes to the margins.
export function makeProjection(extent, { pad = 10, minH = 240, maxH = 470 } = {}) {
  const p = geoConicConformal().parallels(PARALLELS).rotate(ROTATE);
  p.fitWidth(WIDTH - 2 * pad, extent);
  const [[x0, y0], [x1, y1]] = geoPath(p).bounds(extent);
  const height = Math.round(Math.min(maxH, Math.max(minH, y1 - y0 + 2 * pad)));
  p.fitExtent([[pad, pad], [WIDTH - pad, height - pad]], extent);
  // Draw from the rounded numbers written to data-proj, so the check rebuilds exactly this projection.
  const params = projParams(p, height);
  return { projection: projectionFrom(params), height, params };
}
// Meters of ground per map unit across the middle of a fitted projection (picks the level of detail: the 60 m export
// only where a unit is under DETAIL_BELOW_M, else the 250 m one).
export const DETAIL_BELOW_M = 100;
export function metersPerUnit(p, height) {
  const a = p.invert([WIDTH * 0.25, height / 2]), b = p.invert([WIDTH * 0.75, height / 2]);
  const rad = Math.PI / 180, R = 6371008.8;
  const d = 2 * R * Math.asin(Math.sqrt(Math.sin(((b[1] - a[1]) * rad) / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(((b[0] - a[0]) * rad) / 2) ** 2));
  return d / (WIDTH / 2);
}
export const projParams = (p, height) => ({
  parallels: PARALLELS, rotate: ROTATE, scale: round(p.scale(), 4), translate: p.translate().map((v) => round(v, 4)),
  width: WIDTH, height, digits: DIGITS,
});
// Rebuild a projection from data-proj (the check does this; the component uses the rounded numbers too, so both draw
// from exactly the same projection).
export const projectionFrom = (q) => geoConicConformal().parallels(q.parallels).rotate(q.rotate).scale(q.scale)
  .translate(q.translate).clipExtent([[0, 0], [q.width, q.height]]);
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

// --- Drive tiers ---------------------------------------------------------------------------------
// A neighborhood's tier at a base: tierOf() on the top of its 0700 drive range (the same rule as the base page's groups,
// the commute table and the plan).
export function communityTier(c, base, commute) {
  const mins = commute.filter((r) => r.base === base && c.zips.includes(r.zip)).map((r) => r.peak_am_min);
  return mins.length ? tierOf(Math.max(...mins)) : null;
}
export const TIER_LEGEND = TIER_LABEL; // the legend uses the base page's group names, word for word
export const TIER_PHRASE = { under30: 'under 30 minutes', '30-45': '30 to 44 minutes', '45-60': '45 to 59 minutes', '60plus': '60 minutes or more' };

// --- Text and labels -----------------------------------------------------------------------------
// Label widths from the real advance widths of the site's DM Sans (500 for labels, 700 for bold ones), read from the
// font files the pages load (fontMetrics.js), plus a little for kerning.
export function textWidth(s, size, bold = false) {
  const adv = advance(bold ? 700 : 500);
  let w = 0;
  for (const ch of s) w += adv(ch);
  return w * size * KERN_SLACK;
}
// Up to two lines, split at " / " (and a parenthetical dropped) so long names stack instead of running wide.
export function labelLines(name) {
  const n = name.replace(/\s*\(.*\)\s*$/, '');
  if (n.length <= 16 || !n.includes(' / ')) return [n];
  const parts = n.split(' / ');
  let best = [n], score = Infinity;
  for (let i = 1; i < parts.length; i++) {
    const a = parts.slice(0, i).join(' / ') + ' /', b = parts.slice(i).join(' / ');
    const s = Math.max(a.length, b.length);
    if (s < score) { score = s; best = [a, b]; }
  }
  return best;
}
// A label's box: its lines' glyph boxes (line spacing LINE_HEIGHT, each line the font's ascender to descender) and the
// 1.5-unit halo all round, centered on (x, y) vertically.
export const LINE_HEIGHT = 1.15;
const boxOf = (lines, size, bold, x, y, anchor) => {
  const w = Math.max(...lines.map((l) => textWidth(l, size, bold))) + 4; // + the halo
  const h = (LINE_HEIGHT * (lines.length - 1) + advance(bold ? 700 : 500).em) * size + 3;
  const x0 = anchor === 'start' ? x - 2 : anchor === 'end' ? x - w + 2 : x - w / 2;
  return { x: x0, y: y - h / 2, w, h };
};
// Nine points on a box (corners, edge middles, center): what "this box sits on a shape" is tested with, here and in the check.
export const boxPoints = (b) => [0, 0.5, 1].flatMap((fx) => [0, 0.5, 1].map((fy) => [b.x + fx * b.w, b.y + fy * b.h]));
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (b, W, H, m = 2) => b.x >= m && b.y >= m && b.x + b.w <= W - m && b.y + b.h <= H - m;

// Points: is (x, y) inside a projected polygon set (rings as [[x,y],…], even-odd)?
function ringsOf(geometry, projection) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  return polys.map((rings) => rings.map((r) => r.map((c) => projection(c)).filter(Boolean)));
}
function contains(polys, x, y) {
  let hit = false;
  for (const rings of polys) for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
  }
  return hit;
}
function edgeDistance(polys, x, y) {
  let d = Infinity;
  for (const rings of polys) for (const r of rings) for (let i = 1; i < r.length; i++) {
    const [ax, ay] = r[i - 1], [bx, by] = r[i];
    const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
    const t = l ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l)) : 0;
    d = Math.min(d, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return d;
}
// Is (x, y) on the map inside this feature? (Projected rings cached per feature and projection.)
const ringCache = new WeakMap();
export function containsGeo(f, projection, x, y) {
  let byProj = ringCache.get(f);
  if (!byProj) ringCache.set(f, (byProj = new Map()));
  if (!byProj.has(projection)) byProj.set(projection, ringsOf(f.geometry, projection));
  return contains(byProj.get(projection), x, y);
}
// Points along a road on the map, about every `step` units (for placing its shield).
export function linePoints(f, projection, step = 12) {
  const g = f.geometry;
  const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
  const out = [];
  for (const l of lines) {
    let last = null;
    for (const c of l) {
      const p = projection(c);
      if (!p) continue;
      if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) >= step) { out.push(p); last = p; }
    }
  }
  // Order along the route: by the route's main direction, so "the middle" means the middle of what's on the map.
  const xs = out.map((p) => p[0]), ys = out.map((p) => p[1]);
  const wide = Math.max(...xs) - Math.min(...xs) > Math.max(...ys) - Math.min(...ys);
  return out.sort((a, b) => (wide ? a[0] - b[0] : a[1] - b[1]));
}

// The point inside a shape farthest from its edges (a grid search; good enough for a label anchor), within the frame.
// `covered(x, y)` marks points hidden under something drawn on top (a base), which a label shouldn't sit on.
export function anchorPoint(geometry, projection, W, H, covered = () => false) {
  const polys = ringsOf(geometry, projection);
  const pts = polys.flat(2);
  if (!pts.length) return null;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const [x0, x1] = [Math.max(0, Math.min(...xs)), Math.min(W, Math.max(...xs))];
  const [y0, y1] = [Math.max(0, Math.min(...ys)), Math.min(H, Math.max(...ys))];
  let best = null;
  const step = Math.max(1.5, Math.min(x1 - x0, y1 - y0) / 14);
  for (let x = x0 + step / 2; x < x1; x += step) for (let y = y0 + step / 2; y < y1; y += step) {
    if (!contains(polys, x, y) || covered(x, y)) continue;
    const d = edgeDistance(polys, x, y);
    if (!best || d > best.d) best = { x, y, d };
  }
  return best;
}

// Places labels in priority order; a label that can't be placed without touching another label, a marker or the frame
// edge is left off (required labels throw, so a build can't ship a base without its name).
export class Labeler {
  constructor(W, H) { this.W = W; this.H = H; this.boxes = []; this.placed = []; this.dropped = []; }
  block(box) { this.boxes.push(box); }
  // A half-unit gap all round, so boxes rounded to 0.1 for data-box still don't touch.
  free(box) { const g = { x: box.x - 0.5, y: box.y - 0.5, w: box.w + 1, h: box.h + 1 }; return inside(box, this.W, this.H) && !this.boxes.some((b) => overlaps(b, g)); }
  // candidates: [{x, y, anchor}] in order of preference
  place({ lines, cls, size, bold = false, candidates, required = false, leaderFrom = null, id, test = null, pad = 0 }) {
    for (const c of candidates) {
      const t = boxOf(lines, size, bold, c.x, c.y, c.anchor ?? 'middle');
      const box = { x: t.x - pad, y: t.y - pad / 2, w: t.w + 2 * pad, h: t.h + pad };
      if (!this.free(box) || (test && !test(box))) continue;
      // A leader may leave its own marker's box (the one around leaderFrom), not cross any other.
      const own = (b) => leaderFrom[0] >= b.x && leaderFrom[0] <= b.x + b.w && leaderFrom[1] >= b.y && leaderFrom[1] <= b.y + b.h;
      if (leaderFrom && c.leader && this.boxes.some((b) => !own(b) && segmentHitsBox(leaderFrom, nearestOnBox(leaderFrom, box), b))) continue;
      this.boxes.push(box);
      const label = { lines, cls, size, bold, x: round(c.x, 1), y: round(c.y, 1), anchor: c.anchor ?? 'middle', box, id };
      if (leaderFrom && c.leader) label.leader = [leaderFrom, nearestOnBox(leaderFrom, box)].map((p) => p.map((v) => round(v, 1)));
      this.placed.push(label);
      return label;
    }
    if (required) throw new Error(`map: no room for the label "${lines.join(' ')}"`);
    this.dropped.push(lines.join(' '));
    return null;
  }
}
const nearestOnBox = ([x, y], b) => [Math.max(b.x, Math.min(x, b.x + b.w)), Math.max(b.y, Math.min(y, b.y + b.h))];
function segmentHitsBox([ax, ay], [bx, by], b) {
  for (let t = 0.15; t < 0.9; t += 0.05) {
    const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
    if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return true;
  }
  return false;
}
// Around a point: right, left, above, below, then further out at eight angles with a leader line.
export function aroundPoint([x, y], r0 = 7) {
  const out = [
    { x: x + r0, y, anchor: 'start' }, { x: x - r0, y, anchor: 'end' },
    { x, y: y - r0 - 6, anchor: 'middle' }, { x, y: y + r0 + 6, anchor: 'middle' },
  ];
  for (const r of [20, 32, 46, 62, 80, 100, 120]) for (let k = 0; k < 24; k++) {
    const a = (k / 24) * 2 * Math.PI;
    const cx = x + r * Math.cos(a), cy = y + r * Math.sin(a);
    out.push({ x: cx, y: cy, anchor: Math.cos(a) > 0.35 ? 'start' : Math.cos(a) < -0.35 ? 'end' : 'middle', leader: true });
  }
  return out;
}
// Near a point, without a leader: centered, then nudged a little each way.
export function nearPoint([x, y]) {
  const out = [{ x, y }];
  for (const r of [5, 9, 13]) for (const [dx, dy] of [[0, -1], [0, 1], [1, 0], [-1, 0], [1, -1], [-1, -1], [1, 1], [-1, 1]]) out.push({ x: x + dx * r * 1.6, y: y + dy * r });
  return out;
}

export { geoPath, geoBounds };
