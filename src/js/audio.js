/* ============================================================
   ONE DROP PINBALL  --  audio.js
   Everything you hear is synthesised live: a set of reggae riddims
   (drums, bass, skank, melodica/horn) played by a sequencer that walks
   a PLAYLIST -- each song has its own tempo, progression and feel, and
   the set hands over on a bar line, dub-style, without stopping -- plus
   the mechanical sound of the cabinet itself.

   THE MIX. Three buses meet a glue compressor on the master:
     master   the player's volume fader
     music    the band, deliberately BEHIND the machine
     sfx      the machine (solendoids, coil rings, targets, the ball)
   The music is background music: it sits several dB under the SFX so a
   flipper clack or a bumper hit always owns the mix, and it ducks
   further whenever a big cue fires.

   THE SFX. A pinball machine is not a synth: it is a pile of solenoids
   hitting metal and plastic, and that is how every cue here is built --
   a click where two parts meet, a thud with a falling pitch for the
   weight, and a RING of inharmonic partials for whatever metal is
   attached to it (modal()). A single frequency sounds like a beep; real
   struck metal rings at 1 : 2.76 : 5.4 : 8.93, and that ratio set is
   most of the difference between a game sound and a machine sound.

   Every primitive understands optional  pan (-1..1, positional sfx),
   verb (0..1 reverb send)  and  pluck (lowpass envelope, the
   plucked-string shape a skank needs).
   ============================================================ */
(function (global) {
  'use strict';

  /* ================= the set list =================
     One entry per song. `feel` picks the drum vocabulary, `prog` the
     progression (a chord a bar), `bass` the bass line as
     [step, semitoneOffset, lengthInSteps], `mel` the lead line over
     `melLen` steps, and `arrange` the song's SHAPE.

     A SECTION is `secBars` bars of the same progression wearing one
     arrangement. These flags are the whole vocabulary:

       d  drums        k  skank guitar      o  organ bubble
       b  bass         l  lead              x  counter-lead (a third up)
       p  percussion (shaker)               w  wet (1 normal, 2 drenched)

     Left out, a flag is on for d/k/o/b and off for l/x/p. That is how a
     song gets a shape instead of a loop: a break with the drums out and
     the echo open lands harder than any amount of extra notes, and it is
     the same four bars underneath.

     `secBars` defaults to 4; the fastest riddims use 8 so a song is still
     minutes rather than seconds. The set is laid out in tempo order, so a
     long game walks up from 78 to 138 and back down again. */
  function sec(o) {
    return {
      name: o.n || '', d: o.d !== 0, k: o.k !== 0, o: o.o !== 0, b: o.b !== 0,
      l: !!o.l, x: !!o.x, p: !!o.p, w: o.w || 1
    };
  }
  /* what a song with no arrangement -- and every insert -- plays: everything */
  var FULL = { name: 'all', d: true, k: true, o: true, b: true, l: true, x: false, p: false, w: 1 };

  var SONGS = [
    {
      name: 'ONE DROP', bpm: 78, feel: 'onedrop', lead: 'melodica', secBars: 4,
      /* Am7 | Fmaj7 | C | G */
      prog: [
        { root: 110.00, chord: [220.00, 261.63, 329.63, 392.00], name: 'Am' },
        { root: 87.31, chord: [174.61, 220.00, 261.63, 329.63], name: 'F' },
        { root: 130.81, chord: [261.63, 329.63, 392.00, 523.25], name: 'C' },
        { root: 98.00, chord: [196.00, 246.94, 293.66, 392.00], name: 'G' }
      ],
      /* syncopated one-drop bass: the rest on beat 1 is the whole point */
      bass: [
        [0, 0, 3], [4, 0, 2], [7, 7, 1], [8, 0, 2], [11, 12, 1], [12, 7, 2], [15, 5, 1]
      ],
      melLen: 32,
      mel: [
        [0, 440.0, 3], [4, 523.25, 2], [6, 587.33, 2], [10, 440.0, 2], [12, 392.0, 4],
        [18, 523.25, 2], [20, 659.25, 3], [24, 587.33, 2], [27, 523.25, 2], [30, 392.0, 2]
      ],
      /* bass and skank alone, the drums falling in on the second section and
         the break taking everything but the bass away */
      arrange: [
        sec({ n: 'intro', d: 0, w: 0.6 }),
        sec({ n: 'verse', w: 0.8 }),
        sec({ n: 'verse 2', l: 1 }),
        sec({ n: 'chorus', l: 1, x: 1, p: 1, w: 1.2 }),
        sec({ n: 'break', d: 0, k: 0, w: 1.7 }),
        sec({ n: 'chorus 2', l: 1, x: 1, p: 1, w: 1.2 }),
        sec({ n: 'outro', k: 0, w: 1.4 })
      ]
    },
    {
      /* dub chamber. This one used to sit at 66 bpm, which read as a drag
         rather than as dub: the space has to be framed by MOTION, not by
         slowness. It is up at 86, the open hat and the shaker run through
         it, and the bass walks into the bar line instead of waiting. */
      name: 'DUB CHAMBER', bpm: 86, feel: 'dub', lead: 'melodica', secBars: 4,
      prog: [
        { root: 73.42, chord: [220.00, 261.63, 293.66, 349.23], name: 'Dm' },
        { root: 58.27, chord: [174.61, 220.00, 261.63, 349.23], name: 'Bb' },
        { root: 87.31, chord: [174.61, 220.00, 261.63, 349.23], name: 'F' },
        { root: 110.00, chord: [220.00, 261.63, 329.63, 440.00], name: 'Am' }
      ],
      bass: [
        [0, 0, 6], [6, 7, 1], [8, 0, 5], [14, 7, 2]
      ],
      melLen: 64,
      mel: [
        [0, 587.33, 3], [6, 523.25, 2], [12, 440.00, 4],
        [36, 587.33, 2], [42, 698.46, 2], [48, 659.25, 5]
      ],
      arrange: [
        sec({ n: 'intro', k: 0, w: 1.5 }),
        sec({ n: 'verse', w: 1.2 }),
        sec({ n: 'chant', l: 1, w: 1.2 }),
        sec({ n: 'pressure', p: 1, w: 1.4 }),
        /* the break drops to bass and echo: the rhythm section OUT, which
           is what makes a break a break rather than a quieter chorus */
        sec({ n: 'break', d: 0, k: 0, w: 1.9 }),
        sec({ n: 'chant 2', l: 1, x: 1, p: 1, w: 1.3 }),
        sec({ n: 'outro', k: 0, w: 1.6 })
      ]
    },
    {
      /* rockers: the one drop played heavy. It is about weight, not speed --
         a kick push into the drop, a snare answering off the beat, the organ
         bubbling underneath and a progression that never rests on the four. */
      name: 'ROCKERS', bpm: 96, feel: 'rockers', lead: 'melodica', secBars: 4,
      /* Am | G | F | G  (i - VII - VI - VII) */
      prog: [
        { root: 110.00, chord: [220.00, 261.63, 329.63, 392.00], name: 'Am' },
        { root: 98.00, chord: [196.00, 246.94, 293.66, 392.00], name: 'G' },
        { root: 87.31, chord: [174.61, 220.00, 261.63, 349.23], name: 'F' },
        { root: 98.00, chord: [196.00, 246.94, 293.66, 392.00], name: 'G' }
      ],
      bass: [
        [0, 0, 2], [3, 0, 1], [4, 0, 2], [8, 0, 3], [11, 7, 1], [12, 12, 2], [15, 7, 1]
      ],
      melLen: 32,
      mel: [
        [0, 440.0, 3], [4, 493.88, 2], [7, 523.25, 2], [10, 587.33, 4],
        [16, 523.25, 2], [19, 440.0, 3], [24, 392.0, 2], [28, 440.0, 4]
      ],
      arrange: [
        sec({ n: 'intro', k: 0, w: 0.7 }),
        sec({ n: 'verse', w: 0.9 }),
        sec({ n: 'verse 2', l: 1 }),
        sec({ n: 'chorus', l: 1, x: 1, p: 1, w: 1.1 }),
        sec({ n: 'break', d: 0, k: 0, w: 1.6 }),
        sec({ n: 'chorus 2', l: 1, x: 1, p: 1, w: 1.1 }),
        sec({ n: 'outro', k: 0, w: 1.3 })
      ]
    },
    {
      /* skank rail: up-tempo, walking bass in eighths, bright offbeat chops
         and a horn line over the top */
      name: 'SKANK RAIL', bpm: 106, feel: 'ska', lead: 'horn', secBars: 4,
      prog: [
        { root: 130.81, chord: [261.63, 329.63, 392.00, 523.25], name: 'C' },
        { root: 110.00, chord: [220.00, 261.63, 329.63, 392.00], name: 'Am' },
        { root: 87.31, chord: [174.61, 220.00, 261.63, 349.23], name: 'F' },
        { root: 98.00, chord: [196.00, 246.94, 293.66, 392.00], name: 'G' }
      ],
      /* walking: root on the beat, fifth on the "and" */
      bass: [
        [0, 0, 2], [2, 0, 2], [4, 5, 2], [6, 0, 2], [8, 7, 2], [10, 5, 2], [12, 0, 2], [14, 12, 2]
      ],
      melLen: 32,
      mel: [
        [0, 523.25, 2], [4, 659.25, 3], [8, 587.33, 2], [12, 523.25, 3],
        [16, 440.00, 2], [20, 523.25, 2], [24, 523.25, 3], [28, 392.00, 3]
      ],
      arrange: [
        sec({ n: 'intro', k: 0, w: 0.7 }),
        sec({ n: 'verse', w: 0.9 }),
        sec({ n: 'horns', l: 1 }),
        sec({ n: 'chorus', l: 1, x: 1, p: 1, w: 1.1 }),
        /* this riddim walks its bass in eighths, so dropping the DRUMS out
           would leave something just as loud: the break here is the other
           dub move -- the bass goes, the chops and the kit stay */
        sec({ n: 'break', b: 0, w: 1.5 }),
        sec({ n: 'chorus 2', l: 1, x: 1, p: 1, w: 1.1 }),
        sec({ n: 'outro', l: 1, k: 0, w: 1.2 })
      ]
    },
    {
      /* nyabinghi: hand drums, no kit at all -- the boom the palm stops, the
         funde keeping the pulse and a repeater running sixteenths, under a
         chant-like bass. The oldest sound on the table. */
      name: 'NYABINGHI', bpm: 118, feel: 'binghi', lead: 'melodica', secBars: 4,
      /* Dm | Dm | Bb | C */
      prog: [
        { root: 73.42, chord: [220.00, 261.63, 293.66, 349.23], name: 'Dm' },
        { root: 73.42, chord: [220.00, 261.63, 293.66, 349.23], name: 'Dm' },
        { root: 58.27, chord: [174.61, 220.00, 261.63, 293.66], name: 'Bb' },
        { root: 65.41, chord: [196.00, 261.63, 329.63, 392.00], name: 'C' }
      ],
      bass: [
        [0, 0, 4], [6, 0, 2], [8, 0, 4], [14, 7, 2]
      ],
      melLen: 32,
      mel: [
        [0, 587.33, 4], [6, 523.25, 2], [8, 440.00, 4],
        [16, 587.33, 2], [18, 698.46, 2], [20, 659.25, 4], [26, 587.33, 3]
      ],
      arrange: [
        sec({ n: 'drums', k: 0, p: 1, w: 1.2 }),
        sec({ n: 'verse', p: 1, w: 1.2 }),
        sec({ n: 'chant', l: 1, p: 1, w: 1.3 }),
        sec({ n: 'fire', l: 1, x: 1, p: 1, w: 1.4 }),
        sec({ n: 'break', k: 0, b: 0, w: 1.6 }),
        sec({ n: 'chant 2', l: 1, x: 1, p: 1, w: 1.3 }),
        sec({ n: 'outro', k: 0, p: 1, w: 1.2 })
      ]
    },
    {
      /* the steppers: kick on all four, organ bubbling on the offbeat, bass
         playing the same note into the bar line. Eight-bar sections, so a
         song at this tempo still runs a couple of minutes. */
      name: 'STEPPERS', bpm: 138, feel: 'steppers', lead: 'organ', secBars: 8,
      prog: [
        { root: 110.00, chord: [220.00, 261.63, 329.63, 392.00], name: 'Am' },
        { root: 73.42, chord: [220.00, 293.66, 349.23, 440.00], name: 'Dm' },
        { root: 98.00, chord: [196.00, 246.94, 293.66, 392.00], name: 'G' },
        { root: 110.00, chord: [220.00, 261.63, 329.63, 440.00], name: 'Am' }
      ],
      bass: [
        [0, 0, 3], [4, 0, 3], [7, 7, 1], [8, 0, 3], [12, 0, 3], [14, 5, 2]
      ],
      melLen: 32,
      mel: [
        [2, 523.25, 2], [6, 587.33, 2], [10, 659.25, 2], [14, 587.33, 2],
        [18, 523.25, 2], [22, 440.00, 2], [26, 392.00, 2], [30, 440.00, 2]
      ],
      arrange: [
        sec({ n: 'intro', k: 0, w: 0.8 }),
        sec({ n: 'verse', w: 1.0 }),
        sec({ n: 'verse 2', l: 1, w: 1.0 }),
        sec({ n: 'chorus', l: 1, x: 1, p: 1, w: 1.2 }),
        /* the bass drops out under the whole kit and the organ -- the other
           half of the break vocabulary (see SKANK RAIL) */
        sec({ n: 'break', b: 0, w: 1.5 }),
        sec({ n: 'chorus 2', l: 1, x: 1, p: 1, w: 1.2 }),
        sec({ n: 'outro', l: 1, k: 0, w: 1.2 })
      ]
    }
  ];

  /* ================= mission inserts =================
     Short vamps the game can drop into the set: multiball, wizard mode and a
     completed mission each get one. An insert takes over on the next bar
     line, plays its whole length, then hands the playlist back exactly where
     it left off -- the interrupted song resumes on the step it paused at,
     with the echo retimed both ways. Same machinery as a song: an insert is
     just a song with `bars` and no obligation to develop. */
  var INSERTS = [
    {
      name: 'SKANK RIOT', bpm: 132, feel: 'ska', lead: 'horn', bars: 8, secBars: 2,
      prog: [
        { root: 130.81, chord: [261.63, 329.63, 392.00, 523.25], name: 'C' },
        { root: 110.00, chord: [220.00, 261.63, 329.63, 392.00], name: 'Am' },
        { root: 87.31, chord: [174.61, 220.00, 261.63, 349.23], name: 'F' },
        { root: 98.00, chord: [196.00, 246.94, 293.66, 392.00], name: 'G' }
      ],
      bass: [
        [0, 0, 2], [2, 0, 2], [4, 5, 2], [6, 0, 2], [8, 7, 2], [10, 5, 2], [12, 0, 2], [14, 12, 2]
      ],
      melLen: 32,
      mel: [
        [0, 659.25, 2], [3, 783.99, 2], [6, 698.46, 2], [8, 587.33, 3],
        [16, 523.25, 2], [19, 659.25, 2], [22, 587.33, 2], [24, 523.25, 4]
      ],
      arrange: [
        sec({ n: 'call', k: 0, w: 0.9 }),
        sec({ n: 'run', w: 1.1 }),
        sec({ n: 'run 2', l: 1, x: 1, p: 1, w: 1.2 }),
        sec({ n: 'turn', l: 1, x: 1, p: 1, w: 1.3 })
      ]
    },
    {
      name: 'IRIE MASTER', bpm: 100, feel: 'rockers', lead: 'horn', bars: 8, secBars: 2,
      /* Dm | Bb | C | Dm */
      prog: [
        { root: 73.42, chord: [220.00, 261.63, 293.66, 349.23], name: 'Dm' },
        { root: 58.27, chord: [174.61, 220.00, 261.63, 293.66], name: 'Bb' },
        { root: 65.41, chord: [196.00, 261.63, 329.63, 392.00], name: 'C' },
        { root: 73.42, chord: [220.00, 261.63, 293.66, 349.23], name: 'Dm' }
      ],
      bass: [
        [0, 0, 3], [4, 0, 2], [6, 7, 1], [8, 0, 3], [12, 0, 3], [14, 5, 2]
      ],
      melLen: 32,
      mel: [
        [0, 587.33, 3], [5, 698.46, 3], [9, 783.99, 3],
        [16, 698.46, 2], [19, 587.33, 4], [24, 523.25, 2], [28, 587.33, 4]
      ],
      arrange: [
        sec({ n: 'call', k: 0, w: 1.0 }),
        sec({ n: 'rise', w: 1.2 }),
        sec({ n: 'rise 2', l: 1, x: 1, w: 1.3 }),
        sec({ n: 'seal', l: 1, x: 1, p: 1, w: 1.4 })
      ]
    },
    {
      name: 'MISSION VAMP', bpm: 112, feel: 'onedrop', lead: 'horn', bars: 4, secBars: 2,
      /* C | G | Am | F */
      prog: [
        { root: 130.81, chord: [261.63, 329.63, 392.00, 523.25], name: 'C' },
        { root: 98.00, chord: [196.00, 246.94, 293.66, 392.00], name: 'G' },
        { root: 110.00, chord: [220.00, 261.63, 329.63, 392.00], name: 'Am' },
        { root: 87.31, chord: [174.61, 220.00, 261.63, 349.23], name: 'F' }
      ],
      bass: [
        [0, 0, 2], [4, 0, 2], [7, 7, 1], [8, 0, 2], [11, 7, 1], [12, 0, 2], [15, 5, 1]
      ],
      melLen: 32,
      mel: [
        [0, 659.25, 2], [3, 783.99, 2], [6, 659.25, 2], [8, 587.33, 4],
        [16, 659.25, 3], [20, 587.33, 2], [23, 523.25, 4]
      ],
      arrange: [
        sec({ n: 'call', k: 0, w: 1.0 }),
        sec({ n: 'turn', l: 1, x: 1, w: 1.2 })
      ]
    }
  ];

  var STEPS_PER_BAR = 16;

  /* derived once: how long a 16th is, how many steps a section holds, and
     how long a song (or an insert) runs before the set moves on */
  function derive(s, defSecBars) {
    s.stepDur = 60 / s.bpm / 4;
    s.secBars = s.secBars || defSecBars;
    s.run = s.arrange ? s.arrange.length * s.secBars * STEPS_PER_BAR
                      : (s.bars || s.prog.length * 2) * STEPS_PER_BAR;
    s.seconds = s.run * s.stepDur;
    return s;
  }
  for (var si = 0; si < SONGS.length; si++) derive(SONGS[si], 4);
  for (var ii = 0; ii < INSERTS.length; ii++) derive(INSERTS[ii], 2);

  /* the band sits BEHIND the machine. This is the one number that
     decides the whole feel of the mix: the fader at 100% should sound
     like a loud arcade, so at the 50% default the band is a bed and
     every solenoid is still on top of it. */
  var MUSIC_LEVEL = 0.16;
  var SFX_LEVEL = 1.0;

  /* ================= the mixer page =================
     One trim per cue. The voicings below are written for character --
     what a bumper sounds like -- and this table is the balance between
     them, so a cue's loudness can be changed without touching its
     recipe, and every number here can be checked against a render of
     the kit (dev/render-audio.py) and against dev/_cueone.py's gain
     sweep. A cue missing from the table plays at 1.0. */
  var SFX_TRIM = {
    flipper: 2.5, flipperReturn: 2.4, bumper: 1.6, sling: 3.4, bash: 1.3,
    post: 11.5, target: 2.3, standup: 7.3, rollover: 4.7, spinner: 21.0,
    drain: 0.9, rampup: 2.0, ramp: 1.5, launch: 1.1, kickback: 1.1,
    ballsave: 1.7, multiball: 1.6, jackpot: 1.0, bonus: 34.0, tilt: 1.0,
    start: 1.6, gameover: 1.05, nudge: 2.7, coin: 1.3
  };
  /* Three cues are written quiet on purpose -- a score bell, a tick on a
     post, the spinner's whir are not impacts -- and their trims are what
     bring them up to the tier of the cues they play alongside. They used to
     sit at -20 dB, ten dB under the flipper and a tenth of a dB inside the
     'core cues mix-solid' bar, so the same cue could pass or fail; measured
     through the whole chain (dev/_cueone.py renders the trim sweep), the
     level tracks the trim 1:1, so these numbers are the fix. */

  /* skank accent pattern: upbeats are not all the same loudness. The
     "and"-of-2 style skank (index 1) sits back like a real chop does. */
  var SKANK_ACCENT = [0.72, 1.0, 0.72, 1.0];

  /* struck-metal mode sets. A bar is not a saw: its partials are
     inharmonic, which is why these read as metal and a stack of octaves
     reads as a beep. */
  var MODES = {
    steel: { ratios: [1, 2.76, 5.40, 8.93], decays: [1, 0.58, 0.36, 0.22], amps: [1, 0.55, 0.30, 0.16] },
    chrome: { ratios: [1, 2.32, 4.06, 6.71], decays: [1, 0.66, 0.44, 0.26], amps: [1, 0.68, 0.40, 0.20] },
    wood: { ratios: [1, 1.92, 3.11, 4.55], decays: [1, 0.52, 0.30, 0.18], amps: [1, 0.44, 0.22, 0.10] },
    bell: { ratios: [1, 2.00, 3.01, 4.32], decays: [1, 0.70, 0.50, 0.34], amps: [1, 0.60, 0.34, 0.18] }
  };

  function semi(f, n) { return f * Math.pow(2, n / 12); }
  /* small pitch/timing variance so repeated hits never phase-freeze */
  function human(f, frac) { return f * (1 + (Math.random() * 2 - 1) * frac); }

  function makeSoftClipCurve() {
    var n = 1024, c = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var x = (i / (n - 1)) * 2 - 1;
      c[i] = Math.tanh(x * 1.6);
    }
    return c;
  }

  function makeImpulse(ctx, secs, decay) {
    /* a generated plate: two decorrelated channels of noise with an
       exponential-ish tail, plus a few discrete early taps so it reads
       as a small wooden room before the wash arrives. */
    var rate = ctx.sampleRate;
    var len = Math.floor(rate * secs);
    var buf = ctx.createBuffer(2, len, rate);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      for (var i = 0; i < len; i++) {
        var t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (i > rate * 0.005 ? 0.5 : 1);
      }
      /* early reflections */
      [0.011, 0.019, 0.031, 0.047].forEach(function (ms, k) {
        var p = Math.floor(rate * (ms + k * 0.004));
        if (p < len) d[p] += (ch ? -0.55 : 0.55) / (k + 1);
      });
    }
    return buf;
  }

  function AudioEngine() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.musicOn = false;
    this.volume = 0.5;              /* the fader starts at 50% */
    this._songIdx = 0;
    this._local = 0;
    this.nextNoteTime = 0;
    this.intensity = 0;
    this._musicBase = MUSIC_LEVEL;
    this._duckUntil = 0;
    this._timer = null;
    this._rollTimer = null;
    /* the cue currently being voiced scales its layers by this, so the
       mixer page above can rebalance the kit without rewriting a recipe */
    this._trim = 1;
    /* the current section's wet flag: 1 is normal, higher opens the echo.
       The voices that have a send to the delay read this. */
    this._wet = 1;
    /* the global step counter, which keeps counting across an insert so a
       hand-over can still be waited for to the next bar line */
    this._step = 0;
    this._insert = null;
    this._pendingInsert = null;
    /* called with (song, index) on every handover, and with (insert, on)
       when a mission vamp takes over and gives the set back -- the UI can
       announce the track without the engine knowing anything about it */
    this.onSong = null;
    this.onInsert = null;
  }

  AudioEngine.prototype.init = function () {
    if (this.ctx) return;
    var Ctx = global.AudioContext || global.webkitAudioContext;
    if (!Ctx) return;
    var ctx = this.ctx = new Ctx();

    /* ---- master: the fader, into the glue compressor. The compressor
       keeps layered chords and a pile of simultaneous hits from clipping
       while adding a touch of heard-through-a-PA pump ---- */
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 18;
    comp.ratio.value = 3.6;
    comp.attack.value = 0.005;
    comp.release.value = 0.22;
    comp.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(comp);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this._musicBase;
    this.musicBus.connect(this.master);

    /* the sfx bus gets its own fast limiter: a five-bumper flurry plus a
       jackpot fanfare is a lot of energy to hand a glue compressor that
       is also looking after the bass line */
    var sfxLim = ctx.createDynamicsCompressor();
    sfxLim.threshold.value = -4;
    sfxLim.knee.value = 4;
    sfxLim.ratio.value = 8;
    sfxLim.attack.value = 0.003;
    sfxLim.release.value = 0.16;
    sfxLim.connect(this.master);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = SFX_LEVEL;
    this.sfxBus.connect(sfxLim);

    /* ---- plate reverb ---- */
    var verb = ctx.createConvolver();
    verb.buffer = makeImpulse(ctx, 1.7, 2.6);
    var verbReturn = ctx.createGain();
    verbReturn.gain.value = 0.5;
    verb.connect(verbReturn);
    verbReturn.connect(this.master);
    this.verb = verb;
    /* a wet send damps what goes in, so hits stay placey, not washy */
    var verbSend = ctx.createBiquadFilter();
    verbSend.type = 'lowpass';
    verbSend.frequency.value = 5200;
    verbSend.connect(verb);
    var verbTrim = ctx.createGain();
    verbTrim.gain.value = 1.0;
    verbTrim.connect(verbSend);
    this.verbSend = verbTrim;

    /* ---- dub delay: the signature sound of the genre. The wet is
       panned and the pan drifts, so the tails move in stereo the way
       a tape echo does. ---- */
    var delay = ctx.createDelay(1.5);
    delay.delayTime.value = SONGS[0].stepDur * 3;
    var fb = ctx.createGain(); fb.gain.value = 0.42;
    var damp = ctx.createBiquadFilter();
    damp.type = 'lowpass'; damp.frequency.value = 2200;
    var dsend = ctx.createGain(); dsend.gain.value = 0.34;
    dsend.connect(delay);
    delay.connect(damp); damp.connect(fb); fb.connect(delay);
    var dwet = ctx.createGain(); dwet.gain.value = 0.5;
    var dwetPan = null;
    if (ctx.createStereoPanner) {
      dwetPan = ctx.createStereoPanner();
      dwet.connect(dwetPan); dwetPan.connect(this.master);
      var lfo = ctx.createOscillator();
      lfo.frequency.value = 0.09;
      var lfoAmt = ctx.createGain(); lfoAmt.gain.value = 0.65;
      lfo.connect(lfoAmt); lfoAmt.connect(dwetPan.pan);
      lfo.start();
      /* tape warble on the echoes */
      var wob = ctx.createOscillator();
      wob.frequency.value = 0.7;
      var wobAmt = ctx.createGain(); wobAmt.gain.value = 0.004;
      wob.connect(wobAmt); wobAmt.connect(delay.delayTime);
      wob.start();
    } else {
      dwet.connect(this.master);
    }
    this.delay = delay;
    this.delaySend = dsend;
    this.dwet = dwet;                     /* pushed brighter in hot mode */

    /* soft-clipper for the bass, shared between notes */
    this.bassShaper = ctx.createWaveShaper();
    this.bassShaper.curve = makeSoftClipCurve();
    this.bassShaper.oversample = '2x';
    var bassOut = ctx.createGain(); bassOut.gain.value = 0.9;
    this.bassShaper.connect(bassOut); bassOut.connect(this.musicBus);

    /* noise buffer for drums / swooshes / every mechanical cue */
    var n = ctx.sampleRate * 1.0;
    var buf = ctx.createBuffer(1, n, ctx.sampleRate);
    var d0 = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d0[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    /* ---- THE ROLLING BALL: one continuous voice, not a stream of
       one-shots. A ball rolling on a playfield is a single sound that
       changes with speed; firing a 90 ms burst 12 times a second made it
       click. This is a looping noise source through a tracking bandpass
       and lowpass, with its level and pan following the ball; roll()
       steers it, and a watchdog shuts it up when the ball stops. ---- */
    var rsrc = ctx.createBufferSource();
    rsrc.buffer = buf;
    rsrc.loop = true;
    var rband = ctx.createBiquadFilter();
    rband.type = 'bandpass';
    rband.frequency.value = 700;
    rband.Q.value = 0.7;
    var rlp = ctx.createBiquadFilter();
    rlp.type = 'lowpass';
    rlp.frequency.value = 2600;
    var rg = ctx.createGain();
    rg.gain.value = 0.0001;
    var rpan = panNode(ctx, 0);
    rsrc.connect(rband); rband.connect(rlp); rlp.connect(rg);
    if (rpan) { rg.connect(rpan); rpan.connect(this.sfxBus); } else rg.connect(this.sfxBus);
    rsrc.start();
    this._roll = { band: rband, lp: rlp, gain: rg, pan: rpan, until: 0 };

    /* ---- THE CHARGING PLUNGER: same lesson as the rolling ball. The
       frame loop asks for this 60 times a second while the player holds
       the plunger, and 60 overlapping whooshes a second is mud. One
       continuous voice instead: a saw under tension plus the spring's
       noise through a resonant band, both rising with the pull. ---- */
    var csrc = ctx.createOscillator();
    csrc.type = 'sawtooth';
    csrc.frequency.value = 190;
    var csaw = ctx.createGain();
    csaw.gain.value = 0.55;
    csrc.connect(csaw);
    var cns = ctx.createBufferSource();
    cns.buffer = buf;
    cns.loop = true;
    var cband = ctx.createBiquadFilter();
    cband.type = 'bandpass';
    cband.frequency.value = 1200;
    cband.Q.value = 5;
    var cnoise = ctx.createGain();
    cnoise.gain.value = 0.35;
    cns.connect(cband); cband.connect(cnoise);
    var clp = ctx.createBiquadFilter();
    clp.type = 'lowpass';
    clp.frequency.value = 1800;
    var cg = ctx.createGain();
    cg.gain.value = 0.0001;
    csaw.connect(clp); cnoise.connect(clp); clp.connect(cg);
    cg.connect(this.sfxBus);
    csrc.start(); cns.start();
    this._charge = { osc: csrc, band: cband, lp: clp, gain: cg, until: 0 };

    var self = this;
    this._rollTimer = setInterval(function () { self._rollWatch(); }, 80);

    this.ready = true;
  };

  AudioEngine.prototype.resume = function () {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  };

  /* ---------- the fader --------------------------------------- */
  /* setVolume(0..1). The master gain is linear in the fader because the
     buses are already balanced against each other; the compressor on the
     far side is what stops a 100% fader from biting. */
  AudioEngine.prototype.setVolume = function (v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
    return this.volume;
  };
  AudioEngine.prototype.getVolume = function () { return this.volume; };
  AudioEngine.prototype.isMuted = function () { return this.muted; };

  AudioEngine.prototype.toggleMute = function () {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
    return this.muted;
  };

  /* dip the music for a moment so a big game sound owns the room */
  AudioEngine.prototype.duck = function (secs) {
    if (!this.ready) return;
    var g = this.musicBus.gain;
    var now = this.ctx.currentTime;
    var base = this._musicBase;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(base * 0.45, now + 0.05);
    g.linearRampToValueAtTime(base, now + 0.10 + (secs || 0.9));
  };

  var MAXPAN = 0.85;
  function panNode(ctx, pan) {
    if (!ctx.createStereoPanner) return null;
    var p = ctx.createStereoPanner();
    p.pan.value = Math.max(-MAXPAN, Math.min(MAXPAN, pan || 0));
    return p;
  }

  /* Every primitive ends the same way: through the same pan law, into
     the same bus, with the same two sends. Spelling that out once means
     a cue can never be half-wired (the old noise() delay send was
     unpanned and ungated because it was written twice). */
  AudioEngine.prototype._finish = function (node, o) {
    var ctx = this.ctx;
    var dest = o.bus || this.sfxBus;
    var p = panNode(ctx, o.pan);
    if (p) { node.connect(p); p.connect(dest); } else node.connect(dest);
    if (o.delay) {
      var pd = panNode(ctx, (o.pan || 0) * 0.6);
      if (pd) { node.connect(pd); pd.connect(this.delaySend); } else node.connect(this.delaySend);
    }
    if (o.verb) {
      var vs = ctx.createGain();
      vs.gain.value = o.verb;
      node.connect(vs); vs.connect(this.verbSend);
    }
  };

  /* ---------- primitives ------------------------------------- */
  /* o: { type,f0,f1,dur,gain,attack,at,lp,hp,pluck,bus,delay,verb,
         pan, detune2 (cents), vib:{rate,depth}, am:{rate,depth} } */
  AudioEngine.prototype.tone = function (o) {
    if (!this.ready || this.muted) return;
    var ctx = this.ctx, t = ctx.currentTime + (o.at || 0);
    var osc = ctx.createOscillator();
    osc.type = o.type || 'triangle';
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + (o.dur || 0.2));
    if (o.detune2 !== undefined) osc.detune.value = -o.detune2 / 2;

    var g = ctx.createGain();
    var peak = (o.gain === undefined ? 0.3 : o.gain) * this._trim;
    var a = o.attack || 0.006, d = o.dur || 0.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + d * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);

    var node = osc;
    if (o.lp || o.pluck) {
      var f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.Q.value = o.pluck ? 1.1 : 0.7;
      f.frequency.setValueAtTime(o.pluck || o.lp, t);
      if (o.pluck) f.frequency.exponentialRampToValueAtTime(Math.max(90, o.lp || o.pluck * 0.22), t + d);
      node.connect(f); node = f;
    }
    if (o.hp) {
      var h = ctx.createBiquadFilter();
      h.type = 'highpass'; h.frequency.value = o.hp;
      node.connect(h); node = h;
    }
    if (o.vib) {
      var lo = ctx.createOscillator();
      lo.frequency.value = o.vib.rate;
      var la = ctx.createGain(); la.gain.value = o.vib.depth;
      lo.connect(la); la.connect(osc.detune);
      lo.start(t); lo.stop(t + d + 0.05);
    }
    /* am: a fast tremolo on the amplitude itself. A coil buzz or a tilt
       buzzer is an amplitude-modulated rattle, not a pitch. */
    if (o.am) {
      var ao = ctx.createOscillator();
      ao.frequency.value = o.am.rate;
      var aa = ctx.createGain(); aa.gain.value = o.am.depth * peak;
      ao.connect(aa); aa.connect(g.gain);
      ao.start(t); ao.stop(t + d + 0.05);
    }
    node.connect(g);
    this._finish(g, o);

    var oscs = [osc];
    if (o.detune2 !== undefined) {
      var osc2 = ctx.createOscillator();
      osc2.type = osc.type;
      osc2.frequency.setValueAtTime(o.f0, t);
      if (o.f1) osc2.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + d);
      osc2.detune.value = o.detune2 / 2;
      osc2.connect(g);                    /* shares the envelope */
      oscs.push(osc2);
    }
    for (var i = 0; i < oscs.length; i++) { oscs[i].start(t); oscs[i].stop(t + d + 0.05); }
  };

  AudioEngine.prototype.noise = function (o) {
    if (!this.ready || this.muted) return;
    var ctx = this.ctx, t = ctx.currentTime + (o.at || 0);
    var src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    var f = ctx.createBiquadFilter();
    f.type = o.filter || 'highpass';
    f.frequency.setValueAtTime(o.f0 || 2000, t);
    if (o.q) f.Q.value = o.q;
    if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(60, o.f1), t + (o.dur || 0.2));
    var g = ctx.createGain();
    var peak = (o.gain === undefined ? 0.25 : o.gain) * this._trim;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + (o.attack || 0.004));
    g.gain.setValueAtTime(peak, t + (o.dur || 0.2) * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (o.dur || 0.2));
    src.connect(f); f.connect(g);
    this._finish(g, o);
    src.start(t);
    src.stop(t + (o.dur || 0.2) + 0.05);
  };

  /* modal(): the sound of something struck. A handful of inharmonic
     partials, each with its own decay, summed to one voice -- this is
     the ring of the metal a solenoid is bolted to, and it is what
     separate a machine from a synth. */
  AudioEngine.prototype.modal = function (o) {
    if (!this.ready || this.muted) return;
    var ctx = this.ctx, at = o.at || 0, t0 = ctx.currentTime + at;
    var set = o.modes || MODES.steel;
    var ratios = o.ratios || set.ratios;
    var decays = o.decays || set.decays;
    var amps = o.amps || set.amps;
    var f0 = human(o.f0, o.wobble === undefined ? 0.003 : o.wobble);
    var dur = o.dur || 0.4;
    var out = ctx.createGain();
    out.gain.value = (o.gain === undefined ? 0.3 : o.gain) * this._trim;
    var live = 0;
    for (var i = 0; i < ratios.length; i++) {
      var partial = f0 * ratios[i];
      if (partial > ctx.sampleRate * 0.45) continue;
      var d = Math.max(0.02, dur * decays[i]);
      var osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(partial, t0);
      var bg = ctx.createGain();
      bg.gain.setValueAtTime(0.0001, t0);
      bg.gain.linearRampToValueAtTime(amps[i], t0 + 0.002);
      bg.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      osc.connect(bg); bg.connect(out);
      osc.start(t0); osc.stop(t0 + d + 0.03);
      live++;
    }
    if (!live) return;
    var node = out;
    if (o.lp) {
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = o.lp;
      node.connect(lp); node = lp;
    }
    this._finish(node, o);
  };

  /* ---------- drums ------------------------------------------ */
  AudioEngine.prototype.kick = function (at, gain) {
    var g = gain || 1.0;
    /* the pitch dive does the punch; the noise click does the stick */
    this.tone({ type: 'sine', f0: human(165, 0.05), f1: 42, dur: 0.32, gain: g * 0.95, bus: this.musicBus, at: at });
    this.noise({ f0: 2800, filter: 'highpass', dur: 0.015, attack: 0.001, gain: g * 0.22, bus: this.musicBus, at: at });
    this.noise({ f0: 120, f1: 55, filter: 'lowpass', dur: 0.07, gain: g * 0.3, bus: this.musicBus, at: at });
  };
  AudioEngine.prototype.snare = function (at, gain, pan, verb) {
    var g = gain || 0.4;
    this.noise({
      f0: 1500, f1: 2600, filter: 'bandpass', dur: 0.17, attack: 0.002,
      gain: g * 0.9, bus: this.musicBus, at: at, pan: pan, verb: verb === undefined ? 0.06 : verb
    });
    this.tone({ type: 'triangle', f0: 200, f1: 128, dur: 0.12, gain: g * 0.45, bus: this.musicBus, at: at, pan: pan });
    this.tone({ type: 'sine', f0: 92, f1: 70, dur: 0.09, gain: g * 0.3, bus: this.musicBus, at: at, pan: pan });
  };
  AudioEngine.prototype.hat = function (at, open) {
    this.noise({
      f0: human(8200, 0.06), f1: 6800, filter: 'highpass',
      dur: open ? 0.24 : 0.05, gain: open ? 0.10 : 0.13, bus: this.musicBus, at: at,
      pan: (Math.random() * 2 - 1) * 0.14
    });
  };
  AudioEngine.prototype.riddimGuitar = function (chord, at, pan, gain) {
    /* a muted skank: the pick's air, then four square waves through a
       short plucked lowpass. The hp keeps it clear of the bass. */
    this.noise({ f0: 4200, filter: 'highpass', dur: 0.02, attack: 0.001, gain: 0.045 * gain, bus: this.musicBus, at: at, pan: pan });
    for (var i = 0; i < chord.length; i++) {
      this.tone({
        type: 'square', f0: human(chord[i], 0.002), dur: 0.15,
        gain: 0.05 * gain, pluck: 3400, lp: 1000, hp: 320,
        bus: this.musicBus, at: at, pan: pan,
        delay: this.intensity > 0.5 || this._wet > 1.3, verb: 0.05 * this._wet
      });
    }
  };

  /* ---------- percussion ---------- */
  /* the shaker: a short bright band of noise on the offbeat. It carries the
     top of the mix, which is what keeps a two-bar loop feeling alive. */
  AudioEngine.prototype.shaker = function (at, gain, pan) {
    this.noise({
      f0: human(6000, 0.08), f1: 9200, filter: 'bandpass', q: 1.1,
      dur: 0.045, attack: 0.002, gain: gain === undefined ? 0.05 : gain,
      bus: this.musicBus, at: at, pan: pan
    });
  };

  /* the binghi hand drums: skin over a wooden body, which is what the wood
     mode set is, plus the hand landing on it. A low boom, the funde keeping
     the pulse and a high repeater are the same voice at different pitches. */
  AudioEngine.prototype.handDrum = function (f, at, gain, pan, slap) {
    this.tone({
      type: 'sine', f0: human(f * 0.5, 0.04), f1: f * 0.32, dur: 0.13,
      gain: gain * 0.75, attack: 0.002, bus: this.musicBus, at: at, pan: pan
    });
    this.modal({
      f0: f, modes: MODES.wood, dur: 0.2, gain: gain * 0.5, lp: 1600,
      bus: this.musicBus, at: at, pan: pan, verb: 0.07
    });
    this.noise({
      f0: slap ? 2600 : 1400, f1: 420, filter: 'bandpass', q: 1.4, dur: 0.05,
      gain: gain * 0.45, bus: this.musicBus, at: at, pan: pan,
      verb: slap ? 0.12 : 0.05
    });
  };
  /* the repeater's sixteenths, accented so it sounds played rather than
     clocked. Rotated a little every cycle, so no two bars are identical. */
  var REPEATER = [0.9, 0, 0.35, 0, 0.7, 0, 0.5, 0.3, 0.9, 0, 0.35, 0, 0.7, 0.45, 0.5, 0.65];
  AudioEngine.prototype.bassNote = function (f, dur, when, o) {
    var ctx = this.ctx;
    var at = when - ctx.currentTime;
    var t = ctx.currentTime + at;
    var g = (o && o.gain) || 0.55;
    var bg = ctx.createGain();
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.linearRampToValueAtTime(g, t + 0.008);
    bg.gain.setValueAtTime(g * 0.9, t + dur * 0.6);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    bg.connect(this.bassShaper);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 0.9;
    lp.frequency.setValueAtTime(o && o.open ? 1400 : 760, t);
    lp.frequency.exponentialRampToValueAtTime(170, t + dur);
    lp.connect(bg);
    var sub = (o && o.sub) || 0.9;
    [f, f / 2].forEach(function (fr, idx) {
      var osc = ctx.createOscillator();
      osc.type = idx ? 'sine' : 'sawtooth';
      osc.frequency.setValueAtTime(fr, t);
      var og = ctx.createGain();
      og.gain.value = idx ? sub : 0.6;
      osc.connect(og); og.connect(lp);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    });
  };

  /* the melodica: breath, two detuned reeds, gentle vibrato */
  AudioEngine.prototype.melodica = function (f0, dur, when, opts) {
    opts = opts || {};
    var ctx = this.ctx, at = when - ctx.currentTime;
    this.tone({
      type: 'triangle', f0: f0, dur: dur, gain: opts.gain || 0.15,
      attack: 0.025, lp: 3200, at: at, bus: this.musicBus,
      delay: this.intensity > 0.5 || this._wet > 1.3, verb: 0.10 * this._wet,
      pan: opts.pan || 0, detune2: 6,
      vib: dur > 0.25 ? { rate: 5.4, depth: 4 } : null
    });
    /* breath attack */
    this.noise({
      f0: 2600, filter: 'bandpass', dur: 0.05, gain: (opts.gain || 0.15) * 0.5,
      bus: this.musicBus, at: at, pan: opts.pan || 0
    });
  };

  /* the horn section: a saw through a slow lowpass with a touch of
     growl -- the ska line leans on this instead of the melodica */
  AudioEngine.prototype.horn = function (f0, dur, when, opts) {
    opts = opts || {};
    var ctx = this.ctx, at = when - ctx.currentTime;
    this.tone({
      type: 'sawtooth', f0: f0, dur: dur, gain: opts.gain || 0.13,
      attack: 0.03, lp: 2400, hp: 180, at: at, bus: this.musicBus,
      detune2: 9, pan: opts.pan || 0,
      delay: this.intensity > 0.5 || this._wet > 1.3,
      verb: opts.verb === undefined ? 0.12 * this._wet : opts.verb,
      vib: { rate: 4.6, depth: 6 }
    });
  };

  /* steppers organ: a staccato chord bubble on the offbeat */
  AudioEngine.prototype.organ = function (chord, when, gain, pan) {
    var ctx = this.ctx, at = when - ctx.currentTime;
    for (var i = 0; i < chord.length; i++) {
      this.tone({
        type: 'square', f0: chord[i], dur: 0.10, gain: (gain || 0.05),
        attack: 0.004, pluck: 2600, lp: 1400, hp: 260,
        bus: this.musicBus, at: at, pan: pan, verb: 0.06 * this._wet
      });
    }
  };

  /* ---------- the sequencer ---------------------------------- */
  /* _scheduleStep(local, when): local is the step *within the current
     song*, so the arrangements below never have to know where the set
     is. Every feel shares the drums and the bass helper. */
  AudioEngine.prototype._bassLine = function (song, ch, k, when, opts) {
    for (var i = 0; i < song.bass.length; i++) {
      if (song.bass[i][0] === k) {
        var f = semi(ch.root, song.bass[i][1]);
        this.bassNote(human(f, 0.002), song.stepDur * song.bass[i][2] * 0.92, when, opts);
      }
    }
  };
  AudioEngine.prototype._leadLine = function (song, local, when, cycle, sec) {
    if (!song.mel || !sec.l) return;
    var idx = local % song.melLen;
    for (var m = 0; m < song.mel.length; m++) {
      if (song.mel[m][0] !== idx) continue;
      var f = song.mel[m][1];
      var raised = cycle >= 2 && (m % 2 === 1);
      if (raised) f *= 2;
      var dur = song.stepDur * song.mel[m][2] * 0.9;
      if (song.lead === 'organ') this.organ(semi(f, 0), when, 0.055, 0);
      else if (song.lead === 'horn') this.horn(f, dur, when, { gain: 0.12 });
      else this.melodica(f, dur, when, {});
      /* the counter-lead is the section asking for it (x) or a hot game */
      if (sec.x || this.intensity > 0.5) {
        if (song.lead === 'melodica') this.melodica(f * 1.4983, dur * 0.7, when, { gain: 0.06 });
        else if (song.lead === 'horn') this.horn(f * 1.5, dur * 0.8, when, { gain: 0.06 });
      }
    }
  };
  /* the drummer's last-bar fill -- shared by every feel, so the set can
     hand over without a seam */
  AudioEngine.prototype._fill = function (k, when, cycle, song) {
    if (k < 12) return;
    var fg = 0.09 + (k - 12) * 0.055;
    this.snare(when - this.ctx.currentTime, fg, 0.35, 0.10);
    if (k === 15) this.noise({
      f0: 5200, f1: 1200, filter: 'bandpass', dur: 0.22, gain: 0.13,
      bus: this.musicBus, at: when - this.ctx.currentTime, verb: 0.2
    });
  };

  AudioEngine.prototype._schedOneDrop = function (song, ch, k, when, sec, cycle) {
    var rel = when - this.ctx.currentTime;
    /* one drop: kick + snare together on beat 3 */
    if (sec.d) {
      if (k === 8) { this.kick(rel, 1.0); this.snare(rel, 0.4, -0.1, 0.09); }
      if (k === 14) this.snare(rel, 0.22, 0.1, 0.06);
      if (k % 2 === 0) this.hat(when, k === 6 || k === 14);
      if (this.intensity > 0.5 && k % 2 === 1) this.hat(when, false);
    }
    if (sec.k && k % 4 === 2) {
      var ai = Math.floor(k / 4) % 4;
      var acc = SKANK_ACCENT[ai];
      this.riddimGuitar(ch.chord, rel, (ai % 2 ? 0.3 : -0.3) + (Math.random() * 2 - 1) * 0.08, acc);
    }
    if (sec.b) this._bassLine(song, ch, k, when, {});
  };

  /* ROCKERS: the one drop played heavy. There is a kick pushing into the
     drop, the snare answers off the beat, and the organ bubbles under it --
     weight rather than speed, which is the whole difference from steppers. */
  AudioEngine.prototype._schedRockers = function (song, ch, k, when, sec, cycle) {
    var rel = when - this.ctx.currentTime;
    if (sec.d) {
      if (k === 6) this.kick(rel, 0.7);                      /* the push */
      if (k === 8) { this.kick(rel, 1.05); this.snare(rel, 0.46, -0.12, 0.1); }
      if (k === 9) this.snare(rel, 0.18, 0.22, 0.07);        /* the answer */
      if (k === 12) this.snare(rel, 0.2, 0.3, 0.08);
      if (k === 15) this.kick(rel, 0.5);
      if (k % 2 === 0) this.hat(when, k === 4 || k === 12);
      if (this.intensity > 0.5 && k % 2 === 1) this.hat(when, false);
    }
    if (sec.k && k % 4 === 2) this.riddimGuitar(ch.chord, rel, (Math.random() * 2 - 1) * 0.25, 0.9);
    if (sec.o && k % 2 === 1) this.organ(ch.chord, when, 0.03, (Math.random() * 2 - 1) * 0.25);
    if (sec.b) this._bassLine(song, ch, k, when, { open: true });
  };

  /* NYABINGHI: hand drums and nothing else. The boom lands on 1 and into the
     third bar, the funde keeps the pulse between them, and a repeater runs
     sixteenths that answer themselves. No kit, no backbeat -- this is the
     oldest thing on the table. */
  AudioEngine.prototype._schedBinghi = function (song, ch, k, when, sec, cycle) {
    var rel = when - this.ctx.currentTime;
    if (sec.d) {
      if (k === 0 || k === 10) this.handDrum(98, rel, 0.5, -0.2, false);
      if (k === 6) this.handDrum(122, rel, 0.32, 0.25, false);
      if (k % 4 === 2) this.handDrum(215, rel, 0.2, -0.35, false);
      if (k === 12) this.handDrum(246, rel, 0.22, 0.35, true);
      var acc = REPEATER[(k + (cycle % 2) * 4) % 16];
      if (acc) this.handDrum(430 + acc * 60, rel, 0.05 + acc * 0.075, (k % 4 - 1.5) * 0.35, acc > 0.6);
    }
    if (sec.k && k % 4 === 2) this.riddimGuitar(ch.chord, rel, (Math.random() * 2 - 1) * 0.2, 0.7);
    if (sec.b) this._bassLine(song, ch, k, when, { sub: 1.0 });
  };

  AudioEngine.prototype._schedSteppers = function (song, ch, k, when, sec, cycle) {
    var rel = when - this.ctx.currentTime;
    if (sec.d) {
      /* four on the floor: that is what makes it steppers */
      if (k % 4 === 0) this.kick(rel, 0.95);
      if (k === 8) this.snare(rel, 0.34, 0.05, 0.07);
      if (k === 14) this.snare(rel, 0.18, 0.25, 0.06);
      if (k % 2 === 0) this.hat(when, k === 6 || k === 14);
      if (this.intensity > 0.5 && k % 2 === 1) this.hat(when, false);
      if (k === 4 || k === 12) {
        this.noise({
          f0: 3200, f1: 2600, filter: 'bandpass', dur: 0.09, gain: 0.14,
          bus: this.musicBus, at: rel, pan: k === 4 ? -0.3 : 0.3, verb: 0.08 * this._wet
        });
      }
    }
    /* skank on the upbeats, organ bubbling in the gaps between them */
    if (sec.k && k % 4 === 2) this.riddimGuitar(ch.chord, rel, (Math.random() * 2 - 1) * 0.2, 0.95);
    if (sec.o && k % 2 === 1) this.organ(ch.chord, when, 0.032, (Math.random() * 2 - 1) * 0.25);
    if (sec.b) this._bassLine(song, ch, k, when, { open: true });
  };

  /* DUB: the space is the arrangement, but the space needs a frame -- the
     open hat and the shaker run through it, and this riddim sits at 86
     rather than the 66 it used to drag at. */
  AudioEngine.prototype._schedDub = function (song, ch, k, when, sec, cycle) {
    var rel = when - this.ctx.currentTime;
    if (sec.d) {
      if (k === 8) { this.kick(rel, 1.0); this.snare(rel, 0.42, -0.15, 0.3); }
      if (k === 4) this.snare(rel, 0.16, 0.2, 0.2);            /* drenched */
      if (k === 14) this.snare(rel, 0.1, 0.3, 0.16);
      if (k % 4 === 2) this.hat(when, true);                   /* open */
      this.shaker(when - this.ctx.currentTime, k % 2 ? 0.045 : 0.03, (k % 4 - 1.5) * 0.3);
    }
    /* one chop a bar, and only every other bar: this is the dub of the
       song, the space is the arrangement */
    if (sec.k) {
      if (k === 12 && cycle % 2 === 0) this.riddimGuitar(ch.chord, rel, 0.2, 0.8);
      if (k === 6 && cycle % 2 === 1) this.riddimGuitar(ch.chord, rel, -0.25, 0.6);
    }
    if (sec.b) this._bassLine(song, ch, k, when, { sub: 1.1 });
  };

  AudioEngine.prototype._schedSka = function (song, ch, k, when, sec, cycle) {
    var rel = when - this.ctx.currentTime;
    if (sec.d) {
      if (k === 0 || k === 8) this.kick(rel, 0.9);
      if (k === 4 || k === 12) this.snare(rel, 0.3, k === 4 ? -0.12 : 0.12, 0.08);
      if (k % 4 === 0) this.hat(when, false);
      if (k % 2 === 1) this.hat(when, false);
    }
    if (sec.k && k % 4 === 2) this.riddimGuitar(ch.chord, rel, (Math.random() * 2 - 1) * 0.3, 1.0);
    if (sec.b) this._bassLine(song, ch, k, when, { open: true });
  };

  /* _scheduleSongStep(song, local, when): the sequencer, in one place.
     `local` is the step within THIS song, so a section never has to know
     where the set is. Everything a section switches -- drums, skank, organ,
     bass, lead, counter-lead, percussion, how wet -- is decided here, which
     is why the feels below only have to know how their own kit plays. */
  AudioEngine.prototype._scheduleSongStep = function (song, local, when) {
    var secBars = song.secBars || 4;
    var secLen = secBars * STEPS_PER_BAR;
    var k = local % STEPS_PER_BAR;
    var bar = Math.floor(local / STEPS_PER_BAR) % song.prog.length;
    var cycle = Math.floor(local / (STEPS_PER_BAR * song.prog.length));
    var ch = song.prog[bar];
    var arr = song.arrange;
    var sec = arr ? arr[Math.floor(local / secLen) % arr.length] : FULL;
    this._wet = sec.w || 1;
    /* the last bar of every section takes a fill, and the last bar of the
       song takes the big one that hands the set on */
    if (sec.d && k >= 12 &&
        (local % secLen === secLen - STEPS_PER_BAR || local >= song.run - STEPS_PER_BAR)) {
      this._fill(k, when, cycle, song);
    }
    /* the wet flag opens the echo: a dub break is a send, not a note */
    if (k === 0 && this.delaySend) {
      this.delaySend.gain.setTargetAtTime(0.34 * this._wet, when, 0.08);
    }
    if (sec.p) this.shaker(when - this.ctx.currentTime, k % 2 ? 0.05 : 0.028, (k % 4 - 1.5) * 0.35);
    var feel = song.feel;
    if (feel === 'steppers') this._schedSteppers(song, ch, k, when, sec, cycle);
    else if (feel === 'rockers') this._schedRockers(song, ch, k, when, sec, cycle);
    else if (feel === 'binghi') this._schedBinghi(song, ch, k, when, sec, cycle);
    else if (feel === 'dub') this._schedDub(song, ch, k, when, sec, cycle);
    else if (feel === 'ska') this._schedSka(song, ch, k, when, sec, cycle);
    else this._schedOneDrop(song, ch, k, when, sec, cycle);
    this._leadLine(song, local, when, cycle, sec);
  };

  /* THE HANDOVER. A song ends on a bar line and the next one starts in
     the same beat: no silence, no fade. The dub delay is retimed to the
     new tempo while its tail from the old song is still in the air --
     the one move that makes a set sound played rather than queued. */
  AudioEngine.prototype._retimeDelay = function (song) {
    /* Ramp rather than jump: the tail already in the air bends into the new
       tempo instead of being cut off, which is what a tape echo does. */
    if (!this.delay) return;
    var now = this.ctx.currentTime;
    var dt = this.delay.delayTime;
    var target = Math.min(1.4, song.stepDur * 3);
    dt.cancelScheduledValues(now);
    dt.setValueAtTime(dt.value, now);
    dt.linearRampToValueAtTime(target, now + 0.35);
  };

  AudioEngine.prototype._advanceSong = function () {
    this._songIdx = (this._songIdx + 1) % SONGS.length;
    this._local = 0;
    var song = SONGS[this._songIdx];
    this._retimeDelay(song);
    if (this.onSong) this.onSong(song, this._songIdx);
  };

  AudioEngine.prototype.songName = function () { return SONGS[this._songIdx].name; };
  AudioEngine.prototype.songIndex = function () { return this._songIdx; };
  AudioEngine.prototype.playlist = function () { return SONGS.map(function (s) { return s.name; }); };

  /* ---------- mission inserts ---------- */
  /* playInsert(name): the game asks for a vamp. It takes over on the next
     BAR LINE of whatever is playing -- a cut mid-phrase sounds like a
     mistake, a cut on the bar sounds like a DJ -- plays its whole length,
     then hands the playlist back on the step it paused at, so the song it
     interrupted carries on rather than starting over. */
  AudioEngine.prototype.playInsert = function (name) {
    if (!this.ready) return false;
    var ins = null;
    for (var i = 0; i < INSERTS.length; i++) {
      if (INSERTS[i].name.toLowerCase() === String(name).toLowerCase()) ins = INSERTS[i];
    }
    if (!ins) return false;
    if (this._insert && this._insert.song === ins) return true;   /* already in it */
    this._pendingInsert = ins;
    return true;
  };
  /* cut an insert short (the game state ended early) and give the set back */
  AudioEngine.prototype.stopInsert = function () {
    this._pendingInsert = null;
    if (!this._insert) return false;
    this._insert = null;
    this._retimeDelay(SONGS[this._songIdx]);
    if (this.onInsert) this.onInsert(null, false);
    return true;
  };
  AudioEngine.prototype._startInsert = function () {
    var ins = this._pendingInsert;
    this._pendingInsert = null;
    this._insert = { song: ins, local: 0 };
    this._retimeDelay(ins);
    if (this.onInsert) this.onInsert(ins, true);
  };
  AudioEngine.prototype.insertName = function () { return this._insert ? this._insert.song.name : null; };
  /* what is actually coming out of the speakers: an insert outranks the
     playlist song, which is frozen underneath it while it plays */
  AudioEngine.prototype.nowPlaying = function () {
    if (this._insert) return this._insert.song.name;
    if (this._pendingInsert) return this._pendingInsert.name;
    return SONGS[this._songIdx].name;
  };
  AudioEngine.prototype.songPos = function () { return this._local; };
  AudioEngine.prototype.inserts = function () { return INSERTS.map(function (s) { return s.name; }); };

  AudioEngine.prototype.startMusic = function () {
    this.init();
    if (!this.ready || this.musicOn) return;
    this.musicOn = true;
    this.nextNoteTime = this.ctx.currentTime + 0.15;
    var self = this;
    this._timer = setInterval(function () { self._pump(); }, 25);
  };

  AudioEngine.prototype.stopMusic = function () {
    this.musicOn = false;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    /* an insert is part of the music: stopping the music ends it, so the
       next game does not resume halfway through a mission vamp */
    this._insert = null;
    this._pendingInsert = null;
  };

  /* multiball / jackpot moments push the band harder, and the dub delay
     tails come up with it -- hot mode is when the echo earns it */
  AudioEngine.prototype.setIntensity = function (v) {
    this.intensity = v;
    this._musicBase = MUSIC_LEVEL * (1 + v * 0.35);
    if (this.musicBus) this.musicBus.gain.value = this._musicBase;
    if (this.dwet) this.dwet.gain.value = 0.5 + v * 0.2;
  };

  AudioEngine.prototype._pump = function () {
    if (!this.ready || !this.musicOn) return;
    var horizon = this.ctx.currentTime + 0.20;
    var guard = 0;
    while (this.nextNoteTime < horizon && guard++ < 64) {
      /* a queued insert waits for the next bar line of whatever is playing */
      if (this._pendingInsert && this._step % STEPS_PER_BAR === 0) this._startInsert();
      if (this._insert) {
        var ins = this._insert;
        this._scheduleSongStep(ins.song, ins.local, this.nextNoteTime);
        this.nextNoteTime += ins.song.stepDur;
        ins.local++;
        if (ins.local >= ins.song.run) {
          this._insert = null;
          this._retimeDelay(SONGS[this._songIdx]);
          if (this.onInsert) this.onInsert(null, false);
        }
      } else {
        var song = SONGS[this._songIdx];
        this._scheduleSongStep(song, this._local, this.nextNoteTime);
        this.nextNoteTime += song.stepDur;
        this._local++;
        if (this._local >= song.run) this._advanceSong();
      }
      this._step++;
    }
  };

  /* ---------- the ball rolling on the playfield --------------- */
  /* speed is |vx|+|vy| in table units/s. Called ~12x/s per moving ball;
     every call steers the one continuous rolling voice rather than
     spawning a burst, so the ball has a single, smooth, speed-tracking
     sound. */
  AudioEngine.prototype.roll = function (speed, pan) {
    if (!this.ready || this.muted || !this._roll) return;
    var r = this._roll, now = this.ctx.currentTime;
    speed = Math.max(3, Math.min(70, speed));
    r.gain.gain.setTargetAtTime(Math.min(0.14, 0.012 + speed / 190), now, 0.03);
    r.band.frequency.setTargetAtTime(Math.min(2400, 240 + speed * 32), now, 0.04);
    r.lp.frequency.setTargetAtTime(Math.min(5600, 900 + speed * 95), now, 0.04);
    if (r.pan) r.pan.pan.setTargetAtTime(Math.max(-MAXPAN, Math.min(MAXPAN, pan || 0)), now, 0.06);
    r.until = now + 0.22;
  };

  /* the watchdog: a ball that stopped rolling stops calling roll(), and
     a silent ball has to actually go quiet -- likewise a plunger that
     the player let go of */
  AudioEngine.prototype._rollWatch = function () {
    if (!this.ready) return;
    var now = this.ctx.currentTime;
    if (this._roll && (this.muted || now > this._roll.until)) {
      this._roll.gain.gain.setTargetAtTime(0.0001, now, 0.06);
    }
    if (this._charge && (this.muted || now > this._charge.until)) {
      this._charge.gain.gain.setTargetAtTime(0.0001, now, 0.05);
    }
  };

  /* chargeLevel(v): how hard the plunger is being pulled, 0..1. Called
     every frame while charging; steers the spring voice. */
  AudioEngine.prototype.chargeLevel = function (v) {
    if (!this.ready || this.muted || !this._charge) return;
    var c = this._charge, now = this.ctx.currentTime;
    v = Math.max(0, Math.min(1, v || 0));
    c.osc.frequency.setTargetAtTime(190 + v * 430, now, 0.05);
    c.band.frequency.setTargetAtTime(1200 + v * 1900, now, 0.05);
    c.lp.frequency.setTargetAtTime(1800 + v * 2600, now, 0.05);
    c.gain.gain.setTargetAtTime(0.02 + v * 0.11, now, 0.06);
    c.until = now + 0.2;
  };

  /* ---------- game sound effects ----------------------------- */
  /* sfx(name, param, pan): pan is -1..1 across the playfield, left
     to right, so the machine sounds built rather than mono. */
  AudioEngine.prototype.sfx = function (name, param, pan) {
    if (!this.ready || this.muted) return;
    this._trim = SFX_TRIM[name] || 1;
    this._voice(name, param, pan);
    this._trim = 1;
  };

  AudioEngine.prototype._voice = function (name, param, pan) {
    switch (name) {
      /* ---- flippers: the coil firing, and the spring bringing it back.
         Four layers: the plastics meeting their stop, the frame taking
         the load, the L-bracket ringing, and the coil's own buzz. ---- */
      case 'flipper':
        this.noise({ f0: 3000, filter: 'highpass', dur: 0.010, attack: 0.0008, gain: 0.40, pan: pan });
        this.noise({ f0: 520, f1: 260, filter: 'bandpass', dur: 0.06, gain: 0.22, pan: pan });
        this.modal({ f0: 315, modes: MODES.chrome, dur: 0.13, gain: 0.26, pan: pan });
        this.tone({ type: 'sine', f0: human(175, 0.05), f1: 58, dur: 0.11, gain: 0.40, attack: 0.0015, pan: pan });
        /* the coil buzz: a fast amplitude rattle, not a pitch */
        this.tone({ type: 'square', f0: human(1800, 0.08), dur: 0.022, gain: 0.11, lp: 5200, am: { rate: 90, depth: 0.6 }, pan: pan });
        break;
      case 'flipperReturn':
        /* softer, deader, and the spring sproings */
        this.noise({ f0: 2200, filter: 'highpass', dur: 0.008, attack: 0.0008, gain: 0.24, pan: pan });
        this.modal({ f0: 470, modes: MODES.wood, dur: 0.10, gain: 0.16, pan: pan });
        this.tone({ type: 'sine', f0: human(120, 0.06), f1: 70, dur: 0.09, gain: 0.26, attack: 0.0015, pan: pan });
        this.tone({ type: 'sawtooth', f0: 300, f1: 180, dur: 0.09, gain: 0.07, lp: 1800, pan: pan });
        break;

      /* ---- pop bumper: the hardest hit in the game. A big coil thump,
         a chrome ring around the skirt, and the ball rattling in it. ---- */
      case 'bumper':
        var bi = param || 0;
        this.tone({ type: 'sine', f0: human(132 + bi * 14, 0.05), f1: 52, dur: 0.14, gain: 0.46, attack: 0.0015, pan: pan });
        this.noise({ f0: 3200, filter: 'highpass', dur: 0.010, attack: 0.0008, gain: 0.36, pan: pan });
        this.noise({ f0: 320, f1: 120, filter: 'lowpass', dur: 0.09, gain: 0.22, pan: pan });
        this.modal({ f0: 470 + bi * 55, modes: MODES.chrome, dur: 0.30, gain: 0.30, pan: pan, verb: 0.08 });
        /* the ball dancing against the skirt: three quick ticks */
        for (var b1 = 0; b1 < 3; b1++) {
          this.noise({
            f0: 2400 + b1 * 300, filter: 'bandpass', dur: 0.018, attack: 0.001,
            gain: 0.14, at: 0.012 + b1 * 0.016, pan: pan
          });
        }
        break;

      case 'sling':
        /* rubber under a kicker arm: the snap, the arm's thump, a small
           chrome ring on the bracket */
        this.noise({ f0: 3200, f1: 900, filter: 'bandpass', dur: 0.05, attack: 0.001, gain: 0.42, pan: pan });
        this.tone({ type: 'sine', f0: human(210, 0.05), f1: 80, dur: 0.09, gain: 0.26, attack: 0.0015, pan: pan });
        this.modal({ f0: 620, modes: MODES.chrome, dur: 0.13, gain: 0.22, pan: pan });
        this.tone({ type: 'triangle', f0: 1500, f1: 1200, dur: 0.03, gain: 0.14, pan: pan });
        break;

      /* ---- wood and plastic furniture ---- */
      case 'post':
        this.noise({ f0: 3600, filter: 'highpass', dur: 0.006, attack: 0.0008, gain: 0.15, pan: pan });
        this.tone({ type: 'sine', f0: human(260, 0.06), f1: 120, dur: 0.05, gain: 0.13, attack: 0.0015, pan: pan });
        this.modal({ f0: 1100, modes: MODES.wood, dur: 0.06, gain: 0.05, pan: pan });
        break;
      case 'bash':
        /* the tiki: a dry wooden knock -- wood modes, no metal at all */
        this.tone({ type: 'sine', f0: human(205, 0.08), f1: 66, dur: 0.17, gain: 0.42, attack: 0.0015, pan: pan, verb: 0.14 });
        this.noise({ f0: 900, f1: 350, filter: 'bandpass', dur: 0.05, gain: 0.20, pan: pan });
        this.modal({ f0: 190, modes: MODES.wood, dur: 0.55, gain: 0.16, pan: pan, verb: 0.16 });
        break;

      /* ---- the metal targets ---- */
      case 'target':
        /* the drop target holing: plastic slam, then the latch */
        this.noise({ f0: 2800, filter: 'highpass', dur: 0.009, attack: 0.0008, gain: 0.30, pan: pan });
        this.tone({ type: 'sine', f0: human(190, 0.05), f1: 60, dur: 0.09, gain: 0.30, attack: 0.0015, pan: pan });
        this.modal({ f0: 705, modes: MODES.chrome, dur: 0.20, gain: 0.28, pan: pan, verb: 0.07 });
        this.tone({ type: 'square', f0: 950, f1: 600, dur: 0.05, gain: 0.09, pluck: 3000, lp: 1200, at: 0.03, pan: pan });
        break;
      case 'standup':
        /* a steel face bolted to the field: mostly ring */
        this.noise({ f0: 4200, filter: 'highpass', dur: 0.007, attack: 0.0008, gain: 0.16, pan: pan });
        this.modal({ f0: human(1180, 0.03), modes: MODES.steel, dur: 0.26, gain: 0.17, pan: pan, verb: 0.09 });
        this.tone({ type: 'sine', f0: 320, f1: 160, dur: 0.06, gain: 0.12, pan: pan });
        break;
      case 'rollover':
        /* a star rollover over a wireform: glassy, and the wire rings */
        this.modal({ f0: 740, modes: MODES.bell, dur: 0.28, gain: 0.13, pan: pan, verb: 0.12 });
        this.tone({ type: 'sine', f0: 1110, f1: 1480, dur: 0.10, gain: 0.07, at: 0.03, pan: pan, verb: 0.12 });
        break;
      case 'spinner':
        /* blades: a tick per blade plus the air being chopped. `param`
           is the spin count, so the whir rises with the spin. */
        this.noise({ f0: 4200, filter: 'highpass', dur: 0.006, attack: 0.0008, gain: 0.12, pan: pan });
        this.modal({ f0: 1900, modes: MODES.chrome, dur: 0.05, gain: 0.05, pan: pan });
        this.noise({
          f0: 1300 + (param || 0) * 40, filter: 'bandpass', q: 2.5, dur: 0.22,
          gain: 0.055, pan: pan, delay: (param || 0) > 3
        });
        break;

      /* ---- the ball leaving, and being saved ---- */
      case 'drain':
        /* down the trough: it bounces on its way, then lands in the
           box, and the dub delay carries it away */
        this.tone({ type: 'sawtooth', f0: 320, f1: 48, dur: 1.0, gain: 0.20, lp: 1100, delay: true, pan: pan, verb: 0.16 });
        this.noise({ f0: 520, f1: 90, filter: 'lowpass', dur: 0.9, gain: 0.12, pan: pan });
        for (var d1 = 0; d1 < 3; d1++) {
          this.modal({
            f0: 340 - d1 * 40, modes: MODES.wood, dur: 0.22,
            gain: 0.13, at: 0.12 + d1 * 0.14, pan: pan
          });
          this.noise({ f0: 2600, filter: 'highpass', dur: 0.008, gain: 0.07, at: 0.12 + d1 * 0.14, pan: pan });
        }
        this.tone({ type: 'sine', f0: 90, f1: 40, dur: 0.5, gain: 0.30, at: 0.45, pan: pan });
        break;
      case 'ballsave':
        /* two steel bells, and the delay throws the second one */
        this.modal({ f0: 700, modes: MODES.bell, dur: 0.5, gain: 0.16, delay: true, verb: 0.14 });
        this.modal({ f0: 1050, modes: MODES.bell, dur: 0.5, gain: 0.12, at: 0.11, delay: true, verb: 0.14 });
        break;

      /* ---- the ramps and the launch ---- */
      case 'rampup':
        /* the ball climbing: the air rises, the wireform sings */
        this.noise({ f0: 500, f1: 3800, filter: 'bandpass', dur: 0.5, gain: 0.20, pan: pan, verb: 0.06 });
        this.tone({ type: 'sawtooth', f0: 160, f1: 520, dur: 0.5, gain: 0.12, lp: 1600, pan: pan });
        this.modal({ f0: 940, modes: MODES.steel, dur: 0.35, gain: 0.07, at: 0.34, pan: pan, verb: 0.14 });
        break;
      case 'ramp':
        /* three chiming notes -- the shot's own motif, on bells now */
        var rr2 = [660, 880, 1320];
        for (var r3 = 0; r3 < rr2.length; r3++) {
          this.modal({
            f0: rr2[r3], modes: MODES.bell, dur: 0.6, gain: 0.15,
            at: r3 * 0.07, delay: true, verb: 0.12, pan: (r3 - 1) * 0.25
          });
        }
        this.tone({ type: 'sine', f0: 240, f1: 120, dur: 0.08, gain: 0.14, pan: pan });
        break;
      case 'launch':
        /* the plunger: the spring sproings, then the ball slams into the
           lane. The impact is what makes it read as a launch. */
        this.tone({ type: 'sawtooth', f0: 130, f1: 420, dur: 0.28, gain: 0.16, lp: 2200, vib: { rate: 17, depth: 30 } });
        this.noise({ f0: 300, f1: 3200, filter: 'bandpass', dur: 0.3, gain: 0.22 });
        this.noise({ f0: 2400, filter: 'highpass', dur: 0.01, attack: 0.0008, gain: 0.24, at: 0.045 });
        this.tone({ type: 'sine', f0: 200, f1: 80, dur: 0.12, gain: 0.32, at: 0.045 });
        this.modal({ f0: 620, modes: MODES.chrome, dur: 0.25, gain: 0.12, at: 0.045, verb: 0.1 });
        break;
      case 'kickback':
        /* a coil that fires a whole ball: the loudest thing in the box */
        this.tone({ type: 'sine', f0: human(150, 0.05), f1: 45, dur: 0.20, gain: 0.50, attack: 0.0015, pan: pan });
        this.noise({ f0: 600, f1: 3000, filter: 'bandpass', dur: 0.28, gain: 0.20, pan: pan });
        this.noise({ f0: 3600, filter: 'highpass', dur: 0.009, gain: 0.24, at: 0.004, pan: pan });
        this.modal({ f0: 400, modes: MODES.steel, dur: 0.30, gain: 0.14, at: 0.01, pan: pan, verb: 0.1 });
        break;
      /* 'charge' is not a one-shot: the plunger is a continuous spring
         under load, so it lives in chargeLevel() above. */

      /* ---- the machine's own voice: tilt, nudge, the coin slot ---- */
      case 'tilt':
        /* dry and nasty, no reverb: an alarm should not sound like it is
           in the room with you, it should sound like it is in the glass */
        this.tone({ type: 'square', f0: 90, dur: 0.7, gain: 0.34, lp: 900, am: { rate: 22, depth: 0.85 } });
        this.tone({ type: 'square', f0: 96, dur: 0.7, gain: 0.20, lp: 900, am: { rate: 24, depth: 0.8 } });
        this.noise({ f0: 200, filter: 'lowpass', dur: 0.7, gain: 0.18 });
        this.tone({ type: 'sine', f0: 120, f1: 55, dur: 0.25, gain: 0.30 });
        break;
      case 'nudge':
        /* the whole cabinet moving on its legs */
        var np = param === 'left' ? -0.7 : param === 'right' ? 0.7 : 0;
        this.noise({ f0: 260, f1: 80, filter: 'lowpass', dur: 0.16, gain: 0.34, pan: np });
        this.tone({ type: 'sine', f0: 85, f1: 50, dur: 0.11, gain: 0.28, pan: np });
        this.modal({ f0: 150, modes: MODES.wood, dur: 0.25, gain: 0.26, pan: np });
        break;
      case 'coin':
        /* the coin hits the plate, then the credit is accepted */
        this.noise({ f0: 5200, filter: 'highpass', dur: 0.006, attack: 0.0008, gain: 0.20 });
        this.modal({ f0: human(2600, 0.05), modes: MODES.chrome, dur: 0.10, gain: 0.14 });
        this.modal({ f0: 988, modes: MODES.bell, dur: 0.45, gain: 0.13, at: 0.07, verb: 0.1 });
        this.modal({ f0: 1319, modes: MODES.bell, dur: 0.5, gain: 0.12, at: 0.15, delay: true, verb: 0.12 });
        break;

      /* ---- the score cues: bells, because a pinball celebrates on
         bells and chimes, not on square waves ---- */
      case 'bonus':
        this.modal({ f0: 1400 + (param || 0) * 60, modes: MODES.bell, dur: 0.08, gain: 0.09, pan: pan });
        break;
      case 'multiball':
        this.duck(1.4);
        var arp = [440, 554, 659, 880, 1109, 1319];
        for (var i2 = 0; i2 < arp.length; i2++) {
          this.modal({
            f0: arp[i2], modes: MODES.bell, dur: 0.7, gain: 0.14,
            at: i2 * 0.07, delay: true, verb: 0.14, pan: (i2 % 3 - 1) * 0.3
          });
        }
        /* a roll into it and a crash on top */
        for (var s2 = 0; s2 < 8; s2++) this.snare(s2 * 0.035, 0.1 + s2 * 0.02, 0.3 * (s2 % 2 ? 1 : -1), 0.2);
        this.noise({ f0: 400, f1: 6000, filter: 'bandpass', dur: 0.7, gain: 0.16, verb: 0.2 });
        this.noise({ f0: 6500, filter: 'highpass', dur: 1.1, gain: 0.11, at: 0.1, verb: 0.25 });
        break;
      case 'jackpot':
        this.duck(1.2);
        var j = [523, 659, 784, 1046, 1318, 1568, 2093];
        for (var q2 = 0; q2 < j.length; q2++) {
          this.modal({
            f0: j[q2], modes: MODES.bell, dur: 1.0, gain: 0.15,
            at: q2 * 0.06, delay: true, verb: 0.16, pan: (q2 % 4 - 1.5) * 0.28
          });
        }
        this.tone({ type: 'sine', f0: 180, f1: 40, dur: 0.6, gain: 0.28 });
        this.noise({ f0: 6000, filter: 'highpass', dur: 1.0, gain: 0.10, at: 0.05, verb: 0.25 });
        break;
      case 'start':
        /* the attract fanfare: bells up an arpeggio, a swell underneath */
        var s3 = [330, 415, 494, 659];
        for (var z3 = 0; z3 < s3.length; z3++) {
          this.modal({
            f0: s3[z3], modes: MODES.bell, dur: 0.6, gain: 0.14,
            at: z3 * 0.1, verb: 0.12, pan: (z3 % 2 - 0.5) * 0.5
          });
        }
        this.noise({ f0: 400, f1: 5200, filter: 'bandpass', dur: 0.45, gain: 0.13, verb: 0.16 });
        this.tone({ type: 'sawtooth', f0: 82, f1: 165, dur: 0.45, gain: 0.12, lp: 900, verb: 0.1 });
        break;
      case 'gameover':
        var go = [440, 392, 330, 262];
        for (var w2 = 0; w2 < go.length; w2++) {
          this.modal({
            f0: go[w2], modes: MODES.bell, dur: 1.1, gain: 0.16,
            at: w2 * 0.18, delay: true, verb: 0.18, pan: (w2 % 2 - 0.5) * 0.4
          });
        }
        /* a low organ note under the descent, so it reads as an ending */
        this.tone({ type: 'sawtooth', f0: 65.4, dur: 1.6, gain: 0.14, attack: 0.12, lp: 700, verb: 0.2 });
        break;
    }
  };

  AudioEngine.SONGS = SONGS;
  AudioEngine.INSERTS = INSERTS;
  AudioEngine.MUSIC_LEVEL = MUSIC_LEVEL;
  AudioEngine.SFX_LEVEL = SFX_LEVEL;
  AudioEngine.MODES = MODES;
  global.PB.AudioEngine = AudioEngine;
})(window);
