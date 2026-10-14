/* dev/_low.js -- top-down of the lower field, straight down and
 * orthographic, in three passes: everything / slings only / bare art.
 *
 *   node dev/_low.js
 */
const pw = require('playwright-core');
const path = require('path');

const URL = 'http://127.0.0.1:8099/index.html';
const ARGS = [
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist', '--disable-lcd-text'
];
const VW = 1000, VH = 900;
const R = { x0: 0, x1: 100, y0: 62, y1: 100 };

(async () => {
  const browser = await pw.chromium.launch({ channel: 'msedge', args: ARGS });
  const page = await browser.newPage({ viewport: { width: VW, height: VH } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + (e && e.message)));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(6500);

  await page.evaluate(({ r, VW, VH }) => {
    const g = window.PB.game, T = window.THREE;
    const tbl = g.table;
    const cam = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 600);
    const orig = g.renderer.render.bind(g.renderer);
    g.renderer.render = sc => orig(sc, cam);
    g.__cam = cam;
    g.sheen.visible = false;
    g.world.balls.forEach(b => {
      if (b.mesh) b.mesh.visible = false;
      if (b.shadow) b.shadow.visible = false;
    });
    ['menu', 'hud', 'fps', 'touch', 'vignette', 'scanlines', 'flash', 'floats']
      .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });

    const cx = tbl.artX((r.x0 + r.x1) / 2), cy = tbl.artY((r.y0 + r.y1) / 2);
    const w = Math.abs(tbl.artX(r.x1) - tbl.artX(r.x0));
    const h = Math.abs(tbl.artY(r.y1) - tbl.artY(r.y0));
    const c = new T.Vector3(cx - tbl.centerX, cy - tbl.centerY, 0);
    g.group.localToWorld(c);
    const up = new T.Vector3(0, 0, 1).applyQuaternion(g.group.quaternion).normalize();
    const north = new T.Vector3(0, 1, 0).applyQuaternion(g.group.quaternion).normalize();
    const aspect = VW / VH;
    const halfW = Math.max(w, h * aspect) / 2, halfH = halfW / aspect;
    cam.left = -halfW; cam.right = halfW; cam.top = halfH; cam.bottom = -halfH;
    cam.position.copy(c).addScaledVector(up, 220);
    cam.up.copy(north); cam.lookAt(c); cam.updateProjectionMatrix();

    /* the sling bodies are the only ExtrudeGeometry meshes on the field */
    g.__slingParts = [];
    g.playfield.group.traverse(o => {
      if (o.isMesh && o.geometry && o.geometry.type === 'ExtrudeGeometry') {
        g.__slingParts.push(o);
      }
    });
  }, { r: R, VW, VH });

  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(__dirname, 'shots', '_low_all.png') });
  console.log('wrote _low_all.png');

  const n = await page.evaluate(() => {
    const g = window.PB.game;
    const keep = g.__slingParts;
    g.playfield.group.traverse(o => {
      if (o.isMesh && keep.indexOf(o) < 0) o.visible = false;
      if (o.isSprite) o.visible = false;
    });
    return keep.length;
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(__dirname, 'shots', '_low_slings.png') });
  console.log('wrote _low_slings.png  (', n, 'sling groups )');

  await page.evaluate(() => { window.PB.game.playfield.group.visible = false; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(__dirname, 'shots', '_low_bare.png') });
  console.log('wrote _low_bare.png');

  if (errs.length) { console.log('ERRORS'); console.log(errs.join('\n')); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
