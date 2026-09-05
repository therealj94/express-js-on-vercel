'use client';
// EL SER. La figura de la imagen: cabeza calva luminosa, ojos cian calmos,
// cuerpo de partículas translúcido con filamentos hacia el núcleo del pecho.
//
// Se recrea PROCEDURALMENTE: la cabeza, el cuello y los hombros son
// superficies muestreadas con temblor, y los ojos son dos huecos en la
// densidad más dos brasas. Un solo `Points` con su shader es un solo draw call
// para 18–40 mil puntos; los ojos, el núcleo y los filamentos son cuatro más.
//
// DÓNDE ENTRA UN ROSTRO EN GLB MÁS ADELANTE: `muestrearCuerpo()` devuelve las
// posiciones; el día que haya un rig facial, se muestrea su malla en vez de
// las elipsoides y todo lo demás —shader, ojos, párpados, rig— sigue igual.
import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { crearPose, parpadeo, pasoRig, respiracion } from '@/lib/aura-rig';
import { useOs } from '@/lib/os-store';

const OJO_I = new THREE.Vector3(-0.15, 1.6, 0.36);
const OJO_D = new THREE.Vector3(0.15, 1.6, 0.36);
export const NUCLEO = new THREE.Vector3(0, 0.55, 0.28);

/** Muestrea las superficies del ser: cabeza, cuello, hombros. Determinista. */
export function muestrearCuerpo(n: number) {
  const pos = new Float32Array(n * 3), fase = new Float32Array(n), region = new Float32Array(n), orden = new Float32Array(n);
  // un generador propio, para que la figura sea LA MISMA en cada carga
  let s = 1234567; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const p = new THREE.Vector3();
  let i = 0;
  const poner = (reg: number) => {
    pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
    fase[i] = rnd() * Math.PI * 2; region[i] = reg; orden[i] = rnd(); i++;
  };
  const enElipsoide = (cx: number, cy: number, cz: number, rx: number, ry: number, rz: number) => {
    // punto en la superficie, con temblor hacia adentro: alambre de partículas
    const u = rnd() * Math.PI * 2, v = Math.acos(2 * rnd() - 1);
    const temblor = 1 - Math.pow(rnd(), 3) * 0.12;
    p.set(cx + rx * temblor * Math.sin(v) * Math.cos(u), cy + ry * temblor * Math.cos(v), cz + rz * temblor * Math.sin(v) * Math.sin(u));
  };
  while (i < n) {
    const r = rnd();
    if (r < 0.42) {
      // la cabeza: sin pelo, con la mandíbula un poco más estrecha
      enElipsoide(0, 1.55, 0, 0.42, 0.5, 0.45);
      if (p.y < 1.35) p.x *= 0.88 + (p.y - 1.05) * 0.4;
      // las cuencas: nada de puntos donde van los ojos, para que se lean
      if (p.distanceTo(OJO_I) < 0.1 || p.distanceTo(OJO_D) < 0.1) continue;
      if (p.z < -0.1 && rnd() < 0.35) continue;   // la nuca, más rala
      const sien = Math.abs(p.x) > 0.3 && p.y > 1.45 && p.y < 1.75 ? 3 : 0;
      poner(sien);
    } else if (r < 0.47) {
      const a = rnd() * Math.PI * 2, y = 1.02 + rnd() * 0.24;
      p.set(Math.cos(a) * 0.14, y, Math.sin(a) * 0.14 + 0.02); poner(1);
    } else {
      enElipsoide(0, 0.35, 0, 0.95, 0.78, 0.46);
      if (p.y < -0.3 || (p.y < -0.05 && rnd() < (-p.y) * 1.6)) continue;   // se disuelve hacia abajo
      if (p.y > 0.9 && Math.abs(p.x) < 0.2) continue;                       // el hueco del cuello
      poner(2);
    }
  }
  return { pos, fase, region, orden };
}

const VERT = /* glsl */ `
  in float aFase; in float aRegion; in float aOrden;
  uniform float uTime, uBreath, uVoice, uDensity, uSienes, uLod, uDpr;
  out float vAlfa; out float vCerca;
  void main() {
    vec3 p = position;
    // la respiración: solo el torso, en Y, desde el pecho
    if (aRegion > 1.5 && aRegion < 2.5) p.y = 0.55 + (p.y - 0.55) * uBreath;
    // la deriva: cada punto vive alrededor de su casa
    float v = aRegion > 2.5 ? uSienes : 1.0;
    p.x += sin(uTime * 0.7 * v + aFase) * 0.012;
    p.y += cos(uTime * 0.55 * v + aFase * 1.3) * 0.012;
    p.z += sin(uTime * 0.6 * v + aFase * 0.7) * 0.010;
    // la voz: los filamentos del pecho laten
    if (aRegion > 1.5 && aRegion < 2.5) p.z += uVoice * 0.04 * sin(uTime * 9.0 + aFase);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float cerca = 1.0 - clamp(distance(p, vec3(0.0, 0.55, 0.28)) / 1.6, 0.0, 1.0);
    vCerca = cerca;
    // el boot: la densidad sube desde el pecho hacia afuera
    float umbral = uDensity * 1.35 - (1.0 - cerca) * 0.35;
    vAlfa = aOrden < umbral ? 1.0 : 0.0;
    // puntos de dos o tres píxeles: alambre de partículas, no una masa
    gl_PointSize = (aRegion < 0.5 || aRegion > 2.5 ? 2.4 : 2.0) * uDpr * (1.0 + uVoice * 0.35) * (9.0 / -mv.z) * (uLod > 1.5 ? 1.4 : 1.0);
  }`;
const FRAG = /* glsl */ `
  precision highp float;
  in float vAlfa; in float vCerca;
  uniform float uPecho;
  out vec4 outColor;
  void main() {
    if (vAlfa < 0.5) discard;
    vec2 c = gl_PointCoord - 0.5; float d = length(c);
    if (d > 0.5) discard;
    float suave = smoothstep(0.5, 0.1, d);
    vec3 cian = vec3(0.36, 0.84, 1.0), blanco = vec3(0.92, 0.95, 1.0);
    vec3 col = mix(cian, blanco, vCerca * 0.55 * uPecho);
    outColor = vec4(col, suave * (0.16 + vCerca * 0.24));
  }`;

export default function AuraBeing() {
  const lod = useOs((s) => s.lod);
  const movil = useThree((s) => s.size.width < 720);
  const n = movil ? 18000 : lod === 0 ? 40000 : lod === 1 ? 24000 : 14000;
  const datos = useMemo(() => muestrearCuerpo(n), [n]);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(datos.pos, 3));
    g.setAttribute('aFase', new THREE.BufferAttribute(datos.fase, 1));
    g.setAttribute('aRegion', new THREE.BufferAttribute(datos.region, 1));
    g.setAttribute('aOrden', new THREE.BufferAttribute(datos.orden, 1));
    return g;
  }, [datos]);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uBreath: { value: 1 }, uVoice: { value: 0 }, uDensity: { value: 0 }, uSienes: { value: 1 }, uPecho: { value: 1 }, uLod: { value: lod }, uDpr: { value: 1 } },
  }), [lod]);

  // los filamentos: del núcleo a puntos del pecho
  const filamentos = useMemo(() => {
    const idx: number[] = [];
    for (let i = 0; i < n && idx.length < 140; i += Math.max(1, Math.floor(n / 900))) {
      if (datos.region[i] === 2 && datos.pos[i * 3 + 2] > 0.05 && datos.pos[i * 3 + 1] > 0.05) idx.push(i);
    }
    const arr = new Float32Array(idx.length * 6);
    idx.forEach((i, k) => { arr.set([NUCLEO.x, NUCLEO.y, NUCLEO.z, datos.pos[i * 3], datos.pos[i * 3 + 1], datos.pos[i * 3 + 2]], k * 6); });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3)); return g;
  }, [datos, n]);

  const cabeza = useRef<THREE.Group>(null);
  const ojoI = useRef<THREE.Mesh>(null); const ojoD = useRef<THREE.Mesh>(null);
  const nucleo = useRef<THREE.Mesh>(null); const halo = useRef<THREE.Sprite>(null);
  const filMat = useRef<THREE.LineBasicMaterial>(null);
  const pose = useRef(crearPose());
  const colorOjo = useMemo(() => new THREE.Color(), []);

  useFrame((st, dt) => {
    const { mode, voiceLevel } = useOs.getState();
    const t = st.clock.elapsedTime;
    const P = pasoRig(pose.current, mode, Math.min(dt, 0.05));
    mat.uniforms.uTime.value = t;
    mat.uniforms.uDpr.value = st.gl.getPixelRatio();
    mat.uniforms.uBreath.value = respiracion(t);
    mat.uniforms.uVoice.value = THREE.MathUtils.damp(mat.uniforms.uVoice.value, voiceLevel, 12, dt);
    mat.uniforms.uDensity.value = P.densidad;
    mat.uniforms.uSienes.value = P.sienes;
    mat.uniforms.uPecho.value = P.pecho;
    if (cabeza.current) {
      cabeza.current.rotation.z = THREE.MathUtils.degToRad(-P.cabezaInclina) + Math.sin(t * 0.35) * 0.008;
      cabeza.current.rotation.x = THREE.MathUtils.degToRad(-P.cabezaBaja) + Math.sin(t * 0.27) * 0.006;
    }
    const abiertos = P.parpados * parpadeo(t) * Math.min(1, P.densidad * 1.4);
    colorOjo.setRGB(0.5 + P.ojosCalidos * 0.9, 2.2 + P.ojosCalidos * 0.4, 3.2).multiplyScalar(0.35 + P.densidad * 0.65);
    for (const o of [ojoI.current, ojoD.current]) if (o) { o.scale.set(1, Math.max(0.08, abiertos), 1); (o.material as THREE.MeshBasicMaterial).color.copy(colorOjo); }
    if (nucleo.current) {
      const k = (0.75 + 0.25 * Math.sin(t * 1.5)) * P.pecho * (1 + mat.uniforms.uVoice.value * 0.5) * (0.2 + P.densidad * 0.8);
      nucleo.current.scale.setScalar(0.85 + k * 0.35);
      (nucleo.current.material as THREE.MeshBasicMaterial).color.setRGB(0.9 * k, 2.6 * k, 3.6 * k);
    }
    if (halo.current) { const k = P.pecho * (0.9 + mat.uniforms.uVoice.value * 0.8) * P.densidad; halo.current.scale.set(1.6 * k, 1.6 * k, 1); (halo.current.material as THREE.SpriteMaterial).opacity = 0.35 * k; }
    if (filMat.current) filMat.current.opacity = (0.06 + mat.uniforms.uVoice.value * 0.5) * P.densidad;
  });

  const haloTex = useMemo(() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d')!;
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(210,240,255,1)'); g.addColorStop(0.35, 'rgba(93,214,255,.55)'); g.addColorStop(1, 'rgba(27,107,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128); const tx = new THREE.CanvasTexture(c); return tx;
  }, []);

  return (
    <group>
      {/* el cuerpo entero (cabeza incluida): un draw call */}
      <points geometry={geo} material={mat} frustumCulled={false} />
      {/* los filamentos del pecho */}
      <lineSegments geometry={filamentos}>
        <lineBasicMaterial ref={filMat} color={new THREE.Color(0.35, 0.8, 1)} transparent opacity={0.08} blending={THREE.AdditiveBlending} depthWrite={false} />
      </lineSegments>
      {/* la cabeza gira como grupo: los ojos van con ella */}
      <group ref={cabeza} position={[0, 1.55, 0]}>
        <mesh ref={ojoI} position={[OJO_I.x, OJO_I.y - 1.55, OJO_I.z]}>
          <sphereGeometry args={[0.048, 20, 20]} />
          <meshBasicMaterial toneMapped={false} color={new THREE.Color(0.5, 2.2, 3.2)} />
        </mesh>
        <mesh ref={ojoD} position={[OJO_D.x, OJO_D.y - 1.55, OJO_D.z]}>
          <sphereGeometry args={[0.048, 20, 20]} />
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
