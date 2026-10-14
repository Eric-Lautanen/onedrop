/* dev/_scan.js -- authoritative top-down occupancy map.
 *
 * Raycasts straight down (in playfield local Z-up space) on a fine art%
 * grid and records the TOPMOST mesh under each sample.  Prints an ASCII
 * map plus a legend of every distinct (geometry, colour) pair with its
 * art% bounding box, so there is no guessing about what lives where.
 *
 *   node dev/_scan.js [step]        default step = 1 art%
 *   node dev/_scan.js 1 30 60       step, x0, x1
 */
const pw = require('playwright-core');

const URL = 'http://127.0.0.1:8099/index.html';
const ARGS = [
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist'
];

const STEP = Number(process.argv[2] || 1);
const X0 = Number(process.argv[3] || 0);
const X1 = Number(process.argv[4] || 100);

(async () => {
  const browser = await pw.chromium.launch({ channel: 'msedge', args: ARGS });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + (e && e.message)));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(6500);

  const res = await page.evaluate(({ STEP, X0, X1 }) => {
    const g = window.PB.game, T = window.THREE;
    const tbl = g.table;
    const pf = g.playfield.group;
    const inv = new T.Matrix4().copy(pf.matrixWorld).invert();

    /* The field's own Z-up axes expressed in WORLD space.  pf.quaternion
       is only the group's LOCAL rotation -- the table tilt lives on a
       parent -- so it has to come off matrixWorld or the ray is skewed by
       the tilt and every height reading is garbage. */
    const qw = new T.Quaternion();
    pf.getWorldQuaternion(qw);
    const upW = new T.Vector3(0, 0, 1).applyQuaternion(qw).normalize();

    /* every mesh, with a stable label */
    const items = [];
    const keyOf = m => {
      const c = m.material && m.material.color ? m.material.color.getHexString() : '----';
      const t = (m.geometry && m.geometry.type || '?').replace('Geometry', '');
      return t + '#' + c;
    };
    pf.traverse(o => { if (o.isMesh) items.push(o); });

    const rc = new T.Raycaster();
    rc.far = 400;
    const origin = new T.Vector3();
    const dir = upW.clone().negate();

    const hits = [];               // {x,y,key,label,z}
    for (let ax = X0; ax <= X1; ax += STEP) {
      for (let ay = 0; ay <= 100; ay += STEP) {
        const p = new T.Vector3(tbl.artX(ax), tbl.artY(ay), 0);
        p.applyMatrix4(pf.matrixWorld);
        origin.copy(p).addScaledVector(upW, 120);
        rc.set(origin, dir);
        const list = rc.intersectObjects(items, false);
        /* the topmost solid hit -- skip sprites / transparent halos */
        let pick = null;
        for (const h of list) {
          const m = h.object;
          if (!m.visible) continue;
          if (m.material && m.material.transparent && m.material.opacity < 0.5) continue;
          pick = h; break;
        }
        if (!pick) continue;
        hits.push({
          x: +ax.toFixed(2), y: +ay.toFixed(2),
          key: keyOf(pick.object),
          name: pick.object.name || '',
          z: +(pick.point.distanceTo(origin) - 120).toFixed(2)
        });
      }
    }

    /* legend + bbox per key */
    const byKey = {};
    hits.forEach(h => {
      const e = byKey[h.key] || (byKey[h.key] = {
        n: 0, x0: 999, x1: -999, y0: 999, y1: -999, zmin: 999, zmax: -999, names: {}
      });
      e.n++;
      e.x0 = Math.min(e.x0, h.x); e.x1 = Math.max(e.x1, h.x);
      e.y0 = Math.min(e.y0, h.y); e.y1 = Math.max(e.y1, h.y);
      e.zmin = Math.min(e.zmin, h.z); e.zmax = Math.max(e.zmax, h.z);
      e.names[h.name] = (e.names[h.name] || 0) + 1;
    });

    /* assign symbols */
    const keys = Object.keys(byKey).sort((a, b) => byKey[b].n - byKey[a].n);
    const SYM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const symOf = {};
    keys.forEach((k, i) => symOf[k] = SYM[i] || '?');

    /* ascii grid, y across (rows), x down (cols) */
    let map = '';
    for (let ay = 0; ay <= 100; ay += STEP) {
      let row = '';
      for (let ax = X0; ax <= X1; ax += STEP) {
        const h = hits.find(q => q.x === +ax.toFixed(2) && q.y === +ay.toFixed(2));
        row += h ? symOf[h.key] : '.';
      }
      map += String(Math.round(ay)).padStart(3, ' ') + ' |' + row + '\n';
    }

    return {
      map, keys, byKey, symOf,
      total: items.length
    };
  }, { STEP, X0, X1 });

  console.log('meshes', res.total, ' step', STEP, ' x', X0, '..', X1);
  console.log(res.map);
  console.log('legend (topmost surface only):');
  res.keys.forEach(k => {
    const e = res.byKey[k];
    const names = Object.keys(e.names).sort((a, b) => e.names[b] - e.names[a]).slice(0, 3);
    console.log('  ' + res.symOf[k] + '  ' + k.padEnd(26) +
      ' n=' + String(e.n).padStart(4) +
      '  x ' + e.x0.toFixed(0).padStart(3) + '..' + e.x1.toFixed(0).padStart(3) +
      '  y ' + e.y0.toFixed(0).padStart(3) + '..' + e.y1.toFixed(0).padStart(3) +
      '  z ' + e.zmin.toFixed(2) + '..' + e.zmax.toFixed(2) +
      (names.length ? '  [' + names.join(', ') + ']' : ''));
  });
  if (errs.length) { console.log('ERRORS'); console.log(errs.join('\n')); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
