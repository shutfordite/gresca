// How an area (sim, view, ui, input) registers its fields with the façade (debug.js): a field is {get, set?, moves?}.

/**
 * A façade field: get() returns a copy of the value state() reports; set(v) writes it (no set: read only); moves:
 * writing it restarts render interpolation (a position). Returns the frozen field.
 */
export function field(get, set, moves = false) {
 return Object.freeze({ get, set, moves });
}

/**
 * A field made of named sub-fields ({name: field}): get() returns an object of their values, set(v) writes any subset
 * and throws on an unknown name (named area.name in the message).
 */
export function nested(area, fields) {
 return field(() => {
  const o = {};
  for (const k in fields) o[k] = fields[k].get();
  return o;
 }, (v) => {
  for (const k in v) {
   if (!(k in fields)) throw new Error('Gresca.set: unknown field ' + area + '.' + k);
   fields[k].set(v[k]);
  }
 });
}

/** A writable field over obj[key] (a plain number, string or boolean; moves: see field()). */
export function prop(obj, key, moves = false) {
 return field(() => obj[key], (v) => { obj[key] = v; }, moves);
}
