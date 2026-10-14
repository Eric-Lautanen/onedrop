/* ============================================================
   ONE DROP PINBALL  --  dmd.js
   The dot-matrix display. A real 128x32 plasma panel, drawn the
   way a pinball DMD actually works: everything is composed on an
   offscreen 128x32 canvas, then rasterised into round-ish dots
   and bloomed.

   The canvas element it draws into is ALSO the texture source for
   the plane on the backbox, so whatever appears here appears on
   the machine's screen.

   USAGE
     var dmd = PB.DMD.create(document.getElementById('dmd'));
     dmd.set({ score: 1234, ball: 1, mult: 2, ... });
     dmd.render(t);            // once a frame
     dmd.say('MULTIBALL!', 3); // a timed banner
   ============================================================ */
import './audio.js';

(function (global) {
  'use strict';

  var COLS = 128, ROWS = 32;

  /* ---------------------------------------------------------
     1-bit sprites. '#' lights a dot. Kept small and hand-drawn
     so they read cleanly at DMD resolution.
     --------------------------------------------------------- */
  var SPR = {
    drop: [
      '   ##   ',
      '  ####  ',
      ' ###### ',
      '########',
      '########',
      '########',
      ' ###### ',
      '  ####  ',
      '   ##   '
    ],
    bigdrop: [
      '     ##     ',
      '    ####    ',
      '   ######   ',
      '  ########  ',
      ' ########## ',
      '############',
      '############',
      '############',
      ' ########## ',
      '  ########  ',
      '   ######   ',
      '    ####    '
    ],
    peace: [
      '   ####   ',
      '  ##  ##  ',
      ' ##    ## ',
      '##  ##  ##',
      '##  ##  ##',
      '##  ##  ##',
      ' ## ## ## ',
      '  ######  ',
      '   ####   '
    ],
    tiki: [
      '  ######  ',
      ' ######## ',
      '##  ##  ##',
      '##  ##  ##',
      '##########',
      '####  ####',
      '## #### ##',
      '##  ##  ##',
      '##########',
      ' ##    ## ',
      ' ##    ## ',
      ' ######## '
    ],
    lion: [
      '  #  #  #  #  ',
      ' # ###  ###  #',
      '#  ########  #',
      '# ##  ##  ## #',
      '#  ## ## ##  #',
      ' ## ##### ## ',
      '  ## ### ##  ',
      '  # ##### #  ',
      '  #  # #  #  ',
      '   ## # ##   ',
      '    #####    ',
      '     ###     '
    ],
    palm: [
      ' #  #  # ',
      ' ###### ',
      '#  ##  #',
      '   ##   ',
      '   ##   ',
      '   ##   ',
      '  ####  '
    ],
    note: [
      '   ####',
      '   ####',
      '   ##  ',
      '   ##  ',
      '   ##  ',
      ' ###   ',
      '###    ',
      '##     '
    ]
  };

  function create(canvas) {
    if (!canvas) return null;

    var v = canvas.getContext('2d');
    var DW = canvas.width, DH = canvas.height;
    var cw = DW / COLS, ch = DH / ROWS;

    /* the offscreen dot canvas: alpha is what we care about */
    var off = document.createElement('canvas');
    off.width = COLS; off.height = ROWS;
    var o = off.getContext('2d', { willReadFrequently: true });
    o.imageSmoothingEnabled = false;

    /* bloom scratch buffers: a tight core pass and a wide halo pass,
       both drawn from the dot canvas and added on top of the panel */
    var bloom = document.createElement('canvas');
    bloom.width = DW; bloom.height = DH;
    var bx = bloom.getContext('2d');

    /* ---------------- raster assets, cached ----------------
       Drawing the grid one fillRect at a time every frame is cheap, but
       it can never look like plasma: the dots need a hot core and a cool
       edge, and the unlit part needs its own visible dot grid. Both are
       rebuilt inside resize() so the panel can change shape at runtime --
       machine.js reads the painted plate behind the glass and squares the
       canvas up to it, which makes ch taller than cw on this machine. */
    var dotSprite = document.createElement('canvas');
    var unlitGrid = document.createElement('canvas');
    var DOT_KEYS = null;      /* "cw,ch" the caches were built for */
    /* the two bloom radii, in CANVAS pixels: set per raster in cell terms
       below, so the halo keeps its proportion at any dot size */
    var BLUR_CORE = 1.6, BLUR_HALO = 7;

    function rrPath(x, ctx2, X, Y, W, H, R) {
      /* rounded rect, hand-rolled (ctx.roundRect is not everywhere) */
      x.beginPath();
      x.moveTo(X + R, Y);
      x.lineTo(X + W - R, Y);
      x.quadraticCurveTo(X + W, Y, X + W, Y + R);
      x.lineTo(X + W, Y + H - R);
      x.quadraticCurveTo(X + W, Y + H, X + W - R, Y + H);
      x.lineTo(X + R, Y + H);
      x.quadraticCurveTo(X, Y + H, X, Y + H - R);
      x.lineTo(X, Y + R);
      x.quadraticCurveTo(X, Y, X + R, Y);
      x.closePath();
    }

    function buildDotAssets(col) {
      DOT_KEYS = cw + ',' + ch;
      /* 1.6px and 7px were tuned on a 5.66-pixel cell, so they are kept in
         cell terms: at a 7-pixel cell they come back as ~2 and ~8.7px, the
         same halo over a slightly bigger dot */
      BLUR_CORE = Math.max(1, ch * 0.283);
      BLUR_HALO = Math.max(2, ch * 1.237);
      var gap = Math.max(1, Math.min(cw, ch) * 0.30);
      var dw = cw - gap, dh = ch - gap;
      var SW = Math.ceil(cw) + 2, SH = Math.ceil(ch) + 2;

      /* -- the lit dot: a pill with a hot centre and a soft edge -- */
      dotSprite.width = SW; dotSprite.height = SH;
      var dx = dotSprite.getContext('2d');
      var gx = dx.createRadialGradient(SW / 2, SH / 2, Math.min(dw, dh) * 0.1,
        SW / 2, SH / 2, Math.min(dw, dh) * 0.62);
      gx.addColorStop(0, '#fff3da');          /* filament white */
      gx.addColorStop(0.55, col);
      gx.addColorStop(1, col);
      rrPath(dx, dx, (SW - dw) / 2, (SH - dh) / 2, dw, dh, Math.min(dw, dh) * 0.46);
      dx.fillStyle = gx;
      dx.fill();

      /* -- the unlit panel: dark plate with its faint dot grid, so the
            glass reads as a plasma panel even where nothing shows -- */
      unlitGrid.width = DW; unlitGrid.height = DH;
      var ux = unlitGrid.getContext('2d');
      ux.fillStyle = '#070401';
      ux.fillRect(0, 0, DW, DH);
      ux.fillStyle = 'rgba(255,178,62,0.062)';
      for (var r = 0; r < ROWS; r++) {
        for (var c = 0; c < COLS; c++) {
          rrPath(ux, ux, c * cw + gap * 0.5, r * ch + gap * 0.5, dw, dh, Math.min(dw, dh) * 0.46);
          ux.fill();
        }
      }
      /* a gentle pool of light in the middle, like the plate reflects
         its own lit dots even on a black page */
      var vg = ux.createRadialGradient(DW / 2, DH / 2, DH * 0.1, DW / 2, DH / 2, DW * 0.55);
      vg.addColorStop(0, 'rgba(255,178,62,0.045)');
      vg.addColorStop(1, 'rgba(0,0,0,0)');
      ux.fillStyle = vg;
      ux.fillRect(0, 0, DW, DH);
    }

    var COLORS = {
      amber: '#ffb23e',
      gold: '#ffd75e',
      red: '#ff5a4a',
      green: '#6dff9a',
      lime: '#c8ff6a',
      white: '#fff6dc',
      blue: '#6fd8ff'
    };

    /* ---------------- state ---------------- */
    var S = {
      mode: 'attract',
      score: 0, high: 0, ball: 1, balls: 3, mult: 1, combo: 0,
      lanes: [false, false, false, false],
      missions: [],
      missionNames: [],
      rampShots: 0, spins: 0, bashes: 0,
      msg: null, msgUntil: 0, msgKind: 'amber', msgBorn: 0,
      multiball: false, jackpot: false, tilt: false,
      bonus: 0, bonusShown: 0,
      charge: 0, skill: false,
      mbShots: 0,
      /* wizard mode runs ON TOP of multiball, so it needs its own flag
         or it just inherits the multiball screen */
      wizard: false, wizardTimer: 0,
      tick: 0
    };
    var marqueeX = 0;
    var attractPage = 0, attractTimer = 0;

    function set(patch) {
      for (var k in patch) if (patch.hasOwnProperty(k)) S[k] = patch[k];
    }

    /* ---------------- text helpers ---------------- */
    function font(px, weight, family) {
      o.font = (weight || 'bold') + ' ' + px + 'px ' + (family || '"Courier New", monospace');
      o.textBaseline = 'top';
      o.fillStyle = '#fff';
    }
    /* The panel is only ROWS (32) tall. A line whose top sits at y
       needs y + px rows, so anything past ROWS - px runs off the bottom
       and gets sliced -- which is exactly what happened to "SKILL
       SHOT!", "PRESS SPACE" and the second how-to-play line. Clamp
       every line's top so its glyph box always lands inside the panel.
       This is a net under the layouts, not a substitute for them: the
       screens below are still laid out to fit on their own. */
    function fitY(y, px) {
      return Math.max(0, Math.min(y, ROWS - px));
    }
    /* The horizontal twin of fitY. A line wider than its usable width gets
       its font SHRUNK to fit, never sliced: the old helpers simply centred
       and let the panel edges clip, which is what cut 'SHOOT THE TIKI', the
       long jackpot banners and a seven-digit score off at both borders.
       maxW is the dot width the line may occupy at its position -- textC's
       default is the room between its centre and the nearer edge (the
       score screens park text off-centre to clear the palm sprites),
       textR's is the room left of the anchor, text's the room right of it.
       Pass a smaller maxW where a neighbour shares the line. */
    function fitPx(s, px, maxW, family) {
      maxW = Math.max(10, maxW);
      font(px, 'bold', family);
      var w = o.measureText(s).width;
      if (w > maxW) px = Math.max(5, Math.floor(px * maxW / w));
      return px;
    }
    function text(s, x, y, px, family, maxW) {
      px = fitPx(s, px, maxW === undefined ? (COLS - 2 - x) : maxW, family);
      font(px, 'bold', family);
      o.fillText(s, Math.round(x), Math.round(fitY(y, px)));
    }
    function textC(s, cx, y, px, family) {
      px = fitPx(s, px, 2 * Math.min(cx, COLS - cx) - 2, family);
      font(px, 'bold', family);
      var w = o.measureText(s).width;
      o.fillText(s, Math.round(cx - w / 2), Math.round(fitY(y, px)));
    }
    function textR(s, rx, y, px, family, maxW) {
      px = fitPx(s, px, maxW === undefined ? (rx - 2) : maxW, family);
      font(px, 'bold', family);
      var w = o.measureText(s).width;
      o.fillText(s, Math.round(rx - w), Math.round(fitY(y, px)));
    }
    function width(s, px, family) {
      font(px, 'bold', family);
      return o.measureText(s).width;
    }
    /* a big chunky arcade face for scores and banners */
    var BIG = '"Arial Black", Impact, sans-serif';

    /* ---------------- sprite helper ---------------- */
    function sprite(name, x, y, scale) {
      var s = SPR[name];
      if (!s) return;
      var sc = scale || 1;
      for (var r = 0; r < s.length; r++) {
        var row = s[r];
        for (var c = 0; c < row.length; c++) {
          if (row.charCodeAt(c) !== 35) continue;
          o.fillRect(Math.round(x + c * sc), Math.round(y + r * sc), Math.ceil(sc), Math.ceil(sc));
        }
      }
    }

    /* ---------------- bar / pip helpers ---------------- */
    function bar(x, y, w, h, frac, cap) {
      frac = Math.max(0, Math.min(1, frac));
      o.fillStyle = 'rgba(255,255,255,0.24)';
      o.fillRect(x, y, w, h);
      o.fillStyle = '#fff';
      var fw = Math.max(0, Math.round(w * frac));
      for (var i = 0; i < fw; i += 2) o.fillRect(x + i, y, Math.min(1, fw - i), h);
      if (cap) o.fillRect(x, y, 1, h);
    }
    function pips(x, y, n, lit, size) {
      size = size || 3;
      for (var i = 0; i < n; i++) {
        o.fillStyle = i < lit ? '#fff' : 'rgba(255,255,255,0.22)';
        o.fillRect(x + i * (size + 2), y, size, size);
      }
    }
    /* ---------------- the two palms ----------------
       The artwork paints a palm either side of the display, and the panel
       now covers that paint (see BAND_WIN in machine.js), so the pair lives
       here instead: one silhouette on each edge, standing on the panel's
       bottom row. Every frond is drawn dot by dot, so each lit pixel is one
       whole plasma dot, and the whole crown sways on the game clock -- the
       one thing the painted ones could never do. */
    /* d is the inboard direction, so the trunk leans INTO the panel and the
       crown hangs over the play of the display instead of off its edge
       (outboard, the whole canopy lands outside the 128 columns and all
       that is left on the glass is a bare vertical line). */
    function onePalm(px, by, d, sway) {
      var h = 15;
      /* trunk: one dot wide, curving inboard as it rises */
      for (var i = 0; i <= h; i++) {
        var f = i / h;
        o.fillRect(Math.round(px + d * 3.0 * f * f), by - i, 1, 1);
      }
      var tx = px + d * 4.5, ty = by - h;      /* the crown, inboard of the foot */
      /* five fronds off the crown; each reaches out and droops, and the
         whole crown swings on the clock so the fronds visibly move */
      for (var k = -2; k <= 2; k++) {
        var ang = -Math.PI / 2 + k * 0.46 + sway * 0.45;
        var len = k === 0 ? 7 : 6 - Math.abs(k);
        for (var j = 1; j <= len; j++) {
          o.fillRect(Math.round(tx + Math.cos(ang) * j * 1.05),
                     Math.round(ty + Math.sin(ang) * j + j * j * 0.10), 1, 1);
        }
      }
      o.fillRect(Math.round(tx) - 1, Math.round(ty), 2, 2);   /* the crown */
    }
    function drawPalms(t, alpha) {
      o.globalAlpha = alpha === undefined ? 0.85 : alpha;
      /* 1.9/s at 0.45 rad of swing, measured: a frond tip travels about
         three dots either way. The first cut ran at 0.55/s and moved the
         tip half a dot a second, which is no animation at all. */
      onePalm(2, ROWS - 1, 1, Math.sin(t * 1.9));
      onePalm(COLS - 3, ROWS - 1, -1, Math.sin(t * 1.9 + 2.1));
      o.globalAlpha = 1;
    }

    /* ================= SCREENS ================= */

    /* ---- attract ---- */
    function drawAttract(t) {
      attractTimer += 1 / 60;
      if (attractTimer > 3.0) { attractTimer = 0; attractPage = (attractPage + 1) % 6; }
      var p = attractPage;

      if (p === 0) {
        /* falling drop onto a ripple */
        var fall = (t * 9) % 22;
        var dy = -10 + fall;
        sprite('bigdrop', 20, Math.min(dy, 12), 1);
        textC('ONE DROP', COLS / 2 + 8, 3, 17, BIG);
        textC('PINBALL', COLS / 2 + 8, 20, 11, BIG);
        /* ripple rings */
        var rr = ((t * 3) % 1);
        o.strokeStyle = 'rgba(255,255,255,' + (0.5 * (1 - rr)) + ')';
        o.lineWidth = 1;
        o.beginPath(); o.ellipse(26, 26, 6 + rr * 14, 2 + rr * 5, 0, 0, Math.PI * 2); o.stroke();

      } else if (p === 1) {
        /* scrolling marquee -- ALLOWED to overflow both edges; that is what
           a marquee is. The helpers' new shrink-to-fit would otherwise pin
           it inside the panel and kill the scroll, so these two lines pass
           an unlimited width explicitly. */
        var msg = 'ONE DROP PINBALL  *  ROOTS  *  DUB  *  SKANK  *  GOOD VIBES  *  ';
        var w = width(msg, 12);
        marqueeX -= 0.9;
        if (marqueeX < -w) marqueeX = COLS;
        text(msg, marqueeX, 11, 12, null, 1e9);
        text(msg, marqueeX + w, 11, 12, null, 1e9);
        sprite('drop', 2, 1, 1);
        sprite('drop', COLS - 10, 1, 1);

      } else if (p === 2) {
        textC('HOW TO PLAY', COLS / 2, 2, 12, BIG);
        /* the flipper labels follow the player's own bindings (game.js
           feeds keyLeft / keyRight in every frame's dmd.set), so the
           instructions can never go stale after a rebind. The shrunk-to-
           fit text helper handles a fat label like SPACE. */
        text((S.keyLeft || 'Z') + '  LEFT FLIPPER', 6, 16, 8);
        text((S.keyRight || '/') + '  RIGHT FLIPPER', 6, 24, 8);   /* rows 24..31 */
        sprite('note', COLS - 16, 15, 1);

      } else if (p === 3) {
        sprite('tiki', 4, 8, 2);
        textC('BASH THE TIKI', COLS / 2 + 10, 6, 12, BIG);
        textC('FOR THE JACKPOT', COLS / 2 + 10, 20, 9);

      } else if (p === 4) {
        textC('HIGH SCORE', COLS / 2, 2, 12, BIG);
        textC(Math.floor(S.high || 0).toLocaleString('en-US'), COLS / 2, 16, 15, BIG);

      } else {
        sprite('lion', 6, 8, 1.6);
        textC('IRIE!', COLS / 2 + 18, 5, 16, BIG);
        textC('PRESS SPACE', COLS / 2 + 18, 22, 9);
        sprite('peace', COLS - 14, 20, 1);
      }
    }

    /* ---- main score screen ---- */
    function drawScore(t) {
      /* score. maxW keeps it clear of the Ball/Mult stack on the right
         (which starts about column 104): a seven-digit score no longer
         runs under the stack or off the panel, it steps down a size. */
      text(String(Math.floor(S.score)).replace(/\B(?=(\d{3})+(?!\d))/g, ','), 2, 0, 16, BIG, 84);

      /* Ball, multiplier and combo stack down the right. The score
         owns rows 0..16, so the stack starts under it and has to finish
         by row 31: B1/3 (2..11), 1X (12..23), combo (24..31). */
      textR('B' + S.ball + '/' + S.balls, COLS - 2, 2, 9);
      o.fillStyle = '#fff';
      textR(S.mult + 'X', COLS - 2, 12, 11, BIG);
      if (S.combo > 1) textR('C' + S.combo, COLS - 2, 24, 7);

      /* the IRIE letter pips, left, under the score */
      var lx = 2;
      for (var i = 0; i < 4; i++) {
        var on = !!S.lanes[i];
        o.fillStyle = on ? '#fff' : 'rgba(255,255,255,0.20)';
        o.fillRect(lx, 19, 6, 6);
        lx += 8;
      }

      /* mission progress bars: five of them across the middle */
      var mnames = S.missionNames || [];
      var mprog = S.missions || [];
      var mx = 38, mw = (COLS - mx - 40) / Math.max(1, mnames.length);
      for (var m = 0; m < mnames.length; m++) {
        bar(mx + m * mw, 20, Math.max(6, mw - 3), 4, (mprog[m] || 0) / 3);
      }

      /* the skill-shot window callout, on the one free line left */
      if (S.skill) {
        textC('SKILL SHOT!', COLS / 2, 26, 6);
      }
    }

    /* ---- banner ---- */
    function drawBanner(t, m) {
      var age = t - m.born;
      var big = m.text.length <= 14;
      var px = big ? 18 : 13;
      textC(m.text, COLS / 2, (ROWS - px) / 2 + 1, px, BIG);
      if (m.kind === 'jackpot') {
        var rr = (age * 62) % 62;
        o.strokeStyle = 'rgba(255,255,255,' + Math.max(0, 0.8 - rr / 62) + ')';
        o.lineWidth = 1;
        o.beginPath(); o.arc(COLS / 2, ROWS / 2, 6 + rr, 0, Math.PI * 2); o.stroke();
      }
      if (m.kind === 'wizard') {
        for (var i = 0; i < 3; i++) {
          o.fillStyle = 'rgba(255,255,255,' + (0.16 + 0.2 * (0.5 + 0.5 * Math.sin(t * 6 + i))) + ')';
          o.fillRect(0, i * 3, COLS, 2);
          o.fillRect(0, ROWS - 3 + i, COLS, 1);
        }
      }
    }

    /* ---- multiball light show ---- */
    function drawMultiball(t) {
      var msgs = ['MULTIBALL!', 'SHOOT THE TIKI', 'JACKPOT ARMED', 'ALL DAY!'];
      var i = Math.floor(t * 1.8) % msgs.length;
      textC(msgs[i], COLS / 2, 4, 17, BIG);
      /* drop counter */
      var n = Math.min(4, S.mbShots || 0);
      for (var d = 0; d < 4; d++) {
        o.globalAlpha = d < n ? 1 : 0.22;
        sprite('drop', 44 + d * 11, 22, 1);
      }
      o.globalAlpha = 1;
    }

    /* ---- wizard mode ----
       Wizard runs on top of multiball, so without this it would just
       show the multiball screen and the player would never be told they
       had reached the end of the rules. Everything lit, IRIE called
       out, and a bar running down the 30-second clock. */
    function drawWizard(t) {
      textC('WIZARD MODE', COLS / 2, 0, 15, BIG);          /* rows 0..15 */
      var msgs = ['IRIE MASTER!', 'EVERY SHOT PAYS', 'JACKPOT DOUBLED', 'ALL DAY!'];
      var i = Math.floor(t * 1.6) % msgs.length;
      textC(msgs[i], COLS / 2, 17, 11, BIG);               /* rows 17..28 */
      bar(6, 29, COLS - 12, 3, (S.wizardTimer || 0) / 30, true);
    }

    /* ---- end of ball bonus ---- */
    function drawBonus(t) {
      textC('BONUS', COLS / 2, 2, 13, BIG);
      textC(Math.floor(S.bonusShown).toLocaleString('en-US'), COLS / 2, 15, 17, BIG);
      var frac = S.bonus > 0 ? S.bonusShown / S.bonus : 1;
      bar(6, 29, COLS - 12, 3, frac, true);
      sprite('drop', 2, 12, 1);
      sprite('drop', COLS - 10, 12, 1);
    }

    /* ---- game over ---- */
    function drawGameOver(t) {
      textC('GAME OVER', COLS / 2, 1, 15, BIG);
      textC(Math.floor(S.score).toLocaleString('en-US'), COLS / 2, 14, 11, BIG);
      /* One blinking prompt on the last line, not two stacked past the
         bottom edge. A new high score takes the line over from it. */
      var hi = S.score >= S.high && S.score > 0;
      if (Math.floor(t * 1.6) % 2 === 0) {
        textC(hi ? 'NEW HIGH SCORE!' : 'PRESS SPACE', COLS / 2, 25, 7);
      }
    }

    /* ---- tilt ---- */
    function drawTilt(t) {
      if (Math.floor(t * 5) % 2 === 0) {
        o.fillStyle = '#fff';
        o.fillRect(0, 0, COLS, ROWS);
      }
      o.fillStyle = '#fff';
      textC('TILT', COLS / 2, 6, 20, BIG);
    }

    /* ---- ready / plunger ---- */
    function drawReady(t) {
      text('BALL ' + S.ball, 2, 0, 12, BIG);
      /* maxW stops at the end of 'BALL n' (about column 52) so the two
         never touch on a fat score */
      textR(Math.floor(S.score).toLocaleString('en-US'), COLS - 2, 2, 12, BIG, 68);
      /* the draw has to reach the stop before the spring will throw the
         ball, so the callout walks the player up to it instead of saying
         "plunge" at any old charge */
      var full = S.chargeFull || 0.999;
      var label = S.charge >= full ? 'LET GO!'
        : (S.charge > 0.02 ? 'KEEP PULLING' : 'PULL IT BACK');
      textC(label, COLS / 2, 12, 13, BIG);
      bar(16, 25, COLS - 32, 5, S.charge || 0, true);
      sprite('drop', 4, 10, 1);
      sprite('drop', COLS - 10, 10, 1);
    }

    /* ----------------------------------------------------
       RASTER: dots from the sprite, bloom in two passes
       ---------------------------------------------------- */
    function raster(col) {
      if (DOT_KEYS !== cw + ',' + ch) buildDotAssets(col);
      var img = o.getImageData(0, 0, COLS, ROWS).data;
      v.clearRect(0, 0, DW, DH);
      v.imageSmoothingEnabled = false;
      /* unlit panel + its faint dot grid, cached */
      v.drawImage(unlitGrid, 0, 0);
      var dw = cw - Math.max(1, Math.min(cw, ch) * 0.30);
      var dh = ch - Math.max(1, Math.min(cw, ch) * 0.30);
      var ox = (Math.ceil(cw) + 2 - dw) / 2, oy = (Math.ceil(ch) + 2 - dh) / 2;
      for (var r = 0; r < ROWS; r++) {
        var rowBase = r * COLS * 4 + 3;
        for (var c = 0; c < COLS; c++) {
          var a = img[(rowBase + c * 4)];
          if (a < 40) continue;
          v.globalAlpha = 0.22 + 0.78 * (a / 255);
          v.drawImage(dotSprite, c * cw - ox, r * ch - oy);
        }
      }
      v.globalAlpha = 1;
      /* bloom: a tight core keeps text readable, a wide halo is what a
         plasma panel looks like lit in a dark room. Two passes at two
         radii instead of one soft smear. */
      if (v.filter !== undefined) {
        v.globalCompositeOperation = 'lighter';
        bx.clearRect(0, 0, DW, DH);
        bx.filter = 'blur(' + BLUR_CORE.toFixed(2) + 'px)';
        bx.drawImage(canvas, 0, 0);
        bx.filter = 'none';
        v.globalAlpha = 0.55;
        v.drawImage(bloom, 0, 0);
        bx.clearRect(0, 0, DW, DH);
        bx.filter = 'blur(' + BLUR_HALO.toFixed(2) + 'px)';
        bx.drawImage(canvas, 0, 0);
        bx.filter = 'none';
        v.globalAlpha = 0.30;
        v.drawImage(bloom, 0, 0);
        v.globalAlpha = 1;
        v.globalCompositeOperation = 'source-over';
      }
    }

    /* ================= PUBLIC ================= */
    function render(t) {
      o.clearRect(0, 0, COLS, ROWS);
      o.fillStyle = '#fff';

      /* ONE colour for every scene. The panel used to change hue per mode
         (gold, lime, red, blue, white); a real plasma DMD has a single
         gas, so a show that recolours itself reads as a screenshot, not as
         a display. Every scene is the same orange now -- the scenes are
         told apart by what they draw, not by what colour they light. */
      var col = COLORS.amber;
      var msg = (S.msg && t < S.msgUntil) ? S.msg : null;
      if (S.msg && t >= S.msgUntil) S.msg = null;
      /* The palms sit behind every scene. They are drawn first so the
         scene's own dots stay whole on top of them, and they go dim on the
         two text-heavy screens, where a bright silhouette sitting behind
         the score would read as part of it. */
      var busy = !S.tilt && !msg && S.mode !== 'gameover' && S.mode !== 'attract' &&
                 !(S.bonus > 0) && !S.wizard && !S.multiball;
      drawPalms(t, busy ? 0.38 : 0.85);

      if (S.tilt) {
        drawTilt(t);
      } else if (msg) {
        drawBanner(t, msg);
      } else if (S.mode === 'gameover') {
        drawGameOver(t);
      } else if (S.mode === 'attract') {
        drawAttract(t);
      } else if (S.bonus > 0) {
        drawBonus(t);
      } else if (S.wizard) {
        /* checked before multiball: wizard implies multiball */
        drawWizard(t);
      } else if (S.multiball) {
        drawMultiball(t);
      } else if (S.mode === 'ready') {
        drawReady(t);
      } else {
        drawScore(t);
      }

      raster(col);
    }

    function say(text, secs, kind) {
      S.msg = { text: text || '', born: S.tick, kind: kind || 'amber' };
      S.msgUntil = S.tick + (secs === undefined ? 2.2 : secs);
    }

    /* resize(w, h): the canvas is also the 3D texture source, and the
       cabinet resizes it to square it up with the painted plate behind
       the glass (machine.js). Cached cell sizes and raster assets are
       rebuilt here; assigning canvas.width clears both contexts. */
    function resize(w, h) {
      w = Math.round(w); h = Math.round(h);
      if (!w || !h || (w === DW && h === DH)) return;
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      DW = w; DH = h;
      cw = DW / COLS; ch = DH / ROWS;
      bloom.width = DW; bloom.height = DH;
      o.imageSmoothingEnabled = false;
      DOT_KEYS = null;
    }

    function clear() { S.msg = null; S.msgUntil = 0; }
    function tick(dt) { S.tick += dt; }
    function setBonus(v) { S.bonus = v; S.bonusShown = 0; }

    return {
      set: set, state: S, render: render, say: say, clear: clear,
      tick: tick, setBonus: setBonus, resize: resize,
      COLS: COLS, ROWS: ROWS, COLORS: COLORS, sprites: SPR
    };
  }

  global.PB = global.PB || {};
  global.PB.DMD = { create: create, COLS: COLS, ROWS: ROWS, sprites: SPR };
})(window);
