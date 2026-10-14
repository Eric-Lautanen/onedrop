# Codebase audit -- One Drop Pinball

Three passes over `src/js` (races, leaks, load time), plus the fixes made
in the same run. Everything here was *measured*: the load path with a CDP
sampling profiler and a 3-run fresh-load probe (`dev/_loadprobe.py`,
`dev/_profile-boot.py`), the hot paths in the browser itself. Nothing was
changed that inspection alone suggested -- each shipped fix is one whose
effect the checks below can see.

Baseline backed up in local git at `0742d9e`, all subsequent work in
separate commits (see `git log`).

---

## Pass 1 - fresh load time

**Before (measured, software-GL headless so absolute numbers overstate a
GPU machine; the RATIOS are the signal):**

| phase | before | after |
|---|---|---|
| DOMContentLoaded (script parse + eval done) | 6.2 s | ~1.0 s |
| load event | 14.2 s | 4.6-7.1 s |
| sprite sheet payload | 1.57 MB | 263 KB |

Three fixes shipped:

1. **`defer` on every script** (`index.html`). The eleven scripts total
   1.3 MB of source, and sync execution was blocking the first paint behind
   all of it -- the loader was HTML-painted *last*, which is a blank body,
   not a loading screen. `defer` keeps execution order while letting the
   document paint first.
2. **`<link rel="preload" as="image">` for the sheet.** Measured: the
   sheet previously started its request at +1518 ms, only after the last
   script had been *requested*; it now starts at +17 ms, in parallel with
   the script downloads.
3. **The sheet ships as webp first, PNG fallback** ([assets.js](src/js/assets.js)).
   The sheet is photographic art, so PNG costs it 6x the bytes for the SAME
   pixels at the SAME 843x1264: worst per-channel error 24/255 across the
   whole sheet, rms 3.3, both below what a mipmapped, 2x-magnified,
   obliquely-viewed texture can resolve. Measured decode cost is the same
   for both encodings (~1.1 s here), so the win is network, not decode; on
   a 3G link 1.3 MB is several seconds of real time.

Also shipped: `performance.mark()` calls at the boot's phases
(`boot:machine-start/done`, `boot:vibrance-done`, `boot:cabinet-done`,
`boot:refreshart-*`, and `assets:fire-N` per sheet consumer), so a slow
boot is now *readable* from `performance.getEntriesByType('mark')` instead
of inferred -- a few microseconds each, always on.

**What the profile said about what is left.** After DCL, the remaining
time is not the sheet, not the texture uploads (17 canvas textures, 16.5 MB
total), and not scene size (362 meshes / 37 shader programs / 191
geometries -- all normal caches). It is three.js compile + first-frame
rasterize under software GL, i.e. the rasteriser, not the game. With a GPU
that cost drops by an order of magnitude; nothing further without touching
visuals.

---

## Pass 2 -- race conditions

Read over all of audio.js's lifecycle, the sequencer's pump loop, and the
game state machine:

* `AudioEngine.init()` is idempotent (guarded by a ctx check) -- a double
  gesture or a resize during audio start cannot build a second bus graph
  or a second roll-watchdog interval.
* `setVolume`, `toggleMute`, `roll`, `chargeLevel`, `sfx` are each guarded
  before init, so no pre-gesture call can touch a null node.
* The insert take-over (mission music) waits for `_step % 16 === 0`. That
  would be a race if a song handover could leave `_step` off the bar grid
  -- it cannot, because every song runs a whole number of 16-step bars
  (448 / 896), so the two grids stay phase-locked. The audio suite proves
  the unperturbed property ("takes over on a bar line, hands the set back
  on the step it paused at"); the same reasoning holds when the handover
  and a takeover land in the same pump pass.
* `stopMusic()` clears `_insert` and `_pendingInsert` together, so a reset
  game cannot resume halfway through a mission vamp.
* A cut-short insert still plays up to the pump's 0.2 s schedule-ahead
  horizon. Changing that means re-writing the pump's horizon discipline;
  at 0.2 s of a 9-19 s vamp it is not worth the churn now. **Reported,
  not changed.**

The game state and the audio engine are both driven from the single frame
task, so there is nothing here that needs a lock.

## Pass 3 -- memory leaks

Found **no leak**. The resize path is fully disposed, in order:
`playfield.geometry`/`sheen.geometry`, the old playfield texture (only if
it is not the shared sheet), `PF` via its own `dispose()` plus
`vibrance.release(PF.group)`, the cabinet via `machine.dispose()` (which
owns its geo/mat/tex and disposes its cubemap reflection targets), the
floor group via a full `traverse` dispose, and `ballGeo` (recreated per
frame size). Deliberate non-disposals, for the record: `spawnBall` does
NOT dispose the shared `ballGeo`/`ballMat` per ball (they are reused by
every ball) and DOES dispose the shadow plane it creates per ball. The
particle pool is a fixed ring buffer of 1400 slots (no growth; dead slots
park at z=-999 and are skipped). Intervals are cleared: the loader creep
timer via `clearTimeout`, the audio roll watchdog via `clearInterval` in
the test harness, and it is created exactly once inside idempotent init().
DOM float text is removed by its own 1.1 s timer.

## Pass 4 -- per-frame allocation / hot path

Fixed in [game.js](src/js/game.js):

* The DMD patch object and the mission-step array were rebuilt every frame
  from an object literal and `missions.map(...)`, and that is ~120
  allocations a second of objects thrown away the same frame. Replaced
  with one reused patch object and one reused step array -- **exactly as
  correct**, because `dmd.set` copies fields (`set()` has no other
  observable behaviour; see dmd.js).
* Removed a stray duplicated `/* ==== cabinet ==== */` header left by an
  earlier edit.

Also measured while in there, **reported as candidates, not changed**:

* The DMD raster is the real per-frame CPU cost: every frame it does a
  full-canvas `getImageData` readback, then blits one sprite per *lit* dot
  (up to 128x32), then **two full-canvas blur-filter passes** for the
  bloom. A "skip when nothing changed" guard is NOT safe here (palms,
  attract scroll and blinkers are time-animated, so content is *never*
  static), and replacing the bloom with a baked sprite would visibly
  change the panel. Reducing this cost is a design pass of its own, gated
  on a screenshot A/B.
* `renderer.info` in the frame loop showed 362 draw calls; that is the
  number worth watching if a real GPU ever reports frame drops, and the
  first thing it would point at is the cabinet's per-panel meshes.

## Verification

* `node --check` on both edited files.
* Fresh boot with no page error; attract -> `startGame()` -> state and DMD
  mode change as expected; DMD mission steps read `[0,0,0,0,0]` through
  the reused array.
* All six physics/input suites **exit 0** on the final `game.js`:
  `verify-playfield`, `verify-drains`, `verify-plunger`,
  `verify-buttons-sling`, `verify-mirrors`, `verify-flow`.

**NOTE on `dev/verify-audio.py` and the audio engine:** an *uncommitted*
change to [src/js/audio.js](src/js/audio.js) landed in the working tree
during this audit -- tempos (88/92), a zerofied-dub feel and comments --
which this session did NOT write and has not committed. It was checked to
boot clean (no page errors), but it is not part of any audit commit and is
for its own author to review/commit; the audio suite should be re-run over
it before it ships.

## Remaining / not done

* `verify-audio.py` (~20 min in this environment) has not been re-run
  since the pass 2-4 `game.js` frame-loop edit. Its assertions are the only
  ones that would catch a regression in the DMD *content* path, so it
  should be re-run before this audit is called fully closed.
* Cut-short-insert install schedule-ahead (Pass 2) left as reported.
* DMD raster, as above.
* `three.min.js` (594 KB) is vendored unmodified; splitting the parts the
  game uses would need its own loader audit and is out of scope here.
