# pcs-sd-site

The public site for an unofficial, non-commercial San Diego PCS guide. Static pages built with
[Astro](https://astro.build); nothing runs on a server. No analytics, no cookies, no third-party
requests: the fonts (Bricolage Grotesque, DM Sans) are self-hosted from `@fontsource` packages, and the one
script (pay band and `?base=` on neighborhood pages) is inline and only shows or hides text already on the
page. Every page is `noindex` until week 5.

## The three commands

```
npm install      # once, and after package.json changes
npm run dev      # local preview at http://localhost:4321/ (reloads as you edit)
npm run build    # principle checks + build into dist/ (this is what Cloudflare Pages runs)
```

`npm run build` runs three steps and stops at the first failure:

1. `prebuild`: `scripts/check_principles.mjs source` checks the data files (column names, dates) and the theme
   (every text/background pair at least 4.5:1; no raw colors outside `src/styles/theme.css`).
2. `astro build`: validates every data row against its schema in `src/content.config.ts`, then renders `dist/`.
3. `postbuild`: `scripts/check_principles.mjs dist` checks the rendered pages: every fact block dated, no BAH
   dollar figure, no demographic descriptors, no score/index/rating labels, an incentive label on every outbound
   link, `noindex` on every page, no placeholder text, nothing loaded from another origin.

## How data gets here

The data lives in the private repo `pcs-sd-data`. This repo only ever holds what the export lets out.

```
pcs-sd-data/EAP Data/csv/ + manual/
      │  .venv/bin/python pull/export_for_site.py   (run in pcs-sd-data)
      ▼
pcs-sd-site/src/data/*.json   ← display-safe columns only; every row has vintage + verified_on
      │  git commit + push (GitHub Desktop)
      ▼
Cloudflare Pages runs npm run build → dist/ → live
```

The column whitelist per file is at the top of `pull/export_for_site.py`. That script is the publish
boundary: BAH dollar figures, raw Google commute columns, Zillow values and provider names never reach
this repo.

To refresh the data: re-run the pulls you need in `pcs-sd-data`, run the export, check the diff in
`src/data/`, run `npm run build` here, then commit and push.

## Where things are

| Path | What |
|---|---|
| `src/data/*.json` | Exported data (generated; don't hand-edit) |
| `src/content.config.ts` | One schema per data file; a bad row fails the build |
| `src/content/communities/*.md` | Human-written lead and gotchas, one file per neighborhood. A neighborhood page is built only when its file exists. Nothing renders while `status: placeholder` |
| `src/content/base-housing-areas/*.md` | Lead and gotchas for each base housing area (same rules) |
| `src/data/base_housing_areas.json` | The base housing areas, curated in `manual/base_housing_areas.csv` in the data repo |
| `src/content/changelog/*.md` | The "What changed" page (F11), one file per entry |
| `src/pages/index.astro` | Home: the eight bases, then "Or just browse" |
| `src/pages/base/[base].astro` | Base pages: neighborhoods and base housing sorted by the 0700 drive; `src/lib/bases.ts` has the slugs |
| `src/pages/neighborhoods/index.astro` | All neighborhoods, A to Z |
| `src/pages/communities/[slug].astro` | The neighborhood page template (`?base=<slug>` picks the commute tile) |
| `src/pages/base-housing/` | The base housing index and the area page template |
| `src/components/sections/` | Sections shared by both page types (commute, schools, child care, access, climate, hazards, notes, sources), each taking a list of zips |
| `src/components/FactBlock.astro` | A section of facts with its required date line; a native `<details>` with a one-line summary |
| `src/styles/theme.css` | Every color, font and size token (the dark sunset theme); `site.css` uses only these |
| `src/components/ExtLink.astro` | Every outbound link, with its incentive label |
| `scripts/check_principles.mjs` | The build-time principle checks; word lists at the top |
| `scripts/check_layout.mjs` | Layout check, run by hand: every page at 390/768/1280/1440 px, no sideways scroll (needs Chrome; usage at the top) |
| `scripts/bah_check_allow.json` | Reviewed coincidences where a rent equals a BAH figure (empty) |
