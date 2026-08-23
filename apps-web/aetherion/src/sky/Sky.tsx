import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { sim, PALETTES, easeOutCubic, norm } from '../kernel/sim'
import { rig } from '../kernel/rig'
import { GALAXY } from './galaxy'
import { WELL_DEFS, WellField } from './Wells'
import { Core } from './Core'
import { DustLayer } from './Dust'
import { getRadialTexture, getFlareTexture } from './textures'
import { useUiStore } from '../state/uiStore'

function Filaments() {
  const matRef = useRef<THREE.LineBasicMaterial>(null)

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(GALAXY.segs, 3))
    g.setAttribute('color', new THREE.BufferAttribute(GALAXY.cols, 3))
    return g
  }, [])

  const mat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    []
  )

  useFrame(() => {
    mat.color.copy(sim.mareaColor)
    mat.opacity = 0.55 * sim.intro * (1 - 0.45 * sim.eclipse)
    matRef.current = mat
  })

  return <lineSegments geometry={geo} material={mat} frustumCulled={false} />
}

function Nebulae() {
  const tex = getRadialTexture()
  const g1 = useRef<THREE.Mesh>(null)
  const g2 = useRef<THREE.Mesh>(null)
  useFrame((_, dt) => {
    if (g1.current) g1.current.rotation.z += dt * 0.008
    if (g2.current) g2.current.rotation.z -= dt * 0.006
  })
  const mkMat = (op: number) => (
    <meshBasicMaterial
      map={tex}
      color="#3a5cff"
      transparent
      opacity={op}
      depthWrite={false}
      blending={THREE.AdditiveBlending}
    />
  )
  return (
    <>
      <mesh ref={g1} rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.5, 0]}>
        <planeGeometry args={[46, 46]} />
        {mkMat(0.16)}
      </mesh>
      <mesh ref={g2} rotation={[-Math.PI / 2 + 0.12, 0.3, 0]} position={[3, -0.8, -4]}>
        <planeGeometry args={[30, 30]} />
        {mkMat(0.12)}
      </mesh>
    </>
  )
}

function TuLuz() {
  const sprite = useRef<THREE.Sprite>(null)
  const camera = useThree((s) => s.camera)
  const ray = useMemo(() => new THREE.Raycaster(), [])
  const ndc = useMemo(() => new THREE.Vector2(), [])
  const target = useMemo(() => new THREE.Vector3(0, 0, 8), [])
  const pos = useMemo(() => new THREE.Vector3(0, 0, 8), [])

  const TRAIL_N = 40
  const trailGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 3), 3))
    g.setAttribute('aAge', new THREE.BufferAttribute(new Float32Array(TRAIL_N), 1))
    return g
  }, [])
  const trailMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: new THREE.Color('#ffd98a') }, uOpacity: { value: 0 } },
        vertexShader: /* glsl */ `
          attribute float aAge;
          varying float vA;
          void main(){
            vA = 1.0 - aAge;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = (10.0 * vA + 2.0) / max(1.0, -mv.z) * 20.0;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          uniform float uOpacity;
          varying float vA;
          void main(){
            vec2 c = gl_PointCoord - 0.5;
            float r2 = dot(c,c);
            if(r2 > 0.25) discard;
            gl_FragColor = vec4(uColor, smoothstep(0.25, 0.0, r2) * vA * uOpacity);
          }
        `,
      }),
    []
  )
  const head = useRef(0)
  const acc = useRef(0)

  useFrame((_, dt) => {
    ndc.copy(sim.pointer)
    ray.setFromCamera(ndc, camera as THREE.Camera)
    const o = ray.ray.origin
    const d = ray.ray.direction
    if (Math.abs(d.y) > 1e-4) {
      const t = -o.y / d.y
      if (t > 0 && t < 120) target.copy(o).addScaledVector(d, t)
      else target.copy(o).addScaledVector(d, 16)
    } else {
      target.copy(o).addScaledVector(d, 16)
    }
    target.clampLength(0, 34)
    pos.lerp(target, 1 - Math.exp(-9 * dt))
    sim.tuLuz.lerp(pos, 1 - Math.exp(-9 * dt))

    const idle = Math.min(1, Math.max(0, (sim.now - sim.pointerMovedAt - 3) / 2))
    if (sprite.current) {
      sprite.current.position.copy(sim.tuLuz)
      const s = 0.85 * (1 - 0.45 * idle) * (0.7 + 0.3 * sim.intro)
      sprite.current.scale.setScalar(s)
      ;(sprite.current.material as THREE.SpriteMaterial).opacity =
        (0.95 - 0.5 * idle) * sim.intro
    }

    acc.current += dt
    if (acc.current > 0.05) {
      acc.current = 0
      const attr = trailGeo.getAttribute('position') as THREE.BufferAttribute
      const ages = trailGeo.getAttribute('aAge') as THREE.BufferAttribute
      head.current = (head.current + 1) % TRAIL_N
      attr.setXYZ(head.current, sim.tuLuz.x, sim.tuLuz.y, sim.tuLuz.z)
      for (let i = 0; i < TRAIL_N; i++) {
        ages.setX(i, Math.min(1, ages.getX(i) + 0.06))
      }
      ages.setX(head.current, 0)
      attr.needsUpdate = true
      ages.needsUpdate = true
    }
    trailMat.uniforms.uOpacity.value = 0.4 * sim.intro
  })

  return (
    <>
      <points geometry={trailGeo} material={trailMat} frustumCulled={false} />
      <sprite ref={sprite}>
        <spriteMaterial
          map={getFlareTexture()}
          color="#ffd98a"
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
    </>
  )
}

function TideAndIntro() {
  const scene = useThree((s) => s.scene)
  const started = useRef(false)
  const palColors = useMemo(
    () => ({
      alba: { f: new THREE.Color(PALETTES.alba.filament), d: new THREE.Color(PALETTES.alba.dust) },
      pleamar: {
        f: new THREE.Color(PALETTES.pleamar.filament),
        d: new THREE.Color(PALETTES.pleamar.dust),
      },
      bajamar: {
        f: new THREE.Color(PALETTES.bajamar.filament),
        d: new THREE.Color(PALETTES.bajamar.dust),
      },
    }),
    []
  )
  useFrame(() => {
    if (!started.current) {
      started.current = true
      rig.radius = 64
      rig.tRadius = 26
    }
    const marea = useUiStore.getState().marea
    const pal = PALETTES[marea]
    const cols = palColors[marea]
    const k = 1 - Math.exp(-2.2 * sim.dt)
    sim.mareaColor.lerp(cols.f, k)
    sim.dustColor.lerp(cols.d, k)
    sim.fogDensity += (pal.fog - sim.fogDensity) * k
    sim.expoMul += (pal.expo - sim.expoMul) * k

    const fog = scene.fog as THREE.FogExp2 | null
    if (fog) {
      fog.color.copy(sim.mareaColor).multiplyScalar(0.08)
      fog.density = sim.fogDensity
    }

    sim.intro = easeOutCubic(norm(sim.now, 0.35, 3.1))
  })
  return null
}

export function Sky() {
  return (
    <>
      <TideAndIntro />
      <Nebulae />
      <Filaments />
      <DustLayer count={14000} spread={30} yFlat={6} size={1.1} opacity={0.75} />
      <DustLayer count={9000} spread={70} yFlat={14} size={0.7} opacity={0.4} dim={0.7} />
      <Core />
      <WellField defs={WELL_DEFS} />
      <TuLuz />
    </>
  )
}
