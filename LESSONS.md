# Lessons — site build

## Session 1 (2026-09-30): skeleton + Rancho Bernardo

- **Astro's built-in `file()` loader doesn't fail on bad data.** If the file is missing or a row has no id, it logs an error and keeps building. That breaks "a bad row must fail the build," so `src/content.config.ts` uses a small `strictJson()` loader that throws on a missing file, bad JSON, a missing id or a duplicate id. Schema errors already throw.
- **The schemas caught three real data conditions on the first build**, each a legitimate case rather than a bug: a Mira Mesa ownership row with no subarea (the community isn't split), two commute rows with a 0700 prediction but no typical range (very short trips: 92106→NBPL, 92118→NASNI), and YAML turning `2026-09-30` into a Date. Each was fixed by stating the case in the schema, not by loosening it wholesale.
- **The principle checks caught two date lines that sounded dated but weren't** ("generated at build time"). The check requires a year in the date line, which is stricter than "has a date line," and it's the right rule.
- **A check that has never failed proves nothing.** I planted one violation of each kind in the built page (a BAH figure, a dollar amount next to "BAH", two demographic words, a "Score" header, an unlabeled link, an undated block, a stray `<dl>`, a missing noindex). All 10 were caught, and the clean rebuild passed.
- **Naming collides with the check.** `rank_band` and `rank_group` are military pay-grade terms, but they matched the no-ranking rule. They're exempted by exact phrase, so a real "ranking" column still fails.
- **The dist checks can't be `prebuild`.** They need the built pages, so they run as `postbuild`. Both hooks run under `npm run build`, so Cloudflare fails the deploy either way.
- **The export guards its own boundary.** An outbound link with an unknown domain stops the export, so a link can't ship without an incentive label. The export also scans its own output for any BAH figure. That scan found two HUD rents equal to BAH values by coincidence, which is why the site check uses a reviewed allowlist instead of blind matching.
- **Google's typical range isn't always there.** Downstream code has to handle a missing range; the page shows "—".
- **Tooling:** Astro 7.3.5 and Node 24. `astro check` wants to install `@astrojs/check` and conflicts with TypeScript 7, so it wasn't run. The build compiles every page, and the schemas validate every row.

## Session 1b (2026-09-30): review fixes

- **Withhold at the boundary rather than hide on the page.** The nearest-clinic value is dropped in the export while any clinic is unplaced, so no page can show a wrong clinic, and the row comes back on its own once the clinics are placed. The same goes for CFD names: they no longer leave the data repo, so no template can print one by accident.
- **Shared logic for anything shown in two places.** The base-housing grouping lives in `src/lib/baseHousing.ts`, used by both the community line and `/base-housing/`, so they can't disagree.
- **Grouping by "nearest" needs its distance shown.** Grouping every community with its nearest base put two Lakeside communities, 40 min out, under "Near MCAS Miramar". Showing the minutes makes the grouping honest; the cutoff question went to QUESTIONS.
- **Fix provenance notes in the script that writes them.** Editing only the JSON would be undone on the next pull. Both notes were changed in the pull scripts and in the current JSON, and the wait-time parser's self-test still passes.

## Session 2 (2026-09-30): base housing areas

- **The unchanged checks caught my own new column names.** `rank_eligibility` and `index_base` tripped the no-score rule. They were renamed (`eligible_grades`, `base_group`) rather than exempted, because the instruction was to apply the checks unchanged, and exemptions are how a rule erodes.
- **Pull sections into components before the second page type, not after.** Neighborhood and base housing pages share six zip-based sections, and each takes a list of zips. The refactor made the area pages mostly composition, and a fix to a section now lands on all 21 pages.
- **A curated grouping belongs in the data repo with its own guard.** `manual/base_housing_areas.csv` is judgment, not code. The export refuses to run if a community is unassigned, double-assigned or unknown, or if an area's facts zip isn't residential.
- **"Don't render placeholders" needs two halves.** The page skips any notes whose status is placeholder, and the build fails if placeholder text reaches `dist/`. The first keeps pages clean; the second catches a note someone marks `draft` without replacing the text.
- **Sources disagreeing is a finding, not a problem to paper over.** On PPV rent, the wait list prints flat rents while a stale DoD page says rent equals BAH. The page shows what's printed and says to ask; the disagreement went to QUESTIONS.

## Session 3 (2026-09-30): all neighborhoods

- **Every layer covered every zip, and the pages still hid gaps.** The silent ones were inside rows: the clinic row vanished, the weather-station flag was never shown, and school dashes had no explanation. Looking for nulls per column, not missing rows, is what found them.
- **Sentinel values look like data.** ACS top-codes ($2,000,001, $3,501) rendered as exact figures on five zips. Any source with top-coding needs its sentinels mapped at display.
- **Labels from half-open ranges need both ends.** "45–60" and "Over 60" put a 60-minute drive in the wrong words. The tier was right; the label wasn't.
- **"Outside the contour" reads as "quiet" when the contour is the only one we have.** A negative fact needs its scope stated.
- **Allow-listing per page keeps the check whole.** The same $4,410 planted on another page still fails.

## Session 4 (2026-09-30): new UI

- **Render every variant, toggle with the script.** The commute tile for each base, the rent tile for each pay band and the commute summary for each base are all in the HTML; the script only flips `hidden`. So the principle checks read every word a reader can see, the page works with JavaScript off, and no data lives in a script.
- **A design system needs its own check.** The contrast check reads `theme.css` and tests 16 text/background pairs; a second rule fails any raw color in other stylesheets, so the 16 pairs are the whole palette. Planting a dim muted color failed four pairs at once.
- **Self-hosting fonts isn't proven until something fails on a CDN.** The new third-party check scans pages and the bundled CSS; a planted Google Fonts `<link>`, an `<img>` from another host and a `url(https://…)` in CSS were all caught.
- **Headless Chrome won't go below about 500 px wide.** Screenshots at 390 px looked like horizontal overflow; they weren't. Rendering the page in a 375 px iframe gives a true phone-width check.
- **`[hidden]` loses to any `display` rule.** The pay-band label has `display: flex`, so `hidden` alone wouldn't hide it with JavaScript off (caught while writing the CSS). One `[hidden] { display: none !important; }` line fixes it everywhere.

## Session 4b (2026-09-30): desktop layout

- **Add desktop as `min-width` layers on top, and the phone can't change.** Every new rule sits inside a 720 px or 1100 px media query, so the phone layout is the same CSS as before, not a copy kept in step.
- **Two-pane `:target` toggles need an override at the wide breakpoint.** The phone hides the pane that isn't the target; on desktop both panes show, so the wide query restores both and hides the toggle.
- **A sticky sidebar taller than the window never shows its bottom.** The base-housing pane gets `max-height: calc(100vh - 32px)` and scrolls on its own.
- **Measure overflow, don't eyeball it.** The layout check compares `scrollWidth` to `clientWidth` and lists any element past the right edge on 73 pages × 4 widths. A planted 900 px element proved it can fail.
- **Dates are local days.** `date.today()` happened to be right because the Mac is on Pacific time, but a hand-typed date took the UTC day from a file's mtime. The pull scripts now use one helper that names the time zone, and the export rejects future dates.

## Session 4c (2026-09-30): base pages

- **One layout for sibling pages beats a special one.** The base page's toggle, split columns and inner-scrolling pane were three mechanisms used nowhere else. Rebuilt from `FactBlock` and `Toc`, it needs two small options (heading level, tier chip as the title) and no page-specific CSS.
- **A summary that contradicts its label reads as a bug.** "Under 30 min · 9–65 min" was true (a multi-zip neighborhood's range) but looked wrong; the summary now uses the minutes the tier is based on.


## Session 5 (2026-10-11): starting plan

- **When the output space is too big to render, check the generator instead of the pages.** Pre-rendering every plan (9 bases × 7 bands × 4 bedroom choices × 8 "open to" sets × 9 priorities × households) isn't possible, so the page checks can't read plan text. Keeping the rules a pure function in plain JavaScript lets the build load the same module and the same embedded data and build ~27,000 plans, then check the ~16,000 distinct lines. Lines repeat a lot, so deduplicating by line keeps it under 5 seconds.
- **Cover each rule's inputs in full, not the full product.** The report window only changes "Watch for", so the main loop cycles it and a second loop covers "Watch for" in full. Coverage didn't change (the same 15,931 distinct lines) and the check went from 14 s to under 5 s.
- **"No network requests" is checkable from the bundle.** The check follows every script a page loads, imports included, and looks for anything that can send data or change the URL. A browser run confirmed it: zero requests from the first answer to the rendered plan.
- **A `<form>` is a leak even without a server.** A form with no action submits to the same page with every answer in the query string when JavaScript is off. The intake has no `<form>`, and the check fails one on any intake page.
- **A shortcut that carries state needs a user action, not a URL.** The base page's "Starting plan for <base>" card writes question 1 to the reader's own storage on click, so the base never goes into a link.
- **Contrast checks can be fooled by a print override.** Redefining `--text` inside `@media print` would have made the check read the print value instead of the screen value (it takes the last definition). Print colors got their own tokens (`--paper`, `--ink`, `--ink-muted`) and their own contrast pairs.
- **`pkill -f` matches its own shell.** `pkill -f "astro preview"` killed the command that ran it. Kill by PID.

## Session 5b (2026-10-11): assistant groundwork

- **Build the index when you build the site.** Tokenizing 843 chunks took 94 ms, ten times a free-plan Worker's CPU allowance. Storing the BM25 postings with the corpus leaves a cold start with only a JSON parse (about 16 ms) and a query under 1 ms. The tokenizer is one module, imported by both the build step and the Function, so the two can't drift.
- **Decide refusals in code where you can.** "I don't have that" (nothing relevant retrieved), referral requests and "who lives there" questions are answered before any model call. That's cheaper, can't be talked around, and is testable without a key: the retrieval-only eval checks them for real instead of skipping them.
- **A filter can be right on the answer and wrong on the evidence.** The 120-character BAH filter, run over the retrieved site text, flagged HUD rents sitting under the "Rent as a share of your housing allowance" heading. Site text gets the page check's sentence rule; only model output gets the wider window.
- **More text in the index isn't always better.** Indexing each section's source line fixed one question and broke another, because one word ("BAH") sits in 40 source lines. One eval question caught it.
- **Run the Function in the real runtime before trusting it.** `wrangler pages functions build` and `wrangler pages dev dist` ran here without an account and confirmed the bundle (the SDK, a JSON import, files outside `functions/`) and the STUB path end to end.

**When to switch from BM25 to embeddings.** Not yet: BM25 puts the expected page in the sections sent for 22 of 23 questions and the expected section for 17 of 17. Switch when the eval grows to at least 60 in-scope questions in families' own words (from the interviews and the week-5 reviewers) **and** either (a) the expected section is in the sections sent for fewer than 90% of them, or (b) most misses are vocabulary (the family's words aren't on the page) and the synonym list grows by more than about one entry per five new questions. Before switching, build an embedding index for the same corpus and require it to beat BM25 by at least 10 points on that hit rate **without** letting more out-of-scope questions past the "I don't have that" gate. Embeddings also mean a second outside service seeing every question, which counts against them under Principle 3.

## Session 5c (2026-10-11): the Cloudflare preview build failed

- **Cause:** `assistant/ask.js` imported the Q8 priority list as `import priorities from '…/priorities.json' with { type: 'json' }`. `npm run build` passed (Node 22 understands import attributes, and Node *requires* them for JSON), so every check was green. But Cloudflare compiles `functions/` in a separate step after the build, with the wrangler in its build image, and wrangler 3 bundles with esbuild 0.17, which can't parse `with { … }`: `ERROR: Expected ";" but found "with"`. Reproduced from a fresh clone: wrangler 4.149 compiled the Function; wrangler 3.114 and 3.22 both failed on that line.
- **Why I missed it in session 5b:** I tested with `npx wrangler@4`, the newest, not the one Cloudflare's build image runs. "It compiles" has to mean "it compiles with the deployer's toolchain."
- **Fix:** no JSON import anywhere in the Function's code. `scripts/build_corpus.mjs` copies the Q8 labels into `dist/assistant/corpus.json`, which the Function already loads; `src/config/intake/priorities.json` stays the one place they're edited. It now compiles with wrangler 3.22, 3.114 and 4.149 and runs under wrangler 3's local runtime.
- **New postbuild check** (`scripts/check_functions.mjs`): walks every file `functions/` reaches through relative imports and fails on import attributes or assertions, JSON imports, Node built-ins (`node:fs` and the like: no `nodejs_compat` flag is set) and `process.env`; then bundles the Function the way wrangler does and fails if it's over the Workers free-plan limit (3 MB gzipped; it's 125 KB). Planting the old JSON import, a `node:fs` import and `process.env` failed all three.
- **Bundling like wrangler means the browser platform.** The Anthropic SDK swaps its Node-only `internal/node.mjs` for a browser version through the `browser` field in its package.json, which esbuild honors only with `platform: 'browser'`. Bundled as `neutral`, it fails on `node:child_process`.
- **Nothing else in the build needs what Cloudflare lacks:** the layout check (Chromium) and the assistant eval aren't part of `npm run build`; the exact BAH-figure check skips without the data repo, as before; everything is in `dependencies` (no dev-only tools; esbuild comes with Astro); the build needs Node 22.12 or later (Astro 7), now pinned with `.node-version` (`22`), which Cloudflare's build image reads unless the project sets `NODE_VERSION`.

## Session 5d (2026-10-11): sections in pieces

- **Retrieve the unit you cite.** The corpus split long sections into parts for ranking, and retrieval picked parts, so a table could reach the model without half its rows. Ranking can use parts, but what gets sent should be the whole section.
- **Hidden variants hide in more than one place.** I stripped the per-base variants from section bodies but not from the summary line, which repeats them too. Eight copies of a summary turned a one-table section into two chunks. Any rule about what's visible has to cover every part of the markup.
- **Never split a table between rows unless it can't fit, and then repeat the header.** A row without its header is a list of numbers.
- **"Right page" is too easy a bar for retrieval.** The old eval passed whenever the page was in the sections sent, even if the row the family asked about wasn't. Each question now names the fact (a pattern for the exact row) and the eval checks the text sent. Live, the same question checks the answer for the number.
- **A list of citations can hide what was sent.** One citation per URL made two parts look like one; checking the sections themselves, not the citation list, is what showed the problem.
