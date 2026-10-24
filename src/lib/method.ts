// "How the numbers work" on /sources/ (Brian 2026-10-23): the method notes that used to repeat in every section
// (drive times from zip centers, HUD rent, the ratio, BAH following the duty station, Dashboard levels, wait
// ranges), once each, in plain language. Pages link here with a one-line hint (src/components/MethodHint.astro).
// The wording is the pages' own notes, moved, not new claims. `src` is the provenance row each topic describes;
// the section's SourceChip dates them.
export const METHOD_TOPICS = {
  'drive-times': {
    id: 'how-drive-times',
    title: 'Drive times at 0700',
    src: 'prov:commute',
    paras: [
      'Commute times are Google Maps’ predicted drive for a Tuesday at 0700, from the center of the zip to the base’s main gate, rounded to the minute. A neighborhood with several zips shows the range across its zips. Your street can add or take away 5–10 minutes.',
      'The typical range is Google’s spread for a weekday at 0700. A dash in the typical range means Google gave no spread for that trip, which happens on very short drives. Road miles are from OSRM on OpenStreetMap.',
      'Every base is listed with its real minutes, however long the drive. The tier groups them: under 30, 30–44, 45–59, and 60 minutes or more, by the slowest zip when a neighborhood has several. Base pages use the same groups, so a neighborhood sits in the group for its slowest zip.',
    ],
  },
  'no-traffic': {
    id: 'how-no-traffic',
    title: 'Commissary, exchange, hospital and Costco drives',
    src: 'prov:military_access',
    paras: [
      'These are drive times with no traffic (OSRM on OpenStreetMap), from the center of the zip. Real times at rush hour run longer. On-base times can run long because routing avoids restricted base roads.',
    ],
  },
  'hud-rent': {
    id: 'how-hud-rent',
    title: 'HUD reference rent and the Census medians',
    src: 'prov:rent',
    paras: [
      'HUD reference rent is HUD’s Small Area Fair Market Rent for the zip (FY2027): the 40th-percentile rent, utilities included, for that many bedrooms. A zip marked “metro default” has no zip-specific figure and uses the metro one.',
      'The Census median rent (across all rented homes) and median home value are Census 5-year estimates (2020–2024); they lag the current market. For what landlords are asking this month, each zip links to Zillow’s rent trends.',
    ],
  },
  ratio: {
    id: 'how-ratio',
    title: 'Rent as a share of your housing allowance',
    src: 'prov:rent_to_bah',
    paras: [
      'The ratio is HUD reference rent for that many bedrooms, divided by the 2026 allowance with dependents for your base’s housing area: the same figures as the BAH lines. Under 100% means the reference rent fits inside the allowance. A band shows a range when its grades get different allowances.',
    ],
  },
  bah: {
    id: 'how-bah',
    title: 'BAH follows your duty station',
    src: 'prov:bah',
    paras: [
      'BAH follows your duty station, not where you live. Every base on this site is in the San Diego area (CA038) except Camp Pendleton (CA024). Neighborhood and base housing pages show your base’s area if you came from its base page, and otherwise the area of the nearest base (for a base housing area, its own base, or the nearest when LMH names none). Pick your pay band at the top of the page. Each base page has the full table for every pay grade.',
    ],
  },
  schools: {
    id: 'how-schools',
    title: 'School columns',
    src: 'prov:schools',
    paras: [
      'English and math columns show the California School Dashboard status level, from very low to very high. The “met standard” columns are the share of tested students who met or exceeded the state standard. The full picture for each school is on the California School Dashboard.',
      'A dash means the state files we use have no figure for that school. Usually that’s because too few students were tested or no tested grades are taught there; the Dashboard’s chronic absence measure covers grades K–8.',
    ],
  },
  waits: {
    id: 'how-waits',
    title: 'Base housing wait ranges',
    src: 'prov:base_housing_waits',
    paras: [
      'A wait range on a base page or the base housing index is the range across every list, pay grade and bedroom count in the area, from the Navy Housing Service Center’s latest monthly estimate. Wait times change every month; each area page has the rows for your grade.',
    ],
  },
} as const;
