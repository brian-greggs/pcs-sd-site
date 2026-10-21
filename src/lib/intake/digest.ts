// The data the intake rules run on, built at build time from the same collections
// the pages use and embedded in /plan/ as JSON. The only dollar figures are the BAH
// table (`bah`, from src/data/bah.json, Brian 2026-10-20), which the base pages show
// in full; no rent dollar figure. Every value here is shown on a page the plan cites.
import { getCollection, getEntry } from 'astro:content';
import { BASES, GROUP_BASES, PENDLETON_UNTIED_NOTE, drives } from '../bases';
import { baseHousingAreas, parseWait } from '../baseHousing';
import { PAY_BAND_ORDER } from '../format';
import { provenance } from '../prov';
import { bahTable } from '../bah';
import { sequenceData } from '../sequenceData';
import { TIMELINE_PHASE, citeDates } from '../sequence.js';

// Outbound links a rule can cite (each keeps its incentive label and verified date).
const LINK_IDS = [
  'slo-navy-san-diego', 'slo-mcas-miramar', 'interstate-compact-military-children',
  'ymca-childcare-resource-service', 'militarychildcare-request-care',
  'mos-msep', 'dca-military-expedited-licensure', 'dca-military-temporary-licensure', 'dca-federal-license-portability',
];

type Drives = Record<string, { lo: number; hi: number; tier: string }>;
const driveMap = async (zips: string[]): Promise<Drives> =>
  Object.fromEntries((await drives(zips)).map((d) => [d.code, { lo: d.lo, hi: d.hi, tier: d.tier }]));

export async function intakeDigest() {
  const { asOf } = await provenance();
  const ratios = (await getCollection('rentToBah')).map((r) => r.data);
  const ownership = (await getCollection('ownership')).map((r) => r.data);
  const care = (await getCollection('childcare')).map((r) => r.data);
  const schools = (await getCollection('schools')).map((r) => r.data);
  const bahT = await bahTable();

  const neighborhoods = await Promise.all((await getCollection('communities')).map(async ({ data: c }) => {
    // Ratios by duty-station MHA (the reader's base decides which; QUESTIONS 62), then band and bedrooms:
    // the range across the neighborhood's zips, as the page's table shows it.
    const rs = ratios.filter((r) => c.zips.includes(r.zip));
    const bandRatios = Object.fromEntries(bahT.areas.map(({ mha }) => [mha, Object.fromEntries(PAY_BAND_ORDER.map((band) => [band, Object.fromEntries([2, 3, 4].flatMap((br) => {
      const xs = rs.filter((r) => r.mha === mha && r.pay_band === band && r.bedrooms === br);
      return xs.length ? [[br, [Math.min(...xs.map((r) => r.ratio_low_pct)), Math.max(...xs.map((r) => r.ratio_high_pct))]]] : [];
    }))]))]));
    // Same wording rule as the neighborhood page's Cost summary.
    const cfd = new Set(ownership.filter((o) => o.community_slug === c.slug).map((o) => o.has_cfd));
    const mello = !cfd.size ? 'unmatched' : cfd.has('unknown') || cfd.has('mixed') ? 'check' : cfd.has('Y') ? 'charge' : 'none';
    const cs = care.filter((r) => c.zips.includes(r.zip));
    const sum = (k: 'centers' | 'centers_infant' | 'large_fcc_homes') => cs.reduce((n, r) => n + r[k], 0);
    return {
      slug: c.slug, name: c.name,
      drives: await driveMap(c.zips),
      ratios: bandRatios,
      mello,
      care: { centers: sum('centers'), infant: sum('centers_infant'), homes: sum('large_fcc_homes') },
      districts: [...new Set(schools.filter((s) => c.zips.includes(s.zip) && s.charter === 'N').map((s) => s.district))],
    };
  }));
  neighborhoods.sort((a, b) => a.name.localeCompare(b.name));

  const districts = Object.fromEntries((await getCollection('districts')).map((d) => [d.id, d.data.boundary_url]));

  // BAH by MHA, as the base pages' tables show it: [with, without dependents] per grade, by band.
  const bah = Object.fromEntries(bahT.areas.map((a) => [a.mha, {
    year: a.year, area: a.area, verified_on: a.verified_on,
    grades: a.rows.map((r) => ({ grade: r.grade, band: r.pay_band, with: r.with_dependents, without: r.without_dependents })),
  }]));

  const { areas, month, verifiedOn } = await baseHousingAreas();
  const areaRows = await Promise.all(areas.filter((a) => a.has_page).map(async (a) => {
    // Pet policy per community, as the area page shows it: the wait list's printed policy wins, else LMH's
    // page. Kept per community (with where it comes from) so the plan can name communities and date each line.
    const pets: { community: string; policy: string; from: 'list' | 'lmh' }[] = [];
    const limits: string[] = [];
    for (const m of a.members) {
      const printed = [...new Set(a.waits.filter((w) => w.community_slugs.includes(m.id)).map((w) => w.pet_policy).filter(Boolean))];
      if (printed.length) {
        for (const t of printed) pets.push({ community: m.community, policy: t.replace(/\bNO PETS\b/, 'No pets').replace(/\bPETS\b/, 'pets'), from: 'list' });
        limits.push(...printed);
      } else if (m.pet_policy === 'pet-friendly (stated)') pets.push({ community: m.community, policy: 'pets allowed (LMH page, no details)', from: 'lmh' });
    }
    return {
      id: a.id, name: a.name, base_group: a.base_group,
      drives: await driveMap(a.facts_zips),
      waitsInData: a.base_group !== 'PENDLETON',
      lmhVintage: a.members[0].vintage, // the date the area page gives its wait-times section when there's no wait list
      waits: a.waits.map((w) => {
        const s = parseWait(w.wait_time_stated);
        return { band: w.rank_band, br: Number(w.bedrooms), lo: s ? s[0] : null, hi: s ? s[1] : null };
      }),
      communities: a.members.length,
      pets,
      petLimits: [...new Set(limits)],
    };
  }));

  const links = Object.fromEntries(await Promise.all(LINK_IDS.map(async (id) => {
    const l = await getEntry('links', id);
    if (!l) throw new Error(`intake digest: no link "${id}" in src/data/links.json`);
    return [id, { title: l.data.title, url: l.data.url, incentive: l.data.incentive, verified_on: l.data.verified_on }];
  })));
  const rule = (await getEntry('housingRules', 'bedroom-entitlement'))!.data;
  if (!links[rule.link_id]) {
    const l = (await getEntry('links', rule.link_id))!;
    links[rule.link_id] = { title: l.data.title, url: l.data.url, incentive: l.data.incentive, verified_on: l.data.verified_on };
  }

  // The move sequence's steps for the phases Q3 can open on (src/lib/sequence.js, TIMELINE_PHASE), as the
  // sequence pages show them: the step, its deadline, its "Not yet confirmed" line and its date line. `who` is
  // applies_to reduced to what the answers can decide (vehicles and PPM aren't asked, so those steps always show).
  const planPhases = new Set(Object.values(TIMELINE_PHASE));
  const sequence = (await sequenceData()).steps.filter((s) => planPhases.has(s.phase)).map((s) => ({
    id: s.id, phase: s.phase, order: s.order, step: s.step, deadline: s.deadline, unconfirmed: s.unconfirmed,
    who: {
      bases: s.applies_to.base === 'all' ? null : s.applies_to.base,
      housing: s.applies_to.housing_choice === 'base_housing',
      kids: s.applies_to.kids === 'yes',
      family: s.applies_to.dependents === 'yes',
      pets: s.applies_to.pets === 'yes',
    },
    dates: citeDates(s),
  }));

  return {
    sequence,
    bases: BASES.map((b) => ({ code: b.code, slug: b.slug, short: b.short, mha: bahT.mhaOfBase[b.code] })),
    bah,
    groupBases: GROUP_BASES,
    bands: PAY_BAND_ORDER,
    neighborhoods,
    districts,
    areas: areaRows,
    links,
    bedroomRule: { link_id: rule.link_id, officer_section_empty: rule.officer_section_empty },
    // The Camp Pendleton base page's line above the untied areas, and the date its section gives it.
    pendletonUntied: { text: PENDLETON_UNTIED_NOTE.text, written: PENDLETON_UNTIED_NOTE.written },
    dates: {
      commute: asOf('commute'),
      ratio: asOf('rent_to_bah'),
      bah: asOf('bah'),
      ownership: asOf('ownership'),
      schools: asOf('schools'),
      childcare: asOf('childcare'),
      waits: `CNRSW estimate, ${month} · verified ${verifiedOn}`,
      bedroomRule: `CNIC Applying for Housing page, retrieved ${rule.verified_on}`,
      month,
    },
  };
}
