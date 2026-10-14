"""Measure what the audio engine actually puts out.

Run: dev/.venv-playfield/Scripts/python.exe dev/probe-audio.py

Taps the sfx bus, the music bus and the master gain of the live engine
inside the running page, then fires each sfx and reads the peak RMS. This
answers "is there sound at all, and how loud is it next to the music"
with numbers instead of a guess.
"""
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parent

TAP = r"""
() => {
  const a = PB.game.audio;
  a.init();
  a.resume();
  const ctx = a.ctx;
  const rec = { sfx: 0, music: 0, master: 0 };
  const an = {};
  for (const k of ['sfx', 'music', 'master']) {
    const node = k === 'sfx' ? a.sfxBus : k === 'music' ? a.musicBus : a.master;
    const n = ctx.createAnalyser();
    n.fftSize = 2048;
    node.connect(n);
    an[k] = n;
  }
  const buf = new Float32Array(2048);
  (function loop() {
    for (const k in an) {
      an[k].getFloatTimeDomainData(buf);
      let s = 0;
      for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
      const rms = Math.sqrt(s / buf.length);
      if (rms > rec[k]) rec[k] = rms;
    }
    requestAnimationFrame(loop);
  })();
  window.__rec = rec;
  window.__tapState = () => ({ state: ctx.state, rate: ctx.sampleRate, ready: a.ready, muted: a.muted });
  window.__reset = () => { rec.sfx = 0; rec.music = 0; rec.master = 0; };
  return window.__tapState();
}
"""

SFX = ['flipper', 'bumper', 'sling', 'bash', 'post', 'target', 'standup', 'rollover',
       'spinner', 'drain', 'rampup', 'ramp', 'launch', 'kickback', 'ballsave',
       'multiball', 'jackpot', 'bonus', 'tilt', 'start', 'gameover', 'charge',
       'nudge', 'coin']

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', args=[
        '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--autoplay-policy=no-user-gesture-required',
    ])
    page = browser.new_page(viewport={'width': 1000, 'height': 800})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://127.0.0.1:8101/', wait_until='load')
    page.wait_for_function('window.PB && PB.game && PB.game.audio && PB.assets.ready',
                           timeout=60000)
    tap = page.evaluate(TAP)

    out = {'tapState': tap, 'sfx': {}, 'music': None, 'silence': None}
    page.evaluate('__reset()')
    page.wait_for_timeout(400)
    out['silence'] = page.evaluate('({...window.__rec})')

    for name in SFX:
        page.evaluate('__reset()')
        page.evaluate('(n) => PB.game.audio.sfx(n, 2, 0)', name)
        page.wait_for_timeout(420)
        out['sfx'][name] = round(page.evaluate('window.__rec.sfx'), 5)

    page.evaluate('__reset()')
    page.evaluate('PB.game.audio.startMusic()')
    page.wait_for_timeout(3000)
    out['music'] = {'music': round(page.evaluate('window.__rec.music'), 5),
                    'master': round(page.evaluate('window.__rec.master'), 5)}
    page.evaluate('PB.game.audio.stopMusic()')

    # flock: 12 flipper hits in a second, the busiest real case
    page.evaluate('__reset()')
    for i in range(12):
        page.evaluate('(i) => PB.game.audio.sfx("flipper", null, i % 2 ? 0.35 : -0.35)', i)
        page.wait_for_timeout(80)
    out['sfxFlurry'] = round(page.evaluate('window.__rec.sfx'), 5)
    out['errors'] = errors
    print(json.dumps(out, indent=2))
    (root / 'audio-probe.json').write_text(json.dumps(out, indent=2), encoding='utf-8')
    browser.close()
