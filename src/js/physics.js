/* ============================================================
   ONE DROP PINBALL  --  physics.js
   A small, tuned 2D solver. The playfield is the XY plane
   (x: left/right, y: drain -> arch). Gravity pulls toward -y.
   Everything is sub-stepped so a fast ball never tunnels.

   Three primitives cover the whole table:
     hitSegment  walls, rails, drop targets, the shack, the roof
     hitCircle   pop bumpers, posts, straw-hut posts
     hitCapsule  the flippers (they carry their surface velocity,
                 so a swinging flipper genuinely throws the ball)

   Wireform ramps are handled separately: a ball that enters a
   ramp mouth is lifted off the surface and carried along the
   path at the ramp's own height until it is released.
   ============================================================ */
(function (global) {
  'use strict';

  var EPS = 1e-9;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function len(x, y) { return Math.sqrt(x * x + y * y); }

  function hitSegment(ball, ax, ay, bx, by, e, f, dt, continuous) {
    var dx = bx - ax, dy = by - ay;
    var l2 = dx * dx + dy * dy;
    var t = l2 > EPS ? ((ball.x - ax) * dx + (ball.y - ay) * dy) / l2 : 0;
    /* A contact past either end is a contact with the segment's TIP, and a
       ball can balance on a tip for ever: the push-out points straight up,
       gravity pulls straight down, and nothing in the solver breaks that
       symmetry. Measured: the ROOTS ORBIT ramp releases its ball on the
       axis of the SKANK1 target, which used to park it at art (71, 27.2)
       -- 0.64 u above the target's top end, i.e. exactly a ball radius --
       for as long as the game ran. See the drift guard at the end. */
    var atTip = (l2 > EPS) && (t <= 0 || t >= 1);
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    var qx = ax + dx * t, qy = ay + dy * t;
    var nx = ball.x - qx, ny = ball.y - qy;
    var d = len(nx, ny);
    if (d > ball.r) return false;
    if (d < EPS) { nx = -dy; ny = dx; d = len(nx, ny) || 1; }
    nx /= d; ny /= d;
    if (continuous && atTip && l2 > EPS) {
      /* Shared polyline seams use the guide's surface normal, not the
         rounded endpoint normal that creates a horizontal micro-shelf. */
      var side = nx * (-dy) + ny * dx >= 0 ? 1 : -1;
      nx = -dy / Math.sqrt(l2) * side; ny = dx / Math.sqrt(l2) * side;
    }
    ball.x += nx * (ball.r - d);
    ball.y += ny * (ball.r - d);
    var vn = ball.vx * nx + ball.vy * ny;
    if (vn < 0) {
      var tx = -ny, ty = nx;
      var vt = ball.vx * tx + ball.vy * ty;
      var rn = -vn * e;
      var fr = Math.max(0, 1 - f * 9 * (dt || 1 / 180));
      var rt = vt * fr;
      ball.vx = nx * rn + tx * rt;
      ball.vy = ny * rn + ty * rt;
    }
    /* Balanced on a tip. Both conditions matter: the normal has to be
       near-vertical (that is the surface holding the ball up) and the ball
       has to be nearly stopped (a moving ball must never be given a kick it
       can feel). Flagged rather than nudged here, because the nudge has to
       know which way has room -- _collide does that. */
    if (!continuous && atTip && ny > 0.9 &&
        ball.vx * ball.vx + ball.vy * ball.vy < 2.25) {
      ball.tipRest = true;
    }
    return true;
  }

  function hitCircle(ball, cx, cy, r, e, kick, out) {
    var nx = ball.x - cx, ny = ball.y - cy;
    var d = len(nx, ny);
    var rr = ball.r + r;
    if (d > rr) return false;
    if (d < EPS) { nx = 0; ny = -1; d = 1; }
    nx /= d; ny /= d;
    ball.x = cx + nx * rr;
    ball.y = cy + ny * rr;
    var vn = ball.vx * nx + ball.vy * ny;
    if (vn < 0) {
      var tx = -ny, ty = nx;
      var vt = (ball.vx * tx + ball.vy * ty) * 0.97;
      ball.vx = nx * (-vn * e) + tx * vt;
      ball.vy = ny * (-vn * e) + ty * vt;
    }
    if (kick) { ball.vx += nx * kick; ball.vy += ny * kick; }
    if (out) { out.nx = nx; out.ny = ny; out.speed = Math.abs(vn); }
    return true;
  }

  function hitCapsule(ball, ax, ay, bx, by, rad, px, py, angVel, e, out) {
    var dx = bx - ax, dy = by - ay;
    var l2 = dx * dx + dy * dy;
    var t = l2 > EPS ? ((ball.x - ax) * dx + (ball.y - ay) * dy) / l2 : 0;
    t = clamp(t, 0, 1);
    var qx = ax + dx * t, qy = ay + dy * t;
    var nx = ball.x - qx, ny = ball.y - qy;
    var d = len(nx, ny);
    var rr = ball.r + rad;
    if (d > rr) return false;
    if (d < EPS) { nx = -dy; ny = dx; d = len(nx, ny) || 1; }
    nx /= d; ny /= d;
    ball.x = qx + nx * rr;
    ball.y = qy + ny * rr;

    /* velocity of the flipper surface at the contact point:
       v = omega x r  (2D) -> (-w*ry, w*rx) */
    var rx = qx - px, ry = qy - py;
    var svx = -angVel * ry, svy = angVel * rx;

    var rvx = ball.vx - svx, rvy = ball.vy - svy;
    var vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      var tx = -ny, ty = nx;
      var vt = (rvx * tx + rvy * ty) * 0.99;
      rvx = nx * (-vn * e) + tx * vt;
      rvy = ny * (-vn * e) + ty * vt;
    }
    ball.vx = rvx + svx;
    ball.vy = rvy + svy;
    /* The fixed pivot crown is another exact symmetric equilibrium.
       Roll toward the flipper blade so a swing can pick the ball up. */
    if (t < 0.05 && ny > 0.96 && Math.abs(ball.vx) < 0.1) ball.vx = dx > 0 ? 1.2 : -1.2;
    if (out) { out.nx = nx; out.ny = ny; out.point = { x: qx, y: qy }; }
    return true;
  }

  /* ---------------------------------------------------------- */
  function World(table) {
    this.table = table;
    /* Flipper lengths/surface velocities scale with the field. Gravity
       and the speed cap must scale too, or resized shots follow different
       arcs even though every piece of hardware has the same proportions. */
    var physicsScale = table.H / 48.94;
    this.gravity = 34 * physicsScale;
    this.drag = 0.035;
    /* 68, not 64: the launch is 25% stronger by design (game.js's band is
       32.5..67.5) and at the old cap a fully charged plunge was clipped
       back down, so the extra power was real on paper and invisible in
       play. 68 clears that 67.5 with a little headroom and nothing more:
       measured flipper shots that score a ramp run 19/19 at a 64 cap,
       14/15 at 68, and only 10/10 -- with half the contact positions lost
       -- at 70 and above, so the SMALLEST cap that delivers the launch
       keeps the most shots alive. Fixed step is 1/180 s: 0.38 u per
       substep against a 0.62 radius, no tunnelling. */
    this.maxSpeed = 68 * physicsScale;
    this.balls = [];
    this.time = 0;
    this.events = [];
    this.flippers = table.flippers.map(function (f) {
      return {
        side: f.side, px: f.px, py: f.py, len: f.len, rad: f.rad,
        restA: f.restA, upA: f.upA, curA: f.restA, angVel: 0,
        active: false, upSpeed: 30, downSpeed: 17, cool: 0
      };
    });
    this.ramps = (table.ramps || []).map(function (r) {
      var cum = [0], total = 0;
      for (var i = 1; i < r.pts.length; i++) {
        total += len(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]);
        cum.push(total);
      }
      return {
        name: r.name, pts: r.pts, z: r.z, riseEnd: r.riseEnd, returnStart: r.returnStart, exitLift: r.exitLift,
        enter: r.enter, kind: r.kind,
        score: r.score || 0, cum: cum, len: total || 1
      };
    });
  }

  World.prototype.reset = function () {
    this.balls.length = 0;
    this.time = 0;
    this.events.length = 0;
    if (this.table.spinner) {
      this.table.spinner.angle = 0; this.table.spinner.omega = 0;
      this.table.spinner.spins = 0; this.table.spinner.last = -1;
    }
    for (var i = 0; i < this.flippers.length; i++) {
      var f = this.flippers[i];
      f.curA = f.restA; f.angVel = 0; f.active = false;
    }
    for (var j = 0; j < this.table.targets.length; j++) this.table.targets[j].up = true;
  };

  World.prototype.addBall = function (x, y, vx, vy, r) {
    var b = {
      x: x, y: y, prevX: x, prevY: y, vx: vx || 0, vy: vy || 0,
      r: r || 0.62, spin: 0, dead: false, trail: [], z: 0
    };
    this.balls.push(b);
    return b;
  };

  World.prototype.step = function (dt) {
    this.time += dt;
    this._updateFlippers(dt);
    /* A struck spinner keeps turning between contacts, losing energy
       to its bearings. Score switch closes once per half revolution. */
    var spinner = this.table.spinner;
    if (spinner && Math.abs(spinner.omega) > 0.02) {
      var prevAngle = spinner.angle;
      spinner.angle += spinner.omega * dt;
      spinner.omega *= Math.exp(-1.4 * dt);
      var turns = Math.abs(Math.floor(spinner.angle / Math.PI) - Math.floor(prevAngle / Math.PI));
      for (var turn = 0; turn < turns; turn++) {
        spinner.spins++;
        this._emit('spinner', { i: 0, x: spinner.x, y: spinner.y });
      }
    }
    var balls = this.balls;
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      if (b.dead) continue;
      this._integrate(b, dt);
      this._collide(b, dt);
      var sp = len(b.vx, b.vy);
      if (sp > this.maxSpeed) { var s = this.maxSpeed / sp; b.vx *= s; b.vy *= s; }
      if (b.y < -2.5) { b.dead = true; this._emit('drain', { ball: b }); }
    }
    for (var k = balls.length - 1; k >= 0; k--) if (balls[k].dead) balls.splice(k, 1);
  };

  World.prototype._emit = function (type, data) {
    data = data || {};
    data.t = type;
    this.events.push(data);
    if (this.onEvent) this.onEvent(data);
  };

  World.prototype._updateFlippers = function (dt) {
    for (var i = 0; i < this.flippers.length; i++) {
      var f = this.flippers[i];
      var target = f.active ? f.upA : f.restA;
      var speed = f.active ? f.upSpeed : f.downSpeed;
      var prev = f.curA;
      var diff = target - prev;
      if (diff > speed * dt) diff = speed * dt;
      else if (diff < -speed * dt) diff = -speed * dt;
      f.curA += diff;
      f.angVel = dt > 0 ? (f.curA - prev) / dt : 0;
    }
  };

  /* flipper travel driven WITHOUT a physics step: an idle table (attract,
     game over) still answers the flipper buttons -- the bats move, no
     ball, no scoring. The stepper calls this internally on every step. */
  World.prototype.updateFlippers = function (dt) {
    this._updateFlippers(dt);
  };

  World.prototype._integrate = function (b, dt) {
    if (b.rampI !== undefined) { this._rampStep(b, dt); return; }
    b.prevX = b.x; b.prevY = b.y;
    if (b.airborne) {
      /* Short wireway exits drop into a lane, not onto an invisible
         continuation of the removed center returns. */
      b.vz -= 48 * this.table.K * dt;
      b.z += b.vz * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.z <= 0) { b.z = 0; b.vz = 0; b.airborne = false; }
      return;
    }
    b.vy -= this.gravity * dt;
    var d = 1 - this.drag * dt;
    b.vx *= d; b.vy *= d;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.spin += (b.vx * 0.55) * dt;
  };

  /* --- ramp riding ----------------------------------------- */
  World.prototype._rampPoint = function (r, t) {
    var d = t * r.len, pts = r.pts, cum = r.cum;
    for (var i = 1; i < cum.length; i++) {
      if (d <= cum[i] || i === cum.length - 1) {
        var sg = cum[i] - cum[i - 1] || 1;
        var f = (d - cum[i - 1]) / sg;
        return {
          x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f,
          y: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f
        };
      }
    }
    return { x: pts[0][0], y: pts[0][1] };
  };

  World.prototype._rampStep = function (b, dt) {
    var r = this.ramps[b.rampI];
    var prevZ = b.z;
    b.rampT += (b.rampSpeed * dt) / r.len;
    var nextZ = r.z * global.PB.rampRise(Math.min(1, b.rampT), r);
    /* Climb trades speed for elevation; the long descent returns that
       energy. Mild rolling loss avoids a constant-speed conveyor feel. */
    b.rampSpeed = Math.sqrt(Math.max(16, b.rampSpeed * b.rampSpeed - 24 * (nextZ - prevZ))) * Math.exp(-0.025 * dt);
    if (b.rampT >= 1) {
      var pts = r.pts, n = pts.length;
      var dx = pts[n - 1][0] - pts[n - 2][0], dy = pts[n - 1][1] - pts[n - 2][1];
      var l = len(dx, dy) || 1;
      var sp = r.exitLift ? Math.min(b.rampSpeed * 0.3, 5 * this.table.K) : b.rampSpeed * 0.80;
      b.x = pts[n - 1][0]; b.y = pts[n - 1][1];
      b.vx = dx / l * sp; b.vy = dy / l * sp;
      b.z = r.z * (r.exitLift || 0); b.airborne = b.z > 0; b.vz = 0;
      b.rampI = undefined; b.rampT = 0;
      this._emit('ramp', { name: r.name, kind: r.kind, score: r.score, x: b.x, y: b.y });
      return;
    }
    var p = this._rampPoint(r, b.rampT);
    /* Preserve lateral entry offset, easing it into the track over the
       first few ball lengths instead of snapping sideways at the mouth. */
    var entryEase = Math.max(0, 1 - b.rampT * r.len / (3 * b.r));
    entryEase = entryEase * entryEase * (3 - 2 * entryEase);
    b.x = p.x + (b.rampOffsetX || 0) * entryEase;
    b.y = p.y + (b.rampOffsetY || 0) * entryEase;
    b.z = nextZ;
    b.spin += b.rampSpeed * dt / b.r;
  };

  World.prototype._collide = function (b, dt) {
    if (b.rampI !== undefined || b.airborne) return;   /* above surface hardware */
    var T = this.table, i;

    /* static walls */
    var segs = T.segments;
    /* A polyline is ONE guide. Resolving every adjacent capsule in order
       creates tiny upward-facing shelves at every seam. Resolve only its
       nearest feature so a rolling ball sees a continuous surface. */
    var nearest = {};
    for (i = 0; i < segs.length; i++) {
      var candidate = segs[i];
      if (!candidate.chain) continue;
      var dx = candidate.bx - candidate.ax, dy = candidate.by - candidate.ay;
      var u = clamp(((b.x - candidate.ax) * dx + (b.y - candidate.ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
      var dist = len(b.x - candidate.ax - dx * u, b.y - candidate.ay - dy * u);
      if (!nearest[candidate.chain] || dist < nearest[candidate.chain].dist) nearest[candidate.chain] = { index: i, dist: dist };
    }
    for (i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (s.chain && nearest[s.chain].index !== i) continue;
      if (s.gate && b.vx * s.gate <= 0) continue;
      if (hitSegment(b, s.ax, s.ay, s.bx, s.by, s.e, s.f, dt, !!s.chain)) {
        var spd = len(b.vx, b.vy);
        if (s.kind === 'tiki') this._emit('bash', { x: b.x, y: b.y, speed: spd });
        else if (spd > 6) this._emit('wall', { x: b.x, y: b.y, speed: spd });
      }
    }

    /* drop targets live as segments while raised; standups never drop */
    var tgs = T.targets;
    for (i = 0; i < tgs.length; i++) {
      var t = tgs[i];
      if (!t.up) continue;
      if (hitSegment(b, t.ax, t.ay, t.bx, t.by, t.e, t.f, dt)) {
        t.flash = 1;
        if (t.drop) {
          t.up = false;
          this._emit('target', { i: i, x: b.x, y: b.y });
        } else {
          this._emit('standup', { i: i, x: b.x, y: b.y });
        }
      }
    }

    /* slingshots: reflect, then fire the ball back out */
    var sl = T.slings;
    for (i = 0; i < sl.length; i++) {
      var k = sl[i];
      if (hitSegment(b, k.ax, k.ay, k.bx, k.by, 0.35, 0.05, dt)) {
        b.vx += k.nx * k.kick;
        b.vy += k.ny * k.kick;
        this._emit('sling', { i: i, x: b.x, y: b.y });
      }
    }

    /* pop bumpers, posts and the shack bash toy */
    var cs = T.circles;
    var out = {};
    for (i = 0; i < cs.length; i++) {
      var c = cs[i];
      if (hitCircle(b, c.x, c.y, c.r, c.e, c.kick, out)) {
        /* A round post has the same perfectly balanced crown equilibrium
           as a segment tip. Break it gently, only on passive round posts. */
        if (c.type === 'post' && out.ny > 0.96 && Math.abs(b.vx) < 0.1) b.vx = (c.x < T.centerX ? 1 : -1) * 1.2 * T.K;
        if (c.type === 'bumper') this._emit('bumper', { i: i, x: b.x, y: b.y, speed: out.speed });
        else if (c.type === 'toy') this._emit('bash', { i: i, x: b.x, y: b.y, speed: out.speed });
        else this._emit('post', { i: i, x: b.x, y: b.y });
      }
    }

    /* flippers */
    for (i = 0; i < this.flippers.length; i++) {
      var fl = this.flippers[i];
      var ax = fl.px, ay = fl.py;
      var bx = fl.px + Math.cos(fl.curA) * fl.len;
      var by = fl.py + Math.sin(fl.curA) * fl.len;
      if (hitCapsule(b, ax, ay, bx, by, fl.rad, fl.px, fl.py, fl.angVel, 0.42, out)) {
        this._emit('flipper', { side: fl.side, speed: Math.abs(fl.angVel), x: b.x, y: b.y });
      }
    }

    /* A ball balanced on a segment TIP (flagged in hitSegment) is in an
       equilibrium the solver will hold for ever: the push-out points straight
       up, gravity pulls straight down, and nothing breaks the symmetry. Left
       alone it sits there for the rest of the game -- measured at art
       (71, 27.2) under the ROOTS ORBIT release, and at (13.1, 68.8) on the
       outlane divider. Send it outboard, away from the middle of the field:
       that is the side with room at both of those tips, and it is where a
       real ball rolls off a point. 1 u/s in a 10..64 u/s game is a nudge. */
    if (b.tipRest) {
      b.tipRest = false;
      b.vx = b.x < T.centerX ? -1 : 1;
    }
  };

  /* In-play zones (spinner / rollovers / kickback / ramp mouths)
     are polled here so the game layer only reacts to events. */
  World.prototype.pollZones = function () {
    var T = this.table, i, j;
    for (i = 0; i < this.balls.length; i++) {
      var b = this.balls[i];
      if (b.rampI !== undefined || b.airborne) continue;

      /* ramp mouths */
      for (var rI = 0; rI < this.ramps.length; rI++) {
        var rp = this.ramps[rI];
        var entry = rp.enter, tx = entry.tx, ty = entry.ty;
        var ex = b.x - entry.x, ey = b.y - entry.y;
        var along = ex * tx + ey * ty;
        var prevAlong = (b.prevX - entry.x) * tx + (b.prevY - entry.y) * ty;
        var spd = len(b.vx, b.vy), approach = b.vx * tx + b.vy * ty;
        /* Swept mouth plane: high-speed or oblique shots cannot skip a
           circular sensor. A shallow, flared apron accepts a range of
           shots, but never captures a ball passing behind or backwards. */
        var crossed = prevAlong <= 0 && along >= 0;
        var fraction = crossed ? clamp(-prevAlong / (along - prevAlong || 1), 0, 1) : 1;
        var hitX = b.prevX + (b.x - b.prevX) * fraction;
        var hitY = b.prevY + (b.y - b.prevY) * fraction;
        var lateral = -(hitX - entry.x) * ty + (hitY - entry.y) * tx;
        var onApron = along >= -entry.depth && along <= 1e-8;
        var mouthWidth = entry.halfWidth || 0.78 * T.K;
        var apronWidth = mouthWidth + Math.max(0, -along) / entry.depth * 0.30 * T.K;
        if ((crossed || onApron) && Math.abs(lateral) < (crossed ? mouthWidth : apronWidth) &&
            approach > spd * 0.72 && approach > 11 * T.K) {
          b.rampI = rI; b.rampT = Math.max(0, along) / rp.len;
          var trackPoint = this._rampPoint(rp, b.rampT);
          b.rampOffsetX = b.x - trackPoint.x; b.rampOffsetY = b.y - trackPoint.y;
          b.rampSpeed = Math.min(approach, 42 * T.K);
          this._emit('rampenter', { name: rp.name, kind: rp.kind, x: b.x, y: b.y });
          break;
        }
      }
      if (b.rampI !== undefined) continue;

      /* spinner */
      var sp = T.spinner;
      var inSpinner = sp && b.x > sp.x0 && b.x < sp.x1 && b.y > sp.y0 && b.y < sp.y1;
      if (inSpinner && !b.spinnerInside && Math.abs(b.vy) > 1.6) {
        sp.last = this.time;
        sp.omega = clamp(sp.omega + b.vy * 1.8, -65, 65);
        b.vy *= 0.94;
      }
      b.spinnerInside = !!inSpinner;

      /* rollover lanes */
      for (j = 0; j < T.rollovers.length; j++) {
        var ro = T.rollovers[j];
        var ddx = b.x - ro.x, ddy = b.y - ro.y;
        if (!ro.on && ddx * ddx + ddy * ddy < ro.r * ro.r) {
          ro.on = true;
          ro.flash = 1;
          this._emit('rollover', { i: j });
        } else if (ro.on && ddx * ddx + ddy * ddy > (ro.r + 1.1) * (ro.r + 1.1)) {
          ro.on = false;
        }
      }

      /* kickback */
      var kb = T.kickback;
      if (kb && b.x < kb.x && b.y < kb.y && b.vy < 0 && this.time - kb.last > 1.2) {
        kb.last = this.time;
        b.vy = kb.force;
        b.vx = 1.8;
        this._emit('kickback', { x: b.x, y: b.y });
      }
    }
  };

  global.PB = global.PB || {};
  global.PB.World = World;
  global.PB.util = { clamp: clamp, len: len, hitSegment: hitSegment, hitCircle: hitCircle };
})(window);
