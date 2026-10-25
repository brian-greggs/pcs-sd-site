#!/usr/bin/env node
// Front end checks that need a browser (not part of npm run build, like check_layout.mjs). Needs Playwright with a
// Chromium (`npm i --no-save playwright && npx playwright install chromium` on a Mac; the cloud container has both).
//
//   npm run build && npx astro preview --port 4329 &
//   FRONTEND_BASE=http://localhost:4329 node scripts/check_frontend_browser.mjs
//
// /api/ask doesn't exist under astro preview, so the browser's requests to it are answered here by the real handler
// (assistant/ask.js) over the built corpus in STUB mode: no model, and the reply has no answer text.
//
//   home        at 390×844, 768×1024 and 1280×800: the ask box and the example chips are on the first screen, the
//               region map starts right under the example chips (within 24 px) inside the content column, and the
//               footer is in the page flow (not fixed or sticky) and reaches the bottom of the window
//   chip        the move chip at 390 px: empty it's "+ Add your move" at the bottom left of the box, Ask at the right,
//               and it opens the plan; set it shows base · pay band · household (cut to fit, nothing past the box),
//               its button has a name and aria-expanded, Enter opens the menu (See your plan, Edit answers, Clear),
//               Tab walks it, Escape closes it with focus back on the chip, a click outside closes it; Edit answers
//               opens card 1; × has a name and turns the chip off; Clear asks first (Cancel keeps the answers), then
//               empties it and this browser's answers
//   ask-body    every network request home makes, across four questions: exactly one POST to /api/ask per question
//               and nothing else; each body holds only question, previous and the allowed context fields, the
//               context equal to the chip's answers (none when there are none; none after ×, also after a reload
//               and after editing the answers on /plan/; back after "Send it with my questions", also after a
//               reload); "What's sent?" lists exactly the fields that then go, under plain labels, and its JSON is
//               the body
//   plan-network /plan/ from load through all eight cards, the plan, Edit and Clear: no request but its own static
//               files (same origin, GET, no query): no fetch, XHR, beacon, socket or POST
//   --plant extra-field | context-after-x | off-not-kept | plan-post | all: rewrite the built JavaScript as served (the
//               fault lands in the page's own code: the chip sends the timeline, × doesn't turn the context off, × isn't
//               kept over a reload, /plan/ posts to /api/ask); each must fail ask-body or plan-network
//   footer      on a short page (/browse/ at 1280×1600) the footer is pushed to the bottom of the window
//   site-name   "San Diego PCS Guide" is in the header, links to /, fits and overlaps nothing at 390 px on home, an
//               answer, the plan cards and result, a neighborhood, a base, /browse/ and /sources/; "Start over" shows
//               under it on the plan and once home has a conversation, not on home's start screen
//   legend      on every intake card at 390 and 1280 px the question (legend) ends above the options and the
//               fieldset has no border for it to sit on
//   menu        phone: the button opens the drawer, focus goes to the close button, the page behind is inert, Tab and
//               Shift+Tab stay inside, Escape closes and focus returns to the button. 1280 px: a sidebar on load,
//               nothing inert, the close button collapses it, and it stays collapsed on the next page in this tab
//   no-js       with JavaScript off the menu button goes to /browse/; home shows no ask box and says why; /plan/ shows
//               its notice, as before
//   redirect    /ask/ ends on /
//   cards       one card at a time with "Question n of 8"; a tap, Space or an arrow key selects without moving on;
//               Next is disabled until the card is answered ("Not sure yet" counts; pets never wait), then Next or
//               Enter moves on; Back goes back; the new card's fieldset has focus; with every priority offered, each
//               card's Back/Next (or Show my plan) is on the first phone screen
//   plan-gate   the plan can't be reached with a required answer missing: from empty answers every required card
//               holds Next (and Enter) until answered, "Show my plan" waits for question 8, and stored answers with a
//               gap open on the first unanswered card, never the plan; a click on a held button does nothing
//   plan-misc   a corrupt or null pcs-sd:intake on /plan/ is reset (no "storage blocked" note, the next answer saves);
//               Clear asks first; the BAH lines cite /base/<slug>/#bah-table; question inputs have names that say what
//               they are; the bedroom helper says CNIC lists no standard for officers and senior enlisted, and the
//               enlisted guidelines for E1–E6; for a member moving alone the ratio sections say they use the
//               with-dependents rate and show the band's without-dependents rate from bah.json beside it (none with
//               "Not sure yet"); a household with a partner gets neither
//   ask         a question shows "Checking the sources…", then the reply with its source chip ("N sources ·
//               verified <date>") and a related-page card; the box becomes "Ask a follow-up"; "What's sent?" shows the
//               previous turn; "Ask about this plan" arrives with the chip set and the box focused; source links and
//               the related card open in a new tab (noopener); focus moves to the answer and the status reads it
//   ask-panel   at 390×844 with "What's sent?" open after an answer: the panel isn't inside the sticky box, its height
//               is capped, the previous answer shows cut to about 200 characters with "(full text sent, N characters)",
//               and the answer's source link and related card are each the top element at their own position
//   ask-errors  /api/ask answers 429, 502, 503 and a non-JSON 500: no turn, nothing kept as the previous turn, the
//               question back in the box, no source chip or related card; the daily cap and 502 link "browse the
//               pages"; New conversation while an answer is pending drops it (never shown, never sent as previous);
//               no reply in 45 s stops with a try-again message; a javascript: source URL isn't a link; an empty Ask
//               says "Type a question"; the counter shows from 400 characters
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleAsk } from '../assistant/ask.js';
import { buildIndex } from '../assistant/retrieve.js';
import { CONTEXT_FIELDS, cleanContext } from '../assistant/context.js';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { console.error('Needs Playwright: npm i --no-save playwright'); process.exit(2); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.FRONTEND_BASE ?? 'http://localhost:4329';
const index = buildIndex(JSON.parse(readFileSync(join(ROOT, 'dist', 'assistant', 'corpus.json'), 'utf-8')));
const failures = [];
const passes = [];
const expect = (check, ok, what) => { if (!ok) failures.push(`${check}: ${what}`); };
const plantArg = process.argv.includes('--plant') ? process.argv[process.argv.indexOf('--plant') + 1] : null;

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const context = async (viewport, opts = {}) => {
  const ctx = await browser.newContext({ viewport, isMobile: viewport.width < 700, hasTouch: viewport.width < 700, ...opts });
  await ctx.route('**/api/ask', async (route) => {
    const r = await handleAsk({ body: JSON.parse(route.request().postData()), env: {}, index });
    await new Promise((res) => setTimeout(res, 400));
    await route.fulfill({ status: r.status, contentType: 'application/json', body: JSON.stringify(r.json) });
  });
  return ctx;
};
const active = (page) => page.evaluate(() => {
  const a = document.activeElement;
  return a ? `${a.tagName.toLowerCase()}${a.dataset.menuClose != null ? '[close]' : ''}${a.dataset.menuBtn != null ? '[menu]' : ''}${a.classList.contains('current') ? '.current' : ''}` : '';
});

// Starting-plan answers with every kind of field, so a chip that leaked one would show it.
const ANSWERS = { base: 'NBSD', band: 'E5–E6', timeline: '60-90', partner: true, kids: { '0-2': 0, '3-5': 0, '6-9': 2, '10-13': 1, '14-18': 0 }, bedrooms: '3', separate6: null, cats: 1, dogs: 1, open: ['renting'], priorities: ['where', 'cost'] };
const SENT = { base: 'NBSD', band: 'E5–E6', partner: true, kids: ['6-9', '10-13'] };
const setAnswers = (page, answers) => page.evaluate((a) => { localStorage.clear(); if (a) localStorage.setItem('pcs-sd:intake', JSON.stringify({ rules_version: 'v0.9', answers: a })); }, answers);

// A plant rewrites the built JavaScript as the browser gets it, so the fault is in the page's own code. Each edit must
// change the code it's meant for, or the plant didn't land (and counts as missed).
const PLANTS = {
  'extra-field': { group: 'ask-body', what: 'the chip also sends the timeline', edit: (code) => code.replace(/(\b\w+)&&\((\w+)\.context=\1\)/, '$1&&($2.context={...$1,timeline:`60-90`})') },
  'context-after-x': { group: 'ask-body', what: '× doesn\'t turn the context off', edit: (code) => code.replace('.included=!1', '.included=!0') },
  'off-not-kept': { group: 'ask-body', what: '× isn\'t stored, so a reload turns the context back on', edit: (code) => code.replace('.chip_off=!0', '.chip_off_unused=!0') },
  'plan-post': { group: 'plan-network', what: '/plan/ posts its answers to /api/ask', edit: (code, url) => (url.includes('/plan.astro') ? `${code};fetch(\`/api/ask\`,{method:\`POST\`,headers:{"Content-Type":"application/json"},body:JSON.stringify({question:localStorage.getItem("pcs-sd:intake")??"x"})});` : code) },
};
const plantRoutes = async (ctx, plant) => {
  const landed = { n: 0 };
  if (!plant) return landed;
  await ctx.route('**/_astro/*.js', async (route) => {
    const res = await route.fetch();
    const code = await res.text();
    const out = plant.edit(code, route.request().url());
    if (out !== code) landed.n++;
    await route.fulfill({ response: res, body: out });
  });
  return landed;
};
// Requests that can carry data: anything but this site's own static files fetched plainly.
const STATIC_TYPES = ['document', 'stylesheet', 'script', 'font', 'image'];
const dataRequest = (r) => {
  const u = new URL(r.url());
  return r.method() !== 'GET' || u.origin !== new URL(BASE).origin || u.search !== '' || !STATIC_TYPES.includes(r.resourceType());
};
const describe = (r) => `${r.method()} ${new URL(r.url()).pathname}${new URL(r.url()).search} (${r.resourceType()})`;

// --- ask-body ---
const LABELS = { question: 'Your question', previous: 'Previous turn', 'context.base': 'Base', 'context.band': 'Pay grade', 'context.partner': 'Spouse or partner', 'context.kids': 'Children’s age groups' };
async function checkAskBody(plant) {
  const ctx = await context({ width: 390, height: 844 });
  const landed = await plantRoutes(ctx, plant);
  const page = await ctx.newPage();
  const reqs = [];
  page.on('request', (r) => reqs.push(r));
  await page.goto(`${BASE}/`);
  let asked = 0;
  // One question: what "What's sent?" lists just before, then every request from the tap until the answer shows.
  const ask = async (question) => {
    await page.locator('[data-q]').fill(question);
    if (await page.locator('[data-sent-panel]').isHidden()) await page.locator('[data-whats-sent]').click();
    const listed = await page.locator('[data-sent-fields] li').evaluateAll((lis) => lis.map((li) => li.dataset.field));
    const labels = await page.locator('[data-sent-fields] li strong').allTextContents();
    const shown = JSON.parse(await page.locator('[data-context-json]').textContent());
    const from = reqs.length;
    await page.locator('[data-send]').click();
    asked++;
    await page.waitForFunction((n) => document.querySelectorAll('.ask-answer:not(.ask-waiting)').length === n, asked);
    await page.waitForTimeout(150);
    const sent = reqs.slice(from);
    const posts = sent.filter((r) => r.method() === 'POST' && new URL(r.url()).pathname === '/api/ask');
    const other = sent.filter((r) => !posts.includes(r) && dataRequest(r));
    expect('ask-body', posts.length === 1 && !other.length, `"${question}": ${posts.length} POSTs to /api/ask and ${other.length} other requests (${other.map(describe).join(', ')})`);
    const body = posts[0] ? JSON.parse(posts[0].postData()) : {};
    const extra = Object.keys(body).filter((k) => !['question', 'previous', 'context'].includes(k));
    expect('ask-body', !extra.length && body.question === question, `"${question}": body has ${Object.keys(body).join(', ')}`);
    if (body.previous) expect('ask-body', Object.keys(body.previous).every((k) => ['question', 'answer'].includes(k)), `"${question}": previous has ${Object.keys(body.previous).join(', ')}`);
    if (body.context) {
      expect('ask-body', Object.keys(body.context).every((k) => CONTEXT_FIELDS.includes(k)) && JSON.stringify(cleanContext(body.context)) === JSON.stringify(body.context), `"${question}": context ${JSON.stringify(body.context)} has a field or value outside the allow list`);
    }
    expect('ask-body', labels.every((l, i) => LABELS[listed[i]] === l), `"${question}": "What's sent?" labels ${labels.join(', ')}`);
    const want = ['question', ...(body.previous ? ['previous'] : []), ...Object.keys(body.context ?? {}).map((k) => `context.${k}`)];
    expect('ask-body', listed.join() === want.join(), `"${question}": "What's sent?" listed ${listed.join(', ')}; sent ${want.join(', ')}`);
    expect('ask-body', JSON.stringify(shown) === JSON.stringify(body), `"${question}": "What's sent?" showed ${JSON.stringify(shown)}, sent ${JSON.stringify(body)}`);
    return body;
  };
  // No answers in this browser: the question alone.
  await setAnswers(page, null);
  await page.reload();
  let b = await ask('How long is the base housing wait at Murphy Canyon?');
  expect('ask-body', !b.context && !b.previous, `no answers stored: sent ${JSON.stringify(b)}`);
  // Answers stored: the chip's four fields, nothing else from them.
  await setAnswers(page, ANSWERS);
  await page.reload();
  asked = 0;
  b = await ask('Where should we look to live?');
  expect('ask-body', JSON.stringify(b.context) === JSON.stringify(SENT), `chip set: sent context ${JSON.stringify(b.context)}, want ${JSON.stringify(SENT)}`);
  b = await ask('What about the schools there?');
  expect('ask-body', b.previous && JSON.stringify(b.context) === JSON.stringify(SENT), `follow-up: sent ${Object.keys(b).join(', ')}`);
  // × turns it off for the next question (and after).
  await page.locator('[data-ctx-x]').click();
  b = await ask('How do I file my PCS travel claim?');
  expect('ask-body', !('context' in b), `after ×: sent context ${JSON.stringify(b.context)}`);
  b = await ask('And the deadline for it?');
  expect('ask-body', !('context' in b), `two questions after ×: sent context ${JSON.stringify(b.context)}`);
  // Off is kept with the answers: a reload keeps it off, and so does editing the answers on /plan/.
  await page.reload();
  asked = 0;
  expect('ask-body', (await page.locator('[data-ctx-text]').textContent()) === 'Your move: off', `after × and a reload the chip reads "${await page.locator('[data-ctx-text]').textContent()}"`);
  b = await ask('How long is the base housing wait at Murphy Canyon?');
  expect('ask-body', !('context' in b), `after × and a reload: sent context ${JSON.stringify(b.context)}`);
  await page.goto(`${BASE}/plan/#edit`);
  await page.locator('#main label.opt', { hasText: 'MCAS Miramar' }).click();
  await page.waitForTimeout(400);
  await page.goto(`${BASE}/`);
  asked = 0;
  b = await ask('Where should we look to live?');
  expect('ask-body', !('context' in b), `after × and an edit on /plan/: sent context ${JSON.stringify(b.context)}`);
  await setAnswers(page, ANSWERS);
  await page.reload();
  asked = 0;
  // Back on from the chip's menu.
  await page.locator('[data-ctx-x]').click();
  await page.locator('[data-ctx-btn]').click();
  const on = page.locator('[data-ctx-on]');
  expect('ask-body', await on.isVisible(), 'after ×, the chip\'s menu has no "Send it with my questions"');
  if (await on.isVisible()) await on.click();
  else await page.keyboard.press('Escape');
  b = await ask('Which neighborhoods are closest to Camp Pendleton?');
  expect('ask-body', JSON.stringify(b.context) === JSON.stringify(SENT), `turned back on: sent context ${JSON.stringify(b.context)}`);
  await page.reload();
  asked = 0;
  b = await ask('What schools serve Santee?');
  expect('ask-body', JSON.stringify(b.context) === JSON.stringify(SENT), `turned back on, after a reload: sent context ${JSON.stringify(b.context)}`);
  if (plant && !landed.n) failures.push(`plant: ${plantArg} didn't land`);
  await ctx.close();
}

// --- plan-network ---
async function checkPlanNetwork(plant) {
  const ctx = await context({ width: 390, height: 844 });
  const landed = await plantRoutes(ctx, plant);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/plan/`);
  await setAnswers(page, null);
  const reqs = [];
  page.on('request', (r) => reqs.push(r));
  await page.reload();
  await page.waitForLoadState('load');
  const atLoad = reqs.length;
  const progress = () => page.locator('[data-progress]').textContent();
  for (let i = 0; i < 8; i++) {
    const at = await progress();
    const opt = page.locator('fieldset.q.current label.opt');
    if (i === 7) { await page.locator('[data-pick-list] button').nth(0).click(); await page.locator('[data-pick-list] button').nth(1).click(); break; }
    if (await opt.count()) await opt.first().click();
    await page.waitForTimeout(350);
    if ((await progress()) === at) await page.locator('[data-card-next]').click();
  }
  await page.locator('[data-show-plan]').click();
  expect('plan-network', await page.locator('[data-plan-out] h2', { hasText: 'Your starting plan' }).isVisible(), 'the walk-through didn\'t reach the plan');
  await page.locator('[data-edit]').click();
  for (let i = 0; i < 7; i++) await page.locator('[data-card-next]').click();
  await page.locator('[data-show-plan]').click();
  await page.locator('[data-plan-view] [data-clear]').click();
  await page.waitForTimeout(300);
  const bad = reqs.filter(dataRequest);
  expect('plan-network', !bad.length, `/plan/ made ${bad.length} data requests: ${bad.map(describe).join(', ')}`);
  const after = reqs.slice(atLoad);
  expect('plan-network', after.every((r) => !dataRequest(r)), `after load: ${after.map(describe).join(', ')}`);
  if (plant && !landed.n) failures.push(`plant: ${plantArg} didn't land`);
  await ctx.close();
  return { atLoad, after: after.length };
}

if (plantArg) {
  const names = plantArg === 'all' ? Object.keys(PLANTS) : [plantArg];
  let caught = 0;
  for (const name of names) {
    const plant = PLANTS[name];
    failures.length = 0;
    await (plant.group === 'ask-body' ? checkAskBody(plant) : checkPlanNetwork(plant));
    const hit = failures.some((f) => f.startsWith(`${plant.group}:`)) && !failures.some((f) => f.startsWith('plant:'));
    caught += hit;
    console.log(`  ${hit ? 'CAUGHT' : 'MISSED'}  ${plant.group}: ${name} (${plant.what})${hit ? `\n          ${failures.find((f) => f.startsWith(plant.group))}` : failures.length ? `\n          ${failures.join('; ')}` : ''}`);
  }
  await browser.close();
  console.log(`\nBrowser plants: ${caught} of ${names.length} caught\n`);
  process.exit(caught === names.length ? 0 : 1);
}

// --- home ---
for (const [w, h] of [[390, 844], [768, 1024], [1280, 800]]) {
  const ctx = await context({ width: w, height: h });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  const m = await page.evaluate(() => {
    const r = (sel) => document.querySelector(sel).getBoundingClientRect();
    const f = document.querySelector('.site-footer');
    return {
      box: r('[data-box]').bottom, chips: r('[data-examples]').bottom,
      map: r('[data-home-map] svg').top, mapL: r('[data-home-map] svg').left, mapR: r('[data-home-map] svg').right,
      colL: r('[data-start]').left, colR: r('[data-start]').right,
      footer: f.getBoundingClientRect().bottom + scrollY, footerPos: getComputedStyle(f).position, vh: innerHeight,
    };
  });
  if (w === 390) {
    expect('home', m.box <= m.vh && m.chips <= m.vh, `390: the ask box (${Math.round(m.box)}) or chips (${Math.round(m.chips)}) end past the first screen`);
  }
  expect('home', m.map >= m.chips && m.map - m.chips <= 24, `${w}×${h}: the map starts ${Math.round(m.map - m.chips)} px under the example chips`);
  expect('home', Math.abs(m.mapL - m.colL) <= 1 && Math.abs(m.mapR - m.colR) <= 1, `${w}×${h}: the map (${Math.round(m.mapL)}–${Math.round(m.mapR)}) isn't the content column's width (${Math.round(m.colL)}–${Math.round(m.colR)})`);
  expect('home', m.footerPos === 'static' && m.footer >= m.vh - 1, `${w}×${h}: footer ${m.footerPos}, ends at ${Math.round(m.footer)} px`);
  await ctx.close();
}
passes.push('home: 390×844, 768×1024, 1280×800');

// --- chip ---
{
  const ctx = await context({ width: 390, height: 844 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  const geom = () => page.evaluate(() => {
    const r = (sel) => { const e = document.querySelector(sel); return e && e.offsetParent ? e.getBoundingClientRect() : null; };
    const field = document.querySelector('.ask-field').getBoundingClientRect();
    const chip = r('[data-ctx-add]') ?? r('[data-ctx-set]');
    const send = r('[data-send]');
    const text = document.querySelector('[data-ctx-text]');
    return { field: [field.left, field.right, field.bottom], chip: chip && [chip.left, chip.right, chip.top, chip.bottom], send: [send.left, send.right, send.top, send.bottom],
      ta: document.querySelector('[data-q]').getBoundingClientRect().bottom, sideways: document.documentElement.scrollWidth > innerWidth, cut: text.scrollWidth > text.clientWidth };
  });
  const placed = (g, where) => {
    expect('chip', g.chip && g.chip[0] - g.field[0] <= 12 && g.chip[1] <= g.send[0] && g.send[1] <= g.field[1] && g.send[1] >= g.field[1] - 12, `${where}: chip ${g.chip?.map(Math.round)} and Ask ${g.send.map(Math.round)} aren't left and right in the box ${g.field.map(Math.round)}`);
    expect('chip', g.chip && g.chip[2] >= g.ta && g.chip[3] <= g.field[2] && Math.abs((g.chip[2] + g.chip[3]) / 2 - (g.send[2] + g.send[3]) / 2) <= 2, `${where}: the chip isn't at the bottom of the box, on Ask's row`);
    expect('chip', !g.sideways, `${where}: the page scrolls sideways`);
  };
  // Empty.
  await setAnswers(page, null);
  await page.reload();
  const add = page.locator('[data-ctx-add]');
  expect('chip', (await add.isVisible()) && (await add.textContent()) === '+ Add your move' && !(await page.locator('[data-ctx-set]').isVisible()), 'empty: no "+ Add your move"');
  placed(await geom(), 'empty');
  await add.click();
  await page.waitForURL('**/plan/');
  // Set.
  await page.goto(`${BASE}/`);
  await setAnswers(page, ANSWERS);
  await page.reload();
  const btn = page.locator('[data-ctx-btn]');
  expect('chip', (await page.locator('[data-ctx-text]').textContent()) === 'NBSD · E5–E6 · spouse, kids 6–9, 10–13', `set: chip reads "${await page.locator('[data-ctx-text]').textContent()}"`);
  placed(await geom(), 'set');
  const name = (await btn.getAttribute('aria-label')) ?? '';
  expect('chip', name === 'Your move, sent with your questions: NBSD · E5–E6 · spouse, kids 6–9, 10–13' && (await btn.getAttribute('aria-expanded')) === 'false', `set: the chip button is named "${name}"`);
  expect('chip', /\S/.test((await page.locator('[data-ctx-x]').getAttribute('aria-label')) ?? ''), 'the × has no name');
  // Keyboard: Enter opens the menu, Tab walks it, Escape closes it with focus back on the chip.
  await btn.focus();
  await page.keyboard.press('Enter');
  expect('chip', (await page.locator('[data-ctx-menu]').isVisible()) && (await btn.getAttribute('aria-expanded')) === 'true', 'Enter didn\'t open the menu');
  const items = await page.locator('[data-ctx-menu] li:visible').allTextContents();
  expect('chip', items.join('|') === 'See your plan|Edit answers|Clear', `menu items: ${items.join(', ')}`);
  const tabbed = [];
  for (let i = 0; i < 3; i++) { await page.keyboard.press('Tab'); tabbed.push(await page.evaluate(() => document.activeElement.textContent.trim())); }
  expect('chip', tabbed.join('|') === 'See your plan|Edit answers|Clear', `Tab from the chip went to ${tabbed.join(', ')}`);
  await page.keyboard.press('Escape');
  expect('chip', !(await page.locator('[data-ctx-menu]').isVisible()) && (await page.evaluate(() => document.activeElement.hasAttribute('data-ctx-btn'))), 'Escape didn\'t close the menu and return focus to the chip');
  await btn.click();
  await page.locator('h1, .start-sub').first().click({ force: true });
  expect('chip', !(await page.locator('[data-ctx-menu]').isVisible()), 'a click outside didn\'t close the menu');
  // The menu in a conversation opens upward and stays on the screen.
  await page.locator('[data-example]').first().click();
  await page.waitForSelector('.ask-answer:not(.ask-waiting)');
  await btn.click();
  const menu = await page.locator('[data-ctx-menu]').boundingBox();
  expect('chip', menu && menu.y >= 0 && menu.y + menu.height <= 844 && menu.x >= 0 && menu.x + menu.width <= 390, `in a conversation the menu is at ${JSON.stringify(menu)}`);
  await page.keyboard.press('Escape');
  // Edit answers: card 1, answers kept.
  await btn.click();
  await page.locator('[data-ctx-menu] a', { hasText: 'Edit answers' }).click();
  await page.waitForURL('**/plan/#edit');
  expect('chip', (await page.locator('[data-progress]').textContent()) === 'Question 1 of 8' && (await page.locator('input[name="base"][value="NBSD"]').isChecked()), `Edit answers opened "${await page.locator('[data-progress]').textContent()}"`);
  // ×, then Clear.
  await page.goto(`${BASE}/`);
  await page.locator('[data-ctx-x]').click();
  expect('chip', (await page.locator('[data-ctx-text]').textContent()) === 'Your move: off' && !(await page.locator('[data-ctx-x]').isVisible()) && (await page.evaluate(() => document.activeElement.hasAttribute('data-ctx-btn'))), '× didn\'t turn the chip off with focus on it');
  expect('chip', ((await btn.getAttribute('aria-label')) ?? '').startsWith('Your move: off.'), `off: the chip button is named "${await btn.getAttribute('aria-label')}"`);
  // Clear asks first: Cancel keeps the answers, OK clears them.
  let asked = '';
  page.once('dialog', (d) => { asked = d.message(); d.dismiss(); });
  await btn.click();
  await page.locator('[data-ctx-clear]').click();
  expect('chip', /clear/i.test(asked) && (await page.evaluate(() => localStorage.getItem('pcs-sd:intake'))) !== null && (await btn.isVisible()), `Clear didn't ask first, or Cancel cleared anyway ("${asked}")`);
  page.once('dialog', (d) => d.accept());
  if (!(await page.locator('[data-ctx-menu]').isVisible())) await btn.click();
  await page.locator('[data-ctx-clear]').click();
  expect('chip', (await add.isVisible()) && (await page.evaluate(() => localStorage.getItem('pcs-sd:intake'))) === null && (await page.evaluate(() => document.activeElement.hasAttribute('data-ctx-add'))), 'Clear didn\'t empty the chip and this browser\'s answers (and its off switch)');
  // The longest summary cuts with an ellipsis inside the box.
  await setAnswers(page, { ...ANSWERS, base: 'NAB', band: 'O1–O3E', kids: { '0-2': 1, '3-5': 1, '6-9': 1, '10-13': 1, '14-18': 1 } });
  await page.reload();
  const g = await geom();
  placed(g, 'longest summary');
  expect('chip', g.cut, 'longest summary: not cut to fit (or it fit, so this case tests nothing)');
  await ctx.close();
}
passes.push('chip: empty and set at 390 px, bottom left of the box with Ask at the right; name, menu by keyboard, Escape, outside click, Edit answers, ×, Clear, longest summary');

await checkAskBody(null);
passes.push('ask-body: one POST per question, only question, previous and the chip\'s four fields; none after ×, also after a reload and a /plan/ edit; "What\'s sent?" matches the body');
const planReqs = await checkPlanNetwork(null);
passes.push(`plan-network: /plan/ load (${planReqs.atLoad} static files) through the plan, Edit and Clear: ${planReqs.after} requests after load, no data request`);

// --- footer ---
{
  const ctx = await context({ width: 1280, height: 1600 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/browse/`);
  const m = await page.evaluate(() => ({ bottom: document.querySelector('.site-footer').getBoundingClientRect().bottom, gap: document.querySelector('.site-footer').getBoundingClientRect().top - document.querySelector('main').lastElementChild.getBoundingClientRect().bottom, vh: innerHeight, sh: document.documentElement.scrollHeight }));
  expect('footer', Math.abs(m.bottom - m.vh) <= 1 && m.sh <= m.vh, `/browse/ at 1280×1600: the footer ends at ${Math.round(m.bottom)} px of ${m.vh}`);
  expect('footer', m.gap > 100, `/browse/ at 1280×1600: the footer isn't pushed down (${Math.round(m.gap)} px under the content)`);
  await ctx.close();
}
passes.push('footer: pushed to the bottom of a short page');

// --- site-name ---
{
  const ctx = await context({ width: 390, height: 844 });
  const page = await ctx.newPage();
  const name = async (where, wantSub) => {
    const m = await page.evaluate(() => {
      const a = document.querySelector('.bar .site-name');
      const r = a.getBoundingClientRect();
      const others = [...document.querySelectorAll('.bar .back, .bar .beta, .bar .menu-btn')].filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect());
      const sub = a.querySelector('[data-site-sub]');
      return { href: a.getAttribute('href'), text: a.querySelector('.site-title').textContent, visible: r.width > 0 && r.left >= 0 && r.right <= innerWidth,
        overlap: others.some((o) => o.left < r.right && o.right > r.left && o.top < r.bottom && o.bottom > r.top), sub: !!sub && !sub.hidden && sub.offsetParent !== null, wrapped: a.querySelector('.site-title').getClientRects().length > 1 };
    });
    expect('site-name', m.href === '/' && m.text === 'San Diego PCS Guide' && m.visible && !m.overlap && !m.wrapped, `${where}: ${JSON.stringify(m)}`);
    expect('site-name', m.sub === wantSub, `${where}: "Start over" ${m.sub ? 'shows' : 'doesn\'t show'}`);
  };
  for (const path of ['/communities/santee/', '/base/camp-pendleton/', '/base-housing/murphy-canyon/', '/browse/', '/sources/', '/sequence/first-30-days/', '/sequence/forms/']) {
    await page.goto(`${BASE}${path}`);
    await name(path, false);
  }
  await page.goto(`${BASE}/`);
  await name('home', false);
  await page.locator('[data-example]').first().click();
  await page.waitForSelector('.ask-answer:not(.ask-waiting)');
  await name('home with an answer', true);
  await page.locator('.bar .site-name').click();
  await page.waitForLoadState();
  expect('site-name', (await page.locator('.ask-turn').count()) === 0, 'the site name didn\'t start over');
  await page.goto(`${BASE}/plan/`);
  await name('plan card', true);
  await ctx.close();
}
passes.push('site-name: header link to / at 390 px on 10 screens; "Start over" on answers and the plan');

// --- legend ---
for (const w of [390, 1280]) {
  const ctx = await context({ width: w, height: 900 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/plan/`);
  await page.evaluate(() => localStorage.setItem('pcs-sd:intake', JSON.stringify({ answers: { base: 'NBSD', band: 'E5–E6', timeline: '60-90', partner: true, kids: { '0-2': 1, '3-5': 0, '6-9': 2, '10-13': 0, '14-18': 0 }, dogs: 1, bedrooms: 'help', separate6: false, open: ['renting'], priorities: ['where'] } })));
  await page.goto(`${BASE}/plan/#edit`);
  await page.reload();
  for (let i = 0; i < 8; i++) {
    const m = await page.evaluate(() => {
      const f = document.querySelector('fieldset.q.current');
      const lg = f.querySelector('legend').getBoundingClientRect();
      const first = [...f.children].find((c) => c.tagName !== 'LEGEND' && c.offsetParent !== null).getBoundingClientRect();
      return { q: f.dataset.q, gap: first.top - lg.bottom, border: getComputedStyle(f).borderTopWidth };
    });
    expect('legend', m.gap >= 0 && m.border === '0px', `${w} px, card ${m.q}: legend ${m.gap < 0 ? `overlaps its options by ${Math.round(-m.gap)} px` : 'clear'}, fieldset border ${m.border}`);
    if (i < 7) await page.locator('[data-card-next]').click();
  }
  await ctx.close();
}
passes.push('legend: all 8 cards at 390 and 1280 px');

// --- menu, phone ---
{
  const ctx = await context({ width: 390, height: 844 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/sources/`);
  const btn = page.locator('[data-menu-btn]');
  expect('menu', (await btn.getAttribute('aria-expanded')) === 'false', 'phone: aria-expanded not false before opening');
  await btn.click();
  expect('menu', await page.locator('[data-menu-panel]').isVisible(), 'phone: drawer not visible after the button');
  expect('menu', (await btn.getAttribute('aria-expanded')) === 'true', 'phone: aria-expanded not true when open');
  expect('menu', (await active(page)) === 'button[close]', `phone: focus on ${await active(page)}, not the close button`);
  expect('menu', await page.evaluate(() => document.querySelector('main').inert), 'phone: the page behind the drawer is not inert');
  expect('menu', (await page.locator('[data-menu-panel]').getAttribute('role')) === 'dialog', 'phone: the drawer is not a dialog');
  await page.keyboard.press('Shift+Tab');
  const last = await page.evaluate(() => document.activeElement.textContent.trim());
  expect('menu', last === 'What changed', `phone: Shift+Tab from the close button went to "${last}", not the last link`);
  await page.keyboard.press('Tab');
  expect('menu', (await active(page)) === 'button[close]', 'phone: Tab from the last link left the drawer');
  await page.keyboard.press('Escape');
  expect('menu', !(await page.locator('[data-menu-panel]').isVisible()), 'phone: Escape didn\'t close the drawer');
  expect('menu', (await active(page)) === 'a[menu]', 'phone: focus didn\'t return to the menu button');
  expect('menu', !(await page.evaluate(() => document.querySelector('main').inert)), 'phone: the page stayed inert after closing');
  await btn.click();
  await page.locator('[data-menu-close]').click();
  expect('menu', !(await page.locator('[data-menu-panel]').isVisible()), 'phone: the close button didn\'t close the drawer');
  await btn.click();
  await page.locator('[data-menu-panel] a', { hasText: 'Forms and claims' }).click();
  await page.waitForURL('**/sequence/forms/');
  await ctx.close();
}
// --- menu, desktop ---
{
  const ctx = await context({ width: 1280, height: 800 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  expect('menu', await page.locator('[data-menu-panel]').isVisible(), '1280: no sidebar on load');
  expect('menu', !(await page.evaluate(() => document.querySelector('main').inert)), '1280: the page is inert with the sidebar open');
  const left = await page.evaluate(() => document.querySelector('main').getBoundingClientRect().left);
  expect('menu', left >= 264, `1280: main starts at ${left} px, under the sidebar`);
  await page.locator('[data-menu-close]').click();
  expect('menu', !(await page.locator('[data-menu-panel]').isVisible()), '1280: the close button didn\'t collapse the sidebar');
  expect('menu', (await page.locator('[data-menu-btn]').getAttribute('aria-expanded')) === 'false', '1280: aria-expanded not false when collapsed');
  await page.goto(`${BASE}/sources/`);
  expect('menu', !(await page.locator('[data-menu-panel]').isVisible()), '1280: the sidebar didn\'t stay collapsed on the next page');
  await page.locator('[data-menu-btn]').click();
  expect('menu', await page.locator('[data-menu-panel]').isVisible(), '1280: the button didn\'t bring the sidebar back');
  await ctx.close();
}
passes.push('menu: phone drawer (focus, inert, Tab, Escape, close) and the 1280 px sidebar (collapse, kept in this tab)');

// --- no-js ---
{
  const ctx = await context({ width: 390, height: 844 }, { javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  expect('no-js', !(await page.locator('[data-ask]').isVisible()), 'home: the ask box shows without JavaScript');
  expect('no-js', await page.locator('noscript p', { hasText: 'The assistant needs JavaScript' }).isVisible(), 'home: no notice without JavaScript'); // getByText skips <noscript>
  expect('no-js', !(await page.locator('[data-menu-panel]').isVisible()), 'the drawer shows without JavaScript');
  await page.locator('[data-menu-btn]').click();
  await page.waitForURL('**/browse/');
  expect('no-js', (await page.locator('#main [data-menu-links] a').count()) === 16, '/browse/ hasn\'t the 16 menu links');
  await page.goto(`${BASE}/plan/`);
  expect('no-js', await page.locator('noscript p', { hasText: 'The questions need JavaScript' }).isVisible(), '/plan/: its notice is gone');
  await ctx.close();
}
passes.push('no-js: menu → /browse/, home and /plan/ notices');

// --- redirect ---
{
  const ctx = await context({ width: 390, height: 844 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/ask/`);
  await page.waitForURL(`${BASE}/`, { timeout: 5000 }).catch(() => {});
  expect('redirect', new URL(page.url()).pathname === '/', `/ask/ ended on ${page.url()}`);
  await ctx.close();
}
passes.push('redirect: /ask/ → /');

// --- cards ---
{
  const ctx = await context({ width: 390, height: 844 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/plan/`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const progress = () => page.locator('[data-progress]').textContent();
  expect('cards', (await progress()) === 'Question 1 of 8', `start: "${await progress()}"`);
  expect('cards', (await page.locator('fieldset.q:visible').count()) === 1, 'more than one card showing');
  const next = page.locator('[data-card-next]');
  expect('cards', await next.isDisabled(), 'Next is enabled on an unanswered card 1');
  await page.locator('input[name="base"]').first().focus();
  await page.keyboard.press('Space');
  await page.waitForTimeout(400);
  expect('cards', (await progress()) === 'Question 1 of 8' && await page.locator('input[name="base"]').first().isChecked(), `Space on an option didn't just select it: "${await progress()}"`);
  expect('cards', await next.isEnabled(), 'Next stayed disabled after an answer');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(400);
  expect('cards', (await progress()) === 'Question 1 of 8', 'an arrow key moved on');
  expect('cards', await page.locator('input[name="base"]').nth(1).isChecked(), 'the arrow key didn\'t select');
  await page.keyboard.press('Enter');
  expect('cards', (await progress()) === 'Question 2 of 8', 'Enter didn\'t move on');
  expect('cards', (await active(page)) === 'fieldset.current', `focus after moving on: ${await active(page)}`);
  await page.locator('#main label.opt', { hasText: 'E5–E6' }).tap();
  await page.waitForTimeout(400);
  expect('cards', (await progress()) === 'Question 2 of 8', 'a tap moved on by itself');
  await next.click();
  expect('cards', (await progress()) === 'Question 3 of 8', 'Next didn\'t move on after a tap');
  await page.locator('[data-card-back]').click();
  expect('cards', (await progress()) === 'Question 2 of 8', 'Back didn\'t go back');
  // Every priority offered (partner, a baby, a school-age child, a dog), then each card's buttons on the first screen.
  await page.evaluate(() => localStorage.setItem('pcs-sd:intake', JSON.stringify({ answers: { base: 'NBSD', band: 'E5–E6', timeline: '60-90', partner: true, kids: { '0-2': 1, '3-5': 0, '6-9': 1, '10-13': 0, '14-18': 0 }, bedrooms: null, separate6: null, cats: 0, dogs: 1, open: [], priorities: [] } })));
  await page.reload();
  expect('cards', (await progress()) === 'Question 5 of 8', `with 1–4 answered it opened on "${await progress()}"`);
  while ((await progress()) !== 'Question 1 of 8') await page.locator('[data-card-back]').click();
  // Each card's buttons (and the "Answer this question" line under them) on the first screen; questions 5 and 7
  // answered on their cards on the way.
  for (let i = 0; i < 8; i++) {
    const m = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('[data-card-nav] .btn, [data-form-actions] .btn')].filter((e) => e.offsetParent);
      return { q: document.querySelector('fieldset.q.current').dataset.q, bottom: Math.max(...btns.map((e) => e.getBoundingClientRect().bottom)), picks: document.querySelectorAll('[data-pick-list] button').length };
    });
    expect('cards', m.bottom <= 844, `card ${m.q}: its buttons end at ${Math.round(m.bottom)} px, below the first screen`);
    if (m.q === '8') expect('cards', m.picks === 9, `card 8 offers ${m.picks} priorities, not all 9`);
    if (m.q === '5') await page.locator('#main label.opt', { hasText: /^3$/ }).click();
    if (m.q === '7') await page.locator('#main label.opt', { hasText: 'Renting' }).click();
    if (i < 7) await page.locator('[data-card-next]').click();
  }
  // Question 8 by taps, then the plan, then "Ask about this plan".
  await page.locator('[data-pick-list] button').nth(1).click();
  await page.locator('[data-pick-list] button').nth(0).click();
  const picked = await page.evaluate(() => [document.querySelector('select[name="priority-1"]').value, document.querySelector('select[name="priority-2"]').value]);
  expect('cards', picked.join() === 'cost,where', `taps gave priorities ${picked.join(', ')}`);
  await page.locator('[data-show-plan]').click();
  expect('cards', await page.locator('[data-plan-out] h2', { hasText: 'Your starting plan' }).isVisible(), 'no plan after the last card');
  await page.locator('[data-ask-plan]').click();
  await page.waitForURL(`${BASE}/#ask-with-plan`);
  expect('ask', await page.locator('[data-ctx-btn]').isVisible() && (await page.locator('[data-ctx-text]').textContent()) === 'NBSD · E5–E6 · spouse, kids 0–2, 6–9', `"Ask about this plan" arrived with the chip reading "${await page.locator('[data-ctx-text]').textContent()}"`);
  expect('ask', (await page.evaluate(() => document.activeElement?.id)) === 'ask-q', '"Ask about this plan" didn\'t focus the box');
  await ctx.close();
}
passes.push('cards: progress, tap / Space / arrows select without moving on, Next held until answered, Next / Enter move on, Back, focus, every card\'s buttons on the first screen, plan, "Ask about this plan"');

// --- ask ---
{
  const ctx = await context({ width: 390, height: 844 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  await page.locator('[data-q]').fill('How long is the base housing wait at Murphy Canyon?');
  await page.locator('[data-send]').click();
  expect('ask', await page.getByText('Checking the sources…').first().isVisible(), 'no "Checking the sources…" while waiting');
  await page.waitForSelector('.ask-answer:not(.ask-waiting)');
  const chip = (await page.locator('.ask-src > summary').first().textContent()).trim();
  expect('ask', /^\d+ sources? · verified \d{4}-\d{2}(-\d{2})?$/.test(chip), `source chip reads "${chip}"`);
  expect('ask', (await page.locator('.ask-related').count()) === 1, 'no related-page card');
  // Links out of the conversation open in a new tab, so Back can't lose it.
  const tabs = await page.locator('.ask-src-list a, a.ask-related').evaluateAll((as) => as.map((a) => `${a.target}|${a.rel}`));
  expect('ask', tabs.length > 1 && tabs.every((t) => t === '_blank|noopener'), `source links and the related card: ${tabs.join(', ')}`);
  // Focus is on the new answer, and the status region reads it.
  expect('ask', await page.evaluate(() => document.activeElement?.classList.contains('ask-answer') && !document.activeElement.classList.contains('ask-waiting')), `focus after the answer: ${await active(page)}`);
  expect('ask', /^Answer/.test(await page.locator('[data-status]').textContent()), `status after the answer: "${await page.locator('[data-status]').textContent()}"`);
  expect('ask', (await page.locator('[data-ask-label]').textContent()) === 'Ask a follow-up', 'the box didn\'t become the follow-up box');
  expect('ask', !(await page.locator('[data-examples]').isVisible()), 'the example questions still show in the conversation');
  await page.locator('[data-whats-sent]').click();
  const sent = await page.locator('[data-context-json]').textContent();
  expect('ask', sent.includes('"previous"') && sent.includes('Murphy Canyon'), '"What\'s sent?" doesn\'t show the previous turn');
  await page.locator('[data-q]').fill('What time do the Padres play on Sunday?');
  await page.locator('[data-q]').press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.ask-answer:not(.ask-waiting)').length === 2);
  const second = await page.locator('.ask-answer').nth(1).textContent();
  expect('ask', second.includes('I don’t have that in the San Diego material'), 'no "I don\'t have that" for an out-of-scope question');
  expect('ask', (await page.locator('.ask-answer').nth(1).locator('.ask-related').count()) === 1, '"I don\'t have that" has no nearest-page card');
  await page.locator('[data-clear-log]').click();
  expect('ask', (await page.locator('.ask-turn').count()) === 0 && await page.locator('[data-examples]').isVisible(), '"New conversation" didn\'t reset');
  await ctx.close();
}
// An example tapped by keyboard: focus lands on the answer, not lost on the hidden example.
{
  const ctx = await context({ width: 390, height: 844 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  await page.locator('[data-example]').first().focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('.ask-answer:not(.ask-waiting)');
  expect('ask', await page.evaluate(() => document.activeElement?.classList.contains('ask-answer')), `after an example by keyboard, focus is on ${await active(page)}`);
  await ctx.close();
}
passes.push('ask: waiting state, source chip, related card, new tab, focus and status on the answer, follow-up box, "What\'s sent?", "I don\'t have that" with its nearest page, new conversation');

// A reply with answer text (the stub has none), from the real handler's retrieval and citations.
const ANSWER = 'Murphy Canyon is one of the base housing areas tied to Naval Base San Diego. The latest wait list gives a range of months for each pay band and bedroom count, and the area page lists each community with its pet policy. Liberty Military Housing runs the list; apply through the Housing Service Center once you have orders, and check the page for the date of the estimate.';
const answered = (extra = {}) => async (route) => {
  const r = await handleAsk({ body: JSON.parse(route.request().postData()), env: {}, index });
  const { note, prompt, chunks, ...rest } = r.json;
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...rest, kind: 'answer', answer: ANSWER, ...extra }) });
};
const askIn = async (page, question) => {
  const n = await page.locator('.ask-answer:not(.ask-waiting)').count();
  await page.locator('[data-q]').fill(question);
  await page.locator('[data-send]').click();
  await page.waitForFunction((k) => document.querySelectorAll('.ask-answer:not(.ask-waiting)').length > k || !document.querySelector('[data-error]').hidden, n, { timeout: 10_000 }).catch(() => {});
};

// --- ask-panel ---
{
  const ctx = await context({ width: 390, height: 844 });
  const page = await ctx.newPage();
  await page.route('**/api/ask', answered());
  await page.goto(`${BASE}/`);
  await askIn(page, 'How long is the base housing wait at Murphy Canyon?');
  await page.locator('[data-whats-sent]').click();
  await page.waitForTimeout(500);
  const m = await page.evaluate(() => {
    const panel = document.querySelector('[data-sent-panel]');
    return { inBox: !!panel.closest('[data-box]'), sticky: [...document.querySelectorAll('*')].some((e) => getComputedStyle(e).position === 'sticky' && e.contains(panel)), h: panel.getBoundingClientRect().height, scrollH: panel.scrollHeight, shown: JSON.parse(document.querySelector('[data-context-json]').textContent) };
  });
  expect('ask-panel', !m.inBox && !m.sticky, `"What's sent?" is inside the sticky box (in box ${m.inBox}, in a sticky element ${m.sticky})`);
  expect('ask-panel', m.h <= 844 * 0.5 + 1, `"What's sent?" is ${Math.round(m.h)} px tall (cap: half the screen)`);
  const prev = m.shown.previous?.answer ?? '';
  const cut = prev.match(/^([\s\S]*)… \(full text sent, (\d+) characters\)$/);
  expect('ask-panel', cut && cut[1].length >= 150 && cut[1].length <= 200 && ANSWER.startsWith(cut[1]) && Number(cut[2]) === ANSWER.length, `previous answer shown as "${prev.slice(0, 60)}…${prev.slice(-40)}"`);
  // The answer's source link and related card: each the top element at its own position, panel open.
  await page.locator('.ask-src').first().evaluate((d) => { d.open = true; });
  for (const sel of ['.ask-src-list a', 'a.ask-related']) {
    const hit = await page.locator(sel).first().evaluate((a) => {
      a.scrollIntoView({ block: 'center' });
      const r = a.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + Math.min(r.width / 2, 40), r.top + r.height / 2);
      return { ok: !!top && a.contains(top), top: top ? `${top.tagName.toLowerCase()}.${top.className}` : null };
    });
    expect('ask-panel', hit.ok, `with "What's sent?" open, ${sel} is covered by ${hit.top}`);
  }
  await ctx.close();
}
passes.push('ask-panel: 390×844, "What\'s sent?" under the sticky box, capped, previous answer cut with its length; source link and related card uncovered');

// --- ask-errors ---
{
  const ctx = await context({ width: 390, height: 844 });
  const page = await ctx.newPage();
  const bodies = [];
  const replies = [
    { status: 429, json: { error: 'The assistant has answered all it can today. Try again tomorrow, or browse the pages.' }, browse: true },
    { status: 502, json: { error: 'The assistant isn’t working right now.', citations: [{ url: '/base/miramar/#bah-table', title: 'MCAS Miramar', section: 'BAH', label: 'MCAS Miramar: BAH', verified_on: '2026-10-20' }] }, browse: true },
    { status: 503, json: { error: 'The assistant is busy. Try again in a minute.', citations: [{ url: '/sources/', title: 'Sources', section: 'x', label: 'Sources: x', verified_on: '2026-10-20' }] }, browse: false },
    { status: 500, html: '<html><body>Error 1101</body></html>', browse: true },
  ];
  let k = 0;
  await page.route('**/api/ask', async (route) => {
    bodies.push(JSON.parse(route.request().postData()));
    const r = replies[k++];
    if (!r) return answered()(route);
    await route.fulfill(r.html ? { status: r.status, contentType: 'text/html', body: r.html } : { status: r.status, contentType: 'application/json', body: JSON.stringify(r.json) });
  });
  await page.goto(`${BASE}/`);
  for (const [i, r] of replies.entries()) {
    const question = `Question ${i + 1} about BAH at Miramar`;
    await askIn(page, question);
    const m = await page.evaluate(() => ({ turns: document.querySelectorAll('.ask-turn').length, box: document.querySelector('[data-q]').value, chips: document.querySelectorAll('.ask-src, .ask-related').length,
      error: document.querySelector('[data-error]').textContent, browse: !!document.querySelector('[data-error] a[href="/browse/"]') }));
    expect('ask-errors', m.turns === 0 && m.chips === 0, `${r.status}: ${m.turns} turns and ${m.chips} source chips or cards shown`);
    expect('ask-errors', m.box === question, `${r.status}: the box holds "${m.box}", not the question`);
    expect('ask-errors', m.browse === r.browse && /\w/.test(m.error), `${r.status}: error "${m.error}" ${m.browse ? 'links' : 'doesn\'t link'} "browse the pages"`);
  }
  await askIn(page, 'How long is the base housing wait at Murphy Canyon?');
  expect('ask-errors', bodies.every((b) => !b.previous), `an error went as the previous turn: ${JSON.stringify(bodies.map((b) => b.previous ?? null))}`);
  await ctx.close();
}
{
  // New conversation while an answer is pending.
  const ctx = await context({ width: 390, height: 844 });
  const page = await ctx.newPage();
  const bodies = [];
  await page.route('**/api/ask', async (route) => {
    bodies.push(JSON.parse(route.request().postData()));
    await new Promise((res) => setTimeout(res, 1500));
    await answered()(route).catch(() => {});
  });
  await page.goto(`${BASE}/`);
  await page.locator('[data-q]').fill('FIRST private question about BAH');
  await page.locator('[data-send]').click();
  await page.waitForTimeout(200);
  await page.locator('[data-clear-log]').click();
  await page.waitForTimeout(2000);
  await page.locator('[data-whats-sent]').click();
  const listed = await page.locator('[data-sent-fields] li').evaluateAll((lis) => lis.map((li) => li.dataset.field));
  expect('ask-errors', (await page.locator('.ask-turn').count()) === 0 && !listed.includes('previous'), `after New conversation mid-answer: ${await page.locator('.ask-turn').count()} turns, "What's sent?" lists ${listed.join(', ')}`);
  await askIn(page, 'SECOND question about schools');
  expect('ask-errors', bodies.length === 2 && !bodies[1].previous, `the cleared turn went with the next question: ${JSON.stringify(bodies[1]?.previous)}`);
  await ctx.close();
}
{
  // No reply in 45 s; a javascript: source URL; an empty Ask; the counter.
  const ctx = await context({ width: 390, height: 844 });
  const page = await ctx.newPage();
  await page.clock.install();
  let hold = true;
  await page.route('**/api/ask', async (route) => {
    if (hold) return; // never answered
    await answered({ citations: [{ url: 'javascript:alert(8)', title: 'Bad', section: 'x', label: 'Bad: x', verified_on: '2026-10-20' }] })(route);
  });
  await page.goto(`${BASE}/`);
  await page.locator('[data-q]').fill('Slow question about BAH');
  await page.locator('[data-send]').click();
  await page.clock.fastForward(46_000);
  await page.waitForFunction(() => !document.querySelector('[data-error]').hidden, null, { timeout: 5_000 }).catch(() => {});
  const m = await page.evaluate(() => ({ error: document.querySelector('[data-error]').textContent, box: document.querySelector('[data-q]').value, turns: document.querySelectorAll('.ask-turn').length, send: document.querySelector('[data-send]').disabled }));
  expect('ask-errors', /too long/.test(m.error) && /try again/i.test(m.error) && m.box === 'Slow question about BAH' && !m.turns && !m.send, `after 45 s: ${JSON.stringify(m)}`);
  hold = false;
  await askIn(page, 'How long is the base housing wait at Murphy Canyon?');
  const bad = await page.evaluate(() => ({ js: document.querySelectorAll('a[href^="javascript"]').length, text: document.querySelector('.ask-src-list')?.textContent ?? '', related: document.querySelectorAll('.ask-related').length }));
  expect('ask-errors', !bad.js && bad.text.includes('Bad: x') && !bad.related, `a javascript: citation URL: ${JSON.stringify(bad)}`);
  await page.locator('[data-q]').fill('');
  await page.locator('[data-send]').click();
  expect('ask-errors', (await page.locator('[data-error]').textContent()) === 'Type a question.' && await page.locator('[data-error]').isVisible(), `empty Ask: "${await page.locator('[data-error]').textContent()}"`);
  await page.locator('[data-q]').fill('x'.repeat(399));
  const c399 = await page.locator('[data-count]').isVisible();
  await page.locator('[data-q]').fill('x'.repeat(420));
  expect('ask-errors', !c399 && (await page.locator('[data-count]').textContent()) === '420/500 characters' && await page.locator('[data-count]').isVisible() && !(await page.locator('[data-error]').isVisible()), `counter: at 399 ${c399 ? 'shown' : 'hidden'}, at 420 "${await page.locator('[data-count]').textContent()}"`);
  await ctx.close();
}
passes.push('ask-errors: 429, 502, 503 and HTML 500 kept out of the conversation with the question back in the box; New conversation drops a pending answer; 45 s timeout; javascript: URL not a link; empty Ask; counter');

// --- plan-gate ---
{
  const ctx = await context({ width: 390, height: 844 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/plan/`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const progress = () => page.locator('[data-progress]').textContent();
  const held = () => page.evaluate(() => {
    const b = [...document.querySelectorAll('[data-card-next], [data-show-plan]')].find((e) => e.offsetParent);
    return b.disabled;
  });
  // Pressing a held button (by script, and Enter in an input) must not move on or show the plan.
  const tryPast = async () => {
    await page.evaluate(() => { for (const b of document.querySelectorAll('[data-card-next], [data-show-plan]')) b.click(); });
    const input = page.locator('fieldset.q.current input').first();
    if (await input.count()) { await input.focus(); await page.keyboard.press('Enter'); }
  };
  const answer = { 1: () => page.locator('#main label.opt', { hasText: 'Not sure yet' }).first().click(), 2: () => page.locator('#main label.opt', { hasText: 'E1–E4' }).click(),
    3: () => page.locator('#main label.opt', { hasText: '60–90 days' }).click(), 4: () => page.locator('input[name="partner"][value="no"]').check(), 5: () => page.locator('#main label.opt', { hasText: 'Help me figure it out' }).click(),
    7: () => page.locator('fieldset.q.current label.opt', { hasText: 'Not sure yet' }).click(), 8: () => page.locator('[data-pick-list] button').first().click() };
  for (let n = 1; n <= 8; n++) {
    const at = await progress();
    expect('plan-gate', at === `Question ${n} of 8`, `walking the cards reached "${at}", not question ${n}`);
    if (n === 6) { expect('plan-gate', !(await held()), 'pets (question 6) hold Next'); await page.locator('[data-card-next]').click(); continue; }
    expect('plan-gate', await held(), `question ${n}: Next isn't held before an answer`);
    if (n === 4) await page.locator('input[name="kids-0-2"]').fill('1');
    await tryPast();
    expect('plan-gate', (await progress()) === at && !(await page.locator('[data-plan-view]').isVisible()), `question ${n}: got past without an answer`);
    if (n === 4) { expect('plan-gate', await held(), 'question 4: a child count alone let Next through'); await page.locator('input[name="kids-0-2"]').fill('0'); }
    await answer[n]();
    expect('plan-gate', !(await held()), `question ${n}: still held after an answer`);
    if (n < 8) await page.locator('[data-card-next]').click();
  }
  await page.locator('[data-show-plan]').click();
  expect('plan-gate', await page.locator('[data-plan-out] h2', { hasText: 'Your starting plan' }).isVisible(), 'all answered, but no plan');
  // The bedroom follow-up holds question 5 when it matters.
  await page.evaluate(() => localStorage.setItem('pcs-sd:intake', JSON.stringify({ answers: { base: 'NBSD', band: 'E5–E6', timeline: '60-90', partner: true, kids: { '0-2': 1, '3-5': 0, '6-9': 1, '10-13': 0, '14-18': 0 }, bedrooms: 'help', separate6: null, open: ['renting'], priorities: ['where'] } })));
  await page.goto(`${BASE}/plan/`);
  expect('plan-gate', (await progress()) === 'Question 5 of 8' && !(await page.locator('[data-plan-view]').isVisible()), `bedroom follow-up unanswered: opened on "${await progress()}"`);
  expect('plan-gate', await held(), 'question 5: Next isn\'t held with the separate-rooms question unanswered');
  await page.locator('input[name="separate6"][value="no"]').check();
  expect('plan-gate', !(await held()), 'question 5: still held after the separate-rooms answer');
  // Stored answers with a gap open on the gap, never the plan.
  await page.evaluate(() => localStorage.setItem('pcs-sd:intake', JSON.stringify({ answers: { base: 'NBSD', band: 'E5–E6', timeline: null, partner: false, kids: {}, bedrooms: '2', open: ['renting'], priorities: ['where'] } })));
  await page.goto(`${BASE}/plan/`);
  expect('plan-gate', (await progress()) === 'Question 3 of 8' && !(await page.locator('[data-plan-view]').isVisible()), `question 3 missing: opened on "${await progress()}", plan ${await page.locator('[data-plan-view]').isVisible() ? 'shown' : 'hidden'}`);
  await tryPast();
  expect('plan-gate', !(await page.locator('[data-plan-view]').isVisible()), 'question 3 missing: a held button showed the plan');
  await ctx.close();
}
passes.push('plan-gate: Next held on every required card until answered (also against a script click and Enter), pets never held, the bedroom follow-up, a stored gap opens on the gap');

// --- plan-misc ---
{
  const ctx = await context({ width: 390, height: 844 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/plan/`);
  for (const bad of ['{', 'null', '[]', '"x"']) {
    await page.evaluate((v) => localStorage.setItem('pcs-sd:intake', v), bad);
    await page.reload();
    const note = await page.locator('[data-storage-note]').isVisible();
    await page.locator('#main label.opt', { hasText: 'MCAS Miramar' }).click();
    const kept = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('pcs-sd:intake')).answers.base; } catch { return null; } });
    expect('plan-misc', !note && kept === 'MIRAMAR', `stored ${bad}: "storage blocked" ${note ? 'shown' : 'hidden'}, next answer saved as ${kept}`);
  }
  // Names that say what each input is.
  const names = await page.locator('fieldset.q input').evaluateAll((xs) => xs.map((x) => (x.getAttribute('aria-label') ?? x.labels?.[0]?.textContent ?? '').trim()));
  const vague = names.filter((n) => /^(yes|no|\d+|cats|dogs|aged .*|)$/i.test(n));
  expect('plan-misc', !vague.length, `inputs named only ${[...new Set(vague)].join(', ')}`);
  const role = (r, name) => page.getByRole(r, { name, exact: true, includeHidden: true }).count(); // cards other than the current one are hidden
  expect('plan-misc', (await role('radio', 'Yes, a spouse or partner is moving with me')) === 1 && (await role('spinbutton', 'Number of children aged 0–2')) === 1 && (await role('spinbutton', 'Number of cats')) === 1 && (await role('radio', '3 bedrooms')) === 1, 'radio and count inputs have no names that say what they are');
  // The bedroom helper's wording by pay grade.
  const helper = async (band) => {
    await page.evaluate((b) => localStorage.setItem('pcs-sd:intake', JSON.stringify({ answers: { base: 'NBSD', band: b, timeline: '60-90', partner: true, kids: { '0-2': 0, '3-5': 0, '6-9': 0, '10-13': 1, '14-18': 0 }, bedrooms: 'help', open: ['renting'], priorities: ['where'] } })), band);
    await page.goto(`${BASE}/plan/#edit`);
    await page.reload();
    return page.locator('[data-helper-out]').textContent();
  };
  const senior = await helper('O4–O6');
  expect('plan-misc', senior.includes('CNIC lists no bedroom standard for officers and senior enlisted') && !/enlisted guidelines/.test(senior), `O4–O6 helper: "${senior}"`);
  const junior = await helper('E5–E6');
  expect('plan-misc', /enlisted guidelines/.test(junior), `E5–E6 helper: "${junior}"`);
  // A member moving alone: the ratio sections say they use the with-dependents rate, with the band's rate without.
  const bah = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'bah.json'), 'utf-8'));
  const plan = async (answers) => {
    await page.evaluate((a) => localStorage.setItem('pcs-sd:intake', JSON.stringify({ answers: a })), answers);
    await page.goto(`${BASE}/plan/`);
    await page.reload();
    return page.evaluate(() => ({ notes: [...document.querySelectorAll('[data-plan-section] .note')].map((n) => n.textContent).join(' '), without: [...document.querySelectorAll('[data-without]')].map((p) => ({ key: p.dataset.without, text: p.textContent, href: p.querySelector('a')?.getAttribute('href') })),
      text: document.querySelector('[data-plan-out]').textContent, bahLinks: [...document.querySelectorAll('.line-source a')].map((a) => a.getAttribute('href')).filter((h) => h.includes('#bah')), mha: JSON.parse(document.getElementById('plan-data').textContent).data.bases.find((b) => b.code === 'NBSD').mha }));
  };
  const single = { base: 'NBSD', band: 'E1–E4', timeline: '60-90', partner: false, kids: {}, bedrooms: 'help', open: ['renting'], priorities: ['cost', 'where'] };
  let got = await plan(single);
  const rows = bah.filter((r) => r.pay_band === 'E1–E4' && r.mha === got.mha).map((r) => r.without_dependents);
  const want = `${got.mha}|E1–E4|${Math.min(...rows)}|${Math.max(...rows)}`;
  expect('plan-misc', got.notes.includes('with-dependents allowance') && got.without.length >= 1 && got.without.every((w) => w.key === want && w.text.includes(`$${Math.min(...rows).toLocaleString('en-US')}`) && w.href === '/base/naval-base-san-diego/#bah-table'), `alone at NBSD: ${JSON.stringify(got.without)} (want ${want})`);
  expect('plan-misc', !/smallest row/.test(got.text) && /studio and 1-bedroom rents/.test(got.text), 'alone: the plan still says "the smallest row we have" or doesn\'t point to the studio and 1-bedroom rents');
  expect('plan-misc', got.bahLinks.length > 0 && got.bahLinks.every((h) => h.endsWith('/#bah-table')), `BAH lines cite ${[...new Set(got.bahLinks)].join(', ')}`);
  got = await plan({ ...single, base: 'unsure' });
  expect('plan-misc', got.notes.includes('with-dependents allowance') && !got.without.length, `alone, base not sure: ${got.without.length} without-dependents lines`);
  got = await plan({ ...single, partner: true });
  expect('plan-misc', !got.notes.includes('moving on your own') && !got.without.length, 'with a partner, the plan still says "moving on your own"');
  await page.goto(`${BASE}/base/naval-base-san-diego/`);
  expect('plan-misc', (await page.locator('#bah-table').count()) === 1, 'the base page has no #bah-table');
  // Clear asks first, here too.
  await page.evaluate((a) => localStorage.setItem('pcs-sd:intake', JSON.stringify({ answers: a })), single);
  await page.goto(`${BASE}/plan/`);
  page.once('dialog', (d) => d.dismiss());
  await page.locator('[data-plan-view] [data-clear]').click();
  const keptAfterCancel = (await page.locator('[data-plan-view]').isVisible()) && (await page.evaluate(() => localStorage.getItem('pcs-sd:intake'))) !== null;
  page.once('dialog', (d) => d.accept());
  await page.locator('[data-plan-view] [data-clear]').click();
  expect('plan-misc', keptAfterCancel && (await page.evaluate(() => localStorage.getItem('pcs-sd:intake'))) === null && !(await page.locator('[data-plan-view]').isVisible()), `Clear on the plan: Cancel ${keptAfterCancel ? 'kept' : 'didn\'t keep'} the answers, OK didn't clear`);
  await ctx.close();
}
passes.push('plan-misc: corrupt storage reset, input names, the bedroom helper by pay grade, a member alone (with-dependents note, rate without from bah.json), #bah-table, Clear asks first');

await browser.close();
console.log('\nFront end checks (browser)');
for (const p of passes) console.log(`  ${failures.some((f) => f.startsWith(p.split(':')[0] + ':')) ? 'FAIL' : 'PASS'}  ${p}`);
for (const f of failures) console.log(`        ${f}`);
console.log(failures.length ? `\n${failures.length} failure(s)\n` : '\nAll pass\n');
process.exit(failures.length ? 1 : 0);
