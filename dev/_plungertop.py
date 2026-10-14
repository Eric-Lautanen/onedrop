"""Top-down look at the plunger end of the shooter lane, glass hidden.

  python dev/_plungertop.py
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parent
OUT = root / 'shots'
OUT.mkdir(exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch(channel='msedge',
                          args=['--use-gl=angle', '--use-angle=swiftshader',
                                '--enable-unsafe-swiftshader'])
    page = b.new_page(viewport={'width': 820, 'height': 820})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://127.0.0.1:8101/', wait_until='load')
    page.wait_for_function('PB.game && PB.game.machine && PB.assets.ready', timeout=45000)
    page.wait_for_timeout(800)
    page.evaluate('''() => {
      const g = PB.game, T = THREE, PF = g.playfield;
      g.__orig = g.renderer.render.bind(g.renderer);
      g.machine.root.getObjectByName('clear playfield glass').visible = false;
      const up = new T.Vector3(0, 0, 1).applyQuaternion(g.group.quaternion);
      const north = new T.Vector3(0, 1, 0).applyQuaternion(g.group.quaternion);
      const east = new T.Vector3(1, 0, 0).applyQuaternion(g.group.quaternion);
      /* the shoot lane mouth, half a table forward, and the right third */
      const lane = g.table.artY ? null : null;
      const c = new T.Vector3();
      PF.plunger.group.getWorldPosition(c);
      c.addScaledVector(north, -9);            /* a little further down-table */
      const hx = g.table.K * 6, hz = g.table.K * 9;
      const cam = g.__cam = new T.OrthographicCamera(-hx, hx, hz, -hz, 0.1, 900);
      cam.position.copy(c).addScaledVector(up, 120);
      cam.up.copy(north);
      cam.lookAt(c);
      cam.updateMatrixWorld();
      g.renderer.render = (s, cc) => s.userData.renderingMirror ? g.__orig(s, cc) : g.__orig(s, cam);
      ['menu', 'hud', 'fps', 'touch', 'vignette', 'scanlines', 'floats', 'flash']
        .forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
    }''')

    def shot(name, pull):
        page.evaluate('v => { PB.game.playfield.setPlunger(v); PB.game.playfield.snapPlunger(); }', pull)
        page.wait_for_timeout(500)
        page.screenshot(path=str(OUT / name))

    shot('plunger-top-rest.jpg', 0)
    shot('plunger-top-full.jpg', 1)
    page.evaluate('PB.game.playfield.setPlunger(0); PB.game.playfield.snapPlunger()')
    print('errors:', errors)
    b.close()
