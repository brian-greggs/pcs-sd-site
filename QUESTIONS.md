# Questions — site build

## Open (session 4, new UI, 2026-09-30)

Things I had to guess while building the Cowork design. Each says what I did; any is a small change.

31. **Base slugs and location lines.** `/base/naval-base-san-diego/`, `miramar`, `north-island`, `naval-amphibious-base`, `point-loma`, `naval-medical-center`, `mcrd`, `camp-pendleton` (in `src/lib/bases.ts`). The one-line locations on the home cards ("Off I-15, north of Kearny Mesa") are mine; the base page shows the gate from the data under the heading.
32. **Which base housing a base page lists.** LMH's groups map to bases as Miramar → MCAS Miramar, NBSD → Naval Base San Diego, NBPL → Point Loma, Coronado → both NAS North Island and NAB, Pendleton → Camp Pendleton. Naval Medical Center and MCRD have no tied areas, so their pages say so. Every base page also lists the 10 areas LMH ties to no base (Murphy Canyon, Lakeside, …) under "Not tied to a base by LMH", sorted by the drive to that base. Drop that group if it reads as clutter.
33. **"The pay band updates the Cost table"** I read as: the table keeps every band (so the page is complete with JavaScript off) and the chosen band's row is highlighted. The rent tile switches to the chosen band.
34. **Commute summary line.** "<your base> N min · nearest: <base> N min · Navy bases A–B min", where the Navy bases are NBSD, North Island, NAB, Point Loma and Naval Medical Center, minus any already named. MCRD and Pendleton are only in the table.
35. **Neighborhoods with several zips.** Tiles show the range across zips (commute, ratio, Very High fire share). The fire caveat shows if any zip is under 95% rated, worded "in one zip here".
36. **Base housing tiles.** Pets: the wait list's printed policy wins over the LMH page; shows "Allowed", "Allowed at N of M", "No pets" or "Not stated". Commute: to the area's base; for Coronado the nearer of North Island and NAB; for areas LMH ties to no base, the nearest base, labeled so. Wait: the area's range across every list, grade and bedroom count (same as the index); lower bounds of 0 come from "00-01 Months" rows as printed.
37. **Kept beyond the spec.** The footer keeps "Unofficial and non-commercial. Not affiliated with the Navy, the Marine Corps or DoD." (Principle 7) under the two lines you gave. Removed: the jump-link list on each page (sections now fold) and the light theme.
38. **Back links.** Neighborhood → /neighborhoods/, or the base page when `?base=` is set; base housing area → /base-housing/; base pages, both indexes, Sources and What changed → home. Home shows the site name.
39. **Fonts.** Latin subset only, five weights, woff2 with woff fallback (212 KB in dist, 96 KB of it woff2; a browser fetches only the woff2 for the weights a page uses). Covers ñ (Peñasquitos) and the dashes; anything outside falls back to the system font.

## Open (session 3, all neighborhoods, 2026-09-30)

25. **Fire (FHSZ).** Brian is downloading the CAL FIRE files to ~/Downloads; when he says they're there, move them to `raw/hazards/fhsz/` in the data repo and re-run `pull_hazards.py` (BLOCKED.md). No change until then.
26. ~~Aircraft noise beyond Miramar.~~ **Done 2026-09-30.** NOLF Imperial Beach added to the manual-radius rule (91911, 91932, 92154; 92118 near both fields). Source for the hand-assignment: the 2015 NOLF IB ALUCP (county ALUC, on the Navy's 2011 AICUZ basis); the AICUZ itself wasn't found online. The "covers MCAS Miramar only" line stays. Open: SANDAG's noise layer now lists "North Island NAS"; that may replace the NASNI hand-assignment (data repo STATUS item 9).
27. ~~Imperial Beach Charter scores.~~ **Fixed 2026-09-30.** The CAASPP filter in `pull_schools.py` kept Type ID 7 only; charters are 9 and 10. 109 charters gained scores. Still rated with no scores (no tested grades, so correct): Creekside Early Learning Center (P–K), Cardiff Elementary (K–2), Winter Gardens Elementary (K–1), Valley Center Primary (K–2), SDUSD Home & Hospital/Transition Support.
28. ~~Inland stations on coastal zips.~~ **Done 2026-09-30.** New flags: station >10 km from the origin point, or a CEC-zone-7 zip on a station outside zone 7. Community zips caught: 91914, 91945, 91977, 91978, 92007, 92014, 92037, 92075, 92130 (distance) and 91941, 91942, 92119, 92129 (zone). CEC zone 7 reaches inland, so the zone rule catches La Mesa, College Area and Rancho Peñasquitos, not just the coast.
29. **Coronado Unified has no boundary lookup** (the page says so). Worth finding before Coronado gets a lead.
30. **Beach and bay link placement.** Shown on Coronado, Imperial Beach, Chula Vista (west) and National City, plus the Coronado and Imperial Beach base housing pages. Otay Mesa / San Ysidro (92154, Tijuana River valley) is left off; add it if the closures matter there.

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
13. ~~**Coincidences.**~~ **Resolved 2026-09-30 (session 3).** The check fired on Santee ($4,410, HUD 4-bed, 92071) and Otay Mesa / San Ysidro ($4,440, HUD 4-bed, 92154). Both equal without-dependents BAH values (W4, O4) by coincidence; each is allow-listed for its page only, with the reason.

## Check by eye (scripts get 403 from these)

14. Links that block automated checks. Please open each once:
    - Zillow per-zip rent trends: `https://www.zillow.com/rental-manager/market-trends/92128/` (the URL format is my guess)
    - CAL FIRE FHSZ page: `https://osfm.fire.ca.gov/what-we-do/community-wildfire-preparedness-and-mitigation/fire-hazard-severity-zones`
    - Zillow Research data: `https://www.zillow.com/research/data/` (exported, not currently shown)
15. **Incentive labels.** The wording is mine; the list is on `/sources/`. In particular: GreatSchools "Nonprofit: ad-supported"; LMH "Private housing operator (PPV): collects the rent"; Child Care Aware "Nonprofit: runs DoD fee-assistance under contract".
16. **Site name** is a placeholder ("San Diego PCS Guide (beta)") until PRD Q2.
17. **Capeharts East Miramar** lists 4 bedrooms on its LMH page, but the October wait list has 3- and 4-bedroom rows. That's a source mismatch; the page shows both as printed.
