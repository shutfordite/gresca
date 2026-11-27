// The maps the menu offers, a frozen list for the map picker. Debt: U's map search (docs/ROADMAP.md) replaces it.

/** Where the menu lets the player ride: id ('play', or the id of maps/<id>.*.json), label, run name (or null). */
export const MAP_CATALOG = Object.freeze([
 Object.freeze({ id: 'play', label: 'Play mountain', run: null }),
 Object.freeze({ id: 'el-tarter', label: 'El Tarter', run: 'Àliga' }),
]);

/** The id of the map a game was built on: a loaded real map's id, 'test' for the test slope or a scene, else 'play'. */
export function loadedMapId(env) {
 if (env.world) return env.world.id;
 return env.map === 'test' ? 'test' : 'play';
}

/** The picker button text: the label, and the run after a dot when the map has one. */
export function mapButtonText(entry) {
 return entry.run ? entry.label + ' · ' + entry.run : entry.label;
}
