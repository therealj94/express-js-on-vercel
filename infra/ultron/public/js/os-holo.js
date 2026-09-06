/* EL BUSTO HOLOGRÁFICO DE ULTRON.
 *
 * Viene del diseño que mandó José (ULTRON OS) y se acopló al ULTRON de verdad.
 * Lo que cambió respecto del original está marcado con «ACOPLE»; lo demás es
 * el motor tal cual, que ya estaba bien.
 *
 * ACOPLE · THREE.JS VA DENTRO DE LA CASA. El diseño lo pedía a unpkg con un
 * importmap. La política de contenido de ULTRON solo admite guiones propios
 * (`scriptSrc: 'self'`), así que el navegador lo habría bloqueado y la
 * pantalla se habría quedado con el cartel de «cargando núcleo» para siempre.
 * Va servido desde /vendor, con su versión clavada.
 */
import * as THREE from '../vendor/three.module.min.js';

const CYAN = 0x05e1ff, CRIMSON = 0x8b1e2d, GREEN = 0x5cf2b0;
const hash = (x, y, z) => { const s = Math.sin(Math.round(x * 1e4) * 12.9898 + Math.round(y * 1e4) * 78.233 + Math.round(z * 1e4) * 37.719) * 43758.5453; return s - Math.floor(s); };
const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const bump = (d, r) => d >= r ? 0 : (1 - sm(0, 1, d / r));
const lerp = (a, b, t) => a + (b - a) * t;

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.25, 'rgba(255,255,255,.55)'); r.addColorStop(.6, 'rgba(255,255,255,.12)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function sprite(tex, color, scale, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(scale); return s;
}

/* ---------- anatomy: unit-sphere sculpt (y up, z forward) ---------- */
const MOUTH_Y = -0.46;
function sculpt(px, py, pz) {
  let x = px * 0.74, y = py * 1.0, z = pz * 0.84;
  if (z < 0) { z *= 1.12; if (y > 0.1) y *= 1.03; }                                    // occiput
  if (y > 0.5) { const t = (y - 0.5) / 0.5; x *= 1 - 0.14 * t; z *= 1 - 0.05 * t; }     // crown
  if (Math.abs(x) > 0.45 && y > 0.05) { const t = sm(0.45, 0.7, Math.abs(x)); x *= 1 - 0.08 * t; z -= 0.04 * t * sm(0.05, 0.4, y); } // temples flatten
  if (y < -0.05) { const t = Math.min(1, (-0.05 - y) / 0.95); x *= 1 - 0.56 * Math.pow(t, 1.35); z *= z > 0 ? 1 - 0.12 * t : 1 - 0.65 * t; if (z > 0) z += 0.05 * t * t; } // jaw taper
  if (z > 0.15) {
    const fh = sm(0.3, 0.8, y); z -= 0.06 * fh; z += 0.05 * fh * bump(Math.abs(x), 0.35) * (1 - fh);   // forehead: flatter with central boss
    z += 0.075 * bump(Math.abs(y - 0.3), 0.12) * (1 - 0.7 * sm(0.5, 0.7, Math.abs(x)));               // brow ridge
    z -= 0.03 * bump(Math.abs(x), 0.07) * bump(Math.abs(y - 0.28), 0.1);                              // glabella notch
    for (const s of [-1, 1]) {
      const d = Math.hypot((x - s * 0.3) * 1.0, (y - 0.15) * 1.6); z -= 0.2 * bump(d, 0.31);           // eye sockets
      const dc = Math.hypot((x - s * 0.5) * 0.9, (y + 0.05) * 1.1); z += 0.1 * bump(dc, 0.3); x += s * 0.05 * bump(dc, 0.3); // cheekbones
      const dh = Math.hypot((x - s * 0.4) * 0.9, y + 0.36); z -= 0.06 * bump(dh, 0.26);                // cheek hollow
      const dj = Math.hypot(x - s * 0.36, y + 0.62); z += 0.03 * bump(dj, 0.2); x += s * 0.04 * bump(dj, 0.22); // jaw corner
      const nl = Math.hypot((x - s * 0.16) * 1.4, y - (MOUTH_Y + 0.14)); z -= 0.02 * bump(nl, 0.12);   // nasolabial
    }
    const nb = bump(Math.abs(x), 0.1) * sm(-0.22, 0.05, y) * sm(0.3, 0.0, y); z += 0.15 * nb;           // nose bridge
    z += 0.13 * bump(Math.hypot(x * 1.05, y + 0.16), 0.15);                                           // nose tip
    z += 0.06 * bump(Math.hypot(Math.abs(x) - 0.14, (y + 0.2) * 1.3), 0.1);                            // nostrils
    z -= 0.025 * bump(Math.hypot(Math.abs(x) - 0.07, y + 0.27), 0.05);                                 // nostril openings
    z += 0.05 * bump(Math.hypot(x * 0.75, y - (MOUTH_Y + 0.06)), 0.17) * (1 - 0.6 * bump(Math.abs(x), 0.045)); // upper lip + philtrum
    z += 0.06 * bump(Math.hypot(x * 0.85, y - (MOUTH_Y - 0.08)), 0.16);                                // lower lip
    z -= 0.045 * bump(Math.abs(y - MOUTH_Y), 0.03) * bump(Math.abs(x), 0.3);                           // lip line
    z -= 0.04 * bump(Math.hypot(x * 0.9, y - (MOUTH_Y - 0.19)), 0.12);                                 // mentolabial sulcus
    z += 0.14 * bump(Math.hypot(x * 0.85, y + 0.86), 0.3);                                             // chin
  }
  return [x, y, z];
}

function buildHead() {
  const SEG = 72, rows = [];
  const RINGS = 52;
  for (let i = 1; i < RINGS; i++) rows.push(Math.cos(Math.PI * i / RINGS));
  let k = 0, best = 9; rows.forEach((y, i) => { if (Math.abs(y - MOUTH_Y) < best) { best = Math.abs(y - MOUTH_Y); k = i; } }); rows[k] = MOUTH_Y;
  const verts = [], ring0 = [];
  const push = (x, y, z) => { const [a, b, c] = sculpt(x, y, z); const j = 0.004; verts.push(a + (hash(x, y, z) - .5) * j, b + (hash(y, z, x) - .5) * j, c + (hash(z, x, y) - .5) * j); return verts.length / 3 - 1; };
  const top = push(0, 1, 0), bot = push(0, -1, 0);
  const grid = rows.map(y => { const r = Math.sqrt(Math.max(0, 1 - y * y)); const ring = []; for (let s = 0; s < SEG; s++) { const a = s / SEG * Math.PI * 2; ring.push(push(Math.sin(a) * r, y, Math.cos(a) * r)); } return ring; });
  const skullIdx = [], jawIdx = [];
  const addTri = (a, b, c) => {
    const cy = (verts[a * 3 + 1] + verts[b * 3 + 1] + verts[c * 3 + 1]) / 3, cz = (verts[a * 3 + 2] + verts[b * 3 + 2] + verts[c * 3 + 2]) / 3;
    const ys = [verts[a * 3 + 1], verts[b * 3 + 1], verts[c * 3 + 1]];
    (Math.max(...ys) <= MOUTH_Y + 1e-4 && cz > -0.02 && cy > -0.95 ? jawIdx : skullIdx).push(a, b, c);
  };
  for (let s = 0; s < SEG; s++) { const n = (s + 1) % SEG; addTri(top, grid[0][s], grid[0][n]); addTri(bot, grid[grid.length - 1][n], grid[grid.length - 1][s]); }
  for (let i = 0; i < grid.length - 1; i++) for (let s = 0; s < SEG; s++) { const n = (s + 1) % SEG; const a = grid[i][s], b = grid[i][n], c = grid[i + 1][s], d = grid[i + 1][n]; addTri(a, c, b); addTri(b, c, d); }
  const pos = new Float32Array(verts);
  const make = idx => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; };
  const skull = make(skullIdx), jaw = make(jawIdx);
  // morph targets (relative): smile, browL, browR, frown, squint
  const morphs = geo => {
    const p = geo.attributes.position, n = p.count;
    const S = new Float32Array(n * 3), BL = new Float32Array(n * 3), BR = new Float32Array(n * 3), F = new Float32Array(n * 3), Q = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i); if (z < 0.15) continue;
      for (const s of [-1, 1]) {
        const dc = Math.hypot(x - s * 0.33, y - MOUTH_Y); const f = bump(dc, 0.34);
        S[i * 3] += s * 0.05 * f; S[i * 3 + 1] += 0.09 * f; S[i * 3 + 2] -= 0.06 * f;
        const ch = bump(Math.hypot(x - s * 0.5, y + 0.05), 0.3); S[i * 3 + 1] += 0.035 * ch; S[i * 3 + 2] += 0.02 * ch;
        const b = bump(Math.hypot((x - s * 0.33) * 0.9, (y - 0.34) * 1.6), 0.36); const B = s < 0 ? BL : BR; B[i * 3 + 1] += 0.07 * b; B[i * 3 + 2] += 0.02 * b;
        F[i * 3] -= s * 0.035 * b; F[i * 3 + 1] -= 0.05 * b; F[i * 3 + 2] += 0.03 * b;
        const q = bump(Math.hypot((x - s * 0.33) * 0.9, (y - 0.02) * 1.8), 0.3); Q[i * 3 + 1] += 0.045 * q; Q[i * 3 + 2] -= 0.01 * q;
      }
    }
    geo.morphAttributes.position = [S, BL, BR, F, Q].map(a => new THREE.BufferAttribute(a, 3)); geo.morphTargetsRelative = true;
  };
  morphs(skull); morphs(jaw);
  const surfaceAt = (tx, ty) => { const p = skull.attributes.position; let bz = -1; for (let i = 0; i < p.count; i++) { if (Math.abs(p.getX(i) - tx) < 0.07 && Math.abs(p.getY(i) - ty) < 0.07 && p.getZ(i) > bz) bz = p.getZ(i); } return bz; };
  return { skull, jaw, surfaceAt };
}
function jitter(geo, amt) {
  const g = geo.toNonIndexed(); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); p.setXYZ(i, x + (hash(x, y, z) - .5) * amt, y + (hash(y, z, x) - .5) * amt, z + (hash(z, x, y) - .5) * amt); }
  g.computeVertexNormals(); return g;
}
function envScene() {
  const s = new THREE.Scene(); s.background = new THREE.Color(0x03060a);
  const add = (w, h, d, color, intensity, pos, rot) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity) })); m.position.set(...pos); if (rot) m.rotation.set(...rot); s.add(m); };
  add(6, .4, .1, 0xdff6ff, 12, [0, 5, -2]); add(10, 1.2, .1, 0xffffff, 2, [0, 6, 2], [Math.PI / 2, 0, 0]);
  add(.6, 8, .1, 0xeaf7ff, 4, [5, 0, 4], [0, -Math.PI * .7, 0]); add(4, 2.5, .1, 0xbfe9f5, 2.5, [0, 3, 6], [0, Math.PI, 0]);
  add(1.5, 5, .1, 0xffffff, 3, [-4, 1, 5], [0, Math.PI * .8, 0]); add(.3, 6, .1, 0x05e1ff, 3, [-6, 0, 1], [0, .6, 0]); add(.3, 6, .1, 0x05e1ff, 2, [6, 0, 1], [0, -.6, 0]);
  add(8, .25, .1, 0x8b1e2d, 2.2, [0, -3, 5], [0, Math.PI, 0]); add(20, .1, 20, 0x0a1b2a, .8, [0, -6, 0]); add(20, .1, 20, 0x0a141c, .5, [0, 8, 0]);
  return s;
}

/* ---------- viseme envelope from text ---------- */
const VIS = { a: [.95, .2], á: [.95, .2], e: [.6, .6], é: [.6, .6], i: [.35, .95], í: [.35, .95], o: [.8, 0], ó: [.8, 0], u: [.5, 0], ú: [.5, 0], m: [0, .1], b: [0, .1], p: [0, .1], f: [.15, .4], v: [.15, .4], s: [.2, .6], l: [.3, .4], r: [.3, .3], n: [.2, .3], d: [.25, .3], t: [.25, .3] };
function viseme(text, pos) {
  if (!text) return [0, 0];
  const i = Math.floor(pos), f = pos - i, c0 = (text[i] || ' ').toLowerCase(), c1 = (text[i + 1] || ' ').toLowerCase();
  const v = c => VIS[c] || (/[a-záéíóúñ]/.test(c) ? [.22, .3] : [0.03, 0]);
  const a = v(c0), b = v(c1); return [lerp(a[0], b[0], f), lerp(a[1], b[1], f)];
}

export function mount(canvas, get, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.35; renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(30, 1, .1, 100);
  const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(envScene(), 0.04).texture;
  const tex = glowTexture();
  const chrome = new THREE.MeshPhysicalMaterial({ color: 0xc4ceD8, metalness: 1, roughness: 0.2, envMapIntensity: 1.6, clearcoat: 0.6, clearcoatRoughness: 0.12 });
  const chromeFacet = new THREE.MeshPhysicalMaterial({ color: 0xc4ced8, metalness: 1, roughness: 0.16, flatShading: true, envMapIntensity: 1.8, clearcoat: 0.6, clearcoatRoughness: 0.1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x151b22, metalness: .95, roughness: .32 });
  const cyanBasic = () => new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });

  const bust = new THREE.Group(); scene.add(bust);
  const useImage = !!opts.bustImage;
  const head = new THREE.Group(); head.position.y = 1.0; head.scale.setScalar(1.12); bust.add(head);
  const eyeGlows = [], eyeBalls = [], lids = [], brows = []; let skullM, jawM, jawPivot, mouthGlow, voiceBar, seamsS, seamsJ, procParts = [];

  if (useImage) {
    const texB = new THREE.TextureLoader().load(opts.bustImage); texB.colorSpace = THREE.SRGBColorSpace; texB.anisotropy = 8;
    const ar = 300 / 390, H = 5.0, W = H * ar;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: texB, transparent: true, depthWrite: false, toneMapped: false })); plane.position.set(0, -0.15, 0); bust.add(plane);
    const ghostMat = new THREE.MeshBasicMaterial({ map: texB, transparent: true, opacity: .22, color: CYAN, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const ghost = new THREE.Mesh(plane.geometry, ghostMat); ghost.position.set(0.05, -0.15, -0.25); ghost.scale.setScalar(1.03); bust.add(ghost);
    const ghost2 = new THREE.Mesh(plane.geometry, ghostMat.clone()); ghost2.material.opacity = .12; ghost2.position.set(-0.06, -0.15, -0.5); ghost2.scale.setScalar(1.06); bust.add(ghost2);
    [[0.31, 0.325], [0.53, 0.325]].forEach(([u, v]) => { const gl = sprite(tex, CYAN, 0.5, .9); gl.position.set((u - .5) * W, (0.5 - v) * H - 0.15, 0.1); bust.add(gl); eyeGlows.push(gl); });
    procParts = [plane, ghost, ghost2];
  } else {
    const { skull, jaw, surfaceAt } = buildHead();
    skullM = new THREE.Mesh(skull, chrome); head.add(skullM);
    seamsS = new THREE.LineSegments(new THREE.EdgesGeometry(skull, 14), new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: .18, blending: THREE.AdditiveBlending, depthWrite: false })); seamsS.scale.setScalar(1.003); head.add(seamsS);
    jawPivot = new THREE.Group(); jawPivot.position.set(0, -0.12, -0.12); head.add(jawPivot);
    jawM = new THREE.Mesh(jaw, chrome); jawM.position.set(0, 0.12, 0.12); jawPivot.add(jawM);
    seamsJ = new THREE.LineSegments(new THREE.EdgesGeometry(jaw, 14), seamsS.material); seamsJ.position.copy(jawM.position); seamsJ.scale.setScalar(1.003); jawPivot.add(seamsJ);
    // mouth cavity + voice bar
    const cav = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), new THREE.MeshBasicMaterial({ color: 0x020408 })); cav.scale.set(0.2, 0.06, 0.16); cav.position.set(0, MOUTH_Y - 0.02, surfaceAt(0, MOUTH_Y) - 0.12); head.add(cav);
    voiceBar = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.02), cyanBasic()); voiceBar.position.set(0, MOUTH_Y - 0.02, surfaceAt(0, MOUTH_Y) - 0.04); head.add(voiceBar);
    mouthGlow = sprite(tex, CYAN, 0.5, 0); mouthGlow.position.copy(voiceBar.position); mouthGlow.position.z += 0.1; head.add(mouthGlow);
    // eyes
    const irisMat = new THREE.MeshBasicMaterial({ color: 0xbff8ff });
    for (const s of [-1, 1]) {
      const cz = surfaceAt(s * 0.32, 0.17) - 0.1;
      const eye = new THREE.Group(); eye.position.set(s * 0.32, 0.17, cz); head.add(eye);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.115, 24, 16), new THREE.MeshStandardMaterial({ color: 0x0a0e14, metalness: .7, roughness: .15 })); eye.add(ball);
      const iris = new THREE.Mesh(new THREE.CircleGeometry(0.06, 24), irisMat); iris.position.z = 0.108; eye.add(iris);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.026, 0.04, 24), new THREE.MeshBasicMaterial({ color: 0x03141c })); ring.position.z = 0.112; eye.add(ring);
      const gl = sprite(tex, CYAN, 0.5, 1); gl.position.z = 0.18; eye.add(gl); eyeGlows.push(gl);
      const pl = new THREE.PointLight(CYAN, 2.5, 2.5, 2); pl.position.z = 0.4; eye.add(pl);
      eyeBalls.push(eye);
      const lidG = new THREE.Group(); lidG.position.copy(eye.position); head.add(lidG);
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.135, 24, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), chrome); lidG.add(lid); lids.push(lidG);
      const lower = new THREE.Mesh(new THREE.SphereGeometry(0.133, 24, 4, 0, Math.PI * 2, Math.PI * 0.6, Math.PI * 0.14), chrome); lower.rotation.x = -0.35; head.add(lower); lower.position.copy(eye.position);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.035, 0.05), chromeFacet); brow.position.set(s * 0.33, 0.36, surfaceAt(s * 0.33, 0.36) - 0.01); brow.rotation.z = -s * 0.1; brow.rotation.x = 0.5; head.add(brow); brows.push(brow);
      const ear = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 0.16), chromeFacet); ear.position.set(s * 0.79, 0.02, -0.08); ear.rotation.y = s * 0.15; head.add(ear);
    }
    const neck = new THREE.Mesh(jitter(new THREE.CylinderGeometry(0.34, 0.46, 0.7, 10, 2), 0.03), chromeFacet); neck.position.y = -0.3; bust.add(neck);
    const traps = new THREE.Mesh(jitter(new THREE.CylinderGeometry(0.5, 1.5, 0.5, 12, 1), 0.04), chromeFacet); traps.scale.set(1.25, 1, 0.7); traps.position.y = -0.85; bust.add(traps);
    const shoulders = new THREE.Mesh(jitter(new THREE.SphereGeometry(1, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2), 0.03), chromeFacet); shoulders.scale.set(1.7, 0.85, 0.9); shoulders.position.y = -1.6; bust.add(shoulders);
    const chest = new THREE.Mesh(jitter(new THREE.CylinderGeometry(1.45, 1.2, 0.5, 14, 1), 0.03), chromeFacet); chest.scale.set(1.1, 1, 0.65); chest.position.y = -1.85; bust.add(chest);
  }
  const core = sprite(tex, CRIMSON, 0.55, .8); core.position.set(0, -1.25, 0.78); bust.add(core);

  // pedestal / environment
  const ped = new THREE.Group(); ped.position.y = -2.35; scene.add(ped);
  ped.add(new THREE.Mesh(new THREE.CylinderGeometry(1.95, 2.25, 0.28, 64), dark));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.95, 0.02, 8, 96), new THREE.MeshBasicMaterial({ color: CYAN })); rim.rotation.x = Math.PI / 2; rim.position.y = 0.145; ped.add(rim);
  const rings = []; [0.45, 0.8, 1.15, 1.5].forEach(r => { const m = new THREE.Mesh(new THREE.RingGeometry(r - 0.035, r, 96), Object.assign(cyanBasic(), { side: THREE.DoubleSide })); m.material.opacity = .4; m.rotation.x = -Math.PI / 2; m.position.y = 0.15; ped.add(m); rings.push(m); });
  const padGlow = new THREE.Mesh(new THREE.CircleGeometry(1.9, 64), cyanBasic()); padGlow.material.opacity = .14; padGlow.rotation.x = -Math.PI / 2; padGlow.position.y = 0.151; ped.add(padGlow);
  const padLight = new THREE.PointLight(CYAN, 6, 6, 2); padLight.position.y = 0.6; ped.add(padLight);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(2.4, 9, 48, 1, true), Object.assign(cyanBasic(), { side: THREE.BackSide })); beam.material.opacity = .045; beam.position.y = 2.3; scene.add(beam);
  const beam2 = beam.clone(); beam2.material = beam.material.clone(); beam2.material.opacity = .03; beam2.material.side = THREE.FrontSide; beam2.scale.set(.55, 1, .55); scene.add(beam2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x0a0e13, metalness: .9, roughness: .28 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -2.5; scene.add(floor);
  const grid = new THREE.GridHelper(40, 40, 0x0f3340, 0x0a1f28); grid.position.y = -2.49; grid.material.transparent = true; grid.material.opacity = .5; scene.add(grid);
  scene.add(new THREE.HemisphereLight(0x2a4a5c, 0x05080c, .7));
  const key = new THREE.SpotLight(0xd8f4ff, 90, 20, .55, .7, 1.4); key.position.set(0, 8, 3.5); key.target = bust; scene.add(key);
  const rimL = new THREE.SpotLight(CYAN, 45, 20, .7, .8, 1.2); rimL.position.set(-4.5, 1.5, -3); rimL.target = bust; scene.add(rimL);
  const rimR = new THREE.SpotLight(0x3aa8c8, 25, 20, .7, .8, 1.2); rimR.position.set(4.5, 0.5, -3); rimR.target = bust; scene.add(rimR);
  const fill = new THREE.PointLight(CRIMSON, 8, 8, 1.6); fill.position.set(3.2, -0.5, 1.5); scene.add(fill);
  const front = new THREE.PointLight(0xcff4ff, 60, 14, 1.5); front.position.set(-0.8, 1.8, 5.2); scene.add(front);
  const front2 = new THREE.PointLight(0x9fdcff, 45, 14, 1.5); front2.position.set(2.4, 0.4, 4.2); scene.add(front2);
  const N = 500, pp = new Float32Array(N * 3), pv = [];
  const resetP = i => { const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 3.5; pp[i * 3] = Math.cos(a) * r; pp[i * 3 + 1] = -2 + Math.random() * 5; pp[i * 3 + 2] = Math.sin(a) * r; pv[i] = 0.002 + Math.random() * 0.004; };
  for (let i = 0; i < N; i++) resetP(i);
  const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  const pMat = new THREE.PointsMaterial({ color: CYAN, size: .035, transparent: true, opacity: .55, map: tex, blending: THREE.AdditiveBlending, depthWrite: false }); scene.add(new THREE.Points(pGeo, pMat));
  const scan = new THREE.Mesh(new THREE.PlaneGeometry(3.6, .015), Object.assign(cyanBasic(), { side: THREE.DoubleSide })); scan.material.opacity = 0; scene.add(scan);
  const scanGlow = new THREE.Mesh(new THREE.PlaneGeometry(3.6, .5), Object.assign(cyanBasic(), { side: THREE.DoubleSide })); scanGlow.material.opacity = 0; scan.add(scanGlow);

  /* ---------- rig state ---------- */
  const rig = { jaw: 0, width: 0, smile: 0, browL: 0, browR: 0, frown: 0, squint: 0, blink: 0, yaw: 0, pitch: 0, roll: 0, eyeX: 0, eyeY: 0 };
  const target = { ...rig };
  let blinkAt = 3, blinkV = 0, saccadeAt = 1, sacc = { x: 0, y: 0 }, microAt = 4, micro = 0;
  let dragYaw = 0, dragVel = 0, dragging = false, lastX = 0, spinT = 0;
  const cyan = new THREE.Color(CYAN), green = new THREE.Color(GREEN), crimson = new THREE.Color(CRIMSON), stateColor = new THREE.Color(CYAN);
  const mouse = { x: 0, y: 0 }; let t0 = performance.now(), raf;

  canvas.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; dragVel = 0; canvas.setPointerCapture?.(e.pointerId); });
  canvas.addEventListener('pointermove', e => { if (!dragging) return; const dx = e.clientX - lastX; lastX = e.clientX; dragVel = dx * 0.006; dragYaw += dragVel; });
  const up = () => { dragging = false; }; canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('dblclick', () => { spinT = 1; });

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    const band = 0.69, halfH = 2.35 / band; const fovR = THREE.MathUtils.degToRad(camera.fov) / 2;
    let dist = halfH / Math.tan(fovR); dist = Math.max(dist, 3.0 / (Math.tan(fovR) * camera.aspect)); if (opts.zoom) dist *= opts.zoom;
    const centerY = -0.2, bandCenter = (0.09 + 0.78) / 2, shift = (0.5 - bandCenter) * 2 * (dist * Math.tan(fovR));
    const xOff = opts.zoom ? 0 : (w < 1400 ? 0.10 : 0.06) * 2 * dist * Math.tan(fovR) * camera.aspect;
    /* ACOPLE · `mira` baja el punto al que apunta la cámara, con lo que la
       cabeza SUBE en el cuadro. En el teléfono el globo de la respuesta ocupa
       la mitad de abajo: sin esto la cara queda detrás del globo y arriba sobra
       media pantalla de fondo vacío. */
    const yc = opts.zoom ? (typeof opts.mira === 'number' ? opts.mira : 1.0) : centerY + shift;
    camera.position.set(xOff, yc + (opts.zoom ? 0 : 0.3), dist); camera.lookAt(xOff, yc, 0);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame); resize();
    const t = (now - t0) / 1000, dt = 1 / 60; const s = get() || {}; const st = s.state || 'idle', mood = s.mood || 'neutral';
    mouse.x += ((s.mouse?.x || 0) - mouse.x) * .06; mouse.y += ((s.mouse?.y || 0) - mouse.y) * .06;

    /* expression targets */
    Object.assign(target, { smile: 0, browL: 0, browR: 0, frown: 0, squint: 0, pitch: mouse.y * .12, roll: 0, yaw: 0, eyeX: mouse.x * 1.4, eyeY: -mouse.y * 0.9 });
    if (mood === 'smile') { target.smile = .9; target.browL = target.browR = .2; target.squint = .25; }
    if (mood === 'think' || st === 'think') { target.browL = .8; target.browR = .05; target.squint = .35; target.eyeX = .9; target.eyeY = .8; target.roll = .07; target.yaw = -.12; target.pitch = -.03; }
    if (mood === 'concern' || st === 'error') { target.frown = .85; target.squint = .3; target.pitch = .05; }
    if (st === 'listen') { target.browL = target.browR = .4; target.pitch = .08; target.roll = -.04; target.eyeX = 0; target.eyeY = -.1; }
    if (st === 'analyze') { target.squint = .5; target.eyeX = Math.sin(t * 2.2) * .9; target.eyeY = -.6; }
    if (st === 'update') { target.smile = .35; target.browL = target.browR = .3; }
    /* speech */
    let jawT = 0, widthT = 0;
    /* ── ACOPLE · LA BOCA LA MUEVE EL AUDIO, NO EL TEXTO ──────────────────
       El motor original estimaba la posición dentro de la frase por el tiempo
       transcurrido y sacaba de ahí el visema. Es una aproximación razonable
       cuando no hay más, y falla justo donde se nota: una pausa, una vocal
       larga, una frase que el sintetizador dijo más rápido de lo previsto — la
       boca se mueve con silencio y se queda quieta con voz.
       ULTRON tiene el audio de verdad: `BOCA` (js/os-boca.js) le saca la
       envolvente al MP3 en un contexto que nunca toca los altavoces, y `nivel`
       es esa energía, de 0 a 1, en el instante que se está oyendo. Con eso la
       mandíbula sigue lo que el oído escucha.
       El visema NO se tira: sigue dando la FORMA de los labios —ancho para la
       «i», redondo para la «o»— que la amplitud no sabe. Amplitud manda la
       apertura; texto, la forma. */
    if (st === 'speak' && typeof s.nivel === 'number' && s.nivel >= 0 && s.speech) {
      const sp = s.speech; const cps = sp.text.length / Math.max(0.5, sp.dur / 1000);
      const pos = Math.min(sp.text.length - 1, (sp.charIndex || 0) + ((performance.now() - (sp.boundaryT || sp.t0)) / 1000) * cps);
      const [, w] = viseme(sp.text, pos);
      jawT = Math.min(1, s.nivel * 1.05); widthT = w;
      target.browL += .12 + Math.sin(t * 1.7) * .08; target.browR += .1; target.pitch += Math.sin(t * 3.1) * .015; target.yaw += Math.sin(t * 1.3) * .03;
    } else if (st === 'speak' && typeof s.nivel === 'number' && !s.speech) {
      // Hablando sin texto a la vista (una frase que ya se soltó): solo amplitud.
      jawT = Math.min(1, s.nivel * 1.05); widthT = .35;
      target.browL += .1; target.pitch += Math.sin(t * 3.1) * .015;
    } else if (st === 'speak' && s.speech) { const sp = s.speech; const cps = sp.text.length / Math.max(0.5, sp.dur / 1000); const pos = Math.min(sp.text.length - 1, (sp.charIndex || 0) + ((performance.now() - (sp.boundaryT || sp.t0)) / 1000) * cps); const [o, w] = viseme(sp.text, pos); jawT = o * .85; widthT = w; target.browL += .12 + Math.sin(t * 1.7) * .08; target.browR += .1; target.pitch += Math.sin(t * 3.1) * .015; target.yaw += Math.sin(t * 1.3) * .03; }
    /* idle life */
    if (t > microAt) { micro = (Math.random() - .3) * .4; microAt = t + 3 + Math.random() * 5; } micro *= .985; target.browL += Math.max(0, micro) * .6; target.browR += Math.max(0, micro) * .5;
    if (t > saccadeAt) { sacc = { x: (Math.random() - .5) * .8, y: (Math.random() - .5) * .4 }; saccadeAt = t + 0.8 + Math.random() * 2.5; }
    if (mood !== 'think' && st !== 'analyze') { target.eyeX += sacc.x * (st === 'listen' ? .3 : 1); target.eyeY += sacc.y; }
    if (t > blinkAt) { blinkV = 1; blinkAt = t + (st === 'think' ? 1.5 : 2.5) + Math.random() * 4; }
    blinkV = Math.max(0, blinkV - dt * 7); target.blink = Math.min(1, blinkV * 1.4) + (st === 'think' ? .15 : 0) + (st === 'error' ? .1 : 0);
    /* interpolate */
    for (const k in rig) { const sp = k === 'blink' ? .5 : (k === 'eyeX' || k === 'eyeY') ? .2 : .08; rig[k] = lerp(rig[k], target[k], sp); }
    rig.jaw = lerp(rig.jaw, jawT, .45); rig.width = lerp(rig.width, widthT, .3);

    /* body motion */
    if (!dragging) { dragVel *= .92; dragYaw += dragVel; dragYaw = lerp(dragYaw, 0, .02); }
    if (spinT > 0) { spinT = Math.max(0, spinT - dt / 1.6); dragYaw = (1 - spinT) * Math.PI * 2 * (1 - Math.pow(spinT, 2)); if (spinT === 0) dragYaw = 0; }
    const auto = s.autoRotate ? t * .35 : 0;
    bust.rotation.y = Math.sin(t * .28) * .08 + mouse.x * .3 + rig.yaw + dragYaw + auto;
    bust.rotation.x = rig.pitch * .4; bust.rotation.z = rig.roll * .3;
    head.rotation.y = mouse.x * .2 + rig.yaw * .6 + Math.sin(t * .5 + 1) * .03; head.rotation.x = rig.pitch + Math.sin(t * .9) * .012; head.rotation.z = rig.roll;
    bust.position.y = Math.sin(t * 1.1) * .018; bust.scale.setScalar(1 + Math.sin(t * 1.1) * .004);

    if (!useImage) {
      const inf = [rig.smile + rig.width * .35, rig.browL, rig.browR, rig.frown, rig.squint];
      skullM.morphTargetInfluences = inf; jawM.morphTargetInfluences = inf;
      jawPivot.rotation.x = rig.jaw * .16 + rig.smile * .01;
      voiceBar.material.opacity = rig.jaw * 1.2; voiceBar.scale.set(1 + rig.width * .4, 1 + rig.jaw * 2, 1); mouthGlow.material.opacity = rig.jaw * .9; mouthGlow.scale.setScalar(.4 + rig.jaw * .5);
      const look = new THREE.Vector3(rig.eyeX * 2, 0.17 + rig.eyeY * 1.5, 8);
      eyeBalls.forEach(e => { e.lookAt(head.localToWorld(look.clone())); });
      lids.forEach(l => { l.rotation.x = -1.45 + rig.blink * 1.35 + rig.squint * .3; });
      brows.forEach((b, i) => { const s = i === 0 ? -1 : 1; const up = (s < 0 ? rig.browL : rig.browR) * .06 - rig.frown * .04; b.position.y = 0.36 + up; b.position.x = s * (0.33 - rig.frown * .03); b.rotation.z = -s * (0.1 + (s < 0 ? rig.browL : rig.browR) * .18 - rig.frown * .28); });
      seamsS.material.opacity = st === 'analyze' ? .4 : .22 + (st === 'think' ? .12 : 0);
    } else { procParts[1].position.x = 0.05 + mouse.x * .12; procParts[2].position.x = -0.06 - mouse.x * .2; procParts[1].material.opacity = .18 + (st === 'think' ? .15 : 0) + Math.sin(t * 2) * .04; }

    const eyeI = st === 'speak' ? 1.3 + rig.jaw * .5 : st === 'think' ? 1.1 + Math.sin(t * 3) * .3 : st === 'error' ? .7 : 1;
    eyeGlows.forEach(g => { g.scale.setScalar((useImage ? .5 : .62) * eyeI * (1 - rig.blink * .85)); g.material.color.copy(st === 'error' ? crimson : cyan); });
    const tc = st === 'update' ? green : st === 'error' ? crimson : cyan; stateColor.lerp(tc, .05);
    const rs = st === 'think' ? 1.6 : st === 'idle' ? .35 : .9;
    rings.forEach((r, i) => { r.rotation.z = t * rs * (i % 2 ? -1 : 1) * (.2 + i * .1); r.material.opacity = .28 + .22 * Math.sin(t * 2 - i * .9) + (st === 'listen' && i === 3 ? .3 : 0); r.material.color.copy(stateColor); });
    rim.material.color.copy(stateColor); padGlow.material.color.copy(stateColor); padLight.color.copy(stateColor); padLight.intensity = 5 + Math.sin(t * 2) * 1.2 + (st === 'listen' ? 3 : 0);
    beam.material.opacity = .04 + (st === 'update' ? .03 : 0) + Math.sin(t * .7) * .006; beam.material.color.copy(stateColor); beam.rotation.y = t * .05;
    fill.intensity = st === 'error' ? 30 : 8; core.material.opacity = st === 'error' ? 1 : .55 + Math.sin(t * 1.1) * .2; core.scale.setScalar(st === 'error' ? .9 : .5);
    key.intensity = 90 + (st === 'speak' ? 20 : 0);
    const pos = pGeo.attributes.position.array;
    for (let i = 0; i < N; i++) {
      if (st === 'think' || st === 'update') { const dx = -pos[i * 3], dy = -1.15 - pos[i * 3 + 1], dz = .6 - pos[i * 3 + 2]; const d = Math.hypot(dx, dy, dz); if (d < .25) resetP(i); else { const k = .02 + .04 / d; pos[i * 3] += dx * k; pos[i * 3 + 1] += dy * k; pos[i * 3 + 2] += dz * k; } }
      else { pos[i * 3 + 1] += pv[i]; pos[i * 3] += Math.sin(t + i) * .0006; if (pos[i * 3 + 1] > 3.2) resetP(i); }
    }
    pGeo.attributes.position.needsUpdate = true; pMat.color.copy(stateColor); pMat.opacity = st === 'think' ? .9 : .5;
    if (st === 'analyze') { scan.position.y = -1.9 + ((t * .9) % 1) * 4.1; scan.material.opacity = .9; scanGlow.material.opacity = .12; } else { scan.material.opacity = 0; scanGlow.material.opacity = 0; }
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);
  return { dispose() { cancelAnimationFrame(raf); renderer.dispose(); pmrem.dispose(); } };
}
window.UltronHolo = { mount };

/* ── ACOPLE · EL BUSTO SE MONTA SOLO ────────────────────────────────────────
   El diseño que llegó dejaba el montaje a un armazón de React que aquí no
   existe: `mount()` quedaba exportado y nadie lo llamaba nunca. El resultado
   era una pantalla correcta con un agujero negro en el medio — y justamente el
   medio es ULTRON.
   Se monta contra `__ULTRON_MENTE`, que es el objeto que la consola actualiza
   sesenta veces por segundo (estado, nivel de la voz, ratón). El busto viene a
   mirarlo; no se le manda nada, así ninguno de los dos bloquea al otro. */
function arrancarBusto() {
  const cv = document.getElementById('holo');
  if (!cv) return;
  const mirar = () => (typeof window.__ULTRON_MENTE === 'function' ? window.__ULTRON_MENTE() : { state: 'idle' });
  /* ACOPLE · EL ENCUADRE DEPENDE DE LA PANTALLA. El encuadre de origen mete el
     busto entero —cabeza, hombros y pedestal— en la altura de la ventana. En un
     teléfono eso deja la cara del tamaño de una moneda en el tercio de abajo,
     con media pantalla vacía arriba, y la boca —que es justo lo que hay que
     mirar mientras habla— casi no se distingue. Por debajo de 860 px se acerca
     a la cabeza. */
  const opciones = innerWidth < 860 ? { zoom: 0.72, mira: 0.42 } : {};
  try {
    window.__ULTRON_BUSTO = mount(cv, mirar, opciones);
    window.ULTRON_HOLO_LISTO = true;
  } catch (e) {
    /* Un teléfono viejo sin WebGL, o la tarjeta ocupada. No se deja el hueco
       negro: se dice qué pasó y el resto del sistema sigue sirviendo. */
    console.warn('[holo] no se pudo dibujar el busto:', e && e.message);
    cv.remove();
    const aviso = document.createElement('div');
    aviso.id = 'sin-holo';
    aviso.innerHTML = '<b>ULTRON</b><span>Este navegador no puede dibujar la figura en tres dimensiones. '
      + 'Todo lo demás —la voz, los archivos, el tablero— funciona igual.</span>';
    document.getElementById('os')?.prepend(aviso);
    window.ULTRON_HOLO_LISTO = false;
  }
  window.dispatchEvent(new Event('ultron-holo-ready'));
}

if (document.readyState === 'loading') addEventListener('DOMContentLoaded', arrancarBusto);
else arrancarBusto();
