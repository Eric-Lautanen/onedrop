"""Boot-shape probe: where a fresh load's time actually goes, in SEQUENCE.

Reports, per run:
  * navigation timings (FCP, DCL, load event)
  * the boot performance.mark() timeline, in order, with gaps between them
  * the moment the loader's `gone` class lands (MutationObserver, so it is
    not delayed by a blocked main thread the way a poll would be)
  * every main-thread long task (>50 ms) with when it started
  * painted animation frames during boot (a rAF tick counter)
  * every resource the page asked for: status, content-type, transfer size
    and whether it came off the cache (transferSize 0)

Modes: `--gl gpu` uses the machine's real GPU (what the desktop app window
does); `--gl software` uses SwiftShader, which is the reference the audit's
earlier numbers used. Both are the same predicate, so an A/B is apples to
apples. Runs cold and warm in the SAME context: a change to the server's
cache headers shows up as warm transfer size dropping.
"""
import argparse
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
URL = 'http://127.0.0.1:8101/'

INIT = """
window.__lt = [];
try {
  new PerformanceObserver(function (list) {
    list.getEntries().forEach(function (e) {
      window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]);
    });
  }).observe({ entryTypes: ['longtask'] });
} catch (e) {}
window.__frames = 0;
(function tick() { window.__frames++; requestAnimationFrame(tick); })();
window.__gone = 0;
window.__goneObserver = new MutationObserver(function () {
  var l = document.getElementById('loader');
  if (l && l.classList.contains('gone') && !window.__gone) {
    window.__gone = Math.round(performance.now());
  }
});
/* observe from `document` (documentElement is null this early) */
window.__goneObserver.observe(document, {
  attributes: true, attributeFilter: ['class'], subtree: true
});
"""

COLLECT = """() => {
  const nav = performance.getEntriesByType('navigation')[0] || {};
  const paint = {};
  performance.getEntriesByType('paint').forEach(p => { paint[p.name] = Math.round(p.startTime); });
  return {
    DCL: Math.round(nav.domContentLoadedEventStart || 0),
    load: Math.round(nav.loadEventStart || 0),
    fcp: paint['first-contentful-paint'] || 0,
    marks: performance.getEntriesByType('mark').map(m => [m.name, Math.round(m.startTime)]),
    longs: window.__lt || [],
    frames: window.__frames,
    gone: window.__gone,
    resources: performance.getEntriesByType('resource').map(r => ({
      name: (r.name || '').split('/').pop(),
      status: r.responseStatus, dur: Math.round(r.duration),
      start: Math.round(r.startTime), transfer: r.transferSize,
      encoded: r.encodedBodySize, ct: (r.contentType || '')
    })),
    sheet: (PB.assets.image && PB.assets.image.src || '').split('/').pop(),
    sheetReady: PB.assets.ready
  };
}"""


def launch(browser, mode):
    args = ['--autoplay-policy=no-user-gesture-required']
    if mode == 'software':
        args += ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    return browser.chromium.launch(channel='msedge', args=args)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--gl', default='software', choices=['software', 'gpu'])
    ap.add_argument('--runs', type=int, default=2)
    ap.add_argument('--out', default=None)
    args = ap.parse_args()

    out_path = Path(args.out) if args.out else ROOT / ('_bootshape-%s.json' % args.gl)
    with sync_playwright() as p:
        b = launch(p, args.gl)
        ctx = b.new_context()
        ctx.add_init_script(INIT)
        out = []
        for i in range(args.runs):
            pg = ctx.new_page()
            errors = []
            pg.on('pageerror', lambda e: errors.append(str(e)))
            pg.goto(URL, wait_until='load')
            pg.wait_for_function(
                "document.getElementById('loader') && "
                "document.getElementById('loader').classList.contains('gone')",
                timeout=120000)
            data = pg.evaluate(COLLECT)
            data['cold'] = (i == 0)
            data['errors'] = errors
            out.append(data)
            if i == 0:
                shot = ROOT / ('_bootshape-%s-after-reveal.png' % args.gl)
                pg.screenshot(path=str(shot))
                print('screenshot at reveal-return:', shot)
            pg.close()
        b.close()

    for r in out:
        print('--- %s run (%s)' % (args.gl, 'cold' if r['cold'] else 'warm'))
        print('   FCP %d  DCL %d  load %d  loader-gone %d ms  (frames painted %d)'
              % (r['fcp'], r['DCL'], r['load'], r['gone'], r['frames']))
        prev = 0
        for name, t in r['marks']:
            print('     %7d ms  (+%6d)  %s' % (t, t - prev, name))
            prev = t
        print('   long tasks (%d):' % len(r['longs']))
        for start, dur in sorted(r['longs'], key=lambda x: -x[1])[:6]:
            print('     +%7d ms  %7d ms' % (start, dur))
        tot = sum(res['transfer'] for res in r['resources'])
        print('   total transfer: %d B   sheet: %s (ready=%s)   errors: %s'
              % (tot, r['sheet'], r['sheetReady'], r['errors']))
    out_path.write_text(json.dumps(out, indent=2), encoding='utf-8')
    print('wrote', out_path)


if __name__ == '__main__':
    main()
