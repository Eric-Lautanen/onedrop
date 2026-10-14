# 3DREF PIXEL-PERFECT MATCH — measurements, schematics & fix list

Reference: `assets/3dref.jpg` (843 × 1264). Art sheet: `assets/sprite2.png` (843 × 1264).

> **RE-VERIFIED 2026-10-08 (independent pass).** Every number below was
> re-measured from scratch with `dev/_refmeas.py`, `dev/_head2.py`,
> `dev/_side_runs.py`, `dev/_front_runs.py` and `dev/_ascii2.py`, and the
> results were checked against a head-on orthographic capture of the LIVE
> machine (`dev/_head.js`, `dev/_mach.js`). Numbers the original pass got
> wrong are called out inline with **[was: …]**. The single biggest error
> was the **speaker size and position** — see §2 and bug 5.

Method: the sheet is split at the divider, each panel is masked as
"machine" = saturated (colour art) **or** dark (black cabinet), and rows are
profiled with **run structure** (this matters: a naive min..max row profile
reads the two legs as one full-width span and invents a body that reaches
the floor — that is exactly how the original pass measured the front body
as 356 px tall).

---

## 1. Reference sheet layout (3dref.jpg)

Divider re-derived independently: darkest full-length line at **x = 424** and
**y = 632** ✔ (matches the original).

| Panel   | Sheet rect (x, y, w, h) | Content                                    |
|---------|-------------------------|--------------------------------------------|
| top-L   | 0, 0, 424, 632          | FRONT ORTHO (slight top-down)              |
| top-R   | 425, 0, 418, 632        | TOP-DOWN playfield                         |
| bot-L   | 0, 633, 424, 631        | SIDE ELEVATION (right side, backbox left)  |
| bot-R   | 425, 633, 418, 631      | 3/4 PERSPECTIVE hero view                  |

Crops: `dev/crops/ref_front.png`, `ref_side.png`, `ref_topdown.png`,
`ref_persp.png`, plus the verification zooms added this pass —
`_v_backbox.png`, `_v_band.png`, `_v_spkR.png`, `_v_body.png`,
`_v_ldbar.png`, `_v_farrail.png`, `_v_headtop.png`, `_v_legs.png`,
`_v_junction.png`, `_v_flipbtn.png`.

---

## 2. FRONT VIEW (panel-local px)

### Silhouette (measured with run structure)

| Feature | px | units @ k_front |
|---|---|---|
| **Backbox** x 101–323, y 51–252 | 223 × 202 | 27.80 × 25.18 |
| **Body** (top of glass → bottom of front face), y 254–**462** | — × **209** | — × **26.05** |
| Body width, top of body (y 255) | 185 | 23.06 |
| Body width, bottom (y 455) | 203 | 25.31 |
| **Legs** (two separate runs), y 462–**610** | — × **148** | — × **18.45** |
| **Leg thickness** (19 px, tapering to 15 px) | 19 → 15 | **2.37 → 1.87** |
| Leg outer face at the TOP | x 112 vs the body's edge 111 | **flush** |
| Leg outer face at the FOOT | x 104 vs the body's edge 111 | **0.87 proud** |

**Leg mounting.** The legs come **out of the cabinet's corners** — at the top
the leg's outer face is flush with the body's flank (112 vs 111) — and they
**lean outward at the feet** (outer face 104 vs the body's 111, i.e. 7 px =
0.87 u proud over the leg's length → **≈ 3.1°**). The side panel shows the
same thing at **≈ 5.3°** (outer edge 47 → 35 px), so the legs splay on *both*
axes. Each leg is a **tapered blade** (2.37 u → 1.87 u), not a parallel
cylinder, with a chrome foot (Ø ≈ 2.7 u) on a short stem, and a right-angle
bracket plate bolted flush on the flank. `_v_leg_front.png`, `_v_leg_side.png`.

> **[was: "leg inset ≈ 30 px from body ends"]** — that figure came from the
> *bottom* of the silhouette (the splayed feet), and read the inset the wrong
> way round. The legs are at the corners, not 30 px in.

**Scale:** backbox width 223 px = cabinet `OUT_W` 27.8 u → **k_front = 0.12466 u/px**.

Corrections to the original pass:

- **[was: body x 101–323 (222 px), y 254–610 (356 px)]** The body is *not* the
  backbox's width and does *not* reach y 610. The body silhouette **tapers
  185 → 203 px** (a perspective drawing, not a true ortho), and it **ends at
  y ≈ 462**. Everything below 462 is the two legs — a min..max row profile
  merges them into one 217 px "body" row, which is how the 356 px figure arose.
- **[was: "Nothing below y 612 → front-view legs are not drawn"]** The legs
  **are** drawn: y 462–610, 148 px = **18.45 u** — which is exactly the
  build's `LEG_MIN = 18` ✔.
- **Head is wider than the body.** 223 px vs 203 px → ratio **1.099**. The
  backbox's bottom frame visibly overhangs the body by ~10 px per side
  (`_v_junction.png`). The build sets `HEAD_W = OUT_W` (equal); that is the
  safe reading, but the drawing really does show the head ~10 % wider.

### Backbox face zones

Measured from the row dark-fraction inside the head (`_head2.py`):

| Zone | px | units | notes |
|---|---|---|---|
| Frame margin (top) | y 51–56 | — | black |
| **Backglass art** | y **57–188** (132 px) | **16.46** | aspect 223/132 = 1.69 |
| **Score band** | y **189–252** (64 px) | **7.98** | aspect 223/64 = **3.48** |

Both match the original pass (133 px / 65 px, aspects 1.67 / 3.4) ✔.

**Speakers — the big correction.** Located by rim-arc detection plus a
magnified crop (`_v_band.png`, `_v_spkR.png`):

| | measured | original claim |
|---|---|---|
| Position | **inside the lower band**, vertically centred in it | y 60–190, *overlapping the glass* |
| Centre y | **221** → 84 % down the head | y 125 → 32 % down |
| Centres x | **126.5 / 297.5** → **11.4 % / 88.1 %** across | 13 % / 87 % ✔ |
| Diameter | **≈ 30 px = 3.74 u** (13.5 % of the face) | **75–95 px = 9.5–11 u** ✗ |

**[was: Ø ≈ 75–95 px]** — that is roughly **3× too large**. The reference
grills are small: a shade under a third of the DMD plate's width. The X
positions were right; the Y position and the size were both wrong.

**DMD plate / window.** The band contains a centred black plate with palm art
and the readout: plate x **151–274** (123 px = 15.3 u), y **199–239**
(40 px = 5.0 u), aspect 3.05. The gold readout text inside it spans
x 183–243 (60 px = 7.5 u). **[was: "w ≈ 5.6 u"]** — that is the top line
only; the plate itself is 15.3 u wide. The live window is 6.34 u — fine.

**Backbox trim: there is NO gold anywhere on the head.** Row means across the
frame are neutral grey (the two bevel rules at y 192 / y 198 are
`(54,54,52)` and `(43,43,43)`); the top strip y 51–57 is `(47,47,47)`; the
top cap is plain black (`_v_headtop.png`). The build adds a gold top rail,
14 gold chasing bulbs and gold side stiles — none of which exist in the
reference.

### Body face (front view)

- Playfield glass fills the upper part of the body.
- **Lockdown bar: BLACK**, x ≈ 112–315, y ≈ **358–368** (`_v_ldbar.png`).
  **[was: "GOLD strip x 102–322, y 598–602"]** — wrong on colour *and*
  position; y 598–602 is the **legs/feet**, not a lockdown bar.
- Below it the rasta front wall (green / yellow / red, y ≈ 368–462) with the
  black coin door, two red start buttons, a chrome plunger, and the
  ONEDROP drop logo.

---

## 3. SIDE ELEVATION (panel-local px, origin = sheet y 633)

### Silhouette

| Feature | px | units |
|---|---|---|
| Head: front face x 47 (vertical), y 54–250 | 196 tall | 24.4 |
| Head back edge: x 111 (top) → x 101 (bottom) | lean **3.3°** | 0.058 rad |
| Head depth | 55–65 (trapezoid; top face visible) | 8.3–9.8 |
| Body: x **49–385**, y 254–**435** | 337 × 181 | 50.7 × 22.6 |
| Body top edge (drawn) (49,254) → (385,336) | **13.7°** | — |
| **Legs**: y **435–586**, two runs | **151 tall** | **18.8** |
| Leg centres | x 54 / 378 | at the body's ends |

**Scale — read this before using any side-view width.** Leg length measures
148 px (front) and 151 px (side) — the same number, so the two panels share a
**vertical** scale. But the body length is 337 px, and at k_front that is only
**42.1 u** — shorter than the playfield itself (48.9 u), which is impossible.
So the side panel is **horizontally compressed by ≈ 1.21** relative to the
front panel, and side-view *horizontal* readings need their own scale:
**k_side = 0.15030 u/px** (50.8 u over 337 px).

Corrections:

- **[was: body x 30–390 (360 px), k_side 0.1411]** The body is **49–385
  (337 px)**. The x = 30 and x = 390 in the original figure are the *splayed
  leg/feet* edges at the bottom of the silhouette, not the body.
- **[was: legs y 480–598 (120 px ≈ 17–18 u)]** Legs are **y 435–586**
  (151 px). The body's bottom edge is at y **435**, not 480. At the front
  panel's vertical scale that is **18.8 u** — the build's `LEG_MIN = 18` is
  right ✔.
- **[was: leg inset ≈ 30 px from body ends]** The legs sit in the cabinet's
  **corners**: at the top the outer face is flush with the body's end
  (x 47 vs 49), and it **leans outward at the foot** (x 35 by y 570, i.e.
  ≈ 5.3°). Same shape as the front panel — tapered blade, chrome foot,
  right-angle bracket.
- Head depth ≈ 55–65 px. At k_side that is **8.3–9.8 u**; the build's
  `HEAD_D = 8.6` sits at the low end — acceptable, but ~9.0 u is the mean.
- **Playfield slope as drawn ≈ 13.7°**, against the real 6.5° (`TILT`). The
  drawing exaggerates the pitch ~2×. **Documented discrepancy — do not
  "fix" without a gameplay decision.**

---

## 4. TOP-DOWN (playfield art)

- Art silhouette x **79–342** (264 px), y **53–545** (493 px) →
  **aspect 0.5355**. (Original: 78–340 / 54–546 → 0.532 ✔ same.)
- Current playfield opening **25.94 × 48.94 = 0.530** ✔
- The old `table.js` note ("reference measures 0.6232, stretch the painting
  14.5 %") was a mis-measurement; the current near-native-aspect fit (art
  panel 318×584 = 0.545, opening 0.530, 2.7 % squeeze) is correct.
- This panel has **its own scale** — it shows the painting, not the cabinet.
  Do not carry its px into cabinet units.

---

## 5. 3/4 PERSPECTIVE (materials & small parts)

- **Side rails along the playfield: BLACK.** `_v_farrail.png` shows a black
  metal rail on both the near and far edges, with a slight specular sheen —
  no gold. **[was: "GOLD (yellow metallic) with a dark strip under the gold
  — NOT chrome"]** — that is simply wrong; the yellow nearby is the cabinet's
  palm/sunset flank art, not a rail.
- **Lockdown bar: BLACK** (`_v_lockdown.png`) — consistent with §2.
- **Flipper buttons**: red, round, **mid-height on both flanks**
  (`_v_flipbtn.png`), Ø ≈ 8 px ≈ 1.0 u. The build's Ø 1.04 u ✔.
- **Legs**: matte **black** cylinders, chrome feet, flush with the body ends.
- Backbox face reads: dark band with small grills L/R and a bright DMD
  low-centre — matches §2.
- Floor: dark reflective gradient with a green-gold grid (already in game.js).

---

## 6. Art-sheet facts (sprite2.png, from assets.js REGIONS — verified)

| Region | px (sheet) | aspect | used for |
|--------|-----------|--------|----------|
| `cabSide` | 20,38 338×378 | 0.89 | cabinet side art |
| `backglass` | 108,38 237×156 | 1.52 | backbox glass |
| `bbSide` | 352,45 76×226 | 0.34 | backbox flank |
| `dmdPanel` | 142,195 136×48 | 2.83 | score band |
| `frontArt` | 22,448 326×152 | 2.14 | front wall |
| `playfield` | 500,28 318×584 | 0.545 | playfield painting |
| `coinDoor` | 168,458 176×130 | 1.35 | coin door closeup |

---

## 7. Derived target dimensions (units; 1 u = 0.81")

```
FRONT  (k_front = 0.12466 u/px)     SIDE   (k_side = 0.15030 u/px,
                                            verticals use k_front)
backbox/head  W 27.80  (= OUT_W)    head depth    8.3–9.8  (mean ≈ 9.0)
              H 25.18               head lean     ≈ 3.3°   (0.058 rad)
backglass art H 16.46               leg length    ≈ 18.5   (148–151 px)
score band    H  7.98  (aspect 3.48) leg Ø        ≈ 2.37 → 1.87 (19 → 15 px)
speaker Ø     ≈  3.74  (30 px)      leg mount     at the CORNERS (flush)
speaker ctr   x ±10.62 (= 11.4 %/88.1 % across)   splay ≈ 3.1° (front) /
              y  centred in the band (84 % down the head)  5.3° (side)
DMD plate     w ≈ 15.3, h ≈ 5.0
lockdown bar  BLACK, not gold
side rails    BLACK, not chrome/gold
head trim     none — black frame only
body width    23.1 → 25.3 (tapers; head is 27.8)
```

Cross-check: 16.46 + 7.98 = 24.44 ≈ 25.18 (the 0.74 u remainder is the frame
margin) ✔.

**Note on body length.** The side panel is horizontally compressed ~1.21×, so
its 337 px cannot be converted with k_front (that would give 42 u, shorter
than the 48.9 u playfield). Either accept `BODY_L = 50.8` (k_side, current
build) or re-derive the length from the front panel's width scale — but the
front panel does not show length. **Treat body length as under-determined by
the sheet**; 50.8 is a defensible choice.

---

## 8. Bug list — status after re-verification

| # | Item | Status |
|---|------|--------|
| 1 | Backbox flank panels used a left-handed basis (det = −1) | **FIXED** — `addHeadPanel` now builds `(0,0,−s), Y, (s,0,0)` |
| 2 | Head too narrow (`HEAD_W` 26.6 vs 27.8) | **FIXED** — `HEAD_W = OUT_W` |
| 3 | Head too shallow, lean too much | **FIXED** — `HEAD_D = 8.6`, `HEAD_LEAN = 0.06`. Reference depth reads 8.3–9.8 u, so 8.6 is at the low end — **consider 9.0** |
| 4 | Score band too short (aspect 4.81) | **FIXED** — `bandH = bandW / 3.4`; reference is 3.48 |
| 5 | **Speakers half-size and wrongly placed** | **FIXED this pass.** The earlier fix implemented the *wrong target*: `SPK_R = 4.9` (Ø 9.8 u) and `spkY = faceTop − faceH·0.32`. Reference: **Ø 3.74 u (radius 1.87)**, **centred in the band**. Measured live before the fix, the speaker cups were the widest thing on the head (bbox 30.51 u vs the head box's 27.80). Now `SPK_R = 1.87`, `spkX = HEAD_W·0.382`, `spkY = bandY`; head bbox 28.71 u, face aspect 1.087 vs the reference's 1.1045. See `dev/shots/_cmp_head.png` |
| 6 | DMD window too wide (40 % of band) | **FIXED** — `BAND_WIN.w = 0.24`; reference plate is ~15.3 u of a 26.4 u band |
| 7 | "Rails chrome → gold" | **FIXED this pass — but the other way.** `_v_farrail.png` and `_v_lockdown.png` show **black** rails and a black lockdown bar. `machine.js` now uses a new `M.rail` (black metal) instead of `M.gold` |
| 8 | Legs 26 u → ~18 u | **FIXED** — `LEG_MIN = 18`; reference measures 18.5 u |
| 9 | `machine.js` does not publish `PB.MACHINE_BOX` | **FIXED** — published at line 369 |

### New findings this pass

10. **Gold head trim does not exist in the reference.** `machine.js` adds a
    gold top rail (`HEAD_W + 0.4`), 14 gold chasing bulbs and two gold stiles.
    The reference head is a plain black frame with only neutral-grey bevel
    rules. (`_v_headtop.png`, `_v_backbox.png`.) **NOT changed** — it is an
    animated feature and looks like a deliberate design addition; say the word
    and it goes.
11. **Leg material read silver.** `M.black` was `metalness: 0.4`, which picked
    up the environment map. **FIXED** — `metalness: 0.12, roughness: 0.62`
    (matte, matching the reference). Note: under the game's own lighting the
    legs already measured dark (60–90/255); the silver look only appeared in
    captures that add a strong key light.
12. **Head is drawn ~10 % wider than the body** (223 vs 203 px). The build
    makes them equal — a reasonable simplification, but note the drawing.
13. **Legs were ~2.8× too thin, and mounted in the wrong place.** Reference
    legs are **19 px = 2.37 u** across in the front view (15 px = 2.25 u in
    the side view), come out of the **cabinet's corners** with the outer face
    flush, and **lean outward at the feet** (≈ 3.1° front / 5.3° side). The
    build used `cylGeo(0.42, 0.34, …)` = Ø 0.84 u on anchors inset 2.0 u from
    the flank, running straight along `DOWN` with no splay.
    **FIXED** — `cylGeo(1.18, 0.95, len, 14)` (blade taper), anchors moved to
    `OUT_x ± 1.18 / FOOT_Y|HEAD_Y ± 1.18` (flush with the corner), and the leg
    direction is `DOWN` plus a **4° outward component on both axes**
    (`SPLAY = 0.065`), with the per-leg length solved so the foot still lands
    on the shared floor plane. Foot `cylGeo(1.00, 1.20, 0.66)`.

---

## 9. Changelog

- **2026-10-08 (first pass):** initial measurement pass; fixes 1–9 applied to
  `machine.js`.
- **2026-10-08 (this pass, independent re-verification):**
  - Re-derived the panel divider (x 424 / y 632) ✔.
  - Re-measured all four panels with run-structured row profiling; added
    `dev/_refmeas.py`, `_head2.py`, `_side_runs.py`, `_front_runs.py`,
    `_ascii2.py`, `_refcrop.py`.
  - Added live capture tools `dev/_head.js` (orthographic head-on backbox)
    and `dev/_mach.js` (orthographic front / side / 3-4 machine) plus the
    comparison builder `dev/_cmp_head.py` → `dev/shots/_cmp_head.png`.
  - **Corrected §2:** body is y 254–462 (not 254–610) and tapers 185→203 px
    (not 222); front-view legs *are* drawn (y 462–610 = 18.45 u); lockdown bar
    is **black at y 358–368** (not gold at 598–602).
  - **Corrected §2 speakers:** Ø **30 px = 3.74 u** in the **lower band**
    (not Ø 75–95 px over the glass). This is the highest-impact fix.
  - **Corrected §3:** body is x 49–385 (337 px), not 30–390 (360 px);
    legs are y 435–586 (151 px), not 480–598; leg centres are flush with the
    body ends, not inset 30 px; side panel is horizontally compressed ~1.21×,
    so k_side = 0.15030.
  - **Corrected §5:** rails and lockdown bar are **black**, not gold; the
    head has **no** gold trim.
  - Verified fixes 1, 2, 3, 4, 6, 8, 9 are present in the live `machine.js`;
    flagged 5 (regressed), 7 (wrong direction), and added 10–12.
  - **Applied to `machine.js` this pass:** speakers (`SPK_R` 4.9 → **1.87**,
    `spkX` → `HEAD_W·0.382`, `spkY` → `bandY`); rails + lockdown bar `M.gold` →
    new **`M.rail`** (black metal); `M.black` metalness 0.4 → **0.12**
    (matte legs/apron/cups); leg `cylGeo(0.42, 0.34, …)` → **`cylGeo(1.18,
    0.95, …)`** with foot `cylGeo(1.00, 1.20, 0.66)`; and the legs moved to
    the **cabinet corners** with a **4° outward splay** on both axes. Head
    bbox 30.51 → 28.71 u, face aspect 1.1765 → 1.0874 (reference 1.1045).
    `dev/shoot.js` clean: 585 meshes, 11 faithful, no console errors.
  - **Not changed:** the gold head trim + 14 chasing bulbs (finding 10).

---

## 10. CABINET POLISH PASS — 2026-10-09 (mirrors, iron, glass, lockdown bar, buttons)

Five asked-for changes, all in `src/js/machine.js`, plus two lines in
`src/js/game.js` to drive the buttons. Every number below was checked on the
live machine; the views come from `dev/_view.html#ex,ey,ez,tx,ty,tz`, a
temporary harness that loads `index.html` in an iframe with the camera fixed
from the URL (the game's own camera is wrapped, so a fresh navigation gives a
deterministic view).

**1. Inner cabinet walls are MIRROR BLADES.** Two flat panels, one per wall,
a hair inside the wedge's inner face (table x `OUT_L + WALL + 0.03` /
`OUT_R - WALL - 0.03`), running the full opening (y −4.87 … 44.07) and sitting
on the floor pan (`z = BOT + 0.5`), heights taken from `topAt()` at each end so
they finish exactly on the lid line.
Material `M.mirror`: `metalness 1.0`, `roughness 0.07`, no map. **A later pass replaced this on the two blades** with `installMirror()`, a live planar reflection (its own render target per wall, oblique near plane, mirrors hidden during the pass), so the blades now show the playfield itself. `M.mirror` is what they wear for the frames after the swap and what they keep if the reflection pass never installs.

*The fallback reflection.* Before that swap they reflect their **own** cube map (`makeMirrorEnv()`, six
64px faces: dark above and below, a warm band just over the horizon, soft
lights up top), **not** the scene environment — `art.makeEnv()` is a gold /
red / **green** banded gradient built for the chrome ball, and at metalness 1
it painted the whole inside of the cabinet saturated green, i.e. it read as a
painted panel. A cube texture rather than an equirect one because machine.js
has no renderer to pre-filter with and a standard material can sample a plain
cube map directly. `envMapIntensity 1.35`.

**2. Legs are ANGLE IRON with bolt heads.** `bladeGeo`'s octagon is gone;
`angleGeo(wT, dT, wB, dB, h, iron)` sweeps a hand-built six-point L section:
outer face a straight plane the whole way down, inner face and depth tapering
to the foot, gauge `iron = 0.44`. Section 2.45 × 2.15 u at the top →
2.00 × 1.75 at the foot. Faces are emitted quad-by-quad (no shared index), then
`computeVertexNormals()` — needed because an L is concave and its cap is **two**
rectangles, not one fan.

Mounting: the blade runs on up past the cabinet's bottom edge by
`LEG_TOP = 3.6` with its outer face on the flank's own plane
(`bladeIn = LEG_T/2 − LEG_PAD`, `LEG_PAD = 0.03` so the two never z-fight), and
carries **two hex bolts** (`cylGeo(0.30, 0.30, 0.36, 6)`) standing proud of that
face, 0.85 u and 2.75 u down from the top — i.e. both inside the overlap, which
is where the reference draws them (`dev/_polish_zoom.html`, the leg-close
crops). The old fake bracket (plate + tab + two hidden bolts) is deleted:
−2 meshes per leg, same silhouette.

**3. Glass lid.** One thin pane (`boxGeo(OUT_W − WALL, len, 0.09)`) lying in
the walls 0.52 u below the lid line — so the side rails stay proud of it — from
table y `FOOT_Y + 2.0` to `HEAD_Y − WALL − 0.35`, tipped by `LID_PITCH` like
the rails, length divided by `cos(LID_PITCH)`. It laps 0.465 u into each wall
so its edge disappears into the groove. `M.glass`: `metalness 0.0`,
`roughness 0.03`, `opacity 0.10`, `depthWrite false`, double-sided.
**The first cut was metalness 0.42 / envMapIntensity 1.5 and it was wrong:**
at the player's own angle that is a mirror, and it hid the playfield. At 0.0
the Fresnel does the work and the painting reads through it.
*`opacity 0.10` and `DoubleSide` were still too much and are superseded by
§11.*

**4. Lockdown bar, bull-nosed.** The three stacked slabs are replaced by one
`roundGeo(LD_W, LD_D, LD_H, LD_R)` = 28.35 × 2.15 × 1.2 u with every edge and
both ends rounded by 0.34, plus a skirt (27.5 × 0.54 × 1.7, r 0.17) folding
down over the front face. `roundGeo` is new: `ExtrudeGeometry` expands
**outward** by `bevelSize` (measured in `dev/_bevel.html`), so a rounded-rect
outline of `(w−2r) × (h−2r)` bevelled by `r` and extruded to `d−2r` rebuilds
exactly `w × h × d` — one draw call instead of six slabs. The bar's underside
is seated 0.05 u above the pane and it is **`M.black`**, not `M.rail`: at
`M.rail` the key light turned it silver.
*The seat, the 1.2 u height and the skirt are all superseded by §12 — that
combination still eclipsed the flippers from the play camera.*

**5. Flipper buttons: forward, red in a black collar, and they travel.**
Moved from table y 1.4 (mid-flank) to `FOOT_Y + 2.9` — the front corner,
where a player's hands actually are — and to `TOP_FOOT − 2.75`, i.e. 19% down
the 14 u front face. Reference target was 2.1 u back; 2.9 u is as far forward
as the front leg's iron allows. Geometry: a **black collar** (`cylGeo(0.80,
0.80, 0.24, 20)`) flat on the flank and a **red button** (`cylGeo(0.54, 0.54,
0.50, 20)`) on its own X offset. Colour: a new `M.redBtn` (0xa8112b, emissive
0.3) — the shared `M.red` (0xd7263d, emissive 0.5) rendered **pink** here.

Travel: `machine.setFlipper('L'|'R', on)` sets a target; `update()` eases it at
22/s and slides the button 44% of its offset inward. `game.js`'s
`pressLeft`/`pressRight` call it (guarded, so a cabinet without `setFlipper`
just does not move). **Verified end to end**: a real `KeyZ` keydown moves the
left button x from −0.460 to −0.258 and it holds there while the key is down.

### Also checked

- `renderer.info` in the default view: 387 calls / 100.2k tri. The on-screen
  FPS reads 23–32, but Chromium throttles the preview tab while it is not
  composited, so that number is **not** a measurement — see the note in §9.
- No console or page errors on load; every script and the sprite sheet 200.
- The 3/4 view still holds up with the glass in: the painting reads through it
  with a sheen on top, which is what §5 says the reference draws.

### Known gaps

- The blades started out reflecting a synthetic room rather than the playfield;
  a later pass on this same file swapped in a real planar reflection, so that
  gap is closed. The fallback material (and its cube map) remains for the
  frames before the swap and for any environment where the live pass cannot
  run.
- Bolt heads sit **on** the flank in the overlap, as the drawing shows, rather
  than disappearing into a tapped plate.
- `dev/_view.html`, `_polish_zoom.html`, `_bevel.html` and `_findred.html` are
  the temporary tools from this pass; they are read-only helpers and safe to
  delete with the rest of `dev/`.

## 11. GLASS + APRON PASS — 2026-10-09 (clear glass, scuffs, no apron plate)

Two follow-ups from the same review, both in `src/js/machine.js`.

**A. The glass no longer hazes the field.** §10.3's pane was `0xeaf2ff` at
`opacity 0.10`, double-sided. Measured on the live machine — read the same four
playfield pixels with the glass in, with the glass hidden, and with the §10.3
values restored in-page through `PB.game` — it washed the painting by **+12%**
(mean channel delta over the field, ~31/255). The new pane is **untinted
white** at `opacity 0.06`, `side: FrontSide`, `envMapIntensity 0.9`, and the
same measurement now reads **+4%** (~10/255) with the hue untouched: the delta
is equal across R, G and B, so nothing is tinted and the field is simply 4%
brighter, which is what any Fresnel term does. Two things were doing the
washing — the tint itself, and `DoubleSide`, which blended the box's top face
*and* its bottom face and so applied the alpha twice. The specular response is
deliberately kept: it is what makes the sheet read as polished glass and it
sweeps as the camera moves. Re-reading after restoring the old values in-page
returns the new numbers exactly, so nothing leaks between measurements.

**The scuffs.** `makeGlassSurface()` builds one 512×256 canvas: a mostly-dark
base (`#383838` = 0.22) with eight long soft diagonal wipe marks and ~110 dust
speckles, drawn **bright**. It is the `roughnessMap` only, sampled linearly
(`texFromCanvas(c, false)`) because it is data, not colour. With the material's
`roughness` at 0.09 the base multiplies down to **0.020** (mirror-sharp) and a
mark reaches 0.09, so the pane stays clear and only the wipe marks smear the
highlight. A scuff cannot show as a mark on a pane at alpha 0.06 — it can only
show in the reflection, which is how it reads in the scene.

**B. The apron plate is gone.** §10 left a `25.2 ← 4.2 ← 2.4` block at
`(MID_X, −2.1, TOP_FOOT − 1.5)` with the sheet's two instruction cards laid on
its top face. Its footprint is table y −4.2 … 0 and the flipper pivots sit at
y −0.12, so it stood **straight over the flippers**; being 2.4 tall it also put
that top face at z 3.8, barely under the glass (z ≈ 4.0), so from the player's
own angle it read as a grey frame around the front of the glass. The
reference's top-down panel (`dev/crops/ref_topdown.png`) shows the field's foot
— the flippers, the drain, the flowers and the painted lettering — right to the
edge with nothing over it, and the lockdown bar plus the two side rails already
close the front. The block and both cards are deleted, and the painting
underneath is now the front of the game.

**Verified after the change** — downward rays over the whole foot with the
glass skipped:
```
y −2.2:              [−1] #e2d1a4 Capsule  z 0.88   <- the ivory flipper bat
y −2.8:       [−1] [2] [5] #010101 Box      z 0.60   <- playfield's drain box
y −3.4 … −4.6:  every x   #04050a Extrude   z 5.20   <- the LOCKDOWN BAR
```
The flipper bat is now the first opaque thing under the glass at **both**
pivots — it used to be the apron — and no `#04050a` mesh survives anywhere over
the field. A top-down render confirms the two ivory bats are plainly visible.

### Also checked

- Glass present and rendering: toggling `glass.visible` moves the sampled
  pixels, and `side` reads `0` (`FrontSide`), confirming the single layer.
- 380 draw calls / 100.2k tri in the default view — one fewer mesh than §10,
  since the apron and its two cards are gone.

### Known gaps

- The playfield module's own drain box (`#010101`, `metalness 0.5`) is exposed
  where the apron used to hide it, and it renders grey for the same reason
  `M.black` does: a specular lobe under a strong key light on a near-black
  albedo. It sits **below** the flipper line and belongs to `playfield.js`, so
  it is left alone here.
- The two instruction cards from the sheet's apron regions are no longer used
  anywhere. If they are wanted back they belong flat on the front wall, not on
  a block over the playfield.
- `dev/_img.html` joins the temporary tools above (it scales a `dev/` image to
  the viewport so a crop can be screenshotted).

## 12. LOCKDOWN BAR RESEAT — 2026-10-09 (so the flippers can be seen)

Out of the §11 review: with the apron gone the bar was still eclipsing the
flipper bats from the playing camera. Measured at the game's own camera, aiming
at the middle of each bat and reading the pixel there:

| | pixel at the bat |
|---|---|
| bar + skirt shown | `444759` — the bar's own colour |
| bar + skirt hidden | `eceae5` — the ivory bat |

Over a sampled grid across the flipper well, 1 of 308 samples read as bat with
the bar in place against 10 of 308 with it hidden. Three numbers were wrong:

1. **The seat.** `ldY = FOOT_Y + 1.95` put the bar's upfield edge at table
y −2.775 — 2.1 u ONTO the playfield — while the bats pivot at y −0.12 with
their tops at z ≈ 1.2. That left the bar's top edge 4.45 u above them and only
~1.5 u in front of them, so at the camera's ~41° it hid everything within ~4.6 u
behind it. A real bar's back edge sits **on** the glass's front edge.
2. **The height.** `LD_H = 1.2` made the bar 1.2 u proud of the pane; a real one
is ~0.5". The 1.25 u band the reference measures in its front view (§2) is the
bar's exposed **front face** — most of it the part below the glass line — not
height above the glass.
3. **The skirt.** `roundGeo(…, 1.7, …)` at `FOOT_Y + 0.6` stood INSIDE the front
board, which swallowed all but its top ~0.7 u, and that top then sat 0.5 u
ABOVE the slimmed bar: the skirt, not the bar, was the thing standing up in
front of the playfield.

So now:

- the glass starts at `FOOT_Y + WALL` (the front board's inner face, which is also
the playfield's own front edge) instead of 1 u upfield of it, so no bare strip of
field shows in front of the pane;
- the bar's upfield edge lands on that same edge (`ldY = gY0 − LD_D / 2`): it
**clamps** the pane rather than overhanging the playfield;
- `LD_H` 1.2 → **0.5** and `LD_D` 2.15 → **1.6**, so it is 0.5 u proud of the
glass and overhangs the front face by 0.67 u instead of 1.2 u of air;
- the skirt is now the reference's **1.25 u** band standing on the front face's
own plane with its top flush with the bar's, so it adds no occlusion at all.

**Verified.** Ray-casting straight down across the whole front, the highest black
point in front of the playfield is now z **4.27** at table y −5.09 — downfield of
the glass's front edge (−4.87). And the ivory sample over the flipper well reads
**28/840 with the bar and skirt in place against 28/840 with them hidden**: the
bar no longer covers a single pixel of either bat. (The grids differ between that
run and the 1/308–10/308 run above, so compare each pair within itself.)

### Known gaps

- The bar now overhangs the cabinet's front face by 0.67 u. That is what a real
  lockdown bar does; the reference's front view cannot measure depth.
- The playfield's own drain box (`#010101`) and the front board's top edge are
  still in front of the bats' lower halves from a low camera; both belong to
  `playfield.js` / the shell, not to the bar.

## 13. HEAD-WALL MIRROR — 2026-10-09

Asked for directly: the inside of the head wall gets the same treatment as the
two flanks, so the opening is lined on all three walls.

The head wall is a plain rectangle, not a wedge (only the lid line climbs), so
it takes `addPanel` rather than `addTrap`. Its basis is `right = AX`,
`up = AZ`, which puts the normal on **−Y** — table-space "back at the player",
the way `installMirror()` needs it (that pass renders only when the camera is on
the normal's side, so a panel facing away costs nothing). Height `inHH`, the
same top line the two blades finish on at this end; width `OUT_W − 2·WALL +
0.02`, i.e. 0.01 INSIDE each blade so the three meet without a seam; plane at
`HEAD_Y − WALL − 0.03`, a hair inside the board's inner face.

**Measured after the change:**

- `machine.mirrors` is now 3 entries. The new panel is a `PlaneGeometry`
  25.96 × 24.37 sitting at table y **44.04** (the playfield's own far edge is
  44.07) with world normal **(0, −0.11, 0.99)** — table −Y, facing the player.
- It **renders**: `reflectionPasses` increments (11 over a handful of frames)
  and its 768×768 target holds a strongly coloured image — sampling the target
  and converting linear→sRGB gives a large region of saturated playfield
  colours, which is the painting reflected.
- On screen it behaves like the **left blade does at the same camera**. Over the
  band of each panel that is not hidden behind the playfield, with the panel
  shown against hidden:

  | panel | saturation | luminance |
  |---|---|---|
  | head wall, shown | 11.1 | 44.9 |
  | head wall, hidden | 9.1 | 38.9 |
  | left blade, shown | 15.4 | 43.4 |
  | left blade, hidden | 11.4 | 36.5 |

  Same character, a little less colour — at the player's own angle a rear
  mirror mostly reflects the cabinet's dark upper interior, which is also why
  the two blades read as dark metal from the attract camera and only show the
  field when you get close.

### Known gaps

- Only the band of the head panel ABOVE the field is visible from the seat:
  the pane spans z −9.4 … 14.98 and everything below z 0 is behind the
  playfield's own far edge. The 15 u above the field is what reads as mirror.
- Cost: every panel that faces the camera is one extra full scene render at
  768×768. In the default view the left blade and the head panel both face the
  camera and the right blade does not, so the frame went from 1–2 reflection
  passes to 2.
- Verified numerically (target readback, ray-casts, on-screen pixel censuses).
  A screenshot of the new mirror was not obtainable — the preview webview kept
  returning uncomposited frames.

## 14. CONTAINMENT PASS — 2026-10-09 (the ball was leaving the cabinet)

Reported as "the ball keeps escaping the cabinet". It was, and the field's
boundary had holes rather than one hole. `src/js/table.js` and
`src/js/physics.js`; re-run the whole battery any time with
`dev/_verify.html` (headless, no renderer: it builds the real table and the
real solver and prints the results into the page).

### 14.1 What was wrong

| # | hole | measured |
|---|---|---|
| 1 | the left rail stopped at art y 17 and the arch's left terminus is at (29, 5): nothing joined them, so the field's top-left shoulder was open | probe fired left from art (22, 4) left the field at art (−1.6, 23.2) |
| 2 | the rail's top end also left a 1.8 u cavity between the rail (art x 7) and the field's own left edge (art x 0); a ball that rounded the rail's top fell down it | same probe: it rounded the rail's top and fell down the cavity |
| 3 | the shooter lane's outer wall stopped at art y 18 where the arch takes over, so the wedge ABOVE the arch was open along the field's right edge | ball placed on the arch at art (90, 4) went out at art 101.7 |
| 4 | nothing along the field's far edge (art y 0), which in the machine is the cabinet's head wall | probes above the arch (art y 2–4, x 40–95) drove straight out |
| 5 | boundary probe sweep over the whole field, 4 directions, before the fix | 19 of 512 probes ended outside the artwork box |

A coarse grid sweep is a blunt instrument — probes started inside a wall's
own collision band can be thrown outward by the resolution itself — so the
numbers that matter below are from starts that are demonstrably in the
field. Two independent routes were reproduced end to end:

- **the kickback.** It fires the ball up the left outlane at `46*K` = 54.9 u/s,
  which is 44.3 u of climb against a 48.9 u field — enough to reach the very
  top. A ball kicked from art (9.5, 86) read art (19.7, **−0.8**) 1.5 s later:
  0.8 art% above the playfield, outside the cabinet. This is the route a
  player actually meets, because the kickback is the ball-save.
- **a straight plunge into the right shoulder** put a ball onto the arch and
  out the right edge (hole 3).

### 14.2 The fix (table.js, 113 → 140 segments)

1. the left rail now runs the **whole** left edge, `(WALL_L, −1.6)` to
   `(WALL_L, Y(0))` — the painted wall band runs the full height of the
   artwork, so the wall does too (holes 1 and 2);
2. a corner wall, `smooth()` sampled at 26 segments, sweeping from the rail's
   top `(7, 17)` to the arch's own left terminus `(29, 5)`, under the painted
   band the artwork draws there (hole 1);
3. the shooter lane's outer wall also runs to `Y(0)` — it IS the cabinet's
   right inner face (hole 3);
4. a head wall along `Y(0)` from `X(0)` to `X(100)` (hole 4). Inert in play:
   the arch holds a ball 0.67 u clear of it at the apex, so the plunge is
   unaffected (checked).

### 14.3 What was verified

`dev/_verify.html`, all of it on the table and solver as shipped:

- **220 random shots**, speeds 30–64 u/s (the solver's own ceiling is 64),
  every direction, from art x 9–90 / y 6–94 — inside the rails and clear of
  the arch, so no start can itself be the reason a ball is outside:
  **0 escapes**.
- **6 shots straight up the left column at 55 u/s** (what the kickback does)
  and **8 fired sideways at the four seams**: all contained.
- **the kickback itself** from art (9.5, 86), (9.5, 88), (9.5, 90): fires,
  the ball stays inside and comes back down the column.
- **24 games of 45 s** with a full plunge and flippers: **0 escapes, 0 stuck
  balls** (the balls my bench called stuck were parked in the shooter lane
  after its single, deliberately weak plunge — the lane the player replunges
  from, not a fault).
- the arch still delivers into the top-left lane, and the plunge still rides
  the shooter lane into the arch.

### 14.4 The second game-breaker the bench found (physics.js)

Riding a wireform was a guaranteed lost ball, and nothing to do with the
boundary. Both ramps end in a vertical drop on their lane's axis, and
**ROOTS ORBIT's release axis (art x 71) is exactly the axis of the SKANK1
standup**: the ball is dropped straight down onto the *tip* of that target
and stops there. Measured at art (71, 27.2) — 0.64 u above the target's top
end, i.e. exactly a ball radius — and it sat there for the whole run (30 s+,
3 of 3 release speeds, and every one of 8 play seeds ended on it).

The cause is an equilibrium, not a geometry overlap: for a contact past
either end the push-out normal is straight up, gravity is straight down, and
the solver has nothing to break the symmetry. So a ball can balance on any
segment tip forever.

Fix: `hitSegment` now flags that state (tip contact, near-vertical normal,
speed under 1.5 u/s — a ball that is actually moving can never feel it), and
`_collide` nudges the ball 1 u/s **outboard, away from the field's centre**,
which is the side with room at every tip we have measured. Verified: the
SKANK1 tip, both outlane divider tips and a lane-wall tip all clear now; the
ramp ride ends in play or a drain instead of a permanent rest. It also frees
a wedge the old solver could sit in for ever — a ball dropped into the slit
between the outlane divider's top and the slingshot's collision line used to
pin at art (13.1, 68.8) with the sling switch re-firing on almost every step
(the pinned trace logged sling events at the same position for 3 s); it now
rolls out in under a second.

### 14.5 Known gaps

- The corner wall's shape is a judgement call. The artwork does paint a band
  sweeping from the rail up to the lane mouth, and the wall follows it, but
  the band was measured coarsely (a tan-colour mask over a 318 × 584 px
  panel gives few confident pixels), so the wall is a 22 art% chord rather
  than a traced curve.
- The pocket above the corner wall (art x 7–29, y 0–5) is now a **sealed
  chamber**. No ball can get into it and one placed in it stays — deliberate
  (a ball that used to leave the cabinet now stops), but it is dead field.
- The kickback still costs you the ball. With the corner sealed it goes up the
  left column, is deflected by the new wall and comes back down the outlane
  (measured). Its force is enough to reach the very top of a 48.9 u field
  every time, so a "save" can only ever come back down the way it went. If it
  is meant to return the ball to play, the force wants to be ≈46 u/s or less —
  enough for ~31 u of climb, which lands it at the top of the outlane where
  the left column opens into the field. Not changed here: that is feel.
- Everything above is simulation, ray probe and pixel census. The interior
  could not be screenshotted reliably (the preview webview kept returning
  uncomposited frames), so none of it is verified by eye.
- `dev/_verify.html` (the battery), `dev/_bleed.html` (art with the walls
  drawn over it, `#x0,x1,y0,y1,zoom`) and `dev/_walls.html` (the walls drawn
  in the 3D render, `#ax,ay,span`) are this pass's temporary tools.

Current in-game counters on a fresh load: 500 draw calls / 102.7k tri /
285 geo / 20 tex, no console or page errors. The added walls are segments
only — no geometry, no draw calls.

## 15. SIX-ITEM PASS — 2026-10-09 (ramp output, the plunge, the display, the lid trim, the legs)

Six asked-for changes. Files touched: `src/js/table.js`, `src/js/game.js`,
`src/js/dmd.js`, `src/js/machine.js`, plus one new profiling tool,
`dev/_legref.py`. Every number below was measured on the shipped files; the
physics numbers come from the standalone battery in `dev/_verify.html`, the
machine numbers from the running game (`PB.game.machine`). Both pages were
reloaded with a cache-buster before the final runs, because a plain reload
twice served the previous build and produced measurements of code that no
longer existed.

**1. THE WIREFORM THAT DROPPED THE BALL ONTO A TARGET'S TIP** — `table.js`.

ROOTS ORBIT ends in a vertical drop on its lane's axis, and that axis was art
x 71 -- which is exactly `standX = X(71.0)`, the SKANK bank's own axis. The
ball was therefore delivered onto the TIP of the top standup and balanced
there (§14 measured it parked at art (71, 27.2), one ball radius above the
tip). §14's solver nudge stopped it sticking; it did not stop the delivery
being aimed at the tip.

The drop now runs at art x 68: `[X(68.6), Y(5.2)], [X(68.0), Y(7.5)],
[X(68.0), Y(11.0)], [X(68.0), Y(15.5)]`. Measured on the shipped table:

- released at art **(68.4, 15.5)** at all three ride speeds (16, 24, 34 u/s);
- closest approach to the bank's collision segment **0.68 u** = 1.1x the 0.62 u
  ball radius, i.e. the ball's surface passes 0.06 u clear of the target line
  and never reaches the tip at all;
- no stuck stop in any of 3 x 10 s rides; the ball lands in the lane and feeds
  the field.

**2. THE PLUNGE: WHAT IT WAS HITTING** — `table.js` + one line in `game.js`.

The four top-lane walls (LT_OUT, LT_IN, RT_IN, RT_OUT) started at art y 4, and
the arch runs directly over them. Measured headroom between the arch and each
wall top at y 4: **RT_OUT 0.63 u, LT_IN 0.76 u, RT_IN 0.90 u, LT_OUT 1.04 u**
-- against a 1.24 u ball. So a launched ball rides up the shooter lane, is
turned left by the arch, and inside 2 u meets the top of RT_OUT and is thrown
straight back down the lane. Traced: the ball leaves the lane at art (97.3,
17.9) on the arch, then hits RT_OUT's tip at (76.0, 4.0) and reverses from
9.8 u/s leftward to 3.7 u/s rightward. It could never leave the lane corridor
-- which is the "it hits something I can't see" on every plunge.

The walls now start at art y 8, which is also where the shooter lane's own
one-way gate finishes. Headroom: **RT_OUT 1.54 u, RT_IN 1.81 u, LT_IN 1.67 u.**
Measured: a 54 u/s plunge (launch's maximum charge) crosses art (89.8, 10.8) ->
(76.5, 4.3) -> (63.3, 5.6) -> (53.6, 9.7), i.e. over both right lane walls and
down into the field, ending in play. 26 and 40 u/s plunges still climb and come
back down the lane, which is what a soft plunge does.

That exposed one more thing: `game.js`'s "ball back in the shooter lane" test
also required the ball to be above art y 20, so a soft plunge's ball -- which
rolls back and rests on the lane floor at art y 86 -- left the game in 'play'
with a plunger that could not fire. The y test is gone; any slow ball in the
lane re-arms 'ready'. The resting ball's own x measured 94.4 art against the
96 lane centre, inside the 1.2 u the test allows.

**3. THE DISPLAY: WIDER, ONE COLOUR, PALMS ON IT** — `machine.js` + `dmd.js`.

- **Wider.** `BAND_WIN` was `{x .35, y .21, w .30, h .58}` -- an 8.93 u window
  in the middle of a 12.65 u painted plate, which left the plate's two painted
  side bands (the palms the reference draws either side of the panel) on show
  around it. It is now `{x .2875, y .2831, w .425, h .4338}`, i.e. the plate's
  own width, centred. Measured on the machine: the panel is **12.648 u of the
  29.76 u band = 0.4250**, exactly `makeScoreBand`'s plate (`c.width * 0.425`),
  0.4335 of the band's height, centred to 0.0000, 4:1.
- **One colour.** Every scene used to pick its own hue (gold, lime, red,
  white, blue). `render()` now lights every scene from `COLORS.amber`.
  Measured brightest dot per scene: score (255, 223, 78), and ready, attract,
  gameover, bonus, wizard, multiball and the JACKPOT banner all **(255, 219,
  76)** -- the same orange.
- **Palms.** They are on the panel now: `drawPalms` draws one silhouette per
  edge, dot by dot (no strokes, so every lit pixel is a whole plasma dot), with
  the crown swinging at 1.9/s through 0.45 rad. The first cut ran at 0.55/s and
  moved a frond tip about half a dot per second, which is not an animation.
  Measured in panel dots: the left palm's trunk rises at col 2-4 to a crown at
  ~row 16 and a canopy across cols 4-10, the right palm mirrors it at cols
  116-125; the two palm bands light on every scene (178/124 dots on the score
  screen, 209/210 on wizard) and the two opposite sway phases move 10-11 dots
  per palm. They are drawn first and dimmed to 0.38 on the two text-heavy
  screens so the score never has to read through them.

**4. THE LID TRIM IS ONE PIECE** — `machine.js`.

It was two different things: a lockdown bar (`roundGeo` 28.35 x 1.6 x 0.5,
r 0.22, `M.black`) and two sharp-edged side rails (`boxGeo` 0.5 x railLen x
0.42, `M.rail`), placed independently -- the rails at `topAt(mid) + 0.12`, the
bar at `glassZ(front) + 0.55`. At the front corner the rail's top measured
**0.67 u above** the bar's: a step exactly where the design says "one piece".

Now it is one bull-nosed section (`TRIM_W` 0.66 x `TRIM_H` 0.52, r 0.22) in one
material (`M.trim`) run three times:

| run | size | outer face | top |
|---|---|---|---|
| front (lockdown bar) | 27.8 x 1.6 x 0.52 | x -12.4 / 15.4 = the flank planes | 21.396 |
| left | 0.66 x 51.83 x 0.52 | x -12.4, flush with the bar's end | 21.365 |
| right | 0.66 x 51.83 x 0.52 | x 15.4, flush with the bar's end | 21.365 |

The tops are 0.03 u apart on a 50 u machine, measured over the corner's own
depth window. What makes that come out is that all three are seated off the
GLASS line (`trimZ`) rather than off the lid. The runs start inside the bar's
own middle (no seam) and finish at the head end, where their last ~9 u pass
under the backbox, as a real machine's rails do. `M.trim` is `M.rail` with the
metalness and environment reflection pulled down, because at 0.28/0.5 the key
light turned the bar silver -- which is why that one piece used to be a
different black from the rails beside it. The front skirt was re-seated so its
top stays flush with the taller bar.

**5. THE LEGS: THE SECOND BLADE, AND THE REFERENCE'S FEET** — `machine.js`.

Each corner had ONE blade (the side one) and a chrome 3.2 u disc for a foot.
`dev/_legref.py` profiles the reference's front ortho row by row (dark runs):
each leg reads as **two flanges** -- w5 and w9 px at the top, folding into one
at y 587 -- 15-18 px wide overall, and over its last 6-7 px (y 590-596) it
**widens outward to 15 px and stops dead on the floor**. That is a black flare
about 0.9 u tall and 2.1 u across. No chrome disc.

- `addBlade()` now builds the corner's second blade: the FRONT blade on the
  front legs, the BACK one on the back legs, from the same angle iron, the same
  splay, the same length and the same two six-sided bolts. Its axis is inset by
  `LEG_D/2` where the side blade's is inset by `LEG_T/2`, so the pair meets on
  the corner the way the reference's folded bracket does. Measured: **8 blades
  (2 per corner), 16 bolts (2 per blade), 4 feet.**
- The foot is a black flare (r 0.95 -> 1.12, 0.9 tall), and it stands UPRIGHT
  IN THE WORLD (`UPW = (0, sin TILT, cos TILT)`): squared to the cabinet it
  leans with the cabinet's own TILT and puts its rim through the floor plane
  (0.23 u at the front, 0.6 at the long rear pair). Measured now: 0.128 u
  above/below the floor plane at each corner -- and that residual is the legs'
  own cut, not the pad. Pad width 2.24 u against the reference's 2.1.

### Also checked, and what is still a judgement call

- The game loads with no console errors and every script and the sprite sheet
  200. Counters on a fresh load: **508 draw calls / 103.4k tri / 285 geo /
  20 tex** (the four extra blades and the trim's two runs account for the ~8
  calls over §14's 500).
- Containment re-run on the final `table.js`: **220 random in-field shots** at
  30-64 u/s from art x 9-90 / y 6-94 -> **0 escapes**.
- The top lanes still hold and deliver: a ball placed at art (29, 5) and at
  (71, 5) leaves each lane downward at art y 16.6.
- SCREENSHOTS: still mostly uncomposited (`preview_screenshot` kept returning
  empty frames). One clean frame was captured from inside the cabinet and is
  what the display numbers were eyeballed against -- the panel reads as one
  wide amber display with a palm hanging over each edge, and the speaker grills
  clear of it either side. The lid trim and the feet are verified numerically,
  not by eye.
- The palms' shape is a judgement call: 15-dot trunks with five fronds each,
  rooted on the panel's bottom row. The artwork also paints palms on the
  BACKGLASS above the band (art.js `bpalm` at 16%/84% of its width); those are
  above the display and no panel width covers them.
- The flipper-bat occlusion was not re-measured from the playing camera. The
  bar's seat is unchanged (its upfield edge on `gY0`) and only its height moved,
  +0.4 u, 24 u away from the bats.

---

## 12. GLASS, FOR REAL — 2026-10-13 (Fresnel + reflected room, no film)

**The complaint.** The pane read as "a faint white line across the glass". It
was three painted terms at once: a pale blue-white base (`vec3(0.80,0.89,1.0)`)
mixed in at a constant alpha, a gaussian `stripe` of alpha up to **0.42** drawn
across the pane in UV space, and a bright border (`edge*0.30`) round it. None
of them had any relationship to the view or the surroundings, so none of them
could read as light on a surface — the stripe in particular is a line of paint
lying on the playfield, which is exactly what a viewer sees.

**What replaces them.** A thin-pane energy split, nothing added:

- Schlick from **F0 = 0.04** (air to glass): ~4% returned head-on, up to
  everything at grazing incidence.
- `gl_FragColor = vec4(reflection, F)` under normal blending, which is
  `mix(field, reflection, F)` — the transmittance and the reflectance stay in
  step, and the artwork keeps its own colour (it loses 4% of itself to the
  reflection rather than being covered by it). `toneMapped: true` so the
  reflection lands in the scene's own grade.
- The reflection is sampled along the true reflected view from **`makeGlassEnv`**,
  a room of bright ceiling strips, wall fittings and a warm horizon. The lights
  are what make a pane visible, so they are drawn as **dashes across the rows
  the player's own eye reflects** (on the up face a row is an elevation of
  `45 + |v-0.5|*90`; a seated player reflects rows ~0.28–0.40), with no mipmaps
  on the cube, because mipmapping a stretched reflection footprint blurs the
  lights straight back into the flat wash.
- `makeGlassSurface` (long wipe marks + dust, mostly dark) is now actually
  used, and it **jitters the reflection vector** instead of adding brightness:
  a scuff cannot be seen on a 4%-reflective surface, it can only smear what the
  surface reflects.

**Measured** (`dev/verify-mirrors.py`, `glass` in `mirror-verification.json`):

| | player view (68 / −97) | grazing (16 / −42) |
|---|---|---|
| mean Fresnel weight | 0.0437 | 0.1486 |
| pane's own mean delta | 3.2 / 255 | 3.4 / 255 |
| pane's own peak delta | 24 / 255 | 86 / 255 |
| contrast (sd/mean) | 1.07 | 2.48 |

- `meanArtworkDelta` **5.12** (limit 9) and `saturationKept` **0.968** — the pane
  disturbs the painting *less* face-on than the film it replaces did (6.23).
- `viewDependence` **0.43**: over 370 pane points visible from both cameras, the
  pane's contribution changes by 43% on average between them. Paint cannot do
  that; this is the assertion that the highlight is a reflection.
- The pane's brightest point **moves 0.90 pane units** when the camera moves.
- The shader is also checked for the Schlick form, for F0 = 0.04, and for the
  absence of the three film terms, so the painted version cannot come back
  unnoticed.

**The mirror probe, fixed on the way.** Mirror liveness was measured with a 1 u
marker moved 5 u, which left the narrow head panel at 89–168 changed pixels
against a threshold of 100 — a coin toss, and it failed twice during this pass.
The probe is now a 5 u sphere moved 12 u: 14.7k / 24.0k / ~170 changed pixels.
The head panel's own view of the field is a narrow band; that is a property of
the machine, not of the probe, so its bar is set at 110 — 25% under the observed
floor, and still zero for a frozen target.
