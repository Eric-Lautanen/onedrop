"""Which brightness statistic is stable enough to put a bar on?

A single Goertzel bin on a 20 ms window of a noise-rich attack is a
high-variance estimator: repeated identical renders of the same cue swing up
to 27 dB, which is why the character check flip-flopped. This compares it
with a band-averaged measurement -- several bin-centred frequencies across a
band, Hann-windowed, the way an ear splits high from low -- and reports the
run-to-run spread of each.

Run: dev/.venv-playfield/Scripts/python.exe dev/_kitspread.py
"""
from playwright.sync_api import sync_playwright

CUES = ['standup', 'rollover', 'spinner', 'flipper', 'bumper', 'target', 'kickback']

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
  function goertzel(x, rate, f) {
    const w = 2 * Math.PI * f / rate, c = 2 * Math.cos(w);
    let s1 = 0, s2 = 0;
    for (let i = 0; i < x.length; i++) { const s0 = x[i] + c * s1 - s2; s2 = s1; s1 = s0; }
    return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / Math.max(1, x.length);
  }
  /* mean magnitude across bins spanning f0..f1, on a Hann-windowed segment
     and on bin centres so there is no scalloping loss */
  function bandDbfs(seg, rate, f0, f1, bins) {
    const N = seg.length, df = rate / N;
    const win = new Float32Array(N);
    for (let i = 0; i < N; i++) win[i] = seg[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
    let s = 0;
    for (let i = 0; i < bins; i++) {
      const f = bins === 1 ? f0 : f0 + (f1 - f0) * i / (bins - 1);
      const bin = Math.max(1, Math.round(f / df));
      s += goertzel(win, rate, bin * df);
    }
    return 20 * Math.log10(s / bins + 1e-12);
  }
  window.__metrics = async (name, reps) => {
    const out = [];
    for (let r = 0; r < reps; r++) {
      const buf = await window.__off((e) => e.sfx(name, 2, 0), 0.6);
      const rate = buf.sampleRate;
      const A = buf.getChannelData(0), B = buf.numberOfChannels > 1 ? buf.getChannelData(1) : A;
      const mono = new Float32Array(buf.length);
      for (let i = 0; i < mono.length; i++) mono[i] = (A[i] + B[i]) * 0.5;
      const attack = mono.subarray(0, Math.floor(rate * 0.03));
      const bin15 = 20 * Math.log10(goertzel(attack, rate, 3200) / (goertzel(attack, rate, 140) + 1e-12) + 1e-12);
      const hi = bandDbfs(attack, rate, 2400, 6000, 6);
      const lo = bandDbfs(attack, rate, 80, 300, 5);
      out.push({ bin: bin15, band: hi - lo, hi: hi, lo: lo });
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
    print('%-9s %-28s %-28s' % ('cue', 'single bin (3200 vs 140)', 'band avg (2.4-6k vs 80-300)'))
    for name in CUES:
        rows = pg.evaluate('(n) => window.__metrics(n, 3)', name)
        bins = [r['bin'] for r in rows]
        bands = [r['band'] for r in rows]
        print('%-9s %s  spread %4.1f   %s  spread %4.1f  (hi %s, lo %s)'
              % (name,
                 ' '.join('%6.1f' % v for v in bins), max(bins) - min(bins),
                 ' '.join('%6.1f' % v for v in bands), max(bands) - min(bands),
                 ' '.join('%.1f' % r['hi'] for r in rows),
                 ' '.join('%.1f' % r['lo'] for r in rows)))
    print('errors:', errs)
    b.close()
