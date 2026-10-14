/* dev/_map.js -- render the bare playfield SURFACE, straight down and
 * orthographic, filling the frame exactly.
 *
 *   node dev/_map.js
 *
 * If the surface maps the atlas linearly, this image and the atlas are
 * the same picture, and dev/_mapfit.py can cross-correlate them to find
 * any offset or scale error in the art -> table mapping.  Hardware is
 * hidden so nothing sits on top of the art.
 */
const pw = require('playwright-core');
const path = require('path');

const URL = 'http://127.0.0.1:8099/index.html';
const ARGS = [
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist', '--disable-lcd-text'
];
const VW = 636, VH = 1200;          /* matches the 0.530 table aspect */

(async () => {
  const browser = await pw.chromium.launch({ channel: 'msedge', args: ARGS });
  const page = await browser.newPage({ viewport: { width: VW, height: VH } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + (e && e.message)));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(6000);

  const info = await page.evaluate(({ VW, VH }) => {
    const g = window.PB.game, T = window.THREE;
    const tbl = g.table;

    g.playfield.group.visible = false;
    g.sheen.visible = false;
    g.world.balls.forEach(b => {
      if (b.mesh) b.mesh.visible = false;
      if (b.shadow) b.shadow.visible = false;
    });
    ['menu', 'hud', 'fps', 'touch', 'vignette', 'scanlines', 'flash', 'floats']
      .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });

    /* ortho camera framing the playfield EXACTLY: width = tbl.W, height = tbl.H */
    const cam = new T.OrthographicCamera(-tbl.W / 2, tbl.W / 2, tbl.H / 2, -tbl.H / 2, 0.1, 600);
    const orig = g.renderer.render.bind(g.renderer);
    g.renderer.render = sc => orig(sc, cam);

    const centre = new T.Vector3(tbl.centerX - tbl.centerX, tbl.centerY - tbl.centerY, 0);
    /* surface sits at (CX, CY) in table space */
    const p = new T.Vector3(0, 0, 0);
    g.group.localToWorld(p);
    const up = new T.Vector3(0, 0, 1).applyQuaternion(g.group.quaternion).normalize();
    const north = new T.Vector3(0, 1, 0).applyQuaternion(g.group.quaternion).normalize();
    cam.position.copy(p).addScaledVector(up, 300);
    cam.up.copy(north);
    cam.lookAt(p);
    cam.updateProjectionMatrix();

    /* the renderer sizes to the window, so the viewport aspect must match
       W/H or the image is stretched */
    return { W: tbl.W, H: tbl.H, aspect: tbl.W / tbl.H, want: VW / VH };
  }, { VW, VH });

  console.log('table W/H', info.W.toFixed(3), info.H.toFixed(3),
    'aspect', info.aspect.toFixed(4), 'viewport aspect', info.want.toFixed(4));

  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(__dirname, 'shots', '_map.png') });
  console.log('wrote dev/shots/_map.png');
  if (errs.length) { console.log('ERRORS'); console.log(errs.join('\n')); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
