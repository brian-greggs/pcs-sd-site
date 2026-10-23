// Advance widths of the site's own DM Sans (the @fontsource WOFF files the pages load), so map labels are placed by
// their real width, not a guess. Read once at build time; plain JavaScript so scripts/check_maps.mjs uses the same.
// Kerning isn't applied; KERN_SLACK covers it.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

export const KERN_SLACK = 1.03;
const FILE = (weight) => join(process.cwd(), 'node_modules', '@fontsource', 'dm-sans', 'files', `dm-sans-latin-${weight}-normal.woff`);

function tables(buf) {
  if (buf.toString('latin1', 0, 4) !== 'wOFF') throw new Error('fontMetrics: not a WOFF file');
  const n = buf.readUInt16BE(12), out = {};
  for (let i = 0; i < n; i++) {
    const e = 44 + i * 20;
    const tag = buf.toString('latin1', e, e + 4), off = buf.readUInt32BE(e + 4), comp = buf.readUInt32BE(e + 8), orig = buf.readUInt32BE(e + 12);
    const raw = buf.subarray(off, off + comp);
    out[tag] = comp < orig ? inflateSync(raw) : raw;
  }
  return out;
}
// Unicode code point → glyph id, from the cmap's Windows Unicode subtable (format 4 or 12).
function cmapOf(t) {
  const n = t.readUInt16BE(2);
  for (let i = 0; i < n; i++) {
    const pid = t.readUInt16BE(4 + i * 8), eid = t.readUInt16BE(6 + i * 8), off = t.readUInt32BE(8 + i * 8);
    if (!((pid === 3 && (eid === 1 || eid === 10)) || pid === 0)) continue;
    const fmt = t.readUInt16BE(off);
    if (fmt === 4) {
      const seg = t.readUInt16BE(off + 6) / 2, ends = off + 14, starts = ends + seg * 2 + 2, deltas = starts + seg * 2, ranges = deltas + seg * 2;
      return (cp) => {
        for (let s = 0; s < seg; s++) {
          if (cp > t.readUInt16BE(ends + s * 2)) continue;
          const start = t.readUInt16BE(starts + s * 2);
          if (cp < start) return 0;
          const ro = t.readUInt16BE(ranges + s * 2), delta = t.readInt16BE(deltas + s * 2);
          if (!ro) return (cp + delta) & 0xffff;
          const g = t.readUInt16BE(ranges + s * 2 + ro + (cp - start) * 2);
          return g ? (g + delta) & 0xffff : 0;
        }
        return 0;
      };
    }
    if (fmt === 12) {
      const groups = t.readUInt32BE(off + 12);
      return (cp) => {
        for (let g = 0; g < groups; g++) {
          const o = off + 16 + g * 12, a = t.readUInt32BE(o), b = t.readUInt32BE(o + 4);
          if (cp >= a && cp <= b) return t.readUInt32BE(o + 8) + cp - a;
        }
        return 0;
      };
    }
  }
  throw new Error('fontMetrics: no Unicode cmap');
}
const cache = new Map();
// Width of one character as a share of the font size (the .notdef width for a character the subset lacks).
export function advance(weight) {
  if (cache.has(weight)) return cache.get(weight);
  const f = FILE(weight);
  if (!existsSync(f)) throw new Error(`fontMetrics: ${f} not found (npm ci?)`);
  const t = tables(readFileSync(f));
  const upem = t.head.readUInt16BE(18), nh = t.hhea.readUInt16BE(34), glyph = cmapOf(t.cmap);
  const adv = (g) => t.hmtx.readUInt16BE(Math.min(g, nh - 1) * 4) / upem;
  const fn = (ch) => adv(glyph(ch.codePointAt(0)));
  // The glyph box a browser draws a line in: ascender to descender (hhea), as a share of the font size.
  fn.em = (t.hhea.readInt16BE(4) - t.hhea.readInt16BE(6)) / upem;
  cache.set(weight, fn);
  return fn;
}
