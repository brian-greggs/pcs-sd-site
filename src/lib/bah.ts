// 2026 BAH (Brian 2026-10-20: show the dollar figures; the rent-to-BAH ratio stays as a second reading).
// The only source is src/data/bah.json, DTMO's table as the data repo exports it, so every BAH figure on
// a page comes from there. Pages print them through src/components/BahLines.astro or the base page's
// table, marked up (data-bah-block, data-bah-label, data-bah) for the bah-figures check in
// scripts/check_principles.mjs, which compares each figure with bah.json.
import { getCollection } from 'astro:content';
import { BASES } from './bases';
import { PAY_BAND_ORDER } from './format';

export type BahRow = { year: number; mha: string; area: string; grade: string; pay_band: string; with_dependents: number; without_dependents: number };
export type BahArea = {
  mha: string; area: string; year: number; label: string; source_name: string; verified_on: string;
  bases: string[]; // slugs of the bases in this MHA
  rows: BahRow[];
};

// Grade order within a band: as DTMO's table lists them (E1…E9, W1…W5, O1E…O3E, O1…O6).
const GRADE_ORDER = ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'W1', 'W2', 'W3', 'W4', 'W5', 'O1E', 'O2E', 'O3E', 'O1', 'O2', 'O3', 'O4', 'O5', 'O6'];

export const bahLabel = (r: { year: number; area: string; mha: string }) => `${r.year} BAH, ${r.area} area (MHA ${r.mha})`;
export const bahKey = (r: { year: number; mha: string; grade: string }) => `${r.year}|${r.mha}|${r.grade}`;

export async function bahTable() {
  const rows = (await getCollection('bah')).map((r) => r.data)
    .sort((a, b) => PAY_BAND_ORDER.indexOf(a.pay_band) - PAY_BAND_ORDER.indexOf(b.pay_band) || GRADE_ORDER.indexOf(a.grade) - GRADE_ORDER.indexOf(b.grade));
  const mhaOfBase = Object.fromEntries((await getCollection('bases')).map((b) => [b.id, b.data.mha]));
  const areas: BahArea[] = [...new Set(rows.map((r) => r.mha))].sort().reverse().map((mha) => {
    const rs = rows.filter((r) => r.mha === mha);
    const years = new Set(rs.map((r) => r.year));
    if (years.size !== 1) throw new Error(`bah.json: ${mha} has rows for more than one year`);
    return {
      mha, area: rs[0].area, year: rs[0].year, label: bahLabel(rs[0]), source_name: rs[0].source_name, verified_on: rs[0].verified_on,
      bases: BASES.filter((b) => mhaOfBase[b.code] === mha).map((b) => b.slug), rows: rs,
    };
  });
  for (const b of BASES) if (!areas.some((a) => a.mha === mhaOfBase[b.code])) throw new Error(`bah.json has no rows for ${b.short}'s MHA ${mhaOfBase[b.code]}`);
  const areaOf = (code: string) => areas.find((a) => a.mha === mhaOfBase[code])!;
  // The most the two areas' with-dependents figures differ for any one grade, as a share of the lower one.
  const grades = [...new Set(rows.map((r) => r.grade))];
  const maxGapPct = Math.max(0, ...grades.map((g) => {
    const vs = rows.filter((r) => r.grade === g).map((r) => r.with_dependents);
    return vs.length > 1 ? (100 * (Math.max(...vs) - Math.min(...vs))) / Math.min(...vs) : 0;
  }));
  return { rows, areas, areaOf, mhaOfBase, maxGapPct };
}
