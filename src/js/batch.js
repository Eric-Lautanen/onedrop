/* ============================================================
   ONE DROP PINBALL  --  batch.js
   Draw-call folding for built geometry.

   Every part of this machine is its own Mesh, which is the right way to
   BUILD it and the wrong way to DRAW it. Once the cabinet and playfield
   are up they are ~360 meshes on ~84 materials, and the frame is submitted
   four times over -- the main pass plus one per live mirror panel -- so the
   hardware alone costs ~1450 draw calls a frame.

   Measured on the development machine, with the clock stopped either side:
     mirrors on   4 passes/frame   1473 draws/frame   19.0 ms/frame
     mirrors off  1 pass /frame    372 draws/frame   16.4 ms/frame
   and it is submission, not fill: dropping the mirror render targets from
   768x768 to 320x320 changes nothing measurable, raising them to 1280x1280
   changes nothing either, while hiding half the meshes hands the time
   straight back.

   So the built meshes are folded into one THREE.BatchedMesh per material
   and per vertex layout. three.js gained BatchedMesh in r158, and on a
   renderer with WEBGL_multi_draw a whole batch is a single draw call; on
   this machine 282 of the 361 meshes sit on just 14 materials.

   WHAT KEEPS WORKING
     The folded meshes are NOT removed. They are hidden (visible = false),
     so they stay in the scene graph for everything that goes looking for
     them by reference -- the pointer raycasts the flipper buttons and the
     plunger knob out of the scene, vibrance's sweep walks meshes to swap
     their materials, and a resize tears subtrees down and hands the
     originals back. THREE still refreshes every hidden mesh's world
     matrix, and update() mirrors any matrix that changed into its batch
     instance, so a part that moves after the fold -- a bumper's flash, a
     flipper, the knob being pulled -- keeps moving. Nothing has to know in
     advance which parts are animated, which is what makes this safe: the
     list cannot go stale.

     Nothing is folded that cannot survive it: transparent materials (they
     are depth-sorted per mesh), sprites, instanced meshes (already one
     call each), material arrays, meshes with a renderOrder, meshes that
     hook onBeforeRender (the mirror panels render their own targets from
     there), meshes with children, non-default layers, and morph-target
     geometry.

   COST
     update() compares 16 floats per folded mesh per frame -- a few
     thousand compares -- and writes one 64-byte block into a data texture
     for each mesh that actually moved.
   ============================================================ */
import './table.js';
import * as THREE from './vendor/three.module.js';

(function (global) {
  'use strict';

  var NOOP = THREE.Object3D.prototype.onBeforeRender;
  var MIN_MESHES = 2;               /* a batch of one is just a Mesh */

  var live = [];                    /* one record per BatchedMesh */
  var tmpRel = new THREE.Matrix4();
  var zero = new THREE.Matrix4().set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);

  /* ---- what a batch can hold ---------------------------------------
     BatchedMesh refuses to mix indexed with non-indexed geometry, and
     every geometry in one batch must carry the same attributes at the
     same item sizes. Grouping by exactly that signature keeps it legal. */
  function layout(g) {
    var parts = [g.getIndex() ? 'i' : 'n'];
    var attrs = g.attributes;
    for (var k in attrs) {
      if (!attrs.hasOwnProperty(k)) continue;
      var a = attrs[k];
      parts.push(k + ':' + a.itemSize + ':' + (a.normalized ? 1 : 0) +
        ':' + (a.array ? a.array.constructor.name : '?'));
    }
    return parts.sort().join('|');
  }

  function foldable(o) {
    if (!o.isMesh || o.isInstancedMesh || o.isBatchedMesh || o.isSkinnedMesh) return false;
    if (!o.visible || o.children.length) return false;
    if (o.renderOrder !== 0) return false;
    if (o.layers.mask !== 1) return false;
    if (o.onBeforeRender && o.onBeforeRender !== NOOP) return false;
    var m = o.material;
    if (!m || Array.isArray(m) || m.transparent || m.visible === false) return false;
    if (m.isSpriteMaterial || m.isShaderMaterial) return false;
    var g = o.geometry;
    if (!g || !g.attributes || !g.attributes.position) return false;
    if (g.morphAttributes && Object.keys(g.morphAttributes).length) return false;
    return true;
  }

  /* ---- fold one material + layout group ----------------------------- */
  function build(mat, items, root) {
    var geos = [], vTotal = 0, iTotal = 0, i;
    for (i = 0; i < items.length; i++) {
      var g = items[i].geometry;
      if (geos.indexOf(g) >= 0) continue;
      geos.push(g);
      vTotal += g.attributes.position.count;
      if (g.getIndex()) iTotal += g.getIndex().count;
    }
    if (vTotal === 0) return null;

    var bm = new THREE.BatchedMesh(items.length, vTotal, iTotal, mat);
    var ids = {}, rec = { mesh: bm, root: root, inv: new THREE.Matrix4(), last: new THREE.Matrix4(), ids: [] };
    rec.inv.copy(root.matrixWorld).invert();
    rec.last.copy(root.matrixWorld);

    for (i = 0; i < items.length; i++) {
      var o = items[i], geo = o.geometry;
      var gid = ids[geo.uuid];
      if (gid === undefined) { gid = bm.addGeometry(geo); ids[geo.uuid] = gid; }
      var id = bm.addInstance(gid);
      tmpRel.copy(o.matrixWorld).premultiply(rec.inv);
      bm.setMatrixAt(id, tmpRel);
      /* the source keeps its place in the graph, and its matrix, but draws
         nothing: it exists for whoever still holds a reference to it */
      rec.ids.push({ id: id, src: o, last: o.matrixWorld.clone() });
      o.visible = false;
    }

    bm.name = 'batch · ' + (mat.name || mat.type) + ' · ' + items.length;
    bm.matrixAutoUpdate = false;         /* identity local matrix, always */
    bm.updateMatrix();
    root.add(bm);
    return rec;
  }

  /* ---- release ------------------------------------------------------
     Drops the batches under `root` and un-hides their meshes, so the
     originals draw themselves again. BatchedMesh.dispose() takes its own
     geometry and the instance data textures with it; the material is
     shared with the meshes it was built from and is never ours to free. */
  function release(root) {
    for (var i = live.length - 1; i >= 0; i--) {
      var rec = live[i];
      if (root && rec.root !== root) continue;
      if (rec.mesh.parent) rec.mesh.parent.remove(rec.mesh);
      for (var j = 0; j < rec.ids.length; j++) rec.ids[j].src.visible = true;
      rec.mesh.dispose();
      live.splice(i, 1);
    }
  }

  /* ---- fold everything foldable under `root` -------------------------
     Idempotent: it releases first, so calling it again after a rebuild
     folds the new geometry and never double-draws the old. */
  function fold(root, opts) {
    if (!root) return { batches: 0, meshes: 0 };
    opts = opts || {};
    var min = opts.minMeshes || MIN_MESHES;
    release(root);
    root.updateMatrixWorld(true);

    var groups = new Map(), key, g;
    root.traverse(function (o) {
      if (!foldable(o)) return;
      key = o.material.uuid + '#' + layout(o.geometry);
      g = groups.get(key);
      if (!g) { g = { mat: o.material, items: [] }; groups.set(key, g); }
      g.items.push(o);
    });

    var batches = 0, meshes = 0, leftovers = 0;
    groups.forEach(function (grp) {
      if (grp.items.length < min) { leftovers += grp.items.length; return; }
      var rec = build(grp.mat, grp.items, root);
      if (!rec) { leftovers += grp.items.length; return; }
      live.push(rec);
      batches++;
      meshes += grp.items.length;
    });
    return { batches: batches, meshes: meshes, unfolded: leftovers };
  }

  /* ---- per frame ----------------------------------------------------
     A hidden mesh still has its world matrix refreshed by THREE, so the
     only work here is noticing which ones changed and copying that matrix
     onto the instance. Nothing moved in a typical frame but the ball, a
     few flippers and whatever is flashing. */
  function update() {
    for (var b = 0; b < live.length; b++) {
      var rec = live[b], ids = rec.ids, j;
      if (!rec.root.matrixWorld.equals(rec.last)) {
        rec.last.copy(rec.root.matrixWorld);
        rec.inv.copy(rec.root.matrixWorld).invert();
        /* the whole batch is drawn in the root's space, so a moved root
           invalidates every instance, not just the moving ones */
        for (j = 0; j < ids.length; j++) ids[j].last.copy(zero);
      }
      for (j = 0; j < ids.length; j++) {
        var e = ids[j];
        if (e.src.matrixWorld.equals(e.last)) continue;
        e.last.copy(e.src.matrixWorld);
        tmpRel.copy(e.src.matrixWorld).premultiply(rec.inv);
        rec.mesh.setMatrixAt(e.id, tmpRel);
      }
    }
  }

  function stats() {
    var meshes = 0, insts = 0;
    for (var i = 0; i < live.length; i++) { meshes++; insts += live[i].ids.length; }
    return { batches: meshes, instances: insts, list: live.map(function (r) { return r.mesh.name; }) };
  }

  global.PB = global.PB || {};
  global.PB.batch = { fold: fold, release: release, update: update, stats: stats };
})(window);
