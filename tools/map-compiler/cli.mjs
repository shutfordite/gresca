// The map compiler's command line: reads a map config, gets the raw downloads from the cache (or the network with
// --fetch), compiles maps/<id>.terrain.json with core.js, and writes it only if validate.js accepts it.
// Usage: node tools/map-compiler/cli.mjs --config maps/sources/<id>.json [--cache .map-cache] [--out <file>] [--fetch]
// Course: node tools/map-compiler/cli.mjs --course --terrain maps/<id>.terrain.json (--run way/1,way/2 | --run-name
// "<piste>" | --config maps/sources/<id>.json with a "course" block) [--out <file>] [--overwrite]: offline, writes
// maps/<id>.course.json (docs/adr/0010-map-course-format.md).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { compileCourse, compileTerrain, createProjection, gridFor, latLonBox, stringifyMap } from './core.js';
import { createTerrariumDem, decodeTerrarium, tilesCovering, tileUrl } from './sources/terrarium.js';
import { parseOpenSkiMapLifts, parseOpenSkiMapRuns, parseOverpass } from './sources/openskimap.js';
import { validateCourse, validateTerrain } from './validate.js';

const MANIFEST = 'manifest.json';
const MAX_DOWNLOAD_BYTES = 1024 * 1024 * 1024; // bytes, the largest raw download kept (the world's runs GeoJSON)
const USER_AGENT = 'gresca-map-compiler/1 (offline map baker)';

/** Runs the compiler with command-line args (without node and the script); returns the exit code (0 when written). */
export async function runCli(args, log = console.log) {
 const opts = parseArgs(args);
 if (opts.course) return runCourseCli(opts, log);
 const config = JSON.parse(fs.readFileSync(opts.config, 'utf8'));
 const cache = openCache(opts.cache, opts.fetch);
 const grid = gridFor(config);
 const projection = createProjection(config.centre.lat, config.centre.lon);
 const box = latLonBox(grid, projection);
 const elevation = await loadElevation(config, box, cache);
 const lines = await loadLines(config.pistes, box, cache);
 const file = compileTerrain({ config, dem: elevation.dem, pistes: lines.pistes, lifts: lines.lifts,
  sources: [elevation.source, ...lines.sources] });
 const result = validateTerrain(file);
 for (const w of result.warnings) log('warning: ' + w);
 if (!result.ok) {
  for (const e of result.errors) log('error: ' + e);
  return 1;
 }
 const out = opts.out || path.join('maps', config.id + '.terrain.json');
 const text = stringifyMap(file);
 fs.mkdirSync(path.dirname(out), { recursive: true });
 fs.writeFileSync(out, text);
 log('wrote ' + out + ': ' + grid.nx + ' x ' + grid.ny + ' at ' + grid.cellM + ' m, ' + file.pistes.length +
  ' piste parts, ' + file.lifts.length + ' lift parts, ' + Math.round(text.length / 1024) + ' KB');
 return 0;
}

// Makes maps/<id>.course.json from a baked terrain file: offline, from the file alone. The run comes from --run
// (OSM ids), --run-name or the config's "course" block; the rest of the block (park, sun, widths) is authored input.
// An existing course file is never replaced without --overwrite: it holds hand-made level design (R2).
function runCourseCli(opts, log) {
 if (!opts.terrain) throw new Error('map compiler: --terrain maps/<id>.terrain.json is required with --course');
 const terrain = JSON.parse(fs.readFileSync(opts.terrain, 'utf8'));
 const terrainResult = validateTerrain(terrain);
 if (!terrainResult.ok) {
  for (const e of terrainResult.errors) log('error: ' + e);
  return 1;
 }
 const authored = opts.config ? JSON.parse(fs.readFileSync(opts.config, 'utf8')).course || {} : {};
 const run = opts.run ? { osm: opts.run.split(',') } : opts.runName ? { name: opts.runName } : authored.run;
 if (!run) throw new Error('map compiler: give --run, --run-name or a "course.run" in the config');
 const file = compileCourse({ ...authored, terrain, run });
 const result = validateCourse(file, terrain);
 for (const w of result.warnings) log('warning: ' + w);
 if (!result.ok) {
  for (const e of result.errors) log('error: ' + e);
  return 1;
 }
 const out = opts.out || path.join(path.dirname(opts.terrain), terrain.id + '.course.json');
 if (fs.existsSync(out) && !opts.overwrite) {
  throw new Error('map compiler: ' + out + ' exists and may hold authored level design (use --overwrite)');
 }
 fs.writeFileSync(out, stringifyMap(file));
 log('wrote ' + out + ': ' + Math.round(result.stats.lengthM) + ' m, mean slope ' + file.meanSlopeDeg + ' deg');
 return 0;
}

function parseArgs(args) {
 const opts = { config: null, cache: '.map-cache', out: null, fetch: false, course: false, overwrite: false,
  terrain: null, run: null, runName: null };
 const values = { '--config': 'config', '--cache': 'cache', '--out': 'out', '--terrain': 'terrain', '--run': 'run',
  '--run-name': 'runName' };
 for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--fetch') opts.fetch = true;
  else if (a === '--course') opts.course = true;
  else if (a === '--overwrite') opts.overwrite = true;
  else if (Object.hasOwn(values, a)) opts[values[a]] = args[++i];
  else throw new Error('map compiler: unknown argument ' + a);
 }
 if (!opts.config && !opts.course) throw new Error('map compiler: --config maps/sources/<id>.json is required');
 return opts;
}

// The raw-download cache: files named by the hash of their request, and a manifest of {url, file, retrieved,
// sha256} so a re-run from the cache is offline and writes the same file.
function openCache(dir, mayFetch) {
 fs.mkdirSync(dir, { recursive: true });
 const manifestPath = path.join(dir, MANIFEST);
 const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
 async function get(key, request) {
  const hit = Object.hasOwn(manifest, key) ? manifest[key] : null;
  if (hit) return { bytes: new Uint8Array(fs.readFileSync(path.join(dir, hit.file))), entry: hit };
  if (!mayFetch) throw new Error('map compiler: ' + key + ' is not in the cache ' + dir + ' (run with --fetch)');
  const bytes = await download(request);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const file = crypto.createHash('sha256').update(key).digest('hex').slice(0, 24) + '.bin';
  fs.writeFileSync(path.join(dir, file), bytes);
  const entry = { file, retrieved: new Date().toISOString().slice(0, 10), sha256 };
  manifest[key] = entry;
  const sorted = Object.fromEntries(Object.keys(manifest).sort().map((k) => [k, manifest[k]]));
  fs.writeFileSync(manifestPath, JSON.stringify(sorted, null, 1) + '\n');
  return { bytes, entry };
 }
 return { get };
}

async function download({ url, body }) {
 const init = { headers: { 'User-Agent': USER_AGENT } };
 if (body) Object.assign(init, { method: 'POST', body, headers: { ...init.headers,
  'Content-Type': 'application/x-www-form-urlencoded' } });
 let response;
 try {
  response = await fetch(url, init);
 } catch (e) {
  throw new Error('map compiler: could not fetch ' + url + ' (' + (e.cause?.message || e.message) + ')', { cause: e });
 }
 if (!response.ok) throw new Error('map compiler: ' + url + ' answered HTTP ' + response.status);
 const bytes = new Uint8Array(await response.arrayBuffer());
 if (bytes.length > MAX_DOWNLOAD_BYTES) throw new Error('map compiler: ' + url + ' is too large');
 return bytes;
}

async function loadElevation(config, box, cache) {
 const e = config.elevation || {};
 if (e.source !== 'terrarium') throw new Error('map config elevation.source: only "terrarium" is supported');
 const tiles = [];
 const hashes = [];
 let retrieved = '';
 for (const t of tilesCovering(box, e.zoom, e.tileSize)) {
  const url = tileUrl(e.url, t);
  const { bytes, entry } = await cache.get(url, { url });
  const decoded = decodeTerrarium(bytes);
  if (decoded.size !== e.tileSize) throw new Error('map compiler: ' + url + ' is not ' + e.tileSize + ' px');
  tiles.push({ x: t.x, y: t.y, heights: decoded.heights });
  hashes.push(t.z + '/' + t.x + '/' + t.y + ' ' + entry.sha256);
  if (entry.retrieved > retrieved) retrieved = entry.retrieved;
 }
 const dem = createTerrariumDem({ z: e.zoom, tileSize: e.tileSize, tiles, latitude: config.centre.lat });
 const source = { role: 'elevation', name: e.name, url: e.url, licence: e.licence, attribution: e.attribution,
  retrieved, files: tiles.length, sha256: sha256(hashes.join('\n')) };
 return { dem, source };
}

async function loadLines(p, box, cache) {
 if (!p) return { pistes: [], lifts: [], sources: [] };
 const record = (role, url, entry) => ({ role, name: p.name, url, licence: p.licence, attribution: p.attribution,
  retrieved: entry.retrieved, files: 1, sha256: entry.sha256 });
 if (p.source === 'openskimap') {
  const runs = await cache.get(p.runsUrl, { url: p.runsUrl });
  const lifts = await cache.get(p.liftsUrl, { url: p.liftsUrl });
  return {
   pistes: parseOpenSkiMapRuns(json(runs.bytes)),
   lifts: parseOpenSkiMapLifts(json(lifts.bytes)),
   sources: [record('pistes', p.runsUrl, runs.entry), record('lifts', p.liftsUrl, lifts.entry)],
  };
 }
 if (p.source === 'overpass') {
  const bbox = [box.south, box.west, box.north, box.east].join(',');
  const query = '[out:json][timeout:60];(way["piste:type"="downhill"](' + bbox + ');way["aerialway"](' + bbox +
   '););out tags geom;';
  const got = await cache.get(p.url + '?' + query, { url: p.url, body: 'data=' + encodeURIComponent(query) });
  return { ...parseOverpass(json(got.bytes)), sources: [record('pistes', p.url, got.entry)] };
 }
 throw new Error('map config pistes.source: must be "openskimap" or "overpass"');
}

const json = (bytes) => JSON.parse(new TextDecoder().decode(bytes));
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 runCli(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
 }, (e) => {
  console.error(e.message);
  process.exitCode = 1;
 });
}
