"""The README's hero shot: a fresh load's attract screen, menu down.

Run with dev/.venv-playfield/Scripts/python.exe dev/_heroshot.py
Writes assets/hero.png at 2400x1350 (a 1600x900 window at 1.5x).

WHY THIS ONE IS NOT HEADLESS, unlike the verify-*.py scripts next to it:
this is the picture strangers see first, and the HUD in its corner reports
the real frame time. Software rendering would put a lie there -- and the
frame-time governor would answer that lie by trimming quality, which is
exactly the softness a hero shot cannot have. So it runs on the real GPU.
The window is up for a few seconds and closes itself.

WHY 1.5x AND NOT 2x: the governor caps the drawing buffer at 4.2 MPix
(guard.js), so a 1600x900 window at 2x asks for 5.8 MPix and gets its
render scale trimmed to fit. 1.5x is 3.2 MPix: every pixel of this shot is
a pixel the machine actually drew at the quality a player gets.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parent.parent
out = root / 'assets' / 'hero.png'

with sync_playwright() as p:
    browser = p.chromium.launch(
        channel='msedge',
        headless=False,
        args=['--autoplay-policy=no-user-gesture-required'])
    page = browser.new_page(viewport={'width': 1600, 'height': 900},
                            device_scale_factor=1.5)
    problems = []
    page.on('pageerror', lambda e: problems.append('PAGEERROR: ' + str(e)))
    page.on('console', lambda m: problems.append('CONSOLE %s: %s' % (m.type, m.text))
            if m.type in ('error', 'warning') else None)
    page.goto('http://127.0.0.1:8101/', wait_until='load')
    page.wait_for_function('window.PB && PB.game && PB.assets.ready')
    # the loader fades and the panel drops back in with its bounce
    page.wait_for_function(
        "document.getElementById('loader').classList.contains('gone')")
    # the drop, then the standing view's idle sway easing in over ~2 s.
    # The longer wait is for the governor: it starts judging at the reveal,
    # and if the machine can hold 60 fps it hands the quality it trimmed
    # back over the next few seconds. Shooting before that settles puts a
    # quality trade in the corner of the README.
    page.wait_for_timeout(9000)

    state = page.evaluate('''() => {
      const menu = document.getElementById('menu');
      return {
        gameState: PB.game.state,
        loaderGone: document.getElementById('loader').classList.contains('gone'),
        menuDown: !menu.classList.contains('ingame') && !menu.classList.contains('above'),
        hud: document.getElementById('fps').textContent.trim(),
        drawingBuffer: [PB.game.renderer.domElement.width, PB.game.renderer.domElement.height],
        governor: (PB.guard && PB.guard.report) ? PB.guard.report() : 'no report()',
        balls: PB.game.world.balls.length
      };
    }''')
    page.screenshot(path=str(out))
    browser.close()

print('STATE', state)
print('PROBLEMS', problems or 'none')
size = out.stat().st_size
print('wrote %s (%d bytes)' % (out, size))
