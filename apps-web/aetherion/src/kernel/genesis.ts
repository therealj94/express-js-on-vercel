import * as THREE from 'three'
import { rig } from './rig'
import { agujeros } from '../sky/Agujeros'
import { sim } from './sim'
import { wellRegistry } from '../sky/Wells'
import { useUiStore } from '../state/uiStore'
import { audio } from '../audio/engine'
import { espacio } from '../audio/espacio'

/* EL GÉNESIS · la película.
 *
 * ══ QUÉ ES ════════════════════════════════════════════════════════════════
 *
 * La historia del ecosistema contada SOBRE la galaxia de verdad — no un vídeo
 * aparte, no una animación pregrabada: la misma escena que se toca todos los
 * días, dirigida como se dirige una película.
 *
 * Empieza en la tiniebla, con todo disperso y el sol sin ser. Llega la
 * palabra. Nace la luz. Los mundos encuentran su órbita y se presentan uno a
 * uno. Y entonces la cámara se va hacia atrás hasta que cabe el universo
 * entero, y ahí se dice lo único que importa: que esto lo construimos, que no
 * es una aplicación más, y que quien está mirando no llegó por casualidad.
 *
 * ══ POR QUÉ LA CÁMARA SE MUEVE ASÍ ════════════════════════════════════════
 *
 * La versión anterior SALTABA: cada acto ponía la cámara en su sitio y el
 * amortiguador la llevaba. Eso se lee como diapositivas, no como cine. Aquí
 * cada acto tiene un MOVIMIENTO con su curva propia —un acercamiento lento,
 * un arco alrededor, un retroceso que abre— y el coreógrafo lo interpola
 * cuadro a cuadro. La cámara nunca está quieta del todo, que es exactamente
 * lo que separa una película de una presentación.
 *
 * Y las curvas no son la misma para todo: el retroceso que revela el universo
 * arranca despacio y ACELERA (easeIn), porque una revelación tiene que crecer;
 * el acercamiento a una casa frena al llegar (easeOut), porque aterrizar de
 * golpe marea.
 *
 * ══ QUIÉN PONE LAS PALABRAS ═══════════════════════════════════════════════
 *
 * Este módulo no sabe hablar ningún idioma: solo grita en qué acto está. La
 * casa pone los rótulos, la voz de AU-RA y la música. Así el mismo director
 * sirve para la pantalla, para el visor —donde no hay HTML que valga y la voz
 * lo cuenta todo— y para lo que venga.
 */

type Curva = 'suave' | 'entra' | 'sale' | 'recta' | 'llega'

interface Movimiento {
  /* Adónde va la cámara. Lo que no se dice, no se toca. */
  radio?: number
  phi?: number
  /* El giro se pide RELATIVO: «date un cuarto de vuelta desde donde estés».
     Absoluto obligaría a saber dónde quedó el acto anterior. */
  giro?: number
  mira?: number
  curva?: Curva
}

export interface Acto {
  clave: string
  dura: number
  mover?: Movimiento
  /* Un acto puede apuntar a una casa: la cámara se pone del mismo lado que
     ella para que quede entre el ojo y el sol, a contraluz. */
  casa?: string
}

interface Opciones {
  alActo?: (clave: string) => void
  alFin?: (salteado: boolean) => void
  casas?: string[]
  /* Quién pone los nombres: la casa con su capa HTML, o la propia escena
     (que es lo único que hay dentro de un visor). */
  rotulos?: 'html' | 'escena'
}

const CURVAS: Record<Curva, (p: number) => number> = {
  suave: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  entra: (p) => p * p * p,                    // arranca quieto y acelera
  sale: (p) => 1 - Math.pow(1 - p, 3),        // llega frenando
  recta: (p) => p,
  /* LLEGAR Y SOSTENER. Un plano de presentación tiene que estar COMPUESTO
     cuando aparece el rótulo: si la cámara sigue viajando mientras se lee el
     nombre de la casa, lo que se ve es una cámara buscando, no un plano. Así
     que llega en el primer 55% y el resto lo pasa empujando apenas —ese
     acercamiento lento que tiene cualquier plano sostenido de cine. */
  llega: (p) => (p < 0.55
    ? (1 - Math.pow(1 - p / 0.55, 3)) * 0.94
    : 0.94 + ((p - 0.55) / 0.45) * 0.06),
}

const ARRIBA = new THREE.Vector3(0, 1, 0)
const tmpSol = new THREE.Vector3()
const tmpLado = new THREE.Vector3()
const tmpDir = new THREE.Vector3()
const tmpCam = new THREE.Vector3()
const tmpPrueba = new THREE.Vector3()
const tmpMira = new THREE.Vector3()
const tmpAlSolCam = new THREE.Vector3()

let vivoAhora = false
let raf = 0
let acomodoRaf = 0
let nocheRaf = 0

function acomodar(hasta: number, dura: number) {
  cancelAnimationFrame(acomodoRaf)
  const desde = sim.acomodo
  const t0 = performance.now()
  const paso = () => {
    const p = Math.min(1, (performance.now() - t0) / dura)
    sim.acomodo = desde + (hasta - desde) * CURVAS.suave(p)
    if (p < 1) acomodoRaf = requestAnimationFrame(paso)
  }
  if (dura <= 0) { sim.acomodo = hasta; return }
  acomodoRaf = requestAnimationFrame(paso)
}

let vacioRaf = 0
/* EL VACÍO: 1 = ni siquiera hay cielo. Es distinto de la noche —la noche es
   un sistema sin sol; el vacío es la nada de antes de la primera palabra. */
function llevarVacio(hasta: number, dura: number) {
  cancelAnimationFrame(vacioRaf)
  const desde = sim.vacio
  const t0 = performance.now()
  const paso = () => {
    const p = Math.min(1, (performance.now() - t0) / dura)
    sim.vacio = desde + (hasta - desde) * CURVAS.suave(p)
    if (p < 1) vacioRaf = requestAnimationFrame(paso)
  }
  if (dura <= 0) { sim.vacio = hasta; return }
  vacioRaf = requestAnimationFrame(paso)
}

function anochecer(hasta: number, dura: number) {
  cancelAnimationFrame(nocheRaf)
  const desde = sim.noche
  const t0 = performance.now()
  const paso = () => {
    const p = Math.min(1, (performance.now() - t0) / dura)
    sim.noche = desde + (hasta - desde) * CURVAS.suave(p)
    if (p < 1) nocheRaf = requestAnimationFrame(paso)
  }
  if (dura <= 0) { sim.noche = hasta; return }
  nocheRaf = requestAnimationFrame(paso)
}

/* El ángulo del lado de una casa, por el camino corto desde donde está la
   cámara: sin esto, ir de una casa a la siguiente podía dar la vuelta larga
   entera y el espectador se marea sin entender por qué. */
function anguloDe(key: string, desde: number): number | null {
  const h = wellRegistry.get(key)
  if (!h) return null
  const p = h.getPos()
  let a = Math.atan2(p.x, p.z)
  while (a - desde > Math.PI) a -= Math.PI * 2
  while (a - desde < -Math.PI) a += Math.PI * 2
  return a
}

let saltarAhora: (() => void) | null = null

function terminar(salteado: boolean, opciones: Opciones) {
  vivoAhora = false
  sim.pelicula = 0
  sim.plano = 0
  sim.protagonista = null
  sim.lluvia = 1
  cancelAnimationFrame(raf)
  cancelAnimationFrame(acomodoRaf)
  cancelAnimationFrame(nocheRaf)
  cancelAnimationFrame(vacioRaf)
  sim.vacio = 0
  anochecer(0, salteado ? 500 : 0)
  acomodar(0, salteado ? 900 : 0)
  rig.deriva = true
  rig.mira = 0
  rig.objetivo = null
  useUiStore.getState().select(null)
  rig.recentrar()
  opciones.alFin?.(salteado)
}

function empezar(opciones: Opciones = {}) {
  if (vivoAhora) return
  vivoAhora = true
  sim.pelicula = opciones.rotulos === 'escena' ? 2 : 1
  audio.ensure()

  /* ══ QUIÉNES SE PRESENTAN, Y EN QUÉ ORDEN ═════════════════════════════════
   *
   * Los mundos que se USAN. El orden no es alfabético ni por antigüedad: es el
   * camino que hace una persona de verdad por el ecosistema. Se entra con una
   * identidad, se guarda valor, se cobra, se cambia, se saca a moneda local, se
   * habla, se comprueba, y al final está la memoria de cómo empezó todo.
   *
   * MINAS y DBNX NO están acá a propósito, y no por olvido: no son sitios
   * adonde se entra. MINAS es el metal que respalda —va con lo que respalda— y
   * DBNX es dónde se administran las reglas de lo que se emite sobre la cadena
   * —va con la cadena—. Presentarlos como dos apps más los volvería iconos en
   * una fila; puestos donde significan algo, cada uno contesta una pregunta que
   * el relato acaba de abrir. */
  const casas = (opciones.casas ?? ['gid', 'wallet', 'pay', 'oxch', 'aucorp',
    'chat', 'scan', 'genesis'])
    .filter((k) => wellRegistry.has(k))

  /* ── EL GUION ───────────────────────────────────────────────────────────
     Los tiempos son los de una lectura en voz alta sin apuro. Cada acto sabe
     qué hace la cámara mientras se dice lo suyo. */
  /* ── EL GUION ───────────────────────────────────────────────────────────
   *
   * ══ CÓMO ESTÁ ARMADO, Y POR QUÉ ═══════════════════════════════════════
   *
   * Primero se CUENTA una historia, y recién al final se explica de qué era.
   *
   * Antes ORIGEN se presentaba en medio —justo después del orden y antes de
   * los mundos— y ahí estorbaba: cortaba el relato en dos para meter una
   * explicación de producto, y llegaba cuando todavía no había nada que
   * sostener. Explicar el cimiento antes de enseñar la casa no explica nada.
   *
   * Ahora el arco es el que tiene que ser:
   *
   *   I    LA NADA          negro absoluto, y una palabra: el título.
   *   II   LA LUZ           la primera cosa que existe.
   *   III  EL ORDEN         y cada mundo encuentra su órbita.
   *   IV   LOS MUNDOS       uno por uno, cada uno dueño del cuadro.
   *   V    EL UNIVERSO      lo que hay alrededor: el plano grande.
   *   VI   LO QUE SOSTIENE  ORIGEN y la cadena. AQUÍ, y no antes: se acaba
   *                         de ver todo el sistema girando, así que ahora la
   *                         pregunta «¿y qué lo mantiene unido?» ya se la
   *                         está haciendo quien mira. Se contesta cuando se
   *                         preguntó, no cuando a nosotros nos convenía.
   *   VII  PARA QUÉ         a quién se le lleva, y qué se une.
   *   VIII VOS              y por qué esto te incluye.
   *
   * Y el título es ORIGEN a propósito. Al empezar se lee como el nombre de la
   * historia; al final resulta que era el nombre de la cosa que la sostenía
   * todo el tiempo. Es gratis y es lo que hace que el final cierre.
   *
   * Los tiempos son los de una lectura en voz alta sin apuro. Cada acto sabe
   * qué hace la cámara mientras se dice lo suyo. */
  /* ── EL GUION ───────────────────────────────────────────────────────────
   *
   * ══ DOS ORÍGENES, CONTADOS A LA VEZ ═══════════════════════════════════
   *
   * La película cuenta dos historias en paralelo: cómo empezó el mundo y cómo
   * empezó esto. No las compara — las hace RIMAR. La Escritura pone los golpes
   * de la creación y nosotros contestamos con el nuestro, y la rima central,
   * la que sostiene la película entera, es esta:
   *
   *     «Y separó Dios la luz de las tinieblas.»
   *     Nosotros también tuvimos que separar algo: el valor, de la promesa.
   *
   * De ahí sale todo lo demás. Por eso ORIGEN va en el acto IV y no antes: es
   * la respuesta a un versículo, y una respuesta necesita su pregunta primero.
   *
   * ══ LAS DOS VOCES ═════════════════════════════════════════════════════
   *
   * En los actos de creación NO HAY UNA SOLA PALABRA NUESTRA: solo Génesis 1.
   * Meter una frase propia ahí rompe el préstamo — deja de ser una cita y pasa
   * a ser decoración. Las dos voces se distinguen por la letra (ver la clase
   * `escritura` en index.html y el peso del mismo nombre en el Teatro), no por
   * un rótulo que diga cuál es cuál.
   *
   * ══ EL RELOJ ══════════════════════════════════════════════════════════
   *
   * Dura lo que dura la canción: 175 s. Cada plano tiene el tiempo de LEERLO
   * sin apuro —un momento para registrar que cambió, las palabras a dos y
   * media por segundo, y un momento para salir— y cuando la cuenta no cerraba
   * se recortó CONTENIDO, nunca la lectura. La prueba `cine-reloj` comprueba
   * las dos cosas: que el total entre en la canción y que ningún plano pase
   * más deprisa de lo que se puede leer.
   */
  const guion: Acto[] = [
    /* ══ I · LA CREACIÓN ═══════════════════════════════════════════════════
       Solo Escritura. Ni una palabra nuestra. */

    /* El título entra sobre negro y sobre nada: el acto arranca a oscuras y la
       palabra aparece a los dos segundos. Ese silencio previo es lo que la
       convierte en un título y no en la primera frase. */
    { clave: 'titulo', dura: 5000 },
    /* LA TINIEBLA. Negro absoluto de verdad —ni el sol, ni la retícula, ni una
       brasa— con el versículo encima. No hay nada que mirar, y eso es
       exactamente lo que dice el texto. */
    /* Y la cámara SE ACERCA muy despacio a un centro que no existe. El
       movimiento tiene que notarse solo si uno lo busca — pero tiene que
       existir, porque es lo que le da al retroceso de la luz de dónde salir. */
    { clave: 'tinieblas', dura: 9200, mover: { radio: 29, phi: 1.02, giro: 0.14, mira: 0, curva: 'suave' } },
    /* Y FUE LA LUZ. Un punto en el centro, y de él una onda que se expande
       hasta pasar por encima de quien mira. Detrás de la onda aparecen los
       mundos — todos, desordenados, como quedaron. La cámara retrocede: es el
       único movimiento brusco de la película. */
    /* Tres segundos y medio de orden leída sobre el negro, el fogonazo, y el
       remate. Es el acto más largo de la película y el único que necesita que
       no pase nada durante un buen rato: la espera es el acto. */
    { clave: 'seaLuz', dura: 10200, mover: { radio: 54, phi: 0.98, curva: 'sale' } },
    /* HAYA LUMBRERAS. Y cada mundo viaja a su órbita mientras la cámara los
       rodea despacio. El desorden se resuelve a la vista. */
    { clave: 'lumbreras', dura: 7200, mover: { radio: 30, phi: 0.9, giro: 0.85, curva: 'suave' } },

    /* ══ II · LOS MUNDOS ═══════════════════════════════════════════════════
       El camino que hace una persona: entra con una identidad, guarda valor,
       cobra, cambia, saca a moneda local, habla, comprueba, y al final la
       memoria de cómo empezó. Cada uno dueño del cuadro; los demás, apagados. */
    ...casas.map((k) => ({ clave: `casa:${k}`, dura: 6200, casa: k,
      mover: { curva: 'llega' as Curva } })),

    /* ══ III · EL CIELO ════════════════════════════════════════════════════
       Sin una palabra. La cámara se va lejos y SE DA VUELTA a mirar lo que
       había detrás todo este tiempo: un agujero negro con su disco girando,
       los soles de fuera, y el cielo lloviendo estrellas. Es el respiro de la
       película y el único plano que no explica nada. */
    { clave: 'universo', dura: 5400, mover: { radio: 104, phi: 0.82, giro: 1.5, mira: 0, curva: 'entra' } },

    /* ══ IV · LO QUE LO SOSTIENE ═══════════════════════════════════════════
       Aquí las dos historias se tocan. */
    { clave: 'separo', dura: 6100, mover: { radio: 40, phi: 0.9, giro: 0.5, curva: 'suave' } },
    /* La respuesta. La cámara baja al centro: al sol, que es la moneda. */
    { clave: 'origen', dura: 8400, mover: { radio: 14, phi: 1.12, giro: 1.1, curva: 'entra' } },
    { clave: 'respaldo', dura: 7600, mover: { radio: 17, phi: 0.94, giro: 0.6, curva: 'suave' } },
    /* Se acaba de decir «metal que se pesa»: la pregunta de dónde sale ese
       metal ya está hecha, y MINAS es la respuesta que se puede señalar. */
    { clave: 'casa:minas', dura: 9400, casa: 'minas', mover: { curva: 'llega' as Curva } },
    /* La cadena. La cámara RODEA el sistema por debajo del plano, pasando por
       delante de los mundos: algo que atraviesa todo y lo enhebra. */
    { clave: 'cadena', dura: 8000, mover: { radio: 24, phi: 1.30, giro: 1.25, curva: 'suave' } },
    /* Y quién pone las reglas de lo que se emite encima de ella. */
    { clave: 'casa:dbnx', dura: 8300, casa: 'dbnx', mover: { curva: 'llega' as Curva } },

    /* ══ V · EL PROPÓSITO ══════════════════════════════════════════════════ */
    { clave: 'bueno', dura: 8400, mover: { radio: 34, phi: 0.86, giro: 0.6, curva: 'sale' } },
    { clave: 'obra', dura: 7200, mover: { radio: 30, giro: 0.5, curva: 'recta' } },
    /* La frase habla de llevar algo de un sitio a otro, y la cámara CRUZA el
       sistema de lado a lado mientras se dice: el movimiento más lateral de
       toda la película. */
    { clave: 'puente', dura: 7600, mover: { radio: 52, phi: 0.98, giro: -1.35, curva: 'suave' } },
    /* «Fructificad y multiplicaos; llenad la tierra». El plano se abre hasta
       que caben todos los mundos: el versículo y la imagen dicen lo mismo. */
    { clave: 'fructificad', dura: 5300, mover: { radio: 74, phi: 0.88, giro: 0.9, curva: 'sale' } },
    /* Y vuelve a casa. */
    { clave: 'proposito', dura: 6500, mover: { radio: 26, phi: 0.95, giro: 0.5, curva: 'suave' } },
    { clave: 'cierre', dura: 5400, mover: { radio: rig.reposo || 20, phi: rig.reposoPhi, giro: 0.2, curva: 'sale' } },
  ]

  let i = -1
  let t0 = 0
  /* Cuánto se aparta la cámara del eje casa-sol en un plano de casa. Vive
     fuera del acto porque el coreógrafo lo suma al giro cuadro a cuadro. */
  let anguloCasa: number | null = null
  let mov: (Movimiento & { r0: number; f0: number; g0: number; m0: number }) | null = null

  /* ══ ALGO QUE OCURRE DENTRO DE UN ACTO ════════════════════════════════════
   * Casi todo lo que hace un acto ocurre al empezarlo. El fogonazo no: primero
   * se LEE «y dijo Dios: sea la luz» y recién entonces estalla, porque ese es
   * el orden del versículo y el orden en que la frase tiene sentido. Encender
   * la luz mientras se lee la orden es contar el final antes del principio.
   *
   * Se comprueba dos cosas antes de disparar: que la película siga viva y que
   * siga en el MISMO acto. Sin eso, saltar la historia justo en ese hueco haría
   * estallar la luz encima de la galaxia ya devuelta a la normalidad. */
  const luego = (ms: number, cual: string, fn: () => void) => {
    const eraI = i
    window.setTimeout(() => { if (vivoAhora && i === eraI && guion[i]?.clave === cual) fn() }, ms)
  }

  const entrarActo = (a: Acto) => {
    opciones.alActo?.(a.clave)
    const st = useUiStore.getState()

    if (a.clave === 'titulo') {
      /* NEGRO ABSOLUTO, Y NADA MÁS. Ni sol, ni brasa, ni retícula: el vacío
         apaga hasta el cuerpo de AU-RA (ver Core.tsx). Y los mundos quedan
         desparramados, como estaban antes de que nadie los ordenara — el
         acomodo en uno es «cada cual donde cayó». */
      anochecer(1, 400)
      llevarVacio(1, 400)
      acomodar(1, 0)
      sim.lluvia = 1
      st.select(null)
      rig.deriva = false
      rig.tRadius = Math.min(rig.lejos, 62)
      rig.tPhi = 1.06
      rig.mira = 0
    } else if (a.clave === 'tinieblas') {
      /* Sigue sin haber NADA. El versículo dice que la tierra estaba
         desordenada y vacía y que las tinieblas cubrían el abismo: enseñar un
         cielo estrellado mientras se lee eso sería contradecirlo en la misma
         pantalla. El acercamiento lo hace el `mover` del guion: de sesenta y
         dos a veintinueve, tan despacio que solo se nota si uno lo busca. Ese
         viaje es el que le da sentido al retroceso de la luz — sin acercarse
         primero, el «echarse atrás» del fogonazo no tiene de dónde salir. */
    } else if (a.clave === 'seaLuz') {
      /* ══ PRIMERO SE DICE, Y ENTONCES ESTALLA ═════════════════════════════
       *
       * El acto empieza EN LA MISMA NADA que el anterior: negro, sin sol, sin
       * cielo, sin mundos. Sobre ese negro se lee la orden —«y dijo Dios: sea
       * la luz»— y durante tres segundos y medio no pasa absolutamente nada.
       * Esa espera es el acto entero: es la diferencia entre leer una orden y
       * ver cómo se cumple.
       *
       * Y entonces: un punto en el centro, y de él una onda que se expande
       * hasta pasar por encima de quien mira. Detrás de la onda aparece TODO
       * —el cielo, los soles de fuera, los mundos, desordenados como
       * quedaron—. El orden es el versículo siguiente, no este.
       *
       * El vacío se levanta un instante DESPUÉS del fogonazo, no con él: así
       * las cosas aparecen DETRÁS de la luz. Primero llega la luz, y con ella
       * se ve lo que ya estaba. */
      luego(3400, 'seaLuz', () => {
        sim.destello = 1
        audio.land()
        window.setTimeout(() => { llevarVacio(0, 1500) }, 300)
        anochecer(0, 1600)
        sim.auraBrillo = 1.8
      })
    } else if (a.clave === 'lumbreras') {
      /* HAYA LUMBRERAS. Cada mundo viaja a su órbita: el desorden se resuelve
         a la vista, que es lo que el versículo está diciendo. */
      acomodar(0, 6000)
      sim.auraBrillo = 1.2
    } else if (a.clave === 'universo') {
      /* EL CIELO, sin una palabra. La cámara se da vuelta a mirar el agujero
         negro más lejano y se abre el caudal de estrellas fugaces. Ver
         Agujeros.tsx: orbitan a setenta y a cien unidades, y sin esto no se
         ven NUNCA — durante toda la película quedan detrás de uno. */
      anguloCasa = null
      sim.plano = 0
      sim.protagonista = null
      st.select(null)
      sim.lluvia = 8
      let lejos: THREE.Vector3 | null = null
      for (const q of agujeros) {
        if (!q) continue
        if (!lejos || q.lengthSq() > lejos.lengthSq()) lejos = q
      }
      /* Se COPIA: el agujero sigue orbitando y una mira pegada a él haría que
         la cámara lo persiguiera girando sola. Se quiere un plano fijo sobre
         algo que se mueve dentro del cuadro. */
      rig.objetivo = lejos ? lejos.clone() : null
      audio.whoosh(false)
    } else if (a.clave === 'separo') {
      /* Vuelve del panorama. Se cierra la lluvia y se suelta la mira: lo que
         viene es la respuesta al versículo, y se dice mirando al centro. */
      rig.objetivo = null
      anguloCasa = null
      sim.lluvia = 1
      sim.plano = 0
      sim.protagonista = null
      st.select(null)
    } else if (a.clave === 'origen') {
      /* La cámara baja al centro: al sol, que es la moneda. Es la única vez en
         toda la película que el centro es el sujeto del plano, así que se le
         deja quemar — aquí el resplandor no estorba, es el tema. */
      rig.objetivo = null
      anguloCasa = null
      st.select(null)
      sim.plano = 0
      sim.protagonista = null
      sim.auraBrillo = 2.1
      audio.land()
    } else if (a.clave === 'respaldo' || a.clave === 'cadena') {
      /* El resplandor baja: la idea ya no es el fogonazo sino el peso, y el
         peso no brilla. */
      rig.objetivo = null
      anguloCasa = null
      sim.plano = 0
      sim.protagonista = null
      st.select(null)
      sim.auraBrillo = 0.55
    } else if (a.clave === 'cierre') {
      rig.objetivo = null
      anguloCasa = null
      sim.plano = 0
      sim.protagonista = null
      st.select(null)
      sim.auraBrillo = 2.4
      audio.commit()
    } else if (a.clave.startsWith('casa:')) {
      const key = a.clave.slice(5)
      st.select(key)
      /* Y SE APAGA TODO LO DEMÁS. Ver sim.protagonista: durante este plano la
         casa que se presenta es lo único encendido. */
      sim.protagonista = key
      const h = wellRegistry.get(key)
      /* EL SOL NO PUEDE QUEMAR EL PLANO. Aunque quede en el borde del cuadro,
         su fogonazo y sus rayos se comen medio encuadre: durante un plano de
         casa se le bajan, y vuelven solos al terminar. La luz que MODELA a la
         casa no se toca — lo que se apaga es el resplandor, que es adorno. */
      sim.plano = 1
      if (h) {
        espacio.toque(h.getPos(), 520)
        /* EL PLANO DE UNA CASA, COMPUESTO DE VERDAD.
         *
         * Antes la cámara se ponía detrás de la casa y miraba al CENTRO — que
         * es donde está el sol. Resultado: el sol clavado en medio del cuadro,
         * quemado, y la casa desplazada a un borde. En un teléfono, donde el
         * cuadro es angosto, quedaba directamente fuera.
         *
         * Ahora la cámara MIRA A LA CASA (rig.objetivo) y se para a un lado
         * del eje casa-sol: así el sol raspa desde el costado, la casa se ve
         * con su media luna iluminada y su terminador, y el resplandor entra
         * por el borde del cuadro en vez de comérselo. Es el plano que uno
         * haría a mano. */
        rig.objetivo = h.getPos()
        /* EL SITIO DE LA CÁMARA SE ELIGE EN EL MUNDO, NO EN LA ÓRBITA.
         *
         * El timón es esférico alrededor del CENTRO: pedirle «ponete detrás
         * de esta casa» lo deja a diez unidades, mirando de arriba, y con el
         * sol dentro del cuadro — que es exactamente lo que quemaba el plano.
         *
         * Así que el plano se compone donde se compone un plano: en el
         * espacio. Se elige el punto exacto desde donde se quiere ver la
         * casa —cerca, ladeado unos setenta grados del eje casa-sol, un poco
         * por encima— y RECIÉN DESPUÉS se traduce ese punto a las tres
         * coordenadas que el timón entiende. Setenta grados es el ángulo del
         * retratista: la casa sale con su media luna y su terminador, y el
         * sol queda fuera del cuadro tirando luz desde el costado. */
        const q = h.getPos()
        const alSol = tmpSol.copy(q).negate().normalize()
        tmpLado.crossVectors(alSol, ARRIBA).normalize()
        /* Si la casa cae justo sobre el eje vertical el producto cruzado se
           desmorona: cualquier perpendicular sirve. */
        if (tmpLado.lengthSq() < 0.01) tmpLado.set(1, 0, 0)
        /* LA DISTANCIA SALE DEL TAMAÑO QUE SE QUIERE EN PANTALLA, no de un
           número a ojo: la casa ocupa la misma parte del cuadro en un
           monitor y en un teléfono. En vertical se pide menos, porque el
           rótulo se queda con el tercio de abajo. */
        const alto = typeof window !== 'undefined' ? innerHeight : 900
        const anchoV = typeof window !== 'undefined' ? innerWidth : 1400
        const angosto = anchoV / alto < 0.8
        const fovV = (angosto ? 74 : 62) * Math.PI / 180
        /* MENOS ZOOM EN EL TELÉFONO. Con 0.34 la casa llenaba el cuadro y se
           perdía el sistema alrededor: lo que hace grande a un plano de
           presentación no es que el planeta sea enorme, es que se vea DÓNDE
           está. */
        /* MÁS GRANDE QUE ANTES. Se había bajado a 0,24 para que no se perdiera
           el sistema alrededor — pero ahora el sistema alrededor está APAGADO
           (sim.protagonista), así que ya no hay nada que perder y sí una casa
           que tiene que mandar en el cuadro. Presentar es enseñar de cerca. */
        const parte = angosto ? 0.34 : 0.46
        const dist = Math.max(4.2, h.radius / Math.tan(parte * fovV / 2))

        /* DE QUÉ LADO PONERSE. Hay dos sitios buenos alrededor de una casa:
           del lado del sol (queda iluminada de frente) o del contrario
           (queda a contraluz, con su corona). Cuál de los dos aparta más el
           sol del cuadro depende de dónde caiga esa casa —las hay cerca del
           centro y lejos—, así que no se elige de antemano: se prueban los
           dos y gana el que deje el sol más lejos del eje de la cámara.
           Media línea de cuenta que evita un plano quemado. */
        /* Y MÁS DE FRENTE. A 0,61 radianes —treinta y cinco grados— la casa
           salía en media luna, con la mitad en sombra: bonito de fotografiar y
           malo para presentar, porque justo la mitad que se apaga es donde
           vive la marca. A 0,38 el sol entra casi de frente, apenas ladeado: la
           casa se ve ENTERA e iluminada, con un borde de sombra que le da bulto
           y nada más. Se presenta de frente, que es como se presenta algo. */
        const ang = 0.38
        let mejor = -2
        for (const signo of [1, -1]) {
          tmpDir.copy(alSol).multiplyScalar(signo * Math.cos(ang))
            .addScaledVector(tmpLado, Math.sin(ang))
            .addScaledVector(ARRIBA, 0.16)
            .normalize()
          tmpPrueba.copy(q).addScaledVector(tmpDir, dist)
          // el coseno del ángulo entre «adónde mira» y «dónde está el sol»
          tmpMira.copy(q).sub(tmpPrueba).normalize()
          tmpAlSolCam.copy(tmpPrueba).negate().normalize()
          const cos = tmpMira.dot(tmpAlSolCam)
          if (-cos > mejor) { mejor = -cos; tmpCam.copy(tmpPrueba) }
        }

        const r = Math.max(rig.cerca + 1.5, tmpCam.length())
        a.mover = {
          ...a.mover,
          radio: r,
          phi: Math.acos(Math.max(-1, Math.min(1, tmpCam.y / Math.max(0.001, tmpCam.length())))),
        }
        // el giro se pide relativo, así que se guarda el destino absoluto
        anguloCasa = Math.atan2(tmpCam.x, tmpCam.z)
      }
    } else if (a.clave === 'universo') {
      /* ══ EL PLANO GRANDE: AQUÍ EL TEMA ES EL CIELO ═════════════════════════
       *
       * Este acto se iba muy lejos y miraba al centro — o sea, enseñaba el
       * sistema pequeñito en medio de un vacío negro. Y resulta que el vacío
       * NO está vacío: ahí fuera hay dos agujeros negros orbitando, con su
       * disco girando y la luz doblándose alrededor, que es lo más
       * impresionante que tiene esta escena. Nunca se veían, porque durante
       * toda la película la cámara está a quince o veinte unidades y ellos a
       * setenta y a cien: quedaban siempre detrás de uno.
       *
       * Así que ahora la cámara SE DA VUELTA a mirarlos. Se elige el que esté
       * más lejos del sol —para que no salgan los dos juntos ni el sol de
       * fondo— y se apunta ahí. Y se abre el caudal de estrellas fugaces: en
       * un plano cuyo tema es el cielo, una fugaz cada diez segundos no cuenta
       * nada; seis o siete cruzando el cuadro, sí. */
      anguloCasa = null
      sim.plano = 0
      sim.protagonista = null
      st.select(null)
      sim.lluvia = 7
      let lejos: THREE.Vector3 | null = null
      for (const p of agujeros) {
        if (!p) continue
        if (!lejos || p.lengthSq() > lejos.lengthSq()) lejos = p
      }
      /* Se COPIA, no se referencia: el agujero sigue orbitando y una mira
         pegada a él haría que la cámara lo persiguiera girando sola. Lo que se
         quiere es un plano fijo sobre algo que se mueve dentro del cuadro. */
      rig.objetivo = lejos ? lejos.clone() : null
      audio.whoosh(false)
    } else {
      rig.objetivo = null
      anguloCasa = null
      sim.plano = 0
      sim.protagonista = null
      /* La lluvia era del plano del cielo. Dejarla abierta la volvería un tic:
         lo que impresiona una vez, repetido, es ruido. */
      sim.lluvia = 1
    }

    /* El movimiento se congela AQUÍ: de dónde sale la cámara es lo que hay
       ahora mismo, y de ahí en adelante el coreógrafo interpola. */
    let g: number | null = null
    if (a.casa && anguloCasa !== null) {
      /* Por el camino corto: sin esto, ir de una casa a la siguiente podía
         dar la vuelta larga entera y marear sin motivo. */
      g = anguloCasa
      while (g - rig.tTheta > Math.PI) g -= Math.PI * 2
      while (g - rig.tTheta < -Math.PI) g += Math.PI * 2
    }
    mov = {
      ...a.mover,
      r0: rig.tRadius, f0: rig.tPhi, g0: rig.tTheta, m0: rig.mira,
      giro: g !== null ? g - rig.tTheta : (a.mover?.giro ?? 0),
    }
    rig.deriva = false
  }

  const paso = () => {
    if (!vivoAhora) return
    const ahora = performance.now()
    if (i < 0 || ahora - t0 >= guion[i].dura) {
      i++
      t0 = ahora
      if (i >= guion.length) { opciones.alActo?.('fin'); terminar(false, opciones); return }
      entrarActo(guion[i])
    }

    /* EL COREÓGRAFO. Cuadro a cuadro empuja los destinos del timón por la
       curva del acto; el amortiguador del propio timón hace el resto y el
       resultado es un movimiento continuo, sin tirones ni saltos. */
    if (mov) {
      /* La casa BOTA en su sitio. Si el objetivo se congelara al empezar el
         acto, la casa se iría saliendo del encuadre despacio durante los
         cinco segundos que dura su presentación. */
      const act = guion[i]
      if (act.casa) {
        const h = wellRegistry.get(act.casa)
        if (h) rig.objetivo = h.getPos()
      }
      const p = Math.min(1, (ahora - t0) / act.dura)
      const e = CURVAS[mov.curva || 'suave'](p)
      if (mov.radio !== undefined) rig.tRadius = mov.r0 + (mov.radio - mov.r0) * e
      if (mov.phi !== undefined) rig.tPhi = mov.f0 + (mov.phi - mov.f0) * e
      if (mov.giro) rig.tTheta = mov.g0 + mov.giro * e
      if (mov.mira !== undefined) rig.mira = mov.m0 + (mov.mira - mov.m0) * e
    }
    raf = requestAnimationFrame(paso)
  }

  saltarAhora = () => terminar(true, opciones)
  raf = requestAnimationFrame(paso)
}

export const genesis = {
  empezar,
  saltar: () => { if (vivoAhora) saltarAhora?.() },
  vivo: () => vivoAhora,
}

if (typeof window !== 'undefined') {
  ;(window as any).__AE_GENESIS = genesis
  // para que una prueba pueda ver la tiniebla, que es lo que no se puede leer
  // desde fuera en una foto: si está oscuro o no
  ;(window as any).__AE_NOCHE = () => sim.noche
  ;(window as any).__AE_PELICULA = () => sim.pelicula
  ;(window as any).__AE_VACIO = () => sim.vacio
  // para diagnóstico: adónde apunta la cámara ahora mismo
  ;(window as any).__AE_OBJETIVO = () => rig.objetivo ? rig.objetivo.toArray().map((n) => Math.round(n * 10) / 10) : null
  /* Y qué tan encendido está cada rótulo: en una foto no se puede distinguir
     un nombre apagado de uno que quedó fuera de cuadro, y la regla de la
     película es justamente que se callen. */
  ;(window as any).__AE_ROTULOS = () =>
    [...wellRegistry.keys()].map((k) => {
      const o = (window as any).__AE_ROTULO_OP?.[k]
      return typeof o === 'number' ? o : 0
    })
}
