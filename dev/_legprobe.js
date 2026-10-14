/* dev/_legprobe.js -- what are the legs actually made of?
 * Dumps every root child below the cabinet's mid-height with its material
 * colour, metalness/roughness and world AABB, so a "why is it grey" question
 * can be answered from data instead of by eye.
 */
const pw = require('playwright-core');

(async () => {
  const b = await pw.chromium.launch({
    channel: 'msedge',
    args: ['--use-gl=angle', '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  });
  const p = await b.newPage({ viewport: { width: 900, height: 900 } });
  await p.goto('http://127.0.0.1:8099/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(6000);

  const out = await p.evaluate(() => {
    const g = window.PB.game, T = window.THREE;
    const r = g.renderer;
    const rows = [];
    rows.push({ k: 'renderer', toneMapping: r.toneMapping, enc: r.outputEncoding,
      env: !!g.group.parent.environment, phys: r.physicallyCorrectLights });
    const root = g.machine.root;
    const box = new T.Box3().setFromObject(root);
    const midY = box.min.y + (box.max.y - box.min.y) * 0.42;
    let n = 0;
    root.traverse(o => {
      if (!o.isMesh) return;
      const bb = new T.Box3().setFromObject(o);
      if (bb.min.y > midY) return;                 /* only the low stuff */
      if (bb.getSize(new T.Vector3()).y < 4) return; /* only the tall stuff */
      const m = o.material;
      n++;
      if (n > 14) return;
      rows.push({
        i: n, geo: o.geometry.type,
        col: m.color ? '#' + m.color.getHexString() : null,
        metal: m.metalness, rough: m.roughness,
        envI: m.envMapIntensity,
        size: bb.getSize(new T.Vector3()).toArray().map(v => +v.toFixed(2)),
        c: bb.getCenter(new T.Vector3()).toArray().map(v => +v.toFixed(2))
      });
    });
    return rows;
  });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
