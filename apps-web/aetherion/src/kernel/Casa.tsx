import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { PUNTERO, poseMirada, rayoPuntero } from './mirada'

/* LA CASA DENTRO DEL VISOR · el ecosistema sin tener que quitárselo.
 *
 * ══ EL AGUJERO QUE ESTO CIERRA ════════════════════════════════════════════
 *
 * Con el visor puesto se podía recorrer la galaxia y mirar los mundos, pero
 * abrir uno SACABA del visor: las casas son pantallas planas de HTML, y el
 * HTML dentro de un visor no sirve —se pinta una vez encima de las dos
 * mitades de la pantalla y al cerebro le llega una mancha doble—. Así que la
 * wallet hacía lo honesto que podía: salir limpio y enseñar la casa en la
 * pantalla. Sólo que en un Quest eso quiere decir que la galaxia se apaga y
 * uno cae en un panel flotante del navegador. Se podía MIRAR el ecosistema
 * con el visor puesto; usarlo, no.
 *
 * ══ CÓMO SE CIERRA ════════════════════════════════════════════════════════
 *
 * Con lo mismo que hizo que la historia se pudiera contar aquí dentro: las
 * palabras dejan de ser HTML y pasan a ser UN OBJETO DE LA ESCENA, dibujado
 * por las dos cámaras como cualquier planeta. Ver Teatro.tsx — de ahí sale la
 * distancia, la altura y el retraso con que sigue a la cabeza, que no son de
 * gusto: son lo que separa un cartel colgado delante tuyo de una pegatina en
 * las gafas.
 *
 * La diferencia con el teatro es que esto no sólo se lee: SE TOCA. Lleva
 * botones de verdad, apuntables con el mando y apretables con el gatillo — o
 * sostenibles con la mirada, para quien no tiene mando. Ver Mandos.tsx.
 *
 * ══ LO QUE SIGUE SIN HACERSE AQUÍ ═════════════════════════════════════════
 *
 * NO SE MUEVE DINERO. Esto enseña lo que cada casa ES y lo que ahora mismo
 * tiene —el saldo, los mensajes sin leer, el precio, la altura de la cadena—,
 * y para eso alcanza y sobra. Firmar un envío con la cara tapada, sin poder
 * leer la letra chica y sin teclado, sigue siendo la clase de comodidad que
 * termina en un arrepentimiento caro. Cuando la mirada cae sobre una de esas
 * casas se dice por qué, y se sale del visor a propósito.
 */

const ANCHO = 2048
const ALTO = 1408

export interface Boton { id: string; texto: string }
export interface DatosCasa {
  key: string
  titulo: string
  sub?: string
  /* El halo del mundo, para que la casa se sienta la misma que el planeta del
     que se acaba de salir. Sin esto todas las casas son la misma lámina gris. */
  color?: string
  lineas?: Array<{ k: string; v: string }>
  parrafos?: string[]
  nota?: string
  botones: Boton[]
}

/* Un lienzo por casa, cacheado por su contenido: repintar en cada cuadro sería
   tirar la tarjeta gráfica por un panel que no cambia. La clave lleva los
   datos vivos dentro, así que un saldo nuevo repinta y uno igual no. */
const cachePanel = new Map<string, THREE.CanvasTexture>()
const cacheBoton = new Map<string, THREE.CanvasTexture>()

function redondo(g: CanvasRenderingContext2D, x: number, y: number,
                 w: number, h: number, r: number) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.lineTo(x + w - r, y)
  g.quadraticCurveTo(x + w, y, x + w, y + r)
  g.lineTo(x + w, y + h - r)
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  g.lineTo(x + r, y + h)
  g.quadraticCurveTo(x, y + h, x, y + h - r)
  g.lineTo(x, y + r)
  g.quadraticCurveTo(x, y, x + r, y)
  g.closePath()
}

/* Parte una frase en renglones que quepan. Sin esto, una línea larga se sale
   del panel y se pierde justo el final, que es donde suele estar el dato. */
function renglones(g: CanvasRenderingContext2D, texto: string, ancho: number): string[] {
  const salida: string[] = []
  for (const parrafo of texto.split('\n')) {
    let linea = ''
    for (const palabra of parrafo.split(' ')) {
      const prueba = linea ? `${linea} ${palabra}` : palabra
      if (g.measureText(prueba).width > ancho && linea) { salida.push(linea); linea = palabra }
      else linea = prueba
    }
    salida.push(linea)
  }
  return salida
}

function pintarPanel(d: DatosCasa): THREE.CanvasTexture {
  const clave = JSON.stringify([d.key, d.titulo, d.sub, d.color, d.lineas, d.parrafos, d.nota])
  const hecho = cachePanel.get(clave)
  if (hecho) return hecho

  const c = document.createElement('canvas')
  c.width = ANCHO
  c.height = ALTO
  const g = c.getContext('2d')
  /* Un lienzo sin contexto pasa de verdad cuando el aparato está apretado, y
     reventar aquí se lleva por delante el cuadro entero — con el visor puesto,
     o sea, dejando a alguien mirando una escena congelada. Mejor un panel en
     blanco que una escena muerta. */
  if (!g) return new THREE.CanvasTexture(c)

  const oro = d.color || '#EAD79C'

  // ── el cristal ───────────────────────────────────────────────────────────
  const M = 26
  redondo(g, M, M, ANCHO - M * 2, ALTO - M * 2, 54)
  const fondo = g.createLinearGradient(0, 0, 0, ALTO)
  fondo.addColorStop(0, 'rgba(9,18,36,0.94)')
  fondo.addColorStop(1, 'rgba(4,9,20,0.97)')
  g.fillStyle = fondo
  g.fill()
  g.strokeStyle = oro
  g.globalAlpha = 0.7
  g.lineWidth = 3
  g.stroke()
  g.globalAlpha = 1

  const IZQ = 118
  const DER = ANCHO - 118
  let y = 168

  // ── el título ────────────────────────────────────────────────────────────
  g.textAlign = 'left'
  g.textBaseline = 'middle'
  g.font = '600 92px Cinzel, "Bodoni Moda", Georgia, serif'
  g.letterSpacing = '12px'
  g.fillStyle = '#F7EDD2'
  g.fillText(d.titulo.toUpperCase(), IZQ, y)
  y += 74

  if (d.sub) {
    g.font = '400 44px system-ui, sans-serif'
    g.letterSpacing = '1px'
    g.fillStyle = 'rgba(214,222,236,0.68)'
    for (const l of renglones(g, d.sub, DER - IZQ)) { g.fillText(l, IZQ, y); y += 58 }
  }

  // el filo de oro bajo el encabezado: separa el nombre de lo que dice
  y += 34
  g.strokeStyle = oro
  g.globalAlpha = 0.42
  g.lineWidth = 2
  g.beginPath(); g.moveTo(IZQ, y); g.lineTo(DER, y); g.stroke()
  g.globalAlpha = 1
  y += 64

  /* ── LO QUE ESTA CASA TIENE AHORA MISMO ────────────────────────────────
     El dato vivo va PRIMERO y en grande. Quien entra a la billetera con el
     visor puesto viene a ver cuánto tiene, no a leer qué es una billetera. */
  for (const fila of d.lineas || []) {
    g.font = '400 40px system-ui, sans-serif'
    g.letterSpacing = '3px'
    g.fillStyle = 'rgba(180,196,220,0.72)'
    g.textAlign = 'left'
    g.fillText(fila.k.toUpperCase(), IZQ, y)
    g.font = '600 58px Cinzel, "Bodoni Moda", Georgia, serif'
    g.letterSpacing = '0px'
    g.fillStyle = '#F7EDD2'
    g.textAlign = 'right'
    g.fillText(fila.v, DER, y)
    g.textAlign = 'left'
    y += 46
    g.strokeStyle = 'rgba(201,169,97,0.16)'
    g.lineWidth = 1.5
    g.beginPath(); g.moveTo(IZQ, y); g.lineTo(DER, y); g.stroke()
    y += 56
  }

  // ── qué es esta casa ─────────────────────────────────────────────────────
  if (d.parrafos?.length) {
    y += 12
    g.font = '400 46px system-ui, sans-serif'
    g.letterSpacing = '0px'
    g.fillStyle = 'rgba(226,232,244,0.9)'
    for (const p of d.parrafos) {
      for (const l of renglones(g, p, DER - IZQ)) { g.fillText(l, IZQ, y); y += 62 }
      y += 24
    }
  }

  /* ── LA NOTA, ABAJO DEL TODO ───────────────────────────────────────────
     Es donde se dice lo que aquí NO se puede hacer. Va al pie y en gris a
     propósito: es una aclaración, no una disculpa, y quien ya lo sabe no
     tiene que volver a leerla cada vez. */
  if (d.nota) {
    g.font = 'italic 400 40px system-ui, sans-serif'
    g.fillStyle = 'rgba(180,196,220,0.62)'
    let ny = ALTO - 128
    const ls = renglones(g, d.nota, DER - IZQ)
    ny -= (ls.length - 1) * 52
    for (const l of ls) { g.fillText(l, IZQ, ny); ny += 52 }
  }

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  cachePanel.set(clave, tex)
  return tex
}

const B_ANCHO = 640
const B_ALTO = 176

function pintarBoton(texto: string, color: string): THREE.CanvasTexture {
  const clave = `${color}:${texto}`
  const hecho = cacheBoton.get(clave)
  if (hecho) return hecho
  const c = document.createElement('canvas')
  c.width = B_ANCHO
  c.height = B_ALTO
  const g = c.getContext('2d')
  if (!g) return new THREE.CanvasTexture(c)
  redondo(g, 8, 8, B_ANCHO - 16, B_ALTO - 16, 44)
  const fondo = g.createLinearGradient(0, 0, 0, B_ALTO)
  fondo.addColorStop(0, 'rgba(10,22,42,0.95)')
  fondo.addColorStop(1, 'rgba(5,11,24,0.97)')
  g.fillStyle = fondo
  g.fill()
  g.strokeStyle = color
  g.lineWidth = 3
  g.stroke()
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = '600 56px Cinzel, "Bodoni Moda", Georgia, serif'
  g.letterSpacing = '8px'
  g.fillStyle = '#F7EDD2'
  g.fillText(texto.toUpperCase(), B_ANCHO / 2, B_ALTO / 2)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  cacheBoton.set(clave, tex)
  return tex
}

/* Lo que el gatillo apretaría ahora mismo. Lo lee el Visor cuando llega un
   `select`, y lo lee una prueba para comprobar lo que una foto no distingue.
   Ver Visor.tsx y kernel/Portico.tsx, que resuelven lo mismo. */
const apuntado: { id: string | null } = { id: null }

/* Lo que tarda la mirada en apretar un botón. El mismo que el pórtico: con la
   cabeza no hay clic, y menos que esto se aprieta solo al leer. */
const DWELL = 1500
/* Y un respiro al aparecer: la casa entra volando y la vista cae donde cae. */
const GRACIA = 900

export function Casa() {
  const { camera } = useThree()
  const [datos, setDatos] = useState<DatosCasa | null>(null)
  /* LO QUE ESTÁ DIBUJADO, que no es lo mismo que lo que hay que dibujar. La
     casa se va con un fundido, y si los botones colgaran de `datos` se
     esfumarían de golpe en el primer cuadro del cierre mientras el panel
     todavía se está yendo: media casa desapareciendo antes que la otra media.
     Esto se queda con la última hasta que el fundido termina. */
  const [pintado, setPintado] = useState<DatosCasa | null>(null)
  useEffect(() => { if (datos) setPintado(datos) }, [datos])
  const grupo = useRef<THREE.Group>(null)
  const desde = useRef(0)
  const mirando = useRef<{ id: string; ms: number } | null>(null)
  const hecho = useRef(false)
  const datosRef = useRef<DatosCasa | null>(null)
  datosRef.current = datos

  const rayos = useMemo(() => new THREE.Raycaster(), [])
  const ojoPos = useMemo(() => new THREE.Vector3(), [])
  const ojoQuat = useMemo(() => new THREE.Quaternion(), [])
  const frente = useMemo(() => new THREE.Vector3(), [])
  const abajo = useMemo(() => new THREE.Vector3(), [])
  const meta = useMemo(() => new THREE.Vector3(), [])
  const dirMeta = useMemo(() => new THREE.Vector3(), [])
  const dirSuave = useMemo(() => new THREE.Vector3(), [])
  const arriba = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const qMeta = useMemo(() => new THREE.Quaternion(), [])
  const mLook = useMemo(() => new THREE.Matrix4(), [])
  const listo = useRef(false)

  const panelMat = useMemo(() => new THREE.MeshBasicMaterial({
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false, opacity: 0,
  }), [])
  useEffect(() => {
    if (!pintado) return
    panelMat.map = pintarPanel(pintado)
    panelMat.needsUpdate = true
  }, [pintado, panelMat])

  /* Los botones se arman a mano y no en JSX: son tantos como diga la casa, y
     cada uno necesita su lienzo, su malla para el rayo y su aro. Montarlos y
     desmontarlos con React por cada casa que se abre sería repintar todo por
     un cambio de rótulo. */
  const botones = useMemo(() => {
    const color = pintado?.color || '#EAD79C'
    return (pintado?.botones || []).map((b) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(0.82, 0.225),
        new THREE.MeshBasicMaterial({
          map: pintarBoton(b.texto, color), transparent: true,
          depthTest: false, depthWrite: false, toneMapped: false, opacity: 0,
        }),
      )
      m.renderOrder = 1502
      m.userData.botonId = b.id
      /* El aro que se llena: la única forma de que tocar con la mirada no dé
         miedo es que se vea venir. Ver Portico.tsx. */
      const aro = new THREE.Mesh(
        new THREE.RingGeometry(0.43, 0.455, 48),
        new THREE.MeshBasicMaterial({
          color, transparent: true, opacity: 0,
          depthTest: false, depthWrite: false, toneMapped: false,
        }),
      )
      aro.position.z = 0.002
      /* El aro es una elipse, no un círculo: rodea un botón que mide cuatro
         veces más de ancho que de alto, y un círculo alrededor de eso queda
         gigante y toca al botón de al lado. */
      aro.scale.set(1, 0.28, 1)
      m.add(aro)
      return { id: b.id, malla: m, aro }
    })
  }, [pintado])
  /* Por referencia: el puente de abajo se monta UNA vez y tiene que ver los
     botones de AHORA, no la lista vacía del primer dibujado. */
  const botonesRef = useRef(botones)
  botonesRef.current = botones
  useEffect(() => () => {
    for (const b of botones) {
      /* Sacarlos de la escena ANTES de tirar sus cosas: los cuelga el bucle de
         dibujo, así que si se descartan sin descolgar quedan de hijos del
         grupo con la geometría muerta, y el siguiente cuadro dibuja basura. */
      b.malla.removeFromParent()
      b.malla.geometry.dispose(); (b.malla.material as THREE.Material).dispose()
      b.aro.geometry.dispose(); (b.aro.material as THREE.Material).dispose()
    }
  }, [botones])

  // ── el puente con la casa ────────────────────────────────────────────────
  useEffect(() => {
    const w = window as any
    w.__AE_CASA = (d: DatosCasa | null) => {
      setDatos(d && d.botones?.length ? d : null)
      mirando.current = null
      hecho.current = false
      apuntado.id = null
      desde.current = performance.now()
    }
    /* EL GATILLO APRIETA EL BOTÓN QUE SEÑALA EL RAYO. Con un mando en la mano
       nadie sostiene la mirada un segundo y medio sobre un botón — eso es el
       aparato ignorándote. Ver Mandos.tsx.
       Y si no hay nada apuntado y la casa tiene UN SOLO botón, se aprieta ese:
       ese botón es siempre el de volver, y quedarse encerrado dentro de un
       panel con el visor puesto es la peor cosa que puede pasar aquí. */
    w.__AE_CASA_APRETAR = () => {
      const d = datosRef.current
      if (!d || hecho.current) return false
      if (performance.now() - desde.current < GRACIA) return false
      const id = apuntado.id || (d.botones.length === 1 ? d.botones[0].id : null)
      if (!id) return false
      disparar(id, d.key)
      return true
    }
    /* Para comprobar desde fuera lo que dentro de un visor no se ve: si el
       panel está delante de la cara, a qué distancia, y qué apretaría el
       gatillo. Ver kernel/mirada.ts. */
    w.__AE_CASA_ESTADO = () => {
      const d = datosRef.current
      const g = grupo.current
      if (!d || !g) return null
      poseMirada(camera, ojoPos, ojoQuat)
      const hacia = g.position.clone().sub(ojoPos)
      const dist = hacia.length()
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(ojoQuat)
      const cos = hacia.normalize().dot(f)
      const grados = Math.round((Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI)
      return {
        key: d.key,
        titulo: d.titulo,
        botones: d.botones.map((b) => b.id),
        /* DÓNDE ESTÁ CADA BOTÓN, en el mundo. Sin esto, comprobar «apunté a
           VOLVER y respondió VOLVER» obliga a barrer el aire a ciegas — y el
           panel cuelga del marco de la CABEZA, así que un barrido en el marco
           del mundo pasa por otro lado y no encuentra nada. Con la posición,
           apuntar es una resta. */
        sitios: botonesRef.current.map((b) => ({
          id: b.id,
          pos: b.malla.getWorldPosition(new THREE.Vector3()).toArray()
            .map((n) => Math.round(n * 1000) / 1000),
        })),
        apuntado: apuntado.id,
        dist: Math.round(dist * 10) / 10,
        grados,
        delante: dist > 1.2 && dist < 4.5 && grados < 34,
      }
    }
    return () => {
      delete w.__AE_CASA
      delete w.__AE_CASA_APRETAR
      delete w.__AE_CASA_ESTADO
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera])

  const disparar = (id: string, key: string) => {
    hecho.current = true
    mirando.current = null
    try { dispatchEvent(new CustomEvent('ae-casa', { detail: { accion: id, key } })) }
    catch { /* nada */ }
  }

  useFrame((_, dt) => {
    const g = grupo.current
    if (!g) return
    if (!datos) {
      panelMat.opacity = Math.max(0, panelMat.opacity - dt * 3.4)
      for (const b of botones) {
        (b.malla.material as THREE.MeshBasicMaterial).opacity = panelMat.opacity
        ;(b.aro.material as THREE.MeshBasicMaterial).opacity = 0
      }
      g.visible = panelMat.opacity > 0.01
      listo.current = false
      apuntado.id = null
      // el fundido terminó: recién ahora se sueltan los botones y el lienzo
      if (panelMat.opacity <= 0.001 && pintado) setPintado(null)
      return
    }
    g.visible = true
    panelMat.opacity = Math.min(1, panelMat.opacity + dt * 2.6)

    /* MISMO SITIO QUE EL TEATRO, y por las mismas razones: a distancia de
       lectura, un poco por debajo del horizonte —leer con la cabeza levantada
       cansa el cuello enseguida— y EN EL MARCO DE LA CABEZA, no del mundo. Con
       el timón picado, «un poco abajo» colgado del horizonte queda cuarenta
       grados por encima de la vista: eso era el «no salían las letras».
       Un poco más lejos que el teatro y más grande, porque aquí hay una tabla
       que leer y no una frase. Ver Teatro.tsx y kernel/mirada.ts. */
    poseMirada(camera, ojoPos, ojoQuat)
    frente.set(0, 0, -1).applyQuaternion(ojoQuat)
    abajo.set(0, -1, 0).applyQuaternion(ojoQuat)
    meta.copy(ojoPos).addScaledVector(frente, 2.35).addScaledVector(abajo, 0.30)

    /* El retraso es del GIRO, no del viaje: la casa se abre al final de un
       vuelo de veinte metros, y retrasando la posición el panel se quedaría
       atrás, cruzando la vista mientras la cámara aterriza. Ver Teatro.tsx. */
    dirMeta.copy(meta).sub(ojoPos)
    const largo = dirMeta.length() || 2.35
    dirMeta.divideScalar(largo)
    if (!listo.current) { dirSuave.copy(dirMeta); listo.current = true }
    else dirSuave.lerp(dirMeta, 1 - Math.exp(-2.8 * dt)).normalize()
    g.position.copy(ojoPos).addScaledVector(dirSuave, largo)
    /* DE CARA. El orden de estos dos argumentos decide si el panel se ve o
       enseña el dorso —que no se dibuja—, y de espaldas se ve idéntico a todo
       bien: el panel existe, está delante, a distancia de lectura, y no hay
       nada. Ver Teatro.tsx, que lo explica entero. */
    qMeta.setFromRotationMatrix(mLook.lookAt(ojoPos, g.position, arriba))
    g.quaternion.slerp(qMeta, 1 - Math.exp(-5.5 * dt))

    // los botones, en fila bajo el panel
    const n = botones.length
    const paso = 0.9
    botones.forEach((b, i) => {
      b.malla.position.set((i - (n - 1) / 2) * paso, -1.06, 0.01)
      ;(b.malla.material as THREE.MeshBasicMaterial).opacity = panelMat.opacity
      if (b.malla.parent !== g) g.add(b.malla)
    })

    // ── a qué botón se apunta ──────────────────────────────────────────────
    /* Las matrices se ponen al día AQUÍ, antes de tirar el rayo: los botones
       acaban de colocarse tres líneas más arriba, y three no recalcula hasta
       que dibuja. Sin esto se apunta a donde estaban el cuadro pasado —da
       igual con la cabeza quieta, y falla justo cuando la casa entra volando. */
    g.updateMatrixWorld(true)
    const enGracia = performance.now() - desde.current < GRACIA
    rayoPuntero(camera, rayos.ray)
    rayos.near = 0
    rayos.far = Infinity
    const choques = enGracia ? [] : rayos.intersectObjects(botones.map((b) => b.malla), false)
    const sobre = (choques[0]?.object.userData as { botonId?: string })?.botonId || null
    apuntado.id = sobre

    for (const b of botones) {
      const mm = b.aro.material as THREE.MeshBasicMaterial
      if (b.id !== sobre) {
        if (mirando.current?.id === b.id) mirando.current = null
        mm.opacity = Math.max(0, mm.opacity - dt * 3)
        continue
      }
      /* CON MANDO EN LA MANO EL ARO SÓLO SEÑALA. El gatillo es la acción, y
         además llenar el aro por apuntar abriría cosas mientras alguien está
         decidiendo. Sin mando, la mirada sostenida ES el clic. Ver Visor.tsx,
         que apaga la retícula por lo mismo. */
      if (PUNTERO.activo) { mm.opacity = 0.8; continue }
      const yaMiraba = mirando.current
      if (!yaMiraba || yaMiraba.id !== b.id) { mirando.current = { id: b.id, ms: 0 }; continue }
      yaMiraba.ms += dt * 1000
      const p = Math.min(1, yaMiraba.ms / DWELL)
      mm.opacity = 0.3 + p * 0.7
      if (p >= 1 && !hecho.current) disparar(b.id, datos.key)
    }
  })

  return (
    <group ref={grupo} visible={false} renderOrder={1500}>
      <mesh material={panelMat}>
        <planeGeometry args={[2.72, 1.87]} />
      </mesh>
    </group>
  )
}
