#!/usr/bin/env node
// Pages Functions checks (postbuild). Cloudflare compiles functions/ itself, after
// `npm run build`, with the wrangler in its build image, and that wrangler is older
// than the one you'd get from npx (session 5c: wrangler 3 failed on syntax wrangler 4
// accepts). So this checks, in our own files reachable from functions/:
//
//   functions-syntax  no import attributes or assertions (`import x from './a.json' with { type: 'json' }`):
//                     wrangler 3's esbuild 0.17 can't parse them, and Node needs them for JSON,
//                     so JSON can't be imported at all; ship data as a static asset instead
//   functions-runtime no node: or Node built-in imports and no process.env (no nodejs_compat flag is set;
//                     configuration comes from the env argument)
//   functions-size    the bundled Function, gzipped, fits the Workers free-plan limit (3 MB)
//
// Bundling uses the esbuild that comes with Astro; if it's missing, the size check is skipped.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { builtinModules } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FUNCTIONS = join(ROOT, 'functions');
const FREE_PLAN_BYTES = 3 * 1024 * 1024; // Workers Free: 3 MB after compression
const failures = [];
const passes = [];
const skipped = [];
const fail = (check, where, what) => failures.push({ check, where, what });

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : /\.(m?js|ts)$/.test(f) ? [p] : [];
});

if (!existsSync(FUNCTIONS)) {
  skipped.push('no functions/ directory');
} else {
  const entries = walk(FUNCTIONS);
  // Our own files reachable through relative imports (node_modules are wrangler's to bundle).
  const seen = new Set();
  const queue = [...entries];
  const builtins = new Set(builtinModules);
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    const where = relative(ROOT, file);
    const code = readFileSync(file, 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // Static imports and re-exports only: `import 'x'`, `import … from 'x'`, `export … from 'x'`.
    for (const m of code.matchAll(/\b(?:import\s+(?:[^;'"]*?\sfrom\s*)?|export\s+[^;'"]*?\sfrom\s*)['"]([^'"]+)['"]\s*(with|assert)?\s*(\{)?/g)) {
      const [, spec, attr, brace] = m;
      if (attr && brace) fail('functions-syntax', where, `import ${attr} { … } on "${spec}" (wrangler 3 can't parse it)`);
      if (spec.endsWith('.json')) fail('functions-syntax', where, `JSON import "${spec}" (needs an import attribute in Node; ship it as a static asset)`);
      if (spec.startsWith('node:') || builtins.has(spec.split('/')[0])) fail('functions-runtime', where, `Node built-in "${spec}" (no nodejs_compat flag)`);
      if (spec.startsWith('.')) {
        const target = resolve(dirname(file), spec);
        if (existsSync(target)) queue.push(target);
        else fail('functions-syntax', where, `relative import "${spec}" not found`);
      }
    }
    if (/\bprocess\.env\b/.test(code)) fail('functions-runtime', where, 'process.env (Workers read configuration from the env argument)');
  }
  passes.push(`functions: ${entries.length} route file(s), ${seen.size} of our files checked`);

  let esbuild = null;
  try { esbuild = await import('esbuild'); } catch { /* not installed */ }
  if (!esbuild) skipped.push('functions-size (esbuild not installed)');
  else {
    for (const entry of entries) {
      const out = await esbuild.build({
        // As wrangler bundles: browser platform (so packages' "browser" field swaps out Node-only files,
        // as the Anthropic SDK's does) and node: imports left external (the SDK keeps one optional
        // dynamic import('node:buffer'), which wrangler also leaves in place).
        entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'browser',
        conditions: ['workerd', 'worker', 'browser'], external: ['node:*'], logLevel: 'silent',
      }).catch((e) => { fail('functions-size', relative(ROOT, entry), `doesn't bundle: ${e.message.split('\n')[0]}`); return null; });
      if (!out) continue;
      const raw = out.outputFiles[0].contents;
      const gz = gzipSync(raw, { level: 9 }).length;
      if (gz > FREE_PLAN_BYTES) fail('functions-size', relative(ROOT, entry), `${(gz / 1048576).toFixed(2)} MB gzipped, over the 3 MB free-plan limit`);
      passes.push(`${relative(ROOT, entry)}: ${Math.round(raw.length / 1024)} KB bundled, ${Math.round(gz / 1024)} KB gzipped (free-plan limit 3 MB)`);
    }
  }
}

const checks = ['functions-syntax', 'functions-runtime', 'functions-size'];
const byCheck = failures.reduce((acc, f) => ((acc[f.check] ??= []).push(f), acc), {});
console.log('\nPages Functions checks');
for (const c of checks) {
  const fs = byCheck[c] ?? [];
  if (!fs.length) console.log(`  PASS  ${c}`);
  else {
    console.log(`  FAIL  ${c} (${fs.length})`);
    for (const f of fs) console.log(`        ${f.where}: ${f.what}`);
  }
}
for (const s of skipped) console.log(`  SKIP  ${s}`);
for (const p of passes) console.log(`  ${p}`);
if (failures.length) {
  console.log(`\n${failures.length} Pages Functions check failure(s). Build failed.\n`);
  process.exit(1);
}
console.log('');
