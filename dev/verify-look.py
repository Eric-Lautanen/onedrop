"""Verify what the picture is judged on: mirror antialiasing, depth fighting,
   and the pane's crystal profile. Runagainst the local server on :8101.

  python dev/verify-look.py

WHY THESE THREE, AND WHY THEY CAN BE MEASURED WITHOUT EYES
----------------------------------------------------------
  1. Z-FIGHTING. Changing a PerspectiveCamera's NEAR plane changes only the
     depth mapping: m[0]/m[5] of the projection matrix contain no near or far,
     so every vertex projects to the same screen pixel and no silhouette can
     move. Render, jitter near by 0.02%, render again -- every pixel that
     changes colour is a pixel where the depth test swapped winners between
     two (near-)coincident surfaces. Measured TWICE IN ONE SESSION, with the
     flat-overlay depth bias OFF and ON, so the pair shares a governor state,
     a camera and an attract frame and cannot drift apart on their own.

     The governor is PINNED at tier 0 first, because its lever IS the drawing
     buffer's resolution: left free, the buffer resizes under the probe and
     the pixel counts stop meaning anything.

  2. MIRROR ALIASING. The mirror render targets are read back and scored for
     hard one-pixel edges and isolated one-pixel extrema -- what a staircase
     is made of. Both fall when the pass carries its own MSAA, which it must
     ask for itself: the canvas's `antialias` never reaches a render target.

  3. THE PANE. Its crystal profile is a real bevelled extrusion, checked in
     the geometry itself (tilted facet normals cannot be faked by a shader),
     and its reflection is checked not to wash the painting underneath.
"""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parent
OUT = root / 'shots'
OUT.mkdir(exist_ok=True)
URL = 'http://127.0.0.1:8101/'

# the draw is at most 1000x750 and the numbers below are from a settled
# frame; the pair for z-fighting must show the bias DOING something.
ZFIGHT_MAX = {'player': 150, 'grazing': 12000, 'steep': 150}
MIRROR_ISOLATED_MAX = [1000, 950, 420]
GLASS_WASH_MAX = {'player': 8.0, 'grazing': 12.0}
# How much of the painting's colour has to survive the pane. These are PER
# VIEW on purpose: at the grazing camera Schlick's F is around 0.15, so the
# pane necessarily trades about a seventh of the artwork's colour for the
# reflection -- that is what a real pane does, and it measured 0.897 before
# this change set and 0.894 after. A single bound taken from the player view
# would fail on physics rather than on a regression. What these catch is the
# pane turning into a film: a milky overlay drives colour retention far
# below the Fresnel floor.
GLASS_SATURATION_MIN = {'player': 0.95, 'grazing': 0.85}


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge',
                                    args=['--use-gl=angle', '--use-angle=swiftshader',
                                          '--enable-unsafe-swiftshader'])
        page = browser.new_page(viewport={'width': 1000, 'height': 750})
        errors = []
        page.on('console', lambda m: errors.append('console: ' + m.text[:300])
                if m.type == 'error' else None)
        page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)[:300]))
        page.goto(URL, wait_until='load')
        page.wait_for_function('PB.game && PB.game.machine && PB.assets.ready',
                               timeout=45000)
        page.wait_for_timeout(1000)
        page.evaluate('''() => {
          const g = PB.game, T = THREE;
          PB.guard.force(0, true);          /* hold the resolution still */
          g.__orig = g.renderer.render.bind(g.renderer);
          const up = new T.Vector3(0, 0, 1).applyQuaternion(g.group.quaternion);
          const north = new T.Vector3(0, 1, 0).applyQuaternion(g.group.quaternion);
          g.__cam = new T.PerspectiveCamera(40, innerWidth / innerHeight, 0.5, 400);
          g.__aim = (a, back) => {
            const c = g.surface.getWorldPosition(new T.Vector3());
            g.__cam.position.copy(c).addScaledVector(up, a).addScaledVector(north, back);
            g.__cam.up.copy(north); g.__cam.lookAt(c);
            g.__cam.near = 0.5; g.__cam.far = 400;
            g.__cam.updateProjectionMatrix(); g.__cam.updateMatrixWorld();
          };
          g.__aim(68, -97);
          g.renderer.render = (s, c) => s.userData.renderingMirror
            ? g.__orig(s, c) : g.__orig(s, g.__cam);
          /* the flat overlays whose depth bias is under test, with the
             shipped values kept so the source state can be put back */
          const overlays = [];
          const add = (m) => { if (m) overlays.push({ m: m,
            f: m.polygonOffsetFactor, u: m.polygonOffsetUnits, on: m.polygonOffset }); };
          add(g.sheen.material);
          g.scene.traverse(o => { if (o.isInstancedMesh && o.material) add(o.material); });
          g.__overlays = overlays;
          g.__bias = (on) => overlays.forEach(o => {
            o.m.polygonOffset = on ? o.on : false;
            if (on) { o.m.polygonOffsetFactor = o.f; o.m.polygonOffsetUnits = o.u; }
          });
          g.__overlayCount = overlays.length;
          ['menu', 'hud', 'fps', 'touch', 'vignette', 'scanlines', 'floats', 'flash']
            .forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
        }''')
        page.wait_for_timeout(400)
        report = page.evaluate('''() => {
          const g = PB.game, T = THREE, cam = g.__cam, ctx = g.renderer.getContext();
          g.__aim(68, -97); g.renderer.render(g.scene, cam);
          const w = ctx.drawingBufferWidth, h = ctx.drawingBufferHeight;
          const buf = () => {
            if (ctx.drawingBufferWidth !== w || ctx.drawingBufferHeight !== h) {
              throw new Error('drawing buffer moved under the probe: ' +
                ctx.drawingBufferWidth + 'x' + ctx.drawingBufferHeight +
                ', was ' + w + 'x' + h);
            }
            const a = new Uint8Array(w * h * 4);
            ctx.readPixels(0, 0, w, h, ctx.RGBA, ctx.UNSIGNED_BYTE, a);
            return a;
          };
          const draw = () => { g.renderer.render(g.scene, cam); return buf(); };
          function zFight(overlayBias) {
            g.__bias(overlayBias);
            cam.near = 0.5; cam.updateProjectionMatrix();
            const a = draw();
            cam.near = 0.5 * 1.0002; cam.updateProjectionMatrix();
            const b = draw();
            cam.near = 0.5; cam.updateProjectionMatrix();
            let n = 0;
            for (let i = 0; i < a.length; i += 4) {
              if (Math.abs(a[i] - b[i]) + Math.abs(a[i+1] - b[i+1])
                  + Math.abs(a[i+2] - b[i+2]) > 24) n++;
            }
            return n;
          }
          function aliasing(target) {
            const W = target.width, H = target.height;
            const a = new Uint8Array(W * H * 4);
            g.renderer.readRenderTargetPixels(target, 0, 0, W, H, a);
            const L = new Uint8Array(W * H);
            for (let i = 0, k = 0; i < a.length; i += 4, k++) {
              L[k] = (a[i] * 0.299 + a[i+1] * 0.587 + a[i+2] * 0.114) | 0;
            }
            let hard = 0, isolated = 0;
            for (let y = 1; y < H - 1; y++) {
              for (let x = 1; x < W - 1; x++) {
                const k = y * W + x, c = L[k];
                const l = L[k-1], r = L[k+1], u = L[k-W], d = L[k+W];
                if (Math.abs(c - r) > 40 && Math.abs(c - l) > 40) hard++;
                const hi = Math.max(l, r, u, d), lo = Math.min(l, r, u, d);
                if (c > hi + 30 || c < lo - 30) isolated++;
              }
            }
            return { size: [W, H], samples: target.samples,
                     hardEdgePx: hard, isolatedPx: isolated };
          }
          const res = { buffer: [w, h], overlayMaterials: g.__overlayCount, views: {} };
          for (const [name, a, back] of [['player', 68, -97], ['grazing', 16, -42],
                                         ['steep', 80, -10]]) {
            g.__aim(a, back);
            res.views[name] = { off: zFight(false), on: zFight(true) };
          }
          g.__bias(true);
          g.__aim(65, -32); g.renderer.render(g.scene, cam);
          res.mirrors = g.machine.mirrors.map((m, i) => {
            const row = aliasing(m.userData.reflectionTarget);
            row.index = i;
            return row;
          });
          /* THE PANE: a real crystal profile, and a reflection that does not
             wash the painting. */
          const glass = g.machine.root.getObjectByName('clear playfield glass');
          const geo = glass.geometry;
          const nrm = geo.attributes.normal, pos = geo.attributes.position;
          let facets = 0;
          for (let i = 0; i < nrm.count; i++) if (Math.abs(nrm.getZ(i)) < 0.9) facets++;
          res.pane = {
            geometry: geo.type,
            chamfer: glass.userData.chamfer || null,
            pane: glass.userData.pane || geo.userData.pane || null,
            bevelFacetVertices: facets,
            depthWrite: glass.material.depthWrite,
            transparent: glass.material.transparent,
            shaderHasSchlick: /pow\\(1\\.0-NoV,5\\.0\\)/.test(glass.material.fragmentShader),
            f0: glass.material.uniforms.glassF0.value,
            coating: glass.material.uniforms.glassAR.value,
            gain: glass.material.uniforms.glassGain.value
          };
          const fb = new Uint8Array(w * h * 4);
          function frame() {
            g.renderer.render(g.scene, cam);
            ctx.readPixels(0, 0, w, h, ctx.RGBA, ctx.UNSIGNED_BYTE, fb);
            return Uint8Array.from(fb);
          }
          function wash(a, back) {
            g.__aim(a, back);
            glass.visible = true;  const withG = frame();
            glass.visible = false; const without = frame();
            glass.visible = true;
            let sum = 0, art = 0, satW = 0, satWo = 0;
            for (let i = 0; i < withG.length; i += 4) {
              const mw = Math.max(without[i], without[i+1], without[i+2]);
              const nw = Math.min(without[i], without[i+1], without[i+2]);
              if (mw - nw > 45 && mw > 60) {
                art++;
                sum += (Math.abs(withG[i]-without[i]) + Math.abs(withG[i+1]-without[i+1])
                        + Math.abs(withG[i+2]-without[i+2])) / 3;
                satWo += mw - nw;
                satW += Math.max(withG[i], withG[i+1], withG[i+2])
                      - Math.min(withG[i], withG[i+1], withG[i+2]);
              }
            }
            return { artworkPixels: art, meanDelta: +(sum / Math.max(1, art)).toFixed(2),
                     saturationKept: +(satW / Math.max(1, satWo)).toFixed(3) };
          }
          res.glass = { player: wash(68, -97), grazing: wash(16, -42) };
          /* hand back JSON: the measurement is numbers only, and this keeps
             the transport independent of Playwright's serialiser */
          return JSON.stringify(res);
        }''')

        report = json.loads(report)

        for name, a, back in [('player', 68, -97), ('grazing', 16, -42), ('steep', 80, -10)]:
            page.evaluate('([a, b]) => PB.game.__aim(a, b)', [a, back])
            page.wait_for_timeout(250)
            page.screenshot(path=str(OUT / ('look-%s.png' % name)))

        report['errors'] = errors
        (root / 'look-verification.json').write_text(json.dumps(report, indent=2))
        browser.close()

        fail = []

        def check(ok, msg):
            (print if ok else print)('  %s %s' % ('OK  ' if ok else 'FAIL', msg))
            if not ok:
                fail.append(msg)

        print('buffer %s, %d overlay materials biased'
              % ('x'.join(str(x) for x in report['buffer']), report['overlayMaterials']))

        print('z-fighting (near-plane jitter), overlay bias off -> on:')
        for name, row in report['views'].items():
            check(row['on'] <= ZFIGHT_MAX[name],
                  '%-8s %6d -> %6d  (max %d)' % (name, row['off'], row['on'], ZFIGHT_MAX[name]))
        check(report['views']['grazing']['on'] < report['views']['grazing']['off'] * 0.5,
              'the depth bias is doing the work at grazing (at least half the fights removed)')

        print('mirror targets (a render target needs its own MSAA):')
        for row in report['mirrors']:
            check(row['samples'] == 4, 'mirror %d samples = %d (want 4)' % (row['index'], row['samples']))
            check(row['isolatedPx'] <= MIRROR_ISOLATED_MAX[row['index']],
                  'mirror %d staircase pixels %d (max %d)'
                  % (row['index'], row['isolatedPx'], MIRROR_ISOLATED_MAX[row['index']]))

        print('the pane:')
        p = report['pane']
        check(p['geometry'] == 'ExtrudeGeometry', 'profile is an extrusion (%s)' % p['geometry'])
        check(bool(p['chamfer']) and bool(p['pane']),
              'chamfer %.3f on a %.2f x %.2f x %.2f pane'
              % (p['chamfer'] or 0, (p['pane'] or {}).get('width', 0),
                 (p['pane'] or {}).get('height', 0), (p['pane'] or {}).get('depth', 0)))
        check(p['bevelFacetVertices'] > 0,
              '%d vertices sit on tilted facet normals (a shader cannot fake this)'
              % p['bevelFacetVertices'])
        check(p['depthWrite'] is False and p['transparent'] is True,
              'the pane composites, it never writes depth')
        check(p['shaderHasSchlick'] and p['f0'] == 0.04,
              'Schlick with F0 = 0.04 (a pinball pane, not a mirror)')
        for name, row in report['glass'].items():
            check(row['meanDelta'] <= GLASS_WASH_MAX[name],
                  '%-8s reflection moves the art by %.2f/255 (max %.1f), colour kept %.3f'
                  % (name, row['meanDelta'], GLASS_WASH_MAX[name], row['saturationKept']))
            check(row['saturationKept'] >= GLASS_SATURATION_MIN[name],
                  '%-8s the painting keeps %.3f of its colour (min %.2f, the Fresnel floor)'
                  % (name, row['saturationKept'], GLASS_SATURATION_MIN[name]))

        check(not report['errors'], 'no console errors: %s' % (report['errors'] or 'none'))

        if fail:
            print('\nFAILED %d check(s)' % len(fail))
            sys.exit(1)
        print('\nall look checks passed')


if __name__ == '__main__':
    main()
