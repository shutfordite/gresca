// Headless Chrome smoke test for a PR: loads the page, presses Drop in, steers, rides 3 s and records the state,
// page errors and failed requests, plus two screenshots. With --base <dir>, repeats on that checkout only if the PR
// has problems, so the report can tell existing bugs (also on main) from new ones. Replaces opening the preview.
// Usage: node tools/review/smoke.mjs [--base ../base] [--out smoke.json] [--shots dir]
// Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to use an installed Chrome (Playwright is dev-only, ADR 0003).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { serve } from '../bench/serve.mjs';

const ROOT = path.join(import.meta.dirname, '..', '..');
const VIEWPORT = { width: 820, height: 1180 }; // CSS px: an iPad, at scale 1 (a 2x shot costs twice to read)
const LOAD_TIMEOUT_MS = 60000; // ms to build the mountain
const STEER_MS = 400;          // ms holding ArrowRight after dropping in
const RIDE_MS = 3000;          // ms of riding before the state is read

function arg(name, fallback = null) {
 const i = process.argv.indexOf('--' + name);
 return i > 0 ? process.argv[i + 1] : fallback;
}

/** Rides once on the checkout in `root`; returns {state, problems, error?}, writing shots with `shotPrefix`. */
async function ride(browser, root, shotPrefix) {
 const server = await serve(path.resolve(root));
 const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
 const problems = [];
 page.on('pageerror', (e) => problems.push('page error: ' + e.message));
 page.on('response', (r) => {
  if (r.status() < 400 || r.url().endsWith('favicon.ico')) return;
  problems.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`);
 });
 const out = { problems };
 try {
  await page.goto(`http://127.0.0.1:${server.address().port}/?renderer=cpu`, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.getElementById('go').hidden, null, { timeout: LOAD_TIMEOUT_MS });
  if (shotPrefix) await page.screenshot({ path: shotPrefix + 'menu.png' });
  const start = await page.evaluate(() => window.Gresca.state());
  await page.click('#go');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(STEER_MS);
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(RIDE_MS);
  const s = await page.evaluate(() => window.Gresca.state());
  out.state = { phase: s.phase, speed: s.speed, dx: s.x - start.x, dy: s.y - start.y };
  if (shotPrefix) await page.screenshot({ path: shotPrefix + 'ride.png' });
 } catch (e) {
  out.error = e.message.split('\n')[0];
 } finally {
  await page.close();
  server.close();
 }
 return out;
}

async function main() {
 const shots = arg('shots', path.join(ROOT, 'shots'));
 fs.mkdirSync(shots, { recursive: true });
 const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
 try {
  const result = { head: await ride(browser, ROOT, path.join(shots, 'smoke-')) };
  const base = arg('base');
  const bad = result.head.error || result.head.problems.length;
  if (base && bad) result.base = await ride(browser, base, null);
  const json = JSON.stringify(result);
  const out = arg('out');
  if (out) fs.writeFileSync(out, json + '\n');
  console.log(json);
 } finally {
  await browser.close();
 }
}

main().catch((e) => {
 console.error(e);
 process.exit(1);
});
