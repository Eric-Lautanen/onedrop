"""Look at the playfield glass from three angles.

  python dev/_glassshot.py
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parent
OUT = root / 'shots'
OUT.mkdir(exist_ok=True)

# name -> (units along the table's up-normal, units back toward the foot)
VIEWS = [('hero', 68, -97), ('steep', 80, -10), ('grazing', 16, -42)]

with sync_playwright() as p:
    b = p.chromium.launch(channel='msedge',
                          args=['--use-gl=angle', '--use-angle=swiftshader',
                                '--enable-unsafe-swiftshader'])
    page = b.new_page(viewport={'width': 1100, 'height': 800})
    errors = []
    page.on('console', lambda m: errors.append(m.type + ': ' + m.text[:300])
            if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)[:300]))
    page.goto('http://127.0.0.1:8101/', wait_until='load')
    page.wait_for_function('PB.game && PB.game.machine && PB.assets.ready', timeout=45000)
    page.wait_for_timeout(1500)
    page.evaluate('''() => {
      const g = PB.game, T = THREE;
      g.__orig = g.renderer.render.bind(g.renderer);
      g.__up = new T.Vector3(0, 0, 1).applyQuaternion(g.group.quaternion);
      g.__north = new T.Vector3(0, 1, 0).applyQuaternion(g.group.quaternion);
      g.__aim = (up, back) => {
        const c = g.surface.getWorldPosition(new T.Vector3());
        g.__cam = new T.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 900);
        g.__cam.position.copy(c).addScaledVector(g.__up, up).addScaledVector(g.__north, back);
        g.__cam.up.copy(g.__north);
        g.__cam.lookAt(c);
        g.__cam.updateMatrixWorld();
      };
      g.__aim(68, -97);            /* before the override: rAF may beat us */
      g.renderer.render = (s, cc) => s.userData.renderingMirror ? g.__orig(s, cc) : g.__orig(s, g.__cam);
      ['menu', 'hud', 'fps', 'touch', 'vignette', 'scanlines', 'floats', 'flash']
        .forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
    }''')
    for name, up, back in VIEWS:
        page.evaluate('([up, back]) => PB.game.__aim(up, back)', [up, back])
        page.wait_for_timeout(600)
        page.screenshot(path=str(OUT / ('glass-%s.jpg' % name)))
    print('errors:', errors)
    b.close()
