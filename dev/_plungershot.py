"""Close-up shots of the plunger handle at rest / half / full pull.

  python dev/_plungershot.py [front|low|side|profile]

Camera is forced the same way dev/verify-mirrors.py does it, so the
mirror passes keep the real camera.
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parent
OUT = root / 'shots'
OUT.mkdir(exist_ok=True)
VIEW = sys.argv[1] if len(sys.argv) > 1 else 'front'

SETUP = '''(view) => {
  const g = PB.game, T = THREE;
  g.__orig = g.renderer.render.bind(g.renderer);
  const PF = g.playfield, pl = PF.plunger;
  PF.setPlunger(0); PF.snapPlunger();
  const up = new T.Vector3(0, 0, 1).applyQuaternion(g.group.quaternion);      /* world up   */
  const north = new T.Vector3(0, 1, 0).applyQuaternion(g.group.quaternion);   /* up-table   */
  const east = new T.Vector3(1, 0, 0).applyQuaternion(g.group.quaternion);
  const front = north.clone().negate();                                       /* cabinet front */
  const c = new T.Vector3();
  pl.knob.getWorldPosition(c);
  let cam;
  if (view === 'zoom' || view === 'face') {
    /* straight at the cabinet's front panel, so the graphic and the real
       plunger can be compared side by side */
    let panel = null;
    g.machine.root.traverse(o => {
      if (o.isMesh && o.geometry.type === 'PlaneGeometry') {
        const p = o.geometry.parameters;
        if (Math.abs(p.width - 27.8) < 0.02 && Math.abs(p.height - 14) < 0.02) panel = o;
      }
    });
    /* on 'zoom', centre on the plunger's own line on the face instead */
    const c2 = new T.Vector3();
    if (view === 'zoom') pl.ferrule.getWorldPosition(c2);
    else panel.getWorldPosition(c2);
    cam = g.__cam = new T.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 600);
    cam.position.copy(c2).addScaledVector(front, view === 'zoom' ? 15 : 44);
    cam.up.copy(up);
    cam.lookAt(c2);
  } else if (view === 'profile') {
    const r = g.table.K * 7;
    cam = g.__cam = new T.OrthographicCamera(-r, r, r * 0.6, -r * 0.6, 0.1, 600);
    cam.position.copy(c).addScaledVector(east, 40);
    cam.up.copy(up);
    cam.lookAt(c.clone().addScaledVector(front, 3));
  } else {
    cam = g.__cam = new T.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 600);
    if (view === 'side') {
      cam.position.copy(c).addScaledVector(up, 6).addScaledVector(east, 26).addScaledVector(front, 4);
      cam.up.copy(up);
      cam.lookAt(c.clone().addScaledVector(front, 3).addScaledVector(up, -1));
    } else if (view === 'low') {
      cam.position.copy(c).addScaledVector(up, 2).addScaledVector(front, 16).addScaledVector(east, 3);
      cam.up.copy(up);
      cam.lookAt(c.clone().addScaledVector(front, 4).addScaledVector(up, -1.5));
    } else {
      cam.position.copy(c).addScaledVector(up, 8).addScaledVector(front, 22).addScaledVector(east, 5);
      cam.up.copy(up);
      cam.lookAt(c.clone().addScaledVector(front, 4));
    }
  }
  cam.updateMatrixWorld();
  g.renderer.render = (s, cc) => s.userData.renderingMirror ? g.__orig(s, cc) : g.__orig(s, cam);
  ['menu', 'hud', 'fps', 'touch', 'vignette', 'scanlines', 'floats', 'flash']
    .forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
}'''

with sync_playwright() as p:
    b = p.chromium.launch(channel='msedge',
                          args=['--use-gl=angle', '--use-angle=swiftshader',
                                '--enable-unsafe-swiftshader'])
    page = b.new_page(viewport={'width': 900, 'height': 760})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://127.0.0.1:8101/', wait_until='load')
    page.wait_for_function('PB.game && PB.game.machine && PB.assets.ready', timeout=45000)
    page.wait_for_timeout(700)
    page.evaluate(SETUP, VIEW)

    def shot(name, pull=None):
        if pull is not None:
            page.evaluate('v => { PB.game.playfield.setPlunger(v); PB.game.playfield.snapPlunger(); }', pull)
        page.wait_for_timeout(500)
        page.screenshot(path=str(OUT / name))

    shot('plunger-rest.jpg', 0)
    shot('plunger-half.jpg', 0.5)
    shot('plunger-full.jpg', 1)
    page.evaluate('PB.game.playfield.setPlunger(0); PB.game.playfield.snapPlunger()')
    print('errors:', errors)
    b.close()
