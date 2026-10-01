# Site build — status (2026-09-30, session 3b: gap follow-ups)

**Scope done:** F1 skeleton, all 40 neighborhood pages, 20 base housing area pages. Not built, by design: F2 sequence, F3 decision pages, F5 intake, F6 assistant.

## Pages (64)

| URL | Built from |
|---|---|
| `/` | One paragraph; Neighborhoods (all 40 by corridor, all linked) and Base housing areas (all 20, grouped as on the index) |
| `/communities/<slug>/` (40) | Exported data, one page per row of `communities.json`. A `src/content/communities/<slug>.md` file is optional and holds the lead and gotchas; only Rancho Bernardo has one (placeholder, so nothing renders) |
| `/base-housing/` | Index: the 20 areas grouped by the base LMH names, each with its October 2026 wait range; Prospect View and Woodlake listed as location not yet placed |
| `/base-housing/<area>/` (20) | `src/data/base_housing_areas.json` (from `manual/base_housing_areas.csv` in the data repo) + LMH communities + the latest wait list + the shared zip sections; `src/content/base-housing-areas/<area>.md` for the lead and gotchas (placeholders, not rendered) |
| `/sources/` | `src/data/sources.json`, generated from `EAP_Data_Source_Log.md` (latest row per layer) + round-1 layers |
| `/changelog/` | `src/content/changelog/` (F11): v0.1, v0.1.1, v0.2 |

Neighborhood sections: cost (HUD rent by bedroom, rent-to-BAH ratio by pay band, Mello-Roos by subarea + per-parcel lookup, ACS medians), then the shared zip sections, gotchas when written, and sources and dates. Base housing is not on neighborhood pages.

Base housing area sections: communities (bedrooms, eligible grades as LMH states them, grades on the list, pet policy, LMH link), wait times by pay band (CNRSW estimate, October 2026, with both PDFs), how to apply (HEAT, DD 1746, HSC check-in, from the saved CNIC pages), cost as printed on the list, then the shared zip sections. No Mello-Roos, no rent-to-BAH ratio, no ACS medians.

Shared zip sections (`src/components/sections/`): commute to every gate at 0700, schools, child care, military access, climate, hazards, sources and dates.

Gaps (`src/lib/gaps.ts`): a zip with no row in a layer gets a one-line "No … for zip …: why" in that section. No community zip is missing a row today (none of the five `remote` zips or the out-of-county school zips belong to a community), so these lines don't render yet. In-row gaps that do render: clinic row (withheld), weather station >300 m elevation difference (91978, 92027), school dashes, ACS top-coded or unpublished medians, aircraft noise beyond Miramar.

## Checks (all pass on 2026-09-30, session 3)

Source: no-score, no-bah, license, dated, data. Dist: 64 pages, dated (576 fact blocks), incentive (1,889 outbound links; session 3b). The BAH check fired twice as expected (QUESTIONS 13); both reviewed and allow-listed per page in `scripts/bah_check_allow.json`. A planted $4,410 on another page still fails.

Session 2: dated (240 fact blocks), no-bah (exact figures + context), no-demo, no-score, incentive (597 outbound links), noindex, placeholder (new). Tested by planting violations in `dist/`: the original 10 plus 3 placeholder patterns were all caught. A note set to `draft` with real text renders; a placeholder renders nothing.

## For the PRD decision log

Moved to PRD §16 in the data repo on 2026-09-30 (BAH ratio, CFD names, Q3, Q6, the base housing design change).

## Open

See `QUESTIONS.md` (open: 21–24, plus 14 and 16 with Brian) and the LMH call list in the data repo's STATUS. Before public: Brian writes the leads and gotchas (none render until written); clinics get placed (the clinic row reappears on its own).

## Next session

Brian writes leads and gotchas (one `.md` per community; the page picks it up). Open from session 3b: FHSZ files (QUESTIONS 25), the NASNI/NOLF IB hand-assignment, Coronado's boundary lookup (29), beach-link placement (30).
