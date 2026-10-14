import json
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    page=browser.new_page(viewport={'width':1200,'height':1000})
    errors=[]
    def on_console(msg):
        kind=msg.type() if callable(msg.type) else msg.type
        if kind=='error': errors.append('console: '+msg.text)
    page.on('console',on_console)
    page.on('pageerror',lambda e:errors.append('pageerror: '+str(e)))
    page.goto('http://127.0.0.1:8101/',wait_until='load')
    page.wait_for_function('PB.game && PB.game.machine && PB.assets.ready')
    page.wait_for_timeout(700)
    page.evaluate('''()=>{
      const g=PB.game,T=THREE;
      g.__orig=g.renderer.render.bind(g.renderer);
      g.__cam=new T.PerspectiveCamera(38,innerWidth/innerHeight,.1,600);
      const c=g.surface.getWorldPosition(new T.Vector3()),up=new T.Vector3(0,0,1).applyQuaternion(g.group.quaternion),north=new T.Vector3(0,1,0).applyQuaternion(g.group.quaternion);
      g.__cam.position.copy(c).addScaledVector(up,65).addScaledVector(north,-32);g.__cam.up.copy(north);g.__cam.lookAt(c);g.__cam.updateMatrixWorld();
      g.renderer.render=(s,c)=>s.userData.renderingMirror?g.__orig(s,c):g.__orig(s,g.__cam);
      ['menu','hud','fps','touch','vignette','scanlines','floats','flash'].forEach(id=>document.getElementById(id).style.display='none');
    }''')
    page.wait_for_timeout(600)
    report=page.evaluate('''()=>{
      const g=PB.game,T=THREE,cam=g.__cam;
      const render=()=>g.__orig(g.scene,cam);
      /* big on purpose: the wall's pass renders through the main camera's
         projection from ~120 u away, so a 1 u ball lands as a ~16 px dot
         whatever it is parked in front of */
      const marker=new T.Mesh(new T.SphereGeometry(5,20,14),new T.MeshBasicMaterial({color:0xff00ff,toneMapped:false}));
      g.group.add(marker);
      const read=m=>{const t=m.userData.reflectionTarget,a=new Uint8Array(t.width*t.height*4);g.renderer.readRenderTargetPixels(t,0,0,t.width,t.height,a);return a;};
      /* EACH WALL GETS ITS OWN PROBE, parked in front of that wall and slid
         sideways across its face. A single marker out on the playfield is a
         different distance from every wall and — being inside the cabinet —
         is half hidden from the narrow head panel, which left that one
         sitting on the sensitivity threshold (89 changed pixels one run, 168
         the next). Parked on the wall's own normal, every probe is
         unambiguously that wall's business. */
      /* ONE BIG PROBE OUT ON THE FIELD, slid across the table so every
         wall's pass has to show it move. It is deliberately large: each
         wall renders the scene through the main camera's projection from
         ~120 u away, so a 1 u ball lands as a ~16 px dot and the narrow
         head panel sat on the threshold at ~90 changed pixels. At radius 5
         the same probe is ~25x the area, and the three walls' counts stop
         being a coin toss. */
      marker.position.set(0,6,6);
      render();const before=g.machine.mirrors.map(read);
      marker.position.x+=12;render();const after=g.machine.mirrors.map(read);
      let totalMarker=0;
      const mirrors=g.machine.mirrors.map((m,i)=>{
        let changed=0,magenta=0;for(let k=0;k<before[i].length;k+=4){if(Math.abs(before[i][k]-after[i][k])+Math.abs(before[i][k+1]-after[i][k+1])+Math.abs(before[i][k+2]-after[i][k+2])>30)changed++;if(after[i][k]>100&&after[i][k+2]>100&&after[i][k+1]<50)magenta++;}
        totalMarker+=magenta;
        if(!m.visible||m.userData.reflectionPasses<1||changed<110)throw Error('Mirror did not update '+JSON.stringify({i,visible:m.visible,passes:m.userData.reflectionPasses,changed}));
        return {resolution:m.userData.reflectionTarget.width,passes:m.userData.reflectionPasses,changedPixels:changed,markerPixels:magenta};
      });
      if(totalMarker<100)throw Error('No wall reflected the marker: '+totalMarker);
      marker.position.set(0,6,6);
      /* MIRRORS MIRROR MIRRORS. Hiding the two opposing walls must change
         what this wall reflects -- that difference IS the other blades
         appearing in its reflection. */
      const solo=g.machine.mirrors.map((m,i)=>{
        const others=g.machine.mirrors.filter(o=>o!==m);
        render();const withOthers=read(m);
        const shown=others.map(o=>o.visible);others.forEach(o=>o.visible=false);
        render();const alone=read(m);
        others.forEach((o,n)=>o.visible=shown[n]);
        let differing=0;
        for(let k=0;k<withOthers.length;k+=4){if(Math.abs(withOthers[k]-alone[k])+Math.abs(withOthers[k+1]-alone[k+1])+Math.abs(withOthers[k+2]-alone[k+2])>8)differing++;}
        if(differing<200)throw Error('Wall '+i+' does not reflect the opposing mirror: '+differing+' px');
        return {mirror:i,reflectedBladePixels:differing};
      });
      g.group.remove(marker);marker.geometry.dispose();marker.material.dispose();
      function timing(enabled){g.machine.mirrors.forEach(m=>m.visible=enabled);const samples=[];for(let i=0;i<10;i++){const a=performance.now();render();g.renderer.getContext().finish();samples.push(performance.now()-a);}samples.sort((a,b)=>a-b);return samples[5];}
      const noMirrors=timing(false),liveMirrors=timing(true);
      const snapshot={tone:g.renderer.toneMapping, xr:g.renderer.xr.enabled, shadow:g.renderer.shadowMap.autoUpdate,target:g.renderer.getRenderTarget()};
      render();
      if(g.renderer.toneMapping!==snapshot.tone || g.renderer.xr.enabled!==snapshot.xr || g.renderer.shadowMap.autoUpdate!==snapshot.shadow || g.renderer.getRenderTarget()!==snapshot.target || g.scene.userData.renderingMirror)throw Error('Mirror leaked render state');
      const glass=g.machine.root.getObjectByName('clear playfield glass');
      /* the pane draws its own polished border in the shader; a separate
         outline object used to sit on the field and read as an artifact */
      if(g.machine.root.getObjectByName('polished glass edge'))throw Error('Stray glass outline object is back');
      if(!glass || glass.material.depthWrite || !glass.material.transparent)throw Error('Clear glass setup failed');
      const w=g.renderer.domElement.width,h=g.renderer.domElement.height;
      const pixels=()=>{const a=new Uint8Array(w*h*4);g.renderer.getContext().readPixels(0,0,w,h,g.renderer.getContext().RGBA,g.renderer.getContext().UNSIGNED_BYTE,a);return a;};
      render();const withGlass=pixels();glass.visible=false;render();const withoutGlass=pixels();glass.visible=true;
      /* Judge the glass on the ARTWORK, not on the empty background: mean
         how far it moves a painted pixel and how much of that pixel's
         colour survives underneath it. */
      let glassPixels=0,artPixels=0,artDeltaSum=0,satWith=0,satWithout=0;
      for(let i=0;i<withGlass.length;i+=4){
        const d=Math.abs(withGlass[i]-withoutGlass[i])+Math.abs(withGlass[i+1]-withoutGlass[i+1])+Math.abs(withGlass[i+2]-withoutGlass[i+2]);
        if(d>3)glassPixels++;
        const mx=Math.max(withoutGlass[i],withoutGlass[i+1],withoutGlass[i+2]),mn=Math.min(withoutGlass[i],withoutGlass[i+1],withoutGlass[i+2]);
        if(mx-mn>45 && mx>60){
          artPixels++;artDeltaSum+=d/3;
          const mx2=Math.max(withGlass[i],withGlass[i+1],withGlass[i+2]),mn2=Math.min(withGlass[i],withGlass[i+1],withGlass[i+2]);
          satWith+=mx2-mn2;satWithout+=mx-mn;
        }
      }
      const averageGlassDelta=artDeltaSum/Math.max(1,artPixels);
      const saturationKept=satWith/Math.max(1,satWithout);
      if(glassPixels<1000)throw Error('Glass is not visible: '+glassPixels+' px');
      if(averageGlassDelta>9 || saturationKept<0.9)throw Error('Glass obscures the artwork: delta '+averageGlassDelta.toFixed(2)+', colour kept '+saturationKept.toFixed(3));

      /* ---- IS IT GLASS, OR PAINT? ----------------------------------
         A clear pane returns ~4% of the room head on and everything it has
         at grazing incidence, and what it returns are the room's own
         shapes, which stay pinned to the ROOM as the camera moves. Paint
         on the sheet -- a constant overlay, a drawn stripe, a fixed border
         -- does neither: it never gets brighter with the view, and it never
         moves across the pane. Both are measured here on a grid of points
         laid over the pane itself, each projected to the screen for the
         current camera, so the sampling is the pane's own surface and not
         the whole viewport. */
      /* The pane is an extruded crystal profile now, and an extruded
         geometry has no width/height/depth in `parameters`, so its own
         dimensions are read from userData -- falling back to parameters for
         a plain box. Without this every pane sample below would be NaN and
         the glass assertions would pass vacuously. */
      const box=glass.userData.pane||glass.geometry.parameters;
      const up=new T.Vector3(0,0,1).applyQuaternion(g.group.quaternion).normalize();
      const north=new T.Vector3(0,1,0).applyQuaternion(g.group.quaternion).normalize();
      const fb=new Uint8Array(w*h*4);
      function frame(){
        render();g.renderer.getContext().readPixels(0,0,w,h,g.renderer.getContext().RGBA,g.renderer.getContext().UNSIGNED_BYTE,fb);
        return Uint8Array.from(fb);
      }
      function deltaNow(){
        glass.visible=true;const a=frame();
        glass.visible=false;const b=frame();
        glass.visible=true;
        const d=new Uint8Array(w*h*3);
        for(let i=0,j=0;i<a.length;i+=4,j+=3){
          d[j]=Math.abs(a[i]-b[i]);d[j+1]=Math.abs(a[i+1]-b[i+1]);d[j+2]=Math.abs(a[i+2]-b[i+2]);
        }
        return d;
      }
      function paneSamples(d){
        const out=[];
        const q=new T.Quaternion().setFromRotationMatrix(glass.matrixWorld);
        const nrm=new T.Vector3(0,0,1).applyQuaternion(q).normalize();
        for(let i=0;i<25;i++)for(let j=0;j<17;j++){
          const u=i/24,v=j/16;
          const world=new T.Vector3((u-0.5)*box.width,(v-0.5)*box.height,box.depth/2)
            .applyMatrix4(glass.matrixWorld);
          const p=world.clone().project(cam);
          const sx=Math.round((p.x*0.5+0.5)*w),sy=Math.round((1-(p.y*0.5+0.5))*h);
          if(sx<0||sy<0||sx>=w||sy>=h)continue;
          const k=(sy*w+sx)*3;
          const view=cam.position.clone().sub(world).normalize();
          const NoV=Math.abs(nrm.dot(view));
          out.push({key:i+','+j,u:u,v:v,d:(d[k]+d[k+1]+d[k+2])/3,
            F:glass.material.uniforms.glassF0.value+(1-glass.material.uniforms.glassF0.value)*Math.pow(1-NoV,5)});
        }
        return out;
      }
      function stats(s){
        let sum=0,mx=-1,at=null;
        for(const q of s){sum+=q.d;if(q.d>mx){mx=q.d;at=q;}}
        const mean=sum/s.length;
        let varSum=0;
        for(const q of s)varSum+=(q.d-mean)*(q.d-mean);
        return {mean:mean,max:mx,at:at,sd:Math.sqrt(varSum/s.length)};
      }
      function aim(upOff,backOff){
        const c=g.surface.getWorldPosition(new T.Vector3());
        cam.position.copy(c).addScaledVector(up,upOff).addScaledVector(north,backOff);
        cam.up.copy(north);cam.lookAt(c);cam.updateMatrixWorld();
      }
      /* the player's own view (game.js parks the camera at 68 / -97), and a
         low one that grazes the pane */
      aim(68,-97);
      const steep=paneSamples(deltaNow());
      const player=stats(steep);
      aim(16,-42);
      const low=paneSamples(deltaNow());
      const grazing=stats(low);
      aim(65,-32);
      if(player.mean>8)throw Error('Glass washes the field at the player angle: '+player.mean.toFixed(2));
      if(grazing.max<40)throw Error('No reflected lights in the glass: max '+grazing.max.toFixed(1));
      if(grazing.sd/Math.max(0.001,grazing.mean)<0.20)throw Error('Glass reads as a flat film, not a reflection: sd/mean '+ (grazing.sd/grazing.mean).toFixed(3));
      /* THE VIEW TEST. The same point ON THE PANE, seen from two cameras: if
         what lands there is reflected room it must change, because both the
         Fresnel weight and the reflected direction change; if it is paint it
         cannot move at all. Only points visible from both cameras count. */
      const byKey={};
      low.forEach(s=>byKey[s.key]=s);
      let common=0,changed=0,fSteep=0,fLow=0;
      for(const s of steep){
        const o=byKey[s.key];
        if(!o)continue;
        common++;fSteep+=s.F;fLow+=o.F;
        changed+=Math.abs(o.d-s.d)/Math.max(0.5,Math.max(o.d,s.d));
      }
      if(common<40)throw Error('Too few pane points visible from both cameras: '+common);
      const viewDependence=changed/common;
      const moved=Math.abs(grazing.at.u-player.at.u)+Math.abs(grazing.at.v-player.at.v);
      if(viewDependence<0.25)throw Error('Glass does not change with the view: '+viewDependence.toFixed(3));
      if(moved<0.10)throw Error('Glass highlight does not track the view (painted, not reflected): '+moved.toFixed(3));
      /* and the geometry really is more grazing from the low camera, so the
         two views above are testing what they claim to */
      if(!(fLow/common>fSteep/common*1.2))throw Error('Test cameras are not actually steeper vs shallower');
      /* THE IMPLEMENTATION. A pane is a reflection and a split of energy, so
         the shader must carry Schlick from the F0 uniform and must not add
         any constant colour of its own -- the three terms that made the old
         one a film (a pale base, a drawn stripe and a border) are named so
         they cannot come back unnoticed. */
      const fs=glass.material.fragmentShader;
      if(!/pow\(1\.0-NoV,5\.0\)/.test(fs)||!/glassF0/.test(fs)||glass.material.uniforms.glassF0.value!==0.04)throw Error('Glass no longer uses Schlick with F0 = 0.04');
      if(/stripe|0\.80,0\.89,1\.0/.test(fs))throw Error('A painted film term is back in the glass shader');

      const resources=g.machine.mirrors.map(m=>m.userData.reflectionTarget);
      let disposed=0;resources.forEach(t=>t.addEventListener('dispose',()=>disposed++));
      g.fitPlayfield(26,45);g.fitPlayfieldToCabinet();
      if(disposed!==3)throw Error('Mirror targets leaked on rebuild');
      const r=PB.assets.rectPx('backglass');
      if(r.sx<99||r.sx+r.sw>324.1||r.sy+r.sh>181.1)throw Error('Backglass crop includes atlas gutter');
      return {mirrors,mirrorInMirror:solo,glass:{meanArtworkDelta:averageGlassDelta,saturationKept:saturationKept,visibleHighlightPixels:glassPixels,artworkPixels:artPixels,paneMeanDelta:{player:player.mean,grazing:grazing.mean},paneMaxDelta:{player:player.max,grazing:grazing.max},paneContrast:{player:player.sd/player.mean,grazing:grazing.sd/grazing.mean},panePointsVisibleFromBoth:common,viewDependence:viewDependence,meanFresnel:{player:fSteep/common,grazing:fLow/common},highlightMovedByView:moved},medianRenderMs:{noMirrors,liveMirrors},crop:r,rendererState:'restored',disposedTargets:disposed};
    }''')
    page.screenshot(path=str(root/'shots/cabinet-live-mirrors.png'))
    page.evaluate('''()=>{
      const g=PB.game,T=THREE,q=g.machine.head.getWorldQuaternion(new T.Quaternion()),up=new T.Vector3(0,1,0).applyQuaternion(q),front=new T.Vector3(0,0,1).applyQuaternion(q);
      const bounds=new T.Box3().setFromObject(g.machine.head),c=bounds.getCenter(new T.Vector3());
      g.__cam=new T.PerspectiveCamera(35,innerWidth/innerHeight,.1,600);g.__cam.position.copy(c).addScaledVector(front,67);g.__cam.up.copy(up);g.__cam.lookAt(c);g.__cam.updateMatrixWorld();
    }''')
    page.wait_for_timeout(400)
    page.screenshot(path=str(root/'shots/backbox-corrected.png'))
    report['errors']=errors
    (root/'mirror-verification.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report,indent=2))
    browser.close()
    assert not errors
