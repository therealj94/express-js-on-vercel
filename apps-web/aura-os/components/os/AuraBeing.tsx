'use client';
// EL SER. Un busto humano de luz: cabeza calva, cejas, nariz, boca, mentón,
// cuello y hombros que se disuelven. No es una nube de puntos con ojos: es una
// SUPERFICIE —un torno de revolución con la cara esculpida encima— y sobre
// ella tres capas:
//
//   1. la piel: una malla translúcida con borde Fresnel, que enseña la
//      silueta y el relieve de la cara (la nariz y las cejas se leen por la
//      luz, como en la imagen);
//   2. las partículas: 40 mil puntos muestreados SOBRE esa piel, que respiran
//      y derivan;
//   3. el alambre: meridianos y paralelos del torno, apenas, para que se
//      sienta construida.
//
// Más los ojos en sus cuencas, el núcleo del pecho y los filamentos. La
// cabeza es un grupo con pivote en la base del cuello: gira entera.
//
// DÓNDE ENTRA UN ROSTRO EN GLB MÁS ADELANTE: `esculpir()` devuelve una
// BufferGeometry; el día que haya un escaneo o un rig facial, se devuelve esa
// malla en su lugar y las tres capas, los ojos y el rig siguen iguales.
import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';
import { crearPose, parpadeo, pasoRig, respiracion } from '@/lib/aura-rig';
import { useOs } from '@/lib/os-store';

export const NUCLEO = new THREE.Vector3(0, 0.55, 0.30);
const PIVOTE_CABEZA = 1.0;                         // la base del cuello: ahí gira la cabeza
const OJO_I = new THREE.Vector3(-0.145, 1.585, 0.385);
const OJO_D = new THREE.Vector3(0.145, 1.585, 0.385);
const SEGMENTOS = 96;

// ── La escultura ────────────────────────────────────────────────────────────

// El perfil de la cabeza, de la coronilla al cuello: radio y altura.
const PERFIL_CABEZA: [number, number][] = [
  [0.001, 2.08], [0.14, 2.06], [0.25, 2.02], [0.33, 1.96], [0.39, 1.88], [0.42, 1.78], [0.43, 1.68], [0.43, 1.58],
  [0.42, 1.48], [0.40, 1.40], [0.37, 1.32], [0.33, 1.24], [0.28, 1.17], [0.22, 1.11], [0.15, 1.06], [0.11, 1.02], [0.13, 0.99], [0.15, 0.97],
];
// El torso: cuello, hombros, pecho, y se disuelve hacia abajo.
const PERFIL_TORSO: [number, number][] = [
  [0.15, 0.98], [0.155, 0.90], [0.16, 0.80], [0.17, 0.74], [0.24, 0.70], [0.42, 0.66], [0.62, 0.62], [0.78, 0.57],
  [0.88, 0.50], [0.94, 0.42], [0.97, 0.30], [0.98, 0.15], [0.97, 0.0], [0.95, -0.15], [0.92, -0.35],
];

const g = (dx: number, dy: number, sx: number, sy: number) => Math.exp(-(dx * dx) / (2 * sx * sx) - (dy * dy) / (2 * sy * sy));

/** Cuánto sobresale la cara en (x, y), mirando hacia +z. Metros. */
function relieve(x: number, y: number, frente: number): number {
  const f2 = frente * frente;
  let d = 0;
  d += 0.105 * g(x, y - 1.44, 0.052, 0.115) * f2;                                   // el puente de la nariz
  d += 0.055 * g(x, y - 1.355, 0.078, 0.042) * f2;                                  // la punta, más ancha
  d -= 0.048 * (g(x - 0.15, y - 1.585, 0.088, 0.05) + g(x + 0.15, y - 1.585, 0.088, 0.05)) * Math.pow(frente, 1.5); // las cuencas
  d += 0.024 * g(x, y - 1.675, 0.30, 0.032) * f2;                                   // el arco de las cejas
  d += 0.014 * (g(x - 0.30, y - 1.42, 0.09, 0.09) + g(x + 0.30, y - 1.42, 0.09, 0.09)) * frente; // los pómulos
  d += 0.018 * g(x, y - 1.245, 0.13, 0.03) * f2;                                    // el labio de arriba
  d -= 0.012 * g(x, y - 1.215, 0.11, 0.009) * f2;                                   // la línea de la boca
  d += 0.014 * g(x, y - 1.19, 0.11, 0.026) * f2;                                    // el labio de abajo
  d += 0.022 * g(x, y - 1.09, 0.12, 0.05) * f2;                                     // el mentón
  d -= 0.010 * g(x, y - 1.30, 0.22, 0.03) * f2;                                     // el surco bajo los pómulos
  return d;
}

/** Torno + escultura. `cabeza` esculpe la cara y da fondo a la cabeza; el torso se aplana en Z. */
function esculpir(perfil: [number, number][], cabeza: boolean): THREE.BufferGeometry {
  const geo = new THREE.LatheGeometry(perfil.map(([r, y]) => new THREE.Vector2(r, y)), SEGMENTOS);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), z = pos.getZ(i);
    const y = pos.getY(i);
    const r = Math.hypot(x, z) || 1e-6;
    if (cabeza) {
      const frente = Math.max(0, z / r);
      const d = relieve(x, y, frente);
      const k = 1 + d / r;
      x *= k; z *= k * 1.08;                          // la cabeza es más honda que ancha
    } else {
      // los hombros son anchos y el pecho es plano: se aplana en Z bajo el cuello
      const plano = THREE.MathUtils.smoothstep(y, 0.55, 0.80);
      z *= THREE.MathUtils.lerp(0.50, 1.0, plano);
    }
    pos.setXYZ(i, x, y, z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** Meridianos y paralelos del torno, para el alambre. */
function alambre(geo: THREE.BufferGeometry, filas: number, cadaMeridiano: number, cadaParalelo: number): THREE.BufferGeometry {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const idx = (i: number, j: number) => i * filas + j;
  const v: number[] = [];
  const meter = (a: number, b: number) => { v.push(pos.getX(a), pos.getY(a), pos.getZ(a), pos.getX(b), pos.getY(b), pos.getZ(b)); };
  for (let i = 0; i < SEGMENTOS; i += cadaMeridiano) for (let j = 0; j < filas - 1; j++) meter(idx(i, j), idx(i, j + 1));
  for (let j = 1; j < filas; j += cadaParalelo) for (let i = 0; i < SEGMENTOS; i++) meter(idx(i, j), idx(i + 1, j));
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); return out;
}

/** Puntos sobre la piel. Determinista: la figura es LA MISMA en cada carga. */
function muestrear(geo: THREE.BufferGeometry, n: number, region: (p: THREE.Vector3) => number) {
  const malla = new THREE.Mesh(geo);
  let s = 7654321; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const sampler = new MeshSurfaceSampler(malla);
  (sampler as unknown as { randomFunction: () => number }).randomFunction = rnd;   // determinista: la figura es la misma en cada carga
  sampler.build();
  const pos = new Float32Array(n * 3), fase = new Float32Array(n), reg = new Float32Array(n), orden = new Float32Array(n);
  const p = new THREE.Vector3(), nrm = new THREE.Vector3();
  let i = 0, intentos = 0;
  while (i < n && intentos < n * 4) {
    intentos++;
    sampler.sample(p, nrm);
    // la nuca y la espalda, más ralas: se ve la cara, se insinúa el resto
    if (p.z < -0.05 && rnd() < 0.45) continue;
    // sin puntos dentro de las cuencas: los ojos se leen solos
    if (p.distanceTo(OJO_I) < 0.075 || p.distanceTo(OJO_D) < 0.075) continue;
    p.addScaledVector(nrm, 0.004);
    pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
    fase[i] = rnd() * Math.PI * 2; reg[i] = region(p); orden[i] = rnd(); i++;
  }
  const g2 = new THREE.BufferGeometry();
  g2.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, i * 3), 3));
  g2.setAttribute('aFase', new THREE.BufferAttribute(fase.subarray(0, i), 1));
  g2.setAttribute('aRegion', new THREE.BufferAttribute(reg.subarray(0, i), 1));
  g2.setAttribute('aOrden', new THREE.BufferAttribute(orden.subarray(0, i), 1));
  return g2;
}

// ── Los shaders ─────────────────────────────────────────────────────────────

const PIEL_VERT = /* glsl */ `
  out vec3 vN; out vec3 vV; out float vY;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vY = position.y;
    gl_Position = projectionMatrix * mv;
  }`;
const PIEL_FRAG = /* glsl */ `
  precision highp float;
  in vec3 vN; in vec3 vV; in float vY;
  uniform float uDensity, uTime, uCabeza;
  out vec4 outColor;
  void main() {
    vec3 n = normalize(vN);
    float fres = pow(1.0 - abs(dot(n, normalize(vV))), 2.4);
    // una luz alta a la izquierda, para que la nariz y las cejas se lean
    vec3 L = normalize(vec3(-0.45, 0.7, 0.75));
    float lam = 0.5 + 0.5 * dot(n, L);
    // un brillo especular chico: es lo que dibuja el puente de la nariz, las cejas y el mentón
    float spec = pow(max(dot(reflect(-L, n), normalize(vV)), 0.0), 28.0);
    vec3 azul = vec3(0.10, 0.40, 1.0), cian = vec3(0.36, 0.84, 1.0), hielo = vec3(0.80, 0.93, 1.0);
    vec3 col = mix(azul, cian, lam);
    col = mix(col, hielo, fres * 0.6 + spec * 0.8);
    // la piel de la cabeza se ve más (y su relieve); el torso se disuelve hacia abajo
    float cuerpo = uCabeza > 0.5 ? 1.0 : smoothstep(-0.35, 0.35, vY);
    float relieve = uCabeza > 0.5 ? lam * lam * 0.26 + spec * 0.55 : lam * lam * 0.08;
    float a = (fres * 0.85 + relieve + 0.02) * cuerpo * uDensity;
    // un aliento lento sobre la piel
    a *= 0.92 + 0.08 * sin(uTime * 0.8 + vY * 3.0);
    outColor = vec4(col * a, a);
  }`;

const PUNTOS_VERT = /* glsl */ `
  in float aFase; in float aRegion; in float aOrden;
  uniform float uTime, uBreath, uVoice, uDensity, uSienes, uLod, uDpr, uCabeza;
  out float vAlfa; out float vCerca;
  void main() {
    vec3 p = position;
    float v = aRegion > 2.5 ? uSienes : 1.0;
    p.x += sin(uTime * 0.7 * v + aFase) * 0.006;
    p.y += cos(uTime * 0.55 * v + aFase * 1.3) * 0.006;
    p.z += sin(uTime * 0.6 * v + aFase * 0.7) * 0.005;
    if (uCabeza < 0.5) p.z += uVoice * 0.03 * sin(uTime * 9.0 + aFase);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    vec3 mundo = (modelMatrix * vec4(p, 1.0)).xyz;
    float cerca = 1.0 - clamp(distance(mundo, vec3(0.0, 0.55, 0.30)) / 1.7, 0.0, 1.0);
    vCerca = cerca;
    float umbral = uDensity * 1.35 - (1.0 - cerca) * 0.35;
    vAlfa = aOrden < umbral ? 1.0 : 0.0;
    if (uCabeza < 0.5) vAlfa *= smoothstep(-0.35, 0.25, position.y);
    // en la cara, menos puntos: que se lea el relieve de la piel, no una nube
    if (uCabeza > 0.5) vAlfa *= 1.0 - 0.45 * clamp(position.z / 0.42, 0.0, 1.0);
    gl_PointSize = (aRegion < 0.5 || aRegion > 2.5 ? 2.3 : 2.0) * uDpr * (1.0 + uVoice * 0.35) * (9.0 / -mv.z) * (uLod > 1.5 ? 1.4 : 1.0);
  }`;
const PUNTOS_FRAG = /* glsl */ `
  precision highp float;
  in float vAlfa; in float vCerca;
  uniform float uPecho;
  out vec4 outColor;
  void main() {
    if (vAlfa < 0.01) discard;
    vec2 c = gl_PointCoord - 0.5; float d = length(c);
    if (d > 0.5) discard;
    float suave = smoothstep(0.5, 0.1, d);
    vec3 cian = vec3(0.36, 0.84, 1.0), blanco = vec3(0.92, 0.95, 1.0);
    vec3 col = mix(cian, blanco, vCerca * 0.55 * uPecho);
    outColor = vec4(col, suave * (0.14 + vCerca * 0.22) * vAlfa);
  }`;

// ── El componente ───────────────────────────────────────────────────────────

export default function AuraBeing() {
  const lod = useOs((s) => s.lod);
  const movil = useThree((s) => s.size.width < 720);
  const nCabeza = movil ? 12000 : lod === 0 ? 26000 : lod === 1 ? 16000 : 9000;
  const nTorso = movil ? 6000 : lod === 0 ? 14000 : lod === 1 ? 8000 : 5000;

  const { geoCabeza, geoTorso, alambreCabeza, alambreTorso } = useMemo(() => {
    const geoCabeza = esculpir(PERFIL_CABEZA, true); const geoTorso = esculpir(PERFIL_TORSO, false);
    const alambreCabeza = alambre(geoCabeza, PERFIL_CABEZA.length, 8, 2);
    const alambreTorso = alambre(geoTorso, PERFIL_TORSO.length, 6, 2);
    // la cabeza gira sobre la base del cuello
    for (const gg of [geoCabeza, alambreCabeza]) gg.translate(0, -PIVOTE_CABEZA, 0);
    return { geoCabeza, geoTorso, alambreCabeza, alambreTorso };
  }, []);
  const puntosCabeza = useMemo(() => {
    const geo = esculpir(PERFIL_CABEZA, true);
    const g2 = muestrear(geo, nCabeza, (p) => (Math.abs(p.x) > 0.3 && p.y > 1.45 && p.y < 1.78 ? 3 : 0));
    g2.translate(0, -PIVOTE_CABEZA, 0); return g2;
  }, [nCabeza]);
  const puntosTorso = useMemo(() => muestrear(esculpir(PERFIL_TORSO, false), nTorso, () => 2), [nTorso]);

  const uniformes = useMemo(() => ({
    uTime: { value: 0 }, uBreath: { value: 1 }, uVoice: { value: 0 }, uDensity: { value: 0 }, uSienes: { value: 1 }, uPecho: { value: 1 }, uLod: { value: lod }, uDpr: { value: 1 },
  }), [lod]);
  const mats = useMemo(() => {
    const puntos = (cabeza: boolean) => new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: PUNTOS_VERT, fragmentShader: PUNTOS_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { ...uniformes, uCabeza: { value: cabeza ? 1 : 0 } },
    });
    const piel = (cabeza: boolean) => new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: PIEL_VERT, fragmentShader: PIEL_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
      uniforms: { uDensity: uniformes.uDensity, uTime: uniformes.uTime, uCabeza: { value: cabeza ? 1 : 0 } },
    });
    return { pCabeza: puntos(true), pTorso: puntos(false), sCabeza: piel(true), sTorso: piel(false) };
  }, [uniformes]);

  // los filamentos: del núcleo a puntos del pecho
  const filamentos = useMemo(() => {
    const pos = puntosTorso.attributes.position as THREE.BufferAttribute;
    const arr: number[] = [];
    for (let i = 0; i < pos.count && arr.length < 150 * 6; i += Math.max(1, Math.floor(pos.count / 700))) {
      if (pos.getZ(i) > 0.12 && pos.getY(i) > 0.15 && pos.getY(i) < 0.75) arr.push(NUCLEO.x, NUCLEO.y, NUCLEO.z, pos.getX(i), pos.getY(i), pos.getZ(i));
    }
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); return gg;
  }, [puntosTorso]);

  const cabeza = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const ojoI = useRef<THREE.Mesh>(null); const ojoD = useRef<THREE.Mesh>(null);
  const nucleo = useRef<THREE.Mesh>(null); const halo = useRef<THREE.Sprite>(null);
  const filMat = useRef<THREE.LineBasicMaterial>(null);
  const pose = useRef(crearPose());
  const colorOjo = useMemo(() => new THREE.Color(), []);
  const alambreMaterial = useMemo(() => new THREE.LineBasicMaterial({ color: new THREE.Color(0.36, 0.84, 1), transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false }), []);

  useFrame((st, dt) => {
    const { mode, voiceLevel } = useOs.getState();
    const t = st.clock.elapsedTime;
    const P = pasoRig(pose.current, mode, Math.min(dt, 0.05));
    const u = uniformes;
    u.uTime.value = t; u.uDpr.value = st.gl.getPixelRatio();
    const breath = respiracion(t); u.uBreath.value = breath;
    u.uVoice.value = THREE.MathUtils.damp(u.uVoice.value, voiceLevel, 12, dt);
    u.uDensity.value = P.densidad; u.uSienes.value = P.sienes; u.uPecho.value = P.pecho;
    if (torso.current) torso.current.scale.y = breath;
    if (cabeza.current) {
      cabeza.current.position.y = PIVOTE_CABEZA * breath;
      cabeza.current.rotation.z = THREE.MathUtils.degToRad(-P.cabezaInclina) + Math.sin(t * 0.35) * 0.008;
      cabeza.current.rotation.x = THREE.MathUtils.degToRad(-P.cabezaBaja) + Math.sin(t * 0.27) * 0.006;
      cabeza.current.rotation.y = Math.sin(t * 0.21) * 0.03;
    }
    const abiertos = P.parpados * parpadeo(t) * Math.min(1, P.densidad * 1.4);
    colorOjo.setRGB(0.5 + P.ojosCalidos * 0.9, 2.2 + P.ojosCalidos * 0.4, 3.2).multiplyScalar(0.35 + P.densidad * 0.65);
    for (const o of [ojoI.current, ojoD.current]) if (o) { o.scale.set(1.05, Math.max(0.06, abiertos * 0.86), 0.85); (o.material as THREE.MeshBasicMaterial).color.copy(colorOjo); }
    if (nucleo.current) {
      const k = (0.75 + 0.25 * Math.sin(t * 1.5)) * P.pecho * (1 + u.uVoice.value * 0.5) * (0.2 + P.densidad * 0.8);
      nucleo.current.scale.setScalar(0.85 + k * 0.35);
      (nucleo.current.material as THREE.MeshBasicMaterial).color.setRGB(0.9 * k, 2.6 * k, 3.6 * k);
    }
    if (halo.current) { const k = P.pecho * (0.9 + u.uVoice.value * 0.8) * P.densidad; halo.current.scale.set(1.6 * k, 1.6 * k, 1); (halo.current.material as THREE.SpriteMaterial).opacity = 0.35 * k; }
    if (filMat.current) filMat.current.opacity = (0.06 + u.uVoice.value * 0.5) * P.densidad;
    alambreMaterial.opacity = 0.085 * P.densidad;
  });

  const haloTex = useMemo(() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d')!;
    const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(210,240,255,1)'); gr.addColorStop(0.35, 'rgba(93,214,255,.55)'); gr.addColorStop(1, 'rgba(27,107,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
  }, []);

  return (
    <group>
      {/* el torso: piel, puntos, alambre; respira en Y */}
      <group ref={torso}>
        <mesh geometry={geoTorso} material={mats.sTorso} frustumCulled={false} />
        <points geometry={puntosTorso} material={mats.pTorso} frustumCulled={false} />
        <lineSegments geometry={alambreTorso} material={alambreMaterial} />
      </group>
      {/* los filamentos del pecho */}
      <lineSegments geometry={filamentos}>
        <lineBasicMaterial ref={filMat} color={new THREE.Color(0.35, 0.8, 1)} transparent opacity={0.08} blending={THREE.AdditiveBlending} depthWrite={false} />
      </lineSegments>
      {/* la cabeza: gira entera sobre la base del cuello */}
      <group ref={cabeza} position={[0, PIVOTE_CABEZA, 0]}>
        <mesh geometry={geoCabeza} material={mats.sCabeza} frustumCulled={false} />
        <points geometry={puntosCabeza} material={mats.pCabeza} frustumCulled={false} />
        <lineSegments geometry={alambreCabeza} material={alambreMaterial} />
        <mesh ref={ojoI} position={[OJO_I.x, OJO_I.y - PIVOTE_CABEZA, OJO_I.z]}>
          <sphereGeometry args={[0.04, 20, 20]} />
          <meshBasicMaterial toneMapped={false} color={new THREE.Color(0.5, 2.2, 3.2)} />
        </mesh>
        <mesh ref={ojoD} position={[OJO_D.x, OJO_D.y - PIVOTE_CABEZA, OJO_D.z]}>
          <sphereGeometry args={[0.04, 20, 20]} />
          <meshBasicMaterial toneMapped={false} color={new THREE.Color(0.5, 2.2, 3.2)} />
        </mesh>
      </group>
      {/* el núcleo del pecho, que florece con la voz */}
      <mesh ref={nucleo} position={NUCLEO}>
        <sphereGeometry args={[0.075, 24, 24]} />
        <meshBasicMaterial toneMapped={false} color={new THREE.Color(0.9, 2.6, 3.6)} />
      </mesh>
      <sprite ref={halo} position={NUCLEO}>
        <spriteMaterial map={haloTex} transparent opacity={0.35} blending={THREE.AdditiveBlending} depthWrite={false} />
      </sprite>
    </group>
  );
}
