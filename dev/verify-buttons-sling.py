import json
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    page=browser.new_page(viewport={'width':1200,'height':1000})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://127.0.0.1:8101/')
    page.wait_for_function('PB.game && PB.game.machine && PB.assets.ready')
    report=page.evaluate('''()=>{
      const g=PB.game,m=g.machine,buttons=[];
      ['left','right'].forEach((side,i)=>{
        const grp=m.root.getObjectByName(side+' flipper button');
        if(!grp)throw Error('Missing button');
        const oldZ=4.1-2.75,glassZ=4.1+2.9*Math.tan(12.3*Math.PI/180)-.52+.045;
        if(Math.abs(grp.position.z-(oldZ+glassZ)/2)>1e-8)throw Error('Button not raised halfway');
        const btn=grp.children.find(o=>o.geometry.parameters.radiusTop===.54),col=btn.material.color;
        if(!(col.r>col.g*20 && col.r>col.b*20))throw Error('Button material not saturated red');
        const rest=btn.position.x;
        m.setFlipper(i?'R':'L',true);m.update(10);m.update(10.05);
        if(Math.abs(btn.position.x)>=Math.abs(rest))throw Error('Button no longer depresses');
        m.setFlipper(i?'R':'L',false);m.update(11);m.update(11.05);
        buttons.push({side,z:grp.position.z,oldZ,glassZ,color:col.getHexString()});
      });
      const passages=[];
      [[25.94,48.94],[26,45],[20,36]].forEach(size=>{
        const t=PB.buildTable({W:size[0],H:size[1]}),s=t.slings[1],r=.62*t.K;
        if(!(s.hx<s.tx))throw Error('Right sling bottom not inward');
        const outer=s.tx+s.w*.5+.15*t.K,wall=t.artX(92),gap=wall-outer;
        if(gap<2*r+.15*t.K)throw Error('Right sling top pinches ball');
        const w=new PB.World(t),ball=w.addBall((outer+wall)/2,s.ty+2*r,0,-8*t.K,r);
        let slingHits=0;
        for(let i=0;i<480 && ball.y>s.hy-r;i++){
          w.step(1/240);w.pollZones();slingHits+=w.events.filter(e=>e.t==='sling'&&e.i===1).length;w.events.length=0;
        }
        if(!(ball.y<s.hy-r)||slingHits)throw Error('Ball could not pass outside right sling');
        passages.push({size,topGap:gap,ballDiameter:2*r,slingHits});
      });
      return {buttons,passages};
    }''')
    page.screenshot(path=str(root/'shots/buttons-sling-corrected.png'))
    report['browserErrors']=errors
    (root/'buttons-sling-verification.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report,indent=2))
    browser.close()
    assert not errors,errors
