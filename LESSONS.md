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
