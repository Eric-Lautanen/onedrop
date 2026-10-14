/* dev/_region.js -- straight-down orthographic capture of an arbitrary
 * art-percent window, with the EXACT art window it covers printed so a
 * grid can be drawn on it afterwards with no guesswork.
 *
 *   node dev/_region.js x0 y0 x1 y1 [pxPerArtX]
 *
 * Writes dev/shots/_reg_all.png (everything) and _reg_bare.png (art
 * only), and prints  WINDOW x0 y0 x1 y1 .
 */
const pw = require('playwright-core');
const path = require('path');

const URL = 'http://127.0.0.1:8099/index.html';
const ARGS = [
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist', '--disable-lcd-text'
];

const X0 = Number(process.argv[2] || 30);
const Y0 = Number(process.argv[3] || 18);
const X1 = Number(process.argv[4] || 70);
const Y1 = Number(process.argv[5] || 46);
const PPX = Number(process.argv[6] || 22);        // pixels per art% in x

const VW = Math.round((X1 - X0) * PPX);
/* match the region's true world aspect so nothing is stretched */
const ASPECT = ((X1 - X0) / 100 * 25.94) / ((Y1 - Y0) / 100 * 48.94);
const VH = Math.round(VW / ASPECT);

(async () => {
  const browser = await pw.chromium.launch({ channel: 'msedge', args: ARGS });
  const page = await browser.newPage({ viewport: { width: VW, height: VH } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + (e && e.message)));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(6500);

  const win = await page.evaluate(({ X0, Y0, X1, Y1, VW, VH }) => {
    const g = window.PB.game, T = window.THREE, tbl = g.table;
    const cam = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 900);
    const orig = g.renderer.render.bind(g.renderer);
    g.renderer.render = sc => orig(sc, cam);
    g.sheen.visible = false;
    g.world.balls.forEach(b => {
      if (b.mesh) b.mesh.visible = false;
      if (b.shadow) b.shadow.visible = false;
    });
    ['menu', 'hud', 'fps', 'touch', 'vignette', 'scanlines', 'flash', 'floats']
      .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });

    /* centre of the requested window, in the GAME group's local space */
    const cx = tbl.artX((X0 + X1) / 2), cy = tbl.artY((Y0 + Y1) / 2);
    const c = new T.Vector3(cx - tbl.centerX, cy - tbl.centerY, 0);
    g.group.localToWorld(c);

    const qw = new T.Quaternion(); g.group.getWorldQuaternion(qw);
    const up = new T.Vector3(0, 0, 1).applyQuaternion(qw).normalize();
    const north = new T.Vector3(0, 1, 0).applyQuaternion(qw).normalize();

    const wWorld = Math.abs(tbl.artX(X1) - tbl.artX(X0));
    const hWorld = Math.abs(tbl.artY(Y1) - tbl.artY(Y0));
    const aspect = VW / VH;
    /* fit exactly: the window aspect already matches, so use it whole */
    const halfW = Math.max(wWorld, hWorld * aspect) / 2;
    const halfH = halfW / aspect;
    cam.left = -halfW; cam.right = halfW; cam.top = halfH; cam.bottom = -halfH;
    cam.position.copy(c).addScaledVector(up, 260);
    cam.up.copy(north); cam.lookAt(c); cam.updateProjectionMatrix();

    /* report the art window actually covered, in case of rounding */
    return {
      x0: tbl.artX ? 0 : 0,
      wWorld, hWorld,
      coveredW: halfW * 2, coveredH: halfH * 2
    };
  }, { X0, Y0, X1, Y1, VW, VH });

  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(__dirname, 'shots', '_reg_all.png') });
  await page.evaluate(() => { window.PB.game.playfield.group.visible = false; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(__dirname, 'shots', '_reg_bare.png') });

  console.log('WINDOW', X0, Y0, X1, Y1, ' size', VW, VH);
  console.log('  world w/h', win.wWorld.toFixed(3), win.hWorld.toFixed(3),
    ' covered', win.coveredW.toFixed(3), win.coveredH.toFixed(3));
  if (errs.length) { console.log('ERRORS'); console.log(errs.join('\n')); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
