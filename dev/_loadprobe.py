"""Load-path probe for the audit: time a fresh load three times over and
report, per run, DCL, the load event and the moment the loader is gone, plus
what the first visible frame looks like. Same predicate both sides of a
change, so an A/B is apples to apples."""
import json
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
OUT = ROOT / '_loadprobe.json'
URL = 'http://127.0.0.1:8101/'
N = 3

with sync_playwright() as p:
    b = p.chromium.launch(channel='msedge', args=[
        '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--autoplay-policy=no-user-gesture-required'])
    runs = []
    for i in range(N):
        pg = b.new_page()
        errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        t0 = time.time()
        pg.goto(URL, wait_until='load')
        load_at = time.time() - t0
        pg.wait_for_function('window.PB && PB.game && PB.assets.ready', timeout=90000)
        ready_at = time.time() - t0
        pg.wait_for_function(
            "!document.getElementById('loader') || document.getElementById('loader').classList.contains('gone')",
            timeout=90000)
        gone_at = time.time() - t0
        nav = pg.evaluate_promise('performance.getEntriesByType("navigation")[0].toJSON()') \
            if hasattr(pg, 'evaluate_promise') else pg.evaluate(
                '() => { const n = performance.getEntriesByType("navigation")[0];'
                'return { DCL: n.domContentLoadedEventStart, L: n.loadEventStart }; }')
        sheet = pg.evaluate('() => (PB.assets.image && PB.assets.image.src || "").split("/").pop()')
        runs.append({'run': i, 'DCL': round(nav['DCL'] / 1000, 2), 'loadEvent': round(nav['L'] / 1000, 2),
                     'assetsReadyOs': round(ready_at, 2), 'loaderGoneOs': round(gone_at, 2),
                     'sheet': sheet, 'errors': errors})
        pg.close()
    b.close()

for r in runs:
    print(r)
OUT.write_text(json.dumps(runs, indent=2), encoding='utf-8')
print('wrote', OUT)
