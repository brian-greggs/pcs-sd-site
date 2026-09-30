# Questions — site build

## Open (session 2, base housing areas, 2026-09-30)

21. ~~What does a family pay for PPV housing?~~ **Resolved 2026-09-30 from sources (Brian).** CNIC's Privatized Housing page says rent is based on BAH: you receive BAH and pay rent to the property manager. Military OneSource's NBSD housing page adds that some neighborhoods offer discounted rates. Area pages now say "Rent is your BAH, paid to Liberty Military Housing by allotment (CNIC). Some sites list discounted rates; those are shown below as printed." Both sources are cited and dated. Still open, on the HSC call list in the data repo's STATUS: whether families keep the difference on discounted units, and utilities.
22. **Camp Pendleton has no wait times or application steps in our material.** The NBSD Housing Service Center list covers the San Diego complex only, and the saved CNIC pages are Navy. The Pendleton page says so and points to LMH and the Pendleton housing office. That office's page is a candidate for the next Cowork browser list.
23. **Wait-list footnotes.** Rows with `*` or `**` refer to footnotes the parser records only as fragments ("*Must", "Single", …). The pages say the asterisks refer to the PDF. Capturing the full footnote text would let the cost column explain the specials.
24. **"Units" on the wait table** is printed as-is. The list doesn't say whether it means total homes or homes on the list. Worth one line from the HSC.

Superseded by the base housing areas (2026-09-30): 18 (Lakeside under Miramar), 19 (minutes to the gate), 20 (unplaced communities; now on the index and the LMH call list in the data repo's STATUS).

## Answered 2026-09-30 (session 1b)

Q1 hospital only; the clinic is withheld in the export while any clinic is unplaced · Q2 accepted, recorded in STATUS for the PRD decision log · Q3 Zillow links only for the beta · Q4 bands OK · Q5 changed: one line on the community page + new `/base-housing/` page · Q6 statuslevel note fixed in `pull_schools.py` and `provenance/schools.json` · Q7 no CFD named until T4b; notes and agency names no longer exported · Q8 kept, with the ACS label and the Navy / Marine Corps SLO labels · Q9–13 agreed · Q15 labels as drafted · Q17 mismatch recorded in `pull_base_housing_waittimes.py` and its provenance (`source_mismatches`). Q14 (check links by eye) and Q16 (site name) stay with Brian.

## Session 1 questions (2026-09-30)

Things I had to guess or decide without you. Each has what I did and what would change it.

## Decide before the page goes public

1. **Nearest military clinic is wrong for Rancho Bernardo until the Miramar clinic is placed.** The access table shows Naval Medical Center (Balboa, 32 min) as the nearest clinic, because `clinic-miramar` (BMC MCAS Miramar) has no coordinates yet (data repo STATUS, manual item 4). Once it's placed and `pull_military_access.py` re-runs, the export picks it up. Until then the page is wrong on this row. Since the clinic and the hospital are currently the same place, the page shows one row, "Military clinic or hospital".
2. **The ratio lets anyone work out the BAH figure.** The page shows HUD rent ($3,610 for 2 bed) and the ratio (98% for E1–E4), so rent ÷ ratio ≈ the allowance. That's exact for any band with one allowance value (E1–E4 in both MHAs). F10 says "never display the BAH figure," which the page doesn't, but it's one division away. Options: accept it (BAH is public anyway), round ratios to the nearest 5%, or drop the rent table from the page. I kept both.
3. **Zillow: numbers or links?** PRD §7 lists ZORI/ZHVI as "free with attribution"; the kickoff says display-only sources go out as links. The round-2 source log doesn't cover them. I exported **links only** and wrote the Sources page to say so. If Zillow's terms allow showing values with attribution, the export can add current asking rent in one line.

## Interpretations to confirm

4. **Pay bands (rent-to-BAH).** With dependents only (the pilot is families). Bands: E1–E4, E5–E6, E7–E9, W1–W5, O1–O3E, O1–O3, O4–O6; bedrooms 2, 3, 4. A band shows a range when its grades get different allowances. The bands are defined in `PAY_BANDS` at the top of the export.
5. **"Base housing option nearest by commute."** I read it as: take this community's closest base at 0700 (Miramar, 16 min), then list the base-housing communities whose zip has the shortest 0700 drive to that base. Five communities tie at 9 min (all zip 92126), so the page shows all five and their October wait times (12 rows). The zip is the leasing office's, which stands in for the real location (about 41 true locations are still manual). The other reading, base housing nearest to Rancho Bernardo itself, is a one-line change.
6. **Dashboard levels.** I show the Dashboard *status level* for English and math as Very low … Very high (CDE's 1–5 status), and never the Dashboard *color*, because the color combines status with change, which makes it CDE's own composite. The data repo's `provenance/schools.json` note says "statuslevel: 1=Red … 5=Blue". That describes the color, not the status, so the note should be fixed there.
7. **Mello-Roos, Sabre Springs.** The low-confidence row goes out as "Not confirmed. Check the parcel before an offer," with the CFD name withheld (its note says the mapping is from general knowledge). The medium-confidence Rancho Bernardo row's note still says "Sabre Springs pockets may sit under Poway USD CFD #2 — verify per parcel." Keep that sentence, or trim it until verified?
8. **Extras beyond the spec.** (a) The Census median rent and median home value (ACS, public domain) are shown as context next to HUD rent. (b) The climate table has a Coronado (92118) column as the coastal comparison T12 uses. (c) Both School Liaison Officer links (Navy SD and MCCS Miramar). Remove any of these if they read as clutter.
9. **Child care counts** exclude 2 providers countywide whose license is "on probation" (none in 92128).
10. **Schools shown** are the public schools with an address in the zip (charters included and marked), not the assigned school. The page says so and points to the boundary lookup.

## Build mechanics

11. **The dist checks run as `postbuild`, not `prebuild`.** The checks read the rendered pages, which don't exist before the build. `prebuild` checks the data files (column names, dates); `postbuild` checks `dist/`. Either failure fails `npm run build`, which also fails a Cloudflare deploy.
12. **The exact BAH-figure check only runs locally.** It needs the BAH table, which lives in the data repo next door. On Cloudflare that part is skipped, with a SKIP line in the log, and the context check still runs: no dollar figure in a sentence mentioning BAH or the housing allowance. Committing hashes of the figures wouldn't protect anything, since four-digit numbers are trivial to reverse. Since you build locally before every push, I think this is enough.
13. **Coincidences.** HUD rents of $4,410 and $4,440 (in two other zips) equal 2026 BAH figures. When those pages are built, the check will stop them. Each one gets reviewed and added to `scripts/bah_check_allow.json` with a reason.

## Check by eye (scripts get 403 from these)

14. Links that block automated checks. Please open each once:
    - Zillow per-zip rent trends: `https://www.zillow.com/rental-manager/market-trends/92128/` (the URL format is my guess)
    - CAL FIRE FHSZ page: `https://osfm.fire.ca.gov/what-we-do/community-wildfire-preparedness-and-mitigation/fire-hazard-severity-zones`
    - Zillow Research data: `https://www.zillow.com/research/data/` (exported, not currently shown)
15. **Incentive labels.** The wording is mine; the list is on `/sources/`. In particular: GreatSchools "Nonprofit: ad-supported"; LMH "Private housing operator (PPV): collects the rent"; Child Care Aware "Nonprofit: runs DoD fee-assistance under contract".
16. **Site name** is a placeholder ("San Diego PCS Guide (beta)") until PRD Q2.
17. **Capeharts East Miramar** lists 4 bedrooms on its LMH page, but the October wait list has 3- and 4-bedroom rows. That's a source mismatch; the page shows both as printed.
