# vendor

`three.module.min.js` is **three.js r186**, bundled and minified here from the
untouched upstream files sitting beside it. Nobody has to run this to build or
serve the game — the app is a static site and this file is committed — but this
is how the file was produced, should it ever need reproducing:

    bun build src/js/vendor/three.module.js \
      --minify --format=esm --target=browser \
      --outfile=src/js/vendor/three.module.min.js

## Why we minify it ourselves

Upstream ships **no minified ES module** for r186. The published package's
`build/` holds only `three.core.js`, `three.module.js`, `three.tsl.js`,
`three.webgpu.js` and `three.webgpu.nodes.js` (checked against `three@0.186.0`
on unpkg, and the two files here are byte-identical to those), so there is
nothing to download.

`three.core.js` (1.46 MB) + `three.module.js` (0.66 MB) are 2.07 MB of source;
the bundle above is **748 KB in one file** — 64% less, and one request instead
of two, because bun inlines core into it. That matters on a cold cache, where
the module graph, not the 263 KB sprite sheet, is the boot's long pole.

## What is kept and why

`three.core.js` and `three.module.js` are the original upstream files: the dev
probes in `dev/` (`_bevel.html`, `_bleed.html`, `_verify.html`) import them,
and they are the input to the build above. The app itself imports only
`three.module.min.js` — `grep three.module src/js/*.js` should show the
`.min.js` in every application module and nothing else.

## Checks made when swapping it in

* 444 exports in both builds, with **no name missing and none added**.
* Same `REVISION` (`186`) reported by both.
* Identical results from a smoke test (a quaternion rotation, a
  `MeshStandardMaterial` colour, a `BoxGeometry` mesh's world matrix).
* The whole game played on it: cabinet built, ball launched, flippers firing,
  97.3k triangles and 68 textures drawn, 60 FPS.
