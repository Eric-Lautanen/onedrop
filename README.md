# ONE DROP — Reggae Pinball

### ▶ **[Play the live demo](https://Eric-Lautanen.github.io/onedrop/)**

> The demo above is hosted on GitHub Pages. Enable it for this repo once  
> (Settings → Pages → Deploy from branch `main`, folder `/ (root)`).  
> Everything is static, so no build step is needed.

---

ONE DROP is a full pinball machine rendered in the browser — a 3D cabinet,  
a real inclined playfield, read-the-artwork hardware, a plasma-style  
dot-matrix display, and a synthesized dub/reggae riddim engine. It is pure  
HTML, CSS and JavaScript: no framework, no bundler, no server code shipped  
to the player.

The playfield art is measured, not eyeballed. Every lamp, ramp, slingshot  
and drop target is authored in "art percent" against the painted sheet, so  
the physics layout and the artwork can never drift apart.

**Roots • Dub • Skank.**

> **Special thanks: Tony "The Advisor" Barriera** — every table needs an  
> advisor; this one got the best. (See [below](#special-thanks).)

## The game

- **A real table.** Inclined ~6.5° like a cabinet, with flippers, slingshots,  
  pop bumpers, drop targets, wireform ramps, a shooter lane, a kickback, and  
  a tiki-shack bash toy.
- **Rules with a spine.** Five missions, collect-the-letters (IRIE), multiball  
  (up to 4 balls), jackpots, combos, bonus, ball save, skill shot, kickback and  
  tilt.
- **A DMD that means it.** A 128×32 dot-matrix panel rendered onto the backbox  
  screen, showing scores, missions and callouts.
- **A living riddim.** All music and sound effects are generated in the browser  
  with the Web Audio API — no audio files to download.
- **A demo that plays** *(easter egg)*. **Ctrl+D** hands the machine to a  
  demo player — plunger, flippers and all — either on the attract screen or on  
  the live ball you are playing, and Ctrl+D again takes it back. Any other key  
  or touch hands it over as well, ball still in the lane.  
  `PB.game.demo.toggle()` does the same from the console.
- **Made to be watched.** A hand-built 3D cabinet, backbox and legs, an  
  orbit/zoom camera, and hit effects (particles, trails, flashes, floating  
  scores) that can be toggled.
- **Plays anywhere.** Keyboard on desktop, on-screen buttons on touch devices —  
  and a **CAMERA LOCK** for tablets, so a thumb reaching for a flipper can land  
  on the glass without swinging the table.
- **Remembers your setup.** Volume, sound, FX, key bindings, fullscreen and the  
  camera lock are all kept in `localStorage` and come back on the next visit.

## Controls

| Input                    | Action                                |
| ------------------------ | ------------------------------------- |
| `Z` / left arrow         | Left flipper                          |
| `/` / right arrow        | Right flipper                         |
| `Space` (hold to the stop, release) | Plunge (the draw must be full) |
| `A` / `D`                | Nudge left / right                    |
| `R`                      | Reset game (one press)                |
| `M`                      | Sound on/off                          |
| `P`                      | Pause                                 |
| `F`                      | Fullscreen                            |
| Mouse / touch            | Drag to orbit; wheel or two-finger pinch to zoom (both dead while LOCK CAMERA is on) |

The plunger has to come **all the way back**: let go early and the spring simply  
returns, the ball stays in the lane and the panel says so. The same is true of  
the knob on the cabinet — drag it down its full travel.

**RESET GAME takes one press** — no arming, no confirm — and it puts the view  
back to the hero pose the machine boots in, whether the camera was down at  
the flippers or out on an orbit you dragged to. The camera *tweens* there on  
the same rig the game-start fly-in uses, so the machine squares up rather  
than jumping.

**LOCK CAMERA** freezes the view: with it on, taps, drags, pinches and the  
wheel do nothing to the camera, which is what you want on a tablet, where the  
thumb reaching for a flipper lands on the glass beside it. The flippers, the  
plunger knob and RESET GAME all keep working — the lock is about the finger  
on the glass, not about the machine itself.

Everything the menu sets is remembered: the volume fader, SOUND, FX, the key  
bindings, FULLSCREEN and the camera lock. Fullscreen is the one the browser  
will not hand back on its own (it needs a gesture), so a stored *on* is spent  
on your first click or keypress rather than failing silently — and leaving  
fullscreen with `Esc` or `F11` clears it, so it never drags you back in.

Keys are rebindable from the side menu — click a keycap, then press the key  
you want. The menu also has volume, FX, fullscreen and reset controls. Opening  
the menu does **not** pause the table (you can reach the volume mid-ball):  
pausing is `P`, or the menu's own PAUSE button.

## Running it on your machine

The game is a static site, so you only need a modern browser and *some* way  
to serve the folder over `http://localhost` (loading `index.html` straight  
from disk can block the sprite sheet and the audio engine in some browsers).

### Requirements

- A modern browser with WebGL: current Chrome, Edge, Firefox or Safari.  
  (Chromium-based Edge ships with Windows, so Windows users need nothing else.)
- A local static file server, whichever you already have:
  - **Windows** — none extra. PowerShell and Edge are built in.
  - **macOS / Linux** — Python 3 (standard library only) is recommended.
  - Or **any** static server you like (`npx serve`, `python -m http.server`, …).

### Windows — the app experience

Double-click **[`server/onedrop.bat`](server/onedrop.bat)**, or from a terminal:

```bat
server\onedrop.bat
```

This starts the server hidden and opens the game in a borderless, maximized  
Edge `--app` window. Closing that window shuts the server down automatically.

Prefer a plain browser + visible console:

```bat
powershell -NoProfile -ExecutionPolicy Bypass -File server\serve.ps1
```

### macOS / Linux

```sh
sh server/serve.sh
# or, equivalently:
python3 server/serve.py
```

`serve.sh` uses Python when it is available and falls back to the PowerShell  
server on Windows. `serve.py` is pure standard-library Python.

### Any platform, any server

Any static server pointed at the repo root works, too:

```sh
python3 -m http.server 8080
npx serve .
```

Then open <http://127.0.0.1:8080/>.

### Optional: a desktop icon (Windows)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File dev/Create-DesktopIcon.ps1
```

This puts **ONE DROP Pinball** on your Desktop, pointed at  
[`server/onedrop.bat`](server/onedrop.bat). The icon artwork lives at  
[`server/onedrop.ico`](server/onedrop.ico) and can be regenerated with  
[`dev/make_desktop_icon.ps1`](dev/make_desktop_icon.ps1).

## Project layout

```
index.html          the page: loader, menu, DMD canvas, module entry
src/css/style.css   all styling
src/js/             the game (see below)
assets/             the sprite sheet + artwork (sprite2.webp with .png fallback)
server/             local servers + desktop launcher (no dependencies)
dev/                development and verification scratch (not needed to play)
```

The JavaScript, in load order:

| file                                 | role                                                  |
| ------------------------------------ | ----------------------------------------------------- |
| `table.js`                           | the measured layout — pure data                       |
| `physics.js`                         | the solver                                            |
| `playfield.js`                       | every piece of hardware, built and animated           |
| `machine.js`                         | the cabinet, backbox and legs                         |
| `dmd.js`                             | the dot-matrix display                                |
| `audio.js`                           | the riddim engine                                     |
| `game.js`                            | renderer, camera, rules, input, HUD and the main loop |
| `batch.js`                           | draw-call folding: one `BatchedMesh` per material      |
| `guard.js`                           | frame-time governor: trades quality to hold 60 fps    |
| `art.js`, `assets.js`, `vibrance.js` | texture/art helpers and post-processing               |
| `vendor/three.module.js`, `vendor/three.core.js` | three.js **r186**, unmodified           |

The game is one ES module. `game.js` imports the file before it, that chain
ends at the two vendored three.js modules, and the browser fetches the graph in
parallel while evaluating it in the original document order — so there is still
no build step and no bundler. The vendored files are the official `build/`
output of `three@0.186.0`: since r161 three.js ships no UMD/global build, which
is why the old stack of `<script defer>` tags sharing one `THREE` global is gone.

### Frame time, and what the picture costs

`guard.js` is a governor, not a benchmark. It watches the interval between
frames, and on a machine that cannot hold 60 fps it trades quality for frame
time in a fixed order: the live mirror panels' render targets first (they are
seen edge-on through the glass), then the drawing buffer itself. It is
deliberately sceptical — every change is an experiment, and if the frame time
does not improve the quality is handed straight back and the governor stops
trying, so a machine that is short of CPU never gets a softer picture for
nothing. The HUD always shows the current frame time, and which trade is in
force when there is one: `60 FPS   16.7 ms   [mirror 50% · render 78%]`.

The governor also caps the drawing buffer at ~4.2 MPix however large the window
and the device pixel ratio are. An uncapped retina buffer is *several* 4K
frames' worth of samples once MSAA and the four passes a frame are counted,
which is how a GPU that shares system RAM with the CPU gets pushed into a
driver reset. And if the graphics device does go away under the game — a
Windows GPU hang, which takes every WebGL context in the browser with it — the
page says so and restarts itself, because three.js can re-initialize GL state
but cannot rebuild the buffers, textures and programs that died with the old
context.

## Special thanks

To **Tony "The Advisor" Barriera** — for the counsel, the patience and the  
good ear. This machine is better for it.

## License

MIT License

Copyright (c) 2026 ONE DROP contributors

Permission is hereby granted, free of charge, to any person obtaining a copy  
of this software and associated documentation files (the "Software"), to deal  
in the Software without restriction, including without limitation the rights  
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell  
copies of the Software, and to permit persons to whom the Software is  
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all  
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR  
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,  
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE  
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER  
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,  
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE  
SOFTWARE.
