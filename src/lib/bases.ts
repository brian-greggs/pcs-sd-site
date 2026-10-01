// The eight bases a family can report to, in home-page order, with the URL slug
// for /base/<slug>/. The code matches the commute data; the location line is ours
// (geography only, no facts that need a date).
import { getCollection } from 'astro:content';

export const BASES = [
  { code: 'NBSD', slug: 'naval-base-san-diego', short: 'Naval Base San Diego', location: '32nd Street, on the bay south of downtown' },
  { code: 'MIRAMAR', slug: 'miramar', short: 'MCAS Miramar', location: 'Off I-15, north of Kearny Mesa' },
  { code: 'NASNI', slug: 'north-island', short: 'NAS North Island', location: 'Coronado, across the bay from downtown' },
  { code: 'NAB', slug: 'naval-amphibious-base', short: 'Naval Amphibious Base Coronado', location: 'Silver Strand, south of Coronado' },
  { code: 'NBPL', slug: 'point-loma', short: 'Naval Base Point Loma', location: 'Point Loma, off Rosecrans Street' },
  { code: 'NMCSD', slug: 'naval-medical-center', short: 'Naval Medical Center San Diego', location: 'Balboa Park, next to downtown' },
  { code: 'MCRD', slug: 'mcrd', short: 'MCRD San Diego', location: 'Beside the airport, off Pacific Highway' },
  { code: 'PENDLETON', slug: 'camp-pendleton', short: 'Camp Pendleton', location: 'Oceanside, about 40 miles north of downtown' },
] as const;
export type BaseCode = (typeof BASES)[number]['code'];
export const baseByCode = (code: string) => BASES.find((b) => b.code === code)!;
export const baseBySlug = (slug: string) => BASES.find((b) => b.slug === slug);

// Which bases each base housing group serves (base_group in base_housing_areas.json).
export const GROUP_BASES: Record<string, BaseCode[]> = {
  MIRAMAR: ['MIRAMAR'],
  NBSD: ['NBSD'],
  NBPL: ['NBPL'],
  CORONADO: ['NASNI', 'NAB'],
  PENDLETON: ['PENDLETON'],
  NONE: [],
};
const NAVY: BaseCode[] = ['NBSD', 'NASNI', 'NAB', 'NBPL', 'NMCSD'];

export type Drive = { code: BaseCode; lo: number; hi: number; tier: string };

// 0700 drive from a set of zips to every base: the range across the zips, nearest first.
export async function drives(zips: string[]): Promise<Drive[]> {
  const rows = (await getCollection('commute')).map((r) => r.data).filter((r) => zips.includes(r.zip));
  return BASES.map((b) => {
    const rs = rows.filter((r) => r.base === b.code).sort((x, y) => x.peak_am_min - y.peak_am_min);
    return rs.length ? { code: b.code, lo: rs[0].peak_am_min, hi: rs.at(-1)!.peak_am_min, tier: rs[0].tier } : null;
  }).filter((d): d is Drive => !!d).sort((a, b) => a.lo - b.lo);
}

export const minutes = (d: { lo: number; hi: number }) => (d.lo === d.hi ? `${d.lo} min` : `${d.lo}–${d.hi} min`);

// One line for a commute summary: the chosen base, the nearest if different, then the Navy bases as a range.
export function commuteSummary(ds: Drive[], chosen: BaseCode) {
  const pick = ds.find((d) => d.code === chosen);
  const nearest = ds[0];
  if (!pick || !nearest) return 'No 0700 drive times in our data';
  const parts = [`${baseByCode(pick.code).short} ${minutes(pick)}`];
  if (nearest.code !== pick.code) parts.push(`nearest: ${baseByCode(nearest.code).short} ${minutes(nearest)}`);
  const navy = ds.filter((d) => NAVY.includes(d.code) && d.code !== pick.code && d.code !== nearest.code);
  if (navy.length) parts.push(`Navy bases ${minutes({ lo: Math.min(...navy.map((d) => d.lo)), hi: Math.max(...navy.map((d) => d.hi)) })}`);
  return parts.join(' · ');
}

// Tier chips on the base pages: [30, 45), [45, 60), 60 and up.
export const TIERS = [
  { key: 'under30', label: 'Under 30 min', tone: 'blue' },
  { key: '30-45', label: '30–44 min', tone: 'mauve' },
  { key: '45-60', label: '45–59 min', tone: 'gold' },
  { key: '60plus', label: '60 min or more', tone: 'gold' },
] as const;
