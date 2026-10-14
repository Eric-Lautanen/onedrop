/* dev/_wide.js -- what in the cabinet sticks out past its own outer box?
 *
 *   node dev/_wide.js
 *
 * Lists the widest objects in machine.root, by world-space x-extent.
 */
const pw = require('playwright-core');
const URL = 'http://127.0.0.1:8099/index.html';
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

(async () => {
  const browser = await pw.chromium.launch({ channel: 'msedge', args: ARGS });
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  page.on('pageerror', e => console.log('PAGEERROR', e && e.message));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.PB && window.PB.game && window.PB.game.machine,
    null, { timeout: 45000 });
  await page.waitForTimeout(1500);

  const out = await page.evaluate(() => {
    const g = window.PB.game, T = window.THREE;
    const root = g.machine.root;
    g.group.updateMatrixWorld(true);
    const rows = [];
    root.traverse(o => {
      if (!o.isMesh) return;
      const bb = new T.Box3().setFromObject(o);
      if (!isFinite(bb.min.x)) return;
      const p = o.geometry && o.geometry.parameters ? o.geometry.parameters : {};
      const dim = o.geometry && o.geometry.type === 'BoxGeometry'
        ? `${p.width}x${p.height}x${p.depth}` : (o.geometry ? o.geometry.type : '?');
      rows.push({
        minX: +bb.min.x.toFixed(3), maxX: +bb.max.x.toFixed(3),
        w: +(bb.max.x - bb.min.x).toFixed(3),
        mat: (o.material && (o.material.name || o.material.type)) || '?',
        geo: dim
      });
    });
    rows.sort((a, b) => b.w - a.w);
    const all = new T.Box3().setFromObject(root);
    return {
      total: rows.length,
      overall: { minX: +all.min.x.toFixed(3), maxX: +all.max.x.toFixed(3) },
      widest: rows.slice(0, 12),
      /* which objects reach furthest left / right */
      leftMost: rows.slice().sort((a, b) => a.minX - b.minX).slice(0, 6),
      rightMost: rows.slice().sort((a, b) => b.maxX - a.maxX).slice(0, 6)
    };
  });

  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
