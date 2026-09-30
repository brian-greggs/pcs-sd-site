# Site build — status (2026-09-30, session 1)

**Scope done:** F1 skeleton plus one vertical slice (Rancho Bernardo), stopped for review. Not built, by design: the other 39 communities, F2 sequence, F3 decision pages, F5 intake, F6 assistant.

## Pages (4)

| URL | Built from |
|---|---|
| `/` | One paragraph + all 40 communities by corridor; only Rancho Bernardo linked |
| `/communities/rancho-bernardo/` | Exported data + `src/content/communities/rancho-bernardo.md` (lead and gotchas are **placeholders**) |
| `/sources/` | `src/data/sources.json`, generated from `EAP_Data_Source_Log.md` (latest row per layer) + round-1 layers |
| `/changelog/` | `src/content/changelog/` (F11), first entry v0.1 |

Rancho Bernardo sections: cost (HUD rent by bedroom, rent-to-BAH ratio by pay band, Mello-Roos by subarea + per-parcel lookup), commute to all 8 bases at 0700 with tier, schools (district boundary/transfer links, Dashboard status, CAASPP, GreatSchools link), child care (counts + small-FCC gap + referral links), base housing nearest by commute with the October 2026 CNRSW wait times, military access (commissary, exchange, exchange gas, MTF, Costco), climate, hazards (fire pending, flood, noise), gotchas placeholder, sources and dates.

## Checks (all pass on 2026-09-30)

Source: no-score, no-bah, license, dated, data. Dist: dated (13 fact blocks), no-bah (exact figures + context), no-demo, no-score, incentive (23 outbound links), noindex. Tested by planting one violation of each kind in `dist/`: all 10 were caught.

## Open

See `QUESTIONS.md`. Blocking before public: the Miramar clinic placement (Q1), the ratio/BAH decision (Q2), the Zillow decision (Q3). Then Brian writes the lead and gotchas.

## Next session

Apply review notes to the slice, then template the remaining communities (serial for the first two). Multi-zip communities will be the first real test of the per-zip tables; the page already handles more than one zip, but no multi-zip page has been built yet.
