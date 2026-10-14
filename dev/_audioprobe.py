"""Quick probe: boot the game, dump console/page errors and the audio surface."""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b = p.chromium.launch(channel='msedge', args=['--use-gl=angle', '--use-angle=swiftshader',
                                                  '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'])
    pg = b.new_page(viewport={'width': 1200, 'height': 900})
    msgs = []
    pg.on('console', lambda m: msgs.append(m.type.upper() + ': ' + m.text))
    pg.on('pageerror', lambda e: msgs.append('PAGEERROR: ' + str(e)))
    pg.goto('http://127.0.0.1:8101/', wait_until='load')
    pg.wait_for_timeout(6000)
    state = pg.evaluate('''() => ({
        PB: typeof window.PB,
        assets: window.PB && !!PB.assets,
        ready: window.PB && !!(PB.assets && PB.assets.ready),
        game: window.PB && !!PB.game,
        audio: window.PB && !!PB.audio,
        audioKeys: window.PB && PB.audio ? Object.keys(PB.audio) : null,
        slider: !!document.querySelector('#volumeSlider, input[type=range]'),
        dmd: window.PB && !!PB.dmd
    })''')
    print('STATE', state)
    print('--- messages ---')
    for m in msgs[:24]:
        print(m[:400])
    b.close()
