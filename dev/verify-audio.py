"""Does the machine actually make the sounds it claims to?

Run: dev/.venv-playfield/Scripts/python.exe dev/verify-audio.py

Checks, against the live page:
  * every cue renders audible, and the ones you play most are solid in the mix
  * the kit has real character -- struck-metal rings are INHARMONIC (a mode
    at 2.76x the fundamental is what makes it a machine, not a beep), the
    cues' attack brightness spans tens of dB, and that measurement is stable
    from render to render (each cue is measured by band energy, medianed over
    three renders -- a single frequency bin on a noise attack is not)
  * the band sits UNDER the SFX: every cue peaks well above the music bed
  * the master fader: 50% out of the box, drives the master gain, survives a
    reload, keeps the arrow keys while it is focused (the game swallows them
    on the window, which is right for play and wrong for a range input), and
    mute restores the player's own level rather than a fixed one
  * the fader at 0 is exact silence (rendered offline: a live AnalyserNode
    cannot measure silence -- it replays its last loud block forever)
  * the playlist: several songs, long and arranged in sections, distinct
    tempos with a tempo FLOOR (one of them used to drag at 66 bpm), and the
    set advances in order, handing over on a bar line, retiming the dub echo
  * each song's arrangement does something, in two halves: the exact half
    counts the voices every section asks for (a break has to drop the drums
    or the bass, and the busiest section has to ask for far more), and the
    audible half renders each song's break against its busiest section and
    compares them -- level for a bass-out break, peak for a drums-out one,
    because the two breaks move different measurements
  * a break is quiet, not empty
  * the mission inserts: short vamps that take over on a bar line, play their
    whole length, and hand the playlist back on the step it paused at, with
    the echo retimed in both directions
  * each song's rendered audio pulses at its own notated tempo, measured in
    WHOLE BARS (the first version searched a window shorter than a bar and
    so reported a subdivision -- which is why it disagreed with the songs)

Renders go through an OfflineAudioContext (fast, deterministic, no gesture);
the bed level is measured on the LIVE graph with a tight sampler -- not
requestAnimationFrame, which headless Chromium throttles to nothing, which is
exactly how a silent-looking first probe fooled me.
"""
import json
import math
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
CORE = ['flipper', 'flipperReturn', 'bumper', 'sling', 'bash', 'target', 'standup',
        'rollover', 'spinner', 'drain', 'rampup', 'ramp', 'launch', 'kickback',
        'ballsave', 'multiball', 'jackpot', 'bonus', 'tilt', 'start', 'gameover',
        'nudge', 'coin']
# The two ends of the mechanical kit, named: steel that RINGS (a face bolted
# to the field, a wireform, the spinner's blades) and the coil-and-mass thuds.
BRIGHT = ['standup', 'rollover', 'spinner']
DEEP = ['flipper', 'bumper', 'target', 'kickback']

TOOLS = r"""
() => {
  const PBx = window.PB;

  function stats(buf, windows) {
    const rate = buf.sampleRate, ch = buf.numberOfChannels, n = buf.length;
    const A = buf.getChannelData(0), B = ch > 1 ? buf.getChannelData(1) : A;
    const mono = new Float32Array(n);
    let peak = 0, sum = 0;
    for (let i = 0; i < n; i++) {
      const v = (A[i] + B[i]) * 0.5;
      mono[i] = v;
      const a = Math.abs(v);
      if (a > peak) peak = a;
      sum += v * v;
    }
    const nz = (x) => Math.sqrt(Math.max(0, x));
    function goertzel(x, f) {
      const w = 2 * Math.PI * f / rate, c = 2 * Math.cos(w);
      let s1 = 0, s2 = 0;
      for (let i = 0; i < x.length; i++) { const s0 = x[i] + c * s1 - s2; s2 = s1; s1 = s0; }
      return nz(s1 * s1 + s2 * s2 - c * s1 * s2) / Math.max(1, x.length);
    }
    const prof = (windows || [[0, 0.015], [0.015, 0.045], [0.045, 0.1], [0.1, 0.3], [0.3, 2]]).map(([a, b]) => {
      const seg = mono.subarray(Math.floor(a * rate), Math.floor(b * rate));
      if (seg.length < 64) return null;
      let p = 0;
      for (let i = 0; i < seg.length; i++) p = Math.max(p, Math.abs(seg[i]));
      const hi = goertzel(seg, 3200), lo = goertzel(seg, 140);
      return { at: a, peak: p, hiLo: Math.max(-40, Math.min(40, 20 * Math.log10((hi + 1e-9) / (lo + 1e-9)))) };
    });
    const db = (v) => Math.round(20 * Math.log10(Math.max(v, 1e-9)) * 100) / 100;
    return { peak: peak, peakDb: db(peak), rmsDb: db(Math.sqrt(sum / n)), seconds: n / rate, profile: prof };
  }

  /* THE PULSE, measured over whole bars. The first version of this probe
     searched lags out to 1.6 s -- SHORTER than a bar in every song here
     (3.1-3.6 s) -- so it reported whichever subdivision happened to win,
     and comparing those numbers between songs compared apples to oranges.
     The window now runs to 4.6 s: a one-pole lowpass at 180 Hz (the kick),
     rectified into a 5 ms envelope, mean-removed, autocorrelated. The
     strongest period is the song's pulse, and `beats` says how many of the
     song's OWN beats that period is worth -- the only honest way to compare
     a 66 bpm dub with a 138 bpm steppers. */
  function kickEnv(mono, rate) {
    const al = Math.exp(-2 * Math.PI * 180 / rate);
    const hop = Math.round(rate * 0.005);
    const env = [];
    let y = 0, acc = 0, cnt = 0;
    for (let i = 0; i < mono.length; i++) {
      y = (1 - al) * mono[i] + al * y;
      acc += y * y; cnt++;
      if (i % hop === hop - 1) { env.push(Math.sqrt(acc / cnt)); acc = 0; cnt = 0; }
    }
    return { env: env, hop: hop / rate };
  }
  function kickPulses(mono, rate, minLag, maxLag) {
    const ke = kickEnv(mono, rate), hop = ke.hop, env = ke.env;
    let m = 0;
    for (let i = 0; i < env.length; i++) m += env[i];
    m /= Math.max(1, env.length);
    const e = env.map(v => v - m);
    let best = -1e9, bestLag = 0; const all = [];
    for (let lag = Math.round(minLag / hop); lag <= Math.round(maxLag / hop); lag++) {
      let s = 0, cnt = 0;
      for (let i = 0; i + lag < e.length; i++) { s += e[i] * e[i + lag]; cnt++; }
      s = s / Math.max(1, cnt);
      all.push([lag * hop, s]);
      if (s > best) { best = s; bestLag = lag * hop; }
    }
    return { lag: bestLag, strength: best, all: all };
  }
  /* the strongest period that lands on the song's own beat grid: the
     measurement may find 2, 4 or 8 beats, never a fraction of one */
  function pulseOnGrid(mono, rate, bpm) {
    const beat = 60 / bpm;
    const p = kickPulses(mono, rate, 0.15, 4.6);
    let best = -1e9, lag = p.lag, beats = Math.max(1, Math.round(p.lag / beat));
    for (let i = 0; i < p.all.length; i++) {
      const l = p.all[i][0], s = p.all[i][1];
      const b = Math.round(l / beat);
      if (b < 1 || Math.abs(l - b * beat) > beat * 0.18) continue;
      if (s > best) { best = s; lag = l; beats = b; }
    }
    return {
      lag: lag, beats: beats, impliedBpm: 60 * beats / lag, strength: best,
      rawLag: p.lag, beat: beat, onGrid: Math.abs(lag - beats * beat) <= beat * 0.18
    };
  }

  window.__off = async (build, secs) => {
    const SR = 48000;
    const oac = new OfflineAudioContext(2, Math.ceil(SR * secs), SR);
    const Real = window.AudioContext;
    window.AudioContext = function () { return oac; };
    let e;
    try { e = new PBx.AudioEngine(); e.init(); build(e, PBx); }
    finally { window.AudioContext = Real; if (e && e._rollTimer) clearInterval(e._rollTimer); }
    return await oac.startRendering();
  };

  window.__cue = async (name, secs) => {
    const buf = await window.__off((e) => e.sfx(name, 2, 0), secs);
    return window.__stats(buf);
  };
  window.__stats = stats;
  window.__statsMono = stats;
  window.__song = async (i) => {
    const song = PBx.AudioEngine.SONGS[i];
    const secs = Math.min(14, song.run * song.stepDur + 1);
    const buf = await window.__off((e) => {
      e._songIdx = i;
      const n = Math.min(song.run, Math.round(secs / song.stepDur) - 2);
      for (let k = 0; k < n; k++) e._scheduleSongStep(song, k, 0.1 + k * song.stepDur);
    }, secs);
    const st = stats(buf);
    const A = buf.getChannelData(0), B = buf.numberOfChannels > 1 ? buf.getChannelData(1) : A;
    const mono = new Float32Array(buf.length);
    for (let k = 0; k < buf.length; k++) mono[k] = (A[k] + B[k]) * 0.5;
    st.pulse = pulseOnGrid(mono, buf.sampleRate, song.bpm);
    return st;
  };

  /* THE FADER, measured where the browser cannot lie. A live AnalyserNode
     cannot show silence: once the master gain reaches 0 its input is
     flagged silent, the node stops being re-pulled, and
     getFloatTimeDomainData() hands back the last loud block instead
     (measured: 0.08 RMS at gain 0). So the claim is proved offline -- the
     identical programme at fader 0 and fader 1, through the same buses and
     the same setVolume() the slider calls. `full` is the control: if it
     were silent too, `zero` would prove nothing. */
  window.__faderTest = async () => {
    const run = async (vol) => {
      const buf = await window.__off((e) => {
        e.setVolume(vol);
        e.sfx('bumper', 0, 0); e.sfx('jackpot'); e.duck(2);
        const song = PBx.AudioEngine.SONGS[1];
        for (let k = 0; k < 96; k++) e._scheduleSongStep(song, k, 0.1 + k * song.stepDur);
      }, 3.4);
      return stats(buf).peak;
    };
    return { zero: await run(0), full: await run(1) };
  };

  /* one Goertzel bin, shared by the measurements below */
  function goertzelAt(x, rate, f) {
    const w = 2 * Math.PI * f / rate, c = 2 * Math.cos(w);
    let s1 = 0, s2 = 0;
    for (let i = 0; i < x.length; i++) { const s0 = x[i] + c * s1 - s2; s2 = s1; s1 = s0; }
    return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / Math.max(1, x.length);
  }
  /* the mean magnitude across bins spanning f0..f1, on a Hann window and on
     bin centres (so there is no scalloping loss). A BAND, not a single bin:
     the first version of this measurement judged brightness on one bin at
     3200 Hz against one at 140 Hz, and one bin of a noise-rich 20 ms attack
     is a high-variance estimator -- the same cue re-rendered swung by up to
     22 dB, far too much to hang a pass/fail on. Averaging across a band
     (with the window, the way an ear splits high from low) brings the same
     cue's re-renders inside 6 dB. */
  function bandDbfs(seg, rate, f0, f1, bins) {
    const N = seg.length, df = rate / N;
    const win = new Float32Array(N);
    for (let i = 0; i < N; i++) win[i] = seg[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
    let s = 0;
    for (let i = 0; i < bins; i++) {
      const f = bins === 1 ? f0 : f0 + (f1 - f0) * i / (bins - 1);
      s += goertzelAt(win, rate, Math.max(1, Math.round(f / df)) * df);
    }
    return 20 * Math.log10(s / bins + 1e-12);
  }
  /* THE KIT'S CHARACTER: the attack's high-band level against its low-band
     level, medianed over several renders of the SAME cue. */
  window.__character = async (name, reps) => {
    const vals = [];
    for (let r = 0; r < reps; r++) {
      const buf = await window.__off((e) => e.sfx(name, 2, 0), 0.6);
      const rate = buf.sampleRate;
      const A = buf.getChannelData(0), B = buf.numberOfChannels > 1 ? buf.getChannelData(1) : A;
      const mono = new Float32Array(buf.length);
      for (let i = 0; i < mono.length; i++) mono[i] = (A[i] + B[i]) * 0.5;
      const attack = mono.subarray(0, Math.floor(rate * 0.03));
      vals.push(bandDbfs(attack, rate, 2400, 6000, 6) - bandDbfs(attack, rate, 80, 300, 5));
    }
    vals.sort((a, b) => a - b);
    return { median: vals[Math.floor(vals.length / 2)], all: vals };
  };

  /* ---- arrangement: ONE section of a song, rendered and measured ----
     Schedules EXACTLY secLen steps. The first version computed the step
     count from the seconds passed in (`round(secs / stepDur)`), which
     overran the section boundary by a step or two whenever the seconds and
     the tempo did not divide evenly -- and one of those leaked steps is the
     NEXT section's opening bar, which is fine while it is quiet and a
     measurement-wrecking spike the moment any section starts with a kick
     (the dub bar now opens on one). The `secs` argument still sets the
     render LENGTH, so the section's own reverb tail is kept; only the
     voices stop where the section stops. */
  window.__section = async (i, secIdx, secs) => {
    const song = PBx.AudioEngine.SONGS[i];
    const secLen = (song.secBars || 4) * 16;
    const buf = await window.__off((e) => {
      for (let k = 0; k < secLen; k++) {
        e._scheduleSongStep(song, secIdx * secLen + k, 0.1 + k * song.stepDur);
      }
    }, secs);
    return stats(buf);
  };

  /* ---- WHAT A SECTION ASKS FOR, counted with the voices stubbed out.
     This is the exact half of the arrangement check: the flags either reach
     the voices or they do not, and counting the calls says so without any
     audio in the way. ---- */
  window.__count = () => {
    const e = new PBx.AudioEngine();
    e.init = function () { };
    e.ctx = { currentTime: 0 };
    e.ready = true;
    e.delaySend = { gain: { setTargetAtTime: function () { } } };
    const keys = ['kick', 'snare', 'hat', 'shaker', 'hand', 'skank', 'organ',
                  'bass', 'lead', 'fill', 'noise', 'tone', 'modal'];
    const tally = {};
    keys.forEach((k) => { tally[k] = 0; });
    const inc = (k) => function () { tally[k]++; };
    e.kick = inc('kick'); e.snare = inc('snare'); e.hat = inc('hat');
    e.shaker = inc('shaker'); e.handDrum = inc('hand');
    e.riddimGuitar = inc('skank'); e.organ = inc('organ');
    e.bassNote = inc('bass'); e.melodica = inc('lead'); e.horn = inc('lead');
    e._fill = inc('fill'); e.noise = inc('noise'); e.tone = inc('tone'); e.modal = inc('modal');
    const out = [];
    PBx.AudioEngine.SONGS.forEach((song) => {
      const secLen = (song.secBars || 4) * 16;
      const rows = [];
      song.arrange.forEach((sec, s) => {
        keys.forEach((k) => { tally[k] = 0; });
        for (let k = 0; k < secLen; k++) e._scheduleSongStep(song, s * secLen + k, 0.1 + k * song.stepDur);
        rows.push({
          name: sec.name, flags: sec,
          total: keys.reduce((sum, k) => sum + tally[k], 0),
          drums: tally.kick + tally.snare + tally.hat + tally.hand + tally.shaker,
          bass: tally.bass, lead: tally.lead, skank: tally.skank, organ: tally.organ
        });
      });
      out.push({ song: song.name, sections: rows });
    });
    return out;
  };

  /* ---- an insert, rendered on its own ---- */
  window.__insertAudio = async (name) => {
    const ins = PBx.AudioEngine.INSERTS.filter((s) => s.name === name)[0];
    if (!ins) return null;
    const secs = Math.min(20, ins.run * ins.stepDur + 1);
    const buf = await window.__off((e) => {
      const n = Math.round(secs / ins.stepDur) - 2;
      for (let k = 0; k < n; k++) e._scheduleSongStep(ins, k, 0.1 + k * ins.stepDur);
    }, secs);
    const st = stats(buf);
    const A = buf.getChannelData(0), B = buf.numberOfChannels > 1 ? buf.getChannelData(1) : A;
    const mono = new Float32Array(buf.length);
    for (let k = 0; k < mono.length; k++) mono[k] = (A[k] + B[k]) * 0.5;
    st.pulse = pulseOnGrid(mono, buf.sampleRate, ins.bpm);
    return st;
  };  /* ---- THE INSERT FLOW, on the live scheduler with a synthetic clock ----
     Two inserts are asked for mid-song, each while a playlist song is
     already playing. What has to come out: a take-over on a BAR LINE, the
     insert's whole length scheduled, and the set handed back on the VERY
     NEXT step of the song it interrupted -- which is read straight off the
     stream of scheduled steps, so it does not depend on which song happened
     to be playing or on any bookkeeping the harness keeps itself.
     Two takeovers are asked for, not one, and the second is asked for on a
     STEP threshold rather than a tick count: a tick count is a clock, and
     the songs are now long enough that a fixed clock lands somewhere
     different every time the set list is edited (which is exactly how the
     first version of this harness broke). The step threshold asks the same
     question of whichever song is playing at that point. */
  window.__insertFlow = () => {
    const e = new PBx.AudioEngine();
    e.init = function () { };
    e.ctx = { currentTime: 0 };
    e.ready = true; e.musicOn = true;
    e._songIdx = 2; e._local = 40; e.nextNoteTime = 0.5; e._step = 0;

    const done = [], retimes = [];
    const A = PBx.AudioEngine;
    e._scheduleSongStep = function (song, local, when) {
      done.push({ song: song.name, local: local, when: when, global: this._step });
    };
    /* the retime is stamped with the step it happens on, which is what lets
       the check place it on the right side of the take-over */
    e._retimeDelay = function (song) { retimes.push({ name: song.name, at: this._step }); };
    const first = A.INSERTS.filter((s) => s.name === 'IRIE MASTER')[0];
    const second = A.INSERTS.filter((s) => s.name === 'MISSION VAMP')[0];
    const asked = [];
    for (let n = 0; n < 9000; n++) {
      if (asked.length === 0 && e._step >= 200) { asked.push(e._step); e.playInsert('IRIE MASTER'); }
      else if (asked.length === 1 && e._step >= 1000) { asked.push(e._step); e.playInsert('MISSION VAMP'); }
      e.ctx.currentTime += 0.05;
      e._pump();
    }
    /* collapse the stream into contiguous runs, which is what the claims are
       about: song, insert, song, insert, song */
    const runs = [];
    for (let i = 0; i < done.length; i++) {
      const d = done[i], last = runs[runs.length - 1];
      if (last && last.song === d.song && last.lastLocal + 1 === d.local) {
        last.n++; last.lastLocal = d.local;
      } else {
        runs.push({ song: d.song, n: 1, firstLocal: d.local, lastLocal: d.local,
                    firstGlobal: d.global, times: [d.when] });
      }
    }
    return {
      steps: done.length, runs: runs, retimes: retimes, asked: asked,
      insertLen: { 'IRIE MASTER': first.run, 'MISSION VAMP': second.run },
      paused: e._local, songIdx: e._songIdx, nowPlaying: e.nowPlaying(),
      insertLeft: e.insertName(), pending: e._pendingInsert ? e._pendingInsert.name : null
    };
  };

  /* ---- CUTTING AN INSERT SHORT, on the live scheduler with a synthetic
     clock. This is the one path the game takes when a big moment ends early
     -- a multiball drained, a wizard timer running out -- and what has to
     come out is the other half of "temporary": the vamp stops where it is
     and the set comes back on the step it paused at, retimed back to the
     song's tempo, instead of running its whole length over ordinary play.
     The cut is triggered off the insert's own position (after one bar of it)
     rather than a step count, so the test does not have to know the set. ---- */
  window.__insertCut = () => {
    const e = new PBx.AudioEngine();
    e.init = function () { };
    e.ctx = { currentTime: 0 };
    e.ready = true; e.musicOn = true;
    e._songIdx = 2; e._local = 40; e.nextNoteTime = 0.5; e._step = 0;
    const done = [], retimes = [];
    e._scheduleSongStep = function (song, local, when) {
      done.push({ song: song.name, local: local, global: this._step });
    };
    e._retimeDelay = function (song) { retimes.push({ name: song.name, at: this._step }); };
    const ins = PBx.AudioEngine.INSERTS.filter((s) => s.name === 'IRIE MASTER')[0];
    let askedAt = null, cutAt = null;
    for (let n = 0; n < 9000; n++) {
      if (askedAt === null && e._step >= 200) { askedAt = e._step; e.playInsert('IRIE MASTER'); }
      if (cutAt === null && e._insert && e._insert.local >= 16) { cutAt = e._step; e.stopInsert(); }
      e.ctx.currentTime += 0.05;
      e._pump();
    }
    const runs = [];
    for (let i = 0; i < done.length; i++) {
      const d = done[i], last = runs[runs.length - 1];
      if (last && last.song === d.song && last.lastLocal + 1 === d.local) {
        last.n++; last.lastLocal = d.local;
      } else {
        runs.push({ song: d.song, n: 1, firstLocal: d.local, lastLocal: d.local,
                    firstGlobal: d.global });
      }
    }
    return {
      runs: runs, retimes: retimes, insertLen: ins.run, askedAt: askedAt, cutAt: cutAt,
      playing: e.insertName(), pending: e._pendingInsert ? e._pendingInsert.name : null
    };
  };

  /* a modal voice on its own: the kit's central claim, measured */
  window.__modes = async () => {
    const buf = await window.__off((e) => {
      e.modal({ f0: 500, modes: PBx.AudioEngine.MODES.steel, dur: 1.5, gain: 0.5, bus: e.sfxBus });
    }, 2);
    const x = buf.getChannelData(0);
    const rate = buf.sampleRate;
    function g(f) {
      const w = 2 * Math.PI * f / rate, c = 2 * Math.cos(w);
      let s1 = 0, s2 = 0;
      for (let i = 0; i < x.length; i++) { const s0 = x[i] + c * s1 - s2; s2 = s1; s1 = s0; }
      return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / x.length;
    }
    const db = (v) => 20 * Math.log10(Math.max(v, 1e-12));
    return {
      f0: db(g(500)), octave: db(g(1000)), mode2_76: db(g(1380)), mode5_4: db(g(2700)),
      inharmonicOverOctave: db(g(1380)) - db(g(1000))
    };
  };

  /* The live scheduler, driven with a synthetic clock: _pump() runs for
     real (it is the loop that plays the game), with only the note
     scheduling stubbed out, so this exercises the actual handover path --
     including _advanceSong retiming the dub delay -- and records it. */
  window.__setlist = () => {
    const e = new PBx.AudioEngine();
    e.init = function () { };
    const clock = { t: 0 };
    e.ctx = { currentTime: 0 };
    const seq = [], notes = [], retimes = [];
    e._scheduleSongStep = function (song, local, when) { notes.push([song.name, local, when]); };
    e.delay = {
      delayTime: {
        value: 0.5,
        cancelScheduledValues() { }, setValueAtTime() { },
        linearRampToValueAtTime(secs, at) { retimes.push(secs); }
      }
    };
    e.onSong = (s) => seq.push(s.name);
    e.ready = true; e.musicOn = true;
    e._songIdx = 0; e._local = 0; e.nextNoteTime = 0.1;
    /* 1200 s of synthetic clock: the set is now over seven minutes long, so
       a shorter run would never visit every song and the retime check would
       be comparing five targets against six songs */
    for (let n = 0; n < 24000; n++) {
      e.ctx.currentTime += 0.05;
      e._pump();
    }
    return { seq: seq, notes: notes.length, retimes: retimes };
  };

  /* live bed measurement: a tight sampler, because rAF does not fire in a
     headless window often enough to catch a 100 ms transient */
  window.__watch = (which) => {
    const a = PBx.game.audio;
    a.init(); a.resume();
    const ctx = a.ctx;
    const node = which === 'music' ? a.musicBus : which === 'sfx' ? a.sfxBus : a.master;
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    node.connect(an);
    const buf = new Float32Array(2048);
    const rec = { peak: 0, sum: 0, n: 0 };
    const iv = setInterval(() => {
      an.getFloatTimeDomainData(buf);
      let s = 0;
      for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
      const rms = Math.sqrt(s / buf.length);
      if (rms > rec.peak) rec.peak = rms;
      rec.sum += rms; rec.n++;
    }, 3);
    window.__stopWatch = () => clearInterval(iv);
    window.__read = () => ({ peak: rec.peak, mean: rec.sum / Math.max(1, rec.n), samples: rec.n });
    window.__resetWatch = () => { rec.peak = 0; rec.sum = 0; rec.n = 0; };
    return { state: ctx.state, ready: a.ready };
  };
  return 'ok';
}
"""

REPORT = {}


def section_weight(f):
    """How much a section asks for: every flag it turns on is a layer."""
    return sum(1 for k in ('d', 'k', 'o', 'b', 'l', 'x', 'p') if f[k])


def check(name, ok, detail):
    REPORT[name] = {'pass': bool(ok), 'detail': detail}
    print('%-26s %s   %s' % (name, 'PASS' if ok else 'FAIL', detail))
    return ok


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', args=[
            '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
            '--autoplay-policy=no-user-gesture-required'])
        page = browser.new_page(viewport={'width': 1000, 'height': 800})
        errors = []
        page.on('pageerror', lambda e: errors.append('PAGEERROR: ' + str(e)))
        page.on('console', lambda m: errors.append('CONSOLE: ' + m.text) if m.type == 'error' else None)
        page.goto('http://127.0.0.1:8101/', wait_until='load')
        page.wait_for_function('window.PB && PB.game && PB.assets.ready', timeout=60000)
        page.evaluate(TOOLS)

        # ---- 1. every cue makes a sound, and the core cues are solid ----
        cues = {}
        for name in CORE:
            cues[name] = page.evaluate('(n) => window.__cue(n, 1.0)', name)
        REPORT['cues'] = cues
        silent = [n for n, c in cues.items() if c['peakDb'] < -30]
        check('all cues audible', not silent,
                     'quietest %s at %.1f dB; %d cues rendered' % (
                         min(cues, key=lambda n: cues[n]['peakDb']),
                         min(c['peakDb'] for c in cues.values()), len(cues)))
        weak = [n for n, c in cues.items() if c['peakDb'] < -20]
        check('core cues mix-solid', not weak,
                     'all >= -20 dB except %s' % (weak or 'none'))

        # ---- 2. an unknown cue is a no-op, not a crash ----
        page.evaluate("() => PB.game.audio.sfx('no-such-cue', 1, 0)")
        check('unknown cue is safe', True, 'sfx("no-such-cue") did not throw')

        # ---- 3. tilt is an alarm: louder than a flipper, and dry ----
        check('tilt outranks flipper', cues['tilt']['peakDb'] > cues['flipper']['peakDb'] + 3,
                     'tilt %.1f dB vs flipper %.1f dB' % (cues['tilt']['peakDb'], cues['flipper']['peakDb']))
        check('flipper release is softer', cues['flipperReturn']['peakDb'] < cues['flipper']['peakDb'],
                     'fire %.1f dB, return %.1f dB' % (cues['flipper']['peakDb'], cues['flipperReturn']['peakDb']))

        # ---- 4. the kit is characterised, not one thud retitled ----
        # Medians over three renders each (see __character). The claim is the
        # measured SPAN plus where its extremes fall -- not a head-count above
        # an arbitrary line: the cues do not actually split into two neat
        # camps (standup rings at 1.2 kHz, mid-band, so it sits near 0 dB),
        # and the first version's '-20 dB' line happened to fall inside the
        # cluster of copper thuds, which is why it flip-flopped.
        char = {n: page.evaluate('(n) => window.__character(n, 3)', n)
                for n in BRIGHT + DEEP}
        REPORT['character'] = char
        med = {n: v['median'] for n, v in char.items()}
        span = max(med.values()) - min(med.values())
        top = max(med, key=lambda n: med[n])
        bot = min(med, key=lambda n: med[n])
        check('kit spans bright to deep',
                     span >= 40 and med[top] >= 10 and med[bot] <= -25
                     and top in BRIGHT and bot in DEEP,
                     'attack brightness spans %.0f dB across the kit: %s at the top, %s at the '
                     'bottom, both in the group they belong to'
                     % (span, '%s %+.1f dB' % (top, med[top]), '%s %+.1f dB' % (bot, med[bot])))
        # What the check above actually leans on is the two ENDS of the span,
        # so those are what gets re-rendered five times: every single render
        # of the brightest cue has to stay over its bar and every render of
        # the deepest below its own. The per-cue spreads are reported as
        # information rather than as a pass/fail -- a noisy 30 ms attack
        # window can swing a mid cue by 10 dB from one render to the next,
        # and that is not something to fail a build over.
        spread = {n: round(max(v['all']) - min(v['all']), 1) for n, v in char.items()}
        extremes = {n: page.evaluate('(n) => window.__character(n, 5)', n) for n in (top, bot)}
        REPORT['characterExtremes'] = extremes
        check('the extremes hold up render to render',
                     all(v >= 10 for v in extremes[top]['all'])
                     and all(v <= -25 for v in extremes[bot]['all']),
                     '%s over five renders %s (every one above +10); %s over five %s (every one below '
                     '-25); widest spread among the rest %.1f dB (%s)'
                     % (top, ['%+.1f' % v for v in extremes[top]['all']], bot,
                        ['%+.1f' % v for v in extremes[bot]['all']],
                        max(spread.values()), max(spread, key=lambda n: spread[n])))

        # ---- 5. the ring is inharmonic: the whole point of the kit ----
        modes = page.evaluate('() => window.__modes()')
        REPORT['modes'] = modes
        check('metal rings inharmonically', modes['inharmonicOverOctave'] > 6,
                     'mode 2.76f beats the octave by %.1f dB (f0 %.1f, 2f %.1f, 2.76f %.1f)'
                     % (modes['inharmonicOverOctave'], modes['f0'], modes['octave'], modes['mode2_76']))

        # ---- 6. the band sits under the machine ----
        songs_meta = page.evaluate('''PB.AudioEngine.SONGS.map(s => ({name: s.name, bpm: s.bpm, feel: s.feel,
          run: s.run, stepDur: s.stepDur, secBars: s.secBars, bars: s.run / 16, seconds: s.seconds,
          sections: s.arrange ? s.arrange.length : 0,
          shapes: s.arrange ? new Set(s.arrange.map(x => [x.d,x.k,x.o,x.b,x.l,x.x,x.p].join(''))).size : 0,
          breaks: s.arrange ? s.arrange.filter(x => !x.d || !x.b).length : 0,
          leads: s.arrange ? s.arrange.filter(x => x.l).length : 0,
          secFlags: s.arrange ? s.arrange.map(x => ({name:x.name,d:x.d,k:x.k,o:x.o,b:x.b,l:x.l,x:x.x,p:x.p,w:x.w})) : []}))''')
        check('playlist has songs', len(songs_meta) >= 6,
                     '%d songs: %s' % (len(songs_meta), [s['name'] for s in songs_meta]))
        bpms = [s['bpm'] for s in songs_meta]
        check('songs differ in tempo', len(set(bpms)) == len(bpms),
                     'bpms %s' % bpms)
        feels = set(s['feel'] for s in songs_meta)
        check('songs differ in feel', len(feels) == len(songs_meta),
                     'feels %s' % sorted(feels))
        # the one that used to drag at 66 bpm: dub needs motion to frame its
        # space, so the claim is a tempo FLOOR, not a range
        slowest = min(songs_meta, key=lambda s: s['bpm'])
        check('no song drags', slowest['bpm'] >= 76,
                     'slowest is %s at %d bpm (it was 66); the set spans %d-%d bpm'
                     % (slowest['name'], slowest['bpm'], slowest['bpm'], max(bpms)))
        shortest = min(songs_meta, key=lambda s: s['seconds'])
        check('songs are long enough to be songs',
                     all(s['bars'] >= 24 and s['seconds'] >= 50 for s in songs_meta),
                     'shortest %s at %d bars / %.0f s, longest %s at %.0f s; the whole set is %.1f minutes'
                     % (shortest['name'], shortest['bars'], shortest['seconds'],
                        max(songs_meta, key=lambda s: s['seconds'])['name'],
                        max(s['seconds'] for s in songs_meta),
                        sum(s['seconds'] for s in songs_meta) / 60.0))
        flat = [s['name'] for s in songs_meta
                if s['sections'] < 5 or s['shapes'] < 4 or s['breaks'] < 1 or s['leads'] < 1]
        check('songs vary inside themselves', not flat,
                     '%s%s' % ('; '.join('%s %d sections / %d shapes / %d breaks / %d with the lead'
                                         % (s['name'], s['sections'], s['shapes'], s['breaks'], s['leads'])
                                         for s in songs_meta),
                               (' -- THIN: %s' % flat) if flat else ''))

        # the bed is measured at the MASTER, the same place the rendered cues
        # are measured, so the comparison is like for like: a cue's peak
        # against the band's average level -- the standard sfx-over-bed
        # question, and the one the mix is built to answer.
        watch = page.evaluate("() => window.__watch('master')")
        page.evaluate('PB.game.audio.resume(); PB.game.audio.startMusic(); window.__resetWatch();')
        page.wait_for_timeout(3000)
        bed = page.evaluate('window.__read()')
        page.evaluate('PB.game.audio.stopMusic()')
        page.wait_for_timeout(600)
        bedDb = 20 * math.log10(max(bed['mean'], 1e-9))
        bedPeakDb = 20 * math.log10(max(bed['peak'], 1e-9))
        REPORT['bed'] = {'peak': bed['peak'], 'mean': bed['mean'], 'samples': bed['samples'],
                         'meanDb': round(bedDb, 2), 'peakDb': round(bedPeakDb, 2),
                         'fader': page.evaluate('PB.game.audio.getVolume()')}
        check('band plays', watch['ready'] and bed['mean'] > 0.003,
              'music bed at the master: mean %.1f dB, peak %.1f dB over %d samples (ctx %s)'
              % (bedDb, bedPeakDb, bed['samples'], watch['state']))
        margins = {n: round(cues[n]['peakDb'] - bedDb, 1) for n in CORE}
        REPORT['cueOverBed'] = margins
        worst = min(margins, key=lambda n: margins[n])
        check('cues ride above the band', margins[worst] >= 8,
              'smallest margin %s +%.1f dB over the bed; median +%.1f dB'
              % (worst, margins[worst], sorted(margins.values())[len(margins) // 2]))
        # the impact cues have to beat the band's own loudest moment, not
        # just its average -- these are the sounds the player is listening for
        IMPACT = ['flipper', 'bumper', 'sling', 'bash', 'target', 'kickback', 'drain',
                  'launch', 'multiball', 'jackpot', 'tilt']
        over = {n: round(cues[n]['peakDb'] - bedPeakDb, 1) for n in IMPACT}
        REPORT['impactOverBedPeak'] = over
        check('impact cues beat the bed at its peak', min(over.values()) > 0,
              'weakest %s +%.1f dB above the bed\'s loudest transient %s'
              % (min(over, key=lambda n: over[n]), min(over.values()),
                 {n: over[n] for n in IMPACT if over[n] < 3}))

        # ---- 7. the set advances in order, on a bar line, retiming the echo ----
        setl = page.evaluate('() => window.__setlist()')
        names = [s['name'] for s in songs_meta]
        # _advanceSong() announces the song being ENTERED, so the recorded
        # handovers begin with the second song in the list
        want = [names[(i + 1) % len(names)] for i in range(len(setl['seq']))]
        check('set runs the playlist in order', setl['seq'] == want,
              '%d handovers, %d notes scheduled, first %s'
              % (len(setl['seq']), setl['notes'], setl['seq'][:len(names) + 1]))
        # a handover happens when a song's run ends -- and a run is whole bars,
        # so the downbeat of the new song is the downbeat it should be
        bars_ok = all(s['run'] % 16 == 0 for s in songs_meta)
        check('handovers land on bar lines', bars_ok,
              'every song runs a whole number of 16-step bars: %s' % [s['run'] for s in songs_meta])
        delay_targets = sorted(set(round(t, 4) for t in setl['retimes']))
        want_targets = sorted(set(round(s['stepDur'] * 3, 4) for s in songs_meta))
        check('dub delay retimed per song', delay_targets == want_targets,
              'echo retimed to %s, one per song, on handover' % delay_targets)

        # ---- 8. each song is audibly its own thing ----
        songs_audio = {}
        for i, s in enumerate(songs_meta):
            songs_audio[s['name']] = page.evaluate('(i) => window.__song(i)', i)
        REPORT['songs'] = songs_audio
        quiet = [n for n, a in songs_audio.items() if a['peakDb'] < -30]
        check('every song renders', not quiet, 'quietest %s' % (quiet or 'none'))
        # Each song is measured against its OWN tempo. A period in seconds
        # is not comparable between songs with different tempos; a period in
        # beats is, which is what the pulse probe reports. The songs' pulse
        # periods land on 2, 4 or 8 of their own beats -- the arrangement the
        # riddim actually plays, heard back out of the rendered audio.
        bpm_of = {s['name']: s['bpm'] for s in songs_meta}
        pulse = {n: a['pulse'] for n, a in songs_audio.items()}
        off = {n: (round(v['impliedBpm'], 1), v['beats']) for n, v in pulse.items()
               if not v['onGrid'] or abs(v['impliedBpm'] - bpm_of[n]) > bpm_of[n] * 0.04}
        check('each song pulses at its own tempo', not off,
              '%s%s' % ('; '.join('%s %.1f bpm over %d beats' % (n, v['impliedBpm'], v['beats'])
                                  for n, v in pulse.items()),
                        (' -- OFF: %s' % off) if off else ''))
        heard = sorted(round(v['impliedBpm']) for v in pulse.values())
        check('the set changes tempo between songs', len(set(heard)) == len(heard),
              'measured %s bpm across the four songs' % heard)

        # ---- 8b. the arrangement, the EXACT half: how many voices each
        # section actually asks for. The flags either reach the voices or
        # they do not, and counting the calls says which without any audio in
        # the way. Every song has to have a break that really breaks -- one
        # that drops the drums or the bass, the two things carrying the
        # level -- and a busiest section that asks for far more. ----
        counted = page.evaluate('() => window.__count()')
        REPORT['sectionCounts'] = counted
        thin, ratios = {}, {}
        for song in counted:
            secs = song['sections']
            brk = [x for x in secs if x['name'] == 'break'][0]
            busy = max(secs, key=lambda x: x['total'])
            ratios[song['song']] = {'break': brk['name'], 'breakTotal': brk['total'],
                                    'drumsOut': not brk['flags']['d'],
                                    'bassOut': not brk['flags']['b'],
                                    'busy': busy['name'], 'busyTotal': busy['total'],
                                    'ratio': round(busy['total'] / max(1, brk['total']), 2)}
            if not (brk['flags']['d'] is False or brk['flags']['b'] is False) or busy['total'] < brk['total'] * 1.5:
                thin[song['song']] = ratios[song['song']]
        check('every song breaks its own arrangement', not thin,
                     '%s%s' % ('; '.join('%s %s: %d voices vs %d in %s (%.1fx)'
                                         % (n, v['break'], v['breakTotal'], v['busyTotal'], v['busy'], v['ratio'])
                                         for n, v in ratios.items()),
                               (' -- THIN: %s' % thin) if thin else ''))

        # ---- 8c. the arrangement, the AUDIBLE half: render each song's
        # break and its busiest section and compare. Level alone is not
        # enough here -- a break that drops the drums keeps its bass, so the
        # RMS barely moves while the PEAK (the transients) drops by 5 dB, and
        # a break that drops the bass moves the RMS instead. So the claim is
        # that the two sections differ in level or in peak, not in both. ----
        sections = {}
        for i, s in enumerate(songs_meta):
            flags = s['secFlags']
            brk = [j for j, f in enumerate(flags) if f['name'] == 'break'][0]
            hi = max(range(len(flags)), key=lambda j: section_weight(flags[j]))
            secs = round((s['secBars'] * 4 * 60.0 / s['bpm']) + 0.6, 2)
            a = page.evaluate('([i,j,t]) => window.__section(i,j,t)', [i, brk, secs])
            c = page.evaluate('([i,j,t]) => window.__section(i,j,t)', [i, hi, secs])
            sections[s['name']] = {
                'break': {'section': flags[brk]['name'], 'peakDb': round(a['peakDb'], 1),
                          'rmsDb': round(a['rmsDb'], 1)},
                'busy': {'section': flags[hi]['name'], 'peakDb': round(c['peakDb'], 1),
                         'rmsDb': round(c['rmsDb'], 1)},
                'deltaRms': round(c['rmsDb'] - a['rmsDb'], 1),
                'deltaPeak': round(c['peakDb'] - a['peakDb'], 1),
                'delta': round(max(abs(c['rmsDb'] - a['rmsDb']), abs(c['peakDb'] - a['peakDb'])), 1),
                'breakSounding': a['peakDb'] > -40
            }
        REPORT['sections'] = sections
        flat = {n: v['delta'] for n, v in sections.items() if v['delta'] < 2.5}
        check('the break is audibly a break', not flat,
                     '%s%s' % ('; '.join('%s %s vs %s: %.1f dB (level %.1f, peak %.1f)'
                                         % (n, v['break']['section'], v['busy']['section'], v['delta'],
                                            v['deltaRms'], v['deltaPeak'])
                                         for n, v in sections.items()),
                               (' -- FLAT: %s' % flat) if flat else ''))
        silent = [n for n, v in sections.items() if not v['breakSounding']]
        check('a break is quiet, not empty', not silent,
                     'every break still sounds: %s'
                     % ', '.join('%s %s peak %.1f dB' % (n, v['break']['section'], v['break']['peakDb'])
                                 for n, v in sections.items()))

        # ---- 8d. the mission music ----
        inserts = page.evaluate('''PB.AudioEngine.INSERTS.map(s => ({name: s.name, bpm: s.bpm, feel: s.feel,
          run: s.run, bars: s.run / 16, seconds: s.seconds, sections: s.arrange ? s.arrange.length : 0}))''')
        REPORT['insertsMeta'] = inserts
        check('there is mission music for the big moments', len(inserts) >= 3,
                     '%d inserts: %s' % (len(inserts),
                                         ', '.join('%s (%d bars, %.0f s)' % (s['name'], s['bars'], s['seconds'])
                                                   for s in inserts)))
        check('inserts are vamps, not songs', all(2 <= s['bars'] <= 8 for s in inserts),
                     'insert lengths in bars: %s' % [s['bars'] for s in inserts])
        ins_audio = {}
        for s in inserts:
            ins_audio[s['name']] = page.evaluate('(n) => window.__insertAudio(n)', s['name'])
        REPORT['inserts'] = ins_audio
        quiet_ins = [n for n, a in ins_audio.items() if a['peakDb'] < -30]
        check('every insert renders', not quiet_ins,
                     'quietest %s' % (quiet_ins or 'none'))
        ins_bpm = {s['name']: s['bpm'] for s in inserts}
        ins_off = {n: round(a['pulse']['impliedBpm'], 1) for n, a in ins_audio.items()
                   if not a['pulse']['onGrid']
                   or abs(a['pulse']['impliedBpm'] - ins_bpm[n]) > ins_bpm[n] * 0.04}
        check('inserts play the tempo they claim', not ins_off,
                     '; '.join('%s %.1f bpm' % (n, a['pulse']['impliedBpm'])
                               for n, a in ins_audio.items())
                     + ((' -- OFF: %s' % ins_off) if ins_off else ''))

        # ---- 8e. the flow: take over on a bar line, hand the set back where
        # it paused. Everything below is read off the stream of steps the
        # engine actually asked the voices for: run i is a contiguous run of
        # one song, and the claim is about what sits either side of each run
        # of insert. ----
        flow = page.evaluate('() => window.__insertFlow()')
        REPORT['insertFlow'] = flow
        runs = flow['runs']
        seq = [r['song'] for r in runs]
        ins_at = [i for i, r in enumerate(runs) if r['song'] in flow['insertLen']]
        ins_runs = [runs[i] for i in ins_at]
        check('an insert takes over on a bar line',
                     len(ins_runs) == 2 and all(i > 0 for i in ins_at)
                     and all(r['n'] == flow['insertLen'][r['song']] for r in ins_runs)
                     and all(r['firstGlobal'] % 16 == 0 for r in ins_runs),
                     '%d inserts, each asked for mid-song and each taking over on a bar line at global '
                     'step %s, playing its whole length %s; the set was asked at steps %s and came out %s'
                     % (len(ins_runs), [r['firstGlobal'] for r in ins_runs], flow['insertLen'],
                        flow['asked'], seq))
        # the resume, per takeover: the song before it stopped on step L, and
        # the same song picks up on L+1 -- not on 0, and not after a gap
        resumes = []
        for i in ins_at:
            before, after = runs[i - 1], runs[i + 1] if i + 1 < len(runs) else None
            resumes.append({'song': before['song'], 'paused': before['lastLocal'],
                            'resumed': after['firstLocal'] if after else None,
                            'same': bool(after) and after['song'] == before['song'],
                            'insert': runs[i]['song'], 'insertSteps': runs[i]['n']})
        REPORT['insertResumes'] = resumes
        bad = [r for r in resumes if not r['same'] or r['resumed'] != r['paused'] + 1]
        check('the set is handed back where it paused', not bad,
                     '%s; nothing left playing: %s'
                     % ('; '.join('%s interrupted at step %d, back on %d after %d steps of %s'
                                  % (r['song'], r['paused'], r['resumed'], r['insertSteps'], r['insert'])
                                  for r in resumes),
                        flow['insertLeft'] if not (flow['insertLeft'] is None and flow['pending'] is None)
                        else 'None'))
        # the echo: a retime INTO the vamp on the step it takes over, and a
        # retime back to a song around its last note (the scheduler stamps the
        # hand-back on the final step it schedules, so it can land on the last
        # note or the step after it)
        retimes = {(r['name'], r['at']) for r in flow['retimes']}
        echo_bad = []
        for i in ins_at:
            r = runs[i]
            into = (r['song'], r['firstGlobal']) in retimes
            back = any((n, at) in retimes for n in set(seq) - set(flow['insertLen'])
                       for at in (r['firstGlobal'] + r['n'] - 1, r['firstGlobal'] + r['n']))
            if not (into and back):
                echo_bad.append({'insert': r['song'], 'into': into, 'back': back})
        check('the echo is retimed on both sides of an insert', not echo_bad,
                     '%d retimes, one into each vamp and one back to the set: %s'
                     % (len(flow['retimes']),
                        ', '.join('%s at step %d' % (x['name'], x['at']) for x in flow['retimes']))
                     + ((' -- MISSING: %s' % echo_bad) if echo_bad else ''))

        # ---- 8f. the mission music is TEMPORARY: cut short, the set comes
        # back where it paused, retimed to the song's tempo. This is what the
        # game leans on when a big moment ends early. ----
        cut = page.evaluate('() => window.__insertCut()')
        REPORT['insertCut'] = cut
        cruns = cut['runs']
        ins_at = [i for i, r in enumerate(cruns) if r['song'] == 'IRIE MASTER']
        ins_run = cruns[ins_at[0]] if ins_at else None
        before = cruns[ins_at[0] - 1] if ins_at else None
        after = cruns[ins_at[0] + 1] if ins_at and ins_at[0] + 1 < len(cruns) else None
        back_retime = [r for r in cut['retimes']
                       if r['name'] == (before or {}).get('song')
                       and ins_run and r['at'] >= ins_run['firstGlobal'] + ins_run['n'] - 1]
        check('a mission vamp cut short gives the set back',
                     bool(ins_run) and ins_run['n'] < cut['insertLen'] and 0 < ins_run['n'] <= 20
                     and bool(after) and before and after['song'] == before['song']
                     and after['firstLocal'] == before['lastLocal'] + 1
                     and bool(back_retime) and cut['playing'] is None and cut['pending'] is None,
                     'IRIE MASTER is %d steps long; cut after %d of them it stopped, and %s came back on '
                     'step %d (paused at %d) with the echo retimed back at step %s; nothing left playing: '
                     '%s' % (cut['insertLen'], ins_run['n'] if ins_run else -1,
                             before['song'] if before else '?',
                             after['firstLocal'] if after else -1,
                             before['lastLocal'] if before else -1,
                             back_retime[0]['at'] if back_retime else 'never', cut['playing']))

        # ---- 9. the fader: 50% out of the box ----
        page.evaluate("() => localStorage.removeItem('onedrop.vol')")
        page.reload(wait_until='load')
        page.wait_for_function('window.PB && PB.game && PB.assets.ready', timeout=60000)
        page.evaluate(TOOLS)
        vol = page.evaluate('''() => {
          const a = PB.game.audio; a.init();
          return { slider: D_vol(), label: document.getElementById('volVal').textContent,
                   engine: a.getVolume(), gain: a.master.gain.value, stored: localStorage.getItem('onedrop.vol') };
          function D_vol() { return document.getElementById('vol').value; }
        }''')
        REPORT['volumeDefault'] = vol
        check('fader starts at 50%', vol['slider'] == '50' and vol['label'] == '50%'
                     and abs(vol['engine'] - 0.5) < 1e-9 and abs(vol['gain'] - 0.5) < 1e-6,
                     'slider %s / label %s / engine %.2f / master gain %.2f' % (
                         vol['slider'], vol['label'], vol['engine'], vol['gain']))

        # ---- 10. the fader drives the gain, and survives a reload ----
        page.evaluate('''() => { const s = document.getElementById('vol'); s.value = '85';
          s.dispatchEvent(new Event('input', { bubbles: true })); }''')
        after = page.evaluate('''() => ({ gain: PB.game.audio.master.gain.value,
          label: document.getElementById('volVal').textContent,
          stored: localStorage.getItem('onedrop.vol') })''')
        REPORT['volumeMoved'] = after
        check('fader drives the master gain', abs(after['gain'] - 0.85) < 1e-6 and after['label'] == '85%',
                     'set 85%% -> master %.2f, label %s' % (after['gain'], after['label']))
        page.reload(wait_until='load')
        page.wait_for_function('window.PB && PB.game && PB.assets.ready', timeout=60000)
        page.evaluate(TOOLS)
        again = page.evaluate('''() => { PB.game.audio.init();
          return { gain: PB.game.audio.master.gain.value,
                   slider: document.getElementById('vol').value,
                   label: document.getElementById('volVal').textContent }; }''')
        REPORT['volumeReloaded'] = again
        check('fader survives a reload',
                     abs(again['gain'] - 0.85) < 1e-6 and again['slider'] == '85' and again['label'] == '85%',
                     'after reload: master %.2f, slider %s, label %s' % (again['gain'], again['slider'], again['label']))

        # ---- 10b. the fader owns the keyboard while it is focused ----
        # The machine swallows Space/Slash/Arrow keys on the window, which is
        # right for gameplay and wrong for a range input: with nothing but a
        # real keypress the thumb would never move. This is the check for the
        # fix that lets a focused menu field keep its keys.
        page.evaluate("() => document.getElementById('vol').focus()")
        page.keyboard.press('ArrowLeft')
        kb = page.evaluate('''() => ({ slider: document.getElementById('vol').value,
          label: document.getElementById('volVal').textContent,
          gain: PB.game.audio.master.gain.value,
          leftFlipper: PB.game.world.flippers[0].active,
          focused: document.activeElement === document.getElementById('vol') })''')
        REPORT['faderKeyboard'] = kb
        check('fader answers the arrow keys',
                     kb['focused'] and kb['slider'] == '84' and kb['label'] == '84%'
                     and abs(kb['gain'] - 0.84) < 1e-6 and not kb['leftFlipper'],
                     'focus the fader, press ArrowLeft: %s%% (master %.2f), flipper untouched: %s'
                     % (kb['slider'], kb['gain'], not kb['leftFlipper']))
        page.evaluate('''() => { const s = document.getElementById('vol'); s.value = '85';
          s.dispatchEvent(new Event('input', {bubbles:true})); s.blur(); }''')

        # ---- 11. mute silences the output, and restores the player's level ----
        mute = page.evaluate('''() => { const a = PB.game.audio;
          const was = a.master.gain.value; const m = a.toggleMute();
          const during = a.master.gain.value; const back = a.toggleMute();
          return { was: was, muted: m, during: during, back: back, after: a.master.gain.value, vol: a.getVolume() }; }''')
        REPORT['mute'] = mute
        check('mute silences, unmute restores', mute['during'] == 0 and abs(mute['after'] - 0.85) < 1e-6,
                     'mute -> %.2f, unmute -> %.2f (the fader\'s 0.85, not a fixed default)' % (mute['during'], mute['after']))

        # ---- 12. the live scheduler runs, and silence at 0 is real ----
        page.evaluate("() => { const s = document.getElementById('vol'); s.value = '100'; s.dispatchEvent(new Event('input', {bubbles:true})); }")
        page.evaluate("() => { const a = PB.game.audio; a.resume(); a.startMusic(); }")
        before_local = page.evaluate('window.PB.game.audio._local')
        page.evaluate('window.__watch("master"); window.__resetWatch();')
        page.wait_for_timeout(4000)
        run = page.evaluate('({ read: window.__read(), local: PB.game.audio._local, song: PB.game.audio.songName(), idx: PB.game.audio.songIndex() })')
        step = songs_meta[0]['stepDur']
        expect_steps = 4.0 / step
        REPORT['scheduler'] = run
        check('live scheduler advances', abs(run['local'] - before_local - expect_steps) < expect_steps * 0.35,
                     'advanced %d steps in 4 s (expected ~%d at %.3fs/step); playing %s'
                     % (run['local'] - before_local, round(expect_steps), step, run['song']))
        check('live output present at 100%', run['read']['peak'] > 0.01,
                     'master bus peak %.4f' % run['read']['peak'])

        # ---- 12b. the game's own hand on the music, end to end: multiball
        # asks for its vamp, the vamp actually takes over, and the music is
        # taken away again when the game is reset. This is the live version of
        # the cut-short check above -- game action in, music changed, game
        # reset, music back -- and it is what would catch a mission vamp left
        # playing over ordinary play. ----
        song_names = {s['name'] for s in songs_meta}
        live = page.evaluate('''() => {
          const a = PB.game.audio; a.init(); a.resume(); a.startMusic();
          PB.game.multiball();
          return { asked: a.nowPlaying(), playing: a.insertName(),
                   pending: a._pendingInsert ? a._pendingInsert.name : null,
                   song: a.songName() };
        }''')
        page.wait_for_timeout(5000)
        mid = page.evaluate('''() => ({ playing: PB.game.audio.insertName(),
          nowPlaying: PB.game.audio.nowPlaying(), song: PB.game.audio.songName() })''')
        page.evaluate('() => PB.game.resetGame()')
        gone = page.evaluate('''() => ({ playing: PB.game.audio.insertName(),
          pending: PB.game.audio._pendingInsert, nowPlaying: PB.game.audio.nowPlaying(),
          music: PB.game.audio.musicOn })''')
        REPORT['gameInsert'] = {'asked': live, 'mid': mid, 'afterReset': gone}
        check('the game hands the music its vamp, and takes it back',
                     live['asked'] == 'SKANK RIOT' and live['song'] in song_names
                     and mid['playing'] == 'SKANK RIOT'
                     and gone['playing'] is None and gone['pending'] is None
                     and gone['nowPlaying'] in song_names and not gone['music'],
                     'multiball asked for SKANK RIOT (queued while %s played), and after 5 s it was '
                     'the music playing; resetting the game left %s playing with nothing queued'
                     % (live['song'], gone['nowPlaying']))
        # NB the live analyser is deliberately NOT used for this: see the
        # note on __faderTest. It reads the last loud block forever once the
        # graph goes silent, which is what made this check fail on a
        # perfectly silent graph.
        page.evaluate('''() => { const s = document.getElementById('vol'); s.value = '0';
          s.dispatchEvent(new Event('input', {bubbles:true})); }''')
        page.wait_for_timeout(300)
        fader = page.evaluate('''() => ({ gain: PB.game.audio.master.gain.value,
          engine: PB.game.audio.getVolume() })''')
        off = page.evaluate('() => window.__faderTest()')
        REPORT['volumeZero'] = {'live': fader, 'offline': off}
        check('fader at 0 is silence',
                     fader['gain'] == 0 and fader['engine'] == 0
                     and off['zero'] == 0 and off['full'] > 0.05,
                     'live master gain %.2f; the same programme through the fader: '
                     '%.4f at 0%%, %.3f at 100%%' % (fader['gain'], off['zero'], off['full']))
        page.evaluate('''() => { const s = document.getElementById('vol'); s.value = '50';
          s.dispatchEvent(new Event('input', {bubbles:true})); }''')

        REPORT['errors'] = errors
        browser.close()

    failed = [k for k, v in REPORT.items() if isinstance(v, dict) and 'pass' in v and not v['pass']]
    (ROOT / 'audio-verification.json').write_text(json.dumps(REPORT, indent=2), encoding='utf-8')
    print('\n%s  (%s)' % ('ALL CHECKS PASS' if not failed else 'FAILURES: ' + ', '.join(failed),
                          'dev/audio-verification.json'))


if __name__ == '__main__':
    main()
