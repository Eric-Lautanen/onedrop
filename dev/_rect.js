/* dev/_rect.js -- where exactly does the playfield land on screen?
 *
 *   node dev/_rect.js
 *
 * Sets up the same forced top-down camera the harness uses, then
 * projects the playfield plane's four corners into screen pixels. That
 * gives the exact crop rect for measuring the render against the
 * sprite, instead of deriving it from a fov formula that can drift.
 */
const pw = require('playwright-core');
const URL = 'http://127.0.0.1:8099/index.html';
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const VIEW_W = 1400, VIEW_H = 1000, FOV = 40;

(async () => {
  const browser = await pw.chromium.launch({ channel: 'msedge', args: ARGS });
  const page = await browser.newPage({ viewport: { width: VIEW_W, height: VIEW_H } });
  page.on('pageerror', e => console.log('PAGEERROR', e && e.message));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(
    () => window.PB && window.PB.game && window.PB.game.machine && window.PB.assets.ready,
    null, { timeout: 45000 });
  await page.waitForTimeout(2500);

  const out = await page.evaluate(({ FOV }) => {
    const g = window.PB.game, T = window.THREE;
    const surf = g.surface;
    const p = surf.geometry.parameters;
    const dist = (g.table.H * 1.06 / 2) / Math.tan((FOV * Math.PI / 180) / 2);

    const cam = new T.PerspectiveCamera(FOV, innerWidth / innerHeight, 0.5, 800);
    const c = new T.Vector3();
    surf.getWorldPosition(c);
    const up = new T.Vector3(0, 0, 1).applyQuaternion(g.group.quaternion).normalize();
    const north = new T.Vector3(0, 1, 0).applyQuaternion(g.group.quaternion).normalize();
    cam.position.copy(c).addScaledVector(up, dist);
    cam.up.copy(north);
    cam.lookAt(c);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();

    /* project the plane's own corners (half-extents along its local axes) */
    const halfW = p.width / 2, halfH = p.height / 2;
    /* WORLD quaternion -- the mesh carries no rotation of its own; the
       tilt lives on the parent group, so surf.quaternion is identity */
    const q = new T.Quaternion();
    surf.getWorldQuaternion(q);
    const ax = new T.Vector3(1, 0, 0).applyQuaternion(q).multiplyScalar(halfW);
    const ay = new T.Vector3(0, 1, 0).applyQuaternion(q).multiplyScalar(halfH);
    const px = [];
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => {
      const w = c.clone().addScaledVector(ax, sx).addScaledVector(ay, sy);
      const v = w.clone().project(cam);
      px.push([(v.x * 0.5 + 0.5) * innerWidth, (1 - (v.y * 0.5 + 0.5)) * innerHeight]);
    });
    const xs = px.map(q => q[0]), ys = px.map(q => q[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const y0 = Math.min(...ys), y1 = Math.max(...ys);

    return {
      plane: { w: +p.width.toFixed(3), h: +p.height.toFixed(3),
               aspect: +(p.width / p.height).toFixed(4) },
      table: { W: +g.table.W.toFixed(3), H: +g.table.H.toFixed(3) },
      camDist: +dist.toFixed(3),
      corners: px.map(q => [+q[0].toFixed(1), +q[1].toFixed(1)]),
      rect: { x0: Math.round(x0), y0: Math.round(y0),
              x1: Math.round(x1), y1: Math.round(y1),
              w: Math.round(x1 - x0), h: Math.round(y1 - y0) },
      fovFormulaRect: (() => {
        const d = (g.table.H * 1.06 / 2) / Math.tan((FOV * Math.PI / 180) / 2);
        const coverH = 2 * d * Math.tan((FOV * Math.PI / 180) / 2);
        const coverW = coverH * (innerWidth / innerHeight);
        const w = g.table.W / coverW * innerWidth;
        const h = g.table.H / coverH * innerHeight;
        return { x0: Math.round(innerWidth / 2 - w / 2), y0: Math.round(innerHeight / 2 - h / 2),
                 x1: Math.round(innerWidth / 2 + w / 2), y1: Math.round(innerHeight / 2 + h / 2) };
      })()
    };
  }, { FOV });

  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
