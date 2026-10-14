/* dev/_iso.js -- render an art window top-down with ONLY one tag visible.
 *   node dev/_iso.js x0 y0 x1 y1 tag
 * tag: all | extrude | tube | cone | sphere | box | torus | cyl
 */
const pw = require('playwright-core');
const path = require('path');
const [X0,Y0,X1,Y1] = process.argv.slice(2,6).map(Number);
const TAG = process.argv[6] || 'all';
const PPX = 20;
const VW = Math.round((X1-X0)*PPX);
const VH = Math.round(VW / (((X1-X0)/100*25.94)/((Y1-Y0)/100*48.94)));
(async()=>{
  const b = await pw.chromium.launch({channel:'msedge',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  const p = await b.newPage({viewport:{width:VW,height:VH}});
  const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  await p.goto('http://127.0.0.1:8099/index.html',{waitUntil:'load'});
  await p.waitForTimeout(6500);
  const info = await p.evaluate(({X0,Y0,X1,Y1,TAG,VW,VH})=>{
    const g=window.PB.game, T=window.THREE, tbl=g.table;
    const cam=new T.OrthographicCamera(-1,1,1,-1,0.1,900);
    const orig=g.renderer.render.bind(g.renderer);
    g.renderer.render=sc=>orig(sc,cam);
    g.sheen.visible=false;
    g.world.balls.forEach(b=>{ if(b.mesh)b.mesh.visible=false; if(b.shadow)b.shadow.visible=false; });
    ['menu','hud','fps','touch','vignette','scanlines','flash','floats']
      .forEach(id=>{const el=document.getElementById(id); if(el)el.style.display='none';});
    const cx=tbl.artX((X0+X1)/2), cy=tbl.artY((Y0+Y1)/2);
    const c=new T.Vector3(cx-tbl.centerX, cy-tbl.centerY, 0); g.group.localToWorld(c);
    const qw=new T.Quaternion(); g.group.getWorldQuaternion(qw);
    const up=new T.Vector3(0,0,1).applyQuaternion(qw).normalize();
    const north=new T.Vector3(0,1,0).applyQuaternion(qw).normalize();
    const wW=Math.abs(tbl.artX(X1)-tbl.artX(X0)), hW=Math.abs(tbl.artY(Y1)-tbl.artY(Y0));
    const asp=VW/VH, halfW=Math.max(wW,hW*asp)/2, halfH=halfW/asp;
    cam.left=-halfW; cam.right=halfW; cam.top=halfH; cam.bottom=-halfH;
    cam.position.copy(c).addScaledVector(up,260); cam.up.copy(north); cam.lookAt(c);
    cam.updateProjectionMatrix();
    if (TAG!=='all'){
      const want = TAG.toUpperCase();
      g.playfield.group.traverse(o=>{
        if(!o.isMesh && !o.isSprite) return;
        const gt = o.geometry ? o.geometry.type.toUpperCase() : '';
        o.visible = gt.indexOf(want) >= 0;
      });
    }
    return {ok:1};
  },{X0,Y0,X1,Y1,TAG,VW,VH});
  await p.waitForTimeout(300);
  const out = path.join(__dirname,'shots','_iso_'+TAG+'.png');
  await p.screenshot({path:out});
  console.log('wrote', out, 'tag', TAG, VW+'x'+VH);
  if(errs.length){console.log('ERRORS');console.log(errs.join('\n'));}
  await b.close();
})().catch(e=>{console.error('FAILED',e.message);process.exit(1);});
