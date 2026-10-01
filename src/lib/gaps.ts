// Honest degradation: a section never goes blank or drops a zip silently. When a
// layer has no row for some of a page's zips, the section says so in one line.

export const missingZips = (zips: string[], rows: { zip: string }[]) =>
  zips.filter((z) => !rows.some((r) => r.zip === z));

export const zipList = (zips: string[]) => (zips.length === 1 ? `zip ${zips[0]}` : `zips ${zips.join(', ')}`);

// One line for the zips a layer doesn't cover. `what` is the missing thing ("child care counts"),
// `why` the reason the source doesn't have it.
export const gapLine = (missing: string[], what: string, why: string) =>
  missing.length ? `No ${what} for ${zipList(missing)}: ${why}.` : '';

// The usual reason: every layer was pulled for San Diego County's residential zips.
export const OUT_OF_PULL = 'this source was pulled for San Diego County’s residential zips only';
