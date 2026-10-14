/* dev/_closeup.js -- perspective close-ups of individual playfield parts,
 * at a player-ish angle, to check the 3D reads correctly.
 *
 *   node dev/_closeup.js
 */
const pw = require('playwright-core');
const path = require('path');

const URL = 'http://127.0.0.1:8099/index.html';
const ARGS = [
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist', '--disable-lcd-text'
];
const VW = 1000, VH = 760;

/* target in art-percent, then how far back / how high / which way to look */
const SHOTS = [
  { name: '_cu_bumpers.png', ax: 49.4, ay: 31.0, back: 11, up: 7.5, fov: 40 },
  { name: '_cu_shack.png', ax: 49.5, ay: 17.5, back: 12, up: 7.0, fov: 40 },
  { name: '_cu_lower.png', ax: 49.5, ay: 82.0, back: 14, up: 8.0, fov: 42 }
];

(async () => {
  const browser = await pw.chromium.launch({ channel: 'msedge', args: ARGS });
  const page = await browser.newPage({ viewport: { width: VW, height: VH } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + (e && e.message)));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(6000);

  await page.evaluate(() => {
    const g = window.PB.game, T = window.THREE;
    const orig = g.renderer.render.bind(g.renderer);
    g.__cu = new T.PerspectiveCamera(40, 1, 0.5, 800);
    g.renderer.render = sc => orig(sc, g.__cu);
    g.world.balls.forEach(b => {
      if (b.mesh) b.mesh.visible = false;
      if (b.shadow) b.shadow.visible = false;
    });
    ['menu', 'hud', 'fps', 'touch', 'vignette', 'scanlines', 'flash', 'floats']
      .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  });

  for (const s of SHOTS) {
    await page.evaluate(({ s, VW, VH }) => {
      const g = window.PB.game, T = window.THREE;
      const tbl = g.table;
      const cam = g.__cu;
      const p = new T.Vector3(tbl.artX(s.ax) - tbl.centerX, tbl.artY(s.ay) - tbl.centerY, 0);
      g.group.localToWorld(p);
      const up = new T.Vector3(0, 0, 1).applyQuaternion(g.group.quaternion).normalize();
      /* "back" = toward the player end (drain), i.e. -Y in table space */
      const back = new T.Vector3(0, -1, 0).applyQuaternion(g.group.quaternion).normalize();
      cam.fov = s.fov; cam.aspect = VW / VH;
      cam.position.copy(p).addScaledVector(up, s.up).addScaledVector(back, s.back);
      cam.up.copy(up);
      cam.lookAt(p);
      cam.updateProjectionMatrix();
    }, { s, VW, VH });
    await page.waitForTimeout(280);
    await page.screenshot({ path: path.join(__dirname, 'shots', s.name) });
    console.log('wrote', s.name);
  }

  if (errs.length) { console.log('ERRORS'); console.log(errs.join('\n')); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
