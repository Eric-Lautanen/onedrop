"""Does one ball in contact with a piece of hardware fire one cue, or 180?

THE RULE the physics follows now: a collision primitive resolving an OVERLAP is
not an IMPACT. `hitSegment` / `hitCircle` return true for as long as the ball is
inside the surface, and the push-out leaves it at exact contact -- where gravity,
or the piece beside it, puts it straight back. Keyed to that return value, a
sound and a score fire on every one of the 180 substeps in a second, and each
one-shot builds its whole graph:

    cue        nodes built by one voice
    bumper     34
    flipper    27
    sling      20
    bash       19
    standup    18
    post       17

Measured on this table before the strike gate: a ball HELD against a pop bumper
emitted 180 bumper hits a second (6,120 nodes/s -- the crackle), a ball pressed
into it by gravity emitted 180 too, and a ball skimming a wall at 22 u/s emitted
180 post cues a second. After it: 0, 0 and 0, with a real strike still emitting
exactly one.

Ordinary play is unmoved, and that is A/B'd against the committed physics with
these exact eight shots: every other cue is identical (bumper 1, flipper 71,
target 8, spinner 17, standup 3, drain 6, sling 1, post 1) and only the
wall-slide flood moves, 84 cues -> 16.

Every scenario builds its OWN table: the table carries live state (a dropped
target, the spinner's omega, each feature's `last` strike stamp), so a shared one
leaks between scenarios and quietly rewrites the result.

Run: dev/.venv-playfield/Scripts/python.exe dev/bumper-flood.py
"""
import sys
from playwright.sync_api import sync_playwright

URL = 'http://127.0.0.1:8101/'

JS = r'''
() => {
  const W = 25.94, H = 48.94;
  const GEOM = PB.buildTable({ W: W, H: H });
  const K = GEOM.K, R = 0.62 * K;
  const out = { events: {}, nodes: {} };

  function mk() {
    const table = PB.buildTable({ W: W, H: H });
    const w = new PB.World(table);
    return { table: table, w: w, b: w.addBall(0, 0, 0, 0, R) };
  }
  /* one simulated second: 180 substeps, which is what a fixed step of 1/180 s
     and a frame that cannot fall behind will really run */
  function tallyOf(setup, pin, steps) {
    const s = mk();
    const tally = {};
    setup(s);
    for (let i = 0; i < steps; i++) {
      if (pin) pin(s.b, i);
      s.w.events.length = 0;
      s.w.step(1 / 180);
      for (const e of s.w.events) tally[e.t] = (tally[e.t] || 0) + 1;
    }
    return tally;
  }

  let bumper = null, best = 1e9;
  for (const c of GEOM.circles) if (c.type === 'bumper') {
    const d = Math.hypot(c.x - GEOM.centerX, c.y - GEOM.centerY);
    if (d < best) { best = d; bumper = c; }
  }
  /* The play shot below needs a bumper it can actually REACH: the cluster
     sits at y 31.7-34.8 while a ball fired from the flipper end reaches about
     y 19 at 30 u/s, and the nearest-to-centre bumper hides behind a drop
     target at 4 u out. So the aimed shot uses the upper bumper closest to the
     table's centre line, from 4 u -- measured to arrive and strike once. */
  let playBumper = null, nearX = 1e9;
  for (const c of GEOM.circles) if (c.type === 'bumper' && c.y > 33) {
    const d = Math.abs(c.x - GEOM.centerX);
    if (d < nearX) { nearX = d; playBumper = c; }
  }
  const g = 34 * (GEOM.H / 48.94);

  /* A. one clean strike: 20 u/s from 3 u away. Must be exactly one cue. */
  out.events.cleanStrike = tallyOf((s) => {
    s.b.x = bumper.x; s.b.y = bumper.y - (bumper.r + R + 3); s.b.vx = 0; s.b.vy = 20 * K;
  }, null, 180);

  /* B. held against the bumper at zero velocity */
  out.events.heldAgainstBumper = tallyOf((s) => {
    s.b.x = bumper.x; s.b.y = bumper.y + (bumper.r + R) * 0.999;
  }, (b) => { b.x = bumper.x; b.y = bumper.y + (bumper.r + R) * 0.999; b.vx = 0; b.vy = 0; }, 180);

  /* C. pressed INTO it every substep -- what gravity or the piece beside it does */
  out.events.pressedIntoBumper = tallyOf((s) => {
    s.b.x = bumper.x; s.b.y = bumper.y + (bumper.r + R);
  }, (b) => { b.x = bumper.x; b.y = bumper.y + (bumper.r + R); b.vx = 0; b.vy = -g / 180; }, 180);

  /* D. skimming the longest wall at 22 u/s, held at exact contact. This is the
        common one: riding a rail used to fire the post cue at 180 a second. */
  let seg = null, segLen = 0;
  for (const s of GEOM.segments) {
    if (!s.chain) continue;
    const d = Math.hypot(s.bx - s.ax, s.by - s.ay);
    if (d > segLen) { segLen = d; seg = s; }
  }
  const sdx = seg.bx - seg.ax, sdy = seg.by - seg.ay, sl = Math.hypot(sdx, sdy);
  const sux = sdx / sl, suy = sdy / sl;
  const mid = { x: (seg.ax + seg.bx) / 2, y: (seg.ay + seg.by) / 2 };
  const nxp = -suy, nyp = sux;
  const sgn = ((mid.x - GEOM.centerX) * nxp + (mid.y - GEOM.centerY) * nyp) > 0 ? 1 : -1;
  const place = (b, off) => { b.x = mid.x + nxp * sgn * (R + off); b.y = mid.y + nyp * sgn * (R + off); };
  out.events.skimmingWall = tallyOf((s) => { place(s.b, 0.002); s.b.vx = sux * 22 * K; s.b.vy = suy * 22 * K; },
    (b) => { place(b, 0.002); b.vx = sux * 22 * K; b.vy = suy * 22 * K; }, 180);

  /* E. driven INTO the wall at 10 u/s: real approaches, so this one is allowed
        to fire -- but only at the cooldown rate, not 180 a second */
  out.events.pressedIntoWall = tallyOf((s) => { place(s.b, 0.02); s.b.vx = -nxp * sgn * 10 * K; s.b.vy = -nyp * sgn * 10 * K; },
    (b) => { place(b, 0.02); b.vx = -nxp * sgn * 10 * K; b.vy = -nyp * sgn * 10 * K; }, 180);

  /* F. ordinary play: eight shots, each alone for 4 s. The check that the gate
        did not silence real play. Shots fire from the flipper end (which the
        cluster is above and out of range of), so the first one is aimed at a
        bumper instead -- otherwise nothing in "ordinary play" would ever
        touch the cue this file is about. */
  const play = { total: {}, perShot: [] };
  for (let i = 0; i < 8; i++) {
    const s = mk();
    if (i === 0) {
      /* the first shot aims straight at a bumper, so "ordinary play" really
         does include the cue this file is about -- spread shots alone never
         reach one, which is what the missing-cue assertion below caught */
      s.b.x = playBumper.x; s.b.y = playBumper.y - (playBumper.r + R + 4); s.b.vx = 0; s.b.vy = 22 * K;
    } else {
      s.b.x = s.table.centerX; s.b.y = s.table.artY(72);
      s.b.vx = (i - 3.5) * 3 * K; s.b.vy = 30 * K;
    }
    let n = 0;
    const tally = {};
    for (let k = 0; k < 720; k++) {
      s.w.events.length = 0;
      s.w.step(1 / 180); s.w.pollZones();
      for (const e of s.w.events) { tally[e.t] = (tally[e.t] || 0) + 1; play.total[e.t] = (play.total[e.t] || 0) + 1; n++; }
    }
    play.perShot.push({ events: n, tally: tally });
  }
  out.events.ordinaryPlay = play;

  /* nodes one voice builds, counted through the real engine */
  const oac = new OfflineAudioContext(2, 4800, 48000);
  const Real = window.AudioContext;
  window.AudioContext = function () { return oac; };
  const e = new PB.AudioEngine();
  e.init();
  window.AudioContext = Real;
  if (e._rollTimer) clearInterval(e._rollTimer);
  const count = {};
  const factories = ['createOscillator','createGain','createBufferSource','createBiquadFilter','createStereoPanner'];
  factories.forEach((n) => {
    const real = oac[n].bind(oac);
    oac[n] = function () { count[n] = (count[n] || 0) + 1; return real.apply(oac, arguments); };
  });
  for (const cue of ['bumper','flipper','sling','bash','standup','post']) {
    for (const k in count) delete count[k];
    e.sfx(cue, 1, 0);
    out.nodes[cue] = Object.values(count).reduce((a, b) => a + b, 0);
  }
  return out;
}
'''


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', args=[
            '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
            '--autoplay-policy=no-user-gesture-required'])
        page = browser.new_page(viewport={'width': 900, 'height': 700})
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.goto(URL, wait_until='load')
        page.wait_for_function('() => !!(window.PB && PB.World && PB.buildTable)', timeout=60000)
        ev = page.evaluate(JS)
        browser.close()

    events, nodes = ev['events'], ev['nodes']
    play = events['ordinaryPlay']

    def cues(name):
        return events[name]

    print('cue cost, counted through the real engine:')
    for cue, n in sorted(nodes.items(), key=lambda kv: -kv[1]):
        print('   %-9s %2d nodes per voice' % (cue, n))
    print()
    print('one simulated second (180 substeps):')
    for name in ('cleanStrike', 'heldAgainstBumper', 'pressedIntoBumper',
                 'skimmingWall', 'pressedIntoWall'):
        row = cues(name)
        print('   %-20s %s' % (name, row if row else '{}'))
    print('   %-20s %s' % ('ordinary play (8 shots)', play['total']))
    print()

    fires_per_second = nodes['bumper'] * 180
    failures = []
    if cues('cleanStrike').get('bumper', 0) != 1:
        failures.append('a clean strike must fire exactly one bumper cue (got %r)'
                        % cues('cleanStrike').get('bumper', 0))
    for name in ('heldAgainstBumper', 'pressedIntoBumper', 'skimmingWall'):
        row = cues(name)
        if row:
            failures.append('%s still fires at the substep rate: %r' % (name, row))
    wall = cues('pressedIntoWall').get('wall', 0)
    if wall > 13:
        failures.append('pressedIntoWall fired %d cues in a second (cooldown is 0.08 s -> 12)' % wall)
    if wall == 0:
        failures.append('pressedIntoWall fired nothing: real impacts must still sound')
    for cue in ('bumper', 'post', 'standup', 'sling', 'target', 'wall', 'spinner'):
        if not play['total'].get(cue):
            failures.append('ordinary play produced no %r at all -- the gate silenced it' % cue)
    hurt = [s for s in play['perShot'] if s['events'] > 200]
    if hurt:
        failures.append('a single 4 s shot still produced %s events' % [s['events'] for s in hurt])

    print('if a ball could sit in contact, the cues it would build: %d nodes/s' % fires_per_second)
    if errs:
        print('page errors:', errs[:4])
    if failures:
        print('\nFAIL')
        for f in failures:
            print('  ' + f)
        return 1
    print('\nPASS  (one contact as long as you like, one cue per strike)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
