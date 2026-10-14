/* dev/_bump.js -- for every pop bumper, report the world-space footprint
 * of its SOLID parts and compare the centre with the layout circle.
 *
 *   node dev/_bump.js
 *
 * A bumper whose barrels lie on their side has a footprint stretched
 * along Y (the barrel's length) instead of a round one, and its centre
 * is dragged off the layout point.  Measuring the XZ bounding box of
 * the solid meshes catches both, without needing to read pixels.
 */
const pw = require('playwright-core');

const URL = 'http://127.0.0.1:8099/index.html';
const ARGS = [
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist', '--disable-lcd-text'
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
    const g = window.PB.game;
    const PF = g.playfield;
    const tbl = g.table;
    const CX = tbl.centerX, CY = tbl.centerY;
    const x0 = tbl.artX(0), x100 = tbl.artX(100);
    const y0 = tbl.artY(0), y100 = tbl.artY(100);
    const pctX = wx => (wx - x0) / (x100 - x0) * 100;
    const pctY = wy => (wy - y0) / (y100 - y0) * 100;

    /* the bumper groups are the Groups whose position matches a
       'bumper' circle */
    const wanted = tbl.circles.filter(c => c.type === 'bumper');
    const found = [];

    const inv = new T.Matrix4().copy(PF.group.matrixWorld).invert();
    const m = new T.Matrix4();
    const p = new T.Vector3();
    const bb = new T.Box3();

    PF.group.children.forEach(child => {
      if (!child.isGroup) return;
      /* group origin in playfield-local space */
      m.multiplyMatrices(inv, child.matrixWorld);
      p.setFromMatrixPosition(m);
      const hit = wanted.find(c =>
        Math.abs(p.x - (c.x - CX)) < 1e-6 && Math.abs(p.y - (c.y - CY)) < 1e-6);
      if (!hit) return;

      /* bounding box of the solid meshes only (skip additive glows) */
      bb.makeEmpty();
      child.updateWorldMatrix(true, true);
      child.traverse(o => {
        if (!o.isMesh) return;
        if (o.isSprite) return;
        const mat = o.material;
        if (mat && (mat.blending === T.AdditiveBlending || mat.transparent && mat.opacity < 0.9)) return;
        const g2 = o.geometry.clone();
        g2.computeBoundingBox();
        const b2 = g2.boundingBox.clone();
        b2.applyMatrix4(new T.Matrix4().multiplyMatrices(inv, o.matrixWorld));
        bb.union(b2);
        g2.dispose();
      });

      const size = new T.Vector3(); bb.getSize(size);
      const ctr = new T.Vector3(); bb.getCenter(ctr);

      found.push({
        label: hit.label,
        color: hit.color,
        layout: [+pctX(hit.x).toFixed(2), +pctY(hit.y).toFixed(2)],
        r: +(hit.r / 25.94 * 100).toFixed(2),
        solidCentre: [+pctX(ctr.x + CX).toFixed(2), +pctY(ctr.y + CY).toFixed(2)],
        solidSizeX: +size.x.toFixed(3),
        solidSizeY: +size.y.toFixed(3),
        solidSizeZ: +size.z.toFixed(3),
        footprintRound: +(Math.abs(size.x - size.y) / Math.max(size.x, size.y)).toFixed(3),
        height: +size.z.toFixed(3)
      });
    });
    return found;
  });

  const K = 1.1937;
  console.log('layout r (art% of W) -> world radius r/100*25.94\n');
  out.forEach(b => {
    const rWorld = b.r / 100 * 25.94;
    console.log(`${b.label} (${b.color})  layout art(${b.layout[0]},${b.layout[1]})  r=${b.r} -> ${rWorld.toFixed(3)} world`);
    console.log(`   solid bbox X ${b.solidSizeX}  Y ${b.solidSizeY}  Z ${b.height}`);
    console.log(`   footprint X:Y roundness ${b.footprintRound} (0 = perfectly round from above)`);
    console.log(`   bbox centre art(${b.solidCentre[0]},${b.solidCentre[1]})  ` +
      `drift (${(b.solidCentre[0] - b.layout[0]).toFixed(2)}, ${(b.solidCentre[1] - b.layout[1]).toFixed(2)})`);
  });

  if (errs.length) { console.log('\nERRORS'); console.log(errs.join('\n')); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
