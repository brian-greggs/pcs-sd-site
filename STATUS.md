# Site build — status (2026-09-30, session 4: new UI, v0.4)

**Scope done:** F1 skeleton, all 40 neighborhood pages, 20 base housing area pages, and the Cowork UI: dark sunset theme, base-first navigation, phone-first. Not built, by design: F2 sequence, F3 decision pages, F5 intake, F6 assistant.

## Session 4: what changed

- **Theme:** `src/styles/theme.css` holds every color and font token; `site.css` uses only those (the contrast check enforces it). Fonts are self-hosted from `@fontsource` (latin subset; Bricolage Grotesque 600/700, DM Sans 400/500/700). No gradients, shadows or emoji; 12 px cards; touch targets 44 px.
- **Layout:** four-band stripe, bar with the site name or "‹ back" and a BETA label, footer with the two lines plus the unofficial line, Sources and What changed.
- **Home** is base-first: 8 base cards, then "Or just browse" (Neighborhoods 40, Base housing 20).
- **Base pages** (`/base/<slug>/`, 8): Off base / Base housing as anchor links styled as a segmented control; CSS `:target` picks the pane, no JavaScript. Off base: all 40 neighborhoods under tier chips, sorted by minutes, linking with `?base=`. Base housing: areas tied to the base with member count and wait range (CNRSW estimate), then the areas LMH ties to no base.
- **Neighborhood and area pages:** "At a glance" tiles (2×2), every section a native `<details>` with a data-built summary line and its dated source line. Neighborhood pages have a pay-band select (default E5–E6, kept in localStorage behind try/catch) and follow `?base=`; every variant is rendered server-side and the inline script only toggles `hidden`.
- **New checks:** `contrast` (source stage: 16 theme pairs ≥ 4.5:1, lowest 5.33:1; no raw colors outside the theme) and `third-party` (dist: nothing loaded from another origin by a page or stylesheet). Both tested by planting violations.

## Pages (73)

| URL | Built from |
|---|---|
| `/` | Base-first home: the 8 bases, then "Or just browse" |
| `/base/<slug>/` (8) | Neighborhoods and base housing sorted by the 0700 drive to that base (`src/lib/bases.ts`) |
| `/neighborhoods/` | All 40, A to Z, with corridor |
| `/communities/<slug>/` (40) | Exported data, one page per row of `communities.json`. A `src/content/communities/<slug>.md` file is optional and holds the lead and gotchas; only Rancho Bernardo has one (placeholder, so nothing renders) |
| `/base-housing/` | Index: the 20 areas grouped by the base LMH names, each with its October 2026 wait range; Prospect View and Woodlake listed as location not yet placed |
| `/base-housing/<area>/` (20) | `src/data/base_housing_areas.json` (from `manual/base_housing_areas.csv` in the data repo) + LMH communities + the latest wait list + the shared zip sections; `src/content/base-housing-areas/<area>.md` for the lead and gotchas (placeholders, not rendered) |
| `/sources/` | `src/data/sources.json`, generated from `EAP_Data_Source_Log.md` (latest row per layer) + round-1 layers |
| `/changelog/` | `src/content/changelog/` (F11): v0.1 through v0.4 |

Neighborhood sections: cost (HUD rent by bedroom, rent-to-BAH ratio by pay band, Mello-Roos by subarea + per-parcel lookup, ACS medians), then the shared zip sections, gotchas when written, and sources and dates. Base housing is not on neighborhood pages.

Base housing area sections: communities (bedrooms, eligible grades as LMH states them, grades on the list, pet policy, LMH link), wait times by pay band (CNRSW estimate, October 2026, with both PDFs), how to apply (HEAT, DD 1746, HSC check-in, from the saved CNIC pages), cost as printed on the list, then the shared zip sections. No Mello-Roos, no rent-to-BAH ratio, no ACS medians.

Shared zip sections (`src/components/sections/`): commute to every gate at 0700, schools, child care, military access, climate, hazards, sources and dates.

Gaps (`src/lib/gaps.ts`): a zip with no row in a layer gets a one-line "No … for zip …: why" in that section. No community zip is missing a row today (none of the five `remote` zips or the out-of-county school zips belong to a community), so these lines don't render yet. In-row gaps that do render: clinic row (withheld), weather station >300 m elevation difference (91978, 92027), school dashes, ACS top-coded or unpublished medians, aircraft noise beyond Miramar.

## Checks (all pass on 2026-09-30, session 4)

Source: no-score, no-bah, license, dated, data, contrast. Dist: 73 pages, dated (654 fact blocks), no-bah (exact figures ran locally), no-demo, no-score, incentive (1,889 outbound links), noindex, placeholder, third-party. Build 1.7 s wall clock (Astro 688 ms for 73 pages); dist 2.6 MB, of which fonts 212 KB.

### Session 3

Source: no-score, no-bah, license, dated, data. Dist: 64 pages, dated (576 fact blocks), incentive (1,889 outbound links; session 3b). The BAH check fired twice as expected (QUESTIONS 13); both reviewed and allow-listed per page in `scripts/bah_check_allow.json`. A planted $4,410 on another page still fails.

Session 2: dated (240 fact blocks), no-bah (exact figures + context), no-demo, no-score, incentive (597 outbound links), noindex, placeholder (new). Tested by planting violations in `dist/`: the original 10 plus 3 placeholder patterns were all caught. A note set to `draft` with real text renders; a placeholder renders nothing.

## For the PRD decision log

Moved to PRD §16 in the data repo on 2026-09-30 (BAH ratio, CFD names, Q3, Q6, the base housing design change).

## Open

See `QUESTIONS.md` (open: 21–24, plus 14 and 16 with Brian) and the LMH call list in the data repo's STATUS. Before public: Brian writes the leads and gotchas (none render until written); clinics get placed (the clinic row reappears on its own).

## Next session

Brian reviews the new UI on a phone and answers QUESTIONS 31–39 where the guess was wrong. Then, as before:

Brian writes leads and gotchas (one `.md` per community; the page picks it up). Open from session 3b: FHSZ files (QUESTIONS 25), the NASNI/NOLF IB hand-assignment, Coronado's boundary lookup (29), beach-link placement (30).
