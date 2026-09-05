'use client';
// LA LLUVIA DE CÓDIGO. Un solo `Points` con un atlas de glifos: cada punto
// elige su glifo por atributo y cae por su columna. 12 mil en escritorio, 6 mil
// en teléfono, un draw call. Tenue a propósito: es fondo, no protagonista.
import { useFrame, useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { useOs } from '@/lib/os-store';

const GLIFOS = '0123456789ABCDEF·ORIGEN5550';
const VERT = /* glsl */ `
  in float aGlifo; in float aVel; in float aBrillo; in float aFase;
  uniform float uTime;
  out float vGlifo; out float vBrillo;
  void main() {
    vec3 p = position;
    // cae y vuelve arriba: 12 unidades de alto
    p.y = 6.0 - mod(6.0 - p.y + uTime * aVel + aFase, 12.0);
    vGlifo = aGlifo; vBrillo = aBrillo;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = 26.0 * (300.0 / -mv.z) / 100.0 * 1.9;
  }`;
const FRAG = /* glsl */ `
  precision highp float;
  in float vGlifo; in float vBrillo;
  uniform sampler2D uAtlas; uniform float uN;
  out vec4 outColor;
  void main() {
    vec2 uv = gl_PointCoord; uv.y = 1.0 - uv.y;
    uv.x = (uv.x + vGlifo) / uN;
    float a = texture(uAtlas, uv).a;
    if (a < 0.2) discard;
    vec3 col = mix(vec3(0.2, 0.55, 0.85), vec3(0.6, 0.9, 1.0), vBrillo);
    outColor = vec4(col, a * (0.06 + vBrillo * 0.18));
  }`;

export default function CodeRain() {
  const lod = useOs((s) => s.lod);
  const movil = useThree((s) => s.size.width < 720);
  const n = movil ? 6000 : lod > 1 ? 4000 : 12000;
  const atlas = useMemo(() => {
    const c = document.createElement('canvas'); c.width = 32 * GLIFOS.length; c.height = 32;
    const x = c.getContext('2d')!; x.fillStyle = '#fff'; x.font = '600 26px "JetBrains Mono", ui-monospace, monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (let i = 0; i < GLIFOS.length; i++) x.fillText(GLIFOS[i], i * 32 + 16, 17);
    const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter; return t;
  }, []);
  const geo = useMemo(() => {
    const pos = new Float32Array(n * 3), glifo = new Float32Array(n), vel = new Float32Array(n), brillo = new Float32Array(n), fase = new Float32Array(n);
    let s = 777; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const columnas = Math.floor(n / 40);
    for (let i = 0; i < n; i++) {
      const col = i % columnas;
      const x = -8 + (col / columnas) * 16 + (rnd() - 0.5) * 0.05;
      pos.set([x, (rnd() - 0.5) * 12, -3.5 - rnd() * 3], i * 3);
      glifo[i] = Math.floor(rnd() * GLIFOS.length); vel[i] = 0.25 + (col % 7) * 0.09; brillo[i] = rnd() < 0.06 ? 1 : rnd() * 0.35; fase[i] = rnd() * 12;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aGlifo', new THREE.BufferAttribute(glifo, 1));
    g.setAttribute('aVel', new THREE.BufferAttribute(vel, 1)); g.setAttribute('aBrillo', new THREE.BufferAttribute(brillo, 1)); g.setAttribute('aFase', new THREE.BufferAttribute(fase, 1));
    return g;
  }, [n]);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uAtlas: { value: atlas }, uN: { value: GLIFOS.length } },
  }), [atlas]);
  useFrame((st) => { mat.uniforms.uTime.value = st.clock.elapsedTime; });
  return <points geometry={geo} material={mat} frustumCulled={false} />;
}
