/* dev/_bumponly.js -- top-down with ONLY the pop bumpers left visible,
 * so their footprint can be read directly against the painting.
 *
 *   node dev/_bumponly.js
 */
const pw = require('playwright-core');
const path = require('path');

const URL = 'http://127.0.0.1:8099/index.html';
const ARGS = [
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist', '--disable-lcd-text'
];
const VW = 900, VH = 900;
const REGION = { x0: 30, x1: 66, y0: 20, y1: 44 };

(async () => {
  const browser = await pw.chromium.launch({ channel: 'msedge', args: ARGS });
  const page = await browser.newPage({ viewport: { width: VW, height: VH } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + (e && e.message)));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(6000);

  const info = await page.evaluate(({ r, VW, VH }) => {
    const g = window.PB.game, T = window.THREE;
    const tbl = g.table;
    const PF = g.playfield;

    /* which children are the bumper groups?  match by layout position */
    const wanted = tbl.circles.filter(c => c.type === 'bumper');
    const CX = tbl.centerX, CY = tbl.centerY;
    const inv = new T.Matrix4().copy(PF.group.matrixWorld).invert();
    const m = new T.Matrix4(), p = new T.Vector3();
    const keep = [];
    PF.group.children.forEach(ch => {
      if (!ch.isGroup) return;
      m.multiplyMatrices(inv, ch.matrixWorld);
      p.setFromMatrixPosition(m);
      if (wanted.some(c => Math.abs(p.x - (c.x - CX)) < 1e-6 &&
                           Math.abs(p.y - (c.y - CY)) < 1e-6)) keep.push(ch);
    });

    PF.group.children.forEach(ch => { ch.visible = keep.indexOf(ch) >= 0; });
    /* drop the additive glows inside each bumper -- they wash the art out */
    keep.forEach(ch => ch.traverse(o => { if (o.isSprite) o.visible = false; }));
    /* hide the sheen so the painting is unmodified */
    g.sheen.visible = false;
    g.world.balls.forEach(b => {
      if (b.mesh) b.mesh.visible = false;
      if (b.shadow) b.shadow.visible = false;
    });
    ['menu', 'hud', 'fps', 'touch', 'vignette', 'scanlines', 'flash', 'floats']
      .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });

    /* ortho top-down on the window */
    const cam = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 600);
    const orig = g.renderer.render.bind(g.renderer);
    g.renderer.render = sc => orig(sc, cam);

    const cx = tbl.artX((r.x0 + r.x1) / 2), cy = tbl.artY((r.y0 + r.y1) / 2);
    const wWorld = Math.abs(tbl.artX(r.x1) - tbl.artX(r.x0));
    const hWorld = Math.abs(tbl.artY(r.y1) - tbl.artY(r.y0));
    const centre = new T.Vector3(cx - CX, cy - CY, 0);
    g.group.localToWorld(centre);
    const up = new T.Vector3(0, 0, 1).applyQuaternion(g.group.quaternion).normalize();
    const north = new T.Vector3(0, 1, 0).applyQuaternion(g.group.quaternion).normalize();
    const aspect = VW / VH;
    const halfW = Math.max(wWorld, hWorld * aspect) / 2;
    const halfH = halfW / aspect;
    cam.left = -halfW; cam.right = halfW; cam.top = halfH; cam.bottom = -halfH;
    cam.position.copy(centre).addScaledVector(up, 200);
    cam.up.copy(north); cam.lookAt(centre); cam.updateProjectionMatrix();

    return { kept: keep.length, wanted: wanted.length };
  }, { r: REGION, VW, VH });

  console.log('kept', info.kept, 'of', info.wanted, 'bumper groups');
  await page.waitForTimeout(320);
  await page.screenshot({ path: path.join(__dirname, 'shots', '_bumponly.png') });
  console.log('wrote dev/shots/_bumponly.png');
  if (errs.length) { console.log('ERRORS'); console.log(errs.join('\n')); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
