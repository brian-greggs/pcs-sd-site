# pcs-sd-site

The public site for an unofficial, non-commercial San Diego PCS guide. Static pages built with
[Astro](https://astro.build); nothing runs on a server. No analytics, no cookies, no third-party
requests: the fonts (Bricolage Grotesque, DM Sans) are self-hosted from `@fontsource` packages. The page
scripts send nothing anywhere: the neighborhood pages' pay band and `?base=` only show or hide text already on
the page, and the starting plan (`/plan/`) works out its plan in the browser from data embedded in the page.
Every page is `noindex` until week 5.

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
3. `postbuild`: `scripts/check_principles.mjs dist` checks the rendered pages: every section has one SourceChip whose dates cover every fact in it (`--plant all` proves it), every BAH
   dollar figure from `src/data/bah.json` with its year, MHA and date line, no demographic descriptors, no score/index/rating labels, an incentive label on every outbound
   link, `noindex` on every page, no placeholder text, nothing loaded from another origin. Then
   `scripts/check_intake.mjs` checks the starting plan (see the table below), and `scripts/check_sequence.mjs` checks
   the move sequence pages against their exported rows.

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
boundary: raw Google commute columns, Zillow values and provider names never reach this repo. BAH
comes only as DTMO's table (`src/data/bah.json`, 2026, San Diego CA038 and Camp Pendleton CA024), and
every BAH figure the site prints is checked against it.

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
| `src/pages/sequence/` | The move sequence (F2): `/sequence/`, one page per phase (`[phase].astro`) and `/sequence/forms/`, from `src/data/sequence_steps.json` and `sequence_forms.json` (exported only after the data repo's `pull/check_f2.py` passes) |
| `src/lib/sequence.js`, `src/lib/sequenceData.ts`, `src/components/sequence/` | Phases, anchors, the disclaimer and Navy-rules lines, the Q3 → phase map (shared with the plan rules and the checks); the steps and forms in order; the step card, the quotes and the two top lines |
| `scripts/check_sequence.mjs` | Postbuild: every step and form on a page is an exported row with its deadline word for word, a date line, every quote and its "Not yet confirmed" line; the disclaimer and Navy-rules lines are where they must be; USMC rows never render. `--plant all` proves each rule fails |
| `src/content/changelog/*.md` | The "What changed" page (F11), one file per entry |
| `src/pages/index.astro` | Home: the eight bases, the starting plan, then "Or just browse" |
| `src/pages/plan.astro` | Starting plan (F5 intake v0): the eight questions and the printable plan, worked out in the browser; answers in localStorage only |
| `src/lib/intake/rules.js` | The intake rules (pure JavaScript, shared by the page and the build check); `RULES_VERSION` and the list of rules with nothing to point at yet (`GAPS`) |
| `src/lib/intake/digest.ts` | The data the rules run on, built from the collections and embedded in `/plan/` (ratios, plus the BAH table from `bah.json`) |
| `src/config/intake/priorities.json` | The Q8 priority list (edit after the screener) |
| `src/config/intake/tradeoffs.json` | The tradeoff table, one entry per first × second priority pair (empty until written) |
| `src/pages/base/[base].astro` | Base pages: neighborhoods and base housing sorted by the 0700 drive; `src/lib/bases.ts` has the slugs |
| `src/pages/neighborhoods/index.astro` | All neighborhoods, A to Z |
| `src/pages/communities/[slug].astro` | The neighborhood page template (`?base=<slug>` picks the commute tile) |
| `src/pages/base-housing/` | The base housing index and the area page template |
| `src/components/sections/` | Sections shared by both page types (commute, schools, child care, access, climate, hazards, notes, sources), each taking a list of zips |
| `src/components/FactBlock.astro` | A section of facts: a one-line summary, the body behind a closed native `<details>`, and its SourceChip |
| `src/components/SourceChip.astro` | The receipts under every section: a small chip that opens to the date line, sources and license. Every fact in a section names its source key (`data-src`); the chip lists them (`data-chip-src`) and the `dated` check dates each one from its data file |
| `src/lib/method.ts`, `src/components/MethodHint.astro` | "How the numbers work" on `/sources/` (the method notes, once each) and the one-line hint that links to it |
| `src/styles/theme.css` | Every color, font and size token (the dark sunset theme); `site.css` uses only these |
| `src/components/ExtLink.astro` | Every outbound link, with its incentive label |
| `scripts/check_principles.mjs` | The build-time principle checks |
| `scripts/principle_lists.mjs` | The word lists every check uses (demographic terms, score words, placeholder patterns) |
| `scripts/check_intake.mjs` | Starting plan checks (postbuild): no network requests or URL writes, and every line the rules can print (built across the answer space) has a source and a date, every dollar figure is a BAH line from `bah.json` with its year, MHA and BAH date, and passes the word lists; with no base chosen, the housing allowance section is the one "Pick a base" line, no figures; `page-ratios` recomputes every rent-to-BAH ratio (rent ÷ the duty station's BAH) and checks the export, the pages and the plan against it |
| `scripts/check_functions.mjs` | Postbuild: the code `functions/` reaches uses no syntax Cloudflare's wrangler 3 can't parse, no JSON or Node built-in imports, no `process.env`; the bundled Function fits the free-plan size limit |
| `scripts/build_corpus.mjs` | Postbuild: chunks every published page by dated section into `dist/assistant/corpus.json` with BM25 postings (the assistant's only knowledge) |
| `assistant/` | The assistant (F6 groundwork): `retrieve.js` (BM25), `prompt.js` (system prompt, known data holes), `guards.js` (fixed answers, the BAH dollar filter), `ask.js` (request handling, STUB/live, intake context, daily cap) |
| `functions/api/ask.js` | Cloudflare Pages Function at `/api/ask` (same origin). Env: `ANTHROPIC_API_KEY`, `ASSISTANT_MODEL`, optional KV `ASK_LIMITS` and `ASK_DAILY_CAP` |
| `src/pages/ask.astro` | `/ask/`: the assistant page; not linked anywhere; conversation in page memory only |
| `evals/assistant_eval.jsonl`, `scripts/eval_assistant.mjs` | 46 test questions and the runner: `npm run eval:assistant` (retrieval only), `-- --live`, or `-- --url <deployed site>` |
| `scripts/check_layout.mjs` | Layout check, run by hand: every page at 390/768/1280/1440 px, no sideways scroll (needs Chrome; usage at the top) |
| `scripts/bah_check_allow.json` | Reviewed coincidences where a HUD rent equals a BAH figure (two, each for one page) |
| `src/scripts/variants.ts` | Which per-base and per-band variants a neighborhood or base housing page shows (pay band, the base's MHA for BAH and ratios, the commute tile) |
| `src/lib/bah.ts`, `src/components/BahLines.astro` | The BAH table by MHA and the per-band lines on neighborhood and base housing pages (marked up for the `bah-figures` check) |
