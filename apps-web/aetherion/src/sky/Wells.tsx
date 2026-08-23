import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { sim } from '../kernel/sim'
import { useUiStore } from '../state/uiStore'
import { atmosphereFragment, atmosphereVertex } from '../shaders/shared'
import { getRingTexture } from './textures'
import type { Galaxy } from './lattice'

export type Archetype = 'pulsar' | 'binary' | 'memory' | 'torus' | 'sentinel'

export interface ArchetypeInfo {
  label: string
  colorA: string
  colorB: string
  radius: number
}

export const ARCHETYPES: Record<Archetype, ArchetypeInfo> = {
  pulsar: { label: 'Pulsar de Creación', colorA: '#6fe0ff', colorB: '#ffffff', radius: 0.6 },
  binary: { label: 'Binaria de Vínculo', colorA: '#ff9db4', colorB: '#8fb7ff', radius: 0.55 },
  memory: { label: 'Archivo de Memoria', colorA: '#b48cff', colorB: '#16121f', radius: 0.68 },
  torus: { label: 'Toroide de Flujo', colorA: '#ffc978', colorB: '#241a10', radius: 0.7 },
  sentinel: { label: 'Centinela', colorA: '#ffd98a', colorB: '#2a2416', radius: 0.42 },
}

export const MODULES: Record<Archetype, string[]> = {
  pulsar: ['Componer', 'Estructurar', 'Fluir'],
  binary: ['Bandeja', 'Escribir', 'Archivar'],
  memory: ['Momentos', 'Colecciones', 'Buscar'],
  torus: ['Reproduciendo', 'Descubrir', 'Cola'],
  sentinel: ['Identidad', 'Llaves', 'Registro'],
}

export interface WellDef {
  key: string
  name: string
  intent: string
  arch: Archetype
  anchor: THREE.Vector3
  pathIdx: number
  t: number
  scale: number
  pending: number
}

/* LA FUSIÓN CON ORDEN GLOBAL. Los pozos son las casas REALES del ecosistema:
   la `key` es el id que la wallet reconoce (VETA.nuAbrir), el nombre es la
   marca tal cual, y el propósito habla el idioma de la persona (la wallet lo
   pasa en window.__AE_LANG antes de montar). Los arquetipos se eligieron por
   carácter: la wallet es el púlsar que late en el centro, el chat es una
   binaria (dos que se hablan), la banca y el explorador son memoria (el
   libro), el comercio y el cambio son toros (flujo que circula), y la
   identidad y los ajustes son centinelas. */
const EN = typeof window !== 'undefined' && (window as any).__AE_LANG === 'en'

const WELL_NAMES: Array<{ key: string; name: string; intent: string; arch: Archetype }> = [
  { key: 'wallet', name: 'Veta Wallet', arch: 'pulsar',
    intent: EN ? 'Your gold made money' : 'Tu oro hecho dinero' },
  { key: 'chat', name: 'PULSE2CHAT', arch: 'binary',
    intent: EN ? 'The living word of the ecosystem' : 'La palabra viva del ecosistema' },
  { key: 'pay', name: 'MyTokenPay', arch: 'torus',
    intent: EN ? 'Charges and commerce' : 'Cobros y comercio' },
  { key: 'gid', name: 'Genesis ID', arch: 'sentinel',
    intent: EN ? 'Your identity, verified once' : 'Tu identidad, verificada una vez' },
  { key: 'scan', name: 'ORDENSCAN', arch: 'memory',
    intent: EN ? 'The chain, in plain sight' : 'La cadena, a la vista' },
  { key: 'aucorp', name: 'AuCorp', arch: 'memory',
    intent: EN ? 'Local-currency banking' : 'La banca en moneda local' },
  { key: 'oxch', name: 'Ordenex', arch: 'torus',
    intent: EN ? 'The exchange house' : 'La casa de cambio' },
  { key: 'ajustes', name: EN ? 'Settings' : 'Ajustes', arch: 'sentinel',
    intent: EN ? 'The system lighthouse' : 'El faro del sistema' },
]

export function buildWellDefs(gal: Galaxy): WellDef[] {
  return WELL_NAMES.map((w, i) => {
    const node = gal.wells[i % gal.wells.length]
    return {
      key: w.key,
      name: w.name,
      intent: w.intent,
      arch: w.arch,
      anchor: node.pos.clone(),
      pathIdx: node.pathIdx,
      t: node.t,
      scale: 0.85 + ((i * 37) % 40) / 100,
      pending: 0,
    }
  })
}

/* La constante que Sky, Pulses y Overlays esperan: los pozos ya puestos sobre
   la galaxia de semilla fija. (El código llegó importándola sin que existiera:
   este export ES el arreglo.) */
import { GALAXY } from './galaxy'
export const WELL_DEFS: WellDef[] = buildWellDefs(GALAXY)

export interface WellHandle {
  def: WellDef
  getPos: () => THREE.Vector3
  radius: number
  atmo: THREE.ShaderMaterial
  hit: THREE.Mesh
}

export const wellRegistry = new Map<string, WellHandle>()

const tmpV = new THREE.Vector3()

function makeAtmoMaterial(color: string, density: number) {
  return new THREE.ShaderMaterial({
    vertexShader: atmosphereVertex(),
    fragmentShader: atmosphereFragment(),
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uTime: { value: 0 },
      uDensity: { value: density },
      uBoost: { value: 0 },
    },
  })
}

function WellView({ def }: { def: WellDef }) {
  const arch = ARCHETYPES[def.arch]
  const group = useRef<THREE.Group>(null!)
  const spin = useRef<THREE.Group>(null!)
  const counter = useRef<THREE.Group>(null)
  const hit = useRef<THREE.Mesh>(null!)
  const halo = useRef<THREE.Sprite>(null)
  const arcMat = useRef<THREE.MeshBasicMaterial>(null)
  const jets = useRef<THREE.Group>(null)

  const selected = useUiStore((s) => s.selectedId === def.key)

  const atmo = useMemo(() => makeAtmoMaterial(arch.colorA, 0.5), [arch.colorA])
  const atmoGeo = useMemo(
    () => new THREE.SphereGeometry(arch.radius * def.scale * 1.55, 32, 32),
    [arch.radius, def.scale]
  )
  const arcGeo = useMemo(() => {
    if (def.arch !== 'binary') return null
    return new THREE.TubeGeometry(
      new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(-0.52 * def.scale, 0, 0),
        new THREE.Vector3(0, 0.6 * def.scale, 0),
        new THREE.Vector3(0.52 * def.scale, 0, 0)
      ),
      24,
      0.028,
      6,
      false
    )
  }, [def.arch, def.scale])
  const hitGeo = useMemo(
    () => new THREE.SphereGeometry(1.2 * def.scale, 12, 12),
    [def.scale]
  )
  const seed = useMemo(() => Math.random() * 10, [])

  useEffect(() => {
    wellRegistry.set(def.key, {
      def,
      getPos: () => group.current.position,
      radius: arch.radius * def.scale,
      atmo,
      hit: hit.current,
    })
    return () => {
      wellRegistry.delete(def.key)
    }
  }, [def, arch, atmo])

  useFrame((_, dt) => {
    const g = group.current
    if (!g) return
    const bob = Math.sin(sim.now * 0.5 + seed) * 0.16
    tmpV.copy(sim.tuLuz).sub(def.anchor)
    const dist = tmpV.length()
    const falloff = Math.max(0, 1 - dist / 14)
    tmpV.normalize().multiplyScalar(0.3 * falloff)
    g.position.set(
      def.anchor.x + tmpV.x,
      def.anchor.y + bob + tmpV.y * 0.5,
      def.anchor.z + tmpV.z
    )

    if (spin.current) {
      const speed =
        def.arch === 'torus' ? 0.7 : def.arch === 'pulsar' ? 0.35 : def.arch === 'sentinel' ? 0.12 : 0.2
      spin.current.rotation.y += dt * speed
      if (def.arch === 'torus') spin.current.rotation.x = 1.15
    }
    if (counter.current) counter.current.rotation.y -= dt * 1.6
    if (jets.current) {
      const p = 1 + Math.sin(sim.now * 2.2 + seed) * 0.12
      jets.current.scale.set(1, p, 1)
    }

    atmo.uniforms.uTime.value = sim.now
    const boostT = selected ? 0.55 : 0
    atmo.uniforms.uBoost.value = THREE.MathUtils.damp(
      atmo.uniforms.uBoost.value,
      boostT,
      6,
      dt
    )

    if (arcMat.current) {
      const base = def.pending > 0 ? 0.5 : 0.18
      arcMat.current.opacity =
        base + (def.pending > 0 ? Math.sin(sim.now * 3 + seed) * 0.15 + 0.15 : 0)
    }

    if (halo.current) {
      halo.current.visible = selected
      if (selected) {
        const s = 2.4 * def.scale * (1 + Math.sin(sim.now * 3.4) * 0.06)
        halo.current.scale.setScalar(s)
        ;(halo.current.material as THREE.SpriteMaterial).opacity =
          0.7 + Math.sin(sim.now * 3.4) * 0.2
      }
    }
  })

  return (
    <group ref={group} position={def.anchor}>
      <mesh ref={hit} geometry={hitGeo} userData={{ wellId: def.key }}>
        <meshBasicMaterial colorWrite={false} depthWrite={false} />
      </mesh>
      <mesh geometry={atmoGeo} material={atmo} />
      <sprite ref={halo} visible={selected}>
        <spriteMaterial
          map={getRingTexture()}
          color="#9fdcff"
          transparent
          opacity={0.8}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>

      <group ref={spin}>
        {def.arch === 'pulsar' && (
          <>
            <mesh>
              <sphereGeometry args={[arch.radius * def.scale * 0.55, 32, 32]} />
              <meshBasicMaterial color={arch.colorA} />
            </mesh>
            <group ref={jets}>
              <mesh position={[0, 1.15 * def.scale, 0]}>
                <coneGeometry args={[0.13, 1.9, 12, 1, true]} />
                <meshBasicMaterial
                  color={arch.colorA}
                  transparent
                  opacity={0.28}
                  depthWrite={false}
                  side={THREE.DoubleSide}
                  blending={THREE.AdditiveBlending}
                />
              </mesh>
              <mesh position={[0, -1.15 * def.scale, 0]} rotation={[Math.PI, 0, 0]}>
                <coneGeometry args={[0.13, 1.9, 12, 1, true]} />
                <meshBasicMaterial
                  color={arch.colorA}
                  transparent
                  opacity={0.28}
                  depthWrite={false}
                  side={THREE.DoubleSide}
                  blending={THREE.AdditiveBlending}
                />
              </mesh>
            </group>
          </>
        )}

        {def.arch === 'binary' && (
          <>
            <mesh position={[-0.52 * def.scale, 0, 0]}>
              <sphereGeometry args={[arch.radius * def.scale * 0.5, 24, 24]} />
              <meshBasicMaterial color={arch.colorA} />
            </mesh>
            <mesh position={[0.52 * def.scale, 0, 0]}>
              <sphereGeometry args={[arch.radius * def.scale * 0.5, 24, 24]} />
              <meshBasicMaterial color={arch.colorB} />
            </mesh>
            {arcGeo && (
              <mesh geometry={arcGeo}>
                <meshBasicMaterial
                  ref={arcMat}
                  color="#cdd8ff"
                  transparent
                  opacity={0.2}
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                />
              </mesh>
            )}
          </>
        )}

        {def.arch === 'memory' && (
          <>
            <mesh>
              <icosahedronGeometry args={[arch.radius * def.scale, 0]} />
              <meshStandardMaterial
                color={arch.colorB}
                metalness={0.45}
                roughness={0.35}
                emissive="#0a0812"
                flatShading
              />
            </mesh>
            <mesh>
              <sphereGeometry args={[arch.radius * def.scale * 0.45, 24, 24]} />
              <meshBasicMaterial
                color={arch.colorA}
                transparent
                opacity={0.5}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
            <pointLight color={arch.colorA} intensity={7} distance={7} decay={2} />
          </>
        )}

        {def.arch === 'torus' && (
          <>
            <mesh>
              <torusGeometry args={[arch.radius * def.scale, 0.15 * def.scale, 16, 64]} />
              <meshStandardMaterial
                color={arch.colorB}
                metalness={0.5}
                roughness={0.3}
                emissive="#3a2a14"
              />
            </mesh>
            <group ref={counter}>
              <mesh rotation={[1.15, 0, 0]}>
                <torusGeometry args={[arch.radius * def.scale * 0.55, 0.045 * def.scale, 8, 48]} />
                <meshBasicMaterial
                  color={arch.colorA}
                  transparent
                  opacity={0.55}
                  depthWrite={false}
                  blending={THREE.AdditiveBlending}
                />
              </mesh>
            </group>
          </>
        )}

        {def.arch === 'sentinel' && (
          <>
            <mesh>
              <sphereGeometry args={[arch.radius * def.scale * 0.8, 32, 32]} />
              <meshBasicMaterial color={arch.colorA} />
            </mesh>
            <mesh rotation={[1.2, 0.4, 0]}>
              <torusGeometry args={[arch.radius * def.scale * 1.6, 0.012, 8, 48]} />
              <meshBasicMaterial
                color={arch.colorA}
                transparent
                opacity={0.5}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
          </>
        )}
      </group>
    </group>
  )
}

export function WellField({ defs }: { defs: WellDef[] }) {
  return (
    <>
      {defs.map((d) => (
        <WellView key={d.key} def={d} />
      ))}
    </>
  )
}
