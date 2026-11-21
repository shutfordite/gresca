// The piste and lift sources: OpenSkiMap runs and lifts GeoJSON, and Overpass JSON as the fallback (R3).
// Both are untrusted downloads: only known fields are read, strings are capped, and sizes are bounded. Output lines are
// [lon, lat] degree pairs; core.js projects them into the map's ENU metres and clips them to its bounds.

const MAX_FEATURES = 500000; // features or elements in one download (the world's OpenSkiMap runs are ~150k)
const MAX_POINTS = 100000; // points in one line
const MAX_TEXT = 200; // characters kept of a name or tag
const OSM_ID = /^(node|way|relation)\/\d{1,15}$/;
const NOT_LIFT_LINES = new Set(['station', 'pylon', 'goods']); // aerialway values that are not a ride

/**
 * The downhill runs of an OpenSkiMap runs FeatureCollection: [{id, osm: ['way/1', ...], name, difficulty, grooming,
 * area (true for a polygon run, outer rings only), lines: [[[lon, lat], ...], ...]}], sorted by id.
 */
export function parseOpenSkiMapRuns(geojson) {
 return features(geojson, 'runs').filter((f) => text(f.properties.type) === 'run')
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
export function parseOpenSkiMapLifts(geojson) {
 return features(geojson, 'lifts').filter((f) => text(f.properties.type) === 'lift')
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

function features(geojson, what) {
 if (!isObject(geojson) || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
  throw new Error('openskimap ' + what + ': not a GeoJSON FeatureCollection');
 }
 if (geojson.features.length > MAX_FEATURES) throw new Error('openskimap ' + what + ': too many features');
 return geojson.features.filter((f) => isObject(f) && isObject(f.properties) && isObject(f.geometry) &&
  typeof f.geometry.type === 'string');
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
