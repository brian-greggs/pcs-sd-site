# Lessons — site build

## Session 1 (2026-09-30): skeleton + Rancho Bernardo

- **Astro's built-in `file()` loader doesn't fail on bad data.** If the file is missing or a row has no id, it logs an error and keeps building. That breaks "a bad row must fail the build," so `src/content.config.ts` uses a small `strictJson()` loader that throws on a missing file, bad JSON, a missing id or a duplicate id. Schema errors already throw.
- **The schemas caught three real data conditions on the first build**, each a legitimate case rather than a bug: a Mira Mesa ownership row with no subarea (the community isn't split), two commute rows with a 0700 prediction but no typical range (very short trips: 92106→NBPL, 92118→NASNI), and YAML turning `2026-09-30` into a Date. Each was fixed by stating the case in the schema, not by loosening it wholesale.
- **The principle checks caught two date lines that sounded dated but weren't** ("generated at build time"). The check requires a year in the date line, which is stricter than "has a date line," and it's the right rule.
- **A check that has never failed proves nothing.** I planted one violation of each kind in the built page (a BAH figure, a dollar amount next to "BAH", two demographic words, a "Score" header, an unlabeled link, an undated block, a stray `<dl>`, a missing noindex). All 10 were caught, and the clean rebuild passed.
- **Naming collides with the check.** `rank_band` and `rank_group` are military pay-grade terms, but they matched the no-ranking rule. They're exempted by exact phrase, so a real "ranking" column still fails.
- **The dist checks can't be `prebuild`.** They need the built pages, so they run as `postbuild`. Both hooks run under `npm run build`, so Cloudflare fails the deploy either way.
- **The export guards its own boundary.** An outbound link with an unknown domain stops the export, so a link can't ship without an incentive label. The export also scans its own output for any BAH figure. That scan found two HUD rents equal to BAH values by coincidence, which is why the site check uses a reviewed allowlist instead of blind matching.
- **Google's typical range isn't always there.** Downstream code has to handle a missing range; the page shows "—".
- **Tooling:** Astro 7.3.5 and Node 24. `astro check` wants to install `@astrojs/check` and conflicts with TypeScript 7, so it wasn't run. The build compiles every page, and the schemas validate every row.

## Session 1b (2026-09-30): review fixes

- **Withhold at the boundary rather than hide on the page.** The nearest-clinic value is dropped in the export while any clinic is unplaced, so no page can show a wrong clinic, and the row comes back on its own once the clinics are placed. The same goes for CFD names: they no longer leave the data repo, so no template can print one by accident.
- **Shared logic for anything shown in two places.** The base-housing grouping lives in `src/lib/baseHousing.ts`, used by both the community line and `/base-housing/`, so they can't disagree.
- **Grouping by "nearest" needs its distance shown.** Grouping every community with its nearest base put two Lakeside communities, 40 min out, under "Near MCAS Miramar". Showing the minutes makes the grouping honest; the cutoff question went to QUESTIONS.
- **Fix provenance notes in the script that writes them.** Editing only the JSON would be undone on the next pull. Both notes were changed in the pull scripts and in the current JSON, and the wait-time parser's self-test still passes.

## Session 2 (2026-09-30): base housing areas

- **The unchanged checks caught my own new column names.** `rank_eligibility` and `index_base` tripped the no-score rule. They were renamed (`eligible_grades`, `base_group`) rather than exempted, because the instruction was to apply the checks unchanged, and exemptions are how a rule erodes.
- **Pull sections into components before the second page type, not after.** Neighborhood and base housing pages share six zip-based sections, and each takes a list of zips. The refactor made the area pages mostly composition, and a fix to a section now lands on all 21 pages.
- **A curated grouping belongs in the data repo with its own guard.** `manual/base_housing_areas.csv` is judgment, not code. The export refuses to run if a community is unassigned, double-assigned or unknown, or if an area's facts zip isn't residential.
- **"Don't render placeholders" needs two halves.** The page skips any notes whose status is placeholder, and the build fails if placeholder text reaches `dist/`. The first keeps pages clean; the second catches a note someone marks `draft` without replacing the text.
- **Sources disagreeing is a finding, not a problem to paper over.** On PPV rent, the wait list prints flat rents while a stale DoD page says rent equals BAH. The page shows what's printed and says to ask; the disagreement went to QUESTIONS.

## Session 3 (2026-09-30): all neighborhoods

- **Every layer covered every zip, and the pages still hid gaps.** The silent ones were inside rows: the clinic row vanished, the weather-station flag was never shown, and school dashes had no explanation. Looking for nulls per column, not missing rows, is what found them.
- **Sentinel values look like data.** ACS top-codes ($2,000,001, $3,501) rendered as exact figures on five zips. Any source with top-coding needs its sentinels mapped at display.
- **Labels from half-open ranges need both ends.** "45–60" and "Over 60" put a 60-minute drive in the wrong words. The tier was right; the label wasn't.
- **"Outside the contour" reads as "quiet" when the contour is the only one we have.** A negative fact needs its scope stated.
- **Allow-listing per page keeps the check whole.** The same $4,410 planted on another page still fails.

## Session 4 (2026-09-30): new UI

- **Render every variant, toggle with the script.** The commute tile for each base, the rent tile for each pay band and the commute summary for each base are all in the HTML; the script only flips `hidden`. So the principle checks read every word a reader can see, the page works with JavaScript off, and no data lives in a script.
- **A design system needs its own check.** The contrast check reads `theme.css` and tests 16 text/background pairs; a second rule fails any raw color in other stylesheets, so the 16 pairs are the whole palette. Planting a dim muted color failed four pairs at once.
- **Self-hosting fonts isn't proven until something fails on a CDN.** The new third-party check scans pages and the bundled CSS; a planted Google Fonts `<link>`, an `<img>` from another host and a `url(https://…)` in CSS were all caught.
- **Headless Chrome won't go below about 500 px wide.** Screenshots at 390 px looked like horizontal overflow; they weren't. Rendering the page in a 375 px iframe gives a true phone-width check.
- **`[hidden]` loses to any `display` rule.** The pay-band label has `display: flex`, so `hidden` alone wouldn't hide it with JavaScript off (caught while writing the CSS). One `[hidden] { display: none !important; }` line fixes it everywhere.

## Session 4b (2026-09-30): desktop layout

- **Add desktop as `min-width` layers on top, and the phone can't change.** Every new rule sits inside a 720 px or 1100 px media query, so the phone layout is the same CSS as before, not a copy kept in step.
- **Two-pane `:target` toggles need an override at the wide breakpoint.** The phone hides the pane that isn't the target; on desktop both panes show, so the wide query restores both and hides the toggle.
- **A sticky sidebar taller than the window never shows its bottom.** The base-housing pane gets `max-height: calc(100vh - 32px)` and scrolls on its own.
- **Measure overflow, don't eyeball it.** The layout check compares `scrollWidth` to `clientWidth` and lists any element past the right edge on 73 pages × 4 widths. A planted 900 px element proved it can fail.
- **Dates are local days.** `date.today()` happened to be right because the Mac is on Pacific time, but a hand-typed date took the UTC day from a file's mtime. The pull scripts now use one helper that names the time zone, and the export rejects future dates.

