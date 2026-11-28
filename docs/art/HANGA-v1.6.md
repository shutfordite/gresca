# Hanga Dawn art spec v1.6.0: the park look

`art/gresca-hanga-spec.js` goes from v1.5.0 to v1.6.0 (K4a). The change is **additive**: one new top-level `park`
object and 34 new `palette` roles. Nothing existing changes value; `projectRider` is the v1.5 function.
`test/hanga-v16.test.js` checks this against `test/fixtures/hanga-spec-v1.5.0.cjs` and checks the new data (roles
exist and are all used, contrast targets, sizes inside the K table). The game does not read `park` yet: K4 (S4) builds
from it. Board: `docs/art/v1.6/park.png`, drawn by `docs/art/v1.6/board.html` from the spec's own data
(Playwright: open the file, screenshot the `#c` canvas at 1600 x 1000). The claude.ai design canvas copy is still
older than v1.5; S6 V4 re-syncs it.

## What is new

| Key | Holds |
|---|---|
| `park.jumps.surfaces` | `takeoff`, `table`, `landing`, `sidewall`: each a `lit` / `mid` / `shade` role triple for the terrain posteriser, a `finish` (corduroy, packed, groomed) and the cord period (m). Takeoff is a warm tint (a hue change, like `kickFace`), landing a cool one, sidewall the darker groomed wall. |
| `park.jumps.sidewalls` | Wall face slope (55 degrees), crest radius, and per size class (`S`, `M`, `L`, `XL`) the flat top width and the crest height over the table (m). |
| `park.jumps.dyeLines` | `lip` (orange-red `dyeLip`) and `knuckle` (blue `dyeKnuckle`): role, shade role, paper halo (0.05 m) and width per size class in m (lip 0.2 to 0.4, knuckle 0.3 to 0.6). |
| `park.rails` | `tube` (5 to 10 cm, standard 7; steel, shade, highlight, tape band at each leg), `legs` (every 2.5 m, 5 cm, foot plate), `base` (wooden skid, mostly buried). |
| `park.boxes` | Width 0.3 to 0.6 m (standard 0.5): dark `top` with orange edge strips, blue `sides`, darker end, plinth `legs` and `base`. |
| `park.pistePoles` | The Look's six `sprites.pistePole` keys as roles (`poleGreen` ... `poleTop`), pole size (2.3 m, 0.5 m top, 0.1 m wide), spacing, and the OpenSkiMap difficulty to colour map. Retires the Debt row "piste pole colours are in the Look's unspecified list". |
| `park.sizes` | A reference profile per class (lip height, lip angle, table, landing angle and length) for the board only, taken from the middle of the K table. K1's shape library owns real shapes. |
| `park.*.contrastTargets` | 17 minimums (jumps and poles), tested. |

Every colour is a role named in a field `role`, `*Role`, `lit`, `mid`, `shade`, or inside `roles`.

## What K4 builds

- Jumps are terrain snow: shade each surface with its triple the way the piste is shaded; draw the dye lines as bands
  across the surface at the lip edge and the knuckle with their halo; draw the sidewalls as the steep face with the
  cord along the wall.
- Rails: a tube of `tube.diameterM.standard` unless a feature's own width says otherwise, a leg every `legs.everyM`
  plus both ends, skid and foot plate buried. Boxes: deck, edge strips, sides, end, plinths.
- Poles: replace `UNSPECIFIED.pisteGreen` etc. in `src/view/look/hanga.js` with `park.pistePoles.roles`. **Yellow
  moves**: the game's `#f2c230` was 1.55:1 on lit snow; the spec's `poleYellow` is a deeper amber (2.1:1). Others keep
  the game's values.
- `railBar` and `boxBar` in the Look's unspecified list are replaced by `railSteel` and `boxTop` (their old red and
  mint were placeholders).

## Owner question

Does the park palette read well? Check on the iPad, from `docs/art/v1.6/park.png`: the orange-red lip and blue
knuckle lines against the warm takeoff and cool landing, and the dark deck and blue sides of the box.
