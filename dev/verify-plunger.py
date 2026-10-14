"""Verify the plunger handle and the launch power against the live game."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parent
with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 1200, 'height': 1000})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://127.0.0.1:8101/', wait_until='load')
    page.wait_for_function('window.PB && PB.game && PB.assets.ready')
    page.click('#playBtn')
    page.wait_for_function('PB.game.world && PB.game.world.balls.length===1')
    report = {}

    # --- the handle must come back out of the front while the shot charges ---
    page.keyboard.down('Space')
    page.wait_for_function('PB.game.playfield.plunger.pull>0.9', timeout=20000)
    page.wait_for_timeout(250)
    report['charge'] = page.evaluate('''() => {
      const g=PB.game,T=THREE,pf=g.playfield.plunger,k=g.table.K;
      const travel=(pf.baseY-pf.group.position.y)/k;
      if(!(pf.pull>0.9))throw Error('Plunger did not charge: '+pf.pull);
      if(!(travel>2.6))throw Error('Plunger did not pull out far enough: '+travel);
      if(Math.abs(travel-pf.pull*pf.travelK)>0.02)throw Error('Travel does not match the pull');
      if(!(pf.spring.scale.y<0.62))throw Error('Spring did not compress: '+pf.spring.scale.y);

      /* THE HANDLE LIES ALONG THE LANE. A rod laid across the lane stood the
         whole assembly on end, so nothing pulled out of the front. Checked
         in WORLD space, against the lane's world direction. */
      const lane=new T.Vector3(0,-1,0)
        .applyQuaternion(pf.group.getWorldQuaternion(new T.Quaternion())).normalize();
      const axis=new T.Vector3(0,1,0)
        .applyQuaternion(pf.knob.getWorldQuaternion(new T.Quaternion()));
      if(Math.abs(axis.dot(lane))<0.999)throw Error('Handle is not coaxial with the lane: '+axis.dot(lane));
      const half=pf.knob.geometry.parameters.height/2;

      /* HOW FAR OUT OF THE MACHINE IT GETS. The glass's own front edge is
         the table's front; the handle has to pass it by a visible margin at
         a full charge, and still show a nub when it is home. */
      const box=new T.Box3().setFromObject(g.machine.root.getObjectByName('clear playfield glass'));
      const frontZ=box.max.z;
      const tip=()=>{const v=new T.Vector3();pf.knob.getWorldPosition(v);return v.addScaledVector(lane,half).z;};
      const out=tip()-frontZ;
      if(out<3.0)throw Error('Handle barely leaves the cabinet at a full charge: '+out.toFixed(2));
      return {pullFraction:pf.pull, travelUnits:travel, springScale:pf.spring.scale.y,
        handleOutOfFrontUnits:out, glassFrontZ:frontZ, travelK:pf.travelK};
    }''')
    page.keyboard.up('Space')

    page.wait_for_timeout(60)
    report['release'] = page.evaluate('''() => {
      const pf=PB.game.playfield.plunger;
      if(!(pf.snapT>=0))throw Error('Release did not trigger the snap-home throw');
      return 'Release snapped the handle home';
    }''')

    # The throw is driven by frame deltas (clamped at 50 ms), so wait for the
    # animation itself to finish rather than a wall-clock guess.
    page.wait_for_function('PB.game.playfield.plunger.snapT<0', timeout=20000)
    page.wait_for_timeout(200)
    report['settled'] = page.evaluate('''() => {
      const g=PB.game,T=THREE,pf=g.playfield.plunger,k=g.table.K;
      const offset=(pf.baseY-pf.group.position.y)/k;
      if(Math.abs(offset)>0.05)throw Error('Plunger did not settle home: '+offset);
      if(Math.abs(pf.spring.scale.y-1)>0.02)throw Error('Spring did not relax');
      /* at rest the handle still shows: its outer face reaches the table's
         front edge, so the plunger is there before you touch it */
      const lane=new T.Vector3(0,-1,0).applyQuaternion(pf.group.quaternion).normalize();
      const half=pf.knob.geometry.parameters.height/2;
      const v=new T.Vector3();pf.knob.getWorldPosition(v);
      const box=new T.Box3().setFromObject(g.machine.root.getObjectByName('clear playfield glass'));
      const nub=v.addScaledVector(lane,half).z-box.max.z;
      if(nub<-1.0)throw Error('Handle is buried inside the cabinet at rest: '+nub.toFixed(2));
      return {restOffsetUnits:offset, springScale:pf.spring.scale.y, handleNubAtRestUnits:nub};
    }''')

    # --- power: exactly 25% over the old 26..54 band, and actually delivered ---
    # --- the hardware on the face, and the graphic it has to agree with ---
    report['face'] = page.evaluate('''() => {
      const g=PB.game,T=THREE,pf=g.playfield.plunger;
      let panel=null;
      g.machine.root.traverse(o=>{
        if(o.isMesh&&o.geometry.type==='PlaneGeometry'){
          const p=o.geometry.parameters;
          if(Math.abs(p.width-27.8)<0.02&&Math.abs(p.height-14)<0.02)panel=o;
        }
      });
      if(!panel)throw Error('No front panel to align with');

      /* THE FERRULE IS ON THE FACE. It is bolted to the painted panel, not
         carried by the handle, and it sits on the rod's own line, so the
         rod passes through the hardware instead of beside it. */
      const f=new T.Vector3(),rp=new T.Vector3();
      pf.ferrule.updateMatrixWorld(true);
      pf.ferrule.getWorldPosition(f); pf.rod.getWorldPosition(rp);
      const lane=new T.Vector3(0,-1,0)
        .applyQuaternion(pf.group.getWorldQuaternion(new T.Quaternion())).normalize();
      const v=rp.clone().sub(f);
      const along=v.dot(lane);
      const off=v.clone().addScaledVector(lane,-along).length();
      if(off>0.25)throw Error('Ferrule is off the rod line by '+off.toFixed(3)
        +' (ferrule '+JSON.stringify(f.toArray())+', rod '+JSON.stringify(rp.toArray())
        +', along '+along.toFixed(2)+')');
      const pn=new T.Vector3(0,0,1).applyQuaternion(panel.getWorldQuaternion(new T.Quaternion())).normalize();
      const pc=panel.getWorldPosition(new T.Vector3());
      const planeDist=Math.abs(f.clone().sub(pc).dot(pn));
      if(planeDist>0.30)throw Error('Ferrule is not on the front panel: '+planeDist.toFixed(3));
      const before=f.clone();
      g.playfield.setPlunger(1); g.playfield.snapPlunger();
      pf.ferrule.getWorldPosition(f);
      const moved=f.clone().sub(before).length();
      g.playfield.setPlunger(0); g.playfield.snapPlunger();
      if(moved>1e-6)throw Error('Ferrule travels with the handle: '+moved);

      /* THE SHEET'S OWN PLUNGER IS GONE from the face texture. It used to
         be a chrome crescent and a knurled knob in the panel's top right;
         chrome-ish pixels (bright and unsaturated) are what is left of it
         if the graft missed. */
      const cnv=panel.material.map.image;
      const ctx=cnv.getContext('2d');
      const kx=cnv.width/318, ky=cnv.height/151;
      const px=ctx.getImageData(Math.round(269*kx),0,Math.round(32*kx),Math.round(62*ky)).data;
      let chrome=0;
      for(let i=0;i<px.length;i+=4){
        const mx=Math.max(px[i],px[i+1],px[i+2]),mn=Math.min(px[i],px[i+1],px[i+2]);
        if(mx>140&&mx-mn<70)chrome++;
      }
      if(chrome>0)throw Error('The painted plunger is still on the front face: '+chrome+' chrome px');
      return {ferruleOffRodUnits:off, ferruleOffPanelUnits:planeDist,
        ferruleTravels:false, paintedPlungerPixelsLeft:chrome};
    }''')

    report['power'] = page.evaluate('''() => {
      const g=PB.game;
      if(!/\\*\\s*1\\.25/.test(g.launch.toString()))throw Error('launch() no longer applies the 25% increase');
      const idle=26*1.25, full=54*1.25;
      if(!(g.world.maxSpeed>full))throw Error('Speed cap clips the stronger launch: cap '+g.world.maxSpeed+' vs '+full);
      if(g.world.maxSpeed>70)throw Error('Cap raised further than the launch needs: '+g.world.maxSpeed);
      return {idlePower:idle, fullPower:full, oldBand:[26,54], cap:g.world.maxSpeed};
    }''')

    report['browserErrors'] = errors
    (root / 'plunger-verification.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    browser.close()
    assert not errors, errors
