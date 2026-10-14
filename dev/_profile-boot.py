"""Boot profiler for the audit: start a CDP sampling profiler before the
fresh load and print the functions with the most self time, so the load's
shape is measured at function granularity instead of inferred."""
import time
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b = p.chromium.launch(channel='msedge', args=[
        '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    ctx = b.new_context()
    pg = ctx.new_page()
    cdp = ctx.new_cdp_session(pg)
    pg.goto('http://127.0.0.1:8101/', wait_until='commit')
    cdp.send('Profiler.enable')
    cdp.send('Profiler.setSamplingInterval', {'interval': 2000})
    cdp.send('Profiler.start')
    pg.wait_for_function('window.PB && PB.game && PB.game.cabinetFit !== undefined', timeout=90000)
    time.sleep(1.5)
    prof = cdp.send('Profiler.stop')['profile']
    nodes = {n['id']: n for n in prof['nodes']}
    self_time = {}
    for i, sid in enumerate(prof['samples']):
        d = prof['timeDeltas'][i] if i < len(prof['timeDeltas']) else 0
        cf = nodes.get(sid, {}).get('callFrame', {})
        key = '%s @%s:%s' % (cf.get('functionName') or '(anon)',
                             (cf.get('url') or '').split('/')[-1], cf.get('lineNumber'))
        self_time[key] = self_time.get(key, 0) + max(0, d)
    tot = sum(self_time.values())
    print('total sampled: %.2f s across %d functions' % (tot / 1000, len(self_time)))
    for k, v in sorted(self_time.items(), key=lambda kv: -kv[1])[:24]:
        print('%7.0f ms  %s' % (v, k))
    b.close()
