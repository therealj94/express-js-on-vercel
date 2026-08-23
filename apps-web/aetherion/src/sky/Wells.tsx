import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { sim } from '../kernel/sim'
import { RADIO_ANILLO, rig } from '../kernel/rig'
import { useUiStore } from '../state/uiStore'
import { atmosphereFragment, atmosphereVertex } from '../shaders/shared'
import { getRingTexture } from './textures'
import { emblemaTextura, letreroTextura, planetaTextura } from './emblema'
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
  /* La identidad REAL de la casa, tal como la wallet la conoce */
  logo?: string
  ico?: string
  grad: string[]
  halo: string
  lente?: string
  zoom?: number
  natura: Natura
}

/* LA FUSIÓN CON ORDEN GLOBAL. Los pozos son las casas REALES del ecosistema:
   la `key` es el id que la wallet reconoce (VETA.nuAbrir), el propósito habla
   el idioma de la persona (window.__AE_LANG), y el logotipo, el ícono y los
   colores los manda la wallet en window.__AE_APPS: son EXACTAMENTE los mismos
   que la persona ya conoce del Núcleo, no una versión inventada aquí. */
const enIngles = () => typeof window !== 'undefined' && (window as any).__AE_LANG === 'en'

/* LA NATURALEZA DE CADA MUNDO. Ocho bolas iguales pintadas de otro color son
   ocho bolas; lo que hace que una casa se RECUERDE es que su planeta sea de
   una clase distinta. Cada una lleva la suya, elegida por lo que la casa hace:

     gigante  — bandas anchas y anillo mayor: la casa grande (la billetera)
     helado   — casquetes blancos y brillo frío: la memoria que guarda (scan)
     forja    — vetas encendidas girando: donde se acuña y se cambia (oxch)
     oceano   — nubes altas sobre azul: la palabra que fluye (chat)
     jardin   — atmósfera densa y luna: lo que crece contigo (pay)
     bunker   — roca seca, cráteres y anillo fino: lo que custodia (gid)
     boveda   — oro viejo y anillo doble: la banca (aucorp)
     faro     — pálido, con su satélite: el que ordena (ajustes)
     nucleo   — malla de luz por dentro: la memoria viva (genesis) */
type Natura = 'gigante' | 'helado' | 'forja' | 'oceano' | 'jardin' | 'bunker' | 'boveda' | 'faro' | 'nucleo'

interface Casa {
  key: string
  name: string
  intent: string
  arch: Archetype
  banda: 0 | 1        // 0 = cerca del Núcleo, 1 = el anillo de afuera
  peso: number        // el tamaño del planeta: la casa mayor se ve mayor
  natura: Natura
}

const casas = (): Casa[] => {
  const EN = enIngles()
  return [
  { key: 'wallet', name: 'Veta Wallet', arch: 'pulsar', banda: 0, peso: 1.32, natura: 'gigante',
    intent: EN ? 'Your gold made money' : 'Tu oro hecho dinero' },
  { key: 'chat', name: 'PULSE2CHAT', arch: 'binary', banda: 0, peso: 1.06, natura: 'oceano',
    intent: EN ? 'The living word of the ecosystem' : 'La palabra viva del ecosistema' },
  { key: 'gid', name: 'Genesis ID', arch: 'sentinel', banda: 0, peso: 1.06, natura: 'bunker',
    intent: EN ? 'Your identity, verified once' : 'Tu identidad, verificada una vez' },
  { key: 'pay', name: 'MyTokenPay', arch: 'torus', banda: 0, peso: 1.02, natura: 'jardin',
    intent: EN ? 'Charges and commerce' : 'Cobros y comercio' },
  { key: 'genesis', name: 'GENESIS CORE', arch: 'memory', banda: 0, peso: 1.0, natura: 'nucleo',
    intent: EN ? 'The living memory of the ecosystem' : 'La memoria viva del ecosistema' },
  { key: 'aucorp', name: 'AuCorp', arch: 'memory', banda: 1, peso: 1.0, natura: 'boveda',
    intent: EN ? 'Local-currency banking' : 'La banca en moneda local' },
  { key: 'scan', name: 'ORDENSCAN', arch: 'memory', banda: 1, peso: 0.92, natura: 'helado',
    intent: EN ? 'The chain, in plain sight' : 'La cadena, a la vista' },
  { key: 'oxch', name: 'Ordenex', arch: 'torus', banda: 1, peso: 0.92, natura: 'forja',
    intent: EN ? 'The exchange house' : 'La casa de cambio' },
  { key: 'ajustes', name: EN ? 'Settings' : 'Ajustes', arch: 'sentinel', banda: 1, peso: 0.86, natura: 'faro',
    intent: EN ? 'The system lighthouse' : 'El faro del sistema' },
  ]
}

const COLOR_POR_DEFECTO: Record<string, { grad: string[]; halo: string; lente: string }> = {
  genesis: { grad: ['#DFF3E9', '#6FBFAA', '#0F3A33'], halo: '#8FE6CE', lente: '#04211C' },
  wallet: { grad: ['#F8EFCF', '#DFC078', '#96793F'], halo: '#EAD79C', lente: '#05201B' },
  chat: { grad: ['#FBE0D4', '#E0937A', '#8A4A38'], halo: '#E0937A', lente: '#20100A' },
  gid: { grad: ['#D6EBE2', '#63A493', '#123B39'], halo: '#7FD8C4', lente: '#062123' },
  pay: { grad: ['#D8F7FF', '#5FC6EA', '#453398'], halo: '#5FC6EA', lente: '#0A0812' },
  aucorp: { grad: ['#E8E0C8', '#A5936A', '#463B24'], halo: '#CBBB8C', lente: '#141007' },
  scan: { grad: ['#D6F3EC', '#74E6C8', '#1B5A50'], halo: '#74E6C8', lente: '#07211D' },
  oxch: { grad: ['#DCD4F2', '#8D7EC9', '#372B63'], halo: '#A99CDE', lente: '#0D0A1D' },
  ajustes: { grad: ['#E4E8EE', '#93A0AE', '#2E3844'], halo: '#A9B6C4', lente: '#0C1116' },
}

/* EL ANILLO DE CASAS. Antes los pozos caían donde tocara sobre los filamentos:
   quedaban desparramados entre el centro y el borde, tan lejos unos de otros
   que ninguno se veía bien. Ahora forman un sistema: las cuatro casas de todos
   los días en la órbita de adentro, las otras cuatro en la de afuera, cada una
   con su altura propia para que el conjunto tenga aire y no sea una rueda
   plana. Se puede leer de un vistazo, y girar la galaxia las muestra todas. */
function anillo(lista: Casa[], i: number, banda: 0 | 1): THREE.Vector3 {
  const enBanda = lista.filter((c) => c.banda === banda)
  const idx = enBanda.findIndex((c) => c.key === lista[i].key)
  const n = Math.max(1, enBanda.length)
  /* El giro de cada banda se corre MEDIO PASO respecto del eje de la cámara
     (theta de reposo = 0.65): así ninguna casa cae justo delante de AU-RA
     tapándola — el corazón siempre tiene su ventana. */
  const giro = 0.65 + Math.PI / n + (banda === 1 ? Math.PI / (n * 2) : 0)
  const a = giro + (idx / n) * Math.PI * 2
  /* La órbita de adentro se abre para dejarle el centro a AU-RA: el corazón
     de la galaxia tiene que verse, no quedar tapado por las casas. */
  const r = RADIO_ANILLO * (banda === 0 ? 0.68 : 1.08)
  /* La altura no es adorno: en la órbita de adentro, las casas del sector
     TRASERO suben y las del frontal bajan — así ninguna se proyecta encima
     de AU-RA y el corazón siempre tiene su ventana limpia. La anillo(a) de
     afuera conserva su vaivén propio. */
  const alto = banda === 0
    ? -Math.cos(a - 0.65) * 1.15
    : Math.sin(a * 2 + 1.7) * 1.2
  return new THREE.Vector3(Math.cos(a) * r, alto, Math.sin(a) * r)
}

export function buildWellDefs(gal: Galaxy): WellDef[] {
  const dela = (typeof window !== 'undefined' && (window as any).__AE_APPS) || null
  const lista = casas()
  return lista.map((c, i) => {
    const node = gal.wells[i % gal.wells.length]
    const real = Array.isArray(dela) ? dela.find((a: any) => a && a.key === c.key) : null
    const color = COLOR_POR_DEFECTO[c.key] || { grad: ['#eee', '#888', '#222'], halo: '#cfd8e6', lente: '#0a1018' }
    return {
      key: c.key,
      name: real?.name || c.name,
      intent: c.intent,
      arch: c.arch,
      anchor: anillo(lista, i, c.banda),
      pathIdx: node.pathIdx,
      t: node.t,
      scale: c.peso,
      pending: 0,
      logo: real?.logo,
      ico: real?.ico,
      grad: real?.grad || color.grad,
      halo: real?.halo || color.halo,
      lente: real?.lente || color.lente,
      zoom: real?.zoom || 1,
      natura: c.natura,
    }
  })
}

/* La constante que Sky, Pulses y Overlays esperan: los pozos ya puestos sobre
   la galaxia de semilla fija.

   Se REFRESCA en cada montaje (main.tsx la pide antes de dibujar) y no solo al
   cargar el archivo: si la persona cambia de idioma o la casa manda otras
   marcas, los planetas se enteran. Se muta el mismo arreglo a propósito, para
   que quien ya lo tenga en la mano siga mirando la lista buena. */
import { GALAXY } from './galaxy'
export const WELL_DEFS: WellDef[] = buildWellDefs(GALAXY)

export function refrescarCasas() {
  const nuevas = buildWellDefs(GALAXY)
  WELL_DEFS.length = 0
  WELL_DEFS.push(...nuevas)
  /* El timón encuadra midiendo DÓNDE están las casas: aquí se las deja
     apuntadas, con el bulto que ocupa cada planeta. */
  rig.anclas = WELL_DEFS.map((d) => ({
    pos: d.anchor.clone(),
    r: 1.72 * d.scale,
    /* Las casas de todos los días NUNCA se cortan; las de la órbita de afuera
       pueden asomar por el borde, que para eso el cielo gira. */
    principal: casas().find((c) => c.key === d.key)?.banda === 0,
  }))
  return WELL_DEFS
}

export interface WellHandle {
  def: WellDef
  getPos: () => THREE.Vector3
  radius: number
  atmo: THREE.ShaderMaterial
  hit: THREE.Mesh
}

export const wellRegistry = new Map<string, WellHandle>()

const tmpV = new THREE.Vector3()
const tmpP = new THREE.Vector3()

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
  const luna = useRef<THREE.Group>(null)
  const anillo3 = useRef<THREE.Group>(null)
  const hit = useRef<THREE.Mesh>(null!)
  const halo = useRef<THREE.Sprite>(null)
  const emblema = useRef<THREE.Sprite>(null)
  const letrero = useRef<THREE.Sprite>(null)

  const selected = useUiStore((s) => s.selectedId === def.key)

  /* El cuerpo del planeta: el radio manda sobre todo lo demás (emblema,
     letrero, atmósfera), así que se calcula UNA vez y de ahí cuelga el resto. */
  const R = 1.72 * def.scale
  const atmo = useMemo(() => makeAtmoMaterial(def.halo, 0.55), [def.halo])
  const piel = useMemo(() => planetaTextura(def.key, def.grad, def.natura), [def.key, def.grad, def.natura])
  const cara = useMemo(
    () => emblemaTextura({
      key: def.key, logo: def.logo, ico: def.ico, halo: def.halo,
      lente: def.lente, zoom: def.zoom,
    }),
    [def.key, def.logo, def.ico, def.halo, def.lente, def.zoom]
  )
  const nombre = useMemo(() => letreroTextura(def.name, def.halo), [def.name, def.halo])
  const hitGeo = useMemo(() => new THREE.SphereGeometry(R * 1.5, 12, 12), [R])
  const seed = useMemo(() => (def.key.charCodeAt(0) % 10) + def.key.length * 0.7, [def.key])

  useEffect(() => {
    wellRegistry.set(def.key, {
      def,
      getPos: () => group.current.position,
      radius: R,
      atmo,
      hit: hit.current,
    })
    return () => {
      wellRegistry.delete(def.key)
    }
  }, [def, R, atmo])

  useFrame((state, dt) => {
    const g = group.current
    if (!g) return
    const bob = Math.sin(sim.now * 0.5 + seed) * 0.14
    tmpV.copy(sim.tuLuz).sub(def.anchor)
    const dist = tmpV.length()
    const falloff = Math.max(0, 1 - dist / 14)
    tmpV.normalize().multiplyScalar(0.3 * falloff)
    g.position.set(
      def.anchor.x + tmpV.x,
      def.anchor.y + bob + tmpV.y * 0.5,
      def.anchor.z + tmpV.z
    )

    if (spin.current) spin.current.rotation.y += dt * rasgos.giro
    if (luna.current) luna.current.rotation.y += dt * 0.85
    if (anillo3.current) anillo3.current.rotation.z += dt * 0.16

    atmo.uniforms.uTime.value = sim.now
    const boostT = selected ? 0.55 : 0
    atmo.uniforms.uBoost.value = THREE.MathUtils.damp(atmo.uniforms.uBoost.value, boostT, 6, dt)

    /* EL NOMBRE SIEMPRE LEGIBLE. El letrero y el emblema son carteles que
       miran a la cámara; su tamaño en pantalla se compensa con la distancia,
       así que de cerca no tapan el planeta y de lejos no desaparecen. */
    const d = state.camera.position.distanceTo(g.position)
    const k = THREE.MathUtils.clamp(d / 13, 0.66, 2.2)
    if (emblema.current) {
      const s = R * 1.42 * (selected ? 1.08 : 1)
      emblema.current.scale.setScalar(s)
      emblema.current.position.set(0, 0, 0)
      /* Al alejarse, la MARCA se apaga con el planeta: en el panorama de la
         galaxia lo que se mira son mundos y soles, no nueve insignias
         flotando del mismo tamaño. De cerca la marca manda; de lejos, el
         cielo. */
      ;(emblema.current.material as THREE.SpriteMaterial).opacity =
        THREE.MathUtils.clamp(3.1 - d / 17, 0, 1)
    }
    if (letrero.current) {
      /* EL LETRERO NO CRECE CON EL PLANETA. Su tamaño en PANTALLA es el mismo
         para todas las casas —proporcional a la distancia, nada más—, así que
         de cerca no tapa medio cielo y de lejos sigue siendo legible. */
      const s = d * 0.098
      letrero.current.scale.set(s * 2.6, s * 0.65, 1)
      letrero.current.position.set(0, -R * 1.12 - s * 0.34, 0)
      /* Y se calla cuando su casa está saliéndose del cuadro: un nombre
         cortado a la mitad en el borde se ve descuidado, no misterioso. */
      tmpP.copy(g.position).project(state.camera)
      const alBorde = Math.abs(tmpP.x) > 0.82 || Math.abs(tmpP.y) > 0.86 || tmpP.z > 1
      /* De lejos los nombres se apagan del todo: en el panorama de la galaxia,
         nueve letreros a tamaño fijo se apelotonan en el centro y tapan justo
         lo que se fue a mirar. Cerca mandan ellos; lejos manda el cielo. */
      const lejania = THREE.MathUtils.clamp(2.6 - d / 22, 0, 1)
      /* En la puerta el sistema se mira de lejos y en silencio: los nombres
         aparecen recién cuando la persona entra. */
      const puerta = (window as any).__AE_PUERTA ? 0 : 1
      ;(letrero.current.material as THREE.SpriteMaterial).opacity =
        puerta * (alBorde ? Math.min(0.12, lejania) : selected ? 1 : lejania)
    }

    if (halo.current) {
      halo.current.visible = selected
      if (selected) {
        const s = R * 3.1 * (1 + Math.sin(sim.now * 3.4) * 0.05)
        halo.current.scale.setScalar(s)
        ;(halo.current.material as THREE.SpriteMaterial).opacity = 0.7 + Math.sin(sim.now * 3.4) * 0.2
      }
    }
  })

  /* La silueta la manda la naturaleza del mundo: quién lleva anillo, de qué
     tamaño, quién tiene luna y quién brilla por dentro. */
  const A: Record<string, { anillo?: [number, number]; luna?: number; brillo: number; giro: number }> = {
    gigante: { anillo: [1.5, 2.35], luna: 0.26, brillo: 0.18, giro: 0.16 },
    helado: { anillo: [1.7, 2.0], brillo: 0.3, giro: 0.1 },
    forja: { anillo: [1.45, 1.95], brillo: 0.42, giro: 0.34 },
    oceano: { luna: 0.3, brillo: 0.2, giro: 0.19 },
    jardin: { luna: 0.22, brillo: 0.22, giro: 0.21 },
    bunker: { anillo: [1.9, 2.05], brillo: 0.12, giro: 0.08 },
    boveda: { anillo: [1.5, 1.9], brillo: 0.16, giro: 0.12 },
    nucleo: { anillo: [1.6, 2.2], brillo: 0.5, giro: 0.26 },
    faro: { luna: 0.18, brillo: 0.26, giro: 0.14 },
  }
  const rasgos = A[def.natura] || A.gigante
  const conAnillo = !!rasgos.anillo
  const conLuna = !!rasgos.luna

  return (
    <group ref={group} position={def.anchor}>
      <mesh ref={hit} geometry={hitGeo} userData={{ wellId: def.key }}>
        <meshBasicMaterial colorWrite={false} depthWrite={false} />
      </mesh>

      {/* la atmósfera: el color de la marca respirando alrededor del mundo */}
      <mesh material={atmo}>
        <sphereGeometry args={[R * 1.32, 32, 32]} />
      </mesh>

      <sprite ref={halo} visible={selected}>
        <spriteMaterial
          map={getRingTexture()}
          color={def.halo}
          transparent
          opacity={0.8}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>

      <group ref={spin}>
        {/* EL PLANETA: piel de marca, luz propia suave y bulto de esfera */}
        <mesh>
          <sphereGeometry args={[R, 48, 48]} />
          <meshStandardMaterial
            map={piel}
            metalness={0.12}
            roughness={0.78}
            emissive={new THREE.Color(def.halo)}
            emissiveIntensity={rasgos.brillo}
          />
        </mesh>

        {conLuna && (
          <group ref={luna}>
            <mesh position={[R * 2.1, R * 0.25, 0]}>
              <sphereGeometry args={[R * (rasgos.luna ?? 0.3), 24, 24]} />
              <meshStandardMaterial
                color={def.grad[0]}
                emissive={new THREE.Color(def.halo)}
                emissiveIntensity={0.35}
                roughness={0.6}
              />
            </mesh>
          </group>
        )}
      </group>

      {conAnillo && (
        <group ref={anillo3} rotation={[1.32, 0, 0.24]}>
          <mesh>
            <ringGeometry args={[R * (rasgos.anillo?.[0] ?? 1.55), R * (rasgos.anillo?.[1] ?? 2.15), 64]} />
            <meshBasicMaterial
              map={getRingTexture()}
              color={def.halo}
              transparent
              opacity={0.4}
              side={THREE.DoubleSide}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        </group>
      )}

      {/* LA MARCA DE LA CASA, mirando siempre a quien la busca */}
      <sprite ref={emblema} renderOrder={3}>
        <spriteMaterial
          map={cara}
          transparent
          depthTest={false}
          depthWrite={false}
          opacity={1}
        />
      </sprite>
      <sprite ref={letrero} renderOrder={4}>
        <spriteMaterial map={nombre} transparent depthTest={false} depthWrite={false} opacity={0.9} />
      </sprite>
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
