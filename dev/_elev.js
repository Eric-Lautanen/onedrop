/* dev/_elev.js -- side elevation of the playfield: orthographic, looking
 * across the field from its left side, up = the field's own up. So the
 * horizontal axis is the field LENGTH (art y 0 at the left) and the
 * vertical axis is HEIGHT ABOVE THE WOOD, readable directly.
 *   node dev/_elev.js [artY0] [artY1] [halfHeightWorld]
 */
const pw = require('playwright-core');
const path = require('path');
const Y0 = Number(process.argv[2] || 0), Y1 = Number(process.argv[3] || 100);
const HALF_Z = Number(process.argv[4] || 9);        /* +/- world of height shown */

const VW = 1000;
const VH = Math.round(VW * (2 * HALF_Z) / 48.94);

(async()=>{
  const b=await pw.chromium.launch({channel:'msedge',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  const p=await b.newPage({viewport:{width:VW,height:VH}});
  const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  await p.goto('http://127.0.0.1:8099/index.html',{waitUntil:'load'});
  await p.waitForTimeout(6500);
  await p.evaluate(({Y0,Y1,VW,VH,HALF_Z})=>{
    const g=window.PB.game,T=window.THREE,tbl=g.table;
    const cam=new T.OrthographicCamera(-1,1,1,-1,0.1,900);
    const orig=g.renderer.render.bind(g.renderer);
    g.renderer.render=sc=>orig(sc,cam);
    g.sheen.visible=false;
    if (g.machine && g.machine.root) g.machine.root.visible = false;
    g.world.balls.forEach(b=>{if(b.mesh)b.mesh.visible=false;if(b.shadow)b.shadow.visible=false;});
    ['menu','hud','fps','touch','vignette','scanlines','flash','floats']
      .forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none';});
    const cy=tbl.artY((Y0+Y1)/2);
    const c=new T.Vector3(0-tbl.centerX, cy-tbl.centerY, 0);
    g.group.localToWorld(c);
    const qw=new T.Quaternion(); g.group.getWorldQuaternion(qw);
    const up=new T.Vector3(0,0,1).applyQuaternion(qw).normalize();
    const east=new T.Vector3(1,0,0).applyQuaternion(qw).normalize();
    /* the field length runs from artY0 to artY1; show it across the width */
    const halfLen=Math.abs(tbl.artY(Y1)-tbl.artY(Y0))/2;
    cam.left=-halfLen; cam.right=halfLen;
    cam.top=HALF_Z; cam.bottom=-HALF_Z;
    /* stand off to the LEFT of the field and look across it */
    cam.position.copy(c).addScaledVector(east,-200);
    cam.up.copy(up);
    cam.lookAt(c);
    cam.updateProjectionMatrix();
  },{Y0,Y1,VW,VH,HALF_Z});
  await p.waitForTimeout(300);
  const out=path.join(__dirname,'shots','_elev.png');
  await p.screenshot({path:out});
  console.log('wrote',out,'view',VW+'x'+VH,'+-'+HALF_Z+' world tall');
  if(errs.length){console.log('ERRORS');console.log(errs.join('\n'));}
  await b.close();
})().catch(e=>{console.error('FAILED',e.message);process.exit(1);});
