/* ============================================================
   ONE DROP PINBALL  --  machine.js
   The physical cabinet the playfield lives inside: body, atlas
   mapped side art, front panel, lockdown bar, side rails,
   flipper buttons, black legs, and the standing backbox with its
   backglass, score band and speaker grills.

   Everything is built once at load and nothing here runs per
   frame except the cheap bulb chase. Geometry, materials and
   canvas textures are cached so repeated parts share buffers, and
   every resource this module allocates is released by dispose().

   FRAMES. Table space is shared with table.js and the physics:
     +X across the machine (the player's right), +Y from the
     flippers toward the backglass, +Z straight up out of the
     playfield. game.js lays that frame into the world with a
     rotation of -(PI/2 - TILT) about X, so inside THIS file:

       world up   = ( 0,  sinT,  cosT)
       world down = ( 0, -sinT, -cosT)
       world height of a point = CY + (y - CY)*sinT + z*cosT

   which is why the legs hang mostly along -Z with a slight lean
   toward the foot, the head-end anchors sit higher (real machines
   ship longer rear legs), and the backbox is counter-rotated out
   of the incline to stand vertical.

   SIZING is taken from the machine it is modelled on, at the
   playfield's own scale (25 units of playfield = the real 20.25",
   so one unit is 0.81"):

     cabinet width   22.5" = 27.8 units   (real: 20.25" playfield +
                                           2 x 0.75" wall + gaps)
     wall / plywood   0.75" =  0.93 units
     cabinet length   1.238 x playfield   (the apron and head board)
     front face      ~10.7" = 13.2 units  so a full-size coin door fits
     playfield pitch  6.5 degrees, made by extending the rear legs

   The cabinet is a WEDGE, not a slab. The reference's side
   elevation draws the flank 13.2 units tall at the foot and 22.2
   at the head, so the LID LINE -- the top of the walls, where the
   glass would sit -- climbs 10 degrees MORE than the playfield
   does. The playfield keeps its regulation pitch; the extra lid
   angle is what the drawing gives the ramps to live in, and it is
   why the backbox stands on the head end rather than on the
   playfield plane. See dev/3dref-match.md section 3.

   ============================================================ */
import './playfield.js';
import * as THREE from './vendor/three.module.js';

(function (global) {
  'use strict';

  function newCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  /* Raw pixels of one atlas region, for the composites that need to read
     them (the flank rectifier and the score band's windows). */
  function regionCanvas(name) {
    var A = global.PB.assets;
    if (!A || !A.ready || !A.image) return null;
    var r = A.rectPx(name);
    if (!r || r.sw < 2 || r.sh < 2) return null;
    var c = newCanvas(Math.round(r.sw), Math.round(r.sh));
    c.getContext('2d', { willReadFrequently: true })
      .drawImage(A.image, r.sx, r.sy, r.sw, r.sh, 0, 0, r.sw, r.sh);
    return c;
  }

  function texFromCanvas(c, srgb) {
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.anisotropy = 8;
    if (srgb !== false && 'colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /* One region, CENTRE-CROPPED to fill the canvas rather than fitted inside
     it. assets.spriteTexture() letterboxes, and on a dark panel that shows up
     as the sheet's paper edging down two sides -- which is what used to fringe
     the cabinet art. Use this whenever the plane's aspect is fixed and the
     region's does not match. */
  function coverTexture(name, pxW, pxH) {
    var A = global.PB.assets;
    var c = newCanvas(pxW, pxH);
    var x = c.getContext('2d');
    x.fillStyle = '#0a0b0d';
    x.fillRect(0, 0, pxW, pxH);
    var r = A && A.ready && A.image ? A.rectPx(name) : null;
    if (r) {
      var k = Math.max(pxW / r.sw, pxH / r.sh);
      var dw = r.sw * k, dh = r.sh * k;
      x.drawImage(A.image, r.sx, r.sy, r.sw, r.sh,
        (pxW - dw) / 2, (pxH - dh) / 2, dw, dh);
    }
    return texFromCanvas(c);
  }

  /* ================= cabinet art =================
     Composed from the sheet's labelled panels, once, at load. */

  var FLANK_W = 1024, FLANK_H = 560;           /* the flank, ~50.8 x 17.5 u */

  /* The cabinet's flank is a WEDGE and the sheet draws its artwork as a
     trapezoid to match, so the panel cannot just be cropped as a rectangle --
     doing that is what used to drag the sheet's grey paper into the top
     corner of the side art. Instead each source column is stretched from the
     art's own top edge down to its level bottom edge, which RECTIFIES the
     trapezoid into a rectangle. That rectangle then maps straight onto the
     wedge's trapezoid (see trapGeo) and the art comes out with the
     proportions it was drawn with.

     One texture serves both flanks. A pinball cabinet's two sides carry the
     same print, and mirroring it -- which this file used to do with a
     translate+scale(-1,1) about the panel's centre -- is what made the left
     flank read back to front. */
  function makeFlankTexture() {
    var A = global.PB.assets;
    var c = newCanvas(FLANK_W, FLANK_H);
    var x = c.getContext('2d');
    x.fillStyle = '#0a0b0d';
    x.fillRect(0, 0, FLANK_W, FLANK_H);
    if (!A || !A.ready || !A.image || !A.FLANK_QUAD) return texFromCanvas(c);
    var src = A.image, Q = A.FLANK_QUAD;
    x.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in x) x.imageSmoothingQuality = 'high';
    for (var i = 0; i < FLANK_W; i++) {
      var t = i / (FLANK_W - 1);
      /* the rectified panel keeps the sheet's own left-to-right reading order:
         u = 0 is the "ONE" end of the title, u = 1 the "P" end. Which end of
         the CABINET each of those lands on is decided per flank by trapGeo. */
      var sx = Q.x + t * (Q.w - 1);
      var top = Q.y + (sx - Q.x) / (Q.w - 1) * Q.drop;
      var sh = Q.y + Q.h - top;                /* down to the level bottom edge */
      x.drawImage(src, sx, top, 1, sh, i, 0, 1, FLANK_H);
    }
    return texFromCanvas(c);
  }

  /* The backbox lower band: mostly dark, with the sheet's dmdPanel art as a
     centred plate and the live dot-matrix window covering the WHOLE plate.
     The reference band is 200 x 49 px = 4.08:1 (dev/_reffront3.py); the
     plate is 42.5% of the band's width at its own 2.83 aspect (136 x 48 px
     on the sheet), so at that width the plate is TALLER than a 4:1 window
     would be and the old fixed 4:1 window left strips of painted plate
     showing above and below the glass. The window is now measured off the
     plate itself: whatever shape the sheet drew, the live panel covers
     every pixel of it, and the DMD canvas is squared up to the same aspect
     in buildMachine so the dots stay round. The palms are drawn ON the
     panel instead (see dmd.js drawPalms), so hiding the painted palms
     costs nothing -- they live on the display now. */
  var BAND_W = 4.08;
  var BAND_WIN = { x: 0.2875, y: 0.2831, w: 0.425, h: 0.4338 };   /* fallback */
  var PLATE_ASPECT = 2.8333;            /* 136 x 48 px sheet panel */

  /* The DMD raster: 128x32 dots, and this many canvas pixels per dot. BOTH
     integers, because a fractional pitch puts every dot row on a different
     sub-pixel phase: the rows then rasterise 5 and then 6 pixels apart,
     unevenly lit, and that is what the banding across the panel was --
     horizontal lines head on, angled ones with the backbox at an angle.
     5x7 px cells land on a 640x224 canvas, 0.8% off the plate's aspect. */
  var DMD_CELL_W = 5, DMD_CELL_H = 7;
  function makeScoreBand() {
    var c = newCanvas(1024, Math.round(1024 / BAND_W));
    var x = c.getContext('2d', { willReadFrequently: true });
    x.fillStyle = '#0a0b0d';
    x.fillRect(0, 0, c.width, c.height);
    var src = regionCanvas('dmdPanel');      /* null-safe: falls back below */
    if (src) {
      /* the sheet panel becomes a centred plate at its own aspect
         (regionCanvas clips on sheet pixels, so this aspect is exact) */
        PLATE_ASPECT = src.width / src.height;
        var plateW = c.width * 0.425;
        var plateH = plateW / PLATE_ASPECT;
        if (plateH > c.height) { plateH = c.height; plateW = plateH * PLATE_ASPECT; }
        var px = (c.width - plateW) / 2, py = (c.height - plateH) / 2;
        x.drawImage(src, 0, 0, src.width, src.height, px, py, plateW, plateH);
        /* the window IS the plate: the live cover sits over every painted
           pixel, and BAND_WIN below is the same rectangle in band units */
        x.fillStyle = '#02040a';
        x.fillRect(px, py, plateW, plateH);
        BAND_WIN.x = px / c.width;
        BAND_WIN.y = py / c.height;
        BAND_WIN.w = plateW / c.width;
        BAND_WIN.h = plateH / c.height;
    }
    /* Neutral bevel rules match the reference's black score surround. */
    x.fillStyle = '#292b2e';
    x.fillRect(0, 0, c.width, 3);
    x.fillRect(0, c.height - 3, c.width, 3);
    return texFromCanvas(c);
  }

  /* What the mirror blades reflect until installMirror() puts the live
     planar pass on them (see the note on M.mirror in buildMachine). It is
     deliberately not the scene's own environment (art.makeEnv), which is a
     gold / red / GREEN banded gradient built to make the ball read as chrome
     -- at metalness 1 that band painted the whole inside of the cabinet
     bright green, which reads as a painted panel, not as glass.

     A cabinet's interior reflects a dim room: dark above and below, something
     warm and broad just above the horizon, a few soft lights. So the blades
     get their own cube map, six 64px faces -- a cube texture rather than an
     equirect one because this file has no renderer to pre-filter with, and a
     plain cube map is what a standard material can sample directly. The
     reflection is what makes them read as mirror: the sheet goes from near
     black to a warm flash and back as the camera slides along it. */
  function makeMirrorEnv() {
    function side() {
      var N = 64, c = newCanvas(N, N), x = c.getContext('2d');
      var g = x.createLinearGradient(0, 0, 0, N);
      g.addColorStop(0.00, '#05070a');
      g.addColorStop(0.32, '#0d1216');
      g.addColorStop(0.44, '#6b5f47');
      g.addColorStop(0.475, '#cdb47f');
      g.addColorStop(0.51, '#3c3a35');
      g.addColorStop(0.58, '#101418');
      g.addColorStop(1.00, '#030406');
      x.fillStyle = g;
      x.fillRect(0, 0, N, N);
      return c;
    }
    function up() {
      var N = 64, c = newCanvas(N, N), x = c.getContext('2d');
      x.fillStyle = '#04060a';
      x.fillRect(0, 0, N, N);
      for (var i = 0; i < 4; i++) {
        var lx = 8 + Math.random() * (N - 16), ly = 8 + Math.random() * (N - 16);
        var r = 9 + Math.random() * 14;
        var rg = x.createRadialGradient(lx, ly, 0, lx, ly, r);
        rg.addColorStop(0, 'rgba(255,247,226,1)');
        rg.addColorStop(1, 'rgba(255,244,216,0)');
        x.fillStyle = rg;
        x.beginPath(); x.arc(lx, ly, r, 0, Math.PI * 2); x.fill();
      }
      return c;
    }
    function down() {
      var N = 64, c = newCanvas(N, N), x = c.getContext('2d');
      x.fillStyle = '#04060a';
      x.fillRect(0, 0, N, N);
      return c;
    }
    var s1 = side(), s2 = side(), s3 = side(), s4 = side();
    var t = new THREE.CubeTexture([s1, s2, up(), down(), s3, s4]);
    t.needsUpdate = true;
    if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /* WHAT THE GLASS REFLECTS. A clear pane has no colour of its own -- every
     pixel you see in it is reflected light -- so the reflection IS the
     effect, and it only reads if there is something up there worth
     reflecting. The blades' cube (makeMirrorEnv) is a dim room with one warm
     horizon flash, which is what a mirror needs; off a pane you should see
     the ROOM, and specifically its LIGHTS. So this is lights and a horizon
     rather than gradients: a gradient reflects as a flat wash, and a wash at
     a constant alpha is exactly what makes a pane read as a film of milk
     instead of as glass. Long bright strips overhead and a couple of warm
     pools just above the horizon reflect as SHAPES, and shapes are what
     sweep across the field and give the pane away as it moves.

     Six 128 px faces, and deliberately NOT sRGB-flagged: the glass shader
     samples this cube by hand, where nothing decodes a texture for you, and
     a flagged cube sampled raw would be encoded twice on the way out. Its
     brightness is set by the shader's own gain instead. */
  function makeGlassEnv() {
    var N = 128;
    function base(colour) {
      var c = newCanvas(N, N), x = c.getContext('2d');
      x.fillStyle = colour;
      x.fillRect(0, 0, N, N);
      return { c: c, x: x };
    }
    /* one ceiling strip. A TIGHT halo round a hard white core, because a
       tube light is what makes a sharp bright band cross the pane: a wide
       soft one reflects as a flat wash, which is the look being avoided. */
    function lamp(x, cx, cy, len, thick, tilt) {
      x.save();
      x.translate(cx, cy);
      x.rotate(tilt || 0);
      var halo = x.createLinearGradient(0, -thick * 2, 0, thick * 2);
      halo.addColorStop(0.0, 'rgba(150,146,134,0)');
      halo.addColorStop(0.5, 'rgba(255,246,226,0.42)');
      halo.addColorStop(1.0, 'rgba(150,146,134,0)');
      x.fillStyle = halo;
      x.fillRect(-len / 2 - thick, -thick * 2, len + thick * 2, thick * 4);
      x.fillStyle = '#fffbef';
      x.fillRect(-len / 2, -thick / 2, len, thick);
      x.restore();
    }
    /* ceiling: four strip lights and the warm pool of the backbox lamps */
    function ceiling() {
      /* Spread through the MIDDLE of the face on purpose. On the up face a
         texture row maps to an elevation of 45 + |v - 0.5| * 90, so the
         rows near the centre are the ones a player's own view reflects, and
         a room whose fittings all sit round the rim reflects as an empty
         ceiling with a light somewhere off the edge of the machine. */
      /* THE STRIPS THE PLAYER ACTUALLY SEES. On the up face a texture row
         is an elevation of 45 + |v - 0.5| * 90, so the rows between about
         0.28 and 0.40 are what a seated player's own eye reflects; and
         because the reflected ray keeps a roughly fixed azimuth, a light
         has to be crossed wherever that azimuth happens to run. So these
         are laid down as SHORT segments right across each of those rows --
         dashes, not one unbroken bar -- which is also what a row of ceiling
         fittings reflects as, and which no single line of paint can be
         mistaken for. Two broader strips sit out at the edges as well, for
         the steeper views. */
      var b = base('#020306'), x = b.x, rows = [0.30, 0.365, 0.635, 0.70];
      for (var r = 0; r < rows.length; r++) {
        for (var seg = 0; seg < 3; seg++) {
          lamp(x, (0.20 + seg * 0.30) * N, rows[r] * N, N * 0.23, 3,
            (r % 2 ? -0.06 : 0.06));
        }
      }
      lamp(x, N * 0.30, N * 0.14, N * 0.44, 4, 0.10);
      lamp(x, N * 0.66, N * 0.86, N * 0.44, 3, -0.09);
      var w = x.createRadialGradient(N * 0.18, N * 0.72, 2, N * 0.18, N * 0.72, N * 0.62);
      w.addColorStop(0.0, 'rgba(255,166,84,0.34)');
      w.addColorStop(1.0, 'rgba(255,166,84,0)');
      x.fillStyle = w;
      x.fillRect(0, 0, N, N);
      return b.c;
    }
    /* the floor of the room: black, with the lights' faint spill on it */
    function floor() {
      var b = base('#020306'), x = b.x;
      var w = x.createRadialGradient(N * 0.5, N * 0.5, 4, N * 0.5, N * 0.5, N * 0.7);
      w.addColorStop(0.0, 'rgba(180,150,110,0.10)');
      w.addColorStop(1.0, 'rgba(180,150,110,0)');
      x.fillStyle = w;
      x.fillRect(0, 0, N, N);
      return b.c;
    }
    /* the four walls: dark above and below, the room's warm band at the
       horizon, two pools of light, and the faintest green off the cabinet's
       own art low down */
    function wall() {
      var b = base('#02040a'), x = b.x;
      var g = x.createLinearGradient(0, 0, 0, N);
      g.addColorStop(0.00, '#02040a');
      g.addColorStop(0.40, '#080b11');
      g.addColorStop(0.49, '#241d13');
      g.addColorStop(0.53, '#6b5330');
      g.addColorStop(0.58, '#1a1610');
      g.addColorStop(1.00, '#02040a');
      x.fillStyle = g;
      x.fillRect(0, 0, N, N);
      var p = x.createRadialGradient(N * 0.32, N * 0.44, 2, N * 0.32, N * 0.44, N * 0.30);
      p.addColorStop(0.0, 'rgba(255,236,196,0.34)');
      p.addColorStop(1.0, 'rgba(255,236,196,0)');
      x.fillStyle = p;
      x.fillRect(0, 0, N, N);
      p = x.createRadialGradient(N * 0.74, N * 0.40, 2, N * 0.74, N * 0.40, N * 0.24);
      p.addColorStop(0.0, 'rgba(255,196,120,0.24)');
      p.addColorStop(1.0, 'rgba(255,196,120,0)');
      x.fillStyle = p;
      x.fillRect(0, 0, N, N);
      var gr = x.createRadialGradient(N * 0.5, N * 0.88, 2, N * 0.5, N * 0.88, N * 0.44);
      gr.addColorStop(0.0, 'rgba(46,120,64,0.16)');
      gr.addColorStop(1.0, 'rgba(46,120,64,0)');
      x.fillStyle = gr;
      x.fillRect(0, 0, N, N);
      /* AND TWO FITTINGS ON THE WALL. This is the face the PLAYER'S view
         reflects: at the machine's own camera the reflected ray leaves the
         pane at about the player's elevation, which is well under 45 deg,
         so it lands on the walls and not on the ceiling -- a room whose
         only lights are overhead is a room you see nothing of in the glass
         from where you actually stand. These are what put a bright,
         readable glint in the player's view. */
      lamp(x, N * 0.26, N * 0.07, N * 0.44, 4, 0.06);
      lamp(x, N * 0.74, N * 0.15, N * 0.30, 3, -0.10);
      return b.c;
    }
    var t = new THREE.CubeTexture([wall(), wall(), ceiling(), floor(), wall(), wall()]);
    t.needsUpdate = true;
    /* NO MIPMAPS. The lights are what has to survive: sampled through the
       pane at a grazing angle the reflection footprint is stretched right
       along the light, and a mipmapped cube blurs it back into the flat
       wash this whole approach exists to avoid. */
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    return t;
  }

  /* A speaker: drilled mesh over a recessed cone, with a chrome rim. */
  function makeGrill() {
    var size = 256, c = newCanvas(size, size), x = c.getContext('2d');
    x.fillStyle = '#08090b';
    x.fillRect(0, 0, size, size);
    var g = x.createRadialGradient(size * 0.36, size * 0.32, 4, size / 2, size / 2, size / 2);
    g.addColorStop(0, '#2c3037');
    g.addColorStop(0.55, '#15171b');
    g.addColorStop(1, '#08090b');
    x.fillStyle = g;
    x.beginPath();
    x.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    x.fill();
    var limit = size / 2 - 16;
    x.fillStyle = 'rgba(0,0,0,0.9)';
    for (var gy = 10; gy < size - 10; gy += 11) {
      var odd = ((gy / 11) | 0) % 2;
      for (var gx = 10; gx < size - 10; gx += 11) {
        var dx = gx - size / 2, dy = gy - size / 2;
        if (dx * dx + dy * dy > limit * limit) continue;
        x.beginPath();
        x.arc(gx + (odd ? 5.5 : 0), gy, 3.1, 0, Math.PI * 2);
        x.fill();
      }
    }
    x.strokeStyle = 'rgba(214,222,232,0.30)';
    x.lineWidth = 3;
    x.beginPath();
    x.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2);
    x.stroke();
    x.strokeStyle = 'rgba(246,196,69,0.34)';
    x.lineWidth = 6;
    x.beginPath();
    x.arc(size / 2, size / 2, size / 2 - 15, 0, Math.PI * 2);
    x.stroke();
    x.fillStyle = '#c9d2dc';
    x.beginPath();
    x.arc(size / 2, size / 2, 7, 0, Math.PI * 2);
    x.fill();
    return texFromCanvas(c);
  }

  /* The glass's own surface. A pinball's pane is not factory-clean: it has
     a few long wipe marks and a scatter of dust, and those are what make it
     read as a real sheet rather than as a hole cut in the scene. Only the
     ROUGHNESS view of this canvas matters. The pane is nearly invisible
     (alpha 0.06), so a scuff cannot be seen as a mark on it -- what a scuff
     does is smear the reflection, and that shows up in the highlight as it
     sweeps across the glass while the camera moves. Hence a mostly-DARK map
     (the material's roughness is 0.09 and this multiplies it, so 0.22 leaves
     the glass mirror-smooth at 0.02) with the marks drawn BRIGHT, because
     bright is the rough end. Sampled linear -- it is data, not colour. */
  function makeGlassSurface() {
    var W = 512, H = 256, i;
    var c = newCanvas(W, H), x = c.getContext('2d');
    x.fillStyle = '#383838';                     /* 0.22 -> roughness 0.020 */
    x.fillRect(0, 0, W, H);
    x.lineCap = 'round';
    /* the wipe marks: a handful of long, soft, slightly diagonal strokes */
    for (i = 0; i < 8; i++) {
      var x0 = Math.random() * W * 0.55, y0 = 20 + Math.random() * (H - 40);
      var len = W * (0.22 + Math.random() * 0.5);
      var g = x.createLinearGradient(x0, y0, x0 + len, y0 - len * 0.22);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,' + (0.16 + Math.random() * 0.22) + ')');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.strokeStyle = g;
      x.lineWidth = 1.2 + Math.random() * 3.2;
      x.beginPath();
      x.moveTo(x0, y0);
      x.lineTo(x0 + len, y0 - len * 0.22);
      x.stroke();
    }
    /* and dust: tiny, faint, evenly scattered */
    for (i = 0; i < 110; i++) {
      x.fillStyle = 'rgba(255,255,255,' + (0.08 + Math.random() * 0.2) + ')';
      x.beginPath();
      x.arc(Math.random() * W, Math.random() * H, 0.5 + Math.random() * 1.5, 0, Math.PI * 2);
      x.fill();
    }
    return texFromCanvas(c, false);
  }

  /* Live planar mirror, using this project's existing Three.js renderer.
     Each wall has a projective render target and an oblique near plane;
     objects behind the wall are clipped rather than ghosted through it. */
  function installMirror(mesh, mirrors, targets) {
    var target = new THREE.WebGLRenderTarget(768, 768, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, depthBuffer: true
    });
    targets.push(target);
    var textureMatrix = new THREE.Matrix4();
    var material = new THREE.ShaderMaterial({
      name: 'live silver mirror',
      uniforms: { reflection: { value: target.texture }, textureMatrix: { value: textureMatrix } },
      vertexShader: 'uniform mat4 textureMatrix; varying vec4 mirrorCoord; void main(){ mirrorCoord=textureMatrix*vec4(position,1.0); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'uniform sampler2D reflection; varying vec4 mirrorCoord; void main(){ vec3 reflected=texture2DProj(reflection,mirrorCoord).rgb; gl_FragColor=vec4(reflected*0.96,1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
      toneMapped: true
    });
    mesh.material = material;
    mesh.name = 'live interior mirror';
    mesh.userData.reflectionTarget = target;
    mesh.userData.reflectionPasses = 0;
    var virtual = new THREE.PerspectiveCamera();
    var normal = new THREE.Vector3(), point = new THREE.Vector3(), eye = new THREE.Vector3();
    var view = new THREE.Vector3(), look = new THREE.Vector3(), rotation = new THREE.Matrix4();
    var plane = new THREE.Plane(), clip = new THREE.Vector4(), q = new THREE.Vector4();
    mesh.onBeforeRender = function (renderer, scene, camera) {
      if (scene.userData.renderingMirror || !camera.isPerspectiveCamera) return;
      point.setFromMatrixPosition(mesh.matrixWorld);
      eye.setFromMatrixPosition(camera.matrixWorld);
      rotation.extractRotation(mesh.matrixWorld);
      normal.set(0,0,1).applyMatrix4(rotation).normalize();
      view.subVectors(point,eye);
      if (view.dot(normal)>0) return;
      view.reflect(normal).negate().add(point);
      rotation.extractRotation(camera.matrixWorld);
      look.set(0,0,-1).applyMatrix4(rotation).add(eye);
      look.subVectors(point,look).reflect(normal).negate().add(point);
      virtual.position.copy(view);
      virtual.up.set(0,1,0).applyMatrix4(rotation).reflect(normal);
      virtual.lookAt(look);
      virtual.near=camera.near;virtual.far=camera.far;
      virtual.updateMatrixWorld();
      virtual.projectionMatrix.copy(camera.projectionMatrix);
      textureMatrix.set(0.5,0,0,0.5, 0,0.5,0,0.5, 0,0,0.5,0.5, 0,0,0,1);
      textureMatrix.multiply(virtual.projectionMatrix).multiply(virtual.matrixWorldInverse).multiply(mesh.matrixWorld);
      plane.setFromNormalAndCoplanarPoint(normal,point).applyMatrix4(virtual.matrixWorldInverse);
      clip.set(plane.normal.x,plane.normal.y,plane.normal.z,plane.constant);
      var e=virtual.projectionMatrix.elements;
      q.set((Math.sign(clip.x)+e[8])/e[0],(Math.sign(clip.y)+e[9])/e[5],-1,(1+e[10])/e[14]);
      clip.multiplyScalar(2/clip.dot(q));
      e[2]=clip.x;e[6]=clip.y;e[10]=clip.z+1-0.003;e[14]=clip.w;
      virtual.projectionMatrixInverse.copy(virtual.projectionMatrix).invert();
      var oldTarget=renderer.getRenderTarget(), oldTone=renderer.toneMapping;
      var oldXR=renderer.xr.enabled, oldShadow=renderer.shadowMap.autoUpdate;
      var oldViewport=renderer.getViewport(new THREE.Vector4()), oldScissor=renderer.getScissor(new THREE.Vector4()), oldScissorTest=renderer.getScissorTest();
      var visibility=mirrors.map(function(m){return m.visible;});
      scene.userData.renderingMirror=true;
      /* THE OTHER WALLS STAY VISIBLE. Each blade therefore reflects the
         playfield AND the opposite blade's own reflection, sampled from
         that wall's previous frame -- the standard, stable way to resolve
         a mirrored pair: nothing feeds back into an active target, and
         none of the old nested-pass render-state juggling is needed.
         Only the wall being rendered is hidden, so no mirror can show its
         own back face. */
      mirrors.forEach(function(m,i){m.visible=(m!==mesh)&&visibility[i];});
      mesh.visible=false;
      try {
        renderer.xr.enabled=false;renderer.shadowMap.autoUpdate=false;
        renderer.toneMapping=THREE.NoToneMapping;
        renderer.setRenderTarget(target);renderer.setScissorTest(false);renderer.clear();
        renderer.render(scene,virtual);
        mesh.userData.reflectionPasses++;
      } finally {
        mirrors.forEach(function(m,i){m.visible=visibility[i];});
        scene.userData.renderingMirror=false;
        renderer.toneMapping=oldTone;renderer.xr.enabled=oldXR;renderer.shadowMap.autoUpdate=oldShadow;
        renderer.setRenderTarget(oldTarget);
        renderer.setViewport(oldViewport);renderer.setScissor(oldScissor);renderer.setScissorTest(oldScissorTest);
      }
    };
    return material;
  }

  /* ================= the machine ================= */
  function buildMachine(opts) {
    var A = global.PB.assets;
    var table = opts.table;
    var TILT = opts.tilt;
    var glowTex = opts.glowTex;
    var CX = table.centerX, CY = table.centerY;

    var owned = { geo: [], mat: [], tex: [] };
    var mirrors = [], reflectionTargets = [];
    function own(g) { owned.geo.push(g); return g; }
    function ownTex(t) { owned.tex.push(t); return t; }

    var root = new THREE.Group();

    /* ---------------- shared materials ---------------- */
    var mirrorEnv = ownTex(makeMirrorEnv());
    var glassEnv = ownTex(makeGlassEnv());
    var glassScuffs = ownTex(makeGlassSurface());
    var M = {
      wood: new THREE.MeshStandardMaterial({ color: 0x15100b, metalness: 0.12, roughness: 0.7 }),
      woodDark: new THREE.MeshStandardMaterial({ color: 0x0a0705, metalness: 0.16, roughness: 0.82 }),
      /* Every surface the artwork does NOT cover -- the back of the backbox,
         the cabinet's rear board, the inside floor. Real cabinets are plain
         black there and the reference draws them that way, so they default to
         black rather than to wood: at woodDark's 0.16 metalness the
         environment map turned the whole back of the machine a visible warm
         brown, which reads as a missing texture. */
      panel: new THREE.MeshStandardMaterial({
        color: 0x020306, metalness: 0.0, roughness: 0.95, envMapIntensity: 0.0
      }),
      /* matte black: the legs, apron and speaker cups are flat black in the
         reference, not gunmetal. Three things kept pushing them off black:
         the metalness (which turns the scene's environment map into a
         mirror), envMapIntensity, which multiplies that reflection, and a
         colour that was biased BLUE -- 0x04050a puts blue at 2.5x the red,
         so at any lift at all the legs read navy. Neutral 0x050505, env off
         entirely and the sheen gone (roughness 0.95) so nothing on the iron
         has a specular path back to the environment. */
      black: new THREE.MeshStandardMaterial({
        color: 0x050505, metalness: 0.0, roughness: 0.95, envMapIntensity: 0
      }),
      /* the playfield rails and lockdown bar are BLACK in the reference 3/4
         view (dev/3dref-match.md section 5) -- black metal with a sheen,
         not the gold this file used to paint them, and not the silver a
         metalness of 0.55 against the environment map produced */
      rail: new THREE.MeshStandardMaterial({
        color: 0x0a0c10, metalness: 0.28, roughness: 0.46, envMapIntensity: 0.5
      }),
      /* THE LID TRIM's own material: all three runs of the glass moulding
         (two flanks, one front) wear this, so they read as one piece of
         hardware. It is M.rail with the metalness and the environment
         reflection pulled down -- at 0.28 / 0.5 the key light turned the
         lockdown bar silver, which is why that one piece used to be a
         different, flatter black from the rails either side of it. */
      trim: new THREE.MeshStandardMaterial({
        color: 0x080a0e, metalness: 0.18, roughness: 0.52, envMapIntensity: 0.30
      }),
      chrome: new THREE.MeshStandardMaterial({ color: 0xd9dee6, metalness: 0.95, roughness: 0.15 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xf6c445, metalness: 0.9, roughness: 0.24, emissive: 0xf6c445, emissiveIntensity: 0.3 }),
      red: new THREE.MeshStandardMaterial({ color: 0xd7263d, metalness: 0.35, roughness: 0.4, emissive: 0xd7263d, emissiveIntensity: 0.5 }),
      /* the flipper buttons' own red. The shared M.red above is a lit plastic
         with 0.5 emissive, and under the cabinet's key light that came out
         PINK -- the reference button is a deep saturated red, so it gets a
         darker base and a much smaller glow to keep it reading red rather
         than washed. */
      redBtn: new THREE.MeshStandardMaterial({
        color: new THREE.Color(0xc20b08),
        metalness: 0, roughness: 0.65, envMapIntensity: 0,
        emissive: new THREE.Color(0xa00603), emissiveIntensity: 0.12
      }),

      /* MIRROR BLADES. The inside of a real cabinet is not bare plywood: it
         is dressed with polished stainless, and this one is dressed the same
         way. This material is what a blade wears for the frames before the
         reflection exists (and what it keeps if the reflection never installs
         at all): installMirror() swaps each panel onto a live planar mirror
         once the machine is built, so the blades normally show the playfield
         itself. Polished metal against the scene environment is the right
         fallback because it still sweeps from near-black to bright as the
         camera slides along it, which no matte black panel ever does. No map,
         so vibrance.js -- which only converts mapped materials at low
         metalness -- never touches it. */
      /* One dim-room cube map is shared by the mirror blades and by the
         playfield glass, so the pane reflects the same room the blades do. */
      mirror: new THREE.MeshStandardMaterial({
        color: 0xffffff, metalness: 1.0, roughness: 0.07,
        envMap: mirrorEnv, envMapIntensity: 1.35
      }),
      /* THE PLAYFIELD GLASS.

         A clear pane has no colour of its own: every pixel you see in it is
         REFLECTED light, so this is a reflection layer and nothing else,
         composited over the field at the pane's own Fresnel reflectance.
         Schlick from F0 = 0.04 (air to glass) means the pane returns 4% of
         the room head-on and everything it has at grazing incidence --
         which is why a real pane shows almost nothing over the middle of
         the field and turns into a mirror toward the backbox.

         Normal blending with gl_FragColor.a = F gives exactly
         mix(field, reflection, F): the thin-pane energy split, so the
         painting keeps its colour (4% of it is traded for the reflection,
         not covered by it) and the transmittance and the reflectance stay
         in step. What the pane must never be is a FILM. The version this
         replaces mixed a pale blue-white base in at a constant alpha, drew
         a gaussian `stripe` across the sheet, and drew a bright border
         round it -- three ways to paint light onto the glass instead of
         reflecting it, and the stripe is exactly what a viewer reads as a
         faint white line lying on the playfield. Nothing here is added:
         all that reaches the eye off this pane is sampled from the room
         cube along the reflected view (makeGlassEnv), so the highlights are
         the room's own ceiling strips and they MOVE ACROSS THE PANE as the
         camera does, which paint cannot do.

         glassScuffs (makeGlassSurface) is the sheet's wipe marks and dust.
         A scuff cannot be seen as a mark on a 4%-reflective surface -- what
         it does is smear what the sheet reflects, so the map JITTERS the
         reflection vector rather than adding any brightness: the lights
         stretch along the wipes and the dust softens a few pixels of them.
         depthWrite stays off so the glass can never cut the playfield out
         of the depth buffer, and it is tone mapped with the rest of the
         scene so the reflection sits in the same grade as the cabinet. */
      glass: new THREE.ShaderMaterial({
        name: 'clear glass reflection', transparent: true,
        depthWrite: false, side: THREE.FrontSide, toneMapped: true,
        uniforms: {
          glassEnv: { value: glassEnv },
          glassScuffs: { value: glassScuffs },
          glassGain: { value: 3.4 },
          glassF0: { value: 0.04 }
        },
        vertexShader: 'varying vec2 paneUV; varying vec3 paneNormal; varying vec3 paneView; void main(){paneUV=uv; vec4 world=modelMatrix*vec4(position,1.0); paneNormal=normalize(mat3(modelMatrix)*normal); paneView=cameraPosition-world.xyz; gl_Position=projectionMatrix*viewMatrix*world;}',
        fragmentShader: 'uniform samplerCube glassEnv; uniform sampler2D glassScuffs; uniform float glassGain; uniform float glassF0; varying vec2 paneUV; varying vec3 paneNormal; varying vec3 paneView; void main(){ vec3 n=normalize(paneNormal); vec3 v=normalize(paneView); float NoV=clamp(dot(n,v),0.0,1.0); float F=glassF0+(1.0-glassF0)*pow(1.0-NoV,5.0); vec3 r=reflect(-v,n); float scuff=texture2D(glassScuffs,paneUV).r; vec3 smear=normalize(r+vec3(scuff*0.045,scuff*0.030,scuff*0.018)); vec3 refl=mix(textureCube(glassEnv,r).rgb,textureCube(glassEnv,smear).rgb,scuff); gl_FragColor=vec4(refl*glassGain,F);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'
      })
    };
    for (var mk in M) if (M.hasOwnProperty(mk)) owned.mat.push(M[mk]);

    var geoCache = {};
    function boxGeo(w, h, d) {
      var k = 'b' + w + '_' + h + '_' + d;
      if (!geoCache[k]) geoCache[k] = own(new THREE.BoxGeometry(w, h, d));
      return geoCache[k];
    }
    function cylGeo(rt, rb, h, seg) {
      var k = 'c' + rt + '_' + rb + '_' + h + '_' + seg;
      if (!geoCache[k]) geoCache[k] = own(new THREE.CylinderGeometry(rt, rb, h, seg));
      return geoCache[k];
    }
    function discGeo(r, seg) {
      var k = 'd' + r + '_' + seg;
      if (!geoCache[k]) geoCache[k] = own(new THREE.CircleGeometry(r, seg));
      return geoCache[k];
    }
    function planeGeo(w, h) {
      var k = 'p' + w + '_' + h;
      if (!geoCache[k]) geoCache[k] = own(new THREE.PlaneGeometry(w, h));
      return geoCache[k];
    }
    /* A ROUNDED BOX: w across (X), h deep (Y), d high (Z), every edge and
       both ends rounded by r. ExtrudeGeometry expands OUTWARD by bevelSize
       (measured in dev/_bevel.html), so a rounded-rect outline of
       (w - 2r) x (h - 2r) bevelled by r and extruded to (d - 2r) rebuilds
       exactly w x h x d with the rounding baked in -- one draw call instead
       of the six or eight slabs it takes to fake a bull nose by hand. Used
       for the lockdown bar, which the reference draws bull-nosed. */
    function roundGeo(w, h, d, r, seg) {
      var k = 'rnd' + w + '_' + h + '_' + d + '_' + r + '_' + seg;
      if (geoCache[k]) return geoCache[k];
      var hw = w / 2 - r, hh = h / 2 - r, cr = Math.max(0.03, r * 0.6);
      var s = new THREE.Shape();
      s.moveTo(-hw + cr, -hh);
      s.lineTo(hw - cr, -hh);
      s.quadraticCurveTo(hw, -hh, hw, -hh + cr);
      s.lineTo(hw, hh - cr);
      s.quadraticCurveTo(hw, hh, hw - cr, hh);
      s.lineTo(-hw + cr, hh);
      s.quadraticCurveTo(-hw, hh, -hw, hh - cr);
      s.lineTo(-hw, -hh + cr);
      s.quadraticCurveTo(-hw, -hh, -hw + cr, -hh);
      var g = new THREE.ExtrudeGeometry(s, {
        depth: d - 2 * r, bevelEnabled: true, bevelSize: r, bevelThickness: r,
        bevelSegments: seg || 3, curveSegments: 4, steps: 1
      });
      g.translate(0, 0, -(d - 2 * r) / 2);       /* centre it on the axis */
      geoCache[k] = own(g);
      return geoCache[k];
    }

    /* A trapezoid panel -- the cabinet's flank is a wedge, so its artwork is
       a trapezoid too. Local +X is the tall end of THIS panel, local Y is
       measured up from its bottom edge, and the UV square matches the
       rectified flank texture exactly: u = 0 is the texture's "ONE" end.
       The caller decides which end of the cabinet local +X lands on (see the
       side-art block); this function only knows the panel's own shape. */
    function trapGeo(len, hFoot, hHead) {
      var k = 't' + len + '_' + hFoot + '_' + hHead;
      if (!geoCache[k]) {
        var hl = len / 2;
        var g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
          -hl, 0, 0, hl, 0, 0, hl, hHead, 0, -hl, hFoot, 0]), 3));
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
          0, 0, 1, 0, 1, 1, 0, 1]), 2));
        g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([
          0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
        g.setIndex([0, 1, 2, 0, 2, 3]);
        geoCache[k] = own(g);
      }
      return geoCache[k];
    }
    /* A wedge prism: the cabinet's side wall, tall at the head and short at
       the foot, extruded to the plywood's thickness. Built from a Shape so
       the winding is handled for us, then mapped out of the shape plane:
       shape X -> table Y, shape Y -> table Z, extrusion -> table X. */
    function wedgeGeo(len, hFoot, hHead, thick) {
      var k = 'w' + len + '_' + hFoot + '_' + hHead + '_' + thick;
      if (!geoCache[k]) {
        var s = new THREE.Shape();
        s.moveTo(-len / 2, 0);
        s.lineTo(len / 2, 0);
        s.lineTo(len / 2, hHead);
        s.lineTo(-len / 2, hFoot);
        s.closePath();
        var g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false });
        g.applyMatrix4(new THREE.Matrix4().set(
          0, 0, 1, 0,
          1, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, 0, 1));
        g.translate(-thick / 2, 0, 0);
        geoCache[k] = own(g);
      }
      return geoCache[k];
    }
    /* The leg: black ANGLE IRON, bolted through the cabinet's corner. The
       reference's own leg close-ups (dev/_polish_zoom.html, crops out of
       assets/3dref.jpg) show an L-section bar -- one flat face turned
       OUTWARD with two bolt heads standing proud of it, and a return flange
       folded in behind. Not the round tube of the first pass, and not the
       plain octagon that replaced it: an octagon has no flange and no bolts,
       which is exactly why those legs read as shop-bought tube.

       An L cannot be an octagon, so the section is built by hand: six
       outline points in the leg's own X-Z plane (local +X is the outward
       normal, local +Z the flange side), swept along local +Y -- the axis
       bladeGeo used, so the caller's frame is unchanged. The outer face is
       one straight plane the whole way down while the inner face and the
       depth taper toward the foot, which is what the drawing measures: the
       outer face finishes flush with the flank at the top and a little proud
       at the foot, because the whole blade is SPLAYED outward rather than
       the section sliding over.

       Faces are emitted one quad at a time, each with its own vertices, and
       computeVertexNormals() then gives every quad a flat normal: there is
       no shared index to wound inconsistently, which matters here because an
       L is concave and its cap is two rectangles, not one polygon. */
    function angleGeo(wT, dT, wB, dB, h, iron) {
      var k = 'ang' + wT + '_' + dT + '_' + wB + '_' + dB + '_' + h + '_' + iron;
      if (geoCache[k]) return geoCache[k];
      var T = wT / 2, D = dT / 2, tB = wB / 2, dB2 = dB / 2;
      function ring(s) {                          /* s: 0 = top, 1 = foot */
        var xt = T, xi = T + s * (tB - T), z = D + s * (dB2 - D);
        return [
          [xt, -z], [xt, z], [xi, z],
          [xi, z - iron], [xt - iron, z - iron], [xt - iron, -z]
        ];
      }
      var A = ring(0), B = ring(1), i;
      var top = [], bot = [];
      for (i = 0; i < 6; i++) {
        top.push([A[i][0], -h / 2, A[i][1]]);
        bot.push([B[i][0], h / 2, B[i][1]]);
      }
      var pos = [];
      function quad(a, b, c, d) {                 /* ccw seen from outside */
        pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
        pos.push(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2]);
      }
      for (i = 0; i < 6; i++) {
        var j = (i + 1) % 6;
        quad(top[i], bot[i], bot[j], top[j]);
      }
      /* the cap is the L's two rectangles: the outer plate, then the flange.
         A fan from one corner would span the notch and cap a rectangle that
         is not there. */
      quad(bot[5], bot[4], bot[1], bot[0]);
      quad(bot[2], bot[1], bot[4], bot[3]);
      quad(top[0], top[1], top[4], top[5]);
      quad(top[3], top[4], top[1], top[2]);
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      g.computeVertexNormals();
      geoCache[k] = own(g);
      return geoCache[k];
    }
    function bodyMat(tex, rough, metal) {
      var m = new THREE.MeshStandardMaterial({
        map: tex, roughness: rough === undefined ? 0.62 : rough,
        metalness: metal === undefined ? 0.06 : metal
      });
      owned.mat.push(m);
      return m;
    }
    function addBox(w, h, d, x, y, z, mat) {
      var m = new THREE.Mesh(boxGeo(w, h, d), mat);
      m.position.set(x - CX, y - CY, z);
      root.add(m); return m;
    }
    /* Panels are placed from a right/up pair: the artwork's normal becomes
       right x up, so a decal lands the right way up on whichever face it
       belongs to and no rotation order has to be reasoned about. */
    var AX = new THREE.Vector3(1, 0, 0);
    var AY = new THREE.Vector3(0, 1, 0);
    var AZ = new THREE.Vector3(0, 0, 1);
    var NEG_Y = new THREE.Vector3(0, -1, 0);
    var BASIS = new THREE.Matrix4();
    function addPanel(tex, w, h, x, y, z, right, up, mat) {
      var r = right.clone().normalize();
      var n = new THREE.Vector3().crossVectors(r, up).normalize();
      var u = new THREE.Vector3().crossVectors(n, r).normalize();
      var m = new THREE.Mesh(planeGeo(w, h), mat || bodyMat(tex));
      m.quaternion.setFromRotationMatrix(BASIS.makeBasis(r, u, n));
      m.position.set(x - CX, y - CY, z);
      root.add(m); return m;
    }
    /* Same idea, but for the wedge flank: x/y/z locate the panel's bottom
       edge at its centre, and the geometry's local +X is the head end. */
    function addTrap(tex, len, hFoot, hHead, x, y, z, right, up, mat) {
      var r = right.clone().normalize();
      var n = new THREE.Vector3().crossVectors(r, up).normalize();
      var u = new THREE.Vector3().crossVectors(n, r).normalize();
      var m = new THREE.Mesh(trapGeo(len, hFoot, hHead), mat || bodyMat(tex));
      m.quaternion.setFromRotationMatrix(BASIS.makeBasis(r, u, n));
      m.position.set(x - CX, y - CY, z);
      root.add(m); return m;
    }

    /* the two world axes expressed in table space (see the header) */
    var SIN = Math.sin(TILT), COS = Math.cos(TILT);
    var DOWN = new THREE.Vector3(0, -SIN, -COS);      /* world down */
    function worldY(y, z) { return CY + (y - CY) * SIN + z * COS; }

    /* ---------------- body dimensions ----------------
       z = 0 is the playfield surface; one unit is 0.81".

       The reference's side elevation (assets/3dref.jpg, bottom-left) shows a
       WEDGE, not a slab: its body runs x 50..385 and y 886..1066, i.e. 336 px
       long, 100 px tall at the foot and 180 px at the head, with the top
       edge falling 80 px along the run (dev/_refside3.py, run-structured so
       the two legs never read as one span). The front ortho's own front face
       is the same 100 px tall, which is what proves the two panels share a
       vertical scale -- so the horizontal scale can be fixed from the front
       panel's body width, 199 px = the cabinet's 27.8 u, and the whole
       profile read off at 0.1397 u/px:
         front face      100 px -> 14.0 u
         head end        180 px -> 25.1 u
         lid drop         80 px -> 11.2 u   => 12.3 degrees of extra pitch
         legs            147 px -> 20.5 u
       The playfield keeps its regulation 6.5 degrees; the extra pitch on the
       LID is the headroom the ramps live in, exactly as the reference draws
       it, and it is why the backbox stands on the lid at the head end rather
       than on the playfield plane. (The side panel's horizontals are drawn
       compressed -- 336 px of body against a 336 px run that should be
       ~1.08x wider -- so only its verticals and the front panel's width are
       used for scale.) */
    var WALL = 0.93;                             /* 3/4" plywood        */
    var OUT_W = 27.8;                            /* 22.5" cabinet       */
    var BODY_L = 50.8;                           /* 1.238 x playfield   */
    var BOT = -9.9;
    var BODY_H_FOOT = 14.0;                      /* the 100 px front face */
    var LID_PITCH = 12.3 * Math.PI / 180;        /* extra tilt on the lid */
    var BODY_H_HEAD = BODY_H_FOOT + BODY_L * Math.tan(LID_PITCH);
    var TOP_FOOT = BOT + BODY_H_FOOT;            /* the lid at the foot */
    var TOP_HEAD = BOT + BODY_H_HEAD;            /* the lid at the head */
    var MID_X = CX, MID_Y = CY;
    var OUT_L = MID_X - OUT_W / 2, OUT_R = MID_X + OUT_W / 2;
    var FOOT_Y = MID_Y - BODY_L / 2, HEAD_Y = MID_Y + BODY_L / 2;
    var Z_FOOT = BOT + BODY_H_FOOT / 2, Z_HEAD = BOT + BODY_H_HEAD / 2;
    function topAt(y) {
      var t = (y - FOOT_Y) / BODY_L;             /* 0 at the foot, 1 at the head */
      return TOP_FOOT + t * (TOP_HEAD - TOP_FOOT);
    }

    /* ---------------- cabinet shell ----------------
       Thin walls, exactly as plywood: the playfield edge sits just inside
       them, which is what makes the cabinet read at the right thickness.
       The two side walls are wedges; the end boards are plain rectangles cut
       to the lid height at their own end.

       Every one of these is M.panel, i.e. flat black, because none of them
       carries artwork: the outer faces are covered by the flank prints and
       the inner faces are the vertical walls you look down onto from the
       player's view. At the wood material those inner faces came up a pale
       tan under the environment map, which read as bare unfinished timber
       either side of the playfield. */
    addBox(OUT_W - WALL * 2, BODY_L - WALL * 2, 0.5, MID_X, MID_Y, BOT + 0.25, M.panel);
    [-1, 1].forEach(function (s) {
      var w = new THREE.Mesh(wedgeGeo(BODY_L, BODY_H_FOOT, BODY_H_HEAD, WALL), M.panel);
      w.position.set((s < 0 ? OUT_L + WALL / 2 : OUT_R - WALL / 2) - CX, MID_Y - CY, BOT);
      root.add(w);
    });
    addBox(OUT_W, WALL, BODY_H_FOOT, MID_X, FOOT_Y + WALL / 2, Z_FOOT, M.panel);
    addBox(OUT_W, WALL, BODY_H_HEAD, MID_X, HEAD_Y - WALL / 2, Z_HEAD, M.panel);

    /* ---------------- mirror blades ----------------
       Polished stainless down the inside of ALL THREE walls of the opening --
       the two flanks and the head wall -- which is how a real cabinet's
       interior is dressed. They are separate flat panels a hair inside their
       wall rather than the walls' own inner faces, so they read as hardware
       you could unscrew, and they sit ON the floor pan rather than through it.

       addTrap's local +X is the tall end of the panel, so the two sides hand
       their height pair over in opposite orders -- the same trick the flank
       art plays above: on the right wall local +X points at the FOOT.

       The head wall is a plain rectangle, not a wedge (only the lid line
       climbs), so it takes addPanel; and it is the one panel facing the
       player, so it is the one that mirrors the painting back at them.
       addPanel's basis is (right, up, normal): right = AX and up = AZ put its
       normal on -Y, which is the way installMirror() needs it -- that pass
       renders only when the camera is on the normal's side, so a panel facing
       away costs nothing. Its height is inHH, the same top line the two blades
       finish on at this end, and its width runs 0.01 INTO each blade so the
       three meet without a seam. */
    var inFoot = FOOT_Y + WALL, inHead = HEAD_Y - WALL;
    var inLen = inHead - inFoot, inBase = BOT + 0.5;
    var inHF = topAt(inFoot) - inBase, inHH = topAt(inHead) - inBase;
    mirrors.push(addTrap(null, inLen, inHF, inHH, OUT_L + WALL + 0.03, MID_Y, inBase, AY, AZ, M.mirror));
    mirrors.push(addTrap(null, inLen, inHH, inHF, OUT_R - WALL - 0.03, MID_Y, inBase, NEG_Y, AZ, M.mirror));
    var inW = OUT_W - WALL * 2 + 0.02;
    mirrors.push(addPanel(null, inW, inHH, MID_X, HEAD_Y - WALL - 0.03,
      inBase + inHH / 2, AX, AZ, M.mirror));
    mirrors.forEach(function (mirror) { owned.mat.push(installMirror(mirror, mirrors, reflectionTargets)); });

    /* ---------------- the glass lid ----------------
       The reference's 3/4 view shows a real sheet of glass: the painting
       reads through it and a highlight sits on top of it. It lies in the
       walls just below the lid line -- the side rails stay proud of it -- and
       runs from under the lockdown bar back to the head wall. It laps into
       each wall so its edge disappears into the groove, exactly as a real
       pane does. */
    function glassZ(y) { return topAt(y) - 0.52; }
    /* The pane now starts at the front board's inner face (FOOT_Y + WALL, which
       is also the playfield's own front edge) rather than 1 u upfield of it.
       That closes the strip of bare playfield that used to show in front of the
       glass, and it puts the glass's front edge exactly where the lockdown bar
       clamps it -- see the reseated bar below. */
    var gY0 = FOOT_Y + WALL, gY1 = HEAD_Y - WALL - 0.35;
    var glass = new THREE.Mesh(
      boxGeo(OUT_W - WALL, (gY1 - gY0) / Math.cos(LID_PITCH), 0.09), M.glass);
    glass.position.set(MID_X - CX, (gY0 + gY1) / 2 - CY, glassZ((gY0 + gY1) / 2));
    glass.rotation.x = LID_PITCH;
    glass.userData.noVibrance = true;
    glass.name = 'clear playfield glass';
    root.add(glass);
    /* The polished pane edge is drawn by the glass shader itself (the
       `edge` term along its own UV border). A separate outline object used
       to sit here and, because it is depth-tested against the field, it
       read as a stray dark line lying ON the playfield rather than as the
       rim of a sheet of glass -- so the shader's border is the only one. */

    /* ---------------- side art ----------------
       One texture, both flanks, each panel laid out so the title READS
       left-to-right when you stand outside that side -- which is how the
       reference draws it (its side elevation and its 3/4 view both show
       ONEDROP the right way round, dev/3dref-match.md section 5).

       That needs the two panels to be laid out differently, because the
       flank's own left-to-right runs the opposite way on each side of the
       cabinet: standing outside the RIGHT wall the head is on your right,
       standing outside the LEFT wall it is on your left. addTrap always
       builds local +X along `right` and reads the texture's u = 0 (the "ONE"
       end) at local -X, so all that has to change is which end of the wedge
       local -X lands on:
         right wall: right = +Y (head) -> u = 0 at the FOOT
         left  wall: right = -Y (foot) -> u = 0 at the HEAD
       and the height pair is handed over in the matching order, because
       trapGeo takes its tall value as `hHead` in its own local frame. Both
       walls still end up tall at the head; get this wrong and the wedge
       slopes the wrong way and the print runs backwards, which is exactly
       what the left flank used to do.

       addTrap anchors the panel at its bottom edge and its mid-length, so
       the Y here is MID_Y while the Z is BOT. */
    var sideTex = ownTex(makeFlankTexture());
    addTrap(sideTex, BODY_L, BODY_H_FOOT, BODY_H_HEAD, OUT_R + 0.02, MID_Y, BOT, AY, AZ);
    addTrap(sideTex, BODY_L, BODY_H_HEAD, BODY_H_FOOT, OUT_L - 0.02, MID_Y, BOT, NEG_Y, AZ);

    /* ---------------- front panel ----------------
       The sheet paints the whole face — coin door, coin slots, start
       button and the rasta surround — so it goes on as one piece at its
       own aspect, exactly filling the face. Its PAINTED PLUNGER is the one
       thing that is not carried over; see makeFrontFace below. */
    var faceY = FOOT_Y - 0.02;
    var frontTex = ownTex(A.ready ? makeFrontFace(A) : null);
    if (frontTex) addPanel(frontTex, OUT_W, BODY_H_FOOT, MID_X, faceY, Z_FOOT, AX, AZ);

    /* The face texture, with the sheet's own plunger covered up.

       The sheet paints a plunger on the face: a dark plate with a knurled
       knob and a chrome crescent, hung low into the rasta bands on the
       right of the face. Measured against the sheet, in panel pixels of
       its 318 x 151: the plunger's box is x 269..301, y 0..62, and the
       whole field left of it (x 244..268) is the same flat green-over-
       yellow under the same top rule, with no drawing in it at all.

       The machine's REAL plunger comes through the face elsewhere — lower
       and further out, on the shooter lane's own line, where the ball is
       (playfield.js measures that line and bolts its ferrule on it). Two
       plungers a hand's width apart, neither of them quite where the rod
       is, is worse than no painted one: the eye reads it as a mistake
       rather than as detail. So the painted plunger is covered with that
       flat field — a horizontal stretch of a flat two-band field lines up
       with itself, so the graft has nothing to get wrong — and the
       hardware on the face is then the only plunger the machine has. */
    function makeFrontFace(A) {
      var r = A.rectPx('frontArt');
      if (!r || !A.image) return null;
      var pxW = 1024, pxH = 486;
      var c = document.createElement('canvas');
      c.width = pxW; c.height = pxH;
      var ctx = c.getContext('2d');
      ctx.drawImage(A.image, r.sx, r.sy, r.sw, r.sh, 0, 0, pxW, pxH);

      /* panel pixels -> canvas pixels, on both axes */
      var kx = pxW / r.sw, ky = pxH / r.sh;
      var PATCH = { x: 269, w: 32, y: 0, h: 62 };    /* the painted plunger */
      var CLEAN = { x: 244, w: 25 };                 /* the flat field left of it */
      var px = PATCH.x * kx, py = PATCH.y * ky;
      var pw = PATCH.w * kx, ph = PATCH.h * ky;
      var sx = CLEAN.x * kx, sw = CLEAN.w * kx;
      /* copy through a scratch canvas: drawing a canvas onto itself over
         overlapping pixels is not portable across browsers */
      var s = document.createElement('canvas');
      s.width = Math.ceil(sw); s.height = Math.ceil(ph);
      s.getContext('2d').drawImage(c, sx, py, sw, ph, 0, 0, s.width, s.height);
      ctx.drawImage(s, 0, 0, s.width, s.height, px, py, pw, ph);

      var t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    }

    /* ---------------- flipper buttons ----------------
       Red in a black collar, one per flank, and they SINK INTO that collar
       when the flipper is pulled (setFlipper below, driven from game.js's
       pressLeft/pressRight).

       The reference puts them high and well FORWARD -- a red disc with a
       dark ring sitting just under the glass line about 2 u back from the
       cabinet's front end (the side-elevation button crop in
       dev/_polish_zoom.html, sheet x 371 of a body ending at 385) -- rather
       than in the middle of the flank, which is where a player's hands
       actually are. They cannot go quite that far forward here because the
       front leg's blade lives at that corner, so they sit 2.9 u back: clear
       of the iron, still at the front corner of the machine. */
    var flipperBtns = [];
    [-1, 1].forEach(function (s) {
      var grp = new THREE.Group();
      var buttonY = FOOT_Y + 2.9;
      var oldButtonZ = TOP_FOOT - 2.75;
      var glassTopZ = glassZ(buttonY) + 0.045;
      grp.name = s < 0 ? 'left flipper button' : 'right flipper button';
      grp.position.set((s < 0 ? OUT_L : OUT_R) - CX,
        buttonY - CY, (oldButtonZ + glassTopZ) / 2);
      root.add(grp);
      /* the collar, flat on the flank */
      var ring = new THREE.Mesh(cylGeo(0.80, 0.80, 0.24, 20), M.black);
      ring.rotation.z = Math.PI / 2;
      ring.position.x = s * 0.12;
      grp.add(ring);
      /* the button rides on its own X offset so it can travel inward */
      var btn = new THREE.Mesh(cylGeo(0.54, 0.54, 0.50, 20), M.redBtn);
      btn.rotation.z = Math.PI / 2;
      btn.position.x = s * 0.46;
      grp.add(btn);
      flipperBtns.push({ btn: btn, s: s, x0: s * 0.46, press: 0, target: 0 });
    });

    /* ============ LID TRIM ===================================
       The moulding that holds the glass down, as ONE piece: a single
       bull-nosed section (roundGeo -- "the outer edge needs to be curved")
       run down each flank and across the front, all three in the same
       material, so the frame reads as one continuous bar of hardware and
       not as a lockdown bar plus two unrelated rails.

       Everything is seated off the GLASS line, not off the lid, because
       that is the only way the tops come out flush. The pair it replaces
       were placed independently -- the rails at topAt(mid) + 0.12 and the
       bar at glassZ(front) + 0.55 -- and at the front corner the rail's
       top measured 0.67 u ABOVE the bar's: a visible step exactly where
       the design says "one piece". */
    var TRIM_W = 0.66;          /* section: width across the cabinet        */
    var TRIM_H = 0.52;          /* section: height                          */
    var TRIM_R = 0.22;          /* the bull nose on every outside edge      */
    var TRIM_RISE = 0.90;       /* top of the moulding over the pane's top  */
    var PANE_T = 0.09;
    function trimZ(y) { return glassZ(y) + PANE_T / 2 + TRIM_RISE - TRIM_H / 2; }

    /* the front run -- the lockdown bar. Its ends are flush with the flanks
       (LD_W = OUT_W) so the side runs' outer faces meet them with no step,
       and its depth is the 1.6 the reference measures from the glass's
       front edge forward; LD_R and the old 0.5 height are gone, because
       the section is now shared. */
    var LD_W = OUT_W, LD_D = 1.6;
    var ldY = gY0 - LD_D / 2;
    var ldb = new THREE.Mesh(roundGeo(LD_W, LD_D, TRIM_H, TRIM_R), M.trim);
    ldb.position.set(MID_X - CX, ldY - CY, trimZ(ldY));
    ldb.rotation.x = LID_PITCH;
    root.add(ldb);

    /* the two side runs: same section, tipped with the lid, starting inside
       the bar's own middle so the corner has no seam to see, and running to
       the head end. The last few units pass under the backbox, which is
       where a real machine's rails finish. */
    var sideY0 = ldY, sideY1 = HEAD_Y;
    var sideLen = (sideY1 - sideY0) / Math.cos(LID_PITCH);
    var sideCY = (sideY0 + sideY1) / 2;
    [-1, 1].forEach(function (s) {
      var run = new THREE.Mesh(roundGeo(TRIM_W, sideLen, TRIM_H, TRIM_R), M.trim);
      /* OUT_W is already measured about MID_X (= CX), so this is a LOCAL x:
         subtracting CX again put both runs 1.5 u off their flank, one inside
         the cabinet and one outside it. */
      run.position.set(s * (OUT_W / 2 - TRIM_W / 2), sideCY - CY, trimZ(sideCY));
      run.rotation.x = LID_PITCH;
      root.add(run);
    });
    /* The bar's SEAT keeps the two things that mattered, both measured
       earlier. Its upfield edge lands on gY0 (the glass's own front edge),
       not 2.1 u onto the playfield: sitting further up it eclipsed the
       flipper bats (1 of 308 sampled pixels over the flipper well was bat;
       with the bar hidden, 10 of 308 are). And its depth is 1.6, so it
       overhangs the front board by 0.67 u instead of 1.2 u out into air. */
    /* the SKIRT: the black band on the front of the cabinet that the bar folds
       into, and the thing the reference's front view actually measures at 1.25 u
       (dev/3dref-match.md section 2). It stands on the front face's own plane
       and its top is flush with the bar's, so it adds no occlusion at all. */
    var skirt = new THREE.Mesh(roundGeo(OUT_W - 0.3, 0.5, 1.25, 0.17), M.black);
    skirt.position.set(MID_X - CX, FOOT_Y - 0.08 - CY,
      trimZ(ldY) + TRIM_H / 2 - 1.25 / 2);
    root.add(skirt);

    /* NO APRON PLATE. This file used to stand a 25.2 x 4.2 x 2.4 block across
       the foot of the playfield -- covering y -4.2..0, i.e. straight over the
       drain AND over the flippers, whose pivots sit at y -0.12 -- with the
       sheet's two instruction cards laid on its top face. Being 2.4 tall it
       put that top face at z 3.8, barely under the glass, so from the
       player's angle it read as a grey frame around the front of the glass
       and it hid the flippers completely; from the reference's own top-down
       panel (dev/crops/ref_topdown.png) the field's foot shows the flippers,
       the drain and the painting right to the edge, with nothing over them.
       The lockdown bar and the two side rails already close the front, so
       the block is gone and the painting underneath it is now the front of
       the game. */

    /* ---------------- legs ----------------
       The reference legs are flat black ANGLE IRON, not tube: the front
       ortho and the side elevation both measure the section at ~2.4 u and
       both show a straight-edged bar with a single soft highlight down its
       outer face, and the attachment close-ups show two bolt heads standing
       proud of that face right at the corner (dev/3dref-match.md section 3,
       dev/_polish_zoom.html). The section is an L -- see angleGeo.

       The TOP of each leg is not a pad: the iron runs on up past the
       cabinet's bottom edge and lies against the corner, bolted through it
       with the two hex heads below. It is cut to overlap the corner by
       LEG_TOP so the leg and its fixing read as one piece, and its outer
       face finishes on the flank's own plane.

       Because the cabinet is reclined, the head-end anchors sit HIGHER in
       world space, so those legs must be longer -- exactly why real machines
       ship extended rear levellers. Each leg is cut to land on one common
       floor plane instead of all being the same length.

       Both reference panels were re-measured for the section and the drop
       (dev/_reffront3.py / dev/_refside3.py, run-structured so the two legs
       never read as one span):
         front ortho   legs y 462..609 = 147 px, 18-19 px wide at the top
                       tapering to 15 px at the foot
         side elev.    legs y 1066..1218 = 152 px, 14-15 px wide
       At the 0.1397 u/px the body's 199 px front width sets, that is a 20.5 u
       drop and a section ~2.6 u across the front, ~2.2 u the other way. The
       earlier 1.3 u section and 16.6 u drop both came from eyeballing a
       magnified crop instead of profiling the panel. */
    var LEG_MIN = 20.5;
    var LEG_T = 2.45, LEG_D = 2.15;              /* blade section at the top  */
    var LEG_T_BOT = 2.00, LEG_D_BOT = 1.75;      /* tapering to the foot      */
    var LEG_IRON = 0.44;                         /* the angle iron's gauge    */
    var LEG_TOP = 3.6;                           /* blade overlap on the corner */
    var LEG_PAD = 0.03;                          /* outer face proud of the flank */
    var SPLAY = 0.065;                           /* ~5 deg out at the feet    */
    var OUT_X = new THREE.Vector3(1, 0, 0);
    var OUT_Y = new THREE.Vector3(0, 1, 0);
    /* how far in from the flank the blade's AXIS sits, so that its outer
       face lands on the flank's own plane (a hair proud, so the two never
       fight for the same depth) */
    var bladeIn = LEG_T / 2 - LEG_PAD;
    var topZ = BOT + LEG_TOP;
    var corners = [
      [OUT_L, FOOT_Y, -1, -1], [OUT_R, FOOT_Y, 1, -1],
      [OUT_L, HEAD_Y, -1, 1], [OUT_R, HEAD_Y, 1, 1]
    ];
    var floorY = Math.min.apply(null, corners.map(function (c) {
      return worldY(c[1], BOT);
    })) - LEG_MIN;

    corners.forEach(function (c) {
      var cx = c[0], cy = c[1], s = c[2], e = c[3];
      var az = topZ;
      var drop = worldY(c[1], topZ) - floorY;         /* world height to lose */
      var dir = DOWN.clone()
        .addScaledVector(OUT_X, s * SPLAY)
        .addScaledVector(OUT_Y, e * SPLAY)
        .normalize();
      /* path length along `dir` that loses exactly `drop` of world height */
      var len = drop / -(dir.y * SIN + dir.z * COS);

      /* ONE BLADE of the leg's angle iron, with the two hex bolts the
         reference draws on it. `outvBase` is which way that blade faces:
         the flank's own plane for the side blade, the cabinet's end face for
         the front / back one. Everything else -- the splay, the length, the
         floor it lands on -- is the leg's, so the two blades of a corner are
         the same piece of iron turned 90 degrees, which is what makes them
         read as one bracket. Local +Y runs down the leg and local +X is the
         blade's outward normal, so the chamfered outer face always faces
         out however the leg is splayed or however long it has to be cut. */
      function addBlade(ax, ay, outvBase) {
        var ex = ax + dir.x * len, ey = ay + dir.y * len, ez = az + dir.z * len;
        var fwd = dir.clone();
        var outv = outvBase.clone();
        outv.addScaledVector(fwd, -outv.dot(fwd)).normalize();
        var sidev = new THREE.Vector3().crossVectors(outv, fwd).normalize();
        var legQ = new THREE.Quaternion().setFromRotationMatrix(
          BASIS.makeBasis(outv, fwd, sidev));

        var blade = new THREE.Mesh(
          angleGeo(LEG_T, LEG_D, LEG_T_BOT, LEG_D_BOT, len, LEG_IRON), M.black);
        blade.position.set((ax + ex) / 2, (ay + ey) / 2, (az + ez) / 2);
        blade.quaternion.copy(legQ);
        root.add(blade);

        /* SIX sided, because a bolt you can see is a bolt with flats on it,
           and placed in the blade's own frame -- down `fwd`, out along
           `outv` -- so they sit on that outer face whatever the splay.
           Black oxide hardware, in M.black with the rest of the leg: the
           old M.rail put two gunmetal hexes on a black blade, which is
           exactly the kind of bright spot that un-blackens the leg. */
        var boltQ = new THREE.Quaternion().setFromRotationMatrix(BASIS.makeBasis(
          fwd, outv, new THREE.Vector3().crossVectors(fwd, outv).normalize()));
        var boltOff = LEG_T / 2 + 0.08;           /* just clear of the face */
        [0.85, 2.75].forEach(function (d) {
          var bolt = new THREE.Mesh(cylGeo(0.30, 0.30, 0.36, 6), M.black);
          bolt.position.set(ax + fwd.x * d + outv.x * boltOff,
            ay + fwd.y * d + outv.y * boltOff,
            az + fwd.z * d + outv.z * boltOff);
          bolt.quaternion.copy(boltQ);
          root.add(bolt);
        });
        return { x: ex, y: ey, z: ez, q: legQ };
      }

      /* table -> root-local: everything below lives in the cabinet's own
         frame, which is centred on the table, so the offsets come off here */
      /* the SIDE blade: outer face on the flank's own plane */
      var end = addBlade(cx - s * bladeIn - CX, cy - e * (LEG_D / 2 + 0.06) - CY,
        new THREE.Vector3(s, 0, 0));
      /* the FRONT blade on the front legs, the BACK blade on the back ones:
         the leg's front ortho shows both flanges of the bracket, but this
         machine only ever had the side one. Same iron, same bolts, turned
         90 degrees onto the cabinet's end face -- and its axis is inset by
         LEG_D/2 the way the side blade's is inset by LEG_T/2, so the two
         meet on the corner exactly as the reference's folded bracket does. */
      addBlade(cx - s * (LEG_D / 2 + 0.06) - CX, cy - e * bladeIn - CY,
        new THREE.Vector3(0, e, 0));

      /* the FOOT: the reference's legs end in a flared pad, not on a chrome
         disc. Its front ortho shows the leg's two dark flanges (w5 + w9 px)
         running down to y 587 and then, over the last 6-7 px, widening
         outward to 15 px and stopping dead on the floor -- a black flare,
         ~0.9 u tall and 2.1 u across. The 3.2 u chrome cylinder this
         replaces was neither the right size nor the right colour. */
      /* The FOOT: the reference's legs end in a flared pad, not on a chrome
         disc. Its front ortho shows the leg's two dark flanges (w5 + w9 px)
         running down to y 587 and then, over the last 6-7 px, widening
         outward to 15 px and stopping dead on the floor -- a black flare,
         ~0.9 u tall and 2.1 u across. The 3.2 u chrome cylinder this
         replaces was neither the right size nor the right colour.

         The pad stands UPRIGHT: inside buildMachine the machine's own up is
         +z (the root is counter-rotated out of the incline later, by the
         caller), so the pad is left unrotated and simply parked half its
         height up the leg's end. A pad tilted with the leg -- which is what
         copying the blade's quaternion did -- puts its rim through the floor
         (measured 0.23 u at the foot, 0.6 at the long rear pair); upright,
         the flat bottom face lands exactly on the floor plane the legs were
         cut to.

         The pad stands UPRIGHT IN THE WORLD, not in the cabinet. The
         machine's own vertical sits TILT off the world's (that is what makes
         the playfield read at its incline), so a pad squared to the cabinet
         leans, and a leaning pad puts its rim through the floor plane -- all
         the rear legs' measured 0.26 u under it. UPW is the world's up
         expressed in this frame, which is (0, sin TILT, cos TILT), and the
         pad is turned onto it and parked half its height along it, so its
         flat bottom face lands on the floor at every corner (measured: 0.00
         to 0.01 u, front and rear alike).

         A cylinder's axis is its local +Y and that turn puts +Y -- so the
         radiusTop end -- at the top, which is why the NARROW radius is the
         top one; the other way round the flare narrows toward the floor
         instead of widening onto it. */
      var UPW = new THREE.Vector3(0, SIN, COS);
      var foot = new THREE.Mesh(cylGeo(0.95, 1.12, 0.9, 16), M.black);
      foot.position.set(end.x + UPW.x * 0.45, end.y + UPW.y * 0.45, end.z + UPW.z * 0.45);
      foot.quaternion.setFromUnitVectors(OUT_Y, UPW);
      root.add(foot);
    });
    root.userData.floorWorldY = floorY;

    /* publish the cabinet's outer box so table.js can re-derive the
       playfield from the real numbers instead of a hand-mirrored copy */
    global.PB.MACHINE_BOX = {
      outL: OUT_L, outR: OUT_R,
      footY: FOOT_Y, headY: HEAD_Y, wall: WALL
    };

    /* ---------------- backbox ----------------
       Anchored at the head end and counter-rotated out of the playfield
       incline so it stands vertical, tipped back a touch like the real
       thing.

       Every number here is read straight off the reference's front ortho
       (dev/_reffront3.py, sheet px at the panel's own 0.12466 u/px):
         head box          x 101..323 = 223 px wide, y 57..249 = 193 px tall
         backglass art     x 112..311 = 200 px wide, y  65..187 = 123 px tall
         bezel gap         y 187..200 =  13 px
         score band        y 200..249 =  49 px
         top margin        y  57.. 65 =   8 px
       So the glass is 1.63:1 and only 89.7% of the head's width -- the rest
       is the stile each side -- and the band is 4.08:1, much shallower than
       the 3.4 this file used to draw. The head is 223 px against a body of
       184-203 px, i.e. ~1.7 u proud a side, which is the "backbox a bit
       wider than the cabinet" the side profile calls for. Because HEAD_W is
       a touch wider than OUT_W, every vertical above is scaled by the same
       31.2/27.8 the width is, which is where the 27.0 u height comes from. */
    var HEAD_W = OUT_W + 3.4, HEAD_D = 9.6;
    var head = new THREE.Group();
    var HEAD_LEAN = 0.06;
    head.rotation.x = Math.PI / 2 - TILT - HEAD_LEAN;
    /* Seat the box so its BACK face is flush with the cabinet's head end --
       the reference's side elevation draws the backbox at x 47..113 against a
       body starting at x 50, i.e. barely a half unit proud, whereas the old
       -0.6 here left the whole 8.7 u of depth hanging out BEHIND the machine.
       Its bottom sits just clear of the LID at the head end (the 8 px step
       the same drawing shows), so the sloping lid runs away underneath it. */
    head.position.set(MID_X - CX,
      HEAD_Y + 0.45 - (HEAD_D - 0.3) * Math.cos(TILT + HEAD_LEAN) - CY,
      TOP_HEAD - 0.9);
    root.add(head);

    var STILE = 0.72;                            /* 11 px of head each side */
    var glassW = HEAD_W - STILE * 2;
    var glassAspect = 1.63;                      /* 200 x 123 px           */
    var glassH = glassW / glassAspect;
    var bandW = glassW;
    var bandH = bandW / 4.08;                    /* 200 x 49 px            */
    var GAP = 0.64;                              /* the 13 px bezel        */
    var HEAD_H = glassH + bandH + GAP + 1.12;    /* + the 8 px top margin  */

    var headBox = new THREE.Mesh(boxGeo(HEAD_W, HEAD_H, HEAD_D), M.panel);
    headBox.position.set(0, HEAD_H / 2, -HEAD_D / 2 + 0.3);
    head.add(headBox);

    /* the backbox's flank. The sheet's own bbSide panel is 0.36:1 against the
       head's 0.29:1, so it is centre-cropped rather than fitted -- a fitted
       sprite would leave two bands of the sheet's paper down the head. */
    var bbSideTex = ownTex(A.ready ? coverTexture('bbSide', 160, 560) : null);
    if (bbSideTex) {
      var bbPanelH = HEAD_H - 0.4, bbPanelD = HEAD_D - 0.6;
      [-1, 1].forEach(function (s) {
        addHeadPanel(bbSideTex, bbPanelD, bbPanelH, s * (HEAD_W / 2 + 0.01),
          HEAD_H / 2, -HEAD_D / 2 + 0.3, s);
      });
    }
    function addHeadPanel(tex, w, h, x, y, z, s) {
      /* right-handed basis for a flank whose outward normal is (s,0,0):
         right = (0,0,-s) so that r x u = n (the old (0,0,s) was left-handed
         and setFromRotationMatrix turned the panels inside out) */
      var m = new THREE.Mesh(planeGeo(w, h), bodyMat(tex));
      m.quaternion.setFromRotationMatrix(BASIS.makeBasis(
        new THREE.Vector3(0, 0, -s), AY, new THREE.Vector3(s, 0, 0)));
      m.position.set(x, y, z);
      head.add(m);
    }

    var glassY = HEAD_H - 1.12 - glassH / 2;     /* the 8 px top margin */
    var glassTex = ownTex(A.ready ? coverTexture('backglass', 1024, Math.round(1024 / glassAspect)) : null);
    if (glassTex) {
      var glass = new THREE.Mesh(planeGeo(glassW, glassH), new THREE.MeshStandardMaterial({
        map: glassTex, roughness: 0.34, metalness: 0.12,
        emissive: 0xffffff, emissiveMap: glassTex, emissiveIntensity: 0.44
      }));
      owned.mat.push(glass.material);
      glass.position.set(0, glassY, 0.52);
      head.add(glass);
    }

    var bandY = glassY - glassH / 2 - GAP - bandH / 2;
    var bandTex = ownTex(makeScoreBand());
    var band = new THREE.Mesh(planeGeo(bandW, bandH), new THREE.MeshStandardMaterial({
      map: bandTex, roughness: 0.5, metalness: 0.2,
      emissive: 0xffffff, emissiveMap: bandTex, emissiveIntensity: 0.34
    }));
    owned.mat.push(band.material);
    band.position.set(0, bandY, 0.46);
    head.add(band);

    /* live dot-matrix screen, covering the plate exactly -- the plate's
       paint behind it shows nowhere. The canvas is the RASTER of the
       128x32 grid, so it is sized in whole cells (see DMD_CELL_W/H) rather
       than squared to the plate's aspect: a fractional cell is what made
       the rows uneven. */
    var dmdSrc = document.getElementById('dmd');
    var dmdPlane = null;
    if (dmdSrc) {
      dmdSrc.width = 128 * DMD_CELL_W;
      dmdSrc.height = 32 * DMD_CELL_H;
      var dmdTex = ownTex(new THREE.CanvasTexture(dmdSrc));
      /* Mipmaps + anisotropy. In the player's pose the panel is drawn about
         a third of the canvas' width, and plain bilinear sampling at that
         minification only touches some of the dots: the GAPS between the
         rows come back as hard black lines across the screen. With the
         chain each output pixel averages the dots it covers, and with
         anisotropy that average follows the panel's slant. */
      dmdTex.minFilter = THREE.LinearMipmapLinearFilter;
      dmdTex.generateMipmaps = true;
      dmdTex.anisotropy = 8;
      if ('colorSpace' in dmdTex) dmdTex.colorSpace = THREE.SRGBColorSpace;
      var winW = bandW * BAND_WIN.w;
      /* the plane takes its size from the PLATE's aspect, not the canvas':
         the raster is 0.8% off it, so the dots stretch by that much (which
         nobody can see) instead of the screen moving on the glass */
      var winH = winW / PLATE_ASPECT;
      var winY = bandY + bandH / 2 - bandH * (BAND_WIN.y + BAND_WIN.h / 2);
      dmdPlane = new THREE.Mesh(planeGeo(winW, winH), new THREE.MeshBasicMaterial({ map: dmdTex }));
      owned.mat.push(dmdPlane.material);
      dmdPlane.position.set(0, winY, 0.66);
      head.add(dmdPlane);
    }

    /* speaker grills -- the reference mounts two SMALL rounds inside the
       lower score band, one at each end, vertically centred in the band.
       Re-measured from assets/3dref.jpg (dev/3dref-match.md section 2):
       diameter ~30 px on a 223 px face = 3.74 u -> radius 1.87; centres at
       x 126.5 / 297.5 px = 11.4% / 88.1% across, y 221 = the band's centre.
       (The previous values -- radius 4.9, 32% down the whole face -- came
       from a 3x over-measure of the grills and put them over the glass.) */
    var grillTex = ownTex(makeGrill());
    var grillMat = new THREE.MeshStandardMaterial({ map: grillTex, roughness: 0.55, metalness: 0.5 });
    owned.mat.push(grillMat);
    var SPK_R = 1.87;
    var spkX = HEAD_W * 0.382;
    var spkY = bandY;
    [-spkX, spkX].forEach(function (sx) {
      var cup = new THREE.Mesh(cylGeo(SPK_R + 0.12, SPK_R + 0.12, 0.3, 22), M.black);
      cup.position.set(sx, spkY, 0.42);
      cup.rotation.x = Math.PI / 2;
      head.add(cup);
      var grill = new THREE.Mesh(discGeo(SPK_R, 40), grillMat);
      grill.position.set(sx, spkY, 0.58);
      head.add(grill);
    });

    /* Black reference surround: broad outer rails with recessed neutral
       bevels framing the glass and score band, without gold trim. */
    var frameMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x101215), metalness: 0.05, roughness: 0.62, envMapIntensity: 0.12 });
    owned.mat.push(frameMat);
    var trimTop = new THREE.Mesh(boxGeo(HEAD_W + 0.4, 0.42, 0.42), frameMat);
    trimTop.position.set(0, HEAD_H + 0.06, 0.2);
    head.add(trimTop);
    var trimMid = new THREE.Mesh(boxGeo(HEAD_W - 0.5, 0.22, 0.32), frameMat);
    trimMid.position.set(0, glassY - glassH / 2 - GAP / 2, 0.5);
    head.add(trimMid);
    [-1, 1].forEach(function (s) {
      var stile = new THREE.Mesh(boxGeo(0.48, HEAD_H + 0.12, 0.42), frameMat);
      stile.position.set(s * (HEAD_W / 2 - 0.12), HEAD_H / 2, 0.48);
      head.add(stile);
    });

    /* Reference frame: black outer rails, recessed glass and fine neutral
       bevels. No gold stiles or decorative chasing bulbs. */
    function headRule(w, h, x, y, z) {
      var rule = new THREE.Mesh(boxGeo(w, h, 0.10), frameMat);
      rule.position.set(x,y,z); head.add(rule);
    }
    headRule(glassW + 0.24, 0.20, 0, glassY + glassH/2 + 0.10, 0.60);
    headRule(glassW + 0.24, 0.20, 0, glassY - glassH/2 - 0.10, 0.60);
    headRule(0.18, glassH + 0.4, -glassW/2 - 0.09, glassY, 0.60);
    headRule(0.18, glassH + 0.4, glassW/2 + 0.09, glassY, 0.60);
    headRule(HEAD_W, 0.32, 0, 0.12, 0.48);

    /* ---------------- api ---------------- */
    function update(now, hot) {
      /* the flipper buttons' travel. 22/s is quick enough to read as a
         mechanical click and slow enough that a two-frame tap still shows
         the movement; dt is clamped so a stutter cannot pop the button. */
      var dt = Math.min(0.05, Math.max(0, now - lastT));
      lastT = now;
      var k = 1 - Math.exp(-dt * 22);
      for (var bi = 0; bi < flipperBtns.length; bi++) {
        var fb = flipperBtns[bi];
        fb.press += (fb.target - fb.press) * k;
        fb.btn.position.x = fb.x0 * (1 - 0.44 * fb.press);
      }
    }
    var lastT = 0;

    /* Pulled or released, handed in by game.js's pressLeft/pressRight. The
       side is 'L' or 'R'; anything else is ignored rather than thrown. */
    function setFlipper(side, on) {
      var i = side === 'L' ? 0 : (side === 'R' ? 1 : -1);
      if (i < 0 || !flipperBtns[i]) return;
      flipperBtns[i].target = on ? 1 : 0;
    }

    function dispose() {
      mirrors.forEach(function (m) { m.onBeforeRender = function () {}; });
      reflectionTargets.forEach(function (target) { target.dispose(); });
      var i;
      for (i = 0; i < owned.geo.length; i++) owned.geo[i].dispose();
      for (i = 0; i < owned.mat.length; i++) owned.mat[i].dispose();
      for (i = 0; i < owned.tex.length; i++) owned.tex[i].dispose();
      owned.geo.length = 0; owned.mat.length = 0; owned.tex.length = 0;
    }

    return {
      root: root,
      head: head,
      dmdPlane: dmdPlane,
      mirrors: mirrors,
      /* the live button meshes, so game.js can raycast them -- the red
         buttons are real controls now, pressable with the mouse/touch
         directly on the cabinet (see bindPointer in game.js) */
      flipperBtns: flipperBtns,
      update: update,
      setFlipper: setFlipper,
      dispose: dispose
    };
  }

  global.PB = global.PB || {};
  global.PB.buildMachine = buildMachine;
})(window);
