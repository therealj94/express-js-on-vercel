/* Honduras en 3D: relieve real (AWS Terrain Tiles) + Sentinel-2 cloudless (EOX), con overlays de Dr Electrum.
   Expone window.TIERRA = { cuadro(t, S, V), proy(lon, lat, alto) } */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const W0 = window.ANCHO || 1920, H0 = window.ALTO || 1080, VERT = H0 > W0, FOV = VERT ? 50 : 30, KD = window.KD || 1.35;
const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ss = x => { x = cl(x); return x * x * (3 - 2 * x); };
const lerp = (a, b, k) => a + (b - a) * k;
const info = await (await fetch('t3d/info.json')).json();
const GEO = await (await fetch('geo.json')).json();
const carga = u => new Promise(r => new THREE.TextureLoader().load(u, x => { x.colorSpace = THREE.NoColorSpace; x.anisotropy = 8; r(x); }));
const bin = async u => new Float32Array(await (await fetch(u)).arrayBuffer());

/* mercator → píxel de la teja */
function merc(lon, lat, z, x0, y0) {
  const n = 2 ** z * 256, r = lat * Math.PI / 180;
  return [(lon + 180) / 360 * n - x0 * 256, (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n - y0 * 256];
}
const M9 = info.meta9, M12 = info.meta12;
const EX9 = 4.2 / 295, EX12 = 1.7 / 36.9;   // unidades por metro (exageración vertical)

/* ---------- shader común del terreno ---------- */
const VS = `varying vec2 vUv; varying float vH; varying vec3 vW; varying float vD;
void main(){ vUv=uv; vH=position.y; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; vec4 mv=viewMatrix*w; vD=-mv.z; gl_Position=projectionMatrix*mv; }`;
const FS = `uniform sampler2D sat, shade, mask, agua, drape; uniform float nacional, contorno, paso, barrido, fuera, rios, cuenca, rojo, tiempo, niebla0, niebla1, apagado; uniform vec4 rectA; uniform vec2 tam;
varying vec2 vUv; varying float vH; varying vec3 vW; varying float vD;
void main(){
  vec3 s=texture2D(sat,vUv).rgb; float l=dot(s,vec3(.3,.59,.11));
  vec3 g=mix(vec3(l),s,.55)*vec3(1.18,.98,.78)*1.35;
  float sh=texture2D(shade,vUv).r; vec3 col=g*(.22+1.1*sh);
  /* curvas de nivel */
  float q=vH/paso; float d=abs(fract(q-.5)-.5)/max(fwidth(q),1e-4); float lin=1.-min(d,1.);
  vec3 ambar=vec3(1.,.68,.23);
  /* barrido de escaneo (oeste→este) */
  float bx=vUv.x-barrido; float detras=smoothstep(.02,-.02,bx);
  float banda=exp(-pow(bx/.012,2.));
  vec3 osc=vec3(.05,.035,.02)+ambar*lin*.35;
  col=mix(osc,col,detras); float dz=nacional>.5?texture2D(mask,vUv).r:1.; col+=ambar*banda*(.15+.8*dz);
  col+=ambar*lin*contorno*detras;
  if(nacional>.5){
    vec4 m=texture2D(mask,vUv); float dentro=m.r, halo=m.g;
    col=mix(col*vec3(.07,.06,.05)*fuera,col,dentro);
    float borde=1.-smoothstep(.0,.22,abs(dentro-.5));
    col+=ambar*borde*1.4*detras+ambar*halo*(1.-dentro)*.18*detras;
  } else {
    vec4 a=texture2D(agua,vUv);
    col=mix(col,vec3(.45,.78,1.)*1.2,a.r*rios*.85);
    float cu=a.g; float ce=1.-smoothstep(.0,.25,abs(cu-.5));
    col=mix(col,vec3(.2,.55,1.),cu*cuenca*.38); col+=vec3(.35,.7,1.)*ce*cuenca*1.2;
    vec2 p=vUv; p.y=1.-p.y; float enR=step(rectA.x,p.x)*step(p.x,rectA.z)*step(rectA.y,p.y)*step(p.y,rectA.w);
    col=mix(col,vec3(1.,.2,.12)*1.4,enR*smoothstep(.45,.6,cu)*rojo*(.55+.15*sin(tiempo*8.)));
    vec4 dr=texture2D(drape,vUv); col=mix(col,dr.rgb,dr.a);
  }
  col*=1.-apagado;
  /* bordes del mosaico y niebla */
  vec2 e=min(vUv,1.-vUv); float f=smoothstep(0.,.06,min(e.x,e.y));
  float fog=smoothstep(niebla0,niebla1,vD);
  col=mix(col,vec3(.055,.043,.031),max(1.-f,fog));
  gl_FragColor=vec4(col,1.);
}`;

function hacerRenderer() {
  const c = document.createElement('canvas'); c.width = W0; c.height = H0; c.className = 'tierra';
  c.style.cssText = 'position:absolute;inset:0;width:' + W0 + 'px;height:' + H0 + 'px;opacity:0';
  document.body.insertBefore(c, document.getElementById('lienzo'));
  const r = new THREE.WebGLRenderer({ canvas: c, antialias: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1); r.setSize(W0, H0, false); r.setClearColor(0x0e0b08);
  r.toneMapping = THREE.NoToneMapping; r.outputColorSpace = THREE.LinearSRGBColorSpace;
  return { c, r };
}
function malla(h, nx, ny, Wd, Hd, esc, base, uniforms) {
  const geo = new THREE.PlaneGeometry(Wd, Hd, nx - 1, ny - 1); geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, (h[i] - base) * esc);
  const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms, extensions: { derivatives: true } });
  return new THREE.Mesh(geo, mat);
}
function muestreo(h, nx, ny, Wd, Hd) {
  return (x, z) => { // x,z en unidades del mundo (centro = 0)
    const u = cl((x + Wd / 2) / Wd) * (nx - 1), v = cl((z + Hd / 2) / Hd) * (ny - 1);
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, i1 = Math.min(i + 1, nx - 1), j1 = Math.min(j + 1, ny - 1);
    return lerp(lerp(h[j * nx + i], h[j * nx + i1], fu), lerp(h[j1 * nx + i], h[j1 * nx + i1], fu), fv);
  };
}
function camara(cam, o, ancho) {
  if (VERT) o = { ...o, d: o.d * (cam === N.cam ? .95 : .72), sx: 0, sy: 0 };
  const el = o.el * Math.PI / 180, az = o.az * Math.PI / 180;
  cam.position.set(o.x + o.d * Math.cos(el) * Math.sin(az), o.y + o.d * Math.sin(el), o.z + o.d * Math.cos(el) * Math.cos(az));
  cam.lookAt(o.x, o.y, o.z);
  cam.setViewOffset(W0, H0, -(o.sx || 0), -(o.sy || 0), W0, H0);
}
const mezclaCam = (a, b, k) => { const o = {}; for (const key in a) o[key] = lerp(a[key], b[key] ?? a[key], k); return o; };
function bloom(r, esc, cam, fuerza, umbral = .8) {
  const comp = new EffectComposer(r); comp.addPass(new RenderPass(esc, cam));
  const b = new UnrealBloomPass(new THREE.Vector2(W0 / 2, H0 / 2), fuerza, .5, umbral); comp.addPass(b); comp.addPass(new OutputPass());
  return { comp, b };
}

/* ======================= NACIONAL ======================= */
const [nx9, ny9] = info.n9; const h9 = await bin('t3d/h9.bin');
const N = { ...hacerRenderer() };
N.esc = new THREE.Scene(); N.cam = new THREE.PerspectiveCamera(FOV, W0 / H0, 5, 20000);
N.u = { sat: { value: await carga('t3d/sat9.jpg') }, shade: { value: await carga('t3d/shade9.jpg') }, mask: { value: await carga('t3d/mask9.png') },
  agua: { value: null }, drape: { value: null }, nacional: { value: 1 }, contorno: { value: .25 }, paso: { value: 300 * EX9 }, barrido: { value: 1.2 }, fuera: { value: 1 },
  rios: { value: 0 }, cuenca: { value: 0 }, rojo: { value: 0 }, tiempo: { value: 0 }, niebla0: { value: 3500 }, niebla1: { value: 7000 }, apagado: { value: 0 }, rectA: { value: new THREE.Vector4() }, tam: { value: new THREE.Vector2() } };
N.esc.add(malla(h9, nx9, ny9, M9.W, M9.H, EX9, 0, N.u));
N.alto = muestreo(h9, nx9, ny9, M9.W, M9.H);
N.w = (lon, lat) => { const [x, y] = merc(lon, lat, 9, M9.x0, M9.y0); return [x - M9.W / 2, y - M9.H / 2]; };
/* concesiones: prismas encendidos */
const NC = GEO.con.length;
const cajaG = new THREE.BoxGeometry(1, 1, 1); cajaG.translate(0, .5, 0);
const matC = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .75, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
N.con = new THREE.InstancedMesh(cajaG, matC, NC); N.con.instanceMatrix.setUsage(THREE.DynamicDrawUsage); N.esc.add(N.con);
N.conD = GEO.con.map((c, i) => { const [x, z] = N.w(c[0], c[1]); return { x, z, y: N.alto(x, z) * EX9, w: Math.max(2.6, Math.min(8, c[2] * 364 * .7)), ex: c[3] === 1, r: (Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1 }; });
const ORD = N.conD.map((c, i) => [c.r, i]).sort((a, b) => a[0] - b[0]); ORD.forEach(([_, i], k) => N.conD[i].rank = k / NC);
/* pilares rojos del tablero */
const pilG = new THREE.CylinderGeometry(1, 1, 1, 12); pilG.translate(0, .5, 0);
const matP = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
N.pil = new THREE.InstancedMesh(pilG, matP, 64); N.esc.add(N.pil);
N.pilD = [...Array(64)].map((_, i) => N.conD[(i * 17) % NC]);
N.fx = bloom(N.r, N.esc, N.cam, .65, .78);
const HC = N.w(-86.55, 14.85);
const mtx = new THREE.Matrix4(), colr = new THREE.Color();

/* ======================= LOCAL ======================= */
const n12 = info.n12; const h12 = await bin('t3d/h12.bin');
const L = { ...hacerRenderer() };
L.esc = new THREE.Scene(); L.cam = new THREE.PerspectiveCamera(FOV, W0 / H0, 5, 20000);
const DR = 2048; L.dc = document.createElement('canvas'); L.dc.width = L.dc.height = DR; L.g = L.dc.getContext('2d');
L.dtex = new THREE.CanvasTexture(L.dc); L.dtex.colorSpace = THREE.NoColorSpace; L.dtex.anisotropy = 8;
L.u = { sat: { value: await carga('t3d/sat12.jpg') }, shade: { value: await carga('t3d/shade12.jpg') }, mask: { value: null }, agua: { value: await carga('t3d/agua12.png') }, drape: { value: L.dtex },
  nacional: { value: 0 }, contorno: { value: .12 }, paso: { value: 50 * EX12 }, barrido: { value: 1.2 }, fuera: { value: 1 }, rios: { value: 0 }, cuenca: { value: 0 }, rojo: { value: 0 }, tiempo: { value: 0 },
  niebla0: { value: 2600 }, niebla1: { value: 4200 }, apagado: { value: 0 }, rectA: { value: new THREE.Vector4() }, tam: { value: new THREE.Vector2() } };
L.esc.add(malla(h12, n12, n12, M12.W, M12.H, EX12, M12.lo, L.u));
L.alto = muestreo(h12, n12, n12, M12.W, M12.H);
L.w = (lon, lat) => { const [x, y] = merc(lon, lat, 12, M12.x0, M12.y0); return [x - M12.W / 2, y - M12.H / 2]; };
L.y = (x, z) => (L.alto(x, z) - M12.lo) * EX12;
L.km = 1000 / 36.9;                                   // unidades por km
L.d = (x, z) => [(x + M12.W / 2) / M12.W * DR, (z + M12.H / 2) / M12.H * DR];   // mundo → píxel del drape
const lito = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 't3d/lito12.png'; });
/* faro de ubicación */
const faroM = new THREE.MeshBasicMaterial({ color: 0x4fb3ff, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
L.faro = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 1, 16).translate(0, .5, 0), faroM); L.esc.add(L.faro);
L.fx = bloom(L.r, L.esc, L.cam, .5, .86);

/* lugares de la escena local */
const OBJ = [-86.85, 14.62];
const [ox, oz] = L.w(...OBJ);
const CC = L.w(...info.centro_cuenca);
const kmx = L.km;
/* concesión más cercana: esquina SO a 1,8 km al NE del objetivo */
const B = { x: ox + 1.8 * kmx * Math.SQRT1_2, z: oz - 1.8 * kmx * Math.SQRT1_2, w: 2.2 * kmx, h: 1.8 * kmx };
/* A-17: rectángulo que pisa la microcuenca */
const A = { x: CC[0] - .1 * kmx, z: CC[1] + .7 * kmx, w: 2.8 * kmx, h: 2.6 * kmx };
/* otras concesiones (ilustrativas) */
const OTRAS = []; { let s = 3; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  while (OTRAS.length < 26) { const x = ox + (rnd() - .5) * 26 * kmx, z = oz + (rnd() - .5) * 26 * kmx, w = (1 + rnd() * 2.2) * kmx, h = (1 + rnd() * 2) * kmx;
    const lejos = (cx, cz) => Math.hypot(cx - (x + w / 2), cz - (z - h / 2)) > 3.2 * kmx;
    if (lejos(ox, oz) && lejos(CC[0], CC[1]) && lejos(B.x + B.w / 2, B.z - B.h / 2) && lejos(A.x + A.w / 2, A.z - A.h / 2)) OTRAS.push({ x, z, w, h }); } }
const ALDEAS = [[.35, .6], [-.9, .1], [.6, -.8], [-.3, -1.5], [1.1, .4]].map(([a, b]) => [CC[0] + a * kmx, CC[1] + b * kmx]);
{ const [x0, z0] = L.d(A.x, A.z - A.h), [x1, z1] = L.d(A.x + A.w, A.z); L.u.rectA.value.set(x0 / DR, z0 / DR, x1 / DR, z1 / DR); }

function rectDrape(g, r, k, col, ancho, relleno) {
  const [x0, y0] = L.d(r.x, r.z - r.h), [x1, y1] = L.d(r.x + r.w, r.z);
  g.save(); g.globalAlpha = k; if (relleno) { g.fillStyle = relleno; g.fillRect(x0, y0, x1 - x0, y1 - y0); }
  g.strokeStyle = col; g.lineWidth = ancho; g.strokeRect(x0, y0, x1 - x0, y1 - y0); g.restore();
}

/* proyección a pantalla para rótulos 2D */
let activa = null;
function proy(x, y, z) {
  const R = activa; if (!R) return [-999, -999];
  const v = new THREE.Vector3(x, y, z).project(R.cam); return [(v.x + 1) / 2 * W0, (1 - v.y) / 2 * H0, v.z];
}

/* ======================= CUADRO ======================= */
function cuadro(t, S, V) {
  let aN = 0, aL = 0;
  /* ---- tramo nacional (mapa + inmersión GPS) ---- */
  const enMapa = t > S.mapa_cod - .7 && t < S.gps + 2.2;
  const enTab = t > S.tablero - .4 && t < S.entreg + .5;
  if (enMapa || enTab) {
    const u = N.u; u.tiempo.value = t;
    let o, conK = 1, expK = 0, pilK = 0;
    if (enMapa) {
      aN = ss((t - S.mapa_cod + .6) / .5) * (1 - ss((t - S.gps - 1.35) / .5));
      if (t > S.campo + .2 && t < S.gps - .2) aN = 0;
      const k = cl((t - S.mapa_cod + .6) / (S.campo - S.mapa_cod + .6));
      const A0 = { x: HC[0], y: 0, z: HC[1] - 40, d: 3500, el: 74, az: -12, sx: 300, sy: 10 }, A1 = { x: HC[0], y: 0, z: HC[1] + 20, d: 3050, el: 52, az: 8, sx: 360, sy: 0 };
      o = mezclaCam(A0, A1, ss(k) * .85 + k * .15);
      u.barrido.value = lerp(-.05, 1.08, ss((t - S.mapa_cod + .3) / 1.7));
      conK = ss((t - S.mapa_cod - .7) / 2.4);
      expK = ss((t - S.n176) / .6);
      if (t > S.gps - .3) {     // inmersión hacia el punto GPS
        const [tx, tz] = N.w(...OBJ); const ty = N.alto(tx, tz) * EX9;
        const B0 = { x: HC[0], y: 0, z: HC[1], d: 2900, el: 58, az: 4, sx: 0, sy: 0 }, B1 = { x: tx, y: ty, z: tz, d: 210, el: 52, az: -18, sx: -220, sy: 0 };
        o = mezclaCam(B0, B1, Math.pow(ss((t - S.gps) / 1.6), 1.6)); u.barrido.value = 1.2; conK = 1; expK = 0;
      }
      u.contorno.value = .18;
    } else {
      aN = ss((t - S.tablero) / .5) * (1 - ss((t - S.entreg) / .4));
      const k = cl((t - S.tablero) / 6);
      o = mezclaCam({ x: HC[0], y: 0, z: HC[1] - 20, d: 3500, el: 64, az: 10, sx: 400, sy: 60 }, { x: HC[0], y: 0, z: HC[1], d: 3150, el: 55, az: 20, sx: 400, sy: 50 }, ss(k));
      u.barrido.value = 1.2; u.contorno.value = .14; pilK = 1;
    }
    camara(N.cam, o);
    u.fuera.value = 1;
    for (let i = 0; i < NC; i++) {
      const c = N.conD[i]; const r = enTab ? 1 : ss((conK - c.rank) * 12);
      let hgt = (c.ex && expK > 0 ? 6 + 26 * expK : 6) * r * (enTab ? .7 : 1);
      mtx.makeScale(c.w, Math.max(.001, hgt), c.w); mtx.setPosition(c.x, c.y, c.z); N.con.setMatrixAt(i, mtx);
      const dim = enTab ? .35 : (c.ex ? 1 : 1 - .78 * expK);
      if (c.ex && expK > 0) colr.setRGB(1.45 * dim, 1.1 * dim, .55 * dim); else colr.setRGB(1.0 * dim, .5 * dim, .1 * dim);
      N.con.setColorAt(i, colr);
    }
    N.con.instanceMatrix.needsUpdate = true; N.con.instanceColor.needsUpdate = true;
    for (let i = 0; i < 64; i++) {
      const c = N.pilD[i]; const k = pilK * ss((t - S.tablero - 1 - i * .02) / .4);
      mtx.makeScale(2.4, Math.max(.001, 70 * k * (.6 + .4 * ((i * 7) % 5) / 4)), 2.4); mtx.setPosition(c.x, c.y, c.z); N.pil.setMatrixAt(i, mtx);
      N.pil.setColorAt(i, colr.setRGB(2.2, .38, .25));
    }
    N.pil.instanceMatrix.needsUpdate = true; N.pil.instanceColor.needsUpdate = true; N.pil.visible = pilK > 0;
    N.fx.comp.render();
  }
  /* ---- tramo local (GPS, semáforo, geología) ---- */
  if (t > S.gps + .9 && t < S.nucleo + .7) {
    aL = ss((t - S.gps - 1.15) / .5) * (1 - ss((t - S.nucleo - .2) / .5));
    const u = L.u; u.tiempo.value = t;
    const oy = L.y(ox, oz);
    const G1 = { x: ox, y: oy, z: oz, d: 1700, el: 52, az: -18, sx: -220, sy: 0 }, G2 = { x: ox + 1.2 * kmx, y: oy, z: oz - 1.2 * kmx, d: 820, el: 46, az: -2, sx: -260, sy: 40 };
    const ccy = L.y(...CC);
    const S1 = { x: CC[0] + .4 * kmx, y: ccy, z: CC[1] - .8 * kmx, d: 760, el: 50, az: 26, sx: -360, sy: 40 }, S2 = { x: CC[0] + .4 * kmx, y: ccy, z: CC[1] - .8 * kmx, d: 640, el: 44, az: 48, sx: -360, sy: 40 };
    const R1 = { x: ox + .3 * kmx, y: oy, z: oz, d: 1100, el: 66, az: 70, sx: -330, sy: 30 }, R2 = { x: ox + .3 * kmx, y: oy, z: oz, d: 900, el: 58, az: 92, sx: -330, sy: 30 };
    let o;
    if (t < S.semaforo) o = mezclaCam(G1, G2, ss((t - S.gps - 1.2) / (S.semaforo - S.gps - 1.2)));
    else if (t < S.geo) { const k1 = ss((t - S.semaforo) / 1.6); o = mezclaCam(mezclaCam(G2, S1, k1), S2, ss((t - S.semaforo - 1.6) / (S.geo - S.semaforo - 1.6)) * k1); }
    else { const k1 = ss((t - S.geo) / 1.6); o = mezclaCam(mezclaCam(S2, R1, k1), R2, ss((t - S.geo - 1.6) / (S.nucleo - S.geo)) * k1); }
    camara(L.cam, o);
    /* agua y semáforo */
    const enS = ss((t - S.semaforo - .2) / .8) * (1 - ss((t - S.geo) / .6));
    u.rios.value = Math.max(enS, .35 * ss((t - S.gps - 1.4) / 1)) * (1 - .7 * ss((t - S.geo) / .6));
    u.cuenca.value = enS * ss((t - S.semaforo - .3) / 1);
    u.rojo.value = enS * ss((t - S.rojo + 1.2) / .6);
    u.apagado.value = .15 * ss((t - S.indicio) / .4);
    /* drape */
    const g = L.g; g.clearRect(0, 0, DR, DR);
    const kG = 1 - ss((t - S.semaforo) / .6);
    const [px, pz] = L.d(ox, oz), pxk = DR / M12.W * kmx;
    if (kG > 0) {
      g.save(); g.globalAlpha = kG;
      OTRAS.forEach((r, i) => rectDrape(g, r, ss((t - S.gps - 1.4 - i * .03) / .4) * .85, 'rgba(255,174,59,.95)', 4, 'rgba(255,174,59,.16)'));
      const rk = ss((t - S.gps - 1.6) / .8);
      g.strokeStyle = 'rgba(79,179,255,.95)'; g.lineWidth = 6; g.setLineDash([26, 18]); g.beginPath(); g.arc(px, pz, 5 * pxk * rk, 0, 7); g.stroke(); g.setLineDash([]);
      g.fillStyle = 'rgba(79,179,255,.10)'; g.beginPath(); g.arc(px, pz, 5 * pxk * rk, 0, 7); g.fill();
      const pu = (t * 1.1) % 1; g.strokeStyle = `rgba(150,215,255,${1 - pu})`; g.lineWidth = 5; g.beginPath(); g.arc(px, pz, 14 + 90 * pu, 0, 7); g.stroke();
      g.fillStyle = '#7cc8ff'; g.beginPath(); g.arc(px, pz, 14, 0, 7); g.fill();
      const k2 = ss((t - V.E04 - 1.2) / .6);
      rectDrape(g, B, ss((t - V.E04 - .8) / .5), 'rgba(255,200,110,1)', 7, 'rgba(255,174,59,.32)');
      const [bx, bz] = L.d(B.x, B.z);
      g.strokeStyle = 'rgba(255,214,140,1)'; g.lineWidth = 6; g.setLineDash([18, 14]); g.beginPath(); g.moveTo(px, pz); g.lineTo(px + (bx - px) * k2, pz + (bz - pz) * k2); g.stroke(); g.setLineDash([]);
      g.restore();
    }
    if (enS > 0) {
      g.save(); g.globalAlpha = enS;
      rectDrape(g, A, ss((t - S.semaforo - .3) / 1), 'rgba(255,174,59,1)', 8, 'rgba(255,174,59,.14)');
      ALDEAS.forEach(([x, z], i) => { const k = ss((t - S.semaforo - 1.5 - i * .25) / .3); const [dx, dz] = L.d(x, z);
        g.globalAlpha = enS * k; g.fillStyle = 'rgba(30,22,14,.6)'; g.beginPath(); g.arc(dx, dz, 9, 0, 7); g.fill(); g.fillStyle = '#F2DDB0'; g.beginPath(); g.arc(dx, dz, 5, 0, 7); g.fill(); });
      g.restore();
    }
    const enR = ss((t - S.geo) / .6) * (1 - ss((t - S.nucleo) / .4));
    if (enR > 0) {
      const R0 = 5 * pxk * ss((t - S.geo - .1) / 1.2);
      g.save(); g.globalAlpha = enR;
      g.fillStyle = 'rgba(8,6,4,.55)'; g.fillRect(0, 0, DR, DR);
      g.save(); g.beginPath(); g.arc(px, pz, R0, 0, 7); g.clip(); g.clearRect(0, 0, DR, DR);
      g.globalAlpha = enR * .55; g.drawImage(lito, 0, 0, DR, DR);
      g.globalAlpha = enR;
      const fk = ss((t - S.geo - 1.4) / 1); const f0 = [px - 4.6 * pxk, pz + 3.2 * pxk], f1 = [px + 4.4 * pxk, pz - 3.4 * pxk];
      g.strokeStyle = '#FF4D3D'; g.lineWidth = 10; g.setLineDash([40, 26]); g.beginPath(); g.moveTo(...f0); g.lineTo(f0[0] + (f1[0] - f0[0]) * fk, f0[1] + (f1[1] - f0[1]) * fk); g.stroke(); g.setLineDash([]);
      const ak = ss((t - S.geo - 3) / .8);
      g.globalAlpha = enR * ak; g.fillStyle = 'rgba(214,176,92,.8)'; g.beginPath(); g.ellipse(px + 1.2 * pxk, pz + .2 * pxk, 1.1 * pxk, .6 * pxk, .3, 0, 7); g.fill();
      g.fillStyle = 'rgba(196,104,62,.85)'; g.beginPath(); g.ellipse(px + 2.1 * pxk, pz - 1.3 * pxk, .7 * pxk, .45 * pxk, 0, 0, 7); g.fill();
      g.restore();
      g.strokeStyle = '#FFAE3B'; g.lineWidth = 8; g.beginPath(); g.arc(px, pz, R0, 0, 7); g.stroke();
      g.restore();
    }
    L.dtex.needsUpdate = true;
    /* faro */
    const fk = (1 - ss((t - S.semaforo) / .5)) * ss((t - S.gps - 1.3) / .6) + enR * .5;
    L.faro.visible = fk > .01; L.faro.scale.set(1 + .3 * Math.sin(t * 6), 260 * fk, 1 + .3 * Math.sin(t * 6)); L.faro.position.set(ox, oy, oz);
    L.fx.comp.render();
  }
  N.c.style.opacity = aN; L.c.style.opacity = aL;
  activa = aL > aN ? L : (aN > 0 ? N : null);
  return Math.max(aN, aL);
}
/* rótulos: posiciones en pantalla de puntos clave */
function puntos() {
  const R = activa; if (!R) return {};
  const P = (x, z, dy = 0) => proy(x, (R === L ? L.y(x, z) : N.alto(x, z) * EX9) + dy, z);
  if (R === N) return { nac: true };
  const kmx = L.km;
  return { obj: P(ox, oz, 4), b: P(B.x, B.z), medio: P((ox + B.x) / 2, (oz + B.z) / 2, 4), a17: P(A.x + A.w * .1, A.z - A.h, 6), cuenca: P(CC[0] - 1.6 * kmx, CC[1] + 1.8 * kmx, 4),
    intr: P(ox + 1.0 * kmx, oz - 2.6 * kmx, 6), falla: P(ox - 3.2 * kmx, oz + 1.6 * kmx, 6),
    esc: [...Array(24)].map((_, i) => P(ox + 5.2 * kmx * Math.cos(i / 24 * 6.283), oz + 5.2 * kmx * Math.sin(i / 24 * 6.283), 4)).reduce((a, b) => b[1] > a[1] ? b : a) };
}
window.TIERRA = { cuadro, puntos };
window.TIERRA_LISTO = true;
