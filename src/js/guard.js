/* ============================================================
   ONE DROP PINBALL  --  guard.js
   A frame-time governor: hold 60 fps on a machine that cannot
   hold it at full quality.

   WHAT IT MEASURES
     The loop already has the frame interval in its hands (the gap between
     requestAnimationFrame timestamps), so it hands each one here. A frame
     is judged against a 60 Hz budget:

       at or under 17.2 ms   holding the target   (1.03 x budget)
       over        18.3 ms   off the target       (1.10 x budget)

     Both bands sit just either side of 16.7 ms rather than below it, and
     that is the whole point: on a v-synced display 16.7 ms is the FASTEST
     frame there is, so a threshold under it -- 14 ms, say -- is a green
     light no healthy machine can ever reach, and the governor would have
     no way back up. The dead band between the two also absorbs ordinary
     jitter, so a machine that is holding 60 is left alone.

     A single frame is not evidence, though. What the governor actually
     watches is how OFTEN the target is missed -- see the hysteresis note
     at the bottom for why that is the only measure worth having.

   WHAT IT TURNS DOWN, IN ORDER
     Two levers, each a multiplier on what is already there:

       mirror   the live mirror panels' render targets (768x768 each, three
                of them = 1.8 MPix a frame, more than the whole main view).
                They are seen edge-on as slivers through the glass, so they
                are the cheapest quality to give up and they go first.
       render   the drawing buffer, via the renderer's pixel ratio, so the
                browser scales the canvas up. This is the lever everyone
                feels, so it goes last, and the ladder stops at half.

     Nothing here reallocates per frame: a tier change is one setPixelRatio
     and three target resizes, and then the governor is quiet for a while.

   AND WHAT IT WILL NOT ASK FOR AT ALL
     The tiers are RELATIVE -- they multiply the full-quality pixel ratio the
     page started with -- and that ratio is the one place this game could ask
     a driver for more than a driver wants to give. `min(devicePixelRatio, 2)`
     on a large window is a buffer of several megapixels, and with MSAA on
     top (the browser's default 4x on desktop) every pixel of it costs four
     samples of memory and bandwidth across FOUR passes a frame, three of
     them mirrors. That is the shape of a frame that can push a GPU sharing
     system RAM into a driver reset: the watchdog sees an engine that has
     stopped answering, tears the context down, and every WebGL context in
     the browser dies with it -- which the player sees as the machine going
     black mid-game. A machine that was only ever asked for a sane buffer
     does not get there. So there is a hard ceiling on the drawing buffer
     (PIX_BUDGET below), applied through the same full-quality scale the
     tiers multiply, and it never scales BELOW 1: the ceiling trims a retina
     multiplier, it never renders a window smaller than its own CSS size.

   AND IT KNOWS WHEN IT IS WRONG
     The control loop does not assume that lowering the resolution helps.
     It cannot: on a frame that is bound by draw submission or by JS, the
     same work is submitted either way, and the picture just gets softer
     for nothing. So every change is treated as an experiment -- after a
     2 s probe, if the frame time did not improve by at least 5%, the
     quality is handed straight back and the governor stops adapting for a
     while. (A 5% bar and a step of a third of the pixels: a step small
     enough to buy nothing is also too small to tell us anything, so the
     ladder's own steps are what make this judgement possible.) On a
     machine that is short of pixels this settles at the tier that holds
     60; on a machine that is short of CPU it settles back where it
     started, with the machine looking as it always did.

     Hysteresis: a tier is dropped when a quarter of the last 48 frames
     were late, and climbed back after 2.5 s in which fewer than one frame
     in twenty was. Every change clears the evidence and ignores the next
     second of samples (a buffer resize hitches), and nothing is dropped
     while a probe is still running, so each step is judged before the next
     one is taken. Dropping is quicker than climbing, so a machine that
     recovers its frame rate gets its picture back within a few seconds,
     and one that is only briefly busy cannot leave it permanently soft.

     Why a RATE and not an average: a machine that renders four frames in
     five at 16.7 ms and every fifth at 33 ms has an average of 20 ms and a
     player watching a stutter -- and an average, or any credit/debit tally
     that lets the good frames pay off the bad ones, will happily call that
     machine healthy forever. Measured on this machine: an idle page drops
     2 frames in 896 (0.2%), while one that cannot keep up and visibly
     stutters drops 147 in 677 (22%). The rate separates those two worlds;
     the mean does not.
   ============================================================ */
/* No imports on purpose. The governor is HANDED everything it touches --
   the renderer and the scene root, in attach() -- so it cannot fail to load,
   cannot depend on which module is evaluated first, and is never the reason
   the game's own chain breaks. */
(function (global) {
  'use strict';

  var TARGET_MS = 1000 / 60;
  var MISS_MS = TARGET_MS * 1.10;      /* 18.3: clearly not a 60 Hz frame */
  var GOOD_MS = TARGET_MS * 1.03;      /* 17.2: holding it (vsync is 16.7) */
  var DROP_WIN = 48;                   /* frames of evidence */
  var MIN_WIN = 24;                    /* never judge on fewer than this */
  var DROP_RATE = 0.25;                /* a quarter of them late: too many */
  var KEEP_RATE = 0.05;                /* under this, there is headroom */
  var RAISE_AFTER = 2.5;               /* seconds of headroom to climb a tier */
  var SETTLE = 1.0;                    /* ignore samples after a change */
  var PROBE = 2.0;                     /* how long to judge a change */
  var PROBE_GAIN = 0.95;               /* 5% better, or it was not the cause */
  var BACKOFF = 15;                    /* stop experimenting for this long */
  var MIN_W = 320;                     /* never render below this wide */
  var FIRST_SAMPLES = 30;

  /* The ceiling on the drawing buffer in PIXELS, at full quality (the
     tiers scale down from here). 4.2 MPix is around a 2400x1750 frame:
     large enough that a retina multiplier still shows on a normal window,
     small enough that MSAA cannot turn it into several 4K frames' worth of
     samples. The old page asked for whatever min(devicePixelRatio, 2) gave
     it -- see the header: on a large window with a retina-class ratio that
     is north of 17 MPix, which is what this exists to prevent. */
  var PIX_BUDGET = 4.2e6;

  /* Mirror fidelity first, resolution last -- see the note above. Each
     scale step gives up a third or more of the pixels, because a step too
     small to change the frame time is also too small to tell us anything:
     the governor would read "no improvement" off a 20% cut and wrongly
     conclude that resolution is not the problem. The floor is half the
     buffer, a quarter of its pixels, and 0.28 of the mirror targets. */
  var TIERS = [
    { scale: 1.00, mirror: 1.00 },
    { scale: 1.00, mirror: 0.60 },
    { scale: 0.78, mirror: 0.50 },
    { scale: 0.62, mirror: 0.40 },
    { scale: 0.50, mirror: 0.32 }
  ];

  var renderer = null, root = null, baseDpr = 1;
  var baseSize = new Map();           /* render target -> the size it was built at */
  var tier = 0, pinned = false, started = false;
  var recent = [];                    /* 1 = late, 0 = on time, newest last */
  var winsum = 0;                     /* late frames in `recent` */
  var onTime = 0;                     /* seconds of unbroken headroom */
  var samples = 0;                    /* frames seen since start() */
  var clock = 0;
  var settleUntil = 0, probeUntil = 0, backoffUntil = 0;
  var preChangeMs = 0, probeWindow = null, probeHadScale = false;
  var lastMs = 0, emaMs = 0;
  var changes = 0, backedOff = false, backoffs = 0, broken = false;

  function now() { return (global.performance || Date).now() / 1000; }
  function tierOf(i) { return TIERS[Math.max(0, Math.min(TIERS.length - 1, i))]; }

  /* ---- the evidence window -------------------------------------------- */
  function frameEvidence(ms) {
    var late = ms > MISS_MS ? 1 : 0;
    recent.push(late);
    winsum += late;
    if (recent.length > DROP_WIN) winsum -= recent.shift();
  }
  function missRate() { return recent.length ? winsum / recent.length : 0; }
  function forgetEvidence() { recent.length = 0; winsum = 0; onTime = 0; }

  /* ---- the two levers ------------------------------------------------ */
  function cssW() { return renderer ? (renderer.domElement.clientWidth || global.innerWidth || 0) : 0; }
  function cssH() { return renderer ? (renderer.domElement.clientHeight || global.innerHeight || 0) : 0; }

  /* The scale the buffer may run at before any tier touches it: the page's
     own ratio, held under PIX_BUDGET, and never under 1. A viewport with no
     size yet (the first call, before layout) just gets the plain ratio. */
  function fullDpr() {
    var w = cssW(), h = cssH();
    if (!w || !h) return baseDpr;
    return Math.max(1, Math.min(baseDpr, Math.sqrt(PIX_BUDGET / (w * h))));
  }

  function applyScale() {
    if (!renderer) return;
    var w = cssW();
    var want = fullDpr() * tierOf(tier).scale;
    if (tierOf(tier).scale < 1 && w > 0 && w * want < MIN_W) {
      /* too small to shrink further: the mirror lever still applies */
      want = Math.max(want, MIN_W / w);
    }
    if (Math.abs(renderer.getPixelRatio() - want) > 0.001) renderer.setPixelRatio(want);
  }

  function mirrorTargets() {
    var out = [];
    if (!root) return out;
    root.traverse(function (o) {
      var t = o.userData && o.userData.reflectionTarget;
      if (!t) return;
      /* remember what the panel was built at. The base size lives here and
         not on the target: a render target is not an Object3D, so it has no
         userData of its own to hang this on, and a rebuild that hands us a
         brand new target is simply seen for the first time here. */
      if (!baseSize.has(t)) baseSize.set(t, { w: t.width, h: t.height });
      out.push(t);
    });
    return out;
  }

  function applyMirror() {
    var m = tierOf(tier).mirror, list = mirrorTargets();
    for (var i = 0; i < list.length; i++) {
      var t = list[i], base = baseSize.get(t);
      var w = Math.max(64, Math.round(base.w * m));
      var h = Math.max(64, Math.round(base.h * m));
      if (t.width !== w || t.height !== h) t.setSize(w, h);
    }
    return list.length;
  }

  /* This runs from inside the game's own resize handler, so it is allowed
     to fail: a governor that can break a resize is worse than no governor. */
  function apply() {
    if (!renderer) return;
    try {
      applyScale();
      applyMirror();
    } catch (e) { /* the frame keeps what it has */ }
  }

  /* ---- the decision ladder ------------------------------------------- */
  function setTier(next, why) {
    next = Math.max(0, Math.min(TIERS.length - 1, next));
    if (next === tier) return false;
    var was = tier;
    tier = next;
    changes++;
    apply();
    settleUntil = clock + SETTLE;
    if (why === 'drop') {
      preChangeMs = emaMs;
      probeUntil = clock + PROBE;
      probeWindow = { sum: 0, n: 0 };
      /* only a change that actually gave up pixels can tell us whether the
         frame was short of them -- cutting the mirror targets alone says
         nothing, so that experiment must not end the search */
      probeHadScale = TIERS[next].scale < TIERS[was].scale;
    } else {
      probeUntil = 0;
      probeWindow = null;
    }
    /* the frames either side of a change are not comparable: a buffer
       resize hitches, and the machine is about to be measured at a
       different quality. Start the evidence again from here. */
    forgetEvidence();
    return true;
  }
  function climb() {
    if (tier === 0) return false;
    return setTier(tier - 1, 'raise');
  }

  function descend() {
    if (tier >= TIERS.length - 1) return false;
    return setTier(tier + 1, 'drop');
  }

  /* ---- one frame ------------------------------------------------------
     This is called from inside the game's frame loop, which it does not own.
     So the measuring is unconditional and the DECIDING is not allowed to
     throw: an exception here would kill everything after it in that frame --
     the render, the HUD, the physics -- on every single frame, which is a far
     worse failure than the frame rate the governor exists to protect. It
     happened once during development (`samples` had been replaced by the
     evidence window) and the page simply stopped dead: a black canvas with
     the loader gone. If deciding ever throws, the governor says so once, keeps
     the frame's measurement and stops adapting. */
  function sample(rawSeconds) {
    if (!renderer || !rawSeconds) return;
    var ms = rawSeconds * 1000;
    /* a stall (tab switch, breakpoint, a hitch) is not a frame time: the
       loop clamps those at 100 ms, and so do we */
    if (ms >= 100 || ms <= 0) return;
    if (global.document && global.document.hidden) return;
    lastMs = ms;
    emaMs = emaMs ? emaMs + (ms - emaMs) * 0.1 : ms;

    clock += rawSeconds;
    samples++;
    if (broken) return;
    try { judge(rawSeconds, ms); } catch (err) { disable(err); }
  }

  function disable(err) {
    broken = true;
    if (global.console && global.console.warn) {
      global.console.warn('[guard] frame-time governor stopped adapting: ' +
        ((err && err.message) || err));
    }
  }

  function judge(rawSeconds, ms) {
    if (pinned) return;                     /* held by hand; just measure */
    if (!started) return;                   /* still booting: nothing to judge */
    if (clock < settleUntil || samples < FIRST_SAMPLES) return;

    if (probeWindow) { probeWindow.sum += ms; probeWindow.n++; }
    if (probeUntil) {
      if (clock < probeUntil) return;       /* measuring, not judging */
      /* the experiment is over: did the quality we gave up buy anything? */
      var after = probeWindow && probeWindow.n ? probeWindow.sum / probeWindow.n : ms;
      var gaveUpPixels = probeHadScale;
      probeUntil = 0; probeWindow = null;
      if (after > preChangeMs * PROBE_GAIN && gaveUpPixels) {
        /* the resolution we gave up bought nothing: this frame is short of
           CPU or draws, not pixels, so hand ALL of it back and stop
           experimenting. A machine like this will not be rescued by a
           softer picture, and each retry costs it a visible pop, so a
           second useless round of experiments waits twice as long as the
           first, and a third twice that again. */
        backedOff = true;
        backoffs++;
        setTier(0, 'back-off');
        backoffUntil = clock + BACKOFF * Math.pow(2, Math.min(3, backoffs - 1));
        return;
      }
      backedOff = false;
      backoffs = 0;
    }

    if (clock < backoffUntil) { forgetEvidence(); return; }

    /* The evidence is a RATE over a rolling window, never a tally that good
       frames can pay off (see the header): a machine that misses one frame
       in five is a stutter the player can see, whatever its average time
       says. The window is also what makes the two thresholds a dead band --
       a machine sitting between them keeps what it has instead of flapping
       between qualities. */
    frameEvidence(ms);
    if (recent.length < MIN_WIN) return;
    var rate = missRate();
    if (rate > DROP_RATE) { descend(); return; }
    if (rate > KEEP_RATE) { onTime = 0; return; }   /* the dead band */
    if (ms >= GOOD_MS) { onTime = 0; return; }
    onTime += rawSeconds;
    if (onTime >= RAISE_AFTER) { onTime = 0; climb(); }
  }

  /* ---- wiring --------------------------------------------------------- */
  function attach(opts) {
    renderer = opts.renderer;
    root = opts.root || renderer.domElement;
    baseDpr = opts.baseDpr || Math.min(global.devicePixelRatio || 1, 2);
    apply();
  }

  /* ---- the boot is not a frame rate -----------------------------------
     Called once when the machine is revealed and the loader has gone, so
     that from there the loop is judging a GAME. A fresh load is a storm of
     one-off work no quality tier can help -- the atlas decode, the PMREM
     environment, the vibrance sweep, the batch fold -- and a governor that
     judged it would spend its first seconds dropping tiers on a machine
     that is perfectly fine, then handing them back. The interval is still
     MEASURED before this lands (the HUD's frame time is honest from the
     first frame); nothing is DECIDED. */
  function start() {
    started = true;
    samples = 0;
    forgetEvidence();
    clock = 0;
    settleUntil = 0;
    probeUntil = 0;
    probeWindow = null;
    backoffUntil = 0;
    changes = 0;
    backedOff = false;
    backoffs = 0;
  }

  /* ---- debug hook -----------------------------------------------------
     Pin a quality tier, or hand control back to the loop. Pinning is how
     the tiers get compared by hand (and by the dev probes): it takes the
     governor out of the way without changing what it draws at. */
  function force(i, pin) {
    if (i === null || i === undefined) { pinned = false; return state(); }
    pinned = !!pin;
    setTier(i, 'force');
    apply();
    return state();
  }

  function describe() {
    var t = tierOf(tier), bits = [];
    if (t.mirror < 1) bits.push('mirror ' + Math.round(t.mirror * 100) + '%');
    if (t.scale < 1) bits.push('render ' + Math.round(t.scale * 100) + '%');
    /* say so when the CEILING is what is holding the picture back, not a
       dropped tier -- otherwise a soft frame reads as the governor's doing */
    if (fullDpr() < baseDpr - 0.001) bits.push('capped');
    return bits.join(' \u00b7 ');
  }

  function state() {
    return { tier: tier, tiers: TIERS.length, scale: tierOf(tier).scale, mirror: tierOf(tier).mirror,
      capDpr: +fullDpr().toFixed(3), budget: PIX_BUDGET, started: started,
      lateRate: +missRate().toFixed(3), window: recent.length, broken: broken,
      frameMs: +lastMs.toFixed(2), emaMs: +emaMs.toFixed(2), changes: changes, backedOff: backedOff, pinned: pinned,
      buffered: [renderer ? renderer.domElement.width : 0, renderer ? renderer.domElement.height : 0],
      label: describe() };
  }

  global.PB = global.PB || {};
  global.PB.guard = { attach: attach, start: start, sample: sample, apply: apply, describe: describe, state: state, force: force };
})(window);
