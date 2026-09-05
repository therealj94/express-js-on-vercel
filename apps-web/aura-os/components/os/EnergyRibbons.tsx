'use client';
// LAS CINTAS DE ENERGÍA: seda en agua, envolviendo el torso.
//
// Cinco tubos sobre curvas cerradas alrededor del pecho, UN material: la
// misma banda de luz corre por las cinco con fases distintas. Se mueven en el
// shader (no se reconstruye geometría en cada cuadro). Pensando, una se
// enrolla; escuchando, se abren.
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { crearPose, pasoRig } from '@/lib/aura-rig';
import { useOs } from '@/lib/os-store';

const VERT = /* glsl */ `
  uniform float uTime;
  out vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    // seda en agua: una ondulación lenta a lo largo, otra por ancho
    p += normal * (sin(uTime * 0.8 + uv.x * 12.566) * 0.03 + cos(uTime * 0.5 + uv.x * 6.283) * 0.02);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const FRAG = /* glsl */ `
  precision highp float;
  in vec2 vUv;
  uniform float uTime, uFase, uBrillo;
  out vec4 outColor;
  void main() {
    // la banda de luz que recorre la cinta
    float banda = pow(0.5 + 0.5 * sin(vUv.x * 6.283 * 2.0 - uTime * 1.6 + uFase), 6.0);
    float borde = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.75, vUv.y);
    vec3 cian = vec3(0.36, 0.84, 1.0), blanco = vec3(0.85, 0.95, 1.0);
    vec3 col = mix(cian, blanco, banda) * (0.35 + banda * 2.2) * uBrillo;
    outColor = vec4(col, borde * (0.18 + banda * 0.55));
  }`;

function curva(i: number): THREE.CatmullRomCurve3 {
  const pts: THREE.Vector3[] = [];
  const N = 24, fase = (i / 5) * Math.PI * 2;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2 + fase;
    const r = 0.95 + 0.18 * Math.sin(a * 2 + i);
    // cada cinta vive a una altura, y sube y baja como una hélice suelta
    const y = 0.25 + i * 0.16 + 0.22 * Math.sin(a * 1.5 + i * 1.3);
    pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r * 0.6));
  }
  return new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.6);
}

export default function EnergyRibbons() {
  const lod = useOs((s) => s.lod);
  const geos = useMemo(() => Array.from({ length: 5 }, (_, i) => new THREE.TubeGeometry(curva(i), lod > 1 ? 90 : 160, 0.022, lod > 1 ? 4 : 6, true)), [lod]);
  const mats = useMemo(() => Array.from({ length: 5 }, (_, i) => new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uFase: { value: (i / 5) * Math.PI * 2 }, uBrillo: { value: 0 } },
  })), []);
  const grupo = useRef<THREE.Group>(null);
  const cintas = useRef<(THREE.Mesh | null)[]>([]);
  const pose = useRef(crearPose());

  useFrame((st, dt) => {
    const { mode } = useOs.getState();
    const P = pasoRig(pose.current, mode, Math.min(dt, 0.05));
    const t = st.clock.elapsedTime;
    if (grupo.current) grupo.current.rotation.y = t * 0.06;
    mats.forEach((m, i) => {
      m.uniforms.uTime.value = t;
      m.uniforms.uBrillo.value = 0.25 + P.densidad * 0.75;
      const c = cintas.current[i]; if (!c) return;
      // la primera se enrolla pensando; todas se abren escuchando
      const enrolla = i === 0 ? 1 - P.cintaEnrolla * 0.28 : 1;
      const abre = 1 + P.cintasAbren * 0.14;
      const e = enrolla * abre;
      c.scale.set(THREE.MathUtils.damp(c.scale.x, e, 4, dt), 1, THREE.MathUtils.damp(c.scale.z, e, 4, dt));
    });
  });

  return (
    <group ref={grupo}>
      {geos.map((g, i) => (
        <mesh key={i} ref={(el) => { cintas.current[i] = el; }} geometry={g} material={mats[i]} frustumCulled={false} />
      ))}
    </group>
  );
}
