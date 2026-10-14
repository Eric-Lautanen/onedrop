const pw = require('playwright-core');
(async () => {
  const b = await pw.chromium.launch({ channel: 'msedge',
    args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 800, height: 800 } });
  await p.goto('http://127.0.0.1:8099/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(6000);
  const out = await p.evaluate(() => {
    const g = window.PB.game, T = window.THREE;
    const root = g.machine.root;
    const box = new T.Box3().setFromObject(root);
    const size = box.getSize(new T.Vector3());
    // find the head group: the root child that is a Group with a tall bbox
    let headInfo = null;
    root.children.forEach(c => {
      if (!c.isGroup) return;
      const bb = new T.Box3().setFromObject(c);
      const s = bb.getSize(new T.Vector3());
      if (s.y > 20 && s.x > 25) {
        headInfo = { size: s.toArray().map(v=>+v.toFixed(2)),
                     min: bb.min.toArray().map(v=>+v.toFixed(2)),
                     max: bb.max.toArray().map(v=>+v.toFixed(2)) };
      }
    });
    return {
      box: { min: box.min.toArray().map(v=>+v.toFixed(2)), max: box.max.toArray().map(v=>+v.toFixed(2)), size: size.toArray().map(v=>+v.toFixed(2)) },
      head: headInfo,
      boxPub: window.PB.MACHINE_BOX,
      floorY: root.userData.floorWorldY
    };
  });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
