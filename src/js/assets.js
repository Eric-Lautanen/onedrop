/* ============================================================
   ONE DROP PINBALL  --  assets.js
   One sprite sheet, one GPU texture. Every cabinet part, decal
   and playfield surface samples it through geometry UVs, so
   there are no texture clones and no duplicate video memory.

   Region fractions below were measured from assets/sprite2.png (843x1264)
   against a paper/rule mask -- the sheet's background is a flat grey
   (80,80,80) with a green rule round each panel -- so that no box ever
   includes gutter pixels, which used to show up as grey edging on the
   cabinet. Every box was then checked by rendering its crop.
   ============================================================ */
import './art.js';
import * as THREE from './vendor/three.module.js';

(function (global) {
  'use strict';

  /* The sheet ships in two encodings of the SAME pixels at the SAME 843x1264
     size: webp first (the sheet is photographic art, so a PNG costs it 6x the
     bytes -- 1.57 MB of network for a texture that then goes through mipmaps
     and a 2x magnified oblique view), falling back to the original png for a
     browser without webp. Region fractions are dimension- and colour-space
     identical in each, measured on the q90 re-encode: worst per-channel
     error 24/255 across the whole sheet, rms 3.3 -- below what a mipmapped
     oblique texture can resolve, so every UV box below stays exact. */
  var SHEET_SOURCES = ['assets/sprite2.webp', 'assets/sprite2.png'];
  var SHEET_W = 843, SHEET_H = 1264;

  /* x,y,w,h are fractions of the sheet, measured from the TOP-LEFT.
     Every box below was measured off assets/sprite2.png with a labelled
     pixel grid and then checked by rendering the crop, so the panels are
     exact and their sprites can be used at their own aspect without
     distortion. The sheet is a production layout: each panel is framed
     in a green rule on a grey gutter, and the panels are labelled on the
     sheet itself, which is what the names follow.

     The pixel rect each box came from is in the comment beside it, so a
     box can be re-checked against the sheet without re-measuring it. */
  var REGIONS = {
    /* ---- backbox flank: palms over the lion, exactly what the reference's
       side elevation paints on the head (dev/3dref-match.md section 3) ---- */
    cabSide:      { x: 0.02847, y: 0.02848, w: 0.14947, h: 0.16456 }, /*  24,  36  126x208 */
    cabSidePalms: { x: 0.02373, y: 0.03006, w: 0.10202, h: 0.08228 }, /*  20,  38   86x104 */
    cabSideLion:  { x: 0.02373, y: 0.11234, w: 0.10202, h: 0.07278 }, /*  20, 142   86x 92 */
    cabSideLeaf:  { x: 0.02373, y: 0.18513, w: 0.10202, h: 0.14241 }, /*  20, 234   86x180 */
    /* the flank art's bounding box -- see FLANK_QUAD below, the panel is a
       trapezoid and only its bounding box is rectangular */
    cabFlank:     { x: 0.02847, y: 0.18354, w: 0.37722, h: 0.13766 }, /*  24, 232  318x174 */
    /* ---- backbox ---- */
    backglass:    { x: 0.118623962, y: 0.030063291, w: 0.265717675, h: 0.113132911 }, /* 100, 38 224x143; excludes grey gutter and score-band rule */
    /* The old box (352,45 76x226) started 6 px left of the panel, so the
       head's flank used to show a strip of the sheet's grey paper down its
       leading edge. Measured against the paper mask. */
    bbSide:       { x: 0.42467, y: 0.02848, w: 0.09371, h: 0.17168 }, /* 358,  36   79x217  0.36 */
    dmdPanel:     { x: 0.16845, y: 0.15427, w: 0.16133, h: 0.03797 }, /* 142, 195  136x 48  2.83 */
    speakerBand:  { x: 0.02847, y: 0.35127, w: 0.37722, h: 0.01899 }, /*  24, 444  318x 24  top band */
    logoBand:     { x: 0.15421, y: 0.03323, w: 0.23725, h: 0.04905 }, /* 130,  42  200x 62  backglass logo */
    tagline:      { x: 0.33571, y: 0.09335, w: 0.07117, h: 0.04905 }, /* 283, 118   60x 62  good vibes sign */
    stripeBand:   { x: 0.02610, y: 0.39161, w: 0.16607, h: 0.03323 }, /*  22, 495  140x 42  rasta stripes */
    /* ---- cabinet front + playfield dressing ---- */
    /* The whole face -- coin door, coin slots, start buttons, plunger and the
       rasta surround. The old box (22,448 326x152) was 2 px wide of the art on
       the left, 4 px on the right and 8 px along the bottom, so those edges
       rendered as the sheet's grey (80,80,80) paper instead of the art's own
       thin black rule. Re-measured against the paper/rule mask: the art's own
       dark border is a full-height column at x=340 and a full-width row at
       y=444 / y=594, so those are the panel's true edges. */
    frontArt:     { x: 0.02847, y: 0.35127, w: 0.37722, h: 0.11946 }, /*  24, 444  318x151 */
    coinDoor:     { x: 0.19929, y: 0.36234, w: 0.20878, h: 0.10285 }, /* 168, 458  176x130  1.35 */
    logoCard:     { x: 0.12574, y: 0.19778, w: 0.27521, h: 0.11076 }, /* 106, 250  232x140  1.66 */
    rastaFlag:    { x: 0.02610, y: 0.39557, w: 0.16607, h: 0.05538 }, /*  22, 500  140x 70 */
    sunset:       { x: 0.17794, y: 0.07516, w: 0.15421, h: 0.07120 }, /* 150,  95  130x 90  landscape */
    signCard:     { x: 0.33571, y: 0.09335, w: 0.07117, h: 0.04905 }, /* 283, 118   60x 62  wood sign */
    lionBand:     { x: 0.15184, y: 0.05696, w: 0.16014, h: 0.09335 }, /* 128,  72  135x118  lion + sunset */
    decals:       { x: 0.50771, y: 0.89400, w: 0.24318, h: 0.10127 }, /* 428,1130  205x128  rasta parts */
    /* ---- the playfield painting --------------------------------------
       This is the one that matters. The panel measures 318 x 584 px
       (aspect 0.5445), but the cabinet's inner opening is 26.8 x 43.0
       (aspect 0.6233) -- and the TOP-DOWN PLAYFIELD view in
       assets/3dref.jpg measures 0.6232, so the design intends the
       painting to FILL the opening. The 14.5% horizontal stretch that
       costs is accepted deliberately; see table.js. */
    playfield:    { x: 0.59312, y: 0.02215, w: 0.37722, h: 0.46203 }, /* 500,  28  318x584  0.545 */
    /* ---- component sheet: one panel per part, for reference ---- */
    tiki:         { x: 0.02610, y: 0.52611, w: 0.21352, h: 0.11076 }, /*  22, 665  180x140 */
    bumpers:      { x: 0.24318, y: 0.52611, w: 0.23725, h: 0.04905 }, /* 205, 665  200x 62 */
    multiFrames:  { x: 0.24318, y: 0.60918, w: 0.23725, h: 0.09890 }, /* 205, 770  200x125 */
    targetStrips: { x: 0.50771, y: 0.53639, w: 0.21115, h: 0.04430 }, /* 428, 678  178x 56 */
    targetStrip2: { x: 0.50771, y: 0.61867, w: 0.21115, h: 0.04589 }, /* 428, 782  178x 58 */
    dmdPixel:     { x: 0.78648, y: 0.52215, w: 0.20166, h: 0.09652 }, /* 663, 660  170x122 */
    ramps:        { x: 0.02135, y: 0.67247, w: 0.21115, h: 0.17563 }, /*  18, 850  178x222 */
    flippers:     { x: 0.50771, y: 0.70253, w: 0.24318, h: 0.04747 }, /* 428, 888  205x 60 */
    playInserts:  { x: 0.50771, y: 0.80696, w: 0.24318, h: 0.06725 }, /* 428,1020  205x 85 */
    slingshots:   { x: 0.77700, y: 0.64241, w: 0.21590, h: 0.05934 }, /* 655, 812  182x 75 */
    scoreReel:    { x: 0.78292, y: 0.76741, w: 0.20759, h: 0.07753 }, /* 660, 970  175x 98 */
    pinball:      { x: 0.02610, y: 0.88608, w: 0.21352, h: 0.09890 }, /*  22,1120  180x125 */
    wireform:     { x: 0.24318, y: 0.70411, w: 0.26690, h: 0.28085 }, /* 205, 890  225x355 */
    rasta:        { x: 0.50771, y: 0.89400, w: 0.24318, h: 0.10127 }, /* 428,1130  205x128 */
    leg:          { x: 0.77700, y: 0.86630, w: 0.20759, h: 0.12658 }, /* 655,1095  175x160 */
    textures:     { x: 0.86002, y: 0.93750, w: 0.13286, h: 0.05696 }  /* 725,1185  112x 72 */
  };

  /* The cabinet's flank is a WEDGE, and the sheet draws its artwork as a
     trapezoid to match: the panel's top edge runs diagonally down toward the
     foot while its bottom edge is level. A rectangular crop of it (which is
     what the old cabSideWord box was) therefore grabbed grey paper along the
     top corner and never looked like the drawing. machine.js rectifies this
     quad -- each source column stretched from its own top edge down to the
     level bottom -- so the art lands on the wedge undistorted.

       x, y    top-left of the panel (the HEAD end, which is the tall end)
       w, h    the panel's bounding box
       drop    how far the top edge falls from the head end to the foot end */
  var FLANK_QUAD = { x: 24, y: 232, w: 318, h: 174, drop: 80 };

  var image = null;
  var texture = null;
  var ready = false;
  var failed = false;
  var started = false;
  var queue = [];
  var sources_left = SHEET_SOURCES.slice();
  var objectUrl = null;
  var bytes = 0;                 /* 0..1 of the sheet's download, when known */

  function settle(ok) {
    ready = ok;
    failed = !ok;
    var cbs = queue;
    queue = [];
    for (var i = 0; i < cbs.length; i++) {
      /* the sheet's consumers are the boot's phases, so stamping each one
         as it fires is what tells a slow boot apart from a hung one */
      if (global.PB && global.PB.mark) global.PB.mark('assets:fire-' + (i + 1) + '-of-' + cbs.length);
      cbs[i]();
    }
  }

  function revokeUrl() {
    if (objectUrl && global.URL && global.URL.revokeObjectURL) {
      global.URL.revokeObjectURL(objectUrl);
    }
    objectUrl = null;
  }

  /* The image has decoded. Build the one GPU texture off it, then settle.
     Decode BEFORE settling, and off the main thread: `decoding = 'async'`
     only hints; without awaiting decode() the rasterisation lands inside the
     first drawImage -- inside the boot's burst of sheet consumers, on the
     main thread, with the loader's animation frozen behind it. A decode that
     REJECTS settles exactly the way onload did before (a texture is built
     either way; the encoding ladder is only for a fetch that failed). */
  function onImageLoad() {
    if (global.PB && global.PB.mark) global.PB.mark('assets:fetch-done');
    function build() {
      if (global.PB && global.PB.mark) global.PB.mark('assets:decoded');
      var src = image;
      revokeUrl();
      texture = new THREE.Texture(src);
      texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      /* The playfield panel is 318 px wide and lands on roughly 600 px of
         screen, so it is magnified about 2x. Anisotropy is the only
         sampler knob that buys anything back on the oblique hero view;
         three.js clamps it to whatever the GPU actually supports. */
      texture.anisotropy = 16;
      if ('colorSpace' in texture) texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      settle(true);
    }
    if (image.decode) image.decode().then(build, build);
    else build();
  }

  /* The fallback path: an <Image> pointed straight at the sheet, walking the
     webp -> png ladder. Used when the page's inline fetch could not hand us
     bytes (no fetch, a refused request, or a stream error). */
  function loadViaImage() {
    var img = image = new Image();
    img.decoding = 'async';
    img.onload = onImageLoad;
    img.onerror = function () {
      /* not the last encoding in the ladder: move down it and try again.
         The queued callbacks keep waiting in `queue`, exactly as before,
         so a retry after a queued `load()` call still fires them once. */
      if (sources_left.length > 1) {
        sources_left.shift();
        image = null;
        loadViaImage();
        return;
      }
      image = null;
      settle(false);
    };
    img.src = sources_left[0];
  }

  /* Load the sheet once. Callbacks run exactly once, after the single
     load settles, and are dropped on failure -- no double-fire, no leak.

     Preference order:
       1. the bytes the page's inline <head> script already streamed, which
          is what gives the loading bar a real byte count (and means the
          sheet is only ever fetched once);
       2. failing that, the image ladder above.

     `sources_left` is the webp-then-png ladder: a missing or unsupported
     encoding moves down it and only a last-candidate failure fails, so a
     browser nobody tested still gets the sheet. */
  function load(onReady) {
    if (ready) { if (onReady) onReady(); return; }
    if (failed) return;
    if (onReady) queue.push(onReady);
    if (started) return;
    started = true;

    var head = global.__PB_SHEET;
    if (head && head.promise) {
      head.promise.then(function (h) {
        /* a queued load() already settled, or the ladder took over */
        if (ready || failed) return;
        if (!h || h.failed || !h.blob || !global.URL || !global.URL.createObjectURL) {
          loadViaImage();
          return;
        }
        bytes = 1;
        objectUrl = global.URL.createObjectURL(h.blob);
        var img = image = new Image();
        img.decoding = 'async';
        img.onload = onImageLoad;
        img.onerror = function () { image = null; revokeUrl(); loadViaImage(); };
        img.src = objectUrl;
      });
      return;
    }
    loadViaImage();
  }
  function region(name) { return REGIONS[name] || null; }

  /* pixel size + aspect of a region, for building correctly proportioned planes */
  function size(name) {
    var r = REGIONS[name];
    if (!r) return { w: 1, h: 1, aspect: 1 };
    var w = r.w * SHEET_W, h = r.h * SHEET_H;
    return { w: w, h: h, aspect: w / h };
  }

  /* Remap a plane/box geometry's UVs to an atlas region.
     targetAspect (optional) centre-crops the region so nothing distorts. */
  function mapUV(geo, name, targetAspect) {
    var r = REGIONS[name];
    if (!r) return geo;
    var x = r.x, y = r.y, w = r.w, h = r.h;

    if (targetAspect) {
      var srcAspect = (w * SHEET_W) / (h * SHEET_H);
      if (srcAspect > targetAspect) {         /* region too wide -> crop sides */
        var nw = w * (targetAspect / srcAspect);
        x += (w - nw) / 2; w = nw;
      } else if (srcAspect < targetAspect) {  /* region too tall -> crop top/bottom */
        var nh = h * (srcAspect / targetAspect);
        y += (h - nh) / 2; h = nh;
      }
    }

    var uv = geo.attributes.uv;
    for (var i = 0; i < uv.count; i++) {
      var u = uv.getX(i), v = uv.getY(i);
      /* image y runs downward, texture v runs upward */
      uv.setXY(i, x + u * w, 1 - (y + (1 - v) * h));
    }
    uv.needsUpdate = true;
    return geo;
  }

  /* Composite a repeating banner of one region into its own small canvas
     texture — used for the long cabinet sides, where a single strip would
     have to stretch absurdly. Mirrored tiles make the repeat seamless. */
  function panelTexture(name, pxW, pxH, tiles) {
    var r = REGIONS[name];
    var c = document.createElement('canvas');
    c.width = pxW; c.height = pxH;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, pxW, pxH);
    if (r && image && ready) {
      var sx = r.x * SHEET_W, sy = r.y * SHEET_H, sw = r.w * SHEET_W, sh = r.h * SHEET_H;
      var tw = pxW / tiles;
      for (var i = 0; i < tiles; i++) {
        ctx.save();
        ctx.translate(i * tw, 0);
        if (i % 2) { ctx.translate(tw, 0); ctx.scale(-1, 1); }
        ctx.drawImage(image, sx, sy, sw, sh, 0, 0, tw, pxH);
        ctx.restore();
      }
    }
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.minFilter = THREE.LinearFilter;
    if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /* Bake one region into its own canvas texture, scaled to fit and centred
     so a sprite can never be squashed by the plane it lands on. Size the
     plane from size(name).aspect and the art stays true to the sheet. */
  function spriteTexture(name, pxW, pxH) {
    var r = REGIONS[name];
    var c = document.createElement('canvas');
    c.width = pxW; c.height = pxH;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#07080a';
    ctx.fillRect(0, 0, pxW, pxH);
    if (r && image && ready) {
      var sw = r.w * SHEET_W, sh = r.h * SHEET_H;
      var k = Math.min(pxW / sw, pxH / sh);
      var dw = sw * k, dh = sh * k;
      ctx.drawImage(image, r.x * SHEET_W, r.y * SHEET_H, sw, sh,
        (pxW - dw) / 2, (pxH - dh) / 2, dw, dh);
    }
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function dispose() {
    if (texture) { texture.dispose(); texture = null; }
    revokeUrl();
    ready = false; failed = false; image = null; started = false; bytes = 0;
    queue.length = 0;
    sources_left = SHEET_SOURCES.slice();
  }

  global.PB = global.PB || {};
  global.PB.assets = {
    REGIONS: REGIONS,
    FLANK_QUAD: FLANK_QUAD,
    load: load,
    region: region,
    size: size,
    mapUV: mapUV,
    panelTexture: panelTexture,
    spriteTexture: spriteTexture,
    dispose: dispose,
    get texture() { return texture; },
    get image() { return image; },
    /* 0..1 of the sheet's download. Real bytes when the page's inline script
       could stream them; otherwise 0 and the bar falls back to its own
       expectation curve (see the loader in game.js). */
    progress: function () {
      var h = global.__PB_SHEET;
      var p = (h && !h.failed) ? (h.pct || 0) / 100 : 0;
      return Math.max(bytes, p);
    },
    /* pixel rect of a region, for canvas compositing */
    rectPx: function (name) {
      var r = REGIONS[name];
      if (!r) return null;
      return { sx: r.x * SHEET_W, sy: r.y * SHEET_H, sw: r.w * SHEET_W, sh: r.h * SHEET_H };
    },
    get ready() { return ready; },
    get failed() { return failed; }
  };
})(window);
