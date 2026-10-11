// Drive-time tiers: under 30, 30–44, 45–59, 60 and up. One rule for every place a tier appears
// (base pages, the commute table's Tier column, the starting plan): a place's tier comes from the TOP
// of its 0700 drive range, so "under 30 minutes" means every zip in it is under 30 (QUESTIONS 59,
// Brian 2026-10-11). Plain JavaScript so the plan rules and the build checks use the same function.
// The commute data's own `tier` column is per zip, and isn't used for places.
export const tierOf = (hi) => (hi < 30 ? 'under30' : hi < 45 ? '30-45' : hi < 60 ? '45-60' : '60plus');
export const TIER_LIMIT = { under30: [0, 30], '30-45': [30, 45], '45-60': [45, 60], '60plus': [60, Infinity] };
export const TIER_LABEL = { under30: 'Under 30 min', '30-45': '30–44 min', '45-60': '45–59 min', '60plus': '60 min or more' };
