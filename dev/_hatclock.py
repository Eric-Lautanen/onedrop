"""The sequencer's voices must land ON the step they were asked for, however
long the page has been open.

THE RULE. Every voice primitive in `audio.js` takes a RELATIVE offset (`at`),
and the sequencer hands it `when - ctx.currentTime`. A few voices that are
scheduled for the bar line (`organ`, `bassNote`, `melodica`, `horn`) instead
take the ABSOLUTE `when` and subtract the clock themselves. Both are fine, and
both are indistinguishable while `ctx.currentTime` is small -- which is exactly
why this shipped: the offline renders schedule everything with the clock near
zero, and the suite's own harnesses stub `ctx = { currentTime: 0 }`.

THE BUG. The hi-hat's callers passed the absolute `when` into a voice that
expects a relative offset. The hat therefore landed at
`ctx.currentTime + when`, i.e. roughly TWICE the audio clock -- so its distance
from its own step grew with how long the page had been open. Ten minutes in,
every hat was scheduled ten minutes into the future: the pattern fell behind,
and the pending (started-later) buffer sources piled up on the render thread,
which is the crackle. Same shape as backing a long-lived graph up with one
stale node per beat.

WHAT THIS MEASURES. For every song and every step, it checks what absolute
time each voice actually told the audio clock to sound at, against the step's
own time. It runs the measurement TWICE: once against the shipped engine, and
once against the old behaviour reconstructed in the page (the hat's offset with
the clock added back). The second run is the proof that the check can see it --
a probe that only passes is not evidence; a probe that also fails on the bug is.

No audio is started and nothing is rendered: every primitive is stubbed, so
this is arithmetic on the scheduler, and takes seconds.

Run: dev/.venv-playfield/Scripts/python.exe dev/_hatclock.py
"""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
URL = 'http://127.0.0.1:8101/'

# Ten minutes of uptime: the point the player reports it, and far enough from
# the lookahead (0.45 s) that the two conventions cannot be confused.
SHIFT = 600.0

MEASURE = """
(shift) => {
  const A = PB.AudioEngine;

  /* One pass: instrument every voice, walk every song, and report the worst
     distance between a voice's scheduled time and its step's time.
     `hatBackInTime` reconstructs the shipped bug: the hat's offset with the
     audio clock added back, which is what passing the absolute `when` did. */
  function measure(shift, hatBackInTime) {
    const e = new A();
    e.init = function () {};
    e.ctx = { currentTime: shift };
    e.ready = true;
    e.intensity = 0; e._wet = 1;
    e._insert = null; e._pendingInsert = null;
    e.delaySend = { gain: { setTargetAtTime: function () {} } };

    /* the leaf primitives: where a voice's relative offset becomes an
       absolute time. `at` is relative for every one of them. */
    const recs = [];
    let who = '?';
    const leaf = (kind) => function (o) {
      recs.push({ voice: who, kind: kind, abs: e.ctx.currentTime + ((o && o.at) || 0) });
    };
    e.noise = leaf('noise'); e.tone = leaf('tone'); e.modal = leaf('modal');

    /* every voice through its REAL implementation, so the tagging cannot
       change what is being measured */
    ['kick', 'snare', 'shaker', 'handDrum', 'riddimGuitar', 'organ',
     'bassNote', 'melodica', 'horn', '_fill', '_leadLine'].forEach((n) => {
      const real = A.prototype[n];
      e[n] = function () {
        const prev = who; who = n === '_fill' ? 'fill' : n === '_leadLine' ? 'lead' : n;
        try { return real.apply(this, arguments); } finally { who = prev; }
      };
    });
    /* bassNote builds its own nodes, so it cannot run against a stub ctx --
       it is scheduled for `when` outright, and is recorded as such */
    e.bassNote = function (f, dur, when) { recs.push({ voice: 'bass', kind: 'sched', abs: when }); };

    /* the hat: the one voice whose CALLERS pass a scheduled time */
    const realHat = A.prototype.hat;
    e.hat = function (at, open) {
      const a = hatBackInTime ? at + this.ctx.currentTime : at;
      const prev = who; who = 'hat';
      try { return realHat.call(this, a, open); } finally { who = prev; }
    };

    const rows = [];
    A.SONGS.forEach((song) => {
      let worst = 0, worstVoice = null, voices = 0, hats = 0;
      for (let k = 0; k < song.run; k++) {
        const when = shift + 0.15 + k * song.stepDur;
        recs.length = 0;
        e._scheduleSongStep(song, k, when);
        for (let i = 0; i < recs.length; i++) {
          const r = recs[i];
          voices++;
          if (r.voice === 'hat') hats++;
          const d = r.abs - when;
          if (Math.abs(d) > Math.abs(worst)) { worst = d; worstVoice = r.voice; }
        }
      }
      rows.push({ song: song.name, voices: voices, hats: hats,
                  worstDrift: +worst.toFixed(6), worstVoice: worstVoice });
    });
    return rows;
  }

  return { shipped: measure(shift, false), bug: measure(shift, true) };
}
"""


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', args=[
            '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
            '--autoplay-policy=no-user-gesture-required'])
        page = browser.new_page(viewport={'width': 1000, 'height': 800})
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.goto(URL, wait_until='load')
        page.wait_for_function('window.PB && PB.AudioEngine && PB.AudioEngine.SONGS',
                              timeout=60000)
        res = page.evaluate(MEASURE, SHIFT)
        browser.close()

    print('==  audio clock at  %.0f s (about ten minutes of play)' % SHIFT)
    print()
    failures = []
    for label, rows in (('shipped', res['shipped']), ('the old bug, reconstructed', res['bug'])):
        print('== %s' % label)
        print('%-14s %8s %6s %14s  %s' % ('song', 'voices', 'hats', 'worst drift', 'voice'))
        for r in rows:
            print('%-14s %8d %6d %13.3fs  %s'
                  % (r['song'], r['voices'], r['hats'], r['worstDrift'], r['worstVoice']))
        print()

    # what the probe has to hold: on the shipped engine every voice lands on
    # its step; on the reconstructed bug the hat lands a whole clock late.
    for r in res['shipped']:
        if abs(r['worstDrift']) > 0.001:
            failures.append('%s: a voice lands %+.3fs off its step (%s)'
                            % (r['song'], r['worstDrift'], r['worstVoice']))
    # NYABINGHI is the all-hand-drum feel and has no kit at all, so hats are
    # counted per song and only the total is asked for -- a probe that passes
    # because nothing it tests ever ran is the failure mode this guards.
    total_hats = sum(r['hats'] for r in res['shipped'])
    if total_hats == 0:
        failures.append('no song schedules a hat -- the check is silent')
    caught = [r for r in res['bug'] if abs(r['worstDrift']) > 1.0 and r['worstVoice'] == 'hat']
    if not caught:
        failures.append('the reconstructed bug was NOT detected -- this probe proves nothing')

    (ROOT / '_hatclock.json').write_text(
        json.dumps({'shift': SHIFT, 'shipped': res['shipped'], 'bug': res['bug']}, indent=2),
        encoding='utf-8')

    print('shipped: worst drift over every song  %+.4fs   (%d hats scheduled)'
          % (max(abs(r['worstDrift']) for r in res['shipped']), total_hats))
    print('bug reconstructed: worst drift        %+.1fs  (%d song(s) caught it)'
          % (max(abs(r['worstDrift']) for r in res['bug']), len(caught)))
    if errs:
        print('page errors:', errs[:4])
    if failures:
        print('\nFAIL')
        for f in failures:
            print('  ' + f)
        return 1
    print('\nPASS  (every voice lands on its step, hats included, at %.0fs of uptime)' % SHIFT)
    return 0


if __name__ == '__main__':
    sys.exit(main())
