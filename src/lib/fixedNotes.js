// Lines the site wrote itself (not exported data), each with the date it was written. Plain JavaScript so the
// pages, the plan and scripts/check_principles.mjs (the `dated` check reads these dates for `fixed:` keys) share
// one copy.

// The Camp Pendleton base page's line above the areas LMH ties to no base (QUESTIONS 60, Brian
// 2026-10-11; PRD Q9 open). The plan quotes it and cites the page, with this date.
export const PENDLETON_UNTIED_NOTE = {
  text: 'We haven’t confirmed whether Camp Pendleton families can apply to these areas. Ask LMH.',
  written: '2026-10-11',
};

// The incentive labels on outbound links (the list is on /sources/).
export const INCENTIVE_LABELS = { written: '2026-09-30' };

// Source keys for these lines (`fixed:<name>` in a SourceChip and on the facts it dates).
export const FIXED_DATES = {
  'pendleton-untied': PENDLETON_UNTIED_NOTE.written,
  'incentive-labels': INCENTIVE_LABELS.written,
};
