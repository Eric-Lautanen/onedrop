/* dev/shoot.js -- headless capture + vibrancy probe.
 *
 *   node dev/shoot.js
 *
 * Loads the game in Edge, waits for the cabinet to build, captures a
 * hero shot and a true top-down playfield shot, then reports any
 * console/page errors. The camera is forced by shadowing
 * renderer.render, because the game loop re-places its own camera
 * every frame.
 */
const path = require('path');
const fs = require('fs');
const pw = require('playwright-core');

const OUT = path.join(__dirname, 'shots');
const URL = 'http://127.0.0.1:8099/index.html';

const ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--disable-lcd-text'
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await pw.chromium.launch({ channel: 'msedge', args: ARGS });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

  const logs = [];
  page.on('console', m => {
    const t = m.type();
    if (t === 'error' || t === 'warning') logs.push(t.toUpperCase() + ': ' + m.text());
  });
  page.on('pageerror', e => logs.push('PAGEERROR: ' + (e && e.message)));
  page.on('requestfailed', r => logs.push('REQFAIL: ' + r.url() + ' ' + (r.failure() || {}).errorText));

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(
    () => window.PB && window.PB.game && window.PB.game.machine && window.PB.assets.ready,
    null, { timeout: 45000 }
  );
  await page.waitForTimeout(2600);          /* let the attract loop settle */

  /* ---- what did the vibrance pass actually do? ---- */
  const report = await page.evaluate(() => {
    const g = window.PB.game;
    let meshes = 0, faithful = 0, graded = 0, painted = 0;
    const kinds = {};
    const gradedList = [];
    g.scene.traverse(o => {
      if (!o.isMesh) return;
      meshes++;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      list.forEach(m => {
        if (!m) return;
        if (m.userData && m.userData.vibrance) { faithful++; return; }
        if (m.map && !m.isMeshBasicMaterial) {
          painted++;
          const k = (m.type || '?') + ' metal=' + (m.metalness === undefined ? '-' : m.metalness);
          kinds[k] = (kinds[k] || 0) + 1;
        }
        if (m.map && m.toneMapped !== false) {
          graded++;
          /* anything still graded is a candidate washout -- name it */
          gradedList.push((o.name || o.type) + ' | ' + (m.name || m.type) +
                          ' metal=' + (m.metalness === undefined ? '-' : m.metalness));
        }
      });
    });
    return {
      meshes: meshes,
      faithful: faithful,
      stillLitWithMap: painted,
      stillToneMapped: graded,
      gradedList: gradedList,
      kinds: kinds,
      pfToneMapped: g.surface.material.toneMapped,
      pfType: g.surface.material.type,
      table: { W: +g.table.W.toFixed(3), H: +g.table.H.toFixed(3), K: +g.table.K.toFixed(4) },
      center: { x: g.table.centerX, y: +g.table.centerY.toFixed(3) },
      ballR: +(g.table.K * 0.62).toFixed(3),
      cabinetFit: g.cabinetFit,
      vibranceCount: window.PB.vibrance.count
    };
  });

  /* ---- hero shot (game's own camera) ---- */
  await page.screenshot({ path: path.join(OUT, 'v4_hero.png') });

  /* ---- true top-down on the playfield ---- */
  const shot = async (name, dist, fov) => {
    await page.evaluate(({ dist, fov }) => {
      const g = window.PB.game, T = window.THREE;
      if (!g.__forced) {
        const orig = g.renderer.render.bind(g.renderer);
        g.__origRender = orig;
        g.__forced = new T.PerspectiveCamera(fov, innerWidth / innerHeight, 0.5, 800);
        g.renderer.render = (sc) => orig(sc, g.__forced);
      }
      const cam = g.__forced;
      cam.fov = fov; cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
      const c = new T.Vector3();
      g.surface.getWorldPosition(c);
      const up = new T.Vector3(0, 0, 1).applyQuaternion(g.group.quaternion).normalize();
      const north = new T.Vector3(0, 1, 0).applyQuaternion(g.group.quaternion).normalize();
      cam.position.copy(c).addScaledVector(up, dist);
      cam.up.copy(north);
      cam.lookAt(c);
    }, { dist, fov });
    await page.waitForTimeout(320);
    await page.screenshot({ path: path.join(OUT, name) });
  };

  const pfH = report.table.H;
  await shot('v4_pf_top.png', (pfH * 1.06 / 2) / Math.tan((40 * Math.PI / 180) / 2), 40);

  /* ---- the same view with the hardware hidden, so the art can be
          measured against the sprite without the ramps and lamps in
          the way. `bare` = art + lacquer, `pure` = art only. ---- */
  await page.evaluate(() => {
    const g = window.PB.game;
    g.playfield.group.visible = false;
    g.world.balls.forEach(b => { if (b.mesh) b.mesh.visible = false; if (b.shadow) b.shadow.visible = false; });
  });
  await page.waitForTimeout(320);
  await page.screenshot({ path: path.join(OUT, 'v4_pf_bare.png') });

  await page.evaluate(() => { window.PB.game.sheen.visible = false; });
  await page.waitForTimeout(320);
  await page.screenshot({ path: path.join(OUT, 'v4_pf_pure.png') });

  await page.evaluate(() => {
    const g = window.PB.game;
    g.playfield.group.visible = true;
    g.sheen.visible = true;
    g.world.balls.forEach(b => { if (b.mesh) b.mesh.visible = true; if (b.shadow) b.shadow.visible = true; });
  });

  /* ---- cabinet + backbox, framed off the head's own face normal ---- */
  await page.evaluate(() => {
    const g = window.PB.game, T = window.THREE;
    const cam = g.__forced;
    cam.fov = 30; cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
    const q = new T.Quaternion();
    g.machine.head.getWorldQuaternion(q);
    const fwd = new T.Vector3(0, 0, 1).applyQuaternion(q);     /* head-local +Z = the face */
    const up = new T.Vector3(0, 1, 0).applyQuaternion(q);
    const h = new T.Vector3();
    g.machine.head.getWorldPosition(h);
    const face = h.clone().addScaledVector(up, 15.5).addScaledVector(fwd, 0.5);
    cam.position.copy(face).addScaledVector(fwd, 27).addScaledVector(up, 3.5);
    cam.up.copy(up);
    cam.lookAt(face);
  });
  await page.waitForTimeout(320);
  await page.screenshot({ path: path.join(OUT, 'v4_backbox.png') });

  /* ---- the score band on its own, front-on, to check the live DMD
          still fills the window in the dot plate. machine.js was
          written against a 496x80 canvas; index.html now says
          512x128, and winH is read live from the canvas. ---- */
  const scoreBox = await page.evaluate(() => {
    const g = window.PB.game, T = window.THREE;
    const cam = g.__forced;
    cam.fov = 26; cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
    const q = new T.Quaternion();
    g.machine.head.getWorldQuaternion(q);
    const fwd = new T.Vector3(0, 0, 1).applyQuaternion(q);
    const up = new T.Vector3(0, 1, 0).applyQuaternion(q);
    /* the dot plate sits at head-local (0, 5, 0.46) */
    const face = g.machine.head.localToWorld(new T.Vector3(0, 5, 0.46));
    cam.position.copy(face).addScaledVector(fwd, 24);
    cam.up.copy(up);
    cam.lookAt(face);
    const d = document.getElementById('dmd');
    const plane = g.machine && g.machine.dmdPlane;
    const p = plane ? plane.geometry.parameters : null;
    return {
      canvas: d.width + 'x' + d.height,
      canvasAspect: +(d.width / d.height).toFixed(4),
      plateAspect: +window.PB.assets.size('dmdPanel').aspect.toFixed(4),
      /* measured off the live plane rather than asserted from source:
         the backbox belongs to machine.js and its window fractions
         change with that module. */
      planeW: p ? +p.width.toFixed(3) : null,
      planeH: p ? +p.height.toFixed(3) : null,
      planeAspect: p ? +(p.width / p.height).toFixed(4) : null
    };
  });
  await page.waitForTimeout(320);
  await page.screenshot({ path: path.join(OUT, 'v4_scoreband.png') });

  /* ---- keyboard must never move the camera ----
     Drag to a custom view, snapshot the camera, hammer every gameplay
     key, snapshot again, and compare. This is the regression test for
     "it snaps to a hero view when I start playing". */
  const camTest = await (async () => {
    const read = () => page.evaluate(() => {
      const c = window.PB.game.camera;
      return {
        pos: [+c.position.x.toFixed(5), +c.position.y.toFixed(5), +c.position.z.toFixed(5)],
        quat: [+c.quaternion.x.toFixed(5), +c.quaternion.y.toFixed(5),
               +c.quaternion.z.toFixed(5), +c.quaternion.w.toFixed(5)]
      };
    });

    /* leave the forced-camera mode so we test the real one */
    await page.evaluate(() => {
      const g = window.PB.game;
      if (g.__forced) { g.renderer.render = g.__origRender; g.__forced = null; }
      if (g.state === 'attract' || g.state === 'gameover') g.startGame();
    });
    await page.waitForTimeout(700);

    /* where the game put us on its own, before we touch anything */
    const heroView = await read();

    /* drag across the canvas to orbit away from the hero view */
    await page.mouse.move(900, 500);
    await page.mouse.down();
    await page.mouse.move(760, 420, { steps: 12 });
    await page.mouse.move(700, 470, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    const before = await read();
    const orbitOn = await page.evaluate(() => window.PB.game.orbiting);
    /* proof the test is not vacuous: the drag really did move us */
    const dragMoved = heroView.pos.some((v, i) => Math.abs(v - before.pos[i]) > 0.02) ||
                      heroView.quat.some((v, i) => Math.abs(v - before.quat[i]) > 0.002);

    /* every gameplay key, pressed and released, plus a full plunge */
    for (const k of ['KeyZ', 'Slash', 'KeyA', 'KeyD', 'Period']) {
      await page.keyboard.down(k); await page.waitForTimeout(90); await page.keyboard.up(k);
    }
    await page.keyboard.down('Space'); await page.waitForTimeout(700);
    await page.keyboard.up('Space');                       /* release = launch */
    await page.waitForTimeout(900);
    for (const k of ['KeyZ', 'Slash', 'KeyM', 'KeyP', 'KeyP']) {
      await page.keyboard.down(k); await page.waitForTimeout(80); await page.keyboard.up(k);
    }
    await page.waitForTimeout(600);

    const after = await read();
    const moved = before.pos.some((v, i) => Math.abs(v - after.pos[i]) > 0.02) ||
                  before.quat.some((v, i) => Math.abs(v - after.quat[i]) > 0.002);
    return { orbitOn, heroView, before, after, dragMoved, cameraMoved: moved };
  })();

  /* ---- resize smoke test, with a top-down at the new size ---- */
  const resize = await page.evaluate(() => {
    const g = window.PB.game;
    const before = { W: g.table.W, H: g.table.H };
    g.fitPlayfield(26, 45);
    return { before, mid: { W: g.table.W, H: g.table.H, K: +g.table.K.toFixed(4), cy: g.table.centerY } };
  });
  await page.waitForTimeout(2000);
  /* re-aim the forced camera at the new frame. camTest tore the forced
     camera down to exercise the real one, so put it back first. */
  await page.evaluate(() => {
    const g = window.PB.game, T = window.THREE;
    if (!g.__forced) {
      const orig = g.renderer.render.bind(g.renderer);
      g.__origRender = orig;
      g.__forced = new T.PerspectiveCamera(40, innerWidth / innerHeight, 0.5, 800);
      g.renderer.render = (sc) => orig(sc, g.__forced);
    }
    const cam = g.__forced;
    cam.fov = 40; cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
    const d = (g.table.H * 1.06 / 2) / Math.tan((cam.fov * Math.PI / 180) / 2);
    const c = new T.Vector3();
    g.surface.getWorldPosition(c);
    const up = new T.Vector3(0, 0, 1).applyQuaternion(g.group.quaternion).normalize();
    const north = new T.Vector3(0, 1, 0).applyQuaternion(g.group.quaternion).normalize();
    cam.position.copy(c).addScaledVector(up, d);
    cam.up.copy(north);
    cam.lookAt(c);
  });
  await page.waitForTimeout(320);
  await page.screenshot({ path: path.join(OUT, 'v4_resized_26x45.png') });

  const restored = await page.evaluate(async () => {
    const g = window.PB.game;
    g.fitPlayfieldToCabinet();
    await new Promise(r => setTimeout(r, 1800));
    return { W: +g.table.W.toFixed(2), H: +g.table.H.toFixed(2), cy: g.table.centerY };
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, 'v4_after_resize.png') });

  /* ---- playfield artwork, sampled straight from the sheet ---- */
  const atlas = await page.evaluate(() => {
    const A = window.PB.assets;
    const r = A.rectPx('playfield');
    const c = document.createElement('canvas');
    c.width = Math.round(r.sw); c.height = Math.round(r.sh);
    const x = c.getContext('2d');
    x.drawImage(A.image, r.sx, r.sy, r.sw, r.sh, 0, 0, c.width, c.height);
    return { url: c.toDataURL('image/png'), w: c.width, h: c.height };
  });
  fs.writeFileSync(path.join(OUT, '_atlas_playfield.png'),
    Buffer.from(atlas.url.split(',')[1], 'base64'));

  console.log(JSON.stringify({ report, camTest, resize, restored, scoreBox, atlas: { w: atlas.w, h: atlas.h } }, null, 2));
  console.log('\n--- console ---');
  console.log(logs.length ? logs.join('\n') : '(clean)');

  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
