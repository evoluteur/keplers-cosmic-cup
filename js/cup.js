/*!
 * Kepler's Cosmic Cup
 * https://github.com/evoluteur/keplers-cosmic-cup
 * (c) 2026 Olivier Giulieri - MIT license
 *
 * The model of the Mysterium Cosmographicum (1596): Saturn's sphere holds a
 * cube, the cube holds Jupiter's sphere, then a tetrahedron, Mars, a
 * dodecahedron, the Earth, an icosahedron, Venus, an octahedron and Mercury.
 * Each solid touches the sphere outside it with its corners and the sphere
 * inside it with its faces, so the spacing of the planets follows from the
 * shapes alone. Drawn on a 2D canvas with a small hand-made 3D projection.
 */

// Mean distance from the Sun (AU) and orbital eccentricity (J2000).
const PLANETS = {
  saturn: { name: "Saturn", sym: "♄", a: 9.537, e: 0.0565, color: "#e3c58d" },
  jupiter: { name: "Jupiter", sym: "♃", a: 5.203, e: 0.0489, color: "#e0a56b" },
  mars: { name: "Mars", sym: "♂", a: 1.524, e: 0.0934, color: "#e8634a" },
  earth: { name: "Earth", sym: "♁", a: 1.0, e: 0.0167, color: "#4fa3f7" },
  venus: { name: "Venus", sym: "♀", a: 0.723, e: 0.0068, color: "#f2dc8f" },
  mercury: { name: "Mercury", sym: "☿", a: 0.387, e: 0.2056, color: "#b9b9c6" },
};
// The solids with Plato's elements, as Kepler also matched them.
const SOLID_INFO = {
  cube: { name: "Cube", element: "Earth", color: "#8bc34a" },
  tetrahedron: { name: "Tetrahedron", element: "Fire", color: "#ff7043" },
  dodecahedron: { name: "Dodecahedron", element: "Aether (the cosmos)", color: "#b388ff" },
  icosahedron: { name: "Icosahedron", element: "Water", color: "#4dd0e1" },
  octahedron: { name: "Octahedron", element: "Air", color: "#ffd54f" },
};
const ORDER = [
  "saturn",
  "cube",
  "jupiter",
  "tetrahedron",
  "mars",
  "dodecahedron",
  "earth",
  "icosahedron",
  "venus",
  "octahedron",
  "mercury",
];

const KEY = "kepler-cup-settings";
let opts = {
  shells: "thin", // thin: one sphere per planet at its mean distance; thick: Kepler's shells
  mercury: "faces", // faces: Mercury's sphere inside the octahedron; edges: touching its edges
  style: "color",
  orbits: true,
  spin: true,
  cutaway: false,
  hidden: [],
};

let layers = []; // [{ key, kind, r (outer), rIn (thick inner), ... }]
let focus = 0; // index of the layer that fills the view
let zoomLog = 0; // log of the radius in view (animated toward the focus)
let yaw = -0.6;
let pitch = 0.42;
let time = 0; // years
let lastT = 0;
let drag = null;
let stars = [];
let cv, ctx, W, H, dpr;

const $ = (id) => document.getElementById(id);
const isPlanet = (k) => !!PLANETS[k];

// ------------------------------------------------------------------ model

const buildLayers = () => {
  layers = [];
  let r = 1; // outer radius of the next layer
  ORDER.forEach((key, i) => {
    if (isPlanet(key)) {
      const p = PLANETS[key];
      const rIn = opts.shells === "thick" ? (r * (1 - p.e)) / (1 + p.e) : r;
      layers.push({ key, kind: "planet", r, rIn, mean: (r + rIn) / 2, ...p });
      r = rIn;
    } else {
      const s = SOLIDS[key];
      const ratio = key === "octahedron" && opts.mercury === "edges" ? s.midradius : s.inradius;
      layers.push({ key, kind: "solid", r, solid: s, ratio, ...SOLID_INFO[key] });
      r = r * ratio;
    }
  });
};

// ------------------------------------------------------------------ 3D

// rotate a point by yaw (around the vertical) then pitch (tip toward viewer)
const rot = (p) => {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const x1 = p[0] * cy + p[2] * sy;
  const z1 = -p[0] * sy + p[2] * cy;
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  return [x1, p[1] * cp - z1 * sp, p[1] * sp + z1 * cp];
};

const view = () => {
  const R = Math.exp(zoomLog);
  const S = (Math.min(W, H) * 0.44) / R;
  return { R, S, cx: W / 2, cy: H / 2 };
};

// ------------------------------------------------------------------ drawing

const palette = () =>
  opts.style === "engraving"
    ? {
        bg: "#efe3c6",
        ink: "#3b2a1a",
        faint: "rgba(59,42,26,0.35)",
        sphere: "rgba(59,42,26,0.55)",
        sphereFill: "rgba(59,42,26,0.04)",
        label: "#3b2a1a",
        stars: false,
      }
    : {
        bg: null,
        ink: null,
        faint: "rgba(255,255,255,0.25)",
        sphere: "rgba(205,220,255,0.55)",
        sphereFill: "rgba(160,190,255,0.05)",
        label: "#e9eefb",
        stars: true,
      };

const layerAlpha = (rad, R) => {
  const f = rad / R;
  if (f < 0.012) return 0;
  if (f <= 1.2) return 1;
  return Math.max(0, 1 - (f - 1.2) / 1.6);
};

const drawBackground = (P) => {
  if (P.bg) {
    ctx.fillStyle = P.bg;
    ctx.fillRect(0, 0, W, H);
    // a soft vignette, like old paper
    const g = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.75);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(90,60,20,0.25)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    return;
  }
  const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.75);
  g.addColorStop(0, "#1b2340");
  g.addColorStop(1, "#070a14");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  for (const s of stars) {
    ctx.globalAlpha = s.a;
    ctx.fillStyle = "#fff";
    ctx.fillRect(s.x * W, s.y * H, s.s * dpr, s.s * dpr);
  }
  ctx.globalAlpha = 1;
  // the Sun at the center
  const v = view();
  const sr = Math.max(3 * dpr, Math.min(40 * dpr, 0.01 * v.S));
  const sg = ctx.createRadialGradient(v.cx, v.cy, 0, v.cx, v.cy, sr * 3);
  sg.addColorStop(0, "rgba(255,240,180,1)");
  sg.addColorStop(0.3, "rgba(255,200,80,0.6)");
  sg.addColorStop(1, "rgba(255,160,40,0)");
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.arc(v.cx, v.cy, sr * 3, 0, Math.PI * 2);
  ctx.fill();
};

const ringPoints = (rad, v, n = 96) => {
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const t = (k / n) * Math.PI * 2;
    const p = rot([Math.cos(t) * rad, 0, Math.sin(t) * rad]);
    pts.push([v.cx + p[0] * v.S, v.cy - p[1] * v.S, p[2]]);
  }
  return pts;
};

// draws the half of the orbit ring that is behind (front=false) or in front
const drawRing = (L, v, front, P, alpha) => {
  const pts = ringPoints(L.mean, v);
  ctx.save();
  ctx.globalAlpha = alpha * (front ? 0.95 : 0.45);
  ctx.strokeStyle = P.ink || L.color;
  ctx.lineWidth = (front ? 1.8 : 1.1) * dpr;
  if (!front) ctx.setLineDash([4 * dpr, 4 * dpr]);
  ctx.beginPath();
  let pen = false;
  for (const [x, y, z] of pts) {
    if (z >= 0 === front) {
      if (!pen) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      pen = true;
    } else pen = false;
  }
  ctx.stroke();
  ctx.restore();
};

const planetPos = (L, v) => {
  const period = Math.pow(L.a, 1.5); // Kepler's third law, in years
  const t = (time / period) * Math.PI * 2 + L.a * 2.1;
  const p = rot([Math.cos(t) * L.mean, 0, Math.sin(t) * L.mean]);
  return [v.cx + p[0] * v.S, v.cy - p[1] * v.S, p[2]];
};

const drawPlanet = (L, v, P, alpha) => {
  const [x, y] = planetPos(L, v);
  const rad = Math.max(3.5 * dpr, Math.min(11 * dpr, L.mean * v.S * 0.045));
  ctx.save();
  ctx.globalAlpha = alpha;
  if (P.ink) {
    ctx.fillStyle = P.bg;
    ctx.strokeStyle = P.ink;
    ctx.lineWidth = 1.4 * dpr;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    const g = ctx.createRadialGradient(x - rad * 0.4, y - rad * 0.4, rad * 0.1, x, y, rad);
    g.addColorStop(0, "#fff");
    g.addColorStop(0.35, L.color);
    g.addColorStop(1, "rgba(0,0,0,0.6)");
    ctx.fillStyle = g;
    ctx.shadowColor = L.color;
    ctx.shadowBlur = 10 * dpr;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

const drawSphere = (L, v, P, alpha, isFocus) => {
  const rs = L.r * v.S;
  const ri = L.rIn * v.S;
  ctx.save();
  ctx.globalAlpha = alpha;
  // body of the sphere (or the shell between its two radii)
  const g = ctx.createRadialGradient(v.cx - rs * 0.3, v.cy - rs * 0.35, rs * 0.05, v.cx, v.cy, rs);
  g.addColorStop(0, P.ink ? "rgba(59,42,26,0.02)" : "rgba(220,230,255,0.07)");
  g.addColorStop(0.85, P.sphereFill);
  g.addColorStop(1, P.ink ? "rgba(59,42,26,0.08)" : "rgba(170,195,255,0.13)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(v.cx, v.cy, rs, 0, Math.PI * 2);
  if (ri < rs - 0.5) ctx.arc(v.cx, v.cy, ri, 0, Math.PI * 2, true);
  ctx.fill("evenodd");
  ctx.strokeStyle = P.ink ? P.sphere : L.color;
  ctx.globalAlpha = alpha * (isFocus ? 0.9 : 0.6);
  ctx.lineWidth = (isFocus ? 2 : 1.3) * dpr;
  ctx.beginPath();
  ctx.arc(v.cx, v.cy, rs, 0, Math.PI * 2);
  ctx.stroke();
  if (ri < rs - 0.5) {
    ctx.setLineDash([3 * dpr, 3 * dpr]);
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.arc(v.cx, v.cy, ri, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
};

const drawLabel = (L, v, P, alpha) => {
  const rs = L.r * v.S;
  if (rs < 18 * dpr || rs > Math.max(W, H) * 0.75) return;
  const a = -Math.PI / 4;
  const x = v.cx + Math.cos(a) * rs;
  const y = v.cy + Math.sin(a) * rs;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha * 1.2);
  ctx.font = `${13 * dpr}px Overpass, sans-serif`;
  ctx.fillStyle = P.ink || L.color;
  ctx.textBaseline = "bottom";
  ctx.fillText(`${L.sym} ${L.name}`, x + 6 * dpr, y - 2 * dpr);
  ctx.restore();
};

const drawSolid = (L, v, front, P, alpha) => {
  const s = L.solid;
  const pts = s.verts.map((q) => {
    const p = rot([q[0] * L.r, q[1] * L.r, q[2] * L.r]);
    return [v.cx + p[0] * v.S, v.cy - p[1] * v.S, p[2]];
  });
  const col = P.ink || L.color;
  ctx.save();
  ctx.lineJoin = "round";
  for (const f of s.faces) {
    const nz = rot(f.n)[2];
    if (nz >= 0 !== front) continue;
    ctx.beginPath();
    f.ids.forEach((id, k) => (k ? ctx.lineTo(pts[id][0], pts[id][1]) : ctx.moveTo(pts[id][0], pts[id][1])));
    ctx.closePath();
    // a little shading: faces turned to the light are brighter
    const lit = Math.max(0, v3.dot(rot(f.n), v3.unit([-0.4, 0.6, 0.7])));
    ctx.globalAlpha = alpha * (front ? 0.07 + 0.14 * lit : 0.05) * (P.ink ? 0.45 : 1);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.globalAlpha = alpha * (front ? 0.95 : 0.35);
    ctx.strokeStyle = col;
    ctx.lineWidth = (front ? 1.8 : 1) * dpr;
    ctx.setLineDash(front ? [] : [5 * dpr, 4 * dpr]);
    ctx.stroke();
  }
  ctx.restore();
};

const draw = () => {
  const P = palette();
  const v = view();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  drawBackground(P);
  const focusR = layers[focus].r;
  const shown = layers.map((L, i) => ({ L, i, a: opts.hidden.includes(L.key) ? 0 : layerAlpha(L.r, v.R) }));
  const cut = (L) => opts.cutaway && L.r > focusR * 1.0001;
  // back halves, outside in
  for (const { L, a } of shown) {
    if (!a) continue;
    if (L.kind === "planet") {
      if (opts.orbits) {
        drawRing(L, v, false, P, a);
        if (planetPos(L, v)[2] < 0) drawPlanet(L, v, P, a);
      }
    } else drawSolid(L, v, false, P, a);
  }
  // front halves, inside out
  for (const { L, i, a } of [...shown].reverse()) {
    if (!a) continue;
    if (L.kind === "planet") {
      if (!cut(L)) drawSphere(L, v, P, a, i === focus);
      if (opts.orbits) {
        drawRing(L, v, true, P, a);
        if (planetPos(L, v)[2] >= 0) drawPlanet(L, v, P, a);
      }
      drawLabel(L, v, P, a);
    } else if (!cut(L)) drawSolid(L, v, true, P, a);
  }
  if (P.ink) {
    ctx.fillStyle = P.ink;
    ctx.globalAlpha = 0.75;
    ctx.font = `italic ${12 * dpr}px Georgia, serif`;
    ctx.fillText("Mysterium Cosmographicum, 1596", 14 * dpr, H - 14 * dpr);
    ctx.globalAlpha = 1;
  }
};

// ------------------------------------------------------------------ loop

const tick = (t) => {
  const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0;
  lastT = t;
  if (opts.spin && !drag) yaw += dt * 0.18;
  if (opts.orbits) time += dt * 0.35; // a year every three seconds
  const target = Math.log(layers[focus].r);
  zoomLog += (target - zoomLog) * Math.min(1, dt * 3.2);
  draw();
  requestAnimationFrame(tick);
};

const resize = () => {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = cv.clientWidth;
  W = cv.width = Math.round(w * dpr);
  H = cv.height = Math.round(w * dpr);
};

// ------------------------------------------------------------------ UI

const fmt = (x, d = 3) => x.toFixed(d);
const pct = (x) => (x > 0 ? "+" : "") + (x * 100).toFixed(1) + "%";

const renderLayers = () => {
  $("layers").innerHTML = layers
    .map((L, i) => {
      const on = !opts.hidden.includes(L.key);
      const label = L.kind === "planet" ? `${L.sym} ${L.name}` : L.name;
      const sub = L.kind === "planet" ? "sphere" : L.element.toLowerCase();
      return `<li class="${L.kind} ${i === focus ? "focus" : ""}" style="--c:${L.color}">
        <label class="vis" title="Show or hide"><input type="checkbox" data-k="${L.key}" ${on ? "checked" : ""} /><span class="sr-only">Show ${label}</span></label>
        <button type="button" class="go" data-i="${i}" aria-pressed="${i === focus}">
          <span class="sw"></span><span class="nm">${label}</span><span class="sub">${sub}</span>
        </button>
      </li>`;
    })
    .join("");
};

const renderTable = () => {
  // per solid: the ratio of the inner sphere to the outer one
  const rows = layers
    .map((L, i) => {
      if (L.kind !== "solid") return "";
      const out = PLANETS[ORDER[i - 1]];
      const inn = PLANETS[ORDER[i + 1]];
      const real =
        opts.shells === "thick"
          ? (inn.a * (1 + inn.e)) / (out.a * (1 - out.e)) // inner's farthest / outer's nearest
          : inn.a / out.a;
      const err = L.ratio / real - 1;
      const cls = Math.abs(err) < 0.05 ? "good" : Math.abs(err) < 0.12 ? "fair" : "poor";
      return `<tr style="--c:${L.color}">
        <td><span class="sw"></span>${L.name}</td>
        <td>${out.name} &rsaquo; ${inn.name}</td>
        <td class="num">${fmt(L.ratio)}</td>
        <td class="num">${fmt(real)}</td>
        <td class="num ${cls}">${pct(err)}</td>
      </tr>`;
    })
    .join("");
  $("ratio-rows").innerHTML = rows;
  $("ratio-head-real").textContent = opts.shells === "thick" ? "Real (shells)" : "Real (mean)";
  // per planet: distance from the Sun, scaled so the Earth is at 1
  const earth = layers.find((L) => L.key === "earth").mean;
  $("dist-rows").innerHTML = layers
    .filter((L) => L.kind === "planet")
    .map((L) => {
      const pred = L.mean / earth;
      const err = pred / L.a - 1;
      const cls = Math.abs(err) < 0.05 ? "good" : Math.abs(err) < 0.12 ? "fair" : "poor";
      return `<tr style="--c:${L.color}">
        <td><span class="sw round"></span>${L.sym} ${L.name}</td>
        <td class="num">${fmt(pred, 2)}</td>
        <td class="num">${fmt(L.a, 2)}</td>
        <td class="num ${cls}">${pct(err)}</td>
      </tr>`;
    })
    .join("");
};

const renderInfo = () => {
  const L = layers[focus];
  let html;
  if (L.kind === "planet") {
    const inner = layers[focus + 1];
    const outer = layers[focus - 1];
    html = `<div class="info-name" style="--c:${L.color}">${L.sym} ${L.name}</div>
      <p>${
        outer ? `Held inside the ${outer.name.toLowerCase()}` : "The outermost sphere, holding the whole cup"
      }${inner ? `, and holding the ${inner.name.toLowerCase()}` : ", and holding only the Sun"}.
      Real mean distance from the Sun: ${L.a} AU, orbit eccentricity ${L.e}.
      ${opts.shells === "thick" ? "The shell is as thick as the planet's swing between its nearest and farthest points." : ""}</p>`;
  } else {
    const out = layers[focus - 1];
    const inn = layers[focus + 1];
    html = `<div class="info-name" style="--c:${L.color}">${L.name}</div>
      <p>Its ${L.solid.verts.length} corners touch ${out.name}'s sphere, and ${
        L.key === "octahedron" && opts.mercury === "edges" ? "its edges touch" : "its " + L.solid.faces.length + " faces touch"
      } ${inn.name}'s. ${L.key === "octahedron" && opts.mercury === "edges" ? "Edges" : "Faces"} sit at ${fmt(
        L.ratio,
      )} of the corners' distance from the center. Plato's element: ${L.element.toLowerCase()}.</p>`;
  }
  $("info").innerHTML = html;
};

const chips = (id, obj, key) => {
  $(id).innerHTML = Object.entries(obj)
    .map(([k, label]) => `<button type="button" data-k="${k}" aria-pressed="${String(opts[key]) === k}">${label}</button>`)
    .join("");
};

const renderControls = () => {
  chips("shell-chips", { thin: "Thin spheres", thick: "Thick shells" }, "shells");
  chips("mercury-chips", { faces: "Inside the faces", edges: "Touching the edges" }, "mercury");
  chips("style-chips", { color: "Color", engraving: "Engraving" }, "style");
  $("opt-orbits").checked = opts.orbits;
  $("opt-spin").checked = opts.spin;
  $("opt-cutaway").checked = opts.cutaway;
};

const renderAll = () => {
  renderLayers();
  renderTable();
  renderInfo();
  renderControls();
};

const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(opts));
  } catch {
    // storage unavailable
  }
};
const restore = () => {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!s) return;
    if (["thin", "thick"].includes(s.shells)) opts.shells = s.shells;
    if (["faces", "edges"].includes(s.mercury)) opts.mercury = s.mercury;
    if (["color", "engraving"].includes(s.style)) opts.style = s.style;
    for (const k of ["orbits", "spin", "cutaway"]) if (typeof s[k] === "boolean") opts[k] = s[k];
    if (Array.isArray(s.hidden)) opts.hidden = s.hidden.filter((k) => ORDER.includes(k));
  } catch {
    // ignore corrupt saved data
  }
};

const setFocus = (i) => {
  focus = Math.max(0, Math.min(layers.length - 1, i));
  renderLayers();
  renderInfo();
};

const savePng = () => {
  cv.toBlob((b) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = "keplers-cosmic-cup.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
};

const bind = () => {
  $("layers").addEventListener("click", (e) => {
    const b = e.target.closest("button.go");
    if (b) setFocus(+b.dataset.i);
  });
  $("layers").addEventListener("change", (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    opts.hidden = e.target.checked ? opts.hidden.filter((x) => x !== k) : [...opts.hidden, k];
    save();
  });
  const onChip = (id, key, after) =>
    $(id).addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      opts[key] = b.dataset.k;
      save();
      if (after) after();
      renderAll();
    });
  onChip("shell-chips", "shells", buildLayers);
  onChip("mercury-chips", "mercury", buildLayers);
  onChip("style-chips", "style");
  for (const k of ["orbits", "spin", "cutaway"]) {
    $("opt-" + k).addEventListener("change", (e) => {
      opts[k] = e.target.checked;
      save();
    });
  }
  $("zoom-in").addEventListener("click", () => setFocus(focus + 1));
  $("zoom-out").addEventListener("click", () => setFocus(focus - 1));
  $("save-png").addEventListener("click", savePng);

  cv.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY, yaw, pitch };
    try {
      cv.setPointerCapture(e.pointerId);
    } catch {
      // synthetic pointer
    }
  });
  cv.addEventListener("pointermove", (e) => {
    if (!drag) return;
    yaw = drag.yaw + (e.clientX - drag.x) * 0.008;
    pitch = Math.max(-1.45, Math.min(1.45, drag.pitch + (e.clientY - drag.y) * 0.008));
  });
  const end = () => (drag = null);
  cv.addEventListener("pointerup", end);
  cv.addEventListener("pointercancel", end);
  cv.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      setFocus(focus + (e.deltaY > 0 ? 1 : -1));
    },
    { passive: false },
  );
  cv.addEventListener("keydown", (e) => {
    const k = { ArrowLeft: [-0.15, 0], ArrowRight: [0.15, 0], ArrowUp: [0, -0.15], ArrowDown: [0, 0.15] }[e.key];
    if (k) {
      yaw += k[0];
      pitch = Math.max(-1.45, Math.min(1.45, pitch + k[1]));
      e.preventDefault();
    } else if (e.key === "+" || e.key === "=") setFocus(focus + 1);
    else if (e.key === "-") setFocus(focus - 1);
  });
  window.addEventListener("resize", resize);
};

const initCup = () => {
  cv = $("cup");
  ctx = cv.getContext("2d");
  for (let i = 0; i < 160; i++) stars.push({ x: Math.random(), y: Math.random(), s: Math.random() < 0.15 ? 2 : 1, a: 0.2 + Math.random() * 0.6 });
  restore();
  buildLayers();
  zoomLog = Math.log(layers[0].r);
  resize();
  renderAll();
  bind();
  requestAnimationFrame(tick);
};
