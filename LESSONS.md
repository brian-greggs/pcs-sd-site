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

## Session 5e (2026-10-11): rules v0.2 and follow-ups

- **A fallback only fires if the gate it waits on can close.** The first follow-up design used the previous question only when the new one retrieved nothing relevant. But "What about from Santee?" names a page, so it always counted as relevant and got Santee's Schools section. Folding the previous question in every time, at low weight, with the named page taken from the new question alone, fixed it without letting the old topic win.
- **Explain a gap in the note, not as a sourced line.** "The move sequence isn't written yet" has no page to cite. It goes in the lead's note (which states no facts, QUESTIONS 44), so the rule "every line has a source" stays intact.
- **A date is part of the claim.** The Pendleton area line carried the Navy wait list's date, from a list that doesn't cover Pendleton. Citing the right page isn't enough; the date has to be the one that page gives that section.

## Session 6 (2026-10-11): rules v0.3

- **A source line should be built from the facts, not from the page.** One `areaSource(ar)` dated every base housing line the same way, with waits, pets and commute, so pet lines carried a commute date and wait lines a pets date. Passing the facts a line uses (`areaSource(ar, 'pets-list')`) makes the date follow the fact.
- **"Has a date" was too weak a check.** `intake-sources` only asked for a year somewhere in the source line, so a wrong date passed. `intake-dates` ties each date label to a pattern for its fact, both ways. Its first run flagged two phrasings I hadn't thought of: a wait fact worded "no 3-bed rows … on the October 2026 list", and pet facts worded with "dog" and "cat". It also found the child care lines, which show drive minutes with no commute date.
- **Joining values loses their keys.** Deduplicating an area's pet policies into one string dropped which community each belonged to. Keep the per-community rows in the data and decide how to group them when writing the line.
- **A household fact that matters regardless of priorities belongs in "Watch for", not in a lead.** The infant-care gap lived in the child care lead, so a family with a baby who ranked pets first never saw it.

## Session 7 (2026-10-11): rules v0.4

- **A tier is a claim about the whole range.** "Under 30 minutes" from the closest zip let a neighborhood with a 35-minute zip into the under-30 list. The plan now uses the top of the range, and `intake-tiers` checks every listed line against its heading. The base pages still use the old rule, so the two can disagree until QUESTIONS 59 is answered; I reported that rather than change pages I wasn't asked to touch.
- **"Shortest" means one thing, not a span.** Merging every matching row into min-low/max-high is right for "the wait ranges from …" and wrong for "the shortest is …": it printed "1–18 months" by joining a 1–3 row and a 16–18 row. Keep both: the range for the lead, the single soonest row for the warning.
- **Off-by-one in the language too.** "Runs past the window" with `lo > window` let a 1–3 month wait pass for someone reporting in under 30 days. At or past (`>=`) matches what a family means by "won't be ready when I arrive"; the line now says "doesn't fit your report window".
- **When the site can't qualify a claim, don't make it.** Listing the untied areas for Pendleton families implied they're eligible. With no page stating the doubt, leaving them out is the honest version of "show it with a note".

## Session 8 (2026-10-11): one tier rule

- **One rule, one function.** The tier was computed three ways in three places: the commute data's per-zip column, `drives()` and the plan's own `tierOf`. A shared `src/lib/tiers.js`, imported by the plan rules (plain JS), the base pages and the commute table, is what makes "the page and the plan can't disagree" true by construction. The check makes it stay true.
- **Check the page against the plan, not each against itself.** `intake-tiers` proved the plan was consistent with its headings, and the base pages were consistent with their own (old) rule; neither caught the disagreement. `page-tiers` reads the built base pages and compares each group with the tier the plan computes from the same data.
- **Count a change two ways before reporting it.** The 67 moves were counted from the data before the change, then again by rebuilding the pages with the old rule and running the new check. Both gave the same per-base numbers.
- **A caveat a family reads on the page should be the same one the plan cites.** The Pendleton line's text and date live in one constant used by the base page and the digest, so the plan can quote and date it exactly.

## Session 9 (2026-10-20): BAH figures

- **Turn a ban into a provenance check, don't just delete it.** "No BAH figure" became "every BAH figure is from `bah.json`, with its year, MHA and date": the old context and exact-figure rules survive, applied outside the marked-up BAH blocks, so a hand-typed figure still fails. Marking figures up (`data-bah="2026|CA038|E5"`) is what lets the check compare each one with the table instead of guessing from nearby words.
- **Put the table where the host can read it.** The exact-figure check used to skip on Cloudflare because the table lived in the data repo. With `bah.json` exported, it runs everywhere; the data-repo comparison is a local extra.
- **Repeated text distorts ranking.** The same BAH lines on 60 pages, under a heading weighted 3×, turned every BAH question into a 40-way tie that Alpine won alphabetically, and pushed the base housing cost question off its page. The fix keeps the lines in what's sent and out of what's ranked (`data-unranked` → `rank_text`), and leaves one canonical table per base to rank.
- **A new number next to an old one exposes the old one's assumptions.** The ratio was always computed on the home zip's MHA. That never showed while the allowance was hidden; printing the reader's own BAH beside it made the mismatch visible (QUESTIONS 62).
- **A pull is not an update.** The local branch was 12 commits behind `origin/main` with a clean tree, and `node_modules` was missing a dependency the new commits added; the Functions bundle check caught it. Check `git status -sb` and run `npm ci` after pulling.
- **Diff the plan, not just the checks.** Building the previous commit in a worktree and diffing every line over the same answers showed exactly 184 new lines and nothing else changed, which the checks alone can't say.

## Session 9b (2026-10-20): the ratio follows the duty station

- **Two scripts toggling `hidden` on the same elements fight.** The band script and the base script each set `hidden` from one attribute, so an element that varies by both would show whenever either matched. One module (`src/scripts/variants.ts`) now decides from all of an element's variant attributes at once.
- **A non-greedy regex isn't an HTML parser.** The corpus stripped hidden variants with `<div hidden>…</div>`, matching to the first closing tag. That was safe only while no hidden element held a nested div. The per-MHA ratio wrapper does, so it's now balanced on the tag.
- **Recompute, don't compare a thing with itself.** `page-ratios` doesn't trust the export: it divides rent by BAH again (rounding halves to even, as Python does) and checks the export, the pages and the plan against that.
- **Repeated words still rank.** One "BAH" in the ratio note and "allowance" in every caption were enough to send BAH questions back to 40 Cost sections. Wording on repeated sections is part of retrieval tuning.

## Session 10 (2026-10-20): the move sequence

- **Check the page against the export, and the export against the source.** The data repo proves each quote is on its saved official page before export; the site proves each deadline on a page is its row's, word for word. Neither alone would catch both a hand-typed deadline and a drifted quote.
- **Plant in memory when the check reads files.** `check_sequence.mjs --plant all` changes a copy of the pages or rows and confirms each kind fails, so the proof reruns in a second and never leaves a planted file behind.
- **The collection doesn't keep the file's order.** The forms page came out in id order; the check caught it. Order that means something has to come from the data, not from the loader.
- **New pages change retrieval for old questions.** Adding 81 chunks of official wording turned two out-of-scope questions into matches ("weekends", "renew"). Taking the quotes out of ranking made it worse (a schools question lost its page), so it was reverted; the eval is what showed both.
- **A string shared by a page, a plan rule and a check lives in one module.** The disclaimer, the Navy-rules line, the phase map and the "Not yet confirmed" wording are in `src/lib/sequence.js`, imported by all three, so the check compares against the words the page prints.

## Session 11 (2026-10-22): re-citing the sequence

- **An exemption needs its own proof.** Skipping the word list inside quote blocks would let any text dodge it by sitting in a blockquote. The exemption is keyed to the export instead: a `data-official-quote` block passes only if its text is an exported official quote, and anything else in one fails. Planting "retirees" in prose and in a fake quote block proved both halves.
- **A guard built for one figure caught a different one.** The BAH column guard flags any `*_dependents` column outside `bah.json`; the weight table tripped it. Renaming to `*_lb` kept the guard intact and made the unit part of the name.
- **A three-column table still needs a phone check.** `th.num` doesn't wrap, so "Without dependents" pushed the table past 375 px and clipped its caption; the layout check passed because tables scroll inside `.table-wrap` by design. Looking at the page at phone width is what found it.
- **Re-citing can move retrieval.** A longer quote on the travel claim step dropped seq-01. Swapping duplicate quotes for the higher source, and ordering the step's quotes, fixed it without touching the retriever; run the eval after every data re-export, not only after code changes.

## Session 11b (2026-10-22): two "Not yet confirmed" lines

- **A field that was "one of" became "a list of".** Making `unconfirmed` a list touched the data check, the export, the schema, two pages, the plan's line builder and the sequence check. The plan's check compares JSON, so it followed without a change; every place that read `.ask` directly had to change. Grep the field across both repos before changing its shape.

## Session 11e (2026-10-22): the first live eval

- **What the model is shown, it repeats.** Every section reached the model with a `URL:` line, so 40 of 43 answers ended with raw paths, duplicating the list under them. Telling it not to is weaker than not sending them: the prompt now carries a short label to cite by and no URLs at all.
- **Match citations on the label you gave, longest first.** "Santee: Cost" is a substring of "Santee: Cost vs BAH"; a plain substring test listed both. A match inside a longer label's match doesn't count.
- **An eval that crashes on the error it's looking for can't report it.** The `--url` mode called `res.json()`, so a Cloudflare 1102 page (HTML) would have thrown and ended the run. It now reads text first and records the error code.
- **Report what the run cost from the response, not from a guess.** The Function didn't return token counts, so the first run's cost is an estimate (thinking tokens are billed but invisible). It returns `usage` now.
- **A live run tests the eval as well as the model.** Three of the six failures were right answers that a rule couldn't read: "Five" against `\b5\b`, rents near "allowance", an honest gap in words the regex didn't list.

## Session 11f (2026-10-22): fixing eval rules

- **Fix a false positive with a test of what it must still catch.** Loosening `bah_sourced` for rents could have let a made-up allowance through; the self-test plants one. My first planted figure, $4,410, turned out to be a real `bah.json` value: check the plant against the data before trusting the test.
- **Replay the old answers through the new rule.** It showed cr-03 was a real miss (BAH figures with no year) that the old rule had passed only because citation dates looked like a year.
- **Route what ranking can't see.** "What do I do first?" has no word that's on the first step's page, so no BM25 tuning finds it without disturbing other questions. A fixed rule for that question shape adds the steps and leaves ranking alone.

## Session 11g (2026-10-22): captions

- **A caption is part of its table.** The text conversion turned `<caption>` into an ordinary line, so packing treated "Zip 92058" as a paragraph and could leave it at the end of one part with its table in the next. Rows without their caption are numbers without a zip; seven sections had it, and the model misread one live.
- **An eval that joins what the model sees separately can't see a split.** `has_fact` joined every part with a newline, which glued the caption back onto its table. Matching within one part is what the model actually gets.

