# Site build — status (2026-10-11, session 8: tiers by the top of the range everywhere; rules v0.5, v0.5.5)

**Scope done:** F1 skeleton, all 40 neighborhood pages, 20 base housing area pages, the Cowork UI, and the F5 intake v0 (starting plan, rules under test). Not built, by design: F2 sequence, F3 decision pages. F6 assistant: groundwork only (session 5b), no model connected.

## Session 8: answers to QUESTIONS 59–61 (rules v0.5, v0.5.5)

Branch `claude/awesome-wozniak-hx88dg`, restarted from `origin/main` after PR #3 merged.

**59: one tier rule everywhere.** `src/lib/tiers.js` holds `tierOf()` (the top of the drive range) and the tier labels; `drives()` in `src/lib/bases.ts` (base pages, the plan's data), the commute table's Tier column (`Commute.astro`) and the plan rules all use it. Base page lines already showed the range; the tier summary now gives the group's full span ("6 neighborhoods · 6–28 min"), and the intro says a neighborhood with several zips sits in the group for its slowest zip. Neighborhoods that changed group, per base:

| Base | Moved |
|---|---|
| Naval Base San Diego | 9 |
| MCAS Miramar | 9 |
| NAS North Island | 7 |
| Naval Amphibious Base Coronado | 10 |
| Naval Base Point Loma | 10 |
| Naval Medical Center San Diego | 8 |
| MCRD San Diego | 7 |
| Camp Pendleton | 7 |
| **Total** | **67** |

Every move is to a slower group (multi-zip neighborhoods only). 72 commute-table rows on neighborhood and base housing pages changed their Tier label too. Counted twice: from the data before the change, and by rebuilding the pages with the old rule and running the new check against them.

**New check `page-tiers`** (in `scripts/check_intake.mjs`, next to `intake-tiers`): on all 8 base pages, every card's range must fit its group, and each group must hold exactly the neighborhoods the plan puts in that tier for that base (same data, same `tierOf`); and on every neighborhood and base housing page, each commute-table row's Tier label must match its range. 320 cards and 480 rows. The old closest-zip rule fails it (206 failures across all 8 base pages, plus the 72 table rows).

**60: Camp Pendleton and the untied areas.** The Camp Pendleton base page has the line "We haven't confirmed whether Camp Pendleton families can apply to these areas. Ask LMH." above the areas LMH ties to no base, and that section's date line adds "Eligibility note: 2026-10-11". The text and date are one constant (`PENDLETON_UNTIED_NOTE` in `src/lib/bases.ts`) used by the page and the plan. Pendleton plans list those areas again; every line that names one (the base housing list, the pet lines, the wait warning, and the more-than-two-pets line) adds "We haven't confirmed whether Camp Pendleton families can apply here. Ask LMH" and cites `/base/camp-pendleton/#housing-untied` with that date. The gap is gone from `GAPS`. `intake-dates` knows the new "Eligibility note" label.

**61: kept.** Both items are on the LMH call list below.

Checks on 2026-10-11: all page checks; all eight intake checks (incl. `page-tiers`); the three Functions checks; layout clean on 75 pages at four widths. Rules v0.5, logged in the changelog (v0.5.5). Assistant eval: in-10's expected fact updated to the new NBSD under-30 summary ("16 neighborhoods · 9–28 min", was 21); expected fact in the sections sent 26 of 27, as before (in-16 still missing).

## LMH call list (site side)

The main call list is in the data repo's STATUS; these came from the site and should move there:

- **Camp Pendleton pet limits.** Pendleton's LMH pages say only "pets allowed", with no number, so the plan can't check a household with three or more pets against them (QUESTIONS 61).
- **Pendleton family eligibility for untied areas (PRD Q9).** Can Camp Pendleton families apply to the base housing areas LMH ties to no base? The Pendleton base page and plan say it's unconfirmed until we know (QUESTIONS 60).

## Session 7: plan rules v0.4 (v0.5.4)

Branch `claude/awesome-wozniak-hx88dg`, restarted from `origin/main` after PR #2 merged. From Brian's phone review (Camp Pendleton, E5–E6, under 30 days, single, 2-bed, 3 dogs, renting + base housing; where to live, then cost vs. BAH):

1. **Tiers from the top of the drive range.** In the plan, a place's tier comes from the top of its range at that base (under 30 / 30–44 / 45–59 / 60+), not from its closest zip. So Vista (14–35 to Camp Pendleton) is no longer "under 30 minutes". This applies everywhere the plan uses a tier: the where-to-live lead (under 30), the cost lead, the schools and child care leads (under 45) and the infant-care line's nearest neighborhood. With the base not chosen, the tier is the top of the drive to the nearest base. New check `intake-tiers`: in a section headed "under 30 minutes" or "within 45 minutes", the top of every line's drive range must be under the limit; the old closest-zip rule fails it (40,369 lines).
   **Base pages disagreed** (fixed in session 8): `/base/<slug>/` groups "Off base" by the closest zip's tier, as QUESTIONS 41 describes. 67 neighborhood/base pairs would move, at least one at every base. Examples: Vista 14–35 sits under "Under 30 min" on the Camp Pendleton page; Escondido 20–65 under "Under 30 min" on the Miramar page; Chula Vista (west) 24–30 and Spring Valley / Lemon Grove 20–40 under "Under 30 min" on the NBSD page. The "Tier" column in the commute table on every neighborhood and base housing page uses the same closest-zip rule. Base housing areas aren't grouped by tier on base pages.
2. **Camp Pendleton and the untied areas.** No page says Pendleton families' eligibility for the areas LMH ties to no base is unconfirmed (PRD Q9), so per the instruction it's a gap (in `GAPS`), and Pendleton plans leave those areas out: the base housing list, the wait check, the pet lines and the more-than-two-pets line. The section note now says "The areas Liberty Military Housing ties to Camp Pendleton". The Camp Pendleton base page listed them unqualified (QUESTIONS 60; session 8 added the caveat and brought them back into Pendleton plans).
3. **Wait vs. report window: at or past.** Flagged when the shortest matching wait starts at or after the window (`lo >= window`); under 30 days with a 1–3 month wait now flags. Wording: "No base housing wait … fits your report window". Also fixed: "the shortest" was the range across every matching row (it printed "1–18 months" for E7–E9 4-bed, merging 4- and 5-bed rows); it's now the single row that starts soonest. The courtesy-move text stays out (no page states it).
4. **More than two pets** cites every area the claim covers. The base housing index lists no pet policies, so it can't stand in.

Checks on 2026-10-11: all page checks; all seven intake checks (26,789 plans); the three Functions checks; layout clean on 75 pages at four widths. Rules v0.4, logged in the changelog (v0.5.4).

## Session 6: plan rules v0.3 (v0.5.3)

Branch `claude/awesome-wozniak-hx88dg`, restarted from `origin/main` after PR #1 merged. From Brian's phone review (O1–O3, Naval Base San Diego, children 0–2 and 3–5, one dog, priorities: admin sequence, then pets):

1. **Infant-care gap in "Watch for"** whenever the household has a child 0–2, whatever the priorities. It cites the Child care section of the neighborhood nearest the base (every neighborhood page states the gap), dated by that section, with the county referral service link. The same line left the child care lead, so it isn't said twice. Not a gap: a page already states it.
2. **Pet lines name communities.** The digest keeps each community's policy and where it comes from (the wait list or LMH's page). An area whose communities all share one policy keeps one line; otherwise there's one line per distinct policy, naming its communities ("Paradise Hills base housing, Bayview Hills: …" and "…, Paradise Gardens: …"). Communities that state no policy aren't listed, and the section note says so.
3. **Dates only for the facts on the line.** Base housing sources now take the facts they date (`waits`, `pets-list`, `pets-lmh`, `commute`). Fixed by that: pet lines (were "Waits and pets … Commute …", now "Pets: …" from the list or the LMH pages), the "Watch for" wait line and the more-than-two-pets line (no commute date), and the base housing list in the where-to-live lead (no pets date; commute only when a drive is shown). Also found in the other leads: child care lines show drive minutes but carried only the child care date; they now carry the commute date too. The skip line for base housing is labeled "Base housing", not "Waits". Neighborhood, cost, schools, spouse and bedroom lines were already right.

**New check `intake-dates`** (in `scripts/check_intake.mjs`): every date label on a line's sources must have its fact on the line (a "Commute" date needs drive minutes, a "Pets" date a pet policy, and so on), and every drive time, rent ratio, wait, pet policy, Mello-Roos status or center count on a line needs its date. A new label fails until the check knows what it dates. Planting the old pet sources and the old child care sources failed it (318 lines for the child care one).

Checks on 2026-10-11: all page checks; all six intake checks (26,789 plans, 15,937 distinct lines); the three Functions checks; layout clean on 75 pages at four widths. Rules v0.3, logged in the changelog (v0.5.3).

## Session 5e: answers to QUESTIONS 42–58 (rules v0.2, v0.5.2)

All of 42–58 are answered (moved to Answered in QUESTIONS). What changed:

- **45 (b):** when the first priority has no lead of its own, the plan leads with the second priority and the lead's note says why: "The move sequence isn't written yet, so this plan leads with your second priority, …". Pets first with base housing ruled out works the same way, with its own reason ("Rental pet policies aren't on this site yet, and base housing … is off your list"). With no usable second priority, a "No lead yet" notice says the same, plainly. The reason sits in the section note, which states no facts (44). In the check's sample: 2,837 plans lead with the second priority, 1,951 show the notice.
- **47:** reporting to Camp Pendleton and open to base housing → one "Watch for" line: Pendleton's wait times aren't in our data; contact LMH or the Camp Pendleton housing office. It cites `/base-housing/camp-pendleton/`, which already states the gap, dated as that page dates its wait-times section (LMH pages 2026-09-18). Also fixed: the Pendleton area line in the where-to-live lead was dated by the CNRSW wait list, which doesn't cover Pendleton; it now carries the LMH pages' date.
- **54:** `/ask/` sends the previous turn (last question and the answer shown; nothing older) with the next question. The preview shows the exact extras (previous turn, and the starting-plan fields only if ticked); a browser test confirmed the request body equals the preview plus the question, and "Clear this conversation" drops the previous turn. The server caps it (question 500 characters, answer 2,000), applies the fixed answers to the new question only, folds the previous *question's* words into retrieval at low weight (the answer isn't used for retrieval), and takes the named page from the new question only, so the old topic can't pull its own page back. The prompt calls it context, not a source. New eval item fu-01 ("What about from Santee?" after the Rancho Bernardo → NBSD question) finds the Santee → NBSD row.
- Rules version v0.2, logged in the changelog (v0.5.2).

Checks on 2026-10-11: all page checks, all five intake checks and the three Functions checks pass (Function 126 KB gzipped); layout clean on 75 pages at four widths. Retrieval-only eval, 41 questions: expected fact in the sections sent 26 of 27 (missing in-16, the drive-time source); expected page 27 of 28 (first for 26); expected section 22 of 22; out-of-scope stopped 3 of 4 (out-02 weather); fixed answers 4 of 4; no BAH dollar figure 24 of 24.

## Session 5d: retrieval sends whole sections; the eval checks facts

Your preview check ("How long is the commute from Rancho Bernardo to Naval Base San Diego?") showed sections reaching the model in pieces. Three causes, three fixes:

- **The commute summary carried all eight per-base variants** the page hides (only one shows), which pushed a one-table section over the size limit and split its table in two. The corpus now strips hidden variants from the summary line as well as the body. The Rancho Bernardo commute section is one chunk again.
- **Tables were split between rows when a section was long.** Now a section's parts are cut only between blocks (a whole table, or a line of text). A table that is itself over the limit (the long school lists) is split between rows and every part repeats the header row. 81 sections still have parts, mostly Schools.
- **Retrieval ranked parts on their own,** so it could send part 1 without part 2, or a lone part 2 from another page (the Rancho Peñasquitos half you saw). It now picks *sections*: 6 sections (at most 3 per page), and every part of each, in order. Citations name the section, not "part n of m". Before, the page also showed one citation per section URL, so two parts looked like one.

**Eval:** every in-scope, known-gap, BAH and safety question now has `expect_fact`, a pattern for the fact itself (e.g. the row `Naval Base San Diego (32nd St) … | 35 min |`), checked against the text actually sent (`has_fact`); in a live run, `expect_answer` is checked against the answer. 4 new questions: Rancho Bernardo → NBSD and Oceanside → Camp Pendleton commutes, Escondido 3-bed rent vs. the E7–E9 allowance, La Mesa HUD 2-bed rent. Setting the RB fact to a wrong value (36 min) failed `has_fact`.

Retrieval-only run, 40 questions:

| Rule | Result |
|---|---|
| Expected fact in the sections sent | **25 of 26** (missing: in-16, the drive-time source) |
| Expected page in the sections sent | 26 of 27 (first for 25) |
| Expected section in the sections sent | 21 of 21 |
| Out-of-scope stopped before the model | 3 of 4 (out-02 weather, unchanged) |
| Fixed answers (referral, demographic) | 4 of 4 |
| BAH: no dollar figure next to BAH in anything returned | 23 of 23 |

## Session 5c: why the preview build failed, and the fix

The branch's Cloudflare Pages build failed while compiling `functions/`, not in `npm run build`: `assistant/ask.js` imported a JSON file with `with { type: 'json' }`, which Node 22 accepts but wrangler 3 (in Cloudflare's build image) can't parse. Reproduced from a fresh clone (`npm ci`, `npm run build`, then `wrangler pages functions build`): wrangler 4.149 compiled it, 3.114 and 3.22 failed. Fixed by carrying the Q8 labels in the corpus instead; all three versions now compile it, and wrangler 3's local runtime answered with the household line built from them. New postbuild check `scripts/check_functions.mjs` (syntax wrangler 3 can't parse, JSON or Node built-in imports, `process.env`, bundle size). Function size: about 0.8 MB raw / 0.14 MB gzipped as wrangler builds it, against the 3 MB free-plan limit; the 1.3 MB corpus is a static asset, not part of the Function. Node pinned with `.node-version` (22). Details in LESSONS, session 5c.

## Session 5: starting plan (F5 intake v0, rules v0.1)

**Where it sits in the base-first flow.** The intake is its own page, `/plan/`, with two doors:

- **Base page** (`/base/<slug>/`): a "Starting plan for <base>" card under the heading. Clicking it saves question 1 as that base (localStorage, behind try/catch) and opens `/plan/`, so the family answers seven more questions. This is the spec's "after Pick your base": the base pick on the home page *is* question 1.
- **Home page:** a "Then get a starting plan" card directly under the eight base cards, for families who don't know their base yet (question 1 offers "Not sure yet").

Why not on the home page itself: eight questions above "Or just browse" would push the base cards' job (one tap to a sorted base page) below a form, and the home page would need a script. Why not a URL parameter from the base page: the spec says nothing goes in a URL, so the base travels in the reader's own storage, only because they clicked "Starting plan for <base>". With JavaScript off the card still opens `/plan/`, which says the questions need JavaScript and points back to the base pages.

**How it works.**

- The questions are static HTML (so the page checks read every word). The answers live in `localStorage` under `pcs-sd:intake` (with `rules_version`), behind try/catch; with storage blocked the page says the answers last only until you leave. There's no `<form>`, so nothing can be submitted or land in a URL. "Clear my answers" is on both the questions and the plan.
- The rules are `src/lib/intake/rules.js`: plain JavaScript, a pure function of the answers and the data, run in the browser. The data is a digest of the collections (`src/lib/intake/digest.ts`) embedded in the page as JSON: drive minutes, rent-to-BAH ratios by band and bedrooms, Mello-Roos status, child care counts, districts and boundary lookups, base housing waits and printed pet policies, the dates of each, and the links a rule can cite. Ratios only: no rent or allowance in dollars.
- The plan: your answers, then the lead (first priority), the bedroom helper's answer if asked, "Watch for", the tradeoff (none written yet), and "You can skip". Every line names its source page (or the official link) with that source's dates. It prints on white paper (print CSS: header, buttons and questions hidden; source paths printed after each link). Labeled "v0, rules under test" and "rules v0.1".
- Q8 list: `src/config/intake/priorities.json`. Tradeoff table: `src/config/intake/tradeoffs.json` (empty; the format is in its `_note`). Both feed the rules unchanged; edit either and bump `RULES_VERSION`.

**Rules as built** (§10.1; interpretations in QUESTIONS 42–51, all answered 2026-10-11; v0.2 changes in session 5e above):

| Rule | Built as |
|---|---|
| Lead: where to live / the commute | Neighborhoods in the under-30 tier, by minutes, each with the ratio for the band and bedrooms (+ Mello-Roos status if buying). If open to base housing: the base page's areas (tied to the base + tied to none) by drive, with the latest wait for the band and bedrooms |
| Lead: cost vs. BAH | Neighborhoods under 45 min whose ratio is at or under 100% across the whole band, lowest first; if none, a line that says so |
| Lead: kids' schools | Districts with a public school in the under-30 and 30–44 tiers, nearest first, with the boundary lookup (or "no lookup found yet"), the School Liaison Officers and the Interstate Compact |
| Lead: child care | Licensed center, infant-center and large-home counts per neighborhood in those tiers; the infant-care gap if a child is 0–2; the county referral service; MilitaryChildCare.com |
| Lead: spouse's job | MSEP, the three California licensure pages, the second-commute prompt |
| Lead: pets | Printed pet policies of the base page's areas, when open to base housing |
| "Not sure" base | Each neighborhood shows its two nearest bases; tiers come from the nearest; says so in the section note |
| Bedroom helper | CNIC's enlisted guidelines from Q4; asks "do any children 6 or older need separate rooms?" only when it changes the count; says CNIC lists no standard for officers and senior enlisted (E7 and up) |
| Watch for | Base housing wait past the report window (under 30 days = 1 month, 30–60 = 2, 60–90 = 3; flagged when even the shortest wait starts later); more than two pets against the printed policies |
| Skip list | Schools (no child 6–18), child care (no child under 6), Mello-Roos (not buying), base housing (not open to it) |

**Gaps: rules with nothing to point at yet (lines left out, no placeholder):**

1. Reporting in under 30 days or no orders yet → open with the arrival and first-30-days steps (needs F2).
2. Lead for "The admin sequence" and "Move logistics" (needs F2). Since rules v0.2 the plan leads with the second priority and says why.
3. The courtesy-move rule (Housing Service Center within 30 days; rejecting an offer can forfeit the move): not on any page or in the data.
4. Pets: "rental pet policies vary" isn't on any page; base housing breed restrictions aren't in the data. Pets first with base housing ruled out leads with the second priority (rules v0.2).
5. Tradeoffs: none written; the plan shows none.
6. Q3 "which phase the plan opens on" (F2).

**New checks** (`scripts/check_intake.mjs`, postbuild, after the page checks):

- `intake-network`: the intake pages (`/plan/`, home, the 8 base pages) and every script they load, imports included, use no `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `EventSource`, history or location writes, `window.open` or cookies, and have no `<form>`.
- `intake-sources`, `intake-no-bah`, `intake-words`: the check loads the rules and the data embedded in `dist/plan/`, builds 26,789 plans across the answer space (every base incl. "not sure" × band × bedroom choice × "open to" set × first priority; "Watch for" over every report window; every priority pair; every household up to 3 children per age group; every pet count to 4 + 4), and checks all 15,931 distinct lines: at least one source, the source page exists in `dist/` (or is an https link with its incentive label), a dated source line, no dollar figure at all, no demographic, score or placeholder words. Also: no dollar figure or allowance field in the embedded data; same answers give the same plan. 4.6 s.
- `intake-config`: the Q8 list and tradeoff table are well formed; a tradeoff with no source fails.
- Proved by planting: a `fetch(` in the plan bundle, a `<form>`, a missing source page, a `$1,234` and "affluent" in a neighborhood name, an undated source line, and a tradeoff with "TODO" and no source. All caught; the clean rebuild passed.
- In a real browser (headless Chromium): the base-page card pre-answered Q1; the separate-rooms question appeared only when it mattered; Q8 hid choices the household doesn't get; the plan rendered, survived a reload, and "Clear my answers" emptied storage. Zero network requests from answering through rendering.

Checks on 2026-10-11: all page checks pass (74 pages, 687 fact blocks, 1,889 outbound links; contrast 18 pairs, the two new print pairs included, lowest 5.33:1); all five intake checks pass; layout check clean at 390, 768, 1280 and 1440 px on 74 pages.

Version: v0.5 (changelog entry, `package.json` 0.5.0); the assistant groundwork is v0.5.1.

## Session 5b: assistant groundwork (F6), no model connected

No live model call was made this session. `/api/ask` runs in STUB mode until the two environment variables below exist.

**What's built.**

- **Corpus** (`scripts/build_corpus.mjs`, last postbuild step, after the checks pass): every published page split by dated section (and by `<h3>` subsection; long school tables in parts), each chunk with `url` (page + section anchor), `page_title`, `section_heading`, `text`, `verified_on` (latest date in the section's date line) and `dates` (the date line as printed). 843 chunks from 70 pages, 1.3 MB with the BM25 postings. Left out: text outside dated blocks (6 KB of intros), each page's "Sources and dates" block (the `/sources/` page has the rows once), `/plan/`, `/ask/` and the changelog. Of the per-base and per-band variants a page renders, only the visible default goes in.
- **Retrieval** (`assistant/retrieve.js`): BM25 over title + heading (counted 3×) + text, a small synonym list (BAH → housing allowance, daycare → child care, safe → hazards, …), a boost for the page a question names, at most 3 sections per page, 6 sent. "Nothing relevant" = top score under 4.0 or no matched word beyond generic ones ("San Diego", "base", "neighborhood"). The postings are built at build time so a cold Function only parses JSON (about 16 ms in Node) and reads the query's terms (under 1 ms). No embeddings.
- **System prompt** (`assistant/prompt.js`): every §11 rule plus the principles: answer only from the numbered sections, the exact "I don't have that in the San Diego material" line plus the nearest page, cite page + URL + verified date, no BAH dollar figure (never computed from a ratio either), places by commute/cost/schools/hazards/climate only, never safe/unsafe, never name or recommend a realtor/lender/mover/landlord/property manager and say why, no scores or rankings, the known holes (small in-home child care, AC, base housing waits incl. Pendleton, crime, drives to places other than bases), and the shape: short, one recommendation, the tradeoff named. The prompt is fixed text (no date), so it can be cached.
- **The Function** (`functions/api/ask.js` + `assistant/ask.js`): same-origin POST `/api/ask` with `{question, context?}`.
  - Reads `ANTHROPIC_API_KEY` and `ASSISTANT_MODEL` from the environment; no key or model in the repo, no default model in code. Either missing → STUB: returns the retrieved chunks and the assembled prompt.
  - Fixed answers before any model call: realtor/lender/mover/landlord requests and "who lives there" questions (the principle word list plus a few patterns). Nothing relevant retrieved → "I don't have that…" + the nearest page, also without a model call.
  - Live: one Messages API call through `@anthropic-ai/sdk`, model from the env var, max 4,096 tokens, thinking and effort at the model's defaults (the model is chosen at deploy time, so only parameters every current model accepts). A refusal gets "I can't answer that one here" + the nearest page. Then the **output filter**: any dollar figure within 120 characters of "BAH" / "housing allowance" / "basic allowance", or in the same sentence, replaces that sentence with a fixed notice.
  - Logs no question or answer text: `console.error` only on failures, with the error type and HTTP status.
  - Intake context is accepted only as `{base, band, kids: [age groups], priorities: [≤2]}`, each checked against the intake's own values; anything else is dropped (a planted `ssn` field was dropped in the test).
  - Daily cap: if the KV binding `ASK_LIMITS` exists, one counter per UTC day (`asks:YYYY-MM-DD`, expires after 2 days), cap from `ASK_DAILY_CAP` (default 200), 429 when reached. No IP or anything else about the asker. **No `ASK_LIMITS` binding exists in this repo** (there's no `wrangler.toml`; bindings live in the Pages dashboard, which I can't see), so as deployed the cap is skipped and responses carry `X-Ask-Cap: off`.
- **UI** (`/ask/`): not linked from any page or menu (checked: no `href="/ask/"` in `dist/`), noindex like every page, conversation in a JavaScript array only (no localStorage, no cookies: checked in a browser), "Questions go to an AI model and aren't stored by this site." Starting-plan answers go only if "Include my starting-plan answers" is ticked, and the page shows the exact JSON first; in the browser test the POST body matched the preview byte for byte. Each question is sent on its own (no history). Works only with JavaScript; says so otherwise.
- **Checked in the real runtime:** wrangler 4.149 compiled the Function, and `wrangler pages dev dist` (workerd) answered in STUB mode, gave the referral and no-answer replies, returned 405 on GET and `X-Ask-Cap: off`.

**Eval** (`evals/assistant_eval.jsonl`, 36 questions at the time, 40 since session 5d; `scripts/eval_assistant.mjs`): 17 in-scope with expected page (and section), 2 known holes, 4 out-of-scope, 2 BAH-dollar baits, 2 demographic, 2 referral, 2 "is X safe", 5 the site should cover but doesn't. Retrieval-only run on 2026-10-11:

| Rule | Result |
|---|---|
| Expected page in the sections sent | 22 of 23 (first for 21) |
| Expected section in the sections sent | 17 of 17 |
| Out-of-scope stopped before the model ("I don't have that" + nearest page) | 3 of 4 (out-02 "weather forecast" retrieves Climate; the model has to decline) |
| Referral and demographic baits get the fixed answer | 4 of 4 |
| BAH baits: no dollar figure next to BAH in anything returned | 2 of 2 (and 19 of 19 overall) |
| Daily cap with a fake KV (cap 3, 4th refused, no IP stored); no binding = off | pass |
| Needs the model (cites page, dated, short, no demographic words, no safe/unsafe claim, honest "I don't have that") | skipped in this mode |

The miss: in-16 "Where do your drive times come from?" (expected `/sources/`; retrieval sends commute sections, whose source lines aren't indexed). Expected page second, not first: in-13 (Mira Mesa jet noise; the Miramar / Mira Mesa base housing page shares the zip and ranks first). All 5 "not yet covered" questions and both known holes pass the retrieval gate, so only the model can say "I don't have that": that's the week-5 failure mode, and the live run is what tests it.

**Writing list** (questions with no good source page):

1. Where our numbers come from, in plain words (in-16): `/sources/` is a table of layer codes; no sentence says "drive times are Google's 0700 prediction".
2. The courtesy-move rule (nyc-01): Housing Service Center within 30 days, rejecting an offer can forfeit the move. Also an intake gap.
3. Rental pet policies (nyc-02): nothing about off-base pets. Also an intake gap.
4. What to do first after orders (nyc-03): the F2 sequence.
5. Spouse licensure (nyc-04): the three California pages are in `links.json` but on no page.
6. Air conditioning in rentals (nyc-05): known hole; only July highs and days over 90°F.
7. Camp Pendleton base housing waits (gap-01): the page says they're not in our data.
8. Small in-home child care, especially for infants (gap-02): the page names the gap; there's no list.
9. Weekend weather (out-02): out of scope, but it shows that "weather" retrieves Climate, so the model has to decline it.

## Go live: the assistant (steps for Brian)

1. **Anthropic key.** In the Anthropic Console, create an API key for this project (a workspace with a monthly spend limit is the simplest cost guard). In Cloudflare: Workers & Pages → the site's Pages project → Settings → Variables and Secrets → Add → type **Secret**, name `ANTHROPIC_API_KEY`, value the key. Add it for **Preview** first if you want to test on a branch preview, then **Production**.
2. **Model.** Same screen → Add → type **Text**, name `ASSISTANT_MODEL`, value the model ID, e.g. `claude-opus-5-5` (`claude-sonnet-5-5` or `claude-haiku-5-5` cost less; the code has no default and accepts any current model).
3. **Optional daily cap.** Workers & Pages → KV → Create namespace (e.g. `pcs-sd-ask-limits`). Then the Pages project → Settings → Bindings → Add → KV namespace, variable name `ASK_LIMITS`, pick the namespace. Optional text variable `ASK_DAILY_CAP` (default 200). Without the binding there is no cap.
4. **Redeploy** (Deployments → the latest → Retry deployment, or push a commit): variables apply to new deployments only.
5. **Check it's live:** `curl -s -X POST https://<deployment>.pages.dev/api/ask -H 'Content-Type: application/json' -d '{"question":"How long is the base housing wait at Murphy Canyon?"}'` should return `"mode":"live"` and an `answer`; the `X-Ask-Cap` header shows `n/200` if the cap is on.
6. **Rerun the eval live**, against the deployment (uses its key and model): `node scripts/eval_assistant.mjs --url https://<deployment>.pages.dev --json evals/live_run.json`. Or locally, after `npm run build`: `ANTHROPIC_API_KEY=… ASSISTANT_MODEL=claude-opus-5-5 node scripts/eval_assistant.mjs --live --json evals/live_run.json`. 36 questions; 29 of them reach the model (about 3K input tokens each: the prompt plus six sections). `evals/*_run.json` is gitignored.
7. **Watch for:** Cloudflare's free plan allows 10 ms of CPU per request, and a cold Function spends about 16 ms parsing the corpus. If you see error 1102 (CPU exceeded) on the first question after a quiet spell, either move to Workers Paid or trim the corpus (school tables are the bulk). Leave Workers Logs / Logpush request bodies off, so questions aren't captured by Cloudflare either.

## Session 4c: base pages match neighborhood pages

- `/base/<slug>/` uses the neighborhood layout: the sticky side menu (≥1100 px) with "Off base" (one link per tier group) and "Base housing" ("Tied to this base", "Not tied to a base") nested under it, and one content column. Each tier group and housing group is a `FactBlock` (`level={3}`, tier chip as the title) with a summary line and its dated source line. The segmented toggle, the two-column grid, the sticky housing pane and their CSS are gone; only the page scrolls.
- Below 1100 px every group starts closed, so Off base and Base housing fit on one phone screen (QUESTIONS 40). Works without JavaScript; with it, a menu link or `#housing-tied` in the URL opens the group.
- Layout check: 73 pages at 390, 768, 1280 and 1440 px, none scrolls sideways. All principle checks pass.

## Later

- Base pages: On-base amenities section (commissary, exchange, exchange gas, clinic/hospital from T7 access points; hours and links from official pages).

## Session 4b: desktop layout and dates

- **Breakpoints:** phone layout unchanged. At 720 px and up the container is 960 px; at 1100 px and up it's 1200 px with 32 px side padding. Running text stops at 68 characters; tables, card grids and tile rows take the full width. Header and footer follow the container; the stripe spans the window.
- **Home:** base cards in 2 columns (tablet) and 4 (desktop); browse tiles side by side below. **Indexes:** `/neighborhoods/` cards and the `/base-housing/` group blocks in 2 and 3 columns. **Base pages (≥1100 px):** off-base tiers on the left (2/3), base housing on the right (1/3, sticky, scrolls inside itself when it's taller than the window); the toggle shows only below 1100 px. Untied areas are under the subheading "Not tied to a specific base by LMH". **Neighborhood and area pages (≥1100 px):** sticky 220 px column of section links (`src/components/Toc.astro`; a link opens a closed section); tiles in one row of four from 720 px.
- **Checked:** `scripts/check_layout.mjs` loaded all 73 pages at 390, 768, 1280 and 1440 px: none scrolls sideways (a planted 900 px element was caught at 390 and 768).
- **Dates:** the CAL FIRE download date is now 2026-09-30 (it was the UTC date). All pull scripts use `pull/dates.py` (America/Los_Angeles) in the data repo, and the export refuses any date after today in San Diego.

## Session 4: what changed

- **Theme:** `src/styles/theme.css` holds every color and font token; `site.css` uses only those (the contrast check enforces it). Fonts are self-hosted from `@fontsource` (latin subset; Bricolage Grotesque 600/700, DM Sans 400/500/700). No gradients, shadows or emoji; 12 px cards; touch targets 44 px.
- **Layout:** four-band stripe, bar with the site name or "‹ back" and a BETA label, footer with the two lines plus the unofficial line, Sources and What changed.
- **Home** is base-first: 8 base cards, then "Or just browse" (Neighborhoods 40, Base housing 20).
- **Base pages** (`/base/<slug>/`, 8): Off base / Base housing as anchor links styled as a segmented control; CSS `:target` picks the pane, no JavaScript. Off base: all 40 neighborhoods under tier chips, sorted by minutes, linking with `?base=`. Base housing: areas tied to the base with member count and wait range (CNRSW estimate), then the areas LMH ties to no base.
- **Neighborhood and area pages:** "At a glance" tiles (2×2), every section a native `<details>` with a data-built summary line and its dated source line. Neighborhood pages have a pay-band select (default E5–E6, kept in localStorage behind try/catch) and follow `?base=`; every variant is rendered server-side and the inline script only toggles `hidden`.
- **New checks:** `contrast` (source stage: 16 theme pairs ≥ 4.5:1, lowest 5.33:1; no raw colors outside the theme) and `third-party` (dist: nothing loaded from another origin by a page or stylesheet). Both tested by planting violations.

## Pages (75)

| URL | Built from |
|---|---|
| `/` | Base-first home: the 8 bases, the starting plan card, then "Or just browse" |
| `/plan/` | Starting plan (F5 intake v0): `src/pages/plan.astro`, rules in `src/lib/intake/rules.js` |
| `/ask/` | Assistant (F6 groundwork), not linked: `src/pages/ask.astro` → `functions/api/ask.js` |
| `/base/<slug>/` (8) | Neighborhoods and base housing sorted by the 0700 drive to that base (`src/lib/bases.ts`) |
| `/neighborhoods/` | All 40, A to Z, with corridor |
| `/communities/<slug>/` (40) | Exported data, one page per row of `communities.json`. A `src/content/communities/<slug>.md` file is optional and holds the lead and gotchas; only Rancho Bernardo has one (placeholder, so nothing renders) |
| `/base-housing/` | Index: the 20 areas grouped by the base LMH names, each with its October 2026 wait range; Prospect View and Woodlake listed as location not yet placed |
| `/base-housing/<area>/` (20) | `src/data/base_housing_areas.json` (from `manual/base_housing_areas.csv` in the data repo) + LMH communities + the latest wait list + the shared zip sections; `src/content/base-housing-areas/<area>.md` for the lead and gotchas (placeholders, not rendered) |
| `/sources/` | `src/data/sources.json`, generated from `EAP_Data_Source_Log.md` (latest row per layer) + round-1 layers |
| `/changelog/` | `src/content/changelog/` (F11): v0.1 through v0.5 |

Neighborhood sections: cost (HUD rent by bedroom, rent-to-BAH ratio by pay band, Mello-Roos by subarea + per-parcel lookup, ACS medians), then the shared zip sections, gotchas when written, and sources and dates. Base housing is not on neighborhood pages.

Base housing area sections: communities (bedrooms, eligible grades as LMH states them, grades on the list, pet policy, LMH link), wait times by pay band (CNRSW estimate, October 2026, with both PDFs), how to apply (HEAT, DD 1746, HSC check-in, from the saved CNIC pages), cost as printed on the list, then the shared zip sections. No Mello-Roos, no rent-to-BAH ratio, no ACS medians.

Shared zip sections (`src/components/sections/`): commute to every gate at 0700, schools, child care, military access, climate, hazards, sources and dates.

Gaps (`src/lib/gaps.ts`): a zip with no row in a layer gets a one-line "No … for zip …: why" in that section. No community zip is missing a row today (none of the five `remote` zips or the out-of-county school zips belong to a community), so these lines don't render yet. In-row gaps that do render: clinic row (withheld), weather station >300 m elevation difference (91978, 92027), school dashes, ACS top-coded or unpublished medians, aircraft noise beyond Miramar.

## Checks (all pass on 2026-09-30, session 4)

Source: no-score, no-bah, license, dated, data, contrast. Dist: 73 pages, dated (654 fact blocks), no-bah (exact figures ran locally), no-demo, no-score, incentive (1,889 outbound links), noindex, placeholder, third-party. Build 1.7 s wall clock (Astro 688 ms for 73 pages); dist 2.6 MB, of which fonts 212 KB. Session 4b: same checks, all pass; layout check clean at four widths.

### Session 3

Source: no-score, no-bah, license, dated, data. Dist: 64 pages, dated (576 fact blocks), incentive (1,889 outbound links; session 3b). The BAH check fired twice as expected (QUESTIONS 13); both reviewed and allow-listed per page in `scripts/bah_check_allow.json`. A planted $4,410 on another page still fails.

Session 2: dated (240 fact blocks), no-bah (exact figures + context), no-demo, no-score, incentive (597 outbound links), noindex, placeholder (new). Tested by planting violations in `dist/`: the original 10 plus 3 placeholder patterns were all caught. A note set to `draft` with real text renders; a placeholder renders nothing.

## For the PRD decision log

Moved to PRD §16 in the data repo on 2026-09-30 (BAH ratio, CFD names, Q3, Q6, the base housing design change).

## Open

See `QUESTIONS.md` (open: 21–24, plus 14 and 16 with Brian) and the LMH call list in the data repo's STATUS. Before public: Brian writes the leads and gotchas (none render until written); clinics get placed (the clinic row reappears on its own).

## Next session

Brian reviews the branch preview: `/plan/` (try a few households, print one), the "Starting plan" cards on home and the base pages, and `/ask/` (STUB until the key and model are set). Then the tradeoff table (`src/config/intake/tradeoffs.json`), and the writing list above. Going live with the assistant: the steps above, then the live eval.

Still open from session 4: Brian writes leads and gotchas (one `.md` per community; the page picks it up). FHSZ files (QUESTIONS 25), the NASNI/NOLF IB hand-assignment, Coronado's boundary lookup (29), beach-link placement (30).
