/* dev/_layout.js -- dump the whole playfield layout in ART PERCENT.
 *
 *   node dev/_layout.js > dev/layout.json
 *
 * Art percent is the authoring space: x 0..100 across the painting,
 * y 0 at the arch, 100 at the drain. Dumping in that space lets the
 * layout be drawn straight onto the sprite to check that the hardware
 * really sits on the features the painting draws.
 */
const pw = require('playwright-core');
const URL = 'http://127.0.0.1:8099/index.html';
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

(async () => {
  const browser = await pw.chromium.launch({ channel: 'msedge', args: ARGS });
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  page.on('pageerror', e => console.error('PAGEERROR', e && e.message));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(
    () => window.PB && window.PB.game && window.PB.game.machine && window.PB.assets.ready,
    null, { timeout: 45000 });
  await page.waitForTimeout(1500);

  const out = await page.evaluate(() => {
    const t = window.PB.game.table;
    const CX = t.centerX, CY = t.centerY, W = t.W, H = t.H;
    const px = (x) => +((x - (CX - W / 2)) / W * 100).toFixed(2);
    const py = (y) => +((CY + H / 2 - y) / H * 100).toFixed(2);
    const pr = (r) => +(r / W * 100).toFixed(2);

    return {
      table: { W: W, H: H, K: t.K, CX: CX, CY: CY },
      segments: t.segments.map(s => ({
        a: [px(s.ax), py(s.ay)], b: [px(s.bx), py(s.by)],
        e: s.e, kind: s.kind
      })),
      circles: t.circles.map(c => ({
        c: [px(c.x), py(c.y)], r: pr(c.r),
        type: c.type, color: c.color, label: c.label
      })),
      targets: t.targets.map(g => ({
        a: [px(g.ax), py(g.ay)], b: [px(g.bx), py(g.by)],
        label: g.label, drop: !!g.drop
      })),
      lamps: t.lamps.map(l => ({
        c: [px(l.x), py(l.y)], r: pr(l.r), kind: l.kind, big: !!l.big
      }))
    };
  });

  console.log(JSON.stringify(out));
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
