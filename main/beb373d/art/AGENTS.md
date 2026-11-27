# art: the Hanga spec and the rider animation (classic scripts, not ES modules)

- Both files are UMD classic scripts: `window.HANGA` / `window.RiderAnim` in the browser, `require` in Node.
  No canvas, no DOM, no game state. Only `src/main.js` reads them; everything else gets them through `env`.
- `gresca-hanga-spec.js` (110 KB, stream S6): never read it whole. Run `node tools/outline.mjs art/gresca-hanga-spec.js 2`
  for line ranges, then `sed -n`. Change it only as a new version: bump `version` and the header, keep changes
  additive (checked against the previous version in `test/fixtures/` by `test/hanga-v14.test.js`), and write
  `docs/art/HANGA-v<version>.md`. After a new version, re-sync the claude.ai design canvas copy (`docs/STATUS.md`).
- `gresca-rider-anim.js` (stream S3): pure maths on top of the spec. Bump its header version on behaviour
  changes. Tests: `test/rider-anim.test.js`.
- Don't open the PNGs in `docs/art/` unless the package is about how the rider looks.

## Code map
| To change | Edit | Tests |
|---|---|---|
| Rider pose and body motion (S3) | `gresca-rider-anim.js`, `src/view/rider-animation.js` | `rider-anim` and the `rider-*` tests |
| Rider shapes, poses, palette: the spec (a new version only) | `gresca-hanga-spec.js`, `docs/art/HANGA-v<version>.md` | `hanga-v14` |
| The rider contact sheet (every pose for checking by eye) | `tools/rider-sheet.html`, `tools/rider-sheet.js` | none |
