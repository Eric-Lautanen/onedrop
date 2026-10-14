/* ============================================================
   ONE DROP PINBALL  --  game.js
   Wires the machine together and runs the rules.

     table.js      the measured layout (pure data)
     physics.js    the solver
     playfield.js  every piece of hardware, built and animated
     machine.js    the cabinet, backbox and legs
     dmd.js        the dot-matrix display
     audio.js      the riddim engine

   WHAT THIS FILE OWNS
     - the renderer / scene / camera framing
     - the rules: 5 missions, IRIE letters, multiball, wizard mode,
       jackpots, combos, bonus, ball save, skill shot, kickback, tilt
     - input, HUD and the main loop
   ============================================================ */
import './dmd.js';
import * as THREE from './vendor/three.module.min.js';
import './batch.js';
import './guard.js';

(function (global) {
  'use strict';

  /* the import is resolved before this module evaluates, so this is a sanity
     check rather than a load-order guard now */
  if (!THREE) { alert('three.js failed to load'); return; }

  var PAL = global.PB.PALETTE;
  /* light intensities below are authored in r149's units -- see the note
     on PB.LIT in table.js */
  var LIT = global.PB.LIT;
  var table = global.PB.buildTable(global.PB.PF_SIZE);
  var world = new global.PB.World(table);
  var audio = new global.PB.AudioEngine();
  var art = global.PB.art;
  var assets = global.PB.assets;

  var CX = table.centerX, CY = table.centerY;

  /* Physics/geometry note: the playfield is inclined only a few degrees,
     like a real cabinet (~6.5 deg), and the CABINET shares that incline.
     The steep, wide-at-the-bottom look comes from the CAMERA elevation,
     which is how a player actually stands in front of a machine. */
  var TILT = 6.5 * Math.PI / 180;
  var CAM_PITCH = 0.44;
  var FIXED = 1 / 180;
  var MAX_BALLS = 4;
  var BALL_R = 0.62 * (table.K || 1);

  /* ================= DOM ================= */
  var D = {};
  /* the score/highscore/ball/mult/spins ids are NOT in the markup any more:
     the scoreboard lives on the 3D backbox and every write to them goes
     through setText(), which ignores a missing node. They are looked up
     anyway so a DOM HUD could be dropped back in. `message`, `lamps` and
     `hint` were looked up but never read by anything -- deleted. */
  ['score', 'highscore', 'ball', 'mult', 'spins', 'fps',
    'menu', 'menuTab', 'menuStatus', 'menuHigh', 'playBtn', 'resetGameBtn',
    'lockCamBtn',
    'keyLeft', 'keyRight', 'keyPlunge', 'keyNudgeL', 'keyNudgeR', 'keyReset',
    'soundBtn', 'pauseBtn', 'fsBtn', 'fxBtn', 'vol', 'volVal',
    'touchLeft', 'touchRight', 'touchLaunch', 'touchNudgeL', 'touchNudgeR',
    'dmd', 'flash', 'floats',
    'loader', 'ldFill', 'ldMsg'
  ].forEach(function (id) { D[id] = document.getElementById(id); });

  /* ================= renderer ================= */
  var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  /* the full-quality ratio; the governor's ceiling and its tiers scale it
     from here (see guard.js -- it also caps the buffer at PIX_BUDGET) */
  renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
  renderer.setSize(global.innerWidth, global.innerHeight);
  if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.20;
  document.getElementById('stage').appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070a);

  /* the frame-rate governor owns two knobs from here on: the drawing
     buffer's scale and the mirror panels' render targets. It is told the
     full-quality pixel ratio so it can always find its way back to it. */
  if (global.PB.guard) {
    global.PB.guard.attach({ renderer: renderer, root: scene,
      baseDpr: Math.min(global.devicePixelRatio || 1, 2) });
  }
  /* ---- a graphics device that went away -------------------------------
     Windows resets a hung GPU (the "live kernel" watchdog): the driver is
     reloaded, and every WebGL context in every browser on the machine dies
     with it. three.js notices -- it preventDefaults the lost event, stops
     drawing (render() returns while the context is lost) and logs Context
     Lost -- but its restore path only re-initialises GL STATE. The buffers,
     textures, programs and render targets it cached for this scene are dead
     handles by then, so a restored context draws garbage, and the page has
     no way back on its own.

     So this page restarts. The machine is rebuilt from source and the atlas
     re-decoded in a couple of seconds, which is the only honest recovery
     available: a scene rebuilt on a fresh context is correct, whereas a
     scene patched onto a restored one is hopeful. Say what happened first
     -- a black screen with no explanation is the thing players read as
     "the game broke my computer" -- then reload. */
  (function bindContextLoss() {
    var dom = renderer.domElement;
    var handling = false;
    function lost(ev) {
      if (ev && ev.preventDefault) ev.preventDefault();   /* ask for a restore */
      if (handling) return;
      handling = true;
      pfWarn('WebGL context lost -- the graphics driver reset under the game. ' +
             'Restarting the page: three.js cannot rebuild the buffers and ' +
             'textures that died with the old context.');
      paused = true;
      if (D.loader) {
        D.loader.classList.remove('gone');
        if (D.ldFill) D.ldFill.style.width = '0%';
      }
      if (D.ldMsg) D.ldMsg.textContent = 'graphics device reset \u2014 restarting\u2026';
      setText(D.fps, 'GRAPHICS DEVICE RESET');
      global.setTimeout(function () { location.reload(); }, 2000);
    }
    dom.addEventListener('webglcontextlost', lost, false);
    dom.addEventListener('webglcontextrestored', function () {
      /* the context is back, but not this scene's GPU objects with it */
      pfWarn('WebGL context restored; restarting the page to rebuild the scene');
    }, false);
  })();

  scene.fog = new THREE.FogExp2(0x05070a, 0.0032);

  var camera = new THREE.PerspectiveCamera(45, global.innerWidth / global.innerHeight, 0.5, 400);

  /* environment for chrome reflections */
  var pmrem = new THREE.PMREMGenerator(renderer);
  var envTex = art.makeEnv();
  var envRT = pmrem.fromEquirectangular(envTex);
  scene.environment = envRT.texture;
  envTex.dispose();

  /* ================= lights ================= */
  scene.add(new THREE.HemisphereLight(0xaee0ff, 0x3a2408, LIT(0.70)));
  scene.add(new THREE.AmbientLight(0x445566, LIT(0.50)));
  var key = new THREE.DirectionalLight(0xfff3d0, LIT(1.35));
  key.position.set(14, 60, 46);
  scene.add(key);
  var mood = [
    { c: PAL.red, p: [-26, 34, 14] },
    { c: PAL.gold, p: [2, 52, 20] },
    { c: PAL.green, p: [30, 30, 14] }
  ];
  var moodLights = mood.map(function (m) {
    var l = new THREE.PointLight(m.c, LIT(0.75), 90, 2);
    l.position.set(m.p[0], m.p[1], m.p[2]);
    scene.add(l);
    return l;
  });

  /* ================= table group ================= */
  var LAY = -(Math.PI / 2 - TILT);
  var group = new THREE.Group();
  group.position.set(CX, CY, 0);
  group.rotation.x = LAY;
  scene.add(group);
  function L(x, y, z) { return new THREE.Vector3(x - CX, y - CY, z); }

  var glowTex = art.makeGlow();

  /* --- the playfield surface ------------------------------------------
     The painted playfield is a PAINTING, not a lit surface. Reproducing
     it is the whole brief, so it gets an unlit material with the film
     curve switched off (see vibrance.js): the sRGB atlas goes in and the
     sprite's own colours come out, instead of being greyed by metalness
     and rolled off toward white by ACES. Depth and gloss come from the
     lacquer sheen sitting on top, and from the exp fog dimming the far
     end of the table. */
  var pfTex = art.makePlayfield(table);
  var playfield = new THREE.Mesh(
    new THREE.PlaneGeometry(table.W, table.H),
    new THREE.MeshBasicMaterial({ color: 0xffffff, map: pfTex, fog: true })
  );
  playfield.material.toneMapped = false;          /* the sprite, ungraded */
  playfield.position.copy(L(CX, CY, 0));
  group.add(playfield);

  function swapInAtlas() {
    if (!assets.ready) return;                 /* sheet failed: keep procedural art */
    assets.mapUV(playfield.geometry, 'playfield');
    playfield.material.map = assets.texture;
    playfield.material.needsUpdate = true;
    if (pfTex && pfTex.dispose) pfTex.dispose();
  }
  assets.load(swapInAtlas);

  /* A lacquered sheen over the artwork -- and the ONLY thing that lights
     the painting, which is what stops it reading as a flat sticker.

     Three details make this work, and getting any of them wrong puts the
     wash straight back:
       colour 0x000000   a white base adds a milky diffuse layer over the
                         art -- the exact grey we are removing. Black
                         leaves nothing but the gloss and the reflection.
       additive          so the layer can only ever ADD a highlight, never
                         darken or replace a pixel of the painting.
       low opacity       the specular is scaled by it, which is the knob
                         for how wet the lacquer looks. */
  var sheen = new THREE.Mesh(
    new THREE.PlaneGeometry(table.W, table.H),
    new THREE.MeshPhysicalMaterial({
      color: 0x000000, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending,
      roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04,
      reflectivity: 0.5, envMapIntensity: 1.3, depthWrite: false
    })
  );
  sheen.position.copy(L(CX, CY, 0.02));
  sheen.renderOrder = 2;
  group.add(sheen);

  /* ================= hardware ================= */
  var PF = global.PB.Playfield.build({ table: table, world: world, glowTex: glowTex });
  group.add(PF.group);
  assets.load(function () {
    PF.refreshArt();
    global.PB.vibrance.sweep(PF.group);
  });

  /* ================= dot-matrix display ================= */
  var dmd = global.PB.DMD.create(D.dmd);

  /* ================= particles ================= */
  function Particles(max) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.data = [];
    for (var i = 0; i < max; i++) {
      this.data.push({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, g: 1, br: 1, bg: 1, bb: 1 });
      this.pos[i * 3 + 2] = -999;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo = geo;
    this.mat = new THREE.PointsMaterial({
      size: 1.5, map: glowTex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, vertexColors: true, sizeAttenuation: true, opacity: 0.95
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    group.add(this.points);
    this.cursor = 0;
    this.col3 = new THREE.Color();
  }
  Particles.prototype.burst = function (x, y, z, color, n, speed) {
    this.col3.set(color);
    for (var i = 0; i < n; i++) {
      var idx = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      var a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.9);
      var d = this.data[idx];
      d.life = 0.45 + Math.random() * 0.5;
      d.max = d.life;
      d.g = 1;
      d.vx = Math.cos(a) * s;
      d.vy = Math.sin(a) * s + 3;
      d.vz = 4 + Math.random() * 7;
      d.br = this.col3.r; d.bg = this.col3.g; d.bb = this.col3.b;
      this.pos[idx * 3] = x; this.pos[idx * 3 + 1] = y; this.pos[idx * 3 + 2] = z;
      this.col[idx * 3] = d.br; this.col[idx * 3 + 1] = d.bg; this.col[idx * 3 + 2] = d.bb;
    }
  };
  Particles.prototype.trail = function (x, y, z, color, life) {
    var idx = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    var d = this.data[idx];
    this.col3.set(color);
    d.life = life; d.max = life; d.g = 0;
    d.vx = 0; d.vy = 0; d.vz = 0;
    d.br = this.col3.r; d.bg = this.col3.g; d.bb = this.col3.b;
    this.pos[idx * 3] = x; this.pos[idx * 3 + 1] = y; this.pos[idx * 3 + 2] = z;
    this.col[idx * 3] = d.br; this.col[idx * 3 + 1] = d.bg; this.col[idx * 3 + 2] = d.bb;
  };
  Particles.prototype.clear = function () {
    for (var i = 0; i < this.max; i++) { this.data[i].life = 0; this.pos[i * 3 + 2] = -999; }
  };
  Particles.prototype.update = function (dt) {
    for (var i = 0; i < this.max; i++) {
      var d = this.data[i];
      if (d.life <= 0) continue;
      d.life -= dt;
      if (d.life <= 0) { this.pos[i * 3 + 2] = -999; continue; }
      d.vy -= 16 * d.g * dt;
      this.pos[i * 3] += d.vx * dt;
      this.pos[i * 3 + 1] += d.vy * dt;
      this.pos[i * 3 + 2] += d.vz * dt;
      var f = d.life / d.max;
      this.col[i * 3] = d.br * f;
      this.col[i * 3 + 1] = d.bg * f;
      this.col[i * 3 + 2] = d.bb * f;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  };
  var particles = new Particles(1400);
  function pburst(x, y, z, color, n, speed) {
    if (!fxAllowed()) return;
    particles.burst(x - CX, y - CY, z, color, n, speed);
  }
  function ptrail(x, y, z, color, life) {
    if (!fxAllowed()) return;
    particles.trail(x - CX, y - CY, z, color, life);
  }

  /* ================= floating score text ================= */
  function floatText(x, y, text, cls) {
    if (!fxAllowed()) return;
    var v = L(x, y, 2.4);
    group.updateMatrixWorld();
    camera.updateMatrixWorld();
    group.localToWorld(v);
    v.project(camera);
    var el = document.createElement('div');
    el.className = 'float ' + (cls || '');
    el.textContent = text;
    el.style.left = ((v.x * 0.5 + 0.5) * 100) + '%';
    el.style.top = ((-v.y * 0.5 + 0.5) * 100) + '%';
    if (D.floats) D.floats.appendChild(el);
    setTimeout(function () { el.remove(); }, 1100);
  }

  /* ================= cabinet =================
     machine.js is owned by whoever is building the cabinet, and it gets
     rewritten on its own schedule. So this seam is deliberately
     forgiving: whatever buildMachine() returns -- or whatever it throws
     -- the playfield still has to come up playable.

     CONTRACT -- what game.js asks of machine.js:

       PB.buildMachine({ table, tilt, glowTex }) -> {
         root              REQUIRED. added to the scene.
         head              optional. only used to frame inspection shots.
         dmdPlane          optional. its tone mapping is switched off.
         update(now, hot)  optional. called once per frame.
         dispose()         optional. called when the playfield is resized.
       }

     `table` carries { W, H, K, centerX, centerY } so the cabinet can
     align itself to the playfield. The playfield's own size does NOT
     come from here -- it comes from PB.PF_SIZE in table.js. Anything
     missing above is skipped, never fatal. */
  var machine = null;
  var machineFloorY = 0;

  /* ---- the boot sequence's state ----
     The loader is dismissed by the reveal gate at the bottom of this file,
     which wants both facts below true AND a frame drawn after the later one
     landed, so the fade never uncovers a canvas that predates the cabinet.
     `framesDrawn`/`framesAtStage` are the frame half of that and the frame
     loop owns them. */
  var bootSheetDone = false, bootCabinetDone = false;
  var bootRevealPending = false;
  var framesDrawn = 0, framesAtStage = 0;
  /* set when the boot's stages are done and one real frame must still be
     drawn before the loader fades (see frame() and bootMaybeReveal()) */
  var bootDrawNow = false;
  function pfWarn(msg) {
    if (global.console && global.console.warn) {
      global.console.warn('[playfield] ' + msg);
    }
  }
  /* ---- WHAT THE GAME MAY PRINT, AND WHEN -----------------------------
     Everything here is one-shot, and nothing is called from the frame loop
     or from inside a per-ball branch -- a healthy load must be silent, and
     a long game must not fill the console. The failures that a player or a
     developer needs (the WebGL context going away, the cabinet throwing,
     the field not fitting the machine, the frame governor dying) each warn
     ONCE, on the thing going wrong, and stay.
     The one healthy-load diagnostic -- the boot-mark dump -- is opt-in:
     `?debug` on the URL, or localStorage onedrop.debug = '1'. The marks are
     always RECORDED (see mark()); printing them is only a convenience, and
     the boot timeline is meant to be read from the outside anyway
     (performance.getEntriesByType('mark'), which is what dev/_bootshape.py
     does), so nothing depends on the line. */
  function debugOn() {
    if (stored('onedrop.debug') === '1') return true;
    return /[?&]debug\b/.test(global.location.search || '');
  }
  /* a mark is a few microseconds and it is what makes the boot's shape
     measurable from the outside: performance.getEntriesByType('mark')
     then says exactly where the fresh-load time went, without a profile
     and without touching the game. */
  function mark(name) {
    try { performance.mark(name); } catch (e) { /* no marks, no colour */ }
  }
  global.PB.mark = mark;
  function buildCabinet() {
    if (machine) return;
      mark('boot:machine-start');
    try {
      var built = global.PB.buildMachine
        ? global.PB.buildMachine({ table: table, tilt: TILT, glowTex: glowTex })
        : null;
      if (built && built.root) {
        machine = built;
        group.add(machine.root);
      } else {
        pfWarn('machine.js returned no root -- running playfield-only');
      }
    } catch (err) {
      machine = null;
      pfWarn('machine.js threw while building the cabinet; the playfield ' +
             'still works. ' + ((err && err.message) ? err.message : err));
    }
    mark('boot:machine-done');

    if (machine) {
      /* The cabinet carries a lot of painted art -- the backglass, the dot
         plate, the rasta flanks, the coin door, the apron cards. Same rule
         as the playfield: reproduce it, don't regrade it. This runs after
         buildMachine so it survives that module being rewritten, and it is
         art-only, so a failure here must not stop the build. */
      try { global.PB.vibrance.sweep(machine.root);      } catch (e) { /* cosmetic */ }
      mark('boot:vibrance-done');

      /* machine.js sizes the DMD canvas to the painted plate's aspect and
         builds the band window off the same numbers -- tell the display
         object, which caches its cell sizes, so it re-cuts its dot assets. */
      if (dmd && dmd.resize && D.dmd) dmd.resize(D.dmd.width, D.dmd.height);

      dmdTex = (machine.dmdPlane && machine.dmdPlane.material)
        ? machine.dmdPlane.material.map : null;
      if (machine.dmdPlane && machine.dmdPlane.material) {
        /* the live display is already unlit, but ACES would still mute its
           palette -- the DMD's own colours are the design, so skip it */
        machine.dmdPlane.material.toneMapped = false;
      }
    }
    group.updateMatrixWorld(true);
    cabinetFit = checkCabinetFit();
    computeFitCorners();
    buildFloor();
    fitCamera();
    mark('boot:cabinet-done');
    /* tell the world out loud, so a slow boot can be told apart from a hung
       one -- but only when asked (see debugOn): this is the one line that
       healthy production load would otherwise print every single time */
    if (debugOn()) {
      pfWarn('boot marks: ' + performance.getEntriesByType('mark').map(function (m) {
        return m.name + '@' + Math.round(m.startTime);
      }).join(' '));
    }

    /* ---- sequence: the cabinet is the last thing the loader waits on ---- */
    bootCabinetDone = true;
    ldStage(88);
    bootMaybeReveal();
  }
  /* ---- does the playfield still fit the cabinet it was handed? ----
     The cabinet is rebuilt on its own schedule, so the two can drift
     silently: machine.js changes its outer numbers, table.js still
     holds the mirrored copy, and the field ends up the wrong size with
     nothing on screen to say why.

     This reports rather than polices. A bounding box is NOT a safe
     test: the cabinet legitimately carries trim, flipper buttons and
     backbox panels that stick out past its own outer walls, so a
     measurement of "everything under machine.root" reads wide even
     when the fit is perfect. The one exact signal is PB.MACHINE_BOX --
     if the cabinet publishes its box and that box disagrees with what
     the playfield was built from, that is a real drift and worth a
     warning. Otherwise this just records the numbers. */
  function checkCabinetFit() {
    if (!machine || !machine.root) return null;
    /* The field is built from table.js's mirrored CABINET at script-load
       time -- which is BEFORE machine.js exists, since index.html loads
       table.js first. So compare what the field was actually BUILT at
       against what the cabinet now OFFERS; comparing cabinetOpening()
       with itself would always agree and guard nothing. */
    var built = global.PB.PF_SIZE;
    var box = global.PB.MACHINE_BOX;
    var offers = global.PB.cabinetOpening(box || undefined);
    var bb = new THREE.Box3().setFromObject(machine.root);
    var info = {
      playfieldW: +built.W.toFixed(2),
      playfieldH: +built.H.toFixed(2),
      cabinetW: +(bb.max.x - bb.min.x).toFixed(2),
      cabinetSpanY: +(bb.max.y - bb.min.y).toFixed(2),
      source: box ? 'PB.MACHINE_BOX' : 'table.js CABINET'
    };
    if (Math.abs(offers.W - built.W) > 0.05 || Math.abs(offers.H - built.H) > 0.05) {
      pfWarn('the cabinet offers ' + offers.W.toFixed(2) + ' x ' +
        offers.H.toFixed(2) + ' but the field was built at ' +
        built.W.toFixed(2) + ' x ' + built.H.toFixed(2) +
        '. Re-fit with PB.game.fitPlayfieldToCabinet().');
    }
    return info;
  }
  var cabinetFit = null;

  var dmdTex = null;
  assets.load(buildCabinet);

  /* ================= floor ================= */
  var floorGroup = null, gridTex = null;
  var machineCenter = new THREE.Vector3(CX, CY, 0);
  function buildFloor() {
    if (floorGroup) return;
    floorGroup = new THREE.Group();
    var y = machineFloorY - 0.35;

    var floor = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900),
      new THREE.MeshStandardMaterial({ color: 0x07090a, metalness: 0.2, roughness: 0.9 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(machineCenter.x, y, machineCenter.z);
    floorGroup.add(floor);

    var gc = document.createElement('canvas');
    gc.width = gc.height = 256;
    var gx2 = gc.getContext('2d');
    for (var ci = 0; ci < 4; ci++) {
      var p = ci * 64;
      gx2.fillStyle = 'rgba(58, 220, 138, 0.30)';
      gx2.fillRect(p, 0, 2, 256);
      gx2.fillRect(0, p, 256, 2);
    }
    gx2.fillStyle = 'rgba(246, 196, 69, 0.32)';
    gx2.fillRect(64, 0, 2, 256); gx2.fillRect(0, 64, 256, 2);
    gx2.fillStyle = 'rgba(215, 38, 61, 0.22)';
    gx2.fillRect(192, 0, 2, 256); gx2.fillRect(0, 192, 256, 2);
    gridTex = new THREE.CanvasTexture(gc);
    gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping;
    gridTex.repeat.set(76, 76);
    if ('colorSpace' in gridTex) gridTex.colorSpace = THREE.SRGBColorSpace;
    var grid = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900),
      new THREE.MeshBasicMaterial({
        map: gridTex, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false
      })
    );
    grid.rotation.x = -Math.PI / 2;
    grid.position.set(machineCenter.x, y + 0.02, machineCenter.z);
    floorGroup.add(grid);

    var fc = document.createElement('canvas');
    fc.width = fc.height = 256;
    var fx = fc.getContext('2d');
    var fg = fx.createRadialGradient(128, 128, 10, 128, 128, 128);
    fg.addColorStop(0, 'rgba(0,0,0,0)');
    fg.addColorStop(0.42, 'rgba(0,0,0,0.35)');
    fg.addColorStop(0.72, 'rgba(0,0,0,0.86)');
    fg.addColorStop(1, 'rgba(0,0,0,1)');
    fx.fillStyle = fg; fx.fillRect(0, 0, 256, 256);
    var fade = new THREE.Mesh(
      new THREE.PlaneGeometry(760, 760),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(fc), transparent: true, depthWrite: false })
    );
    fade.rotation.x = -Math.PI / 2;
    fade.position.set(machineCenter.x, y + 0.05, machineCenter.z);
    floorGroup.add(fade);

    var pool = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120),
      new THREE.MeshBasicMaterial({
        map: glowTex, color: 0x1d9a4e, transparent: true, opacity: 0.45,
        blending: THREE.AdditiveBlending, depthWrite: false
      })
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(machineCenter.x, y + 0.08, machineCenter.z);
    floorGroup.add(pool);

    var sc = document.createElement('canvas');
    sc.width = sc.height = 256;
    var sx = sc.getContext('2d');
    var sg = sx.createRadialGradient(128, 128, 6, 128, 128, 126);
    sg.addColorStop(0, 'rgba(0,0,0,0.72)');
    sg.addColorStop(0.55, 'rgba(0,0,0,0.34)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    sx.fillStyle = sg; sx.fillRect(0, 0, 256, 256);
    var shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(58, 66),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(machineCenter.x, y + 0.05, machineCenter.z);
    floorGroup.add(shadow);

    scene.add(floorGroup);
  }

  /* ================= ball ================= */
  var ballGeo = new THREE.SphereGeometry(BALL_R, 34, 24);
  var ballMat = new THREE.MeshStandardMaterial({ color: 0xdfe6ef, metalness: 1.0, roughness: 0.11, emissive: 0x0a0a0a });
  var shadowTex = (function () {
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var x = c.getContext('2d');
    var g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,0.75)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();

  /* ================= camera framing ================= */
  var FIT_TOP = 0.92, FIT_BOTTOM = -0.96;
  var fitCorners = [];

  function computeFitCorners() {
    var bb = new THREE.Box3();
    group.updateMatrixWorld(true);
    /* the cabinet is optional: if machine.js is mid-rewrite or throws,
       the playfield still has to frame itself correctly */
    if (machine && machine.root) bb.expandByObject(machine.root);
    bb.expandByObject(playfield);
    if (bb.isEmpty()) return;
    var mn = bb.min, mx = bb.max;
    bb.getCenter(machineCenter);
    machineFloorY = (machine && machine.root &&
                     machine.root.userData.floorWorldY !== undefined)
      ? machine.root.userData.floorWorldY : mn.y;
    fitCorners = [];
    [[mn.x, mx.y], [mx.x, mx.y], [mx.x, mn.y], [mn.x, mn.y]].forEach(function (c) {
      fitCorners.push(new THREE.Vector3(c[0], c[1], mn.z));
      fitCorners.push(new THREE.Vector3(c[0], c[1], mx.z));
    });
  }

  var camDist = 70, camLook = 0, camZoom = 0;
  var HERO_YAW = 0.30;

  /* ---- the fly-in track ----------------------------------------------
     Game start tweens the camera from wherever it sits (attract drift,
     an orbit the player left it in) to the exact fit pose -- placeCamera
     at camDist/camLook. The tween's END IS that pose, to the decimal, so
     when the fly-in finishes and updateCamera takes over there is no
     pop; the player just sees the machine settle into the standing view
     with DMD and flippers in one frame. */
  var camFly = { on: false, t: 0, dur: 1.4,
    fromPos: null, fromQuat: null, toPos: null, toQuat: null };

  /* ---- the player pose ----
     Standing at the machine: the eye sits IN FRONT of the cabinet,
     elevated, looking down at ~33 degrees -- one frame holds the full
     DMD at the top, the flippers at the bottom, and the whole lane the
     ball travels between them. The camera is centred on the machine's
     axis (no yaw), and the DISTANCE is solved so both anchors -- the
     backbox top (DMD) and the flipper pivot line -- land inside the
     vertical FOV with breathing room. Every input is a real world
     position, so the pose stays correct as geometry is tuned. */
  var playerPose = null;   /* { pos: Vector3, quat: Quaternion } */
  /* the standing pose, hand-tuned with the on-screen CAM readout (C key):
     in front of the cabinet, above the playfield, looking down 42 -- one
     frame holds the DMD at the top, the flippers at the bottom and the
     whole lane in between. X rides the machine's centre line so a table
     re-fit keeps the view centred; y/z/pitch are the tuned constants. */
  var PLAYER_VIEW = { y: 81.0, z: 62.5, pitch: 42 * Math.PI / 180 };
  function computePlayerPose() {
    if (!machine || !machine.root) return null;
    machine.root.updateMatrixWorld(true);
    var pos = new THREE.Vector3(machineCenter.x, PLAYER_VIEW.y, PLAYER_VIEW.z);
    var fwd = new THREE.Vector3(0, -Math.sin(PLAYER_VIEW.pitch), -Math.cos(PLAYER_VIEW.pitch));
    var look = pos.clone().addScaledVector(fwd, 50);
    var quat = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().lookAt(pos, look, new THREE.Vector3(0, 1, 0)));
    return { pos: pos, quat: quat };
  }

  function beginFlyIn() {
    if (!fitCorners.length) return;           /* boot not done yet */
    wobbleAmp = 0;                            /* sway eases back in after landing */
    swayT = 0;                                /* ...from zero phase, so the landed
                                                 pose is the exact sway origin */
    /* remember where the camera IS right now (attract drift, or an
       orbit view the player left it in) -- the tween starts here */
    camFly.fromPos = camera.position.clone();
    camFly.fromQuat = camera.quaternion.clone();
    /* if the player had dragged to an orbit view, that rig is STILL ON
       and would yank the camera back to its own pose the instant the
       tween ends -- capture the start view, then disarm the rig */
    orbit.on = false;
    orbit.drag = false;
    /* the target is the player pose, computed fresh so a resized window
       still frames DMD + flippers; falling back to the fitted hero view
       only if the anchors are missing */
    var pose = computePlayerPose();
    if (pose) playerPose = pose;   /* the standing view holds this after the tween */
    else {
      placeCamera(camDist, camLook);
      camera.updateMatrixWorld(true);
      pose = { pos: camera.position.clone(), quat: camera.quaternion.clone() };
    }
    camFly.toPos = pose.pos.clone();
    camFly.toQuat = pose.quat.clone();
    camFly.t = 0;
    camFly.on = true;
  }

  /* ---- the hero pose --------------------------------------------------
     Where the camera sits while the machine waits: HERO_YAW out from the
     centre line, CAM_PITCH above it, aimed at the middle of the machine,
     with the slow drift and the hit shake layered on. updateCamera draws it
     every frame and the reset tweens onto it, so the two cannot drift
     apart; with the drift clock and the shake at rest this IS the default
     view the machine boots into. */
  var heroAim = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  function heroPose() {
    var driftP = state === 'attract' ? Math.sin(swayT * 0.23) * 0.075 : 0;
    var pitch = CAM_PITCH + driftP + shakeY * 0.004;
    var a = camDist * (1 - camZoom * 0.05) * (1 - shake * 0.004);
    var horiz = a * Math.cos(pitch);
    heroAim.pos.set(
      machineCenter.x + Math.sin(HERO_YAW) * horiz + Math.sin(swayT * 0.13) * 1.6 + shakeX * 0.30,
      machineCenter.y + Math.sin(pitch) * a,
      Math.cos(HERO_YAW) * horiz
    );
    heroAim.look.set(machineCenter.x + shakeX * 0.18, machineCenter.y + camLook, 0);
    return heroAim;
  }

  /* ---- back to the hero pose -----------------------------------------
     A reset puts the machine back the way it boots: no orbit held, no
     player pose left from the last fly-in, the drift phase restarted and
     any shake dropped. heroView() does that in one step; flyToHero() does
     the same and TWEENS there on the fly-in's own rig -- same shape, same
     easing, mirrored -- because a reset that snapped the camera back read
     as a glitch rather than as the machine squaring up. */
  function heroView() {
    orbit.on = false;
    orbit.drag = false;
    camFly.on = false;
    playerPose = null;
    /* the zoom is a GAMEPLAY pull-in (play/ready drive it to 1, attract to
       0) and heroPose() reads it, so a reset that clears every OTHER input
       to the pose has to clear this one too. Without it the tween aims at
       the zoomed pose -- camZoom is still ~1 from the game that was just
       cleared -- while the frame the tween lands on computes the pose with
       camZoom already decaying to 0: the view stepped ~5 u sideways on the
       final frame, the pop this fixes. */
    camZoom = 0;
    swayT = 0;
    lastUC = -1;
    wobbleAmp = 0;
    shake = 0;
    shakeX = 0;
    shakeY = 0;
  }
  function flyToHero(dur) {
    if (!fitCorners.length) { heroView(); return; }   /* boot not done yet */
    /* remember where the view IS (the player pose, an orbit, a fly-in half
       done) before clearing everything that would hold it elsewhere */
    var fromPos = camera.position.clone();
    var fromQuat = camera.quaternion.clone();
    heroView();
    var aim = heroPose();     /* drift at 0, shake cleared: the default pose */
    camFly.fromPos = fromPos;
    camFly.fromQuat = fromQuat;
    camFly.toPos = aim.pos.clone();
    /* the tween slerps an ORIENTATION, so build it the way lookAt would:
       eye at the hero position, aimed at the hero target point */
    camFly.toQuat = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().lookAt(aim.pos, aim.look, new THREE.Vector3(0, 1, 0)));
    camFly.t = 0;
    camFly.dur = dur || 1.15;
    camFly.on = true;
  }

  function flyTick(raw) {
    if (!camFly.on) return false;
    camFly.t = Math.min(camFly.dur, camFly.t + raw);
    var k = camFly.t / camFly.dur;
    k = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;   /* easeInOutCubic */
    camera.position.lerpVectors(camFly.fromPos, camFly.toPos, k);
    /* r125+ ships Quaternion#slerpQuaternions; older builds only get the
       flat two-pose copy, which is still the right endpoints */
    if (camera.quaternion.slerpQuaternions) {
      camera.quaternion.slerpQuaternions(camFly.fromQuat, camFly.toQuat, k);
    } else {
      camera.quaternion.copy(k < 1 ? camFly.fromQuat : camFly.toQuat);
    }
    if (camFly.t >= camFly.dur) camFly.on = false;
    return true;
  }

  /* the PLAY/Space camera track */
  function placeCamera(D2, look) {
    var horiz = D2 * Math.cos(CAM_PITCH);
    camera.position.set(
      machineCenter.x + Math.sin(HERO_YAW) * horiz,
      machineCenter.y + D2 * Math.sin(CAM_PITCH),
      Math.cos(HERO_YAW) * horiz
    );
    camera.lookAt(machineCenter.x, machineCenter.y + look, 0);
  }

  function fitCamera() {
    if (!fitCorners.length) return;
    if (!isFinite(camera.aspect) || camera.aspect <= 0) return;
    var vFov = camera.fov * Math.PI / 180;
    var D2 = 70, look = 0;
    var mid = (FIT_TOP + FIT_BOTTOM) / 2;
    var targetV = FIT_TOP - FIT_BOTTOM;
    var TAN = Math.tan(vFov / 2);
    for (var it = 0; it < 24; it++) {
      placeCamera(D2, look);
      camera.updateMatrixWorld(true);
      camera.updateProjectionMatrix();
      var minY = 9, maxY = -9;
      for (var i = 0; i < fitCorners.length; i++) {
        var v = fitCorners[i].clone().project(camera);
        minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
      }
      var c = (maxY + minY) / 2;
      look += (c - mid) * D2 * TAN;
      placeCamera(D2, look);
      camera.updateMatrixWorld(true);
      camera.updateProjectionMatrix();
      minY = 9; maxY = -9;
      var minX = 9, maxX = -9;
      for (var j = 0; j < fitCorners.length; j++) {
        var w = fitCorners[j].clone().project(camera);
        minY = Math.min(minY, w.y); maxY = Math.max(maxY, w.y);
        minX = Math.min(minX, w.x); maxX = Math.max(maxX, w.x);
      }
      var spanV = maxY - minY, spanH = maxX - minX;
      var k = spanV > 1e-4 ? spanV / targetV : 1;
      if (spanH / 1.9 > k) k = spanH / 1.9;
      D2 *= k;
    }
    camDist = D2;
    camLook = look;
  }

  var lastW = 0, lastH = 0;
  function resize() {
    var w = global.innerWidth, h = global.innerHeight;
    if (!w || !h) return;
    if (w === lastW && h === lastH) return;
    lastW = w; lastH = h;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    /* the new size is at full scale, and a rebuild has just made fresh
       mirror targets: put the governor's current tier back on top */
    if (global.PB.guard) global.PB.guard.apply();
    fitCamera();
    /* the standing view frames DMD + flippers against the FOV, so a new
       aspect needs a new pose -- recomputed live even mid-game */
    playerPose = computePlayerPose();
  }
  global.addEventListener('resize', resize);
  resize();
  function syncSize() {
    if (global.innerWidth !== lastW || global.innerHeight !== lastH) resize();
  }

  /* ============ orbit inspection camera ============ */
  /* ---- THE CAMERA LOCK ------------------------------------------------
     On a tablet the thumb reaching for a flipper lands on the glass beside
     it often enough that fat-finger taps were swinging the table mid-ball.
     With the lock on, the canvas takes no camera input at all: no drag, no
     pinch, no wheel. It is about the finger on the glass, not about the
     machine -- RESET VIEW and RESET GAME still move the camera on purpose,
     and the flipper buttons, the plunger knob and every other control keep
     working. `camRelease` is handed back by bindOrbit() below, so locking
     the view mid-gesture lets go of the fingers already on the glass.
     The setting lives in localStorage like the fader and the FX switch, so
     a locked cabinet is still locked after a reload. */
  var CAM_KEY = 'onedrop.lock';
  var camLocked = false;
  var camRelease = null;
  function showCamLock() {
    if (!D.lockCamBtn) return;
    D.lockCamBtn.textContent = camLocked ? 'CAMERA LOCKED' : 'LOCK CAMERA';
    D.lockCamBtn.classList.toggle('on', camLocked);
  }
  function setCamLock(on, quiet) {
    camLocked = !!on;
    store(CAM_KEY, camLocked ? '1' : '0');
    if (camLocked && camRelease) camRelease();
    showCamLock();
    if (!quiet) setMessage(camLocked ? 'CAMERA LOCKED' : 'CAMERA FREE', false, 1.4);
    return camLocked;
  }
  /* boot: apply what was stored, silently -- the machine is still loading
     and the player has not asked for anything yet */
  setCamLock(stored(CAM_KEY) === '1', true);

  var orbit = { on: false, yaw: 0, pitch: CAM_PITCH, dist: 90,
    pivot: new THREE.Vector3(), drag: false, px: 0, py: 0 };

  function enterOrbit() {
    if (orbit.on) return;
    /* pivot where the camera is ALREADY looking -- along its forward ray
       toward the machine -- so grabbing the view never shifts it. The old
       machineCenter pivot yanked the frame sideways the instant a pointer
       touched the canvas, especially from the off-axis standing view. */
    var fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    var along = machineCenter.clone().sub(camera.position).dot(fwd);
    if (along > 1) orbit.pivot.copy(camera.position).addScaledVector(fwd, along);
    else orbit.pivot.copy(machineCenter);
    var d = camera.position.clone().sub(orbit.pivot);
    orbit.dist = Math.max(20, d.length());
    orbit.pitch = Math.acos(Math.max(-1, Math.min(1, d.y / orbit.dist)));
    orbit.yaw = Math.atan2(d.x, d.z);
    orbit.on = true;
  }
  function exitOrbit() {
    if (!orbit.on) return;
    orbit.on = false;
    fitCamera();
  }


  (function bindOrbit() {
    var dom = renderer.domElement;
    dom.style.touchAction = 'none';

    /* ---- PINCH: two fingers on the glass pull the camera in and out
       A touch player has no wheel, so before this the only way to change
       the distance was to leave the table and reset the game. Pointer
       events already deliver every finger as its own pointer, so the ones
       that are down are kept in a map: while exactly two are, the change
       in their separation drives the SAME orbit.dist the wheel does
       (fingers apart = closer), and the orbit's yaw/pitch is held still so
       a pinch never also spins the table out from under the hands. Lift
       one finger and the orbit resumes from WHERE THAT FINGER IS -- not
       from its old anchor, which would jump the view by the gap the two
       fingers had between them. */
    var down = {};        /* pointerId -> { x, y }, the fingers on the glass */
    var downCount = 0;
    var pinchGap = 0;     /* their separation in px at the last move */
    var ZOOM_MIN = 24, ZOOM_MAX = 320;   /* the wheel's own band */

    function gap() {
      var a = null, b = null;
      for (var id in down) {
        if (!a) a = down[id]; else { b = down[id]; break; }
      }
      return (a && b) ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    }
    function zoomBy(scale) {
      if (!isFinite(scale) || scale <= 0) return;
      orbit.dist = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, orbit.dist * scale));
    }

    /* locking the view lets go of any fingers already on the glass: the
       alternative is a lock that only takes effect once the player happens
       to lift their hand */
    camRelease = function () {
      down = {}; downCount = 0; pinchGap = 0; orbit.drag = false;
    };

    dom.addEventListener('pointerdown', function (e) {
      if (camLocked) return;   /* the locked view takes no camera input */
      if (paused) return;   /* a paused table must not swallow the camera:
                               clicks while frozen would otherwise grab the
                               orbit rig and the resume would land tilted */
      enterOrbit();
      if (down[e.pointerId]) return;        /* a repeat of one we hold */
      down[e.pointerId] = { x: e.clientX, y: e.clientY };
      downCount++;
      if (downCount === 1) {
        orbit.drag = true; orbit.px = e.clientX; orbit.py = e.clientY;
      } else {
        /* the second finger takes over: stop orbiting and start measuring */
        orbit.drag = false;
        pinchGap = gap();
      }
      if (dom.setPointerCapture) { try { dom.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ } }
    });

    dom.addEventListener('pointermove', function (e) {
      if (camLocked) return;
      var p = down[e.pointerId];
      if (p) { p.x = e.clientX; p.y = e.clientY; }
      if (downCount >= 2) {
        /* three or more fingers is nobody's gesture: hold the view rather
           than letting the pair that happens to be listed first fight the
           one that just landed */
        if (downCount !== 2) return;
        var g = gap();
        /* a degenerate separation (fingers crossed over each other, a
           pointer we never saw move) is a divide-by-almost-zero, so it is
           skipped rather than allowed to slam the camera to a clamp */
        if (pinchGap > 8 && g > 8) zoomBy(pinchGap / g);
        pinchGap = g;
        return;
      }
      if (!orbit.drag || !p) return;
      orbit.yaw -= (e.clientX - orbit.px) * 0.006;
      orbit.pitch = Math.max(0.08, Math.min(1.45, orbit.pitch + (e.clientY - orbit.py) * 0.005));
      orbit.px = e.clientX; orbit.py = e.clientY;
    });

    function endDrag(e) {
      if (down[e.pointerId]) { delete down[e.pointerId]; downCount--; if (downCount < 0) downCount = 0; }
      if (downCount === 1) {
        var rest = null;
        for (var id in down) { rest = down[id]; break; }
        if (rest) { orbit.drag = true; orbit.px = rest.x; orbit.py = rest.y; }
      } else if (downCount === 2) {
        /* back from three fingers to two: re-measure before the next move,
           or the pair is scaled by the gap they had before the third finger
           landed -- which arrives as one big jump in the zoom */
        pinchGap = gap();
      } else if (downCount === 0) {
        orbit.drag = false;
      }
      if (dom.releasePointerCapture && e.pointerId !== undefined) {
        try { dom.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
      }
    }
    dom.addEventListener('pointerup', endDrag);
    dom.addEventListener('pointercancel', endDrag);
    /* a finger can also come up OUTSIDE the canvas -- pointer capture routes
       that to us, but on a browser without it the release would be missed
       and the finger would sit in the map for good, leaving the view stuck
       in pinch mode. Listening on the window catches the release wherever
       it happens; endDrag ignores ids it is not holding. */
    global.addEventListener('pointerup', endDrag);
    global.addEventListener('pointercancel', endDrag);
    /* a gesture the OS takes away (a swipe from the edge, a call arriving)
       can swallow the pointerup entirely: drop every finger rather than
       pinching with a hand that has already let go */
    global.addEventListener('blur', function () {
      down = {}; downCount = 0; pinchGap = 0; orbit.drag = false;
    });
    dom.addEventListener('wheel', function (e) {
      e.preventDefault();       /* before the locks: a locked view still must
                                   not let the wheel scroll the page */
      if (camLocked || paused) return;
      enterOrbit();
      zoomBy(Math.exp(e.deltaY * 0.0012));
    }, { passive: false });
  })();

  var shake = 0, shakeX = 0, shakeY = 0;
  /* the standing view's idle sway eases in AFTER the fly-in lands -- it
     starts at zero so the tween hands off to an identical pose with no
     twitch, then the breathing motion fades up over ~2 seconds.
     The sway runs on its OWN accumulated clock (swayT), not wall time:
     updateCamera is skipped during the fly-in and while paused, so a
     wall-clock phase would jump sideways across either gap -- the exact
     "shifts a little on resume" glitch. swayT only advances when the
     camera is actually being driven, and begins at 0 on landing. */
  var wobbleAmp = 0, lastUC = -1, swayT = 0;  function updateCamera(t) {
    /* clamp the raw delta: gaps (fly-in, pause) must not advance the
       sway clock in one leap */
    var udt = lastUC < 0 ? 0.016 : Math.min(0.05, Math.max(0, t - lastUC));
    lastUC = t;
    if (!camFly.on && !camLocked) {
      /* the locked view does not BREATHE either: the idle sway is movement,
         and a lock that still drifts a unit a second would read as the
         camera wandering off on its own. The sway CLOCK is frozen rather
         than the terms zeroed, so unlocking resumes from the same phase
         instead of snapping to the origin (and the hit shake is a separate
         term, so a locked cabinet still jolts when the ball hits it). */
      wobbleAmp = Math.min(1, wobbleAmp + udt * 0.5);
      swayT += udt;
    }
    if (orbit.on) {
      var sy = Math.sin(orbit.pitch), cy = Math.cos(orbit.pitch);
      camera.position.set(
        orbit.pivot.x + Math.sin(orbit.yaw) * orbit.dist * sy,
        orbit.pivot.y + orbit.dist * cy,
        orbit.pivot.z + Math.cos(orbit.yaw) * orbit.dist * sy
      );
      camera.lookAt(orbit.pivot);
      return;
    }
    /* the standing view: once a game has begun, hold the player pose the
       fly-in landed on -- recomputed if the window resizes -- with the
       shake wobble layered on top. Attract keeps the old drifting hero. */
    if (playerPose && state !== 'attract') {
      var p = playerPose.pos;
      camera.position.set(
        p.x + Math.sin(swayT * 0.13) * 0.8 * wobbleAmp + shakeX * 0.30,
        p.y + shakeY * 0.30,
        p.z
      );
      camera.quaternion.copy(playerPose.quat);
      /* roll the shake into the held view so hits still jolt the cabinet */
      if (shakeX || shakeY) camera.rotateZ(shakeX * 0.004);
      return;
    }
    var aim = heroPose();
    camera.position.copy(aim.pos);
    camera.lookAt(aim.look);
  }

  /* ==========================================================
     RULES
     ========================================================== */

  /* ---------------- missions ----------------
     Five goals. Each holds three steps, so the bar on the DMD
     fills as you work it. Finishing all five starts WIZARD MODE. */
  var MISSIONS = [
    { id: 'orbit', name: 'ROOTS ORBIT', need: 3, hint: 'SHOOT THE ROOTS ORBIT' },
    { id: 'spins', name: 'DUB SPINNER', need: 50, hint: 'SPIN THE DUB SPINNER' },
    { id: 'tiki', name: 'TIKI BASH', need: 8, hint: 'BASH THE TIKI' },
    { id: 'bank', name: 'ONE DROP', need: 4, hint: 'DROP THE WHOLE BANK' },
    { id: 'skank', name: 'SKANK RAMP', need: 3, hint: 'SHOOT THE SKANK RAMP' }
  ];
  var missions = MISSIONS.map(function (m) {
    return { id: m.id, name: m.name, need: m.need, have: 0, step: 0, done: false };
  });
  var missionNames = MISSIONS.map(function (m) { return m.name; });

  var IRIE = ['I', 'R', 'I', 'E'];
  var irieOn = [false, false, false, false];
  var wizardDone = false, wizardActive = false, wizardTimer = 0;

  /* ---------------- state ---------------- */
  var state = 'attract';      // attract | ready | play | ballover | gameover
  var score = 0, displayScore = 0, highScore = 0, ballNum = 1, ballsLeft = 3;
  var mult = 1, combo = 0, comboTimer = 0;
  var extraBalls = 0;                 /* earned free balls, one per award */
  var saveActive = false, saveTime = 0;
  var tiltWarn = 0, tiltTimer = 0, tilted = false;
  var charge = 0, charging = false;
  /* THE HANDLE HAS TO COME ALL THE WAY BACK, or the ball does not launch:
     a spring let go half drawn just returns home. See launch(). */
  var FULL_DRAW = 0.999;
  var spinCount = 0, standupHits = 0, targetsDown = 0, bashCount = 0;
  var rampShots = { 'ROOTS ORBIT': 0, 'SKANK RAMP': 0 };
  var skillTimer = 0, skillLive = false;
  var multiballActive = false, multiballTimer = 0, multiballShots = 0;
  var jackpotArmed = false, jackpotValue = 15000;
  var gridLit = 0;
  var messageTimer = 0;
  var attractTimer = 0, attractMsg = 0;
  var el = {};
  var bonusTicking = 0, bonusTotal = 0, bonusShown = 0;
  var jackpotLadder = 0;

  highScore = parseInt(global.localStorage.getItem('onedrop.high') || '0', 10) || 0;

  /* the master fader. It lives in localStorage like the high score and
     the key bindings, and it starts at 50% -- the mix is built so the
     band is a bed at that setting rather than the whole show. The value
     is handed to the engine before it has an AudioContext; setVolume()
     remembers it and the buses come up at the right level when init()
     finally runs on the player's first click. */
  var VOL_KEY = 'onedrop.vol';
  var volFrac = parseFloat(global.localStorage.getItem(VOL_KEY));
  if (!isFinite(volFrac) || volFrac < 0 || volFrac > 1) volFrac = 0.5;
  audio.setVolume(volFrac);
  function showVolume() {
    var pct = Math.round(volFrac * 100);
    if (D.vol) D.vol.value = String(pct);
    setText(D.volVal, pct + '%');
  }
  showVolume();

  /* ---- the switches that outlive the tab ------------------------------
     EVERY menu setting is remembered: the high score and the fader above,
     and the sound, the FX switch, the key bindings and the camera lock
     below. One pair of helpers does the storage so the private-mode
     exceptions (some browsers throw on localStorage even for a read, and
     an unguarded throw at boot would take the whole machine with it) stay
     in one place instead of at every call site. */
  function store(key, val) {
    try { global.localStorage.setItem(key, val); } catch (e) { /* private mode */ }
  }
  function stored(key) {
    try { return global.localStorage.getItem(key); } catch (e) { return null; }
  }

  /* SOUND. The engine has to be told the stored state, not toggled into it:
     a machine left muted must come back muted, and the button's label and
     its red 'off' styling have to say so from the first frame. */
  var MUTE_KEY = 'onedrop.mute';
  var muted = stored(MUTE_KEY) === '1';
  audio.setMuted(muted);
  function showMute() {
    if (!D.soundBtn) return;
    D.soundBtn.textContent = muted ? 'SOUND OFF' : 'SOUND ON';
    D.soundBtn.classList.toggle('off', muted);
  }
  showMute();
  function setMute(on) {
    muted = audio.setMuted(on);
    store(MUTE_KEY, muted ? '1' : '0');
    showMute();
    return muted;
  }

  /* ---------------- HUD ---------------- */
  function setText(node, txt) { if (node && node.textContent !== txt) node.textContent = txt; }
  function updateHUD() {
    var s = Math.floor(displayScore);
    if (el.score !== s) { setText(D.score, s.toLocaleString('en-US')); el.score = s; }
    if (el.high !== highScore) {
      setText(D.highscore, highScore.toLocaleString('en-US'));
      setText(D.menuHigh, highScore.toLocaleString('en-US'));
      el.high = highScore;
    }
    if (el.ball !== ballNum) { setText(D.ball, String(ballNum)); el.ball = ballNum; }
    if (el.mult !== mult) { setText(D.mult, mult + 'x'); el.mult = mult; }
    if (el.spins !== spinCount) { setText(D.spins, String(spinCount)); el.spins = spinCount; }
  }
  function bigMessage(msg, sub) {
    if (D.menuStatus) D.menuStatus.textContent = sub ? (msg + '  \u2014  ' + sub) : msg;
  }
  var menuDown = true;   /* true while the panel sits at the dropped spot;
                            the tabbed/up position keeps it false so PLAY and
                            the handle can act as close-and-resume */
  function showOverlay(on) {
    /* on = menu fully shown, hidden-with-handle otherwise. Opening the menu
       is NOT a pause: the menu is a panel over a table that keeps running
       (the volume fader and the key caps are worth reaching mid-ball), and
       pausing is its own deliberate act -- P, or the PAUSE button. */
    if (!D.menu) return;
    D.menu.classList.toggle('ingame', !on);
    menuDown = on;
    menuSlide(on ? 'down' : 'up');
  }
  function menuPause(on) {
    /* Pause, and only ever from P or the PAUSE button.
       It takes the riddim with it -- the band stops on the beat it is at
       (startMusic later resumes from there) -- and restarts on resume. */
    if (!(state === 'ready' || state === 'play' || state === 'ballover')) return;
    if (paused === on) return;
    paused = on;
    if (D.pauseBtn) D.pauseBtn.textContent = paused ? 'RESUME' : 'PAUSE';
    if (on) setMessage('PAUSED', false, 1.4);
    if (on) audio.stopMusic();
    else if (!state || state !== 'attract') audio.startMusic();
  }
  /* ---- the menu's slide choreography ----------------------------------
     'up'     slides the panel to its tabbed spot: only the MENU handle
              peeks from the top of the screen while you play. It also
              queues a bounce for the next slide down.
     'down'   slides back to the dropped spot. With bounce (first reveal,
              game over, reset) the panel plays the drop-and-bounce, so it
              lands like a ball dropping onto the playfield; without, it
              just slides (the mid-game handle click). The .drop class is
              removed on animationend so the animation's fill never holds
              the final keyframe over the panel's own opacity rules. */
  var menuBounceQueued = true;   /* reveal plays the drop from above */
  function menuSlide(dir, bounce) {
    if (!D.menu) return;
    if (dir === 'up') {
      menuBounceQueued = true;
      D.menu.classList.remove('drop');
      D.menu.classList.add('tabbed');
    } else {
      D.menu.classList.remove('tabbed');
      if (bounce === undefined) bounce = menuBounceQueued;
      menuBounceQueued = false;
      if (bounce) {
        D.menu.classList.remove('drop');
        void D.menu.offsetWidth;
        D.menu.classList.add('drop');
      }
    }
  }
  if (D.menu) {
    D.menu.addEventListener('animationend', function (e) {
      if (e.animationName === 'menuDrop') D.menu.classList.remove('drop');
    });
  }
  function setMessage(msg, sticky, secs, kind) {
    if (!dmd) return;
    if (!msg) { dmd.clear(); messageTimer = 0; return; }
    dmd.say(msg, sticky ? 1e9 : (secs || 2.2), kind);
    messageTimer = sticky ? 1e9 : (secs || 2.2);
  }

  /* ---------------- scoring ---------------- */
  function addScore(n, x, y, label, cls) {
    var gained = Math.round(n * mult * (1 + combo * 0.1));
    score += gained;
    if (x !== undefined) floatText(x, y, (label || '') + gained.toLocaleString('en-US'), cls || '');
    if (score > highScore) {
      highScore = score;
      global.localStorage.setItem('onedrop.high', String(highScore));
    }
    return gained;
  }
  function bumpCombo() { combo = Math.min(combo + 1, 12); comboTimer = 2.4; }

  /* ---------------- lamp sync ---------------- */
  function syncLamps() {
    /* the two top lanes are the IRIE lane letters */
    PF.setLamp(PF.groups.lane[0], irieOn[0]);
    PF.setLamp(PF.groups.lane[1], irieOn[2]);

    /* drop bank: lit while the target is down */
    for (var i = 0; i < 4; i++) {
      if (PF.groups.drop[i] !== undefined) PF.setLamp(PF.groups.drop[i], !table.targets[i].up);
    }
    /* standups: a rising ladder */
    var sl = Math.min(3, standupHits % 4);
    for (var s = 0; s < 3; s++) {
      if (PF.groups.stand[s] !== undefined) PF.setLamp(PF.groups.stand[s], s < sl);
    }
    /* shack bracket: one lens per bash, all six at eight */
    var sh = Math.min(6, Math.ceil(bashCount / 1.4));
    for (var k = 0; k < 6; k++) {
      if (PF.groups.shack[k] !== undefined) PF.setLamp(PF.groups.shack[k], k < sh);
    }
    /* the palm grid counts completed missions */
    for (var g = 0; g < PF.groups.grid.length; g++) {
      PF.setLamp(PF.groups.grid[g], g < gridLit);
    }
    /* always-on house lighting */
    PF.setGroup('sling', true);
    PF.setGroup('inlane', true);
    PF.setGroup('outlane', true);
    PF.setGroup('bump', true);
    PF.setGroup('spinner', true);
  }

  /* ---------------- mission bookkeeping ---------------- */
  function missionStep(id, amount) {
    if (wizardActive) return;
    var m = null;
    for (var i = 0; i < missions.length; i++) if (missions[i].id === id) m = missions[i];
    if (!m || m.done) return;
    m.have += (amount === undefined ? 1 : amount);
    var newStep = Math.min(3, Math.floor(m.have / m.need * 3));
    if (newStep !== m.step) {
      m.step = newStep;
      if (m.step > 0 && m.step < 3) {
        setMessage(m.name + '  ' + m.step + '/3', false, 1.6, 'green');
      }
    }
    if (m.have >= m.need) completeMission(m);
  }

  function completeMission(m) {
    m.done = true;
    m.step = 3;
    gridLit = Math.min(16, gridLit + 3);
    syncLamps();
    audio.sfx('jackpot');
    shake = 1.2;
    flashScreen(PAL.gold, 0.45);

    var award = {
      orbit: 40000, spins: 30000, tiki: 60000, bank: 25000, skank: 50000
    }[m.id] || 25000;
    addScore(award, undefined, undefined, '', 'jack');

    /* FREE BALL: the 2nd and 4th missions completed each earn one. On a
       real table this is the special worth chasing, so it comes with its
       own fanfare -- and finishBonus() below spends it instead of ending
       the game. */
    var doneCount = 0;
    for (var fc = 0; fc < missions.length; fc++) if (missions[fc].done) doneCount++;
    var earnsBall = (doneCount === 2 || doneCount === 4);

    /* a mission gets its own music: the vamp drops into the set on the next
       bar line and hands the song back where it left off. The bank's vamp
       is the multiball one -- startMultiball() below asks for it after this
       and wins the queue. */
    audio.playInsert('MISSION VAMP');

    if (m.id === 'bank') {
      setMessage('ONE DROP BANK!  MULTIBALL!', false, 3.4, 'multiball');
      startMultiball();
    } else if (m.id === 'tiki') {
      jackpotLadder = 1;
      setMessage('TIKI COMPLETE!  JACKPOT ARMED', false, 3.2, 'jackpot');
      jackpotArmed = true;
    } else {
      setMessage(m.name + ' COMPLETE!  ' + award.toLocaleString('en-US'), false, 2.8, 'jackpot');
    }
    if (earnsBall) {
      extraBalls++;
      audio.sfx('start');
      flashScreen(PAL.green, 0.55);
      setMessage('FREE BALL LIT!', false, 3.0, 'green');
    }
    checkWizard();
  }

  function checkWizard() {
    if (wizardDone) return;
    for (var i = 0; i < missions.length; i++) if (!missions[i].done) return;
    wizardDone = true;
    startWizard();
  }

  function startWizard() {
    wizardActive = true;
    wizardTimer = 30;
    addScore(500000, undefined, undefined, '', 'jack');
    setMessage('WIZARD MODE!  IRIE MASTER!', false, 5, 'wizard');
    audio.sfx('jackpot');
    flashScreen(PAL.gold, 0.8);
    shake = 2.0;
    gridLit = 16;
    syncLamps();
    startMultiball(2);
    /* the biggest moment on the table gets the biggest music: asked for
       after the multiball vamp, so this is the one that takes over */
    audio.playInsert('IRIE MASTER');
  }

  /* ---------------- IRIE letters ---------------- */
  function awardIrie(i) {
    if (irieOn[i]) return;
    irieOn[i] = true;
    audio.sfx('rollover');
    syncLamps();
    PF.pulse('lane', 1);
    var got = 0;
    for (var k = 0; k < 4; k++) if (irieOn[k]) got++;
    if (got === 4) {
      irieOn = [false, false, false, false];
      mult = Math.min(mult + 1, 9);
      addScore(75000, undefined, undefined, '', 'jack');
      setMessage('IRIE!  BONUS ' + mult + 'X  +75,000', false, 3.2, 'jackpot');
      audio.sfx('multiball');
      flashScreen(PAL.gold, 0.6);
      shake = 1.4;
      gridLit = Math.min(16, gridLit + 2);
      syncLamps();
    } else {
      setMessage(IRIE[i] + ' LIT  (' + got + '/4)', false, 1.4, 'green');
    }
  }

  /* ---------------- balls ---------------- */
  var ballMeshes = [];
  function spawnBall(x, y, vx, vy) {
    var b = world.addBall(x, y, vx, vy, BALL_R);
    var m = new THREE.Mesh(ballGeo, ballMat);
    m.position.copy(L(x, y, BALL_R));
    group.add(m);
    var sh = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.5 }));
    sh.position.copy(L(x, y, 0.045));
    group.add(sh);
    b.mesh = m;
    b.shadow = sh;
    ballMeshes.push(b);
    return b;
  }
  function removeBallMesh(b) {
    if (b.mesh) group.remove(b.mesh);
    if (b.shadow) {
      group.remove(b.shadow);
      b.shadow.geometry.dispose();
      b.shadow.material.dispose();
    }
    b.mesh = null;
    b.shadow = null;
    var i = ballMeshes.indexOf(b);
    if (i >= 0) ballMeshes.splice(i, 1);
  }

  function resetDropBank() {
    for (var i = 0; i < 4; i++) table.targets[i].up = true;
    targetsDown = 0;
  }

  function newBall() {
    world.balls.forEach(removeBallMesh);
    world.balls.length = 0;
    ballMeshes.length = 0;
    spawnBall(table.spawn.x, table.spawn.y, 0, 0);
    state = 'ready';
    charge = 0; charging = false;
    saveActive = false;
    combo = 0; comboTimer = 0;
    rampShots['ROOTS ORBIT'] = 0; rampShots['SKANK RAMP'] = 0;
    tilted = false; tiltWarn = 0; tiltTimer = 0;
    irieOn = [false, false, false, false];
    standupHits = 0;
    resetDropBank();
    multiballActive = false; jackpotArmed = false; multiballTimer = 0;
    skillLive = false; skillTimer = 0;
    syncLamps();
    PF.setPlunger(0); PF.snapPlunger();
    setMessage('BALL ' + ballNum + '  \u2014  HOLD ' + keyLabel(keys.plunge) + ' ALL THE WAY BACK',
      false, 3, 'gold');
  }

  function startGame() {
    score = 0; displayScore = 0; ballNum = 1; ballsLeft = 3; mult = 1;
    extraBalls = 0;
    spinCount = 0; bashCount = 0; gridLit = 0; jackpotLadder = 0;
    missions = MISSIONS.map(function (m) {
      return { id: m.id, name: m.name, need: m.need, have: 0, step: 0, done: false };
    });
    wizardDone = false; wizardActive = false;
    audio.resume();
    audio.startMusic();
    audio.sfx('coin');
    /* starting fresh (or RESUMING a live game through PLAY) drops the
       menu and clears its pause -- showOverlay handles the state check */
    showOverlay(false);
    /* the camera track: sweep from wherever we are (attract drift or a
       left-behind orbit) into the exact standing-at-the-machine pose */
    beginFlyIn();
    newBall();
  }

  /* ---------------- physics events ---------------- */
  /* events carry the hit's (e.x, e.y) on the playfield; the sound follows
     the hit left/right across the cabinet so a shot keeps the stereo image
     the playfield already suggests. x only -- the y axis maps to depth and
     a web-game mix wants a narrow front. */
  function panOf(x) {
    return Math.max(-0.85, Math.min(0.85, ((x - CX) / (table.W / 2)) * 0.85));
  }
  function handleEvents() {
    var evs = world.events;
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      switch (e.t) {
        case 'bumper': {
          var c = table.circles[e.i];
          addScore(c.points, e.x, e.y, '', 'pts');
          audio.sfx('bumper', c.id, panOf(e.x));
          PF.flash('bumper', PF.bumpers.map(function (b) { return b.i; }).indexOf(e.i));
          pburst(e.x, e.y, 1.2, PAL[c.color], 18, 26);
          bumpCombo();
          break;
        }
        case 'target': {
          var t = table.targets[e.i];
          addScore(t.points, e.x, e.y, '', 'pts');
          audio.sfx('target', null, panOf(e.x));
          PF.flash('target', e.i);
          pburst(e.x, e.y, 0.9, PAL.red, 12, 18);
          bumpCombo();
          var down = 0;
          for (var q = 0; q < 4; q++) if (!table.targets[q].up) down++;
          targetsDown = down;
          missionStep('bank');
          syncLamps();
          break;
        }
        case 'standup': {
          var st = table.targets[e.i];
          addScore(st.points, e.x, e.y, '', 'pts');
          audio.sfx('standup', null, panOf(e.x));
          PF.flash('target', e.i);
          bumpCombo();
          standupHits++;
          if (standupHits % 3 === 0) {
            mult = Math.min(mult + 1, 9);
            setMessage('SKANK BANK  \u2014  BONUS ' + mult + 'X', false, 2.4, 'gold');
            audio.sfx('ballsave');
          }
          syncLamps();
          break;
        }
        case 'sling': {
          addScore(table.slings[e.i].points, e.x, e.y, '', 'pts');
          audio.sfx('sling', null, panOf(e.x));
          PF.flash('sling', e.i);
          pburst(e.x, e.y, 1.0, PAL.gold, 10, 20);
          break;
        }
        case 'spinner': {
          spinCount++;
          PF.flash('spinner', 0, 1);
          addScore(200 + spinCount * 12, e.x, e.y, '', 'pts');
          audio.sfx('spinner', spinCount);
          if (skillLive) {
            skillLive = false;
            addScore(50000, e.x, e.y, 'SKILL SHOT ', 'jack');
            setMessage('SKILL SHOT!  50,000', false, 2.8, 'jackpot');
            audio.sfx('jackpot');
            flashScreen(PAL.gold, 0.5);
            shake = 1.0;
          }
          missionStep('spins');
          if (spinCount % 25 === 0) {
            addScore(20000, e.x, e.y, 'SPIN BONUS ', 'jack');
            setMessage('DUB SPINNER ' + spinCount + '  \u2014  20,000', false, 2.6, 'gold');
            audio.sfx('jackpot');
          }
          break;
        }
        case 'rollover': {
          awardIrie(e.i === 0 ? 0 : 2);
          PF.pulse('lane', 1);
          pburst(table.rollovers[e.i].x, table.rollovers[e.i].y, 0.9,
            [PAL.red, PAL.green][e.i], 14, 18);
          break;
        }
        case 'bash': {
          bashCount++;
          addScore(2500, e.x, e.y, 'TIKI ', 'jack');
          audio.sfx('bash', null, panOf(e.x));
          PF.flash('shack', 0, 1);
          pburst(e.x, e.y, 1.4, PAL.gold, 22, 30);
          shake = Math.max(shake, 0.6);
          bumpCombo();
          if (jackpotArmed) {
            jackpotArmed = false;
            jackpotValue = 15000 + jackpotLadder * 10000;
            addScore(jackpotValue, e.x, e.y, 'JACKPOT! ', 'jack');
            audio.sfx('jackpot');
            setMessage('TIKI JACKPOT!  ' + jackpotValue.toLocaleString('en-US'), false, 3, 'jackpot');
            flashScreen(PAL.gold, 0.7);
            shake = 1.6;
          }
          missionStep('tiki');
          syncLamps();
          break;
        }
        case 'kickback': {
          audio.sfx('kickback', null, panOf(e.x));
          addScore(2000, e.x, e.y, 'KICKBACK ', 'jack');
          setMessage('KICKBACK!', false, 1.6, 'red');
          PF.flash('kickback', 0, 1);
          pburst(e.x, e.y, 1.0, PAL.red, 24, 30);
          shake = 0.8;
          break;
        }
        case 'flipper': {
          if (e.speed > 9) audio.sfx('flipper', null, panOf(e.x));
          break;
        }
        case 'wall': {
          if (e.speed > 16) audio.sfx('post', null, panOf(e.x));
          break;
        }
        case 'rampenter': {
          audio.sfx('rampup');
          setMessage(e.name + '!', false, 1.0, 'green');
          break;
        }
        case 'ramp': {
          var rn = e.name;
          addScore(e.score || 20000, e.x, e.y, rn + ' ', 'jack');
          audio.sfx('ramp');
          bumpCombo();
          rampShots[rn] = (rampShots[rn] || 0) + 1;
          pburst(e.x, e.y, 1.0, PAL.gold, 28, 32);
          flashScreen(PAL.gold, 0.35);
          shake = Math.max(shake, 0.9);
          if (rn === 'ROOTS ORBIT') {
            awardIrie(1);
            missionStep('orbit');
          } else {
            awardIrie(3);
            missionStep('skank');
          }
          if (rampShots[rn] % 3 === 0) {
            addScore(50000, e.x, e.y, 'RAMP TRIO ', 'jack');
            setMessage('RAMP TRIO!  50,000', false, 2.8, 'jackpot');
            audio.sfx('jackpot');
            shake = 1.2;
          }
          break;
        }
        case 'drain': {
          /* Physics has already removed this ball. Dispose its visuals
             even when other multiball balls remain or ball-save respawns. */
          removeBallMesh(e.ball);
          onDrain();
          break;
        }
      }
    }
    evs.length = 0;
  }

  function startMultiball(extraOverride) {
    multiballActive = true;
    multiballTimer = wizardActive ? 30 : 22;
    multiballShots = 0;
    jackpotArmed = true;
    jackpotLadder = Math.max(jackpotLadder, 1);
    var want = extraOverride === undefined ? 2 : extraOverride;
    var extra = Math.min(want, MAX_BALLS - world.balls.length);
    var artX = table.artX, artY = table.artY;
    for (var i = 0; i < extra; i++) {
      var b = spawnBall(
        artX(38 + i * 8), artY(14 + i * 4),
        (i ? 7 : -7), -3 - i
      );
      b.vy = -2;
    }
    saveActive = true; saveTime = 12;
    mult = Math.min(mult + 1, 9);
    audio.playInsert('SKANK RIOT');
    audio.setIntensity(1);
    syncLamps();
  }

  function onDrain() {
    if (world.balls.length > 0) return;      /* multiball: only when the last one drops */
    audio.sfx('drain');
    if (multiballActive) {
      multiballActive = false;
      jackpotArmed = false;
      audio.setIntensity(0);
      /* the mission music is temporary: cut short, it hands the set back on
         the step it paused at, so a drained multiball does not leave its
         vamp playing over ordinary play */
      audio.stopInsert();
    }
    if (wizardActive) { wizardActive = false; wizardTimer = 0; }
    if (saveActive && (state === 'play' || state === 'ready')) {
      saveActive = false;
      audio.sfx('ballsave');
      setMessage('NO DROP!  BALL SAVED', false, 2.6, 'green');
      spawnBall(table.spawn.x, table.spawn.y, 0, 0);
      state = 'ready';
      charge = 0;
      PF.setPlunger(0); PF.snapPlunger();
      return;
    }
    state = 'ballover';
    endOfBallBonus();
  }

  function endOfBallBonus() {
    var base = 1000
      + targetsDown * 1500
      + spinCount * 30
      + standupHits * 500
      + bashCount * 750
      + gridLit * 1200
      + (rampShots['ROOTS ORBIT'] + rampShots['SKANK RAMP']) * 2500;
    bonusTotal = base * mult;
    bonusShown = 0;
    bonusTicking = 0;
    if (dmd) dmd.setBonus(bonusTotal);
    setMessage('BONUS ' + bonusTotal.toLocaleString('en-US'), true, 0, 'gold');
    audio.sfx('bonus');
  }
  function finishBonus() {
    score += bonusTotal;
    if (score > highScore) {
      highScore = score;
      global.localStorage.setItem('onedrop.high', String(highScore));
    }
    bonusTotal = 0;
    if (dmd) dmd.setBonus(0);
    world.balls.forEach(removeBallMesh);
    world.balls.length = 0;
    ballMeshes.length = 0;
    if (ballNum >= ballsLeft && extraBalls > 0) {
      /* the free ball: the game was over, the earned ball steps in --
         the same ball number replays with its fanfare */
      extraBalls--;
      audio.sfx('start');
      bigMessage('FREE BALL!', 'PLAY ON');
      setMessage('FREE BALL!', false, 3.0, 'green');
      newBall();
      return;
    }
    ballNum++;
    if (ballNum > ballsLeft) {
      state = 'gameover';
      audio.sfx('gameover');
      bigMessage('GAME OVER', 'FINAL SCORE  ' + Math.floor(score).toLocaleString('en-US') +
        '   \u2014   PRESS SPACE FOR ONE MORE DROP');
      showOverlay(true);
      audio.stopMusic();
    } else {
      newBall();
    }
  }

  var flashEl = null;
  function flashScreen(color, strength) {
    if (!fxAllowed()) return;
    flashEl = flashEl || D.flash;
    if (!flashEl) return;
    flashEl.style.background = 'radial-gradient(circle at 50% 40%, ' + art.css(color) + ', rgba(0,0,0,0) 70%)';
    flashEl.style.opacity = String(strength === undefined ? 0.55 : strength);
    flashEl.classList.remove('go');
    void flashEl.offsetWidth;
    flashEl.classList.add('go');
  }

  /* ---------------- input ---------------- */
  var paused = false;

  /* ---------------- FX mode ----------------
     The fancy play: particle bursts on every hit, ball trails, the
     full-screen flashes and the floating score text. FX OFF gives the
     plain table -- physics, lamps, sounds and scoring all still run,
     only the eye candy above the playfield goes quiet. Persisted, and
     ON by default. */
  var FX_KEY = 'onedrop.fx';
  var fxOn = true;
  try { fxOn = global.localStorage.getItem(FX_KEY) !== '0'; } catch (e) { /* private mode */ }
  function fxAllowed() { return fxOn; }
  function setFx(on) {
    fxOn = on;
    try { global.localStorage.setItem(FX_KEY, on ? '1' : '0'); } catch (e) { /* private mode */ }
    if (D.fxBtn) {
      D.fxBtn.textContent = on ? 'FX ON' : 'FX OFF';
      D.fxBtn.classList.toggle('off', !on);
      D.fxBtn.blur();
    }
    if (on) particles.clear();
    else { flashEl = flashEl || D.flash; if (flashEl) { flashEl.style.opacity = '0'; flashEl.classList.remove('go'); } }
    if (dmd) setMessage(on ? 'FX ON' : 'FX OFF', false, 1.2);
  }
  if (D.fxBtn) {
    setFx(fxOn);
    D.fxBtn.addEventListener('click', function () { setFx(!fxOn); });
  }

  var sp = { flash: 0 };

  /* The cabinet's flipper buttons move with the flippers: machine.js owns the
     button geometry and its travel, this only tells it which way. Optional --
     a cabinet without setFlipper (an older machine.js, or one that failed to
     build) simply does not move. */
  function buttonTravel(side, on) {
    if (machine && machine.setFlipper) machine.setFlipper(side, on);
  }

  function pressLeft(on) {
    if (tilted) on = false;
    var f = world.flippers[0];
    if (f.active !== on) {
      f.active = on;
      audio.sfx(on ? 'flipper' : 'flipperReturn', null, -0.35);
    }
    buttonTravel('L', on);
  }
  function pressRight(on) {
    if (tilted) on = false;
    var f = world.flippers[1];
    if (f.active !== on) {
      f.active = on;
      audio.sfx(on ? 'flipper' : 'flipperReturn', null, 0.35);
    }
    buttonTravel('R', on);
  }

  function nudge(dir) {
    if (state !== 'play' || tilted) return;
    audio.sfx('nudge', dir < 0 ? 'left' : 'right');
    world.balls.forEach(function (b) { b.vx += dir * 7.5; b.vy += 3.5; });
    shakeX += dir * 0.35;
    shake = Math.max(shake, 0.35);
    tiltWarn++;
    tiltTimer = 4.0;
    if (tiltWarn >= 3) {
      tilted = true;
      audio.sfx('tilt');
      setMessage('TILT!', true, 0, 'red');
      pressLeft(false); pressRight(false);
      flashScreen(PAL.red, 0.5);
    } else {
      setMessage('EASY NOW... (' + tiltWarn + '/3)', false, 1.2, 'red');
    }
  }

  /* ================= the demo player =================
     The attract screen's machine plays ITSELF: it draws the plunger all the
     way back, lets it go and works both flippers, so the cabinet is alive
     while it waits and the rules can be watched running with nobody at the
     glass. (All the way back, because a part-drawn handle only springs
     home -- see launch().)

     It drives the same inputs a human does -- the charge, launch(),
     pressLeft/pressRight, nudge -- and never touches the rules, so what you
     watch is exactly the game a player gets. And it plays like a person,
     not like a solver: it takes the ball on the side the ball is on, waits
     for the ball to come DOWN to the blade instead of swinging at air,
     gives each shot a quick stab rather than a held bat, and misses the odd
     ball. A demo that never missed would never come off the table.

     It is an EASTER EGG: Ctrl+D (Cmd+D on a Mac) hands the machine over,
     and Ctrl+D again takes it back. Nothing announces it, the attract
     screen sits as it always did, and any other key or touch stops it and
     hands over the live game with the ball still in the lane, so the
     player's own press is their own plunge. */
  var demo = {
    on: false,
    hold: [0, 0],     /* seconds left on each flipper's stab */
    nudgeCool: 0,
    still: 0,         /* seconds the ball has been sitting motionless */
    shakeCool: 0,
    overHold: 0       /* how long the final score sits before attract */
  };
  function demoFlipper(i, on) { if (i === 0) pressLeft(on); else pressRight(on); }
  function demoStop() {
    if (!demo.on) return;
    demo.on = false;
    demo.hold[0] = demo.hold[1] = 0;
    pressLeft(false); pressRight(false);
  }
  /* the egg's key, and the console: PB.game.demo.toggle() */
  function toggleDemo() {
    if (demo.on) demoStop();
    else {
      demoStart();
      if (demo.on) setMessage('DEMO PLAYER ON', false, 1.6, 'gold');
    }
  }
  function demoStart() {
    if (demo.on) return;
    /* from attract or a finished game it deals itself one to play; on a
       live ball it simply takes the game the player is in */
    if (state === 'attract' || state === 'gameover') startGame();
    else if (!(state === 'ready' || state === 'play' || state === 'ballover')) return;
    /* never take the machine over with a bat already up: a raised flipper
       left over from the last hand would hold the new ball where it sits */
    pressLeft(false); pressRight(false);
    demo.on = true;
    demo.hold[0] = demo.hold[1] = 0;
    demo.nudgeCool = 0;
    demo.still = 0;
    demo.shakeCool = 0;
    demo.overHold = 0;
    startGame();
  }
  /* one frame of it */
  function demoPlay(raw) {
    var i;
    /* the stabs run on their own clock, so a flipper is always let go even
       when the ball drains or the state changes mid-swing */
    for (i = 0; i < demo.hold.length; i++) {
      if (demo.hold[i] <= 0) continue;
      demo.hold[i] -= raw;
      if (demo.hold[i] <= 0) { demo.hold[i] = 0; demoFlipper(i, false); }
    }
    /* ---- its game is over: back to attract, and round again ---- */
    if (state === 'gameover') {
      demo.overHold += raw;
      if (demo.overHold < 3) return;      /* let the final score sit a beat */
      demoStop();                         /* hands off the bats as it goes */
      charge = 0; charging = false;
      PF.setPlunger(0); PF.snapPlunger();
      attractTimer = 0;
      state = 'attract';
      showOverlay(true);
      return;
    }
    /* ---- the plunge ---- */
    if (state === 'ready') {
      charging = true;                    /* the frame loop below charges it */
      /* all the way back, or the ball does not go anywhere */
      if (charge >= FULL_DRAW) { charging = false; launch(); }
      return;
    }
    if (state !== 'play') return;

    /* ---- the flippers ---- */
    var geo = table.flippers, live = world.flippers;
    /* the blade's own line across the table. Below it the ball is the
       flippers' to lose; above it, a swing is a swing at air. */
    var zoneY = Math.max(geo[0].py, geo[1].py) + 4.5;
    var midX = (geo[0].px + geo[1].px) / 2;
    var busy = [demo.hold[0] > 0, demo.hold[1] > 0];
    for (var bi = 0; bi < world.balls.length; bi++) {
      var b = world.balls[bi];
      if (b.y > zoneY) continue;          /* still up the table */
      var side = b.x < midX ? 0 : 1;      /* the hand nearest the ball */
      if (busy[side]) continue;           /* that hand is mid-stab */
      var f = geo[side], lf = live[side];
      /* A BAT THAT IS UP IS NOT PRESSED AGAIN. Every stab has to come all
         the way back down before the next one, or the demo re-presses on
         the very next frame, the bat never rests, and a ball that ends up
         on the raised blade is pinned there with the flipper flapping at
         it forever. A swing also has to start from the bottom of its
         travel or it is not a swing at all. */
      if (lf.active || Math.abs(lf.curA - lf.restA) > 0.06) continue;
      /* the blade sweeps INWARD from its pivot, so it owns the table from
         its own edge inward; the outlane outside that edge is the nudge's
         business, and a ball behind the root is nobody's */
      var inward = side === 0 ? b.x - f.px : f.px - b.x;
      if (inward < 0.35 || inward > f.len + 1.4) continue;
      if (b.vy > 5) continue;             /* climbing away: let it come */
      demo.hold[side] = 0.08 + Math.random() * 0.12;
      busy[side] = true;
      demoFlipper(side, true);
    }

    /* ---- the odd nudge ----
       Only for a ball already past the blade's outside edge -- an outlane
       ball -- only while it is falling, and never twice inside a tilt
       window, so the demo can save a ball without ever tilting itself. */
    if (demo.nudgeCool > 0) demo.nudgeCool -= raw;
    if (demo.nudgeCool <= 0 && tiltWarn === 0 && !tilted) {
      for (var ni = 0; ni < world.balls.length; ni++) {
        var nb = world.balls[ni];
        if (nb.y > zoneY || nb.vy > 0) continue;
        var out = nb.x < geo[0].px - 1.2 ? -1 : (nb.x > geo[1].px + 1.2 ? 1 : 0);
        if (!out) continue;
        demo.nudgeCool = 1.6;
        nudge(-out);                      /* shove the ball back inboard */
        break;
      }
    }

    /* ---- a ball nobody can reach ----
       Real cabinets run a ball search for exactly this: a ball come to rest
       out of the flippers' reach -- an outlane mouth, a ledge -- where
       every swing is wasted and the game would sit there for ever. The demo
       does what a player would: shake the table back toward the middle,
       and if the ball is still there, fire both bats with it. Both are
       things a player can do, and the tilt rule still governs. */
    var stillAt = null;
    for (var si = 0; si < world.balls.length; si++) {
      var sb = world.balls[si];
      if (Math.abs(sb.vx) + Math.abs(sb.vy) < 1.5) stillAt = sb.x;
    }
    demo.still = stillAt === null ? 0 : demo.still + raw;
    if (demo.shakeCool > 0) demo.shakeCool -= raw;
    if (demo.still > 4 && demo.shakeCool <= 0 && !tilted) {
      demo.still = 0;
      demo.shakeCool = 3;
      demoFlipper(0, true); demoFlipper(1, true);
      demo.hold[0] = demo.hold[1] = 0.12;   /* and let them both go again */
      if (tiltWarn === 0 && stillAt !== null) nudge(stillAt < midX ? 1 : -1);
    }
  }

  /* ============ rebindable keys + reset game ============
     The menu's key caps are buttons: click one, press a key, done. The
     bindings live in localStorage so they survive a reload, and the
     gameplay handlers below read them instead of hardcoded codes -- the
     hardcoded ones were exactly why a left-handed player had to reach
     for Z and / with the same hand. */
  var KEY_DEFAULTS = {
    left: 'KeyZ', right: 'Slash', plunge: 'Space',
    nudgeL: 'KeyA', nudgeR: 'KeyD', reset: 'KeyR'
  };
  var keys = (function () {
    var s = {};
    try { s = JSON.parse(global.localStorage.getItem('onedrop.keys') || '{}') || {}; } catch (e) { s = {}; }
    for (var k in KEY_DEFAULTS) if (typeof s[k] !== 'string') s[k] = KEY_DEFAULTS[k];
    return s;
  })();
  function saveKeys() {
    try { global.localStorage.setItem('onedrop.keys', JSON.stringify(keys)); } catch (e) { /* private mode */ }
  }
  function keyLabel(code) {
    if (!code) return '--';
    var named = {
      Space: 'SPACE', Enter: 'ENTER', Escape: 'ESC', Tab: 'TAB',
      ShiftLeft: 'LSHIFT', ShiftRight: 'RSHIFT',
      ControlLeft: 'LCTRL', ControlRight: 'RCTRL',
      AltLeft: 'LALT', AltRight: 'RALT',
      ArrowUp: '\u2191', ArrowDown: '\u2193', ArrowLeft: '\u2190', ArrowRight: '\u2192',
      Slash: '/', Period: '.', Comma: ',', Semicolon: ';', Quote: "'",
      Backquote: '`', Backslash: '\\', BracketLeft: '[', BracketRight: ']',
      Minus: '-', Equal: '=', CapsLock: 'CAPS'
    };
    if (named[code]) return named[code];
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit.$/.test(code)) return code.slice(5);
    if (/^Numpad.$/.test(code)) return 'NUM' + code.slice(6);
    return code.toUpperCase();
  }
  var KEYCAP_IDS = { left: 'keyLeft', right: 'keyRight', plunge: 'keyPlunge',
                     nudgeL: 'keyNudgeL', nudgeR: 'keyNudgeR', reset: 'keyReset' };
  var KEYCAP_NAME = { left: 'LEFT FLIPPER', right: 'RIGHT FLIPPER', plunge: 'PLUNGE',
                      nudgeL: 'NUDGE LEFT', nudgeR: 'NUDGE RIGHT', reset: 'RESET GAME' };
  var listening = null;
  function refreshKeycaps() {
    for (var k in KEYCAP_IDS) {
      var cap = D[KEYCAP_IDS[k]];
      if (!cap) continue;
      cap.textContent = keyLabel(keys[k]);
      cap.classList.toggle('listen', listening === k);
    }
  }
  function startListen(which) {
    listening = (listening === which) ? null : which;
    refreshKeycaps();
    if (listening) setMessage('PRESS A KEY FOR ' + KEYCAP_NAME[listening], true, 0, 'gold');
    else setMessage('REBIND CANCELLED', false, 1.2);
  }
  (function wireKeycaps() {
    for (var k in KEYCAP_IDS) {
      (function (which) {
        var cap = D[KEYCAP_IDS[which]];
        if (!cap) return;
        cap.addEventListener('click', function (e) {
          e.preventDefault();
          audio.resume();
          startListen(which);
          cap.blur();   /* a focused cap would eat Space as a click later */
        });
      })(k);
    }
    refreshKeycaps();
  })();

  /* ---- reset game: ONE press, and it puts the camera back ----
     It used to take two (the first armed it for 3 s), which read as the
     button being broken. And the reset now returns the view to the attract
     screen's hero pose: a reset that left the camera wherever the player
     had dragged it gave back a machine nobody recognised. */
  function doResetGame() {
    audio.stopMusic();
    audio.setIntensity(0);
    world.balls.forEach(removeBallMesh);
    world.balls.length = 0;
    ballMeshes.length = 0;
    score = 0; displayScore = 0; ballNum = 1; ballsLeft = 3; mult = 1;
    extraBalls = 0;
    combo = 0; comboTimer = 0;
    spinCount = 0; standupHits = 0; bashCount = 0; targetsDown = 0;
    rampShots = { 'ROOTS ORBIT': 0, 'SKANK RAMP': 0 };
    gridLit = 0; jackpotLadder = 0; jackpotArmed = false; jackpotValue = 15000;
    multiballActive = false; multiballTimer = 0; multiballShots = 0;
    wizardActive = false; wizardTimer = 0;
    saveActive = false; saveTime = 0;
    skillLive = false; skillTimer = 0;
    tilted = false; tiltWarn = 0; tiltTimer = 0;
    charging = false; charge = 0;
    bonusTicking = 0; bonusTotal = 0; bonusShown = 0;
    irieOn = [false, false, false, false];
    resetDropBank();
    syncLamps();
    PF.setPlunger(0); PF.snapPlunger();
    state = 'attract';
    attractTimer = 0;
    /* a reset also lifts a pause -- otherwise the attract loop sits frozen
       behind a PAUSED flag nobody can see */
    paused = false;
    if (D.pauseBtn) D.pauseBtn.textContent = 'PAUSE';
    flyToHero();          /* the camera squares up to the hero pose as it clears */
    showOverlay(true);
    bigMessage('ONE DROP', 'GAME RESET');
    setMessage('GAME RESET', false, 1.6);
    audio.sfx('gameover');
  }
  function requestReset() {
    /* one press, no confirming. From the attract screen there is no game to
       clear, so it only puts the camera back where it belongs. */
    if (state === 'attract') {
      flyToHero();
      setMessage('VIEW RESET', false, 1.4);
      return;
    }
    doResetGame();
  }
  if (D.resetGameBtn) {
    D.resetGameBtn.addEventListener('click', function () {
      audio.resume();
      requestReset();
    });
  }

  /* ============ input ============
     THE KEYBOARD IS FOR GAMEPLAY ONLY. It never touches the camera.
     That is deliberate: a player who has dragged the table round to a
     view they like must be able to plunge, flip and nudge without the
     view snapping back under them. The camera is moved by the MOUSE or a
     FINGER (drag to orbit, wheel or pinch to zoom, with LOCK CAMERA to
     stop both) and squared up again by RESET GAME, and by nothing else. */
  global.addEventListener('keydown', function (e) {
    if (e.repeat) return;
    restoreFullOnGesture();     /* the keyboard is a gesture too, so a player
                                   who never touches the glass still gets
                                   their fullscreen back */
    /* EASTER EGG: Ctrl+D (Cmd+D) hands the machine to the demo player, and
       takes it back. It is checked before the catch-all below, or the same
       press would stop the demo it is trying to start. */
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyD') {
      e.preventDefault();
      toggleDemo();
      return;
    }
    demoStop();     /* a hand on the machine: the demo is over, the game is theirs */
    /* capture mode: the next key becomes the binding being listened for.
       Escape cancels without changing anything. Return before the gameplay
       switch so the key that SETS a binding cannot also FIRE one. */
    if (listening) {
      e.preventDefault();
      var done = listening;
      listening = null;
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      if (e.code !== 'Escape') { keys[done] = e.code; saveKeys(); }
      refreshKeycaps();
      setMessage(e.code === 'Escape' ? 'REBIND CANCELLED'
        : KEYCAP_NAME[done] + ' = ' + keyLabel(e.code), false, 1.8, 'gold');
      return;
    }
    /* A MENU CONTROL OWNS THE KEYBOARD WHILE IT HAS FOCUS. Without this the
       volume fader cannot be moved with the arrow keys at all: the guard
       underneath swallows them for the game's sake, so the browser never
       gets to move the thumb. Only text-ish fields opt out, so a player who
       just clicked PLAY (the button keeps focus) can still flip. */
    var et = e.target;
    if (et && (et.tagName === 'INPUT' || et.tagName === 'TEXTAREA' ||
               et.tagName === 'SELECT' || et.isContentEditable)) return;
    var bound = [keys.left, keys.right, keys.plunge, keys.nudgeL, keys.nudgeR, keys.reset];
    if (['Space', 'Slash', 'Period', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) >= 0 ||
        bound.indexOf(e.code) >= 0) e.preventDefault();

    if (e.code === 'KeyM') {
      var m = setMute(!muted);    /* the button label follows the key, and
                                     the setting is written like the
                                     button's -- one path for both */
      setMessage(m ? 'SOUND OFF' : 'SOUND ON', false, 1.2);
      return;
    }
    if (e.code === 'KeyP') { menuPause(!paused); return; }   /* menuPause also stops/restarts the riddim */
    if (e.code === 'KeyF') { toggleFull(); return; }
    /* no camera keys here on purpose -- see the note above */

    if (e.code === keys.reset) { requestReset(); return; }

    if (state === 'attract' || state === 'gameover') {
      if (e.code === keys.plunge || e.code === 'Enter') {
        startGame();
        /* THE SAME PRESS KEEPS GOING. The ball is in the lane by now and the
           callout on the panel says HOLD SPACE TO PLUNGE, so the key that
           started the game must already be drawing the spring back. With a
           bare return here the hold was swallowed: the player pressed and
           held, nothing charged, and the release fired nothing -- the ball
           just sat in the lane with a dead plunger. */
        if (e.code === keys.plunge) { charging = true; charge = 0; }
        return;
      }
    }
    if (e.code === keys.left) pressLeft(true);
    if (e.code === keys.right) pressRight(true);
    if (e.code === keys.nudgeL) nudge(-1);
    if (e.code === keys.nudgeR) nudge(1);
    if (e.code === keys.plunge && state === 'ready') { charging = true; charge = 0; }
  });
  global.addEventListener('keyup', function (e) {
    if (e.code === keys.left) pressLeft(false);
    if (e.code === keys.right) pressRight(false);
    if (e.code === keys.plunge && charging) { charging = false; launch(); }
  });

  function launch() {
    /* 25% more launch power than the original 26..54 band. The draw is
       always full by the time we get here (the gate below), so this is its
       top end; it stays in charge terms so the band is still readable. */
    var power = (26 + charge * 28) * 1.25;
    if (state !== 'ready' || !world.balls.length) {
      /* the spring still lets go. With no ball to throw, the handle has to
         come home anyway: this is the only thing that ever releases a
         charge, so an early return left the plunger drawn back for good. */
      dropCharge();
      return;
    }
    /* THE HANDLE HAS TO BE ALL THE WAY BACK. A draw let go halfway only
       springs home and the ball stays in the lane: a part-drawn plunge
       used to fire at whatever power it had reached, and a soft one was a
       ball that never cleared the arch and rolled back down the lane. The
       panel says so, so a short draw reads as "not yet" rather than as a
       plunger that did nothing. */
    if (charge < FULL_DRAW) {
      var drawn = charge > 0.2;      /* did they pull on it at all? */
      charging = false;
      charge = 0;
      if (drawn && PF.releasePlunger) PF.releasePlunger();   /* spring it home */
      else dropCharge();
      if (drawn) setMessage('PULL ALL THE WAY BACK', false, 1.8, 'gold');
      return;
    }
    /* deliberately NOT exitOrbit(): plunging is gameplay, and the player
       keeps whatever view they set. */
    var b = world.balls[0];
    b.vy = power;
    b.vx = 0.6;
    if (PF.releasePlunger) PF.releasePlunger();
    state = 'play';
    saveActive = true; saveTime = 9;
    audio.sfx('launch');
    charge = 0;
    skillLive = true; skillTimer = 5.0;
    setMessage('SKILL SHOT  \u2014  HIT THE DUB SPINNER', false, 2.6, 'gold');
  }

  /* FULLSCREEN is the one menu setting the browser will not restore on its
     own: requestFullscreen needs a user gesture, so a stored 'on' is kept
     and spent on the player's FIRST interaction with the page rather than
     failing silently at load. And the state is read from the document, not
     from what we asked for -- Esc, F11 and the browser's own chrome all
     leave fullscreen without going through this button, and a preference
     that ignored that would drag the player back in on every reload. */
  var FULL_KEY = 'onedrop.full';
  var restoreFull = stored(FULL_KEY) === '1';
  function toggleFull() {
    if (!document.fullscreenElement) {
      if (!document.documentElement.requestFullscreen) return;
      var p = document.documentElement.requestFullscreen();
      /* the promise rejects when the browser refuses (no gesture, an iframe
         without allowfullscreen): that is a refusal, not a crash */
      if (p && p.catch) p.catch(function () {});
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
  document.addEventListener('fullscreenchange', function () {
    var on = !!document.fullscreenElement;
    restoreFull = on;                 /* an exit is a decision too */
    store(FULL_KEY, on ? '1' : '0');
  });
  function restoreFullOnGesture() {
    if (!restoreFull) return;
    restoreFull = false;              /* one attempt, on the first gesture */
    if (!document.fullscreenElement) toggleFull();
  }

  if (D.playBtn) {
    D.playBtn.addEventListener('click', function () {
      audio.resume();
      if (state === 'attract' || state === 'gameover') startGame();
      else if (menuDown && D.menu) {
        /* mid-game with the menu dropped: PLAY closes the panel. It does
           not touch the pause -- a paused game stays paused until the
           player says otherwise. */
        menuDown = false;
        menuSlide('up', false);
        D.menu.classList.add('ingame');
      }
      D.playBtn.blur();  /* a focused PLAY would eat Space as a click */
    });
  }

  /* the MENU handle that peeks over the top edge while playing: tap it
     and the panel slides back down to the dropped spot -- a plain slide,
     not the theatrical drop, which is for reveal and game over. Opening
     and closing the panel says nothing about the pause. */
  if (D.menuTab) {
    /* THE HANDLE IS A TOGGLE. Tabbed: pull the panel back down. Already
       down: park it, exactly as PLAY does when it closes the panel. It used
       to be one-way -- with the menu down the press did NOTHING except
       focus the handle, and a focused handle sits 1px past the panel's own
       scroll edge, which is what threw a scrollbar up and narrowed the
       panel under the player's finger (see #menuTab:active in the CSS). */
    var tabFn = function (e) {
      e.preventDefault();
      if (D.menu.classList.contains('tabbed')) {
        menuDown = true;
        menuSlide('down', false);
      } else {
        menuDown = false;
        menuSlide('up', false);
        D.menu.classList.add('ingame');
      }
      D.menuTab.blur();  /* a focused handle would eat Space as a click */
    };
    D.menuTab.addEventListener('click', tabFn);
    D.menuTab.addEventListener('pointerdown', function (e) { e.stopPropagation(); audio.resume(); }, true);
  }

  function bindHold(node, on, off) {
    if (!node) return;
    node.addEventListener('pointerdown', function (e) { e.preventDefault(); audio.resume(); on(); });
    node.addEventListener('pointerup', function (e) { e.preventDefault(); off(); });
    node.addEventListener('pointercancel', function (e) { e.preventDefault(); off(); });
    node.addEventListener('pointerleave', function (e) { e.preventDefault(); off(); });
  }
  /* a one-shot tap: fires on release so the button can also show its own
     active state, and a slide off the button cancels instead of firing */
  function bindTap(node, fn) {
    if (!node) return;
    var pressed = false;
    node.addEventListener('pointerdown', function (e) {
      e.preventDefault(); audio.resume(); pressed = true;
    });
    node.addEventListener('pointerup', function (e) {
      e.preventDefault();
      if (pressed) { pressed = false; fn(); }
    });
    node.addEventListener('pointercancel', function () { pressed = false; });
    node.addEventListener('pointerleave', function () { pressed = false; });
  }
  /* ================= the cabinet's own controls =================
     The red buttons on the flanks and the plunger knob are REAL controls
     now, not decoration: the pointer is raycast into the scene, a hit on
     a button presses that flipper, and a hit on the knob starts a pull --
     drag down to charge, release to launch, exactly like holding SPACE.

     These listeners sit on the WINDOW's capture phase and stop any event
     that lands on a control, so the orbit-camera handler on the canvas
     never sees it: grabbing the plunger must not also spin the view.
     Everything the pointer is not on still orbits, as before. */
  var raycaster = new THREE.Raycaster();
  var pickV2 = new THREE.Vector2();
  function plungerKnob() { return (PF && PF.plunger) ? PF.plunger.knob : null; }

  /* ---- a fingertip is not a cursor -------------------------------------
     The buttons are REAL controls, but they are small on screen: measured
     in the standing view at 1100x720 the red disc is about 9 px across, and
     a fingertip is nearer 40. A mouse can be aimed at 9 px and the hand
     cursor tells it where the button is; a finger cannot -- and on a touch
     screen whose PRIMARY pointer is fine (a laptop or all-in-one, where
     `pointer: coarse` never matches, so the mobile FLIP strip in index.html
     is not shown either) that button is the only flipper the player has.

     So a touch or a pen answers within TAP_RADIUS of the button's PROJECTED
     CENTRE, and the mouse keeps the exact geometry it can be aimed at. The
     test is in screen space, not world space, because a fingertip is
     measured in pixels: the button has to be equally tappable at any window
     aspect, camera distance or zoom. */
  var TAP_RADIUS = 26;                 /* CSS px: a ~52 px target round a 9 px disc */
  var tapPoint = new THREE.Vector3(), tapRel = new THREE.Vector3();
  var tapFwd = new THREE.Vector3(), tapProj = new THREE.Vector3();
  function finger(e) { return e.pointerType === 'touch' || e.pointerType === 'pen'; }
  function tapPick(e) {
    var list = (machine && machine.flipperBtns) ? machine.flipperBtns : [];
    if (!list.length) return null;
    /* the eye's own forward axis, to drop anything BEHIND the camera: a
       point behind the eye projects to a mirrored screen position, and
       would otherwise answer taps on the far side of the window */
    var el = camera.matrixWorld.elements;
    tapFwd.set(-el[8], -el[9], -el[10]).normalize();
    var best = null, bestD2 = TAP_RADIUS * TAP_RADIUS;
    for (var i = 0; i < list.length; i++) {
      list[i].btn.getWorldPosition(tapPoint);
      tapRel.copy(tapPoint).sub(camera.position);
      if (tapRel.dot(tapFwd) <= 0) continue;
      tapProj.copy(tapPoint).project(camera);
      var dx = (tapProj.x * 0.5 + 0.5) * global.innerWidth - e.clientX;
      var dy = (-tapProj.y * 0.5 + 0.5) * global.innerHeight - e.clientY;
      var d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; best = list[i].btn; }
    }
    return best;
  }

  function pickControl(e) {
    /* a finger's generous test comes first and wins: the whole point of it
       is that a tap which LOOKS like it landed on a button counts as one */
    var near = finger(e) ? tapPick(e) : null;
    pickV2.x = (e.clientX / global.innerWidth) * 2 - 1;
    pickV2.y = -(e.clientY / global.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pickV2, camera);
    var targets = [];
    if (machine && machine.flipperBtns) {
      for (var i = 0; i < machine.flipperBtns.length; i++) targets.push(machine.flipperBtns[i].btn);
    }
    var knob = plungerKnob();
    if (knob) targets.push(knob);
    if (!targets.length) return near;
    var hits = raycaster.intersectObjects(targets, false);
    if (near) return near;
    return hits.length ? hits[0].object : null;
  }
  /* ---- which pointer is holding what -----------------------------------
     A touch player uses two thumbs and a real machine has two buttons, so
     the holds are remembered by the POINTER that made them. With a single
     "current button" slot the second finger to land owned both: pressing
     left+right together and lifting one released the other, on exactly the
     devices this section exists for. */
  var chargeId = null;              /* pointer pulling the plunger, or null */
  var mouseChargeY0 = 0;
  var flipIds = [null, null];       /* pointer holding each flipper button */
  function pressFlip(i, on) { if (i === 0) pressLeft(on); else pressRight(on); }
  function releaseFlip(i) {
    if (flipIds[i] === null) return;
    flipIds[i] = null;
    pressFlip(i, false);
  }
  function pointerHeld(id) {
    return chargeId === id || flipIds[0] === id || flipIds[1] === id;
  }
  /* a release, however it arrives: pointerup fires the launch, a cancel or
     a lost window does not */
  function pointerRelease(id, fire) {
    for (var i = 0; i < flipIds.length; i++) if (flipIds[i] === id) releaseFlip(i);
    if (chargeId === id) {
      chargeId = null;
      if (charging) {
        charging = false;
        if (fire) launch();
        else dropCharge();      /* a cancelled grab never fires the shot */
      }
    }
  }
  /* Let the spring go: a charge nobody is holding is not a charge. `charge`
     is what the plunger's handle follows, every frame, so a charge left
     behind by a swallowed release parks the handle at the back of its
     travel and nothing on the machine can bring it home again. */
  function dropCharge() {
    charging = false;
    charge = 0;
    if (PF.setPlunger) PF.setPlunger(0);
    if (PF.snapPlunger) PF.snapPlunger();
  }
  function releaseAll() {
    for (var i = 0; i < flipIds.length; i++) releaseFlip(i);
    if (chargeId !== null) { chargeId = null; charging = false; }
    dropCharge();        /* a lost window must not leave it drawn back */
  }
  global.addEventListener('pointerdown', function (e) {
    /* the player's first touch is also the gesture a stored FULLSCREEN
       setting has been waiting for since load */
    restoreFullOnGesture();
    /* any touch or click means a person is here: the demo hands the machine
       over at once, and lets go of whatever it was holding */
    demoStop();
    if (e.target !== renderer.domElement) return;
    var hit = pickControl(e);
    if (!hit) return;
    e.preventDefault();
    e.stopPropagation();            /* the camera never gets this grab */
    audio.resume();
    /* the grab is OURS now: capture the pointer so the release arrives even
       if the finger slides off the canvas, which is what leaves a flipper
       held down forever */
    if (renderer.domElement.setPointerCapture) {
      try { renderer.domElement.setPointerCapture(e.pointerId); } catch (err) { /* gone already */ }
    }
    var knob = plungerKnob();
    if (hit === knob) {
      if (state === 'attract' || state === 'gameover') startGame();
      /* the grab that started the game is also the grab that pulls: the
         pointer is already on the knob, so the draw begins here rather
         than waiting for a second press (same fix as the plunge key) */
      if (state === 'ready') {
        chargeId = e.pointerId; charging = true; charge = 0;
        mouseChargeY0 = e.clientY;
      }
      return;
    }
    if (machine && machine.flipperBtns) {
      for (var i = 0; i < machine.flipperBtns.length; i++) {
        if (machine.flipperBtns[i].btn === hit) {
          if (flipIds[i] !== null) return;     /* that button is already down */
          flipIds[i] = e.pointerId;
          pressFlip(i, true);
          break;
        }
      }
    }
  }, true);
  global.addEventListener('pointermove', function (e) {
    if (chargeId !== null && e.pointerId === chargeId) {
      /* pulling DOWN the knob charges, like drawing a real plunger back */
      charge = Math.max(0, Math.min(1, (e.clientY - mouseChargeY0) / 150));
      return;
    }
    /* cursor feedback: a hand over the controls, the default elsewhere */
    if (e.target === renderer.domElement) {
      renderer.domElement.style.cursor = pickControl(e) ? 'grab' : '';
    }
  }, true);
  global.addEventListener('pointerup', function (e) {
    if (pointerHeld(e.pointerId)) {
      e.stopPropagation();
      pointerRelease(e.pointerId, true);   /* release fires the launch */
    }
  }, true);
  global.addEventListener('pointercancel', function (e) {
    pointerRelease(e.pointerId, false);    /* a cancelled grab never fires */
  }, true);
  /* a window that goes away (alt-tab, a system gesture) can swallow the
     pointerup entirely, and a flipper held down forever is worse than one
     that never pressed. Only the WINDOW's own blur counts: this listener
     capture-fires for every element's blur too, and a slider losing focus
     must not knock a held flipper out of the player's hand. */
  global.addEventListener('blur', function (e) {
    if (!e.target || e.target === global) releaseAll();
  }, true);

  bindHold(D.touchLeft, function () { pressLeft(true); }, function () { pressLeft(false); });
  bindHold(D.touchRight, function () { pressRight(true); }, function () { pressRight(false); });
  /* the nudges: a tap fires one nudge, a HOLD (150ms) means "oh no" and
     fires nothing until release -- same tap/hold shape as the plunger */
  bindTap(D.touchNudgeL, function () { nudge(-1); });
  bindTap(D.touchNudgeR, function () { nudge(1); });
  var touchCharging = false;
  bindHold(D.touchLaunch, function () {
    audio.resume();
    if (state === 'attract' || state === 'gameover') startGame();
    /* this touch both starts the game and holds the spring, so a single
       press-and-hold plunges on a touch screen */
    if (state === 'ready') { touchCharging = true; charging = true; charge = 0; }
  }, function () { if (touchCharging) { touchCharging = false; charging = false; launch(); } });

  /* ---- the M / P / F row as buttons: touch players have no keys ---- */
  /* ---- the fader ----
     `input` fires continuously while dragging, so the level follows the
     thumb; the value is written to localStorage on every change (a
     synchronous 20-byte write) so the setting survives a reload without
     needing a save button. Dragging the fader is also a user gesture,
     so it is a perfectly good way to unlock the AudioContext for a
     player who never touched PLAY. */
  if (D.vol) {
    D.vol.addEventListener('input', function () {
      volFrac = Math.max(0, Math.min(1, (parseFloat(D.vol.value) || 0) / 100));
      audio.resume();
      audio.setVolume(volFrac);
      try { global.localStorage.setItem(VOL_KEY, String(volFrac)); } catch (e) { /* private mode */ }
      showVolume();
    });
  }

  if (D.soundBtn) {
    D.soundBtn.addEventListener('click', function () {
      audio.resume();
      var m = setMute(!muted);      /* persists: see setMute */
      setMessage(m ? 'SOUND OFF' : 'SOUND ON', false, 1.2);
      D.soundBtn.blur();
    });
  }
  if (D.lockCamBtn) {
    D.lockCamBtn.addEventListener('click', function () {
      audio.resume();
      setCamLock(!camLocked);
      D.lockCamBtn.blur();      /* a focused button would eat Space as a click */
    });
  }
  if (D.pauseBtn) {
    D.pauseBtn.addEventListener('click', function () {
      menuPause(!paused);   /* same pause the menu uses: music + table together */
      D.pauseBtn.blur();
    });
  }
  if (D.fsBtn) {
    D.fsBtn.addEventListener('click', function () { toggleFull(); D.fsBtn.blur(); });
  }

  /* ================= main loop ================= */
  /* the panel's patch object and its mission-step list are built once and
     written in place every frame -- see the frame loop's dmd.set */
  var dmdPatch = {};
  var dmdSteps = new Array(missions.length);
  var last = performance.now() / 1000;
  var acc = 0;
  var fpsAcc = 0, fpsFrames = 0;
  var prevT = 0;
  var rollTimer = 0;            /* the rolling-ball noise clock */
  var pingTimer = 0;            /* the desktop-icon keepalive clock */
  var pingsOff = false;         /* a 404 kills the heartbeat for this session */

  function frame(now) {
    requestAnimationFrame(frame);
    if (!revealed && !bootDrawNow) {
      /* ---- boot: stay off the main thread ----
         Nothing has started and the loader covers the screen, so there is
         nothing worth drawing yet -- but drawing anyway is expensive: one
         frame of this scene costs ~30 ms even on a fast GPU, and many times
         that under software rendering. Running the loop at full tilt during
         boot is what used to starve everything else: the bar could not
         animate (it froze, then snapped to 100), the sheet's decode
         resolved seconds late, and the first paint was pushed back with it.
         So while the loader is up the loop stays cheap, and the boot's own
         stages ask for the single frame that must land before the fade. */
      syncSize();
      last = now / 1000;
      prevT = last;
      return;
    }
    bootDrawNow = false;
    framesDrawn++;
    now /= 1000;
    var raw = now - last;
    last = now;
    if (raw > 0.1) raw = 0.1;
    if (raw <= 0) raw = 1 / 60;
    syncSize();
    if (paused) return;
    var dt = now - prevT;
    prevT = now;

    /* hand the governor the interval it judges (it ignores stalls itself) */
    if (global.PB.guard) global.PB.guard.sample(raw);

    fpsAcc += raw; fpsFrames++;
    if (fpsAcc > 0.5) {
      var info = renderer.info;
      /* frame time in the readout, and whatever quality the governor is
         trading for it -- see guard.js */
      var gov = global.PB.guard, govTxt = '';
      if (gov) {
        var gs = gov.state();
        govTxt = '   ' + gs.emaMs.toFixed(1) + ' ms' + (gs.label ? '   [' + gs.label + ']' : '');
      }
      setText(D.fps, Math.round(fpsFrames / fpsAcc) + ' FPS' + govTxt + '   ' +
        info.render.calls + ' calls   ' + (info.render.triangles / 1000).toFixed(1) + 'k tri   ' +
        info.memory.geometries + ' geo   ' + info.memory.textures + ' tex');
      fpsAcc = 0; fpsFrames = 0;
    }

    /* ---- attract mode ---- */
    if (state === 'attract') {
      attractTimer += raw;
      if (attractTimer > 3.4) {
        attractTimer = 0;
        var hints = MISSIONS.map(function (m) { return m.hint; });
        hints.push('COMPLETE ALL FIVE MISSIONS FOR WIZARD MODE');
        attractMsg = (attractMsg + 1) % hints.length;
      }
    }
    /* the demo's hands, on the same inputs a player's would be (Ctrl+D) */
    if (demo.on) demoPlay(raw);

    /* ---- charge plunger ----
      Two models: the keyboard/touch hold charges over TIME (hold longer,
      plunge harder), while a mouse/touch DRAG on the knob itself charges
      by DISTANCE -- the frame loop only auto-charges when the drag is not
      the thing driving it, or the knob would fill up while held still. */
    if (state === 'ready' && charging) {
      if (chargeId === null) charge = Math.min(1, charge + raw * 1.05);
      /* steers one continuous spring voice, once per frame: see
         AudioEngine.chargeLevel */
      audio.chargeLevel(charge);
    }

    /* ---- physics ---- */
    acc += raw;
    var steps = 0;
    while (acc >= FIXED && steps < 12) {
      if (state === 'play' || state === 'ready' || state === 'ballover') {
        world.step(FIXED);
        world.pollZones();
      } else {
        /* idle table (attract / game over): the flippers still answer the
           buttons -- the bats move so people can play with the cabinet
           before a ball exists. No balls, no scoring, no physics. */
        world.updateFlippers(FIXED);
      }
      acc -= FIXED;
      steps++;
    }
    if (acc > FIXED * 12) acc = 0;
    handleEvents();

    /* ---- ball back in the shooter lane? let the player plunge again ---- */
    if (state === 'play' && world.balls.length === 1) {
      var only = world.balls[0];
      var laneMid = (table.artX(92) + table.artX(100)) / 2;
      /* anywhere in the lane, not just at its top: a soft plunge can be
         spent before the arch (26 u/s climbs art y 84 -> 64 -- measured),
         and the ball then rolls back down and rests on the lane floor at
         art y 86. The old art-y 20 test never matched that, so the ball
         sat there with state still 'play' and the plunger dead. */
      if (only.x > laneMid - 1.2 &&
          Math.abs(only.vx) + Math.abs(only.vy) < 3.5) {
        state = 'ready';
        charge = 0;
        PF.setPlunger(0); PF.snapPlunger();
        setMessage('BALL RETURNED  \u2014  PULL AGAIN', false, 2, 'gold');
      }
    }

    /* ---- timers ---- */
    if (comboTimer > 0) { comboTimer -= raw; if (comboTimer <= 0) combo = 0; }
    if (skillTimer > 0) {
      skillTimer -= raw;
      if (skillTimer <= 0) skillLive = false;
    }
    if (tiltTimer > 0) { tiltTimer -= raw; if (tiltTimer <= 0) tiltWarn = 0; }
    if (saveActive) { saveTime -= raw; if (saveTime <= 0) saveActive = false; }
    if (messageTimer > 0) {
      messageTimer -= raw;
      if (messageTimer <= 0 && state !== 'attract' && state !== 'gameover') {
        setMessage(combo > 1 ? 'COMBO ' + combo + 'X' : '', false, 0);
      }
    }
    if (multiballTimer > 0) {
      multiballTimer -= raw;
      if (multiballTimer <= 0 && multiballActive && !wizardActive) {
        multiballActive = false; jackpotArmed = false;
        audio.setIntensity(0);
        audio.stopInsert();
        setMessage('ONE DROP OVER', false, 2, 'gold');
      }
    }
    if (wizardTimer > 0) {
      wizardTimer -= raw;
      if (wizardTimer <= 0) {
        wizardActive = false;
        multiballActive = false;
        jackpotArmed = false;
        audio.setIntensity(0);
        audio.stopInsert();
        setMessage('IRIE MASTER COMPLETE', false, 3, 'wizard');
      }
    }
    if (state === 'ballover' && bonusTotal > 0) {
      bonusTicking += raw;
      bonusShown = Math.min(bonusTotal, bonusShown + bonusTotal * raw * 1.6);
      if (dmd) dmd.state.bonusShown = bonusShown;
      if (bonusShown >= bonusTotal && bonusTicking > 1.1) { bonusTicking = 0; finishBonus(); }
    }

    /* ---- score roll-up ---- */
    if (displayScore < score) {
      displayScore = Math.min(score, displayScore + Math.max(80, (score - displayScore) * 0.13));
    } else {
      displayScore = score;
    }

    /* ---- visuals ---- */
    var t = now;
    var zoomTarget = (state === 'play' || state === 'ready') ? 1 : 0;
    camZoom += (zoomTarget - camZoom) * Math.min(1, raw * 1.5);

    for (var bi = 0; bi < world.balls.length; bi++) {
      var b = world.balls[bi];
      var target = L(b.x, b.y, BALL_R + (b.z || 0));
      b.mesh.position.lerp(target, 0.5);
      b.mesh.rotation.x += b.vy * raw * 0.6;
      b.mesh.rotation.z -= b.vx * raw * 0.6;
      var sp2 = L(b.x, b.y, 0.045);
      b.shadow.position.set(sp2.x, sp2.y, sp2.z);
      var h = THREE.MathUtils.clamp((b.y - 0) / 40, 0, 1);
      b.shadow.material.opacity = 0.5 * (1 - h * 0.5) * (1 - Math.min(1, (b.z || 0) / 6) * 0.85);
      var bs = Math.abs(b.vx) + Math.abs(b.vy);
      if (bs > 7 && (state === 'play' || state === 'ready')) {
        ptrail(b.x, b.y, BALL_R + (b.z || 0),
          multiballActive ? [PAL.red, PAL.gold, PAL.green][bi % 3] : 0xfff0b8, 0.26);
      }
    }

    /* ---- the ball rolling on the playfield ----
      A pinball machine is not silent between the big hits: a rolling
      steel ball has its own noise, brighter and louder the faster it
      runs, panned across the cabinet as it travels. Sampled at 12 Hz
      per moving ball so the engine is not flooded with one-shot nodes. */
    rollTimer -= raw;
    if (rollTimer <= 0 && (state === 'play' || state === 'ready')) {
      rollTimer = 0.083;
      for (var rb = 0; rb < world.balls.length; rb++) {
        var ball = world.balls[rb];
        var rspd = Math.abs(ball.vx) + Math.abs(ball.vy);
        if (rspd > 4 && (ball.z || 0) < 1.5) audio.roll(rspd, panOf(ball.x));
      }
    }

    /* ---- hardware ---- */
    PF.update(raw, t, {
      multiball: multiballActive,
      attract: state === 'attract',
      charge: (state === 'ready') ? charge : 0,
      boost: wizardActive ? 0.8 : (multiballActive ? 0.5 : (state === 'attract' ? 0.25 : 0))
    });

    /* update() is optional -- see the CONTRACT note above buildCabinet */
    if (machine && machine.update) machine.update(t, multiballActive);
    if (gridTex) gridTex.offset.y = (t * 0.006) % 1;
    for (var mi = 0; mi < moodLights.length; mi++) {
      moodLights[mi].intensity = LIT(0.5 + 0.5 * (0.5 + 0.5 * Math.sin(t * (1.1 + mi * 0.3) + mi)));
    }

    /* heartbeat: when served by scripts\serve.ps1 -WaitWindow (the desktop
       icon), the page pings once a 5 s so the server's idle watchdog can
       tell "window closed" from "quiet game". Fetch failures (file://,
       plain browser use) are silently ignored. */
    if (!pingsOff) {
      if (pingTimer > 0) pingTimer -= raw;
      else {
        pingTimer = 5;
        try {
          fetch('/ping', { cache: 'no-store' }).then(function (r) {
            /* 404 = not the desktop server (plain dev/browser serve):
               give up pinging instead of spamming a dead endpoint */
            if (!r.ok) pingsOff = true;
          }).catch(function () { /* offline: keep trying */ });
        } catch (e) { /* file:// */ }
      }
    }

    particles.update(raw);
    if (shake > 0) {
      shake = Math.max(0, shake - raw * 2.2);
      shakeX = (Math.random() - 0.5) * shake;
      shakeY = (Math.random() - 0.5) * shake;
    }
    /* the fly-in owns the camera for its 1.25s; the standing view takes
       over from the exact pose the tween ends on */
    if (!flyTick(raw)) updateCamera(t);

    /* ---- dot-matrix display ---- */
    if (dmd) {
      dmd.tick(raw);
      /* One reused patch object and one reused step array: the panel is
         fed every frame, so a fresh object and a fresh array per frame were
         ~120 allocations a second for content that is then thrown away the
         same frame (dmd.set only copies fields, so a reused object is
         exactly as correct). Set in place, then hand over. */
      dmdPatch.mode = state === 'attract' ? 'attract' : (state === 'gameover' ? 'gameover' : (state === 'ready' ? 'ready' : 'play'));
      dmdPatch.score = displayScore;
      dmdPatch.high = highScore;
      dmdPatch.ball = ballNum;
      dmdPatch.balls = ballsLeft;
      dmdPatch.mult = mult;
      dmdPatch.combo = combo;
      dmdPatch.lanes = irieOn;
      for (var mi = 0; mi < missions.length; mi++) dmdSteps[mi] = missions[mi].step;
      dmdPatch.missions = dmdSteps;
      dmdPatch.missionNames = missionNames;
      dmdPatch.multiball = multiballActive;
      /* wizard runs on top of multiball, so the DMD needs to be told
         about it separately or it shows the multiball screen */
      dmdPatch.wizard = wizardActive;
      dmdPatch.wizardTimer = wizardTimer;
      dmdPatch.jackpot = jackpotArmed;
      dmdPatch.tilt = tilted;
      dmdPatch.charge = charge;
      dmdPatch.chargeFull = FULL_DRAW;      /* the draw the spring needs */
      dmdPatch.skill = skillLive;
      dmdPatch.mbShots = multiballShots;
      dmdPatch.bonus = bonusTotal;
      /* the attract how-to-play screen follows the live bindings */
      dmdPatch.keyLeft = keyLabel(keys.left);
      dmdPatch.keyRight = keyLabel(keys.right);
      dmd.set(dmdPatch);
      dmd.render(t);
      if (dmdTex) dmdTex.needsUpdate = true;
    }

    updateHUD();
    /* fold any hardware that moved since the last frame into its batch (a
       flipper, a bumper mid-flash, the knob being pulled) -- see batch.js */
    if (global.PB.batch) global.PB.batch.update();
    renderer.render(scene, camera);

    /* the gate's frame half: a frame that POST-DATES the last boot stage is
       now in the canvas, so the loader can fade onto a real machine */
    if (bootRevealPending) { bootRevealPending = false; bootMaybeReveal(); }
  }

  /* ================= resize =================
     Re-fit the whole playfield to a new width and height, live.

     Nothing here is a guess. The layout in table.js is authored in art
     percent, so changing the frame moves every wall, ramp, lamp, target,
     slingshot, flipper, the ball radius and the camera together -- the
     table is rebuilt rather than scaled, which is why nothing can end up
     half-adjusted.

     The cabinet is rebuilt too, because machine.js bakes the table's
     centre line at build time. Its own outer dimensions are untouched:
     if the cabinet itself changes, re-derive the size from its new
     opening first --

       PB.game.fitPlayfield(PB.cabinetOpening({ outL: ..., outR: ...,
                                                footY: ..., headY: ... }))

     or, for the numbers currently in machine.js, just:

       PB.game.fitPlayfieldToCabinet()

     Both accept a plain { W, H } too, if the cabinet is being driven
     from somewhere else. */
  /* ---- draw-call folding -------------------------------------------
     Once the geometry is built and in place, fold it into one
     THREE.BatchedMesh per material: the cabinet and playfield are ~360
     meshes, and the frame is submitted four times over (the main pass plus
     a pass per live mirror panel), so unbatched they cost ~1450 draw calls
     a frame. See batch.js for what is folded, what is deliberately left
     alone, and how a part that moves after the fold keeps moving.

     Called after the boot's build, and again after a rebuild, because a
     resize throws the hardware away and builds it fresh. */
  function foldBatches() {
    if (!global.PB.batch) return;
    try { global.PB.batch.fold(scene); }
    catch (e) { /* worst case the machine draws unbatched, as it did before */ }
  }

  function fitPlayfield(W, H, centerX, centerY) {
    W = +W; H = +H;
    if (!(W > 0) || !(H > 0)) return table;

    if (centerX === undefined || centerX === null) centerX = CX;
    if (centerY === undefined || centerY === null) centerY = CY;

    global.PB.PF_SIZE = { W: W, H: H, centerX: +centerX, centerY: +centerY };
    var next = global.PB.buildTable(global.PB.PF_SIZE);

    /* ---- physics: a fresh world on the new frame ---- */
    world.balls.forEach(removeBallMesh);
    world.balls.length = 0;
    ballMeshes.length = 0;
    world = new global.PB.World(next);

    /* ---- surface + sheen ---- */
    playfield.geometry.dispose();
    playfield.geometry = new THREE.PlaneGeometry(next.W, next.H);
    var oldMap = playfield.material.map;
    if (assets.ready) {
      assets.mapUV(playfield.geometry, 'playfield');
      playfield.material.map = assets.texture;
    } else {
      playfield.material.map = art.makePlayfield(next);
    }
    playfield.material.needsUpdate = true;
    if (oldMap && oldMap !== assets.texture && oldMap.dispose) oldMap.dispose();
    sheen.geometry.dispose();
    sheen.geometry = new THREE.PlaneGeometry(next.W, next.H);

    /* ---- hardware ---- */
    global.PB.vibrance.release(PF.group);      /* hand the originals back */
    group.remove(PF.group);
    PF.dispose();
    PF = global.PB.Playfield.build({ table: next, world: world, glowTex: glowTex });
    group.add(PF.group);

    /* ---- cabinet + floor: both cache the old centre, so both go ---- */
    if (machine) {
      try { global.PB.vibrance.release(machine.root); } catch (e) { /* cosmetic */ }
      if (machine.root) group.remove(machine.root);
      if (machine.dispose) machine.dispose();
      machine = null;
    }
    if (floorGroup) {
      scene.remove(floorGroup);
      floorGroup.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (o.material.map && o.material.map.dispose) o.material.map.dispose();
          o.material.dispose();
        }
      });
      floorGroup = null;
    }

    /* ---- adopt the new frame ---- */
    table = next;
    CX = table.centerX; CY = table.centerY;
    BALL_R = 0.62 * (table.K || 1);
    group.position.set(CX, CY, 0);
    playfield.position.copy(L(CX, CY, 0));
    sheen.position.copy(L(CX, CY, 0.02));
    ballGeo.dispose();
    ballGeo = new THREE.SphereGeometry(BALL_R, 34, 24);

    /* ---- rebuild everything that reads the frame ---- */
    assets.load(function () {
      mark('boot:refreshart-start');
      PF.refreshArt();
      mark('boot:refreshart-done');
      global.PB.vibrance.sweep(PF.group);
      mark('boot:pfsweep-done');
      buildCabinet();
      ldStage(80);            /* cabinet built: unlock the next stride */
      newBall();
      mark('boot:newball-done');
      computeFitCorners();
      fitCamera();
      /* the hardware is new geometry in new places: fold it again (batch.js
         releases the old batches as part of folding) */
      foldBatches();
      mark('boot:refit-done');
      /* the sprite sheet has settled: bring the machine and the menu in.
         The loader fades, the panel above the screen drops back in with
         its bounce, and PLAY goes live. */
      revealMachine();
    });
    return table;
  }

  /* convenience: derive the size AND the centre from the cabinet numbers
     in table.js, so a change to machine.js is a one-line re-derivation */
  function fitPlayfieldToCabinet(cabinet) {
    var o = global.PB.cabinetOpening(cabinet);
    return fitPlayfield(o.W, o.H, o.centerX, o.centerY);
  }

  /* ================= boot ================= */
  /* The panel starts parked above the screen (CSS .above), fully hidden
     while the loader covers things. When the sprite sheet settles the
     loader fades and the panel drops back in with its bounce. If the
     sheet failed or hung, the safety timer brings the machine up anyway --
     procedural art beats a stuck loading screen.

     Staged progress for the loader bar. There is no byte-count API for a
     single Image, so the bar CREEPS toward its next real milestone
     instead of sitting still or teleporting: the tip crawls while work
     happens, then advances when an actual stage lands. The safety timer
     bounds the wait either way. */
  if (D.menu) D.menu.classList.add('above');

  /* ---- the loading bar ----
     The bar only ever moves FORWARD, and it only reaches 100 when the
     machine is actually on screen. It has two real drivers:

       bytes   the sprite sheet's own download (assets.progress()) is the one
               thing a fresh load actually waits on, so between LD_LO and
               LD_HI the bar IS the sheet's byte count -- no guessing. This
               is what the old bar could not do: driven off a preload it had
               no byte signal at all, so it crept to a stage cap, sat there
               while the sheet finished, and then snapped to 100.
       stages  the boot's own milestones raise the ceiling under it: the
               sheet settled (78), the cabinet built (88), the reveal (100).

     `shown` eases toward `target` and never decreases; the fill also carries
     a CSS transition, so the bar keeps gliding between our updates. */
  var LD_LO = 6, LD_HI = 60;              /* the byte band */
  var ldShown = 0, ldTarget = LD_LO, ldTick = 0, ldMsgKey = '', ldMsgText = '';
  var ldStart = ldClock();
  /* ---- take the bar over from index.html's inline driver ----------------
     That driver has been moving the bar since the first paint, which is the
     whole cold-cache download before this file even executes (see the note
     in index.html). Adopt its percentage and stop it, or the handover would
     snap the bar back down to 6% and read as a restart. */
  var ldHead = global.__PB_LOADER;
  if (ldHead) {
    ldShown = ldTarget = Math.max(ldTarget, ldHead.shown() || 0);
    ldHead.stop();
  }
  function ldClock() {
    return (global.performance && global.performance.now) ? global.performance.now() / 1000 : 0;
  }
  function ldSetTarget(pct) {
    if (revealed) return;
    if (pct > ldTarget) { ldTarget = pct; framesAtStage = framesDrawn; }
  }
  function ldCreep() {
    if (ldShown < ldTarget) {
      ldShown = Math.min(ldTarget, ldShown + Math.max(1.5, (ldTarget - ldShown) * 0.18));
      if (D.ldFill) D.ldFill.style.width = ldShown.toFixed(1) + '%';
    }
  }
  /* Written when the TEXT changes, not when the key does: the artwork
     message carries a byte count, which ticks up several times per second
     during the download and has to be allowed to say so. */
  function ldSay(msg, key) {
    ldMsgKey = key;
    if (D.ldMsg && msg !== ldMsgText) { D.ldMsg.textContent = msg; ldMsgText = msg; }
  }
  /* what the sheet's download is actually doing, in bytes when the inline
     script managed to stream it and just a phrase when it could not */
  function ldSheetLabel() {
    var h = global.__PB_SHEET;
    if (h && !h.done && !h.failed && h.total > 0) {
      return 'loading the artwork  ' + Math.max(1, Math.round(h.loaded / 1024)) +
             ' / ' + Math.round(h.total / 1024) + ' KB';
    }
    return 'loading the artwork';
  }
  /* The honest ceiling while the sheet is in flight: the byte count when we
     have one, and a slow expectation under it so a browser that cannot
     measure the download still shows a bar that is moving rather than
     frozen. */
  function ldSheetTarget() {
    var p = (assets && assets.progress) ? assets.progress() : 0;
    var expect = LD_LO + (LD_HI - LD_LO) * (1 - Math.exp(-(ldClock() - ldStart) / 4));
    return Math.max(LD_LO + p * (LD_HI - LD_LO), expect);
  }
  (function ldLoop() {
    if (revealed) return;
    /* schedule first: whatever else happens below, a throw must not be able
       to kill the loader and leave the player staring at the bar forever */
    ldTick = setTimeout(ldLoop, 40);
    if (!bootSheetDone) {
      /* a sheet that FAILED never fires its load callback -- its queued
         consumers are dropped by design -- so notice it here and move the
         boot on to the procedural-art path instead of waiting for the
         panic timer. */
      if (assets.failed) bootSheetDone = true;
      else { ldSetTarget(ldSheetTarget()); ldSay(ldSheetLabel(), 'sheet'); }
    }
    if (bootSheetDone) { ldSetTarget(78); ldSay('painting the table', 'paint'); }
    ldCreep();
    if (bootSheetDone) bootMaybeReveal();
  })();
  function ldStage(cap) {
    /* raise the milestone: called as real stages land (the sheet settled,
       the cabinet built). The bar creeps toward this, so a stage landing is
       what makes it visibly move. */
    if (revealed) return;
    ldSetTarget(cap);
  }
  var revealed = false;
  /* ---- the reveal gate ----
     "There is a machine to look at" is two facts plus a frame:

       sheet settled   the sheet's consumers have run (its art is on)
       cabinet built   the cabinet exists, built off that sheet
       one frame since a frame has been drawn AFTER the later of those two,
                       so the fade uncovers a canvas that has the machine
                       in it. Fading over a canvas with no frame in it is a
                       black screen with the game's name on it.

     The timer below is only the panic button for an asset that never
     arrives. It used to be the ONLY path that ever dismissed the loader,
     so every launch sat on the loading bar for a flat 9 s however fast the
     machine came up -- measured on this machine: cabinet done at 0.9 s,
     screen held to 9.3 s. */
  function bootMaybeReveal() {
    if (!(bootSheetDone && bootCabinetDone)) return;
    /* One real frame has to land before the loader fades, so the fade
       uncovers a canvas that has the machine in it. The boot no longer runs
       the render loop for its own sake (see `frame`), so ask for exactly
       that one frame and reveal from inside it. */
    if (framesDrawn <= framesAtStage) { bootDrawNow = true; bootRevealPending = true; return; }
    revealMachine(false);
  }
  function revealMachine(force) {
    if (revealed) return;
    if (!force && framesDrawn <= framesAtStage) { bootRevealPending = true; return; }
    revealed = true;
    bootRevealPending = false;
    clearTimeout(ldTick);
    ldTarget = ldShown = 100;
    /* snap the fill to 100 first so the bar reads complete as it fades */
    ldCreep();
    if (D.ldFill) D.ldFill.style.width = '100%';
    if (D.ldMsg) D.ldMsg.textContent = 'ready';
    if (D.loader) D.loader.classList.add('gone');
    /* the boot is over: the frame-rate governor may start judging frames
       now (before this it only measures -- see guard.js). A fresh load's
       decode storm is not a frame rate, and a governor that took it for one
       would trim quality on every launch and hand it back a moment later. */
    if (global.PB.guard) global.PB.guard.start();
    if (D.menu) {
      D.menu.classList.remove('above');
      /* the drop itself: from fully parked above the screen */
      menuBounceQueued = true;
      menuSlide('down');
    }
  }
  /* The tile above LD_LO is the sheet's byte count from the moment the
     first stage lands, so the bar needs no seed here: ldLoop drives it. */
  assets.load(function () {
    bootSheetDone = true;
    ldStage(78);
    /* last stage: the cabinet is built and swept, so every part is in its
       final place and the whole scene can be folded (see batch.js) before
       the first revealed frame is drawn */
    foldBatches();
    bootMaybeReveal();
  });
  setTimeout(function () { revealMachine(true); }, 9000);   /* keep going even if an asset hangs */
  bigMessage('ONE DROP', 'PRESS PLAY');
  syncLamps();
  setText(D.menuHigh, highScore.toLocaleString('en-US'));
  requestAnimationFrame(frame);

  /* expose a little for debugging */
  global.PB.game = {
    /* getters, because fitPlayfield() replaces these objects wholesale */
    get world() { return world; },
    get table() { return table; },
    /* `playfield` is the hardware module; `surface` is the painted plane
       and `sheen` the lacquer over it -- the three things a resize
       touches, named so they can be found without reading the source. */
    get playfield() { return PF; },
    get surface() { return playfield; },
    get sheen() { return sheen; },
    dmd: dmd,
    startGame: startGame, spawnBall: spawnBall,
    renderer: renderer, scene: scene, camera: camera, group: group, audio: audio,
    get machine() { return machine; },
    exitOrbit: exitOrbit, fitCamera: fitCamera,
    setCamLock: setCamLock,
    get camLocked() { return camLocked; },
    setMute: setMute,
    get muted() { return muted; },
    /* true while the player is holding a view they set with the mouse */
    get orbiting() { return orbit.on; },
    fitPlayfield: fitPlayfield,
    fitPlayfieldToCabinet: fitPlayfieldToCabinet,
    resetGame: doResetGame,
    get keys() { return keys; },
    /* { playfieldW, cabinetW } -- the fit invariant, for the console */
    get cabinetFit() { return cabinetFit; },
    checkCabinetFit: checkCabinetFit,
    get state() { return state; },
    get paused() { return paused; },
    get score() { return score; },
    get extraBalls() { return extraBalls; },   /* earned free balls */
    get ballNum() { return ballNum; },         /* debug: current ball number */
    setExtraBalls: function (n) { extraBalls = Math.max(0, n | 0); },   /* test hook */
    get missions() { return missions; },
    setCharge: function (v) { charge = v; charging = true; },
    launch: launch, nudge: nudge,
    /* the attract-screen demo player: `on` is whether it is driving, and
       `wait` is how many seconds of attract it gives the screen first */
    demo: {
      start: demoStart, stop: demoStop, toggle: toggleDemo,
      get on() { return demo.on; }
    },
    multiball: startMultiball, wizard: startWizard
  };
})(window);
