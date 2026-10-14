/* ============================================================
   ONE DROP PINBALL  --  vibrance.js
   Colour fidelity for painted artwork.

   THE PROBLEM
   -----------
   The renderer runs ACESFilmicToneMapping so the chrome, the neon
   and the emissive inserts get a filmic roll-off instead of clipping
   to white. That is the right call for hardware. It is the wrong
   call for a *painting*: ACES compresses highlights and pulls
   saturated colour toward white, so the playfield, the backglass and
   the dot plate all came out grey and milky next to the sprite they
   were cut from. On top of that every art panel carried
   metalness 0.06 - 0.25, which scales the diffuse map down and mixes
   in a grey environment reflection -- a second coat of wash.

   THE FIX
   -------
   Painted art should not be re-lit or re-graded. It should be
   reproduced. A surface that is really a painting gets a faithful
   unlit material (MeshBasicMaterial + toneMapped:false), which
   round-trips the sRGB atlas to the screen with nothing in between.
   The 3-D read of the table still comes from everything that IS
   lit -- the wireform, the rubbers, the inserts, the lacquer sheen
   and the environment reflections sitting on top of the art.

   WHAT IS "PAINTED ART"
   ---------------------
   A surface with a texture map that is not a metal. The art panels
   in machine.js and playfield.js sit at metalness 0.06 - 0.25; the
   chrome, steel, gold, speaker grills and the ball are all 0.5 and
   up, so nothing shiny is ever caught. Metalness is the whole test
   -- no name lists, no mesh bookkeeping -- which means this keeps
   working when another module is rewritten underneath it.

   USING IT
   --------
     PB.vibrance.sweep(root)      convert a subtree in place
     PB.vibrance.paint(mesh)      convert one mesh
     PB.vibrance.faithful(mat)    get the faithful twin of a material

   sweep() is idempotent: a converted surface is a MeshBasicMaterial
   and is skipped on the next pass, so it is safe to call again after
   a late texture load, a hot resize, or a rebuild.
   ============================================================ */
(function (global) {
  'use strict';

  if (!global.THREE) return;

  /* Anything at or below this metalness and carrying a map is treated
     as paint. The art panels run 0.06 - 0.25; the first real metal is
     the speaker grill at 0.5. */
  var METAL_LIMIT = 0.30;

  /* How much of the painting's own brightness to keep. 1.0 is a
     literal reproduction of the sprite -- and on an unlit material
     anything less is a straight darkening with nothing gained, since
     there is no lighting response left to soften. Measured: at 0.96
     the field landed at x0.95 of the sprite's value; at 1.00 it lands
     at x0.99. Depth still comes from the exp fog, which is left on. */
  var LIFT = 1.0;

  var made = [];

  /* ---- the test ------------------------------------------------- */
  function isPaint(m) {
    if (!m || !m.map) return false;
    if (m.isMeshBasicMaterial) return false;            /* already faithful */
    if (m.userData && m.userData.vibrance) return false; /* already converted */
    if (m.userData && m.userData.noVibrance) return false; /* opted out */
    var metal = (m.metalness === undefined) ? 0 : m.metalness;
    return metal <= METAL_LIMIT;
  }

  /* ---- build the faithful twin ---------------------------------- */
  /* Everything that affects how the surface lands is carried over;
     everything that would re-interpret the colour is deliberately
     dropped (lights, metalness, roughness, emissive grading). */
  function faithful(src) {
    if (src.userData && src.userData.vibranceAs) return src.userData.vibranceAs;

    /* Carry the source's own tint instead of overwriting it with white:
       an art panel that tints its map (colour 0x8a8a8a, say) would
       otherwise come back brighter than it was authored. Multiplying
       by LIFT keeps the twin a reproduction, not a re-grade. */
    var tint = new THREE.Color(LIFT, LIFT, LIFT);
    if (src.color) tint.multiply(src.color);

    var m = new THREE.MeshBasicMaterial({
      name: (src.name || 'art') + ':faithful',
      color: tint,
      map: src.map,
      side: src.side,
      transparent: !!src.transparent,
      opacity: (src.opacity === undefined) ? 1 : src.opacity,
      alphaTest: src.alphaTest || 0,
      depthWrite: src.depthWrite !== false,
      depthTest: src.depthTest !== false,
      fog: (src.fog === undefined) ? true : src.fog
    });

    /* THE POINT. three.js picks the tone mapping per material, so this
       one surface skips the film curve while the rest of the scene
       keeps it. The sRGB atlas is decoded to linear on sample and
       re-encoded on output, so what lands on screen is the sprite. */
    m.toneMapped = false;
    m.userData.vibrance = true;
    m.userData.vibranceFrom = src;      /* so release() can put it back */

    if (src.userData) src.userData.vibranceAs = m;
    made.push(m);
    return m;
  }

  /* ---- convert one mesh in place -------------------------------- */
  function paint(mesh) {
    if (!mesh || !mesh.isMesh) return 0;
    /* per-mesh opt-out, so another module can protect a surface it is
       deliberately lighting or grading itself */
    if (mesh.userData && mesh.userData.noVibrance) return 0;
    var n = 0, mat = mesh.material;
    if (Array.isArray(mat)) {
      for (var i = 0; i < mat.length; i++) {
        if (!isPaint(mat[i])) continue;
        mat[i] = faithful(mat[i]); n++;
      }
      if (n) mesh.material = mat;
    } else if (isPaint(mat)) {
      mesh.material = faithful(mat); n++;
    }
    return n;
  }

  /* ---- convert a whole subtree ---------------------------------- */
  function sweep(root) {
    if (!root) return 0;
    var n = 0;
    root.traverse(function (o) {
      if (!o.isMesh) return;
      /* a mesh with no material, or one from a module mid-rewrite, must
         never be able to take the sweep -- or the boot -- down */
      try { n += paint(o); } catch (e) { /* leave that one alone */ }
    });
    return n;
  }

  /* ---- undo a sweep --------------------------------------------
     Puts the original material back on every mesh and disposes the
     faithful twin. Call this before disposing a subtree, otherwise the
     module that owns the mesh releases materials nothing is using
     while the twins it can no longer see leak. */
  function release(root) {
    if (!root) return 0;
    var n = 0;
    function undo(m) {
      var src = m && m.userData && m.userData.vibranceFrom;
      if (!src) return null;
      m.dispose();
      var j = made.indexOf(m);
      if (j >= 0) made.splice(j, 1);
      n++;
      return src;
    }
    root.traverse(function (o) {
      if (!o.isMesh) return;
      var mat = o.material;
      if (Array.isArray(mat)) {
        for (var i = 0; i < mat.length; i++) {
          var back = undo(mat[i]);
          if (back) mat[i] = back;
        }
      } else {
        var src = undo(mat);
        if (src) o.material = src;
      }
    });
    return n;
  }

  function dispose() {
    for (var i = 0; i < made.length; i++) made[i].dispose();
    made.length = 0;
  }

  global.PB = global.PB || {};
  global.PB.vibrance = {
    sweep: sweep,
    release: release,
    paint: paint,
    faithful: faithful,
    isPaint: isPaint,
    dispose: dispose,
    METAL_LIMIT: METAL_LIMIT,
    LIFT: LIFT,
    get count() { return made.length; }
  };
})(window);
