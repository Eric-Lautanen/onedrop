/* ============================================================
   ONE DROP PINBALL  --  art.js
   All artwork is generated at runtime on a 2D canvas, so the
   game ships with zero binary assets. The playfield texture is
   painted to match table.js coordinates exactly.
   ============================================================ */
(function (global) {
  'use strict';

  var PAL = global.PB.PALETTE;

  function css(hex) { return '#' + ('000000' + hex.toString(16)).slice(-6); }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---- the painted playfield --------------------------------
     FALLBACK ONLY. The real surface is the sprite atlas, mapped
     through assets.mapUV once the sheet decodes; this procedural
     painting covers the frame or two before that, and the whole
     session if the sheet ever fails to load. It is drawn in its own
     25 x 41 space and stretched to fill whatever frame is live, so
     it tracks a resize instead of only being correct at one size. */
  function makePlayfield(table) {
    var W = 1200, H = Math.round(1200 * (table.H / table.W));
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var ctx = c.getContext('2d');
    function px(x) { return (x + 11) / 25 * W; }
    function py(y) { return (1 - y / 41) * H; }
    function sx(v) { return v / 25 * W; }

    /* --- base ------------------------------------------------- */
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#06201a');
    g.addColorStop(0.45, '#0b3325');
    g.addColorStop(1, '#03110b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    /* --- big sun behind the bumper cluster ------------------- */
    var sunX = px(0), sunY = py(30.5), sunR = sx(9.5);
    var sg = ctx.createRadialGradient(sunX, sunY, sunR * 0.08, sunX, sunY, sunR);
    sg.addColorStop(0, 'rgba(246,196,69,0.55)');
    sg.addColorStop(0.3, 'rgba(214,120,30,0.34)');
    sg.addColorStop(0.65, 'rgba(150,60,20,0.16)');
    sg.addColorStop(1, 'rgba(120,40,10,0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    ctx.translate(sunX, sunY);
    ctx.strokeStyle = 'rgba(246,196,69,0.20)';
    for (var r = 0; r < 44; r++) {
      ctx.rotate(Math.PI * 2 / 44);
      ctx.lineWidth = r % 2 ? 3 : 8;
      ctx.beginPath();
      ctx.moveTo(sunR * 0.62, 0);
      ctx.lineTo(sunR * (0.72 + (r % 3) * 0.09), 0);
      ctx.stroke();
    }
    ctx.restore();

    /* --- rasta diagonals down both margins ------------------- */
    var rasta = [PAL.red, PAL.gold, PAL.green];
    ctx.save();
    for (var side = 0; side < 2; side++) {
      ctx.save();
      if (side === 1) { ctx.translate(W, 0); ctx.scale(-1, 1); }
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(sx(5.4), 0);
      ctx.lineTo(sx(1.6), H); ctx.lineTo(0, H);
      ctx.closePath();
      ctx.clip();
      for (var i = -6; i < 40; i++) {
        ctx.fillStyle = rasta[((i % 3) + 3) % 3];
        ctx.globalAlpha = 0.8;
        ctx.save();
        ctx.translate(sx(i * 3.4), 0);
        ctx.rotate(0.25);
        ctx.fillRect(0, -200, sx(1.7), H + 800);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }
    ctx.restore();

    /* --- palm trees ------------------------------------------ */
    function palm(bx, by, scale, color) {
      ctx.save();
      ctx.translate(px(bx), py(by));
      ctx.scale(scale, scale);
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      ctx.lineWidth = 16;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-40, -170, -20, -320);
      ctx.stroke();
      ctx.lineWidth = 26;
      for (var a = -4; a <= 4; a++) {
        if (a === 0) continue;
        var ang = a * 0.32 - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(-20, -320);
        ctx.quadraticCurveTo(
          -20 + Math.cos(ang) * 120, -320 + Math.sin(ang) * 90 - 40,
          -20 + Math.cos(ang) * 210, -320 + Math.sin(ang) * 60 + 20
        );
        ctx.stroke();
      }
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(-30, -300, 20, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-4, -312, 18, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 0.22;
    palm(-10.0, 8.0, 1.05, '#f2ead2');
    palm(12.6, 9.5, 0.95, '#f2ead2');
    ctx.globalAlpha = 1;

    /* --- wordmarks ------------------------------------------- */
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = css(PAL.ivory);
    ctx.font = 'italic 900 150px Impact, "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.save();
    ctx.translate(px(0), py(16.5));
    ctx.rotate(-0.06);
    ctx.fillText('ONE DROP', 0, 0);
    ctx.restore();
    ctx.font = 'italic 900 74px Impact, "Arial Black", sans-serif';
    ctx.save();
    ctx.translate(px(0), py(6.0));
    ctx.rotate(-0.06);
    ctx.fillText('SHOOT AGAIN  \u2022  IRON, LION, ZION', 0, 0);
    ctx.restore();
    ctx.restore();

    /* --- spinner lane ---------------------------------------- */
    ctx.save();
    ctx.strokeStyle = 'rgba(246,196,69,0.5)';
    ctx.setLineDash([14, 12]);
    ctx.lineWidth = 4;
    roundRect(ctx, px(8.4), py(28.0), sx(2.0), py(24.0) - py(28.0), sx(0.6));
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.fillStyle = 'rgba(242,234,210,0.55)';
    ctx.font = '700 34px Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.save();
    ctx.translate(px(9.4), py(22.6));
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('DUB SPINNER', 0, 0);
    ctx.restore();
    ctx.restore();

    /* --- drop target lane markings --------------------------- */
    ctx.save();
    ctx.fillStyle = 'rgba(215,38,61,0.28)';
    for (var t = 0; t < table.targetReset.xs.length; t++) {
      var txx = table.targetReset.xs[t];
      roundRect(ctx, px(txx - 0.55), py(20.5), sx(1.1), py(19.0) - py(20.5), 8);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(242,234,210,0.6)';
    ctx.font = '700 30px Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.save();
    ctx.translate(px(-6.9), py(15.2));
    ctx.rotate(-0.14);
    ctx.fillText('ONE DROP BANK', 0, 0);
    ctx.restore();
    ctx.restore();

    /* --- standup markers ------------------------------------- */
    ctx.save();
    ctx.fillStyle = 'rgba(29,154,78,0.30)';
    for (var s = 0; s < 3; s++) {
      var syy = [17.4, 19.1, 20.8][s];
      roundRect(ctx, px(8.2), py(syy + 0.9), sx(1.1), py(syy - 0.9) - py(syy + 0.9), 8);
      ctx.fill();
    }
    ctx.restore();

    /* --- rollover lanes -------------------------------------- */
    ctx.save();
    ctx.textAlign = 'center';
    for (var ro = 0; ro < table.rollovers.length; ro++) {
      var lane = table.rollovers[ro];
      var col = [PAL.red, PAL.gold, PAL.green][ro];
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      roundRect(ctx, px(lane.x - 1.3), py(39.4), sx(2.6), py(34.2) - py(39.4), sx(1.0));
      ctx.fill();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = css(col);
      ctx.font = '900 120px Impact, sans-serif';
      ctx.fillText(lane.letter, px(lane.x), py(35.0));
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    /* --- shooter lane art ------------------------------------ */
    ctx.save();
    ctx.fillStyle = 'rgba(246,196,69,0.10)';
    ctx.fillRect(px(11.1), py(30.4), sx(2.9), py(3) - py(30.4));
    ctx.fillStyle = 'rgba(242,234,210,0.5)';
    ctx.font = '900 46px Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.save();
    ctx.translate(px(12.5), py(14));
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('PULL  PLUNGER', 0, 0);
    ctx.restore();
    /* plunger power meter */
    for (var m = 0; m < 10; m++) {
      ctx.fillStyle = m < 4 ? css(PAL.green) : (m < 7 ? css(PAL.gold) : css(PAL.red));
      ctx.globalAlpha = 0.35;
      ctx.fillRect(px(13.0), py(8.5 - m * 1.1), sx(0.7), py(7.9 - m * 1.1) - py(8.5 - m * 1.1));
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    /* --- inlane arrows --------------------------------------- */
    function arrow(x, y, rot, col) {
      ctx.save();
      ctx.translate(px(x), py(y));
      ctx.rotate(rot);
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(0, -sx(1.1));
      ctx.lineTo(sx(0.8), 0);
      ctx.lineTo(0, sx(1.1));
      ctx.lineTo(-sx(0.8), 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    arrow(-7.6, 7.2, 0.35, css(PAL.gold));
    arrow(7.6, 7.2, -0.35, css(PAL.gold));
    arrow(-2.6, 11.5, 0.1, css(PAL.green));
    arrow(2.6, 11.5, -0.1, css(PAL.green));

    /* --- drain text ------------------------------------------ */
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = css(PAL.red);
    ctx.font = '900 56px Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NO DROP ZONE', px(0), py(-1.2));
    ctx.restore();

    /* --- border + rivets ------------------------------------- */
    ctx.strokeStyle = 'rgba(246,196,69,0.55)';
    ctx.lineWidth = 10;
    ctx.strokeRect(6, 6, W - 12, H - 12);
    ctx.fillStyle = 'rgba(242,234,210,0.25)';
    for (var rx = 0; rx < 14; rx++) {
      for (var ry = 0; ry < 22; ry++) {
        ctx.beginPath();
        ctx.arc(28 + rx * (W - 56) / 13, 28 + ry * (H - 56) / 21, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    var tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 8;
    if ('encoding' in tex) tex.encoding = THREE.sRGBEncoding;

    /* The sprite atlas (assets.js) replaces this canvas once it decodes;
       this painted canvas stays as the zero-asset fallback. */
    return tex;
  }

  /* ---- soft radial glow used for lamps & particles ---------- */
  function makeGlow() {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.65)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.18)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    var gt = new THREE.CanvasTexture(c);
    if ('encoding' in gt) gt.encoding = THREE.sRGBEncoding;
    return gt;
  }

  /* ---- painted backglass for the 3D backbox ---------------- */
  function makeBackglass() {
    var W = 1120, H = 440;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var ctx = c.getContext('2d');

    /* night sky */
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a1f18');
    g.addColorStop(0.55, '#0d3a2a');
    g.addColorStop(1, '#04150e');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    /* rising dub sun */
    var sx = W / 2, sy = H * 0.56, sr = H * 0.5;
    var sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
    sg.addColorStop(0, 'rgba(255,222,120,0.95)');
    sg.addColorStop(0.4, 'rgba(246,196,69,0.75)');
    sg.addColorStop(0.7, 'rgba(214,120,30,0.4)');
    sg.addColorStop(1, 'rgba(120,40,10,0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
    /* dub-cut scan lines across the sun */
    ctx.fillStyle = 'rgba(10,31,24,0.5)';
    for (var y2 = sy - sr * 0.25; y2 < sy + sr * 0.55; y2 += 13) {
      ctx.fillRect(sx - sr * 0.95, y2, sr * 1.9, 4 + (y2 - sy + sr * 0.25) * 0.05);
    }

    /* palm silhouettes */
    function bpalm(bx, by, s) {
      ctx.save(); ctx.translate(bx, by); ctx.scale(s, s);
      ctx.strokeStyle = '#04150e'; ctx.lineCap = 'round';
      ctx.lineWidth = 13;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-26, -120, -10, -230);
      ctx.stroke();
      ctx.lineWidth = 21;
      for (var a2 = -4; a2 <= 4; a2++) {
        if (a2 === 0) continue;
        var ang = a2 * 0.33 - Math.PI / 2;
        ctx.beginPath(); ctx.moveTo(-10, -230);
        ctx.quadraticCurveTo(-10 + Math.cos(ang) * 90, -230 + Math.sin(ang) * 70 - 30,
          -10 + Math.cos(ang) * 160, -230 + Math.sin(ang) * 50 + 16);
        ctx.stroke();
      }
      ctx.restore();
    }
    bpalm(W * 0.16, H * 0.86, 1.0);
    bpalm(W * 0.84, H * 0.9, 0.85);

    /* rasta bars top + bottom */
    var rasta = [PAL.red, PAL.gold, PAL.green];
    for (var b3 = 0; b3 < 3; b3++) {
      ctx.fillStyle = css(rasta[b3]);
      ctx.fillRect(0, b3 * 9, W, 9);
      ctx.fillRect(0, H - (b3 + 1) * 9, W, 9);
    }

    /* wordmark */
    ctx.textAlign = 'center';
    ctx.font = 'italic 900 118px Impact, "Arial Black", sans-serif';
    ctx.fillStyle = '#08160f';
    ctx.fillText('ONE DROP', sx + 5, sy - sr * 0.52 + 5);
    ctx.fillStyle = css(PAL.gold);
    ctx.shadowColor = 'rgba(246,196,69,0.9)'; ctx.shadowBlur = 26;
    ctx.fillText('ONE DROP', sx, sy - sr * 0.52);
    ctx.shadowBlur = 0;
    ctx.font = '700 30px "Consolas", monospace';
    ctx.fillStyle = 'rgba(182,255,207,0.9)';
    ctx.fillText('R O O T S   \u2022   R E G G A E   \u2022   P I N B A L L', sx, sy + sr * 0.34);

    /* painted bulb sockets along the border (the 3D bulbs sit on these) */
    ctx.fillStyle = 'rgba(255,230,150,0.35)';
    for (var bx2 = 30; bx2 < W - 20; bx2 += W / 14) {
      ctx.beginPath(); ctx.arc(bx2, 30, 7, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(bx2, H - 30, 7, 0, Math.PI * 2); ctx.fill();
    }

    var tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    if ('encoding' in tex) tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  /* ---- painted metal apron under the flippers -------------- */
  function makeApron() {
    var W = 870, H = 150;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var ctx = c.getContext('2d');

    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#124232');
    g.addColorStop(0.5, '#0b3d2e');
    g.addColorStop(1, '#062318');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    /* brushed-metal sheen */
    for (var i = 0; i < 26; i++) {
      ctx.fillStyle = 'rgba(255,255,255,' + (0.02 + Math.random() * 0.035) + ')';
      ctx.fillRect(0, Math.random() * H, W, 2 + Math.random() * 5);
    }

    /* gold border */
    ctx.strokeStyle = css(PAL.gold);
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, W - 16, H - 16);

    /* rasta pinstripes down the sides */
    var rasta = [PAL.red, PAL.gold, PAL.green];
    for (var r = 0; r < 3; r++) {
      ctx.fillStyle = css(rasta[r]);
      ctx.fillRect(18, 20 + r * 14, 14, 10);
      ctx.fillRect(W - 32, 20 + r * 14, 14, 10);
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(242,234,210,0.92)';
    ctx.font = 'italic 900 64px Impact, "Arial Black", sans-serif';
    ctx.fillText('NO  DROP  ZONE', W / 2, 66);
    ctx.fillStyle = 'rgba(246,196,69,0.85)';
    ctx.font = '700 26px "Consolas", monospace';
    ctx.fillText('3 BALLS  \u2022  PLAY FOR BONUS  \u2022  KEEP SKANKING', W / 2, 112);

    /* ball-count dots */
    for (var b = 0; b < 3; b++) {
      ctx.beginPath();
      ctx.arc(W / 2 - 30 + b * 30, 134, 7, 0, Math.PI * 2);
      ctx.fillStyle = css(PAL.gold);
      ctx.fill();
    }

    var tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    if ('encoding' in tex) tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  /* ---- reflective environment so the ball looks like chrome -- */
  function makeEnv() {
    var c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    var ctx = c.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#050807');
    g.addColorStop(0.42, '#123');
    g.addColorStop(0.5, '#f6c445');
    g.addColorStop(0.56, '#d7263d');
    g.addColorStop(0.62, '#1d9a4e');
    g.addColorStop(0.72, '#0b3d2e');
    g.addColorStop(1, '#040605');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 256);
    for (var i = 0; i < 60; i++) {
      ctx.fillStyle = 'rgba(255,240,200,' + (0.05 + Math.random() * 0.25) + ')';
      ctx.fillRect(Math.random() * 512, Math.random() * 110, 3 + Math.random() * 9, 3);
    }
    var tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    if ('encoding' in tex) tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  global.PB.art = { makePlayfield: makePlayfield, makeGlow: makeGlow, makeEnv: makeEnv, makeBackglass: makeBackglass, makeApron: makeApron, css: css };
})(window);
