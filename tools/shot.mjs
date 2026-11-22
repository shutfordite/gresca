// Screenshots of every scene (src/scenes.js) for the snowboard and for skis, at iPad size, into shots/ (gitignored).
// Usage: npm run shot [-- scene ...]  (default: every scene). Serves the repo over HTTP and drives Chromium through
// Playwright, a dev-only dependency (docs/adr/0003-playwright-dev-only.md). Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to use
// an installed browser (for example /usr/bin/google-chrome) instead of the one `npx playwright-core install chromium`
// downloads. Prints the file names it wrote.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.join(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'shots');
const VIEWPORT = { width: 820, height: 1180 }; // CSS px: an iPad
const RIGS = ['board', 'ski'];
const SETTLE_FRAMES = 12;  // frames drawn after switching rig, so the rider animation reaches its pose
const SETTLE_DT_S = 1 / 30; // s per settle frame
const LOAD_TIMEOUT_MS = 60000; // ms to build the mountain and open the scene
const TYPES = {
 '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
};

// Serves the repository over HTTP (ES modules need it); returns the server, listening on a free port.
function serve() {
 const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const file = path.join(ROOT, path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, ''));
  const target = file.endsWith(path.sep) ? path.join(file, 'index.html') : file;
  if (!target.startsWith(ROOT) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
   res.writeHead(404).end('not found');
   return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(target)] || 'application/octet-stream' });
  fs.createReadStream(target).pipe(res);
 });
 return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// Opens the scene in the page, shows it with the rig, and returns the PNG file name written.
async function shoot(browser, base, scene, rig) {
 const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
 const problems = [];
 page.on('pageerror', (e) => problems.push(e.message));
 await page.goto(`${base}/?map=test&renderer=cpu&scene=${encodeURIComponent(scene)}`);
 await page.waitForFunction(() => window.Gresca && document.getElementById('msg').hidden, null,
  { timeout: LOAD_TIMEOUT_MS });
 await page.evaluate(([r, n, dt]) => {
  window.Gresca.set({ rig: r });
  for (let i = 0; i < n; i++) window.Gresca.frame(dt);
 }, [rig, SETTLE_FRAMES, SETTLE_DT_S]);
 const name = `${scene}-${rig}.png`;
 await page.screenshot({ path: path.join(OUT, name) });
 await page.close();
 if (problems.length) throw new Error(`${name}: page errors: ${problems.join('; ')}`);
 return name;
}

async function main() {
 const server = await serve();
 const base = `http://127.0.0.1:${server.address().port}`;
 const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
 try {
  const first = await browser.newPage({ viewport: VIEWPORT });
  await first.goto(base + '/?map=test&renderer=cpu');
  await first.waitForFunction(() => window.Gresca, null, { timeout: LOAD_TIMEOUT_MS });
  const known = await first.evaluate(() => window.Gresca.scenes().map((s) => s.name));
  await first.close();
  const wanted = process.argv.length > 2 ? process.argv.slice(2) : known;
  for (const s of wanted) if (!known.includes(s)) throw new Error('shot: unknown scene ' + s);
  fs.mkdirSync(OUT, { recursive: true });
  for (const scene of wanted) {
   for (const rig of RIGS) console.log(await shoot(browser, base, scene, rig));
  }
 } finally {
  await browser.close();
  server.close();
 }
}

await main();
