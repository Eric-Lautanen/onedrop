"""What the PLAYER sees at the front of the machine while charging.

  python dev/_plungerplay.py
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image

root = Path(__file__).resolve().parent
OUT = root / 'shots'
OUT.mkdir(exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch(channel='msedge',
                          args=['--use-gl=angle', '--use-angle=swiftshader',
                                '--enable-unsafe-swiftshader'])
    page = b.new_page(viewport={'width': 1280, 'height': 900})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://127.0.0.1:8101/', wait_until='load')
    page.wait_for_function('PB.game && PB.game.machine && PB.assets.ready', timeout=45000)
    page.click('#playBtn')
    page.wait_for_function('PB.game.world && PB.game.world.balls.length===1')
    page.wait_for_timeout(1500)

    def grab(name):
        raw = OUT / ('_raw-' + name)
        page.screenshot(path=str(raw))
        im = Image.open(raw)
        w, h = im.size
        # the front of the machine lives in the lower-middle of the view
        im.crop((int(w * 0.18), int(h * 0.42), int(w * 0.84), h)).save(OUT / name)
        raw.unlink()

    grab('play-plunger-rest.jpg')
    page.keyboard.down('Space')
    page.wait_for_function('PB.game.playfield.plunger.pull>0.9', timeout=25000)
    page.wait_for_timeout(250)
    print('pull=', page.evaluate('PB.game.playfield.plunger.pull'))
    grab('play-plunger-charged.jpg')
    page.keyboard.up('Space')
    page.wait_for_timeout(120)
    grab('play-plunger-release.jpg')
    page.wait_for_timeout(1500)
    grab('play-plunger-after.jpg')
    print('errors:', errors)
    b.close()
