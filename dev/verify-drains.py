"""Verify drained balls leave no rendered ghosts (local server on 8101)."""
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
    page.keyboard.down('Space')
    page.wait_for_timeout(400)
    page.keyboard.up('Space')
    page.wait_for_function("PB.game.state === 'play'")
    page.keyboard.press('p')
    report = {'repeatedDrains': 10}
    for batch in range(2):
        page.evaluate('''() => {
          const g=PB.game,live=g.world.balls[0];
          live.x=g.table.centerX;live.y=g.table.artY(55);live.vx=live.vy=0;
          window.__drainRecords=[];
          for(let i=0;i<5;i++){
            const b=g.spawnBall(g.table.centerX,-3,0,-12),r={b,mesh:b.mesh,shadow:b.shadow,geo:0,mat:0,shared:0,tex:0};
            b.shadow.geometry.addEventListener('dispose',()=>r.geo++);
            b.shadow.material.addEventListener('dispose',()=>r.mat++);
            b.mesh.geometry.addEventListener('dispose',()=>r.shared++);
            b.mesh.material.addEventListener('dispose',()=>r.shared++);
            b.shadow.material.map.addEventListener('dispose',()=>r.tex++);
            __drainRecords.push(r);
          }
          __drainRecords.live=live.mesh;
          g.world.step(1/240);
        }''')
        page.keyboard.press('p')
        page.wait_for_function('__drainRecords.every(r=>r.b.mesh===null)')
        page.keyboard.press('p')
        report['cleanup'] = page.evaluate('''() => {
          const g=PB.game;
          for(const r of __drainRecords){
            if(r.mesh.parent || r.shadow.parent || r.b.mesh || r.b.shadow)throw Error('Drained visual still attached');
            if(r.geo!==1 || r.mat!==1)throw Error('Shadow resources not disposed exactly once');
            if(r.shared || r.tex)throw Error('Shared ball resources were disposed');
          }
          if(g.world.balls.length!==1 || __drainRecords.live.parent!==g.group)throw Error('Live ball was removed with drained balls');
          return 'Drained meshes/shadows removed, shadow resources disposed once, shared resources and survivor preserved';
        }''')
    page.evaluate('''() => {
      const g=PB.game,b=g.world.balls[0];
      window.__lastDrain={b,mesh:b.mesh,shadow:b.shadow};
      b.x=g.table.centerX;b.y=-3;b.vy=-12;
      g.world.step(1/240);
    }''')
    page.keyboard.press('p')
    page.wait_for_function("PB.game.state === 'ready' && __lastDrain.b.mesh===null")
    page.keyboard.press('p')
    report['ballSave'] = page.evaluate('''() => {
      const g=PB.game,r=__lastDrain;
      if(r.mesh.parent || r.shadow.parent || r.b.mesh || r.b.shadow)throw Error('Last-ball ghost survives ball save');
      if(g.world.balls.length!==1 || g.world.balls[0]===r.b || !g.world.balls[0].mesh.parent)throw Error('Ball save did not create a clean replacement');
      return 'Last-ball drain removes old visuals; ball save creates one new visible ball';
    }''')
    report['browserErrors'] = errors
    (root / 'drain-verification.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    browser.close()
    assert not errors, errors
