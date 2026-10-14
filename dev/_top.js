/* dev/_top.js -- straight-down ORTHOGRAPHIC crops of the playfield.
 *
 *   node dev/_top.js
 *
 * WHY ORTHOGRAPHIC.  From directly overhead, a barrel standing up out
 * of the wood projects as a CIRCLE, and one lying on the wood projects
 * as a RECTANGLE.  A perspective camera smears that, so we use an
 * orthographic one and the shape becomes the verdict.
 *
 * Regions are given in art-percent (0..100, y 0 = arch, y 100 = drain)
 * so they can be read straight off the sprite.
 */
const pw = require('playwright-core');
const path = require('path');
const fs = require('fs');

const URL = 'http://127.0.0.1:8099/index.html';
const OUT = path.join(__dirname, 'shots');
const ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--disable-lcd-text'
];

const VW = 900, VH = 900;

/* art-percent windows worth looking at */
const REGIONS = [
  { name: '_top_bumpers.png', x0: 33, x1: 63, y0: 21, y1: 45 },
  { name: '_top_shack.png', x0: 39, x1: 61, y0: 7, y1: 27 },
  { name: '_top_lower.png', x0: 18, x1: 82, y0: 72, y1: 100 },
  { name: '_top_upper.png', x0: 4, x1: 96, y0: 0, y1: 30 },
  { name: '_top_full.png', x0: 0, x1: 100, y0: 0, y1: 100 }
];

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const browser = await pw.chromium.launch({ channel: 'msedge', args: ARGS });
  const page = await browser.newPage({ viewport: { width: VW, height: VH } });

  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + (e && e.message)));

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(6000);

  /* install the orthographic override once */
  await page.evaluate(() => {
    const g = window.PB.game, T = window.THREE;
    const orig = g.renderer.render.bind(g.renderer);
    g.__origRender = orig;
    g.__ortho = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 600);
    g.renderer.render = (sc) => orig(sc, g.__ortho);
    /* keep the balls out of the way */
    g.world.balls.forEach(b => {
      if (b.mesh) b.mesh.visible = false;
      if (b.shadow) b.shadow.visible = false;
    });
    /* strip the DOM chrome so nothing sits over the playfield */
    ['menu', 'hud', 'fps', 'touch', 'vignette', 'scanlines', 'flash', 'floats']
      .forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
  });

  for (const r of REGIONS) {
    await page.evaluate(({ r, VW, VH }) => {
      const g = window.PB.game, T = window.THREE;
      const tbl = g.table;
      const cam = g.__ortho;

      /* the window's four corners in table space, then in world space */
      const cx = tbl.artX((r.x0 + r.x1) / 2);
      const cy = tbl.artY((r.y0 + r.y1) / 2);
      const wWorld = Math.abs(tbl.artX(r.x1) - tbl.artX(r.x0));
      const hWorld = Math.abs(tbl.artY(r.y1) - tbl.artY(r.y0));

      const centre = new T.Vector3(cx - tbl.centerX, cy - tbl.centerY, 0);
      g.group.localToWorld(centre);

      const up = new T.Vector3(0, 0, 1).applyQuaternion(g.group.quaternion).normalize();
      const north = new T.Vector3(0, 1, 0).applyQuaternion(g.group.quaternion).normalize();

      const aspect = VW / VH;
      /* fit the whole window, never crop it */
      const halfW = Math.max(wWorld, hWorld * aspect) / 2;
      const halfH = halfW / aspect;

      cam.left = -halfW; cam.right = halfW;
      cam.top = halfH; cam.bottom = -halfH;
      cam.near = 0.1; cam.far = 600;
      cam.position.copy(centre).addScaledVector(up, 200);
      cam.up.copy(north);
      cam.lookAt(centre);
      cam.updateProjectionMatrix();
    }, { r, VW, VH });

    await page.waitForTimeout(260);
    await page.screenshot({ path: path.join(OUT, r.name) });
    console.log('wrote', r.name);
  }

  if (errs.length) { console.log('--- ERRORS ---'); console.log(errs.join('\n')); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
