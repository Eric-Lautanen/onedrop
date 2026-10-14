"""Why is the score tick at -20 dB while the kickback is at -12?

Render a single cue at several pre-limiter gains and report peak and RMS, so
the compression curve of the sfx limiter and the master compressor can be
seen instead of guessed at. A cue whose output peak barely moves as its gain
rises is being held down by the limiters, and raising its gain is then a
loudness (RMS) decision, not a peak one.

Run: dev/.venv-playfield/Scripts/python.exe dev/_cueone.py
"""
import sys

from playwright.sync_api import sync_playwright

CUES = ['bonus', 'spinner', 'post', 'rollover', 'standup', 'coin', 'kickback']

TOOLS = r"""
() => {
  window.__off = async (build, secs) => {
    const SR = 48000;
    const oac = new OfflineAudioContext(2, Math.ceil(SR * secs), SR);
    const Real = window.AudioContext;
    window.AudioContext = function () { return oac; };
    let e;
    try { e = new PB.AudioEngine(); e.init(); build(e, PB); }
    finally { window.AudioContext = Real; if (e && e._rollTimer) clearInterval(e._rollTimer); }
    return await oac.startRendering();
  };
  window.__trim = async (name, trims) => {
    const out = [];
    for (const t of trims) {
      const buf = await window.__off((e) => { e._trim = t; e._voice(name, 2, 0); e._trim = 1; }, 1.2);
      const n = buf.length, ch = buf.numberOfChannels;
      let peak = 0, sum = 0;
      for (let c = 0; c < ch; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < n; i++) {
          const a = Math.abs(d[i]); if (a > peak) peak = a;
          if (c === 0) sum += d[i] * d[i];
        }
      }
      out.push({ trim: t, peak: peak, peakDb: 20 * Math.log10(Math.max(peak, 1e-12)),
                 rmsDb: 20 * Math.log10(Math.max(Math.sqrt(sum / n), 1e-12)) });
    }
    return out;
  };
  return 'ok';
}
"""

with sync_playwright() as p:
    b = p.chromium.launch(channel='msedge', args=[
        '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--autoplay-policy=no-user-gesture-required'])
    pg = b.new_page(viewport={'width': 900, 'height': 700})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://127.0.0.1:8101/', wait_until='load')
    pg.wait_for_function('window.PB && PB.game && PB.assets.ready', timeout=60000)
    pg.evaluate(TOOLS)
    trims = [1, 2, 4, 8, 16, 32]
    for name in CUES:
        rows = pg.evaluate('([n, t]) => window.__trim(n, t)', [name, trims])
        print('%-10s %s' % (name, '  '.join('x%-2d %6.1f/%6.1f' % (r['trim'], r['peakDb'], r['rmsDb'])
                                            for r in rows)))
    print('(each pair = peak dB / rms dB after the sfx limiter, the master compressor and the 50% fader)')
    print('errors:', errs)
    b.close()
