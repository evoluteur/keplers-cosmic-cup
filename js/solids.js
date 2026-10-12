/*!
 * Kepler's Cosmic Cup - geometry of the five Platonic solids
 * https://github.com/evoluteur/keplers-cosmic-cup
 * (c) 2026 Olivier Giulieri - MIT license
 *
 * Only the vertices are written down, scaled to a circumradius of 1. Edges
 * are the closest vertex pairs, and the faces are the planes of the convex
 * hull, found by brute force (there are at most twenty corners).
 */

const PHI = (1 + Math.sqrt(5)) / 2;

const v3 = {
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  unit: (a) => {
    const l = Math.hypot(a[0], a[1], a[2]);
    return [a[0] / l, a[1] / l, a[2] / l];
  },
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
};

// every cyclic permutation of (a, b, c), with both signs on nonzero parts
const cyclic = (a, b, c) => {
  const out = [];
  for (const [x, y, z] of [
    [a, b, c],
    [c, a, b],
    [b, c, a],
  ]) {
    for (const sx of x ? [x, -x] : [0])
      for (const sy of y ? [y, -y] : [0]) for (const sz of z ? [z, -z] : [0]) out.push([sx, sy, sz]);
  }
  return out;
};
const cubeCorners = () => {
  const out = [];
  for (const x of [1, -1]) for (const y of [1, -1]) for (const z of [1, -1]) out.push([x, y, z]);
  return out;
};

const RAW = {
  cube: cubeCorners,
  // every other corner of the cube, so the tetrahedron sits inside it
  tetrahedron: () => cubeCorners().filter(([x, y, z]) => x * y * z > 0),
  octahedron: () => cyclic(1, 0, 0),
  icosahedron: () => cyclic(0, 1, PHI),
  dodecahedron: () => [...cubeCorners(), ...cyclic(0, 1 / PHI, PHI)],
};
const makeSolid = (name) => {
  const verts = RAW[name]().map(v3.unit);
  // edges: all pairs at the shortest distance
  let dmin = Infinity;
  for (let i = 0; i < verts.length; i++)
    for (let j = i + 1; j < verts.length; j++) dmin = Math.min(dmin, v3.len(v3.sub(verts[i], verts[j])));
  const edges = [];
  for (let i = 0; i < verts.length; i++)
    for (let j = i + 1; j < verts.length; j++)
      if (v3.len(v3.sub(verts[i], verts[j])) < dmin * 1.001) edges.push([i, j]);
  // faces: the supporting planes of the convex hull. For each triple of
  // corners, keep the plane if every corner is on its inner side, and merge
  // planes that share a normal.
  const normals = [];
  for (let i = 0; i < verts.length; i++)
    for (let j = i + 1; j < verts.length; j++)
      for (let k = j + 1; k < verts.length; k++) {
        let n = v3.cross(v3.sub(verts[j], verts[i]), v3.sub(verts[k], verts[i]));
        if (v3.len(n) < 1e-9) continue;
        n = v3.unit(n);
        const d = v3.dot(n, verts[i]);
        if (d < 0) n = n.map((x) => -x);
        const dd = Math.abs(d);
        if (verts.every((v) => v3.dot(v, n) < dd + 1e-6) && !normals.some((m) => v3.dot(m, n) > 1 - 1e-6)) normals.push(n);
      }
  const faces = normals.map((n) => {
    const best = Math.max(...verts.map((v) => v3.dot(v, n)));
    const ids = verts.map((v, i) => i).filter((i) => v3.dot(verts[i], n) > best - 1e-6);
    // order the face's corners around its normal
    const c = ids.reduce((s, i) => [s[0] + verts[i][0], s[1] + verts[i][1], s[2] + verts[i][2]], [0, 0, 0]).map((x) => x / ids.length);
    const u = v3.unit(v3.sub(verts[ids[0]], c));
    const w = v3.cross(n, u);
    ids.sort((a, b) => {
      const da = v3.sub(verts[a], c);
      const db = v3.sub(verts[b], c);
      return Math.atan2(v3.dot(da, w), v3.dot(da, u)) - Math.atan2(v3.dot(db, w), v3.dot(db, u));
    });
    return { ids, n };
  });
  // inradius (center to face) and midradius (center to edge middle)
  const inradius = v3.dot(verts[faces[0].ids[0]], faces[0].n);
  const [a, b] = edges[0];
  const midradius = v3.len(verts[a].map((x, k) => (x + verts[b][k]) / 2));
  return { name, verts, edges, faces, inradius, midradius };
};

const SOLIDS = Object.fromEntries(Object.keys(RAW).map((k) => [k, makeSolid(k)]));
