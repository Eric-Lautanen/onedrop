/* Browser-side deterministic flow diagnostics; no game state is modified. */
(function () {
  'use strict';
  PB.checkFlow = function () {
    var report = { sizes: [], failures: [] };
    function distance(p, s) {
      var dx=s.bx-s.ax,dy=s.by-s.ay,t=Math.max(0,Math.min(1,((p.x-s.ax)*dx+(p.y-s.ay)*dy)/(dx*dx+dy*dy||1)));
      return Math.hypot(p.x-s.ax-t*dx,p.y-s.ay-t*dy);
    }
    [[25.94,48.94],[26,45],[20,36]].forEach(function(size){
      var t=PB.buildTable({W:size[0],H:size[1]}),k=t.K,r=.62*k;
      var solids=t.segments.concat(t.targets.filter(function(s){return !s.drop;}),t.slings);
      function free(x,y){
        var p={x:x,y:y};
        return x>t.artX(7)+r && x<t.artX(100)-r && y<t.artY(0)-r && y>t.artY(90) && solids.every(function(s){return distance(p,s)>r+.025*k;}) && t.circles.every(function(c){return Math.hypot(x-c.x,y-c.y)>r+c.r+.025*k;});
      }
      var seeds=[];
      for(var ay=3;ay<86;ay+=4)for(var ax=9;ax<92;ax+=4){var x=t.artX(ax),y=t.artY(ay);if(free(x,y))seeds.push({x:x,y:y,ax:ax,ay:ay});}
      solids.forEach(function(s){[ [s.ax,s.ay],[s.bx,s.by] ].forEach(function(p){var y=p[1]+r+.035*k;if(free(p[0],y))seeds.push({x:p[0],y:y,tip:s.kind||s.label});});});
      /* Repeat representative valid positions with moving arrivals, not
         just zero-velocity drops. Fixed sequence keeps failures replayable. */
      seeds.slice().filter(function(seed,i){return i%4===0;}).forEach(function(seed,i){
        seeds.push({x:seed.x,y:seed.y,vx:Math.sin(i*2.4)*28*k,vy:Math.cos(i*1.7)*20*k});
      });
      var stuck=[],tested=0;
      seeds.forEach(function(seed){
        t.targets.forEach(function(s){s.up=true;});
        var w=new PB.World(t),b=w.addBall(seed.x,seed.y,seed.vx||0,seed.vy||0,r),loX=Infinity,hiX=-Infinity,loY=Infinity,hiY=-Infinity;
        for(var i=0;i<2880&&!b.dead;i++){
          w.step(1/240);w.pollZones();w.events.length=0;
          if(i>=2400){loX=Math.min(loX,b.x);hiX=Math.max(hiX,b.x);loY=Math.min(loY,b.y);hiY=Math.max(hiY,b.y);}
        }
        tested++;
        if(!b.dead && b.rampI===undefined && Math.hypot(hiX-loX,hiY-loY)<.5*k){
          /* A ball resting at a lowered flipper is playable, not a trap.
             Require a real swing to free it instead of exempting a region. */
          var beforeX=b.x,beforeY=b.y;
          w.flippers.forEach(function(f){f.active=true;});
          for(var swing=0;swing<240&&!b.dead;swing++){w.step(1/240);w.pollZones();w.events.length=0;}
          if(b.dead || b.rampI!==undefined || Math.hypot(b.x-beforeX,b.y-beforeY)>2*r)return;
          stuck.push({seed:seed,at:[(b.x-t.artX(0))/t.W*100,(t.artY(0)-b.y)/t.H*100],speed:Math.hypot(b.vx,b.vy)});}
      });
      var bumperGaps=[];
      var bumpers=t.circles.filter(function(c){return c.type==='bumper';});
      bumpers.forEach(function(a,i){bumpers.slice(i+1).forEach(function(b){var gap=Math.hypot(a.x-b.x,a.y-b.y)-a.r-b.r;bumperGaps.push(gap);if(gap<2*r+.15*k)report.failures.push('Bumper gap pinches ball');});});
      var laneWidth=t.artX(34)-t.artX(24);
      if(laneWidth<2*r+.15*k)report.failures.push('Top lane pinches ball');
      var flipperShots=[],entryCases=0;
      [0,1].forEach(function(side){
        var hits=0,contacts=[];
        [.2,.35,.5,.65,.8,.95].forEach(function(contact){
          [-4,-2,0,2,4].forEach(function(incoming){
            var st=PB.buildTable({W:size[0],H:size[1]}),w=new PB.World(st),fl=w.flippers[side],a=fl.restA;
            var dx=Math.cos(a),dy=Math.sin(a),nx=-dy*(side?-1:1),ny=dx*(side?-1:1);
            var ball=w.addBall(fl.px+dx*fl.len*contact+nx*(fl.rad+r+.05*k),fl.py+dy*fl.len*contact+ny*(fl.rad+r+.05*k),incoming*k,-3*k,r);
            fl.active=true;
            for(var i=0;i<480&&!ball.dead&&ball.rampI===undefined;i++){w.step(1/240);w.pollZones();w.events.length=0;}
            if(ball.rampI===side){hits++;if(contacts.indexOf(contact)<0)contacts.push(contact);}
          });
        });
        flipperShots.push({side:side,tested:30,rampHits:hits,contactPositions:contacts});
        if(hits<5 || contacts.length<2)report.failures.push('Too few real flipper shots reach ramp at '+size+' side '+side);
      });
      t.ramps.forEach(function(ramp,index){
        [-30,-15,0,15,30].forEach(function(degrees){
          [-.22,0,.22].forEach(function(offset){
            [20,32,48].forEach(function(speed){
              var angle=Math.atan2(ramp.enter.ty,ramp.enter.tx)+degrees*Math.PI/180;
              var vx=Math.cos(angle)*speed*k,vy=Math.sin(angle)*speed*k;
              var dt=1/60,lat=offset*k,w=new PB.World(t);
              var x=ramp.enter.x-ramp.enter.ty*lat,y=ramp.enter.y+ramp.enter.tx*lat;
              var ball=w.addBall(x-vx*dt*.5,y-vy*dt*.5,vx,vy,r);
              /* Force a 60 Hz swept crossing spanning the sensor plane. */
              ball.prevX=ball.x;ball.prevY=ball.y;ball.x+=vx*dt;ball.y+=vy*dt;
              w.pollZones();entryCases++;
              if(ball.rampI!==index)report.failures.push('Angled swept entry failed '+degrees+' at '+size);
              else {var px=ball.x,py=ball.y;w._rampStep(ball,1/240);if(Math.hypot(ball.x-px,ball.y-py)>speed*k/100)report.failures.push('Entry snapped sideways');}
            });
          });
        });
        [0,1,2].forEach(function(kind){
          var w=new PB.World(t),e=ramp.enter;
          var ball=w.addBall(e.x,e.y,e.tx*30*k,e.ty*30*k,r);
          if(kind===0){ball.vx*=-1;ball.vy*=-1;}
          if(kind===1){ball.vx=e.tx*8*k;ball.vy=e.ty*8*k;}
          if(kind===2){ball.x-=e.ty*1.5*k;ball.y+=e.tx*1.5*k;ball.prevX=ball.x;ball.prevY=ball.y;}
          w.pollZones();entryCases++;
          if(ball.rampI!==undefined)report.failures.push('Reverse, weak, or wide shot falsely captured');
        });
      });
      report.sizes.push({W:t.W,H:t.H,restProbes:tested,stuck:stuck,flipperShots:flipperShots,sweptEntryCases:entryCases,clearances:{ballDiameter:2*r,bumperGaps:bumperGaps,topLaneWidth:laneWidth}});
    });
    return report;
  };
})();
