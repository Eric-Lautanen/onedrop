# ONE DROP PINBALL — project notes

Vanilla JS + three.js (minified vendor build, IIFE modules on a global `PB`).
2D pinball physics on the XY plane, sub-stepped at `FIXED = 1/180`.

## Ownership
- **Other agent:** `machine.js` (cabinet, backbox, legs) and `assets.js` cabinet
  sprite regions. Being rebuilt repeatedly — treat as a moving dependency.
- **Me (playfield):** `table.js`, `playfield.js`, `art.js`, `vibrance.js`, and the
  playfield-side of `game.js`.

## The two invariants that matter
1. **The playfield fills the cabinet's inner opening exactly.** `PB.PF_SIZE` is
   *derived* from `PB.cabinetOpening()`, never written out by hand. `CABINET` in
   table.js mirrors machine.js's outer box (`OUT_W`, `WALL`, `BODY_L`, centre).
   Hand-off hook: if machine.js sets `PB.MACHINE_BOX = {outL,outR,footY,headY,wall}`
   the playfield follows automatically (machine.js loads before game.js).
2. **The keyboard never moves the camera.** Mouse = orbit/zoom, keyboard = gameplay
   only. Regression test lives in `dev/shoot.js` (`camTest`).

## Art authoring
Every hardware item is authored in **art percent** (`x`/`y` 0..100 on the
painting) and converted by `X(p)`/`Y(p)`. `K = PF_H / 41` rescales every absolute
gauge (radii, kicks, tube gauges, spring lengths), so the table rebuilds at any
size without turning into a toy. `centerY` is explicit — centring on `H/2` is NOT
the same as centring on the cabinet opening.

## Geometry orientation (the playfield is Z-up)
three.js builds `CylinderGeometry`/`ConeGeometry` along **+Y** and
`TorusGeometry` in the **XY plane**. Table space is **+Z out of the wood**, so:
- a barrel/cone needs `rotation.x = PI/2` to stand up. Without it, it lies flat,
  reads as a **triangle** from the player's view, and its apparent mass shifts
  along Y.
- a ring already lies flat and needs **no** rotation. `rotation.x = PI/2` stands
  it **perpendicular** to the field.

`playfield.js` has `standUp(m)` next to the geometry caches for the first case.
Anything that must point along an arbitrary direction uses
`quaternion.setFromUnitVectors(YAXIS, dir)`; anything in-plane uses
`rotation.z`. Do not hand-set `rotation.x` anywhere else.

## Colour fidelity
`vibrance.js` swaps painted art (`metalness <= 0.30` **and** has a `map`) for an
unlit `MeshBasicMaterial` with `toneMapped:false`, so the sRGB atlas is not
regraded by ACES and not greyed by metalness. This was the fix for the
"washed out playfield / scoreboard" complaint. Opt-outs: `userData.noVibrance`.
The playfield **surface** is built directly in game.js with `color:0xffffff`, so
`LIFT` does not apply to it.

## Colour space — three.js r149 stores hex as LINEAR
**This is the single biggest cause of "everything looks pale/washed out".**
`new THREE.Color(0x15191e)` in r149 yields `(0.082, 0.098, 0.118)` — the hex is
taken as-is and treated as **linear**, with no sRGB→linear conversion (that only
arrived in later revisions). The renderer then re-encodes to sRGB on output, so
every authored "dark" hex lands about a stop and a half too light: a charcoal
sling body rendered **mid grey**, dark red rubber rendered **mauve**, and the
whole playfield hardware read as a pale pink wash. The painted art never showed
it because it goes through a `map` (decoded by `texture.encoding`).

Fix: `srgb(hex)` in playfield.js — `new T.Color(hex).convertSRGBToLinear()` —
applied to **every** material `color` and `emissive`, every light colour, and
the per-instance lamp colours (`tmpCol.setHex(...).convertSRGBToLinear()`).
`phys()` and `std()` do it centrally; the inline `MeshStandardMaterial`s do it
at each site. Anything new must do it too.

## Materials are re-written every frame
`playfield.js`'s `update()` overwrites `emissiveIntensity` / `opacity` on the
bumpers, slings, targets and spinner **every frame**. Whatever the build sets is
only the first frame. Change the *runtime* base values in `update()`, not (only)
the build. ACES at exposure 1.2 clips anything above ~0.35 emissive to white.

## Reference design — `assets/3dref.jpg`
A 843×1264 four-panel sheet (dividers x 424 / y 632): top-L FRONT ORTHO,
top-R TOP-DOWN playfield, bot-L SIDE ELEVATION (R), bot-R 3/4 PERSPECTIVE.
`dev/3dref-match.md` is the authoritative measurement doc and the hand-off spec
for `machine.js`. Scale `k_front = 27.8/223 = 0.12466 u/px` (backbox width =
`OUT_W`). The side panel is **horizontally compressed ~1.21×** vs the front, so
its horizontals need `k_side = 0.15030` while verticals use `k_front`.

**Measurement gotcha — always profile rows with RUN STRUCTURE.** A `min..max`
row profile reads the **two legs as one full-width span**, which is how the
first pass invented a body reaching the floor (356 px) and a "gold lockdown
bar" that was really the feet. Same trap in the side panel: the "360 px body"
was the splayed feet.

Reference facts that are easy to get wrong (all verified):
- speakers are **small** (Ø 30 px = 3.74 u) and sit **in the lower score band**,
  one at each end, vertically centred — *not* big grills over the backglass;
- the **rails and the lockdown bar are BLACK**, not gold, and the backbox has
  **no gold trim** (its bevel rules measure neutral grey);
- legs come out of the cabinet **corners** (outer face flush with the flank),
  are **2.37 u** thick tapering to 1.87 u, and **lean outward at the feet**
  (~3.1° front / 5.3° side);
- the head is drawn ~10 % wider than the body (223 vs 203 px).

## Dev harnesses (`dev/`)
- `shoot.js` — headless capture + probes (report, camTest, resize). Needs
  `NODE_PATH=<managed node workspace>/node_modules`; run with the managed node.
- `_vibe.py` — renders vs sprite in HSV, whole/centre/by-band.
- `_rect.js` — projects the field's corners to screen to validate the crop rect.
- `probe.js` — fast boot diagnostic.
- `_region.js x0 y0 x1 y1 ppArtX` — straight-down ortho capture of an exact
  art% window; prints `WINDOW x0 y0 x1 y1` so `_gridon.py` can draw a **true**
  art grid on it. This is the reliable way to read feature positions.
- `_gridon.py x0 y0 x1 y1 [src] [out]` — bakes that grid in.
- `_scan.js [step]` — top-down raycast occupancy map + legend with art bboxes.
  **Must** use `getWorldQuaternion` (not `.quaternion`) or the table tilt skews
  every ray, and must convert table space → playfield-local by subtracting
  `(centerX, centerY)`.
- `_elev.js [y0] [y1] [halfZ]` — side elevation; hides `machine.root` so the
  cabinet does not block the view. Horizontal = field length, vertical = height.
- `_iso.js x0 y0 x1 y1 tag` — same window with only one geometry type visible.
- `_mat.js` / `_probe2.js` — dump live material, light and renderer state.
- `_hero.js artX,artY halfWidth` — crop through the game's **own** camera.
- **Cabinet / reference tools:** `_refmeas.py` (four-panel silhouettes),
  `_head2.py` (backbox zones), `_side_runs.py` / `_front_runs.py` (run-structured
  profiles), `_ascii2.py` (faint-structure map), `_refcrop.py x0 y0 x1 y1 out
  [scale]` (magnified sheet crop), `_head.js` (orthographic head-on backbox +
  head-local per-part bbox), `_mach.js front|side` (orthographic machine),
  `_shot.js` (plain in-game screenshot), `_cmp_head.py` / `_cmp_front.py`
  (reference-vs-live comparison strips).
- **Ortho capture gotcha:** if the frustum aspect ≠ the viewport aspect the
  capture stretches. Set `halfW = max(hx, hy*viewAspect)*pad`,
  `halfH = halfW/viewAspect`.
- **Hiding gotcha:** `machine.root` is a child of `g.group`, so
  "show only the head" must hide selectively — `g.group.visible = false` takes
  the machine with it. Also `Vector3.abs` does not exist in r149.
- **Lighting gotcha:** adding a strong key light for a capture washes matte
  black to silver. Sample the pixels before calling a material wrong — in-game
  the legs measure 60–90/255.
- Retry loops are needed: the WebGL context intermittently fails to come up and
  `page.evaluate` throws. Re-running usually works.
Serve the repo on `127.0.0.1:8099`.
