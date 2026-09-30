# Site build — status (2026-09-30, session 2: base housing areas)

**Scope done:** F1 skeleton plus one vertical slice (Rancho Bernardo), stopped for review. Not built, by design: the other 39 communities, F2 sequence, F3 decision pages, F5 intake, F6 assistant.

## Pages (25)

| URL | Built from |
|---|---|
| `/` | One paragraph; Neighborhoods (all 40 by corridor, only Rancho Bernardo linked) and Base housing areas (all 20, grouped as on the index) |
| `/communities/rancho-bernardo/` | Exported data + `src/content/communities/rancho-bernardo.md`. The lead and gotchas are placeholders, so they don't render |
| `/base-housing/` | Index: the 20 areas grouped by the base LMH names, each with its October 2026 wait range; Prospect View and Woodlake listed as location not yet placed |
| `/base-housing/<area>/` (20) | `src/data/base_housing_areas.json` (from `manual/base_housing_areas.csv` in the data repo) + LMH communities + the latest wait list + the shared zip sections; `src/content/base-housing-areas/<area>.md` for the lead and gotchas (placeholders, not rendered) |
| `/sources/` | `src/data/sources.json`, generated from `EAP_Data_Source_Log.md` (latest row per layer) + round-1 layers |
| `/changelog/` | `src/content/changelog/` (F11): v0.1, v0.1.1, v0.2 |

Neighborhood sections: cost (HUD rent by bedroom, rent-to-BAH ratio by pay band, Mello-Roos by subarea + per-parcel lookup, ACS medians), then the shared zip sections, gotchas when written, and sources and dates. Base housing is not on neighborhood pages.

Base housing area sections: communities (bedrooms, eligible grades as LMH states them, grades on the list, pet policy, LMH link), wait times by pay band (CNRSW estimate, October 2026, with both PDFs), how to apply (HEAT, DD 1746, HSC check-in, from the saved CNIC pages), cost as printed on the list, then the shared zip sections. No Mello-Roos, no rent-to-BAH ratio, no ACS medians.

Shared zip sections (`src/components/sections/`): commute to every gate at 0700, schools, child care, military access, climate, hazards, sources and dates.

## Checks (all pass on 2026-09-30, session 2)

Source: no-score, no-bah, license, dated, data. Dist: dated (240 fact blocks), no-bah (exact figures + context), no-demo, no-score, incentive (597 outbound links), noindex, placeholder (new). Tested by planting violations in `dist/`: the original 10 plus 3 placeholder patterns were all caught. A note set to `draft` with real text renders; a placeholder renders nothing.

## For the PRD decision log

Moved to PRD §16 in the data repo on 2026-09-30 (BAH ratio, CFD names, Q3, Q6, the base housing design change).

## Open

See `QUESTIONS.md` (open: 21–24, plus 14 and 16 with Brian) and the LMH call list in the data repo's STATUS. Before public: Brian writes the leads and gotchas (none render until written); clinics get placed (the clinic row reappears on its own).

## Next session

Template the remaining 39 neighborhoods (serial for the first two); they only need a markdown file each, since the page is built when its file exists. Multi-zip communities will be the first real test of the per-zip tables; the page already handles more than one zip, but no multi-zip page has been built yet.
