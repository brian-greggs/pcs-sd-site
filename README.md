# pcs-sd-site

The public site for an unofficial, non-commercial San Diego PCS guide. Static pages built with
[Astro](https://astro.build); nothing runs on a server. No analytics, no cookies, no third-party
fonts or scripts. Every page is `noindex` until week 5.

## The three commands

```
npm install      # once, and after package.json changes
npm run dev      # local preview at http://localhost:4321/ (reloads as you edit)
npm run build    # principle checks + build into dist/ (this is what Cloudflare Pages runs)
```

`npm run build` runs three steps and stops at the first failure:

1. `prebuild`: `scripts/check_principles.mjs source` checks the data files (column names, dates).
2. `astro build`: validates every data row against its schema in `src/content.config.ts`, then renders `dist/`.
3. `postbuild`: `scripts/check_principles.mjs dist` checks the rendered pages: every fact block dated, no BAH
   dollar figure, no demographic descriptors, no score/index/rating labels, an incentive label on every outbound
   link, `noindex` on every page, no placeholder text.

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
| `src/pages/communities/[slug].astro` | The neighborhood page template |
| `src/pages/base-housing/` | The base housing index and the area page template |
| `src/components/sections/` | Sections shared by both page types (commute, schools, child care, access, climate, hazards, notes, sources), each taking a list of zips |
| `src/components/FactBlock.astro` | A section of facts with its required date line |
| `src/components/ExtLink.astro` | Every outbound link, with its incentive label |
| `scripts/check_principles.mjs` | The build-time principle checks; word lists at the top |
| `scripts/bah_check_allow.json` | Reviewed coincidences where a rent equals a BAH figure (empty) |
