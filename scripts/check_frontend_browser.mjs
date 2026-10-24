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
//               opens card 1; × has a name and turns the chip off; Clear empties it and this browser's answers
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
//   cards       one card at a time with "Question n of 8"; arrow keys select without moving on, Enter moves on, a tap
//               on a single-choice option moves on, Back goes back; the new card's fieldset has focus; with every
//               priority offered, each card's Back/Next (or Show my plan) is on the first phone screen
//   ask         a question shows "Checking the sources…", then the reply with its source chip ("N sources ·
//               verified <date>") and a related-page card; the box becomes "Ask a follow-up"; "What's sent?" shows the
//               previous turn; "Ask about this plan" arrives with the chip set and the box focused
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
  const name = await btn.evaluate((e) => e.textContent.trim());
  expect('chip', name.startsWith('Your move, sent with your questions:') && (await btn.getAttribute('aria-expanded')) === 'false', `set: the chip button is named "${name}"`);
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
  await btn.click();
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
  await page.evaluate(() => localStorage.setItem('pcs-sd:intake', JSON.stringify({ answers: { partner: true, kids: { '0-2': 1, '3-5': 0, '6-9': 2, '10-13': 0, '14-18': 0 }, dogs: 1, bedrooms: 'help' } })));
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
  await page.locator('input[name="base"]').first().focus();
  await page.keyboard.press('Space');
  await page.waitForTimeout(400);
  expect('cards', (await progress()) === 'Question 2 of 8', `Space on an option didn't move on: "${await progress()}"`);
  await page.locator('[data-card-back]').click();
  await page.locator('input[name="base"]').first().focus();
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(400);
  expect('cards', (await progress()) === 'Question 1 of 8', 'an arrow key moved on');
  expect('cards', await page.locator('input[name="base"]').nth(1).isChecked(), 'the arrow key didn\'t select');
  await page.keyboard.press('Enter');
  expect('cards', (await progress()) === 'Question 2 of 8', 'Enter didn\'t move on');
  expect('cards', (await active(page)) === 'fieldset.current', `focus after moving on: ${await active(page)}`);
  await page.locator('#main label.opt', { hasText: 'E5–E6' }).tap();
  await page.waitForTimeout(400);
  expect('cards', (await progress()) === 'Question 3 of 8', 'a tap didn\'t move on');
  await page.locator('[data-card-back]').click();
  expect('cards', (await progress()) === 'Question 2 of 8', 'Back didn\'t go back');
  // Every priority offered (partner, a baby, a school-age child, a dog), then each card's buttons on the first screen.
  await page.evaluate(() => localStorage.setItem('pcs-sd:intake', JSON.stringify({ answers: { base: 'NBSD', band: 'E5–E6', timeline: '60-90', partner: true, kids: { '0-2': 1, '3-5': 0, '6-9': 1, '10-13': 0, '14-18': 0 }, bedrooms: null, separate6: null, cats: 0, dogs: 1, open: [], priorities: [] } })));
  await page.reload();
  expect('cards', (await progress()) === 'Question 5 of 8', `with 1–4 answered it opened on "${await progress()}"`);
  while ((await progress()) !== 'Question 1 of 8') await page.locator('[data-card-back]').click();
  for (let i = 0; i < 8; i++) {
    const m = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('[data-card-nav] .btn, [data-form-actions] .btn')].filter((e) => e.offsetParent);
      return { q: document.querySelector('fieldset.q.current').dataset.q, bottom: Math.max(...btns.map((e) => e.getBoundingClientRect().bottom)), picks: document.querySelectorAll('[data-pick-list] button').length };
    });
    expect('cards', m.bottom <= 844, `card ${m.q}: its buttons end at ${Math.round(m.bottom)} px, below the first screen`);
    if (m.q === '8') expect('cards', m.picks === 9, `card 8 offers ${m.picks} priorities, not all 9`);
    if (i < 7) await page.locator('[data-card-next]').click();
  }
  // Question 8 by taps, then the plan, then "Ask about this plan".
  // Questions 5 and 7, answered on their cards.
  await page.locator('[data-card-back]').click();
  await page.locator('#main label.opt', { hasText: 'Renting' }).click();
  for (let i = 0; i < 2; i++) await page.locator('[data-card-back]').click();
  await page.locator('#main label.opt', { hasText: /^3$/ }).click();
  await page.waitForTimeout(400);
  await page.locator('[data-card-next]').click();
  await page.locator('[data-card-next]').click();
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
passes.push('cards: progress, tap / Space / Enter move on, arrows don\'t, Back, focus, every card\'s buttons on the first screen, plan, "Ask about this plan"');

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
passes.push('ask: waiting state, source chip, related card, follow-up box, "What\'s sent?", "I don\'t have that" with its nearest page, new conversation');

await browser.close();
console.log('\nFront end checks (browser)');
for (const p of passes) console.log(`  ${failures.some((f) => f.startsWith(p.split(':')[0] + ':')) ? 'FAIL' : 'PASS'}  ${p}`);
for (const f of failures) console.log(`        ${f}`);
console.log(failures.length ? `\n${failures.length} failure(s)\n` : '\nAll pass\n');
process.exit(failures.length ? 1 : 0);
