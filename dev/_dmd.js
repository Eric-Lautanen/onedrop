/* dev/_dmd.js -- capture every dot-matrix screen, deterministically.
 *
 *   node dev/_dmd.js
 *
 * Rather than trying to reach each screen by playing, this drives the
 * display directly: set the state, render, grab the canvas -- all in one
 * page.evaluate, so the game's own frame loop cannot overwrite it in
 * between. That makes every screen reachable, including the ones that
 * only appear at the end of a long game.
 *
 * Also reports, for each screen, whether anything was drawn on the
 * bottom row -- the panel is 32 rows and text used to run off it.
 */
const fs = require('fs');
const path = require('path');
const pw = require('playwright-core');

const OUT = path.join(__dirname, 'shots');
const URL = 'http://127.0.0.1:8099/index.html';
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

/* the attract pager advances every 3.0s of render time, i.e. every 180
   renders, so `warm` steps straight to a given page */
const CASES = [
  ['attract_0_logo',    { mode: 'attract' }, 0],
  ['attract_1_marquee', { mode: 'attract' }, 181],
  ['attract_2_howto',   { mode: 'attract' }, 362],
  ['attract_3_tiki',    { mode: 'attract' }, 543],
  ['attract_4_high',    { mode: 'attract' }, 724],
  ['attract_5_irie',    { mode: 'attract' }, 905],
  ['ready',          { mode: 'ready', ball: 1, balls: 3, score: 12345, charge: 0.45 }, 0],
  ['play',           { mode: 'play', score: 1234567, ball: 1, balls: 3, mult: 3, combo: 4,
                       lanes: [true, false, true, false], skill: true,
                       missions: [1, 2, 0, 3, 1],
                       missionNames: ['ROOTS ORBIT', 'DUB SPINNER', 'TIKI BASH', 'ONE DROP', 'SKANK RAMP'] }, 0],
  ['multiball',      { mode: 'play', score: 900000, multiball: true, mbShots: 2 }, 0],
  ['wizard',         { mode: 'play', score: 1500000, multiball: true,
                       wizard: true, wizardTimer: 18 }, 0],
  ['bonus',          { mode: 'play', bonus: 5000, bonusShown: 2500 }, 0],
  ['gameover',       { mode: 'gameover', score: 9876543, high: 12345 }, 0],
  ['gameover_high',  { mode: 'gameover', score: 9999999, high: 12345 }, 0],
  ['tilt',           { mode: 'play', tilt: true }, 0]
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await pw.chromium.launch({ channel: 'msedge', args: ARGS });
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  page.on('pageerror', e => console.error('PAGEERROR', e && e.message));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.PB && window.PB.game && window.PB.assets.ready,
    null, { timeout: 45000 });
  await page.waitForTimeout(2000);

  /* ---- the six attract pages ----
     The pager advances on every render, and the game's own frame loop
     keeps rendering between evaluate calls, so the page cannot be
     selected from outside. Capture six frames exactly 181 renders
     apart inside ONE evaluate: that is a full cycle, so every page
     appears exactly once, whatever phase it started in. */
  const pages = await page.evaluate(() => {
    const d = window.PB.game.dmd;
    const s = d.state;
    s.msg = null; s.msgUntil = 0; s.bonus = 0; s.tilt = false;
    s.multiball = false; s.wizard = false; s.mode = 'attract';
    const c = document.getElementById('dmd');
    const out = [];
    for (let k = 0; k < 6; k++) {
      for (let i = 0; i < 181; i++) d.render(s.tick + k * 3.1 + i / 60);
      d.render(s.tick + k * 3.1 + 3.0);
      out.push(c.toDataURL('image/png'));
    }
    return out;
  });
  pages.forEach((url, k) => {
    fs.writeFileSync(path.join(OUT, `dmd_attract_p${k}.png`),
      Buffer.from(url.split(',')[1], 'base64'));
  });
  console.log('attract pages captured: 6');

  const rows = [];
  for (const [name, patch, warm] of CASES) {
    const res = await page.evaluate(({ patch, warm }) => {
      const d = window.PB.game.dmd;
      const s = d.state;
      /* reset to a known blank state, then apply the patch */
      s.msg = null; s.msgUntil = 0; s.bonus = 0; s.bonusShown = 0;
      s.tilt = false; s.multiball = false; s.wizard = false; s.skill = false;
      s.mode = 'play';
      for (const k in patch) if (patch.hasOwnProperty(k)) s[k] = patch[k];
      /* warming advances the attract pager / animation phase */
      for (let i = 0; i < (warm || 0); i++) d.render(i / 60);
      d.render(s.tick + 1.0);
      const c = document.getElementById('dmd');
      const x = c.getContext('2d');
      /* how many pixels lit on the very last dot row? */
      const last = x.getImageData(0, c.height - c.height / 32, c.width, c.height / 32).data;
      let lit = 0;
      for (let i = 3; i < last.length; i += 4) if (last[i] > 24) lit++;
      return { url: c.toDataURL('image/png'), bottomRowLit: lit };
    }, { patch, warm });

    fs.writeFileSync(path.join(OUT, 'dmd_' + name + '.png'),
      Buffer.from(res.url.split(',')[1], 'base64'));
    rows.push({ name, bottomRowLit: res.bottomRowLit });
  }

  console.log(JSON.stringify(rows, null, 2));
  await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
