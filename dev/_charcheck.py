"""Re-run just the character check through the real TOOLS from verify-audio.

Fast iteration: it imports the suite as a module (no main()), so the exact
tool code that the suite uses is what is tested here.

Run: dev/.venv-playfield/Scripts/python.exe dev/_charcheck.py
"""
import importlib.util
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('vaudio', ROOT / 'verify-audio.py')
va = importlib.util.module_from_spec(spec)
spec.loader.exec_module(va)

with sync_playwright() as p:
    b = p.chromium.launch(channel='msedge', args=[
        '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--autoplay-policy=no-user-gesture-required'])
    pg = b.new_page(viewport={'width': 900, 'height': 700})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://127.0.0.1:8101/', wait_until='load')
    pg.wait_for_function('window.PB && PB.game && PB.assets.ready', timeout=60000)
    pg.evaluate(va.TOOLS)
    char = {n: pg.evaluate('(n) => window.__character(n, 3)', n) for n in va.BRIGHT + va.DEEP}
    for n in va.BRIGHT + va.DEEP:
        print('%-9s median %+6.1f dB   renders %s' % (
            n, char[n]['median'], ' '.join('%+.1f' % v for v in char[n]['all'])))
    med = {n: v['median'] for n, v in char.items()}
    span = max(med.values()) - min(med.values())
    top = max(med, key=lambda n: med[n])
    bot = min(med, key=lambda n: med[n])
    spread = {n: round(max(v['all']) - min(v['all']), 1) for n, v in char.items()}
    print('span %.1f dB; top %s %+.1f (%s); bottom %s %+.1f (%s); widest spread %.1f'
          % (span, top, med[top], top in va.BRIGHT, bot, med[bot], bot in va.DEEP,
             max(spread.values())))
    print('span check:', span >= 40 and med[top] >= 10 and med[bot] <= -25
          and top in va.BRIGHT and bot in va.DEEP)
    print('repeatable:', max(spread.values()) <= 12)
    print('errors:', errs)
    b.close()
