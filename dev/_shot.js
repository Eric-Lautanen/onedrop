/* dev/_shot.js -- plain screenshot of the game, no camera override.
 *   node dev/_shot.js [outfile] [waitMs]
 */
const pw = require('playwright-core');
const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, 'shots', '_plain.png');
const WAIT = Number(process.argv[3] || 7000);

(async () => {
  const b = await pw.chromium.launch({
    channel: 'msedge',
    args: ['--use-gl=angle', '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await p.goto('http://127.0.0.1:8099/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(WAIT);
  await p.screenshot({ path: OUT });
  console.log('wrote', OUT);
  if (errs.length) { console.log('ERRORS'); console.log(errs.join('\n')); }
  await b.close();
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
