"""Run with dev/.venv-playfield/Scripts/python.exe dev/verify-playfield.py."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parent
with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 1200, 'height': 1000})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('requestfailed', lambda r: errors.append(r.url + ': ' + str(r.failure)))
    page.goto('http://127.0.0.1:8101/', wait_until='load')
    page.wait_for_function('window.PB && PB.game && PB.assets.ready')
    for name in ['table.js', 'physics.js', 'playfield.js']:
        # A parse check on the served file. `new Function(source)` cannot parse
        # a bare `import` -- it threw "Cannot use import statement outside a
        # module" and aborted this whole run before it checked anything. These
        # are ES modules the page has already imported, so a dynamic import
        # resolves from the module registry: it parses the file and runs
        # nothing a second time.
        page.evaluate("name => import('/src/js/' + name).then(() => true)", name)
    page.add_script_tag(path=str(root / 'playfield-check.js'))
    report = page.evaluate('PB.checkPlayfield()')
    page.click('#playBtn')
    assert page.evaluate('PB.game.state') == 'ready', 'Play button did not start game'
    # Hold the draw until the HANDLE IS ACTUALLY ALL THE WAY BACK, then let go.
    # A part-drawn release springs home without launching (game.js: `if (charge
    # < FULL_DRAW) ...`), and the charge fills per FRAME -- a fixed 650 ms of
    # wall clock is about one frame in this headless window, so the old wait
    # asserted before the draw could finish. Confirmed to be the harness and
    # not the engine: the committed physics fails the old wait identically.
    # `plunger.pull` follows the game's own charge, so this waits on the same
    # gate launch() enforces rather than on the clock.
    page.keyboard.down('Space')
    page.wait_for_function('() => PB.game.playfield.plunger.pull >= 0.999', timeout=60000)
    page.keyboard.up('Space')
    page.wait_for_function("() => PB.game.state === 'play'", timeout=15000)
    assert page.evaluate('PB.game.state') == 'play', 'Plunge did not launch'
    assert page.evaluate('PB.game.world.balls.some(b=>b.vy>0)'), 'Ball did not move upfield'
    for key, i in [('z', 0), ('/', 1)]:
        page.keyboard.down(key)
        page.wait_for_timeout(150)
        assert page.evaluate('(i)=>PB.game.world.flippers[i].active', i), 'Flipper did not activate'
        page.keyboard.up(key)
    report['controls'] = 'PLAY, charged plunge, both flippers passed'
    report['hardware'] = page.evaluate('''() => {
      const g=PB.game,pf=g.playfield,sp=g.table.spinner;
      const saved={angle:sp.angle,omega:sp.omega};
      sp.angle=1.25;pf.update(1/60,2,{attract:false});
      if(Math.abs(pf.spinner.group.rotation.x-1.25)>1e-8)throw Error('Spinner mesh does not follow rotation');
      const jaw=pf.shackGroup.children.find(o=>o.geometry && o.geometry.parameters.width===1.22*g.table.K);
      if(!jaw)throw Error('Missing carved moving jaw');
      const rest=jaw.position.z;pf.flash('shack',0,1);pf.update(1/60,2.1,{attract:false});
      if(!(jaw.position.z<rest))throw Error('Shack jaw did not react to hit');
      g.table.targets[0].up=false;
      for(let i=0;i<90;i++)pf.update(1/60,3+i/60,{attract:false});
      if(pf.targets[0].face.visible)throw Error('Drop target remained above field');
      g.table.targets[0].up=true;
      for(let i=0;i<90;i++)pf.update(1/60,5+i/60,{attract:false});
      if(!pf.targets[0].face.visible || pf.targets[0].face.position.z<0)throw Error('Drop target did not reset');
      sp.angle=saved.angle;sp.omega=saved.omega;
      return 'Spinner mesh rotates, tiki jaw reacts, drop target retracts and resets';
    }''')
    report['liveResize'] = page.evaluate('''() => {
      const g=PB.game, before=[g.table.W,g.table.H];
      g.fitPlayfield(26,45); const resized=[g.table.W,g.table.H,g.table.lamps.length];
      g.fitPlayfieldToCabinet(); return {before,resized,restored:[g.table.W,g.table.H]};
    }''')
    page.wait_for_timeout(400)
    assert report['liveResize']['resized'] == [26,45,43]
    page.screenshot(path=str(root / 'shots/raised-wireways-cabinet.png'))
    page.evaluate('''() => {
      const g=PB.game,T=THREE;
      g.__original=g.renderer.render.bind(g.renderer);
      ['menu','hud','fps','touch','vignette','scanlines','floats','flash'].forEach(id=>document.getElementById(id).style.display='none');
      g.machine.root.visible=false;
      g.world.balls.forEach(b=>{if(b.mesh)b.mesh.visible=false;if(b.shadow)b.shadow.visible=false;});
      g.__cam=new T.OrthographicCamera(-g.table.H*.64,g.table.H*.64,g.table.H*.54,-g.table.H*.54,.1,600);
      const c=g.surface.getWorldPosition(new T.Vector3()),up=new T.Vector3(0,0,1).applyQuaternion(g.group.quaternion),north=new T.Vector3(0,1,0).applyQuaternion(g.group.quaternion);
      g.__cam.position.copy(c).addScaledVector(up,200);g.__cam.up.copy(north);g.__cam.lookAt(c);
      g.renderer.render=sc=>g.__original(sc,g.__cam);
    }''')
    page.wait_for_timeout(250)
    page.screenshot(path=str(root / 'shots/playfield-polished-top.png'))
    page.evaluate('''() => {
      const g=PB.game,T=THREE,c=g.surface.getWorldPosition(new T.Vector3());
      const up=new T.Vector3(0,0,1).applyQuaternion(g.group.quaternion),north=new T.Vector3(0,1,0).applyQuaternion(g.group.quaternion);
      g.__cam=new T.PerspectiveCamera(38,innerWidth/innerHeight,.1,600);
      g.__cam.position.copy(c).addScaledVector(up,68).addScaledVector(north,-32);g.__cam.up.copy(north);g.__cam.lookAt(c);
    }''')
    page.wait_for_timeout(250)
    page.screenshot(path=str(root / 'shots/playfield-polished-angle.png'))
    report['browserErrors'] = errors
    (root / 'playfield-verification.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    browser.close()
    assert not errors, 'Browser errors occurred'
