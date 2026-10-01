#!/usr/bin/env node
// Layout check (not part of npm run build: it needs a browser). Loads every page at
// 390, 768, 1280 and 1440 px and reports any that scroll sideways or have an element
// past the right edge (tables scroll inside .table-wrap and don't count). Can also save screenshots.
//
//   npm run dev                                    # site at http://localhost:4321
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
//       --remote-debugging-port=9333 --user-data-dir=/tmp/pcs-chrome about:blank &
//   find dist -name index.html | sed 's|^dist||; s|index.html$||' > /tmp/pages.txt
//   node scripts/check_layout.mjs 9333 /tmp "" /tmp/pages.txt
//   node scripts/check_layout.mjs 9333 /tmp "390|/|home-390,1440|/base/miramar/|miramar-1440"
//
// It drives Chrome over the DevTools protocol because headless Chrome won't size a
// window below ~500 px; device-metrics emulation gives a true 390 px viewport.
import { readFileSync, writeFileSync } from 'node:fs';
const [port, out, shotsArg, allFile] = process.argv.slice(2);
const targets = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(targets.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); const waiters = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  else if (m.method) waiters.filter((w) => w.method === m.method).forEach((w) => { w.r(m); waiters.splice(waiters.indexOf(w), 1); });
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const once = (method) => new Promise((r) => waiters.push({ method, r }));
await send('Page.enable');
const load = async (w, url) => {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: w < 700 });
  const done = once('Page.loadEventFired');
  await send('Page.navigate', { url });
  await done; await new Promise((r) => setTimeout(r, 250));
};
const overflow = async () => (await send('Runtime.evaluate', { expression: `(() => { const d = document.documentElement; const wide = [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.right > d.clientWidth + 1 && getComputedStyle(e).position !== 'fixed' && !e.closest('.table-wrap'); }).slice(0,3).map(e => e.tagName + '.' + e.className); return JSON.stringify({ sw: d.scrollWidth, cw: d.clientWidth, wide }); })()`, returnByValue: true })).result.result.value;
const base = 'http://localhost:4321';
const report = [];
if (allFile) {
  const pages = readFileSync(allFile, 'utf-8').trim().split('\n');
  for (const w of [390, 768, 1280, 1440]) {
    let bad = 0;
    for (const p of pages) {
      await load(w, base + p);
      const o = JSON.parse(await overflow());
      if (o.sw > o.cw || o.wide.length) { bad++; report.push(`OVERFLOW ${w} ${p} ${JSON.stringify(o)}`); }
    }
    report.push(`${w}px: ${pages.length} pages, ${bad} with sideways overflow`);
  }
}
for (const s of (shotsArg || '').split(',').filter(Boolean)) {
  const [w, path, name] = s.split('|');
  await load(Number(w), base + path);
  const { result: { result: { value: h } } } = await send('Runtime.evaluate', { expression: 'document.documentElement.scrollHeight', returnByValue: true });
  await send('Emulation.setDeviceMetricsOverride', { width: Number(w), height: Math.min(h, 2400), deviceScaleFactor: 1, mobile: Number(w) < 700 });
  await new Promise((r) => setTimeout(r, 200));
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${out}/${name}.png`, Buffer.from(shot.result.data, 'base64'));
  report.push(`shot ${name}`);
}
console.log(report.join('\n'));
ws.close(); process.exit(0);
