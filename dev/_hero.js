/* dev/_hero.js -- screenshot the game through its OWN camera (no
 * override) and crop around a named playfield feature, so the result is
 * literally what the player sees.
 *
 *   node dev/_hero.js [artX,artY] [halfWidthInWorld]
 */
const pw = require('playwright-core');
const path = require('path');

const URL = 'http://127.0.0.1:8099/index.html';
const ARGS = [
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist', '--disable-lcd-text'
];
const VW = 1600, VH = 1200;

const TARGET = (process.argv[2] || '49.4,31').split(',').map(Number);
const HALF = Number(process.argv[3] || 5);

(async () => {
  const browser = await pw.chromium.launch({ channel: 'msedge', args: ARGS });
  const page = await browser.newPage({ viewport: { width: VW, height: VH } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + (e && e.message)));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(6500);

  /* hide the DOM chrome only -- the game keeps its own camera */
  await page.evaluate(() => {
    ['menu', 'hud', 'fps', 'touch', 'vignette', 'scanlines', 'flash', 'floats']
      .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(__dirname, 'shots', '_hero_full.png') });

  const info = await page.evaluate(({ TARGET }) => {
    const g = window.PB.game, T = window.THREE;
    const tbl = g.table;
    const p = new T.Vector3(tbl.artX(TARGET[0]), tbl.artY(TARGET[1]), 0);
    p.project(g.camera);
    return {
      px: (p.x * 0.5 + 0.5) * innerWidth,
      py: (-p.y * 0.5 + 0.5) * innerHeight,
      w: innerWidth, h: innerHeight
    };
  }, { TARGET });

  console.log('feature screen pos', info.px.toFixed(0), info.py.toFixed(0),
    'of', info.w, info.h);

  /* crop in-page at 2x around the feature so it is readable */
  const buf = await page.screenshot({
    clip: {
      x: Math.max(0, Math.round(info.px - HALF * 55)),
      y: Math.max(0, Math.round(info.py - HALF * 55)),
      width: Math.round(HALF * 110),
      height: Math.round(HALF * 110)
    }
  });
  require('fs').writeFileSync(path.join(__dirname, 'shots', '_hero_zoom.png'), buf);
  console.log('wrote dev/shots/_hero_zoom.png');
  if (errs.length) { console.log('ERRORS'); console.log(errs.join('\n')); }
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
