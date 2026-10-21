---
date: 2026-10-20
title: Rent shares against your base's allowance (rules v0.7)
version: v0.6.1
---

- **Changed:** the rent-as-a-share-of-BAH tables now divide by the allowance for your base's housing area, the same figures as the BAH lines above them. Before, they used the area the neighborhood sits in, so a Naval Base San Diego family looking at Oceanside saw a share of Camp Pendleton's allowance. BAH follows your duty station, not where you live.
- **How it picks:** coming from your base page, the page shows your base's area (San Diego, CA038, for every base except Camp Pendleton, CA024); otherwise the nearest base's. Each table says which area it's against. The "3-bed rent vs. BAH" tile follows the same choice.
- **Starting plan (rules v0.7):** every rent share in the plan is against your base's allowance, and links the neighborhood page set to your base. Not sure of your base yet: each neighborhood's share is against its nearest base's allowance, and the line names that base. 472 plan lines changed, almost all in North County and for Camp Pendleton families; the two areas differ by at most about 3 percentage points.
- **Why:** answer to an open question (the share and the BAH line beside it should use the same allowance).
