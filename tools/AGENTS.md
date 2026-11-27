# tools: dev tools, CI checks and the map compiler (S5 by default; `bench/` is S4's, `review/` the coordinator's)

- Tools run in Node 22 or headless Chrome (Playwright is dev-only, ADR 0003) and never ship to players.
- The sandbox agents run in can't reach the map data hosts: real maps are baked by the **Bake map** GitHub Action
  (`.github/workflows/bake-map.yml`), not by hand. Anything the owner would otherwise have to run in a terminal
  belongs in a workflow like it.
- Headless Chrome has no GPU: `shot`, `bench`, the digests and the smoke test use `?renderer=cpu`; `gl-smoke.mjs` is
  the one check of the GPU terrain (software WebGL).

## Code map
| To change | Edit | Tests |
|---|---|---|
| The golden trace: three fixed rides, a sim hash and an anim hash (an animation change re-records only the anim one) | `golden-trace.mjs`, `test/golden.test.js` | `golden` |
| Test areas from the `// @areas` tag (`npm run test:<area>`) | `test-area.mjs` | `test-area` |
| Recorded RiderState traces (`node tools/record-trace.mjs` rewrites them) | `record-trace.mjs`, `test/fixtures/traces/`, `test/traces.js` | `traces` |
| Screenshots of every scene, board and skis, 820x1180 (`npm run shot`; CI `shots` job) | `shot.mjs`, `.github/workflows/test.yml` | none |
| The GPU smoke test: two scenes on `?renderer=gl` in software WebGL must draw a real frame (`npm run smoke:gl`; CI `gl-smoke` job) | `gl-smoke.mjs`, `gl-smoke-check.mjs` (pure) | `gl-smoke` |
| Frame time by stage (`npm run bench`, `-- --chrome`, `-- --gl`), the baseline, the CI regression check, pixel digests | `bench/` (`core.mjs`, `baseline.json`, `compare.mjs`, `digest.mjs`) | `bench`, `timer` |
| The mechanical PR check (asserts, golden hash, ownership, template, code map, STATUS, style, smoke test) | `review/` (`checks.mjs` pure, `run.mjs`, `smoke.mjs`), `.github/workflows/pr-check.yml` | `review` |
| Outlines of big files for ranged reads | `outline.mjs` | `outline` |
| Map compiler: lat/lon to ENU, resampling, piste clipping, the files | `map-compiler/core.js` (pure) | `map-compiler`, `map-course` |
| DEM and piste sources (Terrarium tiles; OpenSkiMap, Overpass) | `map-compiler/sources/` | `map-compiler` |
| Baking a map: the CLI (cache, `--fetch`, `--course`), the map configs, the Bake map workflow | `map-compiler/cli.mjs`, `maps/sources/<id>.json`, `.github/workflows/bake-map.yml` | `map-compiler`, `map-course` |
