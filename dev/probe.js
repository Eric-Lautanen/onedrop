/* dev/probe.js -- fast load diagnostic. Prints page errors and the
 * boot state instead of waiting out the full 45s harness timeout.
 *
 *   node dev/probe.js
 */
const pw = require('playwright-core');

const URL = 'http://127.0.0.1:8099/index.html';
const ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--disable-lcd-text'
];

(async () => {
  const browser = await pw.chromium.launch({ channel: 'msedge', args: ARGS });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });

  const logs = [];
  page.on('console', m => logs.push(m.type().toUpperCase() + ': ' + m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR: ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e)));
  page.on('requestfailed', r => logs.push('REQFAIL: ' + r.url() + ' ' + (r.failure() || {}).errorText));

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(6000);

  const boot = await page.evaluate(() => {
    const out = {
      hasPB: !!window.PB,
      keys: window.PB ? Object.keys(window.PB) : null,
      assetsReady: !!(window.PB && window.PB.assets && window.PB.assets.ready),
      hasGame: !!(window.PB && window.PB.game),
      hasMachine: !!(window.PB && window.PB.game && window.PB.game.machine),
      hasVibrance: !!(window.PB && window.PB.vibrance),
      pfSize: window.PB && window.PB.PF_SIZE,
      cabOpening: window.PB && window.PB.cabinetOpening ? window.PB.cabinetOpening() : null
    };
    try {
      out.assetSize = window.PB.assets && window.PB.assets.size ? window.PB.assets.size('playfield') : null;
      out.assetErr = null;
    } catch (e) { out.assetErr = String(e && e.message); }
    try {
      out.table = window.PB.game ? { W: window.PB.game.table.W, H: window.PB.game.table.H } : null;
    } catch (e) { out.tableErr = String(e && e.message); }
    return out;
  });

  console.log(JSON.stringify(boot, null, 2));
  console.log('\n--- console (' + logs.length + ') ---');
  console.log(logs.length ? logs.join('\n') : '(clean)');

  await browser.close();
})().catch(e => { console.error('PROBE FAILED', e); process.exit(1); });
