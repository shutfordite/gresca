// Starts the page's two slow loads together: the three.js import and a real map's files (G2). No browser globals.

/**
 * Starts `importThree()` (when `renderer` is 'gl') and then `loadMap(mapId)` (when `mapId` is set), both before either
 * is awaited, and resolves to { THREE, world } once both are done. `importThree` rejecting gives THREE null (the game
 * then draws on the CPU, after `warn`); `loadMap` resolves null itself when the map's files are missing or invalid.
 */
export async function startLoads({ renderer, mapId, importThree, loadMap, warn }) {
 const three = renderer === 'gl'
  ? importThree().catch((e) => { warn('Gresca: three.js did not load (' + e.message + ')'); return null; })
  : Promise.resolve(null);
 const world = mapId ? loadMap(mapId) : Promise.resolve(null);
 const [THREE, loaded] = await Promise.all([three, world]);
 return { THREE, world: loaded };
}
