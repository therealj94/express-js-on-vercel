import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { sim } from '../kernel/sim'
import { RADIO_ANILLO, rig } from '../kernel/rig'
import { useUiStore } from '../state/uiStore'
import { atmosphereFragment, atmosphereVertex, SOMBRA_ANILLO, SOMBRA_PLANETA } from '../shaders/shared'
import { getRingTexture } from './textures'
import { emblemaTextura, letreroTextura, planetaTextura, nubesTextura, anilloTextura, lucesTextura } from './emblema'
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
const normalAro = new THREE.Vector3()
const qAro = new THREE.Quaternion()
const tmpP = new THREE.Vector3()
const tmpA = new THREE.Vector3()

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

/* LA SOMBRA DEL ANILLO SOBRE EL PLANETA.
 *
 * Se inyecta en el material estándar de three en vez de escribir uno propio:
 * así el planeta conserva toda su iluminación buena —el terminador, el
 * relieve, el brillo del mar— y solo se le añade la banda oscura que el
 * anillo le pinta encima. Escribir el material entero para esto sería tirar
 * a la basura cientos de líneas de sombreado que ya funcionan.
 *
 * Los uniformes los pone y los mantiene el propio planeta cada cuadro: el
 * anillo se inclina con él, así que su plano no es constante. */
function sombrearConAnillo(this: THREE.Material, sh: any) {
  /* three llama a esto con el material como `this`, y NO guarda el shader por
     su cuenta: sin esta línea no habría forma de tocar los uniformes después,
     que es justo lo que hace falta cada cuadro. */
  this.userData.shader = sh
  sh.uniforms.uCentroP = { value: new THREE.Vector3() }
  sh.uniforms.uAnilloN = { value: new THREE.Vector3(0, 1, 0) }
  sh.uniforms.uAnilloR = { value: new THREE.Vector2(1, 2) }
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', `#include <common>\nvarying vec3 vMundo;`)
    .replace('#include <worldpos_vertex>',
      `#include <worldpos_vertex>\n  vMundo = (modelMatrix * vec4(transformed, 1.0)).xyz;`)
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>
varying vec3 vMundo;
uniform vec3 uCentroP;
uniform vec3 uAnilloN;
uniform vec2 uAnilloR;
${SOMBRA_ANILLO}`)
    /* Se aplica sobre la luz ya acumulada, justo antes del tonemapping: es
       una sombra, no un color, y tiene que oscurecer todo lo que llegó. */
    .replace('#include <tonemapping_fragment>',
      `  {
    vec3 haciaSol = normalize(-vMundo);
    gl_FragColor.rgb *= sombraDeAnillo(vMundo, uCentroP, haciaSol,
                                       uAnilloN, uAnilloR.x, uAnilloR.y);
  }
#include <tonemapping_fragment>`)
}

/* Y LA DEL PLANETA SOBRE EL ANILLO: la mordida oscura que el aro lleva
   siempre del lado contrario al sol. */
function sombrearAnillo(this: THREE.Material, sh: any) {
  this.userData.shader = sh
  sh.uniforms.uCentroP = { value: new THREE.Vector3() }
  sh.uniforms.uRadioP = { value: 1 }
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', `#include <common>\nvarying vec3 vMundo;`)
    .replace('#include <worldpos_vertex>',
      `#include <worldpos_vertex>\n  vMundo = (modelMatrix * vec4(transformed, 1.0)).xyz;`)
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>
varying vec3 vMundo;
uniform vec3 uCentroP;
uniform float uRadioP;
${SOMBRA_PLANETA}`)
    .replace('#include <tonemapping_fragment>',
      `  {
    vec3 haciaSol = normalize(-vMundo);
    gl_FragColor.rgb *= sombraDePlaneta(vMundo, uCentroP, haciaSol, uRadioP);
  }
#include <tonemapping_fragment>`)
}

function WellView({ def }: { def: WellDef }) {
  const arch = ARCHETYPES[def.arch]
  const group = useRef<THREE.Group>(null!)
  const spin = useRef<THREE.Group>(null!)
  const luna = useRef<THREE.Group>(null)
  const nubes = useRef<THREE.Mesh>(null)
  const cuerpo = useRef<THREE.Mesh>(null)
  const anilloMalla = useRef<THREE.Mesh>(null)
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
  const velo = useMemo(() => nubesTextura(def.key), [def.key])
  const aro = useMemo(() => anilloTextura(def.key, def.halo), [def.key, def.halo])
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

  /* DÓNDE ESTÁ ESTA CASA CUANDO EL SISTEMA ESTÁ SUELTO. Un sitio propio, muy
     por fuera del anillo y con su altura: desde el umbral se ve un puñado de
     mundos a la deriva, no una formación. La posición es fija por casa (sale
     de su nombre), así que la galaxia del login es siempre la misma. */
  const disperso = useMemo(() => {
    let s = 0
    for (const ch of def.key) s = (s * 31 + ch.charCodeAt(0)) >>> 0
    const az = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
    const a = az() * Math.PI * 2
    const r = RADIO_ANILLO * (1.9 + az() * 1.4)
    return new THREE.Vector3(Math.cos(a) * r, (az() - 0.5) * RADIO_ANILLO * 1.9, Math.sin(a) * r)
  }, [def.key])

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
    /* EL ACOMODO. Con el sistema suelto (acomodo = 1) la casa está en su sitio
       disperso; al entrar, el número baja a cero y cada mundo VIAJA hasta su
       órbita. No es una animación aparte: es la misma posición de siempre,
       mezclada. Por eso se acomodan mientras la cámara se acerca, en un solo
       movimiento. */
    const q = sim.acomodo
    const base = q > 0.001 ? tmpA.copy(def.anchor).lerp(disperso, q) : def.anchor
    g.position.set(
      base.x + tmpV.x,
      base.y + bob + tmpV.y * 0.5,
      base.z + tmpV.z
    )
    /* Y giran sobre sí mismos mientras se acomodan: un mundo que llega a su
       sitio dando vueltas se lee como algo que ATERRIZA, no que se teletransporta. */
    if (spin.current && q > 0.001) spin.current.rotation.y += dt * q * 1.6

    if (spin.current) spin.current.rotation.y += dt * rasgos.giro
    /* Las nubes van más rápido que el suelo: esa diferencia es lo que el ojo
       lee como atmósfera y no como una calcomanía pegada. */
    if (nubes.current) nubes.current.rotation.y += dt * rasgos.giro * 1.45
    if (luna.current) luna.current.rotation.y += dt * 0.85
    if (anillo3.current) anillo3.current.rotation.z += dt * 0.16

    /* LAS CIUDADES SE APAGAN EN LA TINIEBLA. Un mundo con las luces puestas
       mientras se dice «no había nada» es la clase de detalle que rompe una
       película entera, y encima es el más brillante de la escena. */
    if (cuerpo.current) {
      const mm = cuerpo.current.material as THREE.MeshStandardMaterial
      const base = rasgos.vive ? 0.85 : rasgos.brillo
      mm.emissiveIntensity = base * (1 - sim.noche)
      /* LOS DATOS DE LA SOMBRA, AL DÍA. El planeta se mueve (bota, se acomoda)
         y el anillo gira con él: su plano no es una constante, hay que
         decírselo al sombreador en cada cuadro o la banda oscura se queda
         donde estaba y delata el truco. */
      const u = (mm as any).userData?.shader?.uniforms
      if (u && conAnillo && anillo3.current) {
        u.uCentroP.value.copy(g.position)
        // la normal del anillo: su eje Y llevado al mundo
        normalAro.set(0, 1, 0).applyQuaternion(anillo3.current.getWorldQuaternion(qAro))
        u.uAnilloN.value.copy(normalAro)
        u.uAnilloR.value.set(R * (rasgos.anillo?.[0] ?? 1.55), R * (rasgos.anillo?.[1] ?? 2.15))
      }
    }
    /* Y el anillo necesita saber dónde está su planeta y cuánto mide, para
       oscurecerse donde este le tapa el sol. */
    if (anilloMalla.current) {
      const am = anilloMalla.current.material as THREE.MeshStandardMaterial
      const ua = (am as any).userData?.shader?.uniforms
      if (ua) {
        ua.uCentroP.value.copy(g.position)
        ua.uRadioP.value = R
      }
    }

    atmo.uniforms.uTime.value = sim.now
    const boostT = selected ? 0.55 : 0
    atmo.uniforms.uBoost.value = THREE.MathUtils.damp(atmo.uniforms.uBoost.value, boostT, 6, dt)

    /* EL NOMBRE SIEMPRE LEGIBLE. El letrero y el emblema son carteles que
       miran a la cámara; su tamaño en pantalla se compensa con la distancia,
       así que de cerca no tapan el planeta y de lejos no desaparecen. */
    const d = state.camera.position.distanceTo(g.position)
    const k = THREE.MathUtils.clamp(d / 13, 0.66, 2.2)
    if (emblema.current) {
      /* LA INSIGNIA FLOTA, NO ESTÁ PINTADA. Se adelanta hacia la cámara un
         poco más que el radio del planeta: así se lee como un cristal que
         orbita delante del mundo —con su parallax al girar— y no como una
         calcomanía pegada en la superficie, que era lo que la delataba. */
      const s = R * 1.12 * (selected ? 1.08 : 1)
      emblema.current.scale.setScalar(s)
      tmpP.copy(state.camera.position).sub(g.position).normalize().multiplyScalar(R * 1.22)
      emblema.current.position.copy(tmpP)
      /* Al alejarse, la MARCA se apaga con el planeta: en el panorama de la
         galaxia lo que se mira son mundos y soles, no nueve insignias
         flotando del mismo tamaño. De cerca la marca manda; de lejos, el
         cielo. */
      /* En la tiniebla las marcas TAMBIÉN se apagan: un logo encendido
         mientras se dice «había oscuridad» rompe el hechizo entero. Y con
         película rodando, solo la casa que se está presentando enseña la
         suya — lo demás es silencio, como en cualquier plano bien hecho. */
      const cine = sim.pelicula ? (selected ? 1 : 0.12) : 1
      ;(emblema.current.material as THREE.SpriteMaterial).opacity =
        THREE.MathUtils.clamp(3.1 - d / 17, 0, 1) * (1 - sim.noche) * cine
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
      // durante la película, el nombre es SOLO de la casa que se presenta
      const cineL = sim.pelicula ? (selected ? 1 : 0) : 1
      const op = puerta * cineL * (1 - sim.noche)
        * (alBorde ? Math.min(0.12, lejania) : selected ? 1 : lejania)
      ;(letrero.current.material as THREE.SpriteMaterial).opacity = op
      /* Para que una prueba pueda ver lo que una foto no distingue: un
         rótulo apagado y uno fuera de cuadro se ven igual. */
      const w = window as any
      ;(w.__AE_ROTULO_OP ||= {})[def.key] = op
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
  type Rasgos = { anillo?: [number, number]; luna?: number; brillo: number
                  giro: number; relieve: number; nubes?: boolean
                  vive?: boolean; mar?: boolean; eje?: number }
  /* vive = luces de ciudad en la cara de noche; mar = superficie con brillo
     especular (el destello del sol sobre agua); eje = inclinación del eje de
     giro — ningún mundo de verdad gira derecho, y esa torcedura por sí sola
     quita la mitad del aire a «bola generada». */
  const A: Record<string, Rasgos> = {
    gigante: { anillo: [1.5, 2.35], luna: 0.26, brillo: 0.05, giro: 0.16, relieve: 0.012, nubes: true, eje: 0.32 },
    helado: { anillo: [1.7, 2.0], brillo: 0.06, giro: 0.1, relieve: 0.022, mar: true, eje: 0.5 },
    forja: { anillo: [1.45, 1.95], brillo: 0.3, giro: 0.34, relieve: 0.03, eje: 0.12 },
    oceano: { luna: 0.3, brillo: 0.05, giro: 0.19, relieve: 0.008, nubes: true, vive: true, mar: true, eje: 0.41 },
    jardin: { luna: 0.22, brillo: 0.06, giro: 0.21, relieve: 0.018, nubes: true, vive: true, mar: true, eje: 0.23 },
    bunker: { anillo: [1.9, 2.05], brillo: 0.03, giro: 0.08, relieve: 0.038, vive: true, eje: 0.08 },
    boveda: { anillo: [1.5, 1.9], brillo: 0.05, giro: 0.12, relieve: 0.02, vive: true, eje: 0.27 },
    nucleo: { anillo: [1.6, 2.2], brillo: 0.34, giro: 0.26, relieve: 0.014, eje: 0.19 },
    faro: { luna: 0.18, brillo: 0.08, giro: 0.14, relieve: 0.016, vive: true, eje: 0.36 },
  }
  const rasgos = A[def.natura] || A.gigante
  const conAnillo = !!rasgos.anillo
  const conLuna = !!rasgos.luna
  const luces = useMemo(() => (rasgos.vive ? lucesTextura(def.key) : null),
    [rasgos.vive, def.key])
  // la torcedura de cada mundo: la de su naturaleza, matizada por su nombre
  const eje = (rasgos.eje ?? 0.25) * (0.75 + ((seed * 13) % 10) / 20)

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

      <group ref={spin} rotation={[0, 0, eje]}>
        {/* EL PLANETA: piel de marca, luz propia suave y bulto de esfera */}
        {/* EL CUERPO. El mapa de relieve sale de la misma piel: donde la
            textura es clara el terreno sobresale, y con la luz del sol
            rasante eso ya da montañas, bandas y grano — es lo que separa una
            esfera pintada de un mundo. */}
        <mesh ref={cuerpo}>
          <sphereGeometry args={[R, 64, 64]} />
          <meshStandardMaterial
            onBeforeCompile={conAnillo ? sombrearConAnillo : undefined}
            map={piel}
            bumpMap={piel}
            bumpScale={rasgos.relieve}
            metalness={rasgos.mar ? 0.12 : 0.06}
            /* El mar devuelve el sol: los mundos con agua llevan la
               superficie más lisa y el destello especular viaja por ella al
               girar — el brillo que en una foto de la Tierra delata el
               océano. */
            roughness={rasgos.mar ? 0.55 : 0.92}
            {...(rasgos.vive
              ? {
                  /* LAS CIUDADES. El mapa emisivo pinta solo los cúmulos de
                     luz: de día el sol los lava, y al girar a la sombra
                     aparecen las ciudades y sus rutas. Un mundo con luces de
                     noche es un mundo donde VIVE alguien. */
                  emissive: new THREE.Color('#ffd2a0'),
                  emissiveMap: luces,
                  emissiveIntensity: 0.85,
                }
              : {
                  emissive: new THREE.Color(def.halo),
                  /* Casi nada de luz propia: un planeta no brilla, REFLEJA.
                     Solo los que arden por dentro (la forja, el núcleo)
                     conservan algo. */
                  emissiveIntensity: rasgos.brillo,
                })}
          />
        </mesh>
        {/* LAS NUBES: una segunda capa que gira a su ritmo. Es el truco más
            barato y más eficaz que hay para que un mundo parezca vivo. */}
        {rasgos.nubes && (
          <mesh ref={nubes}>
            <sphereGeometry args={[R * 1.028, 48, 48]} />
            <meshStandardMaterial
              map={velo}
              transparent
              opacity={0.5}
              depthWrite={false}
              roughness={1}
              metalness={0}
            />
          </mesh>
        )}

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
          <mesh ref={anilloMalla}>
            <ringGeometry args={[R * (rasgos.anillo?.[0] ?? 1.55), R * (rasgos.anillo?.[1] ?? 2.15), 128, 1]} />
            {/* El anillo lo ILUMINA el sol, no brilla solo: por eso material
                estándar y no aditivo — así tiene cara de día y cara de noche
                como cualquier cosa que orbita. */}
            <meshStandardMaterial
              onBeforeCompile={sombrearAnillo}
              map={aro}
              alphaMap={aro}
              color={def.grad[1]}
              transparent
              opacity={0.85}
              side={THREE.DoubleSide}
              depthWrite={false}
              roughness={1}
              metalness={0}
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
