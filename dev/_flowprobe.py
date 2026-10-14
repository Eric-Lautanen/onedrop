"""Fast loop for the mission-music checks: run only the insert harnesses from
verify-audio and print what they return, so the flow, the cut-short path and
the live game hand-off can be reasoned about without waiting for the whole
(render-heavy) suite."""
import importlib.util
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('va', ROOT / 'verify-audio.py')
va = importlib.util.module_from_spec(spec)
spec.loader.exec_module(va)

with sync_playwright() as p:
    b = p.chromium.launch(channel='msedge', args=[
        '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--autoplay-policy=no-user-gesture-required'])
    page = b.new_page(viewport={'width': 1000, 'height': 800})
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto('http://127.0.0.1:8101/', wait_until='load')
    page.wait_for_function('window.PB && PB.game && PB.assets.ready', timeout=60000)
    page.evaluate(va.TOOLS)

    flow = page.evaluate('() => window.__insertFlow()')
    print('== flow  asked', flow['asked'], 'insertLen', flow['insertLen'])
    for i, r in enumerate(flow['runs']):
        tag = 'INSERT' if r['song'] in flow['insertLen'] else 'song  '
        print('  %2d %s %-14s n=%-4d local %d..%d  global %d'
              % (i, tag, r['song'], r['n'], r['firstLocal'], r['lastLocal'], r['firstGlobal']))
    print('  retimes', flow['retimes'])
    print('  left playing', flow['insertLeft'], 'pending', flow['pending'])

    cut = page.evaluate('() => window.__insertCut()')
    print('== cut  insertLen', cut['insertLen'], 'askedAt', cut['askedAt'], 'cutAt', cut['cutAt'])
    for i, r in enumerate(cut['runs'][:6]):
        tag = 'INSERT' if r['song'] == 'IRIE MASTER' else 'song  '
        print('  %2d %s %-14s n=%-4d local %d..%d  global %d'
              % (i, tag, r['song'], r['n'], r['firstLocal'], r['lastLocal'], r['firstGlobal']))
    print('  retimes', cut['retimes'][:6])
    print('  playing', cut['playing'], 'pending', cut['pending'])

    songs = {s['name'] for s in page.evaluate('() => PB.AudioEngine.SONGS.map(s => ({name: s.name}))')}
    live = page.evaluate('''() => {
      const a = PB.game.audio; a.init(); a.resume(); a.startMusic();
      PB.game.multiball();
      return { asked: a.nowPlaying(), playing: a.insertName(),
               pending: a._pendingInsert ? a._pendingInsert.name : null, song: a.songName() };
    }''')
    page.wait_for_timeout(5000)
    mid = page.evaluate('''() => ({ playing: PB.game.audio.insertName(),
      nowPlaying: PB.game.audio.nowPlaying(), song: PB.game.audio.songName() })''')
    page.evaluate('() => PB.game.resetGame()')
    gone = page.evaluate('''() => ({ playing: PB.game.audio.insertName(),
      pending: PB.game.audio._pendingInsert, nowPlaying: PB.game.audio.nowPlaying(),
      music: PB.game.audio.musicOn })''')
    print('== game  asked', live, '\n   after 5s', mid, '\n   after reset', gone)
    print('   requested vamp is a real insert:', live['asked'] == 'SKANK RIOT',
          '| took over:', mid['playing'] == 'SKANK RIOT',
          '| cleared:', gone['playing'] is None and gone['pending'] is None,
          '| back to a song:', gone['nowPlaying'] in songs,
          '| music off:', not gone['music'])
    b.close()

print('errors:', errs)
(ROOT / '_insertflow.json').write_text(
    json.dumps({'flow': flow, 'cut': cut, 'live': live, 'mid': mid, 'gone': gone}, indent=2),
    encoding='utf-8')
