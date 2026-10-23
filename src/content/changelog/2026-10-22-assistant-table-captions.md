---
date: 2026-10-22
title: The assistant keeps each table's zip code with its numbers
version: v0.7.7
---

- **Fixed, not yet public:** on a few long sections (drive times to the commissary, exchange and hospital from each zip, and Carlsbad's rent table), the assistant could see a table's numbers without the zip code they belong to, and it mixed up two zips in one answer. Every part of a long section now keeps the zip (or housing area) line above its table, and a check fails the build if one ever goes missing.
- **Why:** found by the test with a real AI model. The test now also asks about a zip whose table sits in the second half of a section.
