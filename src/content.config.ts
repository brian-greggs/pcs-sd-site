// Content collections. Every exported data file in src/data/ has a schema here,
// and a bad row fails the build.
//
// Astro's built-in file() loader only logs a warning for an unreadable file or
// a row with no id and carries on, so the data files use strictJson() instead:
// it throws on a missing file, bad JSON, a missing id or a duplicate id, and
// schema errors throw as usual.
import { defineCollection, type Loader } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

function strictJson(name: string): Loader {
  return {
    name: `strict-json:${name}`,
    load: async ({ store, parseData, config, watcher }) => {
      const url = new URL(`src/data/${name}.json`, config.root);
      const path = fileURLToPath(url);
      const sync = async () => {
        const rows = JSON.parse(await readFile(path, 'utf-8'));
        if (!Array.isArray(rows) || rows.length === 0) {
          throw new Error(`src/data/${name}.json: expected a non-empty array`);
        }
        const seen = new Set<string>();
        store.clear();
        for (const raw of rows) {
          const id = String(raw.id ?? raw.slug ?? '');
          if (!id) throw new Error(`src/data/${name}.json: row without id: ${JSON.stringify(raw).slice(0, 200)}`);
          if (seen.has(id)) throw new Error(`src/data/${name}.json: duplicate id "${id}"`);
          seen.add(id);
          store.set({ id, data: await parseData({ id, data: raw }) });
        }
      };
      await sync();
      watcher?.add(path);
      watcher?.on('change', (changed) => {
        if (changed === path) sync();
      });
    },
  };
}

// Every row carries these two (Principle 2).
const dated = {
  vintage: z.string().min(1),
  verified_on: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, 'verified_on must be YYYY-MM or YYYY-MM-DD'),
};
const zip = z.string().regex(/^9\d{4}$/);
const baseCode = z.enum(['NBSD', 'NASNI', 'NAB', 'NBPL', 'NMCSD', 'MIRAMAR', 'MCRD', 'PENDLETON']);
const mha = z.enum(['CA038', 'CA024']); // the two MHAs our bases use (San Diego, Camp Pendleton)
const payBand = z.enum(['E1–E4', 'E5–E6', 'E7–E9', 'W1–W5', 'O1–O3E', 'O1–O3', 'O4–O6']);
const pct = z.number().min(0).max(100).nullable();
const minutes = z.number().min(0).max(240).nullable();
const urlOrBlank = z.union([z.url(), z.literal('')]);
const text = z.string().nullable();

const communities = defineCollection({
  loader: strictJson('communities'),
  schema: z.object({
    slug: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string().min(1),
    zips: z.array(zip).min(1),
    corridor: z.string().min(1),
    ...dated,
  }),
});

const bases = defineCollection({
  loader: strictJson('bases'),
  schema: z.object({ installation: z.string().min(1), gate: z.string().min(1), mha, ...dated }),
});

// DTMO's BAH table for the MHAs our bases use (Brian 2026-10-20). Every BAH figure a page or
// plan line prints comes from here (src/lib/bah.ts); scripts/check_principles.mjs checks it.
const bah = defineCollection({
  loader: strictJson('bah'),
  schema: z.object({
    year: z.number().int().min(2026).max(2100),
    mha,
    mha_name: z.string().min(1),
    area: z.string().min(1),
    grade: z.string().regex(/^[EOW]\d+E?$/),
    pay_band: payBand,
    with_dependents: z.number().int().min(1000).max(15000),
    without_dependents: z.number().int().min(1000).max(15000),
    source_name: z.string().min(1),
    source_url: z.url(),
    ...dated,
  }).refine((r) => r.without_dependents <= r.with_dependents, 'without dependents is more than with'),
});

const commute = defineCollection({
  loader: strictJson('commute'),
  schema: z.object({
    zip,
    base: baseCode,
    peak_am_min: z.number().int().min(1).max(240),
    typical_low_min: z.number().int().min(1).max(240).nullable(), // blank on a few very short trips
    typical_high_min: z.number().int().min(1).max(300).nullable(),
    osrm_miles: z.number().nullable(),
    tier: z.enum(['under30', '30-45', '45-60', '60plus']),
    ...dated,
  }).refine((r) => r.typical_low_min == null || r.typical_high_min == null || r.typical_low_min <= r.typical_high_min, 'typical range is inverted'),
});

const rent = defineCollection({
  loader: strictJson('rent'),
  schema: z.object({
    zip,
    fy27_0br: z.number().int().nullable(),
    fy27_1br: z.number().int().nullable(),
    fy27_2br: z.number().int().nullable(),
    fy27_3br: z.number().int().nullable(),
    fy27_4br: z.number().int().nullable(),
    safmr_metro_default: z.boolean(),
    acs_median_gross_rent: z.number().int().nullable(),
    acs_median_home_value: z.number().int().nullable(),
    zillow_url: z.url(),
    ...dated,
  }),
});

const rentToBah = defineCollection({
  loader: strictJson('rent_to_bah'),
  schema: z.object({
    zip,
    pay_band: payBand,
    bedrooms: z.union([z.literal(2), z.literal(3), z.literal(4)]),
    ratio_low_pct: z.number().int().min(20).max(400),
    ratio_high_pct: z.number().int().min(20).max(400),
    dependents: z.literal('with'),
    mha, // the zip's own MHA, which the ratio divides by
    ...dated,
  }).refine((r) => r.ratio_low_pct <= r.ratio_high_pct, 'ratio range is inverted'),
});

const ownership = defineCollection({
  loader: strictJson('ownership'),
  schema: z.object({
    community_slug: z.string(),
    subarea: z.string(), // blank when the community isn't split
    jurisdiction: z.string(),
    has_cfd: z.enum(['Y', 'N', 'mixed', 'unknown']),
    confidence: z.enum(['high', 'medium', 'low']),
    ...dated,
  }),
});

const schools = defineCollection({
  loader: strictJson('schools'),
  schema: z.object({
    district: z.string().min(1),
    school: z.string().min(1),
    city: z.string(),
    zip,
    level: z.enum(['elementary', 'middle', 'high', 'k12']),
    grades: z.string(),
    charter: z.enum(['Y', 'N']),
    magnet: z.enum(['Y', 'N', '']),
    virtual: z.string(),
    ela_dfs_statuslevel: z.number().int().min(1).max(5).nullable(),
    math_dfs_statuslevel: z.number().int().min(1).max(5).nullable(),
    chronic_abs_pct: pct,
    caaspp_ela_pct_met: pct,
    caaspp_math_pct_met: pct,
    greatschools_url: urlOrBlank,
    ...dated,
  }),
});

const districts = defineCollection({
  loader: strictJson('districts'),
  schema: z.object({
    website: urlOrBlank,
    boundary_url: urlOrBlank,
    transfer_url: urlOrBlank,
    n_elementary: z.number().int().nullable(),
    n_middle: z.number().int().nullable(),
    n_high: z.number().int().nullable(),
    n_k12: z.number().int().nullable(),
    ...dated,
  }),
});

const count = z.number().int().min(0);
const childcare = defineCollection({
  loader: strictJson('childcare'),
  schema: z.object({
    zip,
    centers: count,
    center_capacity: count,
    centers_infant: count,
    centers_preschool: count,
    centers_school_age: count,
    large_fcc_homes: count,
    large_fcc_capacity: count,
    ...dated,
  }),
});

const baseHousing = defineCollection({
  loader: strictJson('base_housing'),
  schema: z.object({
    community: z.string().min(1),
    installation_served: z.string().min(1),
    zip: z.string(),
    bedroom_counts: z.string(),
    home_types: z.string(),
    pet_policy: z.string(),
    eligible_grades: z.string(),
    bases_mentioned: z.string(),
    community_url: z.url(),
    incentive: z.string().min(3),
    ...dated,
  }),
});

const baseHousingWaits = defineCollection({
  loader: strictJson('base_housing_waits'),
  schema: z.object({
    as_of_date: z.string().regex(/^\d{4}-\d{2}$/),
    rank_group: z.enum(['officer', 'enlisted']),
    site_display: z.string().min(1),
    community_slugs: z.array(z.string()),
    mapping_type: z.enum(['direct', 'group', 'none']),
    bedrooms: z.string().regex(/^\d$/),
    rank_band: z.string().min(1),
    units: z.number().int().nullable(),
    wait_time_stated: z.string().min(1),
    cost_as_printed: z.string(), // LMH's printed rent or special, as on the list; '' when none
    pet_policy: z.string(),
    is_latest: z.boolean(),
    source_url: z.url(),
    incentive: z.string().min(3),
    ...dated,
  }),
});

// Base housing areas: the curated grouping of LMH communities into pages.
const baseHousingAreas = defineCollection({
  loader: strictJson('base_housing_areas'),
  schema: z.object({
    name: z.string().min(1),
    order: z.number().int(),
    base_group: z.enum(['MIRAMAR', 'NBSD', 'NBPL', 'CORONADO', 'PENDLETON', 'NONE']),
    facts_zips: z.array(zip),
    community_slugs: z.array(z.string()).min(1),
    facts_note: z.string(),
    base_tie_note: z.string(),
    has_page: z.boolean(),
    ...dated,
  }).refine((a) => a.has_page === a.facts_zips.length > 0, 'an area page needs at least one facts zip'),
});

const militaryAccess = defineCollection({
  loader: strictJson('military_access'),
  schema: z.object({
    zip,
    nearest_commissary: text, commissary_min_freeflow: minutes, commissary_mi: z.number().nullable(),
    nearest_exchange_gas: text, exchange_operator: z.enum(['NEX', 'MCX']),
    exchange_gas_min_freeflow: minutes, exchange_gas_mi: z.number().nullable(),
    nearest_exchange_store: text, exchange_store_operator: z.enum(['NEX', 'MCX']),
    exchange_store_min_freeflow: minutes, exchange_store_mi: z.number().nullable(),
    nearest_mtf: text, mtf_min_freeflow: minutes, mtf_mi: z.number().nullable(),
    nearest_mtf_hospital: text, mtf_hospital_min_freeflow: minutes, mtf_hospital_mi: z.number().nullable(),
    nearest_costco: text, costco_min_freeflow: minutes, costco_mi: z.number().nullable(),
    nearest_costco_gas: text, costco_gas_min_freeflow: minutes, costco_gas_mi: z.number().nullable(),
    ...dated,
  }),
});

const climate = defineCollection({
  loader: strictJson('climate'),
  schema: z.object({
    zip,
    cec_climate_zone: z.number().int().min(1).max(16),
    cec_zone_pct: pct,
    july_mean_max_f: z.number().min(50).max(120),
    days_ge_90f: z.number().min(0).max(366),
    cdd65_annual: z.number().min(0),
    noaa_station_name: z.string(),
    station_distance_km: z.number().nullable(),
    station_flag: text,
    ...dated,
  }),
});

const hazards = defineCollection({
  loader: strictJson('hazards'),
  schema: z.object({
    zip,
    fhsz_status: z.string(),
    fhsz_very_high_pct: pct, fhsz_high_pct: pct, fhsz_moderate_pct: pct,
    fhsz_mapped_pct: pct, // share of land CAL FIRE rates at all; the rest is mostly federal (bases, national forest)
    fhsz_retrieved_on: text, // CAL FIRE files' download date (differs from the rest of the row's retrieval)
    sfha_pct: pct,
    miramar_cnel65plus_pct: pct, miramar_cnel70plus_pct: pct, miramar_cnel75plus_pct: pct,
    nasni_cnel65plus_pct: pct, nasni_cnel70plus_pct: pct, nasni_cnel75plus_pct: pct,
    aicuz_zone: z.enum(['none', 'manual', '65-70', '70-75', '75+']),
    // Which field the band comes from: 'Miramar', 'North Island NAS', both joined by ' + ', or 'NOLF Imperial Beach' (manual).
    aicuz_field: text,
    aicuz_gis_zone: z.enum(['none', '65-70', '70-75', '75+']), // band from GIS contours alone, even where 'manual'
    aicuz_gis_field: text,
    aicuz_note: text,
    ...dated,
  }),
});

const links = defineCollection({
  loader: strictJson('links'),
  schema: z.object({
    title: z.string().min(1),
    url: z.url(),
    agency: z.string(),
    decision_area: z.string(),
    phases: z.array(z.enum(['orders', '90_60_30', 'transit', 'arrival', 'first_30_days'])),
    incentive: z.string().min(3), // Principle 4: no link ships unlabeled
    ...dated,
  }),
});

// CNIC's bedroom-entitlement rule, quoted verbatim by the export from the saved page.
const housingRules = defineCollection({
  loader: strictJson('housing_rules'),
  schema: z.object({
    intro: z.string().min(1),
    guidelines: z.array(z.string().min(1)).min(1),
    officer_section_empty: z.boolean(),
    link_id: z.string(),
    ...dated,
  }),
});

// F2: the move sequence and its forms (content/f2_*.yml in the data repo; the export runs pull/check_f2.py
// first, so every citation's quote is on the saved official page). Every step and form names its sources.
const phase = z.enum(['orders', '90_60_30', 'transit', 'arrival', 'first_30_days']);
const anchor = z.enum(['orders_in_hand', 'detachment', 'report_date', 'address_in_hand', 'delivery_date']);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const cite = z.object({
  title: z.string().min(1),
  agency: z.string().min(1),
  url: z.url(),
  incentive: z.string().min(1),
  retrieved_on: day,
  quote: z.string().min(1),
  reason: z.string().min(1).optional(), // superseded entries only
});
// One line per thing that isn't confirmed, each naming who to ask (a row can have two, e.g. the PPM closeout).
const unconfirmed = z.array(z.object({ text: z.string().min(1), ask: z.enum(['CPPA', 'PPPO', 'HSC', 'NAVY_HHG']) }));
const sequenceSteps = defineCollection({
  loader: strictJson('sequence_steps'),
  schema: z.object({
    phase,
    order: z.number().int().min(1),
    step: z.string().min(1),
    anchor,
    deadline: z.string().min(1),
    depends_on: z.array(z.string()),
    applies_to: z.object({
      base: z.union([z.literal('all'), z.array(baseCode).min(1)]),
      housing_choice: z.enum(['any', 'base_housing', 'rental']),
      pets: z.enum(['any', 'yes']),
      kids: z.enum(['any', 'yes']),
      dependents: z.enum(['any', 'yes']),
      vehicles: z.enum(['any', 'yes', 'ppm']),
      service: z.enum(['navy', 'usmc', 'both']),
    }),
    status: z.enum(['ok', 'confirm_with_hsc', 'newest_authority', 'partial']),
    note: z.string(),
    unconfirmed,
    alternatives: z.array(z.object({ rule: z.string().min(1), sources: z.array(cite).min(1) })),
    sources: z.array(cite).min(1),
    superseded: z.array(cite.required({ reason: true })),
    forms: z.array(z.string()),
    ...dated,
  }).refine((s) => ['partial', 'confirm_with_hsc'].includes(s.status) === s.unconfirmed.length > 0, 'partial and confirm_with_hsc steps need an unconfirmed line; others none'),
});
const sequenceForms = defineCollection({
  loader: strictJson('sequence_forms'),
  schema: z.object({
    service: z.enum(['navy', 'usmc']),
    form: z.string().min(1),
    pays_or_does: z.string().min(1),
    who_files: z.string().min(1),
    anchor,
    deadline: z.string().min(1),
    filed_where: z.string().min(1),
    attachments: z.array(z.string()),
    sequence_step: z.array(z.string()),
    status: z.enum(['ok', 'newest_authority', 'partial', 'not_yet_covered']),
    note: z.string(),
    unconfirmed,
    sources: z.array(cite).min(1),
    superseded: z.array(cite.required({ reason: true })),
    ...dated,
  }).refine((f) => (f.status === 'partial') === f.unconfirmed.length > 0, 'partial forms need an unconfirmed line; others none'),
});

// JTR Table 5-37, one row per pay grade line (content/f2_weight_allowances.yml; check_f2.py proves each figure is on
// its line of the saved table). Every row carries the table's citation and the quotes shown with it.
const sequenceWeights = defineCollection({
  loader: strictJson('sequence_weights'),
  schema: z.object({
    grade: z.string().min(1),
    with_dependents_lb: z.number().int().positive(),
    without_dependents_lb: z.number().int().positive(),
    quote: z.string().min(1),
    title: z.string().min(1),
    caption: z.string().min(1),
    paragraph: z.string().min(1),
    source: cite,
    sources: z.array(cite).min(1),
    ...dated,
  }),
});

const provenance = defineCollection({
  loader: strictJson('provenance'),
  schema: z.object({
    title: z.string().min(1),
    source_name: z.string().min(1),
    source_url: z.string(),
    license: z.string().min(1),
    note: z.string().min(1).optional(), // how the date was checked when it wasn't a download (BAH: by hand)
    ...dated,
  }),
});

const sources = defineCollection({
  loader: strictJson('sources'),
  schema: z.object({
    layer: z.string().min(1),
    source: z.string().min(1),
    retrieved: z.string(),
    license: z.string().min(1),
    published_as: z.string().min(1),
    vintage: z.string().min(1),
    verified_on: z.string(),
  }),
});

// Human-written text: one file per community page, plus the changelog (F11).
// YAML turns an unquoted 2026-09-30 into a Date; accept either and store YYYY-MM-DD.
const isoDay = z.coerce.date().transform((d) => d.toISOString().slice(0, 10));
// status: placeholder means nothing renders: no lead, no gotchas, no visible placeholder.
const notesSchema = z.object({
  name: z.string(),
  status: z.enum(['placeholder', 'draft', 'reviewed']),
  lead: z.string().min(1),
  verified_on: isoDay,
});
const communityNotes = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/communities' }),
  schema: notesSchema,
});
const baseHousingNotes = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/base-housing-areas' }),
  schema: notesSchema,
});

const changelog = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/changelog' }),
  schema: z.object({
    date: isoDay,
    title: z.string().min(1),
    version: z.string(),
  }),
});

export const collections = {
  communities, bases, bah, commute, rent, rentToBah, ownership, schools, districts, childcare,
  baseHousing, baseHousingWaits, baseHousingAreas, housingRules, militaryAccess, climate, hazards, links, provenance, sources,
  sequenceSteps, sequenceForms, sequenceWeights,
  communityNotes, baseHousingNotes, changelog,
};
