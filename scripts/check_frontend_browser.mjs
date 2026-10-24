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
//   fold        at 390×844, 768×1024 and 1280×800 the start screen fits the first screen and everything else on home
//               starts below it
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
//               previous turn; "Ask about this plan" arrives with the starting-plan option ticked
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleAsk } from '../assistant/ask.js';
import { buildIndex } from '../assistant/retrieve.js';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { console.error('Needs Playwright: npm i --no-save playwright'); process.exit(2); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.FRONTEND_BASE ?? 'http://localhost:4329';
const index = buildIndex(JSON.parse(readFileSync(join(ROOT, 'dist', 'assistant', 'corpus.json'), 'utf-8')));
const failures = [];
const passes = [];
const expect = (check, ok, what) => { if (!ok) failures.push(`${check}: ${what}`); };

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

// --- fold ---
for (const [w, h] of [[390, 844], [768, 1024], [1280, 800]]) {
  const ctx = await context({ width: w, height: h });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  const m = await page.evaluate(() => ({
    start: document.querySelector('[data-start]').getBoundingClientRect().bottom,
    trust: document.querySelector('[data-trust]').getBoundingClientRect().bottom,
    below: document.querySelector('[data-below]').getBoundingClientRect().top,
    vh: innerHeight,
  }));
  expect('fold', m.trust <= m.vh, `${w}×${h}: the start screen ends at ${Math.round(m.trust)} px, past the first screen (${m.vh})`);
  expect('fold', m.below >= m.vh - 1, `${w}×${h}: below-the-fold content starts at ${Math.round(m.below)} px, on the first screen`);
  await ctx.close();
}
passes.push('fold: 390×844, 768×1024, 1280×800');

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
  expect('ask', await page.locator('[data-context]').isChecked(), '"Ask about this plan" arrived with the starting-plan option off');
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
