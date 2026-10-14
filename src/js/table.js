/* ============================================================
   ONE DROP PINBALL  --  table.js
   Pure data. Every piece of hardware on this playfield was
   measured off the artwork in assets/sprite.png, so the layout
   and the painted playfield can never drift apart.

   HOW THE COORDINATES WORK
   ------------------------
   The artwork occupies a 453 x 817 px rectangle of the sheet.
   That rectangle IS the playfield, so the table is built with
   exactly that aspect ratio:

       x : CX - PF_W/2  ..  CX + PF_W/2     (left .. right)
       y : 0            ..  PF_H            (drain .. arch)

   Every feature below is authored in ART PERCENT -- x 0..100
   left to right, y 0..100 top to bottom -- and converted by
   X() / Y(). That is why the numbers read like the measuring
   grid that was laid over the artwork.

   +Z is straight up out of the playfield. Wireform ramps carry
   their own height, so a ball riding one ignores the surface.

   WHAT THE ARTWORK SHOWS  (measured, not guessed)
   -----------------------------------------------
     x  7 .. 92      the playfield proper, between the painted
                     rasta wall bands
     x 92 .. 100     the shooter lane, up the right hand edge
     x 24 .. 34      left top lane, flanking the tiki shack
     x 66 .. 76      right top lane, flanking the tiki shack
     x 41 .. 59      the tiki shack / bash toy
     x 38 .. 62      the drop-target band
     x 33 .. 67      the pop bumper cluster
     x  3 .. 20      left slingshot      (mirror 80 .. 97)
     x 30 / 70       flipper pivots
   ============================================================ */
import * as THREE from './vendor/three.module.min.js';

(function (global) {
  'use strict';

  /* r186 ships no UMD/global build, so THREE is a module import now. Keep
     window.THREE too: the dev probes and the console still use it. */
  global.THREE = THREE;

  /* ---- artwork-derived frame ----------------------------------
     The artwork occupies a 453 x 817 px rectangle of the sheet, so its
     natural aspect is 0.5545. THE PLAYFIELD SIZE LIVES HERE AND NOWHERE
     ELSE: change PF_SIZE (or pass a size to buildTable) and every wall,
     ramp, lamp and target on the table moves with it, because all of
     them are authored in art percent. The playfield surface is
     stretched onto exactly the same rectangle, so the hardware and the
     painted art can never drift apart.

     HOW THE DEFAULT WAS DERIVED  (against machine.js's cabinet)
       cabinet outer box   OUT_L -13.4 .. OUT_R 16.4   (29.8 wide)
                           FOOT_Y -3.4 .. HEAD_Y 42.6  (46.0 long)
       wall thickness      1.5  ->  inner opening 26.8 x 43.0
       opening centre      1.5, 19.6  -- and the art's own centre line
                           is 1.5, so the two frames already agree
     THE PLAYFIELD FILLS THAT OPENING COMPLETELY: 26.8 x 43.0, wall to
     wall and head wall to foot wall, with sideRail and endMargin both
     zero. The cabinet is not touched to make this work.

     WHY THE PAINTING IS STRETCHED, AND WHY THAT IS RIGHT
     The playfield panel on the sheet measures 318 x 584 px, an aspect of
     0.5445. The opening is 0.6233. Those do not agree, so filling the
     opening means stretching the painting about 14.5% across. That is
     what the design asks for: the TOP-DOWN PLAYFIELD view in
     assets/3dref.jpg -- the finished machine, drawn by whoever laid the
     sheet out -- measures 0.6232, i.e. the painting is meant to be
     wider than its panel. Stretching is therefore the faithful choice,
     not a compromise.

     WHAT THAT COSTS
     The hardware is physical, so bumpers, posts and the ball stay round
     while the painted rings under them go slightly oval -- about 0.16
     units on a bumper of radius 1.10, which is under 2% of the field
     width. Everything is still placed from the art, so nothing drifts.

     RESIZING.  Three equivalent ways, all of which end up here:
       PB.PF_SIZE = { W: 26, H: 45 };   then reload
       PB.buildTable({ W: 26, H: 45 })  returns a table at that size
       PB.game.fitPlayfield(26, 45)     hot-swaps the live table
     The cabinet is NOT resized by any of them -- machine.js sizes
     itself from its own real-world numbers. If the cabinet changes,
     re-derive PF_SIZE from its new opening and pass it in. */
  /* the artwork's source sheet is 453 x 817 art pixels -- an aspect of
     0.55447 -- and every art coordinate in here is a fraction of that
     rectangle. No live code needs the two numbers (the playfield is sized
     from the CABINET's opening below, not from the picture), so they live
     in this comment rather than in variables nothing reads. */

  /* ================= the cabinet's inner opening =================
     machine.js owns the cabinet. These numbers are its current outer
     box, mirrored here so the playfield can be derived from it in one
     place instead of guessed at:

       machine.js          OUT_W 27.8   WALL 0.93   BODY_L 50.8
       -> outer box        x  -12.4 .. 15.4        (centre 1.5)
                           y   -5.8 .. 45.0        (centre 19.6)
       -> inner opening    25.94 x 48.94

     sideRail and endMargin are zero: the playfield consumes the box,
     with no gap at the flanks and no gap at the apron or head wall.

     KEEP THIS IN STEP WITH machine.js. If the cabinet changes, either
     edit these four numbers, or have machine.js publish its box --

         PB.MACHINE_BOX = { outL, outR, footY, headY, wall }

     -- and the playfield follows it automatically, because machine.js
     loads before game.js. PB.cabinetOpening() prefers that box, and
     game.js compares the built cabinet against this one at boot. */
  var CABINET = {
    outL: -12.4, outR: 15.4,
    footY: -5.8, headY: 45.0,
    wall: 0.93,
    sideRail: 0,         /* no gap: the field runs into the side walls */
    endMargin: 0         /* no gap: apron end and head wall, flush */
  };

  global.PB = global.PB || {};

  /* ---- r186 compatibility: light units -------------------------------
     One renderer default changed between r149 (what this machine was
     written against) and r186, and it is visible on screen: r149's
     default renderer multiplied every light intensity by PI
     (physicallyCorrectLights === false), where r155+ always works in
     physical units -- so the same numbers come out PI times dimmer.
     LIT() puts that factor back, so the intensities in game.js and
     playfield.js keep meaning what they were tuned to mean. Every light
     intensity in the project goes through it, and it is defined here
     once so the creation sites and the per-frame ones cannot drift.

     COLOUR needs no shim. r152 turned ColorManagement on by default,
     which is precisely what the manual `convertSRGBToLinear()` calls in
     this project were hand-rolling against r149's legacy mode (see the
     notes in playfield.js and machine.js about hexes reading washed
     out). Those calls are therefore redundant now and have been
     removed: a hex means its sRGB value everywhere, and the painted
     canvas art and the 3D materials that share the same PALETTE finally
     agree with each other. */
  global.PB.LIT = function (v) { return v * Math.PI; };

  /* Derive a playfield size from a cabinet outer box, so a change to
     machine.js is a one-line re-derivation instead of a guess. The box
     comes from an explicit argument, else PB.MACHINE_BOX, else the
     CABINET mirrored above. */
  function cabinetOpening(c) {
    c = c || global.PB.MACHINE_BOX || CABINET;
    /* PB.MACHINE_BOX is published by machine.js and carries only the
       OUTER box -- sideRail and endMargin are ours. Reading them
       straight off an un-normalised box yields undefined, and
       `2 * undefined` is NaN, so W and H silently became NaN the
       moment the cabinet took over. Every comparison against NaN is
       false, which quietly disabled the playfield/cabinet drift guard
       in game.js. Default them instead. */
    var sideRail = c.sideRail || 0;
    var endMargin = c.endMargin || 0;
    var foot = c.footY + c.wall, head = c.headY - c.wall;
    return {
      W: (c.outR - c.outL) - 2 * c.wall - 2 * sideRail,
      H: (head - foot) - 2 * endMargin,
      centerX: (c.outL + c.outR) / 2,
      centerY: (foot + head) / 2
    };
  }
  global.PB.cabinetOpening = cabinetOpening;
  global.PB.CABINET = CABINET;

  /* PF_SIZE is DERIVED from the cabinet rather than written out, so the
     field can never disagree with the box it lives in. Note the result:
     the opening's aspect is 0.530 against the painting's own 0.5445 --
     a 2.7% horizontal squeeze, down from 14.5% when the cabinet was
     sized differently. */
  if (!global.PB.PF_SIZE) {
    var _open = cabinetOpening();
    global.PB.PF_SIZE = {
      W: _open.W, H: _open.H,
      centerX: _open.centerX, centerY: _open.centerY
    };
  }

  /* A table is authored against a 41-unit-long field. K rescales every
     absolute gauge -- ball, bumper radii, wireform tube gauge, kicks,
     spring lengths -- so a bigger or smaller playfield keeps exactly
     the same proportions instead of turning into a toy or a hall. */
  var REF_H = 41;

  var PALETTE = {
    red: 0xd7263d,
    gold: 0xf6c445,
    green: 0x1d9a4e,
    lime: 0x7bd94a,
    deep: 0x0b3d2e,
    ink: 0x0a0d0b,
    chrome: 0xd9dee6,
    steel: 0xb9c2cc,
    wood: 0x4a2c1a,
    ivory: 0xf2ead2
  };

  /* Catmull-Rom through control points, sampled into n segments. */
  function smooth(pts, n) {
    var out = [], m = pts.length;
    function P(i) { return pts[Math.max(0, Math.min(m - 1, i))]; }
    for (var s = 0; s < n; s++) {
      var u = s / n * (m - 1);
      var i = Math.floor(u), t = u - i;
      var p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      var t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
      ]);
    }
    out.push([pts[m - 1][0], pts[m - 1][1]]);
    return out;
  }

  /* Shared, eased ramp elevation: no sharp climb/plateau corners. */
  function rampRise(u, ramp) {
    function ease(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
    var riseEnd = ramp ? ramp.riseEnd : 0.44;
    var returnStart = ramp ? ramp.returnStart : 0.58;
    var exitLift = ramp && ramp.exitLift || 0;
    return ease(u / riseEnd) * (exitLift + (1 - exitLift) * ease((1 - u) / (1 - returnStart)));
  }
  global.PB.rampRise = rampRise;

  function buildTable(size) {
    /* ---- the frame, resolved per call ----------------------------
       Everything below is authored in art percent against THIS frame,
       so a table built at any size is laid out identically. */
    size = size || global.PB.PF_SIZE || { W: 23.9, H: 42.0 };
    var PF_W = size.W, PF_H = size.H;
    var CX = (size.centerX === undefined) ? 1.5 : size.centerX;
    /* centreY is where the MIDDLE of the field sits in cabinet space.
       Defaulting it to H/2 would put the field on the wrong centre line
       whenever the cabinet's opening is not itself centred on H/2. */
    var CY = (size.centerY === undefined) ? PF_H / 2 : size.centerY;
    var K = PF_H / REF_H;

    function X(p) { return CX + (p / 100 - 0.5) * PF_W; }
    /* y 0 is the arch (top of the artwork), y 100 the drain */
    function Y(p) { return CY + PF_H / 2 - (p / 100) * PF_H; }

    var segments = [];
    function seg(ax, ay, bx, by, e, f, kind) {
      segments.push({
        ax: ax, ay: ay, bx: bx, by: by,
        e: e === undefined ? 0.42 : e,
        f: f === undefined ? 0.03 : f,
        kind: kind || 'rail'
      });
    }
    var chainId = 0;
    function poly(pts, e, f, kind) {
      var chain = ++chainId;
      for (var i = 1; i < pts.length; i++) {
        seg(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], e, f, kind);
        segments[segments.length - 1].chain = chain;
      }
    }

    /* ============ OUTER BOUNDARY ==============================
       The painted rasta wall bands sit at x 5..7 and x 90..93, so
       the rails go exactly there and the shooter lane is the strip
       between the right rail and the edge of the artwork.       */
    var WALL_L = X(7.0), WALL_R = X(92.0);         /* -8.277 .. 10.931 */
    var LANE_L = WALL_R, LANE_R = X(100.0);        /* shooter lane     */

    /* left rail: under the drain, up the WHOLE left edge -- the painted
       wall band runs the full height of the artwork, so the wall does too.
       It used to stop at y 17, which left a 1.8 u cavity between the wall
       and the field's own left edge: a ball that got above the rail (the
       kickback throws it up there) rounded the rail's top, fell down that
       cavity and left the field at art x 0 -- measured at (-1.6, 23) from
       a shot struck at (22, 4). */
    seg(WALL_L, -1.6, WALL_L, Y(0.0), 0.5, 0.03, 'rail');

    /* ...and the CORNER. The rail's top (y 17) and the arch's own left
       terminus (29, 5) are the two ends of the field's top-left corner,
       and nothing joined them: the shoulder between them was open at the
       field's edge, so a ball that got up there left the cabinet. The
       kickback is what puts it there -- it fires the ball up the left
       outlane at 55 u/s, which is 44 u of climb against a 41 u reference
       field -- and a ball kicked from art (9.5, 86) read (19.7, -0.8) 1.5 s
       later, i.e. out through the cabinet's head. This sweeps the corner
       from the rail's top into the mouth of the top-left lane, under the
       painted band the artwork draws there, and hands the ball back into
       play instead of out of it. */
    /* The full-height side and head walls already close this corner.
       A second converging arch here forms a ball-sized V trap above the
       left top lane, so leave this outer return channel open. */

    /* right rail: the shooter lane's inner wall. The upper run is a
       one-way gate -- a ball leaves the lane over the arch but can
       never tumble back into it from the playfield. */
    seg(WALL_R, -1.6, WALL_R, Y(34.0), 0.5, 0.03, 'rail');
    segments.push({
      ax: WALL_R, ay: Y(34.0), bx: WALL_R, by: Y(8.0),
      e: 0.42, f: 0.05, kind: 'rail', gate: 1
    });

    /* shooter lane: outer wall + the floor the ball rests on. The outer
       wall IS the cabinet's right inner face, so it runs to the head wall
       as well -- stopping it at y 18 (where the arch takes over) left the
       wedge ABOVE the arch open along the field's right edge, and a ball
       dropped onto the arch at art (90, 4) went straight out at x 101.7. */
    seg(LANE_R, -1.6, LANE_R, Y(0.0), 0.5, 0.03, 'rail');
    seg(LANE_L, Y(87.4), LANE_R, Y(87.4), 0.25, 0.06, 'floor');

    /* ============ THE TOP ARCH ===============================
       From the top of the shooter lane, over the arch, and down the
       far side into the mouth of the top-left lane. The last run is
       deliberately near-vertical so the ball is delivered straight
       down the lane instead of being flung across the field.     */
    poly(smooth([
      [LANE_R, Y(18.0)], [X(97.0), Y(13.0)], [X(93.0), Y(7.5)], [X(86.0), Y(3.6)],
      [X(74.0), Y(1.3)], [X(60.0), Y(0.2)], [X(45.0), Y(0.1)], [X(35.0), Y(0.9)],
      [X(30.0), Y(2.4)], [X(27.0), Y(6.0)], [X(24.0), Y(12.0)], [X(24.0), Y(16.0)]
    ], 46), 0.5, 0.03, 'arch');

    /* The field's FAR EDGE is the cabinet's head wall -- the playfield
       fills the opening, so art y 0 is that wall's own inner face -- and
       there was no wall along it either. Above the arch the field is a
       closed chamber (arch below, the lane's outer wall to the right) and
       a probe at art (88, 4) drove straight out through the top. Inert in
       ordinary play: the arch holds a ball 0.67 u clear of it at the apex. */
    seg(X(0.0), Y(0.0), X(100.0), Y(0.0), 0.5, 0.03, 'rail');

    /* ============ TOP LANES ==================================
       Two lanes flank the tiki shack, exactly where the artwork
       leaves a channel between the shack and the wall. Balls are
       delivered into them by the arch and by the two wireforms,
       then roll down through the rollovers.                      */
    /* The lane walls start at y 8, not at the field's top edge (y 4).
       The arch runs directly over these four walls, and at y 4 there was
       only 0.63 u of headroom at RT_OUT (arch at art y 1.58) against a
       1.24 u ball: a ball launched up the shooter lane rode the arch into
       the top of that wall every single time and was thrown straight back
       down the lane -- that is the "it hits something invisible" on every
       plunge. Measured headroom at y 8: 1.54 u at RT_OUT, 1.67 u at
       LT_IN, 1.81 u at RT_IN, so the arch is now a continuous path from
       the shooter lane, over both lanes, into the top-left lane. */
    var LT_OUT = X(24.0), LT_IN = X(34.0);         /* left  lane walls */
    var RT_IN = X(66.0), RT_OUT = X(76.0);         /* right lane walls */
    seg(LT_OUT, Y(16.0), LT_OUT, Y(20.0), 0.38, 0.04, 'lane');
    seg(LT_IN, Y(12.0), LT_IN, Y(16.0), 0.38, 0.04, 'lane');
    seg(RT_IN, Y(8.0), RT_IN, Y(16.0), 0.38, 0.04, 'lane');
    seg(RT_OUT, Y(8.0), RT_OUT, Y(16.0), 0.38, 0.04, 'lane');

    var laneXs = [X(29.0), X(71.0)];
    var laneY = Y(9.0), laneR = 0.88;
    var rollovers = [
      { x: laneXs[0], y: laneY, r: laneR, letter: 'I', on: false, flash: 0 },
      { x: laneXs[1], y: laneY, r: laneR, letter: 'E', on: false, flash: 0 }
    ];

    /* ============ BOTTOM: FLIPPER WELL ======================== */
    var FL_L = X(30.0), FL_R = X(70.0);            /* -3.047 .. 6.047 */
    var FLIP_PY = Y(90.3), FLIP_LEN = 3.50 * K, FLIP_RAD = 0.50 * K;

    /* outlane dividers: a ball arriving down the outside edge falls
       into the outlane and drains past the flipper. */
    seg(X(16.0), Y(79.0), X(16.0), Y(85.0), 0.4, 0.05, 'divider');
    seg(X(84.0), Y(79.0), X(84.0), Y(85.0), 0.4, 0.05, 'divider');

    /* inlane floors feeding the flippers. The inner end is tangent to
       the top of the flipper capsule so a ball transfers cleanly. */
    poly(smooth([
      [X(16.0), Y(83.8)], [X(18.0), Y(85.4)], [X(23.0), Y(87.2)],
      [X(29.0), Y(89.6)], [FL_L + 1.0 * K, FLIP_PY - 0.55 * K]
    ], 28), 0.3, 0.06, 'returnL');
    poly(smooth([
      [X(84.0), Y(83.8)], [X(82.0), Y(85.4)], [X(77.0), Y(87.2)],
      [X(71.0), Y(89.6)], [FL_R - 1.0 * K, FLIP_PY - 0.55 * K]
    ], 28), 0.3, 0.06, 'returnR');

    /* ============ SLINGSHOTS ==================================
       Not a triangle. The painting runs a long, narrow, rounded-end
       rail down each side -- art x ~11.5..15.5, y ~61..78, mirrored
       at 84.5..88.5 -- so the live bar is a skinny capsule laid ALONG
       that rail rather than a wedge straddling it.

       The bar is not quite vertical: its flipper end is swung in
       toward the centre of the machine, the way a real sling angles
       its rubber back at the flipper. The top sits on the painted
       rail line; the bottom is 4 art% inboard of it.
         tx/ty -> hx/hy   the bar, top end -> flipper end (table space)
         ax/ay -> bx/by   the collision line, on the bar's inner face
         n                world-space unit normal, aimed into the field
         len / w          capsule length and width, world units       */
    var SLING_W = 0.67 * K;
    var SLING_TOP_Y = 64.9, SLING_BOT_Y = 75.1;
    var SLING_LEAN = 2.5;                  /* art% the flipper end swings in */
    function slingBar(topX, botX, s) {
      var Ax = X(topX), Ay = Y(SLING_TOP_Y);
      var Bx = X(botX), By = Y(SLING_BOT_Y);
      var dx = Bx - Ax, dy = By - Ay;
      var L = Math.hypot(dx, dy) || 1;
      var ux = dx / L, uy = dy / L;
      /* unit normal, perpendicular to the bar, aimed into the field.
         s is +1 for the left sling, -1 for the right. */
      var nx = -uy * s, ny = ux * s;
      var off = SLING_W / 2;
      return {
        tx: Ax, ty: Ay, hx: Bx, hy: By,
        ax: Ax + nx * off, ay: Ay + ny * off,
        bx: Bx + nx * off, by: By + ny * off,
        nx: nx, ny: ny, len: L, w: SLING_W,
        kick: 15.5 * K, points: 220
      };
    }
    var slings = [
      slingBar(13.0, 13.0 + SLING_LEAN, 1),
      /* Top pulled clear of the wall; bottom leans toward center. */
      slingBar(83.0, 83.0 - SLING_LEAN, -1)
    ];

    /* ============ POP BUMPERS =================================
       The painting puts a trio of medallions here -- a pair on the
       y 29 line at art x ~46.2 / ~53.3 and the odd one out at
       ~49.2, y 35.3, which is the little white figures inside them
       read straight off the atlas.

       SIZE. A real pop bumper body is about one ball across, and
       the old 1.10*K gave a 2.63 u disc against a 1.48 u ball --
       1.8 ball diameters, with only 0.74 u of daylight to its
       neighbour. The ball could not get between them, which is
       exactly what it looked like. 0.55*K is a 1.31 u disc, so the
       cluster now has ~1.7 u / ~2.1 u gaps -- comfortably more than
       a ball.

       PLACEMENT. The cluster is centred on the medallion group and
       pulled in as close to it as the ball-sized gaps allow: the
       pair sit just outboard of their painted discs (41.1..46.1
       over the disc at 46.2, 52.7..57.7 over the disc at 53.3) and
       SKANK sits right on the third.
       Colours are the game's own -- the art's discs here are red
       and teal, not red/green/gold.                              */
    var circles = [
      { x: X(43.6), y: Y(29.0), r: 0.55 * K, e: 0.72, kick: 8.6 * K, type: 'bumper', color: 'green', label: 'ROOTS', points: 1250, id: 0 },
      { x: X(55.2), y: Y(29.0), r: 0.55 * K, e: 0.72, kick: 8.6 * K, type: 'bumper', color: 'red', label: 'DUB', points: 1250, id: 1 },
      { x: X(49.4), y: Y(35.2), r: 0.55 * K, e: 0.70, kick: 8.0 * K, type: 'bumper', color: 'gold', label: 'SKANK', points: 1500, id: 2 }
    ];

    /* ============ THE TIKI SHACK (bash toy) ===================
       The wooden tower at the top of the field. It is modelled as
       one fat post so a ball dropping out of the top lanes always
       rolls off it instead of resting on top, and every hit on it
       counts as a bash on the tiki mask.                          */
    var SHACK = { x: X(49.5), y: Y(17.5), r: 2.05 * K };
    circles.push({
      x: SHACK.x, y: SHACK.y, r: SHACK.r, e: 0.60, kick: 1.6 * K,
      type: 'toy', color: 'gold', label: 'SHACK', points: 2500, id: 9
    });

    /* ============ POSTS =======================================
       Two ivory posts frame the top corners of the bumper cluster. */
    var posts = [
      { x: X(33.0), y: Y(38.0), r: 0.40 * K },
      { x: X(67.0), y: Y(38.0), r: 0.40 * K }
    ];
    for (var p = 0; p < posts.length; p++) {
      circles.push({ x: posts[p].x, y: posts[p].y, r: posts[p].r, e: 0.6, kick: 0.8 * K, type: 'post' });
    }

    /* ============ TARGETS ===================================== */
    var targets = [];

    /* ONE DROP BANK -- four drop targets across the mid field.
       The strike faces are 0.56*K half-width so neighbouring targets
       leave a 0.6 u slot: at the old 0.72*K the brackets met and the
       whole bank read as one continuous bar instead of four targets. */
    var dropXs = [X(37.5), X(45.0), X(52.5), X(60.0)];
    var dropY = Y(45.0);
    for (var d = 0; d < 4; d++) {
      targets.push({
        ax: dropXs[d] - 0.56 * K, ay: dropY, bx: dropXs[d] + 0.56 * K, by: dropY,
        e: 0.5, f: 0.05, up: true, drop: true,
        label: 'DROP' + (d + 1), points: 1500, id: d,
        cx: dropXs[d], cy: dropY, flash: 0
      });
    }

    /* SKANK BANK -- three standups down the right, hit from the left */
    var standX = X(71.0), standYs = [Y(30.0), Y(36.0), Y(42.0)];
    for (var s = 0; s < 3; s++) {
      targets.push({
        ax: standX, ay: standYs[s] - 0.62 * K, bx: standX, by: standYs[s] + 0.62 * K,
        e: 0.5, f: 0.05, up: true, drop: false,
        label: 'SKANK' + (s + 1), points: 750, id: 4 + s,
        cx: standX, cy: standYs[s], flash: 0
      });
    }

    /* ============ FLIPPERS ==================================== */
    var flippers = [
      { side: 'L', px: FL_L, py: FLIP_PY, len: FLIP_LEN, rad: FLIP_RAD, restA: -0.55, upA: 0.55 },
      { side: 'R', px: FL_R, py: FLIP_PY, len: FLIP_LEN, rad: FLIP_RAD, restA: Math.PI + 0.55, upA: Math.PI - 0.55 }
    ];

    /* ============ SPINNER ===================================== */
    /* Offset DUB inboard of the right ramp's flared approach. */
    var spX = X(74.0), spY = Y(64.0);
    var spinner = {
      x0: spX - 0.95 * K, x1: spX + 0.95 * K, y0: spY - 1.25 * K, y1: spY + 1.25 * K,
      x: spX, y: spY, angle: 0, omega: 0, last: -1, spins: 0
    };

    /* ============ KICKBACK ==================================== */
    var kickback = { x: X(10.0), y: Y(85.0), force: 46 * K, last: -99 };

    /* ============ WIREFORM RAMPS ==============================
       Stainless tube ramps. A ball entering the mouth with speed
       rides the path at height z, ignoring playfield collisions,
       and is released along the tangent at the far end. The two
       paths cross over the arch at different heights, and each one
       drops its ball into the opposite upper lane.

       Elevated rear flyovers clear the surface lanes. Short drop exits
       replace the two long inner wireways, leaving the center open. Per-ramp climb/return landmarks use shared arc-length
       samples for both hardware and riding balls.                */
    var ramps = [
      {
        /* Left climbing shot, lower rear flyover, right upper-lane drop. */
        name: 'ROOTS ORBIT', z: 2.6 * K, kind: 'orbit', score: 22000,
        riseArtY: 5, returnArtY: 10, exitLift: 1,
        pts: [
          [X(22.0), Y(58.0)], [X(17.5), Y(49.0)], [X(14.0), Y(40.0)], [X(12.5), Y(32.0)],
          [X(13.0), Y(25.0)], [X(17.5), Y(16.0)], [X(26.0), Y(9.0)],
          [X(38.0), Y(5.0)], [X(52.0), Y(4.0)], [X(64.0), Y(4.2)],
          [X(68.0), Y(6.0)], [X(68.0), Y(11.0)], [X(68.0), Y(15.5)]
        ],
        enter: { x: X(22.0), y: Y(58.0), r: 2.4 * K }
      },
      {
        /* Right climbing shot, upper rear flyover, left upper-lane drop. */
        name: 'SKANK RAMP', z: 5.2 * K, kind: 'ramp', score: 34000,
        riseArtY: 5, returnArtY: 10, exitLift: 1,
        pts: [
          [X(78.0), Y(58.0)], [X(82.5), Y(49.0)], [X(86.0), Y(40.0)], [X(87.0), Y(32.0)],
          [X(85.5), Y(31.0)], [X(81.0), Y(22.0)], [X(73.0), Y(14.0)],
          [X(62.0), Y(7.5)], [X(50.0), Y(3.6)], [X(38.0), Y(3.0)],
          [X(29.0), Y(5.5)], [X(29.0), Y(11.0)], [X(29.0), Y(15.5)]
        ],
        enter: { x: X(78.0), y: Y(58.0), r: 2.4 * K }
      }
    ];

    /* Sample once by planar arc length. Physics and all ramp hardware
       consume these same points, rather than drawing a different spline. */
    ramps.forEach(function (r) {
      var curve = new THREE.CatmullRomCurve3(r.pts.map(function (p) {
        return new THREE.Vector3(p[0], p[1], 0);
      }), false, 'centripetal');
      curve.arcLengthDivisions = 512;
      var count = 240;
      r.pts = [];
      for (var i = 0; i <= count; i++) {
        var p = curve.getPointAt(i / count);
        r.pts.push([p.x, p.y]);
      }
      /* Landmarks occur on opposite sides of the rear turn. Keeping the
         whole rear turn level leaves genuine ball-sized headroom below. */
      var apex = r.pts.reduce(function (best, p, i) { return p[1] > r.pts[best][1] ? i : best; }, 0);
      var climb = r.pts.findIndex(function (p, i) { return i <= apex && p[1] >= Y(r.riseArtY); });
      var descend = r.pts.findIndex(function (p, i) { return i > apex && p[1] <= Y(r.returnArtY); });
      r.riseEnd = climb / count;
      r.returnStart = descend / count;
      r.enter.r = 1.0 * K;
      var entryDx = r.pts[1][0] - r.pts[0][0], entryDy = r.pts[1][1] - r.pts[0][1];
      var entryLength = Math.hypot(entryDx, entryDy);
      r.enter.tx = entryDx / entryLength; r.enter.ty = entryDy / entryLength;
      /* Mouth tolerance. The launch and flipper shots are faster than they
         used to be, and a faster ball crosses the mouth plane at a shallower
         effective angle, so a tight window cost shot positions (measured:
         ramp-scoring contact points fell from 4 to 2 per side). 0.78*K hands
         that forgiveness back without accepting a ball aimed wide of it. */
      r.enter.halfWidth = 0.78 * K; r.enter.depth = 1.25 * K;
    });

    /* ============ INSERT LAMPS ================================
       The artwork is covered in painted lamp lenses. Every one of
       these sits on a painted circle, so when a lamp lights the
       playfield reads exactly like the reference machine.
       z is optional: most lenses are flush, the shack's bracket
       lamps sit up on the tower.                                 */
    var lamps = [];
    function lamp(x, y, kind, group, r, z, big) {
      lamps.push({
        x: x, y: y, z: z === undefined ? 0.055 : z,
        kind: kind, group: group, r: r || 0.50,
        rx: r || 0.50, ry: r || 0.50,
        big: !!big, lit: 0, cur: 0, hot: 0
      });
    }

    /* Flush lenses measured on the CURRENT 318 x 584 artwork.
       Elliptical scales follow the painted rings even after a resize. */
    function insert(ax, ay, kind, group, radius) {
      radius = radius || 3.5;
      lamp(X(ax), Y(ay), kind, group, PF_W * radius / 100, 0.045 * K);
      var l = lamps[lamps.length - 1];
      l.rx = PF_W * radius / 100;
      l.ry = PF_H * radius * 318 / 584 / 100;
      l.art = { x: ax, y: ay, radius: radius };
    }

    /* the two top-lane rollovers: I and E */
    insert(35.8, 23.3, 'gold', 'lane', 3.0);
    insert(63.0, 23.3, 'gold', 'lane', 3.0);

    /* the shack's lamp bracket: three on top, three on the face */
    for (var sh = -1; sh <= 1; sh++) {
      lamp(SHACK.x + sh * 1.5 * K, SHACK.y, sh === 0 ? 'green' : 'red', 'shack', 0.19 * K, 2.86 * K);
    }
    insert(45.8, 24.0, 'gold', 'shack', 2.6);
    insert(52.8, 24.0, 'green', 'shack', 2.6);
    insert(49.5, 30.8, 'gold', 'shack', 1.5);

    /* one lens under each pop bumper */
    for (var b = 0; b < 3; b++) lamp(circles[b].x, circles[b].y, circles[b].color, 'bump', 0.66 * K, 0.05 * K, true);

    [[38.8,37.5,'gold'], [49.0,35.6,'green'], [59.0,37.5,'gold'], [49.0,40.8,'green']].forEach(function (p) {
      insert(p[0], p[1], p[2], 'drop');
    });
    [[62.8,29.8,'gold'], [67.5,46.8,'gold'], [68.0,52.2,'red']].forEach(function (p) {
      insert(p[0], p[1], p[2], 'stand');
    });

    /* Staggered medallions, not an invented rectangular light grid. */
    [[36.0,29.0,'green',3.2], [45.7,28.8,'red',3.0], [53.1,28.8,'green',3.0],
     [39.7,43.3,'gold'], [57.9,43.3,'gold'], [26.8,46.8,'green'],
     [49.0,46.2,'green'], [39.7,49.4,'red'], [57.7,49.4,'gold'],
     [29.6,52.3,'gold',3.0], [39.0,54.0,'green',3.2], [58.8,54.0,'gold',3.2],
     [38.8,31.4,'gold',1.1], [58.6,31.8,'gold',1.1],
     [34.0,56.0,'gold',1.2], [64.0,55.6,'gold',1.2]].forEach(function (p) {
      insert(p[0], p[1], p[2], 'grid', p[3]);
    });

    /* slingshots -- one lens just past each end of the live bar, so
       neither sits under the hardware. The bar leans in toward the
       flipper, so the lenses follow that lean. */
    insert(22.3, 68.8, 'red', 'sling', 3.6);
    insert(23.8, 74.0, 'green', 'sling', 3.6);
    insert(74.5, 68.8, 'red', 'sling', 3.6);
    insert(73.0, 74.0, 'green', 'sling', 3.6);

    /* inlanes, outlanes, spinner */
    insert(25.3, 78.5, 'red', 'inlane', 3.6);
    insert(71.5, 78.5, 'red', 'inlane', 3.6);
    insert(22.4, 84.0, 'gold', 'outlane', 2.0);
    insert(74.4, 84.0, 'gold', 'outlane', 2.0);
    insert(66.5, 10.5, 'gold', 'spinner', 2.2);

    /* ============ MISC ======================================== */
    var spawn = { x: (LANE_L + LANE_R) / 2, y: Y(83.6) };

    return {
      palette: PALETTE,
      segments: segments,
      circles: circles,
      targets: targets,
      slings: slings,
      flippers: flippers,
      ramps: ramps,
      spinner: spinner,
      rollovers: rollovers,
      lamps: lamps,
      shack: SHACK,
      kickback: kickback,
      spawn: spawn,
      lanes: { left: { out: LT_OUT, in: LT_IN }, right: { in: RT_IN, out: RT_OUT }, y0: Y(8.0), y1: Y(16.0) },
      W: PF_W, H: PF_H, K: K, centerX: CX, centerY: CY,
      artX: X, artY: Y,
      targetReset: { y: dropY, xs: dropXs, radius: 1.30 * K }
    };
  }

  global.PB = global.PB || {};
  global.PB.buildTable = buildTable;
  global.PB.PALETTE = PALETTE;
})(window);
