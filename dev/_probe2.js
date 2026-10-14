const pw=require('playwright-core');
(async()=>{
 const b=await pw.chromium.launch({channel:'msedge',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const p=await b.newPage({viewport:{width:600,height:400}});
 p.on('pageerror',e=>console.log('PAGEERROR',e.message));
 await p.goto('http://127.0.0.1:8099/index.html',{waitUntil:'load'});
 await p.waitForTimeout(6500);
 const out=await p.evaluate(()=>{
   const g=window.PB.game, T=window.THREE;
   const r=g.renderer, sc=g.scene;
   const res={ rev:T.REVISION, env: !!sc.environment,
     envInt: sc.environmentIntensity,
     exposure:r.toneMappingExposure, tone:r.toneMapping,
     outEnc:r.outputEncoding, outCS:r.outputColorSpace,
     useLegacy: r.useLegacyLights };
   if (sc.environment){
     const e=sc.environment;
     res.envType=e.type; res.envMapping=e.mapping;
     res.envIsTex=!!e.isTexture;
   }
   /* lights */
   res.lights=[];
   sc.traverse(o=>{ if(o.isLight) res.lights.push({t:o.type,i:o.intensity,c:o.color.getHexString()}); });
   /* the sling body material, fully described */
   g.playfield.group.traverse(o=>{
     if(o.isMesh && o.geometry.type==='ExtrudeGeometry' && !res.body){
       const m=o.material;
       res.body={type:m.type,col:m.color.getHexString(),
         colLinear:[m.color.r,m.color.g,m.color.b].map(v=>+v.toFixed(4)),
         metal:m.metalness, rough:m.roughness, envInt:m.envMapIntensity,
         emi:m.emissive.getHexString(), ei:m.emissiveIntensity,
         toneMapped:m.toneMapped, flat:m.flatShading, side:m.side,
         hasEnvMap: !!m.envMap, name:m.name};
     }
   });
   /* what does the renderer say the three.js colour of black is? */
   const c=new T.Color(0x15191e);
   res.colCheck={r:c.r,g:c.g,b:c.b};
   const c2=new T.Color(0xffffff);
   res.whiteCheck={r:c2.r,g:c2.g,b:c2.b};
   return res;
 });
 console.log(JSON.stringify(out,null,1));
 await b.close();
})().catch(e=>{console.error('FAILED',e.message);process.exit(1);});
