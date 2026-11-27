// The piste and lift sources: OpenSkiMap runs and lifts GeoJSON, and Overpass JSON as the fallback (R3).
// Both are untrusted downloads: only known fields are read, strings are capped, and sizes are bounded. Output lines are
// [lon, lat] degree pairs; core.js projects them into the map's ENU metres and clips them to its bounds.
// The world's OpenSkiMap files are larger than the longest string Node can hold (about 512 MB), so raw bytes are
// read one feature at a time (`eachFeature`) and features outside the map's box are dropped as they are read.

const MAX_FEATURES = 500000; // features or elements in one download (the world's OpenSkiMap runs are ~150k)
const MAX_POINTS = 100000; // points in one line
const MAX_TEXT = 200; // characters kept of a name or tag
const OSM_ID = /^(node|way|relation)\/\d{1,15}$/;
const NOT_LIFT_LINES = new Set(['station', 'pylon', 'goods']); // aerialway values that are not a ride

/**
 * The downhill runs of an OpenSkiMap runs FeatureCollection: [{id, osm: ['way/1', ...], name, difficulty, grooming,
 * area (true for a polygon run, outer rings only), lines: [[[lon, lat], ...], ...]}], sorted by id.
 * geojson is the parsed object or the raw bytes (Uint8Array); box {south, west, north, east} (degrees), when given,
 * keeps only the features whose extent meets it.
 */
export function parseOpenSkiMapRuns(geojson, box) {
 return features(geojson, 'runs', box).filter((f) => text(f.properties.type) === 'run')
  .filter((f) => Array.isArray(f.properties.uses) && f.properties.uses.includes('downhill'))
  .map((f) => ({
   id: text(f.properties.id),
   osm: osmIds(f.properties.sources),
   name: text(f.properties.name),
   difficulty: text(f.properties.difficulty),
   grooming: text(f.properties.grooming),
   area: /Polygon$/.test(f.geometry.type),
   lines: lines(f.geometry),
  }))
  .filter((r) => r.id && r.lines.length > 0)
  .sort(byId);
}

/** The lifts of an OpenSkiMap lifts FeatureCollection: [{id, osm, name, kind (liftType), lines}], sorted by id. */
export function parseOpenSkiMapLifts(geojson, box) {
 return features(geojson, 'lifts', box).filter((f) => text(f.properties.type) === 'lift')
  .map((f) => ({
   id: text(f.properties.id),
   osm: osmIds(f.properties.sources),
   name: text(f.properties.name),
   kind: text(f.properties.liftType),
   lines: lines(f.geometry),
  }))
  .filter((l) => l.id && l.lines.length > 0)
  .sort(byId);
}

/**
 * {pistes, lifts} in the same shapes from an Overpass `out tags geom` JSON answer: ways with piste:type=downhill
 * and ways with an aerialway tag. The id and the one osm id are 'way/<id>'.
 */
export function parseOverpass(json) {
 if (!isObject(json) || !Array.isArray(json.elements)) throw new Error('overpass: no elements array');
 if (json.elements.length > MAX_FEATURES) throw new Error('overpass: more than ' + MAX_FEATURES + ' elements');
 const pistes = [];
 const lifts = [];
 for (const el of json.elements) {
  if (!isObject(el) || el.type !== 'way' || !Number.isSafeInteger(el.id) || !Array.isArray(el.geometry)) continue;
  const tags = isObject(el.tags) ? el.tags : {};
  const id = 'way/' + el.id;
  const line = el.geometry.slice(0, MAX_POINTS).filter(isObject).map((p) => [p.lon, p.lat]).filter(isLonLat);
  if (line.length < 2) continue;
  const name = text(tags.name) || text(tags['piste:name']);
  if (text(tags['piste:type']) === 'downhill') {
   const area = tags.area === 'yes';
   pistes.push({ id, osm: [id], name, difficulty: text(tags['piste:difficulty']),
    grooming: text(tags['piste:grooming']), area, lines: [line] });
  } else if (tags.aerialway && !NOT_LIFT_LINES.has(text(tags.aerialway))) {
   lifts.push({ id, osm: [id], name, kind: text(tags.aerialway), lines: [line] });
  }
 }
 return { pistes: pistes.sort(byId), lifts: lifts.sort(byId) };
}

function features(geojson, what, box) {
 const usable = (f) => isObject(f) && isObject(f.properties) && isObject(f.geometry) &&
  typeof f.geometry.type === 'string' && (!box || meets(f.geometry.coordinates, box));
 if (geojson instanceof Uint8Array) {
  const kept = [];
  eachFeature(geojson, what, (f) => {
   if (usable(f)) kept.push(f);
  });
  return kept;
 }
 if (!isObject(geojson) || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
  throw new Error('openskimap ' + what + ': not a GeoJSON FeatureCollection');
 }
 if (geojson.features.length > MAX_FEATURES) throw new Error('openskimap ' + what + ': too many features');
 return geojson.features.filter(usable);
}

const QUOTE = 0x22;
const BACKSLASH = 0x5c;
const OPEN_BRACE = 0x7b;
const CLOSE_BRACE = 0x7d;
const OPEN_BRACKET = 0x5b;
const CLOSE_BRACKET = 0x5d;
const FEATURES_KEY = '"features"';

/**
 * Calls fn(feature) for each element of the top-level "features" array of a GeoJSON FeatureCollection given as raw
 * UTF-8 bytes, parsing one element at a time, so the whole file is never one string. Throws on a file that is not a
 * FeatureCollection, is cut short, or has more than MAX_FEATURES features.
 */
export function eachFeature(bytes, what, fn) {
 const decoder = new TextDecoder();
 let depth = 0; // nesting of {} and []
 let inString = false;
 let stringStart = -1;
 let lastKey = ''; // the last string closed at depth 1 (a key of the collection)
 let isCollection = false;
 let featuresDepth = -1; // depth inside the features array, once it opens
 let featureStart = -1;
 let count = 0;
 for (let i = 0; i < bytes.length; i++) {
  const b = bytes[i];
  if (inString) {
   if (b === BACKSLASH) i++;
   else if (b === QUOTE) {
    inString = false;
    if (depth === 1) {
     const s = i - stringStart < 32 ? decoder.decode(bytes.subarray(stringStart, i + 1)) : '';
     if (s === '"FeatureCollection"' && lastKey === '"type"') isCollection = true;
     lastKey = s;
    }
   }
   continue;
  }
  if (b === QUOTE) {
   inString = true;
   stringStart = i;
  } else if (b === OPEN_BRACE || b === OPEN_BRACKET) {
   depth++;
   if (b === OPEN_BRACKET && depth === 2 && lastKey === FEATURES_KEY) featuresDepth = 2;
   else if (b === OPEN_BRACE && featuresDepth === 2 && depth === 3) featureStart = i;
  } else if (b === CLOSE_BRACE || b === CLOSE_BRACKET) {
   if (b === CLOSE_BRACE && featuresDepth === 2 && depth === 3 && featureStart >= 0) {
    if (++count > MAX_FEATURES) throw new Error('openskimap ' + what + ': too many features');
    fn(JSON.parse(decoder.decode(bytes.subarray(featureStart, i + 1))));
    featureStart = -1;
   }
   if (b === CLOSE_BRACKET && depth === 2 && featuresDepth === 2) featuresDepth = -2; // the array is done
   depth--;
   if (depth < 0) break;
  }
 }
 if (!isCollection || featuresDepth !== -2 || depth !== 0) {
  throw new Error('openskimap ' + what + ': not a complete GeoJSON FeatureCollection');
 }
}

// Whether any [lon, lat] in nested coordinate arrays lies in box, or the coordinates' extent overlaps it.
function meets(coordinates, box) {
 let west = Infinity;
 let east = -Infinity;
 let south = Infinity;
 let north = -Infinity;
 const visit = (c, level) => {
  if (!Array.isArray(c) || level > 4) return;
  if (typeof c[0] === 'number') {
   if (isLonLat(c)) {
    west = Math.min(west, c[0]);
    east = Math.max(east, c[0]);
    south = Math.min(south, c[1]);
    north = Math.max(north, c[1]);
   }
   return;
  }
  for (const x of c) visit(x, level + 1);
 };
 visit(coordinates, 0);
 return west <= box.east && east >= box.west && south <= box.north && north >= box.south;
}

// The lines of a LineString, MultiLineString, Polygon (outer ring) or MultiPolygon (outer rings), each >= 2 points.
function lines(geometry) {
 const c = geometry.coordinates;
 if (!Array.isArray(c)) return [];
 const raw = {
  LineString: [c],
  MultiLineString: c,
  Polygon: [c[0]],
  MultiPolygon: Array.isArray(c) ? c.map((poly) => Array.isArray(poly) ? poly[0] : null) : [],
 }[geometry.type] || [];
 return raw.filter((line) => Array.isArray(line) && line.length <= MAX_POINTS)
  .map((line) => line.filter(isLonLat).map((p) => [p[0], p[1]]))
  .filter((line) => line.length >= 2);
}

function osmIds(sources) {
 if (!Array.isArray(sources)) return [];
 const ids = sources.filter((s) => isObject(s) && s.type === 'openstreetmap' && OSM_ID.test(String(s.id)))
  .map((s) => String(s.id));
 return [...new Set(ids)].sort();
}

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isLonLat = (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) &&
 Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
const text = (v) => typeof v === 'string' ? v.slice(0, MAX_TEXT) : typeof v === 'number' ? String(v) : '';
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
