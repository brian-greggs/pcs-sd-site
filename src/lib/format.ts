// Display helpers. Whole-dollar rounding everywhere (PRD §7).

export const dollars = (n: number | null | undefined) =>
  n == null ? '—' : `$${Math.round(n).toLocaleString('en-US')}`;

export const pct = (n: number | null | undefined, digits = 0) =>
  n == null ? '—' : `${n.toFixed(digits)}%`;

export const range = (lo: number, hi: number, unit = '') =>
  lo === hi ? `${lo}${unit}` : `${lo}–${hi}${unit}`;

export const TIER_LABEL: Record<string, string> = {
  under30: 'Under 30 min',
  '30-45': '30–45 min',
  '45-60': '45–60 min',
  '60plus': 'Over 60 min',
};

// CA School Dashboard status level (CDE research files: 1 = Very Low … 5 = Very High).
export const STATUS_LABEL: Record<number, string> = {
  1: 'Very low',
  2: 'Low',
  3: 'Medium',
  4: 'High',
  5: 'Very high',
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthName = (yyyyMm: string) => {
  const [y, m] = yyyyMm.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};


// Pay bands in grade order (same bands as the export's PAY_BANDS).
export const PAY_BAND_ORDER = ['E1–E4', 'E5–E6', 'E7–E9', 'W1–W5', 'O1–O3E', 'O1–O3', 'O4–O6'];

// "02-04 Months" -> "2–4 months"; "E6-E9" -> "E6–E9"
export const tidyRange = (s: string) =>
  s.replace(/\b0(\d)\b/g, '$1').replace(/(\w)-(\w)/g, '$1–$2').replace(/Months?/, (m) => m.toLowerCase());
