# Site build — status (2026-09-30, session 1 + review fixes)

**Scope done:** F1 skeleton plus one vertical slice (Rancho Bernardo), stopped for review. Not built, by design: the other 39 communities, F2 sequence, F3 decision pages, F5 intake, F6 assistant.

## Pages (5)

| URL | Built from |
|---|---|
| `/` | One paragraph + all 40 communities by corridor; only Rancho Bernardo linked |
| `/communities/rancho-bernardo/` | Exported data + `src/content/communities/rancho-bernardo.md` (lead and gotchas are **placeholders**) |
| `/sources/` | `src/data/sources.json`, generated from `EAP_Data_Source_Log.md` (latest row per layer) + round-1 layers |
| `/base-housing/` | All 63 LMH communities grouped by the base they sit beside (0700 from the leasing office's zip), October 2026 wait list (CNRSW estimate) with links to both PDFs, pet policy, group sites as "covers …" |
| `/changelog/` | `src/content/changelog/` (F11): v0.1, v0.1.1 |

Rancho Bernardo sections: cost (HUD rent by bedroom, rent-to-BAH ratio by pay band, Mello-Roos by subarea + per-parcel lookup), commute to all 8 bases at 0700 with tier, schools (district boundary/transfer links, Dashboard status, CAASPP, GreatSchools link), child care (counts + small-FCC gap + referral links), one line naming the nearest base-housing group (links to `/base-housing/`), military access (commissary, exchange, exchange gas, MTF, Costco), climate, hazards (fire pending, flood, noise), gotchas placeholder, sources and dates.

## Checks (all pass on 2026-09-30, after review fixes)

Source: no-score, no-bah, license, dated, data. Dist: dated (24 fact blocks), no-bah (exact figures + context), no-demo, no-score, incentive (83 outbound links), noindex. Tested by planting one violation of each kind in `dist/`: all 10 were caught.

## For the PRD decision log

| Date | Decision | Reason |
|---|---|---|
| 2026-09-30 | Show HUD rent next to the rent-to-BAH ratio, unrounded, even though rent ÷ ratio recovers the allowance (exactly, for single-value bands like E1–E4). Keep the literal-figure build check. | BAH is public. The rule is about framing (Principle 1: advisor, not calculator), not secrecy: the site never prints the allowance or invites the family to compute against it. |
| 2026-09-30 | Base housing gets its own page (`/base-housing/`); community pages carry one line pointing to it | Wait times and pet policy are pure data and don't wait on interviews; one table per community page repeated the same rows |
| 2026-09-30 | No Mello-Roos district is named on the site until T4b verifies it per parcel | A CFD named from general knowledge is a claim we can't date or source |

## Open

See `QUESTIONS.md` (open: 18–20, plus 14 and 16 with Brian). Before public: Brian writes the lead and gotchas; clinics get placed (the clinic row reappears on its own when they are).

## Next session

Apply review notes to the slice, then template the remaining communities (serial for the first two). Multi-zip communities will be the first real test of the per-zip tables; the page already handles more than one zip, but no multi-zip page has been built yet.
