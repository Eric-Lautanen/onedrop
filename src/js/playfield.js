/* ============================================================
   ONE DROP PINBALL  --  playfield.js
   Builds every piece of hardware that sits on the playfield and
   animates it. game.js owns the rules; this module owns the iron.

   WHAT IT BUILDS
     walls      the painted rasta rails, capped with polished
                stainless tube -- that tube is what the ball hits
     wireforms  the two stainless ramps: twin rails, dense cross
                braces, vertical support posts, acrylic deck
     bumpers    three pop bumpers with lit skirts and brackets
     shack      the tiki bash tower, its face sampled straight out
                of the sprite atlas so the art is the real art
     targets    4 drop targets + 3 standups, with mountings
     flippers   ivory bats on chrome pivots with rubber bands
     slings     2 slingshots: body, rubber, kicker plate
     spinner    a real spinner -- plate on a horizontal axle
     posts      ivory posts with chrome caps
     inserts    43 lamp lenses drawn as two instanced meshes, so
                the whole playfield lights up for 2 draw calls
     plunger    rod, spring and knob lined up with the shooter lane

   COORDINATES. Table space, shared with table.js and physics.js:
     +X across, +Y flippers->arch, +Z up out of the playfield.
   The returned group is added to game.js's tilted table group, so
   children are positioned relative to (centerX, centerY).
   ============================================================ */
import './assets.js';
import * as THREE from './vendor/three.module.js';

(function (global) {
  'use strict';

  var T = THREE;
  /* light intensities are authored in r149's units -- see PB.LIT in table.js */
  var LIT = global.PB.LIT;
  var UP = new T.Vector3(0, 0, 1);
  var YAXIS = new T.Vector3(0, 1, 0);

  /* ---------- small helpers ---------- */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  var LAMP_COLORS = {
    red: 0xff3a52,
    gold: 0xffcf55,
    green: 0x39e07a
  };

  function build(opts) {
    var table = opts.table;
    var world = opts.world;
    var glowTex = opts.glowTex;
    var CX = table.centerX, CY = table.centerY;
    /* K rescales every absolute gauge below so the hardware keeps its
       proportions when the playfield is re-sized to fit a new cabinet. */
    var K = table.K || 1;
    var PAL = table.palette;
    var assets = global.PB.assets;

    var group = new T.Group();
    var owned = { geo: [], mat: [], tex: [] };
    function own(g) { owned.geo.push(g); return g; }
    function ownM(m) { owned.mat.push(m); return m; }
    function ownT(t) { owned.tex.push(t); return t; }

    /* geometry caches: repeated hardware shares one buffer */
    var cache = {};
    function boxGeo(w, h, d) {
      var k = 'b' + w + '_' + h + '_' + d;
      return cache[k] || (cache[k] = own(new T.BoxGeometry(w, h, d)));
    }
    function cylGeo(rt, rb, h, s) {
      var k = 'c' + rt + '_' + rb + '_' + h + '_' + s;
      return cache[k] || (cache[k] = own(new T.CylinderGeometry(rt, rb, h, s)));
    }
    function sphGeo(r, w, h) {
      var k = 's' + r + '_' + w + '_' + h;
      return cache[k] || (cache[k] = own(new T.SphereGeometry(r, w, h)));
    }
    function torGeo(r, t, a, b) {
      var k = 't' + r + '_' + t + '_' + a + '_' + b;
      return cache[k] || (cache[k] = own(new T.TorusGeometry(r, t, a, b)));
    }

    /* ---------- orientation ----------
       three.js builds CylinderGeometry and ConeGeometry standing along
       +Y, and TorusGeometry lying in the XY plane.  This playfield is
       Z-up (+Z is out of the wood, see the header), so:
         - a barrel/cone needs rotation.x = PI/2 to rise out of the
           floor; without it the barrel lies on its side and, seen from
           the player's view, reads as a triangle instead of a circle;
         - a ring already lies flat and needs NO rotation; giving it
           rotation.x = PI/2 stands it up perpendicular to the field.
       standUp() says the first once so no site can forget it. */
    var UPRIGHT = Math.PI / 2;
    function standUp(m) { m.rotation.x = UPRIGHT; return m; }

    /* ---------- the wireform height profile ----------
       A wireform ramp is not a flat ring parked in the air: the ball
       rolls up onto it. PB.rampRise smoothly eases the climb and
       descent, shared with physics.js. The rails, braces, acrylic deck
       and supports are all drawn to that same curve, so the ramp
       visibly climbs out of the playfield at its mouth and lands back on
       it at the far end. Without it the wireform is a flat ring on tall
       posts and the ball appears to jump up to reach it. */
    function rampRise(u) { return global.PB.rampRise(u); }

    /* ---------- colour space ----------
       three.js r149 stores a hex colour EXACTLY as passed and treats it
       as LINEAR -- it does not convert sRGB -> linear for you (that only
       arrived in later revisions). Everything in this project is
       authored in sRGB; the hexes are read straight off the sprite. So
       without this conversion every colour lands about a stop and a half
       too light once the renderer re-encodes to sRGB on output, and the
       whole playfield reads as a pale pink wash: the dark charcoal sling
       bodies came back mid grey and the red rubber came back mauve.
       Converting once, at build time, makes each hex mean what it says. */
    function srgb(c) {
      /* r186 converts a hex from sRGB to working space on construction,
         which is what this used to have to do by hand -- the function is
         kept because "this hex is its sRGB value" is worth saying at the
         call site, but there is nothing left to convert. */
      return new T.Color(c);
    }

    /* ---------- materials ---------- */
    function phys(color, o) {
      o = o || {};
      return ownM(new T.MeshPhysicalMaterial({
        color: srgb(color),
        metalness: o.metalness === undefined ? 0 : o.metalness,
        roughness: o.roughness === undefined ? 0.5 : o.roughness,
        clearcoat: o.clearcoat === undefined ? 0 : o.clearcoat,
        clearcoatRoughness: o.ccRough === undefined ? 0.1 : o.ccRough,
        emissive: srgb(o.emissive === undefined ? 0x000000 : o.emissive),
        emissiveIntensity: o.ei === undefined ? 1 : o.ei,
        transparent: !!o.transparent,
        opacity: o.opacity === undefined ? 1 : o.opacity,
        side: o.side || T.FrontSide,
        envMapIntensity: o.env === undefined ? 1 : o.env,
        depthWrite: o.depthWrite === undefined ? true : o.depthWrite
      }));
    }
    function std(color, o) {
      o = o || {};
      return ownM(new T.MeshStandardMaterial({
        color: srgb(color),
        metalness: o.metalness === undefined ? 0.35 : o.metalness,
        roughness: o.roughness === undefined ? 0.5 : o.roughness,
        emissive: srgb(o.emissive === undefined ? 0x000000 : o.emissive),
        emissiveIntensity: o.ei === undefined ? 1 : o.ei,
        transparent: !!o.transparent,
        opacity: o.opacity === undefined ? 1 : o.opacity,
        side: o.side || T.FrontSide,
        map: o.map || null,
        envMapIntensity: o.env === undefined ? 1 : o.env,
        depthWrite: o.depthWrite === undefined ? true : o.depthWrite
      }));
    }

    /* polished stainless: the wireform / cap-rail look */
    var STEEL = phys(0xeaf0f8, { metalness: 1, roughness: 0.13, clearcoat: 1, ccRough: 0.05, env: 1.7 });
    var STEEL_DULL = std(0x8f99a6, { metalness: 0.95, roughness: 0.34, env: 1.2 });
    var CHROME = phys(0xf4f8ff, { metalness: 1, roughness: 0.07, clearcoat: 1, ccRough: 0.03, env: 1.9 });
    var DARKMETAL = std(0x1a1f26, { metalness: 0.8, roughness: 0.38, env: 1.1 });
    var WALLBODY = std(0x171c22, { metalness: 0.55, roughness: 0.45, env: 0.9 });
    var IVORY = std(0xf2ead2, { metalness: 0.18, roughness: 0.52 });
    var RUBBER = std(0x2a2f36, { metalness: 0.15, roughness: 0.78 });
    var REDRUBBER = std(0x8e1424, { metalness: 0.18, roughness: 0.66, emissive: PAL.red, ei: 0.10 });
    var WOOD = std(0x3a2415, { metalness: 0.1, roughness: 0.72 });
    var WOOD_LIT = std(0x5c3a20, { metalness: 0.1, roughness: 0.66 });
    var THATCH = std(0x8a6a2c, { metalness: 0.05, roughness: 0.85 });
    var SMOKE = std(0x0d1013, { metalness: 0.5, roughness: 0.42, env: 1.0 });

    /* three shared neon materials drive the rasta chase along the
       walls, so every rail pulses without needing its own material */
    var NEON = [
      std(PAL.red, { emissive: PAL.red, ei: 0.9, metalness: 0, roughness: 0.45 }),
      std(PAL.gold, { emissive: PAL.gold, ei: 0.9, metalness: 0, roughness: 0.45 }),
      std(PAL.green, { emissive: PAL.green, ei: 0.9, metalness: 0, roughness: 0.45 })
    ];

    /* ==========================================================
       1. WALLS
       ========================================================== */
    var neonStrips = [];
    (function buildWalls() {
      /* One continuous swept arch instead of dozens of overlapping
         cylinder caps and box corners at every collision segment. */
      ['arch', 'returnL', 'returnR'].forEach(function (kind) {
        var run = table.segments.filter(function (s) { return s.kind === kind; });
        if (!run.length) return;
        var h = (kind === 'arch' ? 1.28 : 0.64) * K;
        var ap = [new T.Vector3(run[0].ax - CX, run[0].ay - CY, h)];
        run.forEach(function (s) { ap.push(new T.Vector3(s.bx - CX, s.by - CY, h)); });
        var ac = new T.CatmullRomCurve3(ap, false, 'centripetal');
        group.add(new T.Mesh(own(new T.TubeGeometry(ac, 180, 0.155 * K, 10, false)), STEEL));
        var lower = new T.Mesh(own(new T.TubeGeometry(ac, 180, 0.07 * K, 8, false)), STEEL_DULL);
        lower.position.z = -0.40 * K;
        group.add(lower);
      });
      table.segments.forEach(function (s, i) {
        if (s.kind === 'arch' || s.kind === 'returnL' || s.kind === 'returnR') return;
        var dx = s.bx - s.ax, dy = s.by - s.ay;
        var len = Math.hypot(dx, dy);
        if (len < 0.03) return;
        var ang = Math.atan2(dy, dx);
        var mx = (s.ax + s.bx) / 2 - CX, my = (s.ay + s.by) / 2 - CY;

        var isRail = (s.kind === 'rail' || s.kind === 'arch');
        var isLane = (s.kind === 'lane' || s.kind === 'divider');
        var h = (isRail ? 1.24 : (isLane ? 1.00 : 0.86)) * K;
        var thick = (isRail ? 0.34 : 0.28) * K;

        /* the wall body: dark, low, and mostly hidden by the cap */
        var body = new T.Mesh(boxGeo(len + thick * 0.6, thick, h), WALLBODY);
        body.position.set(mx, my, h / 2);
        body.rotation.z = ang;
        group.add(body);

        /* the polished cap tube: this is the surface the ball touches */
        var cap = new T.Mesh(cylGeo(0.155 * K, 0.155 * K, len + thick * 0.6, 10), STEEL);
        cap.position.set(mx, my, h + 0.04 * K);
        cap.rotation.z = ang - Math.PI / 2;
        group.add(cap);

        /* a chrome skirt under the cap so the wall reads as steel */
        var skirt = new T.Mesh(boxGeo(len + thick * 0.6, 0.06 * K, 0.30 * K), STEEL_DULL);
        skirt.position.set(mx, my, h - 0.20 * K);
        skirt.rotation.z = ang;
        group.add(skirt);

        /* the rasta lane guide, lit along the base of every rail */
        if (isRail) {
          var neon = new T.Mesh(boxGeo(len + thick * 0.6, 0.055 * K, 0.085 * K), NEON[i % 3]);
          neon.position.set(mx, my, h - 0.52 * K);
          neon.rotation.z = ang;
          group.add(neon);
          neonStrips.push(neon);
        }

        /* little stainless feet where a rail meets the playfield */
        if (isRail && len > 3 * K) {
          var n = Math.max(2, Math.round(len / (6 * K)));
          for (var f = 0; f <= n; f++) {
            var t = f / n;
            var fx = lerp(s.ax, s.bx, t) - CX, fy = lerp(s.ay, s.by, t) - CY;
            var post = new T.Mesh(cylGeo(0.085 * K, 0.085 * K, h, 7), STEEL_DULL);
            standUp(post);
            post.position.set(fx, fy, h / 2);
            group.add(post);
          }
        }
      });
    })();

    /* ==========================================================
       2. WIREFORM RAMPS
       Elevated flyovers with half-moon baskets, lower rolling wires,
       and perimeter-mounted cantilevers instead of posts in live lanes.
       ========================================================== */
    var HALF_W = 0.78 * K;                  /* deck half width */
    var wireforms = [];

    (function buildRamps() {
      table.ramps.forEach(function (r, ri) {
        var raw = r.pts;
        var n = raw.length;

        /* height along the path, on the ball's own profile */
        function zAt(u) { return r.z * global.PB.rampRise(u, r); }
        function uOf(i) { return i / (n - 1); }

        /* centre control points in group space, lifted to the profile */
        var ctrl = raw.map(function (p, i) {
          return new T.Vector3(p[0] - CX, p[1] - CY, zAt(uOf(i)));
        });

        /* horizontal normals at every control point */
        function normalAt(i) {
          var a = raw[Math.max(0, i - 1)], b = raw[Math.min(n - 1, i + 1)];
          var dx = b[0] - a[0], dy = b[1] - a[1];
          var l = Math.hypot(dx, dy) || 1;
          return { x: -dy / l, y: dx / l };
        }

        /* Piecewise shared samples: arc-length u means the same thing
           here as it does for the riding ball in physics.js. */
        function sampledCurve(side, lift) {
          var curve = new T.Curve();
          curve.getPoint = function (u, target) {
            target = target || new T.Vector3();
            var f = clamp(u, 0, 1) * (n - 1);
            var i = Math.min(n - 2, Math.floor(f)), t = f - i;
            var nm = normalAt(i), nm2 = normalAt(i + 1);
            var nx = lerp(nm.x, nm2.x, t), ny = lerp(nm.y, nm2.y, t);
            var nl = Math.hypot(nx, ny) || 1;
            return target.set(lerp(ctrl[i].x, ctrl[i + 1].x, t) + nx / nl * HALF_W * side,
              lerp(ctrl[i].y, ctrl[i + 1].y, t) + ny / nl * HALF_W * side,
              zAt(u) + (lift || 0));
          };
          /* Do not reparameterize by 3D arc length: the ball uses planar
             distance, and the braces/deck must stay on that same rail. */
          curve.getPointAt = curve.getPoint;
          curve.getTangentAt = function (u) { return curve.getTangent(u); };
          return curve;
        }

        /* the two rails: the control points pushed out sideways */
        function railCurve(side) { return sampledCurve(side, HALF_W); }
        var curveL = railCurve(-1), curveR = railCurve(1);
        var centre = sampledCurve(0, 0);
        var approxLen = centre.getLength();
        var segs = clamp(Math.round(approxLen * 5), 32, 190);

        /* --- rails --- */
        var railGeo = own(new T.TubeGeometry(curveL, segs, 0.095 * K, 9, false));
        var railGeo2 = own(new T.TubeGeometry(curveR, segs, 0.095 * K, 9, false));
        group.add(new T.Mesh(railGeo, STEEL));
        group.add(new T.Mesh(railGeo2, STEEL));

        /* Half-moon cradles: both ends welded directly to the side
           rails, with the belly at the ball's rolling surface. A shared
           instanced tube keeps this curved hardware to one draw call. */
        var cradle = new T.Curve();
        cradle.getPoint = function (u, target) {
          target = target || new T.Vector3();
          var a = Math.PI * u;
          return target.set(-HALF_W * Math.cos(a), 0, HALF_W * (1 - Math.sin(a)));
        };
        var braceCount = clamp(Math.round(approxLen / (1.8 * K)), 8, 40);
        var braceGeo = own(new T.TubeGeometry(cradle, 24, 0.055 * K, 8, false));
        var baskets = new T.InstancedMesh(braceGeo, STEEL, braceCount);
        baskets.name = 'half-moon ramp cradles';
        baskets.frustumCulled = false;
        var mount = new T.Object3D();
        for (var bi = 0; bi < braceCount; bi++) {
          var u = (bi + 0.5) / braceCount;
          var p = centre.getPointAt(u);
          var rail = curveR.getPoint(u);
          /* Use the very same interpolated normal as the rail, not a
             finite-difference tangent which drifts at tight bends. */
          mount.position.copy(p);
          mount.rotation.set(0, 0, Math.atan2(rail.y - p.y, rail.x - p.x));
          mount.updateMatrix();
          baskets.setMatrixAt(bi, mount.matrix);
        }
        baskets.instanceMatrix.needsUpdate = true;
        group.add(baskets);
        /* Two lower running wires support the sphere between cradles. */
        [-0.48, 0.48].forEach(function (side) {
          var lift = HALF_W * (1 - Math.sqrt(1 - side * side));
          group.add(new T.Mesh(own(new T.TubeGeometry(sampledCurve(side, lift), segs, 0.06 * K, 8, false)), STEEL));
        });

        /* Sparse perimeter cantilevers: leave the rear lanes entirely
           open underneath, rather than peppering them with standoffs. */
        var postCount = 5;
        var supports = [];
        var laneL = table.lanes.left, laneR = table.lanes.right;
        var S = table.shack;
        for (var pi = 0; pi < postCount; pi++) {
          var pu = [0.13, 0.23, 0.76, 0.86, 0.94][pi];
          var pp = centre.getPointAt(pu);
          var wx = pp.x + CX, wy = pp.y + CY;
          /* Rear flyovers bridge between the side mounts. Do not add a
             long cross-field cantilever through their open drop exits. */
          if (wy > table.artY(25)) continue;
          /* never stand a post inside a top lane or inside the shack */
          var inLane = (wx > laneL.out - 0.5 * K && wx < laneL.in + 0.5 * K && wy > table.lanes.y1 - 0.5 * K) ||
                       (wx > laneR.in - 0.5 * K && wx < laneR.out + 0.5 * K && wy > table.lanes.y1 - 0.5 * K);
          var inShack = Math.hypot(wx - S.x, wy - S.y) < S.r + 0.5 * K;
          if (inLane || inShack) continue;
          /* the post runs from the wood up to wherever the deck is at
             this point -- near the mouth that is almost nothing, and a
             stub of a post is just clutter, so skip it */
          var pt = centre.getTangentAt(pu);
          var pn = Math.hypot(pt.x, pt.y) || 1;
          /* Supports sit beneath the OUTER rail, never in the ball track. */
          pp.x += -pt.y / pn * HALF_W * (ri === 0 ? 1 : -1);
          pp.y += pt.x / pn * HALF_W * (ri === 0 ? 1 : -1);
          var pz = pp.z + HALF_W;
          if (pz < 0.35 * K) continue;
          var anchorX = (wx < CX ? -table.W / 2 : table.W / 2) + (wx < CX ? 0.24 : -0.24) * K;
          var post = new T.Mesh(cylGeo(0.085 * K, 0.10 * K, pz, 8), STEEL_DULL);
          standUp(post);
          post.position.set(anchorX, pp.y, pz / 2);
          group.add(post);
          var armPath = new T.LineCurve3(new T.Vector3(anchorX, pp.y, pz), new T.Vector3(pp.x, pp.y, pz));
          var arm = new T.Mesh(own(new T.TubeGeometry(armPath, 1, 0.085 * K, 8, false)), STEEL_DULL);
          arm.name = 'perimeter ramp cantilever';
          group.add(arm);
          supports.push({ x: anchorX + CX, y: wy, z: pz, endX: pp.x + CX, endY: pp.y + CY });
          var foot = new T.Mesh(cylGeo(0.20 * K, 0.24 * K, 0.10 * K, 10), DARKMETAL);
          standUp(foot);
          foot.position.set(anchorX, pp.y, 0.05 * K);
          group.add(foot);
        }

        /* Open wire basket, no flat acrylic strip masking the cradle. */
        var SAMPLES = segs;

        /* --- the mouth: two flared entry wires guiding the ball in --- */
        var m0 = centre.getPointAt(0);
        var m1 = centre.getPointAt(Math.min(0.06, 1 / SAMPLES));
        var mdx = m1.x - m0.x, mdy = m1.y - m0.y;
        var ml = Math.hypot(mdx, mdy) || 1;
        var mnx = -mdy / ml, mny = mdx / ml;
        var mnrm = new T.Vector3(mnx, mny, 0);
        for (var side = -1; side <= 1; side += 2) {
          var end = (side < 0 ? curveL : curveR).getPoint(0);
          var start = end.clone().add(new T.Vector3(
            -mdx / ml * 1.25 * K + mnx * side * 0.35 * K,
            -mdy / ml * 1.25 * K + mny * side * 0.35 * K, 0));
          var join = end.clone().add(new T.Vector3(-mdx / ml * 0.45 * K, -mdy / ml * 0.45 * K, 0));
          var flare = new T.CatmullRomCurve3([start, join, end], false, 'centripetal');
          group.add(new T.Mesh(own(new T.TubeGeometry(flare, 20, 0.095 * K, 9, false)), STEEL));
        }

        /* --- a soft glowing under-run so the wireform reads as lit --- */
        var lit = ownM(new T.MeshBasicMaterial({
          color: srgb(ri === 0 ? 0xffb44a : 0x59d8ff),
          transparent: true, opacity: 0.30, depthWrite: false,
          blending: T.AdditiveBlending, toneMapped: false
        }));
        var litGeo = own(new T.TubeGeometry(centre, segs, 0.30 * K, 7, false));
        var litMesh = new T.Mesh(litGeo, lit);
        litMesh.position.z = -0.05 * K;
        litMesh.renderOrder = 4;
        group.add(litMesh);

        litMesh.visible = false;  /* no glowing pipe obscuring the ball lane */
        wireforms.push({ glow: lit, base: 0.06, name: r.name,
          cradle: cradle, baskets: baskets, left: curveL, right: curveR, centre: centre, supports: supports });
      });
    })();

    /* ==========================================================
       3. POP BUMPERS
       ========================================================== */
    var bumpers = [];
    (function buildBumpers() {
      table.circles.forEach(function (c, i) {
        if (c.type !== 'bumper') return;
        var col = PAL[c.color];
        var glowCol = LAMP_COLORS[c.color];
        var g = new T.Group();
        g.position.set(c.x - CX, c.y - CY, 0);

        /* base plate -- a disc resting on the wood */
        var base = new T.Mesh(cylGeo(c.r * 1.20, c.r * 1.26, 0.16 * K, 26), DARKMETAL);
        standUp(base);
        base.position.z = 0.08 * K; g.add(base);

        /* the lit skirt -- the lamp ring around the bumper body.
           Kept low-emissive on purpose: the playfield runs ACES tone
           mapping at exposure 1.2 under a 1.35 key, so an emissive
           skirt at 0.35 clips and the whole cluster reads as one pale
           pink wash instead of three coloured bumpers. */
        var skirtMat = ownM(new T.MeshStandardMaterial({
          color: srgb(col), emissive: srgb(glowCol), emissiveIntensity: 0.20,
          metalness: 0.1, roughness: 0.45, transparent: true, opacity: 0.95
        }));
        var skirt = new T.Mesh(cylGeo(c.r * 1.06, c.r * 1.20, 0.34 * K, 26), skirtMat);
        standUp(skirt);
        skirt.position.z = 0.32 * K; g.add(skirt);

        /* white plastic body */
        var body = new T.Mesh(cylGeo(c.r * 0.74, c.r * 0.98, 0.46 * K, 26), IVORY);
        standUp(body);
        body.position.z = 0.68 * K; g.add(body);

        /* the mushroom cap */
        var cap = new T.Mesh(sphGeo(c.r * 0.70, 22, 14), ownM(new T.MeshStandardMaterial({
          color: srgb(col), emissive: srgb(glowCol), emissiveIntensity: 0.26,
          metalness: 0.18, roughness: 0.35
        })));
        cap.position.z = 0.98 * K; cap.scale.z = 0.62; g.add(cap);

        /* chrome hat ring -- lies flat round the cap, no rotation */
        var ring = new T.Mesh(torGeo(c.r * 0.56, 0.075 * K, 8, 26), CHROME);
        ring.position.z = 1.06 * K; g.add(ring);

        /* three bracket rods down to the playfield -- vertical posts,
           not rails lying across the cluster */
        for (var k = 0; k < 3; k++) {
          var a = k / 3 * Math.PI * 2 + 0.5;
          var rod = new T.Mesh(cylGeo(0.05 * K, 0.05 * K, 1.02 * K, 7), CHROME);
          standUp(rod);
          rod.position.set(Math.cos(a) * c.r * 1.14, Math.sin(a) * c.r * 1.14, 0.51 * K);
          g.add(rod);
        }

        /* bloom + a real point light that flashes on a hit.
           The sprite used to be 5.4x the bumper radius -- 7.1 u across
           on a 25.9 u field, so three of them overlapped into a single
           pale disc that swallowed the painted medallions underneath
           and made the cluster look twice its size. */
        var glow = new T.Sprite(new T.SpriteMaterial({
          map: glowTex, color: srgb(glowCol), transparent: true,
          blending: T.AdditiveBlending, depthWrite: false, opacity: 0.20
        }));
        ownM(glow.material);
        glow.scale.set(c.r * 2.1, c.r * 2.1, 1);
        glow.position.z = 0.90 * K;
        glow.renderOrder = 6;
        g.add(glow);

        var light = new T.PointLight(srgb(glowCol), LIT(0), 16 * K, 2);
        light.position.z = 2.2 * K;
        g.add(light);

        group.add(g);
        bumpers.push({
          i: i, group: g, glow: glow, skirt: skirtMat, cap: cap.material,
          ring: ring.material, light: light, flash: 0, lamp: null
        });
      });
    })();

    /* ==========================================================
       4. THE TIKI SHACK  (bash toy)
       A wooden tower standing proud of the playfield. Its face is
       the real sprite-atlas artwork, cropped and mapped on, so the
       tiki mask is the painted one -- just built up in 3D.
       ========================================================== */
    var shackGroup = new T.Group();
    var shackFaceMats = [];
    var shackLanterns = [], shackEyes = [], shackJaw = null;
    var faceJobs = [];          /* re-runnable crops, for late atlas loads */
    (function buildShack() {
      var S = table.shack;
      shackGroup.position.set(S.x - CX, S.y - CY, 0);

      /* Sample a rectangle of the playfield art as a texture.
         ax/ay/aw/ah are in ART PERCENT. The draw is kept as a job so
         it can be re-run the moment the sprite atlas finishes
         decoding -- build() may well have run before the sheet did. */
      function faceTexture(ax, ay, aw, ah) {
        var c = document.createElement('canvas');
        c.width = 256;
        c.height = Math.max(64, Math.round(256 * (ah / aw) * (table.W / table.H)));
        var x = c.getContext('2d');
        function draw() {
          x.setTransform(1, 0, 0, 1, 0, 0);
          x.fillStyle = '#3a2415';
          x.fillRect(0, 0, c.width, c.height);
          /* a little plank striping so the fallback still reads as wood */
          x.fillStyle = 'rgba(255,220,170,0.06)';
          for (var p = 0; p < c.width; p += 18) x.fillRect(p, 0, 2, c.height);
          if (assets && assets.ready && assets.image && assets.rectPx) {
            var pr = assets.rectPx('playfield');
            if (pr) {
              x.drawImage(assets.image,
                pr.sx + pr.sw * (ax / 100), pr.sy + pr.sh * (ay / 100),
                pr.sw * (aw / 100), pr.sh * (ah / 100),
                0, 0, c.width, c.height);
            }
          }
        }
        draw();
        var tx = ownT(new T.CanvasTexture(c));
        if ('colorSpace' in tx) tx.colorSpace = T.SRGBColorSpace;
        faceJobs.push({ draw: draw, tex: tx });
        return tx;
      }

      /* round plinth, sized to the physical bash circle */
      var plinth = new T.Mesh(cylGeo(S.r, S.r * 1.08, 0.40 * K, 28), WOOD);
      standUp(plinth);
      plinth.position.z = 0.20 * K; shackGroup.add(plinth);
      var plinthRim = new T.Mesh(torGeo(S.r * 1.0, 0.07 * K, 8, 28), CHROME);
      plinthRim.position.z = 0.40 * K; shackGroup.add(plinthRim);

      /* plank tower body. Everything is kept under z ~3.1 so the whole
         bash toy stays below the cabinet's side rails. */
      var TW = 3.05 * K, TD = 2.25 * K, TH = 1.00 * K;
      var tower = new T.Mesh(boxGeo(TW, TD, TH), WOOD);
      tower.position.z = 0.40 * K + TH / 2; shackGroup.add(tower);
      /* vertical plank shadowing so it reads as timber */
      for (var s2 = -1; s2 <= 1; s2++) {
        var plank = new T.Mesh(boxGeo(0.10 * K, TD + 0.02, TH * 0.92), WOOD_LIT);
        plank.position.set(s2 * TW * 0.30, 0, 0.40 * K + TH / 2);
        shackGroup.add(plank);
      }

      /* the tiki mask, cut from the painted playfield */
      var tikiTex = faceTexture(43.0, 14.2, 13.0, 6.0);
      var tikiMat = ownM(new T.MeshStandardMaterial({
        map: tikiTex, roughness: 0.62, metalness: 0.05,
        emissive: 0xffffff, emissiveMap: tikiTex, emissiveIntensity: 0.22
      }));
      shackFaceMats.push(tikiMat);
      var tiki = new T.Mesh(boxGeo(2.45 * K, 0.14 * K, 1.02 * K), [WOOD, WOOD, WOOD, tikiMat, WOOD, WOOD]);
      tiki.position.set(0, -TD / 2 - 0.07 * K, 0.40 * K + TH / 2);
      shackGroup.add(tiki);

      /* the ONEDROP sign board above it */
      var signTex = faceTexture(42.0, 11.5, 15.0, 3.4);
      var signMat = ownM(new T.MeshStandardMaterial({
        map: signTex, roughness: 0.5, metalness: 0.1,
        emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.42
      }));
      shackFaceMats.push(signMat);
      var sign = new T.Mesh(boxGeo(3.05 * K, 0.14 * K, 0.62 * K), [WOOD, WOOD, WOOD, signMat, WOOD, WOOD]);
      sign.position.set(0, -TD / 2 - 0.07 * K, 0.40 * K + TH + 0.34 * K);
      shackGroup.add(sign);

      /* thatched hip roof -- a cone, so it needs standing up too; the
         eighth-turn yaw just lines the facets up with the tower */
      var roof = new T.Mesh(own(new T.ConeGeometry(S.r * 1.05, 0.62 * K, 8)), THATCH);
      roof.position.z = 0.40 * K + TH + 0.99 * K;
      standUp(roof);
      roof.rotateOnWorldAxis(UP, Math.PI / 8);
      shackGroup.add(roof);
      var roofRim = new T.Mesh(torGeo(S.r * 1.02, 0.055 * K, 8, 26), CHROME);
      roofRim.position.z = 0.40 * K + TH + 0.70 * K;
      shackGroup.add(roofRim);

      /* the lamp bracket crowning the tower */
      var bar = new T.Mesh(cylGeo(0.075 * K, 0.075 * K, 3.6 * K, 10), CHROME);
      bar.position.set(0, 0, 0.40 * K + TH + 1.42 * K);
      bar.rotation.z = Math.PI / 2;
      shackGroup.add(bar);
      for (var b2 = -1; b2 <= 1; b2++) {
        var st = new T.Mesh(cylGeo(0.05 * K, 0.05 * K, 0.50 * K, 7), CHROME);
        standUp(st);
        st.position.set(b2 * 1.5 * K, 0, 0.40 * K + TH + 1.17 * K);
        shackGroup.add(st);
      }

      /* A proper island pavilion: bamboo corner columns, raftered
         layered roof, carved mask, veranda and warm hanging lanterns. */
      var BRASS = phys(0xb9873f, { metalness: 0.8, roughness: 0.27 });
      function beam(a, b, radius, material) {
        var delta = b.clone().sub(a);
        var m = new T.Mesh(cylGeo(radius, radius, delta.length(), 10), material);
        m.position.copy(a).add(b).multiplyScalar(0.5);
        m.quaternion.setFromUnitVectors(YAXIS, delta.normalize());
        shackGroup.add(m); return m;
      }
      [-1, 1].forEach(function (sx) {
        [-1, 1].forEach(function (sy) {
          var px = sx * TW * 0.44, py = sy * TD * 0.42;
          beam(new T.Vector3(px, py, 0.35*K), new T.Vector3(px, py, 2.12*K), 0.12*K, WOOD_LIT);
          for (var joint = 0; joint < 4; joint++) {
            var collar = new T.Mesh(torGeo(0.125*K, 0.025*K, 6, 12), BRASS);
            collar.position.set(px, py, (0.55 + joint*0.40)*K); shackGroup.add(collar);
          }
        });
        var lanternMat = std(0xffc572, { emissive: 0xffa43b, ei: 0.6, metalness: 0.05, roughness: 0.3 });
        var lantern = new T.Mesh(sphGeo(0.19*K, 16, 12), lanternMat);
        lantern.scale.z = 1.4;
        lantern.position.set(sx*1.48*K, -TD/2-0.16*K, 1.60*K);
        shackGroup.add(lantern); shackLanterns.push(lanternMat);
        beam(lantern.position.clone().add(new T.Vector3(0,0,0.22*K)), lantern.position.clone().add(new T.Vector3(0,0,0.48*K)), 0.025*K, BRASS);
        /* Carved brows and jewel eyes on the strike face. */
        var eyeMat = std(0x4ecb92, { emissive: PAL.green, ei: 0.4, metalness: 0.25, roughness: 0.25 });
        var eye = new T.Mesh(sphGeo(0.13*K, 14, 10), eyeMat);
        eye.scale.y = 0.48;
        eye.position.set(sx*0.48*K, -TD/2-0.19*K, 1.12*K);
        shackGroup.add(eye); shackEyes.push(eyeMat);
        beam(new T.Vector3(sx*0.72*K,-TD/2-0.23*K,1.32*K), new T.Vector3(sx*0.24*K,-TD/2-0.23*K,1.22*K),0.065*K,WOOD_LIT);
      });
      /* Roof courses and radial straw ribs, rather than a plain cone. */
      for (var course = 0; course < 5; course++) {
        var radius = S.r*1.05*(1-course*0.17);
        var trim = new T.Mesh(torGeo(radius,0.035*K,6,40),WOOD_LIT);
        trim.position.z=(2.10+course*0.12)*K; shackGroup.add(trim);
      }
      for (var reed = 0; reed < 32; reed++) {
        var a = reed/32*Math.PI*2;
        beam(new T.Vector3(Math.cos(a)*S.r*1.03,Math.sin(a)*S.r*1.03,2.10*K),
          new T.Vector3(Math.cos(a)*0.18*K,Math.sin(a)*0.18*K,2.68*K),0.025*K,WOOD_LIT);
      }
      var porch = new T.Mesh(boxGeo(2.65*K,0.45*K,0.16*K),WOOD_LIT);
      porch.position.set(0,-TD/2-0.20*K,0.32*K);shackGroup.add(porch);
      shackJaw = new T.Mesh(boxGeo(1.22*K,0.16*K,0.20*K),WOOD_LIT);
      shackJaw.position.set(0,-TD/2-0.23*K,0.68*K);shackGroup.add(shackJaw);
      var nose = new T.Mesh(sphGeo(0.22*K,12,10),BRASS);
      nose.scale.set(0.65,0.8,1.3);nose.position.set(0,-TD/2-0.25*K,0.96*K);shackGroup.add(nose);
      group.add(shackGroup);
    })();

    /* ==========================================================
       5. TARGETS  (drop bank + standups)
       ========================================================== */
    var targetObjs = [];
    (function buildTargets() {
      table.targets.forEach(function (t, i) {
        var isDrop = t.drop;
        var g = new T.Group();
        g.position.set(t.cx - CX, t.cy - CY, 0);

        /* the mounting bracket is shared; the face is what moves */
        var bracket = new T.Mesh(
          isDrop ? boxGeo(1.30 * K, 0.36 * K, 0.26 * K) : boxGeo(0.36 * K, 1.40 * K, 0.26 * K),
          DARKMETAL
        );
        bracket.position.z = (isDrop ? 0.16 : 0.68) * K;
        g.add(bracket);

        var faceCol = isDrop ? PAL.red : PAL.green;
        var faceMat = ownM(new T.MeshStandardMaterial({
          color: srgb(faceCol), emissive: srgb(faceCol), emissiveIntensity: 0.12,
          metalness: 0.18, roughness: 0.42
        }));
        var face = new T.Mesh(
          isDrop ? boxGeo(1.12 * K, 0.30 * K, 0.86 * K) : boxGeo(0.30 * K, 1.16 * K, 0.86 * K),
          faceMat
        );
        g.add(face);

        /* ivory stripe across the strike face */
        var stripeMat = ownM(new T.MeshStandardMaterial({
          color: srgb(PAL.ivory), emissive: srgb(isDrop ? PAL.gold : PAL.green),
          emissiveIntensity: 0.25, metalness: 0.3, roughness: 0.4
        }));
        var stripe = new T.Mesh(
          isDrop ? boxGeo(1.16 * K, 0.09 * K, 0.10 * K) : boxGeo(0.09 * K, 1.22 * K, 0.10 * K),
          stripeMat
        );
        g.add(stripe);

        group.add(g);
        var restZ = (isDrop ? 0.46 : 0.60) * K;
        face.position.z = restZ;
        stripe.position.z = restZ + 0.44 * K;
        targetObjs.push({
          i: i, group: g, face: face, stripe: stripe, drop: isDrop,
          faceMat: faceMat, stripeMat: stripeMat, flash: 0, restZ: restZ
        });
      });
    })();

    /* ==========================================================
       6. FLIPPERS
       ========================================================== */
    world.flippers.forEach(function (f) {
      var g = new T.Group();
      g.position.set(f.px - CX, f.py - CY, 0);

      /* ivory bat */
      var bat = new T.Mesh(own(new T.CapsuleGeometry(f.rad, f.len, 10, 20)), IVORY);
      bat.rotation.z = -Math.PI / 2;
      bat.position.set(f.len / 2, 0, 0.56 * K);
      bat.scale.set(1, 1, 1.05);
      g.add(bat);

      /* red rubber band wrapped round the bat */
      var rub = new T.Mesh(own(new T.CapsuleGeometry(f.rad + 0.075 * K, f.len, 10, 20)), REDRUBBER);
      rub.rotation.z = -Math.PI / 2;
      rub.position.set(f.len / 2, 0, 0.56 * K);
      rub.scale.set(1, 1, 0.42);
      g.add(rub);

      /* pivot boss + screw */
      var boss = new T.Mesh(cylGeo(f.rad * 1.05, f.rad * 1.15, 0.30 * K, 16), DARKMETAL);
      standUp(boss);
      boss.position.z = 0.60 * K; g.add(boss);
      var screw = new T.Mesh(cylGeo(0.14 * K, 0.14 * K, 0.14 * K, 10), CHROME);
      standUp(screw);
      screw.position.z = 0.80 * K; g.add(screw);

      group.add(g);
      f.mesh = g;
    });

    /* ==========================================================
       7. SLINGSHOTS
       A skinny rounded bar laid along the painted rail, not a wedge.
       The artwork runs a long narrow rounded-end rail down each side
       (art x ~11.5..15.5, y ~61..78) and the hardware is a capsule
       standing on it, swung in at the flipper end so the rubber faces
       back at the flipper the way a real sling does.
       The whole bar is one group rotated about Z, so its LOCAL +X is
       always "into the field" and +Y is always "up the field" -- which
       is why the rubber and the kicker plate need no per-side sign.
       ========================================================== */
    var slingObjs = [];
    (function buildSlings() {
      table.slings.forEach(function (s, i) {
        var g = new T.Group();
        g.position.set((s.tx + s.hx) / 2 - CX, (s.ty + s.hy) / 2 - CY, 0);
        /* Aim the group's +X at the bar's own inward normal. That makes
           +X "into the field" and +Y "along the bar" for BOTH slings,
           so the rubber and the kicker plate need no per-side sign --
           which a plain atan2(dx,-dy) does not give you, since the two
           bars lean opposite ways. */
        g.rotation.z = Math.atan2(s.ny, s.nx);

        var half = s.w / 2;
        var mid = Math.max(0.01, s.len - s.w);

        var bodyMat = ownM(new T.MeshStandardMaterial({
          color: srgb(0x15191e), metalness: 0.34, roughness: 0.52,
          emissive: srgb(PAL.red), emissiveIntensity: 0.03
        }));
        var rubberMat = ownM(new T.MeshStandardMaterial({
          color: srgb(0x8e1424), metalness: 0.06, roughness: 0.74,
          emissive: srgb(PAL.red), emissiveIntensity: 0.06
        }));
        var kickerMat = ownM(new T.MeshStandardMaterial({
          color: srgb(PAL.gold), emissive: srgb(PAL.gold), emissiveIntensity: 0.42,
          metalness: 0.5, roughness: 0.3
        }));

        /* the bar itself -- rounded both ends, sat on the wood */
        var body = new T.Mesh(own(new T.CapsuleGeometry(half, mid, 8, 20)), bodyMat);
        body.position.z = half;
        g.add(body);

        /* the live rubber, proud of the face that points into the field */
        var rub = new T.Mesh(
          own(new T.CapsuleGeometry(half * 0.74, Math.max(0.01, mid - s.w * 0.5), 8, 18)),
          rubberMat
        );
        rub.position.set(half * 0.52, 0, half * 0.78);
        g.add(rub);

        /* kicker plate down the back of the bar, so the bar reads as
           hardware rather than a floating stick */
        var kicker = new T.Mesh(boxGeo(0.14 * K, mid * 0.96, 0.30 * K), kickerMat);
        kicker.position.set(-half * 1.05, 0, half * 0.72);
        g.add(kicker);

        /* chrome caps at both ends */
        for (var e = -1; e <= 1; e += 2) {
          var cap = new T.Mesh(sphGeo(half * 0.92, 14, 10), CHROME);
          cap.position.set(0, e * (s.len / 2 - half * 0.5), half);
          cap.scale.y = 0.72;
          g.add(cap);
        }

        group.add(g);
        slingObjs.push({ i: i, kickerMat: kickerMat, bodyMat: bodyMat, flash: 0 });
      });
    })();

    /* ==========================================================
       8. POSTS
       ========================================================== */
    (function buildPosts() {
      table.circles.forEach(function (c) {
        if (c.type !== 'post') return;
        var body = new T.Mesh(cylGeo(c.r, c.r * 1.06, 0.98 * K, 16), IVORY);
        standUp(body);
        body.position.set(c.x - CX, c.y - CY, 0.49 * K);
        group.add(body);
        var band = new T.Mesh(torGeo(c.r * 1.02, 0.055 * K, 8, 18), RUBBER);
        band.position.set(c.x - CX, c.y - CY, 0.72 * K);
        group.add(band);
        var cap = new T.Mesh(sphGeo(c.r, 16, 11), CHROME);
        cap.position.set(c.x - CX, c.y - CY, 0.98 * K);
        cap.scale.z = 0.72;
        group.add(cap);
      });
    })();

    /* ==========================================================
       9. SPINNER  -- plate on a horizontal axle, as on the real thing
       ========================================================== */
    var spinner = (function buildSpinner() {
      var sp = table.spinner;
      var px = sp.x - CX, py = sp.y - CY;

      /* Small downfield skew about the LEFT foot keeps the frame,
         bearings and spinning axle connected as the right foot moves. */
      var frame = new T.Group();
      var yaw = -Math.atan2(0.40, 1.96);
      frame.position.set(px - 0.98 * K, py, 0);
      frame.rotation.z = yaw;
      var pivotOffset = new T.Group();
      pivotOffset.position.set(0.98 * K - px, -py, 0);
      frame.add(pivotOffset);
      group.add(frame);

      /* frame: two uprights and a top bar */
      for (var s = -1; s <= 1; s += 2) {
        var up = new T.Mesh(cylGeo(0.075 * K, 0.085 * K, 1.55 * K, 9), CHROME);
        standUp(up);
        up.position.set(px + s * 0.98 * K, py, 0.78 * K);
        pivotOffset.add(up);
      }
      var top = new T.Mesh(cylGeo(0.07 * K, 0.07 * K, 1.96 * K, 9), CHROME);
      top.position.set(px, py, 1.55 * K);
      top.rotation.z = Math.PI / 2;
      pivotOffset.add(top);

      /* the plate group rotates about X -- the axle */
      var plate = new T.Group();
      plate.position.set(px, py, 0.86 * K);

      var axle = new T.Mesh(cylGeo(0.045 * K, 0.045 * K, 1.9 * K, 8), CHROME);
      axle.rotation.z = Math.PI / 2;
      plate.add(axle);

      /* the paddle: a slab standing up, hinged on the axle */
      var paddleMat = ownM(new T.MeshStandardMaterial({
        color: srgb(PAL.gold), emissive: srgb(PAL.gold), emissiveIntensity: 0.35,
        metalness: 0.65, roughness: 0.28, side: T.DoubleSide
      }));
      var paddle = new T.Mesh(boxGeo(1.72 * K, 0.055 * K, 1.06 * K), paddleMat);
      plate.add(paddle);
      var badgeCanvas = document.createElement('canvas');
      badgeCanvas.width = 256; badgeCanvas.height = 160;
      var badgeCtx = badgeCanvas.getContext('2d');
      badgeCtx.fillStyle = '#0c3327'; badgeCtx.fillRect(0,0,256,160);
      ['#d7263d','#f6c445','#1d9a4e'].forEach(function (c, i) {
        badgeCtx.fillStyle=c;badgeCtx.fillRect(0,136+i*8,256,8);
      });
      badgeCtx.fillStyle='#ffe3a0';badgeCtx.textAlign='center';badgeCtx.font='bold 66px sans-serif';badgeCtx.fillText('DUB',128,96);
      var badgeTex=ownT(new T.CanvasTexture(badgeCanvas));badgeTex.colorSpace=T.SRGBColorSpace;
      var badgeMat=std(0xffffff,{map:badgeTex,metalness:0.1,roughness:0.35});
      [-1,1].forEach(function (side) {
        var badge=new T.Mesh(own(new T.PlaneGeometry(1.60*K,0.93*K)),badgeMat);
        badge.rotation.x=side>0?-Math.PI/2:Math.PI/2;
        badge.position.y=side*0.035*K;plate.add(badge);
        var bearing=new T.Mesh(cylGeo(0.17*K,0.17*K,0.18*K,16),STEEL_DULL);
        bearing.rotation.z=Math.PI/2;bearing.position.set(px+side*0.98*K,py,0.86*K);pivotOffset.add(bearing);
      });
      var rib = new T.Mesh(boxGeo(1.74 * K, 0.06 * K, 0.09 * K), DARKMETAL);
      rib.position.z = 0.50 * K; plate.add(rib);
      var rib2 = rib.clone(); rib2.position.z = -0.50 * K; plate.add(rib2);

      pivotOffset.add(plate);
      return { group: plate, mat: paddleMat, angle: 0, flash: 0, x: px, y: py };
    })();

    /* ==========================================================
       10. KICKBACK
       ========================================================== */
    var kickback = (function buildKickback() {
      var kb = table.kickback;
      var px = kb.x - CX, py = kb.y - CY;
      var coil = new T.Mesh(cylGeo(0.30 * K, 0.30 * K, 0.66 * K, 16), ownM(new T.MeshStandardMaterial({
        color: srgb(0x2a1216), emissive: srgb(PAL.red), emissiveIntensity: 0.30,
        metalness: 0.6, roughness: 0.4
      })));
      standUp(coil);
      coil.position.set(px, py, 0.33 * K);
      group.add(coil);
      var plunger = new T.Mesh(cylGeo(0.20 * K, 0.20 * K, 0.9 * K, 12), CHROME);
      standUp(plunger);
      plunger.position.set(px, py, 0.82 * K);
      group.add(plunger);
      var glow = new T.Sprite(new T.SpriteMaterial({
        map: glowTex, color: srgb(PAL.red), transparent: true,
        blending: T.AdditiveBlending, depthWrite: false, opacity: 0.2
      }));
      ownM(glow.material);
      glow.scale.set(4.6 * K, 6.4 * K, 1);
      glow.position.set(px, py, 0.9 * K);
      glow.renderOrder = 6;
      group.add(glow);
      return { coil: coil.material, glow: glow.material, flash: 0 };
    })();

    /* ==========================================================
       11. INSERT LAMPS  -- two instanced meshes for 43 lenses
       ========================================================== */
    var lampSys = (function buildLamps() {
      var L = table.lamps;
      var n = L.length;
      var dummy = new T.Object3D();
      var col = new T.Color();

      /* This build of three.js only forwards instanceColor to the
         fragment shader when USE_COLOR is defined, and USE_COLOR needs
         a per-vertex colour attribute -- so every lamp geometry gets a
         plain white one and the instance colour does the tinting. */
      function whiteGeo(g) {
        var count = g.attributes.position.count;
        var arr = new Float32Array(count * 3);
        for (var i = 0; i < arr.length; i++) arr[i] = 1;
        g.setAttribute('color', new T.BufferAttribute(arr, 3));
        return own(g);
      }

      /* dark smoked lens rims: always visible, so the playfield still
         reads as a machine when everything is unlit */
      var rim = new T.InstancedMesh(whiteGeo(new T.RingGeometry(0.96, 1.02, 32)),
        ownM(new T.MeshStandardMaterial({
          color: srgb(0x665430), metalness: 0.65, roughness: 0.40,
          side: T.DoubleSide
        })), n);
      rim.frustumCulled = false;

      var lensMat = ownM(new T.MeshBasicMaterial({
        color: 0xffffff, vertexColors: true, toneMapped: false,
        transparent: true, opacity: 0.42, depthWrite: false,
        blending: T.AdditiveBlending
      }));
      var lens = new T.InstancedMesh(whiteGeo(new T.CircleGeometry(0.94, 32)), lensMat, n);
      lens.frustumCulled = false;
      lens.renderOrder = 8;

      var haloMat = ownM(new T.MeshBasicMaterial({
        color: 0xffffff, vertexColors: true, toneMapped: false,
        transparent: true, opacity: 0.12, depthWrite: false,
        blending: T.AdditiveBlending
      }));
      var haloGeo = whiteGeo(new T.PlaneGeometry(2, 2));
      haloMat.map = glowTex;
      var halo = new T.InstancedMesh(haloGeo, haloMat, n);
      halo.frustumCulled = false;
      halo.renderOrder = 9;

      for (var i = 0; i < n; i++) {
        var l = L[i];
        dummy.position.set(l.x - CX, l.y - CY, l.z);
        dummy.scale.set(l.rx || l.r, l.ry || l.r, 1);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        rim.setMatrixAt(i, dummy.matrix);
        lens.setMatrixAt(i, dummy.matrix);
        dummy.position.z += 0.008 * K;
        dummy.scale.set((l.rx || l.r) * 1.8, (l.ry || l.r) * 1.8, 1);
        dummy.updateMatrix();
        halo.setMatrixAt(i, dummy.matrix);
        /* start dark */
        col.setRGB(0, 0, 0);
        lens.setColorAt(i, col);
        halo.setColorAt(i, col);
      }
      rim.instanceMatrix.needsUpdate = true;
      lens.instanceMatrix.needsUpdate = true;
      halo.instanceMatrix.needsUpdate = true;
      if (lens.instanceColor) lens.instanceColor.needsUpdate = true;
      if (halo.instanceColor) halo.instanceColor.needsUpdate = true;

      group.add(rim);
      group.add(lens);
      group.add(halo);

      /* one real light for the single brightest lit insert, so big
         moments actually throw light onto the playfield */
      var hotLight = new T.PointLight(0xffffff, LIT(0), 22 * K, 2);
      hotLight.position.set(0, 0, 3.4 * K);
      group.add(hotLight);

      return {
        lens: lens, halo: halo, rim: rim, mat: lensMat, haloMat: haloMat,
        hotLight: hotLight, count: n,
        colors: LAMP_COLORS
      };
    })();

    /* lamp helpers -------------------------------------------------- */
    function lampsIn(groupName) {
      var out = [];
      for (var i = 0; i < table.lamps.length; i++) {
        if (table.lamps[i].group === groupName) out.push(i);
      }
      return out;
    }
    var GROUPS = {
      lane: lampsIn('lane'), shack: lampsIn('shack'), bump: lampsIn('bump'),
      drop: lampsIn('drop'), stand: lampsIn('stand'), grid: lampsIn('grid'),
      sling: lampsIn('sling'), inlane: lampsIn('inlane'),
      outlane: lampsIn('outlane'), spinner: lampsIn('spinner')
    };

    function setGroup(name, on) {
      var idx = GROUPS[name];
      if (!idx) return;
      for (var i = 0; i < idx.length; i++) table.lamps[idx[i]].lit = on ? 1 : 0;
    }
    function setLamp(i, on) { if (table.lamps[i]) table.lamps[i].lit = on ? 1 : 0; }
    function pulse(name, amount) {
      var idx = GROUPS[name];
      if (!idx) return;
      for (var i = 0; i < idx.length; i++) {
        table.lamps[idx[i]].hot = Math.max(table.lamps[idx[i]].hot, amount === undefined ? 1 : amount);
      }
    }
    function stepGroup(name, count, upto) {
      var idx = GROUPS[name];
      if (!idx) return;
      for (var i = 0; i < idx.length; i++) table.lamps[idx[i]].lit = i < count ? 1 : 0;
    }
    function lampLit(i) { return table.lamps[i] ? table.lamps[i].lit : 0; }
    function anyLit(name) {
      var idx = GROUPS[name] || [];
      for (var i = 0; i < idx.length; i++) if (table.lamps[idx[i]].lit) return true;
      return false;
    }

    /* ==========================================================
       12. PLUNGER
       ========================================================== */
    /* How far the handle comes out of the front at a full charge, in K
       units, and where the front of the cabinet actually IS on the lane.
       PLUNGE_FACE is the cabinet's front face measured from the lane mouth
       along the lane (0.94 world units beyond the playfield's own front
       edge, which is where machine.js's front panel sits); the ferrule
       below is bolted there, and the handle's resting outer face is 1.79 K
       further out again, so the knob is always clear of the machine. */
    var PLUNGE_TRAVEL = 3.4;
    var PLUNGE_FACE = 5.96;
    var plunger = (function buildPlunger() {
      var g = new T.Group();
      var laneY = table.artY(87.4);
      g.position.set(table.spawn.x - CX, laneY - CY, 0.55 * K);

      /* The rod RUNS ALONG THE LANE. A cylinder's axis is its local Y and
         the lane runs down local -Y, so these parts take NO x rotation; only
         the coil rings (whose axis is their local Z) get the quarter turn.
         Lying the rod across the lane instead left the whole assembly
         standing on end: the handle read as a flat red porthole and the pull
         slid it sideways past the cabinet instead of out of the front. */
      var rod = new T.Mesh(cylGeo(0.20 * K, 0.20 * K, 8.2 * K, 12), CHROME);
      rod.position.set(0, -3.80 * K, 0);
      g.add(rod);

      /* spring coil: a stack of rings reads as a spring and is cheap. It
         lives in its own group so the pull can COMPRESS it, which is what
         a plunger spring actually does as the rod comes back. */
      var springMat = ownM(new T.MeshStandardMaterial({
        color: srgb(0xb9c2cc), metalness: 0.95, roughness: 0.3
      }));
      var spring = new T.Group();
      spring.position.set(0, -0.45 * K, 0);
      for (var i = 0; i < 7; i++) {
        var ring = new T.Mesh(torGeo(0.30 * K, 0.045 * K, 6, 14), springMat);
        ring.position.set(0, -i * 0.26 * K, 0);
        ring.rotation.x = Math.PI / 2;
        spring.add(ring);
      }
      g.add(spring);

      /* the handle: a knurled red knob on a brass collar. It sits well
         outside the ferrule, so rod shows between the two the way it does
         on a real machine and the charge throws the knob clear of the
         cabinet. */
      var collar = new T.Mesh(cylGeo(0.34 * K, 0.34 * K, 0.34 * K, 16), ownM(new T.MeshStandardMaterial({
        color: srgb(PAL.gold), metalness: 0.9, roughness: 0.28, emissive: srgb(PAL.gold), emissiveIntensity: 0.16
      })));
      collar.position.set(0, -6.28 * K, 0);
      g.add(collar);

      var knobMat = ownM(new T.MeshStandardMaterial({
        color: srgb(PAL.red), emissive: srgb(PAL.red), emissiveIntensity: 0.28,
        metalness: 0.4, roughness: 0.4
      }));
      var knob = new T.Mesh(cylGeo(0.66 * K, 0.50 * K, 1.3 * K, 18), knobMat);
      knob.position.set(0, -7.10 * K, 0);
      g.add(knob);
      /* three raised rings, so the handle reads as gripped */
      var gripMat = ownM(new T.MeshStandardMaterial({ color: srgb(0x8f1120), metalness: 0.35, roughness: 0.5 }));
      for (var gi = 0; gi < 3; gi++) {
        var grip = new T.Mesh(torGeo(0.64 * K, 0.07 * K, 6, 20), gripMat);
        grip.position.set(0, (-6.72 - gi * 0.33) * K, 0);
        grip.rotation.x = Math.PI / 2;
        g.add(grip);
      }

      /* THE FERRULE. The cabinet's front face is a flat painted panel, so
         the rod needs real hardware to pass through or it reads as a decal
         stuck to a wall. This is bolted to that face and does NOT travel
         with the handle: the rod slides through it. Its place on the face
         is the same PLUNGE_FACE the pull is measured from, which is what
         keeps the hardware and the cabinet's front graphic lined up. */
      var ferrule = new T.Group();
      ferrule.position.set(table.spawn.x - CX,
        laneY - CY - PLUNGE_FACE * K, 0.55 * K);
      /* the flange, flat against the panel */
      var flange = new T.Mesh(cylGeo(0.78 * K, 0.72 * K, 0.16 * K, 20), CHROME);
      flange.position.set(0, -0.06 * K, 0);
      ferrule.add(flange);
      /* the collar the rod runs in */
      var collarRing = new T.Mesh(cylGeo(0.50 * K, 0.52 * K, 0.72 * K, 18), CHROME);
      collarRing.position.set(0, 0.02 * K, 0);
      ferrule.add(collarRing);
      /* a dark bore through it, so the hole reads as a hole */
      var bore = new T.Mesh(cylGeo(0.24 * K, 0.24 * K, 0.80 * K, 14), ownM(new T.MeshStandardMaterial({
        color: srgb(0x0a0c10), metalness: 0.2, roughness: 0.7
      })));
      bore.position.set(0, 0.02 * K, 0);
      ferrule.add(bore);
      group.add(ferrule);

      group.add(g);
      return { group: g, baseY: laneY - CY, pull: 0, spring: spring, springBase: -0.45 * K,
        knob: knob, rod: rod, travelK: PLUNGE_TRAVEL, faceK: PLUNGE_FACE,
        ferrule: ferrule, snapT: -1 };
    })();

    /* ==========================================================
       13. MISC DRESSING
       ========================================================== */
    (function buildDressing() {
      /* the drain mouth: a dark throat at the very bottom so balls
         visibly fall away instead of sliding off an edge */
      var throat = new T.Mesh(boxGeo(table.W * 0.34, 1.5 * K, 0.5 * K), SMOKE);
      throat.position.set(table.centerX - CX, table.artY(97.0) - CY, 0.25 * K);
      group.add(throat);

      /* two stainless return wires from the inlanes to the drain */
      var artX = table.artX, artY = table.artY;
      [[artX(20.0), artX(30.0)], [artX(80.0), artX(70.0)]].forEach(function (pair) {
        var a = new T.Vector3(pair[0] - CX, artY(92.0) - CY, 0.5 * K);
        var b = new T.Vector3(pair[1] - CX, artY(88.5) - CY, 0.5 * K);
        var dir = b.clone().sub(a);
        var len = dir.length();
        var m = new T.Mesh(cylGeo(0.07 * K, 0.07 * K, len, 8), STEEL_DULL);
        m.position.copy(a).add(b).multiplyScalar(0.5);
        m.quaternion.setFromUnitVectors(YAXIS, dir.normalize());
        group.add(m);
      });
    })();

    /* ==========================================================
       ANIMATION
       ========================================================== */
    var tmpCol = new T.Color();
    var T0 = 0;

    function flash(what, i, amount) {
      var amt = amount === undefined ? 1 : amount;
      if (what === 'bumper' && bumpers[i]) bumpers[i].flash = amt;
      else if (what === 'sling' && slingObjs[i]) slingObjs[i].flash = amt;
      else if (what === 'target' && targetObjs[i]) targetObjs[i].flash = amt;
      else if (what === 'shack') shackHit = amt;
      else if (what === 'spinner') spinner.flash = amt;
      else if (what === 'kickback') kickback.flash = amt;
    }
    var shackHit = 0;

    function update(dt, t, st) {
      T0 = t;
      st = st || {};
      var multiball = !!st.multiball;
      var attract = !!st.attract;
      var boost = st.boost === undefined ? 0 : st.boost;   /* 0..1 global lift */

      /* ---- insert lamps ---- */
      var L = table.lamps;
      var lens = lampSys.lens, halo = lampSys.halo;
      var bright = 0, brightI = -1;
      for (var i = 0; i < L.length; i++) {
        var l = L[i];
        if (l.hot > 0) l.hot = Math.max(0, l.hot - dt * 2.6);
        var target = l.lit > 0 ? 1 : 0;
        if (attract) target = 0.5 + 0.5 * Math.sin(t * 2.2 + i * 0.55);
        var want = Math.max(target, l.hot);
        l.cur += (want - l.cur) * Math.min(1, dt * (l.hot > 0 ? 18 : 9));
        var v = clamp(l.cur + boost * 0.35, 0, 1.4);
        tmpCol.setHex(lampSys.colors[l.kind] || 0xffffff);
        tmpCol.multiplyScalar(v);
        lens.setColorAt(i, tmpCol);
        halo.setColorAt(i, tmpCol);
        if (v > bright) { bright = v; brightI = i; }
      }
      lens.instanceColor.needsUpdate = true;
      halo.instanceColor.needsUpdate = true;
      if (brightI >= 0) {
        var hl = L[brightI];
        lampSys.hotLight.position.set(hl.x - CX, hl.y - CY, hl.z + 2.4 * K);
        lampSys.hotLight.color.setHex(lampSys.colors[hl.kind] || 0xffffff);
        lampSys.hotLight.intensity = LIT(Math.max(0, bright - 0.75) * 5.0);
      } else {
        lampSys.hotLight.intensity = LIT(0);
      }

      /* ---- walls: rasta chase ---- */
      var chaseSpeed = multiball ? 7.5 : (attract ? 4.0 : 2.4);
      for (var n = 0; n < NEON.length; n++) {
        var pulse = 0.5 + 0.85 * (0.5 + 0.5 * Math.sin(t * chaseSpeed - n * 1.1));
        NEON[n].emissiveIntensity = 0.35 + pulse * 1.15;
      }

      /* ---- wireform under-run ---- */
      for (var w = 0; w < wireforms.length; w++) {
        var wf = wireforms[w];
        wf.glow.opacity = wf.base + (multiball ? 0.34 : 0.12) *
          (0.5 + 0.5 * Math.sin(t * 3.4 - w * 1.7));
      }

      /* ---- bumpers ---- */
      for (var b = 0; b < bumpers.length; b++) {
        var bo = bumpers[b];
        if (bo.flash > 0) bo.flash = Math.max(0, bo.flash - dt * 3.2);
        var skirtLit = 0;
        var bumpIdx = GROUPS.bump;
        if (bumpIdx && bumpIdx[b] !== undefined) skirtLit = L[bumpIdx[b]].cur;
        var energy = Math.max(bo.flash, skirtLit * 0.8);
        /* these are the numbers that actually ship: update() rewrites
           emissiveIntensity every frame, so whatever the build set is
           only the first frame. ACES at exposure 1.2 clips a cap at
           0.35 to white, which is why three coloured bumpers used to
           read as one pale pink blob. */
        bo.skirt.emissiveIntensity = 0.12 + energy * 0.55;
        bo.cap.emissiveIntensity = 0.14 + energy * 0.65;
        bo.glow.material.opacity = bo.flash * 0.32;
        bo.light.intensity = LIT(bo.flash * 6.5);
        var s2 = 1 + bo.flash * 0.10;
        bo.group.scale.set(s2, s2, 1);
      }

      /* ---- shack ---- */
      if (shackHit > 0) shackHit = Math.max(0, shackHit - dt * 2.2);
      var shake = shackHit * 0.075 * K;
      shackGroup.position.set(
        table.shack.x - CX + Math.sin(t * 46) * shake,
        table.shack.y - CY + Math.cos(t * 41) * shake * 0.6,
        0
      );
      shackGroup.rotation.z = Math.sin(t * 38) * shake * 0.12;
      if (shackJaw) shackJaw.position.z = (0.68 - shackHit * 0.14) * K;
      for (var sl = 0; sl < shackLanterns.length; sl++) shackLanterns[sl].emissiveIntensity = 0.55 + shackHit*1.4 + Math.sin(t*3+sl)*0.08;
      for (var se = 0; se < shackEyes.length; se++) shackEyes[se].emissiveIntensity = 0.3 + shackHit*2.0;
      for (var sf = 0; sf < shackFaceMats.length; sf++) {
        shackFaceMats[sf].emissiveIntensity = 0.18 + shackHit * 0.9;
      }

      /* ---- targets ---- */
      for (var ti = 0; ti < targetObjs.length; ti++) {
        var o = targetObjs[ti], tt = table.targets[ti];
        if (o.flash > 0) o.flash = Math.max(0, o.flash - dt * 3.4);
        if (o.drop) {
          var down = tt.up ? o.restZ : -0.52 * K;
          o.face.position.z += (down - o.face.position.z) * Math.min(1, dt * 14);
          o.stripe.position.z = o.face.position.z + 0.44 * K;
          o.stripe.visible = tt.up;
          o.face.visible = tt.up || o.face.position.z > -0.40 * K;
        } else {
          var kick = o.flash * 0.14 * K;
          o.face.position.z = o.restZ - kick;
          o.stripe.position.z = o.restZ - kick + 0.44 * K;
        }
        var lit = tt.up ? 0.12 : 0.03;
        o.faceMat.emissiveIntensity = lit + o.flash * 2.6;
        o.stripeMat.emissiveIntensity = 0.22 + o.flash * 2.4;
      }

      /* ---- slingshots ---- */
      for (var si = 0; si < slingObjs.length; si++) {
        var so = slingObjs[si];
        if (so.flash > 0) so.flash = Math.max(0, so.flash - dt * 4);
        so.kickerMat.emissiveIntensity = 0.30 + so.flash * 3.4;
        so.bodyMat.emissiveIntensity = 0.03 + so.flash * 1.1;
      }

      /* ---- spinner ---- */
      if (spinner.flash > 0) spinner.flash = Math.max(0, spinner.flash - dt * 1.6);
      spinner.group.rotation.x = table.spinner.angle;
      spinner.mat.emissiveIntensity = 0.18 + spinner.flash * 1.5;

      /* ---- kickback ---- */
      if (kickback.flash > 0) kickback.flash = Math.max(0, kickback.flash - dt * 2);
      kickback.coil.emissiveIntensity = 0.20 + 0.18 * (0.5 + 0.5 * Math.sin(t * 4.4)) + kickback.flash * 2.4;
      kickback.glow.opacity = 0.14 + 0.12 * (0.5 + 0.5 * Math.sin(t * 4.4)) + kickback.flash * 0.7;

      /* ---- flippers ---- */
      for (var fi = 0; fi < world.flippers.length; fi++) {
        var f = world.flippers[fi];
        if (f.mesh) f.mesh.rotation.z = f.curA;
      }

      /* ---- plunger ----
         Charge draws the handle back and OUT OF THE FRONT of the cabinet;
         the shot then throws it home with a short overshoot and settle, so
         the launch has a physical beat instead of the handle just drifting
         forward. The pull is a fraction, not a distance: negative means
         past the rest position, which is the throw. */
      var pull = clamp(st.charge || 0, 0, 1);
      plunger.pull += (pull - plunger.pull) * Math.min(1, dt * 16);
      if (plunger.snapT >= 0) {
        plunger.snapT += dt;
        var t = plunger.snapT;
        if (t < 0.055) plunger.pull = 1 - (t / 0.055) * 1.20;        /* slam forward */
        else {
          var u = Math.min(1, (t - 0.055) / 0.30);
          plunger.pull = -0.20 * (1 - u) * (1 - u);                  /* settle home */
        }
        if (t > 0.36) { plunger.snapT = -1; plunger.pull = 0; }
      }
      plunger.group.position.y = plunger.baseY - plunger.pull * PLUNGE_TRAVEL * K;
      /* the spring compresses as the rod comes back and relaxes on release */
      var squash = clamp(plunger.pull, -0.20, 1);
      plunger.spring.scale.y = 1 - 0.42 * squash;
      plunger.spring.position.y = plunger.springBase * (1 - 0.30 * squash);
    }

    /* ---- plunger direct control (used by the launch animation) ---- */
    function setPlunger(v) { plunger.pull = clamp(v, 0, 1); }
    function snapPlunger() {
      plunger.group.position.y = plunger.baseY - plunger.pull * PLUNGE_TRAVEL * K;
      plunger.spring.scale.y = 1 - 0.42 * plunger.pull;
    }
    /* Fired the instant a launch happens: the handle snaps home. */
    function releasePlunger() { plunger.snapT = 0; }

    function dispose() {
      for (var i = 0; i < owned.geo.length; i++) owned.geo[i].dispose();
      for (i = 0; i < owned.mat.length; i++) owned.mat[i].dispose();
      for (i = 0; i < owned.tex.length; i++) owned.tex[i].dispose();
      owned.geo.length = 0; owned.mat.length = 0; owned.tex.length = 0;
    }

    /* Re-crop the shack's faces from the sprite atlas. Safe to call
       at any time; call it once the sheet has decoded. */
    function refreshArt() {
      for (var i = 0; i < faceJobs.length; i++) {
        faceJobs[i].draw();
        faceJobs[i].tex.needsUpdate = true;
      }
    }

    /* ---------------------------------------------------------- */
    return {
      group: group,
      update: update,
      flash: flash,
      setGroup: setGroup,
      setLamp: setLamp,
      pulse: pulse,
      stepGroup: stepGroup,
      lampLit: lampLit,
      anyLit: anyLit,
      groups: GROUPS,
      lamps: table.lamps,
      bumpers: bumpers,
      wireforms: wireforms,
      targets: targetObjs,
      slings: slingObjs,
      spinner: spinner,
      kickback: kickback,
      plunger: plunger,
      setPlunger: setPlunger,
      snapPlunger: snapPlunger,
      releasePlunger: releasePlunger,
      shackGroup: shackGroup,
      neon: NEON,
      refreshArt: refreshArt,
      dispose: dispose
    };
  }

  global.PB = global.PB || {};
  global.PB.Playfield = { build: build };
})(window);
