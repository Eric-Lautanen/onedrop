/* dev/_mach.js -- orthographic whole-machine captures for comparison with
 * the FRONT / SIDE panels of assets/3dref.jpg.
 *
 *   node dev/_mach.js front|side [pad]
 *
 * The camera is placed in WORLD space using the machine group's own axes,
 * so "front" really is the player's view and "side" really is the flank.
 */
const pw = require('playwright-core');
const path = require('path');
const MODE = process.argv[2] || 'front';
const PAD = Number(process.argv[3] || 1.06);

(async () => {
  const b = await pw.chromium.launch({
    channel: 'msedge',
    args: ['--use-gl=angle', '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  });
  const p = await b.newPage({ viewport: { width: 900, height: 1100 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await p.goto('http://127.0.0.1:8099/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(6500);

  const info = await p.evaluate(({ MODE, PAD }) => {
    const g = window.PB.game, T = window.THREE;
    g.sheen.visible = false;
    g.world.balls.forEach(bb => { if (bb.mesh) bb.mesh.visible = false; if (bb.shadow) bb.shadow.visible = false; });
    ['menu', 'hud', 'fps', 'touch', 'vignette', 'scanlines', 'flash', 'floats']
      .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });

    const root = g.machine.root;
    const box = new T.Box3().setFromObject(root);
    const c = box.getCenter(new T.Vector3());
    const size = box.getSize(new T.Vector3());

    const qw = new T.Quaternion(); g.group.getWorldQuaternion(qw);
    const north = new T.Vector3(0, 1, 0).applyQuaternion(qw).normalize();   /* table +Y */
    /* WORLD up, not the playfield normal: the reference's front and side
       panels are drawn as elevations with the floor level, so the capture has
       to be level too or every vertical reads 6.5 degrees out */
    const up = new T.Vector3(0, 1, 0);
    const east = new T.Vector3(1, 0, 0).applyQuaternion(qw).normalize();

    /* half-extents of the bbox measured along the three machine axes */
    const corners = [];
    for (let i = 0; i < 8; i++) {
      corners.push(new T.Vector3(
        (i & 1) ? box.max.x : box.min.x,
        (i & 2) ? box.max.y : box.min.y,
        (i & 4) ? box.max.z : box.min.z));
    }
    function extent(axis) {
      let e = 0;
      corners.forEach(v => { e = Math.max(e, Math.abs(v.clone().sub(c).dot(axis))); });
      return e;
    }
    const extN = extent(north), extE = extent(east), extU = extent(up);

    let dir, upv, halfW, halfH;
    if (MODE === 'front') {
      dir = north.clone().negate();          /* stand in front, look at the back */
      upv = up.clone();
      halfW = extE; halfH = extU;
    } else if (MODE === 'side') {
      dir = east.clone();
      upv = up.clone();
      halfW = extN; halfH = extU;
    } else if (MODE === 'left') {
      dir = east.clone().negate();
      upv = up.clone();
      halfW = extN; halfH = extU;
    } else if (MODE === 'back') {
      dir = north.clone();                   /* stand behind, look at the head */
      upv = up.clone();
      halfW = extE; halfH = extU;
    } else {
      dir = east.clone().multiplyScalar(0.8).add(north.clone().negate()).add(up.clone().multiplyScalar(0.35)).normalize();
      upv = up.clone();
      halfW = Math.max(extE, extN); halfH = Math.max(extU, extN);
    }

    /* match the frustum to the viewport or the capture stretches */
    const vAsp = innerWidth / innerHeight;
    let fW = Math.max(halfW, halfH * vAsp) * PAD;
    let fH = fW / vAsp;
    const cam = new T.OrthographicCamera(-fW, fW, fH, -fH, 0.1, 2000);
    cam.position.copy(c).addScaledVector(dir, 400);
    cam.up.copy(upv);
    cam.lookAt(c);
    cam.updateProjectionMatrix();

    const scene = g.group.parent;
    /* keep the added light gentle -- the machine's own lighting already
       carries it, and a strong key washes the matte black legs to silver */
    scene.add(new T.AmbientLight(0xffffff, 0.45));
    const key2 = new T.DirectionalLight(0xffffff, 0.55);
    key2.position.copy(cam.position).addScaledVector(dir, 30);
    key2.target.position.copy(c);
    scene.add(key2); scene.add(key2.target);
    scene.background = new T.Color(0x6a6e74);
    scene.fog = null;

    const orig = g.renderer.render.bind(g.renderer);
    g.renderer.render = sc => orig(sc, cam);

    return {
      mode: MODE,
      bbox: { min: box.min.toArray().map(v => +v.toFixed(2)), max: box.max.toArray().map(v => +v.toFixed(2)) },
      size: size.toArray().map(v => +v.toFixed(2)),
      halfW: +halfW.toFixed(2), halfH: +halfH.toFixed(2)
    };
  }, { MODE, PAD });

  await p.waitForTimeout(400);
  const out = path.join(__dirname, 'shots', '_mach_' + MODE + '.png');
  await p.screenshot({ path: out });
  console.log('wrote', out, JSON.stringify(info));
  if (errs.length) { console.log('ERRORS'); console.log(errs.join('\n')); }
  await b.close();
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
