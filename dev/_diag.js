/* dev/_diag.js -- dump world-space facts about the cabinet so a broken piece
 * is obvious without guessing from a render. */
const pw = require('playwright-core');
(async () => {
  const b = await pw.chromium.launch({
    channel: 'msedge',
    args: ['--use-gl=angle', '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  });
  const p = await b.newPage({ viewport: { width: 900, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await p.goto('http://127.0.0.1:8099/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(6500);
  const out = await p.evaluate(() => {
    const g = window.PB.game, T = window.THREE;
    const root = g.machine.root;
    const qw = new T.Quaternion(); g.group.getWorldQuaternion(qw);
    const axis = v => v.clone().applyQuaternion(qw).toArray().map(x => +x.toFixed(3));
    const lines = [];
    lines.push('group quat ' + qw.toArray().map(x => +x.toFixed(4)));
    lines.push('table +X -> world ' + axis(new T.Vector3(1, 0, 0)));
    lines.push('table +Y -> world ' + axis(new T.Vector3(0, 1, 0)));
    lines.push('table +Z -> world ' + axis(new T.Vector3(0, 0, 1)));
    lines.push('root pos ' + root.position.toArray().map(x => +x.toFixed(2)));
    lines.push('floorWorldY ' + (root.userData.floorWorldY || 0).toFixed(2));
    lines.push('MACHINE_BOX ' + JSON.stringify(window.PB.MACHINE_BOX));
    const box = new T.Box3().setFromObject(root);
    lines.push('bbox ' + box.min.toArray().map(x => +x.toFixed(2)) + ' .. ' +
      box.max.toArray().map(x => +x.toFixed(2)));

    /* per-child world AABB, biggest first, so an outlier shows up */
    const rows = [];
    root.children.forEach((c, i) => {
      const bb = new T.Box3().setFromObject(c);
      const sz = bb.getSize(new T.Vector3());
      rows.push({ i, type: c.type, geo: c.geometry ? c.geometry.type : '-',
        s: sz.toArray().map(x => +x.toFixed(2)),
        c: bb.getCenter(new T.Vector3()).toArray().map(x => +x.toFixed(2)) });
    });
    rows.sort((a, b2) => (b2.s[0] * b2.s[1] * b2.s[2]) - (a.s[0] * a.s[1] * a.s[2]));
    lines.push('--- largest root children ---');
    rows.slice(0, 14).forEach(r => lines.push(JSON.stringify(r)));
    return lines.join('\n');
  });
  console.log(out);
  if (errs.length) console.log('ERRORS\n' + errs.join('\n'));
  await b.close();
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
