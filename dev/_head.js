/* dev/_head.js -- orthographic head-on capture of the LIVE backbox face.
 *
 *   node dev/_head.js [outfile] [pad]
 *
 * Frames the machine's `head` group square-on along its own face normal
 * with an orthographic camera, so the result can be laid next to the
 * FRONT ORTHO panel of assets/3dref.jpg and measured the same way.
 */
const pw = require('playwright-core');
const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, 'shots', '_head.png');
const PAD = Number(process.argv[3] || 1.12);

(async () => {
  const b = await pw.chromium.launch({
    channel: 'msedge',
    args: ['--use-gl=angle', '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  });
  const p = await b.newPage({ viewport: { width: 1000, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await p.goto('http://127.0.0.1:8099/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(6500);

  const info = await p.evaluate(({ PAD }) => {
    const g = window.PB.game, T = window.THREE;
    const head = g.machine.head;
    /* machine.root lives INSIDE g.group, so hide selectively:
       every group child except the machine, then every machine child
       except the head. */
    g.sheen.visible = false;
    g.world.balls.forEach(bb => { if (bb.mesh) bb.mesh.visible = false; if (bb.shadow) bb.shadow.visible = false; });
    const root = g.machine.root;
    g.group.children.forEach(c => { if (c !== root) c.visible = false; });
    root.children.forEach(c => { if (c !== head) c.visible = false; });
    ['menu', 'hud', 'fps', 'touch', 'vignette', 'scanlines', 'flash', 'floats']
      .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });

    const q = new T.Quaternion(); head.getWorldQuaternion(q);
    const ax = new T.Vector3(1, 0, 0).applyQuaternion(q).normalize();
    const ay = new T.Vector3(0, 1, 0).applyQuaternion(q).normalize();
    const an = new T.Vector3(0, 0, 1).applyQuaternion(q).normalize();

    /* Head-LOCAL bbox: union each child's geometry box through its own
       matrix relative to the head.  (setFromObject would give the world
       AABB, which the 3.4 degree lean inflates.) */
    const box = new T.Box3();
    const tmp = new T.Vector3();
    head.updateMatrixWorld(true);
    head.traverse(o => {
      if (!o.isMesh) return;
      o.updateMatrix();
      o.geometry.computeBoundingBox();
      const gb = o.geometry.boundingBox;
      for (let i = 0; i < 8; i++) {
        tmp.set((i & 1) ? gb.max.x : gb.min.x,
          (i & 2) ? gb.max.y : gb.min.y,
          (i & 4) ? gb.max.z : gb.min.z);
        tmp.applyMatrix4(o.matrix);
        box.expandByPoint(tmp);
      }
    });
    const c = box.getCenter(new T.Vector3());
    const hx = Math.max(Math.abs(box.min.x - c.x), Math.abs(box.max.x - c.x));
    const hy = Math.max(Math.abs(box.min.y - c.y), Math.abs(box.max.y - c.y));
    const hz = Math.max(Math.abs(box.min.z - c.z), Math.abs(box.max.z - c.z));
    /* the camera stands off along the head's own +Z, so c must be a world
       point -- but its local offsets are what we measure. Keep the centre
       in world space for the camera. */
    const cw = new T.Vector3(c.x, c.y, c.z).applyMatrix4(head.matrixWorld);

    /* keep the ortho frustum matched to the viewport, or the capture
       stretches: halfW from whichever axis needs more room, halfH derived */
    const vAsp = innerWidth / innerHeight;
    const halfW = Math.max(hx, hy * vAsp) * PAD;
    const halfH = halfW / vAsp;
    const cam = new T.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 900);
    cam.position.copy(cw).addScaledVector(an, 120);
    cam.up.copy(ay);
    cam.lookAt(cw);
    cam.updateProjectionMatrix();
    /* the scene is lit for the playfield, so the head face is dark from
       straight on -- add a flat front light for the capture only */
    const scene = g.group.parent;
    const amb = new T.AmbientLight(0xffffff, 1.6);
    scene.add(amb);
    const key2 = new T.DirectionalLight(0xffffff, 1.5);
    key2.position.copy(cam.position).addScaledVector(an, 40);
    key2.target.position.copy(cw);
    scene.add(key2); scene.add(key2.target);
    scene.background = new T.Color(0x3a3d42);
    scene.fog = null;
    const orig = g.renderer.render.bind(g.renderer);
    g.renderer.render = sc => orig(sc, cam);

    /* also report the parts we care about, in head-local units */
    const parts = [];
    head.traverse(o => {
      if (o.isMesh) {
        const bb = new T.Box3();
        const t2 = new T.Vector3();
        o.geometry.computeBoundingBox();
        const gb = o.geometry.boundingBox;
        for (let i = 0; i < 8; i++) {
          t2.set((i & 1) ? gb.max.x : gb.min.x,
            (i & 2) ? gb.max.y : gb.min.y,
            (i & 4) ? gb.max.z : gb.min.z);
          bb.expandByPoint(t2.applyMatrix4(o.matrix));
        }
        const cc = bb.getCenter(new T.Vector3());
        const sz = bb.getSize(new T.Vector3());
        parts.push({
          geo: o.geometry.type,
          lx: +cc.x.toFixed(2), ly: +cc.y.toFixed(2), lz: +cc.z.toFixed(2),
          w: +sz.x.toFixed(2), h: +sz.y.toFixed(2), d: +sz.z.toFixed(2)
        });
      }
    });
    return {
      headHalf: { x: +hx.toFixed(3), y: +hy.toFixed(3), z: +hz.toFixed(3) },
      headFull: { W: +(hx * 2).toFixed(3), H: +(hy * 2).toFixed(3), D: +(hz * 2).toFixed(3) },
      faceAspect: +((hx * 2) / (hy * 2)).toFixed(4),
      parts: parts
    };
  }, { PAD });

  await p.waitForTimeout(400);
  await p.screenshot({ path: OUT });
  console.log('wrote', OUT);
  console.log(JSON.stringify(info, null, 1));
  if (errs.length) { console.log('ERRORS'); console.log(errs.join('\n')); }
  await b.close();
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
