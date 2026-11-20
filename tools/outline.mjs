// Prints a line-numbered outline of a large data file, so agents read one section with `sed -n`, not the whole file.
//
// Usage: node tools/outline.mjs <file> [depth]
// depth 1 (default) lists the top-level keys of the art spec; depth 2 adds their children (the last child of a
// key runs on to the end of its parent).
// Keys are recognised in pretty-printed JSON style (`"key":` at an indent of `depth` spaces or less, as in
// art/gresca-hanga-spec.js), and functions as `NAME.key = function` or `function name(` at the start of a line.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const KEY_PATTERN = /^( *)"([^"]+)"\s*:/;
const FUNCTION_PATTERN = /^(?:[A-Za-z_$][\w$]*\.([\w$]+)\s*=\s*function|function\s+([\w$]+)\s*\()/;

/**
 * Outline the sections of a text file.
 * @param {string} text file contents
 * @param {number} depth deepest key indent to list, in spaces (1 = top-level keys of the spec)
 * @returns {{name: string, depth: number, start: number, end: number}[]} 1-based inclusive line ranges
 */
export function outline(text, depth = 1) {
 const lines = text.split('\n');
 const entries = [];
 for (let i = 0; i < lines.length; i++) {
  const entry = matchEntry(lines[i], depth);
  if (entry) {
   entries.push({ name: entry.name, depth: entry.depth, start: i + 1, end: lines.length });
  }
 }
 closeRanges(entries, lines.length);
 return entries;
}

/** Match one line against the key and function patterns; returns {name, depth} or null. */
function matchEntry(line, maxDepth) {
 const key = KEY_PATTERN.exec(line);
 if (key && key[1].length >= 1 && key[1].length <= maxDepth) {
  return { name: key[2], depth: key[1].length };
 }
 const fn = FUNCTION_PATTERN.exec(line);
 if (fn) {
  return { name: (fn[1] || fn[2]) + '()', depth: 0 };
 }
 return null;
}

/** Each entry ends on the line before the next entry at the same or a shallower depth (fills `entries`). */
function closeRanges(entries, lineCount) {
 for (let i = 0; i < entries.length; i++) {
  entries[i].end = lineCount;
  for (let j = i + 1; j < entries.length; j++) {
   if (entries[j].depth <= entries[i].depth || entries[j].depth === 0) {
    entries[i].end = entries[j].start - 1;
    break;
   }
  }
 }
}

function main() {
 const [file, depthArg] = process.argv.slice(2);
 if (!file) {
  console.error('usage: node tools/outline.mjs <file> [depth]');
  process.exit(1);
 }
 const depth = depthArg ? Number(depthArg) : 1;
 for (const entry of outline(readFileSync(file, 'utf8'), depth)) {
  const indent = ' '.repeat(Math.max(entry.depth - 1, 0) * 2);
  console.log(`${entry.start}-${entry.end}\t${indent}${entry.name}`);
 }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
 main();
}
