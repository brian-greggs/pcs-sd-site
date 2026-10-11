// Principle word lists, shared by check_principles.mjs (pages), check_intake.mjs
// (every line the starting plan can print) and the assistant's eval and output filter.
// Principle 5: places are described by commute, cost and school access, never
// by who lives there. Matched as whole words/phrases, case-insensitive, in the
// visible text of every page except /sources/.
export const DEMOGRAPHIC_TERMS = [
  'affluent', 'wealthy', 'upscale', 'upper-class', 'upper class', 'middle-class', 'middle class',
  'working-class', 'working class', 'blue-collar', 'white-collar', 'low-income', 'high-income',
  'diverse', 'diversity', 'ethnic', 'ethnicity', 'racial', 'race', 'hispanic', 'latino', 'latina',
  'latinx', 'asian', 'caucasian', 'african american', 'immigrant', 'immigrants', 'retirees',
  'retiree', 'elderly', 'young professionals', 'young families', 'family-friendly', 'family friendly',
  'kid-friendly', 'demographic', 'demographics', 'gentrified', 'gentrifying', 'gentrification',
  'up-and-coming', 'sketchy', 'rough area', 'bad area', 'good area', 'nice area', 'safe area',
  'religious', 'conservative', 'liberal', 'military town', 'mostly military',
];
// The one documented exception: the military-household share (ACS armed-forces share).
export const DEMOGRAPHIC_ALLOWED = [/military[- ]household share/gi, /armed[- ]forces share/gi];

// Corollary: no composite scores. Labels only (headers, captions, terms), and data column names.
export const SCORE_WORDS = /\b(score|scores|index|indices|indexes|rating|ratings|rank(?:ing)?s?|grade[- ]?score)\b/i;
// "Rank band" and "rank group" are military pay-grade terms on the base-housing wait lists, not rankings.
export const SCORE_ALLOWED = [/\brank band\b/i, /\brank group\b/i];

// Placeholder text that must never reach dist/ (checked in the full HTML, attributes included).
export const PLACEHOLDER_PATTERNS = [/PLACEHOLDER/, /Brian writes/i, /data-placeholder/, /\bTODO\b/, /lorem ipsum/i];
