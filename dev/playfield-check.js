/* Run in the game's browser with a script tag, then call PB.checkPlayfield(). */
(function () {
  'use strict';
  window.PB.checkPlayfield = function () {
    var failures = [], report = { ramps: [], lamps: 0, sizes: [] };
    function check(ok, message) { if (!ok) failures.push(message); }
    [[25.94,48.94], [26,45], [20,36]].forEach(function (size) {
      var table = PB.buildTable({ W: size[0], H: size[1] });
      var world = new PB.World(table);
      check(table.lamps.length === 43, 'Lamp count changed');
      table.lamps.forEach(function (l) {
        check(Number.isFinite(l.x + l.y + l.z + l.rx + l.ry), 'Nonfinite lamp');
        if (l.art) {
          check(Math.abs(l.x - table.artX(l.art.x)) < 1e-8 && Math.abs(l.y - table.artY(l.art.y)) < 1e-8, 'Insert registration');
          check(Math.abs(l.rx / l.ry - (table.W / table.H) * 584 / 318) < 1e-8, 'Insert aspect');
        }
      });
      world.ramps.forEach(function (r, index) {
        var maxError = 0, maxGrade = 0;
        for (var i = 0; i < r.pts.length; i++) {
          var u = r.cum[i] / r.len, p = world._rampPoint(r, u);
          maxError = Math.max(maxError, Math.hypot(p.x - r.pts[i][0], p.y - r.pts[i][1]));
          if (i) {
            var prev = r.cum[i-1] / r.len;
            maxGrade = Math.max(maxGrade, Math.abs(r.z * (PB.rampRise(u, r) - PB.rampRise(prev, r))) / (r.cum[i] - r.cum[i-1]));
          }
        }
        check(maxError < 1e-8, 'Ball/sampled track mismatch');
        check(maxGrade < 0.32, 'Ramp grade exceeds shallow rolling limit');
        var n = r.pts.length;
        check(r.pts[n-1][1] < r.pts[n-2][1], 'Ramp exit must face downfield');
        check(PB.rampRise(0, r) === 0 && PB.rampRise(1, r) === 1, 'Ramp must start on wood and end at its drop height');
        r.pts.forEach(function(p){if(p[1]<table.artY(25))check(p[0]<table.artX(30)||p[0]>table.artX(70),'Removed center return remains');});
        var ball = world.addBall(r.pts[0][0], r.pts[0][1], 0, 25, 0.62 * table.K);
        ball.rampI = index; ball.rampT = 0; ball.rampSpeed = 25;
        var steps = 0;
        while (ball.rampI !== undefined && steps++ < 2000) {
          world._rampStep(ball, 1/240);
          check(Number.isFinite(ball.x + ball.y + ball.z), 'Nonfinite riding ball');
        }
        check(steps < 2000 && ball.airborne && ball.z > 0 && ball.vy < 0, 'Elevated ramp release failed');
        if (size[0] === 25.94) report.ramps.push({ name:r.name, maxError:maxError, maxGrade:maxGrade, steps:steps });
      });
      /* At the crown crossing, separate the decks by a full ball diameter. */
      var a = world.ramps[0], b = world.ramps[1], closest = Infinity, height = 0;
      a.pts.forEach(function (pa, ia) { b.pts.forEach(function (pb, ib) {
        var d = Math.hypot(pa[0]-pb[0], pa[1]-pb[1]);
        if (d < closest) { closest=d; height=Math.abs(a.z*PB.rampRise(a.cum[ia]/a.len, a)-b.z*PB.rampRise(b.cum[ib]/b.len, b)); }
      }); });
      check(height > 1.24 * table.K + 0.18 * table.K, 'Crossing has insufficient ball clearance');
      var overlapClearance = Infinity, rearClearance = Infinity;
      a.pts.forEach(function(pa,ia){ b.pts.forEach(function(pb,ib){
        if(Math.hypot(pa[0]-pb[0],pa[1]-pb[1]) < 1.75*table.K) {
          overlapClearance = Math.min(overlapClearance, Math.abs(a.z*PB.rampRise(ia/(a.pts.length-1),a)-b.z*PB.rampRise(ib/(b.pts.length-1),b)));
        }
      }); });
      check(overlapClearance > 1.42*table.K, 'Overlapping basket envelopes collide');
      world.ramps.forEach(function(r,index){
        /* Actual moving-flipper/contact-angle sweeps live in flow-check.js;
           do not substitute a hand-aimed velocity from the pivot for them. */
        check(r.enter.y-table.flippers[index].py > table.H*.28,'Ramp mouth is too close to flipper');
        r.pts.forEach(function(p,i){
          if(p[1] >= table.artY(19)) rearClearance=Math.min(rearClearance,r.z*PB.rampRise(i/(r.pts.length-1),r)-0.055*table.K);
        });
        var release=r.pts[r.pts.length-1];
        check(Math.abs(release[0]-table.artX(index===0?68:29))<1e-8 && Math.abs(release[1]-table.artY(15.5))<1e-8,'Ramp does not feed upper lane');
        [14,25,40].forEach(function(speed){
          speed *= table.K;
          var w=new PB.World(table),rr=w.ramps[index],p0=rr.pts[0],p1=rr.pts[1],dx=p1[0]-p0[0],dy=p1[1]-p0[1],l=Math.hypot(dx,dy);
          var ball=w.addBall(p0[0],p0[1],dx/l*speed,dy/l*speed,0.62*table.K);
          w.pollZones();check(ball.rampI===index,'Aligned shot not captured');
          var initial=ball.rampSpeed,minSpeed=initial,ticks=0;
          while(ball.rampI!==undefined && ticks++<6000){w._rampStep(ball,1/240);minSpeed=Math.min(minSpeed,ball.rampSpeed);}
          check(ticks<6000 && ball.vy<0 && minSpeed<initial,'Ramp energy/return failed');
          var landingTicks=0;
          while(ball.airborne && landingTicks++<480){w.step(1/240);w.pollZones();}
          check(landingTicks<480 && ball.z===0 && ball.y<table.artY(15.5) && ball.y>table.artY(24),'Upper-lane drop did not land cleanly');
          var landedY=ball.y;
          for(var j=0;j<600;j++){w.step(1/240);w.pollZones();}
          check(ball.dead || ball.y<landedY-2*table.K || ball.rampI!==undefined,'Upper-lane release got stuck');
          var reverse=w.addBall(p0[0],p0[1],-dx/l*speed,-dy/l*speed,0.62*table.K);w.pollZones();
          check(reverse.rampI===undefined,'Reverse pass incorrectly captured');
        });
      });
      check(rearClearance>1.42*table.K,'Rear wireway blocks ground-level ball flow');
      report.sizes.push({ W:table.W, H:table.H, crossingClearance:height, overlapClearance:overlapClearance, rearUnderpass:rearClearance });
      report.lamps = table.lamps.length;
    });
    var live = PB.game, T = THREE;
    var glassGap=Infinity;
    live.playfield.wireforms.forEach(function (wf,index) {
      var r=live.table.ramps[index],k=live.table.K;
      for(var s=0;s<=240;s++){
        var p=wf.centre.getPoint(s/240),y=p.y+live.table.centerY;
        var glassZ=3.58+(y-(live.table.centerY-25.4))*Math.tan(12.3*Math.PI/180)-0.045;
        var top=p.z+Math.max(1.24*k,0.875*k);
        glassGap=Math.min(glassGap,glassZ-top);
        check(Math.abs(p.z-r.z*PB.rampRise(s/240,r))<1e-8,'Visual/physics elevation mismatch');
      }
      wf.supports.forEach(function(s){check(Math.abs(s.x-live.table.centerX)>live.table.W/2-0.3*k,'Support stands in playing lane');});
      var mid = wf.cradle.getPoint(0.5), a = wf.cradle.getPoint(0), b = wf.cradle.getPoint(1);
      check(Math.abs(mid.z) < 1e-8 && a.z > mid.z && b.z > mid.z, 'Tie is not a half-moon bowl');
      var matrix = new T.Matrix4();
      for (var i = 0; i < wf.baskets.count; i++) {
        var u = (i + 0.5) / wf.baskets.count;
        wf.baskets.getMatrixAt(i, matrix);
        check(a.clone().applyMatrix4(matrix).distanceTo(wf.left.getPoint(u)) < 1e-5, 'Left tie end is not attached to rail');
        check(b.clone().applyMatrix4(matrix).distanceTo(wf.right.getPoint(u)) < 1e-5, 'Right tie end is not attached to rail');
      }
    });
    check(glassGap>0.5,'Ramp or ball clips glass');
    report.glassGap=glassGap;
    var sw = new PB.World(PB.buildTable()), sp = sw.table.spinner;
    var sb = sw.addBall(sp.x, sp.y, 0, 22);
    sw.pollZones();
    check(sp.omega > 0, 'Spinner contact did not impart momentum');
    sb.x = sp.x1 + 2;
    var initial = sp.omega;
    for (var step = 0; step < 240; step++) sw.step(1/240);
    check(sp.angle > Math.PI*2 && sp.omega < initial && sp.omega > 0, 'Spinner does not coast and decelerate');
    check(sp.spins > 2 && sw.events.some(function(e){return e.t === 'spinner';}), 'Spinner switch did not score revolutions');
    report.spinner = { angle:sp.angle, speed:sp.omega, scoredSwitches:sp.spins };
    report.basketJoins = 'All semicircular tie ends match their rails';
    report.failures = failures;
    if (failures.length) throw new Error(JSON.stringify(report));
    return report;
  };
})();
