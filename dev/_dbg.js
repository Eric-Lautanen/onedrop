const pw = require('playwright-core');
const URL='http://127.0.0.1:8099/index.html';
const ARGS=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'];
(async()=>{
 const b=await pw.chromium.launch({channel:'msedge',args:ARGS});
 const p=await b.newPage({viewport:{width:800,height:600}});
 p.on('pageerror',e=>console.log('PAGEERROR',e.message));
 await p.goto(URL,{waitUntil:'load'}); await p.waitForTimeout(6500);
 const out=await p.evaluate(()=>{
  const g=window.PB.game,T=window.THREE,tbl=g.table,pf=g.playfield.group;
  const qw=new T.Quaternion(); pf.getWorldQuaternion(qw);
  const upW=new T.Vector3(0,0,1).applyQuaternion(qw).normalize();
  const items=[]; pf.traverse(o=>{if(o.isMesh)items.push(o);});
  const rc=new T.Raycaster(); rc.far=500;
  const res=[];
  [[49.4,31],[42.9,28.9],[49.5,17.5],[49,45],[20,77],[50,95]].forEach(([ax,ay])=>{
    const p3=new T.Vector3(tbl.artX(ax)-tbl.centerX,tbl.artY(ay)-tbl.centerY,0);
    const local=p3.clone();
    p3.applyMatrix4(pf.matrixWorld);
    const o=p3.clone().addScaledVector(upW,120);
    rc.set(o,upW.clone().negate());
    const list=rc.intersectObjects(items,false);
    res.push({ax,ay,local:local.toArray().map(v=>+v.toFixed(2)),
      upW:upW.toArray().map(v=>+v.toFixed(3)),
      n:list.length,
      hits:list.slice(0,4).map(h=>({t:h.object.geometry.type,c:(h.object.material.color?h.object.material.color.getHexString():'-'),
        nm:h.object.name||'', d:+(120-h.distance).toFixed(2)}))});
  });
  return {res, pfPos:pf.position.toArray().map(v=>+v.toFixed(2)),
    pfScale:pf.scale.toArray().map(v=>+v.toFixed(3)),
    upW:upW.toArray().map(v=>+v.toFixed(3)),
    PF_SIZE:window.PB.PF_SIZE, artX100:+tbl.artX(100).toFixed(2), artX0:+tbl.artX(0).toFixed(2),
    artY0:+tbl.artY(0).toFixed(2), artY100:+tbl.artY(100).toFixed(2)};
 });
 console.log(JSON.stringify(out,null,1));
 await b.close();
})().catch(e=>{console.error('FAILED',e);process.exit(1);});
