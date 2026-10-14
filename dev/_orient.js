/* dev/_orient.js -- measure the orientation of every barrel / cone /
 * ring on the playfield, in the playfield group's OWN Z-up space, and
 * report where each sits in art-percent.
 *
 *   node dev/_orient.js
 *
 * WHY.  three.js CylinderGeometry stands along +Y and TorusGeometry
 * lies in the XY plane.  This playfield is Z-up, so an unrotated
 * cylinder lies FLAT on the wood and a ring rotated by PI/2 stands
 * PERPENDICULAR to it.  Reading that off by eye is unreliable, so this
 * prints the actual axis vector instead.
 *
 * The whole table is tilted a few degrees by game.js, so measuring in
 * world space would smear every axis; we undo the parent tilt first.
 */
const pw = require('playwright-core');

const URL = 'http://127.0.0.1:8099/index.html';
const ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--disable-lcd-text'
];

(async () => {
  const browser = await pw.chromium.launch({ channel: 'msedge', args: ARGS });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });

  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + (e && e.message)));

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(6000);

  const out = await page.evaluate(() => {
    const T = window.THREE;
    const PF = window.PB.game.playfield;
    const tbl = window.PB.game.table;
    const CX = tbl.centerX, CY = tbl.centerY;
    const x0 = tbl.artX(0), x100 = tbl.artX(100);
    const y0 = tbl.artY(0), y100 = tbl.artY(100);
    const pctX = wx => (wx - x0) / (x100 - x0) * 100;
    const pctY = wy => (wy - y0) / (y100 - y0) * 100;

    const G = PF.group;
    G.updateWorldMatrix(true, true);
    const inv = G.matrixWorld.clone().invert();

    const rows = [];
    const pos = new T.Vector3(), q = new T.Quaternion(), scl = new T.Vector3();
    const m = new T.Matrix4();

    G.traverse(o => {
      if (!o.isMesh || !o.geometry) return;
      const kind = o.geometry.type || '';
      if (!/Cylinder|Cone|Torus|Capsule/.test(kind)) return;

      /* orientation & position relative to the playfield group */
      m.multiplyMatrices(inv, o.matrixWorld).decompose(pos, q, scl);

      const isRing = /Torus/.test(kind);
      const localAxis = isRing ? new T.Vector3(0, 0, 1) : new T.Vector3(0, 1, 0);
      const wAxis = localAxis.clone().applyQuaternion(q).normalize();

      const p = o.geometry.parameters || {};
      rows.push({
        kind: kind.replace('Geometry', ''),
        isRing: isRing,
        rt: p.radiusTop, rb: p.radiusBottom, h: p.height, r: p.radius,
        axisZ: +wAxis.z.toFixed(3),
        /* a ring's local +Z is its normal:
             |z| ~ 1  -> lies FLAT on the wood   (what we want on a floor)
             |z| ~ 0  -> stands PERPENDICULAR    (what the user reported)
           a barrel's local +Y is its length:
             |z| ~ 1  -> stands UP out of the wood
             |z| ~ 0  -> lies flat on it         (reads as a triangle) */
        verdict: isRing
          ? (Math.abs(wAxis.z) > 0.7 ? 'ring-flat' : 'RING-PERP')
          : (Math.abs(wAxis.z) > 0.7 ? 'barrel-up' : 'BARREL-LYING'),
        artX: +pctX(pos.x + CX).toFixed(1),
        artY: +pctY(pos.y + CY).toFixed(1),
        z: +pos.z.toFixed(3)
      });
    });

    const tally = {};
    rows.forEach(r => { tally[r.verdict] = (tally[r.verdict] || 0) + 1; });

    /* what is actually inside the group */
    const kids = G.children.map(c => c.type + (c.name ? ':' + c.name : ''));
    const kidTally = {};
    kids.forEach(k => { kidTally[k] = (kidTally[k] || 0) + 1; });

    return { tally, total: rows.length, kidTally, rows };
  });

  console.log('TALLY', JSON.stringify(out.tally), 'total', out.total);
  console.log('CHILDREN', JSON.stringify(out.kidTally));
  console.log('');
  const bad = out.rows.filter(r => /LYING|PERP/.test(r.verdict));
  console.log('--- SUSPECT (' + bad.length + ') ---');
  const fmt = r =>
    (r.kind + '          ').slice(0, 10) +
    ' axisZ=' + String(r.axisZ).padStart(6) +
    ' ' + r.verdict.padEnd(13) +
    ' art(' + String(r.artX).padStart(5) + ',' + String(r.artY).padStart(5) + ')' +
    ' z=' + String(r.z).padStart(6) +
    ' d=' + (r.h !== undefined ? String(+r.h.toFixed(2)) : '-');
  bad.forEach(r => console.log(fmt(r)));
  console.log('');
  console.log('--- GOOD ---');
  out.rows.filter(r => !/LYING|PERP/.test(r.verdict)).forEach(r => console.log(fmt(r)));

  if (errs.length) { console.log('\n--- ERRORS ---'); console.log(errs.join('\n')); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
