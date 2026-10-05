/* Planta conceptual CIL de 150 t/día que se arma en 3D, con agua, relaves, destrucción de cianuro, energía y comunidad.
   Expone window.PLANTA = { cuadro(t, S, V), puntos() } */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const W0 = window.ANCHO || 1920, H0 = window.ALTO || 1080, VERT = H0 > W0;
const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ss = x => { x = cl(x); return x * x * (3 - 2 * x); };
const lerp = (a, b, k) => a + (b - a) * k;
const atras = x => { x = cl(x); const c = 1.6; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

const c = document.createElement('canvas'); c.width = W0; c.height = H0;
c.style.cssText = 'position:absolute;inset:0;width:' + W0 + 'px;height:' + H0 + 'px;opacity:0';
document.body.insertBefore(c, document.getElementById('lienzo'));
const r = new THREE.WebGLRenderer({ canvas: c, antialias: true, preserveDrawingBuffer: true });
r.setPixelRatio(1); r.setSize(W0, H0, false); r.setClearColor(0x0b0907);
r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
const esc = new THREE.Scene(); { const pm = new THREE.PMREMGenerator(r); esc.environment = pm.fromScene(new RoomEnvironment(), .04).texture; esc.environmentIntensity = .55; }
 esc.fog = new THREE.Fog(0x0b0907, 1400, 2900);
const cam = new THREE.PerspectiveCamera(VERT ? 52 : 32, W0 / H0, 5, 6000);
esc.add(new THREE.HemisphereLight(0xffe2b0, 0x1a120a, .9));
const sol = new THREE.DirectionalLight(0xffc98a, 2.6); sol.position.set(-600, 900, 500); esc.add(sol);
const rim = new THREE.DirectionalLight(0x8fb8ff, 1.2); rim.position.set(700, 300, -800); esc.add(rim);
const comp = new EffectComposer(r); comp.addPass(new RenderPass(esc, cam));
comp.addPass(new UnrealBloomPass(new THREE.Vector2(W0 / 2, H0 / 2), .75, .5, .82)); comp.addPass(new OutputPass());

const AMBAR = new THREE.Color(1.0, .62, .2), AGUA = new THREE.Color(.25, .65, 1.0), VERDE = new THREE.Color(.36, .84, .54);
/* suelo: plataforma con cuadrícula */
{
  const g = new THREE.CircleGeometry(1500, 96); g.rotateX(-Math.PI / 2);
  const m = new THREE.ShaderMaterial({ transparent: true, uniforms: {}, vertexShader: 'varying vec3 p; void main(){ p=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `varying vec3 p; void main(){ vec2 q=p.xz/40.; vec2 gr=abs(fract(q-.5)-.5)/fwidth(q); float l=1.-min(min(gr.x,gr.y),1.);
      float d=length(p.xz)/1500.; float a=(1.-smoothstep(.35,1.,d)); vec3 col=vec3(.032,.025,.018)*(1.2-d)+vec3(1.,.62,.2)*l*.09*a; col=mix(col,vec3(.043,.035,.027),smoothstep(.45,.95,d)); gl_FragColor=vec4(col,1.); }` });
  esc.add(new THREE.Mesh(g, m));
}
const metal = (col = 0x6a5e50, rough = .32) => new THREE.MeshStandardMaterial({ color: col, metalness: .85, roughness: rough });
const brillo = (col, op = 1) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
const bordes = [];
function conBordes(mesh, col = AMBAR) {
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 25), new THREE.LineBasicMaterial({ color: col.clone().multiplyScalar(2.2), transparent: true, opacity: 0, toneMapped: false }));
  mesh.add(e); bordes.push(e); return mesh;
}
/* cada unidad es un grupo que crece desde el suelo */
const U = {};
function unidad(nombre, x, z, armar) { const g = new THREE.Group(); g.position.set(x, 0, z); armar(g); g.userData.lineas = []; g.traverse(o => { if (o.isLineSegments) g.userData.lineas.push(o); }); esc.add(g); U[nombre] = g; return g; }

unidad('acopio', -620, -40, g => { const m = conBordes(new THREE.Mesh(new THREE.ConeGeometry(70, 60, 24), metal(0x5b4632, .9))); m.position.y = 30; g.add(m); });
unidad('tritura', -470, -40, g => {
  const b = conBordes(new THREE.Mesh(new THREE.BoxGeometry(70, 60, 60), metal())); b.position.y = 30; g.add(b);
  const h = conBordes(new THREE.Mesh(new THREE.CylinderGeometry(45, 18, 40, 4), metal(0x4a4036))); h.position.y = 80; h.rotation.y = Math.PI / 4; g.add(h);
});
unidad('faja', -350, -40, g => { const f = conBordes(new THREE.Mesh(new THREE.BoxGeometry(200, 6, 16), metal(0x2c2620))); f.position.set(0, 55, 0); f.rotation.z = .32; g.add(f);
  [-70, 0, 70].forEach(x => { const p = new THREE.Mesh(new THREE.BoxGeometry(5, 1, 5), metal()); p.scale.y = 55 + x * .32; p.position.set(x, (55 + x * .32) / 2, 0); g.add(p); }); });
unidad('molino', -190, -40, g => {
  const m = conBordes(new THREE.Mesh(new THREE.CylinderGeometry(42, 42, 130, 40), metal(0x4b4339, .35))); m.rotation.z = Math.PI / 2; m.position.y = 58; g.add(m);
  const rg = new THREE.Mesh(new THREE.TorusGeometry(46, 4, 8, 48), metal(0x8a6a3a, .3)); rg.rotation.y = Math.PI / 2; rg.position.set(30, 58, 0); g.add(rg);
  const ci = conBordes(new THREE.Mesh(new THREE.ConeGeometry(18, 50, 20), metal())); ci.rotation.x = Math.PI; ci.position.set(40, 135, 40); g.add(ci);
  [[-50, 0], [50, 0]].forEach(([x]) => { const s = new THREE.Mesh(new THREE.BoxGeometry(20, 30, 70), metal(0x2a241e)); s.position.set(x, 15, 0); g.add(s); });
});
const TQ = [];
unidad('cil', 40, -40, g => {
  for (let i = 0; i < 6; i++) { const x = (i % 3) * 95 - 95, z = Math.floor(i / 3) * 100 - 50;
    const t = conBordes(new THREE.Mesh(new THREE.CylinderGeometry(38, 38, 80, 40), metal(0x6b6a66, .25))); t.position.set(x, 40, z); g.add(t);
    const tapa = new THREE.Mesh(new THREE.CylinderGeometry(39, 39, 3, 40), brillo(AMBAR, .0)); tapa.position.set(x, 81, z); g.add(tapa); TQ.push(tapa);
    const ag = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 30, 8), metal(0x8a7a60)); ag.position.set(x, 96, z); g.add(ag); }
  const pas = new THREE.Mesh(new THREE.BoxGeometry(300, 3, 14), metal(0x2a241e)); pas.position.set(0, 84, 0); g.add(pas);
});
unidad('fundicion', 270, -40, g => {
  const b = conBordes(new THREE.Mesh(new THREE.BoxGeometry(110, 70, 90), metal(0x3d352c, .6))); b.position.y = 35; g.add(b);
  const ch = conBordes(new THREE.Mesh(new THREE.CylinderGeometry(9, 11, 70, 16), metal())); ch.position.set(30, 100, 20); g.add(ch);
  const col = conBordes(new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 110, 20), metal(0x7a7468, .25))); col.position.set(-75, 55, -20); g.add(col);
  const luz = new THREE.Mesh(new THREE.BoxGeometry(60, 18, 2), brillo(new THREE.Color(1.6, 1.0, .35), 0)); luz.position.set(0, 40, 46); g.add(luz); g.userData.luz = luz;
});
unidad('detox', 190, 150, g => { const t = conBordes(new THREE.Mesh(new THREE.CylinderGeometry(34, 34, 60, 32), metal(0x5e6a6a, .3)), VERDE); t.position.y = 30; g.add(t);
  const a = new THREE.Mesh(new THREE.CylinderGeometry(35, 35, 3, 32), brillo(VERDE, 0)); a.position.y = 61; g.add(a); g.userData.luz = a; });
unidad('relaves', 160, 420, g => {
  const d = conBordes(new THREE.Mesh(new THREE.CylinderGeometry(250, 280, 34, 4, 1, true), metal(0x3a3128, .9))); d.rotation.y = Math.PI / 4; d.position.y = 17; g.add(d);
  const fondo = new THREE.Mesh(new THREE.PlaneGeometry(350, 350), new THREE.MeshStandardMaterial({ color: 0x14110e, metalness: .2, roughness: .3 })); fondo.rotation.x = -Math.PI / 2; fondo.position.y = 4; g.add(fondo);
  const forro = new THREE.Mesh(new THREE.PlaneGeometry(350, 350), brillo(new THREE.Color(.25, .9, .7), 0)); forro.rotation.x = -Math.PI / 2; forro.position.y = 6; g.add(forro); g.userData.luz = forro;
});
unidad('agua', -170, 360, g => {
  const p = new THREE.Mesh(new THREE.CylinderGeometry(150, 160, 14, 48), metal(0x2a241e, .8)); p.position.y = 7; g.add(p);
  const ag = new THREE.Mesh(new THREE.CircleGeometry(146, 64), new THREE.MeshStandardMaterial({ color: 0x0e3a5a, metalness: .3, roughness: .06 })); ag.rotation.x = -Math.PI / 2; ag.position.y = 15; g.add(ag);
  const a = new THREE.Mesh(new THREE.RingGeometry(120, 146, 64), brillo(AGUA, .3)); a.rotation.x = -Math.PI / 2; a.position.y = 16; g.add(a); g.userData.luz = a;
});
unidad('solar', -470, 560, g => { for (let i = 0; i < 6; i++) for (let j = 0; j < 5; j++) {
  const p = new THREE.Mesh(new THREE.BoxGeometry(46, 2, 26), new THREE.MeshStandardMaterial({ color: 0x1c2a44, metalness: .9, roughness: .15, emissive: 0x0a1426 }));
  p.position.set(i * 52 - 130, 16, j * 40 - 80); p.rotation.x = -.45; g.add(p); } });
const GENTE = [];
unidad('comunidad', 600, 260, g => {
  [[0, 0], [90, -40], [-80, 50], [40, 110], [140, 60], [-30, -110]].forEach(([x, z], i) => {
    const casa = conBordes(new THREE.Mesh(new THREE.BoxGeometry(46, 30, 38), new THREE.MeshStandardMaterial({ color: 0xcdb48e, roughness: .9 }))); casa.position.set(x, 15, z); g.add(casa);
    const techo = new THREE.Mesh(new THREE.ConeGeometry(36, 22, 4), new THREE.MeshStandardMaterial({ color: 0x9a4a2a, roughness: .8 })); techo.rotation.y = Math.PI / 4; techo.position.set(x, 41, z); g.add(techo); });
  const mesa = new THREE.Mesh(new THREE.CylinderGeometry(40, 40, 6, 32), new THREE.MeshStandardMaterial({ color: 0x7a5a3a })); mesa.position.set(-150, 18, -60); g.add(mesa);
  const halo = new THREE.Mesh(new THREE.RingGeometry(60, 70, 64), brillo(AMBAR, 0)); halo.rotation.x = -Math.PI / 2; halo.position.set(-150, 3, -60); g.add(halo); g.userData.luz = halo;
  for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283; const p = new THREE.Mesh(new THREE.CapsuleGeometry(5, 14, 4, 8), new THREE.MeshStandardMaterial({ color: i % 3 ? 0xe0c7a0 : 0xff9a3a }));
    p.position.set(-150 + Math.cos(a) * 52, 12, -60 + Math.sin(a) * 52); g.add(p); GENTE.push(p); }
});
const ARB = new THREE.Group(); esc.add(ARB);
{ let s = 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 140; i++) { const a = rnd() * 6.283, d = 780 + rnd() * 420; const tr = new THREE.Mesh(new THREE.ConeGeometry(14 + rnd() * 10, 50 + rnd() * 40, 7), new THREE.MeshStandardMaterial({ color: 0x2f5a32, roughness: .9 }));
    tr.position.set(Math.cos(a) * d, 30, Math.sin(a) * d * .8 + 120); tr.userData.k = rnd(); ARB.add(tr); } }

/* flujos: mineral (ámbar) y agua (azul) */
function flujo(pts, n, col, tam) {
  const curva = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
  const tubo = new THREE.Mesh(new THREE.TubeGeometry(curva, 80, 2.2, 6), brillo(col, 0)); esc.add(tubo);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: col.clone().multiplyScalar(2), size: tam, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  esc.add(p); return { curva, tubo, p, n };
}
const FM = flujo([[-620, 70, -40], [-470, 110, -40], [-440, 30, -40], [-260, 92, -40], [-190, 110, -40], [-120, 70, -40], [-55, 100, -90], [135, 100, 10], [215, 70, -40], [270, 80, -40]], 70, AMBAR, 9);
const FA = flujo([[160, 30, 300], [0, 30, 330], [-60, 30, 350], [-170, 30, 360], [-220, 50, 200], [-220, 60, 30], [-190, 70, -40]], 50, AGUA, 9);
const FD = flujo([[110, 60, 10], [190, 60, 120], [190, 40, 180], [170, 25, 300]], 26, VERDE, 8);
function mueve(F, t, k, vel) {
  F.tubo.material.opacity = .35 * k; F.p.material.opacity = k; const a = F.p.geometry.attributes.position;
  for (let i = 0; i < F.n; i++) { const u = ((i / F.n) + t * vel) % 1; const v = F.curva.getPointAt(u); a.setXYZ(i, v.x, v.y + 4, v.z); }
  a.needsUpdate = true;
}

/* rótulos */
const ETQ = { acopio: [-620, 90, -40], tritura: [-470, 120, -40], molino: [-190, 150, -40], cil: [40, 130, -40], fundicion: [270, 150, -40],
  agua: [-170, 40, 360], relaves: [160, 50, 420], detox: [190, 110, 150], comunidad: [450, 70, 200], solar: [-470, 60, 560] };
const v3 = new THREE.Vector3();
function puntos() { const o = {}; for (const k in ETQ) { v3.set(...ETQ[k]).project(cam); o[k] = [(v3.x + 1) / 2 * W0, (1 - v3.y) / 2 * H0, v3.z]; } return o; }

function cuadro(t, S) {
  if (!(t > S.planta - .3 && t < S.pclip + .8)) { c.style.opacity = 0; return 0; }
  const a = ss((t - S.planta) / .6) * (1 - ss((t - S.pclip - .2) / .5));
  c.style.opacity = a;
  /* armado */
  const arma = { acopio: S.planta + .5, tritura: S.p_tri, faja: S.p_tri + .5, molino: S.p_mol, cil: S.p_tan, fundicion: S.p_fun,
    agua: S.p_agua, solar: S.p_agua + .7, relaves: S.p_rel, detox: S.p_cia, comunidad: S.p_com };
  for (const k in U) {
    const p = (t - arma[k]) / .9, g = U[k];
    g.visible = p > 0; g.scale.set(1, Math.max(.001, atras(p)), 1);
    const li = ss(p * 2) * (1 - .45 * ss((p - 1) * 1.5));
    g.userData.lineas.forEach(l => l.material.opacity = li);
  }
  const kArm = ss((t - S.p_armo) / 1);
  TQ.forEach((q, i) => q.material.opacity = .5 * kArm * (.7 + .3 * Math.sin(t * 3 + i)));
  U.fundicion.userData.luz.material.opacity = kArm * (.8 + .2 * Math.sin(t * 5));
  U.detox.userData.luz.material.opacity = .9 * ss((t - S.p_cia - .4) / .6);
  U.relaves.userData.luz.material.opacity = .07 * ss((t - S.p_rel - .5) / .8);
  U.agua.userData.luz.material.opacity = .15 + .35 * ss((t - S.p_agua) / .6) * (.7 + .3 * Math.sin(t * 3));
  U.comunidad.userData.luz.material.opacity = ss((t - S.p_com - .3) / .6) * (.7 + .3 * Math.sin(t * 4));
  GENTE.forEach((p, i) => { p.visible = t > S.p_com + .2 + i * .06; });
  ARB.children.forEach(tr => { const k = ss((t - S.p_com - .4 - tr.userData.k * 2.2) / .5); tr.scale.setScalar(Math.max(.001, k)); });
  mueve(FM, t, kArm, .08); mueve(FA, t, ss((t - S.p_agua - .4) / .6), .06); mueve(FD, t, ss((t - S.p_cia - .2) / .6), .07);
  /* cámara: órbita que recorre la planta */
  const k = cl((t - S.planta) / (S.pclip - S.planta));
  const foco = (() => {
    const F = [[S.planta, [-300, 40, 0]], [S.p_mol, [-260, 40, -20]], [S.p_tan, [-60, 40, -20]], [S.p_fun, [60, 40, 0]], [S.p_agua, [-80, 30, 180]], [S.p_rel, [40, 30, 260]], [S.p_com, [260, 30, 230]], [S.pclip, [280, 30, 240]]];
    let o = F[0][1]; for (let i = 0; i < F.length - 1; i++) { const [t0, a0] = F[i], [t1, a1] = F[i + 1]; if (t >= t0) { const q = ss((t - t0) / Math.max(.5, t1 - t0)); o = a0.map((v, j) => lerp(v, a1[j], q)); } } return o;
  })();
  const az = lerp(-38, 32, ss(k)) * Math.PI / 180, el = lerp(30, 42, ss(k)) * Math.PI / 180, d = lerp(1450, 1650, ss(k)) - 160 * Math.sin(k * Math.PI);
  const dv = VERT ? d * .62 : d;
  cam.position.set(foco[0] + dv * Math.cos(el) * Math.sin(az), foco[1] + dv * Math.sin(el), foco[2] + dv * Math.cos(el) * Math.cos(az));
  cam.lookAt(...foco); if (VERT) cam.clearViewOffset(); else cam.setViewOffset(W0, H0, -330, -30, W0, H0);
  comp.render();
  return a;
}
window.PLANTA = { cuadro, puntos };
window.PLANTA_LISTO = true;
