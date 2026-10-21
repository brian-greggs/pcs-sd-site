---
date: 2026-10-20
title: BAH in dollars, next to the rent
version: v0.6
---

- **Changed:** the site now shows the housing allowance (BAH) in dollars. Until now it gave rent only as a share of the allowance and never printed the allowance itself. Families already know their BAH, and seeing it next to the typical rent is more useful than working it out. The share stays beside it as a second reading.
- **Neighborhood pages:** under the rent table, the 2026 BAH for your pay band at your base: one line per grade, with dependents first, then without, labeled with the year and the housing area ("2026 BAH, San Diego area (MHA CA038)"). BAH follows your duty station, not where you live, so it's your base's area if you came from your base page and the nearest base's otherwise. Pick your pay band at the top of the page.
- **Base housing pages:** the same lines in the Cost section, since rent there is your BAH. These pages now have the pay band picker too.
- **Base pages:** a "Housing allowance" table at the bottom with every pay band and grade, with and without dependents.
- **Starting plan (rules v0.6):** once you've picked a base, the plan lists your band's BAH at that base, one line per grade, citing the base page's table and its date.
- **Rent shares:** each one now says which housing area's allowance it divides by (the zip's own). For a neighborhood in the other area from your base, the two allowances differ by at most 3.1% for any grade.
- **Where the figures come from:** DTMO's 2026 BAH rates for San Diego (CA038) and Camp Pendleton (CA024), retrieved 2026-09-17. Every figure on a page or in the plan is checked against that table when the site is built, so a typed-in or out-of-date figure fails the build.
- **Why:** a decision change (PRD decision log, 2026-10-20).
