"""Why is the sfx bus silent? Instrument the graph directly.

Run: dev/.venv-playfield/Scripts/python.exe dev/probe-audio2.py
"""
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

PROBE = r"""
async () => {
  const a = PB.game.audio;
  a.init(); a.resume();
  const ctx = a.ctx;

  // count every node the primitives create during one sfx call
  const counts = { osc: 0, buf: 0, gain: 0, bq: 0, pan: 0 };
  const named = {};
  for (const [k, fn] of [['osc', 'createOscillator'], ['buf', 'createBufferSource'],
                         ['gain', 'createGain'], ['bq', 'createBiquadFilter'],
                         ['pan', 'createStereoPanner']]) {
    if (!ctx[fn]) continue;
    const orig = ctx[fn].bind(ctx);
    ctx[fn] = (...args) => { counts[k]++; return orig(...args); };
  }

  const an = ctx.createAnalyser();
  an.fftSize = 2048;
  a.sfxBus.connect(an);
  const buf = new Float32Array(2048);
  const sample = () => {
    an.getFloatTimeDomainData(buf);
    let s = 0;
    for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    return Math.sqrt(s / buf.length);
  };

  // tight synchronous sampler, independent of rAF
  let peak = 0;
  const iv = setInterval(() => { peak = Math.max(peak, sample()); }, 3);
  await new Promise(r => setTimeout(r, 300));

  const out = { before: { ...counts }, sfxBusGain: a.sfxBus.gain.value,
                masterGain: a.master.gain.value, muted: a.muted, ready: a.ready,
                state: ctx.state, currentTime: ctx.currentTime };
  for (const k in counts) counts[k] = 0;
  peak = 0;
  a.sfx('flipper', null, 0);
  out.nodesForFlipper = { ...counts };
  await new Promise(r => setTimeout(r, 300));
  out.flipperPeak = peak;

  for (const k in counts) counts[k] = 0;
  peak = 0;
  a.sfx('bumper', 2, 0);
  out.nodesForBumper = { ...counts };
  await new Promise(r => setTimeout(r, 300));
  out.bumperPeak = peak;

  // and the same test but straight onto the master, bypassing the bus
  peak = 0;
  const direct = ctx.createGain();
  direct.gain.value = 0.5;
  direct.connect(a.master);
  const o = ctx.createOscillator();
  o.frequency.value = 440;
  o.connect(direct);
  o.start(); o.stop(ctx.currentTime + 0.3);
  await new Promise(r => setTimeout(r, 300));
  out.directTonePeak = peak;

  clearInterval(iv);
  return out;
}
"""

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', args=[
        '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--autoplay-policy=no-user-gesture-required'])
    page = browser.new_page(viewport={'width': 900, 'height': 700})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://127.0.0.1:8101/', wait_until='load')
    page.wait_for_function('window.PB && PB.game && PB.game.audio && PB.assets.ready', timeout=60000)
    out = page.evaluate(PROBE)
    out['errors'] = errors
    print(json.dumps(out, indent=2))
    Path(Path(__file__).resolve().parent / 'audio-probe2.json').write_text(json.dumps(out, indent=2), encoding='utf-8')
    browser.close()
