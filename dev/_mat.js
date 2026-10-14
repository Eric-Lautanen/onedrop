const pw=require('playwright-core');
(async()=>{
 const b=await pw.chromium.launch({channel:'msedge',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const p=await b.newPage({viewport:{width:600,height:400}});
 p.on('pageerror',e=>console.log('PAGEERROR',e.message));
 await p.goto('http://127.0.0.1:8099/index.html',{waitUntil:'load'});
 await p.waitForTimeout(6500);
 const out=await p.evaluate(()=>{
   const g=window.PB.game;
   const res={};
   res.rampZ = g.table.ramps.map(r=>+r.z.toFixed(3));
   res.pfKeys = Object.keys(g.playfield||{});
   res.extrude=[];
   g.playfield.group.traverse(o=>{
     if(o.isMesh && o.geometry.type==='ExtrudeGeometry'){
       const m=o.material;
       res.extrude.push({col:m.color?m.color.getHexString():'-',metal:m.metalness,
         rough:m.roughness,emi:m.emissive?m.emissive.getHexString():'-',
         ei:m.emissiveIntensity, z:o.position.z.toFixed(3)});
     }
   });
   res.tgt=[];
   (g.playfield.targets||[]).slice(0,2).forEach(t=>{
     const m=t.face.material;
     res.tgt.push({col:m.color.getHexString(),ei:m.emissiveIntensity,metal:m.metalness});
   });
   res.bump=[];
   (g.playfield.bumpers||[]).forEach(bp=>{
     res.bump.push({capCol:bp.cap.color.getHexString(),capEi:+bp.cap.emissiveIntensity.toFixed(3),
       skirtEi:+bp.skirt.emissiveIntensity.toFixed(3), glowScale:+bp.glow.scale.x.toFixed(2)});
   });
   return res;
 });
 console.log(JSON.stringify(out,null,1));
 await b.close();
})().catch(e=>{console.error('FAILED',e.message);process.exit(1);});
