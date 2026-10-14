"""Run deterministic ball-flow and flipper diagnostics against the local game."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parent
with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = browser.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://127.0.0.1:8101/', wait_until='load')
    page.wait_for_function('window.PB && PB.game && PB.assets.ready')
    page.add_script_tag(path=str(root / 'flow-check.js'))
    report = page.evaluate('PB.checkFlow()')
    report['browserErrors'] = errors
    (root / 'flow-verification.json').write_text(json.dumps(report, indent=2))
    for size in report['sizes']:
        print(json.dumps(size))
    browser.close()
    assert not errors, errors
    assert not report['failures'], report['failures']
    assert all(not size['stuck'] for size in report['sizes']), 'Persistent traps remain; see dev/flow-verification.json'
