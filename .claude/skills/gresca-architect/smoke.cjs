// Headless Chrome smoke test of a Gresca checkout: loads the page over HTTP, presses Drop in, steers, and reports
// state, failed requests and page errors, plus screenshots. Usage (from the repo root):
//   python3 -m http.server 8123 &   node .claude/skills/gresca-architect/smoke.cjs http://localhost:8123/ /tmp/shot
// Needs Playwright (here: /opt/npm-tools/node_modules/playwright) and Chrome at /usr/bin/google-chrome.
// GitHub Pages is not reachable from the sandbox, so this replaces opening the preview link.
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/npm-tools/node_modules/playwright');
const [url = 'http://localhost:8123/', out = '/tmp/gresca-shot'] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror ' + e.message));
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().endsWith('favicon.ico')) problems.push(r.status() + ' ' + r.url()); });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.getElementById('go').hidden, null, { timeout: 30000 });
  await page.screenshot({ path: out + '-menu.png' });
  await page.click('#go');
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(400); await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(3000);
  const state = await page.evaluate(() => { const s = Gresca.state(); return { phase: s.phase, x: s.x, y: s.y, speed: s.speed }; });
  await page.screenshot({ path: out + '-ride.png' });
  console.log(JSON.stringify({ state, problems }));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
