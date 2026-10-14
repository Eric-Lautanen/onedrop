# The sound of One Drop Pinball

There are no audio files in this project. Every sound -- every bumper, every
riddim -- is synthesised in the browser at the moment it plays, out of
oscillators, noise and filters (`src/js/audio.js`). Nothing to download,
nothing to license, and every cue can be re-voiced by editing a number.

This note records what was built, what the mix is tuned to, and how to hear
and measure it yourself.

---

## 1. The kit

A pinball machine is not a synth. It is a pile of solenoids hitting metal and
plastic, and every cue is built that way: a **click** where two parts meet, a
**thud** with a falling pitch for the weight, and a **ring** for whatever
metal is bolted to it. A single frequency sounds like a beep; struck metal
rings at `1 : 2.76 : 5.40 : 8.93`, and that inharmonic ratio set is most of
the difference between a game sound and a machine sound. `modal()` in
`audio.js` plays those partials, each with its own decay (see `MODES`).

Twenty-four one-shot cues, panned by the hit's position across the field:

| cue | what it is |
|---|---|
| `flipper`, `flipperReturn` | coil firing / spring returning: plastics on the stop, the L-bracket's ring, the coil's own amplitude rattle |
| `bumper` | the hardest hit in the game: big coil thump, chrome ring, the ball dancing on the skirt |
| `sling`, `post`, `bash` | rubber snap, wood knock, the tiki's dry wooden boom |
| `target`, `standup`, `rollover`, `spinner` | drop target holing, steel faces ringing, a star rollover, the spinner's blade ticks and chopped air |
| `kickback`, `launch`, `rampup`, `ramp` | the loudest coil in the box, the plunger's spring slam, the ball climbing a wireform, the shot's own three-note motif |
| `drain`, `ballsave` | down the trough with its three bounces, and the save bells |
| `multiball`, `jackpot`, `bonus`, `start`, `gameover` | the celebrations, on bells, because pinball celebrates on bells |
| `tilt`, `nudge`, `coin` | the machine's own voice: a dry 22 Hz rattle that sits *in the glass* (no reverb), the cabinet shifting on its legs, the coin plate |

Two cues are not one-shots. A rolling ball and a held plunger are **single
continuous voices** whose pitch, level and pan are steered every frame:
firing a 90 ms burst twelve times a second made the ball click, so the ball
is one looping noise source behind a tracking bandpass, with a watchdog that
shuts it up when it stops moving.

## 2. The set

`SONGS` is a playlist of six riddims, kept as data -- a song is a page of
notation, not a branch in the sequencer. The set is laid out in **tempo
order** (78 up to 138), so a long game walks up the tempos and comes back
down:

| song | bpm | feel | bars | length | pulse, heard back out of the render |
|---|---|---|---|---|---|
| ONE DROP | 78 | one drop: kick and snare together on beat 3 | 28 | 86 s | 77.9 |
| DUB CHAMBER | 86 | half the notes, twice the space, drenched snare | 28 | 78 s | 86.0 |
| ROCKERS | 96 | the one drop played heavy: a kick push into the drop, the organ bubbling, a progression that never rests on the four | 28 | 70 s | 96.0 |
| SKANK RAIL | 106 | walking bass in eighths, bright offbeat chops, a horn line | 28 | 63 s | 106.0 |
| NYABINGHI | 118 | hand drums and no kit at all: the boom, the funde, a repeater running sixteenths | 28 | 57 s | 118.2 |
| STEPPERS | 138 | four on the floor, organ bubbling on the offbeat, eight-bar sections | 56 | 97 s | 137.9 |

The pulse is measured by autocorrelating the rendered kick envelope, and the
period is read in the song's **own beats** -- a period in seconds is not
comparable between a 78 and a 138. Which multiple of the beat wins moves
between renders (2, 4, 6 or 8) because several are equally strong in a
riddim; the tempo the song claims is what the check holds to a 4% band.

Each has its own progression, bass line and lead (melodica, organ, horn). The
set hands over **on a bar line** -- no silence, no fade -- and retimes the dub
delay to the new tempo while the old song's echo is still in the air, which
is the one move that makes a set sound played rather than queued. The whole
set is **7.5 minutes** before it repeats.

**The tempo floor is deliberate.** DUB CHAMBER used to sit at 66 bpm and it
read as a *drag*, not as dub: dub's space has to be framed by motion, not by
slowness, and at 66 the bar took so long that the echo tails ran into the
next chord. It is up at 86 with the open hat and the shaker running through
it and the bass walking into the bar line instead of waiting. The suite now
fails the build on a song slower than 76 bpm (`no song drags`), because "a
dub song should be slow" is exactly the instinct that produced the 66.

## 3. Arrangement: how a song gets a shape

A song is not one loop repeated. `arrange` is a list of **sections** -- each
one `secBars` bars of the same progression wearing one arrangement -- and the
flags are the whole vocabulary:

```
  d  drums      k  skank guitar     o  organ bubble
  b  bass       l  lead             x  counter-lead (a third up)
  p  percussion                     w  wet (1 normal, 2 drenched)
```

So a section is a *page*, and the song is a sequence of pages: intro, verse,
verse 2, chorus, break, chorus 2, outro. Every song here has **7 sections and
5-6 distinct shapes**, and every one has a **break** -- and a break is the
load-bearing section, because a break is what makes the return land.

Two kinds of break, and they are not interchangeable:

* **drums out** (ONE DROP, DUB CHAMBER, ROCKERS) -- the kit stops, the bass
  and the echo carry it. This barely moves the RMS, because the bass is the
  continuous energy; it moves the **peak**, because the transients are gone.
* **bass out** (SKANK RAIL, NYABINGHI, STEPPERS) -- the rhythm section plays
  on and the floor disappears. This moves the **RMS** by 3-9 dB and leaves
  the peak almost alone.

Which one a song gets is not a matter of taste: **SKANK RAIL walks its bass
in eighths**, so dropping the drums would leave something just as loud, and
the arrangement was rewritten once already for getting this wrong. Both
halves are now measured. The suite counts the voices each section actually
asks for (exact, no audio involved) and *also* renders the break against the
song's busiest section, so a section flag that never reached a voice cannot
pass by looking plausible in the source:

```
song         break voices  vs  busiest         measured difference
ONE DROP          28       vs  192  chorus     4.6 dB peak   (level 0.7)
DUB CHAMBER       16       vs  192  chant 2    4.8 dB peak   (level 0.4)
ROCKERS           60       vs  228  chorus     4.8 dB peak   (level 1.4)
SKANK RAIL        80       vs  208  chorus     5.8 dB level  (peak 0.2)
NYABINGHI         76       vs  200  fire       9.0 dB level  (peak 2.4)
STEPPERS         224       vs  432  chorus     3.3 dB level  (peak 0.5)
```

(The two columns above also explain the two break types: the drums-out breaks
are the ones whose *level* barely moves.)

## 4. Mission music: the inserts

Three short vamps live in `INSERTS`, and the game drops them into the set when
something big happens:

| insert | bpm | wired to | length |
|---|---|---|---|
| SKANK RIOT | 132 | multiball (`startMultiball`) | 8 bars, 15 s |
| MISSION VAMP | 112 | a completed mission (`completeMission`) | 4 bars, 9 s |
| IRIE MASTER | 100 | wizard mode (`startWizard`) | 8 bars, 19 s |

An insert is the same machinery as a song -- a page of notation -- with two
rules:

1. **It takes over on the next bar line** of whatever is playing. A cut
   mid-phrase sounds like a mistake; a cut on the bar sounds like a DJ.
2. **It plays its whole length and the set is handed back on the very step it
   paused at.** The interrupted song carries on rather than starting over,
   and the echo is retimed going in *and* coming back, so a tail already in
   the air bends with the tempo instead of being cut.

That second rule is the one worth protecting, and it is measured without any
audio at all, because it is a claim about the scheduler: the flow check reads
the stream of steps the engine actually asked the voices for and asserts that
the run of song before each insert stopped on step L and the same song picked
up on L+1. Measured takeovers: ROCKERS interrupted at step 247 and back on
248 after 128 steps of IRIE MASTER; NYABINGHI interrupted at step 23 and back
on 24 after 64 steps of MISSION VAMP.

`stopInsert()` is the game's side of "temporary", and `game.js` calls it at
every place a big moment can end early -- a multiball drained, the multiball
timer running out, the wizard timer running out -- and `stopMusic()` ends an
insert with the music, so the next game does not resume halfway through a
mission vamp. Without those calls a 15 s vamp would keep playing over
ordinary play after a multiball ended on the first shot. Two checks hold it:
one cuts a vamp short on the synthetic clock and asserts the set comes back
on the paused step with the echo retimed, and one drives the live game
(multiball asks for its vamp, the vamp takes over, resetting the game takes
it away).

## 5. The mix

Three buses meet a glue compressor on the master:

```
  music bus (MUSIC_LEVEL 0.16) ──┐
                                 ├─→ master gain (the player's fader) ─→ comp ─→ out
  sfx bus (SFX_LEVEL 1.0) ─ limiter ┘
```

* **The band sits behind the machine.** `MUSIC_LEVEL = 0.16` and one trim per
  cue (`SFX_TRIM`, the mixer page) put every cue well above the music bed;
  the smallest margin at the 50% default is +17.1 dB (the rollover,  the quietest cue in the kit), and the median is +20.8 dB.
* **The two limiters do different jobs.** The sfx bus has a fast limiter for
  five-bumper flurries; the master compressor keeps layered chords and a pile
  of simultaneous hits from clipping.
* **Big moments duck the band** (`duck()`): a jackpot or the start of
  multiball pulls the music down for a moment and lets it come back.

Measured cue peaks at the 50% fader, from the live page:

```
tilt     -6.9    jackpot  -9.4    multiball -9.7    flipper  -11.7
start   -11.7    kickback-12.1    bumper  -12.7    drain    -12.9
ramp    -13.6    gameover-13.9    bash    -14.0    launch   -14.1
rampup  -14.4    ballsave-14.8    target  -15.1    nudge    -15.1
spinner -15.8    sling   -15.8    standup -16.5    bonus    -16.6
coin    -16.8    flipperReturn-17.1        rollover -18.1
                                  music bed: mean -35.0 dB, peak -28.1 dB
```

(One cue per render, so the last digit moves a few tenths between runs; `post`
is measured by `dev/_cueone.py`, being outside the core set the suite ranks.)

The hierarchy is deliberate: the alarm and the celebrations on top, the
impacts next, the rings and ticks under them, and the band below everything.

## 6. The fader

`VOLUME` in the menu, **50% out of the box**, driving the master gain (and
saved to `localStorage`). The mix is built so the middle of the slider is a
real listening level: at 50% the band is a bed and every solenoid is on top
of it, and at 100% it is a loud arcade. `M` mutes, and unmuting restores the
player's own level rather than a fixed default.

The fader is keyboard-reachable. That needed a guard in `game.js`: the
machine swallows `Space`, `Slash` and the arrow keys on the window so they
can never move the camera or scroll the page, which is right for play and
wrong for a range input -- a focused menu field now keeps its own keys.

## 7. Hear it and measure it

```
dev/.venv-playfield/Scripts/python.exe dev/render-audio.py    # every cue, song, section and vamp -> dev/audio/*.wav
dev/.venv-playfield/Scripts/python.exe dev/verify-audio.py    # 43 checks against the live page
dev/.venv-playfield/Scripts/python.exe dev/_cueone.py         # one cue's gain sweep through the limiters
dev/.venv-playfield/Scripts/python.exe dev/_kitspread.py      # is a measurement stable enough to pass/fail on?
dev/.venv-playfield/Scripts/python.exe dev/_flowprobe.py      # just the mission-music checks, in seconds not minutes
```

`render-audio.py` writes both the WAVs (`dev/audio/`, 16-bit, the same code
the game plays) and `audio-render.json`, with peak, RMS, band balance and a
time profile per cue. It renders, for every song, the full song *and* its
break *and* its busiest section, chosen exactly the way the suite chooses
them, so the two sections the arrangement check is about are the two files
sitting on disk. It clears the folder before rendering, because a stale
`song-3.wav` next to a fresh one is worse than no file at all.
`verify-audio.py` writes `audio-verification.json`.

What the suite is actually protecting, in short: every cue audible and mixed,
the kit's metal inharmonic, the band under the machine, the fader at 50%,
the set advancing in order on bar lines with the echo retimed, six songs of
at least 50 s in six tempos and six feels with no song under 76 bpm, each
song's break measurably a break, and the mission inserts taking over on a bar
line, handing the set back where they found it, and being cut short when the
moment that asked for them ends.

Three measurement notes worth keeping:

* **Renders are the only trustworthy place to measure a cue.** A live
  `AnalyserNode` cannot show silence: once the master gain hits 0 its input is
  flagged silent, the node stops being pulled, and `getFloatTimeDomainData()`
  hands back the last loud block forever (measured: 0.08 RMS at gain 0, on a
  graph an offline render proves is exactly 0).
* **One frequency bin is not a measurement.** Judging a cue's brightness on a
  single 3200 Hz bin of a noise attack swings by up to 22 dB between identical
  renders -- enough to flip a pass/fail. `verify-audio.py` averages across a
  band, medians three renders, and then checks that the spread is small.
* **A section is not judged by level alone.** The first version of the
  arrangement check rendered each song's sparsest and busiest section and
  compared the RMS, and a drums-out break failed it: the bass is the
  continuous energy, so taking the kit away barely moves the average. The
  check is now "level **or** peak", and which one moves is a property of the
  break, not noise in the measurement.

## 8. What this does not do

* The room is authored, not captured: a generated plate reverb and a dub
  delay, no impulse of a real room and no HRTF.
* There is no HDR: it is a Web Audio graph with a linear fader, not a
  loudness-normalised master.
* Stereo is positional panning across the playfield, not binaural.
* A browser will not start audio without a gesture -- the engine resumes on
  the first click, key or touch.
* The intensity system still only raises the band by 35% and opens the delay
  (`setIntensity`); it does not layer or drop stems.
