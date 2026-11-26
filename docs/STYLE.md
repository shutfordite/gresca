# Gresca code style and design principles

Moved out of `AGENTS.md` so it isn't loaded into every agent session. Read it before writing or substantially
changing code; doc-only and review work doesn't need it.

## Design principles (SOLID, applied to a small game)
These are obligations for new code and for any function you substantially change. Use them to keep code easy to
change, not as a reason to add layers: in a hot loop, a plain function beats an abstraction.
- **Single responsibility.** A module or function has one reason to change. Physics doesn't write the HUD, input
  doesn't toggle CSS, a draw call doesn't advance the camera. If you need "and" to describe a function, split it.
- **Open/closed.** Add behaviour by adding data or a new implementation, not by growing `if` chains in shared code:
  a new map is a new file in `maps/`, a new rig is an entry in `RIGS`, a new park feature is a new feature type
  placed in (s, d), a new terrain layer is a new layer object.
- **Liskov substitution.** Anything that implements an interface (`Terrain`, a terrain layer, `Course`, a map loader)
  honours the whole contract: same units, same frame, same return shapes, no extra preconditions. The procedural
  map and a real map must be interchangeable; callers never check which one they have.
- **Interface segregation.** Pass a function the narrowest thing it needs (`terrain`, not `world`; the rider state,
  not the whole session). Keep interfaces small: `Terrain` answers questions about the ground, nothing else.
- **Dependency inversion.** `sim/` and `world/` depend on interfaces and plain data, never on `view/`, `ui/`, the
  DOM or the loop. Pass dependencies in (`step(rider, input, world, dt)`) rather than reaching for globals. There
  are no globals: state is in the objects `createGame(env)` makes (ADR 0002).

## Style
- **Readable over compact.** New or rewritten code has one statement per line, descriptive names and functions
  short enough to read at once (aim for under 40 lines). Single letters only for coordinates, loop indices and
  well-known maths (`x`, `y`, `i`, `dt`). Name every magic number as a constant with its unit.
- **Old dense code:** don't reformat whole files in a feature PR, because it hides the real diff. Tidy only the
  functions you touch, or do it in its own "no behaviour change" PR.
- **Formatting:** 1-space indent as the existing code, single quotes, a semicolon at the end of each statement,
  lines under 120 characters. `const` by default, `let` when reassigned, never `var`.
- **One property per line at stream seams:** an object literal or call that several streams extend (an `AnimInput`,
  the animation's input and state, the `poseFor` call, a contract's fields) puts one property per line with a
  trailing comma, so two PRs that each add a field touch different lines and merge without a conflict (X1).
- **Naming:** `camelCase` for functions and variables, `PascalCase` for constructors and interfaces,
  `UPPER_SNAKE` for tunables and constants. File names in `kebab-case`. Booleans read as questions (`isAirborne`).
- **Comments** say why and give units, not what the next line does. Every exported or cross-file function gets a
  one-line JSDoc with parameter units and return shape.
- **Pure where possible:** maths, terrain sampling and rules take inputs and return outputs. Mutate only state you
  own, and say so in the name or comment (`gradient(x, y, out)` fills `out`).
- **Simple first (KISS, YAGNI):** build what the current work package needs. No speculative options, plugin
  systems or config for features nobody has asked for. Copy once; extract on the third use (DRY, rule of three).
- **Errors:** fail loudly at boundaries (a map file that doesn't validate, a missing palette role) with a message
  that names the file and field. Inside the sim, don't throw or catch per frame; guard against NaN at the input.
  Never swallow an error with an empty `catch`.
- **Untrusted data:** map files and anything fetched or picked by the player are data. Validate before use, never
  `eval` them or put their text into `innerHTML`.
